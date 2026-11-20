// Reflex layer + decision executor. Owner: sim. PURE (runs inside the sim, every tick).
//
// agentController(w) -> input for src/sim/agent.js.
//   1. If a decision plan is live (boss mid tell/active), execute it at plan.fireAt.
//   2. Otherwise reflexes: punish recovery/stagger with the weapon, keep spacing.
// Reads the fighter's own stats (a.stats). Uses w.rng only, so it stays deterministic and
// look-ahead safe. No healing here: healing is only the Mend spell, by decision.

import { ARENA } from '../core/constants.js';
import { clamp } from '../core/math.js';
import { rand } from '../core/rng.js';
import { AGENT, canAct } from '../sim/agent.js';
import { BOSS, bossSpeed } from '../sim/boss.js';

// edge-to-edge gap at which the base sabre's light attack connects (each fighter: a.stats.reach)
export const REACH_GAP = 80;

const blank = () => ({ move: 0, roll: 0, rollDist: null, jump: 0, attack: false, heavy: false, guard: false, cast: null, blink: false });

export function agentController(w) {
  const a = w.agent, b = w.boss;
  const inp = blank();
  if (a.dead || w.outcome) return inp;
  trackDecision(w, a);
  const dx = b.x - a.x;
  const dir = dx >= 0 ? 1 : -1;
  const gap = Math.abs(dx) - BOSS.halfW - AGENT.halfW;
  const bossBusy = b.state === 'tell' || b.state === 'active';

  const plan = a.plan;
  if (plan && !plan.done) {
    if (!bossBusy || w.t > plan.until) plan.done = true;
    else {
      executePlan(w, a, b, plan, inp, dir, gap);
      const striking = plan.action === 'attack' || plan.action === 'heavy' || plan.action === 'trade' || plan.action === 'guard' || (plan.after && plan.fired);
      if (plan.fired && !striking) followUp(w, a, b, inp, dir, gap);
      return inp;
    }
  }

  if (bossBusy || b.state === 'phase_change' || b.state === 'dead') {
    followUp(w, a, b, inp, dir, gap);
    return inp;
  }
  if (b.state === 'recovery' || b.state === 'stagger') return punish(w, a, b, inp, dir, gap);
  return neutral(w, a, b, inp, dir, gap);
}

// Records, on the live decision, what the body was doing when each hit landed.
function trackDecision(w, a) {
  const rec = w.current;
  if (!rec) return;
  if (rec.hpSeen == null) rec.hpSeen = a.hp;
  if (a.hp < rec.hpSeen - 0.01 && rec.prev) {
    const lh = w.log.lastHitBy || {};
    (rec.hits ||= []).push({ ...rec.prev, hitIndex: lh.hitIndex || 0, kind: lh.kind || '', desc: lh.desc || '' });
  }
  rec.hpSeen = a.hp;
  const b = w.boss;
  rec.prev = { state: a.state, stateT: Math.round(a.stateT), beforeFire: rec.firedAt == null, behind: Math.sign(a.x - b.x) === -b.facing };
}

function markFired(w) {
  const rec = w.current;
  if (rec && rec.firedAt == null) rec.firedAt = w.t;
}

// keep cutting: chain the light combo, or start one
function swing(a, inp, heavy) {
  if (heavy) { if (canAct(a)) inp.heavy = true; return; }
  if (a.state === 'light' && a.combo < a.stats.combos - 1) inp.attack = true;
  else if (canAct(a)) inp.attack = true;
}

// After the planned move is spent, while the boss is still mid-attack:
// cut it from behind if it is swinging the other way, otherwise keep out of reach.
function followUp(w, a, b, inp, dir, gap) {
  if (b.state !== 'active') return;
  const behind = Math.sign(a.x - b.x) !== b.facing;
  if (behind && gap <= a.stats.lightReach && a.stamina > 24) swing(a, inp, false);
}

// close the distance (walk, or roll when far and rested)
function closeIn(a, inp, dir, gap, reach) {
  if (!canAct(a)) return;
  if (gap > 240 && a.stamina > 45) { inp.roll = dir; inp.rollDist = clamp(gap - reach * 0.5, 40, a.stats.roll.dist); }
  else inp.move = dir;
}

function executePlan(w, a, b, plan, inp, dir, gap) {
  const act = plan.action;
  if (act === 'hold') return;

  if (act === 'guard') {
    if (w.t < plan.fireAt) return;
    if (a.state === 'guard' || canAct(a)) { inp.guard = true; if (!plan.fired) { plan.fired = true; markFired(w); } }
    return;
  }

  if (act === 'cast' && !plan.fired) {
    if (canAct(a)) { inp.cast = plan.spell; plan.fired = true; markFired(w); }
    return;
  }
  // Echo: once the cast is done, strike
  const strikeAs = act === 'cast' ? plan.after : act;
  if (act === 'cast' && (!strikeAs || a.state === 'cast')) return;

  if (strikeAs === 'attack' || strikeAs === 'heavy' || strikeAs === 'trade') {
    if (w.t < plan.fireAt) return;
    const heavy = strikeAs !== 'attack';
    const reach = heavy ? a.stats.heavy.box.fx1 - 25 : a.stats.lightReach;
    // engage: close the distance, then strike
    if (gap > reach) { closeIn(a, inp, dir, gap, reach); return; }
    if (heavy) {
      if (!plan.struck && canAct(a)) { inp.heavy = true; plan.struck = true; plan.fired = true; markFired(w); }
      return;
    }
    swing(a, inp, false);
    plan.fired = true;
    markFired(w);
    return;
  }

  if (w.t < plan.fireAt) return;
  if (plan.fired) return;
  if (!canAct(a)) {
    if (w.t > plan.fireAt + 400) plan.fired = true; // missed the moment
    return;
  }
  const R = a.stats.roll;
  switch (act) {
    case 'roll_away': inp.roll = -dir; break;
    case 'roll_toward': inp.roll = dir; inp.rollDist = clamp(gap - 6, 30, R.dist); break;
    // through means through: far enough to come out on its far side (when it can be reached)
    case 'roll_through': inp.roll = dir; inp.rollDist = clamp(Math.abs(b.x - a.x) + BOSS.halfW + AGENT.halfW + 24, R.dist, R.maxDist); break;
    case 'jump_back': inp.jump = -dir; break;
    case 'blink': inp.blink = true; break;
  }
  plan.fired = true;
  markFired(w);
}

function remainingMs(b) {
  return b.state === 'recovery'
    ? (b.recoveryMs - b.stateT * bossSpeed(b)) / bossSpeed(b)
    : b.staggerMs - b.stateT;
}

// Boss is recovering / staggered: the punish window. Close in and hit with the weapon,
// never starting a swing that would outlast the window, keeping a dodge's worth of stamina.
function punish(w, a, b, inp, dir, gap) {
  const S = a.stats;
  const remain = remainingMs(b);
  const R = S.roll;
  const heavyMain = S.strike === 'heavy';
  const reach = heavyMain ? S.heavy.box.fx1 - 25 : S.lightReach;
  if (a.state === 'light') {
    if (a.combo < S.combos - 1 && remain > S.light.windup + 200 && a.stamina >= S.light.cost + R.cost) inp.attack = true;
    return inp;
  }
  if (!canAct(a)) return inp;
  if (gap <= reach) {
    const Hv = S.heavy;
    if (heavyMain) {
      if (remain > Hv.windup + 120 && a.stamina >= Hv.cost * 0.6) inp.heavy = true;
      else if (remain > S.light.windup + 150 && gap <= S.lightReach && a.stamina >= S.light.cost) inp.attack = true;
      else if (remain < 300) backOff(w, a, inp, dir);
    } else if (b.state === 'stagger' && remain > Hv.windup + 650 && a.stamina >= Hv.cost + R.cost) inp.heavy = true;
    else if (remain > S.light.windup + 150 && a.stamina >= S.light.cost + 10) inp.attack = true;
    else if (remain < 300) backOff(w, a, inp, dir);
    return inp;
  }
  const travel = ((gap - reach + 10) / S.walk) * 1000;
  // far out after a dodge-away: close the gap with a roll so the cuts land early in the window
  if (gap > 190 && remain > R.ms + 450 && a.stamina >= R.cost * 2 + 14) {
    inp.roll = dir;
    inp.rollDist = clamp(gap - reach * 0.4, 60, R.dist);
    return inp;
  }
  if (remain > travel + 300) inp.move = dir;
  return inp;
}

function backOff(w, a, inp, dir) {
  const wallBehind = dir > 0 ? a.x - ARENA.left : ARENA.right - a.x;
  if (wallBehind > 90) inp.move = -dir;
}

// Boss idle / walking: hold a spacing just outside its sweep, and step away from a wall so
// there is room to roll.
function neutral(w, a, b, inp, dir, gap) {
  if (!canAct(a)) return inp;
  const wallBehind = dir > 0 ? a.x - ARENA.left : ARENA.right - a.x;
  if (wallBehind < 70 && gap < 160 && a.stamina > 40) { inp.roll = dir; return inp; }
  const aggr = (a.mind && a.mind.aggression) || 0.5;
  if (gap < a.stats.lightReach && a.stamina > 80 && b.state === 'walk' && rand(w.rng) < 0.02 * aggr) { inp.attack = true; return inp; }
  if (gap > 250) inp.move = dir;
  else if (gap < 120 && wallBehind > 90) inp.move = -dir;
  return inp;
}
