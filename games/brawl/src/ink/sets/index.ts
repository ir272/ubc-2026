// Stage sets by id. The six designed stages (lab/stages, the stage sheet) and the plain set.
import type { StageSet } from '../api.ts';
import { createPlainSet } from './plain.ts';
import { createBelfrySet } from './belfry.ts';
import { createShelfSet } from './shelf.ts';
import { createGraveyardSet } from './graveyard.ts';
import { createShipSet } from './ship.ts';
import { createMapSet } from './map.ts';
import { createRooftopsSet } from './rooftops.ts';

export const SETS: Record<string, () => StageSet> = {
  belfry: createBelfrySet,
  shelf: createShelfSet,
  graveyard: createGraveyardSet,
  ship: createShipSet,
  map: createMapSet,
  rooftops: createRooftopsSet,
  plain: () => createPlainSet(),
};

/** the designed stages, in the stage sheet's order */
export const STAGE_IDS: string[] = ['belfry', 'shelf', 'graveyard', 'ship', 'map', 'rooftops'];

/** the default set */
export const DEFAULT_SET = 'belfry';

/** a fresh set for this id (unknown ids get the default set) */
export function setFor(id: string | null | undefined): StageSet {
  const make = (id && SETS[id]) || SETS[DEFAULT_SET]!;
  return make();
}
