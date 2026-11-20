// The six petitioner bodies. Owner: art. Same geometry at every scale; S.hi switches on the
// engraving (white cuts in the black, black hatch on the paper parts, folds, faces).
// Local space: feet on y = 0, facing +x, 1 unit = 1 px at fight scale.
//   drawFighterBody(ctx, R, P, S)   R = rig(...) joints, P = pose, S = style
// S: { cls, weapon, charm, accent, t, hi, D (units per device px), drag, sway, castSpell,
//      gesture, armour, phase }

import { hashNoise } from '../../core/rng.js';
import { INK, PAPER, RED } from '../ink.js';
import { spline as spline0, quad, ribbonPath, penPath, spikePath, contour, poly, polyPath } from '../art/pen.js';
import { hatchIn, inkForm, paperForm, ellPts, rectPts, bbox, BONE } from './engrave.js';
import { engrave, inkFold, tatters, ruled, bonePart, marks } from './inkwork.js';
import { inkLimb } from '../art/limb.js';

// larger figures draw every curve finer
let LOD = 0;
const spline = (p, per = 4, closed = false) => spline0(p, LOD ? Math.max(2, per) * (LOD + 1) : per, closed);
import { dirv, add, mix, lerp, clamp, WPN, gripOff } from './pose.js';
import { drawWeapon, lamp, smoke } from './weapons.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const unit = (a, b) => { const d = sub(b, a), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
const nrm = (d) => [-d[1], d[0]];

export function ribbonPts(pts, wf) {
  const n = pts.length, L = [], Rr = [];
  for (let i = 0; i < n; i++) {
    const q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let dx = q[0] - o[0], dy = q[1] - o[1];
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const w = wf(i / (n - 1), i) * 0.5, p = pts[i];
    L.push([p[0] - dy * w, p[1] + dx * w]); Rr.push([p[0] + dy * w, p[1] - dx * w]);
  }
  return L.concat(Rr.reverse());
}

// Model a black mass the way the boss's are: fringe off the lit edge, long folds that break
// into dashes, a pocket of crosshatch where asked. Nothing at the 90 px sprite.
function carve(ctx, pts, S, o = {}) {
  if (!S.lod) return;
  engrave(ctx, pts, S, { folds: o.folds ?? (S.lod >= 2 ? 5 : 2), lit: o.lit, foldAngle: o.fold ?? o.angle ?? Math.PI / 2, seed: o.seed ?? 7, pocket: o.pocket, reach: o.reach, edges: o.edges, fringe: o.fringe });
}
// Ruled hatch on a coloured cloth (the accent): even lines that stop where the light is.
function shade(ctx, pts, S, o = {}) {
  if (!S.lod) return;
  hatchIn(ctx, pts, { mode: 'shadow', color: INK, gap: 2.4 * S.D, w: 0.9 * S.D, angle: o.angle ?? 0.9, lo: o.lo ?? 0.35, gamma: 0.12, wobble: 0.1, seed: o.seed ?? 9 });
}
// Designed folds: white negative lines from the shadow end (a) to the lit end (b).
function folds(ctx, list, S, k = 1) {
  if (S.lod) {
    list.forEach(([a, c, b, w], i) => inkFold(ctx, quad(a, c, b, 8), S, (w / 1.2) * k, 300 + i * 7 + Math.round(a[0] * 3), 0.5));
    return;
  }
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  for (const [a, c, b, w] of list) penPath(ctx, quad(a, c, b, 8), w, 0.3, 0.35);
  ctx.fill();
}

// ---- legs ---------------------------------------------------------------------------
// narrow pointed boot: heel, ankle, a long instep running out to a point
function bootPts(foot, k, S) {
  const [fx, fy] = foot;
  if (!S.lod) return [[fx - 5 * k, fy - 6 * k], [fx + 3, fy - 6 * k], [fx + 10 * k, fy - 1], [fx + 10 * k, fy + 0.5], [fx - 6 * k, fy + 0.5]];
  const L = S.hi ? 1.12 : 1;
  return spline0([[fx - 4.2 * k, fy - 6.6 * k], [fx + 1.6, fy - 6.4 * k], [fx + 3.6, fy - 3.6 * k], [fx + 8.6 * k * L, fy - 1.6], [fx + 11.6 * k * L, fy - 0.2], [fx + 9 * k * L, fy + 0.6], [fx - 4.4 * k, fy + 0.6], [fx - 5.2 * k, fy - 1.6]], 4, true);
}
function legs(ctx, R, S, { w0 = 7, w1 = 4, boot = 1, rim = true, cuff = true, wrap = false, armour = false } = {}) {
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    const hip = add(R.hip, [s * 1.5, 0]), knee = R.knees[i], foot = R.feet[i];
    const ank = [foot[0] - 1, foot[1] - 4 * boot];
    const ww0 = S.hi ? w0 * 0.92 : w0, ww1 = S.hi ? w1 * 0.8 : w1;
    const path = spline([hip, mix(hip, knee, 0.5), knee, mix(knee, ank, 0.5), ank], 3);
    const leg = ribbonPts(path, (t) => ww0 - t * (ww0 - ww1) + (S.lod ? 0.8 * Math.exp(-(((t - 0.5) / 0.1) ** 2)) : 0));
    poly(ctx, leg, INK);
    carve(ctx, leg, S, { fold: Math.atan2(ank[1] - hip[1], ank[0] - hip[0]), folds: 1, seed: 11 + i, reach: 0.8 });
    if (S.lod) {
      // the knee crease and a fold down the shin
      const kd = unit(hip, knee), kn = nrm(kd);
      inkFold(ctx, [add(add(knee, kd, -2.5), kn, -ww1 * 0.35), add(knee, kn, ww1 * 0.1), add(add(knee, kd, 3), kn, ww1 * 0.4)], S, 0.8, 41 + i, 0.6);
    }
    const bootP = bootPts(foot, boot, S);
    poly(ctx, bootP, INK);
    if (S.lod) {
      carve(ctx, bootP, S, { fold: 0.15, folds: 1, seed: 21 + i, reach: 0.5 });
      // the sole: a ruled white line along the bottom
      ctx.fillStyle = PAPER; ctx.beginPath();
      ribbonPath(ctx, [[foot[0] - 4.2 * boot, foot[1] - 0.5], [foot[0] + 9 * boot, foot[1] - 0.5]], () => 0.9 * S.D);
      ctx.fill();
    } else {
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      if (rim) ribbonPath(ctx, [[knee[0] + 1.8, knee[1] + 3], [ank[0] + 2.5, ank[1] - 3]], (tt) => 0.9 * Math.sin(Math.PI * tt));
      if (cuff) ribbonPath(ctx, [[foot[0] - 5 * boot, foot[1] - 8 * boot], [foot[0] + 3.5, foot[1] - 7.5 * boot]], () => 1.2);
      ctx.fill();
    }
    if (wrap) {
      // bindings: ruled straps wound round the shin
      ctx.fillStyle = PAPER; ctx.beginPath();
      const nW = S.lod ? 6 : 4;
      for (let k = 0; k < nW; k++) { const p = mix(knee, ank, 0.12 + k * (0.8 / nW)); ribbonPath(ctx, [add(p, [-ww1 * 0.55, -1.2]), add(p, [ww1 * 0.55, 0.8])], (t) => (S.lod ? 1.3 * S.D : 0.8) * Math.min(1, Math.sin(Math.PI * t) * 2.5)); }
      ctx.fill();
    }
    if (armour) {
      // knee cop and a greave: ruled steel
      const cop = ellPts(knee[0] + 1.5, knee[1], 3.4, 3.0, 0, 14);
      ruled(ctx, cop, S, { angle: 0.4, gap: 2.2, seed: 61 + i });
      const sp = ribbonPts([mix(knee, ank, 0.22), mix(knee, ank, 0.85)].map((p) => add(p, [1.4, 0])), (t) => 3.6 - t * 1.2);
      ruled(ctx, sp, S, { angle: 0.15, gap: 2.2, seed: 63 + i });
    }
  }
}

// ---- arms ---------------------------------------------------------------------------
function sleeve(ctx, sh, el, hand, S, { w0 = 5.4, w1 = 3.4, gap = true, cuff = 0, bell = 0 } = {}) {
  const path = spline([sh, mix(sh, el, 0.55), el, mix(el, hand, 0.5), hand], 3);
  const ww0 = S.hi ? w0 * 0.9 : w0, ww1 = S.hi ? w1 * 0.85 : w1;
  const wf = (t) => ww0 - t * (ww0 - ww1) + bell * Math.pow(t, 3) + (S.lod ? 0.9 * Math.exp(-(((t - 0.5) / 0.12) ** 2)) : 0);
  if (gap) poly(ctx, ribbonPts(path, (t) => wf(t) + (S.lod ? 2.6 * S.D : 2.2)), PAPER);
  const pts = ribbonPts(path, wf);
  poly(ctx, pts, INK);
  carve(ctx, pts, S, { fold: Math.atan2(hand[1] - sh[1], hand[0] - sh[0]), folds: 1, seed: 31, reach: 0.7 });
  if (S.lod) {
    // creases fanning from the inside of the elbow
    const du = unit(sh, el), df = unit(el, hand);
    const inner = Math.sign(du[0] * df[1] - du[1] * df[0]) || 1;
    const nu = nrm(du), nf = nrm(df);
    for (let k = 0; k < (S.hi ? 3 : 2); k++) {
      const a = add(add(el, du, -2 - k * 2.2), nu, -inner * (ww0 * 0.3));
      const b = add(add(el, df, 2 + k * 2.0), nf, -inner * (ww1 * 0.3));
      inkFold(ctx, quad(a, add(el, add(nu, nf, 1), -inner * 0.4), b, 6), S, 0.85 - k * 0.15, 33 + k, 0.55);
    }
  }
  if (cuff) {
    const d = unit(el, hand), n = nrm(d);
    const c = add(hand, d, -2.5);
    const half = (ww1 + bell) / 2 + 0.6;
    ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, [add(c, n, half), add(c, n, -half)], () => (S.lod ? 1.2 * S.D : cuff)); ctx.fill();
  }
}
// A hand. At the sprite a dot, as always. Larger: an angular closed hand (knuckle block,
// thumb over the grip): black glove, ruled steel gauntlet, or bone.
function fist(ctx, hand, r, S, color = INK, from = null, kind = null) {
  if (!S.lod || !from) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(hand[0], hand[1], r, 0, Math.PI * 2); ctx.fill();
    if (color !== INK) contour(ctx, ellPts(hand[0], hand[1], r, r, 0, 16), { min: 0.5, max: 1.3 });
    return;
  }
  const k = kind || (color === INK ? 'glove' : 'bone');
  const d = unit(from, hand), n = nrm(d);
  const P = (a, b) => add(add(hand, d, a * r), n, b * r);
  // back of the hand, knuckles squared off, fingers folded under, thumb along the grip
  const pts = k === 'bone'
    // a knuckled fist: four knuckles rolling over the grip, the thumb laid along it
    ? spline0([P(-0.9, 0.9), P(0.3, 1.1), P(0.95, 0.95), P(1.25, 0.6), P(1.15, 0.3), P(1.38, 0.0), P(1.2, -0.3), P(1.32, -0.6), P(1.05, -0.95), P(0.3, -1.05), P(-0.9, -0.85)], 3, true)
    : [P(-0.9, 0.85), P(0.35, 1.05), P(1.15, 0.85), P(1.35, 0.15), P(1.1, -0.75), P(0.3, -1.0), P(-0.9, -0.8)];
  if (k === 'glove') {
    poly(ctx, pts, INK);
    carve(ctx, pts, S, { folds: 0, seed: 37, reach: 0.4 });
    ctx.fillStyle = PAPER; ctx.beginPath();
    for (let j = -1; j <= 1; j++) penPath(ctx, [P(0.85, j * 0.5), P(1.2, j * 0.5 + 0.05)], 1.1 * S.D, 0.3, 0.3);
    penPath(ctx, [P(-0.3, 0.95), P(0.5, 0.75), P(1.0, 0.35)], 1.0 * S.D, 0.3, 0.4);
    ctx.fill();
  } else if (k === 'gauntlet') {
    ruled(ctx, pts, S, { angle: Math.atan2(d[1], d[0]) + 1.4, gap: 2.0, seed: 39 });
    ctx.fillStyle = INK; ctx.beginPath();
    for (let j = 0; j < 3; j++) ribbonPath(ctx, [P(-0.4 + j * 0.45, 1.0), P(-0.4 + j * 0.45, -0.9)], () => 0.8 * S.D * 1.4);
    ctx.fill();
  } else {
    bonePart(ctx, pts, S, { seed: 35, reach: 0.6, lo: 0.25, breaks: false });
    ctx.fillStyle = INK; ctx.beginPath();
    for (let j = -1; j <= 1; j++) penPath(ctx, [P(0.75, j * 0.5), P(1.3, j * 0.48)], 0.9 * S.D * 1.4, 0.2, 0.3);
    penPath(ctx, [P(-0.4, 0.95), P(0.4, 0.8), P(0.95, 0.45)], 0.8 * S.D * 1.4, 0.2, 0.3);
    ctx.fill();
  }
}
// A limb in the boss's own hand (art/limb.js inkLimb): drawn in device pixels so its
// hatch pitch and line weights are the boss's at any size. half(s) -> half width in local
// units along the limb (0 = root, 1 = end).
function boneLimb(ctx, A, B, half, S, { kind = 'fore', seed = 1, lit = 1, shade = 1 } = {}) {
  const D = S.D;
  ctx.save();
  ctx.scale(D, D);
  const prof = (s) => [half(s) * lit / D, half(s) * shade / D];
  inkLimb(ctx, [A[0] / D, A[1] / D], [B[0] / D, B[1] / D], prof, { seed, kind, bow: 0.8 / D, n: 26 });
  ctx.restore();
}
function bareArm(ctx, sh, el, hand, S, { w0 = 8, w1 = 6.5, hard = false } = {}) {
  const du = unit(sh, el), df = unit(el, hand);
  const g = (x) => Math.exp(-x * x);
  // one smooth outline from the shoulder to the wrist: deltoid, biceps, the elbow's pinch,
  // the forearm thick below it, a narrow wrist
  const path = spline([add(sh, du, -3), mix(sh, el, 0.35), mix(sh, el, 0.75), el, mix(el, hand, 0.3), mix(el, hand, 0.7), hand], 4);
  const N = path.length - 1;
  const wf = (t) => {
    const up = t < 0.5;
    if (up) { const s2 = t / 0.5; return w0 * (1.15 + 0.25 * g((s2 - 0.2) / 0.22) + 0.1 * g((s2 - 0.62) / 0.2) - 0.32 * s2); }
    const s2 = (t - 0.5) / 0.5; return w1 * (0.95 + 0.32 * g((s2 - 0.25) / 0.22) - 0.45 * s2);
  };
  const arm = ribbonPts(path, wf);
  if (S.lod) { ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, arm.concat([arm[0]]), () => 3.0 * S.D); ctx.fill(); }
  bonePart(ctx, arm, S, { seed: 43, angle: Math.atan2(du[1], du[0]) + Math.PI / 2, bend: 3, lo: 0.22, tone: hard ? 1.5 : 1.05, breaks: false, line: 1.2 });
  if (S.lod) {
    ctx.fillStyle = INK; ctx.beginPath();
    const w = (k) => k * S.D * 1.4;
    penPath(ctx, quad(add(add(sh, du, 6), nrm(du), w0 * 0.55), add(add(sh, du, 9), nrm(du), -w0 * 0.05), add(add(sh, du, 11), nrm(du), -w0 * 0.6), 6), w(1.3), 0.2, 0.4);
    penPath(ctx, quad(add(el, df, 2), add(add(mix(el, hand, 0.4), nrm(df), -1.2), df, 0), add(mix(el, hand, 0.75), nrm(df), -0.3), 6), w(1.1), 0.3, 0.4);
    ctx.fill();
  }
  fist(ctx, hand, w1 * 0.55, S, BONE, el, 'bone');
}
function chainLinks(ctx, a, b, S, { r = 1.6, n = null } = {}) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const cnt = n || Math.max(2, Math.round(L / (r * 2.2)));
  const d = unit(a, b), ang = Math.atan2(d[1], d[0]);
  for (let i = 0; i < cnt; i++) {
    const p = mix(a, b, (i + 0.5) / cnt);
    const flat = i % 2 === 1;
    if (flat) { ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, [add(p, d, -r * 1.1), add(p, d, r * 1.1)], () => r * 0.8); ctx.fill(); }
    else {
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(p[0], p[1], r * 1.35, r * 0.95, ang, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAPER; ctx.beginPath(); ctx.ellipse(p[0], p[1], r * 0.75, r * 0.38, ang, 0, Math.PI * 2); ctx.fill();
    }
  }
}
// a chain laid along a curve (links follow the path)
function chainPath(ctx, pts, S, r = 1.6) {
  const sp = spline0(pts, 6);
  let acc = 0, last = sp[0];
  const out = [sp[0]];
  for (const p of sp) { acc += Math.hypot(p[0] - last[0], p[1] - last[1]); last = p; if (acc >= r * 2.2) { out.push(p); acc = 0; } }
  for (let i = 0; i < out.length - 1; i++) chainLinks(ctx, out[i], out[i + 1], S, { r, n: 1 + (i % 2) });
}
function wrapChain(ctx, a, b, w, S, turns = 3) {
  // pale links wound round a limb: diagonal bands
  const d = unit(a, b), n = nrm(d);
  for (let k = 0; k < turns; k++) {
    const p = mix(a, b, 0.2 + k * 0.25);
    const p0 = add(add(p, n, w * 0.6), d, -1.6), p1 = add(add(p, n, -w * 0.6), d, 1.6);
    chainLinks(ctx, p0, p1, S, { r: 1.2, n: 3 });
  }
}

// ---- scarf / tails --------------------------------------------------------------------
function scarf(ctx, neck, t, color, drag, k = 1, S = {}, len = 26, spread = 8) {
  for (let s = 0; s < 2; s++) {
    const pts = [neck];
    for (let i = 1; i <= 5; i++) {
      const u = i / 5;
      const wave = Math.sin(t / 130 - u * 4 + s * 1.7) * 3.5 * u;
      pts.push([neck[0] - u * (len + s * spread) * k - drag * u * 8, neck[1] + u * (6 + s * 7) + wave]);
    }
    const sp = spline(pts, 2);
    ctx.fillStyle = INK;
    ctx.beginPath(); ribbonPath(ctx, sp, (tt) => (6.4 - tt * 3.6) * (S.hi ? 0.92 : 1)); ctx.fill();
    ctx.fillStyle = color;
    const inner = ribbonPts(sp.slice(1), (tt) => 4.4 - tt * 3.2);
    poly(ctx, inner, color);
    shade(ctx, inner, S, { angle: 0.3, lo: 0.35, seed: 91 + s });
  }
}

// ---- hoods & heads ------------------------------------------------------------------
function faceSliver(ctx, hc, S, { dx = 0 } = {}) {
  const X = hc[0] + dx, Y = hc[1];
  if (S.lod) {
    // the face is mostly lost under the hood: a sliver of bone down the profile, the eye
    // a glint in a black socket
    const face = spline0([[X + 6.6, Y - 4.6], [X + 8.4, Y - 3.4], [X + 8.8, Y - 1.8], [X + 10.2, Y + 1.4], [X + 9.0, Y + 2.0], [X + 9.3, Y + 3.2], [X + 8.6, Y + 4.4], [X + 7.6, Y + 5.6], [X + 6.4, Y + 3.0], [X + 6.9, Y - 0.5]], 4, true);
    bonePart(ctx, face, S, { seed: 101, reach: 0.9 });
    ctx.fillStyle = INK; ctx.beginPath();
    penPath(ctx, [[X + 6.4, Y - 2.6], [X + 8.0, Y - 2.4], [X + 8.8, Y - 1.7]], 1.6 * S.D * 1.4, 0.2, 0.3);   // brow shadow
    ctx.ellipse(X + 7.7, Y - 1.1, 0.9, 0.6, -0.1, 0, Math.PI * 2);                                         // socket
    penPath(ctx, [[X + 8.4, Y + 3.3], [X + 9.2, Y + 3.2]], 0.9 * S.D * 1.4, 0.2, 0.2);                      // mouth
    ctx.fill();
    ctx.fillStyle = '#fbf8ef'; ctx.beginPath(); ctx.arc(X + 8.0, Y - 1.2, 0.32, 0, Math.PI * 2); ctx.fill();
    return face;
  }
  const face = [[X + 4, Y - 5], [X + 9, Y - 3], [X + 8.5, Y + 4], [X + 5.5, Y + 6.5], [X + 3, Y + 1]];
  poly(ctx, face, BONE);
  ctx.fillStyle = INK;
  ctx.beginPath();
  penPath(ctx, [[X + 4.5, Y - 1.2], [X + 9, Y - 1.6]], 1.6, 0.1, 0.4);
  ctx.fill();
  contour(ctx, face, { min: 0.4, max: 1.2, seed: 3 });
  return face;
}

// a sash in the entrant's colour; larger, it is knotted with two short ends
function sash(ctx, a, b, w, S) {
  if (!S.lod) { ctx.fillStyle = S.accent; ctx.beginPath(); ribbonPath(ctx, [a, b], () => w); ctx.fill(); return; }
  const band = ribbonPts(spline0([a, add(mix(a, b, 0.5), [0, 0.6]), b], 5), (t) => w * (1 + 0.15 * Math.sin(t * 9)));
  poly(ctx, band, S.accent);
  shade(ctx, band, S, { angle: 0.2, lo: 0.4 });
  contour(ctx, band, { min: 0.5 * S.D * 1.4, max: 1.6 * S.D * 1.4 });
  const k = mix(a, b, 0.78);
  for (let i = 0; i < 2; i++) {
    const sp = spline0([k, add(k, [-1.5 - i * 1.5 - (S.drag || 0) * 2, 4 + i]), add(k, [-2.5 - i * 3 - (S.drag || 0) * 4, 8 + i * 2])], 5);
    const e = ribbonPts(sp, (t) => (2.2 - t * 0.8));
    poly(ctx, e, S.accent); shade(ctx, e, S, { angle: 1.4, lo: 0.3 }); contour(ctx, e, { min: 0.5 * S.D * 1.4, max: 1.4 * S.D * 1.4, breaks: false });
  }
  const kn = ellPts(k[0], k[1] - 0.2, 1.9, 1.6, 0.3, 14);
  poly(ctx, kn, S.accent); shade(ctx, kn, S, { angle: 0.8, lo: 0.3 }); contour(ctx, kn, { min: 0.5 * S.D * 1.4, max: 1.4 * S.D * 1.4, breaks: false });
}

// At the stage size and up the entrant's colour lives on the sash alone; the class cloth
// that used to carry it (scarf, baldric, mask, stole, cravat) turns to plain paper cloth.
const CA = (S) => (S.lod ? PAPER : S.accent);

// The contender's mark, the same on every class: a long sash knotted at the back of the
// waist, two tails streaming behind on their own slow period.
const BACK = { duelist: 8, warden: 12, thief: 7, hexer: 11, archivist: 10, penitent: 10 };
function contenderSash(ctx, R, P, S, layer) {
  const { n, at } = frame(R);
  const k = (R.C.hipH + R.C.torso) / 72;
  const knot = at(0.07, -(BACK[S.cls] || 9));
  const t = S.t || 0, drag = S.drag || 0;
  if (layer === 'tails') {
    // two long ribbons streaming back off the knot, twisting (narrowing where they turn)
    for (let i = 0; i < 2; i++) {
      const L = (i ? 30 : 38) * k;
      const ph = t / 640 + i * 1.9;
      const pts = [knot];
      for (let j = 1; j <= 8; j++) {
        const u = j / 8;
        const back = u * L * (i ? 0.62 : 0.86) * (1 + drag * 0.2);
        const down = u * L * (i ? 0.7 : 0.38) * (1 - drag * 0.25);
        pts.push([knot[0] - back, knot[1] + down + Math.sin(ph - u * 4.2) * 3.2 * u * k]);
      }
      const sp = spline0(pts, 4);
      const tw = (tt) => 0.35 + 0.65 * Math.abs(Math.cos(tt * 4.2 + ph * 0.7 + i));
      const w0 = (S.lod ? 5.2 : 4.4) * k;
      const wf = (tt) => w0 * (1 - 0.45 * tt) * tw(tt);
      if (S.lod) { ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, sp, (tt) => wf(tt) + 3.0 * S.D); ctx.fill(); }
      const tail = ribbonPts(sp, wf);
      poly(ctx, tail, S.accent);
      shade(ctx, tail, S, { angle: Math.atan2(sp[sp.length - 1][1] - sp[0][1], sp[sp.length - 1][0] - sp[0][0]) + 1.4, lo: 0.4 });
      // the turns of the ribbon: a short ink fold where it narrows
      if (S.lod) {
        ctx.fillStyle = INK; ctx.beginPath();
        for (let q = 2; q < sp.length - 2; q++) {
          const tt = q / (sp.length - 1);
          if (tw(tt) > 0.45) continue;
          const d0 = unit(sp[q - 1], sp[q + 1]), nn = nrm(d0);
          penPath(ctx, [add(sp[q], nn, wf(tt) * 0.5), add(sp[q], nn, -wf(tt) * 0.5)], 1.0 * S.D * 1.4, 0.2, 0.2);
        }
        ctx.fill();
      }
      // a forked, frayed end
      const e = sp[sp.length - 1], d = unit(sp[sp.length - 3], e), we = wf(1);
      ctx.fillStyle = S.accent; ctx.beginPath();
      spikePath(ctx, add(e, nrm(d), we * 0.4), add(add(e, d, 3.5 * k), nrm(d), we * 0.9), Math.max(we * 0.6, 1), 0);
      spikePath(ctx, add(e, nrm(d), -we * 0.4), add(add(e, d, 3 * k), nrm(d), -we), Math.max(we * 0.6, 1), 0);
      ctx.fill();
      contour(ctx, tail, { min: Math.max(0.5, 0.7 * S.D * 1.4), max: Math.max(1.0, 1.8 * S.D * 1.4), breaks: !!S.lod, seed: 401 + i });
    }
  } else {
    // the band round the waist and the knot
    const front = at(0.09, (BACK[S.cls] || 9) * 0.9);
    const band = ribbonPts([knot, mix(knot, front, 0.5), front], () => (S.lod ? 3.4 : 3.0) * k);
    poly(ctx, band, S.accent);
    shade(ctx, band, S, { angle: 0.2, lo: 0.45 });
    contour(ctx, band, { min: Math.max(0.5, 0.7 * S.D * 1.4), max: Math.max(0.9, 1.6 * S.D * 1.4), breaks: !!S.lod, seed: 405 });
    const kn = ellPts(knot[0], knot[1], 3.0 * k, 2.6 * k, 0.4, 16);
    poly(ctx, kn, S.accent); shade(ctx, kn, S, { angle: 0.8, lo: 0.3 });
    contour(ctx, kn, { min: Math.max(0.5, 0.8 * S.D * 1.4), max: Math.max(1.0, 1.8 * S.D * 1.4), breaks: false, seed: 407 });
  }
}

// ---- class bodies ---------------------------------------------------------------------
// Each returns { back(), front(), head(), arm(near|far), anchors }.

function frame(R) {
  const u = unit(R.hip, R.sh), n = [-u[1], u[0]];
  const at = (t, off) => add(mix(R.hip, R.sh, t), n, off);
  return { u, n, at };
}

const BODY = {};

// The Duelist: today's swordsman, unchanged at fight scale.
BODY.duelist = {
  front: 6,
  back(ctx, R, P, S) { scarf(ctx, [R.sh[0] - 2, R.sh[1] + 2], S.t, CA(S), S.drag, 1, S); },
  legs(ctx, R, P, S) { legs(ctx, R, S); },
  torso(ctx, R, P, S) {
    const { sh, hip } = R; const sway = S.sway, drag = S.drag, t = S.t;
    const hemY = -9 + (P.crouch || 0) * 4 + Math.min(0, hip[1] + 38 - (P.crouch || 0) * 14) * 0.6;
    const cloak = spline([
      [sh[0] - 5, sh[1] - 3], [sh[0] - 12, lerp(sh[1], hip[1], 0.5)], [-16 - sway + hip[0], hip[1] + 4], [-24 - sway * 1.4 + hip[0], hemY - 2],
      [-14 - sway + hip[0], hemY + 4], [-6 - sway * 0.6 + hip[0], hemY + 1], [2 + hip[0], hemY + 5], [9 + hip[0], hemY - 1],
      [6 + hip[0], hip[1] + 6], [sh[0] + 6, lerp(sh[1], hip[1], 0.45)], [sh[0] + 4, sh[1] + 1],
    ], 3, true);
    poly(ctx, cloak, INK);
    carve(ctx, cloak, S, { angle: 1.75, gap: 2.6, bend: 3, seed: 51, lo: 0.2 });
    ctx.fillStyle = INK; ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const x = lerp(-22 - sway * 1.3, 6, i / 4) + hip[0];
      const y = hemY + 1 + Math.sin((i / 4) * Math.PI) * 3;
      spikePath(ctx, [x, y - 3], [x - 3 - drag * 2 + Math.sin(t / 200 + i) * 1.5, y + 5 + hashNoise(5, i) * 5], 4, 1);
    }
    ctx.fill();
    folds(ctx, [
      [[sh[0] - 4, sh[1] + 6], [-10 - sway * 0.5 + hip[0], hip[1] - 2], [-16 - sway + hip[0], hemY - 2], 1.3],
      [[sh[0] - 1, sh[1] + 12], [-3 - sway * 0.3 + hip[0], hip[1] + 4], [-6 - sway * 0.6 + hip[0], hemY - 1], 1.0],
      [[sh[0] - 9, sh[1] + 3], [sh[0] - 13, lerp(sh[1], hip[1], 0.5)], [-17 - sway + hip[0], hip[1] + 2], 1.0],
    ], S);
    if (S.lod) tatters(ctx, [-16 - sway + hip[0], hip[1] + 4], [-24 - sway * 1.4 + hip[0], hemY - 2], [-0.9, 0.4], S, { n: 6, len: 4.5, w: 2.4, seed: 55 });
    if (!S.lod) sash(ctx, [hip[0] - 9, hip[1] - 3], [hip[0] + 7, hip[1] - 5], 3, S);
  },
  head(ctx, R, P, S) {
    const { sh } = R; const drag = S.drag, t = S.t;
    const hc = [sh[0] + 3, sh[1] - 10];
    if (S.hi) {
      // the cowl falls from the hood onto the shoulders, so the head sits in the cloak
      const cowl = spline([[hc[0] - 10, hc[1] + 2], [hc[0] - 15, hc[1] + 12], [sh[0] - 13, sh[1] + 9], [sh[0] - 2, sh[1] + 12], [sh[0] + 8, sh[1] + 6], [hc[0] + 9, hc[1] + 8]], 3, true);
      poly(ctx, cowl, INK);
      carve(ctx, cowl, S, { angle: 1.2, gap: 2.2, seed: 63, folds: 2 });
    }
    const hood = spline([[hc[0] - 10, hc[1] + 9], [hc[0] - 11, hc[1] - 3], [hc[0] - 4, hc[1] - 11], [hc[0] + 6, hc[1] - 10], [hc[0] + 10, hc[1] - 2], [hc[0] + 8, hc[1] + 9]], 3, true);
    poly(ctx, hood, INK);
    ctx.fillStyle = INK;
    ctx.beginPath(); spikePath(ctx, [hc[0] - 6, hc[1] - 7], [hc[0] - 19 - drag * 3, hc[1] - 3 + Math.sin(t / 240) * 1.5], 7, -2); ctx.fill();
    carve(ctx, hood, S, { angle: 0.6, gap: 2.2, bend: 2, seed: 61, lo: 0.3 });
    faceSliver(ctx, hc, S);
    folds(ctx, [[[hc[0] - 8, hc[1] + 2], [hc[0] - 7, hc[1] - 7], [hc[0] + 2, hc[1] - 9], 1.0]], S);
    return hc;
  },
  arm(ctx, sh, el, hand, S, near) { sleeve(ctx, sh, el, hand, S, near ? {} : { w0: 4.6, w1: 3, gap: false }); if (near) fist(ctx, hand, 2.8, S, INK, el); else fist(ctx, hand, 2.3, S, INK, el); },
};

// The Warden: broad, a pale great helm, a mail skirt, a shield as tall as a man's chest.
BODY.warden = {
  front: 9,
  back(ctx, R, P, S) {
    // a short heavy mantle hanging off the back of the shoulders
    const { sh, hip } = R; const { n, at } = frame(R);
    const m = spline([add(sh, n, -6), add(at(0.6, -14), [-S.sway * 0.5, 0]), add(at(0.15, -15), [-S.sway, 2]), add(at(0.2, -6), [0, 2]), add(sh, n, 2)], 3, true);
    poly(ctx, m, INK);
    carve(ctx, m, S, { angle: 1.7, gap: 2.6, seed: 71 });
    if (S.lod) tatters(ctx, add(at(0.15, -15), [-S.sway, 2]), add(at(0.2, -6), [0, 2]), [-0.2, 1], S, { n: 4, len: 3.5, w: 2.0, seed: 73 });
  },
  legs(ctx, R, P, S) { legs(ctx, R, S, { w0: 8.6, w1: 5.2, boot: 1.12, armour: true }); },
  torso(ctx, R, P, S) {
    const { sh, hip } = R; const { u, n, at } = frame(R);
    const down = [0, 1];
    // mail skirt below the surcoat
    const skirt = [add(at(0.1, -11), [0, 0]), add(at(0.1, 11), [0, 0]), add(add(hip, n, 12), down, 15), add(add(hip, n, 2), down, 17), add(add(hip, n, -11), down, 15)];
    poly(ctx, skirt, INK);
    // mail: rows of small ring arcs cut white into the black, dense in the light
    ctx.fillStyle = PAPER; ctx.beginPath();
    const rows = S.lod ? (S.hi ? 7 : 4) : 2;
    for (let r = 0; r < rows; r++) {
      const y0 = (r + 1) / (rows + 1);
      const pl = mix(add(at(0.1, -10), down, 0), add(add(hip, n, -10), down, 14), y0);
      const pr = mix(add(at(0.1, 10), down, 0), add(add(hip, n, 11), down, 14), y0);
      if (S.lod) {
        const m = S.hi ? 10 : 6;
        for (let k = 0; k < m; k++) {
          const f = (k + 0.5 * (r % 2)) / m;
          if (f < 0.15 && hashNoise(141, r * 20 + k) < 0.6) continue;   // the back of the skirt sinks into shadow
          const p = mix(pl, pr, f);
          const rr = Math.abs(pr[0] - pl[0]) / m * 0.42;
          ribbonPath(ctx, [add(p, [-rr, 0]), add(p, [0, rr * 0.7]), add(p, [rr, 0])], () => 1.0 * S.D * 1.3);
        }
      } else ribbonPath(ctx, [pl, mix(pl, pr, 0.5), pr], (t) => 0.8 * Math.sin(Math.PI * t));
    }
    ctx.fill();
    if (S.lod) tatters(ctx, skirt[4], skirt[2], [0, 1], S, { n: 9, len: 2.2, w: 1.6, seed: 143 });
    // surcoat: broad chest, square shoulders
    const coat = [add(sh, n, -12), add(add(sh, n, 9), u, 1), at(0.62, 12.5), at(0.15, 11.5), add(at(0.05, 11), down, 3), add(at(0.05, -11), down, 3), at(0.4, -12.5)];
    const coatS = spline(coat, 3, true);
    poly(ctx, coatS, INK);
    carve(ctx, coatS, S, { angle: 1.4, gap: 2.5, bend: 2, seed: 73, lo: 0.2 });
    folds(ctx, [[at(0.85, 4), at(0.5, 6), at(0.1, 6), 1.1], [at(0.8, -6), at(0.45, -8), at(0.08, -7), 0.9]], S);
    // baldric in the entrant's colour across the chest
    ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, [at(0.95, -9), at(0.5, 0), at(0.08, 10)], () => 5.2); ctx.fill();
    const bald = ribbonPts([at(0.95, -9), at(0.5, 0), at(0.08, 10)], () => 3.4);
    poly(ctx, bald, S.lod ? INK : S.accent);
    shade(ctx, bald, S, { gap: 1.3, w: 0.6, angle: 0.3, lo: 0.4 });
    // belt
    ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, [at(0.08, -12), at(0.06, 12)], () => 3.4); ctx.fill();
    ctx.fillStyle = PAPER; ctx.beginPath(); const bk = at(0.065, 9); ctx.rect(bk[0] - 1.6, bk[1] - 1.6, 3.2, 3.2); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.rect(bk[0] - 0.7, bk[1] - 0.7, 1.4, 1.4); ctx.fill();
  },
  head(ctx, R, P, S) {
    const { sh } = R;
    const hc = [sh[0] + 3, sh[1] - 11];
    // gorget
    const gor = ellPts(sh[0] + 1, sh[1] - 1.5, 8.5, 3.6, 0.05, 16);
    ruled(ctx, gor, S, { angle: 1.4, gap: 2.0, seed: 79 });
    // great helm: flat top, square jaw, a rolled brow
    const helm = S.lod
      // a sugarloaf great helm: the crown drawn up to a blunt point, the face plate jutting
      ? spline([[hc[0] - 8, hc[1] + 9.5], [hc[0] - 9.6, hc[1] + 1], [hc[0] - 8.4, hc[1] - 7], [hc[0] - 3, hc[1] - 12.5], [hc[0] + 1.5, hc[1] - 14], [hc[0] + 6.5, hc[1] - 11], [hc[0] + 10, hc[1] - 4], [hc[0] + 11.4, hc[1] + 2], [hc[0] + 10.6, hc[1] + 9.5]], 4, true)
      : spline([[hc[0] - 8.5, hc[1] + 9], [hc[0] - 9.5, hc[1] - 1], [hc[0] - 8, hc[1] - 10], [hc[0] + 1, hc[1] - 11.5], [hc[0] + 9, hc[1] - 10], [hc[0] + 10.5, hc[1] - 1], [hc[0] + 10, hc[1] + 9]], 3, true);
    // ruled steel: the curve of the helm told by even lines that stop hard in the light
    ruled(ctx, helm, S, { angle: 1.52, gap: 2.1, lo: 0.36, seed: 81, line: 1.25 });
    if (S.lod) { ctx.fillStyle = INK; ctx.beginPath(); penPath(ctx, quad([hc[0] + 1.5, hc[1] - 13.5], [hc[0] + 7.5, hc[1] - 8], [hc[0] + 9.6, hc[1] + 8], 8), 1.4 * S.D * 1.4, 0.1, 0.2); ctx.fill(); }
    ctx.fillStyle = INK; ctx.beginPath();
    // eye slit (front), breaths, brow band, crest ridge
    polyPath(ctx, [[hc[0] + 2, hc[1] - 2.4], [hc[0] + 11, hc[1] - 2.8], [hc[0] + 11, hc[1] - 0.6], [hc[0] + 2, hc[1] - 0.2]]);
    for (let k = 0; k < 3; k++) ribbonPath(ctx, [[hc[0] + 6 + k * 1.6, hc[1] + 2.6], [hc[0] + 6 + k * 1.6, hc[1] + 6.5]], () => 0.8);
    ribbonPath(ctx, [[hc[0] - 9, hc[1] - 5.5], [hc[0] + 10, hc[1] - 6]], () => (S.hi ? 0.9 : 1.1));
    ctx.fill();
    // a black crest of horsehair streaming back off the crown
    ctx.fillStyle = INK; ctx.beginPath();
    for (let k = 0; k < 4; k++) spikePath(ctx, [hc[0] - 1 + k * 1.5, hc[1] - 11], [hc[0] - 13 - k * 2 - S.drag * 3, hc[1] - 13 + k * 2.4 + Math.sin(S.t / 230 + k) * 1.1], 3.2 - k * 0.4, -1.5);
    ctx.fill();
    if (S.hi) {
      ctx.fillStyle = INK; ctx.beginPath();
      for (let k = 0; k < 5; k++) { const p = [hc[0] - 7 + k * 4, hc[1] + 7.6]; ctx.moveTo(p[0] + 0.55, p[1]); ctx.arc(p[0], p[1], 0.55, 0, Math.PI * 2); }
      ctx.fill();
    }
    return hc;
  },
  arm(ctx, sh, el, hand, S, near) {
    sleeve(ctx, sh, el, hand, S, { w0: 6.2, w1: 4.2, gap: near });
    if (near) {
      // pauldron: three lames over the shoulder
      const d = unit(sh, el);
      for (let k = 2; k >= 0; k--) {
        const c = add(add(sh, d, 1 + k * 2.6), [0, -0.5]);
        const pl = ellPts(c[0], c[1], 7.8 - k * 0.9, 4.6 - k * 0.4, Math.atan2(d[1], d[0]) + Math.PI / 2, 16, Math.PI * 0.95, Math.PI * 2.05);
        ruled(ctx, pl, S, { angle: Math.atan2(d[1], d[0]), gap: 2.0, lo: 0.3, seed: 83 + k });
      }
      if (S.lod) fist(ctx, hand, 3.0, S, PAPER, el, 'gauntlet');
      else { const g = ellPts(hand[0], hand[1], 3.6, 3.2, 0, 14); paperForm(ctx, g, { line: { min: 0.7, max: 1.6 }, hatch: null }); }
    } else fist(ctx, hand, 2.6, S, INK, el);
  },
};

// The tall shield, held on the far arm in front of the body: planked wood, its grain
// hatched, iron bands studded with rivets, a black boss, the entrant's chevron.
function shield(ctx, R, P, S) {
  const up = P.shieldUp || 0;
  const shift = P.idleMotion ? Math.sin((S.t || 0) / 1700) : 0;
  const c = add(R.handF, [6 + up * 2 + shift * 0.6, 4 - up * 8 + shift * 0.9]);
  const rot = (P.shieldRot || 0) - 0.04 + shift * 0.035;
  const H = 72, Wd = 24;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const L = (x, y) => [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs];
  const outline = spline([L(-Wd / 2, H * 0.36), L(-Wd / 2 - 0.8, -H * 0.2), L(-Wd / 2 + 2, -H * 0.44), L(0, -H / 2), L(Wd / 2 - 2, -H * 0.44), L(Wd / 2 + 0.8, -H * 0.2), L(Wd / 2, H * 0.36), L(0, H / 2)], 3, true);
  poly(ctx, outline, INK);
  const inner = spline([L(-Wd / 2 + 2.6, H * 0.33), L(-Wd / 2 + 1.8, -H * 0.2), L(-Wd / 2 + 4, -H * 0.41), L(0, -H / 2 + 2.6), L(Wd / 2 - 4, -H * 0.41), L(Wd / 2 - 1.8, -H * 0.2), L(Wd / 2 - 2.6, H * 0.33), L(0, H / 2 - 2.8)], 3, true);
  poly(ctx, inner, PAPER);
  ctx.save(); ctx.beginPath(); polyPath(ctx, inner); ctx.clip();
  if (S.lod) {
    // the grain of the planks: long wavering lines with knots, the plank seams heavier
    ctx.fillStyle = INK; ctx.beginPath();
    const nG = S.hi ? 16 : 9;
    for (let g = 0; g < nG; g++) {
      const x0 = -Wd / 2 + 1 + (g + 0.5) * (Wd - 2) / nG;
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const y = -H / 2 + (k / 16) * H;
        const knot = Math.exp(-(((y - (hashNoise(151, g) - 0.5) * H * 0.7) / 4) ** 2)) * 1.6 * (hashNoise(152, g) < 0.35 ? 1 : 0);
        pts.push(L(x0 + Math.sin(y * 0.18 + g * 1.7) * 0.35 + knot, y));
      }
      const seam = g % 4 === 3;
      ribbonPath(ctx, pts, (t) => (seam ? 1.0 : 0.55) * S.D * 1.4 * (0.6 + 0.4 * Math.sin(Math.PI * t)));
    }
    ctx.fill();
  }
  // the face turns away from the light: ruled shadow on the back half
  hatchIn(ctx, inner, { mode: 'shadow', color: INK, angle: rot + 0.15, gap: S.lod ? 2.4 * S.D : 2.0, w: S.lod ? 1.0 * S.D : 0.8, lo: S.lod ? 0.45 : 0.46, gamma: S.lod ? 0.12 : 1.3, seed: 111, bias: 0.05 });
  if (S.lod) hatchIn(ctx, inner, { mode: 'shadow', color: INK, angle: rot + 1.3, gap: 2.6 * S.D, w: 0.9 * S.D, lo: 0.7, gamma: 0.12, seed: 112 });
  ctx.restore();
  // iron bands, studded
  const bandY = [-H * 0.27, H * 0.22];
  for (const y of bandY) {
    const band = ribbonPts([L(-Wd / 2 + 1, y), L(0, y + 1), L(Wd / 2 - 1, y)], () => (S.lod ? 3.0 : 2.2));
    poly(ctx, band, INK);
    if (S.lod) {
      for (let k = 0; k < 5; k++) {
        const p = L(-Wd / 2 + 3 + k * (Wd - 6) / 4, y + 0.3);
        ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(p[0], p[1], 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(p[0] + 0.25, p[1] + 0.3, 0.55, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.fillStyle = INK; ctx.beginPath();
  ribbonPath(ctx, [L(1.5, -H / 2 + 3), L(1.5, H / 2 - 3)], () => (S.lod ? 1.0 : 1.3));
  ctx.fill();
  // the entrant's colour: a chevron above the boss, ruled in its shadow
  const chev = ribbonPts([L(-Wd / 2 + 4, -H * 0.13), L(1.5, -H * 0.04), L(Wd / 2 - 4, -H * 0.13)], () => 3.4);
  poly(ctx, chev, S.lod ? INK : S.accent);
  shade(ctx, chev, S, { angle: 0.4, lo: 0.4 });
  // the boss: a black dome, its lit shoulder breaking into hatch
  const boss = ellPts(...L(1.5, H * 0.06), 5.0, 5.0, 0, 22);
  poly(ctx, boss, INK);
  if (S.lod) engrave(ctx, boss, S, { folds: 0, seed: 115, reach: 0.6 });
  else { ctx.fillStyle = PAPER; ctx.beginPath(); const bh = L(3, H * 0.04); ctx.arc(bh[0], bh[1], 1.1, 0, Math.PI * 2); ctx.fill(); }
  if (S.lod) {
    // scuffs and a sword-gouge across the lower planks
    ctx.fillStyle = INK; ctx.beginPath();
    penPath(ctx, [L(-7, H * 0.3), L(-2, H * 0.35), L(4, H * 0.38)], 1.4 * S.D * 1.4, 0.2, 0.3);
    penPath(ctx, [L(-4, -H * 0.36), L(2, -H * 0.33)], 1.0 * S.D * 1.4, 0.2, 0.3);
    ctx.fill();
  }
  contour(ctx, outline, { min: S.lod ? 0.9 * S.D * 1.4 : 0.7, max: S.lod ? 2.4 * S.D * 1.4 : 1.8 });
  fist(ctx, R.handF, 2.6, S, INK, R.elbowF);
}

// The Bookthief: small, low, a short torn cloak, a mask in the entrant's colour.
BODY.thief = {
  front: 5,
  back(ctx, R, P, S) {
    const { sh } = R; const hc = [sh[0] + 6, sh[1] - 6];
    scarf(ctx, [hc[0] - 3, hc[1] + 3], S.t * 1.3, CA(S), S.drag + 0.6, 1.25, S, 26, 12);
  },
  legs(ctx, R, P, S) { legs(ctx, R, S, { w0: 6.4, w1: 3.4, boot: 0.85, wrap: true }); },
  torso(ctx, R, P, S) {
    const { sh, hip } = R; const { u, n, at } = frame(R);
    const sway = S.sway * 1.4, drag = S.drag;
    // tunic hugging the body
    const tunic = spline([add(sh, n, -6), add(sh, n, 6), at(0.5, 6.5), add(at(0, 5.5), [0, 3]), add(at(0, -5), [0, 4]), at(0.6, -7)], 3, true);
    poly(ctx, tunic, INK);
    carve(ctx, tunic, S, { angle: 1.2, gap: 2.3, seed: 121 });
    // short cloak: from the shoulders, flaring back, a torn hem at mid thigh
    const hemY = hip[1] + 9;
    const cl = spline([add(sh, n, -4), add(sh, n, 3), at(0.55, -6), [hip[0] - 4 - sway, hemY - 2], [hip[0] - 12 - sway * 1.2, hemY + 1], [hip[0] - 22 - sway * 1.6 - drag * 4, hemY - 6], [hip[0] - 17 - sway, hip[1] - 6], at(0.85, -11)], 3, true);
    poly(ctx, cl, INK);
    carve(ctx, cl, S, { angle: 2.0, gap: 2.4, bend: 2, seed: 123, lo: 0.25 });
    ctx.fillStyle = INK; ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const x = lerp(hip[0] - 21 - sway * 1.5, hip[0] - 4, i / 3), y = lerp(hemY - 6, hemY - 1, i / 3);
      spikePath(ctx, [x, y - 2], [x - 4 - drag * 3 + Math.sin(S.t / 150 + i) * 2, y + 5 + hashNoise(13, i) * 4], 3.6, 1);
    }
    ctx.fill();
    folds(ctx, [[add(sh, n, -3), at(0.5, -9), [hip[0] - 14 - sway, hemY - 3], 1.1], [at(0.9, -7), at(0.4, -13), [hip[0] - 19 - sway * 1.4, hemY - 6], 0.9]], S);
    if (S.lod) tatters(ctx, at(0.85, -11), [hip[0] - 22 - sway * 1.6 - drag * 4, hemY - 6], [-0.85, 0.5], S, { n: 5, len: 3.5, w: 2.0, seed: 127 });
    // belt with two pouches and a stolen book strapped at the back
    ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, [at(0.05, -7), at(0.08, 7)], () => 2.4); ctx.fill();
    const bk = rectPts(...at(0.12, -8), 7, 9, Math.atan2(n[1], n[0]) - Math.PI / 2 + 0.25);
    ruled(ctx, bk, S, { angle: 0.3, gap: 1.8, lo: 0.3, seed: 125 });
    ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, [mix(bk[0], bk[1], 0.5), mix(bk[3], bk[2], 0.5)], () => 1.6); ctx.fill();
    for (const k of [0.3, 0.75]) { const p = add(at(0.05, -7 + k * 14), [0, 2.6]); poly(ctx, rectPts(p[0], p[1], 3.4, 4, 0.1), INK); ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, [[p[0] - 1.6, p[1] - 1.3], [p[0] + 1.6, p[1] - 1.3]], () => 0.6); ctx.fill(); }
  },
  head(ctx, R, P, S) {
    const { sh } = R; const { u, n } = frame(R);
    const hc = add(add(sh, n, 6), [0, -6]);
    // a round hood pulled low, its brim jutting over the eyes
    const hood = spline([[hc[0] - 8, hc[1] + 7], [hc[0] - 10, hc[1] - 2], [hc[0] - 5, hc[1] - 9], [hc[0] + 4, hc[1] - 9.5], [hc[0] + 10, hc[1] - 5], [hc[0] + 12, hc[1] - 1.5], [hc[0] + 8, hc[1] + 0.5], [hc[0] + 8, hc[1] + 7]], 3, true);
    poly(ctx, hood, INK);
    carve(ctx, hood, S, { angle: 0.4, gap: 2.0, bend: 2, seed: 131, lo: 0.32 });
    // only the eyes show between the brim and the mask
    ctx.fillStyle = PAPER; ctx.beginPath();
    ctx.ellipse(hc[0] + 8.2, hc[1] + 1.8, 1.4, 0.75, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(hc[0] + 8.7, hc[1] + 1.8, 0.45, 0, Math.PI * 2); ctx.fill();
    // the mask in the entrant's colour
    const mask = [[hc[0] + 4, hc[1] + 3], [hc[0] + 10.6, hc[1] + 2.8], [hc[0] + 9.6, hc[1] + 7.4], [hc[0] + 4.5, hc[1] + 8.6], [hc[0] - 1, hc[1] + 6]];
    poly(ctx, mask, S.lod ? INK : S.accent);
    shade(ctx, mask, S, { gap: 1.0, w: 0.55, angle: 0.4, lo: 0.3 });
    contour(ctx, mask, { min: 0.5, max: 1.3 });
    folds(ctx, [[[hc[0] - 7, hc[1] + 2], [hc[0] - 6, hc[1] - 6], [hc[0] + 3, hc[1] - 8], 1.0]], S);
    return hc;
  },
  arm(ctx, sh, el, hand, S, near) { sleeve(ctx, sh, el, hand, S, { w0: 4.6, w1: 3.0, gap: near, cuff: near ? 1.0 : 0 }); fist(ctx, hand, 2.3, S, INK, el); },
};

// The Hexer: a tall robe to the floor, a hood drawn up into a hooked spike, a stole.
BODY.hexer = {
  front: 8,
  back(ctx, R, P, S) {},
  legs(ctx, R, P, S) {
    // only the toes of pointed shoes under the hem
    for (let i = 0; i < 2; i++) {
      const f = R.feet[i];
      poly(ctx, [[f[0] - 3, f[1] - 4], [f[0] + 4, f[1] - 3.5], [f[0] + 11, f[1] - 0.5], [f[0] + 11, f[1] + 0.5], [f[0] - 3, f[1] + 0.5]], INK);
    }
  },
  torso(ctx, R, P, S) {
    const { sh, hip, feet } = R; const { n, at } = frame(R);
    const sway = S.sway, drag = S.drag;
    const fx = Math.max(feet[0][0], feet[1][0]), bx = Math.min(feet[0][0], feet[1][0]);
    const hemY = Math.max(hip[1] + 20, Math.min(feet[0][1], feet[1][1]) - 1);
    const front = [fx + 8, hemY], back = [bx - 17 - sway * 1.2 - drag * 3, hemY + 0.5];
    const robe = spline([
      add(sh, n, -7), add(sh, n, 6), at(0.55, 8), add(at(0.02, 9), [1, 0]), mix(at(0.02, 9), front, 0.6), front,
      [lerp(front[0], back[0], 0.33), hemY + 1.5], [lerp(front[0], back[0], 0.66), hemY + 0.5], back,
      [hip[0] - 15 - sway * 0.7, hip[1] + 2], at(0.5, -11),
    ], 3, true);
    poly(ctx, robe, INK);
    carve(ctx, robe, S, { angle: 1.62, gap: 2.6, bend: 1.5, seed: 141, lo: 0.2 });
    if (S.lod) tatters(ctx, mix([hip[0] - 15 - sway * 0.7, hip[1] + 2], back, 0.55), back, [-0.35, 1], S, { n: 3, len: 3, w: 1.8, seed: 147 });
    // a ragged hem
    ctx.fillStyle = INK; ctx.beginPath();
    for (let i = 0; i < 6; i++) { const x = lerp(back[0] + 2, front[0] - 3, i / 5); spikePath(ctx, [x, hemY - 2], [x - 2 - drag * 2 + Math.sin(S.t / 260 + i) * 1.2, hemY + 2.5 + hashNoise(17, i) * 2], 3, 0.5); }
    ctx.fill();
    folds(ctx, [
      [at(0.7, -6), [hip[0] - 8 - sway * 0.4, hip[1] + 10], [back[0] + 7, hemY - 3], 1.3],
      [at(0.5, -1), [hip[0] - 2, hip[1] + 14], [lerp(back[0], front[0], 0.45), hemY - 2], 1.1],
      [at(0.3, 5), [hip[0] + 6, hip[1] + 18], [lerp(back[0], front[0], 0.75), hemY - 2], 0.9],
    ], S);
    // the stole, two bands in the entrant's colour down the front
    for (const k of [0, 1]) {
      const top = add(sh, n, 3 + k * 2.2), mid = at(0.2, 7 + k * 1.5), bot = add(at(0.0, 8 + k), [k * 0.5, 14 - k * 2]);
      ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, spline([top, mid, bot], 3), () => 4.0); ctx.fill();
      const st = ribbonPts(spline([top, mid, bot], 3), () => 2.6);
      poly(ctx, st, CA(S));
      shade(ctx, st, S, { gap: 1.0, w: 0.5, angle: 0.2, lo: 0.35 });
    }
    // a cord belt
    ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, [at(0.02, -10), at(0.04, 9)], () => (S.hi ? 0.9 : 1.1)); ctx.fill();
  },
  head(ctx, R, P, S) {
    const { sh } = R;
    const hc = [sh[0] + 3, sh[1] - 11];
    // the hood rises into a long hooked spike
    const tipX = hc[0] - 14 - S.drag * 3 + Math.sin(S.t / 300) * 1.2, tipY = hc[1] - 36;
    const hood = spline([[hc[0] - 10, hc[1] + 10], [hc[0] - 11, hc[1] - 4], [hc[0] - 6, hc[1] - 16], [hc[0] - 4, hc[1] - 26], [tipX, tipY], [hc[0] + 1, hc[1] - 21], [hc[0] + 6, hc[1] - 10], [hc[0] + 11, hc[1] - 2], [hc[0] + 9, hc[1] + 10]], 4, true);
    poly(ctx, hood, INK);
    carve(ctx, hood, S, { angle: 0.25, gap: 2.2, bend: 2, seed: 151, lo: 0.3 });
    // the face is a void under a carved hood rim; two narrow pale slits for eyes
    if (S.lod) inkFold(ctx, [[hc[0] + 1.5, hc[1] + 8.5], [hc[0] + 0.5, hc[1] - 2], [hc[0] + 4, hc[1] - 7.5], [hc[0] + 9.5, hc[1] - 3.5]], S, 0.8, 157, 0.7);
    else { ctx.fillStyle = PAPER; ctx.beginPath(); penPath(ctx, spline0([[hc[0] + 1.5, hc[1] + 8.5], [hc[0] + 0.5, hc[1] - 2], [hc[0] + 4, hc[1] - 7.5], [hc[0] + 9.5, hc[1] - 3.5]], 3), 1.0, 0.2, 0.3); ctx.fill(); }
    ctx.fillStyle = PAPER; ctx.beginPath();
    penPath(ctx, [[hc[0] + 5.2, hc[1] - 0.4], [hc[0] + 6.6, hc[1] - 0.9], [hc[0] + 7.4, hc[1] - 0.5]], 1.1, 0.3, 0.3);
    penPath(ctx, [[hc[0] + 8.4, hc[1] - 0.7], [hc[0] + 9.3, hc[1] - 1.0], [hc[0] + 9.7, hc[1] - 0.7]], 0.8, 0.3, 0.3);
    ctx.fill();
    folds(ctx, [[[hc[0] - 8, hc[1] + 3], [hc[0] - 8, hc[1] - 10], [hc[0] - 4, hc[1] - 20], 1.2], [[hc[0] + 4, hc[1] - 10], [hc[0] - 2, hc[1] - 18], [tipX + 3, tipY + 4], 0.8]], S);
    return hc;
  },
  arm(ctx, sh, el, hand, S, near) {
    sleeve(ctx, sh, el, hand, S, { w0: 4.6, w1: 3.2, gap: near, bell: 6.5 });
    // a long pale bony hand
    const d = unit(el, hand), n = nrm(d);
    const h0 = add(hand, d, 1.5);
    ctx.fillStyle = BONE; ctx.beginPath();
    const fw = (k) => Math.sin((S.t || 0) / 240 + k * 1.3) * 0.9;   // the fingers working
    for (let k = -1; k <= 2; k++) { const base = add(h0, n, k * 1.1); ribbonPath(ctx, [base, add(add(base, d, 4.5), n, k * 0.6 + fw(k) * 0.4), add(add(base, d, 6.8 - Math.abs(fw(k)) * 0.8), n, k * 0.4 + 1 + fw(k))], (t) => 1.6 - t); }
    ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath();
    for (let k = -1; k <= 2; k++) { const base = add(h0, n, k * 1.1); penPath(ctx, [add(add(base, d, 4.5), n, k * 0.6 - 0.6), add(add(base, d, 6.8), n, k * 0.4 + 0.5)], 0.6, 0.2, 0.2); }
    if (S.lod) for (let k = -1; k <= 2; k++) { const base = add(h0, n, k * 1.1 - 0.75); penPath(ctx, [base, add(add(base, d, 4.5), n, k * 0.6), add(add(base, d, 6.8), n, k * 0.4 + 1)], 0.45 * S.D * 1.6, 0.1, 0.3); }
    ctx.fill();
  },
};

// The Archivist: long coat, brimmed hat, spectacles, satchel, a lantern at the hip.
BODY.archivist = {
  front: 8,
  back(ctx, R, P, S) {
    const { sh, hip } = R; const { n, at } = frame(R);
    const sway = S.sway, drag = S.drag;
    // coat tails, split, swinging behind the knees
    for (const k of [1, 0]) {
      const tl = spline([at(0.15, -9 + k * 3), [hip[0] - 12 - sway * (1 + k * 0.4) - drag * 3 - k * 3, hip[1] + 26 - k * 3], [hip[0] - 6 - sway - k * 2, hip[1] + 25], at(0, -2 + k * 3)], 3, true);
      poly(ctx, tl, INK);
      carve(ctx, tl, S, { angle: 1.8, gap: 2.6, seed: 161 + k });
      if (S.lod) tatters(ctx, [hip[0] - 12 - sway * (1 + k * 0.4) - drag * 3 - k * 3, hip[1] + 26 - k * 3], [hip[0] - 6 - sway - k * 2, hip[1] + 25], [-0.3, 1], S, { n: 3, len: 3, w: 1.8, seed: 163 + k });
    }
    // satchel at the back hip
    const sc = at(0.05, -12);
    const bag = rectPts(sc[0] - 1, sc[1] + 4, 11, 10, 0.05);
    poly(ctx, bag, INK);
    carve(ctx, bag, S, { folds: 1, fold: 1.5, seed: 165, reach: 0.5 });
    const flap = [bag[0], bag[1], mix(bag[1], bag[2], 0.55), mix(bag[0], bag[3], 0.55)];
    poly(ctx, flap, INK);
    ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, [mix(bag[0], bag[3], 0.55), mix(bag[1], bag[2], 0.55)], () => (S.hi ? 0.7 : 0.9));
    const bk = mix(mix(bag[0], bag[3], 0.55), mix(bag[1], bag[2], 0.55), 0.5); ctx.rect(bk[0] - 1.2, bk[1] - 1, 2.4, 2.6); ctx.fill();
  },
  legs(ctx, R, P, S) { legs(ctx, R, S, { w0: 6.6, w1: 4.0 }); },
  torso(ctx, R, P, S) {
    const { sh, hip } = R; const { u, n, at } = frame(R);
    const sway = S.sway;
    // waistcoat and shirt behind the open coat
    const vest = spline([add(sh, n, 1), add(sh, n, 6.5), at(0.5, 8.5), at(0.08, 8), at(0.08, 2), at(0.6, 1)], 3, true);
    if (S.lod) ruled(ctx, vest, S, { angle: 0.5, gap: 2.0, lo: 0.3, seed: 167 });
    else paperForm(ctx, vest, { hatch: { angle: 0.6, gap: 1.8, w: 0.7, lo: 0.5 }, line: { min: 0.4, max: 1.1 } });
    ctx.fillStyle = INK; ctx.beginPath();
    for (let k = 0; k < 4; k++) { const b = at(0.15 + k * 0.17, 7.4); ctx.moveTo(b[0] + 0.7, b[1]); ctx.arc(b[0], b[1], 0.7, 0, Math.PI * 2); }
    ctx.fill();
    // the coat: open at the front, long skirt to below the knee
    const hemY = Math.min(hip[1] + 25, -12);
    const coat = spline([add(sh, n, -8), add(sh, n, 3), at(0.55, 3.5), at(0.12, 6.5), [hip[0] + 11, hemY], [hip[0] + 4, hemY + 1.5], [hip[0] - 3 - sway * 0.4, hemY], at(0.2, -10), at(0.6, -10)], 3, true);
    poly(ctx, coat, INK);
    carve(ctx, coat, S, { angle: 1.55, gap: 2.5, bend: 2, seed: 171, lo: 0.2 });
    folds(ctx, [[at(0.9, -5), at(0.4, -7), [hip[0] - 2, hemY - 2], 1.1], [at(0.1, 4), [hip[0] + 7, hip[1] + 12], [hip[0] + 9, hemY - 1], 1.0]], S);
    if (S.lod) tatters(ctx, [hip[0] - 3 - sway * 0.4, hemY], [hip[0] + 11, hemY], [0.1, 1], S, { n: 5, len: 2.6, w: 1.8, seed: 173 });
    // lapel
    ctx.fillStyle = PAPER; ctx.beginPath(); penPath(ctx, [add(sh, n, 2.5), at(0.75, 4.6), at(0.5, 3.2)], 1.0, 0.2, 0.4); ctx.fill();
    // the satchel strap across the chest
    ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, [add(sh, n, 4), at(0.5, -2), at(0.08, -11)], () => (S.hi ? 1.4 : 1.6)); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, [add(sh, n, 4), at(0.5, -2), at(0.08, -11)], () => (S.hi ? 0.45 : 0.3)); ctx.fill();
    // belt and the lantern swinging at the front hip
    ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, [at(0.06, -9), at(0.08, 9)], () => 2.2); ctx.fill();
    const hook = at(0.07, 8);
    const sw = Math.sin(S.t / 520) * 0.3 + (S.drag || 0) * 0.3 + (P.lean || 0) * 0.5;
    const lc = add(hook, [Math.sin(sw), Math.cos(sw)], 10);
    ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, [hook, add(hook, [Math.sin(sw), Math.cos(sw)], 3.5)], () => 0.9); ctx.fill();
    lamp(ctx, lc, 0.9, sw, S, { lit: true });
  },
  head(ctx, R, P, S) {
    const { sh } = R;
    const hc = [sh[0] + 3, sh[1] - 10];
    // the back of the head and a high collar
    const col = spline([[sh[0] - 6, sh[1] + 2], [sh[0] - 7, sh[1] - 7], [sh[0] - 2, sh[1] - 6], [sh[0] + 4, sh[1] + 2]], 3, true);
    poly(ctx, col, INK);
    const skull = ellPts(hc[0] - 1, hc[1] + 0.5, 8.6, 8.8, 0, 20);
    poly(ctx, skull, INK);
    carve(ctx, skull, S, { angle: 0.4, gap: 1.8, seed: 181, lo: 0.4 });
    const face = faceSliver(ctx, [hc[0] - 0.5, hc[1] + 0.5], S);
    // spectacles: one round lens in profile, the arm to the ear
    // spectacles catching the light: two small white discs, the far one half hidden
    const lc = [hc[0] + 8.4, hc[1] - 0.8], lf = [hc[0] + 10.6, hc[1] - 1.0];
    ctx.fillStyle = INK; ctx.beginPath();
    ctx.arc(lc[0], lc[1], 2.5, 0, Math.PI * 2);
    ctx.moveTo(lf[0] + 1.9, lf[1]); ctx.ellipse(lf[0], lf[1], 1.1, 1.9, 0, 0, Math.PI * 2);
    ribbonPath(ctx, [[lc[0] - 2.4, lc[1] - 0.4], [hc[0] - 3, hc[1] - 0.5]], () => (S.lod ? 0.7 : 0.8));
    ctx.fill();
    ctx.fillStyle = '#fbf8ef'; ctx.beginPath();
    ctx.arc(lc[0], lc[1], 1.75, 0, Math.PI * 2);
    ctx.moveTo(lf[0] + 0.6, lf[1]); ctx.ellipse(lf[0], lf[1], 0.55, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // a cravat in the entrant's colour
    const cr = [[sh[0] + 2, sh[1] - 2], [sh[0] + 7.5, sh[1] - 2.5], [sh[0] + 8.5, sh[1] + 2], [sh[0] + 6, sh[1] + 7], [sh[0] + 3.5, sh[1] + 2]];
    poly(ctx, cr, CA(S));
    shade(ctx, cr, S, { gap: 0.9, w: 0.5, angle: 0.3, lo: 0.35 });
    contour(ctx, cr, { min: 0.5, max: 1.2 });
    // the hat: a broad flat brim and a low crown with a band
    const brim = spline([[hc[0] - 15, hc[1] - 6], [hc[0] - 3, hc[1] - 9.5], [hc[0] + 14, hc[1] - 7.5], [hc[0] + 15.5, hc[1] - 5.5], [hc[0] + 2, hc[1] - 5.6], [hc[0] - 14, hc[1] - 4]], 3, true);
    const crown = spline([[hc[0] - 8, hc[1] - 7.5], [hc[0] - 8, hc[1] - 15], [hc[0] - 2, hc[1] - 18], [hc[0] + 6, hc[1] - 17], [hc[0] + 9, hc[1] - 13], [hc[0] + 8.5, hc[1] - 7.5]], 3, true);
    poly(ctx, crown, INK); poly(ctx, brim, INK);
    carve(ctx, crown, S, { angle: 1.4, gap: 1.9, bend: 1.5, seed: 183, lo: 0.25 });
    carve(ctx, brim, S, { angle: 0.05, gap: 1.4, seed: 184, lo: 0.25 });
    ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, [[hc[0] - 8, hc[1] - 9.6], [hc[0], hc[1] - 10.4], [hc[0] + 8.6, hc[1] - 9.4]], () => (S.hi ? 0.8 : 1.0)); ctx.fill();
    return hc;
  },
  arm(ctx, sh, el, hand, S, near) {
    sleeve(ctx, sh, el, hand, S, { w0: 5.6, w1: 3.8, gap: near, cuff: 1.2 });
    fist(ctx, hand, near ? 2.6 : 2.3, S, BONE, el);
  },
};

// The Penitent: shoulders like a yoke, a sack hood sunk between them, bare arms bound in
// chain, a chain dragging behind.
BODY.penitent = {
  front: 9,
  back(ctx, R, P, S) {
    const { hip } = R; const { at } = frame(R);
    // the dragged chain from the belt, lying along the floor behind
    const a = at(0.05, -8);
    const sag = Math.sin(S.t / 400) * 1.5;
    const pts = spline([a, [hip[0] - 16, -10 + sag], [hip[0] - 28 - S.sway * 0.5, -1.5], [hip[0] - 44 - S.drag * 4, -1.5]], 3);
    for (let i = 0; i < pts.length - 1; i++) chainLinks(ctx, pts[i], pts[i + 1], S, { r: 1.5, n: 1 + (i % 2) });
    // an iron weight at the end
    const w = pts[pts.length - 1];
    inkForm(ctx, ellPts(w[0] - 3, w[1] - 2.5, 4.2, 3.2, 0, 14), {});
    // rag ties in the entrant's colour, streaming back from the belt
    const knot = at(0.06, -9);
    for (let k = 0; k < (S.lod ? 0 : 2); k++) {
      const sp = spline([knot, [knot[0] - 8 - S.drag * 4, knot[1] + 5 + k * 3 + Math.sin(S.t / 180 + k) * 1.5], [knot[0] - 15 - S.drag * 6, knot[1] + 10 + k * 5]], 3);
      ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, sp, (t) => 5.2 - t * 3); ctx.fill();
      const r = ribbonPts(sp, (t) => 3.6 - t * 2.6);
      poly(ctx, r, S.accent);
      shade(ctx, r, S, { gap: 1.0, w: 0.5, angle: 0.3, lo: 0.35 });
    }
  },
  legs(ctx, R, P, S) { legs(ctx, R, S, { w0: 8.4, w1: 5.6, boot: 1.0, wrap: true, rim: false }); },
  torso(ctx, R, P, S) {
    const { sh, hip } = R; const { u, n, at } = frame(R);
    const U = (p, k) => add(p, u, k);
    // a ragged skirt to the knee, torn into tatters
    const skA = add(add(hip, n, -13), [0, 1], 14), skB = add(add(hip, n, 11), [0, 1], 15);
    const sk = spline([at(0.15, -11), at(0.15, 10), skB, add(add(hip, n, -1), [0, 1], 18), skA], 3, true);
    poly(ctx, sk, INK);
    carve(ctx, sk, S, { fold: 1.65, folds: 2, seed: 191 });
    tatters(ctx, skA, skB, [0, 1], S, { n: S.lod ? 9 : 5, len: 5, w: 3.0, seed: 192 });
    // the bare trunk bent forward under its load: a broad back rising to heaped shoulders,
    // the deltoid rounding over in front, a deep chest under it (points as [forward, up])
    const kT = R.C.torso / 31;
    const T = (f, h) => add(add(hip, n, f), u, h * kT);
    // (waist pinched, the lats flaring, the trapezius a long slope up to a bull neck)
    const trunk = spline([T(-8.5, 0), T(-10, 7), T(-14.5, 16), T(-15.5, 24), T(-12, 30), T(-4, 34), T(3, 38.5), T(9, 37), T(15.5, 31), T(17.5, 23), T(15, 14), T(11.5, 7), T(9, 0)], 4, true);
    // a paper gap round the trunk so the black skirt and hood stand off it
    if (S.lod) { ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, trunk.concat([trunk[0]]), () => 3.2 * S.D); ctx.fill(); }
    bonePart(ctx, trunk, S, { seed: 193, line: 1.35, angle: Math.atan2(n[1], n[0]) + 0.25, bend: -7, lo: 0.24, tone: 1.1, reach: 1.2, breaks: false });
    if (S.lod) {
      ctx.fillStyle = INK; ctx.beginPath();
      const w = (k) => k * S.D * 1.4;
      // the shoulder blade's edge, the spine's knuckles, the ribs, the pectoral's lower line
      penPath(ctx, quad(U(at(0.95, -4), 4), at(0.78, -6), at(0.6, -9.5), 6), w(1.4), 0.2, 0.4);
      for (let k = 0; k < 7; k++) { const p0 = at(0.12 + k * 0.12, -13.2 - Math.sin(k / 6 * Math.PI) * 1.4); penPath(ctx, [p0, add(p0, n, 1.6)], w(1.4), 0.2, 0.2); }
      for (let k = 0; k < 4; k++) { const a0 = at(0.3 + k * 0.11, 3); penPath(ctx, quad(a0, add(add(a0, n, 4), u, 0.6), add(add(a0, n, 8), u, -1.4), 6), w(1.2), 0.2, 0.4); }
      penPath(ctx, quad(at(0.86, 6), at(0.64, 11), at(0.7, 16), 6), w(1.4), 0.2, 0.4);
      ctx.fill();
    }
    // a heavy chain worn as a yoke: over the shoulder, a loop hanging down the back,
    // wound round the chest
    const settle = Math.sin((S.t || 0) / 820) * 1.3;
    chainPath(ctx, [T(9, 36.5), T(-4, 33.5), T(-16, 26), T(-21 - settle * 0.6, 15), T(-17 - settle, 7 + settle * 0.4), T(-10, 9)], S, 2.1);
    chainPath(ctx, [T(9, 36), T(14.5, 27), T(10, 17), T(-2, 14), T(-12, 18)], S, 2.1);
    // a rope belt
    ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, [at(0.08, -10), at(0.1, 10)], () => 3.4); ctx.fill();
    if (S.lod) { ctx.fillStyle = PAPER; ctx.beginPath(); for (let k = 0; k < 7; k++) { const p0 = mix(at(0.08, -9), at(0.1, 9), (k + 0.5) / 7); ribbonPath(ctx, [add(p0, [-0.8, 1.2]), add(p0, [0.8, -1.2])], () => 0.9 * S.D * 1.4); } ctx.fill(); }
  },
  head(ctx, R, P, S) {
    const { sh } = R; const { u, n } = frame(R);
    // the head bowed forward off the bull neck: a sack hood, its slack crown fallen forward
    const hc = add(add(R.hip, n, 13), u, 37.5 * (R.C.torso / 31));
    const sack = spline([[hc[0] - 7, hc[1] + 7], [hc[0] - 9, hc[1] - 1], [hc[0] - 6, hc[1] - 8], [hc[0], hc[1] - 10], [hc[0] + 7, hc[1] - 9], [hc[0] + 11 + Math.sin(S.t / 500) * 0.6, hc[1] - 4], [hc[0] + 9.5, hc[1] + 2], [hc[0] + 6, hc[1] + 8]], 3, true);
    poly(ctx, sack, INK);
    carve(ctx, sack, S, { fold: 0.9, folds: 2, seed: 201, reach: 0.6 });
    // one torn eye-hole: a glint in the dark
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(hc[0] + 5.6, hc[1] - 0.6, 2.2, 1.3, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = S.lod ? '#fbf8ef' : BONE; ctx.beginPath();
    if (S.lod) ctx.arc(hc[0] + 6.2, hc[1] - 0.8, 0.5, 0, Math.PI * 2);
    else ctx.ellipse(hc[0] + 5.6, hc[1] - 0.6, 1.8, 1.0, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // stitching up the crown and the rope at the neck
    ctx.fillStyle = PAPER; ctx.beginPath();
    for (let k = 0; k < 4; k++) { const p0 = [hc[0] - 4 + k * 2.2, hc[1] - 9 + k * 0.4]; ribbonPath(ctx, [add(p0, [-0.3, -0.9]), add(p0, [0.3, 0.9])], () => (S.lod ? 0.9 * S.D * 1.4 : 0.6)); }
    ribbonPath(ctx, [[hc[0] - 6.5, hc[1] + 5.5], [hc[0], hc[1] + 7], [hc[0] + 6.5, hc[1] + 6]], () => (S.lod ? 1.4 : 1.2));
    ctx.fill();
    return hc;
  },
  arm(ctx, sh, el, hand, S, near) {
    bareArm(ctx, sh, el, hand, S, near ? { w0: S.hi ? 8.8 : 10, w1: S.hi ? 7.2 : 8.2, hard: !!S.armour } : { w0: S.hi ? 7.6 : 8.6, w1: S.hi ? 6.4 : 7, hard: !!S.armour });
    wrapChain(ctx, el, hand, 7, S, 2);
    if (near) {
      // a length of chain hanging from the wrist
      const sw = Math.sin(S.t / 260) * 0.25 + (S.drag || 0) * 0.4;
      const a = add(mix(el, hand, 0.8), [0, 2]);
      chainLinks(ctx, a, add(a, [Math.sin(sw) * 9 - 2, 9]), S, { r: 1.3, n: 4 });
    }
  },
};

// ---- charms, small and worn ------------------------------------------------------------
function drawCharm(ctx, id, R, P, S, B, late = false) {
  if (!id) return;
  if ((id === 'ember' || id === 'ribbon') !== late) return;
  const { n, at } = frame(R);
  const front = B.front;
  const belt = at(0.08, front - 1);
  const chest = at(0.62, front - 2);
  const t = S.t;
  const hi = S.hi;
  switch (id) {
    case 'seal': {
      // a red wax seal hanging at the belt on a pale tag
      const c = add(belt, [0.5, 5]);
      ctx.fillStyle = PAPER; ctx.beginPath(); polyPath(ctx, [add(belt, [-1.4, 0]), add(belt, [1.4, 0]), add(c, [1.6, 0]), add(c, [-1.6, 0])]); ctx.fill();
      const s = ellPts(c[0], c[1], 3.4, 3.1, 0, 16);
      poly(ctx, s, RED);
      ctx.fillStyle = INK; ctx.beginPath();
      if (hi) { ctx.arc(c[0], c[1], 2.0, 0, Math.PI * 2); ctx.arc(c[0], c[1], 1.6, 0, Math.PI * 2, true); penPath(ctx, [[c[0] - 0.8, c[1] + 0.7], [c[0], c[1] - 1], [c[0] + 0.8, c[1] + 0.7]], 0.5, 0.2, 0.2); }
      ctx.fill();
      contour(ctx, s, { min: 0.4, max: 1.1 });
      break;
    }
    case 'bookmark': {
      // a strip of iron hung from the belt, with a black tassel
      const a = add(belt, [-1, 0]);
      const sw = Math.sin(t / 300) * 0.12 + (S.drag || 0) * 0.3;
      const d = [Math.sin(sw - 0.1), Math.cos(sw - 0.1)];
      const b = add(a, d, 15);
      const strip = ribbonPts([a, b], () => 3.0);
      paperForm(ctx, strip, { hatch: hi ? { gap: 0.8 * S.D, w: 0.5 * S.D, angle: 0.2, lo: 0.2 } : null, line: { min: 0.55, max: 1.3 } });
      ctx.fillStyle = INK; ctx.beginPath();
      polyPath(ctx, [add(b, [-1.6, -0.2]), add(b, [1.6, -0.2]), add(b, [0, 2.4])]);
      for (let k = -1; k <= 1; k++) ribbonPath(ctx, [add(b, [0, 1.8]), add(b, [k * 1.8 - sw * 4, 8])], (tt) => 0.9 * (1 - tt) + 0.2);
      ctx.fill();
      break;
    }
    case 'ribbon': {
      // pale silk tied round the near upper arm, two tails fluttering back
      const p = mix(R.shA, R.elbow, 0.55);
      const tails = [];
      for (let k = 0; k < 2; k++) {
        const sp = spline([p, [p[0] - 6 - (S.drag || 0) * 3, p[1] + 2 + k * 3 + Math.sin(t / 140 + k) * 1.4], [p[0] - 12 - (S.drag || 0) * 5, p[1] + 1 + k * 5 + Math.sin(t / 120 + k * 2) * 2]], 3);
        tails.push(ribbonPts(sp, (tt) => 2.6 - tt * 1.2));
      }
      for (const tl of tails) { poly(ctx, tl, PAPER); contour(ctx, tl, { min: 0.45, max: 1.0, breaks: false }); }
      const d = unit(R.shA, R.elbow), nn = nrm(d);
      const band = ribbonPts([add(p, nn, 3.6), add(p, nn, -3.6)], () => 2.4);
      poly(ctx, band, PAPER); contour(ctx, band, { min: 0.45, max: 1.0, breaks: false });
      break;
    }
    case 'ember': {
      // a ring on the weapon hand with a red coal set in it
      const h = R.hand;
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(h[0] + 0.6, h[1] - 1.8, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(h[0] + 0.6, h[1] - 1.8, 1.65, 0, Math.PI * 2); ctx.fill();
      if (hi) { ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(h[0] + 0.2, h[1] - 2.2, 0.4, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'nib': {
      // a pale nib on a cord at the chest, point down
      const top = at(0.92, front - 3);
      const c = add(chest, [0.5, 1]);
      ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, [top, c], () => 0.6); ctx.fill();
      const nib = [add(c, [-2.1, -1.5]), add(c, [2.1, -1.5]), add(c, [2.4, 2]), add(c, [0, 6.5]), add(c, [-2.4, 2])];
      poly(ctx, nib, PAPER);
      ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, [add(c, [0, 1.2]), add(c, [0, 6])], () => 0.55); ctx.arc(c[0], c[1] + 0.8, 0.6, 0, Math.PI * 2); ctx.fill();
      contour(ctx, nib, { min: 0.45, max: 1.0, breaks: false });
      break;
    }
    case 'sandglass': {
      // a small hourglass hung at the hip
      const c = add(belt, [-4, 6.5]);
      const g = [add(c, [-2.6, -4]), add(c, [2.6, -4]), add(c, [0.5, 0]), add(c, [2.6, 4]), add(c, [-2.6, 4]), add(c, [-0.5, 0])];
      poly(ctx, g, PAPER);
      ctx.fillStyle = INK; ctx.beginPath();
      polyPath(ctx, [add(c, [-1.9, 3.8]), add(c, [1.9, 3.8]), add(c, [0, 1.6])]);   // sand below
      polyPath(ctx, [add(c, [-1.2, -2.2]), add(c, [1.2, -2.2]), add(c, [0, -0.6])]);
      ribbonPath(ctx, [add(c, [-3.4, -4.4]), add(c, [3.4, -4.4])], () => 1.2);
      ribbonPath(ctx, [add(c, [-3.4, 4.4]), add(c, [3.4, 4.4])], () => 1.2);
      ctx.fill();
      contour(ctx, g, { min: 0.4, max: 0.9, breaks: false });
      break;
    }
    case 'lens': {
      // a reading lens on a chain at the chest
      const top = at(0.95, front - 4);
      const sw = Math.sin(t / 330) * 0.6;
      const c = add(chest, [sw, 2.5]);
      ctx.fillStyle = INK; ctx.beginPath();
      for (let k = 0; k < 4; k++) { const p = mix(top, c, (k + 0.5) / 4.6); ctx.moveTo(p[0] + 0.6, p[1]); ctx.arc(p[0], p[1], 0.6, 0, Math.PI * 2); }
      ctx.arc(c[0], c[1], 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(c[0], c[1], 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK; ctx.beginPath(); penPath(ctx, quad([c[0] - 1.4, c[1] + 0.8], [c[0] - 1.6, c[1] - 1.2], [c[0] + 0.4, c[1] - 1.6], 6), 0.6, 0.2, 0.3); ctx.fill();
      break;
    }
    default: break;
  }
}

// ---- the whole figure -------------------------------------------------------------------
// Draw order: back layer, far arm (behind the body), legs, torso, head, charm, shield, the
// main weapon, then the near arm on top.
export function drawFighterBody(ctx, R, P, S) {
  LOD = S.lod || 0;
  const B = BODY[S.cls] || BODY.duelist;
  const W = S.weapon || 'sabre';
  const isWarden = S.cls === 'warden';
  // a second hand on the haft for the long weapons, if the off hand is free
  const freeOff = !isWarden && !P.offBusy;
  const d = dirv(R.wpnA);
  if (freeOff && W === 'pole') gripOff(R, add(R.hand, d, -(P.offGripAt ?? WPN.pole.grip * 0.72)));
  if (freeOff && W === 'maul' && P.offGripAt != null) { gripOff(R, add(R.hand, d, P.offGripAt)); P = { ...P, twoHand: false }; }
  if (freeOff && W === 'maul' && P.twoHand !== false) gripOff(R, add(R.hand, d, 10));
  B.back(ctx, R, P, S);
  // a weapon carried over the shoulder lies behind the body, the hand closed on its grip
  const wo = { sway: P.lampSway || 0, drift: P.smokeDrift ?? -1, chain: P.chainLen, grip: P.poleGrip };
  if (P.weaponBehind && !P.noWeapon) drawWeapon(ctx, W === 'knives' ? 'knife' : W, R.hand, R.wpnA, S, wo);
  // far arm and anything in it
  if (!isWarden) {
    if (W === 'knives' && !P.offBusy) drawWeapon(ctx, 'knife', R.handF, R.offW, S);
    B.arm(ctx, R.shF, R.elbowF, R.handF, S, false);
  } else B.arm(ctx, R.shF, R.elbowF, R.handF, S, false);
  B.legs(ctx, R, P, S);
  B.torso(ctx, R, P, S);
  // portrait proportions: a smaller head on the same neck
  let hc;
  if (R.C.adult) {
    ctx.save(); ctx.translate(R.sh[0], R.sh[1]); ctx.scale(0.68, 0.68); ctx.translate(-R.sh[0], -R.sh[1]);
    hc = B.head(ctx, R, P, S);
    ctx.restore();
  } else hc = B.head(ctx, R, P, S);
  contenderSash(ctx, R, P, S, 'tails');
  contenderSash(ctx, R, P, S, 'band');
  drawCharm(ctx, S.charm, R, P, S, B);
  if (P.under) P.under(ctx, R, hc);
  if (isWarden) shield(ctx, R, P, S);
  // the main weapon, then the arm over it
  let tip = null;
  if (!P.noWeapon && !P.weaponBehind) {
    const o = wo;
    const r = drawWeapon(ctx, W === 'knives' ? 'knife' : W, R.hand, R.wpnA, S, o);
    tip = r.tip;
    if (P.echo) {
      ctx.save();
      ctx.globalAlpha *= 0.32;
      ctx.translate(-5, -4);
      drawWeapon(ctx, W === 'knives' ? 'knife' : W, R.hand, R.wpnA + 0.12, S, o);
      ctx.restore();
    }
  }
  B.arm(ctx, R.shA, R.elbow, R.hand, S, true);
  drawCharm(ctx, S.charm, R, P, S, B, true);
  return { hc, tip };
}

export { BODY, chainLinks, smoke };
