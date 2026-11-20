// Round 22: the Scrivener's arms as GAUNT, SEGMENTED, BONY limbs (Obata refs 01, 03):
// skin shrunk onto two forearm bones, so the silhouette is a chain of knots (olecranon
// hook, a short lean belly, a long starved shaft, the ulna head and styloid swelling the
// wrist again) instead of a smooth club. Inside: a black interosseous valley parts the
// radius from the ulna; the shadow shape on the underside is carved by a white ulna crest
// and a crescent under the belly; cross-contour hatch wraps the shafts; a cord binding
// and a row of beads segment the shaft like a ledger strap. The contour swells to a
// heavy brush line on the shadow side and breaks to a hairline on the lit side.
// Owner: art. Frames as in parts.js (pivot = proximal joint, bone runs down +y, +x = lit).

import { INK, PAPER, BONE, HI, rng, lerp, clamp, add, mix, norm, stroke, carve, mass, contourLine, wrapHatch, formShade, ribbonPts, spike } from './brush.js';
import { limbAxis, L_LIMB, paleKnob } from './palelimb.js';

const G = (s, m, w) => Math.exp(-Math.pow((s - m) / w, 2));

// a cord binding: `turns` wraps of thin black cord round the limb at s0..s1, each an
// ellipse arc across the cylinder (bowed down the axis), with a white hairline riding
// its upper edge, and a frayed loose end trailing off the shadow side
function binding(g, ax, s0, s1, turns, seed, far) {
  const r = rng(seed);
  for (let k = 0; k < turns; k++) {
    const s = lerp(s0, s1, turns > 1 ? k / (turns - 1) : 0.5) + (r() - 0.5) * 0.006;
    const A = ax(s);
    const toB = norm([A.b[0] - A.f[0], A.b[1] - A.f[1]]);
    const P = [];
    for (let j = 0; j <= 10; j++) {
      const u = j / 10;
      P.push(add(add(A.f, toB, -0.6 + u * (A.r * 2 + 1.2)), A.d, Math.sin(u * Math.PI) * A.r * 0.42 + (u - 0.5) * 1.4));
    }
    stroke(g, P, { w: 2.3 + r() * 0.5, tin: 0.04, tout: 0.04, pin: 1, pout: 1, swell: 0, wob: 0.1, tooth: 0.05, seed: seed + k * 3 });
    if (!far) carve(g, P.slice(1, 7).map((p) => add(p, A.d, -0.55)), { w: 0.7, tin: 0.2, tout: 0.6, seed: seed + k * 3 + 1 });
  }
  // the loose end, frayed
  const A = ax(s1);
  const e0 = add(A.b, A.d, 1.0);
  const tail = [e0, add(add(e0, A.d, 5), [-2.4, 0]), add(add(e0, A.d, 10), [-1.4, 0]), add(add(e0, A.d, 15), [-3.6, 0])];
  stroke(g, tail, { w: 2.0, tin: 0, tout: 0.9, pout: 1.6, swell: 0, wob: 0.25, dry: 0.4, seed: seed + 50 });
  stroke(g, [add(e0, A.d, 3), add(add(e0, A.d, 7), [-4.4, 0]), add(add(e0, A.d, 10), [-6.8, 0])], { w: 1.1, tin: 0, tout: 0.9, pout: 1.6, swell: 0, wob: 0.2, seed: seed + 51 });
}

// a row of small closed beads wrapping the limb at s: each ringed in ink, a shade crescent
// on its underside, one dot of shine (ornament as accumulated small shapes, ref 01)
function beadRow(g, ax, s, n, rad, seed, far) {
  const r = rng(seed);
  const A = ax(s);
  const toB = norm([A.b[0] - A.f[0], A.b[1] - A.f[1]]);
  // the cord under them
  const P = [];
  for (let j = 0; j <= 10; j++) { const u = j / 10; P.push(add(add(A.f, toB, -0.4 + u * (A.r * 2 + 0.8)), A.d, Math.sin(u * Math.PI) * A.r * 0.4)); }
  stroke(g, P, { w: 0.9, tin: 0.05, tout: 0.05, pin: 1, pout: 1, swell: 0, wob: 0.05, seed });
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const c = add(add(A.f, toB, u * A.r * 2), A.d, Math.sin(u * Math.PI) * A.r * 0.4);
    const rr = rad * (0.85 + 0.3 * r()) * (0.75 + 0.25 * Math.sin(u * Math.PI)); // foreshortened at the edges
    g.fillStyle = INK; g.beginPath(); g.arc(c[0], c[1], rr + 0.55, 0, Math.PI * 2); g.fill();
    g.fillStyle = far ? '#cfc8b4' : BONE; g.beginPath(); g.arc(c[0], c[1], rr, 0, Math.PI * 2); g.fill();
    // shade on the side away from the light, heavier toward the shadow edge of the limb
    g.fillStyle = INK; g.beginPath();
    g.arc(c[0], c[1], rr, Math.atan2(L_LIMB[1], L_LIMB[0]) + Math.PI - 1.3 - u * 0.3, Math.atan2(L_LIMB[1], L_LIMB[0]) + Math.PI + 1.3 + u * 0.3);
    g.closePath(); g.fill();
    g.fillStyle = HI; g.beginPath(); g.arc(c[0] + L_LIMB[0] * rr * 0.4, c[1] + L_LIMB[1] * rr * 0.4, Math.max(0.35, rr * 0.28), 0, Math.PI * 2); g.fill();
  }
}

// the body of a bony segment: bone fill, a carved shadow shape, wrapping hatch, ink
// grooves, white carves and the swelling contour (drawn last, over everything)
function segment(g, front, back, o) {
  const { seed, far, coreFn, feather = 0.5, pockets = [], grooves = [], carves = [], lit = [], wMax = 3.0, extra = null, after = null } = o;
  const outline = front.concat(back.slice().reverse());
  const ax = limbAxis(front, back);
  mass(g, outline, { color: BONE, rough: 0.14, seed });
  if (extra) extra(g, ax);
  formShade(g, ax, {
    s0: 0, s1: 1, coreFn: (s) => coreFn(s) + (far ? 0.14 : 0), rim: far ? 0.07 : 0.12, feather: feather * (far ? 0.8 : 1),
    step: 1.45, w: 1.15, bow: 0.6, light: L_LIMB, seed: seed * 7 + 1, endFade: 0.02, coreNoise: 0.3, groups: 7,
  });
  pockets.forEach(([s0, s1, len], i) => wrapHatch(g, ax, { s0, s1, step: 1.3, len, w: 0.8, bow: -0.65, light: L_LIMB, seed: seed * 17 + i, jitter: 0.5 }));
  // short curved hatch groups riding in off the LIT contour over the bony bumps
  const r = rng(seed * 3 + 7);
  g.fillStyle = INK;
  g.beginPath();
  lit.forEach(({ s0, s1, n = 4, len = 0.25, w = 0.85 }, gi) => {
    for (let i = 0; i < n; i++) {
      const s = lerp(s0, s1, (i + 0.5 + (r() - 0.5) * 0.4) / n);
      const A = ax(s);
      const toB = norm([A.b[0] - A.f[0], A.b[1] - A.f[1]]);
      const L = len * (0.6 + r() * 0.7) * (1 - 0.8 * Math.abs((i + 0.5) / n - 0.5));
      const pts = [];
      for (let k = 0; k <= 6; k++) { const u = (k / 6) * L; pts.push(add(add(A.f, toB, 0.4 + u * A.r * 2), A.d, Math.sin(u * Math.PI) * A.r * 0.55)); }
      ribbonPts(g, pts, (t) => w * (0.8 + r() * 0.4) * Math.pow(1 - t, 1.1) + 0.03, seed + 400 + gi * 20 + i);
    }
  });
  g.fill();
  grooves.forEach((gr, i) => stroke(g, gr.pts, { w: gr.w, tin: 0.25, tout: 0.5, pin: 1, pout: 1.5, swell: 0.2, wob: 0.1, tooth: 0.05, seed: seed * 5 + i, ...(gr.o || {}) }));
  carves.forEach((cv, i) => carve(g, cv.pts, { w: cv.w * (far ? 0.8 : 1), tin: 0.25, tout: 0.5, pin: 1, pout: 1.5, swell: 0.15, wob: 0.06, tooth: 0.04, seed: seed * 11 + i, ...(cv.o || {}) }));
  if (after) after(g, ax);
  contourLine(g, outline, { closed: true, side: 1, light: L_LIMB, wMin: 0.1, wMax: wMax * (far ? 0.85 : 1), seed: seed + 5, breaks: 0.3 });
  return ax;
}

// ---- forearm: elbow (0,0) -> wrist (0,106) --------------------------------------------
// round 23: a WEDGE, not a bone shaft: the flexor/extensor mass swells wide just below
// the elbow (~29 across) and the forearm runs lean and tapering into a wrist pinched to
// ~9, where the ulna head and the radial styloid push the edge out again. The olecranon
// is a hooked point on the back with a notch under it, never a round ball joint.
export const FORE_FRONT = [[3.0, -6], [8.0, -2], [12.5, 5], [14.6, 13], [13.6, 21], [11.0, 30], [8.4, 38], [7.6, 46], [7.2, 54], [6.0, 64], [4.8, 76], [4.0, 85], [3.5, 91], [5.0, 96], [4.8, 101], [3.8, 108]];
export const FORE_BACK = [[-4.0, -10], [-10.0, -12.2], [-15.0, -9.2], [-16.6, -4.2], [-14.6, 0.8], [-11.6, 4.2], [-12.8, 10], [-15.2, 19], [-14.8, 28], [-12.6, 37], [-11.0, 44], [-10.2, 52], [-8.6, 63], [-7.0, 74], [-5.9, 84], [-5.2, 89.5], [-7.4, 93.6], [-7.8, 98.2], [-5.8, 102], [-4.4, 108]];

export function boneFore(g, far, seed) {
  const S = (y) => (y + 12.2) / 120.2;
  segment(g, FORE_FRONT, FORE_BACK, {
    seed, far, wMax: 3.3,
    // the shadow: half the arm under the olecranon and the flexor belly, thinning down
    // the lean shaft, gathering again over the wrist bones
    coreFn: (s) => 0.2 + 0.26 * G(s, S(-4), 0.06) + 0.24 * G(s, S(20), 0.1) + 0.06 * G(s, S(58), 0.12) + 0.2 * G(s, S(95), 0.04),
    feather: 0.6,
    pockets: [[S(-7), S(5), 0.5], [S(86), S(93), 0.42]],
    lit: far ? [] : [{ s0: S(4), s1: S(22), n: 6, len: 0.32 }, { s0: S(34), s1: S(46), n: 4, len: 0.22, w: 0.75 }, { s0: S(92), s1: S(101), n: 3, len: 0.24, w: 0.75 }],
    extra: (h) => spike(h, [-10, -3], [-23, -19], 8.5, { bend: 0.14, seed: seed + 3, pout: 2 }),
    grooves: [
      // elbow crease out of the crook
      { pts: [[11.6, 4.4], [7.4, 7.0], [2.6, 6.6], [-1.6, 3.6]], w: 1.4, o: { tout: 0.6 } },
      // the brachioradialis' belly: a groove under its swell, falling into the shaft
      { pts: [[13.0, 14], [10.6, 24], [7.4, 33]], w: 1.0, o: { tin: 0.2, tout: 0.7 } },
      // three TENDONS run out of the bellies and converge into the pinched wrist
      { pts: [[5.4, 50], [4.8, 63], [3.8, 76], [2.6, 88]], w: 0.95, o: { tin: 0.25, tout: 0.5, press: (t) => 1.1 - 0.35 * t } },
      { pts: [[1.6, 58], [1.4, 70], [0.8, 81], [0.4, 89]], w: 0.75, o: { tin: 0.3, tout: 0.5 } },
      { pts: [[-2.4, 66], [-2.2, 76], [-1.6, 86]], w: 0.6, o: { tin: 0.3, tout: 0.5 } },
      // wrist crease, the carpal fold under it
      { pts: [[4.0, 91.6], [1.0, 93.4], [-4.0, 92.8]], w: 1.15, o: { tout: 0.55 } },
      { pts: [[4.6, 101.4], [2.0, 103.2], [-2.2, 102.6]], w: 0.8, o: { tin: 0.2, tout: 0.6 } },
    ],
    carves: [
      // the olecranon's rim inside the black
      { pts: [[-4.6, -7.0], [-10.2, -8.6], [-13.8, -5.0], [-13.4, -0.4]], w: 1.25, o: { tout: 0.6 } },
      // the ULNA RIDGE: the bone runs under the skin the whole length of the back edge,
      // one long white line catching reflected light, pressing hardest mid-shaft
      { pts: [[-11.0, 9], [-12.0, 19], [-11.2, 31], [-9.6, 43], [-8.0, 56], [-6.8, 68], [-5.8, 80], [-5.4, 87]], w: 1.35, o: { tin: 0.15, tout: 0.4, press: (t) => 0.6 + 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.2)) } },
      // crescents carved ACROSS the shadow under the flexor belly (it wraps)
      { pts: [[-2.4, 27], [-6.0, 31.0], [-10.0, 33.0]], w: 1.2, o: { tin: 0.25, tout: 0.5 } },
      { pts: [[-3.0, 13], [-6.4, 15.6], [-9.8, 16.6]], w: 0.85, o: { tin: 0.3, tout: 0.6 } },
    ],
    after: (h) => {
      // the interosseous valley: the radius rolls over the ulna, a dark wedge twisting
      // from the outer elbow across the shaft toward the inner wrist, widest where the
      // bones bow apart; two overlapping strokes, never one ruled stripe
      stroke(h, [[-3.0, 8], [-1.4, 17], [0.8, 28], [2.0, 40], [1.8, 50]], { w: 2.8, tin: 0.18, tout: 0.6, pin: 1.1, pout: 1.7, swell: 0.35, wob: 0.2, seed: seed + 600 });
      stroke(h, [[0.6, 46], [-0.4, 57], [-1.4, 67], [-2.0, 76], [-1.6, 84]], { w: 1.5, tin: 0.3, tout: 0.5, pin: 1.2, pout: 1.4, swell: 0.2, wob: 0.15, seed: seed + 601 });
      if (!far) {
        const r = rng(seed + 610);
        h.fillStyle = INK; h.beginPath();
        for (let y = 30; y < 56; y += 2.2 + r() * 0.9) {
          const x = 1.4 + 0.3 * (y - 30) / 26;
          ribbonPts(h, [[x, y], [x + 1.7, y + 1.0], [x + 3.0, y + 2.6]], (t) => 0.55 * (1 - t) + 0.03, seed + 620 + y);
        }
        h.fill();
      }
    },
  });
  // bone through the skin at the wrist: the ulna head on the back, the radial styloid
  paleKnob(g, [-6.4, 96.0], 2.4, 1.9, 0.6, seed + 330);
  paleKnob(g, [3.6, 97.8], 1.7, 1.3, 0.2, seed + 335);
}

// ---- upper arm: shoulder (0,0) -> elbow (0,86); a sleeve hides it to y ~ 36 -------------
// round 23: no dumbbell (fat belly, hard pinch, ball condyles): the humerus' muscle
// thins steadily from the deltoid to the elbow and the condyles only widen it a little
export const UP_FRONT = [[7.6, 20], [10.2, 30], [10.6, 40], [9.4, 50], [7.8, 60], [6.6, 70], [6.6, 78], [7.8, 85], [7.4, 91], [4.6, 96]];
export const UP_BACK = [[-9.6, 20], [-12.4, 30], [-12.6, 40], [-11.2, 50], [-9.4, 60], [-8.0, 70], [-8.6, 77], [-10.4, 84], [-10.6, 89.5], [-8.6, 93.5], [-5.0, 96]];

export function boneUpper(g, far, seed) {
  const S = (y) => (y - 20) / 76;
  segment(g, UP_FRONT, UP_BACK, {
    seed, far, wMax: 3.0,
    coreFn: (s) => 0.25 + 0.2 * G(s, S(44), 0.15) + 0.22 * G(s, S(86), 0.08),
    feather: 0.55,
    pockets: [[S(36), S(46), 0.5], [S(78), S(90), 0.45]],
    lit: far ? [] : [{ s0: S(40), s1: S(54), n: 5, len: 0.28 }, { s0: S(78), s1: S(88), n: 3, len: 0.22, w: 0.75 }],
    grooves: [
      { pts: [[-1.8, 36], [1.2, 45], [1.6, 54], [0.6, 61]], w: 1.3, o: { swell: 0.3 } },
      { pts: [[0.2, 64], [-0.6, 71], [-1.4, 77]], w: 0.85 },
      { pts: [[8.4, 81], [4.6, 83.6], [0.2, 83.0]], w: 1.2, o: { tout: 0.65 } },
    ],
    carves: [
      { pts: [[-11.0, 36], [-11.8, 46], [-9.6, 56], [-7.4, 64], [-7.0, 72]], w: 1.15, o: { tin: 0.2, tout: 0.5 } },
      { pts: [[-3.4, 52], [-7.0, 56.2], [-10.6, 57.6]], w: 1.1, o: { tin: 0.2, tout: 0.5 } },
      { pts: [[-5.0, 79.6], [-9.0, 80.6], [-11.6, 84.6], [-11.0, 89]], w: 1.0, o: { tout: 0.6 } },
    ],
  });
  paleKnob(g, [-9.2, 87.0], 3.0, 1.6, 1.05, seed + 330);
  paleKnob(g, [6.2, 87.4], 1.9, 1.4, 0.3, seed + 335);
}

export { PAPER, clamp, mix };
