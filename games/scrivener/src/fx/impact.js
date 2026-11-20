// Impact primitives in Obata's language. Owner: feedback.
//   focusLines   集中線: tapered wedges converging on a point, leaving a void
//   impactStar   white jagged impact void with an ink contour
//   slashArc     the blade's crescent, white core with ink edges
//   motionLines  流線: parallel streaks behind a body in motion
// All geometry is seeded; each draws as one or two filled paths (cheap).

import { hashNoise } from '../core/rng.js';
import { INK, PAPER } from '../render/ink.js';

// Wedges from radius r1 (outside) narrowing to a point near r0 (inside).
// count lines, width = max wedge half-angle in px at r1. jitter on inner radius.
export function focusLines(ctx, cx, cy, r0, r1, count, seed, { color = INK, alpha = 1, width = 7, jitter = 0.45, sx = 1, sy = 1 } = {}) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (hashNoise(seed, i) - 0.5) * (Math.PI * 2 / count) * 1.6;
    const inner = r0 * (1 + (hashNoise(seed + 1, i) - 0.2) * jitter * 2);
    const wv = width * (0.25 + hashNoise(seed + 2, i) * 1.1);
    const c = Math.cos(a), s = Math.sin(a);
    const px = -s, py = c;
    ctx.moveTo(cx + c * inner * sx, cy + s * inner * sy);
    ctx.lineTo(cx + (c * r1 + px * wv) * sx, cy + (s * r1 + py * wv) * sy);
    ctx.lineTo(cx + (c * r1 - px * wv) * sx, cy + (s * r1 - py * wv) * sy);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

function starPath(ctx, cx, cy, rIn, rOut, spikes, seed, rot) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = rot + (i / (spikes * 2)) * Math.PI * 2 + (hashNoise(seed, i) - 0.5) * 0.18;
    const long = i % 2 === 0;
    const r = long ? rOut * (0.45 + 0.75 * hashNoise(seed + 9, i)) : rIn * (0.8 + 0.4 * hashNoise(seed + 4, i));
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.86;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// White impact void: big jagged star, ink contour, inner star.
export function impactStar(ctx, cx, cy, size, seed, { fill = PAPER, edge = INK, alpha = 1, edgeW = 3.5, spikes = 11, rot = 0, core = INK } = {}) {
  if (alpha <= 0 || size <= 1) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineJoin = 'miter';
  starPath(ctx, cx, cy, size * 0.32, size, spikes, seed, rot);
  ctx.fillStyle = fill;
  ctx.fill();
  if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = edgeW; ctx.stroke(); }
  // inner burst
  if (core) {
    starPath(ctx, cx, cy, size * 0.1, size * 0.42, Math.max(5, spikes - 4), seed + 31, rot + 0.3);
    ctx.lineWidth = edgeW * 0.6;
    ctx.stroke();
  }
  ctx.restore();
}

// Crescent slash: a thick-to-thin moon arc. dir: +1/-1 facing. p: 0..1 draw-on.
export function slashArc(ctx, cx, cy, radius, dir, seed, { p = 1, alpha = 1, width = 18, tilt = -0.5, span = 2.3, fill = PAPER, edge = INK } = {}) {
  if (alpha <= 0) return;
  const a0 = tilt - span / 2, a1 = a0 + span * Math.min(1, p);
  const n = 22;
  const outer = [], inner = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    const w = width * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (0.85 + 0.3 * hashNoise(seed, i));
    const c = Math.cos(a) * dir, s = Math.sin(a);
    outer.push([cx + c * (radius + w * 0.5), cy + s * (radius + w * 0.5)]);
    inner.push([cx + c * (radius - w * 0.5), cy + s * (radius - w * 0.5)]);
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.moveTo(outer[0][0], outer[0][1]);
  for (const q of outer) ctx.lineTo(q[0], q[1]);
  for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 2.5; ctx.stroke(); }
  // swing trails: thin concentric arcs lagging behind the crescent
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const rr = radius + width * 0.75 + k * 7;
      const lag = 0.25 + 0.15 * k + 0.1 * hashNoise(seed + 40, k);
      const b0 = a0 + (a1 - a0) * lag * 0.6, b1 = a1 - (a1 - a0) * lag * 0.35;
      if (b1 <= b0) continue;
      ctx.lineWidth = 2.2 - k * 0.4;
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = b0 + (b1 - b0) * (i / 12);
        const x = cx + Math.cos(a) * dir * rr, y = cy + Math.sin(a) * rr;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Parallel streaks behind a moving body. (x, y) = body centre, dir = travel dir.
export function motionLines(ctx, x, y, dir, len, h, count, seed, { color = INK, alpha = 1, width = 3, halo = null } = {}) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const path = (grow) => {
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const yy = y + (hashNoise(seed, i) - 0.5) * h;
      const l = len * (0.4 + 0.8 * hashNoise(seed + 1, i));
      const x0 = x - dir * (10 + hashNoise(seed + 2, i) * 20);
      const x1 = x0 - dir * l;
      const w = width * (0.4 + hashNoise(seed + 3, i)) + grow;
      ctx.moveTo(x0 + dir * grow, yy - w / 2);
      ctx.lineTo(x1 - dir * grow, yy);
      ctx.lineTo(x0 + dir * grow, yy + w / 2);
      ctx.closePath();
    }
  };
  if (halo) { path(4); ctx.fillStyle = halo; ctx.fill(); }
  path(0);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// Jagged crack across a figure: a polyline from (x0,y0) to (x1,y1) with branches.
export function crack(ctx, x0, y0, x1, y1, seed, { color = INK, width = 4, alpha = 1, branches = 4 } = {}) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'round';
  const n = 9;
  const pts = [];
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = (i === 0 || i === n) ? 0 : (hashNoise(seed, i) - 0.5) * L * 0.14;
    pts.push([x0 + dx * t + nx * off, y0 + dy * t + ny * off]);
  }
  ctx.lineWidth = width;
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
  ctx.stroke();
  ctx.lineWidth = width * 0.5;
  ctx.beginPath();
  for (let b = 0; b < branches; b++) {
    const k = 1 + Math.floor(hashNoise(seed + 5, b) * (n - 2));
    const [bx, by] = pts[k];
    const side = hashNoise(seed + 6, b) < 0.5 ? -1 : 1;
    const bl = L * (0.08 + 0.12 * hashNoise(seed + 7, b));
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + (dx / L) * bl * 0.6 + nx * side * bl, by + (dy / L) * bl * 0.6 + ny * side * bl);
  }
  ctx.stroke();
  ctx.restore();
}
