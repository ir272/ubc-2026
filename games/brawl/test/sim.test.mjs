// Ringout sim tests: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const simDir = path.join(here, '..', 'src', 'sim');
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
