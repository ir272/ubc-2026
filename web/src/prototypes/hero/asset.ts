// Everything the hero knows about its drawing lives here: the files, the drawing's native size, and
// every position as a fraction of the drawing (0..1, x across the width, y down the height).
//
// The drawing is refs/hero/06-extended-upscaled.png (3808x1280, lossless). `cut-assets.py` beside
// this file cuts the moving parts out of it, writes the page's copy ("the plate": the drawing with
// the tree and the stars painted out, because those are drawn on top and move) and prints the boxes
// it cut as fractions. All fractions below were measured on that 3808x1280 source on 2026-11-20.
//
// To swap the drawing: put the new lossless file at the path in cut-assets.py, check the pixel boxes
// in that script against it, run it, then update `width`, `height` and the fractions here from what
// it prints (and re-measure the hand-measured ones: tvScreen, approach, ridge, sign, couch, sky).

/** [x, y] as fractions of the drawing */
export type Pt = readonly [number, number];
export interface Rect { x: number; y: number; w: number; h: number }

export type WalkerKind = 'white' | 'orange' | 'blue';

export interface Sprite extends Rect {
  src: string;
  /** the cut-out's own pixel size */
  pw: number;
  ph: number;
}

export const HERO = {
  /** the plate at full size, for large and high-density screens */
  src: '/hero/base-plate.webp',
  /** the plate at half size, for ordinary screens */
  src1x: '/hero/base-plate-1x.webp',
  /** native size of `src` (2.975 to 1) */
  width: 3808,
  height: 1280,
  alt: 'A drawing: an old television whose game world spills out as green hills, and across a low ridge two friends on a couch under a tree, one pointing at the screen.',

  /** the empty sky of the drawing: the page ground and the colour the edges fade into */
  ground: '#0d100b',
  /** the drawing's line (cream white), for the stars and the sign */
  ink: '#eeeae0',

  /**
   * How the drawing sits in the hero when the hero is not 2.975 to 1 (object-position, 0..1).
   * `x` is used while at least `both` of the drawing's width fits (TV and couch both in view);
   * as less fits it slides to the right edge, and from `rightOnly` down only the right side shows.
   */
  frame: { x: 0.45, y: 0.1, both: 0.88, rightOnly: 0.7 },

  /** the glass of the TV */
  tvScreen: { x: 0.0846, y: 0.2344, w: 0.1161, h: 0.293 } as Rect,

  /** the front hill line, from the blue figure's feet to where it meets the ridge */
  approach: [
    [0.3414, 0.7742], [0.3519, 0.7688], [0.3624, 0.7578], [0.3703, 0.7445], [0.3808, 0.7422], [0.3939, 0.7414],
    [0.407, 0.743], [0.4175, 0.7367],
  ] as Pt[],
  /** the top line of the ridge, from where it comes out behind the hill by the TV to the couch */
  ridge: [
    [0.4622, 0.6777], [0.4779, 0.6793], [0.4937, 0.6855], [0.5095, 0.6918], [0.5252, 0.6809], [0.541, 0.6715],
    [0.5567, 0.6594], [0.5725, 0.648], [0.5882, 0.6465], [0.604, 0.6617], [0.6197, 0.6719], [0.6355, 0.6641],
    [0.6513, 0.6586], [0.667, 0.6555], [0.6828, 0.6543], [0.6985, 0.6512], [0.7143, 0.6488], [0.73, 0.6316],
    [0.7458, 0.6277], [0.7616, 0.6238], [0.7773, 0.6168], [0.7931, 0.6156],
  ] as Pt[],

  /**
   * The walk: along `approach`, then along `ridge` with the feet `footDrop` below its top line (just
   * inside the green). Walkers appear at x = `from`, are solid by `solidFrom`, start to go at
   * `solidTo` and are gone by `to`, which is short of the sign.
   */
  walk: { from: 0.368, solidFrom: 0.396, solidTo: 0.622, to: 0.651, footDrop: 0.016 },

  /**
   * The three figures near the TV, cut out as line-only sprites. The originals stay in the drawing;
   * these are extra copies that walk. x/y/w/h is where each was cut from, so `h` is its true size.
   * `flip` mirrors a sprite so it faces the way it walks; all three were drawn facing the TV, so all three are mirrored.
   */
  walkers: {
    white: { src: '/hero/walker-white.png', pw: 176, ph: 236, x: 0.234, y: 0.5445, w: 0.0462, h: 0.1844, flip: true },
    orange: { src: '/hero/walker-orange.png', pw: 121, ph: 123, x: 0.1996, y: 0.6172, w: 0.0318, h: 0.0961, flip: true },
    blue: { src: '/hero/walker-blue.png', pw: 169, ph: 171, x: 0.2949, y: 0.6367, w: 0.0444, h: 0.1336, flip: true },
  } as Record<WalkerKind, Sprite & { flip: boolean }>,

  /** the tree, cut out (line only) and painted out of the plate so it can sway */
  tree: { src: '/hero/tree.webp', pw: 675, ph: 382, x: 0.8227, y: 0.2633, w: 0.1773, h: 0.2984 } as Sprite,
  /** where the trunk goes behind the couch back: the sway pivots here */
  treeTrunkBase: [0.8929, 0.525] as Pt,

  /** the foot of the sign post, on the ridge a little left of the couch */
  sign: { x: 0.7064, y: 0.6625 },
  /** the post's height and the type size on the board, as fractions of the drawing's height */
  signPost: 0.118,
  signType: 0.036,

  /** the couch with the two friends on it (not animated; kept for layout and for later) */
  couch: { x: 0.7936, y: 0.4656, w: 0.1242, h: 0.2398 } as Rect,

  /** the empty sky between the TV and the tree: the headline goes in the middle of it */
  sky: { x: 0.3, y: 0.16, w: 0.5, h: 0.4 } as Rect,

  /**
   * Stars: centre, and radius as a fraction of the drawing's HEIGHT. `baked` ones sit exactly where
   * the drawing has a star (painted out of the plate, so the drawn one is the only one); the rest
   * are additions in empty sky, clear of the headline.
   */
  stars: [
    { x: 0.3047, y: 0.1134, r: 0.0117, baked: true },
    { x: 0.4489, y: 0.1117, r: 0.0117, baked: true },
    { x: 0.6137, y: 0.1143, r: 0.0113, baked: true },
    { x: 0.7573, y: 0.112, r: 0.0121, baked: true },
    { x: 0.9398, y: 0.2336, r: 0.009, baked: true },
    { x: 0.346, y: 0.3757, r: 0.0082, baked: true },
    { x: 0.655, y: 0.3762, r: 0.0074, baked: true },
    { x: 0.278, y: 0.235, r: 0.0074, baked: false },
    { x: 0.527, y: 0.052, r: 0.007, baked: false },
    { x: 0.862, y: 0.122, r: 0.0082, baked: false },
  ],
} as const;

// TODO(tree): the sway turns the whole tree as one piece about `treeTrunkBase`. If Ian wants the
// foliage to move more than the trunk, cut the tree into trunk + canopy in cut-assets.py and give
// the canopy its own smaller, out-of-step turn.
// TODO(walkers): the sprites slide with a step bob and a slight rock; they have no leg motion. A
// real walk cycle needs separate leg drawings from Ian.
