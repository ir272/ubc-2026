// Round 15: the feathered edge. Where a black mass turns into the light, Obata does not
// stop the black at a hard vector boundary: the black breaks into the paper through a
// band of short, dense, tapered hatch strokes laid ACROSS the form (cross-contours that
// wrap the volume), long and open at the lit edge, getting shorter and sparser as they
// run into the black, crossed by a second set only in the deep pockets (elbow crook,
// wrist, armpit). The silhouette is held by a hairline contour that breaks where the
// light is strongest. Ref 07 (the black forearm and claws over the ledger).
// Owner: art. Painted in part units (see parts.js); batched into one fill per set.

import { INK, PAPER, rng, noise1, lerp, clamp, smooth, add, norm, spline, resample, ribbonPts, stroke } from './brush.js';

// an arc-length sampler over a polyline: point, unit tangent, length
function sampler(edge) {
  const P = resample(spline(edge, 10), 0.25);
  const S = [0];
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = S[S.length - 1] || 1;
  const at = (s) => {
    const x = clamp(s, 0, 1) * L;
    let i = 1;
    while (i < S.length - 1 && S[i] < x) i++;
    const a = P[i - 1], b = P[i];
    const k = (x - S[i - 1]) / ((S[i] - S[i - 1]) || 1);
    const t = norm([b[0] - a[0], b[1] - a[1]]);
    return { p: [lerp(a[0], b[0], k), lerp(a[1], b[1], k)], t };
  };
  return { at, L };
}

const rot = (d, a) => [d[0] * Math.cos(a) - d[1] * Math.sin(a), d[0] * Math.sin(a) + d[1] * Math.cos(a)];

/**
 * featherEdge(g, edge, o): a feathered transition along the lit edge of a black mass.
 *  edge     polyline along the lit contour
 *  inside   a point inside the mass (or insideFn(s) -> point) so each stroke runs inward
 *  s0, s1   the run along the edge (arc fraction)
 *  step     spacing of the first row (units)
 *  depth    reach of the longest strokes into the black (units); depthFn(s) overrides
 *  w        stroke width at the edge (units); white teeth ~0.75 of the spacing leave
 *           black teeth between them that taper out toward the paper
 *  bow      how far each stroke curves along the edge as it wraps (fraction of its length)
 *  lean     angle off the inward normal (radians, + turns toward the edge tangent)
 *  rows     second / third row: shorter, sparser, thinner strokes deeper in the black
 *  pockets  [[s0, s1, k]]: ink strokes crossing the band at an angle (crosshatch in a
 *           pocket), k = strength 0..1
 *  contour  hairline ink width along the edge (0 = none); broken where `brk` noise allows
 */
export function featherEdge(g, edge, o = {}) {
  const {
    inside = null, insideFn = null, side = 0, s0 = 0, s1 = 1, step = 1.7, depth = 7, depthFn = null, w = 1.3, bow = 0.22,
    lean = 0, rows = 2, pockets = [], contour = 0.55, brk = 0.35, seed = 1, fade = 0.08, color = PAPER, inset = 0.25,
    long = 0.18,
  } = o;
  const { at, L } = sampler(edge);
  const r = rng(seed * 7 + 11);
  const nz = noise1(seed * 13 + 5), nz2 = noise1(seed * 13 + 6);
  const inward = (s) => {
    const A = at(s);
    let n = [-A.t[1], A.t[0]];
    if (side) n = [n[0] * side, n[1] * side];
    else {
      const c = insideFn ? insideFn(s) : inside;
      if (c && (n[0] * (c[0] - A.p[0]) + n[1] * (c[1] - A.p[1])) < 0) n = [-n[0], -n[1]];
    }
    return { ...A, n };
  };
  const span = (s1 - s0) * L;
  const n1 = Math.max(2, Math.round(span / step));
  const env = (s) => smooth(s0, s0 + fade, s) * (1 - smooth(s1 - fade, s1, s));
  const strokeAt = (s, d0, len, wid, both, k) => {
    const A = inward(s);
    const dir = rot(A.n, (lean + (r() - 0.5) * 0.22) * (side >= 0 ? 1 : -1));
    const tb = A.t;
    const b = bow * (0.7 + r() * 0.6);
    const pts = [];
    for (let j = 0; j <= 4; j++) {
      const u = j / 4;
      const along = d0 + u * len;
      pts.push(add(add(A.p, dir, along), tb, b * len * u * u));
    }
    const wf = both ? (u) => wid * Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), 0.7) + 0.02
      : (u) => wid * Math.pow(1 - u, 1.15) * (1 + 0.15 * Math.sin(u * 3)) + 0.03;
    ribbonPts(g, pts, wf, seed * 31 + k);
  };
  g.save();
  g.fillStyle = color;
  g.beginPath();
  // row 1: from the lit edge inward, uneven reach (a few long ones carry the wrap deep)
  const reach = [];
  for (let i = 0; i <= n1; i++) {
    const s = lerp(s0, s1, (i + (r() - 0.5) * 0.45) / n1);
    const e = env(s);
    if (e < 0.05) { reach.push(0); continue; }
    const D = (depthFn ? depthFn(s) : depth);
    const v = 0.5 + 0.5 * (nz(s * L / 7) * 0.7 + nz(s * L / 2.3) * 0.3);
    let len = D * e * (0.38 + 0.62 * v) * (0.75 + r() * 0.5);
    if (r() < long) len *= 1.45;
    reach.push(len);
    if (len < 0.8) continue;
    strokeAt(s, inset, len, w * (0.8 + r() * 0.4) * (0.6 + 0.4 * e), false, i);
  }
  // rows 2..: deeper in the black, shorter and sparser, tapering at both ends
  for (let row = 1; row < rows; row++) {
    const n2 = Math.round(n1 / (1.5 + row * 0.6));
    for (let i = 0; i <= n2; i++) {
      if (r() < 0.25 + row * 0.15) continue;
      const s = lerp(s0, s1, (i + 0.5 + (r() - 0.5) * 0.6) / (n2 + 1));
      const e = env(s);
      if (e < 0.2) continue;
      const D = (depthFn ? depthFn(s) : depth) * e;
      const d0 = D * (0.55 + row * 0.4 + r() * 0.25);
      const len = D * (0.32 - row * 0.06) * (0.6 + r() * 0.7);
      if (len < 0.7) continue;
      strokeAt(s, d0, len, w * (0.62 - row * 0.12), true, 500 + row * 100 + i);
    }
  }
  g.fill();
  // pockets: ink strokes crossing the white teeth at an angle (crosshatch)
  if (pockets.length) {
    g.fillStyle = INK;
    g.beginPath();
    pockets.forEach(([p0, p1, k], pi) => {
      const m = Math.max(2, Math.round((p1 - p0) * L / (step * 0.9)));
      for (let i = 0; i <= m; i++) {
        const s = lerp(p0, p1, (i + (r() - 0.5) * 0.4) / m);
        const A = inward(s);
        const D = (depthFn ? depthFn(s) : depth) * (0.5 + 0.5 * k);
        const dir = rot(A.n, 0.8 * (side >= 0 ? 1 : -1));
        const a = add(A.p, A.n, 0.4);
        const e = add(a, dir, D * (0.6 + r() * 0.5));
        const mid = add(add(a, dir, D * 0.35), A.t, -0.6);
        ribbonPts(g, [a, mid, e], (u) => 0.75 * k * Math.pow(Math.sin(Math.PI * clamp(u * 0.9 + 0.05, 0, 1)), 0.8) + 0.02, seed * 41 + pi * 50 + i);
      }
    });
    g.fill();
  }
  // the contour: an ink hairline that breaks where the light hits hardest
  if (contour > 0) {
    let run = [];
    const flush = () => {
      if (run.length > 3) stroke(g, run, { w: contour, tin: 0.25, tout: 0.25, pin: 1, pout: 1, swell: 0, wob: 0.05, seed: seed + run.length, tooth: 0.02, k: 2 });
      run = [];
    };
    const M = Math.max(8, Math.round(span / 0.8));
    for (let i = 0; i <= M; i++) {
      const s = lerp(s0, s1, i / M);
      const gap = nz2(s * L / 6) > 1 - brk * 2 && env(s) > 0.5;
      if (gap) { flush(); continue; }
      const A = inward(s);
      run.push(add(A.p, A.n, -0.1));
    }
    flush();
  }
  g.restore();
}

/**
 * litPlane(g, edge, o): the lit side of a black mass as Obata inks it. Along the lit
 * contour a strip of PAPER is cut back out of the black (the plane facing the light),
 * and the black breaks into it through tapered black hatch strokes laid across the form:
 * dense and long where they leave the black, shorter and sparser toward the light, a few
 * crossed by a second set in the pockets. A hairline contour holds the silhouette and
 * breaks where the light is strongest; a few white slits run on from the strip into the
 * black so the two interlock.
 *  depthFn(s) / depth  strip width (units)    step  spacing of the long strokes
 *  reachK      how far the longest strokes reach across the strip (0..1)
 */
export function litPlane(g, edge, o = {}) {
  const {
    inside = null, side = 0, s0 = 0, s1 = 1, step = 2.0, depth = 7, depthFn = null, w = 1.25, bow = 0.25,
    pockets = [], contour = 0.7, brk = 0.3, seed = 1, fade = 0.1, slits = 0.5, reachK = 0.92, wobble = 0.35,
  } = o;
  const { at, L } = sampler(edge);
  const r = rng(seed * 7 + 3);
  const nz = noise1(seed * 13 + 7), nz2 = noise1(seed * 13 + 8), nz3 = noise1(seed * 13 + 9);
  const inward = (s) => {
    const A = at(s);
    let n = [-A.t[1], A.t[0]];
    if (side) n = [n[0] * side, n[1] * side];
    else if (inside && (n[0] * (inside[0] - A.p[0]) + n[1] * (inside[1] - A.p[1])) < 0) n = [-n[0], -n[1]];
    return { ...A, n };
  };
  const env = (s) => smooth(s0, s0 + fade, s) * (1 - smooth(s1 - fade, s1, s));
  const Dof = (s) => (depthFn ? depthFn(s) : depth) * env(s) * (1 + wobble * nz(s * L / 9));
  const span = (s1 - s0) * L;
  // 1. the paper plane
  const M = Math.max(8, Math.round(span / 0.6));
  const outer = [], inner = [];
  for (let i = 0; i <= M; i++) {
    const s = lerp(s0, s1, i / M);
    const A = inward(s);
    outer.push(add(A.p, A.n, -0.6));
    inner.push(add(A.p, A.n, Dof(s)));
  }
  g.save();
  g.fillStyle = PAPER;
  g.beginPath();
  outer.concat(inner.reverse()).forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
  g.fill();
  // 2. black hatching out of the black into the plane
  g.fillStyle = INK;
  g.beginPath();
  const n1 = Math.max(2, Math.round(span / step));
  const hatchRow = (count, kLen, kW, off, skip, tag) => {
    for (let i = 0; i <= count; i++) {
      if (r() < skip) continue;
      const s = lerp(s0, s1, (i + off + (r() - 0.5) * 0.5) / count);
      const D = Dof(s);
      if (D < 0.9) continue;
      const A = inward(s);
      const v = 0.5 + 0.5 * nz3(s * L / 5);
      const len = (D + 0.6) * clamp(kLen * (0.45 + 0.75 * v) * (0.7 + r() * 0.6), 0.12, reachK);
      const base = add(A.p, A.n, D + 0.7);
      const out = [-A.n[0], -A.n[1]];
      const b = bow * (0.6 + r() * 0.8);
      const pts = [];
      for (let j = 0; j <= 4; j++) { const u = j / 4; pts.push(add(add(base, out, u * len), A.t, b * len * u * u)); }
      ribbonPts(g, pts, (u) => w * kW * (0.8 + 0.4 * r()) * Math.pow(1 - u, 1.25) + 0.03, seed * 17 + tag + i);
    }
  };
  hatchRow(n1, 1.0, 1.0, 0, 0.04, 0);         // long strokes leaving the black
  hatchRow(n1, 0.45, 0.8, 0.5, 0.2, 1000);    // short ones between: denser at the black
  g.fill();
  // 3. pockets: a crossing set over the plane (crosshatch only where the form folds in)
  if (pockets.length) {
    g.beginPath();
    pockets.forEach(([p0, p1, k], pi) => {
      const m = Math.max(2, Math.round((p1 - p0) * L / (step * 0.8)));
      for (let i = 0; i <= m; i++) {
        const s = lerp(p0, p1, (i + (r() - 0.5) * 0.4) / m);
        const D = Dof(s);
        if (D < 1) continue;
        const A = inward(s);
        const dir = rot([-A.n[0], -A.n[1]], 0.75);
        const a = add(A.p, A.n, D + 0.6);
        const len = (D + 0.6) * (0.55 + r() * 0.4) * k / Math.cos(0.75);
        ribbonPts(g, [a, add(a, dir, len * 0.5), add(add(a, dir, len), A.t, -0.4)], (u) => 0.7 * w * Math.pow(1 - u, 1.1) + 0.03, seed * 41 + pi * 50 + i);
      }
    });
    g.fill();
  }
  // 4. white slits running on from the plane into the black (the two interlock)
  if (slits > 0) {
    g.fillStyle = PAPER;
    g.beginPath();
    const m = Math.round(n1 * slits * 0.5);
    for (let i = 0; i <= m; i++) {
      if (r() < 0.35) continue;
      const s = lerp(s0, s1, (i + 0.5 + (r() - 0.5) * 0.7) / (m + 1));
      const D = Dof(s);
      if (D < 1.5) continue;
      const A = inward(s);
      const a = add(A.p, A.n, D - 0.6);
      const len = D * (0.35 + r() * 0.55);
      ribbonPts(g, [a, add(add(a, A.n, len * 0.5), A.t, bow * len * 0.2), add(add(a, A.n, len), A.t, bow * len * 0.5)], (u) => w * 0.8 * Math.pow(1 - u, 1.2) + 0.02, seed * 53 + i);
    }
    g.fill();
  }
  // 5. the contour
  if (contour > 0) {
    let run = [];
    const flush = () => {
      if (run.length > 3) stroke(g, run, { w: contour, tin: 0.2, tout: 0.2, pin: 1, pout: 1, swell: 0, wob: 0.05, seed: seed + run.length, tooth: 0.02, k: 2 });
      run = [];
    };
    const K = Math.max(8, Math.round(span / 0.8));
    for (let i = 0; i <= K; i++) {
      const s = lerp(s0 - 0.02, s1 + 0.02, i / K);
      if (s < 0 || s > 1) continue;
      if (nz2(s * L / 6) > 1 - brk * 2 && env(s) > 0.6) { flush(); continue; }
      const A = inward(s);
      run.push(add(A.p, A.n, 0.15));
    }
    flush();
  }
  g.restore();
}

/**
 * knuckleHatch: short curved white hatch strokes wrapping a knuckle or finger joint
 * (centre c, axis direction u of the finger, radius rad), laid on the lit half only,
 * fanning round the joint so the bump reads as a modelled form.
 */
export function knuckleHatch(g, c, u, rad, o = {}) {
  const { n = 4, w = 0.6, light = [0.8, -0.6], seed = 1, color = PAPER, spread = 1.2 } = o;
  const r = rng(seed * 5 + 1);
  let nl = [-u[1], u[0]];
  if (nl[0] * light[0] + nl[1] * light[1] < 0) nl = [-nl[0], -nl[1]];
  g.save();
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread; // along the finger
    const a = add(add(c, u, f * rad * 1.6), nl, rad * 0.95);
    const len = rad * (0.75 + r() * 0.5) * (1 - Math.abs(f) * 0.45);
    const e = add(add(a, nl, -len), u, len * 0.35 * Math.sign(f || 0.3));
    const m = add(add(mix2(a, e), u, len * 0.18), nl, 0.1);
    ribbonPts(g, [a, m, e], (t) => w * Math.pow(1 - t, 1.1) + 0.02, seed * 9 + i);
  }
  g.fill();
  g.restore();
}
const mix2 = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
