// The 2D pose engine: one fighter state in, the joints of a hand-inked figure out.
//
// Pure and stateless: the same (state, prev, alpha, other, t) always gives the same joints, so
// captures and replays are exact. No Math.random, no Date, nothing kept between calls.
//
// Local figure units: the feet line is y = 0, up is -y, +x is the way the figure faces, 100 units
// to the metre (UNITS_PER_M). Screen angles: 0 = forward, -PI/2 = up, PI/2 = down, PI = back.
//
// How it works. Every action builds a Rig (hip, lean, the four hand and foot targets, the prop
// angle, spin, stretch); solve() turns a Rig into Joints with the spine from the build and
// two-bone IK for the arms (elbows back and down) and legs (knees forward). Attacks are three key
// rigs per MoveAnim: W (the anticipation, end of startup), K (the strike, built AROUND the sim's
// active hitbox: the leading hand, the prop tip or the foot is put inside the circle and the body
// leans and steps until it can reach) and F (the follow-through). Hands and feet travel between
// keys on arcs about the shoulder or hip, never straight lines (except jabs and thrusts), the
// back arm and the head run two frames late (overlap), and build.heft sets squash and settle.

import type { Build, CharacterDef, Joints, MoveAnim, PoseFn } from './api.ts';
import type { Pt } from './pen.ts';
import type { FighterDef, FighterState, Hitbox, MoveDef, MoveId } from '../sim/types.ts';
import { FIGHTERS } from '../sim/fighters.ts';
import { LEDGE_X } from '../sim/arena.ts';
import { CAST } from './cast/index.ts';

// ------------------------------------------------------------------------------------------------
// small math
// ------------------------------------------------------------------------------------------------

const PI = Math.PI;
const TAU = PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const c01 = (v: number): number => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const outCubic = (u: number): number => 1 - (1 - c01(u)) ** 3;
const outQuad = (u: number): number => 1 - (1 - c01(u)) ** 2;
const inOutSine = (u: number): number => 0.5 - 0.5 * Math.cos(PI * c01(u));
const inOutCubic = (u: number): number => { const x = c01(u); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; };
const outBack = (u: number, k = 1.3): number => { const x = c01(u) - 1; return 1 + (k + 1) * x * x * x + k * x * x; };
/** 0 before a, rises to 1 at peak, falls back to 0 at b */
const bump = (f: number, a: number, peak: number, b: number): number =>
  f <= a || f >= b ? 0 : f < peak ? inOutSine((f - a) / (peak - a)) : inOutSine((b - f) / (b - peak));

const P = (x: number, y: number): Pt => [x, y];
const add = (a: Pt, v: Pt, k = 1): Pt => [a[0] + v[0] * k, a[1] + v[1] * k];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (v: Pt): number => Math.hypot(v[0], v[1]);
const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const polar = (a: number, r: number): Pt => [Math.cos(a) * r, Math.sin(a) * r];
const angOf = (v: Pt): number => Math.atan2(v[1], v[0]);
const mixP = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** unit vector "up the spine" for a lean (0 = upright, + tips forward) */
const upV = (lean: number): Pt => [Math.sin(lean), -Math.cos(lean)];
/** unit vector "forward" across the spine */
const fwdV = (lean: number): Pt => [Math.cos(lean), Math.sin(lean)];
/** p moved toward c so it lies within r of c */
const within = (p: Pt, c: Pt, r: number): Pt => { const d = sub(p, c), l = len(d); return l <= r ? p : add(c, d, r / (l || 1)); };
/** angle from a0 toward a1 by u, the way `sense` says (+1 increasing, -1 decreasing, 0 shortest) */
function angLerp(a0: number, a1: number, u: number, sense: number): number {
  let d = a1 - a0;
  if (sense > 0) { while (d < 0) d += TAU; while (d >= TAU) d -= TAU; }
  else if (sense < 0) { while (d > 0) d -= TAU; while (d <= -TAU) d += TAU; }
  // a swing never goes most of the way round: that is two near angles, take the short way
  if (sense === 0 || Math.abs(d) > PI * 1.5) { while (d > PI) d -= TAU; while (d < -PI) d += TAU; }
  return a0 + d * u;
}
/** a small deterministic wobble in -1..1 */
const wob = (x: number, seed: number): number => Math.sin(x * 1.7 + seed) * 0.6 + Math.sin(x * 2.9 + seed * 2.3) * 0.4;

// ------------------------------------------------------------------------------------------------
// the rig: what each action decides; solve() makes Joints from it
// ------------------------------------------------------------------------------------------------

interface Rig {
  hip: Pt;
  /** torso lean (radians, + forward) and the extra bend of the upper back */
  lean: number;
  bend: number;
  /** head tilt relative to the upper back */
  head: number;
  hF: Pt;
  hB: Pt;
  fF: Pt;
  fB: Pt;
  prop: number;
  spin: number;
  stretch: number;
  /** elbow side: 1 = the natural side (down and back), -1 = flipped */
  eF: number;
  eB: number;
  /** 1 = feet on the deck (they slide in under the hip rather than float), 0 = free */
  plant: number;
}

function cloneRig(r: Rig): Rig {
  return { ...r, hip: [r.hip[0], r.hip[1]], hF: [r.hF[0], r.hF[1]], hB: [r.hB[0], r.hB[1]], fF: [r.fF[0], r.fF[1]], fB: [r.fB[0], r.fB[1]] };
}

function mixRig(a: Rig, b: Rig, u: number): Rig {
  if (u <= 0) return cloneRig(a);
  if (u >= 1) return cloneRig(b);
  return {
    hip: mixP(a.hip, b.hip, u), lean: lerp(a.lean, b.lean, u), bend: lerp(a.bend, b.bend, u), head: lerp(a.head, b.head, u),
    hF: mixP(a.hF, b.hF, u), hB: mixP(a.hB, b.hB, u), fF: mixP(a.fF, b.fF, u), fB: mixP(a.fB, b.fB, u),
    prop: angLerp(a.prop, b.prop, u, 0), spin: lerp(a.spin, b.spin, u), stretch: lerp(a.stretch, b.stretch, u),
    eF: u < 0.5 ? a.eF : b.eF, eB: u < 0.5 ? a.eB : b.eB, plant: lerp(a.plant, b.plant, u),
  };
}

interface Spine { chest: Pt; neck: Pt; sF: Pt; sB: Pt }

function spine(b: Build, hip: Pt, lean: number, bend: number, stretch: number): Spine {
  const T = b.torso * stretch;
  const a2 = lean + bend;
  const chest = add(hip, upV(lean), T * 0.58);
  const neck = add(chest, upV(a2), T * 0.42);
  const f2 = fwdV(a2), u2 = upV(a2);
  const drop = T * 0.08;
  return {
    chest,
    neck,
    sF: add(add(neck, f2, b.shoulderX * 0.55), u2, -drop),
    sB: add(add(neck, f2, -b.shoulderX * 0.55), u2, -drop * 1.25),
  };
}
const spineOf = (b: Build, r: Rig): Spine => spine(b, r.hip, r.lean, r.bend, r.stretch);

const armLen = (b: Build): number => b.arm[0] + b.arm[1];
const legLen = (b: Build): number => b.leg[0] + b.leg[1];

/** two-bone IK from a toward t; the middle joint goes to the side of n. Returns [middle, end]. */
function ik2(a: Pt, t: Pt, l1: number, l2: number, n: Pt): [Pt, Pt] {
  let dx = t[0] - a[0], dy = t[1] - a[1];
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) { dx = 0; dy = 1; d = 1; }
  const ux = dx / d, uy = dy / d;
  const dd = clamp(d, Math.abs(l1 - l2) + 1, (l1 + l2) * 0.999);
  const end: Pt = [a[0] + ux * dd, a[1] + uy * dd];
  const along = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  let nx = -uy, ny = ux;
  if (nx * n[0] + ny * n[1] < 0) { nx = -nx; ny = -ny; }
  return [[a[0] + ux * along + nx * h, a[1] + uy * along + ny * h], end];
}
/** elbows are hinges that bend one way: a hand forward bends the elbow down, a hand up bends it
 *  forward, a hand down bends it back, a hand reaching back bends it up. One fixed side, so an
 *  elbow never pops across the arm as the hand swings round. */
function elbowSide(s: Pt, h: Pt, flip: number): Pt {
  const d = unit(sub(h, s));
  const n: Pt = [-d[1], d[0]];
  return flip < 0 ? [-n[0], -n[1]] : n;
}
/** knees bend forward */
const kneeSide = (hip: Pt, f: Pt): Pt => { const d = unit(sub(f, hip)); return [d[1], -d[0]]; };

/** a planted foot that the leg cannot reach slides along the deck in under the hip */
function plantFoot(b: Build, hip: Pt, f: Pt): Pt {
  const L = legLen(b) * 0.985;
  if (dist(hip, f) <= L) return f;
  const dy = f[1] - hip[1];
  if (Math.abs(dy) >= L) return [hip[0] + Math.sign(f[0] - hip[0]) * 2, f[1]];
  const dx = Math.sqrt(L * L - dy * dy);
  return [hip[0] + Math.sign(f[0] - hip[0] || 1) * dx, f[1]];
}

function solve(b: Build, r: Rig): Joints {
  const sp = spineOf(b, r);
  const a2 = r.lean + r.bend;
  const head = add(sp.neck, upV(a2 + r.head * 0.6), b.neckLen * Math.sqrt(r.stretch));
  const [elbowF, handF] = ik2(sp.sF, r.hF, b.arm[0], b.arm[1], elbowSide(sp.sF, r.hF, r.eF));
  const [elbowB, handB] = ik2(sp.sB, r.hB, b.arm[0], b.arm[1], elbowSide(sp.sB, r.hB, r.eB));
  let fF = r.fF, fB = r.fB;
  if (r.plant > 0.5) { fF = plantFoot(b, r.hip, fF); fB = plantFoot(b, r.hip, fB); }
  const [kneeF, footF] = ik2(r.hip, fF, b.leg[0], b.leg[1], kneeSide(r.hip, fF));
  const [kneeB, footB] = ik2(r.hip, fB, b.leg[0], b.leg[1], kneeSide(r.hip, fB));
  return {
    hip: r.hip, chest: sp.chest, neck: sp.neck, head,
    headTilt: a2 + r.head, lean: r.lean + r.bend * 0.5,
    shoulderF: sp.sF, elbowF, handF, shoulderB: sp.sB, elbowB, handB,
    kneeF, footF, kneeB, footB,
    prop: r.prop, spin: r.spin, stretch: r.stretch,
  };
}

// ------------------------------------------------------------------------------------------------
// base poses
// ------------------------------------------------------------------------------------------------

/** the ready stance: knees soft, staff up and forward, weight shifting and breathing with t */
function ready(b: Build, t: number, breathe = 1, crouch = 0): Rig {
  const L = legLen(b), A = armLen(b);
  const br = Math.sin(t * 2.1) * breathe, sw = Math.sin(t * 0.83 + 0.4) * breathe;
  const hip: Pt = [b.hunch * 10 + sw * 2.2, -b.hipY + 0.05 * L + crouch * L + br * 0.9];
  const lean = b.hunch + 0.04 + br * 0.012;
  const sp = spine(b, hip, lean, 0, 1);
  return {
    hip, lean, bend: 0.02, head: -0.04 - br * 0.02,
    hF: add(sp.sF, [A * 0.42, A * 0.5 + br * 0.8]),
    hB: add(sp.sB, [A * 0.22, A * 0.62 + br * 0.6]),
    fF: [b.stanceX * 0.55, 0], fB: [-b.stanceX * 0.5, 0],
    prop: -PI / 2 + 0.42 + sw * 0.02, spin: 0, stretch: 1, eF: 1, eB: 1, plant: 1,
  };
}

/** standing still, for anything that wants a neutral figure */
export function standJoints(b: Build): Joints {
  return solve(b, ready(b, 0, 0));
}

/** in the air, legs loose under the hip; k 0 = tucked at the apex .. 1 = stretched out falling */
function airPose(b: Build, t: number, k: number): Rig {
  const L = legLen(b), A = armLen(b);
  const hip: Pt = [0, -b.hipY];
  const lean = b.hunch + 0.05 - k * 0.04;
  const sp = spine(b, hip, lean, 0, 1);
  const w = Math.sin(t * 3.1) * 0.5;
  return {
    hip, lean, bend: 0.03, head: 0.02,
    hF: add(sp.sF, polar(lerp(0.9, -0.2, k), A * 0.8)),
    hB: add(sp.sB, polar(lerp(1.9, 2.8, k), A * 0.8)),
    fF: add(hip, [L * lerp(0.36, 0.2, k) + w * 2, L * lerp(0.6, 0.93, k)]),
    fB: add(hip, [-L * lerp(0.12, 0.2, k) - w * 2, L * lerp(0.78, 0.97, k)]),
    prop: lerp(-1.1, -2.1, k), spin: 0, stretch: 1, eF: 1, eB: 1, plant: 0,
  };
}

// ------------------------------------------------------------------------------------------------
// moves: hitbox, anim choice, keys
// ------------------------------------------------------------------------------------------------

const DEFAULT_ANIM: Record<MoveId, MoveAnim> = {
  jab: 'jab', tilt: 'swingSide', uptilt: 'swingUp', dash: 'thrust', smash: 'swingOver', upsmash: 'swingUp',
  nair: 'spin', fair: 'swingSide', bair: 'kick', uair: 'swingUp', dair: 'stomp',
  grab: 'reach', throwf: 'throwObj', throwb: 'throwObj', throwu: 'throwObj',
  special: 'cast', special2: 'swingSide', recover: 'leap',
};
const DEFAULT_HAND: Partial<Record<MoveAnim, 'F' | 'B' | 'both'>> = { reach: 'both', slam: 'both', throwObj: 'both' };

function animOf(ch: CharacterDef, m: MoveId): { anim: MoveAnim; hand: 'F' | 'B' | 'both' } {
  const a = ch.anims[m];
  const anim = a?.anim ?? DEFAULT_ANIM[m];
  return { anim, hand: a?.hand ?? DEFAULT_HAND[anim] ?? 'F' };
}

/** the hitbox the strike is aimed at on this move frame: the largest active one, or the nearest in time */
function hitboxAt(md: MoveDef, frame: number): Hitbox | null {
  let best: Hitbox | null = null;
  for (const h of md.hitboxes) if (frame >= h.from && frame <= h.to && (!best || h.r > best.r)) best = h;
  if (best) return best;
  let bd = 1e9;
  for (const h of md.hitboxes) {
    const d = frame < h.from ? h.from - frame : frame - h.to;
    if (d < bd || (d === bd && best && h.r > best.r)) { bd = d; best = h; }
  }
  return best;
}

type Limb = 'hF' | 'hB' | 'fF' | 'fB';

interface Keys {
  W: Rig;
  K: Rig;
  F: Rig;
  /** limbs the move drives, the arc sense for them and for the prop, and the path kind */
  drive: Limb[];
  sense: number;
  propSense: number;
  line: boolean;
  /** keys for the spin anim */
  spins: number;
}

interface MoveCtx {
  b: Build;
  ch: CharacterDef;
  def: FighterDef;
  s: FighterState;
  md: MoveDef;
  anim: MoveAnim;
  hand: 'F' | 'B' | 'both';
  t: number;
  air: boolean;
  /** the stance the move starts from and settles back to */
  base: Rig;
}

/** a hitbox centre in local units, and its radius */
function hbLocal(h: Hitbox): { c: Pt; r: number } {
  return { c: [h.x * 100, -h.y * 100], r: h.r * 100 };
}

/** is this a body hitbox (centred on the torso and big): no limb is aimed at it */
function bodyHit(b: Build, c: Pt, r: number): boolean {
  return Math.abs(c[0]) < b.shoulderX + 18 && c[1] < -b.hipY * 0.55 && c[1] > -(b.hipY + b.torso) && r > b.torso * 0.75;
}

/** Move the body until `root(rig)` is within `reach` of T: lean toward it, shift the hip, and on
 *  the deck let the front foot step out into a lunge so the reach looks earned. */
function bringTo(b: Build, r: Rig, which: 'hF' | 'hB' | 'foot' | 'body', T: Pt, reach: number, grounded: boolean): void {
  const L = legLen(b);
  for (let i = 0; i < 6; i++) {
    const sp = spineOf(b, r);
    const root = which === 'hF' || which === 'body' ? sp.sF : which === 'hB' ? sp.sB : r.hip;
    const d = sub(T, root), l = len(d);
    const over = l - reach;
    if (over <= 0.5) break;
    const u = unit(d);
    if (which === 'foot') {
      r.hip = add(r.hip, u, over);
    } else {
      // half by lean (forward for targets ahead and low, back for targets up and behind)
      const dl = clamp((over * 0.45 * (u[0] * Math.cos(r.lean) + u[1] * Math.sin(r.lean))) / b.torso, -0.2, 0.25);
      r.lean = clamp(r.lean + dl, -0.7, 1.15);
      r.hip = add(r.hip, [u[0] * over * 0.6, u[1] * over * (u[1] > 0 ? 0.55 : 0.4)]);
    }
  }
  if (grounded) {
    // the hip cannot rise above straight legs; below that the front foot steps out under the lean
    r.hip[1] = Math.max(r.hip[1], -L * 0.985);
    const step = r.hip[0] - (r.fF[0] + r.fB[0]) * 0.5;
    if (step > L * 0.12) r.fF = [Math.max(r.fF[0], r.hip[0] + Math.min(L * 0.55, step * 0.9)), r.fF[1]];
    if (step < -L * 0.12) r.fB = [Math.min(r.fB[0], r.hip[0] + Math.max(-L * 0.55, step * 0.9)), r.fB[1]];
  }
}

/** Where the staff hand goes so the prop TIP lands on T. `side` +1 puts the hand above the
 *  shoulder-to-target line (a chop arriving from above), -1 below (a sweep arriving from under). */
function tipGrip(b: Build, sh: Pt, T: Pt, side: number): { H: Pt; prop: number } | null {
  const Pl = b.propLen;
  if (Pl <= 0) return null;
  const R = armLen(b) * 0.97;
  const d = sub(T, sh), l = len(d), u = unit(d);
  if (l - Pl >= R * 0.55) {
    const H = add(sh, u, Math.min(R, l - Pl));
    return { H, prop: angOf(sub(T, H)) };
  }
  // close targets: the hand goes further out and the staff folds back toward the target
  const rh = clamp(Pl - l + 0.3 * R, 0.55 * R, R);
  if (l < Pl - rh || l < 1) return null;
  // circle (sh, rh) meets circle (T, Pl)
  const a = (rh * rh - Pl * Pl + l * l) / (2 * l);
  const h = Math.sqrt(Math.max(0, rh * rh - a * a));
  const m = add(sh, u, a);
  let n: Pt = [-u[1], u[0]];
  if ((n[1] < 0 ? 1 : -1) !== side) n = [-n[0], -n[1]];
  const H = add(m, n, h);
  return { H, prop: angOf(sub(T, H)) };
}

/** put the driven limb(s) of K on target T: the hand, the prop tip, or the feet */
function aimKey(c: MoveCtx, K: Rig, T: Pt, mode: 'hand' | 'tip' | 'auto', side: number, leadHand: 'F' | 'B' | 'both'): void {
  const b = c.b;
  const A = armLen(b);
  const grounded = !c.air;
  const hk: 'hF' | 'hB' = leadHand === 'B' ? 'hB' : 'hF';
  const canTip = b.propLen > 0 && leadHand !== 'B';
  let useTip = canTip && mode !== 'hand';
  if (canTip && mode === 'auto') {
    // the hand alone if a lean and a step get it there, else the tip
    const sp = spineOf(b, K);
    useTip = dist(sp.sF, T) > A * 0.97 + legLen(b) * 0.12;
  }
  if (useTip) {
    let sp = spineOf(b, K);
    // a staff strike wants room: from a target in front that is too close, step and lean back a little
    const l0 = dist(sp.sF, T);
    const want = b.propLen + 0.45 * A;
    if (l0 < want && Math.abs(T[0] - sp.sF[0]) > Math.abs(T[1] - sp.sF[1]) * 0.6) {
      const L = legLen(b);
      const sg = Math.sign(T[0] - sp.sF[0]) || 1;
      const back = Math.min(L * 0.22, want - l0);
      K.hip = add(K.hip, [-sg * back, 0]);
      K.lean -= (sg * back * 0.4) / b.torso;
      if (grounded) { if (sg > 0) K.fF = [K.fF[0] - back * 0.5, K.fF[1]]; else K.fB = [K.fB[0] + back * 0.5, K.fB[1]]; }
    }
    bringTo(b, K, 'hF', T, A * 0.97 + b.propLen * 0.98, grounded);
    sp = spineOf(b, K);
    const g = tipGrip(b, sp.sF, T, side);
    if (g) { K.hF = g.H; K.prop = g.prop; }
    else useTip = false;
  }
  if (!useTip) {
    bringTo(b, K, hk, T, A * 0.97, grounded);
    K[hk] = T;
    // the staff goes along with the blow, not left standing
    if (canTip && mode !== 'hand') K.prop = angOf(sub(T, spineOf(b, K).sF)) - side * 0.5;
  }
  if (leadHand === 'both') bothHands(b, K);
}

/** the back hand joins the front one on the staff (or beside it with no staff) */
function bothHands(b: Build, r: Rig): void {
  if (b.propLen > 0) r.hB = add(r.hF, polar(r.prop, -b.propLen * 0.2));
  else r.hB = add(r.hF, [-6, 7]);
}

/** Build the three key rigs for a move aimed at local target T (already inside the hitbox). */
function moveKeys(c: MoveCtx, T: Pt, hbR: number): Keys {
  const b = c.b, A = armLen(b), L = legLen(b), air = c.air;
  const B0 = c.base;
  const S0 = spineOf(b, B0);
  const W = cloneRig(B0), K = cloneRig(B0), F = cloneRig(B0);
  const keys: Keys = { W, K, F, drive: ['hF'], sense: 0, propSense: 0, line: false, spins: 0 };
  const hk: Limb = c.hand === 'B' ? 'hB' : 'hF';
  const sh = hk === 'hB' ? S0.sB : S0.sF;
  const toT = sub(T, sh);
  const ang = angOf(toT);
  const dirX = T[0] >= 0 ? 1 : -1;
  const lunge = (r: Rig, k: number): void => {
    r.hip = add(r.hip, [L * k, 0]);
    if (!air) r.fF = [r.fF[0] + L * k * 1.4, 0];
  };
  const crouch = (r: Rig, k: number): void => { r.hip = add(r.hip, [0, L * k]); };
  const offHand = (r: Rig, a: number, k = 0.85): void => {
    const sp = spineOf(b, r);
    if (hk === 'hF' && c.hand !== 'both') r.hB = add(sp.sB, polar(a, A * k));
    else if (hk === 'hB') r.hF = add(sp.sF, polar(a, A * k));
  };
  const setHand = (r: Rig, a: number, k: number): void => {
    const sp = spineOf(b, r);
    r[hk as 'hF' | 'hB'] = add(hk === 'hB' ? sp.sB : sp.sF, polar(a, A * k));
    if (c.hand === 'both') bothHands(b, r);
  };
  const airLegs = (r: Rig, tuck: number): void => {
    if (!air) return;
    r.fF = add(r.hip, [L * lerp(0.2, 0.42, tuck), L * lerp(0.9, 0.5, tuck)]);
    r.fB = add(r.hip, [-L * lerp(0.18, 0.05, tuck), L * lerp(0.95, 0.62, tuck)]);
  };

  switch (c.anim) {
    case 'jab': {
      keys.line = true;
      W.lean += -0.06; W.hip = add(W.hip, [-L * 0.04, L * 0.02]); setHand(W, ang + 1.9, 0.32); offHand(W, ang - 0.1, 0.55);
      W.prop = b.propLen > 0 ? ang - 0.35 : -PI / 2 + 0.25;
      K.lean += 0.14; lunge(K, 0.06); offHand(K, PI * 0.72, 0.7); K.prop = -PI / 2 + 0.35; K.head = 0.06;
      aimKey(c, K, T, 'tip', -1, c.hand);
      F.lean += 0.08; lunge(F, 0.04); F.prop = b.propLen > 0 ? K.prop + 0.25 : -PI / 2 + 0.3;
      { const sp = spineOf(b, F); F[hk as 'hF' | 'hB'] = add(hk === 'hB' ? sp.sB : sp.sF, polar(ang + 0.35, A * 0.72)); }
      offHand(F, PI * 0.6, 0.6);
      airLegs(W, 0.6); airLegs(K, 0.3); airLegs(F, 0.4);
      break;
    }
    case 'swingSide': {
      keys.sense = -1; keys.propSense = -1;
      W.lean -= 0.18; W.bend = -0.08; W.hip = add(W.hip, [-L * 0.06, L * 0.03]); setHand(W, PI - 0.35, 0.72); W.prop = PI + 0.55;
      offHand(W, 0.5, 0.75);
      K.lean += 0.22; K.bend = 0.06; lunge(K, 0.08); crouch(K, 0.04); offHand(K, PI - 0.6, 0.85);
      aimKey(c, K, T, 'tip', -1, c.hand);
      F.lean += 0.14; lunge(F, 0.06); setHand(F, -0.95, 0.82); F.prop = -2.05; offHand(F, PI - 0.3, 0.8);
      airLegs(W, 0.7); airLegs(K, 0.35); airLegs(F, 0.5);
      if (air) { K.fB = add(K.hip, [-L * 0.45, L * 0.7]); }
      break;
    }
    case 'swingOver':
    case 'slam': {
      const deep = c.anim === 'slam' ? 1.4 : 1;
      keys.sense = 1; keys.propSense = 1;
      W.lean -= 0.22 * deep; W.bend = -0.12; W.stretch = 1.04; W.hip = add(W.hip, [-L * 0.06, -L * 0.03]);
      setHand(W, -2.0, 0.86); W.prop = 2.55; offHand(W, -1.4, 0.8);
      if (!air) W.fF = [W.fF[0] - L * 0.05, 0];
      K.lean += 0.38 * deep; K.bend = 0.14; lunge(K, 0.12); crouch(K, 0.1 * deep); offHand(K, PI - 0.3, 0.85); K.head = 0.12;
      aimKey(c, K, T, 'tip', 1, c.hand);
      F.lean += 0.45 * deep; F.bend = 0.12; lunge(F, 0.12); crouch(F, 0.13 * deep); setHand(F, 1.15, 0.86); F.prop = 1.3; offHand(F, 2.4, 0.8);
      airLegs(W, 0.2); airLegs(K, 0.7); airLegs(F, 0.5);
      break;
    }
    case 'swingUp': {
      keys.sense = -1; keys.propSense = -1;
      W.lean += 0.22; crouch(W, 0.16); W.hip = add(W.hip, [-L * 0.03, 0]); setHand(W, 2.15, 0.8); W.prop = 2.0; offHand(W, 0.6, 0.6);
      K.lean -= 0.14; K.stretch = 1.05; K.hip = add(K.hip, [L * 0.05, -L * 0.03]); offHand(K, 1.9, 0.85); K.head = -0.25;
      aimKey(c, K, T, 'tip', -1, c.hand);
      F.lean -= 0.22; setHand(F, -2.0, 0.85); F.prop = -2.35; offHand(F, 1.5, 0.8); F.head = -0.2;
      airLegs(W, 0.8); airLegs(K, 0.2); airLegs(F, 0.4);
      break;
    }
    case 'thrust': {
      keys.line = true;
      W.lean += 0.06; crouch(W, 0.07); W.hip = add(W.hip, [-L * 0.06, 0]); setHand(W, 2.25, 0.45); W.prop = angOf(sub(T, S0.sF)) - 0.05;
      offHand(W, 0.3, 0.7);
      K.lean += 0.42; crouch(K, 0.1); lunge(K, 0.2); if (!air) K.fB = [K.fB[0] - L * 0.12, 0]; offHand(K, PI - 0.25, 0.9); K.head = -0.15;
      aimKey(c, K, T, 'tip', -1, c.hand);
      F.lean += 0.3; crouch(F, 0.08); lunge(F, 0.16); setHand(F, ang + 0.3, 0.7); F.prop = ang + 0.15; offHand(F, PI - 0.4, 0.8);
      airLegs(W, 0.5); airLegs(K, 0.2); airLegs(F, 0.3);
      if (air) { K.fB = add(K.hip, [-L * 0.55, L * 0.6]); }
      break;
    }
    case 'kick':
    case 'kickUp':
    case 'stomp': {
      const both = c.anim === 'stomp';
      const fwd = dirX > 0 && c.anim !== 'stomp';
      const fk: Limb = fwd || both ? 'fF' : 'fB';
      const other: Limb = fk === 'fF' ? 'fB' : 'fF';
      keys.drive = both ? ['fF', 'fB'] : [fk];
      keys.sense = c.anim === 'kickUp' ? -1 : 0;
      W.plant = 0; K.plant = 0; F.plant = 0;
      if (both) {
        W.fF = add(W.hip, [L * 0.16, L * 0.42]); W.fB = add(W.hip, [-L * 0.06, L * 0.48]); W.lean += 0.06;
        W.hF = add(S0.sF, polar(-1.0, A * 0.8)); W.hB = add(S0.sB, polar(-2.1, A * 0.8)); W.prop = -1.4;
        bringTo(b, K, 'foot', T, L * 0.97, false);
        K.fF = add(T, [L * 0.07, 0]); K.fB = add(T, [-L * 0.07, 0]);
        { const sp = spineOf(b, K); K.hF = add(sp.sF, polar(-1.3, A * 0.9)); K.hB = add(sp.sB, polar(-1.9, A * 0.9)); }
        K.prop = -1.75; K.head = 0.25;
        F.fF = add(F.hip, [L * 0.14, L * 0.72]); F.fB = add(F.hip, [-L * 0.1, L * 0.8]);
        { const sp = spineOf(b, F); F.hF = add(sp.sF, polar(-0.4, A * 0.8)); F.hB = add(sp.sB, polar(-2.6, A * 0.8)); }
        F.prop = -1.2;
      } else if (c.anim === 'kickUp') {
        crouch(W, 0.12); W.lean += 0.2; W[fk] = air ? add(W.hip, [L * 0.1, L * 0.7]) : [W[fk][0], 0];
        W.hF = add(S0.sF, polar(1.9, A * 0.85)); W.hB = add(S0.sB, polar(2.3, A * 0.85)); W.plant = air ? 0 : 1;
        K.lean -= 0.6; K.head = -0.3;
        bringTo(b, K, 'foot', T, L * 0.97, false);
        K[fk] = T; K[other] = add(K.hip, [-L * 0.25, L * 0.9]);
        { const sp = spineOf(b, K); K.hF = add(sp.sF, polar(2.0, A * 0.9)); K.hB = add(sp.sB, polar(2.4, A * 0.9)); }
        K.prop = 2.2;
        F.lean -= 0.25; F[fk] = add(F.hip, [L * 0.42, L * 0.55]); F[other] = add(F.hip, [-L * 0.12, L * 0.9]);
        { const sp = spineOf(b, F); F.hF = add(sp.sF, polar(1.2, A * 0.8)); F.hB = add(sp.sB, polar(2.1, A * 0.8)); }
        F.prop = -0.9;
      } else {
        // chamber, snap out, retract: the body leans away from the kick, the arms counter it
        W.lean += fwd ? -0.1 : 0.15; W[fk] = add(W.hip, [dirX * L * 0.12, L * 0.5]);
        if (air) W[other] = add(W.hip, [-dirX * L * 0.1, L * 0.82]);
        W.hF = add(S0.sF, polar(fwd ? 0.6 : 1.2, A * 0.7)); W.hB = add(S0.sB, polar(fwd ? 2.0 : 0.9, A * 0.7));
        K.lean += fwd ? -0.38 : 0.5; K.head = fwd ? -0.1 : 0.15;
        bringTo(b, K, 'foot', T, L * 0.97, false);
        K[fk] = T;
        if (air) K[other] = add(K.hip, [dirX * L * 0.2, L * 0.75]);
        else K.plant = 1;
        { const sp = spineOf(b, K); K.hF = add(sp.sF, polar(fwd ? 2.2 : 0.4, A * 0.85)); K.hB = add(sp.sB, polar(fwd ? 2.6 : 0.9, A * 0.85)); }
        K.prop = fwd ? -2.3 : -0.9;
        F.lean += fwd ? -0.18 : 0.25; F[fk] = add(F.hip, [dirX * L * 0.3, L * 0.62]);
        if (air) F[other] = add(F.hip, [-dirX * L * 0.08, L * 0.85]);
        F.prop = -1.6;
      }
      if (!air && !both) {
        // the standing foot stays planted under the hip
        for (const r of [W, K, F]) { r[other] = [lerp(r[other][0], r.hip[0] - dirX * L * 0.12, 0.6), 0]; r.plant = 0; }
      }
      break;
    }
    case 'spin': {
      keys.spins = c.md.active > 9 ? 2 : 1;
      W.lean += 0.12; crouch(W, 0.05); W.hF = add(S0.sF, polar(1.4, A * 0.45)); W.hB = add(S0.sB, polar(1.0, A * 0.5)); W.prop = PI - 0.3;
      airLegs(W, 1);
      // arms flung out, the staff level across: the tip sweeps the circle as the body turns
      K.lean = b.hunch; crouch(K, 0.02);
      const sp = spineOf(b, K);
      const hipC = K.hip;
      if (b.propLen > 0) {
        const tipR = Math.min(hbR * 0.85, b.propLen + A * 0.8);
        K.prop = -0.12;
        K.hF = within(add(hipC, polar(K.prop, tipR - b.propLen)), sp.sF, A * 0.97);
      } else K.hF = add(sp.sF, polar(-0.1, A * 0.95));
      K.hB = add(sp.sB, polar(PI + 0.15, A * 0.95));
      K.fF = add(K.hip, [L * 0.42, L * 0.78]); K.fB = add(K.hip, [-L * 0.4, L * 0.8]); K.plant = 0;
      F.plant = air ? 0 : 1;
      airLegs(F, 0.5);
      break;
    }
    case 'cast':
    case 'castUp': {
      const up = c.anim === 'castUp';
      keys.sense = up ? -1 : 1; keys.propSense = up ? -1 : 1;
      W.lean -= 0.12; crouch(W, 0.05); W.hip = add(W.hip, [-L * 0.04, 0]);
      setHand(W, up ? 2.2 : -2.45, up ? 0.6 : 0.45); W.prop = up ? 2.4 : -2.0; offHand(W, up ? 0.9 : ang, 0.8);
      K.lean += up ? -0.12 : 0.2; lunge(K, up ? 0 : 0.08); K.head = up ? -0.3 : 0;
      { const sp = spineOf(b, K); const dir = up ? unit([0.15, -1]) : unit(sub(T, sp.sF)); K[hk as 'hF' | 'hB'] = add(hk === 'hB' ? sp.sB : sp.sF, dir, A * 0.97); K.prop = angOf(dir); }
      if (c.hand === 'both') bothHands(b, K);
      offHand(K, PI * 0.7, 0.75);
      F.lean += up ? -0.08 : 0.14; lunge(F, up ? 0 : 0.06); setHand(F, up ? -1.5 : ang + 0.15, 0.9); F.prop = up ? -1.6 : ang; offHand(F, PI * 0.65, 0.7);
      airLegs(W, 0.6); airLegs(K, 0.3); airLegs(F, 0.4);
      break;
    }
    case 'reach': {
      keys.line = true;
      W.lean -= 0.04; crouch(W, 0.05); setHand(W, 1.0, 0.42); W.hB = add(S0.sB, polar(0.8, A * 0.45)); W.prop = -2.0;
      K.lean += 0.3; lunge(K, 0.1); crouch(K, 0.04); K.prop = -2.1;
      aimKey(c, K, T, 'auto', -1, 'F');
      K.hB = add(K.hF, [-8, 9]);
      if (b.propLen > 0 && K.prop > -1.5) K.hB = add(K.hF, polar(K.prop, -b.propLen * 0.2));
      F.lean += 0.38; lunge(F, 0.1); crouch(F, 0.07); setHand(F, 0.9, 0.8); F.hB = add(F.hF, [-10, 6]); F.prop = -1.6;
      airLegs(K, 0.3);
      break;
    }
    case 'charge': {
      // a ram: head down, shoulder first, arms tucked
      keys.line = true;
      W.lean += 0.35; crouch(W, 0.1); W.head = 0.2; W.hF = add(S0.sF, polar(1.6, A * 0.45)); W.hB = add(S0.sB, polar(1.3, A * 0.45)); W.prop = PI + 0.4;
      K.lean += 0.62; crouch(K, 0.08); K.head = 0.35; K.prop = PI + 0.2;
      bringTo(b, K, 'body', T, 4, !air);
      { const sp = spineOf(b, K); K.hF = add(sp.sF, polar(1.3, A * 0.5)); K.hB = add(sp.sB, polar(1.9, A * 0.6)); }
      if (!air) K.fB = [Math.min(K.fB[0], K.hip[0] - L * 0.45), 0];
      F.lean += 0.4; crouch(F, 0.06); lunge(F, 0.1); F.head = 0.15; F.prop = PI + 0.3;
      { const sp = spineOf(b, F); F.hF = add(sp.sF, polar(1.2, A * 0.6)); F.hB = add(sp.sB, polar(1.8, A * 0.65)); }
      airLegs(K, 0.4);
      break;
    }
    case 'leap': {
      keys.sense = -1; keys.propSense = -1;
      W.lean += 0.25; crouch(W, 0.2); setHand(W, 2.2, 0.8); W.hB = add(S0.sB, polar(2.4, A * 0.8)); W.prop = 2.4; W.stretch = 0.95;
      K.lean -= 0.04; K.stretch = 1.07; K.head = -0.2; K.plant = 0;
      { const sp = spineOf(b, K); K.hF = add(sp.sF, polar(-1.4, A * 0.95)); K.hB = add(sp.sB, polar(-1.7, A * 0.9)); K.prop = -1.5; }
      if (!bodyHit(b, T, hbR)) aimKey(c, K, T, 'tip', -1, c.hand);
      K.fF = add(K.hip, [L * 0.15, L * 0.85]); K.fB = add(K.hip, [-L * 0.12, L * 0.95]);
      F.lean += 0.05; F.plant = 0; F.head = 0.1;
      { const sp = spineOf(b, F); F.hF = add(sp.sF, polar(-1.1, A * 0.9)); F.hB = add(sp.sB, polar(-2.0, A * 0.85)); F.prop = -1.3; }
      F.fF = add(F.hip, [L * 0.2, L * 0.8]); F.fB = add(F.hip, [-L * 0.15, L * 0.9]);
      break;
    }
    case 'throwObj':
    default: {
      // a generic two-handed heave (throws are acted in throwPose; this covers odd mappings)
      keys.sense = 1;
      W.lean -= 0.1; crouch(W, 0.08); setHand(W, 0.9, 0.5);
      K.lean += 0.2; lunge(K, 0.06); aimKey(c, K, T, 'auto', 1, c.hand);
      F.lean += 0.15; setHand(F, ang, 0.85);
      break;
    }
  }
  if (c.hand === 'both' && c.anim !== 'reach') { bothHands(b, W); bothHands(b, F); }
  if (c.hand === 'both') keys.drive = keys.drive.concat(['hB']);
  else if (hk === 'hB' && keys.drive[0] === 'hF') keys.drive = ['hB'];
  return keys;
}

/** Mix two key rigs: everything linear except the hands and feet, which travel on arcs about
 *  their shoulder or hip (driven limbs the way the move swings, the rest the short way). */
function arcMix(b: Build, A: Rig, B: Rig, u: number, k: Keys): Rig {
  const r = mixRig(A, B, u);
  if (u <= 0 || u >= 1) return r;
  const sa = spineOf(b, A), sb = spineOf(b, B), sr = spineOf(b, r);
  const roots: Record<Limb, [Pt, Pt, Pt]> = { hF: [sa.sF, sb.sF, sr.sF], hB: [sa.sB, sb.sB, sr.sB], fF: [A.hip, B.hip, r.hip], fB: [A.hip, B.hip, r.hip] };
  for (const l of ['hF', 'hB', 'fF', 'fB'] as Limb[]) {
    const driven = k.drive.indexOf(l) >= 0;
    if (driven && k.line) { r[l] = add(roots[l][2], mixP(sub(A[l], roots[l][0]), sub(B[l], roots[l][1]), u)); continue; }
    const oa = sub(A[l], roots[l][0]), ob = sub(B[l], roots[l][1]);
    const la = len(oa), lb = len(ob);
    const a = angLerp(angOf(oa), angOf(ob), u, driven ? k.sense : 0);
    // a swing pulls in a little as it passes the body
    const rr = lerp(la, lb, u) * (driven && k.sense !== 0 ? 1 - 0.12 * Math.sin(PI * u) : 1);
    r[l] = add(roots[l][2], polar(a, rr));
  }
  r.prop = angLerp(A.prop, B.prop, u, k.propSense);
  return r;
}

/** the move frame (1-based) at which the strike lands */
function strikeFrame(md: MoveDef): number {
  if (md.hitboxes.length === 0 && md.projectile) return md.projectile.frame;
  return md.startup + 1;
}

/** the target a strike aims at on move frame fr: inside the active hitbox, pulled toward the body */
function strikeTarget(c: MoveCtx, fr: number): { T: Pt; r: number; c: Pt } {
  const b = c.b;
  const h = hitboxAt(c.md, fr);
  if (!h) {
    // a pure projectile move: aim at the spawn point
    const pc: Pt = [(c.def.width * 0.5 + 0.4) * 100, -c.def.height * 62];
    return { T: pc, r: 40, c: pc };
  }
  const { c: C, r } = hbLocal(h);
  const sp = spineOf(b, c.base);
  const isFoot = c.anim === 'kick' || c.anim === 'kickUp' || c.anim === 'stomp';
  const root = isFoot ? c.base.hip : sp.sF;
  return { T: within(add(C, unit(sub(root, C)), Math.min(r * 0.42, dist(root, C))), C, r), r, c: C };
}

/** the whole attack at (fractional) move frame f */
function attackRig(c: MoveCtx, f: number, charged: boolean): Rig {
  const md = c.md, b = c.b;
  const S = strikeFrame(md) - 1; // frames of anticipation
  const actEnd = Math.max(S + 1, md.startup + md.active);
  const total = md.startup + md.active + md.recovery;
  const fr = clamp(Math.ceil(f - 1e-6), 1, total);
  const tgt = strikeTarget(c, clamp(fr, S + 1, actEnd));
  const keys = moveKeys(c, tgt.T, tgt.r);
  let r: Rig;
  if (f <= S) {
    const u = f / Math.max(1, S);
    const e = charged ? 1 : S <= 4 ? outQuad(u) : outQuad(Math.min(1, u * 1.15)) * 0.55 + 0.45 * inOutSine(u);
    r = arcMix(b, c.base, keys.W, e, { ...keys, drive: [], propSense: 0 });
  } else if (f <= S + 1) {
    r = arcMix(b, keys.W, keys.K, f - S, keys);
  } else if (f <= actEnd) {
    // the strike holds on the hitbox and creeps along the swing (never a statue)
    const u = (f - S - 1) / Math.max(1, actEnd - S - 1);
    r = arcMix(b, keys.K, keys.F, 0.07 * u, keys);
    r.prop = angLerp(keys.K.prop, keys.F.prop, 0.025 * u, keys.propSense);
    for (const l of keys.drive) {
      if (l === 'hF' || l === 'hB') r[l] = within(r[l], keys.K[l], tgt.r * 0.22);
      else r[l] = within(r[l], keys.K[l], tgt.r * 0.3);
    }
  } else {
    const R = Math.max(1, total - actEnd);
    const v = (f - actEnd) / R;
    // the overshoot takes a few frames (more for a heavy body), then a hold, then the settle
    const o1 = clamp((3 + 3 * b.heft) / R, 0.12, 0.4);
    const settle0 = Math.max(o1 + 0.08, clamp(0.22 + 0.18 * b.heft, 0.3, 0.6));
    if (v < o1) {
      const from = mixRigAt(b, keys, 0.07);
      from.prop = angLerp(keys.K.prop, keys.F.prop, 0.025, keys.propSense);
      r = arcMix(b, from, keys.F, outQuad(v / o1), keys);
    }
    else if (v < settle0) r = cloneRig(keys.F);
    else r = arcMix(b, keys.F, c.base, inOutSine((v - settle0) / (1 - settle0)), { ...keys, sense: 0, propSense: 0, line: false });
    if (v >= o1) {
      // breathing hard in the hold
      const k = 1 - c01((v - settle0) / (1 - settle0));
      r.hip = add(r.hip, [0, Math.sin(f * 0.35) * 1.2 * k * b.heft]);
    }
  }
  // the spin anim turns the whole figure once (or twice) through the active frames
  if (keys.spins > 0) {
    const u = c01((f - S) / (actEnd - S + 1));
    r.spin = keys.spins * TAU * inOutSine(u) * 1;
    if (f > actEnd) r.spin = keys.spins * TAU;
  }
  return r;
}
function mixRigAt(b: Build, k: Keys, u: number): Rig { return arcMix(b, k.K, k.F, u, k); }

// ------------------------------------------------------------------------------------------------
// grabs and throws: the holder's hands and the held body move together
// ------------------------------------------------------------------------------------------------

function buildOf(id: string): Build | null {
  const c = (CAST as Record<string, CharacterDef | undefined>)[id];
  return c ? c.build : null;
}

/** distance between the two feet points while holding, in units */
function holdGap(holder: FighterId2, held: FighterId2): number {
  const hd = FIGHTERS[holder], td = FIGHTERS[held];
  return (hd.width * 0.5 + td.width * 0.5 + 0.05) * 100;
}
type FighterId2 = FighterState['fighter'];

/** the grip point in the holder's local units, and how much the held body is lifted */
function gripPoint(hb: Build, tb: Build, gap: number): { G: Pt; lift: number; bow: number } {
  const collar = tb.hipY + tb.torso * 0.9;
  const lift = tb.height * 0.06;
  const top = hb.hipY + hb.torso * 0.9 + armLen(hb) * 0.45;
  const gh = Math.min(collar + lift, top);
  // a short holder pulls a tall one down into a bow
  const bow = clamp((collar - gh) / tb.torso, 0, 0.9);
  return { G: [gap - tb.shoulderX * 0.6 - 6 - bow * tb.torso * 0.5, -gh], lift: Math.max(0, gh - collar), bow };
}

/** the throw carry: how far the held body is moved (holder units) at holder throw frame f */
function carry(md: MoveDef, id: MoveId, f: number, hb: Build): { d: Pt; spin: number } {
  const S = md.startup;
  const u = c01(f / Math.max(1, S));
  const H = hb.height;
  const e = inOutSine(u);
  const rel = f > S ? c01((f - S) / 3) : 0;
  switch (id) {
    case 'throwu': return { d: [-H * 0.12 * e, -H * 0.55 * e - H * 0.15 * rel], spin: -0.4 * e };
    case 'throwb': return { d: [-H * 0.35 * Math.sin(PI * 0.5 * e), -H * 0.55 * Math.sin(PI * e * 0.8)], spin: -1.6 * e };
    case 'special': return { d: [-H * 0.08 * Math.sin(PI * u), -H * 0.5 * Math.sin(PI * u)], spin: -0.9 * Math.sin(PI * u) };
    default: return { d: [-H * 0.08 * e + H * 0.25 * rel, -H * 0.22 * e], spin: -0.3 * e };
  }
}

/** the holder: arms out to the held fighter, then the throw */
function holdRig(b: Build, s: FighterState, other: FighterState, t: number, f: number): Rig {
  const L = legLen(b), A = armLen(b);
  const tb = buildOf(other.fighter) ?? b;
  const gap = holdGap(s.fighter, other.fighter);
  const { G } = gripPoint(b, tb, gap);
  const r = ready(b, t, 0.5);
  r.lean = b.hunch - 0.08; r.hip = add(r.hip, [-L * 0.04, L * 0.03]);
  let d: Pt = [0, 0];
  let follow = 0;
  let kind: MoveId | null = null;
  const md = s.move ? FIGHTERS[s.fighter].moves[s.move] : null;
  const throwing = !!(md && (md.kind === 'throw' || s.move === 'special'));
  if (throwing && md && s.move) {
    kind = s.move;
    const S = s.move === 'special' ? 16 : md.startup;
    const fr = Math.min(f, S + 1);
    d = carry(s.move === 'special' ? { ...md, startup: 16 } : md, s.move, fr, b).d;
    follow = s.move === 'special' ? 0 : c01((f - S) / Math.max(1, md.recovery));
    const u = c01(f / S);
    if (kind === 'throwf') { r.lean += -0.12 * u + 0.45 * c01((f - S) / 3); if (f > S) { r.hip = add(r.hip, [L * 0.12, 0]); r.fF = [r.fF[0] + L * 0.2, 0]; } }
    if (kind === 'throwb') { r.lean -= 0.5 * inOutSine(u); r.bend = -0.2 * u; r.hip = add(r.hip, [-L * 0.08 * u, -L * 0.02 * u]); r.head = -0.4 * u; }
    if (kind === 'throwu') { r.lean -= 0.18 * u; r.stretch = 1 + 0.05 * u; r.head = -0.45 * u; }
    if (kind === 'special') { const k = Math.sin(PI * u); r.lean -= 0.3 * k - 0.4 * c01((f - 11) / 5); r.hip = add(r.hip, [0, L * 0.12 * c01((f - 11) / 5)]); r.head = -0.3 * k; }
  }
  const grip = add(G, d);
  r.hF = grip;
  r.hB = add(grip, [-A * 0.08, A * 0.1]);
  if (follow > 0 && kind) {
    // released: the arms follow through along the throw, then settle
    const sp = spineOf(b, r);
    const dirA = kind === 'throwu' ? -1.45 : kind === 'throwb' ? -2.3 : -0.1;
    const fo = add(sp.sF, polar(dirA, A * 0.95));
    const e = inOutSine(Math.min(1, follow * 3.5)) * (1 - inOutSine((follow - 0.45) / 0.55));
    r.hF = mixP(grip, fo, e);
    r.hB = add(r.hF, [-A * 0.1, A * 0.12]);
    if (follow > 0.45) {
      const base = ready(b, t);
      return mixRig(r, base, inOutSine((follow - 0.45) / 0.55));
    }
  }
  r.prop = -2.2;
  r.eF = 1; r.eB = 1;
  // a pummel-ready tremor while just holding
  if (!throwing) r.hB = add(r.hB, [Math.sin(f * 0.4) * 2, 0]);
  return r;
}

/** the held fighter: limp, hanging from the holder's hand, carried by the throw */
function heldRig(b: Build, s: FighterState, other: FighterState, t: number, f: number): Rig {
  const L = legLen(b), A = armLen(b);
  const hb = buildOf(other.fighter) ?? b;
  const gap = holdGap(other.fighter, s.fighter);
  const { lift, bow } = gripPoint(hb, b, gap);
  let d: Pt = [0, 0], spin = 0;
  const md = other.move ? FIGHTERS[other.fighter].moves[other.move] : null;
  if (md && other.move && (other.action === 'attack' || other.action === 'holding') && (md.kind === 'throw' || other.move === 'special')) {
    const S = other.move === 'special' ? 16 : md.startup;
    const c = carry(other.move === 'special' ? { ...md, startup: 16 } : md, other.move, Math.min(other.actionFrame, S + 1), hb);
    d = [-c.d[0], c.d[1]]; // the held one faces the holder: x flips
    spin = -c.spin;
  }
  const k = (f / 60 + t) * 7;
  const hip: Pt = [-6 - bow * 10, -b.hipY - lift + L * 0.02];
  const r: Rig = {
    hip, lean: -0.22 + bow * 1.1, bend: -0.1, head: 0.5 + Math.sin(k * 0.5) * 0.1,
    hF: [0, 0], hB: [0, 0], fF: [0, 0], fB: [0, 0], prop: PI / 2 + 0.3, spin: 0, stretch: 1, eF: 1, eB: 1, plant: 0,
  };
  const sp = spineOf(b, r);
  r.hF = add(sp.sF, [A * 0.25 + Math.sin(k) * 3, A * 0.9]);
  r.hB = add(sp.sB, [A * 0.05 - Math.sin(k) * 3, A * 0.92]);
  r.fF = add(hip, [L * 0.12 + Math.sin(k) * L * 0.08, L * 0.97]);
  r.fB = add(hip, [-L * 0.08 - Math.sin(k) * L * 0.08, L * 0.96]);
  if (lift <= 0) { r.fF = [r.fF[0], Math.min(0, r.fF[1])]; r.fB = [r.fB[0], Math.min(0, r.fB[1])]; }
  // the carry moves the whole body; turning is a spin about the hip
  for (const key of ['hip', 'hF', 'hB', 'fF', 'fB'] as const) r[key] = add(r[key], d);
  r.spin = spin;
  return r;
}

// ------------------------------------------------------------------------------------------------
// actions
// ------------------------------------------------------------------------------------------------

/** walk and run: the cycle phase comes from the world x, so planted feet stay put on the deck */
function gait(b: Build, s: FighterState, wx: number, run: boolean, t: number, f: number): Rig {
  const L = legLen(b), A = armLen(b);
  const D = run ? L * 2.5 : L * 1.25; // one full cycle (two steps) in units
  const sf = run ? 0.38 : 0.6; // stance fraction
  const ph = (wx * 100 * s.facing) / D;
  const p = ph - Math.floor(ph);
  const foot = (q0: number): Pt => {
    const q = q0 - Math.floor(q0);
    const half = (sf * D) / 2;
    if (q < sf) return [half - (q / sf) * 2 * half, 0];
    const w = (q - sf) / (1 - sf);
    const x = -half + inOutSine(w) * 2 * half;
    const lift = run ? L * 0.42 * Math.sin(PI * w) ** 0.8 * (1 - 0.35 * w) : L * 0.12 * Math.sin(PI * w);
    return [x - (run ? Math.sin(PI * w) * L * 0.18 * (1 - w) : 0), -lift];
  };
  const fF = foot(p), fB = foot(p + 0.5);
  const c2 = Math.cos(TAU * p * 2);
  const speed = Math.min(1, Math.abs(s.vx) / 0.2);
  const dash = run ? 1 - inOutSine(c01((f - 1) / 7)) : 0;
  const hipY = run ? -b.hipY + L * (0.1 + 0.035 * c2) : -b.hipY + L * (0.06 - 0.025 * c2);
  const lean = b.hunch + (run ? 0.26 + 0.1 * speed + 0.15 * dash : 0.07);
  const hip: Pt = [run ? L * 0.06 : 0, hipY];
  const sp = spine(b, hip, lean, 0, 1);
  // arms swing against the legs; a run pumps them bent
  const swing = Math.sin(TAU * p);
  const r: Rig = {
    hip, lean, bend: run ? -0.05 : 0, head: run ? -0.2 : -0.04,
    hF: run ? add(sp.sF, polar(1.2 + swing * 0.9, A * 0.62)) : add(sp.sF, polar(1.25 + swing * 0.38, A * 0.88)),
    hB: run ? add(sp.sB, polar(1.2 - swing * 0.9, A * 0.62)) : add(sp.sB, polar(1.55 - swing * 0.38, A * 0.9)),
    fF, fB,
    prop: run ? -2.65 + swing * 0.15 : -PI / 2 + 0.35 + swing * 0.08,
    spin: 0, stretch: 1, eF: 1, eB: 1, plant: 0,
  };
  if (dash > 0) { r.hip = add(r.hip, [L * 0.12 * dash, L * 0.05 * dash]); r.hB = add(r.hB, [-A * 0.3 * dash, -A * 0.1 * dash]); }
  return r;
}

function hitstunRig(b: Build, s: FighterState, f: number, t: number): Rig {
  const L = legLen(b), A = armLen(b);
  const fx = s.kbx * s.facing; // + = pushed the way it faces (hit from behind)
  const back = fx > 0 ? -1 : 1; // which way to arch: away from the hit
  if (s.tumble && s.hitlag <= 0) {
    // launched: a continuous spin, the limbs trailing behind the flight
    const kb = Math.hypot(s.kbx, s.kby);
    const sgn = fx > 0 ? 1 : -1;
    const rate = 0.18 + Math.min(0.22, kb * 0.6);
    const spin = sgn * -1 * (f * rate);
    const vx = s.vx * s.facing, vy = -s.vy;
    const vl = Math.hypot(vx, vy) || 1;
    // the flight direction in the body's own (spun) frame
    const c = Math.cos(-spin), sn = Math.sin(-spin);
    const dl: Pt = [(vx / vl) * c - (vy / vl) * sn, (vx / vl) * sn + (vy / vl) * c];
    const trail: Pt = [-dl[0], -dl[1]];
    const hip: Pt = [0, -b.hipY];
    const r: Rig = { hip, lean: -0.25 * back, bend: -0.25 * back, head: -0.4 * back, hF: hip, hB: hip, fF: hip, fB: hip, prop: angOf(trail) + 0.4, spin, stretch: 1, eF: 1, eB: 1, plant: 0 };
    const sp = spineOf(b, r);
    const ta = angOf(trail);
    r.hF = add(sp.sF, polar(ta + 0.5 + wob(f * 0.2, 1) * 0.25, A * 0.92));
    r.hB = add(sp.sB, polar(ta - 0.4 + wob(f * 0.2, 2) * 0.25, A * 0.9));
    r.fF = add(hip, polar(ta + 0.35 + wob(f * 0.2, 3) * 0.2, L * 0.88));
    r.fB = add(hip, polar(ta - 0.25 + wob(f * 0.2, 4) * 0.2, L * 0.94));
    return r;
  }
  const base = s.grounded ? ready(b, t, 0.3) : airPose(b, t, 0.5);
  const hurt = cloneRig(base);
  hurt.lean = b.hunch - 0.34 * back; hurt.bend = -0.2 * back; hurt.head = -0.55 * back;
  hurt.hip = add(hurt.hip, [-back * L * 0.06, L * 0.05]);
  {
    const sp = spineOf(b, hurt);
    hurt.hF = add(sp.sF, polar(back > 0 ? -0.35 : 2.6, A * 0.9));
    hurt.hB = add(sp.sB, polar(back > 0 ? 0.25 : -2.9, A * 0.85));
    hurt.prop = back > 0 ? -0.9 : -2.4;
    if (!s.grounded) { hurt.fF = add(hurt.hip, [L * 0.35 * back, L * 0.6]); hurt.fB = add(hurt.hip, [-L * 0.1, L * 0.95]); }
  }
  if (s.hitlag > 0) {
    // the hit pause: the blow's pose, rattling along the launch line every frame
    const j = s.hitlag % 2 === 0 ? 1 : -1;
    const kl = Math.hypot(s.kbx, s.kby) || 1;
    const sh: Pt = [(fx / kl) * 3 * j, (-s.kby / kl) * 3 * j];
    for (const k of ['hip', 'hF', 'hB'] as const) hurt[k] = add(hurt[k], sh);
    hurt.head += j * 0.12;
    return hurt;
  }
  if (s.tumble) return hurt;
  // a flinch: snapped away from the hit, easing back over the stun
  const total = Math.max(6, s.hitstun + f);
  const k = 1 - inOutSine((f - 1) / total);
  return mixRig(base, hurt, k);
}

/** the ledge point in local units while hanging or climbing */
function ledgeLocal(s: FighterState, def: FighterDef, wx: number, wy: number): Pt {
  if (s.ledge >= 0) return [(LEDGE_X[s.ledge] - wx) * s.facing * 100, wy * 100];
  return [(def.width * 0.5 + 0.1) * 100, -def.height * 85];
}

function hangRig(b: Build, Lp: Pt, f: number, t: number): Rig {
  const L = legLen(b), A = armLen(b);
  const k = (f / 60 + t) * 2.2;
  const drop = Math.sin(PI * c01(f / 8)) * (1 - c01(f / 8)) * 10;
  const lean = 0.12 + Math.sin(k) * 0.03;
  // straight arms up to the lip, the body hanging against the wall below it
  const sF: Pt = [Lp[0] - b.shoulderX * 0.6 - 10, Lp[1] + A * 0.88 + drop];
  const a2 = lean;
  const neck = add(add(sF, fwdV(a2), -b.shoulderX * 0.55), upV(a2), b.torso * 0.08);
  const hip = add(neck, upV(lean), -b.torso);
  return {
    hip, lean, bend: 0, head: -0.35,
    hF: [Lp[0] + 2, Lp[1] - 3], hB: [Lp[0] + 12, Lp[1] - 4],
    fF: add(hip, [L * 0.1 + Math.sin(k) * L * 0.08, L * 0.95]), fB: add(hip, [-L * 0.06 - Math.sin(k + 1) * L * 0.07, L * 0.96]),
    prop: PI / 2 + 0.18, spin: 0, stretch: 1, eF: -1, eB: -1, plant: 0,
  };
}

function climbRig(b: Build, s: FighterState, def: FighterDef, Lp: Pt, f: number, t: number): Rig {
  const L = legLen(b), A = armLen(b);
  // the sim lifts the feet point from -0.85 height to the deck: that is the progress
  const u = c01(1 - (s.y / (-def.height * 0.85)));
  const k0 = hangRig(b, Lp, 30, t);
  // elbows on the lip, a knee coming up over it
  const k1: Rig = {
    hip: [Lp[0] - 20, Lp[1] + b.torso * 0.55], lean: 0.75, bend: 0.1, head: -0.25,
    hF: [Lp[0] + A * 0.35, Lp[1] - 2], hB: [Lp[0] + A * 0.55, Lp[1] - 2],
    fF: [Lp[0] + 2, Lp[1] - 4], fB: [Lp[0] - 30, Lp[1] + L * 0.85],
    prop: 0.25, spin: 0, stretch: 1, eF: 1, eB: 1, plant: 0,
  };
  // crouched on the deck
  const k2: Rig = {
    hip: [Lp[0] + L * 0.45, Lp[1] - b.hipY * 0.55], lean: 0.5, bend: 0.05, head: -0.1,
    hF: [Lp[0] + L * 0.85, Lp[1] - b.hipY * 0.3], hB: [Lp[0] + L * 0.6, Lp[1] - b.hipY * 0.25],
    fF: [Lp[0] + L * 0.7, Lp[1]], fB: [Lp[0] + L * 0.2, Lp[1]],
    prop: -0.6, spin: 0, stretch: 1, eF: 1, eB: 1, plant: 0,
  };
  const k3 = ready(b, t, 0.4);
  if (u < 0.4) return mixRig(k0, k1, inOutSine(u / 0.4));
  if (u < 0.75) return mixRig(k1, k2, inOutSine((u - 0.4) / 0.35));
  return mixRig(k2, k3, inOutSine((u - 0.75) / 0.25));
}

function lyingRig(b: Build, f: number): Rig {
  const L = legLen(b), A = armLen(b);
  const bounce = f < 10 ? Math.sin(PI * c01((f - 1) / 9)) * (1 - c01((f - 1) / 9)) * 22 : 0;
  const hip: Pt = [0, -b.hipY * 0.16 - bounce];
  const lean = -PI / 2 + 0.1;
  const sp = spine(b, hip, lean, 0.05, 1);
  return {
    hip, lean, bend: 0.05, head: 0.3,
    hF: add(sp.sF, [A * 0.25, -hip[1] * 0.6 + A * 0.1]), hB: add(sp.sB, [-A * 0.55, A * 0.2]),
    fF: [hip[0] + L * 0.8, -6], fB: [hip[0] + L * 0.95, -3],
    prop: -0.08, spin: 0, stretch: 1, eF: 1, eB: -1, plant: 0,
  };
}

function getupRig(b: Build, f: number, t: number): Rig {
  const L = legLen(b);
  const u = c01(f / 26);
  const k0 = lyingRig(b, 30);
  const sit: Rig = {
    hip: [-L * 0.1, -b.hipY * 0.28], lean: 0.35, bend: 0.1, head: 0,
    hF: [L * 0.35, -6], hB: [-L * 0.45, -4], fF: [L * 0.5, 0], fB: [-L * 0.05, -2],
    prop: -0.4, spin: 0, stretch: 1, eF: 1, eB: 1, plant: 0,
  };
  const crouchR = ready(b, t, 0, 0.18);
  crouchR.lean += 0.35;
  const stand = ready(b, t);
  if (u < 0.4) return mixRig(k0, sit, inOutCubic(u / 0.4));
  if (u < 0.7) return mixRig(sit, crouchR, inOutSine((u - 0.4) / 0.3));
  return mixRig(crouchR, stand, outBack((u - 0.7) / 0.3, 0.8));
}

function shieldRig(b: Build, t: number): Rig {
  const A = armLen(b);
  const r = ready(b, t, 0.35, 0.07);
  r.lean = b.hunch - 0.02; r.head = 0.1;
  const sp = spineOf(b, r);
  if (b.propLen > 0) {
    // the staff upright in front as a bar, the back forearm raised behind it
    r.hF = add(sp.sF, [A * 0.55, A * 0.42]);
    r.prop = -PI / 2 + 0.06;
    r.hB = add(sp.sB, [A * 0.62, -A * 0.08]);
  } else {
    r.hF = add(sp.sF, [A * 0.45, -A * 0.12]);
    r.hB = add(sp.sB, [A * 0.55, A * 0.02]);
  }
  return r;
}

function entranceRig(b: Build, f: number, t: number): Rig {
  const k = c01((f - 4) / 18);
  const low = ready(b, t, 0, 0.22);
  low.lean += 0.45; low.head = 0.3;
  const sp = spineOf(b, low);
  low.hF = add(sp.sF, [armLen(b) * 0.5, armLen(b) * 0.75]); low.prop = -PI / 2 + 0.1;
  const r = mixRig(low, ready(b, t), outBack(k, 1.0));
  r.prop = r.prop - TAU * inOutCubic(c01((f - 2) / 18));
  return r;
}

function winRig(b: Build, f: number, t: number): Rig {
  const A = armLen(b);
  const k = outBack(c01(f / 16), 1.2);
  const flourish = ready(b, t, 0.6);
  flourish.lean = b.hunch - 0.16; flourish.head = -0.3;
  flourish.hip = add(flourish.hip, [0, -Math.abs(Math.sin((f / 60 + t) * 4)) * 3]);
  const sp = spineOf(b, flourish);
  flourish.hF = add(sp.sF, polar(-1.35, A * 0.97));
  flourish.prop = -PI / 2 - 0.12 - Math.sin((f / 60 + t) * 2.2) * 0.08;
  flourish.hB = add(sp.sB, polar(1.3, A * 0.55));
  const r = mixRig(ready(b, t), flourish, k);
  r.prop -= TAU * inOutCubic(c01(f / 22));
  return r;
}

function loseRig(b: Build, f: number, t: number): Rig {
  const L = legLen(b), A = armLen(b);
  const slump = ready(b, t, 0.25, 0.1);
  slump.lean = b.hunch + 0.48; slump.bend = 0.15; slump.head = 0.55;
  slump.hip = add(slump.hip, [-L * 0.04, 0]);
  const sp = spineOf(b, slump);
  slump.hF = add(sp.sF, [A * 0.15, A * 0.95]); slump.hB = add(sp.sB, [A * 0.05, A * 0.96]);
  slump.prop = PI / 2 - 0.55;
  return mixRig(ready(b, t), slump, inOutSine(c01(f / 24)));
}

function helplessRig(b: Build, f: number, t: number): Rig {
  const A = armLen(b), L = legLen(b);
  const tt = f / 60 + t;
  const r = airPose(b, t, 0.85);
  r.lean = b.hunch + 0.12 + Math.sin(tt * 2.3) * 0.08; r.head = 0.35;
  const sp = spineOf(b, r);
  r.hF = add(sp.sF, polar(-1.2 + Math.sin(tt * 3.1) * 0.3, A * 0.85));
  r.hB = add(sp.sB, polar(-2.0 + Math.sin(tt * 3.1 + 1.9) * 0.3, A * 0.85));
  r.fF = add(r.hip, [L * 0.12 + Math.sin(tt * 4.2) * L * 0.08, L * 0.92]);
  r.fB = add(r.hip, [-L * 0.1 - Math.sin(tt * 4.2 + 0.7) * L * 0.08, L * 0.95]);
  r.prop = -1.9 + Math.sin(tt * 2) * 0.2;
  return r;
}

function dizzyRig(b: Build, f: number, t: number): Rig {
  const A = armLen(b), L = legLen(b);
  const w = (f / 60 + t) * 3.2;
  const r = ready(b, t, 0.2, 0.1);
  const jolt = f < 12 ? Math.sin(PI * f / 12) * 18 : 0;
  r.hip = add(r.hip, [Math.sin(w) * 5, -jolt]);
  r.lean = b.hunch + 0.18 + Math.sin(w) * 0.14;
  r.head = 0.35 + Math.sin(w * 1.3) * 0.4;
  const sp = spineOf(b, r);
  r.hF = add(sp.sF, [A * 0.25 + Math.sin(w * 0.9) * 6, A * 0.92]);
  r.hB = add(sp.sB, [A * 0.05 - Math.sin(w * 0.9) * 6, A * 0.94]);
  r.prop = PI / 2 - 0.4 + Math.sin(w) * 0.1;
  r.fF = [b.stanceX * 0.4 + Math.sin(w) * 3, 0]; r.fB = [-b.stanceX * 0.35, 0];
  if (f < 12) { r.fF = [r.fF[0], -jolt * 0.9]; r.fB = [r.fB[0], -jolt * 0.9]; r.plant = 0; void L; }
  return r;
}

function rollRig(b: Build, s: FighterState, f: number, t: number, spot: boolean, air: boolean): Rig {
  const L = legLen(b), A = armLen(b);
  if (spot) {
    // spot dodge: drop and fold in place
    const k = bump(f, 0, 4, 21);
    const low = ready(b, t, 0, 0.22);
    low.lean = b.hunch - 0.25; low.head = 0.3; low.stretch = 0.94;
    const sp = spineOf(b, low);
    low.hF = add(sp.sF, [A * 0.2, A * 0.25]); low.hB = add(sp.sB, [A * 0.35, A * 0.15]); low.prop = -PI / 2 - 0.15;
    return mixRig(ready(b, t), low, k);
  }
  if (air) {
    const k = bump(f, 0, 4, 32);
    const ball = airPose(b, t, 0);
    ball.lean = b.hunch - 0.35; ball.head = 0.3;
    const sp = spineOf(b, ball);
    ball.hF = add(sp.sF, [A * 0.3, A * 0.3]); ball.hB = add(sp.sB, [A * 0.4, A * 0.2]);
    ball.fF = add(ball.hip, [L * 0.4, L * 0.35]); ball.fB = add(ball.hip, [L * 0.15, L * 0.5]);
    ball.prop = -PI / 2 - 0.3;
    const r = mixRig(airPose(b, t, 0.5), ball, k);
    r.spin = -0.5 * k;
    return r;
  }
  // a roll: tuck into a ball and go right over, the way the sim moves
  const dir = s.vx * s.facing < -0.001 ? -1 : 1;
  const tuck = bump(f, 0, 5, 24);
  const ball = ready(b, t, 0, 0.32);
  ball.lean = b.hunch + 0.7; ball.head = 0.5;
  const sp = spineOf(b, ball);
  ball.hF = add(sp.sF, [A * 0.2, A * 0.55]); ball.hB = add(sp.sB, [A * 0.35, A * 0.5]);
  ball.fF = [ball.hip[0] + L * 0.25, ball.hip[1] + L * 0.5]; ball.fB = [ball.hip[0] - L * 0.05, ball.hip[1] + L * 0.55]; ball.plant = 0;
  ball.prop = dir > 0 ? 0.2 : PI - 0.2;
  const r = mixRig(ready(b, t), ball, tuck);
  r.spin = dir * TAU * inOutCubic(c01((f - 3) / 18));
  return r;
}

// ------------------------------------------------------------------------------------------------
// the PoseFn
// ------------------------------------------------------------------------------------------------

/** actions that start from a snap, not a blend from the neutral pose */
const NO_BLEND: Partial<Record<FighterState['action'], true>> = {
  hitstun: true, knockdown: true, ledgehang: true, ledgeclimb: true, held: true, respawn: true, dead: true, entrance: true, holding: true, roll: true,
};

function rigFor(s: FighterState, f: number, wx: number, wy: number, other: FighterState, def: FighterDef, ch: CharacterDef, t: number): Rig {
  const b = ch.build;
  const L = legLen(b);
  switch (s.action) {
    case 'entrance': return entranceRig(b, f, t);
    case 'idle': return ready(b, t);
    case 'respawn': {
      const r = ready(b, t, 0.7);
      r.lean = b.hunch - 0.06; r.head = -0.1;
      return r;
    }
    case 'walk': return gait(b, s, wx, false, t, f);
    case 'run': return gait(b, s, wx, true, t, f);
    case 'skid': {
      const k = outCubic(f / 3);
      const r = ready(b, t, 0);
      const A = armLen(b);
      r.lean = b.hunch - 0.22 * k; r.hip = add(r.hip, [-L * 0.08 * k, L * 0.08 * k]);
      r.fF = [L * 0.5 * k + b.stanceX * 0.3, 0]; r.fB = [-L * 0.12, 0];
      const sp = spineOf(b, r);
      r.hF = add(sp.sF, polar(-0.4, A * 0.85)); r.hB = add(sp.sB, polar(-0.9, A * 0.8)); r.prop = PI + 0.3;
      return mixRig(ready(b, t), r, k);
    }
    case 'turn': {
      const k = bump(f, 0, 3, 8);
      const r = ready(b, t, 0, 0.06);
      const A = armLen(b);
      r.lean = b.hunch - 0.05; r.fF = [b.stanceX * 0.2, 0]; r.fB = [-b.stanceX * 0.15, 0];
      const sp = spineOf(b, r);
      r.hF = add(sp.sF, [A * 0.1, A * 0.6]); r.hB = add(sp.sB, [A * 0.3, A * 0.55]); r.prop = -PI / 2;
      return mixRig(ready(b, t), r, k);
    }
    case 'jumpsquat': {
      const k = outCubic(f / Math.max(1, def.jumpsquat));
      const r = ready(b, t, 0, 0.16 * (0.75 + 0.25 * b.heft));
      const A = armLen(b);
      r.lean += 0.25; r.stretch = 0.95; r.head = 0.1;
      const sp = spineOf(b, r);
      r.hF = add(sp.sF, polar(2.0, A * 0.85)); r.hB = add(sp.sB, polar(2.3, A * 0.85)); r.prop = PI - 0.3;
      return mixRig(ready(b, t), r, k);
    }
    case 'rise': {
      const up = c01(s.vy / def.jumpSpeed);
      const r = airPose(b, t, 0.2 + up * 0.5);
      const A = armLen(b);
      const k0 = 1 - c01((f - 1) / 6);
      r.stretch = 1 + 0.07 * k0;
      const sp = spineOf(b, r);
      r.hF = mixP(r.hF, add(sp.sF, polar(-1.2, A * 0.9)), up * 0.6);
      r.hB = mixP(r.hB, add(sp.sB, polar(-2.0, A * 0.85)), up * 0.6);
      r.fF = mixP(r.fF, add(r.hip, [L * 0.05, L * 0.95]), up * 0.6 * k0);
      // an air jump: a forward flip, tucked tight
      if (s.airJumpsLeft < def.airJumps) {
        const u = c01((f - 1) / 18);
        const tuck = bump(f, 0, 6, 18);
        const ball = airPose(b, t, 0);
        ball.fF = add(ball.hip, [L * 0.42, L * 0.32]); ball.fB = add(ball.hip, [L * 0.2, L * 0.45]);
        const sp2 = spineOf(b, ball);
        ball.hF = add(sp2.sF, [A * 0.45, A * 0.45]); ball.hB = add(sp2.sB, [A * 0.55, A * 0.35]);
        const m = mixRig(r, ball, tuck);
        m.spin = TAU * inOutSine(u);
        m.stretch = 1;
        return m;
      }
      return r;
    }
    case 'fall': {
      const down = Math.max(c01(-s.vy / def.fallSpeed), outQuad((f - 1) / 12) * 0.7);
      const r = airPose(b, t, down);
      if (s.fastFall) {
        const k = outCubic(-s.vy / def.fastFallSpeed);
        const A = armLen(b);
        const tuck = airPose(b, t, 0);
        tuck.fF = add(tuck.hip, [L * 0.3, L * 0.55]); tuck.fB = add(tuck.hip, [-L * 0.05, L * 0.7]);
        tuck.lean = b.hunch + 0.18; tuck.head = 0.25;
        const sp = spineOf(b, tuck);
        tuck.hF = add(sp.sF, polar(-1.5, A * 0.9)); tuck.hB = add(sp.sB, polar(-1.8, A * 0.88)); tuck.prop = -1.6;
        return mixRig(r, tuck, k);
      }
      return r;
    }
    case 'land': {
      const n = 4 + 5 * b.heft;
      const k = 1 - inOutSine((f - 1.5) / n);
      const depth = 0.16 * (0.55 + 0.45 * b.heft);
      const r = ready(b, t, 0, depth);
      const A = armLen(b);
      r.lean += 0.2; r.stretch = 1 - 0.07 * b.heft * c01(1 - (f - 1) / 4); r.head = 0.15;
      const sp = spineOf(b, r);
      r.hF = add(sp.sF, polar(0.6, A * 0.85)); r.hB = add(sp.sB, polar(1.0, A * 0.85));
      return mixRig(ready(b, t), r, Math.max(k, 0));
    }
    case 'attack':
    case 'charge': {
      if (!s.move) return ready(b, t);
      const md = def.moves[s.move];
      if (md.kind === 'throw') {
        if (s.action === 'attack') return holdRig(b, s, other, t, f);
      }
      const { anim, hand } = animOf(ch, s.move);
      if (anim === 'throwObj' && md.kind === 'throw') return holdRig(b, s, other, t, f);
      const air = !s.grounded;
      const base = air ? airPose(b, t, 0.45) : ready(b, t, 0.3);
      const ctx: MoveCtx = { b, ch, def, s, md, anim, hand, t, air, base };
      if (s.action === 'charge') {
        // held at the end of the wind-up, trembling harder as the charge builds
        const S = strikeFrame(md) - 1;
        const r = attackRig(ctx, Math.max(1, S) * outCubic(f / 5), false);
        const k = 0.6 + Math.min(1, s.charge / 40) * 2.4;
        const j: Pt = [Math.sin(f * 2.7) * k, Math.cos(f * 3.3) * k * 0.6];
        r.hip = add(r.hip, j, 0.5); r.hF = add(r.hF, j); r.hB = add(r.hB, j, 0.8);
        r.lean += Math.sin(f * 1.9) * 0.01 * k;
        return r;
      }
      const r = attackRig(ctx, f, s.charge > 0);
      if (s.hitlag > 0) {
        // the attacker trembles in the hit pause
        const j = s.hitlag % 2 === 0 ? 1.5 : -1.5;
        r.hip = add(r.hip, [j, 0]);
      }
      return r;
    }
    case 'shield': return shieldRig(b, t);
    case 'shieldstun': {
      const k = 1 - c01(f / 8);
      const r = shieldRig(b, t);
      r.lean -= 0.14 * k; r.hip = add(r.hip, [-L * 0.06 * k, 0]);
      r.hF = add(r.hF, [-6 * k, 0]); r.hB = add(r.hB, [-6 * k, 0]);
      return r;
    }
    case 'shieldbreak': return dizzyRig(b, f, t);
    case 'roll': return rollRig(b, s, f, t, false, false);
    case 'spotdodge': return rollRig(b, s, f, t, true, false);
    case 'airdodge': return rollRig(b, s, f, t, false, true);
    case 'holding': {
      if (s.move && s.move !== 'special' && def.moves[s.move].kind !== 'throw') return ready(b, t);
      return holdRig(b, s, other, t, f);
    }
    case 'held': return heldRig(b, s, other, t, f);
    case 'hitstun': return hitstunRig(b, s, f, t);
    case 'knockdown': return lyingRig(b, f);
    case 'getup': return getupRig(b, f, t);
    case 'ledgehang': return hangRig(b, ledgeLocal(s, def, wx, wy), f, t);
    case 'ledgeclimb': return climbRig(b, s, def, ledgeLocal(s, def, wx, wy), f, t);
    case 'helpless': return helplessRig(b, f, t);
    case 'win': return winRig(b, f, t);
    case 'lose': return loseRig(b, f, t);
    case 'dead':
    default: return ready(b, t, 0);
  }
}

export const pose: PoseFn = (s, prev, alpha, other, def, ch, t) => {
  const b = ch.build;
  // a fractional action frame between ticks, and the drawn world position
  let f = s.actionFrame;
  const same = prev && prev.action === s.action && prev.move === s.move;
  if (same && s.actionFrame > prev.actionFrame && s.actionFrame - prev.actionFrame < 3) f = prev.actionFrame + (s.actionFrame - prev.actionFrame) * alpha;
  f = Math.max(1, f);
  const far = !prev || Math.abs(s.x - prev.x) > 3 || Math.abs(s.y - prev.y) > 3;
  const a = far ? 1 : alpha;
  const wx = prev ? prev.x + (s.x - prev.x) * a : s.x;
  const wy = prev ? prev.y + (s.y - prev.y) * a : s.y;
  let r = rigFor(s, f, wx, wy, other, def, ch, t);
  // the first three frames of a new action blend in from the neutral pose
  const charged = s.action === 'attack' && s.charge > 0;
  if (f < 4 && !NO_BLEND[s.action] && !charged && !(s.action === 'attack' && s.hitlag > 0)) {
    const from = s.grounded ? ready(b, t) : airPose(b, t, 0.6);
    r = mixRig(from, r, inOutSine(f / 4) * 0.75 + 0.25 * (f / 4));
  }
  return solve(b, r);
};

/** for inspection pages: the anim a move plays for this character and its hitbox on a frame */
export function moveAnimOf(ch: CharacterDef, m: MoveId): MoveAnim { return animOf(ch, m).anim; }
export { hitboxAt };
