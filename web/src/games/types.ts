// The game seam from CONTRACT.md §4. Every game (built-in or from games/<id>/) implements this.
export interface GameHandle {
  /** every feed message for the channel, in order (a `snapshot` first, and again after a reconnect) */
  onFeed(msg: unknown): void;
  cameras?: string[];
  setCamera?(mode: string, entrantId?: string): void;
  /** the viewer's pick */
  highlight?(entrantId: string | null): void;
  /**
   * Master volume, 0 to 1, for everything the game plays (0 = muted). The site owns the control and
   * calls this at mount and on every change. A game must not draw its own sound button.
   */
  setVolume?(v: number): void;
  /**
   * The viewer has clicked or pressed a key somewhere on the page, so the browser now allows sound:
   * create or resume the AudioContext and start playing. Called at mount if that already happened
   * (the usual case: they clicked a channel on the home page), otherwise on their first click.
   * The game must not wait for a click on the stage itself, and must not show a "click for sound" hint.
   */
  unlockAudio?(): void;
  destroy(): void;
}

export interface GameModule {
  mount(el: HTMLElement, opts: { assetsBase: string }): GameHandle;
}
