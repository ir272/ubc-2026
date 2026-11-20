// The stage's outward shape: what the adapter (index.ts) and the harness hold. The picture is the
// 2D ink stage (src/ink/stage.ts); the three.js robot stage that used to live here was retired on
// 2026-11-20 when the owner chose the ink redraw (it is in git history up to cbe16fb).
import type { FighterId, Side, MoveId, Action } from '../sim/types.ts';
import type { Reduced } from '../show/reduce.ts';
import type { TimeSource } from './clock.ts';

export interface StageOptions {
  assetsBase: string;
  /** capture mode: no animation loop; time comes from `time` and frames run only through frame() */
  capture?: { time: TimeSource };
}

export interface StageInfo {
  phase: string;
  showMs: number;
  phaseMs: number;
  tick: number | null;
  mode: string | null;
  fighters: { fighter: FighterId; action: Action; move: MoveId | null; damage: number; lives: number; x: number; y: number }[];
  fps: number;
  frameMs: number;
  mismatches: number;
  matches: number;
  plans: (string | null)[];
  /** the last 5 sim events handed to the modules, newest last: "tick mode type details" */
  events: string[];
  /** playback is holding on a lethal hit */
  holding: boolean;
  /** the tick of the last knockout (life_lost), if any */
  koTick: number | null;
  /** a module set post.coverSet on the last frame */
  covered: boolean;
}

export interface Stage {
  onFeed(msg: unknown): void;
  setCamera(mode: string, side?: Side): void;
  highlight(entrantId: string | null): void;
  setMuted(muted: boolean): void;
  /** master volume 0 to 1 for everything the game plays (0 = muted). Remembered and applied again
   *  whenever the rig unlocks, so it holds whatever order the site calls things in. */
  setVolume(v: number): void;
  /** the viewer has clicked or pressed a key somewhere on the page: create or resume the audio now */
  unlock(): void;
  /** run one frame: dt seconds of show clock since the last one; render unless told not to */
  frame(dt: number, render?: boolean): void;
  /** draw the current frame again without advancing anything (capture) */
  render(): void;
  info(): StageInfo;
  /** capture: lay one fighter out as a pose sheet (the `moves` scene). null returns to the show.
   *  `part` (1-based) of `parts` splits a long sheet into pages */
  poseSheet(fighter: FighterId | null, move?: string, page?: { part: number; parts: number }): void;
  /** the reduced feed (for the harness) */
  readonly reduced: Reduced;
  destroy(): void;
}
