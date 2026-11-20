import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSim, simulate, simulateShow, showSeeds, seedToUint32, TICK_RATE, COURSE, EVENT_TYPES, ANIMS, ROSTER, ROUNDS, STAT_KEYS,
} from '../sim/index.js';
import { computeSimHash } from '../tools/simhash.mjs';
import { SIM_HASH } from '../show/simHash.js';

const SIM_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'sim');
const ids = (from, n) => ROSTER.slice(from, from + n).map((g) => g.id);
const HEX = 'c0ffee00deadbeef0123456789abcdef00112233445566778899aabbccddeeff';

function runRound(seed, round, entrants, checkpoints = []) {
  const sim = createSim({ seed, round, entrants });
  const hashes = {};
  const events = [];
  while (sim.state.phase !== 'finished' && sim.state.tick < TICK_RATE * 200) {
    sim.step();
    events.push(...sim.drainEvents());
    if (checkpoints.includes(sim.state.tick)) hashes[sim.state.tick] = sim.hash();
  }
  return { sim, hashes, events, order: sim.order.map((b) => `${b.place}:${b.rid}:${b.status}:${b.finishTime}`) };
}

test('the roster is 24 fixed Gumbles with unique names, looks and stats in range', () => {
  assert.equal(ROSTER.length, 24);
  assert.equal(new Set(ROSTER.map((g) => g.id)).size, 24);
  assert.equal(new Set(ROSTER.map((g) => g.name)).size, 24);
  assert.equal(new Set(ROSTER.map((g) => g.colors.join() + g.pattern)).size, 24);
  for (const g of ROSTER) {
    for (const k of STAT_KEYS) assert.ok(g.stats[k] >= 2 && g.stats[k] <= 9, `${g.id} ${k}`);
    assert.equal(STAT_KEYS.reduce((n, k) => n + g.stats[k], 0), 22, `${g.id} stat total`);
    assert.ok(g.trait);
  }
});

test('three rounds: 16 to 8, 8 to 4, 4 to 1, in course order', () => {
  assert.deepEqual(ROUNDS.map((r) => [r.starters, r.qualify]), [[16, 8], [8, 4], [4, 1]]);
  for (let i = 0; i < ROUNDS.length; i++) {
    assert.ok(ROUNDS[i].finish.z > ROUNDS[i].startZ);
    // rounds one and two do not overlap; the final shares one section (the maze) with round two
    if (i === 1) assert.ok(ROUNDS[i].startZ >= ROUNDS[i - 1].finish.z, 'rounds one and two do not overlap');
    if (i === 2) assert.ok(ROUNDS[i].startZ >= ROUNDS[i - 1].startZ + 50, 'the final starts past the bridges');
  }
  assert.ok(COURSE.length > 300 && COURSE.length < 400);
});

test('same seed and entrants give the identical round (hashes at fixed ticks, order, events)', () => {
  for (const [round, n] of [[0, 16], [1, 8], [2, 4]]) {
    const ticks = [1, 200, 600, 1100];
    const a = runRound(42, round, ids(3, n), ticks);
    const b = runRound(42, round, ids(3, n), ticks);
    assert.equal(Object.keys(a.hashes).length, ticks.length);
    assert.deepEqual(a.hashes, b.hashes);
    assert.deepEqual(a.order, b.order);
    assert.equal(a.sim.hash(), b.sim.hash());
    assert.deepEqual(a.events.map((e) => e.text), b.events.map((e) => e.text));
  }
});

test('different seeds and different rounds give different races', () => {
  const o = [1, 2, 3].map((s) => runRound(s, 0, ids(0, 16)).order.join(','));
  assert.notEqual(o[0], o[1]); assert.notEqual(o[1], o[2]); assert.notEqual(o[0], o[2]);
  assert.notEqual(runRound(5, 0, ids(0, 16)).sim.hash(), runRound(5, 1, ids(0, 8)).sim.hash());
});

test('simulate() is pure, takes the platform hex seed and returns the documented shape', () => {
  const a = simulate({ seed: HEX, entrants: ids(0, 16).map((id) => ({ id })), options: { round: 0 } });
  const b = simulate({ seed: HEX, entrants: ids(0, 16), options: { round: 0 } });
  assert.deepEqual(a, b);
  assert.equal(seedToUint32(HEX), seedToUint32(HEX.toUpperCase()));
  assert.notEqual(seedToUint32(HEX), seedToUint32(HEX.replace('c', 'd')));
  assert.equal(a.result.qualified.length, 8);
  assert.equal(a.result.eliminated.length, 8);
  assert.equal(a.result.notes.length, 8);
  assert.equal(a.result.winnerId, a.result.qualified[0]);
  assert.ok(a.durationMs > 15000 && a.durationMs < 60000);
  assert.ok(a.events.length > 15 && a.events.length < 120, `${a.events.length} events`);
  let last = 0;
  for (const e of a.events) {
    assert.ok(e.at >= last, 'events in time order'); last = e.at;
    assert.equal(typeof e.data.text, 'string');
    assert.ok(e.data.text.split(/\s+/).length <= 20, `line too long: ${e.data.text}`);
    assert.ok(!/[—–]/.test(e.data.text), 'no dashes in on-screen text');
  }
  assert.equal(a.events.filter((e) => e.type === 'lastSpot').length, 1);
  assert.equal(a.events.filter((e) => e.type === 'roundEnd').length, 1);
  assert.equal(a.events.filter((e) => e.type === 'eliminated').length, 8);
  JSON.stringify(a); // serialisable
});

test('every round of 40 shows ends on the line with the right numbers', () => {
  for (let n = 1; n <= 40; n++) {
    const entrants = ids(n % 9, 16);
    const show = simulateShow({ seeds: showSeeds(n), entrants });
    assert.ok(entrants.includes(show.winnerId));
    show.rounds.forEach((r, i) => {
      const R = ROUNDS[i];
      assert.equal(r.result.timedOut, false, `show ${n} round ${i} ended on the clock`);
      assert.equal(r.result.qualified.length, R.qualify);
      assert.equal(r.result.eliminated.length, R.starters - R.qualify);
      assert.equal(r.result.order.length, R.starters);
      for (const id of r.result.qualified) assert.ok(r.result.times[id] > 0);
      if (i) assert.deepEqual(new Set(r.result.order.map((o) => o.id)), new Set(show.rounds[i - 1].result.qualified));
    });
  }
});

test('sim events are well formed and name everyone they involve', () => {
  const { sim, events } = runRound(9, 0, ids(4, 16));
  const quals = events.filter((x) => x.type === 'qualified' || x.type === 'lastSpot');
  assert.deepEqual(quals.map((x) => x.place), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const x of quals) { assert.equal(sim.bots[x.botId].finishPlace, x.place); assert.ok(x.text.includes(sim.bots[x.botId].name)); }
  for (const ev of events) {
    assert.ok(EVENT_TYPES.includes(ev.type), `unknown event ${ev.type}`);
    assert.ok(ev.importance >= 0 && ev.importance <= 1);
    if (ev.otherId != null) assert.ok(ev.text.includes(sim.bots[ev.otherId].name), `${ev.type} omits the other: ${ev.text}`);
  }
});

test('state shape', () => {
  const sim = createSim({ seed: 7, round: 0, entrants: ids(0, 16) });
  assert.equal(sim.state.phase, 'countdown');
  for (let i = 0; i < 60 * 12; i++) sim.step();
  const st = sim.state;
  assert.equal(st.phase, 'race');
  assert.equal(st.bots.length, 16);
  assert.equal(st.qualifyCount, 8);
  for (const b of st.bots) {
    for (const k of ['id', 'rid', 'name', 'colors', 'pattern', 'stats', 'trait', 'pos', 'vel', 'yaw', 'anim', 'animTime', 'grounded',
      'progress', 'distance', 'place', 'status', 'finishTime', 'finishPlace', 'section', 'lastEventTick']) assert.ok(k in b, `bot missing ${k}`);
    assert.ok(ANIMS.includes(b.anim));
  }
  assert.ok(st.obstacles.length > 50);
  for (const o of st.obstacles) assert.ok(o.id && o.type && o.pos && o.rot);
  assert.equal(st.bubble.length, 4);
  const json = JSON.parse(JSON.stringify(st.bots[0]));
  assert.ok(!('m' in json) && !('ai' in json));
});

test('a lobby sim holds the field on its start grid, on the ground, for every round', () => {
  for (const [round, n] of [[0, 16], [1, 8], [2, 4]]) {
    const sim = createSim({ seed: 0, round, entrants: ids(0, n), lobby: true });
    const start = sim.bots.map((b) => ({ x: b.pos.x, z: b.pos.z }));
    for (let i = 0; i < 60 * 30; i++) sim.step();
    assert.equal(sim.state.phase, 'intro');
    sim.bots.forEach((b, i) => {
      assert.ok(Math.hypot(b.pos.x - start[i].x, b.pos.z - start[i].z) < 0.8, `round ${round} ${b.rid} wandered`);
      assert.ok(b.grounded && b.status === 'racing');
      assert.ok(b.pos.z < sim.course.startZ, 'behind the start line');
    });
  }
});

test('sim/ has no forbidden identifiers', () => {
  const forbidden = [
    /Math\.random/, /\bDate\b/, /\bperformance\b/, /\bwindow\b/, /\bdocument\b/, /\bTHREE\b/,
    /\bsetTimeout\b/, /\bsetInterval\b/, /\bsetImmediate\b/, /\brequestAnimationFrame\b/, /\bcrypto\b/,
    /\bprocess\b/, /\bhrtime\b/, /\bglobalThis\b/, /\bglobal\b/, /\brequire\s*\(/, /\bimport\s*\(/,
    /\bnavigator\b/, /\blocalStorage\b/,
  ];
  const files = readdirSync(SIM_DIR).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 10);
  for (const f of files) {
    const src = readFileSync(join(SIM_DIR, f), 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]/gm)) assert.ok(m[1].startsWith('./'), `${f} imports non-sim module ${m[1]}`);
    if (f === 'cli.js') continue; // the node entry point may read argv
    for (const re of forbidden) assert.ok(!re.test(src), `${f} contains forbidden ${re}`);
  }
});

test('CLI stdout is byte-identical across runs', () => {
  const run = () => execFileSync(process.execPath, [join(SIM_DIR, 'cli.js'), '--seed', '42', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 25 });
  assert.equal(run(), run());
});

test('SIM_HASH in show/simHash.js matches the sim sources (run `npm run simhash` after changing sim/)', () => {
  assert.equal(SIM_HASH, computeSimHash());
});

test('a whole show simulates in well under a second', () => {
  const t0 = process.hrtime.bigint();
  simulateShow({ seeds: showSeeds(99), entrants: ids(0, 16) });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 1000, `took ${ms.toFixed(0)} ms`);
});
