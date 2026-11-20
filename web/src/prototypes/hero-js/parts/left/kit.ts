// The drawing kit of the left area (television, game, hills, walkers). It draws straight onto the canvas
// context with the five line tiers and the three fill tones of QUALITY.md, so made objects have straight,
// steady edges, and it caches whatever never moves in an offscreen canvas.
import { PAPER } from '../../engine/layout';
import type { Pt } from '../../engine/types';

export type Ctx = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;

// line tiers (scene units)
export const W_LAND = 4.8;
export const W_SIL = 3.5;
export const W_FORM = 2.6;
export const W_DET = 1.8;
export const W_HAIR = 1.2;

export const GREEN_SHADE = '#24331b';
export const GREEN_LIT = '#41592e';
export const GREEN_SHEEN = '#557440';
export const GREEN_FAR = '#1c2815';

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};
/** eased ramp with a small overshoot, for gestures */
export const overshoot = (u: number) => {
  const x = clamp01(u);
  const c = 1.9;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
};
/** 0..1 hash */
export function rnd(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export const mod = (a: number, m: number) => ((a % m) + m) % m;

const TONES = new Map<string, string>();
/** colour c mixed toward the paper, keeping fraction k of c */
export function tone(c: string, k: number): string {
  const key = c + k;
  let v = TONES.get(key);
  if (!v) {
    const a = parseInt(c.slice(1), 16), b = parseInt(PAPER.slice(1), 16);
    const ch = (sh: number) => Math.round(((a >> sh) & 255) * k + ((b >> sh) & 255) * (1 - k));
    v = `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    TONES.set(key, v);
  }
  return v;
}

export function trace(ctx: Ctx, pts: readonly Pt[], close = false) {
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  if (close) ctx.closePath();
}

/** an even ink line, round caps and joins */
export function line(ctx: Ctx, pts: readonly Pt[], w: number, color: string, alpha = 1, close = false) {
  if (pts.length < 2) return;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  trace(ctx, pts, close);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
export function seg(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, color: string, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
export function fillPts(ctx: Ctx, pts: readonly Pt[], color: string, alpha = 1) {
  if (pts.length < 3) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  trace(ctx, pts, true);
  ctx.fill();
  ctx.globalAlpha = 1;
}
/** an opaque filled shape with a closed outline */
export function shape(ctx: Ctx, pts: readonly Pt[], fill: string, stroke: string, w: number, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  trace(ctx, pts, true);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;
}
export function disc(ctx: Ctx, x: number, y: number, r: number, fill: string | null, stroke?: string | null, w = W_DET, alpha = 1, ry = r, rot = 0) {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, r), Math.max(0.01, ry), rot, 0, TAU);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = w;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
/** a line that thins to a point at its end (and at its start when t0 > 0): blades, hair, hatch, twigs */
export function taper(ctx: Ctx, pts: readonly Pt[], w: number, color: string, alpha = 1, t0 = 0, t1 = 1) {
  const n = pts.length;
  if (n < 2) return;
  const L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(n - 1, i + 1)]!;
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const u = i / (n - 1);
    let k = 1;
    if (t0 > 0) k = Math.min(k, u / t0);
    if (t1 > 0) k = Math.min(k, (1 - u) / t1);
    const h = w * 0.5 * Math.max(0.04, k);
    L.push([pts[i]![0] - ty * h, pts[i]![1] + tx * h]);
    R.push([pts[i]![0] + ty * h, pts[i]![1] - tx * h]);
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(L[0]![0], L[0]![1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i]![0], L[i]![1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i]![0], R[i]![1]);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}
/** the land contour: a heavy line with the halo recipe */
export function glow(ctx: Ctx, pts: readonly Pt[], w: number, color: string, alpha = 1) {
  line(ctx, pts, w * 3.2, color, 0.1 * alpha);
  line(ctx, pts, w * 1.8, color, 0.16 * alpha);
  line(ctx, pts, w, color, alpha);
}

/** Catmull-Rom through the points */
export function curve(pts: readonly Pt[], steps = 8, closed = false): Pt[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const at = (i: number): Pt => (closed ? pts[((i % n) + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
  const out: Pt[] = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < steps; s++) {
      const u = s / steps, u2 = u * u, u3 = u2 * u;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3),
      ]);
    }
  }
  if (!closed) out.push(pts[n - 1]!);
  return out;
}

/** a polyline with every inner corner rounded to radius r: terraces, cabinets, anything stepped */
export function rounded(pts: readonly Pt[], r: number, n = 4): Pt[] {
  const out: Pt[] = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!, b = pts[i]!, c = pts[i + 1]!;
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const rr = Math.min(r, la * 0.45, lc * 0.45);
    const p: Pt = [b[0] + ((a[0] - b[0]) / la) * rr, b[1] + ((a[1] - b[1]) / la) * rr];
    const q: Pt = [b[0] + ((c[0] - b[0]) / lc) * rr, b[1] + ((c[1] - b[1]) / lc) * rr];
    for (let k = 0; k <= n; k++) {
      const u = k / n, v = 1 - u;
      out.push([v * v * p[0] + 2 * v * u * b[0] + u * u * q[0], v * v * p[1] + 2 * v * u * b[1] + u * u * q[1]]);
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

export function circle(cx: number, cy: number, r: number, n = 24, ry = r): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** rounded rectangle as a closed point list */
export function rrect(x: number, y: number, w: number, h: number, r: number, n = 5): Pt[] {
  const out: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return out;
}

/** a tapered capsule between two points: one limb segment, opaque with an outline */
export function capsule(ctx: Ctx, ax: number, ay: number, bx: number, by: number, ra: number, rb: number, fill: string, stroke: string, w: number) {
  const ang = Math.atan2(by - ay, bx - ax);
  ctx.beginPath();
  ctx.arc(ax, ay, ra, ang + Math.PI / 2, ang - Math.PI / 2);
  ctx.arc(bx, by, rb, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** broken parallel hairlines inside a shape, following one direction */
export function hatch(
  ctx: Ctx, clip: readonly Pt[],
  o: { angle: number; gap: number; w?: number; color: string; alpha?: number; seed?: number; breakup?: number },
) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of clip) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2;
  const dx = Math.cos(o.angle), dy = Math.sin(o.angle);
  const seed = o.seed ?? 1, br = o.breakup ?? 0.35;
  ctx.save();
  trace(ctx, clip, true);
  ctx.clip();
  ctx.strokeStyle = o.color;
  ctx.lineWidth = o.w ?? W_HAIR;
  ctx.lineCap = 'round';
  ctx.globalAlpha = o.alpha ?? 0.45;
  ctx.beginPath();
  let k = 0;
  for (let d = -R; d <= R; ) {
    const ox = cx - dy * d, oy = cy + dx * d;
    let s = -R + rnd(seed + k * 3.1) * 14;
    while (s < R) {
      const len = 16 + rnd(seed + k * 7.7 + s) * 34;
      ctx.moveTo(ox + dx * s, oy + dy * s);
      ctx.lineTo(ox + dx * Math.min(R, s + len), oy + dy * Math.min(R, s + len));
      s += len + 4 + rnd(seed + k * 1.3 + s * 0.7) * 30 * br;
    }
    d += o.gap * (0.75 + 0.6 * rnd(seed + k * 5.3));
    k++;
  }
  ctx.stroke();
  ctx.restore();
}

interface Cached { cv: HTMLCanvasElement; scale: number; w: number; h: number }
const CACHES = new Map<string, Cached>();
/** paints once into an offscreen canvas at device resolution and blits it after; repaints when the scale changes */
export function cache(ctx: Ctx, key: string, box: readonly [number, number, number, number], paint: (c: Ctx) => void) {
  const scale = ctx.getTransform().a;
  let e = CACHES.get(key);
  if (!e || Math.abs(e.scale - scale) > 1e-6) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(box[2] * scale));
    cv.height = Math.max(1, Math.ceil(box[3] * scale));
    const c = cv.getContext('2d');
    if (!c) return paint(ctx);
    c.setTransform(scale, 0, 0, scale, -box[0] * scale, -box[1] * scale);
    paint(c);
    e = { cv, scale, w: cv.width / scale, h: cv.height / scale };
    CACHES.set(key, e);
  }
  ctx.drawImage(e.cv, box[0], box[1], e.w, e.h);
}

/** a small grass tuft of tapered blades standing at (x, y); `bend` leans the tips sideways */
export function tuft(ctx: Ctx, x: number, y: number, h: number, n: number, color: string, seed: number, bend = 0, alpha = 1) {
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const hh = h * (0.55 + 0.6 * rnd(seed + i * 2.3));
    const lean = (u - 0.5) * h * 0.7 + bend * hh * 0.5;
    const bx = x + (u - 0.5) * h * 0.45;
    taper(ctx, [[bx, y], [bx + lean * 0.35, y - hh * 0.55], [bx + lean, y - hh]], 2.6, color, alpha, 0, 0.9);
  }
}
