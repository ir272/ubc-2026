// The ink stage contract (2D canvas, drawn by the pen in ./pen.ts). It replaces the three.js stage
// in src/stage for the picture; the feed, the reducer, the playback and the audio are reused.
//
// One canvas, laid out as 1280x720 (the stage scales it to the box and the device pixel ratio).
// Every frame the stage (./stage.ts) builds an InkFrame and calls, in this order:
//   prepare() on every module (logic only, may raise f.post values), then draw():
//   set (the arena drawing), the dim wash, fighters, fx, the flash wash, hud, screens.
// Modules never read the feed or the wall clock and never talk to each other: everything is in the
// frame. All drawing is immediate: nothing persists on the canvas between frames.

import type { ArenaDef, FighterDef, FighterId, FighterState, MoveId, Projectile, Side } from '../sim/types.ts';
import type { FightView, ShowState } from '../stage/api.ts';
import type { Pen, Pt } from './pen.ts';

export type { FightView, ShowState, Pen, Pt };

/** stage layout size in px; g is always scaled so this fills the canvas */
export const W = 1280;
export const H = 720;
/** figure units per world metre: characters are drawn in units, a 2 m figure is 200 units tall */
export const UNITS_PER_M = 100;

/** The 2D camera: which part of the world the picture shows. World is metres, y up. */
export interface View {
  /** world point at the picture centre */
  cx: number;
  cy: number;
  /** stage px per world metre */
  scale: number;
  /** world metres to stage px (shake included) */
  x(wx: number): number;
  y(wy: number): number;
}

export interface CameraRig2D {
  /** move toward framing this fight state; called once per frame by the stage */
  update(f: InkFrame): void;
  view: View;
  /** trauma 0..1 added to the shake (decays by itself); dir = unit vector of the hit */
  shake(amount: number, dirX?: number, dirY?: number): void;
  /** brief push in toward a world point (a heavy hit, the lethal hit) */
  punch(wx: number, wy: number, strength: number, holdMs: number): void;
  /** 'auto' | 'wide' | 'follow' from the platform */
  setMode(mode: string, side?: Side): void;
}

/** Whole-picture treatments. Zeroed before prepare(); modules raise with Math.max, never lower. */
export interface InkPost {
  /** 0..1: darken the set behind the fighters (heavy hits, the lethal hit) */
  dim: number;
  /** 0..1: wash the whole picture toward cream for a frame or two */
  flash: number;
  /** 0..1 per side: draw that fighter in flat red-hot ink (hit flash) */
  fighterFlash: [number, number];
  /** a full-screen screen covers the arena: the stage skips set, fighters, fx and hud */
  cover: boolean;
}

// ---- figures ----

/** Joint positions of a posed figure in LOCAL figure units: feet line y = 0, up is -y, +x is the
 *  way the figure faces. F = the front limb (nearer the viewer, drawn over the body), B = back. */
export interface Joints {
  hip: Pt;
  chest: Pt;
  neck: Pt;
  head: Pt;
  /** radians, 0 = upright; positive tips the head/torso forward (toward +x) */
  headTilt: number;
  lean: number;
  shoulderF: Pt;
  elbowF: Pt;
  handF: Pt;
  shoulderB: Pt;
  elbowB: Pt;
  handB: Pt;
  kneeF: Pt;
  footF: Pt;
  kneeB: Pt;
  footB: Pt;
  /** radians: direction the main prop (staff, bell chain, sword) points from handF; 0 = +x, -PI/2 = up */
  prop: number;
  /** whole-figure rotation about the hip in radians (tumbling, knockdown), applied by the stage */
  spin: number;
  /** 1 = normal; squash and stretch along the spine (landing, jumpsquat), applied by the pose engine */
  stretch: number;
}

/** A character's proportions in figure units. The pose engine builds joints from these. */
export interface Build {
  /** standing height to the top of the head */
  height: number;
  /** hip height when standing */
  hipY: number;
  /** hip to neck */
  torso: number;
  /** neck to head centre */
  neckLen: number;
  /** upper + lower arm, and leg, each as [upper, lower] */
  arm: [number, number];
  leg: [number, number];
  /** half the shoulder width as seen from the side-on three-quarter view */
  shoulderX: number;
  /** stance: how far apart the feet stand, and how hunched (radians of forward lean at rest) */
  stanceX: number;
  hunch: number;
  /** length of the main prop from the hand (0 = none) */
  propLen: number;
  /** how the figure carries its weight: heavier = slower settle, bigger squash */
  heft: number;
}

/** how each move is acted; the pose engine has one animation per kind */
export type MoveAnim =
  | 'jab' | 'swingSide' | 'swingOver' | 'swingUp' | 'thrust' | 'kick' | 'kickUp' | 'stomp' | 'spin'
  | 'cast' | 'castUp' | 'throwObj' | 'reach' | 'charge' | 'leap' | 'slam';

export interface FigureExtra {
  /** seconds on the show clock (idle sway, flames, cloth) */
  t: number;
  state: FighterState;
  /** 0..1 through the current move (0 at its first frame, 1 at its last), and which part of it */
  moveT: number;
  movePart: 'startup' | 'active' | 'recovery' | null;
  /** tint name of this side for the sash or trim (the character's own tint stays for its magic) */
  sideTint: string;
  /** horizontal speed in units per second, for cloth drag */
  drag: number;
  /** 1 while armoured */
  armor: number;
}

export interface CharacterDef {
  id: FighterId;
  build: Build;
  /** which animation each move uses, and the limb that leads it */
  anims: Partial<Record<MoveId, { anim: MoveAnim; hand?: 'F' | 'B' | 'both' }>>;
  /** draw the posed figure in local units (the stage has already translated, flipped and scaled) */
  draw(ink: Pen, J: Joints, x: FigureExtra): void;
  /** optional: an ability's own drawing in local units, over the figure (a spell leaving the staff) */
  drawMove?(ink: Pen, J: Joints, x: FigureExtra): void;
  /** draw one of this character's projectiles, in local units centred on it, +x = its travel */
  drawProjectile?(ink: Pen, p: Projectile, t: number): void;
  /** head-and-shoulders portrait in local units, about 100 wide, for the HUD and select screens */
  portrait?(ink: Pen, t: number): void;
}

/** A figure as posed this frame, for the modules that need to anchor to it. */
export interface Figure {
  side: Side;
  id: FighterId;
  state: FighterState;
  joints: Joints;
  /** stage px of the feet point, px per figure unit, and facing */
  x: number;
  y: number;
  s: number;
  facing: 1 | -1;
  /** stage px of a named joint: 'head' | 'chest' | 'hip' | 'handF' | 'handB' | 'footF' | 'footB' */
  point(name: string): Pt;
}

export interface InkFrame {
  /** seconds since the last frame on the show clock (fixed 1/60 in capture) */
  dt: number;
  /** show clock, ms since announce() */
  now: number;
  show: ShowState;
  /** null outside predictions / fight / break / verdict */
  fight: FightView | null;
  g: CanvasRenderingContext2D;
  view: View;
  post: InkPost;
  figures: [Figure | null, Figure | null];
  arena: ArenaDef;
  fighterDefs: Record<FighterId, FighterDef>;
  cast: Record<FighterId, CharacterDef>;
  /** 'line' or 'mass': the ink treatment the owner chose */
  mode: 'line' | 'mass';
  /** side accents: tint names for side 0 and side 1 */
  sideTints: [string, string];
  assetsBase: string;
}

export interface InkModule {
  prepare?(f: InkFrame): void;
  draw(f: InkFrame): void;
  dispose?(): void;
}

/** the arena drawing: the stage set for one stage id */
export interface StageSet extends InkModule {
  id: string;
  name: string;
  arena: ArenaDef;
  /** the same drawing small, for the stage select: fills the box (x, y, w, h) in stage px, 16:9 */
  drawThumb?(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void;
}

export type PoseFn = (
  s: FighterState,
  prev: FighterState,
  alpha: number,
  other: FighterState,
  def: FighterDef,
  ch: CharacterDef,
  t: number,
  dt: number,
) => Joints;
