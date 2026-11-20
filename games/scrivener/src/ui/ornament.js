// Ornaments for the HUD and cards: the Scrivener's nib seal, quill-nib bar
// finials, challenger medallion portraits, ink-well flasks, tally marks.
// Owner: ui. Browser-only, deterministic.

import { INK, PAPER, stroke, blot, tonePattern } from '../render/ink.js';
import { hashNoise } from '../core/rng.js';
import { clamp } from '../core/math.js';

const BAR_RED = '#a3241a';
const BAR_RED_DARK = '#5e110b';
const LAG = '#efe4c4';

// --- offscreen cache (drawn once at 2x, blitted every frame) ----------------
const cache = new Map();
export function cached(key, w, h, draw) {
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.ceil(w * 2);
    c.height = Math.ceil(h * 2);
    const g = c.getContext('2d');
    g.scale(2, 2);
    draw(g);
    cache.set(key, c);
  }
  return c;
}

// Fountain-pen nib pointing down, tip at (0, 62), top edge at y=-62 (unit space).
function nibPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(0, 64);
  ctx.bezierCurveTo(-8, 40, -30, 14, -27, -20);
  ctx.lineTo(-19, -38);
  ctx.lineTo(-19, -62);
  ctx.lineTo(19, -62);
  ctx.lineTo(19, -38);
  ctx.lineTo(27, -20);
  ctx.bezierCurveTo(30, 14, 8, 40, 0, 64);
  ctx.closePath();
}

function drawNib(ctx, color, bg) {
  nibPath(ctx);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = bg;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(0, 58); ctx.lineTo(0, -4); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -11, 5.5, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-21, -34); ctx.lineTo(21, -34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-14, -50); ctx.lineTo(14, -50); ctx.stroke();
}

// The Scrivener's seal: a double lozenge holding a pen nib, finials and a
// falling drop. `s` = scale (1 => ~260 px tall). broken: the nib snapped.
export function nibEmblem(ctx, cx, cy, s, { color = INK, bg = PAPER, broken = false, k = 1, drip = 1 } = {}) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.globalAlpha *= k;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineJoin = 'miter';
  // lozenges
  const loz = (h, w) => { ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(w, 0); ctx.lineTo(0, h); ctx.lineTo(-w, 0); ctx.closePath(); };
  ctx.lineWidth = 4; loz(100, 66); ctx.stroke();
  ctx.lineWidth = 1.6; loz(88, 56); ctx.stroke();
  // side flourishes
  for (const d of [-1, 1]) {
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(d * 66, 0);
    ctx.quadraticCurveTo(d * 84, -12, d * 96, -2);
    ctx.quadraticCurveTo(d * 102, 6, d * 94, 9);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(d * 104, 0, 3.2, 0, Math.PI * 2); ctx.fill();
  }
  // finials
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(-12, -106); ctx.lineTo(12, -106); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -116, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -122); ctx.lineTo(0, -132); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-12, 106); ctx.lineTo(12, 106); ctx.stroke();
  // nib
  ctx.save();
  ctx.scale(0.86, 0.86);
  if (!broken) drawNib(ctx, color, bg);
  else {
    const jag = (dir) => {
      ctx.beginPath();
      ctx.moveTo(-60, dir * 200);
      ctx.lineTo(-60, 6); ctx.lineTo(-20, 14); ctx.lineTo(-8, 2); ctx.lineTo(6, 16); ctx.lineTo(20, 4); ctx.lineTo(60, 10);
      ctx.lineTo(60, dir * 200);
      ctx.closePath();
    };
    ctx.save(); jag(-1); ctx.clip(); drawNib(ctx, color, bg); ctx.restore();
    ctx.save(); jag(1); ctx.clip(); ctx.translate(14, 18); ctx.rotate(0.32); drawNib(ctx, color, bg); ctx.restore();
  }
  ctx.restore();
  // falling drop below the lozenge
  if (drip > 0) {
    const dy = 112 + 22 * drip;
    ctx.globalAlpha *= Math.min(1, drip * 2);
    ctx.beginPath();
    ctx.moveTo(0, dy - 13);
    ctx.bezierCurveTo(5, dy - 4, 7, dy + 2, 0, dy + 6);
    ctx.bezierCurveTo(-7, dy + 2, -5, dy - 4, 0, dy - 13);
    ctx.fill();
  }
  ctx.restore();
}

// A small pen-nib finial for bar ends; points along +x when dir=1.
export function nibFinial(ctx, x, y, dir, len, { color = INK, bg = PAPER } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  const h = len * 0.34;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(len * 0.28, -h);
  ctx.quadraticCurveTo(len * 0.75, -h * 0.9, len, 0);
  ctx.quadraticCurveTo(len * 0.75, h * 0.9, len * 0.28, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = bg;
  ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(len * 0.42, 0); ctx.lineTo(len * 0.96, 0); ctx.stroke();
  ctx.beginPath(); ctx.arc(len * 0.38, 0, h * 0.24, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(len * 0.12, -h); ctx.lineTo(len * 0.12, h); ctx.stroke();
  ctx.restore();
}

// Challenger medallion: paper disc, screentone, hooded silhouette with the
// challenger's coloured sash, brushed ink ring + inner colour ring.
export function portrait(ctx, cx, cy, r, color, seed = 1) {
  const c = cached(`portrait:${color}:${r}`, r * 2 + 16, r * 2 + 16, (g) => {
    const o = r + 8;
    g.save();
    g.beginPath(); g.arc(o, o, r, 0, Math.PI * 2); g.clip();
    g.fillStyle = PAPER; g.fillRect(0, 0, o * 2, o * 2);
    g.fillStyle = tonePattern(g, 1.1, 4.2);
    g.globalAlpha = 0.5;
    g.fillRect(0, 0, o * 2, o * 2);
    g.globalAlpha = 1;
    // radial focus lines
    g.strokeStyle = INK;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + hashNoise(seed, i) * 0.1;
      g.lineWidth = 0.6 + hashNoise(seed + 1, i) * 1.2;
      g.globalAlpha = 0.35;
      g.beginPath();
      g.moveTo(o + Math.cos(a) * r * 0.62, o + Math.sin(a) * r * 0.62);
      g.lineTo(o + Math.cos(a) * r * 1.1, o + Math.sin(a) * r * 1.1);
      g.stroke();
    }
    g.globalAlpha = 1;
    // silhouette: cloak shoulders + hood
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(o - r * 0.95, o + r);
    g.quadraticCurveTo(o - r * 0.8, o + r * 0.22, o - r * 0.28, o + r * 0.12);
    g.lineTo(o + r * 0.3, o + r * 0.12);
    g.quadraticCurveTo(o + r * 0.85, o + r * 0.25, o + r * 0.95, o + r);
    g.closePath();
    g.fill();
    g.beginPath();
    g.ellipse(o + r * 0.02, o - r * 0.16, r * 0.34, r * 0.4, 0, 0, Math.PI * 2);
    g.fill();
    // hood peak
    g.beginPath();
    g.moveTo(o - r * 0.3, o - r * 0.32);
    g.quadraticCurveTo(o - r * 0.1, o - r * 0.78, o + r * 0.34, o - r * 0.66);
    g.quadraticCurveTo(o + r * 0.18, o - r * 0.42, o + r * 0.34, o - r * 0.2);
    g.closePath();
    g.fill();
    // eye glint
    g.fillStyle = PAPER;
    g.beginPath(); g.ellipse(o + r * 0.18, o - r * 0.14, r * 0.1, r * 0.035, -0.1, 0, Math.PI * 2); g.fill();
    // sash
    stroke(g, [[o - r * 0.6, o + r * 0.72], [o - r * 0.1, o + r * 0.42], [o + r * 0.55, o + r * 0.2]], { width: r * 0.2, color, seed: seed + 9, taper: 0.7 });
    g.restore();
    // rings
    g.strokeStyle = color;
    g.lineWidth = 2.5;
    g.beginPath(); g.arc(o, o, r - 3, 0, Math.PI * 2); g.stroke();
    const ring = [];
    for (let i = 0; i <= 40; i++) {
      const a = -Math.PI / 2 + (i / 40) * Math.PI * 2.04;
      ring.push([o + Math.cos(a) * (r + 1.5), o + Math.sin(a) * (r + 1.5)]);
    }
    stroke(g, ring, { width: 5.5, color: INK, seed: seed + 4, taper: 0.5 });
  });
  ctx.drawImage(c, cx - r - 8, cy - r - 8, r * 2 + 16, r * 2 + 16);
}

// Ink-well flask (full = coloured ink inside).
export function inkwell(ctx, x, y, full, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-3, -10); ctx.lineTo(3, -10); ctx.lineTo(3, -6);
  ctx.quadraticCurveTo(9, -5, 9, 1); ctx.lineTo(9, 6);
  ctx.quadraticCurveTo(9, 8, 7, 8); ctx.lineTo(-7, 8);
  ctx.quadraticCurveTo(-9, 8, -9, 6); ctx.lineTo(-9, 1);
  ctx.quadraticCurveTo(-9, -5, -3, -6); ctx.closePath();
  ctx.fillStyle = full ? color : 'rgba(231,224,204,0.6)';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (full) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(-6, -2, 2, 6);
  }
  ctx.fillStyle = INK;
  ctx.fillRect(-4, -13, 8, 3);
  ctx.restore();
}

// Tally marks (groups of five, the fifth struck across). Returns width used.
export function tally(ctx, x, y, n, { h = 14, gap = 5, color = PAPER, seed = 1, max = 15 } = {}) {
  const shown = Math.min(n, max);
  let cx = x;
  for (let i = 0; i < shown; i++) {
    const g = i % 5;
    if (g === 4) {
      const gx = cx - gap * 4 - 3;
      stroke(ctx, [[gx, y - h * 0.25], [cx - 1, y - h * 0.75]], { width: 2.2, color, seed: seed + i, taper: 0.6 });
      cx += gap + 3;
    } else {
      const tilt = (hashNoise(seed, i) - 0.5) * 2;
      stroke(ctx, [[cx + tilt, y - h], [cx - tilt, y]], { width: 2, color, seed: seed + i, taper: 0.6 });
      cx += gap;
    }
  }
  if (n > max) {
    ctx.save();
    ctx.font = '11px Cochin, Georgia, serif';
    ctx.fillStyle = color;
    ctx.fillText(`+${n - max}`, cx + 2, y);
    ctx.restore();
    cx += 20;
  }
  return cx - x;
}

// Seeded spray of ink drops around a point.
export function spray(ctx, cx, cy, n, spread, seed, color = INK, alpha = 1, k = 1) {
  for (let i = 0; i < n; i++) {
    const a = hashNoise(seed, i) * Math.PI * 2;
    const d = spread * (0.35 + hashNoise(seed + 1, i) * 0.65) * (0.6 + 0.4 * k);
    const r = 1.2 + Math.pow(hashNoise(seed + 2, i), 3) * 7;
    blot(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, r, seed * 31 + i, color, alpha);
  }
}

// A wide sumi brush band from x0 to x0+w*reveal (y = centre line): blunt,
// slightly swollen head; smooth wavering edges; the tail splits into bristles.
const wav = (seed, x, f) => Math.sin(x * f + seed * 1.7) * 0.6 + Math.sin(x * f * 2.3 + seed * 3.1) * 0.3 + Math.sin(x * f * 5.1 + seed) * 0.1;
export function brushBand(ctx, x0, w, y, thick, { color = INK, seed = 1, reveal = 1, streak = 'rgba(231,224,204,0.10)' } = {}) {
  if (reveal <= 0) return;
  const x1 = x0 + w * reveal;
  const body = Math.max(x0 + 1, x1 - Math.min(140, w * 0.14));
  const half = thick / 2;
  const n = 48;
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + (body - x0) * (i / n);
    const t = (x - x0) / Math.max(1, w);
    const swell = 1 + 0.08 * Math.exp(-t * 18) - 0.12 * t;
    top.push([x, y - half * swell + wav(seed, x, 0.011) * 5 - (x - x0) * 0.012]);
    bot.push([x, y + half * swell + wav(seed + 9, x, 0.013) * 5 - (x - x0) * 0.012]);
  }
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(top[0][0] + 10, top[0][1]);
  for (const p of top) ctx.lineTo(p[0], p[1]);
  for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
  // blunt, rounded head
  ctx.quadraticCurveTo(x0 - 18, y + (hashNoise(seed, 1) - 0.5) * 10, top[0][0] + 10, top[0][1]);
  ctx.closePath();
  ctx.fill();
  // bristle tail: many fine strands of uneven length; the brush runs dry
  const bristles = 34;
  const ty = top[n][1], by = bot[n][1];
  const tl = x1 - body;
  for (let i = 0; i < bristles; i++) {
    const f = (i + 0.5) / bristles;
    const yy = ty + (by - ty) * f;
    const edge = Math.abs(f - 0.5) * 2;               // strands at the edges run out first
    const r = hashNoise(seed + 21, i);
    const len = tl * (0.2 + 0.8 * Math.pow(r, 0.7)) * (1 - 0.45 * edge * edge);
    const wdt = ((by - ty) / bristles) * (1.1 + hashNoise(seed + 22, i) * 1.3);
    const drift = (f - 0.5) * len * 0.05 - len * 0.012;
    ctx.beginPath();
    ctx.moveTo(body - 4, yy - wdt / 2);
    ctx.quadraticCurveTo(body + len * 0.5, yy - wdt * 0.45 + drift * 0.5, body + len, yy + drift);
    ctx.quadraticCurveTo(body + len * 0.5, yy + wdt * 0.45 + drift * 0.5, body - 4, yy + wdt / 2);
    ctx.closePath();
    ctx.fill();
  }
  // dry streaks inside the body
  ctx.strokeStyle = streak;
  for (let i = 0; i < 9; i++) {
    const yy = y + (hashNoise(seed + 11, i) - 0.5) * thick * 0.8;
    const a = x0 + (body - x0) * (0.25 + hashNoise(seed + 12, i) * 0.5);
    const b = Math.min(body, a + (body - x0) * (0.2 + hashNoise(seed + 13, i) * 0.4));
    ctx.lineWidth = 0.8 + hashNoise(seed + 14, i) * 1.4;
    ctx.beginPath(); ctx.moveTo(a, yy - (a - x0) * 0.012); ctx.lineTo(b, yy - (b - x0) * 0.012); ctx.stroke();
  }
  ctx.restore();
}

// ---- quill bar: ink casing, red fill, paper lag, nib finial ------------------
export function quillBar(ctx, x, y, w, h, frac, lag, { fill = BAR_RED, dark = BAR_RED_DARK, ticks = 0, finial = 'right', clasp = null, casing = INK, channel = '#2b2722' } = {}) {
  frac = clamp(frac, 0, 1);
  lag = clamp(Math.max(lag, frac), 0, 1);
  ctx.save();
  // casing
  ctx.fillStyle = casing;
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  // empty channel
  ctx.fillStyle = channel;
  ctx.fillRect(x, y, w, h);
  if (lag > frac) {
    ctx.fillStyle = LAG;
    ctx.fillRect(x + w * frac, y, w * (lag - frac), h);
  }
  if (frac > 0) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w * frac, h);
    ctx.fillStyle = dark;
    ctx.fillRect(x, y + h * 0.62, w * frac, h * 0.38);
    ctx.fillStyle = 'rgba(255,236,214,0.28)';
    ctx.fillRect(x, y + 1, w * frac, Math.max(1, h * 0.18));
  }
  if (ticks) {
    ctx.fillStyle = INK;
    for (let i = 1; i < ticks; i++) ctx.fillRect(Math.round(x + (w * i) / ticks) - 1, y, 2, h);
  }
  ctx.restore();
  const fl = h * 2.6 + 10;
  if (finial === 'right' || finial === 'both') nibFinial(ctx, x + w + 2, y + h / 2, 1, fl, { color: casing });
  if (finial === 'both') nibFinial(ctx, x - 2, y + h / 2, -1, fl, { color: casing });
  if (finial === 'right') {
    // a squared cap on the left end
    ctx.fillStyle = casing;
    ctx.fillRect(x - 7, y - 6, 5, h + 12);
  }
  if (clasp != null) {
    const cx = x + w * clasp, cy = y + h / 2;
    ctx.save();
    ctx.fillStyle = PAPER;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy - h - 6); ctx.lineTo(cx + 9, cy); ctx.lineTo(cx, cy + h + 6); ctx.lineTo(cx - 9, cy); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

