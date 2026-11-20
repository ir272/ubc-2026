// Dry Dock 9: the one arena.
import type { ArenaDef } from './types.ts';

export const ARENA: ArenaDef = {
  main: { x0: -8, x1: 8, y: 0, soft: false },
  soft: [
    { x0: -5.4, x1: -2.6, y: 2.5, soft: true },
    { x0: 2.6, x1: 5.4, y: 2.5, soft: true },
    { x0: -1.5, x1: 1.5, y: 4.8, soft: true },
  ],
  blast: { left: -16, right: 16, top: 12.5, bottom: -7 },
  spawns: [-3, 3],
  respawn: { x: 0, y: 7.4 },
};

/**
 * For collisions the deck is solid from y = 0 all the way down past the bottom blast line: its sides are
 * walls, so nobody can drift under it (the girder underside tapers visually, but under-deck play is out).
 */
export const DECK_BOTTOM = -8;
/** ledge x per ledge index (0 = left, 1 = right) */
export const LEDGE_X = [-8, 8];
/** where the respawn pad stops */
export const PAD_STOP_Y = 6.2;
