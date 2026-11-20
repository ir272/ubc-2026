// Which drawing plays each fighter id. Until the owner picks the cast, every id is the stand-in, in
// the build that matches the id's moves (kiln heavy, tick fast, gantry long reach, vise grabber), with
// each move acted the way its `look` note says.
import type { FighterId } from '../../sim/types.ts';
import type { CharacterDef } from '../api.ts';
import { BUILD_FAST, BUILD_HEAVY, standinWith } from './standin.ts';
import { COUNT } from './count.ts';
import { WOLF } from './wolf.ts';

const kiln: CharacterDef = {
  ...standinWith(BUILD_HEAVY), id: 'kiln',
  anims: {
    jab: { anim: 'jab' }, tilt: { anim: 'thrust', hand: 'both' }, uptilt: { anim: 'swingUp' }, dash: { anim: 'charge' },
    smash: { anim: 'slam', hand: 'both' }, upsmash: { anim: 'swingUp', hand: 'both' },
    nair: { anim: 'spin' }, fair: { anim: 'swingOver' }, bair: { anim: 'kick' }, uair: { anim: 'swingUp' }, dair: { anim: 'stomp' },
    grab: { anim: 'reach', hand: 'both' }, special: { anim: 'cast', hand: 'both' }, special2: { anim: 'thrust' }, recover: { anim: 'leap' },
  },
};
const tick: CharacterDef = {
  ...standinWith(BUILD_FAST), id: 'tick',
  anims: {
    jab: { anim: 'jab' }, tilt: { anim: 'kick' }, uptilt: { anim: 'swingUp' }, dash: { anim: 'charge' },
    smash: { anim: 'kick' }, upsmash: { anim: 'kickUp' },
    nair: { anim: 'spin' }, fair: { anim: 'swingSide' }, bair: { anim: 'kick' }, uair: { anim: 'swingUp' }, dair: { anim: 'stomp' },
    grab: { anim: 'reach', hand: 'both' }, special: { anim: 'thrust' }, special2: { anim: 'kickUp' }, recover: { anim: 'leap' },
  },
};
// The owner's picks: gantry is The Count, vise is The Wolf. kiln and tick are not on the roster (stand-ins).
export const CAST: Record<FighterId, CharacterDef> = { kiln, tick, gantry: COUNT, vise: WOLF };
