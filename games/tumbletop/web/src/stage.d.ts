export function createStage(el: HTMLElement, opts?: { assetsBase?: string; clock?: unknown; capture?: boolean; dpr?: number }): {
  onFeed(msg: unknown): void;
  cameras: string[];
  setCamera(mode: string, entrantId?: string): void;
  highlight(entrantId: string | null): void;
  setVolume(v: number): void;
  unlockAudio(): void;
  destroy(): void;
  debug?: unknown;
};
