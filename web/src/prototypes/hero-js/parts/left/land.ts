// The land of the left area, painted once: a far crag, the peak behind the trail (a tent on its top plateau,
// an overhang, two sheer cliffs), the stack of terraces left of the set, the plateau the set stands on, and
// the front layer whose top edge is the trail (see world.ts) with a spring, a waterfall pool, a water wheel,
// a stream in a gully and a sagging plank bridge on the face below it. hills.ts and tv.ts blit these and
// draw the moving things on top.
import { BLUE, GOLD, GREEN, GREEN_LINE, INK, ORANGE, WARM } from '../../engine/layout';
import type { Pt } from '../../engine/types';
import {
  GREEN_FAR, GREEN_LIT, GREEN_SHADE, GREEN_SHEEN, TAU, W_DET, W_FORM, W_HAIR, W_LAND, W_SIL, clamp01, curve, disc, fillPts, glow, hatch,
  line, rnd, rounded, seg, shape, taper, tone, trace, tuft, type Ctx,
} from './kit';
import { FRONT_TOP } from './world';

const DEEP = '#141d10';

export function yAt(raw: readonly Pt[], x: number): number {
  if (x <= raw[0]![0]) return raw[0]![1];
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1]!, b = raw[i]!;
    if (x <= b[0]) return b[0] === a[0] ? b[1] : a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return raw[raw.length - 1]![1];
}

/** the lower edge of a lit band under a contour: deep on flats, pinched on cliffs */
function band(top: readonly Pt[], scale: number): Pt[] {
  const n = top.length, low: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = top[Math.max(0, i - 2)]!, b = top[Math.min(n - 1, i + 2)]!;
    const dx = Math.abs(b[0] - a[0]) + 0.01, dy = Math.abs(b[1] - a[1]);
    const flat = 1 - clamp01((dy / dx - 0.15) / 0.9);
    low.push([top[i]![0], top[i]![1] + (2.5 + 11.5 * flat) * scale]);
  }
  return low;
}

/** a sheer face: a designed shade shape with hatch running down it and a crack or two */
function cliff(c: Ctx, poly: readonly Pt[], seed: number, fill = GREEN_SHADE, a = 0.3) {
  fillPts(c, poly, fill);
  hatch(c, poly, { angle: 1.38, gap: 8.5, color: GREEN_LINE, alpha: a, seed, breakup: 0.75 });
}

interface LayerOpts {
  fill: string; lit: string; shade: string; a: number; w: number; bottom: number; seed: number;
  glow?: boolean; strata?: boolean; sheen?: number; r?: number; fade?: readonly [number, number];
}

/** one layer of land: the shade it casts on what is behind, body, lit band, risers, strata, contour */
function layer(c: Ctx, raw: readonly Pt[], o: LayerOpts) {
  const top = rounded(raw, o.r ?? 5);
  const x0 = raw[0]![0], x1 = raw[raw.length - 1]![0];
  c.globalCompositeOperation = 'source-atop';
  line(c, top.map((p) => [p[0] + 3, p[1] - 5] as Pt), 22, GREEN_SHADE, 0.55);
  c.globalCompositeOperation = 'source-over';
  const body: Pt[] = [...top, [x1, o.bottom], [x0, o.bottom]];
  fillPts(c, body, o.fill);
  c.save();
  trace(c, body, true);
  c.clip();
  fillPts(c, [...top, ...band(top, o.sheen ?? 1).reverse()], o.lit);
  risers(c, raw, o);
  if (o.strata !== false) strata(c, raw, x0, x1, o.seed, o.a);
  c.restore();
  if (o.glow) glow(c, top, o.w, GREEN_LINE, o.a);
  else if (o.fade) taper(c, top, o.w, GREEN_LINE, o.a, o.fade[0], o.fade[1]);
  else line(c, top, o.w, GREEN_LINE, o.a);
}

function risers(c: Ctx, raw: readonly Pt[], o: { shade: string; a: number; seed: number }) {
  for (let i = 1; i < raw.length; i++) {
    const p = raw[i - 1]!, q = raw[i]!;
    const dx = q[0] - p[0], dy = q[1] - p[1];
    if (Math.abs(dy) < 12 || Math.abs(dx) > Math.abs(dy) * 1.5) continue;
    if (dy > 0) {
      // a riser facing right, away from the light: a shade wedge with hatch running down it
      const poly: Pt[] = [[p[0] - 4, p[1] + 10], [q[0] + 4, q[1] + 10], [q[0] + 12 + dy * 0.3, q[1] + 22 + dy * 0.5], [p[0] - 2, p[1] + 30 + dy]];
      fillPts(c, poly, o.shade);
      const n = 3 + Math.floor(dy / 14);
      for (let k = 0; k < n; k++) {
        const u = k / Math.max(1, n - 1), sx = p[0] + 1 + u * (dx + 8), sy = p[1] + 13 + u * dy * 0.8 + rnd(o.seed + i * 3 + k) * 5;
        const len = (10 + rnd(o.seed + i + k * 7) * 14 + dy * 0.2) * (1 - u * 0.3);
        taper(c, [[sx, sy], [sx + len * 0.16, sy + len * 0.55], [sx + len * 0.26, sy + len]], W_HAIR, GREEN_LINE, 0.34 * o.a, 0, 0.7);
      }
    } else {
      // a riser facing left, toward the light
      fillPts(c, [[p[0] - 2, p[1] + 10], [q[0] + 4, q[1] + 10], [q[0] + 2, q[1] + 26], [p[0] - 8, p[1] + 24]], GREEN_SHEEN, 0.32);
      for (let k = 0; k < 2; k++) seg(c, p[0] + 3 + k * 6, p[1] + 6 - k * 3, p[0] + 1 + k * 6, p[1] + 16 - k * 3, W_HAIR, GREEN_LINE, 0.3 * o.a);
    }
  }
}

/** strata: broken hairlines that follow the terraces */
function strata(c: Ctx, raw: readonly Pt[], x0: number, x1: number, seed: number, a: number, depth = 4) {
  for (let i = 0, x = x0 + 8 + rnd(seed) * 20; x < x1 - 20; i++) {
    const len = 20 + rnd(seed + i * 5.1) * 46;
    const d = 22 + Math.floor(rnd(seed + i * 2.3) * depth) * 15 + rnd(seed + i) * 4;
    const ya = yAt(raw, x) + d, yb = yAt(raw, x + len) + d;
    if (Math.abs(yb - ya) < 10) line(c, [[x, ya], [x + len * 0.5, (ya + yb) / 2 + 1.5], [x + len, yb]], W_HAIR, GREEN_LINE, 0.24 * a);
    x += len * 0.5 + 8 + rnd(seed + i * 8.7) * 26;
  }
}

/** an inner ledge on a face: shade on the face just above it, a lit band on its top, a line that lifts at both ends */
function ledge(c: Ctx, raw: readonly Pt[], w: number, a: number, seed: number, t0 = 0.12, t1 = 0.12, shadeH = 15) {
  const top = rounded(raw, 4);
  const n = top.length;
  const up: Pt[] = top.map((p, i) => {
    const u = i / (n - 1), k = Math.min(1, u / 0.15, (1 - u) / 0.15);
    return [p[0] + 4, p[1] - shadeH * k * (0.75 + 0.5 * rnd(seed + Math.floor(p[0] / 40)))] as Pt;
  });
  const sh: Pt[] = [...top, ...up.reverse()];
  fillPts(c, sh, GREEN_SHADE, 0.9);
  hatch(c, sh, { angle: 1.3, gap: 9, color: GREEN_LINE, alpha: 0.22 * a, seed, breakup: 0.8 });
  const low = band(top, 0.9).map((p, i) => {
    const u = i / (n - 1), k = Math.min(1, u / 0.1, (1 - u) / 0.1);
    return [p[0], top[i]![1] + (p[1] - top[i]![1]) * k] as Pt;
  });
  fillPts(c, [...top, ...low.reverse()], GREEN_LIT);
  taper(c, top, w, GREEN_LINE, a, t0, t1);
}

function tufts(c: Ctx, raw: readonly Pt[], n: number, sd: number, a: number, xa = raw[0]![0], xb = raw[raw.length - 1]![0]) {
  for (let i = 0; i < n; i++) {
    const x = xa + ((i + rnd(sd + i * 3.3) * 0.8) / n) * (xb - xa);
    tuft(c, x, yAt(raw, x) + 1, 6 + rnd(sd + i * 2.1) * 7, 2 + Math.floor(rnd(sd + i) * 3), GREEN_LINE, sd + i * 13, (rnd(sd + i * 7) - 0.5) * 0.7, a);
  }
}

// ---------------------------------------------------------------------------------------------------------
// small things that stand on the land

/** a miniature of the big windswept tree */
export function miniTree(c: Ctx, x: number, y: number, s: number) {
  disc(c, x + 2, y + 1, 12 * s, GREEN_SHADE, null, 0, 0.8, 2.5 * s);
  taper(c, curve([[x, y], [x + 3 * s, y - 12 * s], [x - 2 * s, y - 24 * s], [x - 10 * s, y - 34 * s]], 6), 4.2 * s, INK, 1, 0, 0.7);
  taper(c, curve([[x + 1 * s, y - 16 * s], [x + 9 * s, y - 24 * s], [x + 16 * s, y - 27 * s]], 5), 2.4 * s, INK, 1, 0, 0.8);
  const pad = (px: number, py: number, w: number, h: number, sd: number) => {
    const pts: Pt[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, rr = 1 + 0.22 * Math.sin(a * 5 + sd) + 0.1 * Math.sin(a * 9 + sd * 2);
      pts.push([px + Math.cos(a) * w * rr, py + Math.sin(a) * h * rr]);
    }
    shape(c, pts, tone(INK, 0.14), INK, 1.4 * Math.max(0.8, s));
    for (let i = 0; i < 7; i++) {
      const lx = px + (rnd(sd + i * 3.1) - 0.5) * w * 1.5, ly = py + (rnd(sd + i * 5.7) - 0.6) * h * 1.1;
      seg(c, lx, ly, lx + 3 * s, ly - 1.6 * s, 1.1, INK, 0.5 + 0.4 * rnd(sd + i));
    }
  };
  pad(x - 13 * s, y - 37 * s, 17 * s, 6.5 * s, 1 + x);
  pad(x + 15 * s, y - 29 * s, 12 * s, 5 * s, 2 + x);
  pad(x + 1 * s, y - 46 * s, 12 * s, 5 * s, 3 + x);
}

function mush(c: Ctx, x: number, y: number, s: number) {
  seg(c, x, y, x, y - 7 * s, 2.6 * s, INK, 0.9);
  c.beginPath();
  c.ellipse(x, y - 7 * s, 7 * s, 5.5 * s, 0, Math.PI, TAU);
  c.closePath();
  c.fillStyle = tone(ORANGE, 0.5);
  c.fill();
  c.strokeStyle = ORANGE;
  c.lineWidth = 1.5;
  c.stroke();
  disc(c, x - 2.5 * s, y - 9.6 * s, 1.1 * s, INK);
  disc(c, x + 2.6 * s, y - 8.6 * s, 0.9 * s, INK);
}

function stone(c: Ctx, x: number, y: number, s: number) {
  shape(c, [[x - 8 * s, y + 1], [x - 6 * s, y - 6 * s], [x + 1 * s, y - 8 * s], [x + 7 * s, y - 4 * s], [x + 9 * s, y + 1]], GREEN_SHADE, GREEN_LINE, 1.4, 0.8);
  fillPts(c, [[x - 6 * s, y - 5 * s], [x + 0.5 * s, y - 7 * s], [x - 1 * s, y - 3 * s]], GREEN_LIT, 0.9);
  seg(c, x + 1 * s, y - 7 * s, x + 2 * s, y - 2 * s, 1, GREEN_LINE, 0.4);
}

function ladder(c: Ctx, x: number, y0: number, y1: number) {
  seg(c, x - 5, y0, x - 5.5, y1, 2, WARM);
  seg(c, x + 5, y0, x + 5.5, y1, 2, WARM);
  for (let y = y0 + 5; y < y1 - 2; y += 7.5) seg(c, x - 5, y + rnd(y) * 1.2, x + 5, y + rnd(y + 3) * 1.2, 1.5, WARM, 0.9);
}

/** a camp on the peak: an A-frame tent seen three-quarter, guy ropes and pegs, a bedroll, a ring of fire stones */
export const CAMP = { tent: [724, 327] as Pt, fire: [768, 329] as Pt };
function camp(c: Ctx) {
  const [x, y] = CAMP.tent;
  disc(c, x + 12, y + 1.5, 44, GREEN_SHADE, null, 0, 0.9, 4);
  // guy ropes and pegs
  for (const [ax, ay, bx] of [[x - 2, y - 33, x - 30], [x + 34, y - 29, x + 58]] as [number, number, number][]) {
    seg(c, ax, ay, bx, y + 1, 1, WARM, 0.7);
    seg(c, bx - 1.5, y + 2, bx + 2.5, y - 5, 1.8, WARM);
  }
  // the far slope of the roof, the near slope, the front
  const side: Pt[] = [[x, y - 32], [x + 35, y - 28], [x + 48, y], [x + 17, y]];
  shape(c, side, tone(WARM, 0.11), WARM, W_DET);
  for (let i = 1; i < 5; i++) {
    const u = i / 5;
    seg(c, x + u * 35, y - 32 + u * 4, x + 17 + u * 31, y - 1, W_HAIR, WARM, i % 2 ? 0.55 : 0.28);
  }
  const front: Pt[] = [[x - 17, y], [x, y - 32], [x + 17, y]];
  shape(c, front, tone(WARM, 0.24), WARM, W_DET);
  fillPts(c, [[x - 5.5, y - 0.6], [x + 0.6, y - 21], [x + 6, y - 0.6]], '#0a0d09');
  line(c, [[x + 0.6, y - 21], [x + 8, y - 8], [x + 6, y - 0.6]], 1.2, WARM, 0.9);
  shape(c, [[x - 5.5, y - 0.6], [x - 1, y - 16], [x - 11, y - 6]], tone(WARM, 0.34), WARM, 1.1);
  seg(c, x - 3, y - 36, x + 3.5, y - 27, 1.6, WARM);
  seg(c, x + 3, y - 36, x - 3.5, y - 27, 1.6, WARM);
  shape(c, [[x + 24, y - 20], [x + 31, y - 19], [x + 32, y - 12], [x + 25, y - 13]], tone(ORANGE, 0.3), ORANGE, 1); // a patch
  // bedroll and a pot beside the fire
  disc(c, x - 26, y - 3.5, 4.2, tone(BLUE, 0.3), BLUE, 1.2);
  disc(c, x - 26, y - 3.5, 1.6, null, BLUE, 1, 0.8);
  line(c, [[x - 26, y - 7.6], [x - 36, y - 7], [x - 37, y + 0.4], [x - 26, y + 0.6]], 1.2, BLUE, 0.9);
  // the fire: stones and crossed logs (the flame and the smoke are live)
  const [fx, fy] = CAMP.fire;
  disc(c, fx, fy + 1, 13, DEEP, null, 0, 0.9, 2.6);
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.05 + (i / 4) * 0.9);
    disc(c, fx + Math.cos(a) * 9.5, fy + 1.5 - Math.sin(a) * 1.8, 2.2, GREEN_SHADE, GREEN_LINE, 1, 0.9, 1.7);
  }
  seg(c, fx - 7, fy - 0.5, fx + 6, fy - 4, 2.6, WARM);
  seg(c, fx + 7, fy - 0.5, fx - 6, fy - 4, 2.6, tone(WARM, 0.6));
}

/** the plank bridge over the gully: sagging deck, rope rails, four posts */
export const BRIDGE = { a: [630, 686] as Pt, b: [698, 684] as Pt };
function bridge(c: Ctx) {
  const { a, b } = BRIDGE;
  const rope = (dy: number, sag: number): Pt[] => curve([[a[0], a[1] + dy], [a[0] + (b[0] - a[0]) * 0.3, a[1] + dy + sag * 0.8], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + dy + sag], [a[0] + (b[0] - a[0]) * 0.72, b[1] + dy + sag * 0.75], [b[0], b[1] + dy]], 5);
  const deck = rope(0, 10), rail = rope(-17, 6);
  for (const [px, py] of [a, b]) {
    seg(c, px - 2, py + 3, px - 2, py - 20, 2.6, tone(WARM, 0.6));
    seg(c, px + 3, py + 4, px + 3, py - 21, 3, WARM);
    seg(c, px + 0.8, py - 21.6, px + 5.2, py - 21.6, 1.6, WARM);
  }
  for (let i = 2; i < deck.length - 2; i += 2) seg(c, deck[i]![0], deck[i]![1], rail[i]![0], rail[i]![1], 1, WARM, 0.6);
  line(c, rail, 1.5, WARM, 0.95);
  // planks, seen edge on, each a hair out of line with its neighbours
  for (let i = 0; i < deck.length - 1; i++) {
    const p = deck[i]!, q = deck[i + 1]!, j = (rnd(i * 3.7) - 0.5) * 1.6;
    shape(c, [[p[0] + 0.5, p[1] - 2 + j], [q[0] - 0.5, q[1] - 2 + j], [q[0] - 0.5, q[1] + 2 + j], [p[0] + 0.5, p[1] + 2 + j]], tone(WARM, i % 3 === 1 ? 0.22 : 0.34), WARM, 1);
  }
  // one plank has slipped
  const m = deck[8]!;
  seg(c, m[0] - 1, m[1] + 3, m[0] + 3, m[1] + 9, 1.6, WARM, 0.8);
}

/** the frame the water wheel turns in (the wheel itself is live) */
export const WHEEL = { x: 866, y: 622, r: 21 };
function wheelFrame(c: Ctx) {
  const { x, y, r } = WHEEL;
  disc(c, x, y + r + 3, r + 4, DEEP, null, 0, 0.8, 3);
  // a little mill hut behind the wheel
  shape(c, [[x + 8, y + r + 2], [x + 8, y - 8], [x + 36, y - 8], [x + 36, y + r + 4]], tone(WARM, 0.14), WARM, W_DET);
  shape(c, [[x + 3, y - 7], [x + 22, y - 24], [x + 41, y - 7]], tone(WARM, 0.26), WARM, W_DET);
  for (let i = 0; i < 4; i++) seg(c, x + 9 + i * 6, y - 11 - i * 0.2, x + 20 + i * 2, y - 21 + i * 4.6, W_HAIR, WARM, 0.5);
  shape(c, [[x + 23, y], [x + 31, y], [x + 31, y + 10], [x + 23, y + 10]], tone(GOLD, 0.4), GOLD, 1);
  seg(c, x + 27, y, x + 27, y + 10, 1, GOLD, 0.7);
  for (let i = 0; i < 3; i++) seg(c, x + 10, y + 2 + i * 7, x + 20, y + 2 + i * 7, W_HAIR, WARM, 0.4);
  // the trough that feeds the wheel from the fall
  line(c, [[x - 58, y - r - 12], [x - 6, y - r - 4]], 3, tone(WARM, 0.5));
  line(c, [[x - 58, y - r - 14], [x - 6, y - r - 6]], 1.3, WARM);
  seg(c, x - 36, y - r - 8, x - 38, y + 12, 1.6, WARM, 0.9);
}

// ---------------------------------------------------------------------------------------------------------
// the land behind the trail and left of the set

const CRAG: Pt[] = [[930, 650], [944, 598], [956, 568], [978, 553], [1012, 549], [1026, 558], [1031, 584], [1042, 599], [1078, 603], [1092, 620], [1099, 652], [1138, 659], [1151, 680], [1176, 708]];
const PEAK: Pt[] = [
  [628, 480], [650, 440], [655, 413], [668, 407], [671, 380], [684, 373], [687, 346], [700, 328], [730, 326], [764, 329], [783, 334], [790, 346], [780, 359],
  [784, 392], [790, 440], [796, 458], [806, 463], [846, 465], [874, 468], [882, 478], [888, 530], [896, 548], [940, 553], [954, 572], [962, 591],
  [1002, 596], [1014, 614], [1022, 642], [1062, 650], [1078, 668], [1090, 700], [1100, 724],
];
/** the peak's left flank, which catches the screen's light (tv.ts draws the live rim) */
export const PEAK_FLANK: Pt[] = [[652, 436], [655, 413], [668, 407], [671, 380], [684, 373], [687, 346], [700, 328]];
const BEHIND: Pt[] = [[120, 566], [200, 552], [290, 556], [322, 574], [420, 578], [452, 560], [540, 556], [640, 566], [700, 600]];
const L1: Pt[] = [[-20, 300], [14, 294], [28, 266], [82, 262], [96, 238], [140, 234], [156, 252], [230, 256]];
const L2: Pt[] = [[-20, 404], [26, 398], [40, 420], [86, 424], [100, 448], [170, 452]];
const L3: Pt[] = [[-20, 522], [32, 516], [46, 540], [98, 544], [112, 568], [180, 572]];
const PLATEAU: Pt[] = [[-20, 660], [0, 650], [110, 600], [524, 600.5], [560, 601]];
const U1: Pt[] = [[-20, 704], [70, 698], [90, 672], [250, 668], [272, 700], [430, 704], [452, 680], [524, 679], [560, 679]];
export const SLIME_LEDGE = { x0: 50, x1: 94, y: 542 };
export const FLAGS: { x: number; y: number; col: string; s: number }[] = [
  { x: 852, y: 465, col: ORANGE, s: 1 },
  { x: 100, y: 238, col: BLUE, s: 0.85 },
];

export const LAND_BOX: readonly [number, number, number, number] = [-20, 200, 1220, 720];
export function paintLand(c: Ctx) {
  // the far crag, standing by itself further right
  layer(c, CRAG, { fill: GREEN_FAR, lit: '#263620', shade: DEEP, a: 0.6, w: W_FORM, bottom: 760, seed: 11, fade: [0.04, 0.1] });
  cliff(c, [[1014, 552], [1026, 558], [1031, 584], [1042, 599], [1034, 640], [1012, 640], [1016, 590]], 12, DEEP, 0.18);
  cliff(c, [[1080, 606], [1092, 620], [1099, 652], [1092, 690], [1076, 690], [1082, 640]], 13, DEEP, 0.18);
  miniTree(c, 992, 552, 0.55);
  {
    // a cave mouth in the far face
    const x = 1064, y = 652;
    const pts: Pt[] = [[x - 9, y]];
    for (let a = Math.PI; a <= TAU + 0.01; a += 0.3) pts.push([x + Math.cos(a) * 9, y - 9 + Math.sin(a) * 11]);
    pts.push([x + 9, y]);
    shape(c, pts, '#080b08', GREEN_LINE, 1.3, 0.6);
  }
  tufts(c, CRAG, 8, 100, 0.45);

  // the peak
  layer(c, PEAK, { fill: GREEN, lit: GREEN_LIT, shade: GREEN_SHADE, a: 0.92, w: 4, bottom: 760, seed: 23, strata: false, r: 4 });
  c.save();
  trace(c, [...PEAK, [1100, 760], [628, 760]], true);
  c.clip();
  // the sheer east face under the top plateau, with the overhang's dark underside
  cliff(c, [[758, 342], [783, 336], [790, 346], [780, 359], [784, 392], [790, 440], [796, 458], [772, 462], [760, 410], [752, 366]], 31);
  fillPts(c, [[770, 340], [783, 336], [790, 346], [780, 359], [770, 352]], DEEP);
  for (let i = 0; i < 4; i++) taper(c, [[772 + i * 3.4, 350 + i * 2], [771.5 + i * 3.6, 360 + i * 4]], 1.3, GREEN_LINE, 0.5, 0, 0.9); // roots hanging under the lip
  // the second sheer face, below the lower plateau
  cliff(c, [[860, 478], [876, 471], [882, 478], [888, 530], [896, 548], [874, 556], [864, 520]], 33);
  // lit left flank facing the set
  fillPts(c, [[650, 440], [655, 413], [668, 407], [671, 380], [684, 373], [687, 346], [700, 328], [706, 340], [694, 376], [684, 410], [668, 444]], GREEN_SHEEN, 0.4);
  for (let i = 0; i < 6; i++) {
    const u = i / 5, x = 662 + u * 30, y = 430 - u * 84;
    taper(c, [[x, y], [x - 3, y + 9], [x - 4, y + 20]], 1.2, GREEN_LINE, 0.34, 0, 0.8);
  }
  // inner ledges of the face, uneven gaps
  ledge(c, [[664, 424], [690, 414], [724, 412], [742, 420], [772, 424]], W_FORM, 0.72, 41, 0.1, 0.2, 18);
  ledge(c, [[640, 476], [676, 466], [704, 468], [716, 484], [752, 488], [778, 480], [800, 482]], W_FORM, 0.66, 43, 0.1, 0.16, 13);
  ledge(c, [[806, 516], [842, 508], [862, 512], [872, 530]], W_DET, 0.6, 45, 0.15, 0.2, 12);
  ledge(c, [[904, 574], [930, 570], [950, 580]], W_DET, 0.55, 47, 0.2, 0.2, 9);
  // strata and a few cracks
  for (const [x, y, len, sl] of [[700, 350, 40, 2], [716, 372, 30, -1], [688, 392, 28, 3], [730, 444, 36, 2], [812, 484, 40, 1], [828, 498, 26, 2], [836, 540, 44, 3], [904, 562, 30, 1], [968, 612, 30, 2], [1030, 660, 30, 1], [686, 500, 30, 2]] as [number, number, number, number][]) {
    line(c, [[x, y], [x + len * 0.5, y + sl * 0.5 + 1.4], [x + len, y + sl]], W_HAIR, GREEN_LINE, 0.24);
  }
  taper(c, [[736, 338], [733, 352], [738, 366], [735, 384]], 1.4, GREEN_LINE, 0.4, 0, 0.8);
  taper(c, [[822, 472], [820, 486], [824, 500]], 1.3, GREEN_LINE, 0.36, 0, 0.8);
  c.restore();
  camp(c);
  miniTree(c, 824, 465, 0.9);
  stone(c, 706, 328, 0.7);
  stone(c, 872, 468, 0.6);
  stone(c, 918, 552, 0.8);
  mush(c, 696, 414, 0.8);
  mush(c, 705, 413, 0.55);
  mush(c, 986, 596, 0.7);
  tufts(c, PEAK.slice(7, 10), 5, 200, 0.75);
  tufts(c, PEAK.slice(16, 19), 5, 220, 0.75);
  tufts(c, PEAK.slice(21, 25), 4, 240, 0.7);

  // left of the set: three terraces stacked up behind it
  layer(c, L1, { fill: GREEN, lit: GREEN_LIT, shade: GREEN_SHADE, a: 0.8, w: W_SIL, bottom: 760, seed: 41 });
  miniTree(c, 60, 264, 0.9);
  stone(c, 20, 293, 0.7);
  layer(c, L2, { fill: GREEN, lit: GREEN_LIT, shade: GREEN_SHADE, a: 0.8, w: W_FORM, bottom: 760, seed: 53 });
  ladder(c, 116, 238, 448);
  mush(c, 12, 401, 0.8);
  stone(c, 60, 422, 0.8);
  layer(c, L3, { fill: GREEN, lit: GREEN_LIT, shade: GREEN_SHADE, a: 0.8, w: W_FORM, bottom: 760, seed: 67 });
  mush(c, 22, 518, 0.9);
  mush(c, 12, 519, 0.6);
  stone(c, 132, 569, 0.9);
  // land behind the set, seen between its legs
  layer(c, BEHIND, { fill: '#2a3b1f', lit: GREEN, shade: DEEP, a: 0.5, w: W_FORM, bottom: 760, seed: 59 });
  tufts(c, BEHIND, 12, 560, 0.5);
  // the plateau the set stands on, and one darker terrace stepping down in front of it; no glow on either
  layer(c, PLATEAU, { fill: GREEN, lit: GREEN_LIT, shade: GREEN_SHADE, a: 0.85, w: 3.2, bottom: 930, seed: 71 });
  layer(c, U1, { fill: '#2b3c20', lit: '#364c27', shade: '#1f2c17', a: 0.62, w: W_FORM, bottom: 930, seed: 83 });
  stone(c, 300, 668, 1);
  stone(c, 486, 679, 0.8);
  mush(c, 196, 670, 0.9);
  mush(c, 208, 671, 0.6);
  tufts(c, L1, 6, 400, 0.7);
  tufts(c, L2, 5, 500, 0.7);
  tufts(c, L3, 5, 600, 0.75);
  tufts(c, U1, 16, 700, 0.7);
}

// ---------------------------------------------------------------------------------------------------------
// the front layer: the trail on top, the spring, pool, stream, wheel and bridge on its face

/** the left edge of the sheet where it hangs over the bezel's corner and down the cabinet to the plateau */
export const HANG: Pt[] = [[448, 486], [454, 509], [448, 525], [468, 541], [465, 559], [492, 574], [497, 591], [524, 601]];
const LEDGE_A: Pt[] = [[590, 556], [612, 549], [664, 552], [720, 553], [764, 554]];
const LEDGE_B: Pt[] = [[524, 601], [600, 602], [690, 604], [722, 626], [752, 640], [800, 644], [850, 644], [876, 631], [904, 628], [930, 626]];
const C_LEFT: Pt[] = [[524, 679], [580, 678], [612, 681], [628, 686]];
const C_RIGHT: Pt[] = [[700, 684], [740, 680], [800, 682], [860, 688], [930, 692], [1000, 695], [1084, 700]];
const D_LEFT: Pt[] = [[524, 742], [566, 746], [588, 760]];
const D_RIGHT: Pt[] = [[664, 742], [720, 750], [772, 757], [806, 776]];
export const SPRING: Pt = [798, 571];
export const POOL_Y = 637;
export const STREAM: Pt[] = curve([[756, 641], [736, 652], [710, 663], [684, 676], [658, 692], [636, 714], [612, 740], [592, 768], [574, 804]], 6);

export const FRONT_BOX: readonly [number, number, number, number] = [424, 404, 700, 426];
export function paintFront(c: Ctx) {
  const top = rounded(FRONT_TOP, 3.2, 3);
  const body: Pt[] = [...top, [1112, 724], [1112, 830], [524, 830], ...HANG.slice().reverse(), [434, 486]];
  fillPts(c, body, GREEN);
  c.save();
  trace(c, body, true);
  c.clip();

  // below the third terrace the land is the darker tone of the terrace left of it, so the two join without a seam
  fillPts(c, [...C_LEFT, ...C_RIGHT, [1112, 724], [1112, 830], [524, 830]], '#2b3c20');
  // lit band under the trail
  fillPts(c, [...top, ...band(top, 1.05).reverse()], GREEN_LIT);
  // the draped sheet over the bezel's corner: lit, with flow lines following the drape
  fillPts(c, [[448, 486], [454, 509], [448, 525], [468, 541], [465, 559], [476, 562], [480, 540], [466, 522], [470, 506], [466, 486]], GREEN_SHEEN, 0.45);
  for (const fl of [
    [[470, 492], [478, 520], [490, 548], [508, 578]], [[492, 488], [500, 516], [514, 544], [530, 566]], [[512, 470], [520, 500], [534, 526], [548, 548]],
    [[524, 440], [530, 470], [540, 492]], [[480, 470], [484, 500], [494, 528]],
  ] as Pt[][]) taper(c, curve(fl, 5), 1.3, GREEN_LINE, 0.26, 0.2, 0.7);
  // the two folds: each a small cliff
  cliff(c, [[529, 432], [538, 458], [556, 466], [560, 484], [544, 492], [530, 462]], 3);
  cliff(c, [[558, 464], [566, 492], [580, 500], [590, 540], [566, 536], [556, 500]], 5);
  // the bluff's face under its lip: a sheer cliff down to the first ledge
  cliff(c, [[576, 501], [664, 504], [668, 552], [612, 549], [590, 556], [572, 584], [548, 596], [540, 560], [566, 536]], 7);
  fillPts(c, [[576, 500], [664, 503], [664, 512], [640, 509], [606, 512], [578, 508]], DEEP, 0.75); // the lip's own shadow
  // under each flight of steps: the side of the stair, in shade
  cliff(c, [[668, 510], [764, 566], [764, 554], [668, 552]], 9, GREEN_SHADE, 0.24);
  cliff(c, [[826, 572], [930, 640], [930, 626], [876, 631], [850, 644], [826, 644]], 11, GREEN_SHADE, 0.24);
  cliff(c, [[976, 644], [1084, 714], [1084, 700], [1000, 695], [976, 694]], 13, GREEN_SHADE, 0.22);
  risers(c, FRONT_TOP.slice(6), { shade: GREEN_SHADE, a: 0.9, seed: 17 });
  // the sheer face under the middle landing, where the spring comes out
  cliff(c, [[764, 568], [826, 571], [826, 644], [752, 640], [760, 600]], 15);
  ledge(c, LEDGE_A, W_FORM, 0.8, 21, 0.12, 0.05, 0);

  // the face below: plateau line carried on, the pool's basin, the lower terraces broken by the gully
  ledge(c, LEDGE_B, 3.2, 0.85, 23, 0, 0.06, 12);
  // the pool
  const pool: Pt[] = curve([[750, POOL_Y], [800, POOL_Y - 1], [860, POOL_Y], [852, 645], [800, 647], [760, 644]], 5, true);
  shape(c, pool, tone(BLUE, 0.26), tone(BLUE, 0.7), 1.3);
  fillPts(c, curve([[758, POOL_Y + 1], [800, POOL_Y], [846, POOL_Y + 1], [800, POOL_Y + 3.4]], 4, true), tone(BLUE, 0.42));
  // the gully the stream has cut, widening downhill, and the water in it
  const n = STREAM.length;
  const gl: Pt[] = [], gr: Pt[] = [], wl: Pt[] = [], wr: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = STREAM[Math.max(0, i - 1)]!, b = STREAM[Math.min(n - 1, i + 1)]!, p = STREAM[i]!;
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / tl, ny = (b[0] - a[0]) / tl, u = i / (n - 1);
    const gw = 7 + 13 * u + 4 * Math.sin(u * 9), ww = 2.4 + 3.4 * u;
    gl.push([p[0] + nx * gw, p[1] + ny * gw]);
    gr.push([p[0] - nx * gw * 1.25, p[1] - ny * gw * 1.25]);
    wl.push([p[0] + nx * ww, p[1] + ny * ww]);
    wr.push([p[0] - nx * ww, p[1] - ny * ww]);
  }
  ledge(c, C_LEFT, W_FORM, 0.66, 25, 0, 0.1, 11);
  ledge(c, C_RIGHT, W_FORM, 0.66, 27, 0.1, 0.05, 13);
  ledge(c, D_LEFT, W_DET, 0.5, 29, 0, 0.3, 9);
  ledge(c, D_RIGHT, W_DET, 0.5, 31, 0.2, 0.3, 10);
  fillPts(c, [...gl, ...gr.slice().reverse()], '#1c2815');
  hatch(c, [...gl, ...gr.slice().reverse()], { angle: 0.5, gap: 8, color: GREEN_LINE, alpha: 0.16, seed: 33, breakup: 0.8 });
  taper(c, gl, 1.8, GREEN_LINE, 0.6, 0.1, 0.1);
  taper(c, gr, 1.5, GREEN_LINE, 0.4, 0.1, 0.1);
  fillPts(c, [...wl, ...wr.slice().reverse()], tone(BLUE, 0.3));
  line(c, wl, 1.1, tone(BLUE, 0.75), 0.9);
  // stones in the stream bed and on the banks
  for (const [x, y, s] of [[716, 664, 0.5], [668, 690, 0.6], [640, 716, 0.7], [604, 750, 0.6], [622, 700, 0.8], [690, 700, 0.9]] as [number, number, number][]) stone(c, x, y, s);
  // strata on the open faces
  strata(c, LEDGE_B, 530, 720, 61, 0.9, 3);
  strata(c, C_RIGHT, 704, 1000, 63, 0.8, 3);
  strata(c, C_LEFT, 526, 610, 65, 0.8, 4);
  for (const [x, y, len, sl] of [[596, 574, 40, 2], [700, 572, 44, 3], [690, 590, 30, 1], [780, 590, 30, 1], [900, 650, 40, 3], [950, 668, 44, 3], [1010, 676, 30, 2], [480, 600, 0, 0]] as [number, number, number, number][]) {
    if (len) line(c, [[x, y], [x + len * 0.5, y + sl * 0.5 + 1.4], [x + len, y + sl]], W_HAIR, GREEN_LINE, 0.24);
  }
  c.restore();

  // the spring: a dark notch under the landing's lip
  {
    const [x, y] = SPRING;
    const pts: Pt[] = [[x - 10, y + 5]];
    for (let a = Math.PI; a <= TAU + 0.01; a += 0.3) pts.push([x + Math.cos(a) * 10, y + 1 + Math.sin(a) * 8]);
    pts.push([x + 10, y + 5]);
    shape(c, pts, '#070a07', GREEN_LINE, 1.4, 0.75);
    shape(c, [[x - 12, y + 8], [x - 9, y + 3.6], [x + 9, y + 3.6], [x + 12, y + 8]], GREEN_SHADE, GREEN_LINE, 1.3, 0.9);
  }
  wheelFrame(c);
  bridge(c);
  mush(c, 548, 601, 0.9);
  mush(c, 558, 602, 0.6);
  mush(c, 910, 692, 0.8);
  stone(c, 642, 552, 0.8);
  stone(c, 588, 602, 1);
  stone(c, 780, 682, 0.9);
  stone(c, 960, 694, 0.8);
  tufts(c, LEDGE_A, 5, 810, 0.8, 612, 760);
  tufts(c, LEDGE_B, 7, 820, 0.8, 530, 700);
  tufts(c, C_RIGHT, 12, 830, 0.7);
  tufts(c, C_LEFT, 4, 840, 0.7);
  tufts(c, D_RIGHT, 4, 850, 0.6);
  // reeds by the pool
  for (const [x, h] of [[748, 16], [752, 22], [757, 13], [858, 12], [862, 18]] as Pt[]) {
    taper(c, [[x, POOL_Y + 2], [x + 1, POOL_Y - h * 0.6], [x + 3, POOL_Y - h]], 1.8, GREEN_LINE, 0.85, 0, 0.8);
    disc(c, x + 3, POOL_Y - h, 1.4, tone(WARM, 0.8), null, 0, 0.9, 2.6);
  }

  // the hanging edge, then the trail's contour: the one glowing line of the hills
  line(c, rounded(HANG, 3), W_SIL, GREEN_LINE, 0.85);
  glow(c, top.filter((p) => p[0] >= 505), W_LAND, GREEN_LINE);
  // tufts and stones along the trail, kept clear of the treads' edges
  const along: [number, number][] = [[584, 9], [600, 12], [634, 8], [652, 13], [772, 10], [786, 13], [812, 9], [938, 12], [950, 8], [964, 11], [544, 8], [550, 11]];
  along.forEach(([x, h], i) => tuft(c, x, yAt(FRONT_TOP, x) + 1, h, 3 + (i % 2), GREEN_LINE, 900 + i * 7, (rnd(i * 3.3) - 0.5) * 0.6, 0.9));
  stone(c, 616, 489, 0.6);
  stone(c, 802, 556, 0.6);
}
