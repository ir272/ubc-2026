// Engraving primitives for the fighters and the item plates. Owner: art.
// Two moves do almost all the tonal work, the way a burin does:
//   * hatchIn(..., { mode: 'lit',    color: PAPER })  white lines cut into a black mass,
//     thick where the light falls, gone in the shadow (scraperboard);
//   * hatchIn(..., { mode: 'shadow', color: INK })    black lines laid on paper,
//     thick in the shadow, thinning to nothing toward the light.
// Lines are filled pen ribbons (pressure), clipped to the form, optionally bowed so they
// wrap round it. Deterministic: jitter from hashNoise only.

import { hashNoise } from '../../core/rng.js';
import { INK, PAPER } from '../ink.js';
import { LIGHT, ribbonPath, polyPath, contour, quad, penPath } from '../art/pen.js';

export const BONE = '#ece6d4';
export const BONE_SHADE = '#d9d0b8';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function bbox(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}

// Parallel (optionally bowed) hatch inside a polygon. Width of each line is modulated by
// the light: mode 'lit' -> wide on the lit side, 'shadow' -> wide on the shadow side.
export function hatchIn(ctx, pts, o = {}) {
  const {
    angle = 1.2, gap = 4, w = 1.2, color = PAPER, mode = 'lit', gamma = 1.3, seed = 1,
    wobble = 0.35, bend = 0, lo = 0, hi = 1, light = LIGHT, n = 12, bias = 0, clip = true,
    flat = 0, box = null, phase = 0,
  } = o;
  if (!pts || pts.length < 3) return;
  const bb = box || bbox(pts);
  const R = Math.hypot(bb.w, bb.h) / 2 + gap;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const nx = -uy, ny = ux;
  const ext = Math.abs(bb.w * light[0]) / 2 + Math.abs(bb.h * light[1]) / 2 + 1e-3;
  ctx.save();
  if (clip) { ctx.beginPath(); polyPath(ctx, pts); ctx.clip(); }
  ctx.fillStyle = color;
  ctx.beginPath();
  let i = 0;
  for (let d = -R + phase * gap; d <= R; d += gap, i++) {
    const j = (hashNoise(seed, i) - 0.5) * wobble * gap;
    const line = [], ws = [];
    const wl = 0.8 + 0.4 * hashNoise(seed + 3, i);
    for (let k = 0; k <= n; k++) {
      const s = -1 + (2 * k) / n;
      const b = bend * (1 - s * s);
      const px = bb.cx + ux * s * R + nx * (d + j + b);
      const py = bb.cy + uy * s * R + ny * (d + j + b);
      const tn = clamp01(0.5 + bias + (((px - bb.cx) * light[0] + (py - bb.cy) * light[1]) / ext) * 0.55);
      let f = mode === 'lit' ? tn : 1 - tn;
      f = clamp01((f - lo) / Math.max(1e-3, hi - lo));
      f = flat + (1 - flat) * Math.pow(f, gamma);
      line.push([px, py]);
      ws.push(w * f * wl);
    }
    ribbonPath(ctx, line, (t, k) => ws[k]);
  }
  ctx.fill();
  ctx.restore();
}

// A thin paper line just inside the lit edge of a black mass: the engraver's rim light.
// inset / w in device px (scaled by D).
export function rimLight(ctx, pts, { D = 1, inset = 1.6, w = 1.3, min = 0.15, seed = 1, breaks = 0.18, light = LIGHT, color = PAPER } = {}) {
  const n = pts.length;
  if (n < 3) return;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? -1 : 1;
  const inner = [], W = [];
  for (let i = 0; i < n; i++) {
    const q = pts[(i + 1) % n], o = pts[(i - 1 + n) % n];
    let dx = q[0] - o[0], dy = q[1] - o[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * sgn, ny = (dx / len) * sgn;
    const lit = nx * light[0] + ny * light[1];
    let k = clamp01((lit - min) / (1 - min));
    if (breaks && hashNoise(seed, i >> 2) < breaks) k = 0;
    inner.push([pts[i][0] - nx * inset * D, pts[i][1] - ny * inset * D]);
    W.push(w * D * Math.pow(k, 0.7));
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  let run = [], rw = [];
  const flush = () => { if (run.length > 2) ribbonPath(ctx, run, (t, i) => rw[i] * Math.min(1, Math.sin(Math.PI * t) * 3)); run = []; rw = []; };
  for (let i = 0; i <= n; i++) {
    const j = i % n;
    if (W[j] <= 0.02 * D) { flush(); continue; }
    run.push(inner[j]); rw.push(W[j]);
  }
  flush();
  ctx.fill();
}

// A black mass with white cut lines on its lit side.
export function inkForm(ctx, pts, { carve = null, color = INK } = {}) {
  ctx.fillStyle = color;
  ctx.beginPath(); polyPath(ctx, pts); ctx.fill();
  if (carve) hatchIn(ctx, pts, { mode: 'lit', color: PAPER, ...carve });
}

// A paper form: fill, black hatch on the shadow side, a pressure contour.
export function paperForm(ctx, pts, { fill = PAPER, hatch = null, cross = null, line = { min: 0.5, max: 1.6 } } = {}) {
  ctx.fillStyle = fill;
  ctx.beginPath(); polyPath(ctx, pts); ctx.fill();
  if (hatch) hatchIn(ctx, pts, { mode: 'shadow', color: INK, ...hatch });
  if (cross) hatchIn(ctx, pts, { mode: 'shadow', color: INK, ...cross });
  if (line) contour(ctx, pts, { ...line });
}

// Carved fold: a white pen stroke along a quadratic.
export function fold(ctx, a, c, b, w, color = PAPER, head = 0.3, tail = 0.35) {
  ctx.fillStyle = color;
  ctx.beginPath(); penPath(ctx, quad(a, c, b, 8), w, head, tail); ctx.fill();
}
export function foldsPath(ctx, list) {
  for (const [a, c, b, w, h = 0.3, tl = 0.35] of list) penPath(ctx, quad(a, c, b, 8), w, h, tl);
}

// Ellipse as a polygon.
export function ellPts(cx, cy, rx, ry, rot = 0, n = 28, a0 = 0, a1 = Math.PI * 2) {
  const out = [];
  const c = Math.cos(rot), s = Math.sin(rot);
  const full = Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6;
  const m = full ? n : n + 1;
  for (let i = 0; i < m; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}

// Rotated rectangle polygon around centre.
export function rectPts(cx, cy, w, h, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

// Stipple (dot) shading with the light falloff. For skin and lit metal at large scale.
export function stipple(ctx, pts, { r = 0.6, gap = 3, color = INK, seed = 4, mode = 'shadow', lo = 0.35, light = LIGHT } = {}) {
  const bb = bbox(pts);
  const ext = Math.abs(bb.w * light[0]) / 2 + Math.abs(bb.h * light[1]) / 2 + 1e-3;
  ctx.save();
  ctx.beginPath(); polyPath(ctx, pts); ctx.clip();
  ctx.fillStyle = color;
  ctx.beginPath();
  let i = 0;
  for (let y = bb.y0; y <= bb.y1; y += gap) {
    for (let x = bb.x0; x <= bb.x1; x += gap, i++) {
      const jx = x + (hashNoise(seed, i) - 0.5) * gap, jy = y + (hashNoise(seed + 1, i) - 0.5) * gap;
      const tn = clamp01(0.5 + (((jx - bb.cx) * light[0] + (jy - bb.cy) * light[1]) / ext) * 0.55);
      const f = mode === 'lit' ? tn : 1 - tn;
      if (f < lo || hashNoise(seed + 2, i) > (f - lo) / (1 - lo) + 0.15) continue;
      ctx.moveTo(jx + r, jy); ctx.arc(jx, jy, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
}

export { INK, PAPER, contour };
