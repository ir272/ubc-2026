// The tell halo's ink treatment (owner: art; shape + timing live in boss_pose.js, tells).
//
// The halo is scraped out of the page with a dry brush, not cut out of paper: a solid
// paper core, then bristle streaks of paper dragged outward that split and run dry at
// different lengths, so the edge frays into the library's hatching with no ruled
// outline; fine ruled focus lines run in from the rim and stop well short of the figure,
// so the white reads as a flash panel rather than a pasted cut-out.
//
// It is drawn once per seed into a texture in unit-ellipse space and blitted with the
// halo's (rx, ry, rot) each frame: hundreds of bristle edges are too costly to
// rasterise every frame.

import { hashNoise } from '../../core/rng.js';
import { INK, PAPER, offscreen } from '../ink.js';

const TEX = 1024, R = 452; // texture size, unit radius in texture px
const cache = new Map();

function build(seed) {
  const c = offscreen(TEX, TEX);
  const ctx = c.getContext('2d');
  ctx.translate(TEX / 2, TEX / 2);
  const P = (a, r) => [Math.cos(a) * R * r, Math.sin(a) * R * r];
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  const N = 150, step = (Math.PI * 2) / N;
  for (let i = 0; i < N; i++) {
    const h1 = hashNoise(seed, i), h2 = hashNoise(seed + 1, i), h3 = hashNoise(seed + 2, i);
    const a = i * step + (h1 - 0.5) * step * 0.6;
    // most bristles stop short; a few run long and thin (dry brush)
    const r1 = 0.9 + 0.1 * h2 + (h3 > 0.72 ? 0.12 * h3 : 0);
    const w = step * (h3 > 0.72 ? 0.55 : 0.75 + 0.5 * h1);
    const b0 = P(a - w, 0.78), b1 = P(a + w, 0.78);
    const m0 = P(a - w * 0.55, (0.78 + r1) * 0.5), m1 = P(a + w * 0.55, (0.78 + r1) * 0.5);
    const tp = P(a + (h2 - 0.5) * step * 0.5, r1);
    ctx.moveTo(b0[0], b0[1]); ctx.lineTo(m0[0], m0[1]); ctx.lineTo(tp[0], tp[1]); ctx.lineTo(m1[0], m1[1]); ctx.lineTo(b1[0], b1[1]); ctx.closePath();
  }
  ctx.fill();
  // a second, finer pass: hair-thin bristles skipping past the main ones
  ctx.beginPath();
  for (let i = 0; i < 90; i++) {
    const h1 = hashNoise(seed + 5, i), h2 = hashNoise(seed + 6, i);
    const a = (i + h1) * (Math.PI * 2 / 90);
    const r0 = 0.86 + 0.06 * h2, r1 = r0 + 0.08 + 0.16 * h1 * h1;
    const w = 0.0035 + 0.004 * h2;
    const b0 = P(a - w, r0), b1 = P(a + w, r0), tp = P(a, r1);
    ctx.moveTo(b0[0], b0[1]); ctx.lineTo(tp[0], tp[1]); ctx.lineTo(b1[0], b1[1]); ctx.closePath();
  }
  ctx.fill();
  // focus lines from the frayed rim inward (widths sized for a ~250 px halo)
  const ws = R / 250;
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let i = 0; i < 72; i++) {
    const h1 = hashNoise(seed + 8, i), h2 = hashNoise(seed + 9, i);
    if (h2 < 0.18) continue;
    const a = (i + h1 * 0.8) * (Math.PI * 2 / 72);
    const o = P(a, 0.9 + 0.08 * h1), q = P(a, 0.66 + 0.18 * h2);
    const dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1;
    const w = (0.35 + 0.5 * h1) * ws;
    ctx.moveTo(o[0] - dy / l * w, o[1] + dx / l * w); ctx.lineTo(q[0], q[1]); ctx.lineTo(o[0] + dy / l * w, o[1] - dx / l * w); ctx.closePath();
  }
  ctx.fill();
  return c;
}

export function dryBrushHalo(ctx, cx, cy, rx, ry, rot, seed) {
  let tex = cache.get(seed);
  if (!tex) { tex = build(seed); cache.set(seed, tex); }
  const k = TEX / 2 / R;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.drawImage(tex, -rx * k, -ry * k, 2 * rx * k, 2 * ry * k);
  ctx.restore();
}
