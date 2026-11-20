// Small geometry and timing helpers shared by the couch and the tree (right side of the hero).
import { PAPER } from '../../engine/layout';
import type { Pt } from '../../engine/types';

export const TAU = Math.PI * 2;
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const mod = (a: number, p: number) => ((a % p) + p) % p;
/** a sine with a period in seconds */
export const osc = (t: number, period: number, phase = 0) => Math.sin((t * TAU) / period + phase);
/** 0 outside [a, b], 1 inside, with smooth ramps of length `ramp` at both ends */
export const bump = (u: number, a: number, b: number, ramp: number) =>
  smooth((u - a) / ramp) * (1 - smooth((u - (b - ramp)) / ramp));
export const polar = (p: Pt, a: number, len: number): Pt => [p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len];
export const add = (p: Pt, dx: number, dy: number): Pt => [p[0] + dx, p[1] + dy];

/** a closed list of points (first point repeated at the end so a partial reveal still closes) */
export function closeLoop(pts: readonly Pt[]): Pt[] {
  return [...pts, pts[0]!];
}

/** points round a centre; `rf(theta)` gives the radius */
export function ring(c: Pt, rf: number | ((th: number) => number), n = 28, a0 = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const th = a0 + (i / n) * TAU;
    const r = typeof rf === 'number' ? rf : rf(th);
    out.push([c[0] + Math.cos(th) * r, c[1] + Math.sin(th) * r]);
  }
  return out;
}

/** the outline of a thick limb along a centre line: sides offset by half the width, round caps at both ends */
export function limb(c: readonly Pt[], w: number | readonly number[], capSteps = 6): Pt[] {
  const n = c.length;
  const wd = (i: number) => (typeof w === 'number' ? w : w[i]!) / 2;
  const nrm: Pt[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = c[i + 1]![0] - c[i]![0];
    const dy = c[i + 1]![1] - c[i]![1];
    const l = Math.hypot(dx, dy) || 1;
    nrm.push([-dy / l, dx / l]);
  }
  const L: Pt[] = [];
  const R: Pt[] = [];
  for (let i = 0; i < n; i++) {
    let nx: number, ny: number;
    if (i === 0) [nx, ny] = nrm[0]!;
    else if (i === n - 1) [nx, ny] = nrm[n - 2]!;
    else {
      const a = nrm[i - 1]!, b = nrm[i]!;
      nx = a[0] + b[0];
      ny = a[1] + b[1];
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const d = Math.max(0.6, nx * a[0] + ny * a[1]);
      nx /= d;
      ny /= d;
    }
    const h = wd(i);
    const p = c[i]!;
    L.push([p[0] + nx * h, p[1] + ny * h]);
    R.push([p[0] - nx * h, p[1] - ny * h]);
  }
  const out: Pt[] = [...L];
  const ne = nrm[n - 2]!;
  const ae = Math.atan2(ne[1], ne[0]);
  for (let s = 1; s < capSteps; s++) out.push(polar(c[n - 1]!, ae - (Math.PI * s) / capSteps, wd(n - 1)));
  for (let i = n - 1; i >= 0; i--) out.push(R[i]!);
  const n0 = nrm[0]!;
  const a0 = Math.atan2(n0[1], n0[0]);
  for (let s = 1; s < capSteps; s++) out.push(polar(c[0]!, a0 + Math.PI - (Math.PI * s) / capSteps, wd(0)));
  return out;
}

/** a rounded rectangle as points */
export function roundRect(x0: number, y0: number, x1: number, y1: number, r: number): Pt[] {
  const out: Pt[] = [];
  const corner = (cx: number, cy: number, a: number) => {
    for (let s = 0; s <= 4; s++) out.push(polar([cx, cy], a + (s / 4) * (Math.PI / 2), r));
  };
  corner(x1 - r, y0 + r, -Math.PI / 2);
  corner(x1 - r, y1 - r, 0);
  corner(x0 + r, y1 - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  return out;
}

/** reveal of step i of n spread through the window [a, b] of the part's reveal, each step taking `dur` */
export function stepper(reveal: number, a: number, b: number, n: number, dur: number) {
  return (i: number) => {
    const start = a + ((b - a - dur) * i) / Math.max(1, n - 1);
    return clamp01((reveal - start) / dur);
  };
}

// ---------------------------------------------------------------------------------------------------
// Illustration kit for the right side (couch, friends, tree). Draws straight on the 2D context with a
// steady round pen (no shake), so the five line tiers stay exact. Mirrors the recipes in QUALITY.md.
// ---------------------------------------------------------------------------------------------------

export type C2 = CanvasRenderingContext2D;

/** line tiers (scene units), tuned for figures of about 250 units */
export const LW: { sil: number; form: number; detail: number; hair: number } = { sil: 3.1, form: 2.4, detail: 1.7, hair: 1.15 };

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
/** mix colour a toward colour b by k (0 gives a, 1 gives b) */
export function mixc(a: string, b: string, k: number): string {
  const A = hex(a), B = hex(b);
  const m = (i: number) => Math.max(0, Math.min(255, Math.round(A[i]! + (B[i]! - A[i]!) * k))).toString(16).padStart(2, '0');
  return `#${m(0)}${m(1)}${m(2)}`;
}
/** colour c mixed toward the paper, keeping fraction k of c */
export const tone = (c: string, k: number) => mixc(PAPER, c, k);

export function rnd(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export const rot = (p: Pt, a: number): Pt => {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};
export const mix = (a: Pt, b: Pt, k: number): Pt => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

/** add a smooth path through the points (Catmull-Rom as beziers) to the current path */
export function trace(c: C2, pts: readonly Pt[], closed = false, smoothed = true): void {
  const n = pts.length;
  if (n < 2) return;
  c.moveTo(pts[0]![0], pts[0]![1]);
  if (!smoothed || n < 3) {
    for (let i = 1; i < n; i++) c.lineTo(pts[i]![0], pts[i]![1]);
    if (closed) c.closePath();
    return;
  }
  const at = (i: number): Pt => (closed ? pts[((i % n) + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) c.closePath();
}

/** one steady ink line */
export function ink(c: C2, pts: readonly Pt[], w: number, color: string, alpha = 1, smoothed = true, closed = false): void {
  c.beginPath();
  trace(c, pts, closed, smoothed);
  c.lineWidth = w;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = color;
  if (alpha !== 1) {
    const g = c.globalAlpha;
    c.globalAlpha = g * alpha;
    c.stroke();
    c.globalAlpha = g;
  } else c.stroke();
}

/** a closed opaque shape with an optional outline */
export function blob(c: C2, pts: readonly Pt[], fill: string | null, out?: string | null, w: number = LW.form, smoothed = true): void {
  c.beginPath();
  trace(c, pts, true, smoothed);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (out) {
    c.lineWidth = w;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.strokeStyle = out;
    c.stroke();
  }
}

/** points along a smooth curve through the control points */
export function spline(pts: readonly Pt[], steps = 6): Pt[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const at = (i: number): Pt => pts[Math.max(0, Math.min(n - 1, i))]!;
  const out: Pt[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < steps; s++) {
      const u = s / steps, u2 = u * u, u3 = u2 * u;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3),
      ]);
    }
  }
  out.push(pts[n - 1]!);
  return out;
}

/** the outline of a ribbon along a line whose width goes from w0 to w1 (use for trunks, limbs, tapered marks) */
export function ribbon(line: readonly Pt[], w0: number, w1: number, mid = -1): Pt[] {
  const n = line.length;
  const L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = line[Math.max(0, i - 1)]!, b = line[Math.min(n - 1, i + 1)]!;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const u = i / (n - 1);
    let h = (w0 + (w1 - w0) * u) / 2;
    if (mid >= 0) h = (u < 0.5 ? w0 + (mid - w0) * (u * 2) : mid + (w1 - mid) * (u * 2 - 1)) / 2;
    const p = line[i]!;
    L.push([p[0] - (dy / l) * h, p[1] + (dx / l) * h]);
    R.push([p[0] + (dy / l) * h, p[1] - (dx / l) * h]);
  }
  return [...L, ...R.reverse()];
}

/** a tapered ink mark: thick at the start (w0), a point at the end (w1) */
export function taper(c: C2, pts: readonly Pt[], w0: number, w1: number, color: string, alpha = 1, mid = -1): void {
  const line = pts.length > 2 ? spline(pts, 5) : pts;
  const poly = ribbon(line, w0, w1, mid);
  c.beginPath();
  c.moveTo(poly[0]![0], poly[0]![1]);
  for (let i = 1; i < poly.length; i++) c.lineTo(poly[i]![0], poly[i]![1]);
  c.closePath();
  c.fillStyle = color;
  if (alpha !== 1) {
    const g = c.globalAlpha;
    c.globalAlpha = g * alpha;
    c.fill();
    c.globalAlpha = g;
  } else c.fill();
}

export function ell(cx: number, cy: number, rx: number, ry: number, n = 20, a = 0): Pt[] {
  const out: Pt[] = [];
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    const x = Math.cos(th) * rx, y = Math.sin(th) * ry;
    out.push([cx + x * ca - y * sa, cy + x * sa + y * ca]);
  }
  return out;
}
export function disc(c: C2, x: number, y: number, r: number, fill: string | null, out?: string | null, w: number = LW.detail): void {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (out) {
    c.lineWidth = w;
    c.strokeStyle = out;
    c.stroke();
  }
}

/** broken parallel hairlines inside a shape: texture for shade planes */
export function hatch(c: C2, clip: readonly Pt[], o: { angle: number; gap: number; w?: number; color: string; alpha?: number; seed?: number; smoothed?: boolean }): void {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of clip) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 4;
  const seed = o.seed ?? 1;
  c.save();
  c.beginPath();
  trace(c, clip, true, o.smoothed ?? true);
  c.clip();
  c.translate(cx, cy);
  c.rotate(o.angle);
  c.globalAlpha *= o.alpha ?? 0.45;
  c.strokeStyle = o.color;
  c.lineWidth = o.w ?? LW.hair;
  c.lineCap = 'round';
  c.beginPath();
  let k = 0;
  for (let y = -R; y < R; y += o.gap * (0.75 + rnd(seed + k * 3.3) * 0.5)) {
    let x = -R + rnd(seed + k * 7.1) * 20;
    let j = 0;
    while (x < R) {
      const len = 14 + rnd(seed + k * 1.7 + j * 9.3) * 30;
      c.moveTo(x, y);
      c.lineTo(Math.min(R, x + len), y + (rnd(seed + k + j * 2.1) - 0.5) * 1.2);
      x += len + 5 + rnd(seed + k * 5.9 + j * 4.7) * 12;
      j++;
    }
    k++;
  }
  c.stroke();
  c.restore();
}

/** two-bone reach: where the elbow (or knee) goes for a limb from s toward target t; returns [joint, end] */
export function reach(s: Pt, t: Pt, a: number, b: number, bend: 1 | -1): [Pt, Pt] {
  let dx = t[0] - s[0], dy = t[1] - s[1];
  let d = Math.hypot(dx, dy) || 1e-6;
  const max = (a + b) * 0.995, min = Math.abs(a - b) + 0.5;
  const dd = Math.max(min, Math.min(max, d));
  dx = (dx / d) * dd;
  dy = (dy / d) * dd;
  d = dd;
  const ca = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
  const ang = Math.atan2(dy, dx) + bend * Math.acos(ca);
  return [[s[0] + Math.cos(ang) * a, s[1] + Math.sin(ang) * a], [s[0] + dx, s[1] + dy]];
}

/** paint something once into an offscreen canvas at the current device scale; repaints when the scale changes */
const SPRITES = new Map<string, { cv: HTMLCanvasElement; s: number }>();
export function sprite(c: C2, key: string, x: number, y: number, w: number, h: number, paint: (c: C2) => void): { cv: HTMLCanvasElement; w: number; h: number } {
  const s = Math.abs(c.getTransform().a) || 1;
  let e = SPRITES.get(key);
  if (!e || e.s !== s) {
    const cv = e?.cv ?? document.createElement('canvas');
    cv.width = Math.ceil(w * s);
    cv.height = Math.ceil(h * s);
    const g = cv.getContext('2d')!;
    g.setTransform(s, 0, 0, s, -x * s, -y * s);
    paint(g);
    e = { cv, s };
    SPRITES.set(key, e);
  }
  return { cv: e.cv, w: e.cv.width / s, h: e.cv.height / s };
}

/** a looping track of held poses: keys are [time, value]; eases between neighbours with a small overshoot */
export function track(u: number, keys: readonly (readonly [number, number])[], overshoot = 1.2): number {
  const n = keys.length;
  if (u < keys[0]![0]) return keys[n - 1]![1];
  for (let i = n - 1; i >= 0; i--) {
    const k = keys[i]!;
    if (u >= k[0]) {
      if (i === n - 1) return k[1];
      const nx = keys[i + 1]!;
      if (nx[1] === k[1]) return k[1];
      const x = clamp01((u - k[0]) / (nx[0] - k[0]));
      const e = 1 + (overshoot + 1) * (x - 1) ** 3 + overshoot * (x - 1) ** 2;
      return k[1] + (nx[1] - k[1]) * e;
    }
  }
  return keys[0]![1];
}
