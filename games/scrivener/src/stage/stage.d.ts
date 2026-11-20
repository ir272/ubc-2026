export function createStage(el: HTMLElement, opts?: { assetsBase?: string; muted?: boolean }): {
  onFeed(msg: unknown): void;
  highlight(entrantId: string | null): void;
  setVolume(v: number): void;
  unlockAudio(): void;
  destroy(): void;
  debug: unknown;
};
