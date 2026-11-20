// Hand-lettered manga SFX ("SHUK", "ZANN", "GAKK"...). Owner: feedback.
// Every glyph is a set of brush strokes drawn with the ink.js brush, so the
// lettering has real pressure, taper and wobble instead of a typeface look.
// Deterministic: all jitter comes from the seed.

import { hashNoise } from '../core/rng.js';
import { stroke, INK, PAPER } from '../render/ink.js';

// Glyphs on a 0..1 box (x right, y down). Each glyph: list of polylines.
const ell = (cx, cy, rx, ry, a0, a1, n = 12) => {
  const p = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return p;
};
const G = {
  A: [[[0.02, 1], [0.5, 0], [0.98, 1]], [[0.24, 0.64], [0.78, 0.6]]],
  B: [[[0.15, 1], [0.15, 0]], [[0.15, 0], [0.7, 0.03], [0.86, 0.22], [0.66, 0.46], [0.15, 0.48]], [[0.15, 0.48], [0.76, 0.52], [0.92, 0.76], [0.72, 0.98], [0.15, 1]]],
  C: [ell(0.55, 0.5, 0.45, 0.5, -0.6, -Math.PI * 2 + 0.6, 14)],
  D: [[[0.15, 0], [0.15, 1]], [[0.15, 0.02], [0.62, 0.06], [0.9, 0.32], [0.9, 0.66], [0.64, 0.95], [0.15, 1]]],
  G: [[[0.9, 0.18], [0.62, 0], [0.26, 0.06], [0.06, 0.42], [0.16, 0.86], [0.52, 1], [0.86, 0.88], [0.9, 0.56], [0.52, 0.56]]],
  H: [[[0.14, 0], [0.16, 1]], [[0.86, 0], [0.84, 1]], [[0.12, 0.5], [0.88, 0.46]]],
  K: [[[0.16, 0], [0.14, 1]], [[0.92, 0], [0.18, 0.58]], [[0.42, 0.4], [0.98, 1]]],
  M: [[[0.04, 1], [0.12, 0], [0.5, 0.62], [0.88, 0], [0.96, 1]]],
  N: [[[0.14, 1], [0.14, 0], [0.86, 1], [0.86, 0]]],
  O: [ell(0.5, 0.5, 0.44, 0.5, 0, Math.PI * 2, 16)],
  P: [[[0.16, 1], [0.15, 0]], [[0.15, 0], [0.7, 0.03], [0.92, 0.26], [0.7, 0.5], [0.16, 0.52]]],
  R: [[[0.16, 1], [0.15, 0]], [[0.15, 0], [0.7, 0.03], [0.92, 0.26], [0.7, 0.5], [0.16, 0.52]], [[0.46, 0.5], [0.96, 1]]],
  S: [[[0.88, 0.14], [0.56, 0], [0.18, 0.1], [0.14, 0.34], [0.5, 0.5], [0.84, 0.64], [0.86, 0.88], [0.5, 1], [0.08, 0.88]]],
  T: [[[0.0, 0.03], [1, 0]], [[0.5, 0.02], [0.48, 1]]],
  U: [[[0.12, 0], [0.13, 0.72], [0.3, 0.98], [0.7, 0.98], [0.87, 0.72], [0.88, 0]]],
  W: [[[0.0, 0], [0.24, 1], [0.5, 0.38], [0.76, 1], [1, 0]]],
  X: [[[0.08, 0], [0.92, 1]], [[0.92, 0], [0.08, 1]]],
  Z: [[[0.08, 0.04], [0.92, 0], [0.08, 1], [0.94, 0.97]]],
  '!': [[[0.5, 0], [0.5, 0.68]], [[0.5, 0.88], [0.5, 0.98]]],
  '-': [[[0.05, 0.52], [0.95, 0.48]]],
};

function subdivide(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) out.push([x0 + (x1 - x0) * (k / n), y0 + (y1 - y0) * (k / n)]);
  }
  return out;
}

// Precomputed glyph layout per (word, seed): avoids rebuilding geometry each frame.
const layoutCache = new Map();
function layout(word, seed) {
  const key = `${word}|${seed}`;
  let L = layoutCache.get(key);
  if (L) return L;
  const letters = [];
  let x = 0;
  const chars = [...word];
  chars.forEach((ch, i) => {
    const g = G[ch];
    const grow = 0.82 + 0.36 * (i / Math.max(1, chars.length - 1)); // crescendo
    const s = grow * (0.92 + 0.16 * hashNoise(seed, i));
    const w = ch === '!' ? 0.38 : 0.86;
    if (g) {
      letters.push({
        x, s, rot: (hashNoise(seed + 3, i) - 0.5) * 0.32, dy: (hashNoise(seed + 5, i) - 0.5) * 0.24 - (s - 1) * 0.5,
        strokes: g.map((pl) => subdivide(pl, 0.12)), seed: seed * 31 + i,
      });
    }
    x += w * s + 0.06;
  });
  L = { letters, width: x };
  layoutCache.set(key, L);
  if (layoutCache.size > 64) layoutCache.delete(layoutCache.keys().next().value);
  return L;
}

// Draw `word` centered at (x, y), cap height `size` px.
//  ink: letter colour, halo: outline colour, rot: whole-word rotation,
//  skew: italic shear, pop: 0..1 entry pop (scales from 1.5x to 1x), alpha.
export function drawSfx(ctx, word, x, y, size, { ink = INK, halo = PAPER, rot = -0.12, skew = -0.28, pop = 1, alpha = 1, seed = 1, weight = 0.25 } = {}) {
  const L = layout(word, seed);
  const k = 1 + (1 - pop) * 0.6;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.transform(1, 0, skew, 1, 0, 0);
  ctx.scale(size * k, size * k);
  ctx.translate(-L.width / 2, -0.5);
  const pass = (color, extra, a) => {
    for (const l of L.letters) {
      ctx.save();
      ctx.translate(l.x + 0.43 * l.s, 0.5 + l.dy);
      ctx.rotate(l.rot);
      ctx.scale(l.s, l.s);
      ctx.translate(-0.43, -0.5);
      for (let j = 0; j < l.strokes.length; j++) {
        stroke(ctx, l.strokes[j], { width: weight + extra, taper: 0.55, wobble: 0.012, seed: l.seed + j, color, alpha: a });
      }
      ctx.restore();
    }
  };
  if (halo) pass(halo, 0.18, alpha);
  pass(ink, 0, alpha);
  ctx.restore();
}

// Which word an impact gets.
export function sfxWord(kind, attackId, heavy, seed = 0) {
  const pick = (arr) => arr[Math.abs(seed) % arr.length];
  if (kind === 'boss_light') return pick(['SHK', 'ZAK', 'SHUK']);
  if (kind === 'boss_heavy') return pick(['ZANN', 'GASH']);
  if (kind === 'stagger') return 'GAKK!';
  if (kind === 'boss_death') return 'ZASHH';
  if (kind === 'agent_death') return 'GSHK!';
  // agent takes a hit
  switch (attackId) {
    case 'ledger_slam': return heavy ? 'DOMM' : 'BAM';
    case 'ink_lunge': return 'ZUK!';
    case 'written_name': return 'GOWW';
    case 'page_storm': return 'PAK';
    case 'quill_slash': return heavy ? 'SHUNK' : 'SHUK';
    default: return heavy ? 'GAKK' : 'SHUK';
  }
}
