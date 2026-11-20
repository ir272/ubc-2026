// Gantry: the long reach. A tall thin harbour crane of a robot: a lattice mast for a torso, a big
// white operator cab for a head (a dark windshield with two lit eye-lamps under an orange hood, an
// amber beacon on the roof), one enormous telescoping boom arm in nested box sections that ends in
// a heavy sheave head and a crane hook on its own cable, a short arm that carries the rivet gun,
// long stilt legs on wide outrigger feet, and a counterweight on its back that slides out as the
// boom extends.
//
// Built on the shared rig (../rig.ts) like kiln.ts. Three things are its own:
//  - Gantry is asymmetric. The rig mirrors the pose when the robot faces left (so the near arm
//    always plays the near arm's part), so the boom and the gun are built on BOTH arms and update()
//    shows the boom on whichever arm plays the boom: the robot's right facing right, its left
//    facing left. The boom is always the near arm, in front of the mast.
//  - The boom telescopes past what the rig's IK asks for: aux BOOM is an extra extension in metres
//    that poses can set (the idle jib, the spin, the win). The extension is laid out section by
//    section, tip first, and the counterweight slides back to balance it. On the first active frame
//    of a boom strike the extension overshoots and rings like a struck spring (the hard stop).
//  - The hook hangs on its own cable: aux CABLE lets the cable out (Wrecking Swing, Hook Grab,
//    Cable Spin, Ballast Swing), aux RIGID flings the hook out in line with the boom instead of
//    letting it hang, and Grapple Line fires it out to the ledge.

import * as THREE from 'three';
import type { CreateFighterView } from '../api.ts';
import type { ArenaDef, FighterDef, FighterState, MoveDef, MoveId } from '../../sim/types.ts';
import {
  C, createRobot, G, J, mixInto, copyPose, pose, robotMaterial, solveTwoBone, strike, ease,
  type CarryFn, type FrameInfo, type Key, type Kit, type MoveAnim, type Pose, type PoseSet, type RobotSpec, type RigHandles, type ShowName, type V3,
} from '../rig.ts';

// ------------------------------------------------------------------------------------------------
// Body
// ------------------------------------------------------------------------------------------------

// Size hierarchy: one long shape (the boom), one big head (the cab, a quarter of the height with
// its beacon), big outrigger feet and a big hook at the end of the reach; a slim mast between.
const BODY = {
  ankle: 0.14,
  shin: 0.5,
  thigh: 0.5,
  hipWidth: 0.32,
  chestY: 0.06,
  neckY: 0.62,
  neckX: 0.02,
  shoulderX: -0.02,
  shoulderY: 0.5,
  shoulderZ: 0.32,
  upperArm: 0.34,
  forearm: 0.56,
  handReach: 0.2,
  stanceWidth: 0.46,
  armStretch: 1.9,
  centerY: 1.15,
};

/** the boom's nested sections: four, each slides out up to SEC_TRAVEL past the one before it */
const SECTIONS = 4;
const SEC_TRAVEL = BODY.armStretch / SECTIONS;
const SEC_LEN = 0.54;
const HOOK_PIVOT = -0.26;
const CW_X = -0.2; // counterweight pivot, chest frame
const CW_Y = 0.6;
const CW_LEN0 = 0.26;

// aux channels
const BOOM = 0; // extra boom extension, metres
const CW_SWING = 1; // counterweight swung back, degrees
const CW_LEN = 2; // counterweight link let out, metres
const NECK = 3; // cab raised on its neck, metres
const CABLE = 4; // hook cable let out, metres
const RIGID = 5; // 0 the hook hangs, 1 it is flung out in line with the boom
const HEAT = 6; // rivet gun heat 0..1
const NOLEVEL = 7; // 1 = the cab rolls with the body instead of staying level

const DEG = Math.PI / 180;

// ------------------------------------------------------------------------------------------------
// Geometry helpers
// ------------------------------------------------------------------------------------------------

const _ga = new THREE.Vector3();
const _gb = new THREE.Vector3();
const _gq = new THREE.Quaternion();
const YUP = new THREE.Vector3(0, 1, 0);

/** a square bar of thickness t from a to b (lattice braces) */
function bar(a: V3, b: V3, t: number, r = 0.01): THREE.BufferGeometry {
  _ga.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _ga.length();
  const g = G.box(t, len, t, r);
  _gq.setFromUnitVectors(YUP, _gb.copy(_ga).normalize());
  g.applyQuaternion(_gq);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}

/** zigzag bracing between two parallel vertical chords, n bays */
function zigzag(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, n: number, t: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const ya = y0 + ((y1 - y0) * i) / n;
    const yb = y0 + ((y1 - y0) * (i + 1)) / n;
    if (i % 2 === 0) out.push(bar([x0, ya, z0], [x1, yb, z1], t));
    else out.push(bar([x1, ya, z1], [x0, yb, z0], t));
  }
  return out;
}

/** a crane hook: a J of round bar in the x-y plane, opening forward, eye at the top (y = 0) */
function hookGeo(): THREE.BufferGeometry {
  const R = 0.075;
  const tube = 0.028;
  const ring = new THREE.TorusGeometry(R, tube, 8, 16, Math.PI * 1.55);
  ring.rotateZ(Math.PI / 2);
  ring.translate(0, -0.13 - R, 0);
  const tip = new THREE.ConeGeometry(tube * 1.2, 0.075, 8);
  const a = Math.PI / 2 + Math.PI * 1.55;
  tip.rotateZ(a);
  tip.translate(Math.cos(a) * R + 0.012, -0.13 - R + Math.sin(a) * R + 0.03, 0);
  return G.merge([
    G.cyl(0.026, 0.026, 0.1, 8, [0, -0.06, 0]),
    G.cyl(0.036, 0.036, 0.03, 8, [0, -0.11, 0]),
    ring,
    tip,
  ]);
}

// ------------------------------------------------------------------------------------------------
// Parts
// ------------------------------------------------------------------------------------------------

/** materials Gantry adds to the rig's set (kept per view by the Kit) */
interface ExtraMats {
  band: THREE.MeshStandardMaterial;
  beacon: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  flash: THREE.MeshBasicMaterial;
}
const extraOf = new WeakMap<THREE.MeshStandardMaterial, ExtraMats>();

/** the cab's own colour: white on the orange crane, orange on the white mirror crane */
const WHITE = '#f1f4f7';
const ORANGE = '#ff7a14';
const EYE = '#ffd23c';

function build(k: Kit): void {
  const m = k.mats;
  // Every bone gets one mesh per material: the details are merged. About 43 draw calls with the
  // boom fully out (the gun arm's boom set and the boom arm's gun set are hidden).
  const band = k.own(robotMaterial(k.uniforms, { color: k.alt ? ORANGE : WHITE, roughness: 0.28, metalness: 0.1, envMapIntensity: 1.1 }, 1, 0.9));
  const beacon = k.own(robotMaterial(k.uniforms, { color: '#3a1a04', emissive: '#ffa21a', emissiveIntensity: 1.4, roughness: 0.25 }, 0, 0.8));
  const glass = k.own(robotMaterial(k.uniforms, { color: '#05080e', roughness: 0.35, metalness: 0.1, envMapIntensity: 0.25 }, 0.35, 1.0));
  const flash = k.own(new THREE.MeshBasicMaterial({ color: '#ffb84a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  extraOf.set(m.paint, { band, beacon, glass, flash });

  // ---- pelvis: a slewing base on a graphite block, hip knuckles
  k.mesh('hips', 'hips-iron', () => G.merge([
    G.box(0.3, 0.18, 0.46, 0.05, [0, -0.01, 0]),
    G.cyl(0.08, 0.08, 0.5, 12, [0, -0.04, 0], [90, 0, 0]),
    G.box(0.1, 0.13, 0.26, 0.03, [0.15, 0.01, 0]),
  ]), m.paint2);

  // ---- the mast: a graphite core behind four heavy orange chords and orange lattice bracing in
  // relief, so it reads as a crane mast but never as see-through scaffolding
  const hx = 0.16;
  const hz = 0.18;
  k.mesh('chest', 'mast-core', () => G.merge([
    G.box(0.3, 0.56, 0.34, 0.03, [0, 0.31, 0]),
    // the counterweight rail along the top, out the back
    G.box(0.36, 0.045, 0.09, 0.012, [-0.22, 0.655, 0]),
    // operator ladder up the back
    ...[0.14, 0.26, 0.38].map((y) => G.box(0.04, 0.022, 0.14, 0.006, [-hx - 0.035, y, 0])),
  ]), m.paint2);
  k.mesh('chest', 'mast-paint', () => G.merge([
    G.box(0.085, 0.6, 0.085, 0.02, [hx, 0.31, hz]),
    G.box(0.085, 0.6, 0.085, 0.02, [hx, 0.31, -hz]),
    G.box(0.085, 0.6, 0.085, 0.02, [-hx, 0.31, hz]),
    G.box(0.085, 0.6, 0.085, 0.02, [-hx, 0.31, -hz]),
    ...zigzag(-hx, hz + 0.01, hx, hz + 0.01, 0.06, 0.54, 3, 0.052),
    ...zigzag(-hx, -hz - 0.01, hx, -hz - 0.01, 0.06, 0.54, 3, 0.052),
    ...zigzag(hx + 0.01, -hz, hx + 0.01, hz, 0.06, 0.54, 3, 0.052),
    ...zigzag(-hx - 0.01, -hz, -hx - 0.01, hz, 0.06, 0.54, 3, 0.052),
  ]), m.paint);
  k.mesh('chest', 'mast-band', () => G.merge([
    // the slewing ring that carries the shoulders and the cab, the foot collar, the neck sleeve
    G.box(0.42, 0.11, 0.8, 0.035, [-0.01, 0.6, 0]),
    G.box(0.4, 0.075, 0.44, 0.025, [0, 0.03, 0]),
    G.cyl(0.085, 0.095, 0.07, 12, [BODY.neckX, 0.67, 0]),
  ]), band);

  // ---- counterweight: a hanging block on a link that runs along the rail
  k.group('chest', 'cwPivot', [CW_X, CW_Y, 0]);
  k.group('cwPivot', 'cwRod', [0, 0, 0]);
  k.mesh('cwRod', 'cw-rod', () => G.merge([
    G.box(0.04, 1, 0.04, 0.01, [0, -0.5, 0.08]),
    G.box(0.04, 1, 0.04, 0.01, [0, -0.5, -0.08]),
  ]), m.dark);
  k.group('cwPivot', 'cwBlock', [0, -CW_LEN0, 0]);
  k.mesh('cwBlock', 'cw-iron', () => G.merge([
    G.box(0.22, 0.36, 0.38, 0.045, [-0.03, -0.17, 0]),
  ]), m.paint2);
  k.mesh('cwBlock', 'cw-band', () => G.merge([
    // white bands across the back face and over the top
    G.box(0.024, 0.06, 0.39, 0.008, [-0.14, -0.08, 0]),
    G.box(0.024, 0.06, 0.39, 0.008, [-0.14, -0.24, 0]),
    G.box(0.23, 0.035, 0.3, 0.01, [-0.03, 0.01, 0]),
  ]), band);

  // ---- the cab: a big white operator cab, a dark windshield carrying two lit eye-lamps, an
  // orange roof whose hood comes down over the glass like a brow, an amber beacon on top
  k.mesh('head', 'cab-iron', () => G.merge([
    G.cyl(0.055, 0.055, 0.24, 10, [0, -0.06, 0]), // neck post (slides in the sleeve)
    G.box(0.3, 0.06, 0.3, 0.02, [0.03, 0.06, 0]), // mount
    G.box(0.09, 0.07, 0.46, 0.025, [0.31, 0.125, 0], [0, 0, 12]), // chin sill under the glass
    G.cyl(0.075, 0.08, 0.04, 14, [-0.07, 0.525, 0]), // beacon base
    G.box(0.52, 0.05, 0.52, 0.02, [0.06, 0.115, 0]), // the cab's foot band
    // door seams and handles on both sides, a vent grille at the back
    ...[1, -1].flatMap((zz) => [
      G.box(0.012, 0.26, 0.012, 0.003, [-0.1, 0.27, zz * 0.252]),
      G.box(0.012, 0.26, 0.012, 0.003, [0.14, 0.27, zz * 0.252]),
      G.box(0.25, 0.012, 0.012, 0.003, [0.02, 0.4, zz * 0.252]),
      G.box(0.05, 0.02, 0.02, 0.006, [0.1, 0.27, zz * 0.258]),
    ]),
    ...[0.2, 0.25, 0.3].map((y) => G.box(0.012, 0.02, 0.3, 0.004, [-0.192, y, 0])),
  ]), m.paint2);
  k.mesh('head', 'cab-shell', () => G.merge([
    G.box(0.5, 0.36, 0.5, 0.075, [0.06, 0.27, 0]),
  ]), band);
  k.mesh('head', 'cab-glass', () => G.merge([
    G.box(0.05, 0.25, 0.44, 0.02, [0.3, 0.275, 0]),
  ]), glass);
  k.eyes('head', { at: [0.329, 0.272, 0], w: 0.42, h: 0.23, sep: 0.5, size: 1.15, color: EYE });
  k.mesh('head', 'cab-roof', () => G.merge([
    G.box(0.56, 0.07, 0.56, 0.025, [0.05, 0.475, 0]),
    // the hood over the windshield: its front edge drops, a brow over the eyes
    G.box(0.16, 0.06, 0.54, 0.02, [0.33, 0.44, 0], [0, 0, -18]),
    // cheek plates either side of the glass
    G.box(0.06, 0.29, 0.05, 0.015, [0.3, 0.27, 0.235]),
    G.box(0.06, 0.29, 0.05, 0.015, [0.3, 0.27, -0.235]),
  ]), m.paint);
  k.mesh('head', 'cab-beacon', () => G.merge([G.cyl(0.075, 0.085, 0.14, 14, [-0.07, 0.61, 0]), G.sphere(0.075, 12, [-0.07, 0.68, 0], [1, 0.45, 1])]), beacon);

  for (const sd of ['L', 'R'] as const) {
    const z = sd === 'L' ? -1 : 1;
    // ---- shoulder pad on the slewing ring, the side colour on its crown and outer face
    k.mesh(`shoulder${sd}`, `pad-paint${sd}`, () => G.merge([
      G.box(0.34, 0.2, 0.22, 0.05, [-0.01, 0.1, z * 0.33]),
      ...G.rivets(3, [-0.11, 0.1, z * 0.47], [0.09, 0.1, z * 0.47], 0.02, 'z'),
    ]), m.paint);
    k.mesh(`shoulder${sd}`, `pad-side${sd}`, () => G.merge([
      G.box(0.3, 0.05, 0.2, 0.018, [-0.01, 0.21, z * 0.33]),
      G.box(0.26, 0.13, 0.035, 0.012, [-0.01, 0.1, z * 0.45]),
    ]), m.side);


    // ---- the boom: hub, the upper strut, the base box section, four nested sections, the sheave
    // head, and the hook on its cable
    k.group(`arm${sd}`, `boomUp${sd}`);
    k.mesh(`boomUp${sd}`, `boom-hub${sd}`, () => G.merge([
      G.cyl(0.15, 0.15, 0.17, 18, [0, 0, z * 0.03], [90, 0, 0]),
      G.box(0.2, 0.32, 0.2, 0.04, [0, -0.17, 0]),
    ]), m.paint);
    k.mesh(`boomUp${sd}`, `boom-hubdark${sd}`, () => G.merge([
      G.cyl(0.09, 0.09, 0.2, 12, [0, 0, z * 0.03], [90, 0, 0]),
      G.cyl(0.11, 0.11, 0.25, 14, [0, -BODY.upperArm, 0], [90, 0, 0]), // elbow pin housing
      G.cyl(0.035, 0.035, 0.26, 8, [-0.12, -0.16, 0]), // luffing ram
    ]), m.paint2);
    k.group(`fore${sd}`, `boomFore${sd}`);
    k.mesh(`boomFore${sd}`, `boom-base`, () => G.merge([
      G.box(0.31, 0.56, 0.31, 0.04, [0, -0.3, 0]),
    ]), m.paint);
    k.mesh(`boomFore${sd}`, `boom-basetrim`, () => G.merge([
      G.box(0.33, 0.07, 0.33, 0.016, [0, -0.55, 0]), // mouth collar
      G.box(0.33, 0.06, 0.33, 0.016, [0, -0.1, 0]),
      G.rivets(4, [0.157, -0.18, 0], [0.157, -0.46, 0], 0.02, 'x'),
      G.rivets(4, [0, -0.18, 0.157], [0, -0.46, 0.157], 0.02, 'z'),
      G.rivets(4, [0, -0.18, -0.157], [0, -0.46, -0.157], 0.02, 'z'),
    ]), band);
    for (let i = 1; i <= SECTIONS; i++) {
      const w = 0.29 - 0.024 * i;
      k.group(`boomFore${sd}`, `sec${sd}${i}`, [0, -BODY.forearm, 0]);
      k.mesh(`sec${sd}${i}`, `boom-sec${i}`, () => G.merge([
        G.box(w, SEC_LEN, w, 0.016, [0, SEC_LEN / 2 - 0.02, 0]),
        G.box(w + 0.018, 0.045, w + 0.018, 0.008, [0, -0.005, 0]), // lip at the mouth
      ]), i % 2 === 1 ? band : m.paint);
    }
    // the sheave head at the tip: a big white block with a fat orange sheave either side. It is
    // the end of the reach, so it is the biggest, brightest shape out there.
    k.group(`hand${sd}`, `boomHand${sd}`);
    k.mesh(`boomHand${sd}`, `head-white`, () => G.merge([
      G.box(0.38, 0.34, 0.24, 0.06, [0, -0.09, 0]),
      G.box(0.26, 0.07, 0.26, 0.02, [0, 0.08, 0]),
    ]), band);
    k.mesh(`boomHand${sd}`, `head-sheaves`, () => G.merge([
      G.cyl(0.19, 0.19, 0.06, 22, [0.0, -0.1, 0.15], [90, 0, 0]),
      G.cyl(0.19, 0.19, 0.06, 22, [0.0, -0.1, -0.15], [90, 0, 0]),
    ]), m.paint);
    // the hook block and hook on the cable (update() keeps it hanging, swinging or flung out)
    k.group(`boomHand${sd}`, `hook${sd}`, [0, HOOK_PIVOT, 0]);
    k.mesh(`hook${sd}`, `hook-block${k.side}`, () => G.merge([
      G.box(0.27, 0.25, 0.27, 0.05, [0, -0.12, 0]),
      G.cyl(0.06, 0.06, 0.3, 10, [0, -0.12, 0], [90, 0, 0]),
    ]), m.side);
    k.mesh(`hook${sd}`, 'hook-steel', () => {
      const g = hookGeo();
      g.scale(1.9, 1.9, 1.9);
      g.translate(0, -0.2, 0);
      return g;
    }, m.trim);
    // the ballast that Ballast Swing hangs on the hook (the counterweight, unhooked)
    k.group(`hook${sd}`, `ballast${sd}`, [0, -0.52, 0]);
    k.mesh(`ballast${sd}`, 'ballast', () => G.merge([
      G.box(0.26, 0.42, 0.42, 0.05, [0, -0.21, 0]),
      G.box(0.05, 0.14, 0.26, 0.012, [0, 0.05, 0]),
    ]), m.paint2);
    // the cable (unit length, scaled): a bright steel rope so it reads as a line, not a hair
    k.group(`boomHand${sd}`, `cable${sd}`, [0, HOOK_PIVOT + 0.04, 0]);
    k.mesh(`cable${sd}`, 'cable', () => G.merge([G.box(0.075, 1, 0.075, 0.02, [0, -0.5, 0])]), band);

    // ---- the gun arm: a strut, a fat rivet gun along the forearm, a drum of hot rivets
    k.group(`arm${sd}`, `gunUp${sd}`);
    k.mesh(`gunUp${sd}`, `gun-upper${sd}`, () => G.merge([
      G.cyl(0.1, 0.1, 0.13, 14, [0, 0, z * 0.02], [90, 0, 0]),
      G.box(0.15, 0.3, 0.15, 0.035, [0, -0.17, 0]),
      G.sphere(0.09, 10, [0, -BODY.upperArm, 0]),
    ]), m.paint);
    k.group(`fore${sd}`, `gunFore${sd}`);
    k.mesh(`gunFore${sd}`, `gun-body${sd}`, () => G.merge([
      G.box(0.2, 0.44, 0.2, 0.04, [0, -0.22, 0]), // receiver
      G.cyl(0.058, 0.058, 0.42, 14, [0.0, -0.56, 0]), // barrel
      G.box(0.08, 0.14, 0.07, 0.018, [-0.1, -0.28, 0]), // grip
      G.cyl(0.07, 0.07, 0.05, 14, [0, -0.42, 0]), // barrel collar
    ]), m.paint2);
    k.mesh(`gunFore${sd}`, `gun-paint${sd}`, () => G.merge([
      G.box(0.23, 0.24, 0.23, 0.045, [0.0, -0.14, 0]), // shroud
      G.cyl(0.15, 0.15, 0.1, 20, [0.0, -0.3, z * 0.14], [90, 0, 0]), // the drum
      G.cyl(0.085, 0.085, 0.07, 16, [0, -0.76, 0]), // muzzle ring
    ]), band);
    k.mesh(`gunFore${sd}`, `gun-heat${sd}`, () => G.merge([
      G.cyl(0.09, 0.09, 0.105, 16, [0.0, -0.3, z * 0.145], [90, 0, 0]), // window in the drum
      G.cyl(0.04, 0.04, 0.075, 10, [0, -0.765, 0]), // the bore
    ]), m.glow);
    k.group(`hand${sd}`, `gunHand${sd}`);
    k.group(`gunHand${sd}`, `muzzle${sd}`, [0, -0.22, 0]);
    k.mesh(`muzzle${sd}`, 'muzzle-flash', () => {
      // the shot: a long tongue of flame down the line of the barrel and a short star of spikes
      // across it at the muzzle (hard flat shapes, white at the core, set by the material)
      const parts: THREE.BufferGeometry[] = [];
      const tongue = new THREE.ConeGeometry(0.12, 0.62, 4, 1, true);
      tongue.rotateX(Math.PI);
      tongue.translate(0, -0.31, 0);
      parts.push(tongue);
      for (let i = 0; i < 6; i++) {
        const sp = new THREE.ConeGeometry(0.045, i % 2 ? 0.2 : 0.3, 3, 1, true);
        sp.translate(0, (i % 2 ? 0.2 : 0.3) / 2, 0);
        sp.rotateX(Math.PI / 2);
        sp.rotateY((i / 6) * Math.PI * 2);
        sp.translate(0, -0.05, 0);
        parts.push(sp);
      }
      return G.merge(parts.map((q) => (q.index ? q.toNonIndexed() : q)));
    }, flash);
    // a plain piston rod when the gun arm is stretched (ledge hang)
    k.group(`stretch${sd}`, `rod${sd}`);
    k.mesh(`rod${sd}`, 'rod', () => G.merge([G.cyl(0.035, 0.035, 1, 8, [0, -0.5, 0])]), m.trim);

    // ---- stilt legs: an orange thigh sleeve on a dark strut, an orange shin with white bands,
    // big outrigger feet with white jack pads
    k.mesh(`thigh${sd}`, 'thigh-paint', () => G.merge([
      G.sphere(0.1, 10, [0, 0, 0]),
      G.cyl(0.065, 0.065, BODY.thigh, 10, [0, -BODY.thigh / 2, 0]),
      G.box(0.17, 0.34, 0.18, 0.04, [0.01, -0.2, 0]),
      G.cyl(0.09, 0.09, 0.2, 12, [0, -BODY.thigh, 0], [90, 0, 0]), // knee pin
    ]), m.paint);
    k.mesh(`shin${sd}`, 'shin-paint', () => G.merge([
      G.box(0.19, 0.44, 0.19, 0.04, [0.016, -0.25, 0]),
      G.box(0.1, 0.15, 0.2, 0.03, [0.09, -0.04, 0]), // knee plate
    ]), m.paint);
    k.mesh(`shin${sd}`, 'shin-band', () => G.merge([
      G.box(0.2, 0.075, 0.2, 0.015, [0.016, -0.3, 0]),
      G.box(0.2, 0.04, 0.2, 0.01, [0.016, -0.4, 0]),
      G.cyl(0.03, 0.03, 0.36, 8, [-0.11, -0.26, 0]), // rear piston
      G.rivets(3, [0.112, -0.12, -0.06], [0.112, -0.12, 0.06], 0.017, 'x'),
      G.rivets(2, [0.112, -0.46, -0.05], [0.112, -0.46, 0.05], 0.017, 'x'),
    ]), band);
    k.mesh(`foot${sd}`, 'foot-iron', () => G.merge([
      G.box(0.76, 0.085, 0.16, 0.025, [0.06, -0.09, 0]), // the outrigger beam
      G.box(0.13, 0.075, 0.44, 0.022, [-0.02, -0.1, 0]), // the cross beam
      G.box(0.2, 0.14, 0.19, 0.04, [0.0, -0.025, 0]), // ankle housing
    ]), m.paint2);
    k.mesh(`foot${sd}`, 'foot-pads', () => G.merge([
      G.cyl(0.11, 0.12, 0.05, 14, [0.4, -0.115, 0]),
      G.cyl(0.11, 0.12, 0.05, 14, [-0.28, -0.115, 0]),
      G.cyl(0.07, 0.08, 0.04, 12, [-0.02, -0.12, 0.21]),
      G.cyl(0.07, 0.08, 0.04, 12, [-0.02, -0.12, -0.21]),
      G.box(0.16, 0.05, 0.17, 0.015, [0.27, -0.035, 0], [0, 0, -10]), // toe cap
    ]), band);
  }
}

// ------------------------------------------------------------------------------------------------
// Key poses
// ------------------------------------------------------------------------------------------------

// R is the boom (the near arm), L the gun. The stance is a crane at rest: tall, a little hunched
// over the mast like an operator watching, the boom raised forward as a jib with the hook hanging
// in front of it at head height (the crane outline: one tall line, one raised diagonal, a hook),
// the gun held low at the hip, the outrigger feet planted wide.
const stance = pose({
  y: -0.06,
  curve: 4,
  hips: [3, 4],
  chest: [6, -4],
  head: [-4, 26],
  lean: 2,
  armR: [18, 0, 16], foreR: [84], handR: [-18],
  armL: [24, 0, 22], foreL: [46], handL: [0],
  grip: 1,
  fL: [0.3, 0], fR: [-0.26, 0],
  glow: 0.35,
  aux: { [BOOM]: 0.12 },
});

const air = pose({
  plant: 0,
  chest: [6], head: [0],
  armR: [30, 0, 16], foreR: [90], handR: [-20],
  armL: [30, 0, 30], foreL: [50],
  thighL: [56, 0, 10], shinL: [-88], thighR: [16, 0, 10], shinR: [-44], feet: [12],
  grip: 1, glow: 0.35,
  aux: { [BOOM]: 0.2 },
});

const P: Partial<PoseSet> & { stance: Pose; air: Pose } = {
  stance,
  air,
  crouch: pose({ y: -0.26, squash: 0.08, curve: 12, chest: [12], armR: [10, 0, 16], foreR: [100], armL: [6, 0, 30], foreL: [44], lean: 2, aux: { [BOOM]: 0.05 } }, stance),
  // off the deck: the stilts trail long and straight, the jib swept back
  rise: pose({ squash: -0.08, curve: -8, chest: [-4], armR: [-20, 0, 16], foreR: [116], armL: [-14, 0, 30], foreL: [40], thighL: [16], shinL: [-24], thighR: [-6], shinR: [-10], feet: [-34] }, air),
  // the top: knees tucked, the boom and gun thrown out wide (an X, never a pole)
  apex: pose({ curve: 12, thighL: [78, 0, 14], shinL: [-116], thighR: [40, 0, 14], shinR: [-84], armR: [70, 0, 30], foreR: [50], armL: [46, 0, 50], foreL: [54], chest: [10] }, air),
  fall: pose({ curve: -4, armR: [40, 0, 40], foreR: [80], armL: [20, 0, 70], foreL: [36], thighL: [36, 0, 12], shinL: [-58], thighR: [6, 0, 10], shinR: [-26], chest: [2], feet: [6] }, air),
  fastfall: pose({ curve: -10, armR: [10, 0, 50], foreR: [110], armL: [0, 0, 80], foreL: [20], thighs: [2, 0, 6], shins: [-6], squash: -0.08, chest: [-6] }, air),
  airjump: pose({ curve: -12, thighL: [86, 0, 10], shinL: [-120], thighR: [-14, 0, 10], shinR: [-26], armR: [-30, 0, 24], foreR: [128], armL: [-40, 0, 40], foreL: [36], chest: [-10], squash: -0.07 }, air),
  // the first frames of a run: a long stride off the back stilt, the jib swept back
  dash: pose({ lean: 15, curve: 8, chest: [8], head: [-8, 16], armR: [-56, 0, 18], foreR: [30], handR: [10], armL: [60, 0, 24], foreL: [60], y: -0.12, fL: [0.66, 0], fR: [-0.56, 0.12], yaw: 0, aux: { [BOOM]: 0.1 } }, stance),
  // a loping run: long stilts, chest down the line of travel, the jib carried back over the shoulder
  run: pose({ lean: 13, curve: 8, chest: [6, 0], head: [-8, 18], hips: [3, 0], armR: [-40, 0, 18], foreR: [26], handR: [10], armL: [40, 0, 26], foreL: [74], y: -0.08, yaw: 0, aux: { [BOOM]: 0.2 } }, stance),
  // a stalking walk: tall, deliberate, the jib held up
  walk: pose({ lean: 4, curve: 6, chest: [5, 0], hips: [2, 0], armR: [22, 0, 16], foreR: [74], armL: [18, 0, 22], foreL: [58], y: -0.05 }, stance),
  skid: pose({ lean: -14, curve: -8, chest: [-10, 0], armR: [30, 0, 36], foreR: [70], armL: [44, 0, 50], foreL: [30], y: -0.16, fL: [0.62, 0], fR: [0.0, 0], squash: 0.05, aux: { [BOOM]: 0.5 } }, stance),
  pivot: pose({ y: -0.1, curve: 8, chest: [8, 0], armR: [10, 0, 34], foreR: [100], armL: [24, 0, 34], foreL: [50] }, stance),
  shield: pose({ y: -0.14, curve: 14, chest: [10, -4], armR: [30, 0, 8], foreR: [124], handR: [-30], armL: [44, 0, 12], foreL: [96], lean: 2, aux: { [BOOM]: 0 } }, stance),
  dizzy: pose({ y: -0.16, curve: 22, chest: [18, 0, 12], head: [22, 0, 18], armR: [-6, 0, 16], foreR: [20], armL: [0, 0, 12], foreL: [10], eyes: -0.4, glow: 0.05, aux: { [BOOM]: 0.3, [CABLE]: 0.3, [NOLEVEL]: 1 } }, stance),
  rollTuck: pose({ y: -0.5, curve: 40, chest: [40], head: [30], armR: [40, 0, 10], foreR: [130], armL: [40, 0, 10], foreL: [120], plant: 0, thighs: [110], shins: [-145], squash: 0.04, aux: { [BOOM]: 0, [NOLEVEL]: 1 } }, stance),
  spot: pose({ y: -0.16, z: -0.5, yaw: 30, chest: [8, 20], armR: [10, 0, 8], foreR: [110], armL: [10, 0, 8], foreL: [70], aux: { [BOOM]: 0 } }, stance),
  airdodge: pose({ curve: 30, chest: [26], head: [20], armR: [30, 0, 10], foreR: [130], armL: [40, 0, 10], foreL: [120], thighs: [86], shins: [-128], aux: { [BOOM]: 0, [NOLEVEL]: 1 } }, air),
  // holding: the boom out level, the held robot hangs on the hook
  hold: pose({ y: -0.1, curve: 4, chest: [-2, 0], lean: -5, armR: [86, 0, 6], foreR: [8], handR: [0], armL: [40, 0, 26], foreL: [56], fL: [0.42, 0], fR: [-0.36, 0], aux: { [BOOM]: 0.25 } }, stance),
  held: pose({ curve: -14, chest: [-12], head: [16], armR: [30, 0, 44], foreR: [60], armL: [34, 0, 50], foreL: [44], thighL: [24], shinL: [-46], thighR: [-8], shinR: [-24], aux: { [NOLEVEL]: 1 } }, air),
  flinch: pose({ curve: -14, chest: [-14, 8], head: [-18], lean: -9, armR: [60, 0, 50], foreR: [40], armL: [50, 0, 60], foreL: [24], y: -0.06, eyes: 0.7, glow: 0.6, aux: { [BOOM]: 0.3 } }, stance),
  // the blow lands: one clean C bent away from the hit, the boom flung up and back, the gun out
  hurt: pose({ curve: -22, chest: [-8, 0], head: [-26, 10], lean: -12, y: -0.04, armR: [150, 0, 40], foreR: [8], armL: [110, 0, 70], foreL: [16], thighL: [34], shinL: [-58], thighR: [-6], shinR: [-12], plant: 0.5, eyes: 1, glow: 1, stretch: 0.06, lineAng: -60, aux: { [BOOM]: 0.1, [NOLEVEL]: 1 } }, stance),
  // launched: a clean X, the boom straight and the stilts split, nothing crossing the mast
  tumble: pose({ curve: -18, chest: [-12], head: [-20], armR: [140, 0, 50], foreR: [6], armL: [110, 0, 80], foreL: [16], thighL: [46, 0, 22], shinL: [-30], thighR: [-34, 0, 22], shinR: [-8], feet: [-20], eyes: 0.5, aux: { [BOOM]: 0.25, [NOLEVEL]: 1 } }, air),
  // knocked flat on its back, the boom thrown out over the deck, then a push up on the gun arm
  lying: pose({ plant: 0, spin: -88, y: -0.92, x: 0.05, chest: [-4], head: [-14], armR: [40, 0, 24], foreR: [70], armL: [150, 0, 30], foreL: [20], thighs: [6], shins: [-12], feet: [20], eyes: -0.5, glow: 0.05, aux: { [BOOM]: 0.5, [NOLEVEL]: 1 } }, air),
  getup: pose({ plant: 0, spin: -40, y: -0.52, x: 0.0, chest: [30], head: [10], armR: [-30, 0, 20], foreR: [60], armL: [-50, 0, 24], foreL: [6], thighs: [84], shins: [-120], feet: [0], aux: { [BOOM]: 0.1, [NOLEVEL]: 1 } }, air),
  hang: pose({ armR: [172, 0, 8], foreR: [4], armL: [170, 0, 10], foreL: [6], curve: -8, chest: [-6], head: [-10], thighs: [14], shins: [-20], aux: { [BOOM]: 0 } }, air),
  climb: pose({ plant: 0, armR: [124, 0, 14], foreR: [40], armL: [120, 0, 14], foreL: [40], chest: [36], thighL: [104], shinL: [-128], thighR: [30], shinR: [-60], aux: { [BOOM]: 0 } }, air),
  helpless: pose({ armR: [150, 0, 30], foreR: [24], armL: [140, 0, 40], foreL: [26], curve: -10, chest: [-10], head: [-6], thighL: [26, 0, 12], shinL: [-50], thighR: [-6, 0, 10], shinR: [-20], eyes: -0.6, glow: 0.05, aux: { [BOOM]: 0.4, [CABLE]: 0.3 } }, air),
  respawn: pose({ chest: [-2, 0], armR: [20, 0, 14], foreR: [120], armL: [14, 0, 14], foreL: [60], aux: { [BOOM]: 0.5 } }, stance),
  entrance: pose({ y: -0.26, curve: 30, chest: [24, 0], head: [30, 0], armR: [-4, 0, 10], foreR: [20], armL: [0, 0, 16], foreL: [16], eyes: -1, glow: 0, aux: { [BOOM]: 0, [NECK]: -0.05, [NOLEVEL]: 1 } }, stance),
  // the jib raised high and run out, the hook swinging, the gun raised, the beacon going
  win: pose({ y: 0.0, curve: -10, chest: [-6, -4], head: [-12, 16], lean: -3, armR: [192, 0, 14], foreR: [8], handR: [0], armL: [120, 0, 40], foreL: [30], grip: 1, glow: 1, eyes: 1, fL: [0.3, 0], fR: [-0.3, 0], aux: { [BOOM]: 0.5, [NECK]: 0.08 } }, stance),
  // the boom slumped to the deck, the cab hung, the beacon dark
  lose: pose({ curve: 30, chest: [16, 0], head: [32, 0], armR: [-4, 0, 10], foreR: [30], handR: [10], armL: [-4, 0, 14], foreL: [8], y: -0.14, eyes: -0.8, glow: 0, aux: { [BOOM]: 0.6, [CABLE]: 0.2, [NECK]: -0.05, [NOLEVEL]: 1 } }, stance),
  // the signature: low and wide, the boom run out level at chest height with the hook hanging off
  // it like a lance, the gun held up beside the cab with its barrel to the sky (behind the cab
  // from the camera, so nothing crosses the windshield), the cab turned a little to the viewer
  versus: pose({ y: -0.3, curve: 10, lean: 6, chest: [8, -8], hips: [2, -4], head: [-10, 16], counter: -6, armR: [84, 0, 12], foreR: [44], handR: [-30], armL: [16, 0, 34], foreL: [76], handL: [0], grip: 1, glow: 1, eyes: 1, yaw: 16, fL: [0.62, 0], fR: [-0.56, 0], aux: { [BOOM]: 0.45, [HEAT]: 1, [CW_SWING]: 8 } }, stance),
};

// ------------------------------------------------------------------------------------------------
// Moves (bespoke, from the `look` notes in the sim's MoveDefs). R = the boom, L = the rivet gun.
// Each one has its own outline: the jab is an upright arm-only poke, the tilt a long lunge with a
// level lance, the dash attack leans back on its heels, the smash flings the hook out on its
// cable, the grab fires the hook on the line with the boom short, Ballast Swing hangs a block.
// ------------------------------------------------------------------------------------------------

function gantryMoves(def: FighterDef): Partial<Record<MoveId, MoveAnim>> {
  const M = def.moves;
  const st = stance;
  const ar = air;
  const out: Partial<Record<MoveId, MoveAnim>> = {};
  const S = (id: MoveId) => M[id] as MoveDef;

  // Boom Poke: upright, arm only. The boom is drawn in to the shoulder, then one section shoots out
  // level at shoulder height and snaps back. The body barely moves: a machine, not a boxer.
  out.jab = strike(S('jab'), {
    wind: pose({ chest: [-2, 6], lean: -3, x: -0.03, counter: 8, armR: [44, 0, 10], foreR: [128], handR: [-40], aux: { [BOOM]: 0, [CW_SWING]: 8 } }, st),
    strike: pose({ chest: [4, -4], lean: 2, x: 0.03, counter: -6, armR: [90, 0, 4], foreR: [2], handR: [0], aux: { [BOOM]: 0.3, [CW_SWING]: -6 } }, st),
    follow: pose({ chest: [4, -4], lean: 2, x: 0.03, armR: [86, 0, 6], foreR: [8], aux: { [BOOM]: 0.25 } }, st),
    recover: pose({ chest: [4, -2], lean: 1, x: 0.02, armR: [56, 0, 10], foreR: [70], handR: [-20], aux: { [BOOM]: 0.05 } }, st),
    limb: 'handR',
    snap: 1,
    accent: 0.4,
  });

  // Jib Reach: drops its weight and coils the whole boom back past the mast, then a long fencing
  // lunge with the jib run out level at chest height, the back stilt straight: one diagonal from
  // the back foot to the hook. Hard stop, shudder, then the sections reel in.
  out.tilt = strike(S('tilt'), {
    windEarly: pose({ y: -0.1, curve: -4, chest: [-6, 8], lean: -5, x: -0.05, counter: 10, armR: [10, 0, 16], foreR: [130], handR: [-30], aux: { [BOOM]: 0, [CW_SWING]: 10 } }, st),
    wind: pose({ y: -0.17, curve: -10, chest: [-10, 12], lean: -10, x: -0.12, counter: 16, armR: [-34, 0, 18], foreR: [150], handR: [-20], armL: [50, 0, 30], foreL: [60], fL: [0.42, 0], fR: [-0.38, 0], squash: 0.05, aux: { [BOOM]: 0, [CW_SWING]: 18 } }, st),
    strike: pose({ y: -0.24, curve: 6, sway: 0.05, chest: [12, -6], hips: [4, 0], lean: 7, x: 0.16, counter: -12, armR: [114, 0, 4], foreR: [0], handR: [0], armL: [-40, 0, 30], foreL: [30], fL: [0.68, 0], fR: [-0.5, 0.04], aux: { [BOOM]: 1.2, [CW_SWING]: -12 } }, st),
    strikeEnd: pose({ y: -0.25, curve: 7, sway: 0.05, chest: [13, -6], hips: [4, 0], lean: 8, x: 0.17, counter: -12, armR: [114, 0, 4], foreR: [0], handR: [0], armL: [-40, 0, 30], foreL: [30], fL: [0.68, 0], fR: [-0.5, 0.04], aux: { [BOOM]: 1.2, [CW_SWING]: -14 } }, st),
    follow: pose({ y: -0.24, curve: 8, sway: 0.05, chest: [14, -5], lean: 8, x: 0.17, armR: [110, 0, 6], foreR: [4], armL: [-36, 0, 30], foreL: [34], fL: [0.68, 0], fR: [-0.5, 0.04], aux: { [BOOM]: 0.9 } }, st),
    // reeled in: the arm still out level, the sections back in, the lunge held while it rights itself
    recover: pose({ y: -0.2, curve: 8, chest: [10, -2], lean: 5, x: 0.13, armR: [70, 0, 10], foreR: [50], handR: [-20], armL: [-10, 0, 30], foreL: [40], fL: [0.62, 0], fR: [-0.46, 0], aux: { [BOOM]: 0.1, [CW_SWING]: 4 } }, st),
    limb: 'handR',
    accent: 0.8,
  });

  // Hoist Swing: crouched over the boom held low in front, then it is raised through a wide arc
  // overhead like a crane luffing up, the body stretching tall under it
  const ut = M.uptilt.hitboxes[0];
  out.uptilt = strike(S('uptilt'), {
    wind: pose({ y: -0.2, curve: 16, chest: [14, 6], lean: 6, armR: [24, 0, 12], foreR: [20], handR: [-10], squash: 0.06, aux: { [BOOM]: 0.5 } }, st),
    strike: pose({ y: 0.02, curve: -14, chest: [-10, -4], head: [-14], lean: -6, armR: [166, 0, 6], foreR: [6], squash: -0.06, aux: { [BOOM]: 0.8, [RIGID]: 0.6 } }, st),
    follow: pose({ curve: -16, chest: [-12, -4], head: [-14], lean: -6, armR: [192, 0, 8], foreR: [16], aux: { [BOOM]: 0.6 } }, st),
    recover: pose({ y: -0.1, curve: -4, chest: [-2, -2], head: [-8], armR: [140, 0, 14], foreR: [40], aux: { [BOOM]: 0.2 } }, st),
    limb: 'handR',
    reach: [6, 13],
    path: [[-2, ut.x + 1.5, ut.y - 1.1], [0, ut.x + 0.62, ut.y + 0.1], [3, ut.x + 0.1, ut.y + 0.45], [5, ut.x - 0.4, ut.y + 0.38]],
  });

  // Trolley Run: rocks back onto its heels and skates in, toes up, the hook thrust out low in
  // front and the gun arm thrown up behind for balance (a backward-leaning wedge)
  out.dash = strike(S('dash'), {
    wind: pose({ y: -0.14, curve: 10, lean: 6, chest: [10, 6], armR: [-20, 0, 14], foreR: [120], armL: [30, 0, 24], foreL: [60], fL: [0.36, 0], fR: [-0.34, 0], squash: 0.05, aux: { [BOOM]: 0 } }, st),
    strike: pose({ y: -0.3, curve: -14, lean: -16, chest: [-4, -6], head: [10], armR: [56, 0, 6], foreR: [0], armL: [-80, 0, 40], foreL: [30], fL: [0.78, 0], fR: [0.12, 0], footL: [-30], footR: [-20], aux: { [BOOM]: 0.5, [CW_SWING]: -14 } }, st),
    follow: pose({ y: -0.28, curve: -12, lean: -13, chest: [-2, -4], head: [10], armR: [54, 0, 8], foreR: [6], armL: [-70, 0, 40], foreL: [36], fL: [0.74, 0], fR: [0.1, 0], aux: { [BOOM]: 0.4 } }, st),
    recover: pose({ y: -0.2, curve: 0, lean: -4, chest: [4, -2], armR: [44, 0, 12], foreR: [70], armL: [-10, 0, 30], foreL: [50], fL: [0.56, 0], fR: [-0.1, 0], aux: { [BOOM]: 0.1 } }, st),
    limb: 'handR',
    accent: 0.6,
  });

  // Wrecking Swing: the boom cocked back over the top with the hook let out behind it on its
  // cable, the body arched back, then the whole crane whips over: the hook flies out on its cable
  // in line with the boom and lands at the far end, the mast folding over the blow
  const sm = M.smash.hitboxes[0];
  out.smash = strike(S('smash'), {
    windEarly: pose({ y: -0.08, curve: -8, chest: [-8, 8], lean: -5, x: -0.04, counter: 8, armR: [140, 0, 10], foreR: [50], armL: [30, 0, 30], foreL: [60], aux: { [BOOM]: 0.1, [CW_SWING]: -8, [CABLE]: 0.2 }, fL: [0.38, 0], fR: [-0.38, 0] }, st),
    wind: pose({ y: -0.12, curve: -18, chest: [-14, 10], head: [-10], lean: -10, x: -0.1, counter: 14, armR: [204, 0, 8], foreR: [10], handR: [10], armL: [56, 0, 36], foreL: [56], aux: { [BOOM]: 0.5, [CW_SWING]: -16, [CABLE]: 0.55 }, fL: [0.46, 0], fR: [-0.46, 0], squash: -0.04 }, st),
    strike: pose({ y: -0.26, curve: 12, sway: 0.05, chest: [16, -6], hips: [6, 0], lean: 8, x: 0.18, counter: -12, armR: [124, 0, 2], foreR: [0], handR: [0], armL: [-46, 0, 34], foreL: [30], aux: { [BOOM]: 0.8, [CW_SWING]: 16, [CABLE]: 0.25, [RIGID]: 1 }, fL: [0.66, 0], fR: [-0.5, 0.04], squash: 0.05 }, st),
    strikeEnd: pose({ y: -0.27, curve: 13, sway: 0.05, chest: [17, -6], hips: [6, 0], lean: 9, x: 0.19, counter: -12, armR: [122, 0, 2], foreR: [0], handR: [0], armL: [-46, 0, 34], foreL: [30], aux: { [BOOM]: 0.8, [CW_SWING]: 18, [CABLE]: 0.25, [RIGID]: 1 }, fL: [0.66, 0], fR: [-0.5, 0.04], squash: 0.05 }, st),
    // the swing carries on down: the hook drops off the line and swings under the boom
    follow: pose({ y: -0.28, curve: 16, sway: 0.06, chest: [20, -4], lean: 9, x: 0.2, armR: [96, 0, 4], foreR: [6], armL: [-36, 0, 32], foreL: [36], aux: { [BOOM]: 0.7, [CW_SWING]: 8, [CABLE]: 0.45, [RIGID]: 0.2 }, fL: [0.66, 0], fR: [-0.5, 0.04] }, st),
    // hauling the hook back in, shoulders heaving, the boom low over the deck
    recover: pose({ y: -0.22, curve: 10, chest: [10, 0], lean: 3, x: 0.14, armR: [52, 0, 10], foreR: [40], handR: [-10], armL: [10, 0, 30], foreL: [50], aux: { [BOOM]: 0.3, [CABLE]: 0.15 }, fL: [0.6, 0], fR: [-0.46, 0] }, st),
    limb: 'handR',
    reach: [13, 20],
    reachOut: 0,
    path: [[-4, -0.5, 2.7], [-2, 0.5, 3.0], [-1, 1.4, 2.3], [0, sm.x - 0.35, sm.y + 0.12], [3, sm.x - 0.3, sm.y + 0.05]],
    accent: 1.1,
  });

  // Mast Raise: the legs lock straight, the cab rides up its neck, the boom is driven straight up
  out.upsmash = strike(S('upsmash'), {
    wind: pose({ y: -0.26, squash: 0.08, curve: 18, chest: [14, 0], head: [10], lean: 2, armR: [6, 0, 16], foreR: [60], armL: [6, 0, 24], foreL: [40], aux: { [BOOM]: 0, [NECK]: -0.05 } }, st),
    strike: pose({ y: 0.06, squash: -0.12, curve: -10, chest: [-4, 0], head: [-16], armR: [178, 0, 4], foreR: [2], armL: [40, 0, 60], foreL: [20], glow: 1, aux: { [BOOM]: 0.6, [NECK]: 0.16, [RIGID]: 1 } }, st),
    follow: pose({ y: 0.04, squash: -0.08, curve: -12, chest: [-4, 0], head: [-14], armR: [172, 0, 6], foreR: [8], armL: [40, 0, 60], foreL: [24], aux: { [BOOM]: 0.5, [NECK]: 0.12, [RIGID]: 1 } }, st),
    recover: pose({ y: -0.12, curve: 4, chest: [4, 0], head: [-6], armR: [130, 0, 16], foreR: [40], armL: [20, 0, 40], foreL: [40], aux: { [BOOM]: 0.2, [NECK]: 0.03 } }, st),
    limb: 'handR',
    path: [[0, M.upsmash.hitboxes[0].x + 0.05, M.upsmash.hitboxes[0].y + 0.5]],
  });

  // Cable Spin: the jib run out level, the cable let out, the whole crane turns once with the hook
  // flung out round it
  out.nair = strike(S('nair'), {
    wind: pose({ curve: 18, chest: [10], armR: [40, 0, 30], foreR: [80], thighs: [64, 0, 10], shins: [-100], squash: 0.05, aux: { [BOOM]: 0.2 } }, ar),
    strike: pose({ curve: -4, chest: [0], armR: [90, 0, 10], foreR: [0], handR: [0], armL: [70, 0, 60], foreL: [20], thighL: [40, 0, 24], shinL: [-40], thighR: [-20, 0, 24], shinR: [-20], aux: { [BOOM]: 0.45, [CABLE]: 0.35, [RIGID]: 0.9 } }, ar),
    follow: pose({ armR: [70, 0, 20], foreR: [20], thighs: [30, 0, 16], shins: [-50], aux: { [BOOM]: 0.35, [CABLE]: 0.3, [RIGID]: 0.3 } }, ar),
    limb: 'none',
    spinTurns: 1,
  });

  // Boom Sweep: the boom raised high in front and swept down through the front
  const fa = M.fair.hitboxes[0];
  out.fair = strike(S('fair'), {
    wind: pose({ curve: -14, chest: [-12, 6], lean: -8, armR: [170, 0, 10], foreR: [20], armL: [20, 0, 50], foreL: [50], aux: { [BOOM]: 0.3 }, thighL: [30, 0, 10], shinL: [-50], thighR: [0, 0, 10], shinR: [-30] }, ar),
    strike: pose({ curve: 16, chest: [18, -4], lean: 10, armR: [104, 0, 4], foreR: [4], armL: [-30, 0, 50], foreL: [30], aux: { [BOOM]: 1.0 }, thighL: [66, 0, 10], shinL: [-90], thighR: [-20, 0, 10], shinR: [-24] }, ar),
    follow: pose({ curve: 20, chest: [22, -2], lean: 12, armR: [44, 0, 6], foreR: [12], aux: { [BOOM]: 0.7 }, thighL: [60], shinL: [-84], thighR: [-16], shinR: [-26] }, ar),
    limb: 'handR',
    reach: [7, 12],
    path: [[-2, fa.x - 1.1, fa.y + 1.75], [0, fa.x, fa.y + 0.32], [3, fa.x - 0.1, fa.y - 0.3]],
  });

  // Counterweight: tips forward like a seesaw and lets the counterweight swing out behind on its
  // link, the boom thrown forward to balance it
  out.bair = strike(S('bair'), {
    wind: pose({ curve: 10, chest: [-10], lean: -6, armR: [40, 0, 20], foreR: [80], thighs: [64, 0, 8], shins: [-104], aux: { [CW_SWING]: -24, [CW_LEN]: 0 } }, ar),
    strike: pose({ curve: 14, chest: [26], head: [-30], lean: 14, armR: [100, 0, 12], foreR: [10], armL: [70, 0, 40], foreL: [30], thighs: [8, 0, 10], shins: [-24], aux: { [BOOM]: 0.6, [CW_SWING]: 36, [CW_LEN]: 0.74 } }, ar),
    strikeEnd: pose({ curve: 14, chest: [28], head: [-30], lean: 15, armR: [100, 0, 12], foreR: [10], armL: [70, 0, 40], foreL: [30], thighs: [6, 0, 10], shins: [-22], aux: { [BOOM]: 0.6, [CW_SWING]: 42, [CW_LEN]: 0.76 } }, ar),
    follow: pose({ curve: 10, chest: [20], lean: 10, armR: [80, 0, 14], foreR: [30], thighs: [24], shins: [-46], aux: { [BOOM]: 0.4, [CW_SWING]: 20, [CW_LEN]: 0.4 } }, ar),
    limb: 'none',
  });

  // Hook Lift: the hook raised straight overhead and given a hard twist
  out.uair = strike(S('uair'), {
    wind: pose({ curve: 14, chest: [8], armR: [30, 0, 14], foreR: [90], aux: { [BOOM]: 0 }, thighs: [56, 0, 10], shins: [-90] }, ar),
    strike: pose({ curve: -14, chest: [-8], head: [-20], armR: [174, 0, 4], foreR: [4], handR: [0, 80], armL: [40, 0, 60], foreL: [30], aux: { [BOOM]: 0.3, [RIGID]: 1 }, thighL: [36, 0, 12], shinL: [-60], thighR: [-10, 0, 12], shinR: [-20] }, ar),
    strikeEnd: pose({ curve: -14, chest: [-8], head: [-20], armR: [174, 0, 4], foreR: [4], handR: [0, -100], armL: [40, 0, 60], foreL: [30], aux: { [BOOM]: 0.3, [RIGID]: 1 }, thighL: [36, 0, 12], shinL: [-60], thighR: [-10, 0, 12], shinR: [-20] }, ar),
    follow: pose({ curve: -10, chest: [-6], armR: [150, 0, 8], foreR: [24], handR: [0, -60], aux: { [BOOM]: 0.2, [RIGID]: 0.5 } }, ar),
    limb: 'handR',
    path: [[0, M.uair.hitboxes[0].x + 0.05, M.uair.hitboxes[0].y + 0.38]],
  });

  // Stake Drive: the boom lifted, then rammed straight down under the robot, the hook spiking
  out.dair = strike(S('dair'), {
    wind: pose({ curve: -10, chest: [-6], armR: [160, 0, 8], foreR: [30], thighL: [64, 0, 16], shinL: [-104], thighR: [40, 0, 20], shinR: [-80], squash: 0.05, aux: { [BOOM]: 0 } }, ar),
    strike: pose({ curve: 14, chest: [10], head: [16], armR: [-2, 0, 8], foreR: [0], armL: [60, 0, 70], foreL: [20], thighL: [36, 0, 26], shinL: [-60], thighR: [10, 0, 28], shinR: [-34], squash: -0.08, aux: { [BOOM]: 1.2, [RIGID]: 1 } }, ar),
    follow: pose({ curve: 12, chest: [8], armR: [2, 0, 10], foreR: [10], thighs: [30, 0, 20], shins: [-56], aux: { [BOOM]: 0.9, [RIGID]: 0.6 } }, ar),
    limb: 'handR',
  });

  // Hook Grab: the boom stays short and level while the hook is fired out on its cable and reeled
  // straight back in: a thin line with a big hook on the end, not a lance
  out.grab = strike(S('grab'), {
    wind: pose({ chest: [-4, 6], lean: -4, curve: -4, armR: [30, 0, 12], foreR: [100], handR: [-30], aux: { [BOOM]: 0 } }, st),
    strike: pose({ chest: [6, -4], lean: 5, x: 0.06, curve: 4, armR: [88, 0, 4], foreR: [2], handR: [0], armL: [10, 0, 34], foreL: [50], fL: [0.5, 0], fR: [-0.4, 0], aux: { [BOOM]: 0.1, [CABLE]: 0.75, [RIGID]: 1 } }, st),
    follow: pose({ chest: [6, -4], lean: 5, x: 0.06, curve: 4, armR: [88, 0, 4], foreR: [4], armL: [10, 0, 34], foreL: [50], fL: [0.5, 0], fR: [-0.4, 0], aux: { [BOOM]: 0.1, [CABLE]: 0.7, [RIGID]: 1 } }, st),
    // reeled in: the empty hook swings back under the boom, the robot off balance
    recover: pose({ chest: [8, 0], lean: 4, x: 0.05, curve: 8, y: -0.12, armR: [60, 0, 10], foreR: [40], handR: [-10], armL: [10, 0, 34], foreL: [50], fL: [0.46, 0], fR: [-0.38, 0], aux: { [BOOM]: 0, [CABLE]: 0.05 } }, st),
    limb: 'none',
    grip: 0,
    accent: 0.5,
  });

  // the three throws: the held robot hangs on the hook (see carry below)
  const hold = P.hold!;
  // Cargo Sling: hoisted up on the hook, then slung down and forward like loose cargo
  out.throwf = strike(S('throwf'), {
    wind: pose({ curve: -14, chest: [-12, 6], lean: -10, y: -0.12, armR: [140, 0, 6], foreR: [6], aux: { [CW_SWING]: -12, [BOOM]: 0.2 } }, hold),
    strike: pose({ curve: 14, chest: [18, -6], lean: 10, x: 0.12, y: -0.2, armR: [70, 0, 6], foreR: [0], armL: [-40, 0, 34], foreL: [40], fL: [0.62, 0], fR: [-0.46, 0], aux: { [CW_SWING]: 14, [BOOM]: 0.5 } }, hold),
    follow: pose({ curve: 12, chest: [14, -4], lean: 8, x: 0.1, y: -0.18, armR: [56, 0, 8], foreR: [6], fL: [0.62, 0], fR: [-0.46, 0], aux: { [BOOM]: 0.4 } }, hold),
    recover: pose({ curve: 8, chest: [8, -2], lean: 4, x: 0.08, y: -0.14, armR: [44, 0, 12], foreR: [60], fL: [0.56, 0], fR: [-0.42, 0], aux: { [BOOM]: 0.1 } }, hold),
    limb: 'none',
  });
  // Swing Out: swung round over the top on the hook and let go behind, the mast twisting after it
  out.throwb = strike(S('throwb'), {
    wind: pose({ curve: 6, chest: [6, 10], lean: 2, y: -0.12, armR: [80, 0, 6], foreR: [10], aux: { [BOOM]: 0.2 } }, hold),
    strike: pose({ curve: -18, chest: [-16, -14], head: [-14], lean: -12, y: -0.16, x: -0.06, armR: [226, 0, 10], foreR: [6], armL: [60, 0, 50], foreL: [30], aux: { [CW_SWING]: -24, [BOOM]: 0.4 } }, hold),
    follow: pose({ curve: -14, chest: [-12, -10], lean: -9, y: -0.14, armR: [236, 0, 12], foreR: [16], aux: { [BOOM]: 0.3 } }, hold),
    recover: pose({ curve: -4, chest: [-2, -4], lean: -3, y: -0.12, armR: [160, 0, 14], foreR: [50], aux: { [BOOM]: 0.1 } }, hold),
    limb: 'none',
  });
  // Crane Lift: crouches under the load, then stands tall on locked stilts and runs the boom
  // straight up overhead, flicking the load off the top
  out.throwu = strike(S('throwu'), {
    wind: pose({ y: -0.24, curve: 14, chest: [10], lean: -2, squash: 0.06, armR: [104, 0, 6], foreR: [10], aux: { [BOOM]: 0.1 } }, hold),
    strike: pose({ y: 0.04, squash: -0.1, curve: -14, chest: [-10], head: [-20], lean: -4, armR: [176, 0, 6], foreR: [2], armL: [60, 0, 50], foreL: [30], aux: { [NECK]: 0.1, [BOOM]: 0.7, [RIGID]: 1 } }, hold),
    follow: pose({ y: 0.02, curve: -12, chest: [-8], head: [-16], lean: -3, armR: [170, 0, 8], foreR: [8], aux: { [NECK]: 0.06, [BOOM]: 0.6, [RIGID]: 1 } }, hold),
    recover: pose({ y: -0.1, curve: 0, chest: [0], head: [-6], armR: [120, 0, 14], foreR: [40], aux: { [BOOM]: 0.2 } }, hold),
    limb: 'none',
  });

  // Rivet Shot: the boom swings down and plants its hook on the deck ahead like an outrigger, the
  // body drops in behind it, the gun comes up level and spins up hot, the shot kicks the whole mast
  // back and the muzzle up. A braced triangle: body, planted boom, levelled gun.
  const sp = S('special');
  const muzzleX = def.width * 0.5 + 0.4;
  const muzzleY = def.height * 0.62;
  out.special = strike(sp, {
    // the boom swings down and the hook bites the deck ahead; the gun still low at the hip
    windEarly: pose({ y: -0.16, curve: 10, chest: [8, 4], lean: 2, squash: 0.06, armR: [98, 0, 10], foreR: [0], handR: [-30], armL: [10, 0, 24], foreL: [60], aux: { [HEAT]: 0.3, [BOOM]: 0.72, [CW_SWING]: -10 }, fL: [0.46, 0], fR: [-0.42, 0] }, st),
    // dropped in behind the planted boom, the gun up level at the eye line, drum spinning up
    wind: pose({ y: -0.24, curve: 6, chest: [4, 8], head: [4], lean: 0, counter: 8, armL: [96, 0, -12], foreL: [0], armR: [96, 0, 10], foreR: [0], handR: [-30], squash: 0.03, aux: { [HEAT]: 1, [BOOM]: 0.85, [CW_SWING]: -12 }, fL: [0.56, 0], fR: [-0.52, 0] }, st),
    strike: pose({ y: -0.2, curve: -12, chest: [-10, 8], head: [-6], lean: -9, x: -0.16, counter: 4, armL: [110, 0, -10], foreL: [-12], armR: [50, 0, 10], foreR: [0], handR: [-30], aux: { [HEAT]: 0.3, [BOOM]: 0.72, [CW_SWING]: 14 }, fL: [0.56, 0], fR: [-0.52, 0] }, st),
    strikeEnd: pose({ y: -0.2, curve: -10, chest: [-8, 8], head: [-4], lean: -8, x: -0.16, armL: [104, 0, -10], foreL: [-6], armR: [52, 0, 10], foreR: [0], handR: [-30], aux: { [HEAT]: 0.2, [BOOM]: 0.72, [CW_SWING]: 12 }, fL: [0.56, 0], fR: [-0.52, 0] }, st),
    follow: pose({ y: -0.18, curve: -2, chest: [-2, 6], lean: -4, x: -0.1, armL: [88, 0, -6], foreL: [10], armR: [60, 0, 12], foreR: [4], handR: [-20], aux: { [HEAT]: 0, [BOOM]: 0.6, [CW_SWING]: 2 }, fL: [0.56, 0], fR: [-0.52, 0] }, st),
    // the boom lifts off the deck, the gun drops to the hip
    recover: pose({ y: -0.12, curve: 4, chest: [4, 2], lean: 0, x: -0.06, armL: [40, 0, 20], foreL: [50], armR: [30, 0, 14], foreR: [70], handR: [-20], aux: { [HEAT]: 0, [BOOM]: 0.2 }, fL: [0.46, 0], fR: [-0.42, 0] }, st),
    limb: 'handL',
    reach: [12, sp.startup + sp.active + 8],
    reachOut: 0,
    path: [[-3, muzzleX - 0.25, muzzleY - 0.05], [-1, muzzleX, muzzleY], [0, muzzleX, muzzleY], [1, muzzleX - 0.22, muzzleY + 0.32], [4, muzzleX - 0.14, muzzleY + 0.16], [9, muzzleX - 0.06, muzzleY + 0.02]],
    snap: 1,
    accent: 0.4,
  });

  // the startup in four beats instead of one held aim: heave the boom up, slam it down on the deck,
  // brace behind it with the gun coming up, level the gun and let the drum spin up
  {
    const heave = pose({ y: 0.0, curve: -8, chest: [-6, 4], head: [-8], lean: -2, armR: [206, 0, 10], foreR: [12], handR: [0], armL: [0, 0, 26], foreL: [70], aux: { [HEAT]: 0.2, [BOOM]: 0.25, [CW_SWING]: 10 }, fL: [0.4, 0], fR: [-0.36, 0] }, st);
    const plant = pose({ y: -0.24, curve: 16, chest: [12, 4], head: [8], lean: 3, squash: 0.09, armR: [104, 0, 10], foreR: [0], handR: [-30], armL: [10, 0, 26], foreL: [64], aux: { [HEAT]: 0.4, [BOOM]: 0.95, [CW_SWING]: -14 }, fL: [0.5, 0], fR: [-0.46, 0] }, st);
    const brace = pose({ y: -0.22, curve: 10, chest: [8, 6], head: [2], lean: 1, squash: 0.04, armR: [98, 0, 10], foreR: [0], handR: [-30], armL: [70, 0, -10], foreL: [30], aux: { [HEAT]: 0.7, [BOOM]: 0.9, [CW_SWING]: -12 }, fL: [0.56, 0], fR: [-0.52, 0] }, st);
    const keys = out.special.keys;
    const aim = keys[2].pose;
    const k: Key[] = [
      { f: 4, pose: heave, ease: ease.outCubic },
      { f: 7, pose: plant, ease: ease.inQuad },
      { f: 10.5, pose: brace, ease: ease.outCubic },
      { f: 14, pose: aim, ease: ease.inOutSine },
    ];
    out.special.keys = [keys[0], ...k, ...keys.slice(3)];
  }

  // Ballast Swing: the counterweight unhooked onto the hook, hoisted back over the shoulder, then
  // swung low and long on the let-out cable, the robot crouched under the weight
  const bs = M.special2.hitboxes[0];
  out.special2 = strike(S('special2'), {
    windEarly: pose({ y: -0.06, curve: -6, chest: [-6, 6], lean: -3, armR: [200, 0, 16], foreR: [30], armL: [-30, 0, 30], foreL: [100], aux: { [BOOM]: 0.1, [CABLE]: 0.1 } }, st),
    wind: pose({ y: -0.16, curve: -16, chest: [-14, 10], head: [-10], lean: -10, x: -0.1, counter: 12, armR: [150, 0, 10], foreR: [10], armL: [20, 0, 34], foreL: [60], aux: { [BOOM]: 0.6, [CABLE]: 0.45, [CW_SWING]: 0 }, fL: [0.48, 0], fR: [-0.46, 0], squash: 0.05 }, st),
    strike: pose({ y: -0.34, curve: 14, sway: 0.06, chest: [16, -6], lean: 8, x: 0.18, counter: -12, armR: [112, 0, 4], foreR: [0], armL: [-40, 0, 34], foreL: [30], aux: { [BOOM]: 0.6, [CABLE]: 0.4, [RIGID]: 1 }, fL: [0.72, 0], fR: [-0.54, 0.04] }, st),
    strikeEnd: pose({ y: -0.35, curve: 15, sway: 0.06, chest: [17, -6], lean: 9, x: 0.19, counter: -12, armR: [110, 0, 4], foreR: [0], armL: [-40, 0, 34], foreL: [30], aux: { [BOOM]: 0.6, [CABLE]: 0.4, [RIGID]: 1 }, fL: [0.72, 0], fR: [-0.54, 0.04] }, st),
    follow: pose({ y: -0.32, curve: 16, chest: [18, -4], lean: 9, x: 0.18, armR: [96, 0, 6], foreR: [6], armL: [-30, 0, 32], foreL: [36], aux: { [BOOM]: 0.5, [CABLE]: 0.4, [RIGID]: 0.3 }, fL: [0.72, 0], fR: [-0.54, 0.04] }, st),
    recover: pose({ y: -0.24, curve: 10, chest: [10, 0], lean: 3, x: 0.14, armR: [60, 0, 10], foreR: [30], armL: [0, 0, 30], foreL: [50], aux: { [BOOM]: 0.3, [CABLE]: 0.25 }, fL: [0.64, 0], fR: [-0.5, 0] }, st),
    limb: 'handR',
    reach: [20, 31],
    reachOut: 0,
    path: [[-3, 0.6, 2.6], [-1, 1.1, 1.5], [0, bs.x - 1.3, bs.y + 0.2], [4, bs.x - 1.25, bs.y + 0.15], [8, bs.x - 1.6, bs.y + 0.3]],
    accent: 1,
  });

  // Grapple Line: the boom aimed up at the ledge, the hook fired out on its line, the body reeled
  // up after it, stretched along the cable with the stilts trailing
  const rc = M.recover.hitboxes[0];
  out.recover = strike(S('recover'), {
    wind: pose({ curve: 16, chest: [6], armR: [90, 0, 12], foreR: [70], armL: [20, 0, 30], foreL: [60], thighs: [62, 0, 10], shins: [-104], squash: 0.05, aux: { [BOOM]: 0 } }, ar),
    strike: pose({ curve: -14, chest: [-10], head: [-16], lean: -4, armR: [140, 0, 6], foreR: [4], armL: [-20, 0, 40], foreL: [50], thighL: [10, 0, 10], shinL: [-20], thighR: [-16, 0, 10], shinR: [-8], feet: [-30], stretch: 0.08, lineAng: 40, aux: { [BOOM]: 0.5 } }, ar),
    strikeEnd: pose({ curve: -10, chest: [-6], head: [-12], lean: -2, armR: [136, 0, 6], foreR: [6], armL: [-10, 0, 40], foreL: [50], thighL: [20, 0, 10], shinL: [-40], thighR: [-6, 0, 10], shinR: [-16], stretch: 0.06, lineAng: 40, aux: { [BOOM]: 0.3 } }, ar),
    follow: pose({ curve: -4, chest: [0], armR: [120, 0, 10], foreR: [30], thighs: [30, 0, 10], shins: [-50], aux: { [BOOM]: 0.2 } }, ar),
    recover: pose({ curve: -4, chest: [0], armR: [110, 0, 14], foreR: [50], armL: [30, 0, 40], foreL: [40], thighL: [30, 0, 10], shinL: [-56], thighR: [0, 0, 10], shinR: [-24], eyes: -0.3, aux: { [BOOM]: 0.1 } }, ar),
    limb: 'handR',
    reach: [8, 32],
    path: [[0, rc.x - 0.2, rc.y + 0.35], [22, rc.x - 0.25, rc.y + 0.3]],
  });
  return out;
}

// where a held robot hangs on Gantry's hook, and how it travels through each throw
const carry: CarryFn = (move, f, def, o) => {
  const h = def.height;
  o.x = 1.3;
  o.y = h * 0.6;
  o.spin = 0;
  if (!move || move === 'grab' || move === 'special') return;
  const md = def.moves[move];
  const rel = md.hitboxes[0]?.from ?? md.startup + 1;
  const t = Math.min(1, Math.max(0, f / rel));
  if (move === 'throwu') {
    // dipped as it crouches, then run straight up the mast and flicked off the top
    const dip = ease.inOutSine(Math.min(1, t / 0.45));
    const up = ease.inCubic(Math.max(0, (t - 0.45) / 0.55));
    o.x = 1.3 - 0.15 * dip - 0.75 * up;
    o.y = h * (0.6 - 0.08 * dip + 1.0 * up);
    o.spin = -14 * up;
  } else if (move === 'throwb') {
    // a swing round over the top, let go behind
    const a = Math.PI * 1.12 * ease.inOutCubic(t);
    const R = 1.3;
    o.x = Math.cos(a) * R;
    o.y = h * 0.6 + Math.sin(a) * R * 0.9;
    o.spin = -200 * ease.inOutCubic(t);
  } else {
    // hoisted high on the hook, then slung down and forward
    const lift = ease.inOutSine(Math.min(1, t / 0.65));
    const sling = ease.inQuad(Math.max(0, (t - 0.65) / 0.35));
    o.x = 1.3 - 0.4 * lift + 1.1 * sling;
    o.y = h * (0.6 + 0.42 * lift - 0.4 * sling);
    o.spin = 12 * lift - 50 * sling;
  }
};

// the match result on the deck: snaps into the pose in a few frames, then the crane signals
const actions: RobotSpec['actions'] = {
  win(a, o) {
    const f = a.f;
    mixInto(o, a.P.stance, a.P.win, ease.outBack(clamp01((f + 6) / 12)));
    const t = a.t;
    o[C.aux + BOOM] = 0.15 + 0.35 * ease.outCubic(clamp01((f + 4) / 24));
    o[J.armR * 3] += Math.sin(t * 3.1) * 6 * DEG;
    o[J.armL * 3] += Math.abs(Math.sin(t * 3.1)) * 12 * DEG;
    o[C.y] += Math.abs(Math.sin(t * 3.1)) * 0.025;
  },
  lose(a, o) {
    mixInto(o, a.P.stance, a.P.lose, ease.inOutSine(clamp01((a.f + 8) / 20)));
    o[J.chest * 3] += Math.sin(a.t * 1.3) * 1.5 * DEG;
  },
};

// ------------------------------------------------------------------------------------------------
// Screens
// ------------------------------------------------------------------------------------------------

let lastShow: ShowName | null = null;

function idleBreath(o: Pose, t: number, d: number): void {
  const w = Math.sin(t * Math.PI * 2 * 0.5);
  const w2 = Math.sin(t * Math.PI * 2 * 0.25 + 1.3);
  o[C.y] += w * 0.01 * d;
  o[J.chest * 3] += w * 1.6 * DEG * d;
  o[J.armR * 3] += w2 * 3 * DEG * d;
  o[J.foreR * 3] += w * 2 * DEG * d;
  o[J.hips * 3 + 2] += w2 * 1.5 * DEG * d;
  o[C.aux + BOOM] += (0.5 + 0.5 * w2) * 0.1 * d;
}

/** Screens put the robot in scaled holders, where the rig's world-space foot IK misses the floor.
 *  So the screen poses stand on leg angles instead: a planar two-bone solve from each foot target
 *  (fL / fR, forward of the root) to the hip, soles kept flat, then plant = 0. */
const HIP_REST = BODY.ankle + BODY.shin + BODY.thigh;
function standOnAngles(o: Pose): void {
  const L = o[C.lean];
  const H = HIP_REST + o[C.y];
  const hx = o[C.x] + H * Math.sin(L);
  const hy = H * Math.cos(L);
  const hipP = o[J.hips * 3] + o[C.curve] * 0.2;
  const a = BODY.thigh;
  const b = BODY.shin;
  for (let i = 0; i < 2; i++) {
    const fx = i === 0 ? o[C.fLx] : o[C.fRx];
    const fy = i === 0 ? o[C.fLy] : o[C.fRy];
    const dx = fx - hx;
    const dy = BODY.ankle + fy - hy;
    let D = Math.hypot(dx, dy);
    D = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, D));
    const a0 = Math.atan2(dx, -dy);
    const A = Math.acos(Math.max(-1, Math.min(1, (a * a + D * D - b * b) / (2 * a * D))));
    const K = Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - D * D) / (2 * a * b))));
    const thighW = a0 + A;
    const shinW = thighW - (Math.PI - K);
    const th = i === 0 ? J.thighL : J.thighR;
    const sh = i === 0 ? J.shinL : J.shinR;
    const ft = i === 0 ? J.footL : J.footR;
    o[th * 3] = thighW - L - hipP;
    o[th * 3 + 2] = 3 * DEG;
    o[sh * 3] = shinW - thighW;
    o[ft * 3] = -shinW;
  }
  o[C.plant] = 0;
}

const show: RobotSpec['show'] = {
  select(t, o, Pz) {
    lastShow = 'select';
    copyPose(o, Pz.stance);
    o[C.y] = -0.1;
    // stand a little above the bay floor so the outrigger feet clear the card's rule
    o[C.fLy] = 0.12;
    o[C.fRy] = 0.12;
    // the bay is a turntable; Gantry sways on it instead of turning its back: the rig turns the
    // body by -0.9 t, the pose's yaw takes that back out and leaves a slow sway round the
    // three-quarter view, so the cab and its eyes always face out of the card
    o[C.yaw] = -t * 0.9 + Math.sin(t * 0.7) * 0.42 - 0.12;
    idleBreath(o, t, 1);
    standOnAngles(o);
  },
  versus(t, o, Pz) {
    lastShow = 'versus';
    const u = Math.min(1, t / 0.5);
    mixInto(o, Pz.stance, Pz.versus, ease.outBack(u));
    idleBreath(o, t, 0.5);
    o[J.armL * 3] -= Math.sin(t * Math.PI * 2 * 0.5) * 1.5 * DEG;
    standOnAngles(o);
  },
  wait(t, o, Pz) {
    lastShow = 'wait';
    copyPose(o, Pz.stance);
    idleBreath(o, t, 1);
  },
  win(t, o, Pz) {
    lastShow = 'win';
    const u = Math.min(1, t / 0.7);
    mixInto(o, Pz.stance, Pz.win, ease.outBack(u));
    // the boom runs out section by section after it is raised
    o[C.aux + BOOM] = 0.1 + 0.4 * ease.outCubic(Math.min(1, Math.max(0, (t - 0.25) / 0.6)));
    // the jib dips and rises like a crane signalling, the gun arm pumps
    o[J.armR * 3] += Math.sin(t * 3.1) * 6 * DEG;
    o[J.armL * 3] += Math.abs(Math.sin(t * 3.1)) * 12 * DEG;
    standOnAngles(o);
  },
  lose(t, o, Pz) {
    lastShow = 'lose';
    const u = Math.min(1, t / 1.0);
    mixInto(o, Pz.stance, Pz.lose, ease.inOutSine(u));
    standOnAngles(o);
  },
};

// ------------------------------------------------------------------------------------------------
// Per-frame extras: which arm is the boom, the telescoping, the hook, the counterweight, the cab
// ------------------------------------------------------------------------------------------------

let ARENA: ArenaDef | null = null;
let DEF: FighterDef | null = null;
/** the frames each boom strike's IK owns the boom (as the rig computes them), so the pose's own
 *  extension hands over to the IK and back without overshooting the hitbox */
const REACH: Partial<Record<MoveId, { from: number; to: number; hold: number }>> = {};

function reachTable(def: FighterDef, moves: Partial<Record<MoveId, MoveAnim>>): void {
  for (const id of Object.keys(moves) as MoveId[]) {
    const ma = moves[id]!;
    if (ma.limb !== 'handR') continue;
    const md = def.moves[id];
    let from = ma.reach ? ma.reach[0] : Infinity;
    let to = ma.reach ? ma.reach[1] : -Infinity;
    if (!ma.reach) for (const hb of md.hitboxes) {
      from = Math.min(from, hb.from);
      to = Math.max(to, hb.to);
    }
    if (isFinite(from)) REACH[id] = { from, to, hold: ma.reach ? 0 : 2 };
  }
}

/** the rig's IK weight for the boom at frame f of a move (0 outside its reach window); the same
 *  ramp as the rig's computeReach: in over 1.3 frames, held 2 past the hitbox, out over 4 */
function reachWeight(id: MoveId, f: number): number {
  const r = REACH[id];
  if (!r) return 0;
  if (f < r.from - 1.3) return 0;
  if (f < r.from) return ease.inQuad(clamp01((f - (r.from - 1.3)) / 1.3));
  if (f <= r.to + r.hold) return 1;
  return 1 - ease.outQuad(clamp01((f - r.to - r.hold) / 4));
}

interface GParts {
  yaw: THREE.Object3D;
  head: THREE.Object3D;
  chest: THREE.Object3D;
  arm: [THREE.Object3D, THREE.Object3D];
  fore: [THREE.Object3D, THREE.Object3D];
  hand: [THREE.Object3D, THREE.Object3D];
  boomUp: [THREE.Object3D, THREE.Object3D];
  boomFore: [THREE.Object3D, THREE.Object3D];
  boomHand: [THREE.Object3D, THREE.Object3D];
  gunUp: [THREE.Object3D, THREE.Object3D];
  gunFore: [THREE.Object3D, THREE.Object3D];
  gunHand: [THREE.Object3D, THREE.Object3D];
  sec: [THREE.Object3D[], THREE.Object3D[]];
  hook: [THREE.Object3D, THREE.Object3D];
  ballast: [THREE.Object3D, THREE.Object3D];
  cable: [THREE.Object3D, THREE.Object3D];
  muzzle: [THREE.Object3D, THREE.Object3D];
  rod: [THREE.Object3D, THREE.Object3D];
  cwPivot: THREE.Object3D;
  cwRod: THREE.Object3D;
  cwBlock: THREE.Object3D;
  extra: ExtraMats;
  eyeU: Record<string, { value: number }> | null;
  // hook pendulum
  th: number;
  om: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  live: boolean;
  lastT: number;
  lastBi: number;
}
const partsOf = new WeakMap<RigHandles, GParts>();

const LEVEL_OFF = new Set(['hitstun', 'knockdown', 'getup', 'roll', 'held', 'dead', 'airdodge', 'shieldbreak', 'ledgeclimb']);
/** the hard stop: how far the boom overshoots and rings on the first active frame, metres */
const SHUDDER: Partial<Record<MoveId, number>> = { jab: 0.08, tilt: 0.2, dash: 0.1, smash: 0.18, fair: 0.12, dair: 0.14, uptilt: 0.1, upsmash: 0.12, special2: 0.16 };

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const ZAX = new THREE.Vector3(0, 0, 1);
const DOWN = new THREE.Vector3(0, -1, 0);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const OFFS = new Float32Array(SECTIONS);

function setupParts(h: RigHandles): GParts {
  const two = (n: string): [THREE.Object3D, THREE.Object3D] => [h.part(`${n}L`), h.part(`${n}R`)];
  const secs = (sd: string) => Array.from({ length: SECTIONS }, (_, i) => h.part(`sec${sd}${i + 1}`));
  return {
    yaw: h.part('yaw'),
    head: h.joint('head'),
    chest: h.joint('chest'),
    arm: [h.joint('armL'), h.joint('armR')],
    fore: [h.joint('foreL'), h.joint('foreR')],
    hand: [h.joint('handL'), h.joint('handR')],
    boomUp: two('boomUp'),
    boomFore: two('boomFore'),
    boomHand: two('boomHand'),
    gunUp: two('gunUp'),
    gunFore: two('gunFore'),
    gunHand: two('gunHand'),
    sec: [secs('L'), secs('R')],
    hook: two('hook'),
    ballast: two('ballast'),
    cable: two('cable'),
    muzzle: two('muzzle'),
    rod: two('rod'),
    cwPivot: h.part('cwPivot'),
    cwRod: h.part('cwRod'),
    cwBlock: h.part('cwBlock'),
    extra: extraOf.get(h.mats.paint)!,
    eyeU: findEyes(h.joint('head')),
    th: 0,
    om: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    live: false,
    lastT: 0,
    lastBi: -1,
  };
}

/** the face panel's uniforms (the rig's eye shader), found once under the cab */
function findEyes(head: THREE.Object3D): Record<string, { value: number }> | null {
  let u: Record<string, { value: number }> | null = null;
  head.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (!u && m && (m as THREE.ShaderMaterial).isShaderMaterial && m.uniforms && m.uniforms.uOpen) u = m.uniforms as Record<string, { value: number }>;
  });
  return u;
}

function update(h: RigHandles, p: Pose, s: FighterState | null, info: FrameInfo): void {
  let g = partsOf.get(h);
  if (!g) {
    g = setupParts(h);
    partsOf.set(h, g);
  }
  let dt = info.t - g.lastT;
  g.lastT = info.t;
  if (!(dt > 0) || dt > 0.1) dt = 0;
  const attacking = !!s && s.action === 'attack' && !!info.move;
  // a screen that grabs a single frame at t = 0 (the HUD portrait) must not catch a blink
  if (!s && info.t < 0.1 && lastShow === 'select' && g.eyeU) g.eyeU.uOpen.value = Math.max(g.eyeU.uOpen.value, 0.27);

  // ---- which arm plays the boom (the pose is mirrored when the robot faces left)
  let right: boolean;
  // by the body's yaw (the arm toward the camera), so a strike started mid-turn still swings the
  // near arm; only the spin keeps its arm through the turn
  if (s) right = s.action === 'attack' && info.move === 'nair' ? s.facing > 0 : Math.cos(g.yaw.rotation.y) >= 0;
  else right = lastShow === 'select' ? true : Math.cos(g.yaw.rotation.y) >= 0;
  const bi = right ? 1 : 0;
  const gi = 1 - bi;
  if (bi !== g.lastBi) {
    g.lastBi = bi;
    g.live = false;
    for (let i = 0; i < 2; i++) {
      const boom = i === bi;
      g.boomUp[i].visible = boom;
      g.boomFore[i].visible = boom;
      g.boomHand[i].visible = boom;
      g.gunUp[i].visible = !boom;
      g.gunFore[i].visible = !boom;
      g.gunHand[i].visible = !boom;
    }
  }
  g.rod[bi].visible = false;
  g.rod[gi].visible = h.stretch[gi] > 0.01;

  // ---- the cab stays level and rides its neck
  const neck = p[C.aux + NECK];
  g.head.position.y = BODY.neckY + neck;
  let lw = 0.85;
  if (s) {
    if (LEVEL_OFF.has(s.action) || (s.action === 'attack' && info.move === 'nair')) lw = 0;
    else if (s.action === 'attack') lw = 0.7;
  }
  lw *= 1 - clamp01(p[C.aux + NOLEVEL]);
  if (lw > 0.01) {
    g.chest.getWorldQuaternion(_q1);
    _q2.setFromAxisAngle(YUP, g.yaw.rotation.y);
    _q3.copy(_q1).invert().multiply(_q2).multiply(g.head.quaternion);
    g.head.quaternion.slerp(_q3, lw);
  }
  g.head.updateMatrixWorld(true);

  // ---- Rivet Shot: the boom is planted on the deck ahead as an outrigger. The keyed arm would
  // drift with the body's recoil and springs, so it is solved onto a fixed spot on the deck
  let plantW = 0;
  let plantExt = 0;
  if (attacking && info.move === 'special' && s) {
    const f = info.f;
    plantW = f < 5.5 ? 0 : f < 7.2 ? ease.outCubic((f - 5.5) / 1.7) : f < 24 ? 1 : 1 - ease.inOutSine(clamp01((f - 24) / 7));
    if (plantW > 0.001) {
      const arm = g.arm[bi];
      arm.parent!.updateMatrixWorld(true);
      arm.getWorldPosition(_v1);
      const fc = s.facing;
      _v2.set(h.root.position.x + fc * 1.6, h.root.position.y + 0.8, _v1.z);
      _v3.set(_v1.x - fc * 0.6, _v1.y + 1.2, _v1.z);
      plantExt = solveTwoBone(arm, g.fore[bi], BODY.upperArm, BODY.forearm + 0.1, _v2, _v3, plantW, BODY.armStretch);
      arm.updateMatrixWorld(true);
    }
  }

  // ---- the boom: the IK's extension (it carries its own weight) plus the pose's extension for
  // the rest, plus the hard stop: an overshoot that rings out over a few frames
  const rw = attacking ? reachWeight(info.move!, info.f) : 0;
  let ext = h.stretch[bi] + (1 - rw) * Math.max(0, p[C.aux + BOOM]);
  let shud = 0;
  if (attacking && DEF) {
    const amp = SHUDDER[info.move!];
    if (amp) {
      const md = DEF.moves[info.move!];
      let first = md.startup + 1;
      for (const hb of md.hitboxes) first = Math.min(first, hb.from);
      const u = info.f - first;
      if (u >= 0 && u < 12) shud = amp * Math.exp(-u / 3.2) * Math.cos(u * 2.3);
    }
  }
  if (plantW > 0) ext = ext * (1 - plantW) + plantExt;
  ext = Math.max(0, Math.min(BODY.armStretch + 0.3, ext + shud));
  const hand = g.hand[bi];
  hand.position.y = -BODY.forearm - ext;
  // tip section first, then the next one back
  let left = ext;
  const offs = OFFS;
  for (let i = SECTIONS - 1; i >= 0; i--) {
    const o = Math.min(left, SEC_TRAVEL);
    offs[i] = o;
    left -= o;
  }
  offs[SECTIONS - 1] += Math.max(0, left);
  let end = -BODY.forearm;
  const secs = g.sec[bi];
  for (let i = 0; i < SECTIONS; i++) {
    end -= offs[i];
    secs[i].position.y = end;
    secs[i].visible = end < -BODY.forearm - 0.004;
  }
  g.fore[bi].updateMatrixWorld(true);

  // ---- the counterweight slides back as the boom goes out, and swings for Counterweight
  const ballast = attacking && info.move === 'special2';
  g.cwPivot.visible = !ballast;
  g.ballast[bi].visible = ballast;
  g.ballast[gi].visible = false;
  g.cwPivot.position.x = CW_X - 0.16 * clamp01(ext / BODY.armStretch) - shud * 0.5;
  g.cwPivot.rotation.z = -p[C.aux + CW_SWING] * DEG;
  const cl = CW_LEN0 + Math.max(0, p[C.aux + CW_LEN]);
  g.cwRod.scale.y = cl;
  g.cwBlock.position.y = -cl;

  // ---- the hook: on its cable below the sheave head. It hangs and swings (a pendulum driven by
  // the head's motion), is flung out in line with the boom (RIGID, or when the boom points up),
  // and flies out on its line for Grapple Line
  const hook = g.hook[bi];
  const cable = g.cable[bi];
  g.hook[gi].position.set(0, HOOK_PIVOT, 0);
  g.cable[gi].visible = false;
  hand.localToWorld(_v1.set(0, HOOK_PIVOT, 0));
  const e = hand.matrixWorld.elements;
  const ly = Math.hypot(e[4], e[5], e[6]) || 1;
  const boomUp = -e[5] / ly; // + when the boom points up
  const cableLen = Math.max(0, p[C.aux + CABLE]);
  let flying = false;
  if (s && attacking && info.move === 'recover' && info.f >= 9 && ARENA) {
    const f = info.f;
    const out = f < 31 ? ease.outCubic(clamp01((f - 9) / 4)) : 1 - ease.inCubic(clamp01((f - 31) / 6));
    if (out > 0.01) {
      flying = true;
      // a free ledge in range that the sim is actually reeling us toward (it sets the velocity
      // along the line), or else straight out along the boom
      let tx = 0;
      let ty = 0;
      let tethered = false;
      const sp = Math.hypot(s.vx, s.vy);
      if (!s.grounded && sp > 0.05) {
        for (let li = 0; li < 2; li++) {
          const lx = li === 0 ? ARENA.main.x0 : ARENA.main.x1;
          const dx = lx - s.x;
          const dy = ARENA.main.y - s.y;
          const d = Math.hypot(dx, dy);
          if (d > 0.2 && d <= 6.5 && (dx * s.vx + dy * s.vy) / (d * sp) > 0.85) {
            // the ledge, put in the same frame as the hook pivot (screens and sheets move robots)
            tx = h.root.position.x + dx;
            ty = h.root.position.y + dy + 0.08;
            tethered = true;
          }
        }
      }
      if (!tethered) {
        tx = _v1.x - (e[4] / ly) * 3.0;
        ty = _v1.y - (e[5] / ly) * 3.0;
      }
      _v2.set(_v1.x + (tx - _v1.x) * out, _v1.y + (ty - _v1.y) * out, _v1.z * (1 - out));
      hand.worldToLocal(_v2);
      _v3.set(_v2.x, _v2.y - HOOK_PIVOT, _v2.z);
      const len = _v3.length();
      if (len > 0.02) {
        _v3.multiplyScalar(1 / len);
        hook.position.copy(_v2);
        hook.quaternion.setFromUnitVectors(DOWN, _v3);
        cable.visible = true;
        cable.quaternion.copy(hook.quaternion);
        cable.scale.set(1, len, 1);
      } else flying = false;
      g.th = 0;
      g.om = 0;
      g.live = false;
    }
  }
  if (!flying) {
    // pendulum in the picture plane, driven by the pivot's acceleration
    const L = 0.36 + cableLen;
    if (dt > 0 && g.live) {
      let vx = (_v1.x - g.px) / dt;
      let vy = (_v1.y - g.py) / dt;
      if (Math.abs(_v1.x - g.px) > 1 || Math.abs(_v1.y - g.py) > 1) {
        vx = 0;
        vy = 0;
        g.vx = 0;
        g.vy = 0;
      }
      let ax = (vx - g.vx) / dt;
      let ay = (vy - g.vy) / dt;
      ax = Math.max(-90, Math.min(90, ax));
      ay = Math.max(-60, Math.min(60, ay));
      g.vx = vx;
      g.vy = vy;
      const n = Math.max(1, Math.ceil(dt * 240));
      const hdt = dt / n;
      for (let i = 0; i < n; i++) {
        const acc = -((9.8 + ay) / L) * Math.sin(g.th) - (ax / L) * Math.cos(g.th) - 3.2 * g.om;
        g.om += acc * hdt;
        g.th += g.om * hdt;
      }
      g.th = Math.max(-1.7, Math.min(1.7, g.th));
    } else if (!g.live || dt === 0) {
      g.vx = 0;
      g.vy = 0;
      if (dt === 0) {
        g.th = 0;
        g.om = 0;
      }
    }
    g.px = _v1.x;
    g.py = _v1.y;
    g.live = dt > 0;
    // hang: world rotation = swing about z, after the body's facing yaw
    _q2.setFromAxisAngle(YUP, g.yaw.rotation.y);
    _q1.setFromAxisAngle(ZAX, g.th).multiply(_q2);
    hand.getWorldQuaternion(_q3);
    _q3.invert().multiply(_q1);
    const rigid = Math.max(clamp01((boomUp - 0.25) / 0.4), clamp01(p[C.aux + RIGID]));
    if (rigid > 0) {
      // in line with the boom: the forearm's frame, seen from the hand
      hand.getWorldQuaternion(_q1).invert();
      g.fore[bi].getWorldQuaternion(_q2);
      _q1.multiply(_q2);
      _q3.slerp(_q1, rigid);
    }
    hook.quaternion.copy(_q3);
    // the hook block rides down its cable along the hang direction
    _v3.copy(DOWN).applyQuaternion(_q3);
    hook.position.set(_v3.x * cableLen, HOOK_PIVOT + _v3.y * cableLen, _v3.z * cableLen);
    cable.visible = cableLen > 0.04;
    if (cable.visible) {
      cable.quaternion.copy(_q3);
      cable.scale.set(1, cableLen + 0.02, 1);
    }
  }

  // ---- cab, beacon, gun
  const glow = p[C.glow];
  let beat = Math.max(0, Math.sin(info.t * 4.4));
  if (s && s.action === 'hitstun') beat = Math.max(0, Math.sin(info.t * 14));
  const blink = glow > 0.05 ? Math.pow(beat, 10) * (2.2 + glow * 2) : 0;
  g.extra.beacon.emissiveIntensity = (glow < 0.02 ? 0.1 : 0.6 + Math.max(0, glow) * 1.0) + blink + (info.charge > 0 ? info.charge * 2.5 : 0);
  let heat = clamp01(p[C.aux + HEAT]);
  if (attacking && info.move === 'special') {
    // the drum spins up hot through the startup
    const f = info.f;
    if (f <= 15) heat = Math.max(heat, clamp01(f / 14) * (0.85 + 0.15 * Math.sin(f * 2.2)));
  }
  h.mats.glow.emissiveIntensity = 0.5 + heat * 3;
  // the muzzle flash: the shot frame and two after it
  let mz = 0;
  if (attacking && info.move === 'special') {
    const u = info.f - 15;
    if (u >= -0.5 && u < 2.5) mz = 1 - clamp01(u / 2.5);
  }
  const muzzle = g.muzzle[gi];
  g.muzzle[bi].visible = false;
  muzzle.visible = mz > 0.05;
  if (muzzle.visible) {
    const k = 0.6 + 0.8 * mz;
    muzzle.scale.set(k, 0.5 + 1.2 * mz, k);
    g.extra.flash.opacity = Math.min(1, mz * 1.4);
  }
}

// ------------------------------------------------------------------------------------------------

function spec(def: FighterDef): RobotSpec {
  const moves = gantryMoves(def);
  reachTable(def, moves);
  return {
    id: 'gantry',
    body: BODY,
    palette: {
      // crane orange over a deep blue graphite, a white cab and bands, bright steel hook, amber
      // eye-lamps (a colour no other robot has), a cool rim against the warm paint
      paint: ORANGE,
      paint2: '#283244',
      trim: '#dfe5ec',
      dark: '#3c4656',
      glow: '#ff9a2a',
      eye: '#ffd23c',
      rim: '#9fd6ff',
      // mirror match: a white crane with orange bands and an orange cab, warm rim
      alt: { paint: '#eef1f4', paint2: '#2c3a4e', rim: '#ffc27a' },
    },
    gait: {
      walkCycle: 2.4, walkDuty: 0.6, walkLift: 0.18, walkBob: 0.04, walkSwing: 10, walkLean: 4,
      runCycle: 4.0, runDuty: 0.34, runLift: 0.36, runBob: 0.08, runSwing: 22, runLean: 12,
      breathRate: 0.5, breathDepth: 0.9,
      turnFrames: 7,
    },
    threeQuarter: 30,
    headLevel: 0.85,
    build,
    poses: P,
    moves,
    carry,
    actions,
    show,
    update,
  };
}

let cached: RobotSpec | null = null;
export const createFighter: CreateFighterView = (ctx, opts) => {
  ARENA = ctx.arena;
  DEF = ctx.fighterDefs.gantry;
  if (!cached) cached = spec(ctx.fighterDefs.gantry);
  return createRobot(ctx, opts, cached);
};
