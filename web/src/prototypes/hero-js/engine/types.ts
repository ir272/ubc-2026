// The contract every part of the code-drawn hero is written against. Do not change these shapes
// without telling the other authors: three people build parts against this file at the same time.
export type Pt = readonly [number, number];

export interface StrokeOpts {
  color?: string;
  /** line width in scene units (the scene is 3000 x 1000) */
  width?: number;
  /** fixes the hand wobble of this stroke so it is identical every frame */
  seed?: number;
  /** 0..1: draw only the first part of the stroke's length (used for "lines draw themselves") */
  reveal?: number;
  close?: boolean;
  alpha?: number;
  /** 0..1: how far in from the start and the end the line thins to a point (one number for both ends, or [start, end]) */
  taper?: number | readonly [number, number];
  /** multiplier on the hand drift (default 1 = at most 0.8 units sideways; 0 = ruler straight) */
  wobble?: number;
}

export interface HatchOpts {
  /** direction of the strokes in radians (0 = horizontal) */
  angle?: number;
  /** distance between strokes in scene units */
  gap?: number;
  width?: number;
  color?: string;
  alpha?: number;
  seed?: number;
  /** 0..1: how much of each stroke is left out, so the hatch is broken like a hand's */
  breakup?: number;
}

export interface StippleOpts {
  count?: number;
  /** dot radius in scene units */
  r?: number;
  color?: string;
  alpha?: number;
  seed?: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pen {
  ctx: CanvasRenderingContext2D;
  /** one ink line through the points, round caps and joins */
  stroke(pts: readonly Pt[], o?: StrokeOpts): void;
  /** a flat filled shape */
  fill(pts: readonly Pt[], color: string, alpha?: number): void;
  /** smooths a few control points into a curve (Catmull-Rom); pass the result to stroke or fill */
  curve(pts: readonly Pt[], steps?: number, closed?: boolean): Pt[];
  text(s: string, x: number, y: number, o?: { size?: number; color?: string; align?: CanvasTextAlign; rotate?: number; alpha?: number }): void;
  /** broken parallel hairlines inside the closed shape `clip` (texture for shade planes) */
  hatch(clip: readonly Pt[], o?: HatchOpts): void;
  /** scattered dots inside the closed shape `clip` */
  stipple(clip: readonly Pt[], o?: StippleOpts): void;
  /** a stroke with a soft halo: the land contour and light sources only */
  glow(pts: readonly Pt[], o?: StrokeOpts): void;
  /**
   * Paint once into an offscreen canvas at device resolution, then blit it every frame. `box` is in the
   * current coordinate system (translate / rotate first to move a cached sprite); `paint` draws in the same
   * coordinates with the pen it is given. Repaints when the canvas pixel size changes.
   */
  cache(key: string, box: Box, paint: (pen: Pen) => void): void;
  /**
   * Like `cache`, but only paints (once) and hands back the offscreen canvas and its pixels-per-unit scale,
   * so the caller can blit pieces of it itself (a sprite atlas). Null if the canvas is not ready.
   */
  layer(key: string, box: Box, paint: (pen: Pen) => void): { cv: HTMLCanvasElement; s: number } | null;
}

export interface Frame {
  /** seconds since the scene started; every motion must be a pure function of t so a frame can be reproduced */
  t: number;
  /** 0..1: how much of THIS part's entrance has been drawn (from the part's `intro` window) */
  reveal: number;
  /** true once the whole entrance is over and the scene is simply alive */
  alive: boolean;
}

export interface Part {
  id: string;
  /** paint order, low first */
  z: number;
  /** [start, end] in seconds: when this part draws itself on during the entrance */
  intro: readonly [number, number];
  draw(pen: Pen, f: Frame): void;
  /**
   * Optional: the part of this layer that never changes. The scene paints it ONCE (and again on resize) into
   * a canvas that sits under the live one, so it costs nothing per frame. Only for parts that lie under
   * everything else (the paper and the still sky); `draw` then paints just what moves.
   */
  still?(pen: Pen): void;
}
