// Kiln: the heavy hitter. A squat block: a furnace for a chest with one glowing mouth that runs
// hotter while it charges and while it is armoured, piston forearms that telescope more than a
// metre into every punch, big charcoal fists and boots, a head a quarter of its height with one dark
// visor and two bright eyes.
//
// This file is the model for every fighter: proportions, palette, parts (build), key poses, the 18
// moves, the carry for throws, and update() for its own moving extras. The rig (../rig.ts) does
// the rest: skeleton, IK, blending, locomotion, the line of action on strikes, recoveries,
// secondary motion, hit pause, shadow, marker.

import * as THREE from 'three';
import type { CreateFighterView } from '../api.ts';
import type { FighterDef, FighterState, MoveDef, MoveId } from '../../sim/types.ts';
import { C, createRobot, G, pose, robotMaterial, strike, type CarryFn, type FrameInfo, type Kit, type MoveAnim, type Pose, type PoseSet, type RobotSpec, type RigHandles } from '../rig.ts';
import { PALETTE } from '../style.ts';

// ------------------------------------------------------------------------------------------------
// Body
// ------------------------------------------------------------------------------------------------

// Size hierarchy (round 3): one big shape (the furnace), one medium-large (the head, a quarter of
// the height, clear above the shoulders), medium fists and boots, small limbs and joints.
const BODY = {
  ankle: 0.16,
  shin: 0.3,
  thigh: 0.27,
  hipWidth: 0.42,
  chestY: 0.08,
  // the head sits forward of and above the shoulders, never between them
  neckY: 0.66,
  neckX: 0.14,
  shoulderX: -0.02,
  shoulderY: 0.48,
  shoulderZ: 0.5,
  upperArm: 0.32,
  forearm: 0.32,
  handReach: 0.19,
  stanceWidth: 0.62,
  // the signature: piston forearms that shoot out more than a metre on every punch
  armStretch: 1.2,
  centerY: 1.0,
};

// aux channels
const DOOR = 0; // furnace door 0 shut .. 1 wide open
const FLAME = 1; // the Blast Furnace cone 0..1
const JETS = 2; // boot jets for Thermal Rise 0..1
const STEAM = 3; // elbow steam on the piston punch 0..1

// ------------------------------------------------------------------------------------------------
// Parts
// ------------------------------------------------------------------------------------------------

/** hot end of the flame shader at the base of a cone instead of its tip */
function flipV(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  return g;
}

function build(k: Kit): void {
  const m = k.mats;
  // Every bone gets one mesh per material: the details are merged, so they cost nothing to draw.
  // About 42 draw calls with everything showing (jets and flame are hidden until used).

  // ---- pelvis: an iron block, a brass buckle
  k.mesh('hips', 'hips-iron', () => G.merge([
    G.box(0.4, 0.24, 0.5, 0.07, [0, 0, 0]),
    G.cyl(0.085, 0.085, 0.56, 12, [0, -0.03, 0], [90, 0, 0]),
  ]), m.paint2);
  k.mesh('hips', 'hips-trim', () => G.merge([
    G.box(0.08, 0.15, 0.3, 0.03, [0.2, -0.01, 0]),
  ]), m.trim);

  // ---- the furnace: the one big shape. A deep rounded body, an iron belly band, a yoke
  k.mesh('chest', 'chest-paint', () => G.merge([
    G.box(0.76, 0.64, 0.9, 0.2, [0, 0.38, 0]),
  ]), m.paint);
  k.mesh('chest', 'chest-iron', () => G.merge([
    G.box(0.72, 0.13, 0.86, 0.06, [0, 0.07, 0]), // belly band
    G.box(0.1, 0.46, 0.6, 0.04, [-0.38, 0.4, 0]), // back plate
  ]), m.paint2);
  k.mesh('chest', 'chest-trim', () => G.merge([
    G.rivets(5, [0.375, 0.07, -0.32], [0.375, 0.07, 0.32], 0.022, 'x'),
    G.rivets(3, [0.2, 0.07, 0.435], [-0.2, 0.07, 0.435], 0.022, 'z'),
    G.rivets(3, [0.2, 0.07, -0.435], [-0.2, 0.07, -0.435], 0.022, 'z'),
  ]), m.trim);
  // door on a hinge at its left edge: a brass frame and three grate bars
  k.group('chest', 'door', [0.39, 0.37, -0.24]);
  k.mesh('door', 'door-trim', () => G.merge([
    G.box(0.05, 0.06, 0.48, 0.015, [0, 0.2, 0.24]), G.box(0.05, 0.06, 0.48, 0.015, [0, -0.2, 0.24]),
    G.box(0.05, 0.46, 0.06, 0.015, [0, 0, 0.0]), G.box(0.05, 0.46, 0.06, 0.015, [0, 0, 0.48]),
    G.cyl(0.03, 0.03, 0.12, 8, [0.0, 0.12, -0.01]), G.cyl(0.03, 0.03, 0.12, 8, [0.0, -0.12, -0.01]),
    G.box(0.05, 0.12, 0.05, 0.015, [0.03, 0, 0.44]), // latch
  ]), m.trim);
  k.mesh('door', 'door-iron', () => G.merge([
    G.box(0.035, 0.045, 0.42, 0.01, [0.01, 0.1, 0.24]), G.box(0.035, 0.045, 0.42, 0.01, [0.01, 0, 0.24]), G.box(0.035, 0.045, 0.42, 0.01, [0.01, -0.1, 0.24]),
  ]), m.dark);
  // the glowing firebox behind the door, vent slits on both flanks, the stack mouths
  k.mesh('chest', 'vents', () => G.merge([
    G.box(0.03, 0.34, 0.42, 0.01, [0.365, 0.37, 0]),
    G.box(0.3, 0.04, 0.02, 0, [-0.04, 0.3, 0.455]), G.box(0.3, 0.04, 0.02, 0, [-0.04, 0.39, 0.455]), G.box(0.3, 0.04, 0.02, 0, [-0.04, 0.48, 0.455]),
    G.box(0.3, 0.04, 0.02, 0, [-0.04, 0.3, -0.455]), G.box(0.3, 0.04, 0.02, 0, [-0.04, 0.39, -0.455]), G.box(0.3, 0.04, 0.02, 0, [-0.04, 0.48, -0.455]),
    // stack mouths (the stacks rake back, so the mouths do too)
    G.cyl(0.1, 0.1, 0.02, 12, [-0.575, 0.905, 0.2], [0, 0, 34]), G.cyl(0.08, 0.08, 0.02, 12, [-0.545, 0.765, -0.22], [0, 0, 38]),
  ]), m.glow);
  // two chimney stacks raked back behind the head (the silhouette breaker), banded
  k.mesh('chest', 'stacks', () => G.merge([
    G.cyl(0.12, 0.135, 0.44, 14, [-0.44, 0.7, 0.2], [0, 0, 34]),
    G.cyl(0.1, 0.115, 0.32, 14, [-0.44, 0.62, -0.22], [0, 0, 38]),
    G.cyl(0.15, 0.15, 0.07, 14, [-0.55, 0.87, 0.2], [0, 0, 34]),
    G.cyl(0.125, 0.125, 0.06, 14, [-0.52, 0.73, -0.22], [0, 0, 38]),
  ]), m.dark);

  // ---- head: a welding mask, a quarter of the robot's height. A rounded livery shell, an iron
  // faceplate, a wide dark visor with two bright arc-cyan eyes (a colour used nowhere else on
  // Kiln), a breather at the chin, hinge bolts at the temples, a side-colour crest on the crown.
  k.mesh('head', 'head-shell', () => G.merge([
    G.box(0.46, 0.46, 0.5, 0.16, [-0.01, 0.27, 0]),
  ]), m.paint);
  k.mesh('head', 'head-face', () => G.merge([
    G.box(0.12, 0.42, 0.5, 0.05, [0.2, 0.25, 0], [0, 0, 4]),
    G.box(0.16, 0.1, 0.36, 0.04, [0.18, 0.05, 0], [0, 0, 20]), // chin
    G.cyl(0.085, 0.1, 0.12, 12, [-0.02, 0.02, 0]), // neck
  ]), m.paint2);
  k.mesh('head', 'head-trim', () => G.merge([
    G.cyl(0.07, 0.07, 0.56, 12, [0.02, 0.28, 0], [90, 0, 0]), // hinge bolts through the temples
    G.box(0.03, 0.02, 0.2, 0.008, [0.265, 0.08, 0]), G.box(0.03, 0.02, 0.2, 0.008, [0.262, 0.12, 0]), // breather
    G.box(0.03, 0.235, 0.47, 0.012, [0.262, 0.3, 0]), // visor frame
  ]), m.trim);
  k.mesh('head', 'head-glass', () => G.box(0.04, 0.19, 0.42, 0.02, [0.272, 0.3, 0]), glassMat(k));
  k.eyes('head', { at: [0.296, 0.3, 0], w: 0.4, h: 0.18, sep: 0.5, size: 1 });
  k.mesh('head', `crest${k.side}`, () => G.merge([
    G.box(0.36, 0.08, 0.09, 0.03, [-0.03, 0.52, 0]),
    G.box(0.12, 0.05, 0.09, 0.02, [0.17, 0.49, 0], [0, 0, -18]),
  ]), m.side);

  for (const sd of ['L', 'R'] as const) {
    const z = sd === 'L' ? -1 : 1;
    // a small shoulder cap that stays below the head, a side-colour plate on its crown and face
    k.mesh(`shoulder${sd}`, `cap-paint${sd}`, () => G.merge([
      G.box(0.34, 0.24, 0.3, 0.1, [0, 0.02, z * 0.54]),
    ]), m.paint);
    k.mesh(`shoulder${sd}`, `cap-side${sd}`, () => G.merge([
      G.box(0.28, 0.05, 0.22, 0.02, [0, 0.15, z * 0.55]),
      G.box(0.05, 0.16, 0.22, 0.02, [0.17, 0.02, z * 0.55]),
    ]), m.side);
    // arm: a ribbed upper arm and elbow, the piston housing, a chrome rod that telescopes
    k.mesh(`arm${sd}`, 'upperarm', () => G.merge([
      G.cyl(0.12, 0.11, 0.32, 12, [0, -0.15, 0]),
      G.sphere(0.13, 12, [0, -0.32, 0]),
      G.cyl(0.135, 0.135, 0.04, 14, [0, -0.08, 0]), G.cyl(0.13, 0.13, 0.04, 14, [0, -0.18, 0]),
    ]), m.dark);
    k.mesh(`fore${sd}`, 'sleeve', () => G.merge([
      G.cyl(0.165, 0.145, 0.32, 14, [0, -0.16, 0]),
      G.box(0.07, 0.22, 0.18, 0.02, [0.16, -0.15, 0]), // steam port
      G.cyl(0.175, 0.175, 0.05, 14, [0, -0.03, 0]),
      G.cyl(0.16, 0.16, 0.05, 14, [0, -0.3, 0]),
    ]), m.paint2);
    k.mesh(`stretch${sd}`, 'rod', () => G.merge([G.cyl(0.07, 0.07, 1, 12, [0, -0.5, 0]), G.cyl(0.1, 0.1, 0.05, 12, [0, -0.04, 0])]), m.trim);
    // tong fist: two big jaws that open for the grab
    k.group(`hand${sd}`, `jawA${sd}`, [0.03, -0.01, 0]);
    k.group(`hand${sd}`, `jawB${sd}`, [-0.03, -0.01, 0]);
    k.mesh(`jawA${sd}`, 'jawA', () => G.merge([G.box(0.17, 0.32, 0.34, 0.06, [0.085, -0.15, 0]), G.box(0.18, 0.05, 0.35, 0.02, [0.088, -0.31, 0])]), m.paint);
    k.mesh(`jawB${sd}`, 'jawB', () => G.merge([G.box(0.17, 0.32, 0.34, 0.06, [-0.085, -0.15, 0]), G.box(0.18, 0.05, 0.35, 0.02, [-0.088, -0.31, 0])]), m.paint);
    // leg: a thick thigh with the knee, an armoured shin with a chrome ram behind, a heavy boot
    k.mesh(`thigh${sd}`, 'thigh', () => G.merge([
      G.cyl(0.14, 0.125, 0.27, 12, [0, -0.13, 0]),
      G.sphere(0.13, 12, [0, -0.27, 0]),
    ]), m.dark);
    k.mesh(`shin${sd}`, 'shin-paint', () => G.merge([
      G.box(0.27, 0.3, 0.26, 0.08, [0.03, -0.15, 0]),
      G.box(0.12, 0.12, 0.2, 0.04, [0.15, 0.0, 0]), // knee guard
    ]), m.paint);
    k.mesh(`foot${sd}`, 'boot-iron', () => G.merge([
      G.box(0.5, 0.17, 0.34, 0.06, [0.06, -0.06, 0]),
      G.box(0.54, 0.05, 0.37, 0.02, [0.07, -0.15, 0]), // sole
      G.box(0.12, 0.1, 0.3, 0.03, [-0.17, -0.02, 0]), // heel block
    ]), m.paint2);
    k.mesh(`foot${sd}`, 'boot-paint', () => G.merge([
      G.box(0.18, 0.15, 0.36, 0.05, [0.26, -0.07, 0]),
    ]), m.paint);
    // boot jets (Thermal Rise)
    k.group(`foot${sd}`, `jet${sd}`, [0.04, -0.17, 0]);
    k.mesh(`jet${sd}`, 'jet', () => flipV(new THREE.ConeGeometry(0.13, 1, 10, 1, true).rotateX(Math.PI).translate(0, -0.5, 0)), flameMat(k));
  }
  // the Blast Furnace cone, out of the door
  k.group('chest', 'flame', [0.4, 0.37, 0]);
  k.mesh('flame', 'cone', () => new THREE.ConeGeometry(0.5, 1, 14, 1, true).rotateZ(Math.PI / 2).translate(0.5, 0, 0), flameMat(k));
}

// the visor: near-black glass with a hard reflection, so the eyes sit in a high-contrast block
const glassMats = new WeakMap<Kit, THREE.Material>();
function glassMat(k: Kit): THREE.Material {
  let m = glassMats.get(k);
  if (!m) {
    m = k.own(robotMaterial(k.uniforms, { color: '#081018', roughness: 0.12, metalness: 0.6, envMapIntensity: 1.2 }, 0.6, 1.4));
    glassMats.set(k, m);
  }
  return m;
}

// fire: white-hot at the mouth, through amber to a ragged red tip that licks back and forth
const flameMats = new WeakMap<Kit, THREE.ShaderMaterial>();
const flameTime = { value: 0 };
function flameMat(k: Kit): THREE.ShaderMaterial {
  let m = flameMats.get(k);
  if (!m) {
    m = k.own(new THREE.ShaderMaterial({
      uniforms: { uT: flameTime },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uT; varying vec2 vUv;
void main() {
  float along = vUv.y;
  float lick = 0.5 + 0.5 * sin(vUv.x * 37.7 + uT * 31.0) * sin(vUv.x * 12.6 - uT * 17.0);
  float edge = smoothstep(0.0, 0.35 + 0.35 * lick, along);
  vec3 c = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.62, 0.18), smoothstep(0.0, 0.5, along));
  c = mix(c, vec3(1.0, 0.95, 0.8), smoothstep(0.6, 1.0, along));
  float a = edge * (0.55 + 0.45 * along);
  gl_FragColor = vec4(c * a, a);
}`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));
    flameMats.set(k, m);
  }
  return m;
}

// ------------------------------------------------------------------------------------------------
// Key poses
// ------------------------------------------------------------------------------------------------

// A low, wide brawler's stance: fists held low and out at the hips so the furnace door and the
// face are the first things you see. The head is turned a little to the camera so the visor reads.
const stance = pose({
  y: -0.08,
  curve: 4,
  hips: [4, 6],
  chest: [3, -6],
  head: [-4, 18],
  shoulders: [0, 0, 4],
  armL: [26, 0, 32], foreL: [56], handL: [-10],
  armR: [8, 0, 40], foreR: [62], handR: [-14],
  grip: 1,
  fL: [0.27, 0], fR: [-0.25, 0],
  glow: 0.35,
});

// in the air the limbs spread: knees apart, fists out to the sides
const air = pose({
  plant: 0,
  curve: 4,
  chest: [4], head: [-6, 16],
  arms: [26, 0, 48], fores: [62],
  thighL: [62, 0, 14], shinL: [-96], thighR: [18, 0, 14], shinR: [-50], feet: [14],
  grip: 1, glow: 0.35,
});

const P: Partial<PoseSet> & { stance: Pose; air: Pose } = {
  stance,
  air,
  crouch: pose({ y: -0.28, squash: 0.13, curve: 14, chest: [8], head: [-10], arms: [-8, 0, 54], fores: [52], lean: 3 }, stance),
  // off the deck: long and thin, toes pointed, fists swept down and back
  rise: pose({ squash: -0.1, curve: -10, chest: [-4], head: [-12], arms: [-36, 0, 30], fores: [30], thighL: [16], shinL: [-26], thighR: [-8], shinR: [-10], feet: [-40] }, air),
  // the top: knees tucked up hard, fists out wide (a ball with spikes)
  apex: pose({ curve: 16, thighL: [96, 0, 20], shinL: [-130], thighR: [62, 0, 20], shinR: [-112], arms: [40, 0, 64], fores: [76], chest: [10] }, air),
  fall: pose({ curve: -6, arms: [24, 0, 84], fores: [36], thighL: [40, 0, 16], shinL: [-66], thighR: [2, 0, 12], shinR: [-24], chest: [0], head: [-4] }, air),
  fastfall: pose({ curve: -12, arms: [10, 0, 104], fores: [16], thighs: [-2, 0, 8], shins: [-4], squash: -0.12, feet: [-34] }, air),
  airjump: pose({ curve: -14, thighL: [92, 0, 10], shinL: [-124], thighR: [-26, 0, 10], shinR: [-18], arms: [-56, 0, 50], fores: [26], squash: -0.1 }, air),
  // the first frames of a run: a hard drive off the back foot
  dash: pose({ lean: 16, curve: 8, chest: [6], head: [-8], armL: [70, 0, 22], foreL: [60], armR: [-64, 0, 28], foreR: [72], y: -0.14, fL: [0.58, 0], fR: [-0.52, 0.14], yaw: -14 }, stance),
  // a committed sprint: chest down the line of travel, strong forward lean, fists pumping
  run: pose({ lean: 21, curve: 10, chest: [5, 0], head: [-6, 10], hips: [2, 0], shoulders: [0, 0, 4], arms: [10, 0, 36], fores: [100], y: -0.12, yaw: -16 }, stance),
  walk: pose({ lean: 5, curve: 4, chest: [3, 0], head: [-6, 14], hips: [3, 0], arms: [16, 0, 30], fores: [72], y: -0.06 }, stance),
  skid: pose({ lean: -14, curve: -8, chest: [-10, 0], head: [10, 0], arms: [56, 0, 62], fores: [24], y: -0.2, fL: [0.62, 0], fR: [0.02, 0], squash: 0.07 }, stance),
  pivot: pose({ y: -0.14, squash: 0.06, curve: 8, chest: [8, 0], arms: [24, 0, 48], fores: [64] }, stance),
  shield: pose({ y: -0.16, curve: 16, chest: [12, -4], head: [10, 10], armL: [76, 0, 4], foreL: [110], armR: [66, 0, 8], foreR: [114], hands: [8], lean: 2, glow: 0.2 }, stance),
  dizzy: pose({ y: -0.16, curve: 26, chest: [20, 0, 12], head: [28, 0, 20], arms: [0, 0, 12], fores: [14], eyes: -0.2, glow: 0.05, grip: 0.5 }, stance),
  rollTuck: pose({ y: -0.4, curve: 40, chest: [40], head: [36], arms: [52, 0, 10], fores: [122], plant: 0, thighs: [105], shins: [-140], squash: 0.04 }, stance),
  spot: pose({ y: -0.14, z: -0.5, yaw: 34, chest: [10, 24], arms: [22, 0, 10], fores: [100] }, stance),
  airdodge: pose({ curve: 34, chest: [24], head: [30], arms: [42, 0, 10], fores: [125], thighs: [82], shins: [-122] }, air),
  hold: pose({ chest: [8, 0], lean: -6, curve: -6, arms: [72, 0, 4], fores: [18], grip: 1, y: -0.08, fL: [0.3, 0], fR: [-0.3, 0] }, stance),
  held: pose({ curve: -14, chest: [-10], head: [18], arms: [34, 0, 50], fores: [44], thighL: [22], shinL: [-42], thighR: [-8], shinR: [-22], grip: 0.4 }, air),
  flinch: pose({ curve: -14, chest: [-10, 6], head: [-12, 20], lean: -9, arms: [48, 0, 64], fores: [26], y: -0.05, eyes: 0.7, glow: 0.7, grip: 0.4 }, stance),
  // the blow lands: one clean C, head snapped back, arms flung up and out, a knee up
  hurt: pose({ curve: -24, chest: [-8, 0], head: [-10, 24], hips: [0, 0], lean: -12, y: -0.04, armL: [132, 0, 46], armR: [112, 0, 58], fores: [18], hands: [0], thighL: [34], shinL: [-60], thighR: [-6], shinR: [-12], plant: 0.5, eyes: 1, glow: 1, grip: 0.2, stretch: 0.08, lineAng: -60 }, stance),
  tumble: pose({ curve: -22, chest: [-14], head: [-12, 20], arms: [80, 0, 94], fores: [20], thighL: [60, 0, 20], shinL: [-90], thighR: [-30, 0, 20], shinR: [-20], eyes: 0.5, grip: 0.3 }, air),
  // knocked flat on its face (the stacks stay up), then a push-up off the deck
  lying: pose({ plant: 0, spin: 90, y: -0.52, x: 0.1, chest: [-6], head: [-30], arms: [150, 0, 34], fores: [30], thighs: [-6], shins: [-14], feet: [-30], glow: 0.1, grip: 0.5 }, air),
  getup: pose({ plant: 0, spin: 42, y: -0.32, x: 0.05, chest: [16], head: [-24], arms: [64, 0, 26], fores: [-10], thighs: [70], shins: [-110], feet: [0], grip: 1 }, air),
  hang: pose({ arms: [168, 0, 10], fores: [6], curve: -10, head: [-26], thighs: [10], shins: [-16], grip: 1 }, air),
  helpless: pose({ arms: [156, 0, 32], fores: [22], curve: -12, head: [-14], thighL: [30, 0, 12], shinL: [-60], thighR: [-6, 0, 10], shinR: [-20], glow: 0.05, grip: 0.5 }, air),
  respawn: pose({ chest: [-6, 0], head: [-10, 10], arms: [38, 0, -6], fores: [104, 0, -42], hands: [0] }, stance),
  entrance: pose({ y: -0.32, curve: 40, chest: [20, 0], head: [36, 0], arms: [0, 0, 32], fores: [30], eyes: -1, glow: 0 }, stance),
  win: pose({ y: 0, arms: [166, 0, 30], fores: [24], curve: -20, head: [-26, 14], grip: 1, glow: 1, eyes: 1, fL: [0.3, 0], fR: [-0.3, 0] }, stance),
  lose: pose({ curve: 40, chest: [20, 0], head: [38, 0], arms: [0, 0, 8], fores: [10], y: -0.14, glow: 0, grip: 0.4 }, stance),
  versus: pose({ y: -0.18, curve: 12, chest: [10, 0], head: [-14, 16], shoulders: [0, 0, 10], arms: [52, 0, -4], fores: [64, 0, -34], hands: [0, 0, 0], grip: 1, glow: 1, eyes: 1, yaw: 22, lean: 4, fL: [0.34, 0], fR: [-0.34, 0] }, stance),
};

// ------------------------------------------------------------------------------------------------
// Moves (bespoke, from the `look` notes in the sim's MoveDefs). The rig adds the line of action on
// top (stretch toward the hit, lunge, counter-rotation) and drives the striking fist to the far side
// of the hitbox, telescoping the piston as far as it takes.
// ------------------------------------------------------------------------------------------------

function kilnMoves(def: FighterDef): Partial<Record<MoveId, MoveAnim>> {
  const M = def.moves;
  const st = stance;
  const ar = air;
  const out: Partial<Record<MoveId, MoveAnim>> = {};
  const S = (id: MoveId) => M[id] as MoveDef;

  // Slag Tap: short straight right; the elbow pumps back, the piston fires
  out.jab = strike(S('jab'), {
    wind: pose({ chest: [4, 10], counter: 10, lean: -4, x: -0.04, armR: [-30, 0, 18], foreR: [130], squash: 0.04 }, st),
    strike: pose({ chest: [2, -8], curve: 0, sway: 0.03, lean: 3, x: 0.04, armR: [84, 0, 4], foreR: [4], fL: [0.36, 0], fR: [-0.28, 0], aux: { [STEAM]: 1 } }, st),
    follow: pose({ chest: [4, -9], curve: 2, sway: 0.04, lean: 4, x: 0.05, armR: [80, 0, 6], foreR: [10], fL: [0.36, 0], fR: [-0.28, 0] }, st),
    recover: pose({ chest: [8, -2], curve: 8, lean: 4, x: 0.06, y: -0.13, armR: [26, 0, 30], foreR: [100], fL: [0.32, 0], fR: [-0.26, 0] }, st),
    limb: 'handR',
  });

  // Bellows Shove: a low, wide horse stance, both palms driven out level with the belly like a
  // bellows closing; the body sits DOWN behind the shove (a low wedge, unlike the upright jab)
  const tl = M.tilt.hitboxes[0];
  out.tilt = strike(S('tilt'), {
    wind: pose({ y: -0.2, curve: -10, lean: -8, x: -0.08, shoulders: [0, 0, 18], arms: [-30, 0, 40], fores: [132], glow: 0.6, squash: 0.08, fL: [0.42, 0], fR: [-0.4, 0] }, st),
    strike: pose({ y: -0.22, curve: 2, sway: 0.04, lean: -2, x: 0.1, shoulders: [0, 0, -8], arms: [70, 0, 14], fores: [4], glow: 0.9, fL: [0.6, 0], fR: [-0.5, 0], squash: 0.05 }, st),
    follow: pose({ y: -0.23, curve: 4, sway: 0.05, lean: -1, x: 0.11, arms: [66, 0, 16], fores: [10], fL: [0.6, 0], fR: [-0.5, 0], squash: 0.05 }, st),
    recover: pose({ y: -0.2, curve: 6, lean: 1, x: 0.09, arms: [24, 0, 40], fores: [96], fL: [0.56, 0], fR: [-0.46, 0], glow: 0.5 }, st),
    limb: 'hands',
    path: [[0, tl.x, tl.y - 0.28], [S('tilt').active, tl.x + 0.05, tl.y - 0.32]],
    // a shove, not a punch: the pistons only half out, the body does the work
    reachOut: 0.15,
  });

  const ut = M.uptilt.hitboxes[0];
  // Chimney Hook: uppercut from the hip to above the head, the grate flares on contact
  out.uptilt = strike(S('uptilt'), {
    wind: pose({ y: -0.24, curve: 18, chest: [16, 14], counter: 10, lean: 6, armR: [-40, 0, 22], foreR: [76], glow: 0.5, squash: 0.07 }, st),
    strike: pose({ y: 0.06, curve: -20, chest: [-12, -10], head: [-32], lean: -6, armR: [172, 0, 6], foreR: [6], armL: [-30, 0, 34], foreL: [40], squash: -0.08, glow: 1.1, aux: { [DOOR]: 0.35 } }, st),
    follow: pose({ curve: -24, chest: [-14, -14], head: [-26], armR: [188, 0, 10], foreR: [14], armL: [-30, 0, 34], glow: 0.7 }, st),
    recover: pose({ y: -0.14, curve: 4, chest: [4, -6], head: [-14], armR: [90, 0, 30], foreR: [80], glow: 0.5 }, st),
    limb: 'handR',
    path: [[-1, ut.x + 0.4, ut.y - 1.1], [0, ut.x + 0.1, ut.y - 0.2], [1, ut.x, ut.y], [S('uptilt').active, ut.x - 0.03, ut.y + 0.05]],
  });

  // Ingot Charge: head down, the furnace chest rams forward shoulder first, arms swept back
  // (a flat wedge with nothing reaching out: the body is the weapon)
  out.dash = strike(S('dash'), {
    wind: pose({ y: -0.2, curve: 10, lean: 4, chest: [8, 10], head: [10], arms: [-50, 0, 30], fores: [60], fL: [0.12, 0], fR: [-0.42, 0], squash: 0.07 }, st),
    strike: pose({ y: -0.18, curve: 6, sway: 0.05, lean: 9, x: 0.16, chest: [3, -14], head: [6], arms: [-70, 0, 34], fores: [24], glow: 1, fL: [0.56, 0], fR: [-0.66, 0.1] }, st),
    follow: pose({ y: -0.18, curve: 7, sway: 0.05, lean: 9, x: 0.17, chest: [4, -14], head: [6], arms: [-66, 0, 36], fores: [30], fL: [0.56, 0], fR: [-0.66, 0.1] }, st),
    recover: pose({ y: -0.18, curve: 8, lean: 5, x: 0.12, chest: [6, -4], head: [4], arms: [-6, 0, 44], fores: [72], fL: [0.5, 0], fR: [-0.56, 0] }, st),
    limb: 'body',
  });

  // Furnace Hammer: both fists raised high over the head, the body arched back on its toes, then
  // hammered down-forward in an arc, the body folding over the blow and the pistons fully out:
  // the strike is a diagonal from the stacks to the deck in front, not a level punch
  const sm = M.smash.hitboxes[0];
  out.smash = strike(S('smash'), {
    windEarly: pose({ y: -0.04, curve: -10, counter: -6, chest: [-6, -8], lean: -4, x: -0.04, head: [-4, 12], arms: [150, 0, 16], fores: [60], glow: 0.7, fL: [0.36, 0], fR: [-0.38, 0] }, st),
    wind: pose({ y: 0.02, curve: -20, counter: -10, chest: [-10, -10], hips: [-4, -6], head: [-6, 14], lean: -8, x: -0.1, arms: [176, 0, 12], fores: [56], glow: 1, squash: -0.06, fL: [0.4, 0], fR: [-0.48, 0.04] }, st),
    strike: pose({ y: -0.13, curve: 6, sway: 0.05, counter: 6, chest: [2, 4], hips: [0, 4], lean: 2, x: 0.18, head: [-8, 8], arms: [64, 0, 6], fores: [4], glow: 1.3, fL: [0.6, 0], fR: [-0.5, 0], squash: 0.06 }, st),
    strikeEnd: pose({ y: -0.14, curve: 7, sway: 0.055, counter: 6, chest: [3, 4], hips: [0, 4], lean: 3, x: 0.2, head: [-8, 8], arms: [58, 0, 6], fores: [6], glow: 1.2, fL: [0.6, 0], fR: [-0.5, 0], squash: 0.07 }, st),
    follow: pose({ y: -0.16, curve: 10, sway: 0.06, counter: 8, chest: [4, 3], hips: [0, 2], lean: 4, x: 0.22, head: [-6, 8], arms: [44, 0, 8], fores: [14], glow: 0.9, fL: [0.6, 0], fR: [-0.5, 0], squash: 0.08 }, st),
    // the recovery: hauls the pistons back in and straightens up, shoulders heaving
    recover: pose({ y: -0.18, curve: 6, chest: [2, 0], lean: 0, x: 0.16, head: [-6, 12], shoulders: [0, 0, 14], arms: [30, 0, 44], fores: [92], glow: 0.6, fL: [0.56, 0], fR: [-0.5, 0] }, st),
    limb: 'hands',
    path: [[-2, sm.x - 1.0, sm.y + 1.5], [-1, sm.x - 0.3, sm.y + 0.9], [0, sm.x, sm.y - 0.25], [S('smash').active, sm.x + 0.08, sm.y - 0.42]],
  });

  // Crucible Lift: crouch, heave both arms straight up, heat bursts from the shoulders
  out.upsmash = strike(S('upsmash'), {
    wind: pose({ y: -0.34, squash: 0.1, curve: 30, chest: [22, 0], head: [22], arms: [-14, 0, 34], fores: [44], grip: 0.6, glow: 0.8 }, st),
    strike: pose({ y: 0.1, squash: -0.12, curve: -22, chest: [-8, 0], head: [-34], arms: [174, 0, 8], fores: [4], glow: 1.3, eyes: 1, aux: { [DOOR]: 0.5 } }, st),
    follow: pose({ y: 0.08, curve: -26, chest: [-10, 0], head: [-30], arms: [184, 0, 14], fores: [8], glow: 1 }, st),
    recover: pose({ y: -0.16, curve: 4, head: [-14], arms: [112, 0, 34], fores: [52], glow: 0.6 }, st),
    limb: 'hands',
  });

  // Ember Spin: tuck, then one turn on the spot spread wide, fists and boots out
  out.nair = strike(S('nair'), {
    wind: pose({ curve: 24, chest: [16], arms: [30, 0, 20], fores: [110], thighs: [84, 0, 6], shins: [-124], squash: 0.06 }, ar),
    strike: pose({ curve: -6, chest: [0], arms: [90, 0, 88], fores: [4], thighL: [50, 0, 34], shinL: [-30], thighR: [-26, 0, 34], shinR: [-20], glow: 0.9 }, ar),
    follow: pose({ curve: -2, chest: [4], arms: [70, 0, 76], fores: [20], thighL: [46, 0, 28], shinL: [-40], thighR: [-16, 0, 26], shinR: [-30] }, ar),
    limb: 'none',
    spinTurns: 1,
  });

  const fa0 = M.fair.hitboxes[0];
  const fa1 = M.fair.hitboxes[M.fair.hitboxes.length - 1];
  // Ladle Swing: one fist high behind the head, brought down in front like pouring a ladle
  out.fair = strike(S('fair'), {
    wind: pose({ curve: -22, chest: [-18, 10], lean: -12, armR: [184, 0, 10], foreR: [24], armL: [0, 0, 56], foreL: [56], thighL: [24, 0, 10], shinL: [-40], thighR: [10, 0, 10], shinR: [-30] }, ar),
    strike: pose({ curve: 28, chest: [24, -6], lean: 18, armR: [54, 0, 0], foreR: [4], armL: [-46, 0, 52], foreL: [26], thighL: [74, 0, 10], shinL: [-96], thighR: [-26, 0, 10], shinR: [-24] }, ar),
    follow: pose({ curve: 32, chest: [28, -7], lean: 20, armR: [16, 0, 4], foreR: [10], armL: [-46, 0, 52], thighL: [70], shinL: [-90], thighR: [-24], shinR: [-26] }, ar),
    limb: 'handR',
    path: [[-1, fa1.x - 0.55, fa1.y + 0.75], [0, fa1.x, fa1.y], [S('fair').active - 1, fa0.x, fa0.y]],
  });

  // Flue Kick: both legs mule-kick straight back, body thrown flat forward, fists reaching ahead
  out.bair = strike(S('bair'), {
    wind: pose({ curve: 24, chest: [12], thighs: [90, 0, 6], shins: [-134], arms: [40, 0, 30], fores: [82], squash: 0.05 }, ar),
    strike: pose({ curve: 30, chest: [40], head: [-40], lean: 16, thighs: [-74, 0, 8], shins: [-2], feet: [-44], arms: [96, 0, 30], fores: [8], glow: 0.8 }, ar),
    follow: pose({ curve: 28, chest: [36], head: [-32], lean: 14, thighs: [-64, 0, 8], shins: [-8], arms: [90, 0, 34], fores: [16] }, ar),
    limb: 'feet',
  });

  const ua = M.uair.hitboxes[0];
  // Flue Swat: an overhead backhand in a half circle, body arched under it
  out.uair = strike(S('uair'), {
    wind: pose({ curve: 14, chest: [10, 13], armR: [30, 0, -8], foreR: [92], thighs: [44], shins: [-74] }, ar),
    strike: pose({ curve: -26, chest: [-12, -12], head: [-36], armR: [178, 0, 26], foreR: [6], armL: [30, 0, 66], foreL: [30], thighL: [50, 0, 12], shinL: [-80], thighR: [-14, 0, 12], shinR: [-18] }, ar),
    follow: pose({ curve: -28, chest: [-16, -15], head: [-30], armR: [206, 0, 20], foreR: [16], armL: [30, 0, 66], thighL: [48], shinL: [-76], thighR: [-12], shinR: [-20] }, ar),
    limb: 'handR',
    path: [[-1, ua.x + 0.75, ua.y - 0.45], [0, ua.x + 0.15, ua.y + 0.1], [S('uair').active, ua.x - 0.55, ua.y - 0.1]],
  });

  // Pour Stomp: knees drawn up, then both feet stamp straight down, arms flung up, glowing soles
  out.dair = strike(S('dair'), {
    wind: pose({ curve: 26, thighs: [104, 0, 8], shins: [-142], chest: [8], arms: [60, 0, 60], fores: [62], squash: 0.07 }, ar),
    strike: pose({ curve: -12, thighs: [-6, 0, 6], shins: [0], feet: [-14], chest: [2], arms: [120, 0, 74], fores: [8], squash: -0.12, glow: 0.9, aux: { [JETS]: 0.6 } }, ar),
    follow: pose({ curve: -10, thighs: [4, 0, 6], shins: [-10], arms: [124, 0, 76], fores: [14], aux: { [JETS]: 0.2 } }, ar),
    limb: 'feet',
  });

  // Tong Grip: the fists open into tongs and lunge out to snap shut
  out.grab = strike(S('grab'), {
    wind: pose({ curve: -6, chest: [-6, 4], lean: -4, arms: [30, 0, 46], fores: [78], grip: 0, y: -0.08 }, st),
    strike: pose({ curve: 4, sway: 0.04, chest: [4, 0], lean: 4, x: 0.08, arms: [84, 0, 12], fores: [4], grip: 0.15, fL: [0.5, 0], fR: [-0.4, 0] }, st),
    follow: pose({ curve: 4, chest: [4, 0], lean: 4, x: 0.08, arms: [76, 0, 10], fores: [16], grip: 1, fL: [0.5, 0], fR: [-0.4, 0] }, st),
    recover: pose({ curve: 6, chest: [6, 0], lean: 2, x: 0.08, y: -0.14, arms: [36, 0, 40], fores: [80], grip: 1, fL: [0.42, 0], fR: [-0.36, 0] }, st),
    limb: 'hands',
    grip: 0.15,
  });

  // Kiln Toss: lift to the chest, then shot-put forward with a piston punch
  const hold = P.hold!;
  out.throwf = strike(S('throwf'), {
    wind: pose({ curve: -14, chest: [-8, 13], counter: 12, lean: -8, y: -0.14, glow: 0.6 }, hold),
    strike: pose({ curve: 6, sway: 0.05, counter: -14, chest: [6, -15], lean: 8, x: 0.1, armR: [86, 0, 0], foreR: [0], armL: [-30, 0, 34], foreL: [60], grip: 0, glow: 0.8, aux: { [STEAM]: 1 }, fL: [0.5, 0], fR: [-0.42, 0] }, hold),
    follow: pose({ curve: 8, sway: 0.05, chest: [6, -13], lean: 8, x: 0.1, armR: [78, 0, 4], foreR: [12], armL: [-30, 0, 34], grip: 0.6, fL: [0.5, 0], fR: [-0.42, 0] }, hold),
    limb: 'none',
  });

  // Backfire Heave: turns at the waist and hurls them behind, the furnace door blows open
  out.throwb = strike(S('throwb'), {
    wind: pose({ curve: 14, chest: [8, 40], hips: [0, 20], lean: 4, y: -0.14, glow: 0.6 }, hold),
    strike: pose({ curve: -26, chest: [-12, -78], hips: [0, -40], lean: -14, arms: [150, 0, 44], fores: [6], grip: 0, glow: 1.3, aux: { [DOOR]: 1 }, fL: [0.4, 0], fR: [-0.5, 0] }, hold),
    follow: pose({ curve: -18, chest: [-6, -60], hips: [0, -30], lean: -8, arms: [110, 0, 44], fores: [24], grip: 0.6, aux: { [DOOR]: 0.7 } }, hold),
    limb: 'none',
  });

  // Chimney Launch: held up over the chest vent and blasted straight up on a column of heat
  out.throwu = strike(S('throwu'), {
    wind: pose({ y: -0.22, curve: -16, chest: [-12, 0], head: [-32], arms: [150, 0, 10], fores: [22], glow: 0.9, squash: 0.06 }, hold),
    strike: pose({ y: 0.06, curve: -28, chest: [-18, 0], head: [-38], arms: [176, 0, 22], fores: [4], squash: -0.1, grip: 0, glow: 1.4, aux: { [DOOR]: 1 } }, hold),
    follow: pose({ curve: -20, chest: [-12, 0], head: [-28], arms: [160, 0, 30], fores: [16], grip: 0.6, glow: 0.9, aux: { [DOOR]: 0.6 } }, hold),
    limb: 'none',
  });

  // Blast Furnace: brace, the door swings open white-hot, chest thrust out, arms flung back like
  // wings, the head thrown back, a short wide cone of fire (an arched shape, arms behind)
  out.special = strike(S('special'), {
    windEarly: pose({ y: -0.16, curve: 10, chest: [-4, 0], arms: [-4, 0, 50], fores: [60], lean: -2, glow: 0.8, aux: { [DOOR]: 0.2 } }, st),
    wind: pose({ y: -0.24, curve: 20, chest: [6, 0], head: [8], arms: [30, 0, 30], fores: [110], lean: 2, x: -0.04, fL: [0.42, 0], fR: [-0.44, 0], glow: 1.3, squash: 0.08, aux: { [DOOR]: 0.75 } }, st),
    strike: pose({ y: -0.14, curve: -24, sway: -0.06, chest: [-6, 0], head: [-14], arms: [-62, 0, 76], fores: [14], lean: -4, x: 0.08, fL: [0.56, 0], fR: [-0.56, 0], glow: 1.6, aux: { [DOOR]: 1, [FLAME]: 1 } }, st),
    strikeEnd: pose({ y: -0.14, curve: -24, sway: -0.06, chest: [-4, 0], head: [-12], arms: [-64, 0, 78], fores: [16], lean: -3, x: 0.09, fL: [0.56, 0], fR: [-0.56, 0], glow: 1.4, aux: { [DOOR]: 1, [FLAME]: 0.85 } }, st),
    follow: pose({ y: -0.15, curve: -16, chest: [0, 0], lean: 0, x: 0.08, arms: [-50, 0, 70], fores: [22], glow: 1, fL: [0.56, 0], fR: [-0.56, 0], aux: { [DOOR]: 0.9, [FLAME]: 0 } }, st),
    recover: pose({ y: -0.2, curve: 10, chest: [8, 0], lean: 2, x: 0.05, arms: [10, 0, 52], fores: [64], glow: 0.8, fL: [0.48, 0], fR: [-0.48, 0], aux: { [DOOR]: 0.5 } }, st),
    limb: 'body',
    accent: 0.6,
  });

  // Ram Piston: cock one arm, then a deep fencing lunge, back leg straight, the piston fist fired
  // long and a little upward: the lowest body and the longest arm Kiln has
  const r2 = M.special2.hitboxes[0];
  out.special2 = strike(S('special2'), {
    wind: pose({ y: -0.14, curve: -10, counter: 14, chest: [-6, 16], lean: -8, x: -0.06, armR: [-44, 0, 22], foreR: [134], armL: [52, 0, 22], foreL: [80], glow: 0.9, squash: 0.06 }, st),
    strike: pose({ y: -0.26, curve: 6, sway: 0.07, counter: -12, chest: [4, -12], lean: 8, x: 0.16, armR: [96, 0, 0], foreR: [0], armL: [-60, 0, 34], foreL: [22], glow: 1.1, aux: { [STEAM]: 1 }, fL: [0.74, 0], fR: [-0.78, 0.04] }, st),
    follow: pose({ y: -0.27, curve: 7, sway: 0.075, counter: -14, chest: [5, -12], lean: 9, x: 0.17, armR: [92, 0, 4], foreR: [8], armL: [-60, 0, 34], foreL: [26], fL: [0.74, 0], fR: [-0.78, 0.04] }, st),
    recover: pose({ y: -0.26, curve: 10, chest: [10, -4], lean: 6, x: 0.14, armR: [30, 0, 32], foreR: [96], armL: [20, 0, 34], foreL: [60], fL: [0.6, 0], fR: [-0.6, 0] }, st),
    limb: 'handR',
    path: [[0, r2.x + 0.2, r2.y + 0.3], [S('special2').active, r2.x + 0.25, r2.y + 0.34]],
  });

  // Thermal Rise: boot jets ignite, Kiln rises slow and armoured, one knee driven up, fists up in
  // a V (a star shape, never a pole), kicking on the column of flame
  out.recover = strike(S('recover'), {
    wind: pose({ curve: 24, thighs: [70], shins: [-112], arms: [0, 0, 40], fores: [62], glow: 0.9, squash: 0.1, aux: { [JETS]: 0.4 } }, ar),
    strike: pose({ curve: -18, arms: [150, 0, 40], fores: [10], thighL: [70, 0, 12], shinL: [-96], thighR: [-12, 0, 12], shinR: [-16], feet: [-30], chest: [-4], head: [-20], glow: 1.2, squash: -0.1, aux: { [JETS]: 1 } }, ar),
    strikeEnd: pose({ curve: -14, arms: [140, 0, 46], fores: [18], thighL: [50, 0, 14], shinL: [-80], thighR: [4, 0, 12], shinR: [-30], feet: [-22], chest: [-4], head: [-16], glow: 1, aux: { [JETS]: 0.9 } }, ar),
    follow: pose({ curve: -10, arms: [136, 0, 48], fores: [24], thighL: [40, 0, 14], shinL: [-70], thighR: [10, 0, 12], shinR: [-36], glow: 0.6, aux: { [JETS]: 0.2 } }, ar),
    recover: pose({ curve: -8, arms: [140, 0, 40], fores: [26], thighL: [30, 0, 14], shinL: [-60], thighR: [-4, 0, 12], shinR: [-24], glow: 0.4, eyes: -0.4, aux: { [JETS]: 0 } }, ar),
    limb: 'none',
  });
  return out;
}

// where a held robot sits in Kiln's tongs, and how it travels through each throw
const carry: CarryFn = (move, f, def, o) => {
  const h = def.height;
  const reach = def.width * 0.5 + 0.5;
  o.x = reach;
  o.y = h * 0.52;
  o.spin = 0;
  if (!move || move === 'grab' || move === 'special') return;
  const md = def.moves[move];
  const rel = md.hitboxes[0]?.from ?? md.startup + 1;
  const t = Math.min(1, Math.max(0, f / rel));
  const e = t * t * (3 - 2 * t);
  if (move === 'throwu') {
    // over the chest vent
    o.x = reach + (0.35 - reach) * e;
    o.y = h * (0.52 + 0.68 * e);
    o.spin = -15 * e;
  } else if (move === 'throwb') {
    // up over the shoulder and down behind
    const a = Math.PI * e;
    o.x = Math.cos(a) * reach;
    o.y = h * 0.6 + Math.sin(a) * h * 0.5;
    o.spin = -170 * e;
  } else {
    // to the chest, then the shove
    const lift = Math.min(1, t / 0.75);
    const push = Math.max(0, (t - 0.75) / 0.25);
    o.x = reach - 0.22 * lift + 0.55 * push * push;
    o.y = h * (0.52 + 0.14 * lift);
    o.spin = 8 * lift - 25 * push;
  }
};

// ------------------------------------------------------------------------------------------------
// Per-frame extras: tongs, furnace heat, door, flame cone, boot jets
// ------------------------------------------------------------------------------------------------

const EMBER = new THREE.Color(PALETTE.ember);
const WHITE_HOT = new THREE.Color('#fff1c8');
const _col = new THREE.Color();

interface KilnParts {
  jaw: [THREE.Object3D, THREE.Object3D, THREE.Object3D, THREE.Object3D]; // A L, B L, A R, B R
  door: THREE.Object3D;
  flame: THREE.Object3D;
  jets: [THREE.Object3D, THREE.Object3D];
}
const partsOf = new WeakMap<RigHandles, KilnParts>();

function update(h: RigHandles, p: Pose, s: FighterState | null, info: FrameInfo): void {
  let k = partsOf.get(h);
  if (!k) {
    k = {
      jaw: [h.part('jawAL'), h.part('jawBL'), h.part('jawAR'), h.part('jawBR')],
      door: h.part('door'),
      flame: h.part('flame'),
      jets: [h.part('jetL'), h.part('jetR')],
    };
    partsOf.set(h, k);
  }
  // tong fists
  const openL = (1 - Math.min(1, Math.max(0, p[C.gripL]))) * 0.5;
  const openR = (1 - Math.min(1, Math.max(0, p[C.gripR]))) * 0.5;
  k.jaw[0].rotation.z = openL;
  k.jaw[1].rotation.z = -openL;
  k.jaw[2].rotation.z = openR;
  k.jaw[3].rotation.z = -openR;
  // furnace heat: the pose's glow, plus charge and armour
  let heat = p[C.glow];
  if (info.charge > 0) heat = Math.max(heat, 0.6 + info.charge * 0.9);
  if (info.armor) heat = Math.max(heat, 1.15 + 0.15 * Math.sin(info.t * 40));
  heat = Math.max(0, heat);
  const flick = 0.92 + 0.08 * Math.sin(info.t * 23) * Math.sin(info.t * 7.3);
  const hot = Math.min(1, Math.max(0, (heat - 0.6) / 0.9));
  _col.copy(EMBER).lerp(WHITE_HOT, hot);
  h.mats.glow.emissive.copy(_col);
  h.mats.glow.emissiveIntensity = (0.7 + heat * 2.4) * flick;
  // eyes
  h.mats.eye.emissiveIntensity = Math.max(0.05, 2.2 + p[C.eyes] * 1.6 + (info.armor ? 0.6 : 0));
  // door
  k.door.rotation.y = Math.min(1, Math.max(0, p[C.aux + DOOR])) * 1.9;
  flameTime.value = info.t;
  // fire cone
  const fl = Math.max(0, p[C.aux + FLAME]);
  k.flame.visible = fl > 0.02;
  if (k.flame.visible) {
    const pulse = 1 + 0.08 * Math.sin(info.t * 50);
    k.flame.scale.set(1.9 * fl * pulse, 1.25 * (0.6 + 0.4 * fl), 1.25 * (0.6 + 0.4 * fl));
  }
  // boot jets
  const jets = Math.max(0, p[C.aux + JETS]);
  for (let i = 0; i < 2; i++) {
    const jet = k.jets[i];
    jet.visible = jets > 0.02;
    if (jet.visible) jet.scale.set(0.8 + 0.3 * jets, (0.35 + 0.65 * jets) * (1 + 0.15 * Math.sin(info.t * 45 + i * 2)), 0.8 + 0.3 * jets);
  }
  void s;
}

// ------------------------------------------------------------------------------------------------

function spec(def: FighterDef): RobotSpec {
  return {
    id: 'kiln',
    body: BODY,
    palette: {
      // machinery yellow over gunmetal, bright steel, a lit iron for the joints, arc-cyan eyes,
      // a cool blue rim against the warm paint
      paint: '#f2a81d',
      paint2: '#4a5462',
      trim: '#d2d8e0',
      dark: '#5a6470',
      glow: PALETTE.ember,
      eye: '#3fe6ff',
      rim: '#8cc6ff',
      // mirror match: the values flip (a pale enamel shell over deep teal iron) and the rim warms
      alt: { paint: '#e3e8ed', paint2: '#1e5a60', rim: '#ffb46a' },
    },
    gait: {
      walkCycle: 1.5, walkDuty: 0.6, walkLift: 0.12, walkBob: 0.03, walkSwing: 22, walkLean: 4,
      runCycle: 2.8, runDuty: 0.3, runLift: 0.4, runBob: 0.07, runSwing: 50, runLean: 18,
      breathRate: 0.75, breathDepth: 1.2,
      turnFrames: 5,
    },
    threeQuarter: 36,
    build,
    poses: P,
    moves: kilnMoves(def),
    carry,
    update,
  };
}

let cached: RobotSpec | null = null;
export const createFighter: CreateFighterView = (ctx, opts) => {
  if (!cached) cached = spec(ctx.fighterDefs.kiln);
  return createRobot(ctx, opts, cached);
};
