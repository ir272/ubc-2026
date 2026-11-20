// Ringout: the platform adapter (browser). The site loads this through the `@games` alias:
//   brawl: { load: () => import('@games/brawl/index.ts'), assetsBase: '/games/brawl/' }
//
// mount() draws only from feed messages (snapshot first, then everything in order). No top-level
// side effects: importing this module does nothing until mount() is called.

import { createStage } from './src/stage/stage.ts';
import { sideOf } from './src/show/reduce.ts';

export interface GameHandle {
  onFeed(msg: unknown): void;
  cameras?: string[];
  setCamera?(mode: string, entrantId?: string): void;
  highlight?(entrantId: string | null): void;
  /** master volume 0 to 1 for everything the game plays (0 = muted); the site owns the control */
  setVolume?(v: number): void;
  /** the viewer has clicked or pressed a key somewhere on the page: start the sound now */
  unlockAudio?(): void;
  destroy(): void;
}

export function mount(el: HTMLElement, opts: { assetsBase: string }): GameHandle {
  const stage = createStage(el, { assetsBase: opts?.assetsBase ?? '/games/brawl/' });
  let alive = true;
  return {
    onFeed(msg: unknown) {
      if (alive) stage.onFeed(msg);
    },
    cameras: ['auto', 'wide', 'follow'],
    setCamera(mode: string, entrantId?: string) {
      if (!alive) return;
      const side = entrantId ? sideOf(stage.reduced, entrantId) : null;
      stage.setCamera(mode, side ?? undefined);
    },
    highlight(entrantId: string | null) {
      if (alive) stage.highlight(entrantId);
    },
    setVolume(v: number) {
      if (alive) stage.setVolume(v);
    },
    unlockAudio() {
      if (alive) stage.unlock();
    },
    destroy() {
      if (!alive) return;
      alive = false;
      stage.destroy();
    },
  };
}

export default { mount };
