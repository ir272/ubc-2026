// The fight engine: one tick of physics, moves, hits, shields, grabs, ledges, KOs and rules.
// Pure and deterministic. Both sides' inputs are computed first, then applied, then hits are
// resolved simultaneously, so there is no side bias.
import type {
  Action, FightHeader, FightState, FighterDef, FighterState, Hitbox, HitStrength, MoveDef, MoveId, Plan, PlanAt, Projectile, Side, SimEvent,
} from './types.ts';
import { DEFAULT_PLAN } from './types.ts';
import { ARENA, DECK_BOTTOM, LEDGE_X, PAD_STOP_Y } from './arena.ts';
import { FIGHTERS, moveExtra } from './fighters.ts';
import { clamp, cosDeg, rnd, seedRng, sinDeg } from './math.ts';
import { ACT_CODE, HF, HIST_N, MOVE_CODE, THREAT, chooseDI, newHand, think, wantsTech } from './controller.ts';
export { ACT_CODE, HF, HIST_N, MOVE_CODE };

// ------------------------------------------------------------------------------------------------
// Tunables
// ------------------------------------------------------------------------------------------------

// Launch: speed = kb * LAUNCH m/tick, shrinking by DECAY m/tick every tick. Front-loaded: twice the old start speed with four
// times the old decay covers the same distance (v^2 / 2a) in half the time, so hard hits are explosive for the first few ticks.
export const LAUNCH = 0.0052; // m per tick per point of knockback (see NOTES: ARCH's 0.03 is in the genre's units)
export const DECAY = 0.0204; // m per tick per tick
export const ENTRANCE_TICKS = 24;
export const DEAD_TICKS = 60;
export const PAD_TICKS = 50;
export const PAD_MAX = 150;
export const RESPAWN_INVULN = 120;
export const SHIELD_DRAIN = 0.12;
export const SHIELD_REGEN = 0.14;
export const SHIELD_BREAK_TICKS = 170;
export const LEDGE_HANG_MAX = 300;
export const SUDDEN_MAX = 3600;
export const HITSTUN_CANCEL = 0.62;
export const DASH_GRAB_SKID = 4;
export const HITLAG_LETHAL = 18;
/** a shield raised this few ticks before the hit is a perfect shield (parry): no shield damage, no stun, and the attacker freezes longer */
export const PERFECT_SHIELD = 5;
export const PARRY_FREEZE = 8;
/** hit pause by strength: light 5 to 6, medium 6 to 10, heavy 11 to 14 (lethal is HITLAG_LETHAL); early hits of a multi-hit move 3 */
export function hitlagFor(kb: number, early: boolean): number {
  let hl: number;
  if (kb < 45) hl = kb < 30 ? 5 : 6;
  else if (kb < 90) hl = 6 + Math.floor(((kb - 45) / 45) * 5);
  else hl = 11 + Math.min(3, Math.floor((kb - 90) / 30));
  return early ? Math.min(hl, 3) : hl;
}
/** true when the move has hitboxes that come out after this one (a multi-hit move's early hits) */
function earlyHit(md: MoveDef, h: Hitbox): boolean {
  for (const o of md.hitboxes) if (o.from > h.to) return true;
  return false;
}
const STALE = [0.08, 0.076, 0.068, 0.06, 0.053, 0.045, 0.038, 0.03, 0.023];

// ------------------------------------------------------------------------------------------------
// Internal state kept in s.ctl (plain JSON)
// ------------------------------------------------------------------------------------------------

export interface Eng {
  ovx: number; ovy: number; // own velocity
  kvx: number; kvy: number; // knockback velocity
  hitMask: number;
  hitThisMove: boolean;
  whiffSent: boolean;
  combo: number; comboDmg: number; comboBy: number;
  lastHitBy: number; lastHitTick: number; lastMove: string;
  ledgeInvUsed: boolean; ledgeCd: number;
  airDodgeUsed: boolean; used2: boolean; used1: boolean;
  dropThrough: number;
  shieldStart: number;
  lock: number; // generic non-actionable timer (landing lag, shield drop, getup, ...)
  timer: number;
  chargeTarget: number;
  holdTimer: number;
  cmd: boolean;
  aimX: number; aimY: number;
  tether: number;
  doomed: boolean;
  ledgeAct: string;
  jumpKind: number;
  rollDir: number;
  techIntent: boolean;
  prevX: number; // for approach/retreat habit sampling
  hsTotal: number; // hitstun of the last launch, for the air cancel
  pendGrab: number; // a grab out of a run: ticks of skid before the grab comes out
  stale: number[]; // the last 9 moves that landed (move codes, newest first): repeats deal less
  drag: number; // >0 while being reeled in by the opponent's tether (ticks so far)
  blinkTick: number; // the tick of the last blink (body order is taken from after it)
  volley: number; // tick the current fan volley started (-1: blocked, one already in flight)
  vHits: number; // shots of that volley landed or blocked
}

export interface Habits { approaches: number; retreats: number; strikes: number; grabs: number; shields: number; dodges: number; shots: number; jumps: number; recoveredHigh: number; recoveredLow: number }
/** extra behaviour the stance inference uses (never the plan): gap kept and time in shield, per window */
/** extra behaviour the stance inference uses (never the plan), per window: gap kept and time in shield on the deck, and over all
 * ticks in play: distance from the middle, speed toward the opponent, time attacking, time in the air */
export interface Feel { gapSum: number; n: number; shieldTicks: number; m: number; absX: number; toward: number; atk: number; air: number; turns: number; still: number; dashIn: number; dashOut: number; starts: number; puns: number; edge: number }
export function emptyFeel(): Feel { return { gapSum: 0, n: 0, shieldTicks: 0, m: 0, absX: 0, toward: 0, atk: 0, air: 0, turns: 0, still: 0, dashIn: 0, dashOut: 0, starts: 0, puns: 0, edge: 0 }; }
export interface Since { plan: Plan; tick: number; dealt: number; taken: number; myHits: number; oppHits: number; myGrabs: number; oppGrabs: number; myWhiffs: number; shieldedByOpp: number }
export interface Track { cur: Habits; prev: Habits; pprev: Habits; since: Since; offstage: boolean; sampleX: number; gapX: number; fcur: Feel; fprev: Feel; fpprev: Feel }

export interface Ctl {
  eng: [Eng, Eng];
  hands: [Record<string, any>, Record<string, any>];
  hist: number[];
  track: [Track, Track];
  lastExchange: number;
  maxGap: number;
  firstKo: number;
}

export interface Input {
  mx: number; my: number;
  jump: number; // 0 none, 1 full hop / air jump, 2 short hop
  act: string; // '' or a MoveId or a defensive / ledge / getup option
  face: number;
  shield: boolean;
  charge: number;
  aimx: number; aimy: number;
  fastfall: boolean;
  drop: boolean;
}

export function newInput(): Input {
  return { mx: 0, my: 0, jump: 0, act: '', face: 0, shield: false, charge: 0, aimx: 0, aimy: 1, fastfall: false, drop: false };
}

function newEng(): Eng {
  return {
    ovx: 0, ovy: 0, kvx: 0, kvy: 0, hitMask: 0, hitThisMove: false, whiffSent: true, combo: 0, comboDmg: 0, comboBy: -1,
    lastHitBy: -1, lastHitTick: -9999, lastMove: '', ledgeInvUsed: false, ledgeCd: 0, airDodgeUsed: false, used2: false, used1: false,
    dropThrough: 0, shieldStart: -99, lock: 0, timer: 0, chargeTarget: 0, holdTimer: 0, cmd: false, aimX: 0, aimY: 1, tether: -1,
    doomed: false, ledgeAct: '', jumpKind: 1, rollDir: 1, techIntent: false, prevX: 0, hsTotal: 0, pendGrab: 0, stale: [],
    drag: 0, blinkTick: -1, volley: -1, vHits: 0,
  };
}

export function emptyHabits(): Habits {
  return { approaches: 0, retreats: 0, strikes: 0, grabs: 0, shields: 0, dodges: 0, shots: 0, jumps: 0, recoveredHigh: 0, recoveredLow: 0 };
}

function newSince(plan: Plan, tick: number): Since {
  return { plan: { ...plan }, tick, dealt: 0, taken: 0, myHits: 0, oppHits: 0, myGrabs: 0, oppGrabs: 0, myWhiffs: 0, shieldedByOpp: 0 };
}

export function ctlOf(s: FightState): Ctl {
  return s.ctl as Ctl;
}

// ------------------------------------------------------------------------------------------------
// Creation
// ------------------------------------------------------------------------------------------------

function newFighter(id: FighterDef, x: number, facing: 1 | -1, lives: number, damage: number): FighterState {
  return {
    fighter: id.id, x, y: 0, vx: 0, vy: 0, facing, action: 'entrance', actionFrame: 0, move: null, charge: 0, grounded: true,
    platform: -1, ledge: -1, damage, lives, shield: 100, hitlag: 0, hitstun: 0, tumble: false, kbx: 0, kby: 0, invuln: 0,
    armor: false, airJumpsLeft: id.airJumps, fastFall: false, rooted: 0, pulled: false,
  };
}

export function createFight(header: FightHeader): FightState {
  const a = FIGHTERS[header.fighters[0]];
  const b = FIGHTERS[header.fighters[1]];
  const hc = header.handicap || [0, 0];
  const s: FightState = {
    tick: 0,
    phase: 'fight',
    fighters: [
      newFighter(a, ARENA.spawns[0], 1, header.lives, Math.max(0, +hc[0] || 0)),
      newFighter(b, ARENA.spawns[1], -1, header.lives, Math.max(0, +hc[1] || 0)),
    ],
    projectiles: [],
    plans: [{ ...DEFAULT_PLAN }, { ...DEFAULT_PLAN }],
    pending: [],
    kbScale: 1,
    winner: -1,
    stats: [newStats(), newStats()],
    rng: seedRng(String(header.seed)),
    ctl: null,
  };
  const ctl: Ctl = {
    eng: [newEng(), newEng()],
    hands: [newHand(), newHand()],
    hist: new Array(HIST_N * 2 * HF).fill(0),
    track: [newTrack(s.plans[0]), newTrack(s.plans[1])],
    lastExchange: 0,
    maxGap: 0,
    firstKo: -1,
  };
  ctl.eng[0].prevX = s.fighters[0].x;
  ctl.eng[1].prevX = s.fighters[1].x;
  s.ctl = ctl;
  for (let i = 0; i < HIST_N; i++) recordHist(s, i);
  return s;
}

function newTrack(plan: Plan): Track {
  return { cur: emptyHabits(), prev: emptyHabits(), pprev: emptyHabits(), since: newSince(plan, 0), offstage: false, sampleX: 0, gapX: 0, fcur: emptyFeel(), fprev: emptyFeel(), fpprev: emptyFeel() };
}

function newStats() {
  return { damageDealt: 0, hitsLanded: 0, grabsLanded: 0, shieldsHeld: 0, kos: 0, bestCombo: 0 };
}

// ------------------------------------------------------------------------------------------------
// Plans
// ------------------------------------------------------------------------------------------------

export function schedulePlan(s: FightState, p: PlanAt): void {
  if (!p || (p.side !== 0 && p.side !== 1)) return;
  const tick = Math.max(s.tick + 1, Math.floor(+p.tick || 0));
  // one pending plan per side and tick: the later call wins
  s.pending = s.pending.filter((q) => !(q.side === p.side && q.tick === tick));
  s.pending.push({ side: p.side, tick, plan: { ...p.plan } });
  s.pending.sort((x, y) => x.tick - y.tick || x.side - y.side);
}

function samePlan(a: Plan, b: Plan): boolean {
  return a.stance === b.stance && a.aggression === b.aggression && a.range === b.range && a.grabMix === b.grabMix &&
    a.edge === b.edge && a.recover === b.recover;
}

// ------------------------------------------------------------------------------------------------
// Geometry helpers
// ------------------------------------------------------------------------------------------------

/** circle (cx, cy, r) vs the fighter's capsule hurtbox */
export function hitsBody(f: FighterState, def: FighterDef, cx: number, cy: number, r: number): boolean {
  const hr = def.width * 0.5;
  const y0 = f.y + hr;
  const y1 = f.y + def.height - hr;
  const py = cy < y0 ? y0 : cy > y1 ? y1 : cy;
  const dx = cx - f.x;
  const dy = cy - py;
  const rr = r + hr;
  return dx * dx + dy * dy <= rr * rr;
}

export function knockback(pAfter: number, d: number, weight: number, h: Hitbox, scale: number): number {
  return (((pAfter / 10 + (pAfter * d) / 20) * (200 / (weight + 100)) * 1.4 + 18) * (h.kbg / 100) + h.bkb) * scale;
}

/** one tick of a launched fighter with no control. Shared by the physics and the lethal check. */
function launchTick(st: { x: number; y: number; ovy: number; kvx: number; kvy: number }, grav: number, fall: number): void {
  let ovy = st.ovy - grav;
  if (ovy < -fall) ovy = -fall;
  st.ovy = ovy;
  const mag = Math.sqrt(st.kvx * st.kvx + st.kvy * st.kvy);
  if (mag > 0) {
    const nm = mag - DECAY;
    if (nm <= 0) { st.kvx = 0; st.kvy = 0; } else { const k = nm / mag; st.kvx *= k; st.kvy *= k; }
  }
  st.x += st.kvx;
  st.y += st.ovy + st.kvy;
}

function outOfBlast(x: number, y: number): '' | 'left' | 'right' | 'top' | 'bottom' {
  const b = ARENA.blast;
  if (x < b.left) return 'left';
  if (x > b.right) return 'right';
  if (y > b.top) return 'top';
  if (y < b.bottom) return 'bottom';
  return '';
}

/** forward simulation of a launch with no control: ticks until a blast line is crossed, or -1 */
export function lethalTicks(x: number, y: number, kvx: number, kvy: number, def: FighterDef, hitstun: number): number {
  const st = { x, y, ovy: 0, kvx, kvy };
  for (let t = 1; t <= 400; t++) {
    const py = st.y;
    launchTick(st, def.gravity, def.fallSpeed);
    if (outOfBlast(st.x, st.y)) return t;
    const onDeckX = st.x >= ARENA.main.x0 - def.width * 0.5 && st.x <= ARENA.main.x1 + def.width * 0.5;
    if (onDeckX && st.y < 0 && py >= 0) return -1; // lands on the deck
    if (onDeckX && st.y < 0 && st.y + def.height > DECK_BOTTOM) return -1; // hits the deck side or underside
    if (st.kvx === 0 && st.kvy === 0 && t > hitstun) return -1; // free again
  }
  return -1;
}

// ------------------------------------------------------------------------------------------------
// The tick
// ------------------------------------------------------------------------------------------------

const INPUTS: [Input, Input] = [newInput(), newInput()];

export function stepFight(s: FightState, header: FightHeader): SimEvent[] {
  const ev: SimEvent[] = [];
  if (s.phase === 'over') return ev;
  const ctl = ctlOf(s);
  s.tick++;
  const T = s.tick;

  // plans that take effect now
  while (s.pending.length && s.pending[0].tick <= T) {
    const p = s.pending.shift()!;
    const prev = s.plans[p.side];
    s.plans[p.side] = { ...p.plan };
    ev.push({ t: 'plan', tick: T, side: p.side, plan: { ...p.plan } });
    const tr = ctl.track[p.side];
    if (!samePlan(prev, p.plan)) tr.since = newSince(p.plan, T);
    else tr.since.plan = { ...p.plan };
  }

  // rules clock
  if (s.phase === 'fight' && T >= header.timeLimitTicks) {
    const [a, b] = s.fighters;
    if (a.lives !== b.lives) {
      finish(s, a.lives > b.lives ? 0 : 1, ev);
      return ev;
    }
    s.phase = 'sudden';
    s.kbScale = 1.5;
    ev.push({ t: 'sudden_death', tick: T });
  } else if (s.phase === 'sudden') {
    const k = T - header.timeLimitTicks;
    if (k > 0 && k % 300 === 0) s.kbScale = Math.round((s.kbScale + 0.1) * 100) / 100;
    if (k >= SUDDEN_MAX) {
      const [a, b] = s.fighters;
      const w: Side = a.damage < b.damage ? 0 : b.damage < a.damage ? 1 : (rnd(s.rng) < 0.5 ? 0 : 1);
      finish(s, w, ev);
      return ev;
    }
  }

  // hands: both inputs first, from the same state
  for (let i = 0; i < 2; i++) {
    think(s, i as Side, header, INPUTS[i]);
    const H = ctl.hands[i];
    if (H.order) {
      const o = H.order as 'special' | 'kill';
      H.order = '';
      if (s.plans[i].order === o) {
        ev.push({ t: 'order', tick: T, side: i as Side, order: o });
        if (o === 'special') s.plans[i].order = 'none';
      }
    }
  }
  // apply
  const ox0 = s.fighters[0].x, ox1 = s.fighters[1].x;
  for (let i = 0; i < 2; i++) updateFighter(s, i as Side, INPUTS[i], ev);
  // bodies push apart on the ground
  separate(s, ox0, ox1);
  // projectiles
  stepProjectiles(s, ev);
  // tethers reel their catch in
  stepDrag(s, ev);
  // held fighters follow their holders
  for (let i = 0; i < 2; i++) placeHeld(s, i as Side);
  // hits, simultaneously
  resolveHits(s, ev);
  // KOs
  const k0 = checkKo(s, 0, ev);
  const k1 = checkKo(s, 1, ev);
  if (s.phase === 'sudden' && (k0 || k1)) {
    const a = s.fighters[0], b = s.fighters[1];
    finish(s, k0 && k1 ? (a.damage < b.damage ? 0 : b.damage < a.damage ? 1 : (rnd(s.rng) < 0.5 ? 0 : 1)) : k0 ? 1 : 0, ev);
  }
  if ((s.phase as string) !== 'over') {
    const a = s.fighters[0], b = s.fighters[1];
    if (a.lives <= 0 || b.lives <= 0) {
      let w: Side;
      if (a.lives <= 0 && b.lives <= 0) w = a.damage < b.damage ? 0 : b.damage < a.damage ? 1 : (rnd(s.rng) < 0.5 ? 0 : 1);
      else w = a.lives <= 0 ? 1 : 0;
      finish(s, w, ev);
    }
  }
  // bookkeeping
  track(s, ev);
  recordHist(s, T);
  return ev;
}

function finish(s: FightState, w: Side, ev: SimEvent[]): void {
  s.phase = 'over';
  s.winner = w;
  const W = s.fighters[w], L = s.fighters[1 - w];
  if (W.action !== 'dead') setAction(W, 'win');
  if (L.action !== 'dead') setAction(L, 'lose');
  ev.push({ t: 'end', tick: s.tick, winner: w });
}

function setAction(f: FighterState, a: Action): void {
  f.action = a;
  f.actionFrame = 1;
  if (a !== 'attack' && a !== 'charge' && a !== 'holding') f.move = null;
}

// ------------------------------------------------------------------------------------------------
// Per fighter
// ------------------------------------------------------------------------------------------------

function canGround(f: FighterState, e: Eng): boolean {
  return e.lock <= 0 && (f.action === 'idle' || f.action === 'walk' || f.action === 'run' || f.action === 'skid');
}

function canAir(f: FighterState): boolean {
  return f.action === 'rise' || f.action === 'fall';
}

function updateFighter(s: FightState, side: Side, inp: Input, ev: SimEvent[]): void {
  const f = s.fighters[side];
  const e = ctlOf(s).eng[side];
  const def = FIGHTERS[f.fighter];
  if (s.phase === 'over') return;
  if (f.hitlag > 0) { f.hitlag--; return; }
  if (f.rooted) f.rooted = f.action === 'hitstun' ? Math.max(0, f.rooted - 1) : 0;
  f.actionFrame++;
  if (f.invuln > 0) f.invuln--;
  if (e.dropThrough > 0) e.dropThrough--;
  if (e.ledgeCd > 0) e.ledgeCd--;
  if (e.lock > 0) e.lock--;
  if (f.action !== 'shield' && f.action !== 'shieldstun' && f.action !== 'shieldbreak') f.shield = Math.min(100, f.shield + SHIELD_REGEN);
  f.armor = false;
  const T = s.tick;
  const opp = s.fighters[1 - side];

  switch (f.action) {
    case 'entrance':
      if (f.actionFrame >= ENTRANCE_TICKS) setAction(f, 'idle');
      return;
    case 'win': case 'lose':
      return;
    case 'dead':
      if (f.actionFrame >= DEAD_TICKS && f.lives > 0) {
        setAction(f, 'respawn');
        f.x = ARENA.respawn.x; f.y = ARENA.respawn.y; f.damage = 0; f.vx = 0; f.vy = 0; e.ovx = 0; e.ovy = 0; e.kvx = 0; e.kvy = 0;
        f.grounded = false; f.platform = -2; f.ledge = -1; f.hitstun = 0; f.tumble = false; f.shield = 100; f.fastFall = false;
        f.airJumpsLeft = def.airJumps; e.airDodgeUsed = false; e.used1 = false; e.used2 = false; e.doomed = false;
        f.facing = opp.x >= 0 ? 1 : -1; f.invuln = 0;
        ev.push({ t: 'respawn', tick: T, side });
      }
      return;
    case 'respawn': {
      const t = f.actionFrame;
      f.y = ARENA.respawn.y - (ARENA.respawn.y - PAD_STOP_Y) * Math.min(1, t / PAD_TICKS);
      f.vy = 0; f.vx = 0;
      const leave = t >= PAD_MAX || (t > PAD_TICKS && (inp.jump || Math.abs(inp.mx) > 0.3 || inp.act !== '' || inp.drop));
      if (leave) {
        f.invuln = RESPAWN_INVULN;
        setAction(f, 'fall');
        e.ovx = 0; e.ovy = 0;
        if (inp.jump && f.airJumpsLeft > 0) airJump(s, side, f, e, def, inp, ev);
      }
      return;
    }
  }

  // ---- control: start new actions from actionable states
  let started = false;
  if (f.action !== 'skid') e.pendGrab = 0;
  if (f.grounded) {
    if (f.action === 'land' && e.lock <= 0) setAction(f, 'idle');
    if (f.action === 'skid' && f.actionFrame > 5 && e.pendGrab <= 0) setAction(f, 'idle');
    if (f.action === 'skid' && e.pendGrab > 0) {
      // a dash grab: the run has to be stopped before the hands can close
      if (--e.pendGrab === 0) { const fc = f.facing; startMove(s, side, f, e, 'grab', inp, ev); f.facing = fc; }
    } else if (canGround(f, e)) started = groundControl(s, side, f, e, def, inp, ev);
    else if (f.action === 'shield') started = shieldControl(s, side, f, e, def, inp, ev);
    else if (f.action === 'knockdown') {
      if ((inp.act.startsWith('getup') && f.actionFrame > 14) || f.actionFrame > 70) {
        setAction(f, 'getup');
        e.ledgeAct = inp.act === 'getuproll' ? 'roll' : '';
        e.rollDir = inp.mx >= 0 ? 1 : -1;
        f.invuln = Math.max(f.invuln, 22);
        started = true;
      }
    }
  } else if (canAir(f)) {
    started = airControl(s, side, f, e, def, inp, ev);
  }
  if (f.action === 'ledgehang') ledgeControl(s, side, f, e, def, inp, ev);
  if (f.action === 'holding' && f.move === null) {
    e.holdTimer++;
    if ((inp.act === 'throwf' || inp.act === 'throwb' || inp.act === 'throwu') && e.holdTimer > 4) {
      startMove(s, side, f, e, inp.act as MoveId, inp, ev);
      ev.push({ t: 'throw', tick: T, by: side, to: (1 - side) as Side, move: f.move! });
    } else if (e.holdTimer > 90) {
      releaseGrab(s, side);
    }
  }
  void started;

  // ---- advance the current action
  advance(s, side, f, e, def, inp, ev);

  // ---- physics
  physics(s, side, f, e, def, inp, ev);
}

function groundControl(s: FightState, side: Side, f: FighterState, e: Eng, def: FighterDef, inp: Input, ev: SimEvent[]): boolean {
  const T = s.tick;
  const a = inp.act;
  if (a && (MOVE_CODE[a] !== undefined)) {
    const m = a as MoveId;
    const ex = moveExtra(f.fighter, m);
    if (ex && ex.ground && def.moves[m].kind !== 'throw' && def.moves[m].kind !== 'air') {
      if (m === 'grab' && f.action === 'run') {
        // grabbing out of a run takes a short skid first (the dash grab is slower than a standing grab)
        setAction(f, 'skid');
        e.pendGrab = DASH_GRAB_SKID;
        return true;
      }
      if (inp.face) f.facing = inp.face > 0 ? 1 : -1;
      startMove(s, side, f, e, m, inp, ev);
      return true;
    }
  }
  if (a === 'roll_f' || a === 'roll_b' || a === 'roll') {
    const dir = a === 'roll_b' ? -f.facing : a === 'roll_f' ? f.facing : (inp.mx >= 0 ? 1 : -1);
    startRoll(s, side, f, e, dir, ev);
    return true;
  }
  if (a === 'spot') {
    setAction(f, 'spotdodge');
    ev.push({ t: 'dodge', tick: T, side, kind: 'spot' });
    return true;
  }
  if (inp.shield) {
    setAction(f, 'shield');
    e.shieldStart = T;
    return true;
  }
  if (inp.jump) {
    setAction(f, 'jumpsquat');
    e.jumpKind = inp.jump;
    return true;
  }
  if (a === 'ledgegrab' && f.platform === -1) {
    for (let l = 0; l < 2; l++) {
      if (Math.abs(f.x - LEDGE_X[l]) < 1.1 && ledgeFree(s, side, l)) { grabLedge(s, side, f, e, def, l, ev); return true; }
    }
  }
  if (inp.drop && f.platform >= 0) {
    f.grounded = false; f.platform = -2; e.dropThrough = 10; f.y -= 0.02; e.ovy = -0.04;
    setAction(f, 'fall');
    return true;
  }
  // movement
  const mx = inp.mx;
  if (Math.abs(mx) > 0.7) {
    const dir = mx > 0 ? 1 : -1;
    if (f.action === 'run' && dir !== f.facing) {
      ctlOf(s).track[side].fcur.turns++; // a dash turned around (dash dancing shows up here)
      if (f.actionFrame <= 9) {
        // dash dance: an early reverse is a new dash the other way
        f.facing = dir as 1 | -1;
        setAction(f, 'run');
        e.ovx = dir * def.runSpeed * 0.6;
        ev.push({ t: 'dash', tick: T, side, x: f.x, y: f.y, dir: dir as 1 | -1 });
        return true;
      }
      setAction(f, 'skid');
      return true;
    }
    if (f.action === 'skid') return false;
    if (f.action !== 'run') {
      f.facing = dir as 1 | -1;
      setAction(f, 'run');
      e.ovx = dir * Math.max(Math.abs(e.ovx), def.runSpeed * 0.75);
      ev.push({ t: 'dash', tick: T, side, x: f.x, y: f.y, dir: dir as 1 | -1 });
    }
  } else if (Math.abs(mx) > 0.15) {
    // a walk keeps watching the opponent: backing off is a walk backwards, not a turn
    const o = s.fighters[1 - side];
    f.facing = (o.action === 'dead' || o.action === 'respawn' ? (mx > 0 ? 1 : -1) : (o.x >= f.x ? 1 : -1)) as 1 | -1;
    if (f.action !== 'walk') setAction(f, 'walk');
  } else {
    if (f.action !== 'idle') setAction(f, 'idle');
    // standing still: turn to face it
    const o = s.fighters[1 - side];
    if (o.action !== 'dead' && o.action !== 'respawn' && Math.abs(o.x - f.x) > 0.3) f.facing = (o.x >= f.x ? 1 : -1) as 1 | -1;
  }
  return false;
}

function shieldControl(s: FightState, side: Side, f: FighterState, e: Eng, def: FighterDef, inp: Input, ev: SimEvent[]): boolean {
  const a = inp.act;
  // out of shield options
  if (a === 'grab' || a === 'upsmash' || a === 'recover') {
    if (inp.face) f.facing = inp.face > 0 ? 1 : -1;
    startMove(s, side, f, e, a as MoveId, inp, ev);
    return true;
  }
  if (a === 'roll_f' || a === 'roll_b') {
    startRoll(s, side, f, e, a === 'roll_b' ? -f.facing : f.facing, ev);
    return true;
  }
  if (a === 'spot') {
    setAction(f, 'spotdodge');
    ev.push({ t: 'dodge', tick: s.tick, side, kind: 'spot' });
    return true;
  }
  if (inp.jump) {
    setAction(f, 'jumpsquat');
    e.jumpKind = inp.jump;
    return true;
  }
  if (!inp.shield) {
    setAction(f, 'idle');
    e.lock = 7; // shield drop
  }
  return false;
}

function airControl(s: FightState, side: Side, f: FighterState, e: Eng, def: FighterDef, inp: Input, ev: SimEvent[]): boolean {
  const a = inp.act;
  if (a && MOVE_CODE[a] !== undefined) {
    const m = a as MoveId;
    const ex = moveExtra(f.fighter, m);
    if (ex && ex.air) {
      if (m === 'recover' && e.used1) return false;
      if (ex.oncePerAir && m === 'special2' && e.used2) return false;
      if (ex.oncePerAir && m === 'special' && e.used1 && f.fighter === 'tick') return false;
      if (inp.face && def.moves[m].kind === 'special') f.facing = inp.face > 0 ? 1 : -1;
      startMove(s, side, f, e, m, inp, ev);
      return true;
    }
  }
  if (a === 'airdodge' && !e.airDodgeUsed) {
    e.airDodgeUsed = true;
    setAction(f, 'airdodge');
    ev.push({ t: 'dodge', tick: s.tick, side, kind: 'air' });
    return true;
  }
  if (inp.jump && f.airJumpsLeft > 0) {
    airJump(s, side, f, e, def, inp, ev);
    return true;
  }
  return false;
}

function airJump(s: FightState, side: Side, f: FighterState, e: Eng, def: FighterDef, inp: Input, ev: SimEvent[]): void {
  f.airJumpsLeft--;
  e.ovy = def.doubleJumpSpeed;
  e.ovx = inp.mx * def.airSpeed;
  f.fastFall = false;
  setAction(f, 'rise');
  ev.push({ t: 'jump', tick: s.tick, side, air: true, x: f.x, y: f.y });
}

function ledgeControl(s: FightState, side: Side, f: FighterState, e: Eng, def: FighterDef, inp: Input, ev: SimEvent[]): void {
  const a = inp.act;
  const o = LEDGE_X[f.ledge] < 0 ? -1 : 1;
  if (f.actionFrame < 8 && f.actionFrame < LEDGE_HANG_MAX) return; // must hang a moment
  if (a === 'climb' || a === 'ledgeattack' || a === 'ledgeroll') {
    setAction(f, 'ledgeclimb');
    e.ledgeAct = a;
    f.invuln = Math.max(f.invuln, a === 'ledgeroll' ? 12 : 16);
  } else if (a === 'ledgejump') {
    leaveLedge(f, e);
    e.ovy = def.jumpSpeed * 1.02;
    e.ovx = -o * def.airSpeed * 0.5;
    setAction(f, 'rise');
    ev.push({ t: 'jump', tick: s.tick, side, air: false, x: f.x, y: f.y });
  } else if (a === 'ledgedrop' || f.actionFrame > LEDGE_HANG_MAX) {
    leaveLedge(f, e);
    f.x += o * 0.15;
    e.ovy = 0;
    setAction(f, 'fall');
  }
}

function leaveLedge(f: FighterState, e: Eng): void {
  f.ledge = -1;
  e.ledgeCd = 24;
  f.grounded = false;
  f.platform = -2;
}

function startRoll(s: FightState, side: Side, f: FighterState, e: Eng, dir: number, ev: SimEvent[]): void {
  setAction(f, 'roll');
  e.rollDir = dir;
  ev.push({ t: 'dodge', tick: s.tick, side, kind: 'roll' });
}

export function startMove(s: FightState, side: Side, f: FighterState, e: Eng, m: MoveId, inp: Input, ev: SimEvent[]): void {
  const def = FIGHTERS[f.fighter];
  const md = def.moves[m];
  f.move = m;
  f.charge = 0;
  e.hitMask = 0;
  e.hitThisMove = false;
  e.whiffSent = md.hitboxes.length === 0 || md.kind === 'throw';
  e.tether = -1;
  if (m === 'recover') e.used1 = true;
  if (m === 'special2' && !f.grounded) e.used2 = true;
  if (m === 'special' && !f.grounded && f.fighter === 'tick') e.used1 = true;
  const ex = moveExtra(f.fighter, m);
  if (ex.aimed) {
    let ax = inp.aimx, ay = inp.aimy;
    const l = Math.sqrt(ax * ax + ay * ay);
    if (l < 0.01) { ax = 0; ay = 1; } else { ax /= l; ay /= l; }
    if (ay < 0.2) { ay = 0.2; const l2 = Math.sqrt(ax * ax + ay * ay); ax /= l2; ay /= l2; }
    e.aimX = ax; e.aimY = ay;
    if (ax !== 0) f.facing = ax > 0 ? 1 : -1;
  }
  if (md.maxCharge && inp.charge > 0) {
    setAction(f, 'charge');
    f.move = m;
    e.chargeTarget = Math.min(md.maxCharge, Math.floor(inp.charge));
  } else {
    setAction(f, 'attack');
    f.move = m;
  }
  if (md.kind !== 'throw') ev.push({ t: 'move', tick: s.tick, side, move: m });
}

function advance(s: FightState, side: Side, f: FighterState, e: Eng, def: FighterDef, inp: Input, ev: SimEvent[]): void {
  const T = s.tick;
  const fr = f.actionFrame;
  switch (f.action) {
    case 'jumpsquat':
      if (fr >= def.jumpsquat) {
        e.ovy = e.jumpKind === 2 ? def.shortHopSpeed : def.jumpSpeed;
        e.ovx = clamp(e.ovx * 0.7 + inp.mx * def.airSpeed * 0.5, -def.airSpeed, def.airSpeed);
        f.grounded = false; f.platform = -2;
        setAction(f, 'rise');
        ev.push({ t: 'jump', tick: T, side, air: false, x: f.x, y: f.y });
      }
      break;
    case 'rise':
      if (e.ovy + e.kvy <= 0) setAction(f, 'fall');
      break;
    case 'land':
      if (e.lock <= 0) setAction(f, 'idle');
      break;
    case 'charge': {
      f.charge++;
      const md = def.moves[f.move!];
      if (md.armor && f.fighter === 'kiln') f.armor = true;
      if (f.charge >= e.chargeTarget) { const c = f.charge; setAction(f, 'attack'); f.charge = c; }
      break;
    }
    case 'attack':
      advanceMove(s, side, f, e, def, inp, ev);
      break;
    case 'shield':
      f.shield -= SHIELD_DRAIN;
      if (f.shield <= 0) breakShield(s, side, f, e, ev);
      break;
    case 'shieldstun':
      if (fr > e.timer) setAction(f, inp.shield ? 'shield' : 'idle');
      break;
    case 'shieldbreak':
      if (fr > SHIELD_BREAK_TICKS) { setAction(f, 'idle'); f.shield = 35; }
      break;
    case 'roll': {
      if (fr === 3) f.invuln = Math.max(f.invuln, 13);
      if (fr >= 26) { setAction(f, 'idle'); if (side >= 0) f.facing = (e.rollDir < 0 ? (f.facing) : f.facing) as 1 | -1; }
      break;
    }
    case 'spotdodge':
      if (fr === 3) f.invuln = Math.max(f.invuln, 14);
      if (fr >= 22) setAction(f, 'idle');
      break;
    case 'airdodge':
      if (fr === 2) f.invuln = Math.max(f.invuln, 20);
      if (fr >= 34) setAction(f, 'fall');
      break;
    case 'hitstun':
      if (f.hitstun > 0) f.hitstun--;
      // launched fighters may act once most of the hitstun is spent (the genre's hitstun cancel)
      if (!f.grounded && !e.doomed && f.tumble && e.hsTotal - f.hitstun >= Math.floor(e.hsTotal * HITSTUN_CANCEL)) f.hitstun = 0;
      if (f.hitstun <= 0 && !e.doomed) {
        f.tumble = false;
        setAction(f, f.grounded ? 'idle' : 'fall');
      }
      break;
    case 'knockdown':
      break;
    case 'getup':
      if (e.ledgeAct === 'roll' && fr <= 18) e.ovx = e.rollDir * 0.12;
      if (fr >= 26) { setAction(f, 'idle'); e.ovx = 0; }
      break;
    case 'ledgehang':
      break;
    case 'ledgeclimb': {
      const o = LEDGE_X[f.ledge < 0 ? 0 : f.ledge] < 0 ? -1 : 1;
      const lx = LEDGE_X[f.ledge < 0 ? 0 : f.ledge];
      const dur = e.ledgeAct === 'climb' ? 26 : 16;
      const t = Math.min(1, fr / dur);
      f.y = -def.height * 0.85 * (1 - t);
      f.x = lx + o * (def.width * 0.5 + 0.1) * (1 - t) - o * 0.55 * t;
      if (fr >= dur) {
        f.y = 0; f.grounded = true; f.platform = -1; f.ledge = -1; e.ovx = 0; e.ovy = 0;
        f.facing = (-o) as 1 | -1;
        if (e.ledgeAct === 'ledgeattack') {
          setAction(f, 'idle');
          startMove(s, side, f, e, 'tilt', inp, ev);
        } else if (e.ledgeAct === 'ledgeroll') {
          startRoll(s, side, f, e, -o, ev);
          f.invuln = Math.max(f.invuln, 14);
        } else setAction(f, 'idle');
      }
      break;
    }
    case 'holding':
      if ((f.move === 'special' || f.move === 'special2') && e.cmd) {
        e.holdTimer++;
        const cm = f.move;
        const ex = moveExtra(f.fighter, cm);
        if (e.holdTimer >= ex.cmd!.delay) {
          const tgt = s.fighters[1 - side];
          const te = ctlOf(s).eng[1 - side];
          e.cmd = false;
          tgt.action = 'hitstun';
          applyHit(s, side, (1 - side) as Side, ex.cmd!.hb, cm, 0, f.facing, ev, false);
          void te;
          setAction(f, 'land');
          e.lock = ex.cmd!.endlag;
          f.move = null;
        }
      }
      break;
    case 'helpless':
      break;
  }
}

function advanceMove(s: FightState, side: Side, f: FighterState, e: Eng, def: FighterDef, inp: Input, ev: SimEvent[]): void {
  const m = f.move!;
  const md = def.moves[m];
  const ex = moveExtra(f.fighter, m);
  const fr = f.actionFrame;
  const total = md.startup + md.active + md.recovery;
  if (md.armor && fr >= md.armor[0] && fr <= md.armor[1]) f.armor = true;
  if (ex.fwd && fr >= ex.fwd[0] && fr <= ex.fwd[1]) e.ovx = f.facing * ex.fwd[2];
  if (ex.up && fr >= ex.up[0] && fr <= ex.up[1]) { e.ovy = ex.up[2]; if (f.grounded) { f.grounded = false; f.platform = -2; } }
  if (ex.aimed && fr >= ex.aimed.from && fr <= ex.aimed.to) {
    e.ovx = e.aimX * ex.aimed.speed; e.ovy = e.aimY * ex.aimed.speed;
    if (f.grounded && e.aimY > 0) { f.grounded = false; f.platform = -2; }
  }
  if (ex.aimed && fr === ex.aimed.to + 1) { e.ovx *= 0.4; e.ovy *= 0.3; }
  if (ex.tether && fr >= ex.tether.from && fr <= ex.tether.to && !f.grounded) {
    if (e.tether < 0) {
      for (let l = 0; l < 2; l++) {
        const lx = LEDGE_X[l];
        const hx = f.x + f.facing * 0.5, hy = f.y + def.height * 0.8;
        const dx = lx - hx, dy = 0 - hy;
        if (dx * dx + dy * dy <= ex.tether.range * ex.tether.range && ledgeFree(s, side, l) && Math.sign(lx) === Math.sign(f.x || lx)) {
          e.tether = l;
          break;
        }
      }
    }
    if (e.tether >= 0) {
      const lx = LEDGE_X[e.tether];
      const o = lx < 0 ? -1 : 1;
      const tx = lx + o * (def.width * 0.5 + 0.1), ty = -def.height * 0.85;
      const dx = tx - f.x, dy = ty - f.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= ex.tether.speed || !ledgeFree(s, side, e.tether)) {
        if (ledgeFree(s, side, e.tether)) { grabLedge(s, side, f, e, def, e.tether, ev); return; }
        e.tether = -1;
      } else {
        e.ovx = (dx / d) * ex.tether.speed; e.ovy = (dy / d) * ex.tether.speed;
      }
    }
  }
  if (md.blink && fr === md.blink.invuln[0]) f.invuln = Math.max(f.invuln, md.blink.invuln[1] - md.blink.invuln[0] + 1);
  if (md.blink && fr === md.blink.frame) doBlink(s, side, f, e, def, md.blink, ev);
  if (md.projectile && fr >= md.projectile.frame) spawnProjectiles(s, side, f, e, def, m, md, ev, fr - md.projectile.frame);
  // whiff: all strike frames passed without a hit
  if (!e.whiffSent) {
    let last = 0;
    for (const h of md.hitboxes) if (h.to > last) last = h.to;
    if (fr > last) {
      e.whiffSent = true;
      if (!e.hitThisMove) {
        ev.push({ t: 'whiff', tick: s.tick, side, move: m });
        ctlOf(s).track[side].since.myWhiffs++;
      }
    }
  }
  if (md.kind === 'throw') {
    const h = md.hitboxes[0];
    if (fr === h.from) {
      const tgt = s.fighters[1 - side];
      if (tgt.action === 'held') {
        tgt.action = 'hitstun';
        applyHit(s, side, (1 - side) as Side, h, m, 0, f.facing, ev, false);
      }
    }
  }
  if (fr >= total) {
    f.move = null;
    if (f.grounded) setAction(f, 'idle');
    else setAction(f, ex.helpless ? 'helpless' : 'fall');
  }
}

// ------------------------------------------------------------------------------------------------
// Abilities: blink, shots (fans, lobs, placed hazards, tethers)
// ------------------------------------------------------------------------------------------------

/** vanish and reappear: dx ahead, or just behind an opponent standing within `behind` metres ahead; never further off the deck */
function doBlink(s: FightState, side: Side, f: FighterState, e: Eng, def: FighterDef, b: NonNullable<MoveDef['blink']>, ev: SimEvent[]): void {
  const o = s.fighters[1 - side];
  const od = FIGHTERS[o.fighter];
  const fromX = f.x, fromY = f.y;
  let tx = f.x + f.facing * b.dx;
  let behind = false;
  const ahead = (o.x - f.x) * f.facing;
  const live = o.action !== 'dead' && o.action !== 'respawn' && o.action !== 'entrance' && o.action !== 'ledgehang' && o.action !== 'ledgeclimb';
  if (live && ahead > -0.2 && ahead < b.behind && Math.abs(o.y - f.y) < 1.5) {
    tx = o.x + f.facing * (od.width * 0.5 + def.width * 0.5 + 0.25);
    behind = true;
  }
  const m = ARENA.main;
  if (f.grounded) {
    const p = f.platform === -1 ? m : ARENA.soft[f.platform];
    tx = clamp(tx, p.x0 + 0.3, p.x1 - 0.3);
  } else {
    // in the air: never end further out than it started or than just inside the ledge
    tx = clamp(tx, Math.min(f.x, m.x0 + 0.4), Math.max(f.x, m.x1 - 0.4));
  }
  f.x = tx;
  e.ovx = 0; e.kvx = 0;
  if (behind) f.facing = (-f.facing) as 1 | -1;
  e.blinkTick = s.tick;
  ev.push({ t: 'blink', tick: s.tick, side, fromX, fromY, toX: f.x, toY: f.y, behind });
}

export function projDef(s: FightState, p: Projectile): NonNullable<MoveDef['projectile']> {
  return FIGHTERS[s.fighters[p.owner].fighter].moves[p.move || 'special'].projectile!;
}

function spawnProjectiles(s: FightState, side: Side, f: FighterState, e: Eng, def: FighterDef, m: MoveId, md: MoveDef, ev: SimEvent[], dt: number): void {
  const pr = md.projectile!;
  const shots: { vx: number; vy: number; delay?: number }[] = pr.fan && pr.fan.length ? pr.fan : [{ vx: pr.vx, vy: pr.vy }];
  let maxD = 0;
  for (const sh of shots) if ((sh.delay || 0) > maxD) maxD = sh.delay || 0;
  if (dt > maxD) return;
  if (dt === 0) {
    // one volley of each move in flight per fighter (a hazard lying on the floor does not count; a new one replaces it)
    e.volley = s.tick; e.vHits = 0;
    for (const p of s.projectiles) if (p.owner === side && (p.move || 'special') === m && !p.floor) { e.volley = -1; break; }
  }
  if (e.volley < 0) return;
  for (let k = 0; k < shots.length; k++) {
    if ((shots[k].delay || 0) !== dt) continue;
    const id = (e.volley * 8 + side * 4 + k) % 1000000;
    const px = f.x + f.facing * (def.width * 0.5 + 0.4), py = f.y + (pr.y !== undefined ? pr.y : def.height * 0.62);
    const p: Projectile = { id, owner: side, kind: pr.kind, x: px, y: py, vx: shots[k].vx * f.facing, vy: shots[k].vy, r: pr.r, life: pr.life, move: m };
    if (pr.gravity) p.g = pr.gravity;
    if (pr.effect) p.effect = pr.effect; else if (pr.linger) p.effect = 'burn';
    if (pr.tether) p.tether = true;
    if (pr.fan && e.vHits > 0) { p.n = e.vHits; if (e.vHits >= (pr.fanHits || 1)) p.cd = 1; }
    s.projectiles.push(p);
    ev.push({ t: 'projectile', tick: s.tick, side, kind: pr.kind, x: px, y: py });
    if (pr.place !== undefined && pr.linger) {
      // placed: straight onto the floor ahead, if there is floor there (else it is lobbed from where it is)
      const plat = f.grounded ? (f.platform === -1 ? ARENA.main : ARENA.soft[f.platform]) : null;
      const x = f.x + f.facing * pr.place;
      if (plat) { p.x = clamp(x, plat.x0 + 0.2, plat.x1 - 0.2); makeHazard(s, p, pr, f.y, ev); }
    }
  }
}

/** a projectile comes to rest on the floor as a hazard (one per owner: an older one is removed) */
function makeHazard(s: FightState, p: Projectile, pr: NonNullable<MoveDef['projectile']>, y: number, ev: SimEvent[]): void {
  for (const q of s.projectiles) {
    if (q !== p && q.owner === p.owner && q.floor && q.life > 0) {
      q.life = 0;
      ev.push({ t: 'hazard', tick: s.tick, side: p.owner, id: q.id, kind: q.kind, x: q.x, y: q.y, r: q.r, state: 'replaced' });
    }
  }
  p.floor = true; p.y = y; p.vx = 0; p.vy = 0; p.g = undefined; delete p.g;
  p.r = pr.floorR || pr.r; p.life = pr.linger!; p.cd = 0;
  ev.push({ t: 'hazard', tick: s.tick, side: p.owner, id: p.id, kind: p.kind, x: p.x, y: p.y, r: p.r, state: 'placed' });
}

/** a tether's catch is reeled in to the owner's front, then held (and slammed when the move has a command slam) */
function stepDrag(s: FightState, ev: SimEvent[]): void {
  const ctl = ctlOf(s);
  for (let i = 0; i < 2; i++) {
    const te = ctl.eng[i];
    if (!te.drag) continue;
    const t = s.fighters[i];
    const by = (1 - i) as Side;
    const o = s.fighters[by];
    let tp: Projectile | null = null;
    for (const p of s.projectiles) if (p.owner === by && p.tether && p.drag) tp = p;
    const ownerOk = o.action !== 'hitstun' && o.action !== 'dead' && o.action !== 'respawn' && o.action !== 'held' && o.action !== 'knockdown' &&
      o.action !== 'shieldbreak' && o.action !== 'ledgehang' && o.action !== 'ledgeclimb' && s.phase !== 'over';
    if (!ownerOk || te.drag > 45 || t.action !== 'hitstun') {
      te.drag = 0; t.pulled = false;
      if (t.action === 'hitstun') t.hitstun = Math.min(t.hitstun, 6);
      if (tp) tp.life = 0;
      continue;
    }
    if (t.hitlag > 0) continue;
    te.drag++;
    const od = FIGHTERS[o.fighter], td = FIGHTERS[t.fighter];
    const tx = o.x + o.facing * (od.width * 0.5 + td.width * 0.5 + 0.05), ty = o.y;
    const dx = tx - t.x, dy = ty - t.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const sp = 0.42;
    if (d <= sp) {
      t.x = tx; t.y = ty;
      te.drag = 0; t.pulled = false;
      if (tp) tp.life = 0;
      const mv = tp && tp.move ? tp.move : 'special';
      doGrab(s, by, i as Side, moveExtra(o.fighter, mv).cmd ? mv : 'grab', ev);
      continue;
    }
    t.x += (dx / d) * sp; t.y += (dy / d) * sp;
    t.grounded = false; t.platform = -2;
    if (tp) { tp.x = t.x; tp.y = t.y + td.height * 0.5; }
  }
}

function breakShield(s: FightState, side: Side, f: FighterState, e: Eng, ev: SimEvent[]): void {
  f.shield = 0;
  setAction(f, 'shieldbreak');
  e.ovy = 0;
  ev.push({ t: 'shield_break', tick: s.tick, side });
}

function ledgeFree(s: FightState, side: Side, l: number): boolean {
  const o = s.fighters[1 - side];
  return !(o.ledge === l && (o.action === 'ledgehang' || o.action === 'ledgeclimb'));
}

function grabLedge(s: FightState, side: Side, f: FighterState, e: Eng, def: FighterDef, l: number, ev: SimEvent[]): void {
  const lx = LEDGE_X[l];
  const o = lx < 0 ? -1 : 1;
  f.ledge = l;
  f.x = lx + o * (def.width * 0.5 + 0.1);
  f.y = -def.height * 0.85;
  f.facing = (-o) as 1 | -1;
  f.grounded = false; f.platform = -2;
  e.ovx = 0; e.ovy = 0; e.kvx = 0; e.kvy = 0; f.vx = 0; f.vy = 0;
  f.move = null; f.fastFall = false; f.tumble = false;
  f.airJumpsLeft = def.airJumps;
  e.airDodgeUsed = false; e.used1 = false; e.used2 = false;
  if (!e.ledgeInvUsed) { f.invuln = Math.max(f.invuln, 40); e.ledgeInvUsed = true; }
  setAction(f, 'ledgehang');
  ev.push({ t: 'ledge', tick: s.tick, side, ledge: l });
  const tr = ctlOf(s).track[side];
  if (tr.offstage) { tr.cur.recoveredLow++; tr.offstage = false; }
}

// ------------------------------------------------------------------------------------------------
// Physics
// ------------------------------------------------------------------------------------------------

function physics(s: FightState, side: Side, f: FighterState, e: Eng, def: FighterDef, inp: Input, ev: SimEvent[]): void {
  const a = f.action;
  if (a === 'ledgehang' || a === 'ledgeclimb' || a === 'held' || a === 'dead' || a === 'respawn' || a === 'entrance' || e.drag > 0) {
    f.vx = 0; f.vy = 0;
    return;
  }
  const T = s.tick;
  if (f.grounded) {
    // ground movement
    const moving = a === 'walk' || a === 'run';
    if (a === 'run') {
      const target = f.facing * def.runSpeed;
      e.ovx = approach(e.ovx, target, 0.03);
    } else if (a === 'walk') {
      e.ovx = approach(e.ovx, inp.mx * def.walkSpeed * 1.2, 0.02);
    } else if (a === 'roll') {
      e.ovx = f.actionFrame <= 20 ? e.rollDir * 0.115 : 0;
    } else if (a === 'attack' && f.move) {
      const ex = moveExtra(f.fighter, f.move);
      if (!(ex.fwd && f.actionFrame >= ex.fwd[0] && f.actionFrame <= ex.fwd[1])) e.ovx = approach(e.ovx, 0, def.traction);
    } else if (a === 'getup' && e.ledgeAct === 'roll') {
      // set in advance
    } else {
      e.ovx = approach(e.ovx, 0, a === 'skid' ? def.traction * 2 : def.traction);
    }
    // knockback slide on the ground
    if (e.kvx !== 0 || e.kvy !== 0) {
      const mag = Math.sqrt(e.kvx * e.kvx + e.kvy * e.kvy);
      const nm = mag - DECAY * 2;
      if (nm <= 0) { e.kvx = 0; e.kvy = 0; } else { e.kvx *= nm / mag; e.kvy *= nm / mag; }
    }
    if (e.ovy > 0 || e.kvy > 0) {
      f.grounded = false; f.platform = -2;
    } else {
      e.ovy = 0;
      const nx = f.x + e.ovx + e.kvx;
      const p = f.platform === -1 ? ARENA.main : ARENA.soft[f.platform];
      const canLeave = moving || a === 'hitstun' || a === 'skid';
      if (nx < p.x0 || nx > p.x1) {
        if (canLeave) {
          f.x = nx; f.grounded = false; f.platform = -2;
          if (a === 'walk' || a === 'run' || a === 'skid') setAction(f, 'fall');
        } else {
          f.x = nx < p.x0 ? p.x0 : p.x1;
          e.ovx = 0; e.kvx = 0;
        }
      } else f.x = nx;
      f.vx = e.ovx + e.kvx; f.vy = 0;
      return;
    }
  }

  // airborne
  const py = f.y;
  if (a === 'hitstun' && f.hitstun > 0 || e.doomed) {
    const st = { x: f.x, y: f.y, ovy: e.ovy, kvx: e.kvx, kvy: e.kvy };
    st.x += e.ovx; // own horizontal velocity is zeroed on launch, kept for flinches
    launchTick(st, def.gravity, def.fallSpeed);
    f.x = st.x; f.y = st.y; e.ovy = st.ovy; e.kvx = st.kvx; e.kvy = st.kvy;
  } else {
    // drift
    let drift = def.airAccel;
    if (a === 'helpless' || a === 'airdodge') drift *= 0.6;
    const ex = a === 'attack' && f.move ? moveExtra(f.fighter, f.move) : null;
    const scripted = ex && ((ex.fwd && f.actionFrame >= ex.fwd[0] && f.actionFrame <= ex.fwd[1]) ||
      (ex.aimed && f.actionFrame >= ex.aimed.from && f.actionFrame <= ex.aimed.to) || (ex.tether && e.tether >= 0));
    if (!scripted) e.ovx = approach(e.ovx, inp.mx * def.airSpeed, drift);
    const upScripted = ex && ((ex.up && f.actionFrame >= ex.up[0] && f.actionFrame <= ex.up[1]) ||
      (ex.aimed && f.actionFrame >= ex.aimed.from && f.actionFrame <= ex.aimed.to) || (ex.tether && e.tether >= 0));
    if (!upScripted) {
      if (inp.fastfall && e.ovy < 0.02 && a !== 'helpless') f.fastFall = true;
      const fall = f.fastFall ? def.fastFallSpeed : def.fallSpeed;
      e.ovy -= def.gravity;
      if (f.fastFall && e.ovy > -fall) e.ovy = -fall;
      if (e.ovy < -fall) e.ovy = -fall;
    }
    if (a === 'airdodge' && f.actionFrame < 20) { e.ovx *= 0.9; e.ovy = Math.max(e.ovy, -0.05); }
    const mag = Math.sqrt(e.kvx * e.kvx + e.kvy * e.kvy);
    if (mag > 0) {
      const nm = mag - DECAY;
      if (nm <= 0) { e.kvx = 0; e.kvy = 0; } else { e.kvx *= nm / mag; e.kvy *= nm / mag; }
    }
    f.x += e.ovx + e.kvx;
    f.y += e.ovy + e.kvy;
  }
  f.vx = e.ovx + e.kvx;
  f.vy = e.ovy + e.kvy;

  // deck body: sides and underside
  const hw = def.width * 0.5;
  const m = ARENA.main;
  if (f.y < 0 && f.y + def.height > DECK_BOTTOM && f.x > m.x0 - hw && f.x < m.x1 + hw) {
    if (py >= -0.0001 && f.vy <= 0) {
      // coming from above: handled by landing below
    } else if (py + def.height <= DECK_BOTTOM + 0.0001 && f.vy > 0) {
      f.y = DECK_BOTTOM - def.height; e.ovy = 0; e.kvy = e.kvy > 0 ? -e.kvy * 0.3 : e.kvy;
    } else {
      f.x = f.x < 0 ? m.x0 - hw : m.x1 + hw;
      e.ovx = 0; e.kvx = -e.kvx * 0.3;
    }
  }

  // landing
  if (f.vy <= 0 && !e.doomed) {
    let landed = -3;
    if (py >= -0.0001 && f.y <= 0 && f.x >= m.x0 - 0.05 && f.x <= m.x1 + 0.05) landed = -1;
    else if (e.dropThrough <= 0 && !(inp.drop && a !== 'hitstun')) {
      for (let i = 0; i < ARENA.soft.length; i++) {
        const p = ARENA.soft[i];
        if (py >= p.y - 0.0001 && f.y <= p.y && f.x >= p.x0 && f.x <= p.x1) { landed = i; break; }
      }
    }
    if (landed !== -3) {
      const p = landed === -1 ? m : ARENA.soft[landed];
      land(s, side, f, e, def, landed, p.y, inp, ev);
    }
  }

  // ledge grab
  if (!f.grounded && f.action !== 'ledgehang') tryLedge(s, side, f, e, def, ev);

  // offstage tracking for the recover habits
  const tr = ctlOf(s).track[side];
  if (!f.grounded && (f.x < m.x0 - 0.3 || f.x > m.x1 + 0.3)) tr.offstage = true;
  void T;
}

/**
 * Grounded bodies never share space: they are pushed apart to half the sum of their widths at once, and a
 * fighter that would run or lunge through the other stops at its body (crossing is a jump over or a roll).
 */
function separate(s: FightState, ox0: number, ox1: number): void {
  const a = s.fighters[0], b = s.fighters[1];
  if (!a.grounded || !b.grounded || a.platform !== b.platform) return;
  const busy = (f: FighterState) => f.action === 'held' || f.action === 'holding' || f.action === 'dead' || f.action === 'respawn' || f.action === 'roll' ||
    f.action === 'getup' || f.action === 'ledgeclimb' || f.action === 'spotdodge' && false;
  if (busy(a) || busy(b)) return;
  const ea0 = ctlOf(s).eng[0], eb0 = ctlOf(s).eng[1];
  if (ea0.drag || eb0.drag) return;
  const da = FIGHTERS[a.fighter], db = FIGHTERS[b.fighter];
  const minGap = (da.width + db.width) * 0.5;
  // which side each was on before this tick's movement (after a blink: where it reappeared)
  if (ea0.blinkTick === s.tick || eb0.blinkTick === s.tick) { ox0 = a.x; ox1 = b.x; }
  let dir = ox1 > ox0 ? 1 : ox1 < ox0 ? -1 : 0;
  if (dir === 0) dir = b.x > a.x ? 1 : b.x < a.x ? -1 : (a.facing > 0 ? 1 : -1);
  const sep = (b.x - a.x) * dir; // signed: negative means they passed through each other
  if (sep >= minGap) return;
  const need = minGap - sep;
  const p = a.platform === -1 ? ARENA.main : ARENA.soft[a.platform];
  const mid = (a.x + b.x) * 0.5;
  let ax = mid - dir * minGap * 0.5, bx = mid + dir * minGap * 0.5;
  // against the end of the platform the other one takes the whole push
  if (ax < p.x0) { bx += p.x0 - ax; ax = p.x0; } else if (ax > p.x1) { bx -= ax - p.x1; ax = p.x1; }
  if (bx < p.x0) { ax += p.x0 - bx; bx = p.x0; } else if (bx > p.x1) { ax -= bx - p.x1; bx = p.x1; }
  // a rooted body stands its ground: the other one takes the whole push
  if (a.rooted && !b.rooted) { ax = a.x; bx = a.x + dir * minGap; } else if (b.rooted && !a.rooted) { bx = b.x; ax = b.x - dir * minGap; }
  a.x = clamp(ax, p.x0, p.x1); b.x = clamp(bx, p.x0, p.x1);
  void need;
  // momentum into the other body is spent
  const ea = ctlOf(s).eng[0], eb = ctlOf(s).eng[1];
  if (ea.ovx * dir > 0) ea.ovx = 0;
  if (eb.ovx * dir < 0) eb.ovx = 0;
}

function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}

function land(s: FightState, side: Side, f: FighterState, e: Eng, def: FighterDef, plat: number, y: number, inp: Input, ev: SimEvent[]): void {
  const a = f.action;
  const speed = -f.vy;
  f.y = y; f.grounded = true; f.platform = plat;
  e.ovy = 0; e.kvy = 0;
  f.airJumpsLeft = def.airJumps;
  e.airDodgeUsed = false; e.used1 = false; e.used2 = false; e.ledgeInvUsed = false;
  f.fastFall = false;
  const tr = ctlOf(s).track[side];
  if (tr.offstage) { tr.cur.recoveredHigh++; tr.offstage = false; }
  if (a === 'hitstun') {
    if (f.tumble) {
      if (e.techIntent || wantsTech(s, side)) {
        setAction(f, 'getup');
        e.ledgeAct = Math.abs(inp.mx) > 0.5 ? 'roll' : '';
        e.rollDir = inp.mx > 0 ? 1 : -1;
        f.invuln = Math.max(f.invuln, 20);
        f.hitstun = 0; f.tumble = false; e.kvx = 0; e.ovx = 0;
        ev.push({ t: 'tech', tick: s.tick, side, x: f.x, y: f.y });
      } else {
        setAction(f, 'knockdown');
        f.hitstun = 0; f.tumble = false; e.kvx *= 0.3;
        ev.push({ t: 'bounce', tick: s.tick, side, x: f.x, y: f.y });
      }
    }
    // landing out of a small launch ends the flinch almost at once (a root runs its full length, even one caught in the air)
    if (f.hitstun > 4 && !f.rooted) f.hitstun = 4;
    e.kvx *= 0.5;
    return;
  }
  ev.push({ t: 'land', tick: s.tick, side, x: f.x, y: f.y, hard: speed > def.fallSpeed * 1.05 });
  if (a === 'attack' && f.move) {
    const md = def.moves[f.move];
    const ex = moveExtra(f.fighter, f.move);
    if (md.kind === 'air') {
      e.lock = md.landingLag || 6;
      f.move = null;
      setAction(f, 'land');
      return;
    }
    if (ex.helpless || ex.up || ex.aimed) {
      e.lock = 14;
      f.move = null;
      setAction(f, 'land');
      return;
    }
    // ground-capable specials keep going on the ground
    return;
  }
  if (a === 'helpless') { e.lock = 16; setAction(f, 'land'); return; }
  if (a === 'airdodge') { e.lock = 10; setAction(f, 'land'); return; }
  e.lock = 3;
  setAction(f, 'land');
}

function tryLedge(s: FightState, side: Side, f: FighterState, e: Eng, def: FighterDef, ev: SimEvent[]): void {
  if (e.ledgeCd > 0 || e.doomed) return;
  const a = f.action;
  let ok = false;
  if (a === 'fall' || a === 'helpless' || a === 'airdodge') ok = true;
  else if (a === 'rise' && f.vy <= 0.02) ok = true;
  else if (a === 'attack' && f.move === 'recover' && f.actionFrame > 8) ok = true;
  else if (a === 'attack' && f.move && moveExtra(f.fighter, f.move).air === true && f.vy < 0 && def.moves[f.move].kind === 'special') ok = true;
  if (!ok) return;
  for (let l = 0; l < 2; l++) {
    const lx = LEDGE_X[l];
    const o = lx < 0 ? -1 : 1;
    const out = (f.x - lx) * o; // metres outside the ledge
    if (out < -0.4 || out > 1.4) continue;
    const hand = f.y + def.height * 0.85;
    if (hand < -0.9 || hand > 0.7) continue;
    if (!ledgeFree(s, side, l)) continue;
    grabLedge(s, side, f, e, def, l, ev);
    return;
  }
}

// ------------------------------------------------------------------------------------------------
// Projectiles
// ------------------------------------------------------------------------------------------------

function stepProjectiles(s: FightState, ev: SimEvent[]): void {
  const out: typeof s.projectiles = [];
  const m = ARENA.main;
  for (const p of s.projectiles) {
    if (p.life <= 0) continue; // replaced or spent
    if (p.floor) {
      p.life--;
      if (p.cd) p.cd--;
      if (p.life <= 0) { ev.push({ t: 'hazard', tick: s.tick, side: p.owner, id: p.id, kind: p.kind, x: p.x, y: p.y, r: p.r, state: 'expired' }); continue; }
      out.push(p);
      continue;
    }
    if (p.tether) {
      if (p.drag) { out.push(p); continue; } // the tip rides on the catch (stepDrag)
      const o = s.fighters[p.owner];
      if (o.action !== 'attack' || o.move !== (p.move || 'special')) continue; // the owner's move is over: the line is gone
    }
    const py = p.y;
    if (p.g) p.vy -= p.g;
    p.x += p.vx; p.y += p.vy;
    p.life--;
    if (outOfBlast(p.x, p.y)) continue;
    const pr = projDef(s, p);
    if (pr.linger && p.vy <= 0) {
      // comes to rest on a floor: the deck top, or a soft platform crossed from above
      let fy = NaN;
      if (py >= 0 && p.y <= 0 && p.x >= m.x0 && p.x <= m.x1) fy = 0;
      else for (const pl of ARENA.soft) if (py >= pl.y && p.y <= pl.y && p.x >= pl.x0 && p.x <= pl.x1) { fy = pl.y; break; }
      if (fy === fy) { makeHazard(s, p, pr, fy, ev); out.push(p); continue; }
    }
    if (p.life <= 0) continue;
    if (p.y < 0 && p.y > DECK_BOTTOM && p.x > m.x0 && p.x < m.x1) continue;
    out.push(p);
  }
  s.projectiles = out.filter((p) => p.life > 0);
}

// ------------------------------------------------------------------------------------------------
// Hits
// ------------------------------------------------------------------------------------------------

interface HitCand { by: Side; h: Hitbox; move: MoveId; group: number; dir: number; grab: boolean; proj: number; cx: number; cy: number }

/** the shield bubble shrinks as it weakens; a hit that reaches the body outside it gets through */
export function shieldCovers(t: FighterState, def: FighterDef, cx: number, cy: number, r: number): boolean {
  const R = Math.max(def.height, def.width) * 0.62 * (0.62 + 0.38 * Math.max(0, t.shield) / 100);
  const sx = t.x, sy = t.y + def.height * 0.5;
  const dx = cx - sx, dy = cy - sy;
  const rr = R + r * 0.8;
  return dx * dx + dy * dy <= rr * rr;
}

function vulnerable(f: FighterState): boolean {
  if (f.invuln > 0) return false;
  const a = f.action;
  return a !== 'dead' && a !== 'respawn' && a !== 'entrance' && a !== 'win' && a !== 'lose' && a !== 'ledgeclimb';
}

function activeHit(s: FightState, a: Side): HitCand | null {
  const f = s.fighters[a];
  if (f.action !== 'attack' || !f.move || f.hitlag > 0) return null;
  const def = FIGHTERS[f.fighter];
  const md = def.moves[f.move];
  if (md.kind === 'throw') return null;
  const ex = moveExtra(f.fighter, f.move);
  const t = s.fighters[1 - a];
  const tdef = FIGHTERS[t.fighter];
  const e = ctlOf(s).eng[a];
  if (!vulnerable(t) || ctlOf(s).eng[1 - a].doomed) return null; // a lethal launch is not interrupted
  const fr = f.actionFrame;
  for (let i = 0; i < md.hitboxes.length; i++) {
    const h = md.hitboxes[i];
    if (fr < h.from || fr > h.to) continue;
    let g = i;
    for (let j = 0; j < i; j++) if (md.hitboxes[j].from === h.from) { g = j; break; }
    if (e.hitMask & (1 << g)) continue;
    const cx = f.x + f.facing * h.x, cy = f.y + h.y;
    if (hitsBody(t, tdef, cx, cy, h.r)) {
      if (ex.grabbing) {
        if (!t.grounded || t.action === 'held' || t.action === 'holding') continue;
        if (ex.cmd && t.action === 'hitstun') continue;
      }
      const dir = Math.abs(h.x) < 0.3 ? (t.x >= f.x ? 1 : -1) : f.facing;
      return { by: a, h, move: f.move, group: g, dir, grab: !!ex.grabbing, proj: -1, cx, cy };
    }
  }
  return null;
}

function resolveHits(s: FightState, ev: SimEvent[]): void {
  const c0 = activeHit(s, 0);
  const c1 = activeHit(s, 1);
  // projectiles
  const pc: [HitCand | null, HitCand | null] = [null, null];
  for (let k = 0; k < s.projectiles.length; k++) {
    const p = s.projectiles[k];
    const tside = (1 - p.owner) as Side;
    const t = s.fighters[tside];
    if (!vulnerable(t) || pc[tside] || ctlOf(s).eng[tside].doomed || p.drag || p.life <= 0 || (!p.floor && p.cd)) continue;
    const pr = projDef(s, p);
    let touch: boolean;
    if (p.floor) {
      // a hazard on the floor: touches the feet of whoever stands (or lands) in it
      if (p.cd && p.cd > 0) continue;
      const hw = FIGHTERS[t.fighter].width * 0.5;
      touch = Math.abs(t.x - p.x) <= p.r + hw * 0.6 && t.y >= p.y - 0.15 && t.y <= p.y + 0.45 && (p.effect !== 'snare' || t.grounded) &&
        t.action !== 'held' && ctlOf(s).eng[tside].drag === 0;
    } else if (pr.linger) touch = false; // a lobbed hazard only works once it lies on the floor
    else touch = hitsBody(t, FIGHTERS[t.fighter], p.x, p.y, p.r) && !(p.tether && (t.action === 'held' || t.action === 'holding'));
    if (touch) {
      pc[tside] = { by: p.owner, h: { from: 0, to: 0, x: 0, y: 0, r: p.r, damage: pr.damage, angle: pr.angle, bkb: pr.bkb, kbg: pr.kbg }, move: p.move || 'special', group: 0,
        dir: p.floor ? (t.x >= p.x ? 1 : -1) : p.vx >= 0 ? 1 : -1, grab: false, proj: k, cx: p.x, cy: p.floor ? t.y + 0.3 : p.y };
    }
  }
  const on: [HitCand | null, HitCand | null] = [c1, c0]; // on[i] = what hits fighter i
  // strike beats grab
  if (on[0] && on[1]) {
    if (on[0].grab && on[1].grab) {
      // both grab: bounce apart
      for (let i = 0; i < 2; i++) {
        const f = s.fighters[i];
        setAction(f, 'idle'); ctlOf(s).eng[i].lock = 14; f.move = null;
      }
      ev.push({ t: 'clank', tick: s.tick, x: (s.fighters[0].x + s.fighters[1].x) / 2, y: 1 });
      on[0] = null; on[1] = null;
    } else if (on[0].grab && !on[1].grab) on[0] = null; // fighter 1 grabbed 0 but 0 strikes 1
    else if (on[1].grab && !on[0].grab) on[1] = null;
  }
  const doneProj: number[] = [];
  for (let i = 0; i < 2; i++) {
    const c = on[i];
    if (c) ctlOf(s).eng[c.by].hitMask |= 1 << c.group;
  }
  for (let i = 0; i < 2; i++) {
    const c = on[i];
    if (!c) continue;
    if (c.grab) doGrab(s, c.by, i as Side, c.move, ev);
    else strike(s, c, i as Side, ev);
  }
  for (let i = 0; i < 2; i++) {
    const c = pc[i];
    if (!c || on[i]) continue;
    const p = s.projectiles[c.proj];
    const res = strike(s, c, i as Side, ev);
    if (p.floor && p.effect === 'burn') { p.cd = projDef(s, p).every || 20; continue; }
    if (p.tether && res === 'pull') { p.drag = true; continue; }
    // a fan is coverage, not a multi-hit: once `fanHits` shots of the volley (default 1) have landed or been blocked, the rest are spent
    const ppr = projDef(s, p);
    if (!p.floor && ppr.fan) {
      const v = Math.floor(p.id / 4);
      const oe = ctlOf(s).eng[p.owner];
      let n = (p.n || 0) + 1;
      if (v === oe.volley * 2 + p.owner) { oe.vHits++; n = oe.vHits; }
      for (const q of s.projectiles) if (q !== p && q.owner === p.owner && Math.floor(q.id / 4) === v) { q.n = n; if (n >= (ppr.fanHits || 1)) q.cd = 1; }
    }
    if (p.floor) ev.push({ t: 'hazard', tick: s.tick, side: p.owner, id: p.id, kind: p.kind, x: p.x, y: p.y, r: p.r, state: 'sprung' });
    doneProj.push(c.proj);
  }
  if (doneProj.length) s.projectiles = s.projectiles.filter((_, k) => doneProj.indexOf(k) < 0);
}

function strike(s: FightState, c: HitCand, to: Side, ev: SimEvent[]): string {
  const t = s.fighters[to];
  const a = s.fighters[c.by];
  const ctl = ctlOf(s);
  const ae = ctl.eng[c.by];
  ae.hitThisMove = true;
  const isProj = c.proj >= 0;
  if ((t.action === 'shield' || t.action === 'shieldstun') && shieldCovers(t, FIGHTERS[t.fighter], c.cx, c.cy, c.h.r)) {
    const perfect = t.action === 'shield' && s.tick - ctl.eng[to].shieldStart <= PERFECT_SHIELD;
    const d = c.h.damage;
    const hl = Math.floor(d * 0.45 + 4);
    if (!perfect) {
      t.shield -= d * 1.19 + 1;
    }
    const sx = isProj ? s.projectiles[c.proj].x : t.x - c.dir * 0.4;
    const sy = isProj ? (s.projectiles[c.proj].floor ? t.y + 0.3 : s.projectiles[c.proj].y) : t.y + 1;
    if (isProj) ev.push({ t: 'shield_hit', tick: s.tick, by: c.by, to, move: 'projectile', x: sx, y: sy, shield: Math.max(0, t.shield), perfect, via: c.move });
    else ev.push({ t: 'shield_hit', tick: s.tick, by: c.by, to, move: c.move, x: sx, y: sy, shield: Math.max(0, t.shield), perfect });
    if (isProj && s.projectiles[c.proj].tether && a.action === 'attack' && a.move) {
      // a tether that meets a shield recoils: the thrower is left open for a while after its move
      const amd = FIGHTERS[a.fighter].moves[a.move];
      ae.lock = Math.max(ae.lock, amd.startup + amd.active + amd.recovery - a.actionFrame + 18);
    }
    s.stats[to].shieldsHeld++;
    ctl.track[c.by].since.shieldedByOpp++;
    ctl.lastExchange = s.tick;
    if (t.shield <= 0) { breakShield(s, to, t, ctl.eng[to], ev); return 'shield'; }
    t.hitlag = hl;
    if (!isProj) a.hitlag = hl + (perfect ? PARRY_FREEZE : 0); // a parry holds the attacker in place a moment longer
    if (!perfect) {
      setAction(t, 'shieldstun');
      ctl.eng[to].timer = Math.floor(d * 0.6 + 3);
      ctl.eng[to].ovx = c.dir * Math.min(0.2, 0.012 * d + 0.02);
    }
    if (!isProj && a.grounded) ae.ovx = -c.dir * 0.05;
    return 'shield';
  }
  const charge = !isProj && a.move ? a.charge : 0;
  if (!isProj && c.h.effect) return applyHit(s, c.by, to, c.h, c.move, 0, c.dir, ev, true, undefined, c.h.effect, c.h.effectTicks || 0);
  if (!isProj) return applyHit(s, c.by, to, c.h, c.move, charge, c.dir, ev, true);
  const p = s.projectiles[c.proj];
  const pr = projDef(s, p);
  return applyHit(s, c.by, to, c.h, 'projectile', 0, c.dir, ev, false, c.move, p.effect === 'pull' || p.effect === 'snare' ? p.effect : '', pr.effectTicks || 0);
}

function doGrab(s: FightState, by: Side, to: Side, move: MoveId, ev: SimEvent[]): void {
  const a = s.fighters[by], t = s.fighters[to];
  const ctl = ctlOf(s);
  const ae = ctl.eng[by], te = ctl.eng[to];
  ae.hitThisMove = true;
  // drop the target's own grab or move
  setAction(a, 'holding');
  // a command grab (special or special2 with a command throw) holds, then throws on its own timer
  ae.cmd = (move === 'special' || move === 'special2') && !!moveExtra(a.fighter, move).cmd;
  a.move = ae.cmd ? move : null;
  ae.holdTimer = 0;
  ae.ovx = 0; te.ovx = 0; te.kvx = 0; te.kvy = 0;
  setAction(t, 'held');
  t.move = null; t.hitstun = 0; t.tumble = false; t.rooted = 0; t.pulled = false; te.drag = 0;
  if (t.ledge >= 0) t.ledge = -1;
  s.stats[by].grabsLanded++;
  ctl.track[by].since.myGrabs++;
  ctl.track[to].since.oppGrabs++;
  ctl.lastExchange = s.tick;
  ev.push({ t: 'grab', tick: s.tick, by, to });
  if (ae.cmd) ev.push({ t: 'throw', tick: s.tick, by, to, move });
  placeHeld(s, to);
}

function placeHeld(s: FightState, side: Side): void {
  const t = s.fighters[side];
  if (t.action !== 'held') return;
  const h = s.fighters[1 - side];
  if (h.action !== 'holding' && !(h.action === 'attack' && h.move && FIGHTERS[h.fighter].moves[h.move].kind === 'throw')) {
    setAction(t, t.grounded ? 'idle' : 'fall');
    return;
  }
  const hd = FIGHTERS[h.fighter], td = FIGHTERS[t.fighter];
  t.x = h.x + h.facing * (hd.width * 0.5 + td.width * 0.5 + 0.05);
  t.y = h.y;
  t.grounded = h.grounded; t.platform = h.platform;
  t.facing = (-h.facing) as 1 | -1;
  t.vx = 0; t.vy = 0;
}

function releaseGrab(s: FightState, holder: Side): void {
  const h = s.fighters[holder], t = s.fighters[1 - holder];
  const ctl = ctlOf(s);
  setAction(h, 'idle'); ctl.eng[holder].lock = 10; ctl.eng[holder].ovx = -h.facing * 0.08;
  if (t.action === 'held') { setAction(t, 'idle'); ctl.eng[1 - holder].lock = 6; ctl.eng[1 - holder].ovx = h.facing * 0.1; }
}

export function strengthOf(kb: number): HitStrength {
  return kb < 45 ? 'light' : kb < 90 ? 'medium' : 'heavy';
}

function applyHit(s: FightState, by: Side, to: Side, h: Hitbox, move: MoveId | 'projectile', charge: number, dir: number, ev: SimEvent[], frozeAttacker: boolean,
  via?: MoveId, effect: '' | 'pull' | 'snare' = '', effectTicks = 0): string {
  const ctl = ctlOf(s);
  const a = s.fighters[by], t = s.fighters[to];
  const te = ctl.eng[to];
  const tdef = FIGHTERS[t.fighter];
  const md = move !== 'projectile' ? FIGHTERS[a.fighter].moves[move] : null;
  const cm = md && md.maxCharge ? 1 + (0.4 * charge) / md.maxCharge : 1;
  // stale moves: a move that keeps landing does less (the genre's own rule), a fresh one a little more
  const ae = ctl.eng[by];
  const code = move === 'projectile' ? MOVE_CODE[via || 'special'] : MOVE_CODE[move];
  let sm = 1.05;
  for (let i = 0; i < ae.stale.length; i++) if (ae.stale[i] === code) { if (sm > 1) sm = 1; sm -= STALE[i]; }
  ae.stale.unshift(code);
  if (ae.stale.length > 9) ae.stale.length = 9;
  const d = Math.round(h.damage * cm * sm * 10) / 10;
  // the target lets go of anything it holds
  if (t.action === 'holding') {
    const other = s.fighters[1 - to];
    if (other.action === 'held') { setAction(other, other.grounded ? 'idle' : 'fall'); }
  }
  t.damage = Math.min(999, Math.round((t.damage + d) * 10) / 10);
  s.stats[by].damageDealt = Math.round((s.stats[by].damageDealt + d) * 10) / 10;
  s.stats[by].hitsLanded++;
  ctl.track[by].since.dealt += d; ctl.track[by].since.myHits++;
  ctl.track[to].since.taken += d; ctl.track[to].since.oppHits++;
  ctl.lastExchange = s.tick;
  // combo
  const inString = te.comboBy === by && (t.action === 'hitstun' || t.action === 'held' || s.tick - te.lastHitTick < 40 && (t.action === 'knockdown' || t.action === 'fall' || t.action === 'land'));
  if (inString) { te.combo++; te.comboDmg += d; } else { te.combo = 1; te.comboDmg = d; te.comboBy = by; }
  if (te.comboDmg > s.stats[by].bestCombo) s.stats[by].bestCombo = Math.round(te.comboDmg * 10) / 10;
  te.lastHitBy = by; te.lastHitTick = s.tick; te.lastMove = move;

  let kb = knockback(t.damage, d, tdef.weight, h, s.kbScale);
  let ang = h.angle;
  if (ang === 361) ang = t.grounded && kb < 60 ? 0 : 40;
  let lx = cosDeg(ang) * dir;
  let ly = sinDeg(ang);
  const hl0 = hitlagFor(kb, md && move !== 'projectile' ? earlyHit(md, h) : false);
  const hx = t.x, hy = t.y + tdef.height * 0.5;
  // a hit frees: no longer rooted or reeled in; a tether of the one hit is gone, and its catch is let go
  t.rooted = 0; t.pulled = false; te.drag = 0;
  for (const p of s.projectiles) if (p.owner === to && p.tether) p.life = 0;
  {
    const oe = ctl.eng[by];
    if (oe.drag) { oe.drag = 0; a.pulled = false; if (a.action === 'hitstun') a.hitstun = Math.min(a.hitstun, 6); }
  }

  if (t.armor && move !== 'projectile' && md && md.kind !== 'throw') {
    // super armour: damage, hit pause, no flinch
    t.hitlag = hl0; if (frozeAttacker) a.hitlag = hl0;
    ev.push({ t: 'hit', tick: s.tick, by, to, move, damage: d, total: t.damage, x: hx, y: hy, dx: lx, dy: ly, kb: 0, hitlag: hl0, strength: 'light', combo: te.combo });
    return 'armor';
  }
  if (effect) {
    // a pull or a snare: damage and a short hit pause, no launch
    if (t.ledge >= 0) { t.ledge = -1; t.grounded = false; t.platform = -2; }
    t.move = null; t.charge = 0; t.fastFall = false;
    te.ovx = 0; te.ovy = 0; te.kvx = 0; te.kvy = 0; te.doomed = false;
    te.airDodgeUsed = false; te.used1 = false; te.used2 = false;
    setAction(t, 'hitstun');
    t.tumble = false; t.kbx = 0; t.kby = 0;
    const ticks = effect === 'pull' ? 90 : Math.max(1, effectTicks);
    t.hitstun = ticks; te.hsTotal = ticks;
    t.hitlag = 5;
    if (frozeAttacker) a.hitlag = 5;
    if (effect === 'pull') { te.drag = 1; t.pulled = true; } else t.rooted = ticks;
    if (via) ev.push({ t: 'hit', tick: s.tick, by, to, move, damage: d, total: t.damage, x: hx, y: hy, dx: 0, dy: 0, kb: 0, hitlag: 5, strength: 'light', combo: te.combo, via });
    else ev.push({ t: 'hit', tick: s.tick, by, to, move, damage: d, total: t.damage, x: hx, y: hy, dx: 0, dy: 0, kb: 0, hitlag: 5, strength: 'light', combo: te.combo });
    if (effect === 'pull') ev.push({ t: 'pull', tick: s.tick, by, to, x: t.x, y: t.y });
    else ev.push({ t: 'snare', tick: s.tick, by, to, x: t.x, y: t.y, ticks });
    return effect;
  }
  // DI from the target's hands
  const di = chooseDI(s, to, lx, ly);
  const cross = lx * di[1] - ly * di[0];
  const dl = Math.sqrt(di[0] * di[0] + di[1] * di[1]);
  if (dl > 0.1 && kb > 30) {
    const rot = 15 * cross / dl;
    const c = cosDeg(rot), sn = sinDeg(rot);
    const nx = lx * c - ly * sn, ny = lx * sn + ly * c;
    lx = nx; ly = ny;
  }
  let hitstun = Math.floor(kb * 0.4);
  const tumble = kb > 80;
  const speed = kb * LAUNCH;
  if (t.grounded && ly < -0.05) {
    ly = -ly * 0.8;
    ev.push({ t: 'bounce', tick: s.tick, side: to, x: t.x, y: t.y });
  }
  te.ovx = 0; te.ovy = 0;
  if (t.grounded && Math.abs(ly) < 0.05) {
    te.kvx = lx * speed; te.kvy = 0;
  } else {
    te.kvx = lx * speed; te.kvy = ly * speed;
    t.grounded = false; t.platform = -2;
    if (ly > 0) t.y += 0.01;
  }
  t.ledge = -1;
  t.move = null; t.charge = 0; t.fastFall = false;
  setAction(t, 'hitstun');
  t.tumble = tumble;
  t.kbx = te.kvx; t.kby = te.kvy;
  // getting hit gives the up special and the air dodge back, but not a double jump already spent (the genre's rule):
  // a recovery that gets hit out there has less to come back with
  te.airDodgeUsed = false; te.used1 = false; te.used2 = false;
  te.doomed = false;
  // lethal: forward simulation of this launch with no control
  let strength = strengthOf(kb);
  let hl = hl0;
  if (!t.grounded || te.kvy !== 0) {
    const lt = lethalTicks(t.x, t.y, te.kvx, te.kvy, tdef, hitstun);
    if (lt > 0) {
      strength = 'lethal';
      te.doomed = true;
      hitstun = Math.max(hitstun, lt + 2);
      hl = HITLAG_LETHAL;
    }
  }
  t.hitstun = hitstun;
  te.hsTotal = hitstun;
  t.hitlag = hl;
  if ((strength === 'heavy' || strength === 'lethal') && s.plans[by].order === 'kill') s.plans[by].order = 'none';
  if (frozeAttacker) a.hitlag = hl;
  if (via) ev.push({ t: 'hit', tick: s.tick, by, to, move, damage: d, total: t.damage, x: hx, y: hy, dx: lx, dy: ly, kb: Math.round(kb * 10) / 10, hitlag: hl, strength, combo: te.combo, via });
  else ev.push({ t: 'hit', tick: s.tick, by, to, move, damage: d, total: t.damage, x: hx, y: hy, dx: lx, dy: ly, kb: Math.round(kb * 10) / 10, hitlag: hl, strength, combo: te.combo });
  return 'hit';
}

// ------------------------------------------------------------------------------------------------
// KOs
// ------------------------------------------------------------------------------------------------

function checkKo(s: FightState, side: Side, ev: SimEvent[]): boolean {
  const f = s.fighters[side];
  if (f.action === 'dead' || f.action === 'respawn' || s.phase === 'over') return false;
  const edge = outOfBlast(f.x, f.y);
  if (!edge) return false;
  const ctl = ctlOf(s);
  const e = ctl.eng[side];
  const other = (1 - side) as Side;
  f.lives--;
  s.stats[other].kos++;
  const credited = e.lastHitBy >= 0 && s.tick - e.lastHitTick < 900;
  ev.push({ t: 'ko', tick: s.tick, side, by: other, x: f.x, y: f.y, edge, damage: f.damage, move: credited ? (e.lastMove as MoveId | 'projectile') : null, livesLeft: f.lives });
  if (ctl.firstKo < 0) ctl.firstKo = s.tick;
  ctl.lastExchange = s.tick;
  // if the holder dies the target is free
  const o = s.fighters[other];
  if (o.action === 'held') setAction(o, 'fall');
  setAction(f, 'dead');
  f.x = clamp(f.x, ARENA.blast.left, ARENA.blast.right);
  f.y = clamp(f.y, ARENA.blast.bottom, ARENA.blast.top);
  f.vx = 0; f.vy = 0; e.ovx = 0; e.ovy = 0; e.kvx = 0; e.kvy = 0;
  f.hitstun = 0; f.tumble = false; f.ledge = -1; f.grounded = false; f.move = null;
  e.doomed = false; e.lastHitBy = -1; e.combo = 0; e.comboBy = -1;
  return true;
}

// ------------------------------------------------------------------------------------------------
// Observation history (for the hands' reaction delay) and the coaches' habit tracking
// ------------------------------------------------------------------------------------------------

function recordHist(s: FightState, T: number): void {
  const h = ctlOf(s).hist;
  const base = (T % HIST_N) * 2 * HF;
  for (let i = 0; i < 2; i++) {
    const f = s.fighters[i];
    const o = base + i * HF;
    h[o] = f.x; h[o + 1] = f.y; h[o + 2] = f.vx; h[o + 3] = f.vy;
    h[o + 4] = ACT_CODE[f.action]; h[o + 5] = f.move ? MOVE_CODE[f.move] : -1; h[o + 6] = f.actionFrame;
    h[o + 7] = (f.grounded ? 1 : 0) | (f.invuln > 0 ? 2 : 0) | (f.armor ? 4 : 0) | (f.tumble ? 8 : 0);
    h[o + 8] = f.damage; h[o + 9] = f.action === 'land' || f.action === 'knockdown' ? ctlOf(s).eng[i].lock : f.hitstun;
  }
}

function track(s: FightState, ev: SimEvent[]): void {
  const ctl = ctlOf(s);
  for (const e of ev) {
    if (e.t === 'move') {
      const h = ctl.track[e.side].cur;
      const kind = FIGHTERS[s.fighters[e.side].fighter].moves[e.move].kind;
      const ex = moveExtra(s.fighters[e.side].fighter, e.move);
      const pmd = FIGHTERS[s.fighters[e.side].fighter].moves[e.move].projectile;
      if (kind === 'grab' || ex.grabbing || (pmd && pmd.effect === 'pull')) h.grabs++;
      else if (pmd) h.shots++;
      else if (e.move !== 'recover') h.strikes++;
      if (e.move !== 'recover') {
        // swung into an opening, or swung first? (an opening: the opponent stuck in a move's end, a landing, a stun or a getup)
        const fe = ctl.track[e.side].fcur;
        fe.starts++;
        const o = s.fighters[1 - e.side];
        let open = o.action === 'land' || o.action === 'hitstun' || o.action === 'knockdown' || o.action === 'shieldbreak' || o.action === 'getup' ||
          o.action === 'helpless' || o.action === 'shieldstun' || o.action === 'held';
        if (o.action === 'attack' && o.move) {
          const md = FIGHTERS[o.fighter].moves[o.move];
          let last = md.startup + md.active;
          for (const hb of md.hitboxes) if (hb.to > last) last = hb.to;
          if (o.actionFrame > last) open = true;
        }
        if (open) fe.puns++;
      }
    } else if (e.t === 'dodge') ctl.track[e.side].cur.dodges++;
    else if (e.t === 'jump') ctl.track[e.side].cur.jumps++;
    else if (e.t === 'dash') {
      const o = s.fighters[1 - e.side];
      if (o.action !== 'dead' && o.action !== 'respawn') { const fe = ctl.track[e.side].fcur; if ((o.x - e.x) * e.dir > 0) fe.dashIn++; else fe.dashOut++; }
    }
  }
  for (let i = 0; i < 2; i++) {
    const f = s.fighters[i];
    if (f.action === 'shield' && f.actionFrame === 1) ctl.track[i].cur.shields++;
  }
  // approach / retreat sampling every 20 ticks
  if (s.tick % 20 === 0) {
    for (let i = 0; i < 2; i++) {
      const f = s.fighters[i], o = s.fighters[1 - i];
      const e = ctl.eng[i];
      const tr = ctl.track[i];
      const moved = f.x - e.prevX;
      const toward = o.x > f.x ? moved : -moved;
      const live = f.action !== 'dead' && f.action !== 'respawn' && o.action !== 'dead' && o.action !== 'respawn' && f.action !== 'hitstun';
      if (live && Math.abs(o.x - f.x) < 9) {
        if (toward > 0.7) tr.cur.approaches++;
        else if (toward < -0.7) tr.cur.retreats++;
      }
      e.prevX = f.x;
    }
  }
  // gap kept and shield time, while both are on the deck and in play
  {
    const a0 = s.fighters[0], b0 = s.fighters[1];
    if (a0.grounded && b0.grounded && a0.platform === -1 && b0.platform === -1 && a0.action !== 'hitstun' && b0.action !== 'hitstun' &&
      a0.action !== 'held' && b0.action !== 'held' && a0.action !== 'holding' && b0.action !== 'holding') {
      const g = Math.abs(a0.x - b0.x);
      for (let i = 0; i < 2; i++) {
        const fe = ctl.track[i].fcur;
        fe.gapSum += g; fe.n++;
        const ac = s.fighters[i].action;
        if (ac === 'shield' || ac === 'shieldstun') fe.shieldTicks++;
        // hovering just outside the opponent's threat range (bait's home)
        const oT = THREAT[s.fighters[1 - i].fighter];
        if (g > oT - 0.3 && g < oT + 1.3) fe.edge++;
      }
    }
    const busy = (f: FighterState) => f.action === 'dead' || f.action === 'respawn' || f.action === 'entrance' || f.action === 'hitstun' || f.action === 'held' ||
      f.action === 'holding' || f.action === 'ledgehang' || f.action === 'ledgeclimb' || f.action === 'knockdown' || f.action === 'getup';
    if (!busy(a0) && !busy(b0)) {
      for (let i = 0; i < 2; i++) {
        const f = s.fighters[i], o = s.fighters[1 - i];
        const fe = ctl.track[i].fcur;
        fe.m++;
        fe.absX += Math.abs(f.x);
        fe.toward += (o.x >= f.x ? 1 : -1) * f.vx;
        if (f.action === 'attack' || f.action === 'charge') fe.atk++;
        if (!f.grounded) fe.air++;
        if (f.grounded && (f.action === 'idle' || f.action === 'shield') && Math.abs(f.vx) < 0.01) fe.still++;
      }
    }
  }
  // the coach window rolls over at each plan boundary
  if (s.tick % 180 === 0) {
    for (let i = 0; i < 2; i++) {
      ctl.track[i].pprev = ctl.track[i].prev; ctl.track[i].prev = ctl.track[i].cur; ctl.track[i].cur = emptyHabits();
      ctl.track[i].fpprev = ctl.track[i].fprev; ctl.track[i].fprev = ctl.track[i].fcur; ctl.track[i].fcur = emptyFeel();
    }
  }
  // pacing: longest stretch without an exchange while both are in play
  const a = s.fighters[0], b = s.fighters[1];
  const inPlay = (f: FighterState) => f.action !== 'dead' && f.action !== 'respawn' && f.action !== 'entrance';
  if (!inPlay(a) || !inPlay(b)) ctl.lastExchange = s.tick;
  const gap = s.tick - ctl.lastExchange;
  if (gap > ctl.maxGap) ctl.maxGap = gap;
}
