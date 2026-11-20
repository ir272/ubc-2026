// node --test test/   (npm test)
// The show script on a virtual clock with mock brains, the fake Show, the content check, and the
// OpenRouter brains against a stubbed fetch (no real model calls here, ever).

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMatch, resolveStrikes, STAGES, STAGE_NAMES } from '../src/show/script.ts';
import { TIMING } from '../src/show/events.ts';
import { createOpenRouterBrains, memoryLedger, mockBrains, SYSTEM_PROMPT, parseJsonLoose, READS, TAUNTS, CORNER_LINES } from '../src/show/brains.ts';
import { fileLedger } from '../src/show/brains.node.ts';
import { airLine, checkLine, cleanLine } from '../src/show/content.ts';
import { createFakeShow, fakeHash, virtualClock } from '../src/show/fakeShow.ts';
import { DEFAULT_PLAN } from '../src/sim/types.ts';

const BOTS = JSON.parse(readFileSync(new URL('../bots.json', import.meta.url), 'utf8'));

function prng(seedText) {
  const h = fakeHash(String(seedText));
  let a = parseInt(h.slice(0, 8), 16) >>> 0, b = parseInt(h.slice(8, 16), 16) >>> 0;
  let c = parseInt(h.slice(16, 24), 16) >>> 0, d = parseInt(h.slice(24, 32), 16) >>> 0;
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
}

/** wraps brains to record when each call starts and ends on the clock */
function tracked(brains, clock, log) {
  const out = { ...brains };
  for (const k of ['pickFighter', 'taunt', 'plan', 'corner', 'remember']) {
    out[k] = (...args) => {
      const rec = { kind: k, bot: args[0].id, start: clock.now(), end: null };
      log.push(rec);
      return brains[k](...args).finally(() => (rec.end = clock.now()));
    };
  }
  return out;
}

/** one full mock match on a virtual clock; samples a snapshot every `sampleMs` */
async function playMatch(seed, o = {}) {
  const clock = virtualClock(1_000_000);
  const feed = [];
  const show = createFakeShow({ clock, onFeed: (m) => feed.push(m), seedRandom: prng(seed + ':show') });
  const calls = [];
  const brains = tracked(mockBrains({ rand: prng(seed + ':brains'), sleep: (ms) => clock.sleep(ms), coaches: o.coaches }), clock, calls);
  const deps = {
    brains,
    bots: [BOTS[0], BOTS[1]],
    matchNo: 7,
    records: {},
    memories: {},
    random: prng(seed + ':script'),
    options: o.options,
  };
  let done = false;
  let result;
  let error;
  runMatch(show, deps).then((r) => (result = r), (e) => (error = e)).finally(() => (done = true));
  const snaps = [];
  if (o.sampleMs) {
    (async () => {
      while (!done) {
        await clock.sleep(o.sampleMs);
        if (!done) snaps.push({ at: clock.now(), snap: show.snapshot() });
      }
    })();
  }
  await clock.runUntil(() => done);
  show.destroy();
  if (error) throw error;
  assert.ok(done, 'the match finished');
  return { feed, result, calls, snaps, deps, clock };
}

const events = (feed) => feed.filter((m) => m.type === 'event').map((m) => ({ ...m.event, t: m.t }));

test('a full mock match finishes on a virtual clock, with a sane length and result', async () => {
  const wall = Date.now();
  const { feed, result, deps } = await playMatch('finish-1');
  assert.ok(Date.now() - wall < 20_000, 'runs fast');
  assert.ok(result && (result.winner === 0 || result.winner === 1));
  assert.equal(result.winnerId, BOTS[result.winner].id);
  assert.ok(result.lives[result.winner] > 0 && result.lives[1 - result.winner] === 0, 'loser is out of lives');
  const ms = feed.at(-1).t - feed[0].t;
  assert.ok(ms > 100_000 && ms < 12 * 60_000, `show length ${ms} ms`);
  // records and three-line memories updated in deps
  assert.deepEqual(deps.records[BOTS[result.winner].id], { played: 1, wins: 1 });
  assert.deepEqual(deps.records[BOTS[1 - result.winner].id], { played: 1, wins: 0 });
  for (const b of deps.bots) assert.equal(deps.memories[b.id].length, 1);
  const ends = feed.filter((m) => m.type === 'match_end');
  assert.equal(ends.length, 1);
  assert.equal(ends[0].result.winnerId, result.winnerId);
});

test('events appear in a legal order, every phase event carries ctx', async () => {
  for (const seed of ['order-1', 'order-2', 'order-3']) {
    const { feed } = await playMatch(seed);
    const evs = events(feed);
    const types = evs.map((e) => e.type);
    const head = ['call', 'select_open', 'picks', 'versus', 'taunt', 'taunt', 'predictions', 'fight_start'];
    assert.deepEqual(types.slice(0, head.length), head, seed);
    let st = 'fight';
    let corners = 0;
    let finalSeen = false;
    for (const e of evs.slice(head.length)) {
      const bad = () => assert.fail(`${seed}: ${e.type} not allowed in state ${st} (at ${e.at})`);
      switch (st) {
        case 'fight':
          if (['plan', 'state', 'hit', 'sudden_death'].includes(e.type)) break;
          if (e.type === 'life_lost') { st = 'ko'; finalSeen = e.data.final; break; }
          bad();
          break;
        case 'ko':
          if (e.type === 'life_lost') { finalSeen ||= e.data.final; break; }
          if (e.type === 'replay') { st = finalSeen ? 'final' : 'replayed'; corners = 0; break; }
          bad();
          break;
        case 'final':
          if (e.type === 'match_end') { st = 'end'; break; }
          bad();
          break;
        case 'replayed':
          if (e.type === 'corner_talk') { corners++; break; }
          if (e.type === 'plan') break;
          if (e.type === 'break_window' && corners === 2) { st = 'break'; break; }
          bad();
          break;
        case 'break':
          if (e.type === 'fight_resume') { st = 'fight'; break; }
          bad();
          break;
        default:
          bad();
      }
    }
    assert.equal(st, 'end', `${seed}: ends on match_end`);
    const phaseTypes = ['call', 'select_open', 'picks', 'versus', 'predictions', 'fight_start', 'state', 'life_lost', 'replay', 'fight_resume', 'match_end'];
    for (const e of evs) if (phaseTypes.includes(e.type)) assert.ok(e.data?.ctx?.bots?.length === 2, `${e.type} carries ctx`);
    // plans are emitted before the fight reaches their tick, and every `at` is non-decreasing
    let lastAt = -1;
    for (const e of evs) {
      assert.ok(e.at >= lastAt, 'at never goes backwards');
      lastAt = e.at;
    }
    // feed-level order around the windows
    const idx = (pred) => feed.findIndex(pred);
    assert.ok(idx((m) => m.type === 'window_open') < idx((m) => m.event?.type === 'predictions'));
    assert.ok(idx((m) => m.type === 'window_locked') < idx((m) => m.event?.type === 'fight_start'));
    const locked = feed.find((m) => m.type === 'window_locked');
    assert.match(locked.seed, /^[0-9a-f]{64}$/, 'seeded window publishes a seed at lock');
    const fs = evs.find((e) => e.type === 'fight_start');
    assert.equal(fs.data.ctx.header.seed, locked.seed, 'the fight seed is the lock seed');
  }
});

test('no model call that can decide an open window happens while it is open', async () => {
  for (const seed of ['legal-1', 'legal-2']) {
    const { feed, calls } = await playMatch(seed);
    const wins = [];
    for (const m of feed) {
      if (m.type === 'window_open') wins.push({ id: m.windowId, open: m.t, lock: Infinity });
      if (m.type === 'window_locked') wins.find((w) => w.id === m.windowId).lock = m.t;
    }
    assert.ok(wins.length >= 2, 'window A and at least one break window');
    for (const c of calls) {
      if (!['pickFighter', 'plan', 'corner'].includes(c.kind)) continue;
      assert.ok(c.end !== null, `${c.kind} settled`);
      for (const w of wins) {
        const overlaps = c.start < w.lock && c.end > w.open;
        assert.ok(!overlaps, `${seed}: ${c.kind} for ${c.bot} [${c.start - feed[0].t}, ${c.end - feed[0].t}] overlaps window ${w.id} [${w.open - feed[0].t}, ${w.lock - feed[0].t}]`);
      }
    }
    // and no plan is published while a window is open
    for (const m of feed) {
      if (m.event?.type !== 'plan') continue;
      for (const w of wins) assert.ok(!(m.t > w.open && m.t < w.lock), `plan published inside window ${w.id}`);
    }
    // the first plans come only after window A locked
    const firstPlanCall = calls.find((c) => c.kind === 'plan');
    assert.ok(firstPlanCall.start >= wins[0].lock);
  }
});

test('every window opened is settled with the winner', async () => {
  const { feed, result } = await playMatch('settle-1');
  const opened = feed.filter((m) => m.type === 'window_open').map((m) => m.windowId);
  const settled = feed.filter((m) => m.type === 'window_settled');
  assert.deepEqual(settled.map((m) => m.windowId).sort(), opened.slice().sort());
  for (const s of settled) assert.equal(s.winnerOutcomeId, result.winnerId);
  assert.equal(feed.filter((m) => m.type === 'window_void').length, 0);
  // settles come after the match_end event and before the platform's match_end message
  const endEv = feed.findIndex((m) => m.event?.type === 'match_end');
  const endMsg = feed.findIndex((m) => m.type === 'match_end');
  for (const s of settled) {
    const i = feed.indexOf(s);
    assert.ok(i > endEv && i < endMsg);
  }
});

test('a snapshot taken at 20 random moments always contains a ctx-bearing event', async () => {
  const { snaps } = await playMatch('snap-1', { sampleMs: 3100 });
  assert.ok(snaps.length >= 40, `${snaps.length} samples`);
  const r = prng('pick-snaps');
  const chosen = new Set();
  while (chosen.size < 20) chosen.add(Math.floor(r() * snaps.length));
  for (const i of chosen) {
    const s = snaps[i].snap;
    assert.equal(s.type, 'snapshot');
    assert.ok(s.match && Array.isArray(s.windows) && typeof s.serverNow === 'number');
    assert.ok(s.recentEvents.length <= 500);
    assert.ok(s.recentEvents.some((e) => e.data && e.data.ctx), `snapshot ${i} at ${snaps[i].at} has a ctx-bearing event`);
  }
});

test('the same seeds give the same show (no hidden clocks or randomness in the script)', async () => {
  const a = await playMatch('same-1');
  const b = await playMatch('same-1');
  assert.equal(JSON.stringify(a.feed), JSON.stringify(b.feed));
});

test('handicap, lives and forced picks are honoured', async () => {
  const { feed, result } = await playMatch('opts-1', { options: { handicap: [0, 40], lives: 1, picks: ['gantry', 'vise'] } });
  const fs = events(feed).find((e) => e.type === 'fight_start');
  assert.deepEqual(fs.data.ctx.header.handicap, [0, 40]);
  assert.equal(fs.data.ctx.header.lives, 1);
  assert.deepEqual(result.fighters, ['gantry', 'vise']);
  const st0 = events(feed).find((e) => e.type === 'state');
  assert.equal(st0.data.s.fighters[1].damage, 40);
  assert.equal(feed.filter((m) => m.type === 'window_open').length, 1, 'one life each: no break window');
});

test('fake Show: feed shapes match the runner', async () => {
  const clock = virtualClock(5000);
  const feed = [];
  const show = createFakeShow({ clock, onFeed: (m) => feed.push(m), seedRandom: prng('shape') });
  show.announce({ matchId: 'm1', title: 'A vs B', entrants: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  for (let i = 0; i < 520; i++) show.emit({ type: 'x', at: i, data: { i } });
  const w = await show.openWindow({ question: 'Q', outcomes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], durationMs: 1000, seeded: true, simHash: 'abc' });
  const p = show.lock(w);
  await clock.advance(2000);
  const { seed } = await p;
  assert.match(seed, /^[0-9a-f]{64}$/);
  await show.settle(w, 'b');
  show.end({ ok: 1 });
  const types = feed.map((m) => m.type);
  assert.deepEqual([...new Set(types)], ['phase', 'match', 'event', 'window_open', 'window_locked', 'window_settled', 'match_end']);
  for (const m of feed) assert.equal(typeof m.t, 'number');
  const ev = feed.find((m) => m.type === 'event');
  assert.deepEqual(Object.keys(ev).sort(), ['event', 't', 'type']);
  const snap = show.snapshot();
  assert.equal(snap.recentEvents.length, 500);
  assert.equal(snap.recentEvents[0].data.i, 20);
  assert.equal(snap.phase, 'result');
  assert.equal(snap.windows[0].state, 'settled');
  assert.equal(snap.windows[0].seed, seed);
  assert.equal(snap.windows[0].simHash.length, 64);
  show.destroy();
  await assert.rejects(show.sleep(10));
});

test('content check: dashes, emoji, limits, and blocked lines', async () => {
  assert.equal(cleanLine('Go in — hard \u{1F525}', 'read'), 'Go in, hard');
  assert.equal(cleanLine('"Read: stay calm"', 'read'), 'stay calm');
  assert.equal(cleanLine('one two three four five six seven eight nine ten', 'read').split(' ').length, 8);
  assert.ok(cleanLine('keep the pressure on them and then go for the', 'read').endsWith('go'));
  assert.ok(checkLine('Hold the middle, let them come', 'read').ok);
  assert.ok(!checkLine('', 'taunt').ok);
  assert.ok(!checkLine('You fight like Elon Musk', 'taunt').ok);
  assert.ok(!checkLine('this is f*cking easy', 'taunt').ok);
  assert.ok(!checkLine('so sexy on that ledge', 'taunt').ok);
  assert.ok(!checkLine('Falcon punch incoming', 'taunt').ok);
  assert.ok(checkLine('Cocky words from a slow robot', 'taunt').ok, 'no false hit inside words');
  const a = await airLine('taunt', 'what a sexy robot', async () => 'Fine, you win this round', () => 'safe');
  assert.deepEqual([a.source, a.text], ['regen', 'Fine, you win this round']);
  const b = await airLine('taunt', 'sexy', async () => 'sexy again', () => 'Safe line here');
  assert.deepEqual([b.source, b.text], ['fallback', 'Safe line here']);
  // the mock banks are big enough and clean
  for (const s of Object.keys(READS)) assert.ok(READS[s].length >= 30, `${s} reads`);
  assert.ok(TAUNTS.length >= 30);
  assert.ok(CORNER_LINES.lost.length >= 30 && CORNER_LINES.took.length >= 30);
  const all = [...Object.values(READS).flat(), ...TAUNTS, ...CORNER_LINES.lost, ...CORNER_LINES.took];
  for (const line of all) {
    assert.ok(!/[–—]/.test(line), line);
    const kind = TAUNTS.includes(line) ? 'taunt' : READS.rush.includes(line) || Object.values(READS).flat().includes(line) ? 'read' : 'corner';
    const filled = line.replace(/\{\w+\}/g, 'Kiln');
    const c = checkLine(filled, kind);
    assert.ok(c.ok, `${line}: ${c.reason}`);
    assert.equal(c.text.split(' ').length, filled.split(' ').length, `${line} is within the ${kind} limit`);
  }
});

test('stage strike: the bots cross stages out in turn until one is left, first shown with the picks', async () => {
  const { feed } = await playMatch('strike-1');
  const evs = events(feed);
  const open = evs.find((e) => e.type === 'select_open');
  assert.deepEqual(open.data.ctx.stages, STAGES);
  assert.equal(open.data.ctx.stage, undefined, 'no stage before the picks');
  assert.equal(open.data.ctx.strikes, undefined, 'no strikes before the picks');
  assert.equal(open.data.durationMs, TIMING.select);
  assert.equal(open.data.revealInMs, TIMING.selectReveal);
  const before = evs.slice(0, evs.indexOf(evs.find((e) => e.type === 'picks')));
  for (const e of before) assert.ok(!e.data?.ctx?.stage && !e.data?.ctx?.strikes, `${e.type} carries no stage`);
  const picks = evs.find((e) => e.type === 'picks');
  const { strikes, stage } = picks.data.ctx;
  assert.equal(strikes.length, STAGES.length - 1);
  // matchNo 7: side 1 strikes first, then they alternate
  strikes.forEach((st, i) => assert.equal(st.by, (7 + i) % 2));
  const struck = strikes.map((st) => st.stage);
  assert.equal(new Set(struck).size, struck.length, 'each stage struck once');
  assert.ok(STAGES.includes(stage) && !struck.includes(stage), 'the survivor is played');
  for (const id of STAGES) assert.ok(STAGE_NAMES[id], `${id} has a name`);
  // the stage stays in the ctx from then on
  const vs = evs.find((e) => e.type === 'versus');
  assert.equal(vs.data.ctx.stage, stage);
  // a forced stage survives the strikes
  const forced = await playMatch('strike-2', { options: { stage: 'ship' } });
  const fp = events(forced.feed).find((e) => e.type === 'picks').data.ctx;
  assert.equal(fp.stage, 'ship');
  assert.equal(fp.strikes.length, STAGES.length - 1);
  assert.ok(!fp.strikes.some((st) => st.stage === 'ship'));
});

test('stage strike: resolve takes the first standing stage in its own order', () => {
  const r = resolveStrikes(['a', 'b', 'c', 'd'], [['a', 'b', 'c', 'd'], ['a', 'c', 'b', 'd']], 0);
  assert.deepEqual(r.strikes, [{ by: 0, stage: 'a' }, { by: 1, stage: 'c' }, { by: 0, stage: 'b' }]);
  assert.equal(r.stage, 'd');
  const f = resolveStrikes(['a', 'b', 'c'], [['c', 'b', 'a'], ['c', 'b', 'a']], 1, 'c');
  assert.equal(f.stage, 'c');
  assert.equal(f.strikes.length, 2);
  assert.equal(resolveStrikes(['a'], [[], []], 0).strikes.length, 0);
});

test('stage strike brains: mock is a deterministic order of every stage; OpenRouter answers are cleaned', async () => {
  const stages = STAGES.map((id) => ({ id, name: STAGE_NAMES[id] }));
  const mock = mockBrains({ rand: prng('s'), sleep: async () => {} });
  const a = await mock.strikeStages(BOTS[0], { stages, opponentName: 'x' });
  const b = await mock.strikeStages(BOTS[0], { stages, opponentName: 'x' });
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [...STAGES].sort());
  const answer = (content) => async () => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 } }), { status: 200 });
  const ledger = memoryLedger();
  const or = createOpenRouterBrains({ apiKey: 'k', fetch: answer('{"strikes":["SHIP","ship","nowhere","map"]}'), ledger, mock, rand: prng('o') });
  assert.deepEqual(await or.strikeStages(BOTS[0], { stages, opponentName: 'x' }), ['ship', 'map']);
  assert.equal(ledger.entries.at(-1).kind, 'strike');
  const bad = createOpenRouterBrains({ apiKey: 'k', fetch: answer('no idea'), ledger: memoryLedger(), mock, rand: prng('o') });
  const fb = await bad.strikeStages(BOTS[0], { stages, opponentName: 'x' });
  assert.deepEqual([...fb].sort(), [...STAGES].sort());
});

test('OpenRouter brains (stubbed fetch): JSON repair, cost log, budget, timeouts', async () => {
  const requests = [];
  const answer = (content, cost = 0.4) => async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 210, completion_tokens: 30, cost } }), { status: 200 });
  };
  const ledger = memoryLedger();
  const mock = mockBrains({ rand: prng('m'), sleep: async () => {} });
  let budgetHit = 0;
  const brains = createOpenRouterBrains({
    apiKey: 'test-key-not-real',
    fetch: answer("Sure! ```json\n{stance: 'rush', \"aggression\": 0.9, \"range\": \"close\", \"read\": \"They freeze — go now\",}\n```"),
    ledger,
    budgetUsd: 1.0,
    mock,
    rand: prng('r'),
    onBudgetSpent: () => budgetHit++,
  });
  const bot = { ...BOTS[0], model: 'someone/any-model-id' };
  const view = {
    tick: 360, secondsLeft: 170, sudden: false, gap: 3.2, centre: 'even', oppLooksLike: 'wall',
    me: { fighter: 'tick', damage: 30, lives: 2, where: 'centre', airborne: false },
    opp: { fighter: 'kiln', damage: 55, lives: 2, where: 'left', airborne: false },
    oppHabits: { approaches: 0, retreats: 1, strikes: 2, grabs: 0, shields: 4, dodges: 0, shots: 0, jumps: 0, recoveredHigh: 0, recoveredLow: 0 },
    since: { plan: DEFAULT_PLAN, ticks: 180, dealt: 10, taken: 4, myHits: 2, oppHits: 1, myGrabs: 0, oppGrabs: 0, myWhiffs: 1, shieldedByOpp: 3 },
  };
  const p = await brains.plan(bot, view, DEFAULT_PLAN);
  assert.equal(p.stance, 'rush');
  assert.equal(p.aggression, 0.9);
  assert.equal(p.range, 'close');
  const req = JSON.parse(requests[0].init.body);
  assert.equal(req.model, 'someone/any-model-id', 'model id comes from the bot config');
  assert.ok(req.max_tokens <= 200);
  assert.equal(requests[0].init.headers.authorization, 'Bearer test-key-not-real');
  assert.ok(!requests[0].init.body.includes('test-key-not-real'), 'the key is never in the body');
  assert.ok(SYSTEM_PROMPT.split(/\s+/).length < 280, `system prompt ${SYSTEM_PROMPT.split(/\s+/).length} words`);
  const userMsg = req.messages[1].content;
  assert.ok(userMsg.length < 1400, `user message ${userMsg.length} chars`);
  assert.equal(ledger.entries[0].promptTokens, 210);
  assert.equal(ledger.entries[0].costUsd, 0.4);
  await brains.plan(bot, view, DEFAULT_PLAN);
  await brains.plan(bot, view, DEFAULT_PLAN); // 0.8 < 1.0, so this one is still real
  assert.equal(brains.calls(), 3);
  await brains.plan(bot, view, DEFAULT_PLAN); // 1.2 >= 1.0: refused, mock answers
  assert.equal(brains.calls(), 3);
  assert.equal(budgetHit, 1);
  assert.ok(Math.abs(brains.spent() - 1.2) < 1e-9);

  // a hung model times out to the old plan; a corner times out to the old plan and a stock line
  const hung = createOpenRouterBrains({
    apiKey: 'k',
    fetch: (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
    ledger: memoryLedger(),
    mock,
    rand: prng('h'),
    timeoutsMs: { plan: 30, corner: 30, pick: 30, taunt: 30 },
  });
  const prev = { ...DEFAULT_PLAN, stance: 'wall', read: 'Hold it' };
  assert.deepEqual(await hung.plan(bot, view, prev), prev);
  const c = await hung.corner(bot, { view, lostLife: true, prev });
  assert.deepEqual(c.plan, prev);
  assert.ok(CORNER_LINES.lost.map((l) => l.replace('{oppDmg}', '55')).includes(c.talk));
  const roster = [{ id: 'kiln' }, { id: 'tick' }, { id: 'gantry' }, { id: 'vise' }];
  assert.ok(['kiln', 'tick', 'gantry', 'vise'].includes(await hung.pickFighter(bot, { roster, opponent: { name: 'x', model: 'y' }, memory: [] })));
  assert.ok((await hung.taunt(bot, { mine: 'kiln', theirs: 'tick', opponentName: 'X' })).length > 0);

  // pick and corner answers parse
  const pick = createOpenRouterBrains({ apiKey: 'k', fetch: answer('{"pick":"gantry"}', 0.001), ledger: memoryLedger(), mock, rand: prng('p') });
  assert.equal(await pick.pickFighter(bot, { roster, opponent: { name: 'x', model: 'y' }, memory: [] }), 'gantry');
  const corner = createOpenRouterBrains({ apiKey: 'k', fetch: answer('{"stance":"bait","talk":"Make them swing first"}', 0.001), ledger: memoryLedger(), mock, rand: prng('c') });
  const cc = await corner.corner(bot, { view, lostLife: false, prev });
  assert.equal(cc.plan.stance, 'bait');
  assert.equal(cc.talk, 'Make them swing first');

  assert.equal(parseJsonLoose('nothing here'), null);
  assert.deepEqual(parseJsonLoose('{"a":1,}'), { a: 1 });
});

test('cost log file: tokens and cost per call, total kept across instances', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ringout-cost-'));
  try {
    const path = join(dir, '.cache', 'cost.json');
    const l1 = fileLedger(path);
    l1.add({ at: 'x', kind: 'plan', bot: 'a', model: 'p/m', promptTokens: 100, completionTokens: 10, costUsd: 0.25, ms: 5, ok: true });
    const l2 = fileLedger(path);
    assert.equal(l2.total(), 0.25);
    l2.add({ at: 'y', kind: 'taunt', bot: 'b', model: 'p/m', promptTokens: 50, completionTokens: 5, costUsd: 0.5, ms: 5, ok: true });
    const j = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(j.calls.length, 2);
    assert.equal(j.totalUsd, 0.75);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
