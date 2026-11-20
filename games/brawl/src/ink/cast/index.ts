// Which drawing plays each fighter id (the owner's picks): gantry is The Count, vise is The Wolf,
// kiln is The Empty Armour, tick is The Magpie, hexer is The Hexer, mimic is The Mimic.
import type { FighterId } from '../../sim/types.ts';
import type { CharacterDef } from '../api.ts';
import { COUNT } from './count.ts';
import { WOLF } from './wolf.ts';
import { ARMOUR } from './armour.ts';
import { MAGPIE } from './magpie.ts';
import { HEXER } from './hexer.ts';
import { MIMIC } from './mimic.ts';

export const CAST: Record<FighterId, CharacterDef> = {
  kiln: ARMOUR, tick: MAGPIE, gantry: COUNT, vise: WOLF,
  hexer: { ...HEXER, id: 'hexer' }, mimic: { ...MIMIC, id: 'mimic' },
};

/** every drawn character by name */
export const DRAWINGS: Record<string, CharacterDef> = { count: COUNT, wolf: WOLF, armour: ARMOUR, magpie: MAGPIE, hexer: HEXER, mimic: MIMIC };

/** harness only: `cast=gantry:hexer,vise:mimic` makes a sim id wear another drawing (keeps the id's moves) */
export function overrideCast(spec: string | null): void {
  if (!spec) return;
  for (const pair of spec.split(',')) {
    const [id, name] = pair.split(':');
    const d = name ? DRAWINGS[name] : undefined;
    if (id && d && id in CAST) CAST[id as FighterId] = { ...d, id: id as FighterId };
  }
}
