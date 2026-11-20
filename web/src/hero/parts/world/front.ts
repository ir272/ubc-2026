// The near layer of plants, painted over the feet of the sign, the couch, the trunk, the TV and the walkers.
import type { Part } from '../../engine/types';
import { FRONT, drawLayer } from './plants';

export const front: Part = {
  id: 'front',
  z: 32,
  intro: [0, 0.01],
  draw(pen, f) {
    drawLayer(pen, FRONT, f.t);
  },
};
