// Pure stage parts, no browser: the feed reducer and the fight playback.
// Runs one mock match on a virtual clock through the fake Show and the real match script.
//   node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VirtualClock } from '../src/stage/clock.ts';
import { createFakeShow } from '../src/show/fakeShow.ts';
import { runMatch } from '../src/show/script.ts';
import { mockBrains } from '../src/show/brains.ts';
import { initialReduced, reduce, showStateAt } from '../src/show/reduce.ts';
import { Playback } from '../src/show/playback.ts';
import { hashFight } from '../src/sim/index.ts';

const BOTS = JSON.parse(readFileSync(new URL('../bots.json', import.meta.url), 'utf8'));

function prng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const wire = (m) => JSON.parse(JSON.stringify(m));
const CHUNK = 50; // ms of show time per playback frame

/** Plays one whole mock match. Calls hooks along the way. Returns the recorded feed. */
async function playMatch({ seed = 7, picks, timing, onMsg, onChunk } = {}) {
  const vc = new VirtualClock(1_800_000_000_000);
  const feed = [];
  const show = createFakeShow({
    clock: vc,
    seedRandom: prng(seed * 3 + 1),
    onFeed: (m) => {
      const w = wire(m);
      feed.push({ now: vc.now(), msg: w });
      onMsg?.(w, vc.now());
    },
  });
  const brains = mockBrains({ rand: prng(seed * 5 + 2), sleep: vc.sleep, coaches: ['adaptive', 'rush'] });
  let done = false;
  let result = null;
  const p = runMatch(show, {
    brains,
    bots: [BOTS[0], BOTS[1]],
    matchNo: 1,
    records: {},
    memories: {},
    random: prng(seed * 7 + 3),
    options: { ...(picks ? { picks } : {}), ...(timing ? { timing } : {}) },
  }).then((r) => {
    result = r;
    done = true;
  });
  let guard = 0;
  while (!done) {
    await vc.advance(CHUNK);
    onChunk?.(vc.now(), show);
    if (++guard > 20 * 60 * 20) throw new Error('match did not finish in 20 minutes of show time');
  }
  await p;
  return { feed, result, vc, show };
}

function fullReduce(feed, uptoNow) {
  const r = initialReduced();
  for (const f of feed) if (f.now <= uptoNow) reduce(r, f.msg);
  return r;
}

const PHASE_EVENTS = new Set(['call', 'select_open', 'versus', 'predictions', 'fight_start', 'life_lost', 'fight_resume', 'match_end']);

test('reduce: the right phase from snapshots at 30 random moments of a mock match', async () => {
  const rand = prng(99);
  const moments = Array.from({ length: 30 }, () => 1000 + rand() * 230_000).sort((a, b) => a - b);
  const snaps = [];
  let t0 = null;
  let mi = 0;
  const { feed } = await playMatch({
    seed: 11,
    onChunk(now, show) {
      if (t0 == null) t0 = now;
      while (mi < moments.length && now - t0 >= moments[mi]) {
        snaps.push({ now, snap: wire(show.snapshot()) });
        mi++;
      }
    },
  });
  assert.ok(snaps.length >= 20, `took ${snaps.length} snapshots`);
  const seen = new Set();
  for (const { now, snap } of snaps) {
    const truth = fullReduce(feed, now);
    const showNow = now - truth.startedAt;
    const want = showStateAt(truth, showNow);
    // 1. a viewer joining now with the whole snapshot
    const r = reduce(initialReduced(), snap);
    const got = showStateAt(r, showNow);
    assert.equal(got.phase, want.phase, `phase at ${showNow} ms`);
    assert.ok(Math.abs(got.phaseMs - want.phaseMs) < 1, `phaseMs at ${showNow}: ${got.phaseMs} vs ${want.phaseMs}`);
    assert.equal(got.picksRevealed, want.picksRevealed);
    assert.deepEqual(got.ctx?.picks ?? null, want.ctx?.picks ?? null);
    assert.equal(got.window?.id ?? null, want.window?.id ?? null);
    if (got.window) assert.ok(Math.abs(got.window.msLeft - want.window.msLeft) < 1);
    // 2. a snapshot that lost every event before the phase began (only ctx-bearing events left)
    const evs = snap.recentEvents;
    let k = -1;
    for (let i = evs.length - 1; i >= 0; i--) if (PHASE_EVENTS.has(evs[i].type)) { k = i; break; }
    if (k > 0) {
      const cut = { ...snap, recentEvents: evs.slice(k) };
      const r2 = reduce(initialReduced(), cut);
      const g2 = showStateAt(r2, showNow);
      assert.equal(g2.phase, want.phase, `phase from a cut snapshot at ${showNow} ms`);
      assert.ok(Math.abs(g2.phaseMs - want.phaseMs) < 1);
      assert.deepEqual(g2.ctx?.bots.map((b) => b.id), want.ctx?.bots.map((b) => b.id));
      assert.equal(g2.picksRevealed, want.picksRevealed);
      if (want.phase === 'versus' || want.phase === 'predictions') assert.deepEqual(g2.taunts, want.taunts);
    }
    seen.add(want.phase);
  }
  assert.ok(seen.size >= 4, `phases covered: ${[...seen].join(', ')}`);
});

const CASES = [
  { seed: 23, picks: ['gantry', 'vise'], joinTick: 900 },
  { seed: 5, picks: ['kiln', 'tick'], joinTick: 2500 },
  { seed: 41, picks: undefined, joinTick: 400 },
];
for (const c of CASES) test(`playback (seed ${c.seed}): full feed and a joiner at tick ${c.joinTick} match the channel hash at every checkpoint`, async () => {
  const rA = initialReduced();
  const A = new Playback();
  let B = null;
  let rB = null;
  const logs = [];
  A.onLog = (l) => logs.push('A ' + l);
  const checkpoints = new Map();
  let startedAt = null;
  let lastNowA = 0;
  let joinedAt = null;
  let finalHashA = null;
  let finalHashB = null;
  const { result } = await playMatch({
    seed: c.seed,
    picks: c.picks,
    onMsg(msg) {
      if (msg.type === 'match') startedAt = msg.startedAt;
      if (msg.type === 'event' && msg.event.type === 'state') checkpoints.set(msg.event.data.tick, msg.event.data.hash);
      reduce(rA, msg);
      A.onFeed(msg);
      if (B) {
        reduce(rB, msg);
        B.onFeed(msg);
      }
    },
    onChunk(now, show) {
      const sn = now - startedAt;
      const vA = A.frame(sn, CHUNK / 1000, showStateAt(rA, sn));
      lastNowA = sn;
      if (vA && rA.phase === 'verdict') finalHashA = hashFight(vA.state);
      // join once, mid-fight, from a snapshot
      if (!B && rA.phase === 'fight' && vA && vA.state.tick > c.joinTick) {
        rB = reduce(initialReduced(), wire(show.snapshot()));
        B = new Playback();
        B.onLog = (l) => logs.push('B ' + l);
        B.onFeed(wire(show.snapshot()));
        joinedAt = vA.state.tick;
      }
      if (B) {
        const vB = B.frame(sn, CHUNK / 1000, showStateAt(rB, sn));
        if (vB && rB.phase === 'verdict') finalHashB = hashFight(vB.state);
        if (vA && vB && rA.phase === 'fight' && vA.mode === 'live' && vB.mode === 'live' && vA.state.tick === vB.state.tick) {
          assert.equal(hashFight(vB.state), hashFight(vA.state), `joiner and full playback differ at tick ${vA.state.tick}`);
        }
      }
    },
  });
  void lastNowA;
  assert.ok(checkpoints.size > 10, `${checkpoints.size} checkpoints`);
  assert.equal(A.mismatches, 0, `full-feed playback mismatches:\n${logs.join('\n')}`);
  assert.ok(A.matches >= checkpoints.size - 3, `full feed verified ${A.matches} of ${checkpoints.size} checkpoints`);
  assert.ok(B, 'the joiner joined');
  assert.equal(B.mismatches, 0, `joiner mismatches:\n${logs.join('\n')}`);
  const after = [...checkpoints.keys()].filter((t) => t > joinedAt + 30).length;
  assert.ok(B.matches >= after - 3, `joiner verified ${B.matches} of ${after} checkpoints after joining at ${joinedAt}`);
  assert.ok(finalHashA && finalHashA === finalHashB, 'both end on the same final state');
  assert.ok(!logs.some((l) => /late/.test(l)), logs.join('\n'));
  // the final state agrees with the channel's result
  const v = A.frame(lastNowA, 0, showStateAt(rA, lastNowA));
  assert.deepEqual(v.state.fighters.map((f) => f.lives), result.lives);
  assert.deepEqual(v.state.fighters.map((f) => Math.round(f.damage)), result.damage);
});

// The knockout plays live before the replay: the channel waits TIMING.koHold after life_lost, and
// playback never lets a replay (or match_end) cut in before the live copy has drawn the knockout.
// koHold 0 is the old channel (replay at once): playback alone must still keep the order.
for (const k of [{ seed: 7, koHold: undefined }, { seed: 23, koHold: undefined }, { seed: 7, koHold: 0 }, { seed: 41, koHold: 0 }]) {
  test(`knockouts play live before their replay (seed ${k.seed}, koHold ${k.koHold ?? 'default'}), joiners in the break land right`, async () => {
    const r = initialReduced();
    const P = new Playback();
    let startedAt = null;
    let frameNo = 0;
    const kos = []; // { tick, final, at, liveKoFrame, firstReplayFrame, replayAt }
    let current = null;
    const joiners = []; // { at, kind, ko, pb, r, modes: [] }
    const order = [];
    const { result } = await playMatch({
      seed: k.seed,
      timing: k.koHold === undefined ? undefined : { koHold: k.koHold },
      onMsg(msg, now) {
        if (msg.type === 'match') startedAt = msg.startedAt;
        reduce(r, msg);
        P.onFeed(msg);
        for (const j of joiners) if (j.pb) { reduce(j.r, msg); j.pb.onFeed(msg); }
        const e = msg.type === 'event' ? msg.event : null;
        if (e?.type === 'life_lost') {
          current = { tick: e.data.tick, final: e.data.final, at: e.at, liveKoFrame: null, firstReplayFrame: null, replayAt: null };
          kos.push(current);
          order.push('life_lost');
          // two joiners per break: one during the hold (when there is one), one in the replay
          if (k.koHold !== 0) joiners.push({ at: e.at + 1000, kind: 'hold', ko: current, pb: null, r: null, modes: [] });
        }
        if (e?.type === 'replay' && current) {
          current.replayAt = e.at;
          current.replayFrom = e.data.from.tick;
          joiners.push({ at: e.at + 2000, kind: 'replay', ko: current, pb: null, r: null, modes: [] });
        }
      },
      onChunk(now, show) {
        const sn = now - startedAt;
        frameNo++;
        const v = P.frame(sn, CHUNK / 1000, showStateAt(r, sn));
        if (v && current) {
          if (v.mode === 'live' && v.events.some((ev) => ev.t === 'ko' && ev.tick === current.tick)) current.liveKoFrame ??= frameNo;
          if (v.mode === 'replay' && current.firstReplayFrame == null && sn >= current.at) {
            current.firstReplayFrame = frameNo;
            assert.ok(current.replayAt != null && sn >= current.replayAt, `replay drawn at ${sn} before its own start ${current.replayAt}`);
          }
        }
        for (const j of joiners) {
          if (!j.pb && sn >= j.at && r.phase !== 'idle') {
            j.r = reduce(initialReduced(), wire(show.snapshot()));
            j.pb = new Playback();
            j.pb.onFeed(wire(show.snapshot()));
          }
          if (j.pb && j.modes.length < 400) {
            const jv = j.pb.frame(sn, CHUNK / 1000, showStateAt(j.r, sn));
            j.modes.push({ sn, mode: jv?.mode ?? null, tick: jv?.state.tick ?? null, ko: !!jv?.events.some((ev) => ev.t === 'ko'), phase: j.r.phase });
          }
        }
      },
    });
    assert.ok(kos.length >= 2, `${kos.length} knockouts`);
    assert.ok(kos.some((x) => x.final), 'the match ended on a knockout');
    for (const ko of kos) {
      assert.ok(ko.liveKoFrame != null, `knockout at tick ${ko.tick}: the ko event never went out in mode live`);
      assert.ok(ko.firstReplayFrame != null, `knockout at tick ${ko.tick}: no replay frame`);
      assert.ok(ko.liveKoFrame < ko.firstReplayFrame, `knockout at tick ${ko.tick}: live ko frame ${ko.liveKoFrame}, first replay frame ${ko.firstReplayFrame}`);
      if (k.koHold === undefined) assert.equal(ko.replayAt - ko.at, ko.final ? 3800 : 2600, 'replay comes koHold (koHoldFinal for the last one) after life_lost');
    }
    for (const j of joiners) {
      assert.ok(j.modes.length, `${j.kind} joiner drew nothing`);
      const first = j.modes[0];
      if (j.kind === 'hold') {
        // lands on the live fight just before the knockout, plays it, holds, then the replay
        assert.ok(first.mode === 'live' || first.mode === 'frozen', `hold joiner first mode ${first.mode}`);
        assert.ok(first.tick <= j.ko.tick, `hold joiner at tick ${first.tick}, knockout ${j.ko.tick}`);
        const atKo = j.modes.findIndex((m) => m.tick === j.ko.tick && m.mode !== 'replay');
        const rep = j.modes.findIndex((m) => m.mode === 'replay');
        assert.ok(atKo >= 0 && rep > atKo, `hold joiner reached the knockout (${atKo}) before the replay (${rep})`);
        assert.ok(j.modes[rep].sn >= j.ko.replayAt, 'hold joiner replay starts at its own time');
      } else {
        assert.equal(first.mode, 'replay', `replay joiner first mode ${first.mode} (phase ${first.phase})`);
        // and where the replay is now (2 s in at half speed: about 60 ticks past its start), not at its start
        const want = j.ko.replayFrom + ((first.sn - j.ko.replayAt) * 0.5) / (1000 / 60);
        assert.ok(Math.abs(first.tick - want) <= 4, `replay joiner at tick ${first.tick}, the replay is at ${want.toFixed(1)}`);
      }
    }
    assert.ok(result.winner === 0 || result.winner === 1);
  });
}
