// Round 13: the Scrivener's arms and hands painted as BLACK masses carved in white, the
// way Obata inks a death-god's limb (ref 07): one solid black shape whose silhouette
// swells on the shadow underside and is shaved to a hairline on the lit top by a white
// rim line, its bone and muscle given by two or three long white lines that taper at
// both ends and follow the form. No tick hatching, no barbs, no bindings.
// Hands: a black back-of-hand with knuckle crescents, four separate fingers each ringed
// in paper, each ending in a long hooked talon with a white rim highlight and a needle tip.
// Owner: art. Frames as in parts.js (limb pivot = proximal joint, bone runs down +y,
// +x = front/lit side; hand: wrist (0,0), the hand runs down +y).

import {
  INK, PAPER, rng, lerp, clamp, add, mix, norm, spline, resample, arcLen,
  stroke, carve, mass, contourLine, spike,
} from './brush.js';
import { featherEdge, litPlane, knuckleHatch } from './feather.js';
import { paleBody, paleKnob } from './palelimb.js';
import { boneUpper, boneFore } from './bonearm.js';

// round 20: the limbs are drawn pale (contour + shadow shape + wrapping hatch), not
// filled black and carved; the old black-limb painters stay behind this switch
export const PALE = true;

const L_LIMB = norm([0.8, -0.6]);
const BONE_C = '#ece6d4';

// sample a polyline by arc-length fraction
function along(pts) {
  const P = resample(spline(pts, 10), 0.25);
  const n = P.length;
  return (s) => {
    const f = clamp(s, 0, 1) * (n - 1), i = Math.floor(f), k = f - i;
    const a = P[i], b = P[Math.min(n - 1, i + 1)];
    return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  };
}

// a line carved just inside an edge: `edge` and `other` are the two contours (top->bottom),
// inset `ins` units from `edge` toward `other`, between s0 and s1
function insetLine(edge, other, s0, s1, ins, n = 12, wobble = 0) {
  const E = along(edge), O = along(other);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const s = lerp(s0, s1, i / n);
    const e = E(s), o = O(s);
    const d = norm([o[0] - e[0], o[1] - e[1]]);
    out.push(add(e, d, ins + wobble * Math.sin(i * 1.3)));
  }
  return out;
}

const LINE = { tin: 0.32, tout: 0.42, pin: 1.1, pout: 1.5, swell: 0.08, wob: 0.12, tooth: 0.04 };

/**
 * inkLimb: a black limb. front/back = edge polylines (top -> bottom), front is lit.
 *  rims:  [[s0, s1, inset, w], ...] white rim light inside the lit edge (broken runs)
 *  refl:  [[s0, s1, inset, w], ...] reflected-light hairlines inside the shadow edge
 *  lines: [{ pts, w }] long form lines (muscle grooves, bone ridges), tapered both ends
 */
export function inkLimb(g, front, back, o = {}) {
  const { seed = 1, rims = [], refl = [], lines = [], far = false, swell = 2.6, extra = null, feather = null } = o;
  const outline = front.concat(back.slice().reverse());
  // round 19: the paper gap that lifts the limb off the black behind it is DRAWN: a
  // ribbon of paper along each edge that swells over a belly or a knob and pinches to
  // nothing where the form turns away (wide on the lit side, a sliver on the shadow side)
  if (o.gap) {
    const [gf, gb] = o.gap;
    const wave = (k, ph) => (t) => Math.max(0.05, 0.55 + 0.45 * Math.sin(t * k + ph) * Math.sin(t * k * 0.43 + ph * 1.7 + 1));
    stroke(g, front, { w: gf * 2, tin: 0.08, tout: 0.08, pin: 1, pout: 1, swell: 0, wob: 0, tooth: 0, color: PAPER, seed: seed + 97, press: wave(9.5, seed * 0.37) });
    stroke(g, back, { w: gb * 2, tin: 0.1, tout: 0.1, pin: 1, pout: 1, swell: 0, wob: 0, tooth: 0, color: PAPER, seed: seed + 98, press: wave(7.3, seed * 0.61) });
  }
  mass(g, outline, { color: INK, rough: 0.22, seed });
  if (extra) extra(g);
  // the silhouette swells on the shadow side (an ink contour that only exists there)
  contourLine(g, outline, { closed: true, side: 1, light: L_LIMB, wMin: 0, wMax: swell, seed: seed + 5, breaks: 0.05 });
  const k = far ? 0.85 : 1; // round 13: the far arm reaches across open paper in idle, so it is carved too
  // round 15: the lit edge is not a vector boundary: the black breaks into the paper
  // through a band of short tapered cross-contour hatching (featherEdge)
  if (feather) (Array.isArray(feather) ? feather : [feather]).forEach((f, i) => litPlane(g, front, { side: 1, seed: seed + 90 + i * 7, ...f }));
  rims.forEach(([s0, s1, ins, w], i) => carve(g, insetLine(front, back, s0, s1, ins, 14, 0.12), { ...LINE, w: w * k, seed: seed + 20 + i }));
  refl.forEach(([s0, s1, ins, w], i) => carve(g, insetLine(back, front, s0, s1, ins, 12, 0.1), { ...LINE, w: w * k, seed: seed + 30 + i, tin: 0.4, tout: 0.4 }));
  lines.forEach((ln, i) => { carve(g, ln.pts, { ...LINE, w: ln.w * k, seed: seed + 40 + i, ...(ln.o || {}) }); });
}

// ---- round 14: the arm is DRAWN, not filled ----------------------------------------------
// A limb axis sampler (centre, direction, half-width) from the two edges, used to lay
// white cross-contours that start at the lit edge and wrap round the volume, dying out
// before the shadow side (ref 07: white lines carved along the curve of the forearm),
// and a row of short white ticks riding just inside the lit rim.
function axisOf(front, back) {
  const F = along(front), B = along(back);
  return (s) => {
    const f = F(s), b = B(s);
    const f2 = F(Math.min(1, s + 0.01)), b2 = B(Math.min(1, s + 0.01)), f1 = F(Math.max(0, s - 0.01)), b1 = B(Math.max(0, s - 0.01));
    const d = norm([(f2[0] + b2[0]) / 2 - (f1[0] + b1[0]) / 2, (f2[1] + b2[1]) / 2 - (f1[1] + b1[1]) / 2]);
    return { p: mix(f, b, 0.5), d, r: Math.hypot(f[0] - b[0], f[1] - b[1]) / 2, f, b };
  };
}
// cross-contours: each starts ON the lit edge (inset `ins`) and bows round the cylinder
// toward the shadow edge for `reach` of the way, tapering to a hair; uneven length/weight
function wrapCarves(g, front, back, { s0, s1, step, reach = 0.55, w = 0.8, bow = 0.45, seed = 1, ins = 0.9 }) {
  const ax = axisOf(front, back);
  const r = rng(seed);
  const n = Math.max(1, Math.round((s1 - s0) / step));
  for (let i = 0; i <= n; i++) {
    const s = lerp(s0, s1, (i + (r() - 0.5) * 0.5) / n);
    const A = ax(clamp(s, 0, 1));
    const toB = norm([A.b[0] - A.f[0], A.b[1] - A.f[1]]);
    const rr = reach * (0.55 + r() * 0.7) * (0.8 + 0.4 * Math.sin(s * 17 + seed));
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const u = (k / 6) * rr; // 0 at the lit edge -> rr across
      const across = ins + u * (A.r * 2 - ins * 2);
      const alongK = Math.sin(u * Math.PI) * A.r * bow;
      pts.push(add(add(A.f, toB, across), A.d, alongK));
    }
    carve(g, pts, { w: w * (0.6 + r() * 0.7), tin: 0.05, tout: 0.85, pin: 0.7, pout: 1.4, swell: 0.05, wob: 0.05, tooth: 0.03, seed: seed + i * 3 });
  }
}
// a segment crease at a joint: a white ring drawn as a bowed ellipse arc across the
// limb, heavy on the lit half and breaking before the shadow contour, plus a second
// thinner echo just below it (the skin folding over the knuckle of the joint)
function jointCrease(g, front, back, s, { w = 1.1, bow = 0.5, seed = 1, echo = 0.035 } = {}) {
  const ax = axisOf(front, back);
  [[s, w, 0.92], [s + echo, w * 0.55, 0.6]].forEach(([ss, ww, reach], j) => {
    const A = ax(clamp(ss, 0, 1));
    const toB = norm([A.b[0] - A.f[0], A.b[1] - A.f[1]]);
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const u = (k / 8) * reach;
      pts.push(add(add(A.f, toB, 0.6 + u * (A.r * 2 - 1.2)), A.d, Math.sin(u * Math.PI) * A.r * bow));
    }
    carve(g, pts, { w: ww, tin: 0.08, tout: 0.7, pin: 0.8, pout: 1.3, swell: 0.1, wob: 0.05, seed: seed + j });
  });
}
// pale knobs of bone breaking the black at a joint: separate small closed shapes, each
// ringed in ink with a shade crescent and one dot of shine
function knobs(g, list, seed = 1) {
  list.forEach(([c, rx, ry, rot], i) => {
    g.save();
    g.translate(c[0], c[1]); g.rotate(rot);
    g.fillStyle = INK; g.beginPath(); g.ellipse(0, 0, rx + 0.7, ry + 0.7, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = PAPER; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = INK; g.beginPath(); g.ellipse(rx * 0.12, ry * 0.25, rx * 0.85, ry * 0.7, 0, 0.1, Math.PI - 0.1); g.fill();
    g.fillStyle = PAPER; g.beginPath(); g.arc(-rx * 0.3, -ry * 0.35, Math.max(0.35, Math.min(rx, ry) * 0.3), 0, Math.PI * 2); g.fill();
    g.restore();
  });
}

// round 19: a carve that SWEEPS across the limb the way Obata's white lines wrap Ryuk's
// forearm (ref 07): `path` is [[s, u], ...] with s along the limb (0 top .. 1 bottom) and
// u across it (-1 on the shadow edge .. +1 on the lit edge); it is drawn as one tapered
// stroke, optionally with a row of short dashes riding beside it (the form turning)
function sweep(g, front, back, path, o = {}) {
  const ax = axisOf(front, back);
  const at = ([s, u]) => { const A = ax(clamp(s, 0, 1)); return mix(A.b, A.f, (clamp(u, -0.97, 0.97) + 1) / 2); };
  const pts = spline(path.map(at), 6);
  carve(g, pts, { ...LINE, tin: 0.14, tout: 0.55, pin: 0.8, pout: 1.7, swell: 0.3, ...o });
  if (o.dash) {
    const [off, n, dw] = o.dash;
    const P = resample(pts, 0.3), L = P.length;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(L * (0.2 + 0.6 * (i + 0.5) / n));
      const a = P[Math.max(0, k - 2)], b = P[Math.min(L - 1, k + 2)];
      const t = norm([b[0] - a[0], b[1] - a[1]]), nn = [-t[1], t[0]];
      const c = add(P[k], nn, off);
      carve(g, [add(c, t, -1.1), add(c, t, 1.1)], { w: dw * (0.7 + 0.3 * Math.sin(i * 2.1)), tin: 0.3, tout: 0.4, swell: 0, wob: 0, seed: (o.seed || 1) + 300 + i });
    }
  }
}

// ---- upper arm: shoulder (0,0) -> elbow (0,86), under a torn black sleeve -------------
// round 14: a heavier arm (biceps and triceps bellies ~1.4x the old width) that pinches
// hard into a segmented elbow, so its width swings from 28 to 13 units, never a rod
export function inkUpperArm(far) {
  return (g) => {
    const seed = far ? 531 : 511;
    // round 21 (pale): the belly of the arm, then a hard pinch above the elbow (13 wide)
    // and the condyles flaring the joint again (~21)
    const front = PALE
      ? [[7.4, 20], [10.8, 30], [12.8, 41], [12.0, 51], [9.4, 60], [6.6, 68], [5.6, 74.5], [7.0, 80.5], [9.0, 86.5], [8.2, 91.5], [5.4, 95.5]]
      : [[7.4, 20], [10.8, 30], [12.4, 41], [11.2, 53], [8.2, 64], [6.2, 73], [7.0, 80], [8.6, 87], [5.4, 95]];
    const back = PALE
      ? [[-9.4, 20], [-13.8, 30], [-16.2, 42], [-15.2, 53], [-12.0, 62], [-8.2, 69.5], [-7.0, 75], [-9.6, 81], [-12.2, 86.5], [-11.4, 91.5], [-5.0, 96]]
      : [[-9.4, 20], [-13.4, 30], [-15.8, 43], [-14.6, 56], [-11.0, 66], [-7.4, 74], [-8.8, 82], [-10.2, 88], [-5.0, 96]];
    if (PALE) boneUpper(g, far, seed); // round 22: gaunt, segmented bone
    else {
    inkLimb(g, front, back, {
      seed, far, swell: 3.6, gap: far ? [1.6, 0.6] : [2.4, 0.9],
      // round 17: a black mass DRAWN by two long carved lines and one bone crescent, with
      // one short band of feathered hatch on the lit round of the biceps only and a
      // crosshatched pocket in the crook of the elbow: no full-length hatch fringe
      // round 18: UNEVEN carving. The lit edge only gets hairline rims broken into short
      // runs; the weight goes into a few long carves on the shadow side
      rims: [[0.5, 0.6, 1.1, 0.95], [0.67, 0.71, 0.9, 0.7]],
      feather: {
          s0: 0.2, s1: 0.62, step: 3.4, w: 2.2, contour: 0.85, bow: 0.3, fade: 0.25,
          depthFn: (s) => 2.5 + 5.5 * Math.exp(-Math.pow((s - 0.4) / 0.11, 2)),
        },
      lines: [
        // the groove between biceps and triceps, then the tendon dropping into the elbow
        { pts: [[-1.6, 26], [2.4, 40], [1.8, 50]], w: 1.4, o: { swell: 0.1 } },
        { pts: [[0.6, 57], [-1.4, 66], [-3.4, 78]], w: 0.7 },
        // the triceps' lower crescent swinging round the back of the arm
        { pts: [[-11.4, 22], [-13.2, 34], [-11.6, 48], [-7.8, 59], [-4.8, 67]], w: 3.2, o: { tin: 0.15, tout: 0.6, pin: 0.9, pout: 1.7, swell: 0.4 } },
        // the elbow: a crescent rolling round the back knob
        { pts: [[-4.2, 80.5], [-8.6, 84.5], [-8.0, 91]], w: 1.3 },
      ],
    });
    {
      // two long carves sweep diagonally ROUND the arm: off the lit edge over the
      // biceps, across the belly and down into the shadow at the elbow; one shorter
      // and thinner wraps the triceps the other way
      sweep(g, front, back, [[0.16, 0.85], [0.3, 0.35], [0.48, -0.25], [0.66, -0.7], [0.76, -0.9]], { w: 2.6 * (far ? 0.8 : 1), seed: seed + 400, dash: far ? null : [-3.2, 4, 0.9] });
      sweep(g, front, back, [[0.52, 0.9], [0.6, 0.45], [0.7, 0.05]], { w: 1.2, seed: seed + 410 });
      jointCrease(g, front, back, 0.3, { w: 1.7, bow: 0.7, seed: seed + 360, echo: 0.07 });
      if (!far) litPlane(g, front, { side: 1, s0: 0.74, s1: 0.86, step: 1.8, w: 1.2, contour: 0.6, fade: 0.3, seed: seed + 340, depthFn: () => 3.2, pockets: [[0.76, 0.84, 1]], slits: 0 });
      // round 19: the elbow is BONE: the humerus' condyle pushes a pale knob through the
      // black at the back of the joint, a smaller one beside it, a crease ring wrapping
      // the joint above, so the segment ends in a joint and not a tube's round cap
      jointCrease(g, front, back, 0.82, { w: 1.3, bow: 0.55, seed: seed + 380, echo: 0.04 });
      knobs(g, [[[-8.4, 86.0], 4.6, 3.2, 0.75], [[-2.6, 90.8], 2.4, 1.7, 0.4]], seed + 330);
    }
    }
    // the sleeve: a black bell from the shoulder, its hem torn into long dry tatters
    const sl = [[-13, -9], [-5, -12.5], [8, -11.5], [13, -4], [14.5, 10], [15.5, 26], [16.5, 33], [9, 36.5], [1, 33.5], [-8, 39], [-16.5, 36], [-16.5, 22], [-14.5, 6]];
    mass(g, sl, { rough: 0.35, seed: seed + 40 });
    const r = rng(seed + 41);
    const hem = [[15.5, 32], [12, 35], [8, 35.5], [4, 34.5], [-1, 34], [-4.5, 37], [-8, 38.5], [-12, 39], [-16, 36]];
    hem.forEach((p, i) => {
      const back = i > 4;
      const L = (back ? 12 : 3) + r() * (back ? 26 : 12) * (i % 3 === 1 ? 1.4 : 0.8);
      const x = back ? -2.5 - r() * 3 : -0.5 + r();
      stroke(g, [add(p, [0, -4]), add(p, [x * 0.4, L * 0.5]), add(p, [x, L])], { w: 1.8 + r() * 3.4, tin: 0, tout: 0.95, pout: 1.8, dry: 0.4 + r() * 0.3, edgeDry: 0.45, seed: seed + 60 + i, swell: 0 });
    });
    // round 19: the shoulder cap turns into the light: the lit round of the sleeve is a
    // paper plane the black breaks into through short curved hatch, wrapping the deltoid
    if (!far) {
      litPlane(g, [[-4, -12.2], [3, -12.4], [8, -11.5], [12, -6], [14.2, 2], [15.0, 12], [15.6, 22]], { side: 0, inside: [0, 12], step: 2.3, w: 1.6, contour: 0.8, bow: 0.4, seed: seed + 140, fade: 0.22, slits: 0.4,
        depthFn: (q) => 2 + 6.5 * Math.exp(-Math.pow((q - 0.38) / 0.2, 2)), pockets: [[0.6, 0.78, 0.9]] });
    }
    // the hem lifts off the arm: one white hairline under its lip
    carve(g, [[13.5, 35.6], [7.5, 38], [1.5, 36.4], [-4, 39.4]], { ...LINE, w: 0.8, seed: seed + 69 });
    // folds: long, tapering both ends, bowing round the arm and converging on the shoulder,
    // with short returns breaking off them where the cloth buckles
    const folds = [[-10, -4, -15, 33, 1.0], [-4.5, -8, -7, 34, 2.2], [4, -7, 5.5, 31, 1.4]];
    folds.forEach(([x0, y0, x1, y1, w], i) => {
      const a = [x0, y0], e = [x1, y1];
      const m = add(mix(a, e, 0.5), [1, 0], 2.4 - i * 0.55);
      carve(g, [a, mix(a, m, 0.5), m, mix(m, e, 0.5), e], { ...LINE, w: w * (far ? 0.7 : 1), seed: seed + 70 + i });
      if (!far && i % 2) carve(g, [mix(m, e, 0.3), add(mix(m, e, 0.55), [2.6, 1.5]), add(mix(m, e, 0.8), [3.4, 4])], { ...LINE, w: w * 0.5, seed: seed + 80 + i });
    });
  };
}

// ---- forearm: elbow (0,0) -> wrist (0,106) ---------------------------------------------
export function inkForeArm(far) {
  return (g) => {
    const seed = far ? 537 : 517;
    // round 14: the flexor belly swells the shadow underside to ~27 units high up; the lit
    // top runs long and lean over the ulna; both fall into a wrist of 11 (it tapers 2.5x)
    // round 21 (pale): a gaunt forearm that is CARVED from bone, not a tube: on the back
    // the olecranon knob bulges out and pinches hard under it before the flexor belly
    // swells (widest ~30 at y 22); on the front the brachioradialis rises sharply out of
    // the crook and falls away concave; both run lean down the ulna into a wrist of ~9
    // (a 3.3x taper), where the ulna head and the carpals swell the edge again
    const front = PALE
      ? [[4.0, -6], [7.4, -1.6], [11.2, 5], [13.8, 12.5], [14.2, 19], [12.9, 27], [10.4, 37], [8.3, 48], [6.8, 60], [5.6, 72], [4.4, 83], [3.4, 90.5], [4.2, 95.5], [5.8, 100.5], [4.4, 108]]
      : [[4.6, -4], [9.2, 4], [11.8, 14], [11.8, 26], [10.0, 40], [8.0, 54], [6.4, 68], [5.2, 82], [4.6, 93], [5.8, 100], [4.0, 108]];
    const back = PALE
      ? [[-6.0, -7], [-10.8, -4.6], [-14.0, -0.2], [-13.6, 4.6], [-11.4, 8.4], [-13.6, 14], [-15.8, 22], [-15.4, 32], [-13.2, 43], [-11.0, 54], [-9.4, 65], [-8.0, 76], [-6.6, 85.5], [-5.3, 91], [-7.6, 95.6], [-8.4, 100.4], [-5.0, 108]]
      : [[-6.6, -6], [-12.2, 4], [-15.8, 16], [-16.0, 28], [-13.4, 42], [-10.2, 57], [-7.8, 71], [-6.4, 85], [-6.8, 95], [-8.0, 101], [-4.6, 108]];
    if (PALE) boneFore(g, far, seed); // round 22: gaunt, segmented bone
    else {
    inkLimb(g, front, back, {
      seed, far, swell: 3.8, gap: far ? [1.6, 0.6] : [2.4, 0.9],
      // round 17: one short feathered band over the extensor belly's lit round, a
      // crosshatched pocket at the crook of the elbow, the rest of the lit edge a clean
      // carved rim
      feather: {
          s0: 0.0, s1: 0.46, step: 3.4, w: 2.2, contour: 0.85, bow: 0.32, fade: 0.2,
          depthFn: (s) => 2.5 + 6 * Math.exp(-Math.pow((s - 0.24) / 0.12, 2)),
          pockets: [[0.0, 0.08, 1]],
        },
      // the olecranon: one hooked point off the back of the elbow, part of the mass
      extra: (h) => spike(h, [-4, 3], [-17, -13], 11, { bend: 0.1, seed: seed + 3, pout: 2 }),
      rims: [[0.5, 0.6, 1.2, 1.0], [0.7, 0.74, 1.0, 0.7]],
      lines: [
        // the long twisting groove between the flexors and the extensors: elbow to wrist
        { pts: [[-5.6, 5], [-4.2, 19], [-1.0, 36], [0.8, 50]], w: 1.8, o: { tin: 0.25, tout: 0.5, swell: 0.2 } },
        // round 19: two TENDONS run out of the bellies and taper into the wrist, the lit
        // one longer and heavier; they converge on the carpal knob
        { pts: [[2.6, 54], [2.8, 68], [2.0, 82], [0.4, 96]], w: 1.7, o: { tin: 0.12, tout: 0.7, pout: 1.8, swell: 0.3, press: (t) => 1.2 - 0.6 * t } },
        { pts: [[-4.4, 70], [-4.0, 82], [-3.0, 94]], w: 1.15, o: { tin: 0.15, tout: 0.7, pout: 1.6 } },
        // the lower edge of the flexor belly, a crescent under the bulge
        { pts: [[-10.4, 6], [-13.2, 18], [-12.6, 32], [-9.4, 47], [-6.6, 62], [-5.0, 76]], w: 3.4, o: { tin: 0.14, tout: 0.62, pin: 0.9, pout: 1.7, swell: 0.4 } },
        // the olecranon's lit edge
        { pts: [[-5.2, -1], [-10.4, -6.5], [-15.0, -11.5]], w: 1.0, o: { tin: 0.2, tout: 0.75 } },
        // the head of the ulna at the wrist
        { pts: [[-3.6, 96.5], [-6.0, 99.6], [-5.6, 104.2]], w: 0.85 },
      ],
    });
    {
      // the wrist is a joint: a crease ring and the carpal knobs pushing through the skin
      jointCrease(g, front, back, 0.88, { w: 1.0, seed: seed + 320, echo: 0.03 });
      // round 17: two bold crescents carved ACROSS the flexor belly, wrapping its round
      // (ref 07: white lines that curve round the volume, not along it)
      jointCrease(g, front, back, 0.13, { w: 1.9, bow: 0.75, seed: seed + 360, echo: 0.06 });
      // round 19: the carving wraps the forearm as a spiral (ref 07): a long heavy carve
      // from the lit top of the extensors down across the belly into the shadow, a
      // second, thinner, running parallel lower down, a short hook on the lit side
      sweep(g, front, back, [[0.2, 0.9], [0.3, 0.4], [0.44, -0.2], [0.6, -0.6], [0.72, -0.8]], { w: 2.4 * (far ? 0.8 : 1), seed: seed + 420, dash: far ? null : [3.0, 4, 0.85] });
      sweep(g, front, back, [[0.5, 0.92], [0.6, 0.45], [0.7, 0.0], [0.78, -0.3]], { w: 1.25, seed: seed + 430 });
      if (!far) sweep(g, front, back, [[0.33, 0.95], [0.38, 0.7]], { w: 1.4, seed: seed + 440, tout: 0.8 });
      // round 19: bone at both ends: the olecranon's pale point under its spur, the head of
      // the ulna and a carpal knob at the wrist, each a separate ringed shape
      knobs(g, [[[-8.6, -3.4], 4.4, 3.0, -0.7], [[-6.6, 99.2], 3.4, 2.4, 0.6], [[3.0, 102.5], 2.0, 1.4, 0.2]], seed + 330);
    }
    }
  };
}

// ---- round 20: the pale (drawn) arm segments -------------------------------------------
// upper arm: shoulder (0,0) -> elbow (0,86); the sleeve hides it down to y ~ 36
function paleUpper(g, front, back, far, seed) {
  const S = (y) => (y - 20) / 76;
  const G = (s, m, w) => Math.exp(-Math.pow((s - m) / w, 2));
  paleBody(g, front, back, {
    seed, far, wMax: 3.1, coreMax: 0.6,
    // round 21: the shadow is half the arm under the triceps' belly, pinches to a third
    // above the elbow and opens to half again over the condyles
    coreFn: (s) => 0.27 + 0.22 * G(s, S(44), 0.17) + 0.22 * G(s, S(86), 0.09),
    feather: 0.5,
    pockets: [[S(33), S(42), 0.55], [S(78), S(90), 0.45]],
    crook: far ? [] : [[S(73), S(88), 0.32]],
    lit: far ? [] : [{ s0: S(40), s1: S(56), n: 5, len: 0.28, w: 0.85 }, { s0: S(62), s1: S(70), n: 3, len: 0.18, w: 0.7 }],
    grooves: [
      // the groove between biceps and triceps, then the tendon dropping into the elbow
      { pts: [[-1.8, 34], [1.4, 43], [2.0, 52], [1.0, 59]], w: 1.3, o: { swell: 0.3 } },
      { pts: [[0.4, 62], [-0.6, 70], [-1.6, 77]], w: 0.85 },
      // the crease where the arm folds into the elbow
      { pts: [[8.4, 80.5], [4.6, 83.4], [0.2, 83.0]], w: 1.2, o: { tin: 0.12, tout: 0.65, swell: 0.3 } },
    ],
    carves: [
      // the triceps' lower edge, a crescent carved across the shadow
      { pts: [[-4.2, 52], [-8.2, 56.4], [-12.4, 58.4], [-14.0, 57.6]], w: 1.3, o: { tin: 0.2, tout: 0.5 } },
      // the humerus' ridge catching reflected light down the back of the arm
      { pts: [[-11.6, 34], [-12.8, 45], [-10.8, 58], [-7.6, 68], [-6.4, 75]], w: 1.1, o: { tin: 0.2, tout: 0.6, press: (t) => 0.7 + 0.6 * Math.sin(Math.PI * t) } },
      // the rim of the condyle at the back of the joint
      { pts: [[-4.6, 79.6], [-8.6, 80.8], [-10.8, 84.6], [-10.2, 89]], w: 1.0, o: { tout: 0.6 } },
    ],
  });
  paleKnob(g, [-8.6, 86.4], 3.8, 2.8, 0.75, seed + 330);
  paleKnob(g, [5.2, 88.0], 2.0, 1.5, 0.3, seed + 335);
}

// forearm: elbow (0,0) -> wrist (0,106)
// round 21: the black shadow is a SHAPE (half the arm under the belly and at the elbow,
// a third down the lean ulna, gathering again over the wrist bones) carved by white:
// the ulna ridge catching reflected light, a crescent under the belly, the rim of the
// olecranon. Ink on the lit side: the groove between the muscle groups, three tendons
// running into the wrist, the elbow crease with crosshatch in the crook.
const G = (s, m, w) => Math.exp(-Math.pow((s - m) / w, 2));
function paleFore(g, front, back, far, seed) {
  const S = (y) => (y + 7) / 115;
  paleBody(g, front, back, {
    seed, far, wMax: 3.2, coreMax: 0.6,
    coreFn: (s) => 0.27 + 0.24 * G(s, 0.04, 0.07) + 0.25 * G(s, 0.27, 0.12) + 0.06 * G(s, 0.5, 0.1) + 0.18 * G(s, 0.94, 0.05),
    feather: 0.46,
    pockets: [[0.0, S(10), 0.55], [S(86), S(98), 0.45]],
    crook: far ? [] : [[S(-4), S(9), 0.34]],
    lit: far ? [] : [{ s0: S(13), s1: S(30), n: 6, len: 0.3, w: 0.85 }, { s0: S(38), s1: S(50), n: 4, len: 0.22, w: 0.75 }, { s0: S(62), s1: S(72), n: 3, len: 0.16, w: 0.65 }],
    extra: (h) => spike(h, [-6, 1], [-18, -14], 9, { bend: 0.12, seed: seed + 3, pout: 2 }),
    grooves: [
      // the elbow crease, out of the crook
      { pts: [[11.0, 4.6], [7.4, 6.8], [3.0, 6.4], [-0.6, 4.0]], w: 1.35, o: { tin: 0.12, tout: 0.6, swell: 0.3 } },
      // the groove between the flexors and the extensors, twisting down the arm
      { pts: [[-1.2, 9], [1.2, 20], [3.2, 33], [3.6, 46]], w: 1.4, o: { swell: 0.3, tout: 0.65 } },
      // the brachioradialis' front belly, a short groove under its swell
      { pts: [[12.4, 17], [10.4, 25], [7.6, 33]], w: 0.9, o: { tin: 0.2, tout: 0.7 } },
      // three tendons running out of the bellies into the wrist, the lit one longest
      { pts: [[3.6, 56], [3.4, 68], [2.6, 80], [1.4, 91]], w: 1.05, o: { tin: 0.18, tout: 0.6, press: (t) => 1.15 - 0.4 * t } },
      { pts: [[0.6, 63], [0.4, 75], [-0.2, 86], [-0.6, 92]], w: 0.8, o: { tin: 0.2, tout: 0.6 } },
      // the wrist crease and the carpal knuckle under it
      { pts: [[3.8, 92.4], [1.0, 94.6], [-3.2, 94.2]], w: 1.05, o: { tin: 0.12, tout: 0.55 } },
      { pts: [[5.6, 99.6], [3.2, 101.6], [0.4, 101.2]], w: 0.8, o: { tin: 0.2, tout: 0.6 } },
    ],
    carves: [
      // the rim of the olecranon knob inside the black
      { pts: [[-4.2, -3.6], [-8.6, -3.0], [-11.4, 0.2], [-11.0, 4.0]], w: 1.15, o: { tout: 0.6 } },
      // the ulna ridge: a long reflected-light line from under the elbow to the ulna head
      { pts: [[-10.2, 10], [-12.0, 21], [-11.6, 33], [-10.0, 45], [-8.4, 58], [-7.2, 71], [-6.2, 82]], w: 1.25, o: { tin: 0.18, tout: 0.6, press: (t) => 0.7 + 0.6 * Math.sin(Math.PI * t) } },
      // the lower edge of the flexor belly: a crescent carved ACROSS the shadow
      { pts: [[-2.0, 31], [-5.6, 35.4], [-10.0, 38.4], [-12.6, 39.2]], w: 1.35, o: { tin: 0.2, tout: 0.5 } },
      { pts: [[-3.2, 15], [-6.4, 18.6], [-9.6, 21.2]], w: 0.85, o: { tin: 0.3, tout: 0.6 } },
      // the third tendon, deep in the shadow over the ulna
      { pts: [[-4.4, 70], [-4.2, 80], [-3.6, 89]], w: 0.75, o: { tin: 0.25, tout: 0.6 } },
    ],
  });
  // bone through the skin at both ends: the olecranon knuckle and the ulna head, a carpal
  paleKnob(g, [-10.2, 0.6], 3.6, 2.6, 0.9, seed + 340);
  paleKnob(g, [-6.6, 98.0], 2.8, 2.1, 0.6, seed + 330);
  paleKnob(g, [3.6, 103.0], 1.7, 1.2, 0.2, seed + 335);
}

// ---- hands -------------------------------------------------------------------------------

// one finger: a paper ring, then a black tapered finger swelling at its knuckles, then a
// long hooked talon with a needle tip and a white rim along its outer curve
export function inkFinger(g, J, w, talon, seed, far) {
  const [base, ang, L, hook] = talon;
  const d = [Math.cos(ang), Math.sin(ang)], n = [-d[1], d[0]];
  // round 21: the talon curls (its heading turns faster toward the point), not a spike
  const curl = hook * 0.2;
  const T = [add(base, d, -1.5)];
  for (let k = 1, q = T[0]; k <= 10; k++) {
    const a = ang + curl * Math.pow(k / 10, 1.6);
    q = add(q, [Math.cos(a), Math.sin(a)], (L + 1.5) / 10);
    T.push(q);
  }
  // paper ring (finger + talon) so each finger stays separate on black
  if (!far) {
    stroke(g, J, { w: w[0] * 2 + 2.6, tin: 0.05, tout: 0, swell: 0, wob: 0, color: PAPER, seed, tooth: 0 });
    stroke(g, T, { w: w[2] * 2.2 + 2.4, tin: 0, tout: 0.98, pout: 1.2, swell: 0, wob: 0, color: PAPER, seed: seed + 1, tooth: 0 });
  }
  stroke(g, J, { w: w[0] * 2, tin: 0, tout: 0, swell: 0.1, wob: 0.1, seed: seed + 2, press: (t) => lerp(1, w[2] / w[0], t) * (1 + 0.22 * Math.exp(-Math.pow((t - 0.36) / 0.06, 2)) + 0.18 * Math.exp(-Math.pow((t - 0.7) / 0.06, 2))) });
  stroke(g, T, { w: w[2] * 2.1, tin: 0, tout: 0.97, pout: 2.2, swell: 0, wob: 0.05, seed: seed + 3, tooth: 0.03 });
  if (far) return;
  // the talon's rim highlight on its outer (convex) curve, dying before the needle tip
  const side = hook >= 0 ? -1 : 1;
  const rp = [];
  for (let k = 1; k <= 7; k++) {
    const u = norm([T[k + 1][0] - T[k - 1][0], T[k + 1][1] - T[k - 1][1]]);
    rp.push(add(T[k], [-u[1], u[0]], side * w[2] * 2.1 * Math.pow(1 - k / 10, 0.9) * 0.26));
  }
  carve(g, rp, { w: Math.max(0.55, w[2] * 0.42), tin: 0.15, tout: 0.7, pout: 1.6, swell: 0, wob: 0.05, seed: seed + 4 });
  // a crescent rolling over each middle knuckle, and a rim along the first bone
  for (let k = 1; k < J.length - 1; k++) {
    const a = J[k];
    const u = norm([J[k + 1][0] - J[k - 1][0], J[k + 1][1] - J[k - 1][1]]);
    let nl = [-u[1], u[0]];
    if (nl[0] * L_LIMB[0] + nl[1] * L_LIMB[1] < 0) nl = [-nl[0], -nl[1]];
    const r = w[k] * 0.62;
    carve(g, [add(add(a, u, -r * 1.1), nl, r * 0.55), add(a, nl, r * 0.85), add(add(a, u, r * 1.1), nl, r * 0.5)], { w: 0.7, tin: 0.35, tout: 0.4, swell: 0, wob: 0, seed: seed + 5 + k });
    // round 15: curved hatch wrapping the knuckle on its lit half
    knuckleHatch(g, a, u, w[k] * 0.95, { n: 3, w: 0.75, seed: seed + 50 + k, spread: 1.3 });
  }
  // round 22: no ladder of white bars across the bones. Each phalanx gets ONE rim line
  // carved inside its lit edge (tapered both ends, breaking at the joints), and only the
  // swelling end of the bone, under the next knuckle, gets two short curved ticks that
  // wrap round it
  for (let k = 0; k < J.length - 1; k++) {
    const a = J[k], b = J[k + 1];
    const u = norm([b[0] - a[0], b[1] - a[1]]);
    let nl = [-u[1], u[0]];
    if (nl[0] * L_LIMB[0] + nl[1] * L_LIMB[1] < 0) nl = [-nl[0], -nl[1]];
    const w0 = w[k], w1 = w[Math.min(w.length - 1, k + 1)];
    const rim = [0.18, 0.4, 0.62, 0.82].map((t) => add(mix(a, b, t), nl, lerp(w0, w1, t) * 0.55));
    carve(g, rim, { w: 0.8, tin: 0.3, tout: 0.45, swell: 0.15, wob: 0.04, seed: seed + 60 + k * 10 });
    for (let i = 0; i < 2; i++) {
      const c = mix(a, b, 0.7 + i * 0.12);
      const wk = lerp(w0, w1, 0.7 + i * 0.12);
      carve(g, [add(c, nl, wk * 0.75), add(add(c, nl, wk * 0.2), u, 0.7), add(add(c, nl, -wk * 0.2), u, 0.9)], { w: 0.6 - i * 0.12, tin: 0.0, tout: 0.85, pout: 1.4, swell: 0, wob: 0, seed: seed + 64 + k * 10 + i });
    }
  }
}

export function inkHand(kind, far = false) {
  return kind === 'grip' ? gripFist(far) : openClaw(far);
}

// The fist round the hilt (which runs down +y through it), seen from the back of the
// hand: four fingers stacked along the hilt cross it as black bands parted by carved
// creases, and four long hooked talons lie over the top of the ferrule (the lit, +x
// side), each ringed in paper, rim-lit, ending in a needle point toward the blade.
function talonOnly(g, base, ang, L, hook, w, seed, far) {
  const d = [Math.cos(ang), Math.sin(ang)], n = [-d[1], d[0]];
  const T = [add(base, d, -1.5), add(add(base, d, L * 0.5), n, hook * 0.5), add(add(base, d, L), n, hook * 1.6)];
  if (!far) stroke(g, T, { w: w + 2.4, tin: 0, tout: 0.98, pout: 1.2, swell: 0, wob: 0, color: PAPER, seed, tooth: 0 });
  stroke(g, T, { w, tin: 0, tout: 0.97, pout: 2.2, swell: 0, wob: 0.05, seed: seed + 1, tooth: 0.03 });
  if (far) return;
  const side = hook >= 0 ? -1 : 1;
  const rp = [0.06, 0.3, 0.52, 0.72].map((s) => {
    const p = s < 0.5 ? mix(T[0], T[1], s * 2) : mix(T[1], T[2], (s - 0.5) * 2);
    return add(p, n, side * w * Math.pow(1 - s, 0.9) * 0.27);
  });
  carve(g, rp, { w: Math.max(0.55, w * 0.2), tin: 0.12, tout: 0.7, pout: 1.6, swell: 0, wob: 0.05, seed: seed + 2 });
}
// round 21: a talon that curls: the heading turns by `curl` radians along its length,
// slowly at the root and fast toward the needle point; paper ring, rim light on the
// outer (convex) flank dying before the point
function curledTalon(g, base, ang, L, curl, w, seed, far) {
  const n = 12, T = [];
  let p = add(base, [Math.cos(ang), Math.sin(ang)], -1.5);
  T.push(p);
  for (let k = 1; k <= n; k++) {
    const a = ang + curl * Math.pow(k / n, 1.6);
    p = add(p, [Math.cos(a), Math.sin(a)], (L + 1.5) / n);
    T.push(p);
  }
  if (!far) stroke(g, T, { w: w + 2.4, tin: 0, tout: 0.98, pout: 1.2, swell: 0, wob: 0, color: PAPER, seed, tooth: 0 });
  stroke(g, T, { w, tin: 0, tout: 0.97, pout: 2.0, swell: 0, wob: 0.04, seed: seed + 1, tooth: 0.03 });
  if (far) return;
  // the convex side of a positive curl is to the right of the heading (-normal)
  const sd = curl >= 0 ? -1 : 1;
  const rp = [];
  for (let k = 1; k < Math.round(n * 0.72); k++) {
    const u = norm([T[k + 1][0] - T[k - 1][0], T[k + 1][1] - T[k - 1][1]]);
    rp.push(add(T[k], [-u[1], u[0]], sd * w * Math.pow(1 - k / n, 0.9) * 0.27));
  }
  carve(g, rp, { w: Math.max(0.55, w * 0.22), tin: 0.12, tout: 0.7, pout: 1.6, swell: 0, wob: 0.04, seed: seed + 2 });
}
// round 23: a LONG skeletal grip, not a ball. Four separate knuckled fingers (each its
// own black band ringed in paper, so they never fuse into one mass) wrap the hilt in
// steps of unequal length; bony knuckle knobs stand out along the back of the hand; the
// talons are long, of UNEQUAL length and curl, hooking round the hilt toward the blade.
function gripFist(far) {
  return (g) => {
    const seed = 601;
    const F = [];
    for (let f = 0; f < 4; f++) {
      const y = 6.5 + f * 6.6 + (f === 3 ? -0.8 : 0);
      const K = [-8.2 + f * 0.9 + (f === 1 ? -0.8 : 0), y];
      const J1 = [1.4 - f * 0.5, y + 0.2 + f * 0.25];
      const J2 = [7.4 - f * 0.9 + (f === 1 ? 1.0 : 0), y + 2.8];
      F.push({ K, J1, J2, w: 3.0 - f * 0.22 });
    }
    // the back of the hand: a gaunt black wedge from the wrist to the knuckle row
    const palm = [[-4.2, -1.5], [3.6, -1.5], [5.0, 2.6], [1.8, 5.2], [-2.0, 8.0], [-3.2, 16], [-3.6, 25], [-4.8, 30.6], [-8.4, 29.4], [-10.6, 22], [-10.8, 13], [-9.2, 5.0], [-6.6, 1.0]];
    mass(g, palm, { color: INK, rough: 0.16, seed: seed + 60, k: 4 });
    // each finger: paper ring, then a black band that swells at its knuckles and
    // narrows between them (a phalanx, not a sausage)
    for (let f = 3; f >= 0; f--) {
      const { K, J1, J2, w } = F[f];
      const pts = [K, mix(K, J1, 0.5), J1, mix(J1, J2, 0.5), J2];
      if (!far) stroke(g, pts, { w: w * 2 + 2.4, tin: 0, tout: 0, swell: 0, wob: 0, color: PAPER, seed: seed + 200 + f, tooth: 0 });
      stroke(g, pts, { w: w * 2, tin: 0, tout: 0, swell: 0, wob: 0.08, seed: seed + 210 + f,
        press: (t) => (1 - 0.3 * t) * (1 + 0.25 * Math.exp(-Math.pow((t - 0.5) / 0.08, 2)) - 0.18 * Math.exp(-Math.pow((t - 0.27) / 0.09, 2)) - 0.18 * Math.exp(-Math.pow((t - 0.75) / 0.09, 2))) });
    }
    contourLine(g, palm, { closed: true, side: 1, light: L_LIMB, wMin: 0, wMax: 2.0, seed: seed + 61, breaks: 0.1, k: 4 });
    if (!far) {
      // bony knuckle knobs along the back of the fist, each its own pale closed shape
      F.forEach(({ K, w }, i) => {
        const c = add(K, [-0.6, -0.4]);
        g.fillStyle = BONE_C; g.beginPath(); g.ellipse(c[0], c[1], w * 0.62, w * 0.5, -0.4, 0, Math.PI * 2); g.fill();
        g.fillStyle = INK; g.beginPath(); g.ellipse(c[0] + 0.5, c[1] + 0.55, w * 0.5, w * 0.28, -0.4, 0, Math.PI); g.fill();
      });
      // a crescent of light rolling over each middle knuckle (lit, upper side)
      F.forEach(({ J1, w }, i) => carve(g, [add(J1, [-1.8, -w * 0.62]), add(J1, [0.4, -w * 0.98]), add(J1, [2.4, -w * 0.5])], { w: 0.8, tin: 0.35, tout: 0.4, swell: 0, wob: 0, seed: seed + 80 + i }));
      F.forEach(({ J1, J2, w }, i) => { knuckleHatch(g, J1, norm([J2[0] - J1[0], J2[1] - J1[1]]), w * 1.1, { n: 3, w: 0.7, seed: seed + 140 + i, light: [0, -1] }); });
      litPlane(g, [[-4.2, -1.5], [3.6, -1.5], [5.0, 2.6]], { inside: [0, 10], step: 1.7, depth: 2.8, w: 1.0, contour: 0.45, seed: seed + 150, fade: 0.15, slits: 0 });
      // the tendons down the back of the hand, fanning to the knuckles
      [[-1.2, 0.5, 6.8], [-2.4, 0.8, 13.4], [-3.4, 1.0, 20.0]].forEach(([x, y0, y1], i) => carve(g, [[x, y0], [x - 1.6, (y0 + y1) / 2], [x - 3.6, y1]], { ...LINE, w: 0.7, seed: seed + 85 + i }));
    }
    // the talons leave the fingers and CURL round the hilt toward the blade, each a
    // different length and curl (the index the longest, the little finger short)
    for (let f = 3; f >= 0; f--) {
      const { J2 } = F[f];
      curledTalon(g, add(J2, [0.6, 0.6]), Math.PI / 2 - [1.15, 0.92, 0.72, 0.5][f], [25, 32, 26, 16][f], [0.62, 0.8, 0.72, 0.55][f], 4.9 - f * 0.4, seed + f * 10, far);
    }
    // the thumb along the top of the hilt, its talon hooking over the first finger
    curledTalon(g, [5.4, 1.0], Math.PI / 2 - 1.35, 18, 0.7, 4.0, seed + 95, far);
  };
}

// The free claw: four long fingers fanned open and slightly curled (palm toward -x),
// knuckles staggered, each finger and its long hooked talon separate in a paper ring.
function openClaw(far) {
  return (g) => {
    const seed = 641;
    const K = [[-6.6, 13.4], [-2.2, 16.2], [2.2, 15.6], [6.0, 12.6]];
    const palm = [[-5.2, -1], [4.8, -1], [K[3][0] + 2.6, K[3][1] - 2.2], [K[3][0] + 1.8, K[3][1] + 2.2], [K[0][0] - 1.6, K[0][1] + 2.4], [K[0][0] - 2.8, K[0][1] - 2.2]];
    const F = [];
    for (let f = 0; f < 4; f++) {
      let a = Math.PI / 2 + (f - 1.5) * 0.34 - 0.18;
      const lens = [[10, 8.5, 7], [12.5, 10, 8], [12, 9.5, 7.5], [9.5, 7.5, 6]][f];
      const J = [K[f]];
      let p = K[f];
      for (let s = 0; s < 3; s++) {
        a += (0.3 + 0.08 * Math.sin(f * 2.3 + s)) * (s === 0 ? 0.5 : 1); // curl toward the palm (-x)
        p = [p[0] + Math.cos(a) * lens[s], p[1] + Math.sin(a) * lens[s]];
        J.push(p);
      }
      F.push({ J, w: [2.8, 2.4, 2.0], talon: [p, a + 0.28, [19, 25, 23, 17][f], -5.2] });
    }
    for (const f of [3, 2]) inkFinger(g, F[f].J, F[f].w, F[f].talon, seed + f * 10, far);
    mass(g, palm, { color: INK, rough: 0.15, seed: seed + 60 });
    contourLine(g, palm, { closed: true, side: 1, light: L_LIMB, wMin: 0, wMax: 1.8, seed: seed + 61, breaks: 0.1 });
    if (!far) {
      for (let f = 1; f < 3; f++) carve(g, [[(f - 1.5) * 1.6, 2.5], mix([(f - 1.5) * 1.6, 2.5], K[f], 0.55), add(K[f], [0, -2.4])], { ...LINE, w: 0.8, seed: seed + 70 + f });
      K.forEach((k, i) => carve(g, [add(k, [-2.2, -0.6]), add(k, [0, -2.0]), add(k, [2.2, -0.4])], { w: 0.85, tin: 0.35, tout: 0.4, swell: 0, wob: 0, seed: seed + 80 + i }));
      // round 15: the back of the hand turns into the light through feathered hatching,
      // and each knuckle is wrapped by curved strokes
      litPlane(g, [[4.8, -1], [7.4, 4.5], [K[3][0] + 2.6, K[3][1] - 2.2]], { inside: [0, 6], step: 1.7, depth: 3.2, w: 1.1, contour: 0.5, seed: seed + 85, fade: 0.15, slits: 0 });
      K.forEach((k, i) => knuckleHatch(g, k, [0, 1], 2.6, { n: 4, w: 0.8, seed: seed + 86 + i, spread: 1.1 }));
      // the tendons fanning to the knuckles, each a short white ridge with hatching off it
      K.forEach((k, i) => { if (i === 0) return; const a = [(i - 1.5) * 2.2, 1.0]; for (let j = 1; j < 4; j++) { const c = mix(a, k, j / 4); carve(g, [add(c, [1.4, 0]), add(c, [-0.2, 0.9])], { w: 0.6, tin: 0, tout: 0.85, swell: 0, wob: 0, seed: seed + 120 + i * 5 + j }); } });
    }
    for (const f of [1, 0]) inkFinger(g, F[f].J, F[f].w, F[f].talon, seed + f * 10, far);
    // the thumb, splayed out on the far side
    const tb = [4.6, 5], t1 = [11.6, 10.5], t2 = [14.6, 17.5];
    inkFinger(g, [tb, t1, t2], [3.0, 2.5, 2.1], [t2, Math.atan2(t2[1] - t1[1], t2[0] - t1[0]) - 0.3, 16, 3.6], seed + 90, far);
  };
}

export { arcLen, sweep };
