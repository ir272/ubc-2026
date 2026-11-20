// Ringout sound recipes. Every function schedules one sound at context time `t` on an Engine.
//
// Round 4: built from recordings (CC0 and CC-BY, ASSETS.md). Impacts are punches, body thuds and
// deep cinematic hits, so the set has weight and does not depend on the cast being metal; a small
// recorded colour per fighter (heat, ratchet, air, press) rides on medium and bigger hits and can be
// dropped from FAMS if the cast changes. Synthesis is gone from the hits, the show and movement:
// every layer is a sample, played with small pitch and gain variation and a round robin that never
// repeats the last pick. The only shaping is filters, a decay envelope and playing a sample
// backwards for a swell that lands on a beat.
//
// The ladder (loudest 10 ms, measured with tools/audio.mjs): light < medium < heavy < lethal <
// knockout, each step a few dB louder, wider in band and longer than the one under it.

import type { FighterId, HitStrength, MoveId } from '../../sim/types.ts';
import { sample, type Engine } from './engine.ts';

export interface Fam {
  /** pitch factor for the fighter's own sounds: lower is bigger */
  pitch: number;
  /** 0..1, body weight for steps and landings */
  weight: number;
  /** footstep interval while running, ticks */
  stride: number;
  /** the fighter's recorded colour on medium and bigger hits (null for none) */
  sig: { name: string; hp?: number; lp?: number; rate: number; gain: number } | null;
}

export const FAMS: Record<FighterId, Fam> = {
  kiln: { pitch: 0.82, weight: 1, stride: 17, sig: { name: 'kiln-hiss', hp: 2200, rate: 0.95, gain: 0.45 } },
  tick: { pitch: 1.25, weight: 0.3, stride: 9, sig: { name: 'tick-ratchet', hp: 1500, rate: 1.12, gain: 0.55 } },
  gantry: { pitch: 1.0, weight: 0.55, stride: 14, sig: { name: 'gantry-air', hp: 1200, rate: 0.95, gain: 0.45 } },
  vise: { pitch: 0.9, weight: 0.85, stride: 15, sig: { name: 'vise-press', lp: 3000, hp: 150, rate: 0.95, gain: 0.45 } },
};

const LIGHTS = ['p-light-1', 'p-light-2', 'p-light-3', 'p-light-4'];
const MEDIUMS = ['p-med-1', 'p-med-2', 'p-med-3', 'p-med-4'];
const HEAVIES = ['p-heavy-1', 'p-heavy-2', 'p-heavy-3', 'p-heavy-4'];
/** bright transients, high-passed: the crack on top of a body punch */
const CRACKS = ['p-med-2', 'p-med-4', 'p-light-3', 'p-med-1'];
const STEPS = ['step-a', 'step-b', 'step-c', 'step-d'];
const SWINGS = ['swing-1', 'swing-2', 'swing-3', 'swing-4'];
const BLASTS = ['ko-blast-1', 'ko-blast-2'];

/**
 * Per-recording trims (dB) so every member of a round-robin set lands at the same loudest 10 ms
 * after the recipe's filters (measured from set-*.wav with tools/audio.mjs): repeats vary in
 * timbre, never in where they sit on the ladder.
 */
const TRIM_DB: Record<string, number> = {
  'p-light-1': -1.6, 'p-light-2': 0.9, 'p-light-3': 2.5, 'p-light-4': -1.8,
  'p-med-1': 0.8, 'p-med-2': 2.7, 'p-med-3': -1.9, 'p-med-4': -1.6,
  'p-heavy-1': 1.5, 'p-heavy-2': -1.2, 'p-heavy-3': 1.8, 'p-heavy-4': -2.0,
};
const trim = (name: string) => Math.pow(10, (TRIM_DB[name] ?? 0) / 20);
/** small gain variation, about +-1 dB */
const vg = (e: Engine) => e.rng.range(0.89, 1.12);
/** small pitch variation, about +-4% */
const vr = (e: Engine, k = 0.04) => e.rng.range(1 - k, 1 + k);

/** the attacker's recorded colour on a landed hit */
function signature(e: Engine, f: FighterId, t: number, amt: number, pan: number): void {
  const s = FAMS[f].sig;
  if (!s || amt <= 0) return;
  e.smp(s.name, t, { gain: s.gain * amt, rate: s.rate * vr(e, 0.05), pan, hp: s.hp, lp: s.lp, hold: 0.04, tc: 0.08 + 0.06 * amt });
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
  /** scale of the attacker's colour layer (default 1) */
  sig?: number;
}

/** each class's level (dB) before its layers */
const HIT_DB: Record<HitStrength, number> = { light: -16.6, medium: -13.0, heavy: -11.3, lethal: -13 };
/** each class's own compressor [threshold dB, makeup back out dB, ratio]: holds loud picks to the rung */
const SQUEEZE_DB: Record<HitStrength, [number, number, number]> = { light: [-26, 0, 3], medium: [-20, 0, 3], heavy: [-16, 0, 4], lethal: [-12, 0, 4] };

/**
 * The contact sound. Lands on the frame of contact; the launch is a separate sound. Every class is
 * its own set of recordings, and each step up adds weight and length:
 *   light   a short punch, high-passed so it stays small
 *   medium  a body punch with a crack on top
 *   heavy   a body thud, a deep impact with a short tail, a hard crack and a drum
 *   lethal  a dry tick on contact, about 110 ms of near silence (the director pulls the music and
 *           the room down), then the big impact: a cinematic hit with a tail of about a second
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
  const comboUp = 1 + Math.min(0.12, a.combo * 0.02);
  switch (a.strength) {
    case 'light': {
      if (!e.voice(t, 0.4, 1)) return 0;
      const lt = e.rr('light', LIGHTS);
      e.smp(lt, t, { gain: trim(lt) * vg(e), rate: pp * comboUp * vr(e), pan, hp: 160, verb: 0.06 });
      return 0.4;
    }
    case 'medium': {
      if (!e.voice(t, 0.8, 2)) return 0;
      const md = e.rr('medium', MEDIUMS);
      e.smp(md, t, { gain: trim(md) * vg(e), rate: pp * vr(e), pan, hp: 70, verb: 0.12 });
      let ck = e.rr('medium-crack', CRACKS);
      if (ck === md) ck = e.rr('medium-crack', CRACKS);
      e.smp(ck, t, { gain: 0.5 * vg(e), rate: 1.1 * vr(e), pan, hp: 1800 });
      signature(e, a.by, t + 0.01, 0.35 * (a.sig ?? 1), pan);
      return 0.8;
    }
    case 'heavy': {
      if (!e.voice(t, 1.2, 3)) return 0;
      const hv = e.rr('heavy', HEAVIES);
      e.smp(hv, t, { gain: trim(hv) * vg(e), rate: pp * vr(e), pan, hp: 40, verb: 0.18 });
      // the deep impact with a short tail; a lighter victim rings a little higher
      e.smp('impact-low', t, { gain: 0.75 * vg(e), rate: (1.05 + 0.12 * (1 - vic.weight)) * vr(e, 0.03), pan: pan * 0.5, hold: 0.06, tc: 0.13 });
      e.smp(e.rr('heavy-crack', CRACKS), t, { gain: 0.8, rate: 0.85 * vr(e), pan, hp: 1300 });
      e.smp('kick', t, { gain: 0.5, rate: 1.3 * vr(e, 0.03), pan: pan * 0.4, lp: 450 });
      signature(e, a.by, t + 0.01, 0.55 * (a.sig ?? 1), pan);
      return 1.2;
    }
    case 'lethal': {
      e.voice(t, 2.4, 5);
      // contact: one dry tick on the frame...
      e.smp('p-light-1', t, { gain: 0.5, rate: 1.25, pan, hp: 1500 });
      // ...a held breath...
      const h = t + 0.11;
      // ...then the big one: a cinematic impact with a tail, a low boom, the body, the crack, the drum
      e.smp('impact-big', h, { gain: 1.0 * vg(e), rate: 0.96 * vr(e, 0.02), pan: pan * 0.4, hold: 0.35, tc: 0.5, verb: 0.15 });
      e.smp('impact-cine', h, { gain: 0.55, rate: 1.0, pan: pan * 0.3, hold: 0.2, tc: 0.4 });
      const hv = e.rr('heavy', HEAVIES);
      e.smp(hv, h, { gain: 0.9 * trim(hv), rate: 0.85 * pp, pan, hp: 40 });
      e.smp(e.rr('heavy-crack', CRACKS), h, { gain: 1.0, rate: 0.78, pan, hp: 1000, verb: 0.2 });
      e.smp('kick', h, { gain: 0.6, rate: 1.1, lp: 500 });
      signature(e, a.by, h + 0.01, 0.8 * (a.sig ?? 1), pan);
      return 2.4;
    }
  }
}

/** The launch: the air after the hit pause, longer and lower with more knockback. */
function launch_(e: Engine, t: number, kb: number, lethal: boolean, pan: number): void {
  const k = Math.min(1, kb / 140);
  if (!e.voice(t, 0.4 + k, lethal ? 4 : 2)) return;
  if (k > 0.55 || lethal) e.smp('swoosh-long', t, { gain: 0.5 + 0.5 * k, rate: (1.35 - 0.4 * k) * vr(e), pan, hp: 120, dur: 0.35 + 0.5 * k });
  else e.smp(e.rr('launch', SWINGS), t, { gain: 0.5 + 0.6 * k, rate: (1.15 - 0.3 * k) * vr(e), pan, hp: 150 });
}

function shieldHit_(e: Engine, t: number, perfect: boolean, strong: number, pan: number): void {
  if (!e.voice(t, 0.5, 2)) return;
  // the guard takes it: a shield ring over a short body knock, no flesh
  e.smp('shield-1', t, { gain: (0.6 + 0.3 * strong) * vg(e), rate: (perfect ? 1.25 : 1.05) * vr(e), pan, hp: 200, hold: 0.05, tc: perfect ? 0.14 : 0.1 });
  e.smp(e.rr('shield-body', ['p-light-2', 'p-light-4']), t, { gain: 0.45 + 0.2 * strong, rate: 1.0 * vr(e), pan, hp: 90, lp: 1600 });
  if (perfect) e.smp('clock-tick', t + 0.01, { gain: 0.5, rate: 1.4, pan, hp: 1500 });
}

function shieldBreak_(e: Engine, t: number, pan: number): void {
  e.voice(t, 1.5, 4);
  e.smp('shield-1', t, { gain: 1.0, rate: 0.72, pan, verb: 0.3 });
  e.smp('impact-low', t, { gain: 0.7, rate: 1.1, pan, hold: 0.06, tc: 0.25 });
  e.smp('p-med-2', t, { gain: 0.6, rate: 0.9, pan, hp: 1200 });
}

function clank_(e: Engine, t: number, pan: number): void {
  if (!e.voice(t, 0.5, 2)) return;
  e.smp('shield-1', t, { gain: 0.5, rate: 1.45 * vr(e), pan, hp: 400, tc: 0.07 });
  e.smp(e.rr('clank', CRACKS), t, { gain: 0.45, rate: 1.0, pan, hp: 1500 });
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
 * A swing: a recorded whoosh whose crest lands on the first active frame (`activeIn` s from now),
 * so it is heard before the blow; big moves add a long swoosh that starts earlier.
 */
function swing_(e: Engine, t: number, f: FighterId, move: MoveId, activeIn: number, pan: number): void {
  const fam = FAMS[f];
  const size = MOVE_SIZE[move] ?? 0.5;
  if (!e.voice(t, activeIn + 0.4, 1)) return;
  const pp = Math.pow(fam.pitch, 0.3);
  const w = e.rr('swing', SWINGS);
  // the whooshes crest about 40 ms in
  e.smp(w, t + Math.max(0, activeIn - 0.05), { gain: (0.45 + 0.5 * size) * vg(e), rate: ((1.3 - 0.35 * size) * pp) * vr(e), pan, hp: 150 });
  if (size >= 0.8) e.smp('swoosh-long', t + Math.max(0, activeIn - 0.3), { gain: 0.45 * size, rate: 1.2 * pp * vr(e), pan, hp: 120, dur: 0.45 });
}

function projectile_(e: Engine, t: number, f: FighterId, pan: number): void {
  if (!e.voice(t, 0.4, 2)) return;
  e.smp('swing-3', t, { gain: 0.7, rate: 1.5 * vr(e), pan, hp: 300 });
  e.smp('p-light-1', t, { gain: 0.35, rate: 1.4, pan, hp: 800 });
  if (FAMS[f].sig) signature(e, f, t, 0.4, pan);
}

function grab_(e: Engine, t: number, f: FighterId, pan: number): void {
  if (!e.voice(t, 0.6, 2)) return;
  const fam = FAMS[f];
  // a hand closing on a body: the recorded grab and a short knock
  e.smp('grab-1', t, { gain: 0.8 * vg(e), rate: Math.pow(fam.pitch, 0.3) * vr(e), pan, hp: 60 });
  e.smp('p-light-4', t, { gain: 0.35, rate: 1.1 * vr(e), pan, hp: 120, lp: 2500 });
}

function throwSound_(e: Engine, t: number, f: FighterId, pan: number): void {
  if (!e.voice(t, 0.6, 2)) return;
  e.smp('swoosh-long', t, { gain: 0.6, rate: 1.1 * Math.pow(FAMS[f].pitch, 0.3) * vr(e), pan, hp: 120, dur: 0.5 });
}

// ------------------------------------------------------------------------------------------------
// movement
// ------------------------------------------------------------------------------------------------

function step_(e: Engine, t: number, f: FighterId, pan: number, loud = 1): void {
  if (!e.voice(t, 0.2, 0)) return;
  const w = FAMS[f].weight;
  // a footfall on the deck, heavier and lower with weight
  e.smp(e.rr('step', STEPS), t, { gain: (0.35 + 0.5 * w) * loud * vg(e), rate: (1.2 - 0.3 * w) * vr(e), pan, hp: 60, lp: 7000 });
  if (w > 0.8) e.smp('p-heavy-4', t, { gain: 0.18 * loud, rate: 1.25 * vr(e), pan, lp: 900 });
}

function jump_(e: Engine, t: number, f: FighterId, air: boolean, pan: number): void {
  if (!e.voice(t, 0.5, 1)) return;
  const fam = FAMS[f];
  const pp = Math.pow(fam.pitch, 0.3);
  // the body leaves the deck: a push-off scuff and a short whoosh upward
  e.smp('swing-2', t + 0.02, { gain: air ? 0.55 : 0.5, rate: (air ? 1.35 : 1.15) * pp * vr(e), pan, hp: 200 });
  if (!air) e.smp(e.rr('step', STEPS), t, { gain: 0.25 + 0.3 * fam.weight, rate: 1.25 * vr(e), pan, hp: 120 });
}

function land_(e: Engine, t: number, f: FighterId, hard: boolean, pan: number): void {
  if (!e.voice(t, 0.4, 1)) return;
  const w = FAMS[f].weight;
  const k = hard ? 1.35 : 1;
  // the weight comes down: a recorded landing and a footfall, a heavy thud for the heavy ones
  e.smp('land-1', t, { gain: (0.35 + 0.5 * w) * k * vg(e), rate: (1.3 - 0.4 * w) * vr(e), pan, hp: 50 });
  e.smp(e.rr('step', STEPS), t, { gain: 0.3 * k, rate: 1.1 * vr(e), pan, hp: 150 });
  if (w > 0.5) e.smp('p-heavy-4', t, { gain: 0.35 * w * k, rate: 1.05 * vr(e), pan, lp: 1200 });
}

function dash_(e: Engine, t: number, f: FighterId, pan: number): void {
  if (!e.voice(t, 0.5, 1)) return;
  const fam = FAMS[f];
  e.smp('swoosh-long', t, { gain: 0.45, rate: 1.5 * Math.pow(fam.pitch, 0.3) * vr(e), pan, hp: 200, dur: 0.32 });
  step(e, t, f, pan, 0.9);
}

function dodge_(e: Engine, t: number, f: FighterId, kind: 'roll' | 'spot' | 'air', pan: number): void {
  if (!e.voice(t, 0.3, 1)) return;
  e.smp(kind === 'roll' ? 'swing-1' : 'swing-3', t, { gain: 0.45, rate: (kind === 'roll' ? 0.95 : 1.3) * Math.pow(FAMS[f].pitch, 0.3) * vr(e), pan, hp: 200 });
}

function ledge_(e: Engine, t: number, f: FighterId, pan: number): void {
  if (!e.voice(t, 0.4, 1)) return;
  e.smp('grab-1', t, { gain: 0.6, rate: 1.15 * vr(e), pan, hp: 80 });
  e.smp(e.rr('step', STEPS), t, { gain: 0.3, rate: 1.3, pan, hp: 150 });
}

function tech_(e: Engine, t: number, f: FighterId, pan: number): void {
  if (!e.voice(t, 0.3, 1)) return;
  e.smp(e.rr('step', STEPS), t, { gain: 0.5, rate: 1.1 * vr(e), pan, hp: 80 });
  e.smp('swing-3', t, { gain: 0.35, rate: 1.4 * Math.pow(FAMS[f].pitch, 0.3), pan, hp: 300 });
}

function bounce_(e: Engine, t: number, f: FighterId, pan: number): void {
  if (!e.voice(t, 0.6, 2)) return;
  const w = FAMS[f].weight;
  e.smp('land-1', t, { gain: 0.8, rate: 1.1 - 0.2 * w, pan });
  e.smp('p-heavy-4', t, { gain: 0.5, rate: 1.0, pan, lp: 1500 });
  e.smp('impact-low', t, { gain: 0.35, rate: 1.3, pan, hold: 0.03, tc: 0.1 });
}

// ------------------------------------------------------------------------------------------------
// the knockout
// ------------------------------------------------------------------------------------------------

/**
 * The loudest thing in the show: a recorded explosion with its own tail (two of them, alternated),
 * a low boom, the big impact and a drum. The crowd roar is the director's.
 */
function koBlast_(e: Engine, t: number, pan: number): void {
  e.voice(t, 3.5, 6);
  const p = pan * 0.6;
  e.smp(e.rr('ko', BLASTS), t, { gain: 1.0, rate: 0.95 * vr(e, 0.02), pan: p, verb: 0.12, hp: 60 });
  e.smp('ko-boom', t, { gain: 0.7, rate: 1.0, pan: p * 0.5, lp: 2500, hold: 0.3, tc: 0.6 });
  e.smp('impact-big', t, { gain: 0.6, rate: 0.85, pan: p * 0.5, hold: 0.15, tc: 0.5 });
  e.smp('kick', t, { gain: 0.5, rate: 1.0, lp: 400 });
}

function respawn_(e: Engine, t: number, pan: number): void {
  if (!e.voice(t, 1.2, 1)) return;
  // the pad comes down: a swell that lands as the fighter appears
  e.smp('swoosh-long', t, { gain: 0.5, rate: 1.0, pan, hp: 150, reverse: true });
}

// ------------------------------------------------------------------------------------------------
// show sounds (bus 'ui')
// ------------------------------------------------------------------------------------------------

/** a show hit for calls and cards: the deep impact, a crack on top and a drum */
function showHit(e: Engine, t: number, size: number, pan = 0): void {
  e.smp('impact-low', t, { gain: 0.8 * size, rate: 1.08, bus: 'ui', pan, hold: 0.06, tc: 0.28 });
  e.smp(e.rr('show-crack', CRACKS), t, { gain: 0.6 * size, rate: 1.0, bus: 'ui', pan, hp: 1400 });
  e.smp('kick', t, { gain: 0.5 * size, rate: 1.3, bus: 'ui', lp: 500 });
}

/** the biggest show hit (the call's mark, versus, the start, the winner): a cinematic hit with horns */
function bigHit(e: Engine, t: number, size: number, pan = 0): void {
  showHit(e, t, size, pan);
  e.smp('show-horns', t, { gain: 0.85 * size, rate: 1.0, bus: 'ui', pan: pan * 0.5, hold: 0.35, tc: 0.7, verb: 0.08 });
}

/** a backwards swell that lands at t + dur (the last `dur` seconds of a reversed sample) */
function swell(e: Engine, t: number, dur: number, name: string, gain: number, bus: 'ui' | 'sfx' = 'ui'): void {
  const b = sample(name);
  if (!b) return;
  const len = b.duration;
  const d = Math.max(0.15, Math.min(dur, len - 0.05));
  e.smp(name, t, { gain, rate: 1, bus, reverse: true, offset: len - d, fadeIn: Math.min(0.08, d * 0.4) });
}

export function uiTick(e: Engine, t: number, pan: number, hi = 1): void {
  e.smp('clock-tick', t, { gain: 0.7, rate: hi, bus: 'ui', pan, hp: 500 });
}

/** A plan changed: a tick from that corner; the red corner a tone under the blue. Two for an order. */
function planTick_(e: Engine, t: number, side: 0 | 1, order: boolean): void {
  const pan = side === 0 ? -0.55 : 0.55;
  const k = side === 0 ? 0.92 : 1.06;
  e.smp('clock-tick', t, { gain: 0.8, rate: 1.2 * k, bus: 'ui', pan, hp: 500 });
  e.smp('p-light-1', t, { gain: 0.25, rate: 1.5 * k, bus: 'ui', pan, hp: 900 });
  if (order) e.smp('clock-tick', t + 0.12, { gain: 0.8, rate: 1.42 * k, bus: 'ui', pan, hp: 500 });
}

function clockTick_(e: Engine, t: number, last: boolean): void {
  // the last five seconds of a window: a clock, the last second hit
  e.smp('clock-tick', t, { gain: last ? 1.0 : 0.75, rate: last ? 0.9 : 1.0, bus: 'ui', hp: 400 });
  if (last) e.smp('impact-low', t, { gain: 0.35, rate: 1.4, bus: 'ui', hold: 0.02, tc: 0.1 });
}

/** bets lock: a heavy lock throws */
function lock_(e: Engine, t: number): void {
  e.smp('lock-1', t, { gain: 0.9, rate: 0.95, bus: 'ui', hp: 150 });
  e.smp('p-heavy-4', t, { gain: 0.5, rate: 1.1, bus: 'ui', lp: 1500 });
}

/** LOCKED slams across before the countdown: a show hit and the lock */
function lockSlam_(e: Engine, t: number): void {
  e.voice(t, 1, 4);
  showHit(e, t, 0.8);
  lock_(e, t);
}

/** a window opens: the clock starts */
function windowOpen_(e: Engine, t: number): void {
  e.smp('clock-tick', t, { gain: 0.7, rate: 1.1, bus: 'ui', hp: 500 });
  e.smp('clock-tick', t + 0.1, { gain: 0.8, rate: 1.3, bus: 'ui', hp: 500 });
}

/** a big word slams onto the screen (phase titles, sudden death) */
function wordSlam_(e: Engine, t: number, size: number, pan = 0): void {
  e.voice(t, 1, 4);
  showHit(e, t, size, pan);
}

/** a smaller beat: a band or a number lands */
function cardHit_(e: Engine, t: number, size: number, pan = 0): void {
  e.smp('impact-low', t, { gain: 0.6 * size, rate: 1.25, bus: 'ui', pan, hold: 0.03, tc: 0.14 });
  e.smp(e.rr('card-crack', CRACKS), t, { gain: 0.45 * size, rate: 1.1, bus: 'ui', pan, hp: 1500 });
}

/** a fighter lands on the roster line: weight on the deck */
function rosterLand_(e: Engine, t: number, i: number): void {
  const pan = [-0.6, -0.2, 0.2, 0.6][i] ?? 0;
  e.smp('land-1', t, { gain: 0.8, rate: 0.95 + 0.08 * i, bus: 'ui', pan });
  e.smp('p-heavy-4', t, { gain: 0.5, rate: 1.1 + 0.05 * i, bus: 'ui', pan, lp: 1500 });
}

/** a stinger wipes across the screen */
function sting_(e: Engine, t: number): void {
  e.smp('swoosh-long', t, { gain: 0.7, rate: 0.95, bus: 'ui', pan: -0.3, hp: 150 });
}

function countBeep_(e: Engine, t: number, n: number): void {
  // 3, 2, 1: each numeral a deep hit, a step higher, with the clock on it
  const r = [1, 1, 1.122, 1.26][n] ?? 1;
  e.voice(t, 0.8, 4);
  e.smp('impact-low', t, { gain: 0.9, rate: 0.95 * (2.26 - r), bus: 'ui', hold: 0.05, tc: 0.25 });
  e.smp('clock-tick', t, { gain: 0.8, rate: 0.85 * (2.26 - r), bus: 'ui', hp: 400 });
  e.smp('kick', t, { gain: 0.45, rate: 1.3, bus: 'ui', lp: 500 });
}

/** the start call: the loudest show sound */
function startCall_(e: Engine, t: number): void {
  e.voice(t, 1.6, 5);
  bigHit(e, t, 1.2);
}

/** the knockout call (RINGOUT; LIGHTS OUT on the last life) */
function koCall_(e: Engine, t: number, final: boolean): void {
  e.voice(t, 1.6, 5);
  if (final) bigHit(e, t, 0.9);
  else cardHit_(e, t, 1.0);
}

/** the call opens the show: a backwards swell into the mark slamming shut */
function callOpen_(e: Engine, t: number, lead: number): void {
  swell(e, t, lead + 0.25, 'impact-big', 0.5);
  bigHit(e, t + lead, 1.0);
}

/** the build into the pick reveal: a backwards impact that lands on the flip */
function riser_(e: Engine, t: number, dur: number): void {
  swell(e, t, dur, 'impact-cine', 0.8);
}

/** both picks flip together: a double slam, the second bigger */
function pickReveal_(e: Engine, t: number): void {
  e.voice(t, 1.2, 4);
  showHit(e, t, 0.6, -0.3);
  showHit(e, t + 0.12, 1, 0.2);
}

/** the versus card: halves whoosh in from both sides and slam (lands `lead` s after t) */
function versusSlam_(e: Engine, t: number, lead = 0.15): void {
  e.voice(t, 2, 5);
  e.smp('swing-1', t + Math.max(0, lead - 0.06), { gain: 0.7, rate: 0.9, bus: 'ui', pan: -0.6 });
  e.smp('swing-2', t + Math.max(0, lead - 0.05), { gain: 0.7, rate: 0.95, bus: 'ui', pan: 0.6 });
  bigHit(e, t + lead, 1.25);
}

/** taunt lines are no longer drawn: nothing to hear */
function taunt_(_e: Engine, _t: number, _side: 0 | 1): void {
  /* intentionally silent */
}

/** corner talk is no longer drawn: a soft tick from that corner only */
function cornerTalk_(e: Engine, t: number, side: 0 | 1): void {
  e.smp('clock-tick', t, { gain: 0.35, rate: 1.5, bus: 'ui', pan: side === 0 ? -0.6 : 0.6, hp: 800 });
}

/** overdrive: the word slams (80 ms after the event), then three clock ticks climbing */
function suddenDeath_(e: Engine, t: number): void {
  wordSlam_(e, t + 0.08, 1.1);
  for (let i = 0; i < 3; i++) e.smp('clock-tick', t + 0.4 + i * 0.25, { gain: 0.8, rate: 1 + 0.12 * i, bus: 'ui', hp: 400 });
}

/** the verdict burst: the winner's hit (the room roars with it in the director) */
function winner_(e: Engine, t: number, side: 0 | 1): void {
  e.voice(t, 3, 5);
  bigHit(e, t, 1.3, side === 0 ? -0.25 : 0.25);
}

/** The payout beat: everything holds under a backwards swell for `dur` s, cut by the hit. */
function payoutHold_(e: Engine, t: number, dur: number): void {
  swell(e, t, dur, 'impact-cine', 0.7);
}

function payoutHit_(e: Engine, t: number): void {
  e.voice(t, 1.5, 5);
  showHit(e, t, 1.2);
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

export const launch = leveled(-14, launch_);
export const shieldHit = leveled(-9, shieldHit_);
export const shieldBreak = leveled(-9, shieldBreak_);
export const clank = leveled(-2, clank_);
export const swing = leveled(-12.7, swing_);
export const projectile = leveled(-9.5, projectile_);
export const grab = leveled(-3, grab_);
export const throwSound = leveled(-3, throwSound_);
export const step = leveled(-17, step_);
export const jump = leveled(-5, jump_);
export const land = leveled(-10, land_);
export const dash = leveled(2.5, dash_);
export const dodge = leveled(-10, dodge_);
export const ledge = leveled(-6, ledge_);
export const tech = leveled(-9, tech_);
export const bounce = leveled(-11, bounce_);
export const koBlast = leveled(-1, koBlast_);
export const respawn = leveled(-2, respawn_);
export const clockTick = leveled(-8, clockTick_);
export const lock = leveled(-2, lock_);
export const lockSlam = leveled(-9, lockSlam_);
export const windowOpen = leveled(-6, windowOpen_);
export const wordSlam = leveled(-9, wordSlam_);
export const cardHit = leveled(-10, cardHit_);
export const rosterLand = leveled(-12, rosterLand_);
export const sting = leveled(-14, sting_);
export const countBeep = leveled(-10, countBeep_);
export const startCall = leveled(-7, startCall_);
export const koCall = leveled(-5, koCall_);
export const callOpen = leveled(-8, callOpen_);
export const pickReveal = leveled(-10, pickReveal_);
export const riser = leveled(-12, riser_);
export const versusSlam = leveled(-7, versusSlam_);
export const taunt = leveled(0, taunt_);
export const cornerTalk = leveled(-3, cornerTalk_);
export const suddenDeath = leveled(-9, suddenDeath_);
export const winner = leveled(-7, winner_);
export const payoutHold = leveled(-12, payoutHold_);
export const payoutHit = leveled(-9, payoutHit_);
export const planTick = leveled(-5, planTick_);

/** the blast heard again in a replay: far off and dark, never at full level */
export function koEcho(e: Engine, t: number, pan: number): void {
  e.smp(e.rr('ko', BLASTS), t, { gain: 0.12, rate: 0.85, pan: pan * 0.6, lp: 1600, verb: 0.5, hold: 0.2, tc: 0.4 });
}
