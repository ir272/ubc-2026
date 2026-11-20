// Blood Moon sound recipes. Every function schedules one sound at context time `t` on an Engine.
//
// The world is hand-inked gothic monsters on black: the Count (gantry) against the Wolf (vise).
// Everything is a recording (CC0, ASSETS.md), played with small pitch and gain variation and a round
// robin that never repeats the last pick. Few layers, nothing bright: cloth and cloak whooshes for
// swings, dull body thuds for hits with a claw slash or a bite snap on top when the move is a claw or
// a bite, a bat flutter for the swarm, a breath for the mist, a snarl for the pounce, one wolf howl,
// a candle snuffed when a life goes, one deep bell toll for a knockout, a quill for titles.
//
// The ladder (loudest 10 ms, measured with tools/audio.mjs): light < medium < heavy < lethal <
// knockout, each step a little louder and longer than the one under it.

import type { FighterId, HitStrength, MoveId } from '../../sim/types.ts';
import { sample, type Engine } from './engine.ts';

export interface Fam {
  /** pitch factor for the fighter's own sounds: lower is bigger */
  pitch: number;
  /** 0..1, body weight for steps and landings */
  weight: number;
  /** footstep interval while running, ticks */
  stride: number;
}

// kiln the Empty Armour, tick the Magpie, gantry the Count, vise the Wolf, hexer the Hexer, mimic the Mimic
export const FAMS: Record<FighterId, Fam> = {
  kiln: { pitch: 0.88, weight: 0.9, stride: 18 },
  tick: { pitch: 1.12, weight: 0.25, stride: 9 },
  gantry: { pitch: 1.0, weight: 0.5, stride: 15 },
  vise: { pitch: 0.93, weight: 0.7, stride: 12 },
  hexer: { pitch: 1.05, weight: 0.4, stride: 16 },
  mimic: { pitch: 0.9, weight: 0.85, stride: 13 },
};

/** which strikes land with claws and which with jaws, per fighter (the rest are body or cloak) */
const CLAW: Partial<Record<FighterId, readonly string[]>> = {
  gantry: ['jab', 'dash', 'upsmash', 'fair', 'uair', 'dair', 'special2'],
  vise: ['tilt', 'uptilt', 'smash', 'upsmash', 'nair', 'dair', 'recover'],
};
const BITE: Partial<Record<FighterId, readonly string[]>> = {
  vise: ['jab', 'fair', 'uair', 'throwf', 'special'],
  // the Mimic's lid snaps shut on the same moves the Wolf bites with (its moves are drawn from his)
  mimic: ['jab', 'fair', 'uair', 'throwf'],
};
/** the layer a strike adds on contact: claws, jaws, the lid, the Magpie's knife, the Hexer's staff */
type Touch = 'claw' | 'bite' | 'lid' | 'knife' | 'staff';
function touch(f: FighterId, move: string | undefined): Touch | null {
  if (!move) return null;
  if (BITE[f]?.includes(move)) return f === 'mimic' ? 'lid' : 'bite';
  if (CLAW[f]?.includes(move)) return 'claw';
  if (f === 'tick' && move !== 'special' && move !== 'grab') return 'knife';
  if (f === 'hexer' && move !== 'special' && move !== 'special2' && move !== 'grab') return 'staff';
  return null;
}

const LIGHTS = ['p-light-1', 'p-light-2', 'p-light-3', 'p-light-4'];
const MEDIUMS = ['p-med-1', 'p-med-2', 'p-med-3', 'p-med-4'];
const HEAVIES = ['p-heavy-1', 'p-heavy-2', 'p-heavy-3', 'p-heavy-4'];
const STEPS = ['step-a', 'step-b', 'step-c', 'step-d'];
const CLOAKS = ['cloak-1', 'cloak-2', 'cloak-3', 'cloak-4'];
const CLOAKS_BIG = ['cloak-big-1', 'cloak-big-2'];
const CLAWS = ['claw-1', 'claw-2'];
const BITES = ['bite-1', 'bite-2'];
const BATS = ['bats-1', 'bats-2'];
const SNARLS = ['snarl-1', 'snarl-2'];
const QUILLS = ['quill-1', 'quill-2'];
const PLATES = ['plate-1', 'plate-2', 'plate-3'];
const BLADES = ['blade-1', 'blade-2', 'blade-3'];
const KNIVES = ['knife-1', 'knife-2'];
const STAVES = ['staff-1', 'staff-2'];
const FEATHERS = ['feathers-1', 'feathers-2'];
const CREAKS = ['creak-1', 'creak-2'];
const LIDS = ['lid-1', 'lid-2'];

/**
 * Per-recording trims (dB) so every member of a round-robin set lands at the same loudest 10 ms
 * after the recipe's filters: repeats vary in timbre, never in where they sit on the ladder.
 */
const TRIM_DB: Record<string, number> = {
  'p-light-1': -1.6, 'p-light-2': 0.9, 'p-light-3': 2.5, 'p-light-4': -1.8,
  'p-med-1': 0.8, 'p-med-2': 2.7, 'p-med-3': -1.9, 'p-med-4': -1.6,
  'p-heavy-1': 1.5, 'p-heavy-2': -1.2, 'p-heavy-3': 1.8, 'p-heavy-4': -2.0,
  'claw-1': -2, 'claw-2': 0, 'bite-1': -1, 'bite-2': -2,
};
const trim = (name: string) => Math.pow(10, (TRIM_DB[name] ?? 0) / 20);
/** small gain variation, about +-1 dB */
const vg = (e: Engine) => e.rng.range(0.89, 1.12);
/** small pitch variation, about +-4% */
const vr = (e: Engine, k = 0.04) => e.rng.range(1 - k, 1 + k);

/** the claw slash, the bite snap, the lid clack, the knife or the staff knock on top of a landed strike */
function edge(e: Engine, t: number, f: FighterId, move: string | undefined, amt: number, pan: number): void {
  const k = touch(f, move);
  if (!k || amt <= 0) return;
  if (k === 'knife') {
    e.smp(e.rr('knife-hit', KNIVES), t, { gain: 0.45 * amt * vg(e), rate: 1.15 * vr(e, 0.06), pan, hp: 900, lp: 7000, dur: 0.18 });
    return;
  }
  if (k === 'staff') {
    e.smp('wood-knock', t, { gain: 0.6 * amt * vg(e), rate: 1.05 * vr(e, 0.06), pan, hp: 150, lp: 5000, dur: 0.2 });
    return;
  }
  if (k === 'lid') {
    const n = e.rr('lid', LIDS);
    e.smp(n, t, { gain: 0.7 * amt * vg(e), rate: 1.0 * vr(e, 0.06), pan, hp: 120, lp: 6000 });
    return;
  }
  const n = e.rr(k, k === 'claw' ? CLAWS : BITES);
  // claws are kept dark (no hiss on top); the snap keeps its click
  e.smp(n, t, { gain: trim(n) * amt * vg(e), rate: (k === 'claw' ? 0.92 : 1.0) * vr(e, 0.06), pan, hp: k === 'claw' ? 300 : 150, lp: k === 'claw' ? 5000 : 6500 });
}

/** what the struck body sounds like: the Armour's plates rattle, the Mimic's wood knocks */
function struck(e: Engine, t: number, f: FighterId, amt: number, pan: number): void {
  if (f === 'kiln') e.smp(e.rr('plate-hit', PLATES), t, { gain: 0.55 * amt * vg(e), rate: 1.0 * vr(e, 0.05), pan, hp: 200, lp: 5000 });
  else if (f === 'mimic') e.smp('wood-knock', t, { gain: 0.55 * amt * vg(e), rate: 0.85 * vr(e, 0.05), pan, hp: 100, lp: 3500, dur: 0.25 });
}

// ------------------------------------------------------------------------------------------------
// hits
// ------------------------------------------------------------------------------------------------

export interface HitArgs {
  strength: HitStrength;
  /** the attacker's fighter (timbre) */
  by: FighterId;
  /** the victim's fighter (weight of the body layer) */
  to: FighterId;
  damage: number;
  kb: number;
  pan: number;
  combo: number;
  /** the move that landed (a claw or a bite adds its own layer) */
  move?: string;
}

/** each class's level (dB) before its layers */
const HIT_DB: Record<HitStrength, number> = { light: -17, medium: -13.5, heavy: -11.5, lethal: -10.5 };
/** each class's own compressor [threshold dB, makeup back out dB, ratio]: holds loud picks to the rung */
const SQUEEZE_DB: Record<HitStrength, [number, number, number]> = { light: [-26, 0, 3], medium: [-20, 0, 3], heavy: [-16, 0, 4], lethal: [-12, 0, 4] };

/**
 * The contact sound. Lands on the frame of contact; the launch is a separate sound.
 *   light   a short dull smack, and the claw or the bite if the move has one
 *   medium  a body punch, the claw or bite on top
 *   heavy   a body thud over a low impact with a short tail, the claw or bite
 *   lethal  a dry tick on contact, about 110 ms of near silence (the director pulls the music
 *           down), then the big one: a low impact with a tail, the body, and one bone crack
 */
export function hit(e: Engine, t: number, a: HitArgs): number {
  const prev = e.level;
  const prevInto = e.into;
  e.level = prev * Math.pow(10, HIT_DB[a.strength] / 20);
  // a replay (quieter) bypasses the squeeze: its level is already set by the director
  const sq = SQUEEZE_DB[a.strength];
  if (prev >= 0.99) e.into = e.squeezer(`hit-${a.strength}`, sq[0], sq[1], sq[2]);
  try {
    return hitLayers(e, t, a);
  } finally {
    e.level = prev;
    e.into = prevInto;
  }
}

function hitLayers(e: Engine, t: number, a: HitArgs): number {
  const fam = FAMS[a.by];
  const vic = FAMS[a.to];
  const pp = Math.pow(fam.pitch, 0.35);
  const pan = a.pan;
  // light hits climb a little in pitch through a combo so strings read as strings
  const comboUp = 1 + Math.min(0.1, a.combo * 0.02);
  switch (a.strength) {
    case 'light': {
      if (!e.voice(t, 0.4, 1)) return 0;
      const lt = e.rr('light', LIGHTS);
      e.smp(lt, t, { gain: trim(lt) * vg(e), rate: pp * comboUp * vr(e), pan, hp: 120, lp: 5000, verb: 0.05 });
      edge(e, t, a.by, a.move, 0.55, pan);
      struck(e, t, a.to, 0.5, pan);
      return 0.4;
    }
    case 'medium': {
      if (!e.voice(t, 0.8, 2)) return 0;
      const md = e.rr('medium', MEDIUMS);
      e.smp(md, t, { gain: trim(md) * vg(e), rate: pp * vr(e), pan, hp: 70, lp: 4500, verb: 0.1 });
      edge(e, t, a.by, a.move, 0.7, pan);
      struck(e, t, a.to, 0.7, pan);
      return 0.8;
    }
    case 'heavy': {
      if (!e.voice(t, 1.2, 3)) return 0;
      const hv = e.rr('heavy', HEAVIES);
      e.smp(hv, t, { gain: trim(hv) * vg(e), rate: pp * vr(e), pan, hp: 40, lp: 4500, verb: 0.15 });
      // the low impact with a short tail; a lighter victim rings a little higher
      e.smp('impact-low', t, { gain: 0.6 * vg(e), rate: (1.05 + 0.12 * (1 - vic.weight)) * vr(e, 0.03), pan: pan * 0.5, hold: 0.06, tc: 0.13, lp: 2500 });
      edge(e, t, a.by, a.move, 0.85, pan);
      struck(e, t, a.to, 0.85, pan);
      return 1.2;
    }
    case 'lethal': {
      e.voice(t, 2.4, 5);
      // contact: one dry tick on the frame...
      e.smp('p-light-1', t, { gain: 0.45, rate: 1.2, pan, hp: 800, lp: 5000 });
      // ...a held breath...
      const h = t + 0.11;
      // ...then the big one: a low impact with a tail, the body, one crack of bone
      e.smp('impact-big', h, { gain: 0.95 * vg(e), rate: 0.95 * vr(e, 0.02), pan: pan * 0.4, hold: 0.3, tc: 0.45, verb: 0.12, lp: 3000 });
      const hv = e.rr('heavy', HEAVIES);
      e.smp(hv, h, { gain: 0.85 * trim(hv), rate: 0.85 * pp, pan, hp: 40, lp: 3500 });
      e.smp('crack-lethal', h, { gain: 0.7, rate: 0.9 * vr(e, 0.03), pan, hp: 150, lp: 5500, verb: 0.15 });
      edge(e, h, a.by, a.move, 0.6, pan);
      struck(e, h, a.to, 0.9, pan);
      return 2.4;
    }
  }
}

/** The launch: the air after the hit pause, longer and lower with more knockback. */
function launch_(e: Engine, t: number, kb: number, lethal: boolean, pan: number): void {
  const k = Math.min(1, kb / 140);
  if (!e.voice(t, 0.4 + k, lethal ? 4 : 2)) return;
  if (k > 0.55 || lethal) e.smp('swoosh-long', t, { gain: 0.45 + 0.4 * k, rate: (1.2 - 0.3 * k) * vr(e), pan, hp: 150, lp: 5000, dur: 0.35 + 0.5 * k });
  else e.smp(e.rr('launch', CLOAKS), t, { gain: 0.45 + 0.5 * k, rate: (1.05 - 0.2 * k) * vr(e), pan, hp: 150, lp: 6000 });
}

/** the guard takes it: a cloth and leather thump, no metal */
function shieldHit_(e: Engine, t: number, perfect: boolean, strong: number, pan: number): void {
  if (!e.voice(t, 0.5, 2)) return;
  e.smp('grab-1', t, { gain: (0.6 + 0.3 * strong) * vg(e), rate: (perfect ? 1.2 : 0.95) * vr(e), pan, hp: 120, lp: 4000 });
  e.smp('p-heavy-4', t, { gain: 0.4 + 0.25 * strong, rate: (perfect ? 1.25 : 1.1) * vr(e), pan, lp: 900 });
}

function shieldBreak_(e: Engine, t: number, pan: number): void {
  e.voice(t, 1.5, 4);
  e.smp(e.rr('cloak-big', CLOAKS_BIG), t, { gain: 0.9, rate: 0.8, pan, hp: 100, lp: 4000 });
  e.smp('impact-low', t, { gain: 0.6, rate: 1.1, pan, hold: 0.06, tc: 0.25, lp: 2000 });
  e.smp('p-heavy-4', t, { gain: 0.7, rate: 0.9, pan, lp: 1200 });
}

/** two attacks cancel: claws glance off each other */
function clank_(e: Engine, t: number, pan: number): void {
  if (!e.voice(t, 0.5, 2)) return;
  e.smp('claw-2', t, { gain: 0.5, rate: 1.1 * vr(e), pan, hp: 400, lp: 5000 });
  e.smp('p-light-2', t, { gain: 0.4, rate: 1.0 * vr(e), pan, hp: 120, lp: 2500 });
}

// ------------------------------------------------------------------------------------------------
// moves
// ------------------------------------------------------------------------------------------------

const MOVE_SIZE: Partial<Record<MoveId, number>> = {
  jab: 0.35, tilt: 0.55, uptilt: 0.55, dash: 0.6, smash: 1, upsmash: 0.95,
  nair: 0.5, fair: 0.65, bair: 0.7, uair: 0.55, dair: 0.75,
  grab: 0.4, throwf: 0.7, throwb: 0.75, throwu: 0.7,
  special: 0.85, special2: 0.75, recover: 0.8,
};

/**
 * A swing: a cloth or cloak whoosh whose crest lands on the first active frame (`activeIn` s from
 * now), so it is heard before the blow; big moves use the heavier cloak instead.
 */
function swing_(e: Engine, t: number, f: FighterId, move: MoveId, activeIn: number, pan: number): void {
  const fam = FAMS[f];
  const size = MOVE_SIZE[move] ?? 0.5;
  if (!e.voice(t, activeIn + 0.4, 1)) return;
  const pp = Math.pow(fam.pitch, 0.3);
  // the Armour's greatsword: a heavy blade through the air, cresting about 120 ms in
  if (f === 'kiln') {
    e.smp(e.rr('blade', BLADES), t + Math.max(0, activeIn - 0.12), { gain: (0.25 + 0.22 * size) * vg(e), rate: (1.1 - 0.2 * size) * vr(e), pan, hp: 80, lp: 5000 });
    return;
  }
  // the Magpie's knives: short thin whooshes
  if (f === 'tick') {
    e.smp(e.rr('knife', KNIVES), t + Math.max(0, activeIn - 0.06), { gain: (0.4 + 0.4 * size) * vg(e), rate: (1.15 - 0.15 * size) * vr(e), pan, hp: 400, lp: 7500 });
    return;
  }
  // the Hexer's staff: a wooden swish
  if (f === 'hexer') {
    e.smp(e.rr('staff', STAVES), t + Math.max(0, activeIn - 0.08), { gain: (0.28 + 0.25 * size) * vg(e), rate: (1.05 - 0.2 * size) * vr(e), pan, hp: 150, lp: 5000 });
    return;
  }
  if (size >= 0.8) {
    // the heavy cloak crests about 120 ms in
    e.smp(e.rr('cloak-big', CLOAKS_BIG), t + Math.max(0, activeIn - 0.12), { gain: (0.55 + 0.35 * size) * vg(e), rate: (1.05 - 0.15 * size) * pp * vr(e), pan, hp: 90, lp: 6000 });
  } else {
    // the light cloth whooshes crest about 100 ms in
    e.smp(e.rr('swing', CLOAKS), t + Math.max(0, activeIn - 0.1), { gain: (0.45 + 0.5 * size) * vg(e), rate: (1.2 - 0.3 * size) * pp * vr(e), pan, hp: 150, lp: 7000 });
  }
}

/** a shot leaves: for the Count's bats a flutter with one small squeak, otherwise a small whoosh */
function projectile_(e: Engine, t: number, f: FighterId, kind: string, pan: number): void {
  if (kind === 'bat') {
    if (!e.voice(t, 1.4, 2)) return;
    e.smp(e.rr('bats', BATS), t, { gain: 0.85 * vg(e), rate: 1.0 * vr(e, 0.05), pan, hp: 350, lp: 5500, dur: 1.2 });
    // the squeak: low, short and quiet, never shrill
    if (e.rng.next() < 0.7) e.smp('bat-squeak', t + e.rng.range(0.12, 0.3), { gain: 0.3, rate: 0.72 * vr(e, 0.06), pan: pan + e.rng.range(-0.15, 0.15), hp: 500, lp: 3800 });
    return;
  }
  if (kind === 'flame') {
    // the Armour's Grave Cleave: a wall of fire leaves along the floor
    if (!e.voice(t, 1.2, 2)) return;
    e.smp('flame', t, { gain: 0.55 * vg(e), rate: 0.95 * vr(e, 0.04), pan, hp: 60, lp: 5000 });
    return;
  }
  if (kind === 'hex') {
    // the Hexer's bolt: a lighter, crackling fire
    if (!e.voice(t, 1.0, 2)) return;
    e.smp('flame', t, { gain: 0.6 * vg(e), rate: 1.35 * vr(e, 0.04), pan, hp: 250, lp: 6000, dur: 0.8 });
    e.smp('hex-crackle', t + 0.02, { gain: 0.55, rate: 1.0 * vr(e, 0.05), pan, hp: 400, lp: 6500, dur: 0.6 });
    return;
  }
  if (kind === 'knife') {
    // the Magpie's Feather Knives: three quick throws
    if (!e.voice(t, 0.5, 2)) return;
    for (let i = 0; i < 3; i++) e.smp(e.rr('knife', KNIVES), t + i * 0.055, { gain: (0.5 - 0.07 * i) * vg(e), rate: (1.25 + 0.06 * i) * vr(e), pan, hp: 500, lp: 7500 });
    return;
  }
  if (kind === 'tongue') {
    // the Mimic's Tongue Lash: a wet whip out
    if (!e.voice(t, 0.6, 2)) return;
    e.smp('tongue-whip', t, { gain: 0.6 * vg(e), rate: 0.85 * vr(e, 0.04), pan, hp: 200, lp: 4500 });
    e.smp('slurp', t + 0.03, { gain: 0.3, rate: 0.8 * vr(e, 0.04), pan, hp: 200, lp: 4500 });
    return;
  }
  if (!e.voice(t, 0.4, 2)) return;
  // anything else thrown (the Hexer's ward is lobbed): a small whoosh
  e.smp(e.rr('swing', CLOAKS), t, { gain: 0.5, rate: 1.35 * vr(e) * Math.pow(FAMS[f].pitch, 0.3), pan, hp: 300, lp: 6000 });
}

/** the Hexer's ward lies down on the floor: a soft scratch */
function wardPlaced_(e: Engine, t: number, pan: number): void {
  if (!e.voice(t, 0.5, 1)) return;
  e.smp(e.rr('quill', QUILLS), t, { gain: 0.55, rate: 0.85 * vr(e, 0.05), pan, hp: 400, lp: 6000, dur: 0.35 });
}

/** the ward catches someone: one sharp snap of a twig */
function wardSnap_(e: Engine, t: number, pan: number): void {
  if (!e.voice(t, 0.6, 2)) return;
  e.smp('ward-snap', t, { gain: 0.8, rate: 1.0 * vr(e, 0.05), pan, hp: 200, lp: 6500 });
}

/** the Armour's Collar Fire: a breath of fire, a low roar for about half a second */
function fireBreath_(e: Engine, t: number, pan: number): void {
  if (!e.voice(t, 1.0, 2)) return;
  e.smp('fire-breath', t, { gain: 0.8 * vg(e), rate: 0.85 * vr(e, 0.03), pan, hp: 60, lp: 3500, dur: 0.6 });
}

/** the Armour's Fall Apart: plates drop in a heap, then snap back together */
function fallApart_(e: Engine, t: number, pan: number): void {
  if (!e.voice(t, 1.2, 2)) return;
  e.smp('plates-fall', t, { gain: 0.6, rate: 1.0 * vr(e, 0.04), pan, hp: 100, lp: 3500, dur: 0.55 });
  const b = sample('plates-fall');
  if (b) e.smp('plates-fall', t + 0.45, { gain: 0.45, rate: 1.1, pan, hp: 150, lp: 4000, reverse: true, offset: Math.max(0, b.duration - 0.35), fadeIn: 0.1 });
}

/** the Magpie's Snatch: a flutter of feathers out (or back in when `back`) */
function feathers_(e: Engine, t: number, back: boolean, pan: number): void {
  if (!e.voice(t, 0.6, 1)) return;
  e.smp(e.rr('feathers', FEATHERS), t, { gain: (back ? 0.55 : 0.7) * vg(e), rate: (back ? 1.15 : 1.0) * vr(e, 0.05), pan, hp: 250, lp: 7000, dur: 0.5 });
}

/** a recovery: the Magpie's cloak flap, the Hexer's crows, the Mimic's coins, the Armour falling apart */
function recover_(e: Engine, t: number, f: FighterId, pan: number): void {
  if (f === 'kiln') return fallApart_(e, t, pan);
  if (!e.voice(t, 0.9, 1)) return;
  if (f === 'tick') {
    e.smp('cloak-big-2', t, { gain: 0.6, rate: 1.2 * vr(e), pan, hp: 150, lp: 6000 });
    e.smp(e.rr('feathers', FEATHERS), t + 0.05, { gain: 0.35, rate: 0.9 * vr(e), pan, hp: 300, lp: 6000, dur: 0.4 });
  } else if (f === 'hexer') {
    e.smp('crow', t, { gain: 0.5, rate: 1.0 * vr(e, 0.05), pan: pan - 0.2, hp: 300, lp: 6000 });
    e.smp('crow', t + 0.28, { gain: 0.35, rate: 1.08 * vr(e, 0.05), pan: pan + 0.2, hp: 300, lp: 6000 });
    e.smp('feathers-1', t + 0.05, { gain: 0.5, rate: 0.85, pan, hp: 200, lp: 6000, dur: 0.6 });
  } else if (f === 'mimic') {
    e.smp('coins-spill', t, { gain: 0.6, rate: 1.0 * vr(e, 0.04), pan, hp: 400, lp: 7000, dur: 1.0 });
  }
}

/** the Mimic's Swallow: the lid slams on the opponent and a muffled thump inside */
function swallow_(e: Engine, t: number, pan: number): void {
  if (!e.voice(t, 0.8, 2)) return;
  e.smp('lid-slam', t, { gain: 0.6, rate: 1.0 * vr(e, 0.04), pan, hp: 50, lp: 3500 });
  e.smp('p-heavy-4', t + 0.18, { gain: 0.6, rate: 0.85, pan, lp: 400 });
}

/** ...and the Spit: wet, with a few coins */
function spit_(e: Engine, t: number, pan: number): void {
  if (!e.voice(t, 0.8, 2)) return;
  e.smp('spit', t, { gain: 0.65, rate: 0.9 * vr(e, 0.05), pan, hp: 150, lp: 5000 });
  e.smp('coin-bag', t + 0.08, { gain: 0.4, rate: 1.0 * vr(e, 0.05), pan, hp: 400, lp: 7000 });
}

/** the tongue catches and drags the opponent in */
function tongueDrag_(e: Engine, t: number, pan: number): void {
  if (!e.voice(t, 0.6, 2)) return;
  e.smp('slurp', t, { gain: 0.55, rate: 0.75 * vr(e, 0.04), pan, hp: 150, lp: 4500 });
}

/** the Count's Mist Step: a breath that swells to where he re-forms (`reformIn` s from now) */
function mist_(e: Engine, t: number, reformIn: number, pan: number): void {
  if (!e.voice(t, 1.2, 2)) return;
  // the breath swells to its crest about 0.35 s in: started so it crests on the swipe on arrival
  const at = t + Math.max(0, reformIn + 0.05 - 0.35);
  e.smp('mist', at, { gain: 0.8 * vg(e), rate: 1.0 * vr(e, 0.03), pan, fadeIn: 0.05, hp: 150, lp: 5000, verb: 0.15 });
}

/** the Wolf's Pounce: a snarl and the leap (`big` false: the short leap only, the voice is resting) */
function pounce_(e: Engine, t: number, f: FighterId, voice: boolean, pan: number): void {
  if (!e.voice(t, 1.2, 2)) return;
  if (voice) e.smp(e.rr('snarl', SNARLS), t, { gain: 0.75 * vg(e), rate: 0.97 * vr(e, 0.04), pan, hp: 90, lp: 6000, dur: 1.0 });
  e.smp(e.rr('cloak-big', CLOAKS_BIG), t + 0.06, { gain: 0.7, rate: 0.92 * Math.pow(FAMS[f].pitch, 0.3) * vr(e), pan, hp: 90, lp: 5500 });
}

/**
 * The Wolf's Howl. The one recording; the first in a while plays long (about 2.4 s, faded), a
 * second soon after is short and further back so the voice stays special.
 */
function howl_(e: Engine, t: number, full: boolean, pan: number): void {
  e.voice(t, full ? 2.6 : 1.2, 3);
  e.smp('howl', t, { gain: full ? 0.8 : 0.45, rate: full ? 1.0 : 1.03, pan: pan * 0.5, hp: 180, lp: 6500, dur: full ? 2.4 : 1.0, fadeIn: 0.05, verb: full ? 0.25 : 0.15 });
}

function grab_(e: Engine, t: number, f: FighterId, pan: number): void {
  if (!e.voice(t, 0.6, 2)) return;
  const fam = FAMS[f];
  // a hand (or jaws) closing on a body: the cloth grab and a short dull knock
  if (f === 'mimic') {
    // the lid closes on a body
    e.smp(e.rr('lid', LIDS), t, { gain: 0.7, rate: 0.95 * vr(e), pan, hp: 100, lp: 6000 });
    return;
  }
  e.smp('grab-1', t, { gain: 0.8 * vg(e), rate: Math.pow(fam.pitch, 0.3) * vr(e), pan, hp: 60, lp: 5000 });
  if (f === 'kiln') e.smp(e.rr('plate', PLATES), t, { gain: 0.3, rate: 1.0 * vr(e), pan, hp: 200, lp: 5000 });
  if (f === 'vise') e.smp(e.rr('bite', BITES), t, { gain: 0.35, rate: 1.0 * vr(e), pan, hp: 150, lp: 6000 });
  else e.smp('p-light-4', t, { gain: 0.3, rate: 1.1 * vr(e), pan, hp: 120, lp: 2500 });
}

function throwSound_(e: Engine, t: number, f: FighterId, pan: number): void {
  if (!e.voice(t, 0.6, 2)) return;
  e.smp(e.rr('cloak-big', CLOAKS_BIG), t, { gain: 0.65, rate: 1.0 * Math.pow(FAMS[f].pitch, 0.3) * vr(e), pan, hp: 100, lp: 6000 });
}

// ------------------------------------------------------------------------------------------------
// movement
// ------------------------------------------------------------------------------------------------

function step_(e: Engine, t: number, f: FighterId, pan: number, loud = 1): void {
  if (!e.voice(t, 0.2, 0)) return;
  const w = FAMS[f].weight;
  // a soft footfall on stone or boards, heavier and lower with weight
  e.smp(e.rr('step', STEPS), t, { gain: (0.35 + 0.45 * w) * loud * (f === 'tick' ? 0.7 : 1) * vg(e), rate: (1.15 - 0.3 * w) * (f === 'tick' ? 1.2 : 1) * vr(e), pan, hp: 60, lp: 3000 });
  // the Armour's plates shift with each step; the Mimic's boards creak on some steps
  if (f === 'kiln') e.smp(e.rr('plate', PLATES), t, { gain: 0.22 * loud * vg(e), rate: 1.0 * vr(e, 0.06), pan, hp: 250, lp: 5000 });
  else if (f === 'mimic' && e.rng.next() < 0.4) e.smp(e.rr('creak', CREAKS), t, { gain: 0.35 * loud * vg(e), rate: 1.0 * vr(e, 0.06), pan, hp: 150, lp: 4500, dur: 0.35 });
}

function jump_(e: Engine, t: number, f: FighterId, air: boolean, pan: number): void {
  if (!e.voice(t, 0.5, 1)) return;
  const fam = FAMS[f];
  const pp = Math.pow(fam.pitch, 0.3);
  // the body leaves the floor: a short cloth whoosh upward, a push-off scuff
  e.smp(e.rr('jump', CLOAKS), t + 0.02, { gain: air ? 0.5 : 0.45, rate: (air ? 1.3 : 1.15) * pp * vr(e), pan, hp: 200, lp: 6500 });
  if (!air) e.smp(e.rr('step', STEPS), t, { gain: 0.25 + 0.3 * fam.weight, rate: 1.2 * vr(e), pan, hp: 120, lp: 3000 });
}

function land_(e: Engine, t: number, f: FighterId, hard: boolean, pan: number): void {
  if (!e.voice(t, 0.4, 1)) return;
  const w = FAMS[f].weight;
  const k = hard ? 1.3 : 1;
  // the weight comes down: a soft thump and a footfall
  e.smp('land-1', t, { gain: (0.35 + 0.45 * w) * k * vg(e), rate: (1.25 - 0.35 * w) * vr(e), pan, hp: 50, lp: 2500 });
  e.smp(e.rr('step', STEPS), t, { gain: 0.25 * k, rate: 1.05 * vr(e), pan, hp: 150, lp: 3000 });
  if (f === 'kiln') e.smp(e.rr('plate', PLATES), t, { gain: 0.45 * k * vg(e), rate: 0.95 * vr(e), pan, hp: 200, lp: 5000 });
  else if (f === 'mimic') e.smp('lid-slam', t, { gain: 0.3 * k, rate: 1.1 * vr(e), pan, hp: 80, lp: 2000 });
}

function dash_(e: Engine, t: number, f: FighterId, pan: number): void {
  if (!e.voice(t, 0.5, 1)) return;
  const fam = FAMS[f];
  e.smp('swoosh-long', t, { gain: 0.4, rate: 1.35 * Math.pow(fam.pitch, 0.3) * vr(e), pan, hp: 200, lp: 5000, dur: 0.32 });
  step(e, t, f, pan, 0.9);
}

function dodge_(e: Engine, t: number, f: FighterId, kind: 'roll' | 'spot' | 'air', pan: number): void {
  if (!e.voice(t, 0.3, 1)) return;
  e.smp(e.rr('dodge', CLOAKS), t, { gain: 0.4, rate: (kind === 'roll' ? 0.95 : 1.25) * Math.pow(FAMS[f].pitch, 0.3) * vr(e), pan, hp: 200, lp: 6000 });
}

function ledge_(e: Engine, t: number, f: FighterId, pan: number): void {
  if (!e.voice(t, 0.4, 1)) return;
  e.smp('grab-1', t, { gain: 0.55, rate: 1.1 * vr(e), pan, hp: 80, lp: 5000 });
  e.smp(e.rr('step', STEPS), t, { gain: 0.25, rate: 1.25, pan, hp: 150, lp: 3000 });
}

function tech_(e: Engine, t: number, f: FighterId, pan: number): void {
  if (!e.voice(t, 0.3, 1)) return;
  e.smp(e.rr('step', STEPS), t, { gain: 0.45, rate: 1.1 * vr(e), pan, hp: 80, lp: 3000 });
  e.smp(e.rr('dodge', CLOAKS), t, { gain: 0.3, rate: 1.35 * Math.pow(FAMS[f].pitch, 0.3), pan, hp: 300, lp: 6000 });
}

function bounce_(e: Engine, t: number, f: FighterId, pan: number): void {
  if (!e.voice(t, 0.6, 2)) return;
  const w = FAMS[f].weight;
  e.smp('land-1', t, { gain: 0.75, rate: 1.05 - 0.2 * w, pan, lp: 2500 });
  e.smp('p-heavy-4', t, { gain: 0.5, rate: 1.0, pan, lp: 1500 });
  e.smp('impact-low', t, { gain: 0.3, rate: 1.3, pan, hold: 0.03, tc: 0.1, lp: 2000 });
}

// ------------------------------------------------------------------------------------------------
// the knockout
// ------------------------------------------------------------------------------------------------

/**
 * A life is lost: one deep bell toll and a candle snuffed. The bell is the loudest thing in the
 * fight but rounded (low-passed, no transient on top); the candle comes in on its tail.
 */
function koBlast_(e: Engine, t: number, pan: number): void {
  e.voice(t, 3.5, 6);
  const p = pan * 0.4;
  e.smp('bell-toll', t, { gain: 1.0, rate: 1.0, pan: p, lp: 3500, hold: 1.2, tc: 1.6, verb: 0.12 });
  e.smp('candle-snuff', t + 0.45, { gain: 0.55, rate: 0.95 * vr(e, 0.03), pan: p, hp: 150, lp: 6000 });
}

function respawn_(e: Engine, t: number, pan: number): void {
  if (!e.voice(t, 1.2, 1)) return;
  // the figure gathers back: a soft breath swelling in
  e.smp('mist', t, { gain: 0.35, rate: 1.1, pan, hp: 200, lp: 4500, fadeIn: 0.1 });
}

// ------------------------------------------------------------------------------------------------
// show sounds (bus 'ui')
// ------------------------------------------------------------------------------------------------

/** a title draws in: a quill on paper, quiet (`len` s at most) */
function quill(e: Engine, t: number, size: number, pan = 0, len = 0.9): void {
  e.smp(e.rr('quill', QUILLS), t, { gain: 0.7 * size, rate: e.rng.range(0.94, 1.06), bus: 'ui', pan, hp: 500, lp: 7000, dur: len });
}

/** a soft low thump under a big title (no crack, no drum) */
function thump(e: Engine, t: number, size: number, pan = 0): void {
  e.smp('impact-low', t, { gain: 0.55 * size, rate: 1.0, bus: 'ui', pan, hold: 0.05, tc: 0.25, lp: 900 });
}

export function uiTick(e: Engine, t: number, pan: number, hi = 1): void {
  e.smp('clock-tick', t, { gain: 0.6, rate: hi, bus: 'ui', pan, hp: 500, lp: 6000 });
}

/** A plan changed: a tick from that corner; the red corner a tone under the blue. Two for an order. */
function planTick_(e: Engine, t: number, side: 0 | 1, order: boolean): void {
  const pan = side === 0 ? -0.55 : 0.55;
  const k = side === 0 ? 0.92 : 1.06;
  e.smp('clock-tick', t, { gain: 0.7, rate: 1.1 * k, bus: 'ui', pan, hp: 500, lp: 6000 });
  if (order) e.smp('clock-tick', t + 0.12, { gain: 0.7, rate: 1.3 * k, bus: 'ui', pan, hp: 500, lp: 6000 });
}

function clockTick_(e: Engine, t: number, last: boolean): void {
  // the last five seconds of a window: a clock, the last second a little lower and heavier
  e.smp('clock-tick', t, { gain: last ? 0.95 : 0.7, rate: last ? 0.85 : 1.0, bus: 'ui', hp: 400, lp: 6000 });
  if (last) thump(e, t, 0.5);
}

/** bets lock: a heavy door lock */
function lock_(e: Engine, t: number): void {
  e.smp('lock-1', t, { gain: 0.85, rate: 0.95, bus: 'ui', hp: 150, lp: 6000 });
  e.smp('p-heavy-4', t, { gain: 0.4, rate: 1.1, bus: 'ui', lp: 1200 });
}

/** LOCKED draws in before the countdown: the quill and the lock */
function lockSlam_(e: Engine, t: number): void {
  e.voice(t, 1, 4);
  quill(e, t, 0.8, 0, 0.6);
  lock_(e, t);
}

/** a window opens: the clock starts */
function windowOpen_(e: Engine, t: number): void {
  e.smp('clock-tick', t, { gain: 0.6, rate: 1.05, bus: 'ui', hp: 500, lp: 6000 });
  e.smp('clock-tick', t + 0.1, { gain: 0.65, rate: 1.2, bus: 'ui', hp: 500, lp: 6000 });
}

/** a big word draws onto the screen (phase titles, sudden death) */
function wordSlam_(e: Engine, t: number, size: number, pan = 0): void {
  e.voice(t, 1, 4);
  quill(e, t, size, pan, 1.0);
  thump(e, t, 0.6 * size, pan);
}

/** a stage is struck out: one quill stroke from that corner */
function strike_(e: Engine, t: number, side: 0 | 1): void {
  quill(e, t, 0.9, side === 0 ? -0.4 : 0.4, 0.7);
}

/** a smaller beat: a band or a number draws in */
function cardHit_(e: Engine, t: number, size: number, pan = 0): void {
  quill(e, t, 0.7 * size, pan, 0.5);
}

/** a fighter lands on the roster line: a soft footfall */
function rosterLand_(e: Engine, t: number, i: number): void {
  const pan = [-0.6, -0.2, 0.2, 0.6][i] ?? 0;
  e.smp('land-1', t, { gain: 0.6, rate: 0.95 + 0.08 * i, bus: 'ui', pan, lp: 2500 });
}

/** a wipe crosses the screen: a cloak passes */
function sting_(e: Engine, t: number): void {
  e.smp(e.rr('cloak-big', CLOAKS_BIG), t, { gain: 0.6, rate: 0.95, bus: 'ui', pan: -0.3, hp: 120, lp: 6000 });
}

function countBeep_(e: Engine, t: number, n: number): void {
  // 3, 2, 1: the clock, a step higher each time, over a soft low thump
  const r = [1, 1, 1.06, 1.12][n] ?? 1;
  e.voice(t, 0.8, 4);
  e.smp('clock-tick', t, { gain: 0.8, rate: 0.85 * r, bus: 'ui', hp: 400, lp: 6000 });
  thump(e, t, 0.6);
}

/** the start: a low thump and a cloak thrown open */
function startCall_(e: Engine, t: number): void {
  e.voice(t, 1.6, 5);
  thump(e, t, 1.0);
  e.smp(e.rr('cloak-big', CLOAKS_BIG), t, { gain: 0.6, rate: 0.85, bus: 'ui', hp: 90, lp: 6000 });
}

/** the knockout call is written in silence: the bell has said it */
function koCall_(_e: Engine, _t: number, _final: boolean): void {
  /* intentionally silent: the bell and the candle carry the knockout */
}

/** the call opens the show: the title is written over a soft low thump */
function callOpen_(e: Engine, t: number, lead: number): void {
  quill(e, t, 0.9, 0, 1.2);
  thump(e, t + lead, 0.8);
}

/** the build into the pick reveal: a cloak drawn back */
function riser_(e: Engine, t: number, dur: number): void {
  const b = sample('cloak-big-1');
  if (!b) return;
  const d = Math.max(0.15, Math.min(dur, b.duration - 0.05));
  e.smp('cloak-big-1', t, { gain: 0.5, rate: 1, bus: 'ui', reverse: true, offset: b.duration - d, fadeIn: Math.min(0.08, d * 0.4), lp: 5000 });
}

/** both picks flip together: two quick strokes */
function pickReveal_(e: Engine, t: number): void {
  e.voice(t, 1.2, 4);
  quill(e, t, 0.6, -0.3, 0.35);
  quill(e, t + 0.14, 0.8, 0.3, 0.5);
}

/** the versus card: halves sweep in from both sides like cloaks, then the title (lands `lead` s after t) */
function versusSlam_(e: Engine, t: number, lead = 0.15): void {
  e.voice(t, 2, 5);
  e.smp('cloak-big-1', t + Math.max(0, lead - 0.12), { gain: 0.55, rate: 0.95, bus: 'ui', pan: -0.6, hp: 100, lp: 6000 });
  e.smp('cloak-big-2', t + Math.max(0, lead - 0.1), { gain: 0.55, rate: 1.0, bus: 'ui', pan: 0.6, hp: 100, lp: 6000 });
  thump(e, t + lead, 0.9);
  quill(e, t + lead + 0.05, 0.7, 0, 0.8);
}

/** taunt lines are no longer drawn: nothing to hear */
function taunt_(_e: Engine, _t: number, _side: 0 | 1): void {
  /* intentionally silent */
}

/** corner talk is no longer drawn: a soft tick from that corner only */
function cornerTalk_(e: Engine, t: number, side: 0 | 1): void {
  e.smp('clock-tick', t, { gain: 0.3, rate: 1.4, bus: 'ui', pan: side === 0 ? -0.6 : 0.6, hp: 800, lp: 6000 });
}

/** overdrive: the word is written (80 ms after the event), then three clock ticks climbing */
function suddenDeath_(e: Engine, t: number): void {
  wordSlam_(e, t + 0.08, 1.0);
  for (let i = 0; i < 3; i++) e.smp('clock-tick', t + 0.4 + i * 0.25, { gain: 0.7, rate: 1 + 0.08 * i, bus: 'ui', hp: 400, lp: 6000 });
}

/** the verdict: WINS is written (the strings and, for the Wolf, the howl are the director's) */
function winner_(e: Engine, t: number, side: 0 | 1): void {
  e.voice(t, 3, 5);
  quill(e, t + 0.2, 0.8, side === 0 ? -0.25 : 0.25, 1.0);
}

/** The payout beat: a breath held for `dur` s */
function payoutHold_(e: Engine, t: number, dur: number): void {
  const b = sample('mist');
  if (!b) return;
  // the breath swells to its crest (0.35 s in) just as the payout lands
  e.smp('mist', t + Math.max(0, dur - 0.35), { gain: 0.35, rate: 1, bus: 'ui', fadeIn: 0.06, lp: 4000, hp: 200 });
}

function payoutHit_(e: Engine, t: number): void {
  e.voice(t, 1.5, 5);
  quill(e, t, 0.8, 0, 0.6);
}

// ---- levels (dB) per recipe, set from measurement (tools/audio.mjs) ----

function leveled<A extends unknown[]>(db: number, fn: (e: Engine, ...a: A) => void): (e: Engine, ...a: A) => void {
  const g = Math.pow(10, db / 20);
  return (e: Engine, ...a: A) => {
    const prev = e.level;
    e.level = prev * g;
    try {
      fn(e, ...a);
    } finally {
      e.level = prev;
    }
  };
}

export const launch = leveled(-16, launch_);
export const shieldHit = leveled(-11, shieldHit_);
export const shieldBreak = leveled(-10, shieldBreak_);
export const clank = leveled(-10, clank_);
export const swing = leveled(-16, swing_);
export const projectile = leveled(-12, projectile_);
export const wardPlaced = leveled(-14, wardPlaced_);
export const wardSnap = leveled(-12, wardSnap_);
export const fireBreath = leveled(-11, fireBreath_);
export const feathers = leveled(-14, feathers_);
export const recover = leveled(-13, recover_);
export const swallow = leveled(-10, swallow_);
export const spit = leveled(-11, spit_);
export const tongueDrag = leveled(-12, tongueDrag_);
export const mist = leveled(-12, mist_);
export const pounce = leveled(-9, pounce_);
export const howl = leveled(-12, howl_);
export const grab = leveled(-8, grab_);
export const throwSound = leveled(-10, throwSound_);
export const step = leveled(-20, step_);
export const jump = leveled(-15, jump_);
export const land = leveled(-14, land_);
export const dash = leveled(-10, dash_);
export const dodge = leveled(-16, dodge_);
export const ledge = leveled(-12, ledge_);
export const tech = leveled(-12, tech_);
export const bounce = leveled(-12, bounce_);
export const koBlast = leveled(-6, koBlast_);
export const respawn = leveled(-10, respawn_);
export const clockTick = leveled(-12, clockTick_);
export const lock = leveled(-8, lock_);
export const lockSlam = leveled(-12, lockSlam_);
export const windowOpen = leveled(-12, windowOpen_);
export const wordSlam = leveled(-12, wordSlam_);
export const cardHit = leveled(-14, cardHit_);
export const strike = leveled(-12, strike_);
export const rosterLand = leveled(-16, rosterLand_);
export const sting = leveled(-16, sting_);
export const countBeep = leveled(-12, countBeep_);
export const startCall = leveled(-10, startCall_);
export const koCall = leveled(0, koCall_);
export const callOpen = leveled(-12, callOpen_);
export const pickReveal = leveled(-13, pickReveal_);
export const riser = leveled(-16, riser_);
export const versusSlam = leveled(-11, versusSlam_);
export const taunt = leveled(0, taunt_);
export const cornerTalk = leveled(-10, cornerTalk_);
export const suddenDeath = leveled(-12, suddenDeath_);
export const winner = leveled(-12, winner_);
export const payoutHold = leveled(-14, payoutHold_);
export const payoutHit = leveled(-13, payoutHit_);
export const planTick = leveled(-12, planTick_);

/** the bell heard again in a replay: far off and dark, never at full level */
export function koEcho(e: Engine, t: number, pan: number): void {
  e.smp('bell-toll', t, { gain: 0.08, rate: 0.98, pan: pan * 0.6, lp: 1500, verb: 0.4, hold: 0.4, tc: 0.8 });
}

/** The music stings, played on the ui bus so the music bus's ducks never touch them. */
export function stingFinale(e: Engine, t: number): number {
  return e.smp('sting-danse-finale', t, { gain: 1.1, bus: 'ui' });
}
/** a winner's own voice over the strings: the Magpie's chatter, the Hexer's cackle, the Mimic's coins (the Wolf's howl is separate) */
export function winVoice(e: Engine, t: number, f: FighterId, pan: number): void {
  const lvl = Math.pow(10, -14 / 20);
  if (f === 'tick') e.smp('magpie', t, { gain: 0.6 * lvl, bus: 'ui', pan, hp: 700, lp: 6000 });
  else if (f === 'hexer') e.smp('cackle', t, { gain: 0.5 * lvl, bus: 'ui', pan, hp: 250, lp: 6000 });
  else if (f === 'mimic') e.smp('coins-jingle', t, { gain: 0.6 * lvl, bus: 'ui', pan, hp: 400, lp: 7000 });
}
export function stingHit(e: Engine, t: number): number {
  return e.smp('sting-danse-hit', t, { gain: 0.6, bus: 'ui' });
}
