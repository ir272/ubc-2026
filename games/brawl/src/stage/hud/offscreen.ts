// Off-screen marker: when a fighter is beyond the frame edge, a small side-coloured plate with the
// fighter's portrait sits at that edge and a pointer on it aims at where the fighter really is.
// Angular plate, hard ink shadow; no bubble. Per frame only transform and opacity change.

import { PALETTE, el } from '../style.ts';

const SIZE = 70;
const CLIP = 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)';

export class EdgeMarker {
  readonly root: HTMLElement;
  private arrow: HTMLElement;
  private canvas: HTMLCanvasElement;
  private alpha = 0;
  private shownT = 0;

  constructor(parent: HTMLElement, color: string) {
    this.root = el('div', parent, {
      position: 'absolute',
      left: `${-SIZE / 2}px`,
      top: `${-SIZE / 2}px`,
      width: `${SIZE}px`,
      height: `${SIZE}px`,
      opacity: '0',
      willChange: 'transform, opacity',
    });
    // the pointer: rides round the plate on a rotating arm
    this.arrow = el('div', this.root, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${SIZE}px`,
      height: `${SIZE}px`,
      willChange: 'transform',
    });
    // a solid side-colour arrowhead with a hard ink edge, pointing out of the plate
    el('div', this.arrow, {
      position: 'absolute',
      left: `${SIZE - 8}px`,
      top: `${SIZE / 2 - 19}px`,
      width: '34px',
      height: '38px',
      background: PALETTE.ink,
      clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
    });
    el('div', this.arrow, {
      position: 'absolute',
      left: `${SIZE - 8}px`,
      top: `${SIZE / 2 - 14}px`,
      width: '26px',
      height: '28px',
      background: color,
      clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
    });
    el('div', this.root, { position: 'absolute', left: '5px', top: '5px', width: `${SIZE}px`, height: `${SIZE}px`, background: PALETTE.ink, clipPath: CLIP });
    el('div', this.root, { position: 'absolute', left: '0', top: '0', width: `${SIZE}px`, height: `${SIZE}px`, background: color, clipPath: CLIP });
    el('div', this.root, { position: 'absolute', left: '6px', top: '5px', width: `${SIZE - 12}px`, height: `${SIZE - 10}px`, background: PALETTE.navy, clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' });
    this.canvas = el('canvas', this.root, { position: 'absolute', left: '2px', top: '0', width: `${SIZE - 4}px`, height: `${SIZE - 4}px`, clipPath: 'polygon(12px 4px, 100% 4px, calc(100% - 6px) 100%, 4px 100%)' });
    this.canvas.width = 120;
    this.canvas.height = 120;
  }

  /** copy the head out of a rendered portrait (the canvas the plate shows) */
  setPortrait(src: HTMLCanvasElement | null, flip: boolean): void {
    const c = this.canvas.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, 120, 120);
    if (!src || !src.width) return;
    const w = src.width;
    // the whole bust, a little tighter than the plate shows it
    const s = w * 0.9;
    c.save();
    if (flip) {
      c.translate(120, 0);
      c.scale(-1, 1);
    }
    c.drawImage(src, (w - s) / 2, w * 0.04, s, s, 0, 0, 120, 120);
    c.restore();
  }

  /** want: the fighter is out of frame and alive. (sx, sy): its projected centre, 1280x720 space */
  update(dt: number, want: boolean, sx: number, sy: number): void {
    this.alpha += ((want ? 1 : 0) - this.alpha) * Math.min(1, dt * (want ? 18 : 10));
    if (want) this.shownT += dt;
    else this.shownT = 0;
    if (this.alpha < 0.01) {
      if (this.root.style.opacity !== '0') this.root.style.opacity = '0';
      return;
    }
    // the pointer reaches ~26 px past the plate: keep its tip well inside the frame
    const m = SIZE / 2 + 40;
    let x = Math.max(m, Math.min(1280 - m, sx));
    let y = Math.max(m, Math.min(720 - m, sy));
    // keep off the clock tab and the two corner scorebugs
    if (y < 64 + m && x > 560 - m && x < 720 + m) x = x < 640 ? 560 - m : 720 + m;
    if (y > 530 - SIZE / 2 && (x < 418 + m || x > 862 - m)) y = 530 - SIZE / 2;
    const ang = Math.atan2(sy - y, sx - x);
    const f = this.shownT * 60;
    const sc = f < 2 ? 1.25 : f < 4 ? 0.94 : 1;
    this.root.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${sc})`;
    this.root.style.opacity = this.alpha.toFixed(3);
    this.arrow.style.transform = `rotate(${((ang * 180) / Math.PI).toFixed(1)}deg)`;
  }
}
