// THE COUNT (fighter id 'gantry'): a tall gaunt vampire lord in a stiff fin collar and a cloak cut
// like bat wings, drawn by the pen from the posed joints. The look is the approved sheet,
// lab/cast/count.js: long hook-nosed face, hair swept back, the collar lined in red, the great
// cloak with a scalloped hem and red lining, long clawed hands, waistcoat, thin legs.
//
// The cloak is two wings. Each wing hangs from the neck; when a move "opens" it (oF, oB 0..1) its
// leading edge runs along that arm to the hand and on past it to a tip, and the trailing edge
// scallops down to the hem like a bat's wing. Closed, the front wing is the near side of the cloak
// (covering the back half of the body, its front edge lined in red) and the back wing is the drape
// behind. The cloak hangs mostly along the body and partly toward the world floor, trails against
// the motion (FigureExtra.drag), flares when falling and flings away from a launch.
//
// The side shows on the waistcoat (FigureExtra.sideTint); the lining stays red.
// Every pen call has a fixed seed so nothing boils from frame to frame.
import type { Build, CharacterDef, FigureExtra, Joints } from '../api.ts';
import type { FighterState, MoveDef, Projectile } from '../../sim/types.ts';
import { FIGHTERS } from '../../sim/fighters.ts';
import type { Pen, Pt } from '../pen.ts';
import { h01, mix, smooth } from '../pen.ts';

const BUILD: Build = { height: 228, hipY: 100, torso: 74, neckLen: 27, arm: [57, 55], leg: [54, 52], shoulderX: 16, stanceX: 36, hunch: 0.04, propLen: 0, heft: 0.9 };
const ARM = BUILD.arm[0] + BUILD.arm[1];
const HK = 1.05; // head scale against the sheet's head units

// ------------------------------------------------------------------------------------------------
// small math
// ------------------------------------------------------------------------------------------------

const PI = Math.PI;
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (v: Pt): number => Math.hypot(v[0], v[1]);
const unit = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const dirA = (a: number): Pt => [Math.cos(a), Math.sin(a)];
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const c01 = (v: number): number => clamp(v, 0, 1);
const ease = (u: number): number => 0.5 - 0.5 * Math.cos(PI * c01(u));
const mixArr = (a: Pt[], b: Pt[], t: number): Pt[] => a.map((p, i) => mix(p, b[i]!, t));

/** a bent tube along a path as one closed outline (from the sheet) */
function tube(path: Pt[], w0: number, w1: number, per = 4): Pt[] {
  const p = path.length > 2 ? smooth(path, per) : path;
  const n = p.length, L: Pt[] = [], R: Pt[] = [];
  let a0 = 0, a1 = 0;
  for (let i = 0; i < n; i++) {
    const d = unit(sub(p[Math.min(n - 1, i + 1)]!, p[Math.max(0, i - 1)]!)), nn: Pt = [-d[1], d[0]], w = w0 + ((w1 - w0) * i) / Math.max(1, n - 1);
    L.push(add(p[i]!, nn, w)); R.push(add(p[i]!, nn, -w));
    if (i === 0) a0 = Math.atan2(nn[1], nn[0]);
    if (i === n - 1) a1 = Math.atan2(nn[1], nn[0]);
  }
  const capE: Pt[] = [], capS: Pt[] = [];
  for (let j = 1; j < 6; j++) capE.push(add(p[n - 1]!, dirA(a1 - (PI * j) / 6), w1));
  for (let j = 1; j < 6; j++) capS.push(add(p[0]!, dirA(a0 + PI - (PI * j) / 6), w0));
  return L.concat(capE, R.reverse(), capS);
}

/** an edge through sharp tips: each span sags in toward `inside` by its own depth (0 = straight) */
function scallops(tips: Pt[], depths: number[], inside: Pt, n = 6): Pt[] {
  const out: Pt[] = [tips[0]!];
  for (let i = 1; i < tips.length; i++) {
    const a = tips[i - 1]!, b = tips[i]!, m = mix(a, b, 0.5);
    const dd = depths[i - 1] ?? 0;
    if (dd < 0.5) { out.push(mix(a, b, 0.5), b); continue; }
    let nn: Pt = unit(sub(b, a)); nn = [-nn[1], nn[0]];
    if ((inside[0] - m[0]) * nn[0] + (inside[1] - m[1]) * nn[1] < 0) nn = [-nn[0], -nn[1]];
    const d = Math.min(dd * (0.75 + 0.5 * h01(i * 3.3 + tips.length)), len(sub(b, a)) * 0.3);
    for (let k = 1; k < n; k++) { const t = k / n, s = Math.sin(PI * Math.pow(t, 0.8)); out.push(add(mix(a, b, t), nn, d * s)); }
    out.push(b);
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

// ------------------------------------------------------------------------------------------------
// the move timeline: how far the cloak is thrown open, per move
// ------------------------------------------------------------------------------------------------

/** front wing open, back wing open, how far the front / back tip runs past the hand */
const OPEN: Record<string, [number, number, number, number]> = {
  jab: [0.25, 0, 0, 0],
  tilt: [1, 0.15, 70, 0],
  uptilt: [1, 0.4, 45, 10],
  dash: [0, 0, 0, 0],
  smash: [1, 0.2, 80, 0],
  upsmash: [1, 1, 30, 30],
  nair: [0.75, 0.75, 25, 25],
  fair: [0.45, 0.3, 10, 0],
  bair: [0.1, 1, 0, 55],
  uair: [0.5, 0.2, 15, 0],
  dair: [0.5, 0.5, 10, 10],
  grab: [0.5, 0.1, 0, 0],
  throwf: [0.6, 0.3, 10, 0],
  throwb: [0.6, 0.6, 10, 10],
  throwu: [0.6, 0.3, 10, 0],
  special: [1, 1, 28, 28],
  special2: [0.7, 0.2, 20, 0],
  recover: [1, 1, 20, 20],
};

function moveDef(s: FighterState): MoveDef | null {
  if (!s.move) return null;
  const d = FIGHTERS[s.fighter];
  return d ? d.moves[s.move] ?? null : null;
}

/** 0..1: rises through the wind-up, holds through the strike, eases off in the recovery */
function envelope(md: MoveDef, f: number, charging: boolean): number {
  const S = Math.max(1, md.startup), A = md.active, R = Math.max(1, md.recovery);
  if (charging) return ease(f / Math.max(1, S * 0.7));
  const up = ease((f - 1) / Math.max(1, S * 0.85));
  const down = 1 - ease((f - S - A) / (R * 0.6));
  return Math.min(up, down);
}

/** the frame Mist Step vanishes on (the sim2 blink frame; the older sim has none, so its startup) */
function blinkFrame(md: MoveDef): number {
  const b = (md as MoveDef & { blink?: { frame: number } }).blink;
  return b ? b.frame : md.startup;
}

// ------------------------------------------------------------------------------------------------
// parts
// ------------------------------------------------------------------------------------------------

/** a long bony hand with hooked nails: wrist, the way the fingers point, curl, thumb side */
function claw(ink: Pen, wrist: Pt, ang: number, seed: number, o: { k?: number; spread?: number; curl?: number; side?: number } = {}): void {
  const k = o.k ?? 1, spread = o.spread ?? 0.6, curl = o.curl ?? 0.5, side = o.side ?? 1;
  const d = dirA(ang), n: Pt = [-d[1], d[0]];
  const at = (a: number, b: number): Pt => [wrist[0] + (d[0] * a + n[0] * b) * k, wrist[1] + (d[1] * a + n[1] * b) * k];
  const lens = [17, 22, 21, 15];
  for (let i = 3; i >= 0; i--) {
    const base = at(9, (i - 1.5) * 2.6 * side), a = ang + (i - 1.5) * 0.2 * spread * side;
    const j1 = add(base, dirA(a), lens[i]! * 0.45 * k), a2 = a + curl * side, j2 = add(j1, dirA(a2), lens[i]! * 0.33 * k), a3 = a2 + curl * 0.9 * side;
    const tip = add(j2, dirA(a3), lens[i]! * 0.22 * k);
    const nail = add(tip, dirA(a3 + curl * 0.9 * side), 5 * k);
    ink.form(tube([base, j1, j2, tip, nail], 1.7 * k, 0.35 * k, 3), { w: 1.1, seed: seed + i });
  }
  const tb = at(3, -side * 5), ta = ang - side * 0.8;
  ink.form(tube([tb, add(tb, dirA(ta), 8 * k), add(tb, dirA(ta + side * 0.5), 14 * k)], 2 * k, 0.6 * k, 3), { w: 1.1, seed: seed + 5 });
  ink.form(smooth([at(-5, -5 * side), at(4, -6.5 * side), at(11, -4.5 * side), at(11.5, 5 * side), at(2, 5.5 * side), at(-5, 4 * side)], 4, true), { w: 1.4, seed: seed + 6 });
}

/** a pointed boot at the foot; the toe goes forward across the shin (fx: which way is forward) */
function boot(ink: Pen, knee: Pt, f: Pt, fx: number, seed: number): void {
  const d = unit(sub(f, knee));
  let toe: Pt = [d[1], -d[0]];
  if (toe[0] * fx < 0 && Math.abs(d[0]) < 0.6) toe = [-toe[0], -toe[1]];
  const B = (x: number, y: number): Pt => [f[0] + toe[0] * x + d[0] * y, f[1] + toe[1] * x + d[1] * y];
  ink.form(smooth([B(-8, -15), B(3, -16), B(8, -8), B(19, -4), B(26, -1), B(19, 0.5), B(-3, -0.5), B(-9, 0), B(-10, -6)], 4, true), { w: 1.8, seed });
  ink.cut([B(-2, -3), B(20, -2.5)], { w: 0.9, taper: 0.6, seed: seed + 1 });
}

/** a bat seen from the front: half-span 1 in its own units, wing lift ph (-1 down .. 1 up) */
function batShape(ph: number): { all: Pt[]; right: Pt[] } {
  const T: Pt = [1.0, -0.22 - 0.6 * ph], Wr: Pt = [0.52, -0.4 - 0.32 * ph], F1: Pt = [0.76, 0.14 - 0.42 * ph], F2: Pt = [0.46, 0.28 - 0.18 * ph], B: Pt = [0.12, 0.2];
  const right: Pt[] = ([[0.07, -0.25], [0.13, -0.46], [0.15, -0.2], [0.2, -0.16], [0.36, -0.33 - 0.16 * ph], Wr] as Pt[])
    .concat(scallops([T, F1, F2, B], [0.1, 0.1, 0.1], [0.3, -0.1], 3), [[0.09, 0.4], [0.03, 0.47]] as Pt[]);
  const left = right.slice().reverse().map(([x, y]): Pt => [-x, y]);
  return { all: right.concat(left), right };
}

// ------------------------------------------------------------------------------------------------
// the figure
// ------------------------------------------------------------------------------------------------

interface Shapes {
  backWing: Pt[];
  frontWing: Pt[];
  face: Pt[];
  hair: Pt[];
  collar: Pt[];
  legF: Pt[];
  legB: Pt[];
}

/** the face, hair, ear and collar of the sheet, through Hr (head units to figure units) */
function headShapes(Hr: (x: number, y: number) => Pt, jaw: number, collarK: number): { face: Pt[]; hair: Pt[]; collar: Pt[]; collarIn: Pt[]; ear: Pt[] } {
  const C = (x: number, y: number): Pt => Hr(x * collarK, y * collarK + (collarK - 1) * 10);
  return {
    collar: smooth([C(-2, 32), C(-18, 28), C(-30, 10), C(-36, -12), C(-40, -30), C(-36, -27), C(-28, -22), C(-20, -8), C(-10, 12), C(4, 28)], 5, true),
    collarIn: smooth([C(-8, 24), C(-20, 20), C(-28, 4), C(-33, -18), C(-26, -16), C(-16, -2), C(-6, 14)], 5, true),
    face: smooth([Hr(-2, -27), Hr(8, -22), Hr(13, -14), Hr(14.5, -9), Hr(12.5, -6), Hr(14, -2), Hr(19, 3), Hr(24, 9), Hr(22, 11.5), Hr(17, 11),
      Hr(16.5, 13.5), Hr(14.5, 15 + jaw * 0.3), Hr(15.5, 17.5 + jaw), Hr(15.5, 22 + jaw), Hr(17.5, 28 + jaw), Hr(12, 31 + jaw), Hr(3, 27 + jaw * 0.5), Hr(-4, 19), Hr(-9, 7), Hr(-11, -7), Hr(-9, -20)], 4, true),
    hair: smooth([Hr(8, -21), Hr(4, -28), Hr(-6, -32), Hr(-17, -29), Hr(-23, -19), Hr(-25, -4), Hr(-29, 10), Hr(-21, 4), Hr(-22, 16), Hr(-15, 6), Hr(-11, -1), Hr(-9, -11), Hr(-3, -16), Hr(3, -18)], 4, true),
    ear: smooth([Hr(-3, 1), Hr(-6, -9), Hr(-15, -17), Hr(-11, -5), Hr(-9, 5), Hr(-4, 6)], 4, true),
  };
}

function drawHead(ink: Pen, Hr: (x: number, y: number) => Pt, jaw: number, open: boolean, collarK: number, collarOver: boolean, seed: number): void {
  const h = headShapes(Hr, jaw, collarK);
  const collar = (): void => {
    ink.form(h.collar, { w: 2.6, seed: seed });
    ink.form(h.collarIn, { tint: 'red', w: 1.3, seed: seed + 1 });
    ink.hatch(h.collarIn, { tint: 'red', angle: 1.3, gap: 3.4, w: 0.8, alpha: 0.6, seed: seed + 2 });
  };
  if (!collarOver) collar();
  ink.form(h.face, { w: 2.5, seed: seed + 5 });
  // the deep eye under a heavy brow, the cheek, lines from the nose, the chin
  ink.hatch(smooth([Hr(4, -9), Hr(12, -7), Hr(11, -1.5), Hr(5, -1)], 4, true), { angle: 1.2, gap: 2.4, w: 0.85, seed: seed + 6 });
  ink.cut(smooth([Hr(2, -12), Hr(9, -10.5), Hr(15, -7)], 3), { w: 1.9, taper: 0.35, seed: seed + 7 });
  ink.dot(...Hr(10, -4.5), 1.5);
  ink.cut(smooth([Hr(-2, 3), Hr(5, 8), Hr(9, 9)], 4), { w: 1.3, seed: seed + 8 });
  ink.cut(smooth([Hr(1, 12), Hr(5, 17), Hr(6, 23)], 4), { w: 1, seed: seed + 9 });
  ink.cut(smooth([Hr(16, 11.5), Hr(13.5, 14), Hr(12.5, 17)], 3), { w: 1, seed: seed + 10 });
  if (open) {
    const mouth = smooth([Hr(16.5, 13.8), Hr(10, 14.5), Hr(9, 18 + jaw * 0.6), Hr(15.5, 17.5 + jaw)], 3, true);
    ink.mask(mouth);
    ink.form([Hr(15, 14), Hr(14.4, 21), Hr(12.8, 14.3)], { w: 0.9, seed: seed + 11 });
    ink.form([Hr(11.8, 14.6), Hr(11.3, 19), Hr(10.2, 15)], { w: 0.8, seed: seed + 12 });
  } else {
    ink.cut(smooth([Hr(9, 14.5), Hr(12.5, 15), Hr(16.5, 14)], 3), { w: 1.2, seed: seed + 11 });
    ink.form([Hr(14.8, 14.6), Hr(14.4, 19.5), Hr(12.9, 14.8)], { w: 0.9, seed: seed + 12 });
  }
  ink.form(h.hair, { w: 2.4, seed: seed + 13 });
  for (let i = 0; i < 3; i++) ink.cut(smooth([Hr(5 - i * 3, -23 + i * 2.5), Hr(-8 - i, -28 + i * 4), Hr(-18 + i, -19 + i * 4), Hr(-22 + i * 2, -2 + i * 5)], 5), { w: 1.05, seed: seed + 14 + i });
  ink.form(h.ear, { w: 1.5, seed: seed + 18 });
  if (collarOver) collar();
}

/** the posed Count */
function drawCount(ink: Pen, J0: Joints, x: FigureExtra, bat: boolean): void {
  const s = x.state;
  const md = moveDef(s);
  const inMove = !!md && (s.action === 'attack' || s.action === 'charge');
  const f = s.actionFrame;
  const lose = s.action === 'lose';
  // turned away in defeat: the whole figure mirrored about the hip, facing back
  const J: Joints = lose ? mirrorJ(J0) : J0;
  const fwd = lose ? -1 : 1;

  // ---- the cloak's open state for this frame ----
  let oF = 0, oB = 0, extF = 0, extB = 0, armsWide = 0, armsUp = 0, jaw = 0, wrap = 0, headBack = 0;
  if (inMove && md && s.move) {
    const o = OPEN[s.move] ?? [0, 0, 0, 0];
    const e = envelope(md, f, s.action === 'charge');
    oF = o[0] * e; oB = o[1] * e; extF = o[2] * e; extB = o[3] * e;
    if (s.move === 'special') { armsWide = e; jaw = 7 * c01((f - md.startup + 2) / 3) * (1 - c01((f - md.startup - md.active) / 6)); headBack = 0.3 * e; }
    if (s.move === 'upsmash') { jaw = 5 * e; armsUp = e; }
  } else if (s.action === 'holding' && md) {
    oF = 0.5; oB = 0.3;
  }
  if (s.action === 'win') { const e = ease(f / 16); oF = e; oB = e; extF = 25 * e; extB = 25 * e; armsWide = e; headBack = 0.2 * e; jaw = 4 * e; }
  if (s.action === 'shield' || s.action === 'shieldstun') wrap = 1;
  if (s.action === 'hitstun') { const k = s.tumble ? 0.5 : 0.35; oF = Math.max(oF, k); oB = Math.max(oB, k); }
  if (s.action === 'helpless' || (s.action === 'fall' && s.vy < -0.05)) { oF = Math.max(oF, 0.15); oB = Math.max(oB, 0.2); }

  // ---- arms: Bat Swarm and the win throw both arms up and wide (the sheet's open pose) ----
  let { handF: hF, elbowF: eF, handB: hB, elbowB: eB } = J;
  // standing about: the front claw raised at the chest, not hanging out in front
  const rest = s.action === 'idle' || s.action === 'respawn' ? 1 : s.action === 'entrance' ? c01((f - 10) / 10) : 0;
  if (rest > 0.01 && armsWide <= 0.01) {
    const sway: Pt = [Math.sin(x.t * 1.3) * 2, Math.sin(x.t * 2.1) * 1.5];
    const tF = mix(J.handF, add(add(J.shoulderF, [fwd * ARM * 0.36, ARM * 0.36]), sway), rest);
    [eF, hF] = ik2(J.shoulderF, tF, BUILD.arm[0], BUILD.arm[1], [-0.4 * fwd, 1]);
  }
  if (armsWide > 0.01) {
    const tF = mix(J.handF, add(J.shoulderF, dirA(-0.95), ARM * 0.93), armsWide);
    const tB = mix(J.handB, add(J.shoulderB, dirA(-2.3), ARM * 0.93), armsWide);
    [eF, hF] = ik2(J.shoulderF, tF, BUILD.arm[0], BUILD.arm[1], [0.3, 1]);
    [eB, hB] = ik2(J.shoulderB, tB, BUILD.arm[0], BUILD.arm[1], [-0.3, 1]);
  }

  if (armsUp > 0.01) {
    // Spire Rise: both claws up, the back one out behind so the cloak opens in a V
    const tB = mix(J.handB, add(J.shoulderB, dirA(-2.05), ARM * 0.95), armsUp);
    [eB, hB] = ik2(J.shoulderB, tB, BUILD.arm[0], BUILD.arm[1], [-0.5, 1]);
  }
  // a wing only opens as far as its hand is out from the body
  const reach = (h: Pt): number => c01((Math.hypot(h[0] - J.chest[0], h[1] - J.chest[1]) - 30) / 50);
  oF *= reach(hF); oB *= reach(hB);

  // ---- the body frame ----
  const hip = J.hip, neck = J.neck, chest = J.chest;
  const u = unit(sub(neck, hip));
  const n: Pt = [-u[1] * fwd, u[0] * fwd]; // forward across the spine
  const sF = J.shoulderF, sB = J.shoulderB;
  const spin = J.spin || 0;
  // the world floor and the world's sideways, in local (unspun) units
  const wDown: Pt = [Math.sin(spin), Math.cos(spin)];
  const g = unit(add(mix([-u[0], -u[1]], wDown, 0.4), [0, 0]));
  let gf: Pt = [g[1], -g[0]];
  if (gf[0] * n[0] + gf[1] * n[1] < 0) gf = [-gf[0], -gf[1]];
  // cloth drag: against the motion; falling lifts and spreads the hem; a launch flings it
  const facing = s.facing || 1;
  const vxl = (x.drag * facing) / 6000; // m/tick, + = the way it faces
  let dvW: Pt = [clamp(-vxl / 0.15, -1.4, 1.4) * 30, clamp(s.vy / 0.12, -1, 1) * 26];
  const flare = !s.grounded ? c01(-s.vy / 0.14) : 0;
  if (s.action === 'hitstun') {
    const kx = s.kbx * facing, ky = -s.kby, kl = Math.hypot(kx, ky);
    if (kl > 1e-4) dvW = add(dvW, [-(kx / kl) * 34, -(ky / kl) * 34]);
  }
  if (lose) dvW = [-dvW[0], dvW[1]];
  const dv: Pt = [dvW[0] * Math.cos(spin) + dvW[1] * Math.sin(spin), -dvW[0] * Math.sin(spin) + dvW[1] * Math.cos(spin)];
  const flut = Math.sin(x.t * 8.1) * c01(len(dvW) / 30) * 4;
  const floorY = s.grounded && Math.abs(spin) < 0.01 ? -2 : 1e9;
  const onFloor = (p: Pt): Pt => [p[0], Math.min(p[1], floorY)];

  // ---- the cloak: shared hem and edges ----
  const Lc = 150;
  const HC = add(neck, g, Lc);
  const HFc = onFloor(add(add(add(HC, gf, 26 + flare * 16 + wrap * 26), g, -8 - flare * 10), dv, 0.6));
  const HM = onFloor(add(add(add(HC, gf, -8), g, 2), dv, 0.8));
  const HB = onFloor(add(add(add(HC, gf, -(80 + flare * 34)), g, -10 - flare * 18), add(dv, [flut, flut * 0.5]), 1.15));
  const hf1 = onFloor(add(mix(HFc, HM, 0.5), g, 7));
  const hb1 = onFloor(add(add(mix(HB, HM, 0.5), g, 7), dv, 0.05));
  const BE0 = add(add(neck, n, -12), u, 3);
  const BE1 = add(sB, n, -11);
  const BE2 = add(add(mix(sB, HB, 0.45), n, -20 - flare * 8), dv, 0.45);
  const FE0 = add(add(neck, n, 2 + wrap * 8), u, -6);
  const FE1 = add(chest, n, -9 + wrap * 30);
  const FE2 = add(add(hip, n, -9 + wrap * 32), dv, 0.25);

  /** a wing: leading edge along the arm (s, e, h, tip), outline down to the hem, home along `ret` */
  const wing = (o: number, sh: Pt, el: Pt, hd: Pt, ext: number, start: Pt, closedOut: Pt[], closedDepth: number[], ret: Pt[], openDepth: number): { poly: Pt[]; tip: Pt; outline: Pt[]; lead: Pt[] } => {
    const fa = unit(sub(hd, el));
    const tipOpen = add(add(hd, fa, ext + 6), [0, -6]);
    const lead = [mix(start, sh, o), mix(start, el, o), mix(start, hd, o), mix(start, tipOpen, o)];
    const tip = lead[3]!;
    // open: the trailing edge hangs from the tip down to the hem middle, bowed out and down
    const open: Pt[] = [];
    const span = sub(HM, tipOpen), sl = len(span);
    let out: Pt = [-span[1] / (sl || 1), span[0] / (sl || 1)];
    const away = sub(tipOpen, chest);
    if (out[0] * away[0] + out[1] * away[1] < 0) out = [-out[0], -out[1]];
    out = unit(add(out, [0, 0.6]));
    for (let k = 1; k <= 5; k++) { const t = k / 5; open.push(onFloor(add(mix(tipOpen, HM, t), out, sl * 0.2 * Math.sin(PI * t) + (h01(k * 5.1) - 0.5) * 6))); }
    open[4] = HM;
    const outline = [tip].concat(mixArr(closedOut, open, o));
    const depths = closedDepth.map((d) => d + (openDepth - d) * o);
    const inside = mix(chest, lead[2]!, 0.5 * o);
    const edge = scallops(outline, depths, inside, 6);
    const leadS = smooth(lead, 4);
    const poly = leadS.slice(0, -1).concat(edge, smooth(ret, 4).slice(1));
    return { poly, tip, outline, lead };
  };

  // the back wing: closed it is the drape behind; open it is the far wing, seen from inside (red)
  const back = wing(oB, add(sB, n, -4), eB, hB, extB, BE0, [BE1, BE2, HB, hb1, HM], [0, 0, 0, 11, 11],
    [HM, add(hip, n, -2), add(chest, n, -4), add(neck, n, -4), BE0], 13);
  // the front wing: closed it is the near side, its front edge lined; open it follows the front arm
  const frontRetClosed: Pt[] = [HM, hb1, HB, BE2, BE1, BE0];
  const frontRetOpen: Pt[] = [HM, add(mix(HM, hip, 0.5), n, -4), add(hip, n, -6), add(mix(hip, chest, 0.5), n, -7), add(chest, n, -8), add(neck, n, -6)];
  const front = wing(oF, add(sF, n, 2), eF, hF, extF, FE0, [FE1, FE2, HFc, hf1, HM], [0, 0, 0, 10, 10],
    mixArr(frontRetClosed, frontRetOpen, ease(oF * 1.4)), 12);

  // the head: the sheet's head units, tilted with the joints, mirrored when turned away
  const tilt = J.headTilt - headBack;
  const ct = Math.cos(tilt) * HK, st = Math.sin(tilt) * HK;
  const head = J.head;
  const Hr = (hx: number, hy: number): Pt => [head[0] + fwd * (hx * ct - hy * st), head[1] + hx * st + hy * ct];

  const legB = tube([add(hip, n, -3), J.kneeB, add(J.footB, unit(sub(J.kneeB, J.footB)), 11)], 7, 4.8, 4);
  const legF = tube([add(hip, n, 3), J.kneeF, add(J.footF, unit(sub(J.kneeF, J.footF)), 11)], 7.2, 5, 4);

  // ---- Mist Step: breaking up into drifting strokes before the blink, re-forming after ----
  let ghost = 0;
  let ghostAfter: (() => void) | null = null;
  if (inMove && md && s.move === 'special2') {
    const bf = blinkFrame(md);
    if (f < bf) ghost = ease((f - 2) / Math.max(1, bf - 2.5));
    else ghost = 1 - ease((f - bf - 1) / 5); // hold the re-form a few frames so it reads
  }
  if (ghost > 0.02) {
    if (ghost > 0.96) return;
    const hs = headShapes(Hr, 0, 1);
    const sh = { backWing: back.poly, frontWing: front.poly, face: hs.face, hair: hs.hair, collar: hs.collar, legF, legB };
    if (ghost > 0.4) { drawGhost(ink, sh, ghost, hip); return; }
    ghostAfter = (): void => drawGhost(ink, sh, 0.25 + ghost, hip);
  }
  if (bat) return;

  // ================================ the drawing, back to front ================================
  // the back arm in its sleeve, and the claw: inside a closed cloak (only what sticks out shows), over an open one
  const backArm = (): void => {
    const backOut = (hB[0] - chest[0]) * n[0] + (hB[1] - chest[1]) * n[1];
    if (wrap < 0.5 && (oB > 0.15 || backOut > 24 || backOut < -30 || s.action === 'hitstun' || !s.grounded)) {
      const slB = tube([sB, eB, add(hB, unit(sub(eB, hB)), 3)], 6.2, 5.2, 4);
      ink.form(slB, { w: 2, seed: 41 });
      ink.hatch(slB, { angle: 0.9, gap: 3.6, w: 0.9, seed: 42 });
      claw(ink, hB, Math.atan2(hB[1] - eB[1], hB[0] - eB[0]), 43, { k: 0.85, side: fwd, curl: 0.5, spread: 0.7 + armsWide * 0.3 });
    }
  };
  // 1. the back wing (the back arm under it while it is closed)
  if (oB <= 0.3) backArm();
  ink.form(back.poly, { w: 3, seed: 21 });
  if (oB > 0.3) {
    // the red inside of the far wing, set in from its edge, and the bones fanning from the hand
    const c = mix(chest, back.lead[2]!, 0.45);
    const k = 0.1 + 0.45 * (1 - c01((oB - 0.3) / 0.6));
    ink.form(back.poly.map((p) => mix(p, c, k)), { tint: 'red', w: 1.5, seed: 22 });
  } else {
    ink.hatch(back.poly, { angle: 1.15, gap: 4.4, w: 1, seed: 23 });
  }
  for (let i = 0; i < 3; i++) {
    const end = back.outline[1 + i * 2]!;
    const st0 = mix(mix(BE0, BE1, 0.3 + i * 0.3), back.lead[2]!, oB);
    ink.cut(smooth([st0, add(mix(st0, end, 0.5), n, -4 * (1 - oB)), end], 6), { w: 1.4, seed: 24 + i });
  }

  if (oB > 0.3) backArm();

  // 2. the back leg (shaded) and boot
  ink.form(legB, { w: 2, seed: 31 });
  ink.hatch(legB, { angle: 1.1, gap: 3.6, w: 0.9, seed: 32 });
  boot(ink, J.kneeB, J.footB, fwd, 33);

  // 4. the front leg and boot
  ink.form(legF, { w: 2.1, seed: 51 });
  ink.cut(smooth([add(J.kneeF, [-3, -18]), add(J.kneeF, [1, 0]), mix(J.kneeF, J.footF, 0.6)], 4), { w: 1, seed: 52 });
  boot(ink, J.kneeF, J.footF, fwd, 53);

  const frontWing = (): void => {
    ink.form(front.poly, { w: 3, seed: 61 });
    if (s.action === 'charge') ink.hatch(front.poly, { angle: 1.2, gap: 6 - 3 * c01(s.charge / 40), w: 1.1, seed: 62 });
    else if (oF < 0.5) {
      // shade down the back of the near side
      const strip = [HB, BE2, BE1, BE0].concat([mix(BE0, FE0, 0.35), mix(BE1, FE1, 0.4), mix(BE2, FE2, 0.4), mix(HB, HM, 0.55)]);
      ink.hatch(smooth(strip, 3, true), { angle: 1.18, gap: 4.4, w: 1, seed: 63 });
    }
    // folds running down to the points of the hem, like the bones of a wing
    const ends = [front.outline[2]!, front.outline[3]!, front.outline[4]!, mix(HM, hb1, 1 - oF)];
    ends.forEach((end, i) => {
      const st0 = mix(mix(FE0, BE1, 0.12 + i * 0.25), front.lead[2]!, oF);
      ink.cut(smooth([st0, add(mix(st0, end, 0.5), n, (i - 1.5) * 3 * (1 - oF)), end], 6), { w: 1.6 - i * 0.1, seed: 64 + i });
    });
    if (oF < 0.5 && wrap < 0.5) {
      // the red lining turned back along the front edge
      const e = smooth([FE0, FE1, FE2, mix(FE2, HFc, 0.85)], 5);
      ink.form(e.concat(e.slice().reverse().map((p, i): Pt => add(p, n, -2.5 - (i / e.length) * 2.5))), { tint: 'red', w: 1.1, seed: 69 });
    }
  };

  // 5. an open front wing goes behind the body (the sheet's open pose)
  if (oF >= 0.5) frontWing();

  // 6. the body: shirt, the waistcoat in the side's tint, buttons, the ruffle
  {
    const torso = smooth([add(add(neck, n, -9), u, -2), add(neck, n, 9), add(chest, n, 15), add(add(hip, n, 13), u, 4), add(add(hip, n, 12), u, -8), add(add(hip, n, -11), u, -6), add(chest, n, -14)], 5, true);
    ink.form(torso, { w: 2.5, seed: 71 });
    const vest = smooth([add(add(neck, n, -7), u, -10), add(add(neck, n, 5), u, -14), add(add(chest, n, 13.5), u, -2), add(add(hip, n, 11.5), u, 2), add(add(hip, n, 9), u, -10), add(add(hip, n, -10), u, -4), add(chest, n, -12.5)], 5, true);
    ink.form(vest, { tint: x.sideTint, w: 2, seed: 72 });
    for (let i = 0; i < 3; i++) ink.dot(...add(mix(add(chest, n, 10), add(hip, n, 9), 0.1 + i * 0.32), u, 0), 1.4);
    ink.cut(smooth([add(add(neck, n, 2), u, -2), add(add(neck, n, 7), u, -9), add(add(chest, n, 9), u, 6)], 3), { w: 1, seed: 73 });
  }

  // 7. a closed front wing is the near side of the cloak, over the body
  if (oF < 0.5) frontWing();

  // 8. the front arm: in its sleeve with the claw out, or (wrapped) one claw holding the cloak shut
  if (wrap >= 0.5) {
    const at = add(FE1, n, 2);
    claw(ink, add(at, n, 4), fwd > 0 ? PI * 0.86 : PI * 0.14, 81, { k: 0.95, side: -fwd, curl: 0.55, spread: 0.7 });
  } else {
    const slF = tube([sF, eF, add(hF, unit(sub(eF, hF)), 3)], 6.6, 5.4, 4);
    ink.form(slF, { w: 2.2, seed: 81 });
    ink.cut(smooth([add(eF, [-7, 4]), add(eF, [0, 1]), add(eF, [5, 6])], 3), { w: 1, seed: 82 });
    claw(ink, hF, Math.atan2(hF[1] - eF[1], hF[0] - eF[0]), 83, { k: 0.95, side: -fwd, curl: 0.45 + 0.1 * oF, spread: 0.7 + armsWide * 0.3 });
  }

  // 9. collar, neck, head
  ink.form(tube([add(neck, u, -2), Hr(1, 22)], 6, 6), { w: 2, seed: 91 });
  drawHead(ink, Hr, jaw, jaw > 2, lose ? 1.3 : 1, lose, 100);
  if (ghostAfter) ghostAfter();
}

function mirrorJ(J: Joints): Joints {
  const hx = J.hip[0];
  const m = (p: Pt): Pt => [2 * hx - p[0], p[1]];
  return {
    ...J, hip: m(J.hip), chest: m(J.chest), neck: m(J.neck), head: m(J.head), shoulderF: m(J.shoulderF), elbowF: m(J.elbowF), handF: m(J.handF),
    shoulderB: m(J.shoulderB), elbowB: m(J.elbowB), handB: m(J.handB), kneeF: m(J.kneeF), footF: m(J.footF), kneeB: m(J.kneeB), footB: m(J.footB),
    headTilt: J.headTilt, lean: -J.lean,
  };
}

/** the figure coming apart: its outlines as broken pen strokes drifting off and fading */
function drawGhost(ink: Pen, sh: Shapes, k: number, hip: Pt): void {
  const polys: [Pt[], number][] = [[sh.backWing, 4], [sh.frontWing, 4], [sh.collar, 2], [sh.face, 2], [sh.hair, 1], [sh.legF, 1], [sh.legB, 1]];
  let seed = 300;
  for (const [poly, parts] of polys) {
    const n = poly.length;
    for (let i = 0; i < parts; i++, seed++) {
      const a = Math.floor((i / parts) * n), b = Math.floor(((i + 0.75) / parts) * n);
      const seg = poly.slice(a, Math.max(a + 2, b));
      const c = seg[Math.floor(seg.length / 2)]!;
      const away = unit(sub(c, add(hip, [0, -40])));
      const drift: Pt = [away[0] * 30 * k + (h01(seed * 1.3) - 0.5) * 40 * k, away[1] * 18 * k - (16 + h01(seed * 2.7) * 34) * k];
      ink.line(seg.map((p) => add(mix(p, c, 0.35 * k), drift)), { w: 6.5 - 3.5 * k, taper: 0.85, alpha: Math.max(0.15, 1 - k * 0.7), seed });
    }
  }
}

/** Bat Form: the whole figure folded into one great bat, cloak-cream, red under the wings */
function drawBigBat(ink: Pen, J: Joints, x: FigureExtra): void {
  const f = x.state.actionFrame;
  const c = add(mix(J.hip, J.neck, 0.6), [0, -10]);
  const ph = Math.sin(f * 0.62 + 0.4);
  const S = 114; // half-span: wingspan about his height
  const P = (p: Pt): Pt => [c[0] + p[0] * S, c[1] + p[1] * S];
  const { all, right } = batShape(ph);
  ink.form(all.map(P), { w: 3, seed: 201 });
  // the red under each wing, set in from the edge (more of it shows on the up-beat)
  const wingR = right.slice(5, right.length - 2);
  const k = 0.42 - 0.1 * ph;
  for (const sx of [1, -1]) {
    const pts = wingR.map(([px, py]): Pt => mix(P([px * sx, py]), P([0.2 * sx, -0.12]), k));
    ink.form(pts.concat([P([0.18 * sx, -0.05]), P([0.2 * sx, -0.22 - 0.1 * ph])]), { tint: 'red', w: 1.3, seed: 202 + (sx > 0 ? 0 : 1) });
  }
  // the wing bones from the wrist to each point
  for (const sx of [1, -1]) {
    const wr = P([0.52 * sx, -0.4 - 0.32 * ph]);
    for (const t of [[1.0, -0.22 - 0.6 * ph], [0.76, 0.14 - 0.42 * ph], [0.46, 0.28 - 0.18 * ph]] as Pt[]) ink.cut([wr, P([t[0] * sx, t[1]])], { w: 1.4, taper: 0.7, seed: 205 + Math.round(t[0] * 10) + (sx > 0 ? 0 : 20) });
  }
  // body and head: ears, the fin of the collar behind, eyes, fangs
  ink.form(smooth([P([0, -0.42]), P([0.1, -0.3]), P([0.12, -0.05]), P([0.08, 0.3]), P([0, 0.38]), P([-0.08, 0.3]), P([-0.12, -0.05]), P([-0.1, -0.3])], 4, true), { w: 2, seed: 230 });
  ink.form([P([0.04, -0.33]), P([0.12, -0.52]), P([0.11, -0.3])], { w: 1.2, seed: 231 });
  ink.form([P([-0.04, -0.33]), P([-0.12, -0.52]), P([-0.11, -0.3])], { w: 1.2, seed: 232 });
  ink.dot(...P([0.04, -0.27]), 2);
  ink.dot(...P([-0.04, -0.27]), 2);
  ink.form([P([0.025, -0.2]), P([0.015, -0.13]), P([0.005, -0.2])], { w: 0.8, seed: 233 });
  ink.form([P([-0.025, -0.2]), P([-0.015, -0.13]), P([-0.005, -0.2])], { w: 0.8, seed: 234 });
}

function isBat(s: FighterState): boolean {
  if (s.action !== 'attack' || s.move !== 'recover') return false;
  const md = moveDef(s);
  if (!md) return false;
  return s.actionFrame > md.startup && s.actionFrame <= md.startup + md.active;
}

export const COUNT: CharacterDef = {
  id: 'gantry',
  build: BUILD,
  anims: {
    jab: { anim: 'jab' }, tilt: { anim: 'swingSide' }, uptilt: { anim: 'swingUp' }, dash: { anim: 'thrust' },
    smash: { anim: 'swingSide' }, upsmash: { anim: 'castUp', hand: 'both' },
    nair: { anim: 'spin' }, fair: { anim: 'swingOver', hand: 'both' }, bair: { anim: 'swingSide', hand: 'B' }, uair: { anim: 'swingUp' }, dair: { anim: 'cast', hand: 'both' },
    grab: { anim: 'reach', hand: 'both' }, throwf: { anim: 'throwObj', hand: 'both' }, throwb: { anim: 'throwObj', hand: 'both' }, throwu: { anim: 'throwObj', hand: 'both' },
    special: { anim: 'castUp' }, special2: { anim: 'swingSide' }, recover: { anim: 'leap' },
  },
  draw(ink, J, x) {
    const bat = isBat(x.state);
    if (bat) { drawBigBat(ink, J, x); return; }
    drawCount(ink, J, x, false);
  },
  drawProjectile(ink: Pen, p: Projectile, t: number) {
    // a small swarm: a lead bat about 0.9 m across, two smaller ones trailing behind it above and
    // below, flutter strokes behind; a spent one (cd 1) thins to a single faint bat
    const spent = (p as Projectile & { cd?: number }).cd === 1;
    const sy = p.vx < 0 ? -1 : 1; // the stage turns the picture to the travel: keep the bats upright
    const rot = 0.22;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const bat = (ox: number, oy: number, S: number, ph: number): Pt[] =>
      batShape(ph).all.map(([bx, by]): Pt => {
        const X = bx * S, Y = (by + 0.05) * S;
        return [ox + X * cr - Y * sr, (oy + X * sr + Y * cr) * sy];
      });
    const seed = 400 + (p.id % 40) * 5;
    if (spent) {
      ink.line(bat(0, 0, 30, Math.sin(t * 15 + p.id * 1.7)), { closed: true, w: 1.4, alpha: 0.4, seed });
      return;
    }
    // flutter strokes: short wavering dashes streaming off the back
    for (let i = 0; i < 3; i++) {
      const y = (i - 1) * 22 + Math.sin(t * 9 + i * 2.1) * 4;
      const x0 = -62 - i * 14;
      const pts: Pt[] = [];
      for (let j = 0; j <= 4; j++) pts.push([x0 - j * 13, (y + Math.sin(t * 14 + j * 1.3 + i) * 4) * sy]);
      ink.line(pts, { w: 2.4 - i * 0.4, taper: 0.9, alpha: 0.75, seed: seed + 10 + i });
    }
    ink.form(bat(-52, -30, 24, Math.sin(t * 21 + p.id * 1.7 + 2.1)), { w: 1.2, seed: seed + 1 });
    ink.form(bat(-46, 30, 21, Math.sin(t * 23 + p.id * 1.7 + 4.2)), { w: 1.2, seed: seed + 2 });
    const lead = bat(0, 0, 45, Math.sin(t * 19 + p.id * 1.7));
    ink.form(lead, { w: 1.8, seed });
    // the red of the cloak lining under the lead bat's body
    ink.form(bat(0, 0, 14, 0).map(([x, y]): Pt => [x, y + 6 * sy]), { tint: 'red', w: 1, seed: seed + 3 });
  },
  portrait(ink, t) {
    void t;
    // shoulders in the cloak, the waistcoat V, then the collar and head
    ink.form(smooth([[-52, 54], [-46, 20], [-24, 2], [0, -2], [24, 4], [44, 22], [50, 54]], 5, true), { w: 2.6, seed: 501 });
    ink.hatch(smooth([[-52, 54], [-46, 20], [-24, 2], [-12, 20], [-20, 54]], 4, true), { angle: 1.15, gap: 4, w: 1, seed: 502 });
    ink.form(smooth([[4, 4], [20, 6], [26, 54], [8, 54]], 3, true), { tint: 'red', w: 1.4, seed: 503 });
    const head: Pt = [2, -18];
    const Hr = (hx: number, hy: number): Pt => [head[0] + hx * 1.25, head[1] + hy * 1.25];
    ink.form(tube([[4, 6], Hr(1, 22)], 7, 7), { w: 2, seed: 504 });
    drawHead(ink, Hr, 0, false, 1, false, 520);
  },
};
