// Obstacle motion (pure functions of time) and hit tests. No state, no allocation in hot paths.
import { BOT_RADIUS, BOT_HEIGHT } from './course.js';

const TAU = Math.PI * 2;
const BODY_R = 0.55; // sphere approximating a Gumble body for round hazards
const BODY_CY = 0.55; // its centre height above the feet

function clamp1(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

export function seesawRoll(def, t) {
  return def.amp * clamp1(def.flick * Math.sin((TAU * t) / def.period + def.phase));
}
// ---------------------------------------------------------------- active alphabet blocks
// Both kinds of moving block run the same telegraphed cycle: rest at one stop, wind up (a rock
// back away from where it is about to go), move, rest at the far stop, wind up, move back.
//   ram     slides the whole travel in one quick shove (eased in and out).
//   tumble  tips over its leading bottom edge one face at a time (steps of size.x), so the
//           block visibly cartwheels across the floor.
// sliderPose(def, t, out) fills out {x, y, roll, windup, dir, moving}: x/y = box centre (y is
// the centre height, lifted while a tumbling block stands on an edge), roll = rotation about
// +z (radians, cumulative over the cycle), windup 0..1 (the tell before a move), dir = +1/-1
// direction of the current or next move, moving = true while it travels.
const WINDUP = 0.62; // seconds of tell at the end of each rest

function smooth(u) { return u * u * (3 - 2 * u); }

/** Number of tumble steps (1 for a ram). */
export function sliderSteps(def) {
  return def.mode === 'tumble' ? Math.max(1, Math.round((2 * def.travel) / def.size.x)) : 1;
}

export function sliderPose(def, t, out) {
  const tumble = def.mode === 'tumble';
  const n = sliderSteps(def);
  const move = tumble ? n * (def.flip + def.pause) : def.dash;
  const rest = def.rest;
  const half = rest + move;
  let tau = (t + def.phase) % (2 * half);
  if (tau < 0) tau += 2 * half;
  const leg = tau < half ? 0 : 1; // 0: A(-travel) -> B(+travel), 1: back
  const dir = leg === 0 ? 1 : -1;
  const u = tau - leg * half;
  const a = def.size.x / 2;
  const start = def.x - dir * def.travel;
  out.dir = dir;
  out.windup = 0;
  out.moving = false;
  if (u < rest) {
    // rest; the last WINDUP seconds rock back away from the coming move
    const w = u - (rest - WINDUP);
    let rock = 0;
    if (w > 0) {
      const f = w / WINDUP;
      out.windup = f;
      rock = Math.sin(f * Math.PI) * (0.55 + 0.45 * Math.sin(f * Math.PI * 7));
    }
    if (tumble) {
      // tip back onto the trailing edge (pivot on the side away from the move)
      const al = rock * 0.16;
      out.x = start - dir * a - dir * a * (Math.sin(al) - Math.cos(al));
      out.y = def.y + a * (Math.sin(al) + Math.cos(al));
      out.roll = (leg === 0 ? 0 : -n * Math.PI / 2) + dir * al;
    } else {
      out.x = start - dir * 0.35 * rock;
      out.y = def.y + def.size.y / 2;
      out.roll = 0;
    }
    return out;
  }
  const m = u - rest;
  out.moving = true;
  if (tumble) {
    const step = def.flip + def.pause;
    const k = Math.min(n - 1, Math.floor(m / step));
    const v = (m - k * step) / def.flip;
    const th = v >= 1 ? Math.PI / 2 : (Math.PI / 2) * (v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v));
    if (v >= 1) out.moving = false;
    const pivot = start + dir * (2 * k + 1) * a;
    out.x = pivot + dir * a * (Math.sin(th) - Math.cos(th));
    out.y = def.y + a * (Math.sin(th) + Math.cos(th));
    out.roll = (leg === 0 ? 0 : -n * Math.PI / 2) - dir * (k * Math.PI / 2 + th);
  } else {
    out.x = start + dir * 2 * def.travel * smooth(Math.min(1, m / def.dash));
    out.y = def.y + def.size.y / 2;
    out.roll = 0;
  }
  return out;
}
const _sp = { x: 0, y: 0, roll: 0, windup: 0, dir: 1, moving: false };
const SLIDER_VMAX = 6.5;
export function sliderX(def, t) {
  return sliderPose(def, t, _sp).x;
}
export function pendulumTheta(def, t) {
  return def.amp * Math.sin((TAU * t) / def.period + def.phase);
}
export function spinnerAngle(def, t) {
  return def.phase + def.omega * t;
}
export function rampY(r, z) {
  if (z <= r.z0) return r.y0;
  if (z >= r.z1) return r.y1;
  return r.y0 + ((z - r.z0) * (r.y1 - r.y0)) / (r.z1 - r.z0);
}

/** Marble pose at time t into out {x,y,z,active,s}. */
export function marblePose(def, t, out) {
  let tau = (t + def.phase) % def.period;
  if (tau < 0) tau += def.period;
  const z = def.zTop - def.speed * tau;
  out.active = z > def.zBottom;
  out.s = def.speed * tau;
  out.z = z;
  out.x = def.lane + def.wobble * Math.sin(out.s * def.wobbleRate + def.lane);
  out.y = rampY(def.ramp, z) + def.r;
  return out;
}

/** z-extent used for spatial bucketing. */
export function obstacleZRange(def) {
  switch (def.type) {
    case 'spinner': return [def.z - def.radius - 1, def.z + def.radius + 1];
    case 'marble': return [def.zBottom - 1, def.zTop + 1];
    case 'seesaw': return [def.z0, def.z1];
    case 'pendulum': return [def.z - def.bobHalfZ - 1, def.z + def.bobHalfZ + 1];
    case 'block':
    case 'slider': return [def.z - def.size.z / 2 - 1, def.z + def.size.z / 2 + 1];
    default: return [def.z - 2, def.z + 2];
  }
}

export function isHazard(def) {
  return def.type === 'spinner' || def.type === 'marble' || def.type === 'pendulum' || def.type === 'slider';
}

/** Can a well-timed jump clear this hazard? */
export function isJumpable(def) {
  // giant marbles (taller than a Gumble's jump) must be dodged sideways, not hopped
  return def.type === 'spinner' || (def.type === 'marble' && def.r < 0.8);
}

const _m = { x: 0, y: 0, z: 0, active: false, s: 0 };

/**
 * Would a Gumble with feet at (x, y, z) be hit by this obstacle at time t?
 * margin inflates the bot (used by the AI for caution and near-miss detection).
 */
export function hazardHit(def, t, x, y, z, margin) {
  switch (def.type) {
    case 'spinner': {
      if (y > def.y + def.armTop || y + BOT_HEIGHT < def.y + def.armBottom) return false;
      const dx = x - def.x, dz = z - def.z;
      const rr = def.radius + BOT_RADIUS + margin;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr) return false;
      const rho = Math.sqrt(d2);
      if (rho < def.postRadius) return false;
      const step = TAU / def.arms;
      let rel = (Math.atan2(dz, dx) - spinnerAngle(def, t)) % step;
      if (rel < 0) rel += step;
      const d = rel < step - rel ? rel : step - rel;
      const perp = rho * Math.sin(d);
      return perp < def.armHalfWidth + BOT_RADIUS + margin && rho * Math.cos(d) < def.radius + BOT_RADIUS + margin;
    }
    case 'marble': {
      marblePose(def, t, _m);
      if (!_m.active) return false;
      const dx = x - _m.x, dy = y + BODY_CY - _m.y, dz = z - _m.z;
      const rr = def.r + BODY_R + margin;
      return dx * dx + dy * dy + dz * dz < rr * rr;
    }
    case 'pendulum': {
      const dz = z - def.pivot.z;
      if (dz > def.bobHalfZ + BOT_RADIUS + margin || dz < -def.bobHalfZ - BOT_RADIUS - margin) return false;
      const th = pendulumTheta(def, t);
      const bx = def.pivot.x + def.length * Math.sin(th);
      const by = def.pivot.y - def.length * Math.cos(th);
      const dx = x - bx;
      // vertical capsule of the bot vs the bob circle in the x-y plane
      let cy = by;
      const lo = y + BOT_RADIUS * 0.8, hi = y + BOT_HEIGHT - BOT_RADIUS * 0.8;
      if (cy < lo) cy = lo; else if (cy > hi) cy = hi;
      const dy = cy - by;
      const rr = def.bobRadius + BOT_RADIUS + margin;
      return dx * dx + dy * dy < rr * rr;
    }
    case 'slider': {
      if (y > def.y + def.size.y || y + BOT_HEIGHT < def.y) return false;
      const cx = sliderPose(def, t, _sp).x;
      const hx = def.size.x / 2 + BOT_RADIUS + margin, hz = def.size.z / 2 + BOT_RADIUS + margin;
      return x > cx - hx && x < cx + hx && z > def.z - hz && z < def.z + hz;
    }
    default:
      return false;
  }
}

/** Create the live state object for an obstacle definition. */
export function createObstacleState(def) {
  const ob = { ...def };
  ob.pos = { x: def.x ?? 0, y: def.y ?? 0, z: def.z ?? 0 };
  ob.rot = { x: 0, y: 0, z: 0 };
  ob.vel = { x: 0, y: 0, z: 0 };
  ob.active = true;
  if (def.type === 'block') {
    ob.pos = { x: def.pos.x, y: def.pos.y, z: def.pos.z };
    ob.size = { x: def.size.x, y: def.size.y, z: def.size.z };
  }
  if (def.type === 'slider') ob.size = { x: def.size.x, y: def.size.y, z: def.size.z };
  if (def.type === 'pendulum') ob.pivot = { x: def.pivot.x, y: def.pivot.y, z: def.pivot.z };
  return ob;
}

/** Recompute live pose at time t (pure function of t). */
export function updateObstacleState(ob, def, t, dt) {
  switch (def.type) {
    case 'spinner': {
      const a = spinnerAngle(def, t);
      ob.angle = a;
      ob.rot.y = -a;
      break;
    }
    case 'marble': {
      marblePose(def, t, _m);
      const px = ob.pos.x, py = ob.pos.y, pz = ob.pos.z;
      ob.pos.x = _m.x; ob.pos.y = _m.y; ob.pos.z = _m.z;
      ob.vel.x = (ob.pos.x - px) / dt; ob.vel.y = (ob.pos.y - py) / dt; ob.vel.z = (ob.pos.z - pz) / dt;
      if (!_m.active || ob.vel.z > 0) { ob.vel.x = 0; ob.vel.y = 0; ob.vel.z = -def.speed; }
      ob.active = _m.active;
      ob.rot.x = -_m.s / def.r;
      break;
    }
    case 'seesaw': {
      const r = seesawRoll(def, t);
      ob.rollRate = (r - seesawRoll(def, t - dt)) / dt;
      ob.roll = r;
      ob.rot.z = r;
      break;
    }
    case 'pendulum': {
      const th = pendulumTheta(def, t);
      const th0 = pendulumTheta(def, t - dt);
      ob.theta = th;
      ob.thetaRate = (th - th0) / dt;
      ob.rot.z = th;
      ob.pos.x = def.pivot.x + def.length * Math.sin(th);
      ob.pos.y = def.pivot.y - def.length * Math.cos(th);
      ob.pos.z = def.pivot.z;
      ob.vel.x = def.length * Math.cos(th) * ob.thetaRate;
      ob.vel.y = def.length * Math.sin(th) * ob.thetaRate;
      break;
    }
    case 'slider': {
      const x0 = sliderPose(def, t - dt, _sp).x;
      sliderPose(def, t, _sp);
      // shove speed: the block's own travel speed, capped so a hit is a big shove, not a launch
      let vx = (_sp.x - x0) / dt;
      if (vx > SLIDER_VMAX) vx = SLIDER_VMAX; else if (vx < -SLIDER_VMAX) vx = -SLIDER_VMAX;
      ob.vel.x = vx;
      ob.pos.x = _sp.x;
      ob.pos.y = _sp.y;
      ob.pos.z = def.z;
      ob.rot.z = _sp.roll;
      ob.windup = _sp.windup;
      break;
    }
    default:
      break;
  }
}
