// The hangout's floor plan and blocking: where the couch, window and door are, where everyone
// stands for any state of the show, and how they walk there without going through each other.
//
// Plan (metres; floor y = 0; the front camera at +z looks toward -z; viewer's left is -x):
//
//   back wall z = -3.7:   [ window  x -4.0 .. 0.9 ]          [door x 2.85]
//   the nook by the window (left of the couch): where a finalist waits, back turned
//   the couch (coral, two seats) against nothing, front edge z = -1.75: the star on the right seat
//   the ring: the suitors stand around a circle in front of her, two each side, the camera is the
//   sixth member of the circle (it stands where the circle is open, toward +z)
//
// Standing is distance to the star: on each side the better placed of two takes the inner place
// (nearer her), and every heart moves you a little further round toward her, every cringe a
// little back. All of it is a pure function of PublicState.marks, so a late joiner sees the room
// exactly as a viewer who watched from the start.
import * as THREE from 'three';
import type { Mark } from '../../show/types.ts';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

/** the room's inside */
export const ROOM = { x0: -4.6, x1: 4.6, z0: -3.7, z1: 4.6, h: 3.1 };
/** the big window on the back wall */
export const WINDOW = { x0: -4.0, x1: 0.9, y0: 0.75, y1: 2.6 };
/** the one door, in the back wall */
export const DOOR = { x: 2.85, w: 1.0, h: 2.2 };
/** just inside the door, and out in the dark hall beyond it */
export const DOOR_IN = v(DOOR.x, 0, -3.05);
export const DOOR_OUT = v(DOOR.x, 0, -4.7);
/** where a remembered line of someone who has left floats: the doorway, at head height */
export const DOOR_ANCHOR = v(DOOR.x, 1.95, ROOM.z0 + 0.05);

/** the couch: two seats, facing +z */
export const COUCH = { x: 0, zFront: -1.75, depth: 0.95, w: 2.4, seat: 0.36, back: 0.92, arm: 0.6 };
export const COUCH_RECT = { x0: COUCH.x - COUCH.w / 2, x1: COUCH.x + COUCH.w / 2, z0: COUCH.zFront - COUCH.depth, z1: COUCH.zFront };
/** seat points (the performer's root when seated; the hips land 0.12 behind) */
export const STAR_SEAT = v(0.55, 0, -1.93);
export const GUEST_SEAT = v(-0.55, 0, -1.93);
export const SEAT_YAW = 0;
/** where the star stands when she gets up */
export const STAR_STAND = v(0.55, 0, -1.2);

/** by the window: where a finalist waits during the other's date, facing the glass */
export const NOOK = [v(-2.85, 0, -3.05), v(-1.95, 0, -3.15)];
export const NOOK_YAW = Math.PI;

/** a walk-on: the newcomer stops here, beside the couch's arm, to say hello */
export const GREET = v(2.05, 0, -2.0);

/** the circle the group stands on: a little flattened front to back, so the camera holds it all */
export const RING = { c: v(0.55, 0, -0.45), rx: 2.2, rz: 1.5 };
/** where the circle faces (its middle, a touch toward the camera) */
export const RING_FACE = v(0.55, 0, -0.1);
/** the place on the circle `deg` degrees round from the star (+ right of her as seen, - left) */
export function ringPoint(deg: number, k = 1) {
  const a = deg * DEG;
  return v(RING.c.x + RING.rx * k * Math.sin(a), 0, RING.c.z - RING.rz * k * Math.cos(a));
}
/** inner and outer places on each side, degrees round from the star; a lone suitor stands between */
const ZONE = { inner: 62, outer: 120, solo: 72 } as const;
const STEP_DEG = 5;
const STEP_IN = 0.1;

/** yaw that turns +z toward the point (x, z) from (fx, fz) */
export const yawTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

// ------------------------------------------------------------------------------------------------
// standing

export const score = (marks: Mark[] | undefined) => (marks ?? []).reduce((a, m) => a + (m === 'charmed' ? 1 : m === 'cringing' ? -1 : 0), 0);
const cringes = (marks: Mark[] | undefined) => (marks ?? []).filter((m) => m === 'cringing').length;

export interface Placed {
  pos: THREE.Vector3;
  yaw: number;
  sit?: boolean;
}

/**
 * The ring places of the suitors present: side by spot (even spots right of the star, odd spots
 * left), inner and outer by standing within a side, a few degrees nearer her per net heart.
 */
export function ringPlaces(ids: string[], spotOf: (id: string) => number, marks: Record<string, Mark[]>): Map<string, Placed> {
  const rank = (a: string, b: string) => score(marks[b]) - score(marks[a]) || cringes(marks[a]) - cringes(marks[b]) || spotOf(a) - spotOf(b);
  const sides: Record<1 | -1, string[]> = { 1: [], [-1]: [] };
  for (const id of ids) sides[spotOf(id) % 2 === 0 ? 1 : -1].push(id);
  // never all on one side: the lowest placed crosses over
  for (const s of [1, -1] as const) {
    const o = -s as 1 | -1;
    if (sides[s].length >= 2 && sides[o].length === 0) {
      sides[s].sort(rank);
      sides[o].push(sides[s].pop()!);
    }
    if (sides[s].length >= 3 && sides[o].length === 1) {
      sides[s].sort(rank);
      sides[o].push(sides[s].pop()!);
    }
  }
  const out = new Map<string, Placed>();
  for (const s of [1, -1] as const) {
    const list = [...sides[s]].sort(rank);
    list.forEach((id, i) => {
      const zone = list.length === 1 ? ZONE.solo : i === 0 ? ZONE.inner : ZONE.outer;
      const sc = Math.max(-2, Math.min(2, score(marks[id])));
      const deg = s * (zone - STEP_DEG * sc);
      const p = ringPoint(deg);
      // and a little closer to her, straight in
      const toStar = STAR_SEAT.clone().sub(p).setY(0).normalize();
      p.addScaledVector(toStar, STEP_IN * sc);
      clearOfCouch(p, 0.55);
      out.set(id, { pos: p, yaw: yawTo(p, RING_FACE) });
    });
  }
  return out;
}

/** two finalists in front of her (one each side, at the couch's front corners) */
export function frontPlaces(ids: string[]): Map<string, Placed> {
  const out = new Map<string, Placed>();
  ids.slice(0, 2).forEach((id, i) => {
    const p = ringPoint(i === 0 ? 58 : -58, 0.95);
    clearOfCouch(p, 0.55);
    out.set(id, { pos: p, yaw: yawTo(p, STAR_STAND) });
  });
  return out;
}

/** push a floor point out of the couch (inflated by margin), toward its front */
export function clearOfCouch(p: THREE.Vector3, margin: number) {
  const r = COUCH_RECT;
  const x0 = r.x0 - margin, x1 = r.x1 + margin, z0 = r.z0 - margin, z1 = r.z1 + margin;
  if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) return p;
  const dl = p.x - x0, dr = x1 - p.x, df = z1 - p.z;
  const m = Math.min(dl, dr, df);
  if (m === df) p.z = z1;
  else if (m === dl) p.x = x0;
  else p.x = x1;
  return p;
}

// ------------------------------------------------------------------------------------------------
// walking: a small grid planner (static obstacles: the walls, the couch, everyone standing still)

export interface Body {
  id: string;
  pos: THREE.Vector3;
  r: number;
}

const CELL = 0.2;
const BOUND = { x0: ROOM.x0 + 0.35, x1: ROOM.x1 - 0.35, z0: ROOM.z0 + 0.3, z1: ROOM.z1 - 0.4 };
const NX = Math.ceil((BOUND.x1 - BOUND.x0) / CELL) + 1;
const NZ = Math.ceil((BOUND.z1 - BOUND.z0) / CELL) + 1;

function freeAt(x: number, z: number, r: number, bodies: Body[]) {
  if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return false;
  const c = COUCH_RECT;
  if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return false;
  for (const b of bodies) if ((x - b.pos.x) ** 2 + (z - b.pos.z) ** 2 < (b.r + r) ** 2) return false;
  return true;
}

function clearLine(a: THREE.Vector3, b: THREE.Vector3, r: number, bodies: Body[]) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(d / 0.08));
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (!freeAt(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k, r, bodies)) return false;
  }
  return true;
}

/**
 * A path from `from` to `to` for a walker of radius r around `bodies` (the walker itself left out
 * by the caller). Bodies that the start or the goal sits inside are ignored (a step away from a
 * neighbour). Returns the polyline including both ends; a straight line if nothing is found.
 */
export function route(from: THREE.Vector3, to: THREE.Vector3, r: number, all: Body[]): THREE.Vector3[] {
  const a = from.clone().setY(0), b = to.clone().setY(0);
  const bodies = all.filter((o) => Math.hypot(a.x - o.pos.x, a.z - o.pos.z) > o.r + r - 0.02 && Math.hypot(b.x - o.pos.x, b.z - o.pos.z) > o.r + r - 0.02);
  if (clearLine(a, b, r, bodies)) return [a, b];
  const idx = (i: number, j: number) => j * NX + i;
  const cx = (i: number) => BOUND.x0 + i * CELL;
  const cz = (j: number) => BOUND.z0 + j * CELL;
  const near = (p: THREE.Vector3) => [Math.round((p.x - BOUND.x0) / CELL), Math.round((p.z - BOUND.z0) / CELL)] as const;
  const free = new Uint8Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) free[idx(i, j)] = freeAt(cx(i), cz(j), r, bodies) ? 1 : 0;
  // start and goal cells: the nearest free cells
  const nearestFree = (p: THREE.Vector3) => {
    const [i0, j0] = near(p);
    let best = -1, bd = Infinity;
    for (let dj = -4; dj <= 4; dj++)
      for (let di = -4; di <= 4; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= NX || j >= NZ || !free[idx(i, j)]) continue;
        const d = (cx(i) - p.x) ** 2 + (cz(j) - p.z) ** 2;
        if (d < bd) {
          bd = d;
          best = idx(i, j);
        }
      }
    return best;
  };
  const s = nearestFree(a), g = nearestFree(b);
  if (s < 0 || g < 0) return [a, b];
  const gi = g % NX, gj = Math.floor(g / NX);
  const h = (k: number) => Math.hypot((k % NX) - gi, Math.floor(k / NX) - gj);
  const gScore = new Float32Array(NX * NZ).fill(Infinity);
  const prev = new Int32Array(NX * NZ).fill(-1);
  const open: number[] = [s];
  const inOpen = new Uint8Array(NX * NZ);
  inOpen[s] = 1;
  gScore[s] = 0;
  const f = new Float32Array(NX * NZ).fill(Infinity);
  f[s] = h(s);
  let found = false;
  let guard = 0;
  while (open.length && guard++ < 20000) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]!]! < f[open[bi]!]!) bi = k;
    const cur = open[bi]!;
    open[bi] = open[open.length - 1]!;
    open.pop();
    inOpen[cur] = 0;
    if (cur === g) {
      found = true;
      break;
    }
    const ci = cur % NX, cj = Math.floor(cur / NX);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
        const k = idx(i, j);
        if (!free[k]) continue;
        const t = gScore[cur]! + (di && dj ? Math.SQRT2 : 1);
        if (t < gScore[k]!) {
          gScore[k] = t;
          prev[k] = cur;
          f[k] = t + h(k);
          if (!inOpen[k]) {
            inOpen[k] = 1;
            open.push(k);
          }
        }
      }
  }
  if (!found) return [a, b];
  const cells: THREE.Vector3[] = [];
  for (let k = g; k >= 0; k = prev[k]!) {
    cells.push(v(cx(k % NX), 0, cz(Math.floor(k / NX))));
    if (k === s) break;
  }
  cells.reverse();
  const pts = [a, ...cells, b];
  // string pulling: keep only the corners
  const out = [a];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clearLine(pts[i]!, pts[j]!, r * 0.92, bodies)) j--;
    out.push(pts[j]!);
    i = j;
  }
  return out;
}

export const pathLength = (p: THREE.Vector3[]) => p.reduce((acc, x, i) => (i ? acc + Math.hypot(x.x - p[i - 1]!.x, x.z - p[i - 1]!.z) : 0), 0);

/** ms for a walk of this length: an easy VRChat stroll, a short shuffle a little slower */
export function walkMs(len: number, speed = 1.55) {
  if (len < 0.9) return Math.max(450, (len / 0.75) * 1000);
  return (len / speed) * 1000 + 300;
}
