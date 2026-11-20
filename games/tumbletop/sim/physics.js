// Bot movement, ground, walls, obstacle contacts and bot-bot bumping.
import { BOT_RADIUS, BOT_HEIGHT } from './course.js';
import { obstacleZRange, isHazard, hazardHit } from './obstacles.js';

export const GRAVITY = 28;
export const JUMP_V = 9.6;
export const GROUND_ACCEL = 34;
export const AIR_ACCEL = 8;
export const TUMBLE_FRICTION = 9;
export const STEP_UP = 0.55;
export const SNAP_DOWN = 0.45;
export const NO_GROUND = -1e9;
const BUCKET = 4;

// ------------------------------------------------------------------ motion feel
// A big hit (spinning top, marble, metronome, sweeper) throws a Gumble on ONE consistent,
// readable arc whatever hit it: a high floppy flight (~0.9 s up and over), a pancake splat, one
// short jelly rebound (~0.3 s), a second smaller splat, then a quick BOING get-up (~0.5 s).
// Horizontal fling is scaled down so the longer flight covers about the same ground as before.
// Small shoves (maze sliders, vy < BIG_KNOCK_VY) keep the old quick knock.
export const BIG_KNOCK_VY = 5;      // obstacle launch speed (vertical) from which a hit is "big"
export const KNOCK_VY = 13.2;       // m/s: vertical launch of a big hit (~0.94 s flight on the flat)
export const KNOCK_VY_VAR = 0.35;   // x (obstacle vy - 5.5): a little variety between obstacles
export const KNOCK_FLING = 0.72;    // x obstacle horizontal launch on a big hit
export const KNOCK_LIFT = 1.55;     // x obstacle launch speed (vertical) for small knocks
export const KNOCK_LOCK = 1.2;      // x obstacle lock time for small knocks
export const KNOCK_LOCK_BIG = 1.12; // s: big hits stay down through the flight and the rebound
export const GETUP_TICKS = 30;      // get-up after a tumble: load + squash, BOING kip-up, splat, shake it off
export const TUMBLE_BOUNCE = 0.36;  // restitution of a tumbling body on the floor (one short rebound)
export const TUMBLE_BOUNCE_MIN = 4.5; // impact speed below which it stops bouncing
export const TUMBLE_BOUNCE_SLIDE = 0.8; // horizontal speed kept per bounce
export const SPRAWL_HOP = 6.4;      // pop into the air when barged over by another bot

export function knockLift(vy) { return vy >= BIG_KNOCK_VY ? KNOCK_VY + (vy - 5.5) * KNOCK_VY_VAR : vy * KNOCK_LIFT; }
export function knockFling(vy) { return vy >= BIG_KNOCK_VY ? KNOCK_FLING : 1; }
export function knockLockTicks(sec, tickRate, vy = BIG_KNOCK_VY) {
  return Math.round((vy >= BIG_KNOCK_VY ? KNOCK_LOCK_BIG : Math.min(sec * KNOCK_LOCK, KNOCK_LOCK_BIG)) * tickRate);
}

/**
 * A tumbling bot reaching the floor at height gy. Bounces it (and returns true) when the impact
 * is hard enough; otherwise returns false and the caller lands it as usual.
 */
export function tumbleBounce(b, gy) {
  const v = b.vel;
  const impact = -v.y;
  if (impact < TUMBLE_BOUNCE_MIN) return false;
  b.pos.y = gy;
  v.y = impact * TUMBLE_BOUNCE;
  v.x *= TUMBLE_BOUNCE_SLIDE; v.z *= TUMBLE_BOUNCE_SLIDE;
  b.grounded = false;
  return true;
}
const SEESAW_SLIDE = 0.55;

/** Static spatial lookups built once from course data. */
export class World {
  constructor(course, obDefs, obStates) {
    this.course = course;
    const b = course.bounds;
    this.minZ = b.minZ;
    this.nb = Math.ceil((b.maxZ - b.minZ) / BUCKET) + 1;
    this.surfBuckets = [];
    this.hazBuckets = [];
    this.wallBuckets = [];
    for (let i = 0; i < this.nb; i++) { this.surfBuckets.push([]); this.hazBuckets.push([]); this.wallBuckets.push([]); }
    const addRange = (arr, z0, z1, v) => {
      const a = Math.max(0, this.bucketOf(z0)), c = Math.min(this.nb - 1, this.bucketOf(z1));
      for (let i = a; i <= c; i++) arr[i].push(v);
    };
    this.surfaces = course.surfaces;
    course.surfaces.forEach((s, i) => addRange(this.surfBuckets, s.z0, s.z1, i));
    // seesaws: indices into obstacle arrays, kept separate from static surfaces
    this.seesaws = [];
    this.hazards = [];
    // walls: static boxes {x0,x1,y0,y1,z0,z1, ob (state or null), kind}
    this.walls = [];
    this.posts = []; // spinner bodies (solid cylinders)
    for (const w of course.walls) {
      this.walls.push({ x0: w.min.x, x1: w.max.x, y0: w.min.y, y1: w.max.y, z0: w.min.z, z1: w.max.z, slider: null, def: null });
    }
    obDefs.forEach((def, i) => {
      const [z0, z1] = obstacleZRange(def);
      if (def.type === 'seesaw') { this.seesaws.push(i); addRange(this.surfBuckets, def.z0, def.z1, -1 - i); }
      if (isHazard(def)) { this.hazards.push(i); addRange(this.hazBuckets, z0, z1, i); }
      if (def.type === 'block') {
        this.walls.push({
          x0: def.pos.x - def.size.x / 2, x1: def.pos.x + def.size.x / 2,
          y0: def.pos.y - def.size.y / 2, y1: def.pos.y + def.size.y / 2,
          z0: def.pos.z - def.size.z / 2, z1: def.pos.z + def.size.z / 2, slider: null, def,
        });
      }
      if (def.type === 'slider') {
        this.walls.push({
          x0: 0, x1: 0, y0: def.y, y1: def.y + def.size.y,
          z0: def.z - def.size.z / 2, z1: def.z + def.size.z / 2, slider: obStates[i], def,
        });
      }
      if (def.type === 'spinner') this.posts.push({ x: def.x, y: def.y, z: def.z, r: def.postRadius, h: def.height });
    });
    this.walls.forEach((w, i) => addRange(this.wallBuckets, w.z0 - 1, w.z1 + 1, i));
    this.obDefs = obDefs;
    this.obStates = obStates;
    this.g = { h: NO_GROUND, slope: 0, seesaw: null, roll: 0, material: null };
  }

  bucketOf(z) { return Math.floor((z - this.minZ) / BUCKET); }

  /**
   * Highest walkable top under (x, z) that is at or below yMax. Writes details into this.g and
   * returns the height (NO_GROUND when there is nothing).
   */
  groundAt(x, z, yMax) {
    const g = this.g;
    g.h = NO_GROUND; g.slope = 0; g.seesaw = null; g.roll = 0; g.material = null;
    const bi = this.bucketOf(z);
    if (bi < 0 || bi >= this.nb) return NO_GROUND;
    const list = this.surfBuckets[bi];
    for (let k = 0; k < list.length; k++) {
      const idx = list[k];
      if (idx >= 0) {
        const s = this.surfaces[idx];
        if (z < s.z0 || z > s.z1) continue;
        const hw = s.width / 2;
        if (x < s.x - hw || x > s.x + hw) continue;
        let h, slope = 0;
        if (s.kind === 'ramp') {
          slope = (s.y1 - s.y0) / (s.z1 - s.z0);
          h = s.y0 + (z - s.z0) * slope;
        } else h = s.y0;
        if (h <= yMax && h > g.h) { g.h = h; g.slope = slope; g.seesaw = null; g.roll = 0; g.material = s.material; }
      } else {
        const oi = -1 - idx;
        const def = this.obDefs[oi];
        if (z < def.z0 || z > def.z1) continue;
        const ob = this.obStates[oi];
        const roll = ob.roll || 0;
        const c = Math.cos(roll);
        const hw = (def.width / 2) * c;
        const dx = x - def.x;
        if (dx < -hw || dx > hw) continue;
        const h = def.y + dx * Math.tan(roll);
        if (h <= yMax && h > g.h) { g.h = h; g.slope = 0; g.seesaw = ob; g.roll = roll; g.material = 'ruler'; }
      }
    }
    return g.h;
  }
}

/** Push a bot out of static walls, sliders and spinner posts. Returns slider that shoved it (or null). */
export function resolveWalls(world, bot) {
  const p = bot.pos, v = bot.vel;
  const r = BOT_RADIUS;
  let shover = null;
  const bi = world.bucketOf(p.z);
  if (bi >= 0 && bi < world.nb) {
    const list = world.wallBuckets[bi];
    for (let k = 0; k < list.length; k++) {
      const w = world.walls[list[k]];
      let x0 = w.x0, x1 = w.x1;
      if (w.slider) { const hx = w.def.size.x / 2; x0 = w.slider.pos.x - hx; x1 = w.slider.pos.x + hx; }
      if (p.y >= w.y1 - 0.05 || p.y + BOT_HEIGHT <= w.y0) continue;
      const cx = p.x < x0 ? x0 : p.x > x1 ? x1 : p.x;
      const cz = p.z < w.z0 ? w.z0 : p.z > w.z1 ? w.z1 : p.z;
      let dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let nx, nz, pen;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        nx = dx / d; nz = dz / d; pen = r - d;
      } else {
        // centre inside the box: leave along the shallowest axis
        const l = p.x - x0, rr = x1 - p.x, b = p.z - w.z0, f = w.z1 - p.z;
        let m = l; nx = -1; nz = 0;
        if (rr < m) { m = rr; nx = 1; nz = 0; }
        if (b < m) { m = b; nx = 0; nz = -1; }
        if (f < m) { m = f; nx = 0; nz = 1; }
        pen = m + r;
      }
      p.x += nx * pen; p.z += nz * pen;
      const vn = v.x * nx + v.z * nz;
      if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; }
      if (w.slider && Math.abs(w.slider.vel.x) > 1.2 && nx * w.slider.vel.x > 0.5) shover = w;
    }
  }
  // spinner bodies
  const posts = world.posts;
  for (let k = 0; k < posts.length; k++) {
    const s = posts[k];
    const dz = p.z - s.z;
    if (dz > 6 || dz < -6) continue;
    if (p.y > s.y + s.h || p.y + BOT_HEIGHT < s.y) continue;
    const dx = p.x - s.x;
    const rr = s.r + r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr || d2 < 1e-10) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d, nz = dz / d;
    p.x = s.x + nx * rr; p.z = s.z + nz * rr;
    const vn = v.x * nx + v.z * nz;
    if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; }
  }
  return shover;
}

/**
 * Uniform grid over x-z for bot-bot contacts. Cell = 1 m. O(n).
 */
export class BotGrid {
  constructor(bounds, botCount) {
    this.minX = bounds.minX - 2; this.minZ = bounds.minZ - 2;
    this.nx = Math.ceil(bounds.maxX - bounds.minX + 4);
    this.nz = Math.ceil(bounds.maxZ - bounds.minZ + 4);
    this.head = new Int32Array(this.nx * this.nz).fill(-1);
    this.next = new Int32Array(botCount).fill(-1);
    this.cellOf = new Int32Array(botCount).fill(-1);
  }
  cell(x, z) {
    let cx = Math.floor(x - this.minX), cz = Math.floor(z - this.minZ);
    if (cx < 0) cx = 0; else if (cx >= this.nx) cx = this.nx - 1;
    if (cz < 0) cz = 0; else if (cz >= this.nz) cz = this.nz - 1;
    return cz * this.nx + cx;
  }
  rebuild(bots) {
    const head = this.head;
    for (let i = 0; i < bots.length; i++) { const c = this.cellOf[i]; if (c >= 0) head[c] = -1; }
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      if (!b.m.physical) { this.cellOf[i] = -1; continue; }
      const c = this.cell(b.pos.x, b.pos.z);
      this.cellOf[i] = c;
      this.next[i] = head[c];
      head[c] = i;
    }
  }
}
