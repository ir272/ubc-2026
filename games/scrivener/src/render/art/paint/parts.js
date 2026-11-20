// The Scrivener's body parts, painted with the ink brush (brush.js). Owner: art.
// Baked offline by tools/ink_bake.mjs into assets/sprites/scrivener/*.png; the game
// draws them as a cut-out puppet (art/puppet.js) on the rig in art/scrivener.js.
//
// Every part is painted in its own frame, in art units, with its pivot at (0,0):
//   limbs: pivot = the proximal joint, the bone runs down +y (RIG lengths), +x = the
//          front/lit side when the limb hangs; the light comes from the upper front.
//   torso: pivot = the hip, spine up -y, +x forward (rotated by `lean` in game).
//   skirt: pivot = the belt, hangs down +y to the hem at SKIRT_LEN.
//   rags:  pivot = the root on the wing arm, the strip hangs down +y RAG_LEN long.

import {
  INK, PAPER, BONE, HI, RED, rng, noise1, lerp, clamp, smooth, add, mix, norm, spline, resample, cubic,
  stroke, carve as carve0, mass, pathOf, contourLine, wrapHatch, formShade, ribbonPts, hatchField, spike, bead, halo,
  haloVar, inkEdge,
} from './brush.js';
import { inkUpperArm, inkForeArm, inkHand, PALE } from './inkarm.js';
import { paleBody } from './palelimb.js';
import { featherEdge, litPlane } from './feather.js';
import { inkShin, inkFoot, SHIN_LEN, FOOT_H } from './legs.js';
import { torsoHand } from './hand_torso.js';
import { robeHand } from './hand_robe.js';
import { uarmHand, farmHand, handHand, blackHandFn } from './hand_arm.js';
import { modelInk } from './model.js';

// round 12: the carved white folds inside the coat's black are hairlines (0.5-1 px in
// the game), not ribbons: torso and skirt paint with their carve widths scaled by CW
let CW = 1;
const carve = (g, pts, o = {}) => carve0(g, pts, { ...o, w: (o.w ?? 1.1) * CW });

export const RAG_LEN = 200;
export const SKIRT_LEN = 84;
const L_LIMB = norm([0.8, -0.6]); // light in a hanging limb's frame: from the front, above

// ---- shared painters ------------------------------------------------------------------

// a sampler over a limb given its two edges (top -> bottom)
function limbAxis(front, back) {
  const F = resample(spline(front, 10), 0.25), B = resample(spline(back, 10), 0.25);
  const at = (A, s) => { const f = clamp(s, 0, 1) * (A.length - 1); const i = Math.floor(f), k = f - i; const a = A[i], b = A[Math.min(A.length - 1, i + 1)]; return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]; };
  return (s) => {
    const f = at(F, s), b = at(B, s);
    const p = mix(f, b, 0.5);
    const f2 = at(F, s + 0.01), b2 = at(B, s + 0.01), f1 = at(F, s - 0.01), b1 = at(B, s - 0.01);
    const d = norm([(f2[0] + b2[0]) / 2 - (f1[0] + b1[0]) / 2, (f2[1] + b2[1]) / 2 - (f1[1] + b1[1]) / 2]);
    return { p, d, r: Math.hypot(f[0] - b[0], f[1] - b[1]) / 2, f, b };
  };
}

// a pale bony/sinewy limb: brushed fill, wrapping hatch on the shadow side,
// crosshatch only in the joint pockets, inner sinew strokes, light-weighted contour
function paleLimb(g, front, back, o = {}) {
  const { seed = 1, light = L_LIMB, shade = [[0.0, 1.0, 0.18, 0.45]], cross = [], sinews = [], far = false, wMax = 3.0, capTop = null, capBot = null } = o;
  const outline = front.concat(back.slice().reverse());
  const ax = limbAxis(front, back);
  if (far) {
    mass(g, outline, { color: INK, rough: 0.2, seed });
    // rim light carved down the lit edge
    carve(g, front.slice(1, -1).map((p) => add(p, [-1, 0], 1.3)), { w: 1.0, seed: seed + 1, tin: 0.2, tout: 0.4 });
    if (o.carveForm) {
      // round 11: a limb turned into shadow is still drawn: white cross-contours carved
      // into the black from the lit edge, wrapping the volume and dying out mid-limb
      const A = ax(0.5), nn = [-A.d[1], A.d[0]];
      const litSd = (nn[0] * light[0] + nn[1] * light[1]) > 0 ? 1 : -1;
      wrapHatch(g, ax, { s0: 0.04, s1: 0.96, step: 2.3, len: 0.36, w: 0.75, bow: 0.5, light, seed: seed * 13 + 5, color: PAPER, sideFix: litSd, lenFn: (s) => 0.22 + 0.2 * Math.abs(Math.sin(s * 7 + seed)) });
      sinews.forEach((sn, i) => carve(g, sn.pts, { w: (sn.w || 1.1) * 0.7, seed: seed * 3 + i, tin: 0.3, tout: 0.5 }));
    }
    return;
  }
  mass(g, outline, { color: BONE, rough: 0.15, seed });
  // form shading: a black shadow shape feathered into the light, per band [s0, s1, core, feather]
  // round 11: the feathering is laid as separate, spaced pen strokes (not a soft ramp)
  // that reach well into the light, so at game scale they read as hatching wrapping the form
  shade.forEach(([s0, s1, core, feather], i) => formShade(g, ax, { s0, s1, core, feather: feather * 1.5, light, seed: seed * 7 + i, bow: 0.5, step: 2.0, w: 1.05 }));
  // a second, sparser layer of cross-contours over the half-tone side, thinning to a hair
  if (!o.noWrap) wrapHatch(g, ax, { step: 2.7, len: 0.5, w: 0.8, bow: 0.55, light, seed: seed * 13 + 3, lenFn: (s) => 0.38 + 0.2 * Math.sin(s * 11 + seed) });
  // crosshatch in the deep pockets: a second layer, steeper
  cross.forEach(([s0, s1, len], i) => wrapHatch(g, ax, { s0, s1, step: 1.8, len: len * 0.8, w: 0.7, bow: -0.6, light, seed: seed * 17 + i }));
  // sinews / tendons / muscle grooves: long tapered inner strokes
  sinews.forEach((sn, i) => stroke(g, sn.pts, { w: sn.w || 1.1, tin: 0.25, tout: 0.55, swell: 0.12, wob: 0.2, seed: seed * 3 + i, ...(sn.o || {}) }));
  contourLine(g, outline, { closed: true, side: 1, light, wMin: 0.25, wMax: wMax * 1.3, seed: seed + 5, breaks: 0.4 });
}

// black bindings wrapped round a limb: each band follows the cross-section ellipse
function bindings(g, ax, list, { light = L_LIMB, seed = 1 } = {}) {
  list.forEach(([s, w, tilt], i) => {
    const A = ax(s);
    const n = [-A.d[1], A.d[0]];
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const th = (k / 10) * Math.PI;
      pts.push(add(add(A.p, n, Math.cos(th) * (A.r + 0.9)), A.d, Math.sin(th) * A.r * 0.45 + tilt * Math.cos(th) * A.r));
    }
    stroke(g, pts, { w, tin: 0.05, tout: 0.08, pin: 0.6, pout: 0.6, swell: 0.05, wob: 0.15, seed: seed + i * 5, edgeDry: 0.25 });
    // the lit lip of the band carved in white
    carve(g, pts.slice(2, 8).map((p) => add(p, A.d, -w * 0.28)), { w: 0.55, seed: seed + i * 5 + 1 });
  });
}

// a talon: a hooked black spike with a white rim along its back
function talon(g, base, dir, len, w, hook, seed) {
  const d = norm(dir), n = [-d[1], d[0]];
  const m = add(add(base, d, len * 0.55), n, hook * 0.45);
  const tip = add(add(base, d, len), n, hook * 1.35);
  stroke(g, [base, m, tip], { w, tin: 0, tout: 0.95, pout: 1.5, swell: 0, wob: 0.1, seed, tooth: 0.05 });
  carve(g, [add(base, n, -w * 0.18), add(m, n, -w * 0.12), mix(m, tip, 0.5)], { w: Math.max(0.5, w * 0.16), seed: seed + 1, tin: 0.1, tout: 0.7 });
}

// one bony finger: phalanges as separate knuckled bones, darker toward the palm
function finger(g, joints, widths, seed, { talonLen = 15, hook = 4, far = false } = {}) {
  for (let i = 0; i < joints.length - 1; i++) {
    const a = joints[i], b = joints[i + 1];
    const d = norm([b[0] - a[0], b[1] - a[1]]), n = [-d[1], d[0]];
    const w0 = widths[i], w1 = widths[i] * 0.78;
    const f = [add(add(a, n, w0 * 0.62), d, 0.4), add(mix(a, b, 0.5), n, w0 * 0.38), add(add(b, n, w1 * 0.66), d, -0.3)];
    const bk = [add(add(a, n, -w0 * 0.62), d, 0.4), add(mix(a, b, 0.5), n, -w0 * 0.4), add(add(b, n, -w1 * 0.66), d, -0.3)];
    paleLimb(g, f, bk, { seed: seed + i * 3, far, shade: [[0.0, 1.0, 0.22, 0.5]], wMax: 1.6, light: L_LIMB, noWrap: true });
    // knuckle knob
    if (!far) {
      g.fillStyle = BONE;
      g.beginPath(); g.ellipse(b[0], b[1], w1 * 0.62, w1 * 0.5, Math.atan2(d[1], d[0]), 0, Math.PI * 2); g.fill();
      contourLine(g, [add(b, n, w1 * 0.62), add(b, d, w1 * 0.55), add(b, n, -w1 * 0.62)], { light: L_LIMB, wMin: 0.25, wMax: 1.3, seed: seed + i, breaks: 0.6 });
    }
  }
  const e = joints[joints.length - 1], q = joints[joints.length - 2];
  talon(g, add(e, norm([e[0] - q[0], e[1] - q[1]]), -1), [e[0] - q[0], e[1] - q[1]], talonLen, widths[widths.length - 1] * 1.25, hook, seed + 50);
}

// ---- upper arm --------------------------------------------------------------------------
// shoulder (0,0) -> elbow (0,86). A torn black sleeve over the top half; under it a gaunt
// sinewy arm that bellies out behind (the triceps) and pinches above two elbow knobs.

function upperArm(far) {
  return (g) => {
    const seed = far ? 31 : 11;
    // the biceps bellies the front high up, the triceps the back lower down, then both
    // pinch hard into the elbow, which flares into two knobs
    const front = [[6.0, 26], [8.2, 36], [8.0, 46], [6.0, 58], [4.4, 68], [3.6, 76], [5.2, 82], [6.8, 88], [4.6, 95]];
    const back = [[-7.6, 26], [-9.6, 36], [-11.2, 48], [-10.0, 58], [-6.8, 67], [-4.6, 75], [-6.6, 82], [-8.0, 88], [-4.2, 96]];
    const dk = far ? 1.75 : 1; // the far arm turns away from the light: a deeper shadow
    paleLimb(g, front, back, {
      seed, far, carveForm: true,
      shade: [[0.0, 0.62, 0.28 * dk, 0.65], [0.6, 0.83, 0.34 * dk, 0.5], [0.82, 1.0, 0.26 * dk, 0.45]],
      cross: [[0.66, 0.8, 0.4]],
      sinews: [
        { pts: [[1.5, 30], [3.8, 40], [3.0, 52], [0.6, 60]], w: 0.9, o: { tout: 0.7 } }, // biceps edge
        { pts: [[-5.5, 52], [-3.2, 60], [-1.6, 68], [-1.0, 76]], w: 1.0 }, // triceps tendon
      ],
    });
    {
      // the elbow knobs: two condyles, the lit one picked out by a hairline
      contourLine(g, [[-6.8, 81], [-8.2, 86], [-6.4, 91]], { light: L_LIMB, wMin: 0.6, wMax: 2.2, seed: seed + 9, breaks: 0.9 });
      stroke(g, [[-1.5, 84.5], [0.6, 86.6], [2.6, 85.2]], { w: 0.9, tin: 0.3, tout: 0.5, seed: seed + 10 });
      bindings(g, limbAxis(front, back), [[0.48, 2.4, 0.15]], { seed: seed + 20 });
    }
    // the sleeve: a black bell from the shoulder, carved with folds, its hem torn
    const sl = [[-11, -9], [-4, -12], [7, -11], [11, -4], [12, 10], [13.5, 26], [14.5, 33], [8, 36], [1, 33], [-7, 39], [-14.5, 36], [-14.5, 22], [-12.5, 6]];
    mass(g, sl, { rough: 0.35, seed: seed + 40 });
    // tatters: long dry strokes of very different lengths falling from the hem
    const r = rng(seed + 41);
    const hem = [[13.5, 32], [9, 35], [4, 34.5], [-1, 34], [-6, 38], [-10, 39], [-14, 36]];
    hem.forEach((p, i) => {
      const L = (i > 3 ? 14 : 6) + r() * (i > 3 ? 22 : 12);
      stroke(g, [add(p, [0, -4]), add(p, [(r() - 0.5) * 3 - 1, L * 0.5]), add(p, [(r() - 0.5) * 5 - 2.5, L])], { w: 4 + r() * 3, tin: 0, tout: 0.9, pout: 1.4, dry: 0.55, edgeDry: 0.5, seed: seed + 60 + i, swell: 0 });
    });
    // white folds converging on the shoulder, bowed round the arm, some broken
    const folds = [[-7, -4, -11, 36, 0.9], [-2, -6, -4, 34, 1.2], [3, -6, 4, 33, 1.0], [8, -3, 12, 32, 0.8], [11, 4, 15.5, 30, 0.6]];
    folds.forEach(([x0, y0, x1, y1, w], i) => {
      const a = [x0, y0], e = [x1, y1];
      const m = add(mix(a, e, 0.5), [1, 0], 1.6 - i * 0.3);
      if (i === 1) {
        carve(g, [a, mix(a, m, 0.6), m], { w, seed: seed + 70 + i });
        carve(g, [add(m, [0.3, 3]), mix(m, e, 0.6), e], { w: w * 0.8, seed: seed + 80 + i });
      } else carve(g, [a, m, e], { w, seed: seed + 70 + i });
    });
    // crumpled zigzag folds near the hem
    carve(g, [[-12, 30], [-8, 27], [-3, 31], [2, 28]], { w: 0.8, seed: seed + 90 });
    carve(g, [[5, 31], [9, 28.5], [14, 31]], { w: 0.7, seed: seed + 91 });
  };
}

// ---- forearm ------------------------------------------------------------------------------
// elbow (0,0) -> wrist (0,106). The forearm swells into a belly near the elbow on the
// top (the brachioradialis), twists (a ridge spirals from the back to the front) and
// pinches into a wrist bound in black ink-soaked cloth. A hooked olecranon spur.

function foreArm(far) {
  return (g) => {
    const seed = far ? 37 : 17;
    // a big flexor belly high on the front, a bony ridge down the back, both falling
    // away into a thin bound wrist; the axis bows a little
    const front = [[4.0, -3], [8.4, 4], [11.4, 14], [11.6, 24], [9.6, 36], [6.8, 50], [5.0, 64], [4.0, 78], [3.8, 90], [4.6, 100], [3.2, 110]];
    const back = [[-6.0, -2], [-8.4, 8], [-8.8, 18], [-7.6, 30], [-6.6, 44], [-5.8, 58], [-5.0, 72], [-4.8, 86], [-5.4, 98], [-5.6, 104], [-3.0, 110]];
    // the olecranon: a hooked bony spur standing off the back of the elbow
    {
      mass(g, [[-2, -7], [-9, -10], [-15.5, -17], [-11, -8.5], [-8, 1], [-3, 4]], { color: BONE, rough: 0.1, seed: seed + 1 });
      contourLine(g, [[-2, -7], [-9, -10], [-15.5, -17], [-11, -8.5], [-8, 1], [-3, 4]], { closed: true, side: 1, light: L_LIMB, wMin: 0.4, wMax: 2.2, seed: seed + 2 });
      wrapHatch(g, (s) => ({ p: [lerp(-12, -4, s), lerp(-11, -1, s)], d: norm([0.6, 1]), r: 3.2 }), { s0: 0.2, s1: 0.9, len: 0.5, step: 1.2, w: 0.6, seed: seed + 3 });
    }
    const dk = far ? 1.75 : 1;
    paleLimb(g, front, back, {
      seed, far, carveForm: true,
      shade: [[0.0, 0.3, 0.32 * dk, 0.7], [0.26, 0.72, 0.24 * dk, 0.6], [0.7, 1.0, 0.26 * dk, 0.5]],
      cross: [[0.03, 0.15, 0.4]],
      sinews: [
        // the twisting ridge: from the back of the elbow to the front of the wrist
        { pts: [[-4.2, 8], [-1.8, 26], [1.2, 48], [2.4, 70], [2.0, 88]], w: 1.9, o: { swell: 0.35 } },
        { pts: [[5.0, 6], [7.6, 16], [7.4, 28], [4.6, 40]], w: 0.9, o: { tout: 0.7 } }, // belly crease
        { pts: [[-2.8, 66], [-2.4, 80], [-1.4, 92]], w: 0.7, o: { tout: 0.8 } }, // tendon
      ],
    });
    const ax = limbAxis(front, back);
    // bony spurs raking back off the ulna ridge (the silhouette's thorns)
    [[24, 19, 0.55, 5.0], [50, 14, 0.45, 4.0]].forEach(([y, L, out, w], i) => {
      const A = ax(y / 110);
      const base = add(A.b, [2.2, 0]);
      const d = norm([-out, 1]);
      const tip = add(base, d, L);
      spike(g, add(base, [1.2, -2.5]), add(tip, d, 1.2), w + 2.2, { bend: -0.12, seed: seed + 60 + i });
      spike(g, add(base, [1.8, -1.6]), tip, w, { bend: -0.1, color: BONE, seed: seed + 62 + i });
      stroke(g, [add(base, [1.5, 1.5]), mix(base, tip, 0.75)], { w: 0.9, tin: 0.1, tout: 0.8, seed: seed + 64 + i });
    });
    // ink-soaked bindings round the wrist, the last one trailing a torn end
    bindings(g, ax, [[0.74, 2.6, 0.2], [0.8, 2.9, 0.1], [0.865, 2.6, 0.22], [0.93, 2.2, 0.05]], { seed: seed + 30 });
    stroke(g, [[-5, 96], [-10, 101], [-13, 110], [-14.5, 121]], { w: 2.6, tin: 0.05, tout: 0.8, dry: 0.6, edgeDry: 0.4, seed: seed + 40 });
    stroke(g, [[-5, 92], [-9.5, 95], [-14, 99]], { w: 1.8, tin: 0.05, tout: 0.9, dry: 0.5, seed: seed + 41 });
    // the ulna's head: a small knob on the back of the wrist
    g.fillStyle = BONE; g.beginPath(); g.ellipse(-5.0, 103.5, 2.4, 2.0, 0, 0, Math.PI * 2); g.fill();
    contourLine(g, [[-3.6, 101.6], [-6.8, 102.4], [-6.6, 105.6], [-3.8, 106.2]], { light: L_LIMB, wMin: 0.4, wMax: 1.6, seed: seed + 50 });
  };
}

// ---- hands ----------------------------------------------------------------------------------
// wrist (0,0), the forearm continues down +y. The grip hand's fingers wrap toward +x
// round the hilt (which runs through the fist along the forearm axis); the claw hand
// spreads long hooked talons (its palm faces -x).

function hand(kind, far = false) {
  return (g) => {
    const grip = kind === 'grip';
    const seed = grip ? 101 : 141;
    const ps = grip ? 1 : -1; // the side the fingers curl to
    const curl = grip ? 1.25 : 0.62;
    // the palm: a knuckled wedge of bone and sinew
    const K = [];
    for (let f = 0; f < 4; f++) K.push([(f - 1.5) * 4.6 * (grip ? 0.85 : 1.1), 15.5 + (f === 1 || f === 2 ? 1.4 : 0)]);
    const palm = [[-5.6, -1], [5.2, -1], [K[3][0] + 3.2, K[3][1] - 1], [K[3][0] + 1, K[3][1] + 2.4], [K[0][0] - 1, K[0][1] + 2.4], [K[0][0] - 3.2, K[0][1] - 1]];
    const fingers = [];
    for (let f = 0; f < 4; f++) {
      let a = Math.PI / 2 + (f - 1.5) * (grip ? 0.08 : 0.16);
      const lens = grip ? [10.5, 8.5, 7] : [12.5, 10.5, 8.5];
      const J = [K[f]];
      let p = K[f];
      for (let s = 0; s < 3; s++) {
        a -= curl * (0.62 + 0.2 * Math.sin(f * 2.1 + s)) * ps;
        p = [p[0] + Math.cos(a) * lens[s], p[1] + Math.sin(a) * lens[s]];
        J.push(p);
      }
      fingers.push(J);
    }
    // fingers behind the palm first (the far ones), then the palm, then the near ones
    const order = grip ? [3, 2] : [0, 1];
    for (const f of order) finger(g, fingers[f], [3.2, 2.8, 2.3], seed + f * 10, { talonLen: grip ? 13 : 19, hook: (grip ? 3.5 : 6) * -ps, far: true });
    paleLimb(g, [palm[1], palm[2], palm[3]], [palm[0], palm[5], palm[4]], { seed: seed + 60, far, shade: [[0.0, 1.0, 0.25, 0.5]], wMax: 2.0, noWrap: true });
    // tendons fanning down the back of the hand to the knuckles
    if (!far) for (let f = 0; f < 4; f++) stroke(g, [[(f - 1.5) * 1.6, 2], mix([(f - 1.5) * 1.6, 2], K[f], 0.6), add(K[f], [0, -1.5])], { w: 0.7, tin: 0.3, tout: 0.5, seed: seed + 70 + f });
    for (const f of (grip ? [0, 1] : [2, 3])) finger(g, fingers[f], [3.3, 2.9, 2.4], seed + f * 10, { talonLen: grip ? 14 : 21, hook: (grip ? 3.5 : 6.5) * -ps, far });
    // the thumb, opposed
    const tb = [ps * -4.5, 5];
    let a = Math.PI / 2 + 0.9 * -ps;
    const t1 = [tb[0] + Math.cos(a) * 10, tb[1] + Math.sin(a) * 10];
    a += (0.7 + curl * 0.6) * ps;
    const t2 = [t1[0] + Math.cos(a) * 8.5, t1[1] + Math.sin(a) * 8.5];
    finger(g, [tb, t1, t2], [3.4, 2.8], seed + 90, { talonLen: grip ? 11 : 15, hook: 3 * ps, far });
  };
}

// ---- torso -----------------------------------------------------------------------------
// hip (0,0), spine up -y, forward +x. The same S-curved spine as the rig (hunchOff):
// a black coat over a hunched back, spinal spurs breaking through it, hanging open over
// a pale ribcage whose ribs sweep down to a sternum, a bead rosary, a ragged lapel.

const hunch = (s) => { const k = clamp((s - 0.3) / 0.75, 0, 1.2); return 50 * k * k - 13 * Math.sin(Math.PI * clamp(s, 0, 1)); };
const TP = (s, o) => [o + hunch(s), -134 * s];

function fold(g, a, c1, c2, e, w, o = {}) {
  const pts = cubic(a, c1, c2, e, 10);
  if (o.brk) {
    const k = Math.round(o.brk * 10);
    carve(g, pts.slice(0, k), { w, seed: o.seed || 1, tout: 0.5 });
    carve(g, pts.slice(k + 1), { w: w * 0.7, seed: (o.seed || 1) + 1, tin: 0.4 });
  } else carve(g, pts, { w, seed: o.seed || 1, ...o });
}

// round 22: the open ribcage (see torsoBody): separate rib bones over a black cavity
function cageRibs(g, seed) {
  const R6 = [
    // sB,   oB,    oF,   drop,  sag,   w
    [0.978, -11, 14.5, 0.05, 0.02, 2.9],
    [0.918, -11.6, 18.6, 0.068, 0.03, 3.4],
    [0.852, -12.2, 19.8, 0.08, 0.034, 3.5],
    [0.782, -12, 19.2, 0.086, 0.034, 3.2],
    [0.712, -11, 16.4, 0.084, 0.03, 2.7],
    [0.642, -9.6, 10.5, 0.066, 0.024, 2.1],
  ];
  const D = [0.6, -0.8]; // the light, from the upper front
  R6.forEach(([sB, oB, oF, drop, sag, w], k) => {
    const A = TP(sB, oB), E = TP(sB - drop, oF);
    const P = resample(cubic(A, TP(sB - drop * 0.15 - sag * 0.4, lerp(oB, oF, 0.25)), TP(sB - drop - sag, lerp(oB, oF, 0.72)), E, 24), 0.4);
    const n = P.length;
    const N = P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)]; const t = norm([b[0] - a[0], b[1] - a[1]]); return [-t[1], t[0]]; });
    // the lower edge is the side whose normal points down (away from the light)
    const lo = N[n >> 1][1] > 0 ? 1 : -1;
    const W = P.map((p, i) => { const t = i / (n - 1); return w * (1.15 - 0.62 * t + 0.32 * Math.exp(-Math.pow((t - 0.2) / 0.08, 2))) ; });
    const up = P.map((p, i) => add(p, N[i], -lo * W[i] / 2));
    const dn = P.map((p, i) => add(p, N[i], lo * W[i] / 2));
    // a paper lift round the bone so it parts from the black behind it (wider below)
    g.fillStyle = PAPER; g.beginPath();
    const lu = up.map((p, i) => add(p, N[i], -lo * 0.5)), ld = dn.map((p, i) => add(p, N[i], lo * (0.9 + 0.5 * Math.sin(Math.PI * i / (n - 1)))));
    lu.concat(ld.slice().reverse()).forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill();
    mass(g, up.concat(dn.slice().reverse()), { color: BONE, rough: 0.08, seed: seed + 500 + k });
    // the head of the rib at the spine: a knot of bone
    const hc = add(P[1], N[1], lo * 0.4);
    g.fillStyle = BONE; g.beginPath(); g.ellipse(hc[0], hc[1], w * 0.85, w * 0.7, 0.3, 0, Math.PI * 2); g.fill();
    // shade on the underside: a tapered stroke inside the lower edge + wrapping ticks
    stroke(g, P.slice(1, Math.round(n * 0.8)).map((p, i) => add(p, N[i + 1], lo * W[i + 1] * 0.22)), { w: w * 0.42, tin: 0.08, tout: 0.7, pout: 1.5, swell: 0.2, wob: 0.05, tooth: 0.03, seed: seed + 520 + k, press: (t) => 1.1 - 0.6 * t });
    const r = rng(seed + 540 + k);
    g.fillStyle = INK; g.beginPath();
    for (let i = 3; i < n * 0.62; i += 2 + Math.floor(r() * 2)) {
      const a = add(P[i], N[i], lo * W[i] * 0.05), b = add(add(P[i], N[i], -lo * W[i] * 0.42), [P[Math.min(n - 1, i + 1)][0] - P[i][0], P[Math.min(n - 1, i + 1)][1] - P[i][1]], 0.6);
      ribbonPts(g, [a, mix(a, b, 0.5), b], (t) => 0.55 * (1 - t) + 0.03, seed + 560 + k * 31 + i);
    }
    g.fill();
    // contour: heavy along the lower edge (swelling under the angle), a broken hairline on top
    stroke(g, dn, { w: 1.9 + w * 0.15, tin: 0.05, tout: 0.6, pin: 0.8, pout: 1.6, swell: 0.35, wob: 0.08, tooth: 0.04, seed: seed + 580 + k, press: (t) => 1.15 - 0.55 * t });
    const brk = 0.35 + r() * 0.2;
    stroke(g, up.slice(0, Math.round(n * brk)), { w: 0.75, tin: 0.2, tout: 0.5, swell: 0, wob: 0.05, seed: seed + 590 + k });
    stroke(g, up.slice(Math.round(n * (brk + 0.18)), n - 1), { w: 0.5, tin: 0.4, tout: 0.4, swell: 0, wob: 0.05, seed: seed + 600 + k });
    // a white glint on the lit top where the rib bends
    carve(g, up.slice(Math.round(n * 0.12), Math.round(n * 0.34)).map((p, i) => add(p, N[i + Math.round(n * 0.12)], lo * 0.7)), { w: 0.9, tin: 0.3, tout: 0.5, seed: seed + 610 + k, color: HI });
    // costal cartilage: the rib ends in a short darker stub into the sternum
    const e = P[n - 1], e2 = add(e, norm([e[0] - P[n - 3][0], e[1] - P[n - 3][1]]), 2.6);
    stroke(g, [P[n - 2], e, e2], { w: w * 0.5, tin: 0.2, tout: 0.8, swell: 0, wob: 0, seed: seed + 620 + k });
  });
}

function torso(g) {
  CW = 1;
  torsoBody(g);
  CW = 1;
}
const BACK_PTS = [[1.08, -1], [0.99, -24], [0.84, -40], [0.66, -37], [0.48, -24], [0.3, -17], [0.12, -19], [-0.04, -27], [-0.1, -22]];
// the back silhouette's offset at height s (linear through BACK_PTS)
const backOff = (s) => {
  for (let i = 1; i < BACK_PTS.length; i++) {
    const [s0, o0] = BACK_PTS[i - 1], [s1, o1] = BACK_PTS[i];
    if (s >= s1) return lerp(o1, o0, (s - s1) / (s0 - s1));
  }
  return BACK_PTS[BACK_PTS.length - 1][1];
};
function torsoBody(g) {
  const seed = 300;
  // round 23: a GAUNT torso, not a tube: the hump and the cage are the mass, the waist
  // pinches hard under them (the belly sucked in at the front, the lumbar sagging back)
  // and the coat flares again at the belt, so the body reads as an S of masses
  const back = BACK_PTS.map(([s, o]) => TP(s, o));
  const front = [TP(-0.1, 13), TP(0.04, 14), TP(0.18, 7), TP(0.32, 6), TP(0.46, 10), TP(0.6, 17), TP(0.8, 22), TP(0.99, 17), TP(1.09, 8)];
  const outline = back.concat(front);
  mass(g, outline, { rough: 0.4, seed });
  // spinal spurs breaking out through the coat along the hump: pale, hooked back
  const spurs = [[0.95, 13], [0.87, 16], [0.79, 14], [0.71, 11], [0.63, 8]];
  spurs.forEach(([s, L], i) => {
    // the back silhouette's offset at s (interpolated from the outline control points)
    const o = backOff(s);
    const b = TP(s, o + 4);
    const d = norm([-1, -0.35 - (s - 0.7) * 1.6]);
    const tip = add(add(b, d, L), [0, -1], L * 0.25);
    spike(g, add(b, d, -2), add(tip, d, 1.4), 8.5, { bend: -0.25, seed: seed + 10 + i });
    spike(g, add(b, d, 0.5), tip, 5.2, { bend: -0.22, color: BONE, seed: seed + 20 + i });
    stroke(g, [add(b, d, 1.5), add(mix(b, tip, 0.7), [0, 1], 0.8)], { w: 1.0, tin: 0.1, tout: 0.8, seed: seed + 30 + i });
  });
  // the coat's folds: short curved sheaves clustered where the cloth pulls (over the
  // hump, under the shoulder, into the belt), never one long scratch
  const r = rng(seed + 40);
  const sheaf = (s, o, ang, len, w, n, sd) => {
    for (let j = 0; j < n; j++) {
      const a = add(TP(s, o), [Math.cos(ang + 1.57), Math.sin(ang + 1.57)], j * (2.4 + r() * 1.2) * sd);
      const L = len * (1 - j * 0.22) * (0.85 + r() * 0.3);
      const d = [Math.cos(ang), Math.sin(ang)];
      const e = add(a, d, L);
      const m = add(mix(a, e, 0.5), [-d[1], d[0]], L * 0.12 * sd);
      carve(g, [a, m, e], { w: j ? w * 0.55 : w, seed: seed + 50 + Math.floor(s * 100) + j, tin: 0.15, tout: 0.6 });
    }
  };
  // round 17: few sheaves, each a heavy lead fold with one thinner echo (no hairline fields)
  sheaf(0.97, -22, 2.3, 22, 2.0, 2, 1);   // off the top of the hump, falling back
  sheaf(0.84, -30, 1.95, 26, 1.3, 1, 1);
  sheaf(0.5, -28, 1.45, 24, 1.6, 2, 1);
  // round 11: long gravity folds hanging down the back of the coat from the hump to the
  // belt, parallel to the back contour but not ruled: each swells, some break, two fork
  const backO = backOff;
  // round 19: two, not three: one heavy carve swelling to 3.6 that hugs the shadow edge
  // of the back from the hump into the belt, one medium one that breaks halfway
  [[0.88, 0.05, 5.5, 3.6, 0], [0.7, 0.04, 17, 1.6, 0.5]].forEach(([sa, se, inset, w, brk], j) => {
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const s = lerp(sa, se, k / 8);
      pts.push(TP(s, backO(s) + inset + Math.sin(k * 0.9 + j) * 1.6 + (k / 8) * (j % 2 ? 3 : -2)));
    }
    if (brk) {
      const kk = Math.round(brk * 8);
      carve(g, pts.slice(0, kk + 1), { w, tin: 0.15, tout: 0.5, swell: 0.3, seed: seed + 200 + j });
      carve(g, pts.slice(kk + 1), { w: w * 0.75, tin: 0.4, tout: 0.6, seed: seed + 210 + j });
    } else carve(g, pts, { w, tin: 0.12, tout: 0.7, swell: 0.3, seed: seed + 200 + j });
    if (w >= 2) featherEdge(g, pts.slice(1, 7), { side: -1, step: 3.2, depth: 5.5, w: 1.3, rows: 1, contour: 0, bow: 0.35, lean: 0.35, seed: seed + 240 + j, fade: 0.2 });
    if (j === 0) carve(g, [pts[4], add(pts[6], [3, 1]), add(pts[8], [7, -1])], { w: w * 0.5, tin: 0.4, tout: 0.6, seed: seed + 220 + j });
  });
  // round 23: the cloth BUNCHES where the waist pinches under the cage: crescent folds
  // wrapping round the waist (bowing down, heavy on the shadow back, hairline toward the
  // front), and long drag lines following the S of the back from the hump into the belt
  {
    const rw = rng(seed + 700);
    // three, never alike: a long heavy one sagging across the whole waist, a short
    // steep one tucked under the cage, a broken hairline low by the belt
    [[0.4, 0.3, 3, 7, 2.4, -1], [0.48, 0.43, 8, 4, 1.4, -1], [0.27, 0.15, 4, 5, 1.9, 0.55]].forEach(([sa, se, oe, bow, w, brk], i) => {
      const a = TP(sa, backOff(sa) + 2 + rw() * 1.2), e = TP(se, oe);
      const m = add(mix(a, e, 0.45), [0, 1], bow);
      const pts = cubic(a, mix(a, m, 0.7), mix(m, e, 0.3), e, 10);
      if (brk > 0) {
        const k = Math.round(brk * 10);
        carve(g, pts.slice(0, k), { w, tin: 0.1, tout: 0.5, swell: 0.3, seed: seed + 710 + i });
        carve(g, pts.slice(k + 1), { w: w * 0.6, tin: 0.4, tout: 0.6, seed: seed + 720 + i });
      } else carve(g, pts, { w, tin: 0.12, tout: 0.75, pout: 1.6, swell: 0.3, seed: seed + 710 + i });
    });
    [[0.93, 0.5, 11, 1.1], [0.62, 0.1, 16, 0.75]].forEach(([sa, se, inset, w], j) => {
      const pts = [];
      for (let k = 0; k <= 10; k++) { const sv = lerp(sa, se, k / 10); pts.push(TP(sv, backOff(sv) + inset + Math.sin(k * 0.7 + j * 2) * 1.2)); }
      carve(g, pts, { w, tin: 0.2, tout: 0.6, pin: 1.1, pout: 1.6, swell: 0.2, seed: seed + 730 + j });
    });
  }
  // the coat's front under the cage: short folds pulled into the belt
  [[0.42, 6, -6], [0.3, 3, -9]].forEach(([sa, o, eo], j) => {
    carve(g, [TP(sa, o), TP(sa * 0.55, (o + eo) / 2 - 1), TP(0.03, eo)], { w: 1.2 - j * 0.2, tin: 0.2, tout: 0.6, seed: seed + 230 + j });
  });
  // folds gathered into the belt
  for (let j = 0; j < 3; j++) {
    const e = TP(0.04, -10 + j * 10 + (r() - 0.5) * 3);
    const st = TP(0.2 + r() * 0.08, -16 + j * 10 + r() * 2);
    fold(g, st, add(mix(st, e, 0.35), [-2, 3]), add(mix(st, e, 0.7), [-1, 2]), e, [1.7, 0.8, 1.2][j], { seed: seed + 90 + j });
  }
  // round 15: the coat turns into the light through feathered cross-contour hatching
  // (belly front, top of the hump) instead of a hard black boundary; the long folds
  // shed short hatch off their lit flank so the cloth is modelled, not filled
  litPlane(g, [TP(-0.06, 13.5), TP(0.04, 14), TP(0.18, 7), TP(0.32, 6), TP(0.44, 9)], { inside: TP(0.2, -5), step: 2.1, w: 1.4, contour: 0.8, bow: 0.3, seed: seed + 97,
    depthFn: (q) => 3 + 4.5 * Math.exp(-Math.pow((q - 0.4) / 0.25, 2)), pockets: [[0.0, 0.16, 0.9]] });
  litPlane(g, [TP(1.04, -14), TP(0.99, -24), TP(0.92, -34), TP(0.84, -40), TP(0.74, -40), TP(0.64, -38.5)], { inside: TP(0.85, -15), step: 2.2, w: 1.35, contour: 0.75, bow: -0.25, seed: seed + 96,
    depthFn: (q) => 2.5 + 4.5 * Math.exp(-Math.pow((q - 0.35) / 0.25, 2)) });

  // the open chest: a black cavity, ribs laid over it as separate pale bones
  const chest = [TP(1.0, 15.5), TP(0.86, 21.5), TP(0.66, 19), TP(0.5, 13), TP(0.44, 2), TP(0.5, -9), TP(0.7, -12), TP(0.88, -10), TP(0.99, -5)];
  // the cavity behind the ribs is black; only its front lip catches light
  if (!PALE) mass(g, [TP(0.98, 10), TP(0.84, 14), TP(0.66, 12), TP(0.52, 7), TP(0.47, -3), TP(0.54, -9.5), TP(0.72, -11), TP(0.9, -9), TP(0.99, -4)], { rough: 0.3, seed: seed + 101 });
  else {
    // round 22: an OPEN cage. The chest is a black cavity and the ribs are separate,
    // gaunt bones laid over it: each leaves the spine as a knotted head, bends hard at
    // its angle and thins toward the sternum, held by a contour heavy on its lower edge,
    // a hairline on the lit top, shade hatch wrapping its underside; black between them
    mass(g, [TP(1.0, 12), TP(0.9, 19), TP(0.78, 20), TP(0.64, 16.5), TP(0.55, 10), TP(0.53, -6), TP(0.64, -11), TP(0.78, -12.5), TP(0.9, -11), TP(0.99, -6)], { rough: 0.3, seed: seed + 101 });
    cageRibs(g, seed);
  }
  // round 19: the ribcage is DRAWN, not stamped. Five carves, no two alike: the weight
  // bunches on the shadow (back) side where three ribs crowd under the shoulder blade,
  // heavy where they leave the spine and tapering to a hair (or breaking off) as they
  // round the flank into the light; a wide gap, one big shadow-side carve, a lone
  // floating rib. The lit front of the cage is not black at all: it is a paper plane the
  // black breaks into through curved hatching that wraps the barrel of the chest.
  // the cage's front: the light floods the chest, so the front half of the barrel is a
  // paper plane and the black of the cavity breaks into it through long curved hatching
  // laid ACROSS the chest (along the ribs), dense and long out of the black, short in the light
  const CF = [[0.5, 14], [0.6, 17], [0.7, 19.5], [0.8, 21.5], [0.9, 20.5], [0.98, 17.5]];
  const cageD = (q) => 3.5 + 13 * Math.exp(-Math.pow((q - 0.5) / 0.28, 2));
  if (!PALE) litPlane(g, CF.map(([s, o]) => TP(s, o)), { inside: TP(0.75, 0), step: 2.6, w: 1.7, contour: 1.0, bow: -0.3, seed: seed + 112, depthFn: cageD,
    pockets: [[0.06, 0.22, 0.9], [0.78, 0.9, 0.8]], slits: 0, reachK: 0.75, wobble: 0.25 });
  // where (in o) the paper plane starts at height s: the ribs change from white carves in
  // the black to black lines on the paper as they come round into the light
  const planeO = (s) => {
    if (PALE) return -1e9; // round 20: every rib is an ink line on the pale cage
    const q = clamp((s - 0.5) / 0.48, 0, 1);
    let fo = CF[0][1];
    for (let i = 1; i < CF.length; i++) if (s <= CF[i][0]) { fo = lerp(CF[i - 1][1], CF[i][1], (s - CF[i - 1][0]) / (CF[i][0] - CF[i - 1][0])); break; } else fo = CF[i][1];
    return fo - cageD(q) * 0.92;
  };
  const rib = (sB, oB, oF, drop, sag) => {
    const A = TP(sB, oB), E = TP(sB - drop, oF);
    return cubic(A, TP(sB - drop * 0.2 - sag * 0.5, lerp(oB, oF, 0.3)), TP(sB - drop - sag, lerp(oB, oF, 0.75)), E, 22);
  };
  const ribs = [
    // sB,  oB,    oF,  drop, sag,  w,   break at, tout
    [0.962, -12.5, 17, 0.06, 0.03, 2.7, -1, 0.5],
    [0.92, -11.5, 12, 0.05, 0.025, 1.8, 0.42, 0.5],
    [0.889, -12.5, -2, 0.035, 0.014, 0.95, -1, 0.7],
    [0.79, -12.5, 19, 0.075, 0.035, 3.3, -1, 0.45],
    [0.682, -10, 16, 0.08, 0.02, 1.25, 0.32, 0.5],
  ];
  if (!PALE) ribs.forEach(([sB, oB, oF, drop, sag, w, brk, tout], k) => {
    const pts = rib(sB, oB, oF, drop, sag);
    const n = pts.length;
    // split the rib where it enters the light
    let cut = n;
    for (let i = 0; i < n; i++) { const sp = -pts[i][1] / 134; if (pts[i][0] - hunch(sp) > planeO(sp)) { cut = i; break; } }
    const o = { w, tin: 0.06, tout: cut < n ? 0.12 : tout, pin: 0.7, pout: 1.6, swell: 0.25, wob: 0.14, tooth: 0.04, seed: seed + 110 + k, press: (t) => 1.15 - 0.5 * t };
    const white = pts.slice(0, Math.min(n, cut + 1));
    if (brk > 0 && brk * n < cut - 2) {
      const kk = Math.round(brk * n);
      carve(g, white.slice(0, kk), { ...o, tout: 0.45 });
      carve(g, white.slice(kk + 2), { ...o, w: w * 0.6, tin: 0.3, seed: o.seed + 50 });
    } else if (white.length > 2) carve(g, white, o);
    // in the light the same rib is an ink line: heaviest on its lower (shadow) edge where
    // it rounds the flank, thinning to a hair and breaking before the sternum
    if (PALE) {
      // the shadow under each rib: a short group of curved strokes hanging off its lower
      // edge on the spine side, following the rib's curve, shortening toward the light
      const rr = rng(seed + 190 + k);
      const m = Math.round(n * 0.55);
      for (let j = 0; j < 3 + (w > 2 ? 2 : 0); j++) {
        const a0 = Math.round(rr() * 3), a1 = Math.max(a0 + 3, Math.round(m * (1 - j * 0.16) * (0.7 + rr() * 0.3)));
        const seg = pts.slice(a0, a1).map((p) => add(p, [0.1, 1], w * 0.45 + 1.1 + j * 1.25));
        if (seg.length > 2) stroke(g, seg, { w: 0.85 - j * 0.08, tin: 0.08, tout: 0.75, pout: 1.4, swell: 0, wob: 0.08, tooth: 0.03, seed: seed + 200 + k * 7 + j });
      }
    }
    if (cut < n - 2) {
      const blk = pts.slice(Math.max(0, cut - 1)).map((p) => add(p, [0, 1], w * 0.28));
      stroke(g, blk, { w: 0.55 + w * 0.42, tin: 0.08, tout: tout + 0.2, pin: 0.7, pout: 1.6, swell: 0.15, wob: 0.12, tooth: 0.04, seed: seed + 170 + k, press: (t) => 1.1 - 0.5 * t });
      // its upper edge: a hairline that only runs where the bone turns to the light
      const up = pts.slice(Math.max(0, cut + 1), Math.max(cut + 3, n - 4)).map((p) => add(p, [0, -1], w * 0.5));
      if (up.length > 2 && w > 1.5) stroke(g, up, { w: 0.6, tin: 0.4, tout: 0.4, swell: 0, wob: 0.06, seed: seed + 180 + k });
    }
    // the heavy ribs shed short cross-contour hatch off their lower edge in the black,
    // parallel to the rib (so it wraps the barrel), shortening as it drops into the shadow
    if (w > 2.4) {
      for (let j = 1; j <= 2; j++) {
        const a = Math.round(Math.min(cut, n) * (0.3 + j * 0.06)), b = Math.round(Math.min(cut, n) * (0.88 - j * 0.12));
        const seg = pts.slice(a, b).map((p) => add(p, [0.15, 1], j * 2.6 + (j === 2 ? 0.6 : 0)));
        if (seg.length > 2) carve(g, seg, { w: 1.3 - j * 0.3, tin: 0.25, tout: 0.6, pout: 1.4, swell: 0, wob: 0.05, seed: seed + 130 + k * 5 + j });
      }
    }
  });
  // where the ribs leave the spine they knot into a ragged seam of short white nicks
  [[0.965, -13.4, 2.0], [0.925, -12.4, 1.4], [0.796, -13.4, 2.2], [0.69, -11, 1.1]].forEach(([s, o, w], i) => {
    carve(g, [TP(s + 0.012, o - 0.6), TP(s - 0.004, o + 1.4)], { w, tin: 0, tout: 0.9, pout: 1.5, swell: 0, wob: 0, seed: seed + 150 + i });
  });
  // the spine under the coat: a column of vertebral knobs riding the inside of the hump,
  // each a separate closed bead with a dot of shine, shrinking toward the waist
  {
    const backO = backOff;
    // round 19: uneven, as if half-buried in the coat: they crowd at the top of the hump,
    // two swell where the spine bends hardest, then they thin out and fall apart
    const VS = [[0.99, 2.3], [0.952, 2.6], [0.918, 2.0], [0.87, 3.0], [0.832, 2.2], [0.765, 1.9], [0.69, 1.5]];
    for (let k = 0; k < VS.length; k++) {
      const s = VS[k][0];
      const c = TP(s, backO(s) + 7.5 + k * 0.5 + (k % 2 ? 0.8 : -0.4));
      const rr = VS[k][1];
      bead(g, c, rr + 0.8, { color: INK, hl: false });
      g.fillStyle = BONE; g.beginPath(); g.ellipse(c[0], c[1], rr, rr * 0.78, -0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = INK; g.beginPath(); g.ellipse(c[0] + rr * 0.2, c[1] + rr * 0.3, rr * 0.8, rr * 0.45, -0.4, 0, Math.PI); g.fill();
      g.fillStyle = HI; g.beginPath(); g.arc(c[0] - rr * 0.35, c[1] - rr * 0.3, Math.max(0.4, rr * 0.3), 0, Math.PI * 2); g.fill();
    }
  }
  // sternum: three short knuckled segments down the front, not one rod
  [[1.0, 0.93], [0.915, 0.85], [0.835, 0.78]].forEach(([s0, s1], i) => {
    const seg = [TP(s0, 13.5), TP((s0 + s1) / 2, 17.5 - i * 0.3), TP(s1, 17), TP(s1 - 0.005, 13.2), TP((s0 + s1) / 2, 12.2)];
    mass(g, seg, { color: BONE, rough: 0.08, seed: seed + 140 + i });
    contourLine(g, seg, { closed: true, side: -1, light: [0.6, -0.8], wMin: 0.3, wMax: 1.9, seed: seed + 143 + i });
  });
  // the belly sinks under the cage into a black hollow, feathered at its top
  mass(g, [TP(0.56, -6), TP(0.52, 8), TP(0.46, 15), TP(0.38, 13), TP(0.36, -4)], { rough: 0.3, seed: seed + 150 });
  // the ragged lapel: torn coat falling forward over the back of the ribs
  for (let k = 0; k < 7; k++) {
    const s = 0.98 - k * 0.085;
    const base = TP(s, -14 + Math.sin(k * 1.7) * 1.5);
    const L = 7 + r() * 8;
    stroke(g, [add(base, [-4, -1]), add(base, [L * 0.4, 1.5]), add(base, [L, 5 + r() * 3])], { w: 6 + r() * 2, tin: 0, tout: 0.85, pout: 1.4, dry: 0.4, edgeDry: 0.3, seed: seed + 160 + k, swell: 0 });
  }
  // the rosary: beads strung round the neck, hanging forward of the chest
  const A = TP(1.03, -12), C = TP(0.6, 34), E = TP(1.03, 16);
  const beads = cubic(A, mix(A, C, 0.66), mix(E, C, 0.66), E, 18).slice(1, -1);
  stroke(g, cubic(A, mix(A, C, 0.66), mix(E, C, 0.66), E, 18), { w: 0.6, tin: 0, tout: 0, seed: seed + 170 });
  beads.forEach((b, i) => { bead(g, b, 3.4, { color: INK, hl: false }); bead(g, b, 2.4, { color: BONE, hl: false }); g.fillStyle = INK; g.beginPath(); g.arc(b[0] + 0.5, b[1] + 0.9, 1.25, 0, Math.PI); g.fill(); });
  const m = beads[8];
  spike(g, [m[0], m[1] + 1], [m[0] + 1.5, m[1] + 17], 9.5, { bend: 0, seed: seed + 180 });
  spike(g, [m[0], m[1] + 2], [m[0] + 1.3, m[1] + 15], 6.6, { bend: 0, color: BONE, seed: seed + 181 });
  stroke(g, [[m[0] + 0.3, m[1] + 6], [m[0] + 1.2, m[1] + 14.5]], { w: 0.9, tin: 0, tout: 0.9, seed: seed + 182 });
  bead(g, [m[0] + 0.2, m[1] + 5.5], 1.3, { color: INK, hl: false });
}

// ---- skirt ------------------------------------------------------------------------------
// belt centre (0,0), hangs to the hem at y = SKIRT_LEN (centre x = -8). A heavy black skirt
// tenting over the near knee; gravity folds carved off the belt, a ragged dry-brush hem.

function skirt(g) {
  CW = 1;
  skirtBody(g);
  CW = 1;
}
function skirtBody(g) {
  const seed = 400;
  const H = SKIRT_LEN;
  const r = rng(seed);
  // round 18: the coat stops at the KNEE and flares: a bell that the near knee tents
  // forward and the drag sweeps back, its hem a long diagonal (lifted over the knee in
  // front, trailing low behind) torn into dry-brush tatters, so the gaunt shins and
  // taloned feet stand out under it and the figure has legs, a knee and a planted foot
  const hemAt = (x) => H + lerp(13, -15, (x + 88) / 150) + Math.sin(Math.pow((x + 88) / 150, 1.3) * Math.PI) * 11;
  const back = [[-25, -6], [-28, 10], [-33, 28], [-44, 48], [-62, 68], [-88, hemAt(-88) - 2]];
  const front = [[62, hemAt(62)], [60, 60], [54, 42], [44, 24], [32, 8], [19, -6]];
  const hem = [];
  for (let i = 1; i < 14; i++) { const x = lerp(-88, 62, i / 14) + (r() - 0.5) * 4; hem.push([x, hemAt(x) + (r() - 0.5) * 6]); }
  mass(g, back.concat(hem, front), { rough: 0.6, seed });
  // the hem tears into single dry-brush strokes bunched in clumps with gaps (the legs show
  // through the gaps): a long-tailed spread of lengths, the back ones long and swept back
  // by the drag, the front ones short nicks over the knee; widths from a hair to a fat
  // torn panel; some fork into a peeling hair
  const rr2 = rng(seed + 7);
  let x = -88;
  let i = 0;
  while (x < 60) {
    const clump = rr2() < 0.32;
    x += clump ? 1.3 + rr2() * 1.8 : 3.4 + rr2() * 5.4;
    if (x > 60) break;
    const back = clamp((50 - x) / 130, 0, 1); // 1 at the trailing back, 0 at the front
    const tail = Math.pow(rr2(), 1.9);
    const L = (5 + tail * 62) * (0.35 + back * 1.0);
    const w = 1.8 + Math.pow(rr2(), 1.3) * (back > 0.5 ? 12 : 8);
    const y = hemAt(x) - 6;
    const lean = -2 - L * (0.12 + back * 0.32) + (rr2() - 0.5) * 4;
    const tip = [x + lean, y + 6 + L * (1 - back * 0.18)];
    const mid = [lerp(x, tip[0], 0.45) + (rr2() - 0.5) * 3.6, lerp(y, tip[1], 0.5) + 1.5];
    stroke(g, [[x, y - 6], mid, tip], { w, tin: 0, tout: 0.92, pout: 1.4 + rr2() * 1.2, swell: 0, dry: 0.2 + rr2() * 0.6, edgeDry: 0.55, wob: 0.35, seed: seed + 10 + i });
    if (L > 20 && rr2() < 0.5) {
      const f0 = mix([x, y], tip, 0.4 + rr2() * 0.2);
      stroke(g, [f0, add(f0, [-3 - rr2() * 4, L * 0.22]), add(f0, [-7 - rr2() * 8, L * 0.42])], { w: 0.9 + rr2() * 1.1, tin: 0, tout: 0.95, pout: 2, swell: 0, dry: 0.35, seed: seed + 400 + i });
    }
    i++;
  }
  // three long trailing streamers behind: the coat's tail, curling back off the hem
  [[-82, 62, 12, 1], [-64, 70, 9, -1], [-46, 44, 6, 1]].forEach(([x0, L, w, k], j) => {
    const y0 = hemAt(x0) - 10;
    // each an S: out and back with the drag, then the tip curling down (or up) on itself
    const pts = [[x0 + 4, y0 - 4], [x0 - 4 - L * 0.1, y0 + L * 0.3], [x0 - 4 - L * 0.32, y0 + L * 0.55], [x0 - 10 - L * 0.42, y0 + L * 0.8], [x0 - 10 - L * 0.4 + k * 5, y0 + L * 1.0]];
    stroke(g, pts, { w, tin: 0, tout: 0.95, pout: 1.8, swell: 0.05, dry: 0.45, edgeDry: 0.6, wob: 0.4, seed: seed + 600 + j });
    // a white crease carved down the streamer's fold, heavy at the root
    carve(g, pts.slice(0, 3).map((p) => add(p, [1.5, -1])), { w: 1.4 - j * 0.3, tin: 0.1, tout: 0.7, seed: seed + 610 + j });
  });
  // round 23: no ruled hem band (a straight studded border read as a stiff column).
  // Instead the bell is carved by a FAN of tapered gravity folds that spread from the
  // belt to the flaring hem, following how the cloth falls: long heavy ones on the
  // shadow back, broken hairlines toward the lit front, a few forking where it buckles
  {
    const rf = rng(seed + 900);
    const NF = 18;
    for (let k = 0; k < NF; k++) {
      const u = k / (NF - 1); // 0 = back, 1 = front
      const x0 = lerp(-24, 16, u) + (rf() - 0.5) * 2.5;
      const y0 = 3 + rf() * 6;
      const xe = lerp(-86, 54, u) + (rf() - 0.5) * 8;
      const ye = hemAt(xe) - 2 - rf() * 22 * (0.4 + u);
      const bow = (rf() - 0.5) * 6 - (1 - u) * 5;
      const c1 = [lerp(x0, xe, 0.3) + bow, lerp(y0, ye, 0.33)];
      const c2 = [lerp(x0, xe, 0.66) + bow * 0.6, lerp(y0, ye, 0.68)];
      const pts = cubic([x0, y0], c1, c2, [xe, ye], 12);
      const back = 1 - u;
      const w = (0.45 + Math.pow(rf(), 1.6) * 1.9) * (0.5 + back * 0.8);
      const brk = rf() < 0.35 ? 4 + Math.floor(rf() * 5) : -1;
      if (brk > 0) {
        carve(g, pts.slice(0, brk), { w, tin: 0.3, tout: 0.4, swell: 0.2, seed: seed + 910 + k });
        carve(g, pts.slice(brk + 1), { w: w * 0.7, tin: 0.35, tout: 0.5, seed: seed + 940 + k });
      } else carve(g, pts, { w, tin: 0.25, tout: 0.55, pin: 1.1, pout: 1.6, swell: 0.25, seed: seed + 910 + k });
      if (rf() < 0.3) {
        const f = pts[6 + Math.floor(rf() * 3)];
        carve(g, [f, add(f, [-2 - rf() * 3, 6]), add(f, [-5 - rf() * 6, 14 + rf() * 6])], { w: w * 0.6, tin: 0.4, tout: 0.5, seed: seed + 970 + k });
      }
    }
  }
  // gravity folds fanning from the belt knot down the bell: UNEVEN on purpose. The
  // shadow (back) side gets a few long heavy carves that swell under pressure; the lit
  // front over the thigh gets hairlines that break off short.
  const gf = [
    // a          c1          c2          e           w    brk  fork
    [[-21, 4], [-27, 26], [-42, 52], [-64, 84], 2.7, 0, 0],
    [[-16, 3], [-19, 28], [-30, 56], [-44, 90], 1.7, 0.6, 1],
    [[-10, 5], [-11, 24], [-17, 50], [-23, 70], 0.8, 0.45, 0],
    [[-4, 4], [-2, 28], [-6, 56], [-8, 86], 2.3, 0, 0],
    [[2.5, 5], [6, 20], [8, 36], [11, 52], 0.55, 0.5, 0],
    [[8.5, 3], [16, 16], [23, 28], [30, 40], 0.5, 0, 0],
    [[13.5, 2], [21, 12], [28, 20], [34, 26], 0.45, 0, 0],
  ];
  gf.forEach(([a, c1, c2, e, w, brk, fork], i) => {
    fold(g, a, c1, c2, e, w, { seed: seed + 40 + i, brk, tin: 0.25, tout: 0.5, pin: 1.1, pout: 1.6, swell: w > 2 ? 0.3 : 0.08 });
    const pts = cubic(a, c1, c2, e, 10);
    if (fork) carve(g, [pts[4], add(pts[6], [-3, 1]), add(pts[9], [-11, 2])], { w: w * 0.55, tin: 0.4, tout: 0.5, seed: seed + 60 + i });
    if (w >= 1.5) featherEdge(g, pts.slice(2, 9), { side: -1, step: 2.6, depth: 5, w: 0.95, rows: 1, contour: 0, bow: 0.3, lean: -0.35, seed: seed + 180 + i, fade: 0.2 });
    if (w > 2.2) carve(g, [add(pts[3], [-2.6, 1]), add(pts[5], [-3, 1]), add(pts[7], [-2.8, 0])], { w: 0.55, tin: 0.4, tout: 0.5, seed: seed + 160 + i });
  });
  for (let i = 0; i < 4; i++) {
    const x = lerp(-18, 12, i / 3) + (r() - 0.5) * 3;
    const L = 5 + r() * 4;
    carve(g, [[x - 1.2, 0.5], [x - 0.4, L * 0.5], [x + (r() - 0.5) * 2, L]], { w: 1.3, tin: 0.0, tout: 0.9, seed: seed + 70 + i });
  }
  // the knee tents the cloth: hooked folds wrapping round the front of the kneecap,
  // the outer one heavy, the inner ones hairlines
  const K = [44, 58];
  for (let k = 0; k < 3; k++) {
    const rr = 6 + k * 5.5;
    fold(g, [K[0] - 2 - k * 2, K[1] - rr * 0.9], [K[0] + rr * 0.3, K[1] - rr * 0.45], [K[0] + rr * 0.25, K[1] + rr * 0.4], [K[0] - 3 - k * 3, K[1] + rr * 0.85], [0.6, 0.9, 1.9][k], { seed: seed + 80 + k });
  }
  // the lit front of the coat breaks into the paper through feathered cross-contours
  litPlane(g, [[18, -6], [26, 11], [37, 28], [48, 46], [57, 62], [61, hemAt(61) - 8]], { inside: [0, 40], step: 2.1, w: 1.45, contour: 0.85, bow: 0.3, seed: seed + 100,
    depthFn: (q) => 3 + 5 * Math.exp(-Math.pow((q - 0.45) / 0.16, 2)) + 2 * Math.exp(-Math.pow((q - 0.15) / 0.08, 2)), pockets: [[0.0, 0.08, 0.8], [0.62, 0.76, 0.9]] });
  // charms hung off the belt on short cords: a little skull, a knot of beads
  const skullCharm = (c, k) => {
    stroke(g, [[c[0], -2], [c[0] + 0.5, c[1] - 5]], { w: 0.7, tin: 0, tout: 0, seed: seed + 120 + k });
    mass(g, [[c[0] - 4, c[1] - 1], [c[0] - 3.4, c[1] - 5], [c[0], c[1] - 6.4], [c[0] + 3.6, c[1] - 4.6], [c[0] + 3.8, c[1]], [c[0] + 2, c[1] + 3.6], [c[0] - 2, c[1] + 3.6]], { color: BONE, rough: 0.05, seed: seed + 121 + k });
    contourLine(g, [[c[0] - 4, c[1] - 1], [c[0] - 3.4, c[1] - 5], [c[0], c[1] - 6.4], [c[0] + 3.6, c[1] - 4.6], [c[0] + 3.8, c[1]], [c[0] + 2, c[1] + 3.6], [c[0] - 2, c[1] + 3.6]], { closed: true, side: 1, wMin: 0.3, wMax: 1.3, seed: seed + 122 + k });
    g.fillStyle = INK;
    g.beginPath(); g.ellipse(c[0] - 1.6, c[1] - 1.2, 1.3, 1.5, 0, 0, Math.PI * 2); g.ellipse(c[0] + 1.8, c[1] - 1.2, 1.3, 1.5, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 4; i++) stroke(g, [[c[0] - 1.5 + i, c[1] + 1.6], [c[0] - 1.5 + i, c[1] + 3.4]], { w: 0.45, tin: 0, tout: 0.3, seed: seed + 123 + i });
  };
  skullCharm([-17, 15], 0);
  skullCharm([7, 21], 1);
  const loop = cubic([-11, 1], [-10, 16], [0, 18], [1, 2], 9);
  stroke(g, loop, { w: 0.5, tin: 0, tout: 0, seed: seed + 130 });
  loop.slice(1, -1).forEach((b, i) => bead(g, b, i % 3 === 1 ? 1.9 : 1.4, { color: BONE, hl: false }));
  loop.slice(1, -1).forEach((b, i) => { g.fillStyle = INK; g.beginPath(); g.arc(b[0] + 0.3, b[1] + 0.5, 0.6, 0, Math.PI * 2); g.fill(); });
  // dry-brush scrapes rising from the hem (white flecks in the black), in two clumps
  for (let i = 0; i < 10; i++) {
    const x = (i < 6 ? -80 + i * 6 : 4 + (i - 6) * 7) + r() * 2;
    const y = hemAt(x) + 2;
    carve(g, [[x, y], [x - 1 + r() * 2, y - 6 - r() * 16]], { w: 0.5 + r() * 0.9, tin: 0, tout: 0.9, dry: 0.55, seed: seed + 110 + i });
  }
}

// ---- wing rags -----------------------------------------------------------------------------
// root (0,0) on the wing arm, hanging down +y RAG_LEN long, ~26 wide at the root. Long
// ink-soaked strips of cloth and paper: carved creases down their length, bites torn out
// of the edges, the torn end splitting into dry-brush tatters. Variants by `v`.

// screentone: a regular dot pattern (grey by dot size, never a soft ramp), in units
function tone(g, pitch = 2.3, r = 0.62) {
  const S = g.getTransform().a;
  const c = document.createElement('canvas');
  const px = Math.round(pitch * S);
  c.width = px; c.height = px;
  const h = c.getContext('2d');
  h.fillStyle = INK;
  h.beginPath(); h.arc(px / 2, px / 2, r * S, 0, Math.PI * 2); h.fill();
  for (const [x, y] of [[0, 0], [px, 0], [0, px], [px, px]]) { h.beginPath(); h.arc(x, y, r * S * 0.55, 0, Math.PI * 2); h.fill(); }
  const pat = g.createPattern(c, 'repeat');
  pat.setTransform(new DOMMatrix().scale(1 / S, 1 / S));
  return pat;
}

function rag(v, toned = false) {
  return (g) => {
    const seed = 500 + v * 37;
    const FILL = toned ? tone(g) : INK;
    const r = rng(seed);
    const L = RAG_LEN;
    const bend = (y) => 8 * Math.pow(y / L, 2) * (v % 2 ? 1 : -0.7);
    const W = (y) => 13 * (1 - 0.3 * (y / L)) * (1 + 0.07 * Math.sin(y / 17 + v));
    const splitAt = L * (0.7 + r() * 0.14);
    // a twist (variants 1 and 3): the strip turns over, edge-on at tw0, and shows its pale
    // paper face down to tw1 where it turns back. phi is the turn angle.
    const twist = v === 1 || v === 3;
    const tw0 = L * (0.3 + 0.12 * r()), tw1 = Math.min(splitAt - 25, tw0 + 45 + r() * 25), tk = 9;
    const phi = (y) => !twist ? 0 : Math.PI * (smooth(tw0 - tk, tw0 + tk, y) + smooth(tw1 - tk, tw1 + tk, y));
    const cx = (y) => bend(y) + (twist ? 3.5 * Math.sin(phi(y)) : 0);
    const hw = (y) => W(y) * Math.max(0.06, Math.abs(Math.cos(phi(y))));
    const edge = (y0, y1, sgn, bites) => {
      const pts = [];
      for (let y = y0; y <= y1 + 0.01; y += 2.5) {
        const bite = bites && y > 30 && r() < 0.05 ? 2.5 + r() * 3 : 0;
        pts.push([cx(y) + sgn * Math.max(0.5, hw(y) - bite), y]);
      }
      return pts;
    };
    const body = edge(0, splitAt, -1, true).concat(edge(0, splitAt, 1, true).reverse());
    mass(g, body, { color: FILL, rough: 0.45, seed, k: 2 });
    if (toned) contourLine(g, body, { closed: true, side: 1, light: [1, -0.3], wMin: 0.5, wMax: 2.2, seed: seed + 7, breaks: 0 });
    if (twist) {
      // the pale back face between the two turns, its edge inked heavier on the far side
      const face = edge(tw0, tw1, -1, false).concat(edge(tw0, tw1, 1, false).reverse());
      const inset = face.map((p, i) => [p[0] + (i < face.length / 2 ? 1 : -1), p[1]]);
      mass(g, inset, { color: PAPER, rough: 0.12, seed: seed + 1, k: 2 });
      const fax = (s) => { const y = lerp(tw0, tw1, s); return { p: [cx(y), y], d: [0, 1], r: Math.max(0.3, hw(y) - 1) }; };
      // where the face turns away (just after the first turn, just before the second)
      formShade(g, fax, { s0: 0.04, s1: 0.4, core: 0.18, rim: 0.0, feather: 0.7, step: 1.0, w: 0.55, light: [1, 0], seed: seed + 2, endFade: 0.06, bow: 0.2, coreFn: (s) => 0.32 * (1 - s / 0.4) });
      formShade(g, fax, { s0: 0.66, s1: 0.96, core: 0.18, rim: 0.0, feather: 0.6, step: 1.0, w: 0.55, light: [-1, 0], seed: seed + 3, endFade: 0.06, bow: -0.2, coreFn: (s) => 0.28 * ((s - 0.66) / 0.3) });
      // a fold across the paper and a line of the writing on it
      const ym = lerp(tw0, tw1, 0.5);
      stroke(g, [[cx(ym) - hw(ym) * 0.7, ym - 3], [cx(ym), ym + 1], [cx(ym) + hw(ym) * 0.6, ym - 1]], { w: 0.8, tin: 0.3, tout: 0.4, seed: seed + 4 });
      for (let i = 0; i < 3; i++) {
        const y = lerp(tw0, tw1, 0.25 + i * 0.12);
        const x = cx(y) - hw(y) * 0.5;
        stroke(g, [[x, y], [x + hw(y) * 0.35, y - 0.7], [x + hw(y) * 0.75, y + 0.4]], { w: 1.0, tin: 0.1, tout: 0.5, seed: seed + 5 + i });
      }
    }
    // the torn end: 2-3 tatters of very different lengths, dry at the tips
    const nT = 2 + (v % 2);
    for (let i = 0; i < nT; i++) {
      const u = (i + 0.5) / nT;
      const x0 = cx(splitAt) + lerp(-hw(splitAt), hw(splitAt), u) * 0.75;
      const len = (L - splitAt) * (0.35 + r() * 1.1) + 8;
      const tip = [x0 + (u - 0.5) * 9 + bend(splitAt + len) * 0.4, splitAt + len];
      stroke(g, [[x0, splitAt - 10], [lerp(x0, tip[0], 0.5) + (r() - 0.5) * 4, lerp(splitAt, tip[1], 0.5)], tip],
        { w: (2 * hw(splitAt) / nT) * (1.15 + r() * 0.3), tin: 0, tout: 0.85, pout: 1.3, swell: 0, dry: 0.3 + r() * 0.4, edgeDry: 0.45, seed: seed + 10 + i, color: toned ? INK : INK });
    }
    // creases carved down the black, tapered and broken
    const spans = twist ? [[6 + r() * 8, tw0 - tk - 2], [tw1 + tk + 2, splitAt * 0.95]] : [[6 + r() * 8, splitAt * (0.55 + r() * 0.2)], [splitAt * 0.62 + r() * 10, splitAt * 0.97]];
    const nc = 1 + ((v + 1) % 2);
    for (let i = 0; i < nc; i++) {
      const xo = (i - (nc - 1) / 2) * 0.6 + (r() - 0.5) * 0.3;
      for (const [y0, y1] of spans) {
        const pts = [];
        for (let y = y0; y <= y1; y += 9) pts.push([cx(y) + xo * hw(y) + (r() - 0.5) * 1.4, y]);
        if (pts.length >= 2) carve(g, pts, { w: 0.9 + r() * 0.8, seed: seed + 40 + i + Math.floor(y0), tin: 0.2, tout: 0.5 });
      }
    }
    // the lit edge: a broken white hairline just inside it; brightest where it turns
    for (const [y0, y1] of spans) {
      const rim = [];
      for (let y = y0 + 2; y < y1; y += 6) rim.push([cx(y) + hw(y) - 2.2, y]);
      for (let i = 0; i < rim.length - 2; i += 3) if (r() > 0.3) carve(g, rim.slice(i, i + 3), { w: 0.8, seed: seed + 60 + i });
    }
    if (twist) carve(g, [[cx(tw0 - 14) + hw(tw0 - 14) - 1.5, tw0 - 14], [cx(tw0 - 6) + hw(tw0 - 6) * 0.6, tw0 - 6], [cx(tw0 - 1), tw0 - 1]], { w: 1.4, seed: seed + 90 });
  };
}

// ---- wing feathers (round 11) ----------------------------------------------------------------
// root (0,0) on the wing arm, hanging down +y L long. A long black quill feather that
// tapers to a needle point: a narrow leading vane (+x, toward the light) and a broad
// trailing vane (-x) torn by a few splits into separate barb clumps. Its structure is
// CARVED in white, the way Obata draws inside a black mass: a quill shaft that swells at
// the root and dies to a hair before the tip, barb strokes raking off it toward the tip
// (bunched, uneven, tapered at both ends), a broken rim light on the lit edge. Frayed
// black barbs bristle out of the trailing edge as single tapered strokes.

function feather(v, L = 200, far = false) {
  return (g) => {
    const seed = 700 + v * 41 + L + (far ? 300 : 0);
    const r = rng(seed);
    const sweep = (L * 0.06) * (1 + 0.35 * ((v * 7) % 3));
    // round 20: the feather is ONE curved pen stroke, not a ruled shard: the shaft bows
    // out over its belly and the tip whips back (an S, different for every variant)
    const bel = L * (0.035 + 0.012 * (v % 3));
    const cx = (y) => -sweep * 1.5 * Math.pow(y / L, 2.2) + bel * Math.sin(Math.PI * Math.min(1, y / L) * 0.9);
    const WB = 16.5 * (L < 100 ? 1.05 : 1), WL = 6.8;
    // vane profile: the bare quill for a moment, a quick shoulder, a long body, a needle
    const prof = (y) => {
      const t = y / L;
      const sh = smooth(0.02, L < 100 ? 0.2 : 0.16, t);
      const body = t < 0.5 ? 1 : Math.pow(Math.max(0, (1 - t) / 0.5), 0.85 + 0.15 * (v % 2));
      return (0.16 + 0.84 * sh) * body * (1 + 0.06 * Math.sin(t * 9 + v));
    };
    const step = Math.max(1.2, L / 110);
    const trail = [], lead = [];
    for (let y = 0; y <= L + 0.01; y += step) {
      const p = prof(y);
      trail.push([cx(y) - WB * p, y]);
      lead.push([cx(y) + WL * p, y]);
    }
    const body = trail.concat(lead.reverse());
    mass(g, body, { rough: 0.35, seed, k: 2 });
    // splits in the trailing vane: paper wedges cut in from the edge, angled to the tip,
    // so the vane breaks into barb clumps that each end in a point
    const nS = L < 100 ? 1 : 2 + (v % 3 === 0 ? 1 : 0);
    const splits = [];
    for (let i = 0; i < nS; i++) {
      const y = L * lerp(0.36, 0.86, (i + 0.25 + r() * 0.5) / nS);
      const p = prof(y);
      const e = [cx(y) - WB * p - 1.2, y - 3];
      const depth = WB * p * (0.6 + r() * 0.3);
      const inner = [cx(y + depth * 1.0) - WB * prof(y) + depth, y + depth * 1.0];
      splits.push({ e, inner, y });
      spike(g, e, inner, 2.6 + r() * 1.4, { color: PAPER, bend: 0.08, seed: seed + 5 + i, pout: 1.2 });
    }
    // frayed barbs bristling out of the trailing edge: single tapered black strokes
    // round 20: the trailing edge is not a cut line: it is built of many separate tapered
    // barb strokes raking toward the tip, in uneven clumps, so the silhouette is pen work
    const nF = L < 100 ? 6 : 16;
    for (let i = 0; i < nF; i++) {
      const y = L * (0.2 + 0.72 * (i + r() * 0.9) / nF);
      const p = prof(y);
      if (p < 0.12) continue;
      const a = [cx(y) - WB * p * 0.82, y - 3];
      const len = (4 + r() * (L < 100 ? 6 : 13)) * (i % 4 === 1 ? 1.5 : 1);
      const e = [cx(y + len) - WB * p - len * 0.45, a[1] + len];
      spike(g, a, e, 1.4 + r() * 1.6, { bend: 0.12 + r() * 0.1, seed: seed + 20 + i, pout: 2.2 });
    }
    const cw = far ? 0.8 : 1; // the far wing is carved more sparingly
    // the quill shaft: white, close to the leading edge, swelling at the root
    const shaftOff = (y) => cx(y) + WL * prof(y) * 0.22;
    const shaft = [];
    for (let y = L * 0.02; y <= L * 0.86; y += L / 14) shaft.push([shaftOff(y), y]);
    stroke(g, shaft, { w: (L < 100 ? 1.9 : 2.5) * cw, tin: 0.04, tout: 0.75, pin: 0.6, pout: 1.3, swell: 0.25, wob: 0.12, color: PAPER, seed: seed + 40, tooth: 0.04 });
    // barbs: tapered white strokes raking off the shaft toward the tip, in bunches
    const barbs = [];
    let y = L * (0.12 + r() * 0.04);
    while (y < L * 0.8) {
      barbs.push(y);
      y += (L < 100 ? 7 : 9) * (0.55 + r() * 0.9) * (r() < 0.25 ? 2.1 : 1);
    }
    barbs.forEach((yb, i) => {
      const p = prof(yb);
      if (p < 0.25) return;
      const a = [shaftOff(yb) - 1.0, yb + 0.6];
      const reach = WB * p * (0.62 + r() * 0.4);
      const e = [a[0] - reach, a[1] + reach * (0.8 + r() * 0.35)];
      const m = add(mix(a, e, 0.5), [0.6, 0.9], 1.9 + r() * 1.2); // bowed: the barb curves toward the tip
      const bw = (0.75 + r() * 0.85) * cw;
      carve(g, [a, m, e], { w: bw, tin: 0.18, tout: 0.62, seed: seed + 60 + i });
      // now and then a hairline twin just below it: the barbs part in pairs, not a comb
      if (r() < 0.3) carve(g, [add(a, [0, 2.6]), add(m, [0.4, 2.8]), add(mix(m, e, 0.6), [0.4, 2.6])], { w: bw * 0.5, tin: 0.3, tout: 0.6, seed: seed + 70 + i });
    });
    // each split continues inward as a carved line to the shaft
    for (const s of splits) carve(g, [s.inner, mix(s.inner, [shaftOff(s.y + 2), s.y + 2], 0.6), [shaftOff(s.y) - 1.2, s.y - 1]], { w: 0.9 * cw, tin: 0.4, tout: 0.3, seed: seed + 90 });
    // a few short barbs on the narrow leading vane
    if (!far) {
      for (let i = 0; i < (L < 100 ? 2 : 4); i++) {
        const yb = L * (0.2 + i * 0.15 + r() * 0.06);
        const p = prof(yb);
        const a = [shaftOff(yb) + 1.0, yb];
        const e = [a[0] + WL * p * 0.55, a[1] + WL * p * 0.9];
        carve(g, [a, e], { w: 0.75, tin: 0.3, tout: 0.6, seed: seed + 110 + i });
      }
    }
    // the lit edge: a broken white hairline just inside the leading edge
    for (let k = 0; k < 3; k++) {
      const y0 = L * (0.1 + k * 0.24 + r() * 0.05), y1 = y0 + L * (0.1 + r() * 0.08);
      if (y1 > L * 0.85) break;
      const pts = [];
      for (let yy = y0; yy <= y1; yy += L / 40) pts.push([cx(yy) + WL * prof(yy) - 1.3, yy]);
      if (pts.length > 1) carve(g, pts, { w: 0.7 * cw, tin: 0.3, tout: 0.5, seed: seed + 130 + k });
    }
  };
}

// ---- registry -----------------------------------------------------------------------------

export const PARTS = [
  { name: 'uarm', box: [-22, -18, 22, 100], halo: 0.7, bias: { dir: [-0.8, 0.6], min: 0.2 }, draw: uarmHand(false) },
  { name: 'uarm_far', box: [-22, -18, 22, 100], halo: 0.6, bias: { dir: [-0.8, 0.6], min: 0.2 }, draw: uarmHand(true) },
  { name: 'farm', box: [-24, -22, 17, 126], halo: 0.7, bias: { dir: [-0.8, 0.6], min: 0.2 }, draw: farmHand(false) },
  { name: 'farm_far', box: [-24, -22, 17, 126], halo: 0.6, bias: { dir: [-0.8, 0.6], min: 0.2 }, draw: farmHand(true) },
  { name: 'hand_grip', box: [-30, -10, 50, 66], halo: 1.2, draw: blackHandFn('grip') },
  { name: 'hand_claw', box: [-50, -8, 28, 82], halo: 1.2, draw: blackHandFn('claw') },
  { name: 'shin', box: [-32, -22, 22, SHIN_LEN + 10], halo: 0.7, bias: { dir: [-0.8, 0.6], min: 0.2 }, draw: inkShin(false) },
  { name: 'shin_far', box: [-32, -22, 22, SHIN_LEN + 10], halo: 1.1, draw: inkShin(true) },
  { name: 'foot', box: [-24, -8, 50, FOOT_H + 6], halo: 1.2, draw: inkFoot(false) },
  { name: 'foot_far', box: [-24, -8, 50, FOOT_H + 6], halo: 1.0, draw: inkFoot(true) },
  { name: 'torso', box: [-56, -178, 66, 24], halo: 3.4, bias: { dir: [-1, -0.25], min: 0 }, draw: torsoHand },
  { name: 'skirt', box: [-124, -12, 80, SKIRT_LEN + 88], halo: 0, draw: robeHand },
  ...[0, 1, 2, 3, 4].map((v) => ({ name: `rag${v}`, box: [-22, -4, 26, RAG_LEN + 30], halo: 0.6, draw: rag(v) })),
  ...[0, 2, 4].map((v) => ({ name: `ragc${v}`, box: [-22, -4, 26, RAG_LEN + 30], halo: 0, draw: rag(v) })),
  ...[0, 1, 2, 3, 4].map((v) => ({ name: `ragt${v}`, box: [-22, -4, 26, RAG_LEN + 30], halo: 0.8, draw: rag(v, true) })),
  // round 11: carved quill feathers (primaries 200 long, secondaries 120, coverts 60)
  ...[0, 1, 2, 3, 4].map((v) => ({ name: `fp${v}`, box: [-40, -4, 12, 206], halo: 0.7, draw: feather(v, 200) })),
  ...[0, 1, 2].map((v) => ({ name: `ff${v}`, box: [-40, -4, 12, 206], halo: 0.7, draw: feather(v, 200, true) })),
  ...[0, 1, 2].map((v) => ({ name: `fs${v}`, box: [-34, -4, 12, 126], halo: 0.7, draw: feather(v, 120) })),
  ...[0, 1, 2].map((v) => ({ name: `fc${v}`, box: [-28, -4, 12, 66], halo: 0.7, draw: feather(v, 60) })),
  ...[0, 1, 2].map((v) => ({ name: `fk${v}`, box: [-34, -4, 12, 126], halo: 0, draw: feather(v, 120, true) })), // collar: no paper gaps
];

// round 28: how each part's black masses are modelled (paint/model.js), in baked px
export function modelFor(name) {
  // round 31: the black masses are modelled by hand (formhatch.js); this pass only
  // breaks the remaining lit edges, sparser, and no longer combs the carved folds
  if (/^(uarm|farm)/.test(name)) return { len: 34, spacing: 13, width: 4.6, bow: 0.3, axis: [0, 1], folds: 0 };
  if (/^(shin)/.test(name)) return { len: 30, spacing: 12, width: 4.6, bow: 0.3, axis: [0, 1] };
  // round 32: no black 'teeth' on the torso and robe: they read the carved white folds
  // as bone and combed a dotted ink line down the middle of every fold
  if (name === 'torso') return { len: 44, spacing: 14, width: 4.8, bow: 0.25, axis: [0, 1], folds: 0, teeth: 0 };
  if (name === 'skirt') return { len: 40, spacing: 15, width: 4.6, bow: 0.3, axis: [0, 1], folds: 0, teeth: 0 };
  if (/^(fp|ff|fs|fc|fk|rag)/.test(name)) return { len: 20, spacing: 8.5, width: 3.6, bow: 0.4, axis: [0, 1], teeth: 0, minSpan: 8 };
  return null;
}

// round 34: the edge pass per part: cloth, rags and feathers run dry and ragged; the
// bone hands stay tighter (no dry brush, less drift) so the talons keep their points
function edgeFor(name) {
  if (/^(fp|ff|fs|fc|fk|rag)/.test(name)) return { dry: 1, amp: 0.7, press: 0.16 };
  if (name === 'skirt') return { dry: 1, amp: 0.9, press: 0.16 };
  if (name === 'torso') return { dry: 0.6, amp: 0.8 };
  if (/^hand/.test(name)) return { dry: 0, amp: 0.45, amp2: 0.2, press: 0.1 };
  return { dry: 0.45, amp: 0.7 };
}

const baked = {};
export async function bakeParts(names, S = 3) {
  const out = [];
  for (const P of PARTS) {
    if (names && !names.includes(P.name)) continue;
    const [x0, y0, x1, y1] = P.box;
    const w = Math.ceil((x1 - x0) * S), h = Math.ceil((y1 - y0) * S);
    let c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.setTransform(S, 0, 0, S, -x0 * S, -y0 * S);
    g.lineJoin = 'round';
    P.draw(g);
    const M = modelFor(P.name);
    if (M) modelInk(c, { ...M, seed: P.name.length * 31 + P.name.charCodeAt(P.name.length - 1) });
    // round 34: every edge re-inked as ink on paper (wobble, pressure, bleed, dry brush)
    inkEdge(c, { S, seed: P.name.length * 13 + P.name.charCodeAt(0) * 7 + P.name.charCodeAt(P.name.length - 1), ...edgeFor(P.name) });
    if (P.halo) c = haloVar(c, P.halo * S, PAPER, P.bias || null, { seed: P.name.length * 17 + P.name.charCodeAt(0) * 3 + P.name.charCodeAt(P.name.length - 1), wave: (P.wave || 22) * S, lo: -1.0, hi: 2.3 }); // round 34: a broken paper gap, never a keyline
    baked[P.name] = c;
    out.push({ name: P.name, box: P.box, w, h, png: c.toDataURL('image/png') });
  }
  return out;
}

// contact sheet: every part at game scale (1.25 px/unit) above the full bake
export function bakeSheet(names, S = 3) {
  const list = PARTS.filter((P) => (!names || names.includes(P.name)) && baked[P.name]);
  const gs = 1.25 / S;
  let W = 20, H = 0;
  for (const P of list) { const c = baked[P.name]; W += c.width + 20; H = Math.max(H, c.height); }
  const sheet = document.createElement('canvas');
  sheet.width = Math.min(8000, W); sheet.height = Math.ceil(H * (1 + gs)) + 60;
  const g = sheet.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, sheet.width, sheet.height);
  let x = 20;
  for (const P of list) {
    const c = baked[P.name];
    g.imageSmoothingQuality = 'high';
    g.drawImage(c, x, 20, c.width * gs, c.height * gs);
    g.drawImage(c, x, 40 + H * gs, c.width, c.height);
    x += c.width + 20;
  }
  return sheet.toDataURL('image/png');
}
if (typeof window !== 'undefined') window.bakeSheet = bakeSheet;

// round 24: an authoring view: one part on paper at S px/unit with a 10-unit grid
// (labelled every 20) to place hand-drawn strokes against, plus a game-scale inset
export function previewPart(name, S = 4, grid = true) {
  const P = PARTS.find((q) => q.name === name);
  const [x0, y0, x1, y1] = P.box;
  const w = Math.ceil((x1 - x0) * S), h = Math.ceil((y1 - y0) * S);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  let g = c.getContext('2d');
  g.setTransform(S, 0, 0, S, -x0 * S, -y0 * S);
  g.lineJoin = 'round';
  P.draw(g);
  const hc = P.halo ? halo(c, P.halo * S, PAPER, P.bias || null) : c;
  const gs = 1.25 / S;
  const out = document.createElement('canvas');
  out.width = w + Math.ceil(w * gs * 2) + 30; out.height = h;
  g = out.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, out.width, out.height);
  g.drawImage(hc, 0, 0);
  g.imageSmoothingQuality = 'high';
  g.drawImage(hc, w + 20, 10, w * gs, h * gs);
  g.drawImage(hc, w + 20, 30 + h * gs, w * gs * 2, h * gs * 2);
  if (grid) {
    g.save();
    g.font = '10px monospace';
    for (let x = Math.ceil(x0 / 10) * 10; x <= x1; x += 10) {
      g.strokeStyle = x === 0 ? 'rgba(220,0,0,0.6)' : 'rgba(0,120,255,0.28)';
      g.beginPath(); g.moveTo((x - x0) * S + 0.5, 0); g.lineTo((x - x0) * S + 0.5, h); g.stroke();
      if (x % 20 === 0) { g.fillStyle = 'rgba(0,90,220,0.9)'; g.fillText(String(x), (x - x0) * S + 2, 10); }
    }
    for (let y = Math.ceil(y0 / 10) * 10; y <= y1; y += 10) {
      g.strokeStyle = y === 0 ? 'rgba(220,0,0,0.6)' : 'rgba(0,120,255,0.28)';
      g.beginPath(); g.moveTo(0, (y - y0) * S + 0.5); g.lineTo(w, (y - y0) * S + 0.5); g.stroke();
      if (y % 20 === 0) { g.fillStyle = 'rgba(0,90,220,0.9)'; g.fillText(String(y), 2, (y - y0) * S - 2); }
    }
    g.restore();
  }
  return out.toDataURL('image/png');
}
if (typeof window !== 'undefined') window.previewPart = previewPart;
