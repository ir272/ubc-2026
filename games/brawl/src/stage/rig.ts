// Ringout robot rig: the shared skeleton, pose format, animation system and FighterView that all
// four robots are built on. A fighter file (fighters/kiln.ts is the model to copy) supplies only:
//
//   body      proportions in metres (bone lengths, where the shoulders and neck sit)
//   palette   two-tone livery, trim, glow and eye colours
//   build()   part meshes, hung on the joints through the Kit (rounded boxes, cylinders, custom)
//   poses     key poses (stance, air, crouch, shield, hang ...). Anything left out is derived
//             from the stance, so a fighter animates completely before its bespoke poses exist
//   moves     per move: wind / strike / follow poses and which limb carries the hitbox
//   update()  optional per-frame hook for extras: furnace doors, clamp fingers, antennae, vents
//
// ------------------------------------------------------------------------------------------------
// The skeleton (every joint is a THREE.Group; meshes hang on them)
//
//   root (world: the sim's feet point, set by pose())
//    ├ ground: contact shadow + side-colour marker, kept on the deck below the robot
//    └ mover (pose x/y/z) > lean (pose lean, about the feet) > spin (pose spin, about the body
//      centre) > squash (scale about the feet) > yaw (facing, three-quarter turn, turns)
//        └ hips ─┬ chest ─┬ head
//                │        ├ shoulderL > armL > foreL > [stretchL] handL
//                │        └ shoulderR > armR > foreR > [stretchR] handR
//                ├ thighL > shinL > footL
//                └ thighR > shinR > footR
//
// Joint frames: x = the robot's forward (its facing), y = up, z = the robot's right. Limb joints
// sit at the proximal end and the segment hangs down -y. Spine joints (hips, chest, head) point up.
// `stretchL/R` is a group at the end of the forearm whose scale.y is the piston extension in
// metres: put a unit-length rod (y 0 to -1) in it and it fills the gap when the arm telescopes.
//
// ------------------------------------------------------------------------------------------------
// Poses
//
// A Pose is a flat Float32Array (POSE_LEN). Per joint three angles in radians:
//   p (pitch)  + swings the segment's far end FORWARD (arms raise forward, spine bends forward,
//              a knee bends with NEGATIVE pitch, an elbow with POSITIVE pitch)
//   t (twist)  + spine turns toward the robot's own right; limbs: + rotates outward
//   s (spread) + moves the far end AWAY from the body midline (arms out, legs apart, a shoulder
//              shrugs up); spine: + side-bends toward the robot's right
// Left and right are mirrored for you, so `arms: [40, 0, 20]` raises both arms the same way.
// Root channels: x (forward along facing, m), y (up, m), z (toward camera, m), lean (whole body
// tilt about the feet, + forward), spin (about the body centre, + rolls forward), yaw (+ turns the
// front toward the camera), squash (+ squash, - stretch). gripL/R 0 open .. 1 fist, glow 0..1,
// eyes (-1 off .. +1 hot). Feet: fL/fR = [x forward, y lift] targets for the planted-foot IK and
// `plant` 0..1 (1 = feet locked to the deck by IK, 0 = legs posed by angles, as in the air).
// aux[0..7] are free channels a fighter can use in update() (door hinge, piston pump, fingers).
//
// Author poses with pose({...}, base) in DEGREES; they are converted once at load. At run time
// nothing allocates: poses are mixed into preallocated arrays.
//
// ------------------------------------------------------------------------------------------------
// Moves
//
// strike(md, base, { wind, strike, follow, limb }) turns a MoveDef into keys from its frame data:
// a quick anticipation into `wind` in the first half of startup, a creep deeper until one frame
// before the hitbox, a 2-frame snap into `strike`, the strike held through the active frames, an
// overshoot into `follow`, then an ease back into the stance. While the hitbox is out the limb
// named by `limb` is driven by IK to the hitbox centre (the rig reads ctx.fighterDefs), so what
// you see hit is what the sim says hit. Kiln's arms are pistons and telescope to get there.
//
// Round 2 (all additive, older fighter files keep working):
//  - Line of action channels: curve (spine C-curve over hips, chest and head), sway (pelvis back,
//    chest forward), counter (shoulders against hips), stretch + lineAng (whole-body stretch along
//    any direction, volume kept). Author them in pose({ curve, sway, counter, stretch, lineAng }).
//  - Every strike gets an automatic accent from its hitbox: anticipation squash, then a stretch
//    toward the hit, a lunge, counter-rotation and the off arm thrown back (MoveAnim.accent scales
//    it, 0 turns it off). The striking limb reaches to the far side of the hitbox (reachOut).
//  - Recoveries: overshoot 2-3 frames past the contact pose, snap into a distinct recovery pose
//    (StrikePoses.recover, or derived: arms back to guard, weight settling), hold it breathing,
//    drop to the stance in the last frames. A jolt on the snap, a settle bounce at the recovery.
//  - Hit pause: the victim holds PoseSet.hurt (derived if missing), rattles along the launch line
//    every frame and is knocked a little back so the bodies separate; the attacker trembles.
//  - Materials: a wide cool rim band and top light, semi-gloss livery, bright metallic trim,
//    matte joints, and palette.dark lifted to a lit mid value (litFloor).
//
// ------------------------------------------------------------------------------------------------

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FighterView, StageCtx } from './api.ts';
import { LAYER } from './api.ts';
import type { Action, FighterDef, FighterId, FighterState, Hitbox, MoveDef, MoveId, Side } from '../sim/types.ts';
import { PALETTE } from './style.ts';

// ================================================================================================
// Pose format
// ================================================================================================

export const JOINTS = [
  'hips', 'chest', 'head',
  'shoulderL', 'armL', 'foreL', 'handL',
  'shoulderR', 'armR', 'foreR', 'handR',
  'thighL', 'shinL', 'footL',
  'thighR', 'shinR', 'footR',
] as const;
export type JointName = (typeof JOINTS)[number];
const NJ = JOINTS.length;
export const J = Object.fromEntries(JOINTS.map((n, i) => [n, i])) as Record<JointName, number>;

/** channel indices after the joint angles (joint j uses 3j, 3j+1, 3j+2 = p, t, s) */
export const C = {
  x: NJ * 3,
  y: NJ * 3 + 1,
  z: NJ * 3 + 2,
  lean: NJ * 3 + 3,
  spin: NJ * 3 + 4,
  yaw: NJ * 3 + 5,
  squash: NJ * 3 + 6,
  gripL: NJ * 3 + 7,
  gripR: NJ * 3 + 8,
  glow: NJ * 3 + 9,
  eyes: NJ * 3 + 10,
  fLx: NJ * 3 + 11,
  fLy: NJ * 3 + 12,
  fRx: NJ * 3 + 13,
  fRy: NJ * 3 + 14,
  plant: NJ * 3 + 15,
  aux: NJ * 3 + 16, // 8 channels
  // ---- line of action (round 2). All default 0, so older poses are unchanged. ----
  /** spine C-curve, radians: + bends forward through hips, chest and head together (a hunch),
   *  - arches back. Use it instead of a rigid chest tilt. */
  curve: NJ * 3 + 24,
  /** hip sway, metres: + pushes the pelvis back while the chest stays forward (a lunge's S-line) */
  sway: NJ * 3 + 25,
  /** shoulder counter-rotation, radians: + twists the chest toward the robot's right (its right
   *  shoulder goes back) and the hips the other way. A punch with the right is + in the wind-up
   *  and - at the hit. */
  counter: NJ * 3 + 26,
  /** whole-body stretch along the line of action: + long and thin, - squashed (volume kept) */
  stretch: NJ * 3 + 27,
  /** direction of that line, radians from straight up, + toward the facing */
  lineAng: NJ * 3 + 28,
} as const;
export const POSE_LEN = C.lineAng + 1;
export type Pose = Float32Array;

const DEG = Math.PI / 180;
type Rot = [number, number?, number?];

/** Authoring form of a pose. Angles in degrees. Paired keys (arms, fores ...) set both sides. */
export interface PoseSpec {
  hips?: Rot; chest?: Rot; head?: Rot;
  shoulderL?: Rot; armL?: Rot; foreL?: Rot; handL?: Rot;
  shoulderR?: Rot; armR?: Rot; foreR?: Rot; handR?: Rot;
  thighL?: Rot; shinL?: Rot; footL?: Rot;
  thighR?: Rot; shinR?: Rot; footR?: Rot;
  shoulders?: Rot; arms?: Rot; fores?: Rot; hands?: Rot; thighs?: Rot; shins?: Rot; feet?: Rot;
  x?: number; y?: number; z?: number;
  lean?: number; spin?: number; yaw?: number; squash?: number;
  grip?: number; gripL?: number; gripR?: number; glow?: number; eyes?: number;
  fL?: [number, number]; fR?: [number, number]; plant?: number;
  aux?: Record<number, number>;
  /** line of action: spine curve (deg), hip sway (m), counter-rotation (deg), body stretch along
   *  `lineAng` (deg from up, + toward the facing). See C.curve .. C.lineAng. */
  curve?: number; sway?: number; counter?: number; stretch?: number; lineAng?: number;
}

const PAIRS: [keyof PoseSpec, JointName, JointName][] = [
  ['shoulders', 'shoulderL', 'shoulderR'], ['arms', 'armL', 'armR'], ['fores', 'foreL', 'foreR'],
  ['hands', 'handL', 'handR'], ['thighs', 'thighL', 'thighR'], ['shins', 'shinL', 'shinR'], ['feet', 'footL', 'footR'],
];

export function emptyPose(): Pose {
  const p = new Float32Array(POSE_LEN);
  p[C.plant] = 1;
  return p;
}

function setRotDeg(p: Pose, j: number, r: Rot): void {
  p[j * 3] = r[0] * DEG;
  if (r[1] !== undefined) p[j * 3 + 1] = r[1] * DEG;
  if (r[2] !== undefined) p[j * 3 + 2] = r[2] * DEG;
}

/** Build a pose (load time only). Unspecified channels come from `base`. Rot entries replace
 *  the pitch and any twist/spread given; leave twist/spread out to keep the base's. */
export function pose(spec: PoseSpec, base?: Pose): Pose {
  const p = base ? new Float32Array(base) : emptyPose();
  for (const [k, l, r] of PAIRS) {
    const v = spec[k] as Rot | undefined;
    if (v) {
      setRotDeg(p, J[l], v);
      setRotDeg(p, J[r], v);
    }
  }
  for (const n of JOINTS) {
    const v = spec[n];
    if (v) setRotDeg(p, J[n], v);
  }
  if (spec.x !== undefined) p[C.x] = spec.x;
  if (spec.y !== undefined) p[C.y] = spec.y;
  if (spec.z !== undefined) p[C.z] = spec.z;
  if (spec.lean !== undefined) p[C.lean] = spec.lean * DEG;
  if (spec.spin !== undefined) p[C.spin] = spec.spin * DEG;
  if (spec.yaw !== undefined) p[C.yaw] = spec.yaw * DEG;
  if (spec.squash !== undefined) p[C.squash] = spec.squash;
  if (spec.grip !== undefined) p[C.gripL] = p[C.gripR] = spec.grip;
  if (spec.gripL !== undefined) p[C.gripL] = spec.gripL;
  if (spec.gripR !== undefined) p[C.gripR] = spec.gripR;
  if (spec.glow !== undefined) p[C.glow] = spec.glow;
  if (spec.eyes !== undefined) p[C.eyes] = spec.eyes;
  if (spec.fL) { p[C.fLx] = spec.fL[0]; p[C.fLy] = spec.fL[1]; }
  if (spec.fR) { p[C.fRx] = spec.fR[0]; p[C.fRy] = spec.fR[1]; }
  if (spec.plant !== undefined) p[C.plant] = spec.plant;
  if (spec.aux) for (const k of Object.keys(spec.aux)) p[C.aux + Number(k)] = spec.aux[Number(k)];
  if (spec.curve !== undefined) p[C.curve] = spec.curve * DEG;
  if (spec.sway !== undefined) p[C.sway] = spec.sway;
  if (spec.counter !== undefined) p[C.counter] = spec.counter * DEG;
  if (spec.stretch !== undefined) p[C.stretch] = spec.stretch;
  if (spec.lineAng !== undefined) p[C.lineAng] = spec.lineAng * DEG;
  return p;
}

/** a new pose between a and b (load time) */
export function between(a: Pose, b: Pose, t: number): Pose {
  const p = new Float32Array(POSE_LEN);
  mixInto(p, a, b, t);
  return p;
}

// ---- run-time pose math (no allocation) ----
export function copyPose(out: Pose, a: Pose): Pose {
  out.set(a);
  return out;
}
export function mixInto(out: Pose, a: Pose, b: Pose, t: number): Pose {
  if (t <= 0) return copyPose(out, a);
  if (t >= 1) return copyPose(out, b);
  for (let i = 0; i < POSE_LEN; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}
/** out += (b - a) * w : add the difference between two poses (for layering a delta) */
export function addDelta(out: Pose, a: Pose, b: Pose, w: number): Pose {
  if (w === 0) return out;
  for (let i = 0; i < POSE_LEN; i++) out[i] += (b[i] - a[i]) * w;
  return out;
}
export function addRot(out: Pose, j: number, p: number, t = 0, s = 0): void {
  out[j * 3] += p;
  out[j * 3 + 1] += t;
  out[j * 3 + 2] += s;
}

// ================================================================================================
// Easing
// ================================================================================================

export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) * (1 - t) * (1 - t),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - 4 * (1 - t) * (1 - t) * (1 - t)),
  outQuart: (t: number) => 1 - (1 - t) ** 4,
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutSine: (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  /** overshoots then settles */
  outBack: (t: number) => {
    const c = 1.9;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  },
};

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};
/** 0 -> 1 -> 0 over [a, b] with a fast rise */
function bump(f: number, a: number, peak: number, b: number): number {
  if (f <= a || f >= b) return 0;
  if (f < peak) return ease.outCubic((f - a) / (peak - a));
  return 1 - ease.inOutSine((f - peak) / (b - peak));
}

// ================================================================================================
// Spec types (what a fighter file supplies)
// ================================================================================================

export interface Proportions {
  /** foot joint (ankle) above the sole */
  ankle: number;
  shin: number;
  thigh: number;
  /** distance between the two hip joints */
  hipWidth: number;
  /** chest joint above the hip joint */
  chestY: number;
  /** neck (head joint) in the chest frame */
  neckY: number;
  neckX: number;
  /** shoulder joints in the chest frame (z is the distance from the midline) */
  shoulderX: number;
  shoulderY: number;
  shoulderZ: number;
  upperArm: number;
  forearm: number;
  /** wrist to the centre of the fist (the point that must reach a hitbox) */
  handReach: number;
  /** distance between the feet at rest, sideways */
  stanceWidth: number;
  /** how far the forearm can telescope, metres (0 = rigid arms) */
  armStretch: number;
  /** height of the body centre (pivot for spins and tumbles) */
  centerY: number;
}

export interface Palette {
  paint: string; // main livery colour
  paint2: string; // second livery colour
  trim: string; // bright trim (brass, chrome)
  dark: string; // joints, rubber, iron
  glow: string; // emissive vents (heat, power)
  eye: string; // emissive eyes
  /** livery for the mirror match (side 1 when both pick the same robot) */
  alt?: { paint: string; paint2: string; rim?: string };
  /** round 3: rim light colour; pick one that contrasts with the livery (default cool blue) */
  rim?: string;
}

export interface GaitSpec {
  /** metres of travel per full walk / run cycle (two steps), share of the cycle a foot is planted */
  walkCycle: number; walkDuty: number; walkLift: number; walkBob: number; walkSwing: number; walkLean: number;
  runCycle: number; runDuty: number; runLift: number; runBob: number; runSwing: number; runLean: number;
  /** idle breathing: cycles per second and depth */
  breathRate: number; breathDepth: number;
  /** frames for a turn-around */
  turnFrames: number;
}

/** keyed animation of one move */
export interface Key {
  f: number;
  /** 'base' = the stance on the ground, the air pose in the air */
  pose: Pose | 'base';
  /** easing used to arrive at this key from the previous one */
  ease?: Ease;
  /** round 2, all optional: mix the key toward the base pose by this much (0..1) when it is used */
  toBase?: number;
  /** extra mix of the arm channels (shoulders, arms, forearms, hands, grips) toward the base, so a
   *  striking arm can snap back to guard while the body still holds the lunge */
  armsToBase?: number;
  /** metres to drop the root (weight settling); adds a matching squash */
  dip?: number;
}

export type Limb = 'handL' | 'handR' | 'hands' | 'footL' | 'footR' | 'feet' | 'body' | 'none';

export interface MoveAnim {
  keys: Key[];
  /** which limb carries the hitbox (the IK target) */
  limb: Limb;
  /** override reach points: [frame, x, y] in the fighter's frame (x forward, y up from the feet),
   *  linearly interpolated by frame. Frames count from the first active frame (0 = startup + 1),
   *  so they survive retuned frame data. Default: the centre of the hitbox active at that frame. */
  path?: [number, number, number][];
  /** how many full turns about the vertical axis across the active frames (spinning moves) */
  spinTurns?: number;
  /** frames [from, to] over which IK pulls the limb to its target (default: the hitbox frames) */
  reach?: [number, number];
  /** grip of the striking hand while reaching (default fist) */
  grip?: number;
  /** round 2: how far past the hitbox centre the limb reaches, as a share of the hitbox radius,
   *  along the line from the shoulder (default 0.65). The limb stretches to the far side of the
   *  hitbox so the outline changes as much as the sim allows. 0 = the centre, as in round 1. */
  reachOut?: number;
  /** round 2: strength of the automatic line-of-action accent (whole-body stretch toward the hit,
   *  lunge, counter-rotation, anticipation squash). Default from the move's damage; 0 = off. */
  accent?: number;
  /** frame the recovery pose is reached (filled by strike(); the rig kicks secondary motion there) */
  recoverAt?: number;
}

/** where a held opponent's chest sits, relative to the holder's feet (x forward, y up), and how
 *  it is turned (spin, degrees, + = rolled forward over the holder) */
export interface CarryOut {
  x: number;
  y: number;
  spin: number;
}
/** `def` is the holder, `held` the robot being carried (its size sets how far out it sits) */
export type CarryFn = (move: MoveId | null, f: number, def: FighterDef, out: CarryOut, held?: FighterDef) => void;

/** how far in front of the holder's feet a held robot's centre sits: the two half widths and a gap */
export function carryReach(def: FighterDef, held: FighterDef | undefined, gap = 0.2): number {
  return def.width * 0.5 + (held ? held.width * 0.5 : 0.25) + gap;
}

export type ShowName = 'select' | 'versus' | 'wait' | 'win' | 'lose';

/** the key poses an action animation reads. Missing ones are derived from the stance. */
export interface PoseSet {
  stance: Pose;
  air: Pose;
  crouch: Pose; // jumpsquat bottom, landing
  rise: Pose; // just off the ground, stretched
  apex: Pose; // top of the arc, tucked
  fall: Pose;
  fastfall: Pose;
  airjump: Pose; // the kick of a double jump
  dash: Pose; // first frames of a run
  skid: Pose;
  pivot: Pose; // middle of a turn-around
  shield: Pose;
  dizzy: Pose;
  rollTuck: Pose;
  spot: Pose;
  airdodge: Pose;
  hold: Pose;
  held: Pose;
  flinch: Pose; // hit from the front, light
  /** the impact frame: held through the hit pause, so the freeze reads as a blow (round 2) */
  hurt: Pose;
  tumble: Pose; // launched
  lying: Pose; // knockdown on the back
  getup: Pose; // pushing up
  hang: Pose; // ledge
  climb: Pose; // half way over the ledge
  helpless: Pose;
  respawn: Pose;
  entrance: Pose;
  win: Pose;
  lose: Pose;
  versus: Pose;
  walk: Pose; // base the walk cycle is layered on
  run: Pose; // base the run cycle is layered on
}

/** a full replacement for one action's animation */
export type ActionAnim = (a: AnimArgs, out: Pose) => void;

export interface RobotSpec {
  id: FighterId;
  body: Proportions;
  palette: Palette;
  gait: GaitSpec;
  /** degrees the robot turns toward the camera from flat profile (the genre stands three-quarter) */
  threeQuarter?: number;
  build(kit: Kit): void;
  poses: Partial<PoseSet> & { stance: Pose; air: Pose };
  moves?: Partial<Record<MoveId, MoveAnim>>;
  actions?: Partial<Record<Action, ActionAnim>>;
  carry?: CarryFn;
  /** pose for the screens; t = seconds. Default: built from poses.versus / win / lose / stance */
  show?: Partial<Record<ShowName, (t: number, out: Pose, P: PoseSet) => void>>;
  /** per-frame extras, after the skeleton is posed. `s` is null in showPose. */
  update?(h: RigHandles, p: Pose, s: FighterState | null, info: FrameInfo): void;
  /** round 3: how much the neck counters the body's forward pitch so the face stays on the
   *  opponent (0 off .. 1 fully level; default 0.75). Full in locomotion, 0.6 in attacks, off in
   *  hurt, tumble, knockdown and the like. */
  headLevel?: number;
}

export interface FrameInfo {
  /** seconds since the view was made (always moving, for vents and flicker) */
  t: number;
  /** smash charge 0..1 while charging or striking after a charge */
  charge: number;
  armor: boolean;
  /** current move and its fractional frame, or null */
  move: MoveId | null;
  f: number;
}

export interface AnimArgs {
  s: FighterState;
  other: FighterState | null;
  /** fractional action frame (1 = the first tick of the action) */
  f: number;
  /** seconds, for cycles */
  t: number;
  /** locomotion phase in cycles, driven by distance travelled (feet never slide) */
  phase: number;
  def: FighterDef;
  spec: RobotSpec;
  P: PoseSet;
  /** scratch poses free to use inside an ActionAnim */
  tmp: [Pose, Pose, Pose];
}

// ================================================================================================
// Materials: painted metal with a cool rim term and a flat-colour flash, one program for all
// ================================================================================================

export interface RobotUniforms {
  flash: { value: number };
  flashColor: { value: THREE.Color };
  white: { value: number };
  rim: { value: number };
  rimColor: { value: THREE.Color };
}

function makeUniforms(): RobotUniforms {
  return {
    flash: { value: 0 },
    flashColor: { value: new THREE.Color(1, 1, 1) },
    white: { value: 0 },
    rim: { value: 1 },
    rimColor: { value: new THREE.Color('#9cc4ff') },
  };
}

/** Painted metal for robot parts: the rim light that pops the robot off the set, the hit flash and
 *  the invulnerability flicker are in the shader. Use this for every robot material.
 *  `rim` scales the rim band; `spec` (round 3) scales a tight key highlight from the upper front
 *  (glossy enamel about 0.8, bare steel 1.2, rubber and joints 0.15). */
export function robotMaterial(u: RobotUniforms, params: THREE.MeshStandardMaterialParameters, rim = 1, spec = 0.6): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlash = u.flash;
    sh.uniforms.uFlashColor = u.flashColor;
    sh.uniforms.uWhite = u.white;
    sh.uniforms.uRim = u.rim;
    sh.uniforms.uRimColor = u.rimColor;
    sh.uniforms.uRimK = { value: rim };
    sh.uniforms.uSpecK = { value: spec };
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uFlash; uniform vec3 uFlashColor; uniform float uWhite; uniform float uRim; uniform vec3 uRimColor; uniform float uRimK; uniform float uSpecK;\nfloat gRimF;',
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  // rim: a crisp coloured band on every edge turning away from the camera, strongest on the
  // upper and back-facing sides, so each limb separates from the dark set at match size
  vec3 rv = normalize(vViewPosition);
  vec3 nn = normalize(normal);
  float rf = 1.0 - clamp(dot(nn, rv), 0.0, 1.0);
  gRimF = rf;
  float up = clamp(nn.y * 0.6 + 0.55, 0.0, 1.0);
  float band = smoothstep(0.42, 0.78, rf);
  float rk = band * (0.3 + 0.7 * up);
  // a cool top light on up-facing planes (the floodlights): flat box tops never go dead
  float top = smoothstep(0.35, 0.95, nn.y) * 0.2;
  outgoingLight += uRimColor * (rk * 1.7 + top) * uRim * uRimK;
  // a tight key highlight from the upper front: enamel and steel get a clear hot spot
  vec3 ls = normalize(vec3(-0.35, 0.8, 0.5));
  float sp = pow(max(dot(nn, normalize(ls + rv)), 0.0), 48.0);
  outgoingLight += vec3(1.0, 0.96, 0.88) * sp * 1.6 * uSpecK;
  // a little bounce from the lit deck on down-facing sides, so tucked limbs never go to mud
  outgoingLight += diffuseColor.rgb * vec3(0.3, 0.36, 0.4) * 0.3 * clamp(0.25 - nn.y * 0.75, 0.0, 1.0) * uRimK;
}
#include <opaque_fragment>`,
      )
      .replace(
        '#include <dithering_fragment>',
        // the flash is flat: the whole robot toward one colour (white, ink or a silhouette dark).
        // Coloured tints are refused in setFlash (clean look, 2026-11-19: no pink hit tint).
        `gl_FragColor.rgb = mix(gl_FragColor.rgb, uFlashColor, uFlash);
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), uWhite);
#include <dithering_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'ringout-robot-v3';
  return m;
}

/** joints and limbs never go near-black: they must read against the night set at match size.
 *  Lifts a colour's HSL lightness to at least `minL` (sRGB), keeping its hue. */
export function litFloor(hex: string, minL = 0.3): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (hsl.l < minL) c.setHSL(hsl.h, Math.min(hsl.s, 0.25), minL);
  return c;
}

export interface RobotMaterials {
  paint: THREE.MeshStandardMaterial;
  paint2: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  side: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial;
}

function makeMaterials(u: RobotUniforms, pal: Palette, sideColor: string, alt: boolean): RobotMaterials {
  const paint = alt && pal.alt ? pal.alt.paint : pal.paint;
  const paint2 = alt && pal.alt ? pal.alt.paint2 : pal.paint2;
  // gloss by part: livery is semi-gloss enamel, the second tone a satin, trim bare bright steel
  // (it mirrors the floodlights), joints and rubber matte. Dark parts get a lit floor.
  return {
    paint: robotMaterial(u, { color: paint, roughness: 0.3, metalness: 0.12, envMapIntensity: 1.1 }, 1, 0.85),
    paint2: robotMaterial(u, { color: litFloor(paint2, 0.2), roughness: 0.46, metalness: 0.3 }, 1, 0.45),
    trim: robotMaterial(u, { color: pal.trim, roughness: 0.2, metalness: 0.85, envMapIntensity: 1.6 }, 1, 1.25),
    dark: robotMaterial(u, { color: litFloor(pal.dark, 0.3), roughness: 0.72, metalness: 0.1 }, 0.9, 0.15),
    side: robotMaterial(u, { color: sideColor, roughness: 0.4, metalness: 0.15, emissive: sideColor, emissiveIntensity: 0.28 }, 1, 0.7),
    glow: robotMaterial(u, { color: '#1a0c06', emissive: pal.glow, emissiveIntensity: 1.6, roughness: 0.6 }, 0, 0),
    eye: robotMaterial(u, { color: '#111111', emissive: pal.eye, emissiveIntensity: 2.2, roughness: 0.4 }, 0, 0),
  };
}

// ================================================================================================
// Geometry cache (shared between views: the pose sheet makes dozens of robots)
// ================================================================================================

const geoCache = new Map<string, { g: THREE.BufferGeometry; n: number }>();
function acquireGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let e = geoCache.get(key);
  if (!e) {
    e = { g: make(), n: 0 };
    geoCache.set(key, e);
  }
  e.n++;
  return e.g;
}
function releaseGeo(key: string): void {
  const e = geoCache.get(key);
  if (!e) return;
  if (--e.n <= 0) {
    e.g.dispose();
    geoCache.delete(key);
  }
}

let shadowTex: THREE.Texture | null = null;
let shadowTexN = 0;
function acquireShadowTex(): THREE.Texture {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)');
    gr.addColorStop(0.45, 'rgba(0,0,0,0.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  shadowTexN++;
  return shadowTex;
}
function releaseShadowTex(): void {
  if (--shadowTexN <= 0 && shadowTex) {
    shadowTex.dispose();
    shadowTex = null;
    shadowTexN = 0;
  }
}

// ================================================================================================
// Geometry helpers: build detailed parts and merge them, one mesh per bone and material
// ================================================================================================

const _gm = new THREE.Matrix4();
const _ge = new THREE.Euler();
function placeGeo(g: THREE.BufferGeometry, at?: V3, rotDeg?: V3): THREE.BufferGeometry {
  if (rotDeg) {
    _ge.set(rotDeg[0] * DEG, rotDeg[1] * DEG, rotDeg[2] * DEG);
    g.applyMatrix4(_gm.makeRotationFromEuler(_ge));
  }
  if (at) g.translate(at[0], at[1], at[2]);
  return g;
}

/** geometry builders for build(): G.merge([...]) makes one mesh out of many details */
export const G = {
  /** rounded box w (x) h (y) d (z), bevel radius r */
  box(w: number, h: number, d: number, r = 0.03, at?: V3, rotDeg?: V3): THREE.BufferGeometry {
    const rr = Math.min(r, Math.min(w, h, d) * 0.49);
    const g = rr > 0.002 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d);
    return placeGeo(g, at, rotDeg);
  },
  /** cylinder along y (rotate [0,0,90] for along x, [90,0,0] for along z) */
  cyl(rTop: number, rBot: number, h: number, seg = 12, at?: V3, rotDeg?: V3): THREE.BufferGeometry {
    return placeGeo(new THREE.CylinderGeometry(rTop, rBot, h, seg), at, rotDeg);
  },
  sphere(r: number, seg = 10, at?: V3, scale?: V3): THREE.BufferGeometry {
    const g = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7)));
    if (scale) g.scale(scale[0], scale[1], scale[2]);
    return placeGeo(g, at);
  },
  /** a row of rivet heads from a to b (n of them), each a squat cylinder facing `axis` */
  rivets(n: number, a: V3, b: V3, r = 0.022, axis: 'x' | 'y' | 'z' = 'x'): THREE.BufferGeometry[] {
    const out: THREE.BufferGeometry[] = [];
    const rot: V3 = axis === 'x' ? [0, 0, 90] : axis === 'z' ? [90, 0, 0] : [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      out.push(G.cyl(r, r, r * 0.9, 8, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], rot));
    }
    return out;
  },
  /** merge geometries into one (all must carry position, normal and uv, which these all do) */
  merge(list: (THREE.BufferGeometry | THREE.BufferGeometry[])[]): THREE.BufferGeometry {
    const flat: THREE.BufferGeometry[] = [];
    for (const x of list) {
      if (Array.isArray(x)) flat.push(...x);
      else flat.push(x);
    }
    const norm = flat.map((g) => (g.index ? g.toNonIndexed() : g));
    const m = mergeGeometries(norm, false);
    if (!m) throw new Error('rig: G.merge failed');
    for (const g of flat) g.dispose();
    for (const g of norm) g.dispose();
    return m;
  },
};

// ================================================================================================
// Kit: what build() uses to hang parts on the skeleton
// ================================================================================================

export type V3 = [number, number, number];

export interface Kit {
  def: FighterDef;
  body: Proportions;
  side: Side;
  alt: boolean;
  mats: RobotMaterials;
  uniforms: RobotUniforms;
  /** a joint, or a group made with kit.group() */
  joint(name: string): THREE.Object3D;
  /** an extra pivot under a joint (doors, antennae, fingers). Find it later with h.part(name). */
  group(parent: string, name: string, at?: V3, rotDeg?: V3): THREE.Group;
  /** rounded box w (x) h (y) d (z), centred at `at` in the joint frame. bevel in metres. */
  box(parent: string, size: V3, mat: THREE.Material, at?: V3, rotDeg?: V3, bevel?: number): THREE.Mesh;
  /** cylinder along y, centred at `at` */
  cyl(parent: string, rTop: number, rBot: number, h: number, mat: THREE.Material, at?: V3, rotDeg?: V3, seg?: number): THREE.Mesh;
  sphere(parent: string, r: number, mat: THREE.Material, at?: V3, scale?: V3, seg?: number): THREE.Mesh;
  /** any geometry, cached under `key` (made once, shared by every view of this fighter) */
  mesh(parent: string, key: string, make: () => THREE.BufferGeometry, mat: THREE.Material, at?: V3, rotDeg?: V3, scale?: V3): THREE.Mesh;
  /** hand the view something to dispose with it (an extra material, a texture) */
  own<T extends { dispose(): void }>(x: T): T;
  /** round 3: a face. Two bright eyes drawn on a flat panel that faces the robot's forward (+x),
   *  centred at `at` in the parent frame, `w` across and `h` tall. The rig sets the expression
   *  every frame from the fight state: narrow on startup, fierce on the strike, wide when hit,
   *  crossed out when launched, shut on the deck, arcs on a win, drooping on a loss, blinking idle.
   *  Put it a few millimetres in front of a dark visor plate. One draw call. */
  eyes(parent: string, o: EyeOpts): THREE.Mesh;
}

/** round 3: where a robot's eyes sit (see Kit.eyes) */
export interface EyeOpts {
  at: V3;
  /** panel width (across the face, the robot's z) and height, metres */
  w: number;
  h: number;
  rotDeg?: V3;
  /** eye colour (default palette.eye); use a colour found nowhere else on the robot */
  color?: string;
  /** distance between the eye centres as a share of w (default 0.5) */
  sep?: number;
  /** eye size multiplier (default 1) */
  size?: number;
}

/** the expression the face shows (all in units of the panel height; the rig fills it) */
interface Expr {
  open: number; // eye half-height
  w: number; // eye half-width
  tilt: number; // radians, + inner corners down (fierce), - inner corners up (worried)
  curve: number; // 0..1 bends each eye into an arc (happy)
  x: number; // 0..1 crossed out
  bright: number;
  asym: number; // -1..1 one eye bigger than the other (dazed)
  dy: number; // whole look up (+) or down (-)
}

const EYE_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const EYE_FS = `uniform vec3 uColor; uniform float uOpen, uW, uTilt, uCurve, uX, uBright, uAsym, uSep, uAspect, uSize, uDy, uWhite;
varying vec2 vUv;
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
float eye(vec2 p, float side) {
  float k = uSize * (1.0 + uAsym * side * 0.35);
  p /= k;
  // fierce: the inner corner (toward the middle) drops
  vec2 q = rot(p, uTilt * side);
  // happy: the middle of the eye rises into an arc
  float u = clamp(q.x / max(uW, 0.01), -1.0, 1.0);
  q.y -= uCurve * uW * 0.9 * (1.0 - u * u) - uCurve * uW * 0.35;
  float th = mix(uOpen, 0.045, uCurve);
  float d = sdBox(q, vec2(uW, max(0.02, th)), min(uW, max(0.02, th)) * 0.92);
  // crossed out
  float bx = min(sdBox(rot(p, 0.785), vec2(uW * 0.95, 0.05), 0.04), sdBox(rot(p, -0.785), vec2(uW * 0.95, 0.05), 0.04));
  return mix(d, bx, uX) * k;
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  p.y -= uDy;
  float sx = uSep * uAspect * 0.5;
  float d = min(eye(p - vec2(sx, 0.0), 1.0), eye(p + vec2(sx, 0.0), -1.0));
  float aa = max(fwidth(d), 0.004);
  float a = smoothstep(aa, -aa, d);
  float core = smoothstep(0.0, -0.09, d);
  float halo = exp(-max(d, 0.0) * 26.0) * 0.32;
  vec3 c = mix(uColor, vec3(1.0), core * 0.7) * a + uColor * halo * (1.0 - a);
  c = mix(c, vec3(1.0), uWhite * a);
  gl_FragColor = vec4(c * uBright, 1.0);
}`;

/** handles update() gets each frame */
export interface RigHandles {
  root: THREE.Object3D;
  joint(name: JointName): THREE.Object3D;
  part(name: string): THREE.Object3D;
  mats: RobotMaterials;
  uniforms: RobotUniforms;
  side: Side;
  /** current piston extension of each forearm, metres */
  stretch: [number, number];
}

// ================================================================================================
// IK (two-bone, analytic, in the parent space of the upper bone, allocation-free)
// ================================================================================================

const DOWN = new THREE.Vector3(0, -1, 0);
const _t = new THREE.Vector3();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _pd = new THREE.Vector3();
const _n = new THREE.Vector3();
const _u = new THREE.Vector3();
const _nl = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'ZXY');

/** Points `upper` and `lower` (both resting along -y) so the end of `lower` (length b, plus up to
 *  maxExt of telescoping) reaches `target` (world), bending toward `pole` (world). Blends from the
 *  current rotations by w. Returns the extension used. Needs fresh world matrices on upper.parent. */
export function solveTwoBone(upper: THREE.Object3D, lower: THREE.Object3D, a: number, b: number, target: THREE.Vector3, pole: THREE.Vector3, w: number, maxExt: number): number {
  if (w <= 0.001) return 0;
  const parent = upper.parent!;
  _m.copy(parent.matrixWorld).invert();
  _t.copy(target).applyMatrix4(_m);
  _p.copy(pole).applyMatrix4(_m);
  const S = upper.position;
  _d.subVectors(_t, S);
  let dist = _d.length();
  if (dist < 1e-4) return 0;
  _d.multiplyScalar(1 / dist);
  let ext = 0;
  if (dist > a + b) ext = Math.min(maxExt, dist - a - b);
  const bb = b + ext;
  dist = clamp(dist, Math.abs(a - bb) + 1e-3, a + bb - 1e-4);
  const A = Math.acos(clamp((a * a + dist * dist - bb * bb) / (2 * a * dist), -1, 1));
  const B = Math.acos(clamp((a * a + bb * bb - dist * dist) / (2 * a * bb), -1, 1));
  _pd.subVectors(_p, S);
  _n.crossVectors(_d, _pd);
  if (_n.lengthSq() < 1e-8) _n.set(0, 0, 1);
  _n.normalize();
  _u.copy(_d).applyAxisAngle(_n, A);
  _qa.setFromUnitVectors(DOWN, _u);
  _qi.copy(_qa).invert();
  _nl.copy(_n).applyQuaternion(_qi);
  _qb.setFromAxisAngle(_nl, -(Math.PI - B));
  if (w >= 0.999) {
    upper.quaternion.copy(_qa);
    lower.quaternion.copy(_qb);
  } else {
    upper.quaternion.slerp(_qa, w);
    lower.quaternion.slerp(_qb, w);
  }
  return ext * w;
}

// ================================================================================================
// Default key poses, derived from a fighter's stance (so a new fighter animates from day one)
// ================================================================================================

function derivePoses(spec: RobotSpec, def: FighterDef): PoseSet {
  const given = spec.poses;
  const st = given.stance;
  const air = given.air;
  const h = def.height;
  const P = {} as PoseSet;
  P.stance = st;
  P.air = air;
  P.crouch = given.crouch ?? pose({ y: -h * 0.12, squash: 0.12, chest: [18], head: [-12], arms: [-10, 0, 25], fores: [40], lean: 4 }, st);
  P.rise = given.rise ?? pose({ squash: -0.12, chest: [-6], head: [-10], arms: [-25, 0, 30], fores: [20], thighs: [-6], shins: [-12], feet: [-25], plant: 0 }, air);
  P.apex = given.apex ?? pose({ thighL: [55], shinL: [-80], thighR: [25], shinR: [-60], arms: [20, 0, 35], fores: [50], chest: [10], plant: 0 }, air);
  P.fall = given.fall ?? pose({ arms: [10, 0, 55], fores: [35], thighL: [20], shinL: [-35], thighR: [-5], shinR: [-15], chest: [-4], plant: 0 }, air);
  P.fastfall = given.fastfall ?? pose({ arms: [0, 0, 80], fores: [20], thighs: [0], shins: [-5], squash: -0.1, chest: [-8], plant: 0 }, air);
  P.airjump = given.airjump ?? pose({ thighL: [70], shinL: [-100], thighR: [-20], shinR: [-30], arms: [-40, 0, 40], fores: [30], chest: [-10], squash: -0.08, plant: 0 }, air);
  P.dash = given.dash ?? pose({ lean: 20, chest: [16], head: [-14], armL: [55], armR: [-55], fores: [70], y: -h * 0.04, fL: [0.45, 0], fR: [-0.35, 0.05] }, st);
  P.skid = given.skid ?? pose({ lean: -16, chest: [-12], head: [8], arms: [45, 0, 35], fores: [30], y: -h * 0.07, fL: [0.4, 0], fR: [0.1, 0] }, st);
  P.pivot = given.pivot ?? pose({ y: -h * 0.07, squash: 0.06, chest: [10], arms: [10, 0, 30], fores: [60] }, st);
  P.shield = given.shield ?? pose({ y: -h * 0.05, chest: [14], head: [10], arms: [55, 0, 10], fores: [100, 0, 0], hands: [0], lean: 2 }, st);
  P.dizzy = given.dizzy ?? pose({ y: -h * 0.06, chest: [24, 0, 10], head: [20, 0, 18], arms: [0, 0, 8], fores: [8], eyes: -0.6, lean: 6 }, st);
  P.rollTuck = given.rollTuck ?? pose({ y: -h * 0.18, chest: [50], head: [30], arms: [40, 0, 0], fores: [120], plant: 0, thighs: [90], shins: [-130], squash: 0.05 }, st);
  P.spot = given.spot ?? pose({ y: -h * 0.06, z: -0.45, yaw: 30, chest: [6, 30], arms: [10, 0, 6], fores: [80] }, st);
  P.airdodge = given.airdodge ?? pose({ chest: [35], head: [25], arms: [30], fores: [110], thighs: [70], shins: [-110], plant: 0 }, air);
  P.hold = given.hold ?? pose({ chest: [6], lean: -4, arms: [70, 0, 6], fores: [20], grip: 1 }, st);
  P.held = given.held ?? pose({ chest: [-14], head: [16], arms: [30, 0, 40], fores: [40], thighL: [20], shinL: [-40], thighR: [-10], shinR: [-20], plant: 0, eyes: -0.3 }, air);
  P.flinch = given.flinch ?? pose({ chest: [-30, 8], head: [-30], lean: -10, arms: [35, 0, 50], fores: [30], y: -h * 0.03, eyes: 0.6 }, st);
  // the blow lands: arched back hard, head snapped, arms flung, one knee up, eyes flare
  P.hurt = given.hurt ?? pose({ curve: -24, chest: [-8, 0], head: [-34, 0], lean: -12, armL: [132, 0, 46], armR: [112, 0, 58], fores: [18], thighL: [34], shinL: [-60], plant: 0.5, eyes: 1, grip: 0.2, stretch: 0.08, lineAng: -60 }, st);
  P.tumble = given.tumble ?? pose({ chest: [-20], head: [-20], arms: [60, 0, 80], fores: [30], thighL: [40], shinL: [-70], thighR: [-30], shinR: [-20], plant: 0, eyes: 0.4 }, air);
  P.lying = given.lying ?? pose({ spin: -90, y: -(spec.body.centerY - 0.32), plant: 0, chest: [-5], head: [-20], arms: [10, 0, 50], fores: [20], thighs: [10], shins: [-20], eyes: -0.5 }, air);
  P.getup = given.getup ?? pose({ spin: -45, y: -spec.body.centerY * 0.45, plant: 0, chest: [40], head: [10], armL: [-40, 0, 20], armR: [-50, 0, 20], fores: [10], thighs: [80], shins: [-110] }, air);
  P.hang = given.hang ?? pose({ plant: 0, arms: [170, 0, 15], fores: [0], chest: [-6], head: [-20], thighs: [8], shins: [-14], lean: 0 }, air);
  P.climb = given.climb ?? pose({ plant: 0, arms: [120, 0, 15], fores: [40], chest: [40], thighL: [100], shinL: [-120], thighR: [30], shinR: [-60] }, air);
  P.helpless = given.helpless ?? pose({ arms: [150, 0, 30], fores: [15], chest: [-8], head: [-10], thighs: [10], shins: [-30], plant: 0, eyes: -0.6 }, air);
  P.respawn = given.respawn ?? pose({ chest: [-4], head: [-6], arms: [10, 0, 18], fores: [70] }, st);
  P.entrance = given.entrance ?? pose({ y: -h * 0.16, chest: [40], head: [30], arms: [-10, 0, 30], fores: [20], eyes: -1, glow: 0 }, st);
  P.win = given.win ?? pose({ arms: [160, 0, 30], fores: [20], chest: [-12], head: [-20], grip: 1 }, st);
  P.lose = given.lose ?? pose({ chest: [40], head: [35], arms: [0, 0, 10], fores: [5], y: -h * 0.05, eyes: -0.7, glow: 0 }, st);
  P.versus = given.versus ?? pose({ y: -h * 0.05, chest: [12, -15], arms: [60, 0, 30], fores: [90], yaw: 20 }, st);
  P.walk = given.walk ?? pose({ lean: spec.gait.walkLean }, st);
  P.run = given.run ?? pose({ lean: spec.gait.runLean, curve: 8, chest: [10], head: [-10], arms: [0, 0, 18], fores: [80], yaw: -10 }, st);
  return P;
}

// ================================================================================================
// Moves: keys from frame data, generic templates for any MoveDef
// ================================================================================================

export interface StrikePoses {
  /** deepest anticipation, reached one frame before the hitbox */
  wind: Pose;
  /** optional early anticipation reached half way through startup (default: wind) */
  windEarly?: Pose;
  /** the hit, reached on the first active frame and held */
  strike: Pose;
  /** optional pose for the last active frame (default: strike) */
  strikeEnd?: Pose;
  /** overshoot after the hit */
  follow: Pose;
  limb: Limb;
  path?: [number, number, number][];
  spinTurns?: number;
  reach?: [number, number];
  grip?: number;
  /** frames of the snap into the strike (1 or 2, default 2) */
  snap?: number;
  /** round 2: the distinct pose the move snaps into after the overshoot and holds before dropping
   *  back to the stance. Default: the follow pose with the arms snapped back to guard, the weight
   *  settling, and a third of the way home. */
  recover?: Pose;
  reachOut?: number;
  accent?: number;
}

/** Keys for a move from its frame data: anticipation, snap, hold, overshoot, a snap into a distinct
 *  recovery pose, a hold, then a quick drop to the stance in the last frames. Nothing eases home
 *  across the whole recovery: every phase is a few frames and then a held shape. */
export function strike(md: MoveDef, k: StrikePoses): MoveAnim {
  const S = md.startup;
  const A = md.active;
  const R = md.recovery;
  const T = S + A + R;
  const snap = k.snap ?? 2;
  const snapStart = Math.max(1, S + 1 - snap);
  const early = Math.max(0.6, snapStart * 0.5);
  const fEnd = Math.max(S + 1.2, S + A);
  // overshoot past the contact pose for 2-3 frames
  const fFollow = fEnd + clamp(R * 0.09, 2, 3);
  // snap into the recovery pose in a few frames
  const fRec = Math.min(T - 1.5, fFollow + clamp(R * 0.13, 2, 5));
  // hold it, then drop to the stance in the last frames
  const drop = clamp(R * 0.24, 3, 9);
  const fHold = Math.max(fRec + 0.5, T - drop);
  const rec: Key = k.recover
    ? { f: fRec, pose: k.recover, ease: ease.outCubic }
    : { f: fRec, pose: k.follow, ease: ease.outCubic, toBase: 0.3, armsToBase: 0.75, dip: 0.05 };
  // round 3: the hold drifts a good way home while it settles, so no two frames match
  const hold: Key = k.recover
    ? { f: fHold, pose: k.recover, ease: ease.inOutSine, toBase: 0.32 }
    : { f: fHold, pose: k.follow, ease: ease.inOutSine, toBase: 0.5, armsToBase: 0.85, dip: 0.035 };
  const keys: Key[] = [
    { f: 0, pose: 'base' },
    { f: early, pose: k.windEarly ?? k.wind, ease: ease.outCubic },
    { f: Math.max(early + 0.4, snapStart), pose: k.wind, ease: ease.inOutSine },
    { f: S + 1, pose: k.strike, ease: ease.outQuart },
    { f: fEnd, pose: k.strikeEnd ?? k.strike, ease: ease.inOutSine },
    { f: fFollow, pose: k.follow, ease: ease.outCubic },
    rec,
    hold,
    { f: T, pose: 'base', ease: ease.outCubic },
  ];
  return { keys, limb: k.limb, path: k.path, spinTurns: k.spinTurns, reach: k.reach, grip: k.grip, reachOut: k.reachOut, accent: k.accent, recoverAt: fRec };
}

/** first damaging hitbox (or the first one) */
function mainHitbox(md: MoveDef): Hitbox | null {
  let best: Hitbox | null = null;
  for (const h of md.hitboxes) if (!best || h.damage > best.damage) best = h;
  return best;
}

/** A sensible animation for any move, from its MoveDef alone: the limb and swing are picked from
 *  where the hitbox is. A fighter's own `moves` entries replace these. */
export function genericMove(md: MoveDef, P: PoseSet, def: FighterDef): MoveAnim {
  const h = def.height;
  const air = md.kind === 'air';
  const base = air ? P.air : P.stance;
  const hb = mainHitbox(md);
  const hx = hb ? hb.x : 1;
  const hy = hb ? hb.y : h * 0.5;
  if (md.kind === 'grab') {
    return strike(md, {
      wind: pose({ chest: [-6, 10], arms: [20, 0, 40], fores: [60], grip: 0, y: -h * 0.03 }, base),
      strike: pose({ chest: [16], lean: 8, x: 0.1, arms: [80, 0, 10], fores: [5], grip: 0.2 }, base),
      follow: pose({ chest: [10], lean: 4, arms: [70, 0, 10], fores: [25], grip: 1 }, base),
      limb: 'hands',
      grip: 0.3,
    });
  }
  if (md.kind === 'throw') {
    const back = hx < 0 || (hb && hb.angle > 100 && hb.angle < 260);
    const up = hb && hb.angle >= 70 && hb.angle <= 110;
    const hold = P.hold;
    if (up) {
      return strike(md, {
        wind: pose({ y: -h * 0.08, chest: [20], arms: [60], fores: [40], grip: 1 }, hold),
        strike: pose({ y: h * 0.02, chest: [-14], head: [-25], arms: [170, 0, 15], fores: [5], grip: 0 }, hold),
        follow: pose({ chest: [-8], arms: [150, 0, 20], fores: [20], grip: 0 }, hold),
        limb: 'none',
      });
    }
    if (back) {
      return strike(md, {
        wind: pose({ chest: [10, 40], hips: [0, 25], arms: [80, 0, 10], fores: [30], grip: 1 }, hold),
        strike: pose({ chest: [-10, -70], hips: [0, -40], lean: -8, arms: [100, 0, 50], fores: [10], grip: 0, yaw: -10 }, hold),
        follow: pose({ chest: [-4, -55], hips: [0, -30], arms: [70, 0, 40], fores: [30], grip: 0 }, hold),
        limb: 'none',
      });
    }
    return strike(md, {
      wind: pose({ chest: [-10, 30], lean: -6, armR: [20, 0, 10], foreR: [110], armL: [60], grip: 1 }, hold),
      strike: pose({ chest: [18, -25], lean: 10, x: 0.1, armR: [90, 0, 0], foreR: [0], armL: [30], grip: 0 }, hold),
      follow: pose({ chest: [14, -30], lean: 8, armR: [80], foreR: [20], grip: 0 }, hold),
      limb: 'none',
    });
  }
  // a strike: where is the hitbox?
  if (hb && Math.abs(hx) < 0.35 && hb.r >= 0.9) {
    // centred and big: a spin with the arms out
    return strike(md, {
      wind: pose({ chest: [20, 30], arms: [30, 0, 30], fores: [80], thighs: [60], shins: [-90], squash: 0.05 }, base),
      strike: pose({ chest: [0, -20], arms: [90, 0, 80], fores: [5], thighs: [30], shins: [-50] }, base),
      follow: pose({ chest: [6, -30], arms: [60, 0, 60], fores: [30] }, base),
      limb: 'none',
      spinTurns: 1,
    });
  }
  if (hx < -0.3) {
    // behind: a back kick
    return strike(md, {
      wind: pose({ chest: [30], thighs: [70], shins: [-120], arms: [30, 0, 30], fores: [60] }, base),
      strike: pose({ chest: [40], lean: 20, thighs: [-80], shins: [-5], feet: [-30], arms: [40, 0, 40], fores: [40] }, base),
      follow: pose({ chest: [30], thighs: [-60], shins: [-20] }, base),
      limb: air ? 'feet' : 'footR',
    });
  }
  if (hy < h * 0.15) {
    // below: a stomp
    return strike(md, {
      wind: pose({ thighs: [80], shins: [-120], chest: [-10], arms: [40, 0, 50], fores: [60], squash: 0.05 }, base),
      strike: pose({ thighs: [0], shins: [0], feet: [-20], chest: [10], arms: [60, 0, 70], fores: [20], squash: -0.08 }, base),
      follow: pose({ thighs: [10], shins: [-10], chest: [6] }, base),
      limb: 'feet',
    });
  }
  if (hy > h * 0.85) {
    // overhead
    const both = md.id === 'upsmash';
    return strike(md, {
      wind: pose({ y: -h * 0.08, chest: [25, 20], arms: [-30, 0, 20], fores: [60], squash: 0.06 }, base),
      strike: pose({ y: h * 0.02, chest: [-18, -15], head: [-20], armR: [175, 0, 10], foreR: [0], armL: both ? [175, 0, 10] : [-10], foreL: both ? [0] : [60], squash: -0.06 }, base),
      follow: pose({ chest: [-10, -20], armR: [150, 0, 15], foreR: [20] }, base),
      limb: both ? 'hands' : 'handR',
    });
  }
  if (hy < h * 0.4 && !air) {
    // low forward: a kick
    return strike(md, {
      wind: pose({ chest: [-10], thighR: [60], shinR: [-100], arms: [20, 0, 40], fores: [60] }, base),
      strike: pose({ chest: [-20], lean: -8, thighR: [85], shinR: [0], arms: [-10, 0, 50], fores: [40] }, base),
      follow: pose({ chest: [-14], thighR: [70], shinR: [-20] }, base),
      limb: 'footR',
    });
  }
  // forward: a punch (both hands on the big ones)
  const both = md.id === 'smash' || md.id === 'tilt';
  return strike(md, {
    wind: pose({ chest: [-8, 35], lean: -6, x: -0.05, armR: [-35, 0, 20], foreR: [120], armL: both ? [-35, 0, 20] : [40], foreL: both ? [120] : [80], y: -h * 0.03 }, base),
    strike: pose({ chest: [18, -30], lean: 10, x: 0.12, armR: [85, 0, 0], foreR: [5], armL: both ? [85] : [-10, 0, 20], foreL: both ? [5] : [70] }, base),
    follow: pose({ chest: [22, -38], lean: 14, x: 0.14, armR: [80], foreR: [15] }, base),
    limb: both ? 'hands' : 'handR',
  });
}

/** default carry: where a held opponent sits while held and thrown */
export const defaultCarry: CarryFn = (move, f, def, out, held) => {
  const h = def.height;
  const reach = carryReach(def, held);
  out.x = reach;
  out.y = h * 0.5;
  out.spin = 0;
  if (!move || move === 'grab' || move === 'special') return;
  const md = def.moves[move];
  const rel = md.hitboxes[0]?.from ?? md.startup + 1;
  const t = clamp01(f / rel);
  if (move === 'throwu') {
    const e = ease.inOutCubic(t);
    out.x = reach + (0.15 - reach) * e;
    out.y = h * (0.5 + 0.7 * e);
    out.spin = -20 * e;
  } else if (move === 'throwb') {
    const a = Math.PI * ease.inOutCubic(t);
    out.x = Math.cos(a) * reach;
    out.y = h * 0.55 + Math.sin(a) * h * 0.55;
    out.spin = -180 * ease.inOutCubic(t);
  } else {
    const lift = ease.outCubic(clamp01(t / 0.6));
    const push = ease.inQuad(clamp01((t - 0.6) / 0.4));
    out.x = reach - 0.15 * lift + 0.5 * push;
    out.y = h * (0.5 + 0.15 * lift);
    out.spin = 10 * lift - 30 * push;
  }
};

// ================================================================================================
// The view
// ================================================================================================

const SPEC_BY_FIGHTER = new Map<FighterId, RobotSpec>();
const _carry: CarryOut = { x: 0, y: 0, spin: 0 };
const _flashC = new THREE.Color();
const _flashHsl = { h: 0, s: 0, l: 0 };

const _k0 = new Float32Array(POSE_LEN);
const _k1 = new Float32Array(POSE_LEN);
/** first and last channel of the arm joints (shoulderL .. handR are contiguous) */
const ARM0 = J.shoulderL * 3;
const ARM1 = J.handR * 3 + 3;

/** a key's pose with its base mix applied, into out (or the pose itself when nothing to mix) */
function keyPose(k: Key, base: Pose, out: Pose): Pose {
  const p = k.pose === 'base' ? base : k.pose;
  if (!k.toBase && !k.armsToBase && !k.dip) return p;
  mixInto(out, p, base, k.toBase ?? 0);
  if (k.armsToBase) {
    const w = k.armsToBase;
    for (let i = ARM0; i < ARM1; i++) out[i] += (base[i] - out[i]) * w;
    out[C.gripL] += (base[C.gripL] - out[C.gripL]) * w;
    out[C.gripR] += (base[C.gripR] - out[C.gripR]) * w;
  }
  if (k.dip) {
    out[C.y] -= k.dip;
    out[C.squash] += k.dip * 0.9;
  }
  return out;
}

/** the keyed pose of a move at fractional frame f */
function evalKeys(keys: Key[], f: number, base: Pose, out: Pose): void {
  if (f <= keys[0].f) {
    copyPose(out, keyPose(keys[0], base, _k0));
    return;
  }
  for (let i = 1; i < keys.length; i++) {
    const k1 = keys[i];
    if (f <= k1.f || i === keys.length - 1) {
      const k0 = keys[i - 1];
      const span = Math.max(1e-3, k1.f - k0.f);
      const u = clamp01((f - k0.f) / span);
      const e = (k1.ease ?? ease.inOutSine)(u);
      mixInto(out, keyPose(k0, base, _k0), keyPose(k1, base, _k1), e);
      return;
    }
  }
}

/** frames over which the pose blends into a new action */
function blendFrames(to: Action, from: Action): number {
  switch (to) {
    case 'hitstun':
    case 'land':
    case 'knockdown':
    case 'ledgehang':
    case 'held':
    case 'respawn':
    case 'dead':
    case 'shieldbreak':
      return 0;
    case 'attack':
    case 'charge':
    case 'jumpsquat':
    case 'shield':
    case 'roll':
    case 'spotdodge':
    case 'airdodge':
    case 'shieldstun':
      return 1.5;
    case 'rise':
      return from === 'jumpsquat' ? 1 : 2;
    case 'fall':
      return from === 'rise' ? 7 : 4;
    case 'run':
      return 2;
    case 'idle':
      return from === 'land' ? 5 : from === 'attack' ? 3 : 4;
    case 'walk':
      return 4;
    case 'helpless':
      return 5;
    default:
      return 3;
  }
}

/** Make a robot FighterView from a spec. Every fighter file calls this. */
export function createRobot(ctx: StageCtx, opts: { side: Side; sideColor: string; alt: boolean }, spec: RobotSpec): FighterView {
  SPEC_BY_FIGHTER.set(spec.id, spec);
  const def = ctx.fighterDefs[spec.id];
  const B = spec.body;
  const P = derivePoses(spec, def);
  const moves = {} as Record<MoveId, MoveAnim>;
  for (const id of Object.keys(def.moves) as MoveId[]) moves[id] = spec.moves?.[id] ?? genericMove(def.moves[id], P, def);
  const tq = (spec.threeQuarter ?? 35) * DEG;

  // ---- skeleton ----
  const root = new THREE.Group();
  root.name = `robot-${spec.id}-${opts.side}`;
  const ground = new THREE.Group();
  const mover = new THREE.Group();
  const leanG = new THREE.Group();
  const spinG = new THREE.Group();
  const spinIn = new THREE.Group();
  const squashG = new THREE.Group();
  // the line of action: a stretch along any direction = rotate, scale, rotate back (about the hips)
  const lineR = new THREE.Group();
  const lineS = new THREE.Group();
  const lineI = new THREE.Group();
  const yawG = new THREE.Group();
  root.add(ground, mover);
  mover.add(leanG);
  leanG.add(spinG);
  spinG.position.y = B.centerY;
  spinG.add(spinIn);
  spinIn.position.y = -B.centerY;
  spinIn.add(squashG);
  const hipRest0 = B.ankle + B.shin + B.thigh;
  squashG.add(lineR);
  lineR.position.y = hipRest0;
  lineR.add(lineS);
  lineS.add(lineI);
  lineI.add(yawG);
  yawG.position.y = -hipRest0;

  const joints = {} as Record<JointName, THREE.Group>;
  for (const n of JOINTS) {
    const g = new THREE.Group();
    g.name = n;
    g.rotation.order = 'ZXY';
    joints[n] = g;
  }
  const hipRest = B.ankle + B.shin + B.thigh;
  yawG.add(joints.hips);
  joints.hips.position.set(0, hipRest, 0);
  joints.hips.add(joints.chest, joints.thighL, joints.thighR);
  joints.chest.position.set(0, B.chestY, 0);
  joints.chest.add(joints.head, joints.shoulderL, joints.shoulderR);
  joints.head.position.set(B.neckX, B.neckY, 0);
  const stretch: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  for (const [i, sd] of (['L', 'R'] as const).entries()) {
    const z = sd === 'L' ? -1 : 1;
    const sh = joints[`shoulder${sd}`];
    const arm = joints[`arm${sd}`];
    const fore = joints[`fore${sd}`];
    const hand = joints[`hand${sd}`];
    // the shoulder is a clavicle: it pivots at the chest midline, so a shrug lifts the whole arm
    sh.position.set(B.shoulderX, B.shoulderY, 0);
    sh.add(arm);
    arm.position.set(0, 0, z * B.shoulderZ);
    arm.add(fore);
    fore.position.set(0, -B.upperArm, 0);
    fore.add(stretch[i], hand);
    stretch[i].position.set(0, -B.forearm, 0);
    stretch[i].scale.set(1, 1e-3, 1);
    hand.position.set(0, -B.forearm, 0);
    const th = joints[`thigh${sd}`];
    const shn = joints[`shin${sd}`];
    const ft = joints[`foot${sd}`];
    th.position.set(0, 0, (z * B.hipWidth) / 2);
    th.add(shn);
    shn.position.set(0, -B.thigh, 0);
    shn.add(ft);
    ft.position.set(0, -B.shin, 0);
  }

  // ---- materials and parts ----
  const uniforms = makeUniforms();
  const rimHex = opts.alt && spec.palette.alt?.rim ? spec.palette.alt.rim : spec.palette.rim;
  if (rimHex) uniforms.rimColor.value.set(rimHex);
  const mats = makeMaterials(uniforms, spec.palette, opts.sideColor, opts.alt);
  // the face (round 3): one material per view, so each robot keeps its own expression
  const eyeU = {
    uColor: { value: new THREE.Color(spec.palette.eye) },
    uOpen: { value: 0.3 }, uW: { value: 0.36 }, uTilt: { value: 0.12 }, uCurve: { value: 0 }, uX: { value: 0 },
    uBright: { value: 1 }, uAsym: { value: 0 }, uSep: { value: 0.5 }, uAspect: { value: 3 }, uSize: { value: 1 }, uDy: { value: 0 },
    uWhite: uniforms.white,
  };
  let eyeMat: THREE.ShaderMaterial | null = null;
  const exprNow: Expr = { open: 0.3, w: 0.36, tilt: 0.12, curve: 0, x: 0, bright: 1, asym: 0, dy: 0 };
  const exprTgt: Expr = { ...exprNow };
  const parts = new Map<string, THREE.Object3D>();
  const geoKeys: string[] = [];
  const owned: { dispose(): void }[] = [];
  const findJoint = (name: string): THREE.Object3D => {
    const o = (joints as Record<string, THREE.Object3D>)[name] ?? parts.get(name) ?? (name === 'stretchL' ? stretch[0] : name === 'stretchR' ? stretch[1] : name === 'yaw' ? yawG : undefined);
    if (!o) throw new Error(`rig: no joint or part "${name}"`);
    return o;
  };
  const place = (o: THREE.Object3D, at?: V3, rot?: V3, scale?: V3) => {
    if (at) o.position.set(at[0], at[1], at[2]);
    if (rot) o.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
    if (scale) o.scale.set(scale[0], scale[1], scale[2]);
  };
  const addMesh = (parent: string, key: string, make: () => THREE.BufferGeometry, mat: THREE.Material, at?: V3, rot?: V3, scale?: V3) => {
    const k = `${spec.id}:${key}`;
    const g = acquireGeo(k, make);
    geoKeys.push(k);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    place(m, at, rot, scale);
    findJoint(parent).add(m);
    return m;
  };
  const kit: Kit = {
    def,
    body: B,
    side: opts.side,
    alt: opts.alt,
    mats,
    uniforms,
    joint: findJoint,
    group(parent, name, at, rot) {
      const g = new THREE.Group();
      g.name = name;
      g.rotation.order = 'ZXY';
      place(g, at, rot);
      findJoint(parent).add(g);
      parts.set(name, g);
      return g;
    },
    box(parent, size, mat, at, rot, bevel) {
      const r = bevel ?? Math.min(size[0], size[1], size[2]) * 0.18;
      const key = `box:${size.join(',')}:${r.toFixed(3)}`;
      return addMesh(parent, key, () => new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(r, Math.min(size[0], size[1], size[2]) * 0.49)), mat, at, rot);
    },
    cyl(parent, rTop, rBot, h, mat, at, rot, seg = 14) {
      return addMesh(parent, `cyl:${rTop},${rBot},${h},${seg}`, () => new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, at, rot);
    },
    sphere(parent, r, mat, at, scale, seg = 14) {
      return addMesh(parent, `sph:${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))), mat, at, undefined, scale);
    },
    mesh(parent, key, make, mat, at, rot, scale) {
      return addMesh(parent, key, make, mat, at, rot, scale);
    },
    own(x) {
      owned.push(x);
      return x;
    },
    eyes(parent, o) {
      if (!eyeMat) {
        eyeMat = new THREE.ShaderMaterial({
          uniforms: eyeU,
          vertexShader: EYE_VS,
          fragmentShader: EYE_FS,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
        owned.push(eyeMat);
      }
      if (o.color) eyeU.uColor.value.set(o.color);
      eyeU.uAspect.value = o.w / o.h;
      eyeU.uSep.value = o.sep ?? 0.5;
      eyeU.uSize.value = o.size ?? 1;
      // a panel in the joint's y-z plane, facing +x
      const m = addMesh(parent, `eyes:${o.w.toFixed(3)}x${o.h.toFixed(3)}`, () => new THREE.PlaneGeometry(o.w, o.h).rotateY(Math.PI / 2), eyeMat, o.at, o.rotDeg);
      m.castShadow = false;
      m.renderOrder = 3;
      return m;
    },
  };
  spec.build(kit);

  // ---- shield, shadow, marker ----
  const shadowMat = new THREE.MeshBasicMaterial({ map: acquireShadowTex(), transparent: true, depthWrite: false, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false });
  const planeKey = 'plane:1';
  const planeGeo = acquireGeo(planeKey, () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  geoKeys.push(planeKey);
  const shadow = new THREE.Mesh(planeGeo, shadowMat);
  shadow.scale.set(def.width * 1.5, 1, def.width * 0.9);
  shadow.renderOrder = 1;
  ground.add(shadow);
  const markKey = `${spec.id}:marker`;
  const markGeo = acquireGeo(markKey, () => markerGeometry(def.width * 0.62));
  geoKeys.push(markKey);
  const markMat = new THREE.MeshBasicMaterial({ color: opts.sideColor, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false, side: THREE.DoubleSide });
  const marker = new THREE.Mesh(markGeo, markMat);
  marker.renderOrder = 2;
  // a thin dark outline under the side colour, so the marker reads on the light deck
  const lineKey = `${spec.id}:marker-line`;
  const lineGeo = acquireGeo(lineKey, () => markerGeometry(def.width * 0.62, 0.022));
  geoKeys.push(lineKey);
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2.5, polygonOffsetUnits: -2.5, toneMapped: false, side: THREE.DoubleSide });
  const markLine = new THREE.Mesh(lineGeo, lineMat);
  markLine.renderOrder = 1.5;
  markLine.position.y = -0.002;
  marker.add(markLine);
  ground.add(marker);

  root.traverse((o) => o.layers.set(LAYER.FIGHTER));

  // ---- per-view state (all preallocated) ----
  const cur = emptyPose(); // keyed target this frame
  const from = emptyPose(); // pose at the start of a blend
  const shown = emptyPose(); // last pose shown (before secondary)
  const out = emptyPose(); // final pose applied
  const tmp: [Pose, Pose, Pose] = [emptyPose(), emptyPose(), emptyPose()];
  const args: AnimArgs = { s: null as unknown as FighterState, other: null, f: 1, t: 0, phase: 0, def, spec, P, tmp };
  const info: FrameInfo = { t: 0, charge: 0, armor: false, move: null, f: 0 };
  const handles: RigHandles = {
    root,
    joint: (n) => joints[n],
    part: (n) => findJoint(n),
    mats,
    uniforms,
    side: opts.side,
    stretch: [0, 0],
  };
  const pos = new THREE.Vector3();
  const lastPos = new THREE.Vector3();
  let first = true;
  let lastAction: Action | '' = '';
  let lastMove: MoveId | null = null;
  let lastF = 0;
  let blendT = 1;
  let blendDur = 0;
  let clock = 0;
  let travel = 0;
  let facing: 1 | -1 = opts.side === 0 ? 1 : -1;
  let yawCur = facing > 0 ? -tq : -Math.PI + tq;
  let turnFrom = yawCur;
  let turnT = 1;
  let turnStarted = false;
  let swayP = 0;
  let swayV = 0;
  let bobP = 0;
  let bobV = 0;
  let lastVx = 0;
  let lastVy = 0;
  let headP = 0;
  let headT = 0;
  let headVP = 0;
  let headVT = 0;
  let lookP = 0;
  let lookT = 0;
  let airJump = false;
  let carryX = 0;
  let carryY = 0;
  let releaseT = 99;
  const relOff = new THREE.Vector2();
  let wasHeld = false;
  let lastHl = 0;
  let sepX = 0;
  let sepY = 0;
  let sepT = 1;
  let hlMax = 1;
  let kickedHit = -1;
  let kickedRec = -1;
  let moveSeq = 0;

  const yawFor = (f: 1 | -1) => (f > 0 ? -tq : -Math.PI + tq);

  // ---- the action animations ----
  function base(s: FighterState): Pose {
    return s.grounded ? P.stance : P.air;
  }

  function breathe(o: Pose, t: number, depth = 1): void {
    const g = spec.gait;
    const w = Math.sin(t * Math.PI * 2 * g.breathRate);
    const w2 = Math.sin(t * Math.PI * 2 * g.breathRate * 0.5 + 1.3);
    const d = g.breathDepth * depth;
    o[C.y] += w * 0.012 * d;
    o[J.chest * 3] += w * 2.2 * DEG * d;
    o[J.head * 3] -= w * 1.5 * DEG * d;
    o[J.shoulderL * 3 + 2] += w * 2.5 * DEG * d;
    o[J.shoulderR * 3 + 2] += w * 2.5 * DEG * d;
    o[J.armL * 3] += w2 * 2 * DEG * d;
    o[J.armR * 3] -= w2 * 2 * DEG * d;
    // weight shift side to side
    o[J.hips * 3 + 2] += w2 * 2 * DEG * d;
    o[J.chest * 3 + 2] -= w2 * 1.5 * DEG * d;
    o[C.glow] += (w * 0.5 + 0.5) * 0.15 * d;
  }

  function locomote(o: Pose, run: boolean, a: AnimArgs): void {
    const g = spec.gait;
    copyPose(o, run ? P.run : P.walk);
    const cyc = a.phase;
    const D = run ? g.runCycle : g.walkCycle;
    const duty = run ? g.runDuty : g.walkDuty;
    const lift = run ? g.runLift : g.walkLift;
    for (let i = 0; i < 2; i++) {
      let ph = cyc + i * 0.5;
      ph -= Math.floor(ph);
      let x: number;
      let y: number;
      let toe: number;
      if (ph < duty) {
        x = duty * D * (0.5 - ph / duty);
        y = 0;
        toe = 0;
      } else {
        const u = (ph - duty) / (1 - duty);
        x = -duty * D * 0.5 + duty * D * ease.inOutSine(u);
        y = lift * Math.sin(Math.PI * u) ** 0.8;
        toe = (u < 0.35 ? -35 * Math.sin((Math.PI * u) / 0.35) : 18 * Math.sin(Math.PI * (u - 0.35) / 0.65)) * DEG;
      }
      if (i === 0) {
        o[C.fLx] = x;
        o[C.fLy] = y;
        o[J.footL * 3] += toe;
      } else {
        o[C.fRx] = x;
        o[C.fRy] = y;
        o[J.footR * 3] += toe;
      }
    }
    const c2 = Math.cos(Math.PI * 4 * cyc);
    const c1 = Math.cos(Math.PI * 2 * cyc);
    o[C.y] += -(run ? g.runBob : g.walkBob) * c2;
    const sw = (run ? g.runSwing : g.walkSwing) * DEG;
    o[J.armL * 3] += -sw * c1;
    o[J.armR * 3] += sw * c1;
    o[J.foreL * 3] += (run ? 12 : 6) * DEG * Math.max(0, c1);
    o[J.foreR * 3] += (run ? 12 : 6) * DEG * Math.max(0, -c1);
    // shoulders counter the stride, but on a run the chest keeps pointing where it goes
    o[J.chest * 3 + 1] += (run ? 4 : 6) * DEG * c1;
    o[J.hips * 3 + 1] -= (run ? 7 : 5) * DEG * c1;
    o[J.head * 3 + 1] -= (run ? 4 : 3) * DEG * c1;
    o[J.chest * 3 + 2] += 2 * DEG * Math.sin(Math.PI * 2 * cyc);
  }

  function attack(s: FighterState, f: number, o: Pose, a: AnimArgs = args): void {
    const id = s.move as MoveId;
    const ma = moves[id];
    const md = def.moves[id];
    const b = base(s);
    let ff = f;
    // after a charge the wind-up is already done: stay wound until the snap
    if (s.charge > 0 && ma.keys.length > 2 && ff < ma.keys[2].f) ff = ma.keys[2].f;
    evalKeys(ma.keys, ff, b, o);
    accentInto(o, id, ff, s.grounded);
    const T = md.startup + md.active + md.recovery;
    const kk = 0.7 + (accentK[id]?.k ?? 1) * 0.5;
    // the strike hold creeps on along the hit (round 3): the active frames are never a statue
    const a0 = md.startup + 1;
    if (f >= a0 && f <= a0 + md.active + 1) {
      const u = (f - a0) / Math.max(1, md.active + 1);
      o[C.stretch] += 0.035 * u * kk;
      o[C.x] += 0.05 * u * kk;
      o[J.chest * 3] += 3 * DEG * u * kk;
      o[C.y] -= 0.015 * u * kk;
    }
    // the recovery is alive, driven by the frame so the pose sheet shows it too (round 3): a
    // damped settle off the snap into the recovery pose, then heavy breathing to the end
    if (ma.recoverAt && f > ma.recoverAt) {
      const u = f - ma.recoverAt;
      const fade = clamp01((T - f) / 4);
      const osc = Math.exp(-u / 7) * Math.sin(u * 0.85) * fade * kk;
      o[J.chest * 3] += osc * 6 * DEG;
      o[J.head * 3] -= osc * 5 * DEG;
      o[C.y] -= osc * 0.02;
      o[J.armL * 3] += osc * 8 * DEG;
      o[J.armR * 3] += osc * 8 * DEG;
      o[J.foreL * 3] -= osc * 10 * DEG;
      o[J.foreR * 3] -= osc * 10 * DEG;
      const br = Math.sin(u * 0.36) * fade * clamp01(u / 4) * kk;
      o[J.chest * 3] += br * 2.5 * DEG;
      o[J.shoulderL * 3 + 2] += br * 4 * DEG;
      o[J.shoulderR * 3 + 2] += br * 4 * DEG;
      o[C.y] += br * 0.012;
      o[C.glow] += (br * 0.5 + 0.5) * 0.15 * fade;
    }
    // air moves keep the legs paddling after the swing instead of hanging dead
    if (!s.grounded && (f > a0 + md.active || (ma.limb === 'none' && !ma.spinTurns && f > a0))) {
      const w = (ma.limb === 'none' ? clamp01((f - a0) / 3) : clamp01((f - a0 - md.active) / 4)) * clamp01((T - f) / 3);
      o[J.thighL * 3] += Math.sin(f * 0.55) * 7 * DEG * w;
      o[J.thighR * 3] -= Math.sin(f * 0.55 + 0.8) * 7 * DEG * w;
    }
    if (s.charge > 0 && f < md.startup) tremble(o, f, 0.6);
  }

  // ---- the automatic line of action on every strike (round 2) ----
  // From the hitbox direction alone: the body squashes in the anticipation, then on the snap it
  // stretches toward the hit, lunges (feet spread along the strike on the ground), counter-rotates
  // (the off shoulder goes back) and the off arm swings back, so the outline changes with the hit.
  const accentK = {} as Record<MoveId, { k: number; ang: number; dx: number; dy: number; side: number; S: number; A: number; R: number }>;
  for (const id of Object.keys(def.moves) as MoveId[]) {
    const md = def.moves[id];
    const ma = moves[id];
    const hb = mainHitbox(md);
    const dmg = hb ? hb.damage : 0;
    let k = ma.accent ?? (md.kind === 'throw' || md.kind === 'grab' ? 0.5 : clamp(0.55 + dmg / 22, 0.6, 1.4));
    if (!hb) k = 0;
    const cy = B.centerY;
    const dx = hb ? hb.x : 1;
    const dy = hb ? hb.y - cy : 0;
    const l = Math.hypot(dx, dy) || 1;
    const limb = ma.limb;
    const side = limb === 'handR' || limb === 'footR' ? 1 : limb === 'handL' || limb === 'footL' ? -1 : 0;
    accentK[id] = { k, ang: Math.atan2(dx, dy), dx: dx / l, dy: dy / l, side, S: md.startup, A: md.active, R: md.recovery };
  }
  function accentInto(o: Pose, id: MoveId, f: number, grounded: boolean): void {
    const a = accentK[id];
    if (!a || a.k <= 0) return;
    const S = a.S;
    // anticipation: compress through the startup, release on the snap
    const wind = f < S + 1 ? ease.inQuad(clamp01((f - 1) / Math.max(1, S - 1))) * (f > S - 0.5 ? clamp01((S + 1 - f) / 1.5) : 1) : 0;
    // the strike: full on the first active frame, held, gone two frames after the overshoot
    const hit = f < S - 0.6 ? 0 : f < S + 1 ? clamp01((f - (S - 0.6)) / 1.6) : f <= S + a.A + 1 ? 1 : 1 - ease.inOutSine(clamp01((f - (S + a.A + 1)) / 4));
    const k = a.k;
    if (wind > 0) {
      o[C.squash] += 0.07 * wind * k;
      o[C.y] -= 0.04 * wind * k;
      o[C.counter] += 10 * DEG * wind * k * a.side;
    }
    if (hit > 0) {
      const w = hit * k;
      o[C.stretch] += 0.09 * w;
      o[C.lineAng] = a.ang;
      o[C.squash] -= 0.02 * w;
      o[C.counter] -= 16 * DEG * w * a.side;
      o[C.curve] += 5 * DEG * w * a.dx * (a.dy < 0.6 ? 1 : 0) - 10 * DEG * w * Math.max(0, a.dy);
      if (grounded) {
        // lunge along the strike: front foot out, back foot back
        const fx = 0.12 * w * a.dx;
        o[C.fLx] += o[C.fLx] >= o[C.fRx] ? fx : -fx;
        o[C.fRx] += o[C.fRx] > o[C.fLx] ? fx : -fx;
        o[C.lean] += 3 * DEG * w * a.dx;
        o[C.sway] += 0.04 * w * Math.abs(a.dx);
      }
      // the off arm swings back to balance the strike
      if (a.side !== 0) {
        const off = a.side > 0 ? J.armL : J.armR;
        o[off * 3] -= 40 * DEG * w * a.dx;
        o[off * 3 + 2] += 14 * DEG * w;
      }
    }
  }

  function tremble(o: Pose, f: number, k: number): void {
    const j = Math.sin(f * 2.7) * k;
    o[J.chest * 3] += j * 1.2 * DEG;
    o[J.head * 3 + 2] += j * 1.5 * DEG;
    o[C.x] += Math.sin(f * 3.9) * 0.006 * k;
  }

  function animate(a: AnimArgs, o: Pose): void {
    const s = a.s;
    const f = a.f;
    const custom = spec.actions?.[s.action];
    if (custom) {
      custom(a, o);
      return;
    }
    switch (s.action) {
      case 'entrance': {
        const u = ease.outBack(clamp01((f - 6) / 16));
        mixInto(o, P.entrance, P.stance, u);
        o[C.glow] += clamp01((f - 4) / 10) * 0.5 * (1 - u * 0.6);
        break;
      }
      case 'idle':
        copyPose(o, P.stance);
        breathe(o, a.t);
        break;
      case 'walk':
        locomote(o, false, a);
        break;
      case 'run': {
        locomote(o, true, a);
        const dash = 1 - ease.inOutSine(clamp01((f - 1) / 7));
        if (dash > 0) mixInto(o, o, P.dash, dash);
        break;
      }
      case 'skid':
        mixInto(o, P.run, P.skid, ease.outCubic(clamp01(f / 2)));
        break;
      case 'turn':
        mixInto(o, P.stance, P.pivot, bump(f, 0, 2, 6));
        break;
      case 'jumpsquat': {
        const n = Math.max(1, def.jumpsquat);
        mixInto(o, P.stance, P.crouch, ease.outCubic(clamp01(f / n)));
        break;
      }
      case 'rise': {
        // stretched off the deck, tucking frame by frame on the way up (never one held shape)
        const up = Math.min(clamp01(s.vy / def.jumpSpeed), 1 - ease.inQuad(clamp01((f - 2) / 18)) * 0.8);
        mixInto(o, P.apex, P.rise, ease.inOutSine(up));
        if (airJump) {
          const k = bump(f, 0, 3, 16);
          mixInto(o, o, P.airjump, k);
        }
        o[C.squash] += -0.07 * clamp01(1 - f / 6);
        break;
      }
      case 'fall': {
        // out of the apex tuck the legs unfold frame by frame, so the top of the arc never hangs
        const down = Math.max(clamp01(-s.vy / def.fallSpeed), ease.outQuad(clamp01((f - 1) / 12)) * 0.75);
        mixInto(o, P.apex, P.fall, ease.inOutSine(down));
        if (s.fastFall) mixInto(o, o, P.fastfall, ease.outCubic(clamp01(-s.vy / def.fastFallSpeed)));
        break;
      }
      case 'land': {
        const k = 1 - ease.inOutSine(clamp01((f - 1) / 9));
        mixInto(o, P.stance, P.crouch, Math.max(k * 0.85, f > 9 ? 0.3 : 0));
        o[C.squash] += 0.1 * Math.max(0, 1 - (f - 1) / 4);
        break;
      }
      case 'attack':
        attack(s, f, o);
        break;
      case 'charge': {
        const ma = moves[s.move as MoveId];
        const wind = ma.keys.length > 2 ? ma.keys[2].pose : 'base';
        const b = base(s);
        const ramp = ease.outCubic(clamp01(f / Math.max(2, ma.keys.length > 2 ? ma.keys[2].f : 4)));
        mixInto(o, b, wind === 'base' ? b : wind, ramp);
        tremble(o, f, 0.4 + Math.min(1, f / 40));
        o[C.glow] += Math.min(1, f / 40);
        break;
      }
      case 'shield':
        copyPose(o, P.shield);
        breathe(o, a.t, 0.4);
        break;
      case 'shieldstun': {
        const k = Math.max(0, 1 - f / 8);
        copyPose(o, P.shield);
        o[C.lean] -= 8 * DEG * k;
        o[C.x] -= 0.06 * k;
        o[J.chest * 3] -= 8 * DEG * k;
        break;
      }
      case 'shieldbreak': {
        const jolt = Math.max(0, 1 - f / 10);
        copyPose(o, P.dizzy);
        const w = (f / 60 + a.t) * 3.2;
        o[C.lean] += Math.sin(w) * 7 * DEG;
        o[J.chest * 3 + 2] += Math.cos(w) * 8 * DEG;
        o[J.head * 3 + 1] += Math.sin(w * 1.3) * 20 * DEG;
        o[J.head * 3 + 2] += Math.cos(w * 1.3) * 14 * DEG;
        o[C.y] += jolt * 0.25 * Math.sin(Math.PI * Math.min(1, f / 10));
        o[C.eyes] = Math.sin(a.t * 18) > 0 ? -0.2 : -1;
        break;
      }
      case 'roll': {
        // tuck, roll right over, come up
        const dir = s.vx * s.facing < -0.001 ? -1 : 1;
        const tuck = bump(f, 0, 4, 24);
        mixInto(o, P.stance, P.rollTuck, tuck);
        o[C.spin] += dir * 360 * DEG * ease.inOutCubic(clamp01((f - 3) / 17));
        break;
      }
      case 'spotdodge':
        mixInto(o, P.stance, P.spot, bump(f, 0, 3, 21));
        break;
      case 'airdodge':
        mixInto(o, P.air, P.airdodge, bump(f, 0, 3, 30));
        break;
      case 'holding':
        // the pose sheet shows throws as 'holding' with the throw as the move
        if (s.move && def.moves[s.move].kind === 'throw') attack(s, f, o);
        else {
          copyPose(o, P.hold);
          breathe(o, a.t, 0.5);
        }
        break;
      case 'held': {
        copyPose(o, P.held);
        const k = (f / 60 + a.t) * 9;
        o[J.thighL * 3] += Math.sin(k) * 18 * DEG;
        o[J.thighR * 3] -= Math.sin(k) * 18 * DEG;
        o[J.armL * 3] += Math.sin(k * 0.8) * 12 * DEG;
        o[J.armR * 3] -= Math.sin(k * 0.8) * 12 * DEG;
        break;
      }
      case 'hitstun':
        hitstun(a, o);
        break;
      case 'knockdown': {
        copyPose(o, P.lying);
        const b = Math.max(0, 1 - (f - 1) / 8);
        o[C.y] += 0.18 * Math.sin(Math.PI * Math.min(1, (f - 1) / 8)) * b;
        o[C.squash] += 0.1 * Math.max(0, 1 - f / 4);
        break;
      }
      case 'getup': {
        const u = clamp01(f / 26);
        if (u < 0.5) mixInto(o, P.lying, P.getup, ease.inOutCubic(u / 0.5));
        else mixInto(o, P.getup, P.stance, ease.outBack((u - 0.5) / 0.5));
        break;
      }
      case 'ledgehang': {
        copyPose(o, P.hang);
        const w = Math.sin((f / 60 + a.t) * 2.4);
        o[J.thighL * 3] += w * 8 * DEG;
        o[J.thighR * 3] -= w * 6 * DEG;
        o[C.lean] += w * 2 * DEG;
        break;
      }
      case 'ledgeclimb': {
        const u = clamp01(f / 20);
        if (u < 0.55) mixInto(o, P.hang, P.climb, ease.inOutCubic(u / 0.55));
        else mixInto(o, P.climb, P.crouch, ease.outCubic((u - 0.55) / 0.45));
        break;
      }
      case 'helpless': {
        // a slow tumble of the limbs, driven by the frame (it shows on the pose sheet too)
        copyPose(o, P.helpless);
        const tt = f / 60 + a.t;
        const w = Math.sin(tt * 5);
        o[J.armL * 3 + 2] += w * 12 * DEG;
        o[J.armR * 3 + 2] -= w * 12 * DEG;
        o[J.armL * 3] += Math.sin(tt * 3.1) * 14 * DEG;
        o[J.armR * 3] += Math.sin(tt * 3.1 + 1.9) * 14 * DEG;
        o[J.thighL * 3] += Math.sin(tt * 4.2) * 12 * DEG;
        o[J.thighR * 3] -= Math.sin(tt * 4.2 + 0.7) * 10 * DEG;
        o[C.lean] += Math.sin(tt * 2.3) * 7 * DEG;
        o[C.curve] += Math.sin(tt * 2.9) * 6 * DEG;
        break;
      }
      case 'respawn':
        copyPose(o, P.respawn);
        breathe(o, a.t, 0.6);
        break;
      case 'win':
        mixInto(o, P.stance, P.win, ease.outBack(clamp01(f / 14)));
        o[C.y] += Math.abs(Math.sin((f / 60 + a.t) * 4)) * 0.03;
        break;
      case 'lose':
        mixInto(o, P.stance, P.lose, ease.inOutSine(clamp01(f / 24)));
        break;
      case 'dead':
      default:
        copyPose(o, base(s));
    }
  }

  function hitstun(a: AnimArgs, o: Pose): void {
    const s = a.s;
    const f = a.f;
    const fx = s.kbx * s.facing; // + = pushed the way it faces (hit from behind)
    if (s.hitlag > 0) {
      // the hit pause: the blow's pose, aimed along the launch, alive every frame (never a stall)
      copyPose(o, P.hurt);
      const back = fx > 0 ? -1 : 1; // arch away from the hit
      o[C.lineAng] = Math.atan2(fx, s.kby || 0.001);
      o[C.lean] *= back;
      o[C.curve] *= back;
      const j = s.hitlag % 2 === 0 ? 1 : -1;
      o[J.head * 3] += j * 9 * DEG;
      o[J.head * 3 + 2] -= j * 7 * DEG;
      o[J.armL * 3 + 2] += j * 12 * DEG;
      o[J.armR * 3 + 2] -= j * 10 * DEG;
      o[J.chest * 3 + 2] += j * 4 * DEG;
      if (s.grounded) o[C.plant] = 1;
      return;
    }
    if (!s.tumble) {
      // a flinch: snap away from the hit, ease back
      const total = Math.max(6, s.hitstun + f);
      const k = 1 - ease.inOutSine(clamp01((f - 1) / total));
      copyPose(o, s.grounded ? P.stance : P.air);
      const reel = fx > 0 ? -0.6 : 1;
      addDelta(o, P.stance, P.flinch, k * reel);
      return;
    }
    // launched: body follows the trajectory first, then tumbles
    copyPose(o, P.tumble);
    const vxF = s.vx * s.facing;
    const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    const along = Math.atan2(vxF, Math.max(0.02, Math.abs(s.vy)) * Math.sign(s.vy || 1));
    const dir = vxF >= 0 ? 1 : -1;
    const start = 4;
    const spinT = Math.max(0, f - start);
    const rate = clamp(sp * 140, 8, 26) * DEG;
    const settle = 1 - ease.outCubic(clamp01(spinT / 10));
    o[C.spin] = along * settle + dir * spinT * rate;
    o[C.squash] = -0.1 * settle;
    const fl = Math.sin(a.t * 14);
    o[J.armL * 3] += fl * 25 * DEG;
    o[J.armR * 3] -= fl * 20 * DEG;
    o[J.thighL * 3] += fl * 15 * DEG;
  }

  // ---- secondary motion, then apply ----
  const lookAt = (s: FighterState, other: FighterState | null, w: number) => {
    let tp = 0;
    let tt = 0;
    if (other && w > 0 && other.action !== 'dead') {
      const dx = (other.x - s.x) * s.facing;
      const dy = other.y + 1.2 - (s.y + def.height * 0.85);
      if (dx > -0.2) tp = clamp(-Math.atan2(dy, Math.max(0.8, dx)) * 0.7, -0.4, 0.35);
      else tt = clamp(-dx * 0.25, 0, 0.6);
    }
    lookP += (tp * w - lookP) * 0.2;
    lookT += (tt * w - lookT) * 0.15;
  };

  function headLevelWeight(a: Action): number {
    switch (a) {
      case 'idle': case 'walk': case 'run': case 'skid': case 'turn': case 'jumpsquat': case 'land': case 'rise': case 'fall':
      case 'shield': case 'shieldstun': case 'charge': case 'holding': case 'respawn':
        return 1;
      case 'attack':
        return 0.6;
      default:
        return 0;
    }
  }

  function lookWeight(a: Action): number {
    switch (a) {
      case 'idle': case 'walk': case 'run': case 'shield': case 'jumpsquat': case 'land': case 'rise': case 'fall':
      case 'skid': case 'holding': case 'respawn': case 'charge':
        return 1;
      case 'attack':
        return 0.5;
      default:
        return 0;
    }
  }

  const _tw = new THREE.Vector3();
  const _pw = new THREE.Vector3();
  const _yq = new THREE.Quaternion();
  const _fq = new THREE.Quaternion();
  const YAXIS = new THREE.Vector3(0, 1, 0);

  // how the spine channels share out over hips, chest and head
  const CURVE_W = [0.2, 0.5, 0.3];
  const COUNTER_W = [-0.45, 1, 0];
  function applyJoints(o: Pose): void {
    const curve = o[C.curve];
    const counter = o[C.counter];
    const sway = o[C.sway];
    joints.hips.position.x = -sway;
    joints.chest.position.x = sway * 1.55;
    for (let j = 0; j < NJ; j++) {
      const n = JOINTS[j];
      const g = joints[n];
      let p = o[j * 3];
      let t = o[j * 3 + 1];
      const sp = o[j * 3 + 2];
      if (j < 3) {
        p += curve * CURVE_W[j];
        t += counter * COUNTER_W[j];
        g.rotation.set(sp, -t, -p);
      } else {
        const left = n.endsWith('L');
        g.rotation.set(left ? sp : -sp, left ? t : -t, p);
      }
    }
  }

  /** world point in the yaw frame (robot local), then onto the plane */
  function yawLocalToWorld(lx: number, ly: number, lz: number, outV: THREE.Vector3): THREE.Vector3 {
    outV.set(lx, ly, lz);
    return yawG.localToWorld(outV);
  }

  function solveLegs(o: Pose, groundY: number, strikeLimb: Limb, strikeW: number, tx: number, ty: number): void {
    const plant = o[C.plant];
    const yaw = yawG.rotation.y;
    for (let i = 0; i < 2; i++) {
      const left = i === 0;
      const th = left ? joints.thighL : joints.thighR;
      const sh = left ? joints.shinL : joints.shinR;
      const ft = left ? joints.footL : joints.footR;
      const striking = strikeW > 0 && (strikeLimb === 'feet' || strikeLimb === (left ? 'footL' : 'footR'));
      const w = striking ? Math.max(strikeW, plant) : plant;
      if (w <= 0.001) continue;
      // pole: knees forward and a little out
      yawLocalToWorld(0.9, B.ankle + B.shin, (left ? -1 : 1) * B.hipWidth * 0.7, _pw);
      // planted target: the stance width turned with the body, the stride along the facing
      const zl = ((left ? -1 : 1) * B.stanceWidth) / 2;
      const fx = left ? o[C.fLx] : o[C.fRx];
      const fy = left ? o[C.fLy] : o[C.fRy];
      // (built in the space root sits in, then taken to world: a screen may hold the robot in a
      // scaled, flipped group, and the IK solves in world space)
      _tw.set(pos.x + facing * fx + Math.sin(yaw) * zl, groundY + B.ankle + fy, pos.z + Math.cos(yaw) * zl);
      if (striking) {
        _v2.set(pos.x + tx * facing, pos.y + ty, pos.z + (left ? -1 : 1) * 0.12);
        if (plant > 0.01) _tw.lerp(_v2, strikeW);
        else _tw.copy(_v2);
      }
      if (root.parent) root.parent.localToWorld(_tw);
      solveTwoBone(th, sh, B.thigh, B.shin, _tw, _pw, w, 0);
      th.updateMatrixWorld(true);
      // keep the planted foot flat on the deck (plus its own pitch for toe-offs)
      if (!striking && plant > 0.01) {
        _yq.setFromAxisAngle(YAXIS, yaw);
        _e.set(0, 0, o[(left ? J.footL : J.footR) * 3]);
        _fq.setFromEuler(_e);
        _yq.multiply(_fq);
        sh.getWorldQuaternion(_qw);
        _qw.invert().multiply(_yq);
        ft.quaternion.slerp(_qw, plant);
      }
    }
  }

  function solveArm(i: 0 | 1, target: THREE.Vector3, w: number): number {
    const left = i === 0;
    const arm = left ? joints.armL : joints.armR;
    const fore = left ? joints.foreL : joints.foreR;
    // pole: elbows back, down and out
    yawLocalToWorld(-0.8, B.centerY * 0.6, (left ? -1 : 1) * (B.shoulderZ + 0.5), _pw);
    return solveTwoBone(arm, fore, B.upperArm, B.forearm + B.handReach, target, _pw, w, B.armStretch);
  }

  function setStretch(i: 0 | 1, ext: number): void {
    handles.stretch[i] = ext;
    stretch[i].scale.y = Math.max(1e-3, ext);
    const hand = i === 0 ? joints.handL : joints.handR;
    hand.position.y = -B.forearm - ext;
  }

  // ---- mirroring: facing left, left and right swap so the robot reads the same both ways ----
  // (the robot still turns through the camera; the swap is blended across the turn)
  const MIRROR_PAIRS: [number, number][] = [
    [J.shoulderL, J.shoulderR], [J.armL, J.armR], [J.foreL, J.foreR], [J.handL, J.handR],
    [J.thighL, J.thighR], [J.shinL, J.shinR], [J.footL, J.footR],
  ];
  function mirrorPose(o: Pose): void {
    for (let i = 0; i < MIRROR_PAIRS.length; i++) {
      const a = MIRROR_PAIRS[i][0];
      const b = MIRROR_PAIRS[i][1];
      for (let k = 0; k < 3; k++) {
        const t = o[a * 3 + k];
        o[a * 3 + k] = o[b * 3 + k];
        o[b * 3 + k] = t;
      }
    }
    for (let j = 0; j < 3; j++) {
      o[j * 3 + 1] = -o[j * 3 + 1];
      o[j * 3 + 2] = -o[j * 3 + 2];
    }
    o[C.counter] = -o[C.counter];
    let t = o[C.gripL]; o[C.gripL] = o[C.gripR]; o[C.gripR] = t;
    t = o[C.fLx]; o[C.fLx] = o[C.fRx]; o[C.fRx] = t;
    t = o[C.fLy]; o[C.fLy] = o[C.fRy]; o[C.fRy] = t;
  }
  function sideLimb(l: Limb): Limb {
    if (facing > 0) return l;
    if (l === 'handL') return 'handR';
    if (l === 'handR') return 'handL';
    if (l === 'footL') return 'footR';
    if (l === 'footR') return 'footL';
    return l;
  }
  /** the keyed pose for the action at args.f, in skeleton space (mirrored when facing left) */
  function keyed(a: AnimArgs, o: Pose): void {
    animate(a, o);
    const act = a.s.action;
    if (turnT < 1 && (act === 'idle' || act === 'walk' || act === 'run' || act === 'land' || act === 'skid')) {
      mixInto(o, o, P.pivot, Math.sin(Math.PI * turnT) * 0.8);
    }
    if (facing < 0) mirrorPose(o);
  }

  // strike reach: which limb, how hard, where
  let reachW = 0;
  let reachX = 0;
  let reachY = 0;
  let reachR = 0;
  function computeReach(s: FighterState, f: number): Limb {
    reachW = 0;
    if (s.action !== 'attack' || !s.move) return 'none';
    const ma = moves[s.move];
    const md = def.moves[s.move];
    if (ma.limb === 'none' || ma.limb === 'body') return ma.limb;
    const limb = sideLimb(ma.limb);
    let from = ma.reach ? ma.reach[0] : Infinity;
    let to = ma.reach ? ma.reach[1] : -Infinity;
    if (!ma.reach) for (const h of md.hitboxes) {
      from = Math.min(from, h.from);
      to = Math.max(to, h.to);
    }
    if (!isFinite(from)) return 'none';
    // held two frames past the hitbox (the overshoot), then the piston snaps back in four
    const hold = ma.reach ? 0 : 2;
    const fade = 4;
    if (f < from - 1.3) reachW = 0;
    else if (f < from) reachW = ease.inQuad(clamp01((f - (from - 1.3)) / 1.3));
    else if (f <= to + hold) reachW = 1;
    else reachW = 1 - ease.outQuad(clamp01((f - to - hold) / fade));
    // target
    if (ma.path && ma.path.length) {
      const pth = ma.path;
      const fr = f - (md.startup + 1);
      let k = 0;
      while (k < pth.length - 1 && fr > pth[k + 1][0]) k++;
      const a = pth[k];
      const b = pth[Math.min(pth.length - 1, k + 1)];
      const u = b[0] > a[0] ? clamp01((fr - a[0]) / (b[0] - a[0])) : 0;
      reachX = a[1] + (b[1] - a[1]) * u;
      reachY = a[2] + (b[2] - a[2]) * u;
      const hb = mainHitbox(md);
      reachR = hb ? hb.r : 0.4;
    } else {
      let hb: Hitbox | null = null;
      const ff = clamp(f, from, to);
      for (const h of md.hitboxes) if (ff >= h.from && ff <= h.to && (!hb || h.damage > hb.damage)) hb = h;
      if (!hb) hb = mainHitbox(md);
      if (!hb) return 'none';
      reachX = hb.x;
      reachY = hb.y;
      reachR = hb.r;
    }
    // reach to the far side of the hitbox along the line from the shoulder (or hip): the limb
    // stretches out as far as the sim's hit allows, so the strike changes the whole outline
    const out = ma.reachOut ?? 0.75;
    if (out > 0) {
      const feet = limb === 'feet' || limb === 'footL' || limb === 'footR';
      const oy = feet ? hipRest : hipRest + B.chestY + B.shoulderY;
      const dx = reachX;
      const dy = reachY - oy;
      const l = Math.hypot(dx, dy) || 1;
      reachX += (dx / l) * reachR * out;
      reachY += (dy / l) * reachR * out;
    }
    return limb;
  }

  function groundBelow(x: number, y: number): number {
    const ar = ctx.arena;
    let best = -Infinity;
    if (x >= ar.main.x0 - 0.1 && x <= ar.main.x1 + 0.1 && ar.main.y <= y + 0.05) best = ar.main.y;
    for (const p of ar.soft) if (x >= p.x0 && x <= p.x1 && p.y <= y + 0.05 && p.y > best) best = p.y;
    return best;
  }

  function applyRoot(o: Pose, f1: 1 | -1, shakeX: number, shakeY: number): void {
    mover.position.set(f1 * o[C.x] + shakeX, o[C.y] + shakeY, o[C.z]);
    leanG.rotation.z = -f1 * o[C.lean];
    spinG.rotation.z = -f1 * o[C.spin];
    const sq = clamp(o[C.squash], -0.15, 0.25);
    squashG.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    const st = clamp(o[C.stretch], -0.2, 0.32);
    const la = o[C.lineAng];
    lineR.rotation.z = -f1 * la;
    lineI.rotation.z = f1 * la;
    const thin = 1 / Math.sqrt(1 + st);
    lineS.scale.set(thin, 1 + st, thin);
    yawG.rotation.y = yawCur - f1 * o[C.yaw];
  }

  // ---- the face (round 3): the expression from the state, snapped in a frame or two ----
  function setExpr(open: number, w: number, tilt: number, bright = 1, curve = 0, x = 0, asym = 0, dy = 0): void {
    exprTgt.open = open; exprTgt.w = w; exprTgt.tilt = tilt; exprTgt.bright = bright;
    exprTgt.curve = curve; exprTgt.x = x; exprTgt.asym = asym; exprTgt.dy = dy;
  }
  function exprFromState(s: FighterState, f: number): void {
    const md = s.move ? def.moves[s.move] : null;
    switch (s.action) {
      case 'attack': {
        if (!md) { setExpr(0.3, 0.36, 0.2); break; }
        if (md.kind === 'throw' || md.kind === 'grab') setExpr(0.2, 0.38, 0.32, 1.2);
        else if (f <= md.startup) setExpr(0.11, 0.4, 0.38, 1.25); // narrowed: the wind-up
        else if (f <= md.startup + md.active + 2) setExpr(0.27, 0.42, 0.42, 1.6); // the strike: fierce
        else setExpr(0.2, 0.37, 0.24, 1.1);
        break;
      }
      case 'charge':
        setExpr(0.09, 0.42, 0.42, 1.2 + 0.3 * Math.sin(f * 0.9));
        break;
      case 'shield': case 'shieldstun':
        setExpr(0.15, 0.38, 0.3, 1.1);
        break;
      case 'hitstun':
        if (s.hitlag > 0) setExpr(0.4, 0.2, -0.1, 1.15, 0, 0, 0, 0.02); // the blow: eyes wide and round
        else if (s.tumble) setExpr(0.3, 0.3, 0, 1.1, 0, 1); // launched: crossed out
        else setExpr(0.38, 0.27, -0.2, 1.3);
        break;
      case 'held':
        setExpr(0.4, 0.26, -0.3, 1.3);
        break;
      case 'knockdown':
        setExpr(0.03, 0.36, 0, 0.6);
        break;
      case 'getup':
        setExpr(f < 10 ? 0.05 : 0.2, 0.36, 0.1, 0.9);
        break;
      case 'shieldbreak': {
        const w = Math.sin(f * 0.35);
        setExpr(0.26, 0.3, 0, 1, 0, 0.35, w, 0);
        break;
      }
      case 'helpless':
        setExpr(0.12, 0.34, -0.3, 0.7);
        break;
      case 'ledgehang': case 'ledgeclimb':
        setExpr(0.3, 0.32, -0.22, 1.1);
        break;
      case 'win':
        setExpr(0.2, 0.36, 0, 1.5, 1);
        break;
      case 'lose':
        setExpr(0.08, 0.34, -0.42, 0.45, 0, 0, 0, -0.06);
        break;
      case 'entrance':
        setExpr(0.3 * clamp01((f - 6) / 6), 0.36, 0.2, clamp01((f - 4) / 6) * 1.4);
        break;
      case 'holding':
        setExpr(0.18, 0.38, 0.3, 1.2);
        break;
      case 'roll': case 'spotdodge': case 'airdodge':
        setExpr(0.08, 0.38, 0.2, 1);
        break;
      default: {
        // neutral: a determined squint, a blink every few seconds
        setExpr(0.29, 0.36, 0.16, 1);
        const calm = s.action === 'idle' || s.action === 'walk' || s.action === 'respawn';
        const ph = (clock + opts.side * 1.37) % 3.3;
        if (calm && clock > 0 && ph < 0.05) exprTgt.open = 0.03;
      }
    }
  }
  function exprForShow(name: ShowName, t: number): void {
    if (name === 'versus') setExpr(0.16, 0.42, 0.4, 1.5);
    else if (name === 'win') setExpr(0.2, 0.36, 0, 1.5, 1);
    else if (name === 'lose') setExpr(0.08, 0.34, -0.42, 0.45, 0, 0, 0, -0.06);
    else {
      setExpr(0.29, 0.36, 0.16, 1);
      if ((t + opts.side * 1.37) % 3.3 < 0.09) exprTgt.open = 0.03;
    }
  }
  function applyExpr(o: Pose, snap: boolean): void {
    if (!eyeMat) return;
    const k = snap ? 1 : 0.6;
    exprNow.open += (exprTgt.open - exprNow.open) * k;
    exprNow.w += (exprTgt.w - exprNow.w) * k;
    exprNow.tilt += (exprTgt.tilt - exprNow.tilt) * k;
    exprNow.curve += (exprTgt.curve - exprNow.curve) * k;
    exprNow.x += (exprTgt.x - exprNow.x) * k;
    exprNow.bright += (exprTgt.bright - exprNow.bright) * k;
    exprNow.asym += (exprTgt.asym - exprNow.asym) * k;
    exprNow.dy += (exprTgt.dy - exprNow.dy) * k;
    eyeU.uOpen.value = exprNow.open;
    eyeU.uW.value = exprNow.w;
    eyeU.uTilt.value = exprNow.tilt;
    eyeU.uCurve.value = exprNow.curve;
    eyeU.uX.value = exprNow.x;
    eyeU.uAsym.value = exprNow.asym;
    eyeU.uDy.value = exprNow.dy;
    // the pose's eyes channel (-1 off .. +1 hot) still dims or brightens the face
    eyeU.uBright.value = exprNow.bright * clamp(1 + 0.4 * o[C.eyes], 0.08, 1.7);
  }

  function applyMaterials(o: Pose, s: FighterState | null): void {
    const flick = s && s.invuln > 0 && s.action !== 'dead' && (s.action === 'ledgehang' || s.action === 'respawn' || s.action === 'getup' || s.action === 'ledgeclimb' || s.action === 'fall')
      ? (Math.floor(clock * 30) % 2 === 0 ? 0.42 : 0.08)
      : 0;
    uniforms.white.value = flick;
  }

  function finish(o: Pose, s: FighterState | null, groundY: number, airborne: number): void {
    // shadow + marker on the deck below
    if (groundY > -Infinity) {
      ground.visible = true;
      ground.position.set(mover.position.x, groundY - root.position.y + 0.012, 0);
      const hgt = Math.max(0, root.position.y - groundY);
      const k = clamp01(1 - hgt / 5);
      shadow.scale.set(def.width * (1.6 - 0.5 * (1 - k)), 1, def.width * 0.9);
      shadowMat.opacity = 0.7 * k;
      marker.visible = hgt < 2.2;
      markMat.opacity = 0.85 * clamp01(1 - hgt / 2.2) * (1 - airborne * 0.3);
      lineMat.opacity = markMat.opacity * 0.85;
      marker.rotation.y = facing > 0 ? 0 : Math.PI;
    } else ground.visible = false;
    const sc = (s?.charge ?? 0) > 0 && s?.move ? clamp01(s.charge / Math.max(1, def.moves[s.move].maxCharge ?? 50)) : 0;
    info.t = clock;
    info.charge = s && s.action === 'charge' ? clamp01(s.actionFrame / 50) : sc;
    info.armor = !!s?.armor;
    info.move = s?.move ?? null;
    info.f = args.f;
    spec.update?.(handles, o, s, info);
  }

  /** put the skeleton in pose o: root, joint angles, then IK (feet, strike, ledge, held) */
  function applyAll(o: Pose, s: FighterState, f: number, other: FighterState | null, shakeX: number, shakeY: number): void {
    applyRoot(o, facing, shakeX, shakeY);
    applyJoints(o);
    setStretch(0, 0);
    setStretch(1, 0);
    root.updateMatrixWorld(true);

    // spinning moves: whole-body turns about the vertical across the active frames
    if (s.action === 'attack' && s.move && moves[s.move].spinTurns) {
      const md = def.moves[s.move];
      const u = clamp01((f - md.startup) / Math.max(1, md.active + 2));
      yawG.rotation.y += -facing * Math.PI * 2 * (moves[s.move].spinTurns ?? 0) * ease.inOutSine(u);
      root.updateMatrixWorld(true);
    }

    // ---- IK: feet on the deck, fists on the hitbox, hands on the ledge or the held robot ----
    const limb = computeReach(s, f);
    const feetLimb = limb === 'feet' || limb === 'footL' || limb === 'footR';
    solveLegs(o, pos.y, limb, feetLimb ? reachW : 0, reachX, reachY);
    if (reachW > 0 && (limb === 'handL' || limb === 'handR' || limb === 'hands')) {
      const z0 = limb === 'hands' ? 0.2 : 0;
      // the piston retracts faster than the arm swings home (extension x w), so a fading
      // reach never leaves a long rod pointing at nothing
      if (limb === 'handR' || limb === 'hands') {
        _tw.set(pos.x + reachX * facing, pos.y + reachY, z0);
        setStretch(1, solveArm(1, _tw, reachW) * reachW);
        const g = moves[s.move as MoveId].grip ?? 1;
        o[C.gripR] += (g - o[C.gripR]) * reachW;
      }
      if (limb === 'handL' || limb === 'hands') {
        _tw.set(pos.x + reachX * facing, pos.y + reachY, -z0);
        setStretch(0, solveArm(0, _tw, reachW) * reachW);
        const g = moves[s.move as MoveId].grip ?? 1;
        o[C.gripL] += (g - o[C.gripL]) * reachW;
      }
    }
    if (s.action === 'ledgehang' || (s.action === 'ledgeclimb' && f < 16)) {
      // the sim hangs the feet at (ledge - facing * (w/2 + 0.1), deck - 0.85 h): the corner is there
      const w = s.action === 'ledgehang' ? 1 : 1 - ease.inOutSine(clamp01((f - 8) / 8));
      const lx = s.action === 'ledgehang' ? pos.x + facing * (def.width * 0.5 + 0.1) : s.ledge === 0 ? ctx.arena.main.x0 : ctx.arena.main.x1;
      const ly = s.action === 'ledgehang' ? pos.y + def.height * 0.85 : ctx.arena.main.y;
      _tw.set(lx + facing * 0.12, ly + 0.07, 0.26);
      solveArm(1, _tw, w);
      _tw.set(lx + facing * 0.12, ly + 0.07, -0.26);
      solveArm(0, _tw, w);
    }
    if ((s.action === 'holding' || (s.action === 'attack' && s.move && def.moves[s.move].kind === 'throw')) && other && other.action === 'held') {
      // hands on the held robot's chest, wherever this robot's carry puts it
      const odef = ctx.fighterDefs[other.fighter];
      (spec.carry ?? defaultCarry)(s.action === 'attack' ? s.move : null, f, def, _carry, odef);
      const cx = pos.x + facing * (_carry.x - odef.width * 0.32);
      const cy = pos.y + _carry.y + 0.05;
      _tw.set(cx, cy, 0.3);
      solveArm(1, _tw, 1);
      _tw.set(cx, cy, -0.3);
      solveArm(0, _tw, 1);
    }
    root.updateMatrixWorld(true);
  }

  // (the swing smear that lived here is gone: clean look, 2026-11-19. A strike reads from the
  // pose, the snap and the hit itself; hitfx owns any arc on the heaviest swings.)


  // =========================================================================================
  const view: FighterView = {
    root,
    pose(s, prev, alpha, other, dt, _side) {
      root.visible = s.action !== 'dead';
      args.other = other;
      if (s.action === 'dead') {
        first = true;
        return;
      }
      const frozen = s.hitlag > 0;
      const step = frozen ? 0 : Math.min(dt, 1 / 20);
      clock += dt;
      lerpPos(s, prev, alpha, pos);
      // fractional action frame
      let f = s.actionFrame;
      if (prev.action === s.action && prev.move === s.move && s.actionFrame > prev.actionFrame && s.actionFrame - prev.actionFrame < 3) {
        f = prev.actionFrame + (s.actionFrame - prev.actionFrame) * alpha;
      }
      // travel drives the gait (feet do not slide)
      if (first || dt === 0) {
        lastPos.copy(pos);
        if (first) travel = 0.15 + 0.37 * opts.side;
      }
      const moved = Math.abs(pos.x - lastPos.x);
      if ((s.action === 'walk' || s.action === 'run' || s.action === 'skid') && moved < 1) {
        travel += moved / (s.action === 'walk' ? spec.gait.walkCycle : spec.gait.runCycle);
      }
      lastPos.copy(pos);
      // facing and turns (the robot turns through the camera, it never mirrors)
      if (first || dt === 0) {
        facing = s.facing;
        yawCur = yawFor(facing);
        turnT = 1;
      } else if (s.facing !== facing) {
        turnFrom = yawCur;
        facing = s.facing;
        turnT = 0;
        turnStarted = true;
      }
      // a turn mid-run is a quick pivot; standing turns take the gait's frames
      const quick = s.action === 'run' || s.action === 'skid' || s.action === 'attack' || !s.grounded;
      const turnDur = Math.max(1, quick ? Math.min(3, spec.gait.turnFrames) : spec.gait.turnFrames);
      if (turnT >= 1) yawCur = yawFor(facing);
      else {
        turnT = Math.min(1, turnT + (step * 60) / turnDur);
        let tgt = yawFor(facing);
        // through the camera (yaw -90 degrees)
        if (facing < 0 && tgt > turnFrom) tgt -= Math.PI * 2;
        if (facing > 0 && tgt < turnFrom) tgt += 0;
        yawCur = turnFrom + (tgt - turnFrom) * ease.inOutCubic(turnT);
        if (turnT >= 1) yawCur = yawFor(facing);
      }
      // air jump detection
      if (s.action === 'rise' && s.actionFrame <= 1 && lastAction !== 'jumpsquat' && lastAction !== '' && !s.grounded) airJump = true;
      if (s.action !== 'rise') airJump = false;

      // ---- keyed pose ----
      args.s = s;
      args.f = f;
      args.t = clock;
      args.phase = travel;
      keyed(args, cur);

      // ---- blend into new actions ----
      const changed = s.action !== lastAction || s.move !== lastMove || s.actionFrame < lastF;
      if (changed) moveSeq++;
      if (first || dt === 0) {
        blendT = 1;
      } else if (changed) {
        copyPose(from, shown);
        blendDur = blendFrames(s.action, (lastAction || 'idle') as Action);
        blendT = blendDur > 0 ? 0 : 1;
      } else if (turnStarted) {
        // the left/right swap of a turn, blended while the robot rotates
        copyPose(from, shown);
        blendDur = spec.gait.turnFrames;
        blendT = 0;
      }
      turnStarted = false;
      // a throw release: ease the thrown robot from where it was carried back onto its sim spot
      if (wasHeld && s.action !== 'held' && !first && dt > 0) {
        relOff.set(carryX, carryY);
        releaseT = 0;
      }
      wasHeld = s.action === 'held';
      lastAction = s.action;
      lastMove = s.move;
      lastF = s.actionFrame;
      if (blendT < 1) {
        blendT = Math.min(1, blendT + (step * 60) / Math.max(0.5, blendDur));
        mixInto(out, from, cur, ease.outQuad(blendT));
      } else copyPose(out, cur);
      copyPose(shown, out);

      // ---- secondary motion ----
      if (dt === 0 || first) {
        swayP = swayV = bobP = bobV = 0;
        lastVx = s.vx;
        lastVy = s.vy;
        headVP = headVT = 0;
      } else if (!frozen) {
        // impulses from velocity changes: stops tip the torso forward, landings dip the head
        const dvx = (s.vx - lastVx) * s.facing;
        const dvy = s.vy - lastVy;
        if (Math.abs(dvx) < 0.3) swayV -= dvx * 26;
        if (Math.abs(dvy) < 0.4 && s.grounded) bobV += dvy * 18;
        lastVx = s.vx;
        lastVy = s.vy;
        swayV += (-170 * swayP - 13 * swayV) * step;
        swayP += swayV * step;
        bobV += (-200 * bobP - 15 * bobV) * step;
        bobP += bobV * step;
        swayP = clamp(swayP, -0.24, 0.24);
        bobP = clamp(bobP, -0.3, 0.3);
      }
      // secondary motion through a move: a jolt on the snap, a settle bounce at the recovery pose
      if (s.action === 'attack' && s.move && !frozen && dt > 0) {
        const ma = moves[s.move];
        const md = def.moves[s.move];
        if (f >= md.startup + 1 && kickedHit !== moveSeq) {
          kickedHit = moveSeq;
          swayV += 1.1 * (accentK[s.move]?.k ?? 1);
          bobV -= 1.4;
        }
        if (ma.recoverAt && f >= ma.recoverAt && kickedRec !== moveSeq) {
          kickedRec = moveSeq;
          swayV -= 0.9;
          bobV += 1.8;
        }
      }
      out[J.chest * 3] += swayP * (s.action === 'attack' ? 0.5 : 0.9);
      out[J.head * 3] += swayP * 0.5 + bobP * 0.6;
      out[C.squash] += -bobP * 0.15;
      // lean into velocity in the air, limbs trail
      if (!s.grounded && s.action !== 'hitstun' && s.action !== 'ledgehang' && s.action !== 'ledgeclimb' && s.action !== 'held') {
        const vxF = s.vx * s.facing;
        out[C.lean] += clamp(vxF * 1.6, -0.25, 0.25);
        const up = clamp(-s.vy * 3.2, -0.5, 0.6);
        out[J.armL * 3 + 2] += up * 0.6;
        out[J.armR * 3 + 2] += up * 0.6;
        out[J.armL * 3] -= vxF * 2.2;
        out[J.armR * 3] -= vxF * 2.2;
        out[J.shinL * 3] -= Math.max(0, up) * 0.3;
        out[J.shinR * 3] -= Math.max(0, up) * 0.3;
        if (s.action === 'fall' || s.action === 'rise') out[C.squash] += -clamp(Math.abs(s.vy) * 0.25, 0, 0.04);
      }
      // the head stays level (round 3): the neck counter-pitches the body's lean and curve, so
      // the face keeps looking at the opponent through runs, dashes, landings and strikes
      const lvl = (spec.headLevel ?? 0.75) * (s.action === 'hitstun' && s.hitlag > 0 ? 0.95 : headLevelWeight(s.action));
      if (lvl > 0) {
        const pitch = out[C.lean] + out[C.curve] * (CURVE_W[0] + CURVE_W[1]) + out[J.hips * 3] + out[J.chest * 3];
        out[J.head * 3] -= lvl * clamp(pitch, -1.2, 1.2);
      }
      // head: track the opponent, lag a little behind the body (a spring), never stop dead
      lookAt(s, other, lookWeight(s.action));
      const tgtP = out[J.head * 3] + lookP;
      const tgtT = out[J.head * 3 + 1] + lookT;
      if (dt === 0 || first || (frozen && s.action === 'hitstun')) {
        // (the blow snaps the head into the hurt pose at once: no spring through the hit pause)
        headP = tgtP;
        headT = tgtT;
        headVP = headVT = 0;
      } else if (!frozen) {
        headVP += (500 * (tgtP - headP) - 30 * headVP) * step;
        headVT += (400 * (tgtT - headT) - 28 * headVT) * step;
        headP += headVP * step;
        headT += headVT * step;
      }
      out[J.head * 3] = headP;
      out[J.head * 3 + 1] = headT;

      // ---- apply ----
      root.position.copy(pos);
      let shakeX = 0;
      let shakeY = 0;
      if (s.hitlag > 0) {
        if (lastHl <= 0 || s.hitlag > lastHl) hlMax = s.hitlag;
      }
      lastHl = s.hitlag;
      if (s.hitlag > 0 && (s.action === 'hitstun' || s.action === 'shieldstun' || s.action === 'held')) {
        // the one hit: shake hard along the launch line every frame, biggest at the blow
        const decay = 0.45 + 0.55 * clamp01(s.hitlag / Math.max(1, hlMax));
        const amp = Math.min(0.24, 0.07 + hlMax * 0.009) * decay * (s.action === 'shieldstun' ? 0.45 : 1);
        const l = Math.hypot(s.kbx, s.kby) || 1;
        const sgn = s.hitlag % 2 === 0 ? 1 : -1;
        const jx = s.action === 'hitstun' ? s.kbx / l : -s.facing;
        const jy = s.action === 'hitstun' ? s.kby / l : 0;
        // knocked back along the launch at once (so the two bodies separate at the blow), then
        // rattling about that point; the knock eases into the real launch after the pause
        const knock = s.action === 'hitstun' ? Math.min(0.32, 0.12 + hlMax * 0.012) : 0.05;
        sepX = jx * knock;
        sepY = Math.max(0, jy) * knock * 0.5;
        sepT = 0;
        shakeX = sgn * amp * jx + sepX + ((s.hitlag * 7) % 3 - 1) * amp * 0.25 * jy;
        shakeY = sgn * amp * jy * 0.8 + sepY + ((s.hitlag * 7) % 3 - 1) * amp * 0.25 * Math.abs(jx);
      } else if (sepT < 1 && s.hitlag <= 0) {
        sepT = Math.min(1, sepT + (step * 60) / 6);
        const k = 1 - ease.inOutSine(sepT);
        shakeX += sepX * k;
        shakeY += sepY * k;
      }
      if (s.hitlag > 0 && s.action === 'attack') {
        // the attacker leans into the blow and trembles a little (it holds the strike shape)
        const sgn = s.hitlag % 2 === 0 ? 1 : -1;
        shakeX = sgn * 0.022 * s.facing;
        out[C.squash] += 0.035 * clamp01(s.hitlag / Math.max(1, hlMax));
      }
      // a held robot sits in the holder's hands
      if (s.action === 'held' && other) {
        const hspec = SPEC_BY_FIGHTER.get(other.fighter);
        const hdef = ctx.fighterDefs[other.fighter];
        (hspec?.carry ?? defaultCarry)(other.action === 'attack' ? other.move : other.move === 'special' ? 'special' : null, other.actionFrame, hdef, _carry, def);
        const cx = other.x + other.facing * _carry.x;
        const cy = other.y + _carry.y - def.height * 0.6;
        carryX = cx - pos.x;
        carryY = cy - pos.y;
        out[C.x] = 0;
        out[C.y] = 0;
        shakeX += carryX;
        shakeY += carryY;
        // facing is toward the holder; a forward roll for the holder is a back roll for us
        out[C.spin] += -_carry.spin * DEG;
      } else if (releaseT < 1) {
        releaseT = Math.min(1, releaseT + (step * 60) / 7);
        const k = 1 - ease.outCubic(releaseT);
        shakeX += relOff.x * k;
        shakeY += relOff.y * k;
      }
      applyAll(out, s, f, other, shakeX, shakeY);

      applyMaterials(out, s);
      exprFromState(s, f);
      applyExpr(out, dt === 0 || first);
      finish(out, s, groundBelow(pos.x, pos.y), s.grounded ? 0 : 1);
      if (dt > 0) first = false;
      else first = true;
    },

    showPose(name, t) {
      root.visible = true;
      const custom = spec.show?.[name];
      if (custom) custom(t, out, P);
      else {
        switch (name) {
          case 'select':
            copyPose(out, P.stance);
            breathe(out, t);
            break;
          case 'versus':
            mixInto(out, P.stance, P.versus, ease.outBack(clamp01(t / 0.5)));
            breathe(out, t, 0.6);
            break;
          case 'wait':
            copyPose(out, P.stance);
            breathe(out, t);
            break;
          case 'win':
            mixInto(out, P.stance, P.win, ease.outBack(clamp01(t / 0.5)));
            out[C.y] += Math.abs(Math.sin(t * 4)) * 0.04;
            break;
          case 'lose':
            mixInto(out, P.stance, P.lose, ease.inOutSine(clamp01(t / 0.8)));
            break;
        }
      }
      if (name === 'select') {
        facing = 1;
        yawCur = yawFor(1) - t * 0.9;
      } else if (name === 'versus') {
        facing = opts.side === 0 ? 1 : -1;
        yawCur = yawFor(facing);
      } else {
        yawCur = yawFor(facing);
      }
      if (facing < 0) mirrorPose(out);
      applyRoot(out, facing, 0, 0);
      applyJoints(out);
      setStretch(0, 0);
      setStretch(1, 0);
      // the holder chain may have moved this frame: refresh it, then the robot
      root.updateWorldMatrix(true, true);
      // feet on the floor at the root's height (in the holder's space: solveLegs takes it to world)
      pos.copy(root.position);
      mover.position.x = 0;
      solveLegs(out, root.position.y, 'none', 0, 0, 0);
      root.updateMatrixWorld(true);
      uniforms.white.value = 0;
      exprForShow(name, t);
      applyExpr(out, true);
      ground.visible = name === 'wait' || name === 'win' || name === 'lose';
      ground.position.set(0, 0.012, 0);
      marker.visible = name === 'wait';
      shadowMat.opacity = 0.7;
      info.t = t;
      info.charge = 0;
      info.armor = false;
      info.move = null;
      info.f = 0;
      spec.update?.(handles, out, null, info);
    },

    point(name, outV) {
      let o: THREE.Object3D;
      switch (name) {
        case 'head': o = joints.head; break;
        case 'chest': o = joints.chest; break;
        case 'handL': o = joints.handL; break;
        case 'handR': o = joints.handR; break;
        case 'footL': o = joints.footL; break;
        case 'footR': o = joints.footR; break;
        default: o = joints.chest;
      }
      if (name === 'head') return o.localToWorld(outV.set(0.05, 0.12, 0));
      if (name === 'chest') return o.localToWorld(outV.set(0.15, B.neckY * 0.55, 0));
      if (name === 'handL' || name === 'handR') return o.localToWorld(outV.set(0, -B.handReach, 0));
      if (name === 'footL' || name === 'footR') return o.localToWorld(outV.set(0.05, -B.ankle * 0.8, 0));
      return o.getWorldPosition(outV);
    },

    setFlash(amount, color) {
      // flat flashes only (white, ink, a silhouette dark). A saturated colour is a tint over the
      // livery (the old red hit tint read pink and salmon on every robot): it is refused, the hit
      // reads from the hit pause, the shake and the stage's own flash.
      if (amount > 0) {
        _flashC.set(color).getHSL(_flashHsl);
        if (_flashHsl.s > 0.3 && _flashHsl.l > 0.12 && _flashHsl.l < 0.9) amount = 0;
        else uniforms.flashColor.value.set(color);
      }
      uniforms.flash.value = clamp01(amount);
    },

    dispose() {
      root.removeFromParent();
      for (const k of geoKeys) releaseGeo(k);
      for (const m of Object.values(mats)) m.dispose();
      for (const x of owned) x.dispose();
      shadowMat.dispose();
      markMat.dispose();
      lineMat.dispose();
      releaseShadowTex();
    },
  };
  return view;
}

/** the side-colour ground marker: a flat open chevron bracket around the feet, pointing forward */
function markerGeometry(r: number, grow = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const w = r * 1.25;
  const d = r * 0.55;
  const t = 0.07;
  const g = grow;
  // a flat hexagon outline, open at the back, with a nose at the front. `grow` widens the band on
  // every side (the dark outline drawn under it, so the side colour reads on the light deck)
  const outer: [number, number][] = [[-w * 0.55 - g, -d - g], [w * 0.55 + g * 0.4, -d - g], [w + 0.12 + g * 1.5, 0], [w * 0.55 + g * 0.4, d + g], [-w * 0.55 - g, d + g]];
  const inner: [number, number][] = [[-w * 0.55 - g, d - t + g], [w * 0.55 - t * 0.5 - g * 0.4, d - t + g], [w + 0.12 - t * 1.6 - g * 1.5, 0], [w * 0.55 - t * 0.5 - g * 0.4, -d + t - g], [-w * 0.55 - g, -d + t - g]];
  shape.moveTo(outer[0][0], outer[0][1]);
  for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], outer[i][1]);
  for (const p of inner) shape.lineTo(p[0], p[1]);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// ================================================================================================
// Small helpers every fighter file can use
// ================================================================================================

/** interpolated feet position between two sim states */
export function lerpPos(s: FighterState, prev: FighterState, alpha: number, out: THREE.Vector3): THREE.Vector3 {
  // a big jump (respawn, snap) is not interpolated
  const far = Math.abs(s.x - prev.x) > 3 || Math.abs(s.y - prev.y) > 3;
  const a = far ? 1 : alpha;
  return out.set(prev.x + (s.x - prev.x) * a, prev.y + (s.y - prev.y) * a, 0);
}

/** progress 0..1 through the current move, or -1 when not in a move */
export function moveProgress(def: FighterDef, s: FighterState): number {
  if (!s.move) return -1;
  const m = def.moves[s.move];
  const total = m.startup + m.active + m.recovery;
  return Math.max(0, Math.min(1, s.actionFrame / Math.max(1, total)));
}

/** which part of a move a frame is in */
export function movePart(def: FighterDef, s: FighterState): 'startup' | 'active' | 'recovery' | null {
  if (!s.move) return null;
  const m = def.moves[s.move];
  const f = s.actionFrame;
  if (f <= m.startup) return 'startup';
  if (f <= m.startup + m.active) return 'active';
  return 'recovery';
}

/** dispose every geometry, material and texture under an object */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const x of mats) {
      for (const v of Object.values(x)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
      x.dispose();
    }
  });
  root.removeFromParent();
}

/** placeholder tint per action, so states are visible */
export function actionTint(s: FighterState): string {
  switch (s.action) {
    case 'attack':
    case 'charge':
      return PALETTE.hazard;
    case 'hitstun':
      return s.tumble ? PALETTE.ember : '#ff9a8a';
    case 'shield':
    case 'shieldstun':
      return '#7fd0ff';
    case 'shieldbreak':
      return '#ff00aa';
    case 'roll':
    case 'spotdodge':
    case 'airdodge':
      return '#9aa6b5';
    case 'holding':
    case 'held':
      return '#b6ff7a';
    case 'ledgehang':
    case 'ledgeclimb':
      return '#ffe08a';
    case 'helpless':
      return '#6a7686';
    case 'respawn':
      return PALETTE.white;
    default:
      return '#000000';
  }
}

// ================================================================================================
// Placeholder (kept until tick, gantry and vise move onto createRobot)
// ================================================================================================

export interface CapsuleShape {
  /** body width as a share of def.width (silhouette hint per fighter) */
  bodyScale: number;
  /** body colour */
  body: string;
  /** head size as a share of height */
  head: number;
}

/** The shared capsule stand-in: a body sized from FighterDef, a visor showing facing, a side band. */
export function createCapsuleFighter(ctx: StageCtx, def: FighterDef, opts: { side: Side; sideColor: string; alt: boolean }, shape: CapsuleShape): FighterView {
  const root = new THREE.Group();
  root.name = `fighter-${def.id}-${opts.side}`;
  const body = new THREE.Group();
  root.add(body);
  void ctx;

  const h = def.height;
  const r = Math.min((def.width / 2) * shape.bodyScale, (h * (1 - shape.head)) * 0.36);
  const bodyColor = new THREE.Color(shape.body);
  if (opts.alt) bodyColor.offsetHSL(0, -0.15, 0.12);
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.45, metalness: 0.35, emissive: '#000000' });
  const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.1, h - 2 * r - h * shape.head), 6, 14), bodyMat);
  capsule.position.y = (h - h * shape.head) / 2;
  capsule.castShadow = true;
  body.add(capsule);

  const headR = (h * shape.head) / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 12), bodyMat);
  head.position.y = h - headR;
  head.castShadow = true;
  body.add(head);

  const visorMat = new THREE.MeshStandardMaterial({ color: '#111', emissive: PALETTE.white, emissiveIntensity: 1.4 });
  const visor = new THREE.Mesh(new THREE.BoxGeometry(headR * 0.6, headR * 0.35, headR * 1.2), visorMat);
  visor.position.set(headR * 0.85, h - headR, 0);
  body.add(visor);

  const bandMat = new THREE.MeshStandardMaterial({ color: opts.sideColor, roughness: 0.5, emissive: opts.sideColor, emissiveIntensity: 0.25 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, h * 0.08, 14, 1, true), bandMat);
  band.position.y = h * 0.66;
  body.add(band);

  const markMat = new THREE.MeshBasicMaterial({ color: opts.sideColor, transparent: true, opacity: 0.55, depthWrite: false });
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(def.width * 1.2, 0.5), markMat);
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = 0.02;
  root.add(mark);

  const shieldMat = new THREE.MeshBasicMaterial({ color: opts.sideColor, transparent: true, opacity: 0.3, depthWrite: false });
  const shield = new THREE.Mesh(new THREE.SphereGeometry(h * 0.55, 16, 12), shieldMat);
  shield.position.y = h * 0.5;
  shield.visible = false;
  root.add(shield);

  root.traverse((o) => o.layers.set(LAYER.FIGHTER));

  const pos = new THREE.Vector3();
  const tint = new THREE.Color();
  const flashCol = new THREE.Color();
  let facing = 1;

  const view: FighterView = {
    root,
    pose(s, prev, alpha) {
      root.visible = s.action !== 'dead';
      lerpPos(s, prev, alpha, pos);
      root.position.copy(pos);
      facing = s.facing;
      body.rotation.y = s.facing === 1 ? 0 : Math.PI;
      body.rotation.z = 0;
      body.position.y = 0;
      body.scale.set(1, 1, 1);
      if (s.action === 'hitstun' && s.tumble) body.rotation.z = (s.actionFrame * 0.35) % (Math.PI * 2);
      if (s.action === 'jumpsquat' || s.action === 'land') body.scale.set(1.08, 0.86, 1.08);
      if (s.action === 'shieldbreak') body.rotation.z = Math.sin(s.actionFrame * 0.2) * 0.2;
      if (s.action === 'ledgehang') root.position.y -= h * 0.75;
      if (s.action === 'knockdown') body.rotation.z = (Math.PI / 2) * -s.facing;
      if (s.action === 'charge') body.scale.set(1.04, 0.95, 1.04);
      tint.set(actionTint(s));
      bodyMat.emissive.copy(tint);
      bodyMat.emissiveIntensity = tint.getHex() === 0 ? 0 : 0.45;
      if (s.invuln > 0 && s.action !== 'respawn') bodyMat.emissiveIntensity = 0.25 + 0.25 * Math.sin(s.actionFrame * 0.8);
      shield.visible = s.action === 'shield' || s.action === 'shieldstun';
      shield.scale.setScalar(0.4 + 0.6 * (s.shield / 100));
    },
    showPose(name, t) {
      body.rotation.z = 0;
      body.scale.set(1, 1, 1);
      shield.visible = false;
      root.visible = true;
      bodyMat.emissiveIntensity = 0;
      if (name === 'select') body.rotation.y = t * 0.8;
      else if (name === 'versus') body.rotation.y = opts.side === 0 ? 0.4 : Math.PI - 0.4;
      else if (name === 'wait') body.position.y = Math.abs(Math.sin(t * 2.2)) * 0.05;
      else if (name === 'win') body.position.y = Math.abs(Math.sin(t * 4)) * 0.3;
      else if (name === 'lose') body.scale.set(1, 0.85, 1);
      if (name !== 'wait' && name !== 'win') body.position.y = 0;
    },
    setFlash(amount, color) {
      if (amount <= 0) return;
      flashCol.set(color);
      bodyMat.emissive.copy(flashCol);
      bodyMat.emissiveIntensity = Math.max(bodyMat.emissiveIntensity, amount * 2.5);
    },
    point(name, out) {
      const f = facing;
      root.updateMatrixWorld();
      switch (name) {
        case 'head': out.set(0, h - headR, 0); break;
        case 'chest': out.set(0, h * 0.62, 0); break;
        case 'handL':
        case 'handR': out.set(r * 1.4 * f, h * 0.5, name === 'handL' ? -r : r); break;
        case 'footL':
        case 'footR': out.set(0, 0.05, name === 'footL' ? -r * 0.6 : r * 0.6); break;
        default: out.set(0, h * 0.5, 0);
      }
      return root.localToWorld(out);
    },
    dispose() {
      disposeTree(root);
    },
  };
  return view;
}
