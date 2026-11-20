// Shared layout and palette for the code-drawn hero. Scene units: 3000 wide, 1000 tall (3 to 1), origin top left.
// Everything that stands on the ground asks groundY(x), so the ridge, grass, sign, couch, tree and walkers agree.
import type { Pt } from './types';

export const W = 3000;
export const H = 1000;

export const PAPER = '#0c100b'; // measured from Ian's picture (the sky)
export const INK = '#f2efe6'; // the white ink line
export const GREEN = '#324524'; // measured from the picture's hill fill
export const GREEN_LINE = '#e9e2b8'; // the pale outline along the hills
export const WARM = '#d8b06a'; // TV body and warm accents
export const ORANGE = '#e0a15c';
export const BLUE = '#8fb0e6'; // the friends, the couch, one walker
export const GOLD = '#e7c873';

/** The ground line from the left edge to the right edge. The TV sits on the flat top at the left. */
export const GROUND: readonly Pt[] = [
  [0, 650], [110, 600], [660, 600], [760, 575], [860, 630], [960, 690], [1150, 705], [1450, 692],
  [1750, 702], [2030, 686], [2300, 668], [2520, 660], [2760, 652], [2900, 672], [3000, 705],
];

export function groundY(x: number): number {
  const g = GROUND;
  if (x <= g[0]![0]) return g[0]![1];
  for (let i = 1; i < g.length; i++) {
    const a = g[i - 1]!;
    const b = g[i]!;
    if (x <= b[0]) return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return g[g.length - 1]![1];
}

/** Where things are. All in scene units. */
export const TV = { x: 130, y: 170, w: 520, h: 430, screen: { x: 175, y: 215, w: 330, h: 270 } };
export const WALK = { from: 560, to: 2240 }; // walkers leave the screen and walk the ridge to here
export const SIGN = { x: 2020 };
export const COUCH = { x: 2330, w: 340 }; // its feet stand on groundY
export const TREE = { x: 2740 }; // trunk base x; the crown reaches up and left over the couch
export const SKY = { x0: 720, x1: 2300, y0: 60, y1: 520 }; // the empty sky; the slogan sits in the middle of it

/** When the entrance is over (seconds). */
export const INTRO_END = 3.4;

/**
 * The wind, shared by everything that blows (grass, tree, sign) so gusts travel across the scene together.
 * Returns roughly -1..1: a steady breeze plus gusts that sweep from left to right. Pure function of time and place.
 */
export function wind(t: number, x: number): number {
  const phase = t * 0.9 - x / 620;
  const gust = Math.max(0, Math.sin(t * 0.37 - x / 1500)) ** 3;
  return 0.35 * Math.sin(phase) + 0.2 * Math.sin(phase * 2.3 + 1.7) + 0.75 * gust * Math.sin(phase * 3.1);
}
