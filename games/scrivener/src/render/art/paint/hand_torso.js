// Round 24: the torso, drawn stroke by stroke. Owner: art.
// Frame as in parts.js: hip (0,0), the spine runs up -y and rolls forward into the hump,
// the neck leaves at the top right (+x forward). Light from the upper front.
// Every line below is one deliberate mark (see pen.js for the format).
import { ink } from './pen.js';
import { within, fold, fringe, pocket, dropHairlines } from './formhatch.js';

export const TORSO = `
# ---- round 25: ONE black slab. The cage is not a pale plane of separate bones: it is
#      carved INTO the black, every rib a single white negative line that leaves the
#      spine as a hair, swells as it rounds into the light and breaks before the
#      sternum. The chest barrels forward out of the hump, the waist is sucked in.
K 53 -146, 36 -141, 18 -134, 0 -125, -18 -114, -31 -102, -37 -88, -36 -74, -32 -60, -28 -46, -25 -32, -24 -18, -26 -4, -27 6, -22 14, 13 14, 13 0, 7 -13, 0 -27, -4 -39, -3 -50, 2 -60, 12 -70, 24 -81, 36 -94, 47 -107, 56 -120, 62 -133, 65 -146

# the vertebral knots the ribs hang from: small closed bone shapes in the black
B 27 -138, 31 -138.5, 31.5 -134, 28 -133
B 14.5 -132, 18.5 -132.6, 19 -127.6, 15 -127
B 3 -126.4, 7.4 -127, 7.6 -121.6, 3.6 -121
B -9.8 -118.6, -5.6 -119, -5.4 -113.8, -9.4 -113.4
B -20 -109.6, -16.4 -110, -16 -105.4, -19.6 -105

# the ribs, carved: unequal, three crowding under the shoulder, a gap, two long, a stub
w 29 -134 0.2, 32 -130.4 0.9, 37.4 -127 1.6, 44.4 -125.6 1.5, 51 -126.6 0.7, 56 -129.6 0.05
w 17 -128 0.25, 20.6 -122.4 1.1, 26.6 -117.6 1.9, 34.4 -115.4 1.8, 42.4 -115.8 0.9, 49 -118.6 0.05
w 5.6 -120.6 0.3, 9 -113 1.3, 14.6 -106.4 2.0, 22.4 -103.2 2.0, 31 -103.4 1.1, 38 -106.4 0.05
w -7 -112 0.3, -4.4 -103 1.3, 0.8 -95.4 2.2, 8.8 -90.8 2.3, 18 -89.6 1.5, 26 -91.4 0.6, 31 -94 0.05
w -17.4 -103 0.25, -15.4 -93.4 1.1, -10 -85.2 1.9, -2 -79.8 2.1, 7 -78.6 1.3, 14.6 -80.4 0.4, 19 -82.4 0.05
w -24.6 -91 0.2, -22.6 -82 0.9, -17.6 -74.8 1.4, -10.4 -70 1.4, -2.6 -68.8 0.6, 3.6 -70 0.05
w -28.4 -78 0.15, -26.6 -71.6 0.7, -22.4 -66.8 0.6, -17.6 -64.6 0.05
# each rib's lower edge: a shorter, thinner echo only where the rib turns into the light
w 40 -122.6 0.05, 45.6 -121.8 0.6, 50.6 -123 0.05
w 30.6 -111.8 0.05, 37 -111 0.75, 43.6 -112.4 0.05
w 20 -99.8 0.05, 27.6 -99.2 0.85, 34 -101.4 0.05
w 7.4 -86.4 0.05, 16.6 -85.6 0.9, 24.4 -87.4 0.05
w -1 -75.8 0.05, 7 -75 0.7, 13 -76.4 0.05
# hatching wrapping the barrel between the ribs: short white strokes laid along the
# ribs, out of the lit front, shortening into the shadow, dying to points
w 52.6 -122.2 0.7, 48 -120.8 0.45, 44.6 -120.4 0.05
w 45 -110 0.8, 40.4 -108.4 0.5, 36.6 -108 0.05
w 44 -106.8 0.5, 40.6 -105.6 0.3, 38 -105.4 0.05
w 35 -96.6 0.9, 29.6 -95 0.55, 25.4 -94.8 0.05
w 33.4 -93.4 0.55, 29.4 -92.6 0.3, 27 -92.6 0.05
w 22.8 -82.6 0.8, 17.4 -81.6 0.5, 13.6 -81.6 0.05
w 21 -79.4 0.5, 17.4 -78.6 0.3, 15 -78.6 0.05
w 12 -71.4 0.6, 7.6 -70.8 0.35, 5 -70.8 0.05
# the sternum: three knuckled white segments down the lit front, a nick between each
w 63 -141 0.1, 61.4 -136 1.1, 59 -131 0.2
w 57.6 -128.6 0.1, 55.2 -123.4 1.1, 52.4 -118.8 0.2
w 50.6 -116.6 0.1, 47.6 -111.4 0.9, 44.8 -107.6 0.1
# the costal margin: the cartilage arching back down from the sternum, carved
w 41.6 -102 0.05, 34.6 -95.4 0.7, 26 -86 1.1, 16.6 -76.6 1.0, 9 -69 0.4, 4.6 -64.6 0.05

# ---- the lit front: a broken white rim inset from the edge, gone where the light is full
w 63.4 -143 0.05, 60.6 -134 0.8, 55.4 -124 1.0, 50.6 -117 0.1
w 44.6 -108 0.05, 38 -99.4 0.9, 31 -91 0.7, 26 -85.6 0.05
w 17 -76 0.05, 10 -68.4 0.8, 4.6 -62 0.9, 1 -55 0.05

# ---- the belly and the waist: sucked in under the cage; carved in white ----
# rim light down the lit belly, breaking twice
w 2 -63 0.2, -1.5 -56 0.9, -2.8 -48 1.1, -2.5 -42 0.2
w -1.5 -38 0.1, 0 -31 0.8, 4 -23 0.9, 7.5 -16 0.2
w 9.5 -12 0.1, 11 -5 0.6, 11.5 2 0.1
# wrapping hatch on the abdomen: short white strokes bowing down round the barrel,
# longest at the rim, shortening into the shadow
w -2 -55 0.8, -6 -53 0.6, -10 -52.6 0.05
w -2.5 -50 0.8, -7 -48.4 0.55, -12 -48.2 0.05
w -2.6 -45 0.7, -7 -43.6 0.5, -11 -43.6 0.05
w -2 -40 0.6, -5.5 -39 0.35, -8 -39.2 0.05
w 0.5 -33 0.6, -4 -31.6 0.4, -7 -31.8 0.05
w 2 -29 0.5, -1.5 -27.6 0.3, -4 -27.8 0.05
# the external oblique: one long carve from the floating rib to the hip bone
w -17 -63 0.1, -15 -55 0.8, -11 -44 1.1, -6 -33 1.0, -1 -24 0.6, 3 -19 0.1
# the iliac crest: the pelvis rim sweeping forward to the hip point, its echo below
w -24 -33 0.1, -18 -30 0.9, -9 -27.6 1.5, 0 -24.6 1.3, 6 -20 0.7, 8.6 -16 0.1
w -20 -23 0.1, -12 -20.6 0.7, -4 -19 0.8, 3 -15.6 0.2
W 6.4 -22, 9.4 -20, 10 -16, 7.6 -15, 6.4 -18
# the inguinal fold dropping from the hip point into the belt
w 6 -6 0.1, 4 0 0.6, 1 5 0.7, -3 9 0.1

# ---- the back: the long gravity folds of the coat from the hump into the belt ----
w -30 -100 0.1, -32 -88 1.0, -31.5 -74 1.4, -28.5 -58 1.2, -24.5 -42 0.9, -21 -28 0.5, -19 -18 0.1
w -24 -62 0.1, -20 -50 0.7, -16 -39 0.9, -14 -30 0.3
w -13 -26 0.1, -11 -18 0.5, -10 -10 0.1
# lumbar spine under the cloth: spinous processes as short white nicks along the back
w -30 -58 0.9, -27.5 -56.5 0.1
w -28.5 -50 1.0, -26 -48.6 0.1
w -27 -42 0.9, -24.6 -40.8 0.1
w -26 -34 0.8, -23.6 -33 0.1
w -25.2 -26 0.7, -23 -25.2 0.1
# the hump's lit crest: a cluster of short curved hatch leaving the rim light
w 26 -134 0.1, 12 -129 0.8, -2 -122 1.2, -15 -114 1.0, -25 -106 0.4, -30 -99 0.05
w 2 -126 0.7, -2 -122 0.6, -4 -118.5 0.05
w -5 -121 0.7, -9 -117 0.55, -10.5 -113.5 0.05
w -11 -117 0.65, -15 -113 0.5, -16 -109.5 0.05
w -17 -113 0.55, -21 -108 0.4, -22 -104.8 0.05
w -22.5 -108 0.45, -26 -103 0.3, -26.5 -100 0.05

# ---- spinal spurs breaking out of the coat along the hump, hooked back ----
K 22 -134, 18 -142, 10 -147, 14 -140, 15 -133
K 8 -127, 2 -137, -7 -141, -1 -134, 1 -125
K -6 -119, -13 -128, -23 -131, -15 -124, -12 -115
K -19 -110, -27 -117, -36 -118, -28 -112, -25 -105
K -28 -100, -38 -104, -45 -102, -37 -98, -33 -94
b 19 -136 1.3, 15 -141 0.9, 11 -145.5 0.1
b 5 -129 1.6, 1 -135 1.0, -5 -139.5 0.1
b -9 -121 1.8, -14 -126 1.1, -21 -129.5 0.1
b -22 -111 1.6, -28 -114.5 1.0, -34 -116.6 0.1
b -31 -99 1.3, -37 -101.2 0.8, -43 -101.8 0.1

# ---- the rosary round the neck, hanging forward of the chest ----
k 33 -140 0.5, 38 -126 0.5, 45 -115 0.5, 53 -112 0.5, 60 -118 0.5, 64 -130 0.5, 63 -142 0.5
o 35.5 -133 2.3, 39 -123.5 2.4, 43.5 -116.5 2.5, 49 -112.5 2.5, 55 -112.8 2.5, 60 -117.5 2.4, 63 -124.5 2.3, 64 -132 2.2, 63.5 -139 2.1
# the pen-nib pendant
K 52.5 -110, 55.5 -109.5, 57 -100, 55.5 -92, 53.5 -100
b 54 -108 1.6, 54.8 -101 1.0, 55.2 -94.5 0.1
k 54.6 -105 0.7, 55 -99 0.1
o 54.5 -105.5 0.9
`;

// round 31: the black is modelled, not left flat: each rib throws a group of hatch up
// into the hollow above it (light on the rib's top, dying into the shadow of the next),
// the belly turns into the light through curved hatch wrapping the barrel, the back's
// gravity folds are bold negative lines heavy in the shadow and breaking in the light,
// and the hollow under the cage (the deepest pocket) is crosshatched.
const RIBS = [
  [[29, -134], [32, -130.4], [37.4, -127], [44.4, -125.6], [51, -126.6], [56, -129.6]],
  [[17, -128], [20.6, -122.4], [26.6, -117.6], [34.4, -115.4], [42.4, -115.8], [49, -118.6]],
  [[5.6, -120.6], [9, -113], [14.6, -106.4], [22.4, -103.2], [31, -103.4], [38, -106.4]],
  [[-7, -112], [-4.4, -103], [0.8, -95.4], [8.8, -90.8], [18, -89.6], [26, -91.4], [31, -94]],
  [[-17.4, -103], [-15.4, -93.4], [-10, -85.2], [-2, -79.8], [7, -78.6], [14.6, -80.4], [19, -82.4]],
  [[-24.6, -91], [-22.6, -82], [-17.6, -74.8], [-10.4, -70], [-2.6, -68.8], [3.6, -70]],
];
function modelTorso(g) {
  // round 32: fewer, bolder marks. One curved group per rib, only where the rib turns
  // into the light at the front (graded, longest mid-group), none in the dead black of
  // the back; the folds re-cut heavier; the pockets bigger and crosshatched.
  within(g, 'ink', (h) => {
    RIBS.forEach((P, k) => {
      if (k === 5) return;
      fringe(h, P, { side: 1, u0: 0.48 + (k % 2) * 0.08, u1: 0.9, len: (u) => [3 + 2 * u, 5.5 + 3 * Math.sin(u * Math.PI)], pitch: 1.7, w: 1.0, tilt: 0.4, bow: -0.32, group: [3, 4], gap: [4, 6], seed: 3100 + k * 17 });
    });
    // the back's long gravity folds: heavy where they leave the hump (shadow), breaking low
    fold(h, [[-31, -96], [-32.6, -82], [-31, -66], [-27.6, -50], [-23.6, -34], [-20.6, -20], [-19, -8]], { w: 2.2, brk: 0.62, seed: 3150 });
    fold(h, [[-22, -70], [-19, -58], [-15.6, -46], [-12.6, -34], [-11, -22]], { w: 1.5, brk: 0.5, seed: 3151 });
    // one group wrapping the lumbar barrel off the fold's lit flank
    fringe(h, [[-30.6, -88], [-30.4, -70], [-27, -52], [-23, -34], [-20.4, -18]], { side: 1, u0: 0.25, u1: 0.75, len: [3.5, 7.5], pitch: 1.9, w: 1.0, tilt: 0.55, bow: 0.35, group: [3, 4], gap: [5, 8], seed: 3160 });
    // the belly front turning into the light: two groups wrapping the abdomen, bowing down
    fringe(h, [[1.4, -61], [-2, -50], [-2.6, -40], [0.6, -28], [6, -15], [10.6, -2], [11.4, 10]], { side: -1, u0: 0.05, u1: 0.8, len: (u) => [3.5, 6.5 + 5 * Math.sin(u * Math.PI)], pitch: 1.8, w: 1.1, tilt: -0.28, bow: 0.36, group: [3, 5], gap: [3.5, 5.5], seed: 3170 });
    // the deepest pockets: the hollow under the cage, and under the hump where the back
    // folds into the cage, crosshatched and feathered out
    pocket(h, [-12, -58], { rx: 13, ry: 8.5, ang: -0.55, pitch: 1.9, w: 0.7, a1: 0.35, a2: -1.05, seed: 3190 });
    pocket(h, [-22.5, -95], { rx: 8.5, ry: 5.5, ang: -0.9, pitch: 1.8, w: 0.62, a1: 0.2, a2: -1.2, seed: 3191 });
  });
}

export function torsoHand(g) {
  ink(g, dropHairlines(TORSO, 0.75));
  modelTorso(g);
}
