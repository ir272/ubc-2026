// The hands: a frame-level controller that plays a fighter from the plan in force.
// Both sides run this exact code. It reads the opponent only through a delayed observation
// (a human reaction time of 10 to 14 ticks), its own fighter directly, and keeps its memory in
// s.ctl.hands[side] (plain JSON). Randomness comes from s.rng only.
import type { Action, FightHeader, FightState, FighterDef, FighterId, FighterState, MoveDef, MoveId, Plan, Projectile, Side } from './types.ts';
import { MOVE_IDS } from './types.ts';
import { ARENA, LEDGE_X } from './arena.ts';
import { FIGHTERS, kbAt, moveExtra } from './fighters.ts';
import { rnd } from './math.ts';
import type { Ctl, Input } from './engine.ts';

// ------------------------------------------------------------------------------------------------
// Shared observation codes (the engine records, the hands read)
// ------------------------------------------------------------------------------------------------

export const HIST_N = 20;
export const HF = 10;
export const ACTIONS: Action[] = [
  'entrance', 'idle', 'walk', 'run', 'skid', 'turn', 'jumpsquat', 'rise', 'fall', 'land', 'attack', 'charge', 'shield', 'shieldstun',
  'shieldbreak', 'roll', 'spotdodge', 'airdodge', 'holding', 'held', 'hitstun', 'knockdown', 'getup', 'ledgehang', 'ledgeclimb',
  'helpless', 'respawn', 'dead', 'win', 'lose',
];
export const ACT_CODE: Record<string, number> = {};
ACTIONS.forEach((a, i) => (ACT_CODE[a] = i));
export const MOVE_CODE: Record<string, number> = {};
MOVE_IDS.forEach((m, i) => (MOVE_CODE[m] = i));

// ------------------------------------------------------------------------------------------------
// Move summaries for decisions
// ------------------------------------------------------------------------------------------------

interface MoveInfo {
  id: MoveId;
  first: number; last: number; total: number;
  reach: number; // furthest front point
  back: number; // furthest back point (positive = behind)
  top: number; bottom: number;
  dmg: number;
  kb100: number; // knockback on a 100 kg target at 100%
  air: boolean; ground: boolean;
  grab: boolean;
  fwdDist: number; // forward travel from motion before the last active frame
}

const INFO: Record<string, Record<string, MoveInfo>> = {};
for (const fid of Object.keys(FIGHTERS)) {
  INFO[fid] = {};
  const def = FIGHTERS[fid as keyof typeof FIGHTERS];
  for (const m of MOVE_IDS) {
    const md = def.moves[m];
    const ex = moveExtra(def.id, m);
    let first = 999, last = 0, reach = -9, back = -9, top = -9, bottom = 9, dmg = 0, kb = 0;
    for (const h of md.hitboxes) {
      first = Math.min(first, h.from); last = Math.max(last, h.to);
      reach = Math.max(reach, h.x + h.r); back = Math.max(back, -h.x + h.r);
      top = Math.max(top, h.y + h.r); bottom = Math.min(bottom, h.y - h.r);
      dmg = Math.max(dmg, h.damage); kb = Math.max(kb, kbAt(h, 100, 100));
    }
    if (ex.cmd) { dmg = ex.cmd.hb.damage; kb = kbAt(ex.cmd.hb, 100, 100); }
    let fwd = 0;
    if (ex.fwd) for (let f = ex.fwd[0]; f <= Math.min(ex.fwd[1], last); f++) fwd += ex.fwd[2];
    INFO[fid][m] = {
      id: m, first: md.hitboxes.length ? first : md.startup + 1, last: md.hitboxes.length ? last : md.startup + 1,
      total: md.startup + md.active + md.recovery, reach, back, top, bottom, dmg, kb100: kb,
      air: ex.air, ground: ex.ground, grab: !!ex.grabbing, fwdDist: fwd,
    };
  }
}

/** how far the fighter threatens on the ground in about a dozen ticks (used for spacing) */
export const THREAT: Record<string, number> = {};
for (const fid of Object.keys(FIGHTERS)) {
  const def = FIGHTERS[fid as keyof typeof FIGHTERS];
  const I = INFO[fid];
  THREAT[fid] = Math.max(I.tilt.reach, I.grab.reach + def.runSpeed * 6, I.dash.reach + I.dash.fwdDist * 0.7, I.fair.reach + def.airSpeed * 10);
}

/** the special tools, found from the move data: a damaging shot, a floor hazard, a blink, a tether (ranged grab) */
export const SHOT: Record<string, MoveId | ''> = {};
export const WARD: Record<string, MoveId | ''> = {};
export const BLINK: Record<string, MoveId | ''> = {};
export const TETHER: Record<string, MoveId | ''> = {};
/** a travelling command grab (a pounce) and a stagger burst all round (a howl) */
export const POUNCE: Record<string, MoveId | ''> = {};
export const HOWL: Record<string, MoveId | ''> = {};
/** fighters whose game is the grab (a pounce, a tongue, a command grab): light fighters avoid their range */
const GRABBER: Record<string, boolean> = {};
/** where a lobbed hazard comes to rest (metres ahead of the thrower), and how far a tether reaches */
const WARD_DIST: Record<string, number> = {};
const TETHER_REACH: Record<string, number> = {};
for (const fid of Object.keys(FIGHTERS)) {
  const def = FIGHTERS[fid as FighterId];
  SHOT[fid] = ''; WARD[fid] = ''; BLINK[fid] = ''; TETHER[fid] = ''; POUNCE[fid] = ''; HOWL[fid] = '';
  for (const m of ['special', 'special2'] as MoveId[]) {
    const md = def.moves[m];
    if (md.blink) BLINK[fid] = m;
    const ex = moveExtra(def.id, m);
    if (ex.grabbing && ex.cmd && INFO[fid][m].fwdDist >= 2.5) POUNCE[fid] = m;
    if (md.hitboxes.some((h) => h.effect)) HOWL[fid] = m;
    if (ex.cmd) GRABBER[fid] = true;
    const pr = md.projectile;
    if (!pr) continue;
    if (pr.effect === 'pull') {
      TETHER[fid] = m;
      TETHER_REACH[fid] = def.width * 0.5 + 0.4 + pr.vx * pr.life + pr.r;
    } else if (pr.linger) {
      WARD[fid] = m;
      if (pr.place !== undefined) WARD_DIST[fid] = pr.place;
      else {
        let x = def.width * 0.5 + 0.4, y = pr.y !== undefined ? pr.y : def.height * 0.62, vy = pr.vy;
        for (let t = 0; t < pr.life && y > 0; t++) { vy -= pr.gravity; x += pr.vx; y += vy; }
        WARD_DIST[fid] = x;
      }
    } else if (!SHOT[fid]) SHOT[fid] = m;
  }
}

/** a fresh floor hazard of mine is down (one at a time: an old one, down two seconds, may be replaced) or one is still flying */
function myHazard(s: FightState, side: Side, m: MoveId): boolean {
  const linger = FIGHTERS[s.fighters[side].fighter].moves[m].projectile!.linger || 0;
  for (const p of s.projectiles) if (p.owner === side && (p.floor ? p.life > linger - 120 : (p.move || 'special') === m)) return true;
  return false;
}

// ------------------------------------------------------------------------------------------------
// Memory
// ------------------------------------------------------------------------------------------------

export function newHand(): Record<string, any> {
  return {
    delay: 12, err: 0, errT: 0,
    seq: '', seqT: 0, seqMove: '', seqDir: 0,
    shieldT: 0, wait: 0, appr: '', apprT: 0, dashT: 0, dashDir: 0,
    rec: '', recT: 0, deepT: -999, blkTick: -1, blkEnd: -1, blkX: 0, ledgeWait: -1, getupWait: -1, padWait: -1, pummel: -1, kill: false, specialDone: false,
    order: '', orderAt: -1, lastPlanTick: -1, oos: 0, airPlan: '', ffAt: 0, killSaid: false, cool: 0, shotCd: 0, punishT: 0,
    rd: '', rdUntil: 0, rdLast: -99, oGrab: 0, fStop: 0, intent: '', intentT: 0, band: '', danceDir: 1, abCd: 60,
  };
}

function hand(s: FightState, side: Side): Record<string, any> {
  return (s.ctl as Ctl).hands[side];
}

// ------------------------------------------------------------------------------------------------
// Observation of the opponent, delayed
// ------------------------------------------------------------------------------------------------

interface Obs {
  x: number; y: number; vx: number; vy: number; act: Action; move: MoveId | null; frame: number;
  grounded: boolean; invuln: boolean; armor: boolean; tumble: boolean; damage: number; hitstun: number;
}
const OBS: [Obs, Obs] = [mkObs(), mkObs()];
const OBS2: Obs = mkObs();
function mkObs(): Obs {
  return { x: 0, y: 0, vx: 0, vy: 0, act: 'idle', move: null, frame: 0, grounded: true, invuln: false, armor: false, tumble: false, damage: 0, hitstun: 0 };
}

function observe(s: FightState, who: Side, delay: number, out: Obs): Obs {
  const h = (s.ctl as Ctl).hist;
  const T = Math.max(0, s.tick - delay);
  const o = (T % HIST_N) * 2 * HF + who * HF;
  out.x = h[o]; out.y = h[o + 1]; out.vx = h[o + 2]; out.vy = h[o + 3];
  out.act = ACTIONS[h[o + 4]]; out.move = h[o + 5] >= 0 ? MOVE_IDS[h[o + 5]] : null; out.frame = h[o + 6];
  const fl = h[o + 7];
  out.grounded = (fl & 1) !== 0; out.invuln = (fl & 2) !== 0; out.armor = (fl & 4) !== 0; out.tumble = (fl & 8) !== 0;
  out.damage = h[o + 8]; out.hitstun = h[o + 9];
  return out;
}

// ------------------------------------------------------------------------------------------------
// Stance styles
// ------------------------------------------------------------------------------------------------

interface Style {
  dist: number; // preferred gap
  approach: number; // how readily it closes in
  attack: number; // per-tick chance to fire an air move that would hit
  shield: number; backoff: number; dodge: number; counter: number; jumpAway: number; // answers to a move it sees coming
  patience: number; // ticks without an exchange before it makes something happen
  center: boolean; // holds the middle
  poke: number; // preference for max-range pokes and shots
  punish: number; // chance to go for a seen opening
  oos: number; // out of shield punish chance
  antiAir: number;
  // reads on an approaching opponent: one decision per approach, made from where the approach is heading
  read: number; // chance to make a read at all
  rSpace: number; rDodge: number; rHop: number; rBack: number; rRun: number; rShield: number; rMeet: number;
  feint: number; // chance an approach stops short at the edge of the opponent's reach (draws a swing)
}

/** longest ground poke from a standstill (spacing for keep-away) */
const POKE: Record<string, number> = {};
/** the opponent's reach from a standstill with its fast options (jab, tilt, grab) */
const REACH: Record<string, number> = {};
/** a fighter's long lunge (a special that travels): keep-away's hit-and-run tool when it has no projectile */
const LUNGE: Record<string, MoveId | ''> = {};
for (const fid of Object.keys(FIGHTERS)) {
  const I = INFO[fid];
  let best: MoveId | '' = '', bl = 0;
  for (const m of ['special', 'special2'] as MoveId[]) {
    if (!I[m].ground || FIGHTERS[fid as keyof typeof FIGHTERS].moves[m].projectile) continue;
    if (I[m].fwdDist >= 1.5 && I[m].reach + I[m].fwdDist > bl) { bl = I[m].reach + I[m].fwdDist; best = m; }
  }
  LUNGE[fid] = best;
  POKE[fid] = Math.max(I.tilt.reach, I.jab.reach);
  REACH[fid] = Math.max(I.tilt.reach, I.jab.reach, I.grab.reach);
}

function styleFor(plan: Plan, me: FighterDef, opp: FighterDef, f: FighterState): Style {
  const ag = plan.aggression;
  const oppThreat = THREAT[opp.id];
  const rangeAdj = plan.range === 'close' ? -0.7 : plan.range === 'far' ? 0.9 : 0;
  let st: Style;
  switch (plan.stance) {
    case 'rush':
      st = { dist: 0.9 + rangeAdj * 0.5, approach: 0.9, attack: 0.22, shield: 0.3, backoff: 0.05, dodge: 0.1, counter: 0.5, jumpAway: 0.05,
        patience: 40, center: false, poke: 0.2, punish: 0.85, oos: 0.5, antiAir: 0.5,
        read: 0.6, rSpace: 0.15, rDodge: 0.05, rHop: 0, rBack: 0, rRun: 0, rShield: 0.3, rMeet: 0.5, feint: (1 - ag) * 0.6 };
      break;
    case 'keepaway':
      st = { dist: Math.max(POKE[me.id] + 1.2, oppThreat + 0.5) + rangeAdj, approach: 0.1, attack: 0.25, shield: 0.2, backoff: 0.8, dodge: 0.15, counter: 0.2, jumpAway: 0.3,
        patience: 260, center: false, poke: 1, punish: 0.6, oos: 0.35, antiAir: 0.4,
        read: 0.85, rSpace: 0.12, rDodge: 0.05, rHop: 0.33, rBack: 0, rRun: 0.5, rShield: 0, rMeet: 0, feint: 0 };
      break;
    case 'wall':
      st = { dist: POKE[me.id] + 0.1 + rangeAdj * 0.5, approach: 0.1, attack: 0.15, shield: 0.9, backoff: 0.05, dodge: 0.05, counter: 0.25, jumpAway: 0,
        patience: 170, center: true, poke: 0.5, punish: 0.6, oos: 0.95, antiAir: 0.95,
        read: 0.9, rSpace: 0.2, rDodge: 0.05, rHop: 0, rBack: 0, rRun: 0, rShield: 0.75, rMeet: 0, feint: 0 };
      break;
    default: // bait
      st = { dist: oppThreat + 0.5 + rangeAdj * 0.6, approach: 0.3, attack: 0.08, shield: 0.8, backoff: 0.05, dodge: 0.1, counter: 0.2, jumpAway: 0,
        patience: 170, center: false, poke: 0.35, punish: 1, oos: 0.95, antiAir: 0.95,
        read: 0.9, rSpace: 0.2, rDodge: 0.2, rHop: 0.15, rBack: 0.35, rRun: 0, rShield: 0.25, rMeet: 0, feint: 0.5 };
  }
  st.attack *= 0.6 + ag * 0.8;
  st.approach = Math.min(1, st.approach * (0.5 + ag));
  st.patience = Math.round(st.patience * (1.4 - ag * 0.8));
  st.rSpace *= 0.6 + ag * 0.8;
  st.rMeet *= 0.5 + ag;
  void f;
  return st;
}

// ------------------------------------------------------------------------------------------------
// Prediction and hit tests
// ------------------------------------------------------------------------------------------------

function capsuleHit(px: number, py: number, def: FighterDef, cx: number, cy: number, r: number): boolean {
  const hr = def.width * 0.5;
  const y0 = py + hr, y1 = py + def.height - hr;
  const yy = cy < y0 ? y0 : cy > y1 ? y1 : cy;
  const dx = cx - px, dy = cy - yy, rr = r + hr;
  return dx * dx + dy * dy <= rr * rr;
}

/** would move m, started now from (x, y) facing `face`, hit a body at (ox, oy)? `lead` adjusts for travel */
function moveReaches(def: FighterDef, m: MoveId, x: number, y: number, face: number, ox: number, oy: number, odef: FighterDef, slack: number): boolean {
  const md = def.moves[m];
  const I = INFO[def.id][m];
  const dx = face * I.fwdDist * 0.8;
  for (const h of md.hitboxes) {
    if (capsuleHit(ox, oy, odef, x + dx + face * h.x, y + h.y, h.r + slack)) return true;
  }
  return false;
}

interface Pred { x: number; y: number }
const PRED: Pred = { x: 0, y: 0 };

function predict(O: Obs, odef: FighterDef, ahead: number, out: Pred): Pred {
  if (O.grounded) {
    out.x = Math.max(ARENA.main.x0, Math.min(ARENA.main.x1, O.x + O.vx * Math.min(ahead, 26)));
    out.y = O.y;
  } else {
    const t = ahead;
    out.x = O.x + O.vx * t * (O.act === 'hitstun' ? 0.8 : 0.9);
    let vy = O.vy, y = O.y;
    for (let i = 0; i < t; i++) { vy = Math.max(vy - odef.gravity, -odef.fallSpeed); y += vy; }
    if (y < 0 && O.y >= 0 && Math.abs(out.x) <= 8) y = 0;
    for (const p of ARENA.soft) if (O.y >= p.y && y < p.y && out.x >= p.x0 && out.x <= p.x1) { y = p.y; break; }
    out.y = y;
  }
  return out;
}

function oppOffLevel(O: Obs): boolean {
  return O.y < -0.3;
}

function onDeck(x: number): boolean {
  return x >= ARENA.main.x0 && x <= ARENA.main.x1;
}

function isOffstage(x: number, y: number, grounded: boolean): boolean {
  if (grounded) return false;
  return x < ARENA.main.x0 - 0.2 || x > ARENA.main.x1 + 0.2 || y < -0.4;
}

// ------------------------------------------------------------------------------------------------
// Entry points
// ------------------------------------------------------------------------------------------------

function reset(inp: Input): void {
  inp.mx = 0; inp.my = 0; inp.jump = 0; inp.act = ''; inp.face = 0; inp.shield = false; inp.charge = 0;
  inp.aimx = 0; inp.aimy = 1; inp.fastfall = false; inp.drop = false;
}

export function wantsTech(s: FightState, side: Side): boolean {
  return rnd(s.rng) < 0.62;
}

/** DI stick at hit time: survival DI when in danger, combo DI otherwise. Not always right. */
export function chooseDI(s: FightState, side: Side, lx: number, ly: number): [number, number] {
  const f = s.fighters[side];
  const r = rnd(s.rng);
  if (r < 0.2) return [0, 0];
  const danger = f.damage > 70 || Math.abs(f.x) > 5;
  // the two perpendiculars
  const p1x = -ly, p1y = lx; // left of the launch
  const p2x = ly, p2y = -lx;
  if (danger) {
    // survival: horizontal launches DI up, vertical ones DI toward the middle
    if (Math.abs(lx) > Math.abs(ly) * 0.8) return p1y > p2y ? [p1x, p1y] : [p2x, p2y];
    const inward = f.x > 0 ? -1 : 1;
    return p1x * inward > p2x * inward ? [p1x, p1y] : [p2x, p2y];
  }
  // combo DI: away from the attacker, sideways
  const opp = s.fighters[1 - side];
  const away = f.x >= opp.x ? 1 : -1;
  return p1x * away > p2x * away ? [p1x, p1y] : [p2x, p2y];
}

export function think(s: FightState, side: Side, header: FightHeader, inp: Input): void {
  reset(inp);
  if (s.phase === 'over') return;
  const f = s.fighters[side];
  if (f.hitlag > 0) return;
  const H = hand(s, side);
  const def = FIGHTERS[f.fighter];
  const oppF = s.fighters[1 - side];
  const odef = FIGHTERS[oppF.fighter];
  const plan = s.plans[side];
  // a new plan resets one-time order memory
  if (H.lastPlanTick !== planKey(s, side)) {
    H.lastPlanTick = planKey(s, side);
    H.kill = plan.order === 'kill';
    H.killSaid = false;
    H.orderAt = s.tick;
    H.specialDone = plan.order !== 'special';
    H.appr = ''; H.rd = '';
  }
  // reaction delay drifts between 10 and 14 ticks; spacing judgement wobbles
  if (s.tick % 30 === side * 15) {
    H.delay = 10 + Math.floor(rnd(s.rng) * 5);
    H.err = (rnd(s.rng) - 0.5) * 0.5;
  }
  const O = observe(s, (1 - side) as Side, H.delay, OBS[side]);
  // how grabby the opponent has been lately, as seen (a decaying count)
  H.oGrab = H.oGrab * 0.998;
  if (O.act === 'attack' && O.frame === 1 && O.move && INFO[odef.id][O.move].grab) H.oGrab += 1;
  // follow-ups are hands skill, not stance: for a moment after landing a hit, every stance chases and converts like a rush
  const oe = (s.ctl as Ctl).eng[1 - side];
  // (a rush keeps the pressure on longest; the patient stances convert the opening and reset to their own game)
  // a follow-up lasts while the opponent has not reset (still flying, falling, landing or getting up); a rush keeps pressing a while longer
  const notReset = O.act === 'hitstun' || O.act === 'fall' || O.act === 'land' || O.act === 'knockdown' || O.act === 'getup' || O.act === 'airdodge' || O.act === 'rise' || O.act === 'helpless';
  const pressing = oe.lastHitBy === side && s.tick - oe.lastHitTick < 45 && (notReset || plan.stance === 'rush' || plan.stance === 'wall') && oppF.action !== 'dead' && oppF.action !== 'respawn';
  // bait against a grabber it has read: strikes beat grabs, so it meets the grabs with strikes of its own
  const outstrike = false;
  const hunting = !!H.kill; // the kill order makes the hands go looking for the finish (reckless when it is early)
  const pl0 = hunting ? { ...plan, aggression: Math.min(1, plan.aggression + 0.5) } : plan;
  const pl = (pressing || outstrike) && plan.stance !== 'rush' ? { ...pl0, stance: 'rush' as const, aggression: Math.max(0.7, pl0.aggression), grabMix: Math.min(pl0.grabMix, outstrike ? 0.1 : 0.3) } : pl0;
  const st = styleFor(pl, def, odef, f);
  const a = f.action;
  if (H.cool > 0) H.cool--;
  if (H.shotCd > 0) H.shotCd--;
  if (H.abCd > 0) H.abCd--;
  if ((a === 'attack' || a === 'charge') && f.actionFrame === 1) H.cool = Math.floor((10 + rnd(s.rng) * 22) * (1.4 - plan.aggression * 0.8));
  if (a === 'attack' && f.actionFrame === 1 && (f.move === 'special' || f.move === 'special2')) H.lastSp = s.tick;

  switch (a) {
    case 'respawn':
      if (H.padWait < 0) H.padWait = 52 + Math.floor(rnd(s.rng) * 30);
      if (f.actionFrame >= H.padWait) { inp.mx = O.x > f.x ? 0.5 : -0.5; H.padWait = -1; }
      return;
    case 'ledgehang':
      ledgeOptions(s, side, f, def, O, odef, H, st, plan, inp);
      return;
    case 'knockdown':
      if (H.getupWait < 0) H.getupWait = 15 + Math.floor(rnd(s.rng) * 25);
      if (f.actionFrame >= H.getupWait) {
        const r = rnd(s.rng);
        inp.act = r < 0.5 ? 'getup' : 'getuproll';
        inp.mx = r < 0.75 ? (O.x > f.x ? -1 : 1) : (O.x > f.x ? 1 : -1);
        H.getupWait = -1;
      }
      return;
    case 'holding':
      if (f.move === null) chooseThrow(s, side, f, def, oppF, H, plan, inp);
      return;
    case 'hitstun':
      // nothing to do: DI is chosen at hit time, teching on landing
      return;
    case 'shield':
    case 'shieldstun':
      shieldLogic(s, side, f, def, O, odef, H, st, pl, inp);
      return;
    case 'helpless':
      helplessDrift(f, inp);
      return;
    case 'attack':
      if (!f.grounded) airDuringMove(s, side, f, def, O, odef, H, inp);
      return;
    case 'airdodge':
      if (isOffstage(f.x, f.y, f.grounded)) inp.mx = f.x > 0 ? -1 : 1;
      return;
    case 'rise': case 'fall':
      if (isOffstage(f.x, f.y, f.grounded) || (f.y < 0 && !onDeck(f.x))) {
        // a deep edge guard stays out to hit while it still has its jump and height
        const oppOut = isOffstage(O.x, O.y, O.grounded) && O.act !== 'ledgehang';
        if (H.airPlan === 'deep' && oppOut && s.tick - H.deepT < 55 && f.airJumpsLeft > 0 && f.y > -1.6 && Math.abs(f.x) < 10.6) {
          airLogic(s, side, f, def, O, odef, H, st, pl, inp);
          return;
        }
        if (H.airPlan === 'deep') H.airPlan = '';
        recovery(s, side, f, def, O, odef, H, plan, inp);
        return;
      }
      airLogic(s, side, f, def, O, odef, H, st, pl, inp);
      return;
    case 'idle': case 'walk': case 'run':
      groundLogic(s, side, f, def, O, odef, H, st, pl, inp, header);
      if (!inp.act && !inp.jump && !inp.shield && Math.abs(inp.mx) > 0.15) avoidHazard(s, side, f, def, H, inp);
      return;
    default:
      return;
  }
}

function planKey(s: FightState, side: Side): number {
  const tr = (s.ctl as Ctl).track[side];
  return tr.since.tick * 10 + (s.plans[side].order === 'kill' ? 1 : s.plans[side].order === 'special' ? 2 : 0);
}

// ------------------------------------------------------------------------------------------------
// Ground
// ------------------------------------------------------------------------------------------------

function oppVulnerableTicks(O: Obs, odef: FighterDef, delay: number, me?: FighterState, mdef?: FighterDef): number {
  // ticks from now during which the opponent cannot act (estimated from the delayed view)
  switch (O.act) {
    case 'attack': {
      if (!O.move) return 0;
      const I = INFO[odef.id][O.move];
      if (O.frame <= I.last) {
        // a whiff seen coming: a grounded commit that cannot reach where I stand will be over with nothing to show,
        // so the punish can start now (the move's reach is known), not a reaction time after it ends
        if (!me || !mdef || !O.grounded || I.total - I.last < 14) return 0;
        const reach = Math.max(I.reach, I.back) + I.fwdDist + Math.abs(O.vx) * Math.max(0, I.last - O.frame) * 0.7 + mdef.width * 0.5 + 0.35;
        if (Math.abs(me.x - O.x) < reach) return 0;
        return I.total - O.frame - delay;
      }
      return I.total - O.frame - delay;
    }
    case 'land': return O.hitstun - delay; // the engine records landing lag in this field
    case 'shieldbreak': return 150 - O.frame - delay;
    case 'knockdown': return 18 - delay;
    case 'hitstun': return (O.tumble && !O.grounded ? Math.floor(O.hitstun * 0.55) : O.hitstun) - delay;
    case 'helpless': return 20;
    case 'getup': return O.frame > 18 ? 26 - O.frame - delay : 0;
    case 'spotdodge': return O.frame > 15 ? 22 - O.frame - delay : 0;
    case 'roll': return O.frame > 16 ? 26 - O.frame - delay : 0;
    case 'airdodge': return O.frame > 22 ? 6 : 0;
    case 'jumpsquat': return 2;
    case 'ledgeclimb': return 0;
    default: return 0;
  }
}

/** opponent move that will be active soon and could reach me */
function threatened(O: Obs, odef: FighterDef, f: FighterState, def: FighterDef, delay: number): boolean {
  if (O.act !== 'attack' && O.act !== 'charge') return false;
  if (!O.move) return false;
  const I = INFO[odef.id][O.move];
  if (O.act === 'attack' && O.frame > I.last) return false;
  const face = O.vx !== 0 && false ? Math.sign(O.vx) : (f.x >= O.x ? 1 : -1);
  const dx = Math.abs(f.x - O.x) - def.width * 0.5;
  const reach = Math.max(I.reach, I.back) + I.fwdDist + 0.4 + Math.abs(O.vx) * 6;
  void face; void delay;
  if (dx > reach) return false;
  const top = O.y + I.top + 0.3, bottom = O.y + I.bottom - 0.3;
  return f.y + def.height >= bottom && f.y <= top;
}

/** a shot flying at me, seen once it has flown for the reaction time: 1 a shot, 2 a tether (0 none) */
function projectileComing(s: FightState, side: Side, f: FighterState, def: FighterDef, delay: number): number {
  for (const p of s.projectiles) {
    if (p.owner === side || p.floor || p.drag) continue;
    const pr = FIGHTERS[s.fighters[p.owner].fighter].moves[p.move || 'special'].projectile;
    if (!pr || pr.linger) continue;
    const px = p.x - p.vx * delay;
    const toward = (f.x - px) * p.vx > 0;
    if (!toward) continue;
    const dist = Math.abs(f.x - p.x);
    if (dist < 4.5 && p.y > f.y - 0.3 && p.y < f.y + def.height + 0.3 && pr.life - p.life >= delay) return p.tether ? 2 : 1;
  }
  return 0;
}

/** an enemy hazard lying ahead on my floor (seen once it has lain there for the reaction time): jump it when running, else stop short */
function avoidHazard(s: FightState, side: Side, f: FighterState, def: FighterDef, H: Record<string, any>, inp: Input): void {
  const mv = inp.mx > 0 ? 1 : -1;
  for (const p of s.projectiles) {
    if (p.owner === side || !p.floor || Math.abs(p.y - f.y) > 0.2) continue;
    const pr = FIGHTERS[s.fighters[p.owner].fighter].moves[p.move || 'special'].projectile;
    if (!pr || (pr.linger || 0) - p.life < H.delay) continue;
    const hw = def.width * 0.5;
    if (Math.abs(p.x - f.x) < p.r + hw * 0.6) continue; // standing in it already: keep moving out
    const near = (p.x - f.x) * mv - p.r - hw * 0.6;
    const run = Math.abs(inp.mx) > 0.7;
    if (near < 0 || near > (run ? 1.0 : 0.45)) continue;
    if (run && Math.abs(f.x + mv * 4) < 8) { inp.jump = 1; return; }
    inp.mx = 0;
    return;
  }
}

function groundLogic(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, H: Record<string, any>, st: Style, plan: Plan, inp: Input, header: FightHeader): void {
  const T = s.tick;
  const ctl = s.ctl as Ctl;
  const ahead = H.delay;
  const P = predict(O, odef, ahead, PRED);
  const px = P.x + H.err;
  const gap = px - f.x;
  const adist = Math.abs(gap);
  const dir = gap >= 0 ? 1 : -1;
  const bored = T - ctl.lastExchange > st.patience;
  const oppOff = isOffstage(O.x, O.y, O.grounded) || O.act === 'ledgehang';
  void header;

  // different levels: go to the opponent's level, or wait under it
  if (f.platform >= 0 && O.y < f.y - 1 && O.grounded && rnd(s.rng) < 0.08 + st.approach * 0.1) { inp.drop = true; return; }
  if (O.grounded && O.y > f.y + 1 && !oppOffLevel(O)) {
    const under = Math.abs(gap) < 2.2;
    if (under && rnd(s.rng) < 0.05 + st.approach * 0.12) { inp.jump = 1; inp.mx = dir * 0.5; H.airPlan = 'plat'; return; }
    if (!under && (st.approach > 0.3 || bored)) { inp.mx = dir; return; }
  }

  // 1. edge guarding
  if (oppOff && O.act !== 'respawn' && O.act !== 'dead') {
    if (edgeguard(s, side, f, def, O, odef, H, st, plan, inp)) return;
  }

  // 1b. a fighter climbing up from the ledge: hit where it will stand when its invulnerability ends
  if (O.act === 'ledgeclimb' && rnd(s.rng) < 0.5 * st.punish) {
    const o = O.x > 0 ? 1 : -1;
    const tx = 8 * o - o * 0.55;
    const d2 = (tx - f.x) * (tx > f.x ? 1 : -1);
    for (const m of ['tilt', 'jab', 'smash', 'dash'] as MoveId[]) {
      const I = INFO[def.id][m];
      if (m === 'dash' && f.action !== 'run') continue;
      if (d2 > 0 && d2 < I.reach + I.fwdDist * 0.8 + 0.4 && O.frame + H.delay + I.first >= 15 && O.frame + H.delay + I.first <= 30) {
        inp.act = m; inp.face = tx > f.x ? 1 : -1; return;
      }
    }
  }

  // 2. defence against a move coming out
  if (threatened(O, odef, f, def, H.delay)) {
    if (defend(s, side, f, def, O, odef, H, st, inp, dir)) return;
  }
  const pcm = projectileComing(s, side, f, def, H.delay);
  if (pcm) {
    const r = rnd(s.rng);
    // a tether: shield it (the thrower is left open) or dodge through it and punish the whiff
    if (pcm === 2 && r < (def.weight < 92 ? 0.5 : 0.3)) { inp.act = 'spot'; H.punishT = 40; return; } // light fighters dodge a tongue more
    if (r < st.shield + 0.15) { inp.shield = true; H.shieldT = 12; return; }
    if (r < st.shield + 0.15 + 0.35 && plan.stance !== 'wall') { inp.jump = 2; inp.mx = dir; return; }
  }

  // 3. punish an opening
  if (H.punishT > 0) H.punishT--;
  const vul = oppVulnerableTicks(O, odef, H.delay, f, def);
  const comboing = O.act === 'hitstun';
  // a tongue seen coming out: hop over it (light fighters nearly always, others half the time)
  const Tg = TETHER[odef.id];
  if (Tg && O.act === 'attack' && O.move === Tg && O.frame < 14 && f.grounded && adist < TETHER_REACH[odef.id] + 0.8 && !(H.tgT > 0)) {
    H.tgT = 20;
    if (rnd(s.rng) < (def.weight < 92 ? 0.85 : 0.5)) { inp.jump = 2; inp.mx = -dir * 0.4; return; }
  }
  const Pw = POUNCE[odef.id];
  if (Pw && O.act === 'attack' && O.move === Pw && O.frame < 9 && f.grounded && adist < 5.5 && !(H.tgT > 0)) {
    H.tgT = 20;
    if (rnd(s.rng) < (def.weight < 92 ? 0.7 : 0.3)) { inp.jump = 1; inp.mx = -dir * 0.3; return; } // a pounce catches only the grounded
  }
  if (H.tgT > 0) H.tgT--;
  // a light fighter keeps out of a grabber's hands: as it closes into grab range, snatch past it, spot dodge, or hop back
  if (H.gdT > 0) H.gdT--;
  if (def.weight < 92 && GRABBER[odef.id] && O.grounded && f.grounded && !(H.gdT > 0) && vul <= 0) {
    const cl = closingSpeed(O, dir);
    const gr = INFO[odef.id].grab.reach + def.width * 0.5 + 0.35 + Math.max(0, cl) * 8;
    if (adist < gr && (cl > 0.02 || O.act === 'idle' || O.act === 'walk' || O.act === 'shield')) {
      const r = rnd(s.rng);
      if (r < 0.16) {
        H.gdT = 24;
        const Bk = BLINK[def.id];
        if (Bk && H.abCd <= 0 && r < 0.07) { inp.act = Bk; inp.face = dir; H.abCd = 60; return; }
        if (r < 0.11) { inp.act = 'spot'; H.punishT = 40; return; }
        inp.jump = 2; inp.mx = -dir; return;
      }
    }
  }
  // the special tools: shots, hazards, blinks and tethers, where the stance wants them
  if (abilities(s, side, f, def, O, odef, P, H, st, plan, inp, adist, dir, vul)) return;
  // a planned return: having stepped or dodged out of a swing, come back in on timing and take what is there
  if (H.punishT > 0 && H.dashT <= 0) {
    if (vul > 0) {
      const m = pickGroundMove(s, f, def, O, odef, P, H, st, plan, vul + 2, true);
      if (m) { fireGround(s, side, f, def, m, O, odef, H, plan, inp, dir, vul); H.punishT = 0; return; }
      const runTime = (adist - INFO[def.id].grab.reach) / def.runSpeed;
      if (runTime > 0 && runTime + 5 < vul && adist < 6) { inp.mx = dir; return; }
    }
  }
  if (vul > 0 && rnd(s.rng) < (comboing ? st.punish * 0.35 : st.punish)) {
    const m = pickGroundMove(s, f, def, O, odef, P, H, st, plan, vul, true);
    if (m) { fireGround(s, side, f, def, m, O, odef, H, plan, inp, dir, vul); return; }
    // close the distance toward the opening
    const runTime = (adist - INFO[def.id].grab.reach) / def.runSpeed;
    if (runTime > 0 && runTime + 6 < vul && O.grounded && adist < 7) { inp.mx = dir; return; }
    if (!O.grounded && vul > 10 && adist < 4 && O.y > f.y + 1.2 && (plan.stance === 'rush' || plan.stance === 'keepaway')) { inp.jump = 1; inp.mx = dir * 0.6; return; }
  }

  // 4. anti-air
  if (!O.grounded && O.y > f.y + 0.8 && adist < 2.2 && O.vy < 0.05 && rnd(s.rng) < st.antiAir * 0.5) {
    // the bigger anti-air when it could finish, the quick one otherwise
    const aa: MoveId[] = O.damage > 70 || rnd(s.rng) < 0.25 ? ['upsmash', 'uptilt'] : ['uptilt', 'upsmash'];
    for (const m of aa) {
      if (moveReaches(def, m, f.x, f.y, dir, P.x, predict(O, odef, ahead + INFO[def.id][m].first, { x: 0, y: 0 }).y, odef, 0)) {
        inp.act = m; inp.face = dir; return;
      }
    }
    if (st.antiAir > 0.7 && adist < 1.5) { inp.shield = true; H.shieldT = 10; return; }
    if (st.antiAir > 0.7 && plan.stance === 'rush' && rnd(s.rng) < 0.3) { inp.jump = 1; return; }
  }

  // signature order
  if (!H.specialDone) {
    H.specialDone = useSpecialOrder(s, side, f, def, O, odef, adist, dir, inp);
    if (inp.act) return;
  }

  // 5. a read on an approaching opponent, made from where the approach is heading
  if (readApproach(s, side, f, def, O, odef, P, H, st, plan, inp, adist, dir)) return;

  // 6. neutral: an intent held for a few ticks, picked from the stance, the dials and the distance
  intentNeutral(s, side, f, def, O, odef, P, H, st, plan, inp, adist, dir, bored);
}

/**
 * The special tools, reached for where each stance wants them, behind a cooldown so none is a free win:
 * - a shot at range (keep-away most, the others now and then), and always on a stunned or rooted opponent out of reach;
 * - a floor hazard lobbed at the opponent's feet (keep-away, bait), or between us to guard space (wall, keep-away);
 * - a blink through and behind the opponent (rush), or to punish an opening from range (every stance);
 * - a tether to drag the opponent in (rush, keep-away as a long poke), or to punish an opening from range (bait, wall).
 */
function abilities(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, P: Pred, H: Record<string, any>, st: Style,
  plan: Plan, inp: Input, adist: number, dir: number, vul: number): boolean {
  if (O.act === 'dead' || O.act === 'respawn' || O.act === 'ledgehang' || O.act === 'ledgeclimb' || O.act === 'entrance' || O.act === 'held') return false;
  const id = def.id;
  const night = true; // round 4: every fighter of the cast leans on its specials (round 3c's behaviour for all six)
  if (f.platform !== -1 || !O.grounded && O.act !== 'hitstun' && !(night && O.y < f.y + 2.4)) return false;
  const stance = plan.stance;
  const ag = plan.aggression;
  const level = night ? O.y - f.y > -0.9 && O.y - f.y < 1.8 : Math.abs(O.y - f.y) < 0.9;
  const fire = (m: MoveId, cd: number, shot: boolean): boolean => {
    inp.act = m; inp.face = dir;
    if (shot) H.shotCd = cd; else H.abCd = Math.round(cd * (1.25 - ag * 0.5));
    return true;
  };
  const r = rnd(s.rng);
  const ready = H.cool <= 0;
  // the longer since its last special, the harder a night fighter reaches for one (x1 up to 0.7 s, rising to x5 by 2.7 s)
  const urge = night ? 1 + Math.min(4, Math.max(0, s.tick - (H.lastSp || 0) - 40) / 30) : 1;
  // a shot: from range at the same height
  const S = SHOT[id];
  if (S && (H.shotCd <= 0 || O.act === 'hitstun' && !O.tumble) && level) {
    const pr = def.moves[S].projectile!;
    // (against a tongue, shoot from outside its reach: a throw inside it gets the thrower reeled in)
    const Po0 = POUNCE[odef.id];
    const lo = Math.max(night ? 1.8 : def.moves[S].startup > 16 ? 3.4 : 2.6, TETHER[odef.id] ? TETHER_REACH[odef.id] + 0.6 : 0,
      Po0 && def.weight < 92 && def.moves[S].projectile!.fan ? INFO[odef.id][Po0].reach + INFO[odef.id][Po0].fwdDist + 0.5 : 0); // and a light fighter from outside a pounce
    const hi = Math.min(pr.vx * pr.life, 11);
    if (adist > lo && adist < hi) {
      const travel = def.moves[S].startup + adist / pr.vx;
      if (O.act === 'hitstun' && !O.tumble && vul > travel - 4 && adist > 2.4 && H.shotCd < 30) return fire(S, 50, true); // sure hit on a stunned or rooted opponent
      const rate = night
        ? (stance === 'keepaway' ? 0.07 : stance === 'rush' ? 0.05 + (1 - ag) * 0.03 : stance === 'wall' ? 0.05 : 0.07)
        : (stance === 'keepaway' ? 0.06 : stance === 'rush' ? 0.03 + (1 - ag) * 0.02 : stance === 'wall' ? 0.03 : 0.05);
      const slow = def.moves[S].startup > 16;
      if (night && ready && O.act !== 'shield' && r < rate * urge * (id === 'kiln' ? 0.6 : 1)) { H.cover = id === 'gantry' ? 110 : 0; H.meet = id === 'kiln' ? 80 : 0; return fire(S, Math.round(40 + rnd(s.rng) * 30), true); }
      if (!night && ready && O.act !== 'shield' && r < rate) return fire(S, Math.round((slow ? 60 : 45) + rnd(s.rng) * (slow ? 60 : 55)), true);
    }
  }
  // the Armour's flame forces a jump: run to meet the landing
  if (H.meet > 0) H.meet--;
  if (H.meet > 0 && !O.grounded && O.vy < 0.05 && adist > 1.4 && adist < 5) { inp.mx = dir; return true; }
  // cover: with its own bats flying at the opponent, walk in behind them, and mist-step through as they arrive
  if (H.cover > 0) H.cover--;
  if (night && S && H.cover > 0 && level) {
    let lead: Projectile | null = null;
    for (const p of s.projectiles) if (p.owner === side && p.move === S && !p.cd && (p.x - f.x) * dir > 0 && (O.x - p.x) * dir > -0.3) {
      if (!lead || Math.abs(O.x - p.x) < Math.abs(O.x - lead.x)) lead = p;
    }
    if (lead) {
      const B0 = BLINK[id];
      const near = Math.abs(O.x - lead.x) < 2.2;
      if (B0 && H.abCd <= 0 && near && adist < def.moves[B0].blink!.behind - 0.3 && adist > 0.9 && r < 0.2) return fire(B0, 70, false);
      if (adist > 2.4 && Math.abs(f.x + dir) < ARENA.main.x1 - 0.5) { inp.mx = dir * 0.75; return true; }
    } else H.cover = 0;
  }
  // the howl's follow-up: a staggered opponent on the floor is pounced on (not held back by the howl's cooldown)
  const Pf = POUNCE[id];
  if (Pf && O.act === 'hitstun' && !O.tumble && O.grounded && Math.abs(O.y - f.y) < 0.5) {
    const I = INFO[id][Pf];
    if (vul > I.first + 3 && adist < I.reach + I.fwdDist * 0.9 && r < 0.7) return fire(Pf, 45, false);
  }
  if (H.abCd > 0) return false;
  // a blink: through and behind it
  const B = BLINK[id];
  if (B && level && (O.grounded || night)) {
    const into = adist > (night ? 0.9 : 1.6) && adist < def.moves[B].blink!.behind - 0.3;
    if (into && vul > 9 && r < 0.5 * st.punish) return fire(B, 100, false);
    const rate = night
      ? (stance === 'rush' ? 0.07 + ag * 0.05 : stance === 'bait' ? 0.05 : 0.02)
      : (stance === 'rush' ? 0.04 + ag * 0.04 : stance === 'bait' ? 0.03 : 0.012);
    // the Magpie snatches behind shields
    if (id === 'tick' && into && O.act === 'shield' && r < 0.12) return fire(B, 70, false);
    if (into && ready && O.act !== 'attack' && O.act !== 'shield' && r < rate * urge * (GRABBER[odef.id] && def.weight < 92 ? 0.4 : 1)) return fire(B, night ? 70 : 110, false);
  }
  // a tether: drag it in
  const Tm = TETHER[id];
  if (Tm && Math.abs(O.y - f.y) < 1.2) {
    const reach = TETHER_REACH[id] + odef.width * 0.4;
    const pr = def.moves[Tm].projectile!;
    const travel = pr.frame + Math.max(0, adist - def.width * 0.5 - 0.4) / pr.vx;
    const Q = predict(O, odef, H.delay + Math.round(travel * 0.6), { x: 0, y: 0 });
    const qd = Math.abs(Q.x - f.x);
    if (adist > 1.8 && qd < reach - 0.25 && O.act !== 'shield' && O.act !== 'shieldstun') {
      if (vul > travel - 2 && r < st.punish * 0.75) return fire(Tm, 60, false);
      // a caster winding up a shot or a ward is standing still: lash it before the spell comes out
      if (O.act === 'attack' && O.frame < 8 && (O.move === SHOT[odef.id] || O.move === WARD[odef.id]) && r < 0.5) return fire(Tm, 60, false);
      const rate = stance === 'rush' ? 0.06 + plan.grabMix * 0.06 : stance === 'keepaway' ? 0.07 : stance === 'wall' ? 0.04 : 0.06;
      if (ready && O.act !== 'attack' && r < rate * urge) return fire(Tm, 60, false);
    }
  }
  // a pounce: the long leap that seizes, to close and to punish at mid range (only a grounded opponent can be caught)
  const Po = POUNCE[id];
  if (Po && O.grounded && Math.abs(O.y - f.y) < 0.5) {
    const I = INFO[id][Po];
    const ex = moveExtra(id, Po);
    const v = ex.fwd![2];
    const reach = I.reach + I.fwdDist * 0.9;
    const Q = predict(O, odef, H.delay + Math.round(I.first + Math.max(0, adist - I.reach) / v), { x: 0, y: 0 });
    const qd = Math.abs(Q.x - f.x);
    const tReach = ex.fwd![0] + Math.max(0, qd - I.reach - odef.width * 0.4) / v;
    if (qd > 1.4 && qd < reach && O.act !== 'jumpsquat' && O.act !== 'spotdodge' && O.act !== 'roll') {
      if (vul > tReach && r < st.punish * 0.8) return fire(Po, 50, false);
      const rate = stance === 'rush' ? 0.1 + plan.grabMix * 0.06 : stance === 'keepaway' ? 0.07 : stance === 'wall' ? 0.05 : 0.07;
      if (ready && O.act !== 'attack' && r < rate * urge) return fire(Po, 45, false);
    }
  }
  // a howl: when it is close and pressing, or right after a blocked string
  const Hw = HOWL[id];
  if (Hw && adist < 2.2 + odef.width * 0.3 && O.act !== 'shield' && O.act !== 'shieldstun') {
    const pressing = O.act === 'attack' || O.act === 'run' || O.act === 'walk' || O.act === 'land' || O.act === 'getup';
    const rate = pressing ? (stance === 'rush' ? 0.16 : 0.13) : 0.08;
    const opening = vul > INFO[id][Hw].first + 2 && r < st.punish * 0.6; // inside bait's punish game: stagger it, then pounce
    if ((H.oos > 0 && r < 0.35) || opening || r < rate * urge) return fire(Hw, 50, false);
  }
  // a plain strike on the second special (an armoured blow, a spin): up close, where it reaches
  const md2 = def.moves.special2;
  const I2 = INFO[id].special2;
  // (a command grab on the second special, the Mimic's swallow, is best against a shield)
  if (!md2.projectile && !md2.blink && !HOWL[id] && md2.hitboxes.length && ready && (O.act !== 'shield' || I2.grab) && adist < 3.2) {
    const Q = predict(O, odef, H.delay + I2.first, { x: 0, y: 0 });
    const rate = (stance === 'rush' ? 0.08 : stance === 'wall' ? 0.05 : 0.04) * (I2.grab && O.act === 'shield' ? 3 : 1);
    if ((vul > I2.first + 2 || r < rate * urge) && moveReaches(def, 'special2', f.x, f.y, dir, Q.x + H.err * 0.5, Q.y, odef, -0.05)) return fire('special2', 60, false);
  }
  // a floor hazard: at its feet, or between us to guard the space
  const W = WARD[id];
  if (W && !myHazard(s, side, W) && level && (O.grounded || O.vy < 0) && Math.abs(f.x + dir * WARD_DIST[id]) < ARENA.main.x1 - 0.4) {
    const pr = def.moves[W].projectile!;
    const Q = predict(O, odef, H.delay + pr.frame + 30, { x: 0, y: 0 });
    const ahead = (Q.x - f.x) * dir;
    const land = WARD_DIST[id];
    const atFeet = Math.abs(ahead - land) < 1.7;
    const between = ahead > land + 0.9 && ahead < land + 4.5;
    const rate = stance === 'keepaway' ? 0.1 : stance === 'wall' ? 0.09 : stance === 'bait' ? 0.08 : 0.07;
    if ((atFeet || between) && ready && r < rate * urge) return fire(W, 60, false);
  }
  return false;
}

/** the opponent's speed toward me, m/tick (from the delayed view) */
function closingSpeed(O: Obs, dir: number): number {
  return -O.vx * dir;
}

const READS = ['space', 'dodge', 'hop', 'back', 'run', 'shield', 'meet'] as const;

/**
 * An approach is telegraphed for far longer than the reaction delay: a running opponent keeps a
 * constant velocity, so where it will be is known. The read is chosen once per approach and carried
 * out when the approach arrives: a poke placed where it is about to be, a spot dodge as a grabber
 * reaches grab range, a hop back with a retreating aerial, a dash back out of range (then back in to
 * punish), running away, a shield, or meeting it head on.
 */
function readApproach(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, P: Pred, H: Record<string, any>, st: Style,
  plan: Plan, inp: Input, adist: number, dir: number): boolean {
  const T = s.tick;
  const cl = closingSpeed(O, dir);
  const oR = REACH[odef.id] + def.width * 0.5;
  const air = !O.grounded && O.y < f.y + 2.6 && O.act !== 'hitstun';
  const moving = O.act === 'run' || O.act === 'walk' || O.act === 'attack' || O.act === 'jumpsquat' || air;
  const coming = cl > 0.06 && moving;
  const tArr = (adist - oR) / Math.max(0.03, cl);
  const room = dir > 0 ? f.x - ARENA.main.x0 : ARENA.main.x1 - f.x;
  if (H.rd && T > H.rdUntil) H.rd = '';
  if (!H.rd) {
    if (!coming || tArr > 16 || T - H.rdLast < 14) return false;
    H.rdLast = T;
    H.rdUntil = T + 26;
    if (rnd(s.rng) > st.read) { H.rd = 'none'; return false; }
    // how grabby has it been lately (a decaying count of its grabs, seen with the reaction delay)
    const grabby = Math.min(1, (H.oGrab || 0) / 2.5);
    const sw = plan.stance === 'bait' ? grabby : 0;
    const restless = T - (s.ctl as Ctl).lastExchange > 220; // nothing has happened for a while: stand and fight instead of running // bait answers what it has seen: grabs get pokes and dodges, strikes get the shield
    const w = restless ? [0.2, 0, 0, 0, 0, 0.6, 0.4] : [st.rSpace + sw * 0.6, air ? 0 : st.rDodge * (0.25 + grabby * 1.5), air ? 0 : st.rHop, room > 2.5 ? st.rBack : 0, room > 2.2 ? st.rRun : st.rRun * 0.2,
      st.rShield * (1 - sw) + (air ? st.rDodge + st.rHop : 0), st.rMeet];
    let tot = 0;
    for (const v of w) tot += v;
    let r = rnd(s.rng) * tot;
    let k = 0;
    for (; k < w.length - 1; k++) { r -= w[k]; if (r <= 0) break; }
    H.rd = READS[k];
    // the read owns the hands until it is carried out
    H.appr = ''; H.intent = 'hold'; H.intentT = 10; H.dashT = 0;
    if (H.rd === 'run') H.rdUntil = T + 40;
  }
  switch (H.rd) {
    case 'none':
      return false;
    case 'space': {
      // a poke placed where the approach will be when the poke is out (an anti-air if it comes in the air)
      const list: MoveId[] = air ? ['uptilt', 'upsmash', 'tilt'] : ['tilt', 'jab', 'special2', 'smash', 'dash'];
      for (const m of list) {
        const I = INFO[def.id][m];
        if (!I.ground || I.dmg <= 0 || I.grab) continue;
        if (m === 'dash' && f.action !== 'run') continue;
        if (m === 'smash' && I.first > 14) continue;
        if (m === 'special2' && (I.first > 14 || def.moves.special2.projectile || def.moves.special2.blink)) continue;
        const Q = predict(O, odef, H.delay + I.first, { x: 0, y: 0 });
        if (moveReaches(def, m, f.x, f.y, dir, Q.x + H.err * 0.5, Q.y, odef, -0.05)) {
          inp.act = m; inp.face = dir; H.rd = ''; H.cool = 6; H.punishT = 30; return true;
        }
      }
      if (tArr < -3) { inp.shield = true; H.shieldT = 8; H.rd = ''; return true; }
      inp.mx = 0;
      return tArr < 12;
    }
    case 'dodge':
      // as a grabber reaches grab range: the grab comes out a few ticks later and finds nothing
      if (adist < oR + 0.45 + Math.max(0, cl) * 2) { inp.act = 'spot'; H.rd = ''; H.punishT = 40; return true; }
      return tArr < 12;
    case 'hop':
      if (tArr < 9) { inp.jump = 2; inp.mx = -dir; H.airPlan = 'retreat'; H.rd = ''; return true; }
      return false;
    case 'back':
      // step out of its reach just as it arrives, then come back in on its whiff
      if (tArr < 7) {
        H.dashT = Math.max(5, Math.min(12, Math.ceil((oR + 0.7 - adist + Math.max(0, cl) * 8) / def.runSpeed)));
        H.dashDir = -dir; H.rd = ''; H.punishT = 45;
        if (room > 1.4) { inp.mx = -dir; return true; }
        H.dashT = 0; inp.shield = true; H.shieldT = 8; return true;
      }
      return tArr < 12;
    case 'run':
      if (room > 1.6 && adist < st.dist + 0.8) { inp.mx = -dir; return true; }
      H.rd = '';
      return false;
    case 'shield':
      if (tArr < 6) { inp.shield = true; H.shieldT = 10 + Math.floor(rnd(s.rng) * 10); H.rd = ''; H.punishT = 30; return true; }
      return tArr < 10;
    case 'meet': {
      const m = pickGroundMove(s, f, def, O, odef, P, H, st, plan, 0, false);
      if (m && tArr < 8) { fireGround(s, side, f, def, m, O, odef, H, plan, inp, dir, 0); H.rd = ''; return true; }
      if (tArr < 4 && adist > 1) { inp.mx = dir; return true; }
      return false;
    }
  }
  return false;
}

function useSpecialOrder(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, adist: number, dir: number, inp: Input): boolean {
  const H = hand(s, side);
  const I = INFO[def.id].special;
  const shots = SHOT[def.id] === 'special' || WARD[def.id] === 'special';
  const ok = shots ? adist > 2.5 && Math.abs(O.y - f.y) < 1.5 : TETHER[def.id] === 'special' ? adist > 1.8 && adist < TETHER_REACH[def.id] && Math.abs(O.y - f.y) < 1.2 :
    adist < I.reach + I.fwdDist + 0.6;
  if (ok || s.tick - H.orderAt > 240) {
    inp.act = 'special'; inp.face = dir;
    H.order = 'special';
    return true;
  }
  return false;
}

function pickGroundMove(s: FightState, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, P: Pred, H: Record<string, any>,
  st: Style, plan: Plan, vul: number, punishing: boolean): MoveId | null {
  const dir = P.x >= f.x ? 1 : -1;
  let best: MoveId | null = null, bestScore = -1e9;
  const oppDmg = O.damage;
  // without an order the hands go for the finish only on a sure opening at high damage; the kill order fishes for it
  const killWanted = H.kill || punishing && oppDmg > 115;
  const moves: MoveId[] = ['jab', 'tilt', 'uptilt', 'smash', 'upsmash', 'grab', 'special', 'special2'];
  if (f.action === 'run') moves.push('dash');
  for (const m of moves) {
    const I = INFO[def.id][m];
    if (!I.ground) continue;
    if (BLINK[def.id] === m || HOWL[def.id] === m) continue; // the blink and the howl are chosen by abilities()
    if (def.moves[m].projectile) {
      if (SHOT[def.id] !== m) continue; // hazards and tethers are chosen by abilities()
      // shots: only from range, at about the same height, and not back to back
      const adist = Math.abs(P.x - f.x);
      if (H.shotCd > 0 || adist < 2.8 || Math.abs(O.y - f.y) > 1.0 || adist > 9.5 || !O.grounded || punishing && adist < 5) continue;
      if (rnd(s.rng) > 0.25 + st.poke * 0.6) continue;
      const sc = 2 + st.poke * 8 - (punishing ? 5 : 0) + (Math.abs(f.x) < 7 ? 0 : -3);
      if (sc > bestScore) { bestScore = sc; best = m; }
      continue;
    }
    if (I.dmg <= 0 && !I.grab) continue;
    if (I.grab && !O.grounded) continue;
    if (I.grab && (O.act === 'hitstun' && O.tumble)) continue;
    if (punishing && I.first + 2 > vul) continue;
    const Q = predict(O, odef, H.delay + I.first, { x: 0, y: 0 });
    if (!moveReaches(def, m, f.x, f.y, dir, Q.x + H.err, Q.y, odef, -0.05)) continue;
    // score
    let sc = (I.grab ? 9 : I.dmg) * 0.6 - I.first * 0.35 - I.total * 0.08;
    const kb = kbAt(def.moves[m].hitboxes[0] || { damage: I.dmg, bkb: 40, kbg: 80 } as any, oppDmg, odef.weight);
    if (killWanted) sc += (kb > 120 ? 8 : 0) + I.kb100 * 0.04;
    if (H.kill) sc += (kb > 140 ? 14 : kb > 100 ? 6 : -1) + I.kb100 * 0.08 + (m === 'smash' || m === 'upsmash' ? 6 : 0);
    // bait waits for its openings and makes them count: the biggest move that fits the window
    if (punishing && plan.stance === 'bait') sc += (I.grab ? 9 : I.dmg) * 0.6 + I.kb100 * 0.03;
    if (I.grab) {
      // the grab dial decides: a strike-minded plan almost never grabs, a grab-minded one grabs shields on sight
      sc += O.act === 'shield' || O.act === 'shieldstun' ? plan.grabMix * 18 - 2 : 0;
      sc += (plan.grabMix - 0.45) * 16;
      if (st.poke > 0.9) sc -= 4;
    }
    if (O.act === 'shield' && !I.grab) sc -= plan.stance === 'rush' ? 2 : 6;
    if (st.poke > 0.9) {
      // keep-away only hits at the tip of its range, where a shield cannot punish it
      const tip = Math.abs(P.x - f.x) - I.reach;
      if (!punishing && (tip < -0.3 || I.grab || m === 'dash' || I.first > 10 || I.total - I.last > 24)) continue;
      sc += tip > -0.4 ? 4 : 0;
    }
    if (O.act === 'hitstun' || O.act === 'knockdown') sc += 8 - I.first * 0.4;
    if ((m === 'smash' || m === 'upsmash' || m === 'special2' && def.id === 'gantry') && !punishing && !killWanted) sc -= 6;
    if ((m === 'special' || m === 'special2') && !punishing && I.first > 9) sc -= 4;
    if (m === 'special2' && punishing) sc += 3; // the second special is a punish tool (and should be seen)
    if (m === 'jab' || m === 'tilt') sc -= 3; // round 4: the specials, not the pokes, carry the fight
    // a light fighter does not swing with a long recovery inside a grabber's reach: it gets grabbed out of it
    if (!punishing && def.weight < 92 && GRABBER[odef.id] && I.total - I.last > 12) sc -= 6;
    if (POUNCE[def.id] === m) sc += O.act === 'hitstun' && !O.tumble ? 12 : 4;
    if (POUNCE[def.id] && m === 'grab') sc -= 3; // the wolf seizes with the pounce rather than a plain grab
    if (!punishing) sc -= I.fwdDist * 1.5;
    if (m === 'uptilt' || m === 'upsmash') sc += O.y > f.y + 0.6 ? 4 : -2;
    sc += rnd(s.rng) * 3;
    if (sc > bestScore) { bestScore = sc; best = m; }
  }
  if (!punishing && bestScore < -3) return null;
  return best;
}

function fireGround(s: FightState, side: Side, f: FighterState, def: FighterDef, m: MoveId, O: Obs, odef: FighterDef, H: Record<string, any>, plan: Plan, inp: Input, dir: number, vul: number): void {
  inp.act = m;
  if (def.moves[m].projectile) H.shotCd = 65 + Math.floor(rnd(s.rng) * 70);
  inp.face = dir;
  const md = def.moves[m];
  if (md.maxCharge) {
    if (H.kill && vul > INFO[def.id][m].first + 15) inp.charge = Math.min(md.maxCharge, vul - INFO[def.id][m].first - 4);
    else if (H.kill && vul <= 0) inp.charge = 8 + Math.floor(rnd(s.rng) * 16); // a read: a charged smash where it will be
    else if (vul > INFO[def.id][m].first + 10) inp.charge = Math.min(20, vul - INFO[def.id][m].first - 4);
  }
  if (H.kill && (m === 'smash' || m === 'upsmash' || m === 'special' || m === 'special2' || m === 'grab') && !H.killSaid) {
    H.order = 'kill'; H.killSaid = true;
  }
  if (m === 'special' && !H.specialDone) { H.specialDone = true; H.order = 'special'; }
}

function defend(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, H: Record<string, any>, st: Style, inp: Input, dir: number): boolean {
  const r = rnd(s.rng);
  // reactions only land some of the time, and slow moves are easier to see coming
  const I = O.move ? INFO[odef.id][O.move] : null;
  const seen = I ? Math.min(1, 0.35 + (I.first - Math.min(I.first, O.frame)) * 0.06 + 0.25) : 0.5;
  if (rnd(s.rng) > seen) return false;
  // a grab seen coming is never shielded: dodge it, jump it or step out of it
  if (I && I.grab) {
    if (r < 0.45) { inp.act = 'spot'; H.punishT = 40; return true; }
    if (r < 0.75 && Math.abs(f.x - dir * 1.5) < 7.2) { inp.mx = -dir; H.dashT = 8; H.dashDir = -dir; H.punishT = 40; return true; }
    inp.jump = 2; inp.mx = -dir; H.airPlan = 'retreat'; H.punishT = 40; return true;
  }
  // a blinker can vanish through the swing and come out behind it
  if (BLINK[def.id] && H.abCd <= 0 && f.grounded && rnd(s.rng) < 0.22) { inp.act = BLINK[def.id] as MoveId; inp.face = dir; H.abCd = 120; H.punishT = 30; return true; }
  let acc = st.shield;
  if (r < acc) { inp.shield = true; H.shieldT = 8 + Math.floor(rnd(s.rng) * 8); return true; }
  acc += st.backoff * 0.6;
  if (r < acc && Math.abs(f.x - dir * 1.5) < 7.2) { inp.mx = -dir; H.dashT = 8; H.dashDir = -dir; H.punishT = 30; return true; }
  acc += st.dodge * 0.5;
  if (r < acc) { inp.act = rnd(s.rng) < 0.5 ? 'spot' : (Math.abs(f.x) < 6.5 ? 'roll_b' : 'spot'); inp.face = dir; if (inp.act === 'roll_b') inp.act = f.facing === dir ? 'roll_b' : 'roll_f'; H.punishT = 34; return true; }
  acc += st.counter * 0.4;
  if (r < acc) {
    // a fast poke to trade or beat it
    for (const m of ['jab', 'tilt', 'uptilt'] as MoveId[]) {
      const J = INFO[def.id][m];
      if (I && J.first < I.first - Math.min(I.first, O.frame) && Math.abs(O.x - f.x) < J.reach + 0.3) { inp.act = m; inp.face = dir; return true; }
    }
  }
  acc += st.jumpAway * 0.5;
  if (r < acc) { inp.jump = 1; inp.mx = -dir; return true; }
  return false;
}

/**
 * Neutral: what the hands do when nothing is coming and there is nothing to punish. Each stance plays
 * its own game here, so a viewer (and the coach view) can tell them apart:
 * - rush runs in and commits (grabs, dash attacks, short-hop aerials, shield walks), feinting more when patient;
 * - bait hovers at the edge of the opponent's threat range, dash dancing in and out, and waits for the swing;
 * - keepaway keeps the gap past both fighters' reach, shoots, runs from approaches, pokes at the tip of its range;
 * - wall holds the middle and shields whatever comes into range, then punishes out of shield.
 */
function intentNeutral(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, P: Pred, H: Record<string, any>, st: Style,
  plan: Plan, inp: Input, adist: number, dir: number, bored: boolean): void {
  const T = s.tick;
  const room = dir > 0 ? f.x - ARENA.main.x0 : ARENA.main.x1 - f.x; // deck behind me
  // a committed approach runs until it is spent
  if (H.appr) {
    H.apprT++;
    if (H.apprT > 90 || adist > 12) H.appr = '';
    else if (approach(s, side, f, def, O, odef, H, plan, st, inp, adist, dir)) return;
  }
  if (H.dashT > 0) { H.dashT--; if (room > 1.2) { inp.mx = H.dashDir; return; } H.dashT = 0; }
  // a long lull: whoever is waiting makes something happen, each in its own way
  const lull = T - (s.ctl as Ctl).lastExchange;
  if ((bored || lull > 200) && T >= (H.lullNext || 0)) {
    H.lullNext = T + (lull > 245 ? 25 : 50);
    const r = rnd(s.rng);
    let a = 'grab';
    if (plan.stance === 'keepaway') {
      // keep-away is the last to blink: it shoots if it can and otherwise waits, and only walks up to poke when the crowd is restless
      if (lull > 285) a = 'shield'; else if (lull > 255) a = pickApproach(s, def, plan, st, true);
      else if (SHOT[def.id] && H.shotCd <= 0) a = 'shot';
      else if (lull > 200) a = 'tip';
      else { H.lullNext = T + 20; a = ''; }
    } else if (lull > 285) a = 'shield'; // nothing for almost five seconds: walk in behind the shield and take the grab or the jab
    else if (lull > 245) a = pickApproach(s, def, plan, st, true);
    else if (plan.stance === 'bait') a = r < 0.6 ? 'provoke' : pickApproach(s, def, plan, st, true);
    else if (plan.stance === 'wall') a = r < 0.65 ? 'tip' : 'shield';
    else a = pickApproach(s, def, plan, st, true);
    if (a === 'shot') { if (adist > 2.6 && Math.abs(O.y - f.y) < 1) { inp.act = SHOT[def.id] as MoveId; inp.face = dir; H.shotCd = 50; return; } a = lull > 200 ? 'tip' : ''; }
    if (a) {
      H.appr = a; H.apprT = 0; H.fStop = 0;
      if (approach(s, side, f, def, O, odef, H, plan, st, inp, adist, dir)) return;
    }
  }
  H.intentT = (H.intentT || 0) - 1;
  switch (plan.stance) {
    case 'rush': return rushNeutral(s, side, f, def, O, odef, P, H, st, plan, inp, adist, dir, room);
    case 'keepaway': return keepNeutral(s, side, f, def, O, odef, P, H, st, plan, inp, adist, dir, room);
    case 'wall': return wallNeutral(s, side, f, def, O, odef, P, H, st, plan, inp, adist, dir, room);
    default: return baitNeutral(s, side, f, def, O, odef, P, H, st, plan, inp, adist, dir, room);
  }
}

function crossOver(s: FightState, f: FighterState, O: Obs, H: Record<string, any>, inp: Input, dir: number): void {
  // cornered: get past it over the top or with a roll behind, never while it is swinging
  if (O.act === 'attack' || O.act === 'charge') { inp.shield = true; H.shieldT = 6; return; }
  const B = BLINK[FIGHTERS[f.fighter].id];
  if (B && H.abCd <= 0 && f.grounded) { inp.act = B; inp.face = dir; H.abCd = 120; H.intentT = 14; return; }
  if (rnd(s.rng) < 0.3) { inp.jump = 1; inp.mx = dir; H.airPlan = 'cross'; }
  else inp.act = f.facing === dir ? 'roll_f' : 'roll_b';
  H.intentT = 14;
}

function rushNeutral(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, P: Pred, H: Record<string, any>, st: Style,
  plan: Plan, inp: Input, adist: number, dir: number, room: number): void {
  const oT = THREAT[odef.id];
  const ag = plan.aggression;
  if (adist > oT + 1.2) {
    // closing in: a run, with the odd dash dance when patient
    if (H.intentT <= 0) { H.intent = rnd(s.rng) < (1 - ag) * 0.25 ? 'dance' : 'advance'; H.intentT = 8 + Math.floor(rnd(s.rng) * 8); }
    if (H.intent === 'dance') { inp.mx = (T2(s) % 10) < 5 ? -dir : dir; return; }
    inp.mx = dir;
    return;
  }
  if (H.intentT > 0 && H.intent === 'shield') { inp.shield = f.shield > 30; return; }
  if (H.intentT > 0 && H.intent === 'wait') { inp.mx = 0; return; }
  // in range: commit, poke, or a beat of shield
  const r = rnd(s.rng);
  const pCommit = 0.45 + ag * 0.35, pPoke = 0.3;
  if (r < pCommit) { H.appr = pickApproach(s, def, plan, st, false); H.apprT = 0; H.fStop = 0; approach(s, side, f, def, O, odef, H, plan, st, inp, adist, dir); return; }
  if (r < pCommit + pPoke && H.cool <= 0) {
    const m = pickGroundMove(s, f, def, O, odef, P, H, st, plan, 0, false);
    if (m) { fireGround(s, side, f, def, m, O, odef, H, plan, inp, dir, 0); return; }
  }
  if (r < pCommit + pPoke + 0.12 && f.shield > 40) { H.intent = 'shield'; H.intentT = 8 + Math.floor(rnd(s.rng) * 8); inp.shield = true; return; }
  H.intent = 'wait'; H.intentT = 4 + Math.floor(rnd(s.rng) * 6);
  inp.mx = adist > 1.2 ? dir * 0.6 : 0;
  void room;
}

function T2(s: FightState): number { return s.tick; }

function baitNeutral(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, P: Pred, H: Record<string, any>, st: Style,
  plan: Plan, inp: Input, adist: number, dir: number, room: number): void {
  // hover at the edge of its threat range (wider when it is already moving my way)
  const cl = Math.max(0, closingSpeed(O, dir));
  const D = st.dist + cl * 6;
  const oT = THREAT[odef.id];
  // a long lull: stop dancing and stand for it (someone has to be there for the exchange)
  if (s.tick - (s.ctl as Ctl).lastExchange > 260 && adist < D + 0.8) { inp.mx = f.facing !== dir ? dir * 0.2 : 0; return; }
  // caught inside its range: guard by its habits (a spot dodge timed on its grab, a shield on its strikes), poke if it stands open
  if (adist < oT * 0.9) {
    if (H.intentT > 0 && H.intent === 'guard') { inp.shield = f.shield > 25; return; }
    const grabby = Math.min(1, (H.oGrab || 0) / 2.5);
    const gR = INFO[odef.id].grab.reach + 0.5 + cl * 3;
    if (O.grounded && O.act !== 'attack' && adist < gR + 0.6 && grabby > 0.3 && H.cool <= 0) {
      // strike beats grab: a fast poke placed where the grabber will be
      for (const m of ['jab', 'tilt'] as MoveId[]) {
        const Q = predict(O, odef, H.delay + INFO[def.id][m].first, { x: 0, y: 0 });
        if (moveReaches(def, m, f.x, f.y, dir, Q.x, Q.y, odef, -0.05) && rnd(s.rng) < 0.3 + grabby * 0.5) { inp.act = m; inp.face = dir; H.punishT = 30; return; }
      }
    }
    if (O.grounded && O.act !== 'attack' && adist < gR && rnd(s.rng) < grabby * 0.3) {
      // or out of a grab's reach: grabs only catch a fighter on the ground
      if (room > 2.4 && rnd(s.rng) < 0.6) { inp.jump = 2; inp.mx = -dir; H.airPlan = 'retreat'; H.punishT = 40; return; }
      inp.act = 'spot'; H.punishT = 40; H.intentT = 8; H.intent = 'still'; return;
    }
    // bait never swings first: an opponent standing still in reach only gets a jab
    const r = rnd(s.rng);
    if (r < 0.06 && H.cool <= 0 && O.act === 'idle') {
      for (const m of ['jab', 'tilt'] as MoveId[]) {
        const Q = predict(O, odef, H.delay + INFO[def.id][m].first, { x: 0, y: 0 });
        if (moveReaches(def, m, f.x, f.y, dir, Q.x, Q.y, odef, -0.1)) { inp.act = m; inp.face = dir; return; }
      }
    }
    // bait lives at the edge of its reach: out of range again with a dash back, unless a swing is already on its way
    if (room > 2.6 && O.act !== 'attack' && r < 0.6) { H.dashT = 6 + Math.floor(rnd(s.rng) * 5); H.dashDir = -dir; inp.mx = -dir; return; }
    if (r < 0.6 + (1 - grabby) * 0.25 && f.shield > 35) { H.intent = 'guard'; H.intentT = 8 + Math.floor(rnd(s.rng) * 12); inp.shield = true; H.punishT = 30; return; }
    // otherwise hold the ground, facing it: backing away under pressure only walks into its swings and the ledge
    // otherwise dash back out to the edge of its reach (bait lives out there), or hold the ground with no room
    if (room > 2.6 && O.act !== 'attack') { H.dashT = 6 + Math.floor(rnd(s.rng) * 5); H.dashDir = -dir; inp.mx = -dir; return; }
    if (cl > 0.03 || adist < oT * 0.6) { inp.mx = f.facing !== dir ? dir * 0.2 : 0; return; }
  }
  // backed up to the edge: get past it
  if (adist < D - 0.4 && room <= 1.8) {
    if (adist < THREAT[odef.id] && H.intentT <= 0) { crossOver(s, f, O, H, inp, dir); return; }
    inp.mx = 0;
    return;
  }
  if (adist > D + 2.5) { inp.mx = dir; return; }
  // the dash dance: short dashes in and out, turning every few ticks, drifting back toward the edge of its reach
  // when too close and in toward it when too far (bait's look on screen, and what makes a predicted swing miss)
  const pref = adist < D - 0.4 ? -dir : adist > D + 0.8 ? dir : 0;
  if (H.intentT <= 0 || H.intent !== 'dance') {
    H.danceDir = H.danceDir === dir ? -dir : dir;
    if (room < 2.2) H.danceDir = dir;
    H.intentT = (pref === 0 ? 5 : H.danceDir === pref ? 7 : 3) + Math.floor(rnd(s.rng) * 3);
    H.intent = 'dance';
  }
  inp.mx = H.danceDir;
}

function keepNeutral(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, P: Pred, H: Record<string, any>, st: Style,
  plan: Plan, inp: Input, adist: number, dir: number, room: number): void {
  const K = st.dist;
  const shots = !!SHOT[def.id];
  // shoot whenever there is a lane
  if (shots && H.shotCd <= 0 && adist > 2.6 && adist < Math.min(11, def.moves[SHOT[def.id] as MoveId].projectile!.vx * def.moves[SHOT[def.id] as MoveId].projectile!.life) && Math.abs(O.y - f.y) < 1.0 && O.act !== 'hitstun') {
    inp.act = SHOT[def.id] as MoveId; inp.face = dir; H.shotCd = Math.round((62 + Math.floor(rnd(s.rng) * 46)) * (1.3 - plan.aggression * 0.6)); return;
  }
  if (adist < K - 0.5) {
    if (room > 2 && s.tick - (s.ctl as Ctl).lastExchange < 260) { inp.mx = -dir; return; }
    if (adist < THREAT[odef.id] + 0.5 && H.intentT <= 0) { crossOver(s, f, O, H, inp, dir); return; }
    // cornered and it is not close yet: poke at the tip
    const m = H.cool <= 0 ? pickGroundMove(s, f, def, O, odef, P, H, st, plan, 0, false) : null;
    if (m) { fireGround(s, side, f, def, m, O, odef, H, plan, inp, dir, 0); return; }
    inp.mx = 0;
    return;
  }
  const cl = closingSpeed(O, dir);
  // hit and run: from outside its reach, the long lunge, then straight back out
  const L = LUNGE[def.id];
  if (L && cl < 0.05 && O.grounded && H.cool <= 0 && Math.abs(O.y - f.y) < 0.6) {
    const I = INFO[def.id][L];
    const lo = I.reach + I.fwdDist * 0.55, hi = I.reach + I.fwdDist * 0.9;
    if (adist > lo && adist < hi && rnd(s.rng) < 0.05 + plan.aggression * 0.08) {
      inp.act = L; inp.face = dir; H.dashT = 0; H.punishT = 0; H.runAfter = 1; return;
    }
    if (adist >= hi && adist < hi + 1.2 && rnd(s.rng) < 0.03 + plan.aggression * 0.05) { inp.mx = dir * 0.6; return; }
  }
  if (H.runAfter && room > 2) { H.runAfter = 0; H.dashT = 10; H.dashDir = -dir; inp.mx = -dir; return; }
  // a passive opponent gets walked down to the tip of the longest poke
  if (cl <= 0.02 && (O.act === 'idle' || O.act === 'shield' || O.act === 'walk') && rnd(s.rng) < Math.max(0, plan.aggression - 0.5) * 0.04) {
    H.appr = 'tip'; H.apprT = 0; return;
  }
  if (adist > K + 1) { inp.mx = dir * 0.6; return; }
  inp.mx = 0;
}

function wallNeutral(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, P: Pred, H: Record<string, any>, st: Style,
  plan: Plan, inp: Input, adist: number, dir: number, room: number): void {
  const oT = THREAT[odef.id];
  // close up: a quick poke or the shield
  if (adist < oT * 0.95) {
    if (H.intentT > 0 && H.intent === 'shield') { inp.shield = f.shield > 25; return; }
    const r = rnd(s.rng);
    if (r < 0.08 + plan.aggression * 0.1 && H.cool <= 0) {
      const m = pickGroundMove(s, f, def, O, odef, P, H, st, plan, 0, false);
      if (m) { fireGround(s, side, f, def, m, O, odef, H, plan, inp, dir, 0); return; }
    }
    if (f.shield > 30) { H.intent = 'shield'; H.intentT = 10 + Math.floor(rnd(s.rng) * 14); inp.shield = true; return; }
    if (room < 1.6) { crossOver(s, f, O, H, inp, dir); return; }
    inp.mx = -dir * 0.5;
    return;
  }
  // otherwise hold the middle, facing it
  const h = home(O);
  if (Math.abs(f.x - h) > 0.6) { inp.mx = f.x < h ? 0.55 : -0.55; return; }
  if (f.facing !== dir) { inp.mx = dir * 0.2; return; }
  inp.mx = 0;
}

function home(O: Obs): number {
  return Math.max(-1.6, Math.min(1.6, O.x * 0.25));
}

function pickApproach(s: FightState, def: FighterDef, plan: Plan, st: Style, lull: boolean): string {
  if (!lull && rnd(s.rng) < st.feint) return 'feint';
  const r = rnd(s.rng);
  if (r < plan.grabMix * 0.9) return 'grab';
  const q = rnd(s.rng);
  if (q < 0.34) return 'air';
  if (q < 0.52) return 'dash';
  if (q < 0.66) return 'shield';
  return 'special';
}

function approach(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, H: Record<string, any>, plan: Plan, st: Style,
  inp: Input, adist: number, dir: number): boolean {
  const I = INFO[def.id];
  const room = dir > 0 ? f.x - ARENA.main.x0 : ARENA.main.x1 - f.x;
  if (Math.abs(O.y - f.y) > 1.2 && H.appr !== 'air' && H.appr !== 'tip' && H.appr !== 'provoke') H.appr = 'air';
  switch (H.appr) {
    case 'grab': {
      if (adist < I.grab.reach + (f.action === 'run' ? 0.5 : 0.1) && O.grounded) {
        inp.act = 'grab'; inp.face = dir; H.appr = ''; return true;
      }
      inp.mx = dir; return true;
    }
    case 'dash': {
      if (f.action === 'run' && adist < I.dash.reach + I.dash.fwdDist * 0.8 + 0.2) { inp.act = 'dash'; inp.face = dir; H.appr = ''; return true; }
      inp.mx = dir; return true;
    }
    case 'air': {
      const win = def.airSpeed * (def.jumpsquat + 3 + I.fair.first) + I.fair.reach * 0.8;
      if (adist < win + 0.4 && adist > 0.6) { inp.jump = rnd(s.rng) < 0.7 ? 2 : 1; inp.mx = dir; H.appr = ''; H.airPlan = 'atk'; return true; }
      inp.mx = dir; return true;
    }
    case 'shield': {
      // walk in behind a shield, then grab or poke
      if (adist < I.grab.reach + 0.2) { inp.act = rnd(s.rng) < 0.05 + plan.grabMix * 0.8 ? 'grab' : 'jab'; inp.face = dir; H.appr = ''; return true; }
      if (adist < 3) { inp.mx = dir * 0.5; return true; }
      inp.mx = dir; return true;
    }
    case 'special': {
      const S = I.special;
      const Bk = BLINK[def.id];
      if (Bk && H.abCd <= 0 && Math.abs(O.y - f.y) < 0.9 && rnd(s.rng) < 0.5) {
        // a blinker closes the last few metres by going through and behind
        if (adist > 1.6 && adist < def.moves[Bk].blink!.behind - 0.3) { inp.act = Bk; inp.face = dir; H.abCd = 110; H.appr = ''; return true; }
        if (adist >= def.moves[Bk].blink!.behind - 0.3) { inp.mx = dir; return true; }
      }
      if (TETHER[def.id] === 'special') {
        if (adist < TETHER_REACH[def.id] - 0.3 && adist > 1.8 && Math.abs(O.y - f.y) < 1.2) { inp.act = 'special'; inp.face = dir; H.appr = ''; return true; }
        if (adist <= 1.8) { H.appr = plan.grabMix > 0.5 ? 'grab' : 'dash'; return false; }
        inp.mx = dir; return true;
      }
      if (def.moves.special.projectile) {
        if (adist > 3 && Math.abs(O.y - f.y) < 1.3 && H.shotCd <= 0) { inp.act = 'special'; inp.face = dir; H.appr = 'air'; H.shotCd = 60; return true; }
        H.appr = 'air'; return false;
      }
      const reach = S.reach + S.fwdDist * 0.85;
      if (adist < reach && adist > reach - 2.2) { inp.act = 'special'; inp.face = dir; H.appr = ''; return true; }
      if (adist < reach - 2.2) { H.appr = plan.grabMix > 0.5 ? 'grab' : 'dash'; return false; }
      inp.mx = dir; return true;
    }
    case 'feint':
    case 'provoke': {
      // run to just inside the edge of its reach, stop, and get out again: draw the swing, punish the whiff
      const edge = REACH[odef.id] + def.width * 0.5 + (H.appr === 'feint' ? 0.35 : 0.1);
      if (!H.fStop) {
        if (adist > edge) { inp.mx = dir; return true; }
        H.fStop = s.tick;
      }
      const t = s.tick - H.fStop;
      if (t < (H.appr === 'feint' ? 8 : 5)) {
        // stand there a moment, shield up if a swing is already coming
        if (threatened(O, odef, f, def, H.delay)) { inp.shield = true; H.shieldT = 6; }
        return true;
      }
      H.fStop = 0; H.appr = ''; H.punishT = 45;
      if (room > 1.4) { H.dashT = 8; H.dashDir = -dir; inp.mx = -dir; return true; }
      return false;
    }
    case 'tip': {
      // keep-away stage control: walk up to the tip of its longest poke and poke from there
      const m = pickGroundMove(s, f, def, O, odef, predict(O, odef, H.delay, { x: 0, y: 0 }), H, st, plan, 0, false);
      if (m) { fireGround(s, side, f, def, m, O, odef, H, plan, inp, dir, 0); H.appr = ''; H.dashT = 8; H.dashDir = -dir; return true; }
      if (adist > POKE[def.id] + 0.2) { inp.mx = dir * 0.55; return true; }
      H.appr = '';
      return false;
    }
  }
  return false;
}

// ------------------------------------------------------------------------------------------------
// Shield
// ------------------------------------------------------------------------------------------------

function shieldLogic(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, H: Record<string, any>, st: Style, plan: Plan, inp: Input): void {
  const dir = O.x >= f.x ? 1 : -1;
  const live = s.fighters[1 - side];
  if (f.action === 'shieldstun') {
    // the shield knows what it just blocked: remember when that move will be over
    if (f.actionFrame <= 2 && H.blkTick !== s.tick - f.actionFrame) {
      H.blkTick = s.tick - f.actionFrame;
      H.blkEnd = -1;
      if (live.action === 'attack' && live.move) {
        const md = odef.moves[live.move];
        const left = md.startup + md.active + md.recovery - live.actionFrame;
        H.blkEnd = s.tick + (md.kind === 'air' && !live.grounded ? Math.min(left, (md.landingLag || 8) + 4) : left);
        H.blkX = live.x;
      }
    }
    inp.shield = true; H.shieldT = Math.max(H.shieldT, 4); H.oos = 30; return;
  }
  if (H.oos > 0) H.oos--;
  // out of shield punish on the move it blocked, only when the option fits in what is left of it
  const left = H.oos > 0 && H.blkEnd > 0 ? H.blkEnd - s.tick : 0;
  const bx = H.oos > 0 ? live.x : O.x; // the blocked attacker is right there
  const adist0 = Math.abs(bx - f.x);
  if (left > 0 && adist0 < 2.8 && rnd(s.rng) < st.oos) {
    const I = INFO[def.id];
    const opts: [string, number, number][] = [
      ['grab', I.grab.first, I.grab.reach - 0.1],
      ['upsmash', I.upsmash.first, Math.max(1.1, I.upsmash.reach)],
      ['nair', def.jumpsquat + I.nair.first, I.nair.reach + 0.35],
      ['fair', def.jumpsquat + I.fair.first, I.fair.reach + 0.5],
      ['recover', I.recover.first, Math.max(0.9, I.recover.reach)],
    ];
    // where the attacker will be when the option comes out: the shield's pushback is still sliding me away
    const ov = (s.ctl as Ctl).eng[side].ovx;
    const gapThen = adist0 + Math.min(1.2, (ov * ov) / (2 * def.traction)) + 0.08 - odef.width * 0.45;
    for (const [m, first, reach] of opts) {
      if (first + 1 > left || gapThen > reach) continue;
      if (m === 'grab' && !live.grounded) continue;
      if (m === 'grab' || m === 'upsmash' || m === 'recover') { inp.act = m; inp.face = bx >= f.x ? 1 : -1; H.blkEnd = -1; return; }
      inp.jump = 2; inp.mx = bx >= f.x ? 1 : -1; H.airPlan = 'oos'; H.blkEnd = -1; return;
    }
  }
  const adist = Math.abs(O.x - f.x);
  if (H.shieldT > 0) { H.shieldT--; inp.shield = true; return; }
  // keep holding while a move is still coming
  if (threatened(O, odef, f, def, H.delay) || projectileComing(s, side, f, def, H.delay)) { inp.shield = f.shield > 25; return; }
  // the hold is over: decide again (dropping a shield costs a few ticks, so this is a real choice)
  const oT = THREAT[odef.id];
  const band = adist < oT * 0.9 ? 'in' : adist < oT + 1.3 ? 'edge' : 'far';
  // an opponent standing in grab range and not swinging gets grabbed out of shield
  if (adist < INFO[def.id].grab.reach + 0.05 && O.grounded && (O.act === 'idle' || O.act === 'shield') && rnd(s.rng) < st.oos * 0.4 * plan.grabMix * plan.grabMix) {
    inp.act = 'grab'; inp.face = dir; return;
  }
  // an opening seen from behind the shield: take it with an out-of-shield option (no drop), or drop only when there is time
  const vulS = oppVulnerableTicks(O, odef, H.delay, f, def);
  if (vulS > 0 && O.grounded && rnd(s.rng) < st.oos) {
    const I = INFO[def.id];
    const g = adist - odef.width * 0.45;
    if (g < I.grab.reach - 0.15 && I.grab.first + 1 <= vulS) { inp.act = 'grab'; inp.face = dir; return; }
    if (g < Math.max(1.1, I.upsmash.reach) && I.upsmash.first + 1 <= vulS) { inp.act = 'upsmash'; inp.face = dir; return; }
    if (g < I.nair.reach + 0.35 + def.airSpeed * def.jumpsquat && def.jumpsquat + I.nair.first + 1 <= vulS) { inp.jump = 2; inp.mx = dir; H.airPlan = 'oos'; return; }
    if (vulS > 12) { inp.shield = false; H.intentT = 0; return; }
  }
  // dropping a shield in front of an opponent that can swing costs 7 ticks: keep it up while it stands in reach and is not open
  // (a wall almost always does; a grab still takes it)
  const keep = plan.stance === 'wall' ? 0.9 : plan.stance === 'bait' ? ((H.oGrab || 0) / 2.5 < 0.45 ? 0.9 : 0.25) : plan.stance === 'keepaway' ? 0.4 : 0.3;
  // (two shields facing each other is nobody's plan: an opponent sitting in its own shield or standing still is no reason to keep it up)
  const pressing = O.act !== 'shield' && O.act !== 'shieldstun' && O.act !== 'idle';
  if (pressing && adist < REACH[odef.id] + def.width * 0.5 + 0.5 && O.grounded && oppVulnerableTicks(O, odef, H.delay) <= 0 && f.shield > 30 && rnd(s.rng) < keep) {
    H.shieldT = 6 + Math.floor(rnd(s.rng) * 8); inp.shield = true; return;
  }
  if ((plan.stance === 'wall' || plan.stance === 'bait' && (H.oGrab || 0) / 2.5 < 0.45) && band === 'in' && pressing && f.shield > 30 && rnd(s.rng) < 0.5) { H.shieldT = 8 + Math.floor(rnd(s.rng) * 9); inp.shield = true; return; }
  H.intentT = 0; H.intent = '';
  // still in its reach: leave the shield with an action rather than a 7-tick drop (roll or hop away, or a spot dodge)
  const room = dir > 0 ? f.x - ARENA.main.x0 : ARENA.main.x1 - f.x;
  if (adist < REACH[odef.id] + def.width * 0.5 + 0.3 && O.grounded && (plan.stance === 'bait' || plan.stance === 'keepaway')) {
    const r = rnd(s.rng);
    if (room > 3 && r < 0.45) { inp.act = f.facing === dir ? 'roll_b' : 'roll_f'; H.punishT = 34; return; }
    if (r < 0.7) { inp.jump = 2; inp.mx = room > 2 ? -dir : dir; H.airPlan = room > 2 ? 'retreat' : 'cross'; return; }
  }
  inp.shield = false;
}

// ------------------------------------------------------------------------------------------------
// Air
// ------------------------------------------------------------------------------------------------

const AIRS: MoveId[] = ['nair', 'fair', 'bair', 'uair', 'dair'];

function airLogic(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, H: Record<string, any>, st: Style, plan: Plan, inp: Input): void {
  const dir = O.x >= f.x ? 1 : -1;
  const adist = Math.abs(O.x - f.x);
  // just out of a launch with the opponent chasing: get away
  const ctl = s.ctl as Ctl;
  const justHit = s.tick - ctl.eng[side].lastHitTick < 70;
  if (justHit && adist < 3 && (O.act === 'attack' || O.act === 'rise' || O.act === 'jumpsquat') && rnd(s.rng) < (plan.stance === 'rush' ? 0.12 : 0.25)) {
    const r = rnd(s.rng);
    if (r < 0.45) { inp.act = 'airdodge'; return; }
    if (r < 0.8 && f.airJumpsLeft > 0) { inp.jump = 1; inp.mx = -dir; return; }
    inp.mx = -dir; inp.fastfall = f.vy < 0; return;
  }
  const want = H.airPlan === 'atk' || H.airPlan === 'oos' || H.airPlan === 'deep' || H.airPlan === 'retreat' || O.act === 'hitstun' || (H.cool <= 0 && rnd(s.rng) < st.attack + 0.05);
  // drift toward the opponent when attacking, away when keeping out, past it when crossing over
  if (H.airPlan === 'cross') { inp.mx = f.vx >= 0 ? 1 : -1; if (Math.abs(f.x) > 6.5) H.airPlan = ''; }
  else if (H.airPlan === 'deep') { const Q = predict(O, odef, H.delay + 8, { x: 0, y: 0 }); inp.mx = Math.abs(Q.x - f.x) > 0.3 ? (Q.x > f.x ? 1 : -1) : 0; }
  else if (H.airPlan === 'retreat') { inp.mx = Math.abs(f.x) < 7 ? -dir : 0; if (f.vy < -0.02 && f.y < 0.6) H.airPlan = ''; }
  else if (st.poke > 0.9 && H.airPlan !== 'atk' && adist < st.dist) inp.mx = -dir;
  else if (plan.stance !== 'rush' && H.airPlan !== 'atk' && H.airPlan !== 'oos' && O.act !== 'hitstun') {
    // the patient stances get back to the ground out of its reach rather than drift into it
    inp.mx = adist < st.dist && Math.abs(f.x) < 7 ? -dir : plan.stance === 'wall' ? (f.x > 0.8 ? -0.6 : f.x < -0.8 ? 0.6 : 0) : 0;
    if (f.vy < 0 && f.y > 0.3) inp.fastfall = true;
  }
  else inp.mx = adist > 0.4 ? dir : 0;
  if (want) {
    let best: MoveId | null = null, bestSc = -1e9;
    for (const m of AIRS) {
      const I = INFO[def.id][m];
      const L = I.first;
      // where I will be
      let x = f.x, y = f.y, vy = f.vy, landed = false;
      for (let t = 0; t < L; t++) { vy = Math.max(vy - def.gravity, -(f.fastFall ? def.fastFallSpeed : def.fallSpeed)); y += vy; x += f.vx; if (y <= 0 && onDeck(x) && f.y >= 0) { landed = true; break; } }
      if (landed) continue;
      // never swing out past the ledge low enough that the move ends below where the ledge can be caught
      if (Math.abs(x) > 7.4) {
        let y2 = y, vy2 = vy, x2 = x;
        for (let t = L; t < I.total; t++) { vy2 = Math.max(vy2 - def.gravity, -def.fallSpeed); y2 += vy2; x2 += f.vx * 0.8; }
        if (Math.abs(x2) > 7.9 && y2 + def.height * 0.85 < (f.airJumpsLeft > 0 ? -2.5 : -0.6)) continue;
      }
      const Q = predict(O, odef, H.delay + L, { x: 0, y: 0 });
      if (!moveReaches(def, m, x, y, f.facing, Q.x + H.err * 0.5, Q.y, odef, 0)) continue;
      let sc = I.dmg - I.first * 0.3 + rnd(s.rng) * 3;
      if (m === 'dair' && !onDeck(Q.x)) sc += 12; // spike offstage
      if ((m === 'fair' || m === 'bair') && Math.abs(Q.x) > 6) sc += 4;
      if (sc > bestSc) { bestSc = sc; best = m; }
    }
    if (best) { inp.act = best; if (H.airPlan === 'retreat') H.punishT = 30; if (H.airPlan !== 'deep') H.airPlan = ''; return; }
  }
  // fast fall once past the peak when going down to fight
  // fast fall once past the peak over the deck, as good players do (not while crossing over)
  if (f.vy < 0 && f.y > 0.4 && H.airPlan !== 'cross' && onDeck(f.x)) inp.fastfall = true;
  // land on a platform with the opponent, or drop
  if (f.vy < -0.05 && O.y < f.y - 1.5 && f.y > 1) inp.drop = true;
  // double jump to chase an opponent above
  if (f.airJumpsLeft > 0 && O.y > f.y + 2 && adist < 3 && O.act === 'hitstun' && f.vy < 0.05) { inp.jump = 1; inp.mx = dir; }
  if (H.airPlan === 'plat' && f.airJumpsLeft > 0 && O.grounded && O.y > f.y + 0.6 && f.vy < 0) { inp.jump = 1; inp.mx = dir; H.airPlan = 'atk'; }
}

function airDuringMove(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, H: Record<string, any>, inp: Input): void {
  const off = isOffstage(f.x, f.y, false) || !onDeck(f.x);
  if (off) { inp.mx = f.x > 0 ? -1 : 1; return; }
  const dir = O.x >= f.x ? 1 : -1;
  inp.mx = dir * 0.6;
  if (f.vy < 0 && f.y > 0.4 && f.move && def.moves[f.move].kind === 'air') {
    const I = INFO[def.id][f.move];
    if (f.actionFrame > I.last) inp.fastfall = true;
  }
}

function helplessDrift(f: FighterState, inp: Input): void {
  // drift toward the ledge, or onto the deck if above it
  const lx = f.x > 0 ? 8 : -8;
  if (f.y > 0.3) inp.mx = f.x > 0 ? -1 : 1;
  else inp.mx = Math.abs(f.x - lx) > 0.3 ? (f.x > lx ? -1 : 1) : 0;
}

// ------------------------------------------------------------------------------------------------
// Recovery
// ------------------------------------------------------------------------------------------------

function recovery(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, H: Record<string, any>, plan: Plan, inp: Input): void {
  const o = f.x > 0 ? 1 : -1; // side of the stage I am on
  const lx = 8 * o;
  const out = (f.x - lx) * o; // metres outside the ledge (negative = under the deck)
  inp.mx = -o;
  inp.face = -o;
  // choose high or low once per trip
  if (!H.rec || s.tick - H.recT > 300) {
    H.rec = plan.recover === 'mix' ? (rnd(s.rng) < 0.5 ? 'high' : 'low') : plan.recover;
    H.recT = s.tick;
  }
  const high = H.rec === 'high';
  const ledgeHandY = -def.height * 0.85;
  if (out < 0.35 && f.y < 0) { inp.mx = o; if (f.airJumpsLeft > 0 && f.y < ARENA.blast.bottom + 4.5) inp.jump = 1; return; }
  // the ledge is taken: aim for the deck top
  const ledgeTaken = O.act === 'ledgehang' && Math.sign(O.x) === o;
  const goHigh = high || ledgeTaken;

  // jump: high spends it early to come in over the deck, low saves it
  if (f.airJumpsLeft > 0 && f.vy < 0.02) {
    const jumpY = goHigh ? 1.2 : ledgeHandY - 1.6;
    if (f.y < jumpY || f.y < ARENA.blast.bottom + 5 || out > 4.5) { inp.jump = 1; return; }
  }
  // the opponent is out here with me: hit it if it is close
  if (!O.grounded && Math.abs(O.x - f.x) < 1.6 && Math.abs(O.y - f.y) < 1.8 && O.act !== 'ledgehang' && O.act !== 'hitstun' &&
    f.airJumpsLeft > 0 && f.y > 0.3) {
    const m: MoveId = O.y < f.y - 0.6 ? 'dair' : (O.x - f.x) * f.facing > 0 ? 'fair' : 'bair';
    // coming back over the top of a guard that jumped out low: that is the moment to hit it
    if (rnd(s.rng) < (high && O.y < f.y ? 0.6 : 0.25)) { inp.act = m; return; }
  }
  // airdodge through an edge guarder above me (mix-up)
  if (!O.grounded && Math.abs(O.x - f.x) < 1.4 && O.y > f.y && f.y > ledgeHandY && rnd(s.rng) < 0.04) { inp.act = 'airdodge'; return; }
  if (f.airJumpsLeft > 0 && f.y > ledgeHandY - 0.5 && out < 2.5) return; // can drift in
  if (f.y > 0.3 && out < 2.2) return; // coming in over the deck
  // up special
  const id = def.id;
  const below = f.y - ledgeHandY; // negative when under the ledge hang height
  let use = false;
  if (id === 'tick') {
    // aimed: at the ledge low, at the deck top high
    const tx = goHigh ? lx - o * 1.2 : lx + o * 0.5;
    const ty = goHigh ? 1.0 : ledgeHandY + 0.2;
    const dx = tx - f.x, dy = ty - f.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 6.4 && (f.vy < 0 || d > 5) || f.y < ARENA.blast.bottom + 4) { use = true; inp.aimx = dx; inp.aimy = dy; }
  } else if (id === 'gantry' || id === 'hexer') {
    const hx = lx - f.x, hy = 0 - (f.y + def.height * 0.8);
    const d = Math.sqrt(hx * hx + hy * hy);
    if ((d < 5.6 && (below < (goHigh ? 0.5 : -0.8)) && f.vy < 0.05) || f.y < ARENA.blast.bottom + 4 || (d < 6 && out > 3)) use = true;
  } else {
    const rise = id === 'kiln' ? 3.9 : id === 'mimic' ? 4.4 : 4.6;
    const side2 = !(H.used2side) && out > 2.4 && f.y > ledgeHandY - 1.5;
    if (moveExtra(id, 'special2').fwd && side2 && f.airJumpsLeft === 0) { inp.act = 'special2'; inp.face = -o; return; }
    if ((f.y + rise > (goHigh ? 0.6 : ledgeHandY + 0.2) && f.y < (goHigh ? 0.2 : ledgeHandY - 1.2) && out < 2.2) ||
      f.y < ARENA.blast.bottom + 4.2 || (f.y < ledgeHandY - 2.4)) use = true;
  }
  if (use && f.vy < 0.06) { inp.act = 'recover'; inp.face = -o; }
}

// ------------------------------------------------------------------------------------------------
// Ledge
// ------------------------------------------------------------------------------------------------

function ledgeOptions(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, H: Record<string, any>, st: Style, plan: Plan, inp: Input): void {
  if (H.ledgeWait < 0) H.ledgeWait = 8 + Math.floor(rnd(s.rng) * (plan.stance === 'rush' ? 10 : 20));
  H.rec = '';
  const o = f.ledge === 0 ? -1 : 1;
  const oppOut = isOffstage(O.x, O.y, O.grounded) && Math.sign(O.x) === o && O.act !== 'dead' && O.act !== 'respawn';
  if (oppOut && plan.edge === 'ledge' && f.actionFrame < 200 && !(Math.abs(O.x - f.x) < 1.6 && Math.abs(O.y - f.y) < 1.6)) return;
  if (f.actionFrame < H.ledgeWait) return;
  H.ledgeWait = -1;
  const near = Math.abs(O.x - 8 * o) < 2.6 && O.grounded;
  const r = rnd(s.rng);
  if (near && O.act === 'attack') { inp.act = r < 0.5 ? 'ledgeroll' : 'ledgejump'; return; }
  // a guard standing close gets the attack or the jump; a guard far back gets the climb
  const close = Math.abs(O.x - 8 * o) < 2.2;
  if (r < (close ? 0.15 : 0.4)) inp.act = 'climb';
  else if (r < (close ? 0.45 : 0.6)) inp.act = 'ledgejump';
  else if (r < (close ? 0.65 : 0.78)) inp.act = 'ledgeroll';
  else if (r < 0.94) inp.act = 'ledgeattack';
  else { inp.act = 'ledgedrop'; }
}

// ------------------------------------------------------------------------------------------------
// Edge guarding
// ------------------------------------------------------------------------------------------------

function edgeguard(s: FightState, side: Side, f: FighterState, def: FighterDef, O: Obs, odef: FighterDef, H: Record<string, any>, st: Style, plan: Plan, inp: Input): boolean {
  const o = O.x > 0 ? 1 : -1;
  const edgeX = 8 * o;
  const toEdge = edgeX - f.x;
  const mode = H.kill && O.damage > 80 ? 'deep' : plan.edge; // going for the kill means going out after it
  if (O.act === 'ledgehang') {
    // ledge trap: stand back from the ledge and wait for the getup
    const spot = edgeX - o * (mode === 'stage' ? 2.4 : 1.7);
    if (Math.abs(f.x - spot) > 0.4) { inp.mx = f.x < spot ? 0.7 : -0.7; return true; }
    inp.mx = 0;
    return true;
  }
  if (mode === 'ledge') {
    // run to the ledge and hang on it so the opponent cannot grab it
    if (Math.abs(toEdge) < 1.0 && O.y < -0.5) { inp.act = 'ledgegrab'; return true; }
    if (Math.abs(toEdge) > 0.6) { inp.mx = Math.sign(toEdge); return true; }
    return true;
  }
  if (mode === 'deep') {
    // go out after it: to the edge first, then off it to meet where the recovery is heading
    if (Math.abs(toEdge) > 1.2) { inp.mx = Math.sign(toEdge); return true; }
    if (O.act === 'hitstun' && O.tumble) { inp.mx = 0; return true; } // still flying: wait for it to start back
    const Q = predict(O, odef, H.delay + 14, { x: 0, y: 0 });
    const qOut = (Q.x - edgeX) * o;
    if (qOut > -0.3 && qOut < 4.5 && Q.y > -4.2 && Q.y < 3) {
      H.airPlan = 'deep'; H.deepT = s.tick;
      if (Q.y < -1.2) { inp.mx = o; return true; } // it is coming up low: step off and drop onto it
      inp.jump = Q.y > 1 ? 1 : 2; inp.mx = o; return true;
    }
    inp.mx = 0; return true;
  }
  // stage: hold near the edge, hit it as it lands
  const spot = edgeX - o * 1.6;
  if (Math.abs(f.x - spot) > 0.5) { inp.mx = f.x < spot ? 1 : -1; return true; }
  return false;
}

// ------------------------------------------------------------------------------------------------
// Throws
// ------------------------------------------------------------------------------------------------

function chooseThrow(s: FightState, side: Side, f: FighterState, def: FighterDef, opp: FighterState, H: Record<string, any>, plan: Plan, inp: Input): void {
  if (H.pummel < 0) H.pummel = 6 + Math.floor(rnd(s.rng) * 14);
  if (f.actionFrame < H.pummel) return;
  H.pummel = -1;
  const towardEdgeFront = f.facing > 0 ? 8 - f.x : f.x + 8;
  const towardEdgeBack = 16 - towardEdgeFront;
  const odef = FIGHTERS[opp.fighter];
  // pick the throw with the best result: a kill if one exists, else damage or a follow-up
  let best = 'throwf', bestSc = -1e9;
  for (const t of ['throwf', 'throwb', 'throwu'] as MoveId[]) {
    const h = def.moves[t].hitboxes[0];
    const kb = kbAt(h, opp.damage, odef.weight);
    const edge = t === 'throwf' ? towardEdgeFront : t === 'throwb' ? towardEdgeBack : 12;
    let sc = kb * 0.05 + h.damage * 0.3;
    // rough kill check: knockback needed grows with distance to the blast line
    const need = 60 + edge * 7;
    if (kb > need) sc += 30;
    if (t === 'throwu' && opp.damage < 60) sc += 3; // follow-ups
    if (H.kill && kb > need * 0.9) sc += 10;
    sc += rnd(s.rng) * 2;
    if (sc > bestSc) { bestSc = sc; best = t; }
  }
  inp.act = best;
  if (H.kill && !H.killSaid) { H.order = 'kill'; H.killSaid = true; }
}
