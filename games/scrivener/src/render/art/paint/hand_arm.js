// Round 24: the arms, drawn stroke by stroke (pen.js format). Owner: art.
// Frames as in parts.js: limb pivot = proximal joint, the bone runs down +y, +x is the
// front / lit side (light from the upper front). Near arms are pale bone and sinew
// drawn with ink; far arms turn away into shadow: a black shape carved with white.
import { ink, parse, penStroke, penShape, INK, BONE, HI } from './pen.js';
import { within, fold, fringe, pocket } from './formhatch.js';

// ---- upper arm: shoulder (0,0) -> elbow (0,86) -------------------------------------
// a torn black sleeve to y ~34, then a gaunt arm: a long lean biceps, the triceps
// bellying behind, a hard pinch, then the elbow as two bony knobs
const UARM_BODY = `
# the arm under the sleeve (bone): lean, pinching above the elbow
B 10 26, 11.2 40, 10.4 50, 8.6 60, 6 70, 5.2 78, 6.8 84, 7.6 90, 5 97, -6 97, -9.6 91, -8.6 84, -6.2 78, -7 71, -10 62, -12.2 52, -12.6 42, -11 26
`;
const UARM_NEAR = `
# core shadow down the back of the arm: a shape, its edge broken by hatch
K -12.6 30, -1.5 31, 0.4 38, -0.6 46, 0.2 55, 0.8 63, 0 70, -2.2 77, -1 84, -3.4 92, -8.6 95, -10 88, -7 79, -7.6 70, -10.6 60, -12.6 48
# wrap hatch off the shadow across the triceps belly, bowing down, shortening toward the light
k -6 34 1.43, -2 35.88 1.04, 2 35.23 0.52, 5 34.5 0.05
k -6 38.4 1.43, -1.5 40.38 0.91, 2.6 39.43 0.39, 5.2 38.9 0.05
k -6.4 42.8 1.3, -2 44.25 0.78, 1.6 43.3 0.05
k -6.4 47.2 1.17, -2.6 48.36 0.65, 0 47.7 0.05
k -6 51.4 1.04, -3 52.36 0.52, -1 51.9 0.05
# second, steeper layer only in the deepest part of the belly
k -5.4 37 0.91, -2.6 41 0.52, -1.4 44 0.05
k -5.8 43 0.78, -3.6 46.6 0.39, -2.6 48.8 0.05
# where the arm pinches: three short strokes wrapping the narrow
k -3.8 64 1.04, -0.6 65.02 0.65, 1.6 64.5 0.05
k -3.6 67.6 0.91, -0.8 68.5 0.52, 1 68.1 0.05
k -3.8 71 0.78, -1.4 71.78 0.39, 0 71.5 0.05
# the groove between biceps and triceps: one long line, swelling where it deepens
k 3.4 32 0.05, 2.4 42 0.78, 1 52 1.17, 0 61 0.65, 0.4 68 0.05
# the biceps tendon dropping into the crook of the elbow
k 6.4 60 0.05, 5 68 0.78, 4.2 75 1.04, 4.6 80 0.26
# the crook: a crease and a pocket of crosshatch
k 6.6 80.6 0.26, 3.6 82 1.3, 0.6 81.6 0.52, -1 80.6 0.05
k 5.6 83.2 0.78, 3.4 84.6 0.65, 1.6 86 0.05
k 4.6 79 0.52, 5.6 81.4 0.52, 6 83.6 0.05
# the elbow: the condyles push through as two knobs, the back one heavy
B -12 83.4, -7 82.6, -4.6 87.6, -6.4 93, -11.4 92.6
k -11.6 83 0.39, -12.8 87.6 2.34, -11 92.6 2.08, -7 94 0.78, -4.6 93 0.05
k -6.4 83.4 0.05, -4.8 86 0.78, -4.6 89 0.05
k -9.4 89.6 0.78, -7 90.38 0.52, -5.6 90.1 0.05
w -10.8 85.2 0.78, -9.6 84.4 0.05
B 4 85, 8 84.4, 9.4 89, 7.4 93, 4.4 92
k 8.4 84.2 0.05, 9.6 88.4 1.04, 7.6 93 0.78, 5 93.6 0.05
# contours: the back heavy (swelling over the triceps and under the knob), the lit
# front a hairline that breaks twice
k -11 30 1.3, -12.8 41 2.86, -12.4 51 3.38, -10.4 61 2.86, -7.4 70 1.82, -6.2 77 1.17, -7.6 82 0.26
k 10.2 30 0.05, 11.2 39 0.78, 10.6 48 0.65, 9.4 55 0.05
k 7.6 63 0.05, 6.2 69 0.78, 5.2 76 1.04, 5.6 80 0.13
k 7.6 90 0.13, 6.4 95 0.91, 3 98 0.05
`;
const UARM_SLEEVE = `
# the torn sleeve: one black shape, its hem shredded into tapered strips
K -14 -16, 0 -18.6, 11 -15, 15.8 -6, 17 6, 17.2 18, 16.6 28, 14 33, 11 30.6, 8 36.4, 4.6 32.4, 1 38.6, -2.6 33.6, -6.4 40, -9.6 34.6, -13.4 39, -17.4 31, -18.4 18, -17.8 4
k 15 30 2.4, 15.6 36 1.6, 14.6 42 0.05
k 8.6 34 2.0, 9 40 1.2, 8 46.4 0.05
k 0.6 36 2.4, 0.4 43 1.4, -1.2 50.6 0.05
k -6.4 37.4 2.2, -7.2 44 1.2, -8.6 52 0.05
k -13.4 36 2.6, -15 43 1.6, -17.4 51 0.05
k -17 28 1.6, -19.4 35 0.9, -21.2 41 0.05
# a dry-brush break at the hem: hairline strips flicked off the shredded edge
k 4 35 0.8, 4.6 41 0.4, 3.6 45 0.05
k -10.6 36 0.9, -11.6 42 0.5, -12.4 47 0.05
# the folds carved in white, converging on the shoulder; the lit edge a broken rim
w 11.6 -12 0.05, 14.4 -2 0.9, 15.4 10 1.3, 15 20 0.8, 14 27 0.05
w 4 -12 0.05, 5.4 -1 0.8, 6.2 10 1.1, 5 20 0.7, 3 29 0.05
w -5 -10 0.05, -5.6 2 0.7, -4.4 12 0.5, -6 20 0.05
w -5.8 23 0.05, -7.6 29 0.6, -9.6 33 0.05
w -13 -6 0.05, -15 6 0.5, -15.4 16 0.3, -16 24 0.05
# a cluster of short folds where the sleeve bunches under the shoulder
w 9 4 0.7, 11.6 6.4 0.4, 13 9 0.05
w 8.4 8 0.6, 10.8 10.2 0.35, 12 12.6 0.05
w 8 12 0.5, 10 13.8 0.3, 11 15.6 0.05
`;
const UARM_FAR = `
# turned away: one black shape; its form only in white carved into it
K 10 26, 11.2 40, 10.4 50, 8.6 60, 6 70, 5.2 78, 6.8 84, 7.6 90, 5 97, -6 97, -9.6 91, -8.6 84, -6.2 78, -7 71, -10 62, -12.2 52, -12.6 42, -11 26
w 9.2 34 0.05, 9.6 44 1.17, 8.4 54 1.3, 6.4 63 0.52, 5 70 0.05
w 4.4 74 0.05, 4 80 0.91, 5.6 86 0.78, 6 92 0.05
w 2.4 36 0.05, 1.4 48 0.78, 0 60 0.65, 0 68 0.05
w -7 84 0.05, -5.6 88 0.91, -6.4 92 0.05
w 7 44 0.78, 4 45.4 0.39, 2 45.6 0.05
w 7.4 49 0.72, 4.6 50.2 0.39, 2.6 50.4 0.05
w 6.8 54 0.65, 4.4 55 0.33, 3 55 0.05
`;

// the far arm is turned from the light: the shadow takes two thirds of it, its edge
// broken into the lit strip by a few long strokes
const UARM_FAR_SHADE = `
K -12.6 30, 2 31, 3.4 40, 2.6 50, 3 58, 2 66, 1.6 74, 0.4 82, -2 92, -8.6 95, -10 88, -7 79, -7.6 70, -10.6 60, -12.6 48
k 2.4 36 1.2, 5.6 37.07 0.7, 8 36.5 0.05
k 2.8 44 1.1, 5.8 44.91 0.6, 7.6 44.5 0.05
k 2.4 52 1, 5 52.84 0.5, 6.6 52.5 0.05
w -9 40 0.05, -8 52 1.0, -5.6 64 0.8, -4.4 72 0.05
w -1.4 84 0.05, 0.2 88 0.8, -1 91 0.05
`;
// round 31: the black of the sleeve and of the arm's shadow side is modelled: the sleeve
// turns into the light through curved hatch off its lit front, its folds are re-cut as
// bold negative lines, the armpit (the deepest pocket) is crosshatched, and the triceps
// shadow is carved by one long muscle line with hatch wrapping off the terminator.
function modelUarm(g, far) {
  within(g, 'ink', (h) => {
    fringe(h, [[13.4, -12], [15.8, -2], [16.8, 8], [16.8, 18], [15.6, 28]], { side: -1, len: (u) => [3, 6 + 4 * Math.sin(u * Math.PI)], pitch: 1.8, w: 1.0, tilt: -0.3, bow: 0.3, group: [3, 5], gap: [1.2, 2.6], seed: 5101 + (far ? 7 : 0), inset: -0.6 });
    fold(h, [[-13, -8], [-15, 4], [-15.4, 16], [-15.6, 27]], { w: 1.9, brk: 0.75, seed: 5102 });
    fold(h, [[-3, -12], [-3.8, 0], [-3, 12], [-4.4, 24]], { w: 1.4, brk: 0.55, seed: 5103 });
    fringe(h, [[-3, -12], [-3.8, 0], [-3, 12], [-4.4, 24]], { side: -1, len: [2.2, 4.6], pitch: 1.8, w: 0.85, tilt: -0.5, bow: 0.3, group: [3, 4], gap: [1.6, 3], seed: 5104 });
    pocket(h, [-10, 4], { rx: 5.5, ry: 9, ang: 0.1, pitch: 1.8, w: 0.55, a1: 0.6, a2: -0.5, seed: 5105 + (far ? 3 : 0) });
    // the arm below the sleeve: the triceps shadow
    const term = far ? [[2.6, 36], [3.2, 46], [2.8, 56], [2.2, 66], [1.4, 76], [0.2, 86]] : [[-0.4, 36], [-0.4, 46], [0.4, 56], [0.6, 64], [-0.6, 72], [-1.4, 82]];
    fringe(h, term, { side: -1, len: (u) => [2.2, 4.6 + 4 * Math.sin(u * Math.PI)], pitch: 1.9, w: 0.95, tilt: -0.55, bow: 0.45, group: [2, 5], gap: [1.6, 3.4], seed: 5106 + (far ? 5 : 0), inset: -0.4 });
    fold(h, [[-10.6, 36], [-11.2, 48], [-9.6, 60], [-6.6, 72], [-5.2, 80]], { w: 1.5, brk: 0.62, seed: 5107 });
  });
}
export function uarmHand(far) {
  return (g) => {
    ink(g, UARM_BODY); ink(g, UARM_NEAR);
    if (far) ink(g, UARM_FAR_SHADE);
    ink(g, UARM_SLEEVE);
    modelUarm(g, far);
  };
}

// ---- forearm: elbow (0,0) -> wrist (0,106) ------------------------------------------
// the olecranon hooks back off the elbow; two muscle bellies at the top run out into
// lean tendons; the ulna is a ridge down the back; the wrist pinches to a third
const FARM_BODY = `
B 7.14 -7, 11.13 4, 13.43 14, 12.19 26, 9.42 38, 7.2 50, 5.8 62, 5.2 74, 5 86, 5.6 96, 6 102, 4.6 110, -5.6 110, -7 101, -5.6 94, -5 84, -5.6 72, -6.6 58, -8.26 44, -10.96 30, -13.46 16, -12.22 4, -9.59 -7
`;
const FARM_NEAR = `
# the olecranon: a hooked point of bone off the back of the elbow
B -9.22 -6, -13 -12, -19.6 -19.4, -14.62 -8.6, -12.04 -0.4
k -19.8 -19.6 0.05, -16.4 -14 1.17, -13.26 -7 2.08, -12.28 0 2.34
k -19.4 -19.2 0.05, -15 -14.6 0.52, -10.74 -9.4 0.78, -8.79 -6.6 0.13
# core shadow down the back: wide under the bellies, thinning down the ulna, gathering at the wrist
K -11.71 -2, -3.6 -1, 0.2 8, 1.4 18, 2.2 30, 2.6 44, 1.8 58, 1.2 72, 0.8 86, -0.6 96, -6.2 104, -6.6 96, -5.8 84, -6.2 70, -7.4 56, -9.56 40, -12.60 24, -13 10
# round 25: the terminator is broken into the light by tapered strokes that leave it
# along the form (wrapping the bellies, then running lean down the tendons)
k 1.6 34 1.1, 4.6 33.6 0.6, 7.4 32.4 0.05
k 2.4 40 1.0, 5.4 39.8 0.5, 7.6 38.8 0.05
k 0.8 64 0.9, 3 63.4 0.4, 4.6 62.6 0.05
k 0.6 70 0.8, 2.8 69.6 0.35, 4.2 69 0.05
k 0.2 78 0.8, 2.4 77.8 0.35, 3.8 77.4 0.05
# the hatching wrapping the bellies (bowing down), heavier out of the shadow
k -5.06 5 1.56, -0.44 7.21 1.17, 4.8 6.39 0.65, 8.4 5.5 0.05
k -5.22 9.4 1.56, -0.46 11.67 1.04, 5 10.77 0.52, 8.6 9.9 0.05
k -5.55 13.8 1.43, -0.93 15.98 0.91, 4.6 14.91 0.39, 7.6 14.3 0.05
k -5.32 18.2 1.3, 0.92 20.12 0.78, 5.97 18.7 0.05
k -4.77 22.6 1.17, 0.68 24.21 0.65, 4.7 23.1 0.05
k -4.18 27 1.04, 0.44 28.37 0.52, 3.69 27.5 0.05
# crosshatch only in the deepest pocket, under the elbow
k -4.88 6 0.91, -2.97 10.4 0.52, -2.08 14 0.05
k -5.52 12 0.78, -3.71 16 0.45, -3.00 19.4 0.05
# the lean middle: three spaced strokes
k -2.21 46 1.04, 2.21 47.29 0.65, 5.22 46.5 0.05
k -2 52 0.91, 2 53.16 0.52, 4.6 52.5 0.05
k -1.8 58 0.78, 1.8 59.09 0.39, 4.2 58.5 0.05
# over the wrist bones the shadow gathers again
k -2.6 86 0.91, 1.8 87.34 0.52, 5 86.5 0.05
k -3 90 0.91, 1.4 91.34 0.52, 4.6 90.5 0.05
# the brachioradialis: a long line spiralling from the front of the elbow across the arm
k 9.11 0 0.05, 7.29 10 0.91, 3.87 22 1.3, 0.62 36 1.04, -1.00 48 0.39, -1.4 56 0.05
# a second belly line, shorter, on the lit side
k 11.85 10 0.05, 10.58 20 0.78, 7.95 30 0.65, 6.35 38 0.05
# tendons out of the bellies, running lean into the wrist
k 4 52 0.05, 3.2 66 0.78, 2.8 80 0.91, 3.2 92 0.39, 3.6 98 0.05
k 0.6 62 0.05, 0.2 74 0.65, 0.2 86 0.65, 0.6 94 0.05
# the ulna ridge: a line of reflected light carved down the shadow
w -10.12 8 0.05, -8.20 26 0.91, -6.23 46 1.04, -4.8 66 0.78, -4.4 80 0.52, -4.4 88 0.05
# the elbow crease at the front, with the crook's pocket
k 9.82 -2 0.26, 6.80 0.4 1.56, 3.19 0.6 0.78, 0.42 -0.4 0.05
k 8.62 2.4 0.78, 5.88 3.8 0.52, 3.72 4.2 0.05
# the wrist: a crease ring and the ulna head and radius styloid as separate knobs
B -9.4 94.6, -5.2 93.6, -3.6 98, -5.6 102, -9.4 101
k -9.2 94.6 0.26, -10.2 98.4 1.82, -8.4 102 1.56, -5 102.4 0.05
w -8.4 96 0.78, -7.2 95.4 0.05
B 4.4 95.4, 7.6 95, 8.4 99, 6.8 102.4, 4.4 101.6
k 7.4 95 0.05, 8.6 98.6 0.91, 6.8 102.6 0.65, 4.8 103 0.05
k 5 99.6 0.13, 1.6 100.8 0.91, -2 100.6 0.65, -4.4 99.6 0.05
k 4 103.4 0.13, 1 104.4 0.65, -2 104.2 0.05
# contours: back heavy, swelling over the bellies, thin down the ulna; front a broken hair
k -11.99 -1 1.56, -13.44 10 3.12, -12.37 24 3.38, -9.22 38 2.6, -7.2 52 1.82, -6 66 1.3, -5.4 80 1.3, -5.6 90 1.82, -7.4 96 0.52
k -6.8 102 0.78, -6.2 108 1.3, -5.4 112 0.05
k 7.17 -6 0.05, 11.35 4 0.91, 13.66 14 1.04, 12.60 24 0.52, 10.59 32 0.05
k 8.70 42 0.05, 7.2 50 0.65, 5.8 62 0.78, 5.2 72 0.05
k 5 82 0.05, 5.2 90 0.65, 5.8 96 0.39
k 6.2 104 0.13, 5.6 108 1.04, 4.6 112 0.05
`;
const FARM_FAR = `
K 7 -7, 10.2 4, 11.6 14, 11 26, 9.2 38, 7.2 50, 5.8 62, 5.2 74, 5 86, 5.6 96, 6 102, 4.6 110, -5.6 110, -7 101, -5.6 94, -5 84, -5.6 72, -6.6 58, -8.2 44, -10.2 30, -11.6 16, -11.2 4, -9.4 -7
K -9 -6, -13 -12, -19.6 -19.4, -14.4 -8.6, -11.4 -0.4
w -18 -17 0.05, -14.4 -11.4 0.78, -12 -6 0.26
w 9.4 2 0.05, 10.4 12 1.3, 9.6 24 1.17, 7.6 36 0.52, 6.4 44 0.05
w 6 52 0.05, 4.6 66 0.91, 4.2 80 0.78, 4.4 92 0.05
w 6.6 2 0.05, 3.8 16 0.78, 1 30 0.65, -0.6 40 0.05
w 1.2 62 0.05, 1 76 0.52, 1.2 88 0.05
w 8.4 10 0.78, 5.6 11.4 0.39, 3.6 11.8 0.05
w 8.6 15 0.72, 5.8 16.2 0.39, 4 16.4 0.05
w 8.2 20 0.65, 5.6 21 0.33, 4 21.2 0.05
w 5.2 97 0.05, 1 99.4 0.65, -3 98.6 0.05
`;

const FARM_FAR_SHADE = `
K -11.71 -2, 3.16 -1, 5.17 8, 5.09 18, 4.08 30, 2.62 44, 1.8 58, 1.4 72, 1.4 86, 0.6 96, -6.2 104, -6.6 96, -5.8 84, -6.2 70, -7.4 56, -9.56 40, -12.60 24
k 4.88 6 1.3, 8.27 7.06 0.8, 10.57 6.5 0.05
k 5.29 12 1.2, 8.77 13.07 0.7, 11.1 12.5 0.05
k 4.85 19 1.1, 8.05 19.99 0.6, 10.11 19.5 0.05
k 3.96 27 1, 6.56 27.87 0.5, 8.29 27.5 0.05
w -8.87 6 0.05, -7.20 24 1, -4.62 46 1, -3 68 0.8, -2.4 86 0.05
w 1.50 2 0.05, 0.46 14 0.7, -1.09 28 0.05
`;
// round 25: the forearm is articulated, not a tube: the whole drawing is pushed through
// a width map that swells the bellies under the elbow, wastes the shaft to a waist,
// pinches the wrist hard and lets the ulna head and styloid knuckle out just above it
const G = (y, c, s) => Math.exp(-Math.pow((y - c) / s, 2));
const FARM_MAP = ([x, y]) => [x * (1 + 0.14 * G(y, 16, 12) - 0.2 * G(y, 62, 14) - 0.26 * G(y, 89, 5) + 0.12 * G(y, 98, 3.5)), y];
// round 31: the forearm's shadow side is carved: one long flexor line heavy in the shadow
// breaking as it reaches the light, hatch wrapping the bellies off the terminator, and a
// crosshatched pocket under the elbow
function modelFarm(g, far) {
  const M = (P) => P.map(FARM_MAP);
  within(g, 'ink', (h) => {
    const term = far ? [[4.6, 6], [5.0, 16], [4.4, 28], [3.2, 42], [2.2, 56], [1.6, 70], [1.4, 84]] : [[0.2, 8], [1.4, 18], [2.2, 30], [2.4, 44], [1.8, 58], [1.2, 72], [0.8, 84]];
    fringe(h, M(term), { side: -1, len: (u) => [2.2, 4 + 6 * Math.exp(-Math.pow((u - 0.2) / 0.25, 2))], pitch: 1.9, w: 1.0, tilt: -0.55, bow: 0.45, group: [2, 5], gap: [1.6, 3.4], seed: 5201 + (far ? 9 : 0), inset: -0.4 });
    fold(h, M([[-11.4, 2], [-11.6, 14], [-9.6, 28], [-7, 44], [-5, 60]]), { w: 1.7, brk: 0.6, seed: 5202 });
    fringe(h, M([[-11.4, 4], [-11.4, 14], [-9.6, 28], [-7.4, 42]]), { side: -1, len: [2, 4], pitch: 1.8, w: 0.8, tilt: -0.6, bow: 0.3, group: [2, 4], gap: [1.8, 3.2], seed: 5203 });
    pocket(h, FARM_MAP([-4.6, 9]), { rx: 4.2, ry: 7.5, ang: 0.15, pitch: 1.75, w: 0.52, a1: 0.7, a2: -0.45, seed: 5204 + (far ? 2 : 0) });
  });
}
export function farmHand(far) {
  return (g) => {
    const o = { map: FARM_MAP };
    ink(g, FARM_BODY, o); ink(g, FARM_NEAR, o);
    if (far) ink(g, FARM_FAR_SHADE, o);
    modelFarm(g, far);
  };
}

// ---- hands: wrist (0,0), the hand runs down +y --------------------------------------
// bony fingers, every phalanx its own bone with a knob at each joint, an ink contour heavy
// on the shadowed underside and broken at the joints, a crease across each knuckle; the
// talons are hooked black blades with a white rim along the back and a needle tip
const GRIP = `
# the back of the hand: metacarpals under a thin skin
B -8 -3, 6 -3.6, 9 4, 7.6 14, 5 24, -1 28, -8 22, -10.6 9
k -8.4 -2 0.4, -10.8 8 1.8, -9.4 17 1.6, -6 24 0.8, -2 28 0.05
k 6.4 -3 0.05, 8.8 3 0.6, 8 9 0.3
w -6 0 0.05, -4.6 8 0.5, -3.6 16 0.05
k -1.4 1 0.05, 0.4 9 0.6, 1.6 17 0.4, 2 21 0.05
k 3.4 1 0.05, 5 8 0.5, 5.4 13 0.05
# shadow under the hand, hatched off toward the knuckles
K -10.4 8, -7 10, -6.2 16, -4 22, -2.6 27, -7.2 23.4, -9.8 16
k -6.4 12 0.7, -3.4 13.4 0.4, -1.6 13.6 0.05
k -5.6 16 0.6, -2.8 17.2 0.35, -1.2 17.4 0.05
# thumb, round the near side of the grip
n -8 6 5.4, -11.6 11 2.3, -13.4 15.6 4.4, -13 20 1.8, -11.6 23 2.0
k -10.4 8 0.3, -13.6 11.6 1.6, -15.4 16 1.2, -14.6 21 1.4, -12.6 24 0.4
k -12.8 13.6 0.5, -11.4 15 0.05
K -12.8 22.6, -10.8 22.8, -8 27.4, -6.6 32.4, -9.4 28
w -11.4 23.4 0.05, -9.2 26.4 0.5, -7.6 30.4 0.05
# index
n 5 3 5.6, 9.6 5.4 2.4, 14 8.6 4.9, 17.2 12.4 2.1, 19.6 16.4 3.9, 21 20 1.7, 21.8 22.4 2.0
k 18.6 18.8 0.3, 19.6 21.4 1.0, 20 23 0.2
k 6.4 1.2 0.05, 10.4 3 0.5, 13.6 5.8 0.05
k 15.6 7.8 0.05, 18.4 11.2 0.4, 20.4 14.8 0.05
k 13.4 6.6 0.6, 12.8 9.4 0.05
k 18.4 14 0.5, 17 15.8 0.05
K 20.4 21, 23 21.4, 25.4 28, 25.4 36, 22 43.6, 23.6 35, 22 27
w 23.2 23 0.05, 24.6 29 0.7, 24.4 35 0.4, 23.6 39 0.05
# middle
n 5.6 10.4 5.6, 10 13 2.4, 14.4 16.4 4.9, 17.2 21 2.1, 19 25.4 3.9, 19.8 29.4 1.7, 20.2 32 2.0
k 17.4 27.6 0.3, 18.2 30.6 1.0, 18.4 32.4 0.2
k 16 13.6 0.05, 18.4 17.4 0.4, 20 21.4 0.05
k 14 14 0.6, 13.2 16.8 0.05
k 18.4 22.4 0.5, 17 24.2 0.05
K 18.8 30.6, 21.4 31, 23 38, 22.2 45, 18.4 51.6, 20.6 44, 19.6 37
w 21.4 33 0.05, 22.4 38.6 0.7, 21.6 44 0.4, 20.4 47.4 0.05
# ring
n 5 17.6 5.4, 9 20.6 2.3, 12.8 24.2 4.6, 15 28.6 2.0, 16 32.6 3.7, 16.2 36.4 1.5, 16 38.6 1.7
k 14.8 35 0.3, 15 37.4 0.9, 14.8 39 0.2
k 12.4 21.8 0.55, 11.6 24.4 0.05
K 15 37.2, 17.4 37.6, 18.2 44, 17 50.4, 13.2 55.6, 15.8 49, 15.4 43
w 17 39.4 0.05, 17.4 44.4 0.6, 16.4 49 0.3, 15 52 0.05
# little finger, tucked
n 3.4 24 4.6, 7 26.6 2.0, 10 30 3.9, 11.6 33.6 1.7, 12 37 2.9, 11.6 40 1.1
k 9.8 27.6 0.5, 9 30 0.05
K 10.6 39.6, 12.8 39.8, 13 45, 11.4 50, 8 53.6, 10.6 48.4, 10.8 44
w 12.2 41.4 0.05, 12.2 45.6 0.5, 11 49 0.05
# the knuckle row: four knobs catching the light
k 3.6 1.6 0.05, 6.6 0.8 1.0, 8.6 2.6 0.4
k 4.4 9 0.05, 7.2 8.6 0.9, 9 10.6 0.3
k 4 16.2 0.05, 6.8 16 0.8, 8.4 18 0.2
`;

const CLAW = `
# the back of the hand: gaunt, the metacarpals standing up as ridges
B -8 -3, 6 -3, 9.6 6, 8 16, 2 23, -6 23, -11 14, -11 3
k -8.4 -2 0.4, -11.2 4 1.6, -11.4 12 2.0, -8 20 1.4, -4 23.6 0.4
k 6.4 -2.6 0.05, 9.4 5 0.7, 8.6 12 0.4, 6.4 17 0.05
k -3.4 1 0.05, -3.8 9 0.6, -2.6 17 0.4, -1.6 21 0.05
k 1.8 1 0.05, 2.6 9 0.6, 3 15 0.05
K -11 6, -7.4 7.4, -6.4 13, -4.6 19, -2.6 23, -7.6 21, -10.6 14
k -6.4 10.4 0.7, -3.4 11.4 0.4, -1.6 11.6 0.05
k -5.6 14.4 0.6, -2.6 15.4 0.35, -1 15.6 0.05
# forefinger: forward and down, hooking in
n 6 15 5.4, 10 19.4 2.3, 13.4 25 4.6, 14.8 30.4 2.0, 15.2 34.4 3.7, 14.8 38 1.5
k 13.2 36.4 0.3, 13.2 38.6 0.8, 12.8 40 0.2
k 8.4 15 0.05, 12 19.4 0.4, 14.6 24.6 0.05
k 12.6 21.6 0.55, 11.4 23.4 0.05
K 13.4 37.6, 16 37.8, 17.6 44, 16.6 50.6, 12.4 56, 14.6 49.6, 14.4 43.6
w 15.8 39.6 0.05, 16.6 44.4 0.7, 15.6 49.6 0.35, 14.4 52.4 0.05
# middle: straight down, the longest
n 2 21 5.4, 3.4 27.6 2.3, 3.6 33.6 4.6, 2.8 39 2.0, 1.8 43.4 3.7, 0.8 47 1.5
k -0.6 44 0.3, -1 46.4 0.8, -1.2 48 0.2
k 4.6 25 0.05, 5.4 30 0.4, 5.2 35.6 0.05
k 5 32.6 0.55, 2.8 33.2 0.05
K -0.6 46.2, 2 46.4, 3 53, 1.4 59.6, -3 64.6, -0.6 58.4, -0.6 52.6
w 1.8 48.4 0.05, 2.2 53.4 0.7, 1 58.4 0.35, -0.4 61 0.05
# ring: down and back
n -3.8 21.6 5.1, -6 28 2.1, -8.4 33.6 4.4, -10 38.4 1.8, -11.2 42.6 3.4, -12.2 46 1.4
k -13.4 43.4 0.3, -14 45.6 0.8, -14.2 47 0.2
k -6.4 31.6 0.5, -8.4 32.2 0.05
K -13.6 45.6, -11.2 45.8, -11.2 52, -13.6 58, -18.4 61.6, -15.2 56.6, -14.2 51
w -11.8 47.6 0.05, -12.2 52 0.6, -13.6 56 0.3, -15 58.4 0.05
# thumb: thrown wide and back, a long hooked reach
n -10 10 5.4, -15 14 2.3, -20 18.4 4.4, -24 21.8 1.8, -27.4 24.6 3.2, -30 26.6 1.2
k -14.2 11 0.05, -18.8 14.6 0.4, -23 18.4 0.05
k -19.6 16.6 0.55, -20.6 19 0.05
K -29.4 24.4, -28 27.6, -32.6 31.4, -38.6 34.6, -35.4 30.4, -32.6 26.6
w -30.6 25.4 0.05, -33.6 28.2 0.6, -36.6 31.6 0.05
# the knuckles
k 4.4 13.4 0.05, 7.4 13.2 1.0, 9.6 15.4 0.3
k -0.4 19.6 0.05, 2.6 19.4 0.9, 4.6 21.4 0.2
k -6.6 19.6 0.05, -3.6 19.6 0.8, -2 21.6 0.2
`;

// round 27: the focal hands. Over the authored fingers, every joint is drawn as its own
// bony knuckle (a closed knob, its ink contour heavy on the shadowed underside and
// hairline on the lit top, a crease across it and a dot of shine), each phalanx between
// knuckles gets two short hatch strokes wrapping its shadow side, and each talon gets a
// second, heavier white rim carved along its back so the black hook reads as a
// modelled blade ending in a needle.
const LXH = 0.6, LYH = -0.8;
function knuckles(g, src) {
  const knobs = [], hatchL = [];
  for (const { op, pts } of parse(src)) {
    if (op !== 'n') continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const w = pts[i][2], wp = i ? pts[i - 1][2] : 0, wn = pts[i + 1][2];
      const a = pts[Math.max(0, i - 1)], b = pts[i + 1];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      // normal toward the shadow (away from the light)
      let nx = -dy, ny = dx;
      if (nx * LXH + ny * LYH > 0) { nx = -nx; ny = -ny; }
      if (w > wp && w > wn) knobs.push({ x: pts[i][0], y: pts[i][1], w, dx, dy, nx, ny, first: i === 0 });
      else if (i > 0) {
        // a waisted shaft: hatch strokes wrapping round its shadow side
        const p = pts[i], r = Math.max(1.2, w * 0.5 + 0.6);
        for (const off of [-0.9, 0.9]) {
          const c = [p[0] + dx * off, p[1] + dy * off];
          hatchL.push([[c[0] + nx * r, c[1] + ny * r, 0.75], [c[0] + nx * r * 0.35 + dx * 0.5, c[1] + ny * r * 0.35 + dy * 0.5, 0.45], [c[0] - nx * r * 0.15 + dx * 1.0, c[1] - ny * r * 0.15 + dy * 1.0, 0.04]]);
        }
      }
    }
  }
  const ell = (k, grow, sh, col) => {
    const rot = Math.atan2(k.dy, k.dx);
    const ra = k.w * 0.62 + grow, rb = k.w * 0.4 + grow;
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(k.x + k.nx * sh, k.y + k.ny * sh, ra, rb, rot, 0, Math.PI * 2);
    g.fill();
  };
  for (const k of knobs) {
    if (k.first) continue; // the knuckle row is drawn by the authored strokes
    ell(k, 0.15, 0.9, INK);  // a crescent of contour on the shadowed underside only
    ell(k, 0, 0, BONE);
  }
  for (const k of knobs) {
    if (k.first) continue;
    const r = k.w * 0.4;
    g.fillStyle = HI;
    g.beginPath();
    g.arc(k.x - k.nx * r * 0.5, k.y - k.ny * r * 0.5, Math.max(0.4, r * 0.2), 0, Math.PI * 2);
    g.fill();
  }
  for (const h of hatchL) penStroke(g, h, INK);
  // talons: a second white rim, carved inside the first, swelling over the curve
  for (const { op, pts } of parse(src)) {
    if (op !== 'w' || pts.length < 4) continue;
    const q = pts.map((p) => [p[0], p[1], p[2] * 1.7]);
    penStroke(g, q, '#e7e0cc');
  }
}
export function handHand(kind) {
  return (g) => { const src = kind === 'grip' ? GRIP : CLAW; ink(g, src); knuckles(g, src); };
}

// ---- round 29: the focal hands re-inked as BLACK claws carved in white ---------------------
// The same authored skeleton (so the grip still closes on the hilt and the claw still
// hangs the ledger), but every finger is a black, knuckled, tapering mass: each phalanx
// swells at its knuckle and pinches between them, its lit (upper-front) edge carved by
// one tapered white rim that breaks at every joint, each knuckle a closed knob with a
// white crescent on its lit shoulder and a dot of shine; the talons are drawn longer and
// of unequal length (each its own hooked needle), with a white rim swelling along the
// back and dying to the point. Light from the upper front, as for the rest of the arm.
const PW = '#e7e0cc';
function litNormal(dx, dy) {
  let nx = -dy, ny = dx;
  if (nx * LXH + ny * LYH < 0) { nx = -nx; ny = -ny; }
  return [nx, ny];
}
function scaleAbout(pts, o, f, bend = 0) {
  return pts.map((p) => {
    const dx = p[0] - o[0], dy = p[1] - o[1];
    const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + bend * Math.min(1, r / 20);
    return p.length > 2 ? [o[0] + Math.cos(a) * r * f, o[1] + Math.sin(a) * r * f, p[2]] : [o[0] + Math.cos(a) * r * f, o[1] + Math.sin(a) * r * f];
  });
}
function blackHand(g, src, talonScale) {
  const ops = parse(src);
  // 1. the masses: palm, fingers (heavier than the bone version), talons
  let ti = -1, base = null;
  const talons = [];
  for (const { op, pts } of ops) {
    if (op === 'B' || op === 'K') {
      let P = pts;
      if (op === 'K') {
        ti++;
        base = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
        const f = talonScale[ti % talonScale.length];
        P = scaleAbout(pts, base, f[0], f[1]);
        talons.push({ base, f, P });
      }
      penShape(g, P, INK);
    } else if (op === 'n') {
      penStroke(g, pts.map((q) => [q[0], q[1], q[2] * 1.12 + 0.7]), INK);
    } else if (op === 'w' && base) {
      const f = talonScale[ti % talonScale.length];
      // a rim along the talon's back: swelling, then dying to the needle
      const P = scaleAbout(pts, base, f[0], f[1]).map((q, i, a) => [q[0], q[1], q[2] * 1.5 * (i === a.length - 1 ? 0.4 : 1)]);
      penStroke(g, P, PW);
    } else if (op === 'k') {
      // fine authored detail (tendons, creases) becomes white carving inside the black;
      // the heavy authored contours vanish into the mass
      const wmax = Math.max(...pts.map((q) => q[2] || 0));
      if (wmax <= 1.05) penStroke(g, pts.map((q) => [q[0], q[1], (q[2] || 0) * 0.62]), PW);
    }
  }
  // the back of the hand: a tendon ridge carved from the wrist to each knuckle, each a
  // tapered white cut, heaviest over the middle of the hand, the outer ones shortest
  let fi = 0;
  for (const { op, pts } of ops) {
    if (op !== 'n') continue;
    const K = pts[0], d = Math.hypot(K[0], K[1]) || 1;
    if (d < 6) { fi++; continue; }
    const s0 = 0.18 + 0.08 * (fi % 2), s1 = 0.78;
    const bow = 0.9 * (fi % 2 ? 1 : -1);
    const P = (s) => [K[0] * s - (K[1] / d) * bow * Math.sin(Math.PI * s), K[1] * s + (K[0] / d) * bow * Math.sin(Math.PI * s)];
    penStroke(g, [[...P(s0), 0.05], [...P((s0 + s1) / 2), 0.95 - 0.12 * fi], [...P(s1), 0.05]], PW);
    fi++;
  }
  // 2. the fingers: a broken white rim on each phalanx, a crescent on each knuckle
  for (const { op, pts } of ops) {
    if (op !== 'n') continue;
    const knobs = [];
    for (let i = 0; i < pts.length; i++) {
      const w = pts[i][2], wp = i ? pts[i - 1][2] : 0, wn = i < pts.length - 1 ? pts[i + 1][2] : 0;
      if (w > wp && w > wn) knobs.push(i);
    }
    for (let j = 0; j < knobs.length; j++) {
      const i0 = knobs[j], i1 = j + 1 < knobs.length ? knobs[j + 1] : pts.length - 1;
      const a = pts[i0], b = pts[i1];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const [nx, ny] = litNormal(dx, dy);
      const wa = a[2] * 1.12 + 0.7, wb = b[2] * 1.12 + 0.7;
      // the phalanx rim: rides just inside the lit edge, broken short of each joint
      const m = pts[Math.round((i0 + i1) / 2)];
      const wm = m[2] * 1.12 + 0.7;
      const s0 = 0.16 + 0.06 * (j % 2), s1 = 0.86 - 0.05 * (j % 2);
      const at = (s, w) => [a[0] + (b[0] - a[0]) * s + nx * (w / 2 - 0.75), a[1] + (b[1] - a[1]) * s + ny * (w / 2 - 0.75)];
      const rimW = Math.min(1.6, 0.62 + wm * 0.2);
      penStroke(g, [[...at(s0, wa * 0.8 + wm * 0.2), 0.05], [...at((s0 + s1) / 2, wm), rimW], [...at(s1, wb * 0.7 + wm * 0.3), 0.05]], PW);
      // the knuckle: a white crescent over its lit shoulder and a dot of shine
      if (j > 0 || i0 > 0) {
        const r = wa / 2 - 0.35;
        const c = [a[0], a[1]];
        const ang = Math.atan2(ny, nx);
        const arc = [];
        for (let q = 0; q <= 4; q++) { const t = ang - 1.1 + (q / 4) * 2.0; arc.push([c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r, 0.05 + Math.sin(Math.PI * q / 4) * Math.min(1.5, 0.65 + r * 0.25)]); }
        penStroke(g, arc, PW);
        g.fillStyle = HI;
        g.beginPath(); g.arc(c[0] + nx * r * 0.2 - dx * 0.5, c[1] + ny * r * 0.2 - dy * 0.5, Math.max(0.3, r * 0.12), 0, Math.PI * 2); g.fill();
      }
    }
  }
}
const TALON_GRIP = [[1.25, 0.06], [1.45, 0.1], [1.15, 0.04], [1.0, 0], [1.2, -0.08]];
const TALON_CLAW = [[1.38, 0.08], [1.7, 0.1], [1.2, 0.14], [1.5, -0.06]];
export function blackHandFn(kind) {
  return (g) => blackHand(g, kind === 'grip' ? GRIP : CLAW, kind === 'grip' ? TALON_GRIP : TALON_CLAW);
}
