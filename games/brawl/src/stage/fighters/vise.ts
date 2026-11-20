// Vise: the grappler. A wide, top-heavy press of a robot: an inverted-triangle body under a huge
// shoulder yoke built like the frame of a bench vise, a lead screw across the top of the yoke that
// turns whenever the clamps close, long thick arms that hang low and end in enormous two-jaw clamps
// (bare bright steel jaws with dark ridged faces on brass housings, open at rest so the gap reads),
// a low head set forward between the shoulders with a dark visor and two narrow eyes, short bowed
// legs on broad flat feet.
//
// Same structure as kiln.ts: proportions, palette, parts (build), key poses, the 18 moves, the carry
// paths for the grab game, and update() for its own moving extras. Round 2: update() owns both arms
// whenever Vise holds someone, and closes the clamps on the held robot's head and flank (it reads
// where they are from the carry, so the jaws bite a body part instead of passing through it).

import * as THREE from 'three';
import type { CreateFighterView, StageCtx } from '../api.ts';
import type { FighterDef, FighterState, MoveDef, MoveId } from '../../sim/types.ts';
import {
  C, J, G, copyPose, createRobot, ease, mixInto, pose, robotMaterial, solveTwoBone, strike,
  type AnimArgs, type CarryFn, type CarryOut, type FrameInfo, type Key, type Kit, type MoveAnim, type Pose, type PoseSet, type RobotSpec, type RigHandles,
} from '../rig.ts';

// ------------------------------------------------------------------------------------------------
// Body
// ------------------------------------------------------------------------------------------------

const BODY = {
  ankle: 0.15,
  shin: 0.26,
  thigh: 0.25,
  hipWidth: 0.44,
  chestY: 0.14,
  // the head sits forward of the yoke and its crown clears the beam
  neckY: 0.55,
  neckX: 0.33,
  shoulderX: -0.03,
  shoulderY: 0.6,
  shoulderZ: 0.6,
  upperArm: 0.4,
  forearm: 0.36,
  handReach: 0.33,
  stanceWidth: 0.8,
  armStretch: 0.45,
  centerY: 1.0,
};

// aux channels
const SCREW = 0; // extra lead-screw turns asked for by a pose (turns)

const DEG = Math.PI / 180;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------------------------------------
// Parts
// ------------------------------------------------------------------------------------------------

/** a rounded box that narrows toward its bottom (x and z scaled by bx, bz at the bottom, 1 at the top) */
function taper(w: number, h: number, d: number, r: number, bx: number, bz: number, at: [number, number, number]): THREE.BufferGeometry {
  const g = G.box(w, h, d, r);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + h / 2) / h;
    p.setX(i, p.getX(i) * (bx + (1 - bx) * t));
    p.setZ(i, p.getZ(i) * (bz + (1 - bz) * t));
  }
  g.computeVertexNormals();
  g.translate(at[0], at[1], at[2]);
  return g;
}

/** jaw teeth: bars across the face plate */
function ridges(n: number, x: number, y0: number, y1: number, depth: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const y = y0 + ((y1 - y0) * i) / (n - 1);
    out.push(G.box(0.034, 0.024, depth, 0.005, [x, y, 0]));
  }
  return out;
}

function build(k: Kit): void {
  const m = k.mats;
  // bare bright steel for the jaws, the lead screw and the rams: glossy, with a tight highlight
  const steelM = k.own(robotMaterial(k.uniforms, { color: '#dfe5ec', roughness: 0.16, metalness: 0.82, envMapIntensity: 1.7 }, 1, 1.3));

  // ---- pelvis: a graphite block with the hip axle
  k.mesh('hips', 'hips-iron', () => G.merge([
    G.box(0.36, 0.24, 0.5, 0.06, [0, 0.03, 0]),
    G.cyl(0.1, 0.1, 0.56, 12, [0, -0.04, 0], [90, 0, 0]),
    G.box(0.06, 0.13, 0.22, 0.02, [0.18, 0.06, 0]),
  ]), m.paint2);

  // ---- torso: an inverted triangle, narrow waist to a deep, broad chest under the yoke
  k.mesh('chest', 'torso-paint', () => G.merge([
    taper(0.56, 0.5, 1.02, 0.1, 0.72, 0.46, [0.02, 0.4, 0]),
    // the yoke beam: the bench-vise frame across the shoulders, set back so the head sits in front
    G.box(0.38, 0.26, 1.3, 0.07, [-0.12, 0.7, 0]),
    // chest plate standing proud of the front
    taper(0.08, 0.36, 0.62, 0.03, 1, 0.55, [0.29, 0.42, 0]),
  ]), m.paint);
  k.mesh('chest', 'torso-iron', () => G.merge([
    G.box(0.42, 0.24, 0.5, 0.06, [0, 0.07, 0]), // waist
    G.box(0.36, 0.06, 0.56, 0.02, [0.02, 0.17, 0]), // belly band
    G.box(0.1, 0.36, 0.7, 0.03, [-0.27, 0.4, 0]), // back plate
    G.box(0.05, 0.06, 1.2, 0.02, [0.08, 0.6, 0]), // seam under the yoke lip
    // bearing posts holding the lead screw over the yoke
    G.box(0.14, 0.16, 0.1, 0.03, [-0.18, 0.88, 0.42]),
    G.box(0.14, 0.16, 0.1, 0.03, [-0.18, 0.88, -0.42]),
    G.cyl(0.11, 0.13, 0.12, 12, [0.24, 0.55, 0]), // neck socket
  ]), m.paint2);
  k.mesh('chest', 'torso-trim', () => G.merge([
    G.rivets(4, [0.335, 0.6, -0.2], [0.335, 0.6, 0.2], 0.02, 'x'),
    G.rivets(3, [0.335, 0.26, -0.13], [0.335, 0.26, 0.13], 0.02, 'x'),
    G.rivets(6, [0.075, 0.79, -0.56], [0.075, 0.79, 0.56], 0.022, 'x'),
    // bearing caps
    G.cyl(0.075, 0.075, 0.12, 12, [-0.18, 0.97, 0.42], [90, 0, 0]),
    G.cyl(0.075, 0.075, 0.12, 12, [-0.18, 0.97, -0.42], [90, 0, 0]),
    // gauge bezel and the belt buckle
    G.cyl(0.085, 0.085, 0.04, 16, [0.34, 0.42, 0], [0, 0, 90]),
    G.box(0.05, 0.11, 0.2, 0.02, [0.22, 0.07, 0]),
  ]), m.trim);
  // pressure gauge face and two lamps on the yoke front (glow with hydraulic pressure)
  k.mesh('chest', 'lamps', () => G.merge([
    G.cyl(0.062, 0.062, 0.02, 16, [0.365, 0.42, 0], [0, 0, 90]),
    G.box(0.03, 0.05, 0.14, 0.01, [0.075, 0.68, 0.38]),
    G.box(0.03, 0.05, 0.14, 0.01, [0.075, 0.68, -0.38]),
  ]), m.glow);

  // the lead screw: a threaded rod over the yoke with a tommy bar through its end, turns as the clamps close
  k.group('chest', 'screw', [-0.18, 0.97, 0]);
  k.mesh('screw', 'screw-steel', () => {
    const parts: THREE.BufferGeometry[] = [G.cyl(0.045, 0.045, 1.4, 12, [0, 0, 0], [90, 0, 0])];
    // tilted thread rings: when the rod turns they read as threads running along it
    for (let i = 0; i < 22; i++) {
      const z = -0.6 + (1.2 * i) / 21;
      if (Math.abs(Math.abs(z) - 0.42) < 0.07) continue;
      parts.push(G.cyl(0.064, 0.064, 0.024, 12, [0, 0, z], [90, 10, 0]));
    }
    return G.merge(parts);
  }, steelM);
  k.mesh('screw', 'screw-brass', () => G.merge([
    G.cyl(0.075, 0.075, 0.09, 12, [0, 0, 0.72], [90, 0, 0]), // bosses
    G.cyl(0.075, 0.075, 0.09, 12, [0, 0, -0.72], [90, 0, 0]),
    G.cyl(0.026, 0.026, 0.56, 8, [0, 0, 0.72]), // tommy bar through the boss
    G.sphere(0.05, 10, [0, 0.28, 0.72]),
    G.sphere(0.05, 10, [0, -0.28, 0.72]),
  ]), m.trim);

  // ---- head: a green helmet with a heavy brow, a dark visor with two narrow eyes, a graphite jaw
  k.mesh('head', 'head-paint', () => G.merge([
    G.box(0.44, 0.34, 0.48, 0.09, [0.03, 0.19, 0]),
    G.box(0.5, 0.11, 0.54, 0.04, [0.08, 0.35, 0], [0, 0, -10]), // brow
    G.box(0.1, 0.07, 0.22, 0.02, [-0.06, 0.43, 0]), // crest
  ]), m.paint);
  k.mesh('head', 'head-iron', () => G.merge([
    G.box(0.06, 0.2, 0.42, 0.025, [0.255, 0.18, 0]), // visor
    G.box(0.22, 0.12, 0.38, 0.03, [0.16, 0.03, 0]), // jaw block
    G.cyl(0.09, 0.1, 0.14, 10, [-0.04, -0.03, 0]), // neck
    G.box(0.04, 0.04, 0.26, 0.01, [0.275, 0.01, 0]), // grille bar
  ]), m.paint2);
  k.eyes('head', { at: [0.29, 0.185, 0], w: 0.38, h: 0.17, sep: 0.56, size: 1.15 });

  for (const sd of ['L', 'R'] as const) {
    const z = sd === 'L' ? -1 : 1;
    const zs = BODY.shoulderZ;
    // shoulder: the yoke end cap, a big block with the side colour over its whole outer face and crown
    k.mesh(`shoulder${sd}`, `cap-paint${sd}`, () => G.merge([
      G.box(0.5, 0.44, 0.36, 0.08, [-0.02, 0.08, z * (zs + 0.03)]),
      G.box(0.42, 0.12, 0.4, 0.04, [-0.02, -0.13, z * (zs + 0.04)]),
    ]), m.paint);
    k.mesh(`shoulder${sd}`, `cap-side${sd}`, () => G.merge([
      G.box(0.46, 0.36, 0.05, 0.02, [-0.02, 0.09, z * (zs + 0.215)]),
      G.box(0.46, 0.05, 0.3, 0.02, [-0.02, 0.31, z * (zs + 0.04)]),
      G.cyl(0.06, 0.06, 0.05, 12, [-0.02, 0.09, z * (zs + 0.25)], [90, 0, 0]), // the end of the yoke axle
    ]), m.side);
    // upper arm: graphite, thick, ribbed
    k.mesh(`arm${sd}`, 'upperarm', () => G.merge([
      G.sphere(0.15, 12, [0, -0.02, 0]),
      G.cyl(0.13, 0.12, 0.34, 12, [0, -0.2, 0]),
      G.cyl(0.145, 0.145, 0.04, 12, [0, -0.12, 0]),
      G.cyl(0.14, 0.14, 0.04, 12, [0, -0.24, 0]),
      G.sphere(0.13, 12, [0, -0.4, 0]),
    ]), m.dark);
    // forearm: a heavy green casing that widens toward the wrist, a brass ram along its back and a brass cuff
    k.mesh(`fore${sd}`, 'fore-paint', () => G.merge([
      taper(0.3, 0.32, 0.34, 0.07, 0.76, 0.82, [0, -0.2, 0]).rotateX(Math.PI).translate(0, -0.4, 0),
    ]), m.paint);
    k.mesh(`fore${sd}`, 'fore-trim', () => G.merge([
      G.box(0.36, 0.07, 0.38, 0.03, [0, -0.33, 0]), // wrist cuff
      G.cyl(0.034, 0.034, 0.26, 8, [-0.19, -0.16, 0]),
      G.cyl(0.055, 0.055, 0.1, 10, [-0.19, -0.04, 0]),
    ]), m.trim);
    // the telescoping ram between forearm and clamp: thick enough to belong to this build
    k.mesh(`stretch${sd}`, 'rod', () => G.merge([G.cyl(0.105, 0.105, 1, 12, [0, -0.5, 0])]), steelM);
    // clamp: a brass housing with the pivot pin, two bright steel jaws with dark ridged faces
    k.mesh(`hand${sd}`, 'housing', () => G.merge([
      G.box(0.32, 0.16, 0.34, 0.05, [0, -0.07, 0]),
      G.cyl(0.055, 0.055, 0.42, 12, [0, -0.13, 0], [90, 0, 0]),
    ]), m.trim);
    k.group(`hand${sd}`, `jawA${sd}`, [0.06, -0.13, 0]);
    k.group(`hand${sd}`, `jawB${sd}`, [-0.06, -0.13, 0]);
    for (const [jn, sx] of [['A', 1], ['B', -1]] as const) {
      k.mesh(`jaw${jn}${sd}`, `jaw-steel${jn}`, () => G.merge([
        G.box(0.12, 0.46, 0.28, 0.04, [sx * 0.055, -0.22, 0]),
        G.box(0.13, 0.11, 0.28, 0.035, [sx * 0.0, -0.43, 0]), // hooked tip turning inward
        G.box(0.05, 0.24, 0.2, 0.02, [sx * 0.125, -0.15, 0]), // outer rib
      ]), steelM);
      k.mesh(`jaw${jn}${sd}`, `jaw-face${jn}`, () => G.merge([
        G.box(0.03, 0.32, 0.24, 0.008, [sx * -0.012, -0.21, 0]),
        ...ridges(7, sx * -0.03, -0.08, -0.35, 0.22),
      ]), m.dark);
    }
    // legs: graphite thighs, green shin guards with a knee plate, broad flat graphite feet with brass soles
    k.mesh(`thigh${sd}`, 'thigh', () => G.merge([
      G.cyl(0.14, 0.12, 0.26, 12, [0, -0.12, 0]),
      G.sphere(0.125, 12, [0, -0.25, 0]),
    ]), m.dark);
    k.mesh(`shin${sd}`, 'shin', () => G.merge([
      G.box(0.3, 0.3, 0.3, 0.07, [0.02, -0.13, 0]),
      G.box(0.1, 0.14, 0.24, 0.03, [0.16, 0.0, 0]),
    ]), m.paint);
    k.mesh(`foot${sd}`, 'foot', () => G.merge([
      G.box(0.58, 0.11, 0.42, 0.04, [0.08, -0.08, 0]),
      G.box(0.22, 0.1, 0.3, 0.03, [-0.02, 0.0, 0]), // ankle block
    ]), m.paint2);
    k.mesh(`foot${sd}`, 'foot-trim', () => G.merge([
      G.box(0.64, 0.045, 0.47, 0.015, [0.08, -0.14, 0]), // brass sole: a bright line on the deck
      G.box(0.16, 0.12, 0.46, 0.04, [0.34, -0.08, 0]), // toe cap
    ]), m.trim);
  }
}

// ------------------------------------------------------------------------------------------------
// Key poses
// ------------------------------------------------------------------------------------------------

// a wrestler's stance: low, wide, hunched forward over the yoke, clamps open and reaching, the
// near clamp lower and further out than the far one, weight on the front foot
const stance = pose({
  y: -0.12,
  curve: 12,
  hips: [4, 6],
  chest: [6, -8],
  head: [-16, 8],
  shoulders: [0, 0, 6],
  armL: [52, 0, 24], foreL: [44], handL: [6],
  armR: [18, 0, 30], foreR: [44], handR: [6],
  grip: 0.05,
  fL: [0.3, 0], fR: [-0.26, 0],
  glow: 0.25,
});

const air = pose({
  plant: 0,
  curve: 6,
  chest: [6], head: [-10],
  arms: [34, 0, 50], fores: [40], hands: [-10],
  thighL: [56, 0, 14], shinL: [-88], thighR: [22, 0, 14], shinR: [-56], feet: [12],
  grip: 0.15, glow: 0.25,
});

const P: Partial<PoseSet> & { stance: Pose; air: Pose; select?: Pose } = {
  stance,
  air,
  crouch: pose({ y: -0.26, squash: 0.1, curve: 22, chest: [10], head: [-20], arms: [14, 0, 40], fores: [40], lean: 2 }, stance),
  rise: pose({ squash: -0.07, curve: -10, chest: [-2], head: [-14], arms: [-20, 0, 40], fores: [26], thighL: [24], shinL: [-40], thighR: [4], shinR: [-20], feet: [-30], grip: 0.3 }, air),
  apex: pose({ curve: 14, thighL: [70, 0, 16], shinL: [-106], thighR: [36, 0, 16], shinR: [-80], arms: [40, 0, 58], fores: [54], chest: [8] }, air),
  fall: pose({ curve: -4, arms: [26, 0, 72], fores: [32], thighL: [42, 0, 14], shinL: [-66], thighR: [10, 0, 12], shinR: [-36], chest: [2], head: [-6], grip: 0.05 }, air),
  fastfall: pose({ curve: -10, arms: [10, 0, 92], fores: [16], thighs: [2, 0, 6], shins: [-6], squash: -0.08 }, air),
  airjump: pose({ curve: -14, thighL: [84], shinL: [-118], thighR: [-18], shinR: [-22], arms: [-44, 0, 56], fores: [28], squash: -0.07, grip: 0 }, air),
  // a wrestler's charge: low, both clamps leading wide open
  dash: pose({ lean: 18, curve: 16, y: -0.15, chest: [8], head: [-22], armL: [80, 0, 20], foreL: [16], armR: [64, 0, 30], foreR: [20], hands: [-30], grip: 0, fL: [0.5, 0], fR: [-0.46, 0.1], yaw: -10 }, stance),
  run: pose({ lean: 15, curve: 14, y: -0.1, chest: [4, 0], head: [-20, 0], hips: [2, 0], arms: [44, 0, 30], fores: [30], hands: [-24], grip: 0.05, yaw: -10 }, stance),
  walk: pose({ lean: 5, curve: 12, chest: [6, 0], head: [-16, 0], hips: [4, 0], y: -0.12 }, stance),
  skid: pose({ lean: -16, curve: -12, chest: [-8, 0], head: [8, 0], arms: [64, 0, 60], fores: [18], y: -0.2, fL: [0.56, 0], fR: [0.02, 0], grip: 0, squash: 0.06 }, stance),
  pivot: pose({ y: -0.15, squash: 0.06, curve: 14, chest: [6, 0], arms: [34, 0, 50], fores: [40], yaw: 25 }, stance),
  // forearms up in front of the head, jaws half shut, braced low
  shield: pose({ y: -0.18, curve: 22, chest: [8, -4], head: [12], armL: [64, 0, 10], foreL: [100], armR: [56, 0, 14], foreR: [108], hands: [-10], grip: 0.55, lean: 2, glow: 0.2 }, stance),
  dizzy: pose({ y: -0.16, curve: 30, chest: [16, 0, 12], head: [30, 0, 20], arms: [4, 0, 14], fores: [10], eyes: -0.6, glow: 0.05, grip: 0 }, stance),
  rollTuck: pose({ y: -0.4, curve: 40, chest: [30], head: [36], arms: [56, 0, 10], fores: [120], plant: 0, thighs: [108], shins: [-140], squash: 0.04, grip: 1 }, stance),
  spot: pose({ y: -0.16, z: -0.5, yaw: 34, chest: [8, 22], arms: [24, 0, 14], fores: [80] }, stance),
  airdodge: pose({ curve: 30, chest: [24], head: [30], arms: [46, 0, 10], fores: [122], thighs: [84], shins: [-122], grip: 1 }, air),
  // the opponent lifted in both clamps: arched back under the weight, knees bent, feet wide, body
  // turned to profile so the arms reach along the screen (update() puts the clamps on the robot)
  hold: pose({ y: -0.04, curve: -12, lean: -6, sway: 0.05, chest: [-12, 0], head: [-6], arms: [104, 0, 12], fores: [14], hands: [0], grip: 1, fL: [0.42, 0], fR: [-0.4, 0], squash: 0.04, glow: 0.6, yaw: -24 }, stance),
  // held by the head: limbs dangling, legs hanging apart, clamps limp
  held: pose({ curve: -12, chest: [-8], head: [24], arms: [18, 0, 34], fores: [26], hands: [10], thighL: [18, 0, 8], shinL: [-30], thighR: [-6, 0, 8], shinR: [-14], feet: [20], eyes: -0.2, grip: 0.4 }, air),
  flinch: pose({ curve: -16, chest: [-12, 10], head: [-30], lean: -12, arms: [44, 0, 62], fores: [20], y: -0.06, eyes: 0.7, glow: 0.6, grip: 0 }, stance),
  // the blow lands: one clean C bent away from it, head snapped back, clamps flung up and out
  hurt: pose({ curve: -28, chest: [-8, 0], head: [-36, 0], lean: -12, y: -0.04, armL: [140, 0, 52], armR: [112, 0, 70], fores: [12], hands: [-30], thighL: [36], shinL: [-64], thighR: [-8], shinR: [-12], plant: 0.5, eyes: 1, glow: 0.8, grip: 0, stretch: 0.08, lineAng: -60 }, stance),
  // launched: spread wide like a thrown star, both clamps open, so it stays readable small
  tumble: pose({ yaw: -14, curve: -24, chest: [-10], head: [-30], armL: [128, 0, 76], armR: [72, 0, 100], fores: [10], hands: [-36], thighL: [62, 0, 26], shinL: [-96], thighR: [-34, 0, 26], shinR: [-18], eyes: 0.5, grip: 0 }, air),
  lying: pose({ plant: 0, yaw: -34, spin: 90, y: -0.52, x: 0.1, chest: [-6], head: [-30], arms: [150, 0, 40], fores: [24], thighs: [-6, 0, 10], shins: [-14], feet: [-30], eyes: -0.5, glow: 0.1, grip: 0 }, air),
  getup: pose({ plant: 0, yaw: -30, spin: 42, y: -0.32, x: 0.05, chest: [16], head: [-24], arms: [64, 0, 30], fores: [-10], thighs: [70], shins: [-110], feet: [0], grip: 0.3 }, air),
  hang: pose({ arms: [168, 0, 12], fores: [6], curve: -10, head: [-26], thighs: [10, 0, 8], shins: [-18], grip: 1 }, air),
  helpless: pose({ arms: [150, 0, 40], fores: [24], curve: -12, head: [-14], thighs: [12, 0, 10], shins: [-32], eyes: -0.6, glow: 0.05, grip: 0 }, air),
  respawn: pose({ chest: [-4, 0], head: [-12, 0], arms: [20, 0, 34], fores: [60], hands: [-20], grip: 0 }, stance),
  entrance: pose({ y: -0.32, curve: 40, chest: [20, 0], head: [36, 0], arms: [0, 0, 30], fores: [20], eyes: -1, glow: 0, grip: 1 }, stance),
  // a double flex: forearms up, clamps shut, the yoke squared to the camera
  win: pose({ y: -0.04, curve: -14, chest: [-4, 0], head: [-24, 0], arms: [96, 0, 74], fores: [106], hands: [-10], grip: 1, glow: 1, eyes: 1, yaw: 18, fL: [0.28, 0], fR: [-0.28, 0] }, stance),
  lose: pose({ curve: 44, chest: [16, 0], head: [40, 0], arms: [4, 0, 12], fores: [6], hands: [0], y: -0.14, eyes: -0.8, glow: 0, grip: 0 }, stance),
  // signature: hunched low on a diagonal, the near clamp cocked high beside the face with its jaws
  // wide, the far clamp low and forward, lead screw over the shoulder, eyes on the opponent
  versus: pose({
    y: -0.12, curve: 16, lean: 7, sway: 0.03, chest: [4, -12], head: [-24, 10], shoulders: [0, 0, 2],
    armR: [84, 0, 10], foreR: [118], handR: [-10],
    armL: [62, 0, 8], foreL: [104], handL: [-10],
    grip: 0, glow: 1, eyes: 1, yaw: -10, fL: [0.34, 0], fR: [-0.34, 0],
  }, stance),
  // the select card: compact, clamps up in front of the chest, ready
  select: pose({ y: -0.08, curve: 8, chest: [2, -6], head: [-14, 6], armR: [22, 0, 16], foreR: [112], armL: [16, 0, 12], foreL: [106], hands: [-6], grip: 0.1, yaw: -6, glow: 0.4 }, stance),
};

// ------------------------------------------------------------------------------------------------
// Moves (bespoke, from the `look` notes in the sim's MoveDefs)
// ------------------------------------------------------------------------------------------------

/** keys for a throw, built by hand (the throws are paced by the carry, not by a strike) */
function keyed(list: [number, Pose, ((t: number) => number)?][]): Key[] {
  return list.map(([f, p, e]) => ({ f, pose: p, ease: e }));
}

function viseMoves(def: FighterDef): Partial<Record<MoveId, MoveAnim>> {
  const M = def.moves;
  const st = stance;
  const ar = air;
  const hold = P.hold!;
  const out: Partial<Record<MoveId, MoveAnim>> = {};
  const S = (id: MoveId) => M[id] as MoveDef;

  // Clamp Jab: a short club with the near clamp, the shoulder rolled in behind it, the jaws clack
  out.jab = strike(S('jab'), {
    wind: pose({ chest: [6, 12], counter: 12, lean: -4, curve: 6, x: -0.04, armR: [4, 0, 26], foreR: [96], grip: 0, squash: 0.04 }, st),
    strike: pose({ yaw: -10, curve: 10, chest: [8, -8], counter: -10, lean: 6, x: 0.08, armR: [80, 0, 8], foreR: [6], armL: [28, 0, 30], foreL: [70], fL: [0.42, 0], fR: [-0.26, 0] }, st),
    follow: pose({ yaw: -10, curve: 12, chest: [9, -9], counter: -12, lean: 7, x: 0.09, armR: [74, 0, 10], foreR: [16], armL: [28, 0, 30], fL: [0.42, 0], fR: [-0.26, 0] }, st),
    recover: pose({ yaw: -6, curve: 14, chest: [8, -2], lean: 3, x: 0.07, y: -0.14, armR: [40, 0, 30], foreR: [60], fL: [0.38, 0], fR: [-0.26, 0], grip: 0.4 }, st),
    accent: 0.8,
    limb: 'handR',
  });

  // Jaw Shove: the clamp driven out palm first, jaws open, the whole shoulder behind it
  out.tilt = strike(S('tilt'), {
    wind: pose({ y: -0.16, curve: -8, chest: [-2, 14], counter: 16, lean: -8, x: -0.08, armR: [-20, 0, 26], foreR: [110], hands: [-30], grip: 0, squash: 0.06 }, st),
    strike: pose({ yaw: -12, y: -0.15, curve: 10, sway: 0.05, chest: [6, -12], counter: -14, lean: 10, x: 0.18, armR: [86, 0, 6], foreR: [4], handR: [-60], armL: [-20, 0, 40], foreL: [50], grip: 0, fL: [0.56, 0], fR: [-0.44, 0] }, st),
    follow: pose({ yaw: -12, y: -0.15, curve: 12, sway: 0.06, chest: [7, -12], counter: -16, lean: 11, x: 0.19, armR: [80, 0, 8], foreR: [12], handR: [-50], armL: [-20, 0, 40], grip: 0, fL: [0.56, 0], fR: [-0.44, 0] }, st),
    recover: pose({ yaw: -8, y: -0.18, curve: 14, chest: [8, -4], lean: 5, x: 0.14, armR: [36, 0, 30], foreR: [64], armL: [30, 0, 30], foreL: [50], grip: 0.2, fL: [0.48, 0], fR: [-0.38, 0] }, st),
    accent: 0.8,
    limb: 'handR',
    grip: 0,
  });

  // Overhead Pinch: both clamps swing up from the knees and snap shut over the head
  out.uptilt = strike(S('uptilt'), {
    wind: pose({ y: -0.24, curve: 26, chest: [12, 0], head: [-4], arms: [-12, 0, 50], fores: [20], grip: 0, squash: 0.08 }, st),
    strike: pose({ y: 0.02, curve: -24, chest: [-6, 0], head: [-34], arms: [166, 0, 22], fores: [24], squash: -0.07, glow: 0.8 }, st),
    follow: pose({ y: 0.0, curve: -26, chest: [-8, 0], head: [-28], arms: [176, 0, 20], fores: [30] }, st),
    recover: pose({ y: -0.14, curve: 2, chest: [2, 0], head: [-18], arms: [110, 0, 36], fores: [60], grip: 0.6 }, st),
    limb: 'hands',
  });

  // Shoulder Rush: drops the near shoulder and barges like a linebacker, arms tucked
  out.dash = strike(S('dash'), {
    wind: pose({ y: -0.24, lean: 10, curve: 20, chest: [8, 14, -8], counter: 14, head: [-26], shoulderR: [0, 0, -10], armR: [-24, 0, 14], foreR: [90], armL: [30, 0, 30], foreL: [70], grip: 0.4, fL: [0.14, 0], fR: [-0.44, 0], squash: 0.06 }, st),
    strike: pose({ yaw: -14, y: -0.2, lean: 18, curve: 14, sway: 0.06, x: 0.18, chest: [6, -14, 10], counter: -8, head: [-30], shoulderR: [0, 0, -16], armR: [-34, 0, 8], foreR: [100], armL: [-30, 0, 40], foreL: [50], grip: 0.6, glow: 0.8, fL: [0.5, 0], fR: [-0.66, 0.06] }, st),
    follow: pose({ yaw: -14, y: -0.2, lean: 19, curve: 16, sway: 0.07, x: 0.2, chest: [7, -14, 10], counter: -10, head: [-28], armR: [-30, 0, 12], foreR: [96], armL: [-30, 0, 40], fL: [0.5, 0], fR: [-0.66, 0.06] }, st),
    recover: pose({ yaw: -8, y: -0.18, lean: 8, curve: 16, x: 0.12, chest: [8, -4], head: [-20], arms: [30, 0, 34], fores: [60], grip: 0.3, fL: [0.44, 0], fR: [-0.5, 0] }, st),
    accent: 0.75,
    limb: 'body',
  });

  // Hydraulic Clap: both clamps spread wide behind the shoulders (lamps rising with charge), the
  // body arched back, then clapped together in front with a lunge
  const sm = M.smash.hitboxes[0];
  out.smash = strike(S('smash'), {
    windEarly: pose({ y: -0.14, curve: -10, chest: [-4, 0], lean: -4, arms: [60, 0, 76], fores: [24], grip: 0, glow: 0.7, yaw: 6 }, st),
    wind: pose({ y: -0.2, curve: -22, chest: [-8, 0], head: [-18], lean: -12, x: -0.12, shoulders: [0, 0, 16], arms: [70, 0, 104], fores: [16], hands: [-24], grip: 0, glow: 1, squash: 0.05, yaw: 14, fL: [0.4, 0], fR: [-0.42, 0] }, st),
    strike: pose({ yaw: -14, y: -0.2, curve: 14, sway: 0.06, chest: [6, 0], head: [-26], lean: 10, x: 0.26, shoulders: [0, 0, -6], arms: [88, 0, 4], fores: [4], glow: 1.2, squash: 0.04, fL: [0.62, 0], fR: [-0.5, 0] }, st),
    follow: pose({ yaw: -14, y: -0.21, curve: 16, sway: 0.07, chest: [7, 0], head: [-24], lean: 11, x: 0.27, arms: [80, 0, 6], fores: [12], glow: 0.9, fL: [0.62, 0], fR: [-0.5, 0] }, st),
    recover: pose({ yaw: -8, y: -0.22, curve: 18, chest: [8, 0], head: [-16], lean: 4, x: 0.2, arms: [44, 0, 40], fores: [50], glow: 0.6, grip: 0.4, fL: [0.56, 0], fR: [-0.46, 0] }, st),
    accent: 0.8,
    limb: 'hands',
    path: [[-1.2, sm.x - 0.1, sm.y + 0.15], [0, sm.x, sm.y], [S('smash').active, sm.x + 0.02, sm.y - 0.05]],
  });

  // Jack Lift: squat deep, then the body extends like a hydraulic jack, both clamps driven straight up
  out.upsmash = strike(S('upsmash'), {
    wind: pose({ y: -0.38, squash: 0.1, curve: 34, chest: [14, 0], head: [-12], arms: [10, 0, 34], fores: [44], grip: 0, glow: 0.8 }, st),
    strike: pose({ y: 0.12, squash: -0.12, curve: -22, chest: [-6, 0], head: [-34], arms: [176, 0, 12], fores: [4], glow: 1.3, eyes: 1, aux: { [SCREW]: 1 } }, st),
    follow: pose({ y: 0.1, curve: -26, chest: [-8, 0], head: [-28], arms: [184, 0, 16], fores: [10], glow: 0.9, aux: { [SCREW]: 1 } }, st),
    recover: pose({ y: -0.16, curve: 6, head: [-16], arms: [120, 0, 38], fores: [50], glow: 0.6, grip: 0.6, aux: { [SCREW]: 1 } }, st),
    limb: 'hands',
  });

  // Hull Press: arms and legs spread flat like a press plate closing on everything around it
  out.nair = strike(S('nair'), {
    wind: pose({ curve: 30, chest: [14], arms: [40, 0, 10], fores: [100], thighs: [76, 0, 4], shins: [-118], squash: 0.05, grip: 1 }, ar),
    strike: pose({ curve: -8, chest: [0], head: [-10], arms: [86, 0, 88], fores: [4], hands: [-40], thighs: [10, 0, 36], shins: [-12], grip: 0, squash: -0.04, glow: 0.7 }, ar),
    follow: pose({ curve: -6, chest: [2], arms: [80, 0, 80], fores: [14], thighs: [16, 0, 30], shins: [-24], grip: 0.2 }, ar),
    limb: 'none',
  });

  // Clamp Swipe: a backhand with the open clamp, from high over the far shoulder down across the front
  const fa = M.fair.hitboxes[0];
  out.fair = strike(S('fair'), {
    wind: pose({ curve: -22, chest: [-12, 12], counter: 14, lean: -10, armR: [160, 0, -6], foreR: [60], armL: [10, 0, 44], foreL: [50], thighs: [36], shins: [-60], grip: 0 }, ar),
    strike: pose({ yaw: -10, curve: 24, chest: [10, -10], counter: -10, lean: 14, armR: [80, 0, 16], foreR: [6], handR: [-40], armL: [-30, 0, 44], thighL: [66], shinL: [-94], thighR: [-16], shinR: [-30], grip: 0 }, ar),
    follow: pose({ yaw: -10, curve: 28, chest: [12, -12], counter: -12, lean: 16, armR: [40, 0, 22], foreR: [16], armL: [-30, 0, 44], thighL: [62], shinL: [-90], thighR: [-14], shinR: [-32], grip: 0.2 }, ar),
    limb: 'handR',
    grip: 0,
    path: [[-1, fa.x - 0.25, fa.y + 0.6], [0, fa.x, fa.y + 0.1], [S('fair').active - 1, fa.x - 0.05, fa.y - 0.25]],
  });

  // Elbow Piston: the arm rams straight back on its hydraulic, clamp shut like a hammer head
  out.bair = strike(S('bair'), {
    wind: pose({ curve: 20, chest: [8, 12], counter: 14, armR: [40, 0, 20], foreR: [126], thighs: [60], shins: [-100], grip: 1 }, ar),
    strike: pose({ curve: 22, chest: [16, -8], counter: -10, head: [-34], lean: 10, armR: [-100, 0, 10], foreR: [0], armL: [90, 0, 40], foreL: [30], thighL: [20], shinL: [-40], thighR: [50], shinR: [-80], glow: 0.7 }, ar),
    follow: pose({ curve: 20, chest: [14, -6], head: [-28], lean: 9, armR: [-86, 0, 14], foreR: [12], armL: [84, 0, 40], thighs: [34], shins: [-64] }, ar),
    limb: 'handR',
  });

  // Scissor Snap: both clamps cross over the head like shears and bite
  const ua = M.uair.hitboxes[0];
  out.uair = strike(S('uair'), {
    wind: pose({ curve: 18, chest: [10], arms: [50, 0, 84], fores: [20], thighs: [50], shins: [-80], grip: 0 }, ar),
    strike: pose({ curve: -26, chest: [-6], head: [-34], arms: [172, 0, 6], fores: [10], thighL: [36], shinL: [-60], thighR: [-10], shinR: [-20], glow: 0.7 }, ar),
    follow: pose({ curve: -24, chest: [-6], head: [-28], arms: [164, 0, 14], fores: [20], thighL: [32], shinL: [-56], thighR: [-6], shinR: [-24] }, ar),
    limb: 'hands',
    path: [[-1, ua.x + 0.1, ua.y - 0.35], [0, ua.x, ua.y], [S('uair').active, ua.x - 0.05, ua.y + 0.05]],
  });

  // Press Drop: knees up, both clamps locked together under the body, dropped like a press ram
  out.dair = strike(S('dair'), {
    wind: pose({ y: 0.1, curve: 14, chest: [10], head: [-20], arms: [130, 0, 30], fores: [60], thighs: [92, 0, 16], shins: [-130], squash: 0.05, grip: 0 }, ar),
    strike: pose({ y: -0.3, curve: 18, chest: [6], head: [-30], arms: [8, 0, 8], fores: [0], hands: [0], thighs: [96, 0, 28], shins: [-122], squash: -0.08, glow: 1 }, ar),
    strikeEnd: pose({ y: -0.32, curve: 18, chest: [6], head: [-30], arms: [6, 0, 8], fores: [0], thighs: [96, 0, 28], shins: [-122], glow: 0.8 }, ar),
    follow: pose({ y: -0.2, curve: 12, chest: [6], arms: [24, 0, 24], fores: [12], thighs: [80, 0, 20], shins: [-110] }, ar),
    limb: 'hands',
  });

  // Wide Clamp: both clamps thrown forward wide open, the whole body diving behind them, then they bite
  out.grab = strike(S('grab'), {
    wind: pose({ y: -0.18, curve: -10, chest: [0, 0], lean: -6, x: -0.06, arms: [40, 0, 70], fores: [36], hands: [-24], grip: 0, squash: 0.05, yaw: 6 }, st),
    strike: pose({ yaw: -18, y: -0.16, curve: 12, sway: 0.06, chest: [4, 0], head: [-30], lean: 12, x: 0.12, arms: [88, 0, 12], fores: [2], grip: 0, fL: [0.6, 0], fR: [-0.44, 0] }, st),
    follow: pose({ yaw: -18, y: -0.17, curve: 14, sway: 0.07, chest: [5, 0], head: [-26], lean: 13, x: 0.16, arms: [84, 0, 8], fores: [10], grip: 1, fL: [0.6, 0], fR: [-0.44, 0] }, st),
    // a whiff: it over-reached and hauls itself back, clamps snapping on nothing
    recover: pose({ yaw: -10, y: -0.2, curve: 22, chest: [10, 0], head: [-16], lean: 6, x: 0.14, arms: [50, 0, 26], fores: [50], grip: 1, fL: [0.54, 0], fR: [-0.42, 0] }, st),
    accent: 0.6,
    limb: 'hands',
    grip: 0,
  });

  // Bench Throw: hoisted flat overhead, a dip like a bench press, then pressed up and away with a
  // whip of the whole body; the arms follow through along the launch
  out.throwf = {
    keys: keyed([
      [0, hold],
      [4.5, pose({ y: 0.0, curve: -26, lean: -10, chest: [-8, 0], head: [-34], arms: [168, 0, 16], fores: [14], squash: -0.05, glow: 0.9, yaw: -16 }, hold), ease.outCubic],
      [8, pose({ y: -0.26, curve: -14, lean: -8, chest: [-4, 0], head: [-30], arms: [150, 0, 22], fores: [70], squash: 0.09, glow: 1, yaw: -16, aux: { [SCREW]: 1 } }, hold), ease.inOutSine],
      [10, pose({ y: -0.04, curve: 12, sway: 0.06, lean: 8, x: 0.12, chest: [4, 0], head: [-26], arms: [150, 0, 10], fores: [2], squash: -0.06, grip: 0, glow: 1.3, yaw: -22, fL: [0.62, 0], fR: [-0.46, 0], aux: { [SCREW]: 1 } }, hold), ease.inCubic],
      [13.5, pose({ y: -0.08, curve: 14, sway: 0.07, lean: 9, x: 0.14, chest: [4, 0], head: [-24], arms: [158, 0, 12], fores: [6], squash: -0.02, grip: 0, glow: 1, yaw: -22, fL: [0.62, 0], fR: [-0.46, 0], aux: { [SCREW]: 1 } }, hold), ease.outCubic],
      [18, pose({ y: -0.16, curve: 8, lean: 3, x: 0.08, chest: [2, 0], head: [-18], arms: [70, 0, 34], fores: [60], grip: 0.5, glow: 0.6, yaw: -12, fL: [0.54, 0], fR: [-0.42, 0], aux: { [SCREW]: 1 } }, st), ease.outCubic],
      [25, pose({ y: -0.14, curve: 14, lean: 3, x: 0.06, arms: [48, 0, 28], fores: [52], grip: 0.2, aux: { [SCREW]: 1 } }, st), ease.inOutSine],
      [29, st, ease.outCubic],
    ]),
    limb: 'none',
    accent: 0,
  };

  // Crusher Spin: hoisted flat overhead, two full turns on the spot (update() turns the body), then
  // swung down in front and slung up and back over the head; the arms follow it over the shoulder
  out.throwb = {
    keys: keyed([
      [0, hold],
      [4, pose({ y: -0.04, curve: -22, lean: -6, chest: [-6, 0], head: [-32], arms: [170, 0, 20], fores: [20], squash: -0.04, glow: 1, yaw: 0 }, hold), ease.outCubic],
      [11, pose({ y: -0.16, curve: -12, lean: -4, chest: [-4, 0], head: [-26], arms: [164, 0, 26], fores: [24], squash: 0.04, glow: 1.1, yaw: 0, fL: [0.42, 0], fR: [-0.42, 0] }, hold), ease.inOutSine],
      [16, pose({ y: -0.18, curve: -16, lean: -6, chest: [-6, 0], head: [-28], arms: [168, 0, 26], fores: [20], squash: 0.05, glow: 1.2, yaw: 0, fL: [0.42, 0], fR: [-0.42, 0] }, hold), ease.inOutSine],
      [19.5, pose({ y: -0.2, curve: 10, sway: 0.05, lean: 6, x: 0.1, chest: [4, 0], head: [-20], arms: [96, 0, 14], fores: [8], squash: 0.06, glow: 1.3, yaw: -20, fL: [0.56, 0], fR: [-0.42, 0], aux: { [SCREW]: 1 } }, hold), ease.inCubic],
      [23, pose({ y: -0.04, curve: -30, lean: -12, x: 0.04, chest: [-10, 0], head: [-38], arms: [200, 0, 18], fores: [6], squash: -0.06, grip: 0, glow: 1.2, yaw: -14, fL: [0.5, 0], fR: [-0.4, 0], aux: { [SCREW]: 1 } }, hold), ease.outCubic],
      [27, pose({ y: -0.06, curve: -28, lean: -10, chest: [-10, 0], head: [-34], arms: [192, 0, 24], fores: [14], grip: 0, glow: 0.9, yaw: -12, fL: [0.5, 0], fR: [-0.4, 0], aux: { [SCREW]: 1 } }, hold), ease.inOutSine],
      [33, pose({ y: -0.18, curve: 10, lean: 2, chest: [4, 0], head: [-18], arms: [70, 0, 34], fores: [40], grip: 0.4, glow: 0.6, yaw: -6, aux: { [SCREW]: 1 } }, st), ease.outCubic],
      [40, pose({ y: -0.14, curve: 12, arms: [50, 0, 30], fores: [50], grip: 0.1, aux: { [SCREW]: 1 } }, st), ease.inOutSine],
      [45, st, ease.outCubic],
    ]),
    limb: 'none',
    accent: 0,
  };

  // Lift Toss: lowered to load the legs, then a heave on straight arms that lets go on the way up;
  // the arms finish pointing straight at the sky
  out.throwu = {
    keys: keyed([
      [0, hold],
      [6, pose({ y: -0.34, curve: 26, lean: -2, chest: [8, 0], head: [-26], arms: [92, 0, 14], fores: [30], squash: 0.1, glow: 0.9, yaw: -20 }, hold), ease.inOutSine],
      [12, pose({ y: 0.06, curve: -18, lean: -4, chest: [-6, 0], head: [-36], arms: [140, 0, 12], fores: [4], squash: -0.1, glow: 1.3, yaw: -20, aux: { [SCREW]: 1 } }, hold), ease.inCubic],
      [15, pose({ y: 0.1, curve: -26, lean: -6, chest: [-8, 0], head: [-40], arms: [182, 0, 10], fores: [2], squash: -0.12, grip: 0, glow: 1.3, yaw: -18, aux: { [SCREW]: 1 } }, hold), ease.outCubic],
      [19, pose({ y: 0.04, curve: -24, lean: -5, chest: [-8, 0], head: [-36], arms: [178, 0, 16], fores: [10], grip: 0, glow: 1, yaw: -16, aux: { [SCREW]: 1 } }, hold), ease.inOutSine],
      [24, pose({ y: -0.18, curve: 10, chest: [4, 0], head: [-20], arms: [96, 0, 36], fores: [40], grip: 0.5, glow: 0.6, yaw: -6, aux: { [SCREW]: 1 } }, st), ease.outCubic],
      [29, pose({ y: -0.14, curve: 12, arms: [60, 0, 30], fores: [46], grip: 0.2, aux: { [SCREW]: 1 } }, st), ease.inOutSine],
      [32, st, ease.outCubic],
    ]),
    limb: 'none',
    accent: 0,
  };

  // Lunge Clamp: coil low, then a long lunge with both clamps flung wide; the lift and slam is in the hold
  out.special = strike(S('special'), {
    windEarly: pose({ y: -0.22, curve: 20, chest: [8, 0], head: [-24], lean: 2, arms: [20, 0, 78], fores: [30], grip: 0, glow: 0.8, fL: [0.2, 0], fR: [-0.42, 0], yaw: 8 }, st),
    wind: pose({ y: -0.32, curve: 30, chest: [10, 0], head: [-30], lean: 4, x: -0.08, arms: [30, 0, 98], fores: [20], hands: [-30], grip: 0, glow: 1.1, squash: 0.08, fL: [0.14, 0], fR: [-0.54, 0], yaw: 10 }, st),
    strike: pose({ yaw: -20, y: -0.2, curve: 10, sway: 0.08, chest: [4, 0], head: [-32], lean: 16, x: 0.12, arms: [90, 0, 30], fores: [2], hands: [-20], grip: 0, glow: 1.2, fL: [0.7, 0], fR: [-0.62, 0.08] }, st),
    strikeEnd: pose({ yaw: -20, y: -0.22, curve: 12, sway: 0.08, chest: [5, 0], head: [-30], lean: 17, x: 0.14, arms: [88, 0, 12], fores: [4], grip: 0, glow: 1.1, fL: [0.7, 0], fR: [-0.62, 0.08] }, st),
    follow: pose({ yaw: -20, y: -0.26, curve: 18, sway: 0.08, chest: [7, 0], head: [-26], lean: 18, x: 0.18, arms: [70, 0, 8], fores: [16], grip: 1, fL: [0.7, 0], fR: [-0.56, 0] }, st),
    // the whiff: stumbles on the front foot, clamps snapping shut on air, then hauls itself upright
    recover: pose({ yaw: -10, y: -0.3, curve: 34, sway: 0.04, chest: [12, 0], head: [-10], lean: 10, x: 0.16, armL: [20, 0, 40], foreL: [40], armR: [-10, 0, 30], foreR: [60], grip: 1, glow: 0.5, squash: 0.06, fL: [0.62, 0], fR: [-0.5, 0] }, st),
    accent: 0.7,
    limb: 'hands',
    grip: 0,
  });

  // Torque Spin: arms straight out like a wrench handle, clamps open, two turns on the spot
  out.special2 = strike(S('special2'), {
    wind: pose({ y: -0.18, curve: 20, chest: [8, 14], counter: 14, arms: [40, 0, 50], fores: [60], grip: 0, squash: 0.05 }, st),
    strike: pose({ y: -0.1, curve: -4, chest: [2, 0], head: [-20], arms: [88, 0, 86], fores: [2], hands: [-40], grip: 0, glow: 0.9, aux: { [SCREW]: 2 } }, st),
    strikeEnd: pose({ y: -0.1, curve: -2, chest: [3, 0], head: [-20], arms: [86, 0, 84], fores: [4], hands: [-40], grip: 1, glow: 0.9, aux: { [SCREW]: 3 } }, st),
    follow: pose({ y: -0.14, curve: 10, chest: [6, 0], arms: [64, 0, 64], fores: [24], grip: 1, aux: { [SCREW]: 3 } }, st),
    recover: pose({ y: -0.2, curve: 24, chest: [16, 0, 10], head: [10, 0, 14], arms: [20, 0, 40], fores: [30], grip: 0.6, eyes: -0.3, aux: { [SCREW]: 3 } }, st),
    limb: 'none',
    spinTurns: 2,
    accent: 0.5,
  });

  // Clamp Climb: reaches up and hauls itself up the air hand over hand (the alternation is in update())
  out.recover = strike(S('recover'), {
    wind: pose({ y: -0.04, curve: 26, thighs: [70, 0, 12], shins: [-110], chest: [14], arms: [10, 0, 40], fores: [60], squash: 0.08, grip: 0.3 }, ar),
    strike: pose({ curve: -16, chest: [-4], head: [-30], armR: [176, 0, 16], foreR: [8], armL: [120, 0, 30], foreL: [60], thighL: [40], shinL: [-70], thighR: [6], shinR: [-30], feet: [-20], glow: 1, squash: -0.06 }, ar),
    strikeEnd: pose({ curve: -14, chest: [-4], head: [-26], armR: [160, 0, 18], foreR: [20], armL: [150, 0, 24], foreL: [30], thighL: [30], shinL: [-56], thighR: [16], shinR: [-40], glow: 0.9 }, ar),
    follow: pose({ curve: -10, arms: [150, 0, 40], fores: [26], thighs: [12], shins: [-32], glow: 0.4 }, ar),
    recover: pose({ curve: -8, arms: [140, 0, 46], fores: [30], thighs: [16, 0, 12], shins: [-36], glow: 0.3, eyes: -0.4 }, ar),
    limb: 'none',
  });
  return out;
}

// ------------------------------------------------------------------------------------------------
// The grab game: where the held robot sits, and how it travels through each throw.
// x forward from Vise's feet, y up: the held robot's chest (0.6 of its height). spin + rolls its
// top away from Vise. Every throw lets go near the sim's release point (in front, at chest
// height), so the launch leaves straight from the jaws instead of easing across the screen.
// ------------------------------------------------------------------------------------------------

const HOLD_X = 0.9;
const HOLD_Y = 1.56;
const REL_X = 1.26;
const REL_Y = 1.38;

/** Crusher Spin: turns of Vise's body at frame f (two full turns between f 4.5 and f 16) */
function spinAngle(f: number): number {
  const u = clamp01((f - 4.5) / 11.5);
  return Math.PI * 4 * ease.inOutSine(u);
}

/** a hard shake of the held robot every 22 frames (0..1, peaks 3 frames into each) */
function shakeAt(f: number): number {
  if (f < 9) return 0;
  const u = (f - 9) % 22;
  return Math.exp(-((u - 3) * (u - 3)) / 3.5);
}

/** the hold: seized at the grab point, hauled up off the deck, then hoisted higher, swinging as it
 *  kicks, with a hard shake every so often */
function holdCarry(f: number, o: CarryOut): void {
  const lift = ease.outBack(clamp01((f - 1) / 6));
  const swing = clamp01((f - 5) / 6);
  const higher = 0.1 * ease.inOutSine(clamp01((f - 8) / 24));
  const j = shakeAt(f);
  o.x = 1.2 + (HOLD_X - 1.2) * lift - 0.05 * j;
  o.y = 1.12 + (HOLD_Y - 1.12) * lift + higher + 0.03 * Math.sin(f * 0.24) * swing + 0.08 * j;
  o.spin = -10 * lift + 13 * Math.sin(f * 0.19) * swing - 10 * j;
}

// The sim lets go on the throw's hitbox frame; the carry is read with whole action frames, so the
// last frame the robot is still held is rel - 1. Every path is at its release point by then.
const carry: CarryFn = (move, f, def, o) => {
  const h = def.height;
  if (!move || move === 'grab') {
    holdCarry(f, o);
    return;
  }
  if (move === 'special') {
    // Lunge Clamp: caught at the end of the lunge, hoisted high by the head, then swung down and
    // slammed on its back in front, head toward Vise, legs flung out away from it
    const up = ease.outCubic(clamp01((f - 1) / 6));
    const hang = clamp01((f - 7) / 3);
    const slam = ease.inCubic(clamp01((f - 10.5) / 4.5));
    o.x = 1.1 + (0.8 - 1.1) * up + (1.74 - 0.8) * slam;
    o.y = 1.1 + (h + 0.5 - 1.1) * up + 0.08 * hang * (1 - slam) + (0.48 - (h + 0.58)) * slam;
    o.spin = -8 * up + 14 * hang * (1 - slam) - 100 * slam;
    return;
  }
  // every throw starts where the hold left off
  const x0 = HOLD_X;
  const y0 = HOLD_Y + 0.05;
  const s0 = -10;
  if (move === 'throwf') {
    // Bench Throw: hoisted flat overhead, a dip, then pressed up and away
    const lift = ease.inOutCubic(clamp01(f / 4));
    const dip = Math.sin(Math.PI * clamp01((f - 4) / 3.5));
    const press = ease.inQuad(clamp01((f - 7) / 3));
    o.x = x0 + (0.3 - x0) * lift + (REL_X - 0.3) * press;
    o.y = y0 + (h + 0.74 - y0) * lift - 0.24 * dip + (REL_Y + 0.12 - (h + 0.74)) * press;
    o.spin = s0 + (-84 - s0) * lift + 70 * press;
  } else if (move === 'throwb') {
    // Crusher Spin: overhead, two turns of an airplane spin, then swung down in front for the sling
    const lift = ease.inOutCubic(clamp01(f / 4));
    const th = spinAngle(f);
    const swing = ease.inQuad(clamp01((f - 16) / 4));
    const r = 0.42;
    const ox = r * Math.cos(th);
    o.x = x0 + (ox - x0) * lift + (REL_X - ox) * swing;
    o.y = y0 + (h + 0.66 - y0) * lift + (REL_Y + 0.12 - (h + 0.66)) * swing;
    o.spin = s0 + (-88 - s0) * lift + 78 * swing;
  } else {
    // Lift Toss: lowered to load the legs, then heaved straight up on locked arms, let go rising
    const load = ease.inOutSine(clamp01(f / 6));
    const heave = ease.inQuad(clamp01((f - 6) / 6));
    o.x = x0 + (1.12 - x0) * load + (REL_X - 1.12) * heave;
    o.y = y0 + (1.18 - y0) * load + (REL_Y + 0.14 - 1.18) * heave;
    o.spin = s0 * (1 - load) + 6 * heave;
  }
};

// ------------------------------------------------------------------------------------------------
// Bespoke action animations: the stalk (idle), the hold (the strain, the Lunge Clamp slam)
// ------------------------------------------------------------------------------------------------

function evalKeys(keys: Key[], f: number, base: Pose, out: Pose): void {
  if (f <= keys[0].f) {
    const k = keys[0].pose;
    copyPose(out, k === 'base' ? base : k);
    return;
  }
  for (let i = 1; i < keys.length; i++) {
    const k1 = keys[i];
    if (f <= k1.f || i === keys.length - 1) {
      const k0 = keys[i - 1];
      const span = Math.max(1e-3, k1.f - k0.f);
      const u = clamp01((f - k0.f) / span);
      const e = (k1.ease ?? ease.inOutSine)(u);
      mixInto(out, k0.pose === 'base' ? base : k0.pose, k1.pose === 'base' ? base : k1.pose, e);
      return;
    }
  }
}

/** a clack every few seconds: the jaws snap shut and spring back open */
function clack(t: number, period: number, offset: number): number {
  let u = (t + offset) % period;
  if (u < 0) u += period;
  if (u < 0.07) return u / 0.07;
  if (u < 0.13) return 1;
  if (u < 0.4) return 1 - ease.outCubic((u - 0.13) / 0.27);
  return 0;
}

/** the stalk: a low sway from foot to foot, clamps drifting, a clack now and then */
function stalk(o: Pose, t: number, depth: number): void {
  const w = Math.sin(t * Math.PI * 2 * 0.5);
  const w2 = Math.sin(t * Math.PI * 2 * 1.0 + 0.6);
  o[J.hips * 3 + 2] += w * 5 * DEG * depth;
  o[J.chest * 3 + 2] -= w * 6 * DEG * depth;
  o[J.chest * 3 + 1] += w * 6 * DEG * depth;
  o[J.head * 3 + 1] -= w * 4 * DEG * depth;
  o[J.head * 3 + 2] += w * 4 * DEG * depth;
  o[C.lean] += w2 * 1.2 * DEG * depth;
  o[C.curve] += w2 * 3 * DEG * depth;
  o[C.y] += (w2 * 0.5 + 0.5) * -0.025 * depth;
  o[J.armL * 3] += w * 8 * DEG * depth;
  o[J.armR * 3] -= w * 8 * DEG * depth;
  o[J.armL * 3 + 2] += w2 * 3 * DEG * depth;
  o[J.armR * 3 + 2] += w2 * 3 * DEG * depth;
  o[J.shoulderL * 3 + 2] += w2 * 3 * DEG * depth;
  o[J.shoulderR * 3 + 2] += w2 * 3 * DEG * depth;
  o[C.gripL] += clack(t, 3.1, 0) * 0.9 * depth;
  o[C.gripR] += clack(t, 3.1, -0.16) * 0.9 * depth;
  o[C.glow] += (w2 * 0.5 + 0.5) * 0.15;
}

// keyed after build so the poses exist
let SPECIAL_HOLD: Key[] = [];
let SLAM_RISE: Key[] = [];
function specialHoldKeys(): Key[] {
  const hold = P.hold!;
  const lift = pose({ y: -0.04, curve: -20, lean: -8, chest: [-6, 0], head: [-30], arms: [150, 0, 14], fores: [30], grip: 1, glow: 1, yaw: -16 }, hold);
  const top = pose({ y: 0.04, curve: -30, lean: -12, chest: [-8, 0], head: [-36], arms: [174, 0, 16], fores: [14], squash: -0.06, grip: 1, glow: 1.2, yaw: -16, aux: { [SCREW]: 1 } }, hold);
  const topHi = pose({ y: 0.06, curve: -36, lean: -15, x: -0.06, chest: [-10, 0], head: [-34], arms: [184, 0, 16], fores: [18], squash: -0.08, grip: 1, glow: 1.3, yaw: -16, aux: { [SCREW]: 1 } }, hold);
  const slam = pose({ y: -0.18, curve: 8, sway: 0.04, lean: 4, x: 0.24, chest: [2, 0], head: [-22], arms: [56, 0, 10], fores: [6], squash: 0.05, grip: 1, glow: 1.4, yaw: -20, aux: { [SCREW]: 1 }, fL: [0.62, 0], fR: [-0.46, 0] }, hold);
  const over = pose({ y: -0.24, curve: 14, sway: 0.04, lean: 4, x: 0.12, chest: [4, 0], head: [-18], arms: [34, 0, 30], fores: [70], grip: 1, glow: 1, yaw: -14, fL: [0.56, 0], fR: [-0.44, 0] }, hold);
  const proud = pose({ y: -0.1, curve: -12, lean: -4, x: 0.06, chest: [-10, 0], head: [-16], arms: [24, 0, 44], fores: [96], hands: [-10], grip: 1, glow: 0.8, eyes: 0.6, yaw: 0, fL: [0.46, 0], fR: [-0.4, 0] }, P.stance);
  SLAM_RISE = [
    { f: 0, pose: slam },
    { f: 3, pose: over, ease: ease.outCubic },
    { f: 8, pose: proud, ease: ease.outBack },
    { f: 13, pose: proud, ease: ease.inOutSine },
    { f: 16, pose: P.stance, ease: ease.inOutSine },
  ];
  return [
    { f: 0, pose: hold },
    { f: 4, pose: lift, ease: ease.outCubic },
    { f: 7, pose: top, ease: ease.inOutSine },
    { f: 10.5, pose: topHi, ease: ease.inOutSine },
    { f: 15.5, pose: slam, ease: ease.inCubic },
    { f: 18, pose: slam },
  ];
}

function holdingAnim(moves: Partial<Record<MoveId, MoveAnim>>) {
  return (a: AnimArgs, o: Pose): void => {
    const s = a.s;
    const mv = s.move;
    if (mv && mv !== 'grab' && mv !== 'special' && a.def.moves[mv].kind === 'throw') {
      // the pose sheet shows throws as 'holding' with the throw as the move
      const ma = moves[mv];
      if (ma) {
        evalKeys(ma.keys, a.f, a.P.stance, o);
        return;
      }
    }
    if (mv === 'special') {
      evalKeys(SPECIAL_HOLD, a.f, a.P.hold, o);
      return;
    }
    // the hold: hauled up off the deck with a heave (deep knees, then the arch), a slow squeeze,
    // the strain trembling through the body, never the same shape two frames running
    const f = a.f;
    const haul = 1 - ease.outCubic(clamp01((f - 1) / 7));
    copyPose(o, a.P.hold);
    o[C.y] -= 0.12 * haul;
    o[C.squash] += 0.06 * haul;
    o[C.curve] += 30 * DEG * haul;
    o[C.lean] += 10 * DEG * haul;
    const sq = Math.sin(f * 0.24) * clamp01((f - 6) / 6);
    o[C.curve] -= sq * 5 * DEG;
    o[C.lean] -= sq * 2 * DEG;
    o[C.y] -= (sq * 0.5 + 0.5) * 0.03;
    // the shake: a heave up and back that runs through the whole body
    const j = shakeAt(f);
    o[C.y] += 0.03 * j;
    o[C.curve] -= 10 * DEG * j;
    o[C.lean] -= 4 * DEG * j;
    o[J.head * 3] -= 10 * DEG * j;
    o[C.aux + SCREW] += 0.5 * j;
    o[J.chest * 3 + 2] += Math.sin(a.t * 37) * 0.8 * DEG;
    o[C.x] += Math.sin(a.t * 29) * 0.005;
    o[C.glow] += 0.2 + 0.2 * sq;
    o[C.aux + SCREW] += 0.25 * (sq * 0.5 + 0.5);
  };
}

// ------------------------------------------------------------------------------------------------
// Per-frame extras: clamp jaws, the lead screw, lamps, the spin, the arms on the held robot, the climb
// ------------------------------------------------------------------------------------------------

const LAMP_COLD = new THREE.Color('#ffb21f');
const LAMP_HOT = new THREE.Color('#fff2c4');
const _col = new THREE.Color();
const _c: CarryOut = { x: 0, y: 0, spin: 0 };
const _tgt = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _sh = new THREE.Vector3();
const _sh2 = new THREE.Vector3();
const _vp = { x: 0, y: 0 };
const _hp = new THREE.Vector3();
const _d = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _qp = new THREE.Quaternion();
const _qd = new THREE.Quaternion();

/** what the view knows beyond the rig's handles: the stage and the opponent it was last posed against */
interface ViewCtx {
  ctx: StageCtx;
  other: FighterState | null;
  prevAction: string;
  prevMove: MoveId | null;
  /** this landing comes straight out of the Lunge Clamp slam */
  slamLand: boolean;
}
/** the view being posed right now (pose is synchronous), for action animations that need it */
let CUR: ViewCtx | null = null;
const viewCtx = new WeakMap<THREE.Object3D, ViewCtx>();

interface ViseParts {
  jaw: [THREE.Object3D, THREE.Object3D, THREE.Object3D, THREE.Object3D]; // A L, B L, A R, B R
  screw: THREE.Object3D;
  yaw: THREE.Object3D;
  stretch: [THREE.Object3D, THREE.Object3D];
  screwA: number;
  lastT: number;
  init: boolean;
  /** IK weight on the held robot, eased in and out so the arms never pop */
  holdW: number;
  /** the carry this frame (world), and whether the opponent was held last frame */
  cX: number;
  cY: number;
  cS: number;
  heldPrev: boolean;
}
const partsOf = new WeakMap<RigHandles, ViseParts>();

const OPEN = 0.82; // jaw angle wide open, radians

/** jaw closure for a move at frame f, or -1 to keep the pose's grip. Bites snap shut in 1.5 frames. */
function bite(move: MoveId, f: number): number {
  const shutAt = (at: number, until: number, reopen: number): number => {
    if (f < at - 1.5) return 0;
    if (f < at) return smooth((f - (at - 1.5)) / 1.5);
    if (f < until) return 1;
    return 1 - smooth((f - until) / reopen);
  };
  switch (move) {
    case 'jab': return shutAt(5, 9, 8);
    case 'uptilt': return shutAt(8, 16, 10);
    case 'smash': return shutAt(17, 30, 12);
    case 'upsmash': return shutAt(14, 26, 12);
    case 'uair': return shutAt(9, 16, 8);
    case 'dair': return shutAt(12, 26, 10);
    case 'bair': return 1;
    case 'grab': return shutAt(9, 22, 10);
    case 'special': return shutAt(17.5, 26, 10);
    default: return -1;
  }
}

/** a point on the held robot, in world space: (dx forward toward Vise, dy up from its feet) in its
 *  own frame, turned by the carry's spin about its body centre */
function victimPoint(F: number, X: number, Yc: number, hv: number, spinDeg: number, dx: number, dy: number): typeof _vp {
  const py = Yc - 0.08 * hv;
  const ux = -F * dx;
  const uy = Yc - 0.6 * hv + dy - py;
  const a = -F * spinDeg * DEG;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  _vp.x = X + ux * ca - uy * sa;
  _vp.y = py + ux * sa + uy * ca;
  return _vp;
}

const _q = new THREE.Quaternion();
const _ay = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _want = new THREE.Vector3();
const _cr = new THREE.Vector3();
/** twist a clamp about its own axis so its jaws open in the picture plane */
function faceJaws(hand: THREE.Object3D): void {
  hand.getWorldQuaternion(_q);
  _ay.set(0, 1, 0).applyQuaternion(_q);
  _ax.set(1, 0, 0).applyQuaternion(_q);
  // perpendicular to the clamp's axis and to the view direction (z)
  _want.set(_ay.y, -_ay.x, 0);
  const L = _want.length();
  if (L < 0.25) return;
  _want.multiplyScalar(1 / L);
  if (_want.dot(_ax) < 0) _want.negate();
  const th = Math.atan2(_cr.crossVectors(_ax, _want).dot(_ay), _ax.dot(_want));
  hand.rotateY(th);
  hand.updateMatrixWorld(true);
}

/** jaw grip that leaves a gap of `gap` metres between the faces where the bitten part sits */
function gripFor(gap: number): number {
  const s = clamp01((gap - 0.05) / 0.42);
  return clamp01(1 - Math.asin(s) / OPEN);
}

function update(h: RigHandles, p: Pose, s: FighterState | null, info: FrameInfo): void {
  let k = partsOf.get(h);
  if (!k) {
    k = {
      jaw: [h.part('jawAL'), h.part('jawBL'), h.part('jawAR'), h.part('jawBR')],
      screw: h.part('screw'),
      yaw: h.part('yaw'),
      stretch: [h.part('stretchL'), h.part('stretchR')],
      screwA: 0,
      lastT: -1,
      init: false,
      holdW: 0,
      cX: 0,
      cY: 0,
      cS: 0,
      heldPrev: false,
    };
    partsOf.set(h, k);
  }
  const dt = k.init ? Math.max(0, Math.min(0.1, info.t - k.lastT)) : 0;
  k.lastT = info.t;

  const act = s?.action;
  const vc = viewCtx.get(h.root);
  const other = vc?.other ?? null;
  const isThrow = !!s && act === 'attack' && !!s.move && (s.move === 'throwf' || s.move === 'throwb' || s.move === 'throwu');
  const holding = !!s && (act === 'holding' || isThrow) && !!other && other.action === 'held';

  // ---- jaws
  let gL = p[C.gripL];
  let gR = p[C.gripR];
  if (s && act === 'attack' && s.move) {
    const b = bite(s.move, info.f);
    if (b >= 0) gL = gR = b;
    if (s.move === 'recover') {
      // hand over hand: each clamp opens as it reaches up and bites as it hauls down
      const ph = clamp01((info.f - 5) / 20) * Math.PI * 4;
      const w = clamp01((info.f - 4) / 2) * (1 - clamp01((info.f - 25) / 6));
      gR = gR * (1 - w) + w * (Math.sin(ph) > 0 ? 1 : 0.1);
      gL = gL * (1 - w) + w * (Math.sin(ph) > 0 ? 0.1 : 1);
    }
  } else if (s && (act === 'shield' || act === 'ledgehang')) {
    gL = Math.max(gL, act === 'shield' ? 0.5 : 1);
    gR = Math.max(gR, act === 'shield' ? 0.5 : 1);
  }

  // ---- the arms on the held robot: the near clamp bites its head, the far one its flank
  const want = holding ? 1 : 0;
  k.holdW += (want - k.holdW) * (dt > 0 ? Math.min(1, dt * 30) : 1);
  if (!holding && isThrow) k.holdW = Math.max(0, k.holdW - 0.5);
  let nearIsR = true;
  if (s && other && vc && k.holdW > 0.01) {
    const F = s.facing;
    const hv = vc.ctx.fighterDefs[other.fighter]?.height ?? 1.9;
    const mv = act === 'attack' ? s.move : s.move === 'special' ? 'special' : null;
    carry(mv, s.actionFrame, DEF!, _c);
    const rx = h.root.position.x;
    const ry = h.root.position.y;
    const X = rx + F * _c.x;
    const Yc = ry + _c.y;
    // which arm is nearer the camera
    h.joint('armR').getWorldPosition(_sh);
    h.joint('armL').getWorldPosition(_sh2);
    nearIsR = _sh.z >= _sh2.z;
    const w = k.holdW;
    // let go: the clamps spring open the instant the throw releases
    const md = s.move && act === 'attack' ? DEF!.moves[s.move] : null;
    const rel = md ? md.hitboxes[0]?.from ?? md.startup + 1 : 99;
    const open = act === 'attack' && info.f >= rel - 0.5 ? 1 : 0;
    // the head: jaws above the crown and under the chin; a squeeze pulse while held
    const squeeze = act === 'holding' ? 0.03 * (Math.sin(info.f * 0.24) * 0.5 + 0.5) : 0;
    const head = victimPoint(F, X, Yc, hv, _c.spin, 0.07 * hv, 0.86 * hv);
    let hx = head.x - F * 0.04;
    let hy = head.y;
    let hz = 0.24;
    const flank = victimPoint(F, X, Yc, hv, _c.spin, -0.02 * hv, 0.6 * hv);
    let fx = flank.x;
    let fy = flank.y;
    // where the held robot's head and chest really are: read them off its view, then carry them to
    // this frame (side 1 is posed after side 0, so from side 0 its view is one frame old)
    const vview = vc.ctx.fighters[h.side === 0 ? 1 : 0];
    if (vview && k.heldPrev) {
      const stale = h.side === 0;
      const bx = stale ? k.cX : X;
      const by = stale ? k.cY : Yc;
      const bs = stale ? k.cS : _c.spin;
      const da = -F * (_c.spin - bs) * DEG;
      const ca = Math.cos(da);
      const sa = Math.sin(da);
      vview.point('head', _hp);
      let dx = _hp.x - bx;
      let dy = _hp.y + 0.05 - by;
      hx = X + dx * ca - dy * sa;
      hy = Yc + dx * sa + dy * ca;
      hz = _hp.z + 0.06;
      vview.point('chest', _hp);
      dx = _hp.x - bx;
      dy = _hp.y - by;
      fx = X + dx * ca - dy * sa;
      fy = Yc + dx * sa + dy * ca;
    }
    k.cX = X;
    k.cY = Yc;
    k.cS = _c.spin;
    k.heldPrev = holding;
    for (let i = 0; i < 2; i++) {
      const right = i === 1;
      const near = right === nearIsR;
      const tx = near ? hx : fx;
      const ty = near ? hy : fy;
      const tz = near ? hz : -0.5;
      // the clamp comes in level (a little downhill) so its jaws close above and below what it
      // bites: the wrist goes a hand's length short of the target, then the hand is aimed along _d
      const da = (near ? -12 : -30) * DEG;
      _d.set(F * Math.cos(da), Math.sin(da), 0);
      _tgt.set(tx - _d.x * BODY.handReach, ty - _d.y * BODY.handReach, tz);
      // elbows out and down, behind the line of the arm
      h.joint(right ? 'armR' : 'armL').getWorldPosition(_pole);
      _pole.x -= F * 0.5;
      _pole.y -= 0.7;
      _pole.z += near ? 0.9 : -0.9;
      const arm = h.joint(right ? 'armR' : 'armL');
      const fore = h.joint(right ? 'foreR' : 'foreL');
      const ext = solveTwoBone(arm, fore, BODY.upperArm, BODY.forearm, _tgt, _pole, w, BODY.armStretch);
      k.stretch[i].scale.y = Math.max(1e-3, ext * w);
      const hand = h.joint(right ? 'handR' : 'handL');
      hand.position.y = -BODY.forearm - ext * w;
      fore.updateWorldMatrix(true, false);
      fore.getWorldQuaternion(_qp);
      _qd.setFromUnitVectors(_down, _d);
      _qp.invert().multiply(_qd);
      hand.quaternion.slerp(_qp, w);
      const g = near ? gripFor(0.2 * hv - squeeze) : gripFor(0.26 - squeeze);
      const gg = g + (0 - g) * open;
      if (right) gR = gR + (gg - gR) * w;
      else gL = gL + (gg - gL) * w;
    }
    h.root.updateMatrixWorld(true);
  }
  if (!holding) k.heldPrev = false;

  gL = clamp01(gL);
  gR = clamp01(gR);
  k.jaw[0].rotation.z = (1 - gL) * OPEN;
  k.jaw[1].rotation.z = -(1 - gL) * OPEN;
  k.jaw[2].rotation.z = (1 - gR) * OPEN;
  k.jaw[3].rotation.z = -(1 - gR) * OPEN;

  // ---- lead screw: follows the clamps (one and a half turns from wide open to shut), plus pose turns
  const target = ((gL + gR) * 0.5 * 1.5 + p[C.aux + SCREW]) * Math.PI * 2;
  if (!k.init || dt === 0) k.screwA = target;
  else {
    const maxStep = 34 * dt;
    const d = target - k.screwA;
    k.screwA += d > maxStep ? maxStep : d < -maxStep ? -maxStep : d;
  }
  k.screw.rotation.z = k.screwA;
  k.init = true;

  // ---- lamps: hydraulic pressure, up with the pose, smash charge and grips
  let heat = Math.max(0, p[C.glow]);
  if (info.charge > 0) heat = Math.max(heat, 0.6 + info.charge * 0.9);
  if (act === 'holding') heat = Math.max(heat, 0.7);
  const hot = clamp01((heat - 0.5) / 0.9);
  _col.copy(LAMP_COLD).lerp(LAMP_HOT, hot);
  h.mats.glow.emissive.copy(_col);
  h.mats.glow.emissiveIntensity = (0.6 + heat * 2.2) * (0.94 + 0.06 * Math.sin(info.t * 21));

  // ---- the clamps turn their jaws across the screen, so the open C (or the bite) always reads
  faceJaws(h.joint('handL'));
  faceJaws(h.joint('handR'));

  if (!s) return;
  const facing = s.facing;

  // ---- Crusher Spin: the whole body turns twice under the robot held overhead
  if (act === 'attack' && s.move === 'throwb') {
    k.yaw.rotation.y += -facing * spinAngle(info.f);
    h.root.updateMatrixWorld(true);
  }

  // ---- Clamp Climb: hand over hand while rising
  if (act === 'attack' && s.move === 'recover' && info.f > 4 && info.f < 30) {
    const ph = clamp01((info.f - 5) / 20) * Math.PI * 4;
    const w = clamp01((info.f - 4) / 2) * (1 - clamp01((info.f - 25) / 5));
    const sw = Math.sin(ph) * 34 * DEG * w;
    h.joint('armR').rotation.z += sw;
    h.joint('armL').rotation.z -= sw;
    h.joint('foreR').rotation.z += Math.max(0, -Math.sin(ph)) * 40 * DEG * w;
    h.joint('foreL').rotation.z += Math.max(0, Math.sin(ph)) * 40 * DEG * w;
  }
}

// ------------------------------------------------------------------------------------------------

let DEF: FighterDef | null = null;

/** Vise's legs are short (0.66 m hip to sole): authored drops and foot spreads are taken down so a
 *  crouch stays a crouch and never folds the robot onto the deck */
function tame(all: Iterable<Pose>): void {
  const seen = new Set<Pose>();
  for (const p of all) {
    if (seen.has(p)) continue;
    seen.add(p);
    p[C.y] *= 0.62;
    p[C.fLx] *= 0.72;
    p[C.fRx] *= 0.72;
    // the yoke is so heavy that a forward hunch reads as falling on its face: keep it upright
    if (p[C.curve] > 0) p[C.curve] *= 0.5;
    if (p[C.lean] > 0) p[C.lean] *= 0.6;
    if (p[J.chest * 3] > 0) p[J.chest * 3] *= 0.7;
  }
}
function* posesOf(moves: Partial<Record<MoveId, MoveAnim>>, extra: Key[][]): Generator<Pose> {
  for (const k of Object.keys(P) as (keyof PoseSet)[]) {
    const p = P[k];
    if (p) yield p;
  }
  for (const id of Object.keys(moves) as MoveId[]) for (const k of moves[id]!.keys) if (k.pose !== 'base') yield k.pose;
  for (const list of extra) for (const k of list) if (k.pose !== 'base') yield k.pose;
}

function spec(def: FighterDef): RobotSpec {
  DEF = def;
  const moves = viseMoves(def);
  SPECIAL_HOLD = specialHoldKeys();
  tame(posesOf(moves, [SPECIAL_HOLD, SLAM_RISE]));
  return {
    id: 'vise',
    body: BODY,
    palette: {
      paint: '#1f7a4d',
      paint2: '#2a3030',
      trim: '#d4a445',
      dark: '#16191b',
      glow: '#ffb21f',
      eye: '#c6ffe4',
      // a near-white rim, so the deep green keeps its hue instead of going teal under a blue one
      rim: '#dfeaff',
      alt: { paint: '#b4532a', paint2: '#2e2a28' },
    },
    gait: {
      walkCycle: 1.0, walkDuty: 0.66, walkLift: 0.08, walkBob: 0.024, walkSwing: 10, walkLean: 5,
      runCycle: 2.2, runDuty: 0.36, runLift: 0.22, runBob: 0.065, runSwing: 28, runLean: 14,
      breathRate: 0.6, breathDepth: 1.3,
      turnFrames: 5,
    },
    threeQuarter: 44,
    build,
    poses: P,
    moves,
    actions: {
      idle: (a, o) => {
        copyPose(o, a.P.stance);
        stalk(o, a.t, 1);
      },
      holding: holdingAnim(moves),
      land: (a, o) => {
        const f = a.f;
        if (CUR?.slamLand) {
          // straightening up out of the Lunge Clamp slam, clamps pulled back off the robot
          evalKeys(SLAM_RISE, f, a.P.stance, o);
          return;
        }
        const k = 1 - ease.inOutSine(clamp01((f - 1) / 9));
        mixInto(o, a.P.stance, a.P.crouch, Math.max(k * 0.85, f > 9 ? 0.3 : 0));
        o[C.squash] += 0.1 * Math.max(0, 1 - (f - 1) / 4);
      },
    },
    show: {
      select: (t, o) => {
        copyPose(o, P.select!);
        stalk(o, t, 0.6);
      },
      wait: (t, o, PS) => {
        copyPose(o, PS.stance);
        stalk(o, t, 1);
      },
      versus: (t, o, PS) => {
        mixInto(o, PS.stance, PS.versus, ease.outBack(clamp01(t / 0.45)));
        stalk(o, t, 0.3);
        // one hard bite of the raised clamp as it lands, then open again
        const b = clack(t, 99, -0.42);
        o[C.gripR] = Math.max(o[C.gripR], b);
        o[C.aux + SCREW] += b * 0.5;
      },
      win: (t, o, PS) => {
        mixInto(o, PS.stance, PS.win, ease.outBack(clamp01(t / 0.5)));
        o[C.y] += Math.abs(Math.sin(t * 3.4)) * 0.035;
        o[J.chest * 3 + 1] += Math.sin(t * 1.7) * 6 * DEG;
        o[C.aux + SCREW] += t * 0.6;
      },
      lose: (t, o, PS) => {
        mixInto(o, PS.stance, PS.lose, ease.inOutSine(clamp01(t / 0.8)));
        o[J.chest * 3 + 2] += Math.sin(t * 0.9) * 2 * DEG;
      },
    },
    carry,
    update,
  };
}

let cached: RobotSpec | null = null;
export const createFighter: CreateFighterView = (ctx, opts) => {
  if (!cached) cached = spec(ctx.fighterDefs.vise);
  const view = createRobot(ctx, opts, cached);
  // remember the opponent the view was posed against, for the hold (update() only gets our state)
  const vc: ViewCtx = { ctx, other: null, prevAction: '', prevMove: null, slamLand: false };
  viewCtx.set(view.root, vc);
  const pose0 = view.pose;
  view.pose = (s, prev, alpha, other, dt, side) => {
    vc.other = other;
    if (s.action !== 'land') vc.slamLand = false;
    else if (vc.prevAction === 'holding' && vc.prevMove === 'special') vc.slamLand = true;
    vc.prevAction = s.action;
    vc.prevMove = s.move;
    CUR = vc;
    pose0.call(view, s, prev, alpha, other, dt, side);
    CUR = null;
  };
  return view;
};

