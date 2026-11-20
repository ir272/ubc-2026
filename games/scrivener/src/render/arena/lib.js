// Ruled-pen helpers for architecture. Owner: arena.
// Hard man-made edges are crisp ruled lines that taper at their ends (pen pressure).
// Hatching is ruled and follows a direction or a vanishing point. Every choice is seeded.

import { hashNoise } from '../../core/rng.js';
import { INK, PAPER } from '../ink.js';

export { INK, PAPER };

export function poly(g, pts) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

export function fillPoly(g, pts, color = INK, alpha = 1) {
  g.save();
  g.globalAlpha *= alpha;
  g.fillStyle = color;
  g.beginPath();
  poly(g, pts);
  g.fill();
  g.restore();
}

export function clipPoly(g, pts) {
  g.beginPath();
  poly(g, pts);
  g.clip();
}

// a ruled line as a thin quad that swells in the middle and tapers to `end` x width at both ends
export function rule(g, x0, y0, x1, y1, w = 1, { alpha = 1, color = INK, end = 0.25, bias = 0.5 } = {}) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const we = (w * end) / 2, wm = w / 2;
  const mx = x0 + dx * bias, my = y0 + dy * bias;
  g.save();
  g.globalAlpha *= alpha;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x0 + nx * we, y0 + ny * we);
  g.lineTo(mx + nx * wm, my + ny * wm);
  g.lineTo(x1 + nx * we, y1 + ny * we);
  g.lineTo(x1 - nx * we, y1 - ny * we);
  g.lineTo(mx - nx * wm, my - ny * wm);
  g.lineTo(x0 - nx * we, y0 - ny * we);
  g.closePath();
  g.fill();
  g.restore();
}

// polyline drawn with rule segments of varying weight
export function rulePath(g, pts, w = 1, opts = {}) {
  for (let i = 0; i < pts.length - 1; i++) {
    const t = i / Math.max(1, pts.length - 2);
    const ww = w * (0.55 + 0.45 * Math.sin(Math.PI * t));
    rule(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], ww, { end: 0.8, ...opts });
  }
}

// open stroke of a polyline in one path (cheap, for hairlines)
export function strokePts(g, pts, w = 1, color = INK, alpha = 1, close = false) {
  g.save();
  g.globalAlpha *= alpha;
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.closePath();
  g.stroke();
  g.restore();
}

// parallel ruled hatch across a bounding box at `angle` (radians, screen). Caller clips.
// Each line is a tapered quad so strokes start and end in a point.
export function hatchLines(g, { x, y, w, h }, { angle = 0, gap = 4, width = 0.8, alpha = 1, color = INK, seed = 1, jitter = 0.35, broken = 0 } = {}) {
  const cx = x + w / 2, cy = y + h / 2;
  const r = Math.hypot(w, h) / 2 + 2;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  g.save();
  g.globalAlpha *= alpha;
  g.fillStyle = color;
  g.beginPath();
  let i = 0;
  for (let d = -r; d <= r; d += gap, i++) {
    const j = (hashNoise(seed, i) - 0.5) * jitter * gap;
    const ox = cx - sa * (d + j), oy = cy + ca * (d + j);
    // stagger the ends so hatch edges feather instead of cutting square
    let a0 = -r - hashNoise(seed + 1, i) * 8, a1 = r + hashNoise(seed + 2, i) * 8;
    const ww = width * (0.8 + 0.4 * hashNoise(seed + 3, i));
    const segs = broken && hashNoise(seed + 4, i) < broken ? 2 : 1;
    for (let sgi = 0; sgi < segs; sgi++) {
      let b0 = a0, b1 = a1;
      if (segs === 2) {
        const cut = -r * 0.3 + hashNoise(seed + 5, i) * r * 0.6;
        if (sgi === 0) b1 = cut - 3; else b0 = cut + 3;
      }
      const x0 = ox + ca * b0, y0 = oy + sa * b0, x1 = ox + ca * b1, y1 = oy + sa * b1;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const nx = -sa * ww / 2, ny = ca * ww / 2;
      g.moveTo(x0, y0);
      g.lineTo(mx + nx, my + ny);
      g.lineTo(x1, y1);
      g.lineTo(mx - nx, my - ny);
      g.closePath();
    }
  }
  g.fill();
  g.restore();
}

// hatch lines radiating from a vanishing point, between angles a0..a1 and radii r0..r1.
// Lines drop out toward the VP so the density stays even on screen. Caller clips.
export function hatchVP(g, vp, { a0, a1, r0, r1, gap = 4, width = 0.8, alpha = 1, color = INK, seed = 1 } = {}) {
  const n = Math.max(2, Math.ceil(((a1 - a0) * r1) / gap));
  g.save();
  g.globalAlpha *= alpha;
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n + (hashNoise(seed, i) - 0.5) * ((a1 - a0) / n) * 0.4;
    // level of this line: 0 for every line, 1 for every 2nd, 2 for every 4th ...
    let lvl = 0;
    while (lvl < 6 && i % (1 << (lvl + 1)) === 0) lvl++;
    const rin = Math.max(r0, r1 / (1 << lvl)) * (0.85 + 0.3 * hashNoise(seed + 1, i));
    const rout = r1 + hashNoise(seed + 2, i) * 20;
    const ca = Math.cos(a), sa = Math.sin(a);
    const ww = width * (0.75 + 0.5 * hashNoise(seed + 3, i));
    const x0 = vp.x + ca * rin, y0 = vp.y + sa * rin, x1 = vp.x + ca * rout, y1 = vp.y + sa * rout;
    const t = 0.65; // swell toward the outer (near) end: thicker where closer
    const mx = x0 + (x1 - x0) * t, my = y0 + (y1 - y0) * t;
    const nx = -sa * ww / 2, ny = ca * ww / 2;
    g.moveTo(x0, y0);
    g.lineTo(mx + nx, my + ny);
    g.lineTo(x1 + nx * 0.4, y1 + ny * 0.4);
    g.lineTo(x1 - nx * 0.4, y1 - ny * 0.4);
    g.lineTo(mx - nx, my - ny);
    g.closePath();
  }
  g.fill();
  g.restore();
}

// paper (with its grain) laid back over a polygon: light by subtraction
let paperSrc = null;
export function setPaper(c) { paperSrc = c; }
export function paperPoly(g, pts, alpha = 1) {
  g.save();
  g.globalAlpha *= alpha;
  g.beginPath();
  poly(g, pts);
  g.clip();
  if (paperSrc) g.drawImage(paperSrc, 0, 0, 1280, 720);
  else { g.fillStyle = PAPER; g.fillRect(0, 0, 1280, 720); }
  g.restore();
}

// 4-point sparkle + fine rays: Obata's subtractive candle / glint
export function sparkle(g, x, y, r, { color = PAPER, rays = 10, seed = 1, alpha = 1, core = 0.22 } = {}) {
  g.save();
  g.globalAlpha *= alpha;
  g.fillStyle = color;
  // long cross
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + 0.06;
    const ca = Math.cos(a), sa = Math.sin(a);
    const L = r * (k % 2 ? 0.75 : 1.15);
    g.beginPath();
    g.moveTo(x + ca * L, y + sa * L);
    g.lineTo(x - sa * r * 0.07, y + ca * r * 0.07);
    g.lineTo(x + sa * r * 0.07, y - ca * r * 0.07);
    g.closePath();
    g.fill();
  }
  // fine rays
  for (let k = 0; k < rays; k++) {
    const a = (k / rays) * Math.PI * 2 + hashNoise(seed, k) * 0.5;
    const L = r * (0.35 + 0.55 * hashNoise(seed + 1, k));
    const ca = Math.cos(a), sa = Math.sin(a);
    g.beginPath();
    g.moveTo(x + ca * L, y + sa * L);
    g.lineTo(x - sa * 0.5, y + ca * 0.5);
    g.lineTo(x + sa * 0.5, y - ca * 0.5);
    g.closePath();
    g.fill();
  }
  g.beginPath();
  g.arc(x, y, r * core, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// gradated dot screentone: a 45-degree dot grid whose dot size follows value(x, y) in 0..1
// (tone gradient by dot size, never a smooth ramp). Caller clips.
export function dotTone(g, { x, y, w, h }, value, { gap = 3.4, color = INK, alpha = 1, angle = Math.PI / 4 } = {}) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const cx = x + w / 2, cy = y + h / 2;
  const r = Math.hypot(w, h) / 2 + gap;
  g.save();
  g.globalAlpha *= alpha;
  g.fillStyle = color;
  g.beginPath();
  for (let v = -r; v <= r; v += gap) {
    for (let u = -r; u <= r; u += gap) {
      const px = cx + u * ca - v * sa, py = cy + u * sa + v * ca;
      if (px < x - gap || px > x + w + gap || py < y - gap || py > y + h + gap) continue;
      const val = value(px, py);
      if (val <= 0.02) continue;
      const rad = gap * 0.62 * Math.sqrt(Math.min(1, val));
      g.moveTo(px + rad, py);
      g.arc(px, py, rad, 0, Math.PI * 2);
    }
  }
  g.fill();
  g.restore();
}
