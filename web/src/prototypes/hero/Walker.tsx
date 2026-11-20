// One walking figure. The hero only knows this interface: a kind, and how tall the drawing's own
// figure of that kind is at the current size. The sprite stands with the middle of its feet on the
// parent's origin (0, 0), so the parent can be moved along the ground and rocked about the feet.
//
// Today each kind is a line-only cut-out of the figure in the drawing (see cut-assets.py). To give a
// kind a real walk cycle later, change only this file.

import { HERO, type WalkerKind } from './asset';

/** How tall a walker of this kind is, in px, when the drawing is `stageH` px tall. */
export const walkerHeight = (kind: WalkerKind, stageH: number) => HERO.walkers[kind].h * stageH;

export function Walker({ kind, height }: { kind: WalkerKind; height: number }) {
  const s = HERO.walkers[kind];
  const width = (height * s.pw) / s.ph;
  return (
    <img
      className="hero-walker-sprite"
      src={s.src}
      alt=""
      draggable={false}
      decoding="async"
      style={{ width, height, left: -width / 2, top: -height, transform: s.flip ? 'scaleX(-1)' : undefined }}
    />
  );
}
