import { test } from 'node:test';
import assert from 'node:assert/strict';
import { virtualClock } from '../show/clock.js';
import { createFakeShow } from '../show/fakeShow.js';
import { runShow, DEFAULT_TIMINGS, QUESTION } from '../show/script.js';
import { emptyRecords, pickEntrants, applyShow, normaliseRecords } from '../show/records.js';
import { simulate, ROSTER } from '../sim/index.js';
import { Rng } from '../sim/rng.js';

async function playShow(seed, timings) {
  const clock = virtualClock();
  const t0 = clock.now();
  const feed = [];
  const fake = createFakeShow({ clock, onFeed: (m) => feed.push(m), seed });
  const rng = new Rng(seed);
  const records = emptyRecords();
  const entrants = pickEntrants(records, () => rng.next());
  let result = null, error = null;
  runShow(fake.show, { entrants, records, simHash: 'ab'.repeat(32), matchId: `t-${seed}`, timings }).then((r) => { result = r; }, (e) => { error = e; });
  for (let i = 0; i < 8000 && !result && !error; i++) await clock.advance(100);
  if (error) throw error;
  return { feed, result, entrants, seconds: (clock.now() - t0) / 1000, fake, t0 };
}

test('a whole show airs in 4 to 5 minutes with a window at least every 90 s', async () => {
  const { feed, result, entrants, seconds, t0 } = await playShow(11);
  assert.ok(result, 'show finished');
  assert.ok(seconds >= 240 && seconds <= 300, `show ran ${seconds} s`);
  const opens = feed.filter((m) => m.type === 'window_open');
  const locks = feed.filter((m) => m.type === 'window_locked');
  assert.deepEqual(opens.map((o) => o.outcomes.length), [16, 8, 4]);
  assert.ok(opens.every((o) => o.question === QUESTION && o.seeded));
  // closed gaps between windows, and from the last lock round to the next show's first window
  for (let i = 1; i < 3; i++) assert.ok(opens[i].t - locks[i - 1].t <= 90000, `gap before window ${i + 1}: ${(opens[i].t - locks[i - 1].t) / 1000} s`);
  const tail = t0 + seconds * 1000 - locks[2].t + 6000 + DEFAULT_TIMINGS.callMs;
  assert.ok(tail <= 90000, `gap across the result into the next show: ${tail / 1000} s`);
  assert.deepEqual(opens[0].outcomes.map((o) => o.id), entrants);
});

test('bets lock before the outcome exists: nothing about a round is emitted before its window locks', async () => {
  const { feed } = await playShow(12);
  let locked = 0;
  for (const m of feed) {
    if (m.type === 'window_locked') locked++;
    if (m.type === 'event' && m.event.data?.round != null) assert.ok(m.event.data.round < locked, `round ${m.event.data.round} event before lock ${locked}`);
    if (m.type === 'match') assert.ok(!JSON.stringify(m).includes('seed'), 'the announce carries no seed');
  }
});

test('the feed lets a client replay every round, and all windows settle on the winner', async () => {
  const { feed, result } = await playShow(13);
  const locks = feed.filter((m) => m.type === 'window_locked');
  const rounds = feed.filter((m) => m.type === 'event' && m.event.type === 'round').map((m) => m.event);
  assert.equal(rounds.length, 3);
  let field = null;
  rounds.forEach((ev, i) => {
    assert.equal(ev.data.seed, locks[i].seed);
    if (field) assert.deepEqual(ev.data.entrants, field);
    const sim = simulate({ seed: ev.data.seed, entrants: ev.data.entrants, options: { round: ev.data.round } });
    assert.equal(sim.durationMs, ev.data.durationMs);
    assert.ok(ev.data.startAt > ev.at, 'the round starts after its title call');
    field = sim.result.qualified;
  });
  assert.equal(field[0], result.winnerId);
  const settles = feed.filter((m) => m.type === 'window_settled');
  assert.equal(settles.length, 3);
  assert.ok(settles.every((s) => s.winnerOutcomeId === result.winnerId));
  const recaps = feed.filter((m) => m.type === 'event' && m.event.type === 'recap');
  assert.equal(recaps.length, 2);
  for (const r of recaps) for (const n of r.event.data.notes) assert.ok(n.text.split(/\s+/).length <= 8, n.text);
  const res = feed.find((m) => m.type === 'event' && m.event.type === 'result');
  assert.deepEqual(res.event.data.order, result.order);
  assert.equal(result.order.length, 4);
});

test('event times are on the match clock and in order', async () => {
  const { feed } = await playShow(14);
  const match = feed.find((m) => m.type === 'match');
  let last = -1;
  for (const m of feed) {
    if (m.type !== 'event') continue;
    assert.ok(m.event.at >= last - 1, 'in order'); last = m.event.at;
    assert.ok(Math.abs(match.startedAt + m.event.at - m.t) < 60, `event ${m.event.type} aired ${m.t - match.startedAt - m.event.at} ms off its time`);
  }
});

test('a snapshot at any second carries what a joining stage needs', async () => {
  const clock = virtualClock();
  const feed = [];
  const fake = createFakeShow({ clock, onFeed: (m) => feed.push(m), seed: 15 });
  const entrants = ROSTER.slice(0, 16).map((g) => g.id);
  let done = false;
  runShow(fake.show, { entrants, matchId: 't-15' }).then(() => { done = true; });
  let sawOpen = 0, sawRound = 0, sawRecap = 0, sawResult = 0;
  for (let i = 0; i < 4000 && !done; i++) {
    await clock.advance(1000);
    const s = fake.snapshot();
    assert.ok(s.match && typeof s.match.startedAt === 'number' && s.serverNow === clock.now());
    const open = s.windows.find((w) => w.state === 'open');
    const phaseEv = s.recentEvents.filter((e) => ['round', 'recap', 'result'].includes(e.type)).pop();
    if (open) { sawOpen++; assert.equal(open.outcomes.length, [16, 8, 4][s.windows.length - 1]); }
    else if (phaseEv) {
      assert.ok(phaseEv.data.seed && phaseEv.data.entrants.length >= 4);
      if (phaseEv.type === 'round') sawRound++; else if (phaseEv.type === 'recap') sawRecap++; else sawResult++;
    }
  }
  assert.ok(sawOpen > 60 && sawRound > 60 && sawRecap > 10 && sawResult > 5, `${sawOpen} ${sawRound} ${sawRecap} ${sawResult}`);
});

test('records: least-run Gumbles go next, results are applied, files are normalised', () => {
  const rec = emptyRecords();
  const rng = new Rng(3);
  const counts = {};
  for (let i = 0; i < 30; i++) {
    const ids = pickEntrants(rec, () => rng.next());
    assert.equal(new Set(ids).size, 16);
    const sh = rng.shuffle(ids.slice());
    applyShow(rec, { entrants: ids, rounds: [{ qualified: sh.slice(0, 8) }, { qualified: sh.slice(0, 4) }], winnerId: sh[0] });
    for (const id of ids) counts[id] = (counts[id] || 0) + 1;
  }
  const v = Object.values(counts);
  assert.equal(v.length, 24);
  assert.ok(Math.max(...v) - Math.min(...v) <= 1, 'everyone has run the same number of shows, give or take one');
  assert.equal(Object.values(rec).reduce((n, r) => n + r.wins, 0), 30);
  assert.equal(Object.values(rec).reduce((n, r) => n + r.finals, 0), 120);
  const n = normaliseRecords({ juniper: { played: 3, wins: 1, form: ['W', '1', '2', 'F', 'F', 'W', 'W'] }, nobody: { played: 9 } });
  assert.equal(Object.keys(n).length, 24);
  assert.deepEqual(n.juniper, { played: 3, wins: 1, finals: 0, form: ['W', '1', '2', 'F', 'F'] });
});
