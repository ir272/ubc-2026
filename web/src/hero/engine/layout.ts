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

// ---------------------------------------------------------------------------------------------------------
// Shared craft helpers (see QUALITY.md, section b). Added for the quality pass; nothing above changed.

/** deterministic hash: any number -> 0..1 */
export function rnd(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const TONES = new Map<string, string>();
const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
/** colour `color` (#rrggbb) mixed toward PAPER, keeping fraction k of it: 0.16 body, 0.08 shade, 0.28 lit */
export function tone(color: string, k: number): string {
  const key = color + k;
  let v = TONES.get(key);
  if (!v) {
    const a = hex(color), b = hex(PAPER);
    v = `rgb(${Math.round(b[0] + (a[0] - b[0]) * k)},${Math.round(b[1] + (a[1] - b[1]) * k)},${Math.round(b[2] + (a[2] - b[2]) * k)})`;
    TONES.set(key, v);
  }
  return v;
}

/**
 * The five line weights, chosen by ROLE (QUALITY.md, section b). Every part should take its widths from here
 * so the TV, the friends, the tree and the land are drawn by one hand.
 */
export const LINE = { contour: 4.8, sil: 3.6, form: 2.6, detail: 1.8, hair: 1.2 } as const;

export const GREEN_SHADE = '#24331b';
/** the deepest land tone: the lowest foreground layers and the insides of gullies */
export const GREEN_DEEP = '#1b2715';
export const GREEN_LIT = '#41592e';
export const GREEN_SHEEN = '#557440';

/** the quiet box: the headline sits here. Only the faintest stars inside. */
export const QUIET = { x0: 960, x1: 2060, y0: 150, y1: 440 };

/** the TV screen's flicker, 0..1; anything lit by the screen follows it */
export function tvGlow(t: number): number {
  const v = 0.74 + 0.12 * Math.sin(t * 2.1) + 0.08 * Math.sin(t * 7.3 + 1.1) + 0.06 * Math.sin(t * 17.9 + 0.4);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function herm(pts: readonly Pt[], x: number): number {
  const n = pts.length;
  if (x <= pts[0]![0]) return pts[0]![1];
  if (x >= pts[n - 1]![0]) return pts[n - 1]![1];
  let i = 1;
  while (pts[i]![0] < x) i++;
  const a = pts[i - 1]!, b = pts[i]!;
  const p = pts[Math.max(0, i - 2)]!, q = pts[Math.min(n - 1, i + 1)]!;
  const h = b[0] - a[0];
  const ma = ((b[1] - p[1]) / (b[0] - p[0])) * h;
  const mb = ((q[1] - a[1]) / (q[0] - a[0])) * h;
  const u = (x - a[0]) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * ma + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * mb;
}

// The land is a strip, not a block: this is its underside. Left of x 900 the land runs off the bottom edge
// (the hill mass); from there the underside sweeps up and the strip runs to the right edge, thickest under
// the sign, the couch and the tree.
const UNDER: readonly Pt[] = [
  [880, 1040], [960, 950], [1050, 868], [1150, 800], [1260, 764], [1450, 742], [1620, 746], [1800, 756], [1930, 762],
  [2020, 774], [2150, 750], [2300, 754], [2500, 767], [2700, 763], [2800, 753], [2900, 752], [3000, 780], [3020, 786],
];
/** the underside of the land strip at x (below it: bare paper). Left of x 880 the land fills to the bottom edge. */
export function underY(x: number): number {
  return x <= 880 ? H + 40 : herm(UNDER, x);
}

// The top of the frontmost land layer over the whole width: a low terraced foreground at the left (in front
// of the hills, below the walkers' path), which rises to become the ground line at x ~ 990.
const FRONT: readonly Pt[] = [
  [-20, 792], [70, 778], [150, 774], [176, 800], [300, 808], [336, 806], [352, 772], [470, 762], [560, 766], [596, 792],
  [700, 800], [760, 796], [790, 768], [850, 748], [910, 722], [960, 704], [1000, 693.2],
];
/** the top edge of the frontmost land: the foreground terrace left of x 1000, then exactly groundY */
export function landTopY(x: number): number {
  return x < 1000 ? Math.max(groundY(x), herm(FRONT, x)) : groundY(x);
}
