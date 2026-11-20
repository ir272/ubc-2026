// The acting layer: additive moves on a VRM's normalized humanoid bones, applied every frame after
// the animation mixer and before vrm.update(). Breathing, a look-at with a little overshoot, blinks,
// syllable-timed mouth shapes, mood faces, and short keyed gestures (anticipation, hit, held beat,
// settle). Whole-body moves (lean from the feet, hop, squash and stretch) go on a pivot above the
// model, because those read on every body in the cast, including the toaster and the pyramid.
import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { CharacterStyle, VrmActor } from './loader.ts';
import type { EyeState, FaceCard, MouthState } from './face.ts';

export type GestureName =
  | 'lean' | 'shrug' | 'wince' | 'slump' | 'victory' | 'nod' | 'recoil'
  | 'bow' | 'pump' | 'glare' | 'smirk' | 'exhale' | 'shuffle' | 'perk' | 'deflate' | 'tilt' | 'headshake' | 'flourish' | 'leanback' | 'hop' | 'point' | 'gulp';
export type MoodName = 'neutral' | 'happy' | 'angry' | 'sad' | 'relaxed';
export const GESTURES = ['lean', 'shrug', 'wince', 'slump', 'victory', 'nod', 'recoil', 'bow', 'pump', 'glare', 'smirk', 'exhale', 'shuffle', 'perk', 'deflate', 'tilt', 'headshake', 'flourish', 'leanback', 'hop', 'point', 'gulp'] as GestureName[];
/** held postures (a layer under the gestures): the idle stance families and the booth */
export type PoseName = 'behind' | 'hips' | 'clasp' | 'fold' | 'booth' | 'proud' | 'slouch' | 'none';

// ---------------------------------------------------------------------------------------------
// keyed curves
// A key is [time s, value, ease into this key]. Eases: 's' smooth (default, settles into a hold),
// 'o' out (snaps fast, lands soft: hits), 'i' in (slow start: anticipation), 'l' linear.
type Ease = 's' | 'o' | 'i' | 'l';
type Key = [number, number, Ease?];
type Channels = Partial<Record<Ch, Key[]>>;

/** Channels (character frame: +z forward, +x the character's left, +y up). */
type Ch =
  | 'bp' | 'br' | 'by' | 'bh' | 'bs' // body pivot: pitch (+ forward), roll (+ to its right), yaw (+ to its left), hop (x height), squash (+ stretch)
  | 'sx' | 'sz' // spine pitch, roll
  | 'cx' | 'cy' | 'cz' // chest pitch, yaw, roll
  | 'nx' // neck pitch
  | 'hx' | 'hy' | 'hz' // head pitch (+ down), yaw (+ to its left), roll (+ to its right)
  | 'shL' | 'shR' // shoulder raise
  | 'wL' | 'wR' // blend weight of the gesture's arm pose over the clip (0..1)
  | 'fHappy' | 'fAngry' | 'fSad' | 'fRelaxed' | 'fBlink' | 'fOh' | 'fAa' | 'fEe'; // face weights

const EASE: Record<Ease, (t: number) => number> = {
  s: (t) => t * t * (3 - 2 * t),
  o: (t) => 1 - (1 - t) * (1 - t) * (1 - t),
  i: (t) => t * t * t,
  l: (t) => t,
};

function sample(keys: Key[], t: number): number {
  if (t <= keys[0]![0]) return keys[0]![1];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i]!;
    if (t <= k[0]) {
      const p = keys[i - 1]!;
      const u = (t - p[0]) / Math.max(1e-5, k[0] - p[0]);
      return p[1] + (k[1] - p[1]) * EASE[k[2] ?? 's'](u);
    }
  }
  return keys[keys.length - 1]![1];
}

/**
 * An arm pose, absolute (it blends over whatever the clip does, so it reads the same on every
 * body): r raise from hanging (0 down, 1.57 out to the side, 3.1 straight up), f forward swing,
 * b elbow bend, t twist (forearm out, palms up).
 */
export type ArmPose = { r: number; f: number; b: number; t?: number };
type GestureDef = { dur: number; peak: number; ch: Channels; arms?: { L?: ArmPose; R?: ArmPose } };

/**
 * The gestures. Each starts and ends at 0. Read as: anticipation (a small move the other way),
 * the hit (fast, 'o'), a held beat (two keys with the same value), the settle (slow, 's', often
 * with a small overshoot). Values are radians, hop in fractions of the character's height.
 */
export const GESTURE_DEFS: Record<GestureName, GestureDef> = {
  // interested: a small pull back, then lean right in from the feet, head cocked, held, ease back
  lean: {
    dur: 1.6,
    peak: 0.5,
    ch: {
      bp: [[0, 0], [0.16, -0.05, 'i'], [0.42, 0.22, 'o'], [1.15, 0.2], [1.6, 0]],
      cx: [[0, 0], [0.16, -0.06], [0.42, 0.2, 'o'], [1.15, 0.18], [1.6, 0]],
      hx: [[0, 0], [0.42, -0.12, 'o'], [1.15, -0.1], [1.6, 0]],
      hz: [[0, 0], [0.2, 0], [0.5, 0.32, 'o'], [1.15, 0.3], [1.6, 0]],
      bs: [[0, 0], [0.16, -0.05, 'i'], [0.42, 0.05, 'o'], [0.6, 0.02], [1.15, 0.02], [1.6, 0]],
      wL: [[0, 0], [0.42, 0.7, 'o'], [1.15, 0.65], [1.6, 0]],
      wR: [[0, 0], [0.42, 0.7, 'o'], [1.15, 0.65], [1.6, 0]],
      fHappy: [[0, 0], [0.42, 0.9, 'o'], [1.2, 0.85], [1.6, 0]],
    },
    // hands clasped low in front, keen
    arms: { L: { r: 0.14, f: 0.45, b: 1.1 }, R: { r: 0.14, f: 0.45, b: 1.1 } },
  },
  // "no idea": a dip, shoulders and arms right up with the head tipped over, held, then a drop
  shrug: {
    dur: 1.4,
    peak: 0.4,
    ch: {
      bs: [[0, 0], [0.12, -0.08, 'i'], [0.3, 0.08, 'o'], [0.95, 0.06], [1.12, -0.05, 'i'], [1.4, 0]],
      bh: [[0, 0], [0.12, -0.008], [0.3, 0.035, 'o'], [0.95, 0.03], [1.12, 0, 'i'], [1.4, 0]],
      shL: [[0, 0], [0.12, -0.08], [0.3, 0.62, 'o'], [0.95, 0.58], [1.12, -0.08, 'i'], [1.4, 0]],
      shR: [[0, 0], [0.12, -0.08], [0.3, 0.62, 'o'], [0.95, 0.58], [1.12, -0.08, 'i'], [1.4, 0]],
      wL: [[0, 0], [0.12, 0.1], [0.3, 1, 'o'], [0.95, 1], [1.2, 0.1, 'i'], [1.4, 0]],
      wR: [[0, 0], [0.12, 0.1], [0.3, 1, 'o'], [0.95, 1], [1.2, 0.1, 'i'], [1.4, 0]],
      hz: [[0, 0], [0.3, -0.45, 'o'], [0.95, -0.42], [1.4, 0]],
      hx: [[0, 0], [0.3, -0.12, 'o'], [0.95, -0.1], [1.4, 0]],
      br: [[0, 0], [0.3, -0.1, 'o'], [0.95, -0.09], [1.4, 0]],
      fEe: [[0, 0], [0.3, 0.5, 'o'], [0.95, 0.45], [1.2, 0]],
      fSad: [[0, 0], [0.3, 0.45, 'o'], [0.95, 0.4], [1.2, 0]],
    },
    arms: { L: { r: 0.6, f: 0.25, b: 1.55, t: 1.1 }, R: { r: 0.6, f: 0.25, b: 1.55, t: 1.1 } },
  },
  // ouch: a snap away and down, squashed, eyes screwed shut, two aftershocks, a slow recovery
  wince: {
    dur: 1.15,
    peak: 0.1,
    ch: {
      bp: [[0, 0], [0.09, -0.2, 'o'], [0.62, -0.17], [1.15, 0]],
      by: [[0, 0], [0.09, -0.36, 'o'], [0.62, -0.32], [1.15, 0]],
      bs: [[0, 0], [0.09, -0.16, 'o'], [0.2, -0.1], [0.28, -0.14, 'o'], [0.62, -0.11], [1.15, 0]],
      hy: [[0, 0], [0.09, -0.48, 'o'], [0.2, -0.4], [0.28, -0.45, 'o'], [0.62, -0.42], [1.15, 0]],
      hz: [[0, 0], [0.09, 0.3, 'o'], [0.62, 0.27], [1.15, 0]],
      hx: [[0, 0], [0.09, 0.16, 'o'], [0.62, 0.14], [1.15, 0]],
      shL: [[0, 0], [0.09, 0.5, 'o'], [0.62, 0.45], [1.15, 0]],
      shR: [[0, 0], [0.09, 0.5, 'o'], [0.62, 0.45], [1.15, 0]],
      wL: [[0, 0], [0.09, 0.95, 'o'], [0.62, 0.9], [1.15, 0]],
      wR: [[0, 0], [0.09, 0.95, 'o'], [0.62, 0.9], [1.15, 0]],
      fBlink: [[0, 0], [0.06, 1, 'o'], [0.72, 1], [0.92, 0]],
      fAngry: [[0, 0], [0.09, 0.7, 'o'], [0.72, 0.6], [1.05, 0]],
    },
    arms: { L: { r: 0.35, f: 0.8, b: 2.25 }, R: { r: 0.35, f: 0.8, b: 2.25 } },
  },
  // deflate: a held beat of stillness, then the whole body sinks and squashes; the head drops and
  // rolls to one side but stays up enough to show the sad face; it stays down a while
  slump: {
    dur: 1.7,
    peak: 0.75,
    ch: {
      bs: [[0, 0], [0.2, 0.025], [0.55, -0.14, 'o'], [0.7, -0.11], [1.3, -0.12], [1.7, 0]],
      bh: [[0, 0], [0.55, -0.03, 'o'], [1.3, -0.028], [1.7, 0]],
      bp: [[0, 0], [0.55, 0.05, 'o'], [1.3, 0.045], [1.7, 0]],
      br: [[0, 0], [0.55, 0.07, 'o'], [1.3, 0.06], [1.7, 0]],
      cx: [[0, 0], [0.2, -0.05], [0.55, 0.18, 'o'], [1.3, 0.16], [1.7, 0]],
      hx: [[0, 0], [0.2, -0.06], [0.55, 0.12, 'o'], [1.3, 0.1], [1.7, 0]],
      hz: [[0, 0], [0.55, 0.24, 'o'], [1.3, 0.22], [1.7, 0]],
      shL: [[0, 0], [0.2, 0.1], [0.55, -0.3, 'o'], [1.3, -0.28], [1.7, 0]],
      shR: [[0, 0], [0.2, 0.1], [0.55, -0.3, 'o'], [1.3, -0.28], [1.7, 0]],
      wL: [[0, 0], [0.2, 0], [0.55, 0.85, 'o'], [1.3, 0.8], [1.7, 0]],
      wR: [[0, 0], [0.2, 0], [0.55, 0.85, 'o'], [1.3, 0.8], [1.7, 0]],
      fSad: [[0, 0], [0.3, 0.3], [0.55, 1, 'o'], [1.4, 1], [1.7, 0]],
    },
    arms: { L: { r: 0.02, f: 0.06, b: 0.05 }, R: { r: 0.02, f: 0.06, b: 0.05 } },
  },
  // the win: crouch, then pop up and lean back with one fist punched straight up over the head and
  // the other pumped at the side, land, hold it, settle
  victory: {
    dur: 1.8,
    peak: 0.42,
    ch: {
      bs: [[0, 0], [0.16, -0.14, 'i'], [0.34, 0.16, 'o'], [0.52, 0.02], [0.62, -0.08, 'o'], [0.8, 0.04], [1.4, 0.03], [1.8, 0]],
      bh: [[0, 0], [0.16, -0.025, 'i'], [0.38, 0.12, 'o'], [0.6, 0, 'i'], [1.8, 0]],
      bp: [[0, 0], [0.16, 0.07, 'i'], [0.38, -0.17, 'o'], [1.4, -0.14], [1.8, 0]],
      br: [[0, 0], [0.38, 0.1, 'o'], [1.4, 0.085], [1.8, 0]],
      cx: [[0, 0], [0.16, 0.1], [0.36, -0.16, 'o'], [1.4, -0.14], [1.8, 0]],
      wR: [[0, 0], [0.16, 0.2, 'i'], [0.32, 1, 'o'], [1.45, 1], [1.8, 0]],
      wL: [[0, 0], [0.32, 0.95, 'o'], [1.45, 0.9], [1.8, 0]],
      hx: [[0, 0], [0.16, 0.12, 'i'], [0.36, -0.3, 'o'], [1.4, -0.25], [1.8, 0]],
      hz: [[0, 0], [0.36, 0.18, 'o'], [1.4, 0.15], [1.8, 0]],
      fHappy: [[0, 0], [0.3, 1, 'o'], [1.55, 1], [1.8, 0]],
    },
    arms: { L: { r: 0.6, f: 0.45, b: 2.15 }, R: { r: 3.05, f: 0.12, b: 0.12 } },
  },
  // yes: a tiny lift, two dips (the second smaller), settle
  nod: {
    dur: 0.75,
    peak: 0.22,
    ch: {
      hx: [[0, 0], [0.08, -0.07, 'i'], [0.22, 0.3, 'o'], [0.36, 0.02], [0.48, 0.18, 'o'], [0.75, 0]],
      nx: [[0, 0], [0.22, 0.08, 'o'], [0.36, 0], [0.48, 0.05, 'o'], [0.75, 0]],
      cx: [[0, 0], [0.22, 0.05, 'o'], [0.48, 0.03], [0.75, 0]],
      bs: [[0, 0], [0.22, -0.025, 'o'], [0.36, 0.005], [0.48, -0.015, 'o'], [0.75, 0]],
      bp: [[0, 0], [0.22, 0.03, 'o'], [0.48, 0.02], [0.75, 0]],
    },
  },
  // taken aback: a jolt backward with a stretch, arms up, held in disbelief, then back
  recoil: {
    dur: 1.1,
    peak: 0.1,
    ch: {
      bp: [[0, 0], [0.1, -0.28, 'o'], [0.62, -0.24], [0.92, 0.03], [1.1, 0]],
      bs: [[0, 0], [0.1, 0.14, 'o'], [0.22, 0.07], [0.62, 0.06], [0.92, -0.03], [1.1, 0]],
      bh: [[0, 0], [0.1, 0.045, 'o'], [0.3, 0], [1.1, 0]],
      hx: [[0, 0], [0.1, -0.3, 'o'], [0.62, -0.25], [1.1, 0]],
      cx: [[0, 0], [0.1, -0.18, 'o'], [0.62, -0.15], [1.1, 0]],
      wL: [[0, 0], [0.1, 0.95, 'o'], [0.62, 0.9], [1.1, 0]],
      wR: [[0, 0], [0.1, 0.95, 'o'], [0.62, 0.9], [1.1, 0]],
      fOh: [[0, 0], [0.1, 1, 'o'], [0.62, 0.85], [0.95, 0]],
    },
    arms: { L: { r: 0.65, f: 0.5, b: 1.6, t: 0.6 }, R: { r: 0.65, f: 0.5, b: 1.6, t: 0.6 } },
  },
  // a showman's bow from the waist, hands to the belly, held, back up with a little rise
  bow: {
    dur: 1.5,
    peak: 0.45,
    ch: {
      bs: [[0, 0], [0.15, 0.03, 'i'], [0.45, -0.04, 'o'], [0.95, -0.035], [1.2, 0.02], [1.5, 0]],
      sx: [[0, 0], [0.15, -0.05, 'i'], [0.45, 0.42, 'o'], [0.95, 0.4], [1.3, -0.02], [1.5, 0]],
      cx: [[0, 0], [0.45, 0.2, 'o'], [0.95, 0.19], [1.5, 0]],
      hx: [[0, 0], [0.45, 0.25, 'o'], [0.95, 0.24], [1.5, 0]],
      wL: [[0, 0], [0.4, 0.8, 'o'], [1.0, 0.75], [1.5, 0]],
      wR: [[0, 0], [0.4, 0.8, 'o'], [1.0, 0.75], [1.5, 0]],
      fHappy: [[0, 0], [0.45, 0.6, 'o'], [1.1, 0.55], [1.5, 0]],
    },
    arms: { L: { r: 0.18, f: 0.55, b: 1.5, t: -1.2 }, R: { r: 0.18, f: 0.55, b: 1.5, t: -1.2 } },
  },
  // a small private "yes": a dip, the fist comes up and down twice, eyes shut grinning
  pump: {
    dur: 1.2,
    peak: 0.3,
    ch: {
      bs: [[0, 0], [0.12, -0.07, 'i'], [0.3, 0.07, 'o'], [0.48, -0.03], [0.62, 0.05, 'o'], [0.85, 0], [1.2, 0]],
      bh: [[0, 0], [0.12, -0.012, 'i'], [0.3, 0.045, 'o'], [0.48, 0], [0.62, 0.025, 'o'], [0.85, 0]],
      wR: [[0, 0], [0.12, 0.3, 'i'], [0.3, 1, 'o'], [0.9, 0.95], [1.2, 0]],
      hx: [[0, 0], [0.12, 0.08], [0.3, -0.12, 'o'], [0.9, -0.1], [1.2, 0]],
      hz: [[0, 0], [0.3, -0.14, 'o'], [0.9, -0.12], [1.2, 0]],
      fHappy: [[0, 0], [0.25, 1, 'o'], [1.0, 1], [1.2, 0]],
    },
    arms: { R: { r: 1.05, f: 0.55, b: 2.25, t: 0.2 } },
  },
  // a long flat stare at a rival: leaning in, chin down, shoulders up, square on, a slow release
  glare: {
    dur: 2.4,
    peak: 0.25,
    ch: {
      bp: [[0, 0], [0.25, 0.14, 'o'], [1.9, 0.12], [2.4, 0]],
      hx: [[0, 0], [0.25, 0.2, 'o'], [1.9, 0.18], [2.4, 0]],
      hz: [[0, 0], [0.25, -0.12, 'o'], [1.9, -0.1], [2.4, 0]],
      shL: [[0, 0], [0.25, 0.32, 'o'], [1.9, 0.3], [2.4, 0]],
      shR: [[0, 0], [0.25, 0.32, 'o'], [1.9, 0.3], [2.4, 0]],
      bs: [[0, 0], [0.25, -0.06, 'o'], [1.9, -0.05], [2.4, 0]],
      fAngry: [[0, 0], [0.2, 1, 'o'], [1.9, 1], [2.4, 0]],
      fBlink: [[0, 0], [0.2, 0.35, 'o'], [1.9, 0.3], [2.4, 0]],
    },
  },
  // pleased with someone else's misfortune: chin up, head tipped well over, half a smile, a bounce
  smirk: {
    dur: 1.9,
    peak: 0.3,
    ch: {
      hx: [[0, 0], [0.3, -0.24, 'o'], [1.5, -0.21], [1.9, 0]],
      hz: [[0, 0], [0.3, 0.34, 'o'], [1.5, 0.31], [1.9, 0]],
      hy: [[0, 0], [0.3, 0.16, 'o'], [1.5, 0.14], [1.9, 0]],
      cx: [[0, 0], [0.3, -0.1, 'o'], [1.5, -0.08], [1.9, 0]],
      br: [[0, 0], [0.3, -0.05, 'o'], [1.5, -0.04], [1.9, 0]],
      bs: [[0, 0], [0.2, 0.05, 'o'], [0.4, -0.02], [0.55, 0.035, 'o'], [0.75, 0], [1.9, 0]],
      fHappy: [[0, 0], [0.3, 0.5, 'o'], [1.5, 0.5], [1.9, 0]],
      fRelaxed: [[0, 0], [0.3, 0.8, 'o'], [1.5, 0.75], [1.9, 0]],
    },
  },
  // relief: a big breath in (rise, shoulders up), then everything drops out, head tipped back to the
  // ceiling, eyes shut, a little smile; it hangs there before coming back
  exhale: {
    dur: 2.3,
    peak: 0.7,
    ch: {
      bs: [[0, 0], [0.4, 0.09, 's'], [0.7, -0.11, 'o'], [1.7, -0.08], [2.3, 0]],
      bh: [[0, 0], [0.4, 0.012, 's'], [0.7, -0.01, 'o'], [1.7, -0.008], [2.3, 0]],
      shL: [[0, 0], [0.4, 0.4, 's'], [0.7, -0.3, 'o'], [1.7, -0.26], [2.3, 0]],
      shR: [[0, 0], [0.4, 0.4, 's'], [0.7, -0.3, 'o'], [1.7, -0.26], [2.3, 0]],
      cx: [[0, 0], [0.4, -0.14], [0.7, -0.12, 'o'], [1.7, -0.1], [2.3, 0]],
      bp: [[0, 0], [0.4, -0.03], [0.7, -0.08, 'o'], [1.7, -0.07], [2.3, 0]],
      hx: [[0, 0], [0.4, -0.12], [0.7, -0.34, 'o'], [1.7, -0.3], [2.3, 0]],
      hz: [[0, 0], [0.7, 0.14, 'o'], [1.7, 0.12], [2.3, 0]],
      wL: [[0, 0], [0.7, 0.7, 'o'], [1.7, 0.65], [2.3, 0]],
      wR: [[0, 0], [0.7, 0.7, 'o'], [1.7, 0.65], [2.3, 0]],
      fBlink: [[0, 0], [0.6, 0], [0.74, 1, 'o'], [1.8, 1], [2.05, 0]],
      fRelaxed: [[0, 0], [0.7, 1, 'o'], [1.9, 0.9], [2.3, 0]],
      fHappy: [[0, 0], [0.9, 0.3], [1.8, 0.3], [2.3, 0]],
    },
    arms: { L: { r: 0.08, f: 0.04, b: 0.08 }, R: { r: 0.08, f: 0.04, b: 0.08 } },
  },
  // nerves: weight from foot to foot, eyes down, a sheepish half-smile
  shuffle: {
    dur: 1.6,
    peak: 0.25,
    ch: {
      br: [[0, 0], [0.22, 0.07, 'o'], [0.5, -0.06, 's'], [0.8, 0.06, 's'], [1.1, -0.04, 's'], [1.6, 0]],
      by: [[0, 0], [0.22, 0.08, 'o'], [0.5, -0.07, 's'], [0.8, 0.06, 's'], [1.1, -0.03, 's'], [1.6, 0]],
      bh: [[0, 0], [0.22, 0.012], [0.36, 0], [0.5, 0.012], [0.65, 0], [0.8, 0.01], [0.95, 0], [1.6, 0]],
      hx: [[0, 0], [0.25, 0.16, 'o'], [1.2, 0.14], [1.6, 0]],
      hz: [[0, 0], [0.25, 0.12], [0.8, -0.1], [1.6, 0]],
      wL: [[0, 0], [0.25, 0.85, 'o'], [1.25, 0.8], [1.6, 0]],
      wR: [[0, 0], [0.25, 0.85, 'o'], [1.25, 0.8], [1.6, 0]],
      fSad: [[0, 0], [0.25, 0.4, 'o'], [1.2, 0.35], [1.6, 0]],
      fHappy: [[0, 0], [0.25, 0.25, 'o'], [1.2, 0.2], [1.6, 0]],
    },
    arms: { L: { r: 0.16, f: 0.4, b: 1.3, t: -1.1 }, R: { r: 0.16, f: 0.4, b: 1.3, t: -1.1 } },
  },
  // attention: a quick stretch up, chest out, chin up, as if called by name
  perk: {
    dur: 0.9,
    peak: 0.16,
    ch: {
      bs: [[0, 0], [0.16, 0.08, 'o'], [0.3, -0.02], [0.45, 0.02], [0.9, 0]],
      bh: [[0, 0], [0.16, 0.025, 'o'], [0.32, 0, 'i'], [0.9, 0]],
      cx: [[0, 0], [0.16, -0.1, 'o'], [0.6, -0.08], [0.9, 0]],
      hx: [[0, 0], [0.16, -0.14, 'o'], [0.6, -0.1], [0.9, 0]],
      shL: [[0, 0], [0.16, 0.16, 'o'], [0.4, 0.04], [0.9, 0]],
      shR: [[0, 0], [0.16, 0.16, 'o'], [0.4, 0.04], [0.9, 0]],
      fOh: [[0, 0], [0.16, 0.5, 'o'], [0.4, 0.2], [0.7, 0]],
    },
  },
  // a smaller let-down than the slump: shoulders and head fall, a sigh, back up slowly
  deflate: {
    dur: 1.9,
    peak: 0.4,
    ch: {
      bs: [[0, 0], [0.4, -0.1, 'o'], [1.4, -0.085], [1.9, 0]],
      bp: [[0, 0], [0.4, 0.04, 'o'], [1.4, 0.035], [1.9, 0]],
      cx: [[0, 0], [0.4, 0.16, 'o'], [1.4, 0.14], [1.9, 0]],
      hx: [[0, 0], [0.4, 0.14, 'o'], [1.4, 0.13], [1.9, 0]],
      hz: [[0, 0], [0.4, -0.26, 'o'], [1.4, -0.24], [1.9, 0]],
      shL: [[0, 0], [0.4, -0.28, 'o'], [1.4, -0.25], [1.9, 0]],
      shR: [[0, 0], [0.4, -0.28, 'o'], [1.4, -0.25], [1.9, 0]],
      wL: [[0, 0], [0.4, 0.7, 'o'], [1.4, 0.65], [1.9, 0]],
      wR: [[0, 0], [0.4, 0.7, 'o'], [1.4, 0.65], [1.9, 0]],
      fSad: [[0, 0], [0.4, 1, 'o'], [1.5, 0.95], [1.9, 0]],
    },
    arms: { L: { r: 0.02, f: 0.06, b: 0.05 }, R: { r: 0.02, f: 0.06, b: 0.05 } },
  },
  // curious: the head tips over, held, comes back
  tilt: {
    dur: 1.3,
    peak: 0.25,
    ch: {
      hz: [[0, 0], [0.25, 0.34, 'o'], [0.95, 0.32], [1.3, 0]],
      hx: [[0, 0], [0.25, -0.06, 'o'], [0.95, -0.05], [1.3, 0]],
      br: [[0, 0], [0.25, 0.04, 'o'], [0.95, 0.035], [1.3, 0]],
      fOh: [[0, 0], [0.25, 0.25, 'o'], [0.9, 0.2], [1.2, 0]],
    },
  },
  // no: three quick shakes, the last smallest
  headshake: {
    dur: 1.0,
    peak: 0.15,
    ch: {
      hy: [[0, 0], [0.15, 0.3, 'o'], [0.32, -0.3, 'o'], [0.5, 0.22, 'o'], [0.66, -0.12, 'o'], [1.0, 0]],
      hx: [[0, 0], [0.15, 0.08], [0.8, 0.06], [1.0, 0]],
      fSad: [[0, 0], [0.15, 0.4, 'o'], [0.8, 0.35], [1.0, 0]],
    },
  },
  // a showman's sweep of one arm toward whoever they are talking to
  flourish: {
    dur: 1.4,
    peak: 0.4,
    ch: {
      bs: [[0, 0], [0.18, -0.03, 'i'], [0.4, 0.04, 'o'], [1.0, 0.03], [1.4, 0]],
      bp: [[0, 0], [0.4, 0.06, 'o'], [1.0, 0.05], [1.4, 0]],
      by: [[0, 0], [0.18, -0.06, 'i'], [0.4, 0.1, 'o'], [1.0, 0.08], [1.4, 0]],
      hz: [[0, 0], [0.4, 0.14, 'o'], [1.0, 0.12], [1.4, 0]],
      wR: [[0, 0], [0.18, 0.3, 'i'], [0.4, 1, 'o'], [1.0, 0.95], [1.4, 0]],
      fHappy: [[0, 0], [0.4, 0.7, 'o'], [1.1, 0.6], [1.4, 0]],
    },
    arms: { R: { r: 1.25, f: 0.75, b: 0.35, t: 0.9 } },
  },
  // bored: sinks back, head tipped right back to the ceiling (about 30 degrees), lids half down
  leanback: {
    dur: 3.0,
    peak: 0.5,
    ch: {
      bp: [[0, 0], [0.5, -0.2, 'o'], [2.5, -0.19], [3.0, 0]],
      cx: [[0, 0], [0.5, -0.2, 'o'], [2.5, -0.18], [3.0, 0]],
      hx: [[0, 0], [0.5, -0.42, 'o'], [2.5, -0.4], [3.0, 0]],
      hz: [[0, 0], [0.5, -0.18, 'o'], [2.5, -0.16], [3.0, 0]],
      shL: [[0, 0], [0.5, -0.12], [2.5, -0.12], [3.0, 0]],
      shR: [[0, 0], [0.5, -0.12], [2.5, -0.12], [3.0, 0]],
      fRelaxed: [[0, 0], [0.5, 1, 'o'], [2.6, 1], [3.0, 0]],
      fBlink: [[0, 0], [0.5, 0.62, 'o'], [2.5, 0.6], [3.0, 0]],
    },
  },
  // a happy little two-footed hop
  hop: {
    dur: 0.9,
    peak: 0.24,
    ch: {
      bs: [[0, 0], [0.1, -0.12, 'i'], [0.22, 0.13, 'o'], [0.42, 0], [0.52, -0.09, 'o'], [0.68, 0.02], [0.9, 0]],
      bh: [[0, 0], [0.1, -0.015, 'i'], [0.26, 0.1, 'o'], [0.48, 0, 'i'], [0.9, 0]],
      hx: [[0, 0], [0.22, -0.16, 'o'], [0.65, -0.08], [0.9, 0]],
      fHappy: [[0, 0], [0.2, 1, 'o'], [0.75, 1], [0.9, 0]],
    },
  },
  // the salesman's point: arm out at the target, a little lean, held
  point: {
    dur: 1.3,
    peak: 0.25,
    ch: {
      bp: [[0, 0], [0.1, -0.02, 'i'], [0.25, 0.08, 'o'], [0.95, 0.07], [1.3, 0]],
      by: [[0, 0], [0.25, 0.08, 'o'], [0.95, 0.07], [1.3, 0]],
      hz: [[0, 0], [0.25, 0.1, 'o'], [0.95, 0.09], [1.3, 0]],
      bs: [[0, 0], [0.1, -0.03, 'i'], [0.25, 0.03, 'o'], [1.3, 0]],
      wR: [[0, 0], [0.1, 0.2, 'i'], [0.25, 1, 'o'], [0.95, 1], [1.3, 0]],
      fHappy: [[0, 0], [0.25, 0.6, 'o'], [1.0, 0.5], [1.3, 0]],
    },
    arms: { R: { r: 1.3, f: 1.15, b: 0.1, t: 0.2 } },
  },
  // a nervous swallow: a frozen stare, a quick dip, eyes wide
  gulp: {
    dur: 1.1,
    peak: 0.35,
    ch: {
      bs: [[0, 0], [0.2, 0.03], [0.35, -0.05, 'o'], [0.5, 0.01], [1.1, 0]],
      hx: [[0, 0], [0.2, -0.04], [0.35, 0.12, 'o'], [0.5, 0.02], [1.1, 0]],
      shL: [[0, 0], [0.2, 0.18, 'o'], [0.8, 0.15], [1.1, 0]],
      shR: [[0, 0], [0.2, 0.18, 'o'], [0.8, 0.15], [1.1, 0]],
      fOh: [[0, 0], [0.2, 0.35, 'o'], [0.8, 0.3], [1.1, 0]],
      fSad: [[0, 0], [0.35, 0.45, 'o'], [0.9, 0.4], [1.1, 0]],
    },
  },
};

/** the stance families and the booth posture: a held layer under the gestures */
export const POSE_DEFS: Record<Exclude<PoseName, 'none'>, { ch: Partial<Record<Ch, number>>; arms?: { L?: ArmPose; R?: ArmPose }; armW?: number }> = {
  // hands behind the back: polite, waiting (the support bot, the concierge)
  behind: { ch: { cx: -0.03, hx: -0.02 }, arms: { L: { r: 0.12, f: -0.5, b: 1.25, t: -1.35 }, R: { r: 0.12, f: -0.5, b: 1.25, t: -1.35 } }, armW: 0.9 },
  // hands on hips: the coach, the prince
  hips: { ch: { cx: -0.05, hx: -0.04, sz: 0.03 }, arms: { L: { r: 0.62, f: -0.2, b: 1.85, t: -1.25 }, R: { r: 0.62, f: -0.2, b: 1.85, t: -1.25 } }, armW: 0.9 },
  // hands clasped low in front: keen, a little shy
  clasp: { ch: { hx: 0.04 }, arms: { L: { r: 0.14, f: 0.38, b: 1.2, t: -1.15 }, R: { r: 0.14, f: 0.38, b: 1.2, t: -1.15 } }, armW: 0.85 },
  // arms folded (procedural; bodies with the clip use the clip instead)
  fold: { ch: { cx: -0.03, hx: -0.03 }, arms: { L: { r: 0.25, f: 0.55, b: 2.05, t: -1.45 }, R: { r: 0.25, f: 0.6, b: 2.0, t: -1.45 } }, armW: 0.9 },
  // the booth: smaller and more honest; rounded over, hands together, head a little down
  booth: { ch: { sx: 0.1, cx: 0.06, hx: -0.04, shL: 0.12, shR: 0.12, bs: -0.02 }, arms: { L: { r: 0.12, f: 0.45, b: 1.35, t: -1.2 }, R: { r: 0.12, f: 0.45, b: 1.35, t: -1.2 } }, armW: 0.9 },
  // proud: chest out, chin up
  proud: { ch: { cx: -0.1, hx: -0.1, bs: 0.02 } },
  // slouch: weight dropped, head down a little
  slouch: { ch: { sx: 0.06, cx: 0.08, hx: 0.1, sz: -0.04, shL: -0.06, shR: -0.06 } },
};

/** the held slump posture, as the end state of the slump gesture */
const SLUMP_POSE: Partial<Record<Ch, number>> = { bs: -0.11, bh: -0.025, bp: 0.03, br: 0.05, cx: 0.16, hx: 0.1, hz: 0.22, shL: -0.26, shR: -0.26, fSad: 0.9 };
const SLUMP_ARMS: ArmPose = { r: 0.02, f: 0.1, b: 0.05 };

const BODY_CH = new Set<Ch>(['bp', 'br', 'by', 'bh', 'bs']);

// ---------------------------------------------------------------------------------------------
// talk: syllables from text
type Syl = { t0: number; t1: number; vis: Viseme; amp: number };
type Viseme = 'aa' | 'ih' | 'ou' | 'ee' | 'oh';
const VISEMES: Viseme[] = ['aa', 'ih', 'ou', 'ee', 'oh'];
const VOWEL_VIS: Record<string, Viseme> = { a: 'aa', e: 'ee', i: 'ih', y: 'ih', o: 'oh', u: 'ou' };
const VIS_OPEN: Record<Viseme, number> = { aa: 1, oh: 0.9, ou: 0.75, ee: 0.7, ih: 0.6 };

export function syllables(text: string | undefined, seconds: number, rng: () => number): Syl[] {
  type Unit = { w: number; vis?: Viseme; amp?: number };
  const units: Unit[] = [];
  if (text && text.trim()) {
    const tokens = text.toLowerCase().match(/[a-z']+|[.,!?;:]/g) ?? [];
    for (const tok of tokens) {
      if (/^[.!?]$/.test(tok)) { units.push({ w: 2.2 }); continue; }
      if (/^[,;:]$/.test(tok)) { units.push({ w: 1.2 }); continue; }
      const groups = tok.match(/[aeiouy]+/g) ?? ['a'];
      // silent final e
      if (groups.length > 1 && /[^aeiouy]e$/.test(tok)) groups.pop();
      groups.forEach((g, i) => units.push({ w: 1, vis: VOWEL_VIS[g[0]!] ?? 'aa', amp: i === 0 ? 1 : 0.8 }));
      units.push({ w: 0.25 }); // word gap
    }
  } else {
    const n = Math.max(1, Math.round(seconds * 5.2));
    for (let i = 0; i < n; i++) {
      units.push({ w: 1, vis: VISEMES[Math.floor(rng() * VISEMES.length)]!, amp: 0.7 + rng() * 0.3 });
      if (rng() < 0.25) units.push({ w: 0.6 });
    }
  }
  const total = units.reduce((s, u) => s + u.w, 0) || 1;
  const k = seconds / total;
  const out: Syl[] = [];
  let t = 0;
  for (const u of units) {
    const d = u.w * k;
    if (u.vis) out.push({ t0: t, t1: t + d, vis: u.vis, amp: u.amp ?? 1 });
    t += d;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _qu = new THREE.Quaternion();
const _ql = new THREE.Quaternion();
const _qsh = new THREE.Quaternion();
const IDENT = new THREE.Quaternion();
const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Y = new THREE.Vector3(0, 1, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

type Spring = { x: number; v: number };
const spring = (s: Spring, target: number, k: number, zeta: number, dt: number) => {
  // semi-implicit Euler, sub-stepped for stability at low frame rates
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  const c = 2 * zeta * Math.sqrt(k);
  for (let i = 0; i < n; i++) {
    s.v += (k * (target - s.x) - c * s.v) * h;
    s.x += s.v * h;
  }
  return s.x;
};
const damp = (a: number, b: number, rate: number, dt: number) => b + (a - b) * Math.exp(-rate * dt);

export interface PuppetState {
  walking: boolean;
  sitting: boolean;
  /** true when no clip drives the arms (the procedural idle) */
  proceduralArms: boolean;
}

export class Puppet {
  readonly vrm: VRM;
  readonly style: CharacterStyle;
  /** whole-body pivot at the feet (lean, hop, squash) */
  readonly body: THREE.Object3D;
  /** a drawn face (the toast, the visor), when the model's own face is folded away */
  private face: FaceCard | null;
  private height: number;
  private isV0: boolean;
  private bones: Partial<Record<VRMHumanBoneName, THREE.Object3D>> = {};
  private rng: () => number;

  // look-at
  private lookTarget: THREE.Vector3 | null = null;
  private headYaw: Spring = { x: 0, v: 0 };
  private headPitch: Spring = { x: 0, v: 0 };
  private chestYaw: Spring = { x: 0, v: 0 };

  // blink
  private blinkIn: number;
  private blinkT = -1;
  private blinkDouble = false;

  // talk
  private syl: Syl[] = [];
  private talkT = 0;
  private talkDur = 0;
  private mouth: Record<Viseme, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  private bob = 0;

  // mood
  private moodName: MoodName = 'neutral';
  private moodW: Record<Exclude<MoodName, 'neutral'>, number> = { happy: 0, angry: 0, sad: 0, relaxed: 0 };

  // gestures
  private gest: { def: GestureDef; name: GestureName; t: number; beat: number } | null = null;
  /** 0..1, the held beat before a reaction: idle motion (and the clip) freezes */
  stillness = 0; //, the held beat before a reaction: idle motion freezes
  private slump = 0;
  private slumpHeld = false;
  private slumpDelay = 0;

  private phase: number;
  private ch: Partial<Record<Ch, number>> = {};

  // held pose layer
  private poseName: PoseName = 'none';
  private poseW: Partial<Record<Exclude<PoseName, 'none'>, number>> = {};
  /** 0..1: the held pause; breathing only, every other idle motion (and the clip) slows to a stop */
  freeze = 0;
  private freezeTarget = 0;
  /** the last look direction (character frame), for blinking on big head turns */
  private lastLookYaw = 0;
  private lastLookPitch = 0;
  private blinkCool = 0;

  constructor(actor: VrmActor, body: THREE.Object3D, rng: () => number = Math.random) {
    this.vrm = actor.vrm;
    this.style = actor.style;
    this.body = body;
    this.face = actor.face;
    this.height = actor.height * actor.scale;
    this.isV0 = actor.vrm.meta?.metaVersion === '0';
    this.rng = rng;
    this.phase = rng() * 100;
    this.blinkIn = 1 + rng() * 3;
    const names: VRMHumanBoneName[] = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand'];
    for (const n of names) {
      const b = this.vrm.humanoid.getNormalizedBoneNode(n);
      if (b) this.bones[n] = b;
    }
  }

  // ---- commands -------------------------------------------------------------------------
  lookAt(target: THREE.Vector3 | null) {
    this.lookTarget = target ? (this.lookTarget ?? new THREE.Vector3()).copy(target) : null;
  }

  talk(ms: number, text?: string) {
    this.talkDur = Math.max(0.2, ms / 1000);
    this.talkT = 0;
    this.syl = syllables(text, this.talkDur, this.rng);
  }

  get talking() {
    return this.talkT < this.talkDur;
  }

  mood(name: MoodName) {
    this.moodName = name;
  }

  /** a held stance under the gestures ('none' releases it) */
  setPose(name: PoseName) {
    this.poseName = name;
  }

  /** -1..1: how the night is going; a lasting layer (chest out and chin up, or shrinking) */
  setConfidence(x: number) {
    this.confTarget = Math.max(-1, Math.min(1, x));
  }
  private confTarget = 0;
  private conf = 0;

  /** the held pause: 1 = frozen but breathing */
  setFreeze(x: number) {
    this.freezeTarget = Math.max(0, Math.min(1, x));
  }

  /** a blink now (a head turn, a surprise) */
  blink() {
    if (this.blinkT < 0) this.blinkIn = 0;
  }

  /** play a gesture after a held beat (seconds of stillness first; the comic pause) */
  gesture(name: GestureName, beat = 0.14) {
    const def = GESTURE_DEFS[name];
    if (!def) return;
    this.gest = { def, name, t: -beat, beat };
  }

  get gesturing() {
    return !!this.gest;
  }

  setSlump(on: boolean) {
    if (on && !this.slumpHeld) this.slumpDelay = 0.25;
    this.slumpHeld = on;
  }

  // ---- per frame ------------------------------------------------------------------------
  update(dt: number, root: THREE.Object3D, state: PuppetState) {
    const s = this.style;
    this.phase += dt * s.tempo;
    const ch = this.ch;
    for (const k in ch) ch[k as Ch] = 0;
    const add = (k: Ch, v: number) => (ch[k] = (ch[k] ?? 0) + v);

    // gesture: the held beat (stillness), then the keyed curves
    let gestureStill = 0;
    if (this.gest) {
      const g = this.gest;
      g.t += dt;
      if (g.t < 0) gestureStill = 1;
      else {
        for (const [k, keys] of Object.entries(g.def.ch) as [Ch, Key[]][]) {
          const amp = BODY_CH.has(k) ? s.body : k.startsWith('f') || k === 'wL' || k === 'wR' ? 1 : Math.max(0.85, s.gesture);
          add(k, sample(keys, g.t) * amp);
        }
        // idle motion stays quiet through the hold, comes back in the settle
        gestureStill = g.t < g.def.dur * 0.8 ? 0.85 : 0.85 * (1 - (g.t - g.def.dur * 0.8) / (g.def.dur * 0.2));
        if (g.t >= g.def.dur) this.gest = null;
      }
    }
    this.freeze = damp(this.freeze, this.freezeTarget, 4, dt);
    this.stillness = damp(this.stillness, Math.max(gestureStill, this.freeze * 0.9), gestureStill > this.stillness ? 25 : 6, dt);
    const idleAmp = s.energy * (1 - this.stillness) * (state.walking ? 0.3 : 1);

    // held pose layer (stance family, booth)
    for (const k of Object.keys(POSE_DEFS) as Exclude<PoseName, 'none'>[]) {
      const w = damp(this.poseW[k] ?? 0, this.poseName === k ? 1 : 0, 5, dt);
      this.poseW[k] = w;
      if (w < 0.002) continue;
      for (const [c, v] of Object.entries(POSE_DEFS[k].ch) as [Ch, number][]) add(c, v * w * (BODY_CH.has(c) ? s.body : s.gesture));
    }

    // held slump posture (after a cut)
    if (this.slumpDelay > 0) this.slumpDelay -= dt;
    const slumpTarget = this.slumpHeld && this.slumpDelay <= 0 ? 1 : 0;
    this.slump = damp(this.slump, slumpTarget, slumpTarget > this.slump ? 7 : 3, dt);
    if (this.slump > 0.001) for (const [k, v] of Object.entries(SLUMP_POSE) as [Ch, number][]) add(k, v * this.slump * (BODY_CH.has(k) ? s.body : k.startsWith('f') ? 1 : s.gesture));

    // breathing: chest rise, shoulders, a hint of stretch; slower and deeper for stately bodies.
    // It survives the held pause (frozen but breathing), a little deeper.
    const br = Math.sin(this.phase * 1.55);
    const breathAmp = idleAmp + this.freeze * 0.5;
    add('cx', -br * 0.028 * breathAmp);
    add('bs', (br * 0.5 + 0.5) * 0.008 * this.freeze);
    add('shL', br * 0.03 * breathAmp);
    add('shR', br * 0.03 * breathAmp);
    add('bs', (br * 0.5 + 0.5) * 0.012 * (0.4 + idleAmp));
    // a slow weight shift
    add('sz', Math.sin(this.phase * 0.43) * 0.025 * idleAmp);
    add('hz', Math.sin(this.phase * 0.31 + 1) * 0.04 * idleAmp);
    // bounce: the springy ones bob on a beat, squashing at the bottom
    if (s.bounce > 0 && !state.sitting && !state.walking) {
      const b = Math.abs(Math.sin(this.phase * 3.4));
      add('bh', b * 0.018 * s.bounce * (1 - this.stillness));
      add('bs', (b - 0.5) * 0.05 * s.bounce * (1 - this.stillness));
    }
    // confidence: the ranking, on the body
    this.conf = damp(this.conf, this.confTarget, 1.5, dt);
    if (!state.sitting && Math.abs(this.conf) > 0.002) {
      const up = Math.max(0, this.conf);
      const down = Math.max(0, -this.conf);
      add('cx', -0.12 * up + 0.14 * down);
      add('hx', -0.12 * up + 0.12 * down);
      add('shL', 0.06 * up - 0.14 * down);
      add('shR', 0.06 * up - 0.14 * down);
      add('bs', 0.03 * up - 0.04 * down);
    }
    // posture
    if (!state.sitting) add('sx', s.posture);
    if (!state.sitting) add('hx', -s.posture * 0.6);

    // mood: faces plus a little body
    // under 'neutral' each character keeps a resting face (the dog grins, the pig is smug)
    const restM = this.moodName === 'neutral' && s.rest !== 'neutral' ? s.rest : null;
    for (const m of ['happy', 'angry', 'sad', 'relaxed'] as const) {
      const target = this.moodName === m ? 1 : restM === m ? s.restWeight : 0;
      this.moodW[m] = damp(this.moodW[m], target, 12, dt);
    }
    // the body carries what a small face cannot: sad hangs the head, happy lifts the chin and tips
    // the head, angry squares the shoulders, relaxed (bored, smug) tips the head back
    // (sad hangs the head only so far: the face must stay in view, the body carries the rest)
    add('hx', this.moodW.sad * 0.12 - this.moodW.happy * 0.12 - this.moodW.relaxed * 0.08 + this.moodW.angry * 0.1);
    add('cx', this.moodW.sad * 0.1 + this.moodW.angry * 0.08 - this.moodW.happy * 0.07);
    add('hz', this.moodW.relaxed * 0.14 + this.moodW.happy * 0.14 - this.moodW.sad * 0.12);
    add('shL', this.moodW.angry * 0.18 - this.moodW.sad * 0.16);
    add('shR', this.moodW.angry * 0.18 - this.moodW.sad * 0.16);
    add('bs', this.moodW.happy * 0.03 - this.moodW.sad * 0.045);

    // talking: syllable mouth shapes and a small bob that lands on each syllable
    let bobTarget = 0;
    const want: Record<Viseme, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    if (this.talkT < this.talkDur) {
      this.talkT += dt;
      const t = this.talkT;
      for (const sy of this.syl) {
        if (t < sy.t0 || t > sy.t1) continue;
        const u = (t - sy.t0) / Math.max(0.03, sy.t1 - sy.t0);
        const env = u < 0.3 ? u / 0.3 : u > 0.75 ? Math.max(0, (1 - u) / 0.25) : 1;
        want[sy.vis] = Math.max(want[sy.vis], env * sy.amp * VIS_OPEN[sy.vis]);
        bobTarget = Math.max(bobTarget, (u < 0.4 ? u / 0.4 : Math.max(0, 1 - (u - 0.4) / 0.6)) * sy.amp);
        break;
      }
    }
    for (const v of VISEMES) this.mouth[v] = damp(this.mouth[v], want[v], 28, dt);
    this.bob = damp(this.bob, bobTarget, 18, dt);
    const talkAmp = 0.35 + 0.65 * s.energy;
    add('hx', -this.bob * 0.06 * talkAmp);
    add('nx', -this.bob * 0.02 * talkAmp);
    add('bs', this.bob * 0.012 * talkAmp);

    // look-at: head leads with a little overshoot, the chest follows later
    let wantYaw = 0, wantPitch = 0;
    if (this.lookTarget) {
      const head = this.bones.head!;
      root.updateWorldMatrix(true, false);
      const local = root.worldToLocal(_v.copy(this.lookTarget));
      _m.copy(root.matrixWorld).invert();
      const hp = head.getWorldPosition(new THREE.Vector3()).applyMatrix4(_m);
      local.sub(hp);
      wantYaw = Math.max(-1.2, Math.min(1.2, Math.atan2(local.x, local.z)));
      wantPitch = Math.max(-0.35, Math.min(0.35, -Math.atan2(local.y, Math.hypot(local.x, local.z))));
    }
    // a big change of gaze comes with a blink (the way people and cartoons turn their heads)
    this.blinkCool -= dt;
    if (Math.abs(wantYaw - this.lastLookYaw) + Math.abs(wantPitch - this.lastLookPitch) > 0.45 && this.blinkCool <= 0) {
      this.blink();
      this.blinkCool = 0.9;
    }
    this.lastLookYaw = wantYaw;
    this.lastLookPitch = wantPitch;
    const headShare = s.head;
    const stiff = s.head < 0.4;
    spring(this.headYaw, wantYaw * headShare, stiff ? 70 : 110, stiff ? 0.75 : 0.5, dt);
    spring(this.headPitch, wantPitch * 0.85, 90, 0.6, dt);
    spring(this.chestYaw, wantYaw * (1 - headShare), stiff ? 40 : 22, 0.85, dt);
    add('hy', this.headYaw.x);
    add('hx', this.headPitch.x);
    add('cy', this.chestYaw.x * 0.6);
    add('by', this.chestYaw.x * 0.4);

    // layers stack (a held slump, a let-down, a sad mood, a look down at someone short): past these
    // the face turns to the floor and the character reads as a mop of hair, so the sum is capped
    const cap = (k: Ch, lo: number, hi: number) => (ch[k] = Math.max(lo, Math.min(hi, ch[k] ?? 0)));
    cap('hx', -0.55, 0.22);
    cap('cx', -0.3, 0.2);
    cap('sx', -0.2, 0.2);
    cap('bp', -0.3, 0.24);

    // procedural arms (no clip on the arms): hang them from the T-pose
    this.applyBones(state);
    this.applyArms(state);
    this.applyBody(state);
    this.applyFace(dt);
  }

  private rotPre(bone: VRMHumanBoneName, x: number, y: number, z: number) {
    const b = this.bones[bone];
    if (!b || (x === 0 && y === 0 && z === 0)) return;
    _q.setFromEuler(_e.set(x, y, z, 'YXZ'));
    if (this.isV0) { _q.x = -_q.x; _q.z = -_q.z; }
    b.quaternion.premultiply(_q);
  }

  private applyBones(state: PuppetState) {
    const c = this.ch;
    const g = (k: Ch) => c[k] ?? 0;
    // rigid bodies keep only a little of the clip's hip and spine sway
    const hip = this.style.hipsAmp;
    if (hip < 1) for (const n of ['hips', 'spine', 'chest'] as const) this.bones[n]?.quaternion.slerp(IDENT, 1 - hip);
    const sit = state.sitting ? 0.6 : 1;
    this.rotPre('spine', g('sx') * sit, 0, g('sz'));
    const chest = this.bones.upperChest ? 'upperChest' : 'chest';
    this.rotPre('chest', g('cx') * 0.5, g('cy') * 0.5, g('cz') * 0.5);
    this.rotPre(chest, g('cx') * 0.5, g('cy') * 0.5, g('cz') * 0.5);
    const ha = this.style.headAmp;
    this.rotPre('neck', (g('nx') + g('hx') * 0.35) * ha, g('hy') * 0.4, g('hz') * 0.3 * ha);
    this.rotPre('head', g('hx') * 0.65 * ha, g('hy') * 0.6, g('hz') * 0.7 * ha);
    this.rotPre('leftShoulder', 0, 0, g('shL') * 0.6);
    this.rotPre('rightShoulder', 0, 0, -g('shR') * 0.6);
  }

  /** a target local rotation for an upper arm / forearm, character frame -> normalized bone */
  private armQ(side: 1 | -1, p: ArmPose, upper: THREE.Quaternion, lower: THREE.Quaternion) {
    // hang the T-pose arm down, raise it by r, twist it by t, swing it forward by f
    const qz = _q2.setFromAxisAngle(AX_Z, side * (-Math.PI / 2 + p.r));
    const qt = _q3.setFromAxisAngle(AX_X, -(p.t ?? 0));
    const qf = upper.setFromAxisAngle(AX_X, -p.f);
    upper.multiply(qz).multiply(qt);
    lower.setFromAxisAngle(AX_Y, -side * p.b);
    if (this.isV0) {
      upper.x = -upper.x; upper.z = -upper.z;
      lower.x = -lower.x; lower.z = -lower.z;
    }
    void qf;
  }

  private blendArm(side: 1 | -1, p: ArmPose, w: number) {
    if (w <= 0.001) return;
    const up = this.bones[side === 1 ? 'leftUpperArm' : 'rightUpperArm'];
    const lo = this.bones[side === 1 ? 'leftLowerArm' : 'rightLowerArm'];
    this.armQ(side, p, _qu, _ql);
    // the pose is meant relative to the chest: undo whatever the clip did to the shoulder (clavicle),
    // or a clip that rolls the shoulders throws the hands somewhere else entirely
    const sh = this.bones[side === 1 ? 'leftShoulder' : 'rightShoulder'];
    if (sh) _qu.premultiply(_qsh.copy(sh.quaternion).invert());
    w = Math.min(1, w);
    up?.quaternion.slerp(_qu, w);
    lo?.quaternion.slerp(_ql, w);
  }

  private applyArms(state: PuppetState) {
    const s = this.style;
    // the procedural idle: arms hang a little out from the body
    if (state.proceduralArms) {
      const idle: ArmPose = { r: s.armRaise, f: 0.06, b: 0.25 };
      this.blendArm(1, idle, 1);
      this.blendArm(-1, idle, 1);
    }
    for (const k of Object.keys(POSE_DEFS) as Exclude<PoseName, 'none'>[]) {
      const w = this.poseW[k] ?? 0;
      const def = POSE_DEFS[k];
      if (w < 0.002 || !def.arms) continue;
      const lift = (p: ArmPose): ArmPose => ({ ...p, r: Math.max(p.r, s.armRaise) });
      const ww = w * (def.armW ?? 1) * (state.walking ? 0.3 : 1);
      if (def.arms.L) this.blendArm(1, lift(def.arms.L), ww);
      if (def.arms.R) this.blendArm(-1, lift(def.arms.R), ww);
    }
    if (this.slump > 0.001) {
      this.blendArm(1, { ...SLUMP_ARMS, r: Math.max(SLUMP_ARMS.r, s.armRaise * 0.6) }, this.slump * 0.75);
      this.blendArm(-1, { ...SLUMP_ARMS, r: Math.max(SLUMP_ARMS.r, s.armRaise * 0.6) }, this.slump * 0.75);
    }
    const g = this.gest;
    if (g && g.t >= 0 && g.def.arms) {
      const c = this.ch;
      const lift = (p: ArmPose): ArmPose => ({ ...p, r: Math.max(p.r, s.armRaise) });
      if (g.def.arms.L) this.blendArm(1, lift(g.def.arms.L), c.wL ?? 0);
      if (g.def.arms.R) this.blendArm(-1, lift(g.def.arms.R), c.wR ?? 0);
    }
    // a shrug or a breath lifts the arm with the shoulder
    this.rotPre('leftUpperArm', 0, 0, (this.ch.shL ?? 0) * 0.3);
    this.rotPre('rightUpperArm', 0, 0, -(this.ch.shR ?? 0) * 0.3);
  }

  private applyBody(state: PuppetState) {
    const c = this.ch;
    const g = (k: Ch) => c[k] ?? 0;
    const sq = Math.max(-0.25, Math.min(0.25, g('bs')));
    const sit = state.sitting ? 0.5 : 1;
    this.body.rotation.set(g('bp') * sit, g('by'), -g('br') * sit, 'YXZ');
    this.body.position.y = g('bh') * this.height * sit;
    this.body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
  }

  private applyFace(dt: number) {
    const c = this.ch;
    const g = (k: Ch) => Math.max(0, Math.min(1, c[k] ?? 0));
    const happy = Math.max(this.moodW.happy, g('fHappy'));
    const angry = Math.max(this.moodW.angry, g('fAngry'));
    const sad = Math.max(this.moodW.sad, g('fSad'));
    const relaxed = Math.max(this.moodW.relaxed, g('fRelaxed'));

    // blink on a random timer (sometimes twice); happy faces already have their eyes closed
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.blinkDouble = this.rng() < 0.18;
    }
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const d = 0.16;
      const u = this.blinkT / d;
      blink = u < 0.35 ? u / 0.35 : Math.max(0, 1 - (u - 0.35) / 0.65);
      if (this.blinkT >= d) {
        if (this.blinkDouble) { this.blinkDouble = false; this.blinkT = -1; this.blinkIn = 0.09; }
        else { this.blinkT = -1; this.blinkIn = 1.6 + this.rng() * 3.6; }
      }
    }
    // the held beat before a reaction: eyes stay open (the stare)
    if (this.stillness > 0.5 && !this.gest?.def.ch.fBlink) blink = 0;

    if (this.face) {
      this.face.set(this.pickEyes(happy, angry, sad, relaxed, Math.max(blink, g('fBlink')), g), this.pickMouth(happy, angry, sad, relaxed, g));
      return;
    }

    const em = this.vrm.expressionManager;
    if (!em) return;
    const skip = this.style.skipFaces;
    const face = (name: string, v: number) => em.setValue(name, skip.includes(name) ? 0 : v);
    face('happy', happy);
    face('angry', angry * (1 - happy));
    face('sad', sad * (1 - happy));
    face('relaxed', relaxed * (1 - happy) * (1 - sad));
    // mouth: visemes, plus a gesture's mouth shape; a bored drawl barely opens the mouth
    const mouthScale = this.style.mouth * (1 - 0.4 * happy) * (1 - 0.6 * g('fRelaxed'));
    em.setValue('aa', Math.min(1, this.mouth.aa * mouthScale + g('fAa')));
    em.setValue('ih', this.mouth.ih * mouthScale);
    em.setValue('ou', this.mouth.ou * mouthScale);
    em.setValue('ee', Math.min(1, this.mouth.ee * mouthScale + g('fEe')));
    em.setValue('oh', Math.min(1, this.mouth.oh * mouthScale + g('fOh')));
    // lids: a relaxed face (bored, smug, the heavy-lidded diva) carries them half down
    const lid = Math.max(blink, g('fBlink'), relaxed * 0.42);
    em.setValue('blink', Math.min(1, lid) * (1 - happy));
  }

  /** the drawn eyes: one drawing per state, swapped, never tweened */
  private pickEyes(happy: number, angry: number, sad: number, relaxed: number, blink: number, g: (k: Ch) => number): EyeState {
    if (g('fBlink') > 0.6 && g('fAngry') > 0.3) return 'squeeze';
    if (blink > 0.6) return relaxed > 0.4 ? 'relief' : happy > 0.5 ? 'happy' : 'blink';
    if (g('fOh') > 0.35) return 'wide';
    if (happy > 0.45) return relaxed > 0.6 && g('fHappy') < 0.6 ? 'bored' : 'happy';
    if (angry > 0.45) return g('fBlink') > 0.2 ? 'glare' : 'angry';
    if (sad > 0.4) return 'sad';
    if (relaxed > 0.45 || blink > 0.3) return 'bored';
    return 'open';
  }

  private pickMouth(happy: number, angry: number, sad: number, relaxed: number, g: (k: Ch) => number): MouthState {
    const m = this.mouth;
    const open = Math.max(m.aa, m.oh * 0.9, m.ou * 0.8, m.ee * 0.85, m.ih * 0.75);
    const round = m.oh + m.ou > m.aa + m.ee + m.ih;
    if (open > 0.5) return round ? 'oh' : happy > 0.45 ? 'grin' : 'talk2';
    if (open > 0.14) return round ? 'oh' : 'talk1';
    if (g('fOh') > 0.35) return 'oh';
    if (g('fEe') > 0.3 || (g('fSad') > 0.3 && g('fHappy') > 0.15)) return 'wavy';
    if (relaxed > 0.45 && g('fHappy') > 0.25) return 'smirk';
    if (happy > 0.7) return 'grin';
    if (happy > 0.35) return 'smile';
    if (sad > 0.4 || angry > 0.55) return 'frown';
    return this.face?.cfg.rest ?? 'flat';
  }

}
