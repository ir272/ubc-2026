// Drawn anatomy for the Scrivener: knuckled bone segments, curved quill-spikes with
// thorns, dry-brush tatters. Owner: art. Everything is a filled pen polygon, so every
// line tapers and swells; deterministic (hashNoise only).

import { hashNoise } from '../../core/rng.js';
import { INK, PAPER, tonePattern } from '../ink.js';
import { LIGHT, ribbonPath, penPath, spikePath, contour, polyPath, wrapHatchPath } from './pen.js';

export const BONE = '#ece6d4';
export const BONE_FAR = '#d6cfbb';

const g = (x) => Math.exp(-x * x);

// ---- bone segments -----------------------------------------------------------------

// A long bone from A to B: a thin, slightly bowed shaft that swells into knobbed
// condyles at each end (the two sides swell at different places so the ends read as
// knuckles, not round caps). Returns the outline and an accessor at(s, side, pad).
export function boneOutline(A, B, { r = 3, rA = 6, rB = 6, bow = 0, n = 16, seed = 1 } = {}) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const kA = 4.2 / len, kB = 4.6 / len; // condyle widths as a fraction of the length
  const rad = (s, sd) => {
    const off = sd > 0 ? 0 : 0.35;
    let v = r * (1 + 0.12 * Math.sin(s * 9 + seed)) // gaunt, slightly uneven shaft
      + (rA - r) * g((s - kA * (0.7 + off)) / (kA * 1.1))
      + (rB - r) * g((s - (1 - kB * (0.8 + off))) / (kB * 1.15));
    // a little tuberosity a third of the way down one side
    if (sd > 0) v += r * 0.35 * g((s - 0.3) / 0.07);
    return v;
  };
  const cen = (s) => [A[0] + ux * s * len + nx * bow * Math.sin(Math.PI * s), A[1] + uy * s * len + ny * bow * Math.sin(Math.PI * s)];
  const at = (s, sd, pad = 0) => {
    const c = cen(s), rr = rad(s, sd) + pad;
    return [c[0] + nx * rr * sd, c[1] + ny * rr * sd];
  };
  const L = [], R = [];
  for (let i = 0; i <= n; i++) { const s = i / n; L.push(at(s, 1)); R.push(at(s, -1)); }
  // knobbed caps past each end
  const capB = [], capA = [];
  for (let k = 1; k < 5; k++) {
    const a = (k / 5) * Math.PI;
    const rr = (rB * 0.9) * (k === 2 ? 0.8 : 1);
    capB.push([B[0] + nx * Math.cos(a) * rr + ux * Math.sin(a) * rr * 0.7, B[1] + ny * Math.cos(a) * rr + uy * Math.sin(a) * rr * 0.7]);
    const ra = (rA * 0.9) * (k === 3 ? 0.8 : 1);
    capA.push([A[0] - nx * Math.cos(a) * ra - ux * Math.sin(a) * ra * 0.7, A[1] - ny * Math.cos(a) * ra - uy * Math.sin(a) * ra * 0.7]);
  }
  const pts = L.concat(capB, R.reverse(), capA);
  return { pts, at, len, ux, uy, nx, ny, cen };
}

// Draw a bone: pale fill, hatch that wraps the shadow side of the shaft, short arcs that
// wrap each condyle, a crease at the knuckle, a pen contour heavy on the shadow side and
// broken on the lit side.
export function bone(ctx, A, B, opts = {}) {
  const { far = false, seed = 1, hatchStep = 2.4, max = 2.8 } = opts;
  const o = boneOutline(A, B, opts);
  ctx.fillStyle = far ? BONE_FAR : BONE;
  ctx.beginPath(); polyPath(ctx, o.pts); ctx.fill();
  const lit = o.nx * LIGHT[0] + o.ny * LIGHT[1];
  const side = lit > 0 ? -1 : 1;
  const r = opts.r || 3, rA = opts.rA || 6, rB = opts.rB || 6;
  ctx.fillStyle = INK;
  ctx.beginPath();
  // shaft hatch, curling round the form from the shadow edge
  wrapHatchPath(ctx, o.at(0.16, 0), o.at(0.84, 0), r * 1.05, r * 1.05, { side, step: far ? hatchStep * 0.75 : hatchStep, reach: far ? 0.95 : 0.7, width: 0.8, seed, curl: 0.5 });
  // condyles: 3-4 short arcs hugging the shadow side of each knob
  for (const [s0, rr, dir] of [[0.05, rA, 1], [0.95, rB, -1]]) {
    const c = o.at(s0, 0);
    for (let k = 0; k < 4; k++) {
      const a0 = Math.atan2(o.ny * side, o.nx * side) + (k - 1.5) * 0.42 * dir;
      const p0 = [c[0] + Math.cos(a0) * rr * 0.95, c[1] + Math.sin(a0) * rr * 0.95];
      const p1 = [c[0] + Math.cos(a0 + 0.5 * dir) * rr * 0.45, c[1] + Math.sin(a0 + 0.5 * dir) * rr * 0.45];
      ribbonPath(ctx, [p0, [(p0[0] + p1[0]) / 2 + o.ux * dir, (p0[1] + p1[1]) / 2 + o.uy * dir], p1], (t) => 0.95 * (1 - t) + 0.05);
    }
  }
  // knuckle crease between the two condyle lobes at the far end
  const k0 = o.at(0.97, 0.15), k1 = [k0[0] + o.ux * rB * 0.9, k0[1] + o.uy * rB * 0.9];
  ribbonPath(ctx, [k0, k1], (t) => 1.1 * (1 - t) + 0.1);
  // hairline bone ridge, broken
  if (!far) {
    penPath(ctx, [o.at(0.2, -side * 0.15), o.at(0.38, -side * 0.3), o.at(0.55, -side * 0.25)], 0.7, 0.3, 0.5);
    penPath(ctx, [o.at(0.64, -side * 0.2), o.at(0.8, -side * 0.1)], 0.6, 0.3, 0.5);
  }
  ctx.fill();
  contour(ctx, o.pts, { min: 0.35, max: far ? max * 0.75 : max, seed });
  return o;
}

// A small knobbed carpal/vertebra pebble.
export function pebblePts(c, rx, ry, rot, seed) {
  const pts = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const k = 0.85 + 0.3 * hashNoise(seed, i);
    pts.push([c[0] + Math.cos(a + rot) * rx * k, c[1] + Math.sin(a + rot) * ry * k]);
  }
  return pts;
}
export function pebbles(ctx, list, far = false) {
  ctx.fillStyle = far ? BONE_FAR : BONE;
  ctx.beginPath();
  for (const pts of list) polyPath(ctx, pts);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  list.forEach((pts, i) => contour(ctx, pts, { min: 0.35, max: 1.6, seed: 300 + i, batch: true }));
  ctx.fill();
}

// ---- quill spikes ------------------------------------------------------------------

const dirv = (a) => [Math.sin(a), Math.cos(a)]; // 0 = down, +PI/2 = forward

// Centre line of a curved quill: a cubic that can S-bend (b1, b2) and hook at the tip.
export function quillPts(base, ang, len, b1, b2, n = 13) {
  const d = dirv(ang), nr = [-d[1], d[0]];
  const c1 = [base[0] + d[0] * len * 0.34 + nr[0] * b1, base[1] + d[1] * len * 0.34 + nr[1] * b1];
  const c2 = [base[0] + d[0] * len * 0.7 + nr[0] * b2, base[1] + d[1] * len * 0.7 + nr[1] * b2];
  const tip = [base[0] + d[0] * len + nr[0] * b2 * 0.45, base[1] + d[1] * len + nr[1] * b2 * 0.45];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
    out.push([a * base[0] + b * c1[0] + c * c2[0] + e * tip[0], a * base[1] + b * c1[1] + c * c2[1] + e * tip[1]]);
  }
  return out;
}
// width profile: swells just past the root, then tapers to a needle
export const quillWidth = (w, swell = 0.18, body = 0.8) => (t) => w * Math.pow(Math.sin(Math.min(1, t / swell * 0.5 + 0.5) * Math.PI / 2), 0.7) * Math.pow(1 - t, body) + 0.12;

function edgeAt(pts, wf, i, sd) {
  const n = pts.length - 1;
  const q = pts[Math.min(n, i + 1)], o = pts[Math.max(0, i - 1)];
  const dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1;
  const w = wf(i / n) * 0.5;
  return { p: [pts[i][0] - dy / l * w * sd, pts[i][1] + dx / l * w * sd], d: [dx / l, dy / l], n: [-dy / l * sd, dx / l * sd] };
}

// Small thorns standing off one edge of a quill, swept toward its tip.
export function thornsPath(ctx, pts, wf, seed, count, sd = 1, scale = 1) {
  const n = pts.length - 1;
  for (let k = 0; k < count; k++) {
    const i = Math.round(n * (0.3 + (k + hashNoise(seed, k) * 0.7) * (0.45 / Math.max(1, count))));
    const e = edgeAt(pts, wf, i, sd);
    const L = (6 + hashNoise(seed + 1, k) * 9) * scale;
    const tip = [e.p[0] + (e.d[0] * 0.8 + e.n[0] * 0.6) * L, e.p[1] + (e.d[1] * 0.8 + e.n[1] * 0.6) * L];
    spikePath(ctx, [e.p[0] - e.n[0] * 1.2 - e.d[0] * 1.5, e.p[1] - e.n[1] * 1.2 - e.d[1] * 1.5], tip, 3.4 * scale, -1.5 * sd);
  }
}

// One black quill carved in white: white separation halo, black body with thorns, a
// tapered white rachis off-centre toward the light and a few barb nicks.
function quillHaloPath(ctx, q) {
  const { pts, wf, seed, thorns = 0, tsd = 1, halo = 1.3 } = q;
  if (!(halo > 0)) return;
  ribbonPath(ctx, pts, (t) => wf(t) + halo * (1 - t * 0.7));
  if (thorns) thornsPath(ctx, pts, wf, seed, thorns, tsd, 1.25);
}
function quillCarvePath(ctx, q) {
  const { pts, wf, seed, carve = 1 } = q;
  if (!carve) return;
  const n = pts.length - 1;
  let lsd = q.litSide;
  if (!lsd) {
    const m = Math.floor(n / 2), a = pts[m - 1], b = pts[m + 1];
    lsd = (-(b[1] - a[1])) * LIGHT[0] + (b[0] - a[0]) * LIGHT[1] > 0 ? 1 : -1;
  }
  const rp = [];
  for (let i = 1; i < n - 2; i++) rp.push(edgeAt(pts, (t) => wf(t) * 0.42, i, lsd).p);
  if (rp.length > 2) ribbonPath(ctx, rp, (t) => (1.15 * (1 - t) + 0.12) * carve);
  // barb nicks: short slanted white cuts from the lit edge toward the shaft
  const nb = 2 + Math.floor(hashNoise(seed, 9) * 3);
  for (let k = 0; k < nb; k++) {
    const i = Math.min(n - 3, 2 + Math.floor((k + hashNoise(seed, 20 + k) * 0.8) * (n - 5) / nb));
    const e = edgeAt(pts, wf, i, lsd);
    const w = wf(i / n);
    const a = [e.p[0] - e.n[0] * 0.3, e.p[1] - e.n[1] * 0.3];
    ribbonPath(ctx, [a, [a[0] - e.n[0] * w * 0.45 + e.d[0] * w * 0.6, a[1] - e.n[1] * w * 0.45 + e.d[1] * w * 0.6]], (t) => 0.85 * (1 - t) + 0.05);
  }
}

// Black quills carved in white, drawn back to front: white separation halo, black body
// with thorns, a tapered white rachis toward the light and a few barb nicks. The white
// carve of one quill and the halo of the next share a fill (same colour, consecutive).
export function blackQuills(ctx, list) {
  let prev = null;
  for (const q of list) {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    if (prev) quillCarvePath(ctx, prev);
    quillHaloPath(ctx, q);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ribbonPath(ctx, q.pts, q.wf);
    if (q.thorns) thornsPath(ctx, q.pts, q.wf, q.seed, q.thorns, q.tsd || 1);
    ctx.fill();
    prev = q;
  }
  if (prev) { ctx.fillStyle = PAPER; ctx.beginPath(); quillCarvePath(ctx, prev); ctx.fill(); }
}
export function blackQuill(ctx, q) { blackQuills(ctx, [q]); }

// A far (paper-white) quill: pale fill, hatch packed toward its root and shadow edge,
// a contour heavy on the trailing edge, hairline on the leading edge.
export function whiteQuill(ctx, q) {
  const { pts, wf, seed, thorns = 0, tsd = 1 } = q;
  const n = pts.length - 1;
  ctx.fillStyle = BONE_FAR;
  ctx.beginPath();
  ribbonPath(ctx, pts, wf);
  if (thorns) thornsPath(ctx, pts, wf, seed, thorns, tsd, 0.9);
  ctx.fill();
  if (q.tone) { ctx.fillStyle = tonePattern(ctx, q.tone[0], q.tone[1], INK); ctx.fill(); }
  ctx.fillStyle = INK;
  ctx.beginPath();
  // hatch: short strokes across the quill from the shadow edge, denser near the root
  for (let i = 1; i < n - 1; i++) {
    const t = i / n;
    const reps = t < 0.3 ? 3 : t < 0.6 ? 2 : 1;
    for (let r = 0; r < reps; r++) {
      const ii = i + r / reps;
      const i0 = Math.floor(ii);
      const e = edgeAt(pts, wf, i0, -tsd);
      const w = wf(i0 / n);
      const reach = (t < 0.35 ? 0.9 : 0.55) * (0.7 + 0.5 * hashNoise(seed + 3, i * 3 + r));
      const a = [e.p[0] + e.d[0] * (ii - i0) * 4, e.p[1] + e.d[1] * (ii - i0) * 4];
      ribbonPath(ctx, [a, [a[0] - e.n[0] * w * reach + e.d[0] * 2.2, a[1] - e.n[1] * w * reach + e.d[1] * 2.2]], (tt) => 0.75 * (1 - tt) + 0.05);
    }
  }
  // edges: trailing heavy, leading hairline
  const Ls = [], Rs = [];
  for (let i = 0; i <= n; i++) { Ls.push(edgeAt(pts, wf, i, tsd).p); Rs.push(edgeAt(pts, wf, i, -tsd).p); }
  ribbonPath(ctx, Rs, (t) => 2.0 * (1 - t) + 0.3);
  ribbonPath(ctx, Ls.slice(0, n - 1), (t) => 0.55 * (1 - t) + 0.15);
  // rachis hairline
  ribbonPath(ctx, pts.slice(1, n - 2), (t) => 0.7 * (1 - t) + 0.1);
  if (thorns) {
    // thorns outlined: draw them dark at the base edge
    thornsPath(ctx, pts, (t) => wf(t) * 1.02, seed, thorns, tsd, 0.45);
  }
  ctx.fill();
}

// ---- dry brush ---------------------------------------------------------------------

// A dry-brush tatter: the main tapered stroke breaks into 2-4 hair strokes that split
// apart near the tip with paper showing between them.
export function dryTatterPath(ctx, base, tip, w, seed, bend = 0) {
  spikePath(ctx, base, [base[0] + (tip[0] - base[0]) * 0.72, base[1] + (tip[1] - base[1]) * 0.72], w, bend * 0.6);
  const dx = tip[0] - base[0], dy = tip[1] - base[1], l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  const hairs = 2 + Math.floor(hashNoise(seed, 1) * 3);
  for (let k = 0; k < hairs; k++) {
    const off = (k / Math.max(1, hairs - 1) - 0.5) * w * 0.8;
    const s0 = 0.3 + hashNoise(seed, 10 + k) * 0.25;
    const a = [base[0] + dx * s0 + nx * off * 0.6, base[1] + dy * s0 + ny * off * 0.6];
    const ext = 0.85 + hashNoise(seed, 20 + k) * 0.45;
    const e = [base[0] + dx * ext + nx * off * (1.6 + hashNoise(seed, 30 + k)) + nx * bend * 0.3, base[1] + dy * ext + ny * off * (1.6 + hashNoise(seed, 30 + k)) + ny * bend * 0.3];
    const m = [(a[0] + e[0]) / 2 + nx * bend * 0.25, (a[1] + e[1]) / 2 + ny * bend * 0.25];
    ribbonPath(ctx, [a, m, e], (t) => (0.7 + hashNoise(seed, 40 + k) * 0.9) * (1 - t * 0.95));
  }
}

// White dry-brush scrapes cut up into a black mass from an edge (hairline streaks).
export function scrapesPath(ctx, list) {
  for (const [a, b, w] of list) {
    const m = [(a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.04, (a[1] + b[1]) / 2];
    ribbonPath(ctx, [a, m, b], (t) => w * Math.sin(Math.PI * Math.min(1, t * 1.3)) * (1 - t * 0.5) + 0.05);
  }
}

// Many quills in two fills: one black body pass, one white rachis pass (no halos).
// Used for the far wing, where per-quill separation is not worth the cost.
export function blackQuillsBatch(ctx, list) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (const q of list) {
    ribbonPath(ctx, q.pts, q.wf);
    if (q.thorns) thornsPath(ctx, q.pts, q.wf, q.seed, q.thorns, q.tsd);
  }
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  for (const q of list) {
    const n = q.pts.length - 1;
    const rp = [];
    for (let i = 1; i < n - 2; i++) rp.push(edgeAt(q.pts, (t) => q.wf(t) * 0.4, i, 1).p);
    if (rp.length > 2) ribbonPath(ctx, rp, (t) => 0.75 * (1 - t) + 0.1);
  }
  ctx.fill();
}
