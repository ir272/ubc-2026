// The boss's pen, at runtime, for the fighters. Owner: art.
// The Scrivener is baked with src/render/art/paint/formhatch.js: black masses modelled in
// negative by long white FOLDS that land heavy in the shadow and break into dashes in the
// light, FRINGES of short curved hatch groups laid off the lit edge, crosshatch POCKETS
// only in the deepest folds, ragged feathered edges, bone limbs held by a ruled contour
// with black hatch off the shadow side. The fighters reuse those exact functions (they
// are plain canvas strokes with a seeded rng); the bake's pixel masks are replaced by a
// clip to the mass's own outline. All sizes are given in device px and turned into local
// units with S.D, so the marks keep the boss's weight at any scale.
//   S.lod: 0 = 90 px sprite (no modelling), 1 = the stage's 1.45x fighter, 2 = portrait

import { fold as fhFold, fringe as fhFringe, pocket as fhPocket, BOLD } from '../art/paint/formhatch.js';
import { hashNoise } from '../../core/rng.js';
import { INK, PAPER } from '../ink.js';
import { LIGHT, polyPath, spikePath, contour, ribbonPath, penPath } from '../art/pen.js';
import { hatchIn, bbox } from './engrave.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const centroid = (pts) => { let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length]; };

// mark sizes per level, in device px
export function marks(S) {
  return S.lod >= 2
    ? { fl: [7, 15], fp: 4.4, fw: 1.85, fold: 2.6, tat: 1 }
    : { fl: [3.5, 7], fp: 4.8, fw: 1.6, fold: 1.9, tat: 0.8 };
}

// outward normals and the runs of the outline facing toward (sign 1) or away from the light
function runs(pts, sign = 1, thr = 0.22) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? -1 : 1;
  const on = [];
  for (let i = 0; i < n; i++) {
    const q = pts[(i + 1) % n], o = pts[(i - 1 + n) % n];
    const dx = q[0] - o[0], dy = q[1] - o[1], L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * sg, ny = (dx / L) * sg;
    on.push((nx * LIGHT[0] + ny * LIGHT[1]) * sign > thr);
  }
  // split into contiguous runs (wrapping), longest first
  const out = [];
  let start = on.findIndex((v) => !v);
  if (start < 0) return [pts.concat([pts[0]])];
  let cur = [];
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (on[i]) cur.push(pts[i]);
    else if (cur.length) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  const len = (r) => { let s = 0; for (let i = 1; i < r.length; i++) s += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]); return s; };
  return out.sort((a, b) => len(b) - len(a));
}
function sideInward(run, pts) {
  // formhatch's fringe lays strokes to the left (side +1) or right (-1) of the guide
  const c = centroid(pts);
  const i = Math.floor(run.length / 2);
  const a = run[Math.max(0, i - 1)], b = run[Math.min(run.length - 1, i + 1)];
  const d = [b[0] - a[0], b[1] - a[1]];
  const n = [d[1], -d[0]];
  return (n[0] * (c[0] - run[i][0]) + n[1] * (c[1] - run[i][1])) > 0 ? 1 : -1;
}
function thin(run, step) {
  const out = [run[0]];
  for (const p of run) { const q = out[out.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= step) out.push(p); }
  if (out.length < 2 && run.length > 1) out.push(run[run.length - 1]);
  return out;
}

// Model a black mass: fringe off the lit edge, a few long folds, a pocket if asked.
//   folds: count; foldAngle: their direction (radians, canvas); pocket: { c, rx, ry, ang }
export function engrave(ctx, pts, S, o = {}) {
  if (!S.lod || !pts || pts.length < 3) return;
  const M = marks(S);
  const D = S.D;
  const seed = o.seed ?? 1;
  ctx.save();
  ctx.beginPath(); polyPath(ctx, pts); ctx.clip();
  const bb0 = bbox(pts);
  const minPx = Math.min(bb0.w, bb0.h) / D;
  const ang0 = o.foldAngle ?? Math.PI / 2;
  // white cross-contour hatch wrapping the form, held to the band facing the light
  if (o.lit !== false && minPx > (S.lod >= 2 ? 6 : 30)) {
    const wid = Math.abs(bb0.w * Math.sin(ang0)) + Math.abs(bb0.h * Math.cos(ang0));
    const lg = (S.lod >= 2 ? 4.6 : 5.0) * D, llo = S.lod >= 2 ? 0.6 : 0.7;
    // open cuts where the form starts to turn to the light, packed tight where it faces it
    hatchIn(ctx, pts, { mode: 'lit', color: o.color ?? PAPER, angle: ang0 + Math.PI / 2, gap: lg, w: (S.lod >= 2 ? 1.6 : 1.6) * D, lo: llo, gamma: 0.85, bend: wid * 0.14, wobble: 0.3, seed: seed + 61, clip: false });
    hatchIn(ctx, pts, { mode: 'lit', color: o.color ?? PAPER, angle: ang0 + Math.PI / 2, gap: lg, phase: 0.5, w: 1.2 * D, lo: llo + 0.24, gamma: 0.85, bend: wid * 0.14, wobble: 0.3, seed: seed + 62, clip: false });
  }
  // the lit edge breaks into the black through hatch groups
  if (o.fringe !== false && minPx > (S.lod >= 2 ? 8 : 34)) {
    const rs = runs(pts, 1, 0.2);
    const bb = bbox(pts);
    const minLen = 6 * D;
    rs.slice(0, o.edges ?? 2).forEach((run, k) => {
      if (run.length < 3) return;
      const g = thin(run, 1.2 * D);
      if (g.length < 3) return;
      let L = 0; for (let i = 1; i < g.length; i++) L += Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
      if (L < minLen * 2) return;
      const reach = Math.min(1, Math.min(bb.w, bb.h) / (M.fl[1] * D * 1.2));
      const kk = (o.reach ?? 1) * Math.max(0.35, reach);
      fhFringe(ctx, g, {
        side: sideInward(g, pts), len: [M.fl[0] * D * kk / BOLD.len, M.fl[1] * D * kk / BOLD.len],
        pitch: M.fp * D / BOLD.pitch, w: M.fw * D / BOLD.w, tilt: o.tilt ?? 0.2, bow: 0.3, group: [3, 5], gap: [1.2, 2.6],
        seed: seed + k * 17, inset: -0.3 * D, color: o.color ?? PAPER,
      });
    });
  }
  // long folds through the mass
  const nf = minPx < 10 ? Math.min(1, o.folds ?? 2) : (o.folds ?? 2);
  if (nf > 0) {
    const bb = bbox(pts);
    const ang = o.foldAngle ?? Math.PI / 2;
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
    const ext = Math.abs(bb.w * ux) + Math.abs(bb.h * uy);
    const wid = Math.abs(bb.w * nx) + Math.abs(bb.h * ny);
    for (let i = 0; i < nf; i++) {
      const off = ((i + 0.5) / nf - 0.5) * wid * 0.75 + (hashNoise(seed, i) - 0.5) * wid * 0.18;
      const s0 = -0.5 + hashNoise(seed + 1, i) * 0.25, s1 = 0.2 + hashNoise(seed + 2, i) * 0.3;
      const bend = (hashNoise(seed + 3, i) - 0.5) * wid * 0.22;
      const guide = [];
      for (let k = 0; k <= 4; k++) {
        const s = s0 + (s1 - s0) * (k / 4);
        const b = bend * Math.sin(Math.PI * k / 4);
        guide.push([bb.cx + ux * s * ext + nx * (off + b), bb.cy + uy * s * ext + ny * (off + b)]);
      }
      fhFold(ctx, guide, { w: M.fold * D / BOLD.fold * (0.7 + 0.6 * hashNoise(seed + 4, i)), brk: 0.45 + 0.3 * hashNoise(seed + 5, i), seed: seed * 7 + i, color: o.color ?? PAPER });
      // a group of hatch off the fold's lit flank, as on the boss's robe
      if (S.lod >= 2) fhFringe(ctx, guide, { side: -1, len: [2.5 * D / BOLD.len, 6 * D / BOLD.len], pitch: 3.6 * D / BOLD.pitch, w: 1.3 * D / BOLD.w, tilt: -0.5, bow: 0.38, group: [3, 4], gap: [4, 7], seed: seed * 7 + i + 400, u0: 0.15, u1: 0.65, color: o.color ?? PAPER });
    }
  }
  if (o.pocket && S.lod >= 2) {
    const p = o.pocket;
    fhPocket(ctx, p.c, { rx: p.rx, ry: p.ry, ang: p.ang || 0, pitch: 3.0 * D / BOLD.xpitch, w: 1.0 * D / BOLD.xw, a1: p.a1 ?? 0.5, a2: p.a2 ?? -0.7, seed: seed + 91, color: o.color ?? PAPER });
  }
  ctx.restore();
}

// A designed fold (guide from the shadow end to the lit end), at the boss's weight.
export function inkFold(ctx, guide, S, w = 1, seed = 1, brk = 0.55, color = PAPER) {
  const M = marks(S);
  fhFold(ctx, guide, { w: M.fold * S.D / BOLD.fold * w, brk, seed, color });
}

// Ragged feathered edge: thorn-like tatters off the edge a -> b, pointing along `out`.
export function tatters(ctx, a, b, out, S, { n = 6, len = 6, w = 2.6, seed = 1, sway = 0 } = {}) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5 + (hashNoise(seed, i) - 0.5) * 0.6) / n;
    const p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    const L = len * (0.45 + hashNoise(seed + 1, i) * 0.9);
    const tip = [p[0] + out[0] * L + sway * u, p[1] + out[1] * L];
    spikePath(ctx, p, tip, w * (0.7 + 0.5 * hashNoise(seed + 2, i)), (hashNoise(seed + 3, i) - 0.5) * L * 0.4);
  }
  ctx.fill();
}

// Ruled metal (or any pale hard surface): paper, ruled shadow lines of even weight that
// stop hard where the light takes over, a crossing set only in the deepest shadow, and a
// contour heavy on the shadow side.
export function ruled(ctx, pts, S, { angle = 0.2, gap = 2.6, w = 0.95, lo = 0.42, cross = true, line = 1, fill = PAPER, seed = 1, bias = 0, light = LIGHT } = {}) {
  ctx.fillStyle = fill;
  ctx.beginPath(); polyPath(ctx, pts); ctx.fill();
  const D = S.D;
  const g = Math.max(gap * D, S.lod ? 0 : 1.6);
  // ruled, not flat: lines swell into the shadow, a second set closes the spacing there,
  // hairlines cross only the deepest part; the lit face stays bare
  hatchIn(ctx, pts, { mode: 'shadow', color: INK, angle, gap: g * 1.4, w: Math.max(1.35 * w * D, S.lod ? 0 : 0.7), lo, gamma: 0.8, wobble: 0.08, seed, bias, light });
  if (S.lod) hatchIn(ctx, pts, { mode: 'shadow', color: INK, angle, gap: g * 1.4, phase: 0.5, w: 1.2 * w * D, lo: lo + 0.2, gamma: 0.8, wobble: 0.08, seed: seed + 2, bias, light });
  if (cross && S.lod) hatchIn(ctx, pts, { mode: 'shadow', color: INK, angle: angle + 1.15, gap: g * 0.9, w: 0.5 * D, lo: Math.min(0.9, lo + 0.38), gamma: 0.6, wobble: 0.08, seed: seed + 5, bias, light });
  // metal holds its silhouette: the contour thins in the light but never breaks
  contour(ctx, pts, { min: Math.max(0.4, 0.8 * D * 1.4) * line, max: Math.max(1.0, 2.0 * D * 1.4) * line, breaks: false, seed: seed + 9 });
}

// A bone-white limb or body part: pale, held by a ruled contour, black hatch laid across
// the form off the shadow side (the boss's arms and ribs).
const o_angle = (bb) => (bb.w > bb.h ? Math.PI / 2 - 0.25 : 0.25);
export function bonePart(ctx, pts, S, { fill = '#ece6d4', seed = 1, reach = 1, line = 1, tilt = 0.25, tone = 1, angle = null, bend = null, lo = 0.3, breaks = true } = {}) {
  ctx.fillStyle = fill;
  ctx.beginPath(); polyPath(ctx, pts); ctx.fill();
  const D = S.D;
  ctx.save(); ctx.beginPath(); polyPath(ctx, pts); ctx.clip();
  if (S.lod) {
    const M = marks(S);
    const bb = bbox(pts);
    // the tone: hatch across the form that thickens into a solid black on the shadow side
    // and thins to hairlines into the light (no flat grey, no gradient)
    const across = angle ?? o_angle(bb);
    const g = (S.lod >= 2 ? 2.6 : 3.0) * D;
    // medium form hatch: open toward the light, a second interleaved set closing the
    // spacing in the shadow, a hairline crosshatch only in the deepest part
    const bd = bend ?? Math.min(bb.w, bb.h) * 0.12;
    hatchIn(ctx, pts, { mode: 'shadow', color: INK, angle: across, gap: g * 1.6, w: 1.5 * D * tone, lo, gamma: 0.9, bend: bd, wobble: 0.3, seed: seed + 7, clip: false });
    hatchIn(ctx, pts, { mode: 'shadow', color: INK, angle: across, gap: g * 1.6, phase: 0.5, w: 1.4 * D * tone, lo: lo + 0.22, gamma: 0.9, bend: bd, wobble: 0.3, seed: seed + 8, clip: false });
    hatchIn(ctx, pts, { mode: 'shadow', color: INK, angle: across + 0.95, gap: g * 0.9, w: 0.55 * D * tone, lo: Math.min(0.85, lo + 0.42), gamma: 0.6, bend: -bd * 0.5, wobble: 0.3, seed: seed + 9, clip: false });
    // the core shadow: solid black along the edge turned away
    hatchIn(ctx, pts, { mode: 'shadow', color: INK, angle: across, gap: g * 0.8, w: g * 0.9 * tone, lo: Math.min(0.9, lo + 0.5), gamma: 1.2, bend: bd, wobble: 0.2, seed: seed + 10, clip: false });
    const k = reach * Math.max(0.5, Math.min(1.4, Math.min(bb.w, bb.h) / (M.fl[1] * D)));
    if (Math.min(bb.w, bb.h) / D > 10) runs(pts, -1, 0.05).slice(0, 2).forEach((run, i) => {
      const g = thin(run, 1.0 * D);
      if (g.length < 3) return;
      fhFringe(ctx, g, { side: sideInward(g, pts), len: [M.fl[0] * D * k / BOLD.len, M.fl[1] * D * k * 1.1 / BOLD.len], pitch: M.fp * 0.85 * D / BOLD.pitch, w: M.fw * 0.9 * D / BOLD.w, tilt, bow: 0.32, group: [3, 6], gap: [0.8, 1.8], seed: seed + i * 13, inset: -0.4 * D, color: INK });
    });
  } else {
    hatchIn(ctx, pts, { mode: 'shadow', color: INK, gap: 2.0, w: 0.85, angle: 0.9, lo: 0.5, seed });
  }
  ctx.restore();
  contour(ctx, pts, { min: Math.max(0.5, 0.9 * D * 1.4) * line, max: Math.max(1.4, 2.4 * D * 1.4) * line, breaks, seed: seed + 3 });
}

export { INK, PAPER };
