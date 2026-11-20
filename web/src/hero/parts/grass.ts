// The far layer of plants: everything that stands on the land's contour against the sky (see world/plants.ts).
// The stones, mushrooms and fallen leaves that never move are painted into the land itself (ridge.ts); the
// near layer of plants is world/front.ts.
import type { Part } from '../engine/types';
import { BACK, drawLayer } from './world/plants';

export const grass: Part = {
  id: 'grass',
  z: 14,
  intro: [0, 0.01],
  draw(pen, f) {
    drawLayer(pen, BACK, f.t);
  },
};
