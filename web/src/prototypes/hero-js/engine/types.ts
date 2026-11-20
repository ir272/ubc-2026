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
}
