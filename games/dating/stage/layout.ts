// Where things stand. Shared by set, cast, camera and director so none of them depends on another's
// meshes. Units are metres. Floor at y = 0, the audience (and the wide camera) at +z, the back wall
// at about z = -6. Viewer's left is -x (stage left: the star), viewer's right is +x (the suitors).
import * as THREE from 'three';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** yaw (radians about +y) that turns local +z toward the direction (dx, dz) */
export const yawTo = (dx: number, dz: number) => Math.atan2(dx, dz);

export const WALL = { center: v(0.9, 0, 3), radius: 9.6, height: 6.2 };

export const STAR = {
  riser: v(-3.4, 0, -0.6),
  riserRadius: 1.25,
  riserHeight: 0.28,
  /** where the star's feet go when seated (on the riser) */
  seat: v(-3.45, 0.28, -0.75),
  yaw: 0.95,
  wing: v(-7.6, 0, 0.6),
};

/** no prop stands here: it is where the star glances when she thinks about her type cards */
export const CARD_LOOK = v(-1.0, 1.35, -2.1);

export const SUITOR_RISER = { radius: 0.5, height: 0.18 };

/**
 * spot 0..3, left to right as the viewer sees the row; a shallow arc that curves toward the star.
 * Wide apart (2.1 m) so a close-up of one suitor never takes in a neighbour, whatever their size.
 */
export const SPOTS = [v(0.55, 0, -0.2), v(2.65, 0, -0.55), v(4.75, 0, -0.75), v(6.85, 0, -0.8)];
export const SPOT_YAW = [-0.5, -0.45, -0.42, -0.4];
export const SUITOR_FEET_Y = SUITOR_RISER.height;
export const LAMP_OFFSET = -0.74; // the suitor's lamp column stands this far behind its spot (z)
/**
 * The suitor's lamp: a plain bar behind the podium, the suitor's accent when on, dark when off. It
 * stays below the shortest avatar's shoulders, so heads and name tags have dark wall behind them.
 */
export const LAMP_BOX = { w: 0.46, h: 0.78, d: 0.2 };
/** each lamp column turns to face the audience (the wide camera) */
export const lampYaw = (spot: number) => {
  const p = SPOTS[Math.max(0, Math.min(3, spot))]!;
  return Math.atan2(CAMERA_HOME.pos.x - p.x, CAMERA_HOME.pos.z - (p.z + LAMP_OFFSET)) * 0.6;
};
export const SUITOR_WING = v(9.0, 0, -0.2);

/** one on one: the finalist walks here, next to the star */
export const DATE_SPOT = v(-1.6, 0, -0.55);
export const DATE_YAW = -1.1;

/** the private confession booth: its own little room behind the back wall */
export const BOOTH = {
  center: v(0, 0, -15),
  seat: v(-0.3, 0, -15.15),
  yaw: 0.35,
  camera: v(0.75, 1.0, -12.75),
  target: v(-0.05, 1.08, -15.1),
  bulb: v(-0.1, 2.35, -14.7),
};

/** the betting clock hangs on the star's lounge wall, above and behind her chair */
export const CLOCK = { pos: v(-3.6, 3.35, -4.98), radius: 0.5 };
/** the big window onto the night city, behind the suitors */
export const WINDOW = { x0: -0.9, x1: 8.0, y0: 0.9, y1: 3.4 };
/** where the teal lounge wall (star's side) meets the night-blue wall (suitors' side) */
export const WALL_SPLIT = -1.7;

/** the stage deck: a plain ellipse on the floor (centre, half-width x, half-depth z) */
export const DECK = { center: v(1.6, 0, -0.75), rx: 8.0, rz: 3.4 };

export const CAMERA_HOME = { pos: v(1.6, 2.5, 10.4), target: v(1.6, 1.15, -1.2), fov: 34 };

/** Approximate height of a standing cast member's head top above their feet. */
export const HEAD_TOP = 1.55;
export const HEAD_CENTER = 1.25;
export const SEATED_DROP = 0.4;

export const spotPos = (spot: number) => SPOTS[Math.max(0, Math.min(3, spot))]!.clone().setY(SUITOR_FEET_Y);
export const spotYaw = (spot: number) => SPOT_YAW[Math.max(0, Math.min(3, spot))]!;
