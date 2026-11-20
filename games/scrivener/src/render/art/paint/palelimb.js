// Round 20: the Scrivener's limbs DRAWN as pen-and-brush figure work instead of filled.
// Each segment is bone-white paper held by one ink contour that swells to a heavy
// stroke on the shadow side and thins to a hairline (and breaks) where it faces the
// light (Obata refs 03 and 13). Inside it, a solid shadow shape runs down the shadow
// side, kept off the contour by a sliver of reflected light, and its inner edge breaks
// into the light through short curved hatch strokes that wrap the volume (cross-
// contours), crossed by a second, steeper set only in the deep pockets (the crook of a
// joint, under a belly). Muscle grooves and tendons are single tapered strokes.
// Owner: art. Frames as in parts.js (limb pivot = proximal joint, bone runs down +y,
// +x = front/lit side; the light comes from the upper front).

import {
  INK, BONE, PAPER, rng, noise1, lerp, clamp, add, mix, norm, spline, resample,
  stroke, carve, mass, contourLine, wrapHatch, formShade, ribbonPts,
} from './brush.js';

export const L_LIMB = norm([0.8, -0.6]);

// axis sampler from the two edges: centre, unit direction, half-width, edge points
export function limbAxis(front, back) {
  const F = resample(spline(front, 10), 0.25), B = resample(spline(back, 10), 0.25);
  const at = (A, s) => { const f = clamp(s, 0, 1) * (A.length - 1); const i = Math.floor(f), k = f - i; const a = A[i], b = A[Math.min(A.length - 1, i + 1)]; return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]; };
  return (s) => {
    const f = at(F, s), b = at(B, s);
    const f2 = at(F, s + 0.01), b2 = at(B, s + 0.01), f1 = at(F, s - 0.01), b1 = at(B, s - 0.01);
    const d = norm([(f2[0] + b2[0]) / 2 - (f1[0] + b1[0]) / 2, (f2[1] + b2[1]) / 2 - (f1[1] + b1[1]) / 2]);
    return { p: mix(f, b, 0.5), d, r: Math.hypot(f[0] - b[0], f[1] - b[1]) / 2, f, b };
  };
}

/**
 * paleBody: a drawn limb segment.
 *  coreFn(s)  width of the solid shadow on the back (fraction of the diameter)
 *  feather    reach of the hatch out of the shadow into the light (fraction of diameter)
 *  pockets    [[s0, s1, len]] crosshatch in the deep pockets (second, steeper set)
 *  grooves    [{ pts, w, o }] tapered ink strokes inside: muscle grooves, tendons, ridges
 *  lit        [{ s0, s1, n, len }] short curved hatch groups on the lit round (a few
 *             strokes off the front contour, wrapping the form, hairline at their ends)
 *  far        a limb further back: darker (wider shadow), lighter contour
 *  carves     [{ pts, w, o }] round 21: WHITE strokes cut into the shadow shape (a bone
 *             ridge catching reflected light, the lower edge of a belly, a crescent
 *             wrapping a knob), so the black is carved, not a flat strip
 *  crook      [[s0, s1, len]] round 21: crosshatch (two crossing sets) in a pocket on
 *             the LIT side (the crook of a joint)
 */
export function paleBody(g, front, back, o = {}) {
  const {
    seed = 1, coreFn = () => 0.3, feather = 0.5, pockets = [], grooves = [], lit = [], far = false,
    wMax = 2.8, rim = 0.13, extra = null, step = 1.7, groups = 9, carves = [], crook = [], coreMax = Infinity,
  } = o;
  const outline = front.concat(back.slice().reverse());
  const ax = limbAxis(front, back);
  const dk = far ? 0.16 : 0;
  mass(g, outline, { color: BONE, rough: 0.12, seed });
  // the shadow shape + the hatch that feathers it into the light, wrapping the volume
  formShade(g, ax, {
    s0: 0, s1: 1, coreFn: (s) => Math.min(coreMax, coreFn(s) + dk), rim: far ? 0.08 : rim, feather: feather * (far ? 0.8 : 1),
    step, w: 1.0, bow: 0.55, light: L_LIMB, seed: seed * 7 + 1, endFade: 0.03, coreNoise: 0.35, groups,
  });
  // crosshatch only in the deep pockets
  pockets.forEach(([s0, s1, len], i) => wrapHatch(g, ax, { s0, s1, step: 1.35, len, w: 0.72, bow: -0.6, light: L_LIMB, seed: seed * 17 + i, jitter: 0.5 }));
  // crosshatch in a pocket on the lit side: hatched in from the front contour, two sets
  if (crook.length) {
    const A = ax(0.5), nn = [-A.d[1], A.d[0]];
    const litSd = (nn[0] * L_LIMB[0] + nn[1] * L_LIMB[1]) > 0 ? 1 : -1;
    crook.forEach(([s0, s1, len], i) => {
      wrapHatch(g, ax, { s0, s1, step: 1.25, len, w: 0.8, bow: 0.7, light: L_LIMB, seed: seed * 23 + i, jitter: 0.4, sideFix: litSd });
      wrapHatch(g, ax, { s0: s0 + (s1 - s0) * 0.15, s1: s1 - (s1 - s0) * 0.1, step: 1.5, len: len * 0.75, w: 0.62, bow: -0.75, light: L_LIMB, seed: seed * 29 + i, jitter: 0.5, sideFix: litSd });
    });
  }
  // short curved hatch groups off the lit contour (the form turning on the light side)
  const r = rng(seed * 3 + 7);
  g.fillStyle = INK;
  g.beginPath();
  lit.forEach(({ s0, s1, n = 4, len = 0.22, w = 0.75 }, gi) => {
    for (let i = 0; i < n; i++) {
      const s = lerp(s0, s1, (i + 0.5 + (r() - 0.5) * 0.4) / n);
      const A = ax(s);
      const toB = norm([A.b[0] - A.f[0], A.b[1] - A.f[1]]);
      const L = len * (0.6 + r() * 0.7) * (1 - Math.abs((i + 0.5) / n - 0.5));
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const u = (k / 6) * L;
        pts.push(add(add(A.f, toB, 0.5 + u * A.r * 2), A.d, Math.sin(u * Math.PI) * A.r * 0.45));
      }
      ribbonPts(g, pts, (t) => w * (0.8 + r() * 0.4) * Math.pow(1 - t, 1.1) + 0.03, seed + 400 + gi * 20 + i);
    }
  });
  g.fill();
  if (extra) extra(g);
  // grooves and tendons: single tapered strokes, swelling where they turn into shadow
  grooves.forEach((gr, i) => stroke(g, gr.pts, { w: gr.w, tin: 0.3, tout: 0.55, pin: 1, pout: 1.5, swell: 0.15, wob: 0.12, tooth: 0.05, seed: seed * 5 + i, ...(gr.o || {}) }));
  // white carving in the black: tapered both ends, never on the far limb's hairlines
  carves.forEach((cv, i) => carve(g, cv.pts, { w: cv.w * (far ? 0.8 : 1), tin: 0.3, tout: 0.5, pin: 1, pout: 1.5, swell: 0.12, wob: 0.08, tooth: 0.04, seed: seed * 11 + i, ...(cv.o || {}) }));
  // the contour: heavy on the shadow side, a broken hairline on the lit side
  contourLine(g, outline, { closed: true, side: 1, light: L_LIMB, wMin: 0.12, wMax: wMax * (far ? 0.85 : 1), seed: seed + 5, breaks: 0.42 });
}

// a bony knob at a joint on a pale limb: a small closed shape held by its own contour,
// heavy under it, with a crescent of shade and a few hatch strokes on its shadow side
export function paleKnob(g, c, rx, ry, rot, seed = 1) {
  g.save();
  g.translate(c[0], c[1]); g.rotate(rot);
  g.fillStyle = BONE; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = INK;
  g.beginPath();
  // a shade crescent on the underside (away from the light)
  const P = [];
  for (let k = 0; k <= 16; k++) { const a = 0.15 + (k / 16) * (Math.PI - 0.3); P.push([Math.cos(a) * rx, Math.sin(a) * ry]); }
  ribbonPts(g, P, (t) => Math.sin(Math.PI * t) * Math.min(rx, ry) * 0.55 + 0.1, seed);
  g.fill();
  g.restore();
  // the outline, tapering on top
  const pts = [];
  for (let k = 0; k <= 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    pts.push([c[0] + x * Math.cos(rot) - y * Math.sin(rot), c[1] + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  contourLine(g, pts.slice(0, -1), { closed: true, side: 1, light: L_LIMB, wMin: 0.1, wMax: 1.3, seed: seed + 3, breaks: 0.5 });
}

export { PAPER };
