import { H, PAPER } from '../engine/layout';
import type { Part } from '../engine/types';

// The land at the right is a strip with bare paper under it. At the left the hill mass runs off the bottom
// of the picture, so the last stretch sinks softly into the paper and the page below continues the sheet.
// Only the left third has land that low, so only that stretch is painted (one small cached strip).
const TOP = 900, RIGHT = 1030;

export const fade: Part = {
  id: 'fade',
  z: 40,
  intro: [0, 0.01],
  draw(pen) {
    pen.cache('fade', { x: 0, y: TOP, w: RIGHT, h: H - TOP }, (p) => {
      const g = p.ctx.createLinearGradient(0, TOP, 0, H);
      g.addColorStop(0, 'rgba(12,16,11,0)');
      g.addColorStop(0.85, PAPER);
      g.addColorStop(1, PAPER);
      p.ctx.fillStyle = g;
      p.ctx.fillRect(0, TOP, RIGHT, H - TOP);
    });
  },
};
