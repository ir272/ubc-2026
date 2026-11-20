// Sinew-sheathed skeletal arms and knuckled claw hands for the Scrivener. Owner: art.
//
// The arm is not two bone tubes: it is one black mass of dried sinew shrink-wrapped over
// the bones. Its silhouette swells into a belly on the shadow (under) side just below the
// elbow and pinches thin into the wrist, so the forearm reads foreshortened and alive.
// The bone shows through only where it lies under the skin: a pale ridge along the lit
// (top) edge, outlined by a hairline, and pale knobs at the joints. Inside the black,
// tendons, a rim light and wrap ticks are CARVED in white (0.5-1 px), and a paper gap
// rings every limb so it separates from the black coat and wings it crosses.
//
// The hand is four distinct knuckled fingers and a thumb: black jointed segments, a pale
// knuckle cap at the root of each, white crescents carved on each joint, and a long
// hooked talon that ends in a single tapered point. Fingers are inked back to front,
// each ringed in paper, so they never fuse into a tangle. gripHand() hooks them over
// the ledger's top board; clawHand() curls them free (round a hilt, or open).

import { hashNoise } from '../../core/rng.js';
import { INK, PAPER } from '../ink.js';
import { LIGHT, ribbonPath, polyPath, spline, quad } from './pen.js';
import { pebblePts, pebbles, quillPts, BONE, BONE_FAR } from './bone.js';

const g = (x) => Math.exp(-x * x);
const add = (p, d, s = 1) => [p[0] + d[0] * s, p[1] + d[1] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a, b) => { const d = sub(b, a), l = len(d) || 1; return [d[0] / l, d[1] / l]; };
const mix = (a, b, s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
const taper = (w, a = 0.18, b = 0.3) => (t) => w * Math.min(1, t / a, (1 - t) / b) + 0.04;

// ---- limbs ----------------------------------------------------------------------

// prof(s) -> [litHalf, shadowHalf]; bow pushes the belly toward the shadow side
function limbGeom(A, B, prof, bow = 0, n = 16) {
  const d = unit(A, B), nn = [-d[1], d[0]];
  const L = len(sub(B, A));
  const ls = dot(nn, LIGHT) > 0 ? 1 : -1; // nn * ls points at the light
  const ln = [nn[0] * ls, nn[1] * ls];
  const lit = [], sh = [], cen = [], W = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const c = add(add(A, d, s * L), ln, -bow * Math.sin(Math.PI * s));
    const w = prof(s);
    cen.push(c); W.push(w);
    lit.push(add(c, ln, w[0]));
    sh.push(add(c, ln, -w[1]));
  }
  return { d, ln, L, lit, sh, cen, W, n };
}

// One sinew limb. opts.ridge = [s0, s1, widthFn] for the pale bone showing on top.
export function sinewLimb(ctx, A, B, prof, { far = false, seed = 1, bow = 2, pad = 1.7, ridge = null, carve = 1, gapEnds = true } = {}) {
  const G = limbGeom(A, B, prof, bow);
  const { d, ln, lit, sh, cen, W, n } = G;
  const outline = lit.concat(sh.slice().reverse());
  // the paper gap that rings the limb where it crosses black (a fill, not a stroke)
  if (pad > 0) {
    const po = [];
    // the gap is cut with a brush too: thin at the joints, opening mid-span, wider on
    // the shadow side where the limb lifts off the black behind it
    const pf = (i) => pad * (0.35 + 0.9 * Math.pow(Math.sin(Math.PI * i / n), 0.7)) * (0.8 + 0.4 * hashNoise(seed + 30, i));
    for (let i = 0; i <= n; i++) po.push(add(add(lit[i], ln, pf(i) * 0.75), d, i === 0 ? -pad : i === n ? pad : 0));
    for (let i = n; i >= 0; i--) po.push(add(add(sh[i], ln, -pf(i) * 1.35), d, i === 0 ? -pad : i === n ? pad : 0));
    ctx.fillStyle = PAPER;
    ctx.beginPath(); polyPath(ctx, po); ctx.fill();
  }
  if (far || carve <= 0) {
    // distance: a flat black silhouette, nothing carved
    ctx.fillStyle = INK;
    ctx.beginPath(); polyPath(ctx, outline); ctx.fill();
    return G;
  }
  // ---- round 7: the limb is MODELLED, not a cut-out. Pale bone-skin on the lit
  // side, a solid black shadow side, and between them a band of pen hatching that
  // wraps the cylinder: each stroke starts heavy where it leaves the black, curves
  // round the form toward the wrist and tapers to a point in the light. A second,
  // crossing layer appears only in the deepest pocket (under the belly near the
  // elbow). The lit contour is a pen line that swells at the joints and breaks to
  // nothing mid-span; the shadow contour is the black mass itself.
  const span = (i) => W[i][0] + W[i][1];
  // where the light gives out, measured from the lit edge as a fraction of the width;
  // it wanders like a drawn line (sinew bumps) and closes in at the joints
  const termF = (i) => {
    const s = i / n;
    return 0.38 + 0.07 * Math.sin(s * 9.5 + seed) + 0.05 * (hashNoise(seed + 21, i) - 0.5) - 0.1 * g((s - 0.02) / 0.08) - 0.08 * g((s - 0.98) / 0.06);
  };
  const term = [];
  for (let i = 0; i <= n; i++) term.push(add(cen[i], ln, W[i][0] - span(i) * termF(i)));
  const termS = spline(term, 2);
  ctx.fillStyle = BONE;
  ctx.beginPath(); polyPath(ctx, outline); ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  polyPath(ctx, termS.concat(sh.slice().reverse()));
  // hatch band: tapered strokes leaving the black, curving round the form
  {
    const L = G.L;
    const step = 2.4;
    const count = Math.floor(L / step);
    for (let k = 1; k < count; k++) {
      if (hashNoise(seed + 28, k) < 0.1) continue; // the pen skips: hatch comes in clumps
      const s = (k + 0.55 * (hashNoise(seed + 22, k) - 0.5)) / count;
      const i = Math.max(0, Math.min(n, Math.round(s * n)));
      const band = span(i) * (1 - termF(i));
      const lit = W[i][0] + W[i][1] - band; // distance from lit edge to terminator
      const h = hashNoise(seed + 23, k);
      // long strokes near the belly, short near the light; every few a short one
      const reach = (k % 3 === 1 ? 0.35 : 0.55 + 0.35 * h) * Math.max(0.4, 1 - Math.abs(s - 0.32) * 0.7);
      const start = add(add(cen[i], ln, W[i][0] - lit - 0.6), d, 0);
      const endD = lit * reach;
      const e = add(add(start, ln, endD), d, endD * (0.16 + 0.22 * h)); // leans toward the wrist
      const m = add(add(start, ln, endD * 0.5), d, -endD * 0.06); // a cross-contour arc
      const wmax = 0.8 + 0.45 * h + (k % 5 === 0 ? 0.35 : 0);
      ribbonPath(ctx, quad(start, m, e, 3), (t) => wmax * Math.pow(1 - t, 0.6) + 0.03);
      // an interleaved short stroke: the hatch is densest at the terminator
      if (k % 2 === 0) {
        const s2 = s + 0.5 / count;
        const i2 = Math.max(0, Math.min(n, Math.round(s2 * n)));
        const lit2 = span(i2) * termF(i2);
        const st2 = add(cen[i2], ln, W[i2][0] - lit2 - 0.5);
        const L2 = lit2 * (0.18 + 0.14 * hashNoise(seed + 27, k));
        ribbonPath(ctx, [st2, add(add(st2, ln, L2 * 0.5), d, -L2 * 0.03), add(add(st2, ln, L2), d, L2 * 0.2)], (t) => 0.75 * Math.pow(1 - t, 0.6) + 0.03);
      }
    }
    // crosshatch only in the deepest pocket: the belly's swell near the elbow
    for (let k = 0; k < 9; k++) {
      const s = 0.12 + k * 0.032;
      const i = Math.round(s * n);
      const lit = span(i) * termF(i);
      const start = add(cen[i], ln, W[i][0] - lit - 0.4);
      const len = lit * (0.32 + 0.22 * hashNoise(seed + 24, k));
      const e = add(add(start, ln, len), d, -len * 0.75);
      ribbonPath(ctx, [start, mix(start, e, 0.5), e], (t) => 1.05 * (1 - t) + 0.03);
    }
  }
  // lit contour: a hairline that breaks mid-span and swells at the joints
  {
    let run = [];
    const flush = () => {
      if (run.length > 1) { const r = run; ribbonPath(ctx, r.map((q) => q[0]), (t, j) => r[j][1]); }
      run = [];
    };
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const w = 0.55 + 1.9 * g((s - 0.02) / 0.12) + 1.5 * g((s - 0.98) / 0.1) + 0.45 * hashNoise(seed + 25, i);
      if (s > 0.3 && s < 0.75 && hashNoise(seed + 26, i) < 0.35) { flush(); continue; }
      run.push([add(lit[i], ln, -w * 0.3), w]);
    }
    flush();
  }
  // the bone under the skin: a groove line along the lit side, swelling where it
  // dives under the muscle
  if (ridge) {
    const [r0, r1, rw] = ridge;
    const pts = [];
    for (let i = Math.round(r0 * n); i <= Math.round(r1 * n); i++) pts.push(add(cen[i], ln, W[i][0] - rw(i / n) - 1.2));
    if (pts.length > 2) ribbonPath(ctx, spline(pts, 2), (t) => 0.15 + 1.5 * Math.pow(Math.sin(Math.PI * t), 1.5) * (1 - 0.5 * t));
  }
  ctx.fill();
  // white carving inside the black: tapered wedges, never even ribbons
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  // reflected light just inside the shadow contour: swells under the belly, dies out
  {
    const pts = [];
    for (let i = Math.round(n * 0.12); i <= Math.round(n * 0.86); i++) pts.push(add(cen[i], ln, -W[i][1] + 1.6 + 0.4 * Math.sin(i)));
    ribbonPath(ctx, pts, (t) => 2.1 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 1.6) + 0.02);
  }
  // two tendons in the black, converging on the wrist, each a single tapering wedge
  for (let k = 0; k < 2; k++) {
    const f = 0.42 + k * 0.24;
    const ia = Math.round((0.2 + k * 0.08) * n), ib = Math.round((0.88 - k * 0.1) * n);
    const pts = [];
    for (let i = ia; i <= ib; i++) {
      const s = i / n;
      const black = span(i) * (1 - termF(i));
      pts.push(add(cen[i], ln, -W[i][1] + black * f * (1 - 0.3 * s)));
    }
    if (pts.length > 2) ribbonPath(ctx, pts, (t) => (1.7 - k * 0.4) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.9) * (1 - 0.6 * t) + 0.02);
  }
  ctx.fill();
  return G;
}

// a pale knuckle cap: a bone pebble with an ink contour and a dot of shine
export function knob(list, c, rx, ry, rot, seed) { list.push(pebblePts(c, rx, ry, rot, seed)); }

// forearm profile (round 6): a heavy sinew mass. Olecranon knob at the elbow, an
// extensor swell on the lit side, a deep belly (~24 px half) on the shadow side that
// peaks a third of the way down, then a hard taper into a pinched wrist.
const belly = (s) => s < 0.3 ? 0.3 + 0.7 * Math.pow(Math.sin((Math.PI / 2) * (s / 0.3)), 0.8)
  : Math.pow(Math.cos((Math.PI / 2) * Math.min(1, (s - 0.3) / 0.64)), 1.35);
export const FORE = (s) => [
  3.2 + 2.8 * g((s - 0.04) / 0.1) + 3.6 * g((s - 0.24) / 0.17) + 1.2 * g((s - 0.96) / 0.05) + 0.8 * (1 - s),
  2.7 + 21.5 * belly(s) + 1.4 * g((s - 0.97) / 0.05),
];
// upper-arm profile: knobbed both ends, a biceps belly (~14 px) below the sleeve
export const UPPER = (s) => [
  3.6 + 2.2 * g((s - 0.04) / 0.1) + 3.0 * g((s - 0.56) / 0.2) + 2.6 * g((s - 0.95) / 0.07),
  4.0 + 11.5 * g((s - 0.63) / 0.21) + 3.2 * g((s - 0.95) / 0.07),
];

// ---- hands ----------------------------------------------------------------------

// Round 8: ink-stained black fingers, carved in white like the reference claw: a rim
// light along each bone's lit flank that breaks at every joint, a white crescent rolling
// over each knuckle, and the talon's lit edge tapering out before the point.
function inkedCarve(ctx, F, seed) {
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  F.forEach((f, fi) => {
    for (let k = 0; k < f.J.length - 1; k++) {
      const A = f.J[k], B = f.J[k + 1];
      const u = unit(A, B);
      let nl = [-u[1], u[0]];
      if (dot(nl, LIGHT) < 0) nl = [-nl[0], -nl[1]];
      const w0 = f.w[Math.min(2, k)], w1 = f.w[Math.min(2, k + 1)];
      const a = 0.16 + 0.08 * hashNoise(seed + 80 + fi, k), b = 0.86 - 0.06 * hashNoise(seed + 81 + fi, k);
      const pts = [];
      for (let j = 0; j <= 4; j++) {
        const s = a + (b - a) * j / 4;
        const w = w0 + (w1 - w0) * s;
        pts.push(add(mix(A, B, s), nl, w * 0.52 + 0.15 * Math.sin(j * 2 + fi)));
      }
      ribbonPath(ctx, pts, (t) => 0.95 * Math.pow(Math.sin(Math.PI * t), 0.8) + 0.02);
      if (k > 0) {
        // the knuckle: a crescent of light over the joint's lit shoulder
        const r = f.w[Math.min(2, k)] * 0.95;
        const la = Math.atan2(nl[1], nl[0]);
        const arc = [];
        for (let j = 0; j <= 5; j++) { const th = la - 1.0 + j * 0.4; arc.push([A[0] + Math.cos(th) * r * 0.62, A[1] + Math.sin(th) * r * 0.62]); }
        ribbonPath(ctx, arc, (t) => 1.05 * Math.sin(Math.PI * (0.06 + t * 0.88)) + 0.03);
      }
    }
    // the talon's lit edge
    const tp = f.talon, m = tp.length - 1;
    const hl = [];
    for (let i = 1; i < Math.round(m * 0.78); i++) {
      const u = unit(tp[i - 1], tp[i + 1]);
      let nr = [-u[1], u[0]];
      if (dot(nr, LIGHT) < 0) nr = [-nr[0], -nr[1]];
      hl.push(add(tp[i], nr, f.tw * Math.pow(1 - i / m, 0.85) * 0.22));
    }
    if (hl.length > 1) ribbonPath(ctx, hl, (t) => 1.3 * Math.pow(Math.sin(Math.PI * (0.08 + t * 0.92)), 0.8) * (1 - 0.45 * t) + 0.03);
  });
  ctx.fill();
}

// F: [{ J: [knuckle, mid, end, nailbed], w: [w0, w1, w2], talon: pts, tw, thumb }]
// palm: polygon. Fingers inked in the given order (first = furthest back).
// Round 7: near hands are MODELLED bone, not black cut-outs. Every finger bone is a
// pale shape inside a pen contour that is a hairline on the lit side and a heavy
// swelling line on the shadow side (the pale fill is shifted toward the light inside
// its ink underlay); short hatch wraps each bone from its shadow edge; the joints get
// an ink crease on the shadow side; the talons stay solid black hooks carved by one
// tapering white highlight. Far hands stay black silhouettes.
export function drawHand(ctx, palm, F, { far = false, seed = 1, wrist = null, tendons = true, caps: capsOn = true, inked = false, ring = 1 } = {}) {
  let cx = 0, cy = 0;
  for (const p of palm) { cx += p[0]; cy += p[1]; }
  cx /= palm.length; cy /= palm.length;
  const padded = palm.map((p) => { const v = [p[0] - cx, p[1] - cy], l = len(v) || 1; return add(p, v, 1.6 / l); });
  ctx.fillStyle = PAPER;
  ctx.beginPath(); polyPath(ctx, padded); ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath(); polyPath(ctx, palm); ctx.fill();
  if (!far && inked && tendons && wrist) {
    // ink-stained hand: the extensor tendons carved in white, fanning to the knuckles
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    F.forEach((f, j) => {
      if (f.thumb) return;
      const a = mix(wrist, f.J[0], 0.18 + 0.06 * hashNoise(seed + 70, j)), b = mix(wrist, f.J[0], 0.84);
      ribbonPath(ctx, [a, add(mix(a, b, 0.5), LIGHT, 0.5), b], (t) => (j === 1 || j === 2 ? 0.95 : 0.7) * Math.pow(Math.sin(Math.PI * t), 0.8) + 0.02);
    });
    ctx.fill();
  }
  if (!far && !inked) {
    // back of the hand: pale, inset toward the light so its shadow edge is a heavy line
    const inset = palm.map((p) => { const v = [cx - p[0], cy - p[1]], l = len(v) || 1; return add(add(p, v, 1.3 / l), LIGHT, 0.9); });
    ctx.fillStyle = BONE;
    ctx.beginPath(); polyPath(ctx, inset); ctx.fill();
    if (tendons && wrist) {
      // metacarpals: tapered ink lines fanning from the wrist, heaviest at the knuckle
      // end where the bone dives under; hatch on the shadow side of each
      ctx.fillStyle = INK;
      ctx.beginPath();
      F.forEach((f, j) => {
        if (f.thumb) return;
        const a = mix(wrist, f.J[0], 0.22), b = mix(wrist, f.J[0], 0.8);
        ribbonPath(ctx, [a, add(mix(a, b, 0.5), LIGHT, 0.6), b], (t) => 0.15 + 1.35 * Math.pow(t, 1.4));
        for (let k = 0; k < 3; k++) {
          const p = mix(a, b, 0.3 + k * 0.2);
          const u = unit(a, b);
          let nr = [-u[1], u[0]];
          if (dot(nr, LIGHT) > 0) nr = [-nr[0], -nr[1]];
          ribbonPath(ctx, [p, add(add(p, nr, 2.4), u, 0.8)], (t) => 0.9 * (1 - t) + 0.03);
        }
      });
      ctx.fill();
    }
  }
  // paper ring round every finger + talon (one batched fill)
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  for (const f of F) {
    ribbonPath(ctx, f.J, (t, i) => f.w[Math.min(2, i)] * 2 + 3.4 * ring);
    ribbonPath(ctx, f.talon, (t) => (f.tw + 3 * ring) * Math.pow(1 - t, 0.75) + 0.3 * ring);
    if (f.bulge) for (const [c, r] of f.bulge) { ctx.moveTo(c[0] + r + 1.7 * ring, c[1]); ctx.arc(c[0], c[1], r + 1.7 * ring, 0, Math.PI * 2); }
  }
  ctx.fill();
  const segs = (f, k) => {
    const A = f.J[k], B = f.J[k + 1];
    const w0 = f.w[Math.min(2, k)], w1 = f.w[Math.min(2, k + 1)];
    return { A, B, pts: [A, mix(A, B, 0.22), mix(A, B, 0.5), mix(A, B, 0.78), B], prof: [w0 * 1.32, w0 * 1.0, (w0 + w1) * 0.4, w1 * 0.96, w1 * 1.24] };
  };
  // ink: jointed segments that swell at each knuckle, then the hooked talon
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (const f of F) {
    for (let k = 0; k < f.J.length - 1; k++) {
      const { pts, prof } = segs(f, k);
      ribbonPath(ctx, pts, (t, i) => prof[i] * 2);
    }
    ribbonPath(ctx, f.talon, (t) => f.tw * Math.pow(1 - t, 0.85) + 0.15);
    if (f.bulge) for (const [c, r] of f.bulge) { ctx.moveTo(c[0] + r, c[1]); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); }
  }
  ctx.fill();
  const caps = [];
  if (capsOn && !inked) for (const f of F) if (!f.thumb) knob(caps, f.J[0], f.w[0] * 0.95 + 0.6, f.w[0] * 0.75 + 0.4, Math.atan2(f.J[1][1] - f.J[0][1], f.J[1][0] - f.J[0][0]), seed + caps.length * 3);
  if (!far && inked) inkedCarve(ctx, F, seed);
  if (!far && !inked) {
    // the bone inside each segment, pushed toward the light: the contour left round it
    // is a hairline on the lit side and ~2 px on the shadow side
    ctx.fillStyle = BONE;
    ctx.beginPath();
    for (const f of F) {
      for (let k = 0; k < f.J.length - 1; k++) {
        const { pts, prof } = segs(f, k);
        const sh = pts.map((p) => add(p, LIGHT, 0.75));
        ribbonPath(ctx, [mix(sh[0], sh[1], 0.35), ...sh.slice(1, 4), mix(sh[3], sh[4], 0.65)], (t, i) => Math.max(0.2, [prof[0], prof[1], prof[2], prof[3], prof[4]][i] * 2 - 2.6));
      }
      if (f.bulge) for (const [c, r] of f.bulge) { const q = add(c, LIGHT, 0.7); ctx.moveTo(q[0] + r - 1.5, q[1]); ctx.arc(q[0], q[1], r - 1.5, 0, Math.PI * 2); }
    }
    ctx.fill();
    // ink: hatch wrapping each bone from its shadow edge, a crease at every joint
    ctx.fillStyle = INK;
    ctx.beginPath();
    F.forEach((f, fi) => {
      for (let k = 0; k < f.J.length - 1; k++) {
        const { A, B } = segs(f, k);
        const u = unit(A, B);
        let ns = [-u[1], u[0]];
        if (dot(ns, LIGHT) > 0) ns = [-ns[0], -ns[1]]; // toward the shadow
        const w = f.w[Math.min(2, k)];
        const m = 2 + (hashNoise(seed + 60 + fi, k) > 0.5 ? 1 : 0);
        for (let j = 0; j < m; j++) {
          const p = add(mix(A, B, 0.3 + j * 0.22), ns, w * 0.95);
          const e = add(add(p, ns, -w * (0.75 + 0.35 * hashNoise(seed + 61 + fi, j + k * 3))), u, w * 0.35);
          ribbonPath(ctx, [p, add(mix(p, e, 0.5), u, -0.4), e], (t) => 1.0 * Math.pow(1 - t, 0.8) + 0.03);
        }
        if (k > 0) {
          // joint crease: a short hooked line on the shadow side of the knuckle
          const r = f.w[k] * 1.1;
          const arc = [];
          for (let j = 0; j <= 4; j++) {
            const th = -0.9 + j * 0.45;
            const dir = [ns[0] * Math.cos(th) - ns[1] * Math.sin(th), ns[0] * Math.sin(th) + ns[1] * Math.cos(th)];
            arc.push(add(A, dir, r * 0.75));
          }
          ribbonPath(ctx, arc, (t) => 1.3 * Math.sin(Math.PI * (0.06 + t * 0.88)) + 0.03);
        }
      }
      if (f.bulge) for (const [c, r] of f.bulge) {
        // a knuckle rolling toward the viewer: a dark crescent on its shadow side
        const la = Math.atan2(-LIGHT[1], -LIGHT[0]) + (f.ba || 0);
        const arc = [];
        for (let j = 0; j <= 6; j++) { const th = la - 1.1 + j * (2.2 / 6); arc.push([c[0] + Math.cos(th) * r * 0.62, c[1] + Math.sin(th) * r * 0.62]); }
        ribbonPath(ctx, arc, (t) => 1.6 * Math.sin(Math.PI * (0.06 + t * 0.88)) + 0.04);
      }
    });
    ctx.fill();
    // white: the talon's lit edge, tapering out before the point
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    for (const f of F) {
      const tp = f.talon, m = tp.length - 1;
      const hl = [];
      for (let i = 1; i < Math.round(m * 0.8); i++) {
        const u = unit(tp[i - 1], tp[i + 1]);
        let nr = [-u[1], u[0]];
        if (dot(nr, LIGHT) < 0) nr = [-nr[0], -nr[1]];
        hl.push(add(tp[i], nr, f.tw * Math.pow(1 - i / m, 0.85) * 0.2));
      }
      if (hl.length > 1) ribbonPath(ctx, hl, (t) => 1.6 * Math.pow(Math.sin(Math.PI * (0.08 + t * 0.92)), 0.8) * (1 - 0.4 * t) + 0.03);
    }
    ctx.fill();
  }
  if (caps.length) pebbles(ctx, caps, far);
}

// Hand hooked over a ledger's top board, in three-quarter view (round 6). Book-local
// frame: top edge y = -hh, spine at x = -hw, fore-edge at x = +hw; wrist = the wrist in
// that frame (above the top edge), dir = forearm direction there. The back of the hand
// rides above the board; each finger's first bone is foreshortened toward the viewer, so
// its middle knuckle sits ON the edge as a round black bulge carved with a lit crescent;
// the middle and end bones bend down over the cover and a long hooked talon (40-50)
// rakes down across it. Spacing and splay are uneven: the index and middle fingers
// crowd together, the little finger splays out over the fore-edge corner.
export function gripHand(ctx, wrist, hw, hh, seed = 240, { far = false, dir = [0.97, 0.25], inked = true } = {}) {
  // Round 13: one black hand, legible finger by finger. The back of the hand is a black
  // wedge from the wrist to a knuckle row just above the board; four fingers hook over
  // the top edge, each ringed in paper so it parts from the black cover, and drag four
  // long talons down it (uneven lengths and splay), each with a white rim highlight
  // that dies before its needle tip. The thumb hooks round the spine.
  const top = -hh;
  const cx = Math.max(-hw + 15, Math.min(hw - 15, wrist[0] - 4));
  const F = [];
  // round 21: the fingers CURL. Each is four bones (knuckle above the board, a joint on
  // the edge, two more down the cover), every segment bending further in toward the
  // middle of the hand, so the finger is a hooked chain of knuckles and not a spike; the
  // talons are short-to-long and unequal, each a curved hook that bites back inward
  const spec = [
    // dx    lift  talon  splay  curl   hook  width  bone lengths
    [-13.4, 3.0, 19, -0.5, 0.3, -7.5, 3.0, [8.0, 6.4]],
    [-4.4, 4.8, 31, -0.24, 0.13, -5.5, 3.5, [10.5, 8.2]],
    [5.8, 4.0, 25, 0.28, -0.13, 4.5, 3.3, [9.6, 7.4]],
    [14.4, 1.8, 14, 0.66, -0.34, 7.0, 2.8, [6.8, 5.2]],
  ];
  spec.forEach(([dx, lift, tl, splay, curl, hook, w, bl], f) => {
    const h = (k) => hashNoise(seed + f * 7, k);
    const K = [cx + dx * 0.82 + (h(1) - 0.5) * 1.2, top - 7 - lift]; // MCP knuckle, above the board
    const J1 = [cx + dx + 0.8, top + [1.4, -0.6, 0.8, 2.2][f] + (h(2) - 0.5)]; // PIP: on the edge, unevenly
    const a2 = splay, a3 = splay + curl;
    const J2 = [J1[0] + Math.sin(a2) * bl[0], J1[1] + Math.cos(a2) * bl[0]]; // DIP, down over the cover
    const J3 = [J2[0] + Math.sin(a3) * bl[1], J2[1] + Math.cos(a3) * bl[1]]; // the last bone, bending in
    const ta = a3 + curl * 0.9;
    const talon = quillPts(add(J3, [0, -0.4]), ta, tl + (h(3) - 0.5) * 3, hook * 0.55, hook * 1.25, 14);
    F.push({ J: [K, J1, J2, J3], w, talon });
  });
  const wv = unit([0, 0], dir), wn = [-wv[1], wv[0]];
  // back of the hand: black, pinched at the wrist, fanning to the knuckle row
  const palm = spline([
    add(wrist, wn, 4.6), add(F[3].J[0], [3.6, -1.5]), add(F[3].J[0], [2.4, 2.6]), add(F[2].J[0], [0, 3.4]),
    add(F[1].J[0], [0, 3.6]), add(F[0].J[0], [-1.5, 3.2]), add(F[0].J[0], [-4.0, -1.0]), add(wrist, wn, -4.6),
  ], 3, true);
  // thumb round the spine
  const thumb = { J: [add(F[0].J[0], [-2, 1]), [-hw - 1.4, top + 1.2], [-hw - 3.2, top + 11]], w: 3.0, talon: quillPts([-hw - 3.2, top + 10.5], 0.06, 24, 1.0, 5.0, 12) };
  const all = [thumb, ...F];
  // paper rings (finger + talon), batched
  if (!far) {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    // round 29: the lift gap follows the knuckled profile and is pushed toward the
    // light, so it is a hair on the shadow side and a cut on the lit side, never a tube
    const wkR = [1.25, 0.66, 1.15, 0.6, 1.02, 0.55, 0.86];
    for (const f of all) {
      const pts = [f.J[0]];
      for (let k = 1; k < f.J.length; k++) pts.push(mix(f.J[k - 1], f.J[k], 0.5), f.J[k]);
      ribbonPath(ctx, pts.map((p) => add(p, LIGHT, 0.7)), (t, i) => f.w * 2 * wkR[i] + 1.1);
      ribbonPath(ctx, f.talon.map((p) => add(p, LIGHT, 0.5)), (t) => (f.w * 1.5 + 1.1) * Math.pow(1 - t, 0.85) + 0.25);
    }
    polyPath(ctx, palm.map((p) => add(p, unit(mix(wrist, [cx, top - 8], 0.5), p), 1.4)));
    ctx.fill();
  }
  ctx.fillStyle = INK;
  ctx.beginPath();
  polyPath(ctx, palm);
  for (const f of all) {
    // a jointed finger: thick at each knuckle, pinched mid-bone, swelling at the next joint
    const pts = [f.J[0]];
    for (let k = 1; k < f.J.length; k++) pts.push(mix(f.J[k - 1], f.J[k], 0.5), f.J[k]);
    const wk = [1.25, 0.66, 1.15, 0.6, 1.02, 0.55, 0.86];
    ribbonPath(ctx, pts, (t, i) => f.w * 2 * wk[i] * (1 - 0.06 * Math.floor(i / 2)));
    ribbonPath(ctx, f.talon, (t) => f.w * 1.5 * Math.pow(1 - t, 0.9) + 0.1);
  }
  ctx.fill();
  if (far) return;
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  // tendons fanning down the back of the hand, tapering at both ends
  for (let k = 1; k < 3; k++) {
    const a = mix(wrist, F[k].J[0], 0.2), b = mix(wrist, F[k].J[0], 0.85);
    ribbonPath(ctx, [a, add(mix(a, b, 0.5), LIGHT, 0.4), b], taper(0.9, 0.35, 0.35));
  }
  for (const f of all) {
    // round 14: every joint is segmented: a crescent of light rolls over the MCP knuckle,
    // the PIP on the board's edge and the DIP, each bowed across the finger's own axis
    // (not one stamped arc), heaviest on the edge knuckle, so the finger reads as three
    // bones and not a stick
    f.J.forEach((B, j) => {
      const nb = f.J[Math.min(f.J.length - 1, j + 1)], pb = f.J[Math.max(0, j - 1)];
      const u = unit(pb, nb), nr = [-u[1], u[0]];
      // round 22: the crescent only rolls over the LIT half of the knuckle (no white bar
      // straight across the finger: that read as a bone ladder), and a rim line runs
      // down the lit flank of the bone below it, tapering at both ends
      const r = f.w * [0.95, 0.85, 0.72, 0.6][j];
      const ls = dot(nr, LIGHT) > 0 ? 1 : -1;
      const arc = [];
      for (let k = 0; k <= 4; k++) { const th = Math.PI * (0.08 + k * 0.1); arc.push(add(add(B, nr, ls * Math.cos(th) * r), u, -Math.sin(th) * r * 0.7)); }
      const ww = [0.7, 0.95, 0.7, 0.55][j];
      ribbonPath(ctx, arc, (t) => ww * Math.sin(Math.PI * (0.06 + t * 0.88)) + 0.02);
      if (j < f.J.length - 1) {
        const n2 = f.J[j + 1];
        const v = unit(B, n2), nv = [-v[1], v[0]];
        const lv = dot(nv, LIGHT) > 0 ? 1 : -1;
        const wv = f.w * 0.5;
        ribbonPath(ctx, [add(mix(B, n2, 0.22), nv, lv * wv), add(mix(B, n2, 0.5), nv, lv * wv * 1.05), add(mix(B, n2, 0.78), nv, lv * wv * 0.9)], (t) => 0.75 * Math.sin(Math.PI * t) + 0.02);
      }
    });
    // the talon's rim highlight along its lit flank, dying before the point
    const tp = f.talon, m = tp.length - 1;
    const hl = [];
    for (let i = 1; i < Math.round(m * 0.74); i++) {
      const u = unit(tp[i - 1], tp[i + 1]);
      let nr = [-u[1], u[0]];
      if (dot(nr, LIGHT) < 0) nr = [-nr[0], -nr[1]];
      hl.push(add(tp[i], nr, f.w * 1.5 * Math.pow(1 - i / m, 0.9) * 0.24));
    }
    if (hl.length > 1) ribbonPath(ctx, hl, (t) => 1.15 * Math.pow(Math.sin(Math.PI * (0.06 + t * 0.94)), 0.7) * (1 - 0.4 * t) + 0.03);
  }
  ctx.fill();
}

// a cord of bone beads round the wrist: small closed shapes, each with a shade crescent
function bracelet(ctx, wrist, wv, wn, r) {
  const list = [];
  for (let i = 0; i < 6; i++) {
    const s = i / 5 - 0.5;
    list.push(add(add(wrist, wn, s * r * 2), wv, -1.2 + 3.2 * (1 - 4 * s * s)));
  }
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  for (const [x, y] of list) { ctx.moveTo(x + 3.6, y); ctx.arc(x, y, 3.6, 0, Math.PI * 2); }
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (const [x, y] of list) { ctx.moveTo(x + 2.8, y); ctx.arc(x, y, 2.8, 0, Math.PI * 2); }
  ctx.fill();
  // jet beads: each a black ball with one white dot of shine toward the light
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  for (const [x, y] of list) { const hx = x + LIGHT[0] * 1.1, hy = y + LIGHT[1] * 1.1; ctx.moveTo(hx + 0.8, hy); ctx.arc(hx, hy, 0.8, 0, Math.PI * 2); }
  ctx.fill();
}

// A free claw: dir = forearm direction at the wrist; curl 0 open .. 1 fist.
export function clawHand(ctx, wrist, dir, curl, seed, { palmSide = 1, spread = 1, far = false, inked = true } = {}) {
  const d = dir, n = [-d[1] * palmSide, d[0] * palmSide];
  const F = [];
  for (let f = 0; f < 4; f++) {
    const off = (f - 1.5) * 5.2;
    const k0 = add(add(wrist, d, 15.5 + (f === 1 || f === 2 ? 1.6 : 0)), n, off);
    let a = Math.atan2(d[1], d[0]) + (f - 1.5) * 0.2 * spread;
    const lens = [11.5, 9.5, 7.5];
    const J = [k0];
    let p = k0;
    for (let s2 = 0; s2 < 3; s2++) {
      a += curl * (0.68 + 0.18 * hashNoise(seed, f * 3 + s2)) * -palmSide + (s2 === 0 ? 0.1 * (1 - curl) * palmSide : 0);
      p = [p[0] + Math.cos(a) * lens[s2], p[1] + Math.sin(a) * lens[s2]];
      J.push(p);
    }
    const ta = a - 0.5 * palmSide;
    const talon = quillPts(p, Math.PI / 2 - ta, 15 + hashNoise(seed + 3, f) * 3, 0, 4.5 * palmSide, 8);
    F.push({ J, w: [3.3, 2.9, 2.4], talon, tw: 4.4 });
  }
  {
    const tb = add(add(wrist, d, 4), n, 6);
    let a = Math.atan2(d[1], d[0]) + 0.85 * palmSide;
    const p1 = [tb[0] + Math.cos(a) * 10.5, tb[1] + Math.sin(a) * 10.5];
    a -= (0.6 + curl * 0.8) * palmSide;
    const p2 = [p1[0] + Math.cos(a) * 9, p1[1] + Math.sin(a) * 9];
    const talon = quillPts(p2, Math.PI / 2 - (a - 0.5 * palmSide), 12, 0, 3.5 * palmSide, 8);
    F.unshift({ J: [tb, p1, p2], w: [3.3, 2.8, 2.3], talon, tw: 4.0, thumb: true });
  }
  const K = F.slice(1).map((f) => f.J[0]);
  const palm = [add(wrist, n, 5), add(add(K[0], n, -2.6), d, 1.5), add(K[0], d, -2.5), add(K[3], d, -2.5), add(add(K[3], n, 2.6), d, 1.5), add(wrist, n, -5.5)];
  // fingers on the far side of the palm first
  const order = palmSide > 0 ? F : [F[0], ...F.slice(1).reverse()];
  drawHand(ctx, palm, order, { far, seed, wrist, inked });
}

