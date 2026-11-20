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

test('six fighters, 18 moves each, named, with looks, bars 1..5', () => {
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
  assert.equal(sim.FIGHTER_IDS.length, 6);
  assert.equal(names.size, 18 * sim.FIGHTER_IDS.length, 'move names are unique');
  assert.equal(sim.FIGHTERS.kiln.name, 'The Empty Armour');
  assert.equal(sim.FIGHTERS.tick.name, 'The Magpie');
  assert.equal(sim.FIGHTERS.hexer.name, 'The Hexer');
  assert.equal(sim.FIGHTERS.mimic.name, 'The Mimic');
  assert.equal(sim.FIGHTERS.gantry.name, 'The Count');
  assert.equal(sim.FIGHTERS.vise.name, 'The Wolf');
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
    const h = sim.makeHeader(SEED + k, [sim.FIGHTER_IDS[k % sim.FIGHTER_IDS.length], sim.FIGHTER_IDS[(k + 1) % sim.FIGHTER_IDS.length]]);
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
    const h = sim.makeHeader(SEED + 'ov' + k, [sim.FIGHTER_IDS[k % sim.FIGHTER_IDS.length], sim.FIGHTER_IDS[(k + 1) % sim.FIGHTER_IDS.length]]);
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
    const h = sim.makeHeader(SEED + 'hl' + k, [sim.FIGHTER_IDS[k % sim.FIGHTER_IDS.length], sim.FIGHTER_IDS[(k + 2) % sim.FIGHTER_IDS.length]]);
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

// ---- round 3: abilities ----

const engine = await import(path.join(simDir, 'engine.ts'));

test('version is ringout-sim-6', () => {
  assert.equal(sim.SIM_VERSION, 'ringout-sim-6');
});

test('the new tools are used and the same seed gives the same hash', () => {
  const seen = { blink: 0, snare: 0, fan: 0, bat: 0 };
  for (const [fa, fb, ca, cb] of [['tick', 'vise', 'rush', 'rush'], ['gantry', 'kiln', 'keepaway', 'bait'], ['vise', 'gantry', 'rush', 'bait']]) {
    const h = sim.makeHeader(SEED + fa, [fa, fb]);
    const hashes = [];
    for (let run = 0; run < 2; run++) {
      const r = sim.runFight(h, { coaches: [ca, cb], onTick(s, ev) {
        if (run === 0) for (const e of ev) { if (seen[e.t] !== undefined) seen[e.t]++; if (e.t === 'projectile' && e.kind === 'knife') seen.fan++; if (e.t === 'projectile' && e.kind === 'bat') seen.bat++; }
      } });
      hashes.push(sim.hashFight(r.state || (() => { const s = sim.createFight(h); for (const p of r.plans) sim.schedulePlan(s, p); while (s.phase !== 'over') sim.stepFight(s, h); return s; })()));
    }
    assert.equal(hashes[0], hashes[1], `${fa} vs ${fb} hash`);
  }
  for (const k of Object.keys(seen)) assert.ok(seen[k] > 0, `no ${k} events`);
});

test('a blink never takes a fighter off the deck or toward a blast zone', () => {
  const h = sim.makeHeader(SEED + 'bl', ['tick', 'kiln']);
  // grounded at the edge, facing out: it stops short of the ledge
  let s = sim.createFight(h);
  for (let i = 0; i < 30; i++) sim.stepFight(s, h);
  let f = s.fighters[0];
  f.x = 7.4; f.facing = 1; f.action = 'idle';
  s.fighters[1].x = -5;
  engine.startMove(s, 0, f, s.ctl.eng[0], 'special2', engine.newInput(), []);
  let blinks = 0;
  for (let i = 0; i < 12; i++) for (const e of sim.stepFight(s, h)) if (e.t === 'blink') { blinks++; assert.ok(e.toX <= sim.ARENA.main.x1, `blinked to ${e.toX}`); }
  assert.equal(blinks, 1);
  assert.ok(s.fighters[0].grounded && s.fighters[0].x <= sim.ARENA.main.x1);
  // in the air off the stage, facing out: never further out than it started
  s = sim.createFight(h);
  for (let i = 0; i < 30; i++) sim.stepFight(s, h);
  f = s.fighters[0];
  f.x = 9.4; f.y = 0.5; f.facing = 1; f.action = 'fall'; f.grounded = false; f.platform = -2;
  engine.startMove(s, 0, f, s.ctl.eng[0], 'special2', engine.newInput(), []);
  for (let i = 0; i < 12; i++) for (const e of sim.stepFight(s, h)) if (e.t === 'blink') assert.ok(e.toX <= e.fromX + 1e-9, `blinked out to ${e.toX}`);
  // and in real fights no blink ever ends past the blast lines or off the deck when grounded
  for (let k = 0; k < sim.FIGHTER_IDS.length; k++) {
    const hh = sim.makeHeader(SEED + 'blf' + k, ['tick', sim.FIGHTER_IDS[k]]);
    sim.runFight(hh, { coaches: [['rush', 'bait', 'keepaway', 'adaptive'][k], 'adaptive'], onTick(st, ev) {
      for (const e of ev) if (e.t === 'blink') {
        const b = sim.ARENA.blast;
        assert.ok(e.toX > b.left && e.toX < b.right && e.toY > b.bottom && e.toY < b.top, 'blink inside the blast lines');
        assert.ok(Math.abs(e.toX) <= Math.max(Math.abs(e.fromX), sim.ARENA.main.x1), 'never further off the deck');
      }
    } });
  }
});

test('a howled fighter cannot move or act until the root ends (unless hit), and a howl never launches', () => {
  let snares = 0;
  for (let k = 0; k < 6; k++) {
    const h = sim.makeHeader(SEED + 'sn' + k, ['vise', sim.FIGHTER_IDS[k % sim.FIGHTER_IDS.length]]);
    let watch = null;
    sim.runFight(h, { coaches: [['rush', 'wall', 'bait'][k % 3], 'adaptive'], onTick(s, ev) {
      for (const e of ev) {
        if (e.t === 'hit' && e.by === 0 && e.move === 'special2') {
          assert.equal(e.kb, 0, 'a howl never launches');
          assert.equal(s.fighters[e.to].tumble, false, 'a howl never tumbles');
        }
        if (e.t === 'snare') { snares++; watch = { side: e.to, x: s.fighters[e.to].x, until: e.tick + e.ticks, at: e.tick, air: !s.fighters[e.to].grounded }; }
      }
      if (!watch) return;
      const f = s.fighters[watch.side];
      const hitNow = ev.some((e) => ((e.t === 'hit' || e.t === 'grab') && e.to === watch.side && e.tick > watch.at) || e.t === 'ko' || e.t === 'end');
      if (hitNow || !f.rooted) { if (!hitNow && s.tick < watch.until - 1) assert.fail(`root ended early at ${s.tick}, until ${watch.until}`); watch = null; return; }
      assert.equal(f.action, 'hitstun', 'rooted fighters are stuck');
      // one howled in the air drops straight down and may be nudged apart from a body on landing; from then on it stays put
      if (watch.air) { if (f.grounded) { watch.air = false; watch.x = f.x; } return; }
      assert.ok(Math.abs(f.x - watch.x) < 1e-9, 'rooted fighters do not move');
    } });
  }
  assert.ok(snares > 0, 'howls land');
});

test('a pounce ends in a grab with the opponent held adjacent in front, or a whiff', () => {
  let grabs = 0, whiffs = 0, cut = 0, pounces = 0;
  for (let k = 0; k < 6; k++) {
    const h = sim.makeHeader(SEED + 'po' + k, ['vise', sim.FIGHTER_IDS[k % sim.FIGHTER_IDS.length]]);
    let pending = false;
    sim.runFight(h, { coaches: [['rush', 'bait', 'keepaway'][k % 3], 'adaptive'], onTick(s, ev) {
      for (const e of ev) {
        if (e.t === 'move' && e.side === 0) {
          assert.ok(!pending, 'a pounce resolves before the next move');
          if (e.move === 'special') { pending = true; pounces++; }
          continue;
        }
        if (!pending) continue;
        if (e.t === 'grab' && e.by === 0) {
          grabs++; pending = false;
          if (ev.some((x) => x.t === 'hit' && x.to === 0)) continue; // struck on the very tick it caught: the hold is broken at once
          const a = s.fighters[0], b = s.fighters[1];
          const want = (sim.FIGHTERS[a.fighter].width + sim.FIGHTERS[b.fighter].width) * 0.5 + 0.05;
          assert.equal(b.action, 'held');
          assert.ok(Math.abs(Math.abs(b.x - a.x) - want) < 1e-6 && (b.x - a.x) * a.facing > 0, 'held in front, adjacent');
        } else if (e.t === 'whiff' && e.side === 0 && e.move === 'special') { whiffs++; pending = false; }
        else if ((e.t === 'hit' && e.to === 0) || e.t === 'clank' || e.t === 'ko' || e.t === 'end') { cut++; pending = false; } // struck out of it, or met by a grab
      }
    } });
  }
  assert.ok(pounces > 0 && grabs > 0, `pounces ${pounces}, grabs ${grabs}`);
  assert.equal(grabs + whiffs + cut, pounces, 'every pounce ends in a grab, a whiff, or the wolf struck out of it');
  assert.ok(whiffs > 0, 'a pounce can miss');
});

test('at most two bats of a Bat Swarm connect', () => {
  let volleys = 0, swarmHits = 0;
  for (let k = 0; k < 6; k++) {
    const h = sim.makeHeader(SEED + 'bat' + k, ['gantry', sim.FIGHTER_IDS[k % sim.FIGHTER_IDS.length]]);
    let last = -100, hits = 0;
    sim.runFight(h, { coaches: [['keepaway', 'bait', 'rush'][k % 3], 'adaptive'], onTick(s, ev) {
      for (const e of ev) {
        if (e.t === 'projectile' && e.side === 0 && e.kind === 'bat') {
          if (e.tick - last > 8) { volleys++; hits = 0; }
          last = e.tick;
        }
        if (e.t === 'hit' && e.by === 0 && e.via === 'special') { hits++; swarmHits++; assert.ok(hits <= 2, `${hits} bats of one volley landed`); }
      }
    } });
  }
  assert.ok(volleys > 0 && swarmHits > 0, `volleys ${volleys}, hits ${swarmHits}`);
});

test('one floor hazard per owner at any time (a ward lent to a spare fighter)', () => {
  // no fighter of the current cast lays a floor hazard; the mechanic stays in the engine, so lend one a ward
  const lent = { id: 'special2', name: 'Lent Ward', look: 'test only', kind: 'special', startup: 12, active: 1, recovery: 20, hitboxes: [],
    projectile: { frame: 12, kind: 'ward', vx: 0, vy: 0, gravity: 0, life: 600, r: 0.4, damage: 4, angle: 80, bkb: 20, kbg: 10,
      effect: 'snare', effectTicks: 40, linger: 600, place: 1.5 } };
  const kiln = sim.FIGHTERS.kiln.moves;
  const own = kiln.special2;
  kiln.special2 = lent;
  try {
    const h = sim.makeHeader(SEED + 'hz', ['kiln', 'tick']);
    const s = sim.createFight(h);
    for (let i = 0; i < 30; i++) sim.stepFight(s, h);
    let placed = 0;
    const check = () => {
      const n = [0, 0];
      for (const p of s.projectiles) if (p.floor) n[p.owner]++;
      assert.ok(n[0] <= 1 && n[1] <= 1, `hazards ${n}`);
    };
    for (const x of [-3, 2]) {
      const f = s.fighters[0];
      f.x = x; f.facing = 1; f.action = 'idle'; f.move = null;
      s.fighters[1].x = -7;
      engine.startMove(s, 0, f, s.ctl.eng[0], 'special2', engine.newInput(), []);
      for (let i = 0; i < 40; i++) { for (const e of sim.stepFight(s, h)) if (e.t === 'hazard' && e.state === 'placed') placed++; check(); }
    }
    assert.equal(placed, 2, 'both wards were laid');
    const floor = s.projectiles.filter((p) => p.floor && p.owner === 0);
    assert.equal(floor.length, 1, 'the second ward replaced the first');
    assert.ok(floor[0].x > 0, `the newer ward is the one kept (at ${floor[0].x})`);
  } finally {
    kiln.special2 = own;
  }
});

test('every fighter is deterministic: the same seed gives the same hash', () => {
  for (const fa of sim.FIGHTER_IDS) {
    const fb = sim.FIGHTER_IDS[(sim.FIGHTER_IDS.indexOf(fa) + 1) % sim.FIGHTER_IDS.length];
    const h = sim.makeHeader(SEED + 'det' + fa, [fa, fb]);
    const hashes = [];
    for (let run = 0; run < 2; run++) {
      const s = sim.createFight(h);
      for (let i = 0; i < 3000 && s.phase !== 'over'; i++) sim.stepFight(s, h);
      hashes.push(sim.hashFight(s));
    }
    assert.equal(hashes[0], hashes[1], `${fa} vs ${fb}`);
  }
});

test('a tongue pull ends with the opponent held adjacent in front of the Mimic', () => {
  let pulls = 0;
  for (let k = 0; k < 8; k++) {
    const h = sim.makeHeader(SEED + 'tg' + k, ['mimic', sim.FIGHTER_IDS[k % sim.FIGHTER_IDS.length]]);
    let pending = -1;
    sim.runFight(h, { coaches: [['rush', 'bait', 'keepaway', 'adaptive'][k % 4], 'adaptive'], onTick(s, ev) {
      for (const e of ev) {
        if (e.t === 'projectile' && e.side === 0) assert.ok(e.kind === 'tongue', `mimic shot ${e.kind}`);
        if (e.t === 'pull' && e.by === 0) pending = e.tick;
        if (e.t === 'grab' && e.by === 0 && pending >= 0) {
          pending = -1;
          if (ev.some((x) => x.t === 'hit' && x.to === 0)) continue;
          pulls++;
          const a = s.fighters[0], b = s.fighters[1];
          const want = (sim.FIGHTERS[a.fighter].width + sim.FIGHTERS[b.fighter].width) * 0.5 + 0.05;
          assert.equal(b.action, 'held');
          assert.ok(Math.abs(Math.abs(b.x - a.x) - want) < 1e-6 && (b.x - a.x) * a.facing > 0, 'held in front, adjacent');
        }
      }
    } });
  }
  assert.ok(pulls > 0, 'tongue pulls happen');
});

test('the Hexer lays wards that root, one at a time', () => {
  let roots = 0, placed = 0;
  for (let k = 0; k < 8; k++) {
    const h = sim.makeHeader(SEED + 'hw' + k, ['hexer', sim.FIGHTER_IDS[k % sim.FIGHTER_IDS.length]]);
    sim.runFight(h, { coaches: [['keepaway', 'wall', 'bait', 'adaptive'][k % 4], 'adaptive'], onTick(s, ev) {
      for (const e of ev) {
        if (e.t === 'hazard' && e.side === 0 && e.state === 'placed') { placed++; assert.equal(e.kind, 'ward'); }
        if (e.t === 'snare' && e.by === 0) { roots++; assert.ok(s.fighters[1].rooted > 0 || ev.some((x) => x.t === 'ko' || x.t === 'end')); }
      }
      let n = 0;
      for (const p of s.projectiles) if (p.floor && p.owner === 0) n++;
      assert.ok(n <= 1, `${n} wards down`);
    } });
  }
  assert.ok(placed > 0 && roots > 0, `placed ${placed}, roots ${roots}`);
});

test('the Magpie throws a fan of three knives', () => {
  const h = sim.makeHeader(SEED + 'mf', ['tick', 'hexer']);
  const s = sim.createFight(h);
  for (let i = 0; i < 30; i++) sim.stepFight(s, h);
  const f = s.fighters[0];
  f.x = -6; f.facing = 1; f.action = 'idle'; f.move = null;
  s.fighters[1].x = 6;
  engine.startMove(s, 0, f, s.ctl.eng[0], 'special', engine.newInput(), []);
  let knives = 0;
  for (let i = 0; i < 14; i++) for (const e of sim.stepFight(s, h)) if (e.t === 'projectile' && e.side === 0 && e.kind === 'knife') knives++;
  assert.equal(knives, 3);
});

test("the Armour's flame hits a grounded opponent and passes under one in the air", () => {
  for (const air of [false, true]) {
    const h = sim.makeHeader(SEED + 'fl', ['kiln', 'mimic']);
    const s = sim.createFight(h);
    for (let i = 0; i < 30; i++) sim.stepFight(s, h);
    const f = s.fighters[0], o = s.fighters[1];
    f.x = -4; f.facing = 1; f.action = 'idle'; f.move = null;
    engine.startMove(s, 0, f, s.ctl.eng[0], 'special', engine.newInput(), []);
    let hit = false, flames = 0;
    for (let i = 0; i < 90 && !hit; i++) {
      // the opponent held still: standing in hitstun on the deck, or in the air above the flame
      o.x = 1.5; o.action = 'hitstun'; o.hitstun = 99; o.move = null; o.vx = 0; o.vy = 0;
      if (air) { o.y = 1.6; o.grounded = false; o.platform = -2; } else { o.y = 0; o.grounded = true; o.platform = -1; }
      for (const e of sim.stepFight(s, h)) {
        if (e.t === 'projectile' && e.side === 0 && e.kind === 'flame') flames++;
        if (e.t === 'hit' && e.by === 0 && e.via === 'special') hit = true;
      }
    }
    assert.ok(flames >= 1, 'a flame was sent');
    assert.equal(hit, !air, air ? 'jumped over it' : 'hit on the ground');
  }
});
