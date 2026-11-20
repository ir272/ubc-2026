// Tick: the fast, light one. A small clockwork sprinter that never stands still: a big head with one
// large round lens that shows where it looks, two long blade antennae swept back like a hare's ears
// that whip and trail with every move, a compact torso with an exposed escapement wheel on its back
// that ticks faster the faster it moves, thin reverse-kneed legs on sprung blade feet, small quick
// hands with blade fingers. Arc white shell, lime accents, graphite joints.
//
// Built like kiln.ts (the model): proportions, palette, parts, key poses, the 18 moves, the carry for
// throws, update() for its moving extras. Tick adds its own idle (a boxer's bounce, darting head),
// its own attack evaluator (rolls, turns and the Unwind flight that lines the body up with its
// path) and the show poses.

import * as THREE from 'three';
import type { CreateFighterView } from '../api.ts';
import type { FighterDef, FighterState, MoveDef, MoveId } from '../../sim/types.ts';
import {
  C, J, createRobot, G, pose, strike, mixInto, copyPose, ease, robotMaterial,
  type ActionAnim, type AnimArgs, type CarryFn, type FrameInfo, type Key, type Kit, type MoveAnim, type Pose, type PoseSet, type RobotSpec, type RigHandles,
} from '../rig.ts';

// ------------------------------------------------------------------------------------------------
// Body
// ------------------------------------------------------------------------------------------------

const BODY = {
  ankle: 0.16, // the raised heel of a digitigrade foot: the blade runs from here down to the toe
  shin: 0.26,
  thigh: 0.22,
  hipWidth: 0.3,
  chestY: 0.05,
  neckY: 0.53, // the head joint sits inside the big head (see HEAD_DROP), so 'head' points at the lens
  neckX: 0.04,
  shoulderX: -0.01,
  shoulderY: 0.29,
  shoulderZ: 0.25,
  upperArm: 0.24,
  forearm: 0.23,
  handReach: 0.25, // to the tips of the blade fingers: the IK puts the blades on the hitbox
  stanceWidth: 0.34,
  armStretch: 0,
  centerY: 0.72,
};

// aux channels
const EAR = 0; // antennae sweep, radians added (+ flatter back, - forward and up)
const SPREAD = 1; // antennae V, radians added (+ open, - scissored shut)
const WHEEL = 2; // escapement overclock 0..1 (ticks faster, hub glows)
const SPRING = 3; // heel springs out 0..1 (Spring Hop)

const DEG = Math.PI / 180;
const HEAD_SCALE = 1.2;
const HEAD_DROP = 0.15;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ------------------------------------------------------------------------------------------------
// Geometry helpers
// ------------------------------------------------------------------------------------------------

type P2 = [number, number];

/** a flat profile in the x-y plane, extruded along z and centred on z = 0 */
function extrude(pts: P2[], depth: number, holes: P2[][] = [], bevel = 0.006): THREE.BufferGeometry {
  const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
  const g = new THREE.ExtrudeGeometry(sh, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 3,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** a thick polyline (a strip of half-width w around the centreline) as a closed outline */
function strip(line: P2[], wA: number, wB = wA): P2[] {
  const left: P2[] = [];
  const right: P2[] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const w = wA + (wB - wA) * (i / (line.length - 1));
    left.push([line[i][0] - ty * w, line[i][1] + tx * w]);
    right.push([line[i][0] + ty * w, line[i][1] - tx * w]);
  }
  return left.concat(right.reverse());
}

/** the escapement wheel: eight chunky slanted teeth and three round windows, axis along z. Few,
 *  big shapes so it reads as a cog at match size instead of a spiky blur. */
function escapementWheel(): THREE.BufferGeometry {
  const n = 8;
  const r0 = 0.13;
  const r1 = 0.185;
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = (Math.PI * 2) / n;
    pts.push([Math.cos(a) * r0, Math.sin(a) * r0]);
    pts.push([Math.cos(a + p * 0.12) * r1, Math.sin(a + p * 0.12) * r1]);
    pts.push([Math.cos(a + p * 0.46) * r1, Math.sin(a + p * 0.46) * r1]);
    pts.push([Math.cos(a + p * 0.62) * r0, Math.sin(a + p * 0.62) * r0]);
  }
  const holes: P2[][] = [];
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * Math.PI * 2 + 0.5;
    const cx = Math.cos(a0) * 0.082;
    const cy = Math.sin(a0) * 0.082;
    const h: P2[] = [];
    for (let j = 9; j >= 0; j--) {
      const a = (j / 10) * Math.PI * 2;
      h.push([cx + Math.cos(a) * 0.034, cy + Math.sin(a) * 0.034]);
    }
    holes.push(h);
  }
  return extrude(pts, 0.045, holes, 0.008);
}

/** one blade finger: a broad leaf, flat face toward the camera (x-y plane), pointing down -y */
function fingerBlade(len: number, w: number): THREE.BufferGeometry {
  const pts: P2[] = [[w * 0.5, 0], [w * 0.56, -len * 0.45], [w * 0.3, -len * 0.85], [-w * 0.18, -len], [-w * 0.5, -len * 0.6], [-w * 0.46, 0]];
  return extrude(pts, 0.032, [], 0.008);
}

/** one antenna: a long leaf blade with a sharp tip, bent back a little, in the x-y plane */
function antennaBlade(): THREE.BufferGeometry {
  const front: P2[] = [[0.024, 0], [0.05, 0.1], [0.056, 0.22], [0.044, 0.36], [0.016, 0.48], [-0.04, 0.58]];
  const back: P2[] = [[-0.04, 0.58], [-0.036, 0.46], [-0.04, 0.32], [-0.038, 0.18], [-0.03, 0.07], [-0.024, 0]];
  return extrude(front.concat(back.slice(1)), 0.022, [], 0.005);
}

/** the sprung blade foot: from the raised heel it curls down and back, then runs forward to the toe.
 *  Chunky: a big shoe-sized shape at the end of the leg, like the cast's boots. */
function bladeFoot(): THREE.BufferGeometry {
  const line: P2[] = [[0.02, 0.035], [-0.04, -0.035], [-0.055, -0.085], [-0.03, -0.112], [0.05, -0.116], [0.17, -0.116], [0.27, -0.104]];
  return extrude(strip(line, 0.042, 0.03), 0.14, [], 0.012);
}

/** a slash crescent in the x-y plane: thick in the middle, sharp at both ends, centred on +x */
function crescent(r: number, w: number, arc: number): THREE.BufferGeometry {
  const n = 18;
  const outer: P2[] = [];
  const inner: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -arc / 2 + (arc * i) / n;
    const th = w * Math.sin((Math.PI * i) / n);
    outer.push([Math.cos(a) * (r + th * 0.5), Math.sin(a) * (r + th * 0.5)]);
    inner.push([Math.cos(a) * (r - th * 0.5), Math.sin(a) * (r - th * 0.5)]);
  }
  return extrude(outer.concat(inner.reverse().slice(1, -1)), 0.004, [], 0);
}

const _pm = new THREE.Matrix4();
const _pe = new THREE.Euler();
/** rotate (degrees, xyz) then move a geometry */
function placeAt(g: THREE.BufferGeometry, at: [number, number, number], rotDeg: [number, number, number]): THREE.BufferGeometry {
  _pe.set(rotDeg[0] * DEG, rotDeg[1] * DEG, rotDeg[2] * DEG);
  g.applyMatrix4(_pm.makeRotationFromEuler(_pe));
  g.translate(at[0], at[1], at[2]);
  return g;
}

class Helix extends THREE.Curve<THREE.Vector3> {
  constructor() {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * Math.PI * 2 * 4.5;
    return target.set(Math.cos(a) * 0.032, -t, Math.sin(a) * 0.032);
  }
}

// ------------------------------------------------------------------------------------------------
// Parts
// ------------------------------------------------------------------------------------------------

function build(k: Kit): void {
  const m = k.mats;
  // finish: the white shell is a glossy enamel with tight highlights, the lime a satin-gloss paint,
  // so the close-ups carry a bright narrow highlight like the rest of the cast
  m.paint.roughness = 0.2;
  m.paint.metalness = 0.08;
  m.paint2.roughness = 0.3;
  m.paint2.metalness = 0.14;
  // gunmetal armour for the legs and hips: dark against the pale deck, glossy so it still has form
  const gun = k.own(robotMaterial(k.uniforms, { color: '#353c48', roughness: 0.34, metalness: 0.22, envMapIntensity: 1.0 }));
  // the pupil: near-black glass with a hard highlight (a dead grey disc reads as a dead eye)
  const glass = k.own(robotMaterial(k.uniforms, { color: '#07090c', roughness: 0.08, metalness: 0.3, envMapIntensity: 2 }, 0.4));

  // ---- pelvis: a gunmetal block with hip barrels and lime side plates
  k.mesh('hips', 'hips-gun', () => G.merge([
    G.box(0.22, 0.15, 0.3, 0.045, [0, -0.01, 0]),
    G.cyl(0.062, 0.062, 0.38, 12, [0, -0.03, 0], [90, 0, 0]),
    G.box(0.1, 0.09, 0.18, 0.025, [0.1, -0.06, 0]),
  ]), gun);

  // ---- torso: a lime block (Tick's own colour mass), white collar and back mount, vents in front
  k.mesh('chest', 'chest-lime', () => G.merge([
    G.box(0.3, 0.3, 0.36, 0.085, [0.0, 0.18, 0]),
    G.box(0.13, 0.17, 0.32, 0.05, [0.09, 0.25, 0]), // chest plate, the front proud and high
    G.box(0.11, 0.13, 0.26, 0.04, [0.08, 0.06, 0], [0, 0, -14]), // belly wedge
  ]), m.paint2);
  k.mesh('chest', 'chest-white', () => G.merge([
    G.box(0.24, 0.055, 0.32, 0.022, [-0.01, 0.345, 0]), // collar
    G.box(0.06, 0.24, 0.26, 0.025, [-0.155, 0.19, 0]), // back mount for the movement
    G.box(0.035, 0.2, 0.06, 0.012, [0.162, 0.22, 0]), // front keel stripe
  ]), m.paint);
  k.mesh('chest', 'chest-dark', () => G.merge([
    G.box(0.27, 0.05, 0.34, 0.02, [0.0, 0.035, 0]), // belly band
    G.cyl(0.04, 0.04, 0.12, 10, [-0.23, 0.2, 0], [90, 0, 0]), // axle housing
    G.box(0.1, 0.05, 0.07, 0.015, [-0.2, 0.2, 0]),
    G.cyl(0.055, 0.065, 0.1, 10, [0.03, 0.39, 0]), // neck
    G.box(0.006, 0.22, 0.005, 0, [0.06, 0.2, 0.181]), // panel seams
    G.box(0.006, 0.22, 0.005, 0, [0.06, 0.2, -0.181]),
    G.box(0.2, 0.006, 0.005, 0, [-0.01, 0.12, 0.181]),
    G.box(0.2, 0.006, 0.005, 0, [-0.01, 0.12, -0.181]),
    ...G.rivets(3, [-0.09, 0.08, 0.182], [-0.09, 0.28, 0.182], 0.013, 'z'),
    ...G.rivets(3, [-0.09, 0.08, -0.182], [-0.09, 0.28, -0.182], 0.013, 'z'),
  ]), m.dark);
  k.mesh('chest', 'chest-vents', () => G.merge([
    G.box(0.014, 0.022, 0.07, 0, [0.157, 0.08, 0.09]), G.box(0.014, 0.022, 0.07, 0, [0.159, 0.12, 0.09]),
    G.box(0.014, 0.022, 0.07, 0, [0.157, 0.08, -0.09]), G.box(0.014, 0.022, 0.07, 0, [0.159, 0.12, -0.09]),
  ]), m.glow);
  // the escapement wheel, standing proud of the back so it breaks the outline, and the anchor
  k.group('chest', 'wheel', [-0.25, 0.2, 0]);
  k.mesh('wheel', 'wheel', () => G.merge([escapementWheel()]), m.paint);
  k.mesh('wheel', 'wheel-hub', () => G.merge([
    G.cyl(0.045, 0.045, 0.07, 14, [0, 0, 0], [90, 0, 0]),
    G.box(0.024, 0.22, 0.016, 0.005, [0, 0, 0.026]),
  ]), m.glow);
  k.group('chest', 'anchor', [-0.21, 0.42, 0]);
  k.mesh('anchor', 'anchor', () => G.merge([
    G.box(0.03, 0.1, 0.04, 0.008, [0, -0.04, 0]),
    G.box(0.18, 0.03, 0.04, 0.008, [-0.02, -0.09, 0], [0, 0, 8]),
    G.box(0.03, 0.06, 0.044, 0.007, [0.065, -0.115, 0], [0, 0, 20]),
    G.box(0.03, 0.06, 0.044, 0.007, [-0.11, -0.125, 0], [0, 0, -20]),
  ]), gun);

  // ---- head: a big rounded block, the lens ringed in lime, a crest, side discs, ear sockets
  // (everything on the head hangs in `hs`, scaled up: Tick is all head)
  k.group('head', 'hs', [0, -HEAD_DROP, 0]).scale.setScalar(HEAD_SCALE);
  k.mesh('hs', 'head-paint', () => G.merge([
    G.box(0.34, 0.31, 0.38, 0.1, [-0.02, 0.2, 0]),
    G.box(0.12, 0.29, 0.34, 0.06, [0.15, 0.19, 0]), // face plate
    G.box(0.22, 0.06, 0.37, 0.03, [0.16, 0.345, 0], [0, 0, -10]), // brow, a visor over the lens
  ]), m.paint);
  k.mesh('hs', 'head-lime', () => G.merge([
    G.box(0.34, 0.03, 0.08, 0.013, [0.0, 0.366, 0]), // crest
    G.cyl(0.075, 0.075, 0.022, 18, [-0.06, 0.2, 0.196], [90, 0, 0]), // side discs
    G.cyl(0.075, 0.075, 0.022, 18, [-0.06, 0.2, -0.196], [90, 0, 0]),
    new THREE.TorusGeometry(0.118, 0.024, 10, 32).rotateY(Math.PI / 2).translate(0.215, 0.18, 0), // lens ring
  ]), m.paint2);
  k.mesh('hs', 'head-dark', () => G.merge([
    G.box(0.26, 0.06, 0.3, 0.02, [0.04, 0.03, 0]), // jaw
    G.box(0.06, 0.05, 0.2, 0.015, [0.19, 0.04, 0]), // chin
    G.cyl(0.032, 0.032, 0.03, 10, [-0.06, 0.2, 0.212], [90, 0, 0]), // disc hubs
    G.cyl(0.032, 0.032, 0.03, 10, [-0.06, 0.2, -0.212], [90, 0, 0]),
    G.cyl(0.034, 0.04, 0.05, 10, [-0.07, 0.36, 0.115]), // ear sockets
    G.cyl(0.034, 0.04, 0.05, 10, [-0.07, 0.36, -0.115]),
    G.cyl(0.108, 0.108, 0.02, 28, [0.205, 0.18, 0], [0, 0, 90]), // lens well
    G.box(0.005, 0.2, 0.005, 0, [0.06, 0.2, 0.191]), // seams
    G.box(0.005, 0.2, 0.005, 0, [0.06, 0.2, -0.191]),
    ...G.rivets(2, [-0.15, 0.08, 0.192], [-0.15, 0.3, 0.192], 0.011, 'z'),
    ...G.rivets(2, [-0.15, 0.08, -0.192], [-0.15, 0.3, -0.192], 0.011, 'z'),
  ]), m.dark);
  // the lens, and its catchlight: a fixed bright fleck up and back, in front of the pupil
  k.mesh('hs', 'lens', () => G.merge([
    G.cyl(0.1, 0.1, 0.012, 28, [0.213, 0.18, 0], [0, 0, 90]),
  ]), m.eye);
  k.group('hs', 'pupil', [0.222, 0.18, 0]);
  k.mesh('pupil', 'pupil', () => G.merge([
    G.cyl(0.052, 0.052, 0.01, 24, [0, 0, 0], [0, 0, 90]),
  ]), glass);
  // the catchlight rides on the pupil: a bright fleck up and back, and a small one below it
  k.mesh('pupil', 'glint', () => G.merge([
    G.cyl(0.016, 0.016, 0.006, 12, [0.008, 0.02, -0.017], [0, 0, 90]),
    G.cyl(0.007, 0.007, 0.006, 8, [0.008, -0.004, -0.03], [0, 0, 90]),
  ]), m.eye);

  // ---- antennae: hare's-ear blades on hinge pivots, swung every frame by update()
  for (const sd of ['L', 'R'] as const) {
    const z = sd === 'L' ? -1 : 1;
    k.group('hs', `ear${sd}`, [-0.07, 0.375, z * 0.115]);
    k.mesh(`ear${sd}`, 'ear', () => G.merge([antennaBlade()]), m.paint2);
  }

  for (const sd of ['L', 'R'] as const) {
    const z = sd === 'L' ? -1 : 1;
    const S = sd;
    // shoulder caps in the side colour: big enough to read as a colour block at match size
    k.mesh(`shoulder${sd}`, `cap-side${S}`, () => G.merge([
      G.box(0.19, 0.11, 0.15, 0.045, [0, 0.045, z * 0.255]),
      G.box(0.14, 0.06, 0.035, 0.014, [0, -0.005, z * 0.335]),
    ]), m.side);
    // upper arm: a gunmetal sleeve with a rib between ball joints
    k.mesh(`arm${sd}`, 'upperarm', () => G.merge([
      G.sphere(0.07, 12, [0, 0, 0]),
      G.box(0.11, 0.19, 0.11, 0.035, [0, -0.12, 0]),
      G.box(0.04, 0.13, 0.115, 0.012, [0.06, -0.13, 0]),
      G.sphere(0.06, 10, [0, -0.24, 0]),
    ]), gun);
    // forearm: a chunky white gauntlet with a swept fin, a lime cuff at the wrist
    k.mesh(`fore${sd}`, 'fore', () => G.merge([
      G.box(0.15, 0.21, 0.15, 0.05, [0.006, -0.115, 0]),
      G.box(0.11, 0.14, 0.035, 0.012, [-0.085, -0.08, 0], [0, 0, -26]), // fin
    ]), m.paint);
    k.mesh(`fore${sd}`, 'cuff', () => G.merge([
      G.box(0.17, 0.05, 0.17, 0.018, [0.006, -0.22, 0]),
    ]), m.paint2);
    // hand: a graphite palm and a fan of three broad lime blades (the striking end: big and bright)
    k.mesh(`hand${sd}`, 'palm', () => G.merge([
      G.box(0.13, 0.1, 0.14, 0.035, [0, -0.04, 0]),
      G.cyl(0.045, 0.045, 0.15, 10, [0, 0.0, 0], [90, 0, 0]),
    ]), m.dark);
    k.mesh(`hand${sd}`, 'blades', () => G.merge([
      placeAt(fingerBlade(0.17, 0.07), [0.035, -0.07, -0.042], [0, 0, 16]),
      placeAt(fingerBlade(0.2, 0.075), [0.0, -0.075, 0.0], [0, 0, 0]),
      placeAt(fingerBlade(0.17, 0.07), [-0.035, -0.07, 0.042], [0, 0, -16]),
      placeAt(fingerBlade(0.1, 0.05), [0.06, -0.03, 0.06], [0, 0, 48]), // thumb blade
    ]), m.paint2);

    // legs: gunmetal armour over graphite rods, lime toe caps on big blade feet
    k.mesh(`thigh${sd}`, 'thigh', () => G.merge([
      G.sphere(0.065, 10, [0, 0, 0]),
      G.box(0.17, 0.19, 0.15, 0.05, [0.025, -0.09, 0]),
      G.box(0.05, 0.12, 0.155, 0.015, [0.11, -0.1, 0]), // front rib
      G.sphere(0.058, 10, [0, -0.22, 0]),
    ]), gun);
    k.mesh(`shin${sd}`, 'shin', () => G.merge([
      G.cyl(0.042, 0.036, 0.26, 10, [0, -0.13, 0]),
      G.box(0.12, 0.19, 0.13, 0.04, [0.04, -0.12, 0]),
      G.sphere(0.048, 10, [0, -0.26, 0]),
    ]), gun);
    k.mesh(`shin${sd}`, 'knee', () => G.merge([
      G.box(0.1, 0.08, 0.135, 0.028, [0.07, -0.01, 0], [0, 0, 10]), // knee cap
    ]), m.paint2);
    k.mesh(`foot${sd}`, 'blade', () => G.merge([bladeFoot()]), gun);
    k.mesh(`foot${sd}`, 'toe', () => G.merge([
      G.box(0.11, 0.04, 0.146, 0.014, [0.205, -0.082, 0], [0, 0, -7]),
      G.box(0.06, 0.05, 0.08, 0.014, [0.0, 0.01, 0]), // heel knuckle
    ]), m.paint2);
    // the heel spring for Spring Hop (scaled out by update())
    k.group(`foot${sd}`, `spring${sd}`, [-0.04, -0.1, 0], [0, 0, -30]);
    k.mesh(`spring${sd}`, 'spring', () => new THREE.TubeGeometry(new Helix(), 48, 0.012, 5, false).scale(1.4, 0.22, 1.4), m.trim);
  }

  // the Overclock Dart's slash crescents (one mesh, faded and turned per strike by update())
  const slashMat = k.own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const slashLime = k.own(new THREE.MeshBasicMaterial({ color: '#c8ff1e', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  k.group('yaw', 'slash', [0.4, 1.0, 0.24]);
  // a fat white blade-arc with a lime edge outside it: the four strikes read at match size
  const sl = k.mesh('slash', 'slash', () => G.merge([
    crescent(0.6, 0.2, 2.3),
  ]), slashMat);
  sl.castShadow = false;
  sl.renderOrder = 6;
  const sl2 = k.mesh('slash', 'slash-edge', () => G.merge([
    crescent(0.68, 0.3, 2.5).translate(0, 0, -0.01),
  ]), slashLime);
  sl2.castShadow = false;
  sl2.renderOrder = 5;

  // the speed trail: one ribbon behind the body on the dart, the dash and Unwind (built once per view,
  // moved under the robot's root by update() so it can be written in world space)
  const tg = k.own(new THREE.BufferGeometry());
  tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage));
  const idx: number[] = [];
  for (let i = 0; i < TRAIL_N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  tg.setIndex(idx);
  const tm = k.own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const trail = new THREE.Mesh(tg, tm);
  trail.name = 'tick-trail';
  trail.frustumCulled = false;
  trail.visible = false;
  trail.renderOrder = 3;
  k.group('yaw', 'trailHolder').add(trail);
}

const TRAIL_N = 14;

// ------------------------------------------------------------------------------------------------
// Key poses
// ------------------------------------------------------------------------------------------------

// A sprinter's set, leaning into the facing: the far blade-hand up in front as a guard, the near arm
// cocked back low, so the lime body stays clear between them and the outline is one forward dart.
const stance = pose({
  y: -0.15,
  lean: 12,
  x: -0.03,
  hips: [16],
  chest: [16, -6],
  head: [-30, 20], // turned toward the camera: the lens is the face, it must read
  shoulders: [0, 0, 4],
  armL: [66, 0, 12], foreL: [86], handL: [-6],
  armR: [-30, 0, 22], foreR: [104], handR: [40],
  grip: 1,
  fL: [0.17, 0], fR: [-0.16, 0],
  glow: 0.4,
});

const air = pose({
  plant: 0,
  hips: [6], chest: [14], head: [-14],
  armL: [40, 0, 30], foreL: [80], armR: [10, 0, 34], foreR: [96],
  thighL: [74], shinL: [-118], thighR: [36], shinR: [-84], feet: [10],
  grip: 1, glow: 0.4,
});

const loseSit = pose({
  plant: 0, y: -0.58, lean: -4, hips: [-10], chest: [34], head: [36], thighs: [88], shins: [-16], feet: [36],
  arms: [-8, 0, 30], fores: [24], hands: [0], eyes: -0.8, glow: 0, grip: 0.5,
  aux: { [EAR]: 1.0, [SPREAD]: 1.0, [WHEEL]: -1 },
}, stance);

const P: Partial<PoseSet> & { stance: Pose; air: Pose } = {
  stance,
  air,
  crouch: pose({ y: -0.24, squash: 0.1, chest: [28], head: [-24], arms: [-34, 0, 26], fores: [64], lean: 4 }, stance),
  rise: pose({ squash: -0.1, chest: [-4], head: [-18], arms: [-52, 0, 22], fores: [30], thighs: [-4], shins: [-16], feet: [-40] }, air),
  apex: pose({ thighs: [104], shins: [-152], chest: [36], head: [-30], arms: [54, 0, 26], fores: [112], squash: 0.04 }, air),
  fall: pose({ thighL: [38], shinL: [-62], thighR: [10], shinR: [-30], arms: [30, 0, 58], fores: [44], chest: [4], head: [-10] }, air),
  fastfall: pose({ arms: [-24, 0, 34], fores: [24], thighs: [4], shins: [-10], squash: -0.1, chest: [-6], aux: { [EAR]: -0.4 } }, air),
  airjump: pose({ thighL: [98], shinL: [-142], thighR: [-26], shinR: [-20], arms: [-62, 0, 50], fores: [20], chest: [-14], squash: -0.08 }, air),
  dash: pose({ lean: 16, x: -0.04, y: -0.17, chest: [26], head: [-34], armL: [-62, 0, 16], foreL: [72], armR: [64, 0, 14], foreR: [96], fL: [0.46, 0], fR: [-0.44, 0.12], aux: { [WHEEL]: 0.6 } }, stance),
  run: pose({ y: -0.19, lean: 20, x: -0.08, hips: [18], chest: [24, 0], head: [-52, 0], arms: [0, 0, 12], fores: [100], hands: [20], aux: { [WHEEL]: 0.3 } }, stance),
  walk: pose({ y: -0.1, lean: 5, chest: [12, 0], head: [-20, 0], arms: [12, 0, 16], fores: [88] }, stance),
  skid: pose({ lean: -18, x: 0.04, y: -0.18, chest: [-8, 0], head: [6, 0], arms: [58, 0, 42], fores: [34], fL: [0.46, 0], fR: [0.06, 0], aux: { [EAR]: -0.5 } }, stance),
  pivot: pose({ y: -0.12, chest: [16, 0], arms: [26, 0, 36], fores: [70], yaw: 30 }, stance),
  shield: pose({ y: -0.2, chest: [26, -4], head: [12], armL: [82, 0, 2], foreL: [124], armR: [72, 0, 6], foreR: [128], hands: [10], lean: 3, aux: { [EAR]: 0.5 } }, stance),
  dizzy: pose({ y: -0.13, chest: [30, 0, 14], head: [30, 0, 22], arms: [-6, 0, 14], fores: [20], eyes: -0.6, glow: 0.05, grip: 0.5, aux: { [EAR]: 0.5, [SPREAD]: 1.1, [WHEEL]: -0.8 } }, stance),
  rollTuck: pose({ y: -0.32, chest: [70], head: [40], arms: [50, 0, 10], fores: [130], plant: 0, thighs: [112], shins: [-152], squash: 0.04, aux: { [EAR]: 0.8 } }, stance),
  spot: pose({ y: -0.14, z: -0.4, yaw: 36, chest: [12, 20], arms: [20, 0, 10], fores: [104] }, stance),
  airdodge: pose({ chest: [46], head: [30], arms: [44, 0, 10], fores: [130], thighs: [98], shins: [-142], aux: { [EAR]: 0.7 } }, air),
  hold: pose({ chest: [6, 0], lean: -6, arms: [96, 0, 8], fores: [16], grip: 1, y: -0.08, fL: [0.2, 0], fR: [-0.2, 0] }, stance),
  held: pose({ chest: [-18], head: [20], arms: [36, 0, 52], fores: [50], thighL: [26], shinL: [-50], thighR: [-10], shinR: [-30], eyes: -0.2, grip: 0.4, aux: { [EAR]: 0.6, [SPREAD]: 0.5 } }, air),
  flinch: pose({ chest: [-42, 14], head: [-44], lean: -16, x: -0.06, arms: [52, 0, 66], fores: [22], y: -0.07, eyes: 0.9, glow: 0.9, grip: 0.3, aux: { [EAR]: -0.6, [SPREAD]: 0.6 } }, stance),
  tumble: pose({ chest: [-30], head: [-34], arms: [84, 0, 98], fores: [18], thighL: [62], shinL: [-100], thighR: [-30], shinR: [-20], eyes: 0.6, grip: 0.3, aux: { [SPREAD]: 0.7 } }, air),
  lying: pose({ plant: 0, spin: -90, y: -0.5, chest: [-4], head: [-14], arms: [24, 0, 64], fores: [30], thighs: [34], shins: [-56], feet: [0], eyes: -0.5, glow: 0.1, aux: { [EAR]: -1.5, [SPREAD]: 0.5 } }, air),
  getup: pose({ plant: 0, spin: -36, y: -0.28, chest: [42], head: [0], arms: [-34, 0, 20], fores: [24], thighs: [96], shins: [-124], grip: 1, aux: { [EAR]: -0.6 } }, air),
  hang: pose({ arms: [172, 0, 12], fores: [4], chest: [-6], head: [-28], thighs: [18], shins: [-34], grip: 1, aux: { [EAR]: -0.2 } }, air),
  climb: pose({ arms: [120, 0, 15], fores: [50], chest: [46], thighL: [112], shinL: [-132], thighR: [36], shinR: [-70] }, air),
  helpless: pose({ arms: [150, 0, 40], fores: [30], chest: [-12], head: [-16], thighs: [16], shins: [-40], eyes: -0.6, glow: 0.05, grip: 0.5, aux: { [SPREAD]: 0.6, [WHEEL]: -0.8 } }, air),
  respawn: pose({ chest: [-4, 0], head: [-14, 0], arms: [30, 0, 20], fores: [92] }, stance),
  entrance: pose({ y: -0.34, chest: [52, 0], head: [40, 0], arms: [-10, 0, 30], fores: [30], eyes: -1, glow: 0, aux: { [EAR]: 1.1, [SPREAD]: 0.4 } }, stance),
  win: pose({ y: 0, lean: -4, chest: [-14, 0], head: [-26, 0], armR: [168, 0, 18], foreR: [8], armL: [30, 0, 44], foreL: [104], grip: 1, glow: 1, eyes: 1, fL: [0.18, 0], fR: [-0.2, 0], aux: { [EAR]: -0.3, [SPREAD]: 0.3, [WHEEL]: 1 } }, stance),
  lose: loseSit,
  versus: pose({
    y: -0.3, lean: 8, chest: [24, -10], head: [-34, 16], yaw: 26,
    armR: [-54, 0, 22], foreR: [42], handR: [-10],
    armL: [74, 0, 10], foreL: [18], handL: [0],
    fL: [0.34, 0], fR: [-0.36, 0.06],
    grip: 1, glow: 1, eyes: 1,
    aux: { [EAR]: 0.3, [SPREAD]: 0.3, [WHEEL]: 0.6 },
  }, stance),
};

// ------------------------------------------------------------------------------------------------
// Moves (bespoke, from the `look` notes in the sim's MoveDefs)
// ------------------------------------------------------------------------------------------------

/** extra motion my evaluator layers on top of the keys */
interface MoveExtraAnim {
  /** whole-body forward roll: [frame, degrees] pairs, linear between (ends on a multiple of 360) */
  roll?: [number, number][];
  /** turns about the vertical over [from, to] */
  yawTurns?: [number, number, number];
  /** line the body up with the flight path on these frames */
  align?: [number, number];
  /** legs flutter like a swimmer's kick on these frames */
  flutter?: [number, number];
}
const EXTRA: Partial<Record<MoveId, MoveExtraAnim>> = {};

function tickMoves(def: FighterDef): Partial<Record<MoveId, MoveAnim>> {
  const M = def.moves;
  const st = stance;
  const ar = air;
  const out: Partial<Record<MoveId, MoveAnim>> = {};
  const S = (id: MoveId) => M[id] as MoveDef;
  // Every strike is one diagonal: back foot, hips, chest, the striking blade, with the head behind
  // it. The body lunges a stride into the hit and the blade goes a full body width out.

  // Tock Tap: a one-notch flick of the near blade-hand, thrown from the back foot
  out.jab = strike(S('jab'), {
    wind: pose({ chest: [6, 16], lean: -3, x: -0.03, armR: [-14, 0, 22], foreR: [124], squash: 0.05 }, st),
    strike: pose({ y: -0.16, lean: 9, x: 0.22, hips: [10], chest: [6, -18], head: [-28, -6], armR: [94, 0, 2], foreR: [0], handR: [0], armL: [-30, 0, 34], foreL: [86], fL: [0.32, 0], fR: [-0.36, 0], aux: { [EAR]: 0.5 } }, st),
    follow: pose({ y: -0.17, lean: 10, x: 0.24, hips: [10], chest: [8, -20], head: [-28, -6], armR: [88, 0, 4], foreR: [8], armL: [-34, 0, 34], foreL: [86], fL: [0.34, 0], fR: [-0.38, 0] }, st),
    recover: pose({ y: -0.16, lean: 12, x: 0.1, chest: [16, -6], armR: [46, 0, 18], foreR: [92], fL: [0.24, 0], fR: [-0.26, 0] }, st),
    limb: 'handR',
    snap: 1,
    reachOut: 1.1,
  });

  // Escapement Kick: chamber, then the leg locks straight out with a click, body leaning away
  out.tilt = strike(S('tilt'), {
    wind: pose({ y: -0.13, chest: [8], lean: 0, fR: [0.12, 0.32], fL: [0.0, 0], footR: [30], arms: [34, 0, 40], fores: [80], squash: 0.04 }, st),
    strike: pose({ y: -0.08, chest: [-12], head: [-14], hips: [-4], lean: -9, x: 0.12, thighR: [96], shinR: [0], footR: [-24], armL: [74, 0, 30], foreL: [24], armR: [-60, 0, 44], foreR: [50], fL: [-0.04, 0], squash: -0.04, aux: { [EAR]: 0.7 } }, st),
    follow: pose({ y: -0.09, chest: [-11], head: [-14], hips: [-4], lean: -8, x: 0.13, thighR: [90], shinR: [-10], footR: [-20], armL: [70, 0, 30], foreL: [30], armR: [-56, 0, 44], foreR: [54], fL: [-0.04, 0] }, st),
    recover: pose({ y: -0.15, chest: [10], lean: 4, x: 0.1, fR: [0.16, 0.12], arms: [40, 0, 30], fores: [90], fL: [0.0, 0] }, st),
    limb: 'footR',
    snap: 1,
  });

  // Hand Sweep: one arm sweeps overhead front to back like a minute hand, up on the toes
  out.uptilt = strike(S('uptilt'), {
    wind: pose({ y: -0.22, squash: 0.07, chest: [26, 14], lean: 6, armR: [30, 0, 30], foreR: [90], armL: [40, 0, 30], foreL: [90] }, st),
    strike: pose({ y: 0.04, chest: [-28, -12], head: [-40], hips: [-8], lean: -6, armR: [176, 0, 8], foreR: [6], armL: [-36, 0, 50], foreL: [30], fL: [0.12, 0.05], fR: [-0.16, 0.03], squash: -0.07, aux: { [EAR]: -0.6, [SPREAD]: 0.5 } }, st),
    follow: pose({ y: 0.02, chest: [-24, -14], head: [-32], lean: -8, armR: [204, 0, 12], foreR: [26], armL: [-36, 0, 50], foreL: [30], fL: [0.12, 0.03], fR: [-0.16, 0.02] }, st),
    recover: pose({ y: -0.14, chest: [6, -6], head: [-22], armR: [120, 0, 24], foreR: [60] }, st),
    limb: 'handR',
    path: [[-1, 0.72, 1.0], [0, 0.52, 1.42], [2, 0.16, 1.58], [3, -0.16, 1.5]],
  });

  // Wind-up Dash: dives head first, flat out, antennae swept back, the wheel racing
  out.dash = strike(S('dash'), {
    wind: pose({ y: -0.24, lean: 8, chest: [34], head: [-24], arms: [-56, 0, 30], fores: [40], fL: [0.1, 0], fR: [-0.4, 0], squash: 0.06, aux: { [EAR]: 0.4, [WHEEL]: 0.8 } }, st),
    strike: pose({ plant: 0, y: -0.26, spin: 70, x: 0.14, chest: [8], head: [-50], arms: [-80, 0, 22], fores: [6], thighs: [-12], shins: [-20], feet: [-30], stretch: 0.12, aux: { [EAR]: 1.1, [WHEEL]: 1 } }, st),
    strikeEnd: pose({ plant: 0, y: -0.28, spin: 74, x: 0.16, chest: [8], head: [-50], arms: [-82, 0, 24], fores: [6], thighs: [-16], shins: [-24], feet: [-30], stretch: 0.1, aux: { [EAR]: 1.1, [WHEEL]: 1 } }, st),
    follow: pose({ plant: 0.4, spin: 34, y: -0.22, x: 0.1, chest: [22], head: [-30], thighs: [64], shins: [-104], arms: [20, 0, 40], fores: [60], aux: { [EAR]: 0.5 } }, st),
    recover: pose({ y: -0.26, squash: 0.06, lean: 10, x: 0.1, chest: [30], head: [-30], armL: [-20, 0, 40], foreL: [30], armR: [40, 0, 30], foreR: [90], fL: [0.3, 0], fR: [-0.3, 0] }, st),
    limb: 'body',
  });

  // Mainspring Lash: coils back on the spring, then uncoils into a lashing double kick
  const sm = M.smash.hitboxes[0];
  out.smash = strike(S('smash'), {
    windEarly: pose({ y: -0.16, chest: [-8, -14], lean: -8, x: -0.08, armL: [64, 0, 20], foreL: [80], armR: [40, 0, 24], foreR: [90], aux: { [WHEEL]: 0.5 } }, st),
    wind: pose({ y: -0.3, squash: 0.1, chest: [-16, -16], hips: [0, -8], lean: -14, x: -0.16, head: [-6, 12], arms: [80, 0, 30], fores: [44], fL: [0.2, 0], fR: [-0.36, 0], aux: { [WHEEL]: 1, [EAR]: 0.3 } }, st),
    strike: pose({ plant: 0, spin: -66, y: 0.06, x: 0.32, chest: [12], head: [10], arms: [-48, 0, 64], fores: [18], thighs: [84], shins: [0], feet: [-20], squash: -0.05, aux: { [EAR]: 1.2, [WHEEL]: 1 } }, st),
    strikeEnd: pose({ plant: 0, spin: -64, y: 0.05, x: 0.33, chest: [12], head: [10], arms: [-48, 0, 64], fores: [18], thighs: [82], shins: [-4], feet: [-20], aux: { [EAR]: 1.1, [WHEEL]: 1 } }, st),
    follow: pose({ plant: 0.3, spin: -28, y: -0.06, x: 0.28, chest: [22], arms: [20, 0, 52], fores: [50], thighs: [54], shins: [-66], aux: { [EAR]: 0.4 } }, st),
    recover: pose({ y: -0.24, squash: 0.06, lean: 6, x: 0.22, chest: [24], head: [-28], arms: [-20, 0, 40], fores: [70], fL: [0.28, 0], fR: [-0.24, 0] }, st),
    limb: 'feet',
    path: [[-1, sm.x - 0.4, sm.y - 0.2], [0, sm.x, sm.y], [S('smash').active, sm.x + 0.04, sm.y + 0.04]],
  });

  // Pendulum Flick: a handspring, both legs swung over the top like a pendulum
  out.upsmash = strike(S('upsmash'), {
    wind: pose({ y: -0.28, squash: 0.11, chest: [44], head: [-24], arms: [64, 0, 20], fores: [10], aux: { [WHEEL]: 0.6 } }, st),
    strike: pose({ plant: 0, y: 0.26, chest: [6], head: [-26], arms: [178, 0, 18], fores: [0], thighs: [6], shins: [-6], feet: [-20], stretch: 0.1, aux: { [EAR]: 0.2, [SPREAD]: 0.4 } }, st),
    strikeEnd: pose({ plant: 0, y: 0.22, chest: [10], head: [-26], arms: [176, 0, 18], fores: [4], thighs: [-8], shins: [-6], feet: [-20] }, st),
    follow: pose({ plant: 0, y: -0.06, chest: [30], head: [-20], arms: [60, 0, 40], fores: [60], thighs: [86], shins: [-118], squash: 0.06 }, st),
    recover: pose({ y: -0.26, squash: 0.08, chest: [30], head: [-30], arms: [100, 0, 50], fores: [20], fL: [0.22, 0], fR: [-0.22, 0], aux: { [EAR]: -0.3 } }, st),
    limb: 'feet',
    path: [[0, -0.55, 1.45], [3, 0.15, 1.65], [6, 0.65, 1.25]],
  });
  EXTRA.upsmash = { roll: [[2, 0], [7, 40], [9, 150], [13, 205], [16, 265], [24, 360]] };

  // Gear Whirl: curls into a ball and spins like a gear, blades out
  out.nair = strike(S('nair'), {
    wind: pose({ chest: [34], arms: [40, 0, 20], fores: [110], thighs: [96], shins: [-146], squash: 0.06 }, ar),
    strike: pose({ chest: [40], head: [20], armL: [150, 0, 12], foreL: [0], armR: [-34, 0, 12], foreR: [0], thighs: [104], shins: [-150], aux: { [EAR]: 0.9 } }, ar),
    follow: pose({ chest: [20], arms: [60, 0, 50], fores: [60], thighs: [72], shins: [-112] }, ar),
    limb: 'none',
  });
  EXTRA.nair = { roll: [[3, 0], [4, 40], [8, 340], [13, 720]] };

  // Second Hand: a fast forward slash with one blade-hand in a short arc past twelve; the legs trail
  // back so the body is one line from the heels to the blade
  out.fair = strike(S('fair'), {
    wind: pose({ chest: [-20, 14], lean: -12, head: [-10], armR: [176, 0, 14], foreR: [36], armL: [10, 0, 40], foreL: [80], thighL: [60], shinL: [-110], thighR: [40], shinR: [-90], aux: { [EAR]: 0.2 } }, ar),
    strike: pose({ chest: [34, -12], lean: 26, head: [-40], armR: [70, 0, 0], foreR: [4], armL: [-52, 0, 40], foreL: [40], thighL: [8], shinL: [-40], thighR: [-34], shinR: [-30], feet: [-30], stretch: 0.06, aux: { [EAR]: 0.9 } }, ar),
    follow: pose({ chest: [38, -12], lean: 28, head: [-40], armR: [34, 0, 4], foreR: [14], armL: [-52, 0, 40], foreL: [40], thighL: [10], shinL: [-44], thighR: [-30], shinR: [-34] }, ar),
    recover: pose({ chest: [18], lean: 8, armR: [40, 0, 30], foreR: [80], thighs: [50], shins: [-90] }, ar),
    limb: 'handR',
    path: [[-1, 0.4, 1.3], [0, 0.82, 1.0], [2, 0.92, 0.62], [3, 0.7, 0.32]],
    snap: 1,
  });

  // Recoil Kick: both feet straight back, the body jolting forward from the recoil
  out.bair = strike(S('bair'), {
    wind: pose({ chest: [12], head: [-20], thighs: [108], shins: [-154], arms: [40, 0, 30], fores: [90], squash: 0.05 }, ar),
    strike: pose({ chest: [64], head: [-58], lean: 18, x: 0.06, thighs: [-74], shins: [-2], feet: [-50], armL: [96, 0, 40], foreL: [10], armR: [70, 0, 50], foreR: [20], stretch: 0.06, aux: { [EAR]: 0.7 } }, ar),
    follow: pose({ chest: [56], head: [-46], lean: 14, x: 0.1, thighs: [-58], shins: [-20], arms: [80, 0, 46], fores: [20] }, ar),
    recover: pose({ chest: [26], head: [-24], thighs: [40], shins: [-80], arms: [30, 0, 40], fores: [80] }, ar),
    limb: 'feet',
  });

  // Antenna Snip: the whole body whips up into one vertical line, head flicked back, the blade
  // antennae scissor shut above it
  out.uair = strike(S('uair'), {
    wind: pose({ chest: [34], head: [30], arms: [40, 0, 40], fores: [90], thighs: [90], shins: [-140], squash: 0.07, aux: { [EAR]: 0.8, [SPREAD]: 0.7 } }, ar),
    strike: pose({ chest: [-26], head: [-52], hips: [-10], arms: [-30, 0, 30], fores: [10], thighs: [-8], shins: [-6], feet: [-40], squash: -0.1, stretch: 0.14, lineAng: 0, aux: { [EAR]: -1.1, [SPREAD]: -0.26 } }, ar),
    follow: pose({ chest: [-22], head: [-44], arms: [-24, 0, 36], fores: [20], thighs: [0], shins: [-14], aux: { [EAR]: -0.7, [SPREAD]: -0.12 } }, ar),
    recover: pose({ chest: [10], head: [-20], thighs: [50], shins: [-90], arms: [30, 0, 40], fores: [70] }, ar),
    limb: 'none',
    snap: 1,
  });

  // Pin Drill: feet together pointing down, the whole body spun like a drill bit
  out.dair = strike(S('dair'), {
    wind: pose({ thighs: [108], shins: [-154], chest: [24], arms: [50, 0, 50], fores: [70], squash: 0.06 }, ar),
    strike: pose({ thighs: [-4], shins: [0], feet: [-12], chest: [2], head: [-10], arms: [162, 0, 14], fores: [4], squash: -0.12, stretch: 0.12, aux: { [EAR]: 1.1, [SPREAD]: -0.1, [WHEEL]: 1 } }, ar),
    strikeEnd: pose({ thighL: [34], shinL: [-30], thighR: [-8], shinR: [0], chest: [-6], head: [-16], arms: [120, 0, 44], fores: [10], aux: { [EAR]: 0.6 } }, ar),
    follow: pose({ thighs: [40], shins: [-60], arms: [80, 0, 50], fores: [40] }, ar),
    limb: 'feet',
    spinTurns: 3,
  });

  // Quick Catch: both blade-hands dart out at full stretch and snap shut
  out.grab = strike(S('grab'), {
    wind: pose({ chest: [-8, 4], lean: -6, x: -0.03, arms: [24, 0, 40], fores: [96], grip: 0, squash: 0.05 }, st),
    strike: pose({ y: -0.17, chest: [10, 0], head: [-30], lean: 10, x: 0.26, arms: [90, 0, 8], fores: [0], grip: 0.2, fL: [0.34, 0], fR: [-0.38, 0], aux: { [EAR]: 0.6 } }, st),
    follow: pose({ y: -0.17, chest: [10, 0], head: [-30], lean: 10, x: 0.2, arms: [82, 0, 8], fores: [16], grip: 1, fL: [0.34, 0], fR: [-0.38, 0] }, st),
    recover: pose({ y: -0.16, chest: [12, 0], lean: 8, x: 0.12, arms: [50, 0, 20], fores: [70], grip: 1, fL: [0.24, 0], fR: [-0.24, 0] }, st),
    limb: 'hands',
    grip: 0.2,
    snap: 1,
  });

  const hold = P.hold!;
  // Ratchet Toss: a quick half-turn crank, then the shove: a full lunge, both arms flung out
  out.throwf = strike(S('throwf'), {
    wind: pose({ chest: [-18, 16], lean: -10, x: -0.05, y: -0.2, squash: 0.06, fL: [0.1, 0], fR: [-0.3, 0], aux: { [WHEEL]: 1 } }, hold),
    strike: pose({ chest: [14, -16], head: [-30], lean: 14, x: 0.22, y: -0.17, arms: [92, 0, 4], fores: [0], grip: 0, fL: [0.4, 0], fR: [-0.42, 0], aux: { [EAR]: 0.8 } }, hold),
    follow: pose({ chest: [14, -14], head: [-30], lean: 13, x: 0.22, y: -0.17, arms: [84, 0, 6], fores: [10], grip: 0.6, fL: [0.4, 0], fR: [-0.42, 0] }, hold),
    recover: pose({ chest: [14, -4], lean: 10, x: 0.14, y: -0.16, arms: [44, 0, 20], fores: [80], grip: 1, fL: [0.28, 0], fR: [-0.28, 0] }, hold),
    limb: 'none',
  });

  // Rewind Throw: a tiny circle around them, winding, and a fling behind over the top
  out.throwb = strike(S('throwb'), {
    wind: pose({ chest: [12, 18], y: -0.18, lean: 6, squash: 0.06, arms: [110, 0, 10], fores: [20], aux: { [WHEEL]: 1 } }, hold),
    strike: pose({ chest: [-30, -18], head: [-20], lean: -20, x: -0.06, y: -0.08, arms: [176, 0, 16], fores: [0], grip: 0, fL: [0.3, 0], fR: [-0.36, 0], aux: { [EAR]: 0.9 } }, hold),
    follow: pose({ chest: [-26, -14], head: [-16], lean: -16, x: -0.06, y: -0.1, arms: [190, 0, 20], fores: [10], grip: 0.6, fL: [0.3, 0], fR: [-0.36, 0] }, hold),
    recover: pose({ chest: [6, -4], lean: 2, y: -0.16, arms: [50, 0, 24], fores: [80], grip: 1 }, hold),
    limb: 'none',
  });
  EXTRA.throwb = { yawTurns: [1, 14, 1] };

  // Chime Pop: hops under them and headbutts them straight up, antennae ringing
  out.throwu = strike(S('throwu'), {
    wind: pose({ y: -0.3, squash: 0.12, chest: [34], head: [12], arms: [150, 0, 14], fores: [30] }, hold),
    strike: pose({ plant: 0, y: 0.26, squash: -0.1, chest: [-22], head: [-56], arms: [176, 0, 30], fores: [0], thighs: [-6], shins: [-20], feet: [-40], grip: 0, stretch: 0.12, aux: { [EAR]: -0.9, [SPREAD]: 0.6 } }, hold),
    follow: pose({ plant: 0, y: 0.18, chest: [-14], head: [-40], arms: [160, 0, 50], fores: [10], thighs: [30], shins: [-60], aux: { [EAR]: -0.4, [SPREAD]: 0.4 } }, hold),
    recover: pose({ y: -0.24, squash: 0.08, chest: [24], head: [-30], arms: [60, 0, 40], fores: [60] }, hold),
    limb: 'none',
  });

  // Overclock Dart: the gears whine up, then a blur of four slashes and a flip kick, and the speed it
  // built carries it into a long skid with a blade dragging on the deck before it pops back up
  {
    const md = S('special');
    // the dart passes in front of the target (toward the camera), so the blur of slashes stays visible
    const dart = pose({ z: 0.85, y: -0.13, lean: 12, chest: [8], head: [-36], hips: [4], fL: [0.38, 0], fR: [-0.46, 0.06], glow: 1, eyes: 1, aux: { [EAR]: 1.2, [WHEEL]: 1 } }, st);
    const windE = pose({ y: -0.22, squash: 0.08, lean: -8, x: -0.08, chest: [-10, 14], head: [-20], arms: [-34, 0, 30], fores: [100], glow: 1, eyes: 1, aux: { [WHEEL]: 1, [EAR]: 0.5 } }, st);
    const wind = pose({ y: -0.28, squash: 0.11, lean: -10, x: -0.12, chest: [-12, 18], head: [-24], armR: [154, 0, 16], foreR: [36], armL: [-44, 0, 30], foreL: [90], glow: 1, eyes: 1, aux: { [WHEEL]: 1, [EAR]: 0.7 } }, st);
    const sR1 = pose({ x: 0.14, chest: [16, -18], armR: [100, 0, -4], foreR: [0], armL: [-44, 0, 30], foreL: [70] }, dart);
    const pL2 = pose({ chest: [12, 0], armL: [168, 0, 8], foreL: [24], armR: [30, 0, 20], foreR: [80] }, dart);
    const sL2 = pose({ x: 0.14, chest: [16, 16], armL: [96, 0, -4], foreL: [0], armR: [-30, 0, 30], foreR: [90] }, dart);
    const pR3 = pose({ chest: [12, 0], armR: [-30, 0, 30], foreR: [100], armL: [40, 0, 20], foreL: [80] }, dart);
    const sR3 = pose({ x: 0.14, chest: [6, -18], armR: [140, 0, 0], foreR: [0], armL: [-40, 0, 30], foreL: [70] }, dart);
    const pL4 = pose({ chest: [12, 0], armL: [-30, 0, 30], foreL: [100], armR: [40, 0, 20], foreR: [80] }, dart);
    const sL4 = pose({ x: 0.14, chest: [6, 18], armL: [140, 0, 0], foreL: [0], armR: [-40, 0, 30], foreR: [70] }, dart);
    // the finisher: a front flip that brings both blade feet over and down through the target
    const chamber = pose({ plant: 0, y: 0.12, lean: 0, chest: [40], head: [-10], thighs: [104], shins: [-152], arms: [40, 0, 40], fores: [100], aux: { [EAR]: 0.6, [WHEEL]: 1 } }, dart);
    const kick = pose({ plant: 0, y: 0.14, lean: 0, chest: [20], head: [-20], thighR: [74], shinR: [-2], footR: [-30], thighL: [20], shinL: [-40], arms: [-34, 0, 54], fores: [24], stretch: 0.08, aux: { [EAR]: 1.3, [WHEEL]: 1 } }, dart);
    // the landing: crouched low, one blade dragging the deck, the other arm thrown back, ears flat
    const land = pose({ z: 0.5, y: -0.36, squash: 0.12, lean: -10, x: 0.06, chest: [34, 8], head: [-36], armL: [60, 0, 20], foreL: [10], armR: [-60, 0, 44], foreR: [40], fL: [0.42, 0], fR: [-0.3, 0], glow: 0.9, aux: { [EAR]: 1.3, [WHEEL]: 0.8 } }, st);
    const skid = pose({ z: 0.4, y: -0.34, squash: 0.07, lean: -14, x: 0.02, chest: [30, 6], head: [-30], armL: [44, 0, 16], foreL: [6], armR: [-50, 0, 46], foreR: [44], fL: [0.46, 0], fR: [-0.26, 0], glow: 0.8, aux: { [EAR]: 1.0, [WHEEL]: 0.6 } }, st);
    // pops up tall, then drops back into its bounce
    const pop = pose({ z: 0.25, y: -0.04, squash: -0.07, lean: 0, chest: [-6], head: [-36], armR: [120, 0, 30], foreR: [30], armL: [30, 0, 50], foreL: [80], fL: [0.18, 0.03], fR: [-0.2, 0.03], glow: 0.7, aux: { [EAR]: -0.4, [SPREAD]: 0.5, [WHEEL]: 0.4 } }, st);
    const settle = pose({ z: 0.15, y: -0.2, squash: 0.05, lean: 10, chest: [20], arms: [40, 0, 30], fores: [90], glow: 0.6, aux: { [WHEEL]: 0.3, [EAR]: 0.3 } }, st);
    const T = md.startup + md.active + md.recovery;
    const keys: Key[] = [
      { f: 0, pose: 'base' },
      { f: 3, pose: windE, ease: ease.outCubic },
      { f: 7.6, pose: wind, ease: ease.inOutSine },
      { f: 9, pose: sR1, ease: ease.outQuart },
      { f: 10.6, pose: pL2, ease: ease.inOutSine },
      { f: 12, pose: sL2, ease: ease.outQuart },
      { f: 13.6, pose: pR3, ease: ease.inOutSine },
      { f: 15, pose: sR3, ease: ease.outQuart },
      { f: 16.6, pose: pL4, ease: ease.inOutSine },
      { f: 18, pose: sL4, ease: ease.outQuart },
      { f: 19.8, pose: chamber, ease: ease.inOutSine },
      { f: 21, pose: kick, ease: ease.outQuart },
      { f: 24, pose: kick, ease: ease.linear },
      { f: 26.5, pose: land, ease: ease.outQuart },
      { f: 35, pose: skid, ease: ease.outCubic },
      { f: 38, pose: pop, ease: ease.outBack },
      { f: 44, pose: settle, ease: ease.inOutSine },
      { f: T, pose: 'base', ease: ease.inOutCubic },
    ];
    out.special = { keys, limb: 'none', recoverAt: 44 };
    EXTRA.special = { roll: [[19, 0], [21, 150], [24, 300], [26.5, 360]] };
  }

  // Spring Hop: a coiled spring pops out of the heels into a rising knee
  out.special2 = strike(S('special2'), {
    wind: pose({ y: -0.3, squash: 0.12, chest: [34], arms: [-44, 0, 30], fores: [40], aux: { [SPRING]: 0.35 } }, st),
    strike: pose({ plant: 0, lean: 12, x: 0.12, chest: [-8], head: [-28], armL: [-44, 0, 30], foreL: [30], armR: [156, 0, 20], foreR: [14], thighR: [122], shinR: [-152], thighL: [-16], shinL: [-8], feet: [-40], squash: -0.09, stretch: 0.1, aux: { [SPRING]: 1, [EAR]: 0.9 } }, st),
    follow: pose({ plant: 0, chest: [0], thighR: [94], shinR: [-124], thighL: [-6], shinL: [-20], arms: [40, 0, 50], fores: [50], aux: { [SPRING]: 0.4, [EAR]: 0.4 } }, st),
    limb: 'none',
  });

  // Unwind: a squash, then the wheel spins free and it shoots along a straight line like a diver,
  // blades first, stretched long along its path, legs fluttering, corkscrewing; then it is spent
  out.recover = strike(S('recover'), {
    wind: pose({ thighs: [96], shins: [-148], arms: [20, 0, 30], fores: [100], chest: [36], head: [10], squash: 0.12, aux: { [WHEEL]: 1, [EAR]: 0.6 } }, ar),
    strike: pose({ chest: [0], head: [-8], arms: [178, 0, 6], fores: [0], hands: [0], thighs: [-4], shins: [-2], feet: [-40], squash: -0.12, stretch: 0.3, lineAng: 0, glow: 1, aux: { [WHEEL]: 1, [EAR]: 1.35, [SPREAD]: -0.1 } }, ar),
    strikeEnd: pose({ chest: [2], head: [-8], arms: [176, 0, 8], fores: [4], thighs: [-6], shins: [-6], feet: [-40], squash: -0.1, stretch: 0.26, lineAng: 0, glow: 1, aux: { [WHEEL]: 1, [EAR]: 1.3 } }, ar),
    follow: pose({ chest: [-14], head: [-24], arms: [150, 0, 60], fores: [10], thighL: [50], shinL: [-80], thighR: [10], shinR: [-30], squash: 0.04, aux: { [WHEEL]: 0.5, [SPREAD]: 0.6 } }, ar),
    recover: pose({ chest: [-10], head: [-18], arms: [146, 0, 40], fores: [26], thighs: [22], shins: [-46], eyes: -0.4, aux: { [WHEEL]: -0.4, [SPREAD]: 0.6 } }, ar),
    limb: 'none',
  });
  EXTRA.recover = { align: [5, 31], yawTurns: [6, 28, 2], flutter: [6, 29] };
  return out;
}


// where a held robot sits in Tick's hands (hoisted high: Tick is small), and each throw's path
const carry: CarryFn = (move, f, def, o) => {
  const reach = def.width * 0.5 + 0.42;
  const hy = 1.15;
  o.x = reach;
  o.y = hy;
  o.spin = 0;
  if (!move || move === 'grab' || move === 'special') return;
  const md = def.moves[move];
  const rel = md.hitboxes[0]?.from ?? md.startup + 1;
  const t = clamp01(f / rel);
  const e = t * t * (3 - 2 * t);
  if (move === 'throwu') {
    // dropped onto the head, then popped straight up
    const dip = Math.min(1, t / 0.6);
    const pop = Math.max(0, (t - 0.6) / 0.4);
    o.x = reach + (0.12 - reach) * ease.outCubic(dip);
    o.y = hy + 0.35 * dip + 0.5 * pop * pop;
    o.spin = -14 * e;
  } else if (move === 'throwb') {
    // wound around overhead and flung down behind
    const a = Math.PI * e;
    o.x = Math.cos(a) * reach;
    o.y = hy + Math.sin(a) * 0.45;
    o.spin = -200 * e;
  } else {
    // the ratchet crank: a half turn in the hands, then the release forward
    const crank = Math.min(1, t / 0.75);
    const push = Math.max(0, (t - 0.75) / 0.25);
    o.x = reach - 0.1 * Math.sin(Math.PI * crank) + 0.5 * push * push;
    o.y = hy + 0.3 * Math.sin(Math.PI * crank);
    o.spin = 180 * ease.inOutCubic(crank);
  }
};

// ------------------------------------------------------------------------------------------------
// Actions Tick plays its own way
// ------------------------------------------------------------------------------------------------

/** a small fixed hash, so the darting head is the same in every capture */
function hash(n: number): number {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** the boxer's bounce and the darting head: Tick never stands still */
function liveliness(o: Pose, t: number, k = 1): void {
  const hz = 2.3;
  const ph = t * hz;
  const b = Math.abs(Math.sin(Math.PI * ph)); // 0 at the bottom of each bounce
  const up = b * b;
  o[C.y] += k * (-0.035 + 0.05 * up);
  o[C.fLy] += k * 0.018 * up;
  o[C.fRy] += k * 0.018 * up;
  o[J.chest * 3] += k * (1 - up) * 4 * DEG;
  o[J.armL * 3] += k * Math.sin(Math.PI * 2 * ph) * 4 * DEG;
  o[J.armR * 3] -= k * Math.sin(Math.PI * 2 * ph) * 4 * DEG;
  o[J.foreL * 3] += k * (1 - up) * 6 * DEG;
  o[J.foreR * 3] += k * (1 - up) * 6 * DEG;
  // head darts: a new look every ~0.6 s, snapped to in a few frames
  const seg = Math.floor(t * 1.6);
  const u = t * 1.6 - seg;
  const snap = ease.outCubic(clamp01(u / 0.14));
  const tw0 = (hash(seg - 1) - 0.5) * 0.42;
  const tw1 = (hash(seg) - 0.5) * 0.42;
  const pt0 = (hash(seg * 7 + 3 - 7) - 0.5) * 0.3;
  const pt1 = (hash(seg * 7 + 3) - 0.5) * 0.3;
  o[J.head * 3 + 1] += k * (tw0 + (tw1 - tw0) * snap);
  o[J.head * 3] += k * (pt0 + (pt1 - pt0) * snap);
}

/** key evaluation (the same as the rig's, plus Tick's rolls, turns and flight alignment) */
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

function table(tb: [number, number][], f: number): number {
  if (f <= tb[0][0]) return tb[0][1];
  for (let i = 1; i < tb.length; i++) {
    if (f <= tb[i][0]) {
      const a = tb[i - 1];
      const b = tb[i];
      return a[1] + ((b[1] - a[1]) * (f - a[0])) / Math.max(1e-3, b[0] - a[0]);
    }
  }
  return tb[tb.length - 1][1];
}

// The line of action on every strike (the rig does this for moves it animates; Tick's own evaluator
// must do it too, or the strikes stay upright and small): squash in the anticipation, then on the snap
// the whole body stretches toward the hit, lunges along it, counter-rotates and throws the off arm back.
// Tick's hits are light, so the accent is set by speed, not damage: every strike gets a strong one.
interface Accent { k: number; ang: number; dx: number; dy: number; side: number; S: number; A: number }
const ACCENT: Partial<Record<MoveId, Accent>> = {};
const ACCENT_K: Partial<Record<MoveId, number>> = {
  jab: 1.0, tilt: 1.0, uptilt: 1.2, dash: 0.6, smash: 1.3, upsmash: 0.8, nair: 0, fair: 1.3, bair: 1.25, uair: 1.1, dair: 0.7,
  grab: 1.0, throwf: 0.9, throwb: 0.9, throwu: 0.9, special: 0, special2: 1.1, recover: 0,
};
function initAccents(def: FighterDef, moves: Partial<Record<MoveId, MoveAnim>>): void {
  for (const id of Object.keys(def.moves) as MoveId[]) {
    const md = def.moves[id];
    let hb = md.hitboxes[0];
    for (const h of md.hitboxes) if (h.damage > hb.damage) hb = h;
    const k = ACCENT_K[id] ?? 1;
    if (!hb || k <= 0) continue;
    const dx = hb.x;
    const dy = hb.y - BODY.centerY;
    const l = Math.hypot(dx, dy) || 1;
    const limb = moves[id]?.limb ?? 'none';
    const side = limb === 'handR' || limb === 'footR' ? 1 : limb === 'handL' || limb === 'footL' ? -1 : 0;
    ACCENT[id] = { k, ang: Math.atan2(dx, dy), dx: dx / l, dy: dy / l, side, S: md.startup, A: md.active };
  }
}
function accentInto(o: Pose, id: MoveId, f: number, grounded: boolean): void {
  const a = ACCENT[id];
  if (!a) return;
  const S = a.S;
  const wind = f < S + 1 ? ease.inQuad(clamp01((f - 0.5) / Math.max(1, S - 0.5))) * (f > S - 0.5 ? clamp01((S + 1 - f) / 1.2) : 1) : 0;
  const hit = f < S - 0.4 ? 0 : f < S + 1 ? clamp01((f - (S - 0.4)) / 1.4) : f <= S + a.A + 1.5 ? 1 : 1 - ease.inOutSine(clamp01((f - (S + a.A + 1.5)) / 4));
  const k = a.k;
  if (wind > 0) {
    o[C.squash] += 0.08 * wind * k;
    o[C.y] -= 0.035 * wind * k;
    o[C.counter] += 12 * DEG * wind * k * a.side;
  }
  if (hit > 0) {
    const w = hit * k;
    o[C.stretch] += 0.1 * w;
    o[C.lineAng] = a.ang;
    o[C.squash] -= 0.03 * w;
    o[C.counter] -= 18 * DEG * w * a.side;
    o[C.curve] += 6 * DEG * w * a.dx * (a.dy < 0.6 ? 1 : 0) - 10 * DEG * w * Math.max(0, a.dy);
    if (grounded) {
      // lunge along the strike: front foot out, back foot back, hips through
      const fx = 0.16 * w * a.dx;
      o[C.fLx] += o[C.fLx] >= o[C.fRx] ? fx : -fx;
      o[C.fRx] += o[C.fRx] > o[C.fLx] ? fx : -fx;
      o[C.lean] += 4 * DEG * w * a.dx;
      o[C.sway] += 0.05 * w * Math.abs(a.dx);
    }
    if (a.side !== 0) {
      const off = a.side > 0 ? J.armL : J.armR;
      o[off * 3] -= 46 * DEG * w * a.dx;
      o[off * 3 + 2] += 16 * DEG * w;
    }
  }
}

const attackAnim: ActionAnim = (a: AnimArgs, o: Pose) => {
  const s = a.s;
  const id = s.move as MoveId;
  const ma = a.spec.moves?.[id];
  const md = a.def.moves[id];
  const b = s.grounded ? a.P.stance : a.P.air;
  if (!ma) {
    copyPose(o, b);
    return;
  }
  let f = a.f;
  if (s.charge > 0 && ma.keys.length > 2 && f < ma.keys[2].f) f = ma.keys[2].f;
  evalKeys(ma.keys, f, b, o);
  accentInto(o, id, f, s.grounded);
  // the recovery is never a frozen frame: Tick is back on its toes, bouncing, the moment it can
  if (ma.recoverAt && a.f > ma.recoverAt && s.grounded) {
    const T = md.startup + md.active + md.recovery;
    const w = clamp01((a.f - ma.recoverAt) / 3) * clamp01((T - a.f) / 3);
    if (w > 0) liveliness(o, a.t, w * 0.8);
  }
  if (s.charge > 0 && a.f < md.startup) {
    const j = Math.sin(a.f * 2.7) * 0.8;
    o[J.chest * 3] += j * 1.2 * DEG;
    o[J.head * 3 + 2] += j * 1.5 * DEG;
    o[C.x] += Math.sin(a.f * 3.9) * 0.006;
  }
  const ex = EXTRA[id];
  if (!ex) return;
  if (ex.roll) {
    const deg = table(ex.roll, f);
    o[C.spin] += (deg % 360) * DEG;
  }
  if (ex.yawTurns) {
    const [y0, y1, n] = ex.yawTurns;
    const u = clamp01((f - y0) / Math.max(1, y1 - y0));
    if (u > 0 && u < 1) o[C.yaw] += Math.PI * 2 * n * ease.inOutSine(u);
  }
  if (ex.flutter && f >= ex.flutter[0] && f <= ex.flutter[1]) {
    const w = Math.min(1, (f - ex.flutter[0]) / 2, (ex.flutter[1] - f) / 2);
    const fl = Math.sin(f * 2.2) * w;
    o[J.thighL * 3] += fl * 12 * DEG;
    o[J.thighR * 3] -= fl * 12 * DEG;
    o[J.shinL * 3] -= Math.max(0, fl) * 22 * DEG;
    o[J.shinR * 3] -= Math.max(0, -fl) * 22 * DEG;
    o[J.armL * 3 + 2] += fl * 6 * DEG;
    o[J.armR * 3 + 2] -= fl * 6 * DEG;
  }
  if (id === 'recover' && f > md.startup + md.active) {
    // spent: arms and ears flailing, the body rocking, never a frozen hold
    const w = clamp01((f - md.startup - md.active) / 4);
    const t = a.t;
    o[J.armL * 3 + 2] += Math.sin(t * 11) * 14 * DEG * w;
    o[J.armR * 3 + 2] -= Math.sin(t * 11 + 0.8) * 14 * DEG * w;
    o[J.armL * 3] += Math.sin(t * 7) * 10 * DEG * w;
    o[J.thighL * 3] += Math.sin(t * 9) * 12 * DEG * w;
    o[J.thighR * 3] -= Math.sin(t * 9) * 12 * DEG * w;
    o[C.lean] += Math.sin(t * 4.3) * 5 * DEG * w;
  }
  if (ex.align) {
    const [f0, f1] = ex.align;
    const w = Math.min(ease.outCubic(clamp01((f - f0) / 2)), 1 - ease.inOutSine(clamp01((f - (f1 - 4)) / 4)));
    if (w > 0) {
      const vxF = s.vx * s.facing;
      const sp = Math.hypot(vxF, s.vy);
      const ang = sp > 0.02 ? Math.atan2(vxF, s.vy) : 0.35;
      o[C.spin] += ang * w;
      o[C.lean] *= 1 - w;
    }
  }
};

const idleAnim: ActionAnim = (a: AnimArgs, o: Pose) => {
  copyPose(o, a.P.stance);
  liveliness(o, a.t + a.s.x * 0.37);
};

// ------------------------------------------------------------------------------------------------
// Show poses
// ------------------------------------------------------------------------------------------------

const show: RobotSpec['show'] = {
  select(t, out, PS) {
    copyPose(out, PS.stance);
    liveliness(out, t, 1);
    // a hop and a tap of the foot every few seconds
    const c = t % 3.2;
    if (c > 2.4) {
      const u = (c - 2.4) / 0.8;
      const hop = Math.sin(Math.PI * u);
      out[C.y] += 0.12 * hop;
      out[C.fLy] += 0.12 * hop;
      out[C.fRy] += 0.06 * hop;
      out[C.aux + WHEEL] += hop;
    }
  },
  wait(t, out, PS) {
    copyPose(out, PS.stance);
    liveliness(out, t, 1);
  },
  versus(t, out, PS) {
    mixInto(out, PS.stance, PS.versus, ease.outBack(clamp01(t / 0.4)));
    const ph = Math.abs(Math.sin(Math.PI * t * 2.3));
    out[C.y] += 0.018 * ph * ph - 0.01;
    out[J.armL * 3] += Math.sin(t * 4.6) * 2 * DEG;
  },
  win(t, out, PS) {
    // a tiptoe twirl, then the blade raised high, bouncing
    const u = clamp01(t / 0.6);
    mixInto(out, PS.stance, PS.win, ease.outBack(clamp01((t - 0.35) / 0.4)));
    if (u < 1) {
      out[C.yaw] += Math.PI * 2 * ease.inOutCubic(u);
      out[C.y] += 0.1 * Math.sin(Math.PI * u);
      out[C.aux + WHEEL] += 1;
    }
    const b = Math.abs(Math.sin(Math.PI * t * 2.6));
    out[C.y] += 0.04 * b * b;
    out[J.armR * 3 + 2] += Math.sin(t * 9) * 6 * DEG;
    out[J.head * 3 + 1] += Math.sin(t * 2.1) * 0.15;
  },
  lose(t, out, PS) {
    mixInto(out, PS.stance, PS.lose, ease.inOutSine(clamp01(t / 0.7)));
    out[J.head * 3 + 1] += Math.sin(t * 1.3) * 0.12 * clamp01(t - 0.7);
  },
};

// ------------------------------------------------------------------------------------------------
// Per-frame extras: antennae (a spring on each, driven by the head's motion), the escapement
// wheel and anchor, the lens pupil, heel springs, the slash crescents, glow
// ------------------------------------------------------------------------------------------------

interface TickParts {
  ear: [THREE.Object3D, THREE.Object3D];
  wheel: THREE.Object3D;
  anchor: THREE.Object3D;
  pupil: THREE.Object3D;
  slash: THREE.Object3D;
  slashMat: THREE.MeshBasicMaterial;
  slashEdge: THREE.MeshBasicMaterial;
  springs: [THREE.Object3D, THREE.Object3D];
  /** the rig's swing smear (a ribbon of the limb's path): thinned in the hit pause, where a full
   *  white ribbon would sit over Tick's striking limb for the whole freeze */
  smearMat: THREE.MeshBasicMaterial | null;
  trail: THREE.Mesh | null;
  trailPts: Float32Array; // ring of [top xyz, bottom xyz] per sample, newest last
  trailN: number;
  trailA: number;
  t: number;
  th: [number, number];
  om: [number, number];
  ticks: number;
  hp: THREE.Vector3;
  hv: THREE.Vector3;
  init: boolean;
}
const partsOf = new WeakMap<RigHandles, TickParts>();
function findSmear(root: THREE.Object3D): THREE.MeshBasicMaterial | null {
  for (const c of root.children) {
    const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
    if ((c as THREE.Mesh).isMesh && c.renderOrder === 4 && m && m.vertexColors && m.transparent) return m;
  }
  return null;
}
const _hw = new THREE.Vector3();
const PITCH = (Math.PI * 2) / 12;
const SLASH_AT = [8.6, 11.6, 14.6, 17.6];
const SLASH_ROT = [-0.35, 0.5, 0.75, -0.2];

function update(h: RigHandles, p: Pose, s: FighterState | null, info: FrameInfo): void {
  let k = partsOf.get(h);
  if (!k) {
    const slash = h.part('slash');
    k = {
      ear: [h.part('earL'), h.part('earR')],
      wheel: h.part('wheel'),
      anchor: h.part('anchor'),
      pupil: h.part('pupil'),
      slash,
      slashMat: (slash.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial,
      slashEdge: (slash.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial,
      springs: [h.part('springL'), h.part('springR')],
      smearMat: findSmear(h.root),
      trail: null,
      trailPts: new Float32Array(TRAIL_N * 6),
      trailN: 0,
      trailA: 0,
      t: 0,
      th: [0.6, 0.6],
      om: [0, 0],
      ticks: 0,
      hp: new THREE.Vector3(),
      hv: new THREE.Vector3(),
      init: false,
    };
    partsOf.set(h, k);
    const holder = h.part('trailHolder');
    const tr = holder.children[0] as THREE.Mesh | undefined;
    if (tr) {
      h.root.add(tr);
      k.trail = tr;
    }
  }
  const dtRaw = info.t - k.t;
  k.t = info.t;
  const live = k.init && dtRaw > 0 && dtRaw < 0.1;
  const dt = live ? dtRaw : 0;
  const facing = s ? s.facing : 1;

  // ---- head motion (the antennae lag it) ----
  h.joint('head').getWorldPosition(_hw);
  let ax = 0;
  let ay = 0;
  if (live) {
    const vx = (_hw.x - k.hp.x) / dt;
    const vy = (_hw.y - k.hp.y) / dt;
    ax = clamp((vx - k.hv.x) / dt, -160, 160);
    ay = clamp((vy - k.hv.y) / dt, -160, 160);
    k.hv.set(vx, vy, 0);
  } else k.hv.set(0, 0, 0);
  k.hp.copy(_hw);
  k.init = true;

  // ---- antennae ----
  const vxF = s ? s.vx * s.facing : 0;
  const vy = s ? s.vy : 0;
  let tgt = 0.62 + p[C.aux + EAR] + clamp(vxF * 4.2, -0.3, 0.95) + clamp(vy * 2.4, -0.45, 0.55);
  if (s && s.action === 'hitstun' && s.tumble) tgt += 0.45;
  tgt = clamp(tgt, -0.8, 1.9);
  const force = ax * facing * 0.55 + ay * 0.4;
  for (let i = 0; i < 2; i++) {
    if (live) {
      const K = i === 0 ? 240 : 285;
      k.om[i] += (K * (tgt - k.th[i]) + force * (i === 0 ? 1.1 : 0.9) - 13 * k.om[i]) * dt;
      k.om[i] = clamp(k.om[i], -40, 40);
      k.th[i] = clamp(k.th[i] + k.om[i] * dt, -0.9, 2.1);
    } else {
      k.th[i] = tgt;
      k.om[i] = 0;
    }
  }
  // the far ear sits further back than the near one, so both blades read side on
  const spread = 0.3 + p[C.aux + SPREAD];
  const farL = facing > 0 ? 1 : 0;
  const off0 = farL ? 0.3 : -0.24;
  const off1 = farL ? -0.24 : 0.3;
  k.ear[0].rotation.set(-spread - k.om[0] * 0.004, 0, k.th[0] + off0);
  k.ear[1].rotation.set(spread + k.om[1] * 0.004, 0, k.th[1] + off1);

  // ---- escapement: one tooth per tick, faster with speed; the anchor rocks tick-tock ----
  const speed = s ? Math.abs(s.vx) * 60 : 0;
  const rate = Math.max(0.6, 3.6 + speed * 0.9 + p[C.aux + WHEEL] * 20 + info.charge * 14);
  if (live) k.ticks += rate * dt;
  else k.ticks = info.t * rate;
  const step = Math.floor(k.ticks);
  const fr = k.ticks - step;
  const snap = rate > 14 ? fr : ease.outCubic(clamp01(fr / 0.3));
  k.wheel.rotation.z = -(((step % 12) + snap) * PITCH);
  const side = step % 2 === 0 ? 1 : -1;
  k.anchor.rotation.z = side * 0.2 * (2 * Math.min(1, snap * 1.4) - 1);

  // ---- lens pupil: saccades at rest, centred while striking, pinned small when hit ----
  let py = 0;
  let pz = 0;
  let ps = 1;
  const hit = s && (s.action === 'hitstun' || s.action === 'shieldbreak');
  if (hit) ps = 0.62;
  else if (s && (s.action === 'attack' || s.action === 'charge')) {
    py = -0.006;
  } else {
    const seg = Math.floor(info.t * 1.3 + 0.5);
    const u = info.t * 1.3 + 0.5 - seg;
    const e = ease.outCubic(clamp01(u / 0.1));
    const y0 = (hash(seg * 3 - 3) - 0.5) * 0.05;
    const y1 = (hash(seg * 3) - 0.5) * 0.05;
    const z0 = (hash(seg * 5 - 5) - 0.5) * 0.06;
    const z1 = (hash(seg * 5) - 0.5) * 0.06;
    py = y0 + (y1 - y0) * e;
    pz = z0 + (z1 - z0) * e;
  }
  if (p[C.eyes] < -0.5) ps *= 0.8;
  // the far edge of the lens is the facing direction on screen: the pupil leans there to look ahead
  if (s && !hit) pz = pz * 0.5 - facing * 0.03;
  k.pupil.position.set(0.222, 0.18 + py, pz);
  k.pupil.scale.set(1, ps, ps);

  if (k.smearMat) k.smearMat.opacity = s && s.hitlag > 0 ? 0.28 : 1;
  if (k.trail) trailUpdate(h, k, s, info, live);

  // ---- heel springs ----
  const spr = Math.max(0, p[C.aux + SPRING]);
  for (const sg of k.springs) {
    sg.visible = spr > 0.02;
    if (sg.visible) sg.scale.set(1, spr, 1);
  }

  // ---- Overclock Dart slash crescents ----
  let sa = 0;
  if (info.move === 'special' && s && s.action === 'attack') {
    for (let j = 0; j < SLASH_AT.length; j++) {
      const u = info.f - SLASH_AT[j];
      if (u >= 0 && u < 2.6) {
        sa = 1 - (u / 2.6) * (u / 2.6);
        k.slash.rotation.set(0, 0, SLASH_ROT[j] + u * 0.25 * (j % 2 ? -1 : 1));
        const sc = 0.9 + 0.25 * (u / 2.6);
        k.slash.scale.set(sc, sc, sc);
        break;
      }
    }
  }
  k.slash.visible = sa > 0.02;
  k.slashMat.opacity = sa;
  k.slashEdge.opacity = sa * 0.85;

  // ---- glow and lens ----
  const over = Math.max(0, p[C.aux + WHEEL]);
  const flick = 0.93 + 0.07 * Math.sin(info.t * 31);
  h.mats.glow.emissiveIntensity = (0.9 + Math.max(0, p[C.glow]) * 1.1 + over * 2.2 + info.charge * 2) * flick;
  h.mats.eye.emissiveIntensity = Math.max(0.1, 2.3 + p[C.eyes] * 1.5);
}

const TRAIL_LIME = new THREE.Color('#d4ff4a');
const TRAIL_WHITE = new THREE.Color('#f4f8ff');
const _tTop = new THREE.Vector3();
const _tBot = new THREE.Vector3();
/** how strongly the speed trail draws for this state (0 = off) */
function trailWant(s: FighterState | null, f: number): number {
  if (!s) return 0;
  // the sprint at full speed leaves a faint wake (Tick is the fastest thing on the deck)
  if (s.action === 'run' && s.grounded) return Math.abs(s.vx) > 0.17 ? 0.45 : 0;
  if (s.action !== 'attack' || !s.move) return 0;
  if (s.move === 'special') return f >= 8 && f <= 25 ? 1 : 0;
  if (s.move === 'recover') return f >= 6 && f <= 29 ? 1 : 0;
  if (s.move === 'dash') return f >= 4 && f <= 13 ? 0.7 : 0;
  return 0;
}
/** a ribbon along the path of the body's centre over the last frames, as wide as the body across the
 *  path: the dart and Unwind read as a blur of speed, white at the body and lime toward the tail */
function trailUpdate(h: RigHandles, k: TickParts, s: FighterState | null, info: FrameInfo, live: boolean): void {
  const tr = k.trail!;
  const want = trailWant(s, info.f);
  const P = k.trailPts; // per sample: centre xyz (3) + unused (3)
  if (!live) {
    k.trailN = 0;
    k.trailA = 0;
  }
  if (want > 0) {
    h.joint('chest').getWorldPosition(_tTop);
    h.joint('hips').getWorldPosition(_tBot);
    _tTop.lerp(_tBot, 0.3);
    // only a new sample when the body has moved (the hit pause keeps the trail as it was)
    const n = k.trailN;
    const moved = n === 0 || Math.hypot(_tTop.x - P[(n - 1) * 6], _tTop.y - P[(n - 1) * 6 + 1]) > 0.03;
    if (moved) {
      if (n >= TRAIL_N) {
        P.copyWithin(0, 6);
        k.trailN = TRAIL_N - 1;
      }
      const o = k.trailN * 6;
      P[o] = _tTop.x; P[o + 1] = _tTop.y; P[o + 2] = _tTop.z - 0.2;
      k.trailN++;
    }
    k.trailA = Math.min(want, k.trailA + 0.34);
  } else if (k.trailN > 0) {
    // the tail catches up with the body and fades
    if (live) {
      P.copyWithin(0, Math.min(2, k.trailN) * 6);
      k.trailN = Math.max(0, k.trailN - 2);
    }
    k.trailA *= 0.8;
  }
  const n = k.trailN;
  if (n < 3 || k.trailA < 0.03) {
    tr.visible = false;
    return;
  }
  tr.visible = true;
  const pos = tr.geometry.getAttribute('position') as THREE.BufferAttribute;
  const col = tr.geometry.getAttribute('color') as THREE.BufferAttribute;
  const pa = pos.array as Float32Array;
  const ca = col.array as Float32Array;
  const rx = h.root.position.x;
  const ry = h.root.position.y;
  const rz = h.root.position.z;
  for (let i = 0; i < TRAIL_N; i++) {
    const j = Math.min(i, n - 1);
    const o = j * 6;
    const a0 = Math.max(0, j - 1) * 6;
    const a1 = Math.min(n - 1, j + 1) * 6;
    let tx = P[a1] - P[a0];
    let ty = P[a1 + 1] - P[a0 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const u = j / (n - 1); // 0 tail .. 1 head
    const half = 0.36 * (0.25 + 0.75 * u);
    const q = i * 6;
    pa[q] = P[o] - ty * half - rx; pa[q + 1] = P[o + 1] + tx * half - ry; pa[q + 2] = P[o + 2] - rz;
    pa[q + 3] = P[o] + ty * half - rx; pa[q + 4] = P[o + 1] - tx * half - ry; pa[q + 5] = P[o + 2] - rz;
    const a = i < n ? k.trailA * Math.pow(u, 1.2) * 0.85 : 0;
    const c = u > 0.7 ? TRAIL_WHITE : TRAIL_LIME;
    const w = i * 8;
    ca[w] = c.r; ca[w + 1] = c.g; ca[w + 2] = c.b; ca[w + 3] = a;
    ca[w + 4] = c.r; ca[w + 5] = c.g; ca[w + 6] = c.b; ca[w + 7] = a;
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
}

// ------------------------------------------------------------------------------------------------

function spec(def: FighterDef): RobotSpec {
  const moves = tickMoves(def);
  initAccents(def, moves);
  return {
    id: 'tick',
    body: BODY,
    palette: {
      // arc white enamel over a lime body, gunmetal legs, graphite joints
      paint: '#e8eef5',
      paint2: '#b6f000',
      trim: '#cfd7e0',
      dark: '#262b33',
      glow: '#b6f000',
      eye: '#eaffb4',
      // mirror match: a slate shell (the values flip), the lime body stays, so it is still Tick
      alt: { paint: '#4b5563', paint2: '#b6f000' },
    },
    gait: {
      walkCycle: 1.3, walkDuty: 0.55, walkLift: 0.1, walkBob: 0.025, walkSwing: 26, walkLean: 5,
      runCycle: 2.6, runDuty: 0.27, runLift: 0.26, runBob: 0.06, runSwing: 74, runLean: 12,
      breathRate: 1.2, breathDepth: 0.8,
      turnFrames: 3,
    },
    threeQuarter: 32,
    build,
    poses: P,
    moves,
    actions: { attack: attackAnim, idle: idleAnim },
    carry,
    show,
    update,
  };
}

let cached: RobotSpec | null = null;
export const createFighter: CreateFighterView = (ctx, opts) => {
  if (!cached) cached = spec(ctx.fighterDefs.tick);
  return createRobot(ctx, opts, cached);
};
