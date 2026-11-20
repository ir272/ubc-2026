// 1. The call: the two bots are announced. Their names large in the side tints, a crossing mark
// between them, each name sitting on a rule in its tint that runs out from the middle.

import type { InkFrame } from '../api.ts';
import { W } from '../api.ts';
import type { Side } from '../../sim/types.ts';
import { C, crossMark, fitSize, flourish, newInk, out, pageFrame, span, text, textW, tintOf, draw } from './kit.ts';

export function drawTitle(f: InkFrame, title: string, ms: number, t0 = 150): void {
  const g = f.g;
  const ink = newInk(g);
  text(g, title, W / 2, 96, { size: 27, weight: 500, color: C.soft, align: 'center' }, span(ms, t0, 450));
  flourish(ink, W / 2, 74, 114, span(ms, t0 + 150, 500), 61);
}

export function drawCall(f: InkFrame): void {
  const ctx = f.show.ctx;
  if (!ctx) return;
  const g = f.g;
  const ms = f.show.phaseMs;
  const ink = newInk(g);
  pageFrame(ink, g, span(ms, 0, 900));
  drawTitle(f, 'Next up', ms, 250);

  const cy = 372;
  const gapX = 132;
  crossMark(ink, W / 2, cy - 20, 96, span(ms, 350, 900), 300, [tintOf(f, 0), tintOf(f, 1)]);
  for (const side of [0, 1] as Side[]) {
    const left = side === 0;
    const bot = ctx.bots[side];
    if (!bot) continue;
    const x = left ? W / 2 - gapX : W / 2 + gapX;
    const size = fitSize(g, bot.name, 78, 650, 430);
    const t0 = 500 + side * 160;
    const w = textW(g, bot.name, size, 650);
    text(g, bot.name, x, cy, { size, weight: 650, color: tintOf(f, side), align: left ? 'right' : 'left' }, span(ms, t0, 550));
    const far = left ? x - w - 34 : x + w + 34;
    const ry = cy + 26;
    draw(ink, [[x + (left ? 30 : -30), ry], [far, ry + 1]], out(span(ms, t0 + 200, 550)), { w: 2.2, seed: 320 + side, taper: 0.7, tint: tintOf(f, side) });
    draw(ink, [[x + (left ? 18 : -18), ry + 8], [far + (left ? 40 : -40), ry + 9]], out(span(ms, t0 + 320, 550)), { w: 1, seed: 330 + side, taper: 0.8, alpha: 0.5 });
    if (bot.modelLabel) text(g, bot.modelLabel, x, ry + 44, { size: 22, weight: 400, color: C.dim, align: left ? 'right' : 'left' }, span(ms, t0 + 500, 450));
  }
}
