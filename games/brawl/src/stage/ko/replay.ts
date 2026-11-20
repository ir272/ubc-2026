// Beat 3: the replay dressing. While the fight view is a knockout replay the picture is framed by
// two ink bars that cut in over a few frames. The set is graded down toward a cold teal (ko.ts,
// through post.dim) and the replay runs slow on its own camera, so it never reads as the live
// fight. The lethal-hit treatment plays again inside it, driven by the replay's own events.
// Clean pass: no rules, no blinking tab, no afterimages. Owner's rule (Nov 19, 15:12): the word
// Replay is gone too; the bars, the grade and the slow motion say it. Do not put it back.

import { PALETTE, el } from '../style.ts';
import { easeOut } from './kit.ts';

const BAR = 76;

export class ReplayDress {
  private readonly root: HTMLElement;
  private readonly top: HTMLElement;
  private readonly bottom: HTMLElement;
  private on = false;
  private t = 0;

  constructor(ui: HTMLElement) {
    this.root = el('div', ui, { position: 'absolute', left: '0', top: '0', width: '1280px', height: '720px', pointerEvents: 'none', display: 'none', overflow: 'hidden' });
    this.top = el('div', this.root, { position: 'absolute', left: '0', top: '0', width: '1280px', height: `${BAR}px`, background: PALETTE.ink });
    this.bottom = el('div', this.root, { position: 'absolute', left: '0', bottom: '0', width: '1280px', height: `${BAR}px`, background: PALETTE.ink });
  }

  /** 0..1: how far the bars are in (for the set grade) */
  get amount(): number {
    return this.on ? easeOut((this.t * 60) / 5) : 0;
  }

  update(dt: number, replay: boolean): void {
    if (replay && !this.on) {
      this.on = true;
      this.t = 0;
      this.root.style.display = 'block';
    }
    if (!replay && this.on) {
      // out on a hard cut
      this.on = false;
      this.root.style.display = 'none';
      return;
    }
    if (!this.on) return;
    this.t += dt;
    const k = easeOut((this.t * 60) / 5);
    this.top.style.transform = `translateY(${(-(1 - k) * BAR).toFixed(1)}px)`;
    this.bottom.style.transform = `translateY(${((1 - k) * BAR).toFixed(1)}px)`;
  }

  dispose(): void {
    this.root.remove();
  }
}
