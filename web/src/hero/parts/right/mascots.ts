// The mascot pair on the couch: two small invented creatures that stand for the viewers. Three candidate
// pairs live here so the choice can be made on the real scene (?mascot=1, 2 or 3):
//   1  Tuners     smooth gumdrop bodies with a pair of rabbit-ear antennae like the old TV's, big eyes
//   2  Lop-ears   bean-shaped critters whose long ears do the acting, dark bodies in white ink
//   3  Puffs      popcorn puffs sitting in a golden hull, pale and lumpy
// In every pair the one on the left is the bigger, steadier one: it points at the TV, waves, turns to its
// friend and laughs. The one on the right is the small excitable one: it bounces, throws its arms up, wiggles
// and leans in to its friend. Both breathe, blink, gasp together and look at each other.
//
// Line: one pen, the same three weights as the TV (silhouette 3, form 2, face and small marks 1.3). Each
// creature is ONE silhouette: all its parts are stroked first and filled after, so the heavy line only runs
// round the outside. Fills are flat. Nothing is drawn with ctx.scale, so squash and stretch never changes a
// line's weight.
// Motion: a 40 s acting loop of held poses (every track starts and ends at rest) with breathing, blinks and
// bounces on top as continuous functions of t, so there is no jump anywhere.
import { GOLD, INK, ORANGE, PAPER } from '../../engine/layout';
import type { Pt } from '../../engine/types';
import { type C2, TAU, ell, ink, lerp, limb, mixc, mod, osc, polar, rnd, tone, trace, track } from './kit';

export const M_SIL = 3.0, M_FORM = 2.0, M_DET = 1.3;
const LOOP = 40;

// ---- acting ---------------------------------------------------------------------------------------------
type Keys = readonly (readonly [number, number])[];
// the big one
const K_POINT: Keys = [[0, 0], [2.0, 0], [2.14, -0.1], [2.6, 1], [9.4, 1], [10.0, 0], [18.4, 0], [18.54, -0.1], [19.0, 1], [25.6, 1], [26.2, 0], [35.2, 0], [35.34, -0.1], [35.8, 1], [39.0, 1], [39.6, 0]];
const K_PWAVE: Keys = [[0, 0], [10.2, 0], [10.7, 1], [13.0, 1], [13.6, 0], [26.6, 0], [27.1, 1], [29.6, 1], [30.2, 0]];
const K_PGLANCE: Keys = [[0, 0], [13.4, 0], [13.8, 1], [15.6, 1], [16.1, 0], [30.6, 0], [31.0, 1], [33.4, 1], [33.9, 0]];
// both
const K_LAUGH: Keys = [[0, 0], [14.0, 0], [14.25, 1], [15.4, 1], [15.9, 0], [32.4, 0], [32.65, 1], [33.5, 1], [33.9, 0]];
const K_GASP: Keys = [[0, 0], [16.85, 0], [17.15, 1], [18.0, 1], [18.5, 0]];
// the small one
const K_CBOUNCE: Keys = [[0, 0], [3.2, 0], [3.7, 1], [8.6, 1], [9.2, 0], [36.2, 0], [36.7, 0.6], [38.6, 0.6], [39.2, 0]];
const K_CHEER: Keys = [[0, 0], [20.6, 0], [20.75, -0.15], [21.15, 1], [24.6, 1], [25.0, 0]];
const K_WIGGLE: Keys = [[0, 0], [25.0, 0], [25.4, 1], [27.6, 1], [28.1, 0]];
const K_LEANIN: Keys = [[0, 0], [30.6, 0], [31.2, 1], [33.2, 1], [33.9, 0]];
const K_TALK: Keys = [[0, 0], [31.2, 0], [31.4, 1], [32.4, 1], [32.6, 0]];
const K_CGLANCE: Keys = [[0, 0], [13.6, 0], [14.0, 1], [15.6, 1], [16.1, 0]];

/** 0..1: how closed the eyes are (a quick blink at an uneven beat) */
function blink(t: number, period: number, seed: number): number {
  const k = Math.floor(t / period);
  const start = k * period + 0.3 + rnd(k * 3.7 + seed) * (period - 0.8);
  const x = (t - start) / 0.16;
  return x > 0 && x < 1 ? Math.sin(x * Math.PI) : 0;
}

/** everything a creature is doing at one moment; angles in canvas radians (0 right, PI left, negative up) */
interface Act {
  hop: number; sq: number; lean: number; dx: number;
  gx: number; gy: number; blink: number; joy: number; wide: number; mouth: number;
  la: number; le: number; ra: number; re: number;
  perk: number; sweep: number; kick: number;
}
const L_REST = Math.PI * 0.7, R_REST = Math.PI * 0.3, E_REST = 0.42;

function actBig(t: number): Act {
  const u = mod(t, LOOP);
  const point = track(u, K_POINT), wave = track(u, K_PWAVE), glance = track(u, K_PGLANCE);
  const laugh = track(u, K_LAUGH, 0), gasp = track(u, K_GASP, 1.4);
  const pt = Math.max(0, point), dip = Math.min(0, point);
  const jab = Math.sin(t * 5.2);
  const wv = Math.sin(t * 8.5);
  return {
    hop: 4.5 * laugh * Math.abs(Math.sin(t * 10.5)) + 5 * wave * Math.abs(Math.sin(t * 4.25)),
    sq: 0.018 * osc(t, 4.1) + dip * 0.6 + 0.025 * pt + 0.06 * gasp + 0.022 * laugh * Math.sin(t * 21),
    lean: -0.1 * pt - 0.04 * wave + 0.03 * wave * wv + 0.09 * glance + 0.014 * osc(t, 6.3) - 0.012 * pt * jab,
    dx: -5 * pt + 4 * glance,
    gx: lerp(-0.9, 0.95, glance) + 0.07 * osc(t, 7.7, 0.6),
    gy: -0.25 * pt - 0.3 * gasp + 0.15 * glance,
    blink: blink(t, 3.7, 1),
    joy: Math.max(laugh, wave * 0.9),
    wide: gasp,
    mouth: Math.max(laugh * 0.9, gasp * 0.7, wave * 0.6, pt * 0.3),
    la: L_REST + pt * (Math.PI + 0.16 + 0.03 * jab - L_REST) + wave * (Math.PI + 1.0 + 0.42 * wv - L_REST) + gasp * 0.5,
    le: E_REST + pt * (0.58 + 0.04 * jab) + wave * 0.5 + gasp * 0.15,
    ra: R_REST - 0.55 * laugh - 0.5 * gasp - 0.25 * wave,
    re: E_REST + 0.2 * laugh + 0.15 * gasp,
    perk: 0.35 + 0.65 * Math.max(pt, gasp, wave) - 0.15 * glance,
    sweep: -0.5 * pt + 0.45 * glance - 0.1 * wave * wv,
    kick: 0.35 * Math.sin(t * 1.9) + 0.6 * laugh * Math.sin(t * 10.5),
  };
}

function actSmall(t: number): Act {
  const u = mod(t, LOOP);
  const bounce = track(u, K_CBOUNCE), cheerRaw = track(u, K_CHEER, 1.6), wig = track(u, K_WIGGLE);
  const leanIn = track(u, K_LEANIN), talk = track(u, K_TALK, 0), glance = track(u, K_CGLANCE);
  const laugh = track(u, K_LAUGH, 0), gasp = track(u, K_GASP, 1.4);
  const cheer = Math.max(0, cheerRaw), dip = Math.min(0, cheerRaw);
  const b1 = Math.abs(Math.sin(t * TAU * 1.3)); // the cheer's bounce
  const b2 = Math.abs(Math.sin(t * TAU * 0.9)); // the smaller excited bounce
  const w = Math.sin(t * 6.2);
  const flap = Math.sin(t * 13);
  return {
    hop: cheer * 30 * b1 + bounce * 13 * b2 + laugh * 5 * Math.abs(Math.sin(t * 10.5)),
    sq: 0.022 * osc(t, 3.3, 1.3) + dip * 0.6 + cheer * (0.13 * b1 - 0.065) + bounce * (0.08 * b2 - 0.04) + 0.07 * gasp,
    lean: -0.2 * leanIn - 0.12 * glance + wig * 0.17 * w + 0.05 * cheer * Math.sin(t * TAU * 0.65) + 0.02 * osc(t, 5.1),
    dx: -9 * leanIn - 4 * glance + wig * 5 * w,
    gx: -0.85 + 0.07 * osc(t, 6.1, 2) + wig * 0.5 * w,
    gy: -0.3 * cheer - 0.3 * gasp - 0.2 * leanIn,
    blink: blink(t, 2.9, 5),
    joy: Math.max(cheer, laugh, wig * 0.9, glance * 0.8),
    wide: gasp,
    mouth: Math.max(cheer, talk * (0.5 + 0.5 * Math.sin(t * 14)), gasp * 0.7, laugh * 0.8, bounce * 0.5),
    la: L_REST + cheer * (Math.PI + 1.15 + 0.2 * flap - L_REST) + bounce * (Math.PI + 0.95 + 0.4 * Math.sin(t * 9) - L_REST)
      + wig * (Math.PI + 0.35 * w - L_REST) + leanIn * (Math.PI + 0.1 + 0.08 * Math.sin(t * 7) - L_REST) + gasp * 0.5,
    le: E_REST + 0.58 * cheer + 0.5 * bounce + 0.4 * wig + 0.4 * leanIn + 0.15 * gasp,
    ra: R_REST + cheer * (-1.15 - 0.2 * Math.sin(t * 13 + 1) - R_REST) + bounce * (-0.5 - R_REST) + wig * (0.35 * w - R_REST) - 0.5 * gasp - 0.6 * talk,
    re: E_REST + 0.58 * cheer + 0.3 * bounce + 0.4 * wig + 0.15 * gasp + 0.2 * talk,
    perk: 0.1 + 0.9 * Math.max(cheer, gasp, bounce * 0.8, wig * 0.6),
    sweep: -0.4 * leanIn + 0.3 * wig * w,
    kick: 0.5 * Math.sin(t * 2.7) + 0.7 * bounce * Math.sin(t * TAU * 0.9) + cheer * 0.7 * Math.sin(t * TAU * 1.3),
  };
}

// ---- drawing helpers --------------------------------------------------------------------------------------
interface Solid { pts: readonly Pt[]; fill: string; smooth?: boolean }

/** several shapes as ONE silhouette: every outline is stroked first, then every fill is laid on top */
function union(c: C2, parts: readonly Solid[], line: string): void {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.lineWidth = M_SIL * 2;
  c.strokeStyle = line;
  for (const p of parts) {
    c.beginPath();
    trace(c, p.pts, true, p.smooth ?? true);
    c.stroke();
  }
  for (const p of parts) {
    c.beginPath();
    trace(c, p.pts, true, p.smooth ?? true);
    c.fillStyle = p.fill;
    c.fill();
  }
}

/** a stubby arm: a rounded nub from the shoulder s, pointing along `ang` */
function nub(s: Pt, ang: number, len: number, w: number): Pt[] {
  const root = polar(s, ang, -w * 0.6);
  return limb([root, polar(s, ang, len * 0.5), polar(s, ang, len)], [w * 1.1, w, w * 0.82], 8);
}

interface EyeStyle { rx: number; ry: number; gap: number; color: string; pupil?: string; mark: string }
/** two eyes about (cx, cy): open ovals (with pupils if the style has them), a happy arch, or a blink line */
function eyes(c: C2, cx: number, cy: number, a: Act, s: EyeStyle): void {
  const shut = Math.max(a.blink, a.joy);
  for (const side of [-1, 1]) {
    // the eye on the side it is looking toward is nearer the edge of the body, so it is narrower
    const lead = side * a.gx > 0 ? 1 - 0.24 * Math.abs(a.gx) : 1;
    const rx = s.rx * lead;
    const x = cx + side * s.gap * (side * a.gx > 0 ? 1 - 0.14 * Math.abs(a.gx) : 1);
    if (shut > 0.72) {
      const arch = 0.35 - 1.35 * Math.max(0, Math.min(1, (a.joy - 0.5) / 0.4)); // a blink: a lid line that sags; joy bends it up into an arch
      ink(c, [[x - rx * 1.05, cy + s.ry * 0.25], [x, cy + s.ry * 0.25 + arch * s.ry * 0.85], [x + rx * 1.05, cy + s.ry * 0.25]], M_FORM, s.mark, 1);
      continue;
    }
    const ry = s.ry * (1 - shut * 0.9) * (1 + 0.14 * a.wide);
    c.beginPath();
    c.ellipse(x, cy, rx, ry, 0, 0, TAU);
    c.fillStyle = s.color;
    c.fill();
    if (s.pupil) {
      const pr = Math.min(rx, ry) * (0.56 - 0.12 * a.wide);
      c.beginPath();
      c.arc(x + a.gx * (rx - pr) * 0.8, cy + a.gy * (ry - pr) * 0.9, pr, 0, TAU);
      c.fillStyle = s.pupil;
      c.fill();
    }
  }
}

/** a small smile that opens into a round laugh */
function mouthAt(c: C2, x: number, y: number, w: number, open: number, line: string, inside: string | null): void {
  if (open < 0.18) {
    ink(c, [[x - w, y - w * 0.15], [x, y + w * 0.35], [x + w, y - w * 0.15]], M_DET, line, 1);
    return;
  }
  const h = w * (0.5 + 1.1 * open);
  const pts: Pt[] = [[x - w * 1.1, y - w * 0.1], [x, y - w * 0.3], [x + w * 1.1, y - w * 0.1], [x + w * 0.75, y + h * 0.7], [x, y + h], [x - w * 0.75, y + h * 0.7]];
  c.beginPath();
  trace(c, pts, true, true);
  if (inside) {
    c.fillStyle = inside;
    c.fill();
  }
  if (line !== inside) {
    c.lineWidth = M_DET;
    c.strokeStyle = line;
    c.stroke();
  }
}

// ---- the three kinds ------------------------------------------------------------------------------------
export interface Mascot {
  kind: 1 | 2 | 3;
  w: number; h: number;
  line: string; fill: string;
  /** antenna length (kind 1), ear length (kind 2), unused (kind 3) */
  top: number;
  /** how the ears or antennae sit when nothing is happening: 0 flopped, 1 upright */
  alert: number;
  arm: number; armW: number;
  seed: number;
}

interface Frame { a: Act; lagY: number; lagL: number; hw: number; h: number; P: (x: number, y: number) => Pt }

function arms(m: Mascot, f: Frame, ax: number, ay: number): [Pt[], Pt[]] {
  const { a, P } = f;
  return [nub(P(-ax, ay), a.la, m.arm * a.le, m.armW), nub(P(ax, ay), a.ra, m.arm * a.re, m.armW)];
}

function feet(f: Frame, x0: number, x1: number, y: number, r: number): [Pt[], Pt[]] {
  const { a, P } = f;
  const p0 = P(x0, y), p1 = P(x1, y);
  return [ell(p0[0] - a.kick * 2.5, p0[1] + a.kick * 2, r * 1.15, r, 14, -0.25), ell(p1[0] + a.kick * 2.5, p1[1] - a.kick * 2, r * 1.15, r, 14, -0.25)];
}

// 1: Tuners. A gumdrop with two antennae like the TV's rabbit ears; white eyes with pupils.
const GUMDROP: readonly Pt[] = [[0, -1], [0.5, -0.93], [0.86, -0.69], [1, -0.35], [0.95, -0.07], [0.6, 0.03], [0, 0.045], [-0.6, 0.03], [-0.95, -0.07], [-1, -0.35], [-0.86, -0.69], [-0.5, -0.93]];
function tuner(c: C2, m: Mascot, f: Frame): void {
  const { a, P, hw, h } = f;
  const body = GUMDROP.map(([x, y]) => P(x, y));
  const [la, ra] = arms(m, f, 0.84, -0.4);
  const [f0, f1] = feet(f, -0.56, 0.02, 0.05, m.w * 0.105);
  const dark = tone(m.line, 0.06);
  // the aerial first, so the body covers its foot: two straight rods from one base, like the TV's rabbit ears
  const face = a.gx * 0.2 * hw;
  const root = P(a.gx * 0.1, -0.97);
  const up = lerp(m.alert, 1, Math.max(0, a.perk));
  for (const side of [-1, 1]) {
    const ang = side * lerp(0.92, 0.36, up) + a.sweep * 0.5 + f.lagL * 7 + side * f.lagY * 0.012;
    const len = m.top * (side < 0 ? 1 : 0.84);
    const tip: Pt = [root[0] + Math.sin(ang) * len, root[1] - Math.cos(ang) * len];
    const mid: Pt = [root[0] + Math.sin(ang - f.lagL * 3) * len * 0.5, root[1] - Math.cos(ang - f.lagL * 3) * len * 0.5];
    ink(c, [root, mid, tip], M_FORM + 0.4, m.line, 1);
    c.beginPath();
    c.arc(tip[0], tip[1], m.w * 0.05, 0, TAU);
    c.fillStyle = m.line;
    c.fill();
  }
  union(c, [{ pts: la, fill: m.fill, smooth: false }, { pts: ra, fill: m.fill, smooth: false }, { pts: body, fill: m.fill }], m.line);
  for (const ft of [f0, f1]) {
    c.beginPath();
    trace(c, ft, true, true);
    c.fillStyle = tone(m.line, 0.5);
    c.fill();
    c.lineWidth = M_FORM;
    c.strokeStyle = m.line;
    c.stroke();
  }
  const ey = (-0.57 + a.gy * 0.05) * h * (1 + a.sq);
  eyes(c, face, ey, a, { rx: hw * 0.2, ry: h * 0.125, gap: hw * 0.3, color: tone(INK, 0.97), pupil: dark, mark: tone(INK, 0.97) });
  mouthAt(c, face + a.gx * hw * 0.04, ey + h * 0.2, hw * 0.1, a.mouth, m.line, dark);
}

// 2: Lop-ears. A bean with long ears that rise, flop and sweep; bright eyes on a dark body.
const BEAN: readonly Pt[] = [[0, -1], [0.44, -0.95], [0.74, -0.76], [0.86, -0.5], [0.98, -0.24], [0.9, -0.03], [0.55, 0.04], [0, 0.05], [-0.55, 0.04], [-0.9, -0.03], [-0.98, -0.24], [-0.86, -0.5], [-0.74, -0.76], [-0.44, -0.95]];
function lop(c: C2, m: Mascot, f: Frame): void {
  const { a, P, hw, h } = f;
  const body = BEAN.map(([x, y]) => P(x, y));
  const [la, ra] = arms(m, f, 0.8, -0.36);
  const [f0, f1] = feet(f, -0.52, 0.04, 0.05, m.w * 0.1);
  const up = lerp(m.alert, 1, Math.max(0, a.perk));
  const ears: Pt[][] = [];
  const spines: Pt[][] = [];
  const N = 7;
  const ew = m.w * 0.24;
  for (const side of [1, -1]) {
    const root = P(side * 0.36 + a.gx * 0.06, -0.86);
    let ang = -Math.PI / 2 + side * 0.14 + a.sweep * 0.45;
    const bend = (side * lerp(2.5, 0.12, up) + a.sweep * (0.25 + 0.65 * up) + f.lagL * 9 + side * f.lagY * 0.035) / (N - 1);
    const spine: Pt[] = [polar(root, ang, -6)];
    let p: Pt = root;
    for (let i = 0; i < N; i++) {
      p = polar(p, ang, m.top / N);
      spine.push(p);
      ang += bend * (i < 1 ? 0.4 : 1.1);
    }
    spines.push(spine);
    ears.push(limb(spine, [ew * 0.7, ew * 0.8, ew * 0.95, ew, ew, ew * 0.92, ew * 0.78, ew * 0.56], 8));
  }
  const tail = P(0.86, -0.12);
  union(c, [
    { pts: ell(tail[0], tail[1], m.w * 0.13, m.w * 0.13, 14), fill: m.fill },
    { pts: ears[0]!, fill: m.fill, smooth: false }, { pts: ears[1]!, fill: m.fill, smooth: false },
    { pts: la, fill: m.fill, smooth: false }, { pts: ra, fill: m.fill, smooth: false },
    { pts: body, fill: m.fill },
  ], m.line);
  // the inside of each ear: one flat stripe
  for (const sp of spines) ink(c, sp.slice(2, N), ew * 0.36, tone(m.line, 0.46), 1);
  for (const ft of [f0, f1]) {
    c.beginPath();
    trace(c, ft, true, true);
    c.fillStyle = tone(m.line, 0.46);
    c.fill();
    c.lineWidth = M_FORM;
    c.strokeStyle = m.line;
    c.stroke();
  }
  const face = a.gx * 0.24 * hw;
  const ey = (-0.6 + a.gy * 0.05) * h * (1 + a.sq);
  eyes(c, face, ey, a, { rx: hw * 0.105, ry: h * 0.085, gap: hw * 0.3, color: m.line, mark: m.line });
  mouthAt(c, face + a.gx * hw * 0.05, ey + h * 0.15, hw * 0.085, a.mouth, m.line, PAPER);
}

// 3: Puffs. A piece of popcorn: pale lobes sitting in a golden hull, dot eyes.
const LOBES_BIG: readonly (readonly [number, number, number])[] = [[-0.5, -0.36, 0.5], [0.5, -0.38, 0.5], [0.02, -0.46, 0.62], [-0.36, -0.7, 0.44], [0.4, -0.68, 0.42], [0.03, -0.82, 0.4]];
const LOBES_SMALL: readonly (readonly [number, number, number])[] = [[-0.48, -0.4, 0.52], [0.5, -0.42, 0.5], [0, -0.5, 0.62], [-0.22, -0.8, 0.44], [0.36, -0.74, 0.4]];
const HULL: readonly Pt[] = [[-0.8, -0.34], [-0.7, -0.1], [-0.4, 0.04], [0, 0.07], [0.4, 0.04], [0.68, -0.08], [0.76, -0.26], [0.52, -0.13], [0.3, -0.2], [0.02, -0.1], [-0.3, -0.16], [-0.56, -0.12]];
function puff(c: C2, m: Mascot, f: Frame): void {
  const { a, P, hw, h } = f;
  const lobes = m.seed > 1 ? LOBES_SMALL : LOBES_BIG;
  const [la, ra] = arms(m, f, 0.82, -0.42);
  const [f0, f1] = feet(f, -0.44, 0.08, 0.1, m.w * 0.085);
  const hullFill = tone(GOLD, 0.5);
  // feet first: they hang from under the hull
  for (const ft of [f0, f1]) {
    c.beginPath();
    trace(c, ft, true, true);
    c.lineWidth = M_SIL * 2;
    c.strokeStyle = GOLD;
    c.stroke();
    c.fillStyle = tone(GOLD, 0.3);
    c.fill();
  }
  const solids: Solid[] = [{ pts: la, fill: m.fill, smooth: false }, { pts: ra, fill: m.fill, smooth: false }];
  const centres: { p: Pt; r: number }[] = [];
  lobes.forEach(([x, y, r], i) => {
    // the higher lobes trail a little behind the body: they jiggle
    const k = -y * 1.2;
    const p = P(x, y);
    const q: Pt = [p[0] + f.lagL * h * k * 1.6, p[1] + f.lagY * 0.22 * k + Math.sin(i * 2.1 + a.sq * 30) * 0.4];
    centres.push({ p: q, r: r * hw });
    solids.push({ pts: ell(q[0], q[1], r * hw * (1 - a.sq * 0.4), r * hw * (1 + a.sq * 0.6), 22), fill: m.fill });
  });
  union(c, solids, m.line);
  // creases where one lobe sits in front of another
  const crease = tone(mixc(INK, GOLD, 0.5), 0.5);
  // a short curl running in from each notch between the top lobes (kept high, away from the face)
  const top = centres[lobes.length - 1]!;
  for (const i of m.seed > 1 ? [3] : [3, 4]) {
    const o = centres[i]!;
    const d = Math.hypot(o.p[0] - top.p[0], o.p[1] - top.p[1]);
    const base = Math.atan2(o.p[1] - top.p[1], o.p[0] - top.p[0]);
    const half = Math.acos(Math.max(-1, Math.min(1, (d * d + top.r * top.r - o.r * o.r) / (2 * d * top.r))));
    const sgn = o.p[0] < top.p[0] ? 1 : -1; // the notch is on the upper side
    const a0 = base + sgn * half;
    const pts: Pt[] = [];
    for (let k = 0; k <= 5; k++) pts.push(polar(top.p, a0 - sgn * (k / 5) * 0.62, top.r - 0.5));
    ink(c, pts, M_FORM, crease, 1);
  }
  // the hull, on top of the bottom of the puff
  const hull = HULL.map(([x, y]) => P(x, y));
  c.beginPath();
  trace(c, hull, true, false);
  c.lineJoin = 'round';
  c.lineWidth = M_SIL * 2;
  c.strokeStyle = GOLD;
  c.save();
  c.clip();
  c.fillStyle = hullFill;
  c.fill();
  c.stroke();
  c.restore();
  const dark = tone(mixc(ORANGE, PAPER, 0.5), 0.3);
  const face = a.gx * 0.2 * hw;
  const ey = (-0.56 + a.gy * 0.05) * h * (1 + a.sq);
  eyes(c, face, ey, a, { rx: hw * 0.085, ry: h * 0.062, gap: hw * 0.34, color: dark, mark: dark });
  mouthAt(c, face + a.gx * hw * 0.04, ey + h * 0.1, hw * 0.075, a.mouth, dark, dark);
}

// ---- the pairs --------------------------------------------------------------------------------------------
const CREAM = mixc(INK, GOLD, 0.22);
export const PAIRS: Record<1 | 2 | 3, { name: string; big: Mascot; small: Mascot }> = {
  1: {
    name: 'Tuners',
    big: { kind: 1, w: 104, h: 110, line: ORANGE, fill: tone(ORANGE, 0.22), top: 44, alert: 0.45, arm: 46, armW: 17, seed: 1 },
    small: { kind: 1, w: 76, h: 76, line: GOLD, fill: tone(GOLD, 0.22), top: 30, alert: 0.1, arm: 36, armW: 14, seed: 2 },
  },
  2: {
    name: 'Lop-ears',
    big: { kind: 2, w: 84, h: 92, line: INK, fill: tone(INK, 0.15), top: 70, alert: 0.75, arm: 42, armW: 15, seed: 1 },
    small: { kind: 2, w: 72, h: 66, line: INK, fill: tone(INK, 0.15), top: 54, alert: 0.05, arm: 34, armW: 13, seed: 2 },
  },
  3: {
    name: 'Puffs',
    big: { kind: 3, w: 104, h: 112, line: CREAM, fill: tone(CREAM, 0.86), top: 0, alert: 0, arm: 44, armW: 16, seed: 1 },
    small: { kind: 3, w: 78, h: 78, line: CREAM, fill: tone(CREAM, 0.86), top: 0, alert: 0, arm: 34, armW: 13, seed: 2 },
  },
};

/** draw one creature with its seat at the origin; `role` picks whose acting it follows */
export function drawMascot(c: C2, m: Mascot, role: 'big' | 'small', t: number): void {
  const act = role === 'big' ? actBig : actSmall;
  const a = act(t), b = act(t - 0.09);
  const hw = m.w / 2, h = m.h;
  const sx = 1 - a.sq * 0.55, sy = 1 + a.sq;
  const f: Frame = { a, lagY: a.hop - b.hop, lagL: a.lean - b.lean, hw, h, P: (x, y) => [x * hw * sx, y * h * sy] };
  c.save();
  c.translate(a.dx, -a.hop);
  c.rotate(a.lean);
  if (m.kind === 1) tuner(c, m, f);
  else if (m.kind === 2) lop(c, m, f);
  else puff(c, m, f);
  c.restore();
}
