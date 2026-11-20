// The Scrivener's pose table + keyframe tracks. Owner: tells. Reads sim state only.
//
// boss_draw.js (owner: art) draws a skeleton from the numbers returned by
// bossPose(b). This file decides WHAT the body does and WHEN: every attack has a
// multi-key anticipation (wind-up -> hold -> final commit flash), a snap strike
// and a readable, held punish pose that ends with a short "rising" beat.
//
// Pose params (angles in radians; shoulder 0 = arm hanging down, +PI/2 = forward,
// PI = straight up, > PI = up-and-behind, negative = behind):
//   crouch 0..1 (hip drop), lean (torso, + = forward), sh/el/blade (pen-blade arm),
//   bsh/bel (ledger arm), wings 0..1.4 spread, wrap 0..1, book (3 = writing),
//   bookOpen 0..1, head (+ = chin down), tremble 0..1 (strain shake), glint 0..1
//   (the final commit flash; glintAt = 'tip' | 'book' | 'head').
//
// Tracks: [u, poseKey, ease]. For tells u is a FRACTION of tell.ms; for active it is
// attack-local ms; for recovery it is a fraction of the recovery window. The ease on a
// key shapes the segment that ENDS at that key.

import { RIG, hunchOff } from './art/scrivener.js'; // rig mirror (owner: art)
import { clamp, lerp, easeOutCubic, easeInOut } from '../core/math.js';
import { ATTACKS } from '../sim/attacks.js';
import { BOSS, bossSpeed } from '../sim/boss.js';
import { INK, PAPER, RED, stroke } from './ink.js';
import { hashNoise } from '../core/rng.js';
import { dryBrushHalo } from './art/halo.js';

export const BASE = { crouch: 0.3, lean: 0.22, sh: -0.1, el: 2.1, blade: -0.45, bsh: 0.5, bel: 0.4, wings: 0.12, book: 0, bookOpen: 0, head: 0.1, float: 0, wrap: 0, tremble: 0, glint: 0, wingBack: 0, bookScale: 1, bladeW: 1.5, fold: 0, tuck: 0 };

// Silhouette rule (round 2): every wind-up changes the BIG shape, not just a limb.
//   quill_slash  LOW + WIDE, torso twisted away, the whole wing fan swept back with a
//                swollen white-edged blade raised behind the shoulder (a drawn bow).
//   ledger_slam  ONE TALL COLUMN: wings wrapped shut around the body, up on its toes,
//                a ledger 2.5-3x its normal size hoisted overhead.
//   ink_lunge    BIGGEST then FLATTEST: rears to full height with every wing flung open,
//                then drops into a low wedge aimed at you, wings flattened back like a dart.
// Extra pose params read by boss_draw.js: wingBack 0..1 (fan swept straight back),
// bookScale (ledger size multiplier), bladeW (blade width multiplier, white edge > 1.2).

export const POSES = {
  // Round 4 silhouette rule: during every wind-up the wing fan is FOLDED (wings 0, fold 1:
  // the quills close into one short black mass hanging down the back; art/scrivener.js
  // reads `fold`) so the weapon arm and the body line are the only big shapes. The wings
  // burst open on the strike and droop again in the punish window.
  //   quill_slash  a DIAGONAL: crouched and twisted away, the pen-blade cocked high and
  //                back over the shoulder, the empty hand reaching low toward you.
  //   ledger_slam  a VERTICAL column: wings shut, both arms up, a huge black book overhead.
  //   ink_lunge    a big X (rear up, everything flung wide), then a LOW HORIZONTAL wedge.
  // ---- Quill slash
  // round 6: the draw is a CONTINUOUS pull. Every 80 ms the blade arm has rotated
  // further back over the head and the body sunk lower and twisted further away
  // (lift -> overhead -> past the shoulder -> fully drawn), then it locks for the flash.
  // round 11: the draw is a TALL TWIST with ONE clean diagonal: the blade cocked high and
  // back over the shoulder at ~45 deg (never level behind: round 10's level draw read as the
  // arm reaching away), the empty ledger hand thrust out low at you as the aim. It is the
  // only wind-up whose weapon stands UP-and-BACK; the lunge's lance lies flat and forward.
  // round 14: the strip read six nearly identical held frames, then a cut to contact. The draw
  // is now a BUILD you can see every 80 ms: the arm comes up in front (lift), over the head
  // (high), past the shoulder (back), then pulled down behind it while the body sinks lower
  // each beat (wound): the blade raised in FRONT -> over the head -> up-and-back -> pulled
  // down behind at ~30 deg (never level: that is the lunge), hips 0.5 -> 1.06. sh only
  // INCREASES through the draw (1.9 -> 4.05) so the arm rotates up, over and back.
  quill_lift: { crouch: 0.5, lean: 0.08, sh: 1.9, el: 0.9, blade: -0.45, bsh: 1.25, bel: 0.35, wings: 0, fold: 1, head: 0.0, bladeW: 2.0 },
  quill_high: { crouch: 0.76, lean: -0.16, sh: 3.0, el: 1.0, blade: 0.3, bsh: 1.45, bel: 0.2, wings: 0, fold: 1, head: 0.12, tremble: 0.3, bladeW: 2.3 },
  quill_back: { crouch: 1.02, lean: -0.36, sh: 3.75, el: 0.25, blade: 0.2, bsh: 1.65, bel: 0.05, wings: 0, fold: 1, head: 0.24, tremble: 0.6, bladeW: 2.6 },
  quill_wound: { crouch: 1.3, lean: -0.62, sh: 4.05, el: 0.05, blade: 0.12, bsh: 1.85, bel: -0.12, wings: 0, fold: 1, head: 0.34, tremble: 1, bladeW: 2.9 },
  // strike (round 14): a real arc, each 40 ms a new place, the body ONE intact shape
  // (wings folded shut, the ledger arm swung back out of the way as the counterweight):
  //   0 ms drawn behind -> 30 crest (blade up over the head) -> 66 HALFWAY (arm and blade
  //   level at you, chest height) -> 98 contact: shoulder -> hand -> nib one straight line
  //   down to the floor at ~380 local px (x1.25 = the 470 px hitbox reach).
  quill_over: { crouch: 0.55, lean: 0.14, sh: 2.75, el: 1.0, blade: 0.1, bsh: 1.1, bel: 0.3, wings: 0, fold: 1, head: 0.05, bladeW: 2.8 },
  quill_half: { crouch: 0.62, lean: 0.4, sh: 1.5, el: 0.04, blade: 0.0, bsh: 0.1, bel: 0.5, wings: 0, fold: 1, head: 0.12, bladeW: 2.8 },
  quill_strike: { crouch: 0.72, lean: 0.55, sh: 0.93, el: 0.0, blade: 0.04, bsh: -0.55, bel: 0.6, wings: 0, fold: 1, head: 0.2, bladeW: 2.7 },
  quill_embed: { crouch: 0.8, lean: 0.58, sh: 0.9, el: 0.02, blade: 0.05, bsh: -0.65, bel: 0.7, wings: 0, fold: 1, head: 0.42, bladeW: 2.4 },
  quill_tug: { crouch: 0.74, lean: 0.5, sh: 0.98, el: 0.25, blade: -0.05, bsh: 0.3, bel: 0.6, wings: 0, fold: 0.9, head: 0.55, tremble: 0.6, bladeW: 2.1 },
  quill_rip: { crouch: 0.3, lean: 0.1, sh: 2.2, el: 0.6, blade: 0.4, bsh: 0.2, bel: 1.0, wings: 0.1, fold: 0.6, head: 0.1, bladeW: 1.8 },

  // ---- Ledger slam: a tall closed column, huge book thrown up, folded behind the head,
  // re-extended overhead, then smashed down while the wings burst open.
  // round 6: each beat higher / heavier: lift to the chest -> straight up -> folded behind the
  // skull -> re-extended on its toes, arched back, the book swelling, then locked for the flash.
  // round 7: the ledger wind-up is a VERTICAL axis, centred over the skull (round 6 drew the
  // book up and BEHIND, to the upper right like the quill's draw; the critic could not tell
  // them apart). Both arms go straight up, the book is held dead over the head, the body
  // stretches up onto its toes, dips once (arms bend, book sinks onto the skull) and then
  // re-extends higher than before while the book swells: a tall narrow column.
  // round 14: the wind-up is a BUILD, one new beat every ~90 ms, never a held pose: the book
  // comes up to the face (lift), over the skull (hoist), then is pushed further BACK behind the
  // head and LOWER while the hips sink deeper each beat and the book swells (bend -> deep ->
  // wound, book centre y -406 -> -470 -> -390 -> -343 -> -314 local, hips 0.3 -> 1.3), shaking
  // harder each beat, until it locks for the flare. Every hoisted beat keeps the ledger inside
  // the frame.
  slam_lift: { crouch: 0.3, lean: 0.06, sh: 1.7, el: 1.1, blade: 0.5, bsh: 1.8, bel: 0.8, book: 0.6, bookOpen: 0.5, bookScale: 1.5, wings: 0, fold: 1, head: 0.0 },
  slam_hoist: { crouch: 0.75, lean: 0.0, sh: 2.5, el: 1.3, blade: 0.4, bsh: 2.4, bel: 1.5, book: 1, bookOpen: 0.2, bookScale: 1.6, wings: 0, fold: 1, head: -0.35 },
  slam_bend: { crouch: 0.92, lean: -0.08, sh: 2.4, el: 1.7, blade: 0.6, bsh: 2.15, bel: 2.2, book: 1, bookOpen: 0, bookScale: 1.85, wings: 0, fold: 1, head: 0.0, tremble: 0.4 },
  slam_deep: { crouch: 1.15, lean: -0.16, sh: 2.35, el: 1.9, blade: 0.6, bsh: 2.05, bel: 2.5, book: 1, bookOpen: 0, bookScale: 2.0, wings: 0, fold: 1, head: 0.1, tremble: 0.7 },
  slam_wound: { crouch: 1.3, lean: -0.22, sh: 2.3, el: 2.0, blade: 0.6, bsh: 2.0, bel: 2.7, book: 1, bookOpen: 0, bookScale: 2.2, wings: 0, fold: 1, head: 0.15, tremble: 1 },
  // strike (round 14): the book travels a visible arc and the body stays ONE shape (wings shut):
  //   0 ms pressed behind the skull -> 38 crest (swung up and over the head, rising out of the
  //   squat) -> 76 HALFWAY (both arms out at you, the book at chest height, coming down) ->
  //   110 contact: hips dropped into a deep squat, torso still upright-ish (not folded flat
  //   over its knees: that read as a feather heap), both arms straight down to the book flat
  //   on the floor ~250 local px out.
  slam_over: { crouch: 0.62, lean: 0.15, sh: 2.6, el: 0.6, blade: 0.4, bsh: 2.6, bel: 0.5, book: 1, bookOpen: 0, bookScale: 2.2, wings: 0, fold: 1, head: -0.1 },
  slam_half: { crouch: 0.78, lean: 0.42, sh: 1.2, el: 0.22, blade: 1.5, bsh: 1.2, bel: 0.22, book: 1.65, bookOpen: 0, bookScale: 2.2, wings: 0, fold: 1, head: 0.1 },
  slam_down: { crouch: 1.3, lean: 0.45, sh: 0.7, el: 0.15, blade: 2.7, bsh: 0.7, bel: 0.15, book: 2, bookOpen: 0, bookScale: 2.2, wings: 0, fold: 1, head: 0.15 },
  slam_rest: { crouch: 1.34, lean: 0.48, sh: 0.68, el: 0.17, blade: 2.8, bsh: 0.68, bel: 0.17, book: 2, bookOpen: 0, bookScale: 2.1, wings: 0, fold: 1, head: 0.45 },

  // ---- Ink lunge: rears up tall with everything flung open, then drops flat into a wedge.
  // round 6: the rear-up keeps RISING (half up -> full height -> over-arched), the plunge
  // drops it flat, then the wedge keeps sinking and drawing the lance back before the flash.
  // round 11: NO rear-up. The lunge's wind-up is the one LOW, FLAT, FORWARD silhouette:
  // it folds down toward you onto the ledger hand like a forefoot, the wings sweep straight
  // back into a wedge, and the pen-blade is couched like a lance with the point aimed AT
  // you along the floor from the first beat (round 10's rear-up X looked like the quill's
  // raised arm, and its trailing "tail" blade pointed away from the target).
  // round 13: the rear-up is back, as ONE clean shape. The whole body rears up and arches
  // BACK (the tallest wind-up), the ledger arm flung up and out toward you, and the pen-blade
  // arm pulled straight back behind the head: arm + blade one long level black line trailing
  // behind it, wings tucked tight. Round 12's low folded wedge read as the idle crouch.
  // It is the only wind-up that is TALL and WIDE at once (quill: low + diagonal; slam:
  // narrow column, book overhead).
  lunge_rise: { crouch: 0.12, lean: -0.15, sh: -0.95, el: 0.25, blade: 0.0, bsh: 1.75, bel: 0.3, wings: 0, fold: 1, tuck: 1, head: -0.1, bladeW: 2.2 },
  lunge_rear: { crouch: 0.25, lean: -0.35, sh: -1.4, el: -0.05, blade: -0.1, bsh: 1.85, bel: 0.2, wings: 0, fold: 1, tuck: 1, head: -0.25, tremble: 0.4, bladeW: 2.6 },
  lunge_rear2: { crouch: 0.12, lean: -0.55, sh: -1.55, el: -0.08, blade: -0.12, bsh: 2.05, bel: 0.1, wings: 0, fold: 1, tuck: 1, head: -0.35, tremble: 0.8, bladeW: 2.8 },
  // (r14) the last beat before the dash: it drops out of the rear-up into a loaded coil, hips
  // down, the spear line cocked higher behind it, the ledger hand lowered toward you like a
  // forefoot. The rear-up is a BUILD now (rise -> level -> tallest arch -> coil), not one
  // pose held for six frames.
  lunge_coil: { crouch: 0.62, lean: -0.28, sh: -1.75, el: -0.1, blade: -0.1, bsh: 1.55, bel: 0.5, wings: 0, fold: 1, tuck: 1, head: 0.12, tremble: 1, bladeW: 2.9 },
  // the dash: it drops out of the rear-up and drives the straightened arm + blade forward and
  // down in one straight black spear line from its shoulder to your chest (tip = hit fx1)
  lunge_act: { crouch: 0.55, lean: 0.8, sh: 1.25, el: -0.05, blade: -0.1, bsh: -0.5, bel: 1.4, wings: 0, fold: 1, tuck: 1, head: 0.1, bladeW: 2.6 },
  // the stop: the spear line driven down into the floor at the end of the dash, the body
  // sprawled low over it (the punish pose: planted, head down, weapon stuck)
  lunge_skid: { crouch: 0.9, lean: 0.85, sh: 1.0, el: 0.0, blade: -0.05, bsh: 0.3, bel: 0.3, wings: 0, fold: 1, tuck: 1, head: 0.5, bladeW: 2.3 },
  lunge_kneel: { crouch: 0.95, lean: 0.85, sh: 0.98, el: 0.02, blade: -0.05, bsh: 0.3, bel: 0.35, wings: 0, fold: 1, tuck: 1, head: 0.85, bladeW: 2.1 },
  lunge_tug: { crouch: 0.85, lean: 0.7, sh: 0.9, el: 0.2, blade: -0.1, bsh: 0.5, bel: 0.5, wings: 0.05, fold: 0.8, tuck: 0.6, head: 0.75, tremble: 0.6, bladeW: 1.9 },

  // ---- Wing gust: folds in tight, then bursts every wing open.
  gust_gather: { crouch: 0.5, lean: 0.45, sh: 0.9, el: 1.9, blade: 0.6, bsh: 0.9, bel: 1.9, wings: 0, wrap: 0.6, head: 0.5, tremble: 0.6 },
  gust_tell: { crouch: 0.15, lean: -0.25, sh: 2.1, el: 0.3, bsh: 2.1, bel: 0.3, wings: 1.35, head: -0.35 },
  gust_act: { crouch: 0.3, lean: 0.25, sh: 1.6, el: 0.2, bsh: 1.6, bel: 0.2, wings: 0.7 },

  // ---- Written name.
  write_open: { crouch: 0.1, lean: 0.05, sh: 2.0, el: 1.4, blade: 0.8, bsh: 1.1, bel: 2.0, book: 3, bookOpen: 1, head: 0.0, wings: 0.4 },
  write: { crouch: 0.1, lean: 0.15, sh: 1.0, el: 2.1, blade: 1.2, bsh: 1.1, bel: 2.1, book: 3, bookOpen: 1, head: 0.35, wings: 0.2 },

  // ---- Page storm.
  storm: { crouch: 0.0, lean: 0.0, sh: 0.6, el: 2.4, bsh: 0.6, bel: 2.4, wings: 0, wrap: 1, head: -0.2, float: 1 },

  recover: { crouch: 0.45, lean: 0.75, sh: 0.15, el: 0.1, blade: 0.0, bsh: 0.1, bel: 0.3, wings: 0.05, head: 0.6 },
  stagger: { crouch: 0.95, lean: 1.0, sh: 0.0, el: 0.0, blade: -0.4, bsh: 0.2, bel: 0.1, wings: 0.0, head: 0.9 },
  phase: { crouch: 0.1, lean: -0.5, sh: 2.4, el: 0.2, bsh: 2.4, bel: 0.2, wings: 1.3, head: -0.8 },
  dead: { crouch: 1.0, lean: 1.3, sh: 0.0, el: 0.0, bsh: 0.0, bel: 0.0, wings: 0, head: 1.0 },
};

// ---- keyframe tracks ---------------------------------------------------------

const TRACKS = {
  quill_slash: {
    // cocked by ~170 ms, then HELD (trembling) ~190 ms before the ~90 ms commit flash
    // round 6: no holds inside the draw: lift -> overhead -> past the shoulder -> fully
    // drawn, each beat further back and lower, then a ~120 ms locked freeze with the glint
    // round 14: one new beat every ~80 ms (lift -> high -> back -> wound, lower each time),
    // a ~35 ms lock with the nib star, then crest (30) -> halfway (66) -> contact (98; bites at 100)
    // (the last beat keeps sinking right up to the lock: no two frames of the draw are alike)
    glintAt: 'tip', freeze: 0.92, glint: [0.78, 0.99], glintCarry: 30,
    tell: [[0, 'BASE'], [0.2, 'quill_lift', 'out'], [0.42, 'quill_high', 'io'], [0.66, 'quill_back', 'io'], [0.92, 'quill_wound', 'io'], [1, 'quill_wound', 'hold']],
    active: [[0, 'quill_wound'], [30, 'quill_over', 'in'], [66, 'quill_half', 'lin'], [98, 'quill_strike', 'lin'], [140, 'quill_embed', 'out'], [500, 'quill_embed', 'hold']],
    recovery: [[0, 'quill_embed'], [0.5, 'quill_embed', 'hold'], [0.72, 'quill_tug', 'io'], [0.86, 'quill_rip', 'in'], [1, 'BASE', 'out']],
  },
  ledger_slam: {
    // book up by ~80 ms and held, folded behind the head, re-extended and HELD, flash
    // round 6: lift -> straight up -> folded behind the skull -> re-extended higher on its
    // toes (the book swelling), every beat different, then a ~120 ms locked flash
    // round 14: lift (0.18) -> hoist (0.36) -> bend (0.54) -> deep (0.72) -> wound (0.86),
    // each lower and further back, then a ~40 ms lock with the flare; crest (38) -> halfway
    // (76) -> contact (110; bites at 112)
    glintAt: 'book', freeze: 0.93, glint: [0.82, 0.99], glintCarry: 30,
    tell: [[0, 'BASE'], [0.18, 'slam_lift', 'out'], [0.36, 'slam_hoist', 'io'], [0.54, 'slam_bend', 'io'], [0.74, 'slam_deep', 'io'], [0.93, 'slam_wound', 'io'], [1, 'slam_wound', 'hold']],
    active: [[0, 'slam_wound'], [38, 'slam_over', 'in'], [76, 'slam_half', 'lin'], [110, 'slam_down', 'lin'], [400, 'slam_rest', 'io']],
    recovery: [[0, 'slam_rest'], [0.7, 'slam_rest', 'hold'], [1, 'BASE', 'io']],
  },
  ink_lunge: {
    // round 11: sink toward you -> folded flat wedge, lance level at you -> loaded lower,
    // shaking -> ~100 ms locked eye glare -> dash -> point driven into the floor, held
    // round 13: rise -> rear up tall, arched back, the blade arm pulled straight back behind
    // the head -> rears further, shaking -> ~110 ms locked eye glare -> drops and drives the
    // spear line forward (40 ms) -> dash -> point driven into the floor, held
    glintAt: 'head', freeze: 0.86, glint: [0.84, 0.99], glintCarry: 40,
    tell: [[0, 'BASE'], [0.14, 'lunge_rise', 'out'], [0.36, 'lunge_rear', 'io'], [0.6, 'lunge_rear2', 'io'], [0.86, 'lunge_coil', 'io'], [1, 'lunge_coil', 'hold']],
    active: [[0, 'lunge_coil'], [40, 'lunge_act', 'in'], [250, 'lunge_act', 'hold'], [295, 'lunge_skid', 'out']],
    recovery: [[0, 'lunge_skid'], [0.15, 'lunge_kneel', 'out'], [0.62, 'lunge_kneel', 'hold'], [0.78, 'lunge_tug', 'io'], [1, 'BASE', 'io']],
  },
  wing_gust: {
    glintAt: 'head', glint: [0.8, 0.98],
    tell: [[0, 'BASE'], [0.38, 'gust_gather', 'out'], [0.72, 'gust_tell', 'back'], [1, 'gust_tell', 'hold']],
    active: [[0, 'gust_tell'], [150, 'gust_act', 'out']],
    recovery: null,
  },
  written_name: {
    tell: [[0, 'BASE'], [0.4, 'write_open', 'out'], [1, 'write', 'io']],
    active: null,
    recovery: null,
  },
  page_storm: {
    tell: [[0, 'BASE'], [0.6, 'storm', 'io'], [1, 'storm', 'hold']],
    active: null,
    recovery: null,
  },
};

const easeOutBack = (t) => { const c = 1.6; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
const EASE = {
  lin: (t) => t, out: easeOutCubic, in: (t) => t * t * t, io: easeInOut, back: easeOutBack, hold: () => 0,
};

const P = (k) => (k === 'BASE' ? BASE : { ...BASE, ...POSES[k] });

const mix = (a, b, t) => {
  const o = {};
  for (const k in BASE) o[k] = lerp(a[k] ?? BASE[k], b[k] ?? BASE[k], t);
  return o;
};

function sample(track, u) {
  if (u <= track[0][0]) return { ...P(track[0][1]) };
  for (let i = 1; i < track.length; i++) {
    const [u1, k1, e] = track[i];
    const [u0, k0] = track[i - 1];
    if (u < u1) {
      const t = (EASE[e || 'io'])(clamp((u - u0) / Math.max(1e-6, u1 - u0), 0, 1));
      return e === 'hold' ? { ...P(k0) } : mix(P(k0), P(k1), t);
    }
  }
  return { ...P(track[track.length - 1][1]) };
}

// Strain shake: deterministic on sim time so captures repeat.
function applyTremble(pose, b) {
  const k = pose.tremble;
  if (k <= 0.01) return pose;
  const s = b.stateT;
  // (r14) a strain shake you can see between two 12 fps frames (was 0.035 rad)
  pose.sh += Math.sin(s / 21) * 0.06 * k;
  pose.bsh += Math.sin(s / 19 + 1.7) * 0.05 * k;
  pose.crouch += Math.sin(s / 17 + 0.4) * 0.04 * k;
  pose.lean += Math.sin(s / 27 + 0.6) * 0.02 * k;
  pose.shiver = 1;
  return pose;
}

function glintAmount(tr, u) {
  if (!tr.glint) return 0;
  const [a, z] = tr.glint;
  if (u < a) return 0;
  const p = clamp((u - a) / (z - a), 0, 1);
  return p < 0.35 ? easeOutCubic(p / 0.35) : 1 - 0.25 * (p - 0.35) / 0.65;
}

function genericRecovery(b) {
  const p = clamp((b.stateT * bossSpeed(b)) / b.recoveryMs, 0, 1);
  const slump = p < 0.25 ? easeOutCubic(p / 0.25) : 1 - easeInOut((p - 0.25) / 0.75);
  return mix(BASE, P('recover'), slump);
}

// ---- strike trails (round 3) -----------------------------------------------------
// The strike must be SEEN in the arena: for each melee attack the active phase carries
// the weapon's recent path (sampled from the same keyframe track the body uses) so the
// renderer can paint one thick smear exactly where the blade / ledger travelled, and the
// recovery carries where it landed so the punish window is drawn on that spot.
const STRIKE = {
  quill_slash: { kind: 'blade', win: 50, land: 98 },
  ledger_slam: { kind: 'book', win: 60, land: 110 },
  ink_lunge: { kind: 'lunge' },
};
function motionPos(atk, t) { // forward px travelled by attack-local ms t (phase speed cancels out)
  let x = 0;
  for (const m of atk.motion || []) x += m.vx * clamp(t - m.atMs, 0, m.durMs) / 1000;
  return x;
}
function strikeInfo(b, atk, tr, phase, local) {
  const S = STRIKE[atk.id];
  if (!S) return null;
  const info = { id: atk.id, kind: S.kind, phase, local, land: S.land || 0,
    // where the active phase started, in boss-local px (behind = negative)
    origin: -Math.abs(b.x - b.strikeX) / ART_SCALE };
  if (phase === 'recovery') info.u = clamp(local / Math.max(1, b.recoveryMs), 0, 1);
  if (phase === 'active' && S.win && tr && tr.active) {
    const now = motionPos(atk, local);
    const t0 = Math.max(0, local - S.win);
    const pts = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const tt = lerp(t0, local, i / n);
      const g = weaponGeom(sample(tr.active, tt));
      const sh = -(now - motionPos(atk, tt)) / ART_SCALE; // older samples sit further back
      g.base[0] += sh; g.mid[0] += sh; g.tip[0] += sh; g.book[0] += sh; g.hand[0] += sh;
      g.tt = tt;
      pts.push(g);
    }
    info.trail = pts; // oldest -> newest
  }
  return info;
}

// round 13: in every melee attack, from the wind-up through the punish window, the folded
// wings are also TUCKED (shrunk tight to the back), so body + striking limb are the shape
const ATTACK_STATES = { tell: 1, active: 1, recovery: 1 };
export function bossPose(b) {
  const p = rawPose(b);
  if (ATTACK_STATES[b.state] && MELEE[b.attackId]) p.tuck = Math.max(p.tuck || 0, p.fold || 0);
  return p;
}

function rawPose(b) {
  const atk = b.attackId ? ATTACKS[b.attackId] : null;
  const tr = atk ? TRACKS[atk.id] : null;
  const local = b.stateT * bossSpeed(b);
  switch (b.state) {
    case 'tell': {
      const u = clamp(local / atk.tell.ms, 0, 1);
      const frozen = tr.freeze != null && u >= tr.freeze;
      const raw = sample(tr.tell, u);
      // the freeze: the body LOCKS (no strain shake) so the flash is the only thing moving
      if (frozen) raw.tremble = 0;
      const pose = applyTremble(raw, b);
      pose.glint = glintAmount(tr, u);
      pose.frozen = frozen;
      pose.freezeU = frozen ? clamp((u - tr.freeze) / Math.max(1e-6, 1 - tr.freeze), 0, 1) : 0;
      pose.glintAt = tr.glintAt;
      pose.tellU = u;
      pose.tellId = atk.id;
      pose.tellMs = atk.tell.ms;
      if (atk.id === 'ink_lunge' && u > 0.6 && !frozen) pose.shiver = 1;
      return pose;
    }
    case 'active': {
      if (atk.id === 'written_name') {
        const pose = P('write');
        pose.el += Math.sin(local / 55) * 0.15;
        pose.sh += Math.sin(local / 90) * 0.06;
        if (local > atk.curse.writeMs) return mix(pose, P('recover'), clamp((local - atk.curse.writeMs) / 300, 0, 1));
        return pose;
      }
      if (atk.id === 'page_storm') return P('storm');
      const pose = tr && tr.active ? sample(tr.active, local) : { ...BASE };
      if (atk.id === 'wing_gust') pose.wings += Math.sin(local / 70) * 0.2;
      pose.strike = strikeInfo(b, atk, tr, 'active', local);
      // (r14) the commit flash rides the first instants of the swing, so the locked frame and
      // the release both carry it (it no longer vanishes on the frame the strike starts)
      if (tr && tr.glintCarry && local < tr.glintCarry) {
        pose.glint = 0.85 * (1 - local / tr.glintCarry);
        pose.glintAt = tr.glintAt;
        pose.freezeU = 1;
      }
      return applyTremble(pose, b);
    }
    case 'recovery': {
      if (!tr || !tr.recovery || b.curseBroken) return genericRecovery(b);
      const u = clamp(local / b.recoveryMs, 0, 1);
      const pose = applyTremble(sample(tr.recovery, u), b);
      pose.strike = strikeInfo(b, atk, tr, 'recovery', local);
      return pose;
    }
    case 'stagger': {
      const p = clamp(b.stateT / BOSS.staggerMs, 0, 1);
      const k = p < 0.12 ? easeOutCubic(p / 0.12) : p > 0.85 ? 1 - (p - 0.85) / 0.15 : 1;
      return mix(BASE, P('stagger'), k);
    }
    case 'phase_change': {
      const p = clamp(b.stateT / BOSS.phaseChangeMs, 0, 1);
      return mix(BASE, P('phase'), p < 0.2 ? easeOutCubic(p / 0.2) : p > 0.85 ? 1 - (p - 0.85) / 0.15 : 1);
    }
    case 'dead': return mix(P('stagger'), P('dead'), easeInOut(clamp(b.stateT / 1600, 0, 1)));
    case 'walk': {
      const pose = { ...BASE };
      pose.walk = b.stateT;
      return pose;
    }
    default: return { ...BASE, breathe: b.stateT };
  }
}

// ---- weapon geometry -----------------------------------------------------------
// Mirrors the rig in art/scrivener.js (rig/arm/quillBlade) so strike FX can trace the
// exact path the blade and ledger travel. Boss-local, unscaled, y down, +x = facing.
// ART_SCALE in boss_draw.js (1.25) converts to world px.
export const ART_SCALE = 1.25; // must match boss_draw.js
const BOOKPOS_M = [ // mirror of art/scrivener.js BOOKPOS
  { off: [-26, 70], rot: 0.08 }, { off: [-30, -34], rot: -1.18 }, { off: [30, 4], rot: 1.45 }, { off: [10, -10], rot: -0.4 },
];
const dv = (a) => [Math.sin(a), Math.cos(a)];
export function weaponGeom(pose) {
  const H = [0, -(RIG.legLen - pose.crouch * 66)];
  const u = [Math.sin(pose.lean), -Math.cos(pose.lean)];
  const fw = [Math.cos(pose.lean), Math.sin(pose.lean)];
  const P = (s, o) => { const oo = o + hunchOff(s); return [H[0] + u[0] * RIG.torso * s + fw[0] * oo, H[1] + u[1] * RIG.torso * s + fw[1] * oo]; };
  const armAt = (sh, a1, a2) => {
    const d1 = dv(a1), d2 = dv(a1 + a2);
    const elbow = [sh[0] + d1[0] * RIG.upper, sh[1] + d1[1] * RIG.upper];
    return { elbow, hand: [elbow[0] + d2[0] * RIG.fore, elbow[1] + d2[1] * RIG.fore], d2, angle: a1 + a2 };
  };
  const S = P(0.97, -2);
  const A = armAt(S, pose.sh, pose.el);
  const F = armAt(P(0.98, -10), pose.bsh, pose.bel);
  const hoist = clamp(pose.book, 0, 1) - clamp(pose.book - 1, 0, 1);
  const d = dv(A.angle + pose.blade + hoist * 2.7);
  const n = [-d[1], d[0]];
  const bw = clamp((pose.bladeW == null ? 1.5 : pose.bladeW) / 1.5, 0.8, 1.6);
  const L = RIG.blade * (1 + (bw - 1) * 0.3);
  const f1 = [A.hand[0] + A.d2[0] * 4 + d[0] * 24, A.hand[1] + A.d2[1] * 4 + d[1] * 24];
  const tip = [f1[0] + d[0] * L + n[0] * 16, f1[1] + d[1] * L + n[1] * 16];
  const mid = [f1[0] + d[0] * L * 0.5 + n[0] * 4, f1[1] + d[1] * L * 0.5 + n[1] * 4];
  // the hoisted ledger's box (mirrors art/scrivener.js ledger(): BOOKPOS[1], bookScale damping)
  const bs = pose.bookScale == null ? 1 : pose.bookScale <= 1 ? pose.bookScale : 1 + (pose.bookScale - 1) * 0.6;
  // (r13) mirrors art/scrivener.js bookXform() + BOOKPOS exactly (hanging, hoisted, slammed, open)
  const v = clamp(pose.book, 0, 3), bi = Math.min(2, Math.floor(v)), bf = v - bi;
  const A0 = BOOKPOS_M[bi], A1 = BOOKPOS_M[bi + 1];
  const bookX = { c: [F.hand[0] + lerp(A0.off[0], A1.off[0], bf), F.hand[1] + lerp(A0.off[1], A1.off[1], bf)], rot: lerp(A0.rot, A1.rot, bf), hw: 30 * bs, hh: 41 * bs };
  return { shoulder: S, elbow: A.elbow, hand: A.hand, base: f1, mid, tip, book: F.hand, fshoulder: P(0.98, -10), felbow: F.elbow, bookX };
}

// The final commit flash ("kira"): a hard ink star with a red heart and radiating
// spokes on the part of the body that is about to strike. Drawn in boss-local space.
// anchors = { tip, book, head } as [x, y].
export function drawGlint(ctx, pose, anchors, t) {
  if (pose.strike) drawStrikeOver(ctx, pose);
  const k = pose.glint || 0;
  if (k <= 0.02 || !pose.glintAt) return;
  const at = anchors[pose.glintAt];
  if (!at) return;
  if (pose.glintAt === 'tip') return bladeGleam(ctx, pose, k, pose.freezeU || 0);
  if (pose.glintAt === 'book') return bookFlare(ctx, pose, k, pose.freezeU || 0);
  if (pose.glintAt === 'head') return eyeGlare(ctx, at, k, pose.freezeU || 0);
  const [x, y] = at;
  const r = 20 + 26 * k;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = Math.min(1, k * 1.4);
  // radiating spokes
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    const r0 = r * 0.55, r1 = r * (i % 2 ? 1.25 : 1.85);
    ctx.lineWidth = i % 2 ? 1.4 : 2.6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }
  // four-point star
  const star = (R, w) => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const rr = i % 2 ? w : R;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
  };
  star(r, r * 0.16);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.stroke();
  star(r * 0.42, r * 0.1);
  ctx.fillStyle = RED;
  ctx.fill();
  ctx.restore();
}

// round 6: each attack's flash has its OWN shape, so the freeze says WHICH strike as well
// as WHEN.
//   blade  a white gleam that runs down the blade's edge from hilt to point, ending in a
//          long needle star on the nib, spokes laid along the blade line
//   book   the ledger's cover rimmed in white with a ring of heavy ink rays bursting off it
//          (the book "ignites", like the bar's fists)
//   eyes   two red pin-stars in the skull with long horizontal glare streaks aimed at you
function needleStar(ctx, x, y, ang, L, w, fill) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = ang + (i / 8) * Math.PI * 2;
    const rr = i % 2 ? w : (i % 4 === 0 ? L : L * 0.38);
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
}
function bladeGleam(ctx, pose, k, fu) {
  const g = weaponGeom(pose);
  const dx = g.tip[0] - g.base[0], dy = g.tip[1] - g.base[1];
  const ang = Math.atan2(dy, dx);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.globalAlpha = Math.min(1, k * 1.5);
  // the gleam sliding down the edge
  const run = clamp(fu * 1.8, 0, 1);
  const a0 = Math.max(0, run - 0.45), a1 = run;
  const n = [-dy, dx], nl = Math.hypot(n[0], n[1]) || 1;
  const off = 7;
  const P = (q) => [g.base[0] + dx * q + n[0] / nl * off, g.base[1] + dy * q + n[1] / nl * off];
  if (a1 > a0) {
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(...P(a0)); ctx.lineTo(...P(a1)); ctx.stroke();
  }
  // needle star on the nib: long spokes along the blade, short across it
  const L = 50 + 120 * k;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  needleStar(ctx, g.tip[0], g.tip[1], ang, L, 6 + 3 * k, PAPER);
  needleStar(ctx, g.tip[0], g.tip[1], ang + Math.PI / 4, L * 0.36, 4, RED);
  ctx.restore();
}
function bookFlare(ctx, pose, k, fu) {
  const X = weaponGeom(pose).bookX;
  ctx.save();
  ctx.translate(X.c[0], X.c[1]);
  ctx.rotate(X.rot);
  ctx.globalAlpha = Math.min(1, k * 1.5);
  const hw = X.hw + 6, hh = X.hh + 6;
  // rays off the cover: alternating heavy ink wedges, growing with the flash
  ctx.fillStyle = INK;
  const R = 1 + (0.5 + 0.9 * k);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.09;
    const c = Math.cos(a), s = Math.sin(a);
    const ex = Math.min(hw / Math.abs(c || 1e-6), hh / Math.abs(s || 1e-6));
    const r0 = ex * 1.02, r1 = ex * (i % 2 ? R * 0.8 : R) + (i % 2 ? 10 : 26) * k;
    const w = i % 2 ? 0.03 : 0.06;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - w) * r0, Math.sin(a - w) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a + w) * r0, Math.sin(a + w) * r0);
    ctx.closePath();
    ctx.fill();
  }
  // the cover rimmed in white, with a red seal flaring in the middle
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 5 + 3 * k;
  ctx.strokeRect(-hw, -hh, 2 * hw, 2 * hh);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(-hw - 5, -hh - 5, 2 * hw + 10, 2 * hh + 10);
  needleStar(ctx, 0, 0, -Math.PI / 2, 14 + 22 * k, 3, RED);
  ctx.restore();
}
function eyeGlare(ctx, at, k, fu) {
  const [x, y] = at;
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 1.5);
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  // glare streaks aimed forward (+x, at the challenger) and a short tail back
  for (const [dy, L, w] of [[-4, 240, 6], [6, 170, 4], [-14, 110, 2.5]]) {
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x + 8, y + dy); ctx.lineTo(x + 8 + L * (0.4 + 0.6 * k), y + dy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 8, y + dy); ctx.lineTo(x - 8 - L * 0.3 * k, y + dy); ctx.stroke();
  }
  ctx.lineWidth = 2.4;
  needleStar(ctx, x - 6, y - 2, 0, 20 + 30 * k, 4.5, PAPER);
  needleStar(ctx, x - 6, y - 2, Math.PI / 4, 10 + 10 * k, 3, RED);
  needleStar(ctx, x + 14, y + 1, 0, 16 + 22 * k, 3.5, PAPER);
  needleStar(ctx, x + 14, y + 1, Math.PI / 4, 8 + 8 * k, 2.5, RED);
  ctx.restore();
}

// ---- the wind-up halo (round 4) ---------------------------------------------------
// From the first frame of a tell a FLAT PAPER HALO (~1.5x the figure's height) opens
// behind the body and flattens the library's hatching, so the black wind-up silhouette
// reads on its own even at thumbnail size. The halo's SHAPE is the attack's axis:
//   quill_slash  a tilted ellipse along the cocked diagonal (blade high and back)
//   ledger_slam  a tall narrow column (book overhead)
//   ink_lunge    a big round burst for the rear-up, then a low flat band for the wedge
// The weapon arm is backed by a heavy ink mass so it, not the folded wings, is the
// dominant black shape. (Round 4 spiked the rim into focus lines at the commit; round 5
// dropped that: it read as an impact on the boss's own body.)
// Drawn in boss-local space (already mirrored by facing) BEFORE the body.
//   keys: [u, cx, cy, rx, ry, rot]  (u = tell fraction; x forward, y down, floor 0)
const HALO = {
  // round 12: ~0.65x the old size. The old halo whited out half the screen ("a half-screen
  // white flash"); now it only backs the figure and the cocked weapon.
  quill_slash: { axis: 0.72, side: 0, keys: [[0, -30, -200, 140, 112, 0.3], [0.37, -60, -215, 175, 120, 0.55], [0.7, -85, -225, 210, 126, 0.72]] },
  ledger_slam: { axis: 0, side: 0, keys: [[0, 0, -205, 100, 190, 0], [0.3, 0, -260, 100, 250, 0], [0.52, 0, -245, 105, 240, 0], [0.77, 0, -285, 108, 280, 0]] },
  ink_lunge: { axis: 0, side: -1, keys: [[0, 20, -170, 165, 140, 0], [0.22, 45, -135, 210, 118, 0], [0.45, 70, -105, 255, 100, 0], [0.82, 80, -95, 275, 92, 0]] },
  wing_gust: { axis: 0, keys: [[0, -40, -230, 250, 250, 0]] },
};
const COMMIT_MS = 90;
// how long the halo stays behind the strike (attack-local ms): full, then gone
// round 7: the lunge keeps its low flat paper band for the whole dash, so the couched lance
// and the flat black wedge stay readable while they cross the floor
// round 12: the halo closes as the strike starts, so the swing, the contact and the landed
// weapon play out on the plain library floor (no white field behind the contact frame)
const HALO_ACTIVE = { quill_slash: [0, 70], ledger_slam: [0, 70], ink_lunge: [90, 170], wing_gust: [80, 200] };

function haloShape(H, u) {
  const K = H.keys;
  if (u <= K[0][0]) return K[0].slice(1);
  for (let i = 1; i < K.length; i++) {
    if (u < K[i][0]) {
      const f = easeInOut((u - K[i - 1][0]) / (K[i][0] - K[i - 1][0]));
      return K[i].slice(1).map((v, j) => lerp(K[i - 1][j + 1], v, f));
    }
  }
  return K[K.length - 1].slice(1);
}

function haloPath(ctx, cx, cy, rx, ry, rot, seed, jag) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const m = 56;
  ctx.beginPath();
  for (let i = 0; i <= m; i++) {
    const a = (i / m) * Math.PI * 2;
    const j = i % m;
    const rr = 1 + 0.022 * (hashNoise(seed, j) - 0.5) + (jag ? (i % 2 ? -0.07 : 0.05 * hashNoise(seed + 1, j)) * jag : 0);
    const ex = Math.cos(a) * rx * rr, ey = Math.sin(a) * ry * rr;
    const x = cx + ex * c - ey * s, y = cy + ex * s + ey * c;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

// a tapered ink mass along a polyline: widths per point (round joins)
function inkMass(ctx, pts, ws) {
  ctx.fillStyle = INK;
  for (let i = 0; i < pts.length; i++) {
    ctx.beginPath();
    ctx.arc(pts[i][0], pts[i][1], ws[i] / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const wa = ws[i - 1] / 2, wb = ws[i] / 2;
    ctx.moveTo(a[0] + nx * wa, a[1] + ny * wa);
    ctx.lineTo(b[0] + nx * wb, b[1] + ny * wb);
    ctx.lineTo(b[0] - nx * wb, b[1] - ny * wb);
    ctx.lineTo(a[0] - nx * wa, a[1] - ny * wa);
    ctx.closePath();
  }
  ctx.fill();
}

// the weapon arm as one heavy black shape behind the figure
function weaponMass(ctx, pose, id, k) {
  if (k <= 0.02) return;
  const g = weaponGeom(pose);
  ctx.save();
  ctx.globalAlpha = Math.min(1, k);
  if (id === 'ledger_slam') {
    inkMass(ctx, [g.shoulder, g.elbow, g.hand], [30, 26, 24]);
    inkMass(ctx, [g.fshoulder, g.felbow, g.book], [30, 26, 24]);
    const X = g.bookX;
    ctx.translate(X.c[0], X.c[1]);
    ctx.rotate(X.rot);
    const pad = 9;
    ctx.fillStyle = INK;
    ctx.fillRect(-X.hw - pad, -X.hh - pad, 2 * (X.hw + pad), 2 * (X.hh + pad));
  } else {
    inkMass(ctx, [g.shoulder, g.elbow, g.hand, g.base, g.mid, g.tip], [34, 30, 28, 46, 30, 9]);
  }
  ctx.restore();
}

function drawHalo(ctx, pose, id, u, alpha, commit, shrink = 1) {
  alpha *= PAPER_HOLD;
  const H = HALO[id];
  if (!H || alpha <= 0.01 || shrink <= 0.03) return;
  const [cx, cy, rx0, ry0, rot] = haloShape(H, u);
  const grow = (0.86 + 0.14 * easeOutCubic(clamp(u / 0.18, 0, 1))) * shrink;
  const rx = rx0 * grow, ry = ry0 * grow;
  const seed = 700 + id.length * 13;
  ctx.save();
  // the halo stands ON the floor: clip it flat a little below the floor line
  ctx.beginPath();
  ctx.rect(-2000, -2000, 4000, 2014);
  ctx.clip();
  // round 5: no burst on the rim at the commit. A jagged ring around the body read as an
  // impact on the boss itself; the commit is now only the glint on the weapon + the shake.
  ctx.globalAlpha = alpha;
  dryBrushHalo(ctx, cx, cy, rx, ry, rot, seed + 3); // ink treatment: art/halo.js (owner: art)
  ctx.restore();
}

// ---- the paper cut-out (round 13) -------------------------------------------------
// The critic's gap: against the hatched floor and the shelves the figure turned into a heap
// of black feathers from the wind-up through the contact. Now, for the WHOLE attack (tell ->
// strike -> punish window), the body and the striking limb are backed by plain paper that
// follows the skeleton: one ellipse along the body's axis (floor -> skull) and one narrow
// lane along the weapon (shoulder -> nib, or around the ledger). No focus lines inside it,
// no fixed giant field: it hugs the silhouette, so the black shape and the line of the reach
// read on their own at thumbnail size, and the reach to the challenger is ONE clean stroke.
// (perf) every oval is added to ONE path and filled once (vector, no texture blits): the
// edge is a dry-brush rag of uneven points, fixed per vertex so it never crawls
let OV = 0;
function paperOval(ctx, cx, cy, rx, ry, rot) {
  if (rx < 4 || ry < 4) return;
  const c = Math.cos(rot), s = Math.sin(rot);
  const n = 44, seed = 1301 + (OV++) * 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const h = hashNoise(seed, i);
    const rr = i % 2 ? 0.97 + 0.03 * h : 1.0 + 0.07 * h * h;
    const ex = Math.cos(a) * rx * rr, ey = Math.sin(a) * ry * rr;
    const x = cx + ex * c - ey * s, y = cy + ex * s + ey * c;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}
// paper behind a segment a -> b, padded by `pad` at the ends and `w` across
function paperSeg(ctx, a, b, w, pad) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  paperOval(ctx, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L / 2 + pad, w, Math.atan2(dy, dx));
}
const MELEE = { quill_slash: 1, ledger_slam: 1, ink_lunge: 1 };
// k < 1 tightens it (r14: during the strike and the punish window, so the contact frame is the
// black figure on the floor, not a big white blob around it)
// (show) While the stage holds a decision the wind-up is on screen for seconds, not half a
// second, and the plain paper behind the figure starts to read as a hole in the engraving.
// The stage thins it during the hold with setPaperHold(0..1): 1 = as drawn, lower = fainter.
let PAPER_HOLD = 1;
export function setPaperHold(k) { PAPER_HOLD = k; }

function cutout(ctx, pose, id, alpha, k = 1) {
  alpha *= PAPER_HOLD;
  if (alpha <= 0.01) return;
  const g = weaponGeom(pose);
  const hipY = -(RIG.legLen - pose.crouch * 66);
  const up = [Math.sin(pose.lean), -Math.cos(pose.lean)];
  const fw = [Math.cos(pose.lean), Math.sin(pose.lean)];
  const skull = [g.shoulder[0] + fw[0] * 34 + up[0] * 52, g.shoulder[1] + fw[1] * 34 + up[1] * 52];
  const foot = [0, 0];
  ctx.save();
  ctx.beginPath(); ctx.rect(-2000, -2000, 4000, 2002); ctx.clip(); // stands ON the floor line
  ctx.globalAlpha = alpha;
  OV = 0;
  ctx.beginPath();
  // the body: floor -> hips -> skull, wide enough for the coat and the tucked wings
  const mid = [(foot[0] + skull[0]) / 2 - fw[0] * 18, (foot[1] + skull[1]) / 2];
  const ax = skull[0] - foot[0], ay = skull[1] - foot[1];
  paperOval(ctx, mid[0], mid[1] + 6, Math.hypot(ax, ay) / 2 + 44 * k, (112 + 34 * clamp(pose.crouch, 0, 1)) * k, Math.atan2(ay, ax));
  // the hips / haunches when it is low
  paperOval(ctx, -10, hipY * 0.5, 120 * k, Math.max(40, -hipY * 0.5 + 26 * k), 0);
  // the striking limb
  if (id === 'ledger_slam') {
    paperSeg(ctx, g.fshoulder, g.book, 44 * k, 26 * k);
    paperSeg(ctx, g.shoulder, g.hand, 40 * k, 24 * k);
    const X = g.bookX;
    paperOval(ctx, X.c[0], X.c[1], X.hw * (1 + 0.5 * k) + 30 * k, X.hh * (1 + 0.5 * k) + 30 * k, X.rot);
  } else {
    paperSeg(ctx, g.shoulder, g.tip, (40 + 4 * (pose.bladeW || 1.5)) * k, 40 * k);
    paperSeg(ctx, g.fshoulder, g.book, 42 * k, 30 * k);
  }
  ctx.fillStyle = PAPER;
  ctx.fill('nonzero');
  ctx.restore();
}

// paper: false for the alpha-only redraws (fx/sil.js hit-flash / impact silhouettes): the
// paper cut-out is background, never part of the figure's shape
export function drawTellFlare(ctx, pose, paper = true) {
  if (pose.strike) {
    const S = pose.strike;
    if (MELEE[S.id]) {
      // the cut-out holds through the strike and the punish window, dissolving only as it rises
      const a = S.phase === 'active' ? 1 : S.u < 0.8 ? 1 : clamp(1 - (S.u - 0.8) / 0.2, 0, 1);
      if (paper) cutout(ctx, pose, S.id, a, 0.72);
      weaponMass(ctx, pose, S.id, a);
    } else {
      const HA = HALO_ACTIVE[S.id];
      if (S.phase === 'active' && HA && S.local < HA[1]) {
        const k = S.local < HA[0] ? 1 : 1 - easeOutCubic((S.local - HA[0]) / (HA[1] - HA[0]));
        if (paper) drawHalo(ctx, pose, S.id, 1, 1, 0, k);
      }
    }
    drawStrikeUnder(ctx, pose);
    return;
  }
  const id = pose.tellId;
  if (!id || pose.tellU == null) return;
  const u = pose.tellU;
  const alpha = easeOutCubic(clamp(u / 0.1, 0, 1));
  if (MELEE[id]) {
    if (paper) cutout(ctx, pose, id, alpha);
    weaponMass(ctx, pose, id, clamp((u - 0.04) / 0.14, 0, 1));
    return;
  }
  if (!HALO[id]) return;
  const from = 1 - COMMIT_MS / Math.max(1, pose.tellMs || 600);
  const commit = u < from ? 0 : easeOutCubic(clamp((u - from) / (1 - from) * 1.6, 0, 1));
  if (paper) drawHalo(ctx, pose, id, u, alpha, commit);
}

// ---- strike painters (boss-local space, unscaled, y down, floor at y = 0) ------------

const floorClamp = (p, lim = 5) => [p[0], Math.min(p[1], lim)];

// Where the blade line meets the floor (null when the tip is above it).
function bladeEntry(g) {
  const a = g.base, z = g.tip;
  if (z[1] <= 0) return null;
  const k = a[1] >= 0 ? 0 : -a[1] / (z[1] - a[1]);
  return [lerp(a[0], z[0], k), 0];
}

function chips(ctx, x, y, seed, n, age, spread, color = INK) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (hashNoise(seed, i) - 0.5) * 2.2;
    const v = 0.35 + 0.5 * hashNoise(seed + 1, i);
    const tt = age / 1000;
    const px = x + Math.cos(a) * v * spread * tt * 4;
    const py = y + Math.sin(a) * v * spread * tt * 4 + 900 * tt * tt;
    if (py > 8) continue;
    const r = 2 + 4 * hashNoise(seed + 2, i);
    ctx.beginPath();
    ctx.moveTo(px - r, py);
    ctx.lineTo(px, py - r * 1.3);
    ctx.lineTo(px + r * 0.9, py + r * 0.2);
    ctx.lineTo(px - r * 0.2, py + r);
    ctx.closePath();
    ctx.fill();
  }
}

// a white dust burst with an ink contour sitting on the floor
function dustBurst(ctx, x, seed, k, W, H) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, 1.5 * k);
  ctx.beginPath();
  ctx.moveTo(x - W, 3);
  for (let i = 1; i < 16; i++) {
    const u = i / 16;
    const hh = H * Math.sin(u * Math.PI) * (i % 2 ? 0.5 : 0.85 + 0.5 * hashNoise(seed, i));
    ctx.lineTo(x - W + u * 2 * W, 3 - hh);
  }
  ctx.lineTo(x + W, 3);
  ctx.closePath();
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.restore();
}

// cracks running along the floor out of a point (side view: shallow zig-zags)
function floorCracks(ctx, x, seed, len, alpha, n = 5) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const dir = i % 2 ? 1 : -1;
    const L = len * (0.5 + 0.6 * hashNoise(seed, i));
    const dy = 1.5 + 9 * hashNoise(seed + 1, i);
    ctx.lineWidth = 4.5 - i * 0.45;
    ctx.beginPath();
    ctx.moveTo(x, 1);
    for (let k = 1; k <= 4; k++) {
      ctx.lineTo(x + dir * L * k / 4, 1 + dy * k / 4 + (k % 2 ? -2 : 2) * hashNoise(seed + 2, i * 4 + k));
    }
    ctx.stroke();
  }
  ctx.restore();
}

// The blade's swept area over the trail window: one solid black crescent, thin at the
// tail and full at the head, cut by paper speed lines that follow the tip's path.
function bladeSmear(ctx, S) {
  const tr = S.trail;
  const n = tr.length;
  const travel = Math.hypot(tr[n - 1].tip[0] - tr[0].tip[0], tr[n - 1].tip[1] - tr[0].tip[1]);
  if (travel < 14) return;
  // (r14) a BAND along the outer 40% of the blade, not a fan down to the hand: the r13 fan
  // was a half-screen black wedge that swallowed the arm and the body at the contact
  const ramp = (i) => 0.05 + 0.35 * Math.pow(i / (n - 1), 0.7);
  ctx.save();
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.94;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = floorClamp(tr[i].tip, 8);
    i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
  }
  for (let i = n - 1; i >= 0; i--) {
    const g = tr[i];
    const p = floorClamp([lerp(g.tip[0], g.hand[0], ramp(i)), lerp(g.tip[1], g.hand[1], ramp(i))], 8);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = PAPER;
  ctx.lineCap = 'round';
  for (const [f, w] of [[0.06, 2.2], [0.16, 1.5], [0.26, 1.8]]) {
    ctx.lineWidth = w;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      if (ramp(i) < f + 0.04) continue;
      const g = tr[i];
      const p = floorClamp([lerp(g.tip[0], g.hand[0], f), lerp(g.tip[1], g.hand[1], f)], 6);
      started ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
      started = true;
    }
    ctx.stroke();
  }
  ctx.restore();
}

function bookSmear(ctx, S) {
  const tr = S.trail;
  const n = tr.length;
  const travel = Math.hypot(tr[n - 1].book[0] - tr[0].book[0], tr[n - 1].book[1] - tr[0].book[1]);
  if (travel < 14) return;
  // a fan of ruled speed lines the book's width, tracing its arc, and a solid ink wedge
  // only over the last stretch (where the book is NOW and how fast it is coming down)
  const pts = tr.map((g) => floorClamp([g.book[0], g.book[1] - 30], -6));
  const nrm = (i) => {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
    const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  };
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  // (r14) 4 thin lines, not 7 heavy ones: the contact must show the book and the arms
  for (let k = 0; k < 4; k++) {
    const off = (k / 3 - 0.5) * 60;
    const from = Math.floor(n * (0.1 + 0.35 * hashNoise(941, k)));
    ctx.lineWidth = k % 2 ? 1.6 : 2.6;
    ctx.beginPath();
    for (let i = from; i < n; i++) {
      const q = nrm(i);
      const p = [pts[i][0] + q[0] * off, pts[i][1] + q[1] * off];
      i > from ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
    }
    ctx.stroke();
  }
  const i0 = Math.floor(n * 0.84);
  inkMass(ctx, pts.slice(i0), pts.slice(i0).map((_, j, arr) => 8 + 56 * (j / Math.max(1, arr.length - 1))));
  ctx.restore();
}

// where the nib bit the floor: an ink pool, a gash dragged back toward the body and
// cracks both ways. It stays for the whole punish window (the reach, written on the floor).
function landMark(ctx, x, a) {
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = 0.9 * a;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(x - 6, 5, 46, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  stroke(ctx, [[x + 26, 3], [x - 50, 5], [x - 170, 3]], { width: 15, taper: 0.8, seed: 911, alpha: 0.95 * a });
  stroke(ctx, [[x + 10, 10], [x - 60, 12], [x - 130, 10]], { width: 6, taper: 0.9, seed: 912, alpha: 0.8 * a });
  floorCracks(ctx, x, 913, 120, a, 7);
}

// fade for marks that persist through the punish window: full until the boss starts
// to rise, then gone by the end of recovery
const holdFade = (S, until) => (S.phase === 'active' ? 1 : S.u < until ? 1 : clamp(1 - (S.u - until) / (1 - until), 0, 1));

function drawStrikeUnder(ctx, pose) {
  const S = pose.strike;
  const g = weaponGeom(pose);
  const age = S.phase === 'active' ? S.local - S.land : 1e4;
  if (S.kind === 'blade') {
    if (S.trail) bladeSmear(ctx, S);
    const e = bladeEntry(g);
    if (age >= 0 && e) {
      const a = holdFade(S, 0.72);
      landMark(ctx, e[0], a);
      if (age < 200) {
        const k = 1 - age / 200;
        const q = easeOutCubic(clamp(age / 70, 0, 1));
        dustBurst(ctx, e[0], 917, k, 40 + 50 * q, 20 + 26 * q);
        chips(ctx, e[0], 0, 919, 9, age, 260);
      }
    } else if (S.phase === 'recovery' && S.u > 0.72) {
      // torn out: the scar stays a moment
      const a = clamp(1 - (S.u - 0.72) / 0.28, 0, 1);
      landMark(ctx, 470 / ART_SCALE, a);
    }
  } else if (S.kind === 'book') {
    if (S.trail) bookSmear(ctx, S);
    if (age >= 0) {
      const bx = g.book[0];
      const a = holdFade(S, 0.7);
      floorCracks(ctx, bx, 931, 150, a, 8);
      // the floor caved in under the ledger
      ctx.save();
      ctx.globalAlpha = 0.85 * a;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(bx, 4, 82, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (age < 160) chips(ctx, bx, 0, 933, 12, age, 320);
    }
  } else if (S.kind === 'lunge') {
    if (S.phase === 'active' && S.local < 290) thrustSmear(ctx, g, S.local);
    // the skid: a floor gouge from where the dash began to where it stopped
    const x0 = S.origin;
    if (x0 > -20) return;
    const a = holdFade(S, 0.6);
    stroke(ctx, [[x0, 2], [x0 * 0.5, 3], [-10, 2], [40, 1]], { width: 12, taper: 0.9, seed: 951, alpha: 0.85 * a });
    stroke(ctx, [[x0 * 0.85, 9], [x0 * 0.4, 10], [10, 8]], { width: 5, taper: 0.9, seed: 953, alpha: 0.7 * a });
    if (S.phase === 'active' && S.local < 290) {
      // the body's own after-smear: one solid ink dart from where it started to where
      // it is, thick at the body and needle-thin at the origin, cut by paper speed lines
      const k = S.local < 225 ? 1 : 1 - (S.local - 225) / 65;
      ctx.save();
      ctx.globalAlpha = 0.9 * k;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(-20, -18);
      ctx.lineTo(-30, -150);
      ctx.quadraticCurveTo(x0 * 0.45, -120, x0, -70);
      ctx.quadraticCurveTo(x0 * 0.45, -40, -20, -18);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = k;
      ctx.strokeStyle = PAPER;
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const y = -32 - i * 21;
        const l = (-x0) * (0.35 + 0.5 * hashNoise(955, i));
        ctx.lineWidth = i % 2 ? 1.4 : 2.4;
        ctx.beginPath();
        ctx.moveTo(-40 - hashNoise(957, i) * 20, y);
        ctx.lineTo(-40 - l, y + (y + 70) * 0.25);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

// round 5: the thrust itself. From the first frame of the dash a sheaf of ruled speed
// lines runs back from the couched blade's point (a spear-thrust smear), so the strip
// shows the point DRIVING at the challenger, not just a body that has moved.
function thrustSmear(ctx, g, local) {
  const k = local < 215 ? 1 : 1 - (local - 215) / 75;
  if (k <= 0) return;
  const tip = g.tip;
  const grow = 0.45 + 0.55 * easeOutCubic(clamp(local / 70, 0, 1));
  ctx.save();
  // drawn UNDER the figure: the lines show in the air around it and along the floor,
  // the way manga speed lines stream past a body. They start just behind the point.
  const n = 15;
  for (let i = 0; i < n; i++) {
    const y = Math.min(2, tip[1] + 22 - i * 19 - hashNoise(961, i) * 8);
    const near = Math.abs(y - tip[1]) < 28;
    const x0 = tip[0] - 14 - hashNoise(963, i) * (near ? 30 : 140);
    const len = (360 + 380 * hashNoise(965, i)) * grow;
    stroke(ctx, [[x0, y], [x0 - len * 0.5, y + 0.5], [x0 - len, y + 1]], {
      width: near ? 7 : 2.2 + 2.6 * hashNoise(967, i), taper: 0.95, seed: 969 + i, alpha: 0.92 * k,
    });
  }
  ctx.restore();
}

// foreground bits: the lip of broken floor over a buried nib
function drawStrikeOver(ctx, pose) {
  const S = pose.strike;
  if (S.kind !== 'blade') return;
  const age = S.phase === 'active' ? S.local - S.land : 1e4;
  if (age < 0) return;
  const e = bladeEntry(weaponGeom(pose));
  if (!e) return;
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(e[0] - 22, 3);
  ctx.lineTo(e[0] - 12, -5);
  ctx.lineTo(e[0] - 3, -2);
  ctx.lineTo(e[0] + 4, -9);
  ctx.lineTo(e[0] + 14, -3);
  ctx.lineTo(e[0] + 24, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
