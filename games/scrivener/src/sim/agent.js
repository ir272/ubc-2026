// The challenger's body. Owner: sim. Pure (no DOM).
//
// The body only obeys an `input` object each tick (built by src/ai/reflex.js):
//   { move: -1|0|1, roll: -1|0|1, rollDist: px|null, jump: -1|0|1,
//     attack: bool, heavy: bool, guard: bool, cast: null|spellId|'hex', blink: bool }
// Directions are WORLD directions (-1 = left, +1 = right).
//
// States: idle, walk, roll, jump, light, heavy, guard, cast, blink, hitstun, dead
//
// Every agent carries its own derived stats (`a.stats`, plain data) built from its loadout by
// agentStats(): class base, weapon swings, charm and class passives. `AGENT` below is the base
// (the Duelist with the sabre) and stays exported for the renderer's animation timings.

import { ARENA } from '../core/constants.js';
import { clamp, easeOutQuad } from '../core/math.js';
import { emit } from '../core/events.js';
import { CLASSES, WEAPONS, SPELLS, CHARMS, normLoadout } from './loadout.js';

export const AGENT = {
  maxHp: 100,
  maxStamina: 100,
  halfW: 18,
  height: 88,
  walk: 250,
  roll: { ms: 460, dist: 230, maxDist: 330, iFrom: 70, iTo: 370, cost: 24, height: 44 }, // maxDist: a committed roll THROUGH the boss
  jump: { ms: 620, dist: 170, peak: 150, cost: 18, iFrom: 140, iTo: 380 }, // (show) a leap clears the hit at its height
  light: {
    windup: 150, active: 90, recovery: 260, cost: 14, chainOpen: 40,
    dmg: [11, 11, 15], poise: [9, 9, 14], step: 18,
    box: { fx0: 6, fx1: 105, y0: 10, y1: 120 },
  },
  heavy: {
    windup: 460, active: 110, recovery: 430, cost: 30, dmg: 30, poise: 30, step: 30,
    box: { fx0: 6, fx1: 118, y0: 0, y1: 140 },
  },
  blink: { ms: 420, at: 140, behind: 46 },
  guard: { take: 0.25, staminaPer: 1.1, detonation: 0.8, storm: 0.65, kbMul: 0.3, counter: 1.5 }, // counter: next strike after a clean block
  trade: { take: 0.75, dmgMul: 1.1 },
  hex: { castMs: 380, at: 240, ms: 9000, mul: 1.45, burn: { ms: 5000, dps: 6 } }, // the mark smoulders (fire)
  staminaRegen: 45,
  regenDelay: 600,
  hitInvuln: 420,
  hitstun: { light: 320, heavy: 650 }, // incoming poise >= 30 -> heavy (knockdown)
};

const copy = (o) => JSON.parse(JSON.stringify(o));

// Per-fighter stats: class base, modified by weapon, spell and charm. Plain data.
export function agentStats(loadout) {
  const L = normLoadout(loadout);
  const C = CLASSES[L.cls], Wp = WEAPONS[L.weapon], Sp = SPELLS[L.spell], Ch = CHARMS[L.charm];
  const s = copy(AGENT);
  s.maxHp = (C.hp || 100) + (Ch.hp || 0);
  s.walk = C.walk || AGENT.walk;
  s.light = { ...s.light, ...copy(Wp.light || {}) };
  s.heavy = { ...s.heavy, ...copy(Wp.heavy || {}) };
  if (C.strikeSpeed) {
    for (const k of ['light', 'heavy']) {
      s[k].windup = Math.round(s[k].windup * C.strikeSpeed);
      s[k].recovery = Math.round(s[k].recovery * C.strikeSpeed);
    }
  }
  if (C.roll) for (const k in C.roll) s.roll[k] += C.roll[k];
  if (Ch.roll) for (const k in Ch.roll) s.roll[k] += Ch.roll[k];
  if (Ch.jumpCost) s.jump.cost += Ch.jumpCost;
  if (Ch.blinkMs) s.blink.ms += Ch.blinkMs;
  s.strike = Wp.strike;                         // the Strike move's swing
  s.combos = s.light.dmg.length;                // hits in the light chain
  s.reach = (Wp.strike === 'heavy' ? s.heavy.box.fx1 : s.light.box.fx1) - 25; // edge gap a strike connects from
  s.lightReach = s.light.box.fx1 - 25;
  s.dmgMul = C.dmg || 1;
  s.riposte = C.riposte || 0;
  s.rage = C.rage || 0;
  s.spellPower = C.spellPower || 1;
  s.charges = (Sp.charges || 2) + (C.charges || 0);
  s.burn = Wp.burn ? copy(Wp.burn) : null;      // weapon hits set it burning
  s.emberBurn = Ch.burn ? copy(Ch.burn) : null; // every strike also burns
  s.quillMul = Wp.quillMul || 1;
  s.nib = L.charm === 'nib' ? { below: Ch.below, mul: Ch.mul } : null;
  s.seal = L.charm === 'seal';
  s.errorMul = C.errorMul || 1;
  s.curseTake = C.curseTake || 1;     // Archivist: share of the Written Name curse that lands
  return s;
}

export const NO_INPUT = Object.freeze({ move: 0, roll: 0, rollDist: null, jump: 0, attack: false, heavy: false, guard: false, cast: null, blink: false });

export function createAgent(id = 'claude', x = 340, loadout = null, opts = {}) {
  const L = normLoadout(loadout);
  const stats = agentStats(L);
  const handicap = clamp(opts.handicap || 0, 0, 0.4);
  return {
    id, x, y: 0, facing: 1,
    loadout: L, cls: L.cls, stats,
    hp: Math.round(stats.maxHp * (1 - handicap)), maxHp: stats.maxHp,
    stamina: stats.maxStamina, maxStamina: stats.maxStamina,
    charges: stats.charges, maxCharges: stats.charges,
    state: 'idle', stateT: 0,
    combo: 0, chainQueued: false, attackHitDone: false,
    rollDir: 1, rollDist: stats.roll.dist, rollFrom: x,
    jumpDir: -1, jumpFrom: x,
    iframes: false, invulnT: 0, staminaT: 9999,
    kbV: 0, hitstunMs: 0,
    castSpell: null, castDone: false,  // state 'cast': which spell (or 'hex'), and whether it took effect
    castFx: null,                      // spell taking effect this tick (consumed by combat.js)
    blinkFrom: x, blinkTo: x,          // state 'blink' (Margin Step)
    ward: 0,        // ms left on Blot's ink ward (absorbs the next blow)
    echo: 0,        // hits left that land twice (Echo)
    riposte: false, // Duelist: next strike after a clean dodge hits harder
    sealUsed: false,
    guardBlocks: 0,
    dead: false, godMode: false,
    plan: null,          // decision being executed (see world.applyDecision)
    mind: { aggression: 0.5 },
  };
}

function setState(a, s) { a.state = s; a.stateT = 0; }

function spend(a, cost) {
  a.stamina = Math.max(0, a.stamina - cost);
  a.staminaT = 0;
}

export function canAct(a) {
  return a.state === 'idle' || a.state === 'walk';
}

function faceBoss(w, a) {
  const d = w.boss.x - a.x;
  if (Math.abs(d) > 1) a.facing = d > 0 ? 1 : -1;
}

export function startRoll(w, a, dir, dist) {
  const R = a.stats.roll;
  setState(a, 'roll');
  a.rollDir = dir || a.facing;
  a.rollDist = dist == null ? R.dist : clamp(dist, 20, R.maxDist);
  a.rollFrom = a.x;
  a.facing = a.rollDir;
  spend(a, R.cost);
  emit(w, 'agent.roll', { dir: a.rollDir, x: a.x });
}

function startJump(w, a, dir) {
  setState(a, 'jump');
  a.jumpDir = dir || -a.facing;
  a.jumpFrom = a.x;
  spend(a, a.stats.jump.cost);
  emit(w, 'agent.jump', { dir: a.jumpDir, x: a.x });
}

function startLight(w, a, combo) {
  faceBoss(w, a);
  setState(a, 'light');
  a.combo = combo;
  a.chainQueued = false;
  a.attackHitDone = false;
  spend(a, a.stats.light.cost);
  emit(w, 'agent.attack', { kind: 'light', combo, x: a.x, facing: a.facing, weapon: a.loadout.weapon });
}

function startHeavy(w, a) {
  faceBoss(w, a);
  setState(a, 'heavy');
  a.attackHitDone = false;
  spend(a, a.stats.heavy.cost);
  const trade = !!(a.plan && !a.plan.done && a.plan.move === 'trade');
  emit(w, 'agent.attack', { kind: 'heavy', x: a.x, facing: a.facing, weapon: a.loadout.weapon, trade });
}

function startGuard(w, a) {
  faceBoss(w, a);
  setState(a, 'guard');
  emit(w, 'agent.guard', { x: a.x, blocked: false, up: true });
}

function startCast(w, a, spell) {
  faceBoss(w, a);
  setState(a, 'cast');
  a.castSpell = spell;
  a.castDone = false;
  if (spell !== 'hex') a.charges = Math.max(0, a.charges - 1);
  emit(w, 'agent.cast', { spell, x: a.x, facing: a.facing });
}

function startBlink(w, a) {
  const b = w.boss;
  setState(a, 'blink');
  a.castSpell = 'margin';
  a.charges = Math.max(0, a.charges - 1);
  const side = Math.sign(a.x - b.x) || -b.facing;
  const off = 65 + AGENT.halfW + a.stats.blink.behind; // BOSS.halfW literal (import cycle)
  let to = b.x - side * off;
  const lo = ARENA.left + AGENT.halfW, hi = ARENA.right - AGENT.halfW;
  if (to < lo || to > hi) to = clamp(to, lo, hi);
  a.blinkFrom = a.x;
  a.blinkTo = to;
  emit(w, 'agent.cast', { spell: 'margin', x: a.x, facing: a.facing });
  emit(w, 'agent.blink', { from: a.x, to });
}

const castMsOf = (spell) => (spell === 'hex' ? AGENT.hex.castMs : SPELLS[spell].castMs);
const castAtOf = (spell) => (spell === 'hex' ? AGENT.hex.at : SPELLS[spell].at);

function tryActions(w, a, input) {
  if (input.cast) { startCast(w, a, input.cast); return true; }
  if (input.blink) { startBlink(w, a); return true; }
  if (input.guard) { startGuard(w, a); return true; }
  if (input.roll && a.stamina > 0) { startRoll(w, a, input.roll, input.rollDist); return true; }
  if (input.jump && a.stamina > 0) { startJump(w, a, input.jump); return true; }
  if (input.heavy && a.stamina > 0) { startHeavy(w, a); return true; }
  if (input.attack && a.stamina > 0) { startLight(w, a, 0); return true; }
  return false;
}

export function updateAgent(w, a, input, dt) {
  const S = a.stats;
  a.stateT += dt;
  a.staminaT += dt;
  if (a.invulnT > 0) a.invulnT -= dt;
  if (a.ward > 0) a.ward = Math.max(0, a.ward - dt);
  a.iframes = false;
  if (a.state === 'dead') return;

  const L = S.light, Hv = S.heavy;
  switch (a.state) {
    case 'idle':
    case 'walk': {
      faceBoss(w, a);
      if (tryActions(w, a, input)) break;
      if (input.move) {
        if (a.state !== 'walk') setState(a, 'walk');
        a.x += input.move * S.walk * dt / 1000;
      } else if (a.state !== 'idle') setState(a, 'idle');
      break;
    }
    case 'roll': {
      const R = S.roll;
      const p = Math.min(1, a.stateT / R.ms);
      a.x = a.rollFrom + a.rollDir * a.rollDist * easeOutQuad(p);
      a.iframes = a.stateT >= R.iFrom && a.stateT <= R.iTo;
      if (p >= 1) setState(a, 'idle');
      break;
    }
    case 'jump': {
      const J = S.jump;
      const p = Math.min(1, a.stateT / J.ms);
      a.x = a.jumpFrom + a.jumpDir * J.dist * p;
      a.y = 4 * J.peak * p * (1 - p);
      a.iframes = a.stateT >= J.iFrom && a.stateT <= J.iTo;
      if (p >= 1) { a.y = 0; setState(a, 'idle'); emit(w, 'agent.land', { x: a.x }); }
      break;
    }
    case 'light': {
      const t = a.stateT;
      if (t < L.windup && t > L.windup - 70) a.x += a.facing * L.step * (dt / 70);
      if (input.attack && t >= L.windup - 60 && a.combo < S.combos - 1) a.chainQueued = true;
      const endActive = L.windup + L.active;
      if (t >= endActive + L.chainOpen && a.chainQueued && a.stamina > 0) { startLight(w, a, a.combo + 1); break; }
      if (t >= endActive && input.roll && a.stamina > 0) { startRoll(w, a, input.roll, input.rollDist); break; }
      if (t >= endActive + L.recovery) { a.combo = 0; setState(a, 'idle'); }
      break;
    }
    case 'heavy': {
      const t = a.stateT;
      if (t < Hv.windup && t > Hv.windup - 90) a.x += a.facing * Hv.step * (dt / 90);
      const endActive = Hv.windup + Hv.active;
      if (t >= endActive + 150 && input.roll && a.stamina > 0) { startRoll(w, a, input.roll, input.rollDist); break; }
      if (t >= endActive + Hv.recovery) setState(a, 'idle');
      break;
    }
    case 'guard': {
      faceBoss(w, a);
      if (!input.guard) setState(a, 'idle');
      break;
    }
    case 'cast': {
      if (!a.castDone && a.stateT >= castAtOf(a.castSpell)) {
        a.castDone = true;
        a.castFx = a.castSpell; // applied (and cleared) by combat.applyCasts this same tick
      }
      if (a.stateT >= castMsOf(a.castSpell)) setState(a, 'idle');
      break;
    }
    case 'blink': {
      const B = S.blink;
      a.iframes = true;
      if (a.stateT >= B.at && a.x !== a.blinkTo) { a.x = a.blinkTo; faceBoss(w, a); }
      if (a.stateT >= B.ms) { faceBoss(w, a); setState(a, 'idle'); }
      break;
    }
    case 'hitstun': {
      a.x += a.kbV * dt / 1000;
      a.kbV *= Math.pow(0.0015, dt / 1000);
      if (a.y > 0) a.y = Math.max(0, a.y - 600 * dt / 1000);
      if (a.stateT >= a.hitstunMs) { a.y = 0; setState(a, 'idle'); }
      break;
    }
  }

  // stamina regen (not while committed to an action, nor behind the shield)
  if ((a.state === 'idle' || a.state === 'walk' || a.state === 'hitstun') && a.staminaT >= S.regenDelay) {
    a.stamina = Math.min(a.maxStamina, a.stamina + S.staminaRegen * dt / 1000);
  }

  // arena + body collision
  a.x = clamp(a.x, ARENA.left + AGENT.halfW, ARENA.right - AGENT.halfW);
  const b = w.boss;
  if (a.state !== 'roll' && a.state !== 'jump' && a.state !== 'blink' && b.state !== 'dead') {
    const minD = 65 + AGENT.halfW; // BOSS.halfW + AGENT.halfW (kept literal to avoid an import cycle)
    const d = a.x - b.x;
    if (Math.abs(d) < minD) {
      let side = d >= 0 ? 1 : -1;
      const target = b.x + side * minD;
      if (target < ARENA.left + AGENT.halfW || target > ARENA.right - AGENT.halfW) side = -side;
      a.x = clamp(b.x + side * minD, ARENA.left + AGENT.halfW, ARENA.right - AGENT.halfW);
    }
  }
}

export function agentHurtbox(a) {
  const h = a.state === 'roll' ? AGENT.roll.height : a.state === 'dead' ? 30 : AGENT.height;
  return { x0: a.x - AGENT.halfW, x1: a.x + AGENT.halfW, y0: a.y, y1: a.y + h };
}

// Returns the active weapon hitbox or null.
export function agentAttackBox(a) {
  let cfg = null;
  if (a.state === 'light') cfg = a.stats.light;
  else if (a.state === 'heavy') cfg = a.stats.heavy;
  if (!cfg) return null;
  if (a.stateT < cfg.windup || a.stateT > cfg.windup + cfg.active) return null;
  const { fx0, fx1, y0, y1 } = cfg.box;
  return a.facing > 0
    ? { x0: a.x + fx0, x1: a.x + fx1, y0: a.y + y0, y1: a.y + y1 }
    : { x0: a.x - fx1, x1: a.x - fx0, y0: a.y + y0, y1: a.y + y1 };
}

// The swing that is landing now, with the fighter's own multipliers (class, rage, nib, riposte,
// quill, trade). The boss's side (temper, hex, stagger, from behind) is applied in combat.js.
export function agentAttackStats(w, a) {
  const S = a.stats, b = w.boss;
  let kind, dmg, poise;
  if (a.state === 'light') { kind = 'light'; dmg = S.light.dmg[a.combo] || S.light.dmg[0]; poise = S.light.poise[a.combo] || S.light.poise[0]; }
  else if (a.state === 'heavy') { kind = 'heavy'; dmg = S.heavy.dmg; poise = S.heavy.poise; }
  else return null;
  let mul = S.dmgMul;
  if (S.rage) mul *= 1 + S.rage * (1 - a.hp / a.maxHp);
  if (S.nib && a.hp / a.maxHp < S.nib.below) mul *= S.nib.mul;
  if (S.quillMul > 1 && (b.state === 'tell' || b.writing)) mul *= S.quillMul;
  const trade = !!(a.plan && !a.plan.done && a.plan.move === 'trade' && kind === 'heavy');
  if (trade) mul *= S.trade.dmgMul;
  let riposte = false;
  if (a.riposte && S.riposte) { mul *= S.riposte; riposte = true; }
  else if (a.riposte && a.guardBlocks > 0) { mul *= S.guard.counter; riposte = true; }
  return { kind, dmg: dmg * mul, poise, riposte, trade };
}
