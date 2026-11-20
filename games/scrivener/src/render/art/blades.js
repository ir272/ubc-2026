// Layered black blades for the Scrivener's wings and quill collar (round 9). Owner: art.
//
// Round 8's wings were a scribble: dozens of thin quills whose centre lines crossed, all
// the same width, salted with white barb ticks. Obata builds a death-god's wing or rag
// cape the other way round: a FEW long, solid-black, curved blades that overlap like
// roof slates, every one widest a quarter of the way out and tapering to a needle point,
// separated only by a thin white line carved where one blade lies over the next. Inside
// a blade there is at most one carved white stroke (a fold or quill shaft) that swells
// and dies before the tip. No crossing centre lines, no hairline clutter.
//
// A blade: { root, ang, len, bend, w, seed, asym?, split?, carve? }
//   ang   direction (0 = down, +PI/2 = forward), bend = sideways bow as a fraction of len
//   w     widest width; asym = share of the width on the + side of the centre line
// Blades are drawn in list order (later ones lie on top). Each gets its own fills so
// overlapping ribbons never cancel each other under the nonzero rule.

import { hashNoise } from '../../core/rng.js';
import { INK, PAPER } from '../ink.js';
import { LIGHT } from './pen.js';

const dirv = (a) => [Math.sin(a), Math.cos(a)];

// centre line (quadratic: the bow is strongest just past the middle) + both edges
export function bladeGeom(q, n = 14) {
  const { root, ang, len, bend = 0, w, asym = 0.5 } = q;
  const d = dirv(ang), nr = [-d[1], d[0]];
  const c = [root[0] + d[0] * len * 0.55 + nr[0] * bend * len, root[1] + d[1] * len * 0.55 + nr[1] * bend * len];
  const tip0 = [root[0] + d[0] * len + nr[0] * bend * len * 0.55, root[1] + d[1] * len + nr[1] * bend * len * 0.55];
  const tip = tip0;
  const cen = [];
  // round 22: `hook` curls the outer part of the blade further the way it bows (a quill
  // sweeping to its point), so the centre line is a pen arc, never a ruled chord
  const hook = (q.hook || 0) * len;
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const hk = hook * Math.pow(t, 2.4);
    cen.push([u * u * root[0] + 2 * u * t * c[0] + t * t * tip[0] + nr[0] * hk, u * u * root[1] + 2 * u * t * c[1] + t * t * tip[1] + nr[1] * hk]);
  }
  const prof = q.prof || ((t) => (t < 0.26 ? 0.62 + 0.38 * Math.sin((t / 0.26) * Math.PI / 2) : Math.pow((1 - t) / 0.74, 1.12)));
  const P = [], M = [], N = [], W = [];
  for (let i = 0; i <= n; i++) {
    const q1 = cen[Math.min(n, i + 1)], q0 = cen[Math.max(0, i - 1)];
    const dx = q1[0] - q0[0], dy = q1[1] - q0[1], l = Math.hypot(dx, dy) || 1;
    const nn = [-dy / l, dx / l];
    const ww = w * prof(i / n);
    W.push(ww); N.push(nn);
    P.push([cen[i][0] + nn[0] * ww * asym, cen[i][1] + nn[1] * ww * asym]);
    M.push([cen[i][0] - nn[0] * ww * (1 - asym), cen[i][1] - nn[1] * ww * (1 - asym)]);
  }
  // which side faces the light (judged at the middle of the blade)
  const mid = N[n >> 1];
  const litSide = mid[0] * LIGHT[0] + mid[1] * LIGHT[1] > 0 ? 1 : -1;
  return { cen, P, M, N, W, n, litSide, tip: cen[n], d };
}

function outlinePath(ctx, G, padP, padM) {
  const { P, M, N, n, cen } = G;
  ctx.moveTo(P[0][0] + N[0][0] * padP(0), P[0][1] + N[0][1] * padP(0));
  for (let i = 1; i <= n; i++) ctx.lineTo(P[i][0] + N[i][0] * padP(i / n), P[i][1] + N[i][1] * padP(i / n));
  // the needle point: run a little past the last sample so the tip is sharp
  const e = cen[n];
  ctx.lineTo(e[0] + G.d[0] * 0.01, e[1] + G.d[1] * 0.01);
  for (let i = n; i >= 0; i--) ctx.lineTo(M[i][0] - N[i][0] * padM(i / n), M[i][1] - N[i][1] * padM(i / n));
  ctx.closePath();
}

// a split rag tip: a narrow second point peeling off one edge two thirds of the way out
function splitGeom(q, G) {
  const n = G.n;
  const i0 = Math.round(n * (0.5 + 0.15 * hashNoise(q.seed, 3)));
  const sd = q.split > 0 ? 1 : -1;
  const edge = sd > 0 ? G.P[i0] : G.M[i0];
  const rem = q.len * (1 - i0 / n);
  return bladeGeom({ root: edge, ang: q.ang + sd * (0.1 + 0.08 * hashNoise(q.seed, 4)) + (q.bend || 0) * 0.9, len: rem * (0.7 + 0.25 * hashNoise(q.seed, 5)), bend: (q.bend || 0) * 0.5, w: G.W[i0] * 0.55, asym: 0.5,
    prof: (t) => Math.pow(1 - t, 1.05) }, 8);
}

// Ink a list of blades. opts.halo: width of the carved white separation line (0 = none);
// opts.far: no interior carving; opts.color: fill.
export function inkBlades(ctx, list, { halo = 1.6, far = false, color = INK, carve = true } = {}) {
  for (const q of list) {
    const G = bladeGeom(q);
    const S = q.split ? splitGeom(q, G) : null;
    // the separation line: cut on both edges, swelling toward the root (pen pressure)
    // and dying out at the point; buried for the first few samples so the roots fuse
    if (halo > 0) {
      const hl = halo * (q.haloK || 1);
      const pad = (t) => hl * (t < 0.08 ? t / 0.08 : 1) * (0.35 + 0.65 * Math.pow(1 - t, 0.7));
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      outlinePath(ctx, G, pad, pad);
      ctx.fill();
      if (S) { ctx.beginPath(); outlinePath(ctx, S, (t) => hl * 0.7 * (1 - t), (t) => hl * 0.7 * (1 - t)); ctx.fill(); }
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    outlinePath(ctx, G, () => 0, () => 0);
    ctx.fill();
    if (S) { ctx.beginPath(); outlinePath(ctx, S, () => 0, () => 0); ctx.fill(); }
    if (far || !carve || q.carve === 0) continue;
    // one carved stroke inside the blade: a fold/shaft line set toward the lit edge,
    // leaving the root as a point, swelling, tapering away before the tip
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    const h = (k) => hashNoise(q.seed * 7 + 11, k);
    const t0 = 0.1 + 0.08 * h(1), t1 = 0.62 + 0.22 * h(2);
    const off = 0.18 + 0.14 * h(3); // toward the lit edge, fraction of the width
    const wmax = (q.carveW || 1.5) * (0.8 + 0.4 * h(4));
    const pts = [], ws = [];
    const n = G.n;
    for (let i = Math.round(t0 * n); i <= Math.round(t1 * n); i++) {
      const a = (i / n - t0) / (t1 - t0);
      const o = G.W[i] * off * G.litSide * (1 - 0.4 * a);
      pts.push([G.cen[i][0] + G.N[i][0] * o, G.cen[i][1] + G.N[i][1] * o]);
      ws.push(wmax * Math.pow(Math.sin(Math.PI * Math.min(1, a * 1.15 + 0.04)), 0.75) * (1 - 0.45 * a) + 0.05);
    }
    strokePath(ctx, pts, ws);
    // the lit rim: a broken white sliver inset from the lit edge over the widest part
    if (q.rim !== 0 && h(5) > 0.3) {
      const r = [], rw = [];
      const a0 = Math.round(n * (0.16 + 0.1 * h(6))), a1 = Math.round(n * (0.42 + 0.12 * h(7)));
      for (let i = a0; i <= a1; i++) {
        const E = G.litSide > 0 ? G.P[i] : G.M[i];
        const k = 1.6;
        r.push([E[0] - G.N[i][0] * k * G.litSide, E[1] - G.N[i][1] * k * G.litSide]);
        rw.push(1.05 * Math.sin(Math.PI * (i - a0) / Math.max(1, a1 - a0)) + 0.05);
      }
      strokePath(ctx, r, rw);
    }
    ctx.fill();
  }
}

// a variable-width stroke along pts (widths per point)
export function strokePath(ctx, pts, ws) {
  const n = pts.length;
  if (n < 2) return;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    const dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1;
    const w = ws[i] * 0.5;
    L.push([pts[i][0] - dy / l * w, pts[i][1] + dx / l * w]);
    R.push([pts[i][0] + dy / l * w, pts[i][1] - dx / l * w]);
  }
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
}

// round 31: a pen stroke along a quadratic a -> c -> e: it lands pressed, swells a
// little and lifts off into a point; sampled smooth so it reads as a curve, not a tick
export function curveStroke(ctx, a, c, e, w0, n = 6) {
  const pts = [], ws = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * e[0], u * u * a[1] + 2 * u * t * c[1] + t * t * e[1]]);
    ws.push(w0 * (t < 0.18 ? 0.72 + 0.28 * (t / 0.18) : Math.pow(1 - (t - 0.18) / 0.82, 1.05)) + 0.03);
  }
  strokePath(ctx, pts, ws);
}

// Round 12: the wing / collar as ONE black design mass. Every blade is filled solid with
// no white halo, so overlapping blades fuse into a single silhouette that only breaks
// into separate needle points at its ragged edge. Form inside the mass is carved in
// white hairlines (0.4-0.9 units): the lit edge of each blade where it lies over the
// next one, and on the big near blades a shaft line with a few barbs raking toward
// the point. No outlines, no clutter at the roots (they stay solid black).
//   opts.carve: 0 = none (far wing), 1 = edges only, 2 = edges + shafts + barbs
export function massBlades(ctx, list, { carve = 2, color = INK, needle = 1.35, edgeW = 1.3, paper = 0, dry = 0, hatch = 0, fillFirst = false } = {}) {
  const geoms = list.map((q) => {
    const prof = q.prof || ((t) => (t < 0.24 ? 0.66 + 0.34 * Math.sin((t / 0.24) * Math.PI / 2) : Math.pow((1 - t) / 0.76, needle)));
    const G = bladeGeom({ ...q, prof }, 18);
    return { q, G, S: q.split ? splitGeom(q, G) : null };
  });
  // round 21: a paper margin round the outer half of every blade (none at the roots, so
  // the mass stays fused), laid under ALL the blades first: the wing's points read as a
  // silhouette even where they cross black book spines or the dark of the arena
  if (paper > 0) {
    // round 22: the gap swells and dies like a pen line (wide where the blade lifts off,
    // a hair at the point), uneven from blade to blade and side to side
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    for (const { q, G, S } of geoms) {
      const k = 0.55 + 0.9 * hashNoise(q.seed * 3 + 1, 77);
      // round 25: only the free outer third lifts off (the mass stays one black slab)
      const ramp = (t) => Math.min(1, Math.max(0, (t - (q.dryGap ?? 0.3)) / 0.2)) * Math.pow(Math.max(0, 1 - t), 0.6) * 1.5;
      const padL = (t) => paper * k * ramp(t) * (G.litSide > 0 ? 0.55 : 1.25);
      const padR = (t) => paper * k * ramp(t) * (G.litSide > 0 ? 1.25 : 0.55);
      outlinePath(ctx, G, padL, padR);
      if (S) outlinePath(ctx, S, (t) => paper * (1 - t), (t) => paper * (1 - t));
    }
    ctx.fill();
  }
  ctx.fillStyle = color;
  // round 32: fillFirst lays every blade's black before any carving, so the carved lines
  // run the whole length of their blade across the fused mass (designed folds, not
  // fragments cut off by the next blade)
  if (fillFirst) {
    for (const { q, G, S } of geoms) {
      ctx.beginPath();
      outlinePath(ctx, G, () => 0, () => 0);
      if (S) outlinePath(ctx, S, () => 0, () => 0);
      ctx.fill();
      if (dry) dryTip(ctx, q, G, color, dry, q.streaks !== 0);
    }
  }
  for (const { q, G, S } of geoms) {
    if (!fillFirst) {
      ctx.beginPath();
      outlinePath(ctx, G, () => 0, () => 0);
      if (S) outlinePath(ctx, S, () => 0, () => 0);
      ctx.fill();
      if (dry) dryTip(ctx, q, G, color, dry, q.streaks !== 0);
    }
    if (!carve || q.carve === 0) continue;
    const h = (k) => hashNoise(q.seed * 5 + 7, k);
    const n = G.n;
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    // the lit edge: a white hairline set just inside the edge, born a third of the way
    // out (the roots stay fused), swelling, dying before the point
    // round 32: q.edge = 0 leaves the edge fused (the wing is one black mass, carved by a
    // few bold lines), q.edgeSpan = [from, to] sets where along the blade it runs
    if (q.edge !== 0) {
      const a0 = Math.round(n * (q.edgeSpan ? q.edgeSpan[0] : 0.16 + 0.1 * h(1))), a1 = Math.round(n * (q.edgeSpan ? q.edgeSpan[1] : hatch > 0 && G.W[n >> 1] > 6 ? 0.36 + 0.06 * h(2) : 0.84 + 0.08 * h(2)));
      const pts = [], ws = [];
      for (let i = a0; i <= a1; i++) {
        const E = G.litSide > 0 ? G.P[i] : G.M[i];
        const k = 0.9 + G.W[i] * 0.05;
        pts.push([E[0] - G.N[i][0] * k * G.litSide, E[1] - G.N[i][1] * k * G.litSide]);
        const a = (i - a0) / Math.max(1, a1 - a0);
        ws.push(edgeW * (q.edgeK || 1) * Math.pow(Math.sin(Math.PI * Math.min(1, a * 1.1 + 0.03)), 0.6) * (1 - 0.35 * a) + 0.04);
      }
      strokePath(ctx, pts, ws);
    }
    if (carve >= 2 && (G.W[n >> 2] > 14 || q.shaft === 1) && q.shaft !== 0) {
      // round 31: the shaft is a bold negative line, pressed near the root, thinning
      // toward the point and breaking once where the vane turns into the light
      const SS = q.shaftSpan;
      const t0 = SS ? SS[0] : 0.08 + 0.06 * h(3), t1 = SS ? SS[2] : 0.7 + 0.15 * h(4);
      const tb = SS ? SS[1] + 0.06 * (h(15) - 0.5) : 0.5 + 0.12 * h(15);
      const seg = (ta, tb2, wk) => {
        const sp = [], sw = [];
        for (let i = Math.round(ta * n); i <= Math.round(tb2 * n); i++) {
          const a = (i / n - t0) / (t1 - t0);
          const loc = (i / n - ta) / Math.max(0.01, tb2 - ta);
          const o = G.W[i] * 0.16 * G.litSide;
          sp.push([G.cen[i][0] + G.N[i][0] * o, G.cen[i][1] + G.N[i][1] * o]);
          sw.push(wk * Math.pow(Math.sin(Math.PI * Math.min(1, loc * 1.02 + 0.03)), 0.6) * (1 - 0.55 * a) + 0.04);
        }
        if (sp.length > 1) strokePath(ctx, sp, sw);
      };
      const sk = q.shaftW || 1;
      seg(t0, tb, 1.9 * sk);
      seg(tb + 0.04, t1, 1.2 * Math.sqrt(sk));
      // barbs: two or three GROUPS of curved strokes leaving the shaft on the lit side,
      // sweeping out and toward the point (the vane's form), graded in each group
      const ng = q.barbs === 0 ? 0 : 2 + (h(5) > 0.55 ? 1 : 0);
      let Ls = 0; for (let i = 1; i <= n; i++) Ls += Math.hypot(G.cen[i][0] - G.cen[i - 1][0], G.cen[i][1] - G.cen[i - 1][1]);
      for (let gq = 0; gq < ng; gq++) {
        const m = 2 + Math.floor(h(6 + gq) * 3);
        const longest = h(9 + gq);
        let tt = 0.2 + gq * (0.5 / ng) + 0.06 * h(12 + gq);
        for (let j = 0; j < m && tt < 0.8; j++) {
          const i = Math.round(tt * n);
          const o = G.W[i] * 0.16 * G.litSide;
          const s0 = [G.cen[i][0] + G.N[i][0] * o, G.cen[i][1] + G.N[i][1] * o];
          const u = m > 1 ? j / (m - 1) : 0.5;
          const reach = G.W[i] * (0.3 + 0.12 * h(20 + gq * 5 + j)) * (1 - 0.45 * Math.abs(u - longest));
          const rk = 0.9 + 0.5 * h(30 + gq);
          const sideN = [G.N[i][0] * G.litSide, G.N[i][1] * G.litSide];
          const c = [s0[0] + sideN[0] * reach * 0.75 + G.d[0] * reach * rk * 0.2, s0[1] + sideN[1] * reach * 0.75 + G.d[1] * reach * rk * 0.2];
          const e = [s0[0] + sideN[0] * reach * 0.95 + G.d[0] * reach * rk, s0[1] + sideN[1] * reach * 0.95 + G.d[1] * reach * rk];
          curveStroke(ctx, s0, c, e, 1.35 * (1 - 0.4 * tt), 4);
          tt += (2.6 + 1.4 * h(40 + gq * 5 + j)) / Math.max(20, Ls);
        }
      }
    }
    // round 28: the black blade is MODELLED where it turns to the light: groups of
    // curved, tapered white hatch carved in from the lit edge (each breaking the edge
    // where it lands, raking toward the point, dying inside the black), graded in length
    // inside a group, uneven gaps between groups, none in the root third or at the tip
    if (hatch > 0 && G.W[n >> 1] > 6 && q.hatch !== 0) {
      let tt = (q.hatchFrom ?? 0.34) + 0.08 * h(40);
      const tEnd = q.hatchTo ?? 0.84, hw = q.hatchW || 1;
      let gi = 0;
      let Lb = 0; for (let i = 1; i <= n; i++) Lb += Math.hypot(G.cen[i][0] - G.cen[i - 1][0], G.cen[i][1] - G.cen[i - 1][1]);
      const at = (A, t) => { const f = Math.min(n, Math.max(0, t * n)), i = Math.min(n - 1, Math.floor(f)), k = f - i; return [A[i][0] + (A[i + 1][0] - A[i][0]) * k, A[i][1] + (A[i + 1][1] - A[i][1]) * k]; };
      const atW = (t) => { const f = Math.min(n, Math.max(0, t * n)), i = Math.min(n - 1, Math.floor(f)), k = f - i; return G.W[i] + (G.W[i + 1] - G.W[i]) * k; };
      while (tt < tEnd) {
        const m = 2 + Math.floor(h(41 + gi) * 3);
        const longest = h(45 + gi);
        for (let j = 0; j < m && tt < 0.86; j++) {
          const E = at(G.litSide > 0 ? G.P : G.M, tt);
          const Nn = at(G.N, tt);
          const inward = [-Nn[0] * G.litSide, -Nn[1] * G.litSide];
          const u = m > 1 ? j / (m - 1) : 0.5;
          const reach = atW(tt) * hatch * (0.42 + 0.3 * h(50 + gi * 7 + j)) * (1 - 0.5 * Math.abs(u - longest));
          // round 31: less rake, more wrap: the stroke leaves the edge square, curls
          // round the blade's volume and only then swings toward the point
          const rk = 0.75 + 0.55 * h(60 + gi);
          const e0 = [E[0] - inward[0] * 1.2, E[1] - inward[1] * 1.2];
          const e1 = [E[0] + inward[0] * reach + G.d[0] * reach * rk, E[1] + inward[1] * reach + G.d[1] * reach * rk];
          const em = [E[0] + inward[0] * reach * 0.62 + G.d[0] * reach * rk * 0.32, E[1] + inward[1] * reach * 0.62 + G.d[1] * reach * rk * 0.32];
          const w0 = (1.6 + 0.6 * h(70 + gi)) * (1 - 0.4 * tt) * hw;
          curveStroke(ctx, e0, em, e1, w0, 4);
          tt += (3.8 + 2.2 * h(80 + gi * 5 + j)) / Math.max(20, Lb);
        }
        tt += (q.hatchGap ?? (9 + 18 * h(90 + gi))) / Math.max(20, Lb);
        gi++;
      }
    }
    // round 22: the vane splits: two or three white slits cut in from the shadow edge in
    // the outer half, raking toward the point and tapering to nothing (separated barbs)
    if (carve >= 2 && G.W[n >> 2] > 12 && q.splits !== 0) {
      const ns = q.splits ?? 2 + Math.floor(h(30) * 2);
      for (let b = 0; b < ns; b++) {
        const tt = 0.42 + (b + 0.3 + 0.5 * h(31 + b)) * (0.4 / ns);
        const i = Math.min(n - 1, Math.round(tt * n));
        const E = G.litSide > 0 ? G.M[i] : G.P[i];
        const inward = [G.N[i][0] * G.litSide, G.N[i][1] * G.litSide];
        const reach = G.W[i] * (0.45 + 0.25 * h(35 + b));
        const e0 = [E[0] - inward[0] * 0.6, E[1] - inward[1] * 0.6];
        const e1 = [E[0] + inward[0] * reach + G.d[0] * reach * 2.2, E[1] + inward[1] * reach + G.d[1] * reach * 2.2];
        const em = [(e0[0] + e1[0]) / 2 + G.d[0] * reach * 0.3, (e0[1] + e1[1]) / 2 + G.d[1] * reach * 0.3];
        strokePath(ctx, [e0, em, e1], [1.5, 0.7, 0.03]);
      }
    }
    ctx.fill();
    ctx.fillStyle = color;
  }
}

// Round 25: a dry-brush end. A loaded brush lifting off the paper does not end in one
// ruled needle: its outer third splits into bristles. Two to four hairline prongs of
// UNEVEN length fan off the outer blade (one often far longer than the rest), and paper
// streaks rake along the outer blade so its edge breaks into separate hairs.
function dryTip(ctx, q, G, color, k = 1, streaks = true) {
  const h = (i) => hashNoise(q.seed * 13 + 5, i);
  const n = G.n;
  const tan = (i) => {
    const a = G.cen[Math.max(0, i - 1)], b = G.cen[Math.min(n, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  const np = 1 + Math.floor(h(0) * 2.6);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let b = 0; b < np; b++) {
    const t0 = 0.42 + 0.26 * h(1 + b);
    const i0 = Math.min(n - 1, Math.round(t0 * n));
    const across = (h(10 + b) - 0.5) * 1.5;
    const W = G.W[i0];
    const base = [G.cen[i0][0] + G.N[i0][0] * W * across * 0.5, G.cen[i0][1] + G.N[i0][1] * W * across * 0.5];
    const d = tan(i0);
    const turn = across * 0.16 + (h(30 + b) - 0.5) * 0.18;
    const c = Math.cos(turn), s = Math.sin(turn);
    const dd = [d[0] * c - d[1] * s, d[0] * s + d[1] * c];
    const long = b === 0 && h(50) > 0.45 ? 1.9 : 1;
    const L = q.len * ((1 - t0) * 0.85 + (0.02 + 0.16 * h(20 + b)) * long) * k;
    const nn = [-dd[1], dd[0]];
    const bow = L * 0.08 * (h(40 + b) - 0.5) * 2;
    const m = [base[0] + dd[0] * L * 0.5 + nn[0] * bow, base[1] + dd[1] * L * 0.5 + nn[1] * bow];
    const e = [base[0] + dd[0] * L + nn[0] * bow * 2.2, base[1] + dd[1] * L + nn[1] * bow * 2.2];
    const w0 = Math.max(1.4, W * (0.3 + 0.22 * h(60 + b)));
    strokePath(ctx, [base, m, e], [w0, w0 * 0.42, 0.04]);
  }
  ctx.fill();
  // paper streaks: the bristles separating along the outer blade
  if (!streaks) return;
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  const ns = 1 + Math.floor(h(70) * 3);
  for (let j = 0; j < ns; j++) {
    const t0 = 0.5 + 0.22 * h(71 + j), t1 = Math.min(0.98, t0 + 0.18 + 0.25 * h(80 + j));
    const off = (h(90 + j) - 0.5) * 0.7;
    const pts = [], ws = [];
    const i0 = Math.round(t0 * n), i1 = Math.round(t1 * n);
    for (let i = i0; i <= i1; i++) {
      const a = (i - i0) / Math.max(1, i1 - i0);
      pts.push([G.cen[i][0] + G.N[i][0] * G.W[i] * off, G.cen[i][1] + G.N[i][1] * G.W[i] * off]);
      ws.push((0.55 + 0.6 * h(100 + j)) * Math.sin(Math.PI * Math.min(1, a * 0.9 + 0.08)) + 0.03);
    }
    if (pts.length > 1) strokePath(ctx, pts, ws);
  }
  ctx.fill();
  ctx.fillStyle = color;
}

// Round 32: crosshatch carved in white into the deepest pocket of a black mass (the wing
// pit, under the cage). Two families of tapered strokes inside an ellipse, each its own
// length (ragged ends, so the patch has no outline), the second family only near the
// middle. c: centre; rx, ry: radii; ang: ellipse rotation; a1, a2: stroke directions.
export function crossPocket(ctx, c, { rx = 10, ry = 6, ang = 0, a1 = 0.5, a2 = -0.7, pitch = 2.6, w = 1.0, seed = 1, color = PAPER } = {}) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const inside = (x, y) => { const lx = x * ca + y * sa, ly = -x * sa + y * ca; return (lx / rx) ** 2 + (ly / ry) ** 2 <= 1; };
  const R = Math.max(rx, ry);
  ctx.fillStyle = color;
  [a1, a2].forEach((fa, f) => {
    const dir = [Math.cos(fa), Math.sin(fa)], per = [-dir[1], dir[0]];
    let j = 0;
    for (let k = -R; k <= R; k += pitch * (0.85 + 0.3 * hashNoise(seed + f * 31, j))) {
      j++;
      let t0 = null, t1 = null;
      for (let t = -R * 1.2; t <= R * 1.2; t += 0.4) {
        if (inside(per[0] * k + dir[0] * t, per[1] * k + dir[1] * t)) { if (t0 === null) t0 = t; t1 = t; }
      }
      if (t0 === null) continue;
      const span = t1 - t0;
      const lo = f ? 0.2 + 0.25 * hashNoise(seed + 7, j) : 0.03 + 0.3 * hashNoise(seed + 9, j);
      const hi = f ? 0.2 + 0.25 * hashNoise(seed + 11, j) : 0.03 + 0.3 * hashNoise(seed + 13, j);
      t0 += span * lo; t1 -= span * hi;
      if (t1 - t0 < 2 || hashNoise(seed + 17 + f, j) < (f ? 0.25 : 0.1)) continue;
      const P = (t) => [c[0] + per[0] * k + dir[0] * t, c[1] + per[1] * k + dir[1] * t];
      const wj = w * (0.75 + 0.5 * hashNoise(seed + 19, j)) * (f ? 0.85 : 1);
      ctx.beginPath(); // one fill per stroke: crossing strokes must not cancel (nonzero)
      strokePath(ctx, [P(t0), P(t0 + (t1 - t0) * 0.3), P(t0 + (t1 - t0) * 0.65), P(t1)], [0.05, wj, wj * 0.7, 0.04]);
      ctx.fill();
    }
  });
}
