// Stage module contract. The stage (src/stage/stage.ts) owns the renderer, the clock, the feed
// reducer and the fight playback. Every visual piece is a module in its own file that receives a
// StageCtx once and a Frame every rendered frame. Modules never read the feed or the wall clock
// themselves and never talk to each other directly: everything they need is in the Frame.
// That keeps each piece buildable and judgeable on its own, and makes captures deterministic.

import type * as THREE from 'three';
import type { ArenaDef, FightState, FighterDef, FighterId, FighterState, Plan, Side, SimEvent } from '../sim/types.ts';
import type { Ctx, Phase } from '../show/events.ts';

/** Render layers. Every mesh a module adds must be on its layer (obj.traverse(o => o.layers.set(LAYER.X))).
 *  Lights must call light.layers.enableAll(). The stage renders SET, then the dim quad, then FIGHTER
 *  (depth kept, so fighters still sit in the set), then FX, then the flash quad. */
export const LAYER = { SET: 0, FIGHTER: 1, FX: 2 } as const;

/** Whole-picture treatments any module may ask for. The stage zeroes it before the modules update
 *  each frame, modules raise values with Math.max (never lower them), the stage applies it. */
export interface PostState {
  /** 0..1: darken the set (layer SET only) toward `dimColor`. Heavy hits, the lethal hit. */
  dim: number;
  dimColor: string;
  /** 0..1: wash the whole picture toward white (heavy hit frames, the blast). */
  flash: number;
  /** 0..1 per side: fighter drawn toward flat `fighterFlashColor` (hit flash, the lethal-hit look). */
  fighterFlash: [number, number];
  fighterFlashColor: [string, string];
  /** a full-screen screen (call, select, versus) sets this true while it fully covers the arena:
   *  the stage then skips drawing the set, the fight fighters and the fight effects that frame */
  coverSet: boolean;
}

export interface StageCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** absolutely positioned overlay that fills the stage, 16:9. DOM/SVG/canvas UI goes here.
   *  It is scaled so that 1280x720 CSS px always fills it: lay out UI for 1280x720. */
  ui: HTMLElement;
  assetsBase: string;
  arena: ArenaDef;
  fighterDefs: Record<FighterId, FighterDef>;
  /** side colours: [red, blue] */
  sideColors: [string, string];
  /** the two fight robots as the stage currently has them (null before picks). Read-only for
   *  modules: use point() to anchor effects to a real fist, boot or head. */
  fighters: [FighterView | null, FighterView | null];
}

/** The reduced show state: what the feed has said so far. Plain data. */
export interface ShowState {
  phase: Phase | 'idle';
  /** ms since the phase began, on the show clock (correct for a viewer who joined late) */
  phaseMs: number;
  /** planned length of the phase, ms (0 when open-ended) */
  phaseDurationMs: number;
  ctx: Ctx | null;
  /** select: true once both picks are public */
  picksRevealed: boolean;
  /** select: ms into the phase at which the picks are due to flip (from select_open.revealInMs) */
  selectRevealMs: number;
  taunts: [string | null, string | null];
  /** ms on the show clock when each taunt arrived (for entrance animation), or -1 */
  tauntAt: [number, number];
  /** an open betting window the stage should show a clock for, or null. msLeft counts down. */
  window: { id: string; msLeft: number; durationMs: number; state: 'open' | 'locked' | 'settled' } | null;
  /** plans in force per side, and the ms on the show clock when each last changed */
  plans: [Plan | null, Plan | null];
  planChangedAt: [number, number];
  /** break phase */
  lastKo: { side: Side; by: Side; damage: number; edge: 'left' | 'right' | 'top' | 'bottom'; final: boolean } | null;
  cornerTalk: [string | null, string | null];
  /** verdict */
  result: { winner: Side; winnerId: string; lives: [number, number]; damage: [number, number]; nextInMs: number } | null;
  /** the viewer's pick, from highlight() */
  highlight: Side | null;
}

/** What the fight looks like at this rendered frame. */
export interface FightView {
  /** the simulation state at the tick being drawn */
  state: FightState;
  /** the state one tick earlier, and how far between them this frame is (0..1), for smooth motion */
  prev: FightState;
  alpha: number;
  /** sim events that happened in the ticks advanced since the last rendered frame, in order */
  events: SimEvent[];
  /** 'live' = the fight as it happens, 'replay' = a knockout replay, 'frozen' = stopped (break, countdown, verdict) */
  mode: 'live' | 'replay' | 'frozen';
  /** playback speed relative to real time (1 live, <1 in replays and the lethal-hit slow-down) */
  speed: number;
  /** fight clock: ticks of regulation time left (0 in sudden death) */
  ticksLeft: number;
  /** ms until tick 0 or the resume, while the countdown runs; 0 otherwise */
  countdownMs: number;
}

export interface Frame {
  /** seconds since the last rendered frame on the show clock (fixed 1/60 in capture mode) */
  dt: number;
  /** show clock, ms since announce() */
  now: number;
  show: ShowState;
  /** null outside predictions / fight / break / verdict */
  fight: FightView | null;
  /** shared picture treatments, see PostState */
  post: PostState;
  width: number;
  height: number;
}

export interface StageModule {
  update(frame: Frame): void;
  resize?(width: number, height: number): void;
  dispose(): void;
}

// ---- Pieces. Each file under src/stage exports the factory named here. ----

/** arena.ts: the set, the lights, the background, the crowd. Also owns scene.background and fog. */
export type CreateArena = (ctx: StageCtx) => StageModule;

/** camera.ts: moves ctx.camera. Other modules ask for shake / punch-in through the handle. */
export interface CameraRig extends StageModule {
  /** trauma 0..1 added to the shake (decays by itself) */
  shake(amount: number, dirX?: number, dirY?: number): void;
  /** brief zoom toward a world point (a heavy hit, the lethal hit) */
  punch(x: number, y: number, strength: number, holdMs: number): void;
  /** named camera modes for the platform's setCamera(): 'auto' | 'wide' | 'follow' */
  setMode(mode: string, side?: Side): void;
}
export type CreateCamera = (ctx: StageCtx) => CameraRig;

/** fighters/<id>.ts: one robot. The view poses itself from the FighterState every frame. */
export interface FighterView {
  /** add this to the scene; the stage does not position it, pose() does */
  root: THREE.Object3D;
  /** pose from sim state. prev/alpha give smooth motion between ticks. `other` is the opponent
   *  (for grabs and throws, and to look at). `dt` in seconds for secondary motion. */
  pose(s: FighterState, prev: FighterState, alpha: number, other: FighterState, dt: number, side: Side): void;
  /** poses outside the fight: 'select' (turntable idle), 'versus' (signature pose), 'wait' (on the
   *  deck before the fight), 'win', 'lose'. t = seconds in the pose. */
  showPose(name: 'select' | 'versus' | 'wait' | 'win' | 'lose', t: number): void;
  /** world position of a named point, for effects: 'head' | 'chest' | 'handL' | 'handR' | 'footL' | 'footR' */
  point(name: string, out: THREE.Vector3): THREE.Vector3;
  /** 0..1: draw the whole robot toward this flat colour (the stage calls it every frame from PostState) */
  setFlash(amount: number, color: string): void;
  dispose(): void;
}
export type CreateFighterView = (ctx: StageCtx, opts: { side: Side; sideColor: string; alt: boolean }) => FighterView;

/** hitfx.ts: sparks, launch trails, flashes, dust. Reads frame.fight.events. */
export type CreateHitFx = (ctx: StageCtx, cam: CameraRig) => StageModule;

/** ko.ts: the blast when a life is lost, the lethal-hit treatment, the replay dressing. */
export type CreateKoFx = (ctx: StageCtx, cam: CameraRig) => StageModule;

/** hud.ts: names, model, fighter, damage percent, lives, clock, plan marks, the pick ring text. */
export type CreateHud = (ctx: StageCtx) => StageModule;

/** screens/*.ts: the call, select, versus, predictions dressing, break dressing, verdict. */
export type CreateScreen = (ctx: StageCtx) => StageModule;

/** audio.ts: every sound. Reads frame.fight.events and show phase changes. */
export interface AudioRig extends StageModule {
  /** browsers need a gesture: the harness and the site call this from a click */
  unlock(): void;
  setMuted(muted: boolean): void;
  /** master volume 0 to 1 for everything the game plays (0 = muted); the site owns the control */
  setVolume(v: number): void;
}
export type CreateAudio = (ctx: StageCtx) => AudioRig;
