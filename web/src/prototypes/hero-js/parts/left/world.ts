// Shared by the TV, the hills and the walkers: the trail. The game's near ground carries on out of the glass
// as a terrace, drops over the bezel in two stepped folds onto a bluff in front of the set's lower right
// corner, and from there goes down three flights of cut steps, with a landing between each, to the ridge.
// The top edge of that front layer of land is the surface the walkers' feet stand on. Also: the screen's flicker.
import { groundY } from '../../engine/layout';
import type { Pt } from '../../engine/types';
import { clamp01, rnd, smooth } from './kit';

export { clamp01, smooth };

/** n cut steps going down from (x0, y0) to (x1, y1): riser, tread, riser, tread; tread widths a little uneven */
function stairs(x0: number, y0: number, x1: number, y1: number, n: number, seed: number): Pt[] {
  const ws: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const w = 1 + 0.3 * (rnd(seed * 17 + i * 3.1) - 0.5);
    ws.push(w);
    sum += w;
  }
  const dy = (y1 - y0) / n, out: Pt[] = [];
  let x = x0;
  for (let i = 0; i < n; i++) {
    const yt = y0 + i * dy;
    out.push([x + 0.6, yt + 1.2], [x + 3.2, yt + dy - 0.6]);
    x += (ws[i]! / sum) * (x1 - x0);
  }
  return out;
}

export const TRAIL_X0 = 432;
export const TRAIL_X1 = 1084;
/** x of the glass's right edge and of the bezel's outer edge, where the land crosses the lip */
export const LIP_X = 505;

/**
 * The top edge of the front layer of land, from inside the glass to the ridge. The first six points are
 * inside the glass (drawn live over the game), the rest is painted once.
 */
export const FRONT_TOP: readonly Pt[] = [
  [432, 441], [437, 425], [444, 418], [474, 419], [505, 420], [527, 424],
  // fold one, a short shelf, fold two: the land dropping over the bezel
  [531.5, 427], [539, 452], [556, 455], [560.5, 458], [568, 485],
  // the bluff in front of the set's lower right corner
  [577, 488], [622, 489.5], [664, 491],
  ...stairs(664, 491, 764, 554, 4, 1),
  [764, 554], [794, 555.5], [822, 557],
  ...stairs(822, 557, 930, 626, 4, 2),
  [930, 626], [952, 627], [972, 628],
  ...stairs(972, 628, 1084, 700, 4, 3),
  [1084, 700],
];

function lerpY(pts: readonly Pt[], x: number): number {
  if (x <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    if (x <= b[0]) return b[0] === a[0] ? b[1] : a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return pts[pts.length - 1]![1];
}

/** the exact surface under a foot: the cut steps and landings of the trail, then the ground */
export function stepY(x: number): number {
  return x >= TRAIL_X1 ? groundY(x) : lerpY(FRONT_TOP, x);
}

/** where a walker's body rides: the trail with its steps averaged out, then the ground */
export function walkY(x: number, _t = 0): number {
  if (x >= TRAIL_X1 + 60) return groundY(x);
  let s = 0;
  for (let i = -3; i <= 3; i++) s += stepY(x + i * 9);
  const k = smooth(TRAIL_X1 - 10, TRAIL_X1 + 60, x);
  return (s / 7) * (1 - k) + groundY(x) * k;
}

/** how steep the trail is under a walker, 0 on the flat to about 0.65 on the steps */
export function slopeAt(x: number): number {
  return (walkY(x + 24) - walkY(x - 24)) / 48;
}

/** 0..1: the brightness of the picture. A gentle breathing with small, soft flickers on unrelated periods. */
export function screenGlow(t: number): number {
  let b = 0.86 + 0.07 * Math.sin(t * 1.25) + 0.04 * Math.sin(t * 3.1 + 1) + 0.03 * Math.sin(t * 7.7);
  const k1 = (t + 1.3) % 6.3;
  if (k1 < 0.4) b -= 0.16 * Math.sin((k1 / 0.4) * Math.PI) * (0.6 + 0.4 * Math.sin(k1 * 60));
  const k2 = (t + 4.2) % 9.7;
  if (k2 < 0.2) b -= 0.12 * Math.sin((k2 / 0.2) * Math.PI);
  return clamp01(b);
}
