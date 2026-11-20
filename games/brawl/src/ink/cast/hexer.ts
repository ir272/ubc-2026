// THE HEXER: a tall witch in a tattered robe and a long cone hood bent back at the tip, a hooked
// nose poking out of the dark hood opening, a shawl, a green sash with long tails, and a tall
// crooked staff with a charm hanging from its crook. The look is the approved sheet,
// lab/cast/hexer.js (the sheet's staff hand was a mitten: here both hands have long bony fingers).
//
// She glides: small quick steps under the robe (the hem ripples, little leg shows), stooped, the
// hood tip, the shawl's back flap, the hem and the sash tails trailing against the motion
// (FigureExtra.drag), the charm swinging on its cord under the crook. She fights with the staff;
// the pose engine aims its tip (build.propLen) at the hitbox. Standing, winning and losing she
// plants the staff on the floor.
//
// Abilities (keyed on MoveId and projectile kind, so they work on the borrowed move set and on
// her own): special Hex Bolt (a thrust of the staff, green fire at the crook, the bolt drawn by
// drawProjectile for every kind but `ward`), special2 Ward (a scoop of the staff; the lobbed
// charm spins in the air and lies as a scratched mark on the floor), recover Crow Flight (she
// bursts into crows that rise in a loose spiral, one carrying the staff, and re-forms).
//
// The side shows on the shawl and the staff's binding band (FigureExtra.sideTint); the sash, the
// charm and the magic stay green. Every pen call has a fixed seed so nothing boils.
import type { Build, CharacterDef, FigureExtra, Joints } from '../api.ts';
import type { FighterState, MoveDef, Projectile } from '../../sim/types.ts';
import { FIGHTERS } from '../../sim/fighters.ts';
import type { Pen, Pt } from '../pen.ts';
import { ell, h01, mix, smooth } from '../pen.ts';

const BUILD: Build = { height: 222, hipY: 102, torso: 72, neckLen: 24, arm: [60, 58], leg: [55, 53], shoulderX: 15, stanceX: 30, hunch: 0.12, propLen: 140, heft: 0.9 };
const ARM = BUILD.arm[0] + BUILD.arm[1];
/** the staff below the hand that holds it (the engine's propLen is hand to tip) */
const BUTT = 85;
const STAFF = BUILD.propLen + BUTT;
const MAGIC = 'green';

// ------------------------------------------------------------------------------------------------
// small math
// ------------------------------------------------------------------------------------------------

const PI = Math.PI;
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (v: Pt): number => Math.hypot(v[0], v[1]);
const unit = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const dirA = (a: number): Pt => [Math.cos(a), Math.sin(a)];
const perp = (d: Pt): Pt => [-d[1], d[0]];
const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const c01 = (v: number): number => clamp(v, 0, 1);
const ease = (u: number): number => 0.5 - 0.5 * Math.cos(PI * c01(u));
const rot = (p: Pt, c: Pt, a: number): Pt => {
  const cs = Math.cos(a), sn = Math.sin(a), dx = p[0] - c[0], dy = p[1] - c[1];
  return [c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs];
};

/** a bent tube along a path as one closed outline (from the sheet) */
function tube(path: Pt[], w0: number, w1: number, per = 4): Pt[] {
  const p = path.length > 2 ? smooth(path, per) : path;
  const n = p.length, L: Pt[] = [], R: Pt[] = [];
  let a0 = 0, a1 = 0;
  for (let i = 0; i < n; i++) {
    const d = unit(sub(p[Math.min(n - 1, i + 1)], p[Math.max(0, i - 1)])), nn = perp(d), w = w0 + ((w1 - w0) * i) / Math.max(1, n - 1);
    L.push(add(p[i], nn, w)); R.push(add(p[i], nn, -w));
    if (i === 0) a0 = Math.atan2(nn[1], nn[0]);
    if (i === n - 1) a1 = Math.atan2(nn[1], nn[0]);
  }
  const capE: Pt[] = [], capS: Pt[] = [];
  for (let j = 1; j < 6; j++) capE.push(add(p[n - 1], dirA(a1 - (PI * j) / 6), w1));
  for (let j = 1; j < 6; j++) capS.push(add(p[0], dirA(a0 + PI - (PI * j) / 6), w0));
  return L.concat(capE, R.reverse(), capS);
}

/** a ragged edge from a to b: n uneven tatters hanging along `down`, rippling with `rip` (from the sheet) */
function rag(a: Pt, b: Pt, n: number, depth: number, seed: number, down: Pt, rip: (i: number) => number): Pt[] {
  const steps: number[] = [];
  for (let i = 0; i < n; i++) steps.push(0.55 + 0.9 * h01(seed + i * 1.37));
  const tot = steps.reduce((x, y) => x + y, 0);
  const out: Pt[] = [a];
  let c = 0;
  for (let i = 0; i < n; i++) {
    const t0 = c / tot, t1 = (c + steps[i]) / tot; c += steps[i];
    const r = h01(seed + i * 5.13), long = r > 0.82 ? 1.6 : 1;
    const k = depth * (0.35 + 0.9 * h01(seed + i * 2.71)) * long + rip(i);
    out.push(add(mix(a, b, t0 + (t1 - t0) * (0.4 + 0.3 * r)), down, k));
    const kn = i === n - 1 ? 0 : -depth * 0.18 * h01(seed + i * 7.7) + rip(i) * 0.5;
    out.push(add(mix(a, b, t1), down, kn));
  }
  return out;
}

/** two-bone IK from a toward t; the middle joint goes to the side of n */
function ik2(a: Pt, t: Pt, l1: number, l2: number, n: Pt): [Pt, Pt] {
  let d = sub(t, a), l = len(d);
  if (l < 1e-6) { d = [0, 1]; l = 1; }
  const u: Pt = [d[0] / l, d[1] / l];
  const dd = clamp(l, Math.abs(l1 - l2) + 1, (l1 + l2) * 0.999);
  const end = add(a, u, dd);
  const along = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  let nx = -u[1], ny = u[0];
  if (nx * n[0] + ny * n[1] < 0) { nx = -nx; ny = -ny; }
  return [[a[0] + u[0] * along + nx * h, a[1] + u[1] * along + ny * h], end];
}

function moveDef(s: FighterState): MoveDef | null {
  if (!s.move) return null;
  const d = FIGHTERS[s.fighter];
  return d ? d.moves[s.move] ?? null : null;
}

/** a tongue of fire: a wavering, tapering, curling leaf from c0 along ang (from the sheet) */
function tongue(c0: Pt, L: number, ang: number, wmax: number, curl: number, wav: number, ph: number): { shape: Pt[]; spine: Pt[] } {
  const C: Pt[] = [c0];
  for (let k = 1; k <= 12; k++) { const t = k / 12; C.push(add(C[k - 1], dirA(ang + curl * t * t + wav * Math.sin(t * 6.3 + ph)), L / 12)); }
  const Lp: Pt[] = [], R: Pt[] = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12, d = unit(sub(C[Math.min(12, k + 1)], C[Math.max(0, k - 1)])), n = perp(d);
    const w = wmax * (t < 0.15 ? 0.6 + t * 2.6 : Math.pow(1 - (t - 0.15) / 0.85, 1.3));
    Lp.push(add(C[k], n, w)); R.push(add(C[k], n, -w));
  }
  return { shape: Lp.concat(R.reverse()), spine: C };
}

// ------------------------------------------------------------------------------------------------
// parts
// ------------------------------------------------------------------------------------------------

/** an open bony hand: long fingers from the wrist along `ang`; side = which way the thumb sits */
function openHand(ink: Pen, wrist: Pt, ang: number, seed: number, o: { k?: number; spread?: number; curl?: number; side?: number } = {}): void {
  const k = o.k ?? 1, spread = o.spread ?? 1, curl = o.curl ?? 0.35, side = o.side ?? 1;
  const d = dirA(ang), n = perp(d);
  const at = (a: number, b: number): Pt => [wrist[0] + (d[0] * a + n[0] * b) * k, wrist[1] + (d[1] * a + n[1] * b) * k];
  const lens = [18, 23, 22, 16];
  for (let i = 3; i >= 0; i--) {
    const base = at(8, (i - 1.5) * 2.5 * side), a = ang + (i - 1.5) * 0.2 * spread * side;
    const j1 = add(base, dirA(a), lens[i] * 0.48 * k), a2 = a + curl * side, j2 = add(j1, dirA(a2), lens[i] * 0.32 * k), tip = add(j2, dirA(a2 + curl * 0.8 * side), lens[i] * 0.24 * k);
    ink.form(tube([base, j1, j2, tip], 1.45 * k, 0.5 * k, 3), { w: 1.05, seed: seed + i });
  }
  const tb = at(2, -side * 4.5), ta = ang - side * 0.75;
  ink.form(tube([tb, add(tb, dirA(ta), 7 * k), add(tb, dirA(ta + side * 0.35), 14 * k)], 2 * k, 0.7 * k, 3), { w: 1.1, seed: seed + 5 });
  ink.form(smooth([at(-4, -4.5 * side), at(4, -6 * side), at(10, -4.5 * side), at(10.5, 5 * side), at(2, 5.5 * side), at(-4, 4 * side)], 4, true), { w: 1.4, seed: seed + 6 });
}

/** a bony hand closed round the staff at c: the back of the hand, then long fingers wrapped
 *  across the pole with their tips curling round it. `up` runs along the staff, `side` puts the
 *  knuckles toward +perp(up) or -perp(up). */
function grip(ink: Pen, c: Pt, up: Pt, side: number, seed: number, k = 1): void {
  const v: Pt = [-up[1] * side, up[0] * side];
  const at = (a: number, b: number): Pt => [c[0] + (up[0] * a + v[0] * b) * k, c[1] + (up[1] * a + v[1] * b) * k];
  // the back of the hand, behind the pole on the knuckle side
  ink.form(smooth([at(-7, -2), at(7, -3), at(8, 7), at(4, 12), at(-5, 11), at(-8, 6)], 4, true), { w: 1.4, seed });
  // four long fingers over the pole, each bending twice, the tips hooked back
  for (let i = 0; i < 4; i++) {
    const a = -5.4 + i * 3.6;
    const kn = at(a, 6), m1 = at(a + 0.8, -2.5), m2 = at(a + 1.6, -8.5), tip = at(a + 0.6, -12.5 - (i === 1 || i === 2 ? 1.5 : 0));
    ink.form(tube([kn, m1, m2, tip], 1.6 * k, 0.65 * k, 3), { w: 1, seed: seed + 1 + i });
  }
  // the thumb along the pole on top
  ink.form(tube([at(-3, 9), at(6, 7), at(10.5, 3)], 1.9 * k, 0.8 * k, 3), { w: 1, seed: seed + 6 });
}

/** the long cone hood, bent back at the tip (tipH), in head units through Hr */
function hoodForm(ink: Pen, Hr: (x: number, y: number) => Pt, tipH: Pt, tilt: number, seed: number): void {
  const bend = Hr(-34, -66), under = Hr(-37, -54);
  const hood = smooth([Hr(6, 24), Hr(-18, 22), Hr(-27, 4), Hr(-29, -18), Hr(-33, -40), under, mix(under, tipH, 0.55), tipH,
    mix(tipH, bend, 0.45), bend, Hr(-20, -52), Hr(-5, -32), Hr(12, -16), Hr(22, -4), Hr(18, 12), Hr(12, 22)], 5, true);
  ink.form(hood, { w: 2.7, seed });
  ink.hatch(smooth([Hr(-18, 22), Hr(-27, 4), Hr(-29, -18), Hr(-34, -44), Hr(-24, -42), Hr(-12, -8), Hr(-8, 18)], 4, true), { angle: 1.35 + tilt, gap: 3.6, w: 0.95, seed: seed + 1 });
  ink.cut(smooth([Hr(-10, 20), Hr(-16, -2), Hr(-24, -30), Hr(-31, -55)], 5), { w: 1.3, seed: seed + 2 });
  ink.cut(smooth([Hr(-30, -60), mix(Hr(-38, -58), tipH, 0.3), mix(Hr(-38, -58), tipH, 0.6)], 4), { w: 1.1, seed: seed + 3 });
}

/** a pointed shoe at the foot; the toe goes forward and curls up a little */
function shoe(ink: Pen, knee: Pt, f: Pt, fx: number, seed: number): void {
  const d = unit(sub(f, knee));
  let toe: Pt = [d[1], -d[0]];
  if (toe[0] * fx < 0 && Math.abs(d[0]) < 0.6) toe = [-toe[0], -toe[1]];
  const B = (x: number, y: number): Pt => [f[0] + toe[0] * x + d[0] * y, f[1] + toe[1] * x + d[1] * y];
  ink.form(smooth([B(-7, -9), B(4, -10), B(12, -5), B(22, -6), B(25, -10), B(24, -3), B(12, 0.5), B(-8, 0.5), B(-9, -5)], 4, true), { w: 1.7, seed });
}

/** a crow in flight, side on, looking along +x (fx flips it), wings at phase ph (-1 down .. 1 up) */
function crowShapes(c: Pt, S: number, fx: number, ph: number, tilt: number): { far: Pt[]; body: Pt[]; near: Pt[]; beak: Pt[]; quill: Pt[]; eye: Pt } {
  const cs = Math.cos(tilt), sn = Math.sin(tilt);
  const P = (x: number, y: number): Pt => { const X = x * S * fx, Y = y * S; return [c[0] + X * cs - Y * sn * fx, c[1] + X * sn * fx + Y * cs]; };
  const body = smooth([P(0.5, 0.0), P(0.44, -0.1), P(0.3, -0.12), P(0.05, -0.1), P(-0.3, -0.05), P(-0.62, -0.13), P(-0.72, -0.02), P(-0.66, 0.1), P(-0.3, 0.07), P(0.05, 0.12), P(0.34, 0.08)], 3, true);
  const beak = [P(0.48, -0.05), P(0.72, 0.02), P(0.47, 0.05)];
  /** a long wing from the shoulder: the leading edge to the wrist, three fingered primaries, the trailing edge home */
  const wing = (up: number, back: number): Pt[] => {
    const sg = up >= 0 ? -1 : 1; // the tip points up (-y) or down
    const ext = sg < 0 ? 0.55 + 0.45 * Math.abs(up) : 0.45 + 0.3 * Math.abs(up);
    const wr: Pt = [0.0 - back, sg * 0.42 * ext];
    const tip: Pt = [-0.42 - back, sg * 0.92 * ext];
    const pts: Pt[] = [P(0.24, -0.06), P(wr[0] + 0.06, wr[1]), P(tip[0] + 0.05, tip[1])];
    for (let k = 0; k < 3; k++) {
      const fxk = tip[0] + 0.02 - 0.08 * (k + 1), fyk = tip[1] - sg * 0.07 * (k + 0.6);
      pts.push(P(fxk + 0.04, fyk - sg * 0.04), P(fxk, fyk));
    }
    pts.push(P(-0.28 - back * 0.5, sg * 0.32 * ext), P(-0.2, -0.02));
    return smooth(pts, 2, true);
  };
  const near = wing(ph, 0);
  const quill = [P(0.16, -0.05), P(-0.08 , (ph >= 0 ? -1 : 1) * 0.5 * (0.55 + 0.45 * Math.abs(ph)))];
  return { far: wing(ph * 0.8 + 0.2, 0.14), body, near, beak, quill, eye: P(0.36, -0.04) };
}

// ------------------------------------------------------------------------------------------------
// the figure
// ------------------------------------------------------------------------------------------------

interface Look {
  /** extra lean of the upper body about the hip (+ forward), head thrown back, jaw open */
  bendUp: number;
  headBack: number;
  jaw: number;
  /** the staff planted on the floor: its foot and direction; null = it rides in the hand */
  plant: { butt: Pt; d: Pt } | null;
  /** the back hand on the staff (two-handed) */
  twoHand: boolean;
  charmSpin: number;
}

/** turn the upper body about the hip */
function bendUpper(J: Joints, a: number): Joints {
  if (Math.abs(a) < 1e-4) return J;
  const c = J.hip, r = (p: Pt): Pt => rot(p, c, a);
  return {
    ...J, chest: r(J.chest), neck: r(J.neck), head: r(J.head), shoulderF: r(J.shoulderF), elbowF: r(J.elbowF), handF: r(J.handF),
    shoulderB: r(J.shoulderB), elbowB: r(J.elbowB), handB: r(J.handB), headTilt: J.headTilt + a, lean: J.lean + a, prop: J.prop + a,
  };
}

/** standing about, winning, losing, guarding: re-pose the arms and the staff over the engine's joints */
function restyle(J0: Joints, x: FigureExtra): { J: Joints; look: Look } {
  const s = x.state;
  const f = s.actionFrame;
  const t = x.t;
  let J = J0;
  const look: Look = { bendUp: 0, headBack: 0, jaw: 0, plant: null, twoHand: false, charmSpin: 0 };
  const [l1, l2] = BUILD.arm;
  const armTo = (which: 'F' | 'B', T: Pt, k: number, bendN: Pt): void => {
    const sh = which === 'F' ? J.shoulderF : J.shoulderB;
    const cur = which === 'F' ? J.handF : J.handB;
    const [e, h] = ik2(sh, mix(cur, T, k), l1, l2, bendN);
    if (which === 'F') J = { ...J, elbowF: e, handF: h }; else J = { ...J, elbowB: e, handB: h };
  };
  const md = moveDef(s);
  const inMove = !!md && (s.action === 'attack' || s.action === 'charge');

  // standing: the staff planted beside her, the hand low on it, swaying with the breath
  const rest = s.action === 'idle' || s.action === 'respawn' ? 1 : s.action === 'entrance' ? c01((f - 14) / 10) : 0;
  if (rest > 0.01) {
    const sway = Math.sin(t * 1.1) * 2;
    const bx = J.shoulderF[0] + 44 + sway;
    const d = unit([0.04 + Math.sin(t * 0.9) * 0.02, -1]);
    const hy = -92 + Math.sin(t * 2.1) * 1.2;
    const H: Pt = [bx + d[0] * (-hy), hy];
    armTo('F', H, rest, [-0.3, 1]);
    if (rest > 0.5) look.plant = { butt: [bx, 0], d };
    // the far hand hangs at her side, fingers loose
    armTo('B', add(J.shoulderB, [-ARM * 0.08 + Math.sin(t * 1.3 + 1) * 2, ARM * 0.86]), rest, [-1, 0]);
  }

  if (s.action === 'win') {
    const k = ease(f / 14);
    look.bendUp = -0.14 * k;
    J = bendUpper(J, look.bendUp);
    const cackle = Math.sin(t * 19) * 0.05 + Math.sin(t * 31) * 0.03;
    look.headBack = (0.18 + cackle) * k;
    look.jaw = (5 + Math.sin(t * 19) * 2.5) * k;
    const bx = J.hip[0] + 58;
    const d: Pt = [0, -1];
    armTo('F', [bx, -132], 1, [-0.3, 1]);
    look.plant = { butt: [bx, 0], d };
    // the other hand up by the hood, fingers spread
    armTo('B', add(J.shoulderB, dirA(-2.2), ARM * 0.78), k, [-0.5, 1]);
    look.charmSpin = 1;
  }

  if (s.action === 'lose') {
    const k = ease(f / 24);
    look.bendUp = 0.75 * k;
    J = bendUpper(J, look.bendUp);
    const bx = J.hip[0] + 60;
    const d: Pt = [0.04, -1];
    const H: Pt = [bx - 0.04 * 112, -112 + Math.sin(t * 1.6) * 1.5];
    armTo('F', H, 1, [-0.3, 1]);
    armTo('B', add(H, [-3, -11]), 1, [-0.3, 1]);
    look.plant = { butt: [bx, 0], d };
    look.twoHand = true;
  }

  if (s.action === 'shield' || s.action === 'shieldstun') {
    // the staff held crosswise in front with both hands
    const jolt = s.action === 'shieldstun' ? Math.max(0, 1 - (f - 1) / 6) * 6 : 0;
    const H = add(J.shoulderF, [ARM * 0.42 - jolt, ARM * 0.38]);
    armTo('F', H, 1, [-0.2, 1]);
    J = { ...J, prop: -1.0 };
    armTo('B', add(J.handF, dirA(-1.0), 52), 1, [-0.2, 1]);
    look.twoHand = true;
  }

  if (inMove && s.move === 'special' && md && s.action === 'attack') {
    // Hex Bolt: the staff thrust out level at the foe as the bolt leaves, the far hand flung back
    const S = (md.projectile ? md.projectile.frame : md.startup + 1) - 1;
    const k = ease((f - (S - 2)) / 3) * (1 - ease((f - (S + 9)) / 12));
    if (k > 0.001) {
      armTo('F', add(J.shoulderF, dirA(-0.08), ARM * 0.95), k, [0, 1]);
      J = { ...J, prop: J.prop + (-0.05 - J.prop) * k };
      armTo('B', add(J.shoulderB, dirA(-2.55), ARM * 0.9), k, [-0.6, 1]);
    }
  }

  if (inMove && s.move) {
    // the back hand joins the staff when the engine put it there
    const d = dirA(J.prop);
    const rel = sub(J.handB, J.handF);
    const along = dot(rel, d), off = Math.abs(dot(rel, perp(d)));
    if (off < 9 && along > -BUTT && along < BUILD.propLen) look.twoHand = true;
  }
  return { J, look };
}

/** the walk and run: small quick steps under the robe instead of the engine's long strides */
function glide(J: Joints, s: FighterState): Joints {
  if (s.action !== 'walk' && s.action !== 'run' && s.action !== 'skid') return J;
  const run = s.action !== 'walk';
  const D = run ? 62 : 46;
  const ph = (s.x * 100 * (s.facing || 1)) / D;
  const step = (q0: number): Pt => {
    const q = q0 - Math.floor(q0);
    const half = run ? 15 : 11;
    if (q < 0.5) return [J.hip[0] + half - (q / 0.5) * 2 * half, 0];
    const w = (q - 0.5) / 0.5;
    return [J.hip[0] - half + ease(w) * 2 * half, -Math.sin(PI * w) * (run ? 9 : 5)];
  };
  const skid = s.action === 'skid';
  const fF = skid ? [J.hip[0] + 18, 0] as Pt : step(ph), fB = skid ? [J.hip[0] - 14, 0] as Pt : step(ph + 0.5);
  const [l1, l2] = BUILD.leg;
  const kn = (fp: Pt): Pt => { const d = unit(sub(fp, J.hip)); return [d[1], -d[0]]; };
  // the hip sinks so the short steps keep the knees soft
  const hip: Pt = [J.hip[0], Math.max(J.hip[1], -(l1 + l2) * 0.93)];
  const [kneeF, footF] = ik2(hip, fF, l1, l2, kn(fF));
  const [kneeB, footB] = ik2(hip, fB, l1, l2, kn(fB));
  return { ...J, kneeF, footF, kneeB, footB };
}

/** the posed Hexer, or (crows) only the parts the flock needs */
function drawHexer(ink: Pen, J0: Joints, x: FigureExtra): void {
  const s = x.state;
  const t = x.t;
  const md = moveDef(s);
  const inMove = !!md && (s.action === 'attack' || s.action === 'charge');
  const { J: J1, look } = restyle(J0, x);
  const J = glide(J1, s);
  const tint = x.sideTint;

  // ---- the body frame ----
  const hip = J.hip, neck = J.neck, chest = J.chest;
  const u = unit(sub(neck, hip)); // up the spine
  const n: Pt = [-u[1], u[0]]; // forward across it (u = (0,-1) gives (1, 0))
  const spin = J.spin || 0;
  const wDown: Pt = [Math.sin(spin), Math.cos(spin)];
  // the robe hangs between the spine's down and the world's down
  const g = unit(mix([-u[0], -u[1]], wDown, 0.55));
  let gf: Pt = [-g[1], g[0]];
  if (dot(gf, n) < 0) gf = [-gf[0], -gf[1]];
  // cloth drag: against the motion; falling lifts the hem; a launch flings it
  const facing = s.facing || 1;
  const vxl = (x.drag * facing) / 6000;
  let dvW: Pt = [clamp(-vxl / 0.15, -1.4, 1.4) * 26, clamp(s.vy / 0.12, -1, 1) * 22];
  if (s.action === 'hitstun') {
    const kx = s.kbx * facing, ky = -s.kby, kl = Math.hypot(kx, ky);
    if (kl > 1e-4) dvW = add(dvW, [-(kx / kl) * 30, -(ky / kl) * 30]);
  }
  const dv: Pt = [dvW[0] * Math.cos(spin) + dvW[1] * Math.sin(spin), -dvW[0] * Math.sin(spin) + dvW[1] * Math.cos(spin)];
  const speed = c01(len(dvW) / 30);
  const flut = Math.sin(t * 8.3) * (1 + 3 * speed);
  const floorY = s.grounded && Math.abs(spin) < 0.01 ? -1.5 : 1e9;
  const onFloor = (p: Pt): Pt => [p[0], Math.min(p[1], floorY)];

  // ---- the staff: from its foot along d ----
  let sd: Pt, butt: Pt;
  if (look.plant) { sd = look.plant.d; butt = look.plant.butt; }
  else { sd = dirA(J.prop); butt = add(J.handF, sd, -BUTT); }
  const sn = perp(sd); // the crook curls to this side
  const top = add(butt, sd, STAFF);
  // where the front hand holds it (planted: wherever the hand is along it)
  const along = clamp(dot(sub(J.handF, butt), sd), 20, STAFF - 18);
  const gripF = add(butt, sd, along);

  // ---- the head frame: the sheet's head units, tilted with the joints ----
  const tilt = J.headTilt - look.headBack;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const head = J.head;
  const Hr = (hx: number, hy: number): Pt => [head[0] + hx * ct - hy * st, head[1] + hx * st + hy * ct];
  // a point in the neck frame: x forward across the spine, y down it
  const Nk = (px: number, py: number): Pt => add(add(neck, n, px), u, -py);

  // ================================ back to front ================================

  // 1. the sash tails, behind, knotted at the back of the waist
  const waistW = 15;
  const knot = add(add(hip, u, 7), n, -waistW - 2);
  {
    const tl = (L: number, sp: number, w: number, seed: number): void => {
      const pts: Pt[] = [knot];
      for (let k = 1; k <= 4; k++) {
        const q = k / 4;
        const p = add(add(add(knot, g, L * q), gf, -sp * q), dv, 1.1 * q * q);
        pts.push(add(p, gf, Math.sin(t * 7.1 + k * 1.3 + seed) * (1.5 + 4 * speed) * q));
      }
      const sh = tube(pts, w, w * 0.55, 4);
      ink.form(sh, { tint: MAGIC, w: 1.5, seed });
      const end = pts[4], d = unit(sub(pts[4], pts[3]));
      ink.line([end, add(end, d, 9), add(add(end, d, 14), perp(d), 3)], { tint: MAGIC, w: 1.4, taper: 0.9, seed: seed + 1 });
    };
    tl(52, 14, 4.4, 11);
    tl(66, 4, 3.6, 14);
  }

  // 2. the far arm in its sleeve (its hand on the staff waits until the staff is drawn)
  const eB = J.elbowB, hB = J.handB;
  const wristB = add(hB, unit(sub(eB, hB)), 7);
  {
    const sl = tube([J.shoulderB, eB, wristB], 6, 9, 4);
    ink.form(sl, { w: 2, seed: 21 });
    ink.hatch(sl, { angle: 1.0, gap: 3.6, w: 0.9, seed: 22 });
    if (!look.twoHand) {
      const a = Math.atan2(hB[1] - eB[1], hB[0] - eB[0]);
      const wide = s.action === 'win' || (inMove && s.move === 'special') ? 1.6 : 0.8;
      openHand(ink, add(wristB, unit(sub(hB, eB)), -2), a, 23, { side: -1, spread: wide, curl: wide > 1 ? -0.2 : 0.4, k: 0.95 });
    }
  }

  // 3. the legs: thin shins and pointed shoes below the hem
  ink.form(tube([J.kneeB, J.footB], 4.2, 3.6), { w: 1.6, seed: 31 });
  ink.hatch(tube([J.kneeB, J.footB], 4.2, 3.6), { angle: 0.4, gap: 3, w: 0.8, seed: 32 });
  shoe(ink, J.kneeB, J.footB, 1, 33);
  ink.form(tube([J.kneeF, J.footF], 4.4, 3.8), { w: 1.6, seed: 35 });
  shoe(ink, J.kneeF, J.footF, 1, 36);

  // 4. the robe: shoulders to a ragged hem that hangs between the feet and trails
  {
    const Lr = 90;
    const hemC = add(hip, g, Lr);
    const reachF = Math.max(20, dot(sub(J.footF, hip), gf) + 18, dot(sub(J.kneeF, hip), gf) + 12);
    const reachB = Math.max(24, -dot(sub(J.footB, hip), gf) + 20, -dot(sub(J.kneeB, hip), gf) + 14);
    const hemF = onFloor(add(add(add(hemC, gf, reachF), g, -6), dv, 0.25));
    const hemB = onFloor(add(add(add(hemC, gf, -reachB - 6), g, -4), add(dv, [flut * 0.6, 0]), 1.05));
    const waistF = add(hip, n, waistW - 1), waistB = add(hip, n, -waistW);
    let midF = add(mix(waistF, hemF, 0.5), gf, 7);
    const kF = add(J.kneeF, gf, 10);
    if (dot(sub(kF, hip), gf) > dot(sub(midF, hip), gf)) midF = kF;
    let midB = add(add(mix(waistB, hemB, 0.5), gf, -8), dv, 0.4);
    const kB = add(J.kneeB, gf, -11);
    if (dot(sub(kB, hip), gf) < dot(sub(midB, hip), gf)) midB = kB;
    const front = smooth([Nk(6, 2), Nk(13, 18), add(chest, n, 13), waistF, midF, hemF], 5);
    const rip = (i: number): number => Math.sin(t * (5 + 7 * speed) + i * 1.9) * (1.2 + 3.5 * speed);
    const hem = rag(hemF, hemB, 6, 14, 60, g, rip).slice(1, -1).map(onFloor);
    const back = smooth([hemB, midB, add(waistB, n, -2), add(chest, n, -14), Nk(-13, 14), Nk(-8, 0)], 5);
    const robe = front.concat(hem, back);
    ink.form(robe, { w: 2.6, seed: 41 });
    // the shadow side: the back of the robe
    const shade = smooth([Nk(-8, 2), Nk(-13, 14), add(chest, n, -14), add(waistB, n, -2), midB, add(hemB, gf, 4), add(mix(hemB, hemF, 0.32), g, -4), add(hip, n, -5), add(chest, n, -6)], 4, true);
    ink.hatch(shade.map(onFloor), { angle: 1.2, gap: 4.2, w: 1, seed: 42 });
    // folds from the waist to the hem
    ink.cut(smooth([add(hip, n, 8), add(mix(hip, hemC, 0.5), gf, 10), add(hemF, gf, -8)], 5), { w: 1.4, seed: 43 });
    ink.cut(smooth([add(hip, n, -2), add(mix(hip, hemC, 0.55), gf, -2), add(mix(hemF, hemB, 0.48), g, -2)], 5), { w: 1.5, seed: 44 });
    ink.cut(smooth([add(hip, n, -10), add(mix(hip, hemB, 0.5), gf, 2), add(mix(hemF, hemB, 0.78), g, -4)], 5), { w: 1.3, seed: 45 });
  }

  // 5. the sash round the waist and its knot (green)
  {
    const a = add(hip, u, 15), b = add(hip, u, 3);
    const band = smooth([add(a, n, waistW + 2), add(add(a, n, 0), u, 1.5), add(a, n, -waistW - 2), add(b, n, -waistW - 2), add(add(b, n, 0), u, -1), add(b, n, waistW + 2)], 4, true);
    ink.form(band, { tint: MAGIC, w: 1.8, seed: 51 });
    ink.hatch(band, { tint: MAGIC, angle: 1.1, gap: 3, w: 0.85, seed: 52 });
    ink.form(ell(knot[0], knot[1], 6, 5, 0.4, 14), { tint: MAGIC, w: 1.5, seed: 53 });
  }

  // 6. the shawl over the shoulders in the side's tint, its back flap trailing
  {
    const fl = add(dv, [flut * 0.4, 0], 0.45);
    const shawl = smooth([Nk(-14, 4), Nk(-26, 12), add(Nk(-32, 34), fl, 0.5), add(Nk(-38, 62), fl), add(Nk(-28, 52), fl, 0.8), add(Nk(-26, 58), fl, 0.85), add(Nk(-16, 44), fl, 0.5),
      Nk(-2, 34), Nk(8, 36), Nk(20, 30), Nk(26, 22), Nk(22, 12), Nk(16, 4)], 4, true);
    ink.form(shawl, { tint, w: 2.4, seed: 61 });
    ink.hatch(smooth([Nk(-12, 2), add(Nk(-16, 26), fl, 0.3), add(Nk(-20, 50), fl, 0.8), add(Nk(-8, 40), fl, 0.4), Nk(2, 32), Nk(4, 6)], 4, true), { angle: 1.3, gap: 3.6, w: 0.9, seed: 62 });
    ink.cut(smooth([Nk(-2, 8), Nk(-12, 22), add(Nk(-22, 44), fl, 0.7)], 5), { w: 1.3, seed: 63 });
    ink.cut(smooth([Nk(8, 8), Nk(14, 20), Nk(10, 31)], 5), { w: 1.2, seed: 64 });
  }

  // 7. the hood: a long cone bent back at the tip, trailing; the face in its opening
  {
    const tipRest: Pt = [-60 - 8 * speed, -47 - 8 * speed];
    let tipH = Hr(tipRest[0], tipRest[1]);
    tipH = add(tipH, add(dv, [flut * 0.7, -flut * 0.3]), 0.5);
    hoodForm(ink, Hr, tipH, tilt, 71);
    const hole = smooth([Hr(6, -14), Hr(15, -9), Hr(17, 4), Hr(13, 18 + look.jaw), Hr(5, 16 + look.jaw * 0.6), Hr(3, 0)], 5, true);
    ink.mask(hole);
    ink.cut(hole.concat([hole[0]]), { w: 1.5, taper: 0, seed: 74 });
    // the pointed chin (it drops when she cackles), the hooked nose, one glint of an eye
    const j = look.jaw;
    ink.form(smooth([Hr(9, 14 + j), Hr(14, 13 + j), Hr(20, 9 + j), Hr(19, 14 + j), Hr(13, 19 + j), Hr(8, 19 + j)], 4, true), { w: 1.2, seed: 75 });
    if (j > 2) ink.form([Hr(16, 9.5), Hr(15, 13.5), Hr(14, 9.8)], { w: 0.7, seed: 76 });
    ink.form(smooth([Hr(9, -7), Hr(16, -4), Hr(24, 1), Hr(27, 6), Hr(24, 9), Hr(22, 5), Hr(15, 4), Hr(10, 3)], 4, true), { w: 1.3, seed: 77 });
    ink.dot(...Hr(11, -4), 1.7, { free: true });
    ink.line([Hr(8, -8), Hr(14, -7)], { w: 1.1, taper: 0.8, seed: 78 });
    // grey hair hanging out of the hood, trailing
    for (let i = 0; i < 3; i++) {
      const e = add(Hr(-2 + i * 3, 46 + i * 3), dv, 0.3);
      ink.cut(smooth([Hr(4 + i * 1.5, 14), Hr(2 + i * 2, 30), e], 5), { w: 1.1, seed: 79 + i });
    }
  }

  // 8. the crooked staff, its crook, the band in the side tint, the charm on its cord
  drawStaff(ink, butt, sd, x, look.charmSpin, wDown, 101, inMove ? 1 : 0);

  // 9. the far hand on the staff (two-handed)
  if (look.twoHand) {
    const a2 = clamp(dot(sub(hB, butt), sd), 10, STAFF - 10);
    grip(ink, add(butt, sd, a2), sd, dot(sn, unit(sub(hB, eB))) > 0 ? -1 : 1, 121, 0.9);
  }

  // 10. the near arm: a bell sleeve with a ragged cuff, the bony hand round the staff
  {
    const eF = J.elbowF;
    const fd = unit(sub(gripF, eF));
    const wristF = add(gripF, fd, -9);
    const sleeve = tube([J.shoulderF, eF, wristF], 6.5, 10.5, 4);
    ink.form(sleeve, { w: 2.3, seed: 111 });
    const sv = perp(fd);
    ink.cut(smooth([add(eF, sv, -5), add(mix(eF, wristF, 0.5), sv, -3), add(wristF, sv, -6)], 4), { w: 1.2, seed: 112 });
    ink.form(rag(add(wristF, sv, 10.5), add(wristF, sv, -10.5), 4, 4, 117, fd, () => 0).concat([add(add(wristF, fd, -5), sv, -10), add(add(wristF, fd, -5), sv, 10)]), { w: 1.5, seed: 113 });
    grip(ink, gripF, sd, dot(sn, [fd[0], fd[1]]) > 0 ? -1 : 1, 131, 0.95);
  }
}

/** the staff from its foot along d: kinks, a crook curling to perp(d), knots, the side band,
 *  the charm hanging under the crook */
function drawStaff(ink: Pen, butt: Pt, d: Pt, x: FigureExtra, charmSpin: number, wDown: Pt, seed: number, swing: number): void {
  const n = perp(d);
  const at = (a: number, b: number): Pt => add(add(butt, d, a), n, b);
  const L = STAFF;
  const kink = [0, 0.18, 0.37, 0.55, 0.74, 0.9, 1].map((q, i): Pt => at(q * L, [0, 2.5, -1.5, 2, -2.5, 1, 0][i]));
  const crook: Pt[] = [at(L + 6, 0), at(L + 7, 10), at(L + 1, 18), at(L - 8, 18), at(L - 13, 13)];
  const path = smooth(kink.concat(crook), 5);
  ink.line(path, { w: 3.8, taper: 0.12, seed });
  // knots and a twig
  for (const [q, sgn] of [[0.3, -1], [0.62, 1], [0.84, -1]] as [number, number][]) {
    const p = at(q * L, 0);
    ink.line([add(p, n, sgn * 1), add(add(p, n, sgn * 7), d, 6)], { w: 2.2, taper: 0.7, seed: seed + 1 + q * 10 });
  }
  // the binding band under the crook in the side's tint
  ink.line([at(L - 22, 0), at(L - 36, 0)], { tint: x.sideTint, w: 7.5, taper: 0, seed: seed + 5 });
  ink.cut([at(L - 29, -3.6), at(L - 29, 3.6)], { w: 0.9, seed: seed + 6 });
  // the charm: a cord from the crook's end, hanging toward the world's floor and swinging
  const hang = crook[4];
  const s = x.state;
  const sw = Math.sin(x.t * 3.3) * 0.22 + clamp((-x.drag * (s.facing || 1)) / 900, -0.9, 0.9) * 0.5 + swing * Math.sin(x.t * 9.5) * 0.35;
  const gd = unit([wDown[0] * Math.cos(sw) - wDown[1] * Math.sin(sw), wDown[0] * Math.sin(sw) + wDown[1] * Math.cos(sw)]);
  const tok = add(hang, gd, 15);
  ink.line([hang, add(mix(hang, tok, 0.5), perp(gd), 1.5), tok], { w: 1.3, taper: 0.2, seed: seed + 7 });
  const tn = perp(gd);
  const wk = charmSpin > 0 ? Math.cos(x.t * 13) : 1; // spinning on the cord: its face turns edge-on and back
  const T = (a: number, b: number): Pt => add(add(tok, gd, a), tn, b * (0.25 + 0.75 * Math.abs(wk)));
  const token = smooth([T(0, 0), T(4, 6), T(12, 6.5), T(17, 0), T(12, -6.5), T(4, -6)], 4, true);
  ink.form(token, { tint: MAGIC, w: 1.5, seed: seed + 8 });
  if (Math.abs(wk) > 0.35) {
    ink.cut([T(4, -3), T(13, 3)], { w: 1, seed: seed + 9 });
    ink.cut([T(4, 3), T(13, -3)], { w: 1, seed: seed + 10 });
  }
  for (let i = -1; i <= 1; i++) ink.line(smooth([T(17, i * 2), T(24, i * 3.5), T(30, i * 3)], 4), { w: 1.1, taper: 0.8, tint: MAGIC, seed: seed + 12 + i });
}

// ------------------------------------------------------------------------------------------------
// Crow Flight
// ------------------------------------------------------------------------------------------------

/** 0 = herself, 1 = all crows; and how far the flock has burst out (for the in-between frames) */
function crowState(s: FighterState): { k: number; phase: 'out' | 'fly' | 'in' | 'none'; u: number } {
  if (s.action !== 'attack' || s.move !== 'recover') return { k: 0, phase: 'none', u: 0 };
  const md = moveDef(s);
  if (!md) return { k: 0, phase: 'none', u: 0 };
  const f = s.actionFrame, S = md.startup, E = md.startup + md.active;
  if (f <= S - 4) return { k: 0, phase: 'none', u: 0 };
  if (f <= S) return { k: 0, phase: 'out', u: (f - (S - 4)) / 4 };
  if (f <= E) return { k: 1, phase: 'fly', u: (f - S) / Math.max(1, md.active) };
  if (f <= E + 7) return { k: 0, phase: 'in', u: (f - E) / 7 };
  return { k: 0, phase: 'none', u: 0 };
}

function drawCrow(ink: Pen, c: Pt, S: number, fx: number, ph: number, tilt: number, seed: number): void {
  // a black bird: dark masses with a cream pen edge, a pale beak and eye
  const cr = crowShapes(c, S, fx, ph, tilt);
  ink.mask(cr.far);
  ink.line(cr.far, { closed: true, w: 1.6, seed });
  ink.mask(cr.body);
  ink.line(cr.body, { closed: true, w: 2, seed: seed + 2 });
  ink.mask(cr.near);
  ink.line(cr.near, { closed: true, w: 2, seed: seed + 3 });
  ink.line(cr.quill, { w: 1.2, taper: 0.8, seed: seed + 4 });
  ink.form(cr.beak, { w: 1, seed: seed + 5 });
  ink.dot(cr.eye[0], cr.eye[1], Math.max(1.3, S * 0.035), { free: true });
}

/** the flock: nine crows in a loose rising spiral where her body was; the staff carried by one */
function drawFlock(ink: Pen, J: Joints, x: FigureExtra, cs: { phase: string; u: number }): void {
  const s = x.state;
  const f = s.actionFrame;
  const hip = J.hip;
  const N = 9;
  const items: { z: number; draw: () => void }[] = [];
  // the body's points the crows burst from and gather back into
  const home = (i: number): Pt => mix(add(hip, [4, 30]), add(J.head, [0, -20]), i / (N - 1));
  const vxl = (x.drag * (s.facing || 1)) / 6000;
  for (let i = 0; i < N; i++) {
    const th = i * 2.4 + f * 0.21 + 0.6;
    const r = 34 + 14 * ((i * 7) % 3);
    const rise = cs.phase === 'fly' ? 40 * cs.u : 0;
    let p: Pt = [hip[0] + Math.cos(th) * r - vxl * 120 * (i / N), hip[1] + 40 - i * 30 - rise + Math.sin(th) * r * 0.3];
    let S = 46 + 10 * Math.sin(th) + (i % 3) * 3;
    if (cs.phase === 'out') { p = mix(home(i), p, ease(cs.u)); S *= 0.5 + 0.5 * cs.u; }
    if (cs.phase === 'in') { p = mix(p, home(i), ease(cs.u * 1.15)); S *= 1 - 0.65 * ease(cs.u); if (cs.u > 0.85 && i % 2) continue; }
    const fx = -Math.sin(th) >= 0 ? 1 : -1; // flying along the circle
    const ph = Math.sin(f * 0.9 + i * 1.7);
    const tilt = -0.45 - 0.15 * Math.cos(f * 0.5 + i);
    const z = Math.sin(th);
    const carrier = i === 4;
    items.push({ z, draw: () => {
      drawCrow(ink, p, S, fx, ph, tilt, 400 + i * 6);
      if (carrier && cs.phase !== 'in') {
        // the staff hanging slant from its feet, charm and all
        const d = unit([0.55 * fx, -0.84]);
        const hold = add(p, [0, S * 0.12]);
        drawStaff(ink, add(hold, d, -STAFF * 0.55), d, x, 0, [0, 1], 460, 1);
      }
    } });
  }
  items.sort((a, b) => a.z - b.z);
  for (const it of items) it.draw();
}

// ------------------------------------------------------------------------------------------------
// moves drawn outside the body
// ------------------------------------------------------------------------------------------------

/** the crook's head: where the magic leaves the staff */
function crookPoint(J: Joints): { p: Pt; d: Pt } {
  const d = dirA(J.prop);
  return { p: add(add(J.handF, d, BUILD.propLen + 4), perp(d), 9), d };
}

/** a small knot of green fire, its tongues streaming along `back` */
function flameKnot(ink: Pen, c: Pt, size: number, back: number, t: number, seed: number): void {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const L = size * (2.2 - i * 0.35) * (1 + 0.15 * Math.sin(t * 21 + i * 1.9));
    const a = back + (i - 1.5) * 0.35 + Math.sin(t * 13 + i * 2.3) * 0.12;
    const tg = tongue(add(c, dirA(a), -size * 0.3), L, a, size * (0.55 - i * 0.06), -0.9, 0.25, t * 9 + i);
    ink.form(tg.shape, { tint: MAGIC, w: 1.3, seed: seed + i });
  }
}

function drawMoves(ink: Pen, J0: Joints, x: FigureExtra): void {
  const s = x.state;
  const md = moveDef(s);
  if (!md || !s.move) return;
  const f = s.actionFrame;
  const { J } = restyle(J0, x);
  if (s.action === 'charge' && (s.move === 'smash' || s.move === 'upsmash')) {
    // green fire gathering in the crook with the charge
    const { p } = crookPoint(J);
    flameKnot(ink, p, 5 + 7 * c01(s.charge / 40), -PI / 2, x.t, 600);
    return;
  }
  if (s.action !== 'attack') return;
  if (s.move === 'special') {
    // Hex Bolt: fire gathers in the crook through the wind-up, flares forward as the bolt leaves
    const pf = md.projectile ? md.projectile.frame : md.startup + 1;
    const { p, d } = crookPoint(J);
    const ad = Math.atan2(d[1], d[0]);
    if (f < pf) {
      const k = c01((f - 3) / Math.max(1, pf - 4));
      if (k > 0) flameKnot(ink, p, 4 + 8 * k, -PI / 2, x.t, 610);
    } else if (f < pf + 9) {
      const k = 1 - (f - pf) / 9;
      for (let i = 0; i < 5; i++) {
        const a = ad + (i - 2) * 0.32;
        const L = (26 + 22 * k) * (1 - 0.15 * Math.abs(i - 2));
        const tg = tongue(add(p, dirA(a), 4), L, a, 3 + 3.5 * k, (i - 2) * -0.25, 0.2, i * 1.7 + f);
        ink.form(tg.shape, { tint: MAGIC, w: 1.2, seed: 620 + i });
      }
    }
  }
  if (s.move === 'special2') {
    // Ward: the crook scratches the floor in the wind-up, the charm leaves with a flick
    const { p } = crookPoint(J);
    const pf = md.projectile ? md.projectile.frame : md.startup + 1;
    if (f <= pf && p[1] > -40) {
      for (let i = 0; i < 3; i++) {
        const a = -PI / 2 - 0.6 + i * 0.5 + Math.sin(f * 1.3 + i) * 0.2;
        ink.line([add(p, dirA(a), 3), add(p, dirA(a), 14 + i * 4)], { tint: MAGIC, w: 2.4, taper: 0.8, seed: 640 + i });
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------
// projectiles
// ------------------------------------------------------------------------------------------------

/** a map from the upright picture (+x along the travel, y down) into the projectile's local frame:
 *  the stage turns the frame to the velocity, so a shot flying left would be upside down */
function frameOf(p: Projectile): (q: Pt) => Pt {
  const sy = p.vx < 0 ? -1 : 1;
  return (q: Pt): Pt => [q[0], q[1] * sy];
}

function drawBolt(ink: Pen, p: Projectile, t: number): void {
  const F = frameOf(p);
  const spent = (p as Projectile & { cd?: number }).cd === 1;
  const seed = 700 + (p.id % 30) * 9;
  const tt = t + p.id * 0.37;
  const hx = 34;
  const back: Pt[][] = [], knot: Pt[][] = [];
  // five long uneven tongues streaming back from the knot, whipping up and down, flickering
  const TONG: [number, number, number, number, number][] = [
    // y at the root, length, angle off straight back, half-width, curl
    [0, 104, 0.02, 6.5, -0.2], [-5, 86, 0.17, 6, -0.35], [5, 76, -0.15, 5.5, 0.3], [-8, 60, 0.32, 5, -0.5], [8, 52, -0.3, 4.5, 0.45], [-2, 40, 0.08, 4, -0.6],
  ];
  TONG.forEach(([y0, L0, a0, w, cu], i) => {
    const L = L0 * (1 + 0.14 * Math.sin(tt * 19 + i * 2.1));
    const a = PI + a0 + Math.sin(tt * 15 + i * 1.3) * 0.06;
    back.push(tongue([hx - 8, y0], L, a, w, cu + Math.sin(tt * 11 + i) * 0.15, 0.14 + 0.03 * i, tt * 12 + i * 1.6).shape.map(F));
  });
  // the knot at the head: a tight ball of fire, round at the front, licking back in points
  {
    const pts: Pt[] = [];
    const M = 30;
    for (let i = 0; i < M; i++) {
      const a = (i / M) * PI * 2;
      const c = Math.cos(a);
      let r = 15 * (1 + 0.07 * Math.sin(tt * 31 + i * 1.7));
      if (c < -0.2) {
        // five uneven points along the back of the ball
        const k = (a < PI ? a - Math.acos(-0.2) : PI * 2 - Math.acos(-0.2) - a);
        const w = Math.max(0, Math.sin((k / (PI - Math.acos(-0.2))) * PI * 2.5));
        r += w * (9 + 7 * h01(i * 3.3 + Math.floor(tt * 8))) * (-c);
      }
      pts.push([hx + c * r * 1.15, Math.sin(a) * r * 0.85]);
    }
    knot.push(smooth(pts, 2, true).map(F));
  }
  // two thin strokes spiralling round the tongues
  const spirals: Pt[][] = [];
  for (let k = 0; k < 2; k++) {
    const pts: Pt[] = [];
    for (let j = 0; j <= 36; j++) {
      const q = j / 36, xx = hx + 2 - q * 100;
      pts.push(F([xx, Math.sin(q * 10 - tt * 26 + k * PI) * (3 + q * 13) * (1 + 0.25 * Math.sin(q * 5 + k))]));
    }
    spirals.push(pts);
  }
  if (spent) {
    back.concat(knot).forEach((sh, i) => { if (i % 2 === 0) ink.line(sh, { tint: MAGIC, closed: true, w: 1.6, alpha: 0.35, seed: seed + i }); });
    return;
  }
  back.forEach((sh, i) => ink.form(sh, { tint: MAGIC, w: 1.4, seed: seed + i }));
  spirals.forEach((pts, k) => ink.line(pts, { tint: MAGIC, w: 1.8, taper: 0.85, seed: seed + 20 + k }));
  knot.forEach((sh, i) => ink.form(sh, { tint: MAGIC, w: 1.6, seed: seed + 10 + i }));
  // a swirl cut into the knot so it reads as fire turning over, not a blob
  ink.cut(smooth([F([hx + 10, -6]), F([hx - 2, -3]), F([hx - 16, -7])], 4), { w: 1.4, seed: seed + 15 });
  ink.cut(smooth([F([hx + 6, 6]), F([hx - 6, 3]), F([hx - 20, 6])], 4), { w: 1.1, seed: seed + 16 });
}

function drawWard(ink: Pen, p: Projectile, t: number): void {
  const seed = 800 + (p.id % 20) * 7;
  if (!p.floor) {
    // the charm in flight, spinning end over end, a short green trail behind it
    const a = t * 14 + p.id;
    const d = dirA(a), n = perp(d);
    const T = (x: number, y: number): Pt => add(add([0, 0], d, x), n, y);
    ink.line([[-14, 0], [-40, Math.sin(t * 20) * 3]], { tint: MAGIC, w: 3.4, taper: 0.9, alpha: 0.8, seed: seed + 1 });
    ink.line([[-12, 7], [-30, 10]], { tint: MAGIC, w: 2.4, taper: 0.9, alpha: 0.6, seed: seed + 2 });
    const tok = smooth([T(-12, 0), T(-6, 10), T(6, 10.5), T(12, 0), T(6, -10.5), T(-6, -10)], 4, true);
    ink.form(tok, { tint: MAGIC, w: 2, seed: seed + 3 });
    ink.cut([T(-6, -5), T(7, 5)], { w: 1.6, seed: seed + 4 });
    ink.cut([T(-6, 5), T(7, -5)], { w: 1.6, seed: seed + 5 });
    ink.line([T(12, 0), T(21, 2), T(28, 0)], { tint: MAGIC, w: 1.8, taper: 0.8, seed: seed + 6 });
    return;
  }
  // lying on the floor: a hand-scratched mark seen nearly edge-on, fading as its life runs out
  const rw = Math.max(40, p.r * 100);
  const al = 0.3 + 0.7 * c01(p.life / 70);
  const rh = rw * 0.12;
  const cy = -rh * 0.85;
  // the oval, scratched round twice and never quite closed, uneven
  const ring = (k0: number, k1: number, sc: number, jy: number, s0: number): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i <= 28; i++) {
      const a = k0 + ((k1 - k0) * i) / 28;
      out.push([Math.cos(a) * rw * sc * (1 + 0.07 * Math.sin(a * 3 + 1)), cy + Math.sin(a) * rh * sc * (1 + 0.2 * Math.sin(a * 2.3 + s0)) + jy + (h01(s0 + i) - 0.5) * 1.4]);
    }
    return out;
  };
  ink.line(ring(-0.3, PI * 2 - 0.15, 1, 0, seed), { tint: MAGIC, w: 5.5, taper: 0.55, alpha: al, seed });
  ink.line(ring(PI * 0.75, PI * 1.85, 0.9, -1.5, seed + 3), { tint: MAGIC, w: 3, taper: 0.8, alpha: al * 0.85, seed: seed + 1 });
  // the crossed strokes scratched inside it
  const X: [number, number, number, number][] = [[-0.62, -0.7, 0.5, 0.75], [-0.45, 0.8, 0.68, -0.6], [-0.8, 0.1, 0.84, -0.15], [0.1, -0.9, -0.15, 0.95]];
  X.forEach(([x0, y0, x1, y1], i) => ink.line([[x0 * rw * 0.82, cy + y0 * rh * 0.85], [(x0 + x1) * rw * 0.41 + 3, cy + (y0 + y1) * rh * 0.42 - 1], [x1 * rw * 0.82, cy + y1 * rh * 0.85]],
    { tint: MAGIC, w: 4.6 - i * 0.5, taper: 0.7, alpha: al, seed: seed + 10 + i }));
  // thin strokes rising from it now and then, each on its own clock
  for (let i = 0; i < 4; i++) {
    const per = 1.1 + 0.37 * i;
    const ph = t / per + h01(seed + i * 3.1);
    const q = ph % 1;
    if (q > 0.65) continue;
    const v = q / 0.65;
    const bx = (h01(seed + i * 7.7 + Math.floor(ph)) - 0.5) * rw * 1.4;
    const y0 = cy - v * 50, l = 22 + 14 * (1 - v);
    const pts: Pt[] = [];
    for (let j = 0; j <= 5; j++) pts.push([bx + Math.sin(v * 6 + j * 0.9 + i) * 4, y0 - (l * j) / 5]);
    ink.line(pts, { tint: MAGIC, w: 3.6 * (1 - v * 0.4), taper: 0.8, alpha: al * (1 - v * v) * 0.9, seed: seed + 20 + i });
  }
}

// ------------------------------------------------------------------------------------------------

export const HEXER: CharacterDef = {
  id: 'gantry',
  build: BUILD,
  anims: {
    jab: { anim: 'jab' }, tilt: { anim: 'thrust' }, uptilt: { anim: 'swingUp' }, dash: { anim: 'thrust', hand: 'both' },
    smash: { anim: 'swingSide', hand: 'both' }, upsmash: { anim: 'castUp', hand: 'both' },
    nair: { anim: 'spin' }, fair: { anim: 'swingOver', hand: 'both' }, bair: { anim: 'swingSide' }, uair: { anim: 'swingUp' }, dair: { anim: 'cast', hand: 'both' },
    grab: { anim: 'reach' }, throwf: { anim: 'throwObj', hand: 'both' }, throwb: { anim: 'throwObj', hand: 'both' }, throwu: { anim: 'throwObj', hand: 'both' },
    special: { anim: 'cast' }, special2: { anim: 'swingUp' }, recover: { anim: 'leap' },
  },
  draw(ink, J, x) {
    const cs = crowState(x.state);
    if (cs.phase === 'fly') { drawFlock(ink, J, x, cs); return; }
    if (cs.phase === 'in' && cs.u < 0.35) { drawFlock(ink, J, x, cs); return; }
    drawHexer(ink, J, x);
    if (cs.phase === 'out' || cs.phase === 'in') drawFlock(ink, J, x, cs);
  },
  drawMove(ink, J, x) { drawMoves(ink, J, x); },
  drawProjectile(ink: Pen, p: Projectile, t: number) {
    if (p.kind === 'ward') drawWard(ink, p, t);
    else drawBolt(ink, p, t);
  },
  portrait(ink, t) {
    void t;
    // shoulders in the shawl, the hood with its bent tip, the face, the crook and charm beside
    const Hr = (hx: number, hy: number): Pt => [hx * 1.1 + 14, hy * 1.1 - 2];
    ink.form(smooth([[-50, 56], [-44, 22], [-24, 8], [0, 4], [24, 10], [44, 26], [48, 56]], 5, true), { w: 2.6, seed: 901 });
    ink.form(smooth([[-46, 40], [-40, 16], [-20, 6], [6, 6], [28, 14], [40, 30], [30, 42], [10, 36], [-10, 44], [-30, 38]], 4, true), { w: 2.2, seed: 902 });
    ink.hatch(smooth([[-46, 40], [-40, 16], [-20, 6], [-12, 30], [-30, 38]], 4, true), { angle: 1.25, gap: 3.6, w: 0.9, seed: 903 });
    hoodForm(ink, Hr, Hr(-58, -46), 0, 904);
    const hole = smooth([Hr(6, -14), Hr(15, -9), Hr(17, 4), Hr(13, 18), Hr(5, 16), Hr(3, 0)], 5, true);
    ink.mask(hole);
    ink.form(smooth([Hr(9, 14), Hr(14, 13), Hr(20, 9), Hr(19, 14), Hr(13, 19), Hr(8, 19)], 4, true), { w: 1.2, seed: 906 });
    ink.form(smooth([Hr(9, -7), Hr(16, -4), Hr(24, 1), Hr(27, 6), Hr(24, 9), Hr(22, 5), Hr(15, 4), Hr(10, 3)], 4, true), { w: 1.3, seed: 907 });
    ink.dot(...Hr(11, -4), 2, { free: true });
    // the crook and the green charm at the right
    ink.line(smooth([[44, 58], [42, 10], [43, -30], [46, -40], [54, -40], [56, -30]], 4), { w: 3.2, taper: 0.15, seed: 908 });
    ink.line([[56, -30], [56, -18]], { w: 1.1, seed: 909 });
    ink.form(smooth([[56, -18], [61, -12], [60, -3], [56, 1], [52, -3], [51, -12]], 4, true), { tint: MAGIC, w: 1.3, seed: 910 });
  },
};
