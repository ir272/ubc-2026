// Ringout sim2 tests (the round-2 copy of the sim): node --test test/sim2.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const simDir = path.join(here, '..', 'src', 'sim2');
const sim = await import(path.join(simDir, 'index.ts'));

const SEED = '0123456789abcdef0123456789abcdef';

test('exports the API from ARCH.md', () => {
  for (const k of ['ARENA', 'FIGHTERS', 'createFight', 'stepFight', 'schedulePlan', 'coachView', 'hashFight', 'sanitizePlan', 'COACHES', 'simulate', 'SIM_VERSION']) {
    assert.ok(k in sim, `missing ${k}`);
  }
  for (const c of ['rush', 'keepaway', 'bait', 'wall', 'adaptive', 'random']) assert.ok(sim.COACHES[c], `coach ${c}`);
});

test('four fighters, 18 moves each, named, with looks, bars 1..5', () => {
  const names = new Set();
  for (const id of sim.FIGHTER_IDS) {
    const f = sim.FIGHTERS[id];
    assert.equal(Object.keys(f.moves).length, 18);
    for (const m of sim.MOVE_IDS) {
      const md = f.moves[m];
      assert.ok(md && md.name && md.look, `${id}.${m}`);
      assert.ok(md.startup >= 1 && md.active >= 1 && md.recovery >= 0);
      names.add(md.name);
    }
    for (const v of Object.values(f.stats)) assert.ok(v >= 1 && v <= 5 && Number.isInteger(v));
  }
  assert.equal(names.size, 72, 'move names are unique');
  assert.equal(sim.FIGHTERS.kiln.name, 'Kiln');
  assert.equal(sim.FIGHTERS.tick.name, 'Tick');
  assert.equal(sim.FIGHTERS.gantry.name, 'Gantry');
  assert.equal(sim.FIGHTERS.vise.name, 'Vise');
});

test('the sim source has no Math.random, Date, trig or pow', () => {
  for (const file of readdirSync(simDir).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(path.join(simDir, file), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const bad of ['Math.random', 'Date', 'Math.sin', 'Math.cos', 'Math.tan', 'Math.atan', 'Math.pow', 'Math.exp', 'Math.log', '**']) {
      assert.ok(!src.includes(bad), `${file} uses ${bad}`);
    }
  }
});

test('a fight with no plans runs to an end event', () => {
  const h = sim.makeHeader(SEED, ['kiln', 'vise']);
  const s = sim.createFight(h);
  let end = null;
  for (let i = 0; i < 20000 && !end; i++) for (const e of sim.stepFight(s, h)) if (e.t === 'end') end = e;
  assert.ok(end, 'fight ended');
  assert.equal(s.phase, 'over');
  assert.ok(s.winner === 0 || s.winner === 1);
});

test('state is plain JSON, hash is stable, round trip continues identically', () => {
  const h = sim.makeHeader(SEED, ['gantry', 'tick']);
  const hashes = [];
  const r = sim.runFight(h, { coaches: ['adaptive', 'random'], onTick(s) { hashes.push(sim.hashFight(s)); } });
  // the same header and plans give the same hash at every tick
  const s = sim.createFight(h);
  for (const p of r.plans) sim.schedulePlan(s, p);
  let i = 0;
  let mid = null;
  while (s.phase !== 'over') {
    sim.stepFight(s, h);
    assert.equal(sim.hashFight(s), hashes[i], `tick ${s.tick}`);
    if (s.tick === 900) mid = JSON.stringify(s);
    i++;
  }
  assert.equal(i, hashes.length);
  const s2 = JSON.parse(mid);
  while (s2.phase !== 'over') {
    sim.stepFight(s2, h);
    assert.equal(sim.hashFight(s2), hashes[s2.tick - 1], `round trip tick ${s2.tick}`);
  }
});

test('every lethal hit becomes a knockout of that fighter', () => {
  for (let k = 0; k < 6; k++) {
    const h = sim.makeHeader(SEED + k, [sim.FIGHTER_IDS[k % 4], sim.FIGHTER_IDS[(k + 1) % 4]]);
    const lethal = [];
    sim.runFight(h, {
      coaches: ['adaptive', 'rush'],
      onTick(s, ev) {
        for (const e of ev) {
          if (e.t === 'hit' && e.strength === 'lethal') lethal.push({ to: e.to, tick: e.tick });
          if (e.t === 'ko') {
            const i = lethal.findIndex((l) => l.to === e.side);
            if (i >= 0) lethal.splice(i, 1);
          }
        }
      },
    });
    assert.equal(lethal.length, 0, `lethal hits without a knockout: ${JSON.stringify(lethal)}`);
  }
});

test('sanitizePlan repairs junk', () => {
  const prev = { ...sim.DEFAULT_PLAN, stance: 'wall', read: 'old' };
  const p1 = sim.sanitizePlan('Sure! Here is my plan: {"Stance": "RUSH", "aggression": "80%", "Range": "Close", "grab_mix": "0.6", "edge": "go deep", "recover": "HIGH", "order": "Kill!", "read": "He is slow on the ledge so we press the advantage hard right now"} hope it helps', prev);
  assert.equal(p1.stance, 'rush');
  assert.equal(p1.aggression, 0.8);
  assert.equal(p1.range, 'close');
  assert.equal(p1.grabMix, 0.6);
  assert.equal(p1.edge, 'deep');
  assert.equal(p1.recover, 'high');
  assert.equal(p1.order, 'kill');
  assert.ok(p1.read.split(/\s+/).length <= 8);
  const p2 = sim.sanitizePlan({ stance: 'zoning', aggression: 7 }, prev);
  assert.equal(p2.stance, 'keepaway');
  assert.equal(p2.aggression, 0.7);
  assert.equal(p2.range, prev.range);
  assert.equal(p2.order, 'none');
  const p3 = sim.sanitizePlan(null, prev);
  assert.equal(p3.stance, 'wall');
  const p4 = sim.sanitizePlan('total nonsense', prev);
  assert.equal(p4.stance, 'wall');
  const p5 = sim.sanitizePlan({ stance: 42, aggression: 'NaN', grabMix: -3, read: 12 }, prev);
  assert.equal(p5.stance, 'wall');
  assert.equal(p5.grabMix, 0);
  assert.ok(typeof p5.read === 'string');
});

test('coachView never reads the opponent plan', () => {
  const h = sim.makeHeader(SEED, ['tick', 'gantry']);
  const s = sim.createFight(h);
  for (let i = 0; i < 700; i++) sim.stepFight(s, h);
  const a = JSON.stringify(sim.coachView(s, h, 0));
  s.plans[1] = { ...s.plans[1], stance: s.plans[1].stance === 'rush' ? 'wall' : 'rush', grabMix: 0.99, read: 'secret' };
  const b = JSON.stringify(sim.coachView(s, h, 0));
  assert.equal(a, b);
  assert.ok(!b.includes('secret'));
});

test('plans take effect at their tick and emit a plan event', () => {
  const h = sim.makeHeader(SEED, ['kiln', 'tick']);
  const s = sim.createFight(h);
  const plan = { ...sim.DEFAULT_PLAN, stance: 'rush', read: 'go' };
  sim.schedulePlan(s, { side: 1, tick: 30, plan });
  let seen = null;
  for (let i = 0; i < 40; i++) for (const e of sim.stepFight(s, h)) if (e.t === 'plan') seen = e;
  assert.ok(seen && seen.tick === 30 && seen.side === 1 && seen.plan.stance === 'rush');
  assert.equal(s.plans[1].stance, 'rush');
});

test('simulate returns the CONTRACT form and is deterministic', () => {
  const a = sim.simulate({ seed: SEED, entrants: [{ id: 'a' }, { id: 'b' }], options: { fighters: ['vise', 'kiln'] } });
  const b = sim.simulate({ seed: SEED, entrants: [{ id: 'a' }, { id: 'b' }], options: { fighters: ['vise', 'kiln'] } });
  assert.ok(a.durationMs > 0);
  assert.ok(Array.isArray(a.events) && a.events.length > 0);
  assert.ok(['a', 'b'].includes(a.result.winner));
  assert.equal(a.result.hash, b.result.hash);
});

test('a full fight simulates fast', () => {
  const h = sim.makeHeader(SEED + 'fast', ['tick', 'vise']);
  const t0 = performance.now();
  sim.runFight(h, { coaches: ['adaptive', 'adaptive'] });
  const ms = performance.now() - t0;
  assert.ok(ms < 300, `took ${ms} ms`);
});

// ---- round 2 ----

test('grounded bodies never overlap for more than two ticks, and walking keeps facing the opponent', () => {
  let longest = 0, back = 0, walks = 0;
  for (let k = 0; k < 6; k++) {
    const h = sim.makeHeader(SEED + 'ov' + k, [sim.FIGHTER_IDS[k % 4], sim.FIGHTER_IDS[(k + 1) % 4]]);
    let run = 0;
    sim.runFight(h, {
      coaches: [['rush', 'bait', 'keepaway'][k % 3], ['wall', 'rush', 'adaptive'][k % 3]],
      onTick(s) {
        const [a, b] = s.fighters;
        const free = (f) => !['held', 'holding', 'roll', 'getup', 'dead', 'respawn', 'ledgeclimb'].includes(f.action);
        const mg = (sim.FIGHTERS[a.fighter].width + sim.FIGHTERS[b.fighter].width) * 0.5;
        if (a.grounded && b.grounded && a.platform === b.platform && free(a) && free(b) && Math.abs(a.x - b.x) < mg * 0.95) run++; else run = 0;
        longest = Math.max(longest, run);
        for (const [f, o] of [[a, b], [b, a]]) if (f.action === 'walk') { walks++; if ((o.x - f.x) * f.facing < -0.3) back++; }
      },
    });
  }
  assert.ok(longest <= 2, `bodies overlapped for ${longest} ticks`);
  assert.ok(back / walks < 0.05, `walked with its back turned ${back} of ${walks} ticks`);
});

test('hit pause scales with strength', () => {
  const byStrength = { light: [], medium: [], heavy: [], lethal: [] };
  for (let k = 0; k < 6; k++) {
    const h = sim.makeHeader(SEED + 'hl' + k, [sim.FIGHTER_IDS[k % 4], sim.FIGHTER_IDS[(k + 2) % 4]]);
    sim.runFight(h, { coaches: ['rush', 'bait'], onTick(s, ev) { for (const e of ev) if (e.t === 'hit' && e.kb > 0) byStrength[e.strength].push(e.hitlag); } });
  }
  const within = (a, lo, hi) => a.every((x) => x >= lo && x <= hi);
  assert.ok(within(byStrength.light, 3, 6), 'light 3 to 6 (3 for the early hits of a multi-hit)');
  assert.ok(within(byStrength.medium, 3, 10), 'medium up to 10');
  assert.ok(byStrength.heavy.every((x) => x === 3 || x >= 11 && x <= 14), 'heavy 11 to 14 (3 for the early hits of a multi-hit)');
  assert.ok(byStrength.lethal.every((x) => x === 18), 'lethal 18');
});

test('the coach view reads a held stance, fills habits and since', () => {
  const h = sim.makeHeader(SEED + 'cv', ['gantry', 'kiln']);
  let v = null;
  sim.runFight(h, { coaches: ['adaptive', 'wall'], onTick(s) { if (s.tick === 1440) v = sim.coachView(s, h, 0); } });
  assert.ok(v, 'view taken');
  assert.ok(['rush', 'keepaway', 'bait', 'wall', 'unclear'].includes(v.oppLooksLike));
  for (const k of ['approaches', 'retreats', 'strikes', 'grabs', 'shields', 'dodges', 'shots', 'jumps', 'recoveredHigh', 'recoveredLow']) assert.ok(Number.isFinite(v.oppHabits[k]) && v.oppHabits[k] >= 0, k);
  assert.ok(v.since.ticks >= 0 && Number.isFinite(v.since.dealt) && Number.isFinite(v.since.taken));
});

test('a grab out of a run comes after a short skid', () => {
  const h = sim.makeHeader(SEED + 'dg', ['vise', 'kiln']);
  let seen = 0;
  sim.runFight(h, { coaches: [{ stance: 'rush', aggression: 0.8, range: 'close', grabMix: 0.9, edge: 'stage', recover: 'high' }, 'wall'].map((c) => {
    if (typeof c === 'string') return c;
    const k = 'test-grabber'; sim.COACHES[k] = { id: k, decide: () => ({ ...sim.DEFAULT_PLAN, ...c }) }; return k;
  }), onTick(s, ev) { for (const e of ev) if (e.t === 'move' && e.move === 'grab' && e.side === 0 && s.ctl.eng[0].pendGrab === 0) seen++; } });
  assert.ok(seen > 0, 'grabs happen');
});
