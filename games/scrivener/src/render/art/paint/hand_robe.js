// Round 24: the robe front (the skirt below the belt), drawn stroke by stroke in the
// pen.js format. Owner: art. Frame as in parts.js: belt centre (0,0), the hem at
// y ~ SKIRT_LEN (84); +x is the front (lit, over the near knee), -x the back, where the
// drag sweeps the tatters. Black cloth, so its form is carved in white: a fan of fold
// ridges from the gathered belt, each swelling and breaking, a few forking; short hatch
// on the lit flank of each ridge; arcs wrapping the knee; a rim along the lit front edge;
// a hem torn into tapered tatters, clumped with gaps, long behind and short in front.
import { ink, parse, penStroke, INK, PAPER } from './pen.js';
import { within, fold, fringe, pocket, dropHairlines } from './formhatch.js';

export const ROBE = `
# ---- the bell ----
K -25 -6, 20 -6, 30 8, 42 24, 52 42, 58 58, 62 74, 56 78, 48 81, 30 85, 10 89, -10 91, -30 93, -50 93, -70 91, -88 87, -76 76, -60 64, -46 48, -35 30, -29 12

# ---- tatters at the hem: single tapered strokes, clumped, longest behind ----
k -86 76 9, -88.2 86.4 9, -94.7 111.8 6.3, -104.0 132.6 2.0, -108.0 140.4 0.05
k -80 78 5, -81.4 87.8 5, -86.4 106.9 3.5, -91.5 122.1 1.1, -94.0 127.8 0.05
k -74 79 10, -76.6 89.1 10, -84.4 118.1 7.0, -95.3 142.1 2.2, -100.0 151.1 0.05
k -66 80 4, -67.0 90.4 4, -69.7 105.9 2.8, -74.2 117.9 0.9, -76.0 122.4 0.05
k -60 81 7, -61.6 91.0 7, -67.2 113.7 4.9, -73.1 132.1 1.5, -76.0 139.0 0.05
k -52 82 4, -52.7 91.8 4, -54.4 104.6 2.8, -57.7 114.2 0.9, -59.0 117.8 0.05
k -46 82 6, -47.0 92.0 6, -49.7 109.3 4.2, -54.2 122.9 1.3, -56.0 128.0 0.05
k -40 82 3, -40.4 92.0 3, -42.2 102.1 2.1, -43.3 109.3 0.7, -44.0 112.0 0.05
k -33 82 6, -33.8 92.0 6, -35.9 106.6 4.2, -39.6 117.8 1.3, -41.0 122.0 0.05
k -26 82 3, -26.3 91.6 3, -26.8 99.9 2.1, -28.5 105.5 0.7, -29.0 107.6 0.05
k -20 81 5, -20.5 91.0 5, -22.6 102.9 3.5, -24.1 111.7 1.1, -25.0 115.0 0.05
k -11 80 3.4, -11.2 90.1 3.4, -11.3 97.5 2.4, -12.6 102.3 0.7, -13.0 104.1 0.05
k -6 80 5, -6.4 89.6 5, -7.2 100.1 3.5, -9.3 107.8 1.1, -10.0 110.6 0.05
k 3 79 2.6, 2.9 88.7 2.6, 2.1 94.8 1.8, 2.2 98.4 0.6, 2.0 99.7 0.05
k 8 78 4, 7.7 88.2 4, 7.2 97.0 2.8, 5.5 103.0 0.9, 5.0 105.2 0.05
k 18 76 3, 17.9 86.4 3, 17.9 92.0 2.1, 16.8 95.2 0.7, 16.5 96.4 0.05
k 22 76 4, 21.8 85.6 4, 20.4 93.4 2.8, 19.9 98.6 0.9, 19.5 100.6 0.05
k 33 73 2.4, 32.9 83.3 2.4, 33.1 88.0 1.7, 32.2 90.4 0.5, 32.0 91.3 0.05
k 36 73 3.5, 35.8 82.7 3.5, 35.8 89.6 2.4, 34.7 94.0 0.8, 34.4 95.7 0.05
k 47 70 2.2, 46.9 80.2 2.2, 46.2 84.5 1.5, 46.5 86.5 0.5, 46.4 87.2 0.05
k 50 69 3, 49.9 79.1 3, 50.1 84.7 2.1, 49.2 87.9 0.7, 49.0 89.1 0.05
k 57 66 2, 57.0 76.1 2, 57.3 79.9 1.4, 56.6 81.5 0.4, 56.5 82.1 0.05
# dry-brush hairs peeling off the long tatters
k -84 100 1.2, -90 116 0.8, -97 128 0.05
k -71 104 1.0, -76 122 0.7, -82 136 0.05
k -57 100 0.9, -62 114 0.5, -66 124 0.05
k -30 100 0.8, -33 110 0.4, -35 116 0.05
# the drag's three long streamers curling back off the hem
k -78 70 7, -84 78 7, -96 92 5.4, -108 108 3.4, -116 124 1.4, -114 132 0.05
k -60 76 5, -64 86 5, -72 104 3.6, -84 122 2.0, -86 134 0.6, -82 138 0.05
w -86 80 1.2, -95 92 0.9, -104 104 0.05
w -66 90 0.9, -72 102 0.6, -78 112 0.05

# ---- white dry-brush splits running up into the black from the gaps in the hem ----
w -77 88 1.2, -76 80 0.8, -74.6 72 0.05
w -63 90 1.0, -62 82 0.6, -61 76 0.05
w -43 92 1.2, -42.4 82 0.7, -41.6 74 0.05
w -23 91 1.0, -22.6 84 0.5, -22 78 0.05
w -3 89 1.1, -3.2 81 0.6, -3 75 0.05
w 12 87 0.9, 12.4 81 0.5, 12.6 76 0.05
w 26 84 0.8, 26.4 79 0.4, 26.6 75 0.05
w 40 80 0.8, 40.4 75 0.4, 40.6 71 0.05

# ---- the gathers at the belt: short pinched folds, no two alike ----
w -22 -2 0.05, -21 3 0.9, -21.6 9 0.05
w -15 -2 0.05, -13.4 4 1.2, -13 11 0.4, -13.6 14 0.05
w -7 -2 0.05, -6.6 2 0.7, -7 6 0.05
w 0 -2 0.05, 1 5 1.3, 1.6 12 0.6, 1.4 16 0.05
w 8 -2 0.05, 9.4 3 0.8, 10 8 0.05
w 14 -2 0.05, 17 4 1.0, 19 9 0.05

# ---- the fan of fold ridges, belt to hem ----
# far back, in the shadow: a thin reflected line along the back edge
w -26 4 0.05, -29 18 0.6, -35 34 0.9, -46 52 0.8, -60 68 0.5, -74 80 0.05
# a heavy one, the cloth hanging off the buttock, forking low down
w -17 10 0.05, -19 24 1.2, -24 42 1.7, -31 60 1.4, -38 76 0.8, -42 86 0.05
w -24 44 0.05, -21 56 0.9, -19 70 0.8, -20 82 0.05
# a broken one
w -9 8 0.05, -9 22 0.9, -8.6 36 1.1, -8 48 0.3
w -7.6 54 0.3, -7 66 0.8, -8 80 0.05
# over the thigh: the strongest ridge, long and swelling
w 2 12 0.05, 4 26 1.4, 8 44 2.0, 12 62 1.6, 14 76 0.7, 14 84 0.05
# the knee tents the cloth: the front folds bend round it
w 10 6 0.05, 15 18 1.0, 22 32 1.3, 28 46 0.9, 31 58 0.3
w 32 64 0.4, 34 72 0.8, 34 80 0.05
# the lit front edge: a rim of light, breaking where the cloth turns
w 19 -3 0.05, 26 6 0.9, 34 16 1.3, 42 28 1.0, 48 38 0.3
w 51 44 0.3, 55 54 1.1, 58 64 1.0, 59 72 0.05

# ---- short hatch on the lit flank of the ridges, following the fall of the cloth ----
w 6 30 0.9, 10 33 0.6, 13 34.6 0.05
w 7.4 36 0.9, 11.4 39 0.6, 14.4 40.4 0.05
w 8.6 42 0.8, 12.4 45 0.5, 15 46.4 0.05
w 9.6 48 0.7, 13 51 0.4, 15.4 52.2 0.05
w -21 30 0.8, -17.6 32.6 0.5, -15 33.6 0.05
w -22.6 36 0.8, -19 38.6 0.5, -16.4 39.6 0.05
w -24 42 0.7, -20.6 44.6 0.4, -18.4 45.4 0.05
w -7 18 0.6, -4 20 0.4, -2 20.8 0.05
w -6.6 24 0.6, -3.4 26 0.35, -1.6 26.6 0.05

# ---- arcs wrapping the knee where it pushes the cloth forward ----
w 24 38 0.05, 31 36 0.9, 38 37 1.2, 44 40 0.6, 47 43 0.05
w 26 43 0.05, 33 41.6 0.8, 40 42.6 1.0, 45 45.4 0.05
w 29 48 0.05, 35 47.4 0.7, 41 48.6 0.6, 44 50.6 0.05
w 31 53 0.05, 36 52.8 0.5, 40 54 0.05
`;

// round 25: the hem is a dry brush, not a comb. Every tatter (a 'k' stroke rooted on the
// hem) gets an uneven partner: some fork into a second, thinner point peeling off at a
// different length, some have a paper streak splitting the bristles, so no two ends
// match and the points come in clumps of unequal length.
function hemBristles(g) {
  let i = 0;
  for (const { op, pts } of parse(ROBE)) {
    if (op !== 'k' || pts.length < 5 || pts[0][1] < 64 || pts[0][1] > 83 || pts[0][2] < 2) continue;
    i++;
    const r = (k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
    const tip = pts[pts.length - 1], mid = pts[2];
    const dx = tip[0] - mid[0], dy = tip[1] - mid[1];
    const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const side = r(1) > 0.5 ? 1 : -1;
    if (r(2) > 0.25) {
      // a fork: born a little above the mid point, swinging off to one side
      const a = side * (0.22 + 0.3 * r(3));
      const c = Math.cos(a), sn = Math.sin(a);
      const vx = ux * c - uy * sn, vy = ux * sn + uy * c;
      const fl = L * (0.45 + 1.1 * r(4));
      const b0 = [mid[0] - ux * 2, mid[1] - uy * 2];
      penStroke(g, [[b0[0], b0[1], mid[2] * 0.55], [b0[0] + vx * fl * 0.5 - vy * side * fl * 0.06, b0[1] + vy * fl * 0.5 + vx * side * fl * 0.06, mid[2] * 0.3], [b0[0] + vx * fl, b0[1] + vy * fl, 0.04]], INK);
    }
    if (r(5) > 0.4) {
      // a paper streak: the bristles parting along the tatter
      const p0 = pts[1], w0 = Math.min(1.2, pts[1][2] * 0.22);
      penStroke(g, [[p0[0] + 0.3 * side, p0[1] + 3, 0.04], [mid[0] + 0.25 * side * mid[2], mid[1], w0], [mid[0] + ux * L * 0.5, mid[1] + uy * L * 0.5, 0.04]], PAPER);
    }
  }
}

// round 31: the bell is modelled. The fold ridges are re-cut as bold negative lines that
// are heavy up in the shadow under the belt and break into dashes as they come down into
// the light over the knee; each ridge sheds a group of curved hatch off its lit flank
// (the cloth turning from the ridge into the trough); the lit front edge turns into the
// light through hatch wrapping the bell; the deep pockets (under the belt at the back,
// inside the hem behind the knee) are crosshatched.
function modelRobe(g) {
  // round 32: the bell is carved by a FEW designed folds, not salted with hairlines:
  // seven long negative lines fanning from the gathered belt, each pressed heavy up in
  // the shadow under the belt, swelling, then breaking into dashes as it comes down into
  // the light over the knee; one curved hatch group off the lit flank of the three
  // strongest; arcs wrapping the knee; crosshatch only in the deep pockets (the gathers
  // under the belt at the back, inside the hem behind the knee)
  within(g, 'ink', (h) => {
    fold(h, [[-17, 8], [-19, 24], [-24, 42], [-31, 60], [-38, 76]], { w: 2.5, brk: 0.8, seed: 4101 });
    fold(h, [[2, 10], [4, 26], [8, 44], [12, 62], [14, 80]], { w: 2.8, brk: 0.6, seed: 4102 });
    fold(h, [[10, 6], [15, 18], [22, 32], [28, 46], [31, 58]], { w: 2.0, brk: 0.5, seed: 4103 });
    fold(h, [[-27, 12], [-34, 32], [-45, 50], [-58, 66], [-70, 82]], { w: 2.0, brk: 0.85, seed: 4104 });
    fold(h, [[-6, 26], [-4.4, 44], [-3.6, 58], [-4.6, 72], [-6, 86]], { w: 1.8, brk: 0.55, seed: 4105 });
    fold(h, [[30, 20], [38, 36], [45, 50], [50, 62], [52, 74]], { w: 1.5, brk: 0.4, seed: 4106 });
    // a fork peeling off the heavy back fold low down, and one off the thigh ridge
    fold(h, [[-26, 46], [-24, 58], [-23, 70], [-24, 84]], { w: 1.4, brk: 0.5, seed: 4107 });
    fold(h, [[7, 40], [3, 54], [1, 68], [0, 82]], { w: 1.2, brk: 0.45, seed: 4108 });
    const fl = (P, sd, o = {}) => fringe(h, P, { side: -1, len: (u) => [3, 6 + 4 * Math.sin(u * Math.PI)], pitch: 1.9, w: 1.05, tilt: -0.5, bow: 0.38, group: [3, 4], gap: [5, 8], seed: sd, u0: 0.2, u1: 0.75, ...o });
    fl([[-17, 10], [-19, 24], [-24, 42], [-31, 60], [-38, 76]], 4110);
    fl([[2, 12], [4, 26], [8, 44], [12, 62], [14, 78]], 4111, { len: (u) => [3.5, 7 + 4 * Math.sin(u * Math.PI)] });
    fl([[-27, 14], [-34, 32], [-45, 50], [-58, 66], [-70, 80]], 4112, { len: [3, 6], u0: 0.3 });
    // the lit front edge turning into the light: hatch wrapping the bell, bowing down
    fringe(h, [[22, -2], [30, 8], [40, 22], [49, 38], [55, 52], [59, 66], [60, 74]], { side: 1, len: (u) => [3.6, 7.5 + 5 * Math.sin(u * Math.PI)], pitch: 1.8, w: 1.15, tilt: 0.35, bow: 0.34, group: [3, 5], gap: [3, 5], seed: 4120, inset: -0.4 });
    // the deep pockets, crosshatched and feathered out
    pocket(h, [-13, 8], { rx: 11, ry: 6, ang: 0.1, pitch: 1.9, w: 0.7, a1: 0.25, a2: -1.1, seed: 4130 });
    pocket(h, [-50, 72], { rx: 16, ry: 7, ang: -0.45, pitch: 2.0, w: 0.72, a1: -0.15, a2: 1.0, seed: 4131 });
    pocket(h, [-16, 78], { rx: 11, ry: 5.5, ang: -0.1, pitch: 2.0, w: 0.68, a1: 0.5, a2: -0.7, seed: 4132 });
  });
}

export function robeHand(g) {
  ink(g, dropHairlines(ROBE, 0.95));
  modelRobe(g);
  hemBristles(g);
}
