// Gaunt inked arms for the Scrivener (round 8). Owner: art.
//
// Not tubes, not beads. The arm is a long, starved limb drawn the way a pen draws it:
//   * a thin shaft whose two contours swell at DIFFERENT places (deltoid high on the lit
//     side, a lean brachioradialis just below the elbow, condyles and a styloid knob as
//     bony landmarks), never a symmetric belly;
//   * the shadow side is a solid black that runs out into curved cross-contour hatch,
//     laid at irregular spacing (the pen clumps and skips) and tapering into the light;
//   * the lit contour is a hairline that swells only where bone presses the skin and
//     breaks to nothing mid-span;
//   * the radius/ulna groove, the deltoid insertion and the olecranon spur are drawn as
//     single tapered pen strokes;
//   * the scribe's forearms are stained black with ink from mid-forearm down: the stain
//     ends in a dry-brush edge of ragged tongues, and inside it form is CARVED in white
//     (a broken rim light, two tendon crescents converging on the wrist, short wrap
//     ticks) like the black claw in the reference close-ups.
// Everything is a filled pen polygon; deterministic (hashNoise only).

import { hashNoise } from '../../core/rng.js';
import { INK, PAPER } from '../ink.js';
import { LIGHT, ribbonPath, polyPath, spline, quad, spikePath } from './pen.js';
import { BONE, BONE_FAR } from './bone.js';

const g = (x) => Math.exp(-x * x);
const add = (p, d, s = 1) => [p[0] + d[0] * s, p[1] + d[1] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const unit = (a, b) => { const d = sub(b, a), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
const mix = (a, b, s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];

// profiles: s -> [litHalf, shadowHalf] (rig units). Gaunt: the whole upper arm is
// thinner than the old forearm belly; the swells sit at different stations per side.
export const UPPER_G = (s) => [
  4.3 + 3.0 * g((s - 0.12) / 0.13) - 0.8 * g((s - 0.55) / 0.18) + 2.8 * g((s - 0.94) / 0.06),
  4.6 + 2.8 * g((s - 0.42) / 0.2) + 0.5 * Math.sin(s * 11) * s + 3.6 * g((s - 0.95) / 0.055),
];
export const FORE_G = (s) => [
  3.4 + 3.4 * g((s - 0.13) / 0.11) + 1.4 * (1 - s) + 1.9 * g((s - 0.9) / 0.045),
  3.0 + 6.2 * g((s - 0.22) / 0.17) + 1.2 * (1 - s) + 1.4 * g((s - 0.95) / 0.05),
];

function geom(A, B, prof, bow, n) {
  const d = unit(A, B), nn = [-d[1], d[0]];
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const ls = dot(nn, LIGHT) > 0 ? 1 : -1;
  const ln = [nn[0] * ls, nn[1] * ls]; // unit normal toward the light
  const lit = [], sh = [], cen = [], W = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const c = add(add(A, d, s * L), ln, -bow * Math.sin(Math.PI * s));
    const w = prof(s);
    cen.push(c); W.push(w);
    lit.push(add(c, ln, w[0]));
    sh.push(add(c, ln, -w[1]));
  }
  // a point at fraction s along, offset o from the centreline (+ = toward the light)
  const at = (s, o) => {
    const f = Math.max(0, Math.min(n, s * n)), i = Math.min(n - 1, Math.floor(f)), k = f - i;
    return add(mix(cen[i], cen[i + 1], k), ln, o);
  };
  const wAt = (s) => {
    const f = Math.max(0, Math.min(n, s * n)), i = Math.min(n - 1, Math.floor(f)), k = f - i;
    return [W[i][0] + (W[i + 1][0] - W[i][0]) * k, W[i][1] + (W[i + 1][1] - W[i][1]) * k];
  };
  return { d, ln, L, lit, sh, cen, W, n, at, wAt };
}

// One inked limb segment. opts:
//   halo0: below this fraction no paper gap is cut (the root overlaps the limb above)
//   stain: fraction where the ink stain begins (null = none)
//   kind: 'upper' | 'fore' (which landmarks are drawn)
export function inkLimb(ctx, A, B, prof, { far = false, seed = 1, bow = 1.5, halo0 = 0, stain = null, kind = 'fore', n = 24 } = {}) {
  const G = geom(A, B, prof, bow, n);
  const { d, ln, L, lit, sh, cen, W, at, wAt } = G;
  const outline = lit.concat(sh.slice().reverse());
  const h = (k, j = 0) => hashNoise(seed * 13 + k, j);

  // ---- paper gap (wider on the shadow side, pinched at joints)
  {
    const po = [];
    const i0 = Math.round(halo0 * n);
    const pf = (i) => 2.4 * (0.45 + 0.8 * Math.pow(Math.sin(Math.PI * i / n), 0.6)) * (0.8 + 0.4 * h(1, i));
    for (let i = i0; i <= n; i++) po.push(add(add(lit[i], ln, pf(i) * 0.7), d, i === n ? 1.6 : 0));
    for (let i = n; i >= i0; i--) po.push(add(add(sh[i], ln, -pf(i) * 1.3), d, i === n ? 1.6 : 0));
    ctx.fillStyle = PAPER;
    ctx.beginPath(); polyPath(ctx, po); ctx.fill();
  }
  if (far) {
    ctx.fillStyle = INK;
    ctx.beginPath(); polyPath(ctx, outline); ctx.fill();
    return G;
  }
  ctx.fillStyle = BONE;
  ctx.beginPath(); polyPath(ctx, outline); ctx.fill();

  const span = (s) => { const w = wAt(s); return w[0] + w[1]; };
  // the solid black core: fraction of the width from the shadow edge, wandering
  const coreF = (s) => 0.36 + 0.1 * Math.sin(s * 7.3 + seed) + 0.05 * Math.sin(s * 19 + seed * 2)
    + 0.12 * g((s - (kind === 'fore' ? 0.22 : 0.42)) / 0.16) - 0.12 * g((s - 0.97) / 0.06);
  const coreO = (s) => -wAt(s)[1] + span(s) * coreF(s);

  ctx.fillStyle = INK;
  ctx.beginPath();
  // core shadow mass
  {
    const edge = [];
    for (let i = 0; i <= n; i++) edge.push(at(i / n, coreO(i / n)));
    polyPath(ctx, spline(edge, 2).concat(sh.slice().reverse()));
  }
  // cross-contour hatch: leaves the core heavy, arcs round the cylinder toward the
  // wrist, tapers to a point in the light. Spacing wanders, the pen skips in places,
  // lengths follow the form (long over the muscle, short over bone).
  {
    let s = 0.03 + h(2) * 0.02;
    let k = 0;
    while (s < 0.985) {
      k++;
      const step = (1.5 + 1.6 * h(3, k)) / L;
      s += step;
      if (h(4, k) < 0.12) { s += 2.5 / L; continue; } // a skip
      if (s >= 0.985) break;
      const w = wAt(s);
      const sp = w[0] + w[1];
      const o0 = coreO(s) - 0.4;
      const room = w[0] - o0; // to the lit edge
      const form = kind === 'fore' ? 0.5 + 0.45 * g((s - 0.25) / 0.2) - 0.25 * g((s - 0.9) / 0.08)
        : 0.45 + 0.4 * g((s - 0.45) / 0.22) - 0.2 * g((s - 0.95) / 0.07);
      const reach = room * Math.min(0.9, form * (0.55 + 0.6 * h(5, k)) * (k % 4 === 2 ? 0.55 : 1));
      if (reach < 0.8) continue;
      const p0 = at(s, o0);
      const curl = (0.18 + 0.2 * h(6, k)) * reach; // the arc leans toward the far end
      const p2 = add(at(s, o0 + reach), d, curl * 1.4);
      const p1 = add(at(s, o0 + reach * 0.55), d, curl * 0.25);
      const wmax = 0.9 + 0.6 * h(7, k) + (sp > 14 ? 0.25 : 0);
      ribbonPath(ctx, quad(p0, p1, p2, 4), (t) => wmax * Math.pow(1 - t, 0.7) + 0.04);
    }
    // crosshatch only in the deepest pocket
    const pocket = kind === 'fore' ? 0.24 : 0.46;
    for (let j = 0; j < 7; j++) {
      const s2 = pocket - 0.09 + j * 0.03 + (h(8, j) - 0.5) * 0.01;
      const o0 = coreO(s2) - 0.3;
      const r = span(s2) * (0.14 + 0.1 * h(9, j));
      const p0 = at(s2, o0), p2 = add(at(s2, o0 + r), d, -r * 0.9);
      ribbonPath(ctx, [p0, mix(p0, p2, 0.5), p2], (t) => 0.8 * (1 - t) + 0.04);
    }
  }
  // lit contour: a hairline that swells where bone presses the skin, broken mid-span
  {
    const bonyAt = kind === 'fore' ? [[0.02, 0.07, 1.7], [0.13, 0.08, 0.6], [0.9, 0.05, 1.5]] : [[0.1, 0.1, 0.9], [0.95, 0.06, 1.8]];
    let run = [];
    const flush = () => { if (run.length > 1) { const r = run; ribbonPath(ctx, r.map((q) => q[0]), (t, j) => r[j][1]); } run = []; };
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      let w = 0.32 + 0.3 * h(10, i);
      for (const [c, r, a] of bonyAt) w += a * g((s - c) / r);
      if (s > 0.3 && s < 0.8 && h(11, i) < 0.3) { flush(); continue; }
      run.push([add(lit[i], ln, -w * 0.45), w]);
    }
    flush();
  }
  // shadow contour: the core already sits on it; add a swelling outer lip so the
  // underside reads heaviest where the limb lifts off what is behind it
  {
    const pts = [];
    for (let i = 1; i < n; i++) pts.push(add(sh[i], ln, -0.35));
    ribbonPath(ctx, pts, (t) => 0.5 + 1.3 * Math.pow(Math.sin(Math.PI * t), 0.8));
  }
  // anatomy landmarks: single tapered pen strokes
  if (kind === 'fore') {
    // the groove between radius and ulna, diving under the muscle near the elbow and
    // surfacing toward the lit side at the wrist
    const pts = [];
    for (let j = 0; j <= 8; j++) {
      const s = 0.16 + j * 0.085;
      const w = wAt(s);
      pts.push(at(s, w[0] - (w[0] + w[1]) * (0.5 - 0.22 * (j / 8)) + 0.4 * Math.sin(j * 1.7 + seed)));
    }
    ribbonPath(ctx, spline(pts, 2), (t) => 0.1 + 1.25 * Math.pow(Math.sin(Math.PI * t), 1.3) * (1 - 0.35 * t));
    // brachioradialis edge, sweeping in from the lit contour below the elbow
    const b0 = at(0.04, wAt(0.04)[0] - 0.6), b2 = at(0.34, wAt(0.34)[0] - span(0.34) * 0.32);
    ribbonPath(ctx, quad(b0, add(mix(b0, b2, 0.5), ln, 1.2), b2, 5), (t) => 1.15 * Math.pow(1 - t, 0.8) + 0.05);
    // styloid knob: a hooked crescent on the lit side near the wrist
    const kc = at(0.9, wAt(0.9)[0] - 1.6);
    const arc = [];
    for (let j = 0; j <= 5; j++) { const th = Math.PI * (0.15 + j * 0.16); arc.push(add(add(kc, d, Math.cos(th) * 2.2), ln, -Math.sin(th) * 1.6)); }
    ribbonPath(ctx, arc, (t) => 0.9 * Math.sin(Math.PI * (0.08 + t * 0.84)) + 0.04);
  } else {
    // deltoid insertion: a V of two strokes meeting a third of the way down
    const v = at(0.4, wAt(0.4)[0] - span(0.4) * 0.42);
    const a1 = at(0.06, wAt(0.06)[0] - 0.8), a2 = at(0.08, -wAt(0.08)[1] + span(0.08) * 0.45);
    ribbonPath(ctx, quad(a1, add(mix(a1, v, 0.5), ln, 0.8), v, 5), (t) => 0.1 + 1.2 * Math.pow(t, 0.8));
    ribbonPath(ctx, quad(a2, add(mix(a2, v, 0.5), ln, -0.6), v, 5), (t) => 0.1 + 0.9 * Math.pow(t, 0.9));
    // the epicondyle crescent at the elbow
    const kc = at(0.93, wAt(0.93)[0] - 2);
    const arc = [];
    for (let j = 0; j <= 5; j++) { const th = Math.PI * (0.1 + j * 0.17); arc.push(add(add(kc, d, -Math.cos(th) * 2.6), ln, -Math.sin(th) * 1.9)); }
    ribbonPath(ctx, arc, (t) => 1.1 * Math.sin(Math.PI * (0.08 + t * 0.84)) + 0.04);
  }
  ctx.fill();

  // reflected light: a thin white sliver just inside the shadow contour
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  {
    const pts = [];
    for (let i = Math.round(n * 0.18); i <= Math.round(n * 0.8); i++) pts.push(add(sh[i], ln, 1.25 + 0.25 * Math.sin(i * 0.9)));
    ribbonPath(ctx, pts, (t) => 1.05 * Math.pow(Math.sin(Math.PI * t), 1.4) + 0.02);
  }
  ctx.fill();

  if (stain != null) inkStain(ctx, G, stain, seed, h);
  return G;
}

// The ink stain from `s0` to the wrist: a black sheath with a dry-brush top edge, form
// carved inside it in white.
function inkStain(ctx, G, s0, seed, h) {
  const { d, ln, L, lit, sh, n, at, wAt } = G;
  const i0 = Math.max(1, Math.floor(s0 * n));
  // the ragged edge: the stain line runs diagonally across the arm (higher on the lit
  // side, the way a dipped limb drains), with long thin tongues pointing back up
  const edgeS = (u) => s0 + 0.06 * (1 - u) - 0.03 + 0.02 * Math.sin(u * 9 + seed);
  ctx.fillStyle = INK;
  ctx.beginPath();
  {
    const top = [];
    const M = 8;
    for (let j = 0; j <= M; j++) {
      const u = j / M; // 0 = lit edge, 1 = shadow edge
      const s = edgeS(u);
      const w = wAt(s);
      top.push(at(s, w[0] - (w[0] + w[1]) * u));
    }
    const i1 = Math.ceil(edgeS(0) * n);
    const i2 = Math.ceil(edgeS(1) * n);
    const poly = top.slice();
    for (let i = i2; i <= n; i++) poly.push(add(sh[i], ln, -0.2));
    for (let i = n; i >= i1; i--) poly.push(add(lit[i], ln, 0.2));
    polyPath(ctx, poly);
    // tongues: dry-brush drags, uneven lengths, the longest along the shadow side
    for (let j = 0; j < 7; j++) {
      const u = (j + 0.3 + 0.4 * h(30, j)) / 7;
      const s = edgeS(u);
      const w = wAt(s);
      const base = at(s + 0.6 / L, w[0] - (w[0] + w[1]) * u);
      const len = (3 + 11 * h(31, j) * (0.5 + u)) * (j % 3 === 1 ? 0.5 : 1);
      const tip = add(add(base, d, -len), ln, (h(32, j) - 0.5) * 2);
      spikePath(ctx, base, tip, 1.2 + 1.6 * h(33, j), (h(34, j) - 0.5) * 1.5, 5);
    }
    // a few dry flecks above the edge
    for (let j = 0; j < 4; j++) {
      const s = edgeS(0.5) - (4 + 9 * h(35, j)) / L;
      const w = wAt(s);
      const c = at(s, w[0] - (w[0] + w[1]) * (0.2 + 0.6 * h(36, j)));
      const r = 0.45 + 0.5 * h(37, j);
      ctx.moveTo(c[0] + r, c[1]); ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  // white carving inside the stain
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  const sa = edgeS(0) + 0.05;
  // broken rim light inset from the lit contour, tapering at both ends of each run
  for (const [a, b] of [[sa, sa + (0.94 - sa) * 0.48], [sa + (0.94 - sa) * 0.58, 0.94]]) {
    const pts = [];
    for (let j = 0; j <= 6; j++) { const s = a + (b - a) * j / 6; pts.push(at(s, wAt(s)[0] - 1.0)); }
    ribbonPath(ctx, pts, (t) => 1.05 * Math.pow(Math.sin(Math.PI * t), 0.9) + 0.02);
  }
  // two tendon crescents converging on the wrist
  for (let k = 0; k < 2; k++) {
    const pts = [];
    const a = sa + 0.03 + k * 0.05;
    for (let j = 0; j <= 7; j++) {
      const s = a + (0.97 - a) * j / 7;
      const w = wAt(s);
      const f = (0.38 + k * 0.24) * (1 - 0.35 * (j / 7));
      pts.push(at(s, w[0] - (w[0] + w[1]) * f + 0.5 * Math.sin(j + seed + k)));
    }
    ribbonPath(ctx, pts, (t) => (1.15 - k * 0.3) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.8) * (1 - 0.4 * t) + 0.02);
  }
  // short white wrap ticks curling in from the lit edge (the hatch, reversed)
  {
    let s = sa;
    let k = 0;
    while (s < 0.9) {
      k++;
      s += (2.2 + 2.4 * h(40, k)) / L;
      if (h(41, k) < 0.25) continue;
      const w = wAt(s);
      const sp = w[0] + w[1];
      const p0 = at(s, w[0] - 0.9);
      const r = sp * (0.18 + 0.2 * h(42, k));
      const p2 = add(at(s, w[0] - 0.9 - r), d, r * 0.5);
      ribbonPath(ctx, quad(p0, add(at(s, w[0] - 0.9 - r * 0.5), d, r * 0.08), p2, 3), (t) => 0.75 * Math.pow(1 - t, 0.7) + 0.03);
    }
  }
  ctx.fill();
}

// Olecranon: a hooked bone spur on the outside of the elbow, pale, with a pen contour
// heavy on its shadow side; drawn before the forearm so the forearm overlaps its root.
export function olecranon(ctx, elbow, out, fd, { far = false, seed = 1 } = {}) {
  const base = add(elbow, out, 2);
  const tip = add(add(elbow, out, 12), fd, -6);
  const bend = 2.6;
  ctx.fillStyle = PAPER; ctx.beginPath(); spikePath(ctx, add(base, out, -3), add(tip, out, 2.2), 12, bend); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); spikePath(ctx, add(base, out, -2), tip, 9, bend); ctx.fill();
  if (far) return;
  // a white rim along its lit flank, tapering out before the point
  const lsd = dot([-out[1], out[0]], LIGHT) > 0 ? 1 : -1;
  const nl = [-out[1] * lsd, out[0] * lsd];
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ribbonPath(ctx, [add(mix(base, tip, 0.15), nl, 2.2), add(mix(base, tip, 0.5), nl, 1.6), add(mix(base, tip, 0.8), nl, 0.6)], (t) => 1.0 * Math.sin(Math.PI * (0.1 + 0.9 * t)) + 0.02);
  ctx.fill();
  void seed; void BONE_FAR;
}
