// The Scrivener: FSM + attack timeline runner. Owner: tells. Pure (no DOM).
//
// States: idle, walk, tell, active, recovery, stagger, phase_change, dead
// Phase 2 (hp <= 50%): everything plays BOSS.phaseSpeed[2] faster and page_storm unlocks.
//
// The match's temper (src/sim/loadout.js TEMPERS) lives in `b.temper` / `b.mods` (plain data):
// damage, recovery and idle multipliers, attack weights and cooldowns, write time.
// Each attack that reaches its tell is one exchange (one stroke of the name): `w.exch`.
//
// Attack-local time: `b.stateT * bossSpeed(b)` = unscaled ms into the current state,
// which is what the attack table in attacks.js is written in.

import { ARENA } from '../core/constants.js';
import { clamp, approach } from '../core/math.js';
import { emit } from '../core/events.js';
import { rand, range, weighted } from '../core/rng.js';
import { ATTACKS, ATTACK_IDS } from './attacks.js';
import { spawnHazard, removeHazards } from './combat.js';
import { TEMPERS, CHARMS } from './loadout.js';

export const BOSS = {
  maxHp: 380,      // (show) was 760 for open-ended fights; an attempt is now six exchanges
  maxPoise: 100,
  halfW: 65,
  height: 340,
  walk: 115,
  backstep: 90,
  poiseRegenDelay: 3000,
  poiseRegen: 30,
  staggerMs: 2800,
  phaseChangeMs: 2200,
  phaseSpeed: { 1: 1, 2: 1.15 },
  idleMs: { 1: [650, 1250], 2: [350, 800] },
  approachTimeoutMs: 2200,
  dmgMul: 2.3,     // (show) all its hits, on top of the attack table and the temper
  landedRecoveryMul: 0.2, // (show) an attack that drew blood leaves only a sliver of the punish window
  staggerDmgMul: 2, // (show) damage it takes while staggered (was 1.5)
};

// Temper (and the Reading Lens charm) as plain multipliers. Missing fields default to neutral.
export function temperMods(temper, loadout) {
  const T = (TEMPERS[temper] && TEMPERS[temper].mods) || {};
  const m = {
    dmgMul: T.dmgMul || 1, recoveryMul: T.recoveryMul || 1, idleMul: T.idleMul || 1,
    lightMul: T.lightMul || 1, heavyMul: T.heavyMul || 1, spellMul: T.spellMul || 1,
    fireMul: T.fireMul || 1, backMul: T.backMul || 1, writeMul: T.writeMul || 1,
    weights: { ...(T.weights || {}) }, cooldownMul: { ...(T.cooldownMul || {}) },
    curseMul: T.curseMul || 1, curseHits: T.curseHits || 1, curseHeal: T.curseHeal || 0, curseSure: !!T.curseSure, pageMul: T.pageMul || 1, stormPhase1: !!T.stormPhase1, noBackStrikes: !!T.noBackStrikes, hpMul: T.hpMul || 1,
  };
  const ch = loadout && CHARMS[loadout.charm];
  if (ch && ch.recoveryMul) m.recoveryMul *= ch.recoveryMul;
  return m;
}

export function createBoss(x = 900, { temper = null, mods = null } = {}) {
  const M = mods || temperMods(temper, null);
  const maxHp = Math.round(BOSS.maxHp * M.hpMul);
  return {
    x, y: 0, vx: 0, facing: -1,
    temper: TEMPERS[temper] ? temper : null, mods: M,
    hp: maxHp, maxHp,
    poise: BOSS.maxPoise, maxPoise: BOSS.maxPoise, poiseT: 9999,
    phase: 1,
    state: 'idle', stateT: 0, idleMs: 900,
    attackId: null, planned: null, lastAttack: null,
    fired: {}, cooldowns: {},
    recoveryMs: 0,
    strikeX: x,          // boss x when the active phase began (render: lunge skid, strike trails)
    curseBroken: false, curseHitsN: 0, writing: false, stormN: 0, landed: false,
    invuln: false,
    staggerMs: BOSS.staggerMs, // length of the current stagger (Binder's Knot binds for less)
    bound: false,        // the current stagger is Binder's Knot
    hexMs: 0,            // Hex: takes more damage while > 0
    burnMs: 0, burnDps: 0, burnAcc: 0, burnTickT: 0, // burning (fire damage over time)
    aiLock: false,       // scenarios: never pick attacks on its own
    forceAttack: null,   // scenarios: start this attack next
  };
}

export const bossSpeed = (b) => BOSS.phaseSpeed[b.phase] || 1;
export const attackLocalMs = (b) => b.stateT * bossSpeed(b);

function setState(b, s) { b.state = s; b.stateT = 0; }

function faceAgent(w, b) {
  const d = w.agent.x - b.x;
  if (Math.abs(d) > 4) b.facing = d > 0 ? 1 : -1;
}

const inRange = (atk, dist) => dist >= atk.range[0] && dist <= atk.range[1];

export const attackAllowed = (b, atk) => atk.phases.includes(b.phase) || (atk.id === 'page_storm' && b.mods && b.mods.stormPhase1);

function chooseAttack(w, b, dist) {
  const W = (b.mods && b.mods.weights) || {};
  const cands = ATTACK_IDS.map((id) => ATTACKS[id])
    .filter((a) => attackAllowed(b, a) && (b.cooldowns[a.id] || 0) <= 0);
  const near = cands.filter((a) => inRange(a, dist));
  const pool = near.length ? near : cands;
  return weighted(w.rng, pool, (a) => a.weight * (W[a.id] || 1) * (a.id === b.lastAttack ? 0.35 : 1));
}

export function beginTell(w, b, atk) {
  setState(b, 'tell');
  faceAgent(w, b); // facing is LOCKED from here until the attack ends
  b.attackId = atk.id;
  b.lastAttack = atk.id;
  b.planned = null;
  b.fired = {};
  b.curseBroken = false;
  b.curseHitsN = 0;
  b.writing = false;
  b.stormN = 0;
  b.landed = false;
  b.vx = 0;
  b.cooldowns[atk.id] = atk.cooldownMs * ((b.mods && b.mods.cooldownMul[atk.id]) || 1);
  emit(w, 'boss.tell', { attackId: atk.id, pose: atk.tell.poseDescription, phase: b.phase, x: b.x });
  // one more stroke of the name
  w.exch = (w.exch || 0) + 1;
  emit(w, 'name.stroke', { k: w.exch, strokes: w.strokes, attackId: atk.id });
}

// The decision freeze starts a little into the tell, once the pose is readable.
export const thinkAtMs = (atk) => Math.min(260, atk.tell.ms * 0.35);

export function updateBoss(w, b, dt) {
  b.stateT += dt;
  b.poiseT += dt;
  for (const k in b.cooldowns) b.cooldowns[k] -= dt;
  if (b.hexMs > 0) b.hexMs = Math.max(0, b.hexMs - dt);
  if (b.state === 'dead') { b.vx = 0; b.y = approach(b.y, 0, 300 * dt / 1000); return; }

  if (b.state !== 'stagger' && b.poiseT > BOSS.poiseRegenDelay && b.poise < b.maxPoise) {
    b.poise = Math.min(b.maxPoise, b.poise + BOSS.poiseRegen * dt / 1000);
  }

  const a = w.agent;
  const dist = Math.abs(a.x - b.x);
  const spd = bossSpeed(b);
  const atk = b.attackId ? ATTACKS[b.attackId] : null;

  switch (b.state) {
    case 'idle': {
      b.vx = 0;
      faceAgent(w, b);
      if (w.outcome) break;
      if (w.strokes && (w.exch || 0) >= w.strokes) break; // the name is finished: no more attacks
      if (b.aiLock && !b.forceAttack) break;
      if (b.forceAttack || b.stateT >= b.idleMs) {
        const next = b.forceAttack ? ATTACKS[b.forceAttack] : chooseAttack(w, b, dist);
        const forced = !!b.forceAttack;
        b.forceAttack = null;
        if (forced || inRange(next, dist)) beginTell(w, b, next);
        else { b.planned = next.id; setState(b, 'walk'); }
      }
      break;
    }
    case 'walk': {
      faceAgent(w, b);
      if (w.outcome) { setState(b, 'idle'); break; }
      const want = ATTACKS[b.planned];
      if (inRange(want, dist)) { beginTell(w, b, want); break; }
      if (b.stateT >= BOSS.approachTimeoutMs) {
        const fallback = ATTACK_IDS.map((id) => ATTACKS[id])
          .find((x) => attackAllowed(b, x) && inRange(x, dist) && (b.cooldowns[x.id] || 0) <= 0);
        beginTell(w, b, fallback || want);
        break;
      }
      if (dist > want.range[1]) b.vx = BOSS.walk * b.facing * spd;
      else b.vx = -BOSS.backstep * b.facing * spd;
      break;
    }
    case 'tell': {
      b.vx = 0;
      if (!b.fired.think && attackLocalMs(b) >= thinkAtMs(atk)) {
        b.fired.think = 1;
        if (w.decisions && !w.outcome) {
          w.thinking = { attackId: atk.id, pose: atk.tell.poseDescription, startT: w.t, elapsed: 0, k: w.exch, strokes: w.strokes };
        }
      }
      if (attackLocalMs(b) >= atk.tell.ms) {
        setState(b, 'active');
        b.strikeX = b.x;
        emit(w, 'boss.active', { attackId: atk.id, x: b.x, facing: b.facing });
      }
      break;
    }
    case 'active':
      runActive(w, b, atk, spd, dt);
      break;
    case 'recovery': {
      b.vx = 0;
      if (attackLocalMs(b) >= b.recoveryMs) {
        setState(b, 'idle');
        const [lo, hi] = BOSS.idleMs[b.phase];
        b.idleMs = range(w.rng, lo, hi) * ((b.mods && b.mods.idleMul) || 1);
        emit(w, 'boss.ready', { attackId: b.attackId });
      }
      break;
    }
    case 'stagger': {
      b.vx = 0;
      if (b.stateT >= b.staggerMs) {
        b.poise = b.maxPoise;
        setState(b, 'idle');
        b.idleMs = 250;
        const wasBound = b.bound;
        b.bound = false;
        b.staggerMs = BOSS.staggerMs;
        emit(w, 'boss.stagger_end', { x: b.x, bound: wasBound });
      }
      break;
    }
    case 'phase_change': {
      b.vx = 0;
      if (b.stateT >= BOSS.phaseChangeMs) {
        b.phase = 2;
        b.invuln = false;
        b.poise = b.maxPoise;
        setState(b, 'idle');
        b.idleMs = 300;
        emit(w, 'boss.phase_end', { phase: 2 });
      }
      break;
    }
  }

  // hover (page storm)
  const floatTarget = atk && atk.float && (b.state === 'tell' || b.state === 'active') ? atk.float : 0;
  b.y = approach(b.y, floatTarget, 160 * dt / 1000);

  b.x = clamp(b.x + b.vx * dt / 1000, ARENA.left + BOSS.halfW, ARENA.right - BOSS.halfW);
}

function runActive(w, b, atk, spd, dt) {
  const at = attackLocalMs(b);
  const f = b.facing;
  const a = w.agent;

  b.vx = 0;
  for (const m of atk.motion || []) {
    if (at >= m.atMs && at < m.atMs + m.durMs) b.vx = m.vx * f * spd;
  }

  atk.hits.forEach((h, i) => {
    const key = 'h' + i;
    if (b.fired[key] || at < h.atMs) return;
    b.fired[key] = 1;
    spawnHazard(w, {
      kind: 'melee', owner: 'boss', attackId: atk.id, hitIndex: i, follow: true, facing: f,
      fx0: h.box.fx0, fx1: h.box.fx1, by0: h.box.y0, by1: h.box.y1,
      x0: 0, x1: 0, y0: 0, y1: 0, vx: 0, vy: 0,
      ttl: h.activeMs / spd, damage: h.damage * dmgMul(b), poise: h.poise, kb: h.kb, desc: h.desc, style: h.style || null,
    });
    emit(w, 'boss.strike', { attackId: atk.id, hit: i, x: b.x, facing: f });
  });

  (atk.spawns || []).forEach((s, i) => {
    const key = 's' + i;
    if (b.fired[key] || at < s.atMs) return;
    b.fired[key] = 1;
    if (s.fx < 0 && b.mods && b.mods.noBackStrikes) return; // Slow to Turn: nothing rises behind it
    const cx = b.x + s.fx * f;
    spawnHazard(w, {
      kind: s.kind, owner: 'boss', attackId: atk.id, hitIndex: i,
      x0: cx - s.w / 2, x1: cx + s.w / 2, y0: s.y, y1: s.y + s.h,
      vx: s.vx * f * spd, vy: (s.vy || 0) * spd,
      ttl: s.ttl / spd, damage: s.damage * dmgMul(b) * (s.kind === 'page' ? b.mods.pageMul : 1), poise: s.poise, kb: s.kb, desc: s.desc, spin: rand(w.rng), style: s.style || null,
    });
    emit(w, 'boss.spawn', { attackId: atk.id, kind: s.kind, x: cx, y: s.y });
  });

  if (atk.gust && !b.fired.gust && at >= atk.gust.atMs) {
    b.fired.gust = 1;
    spawnHazard(w, {
      kind: 'gust', owner: 'boss', attackId: atk.id, x0: b.x, x1: b.x, y0: 0, y1: 0, vx: 0, vy: 0,
      facing: f, push: atk.gust.push, reach: atk.gust.reach,
      ttl: atk.gust.durMs / spd, damage: 0, poise: 0, kb: 0,
    });
    emit(w, 'boss.gust', { attackId: atk.id, x: b.x, facing: f });
  }

  if (atk.curse) {
    const c = atk.curse;
    if (b.curseBroken) {
      b.writing = false;
      removeHazards(w, (h) => h.kind === 'detonation');
      setState(b, 'recovery');
      b.recoveryMs = c.brokenRecoveryMs * recMul(b);
      emit(w, 'boss.curse_broken', { x: b.x });
      return;
    }
    const writeMs = c.writeMs * ((b.mods && b.mods.writeMul) || 1);
    b.writing = at < writeMs;
    if (!b.fired.write) { b.fired.write = 1; emit(w, 'boss.write', { x: b.x, writeMs: writeMs / spd }); }
    if (!b.fired.det && at >= writeMs) {
      b.fired.det = 1;
      const d = c.det;
      spawnHazard(w, {
        kind: 'detonation', owner: 'boss', attackId: atk.id, followAgent: true,
        x0: a.x - d.w / 2, x1: a.x + d.w / 2, y0: 0, y1: d.h, vx: 0, vy: 0, w: d.w,
        delay: d.warnMs / spd, ttl: (d.warnMs + d.activeMs) / spd,
        damage: d.damage * dmgMul(b) * ((b.mods && b.mods.curseMul) || 1), poise: d.poise, kb: d.kb, desc: d.desc,
      });
      emit(w, 'boss.curse_detonate', { x: a.x });
      if (b.mods && b.mods.curseHeal > 0 && b.hp < b.maxHp) { // Counting Names: a finished name feeds it
        const before = b.hp;
        b.hp = Math.min(b.maxHp, b.hp + Math.round(b.mods.curseHeal * b.maxHp));
        emit(w, 'boss.heal', { x: b.x, amount: b.hp - before });
      }
    }
    // (tells r9) the ink ring slides with the challenger while the pen writes and through the
    // warning, then STOPS DEAD where they stand the instant it erupts: a roll timed to the
    // eruption carries them off the spot inside its i-frames (rolling too early just drags the
    // ring along; too late and the column is already up). Breaking the writing still works.
    if (b.fired.det && !b.fired.lock) {
      for (const h of w.hazards) {
        if (h.kind === 'detonation' && h.followAgent && h.age + dt >= h.delay) { h.followAgent = false; b.fired.lock = 1; }
      }
    }
  }

  if (atk.storm) {
    const s = atk.storm;
    if (at >= s.startMs && at < s.startMs + s.durMs) {
      const n = Math.floor((at - s.startMs) / s.everyMs);
      while (b.stormN <= n) { spawnStormWave(w, b, s, b.stormN, spd); b.stormN++; }
    }
  }

  const activeMs = atk.curse ? atk.activeMs - atk.curse.writeMs * (1 - ((b.mods && b.mods.writeMul) || 1)) : atk.activeMs;
  if (at >= activeMs) {
    setState(b, 'recovery');
    b.recoveryMs = atk.recoveryMs * recMul(b) * (b.landed ? BOSS.landedRecoveryMul : 1);
    b.vx = 0;
    b.writing = false;
    emit(w, 'boss.recover', { attackId: atk.id, recoveryMs: b.recoveryMs / spd, landed: b.landed });
  }
}

function spawnStormWave(w, b, s, idx, spd) {
  const a = w.agent;
  const outsideEye = (x) => Math.abs(x - b.x) > s.eye + s.w / 2;
  for (let k = 0; k < s.perSpawn; k++) {
    let x;
    if (k === 0 && idx % s.aimEvery === 0 && outsideEye(a.x)) x = a.x;
    else {
      for (let tries = 0; tries < 8; tries++) {
        x = range(w.rng, ARENA.left + 20, ARENA.right - 20);
        if (outsideEye(x)) break;
      }
      if (!outsideEye(x)) continue;
    }
    spawnHazard(w, {
      kind: 'storm_page', owner: 'boss', attackId: 'page_storm', hitIndex: idx,
      x0: x - s.w / 2, x1: x + s.w / 2, y0: s.fallFrom, y1: s.fallFrom + s.h,
      vx: 0, vy: -s.fallSpeed * spd, ttl: (s.fallFrom / s.fallSpeed) * 1000 / spd + 160,
      damage: s.damage * dmgMul(b) * b.mods.pageMul, poise: s.poise, kb: s.kb, desc: s.desc, spin: rand(w.rng),
    });
  }
  emit(w, 'boss.storm_wave', { n: idx });
}

const dmgMul = (b) => BOSS.dmgMul * ((b.mods && b.mods.dmgMul) || 1);
const recMul = (b) => (b.mods && b.mods.recoveryMul) || 1;

export function staggerBoss(w, b, ms = BOSS.staggerMs, bound = false) {
  removeHazards(w, (h) => h.follow || h.kind === 'detonation' || h.kind === 'gust');
  b.writing = false;
  b.vx = 0;
  b.staggerMs = ms;
  b.bound = bound;
  setState(b, 'stagger');
  emit(w, 'boss.stagger', { x: b.x, attackId: b.attackId, bound });
}

// Binder's Knot: cancels the attack in progress into a (shorter) stagger. Its pages and
// shockwaves already in the air are cut down too. Returns false when there was nothing to bind.
export function bindBoss(w, b, ms) {
  if (b.state === 'dead' || b.state === 'phase_change' || b.state === 'stagger') return false;
  removeHazards(w, (h) => h.owner === 'boss');
  emit(w, 'boss.bound', { x: b.x, attackId: b.attackId, ms });
  staggerBoss(w, b, ms, true);
  return true;
}

export function beginPhaseChange(w, b) {
  removeHazards(w, (h) => h.owner === 'boss');
  b.writing = false;
  b.vx = 0;
  b.invuln = true;
  setState(b, 'phase_change');
  faceAgent(w, b);
  spawnHazard(w, {
    kind: 'gust', owner: 'boss', attackId: 'phase', x0: b.x, x1: b.x, y0: 0, y1: 0, vx: 0, vy: 0,
    facing: b.facing, push: 520, reach: 700, ttl: 700, damage: 0, poise: 0, kb: 0,
  });
  emit(w, 'boss.phase', { phase: 2, x: b.x });
}

export function killBoss(w, b) {
  removeHazards(w, (h) => h.owner === 'boss');
  b.writing = false;
  b.vx = 0;
  b.invuln = true;
  setState(b, 'dead');
  w.outcome = 'boss_dead';
  emit(w, 'boss.death', { x: b.x });
}
