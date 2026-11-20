// Tumbletop: the stage module the platform's channel page loads (CONTRACT.md section 4).
//
//   const game = mount(el, { assetsBase });
//   game.onFeed(msg)                       every feed message for the channel, in order
//   game.cameras                           ['Director', 'Leader', 'Cut line', 'My pick', 'Overview']
//   game.setCamera(mode, entrantId?)       'My pick' follows entrantId (or the highlighted pick)
//   game.highlight(entrantId | null)       a quiet ring and name tag on the viewer's pick
//   game.setVolume(v)  game.unlockAudio()  the site's sound control (CONTRACT.md, sound hooks)
//   game.destroy()
//
// The stage draws only from feed messages. It replays each round itself from the seed and the
// entrants in the `round` event, in step with the channel's clock, and can join at any second.
import { createStage } from './web/src/stage.js';

export interface MountOpts {
  assetsBase: string;
  /** Dev and capture tools only: a shared clock (see show/clock.js) and virtual-time rendering. */
  clock?: unknown;
  capture?: boolean;
  dpr?: number;
}

export interface GameHandle {
  onFeed(msg: unknown): void;
  cameras: string[];
  setCamera(mode: string, entrantId?: string): void;
  highlight(entrantId: string | null): void;
  /** Master volume 0 to 1 (0 = muted). The site owns the control; the stage draws none. */
  setVolume(v: number): void;
  /** The browser now allows sound: create or resume the AudioContext and play. */
  unlockAudio(): void;
  destroy(): void;
  /** Dev and capture tools only. */
  debug?: unknown;
}

export function mount(el: HTMLElement, opts: MountOpts): GameHandle {
  return createStage(el, opts) as GameHandle;
}

export { simulate, SIM_HASH } from './sim.ts';
