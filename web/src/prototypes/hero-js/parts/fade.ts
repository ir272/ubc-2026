import { H, PAPER, W } from '../engine/layout';
import type { Part } from '../engine/types';

// The ground is a band, not a block: below the ridge the green sinks back into the paper, as in Ian's picture,
// so the channel cards that overlap the bottom of the hero sit on plain paper.
const TOP = 770;

export const fade: Part = {
  id: 'fade',
  z: 40,
  intro: [0, 0.01],
  draw(pen) {
    const { ctx } = pen;
    const g = ctx.createLinearGradient(0, TOP, 0, H);
    g.addColorStop(0, 'rgba(12,16,11,0)');
    g.addColorStop(0.75, PAPER);
    g.addColorStop(1, PAPER);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, TOP, W, H - TOP);
    ctx.restore();
  },
};
