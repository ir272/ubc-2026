// Pen primitives for the character art. Owner: art.
// Everything here is a filled polygon (pen pressure), never a uniform canvas stroke,
// so lines taper, swell on the shadow side and thin to a hairline on the lit side.
// Deterministic: all jitter comes from hashNoise.

import { hashNoise } from '../../core/rng.js';
import { INK, PAPER, tonePattern } from '../ink.js';

// Light comes from up-front of the figure (local coords, x = facing direction).
export const SHADOW_SWELL = 1.4;
export const LIGHT = (() => { const l = Math.hypot(0.45, -1); return [0.45 / l, -1 / l]; })();

// Catmull-Rom resample of a control polyline.
export function spline(pts, per = 4, closed = false) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const out = [];
  const get = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

// Quadratic bezier sample.
export function quad(a, c, b, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

// Append a variable-width ribbon (wf(t,i) -> width) to the current path.
export function ribbonPath(ctx, pts, wf) {
  const n = pts.length;
  if (n < 2) return;
  const L = new Array(n), R = new Array(n);
  for (let i = 0; i < n; i++) {
    const q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let dx = q[0] - o[0], dy = q[1] - o[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const w = wf(i / (n - 1), i) * 0.5;
    const p = pts[i];
    L[i] = [p[0] - dy * w, p[1] + dx * w];
    R[i] = [p[0] + dy * w, p[1] - dx * w];
  }
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
}

export function ribbon(ctx, pts, wf, color = INK) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ribbonPath(ctx, pts, wf);
  ctx.fill();
}

// Pen stroke: swells from a point to w and back. head/tail = fraction of length spent tapering.
export function penPath(ctx, pts, w, head = 0.2, tail = 0.35, seed = 0) {
  ribbonPath(ctx, pts, (t, i) => {
    const a = head > 0 ? Math.min(1, t / head) : 1;
    const b = tail > 0 ? Math.min(1, (1 - t) / tail) : 1;
    const k = Math.min(a, b);
    return w * (0.08 + 0.92 * Math.sqrt(Math.max(0, k))) * (seed ? 0.88 + 0.24 * hashNoise(seed, i) : 1);
  });
}
export function pen(ctx, pts, w, color = INK, head = 0.2, tail = 0.35, seed = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  penPath(ctx, pts, w, head, tail, seed);
  ctx.fill();
}

// A spike / quill / claw / tatter: full width w at the base, a sharp point at the tip.
// bend bows it sideways (px, + = to the left of base->tip).
export function spikePts(base, tip, bend = 0, n = 7) {
  const mx = (base[0] + tip[0]) / 2, my = (base[1] + tip[1]) / 2;
  const dx = tip[0] - base[0], dy = tip[1] - base[1];
  const len = Math.hypot(dx, dy) || 1;
  const c = [mx - (dy / len) * bend, my + (dx / len) * bend];
  return quad(base, c, tip, n);
}
// round 27: a brush-pressed thorn, not a polygon: full at the root, a slight belly,
// then concave flanks that draw out into a needle
export function spikePath(ctx, base, tip, w, bend = 0, n = 11) {
  ribbonPath(ctx, spikePts(base, tip, bend, Math.max(n, 11)), (t) => w * Math.pow(1 - t, 1.45) * (1 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 2))) + 0.03);
}
export function spike(ctx, base, tip, w, bend = 0, color = INK) {
  ctx.fillStyle = color;
  ctx.beginPath();
  spikePath(ctx, base, tip, w, bend);
  ctx.fill();
}

// Outline a polygon with a pen line that is heavy on the side facing away from the
// light and thins to a hairline (with breaks) on the lit side.
export function contour(ctx, pts, { closed = true, min = 0.5, max = 2.6, light = LIGHT, color = INK, breaks = true, seed = 5, batch = false } = {}) {
  const n = pts.length;
  if (n < 2) return;
  // signed area tells which normal points outward
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sgn = area > 0 ? -1 : 1;
  const W = new Array(n);
  for (let i = 0; i < n; i++) {
    const q = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
    const o = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
    let dx = q[0] - o[0], dy = q[1] - o[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * sgn, ny = (dx / len) * sgn; // outward normal
    const lit = nx * light[0] + ny * light[1]; // 1 = faces the light
    const k = Math.max(0, Math.min(1, 0.5 - lit * 0.75));
    // the shadow side swells well past the nominal max (pen pressure), the lit side
    // drops to a hairline
    W[i] = min * 0.85 + (max * SHADOW_SWELL - min * 0.85) * Math.pow(k * k * (3 - 2 * k), 1.25);
    if (breaks && lit > 0.55 && hashNoise(seed, i) < 0.4) W[i] = 0;
  }
  if (!batch) { ctx.fillStyle = color; ctx.beginPath(); }
  const loop = closed ? pts.concat([pts[0]]) : pts;
  const WW = closed ? W.concat([W[0]]) : W;
  // split into runs so breaks are real gaps
  let run = [], rw = [];
  const flush = () => {
    if (run.length > 1) ribbonPath(ctx, run, (t, i) => rw[i]);
    run = []; rw = [];
  };
  for (let i = 0; i < loop.length; i++) {
    if (WW[i] <= 0.01) { flush(); continue; }
    run.push(loop[i]); rw.push(WW[i]);
  }
  flush();
  if (!batch) ctx.fill();
}

export function polyPath(ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
export function poly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  polyPath(ctx, pts);
  ctx.fill();
}

// Dot screentone clipped to a polygon.
export function tone(ctx, pts, { dot = 1.1, gap = 4, alpha = 1, color = INK } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = tonePattern(ctx, dot, gap, color);
  ctx.beginPath();
  polyPath(ctx, pts);
  ctx.fill();
  ctx.restore();
}

// Hatch strokes that wrap a cylinder (axis A->B, radius r(s)): short tapered strokes
// starting at the shadow edge and curving across the form. Appends to the current path.
export function wrapHatchPath(ctx, A, B, rA, rB, { from = 0.05, to = 0.95, step = 5, reach = 0.75, side = -1, width = 1.1, curl = 0.35, seed = 1 } = {}) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy * side, ny = ux * side;
  const count = Math.max(1, Math.floor(((to - from) * len) / step));
  for (let k = 0; k <= count; k++) {
    const s = from + ((to - from) * k) / count;
    const r = rA + (rB - rA) * s;
    const cx = A[0] + dx * s, cy = A[1] + dy * s;
    const rr = reach * (0.75 + 0.5 * hashNoise(seed, k));
    const e = [cx + nx * r, cy + ny * r];
    const m = [cx + nx * r * (1 - rr) + ux * r * curl, cy + ny * r * (1 - rr) + uy * r * curl];
    const c = [cx + nx * r * (1 - rr * 0.5) + ux * r * curl * 0.2, cy + ny * r * (1 - rr * 0.5) + uy * r * curl * 0.2];
    ribbonPath(ctx, [e, c, m], (t) => width * (1 - t * 0.92));
  }
}

// Small closed ornaments: a bead with ink contour and a highlight dot.
export function beadsPath(ctx, list) {
  for (const [x, y, r] of list) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
}

export { INK, PAPER };
