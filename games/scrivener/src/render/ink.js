// Ink primitives: brush strokes, hatching, screentone, paper grain, blots.
// Owner: art. Browser-only (uses canvas). Deterministic: every random choice is
// seeded (hashNoise / seededFn), never Math.random, so captures are repeatable.

import { hashNoise, seededFn } from '../core/rng.js';

export const INK = '#0d0c0b';
export const INK_SOFT = '#2a2723';
export const PAPER = '#e7e0cc';
export const PAPER_DARK = '#cfc5ab';
export const GREY = '#7a7366';
export const RED = '#8e1b12';

const cache = new Map();

export function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Variable-width brush stroke along a polyline.
// pts: [[x,y],...]; width: max width; taper: 0..1 how thin the ends get;
// wobble: px of seeded lateral jitter; seed: int.
export function stroke(ctx, pts, { width = 4, taper = 0.85, wobble = 0, seed = 1, color = INK, alpha = 1, pressure = null } = {}) {
  if (pts.length < 2) return;
  const n = pts.length;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let dx = q[0] - o[0], dy = q[1] - o[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const t = i / (n - 1);
    const ends = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ;
    let wv = width * (1 - taper + taper * Math.pow(ends, 0.6));
    if (pressure) wv *= pressure(t);
    wv *= 0.85 + 0.3 * hashNoise(seed, i);
    const jit = wobble ? (hashNoise(seed + 7, i) - 0.5) * 2 * wobble : 0;
    const cx = p[0] - dy * jit, cy = p[1] + dx * jit;
    left.push([cx - dy * wv / 2, cy + dx * wv / 2]);
    right.push([cx + dy * wv / 2, cy - dx * wv / 2]);
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Straight brush line, subdivided so the width can breathe.
export function line(ctx, x0, y0, x1, y1, width = 3, opts = {}) {
  const segs = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 14));
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
  }
  stroke(ctx, pts, { width, ...opts });
}

// Quadratic curve as a brush stroke.
export function curve(ctx, x0, y0, cx, cy, x1, y1, width = 3, opts = {}) {
  const pts = [];
  const segs = 16;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, u = 1 - t;
    pts.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
  }
  stroke(ctx, pts, { width, ...opts });
}

// Parallel hatching clipped to `clipPath(ctx)` within bounds {x,y,w,h}.
export function hatch(ctx, clipPath, { x, y, w, h }, { angle = -0.9, gap = 6, width = 1, color = INK, alpha = 0.8, seed = 3, wobble = 0.6 } = {}) {
  ctx.save();
  ctx.beginPath();
  clipPath(ctx);
  ctx.clip();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  const cx = x + w / 2, cy = y + h / 2;
  const r = Math.hypot(w, h) / 2 + 4;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  ctx.beginPath();
  let i = 0;
  for (let d = -r; d <= r; d += gap, i++) {
    const j = (hashNoise(seed, i) - 0.5) * wobble * gap;
    const ox = cx - sa * (d + j), oy = cy + ca * (d + j);
    ctx.moveTo(ox - ca * r, oy - sa * r);
    ctx.lineTo(ox + ca * r, oy + sa * r);
  }
  ctx.stroke();
  ctx.restore();
}

export function crossHatch(ctx, clipPath, bounds, opts = {}) {
  hatch(ctx, clipPath, bounds, opts);
  hatch(ctx, clipPath, bounds, { ...opts, angle: (opts.angle ?? -0.9) + 1.3, seed: (opts.seed ?? 3) + 11 });
}

// Manga screentone dots.
export function tonePattern(ctx, dot = 1.4, gap = 5, color = INK) {
  const key = `tone:${dot}:${gap}:${color}`;
  if (!cache.has(key)) {
    const c = offscreen(gap * 2, gap * 2);
    const g = c.getContext('2d');
    g.fillStyle = color;
    for (const [px, py] of [[gap / 2, gap / 2], [gap * 1.5, gap * 1.5]]) {
      g.beginPath(); g.arc(px, py, dot, 0, Math.PI * 2); g.fill();
    }
    cache.set(key, c);
  }
  return ctx.createPattern(cache.get(key), 'repeat');
}

export function screentone(ctx, clipPath, opts = {}) {
  ctx.save();
  ctx.beginPath();
  clipPath(ctx);
  ctx.globalAlpha *= opts.alpha ?? 0.5;
  ctx.fillStyle = tonePattern(ctx, opts.dot, opts.gap, opts.color);
  ctx.fill();
  ctx.restore();
}

// Irregular ink blot.
export function blot(ctx, x, y, r, seed = 1, color = INK, alpha = 1) {
  const n = 14;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.7 + 0.5 * hashNoise(seed, i % n));
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.8;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Radial speed lines (manga focus lines).
export function speedLines(ctx, cx, cy, r0, r1, count, seed = 1, { color = INK, alpha = 0.9, width = 3 } = {}) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + hashNoise(seed, i) * 0.08;
    const inner = r0 * (0.85 + 0.4 * hashNoise(seed + 1, i));
    const x0 = cx + Math.cos(a) * inner, y0 = cy + Math.sin(a) * inner;
    const x1 = cx + Math.cos(a) * r1, y1 = cy + Math.sin(a) * r1;
    stroke(ctx, [[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2], [x1, y1]], {
      width: width * (0.5 + hashNoise(seed + 2, i)), taper: 1, color, alpha, seed: seed + i,
      pressure: (t) => 0.2 + t,
    });
  }
}

// Paper sheet with grain, fibres and a soft vignette. Cached by key.
export function paper(w, h, { seed = 9, base = PAPER, dark = PAPER_DARK, grain = 0.06 } = {}) {
  const key = `paper:${w}:${h}:${seed}:${base}`;
  if (cache.has(key)) return cache.get(key);
  const c = offscreen(w, h);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const rnd = seededFn(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 255 * grain;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = dark;
  g.globalAlpha = 0.25;
  for (let i = 0; i < 260; i++) {
    const x = rnd() * w, y = rnd() * h, l = 4 + rnd() * 18, a = rnd() * Math.PI;
    g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.globalAlpha = 1;
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(40,30,15,0.28)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  cache.set(key, c);
  return c;
}

// Text with a slight ink wobble (one glyph at a time).
export function inkText(ctx, text, x, y, { font = '20px serif', color = INK, align = 'left', seed = 1, wobble = 1.2, alpha = 1, reveal = 1 } = {}) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.globalAlpha *= alpha;
  ctx.textBaseline = 'alphabetic';
  const shown = text.slice(0, Math.ceil(text.length * reveal));
  const total = ctx.measureText(text).width;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (let i = 0; i < shown.length; i++) {
    const ch = shown[i];
    const dy = (hashNoise(seed, i) - 0.5) * wobble * 2;
    const rot = (hashNoise(seed + 5, i) - 0.5) * 0.06 * wobble;
    ctx.save();
    ctx.translate(cx, y + dy);
    ctx.rotate(rot);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    cx += ctx.measureText(ch).width;
  }
  ctx.restore();
}

// Word-wrap helper for canvas text.
export function wrapText(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}
