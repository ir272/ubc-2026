// Lettering + manga furniture shared by the HUD, the cards and the freeze page.
// Owner: ui. Browser-only. Deterministic (no Math.random).
//
//   FONT.roman / caps / letter / sfx / hand      font stacks (system fonts only)
//   spaced(ctx, text, x, y, opts)                letter-spaced caps, centred correctly
//   fitText(ctx, text, fontFn, maxW, maxH, sizes) -> { size, lines, lh }
//   speechBalloon / thoughtBalloon / captionBox  ink-bordered manga balloons
//   letterLines(ctx, lines, cx, cy, size, opts)   centred manga lettering block

import { INK, PAPER } from '../render/ink.js';
import { hashNoise } from '../core/rng.js';

export const FONT = {
  roman: '"Big Caslon", "Iowan Old Style", Palatino, Georgia, serif',
  caps: 'Cochin, "Iowan Old Style", Palatino, Georgia, serif',
  letter: '"Chalkboard SE", "Comic Sans MS", "Segoe Print", sans-serif',
  sfx: '"Avenir Next Condensed", "Arial Narrow", Impact, sans-serif',
  hand: '"Bradley Hand", "Segoe Print", cursive',
  num: 'Baskerville, "Iowan Old Style", Palatino, Georgia, serif',   // lining numerals
};

export const BALLOON = '#f7f3e8';

// Letter-spaced text. `align` center compensates for the trailing spacing.
export function spaced(ctx, text, x, y, { font, color = INK, spacing = 0, align = 'left', halo = 0, haloColor = PAPER, alpha = 1, baseline = 'alphabetic' } = {}) {
  ctx.save();
  ctx.font = font;
  ctx.letterSpacing = `${spacing}px`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.globalAlpha *= alpha;
  const dx = align === 'center' ? spacing / 2 : align === 'right' ? spacing : 0;
  if (halo) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = halo;
    ctx.strokeStyle = haloColor;
    ctx.strokeText(text, x + dx, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x + dx, y);
  ctx.restore();
}

export function measureSpaced(ctx, text, font, spacing = 0) {
  ctx.save();
  ctx.font = font;
  ctx.letterSpacing = `${spacing}px`;
  const w = ctx.measureText(text).width - spacing;
  ctx.restore();
  return w;
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Largest size in `sizes` (descending) whose wrapped block fits maxW x maxH.
export function fitText(ctx, text, fontFn, maxW, maxH, sizes, lineH = 1.18) {
  ctx.save();
  let best = null;
  for (const s of sizes) {
    ctx.font = fontFn(s);
    const lines = wrap(ctx, text, maxW);
    const h = lines.length * s * lineH;
    const wMax = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    best = { size: s, lines, lh: s * lineH, w: wMax, h };
    if (h <= maxH && wMax <= maxW) break;
  }
  ctx.restore();
  return best;
}

// Centred block of manga lettering (slight italic shear, like hand lettering).
export function letterLines(ctx, lines, cx, cy, size, { color = INK, font = null, lh = size * 1.18, shear = -0.12, alpha = 1, reveal = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = font || `bold ${size}px ${FONT.letter}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const total = lines.reduce((n, l) => n + l.length, 0);
  let budget = Math.ceil(total * reveal);
  const y0 = cy - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => {
    if (budget <= 0) return;
    const shown = l.slice(0, budget);
    budget -= l.length;
    ctx.save();
    ctx.translate(cx, y0 + i * lh);
    ctx.transform(1, 0, shear, 1, 0, 0);
    if (shown.length < l.length) {
      ctx.textAlign = 'left';
      ctx.fillText(shown, -ctx.measureText(l).width / 2, 0);
    } else ctx.fillText(l, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

// Speech balloon: an ellipse with a tapering tail to (tx,ty).
export function speechBalloon(ctx, cx, cy, rx, ry, tail, { fill = BALLOON, line = INK, width = 2.6, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  if (tail) {
    const [tx, ty] = tail;
    const ang = Math.atan2(ty - cy, tx - cx);
    const bx = cx + Math.cos(ang) * rx * 0.86, by = cy + Math.sin(ang) * ry * 0.86;
    const nx = -Math.sin(ang) * 13, ny = Math.cos(ang) * 13;
    ctx.moveTo(bx + nx, by + ny);
    ctx.quadraticCurveTo((bx + tx) / 2 + nx * 0.3, (by + ty) / 2 + ny * 0.3, tx, ty);
    ctx.quadraticCurveTo((bx + tx) / 2 - nx * 0.1, (by + ty) / 2 - ny * 0.1, bx - nx, by - ny);
  }
  ctx.fillStyle = fill;
  ctx.fill('nonzero');
  ctx.lineWidth = width;
  ctx.strokeStyle = line;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // repaint the interior so the tail seam disappears
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - width / 2, ry - width / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Thought balloon: a scalloped cloud plus a trail of bubbles toward (tx,ty).
export function thoughtBalloon(ctx, cx, cy, rx, ry, tail, { fill = BALLOON, line = INK, width = 2.4, seed = 1, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const n = Math.max(10, Math.round((rx + ry) / 13));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hashNoise(seed, i) * 0.12;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  const path = () => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      const ox = mx - cx, oy = my - cy;
      const L = Math.hypot(ox / rx, oy / ry) || 1;
      const bulge = 0.16 + 0.07 * hashNoise(seed + 3, i);
      const kx = cx + (ox / L) * (1 + bulge), ky = cy + (oy / L) * (1 + bulge);
      if (i === 0) ctx.moveTo(p[0], p[1]);
      ctx.quadraticCurveTo(kx, ky, q[0], q[1]);
    }
    ctx.closePath();
  };
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = line;
  ctx.lineJoin = 'round';
  ctx.stroke();
  if (tail) {
    const [tx, ty] = tail;
    const ang = Math.atan2(ty - cy, tx - cx);
    const ex = cx + Math.cos(ang) * rx * 1.05, ey = cy + Math.sin(ang) * ry * 1.05;
    [0.32, 0.62, 0.88].forEach((k, i) => {
      const r = 9 - i * 2.8;
      ctx.beginPath();
      ctx.ellipse(ex + (tx - ex) * k, ey + (ty - ey) * k, r * 1.25, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
  ctx.restore();
}

// Rectangular narration box (manga caption). dark = white text on ink.
export function captionBox(ctx, x, y, w, h, { dark = false, width = 2, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = dark ? INK : BALLOON;
  ctx.fillRect(x, y, w, h);
  ctx.lineWidth = width;
  ctx.strokeStyle = INK;
  ctx.strokeRect(x, y, w, h);
  if (dark) {
    ctx.strokeStyle = 'rgba(231,224,204,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  }
  ctx.restore();
}

// Heavy outlined SFX lettering (sheared, paper outline + ink fill or reverse).
export function sfxText(ctx, text, x, y, size, { fill = INK, outline = PAPER, outlineW = 7, shear = -0.22, rot = -0.04, align = 'center', alpha = 1, spacing = 0, weight = 900, scaleX = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.transform(scaleX, 0, shear, 1, 0, 0);
  ctx.font = `italic ${weight} ${size}px ${FONT.sfx}`;
  ctx.letterSpacing = `${spacing}px`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  if (outlineW) {
    ctx.lineWidth = outlineW + 4;
    ctx.strokeStyle = INK;
    ctx.strokeText(text, 0, 0);
    ctx.lineWidth = outlineW;
    ctx.strokeStyle = outline;
    ctx.strokeText(text, 0, 0);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export const ACTION_WORDS = {
  roll_away: 'ROLL AWAY', roll_toward: 'ROLL IN', roll_through: 'ROLL THROUGH',
  jump_back: 'LEAP BACK', attack: 'STRIKE', heavy: 'HEAVY BLOW', heal: 'DRINK', hold: 'HOLD',
};
export const TIMING_WORDS = { early: 'EARLY', on_cue: 'ON CUE', late: 'LATE' };
