// The whole fight simulation. Owner: sim. PURE: no DOM, no window, no Math.random, no clock.
// Runs identically in the browser and in Node (tools/balance.mjs, src/sim/headless.js).
//
// World state is plain data: it survives structuredClone AND a JSON round trip with identical
// behaviour afterwards (no Infinity / NaN / functions / class instances / Maps).
//
//   const w = createWorld({ seed, agentId, loadout, temper, handicap, decisions: true });
//   stepWorld(w, TICK_MS, controller);      // controller(w) -> agent input (src/ai/reflex.js)
//   if (w.thinking) { ...ask a brain...; applyDecision(w, { slot, thought }, controller); }
//
// While w.thinking is set the world is frozen (stepWorld is a no-op apart from w.tick).
// Each boss attack that reaches its tell is one exchange: w.exch (1-based k). When exchange
// w.strokes has resolved (the boss is idle again) and the boss lives, w.outcome = 'written'.

import { TICK_MS } from '../core/constants.js';
import { makeRng, hash2 } from '../core/rng.js';
import { emit } from '../core/events.js';
import { createBoss, bossSpeed, attackLocalMs, BOSS, temperMods } from './boss.js';
import { createAgent, updateAgent, NO_INPUT, AGENT } from './agent.js';
import { updateBoss } from './boss.js';
import { updateHazards, resolveCombat, applyCasts, updateBolts, updateBurn } from './combat.js';
import { ATTACKS } from './attacks.js';
import { movesFor, normLoadout, CHARMS, TEMPERS, DEFAULT_LOADOUT } from './loadout.js';
import { STROKES } from '../show/rules.js';

export { TICK_MS };

const NEVER = 1e12; // "never" as a finite number (JSON-safe)

export function createWorld({
  seed = 1, agentId = 'claude', loadout = null, temper = null, handicap = 0,
  decisions = true, bossX = 900, agentX = 340,
} = {}) {
  const L = normLoadout(loadout || DEFAULT_LOADOUT);
  const T = TEMPERS[temper] ? temper : null;
  const strokes = STROKES + ((CHARMS[L.charm] && CHARMS[L.charm].strokes) || 0);
  return {
    seed,
    t: 0,          // combat time (ms); frozen during thinking + hit-stop
    tick: 0,       // stepWorld calls
    rng: makeRng(hash2(seed, 77)),
    boss: createBoss(bossX, { temper: T, mods: temperMods(T, L) }),
    agent: createAgent(agentId, agentX, L, { handicap }),
    hazards: [],
    bolts: [],     // the challenger's projectiles (Candleflame): { id, spell, x, y, vx, age, ttl, damage, burn }
    events: [],    // drained by the host after each tick
    nextId: 1,
    hitstop: 0,
    decisions,     // false = never freeze for a brain (scenarios, look-ahead)
    thinking: null,
    current: null, // decision record being played out
    outcome: null, // null | 'agent_dead' | 'boss_dead' | 'written'
    endT: 0,       // ms since outcome
    outcomeT: null, // w.t when the outcome happened: the fight's length (w.t runs on through the hold)
    exch: 0,       // exchanges so far (strokes of the name inked)
    strokes,       // strokes this name takes
    handicap,
    log: {
      decisions: [], damageTaken: 0, damageDealt: 0, dodges: 0, wardBlocks: 0,
      lastHitBy: null, killedBy: null, bossHpMin: 1, exchanges: 0,
    },
  };
}

export function stepWorld(w, dt, controller) {
  w.tick++;
  if (w.thinking) return;
  if (w.hitstop > 0) { w.hitstop -= dt; return; }
  w.t += dt;
  const prevBoss = w.boss.state;
  const input = controller && !w.outcome && !w.agent.dead ? controller(w) : NO_INPUT;
  updateAgent(w, w.agent, input, dt);
  applyCasts(w);
  updateBoss(w, w.boss, dt);
  updateHazards(w, dt);
  updateBolts(w, dt);
  resolveCombat(w);
  updateBurn(w, dt);
  w.log.exchanges = w.exch;
  if (prevBoss !== w.boss.state && w.boss.state === 'idle') closeDecision(w);
  if (!w.outcome && w.exch >= w.strokes && w.boss.state === 'idle' && !w.agent.dead) {
    w.outcome = 'written';
    if (w.current) closeDecision(w);
    if (w.agent.plan) w.agent.plan.done = true;
    emit(w, 'name.written', { k: w.exch, strokes: w.strokes, x: w.agent.x });
  }
  if (w.outcome) {
    if (w.outcomeT == null) w.outcomeT = w.t;
    w.endT += dt;
    if (w.current) closeDecision(w);
  }
}

// Share of the boss's health removed (1 on a kill).
export function attemptScore(w) {
  if (w.outcome === 'boss_dead') return 1;
  return Math.max(0, Math.min(1, 1 - w.boss.hp / w.boss.maxHp));
}

// ---- moves -----------------------------------------------------------------------------------

// The four moves with what the menu needs: availability and spell charges.
export function moveState(w) {
  const a = w.agent;
  return movesFor(a.loadout).map((m) => {
    const out = { ...m, available: true };
    if (m.kind === 'spell') { out.charges = a.charges; out.available = a.charges > 0; }
    return out;
  });
}

// The move used when a brain times out (or names a bad slot): the first class move.
export function defaultSlot(w) {
  const ms = moveState(w);
  const first = ms.find((m) => m.available && (m.kind === 'evade' || m.kind === 'guard'));
  return first ? first.slot : 0;
}

// Accepts { slot } or, for the old flow, { action } (a move id, or 'attack'/'heavy' for Strike).
function resolveSlot(w, d) {
  const ms = moveState(w);
  let slot = d && Number.isInteger(d.slot) ? d.slot : null;
  if (slot == null && d && typeof d.action === 'string') {
    const act = d.action === 'attack' || d.action === 'heavy' ? 'strike' : d.action;
    const m = ms.find((x) => x.id === act);
    if (m) slot = m.slot;
  }
  if (slot == null || slot < 0 || slot > 3 || !ms[slot].available) return { slot: defaultSlot(w), fallback: true };
  return { slot, fallback: false };
}

// ---- decisions -------------------------------------------------------------------------------

// Fire-time offsets (ms) relative to the moment the threat reaches the agent (evasive moves
// fire on cue; everything else fires at once or, for Brace, just before the threat).
const ON_CUE = { roll: -110, jump: -150, blink: -150 };
const EVADE = { roll_away: 'roll', roll_toward: 'roll', roll_through: 'roll', jump_back: 'jump' };

// ms (world time) at which the current boss attack first reaches the agent (static estimate).
export function threatTime(w) {
  const b = w.boss, a = w.agent;
  const atk = ATTACKS[(w.thinking && w.thinking.attackId) || b.attackId];
  if (!atk) return w.t;
  const dist = Math.abs(a.x - b.x);
  const cueLocal = atk.cue ? atk.cue(dist) : atk.tell.ms + (atk.hits[0] ? atk.hits[0].atMs : 0);
  let elapsedLocal = 0;
  if (b.state === 'tell') elapsedLocal = attackLocalMs(b);
  else if (b.state === 'active') elapsedLocal = atk.tell.ms + attackLocalMs(b);
  return w.t + Math.max(0, cueLocal - elapsedLocal) / bossSpeed(b);
}

// Probe: play the world forward (no damage) and return the world time at which a
// boss hazard first overlaps the agent's body, given `plan` (null = stand still).
function probeContact(w, plan, controller) {
  const c = structuredClone(w);
  c.decisions = false;
  c.thinking = null;
  c.current = null;
  c.events = [];
  c.probe = { t: null };
  c.agent.plan = plan || { move: 'hold', action: 'hold', fireAt: NEVER, fired: true, done: false, until: NEVER };
  const end = c.t + 7000;
  while (c.t < end && c.probe.t == null && !c.outcome) {
    stepWorld(c, TICK_MS, controller);
    c.events.length = 0;
    if (c.boss.state !== 'tell' && c.boss.state !== 'active') break;
  }
  return c.probe.t;
}

// The reflex action that carries out a move (src/ai/reflex.js executePlan).
function actionFor(a, mv) {
  if (mv.kind === 'evade') return { action: mv.id };
  if (mv.kind === 'guard') return { action: 'guard' };
  if (mv.kind === 'trade') return { action: 'trade' };
  if (mv.kind === 'hex') return { action: 'cast', spell: 'hex' };
  if (mv.kind === 'strike') return { action: a.stats.strike === 'heavy' ? 'heavy' : 'attack' };
  if (mv.id === 'margin') return { action: 'blink', spell: 'margin' };
  if (mv.id === 'echo') return { action: 'cast', spell: 'echo', after: a.stats.strike === 'heavy' ? 'heavy' : 'attack' };
  return { action: 'cast', spell: mv.id };
}

// Apply a brain decision { slot, thought }. A bad or unavailable slot plays defaultSlot(w).
// `controller` (src/ai/reflex.js agentController) lets us measure real contact time; without
// it we fall back to the attack's static cue().
export function applyDecision(w, d = {}, controller = null) {
  const a = w.agent, b = w.boss;
  const attackId = (w.thinking && w.thinking.attackId) || b.attackId;
  const atk = ATTACKS[attackId];
  const k = (w.thinking && w.thinking.k) || w.exch;
  if (w.current) closeDecision(w);
  const { slot, fallback } = resolveSlot(w, d);
  const mv = movesFor(a.loadout)[slot];
  const act = actionFor(a, mv);
  const fam = EVADE[mv.id] || (act.action === 'blink' ? 'blink' : null);

  let threatAt = threatTime(w);
  let hold = null;
  if (controller) {
    if (w.thinking && w.thinking.holdContact !== undefined) hold = w.thinking.holdContact;
    else {
      hold = probeContact(w, null, controller);
      if (w.thinking) w.thinking.holdContact = hold;
    }
    if (hold != null) threatAt = hold;
  }
  const mkPlan = (fireAt) => ({
    slot, move: mv.id, kind: mv.kind, action: act.action, spell: act.spell || null, after: act.after || null,
    fireAt, threatAt, fired: false, done: false, struck: false, attackId, startT: w.t, until: w.t + 9000,
  });
  let fireAt = w.t;
  if (fam) fireAt = Math.max(w.t, threatAt + ON_CUE[fam]);
  else if (act.action === 'guard') fireAt = Math.max(w.t, threatAt - 300);
  if (controller && hold != null && fam) {
    // moving changes when it reaches you: re-aim against the moving body
    for (let i = 0; i < 6; i++) {
      const c2 = probeContact(w, mkPlan(fireAt), controller);
      if (c2 == null || Math.abs(c2 - threatAt) < 10) break;
      threatAt = c2;
      fireAt = Math.max(w.t, threatAt + ON_CUE[fam]);
    }
  }
  const total = atk ? (atk.tell.ms + atk.activeMs) / bossSpeed(b) : 2000;
  a.plan = mkPlan(fireAt);
  a.plan.threatAt = threatAt;
  a.plan.until = w.t + total + 200;
  const rec = {
    n: w.log.decisions.length + 1,
    k,
    slot, move: mv.id, kind: mv.kind, name: mv.name, fallback,
    attackId,
    pose: atk ? atk.tell.poseDescription : '',
    action: mv.id, timing: 'on_cue', // (old flow) kept for prompts / match.js
    thought: (d && d.thought) || '',
    source: (d && d.source) || null,
    startT: w.t,
    hpBefore: a.hp,
    bossHpBefore: b.hp,
    damageTaken: 0,
    damageDealt: 0,
    outcome: null,
  };
  w.log.decisions.push(rec);
  w.current = rec;
  w.thinking = null;
  return rec;
}

export function closeDecision(w) {
  const rec = w.current;
  if (!rec) return;
  rec.endT = w.t;
  let s;
  if (w.agent.dead) s = `it killed you (took ${rec.damageTaken})`;
  else if (rec.damageTaken > 0) s = `it hit you for ${rec.damageTaken}`;
  else s = 'you came through untouched';
  if (rec.damageDealt > 0) s += `; you struck it for ${rec.damageDealt}`;
  rec.outcome = s;
  w.current = null;
  if (w.agent.plan) w.agent.plan.done = true;
}

// ---- helpers for observers -------------------------------------------------

export function gapBetween(w) {
  return Math.max(0, Math.abs(w.agent.x - w.boss.x) - BOSS.halfW - AGENT.halfW);
}

export function summarizeWorld(w) {
  const a = w.agent, b = w.boss;
  return {
    t: Math.round(w.t), tick: w.tick, outcome: w.outcome, k: w.exch, strokes: w.strokes,
    boss: {
      x: Math.round(b.x), y: Math.round(b.y), facing: b.facing, hp: b.hp, maxHp: b.maxHp,
      poise: Math.round(b.poise), phase: b.phase, state: b.state, attackId: b.attackId,
      stateT: Math.round(b.stateT), writing: b.writing, temper: b.temper,
      hexMs: Math.round(b.hexMs), burnMs: Math.round(b.burnMs), bound: b.bound,
    },
    agent: {
      id: a.id, x: Math.round(a.x), y: Math.round(a.y), facing: a.facing, hp: a.hp, maxHp: a.maxHp,
      stamina: Math.round(a.stamina), charges: a.charges, state: a.state, iframes: a.iframes,
      loadout: a.loadout, ward: a.ward > 0, echo: a.echo, sealUsed: a.sealUsed,
      plan: a.plan ? { move: a.plan.move, slot: a.plan.slot, done: a.plan.done } : null,
    },
    thinking: w.thinking ? { attackId: w.thinking.attackId, k: w.thinking.k, strokes: w.thinking.strokes, elapsed: Math.round(w.thinking.elapsed) } : null,
    hazards: w.hazards.length,
    decisions: w.log.decisions.slice(-6).map((d) => ({ k: d.k, attackId: d.attackId, move: d.move, slot: d.slot, outcome: d.outcome })),
    log: { damageTaken: w.log.damageTaken, damageDealt: w.log.damageDealt, dodges: w.log.dodges, killedBy: w.log.killedBy },
  };
}
