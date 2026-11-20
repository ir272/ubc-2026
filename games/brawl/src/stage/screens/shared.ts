// Shared tools for the full-screen broadcast screens (select, versus).
//
// The screens draw their plates and robots in three.js, locked to the camera and laid out in the
// same 1280x720 pixel space as the DOM overlay, so a robot can stand on a plate and the DOM can put
// type over both. `ScreenSpace` is that layer: a group glued to ctx.camera each frame whose child
// `px` is scaled so one unit is one UI pixel at its depth (x right from the left edge, y down from
// the top, as in CSS). Plates are canvas textures on the SET layer drawn over the arena (no depth
// test, sorted last); robots are the real fighter views on the FIGHTER layer.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FighterView, StageCtx } from '../api.ts';
import { LAYER } from '../api.ts';
import type { FighterId, FighterState, Side } from '../../sim/types.ts';
import { FONTS, PALETTE, UI_H, UI_W, el } from '../style.ts';
import { C, createRobot, pose, type FrameInfo, type Kit, type Pose, type PoseSet, type Proportions, type RigHandles, type RobotSpec } from '../rig.ts';
import { createFighter as createKiln } from '../fighters/kiln.ts';
import { createFighter as createTick } from '../fighters/tick.ts';
import { createFighter as createGantry } from '../fighters/gantry.ts';
import { createFighter as createVise } from '../fighters/vise.ts';

export const FACTORIES = { kiln: createKiln, tick: createTick, gantry: createGantry, vise: createVise } as const;

/** how far in front of the camera the screen plane sits (inside the arena fog's near distance) */
const DEPTH = 14;
let order = 5000;

export interface CanvasPlate {
  /** positioned at the plate's centre; move/scale this */
  group: THREE.Group;
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  /** call after drawing on g */
  commit(): void;
  setOpacity(a: number): void;
}

export class ScreenSpace {
  readonly root = new THREE.Group();
  readonly px = new THREE.Group();
  private ctx: StageCtx;
  private disposables: { dispose(): void }[] = [];
  private lights: THREE.Group;

  constructor(ctx: StageCtx, lightsOn = true) {
    this.ctx = ctx;
    this.root.name = 'screen-space';
    this.root.add(this.px);
    this.root.visible = false;
    ctx.scene.add(this.root);
    // our own light rig for the robots on a flat screen: a warm key from the front left,
    // a cool rim from behind right, a soft fill. Lights reach every layer.
    this.lights = new THREE.Group();
    if (lightsOn) {
      const key = new THREE.DirectionalLight('#fff4e6', 1.6);
      key.position.set(-4, 5, 8);
      const rim = new THREE.DirectionalLight('#9cc4ff', 2.6);
      rim.position.set(6, 4, -6);
      const rim2 = new THREE.DirectionalLight('#ffd2b0', 1.6);
      rim2.position.set(-7, 2, -5);
      const fill = new THREE.HemisphereLight('#c8d6ea', '#1a2230', 0.35);
      for (const l of [key, rim, rim2]) {
        l.target.position.set(0, 0, 0);
        this.lights.add(l, l.target);
      }
      this.lights.add(fill);
    }
    this.lights.position.set(0, 0, -DEPTH);
    this.lights.traverse((o) => o.layers.enableAll());
    this.root.add(this.lights);
  }

  /** glue to the camera; call every frame the screen is up (after the camera module has moved it) */
  sync(): void {
    const cam = this.ctx.camera;
    cam.updateMatrixWorld();
    this.root.matrixAutoUpdate = true;
    cam.matrixWorld.decompose(this.root.position, this.root.quaternion, this.root.scale);
    this.root.scale.set(1, 1, 1);
    const halfH = DEPTH * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const s = (2 * halfH) / UI_H;
    this.px.position.set((-UI_W / 2) * s, (UI_H / 2) * s, -DEPTH);
    this.px.scale.set(s, -s, s);
  }

  setVisible(on: boolean): void {
    this.root.visible = on;
  }

  /** a canvas-textured rectangle at (x, y, w, h) in UI px, drawn over the arena in creation order */
  plate(x: number, y: number, w: number, h: number, parent: THREE.Object3D = this.px, res = 1): CanvasPlate {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(w * res));
    canvas.height = Math.max(2, Math.round(h * res));
    const g = canvas.getContext('2d')!;
    g.scale(res, res);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    const geo = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geo, mat);
    // px space has y flipped: flip the plane back so the canvas reads upright
    mesh.scale.y = -1;
    mesh.renderOrder = order++;
    mesh.layers.set(LAYER.SET);
    const group = new THREE.Group();
    group.position.set(x + w / 2, y + h / 2, 0);
    group.add(mesh);
    parent.add(group);
    this.disposables.push(geo, mat, tex);
    return {
      group,
      mesh,
      canvas,
      g,
      commit() {
        tex.needsUpdate = true;
      },
      setOpacity(a: number) {
        mat.opacity = a;
        mesh.visible = a > 0.001;
      },
    };
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.root.removeFromParent();
  }
}

/** a resting fighter state for poses outside the fight */
export function restState(fighter: FighterId, facing: 1 | -1): FighterState {
  return {
    fighter, x: 0, y: 0, vx: 0, vy: 0, facing, action: 'idle', actionFrame: 1, move: null, charge: 0,
    grounded: true, platform: -1, ledge: -1, damage: 0, lives: 2, shield: 100, hitlag: 0, hitstun: 0,
    tumble: false, kbx: 0, kby: 0, invuln: 0, armor: false, airJumpsLeft: 1, fastFall: false,
  } as FighterState;
}

/** A robot standing in screen space: holder at the feet point, scaled so the robot is `heightPx` tall. */
export interface ScreenRobot {
  id: FighterId;
  holder: THREE.Group;
  view: FighterView;
  dispose(): void;
}

/** a fighter file that is still the capsule placeholder draws only a handful of meshes */
function meshCount(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) n++;
  });
  return n;
}

/** the fighter view for the screens: the real robot, or our screen stand-in while its file is a capsule */
export function screenFighter(ctx: StageCtx, id: FighterId, side: Side, sideColor: string, alt: boolean): FighterView {
  const view = FACTORIES[id](ctx, { side, sideColor, alt });
  const sp = STANDIN[id];
  if (!sp || meshCount(view.root) >= 14) return view;
  view.dispose();
  return createRobot(ctx, { side, sideColor, alt }, sp());
}

export function makeRobot(
  ctx: StageCtx, parent: THREE.Object3D, id: FighterId, side: Side, sideColor: string, alt: boolean, facing: 1 | -1,
): ScreenRobot {
  const view = screenFighter(ctx, id, side, sideColor, alt);
  const holder = new THREE.Group();
  // undo the px flip so the robot stands upright
  const flip = new THREE.Group();
  flip.scale.set(1, -1, 1);
  holder.add(flip);
  flip.add(view.root);
  parent.add(holder);
  const s = restState(id, facing);
  try {
    view.pose(s, s, 1, restState(id, facing === 1 ? -1 : 1), 0, side);
  } catch {
    /* a fighter view under construction elsewhere: the show pose below still places it */
  }
  view.root.position.set(0, 0, 0);
  return {
    id,
    holder,
    view,
    dispose() {
      view.dispose();
      holder.removeFromParent();
    },
  };
}

/** place a robot: feet at (x, y) UI px, `heightPx` tall for its sim height */
export function placeRobot(r: ScreenRobot, ctx: StageCtx, x: number, y: number, heightPx: number, z = 0): void {
  const h = ctx.fighterDefs[r.id].height;
  r.holder.position.set(x, y, z);
  r.holder.scale.setScalar(heightPx / h);
}

// ---- easing and timing ----

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t: number) => Math.pow(clamp01(t), 3);
export const easeOutBack = (t: number, k = 1.9) => {
  const x = clamp01(t) - 1;
  return 1 + (k + 1) * x * x * x + k * x * x;
};
/** 0..1 over [t0, t0+dur] ms */
export const span = (ms: number, t0: number, dur: number) => clamp01((ms - t0) / dur);

/** small deterministic hash -> [0, 1) */
export function hash01(...parts: (string | number)[]): number {
  let h = 2166136261;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** draw a polygon path on a 2D context */
export function poly(g: CanvasRenderingContext2D, pts: [number, number][]): void {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

/** diagonal stripes clipped to the current path */
export function hatch(g: CanvasRenderingContext2D, w: number, h: number, gap: number, width: number, color: string, slope = 1): void {
  g.save();
  g.clip();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  for (let x = -h * Math.abs(slope); x < w + h * Math.abs(slope); x += gap) {
    g.moveTo(x, h);
    g.lineTo(x + h * slope, 0);
  }
  g.stroke();
  g.restore();
}

export function record(r: { played: number; wins: number }): string {
  return `${r.wins}-${Math.max(0, r.played - r.wins)}`;
}

// ================================================================================================
// Screen stand-ins for the robots whose fighter files are still capsules.
//
// Built on the shared rig (createRobot) from the ARCH table and the moves' `look` notes, so a
// viewer meets the real cast on the select and versus screens. Only the screens use them, and only
// while a fighter file draws fewer than 14 meshes: the moment the real robot lands, it replaces its
// stand-in here. Custom geometry keys carry a `scr-` prefix so they never collide with a real file.
// ================================================================================================

const GAIT = {
  walkCycle: 1.5, walkDuty: 0.6, walkLift: 0.12, walkBob: 0.03, walkSwing: 22, walkLean: 4,
  runCycle: 2.7, runDuty: 0.36, runLift: 0.26, runBob: 0.06, runSwing: 46, runLean: 16,
  breathRate: 0.8, breathDepth: 1.1, turnFrames: 5,
};

const AIR = (extra: Parameters<typeof pose>[0] = {}) => pose({
  plant: 0, chest: [6], head: [-8], arms: [25, 0, 35], fores: [70],
  thighL: [40], shinL: [-70], thighR: [12], shinR: [-34], feet: [10], grip: 1, glow: 0.3, ...extra,
});

/** emissive eyes and vents from the pose, plus a flicker; clamp jaws from the grip channels */
function lightsAndJaws(h: RigHandles, p: Pose, info: FrameInfo, jaw: number, eyeBase = 2.2): void {
  const glow = Math.max(0, p[C.glow]);
  const flick = 0.92 + 0.08 * Math.sin(info.t * 21) * Math.sin(info.t * 6.7);
  h.mats.glow.emissiveIntensity = (0.8 + glow * 2.2) * flick;
  h.mats.eye.emissiveIntensity = Math.max(0.05, eyeBase + p[C.eyes] * 1.6);
  if (jaw > 0) {
    for (const sd of ['L', 'R'] as const) {
      const g = sd === 'L' ? p[C.gripL] : p[C.gripR];
      const open = (1 - Math.min(1, Math.max(0, g))) * jaw;
      try {
        h.part(`jawA${sd}`).rotation.z = open;
        h.part(`jawB${sd}`).rotation.z = -open;
      } catch {
        /* this robot has no jaws on that hand */
      }
    }
  }
}

// ---- Tick: the small clockwork sprinter. Clock-face head, blade antennae, blade hands, a key ----

const TICK_BODY: Proportions = {
  ankle: 0.1, shin: 0.24, thigh: 0.22, hipWidth: 0.24, chestY: 0.07, neckY: 0.37, neckX: 0.02,
  shoulderX: 0, shoulderY: 0.28, shoulderZ: 0.24, upperArm: 0.2, forearm: 0.2, handReach: 0.14,
  stanceWidth: 0.36, armStretch: 0, centerY: 0.62,
};

function tickBuild(k: Kit): void {
  const m = k.mats;
  k.box('hips', [0.22, 0.14, 0.3], m.paint2, [0, 0, 0], undefined, 0.05);
  // torso: white enamel barrel, a brass collar, a clock face on the chest
  k.box('chest', [0.3, 0.34, 0.38], m.paint, [0, 0.17, 0], undefined, 0.1);
  k.box('chest', [0.26, 0.1, 0.32], m.paint2, [-0.01, 0.01, 0], undefined, 0.04);
  k.cyl('chest', 0.125, 0.14, 0.05, m.trim, [0, 0.355, 0]);
  k.cyl('chest', 0.12, 0.12, 0.04, m.trim, [0.15, 0.19, 0], [0, 0, 90], 20);
  k.cyl('chest', 0.098, 0.098, 0.05, m.dark, [0.155, 0.19, 0], [0, 0, 90], 20);
  k.box('chest', [0.012, 0.075, 0.016], m.glow, [0.185, 0.215, 0.0], [20, 0, 0], 0.004);
  k.box('chest', [0.012, 0.05, 0.016], m.glow, [0.185, 0.19, 0.02], [-70, 0, 0], 0.004);
  // the winding key on the back
  k.group('chest', 'key', [-0.16, 0.2, 0]);
  k.cyl('key', 0.026, 0.026, 0.14, m.trim, [-0.06, 0, 0], [0, 0, 90]);
  k.mesh('key', 'scr-tick-bow', () => {
    const a = new THREE.TorusGeometry(0.06, 0.022, 8, 16).rotateY(Math.PI / 2).translate(-0.15, 0, -0.07);
    const b = new THREE.TorusGeometry(0.06, 0.022, 8, 16).rotateY(Math.PI / 2).translate(-0.15, 0, 0.07);
    return mergeGeometries([a, b])!;
  }, m.trim);
  // head: a round clock: white shell, dark glass face in a brass bezel, two round eyes
  k.sphere('head', 0.215, m.paint, [0.0, 0.17, 0], [0.95, 0.92, 1], 20);
  k.cyl('head', 0.15, 0.15, 0.06, m.dark, [0.15, 0.16, 0], [0, 0, 90], 22);
  k.mesh('head', 'scr-tick-bezel', () => new THREE.TorusGeometry(0.152, 0.022, 8, 24).rotateY(Math.PI / 2), m.trim, [0.18, 0.16, 0]);
  k.sphere('head', 0.036, m.eye, [0.18, 0.18, -0.055], [0.6, 1, 1], 10);
  k.sphere('head', 0.036, m.eye, [0.18, 0.18, 0.055], [0.6, 1, 1], 10);
  k.box('head', [0.02, 0.02, 0.07], m.eye, [0.18, 0.105, 0], undefined, 0.006);
  k.cyl('head', 0.05, 0.06, 0.05, m.paint2, [-0.02, 0.38, 0]);
  // blade antennae swept back
  k.mesh('head', 'scr-tick-ant', () => new THREE.ConeGeometry(0.045, 0.42, 4).scale(1, 1, 0.28).translate(0, 0.21, 0), m.trim, [-0.04, 0.33, -0.08], [-12, 0, 48]);
  k.mesh('head', 'scr-tick-ant', () => new THREE.ConeGeometry(0.045, 0.42, 4).scale(1, 1, 0.28).translate(0, 0.21, 0), m.trim, [-0.04, 0.33, 0.08], [12, 0, 48]);
  for (const sd of ['L', 'R'] as const) {
    const z = sd === 'L' ? -1 : 1;
    k.sphere(`shoulder${sd}`, 0.095, m.paint2, [0, 0.02, z * 0.25], undefined, 14);
    k.box(`shoulder${sd}`, [0.12, 0.05, 0.12], m.side, [0, 0.105, z * 0.26], undefined, 0.02);
    k.cyl(`arm${sd}`, 0.04, 0.035, 0.2, m.dark, [0, -0.1, 0]);
    k.sphere(`fore${sd}`, 0.045, m.trim, [0, 0, 0], undefined, 10);
    k.box(`fore${sd}`, [0.09, 0.17, 0.09], m.paint, [0, -0.09, 0], undefined, 0.03);
    k.cyl(`hand${sd}`, 0.05, 0.05, 0.035, m.trim, [0, -0.01, 0], [90, 0, 0], 12);
    // blade hand
    k.mesh(`hand${sd}`, 'scr-tick-blade', () => new THREE.ConeGeometry(0.065, 0.28, 4).scale(1, 1, 0.22).rotateZ(Math.PI).translate(0.02, -0.15, 0), m.trim);
    k.cyl(`thigh${sd}`, 0.05, 0.045, 0.22, m.dark, [0, -0.11, 0]);
    k.sphere(`shin${sd}`, 0.05, m.trim, [0, 0, 0], undefined, 10);
    k.box(`shin${sd}`, [0.1, 0.2, 0.1], m.paint, [0.01, -0.11, 0], undefined, 0.035);
    k.box(`foot${sd}`, [0.24, 0.07, 0.12], m.paint2, [0.05, -0.06, 0], undefined, 0.03);
    k.box(`foot${sd}`, [0.07, 0.06, 0.1], m.trim, [0.17, -0.065, 0], undefined, 0.02);
  }
}

function tickSpec(): RobotSpec {
  const stance = pose({
    y: -0.04, lean: 6, hips: [6, 8], chest: [10, -10], head: [-10, 10],
    armL: [44, 0, 18], foreL: [64], armR: [-14, 0, 22], foreR: [58], grip: 1,
    fL: [0.17, 0], fR: [-0.15, 0], glow: 0.4,
  });
  const P: Partial<PoseSet> & { stance: Pose; air: Pose } = {
    stance,
    air: AIR(),
    versus: pose({
      y: -0.1, lean: 12, chest: [20, -18], head: [-24, 14], armL: [96, 0, 8], foreL: [26], armR: [-46, 0, 34], foreR: [44],
      fL: [0.26, 0], fR: [-0.24, 0], eyes: 1, glow: 1, yaw: 18,
    }, stance),
  };
  return {
    id: 'tick', body: TICK_BODY,
    palette: { paint: '#eef2f5', paint2: '#16a69c', trim: '#d9a548', dark: '#1d2228', glow: '#62f0ff', eye: '#8ff9ff', alt: { paint: '#2a2f37', paint2: '#e0a33a' } },
    gait: GAIT, threeQuarter: 32, build: tickBuild, poses: P,
    update(h, p, _s, info) {
      lightsAndJaws(h, p, info, 0);
      h.part('key').rotation.x = info.t * 2.4;
    },
  };
}

// ---- Gantry: the tall crane. Cab head with a beacon, a lattice jib arm with a hook, a rivet gun ----

const GANTRY_BODY: Proportions = {
  ankle: 0.13, shin: 0.42, thigh: 0.4, hipWidth: 0.3, chestY: 0.1, neckY: 0.72, neckX: 0.0,
  shoulderX: 0, shoulderY: 0.6, shoulderZ: 0.3, upperArm: 0.38, forearm: 0.38, handReach: 0.18,
  stanceWidth: 0.42, armStretch: 0.9, centerY: 1.2,
};

function gantryBuild(k: Kit): void {
  const m = k.mats;
  k.box('hips', [0.26, 0.2, 0.36], m.paint2, [0, 0, 0], undefined, 0.05);
  // the mast: a dark core with yellow cross braces, a yellow cab block on top
  k.box('chest', [0.22, 0.4, 0.28], m.dark, [0, 0.2, 0], undefined, 0.03);
  for (const zz of [-0.13, 0.13]) {
    k.box('chest', [0.03, 0.46, 0.03], m.paint, [0.12, 0.2, zz * 0.5], [32, 0, 0], 0.01);
    k.box('chest', [0.03, 0.46, 0.03], m.paint, [0.12, 0.2, zz * 0.5], [-32, 0, 0], 0.01);
  }
  k.box('chest', [0.03, 0.46, 0.03], m.paint, [0.11, 0.2, -0.14], undefined, 0.01);
  k.box('chest', [0.03, 0.46, 0.03], m.paint, [0.11, 0.2, 0.14], undefined, 0.01);
  k.box('chest', [0.4, 0.32, 0.5], m.paint, [0.02, 0.52, 0], undefined, 0.06);
  k.box('chest', [0.42, 0.06, 0.52], m.paint2, [0.02, 0.7, 0], undefined, 0.02);
  // a stripe band across the cab front in the side colour
  k.box('chest', [0.03, 0.08, 0.44], m.side, [0.22, 0.48, 0], undefined, 0.01);
  // the counterweight block on the back
  k.box('chest', [0.24, 0.36, 0.42], m.paint2, [-0.3, 0.46, 0], undefined, 0.04);
  k.box('chest', [0.03, 0.3, 0.36], m.paint, [-0.43, 0.46, 0], undefined, 0.01);
  for (const yy of [0.36, 0.56]) for (const zz of [-0.12, 0.12]) k.sphere('chest', 0.025, m.trim, [-0.445, yy, zz], undefined, 8);
  // head: the cab, a wide lit windscreen, a roof, a mast with a beacon
  k.box('head', [0.3, 0.24, 0.32], m.paint, [0.03, 0.12, 0], undefined, 0.05);
  k.box('head', [0.05, 0.11, 0.28], m.eye, [0.17, 0.14, 0], undefined, 0.02);
  k.box('head', [0.36, 0.045, 0.36], m.paint2, [0.04, 0.265, 0], undefined, 0.015);
  k.cyl('head', 0.016, 0.016, 0.26, m.dark, [-0.08, 0.4, 0.1]);
  k.sphere('head', 0.04, m.glow, [-0.08, 0.54, 0.1], undefined, 10);
  k.box('head', [0.08, 0.06, 0.34], m.dark, [0.04, -0.02, 0], undefined, 0.02);
  for (const sd of ['L', 'R'] as const) {
    const z = sd === 'L' ? -1 : 1;
    k.box(`shoulder${sd}`, [0.24, 0.18, 0.18], m.paint2, [0, 0.04, z * 0.32], undefined, 0.04);
    k.box(`shoulder${sd}`, [0.18, 0.05, 0.17], m.side, [0, 0.145, z * 0.33], undefined, 0.015);
    k.sphere(`shoulder${sd}`, 0.075, m.trim, [0, 0, z * 0.3], undefined, 10);
    k.cyl(`thigh${sd}`, 0.055, 0.05, 0.4, m.dark, [0, -0.2, 0]);
    k.sphere(`shin${sd}`, 0.06, m.trim, [0, 0, 0], undefined, 10);
    k.box(`shin${sd}`, [0.13, 0.4, 0.12], m.paint, [0.01, -0.2, 0], undefined, 0.03);
    k.box(`shin${sd}`, [0.03, 0.34, 0.13], m.paint2, [0.075, -0.2, 0], undefined, 0.01);
    k.box(`foot${sd}`, [0.4, 0.1, 0.2], m.paint2, [0.06, -0.08, 0], undefined, 0.03);
    k.box(`foot${sd}`, [0.12, 0.08, 0.21], m.paint, [0.22, -0.085, 0], undefined, 0.02);
  }
  // right arm: the jib. A lattice boom, a telescoping rod, the hook
  k.box('armR', [0.11, 0.38, 0.11], m.paint, [0, -0.19, 0], undefined, 0.02);
  k.box('armR', [0.02, 0.4, 0.12], m.dark, [0.06, -0.19, 0], [0, 0, 0], 0.005);
  k.box('foreR', [0.1, 0.36, 0.1], m.paint, [0, -0.18, 0], undefined, 0.02);
  k.box('foreR', [0.115, 0.05, 0.115], m.paint2, [0, -0.34, 0], undefined, 0.01);
  k.mesh('stretchR', 'scr-gantry-rod', () => new THREE.CylinderGeometry(0.04, 0.04, 1, 8).translate(0, -0.5, 0), m.trim);
  k.cyl('handR', 0.02, 0.02, 0.1, m.dark, [0, -0.04, 0]);
  k.mesh('handR', 'scr-gantry-hook', () => new THREE.TorusGeometry(0.085, 0.028, 8, 14, Math.PI * 1.35).rotateZ(Math.PI * 0.95).translate(0.0, -0.18, 0), m.trim);
  k.box('handR', [0.07, 0.07, 0.07], m.paint2, [0, -0.08, 0], undefined, 0.015);
  // left arm: the rivet gun on the forearm
  k.box('armL', [0.11, 0.36, 0.11], m.paint, [0, -0.18, 0], undefined, 0.02);
  k.box('foreL', [0.14, 0.3, 0.14], m.paint2, [0, -0.15, 0], undefined, 0.03);
  k.cyl('foreL', 0.05, 0.055, 0.34, m.dark, [0.08, -0.2, 0], undefined, 12);
  k.cyl('foreL', 0.06, 0.06, 0.04, m.glow, [0.08, -0.38, 0], undefined, 12);
  k.box('foreL', [0.05, 0.1, 0.1], m.paint, [0.0, -0.32, 0], undefined, 0.01);
  k.group('handL', 'jawAL', [0.02, 0, 0]);
  k.group('handL', 'jawBL', [-0.02, 0, 0]);
  k.box('jawAL', [0.05, 0.13, 0.1], m.dark, [0.03, -0.06, 0], undefined, 0.015);
  k.box('jawBL', [0.05, 0.13, 0.1], m.dark, [-0.03, -0.06, 0], undefined, 0.015);
}

function gantrySpec(): RobotSpec {
  const stance = pose({
    y: -0.03, chest: [4, -8], head: [-6, 8], armR: [36, 0, 14], foreR: [44], armL: [10, 0, 18], foreL: [70],
    grip: 1, fL: [0.2, 0], fR: [-0.18, 0], glow: 0.3,
  });
  const P: Partial<PoseSet> & { stance: Pose; air: Pose } = {
    stance,
    air: AIR(),
    versus: pose({
      y: -0.06, lean: -4, chest: [-4, 22], head: [-12, -10], armR: [158, 0, 18], foreR: [18], armL: [88, 0, -6], foreL: [8],
      grip: 0.4, fL: [0.3, 0], fR: [-0.26, 0], eyes: 1, glow: 1, yaw: 22,
    }, stance),
  };
  return {
    id: 'gantry', body: GANTRY_BODY,
    palette: { paint: '#f2b21c', paint2: '#2b333d', trim: '#c7d0da', dark: '#1b2027', glow: '#ff6a2a', eye: '#fff1b8', alt: { paint: '#e4ebf2', paint2: '#2b333d' } },
    gait: GAIT, threeQuarter: 30, build: gantryBuild, poses: P,
    update(h, p, _s, info) {
      lightsAndJaws(h, p, info, 0.4);
    },
  };
}

// ---- Vise: the grappler. Huge shoulders, a press plate chest, two giant clamp hands ----

const VISE_BODY: Proportions = {
  ankle: 0.15, shin: 0.28, thigh: 0.28, hipWidth: 0.46, chestY: 0.12, neckY: 0.64, neckX: 0.06,
  shoulderX: -0.02, shoulderY: 0.56, shoulderZ: 0.6, upperArm: 0.32, forearm: 0.32, handReach: 0.24,
  stanceWidth: 0.62, armStretch: 0.3, centerY: 1.0,
};

function viseBuild(k: Kit): void {
  const m = k.mats;
  k.box('hips', [0.4, 0.26, 0.6], m.paint2, [0, 0, 0], undefined, 0.07);
  // a wedge of a chest: wide on top, a bolted press plate on the front, a dark yoke
  k.box('chest', [0.6, 0.5, 0.92], m.paint, [0, 0.34, 0], undefined, 0.12);
  k.box('chest', [0.44, 0.24, 0.6], m.paint, [0, 0.1, 0], undefined, 0.08);
  k.box('chest', [0.07, 0.34, 0.6], m.paint2, [0.31, 0.34, 0], undefined, 0.03);
  for (const yy of [0.22, 0.46]) for (const zz of [-0.22, 0.22]) k.sphere('chest', 0.035, m.trim, [0.35, yy, zz], undefined, 8);
  k.box('chest', [0.04, 0.06, 0.4], m.glow, [0.34, 0.34, 0], undefined, 0.01);
  k.box('chest', [0.52, 0.14, 0.74], m.dark, [-0.04, 0.62, 0], undefined, 0.04);
  // hydraulic lines down the back
  k.cyl('chest', 0.035, 0.035, 0.5, m.trim, [-0.32, 0.34, -0.22]);
  k.cyl('chest', 0.035, 0.035, 0.5, m.trim, [-0.32, 0.34, 0.22]);
  // head: small and sunk low between the shoulders, a slit visor, a chin guard
  k.box('head', [0.3, 0.22, 0.32], m.paint2, [0.05, 0.06, 0], undefined, 0.06);
  k.box('head', [0.035, 0.05, 0.26], m.eye, [0.205, 0.08, 0], undefined, 0.012);
  k.box('head', [0.22, 0.08, 0.36], m.paint, [0.11, -0.04, 0], undefined, 0.03);
  k.box('head', [0.26, 0.05, 0.3], m.paint, [0.02, 0.19, 0], [0, 0, -8], 0.02);
  for (const sd of ['L', 'R'] as const) {
    const z = sd === 'L' ? -1 : 1;
    // huge shoulder blocks with the side colour on their face
    k.box(`shoulder${sd}`, [0.56, 0.46, 0.42], m.paint, [0, 0.06, z * 0.64], undefined, 0.12);
    k.box(`shoulder${sd}`, [0.12, 0.34, 0.38], m.side, [0.25, 0.06, z * 0.65], undefined, 0.05);
    k.box(`shoulder${sd}`, [0.46, 0.07, 0.34], m.side, [-0.02, 0.29, z * 0.66], undefined, 0.03);
    // arm: dark upper, a piston forearm with a chrome rod alongside
    k.cyl(`arm${sd}`, 0.13, 0.12, 0.32, m.dark, [0, -0.15, 0]);
    k.box(`fore${sd}`, [0.3, 0.3, 0.3], m.paint2, [0, -0.13, 0], undefined, 0.07);
    k.cyl(`fore${sd}`, 0.035, 0.035, 0.34, m.trim, [-0.17, -0.15, 0]);
    k.cyl(`fore${sd}`, 0.14, 0.14, 0.05, m.trim, [0, -0.29, 0]);
    k.mesh(`stretch${sd}`, 'scr-vise-rod', () => new THREE.CylinderGeometry(0.065, 0.065, 1, 10).translate(0, -0.5, 0), m.trim);
    // the clamp: a hinge drum, two big jaws with chrome teeth
    k.cyl(`hand${sd}`, 0.11, 0.11, 0.44, m.dark, [0, -0.04, 0], [90, 0, 0], 14);
    k.group(`hand${sd}`, `jawA${sd}`, [0.05, -0.04, 0]);
    k.group(`hand${sd}`, `jawB${sd}`, [-0.05, -0.04, 0]);
    k.box(`jawA${sd}`, [0.14, 0.44, 0.42], m.paint, [0.08, -0.22, 0], [0, 0, 8], 0.05);
    k.box(`jawB${sd}`, [0.14, 0.44, 0.42], m.paint, [-0.08, -0.22, 0], [0, 0, -8], 0.05);
    k.box(`jawA${sd}`, [0.1, 0.1, 0.44], m.trim, [0.06, -0.44, 0], undefined, 0.02);
    k.box(`jawB${sd}`, [0.1, 0.1, 0.44], m.trim, [-0.06, -0.44, 0], undefined, 0.02);
    // legs: dark thighs, armoured shins, wide boots
    k.cyl(`thigh${sd}`, 0.14, 0.13, 0.28, m.dark, [0, -0.13, 0]);
    k.box(`shin${sd}`, [0.34, 0.32, 0.32], m.paint, [0.02, -0.15, 0], undefined, 0.08);
    k.box(`shin${sd}`, [0.12, 0.12, 0.22], m.trim, [0.18, -0.03, 0], undefined, 0.03);
    k.box(`foot${sd}`, [0.52, 0.18, 0.4], m.paint2, [0.06, -0.07, 0], undefined, 0.05);
    k.box(`foot${sd}`, [0.16, 0.15, 0.41], m.paint, [0.27, -0.08, 0], undefined, 0.04);
  }
}

function viseSpec(): RobotSpec {
  const stance = pose({
    y: -0.09, hips: [6, 6], chest: [12, -8], head: [-14, 8], armL: [28, 0, 30], foreL: [70], armR: [18, 0, 34], foreR: [80],
    grip: 1, fL: [0.22, 0], fR: [-0.2, 0], glow: 0.3,
  });
  const P: Partial<PoseSet> & { stance: Pose; air: Pose } = {
    stance,
    air: AIR(),
    versus: pose({
      y: -0.16, chest: [16, -10], head: [-16, 8], armL: [104, 0, 18], foreL: [74], armR: [70, 0, 30], foreR: [96],
      grip: 0, fL: [0.32, 0], fR: [-0.3, 0], eyes: 1, glow: 1, yaw: 24,
    }, stance),
  };
  return {
    id: 'vise', body: VISE_BODY,
    palette: { paint: '#3f8a5a', paint2: '#2a3038', trim: '#d9dee4', dark: '#1a1e23', glow: '#ffd23a', eye: '#ffe27a', alt: { paint: '#c4cad3', paint2: '#2a3038' } },
    gait: GAIT, threeQuarter: 32, build: viseBuild, poses: P,
    update(h, p, _s, info) {
      lightsAndJaws(h, p, info, 0.55);
    },
  };
}

const STANDIN_CACHE: Partial<Record<FighterId, RobotSpec>> = {};
const STANDIN: Partial<Record<FighterId, () => RobotSpec>> = {
  tick: () => (STANDIN_CACHE.tick ??= tickSpec()),
  gantry: () => (STANDIN_CACHE.gantry ??= gantrySpec()),
  vise: () => (STANDIN_CACHE.vise ??= viseSpec()),
};

/** each fighter's own accent (bay backgrounds, emblems): never a side colour */
export const ACCENT: Record<FighterId, { hi: string; lo: string }> = {
  kiln: { hi: '#e0672a', lo: '#3a1608' },
  tick: { hi: '#16a69c', lo: '#06302e' },
  gantry: { hi: '#f2b21c', lo: '#3a2a04' },
  vise: { hi: '#3f8a5a', lo: '#0f2a19' },
};
void PALETTE;

// ================================================================================================
// Fighter emblems (our own marks, drawn in code) and a painted, worn colour field
// ================================================================================================

/** draw a fighter's emblem centred at (0, 0), `r` its half size, filled with the current fillStyle */
export function emblem(g: CanvasRenderingContext2D, id: FighterId, r: number): void {
  g.save();
  g.beginPath();
  if (id === 'kiln') {
    // a furnace mouth: an arched door with three grate bars cut out, a flame tongue on top
    const w = r * 0.9;
    g.moveTo(-w, r);
    g.lineTo(-w, -r * 0.1);
    g.arc(0, -r * 0.1, w, Math.PI, 0);
    g.lineTo(w, r);
    g.closePath();
    for (let i = 0; i < 3; i++) {
      const y = -r * 0.05 + i * r * 0.3;
      g.rect(-w * 0.62, y, w * 1.24, r * 0.14);
    }
    g.fill('evenodd');
  } else if (id === 'tick') {
    // a cog with ten teeth and one clock hand
    const n = 10;
    for (let i = 0; i < n * 2; i++) {
      const a0 = (i / (n * 2)) * Math.PI * 2;
      const a1 = ((i + 1) / (n * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * 0.8;
      if (i === 0) g.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
      else g.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
      g.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
    }
    g.closePath();
    g.moveTo(r * 0.55, 0);
    g.arc(0, 0, r * 0.55, 0, Math.PI * 2, true);
    g.fill('evenodd');
    g.beginPath();
    g.moveTo(-r * 0.08, r * 0.08);
    g.lineTo(r * 0.06, -r * 0.5);
    g.lineTo(r * 0.14, r * 0.02);
    g.closePath();
    g.arc(0, 0, r * 0.12, 0, Math.PI * 2);
    g.fill();
  } else if (id === 'gantry') {
    // a jib: a long triangle truss on top, a cable and a hook below
    g.moveTo(-r, -r * 0.55);
    g.lineTo(r, -r * 0.55);
    g.lineTo(-r * 0.55, -r * 0.95);
    g.closePath();
    g.rect(-r, -r * 0.55, r * 2, r * 0.16);
    g.fill();
    g.beginPath();
    g.rect(r * 0.28, -r * 0.42, r * 0.08, r * 0.62);
    g.fill();
    g.beginPath();
    g.lineWidth = r * 0.16;
    g.strokeStyle = g.fillStyle;
    g.arc(r * 0.32, r * 0.48, r * 0.3, -Math.PI * 0.5, Math.PI * 0.95);
    g.stroke();
  } else {
    // a C clamp: two heavy jaws on a spine, a screw through the lower jaw
    g.moveTo(-r * 0.9, -r);
    g.lineTo(r * 0.7, -r);
    g.lineTo(r * 0.7, -r * 0.55);
    g.lineTo(-r * 0.4, -r * 0.55);
    g.lineTo(-r * 0.4, r * 0.55);
    g.lineTo(r * 0.7, r * 0.55);
    g.lineTo(r * 0.7, r);
    g.lineTo(-r * 0.9, r);
    g.closePath();
    g.fill();
    g.beginPath();
    g.rect(r * 0.32, -r * 0.4, r * 0.2, r * 0.8);
    g.rect(r * 0.12, -r * 0.48, r * 0.6, r * 0.12);
    g.fill();
  }
  g.restore();
}

/** a seeded generator for the textures */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** wear over whatever is in the current clip: dark blotches, scuffs along `slope`, a grain */
export function grunge(g: CanvasRenderingContext2D, w: number, h: number, seed: number, amount = 1, grain = true): void {
  const r = rng(seed);
  g.save();
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 60 + r() * 260;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = (0.1 + r() * 0.16) * amount;
    gr.addColorStop(0, `rgba(0,0,0,${a.toFixed(3)})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // scuffs: short pale and dark strokes
  for (let i = 0; i < 140; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = 20 + r() * 140;
    const ang = -0.3 + r() * 0.12;
    g.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${(0.025 + r() * 0.05) * amount})` : `rgba(0,0,0,${(0.05 + r() * 0.08) * amount})`;
    g.lineWidth = 1 + r() * 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.stroke();
  }
  g.restore();
  if (!grain) return;
  // grain: a noise tile laid over the field (made once, so a redraw costs a fill, not a pixel loop)
  g.save();
  g.globalAlpha = Math.min(1, 0.5 * amount);
  g.globalCompositeOperation = 'overlay';
  g.fillStyle = g.createPattern(noiseTile(), 'repeat')!;
  g.fillRect(0, 0, w, h);
  g.restore();
}

let _noise: HTMLCanvasElement | null = null;
function noiseTile(): HTMLCanvasElement {
  if (_noise) return _noise;
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const g = c.getContext('2d')!;
  const img = g.createImageData(192, 192);
  const r = rng(90210);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.round(128 + (r() - 0.5) * 120);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  _noise = c;
  return c;
}

const _hv = new THREE.Vector3();
/** the UI px position of a world point (for DOM laid over a robot) */
export function toUi(ctx: StageCtx, world: THREE.Vector3, out: { x: number; y: number }): { x: number; y: number } {
  _hv.copy(world).project(ctx.camera);
  out.x = ((_hv.x + 1) / 2) * UI_W;
  out.y = ((1 - _hv.y) / 2) * UI_H;
  return out;
}

/** our mark: a white diamond with the two letters (one shape, one shadow) */
export function buildMark(layer: HTMLElement): { root: HTMLElement; face: SVGElement } {
  const root = el('div', layer, { position: 'absolute', left: '0', top: '0', width: '0', height: '0', zIndex: '6', willChange: 'transform' });
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-200 -150 400 300');
  svg.setAttribute('width', '400');
  svg.setAttribute('height', '300');
  Object.assign(svg.style, { position: 'absolute', left: '-200px', top: '-150px', overflow: 'visible' });
  const add = (tag: string, attrs: Record<string, string>) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.appendChild(e);
    return e;
  };
  // the diamond
  const d = '0,-118 118,0 0,118 -118,0';
  add('polygon', { points: d, fill: PALETTE.ink, transform: 'translate(10 10)' });
  const face = add('polygon', { points: d, fill: PALETTE.white });
  const t = add('text', {
    x: '-4', y: '40', 'text-anchor': 'middle', fill: PALETTE.navy, 'font-family': FONTS.display, 'font-weight': '900',
    'font-size': '118', 'font-style': 'italic', 'letter-spacing': '-4',
  });
  t.textContent = 'VS';
  root.appendChild(svg);
  return { root, face };
}


const _fv = new THREE.Vector3();
const _fb = new THREE.Box3();
const _fb2 = new THREE.Box3();
const _fm = new THREE.Matrix4();
/** frame a robot as a bust: returns the holder position and scale that put its head point at
 *  (hx, hy) UI px, `above` px over its feet, and no wider than `maxW` px. Measured in `pose` at
 *  t = 2 s with the holder's z squashed by `flat`. */
export function bustFrame(
  r: ScreenRobot, root: THREE.Object3D, pose: 'versus' | 'select', hx: number, hy: number, above: number, maxW = 1e9, flat = 1,
): { x: number; y: number; k: number } {
  r.holder.position.set(0, 0, 0);
  r.holder.scale.set(1, 1, flat);
  r.view.showPose(pose, 2);
  root.updateMatrixWorld(true);
  r.view.point('head', _fv);
  r.holder.worldToLocal(_fv);
  const headH = Math.max(0.4, -_fv.y);
  // width: every visible mesh's box, in the holder's frame (x right, y down, metres)
  _fb.makeEmpty();
  _fm.copy(r.holder.matrixWorld).invert();
  r.view.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible || !m.geometry) return;
    let vis = true;
    for (let p: THREE.Object3D | null = m; p && p !== r.view.root; p = p.parent) if (!p.visible) vis = false;
    if (!vis) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    _fb2.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld).applyMatrix4(_fm);
    _fb.union(_fb2);
  });
  const width = _fb.isEmpty() ? 1 : Math.max(0.3, _fb.max.x - _fb.min.x);
  const k = Math.min(above / headH, maxW / width);
  return { x: hx - _fv.x * k, y: hy - _fv.y * k, k };
}
