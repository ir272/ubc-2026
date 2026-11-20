// The ground: a flat green fill under the ground line down to the bottom edge, and the pale outline along it,
// which draws itself on from left to right during the intro. The fill follows the pen tip as it goes.
import { GREEN, GREEN_LINE, GROUND, H, W } from '../engine/layout';
import type { Part, Pt } from '../engine/types';

let LINE: Pt[] | null = null;

export const ridge: Part = {
  id: 'ridge',
  z: 12,
  intro: [0.0, 1.0],
  draw(pen, f) {
    const line = (LINE ??= pen.curve(GROUND, 12));
    const e = f.reveal >= 1 ? 1 : 1 - (1 - f.reveal) ** 2; // ease out: the pen slows as it reaches the tree
    if (e <= 0) return;
    const ctx = pen.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-10, 0, (W + 20) * e + 10, H);
    ctx.clip();
    pen.fill([...line, [W + 10, line[line.length - 1]![1]], [W + 10, H + 10], [-10, H + 10], [-10, line[0]![1]]], GREEN);
    ctx.restore();
    pen.stroke(line, { color: GREEN_LINE, width: 6, seed: 41, reveal: e });
  },
};
