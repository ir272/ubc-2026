// STUB (lead): the stand-in in this character's size until its rig agent replaces this file.
// Keep the export name.
import type { CharacterDef } from '../api.ts';
import { BUILD_HEAVY, standinWith } from './standin.ts';

export const ARMOUR: CharacterDef = {
  ...standinWith(BUILD_HEAVY), id: 'kiln',
  anims: {
    jab: { anim: 'jab' }, tilt: { anim: 'thrust', hand: 'both' }, uptilt: { anim: 'swingUp' }, dash: { anim: 'charge' },
    smash: { anim: 'slam', hand: 'both' }, upsmash: { anim: 'swingUp', hand: 'both' },
    nair: { anim: 'spin' }, fair: { anim: 'swingOver' }, bair: { anim: 'kick' }, uair: { anim: 'swingUp' }, dair: { anim: 'stomp' },
    grab: { anim: 'reach', hand: 'both' }, special: { anim: 'cast', hand: 'both' }, special2: { anim: 'thrust' }, recover: { anim: 'leap' },
  },
};
