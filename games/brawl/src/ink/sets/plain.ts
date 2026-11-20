// The plain set: the current arena drawn as the deck (a heavy pen line over a hatched body), the
// soft platforms as lighter boards, and a few four-point stars. Drawn once, in world space, into an
// offscreen canvas; each frame is one drawImage through the view.

import type { InkFrame, StageSet } from '../api.ts';
import type { ArenaDef } from '../../sim/types.ts';
import { ARENA } from '../../sim/arena.ts';
import { makeInk, type Pt } from '../pen.ts';

/** cache resolution, px per world metre */
const PPM = 96;
/** world rectangle the cache covers */
const WX0 = -18, WX1 = 18, WY0 = -8, WY1 = 13;

const STARS: [number, number, number][] = [
  [-11.5, 10.2, 1], [-6.8, 11.6, 0.6], [-2.2, 9.4, 0.5], [3.4, 11.9, 0.8], [8.6, 9.8, 0.55], [12.2, 11.1, 0.9], [-13.6, 6.4, 0.5], [14.4, 5.6, 0.6],
];

export function createPlainSet(arena: ArenaDef = ARENA): StageSet {
  let cache: HTMLCanvasElement | null = null;

  function build(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = Math.round((WX1 - WX0) * PPM);
    c.height = Math.round((WY1 - WY0) * PPM);
    const g = c.getContext('2d')!;
    const ink = makeInk(g, 'line');
    const X = (x: number) => (x - WX0) * PPM;
    const Y = (y: number) => (WY1 - y) * PPM;
    const P = (x: number, y: number): Pt => [X(x), Y(y)];

    // stars: a long vertical and horizontal stroke, short diagonals
    let seed = 300;
    for (const [sx, sy, k] of STARS) {
      const r = 0.42 * k * PPM;
      const cx = X(sx), cy = Y(sy);
      ink.line([[cx, cy - r], [cx, cy + r]], { w: 1.6, seed: seed++, taper: 0.9, alpha: 0.8 });
      ink.line([[cx - r * 0.8, cy], [cx + r * 0.8, cy]], { w: 1.6, seed: seed++, taper: 0.9, alpha: 0.8 });
      ink.line([[cx - r * 0.22, cy - r * 0.22], [cx + r * 0.22, cy + r * 0.22]], { w: 1.1, seed: seed++, taper: 0.8, alpha: 0.5 });
      ink.line([[cx - r * 0.22, cy + r * 0.22], [cx + r * 0.22, cy - r * 0.22]], { w: 1.1, seed: seed++, taper: 0.8, alpha: 0.5 });
    }

    // the deck body: a hull that narrows under the deck, hatched
    const m = arena.main;
    const body: Pt[] = [
      P(m.x0, m.y), P(m.x1, m.y), P(m.x1 - 0.25, m.y - 0.9), P(m.x1 - 1.4, m.y - 2.2), P(m.x1 - 3.6, m.y - 3.1),
      P(m.x0 + 3.6, m.y - 3.1), P(m.x0 + 1.4, m.y - 2.2), P(m.x0 + 0.25, m.y - 0.9),
    ];
    ink.hatch(body, { angle: 0.95, gap: 15, w: 1.3, alpha: 0.38, free: true, seed: 41 });
    ink.hatch(body.slice(0, 3).concat([P(m.x0 + 0.25, m.y - 0.9)]), { angle: -0.6, gap: 19, w: 1.1, alpha: 0.22, free: true, seed: 47 });
    // the hull's sides
    ink.line([P(m.x1, m.y), P(m.x1 - 0.25, m.y - 0.9), P(m.x1 - 1.4, m.y - 2.2), P(m.x1 - 3.6, m.y - 3.1)], { w: 3, seed: 51, taper: 0.8 });
    ink.line([P(m.x0, m.y), P(m.x0 + 0.25, m.y - 0.9), P(m.x0 + 1.4, m.y - 2.2), P(m.x0 + 3.6, m.y - 3.1)], { w: 3, seed: 52, taper: 0.8 });
    ink.line([P(m.x0 + 3.2, m.y - 3.12), P(m.x1 - 3.2, m.y - 3.12)], { w: 2, seed: 53, taper: 0.9, alpha: 0.6 });
    // the deck: a heavy line, a second lighter pass under it
    ink.line([P(m.x0 - 0.08, m.y), P(-2, m.y + 0.012), P(3, m.y - 0.01), P(m.x1 + 0.08, m.y)], { w: 6.5, seed: 61, taper: 0.25 });
    ink.line([P(m.x0 + 0.2, m.y - 0.16), P(m.x1 - 0.2, m.y - 0.16)], { w: 1.6, seed: 62, taper: 0.6, alpha: 0.7 });

    // the soft platforms: lighter boards with two short struts
    for (let i = 0; i < arena.soft.length; i++) {
      const p = arena.soft[i]!;
      ink.line([P(p.x0, p.y), P(p.x1, p.y)], { w: 3.6, seed: 80 + i * 7, taper: 0.4 });
      ink.line([P(p.x0 + 0.12, p.y - 0.14), P(p.x1 - 0.12, p.y - 0.14)], { w: 1.4, seed: 81 + i * 7, taper: 0.6, alpha: 0.6 });
      ink.line([P(p.x0 + 0.4, p.y - 0.14), P(p.x0 + 0.62, p.y - 0.55)], { w: 1.5, seed: 82 + i * 7, taper: 0.7, alpha: 0.7 });
      ink.line([P(p.x1 - 0.4, p.y - 0.14), P(p.x1 - 0.62, p.y - 0.55)], { w: 1.5, seed: 83 + i * 7, taper: 0.7, alpha: 0.7 });
    }
    return c;
  }

  return {
    id: 'plain',
    name: 'Plain',
    arena,
    draw(f: InkFrame) {
      if (!cache) cache = build();
      const v = f.view;
      // the world rectangle -> stage px; drawImage clips to the canvas by itself
      const dx = v.x(WX0);
      const dy = v.y(WY1);
      const dw = (WX1 - WX0) * v.scale;
      const dh = (WY1 - WY0) * v.scale;
      f.g.imageSmoothingEnabled = true;
      f.g.drawImage(cache, dx, dy, dw, dh);
    },
    dispose() {
      if (cache) {
        cache.width = 0;
        cache.height = 0;
      }
      cache = null;
    },
  };
}
