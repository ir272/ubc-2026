// STUB (lead): the stand-in in this character's size until its rig agent replaces this file.
// Keep the export name.
import type { CharacterDef } from '../api.ts';
import { BUILD_GRAB, standinWith } from './standin.ts';

export const WOLF: CharacterDef = {
  ...standinWith(BUILD_GRAB), id: 'vise',
  anims: {
    jab: { anim: 'jab' }, tilt: { anim: 'thrust' }, uptilt: { anim: 'swingUp', hand: 'both' }, dash: { anim: 'charge' },
    smash: { anim: 'swingSide', hand: 'both' }, upsmash: { anim: 'swingUp', hand: 'both' },
    nair: { anim: 'spin' }, fair: { anim: 'swingSide' }, bair: { anim: 'kick' }, uair: { anim: 'swingUp', hand: 'both' }, dair: { anim: 'stomp' },
    grab: { anim: 'reach', hand: 'both' }, special: { anim: 'reach', hand: 'both' }, special2: { anim: 'spin' }, recover: { anim: 'leap' },
  },
};

