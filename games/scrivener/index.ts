// The Scrivener: stage adapter for the Arena website (CONTRACT.md section 4).
//
// Add to web/src/games/registry.ts:
//   scrivener: { load: () => import('@games/scrivener/index.ts'), assetsBase: '/games/scrivener/' },
//
// The stage draws only from feed messages and picks the show up from a `snapshot` at any point.
// Sound files are resolved by the bundler from this folder, so nothing needs copying.

import { createStage } from './src/stage/stage.js';
export { simulate } from './src/show/replay.js';

export interface GameHandle {
  onFeed(msg: unknown): void;
  highlight(entrantId: string | null): void;
  /** Master volume, 0 to 1, for everything the game plays (0 = muted). The site owns the control. */
  setVolume(v: number): void;
  /** The page has had a click or key press: create or resume the AudioContext and start. */
  unlockAudio(): void;
  destroy(): void;
}

export function mount(el: HTMLElement, opts: { assetsBase: string; muted?: boolean }): GameHandle {
  const stage = createStage(el, opts);
  return {
    onFeed: (msg: unknown) => stage.onFeed(msg),
    highlight: (entrantId: string | null) => stage.highlight(entrantId),
    setVolume: (v: number) => stage.setVolume(v),
    unlockAudio: () => stage.unlockAudio(),
    destroy: () => stage.destroy(),
    // not part of the contract: the harness and the capture tools look here
    ...({ debug: stage.debug } as object),
  };
}
