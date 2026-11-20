// Recorder: a ring buffer of the last N seconds of interpolatable sim state (bots + obstacles).
// Live rendering samples it between the previous and current tick; replays sample it at a
// slow-motion playhead. Nothing here allocates per frame.
import { ANIM_INDEX } from '../characters/gumble.js';

const STATUS = { racing: 0, qualified: 1, eliminated: 2, respawning: 3 };
export const STATUS_INDEX = STATUS;
const HIDE_Y = -22;

export function createView(N, M) {
  return {
    tick: 0,
    botPos: new Float32Array(N * 3), botYaw: new Float32Array(N), botAnim: new Uint8Array(N),
    botAnimTime: new Float32Array(N), botVel: new Float32Array(N * 3), botGrounded: new Uint8Array(N),
    botStatus: new Uint8Array(N), botHidden: new Uint8Array(N),
    obsPos: new Float32Array(M * 3), obsQuat: new Float32Array(M * 4), obsParam: new Float32Array(M * 2),
    obsActive: new Uint8Array(M).fill(1),
  };
}

// Euler (x,y,z, XYZ order) -> quaternion into out[o..o+3]
function eulerToQuat(x, y, z, out, o) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  out[o] = s1 * c2 * c3 + c1 * s2 * s3;
  out[o + 1] = c1 * s2 * c3 - s1 * c2 * s3;
  out[o + 2] = c1 * c2 * s3 + s1 * s2 * c3;
  out[o + 3] = c1 * c2 * c3 - s1 * s2 * s3;
}

// Pull an obstacle's rotation (quaternion {x,y,z,w}, euler {x,y,z}, number = yaw, or angle field).
function readObstacleRot(o, out, k) {
  const r = o.rot ?? o.rotation;
  if (r && typeof r === 'object') {
    if (Array.isArray(r)) {
      if (r.length === 4) { out[k] = r[0]; out[k + 1] = r[1]; out[k + 2] = r[2]; out[k + 3] = r[3]; }
      else eulerToQuat(r[0] || 0, r[1] || 0, r[2] || 0, out, k);
    } else if (r.w !== undefined) { out[k] = r.x; out[k + 1] = r.y; out[k + 2] = r.z; out[k + 3] = r.w; }
    else eulerToQuat(r.x || 0, r.y || 0, r.z || 0, out, k);
  } else if (typeof r === 'number') eulerToQuat(0, r, 0, out, k);
  else if (typeof o.angle === 'number') eulerToQuat(0, o.angle, 0, out, k);
  else { out[k] = 0; out[k + 1] = 0; out[k + 2] = 0; out[k + 3] = 1; }
}

// Generic scalar params some obstacles carry (extension, open amount, phase ...)
function readObstacleParams(o, out, k) {
  out[k] = o.roll ?? o.theta ?? o.angle ?? 0;
  out[k + 1] = o.rollRate ?? o.thetaRate ?? 0;
}

export function createRecorder(N, M, seconds = 20, tickRate = 60) {
  const cap = Math.ceil(seconds * tickRate) + 4;
  const R = {
    cap,
    tickOf: new Int32Array(cap).fill(-1),
    bp: new Float32Array(cap * N * 3), by: new Float32Array(cap * N), ba: new Uint8Array(cap * N),
    bt: new Float32Array(cap * N), bg: new Uint8Array(cap * N), bs: new Uint8Array(cap * N),
    op: new Float32Array(cap * M * 3), oq: new Float32Array(cap * M * 4), os: new Float32Array(cap * M * 2),
    oa: new Uint8Array(cap * M),
    newest: -1,
  };

  function record(state) {
    const t = state.tick;
    const slot = t % cap;
    R.tickOf[slot] = t;
    R.newest = t;
    const bots = state.bots;
    for (let i = 0; i < N; i++) {
      const b = bots[i];
      const k = slot * N + i;
      R.bp[k * 3] = b.pos.x; R.bp[k * 3 + 1] = b.pos.y; R.bp[k * 3 + 2] = b.pos.z;
      R.by[k] = b.yaw || 0;
      R.ba[k] = ANIM_INDEX[b.anim] ?? 0;
      R.bt[k] = b.animTime || 0;
      R.bg[k] = b.grounded ? 1 : 0;
      R.bs[k] = STATUS[b.status] ?? 0;
    }
    const obs = state.obstacles || [];
    for (let j = 0; j < M; j++) {
      const o = obs[j];
      const k = slot * M + j;
      if (!o) continue;
      const p = o.pos || o.position;
      if (p) { R.op[k * 3] = p.x; R.op[k * 3 + 1] = p.y; R.op[k * 3 + 2] = p.z; }
      readObstacleRot(o, R.oq, k * 4);
      readObstacleParams(o, R.os, k * 2);
      R.oa[k] = o.active === false ? 0 : 1;
    }
  }

  const has = (t) => t >= 0 && R.tickOf[t % cap] === t;
  const oldest = () => {
    if (R.newest < 0) return -1;
    let t = Math.max(0, R.newest - cap + 1);
    while (t <= R.newest && !has(t)) t++;
    return t;
  };

  // Fill `view` at fractional tick tf (interpolated). Velocities from finite differences.
  function sample(tf, view) {
    let a = Math.floor(tf);
    let alpha = tf - a;
    if (!has(a)) { a = R.newest; alpha = 0; }
    let b = a + 1;
    if (!has(b)) { b = a; alpha = 0; }
    const pa = has(a - 1) ? a - 1 : a; // for velocity
    const sa = a % cap, sb = b % cap, sp = pa % cap;
    view.tick = a + alpha;
    for (let i = 0; i < N; i++) {
      const ka = sa * N + i, kb = sb * N + i, kp = sp * N + i;
      const ax = R.bp[ka * 3], ay = R.bp[ka * 3 + 1], az = R.bp[ka * 3 + 2];
      const bx = R.bp[kb * 3], by = R.bp[kb * 3 + 1], bz = R.bp[kb * 3 + 2];
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const teleport = dx * dx + dy * dy + dz * dz > 9;
      const t = teleport ? (alpha < 0.5 ? 0 : 1) : alpha;
      view.botPos[i * 3] = ax + dx * t; view.botPos[i * 3 + 1] = ay + dy * t; view.botPos[i * 3 + 2] = az + dz * t;
      let dyaw = R.by[kb] - R.by[ka];
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      view.botYaw[i] = R.by[ka] + dyaw * t;
      const useB = t >= 0.5;
      view.botAnim[i] = useB ? R.ba[kb] : R.ba[ka];
      view.botAnimTime[i] = R.ba[ka] === R.ba[kb] ? R.bt[ka] + (R.bt[kb] - R.bt[ka]) * t : (useB ? R.bt[kb] : R.bt[ka]);
      view.botGrounded[i] = useB ? R.bg[kb] : R.bg[ka];
      view.botStatus[i] = useB ? R.bs[kb] : R.bs[ka];
      // velocity over the latest tick pair available
      let vx, vy, vz;
      if (b !== a && !teleport) { vx = dx * tickRate; vy = dy * tickRate; vz = dz * tickRate; }
      else {
        vx = (ax - R.bp[kp * 3]) * tickRate; vy = (ay - R.bp[kp * 3 + 1]) * tickRate; vz = (az - R.bp[kp * 3 + 2]) * tickRate;
        if (vx * vx + vy * vy + vz * vz > 900) { vx = 0; vy = 0; vz = 0; }
      }
      view.botVel[i * 3] = vx; view.botVel[i * 3 + 1] = vy; view.botVel[i * 3 + 2] = vz;
      view.botHidden[i] = view.botPos[i * 3 + 1] < HIDE_Y ? 1 : 0;
    }
    for (let j = 0; j < M; j++) {
      const ka = sa * M + j, kb = sb * M + j;
      for (let c = 0; c < 3; c++) view.obsPos[j * 3 + c] = R.op[ka * 3 + c] + (R.op[kb * 3 + c] - R.op[ka * 3 + c]) * alpha;
      // nlerp quaternion (shortest path)
      let ax = R.oq[ka * 4], ay = R.oq[ka * 4 + 1], az = R.oq[ka * 4 + 2], aw = R.oq[ka * 4 + 3];
      let bx = R.oq[kb * 4], by = R.oq[kb * 4 + 1], bz = R.oq[kb * 4 + 2], bw = R.oq[kb * 4 + 3];
      if (ax * bx + ay * by + az * bz + aw * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
      let x = ax + (bx - ax) * alpha, y = ay + (by - ay) * alpha, z = az + (bz - az) * alpha, w = aw + (bw - aw) * alpha;
      const l = Math.hypot(x, y, z, w) || 1;
      view.obsQuat[j * 4] = x / l; view.obsQuat[j * 4 + 1] = y / l; view.obsQuat[j * 4 + 2] = z / l; view.obsQuat[j * 4 + 3] = w / l;
      view.obsParam[j * 2] = R.os[ka * 2] + (R.os[kb * 2] - R.os[ka * 2]) * alpha;
      view.obsActive[j] = alpha < 0.5 ? R.oa[ka] : R.oa[kb];
      view.obsParam[j * 2 + 1] = R.os[ka * 2 + 1] + (R.os[kb * 2 + 1] - R.os[ka * 2 + 1]) * alpha;
    }
    return view;
  }

  function botPosAt(tick, id, out) {
    const t = has(tick) ? tick : R.newest;
    const k = (t % cap) * N + id;
    out.x = R.bp[k * 3]; out.y = R.bp[k * 3 + 1]; out.z = R.bp[k * 3 + 2];
    return out;
  }

  function reset() { R.tickOf.fill(-1); R.newest = -1; }

  return { record, sample, has, oldest, newest: () => R.newest, botPosAt, reset, cap };
}

// --------------------------------------------------------------------------- replays
// Key moments are events worth re-watching. A replay plays a window around the event with a
// speed curve: real-time run-up, deep slow motion around the moment, ease back out.
const KEY_TYPES = new Set(['fall', 'knockback', 'tumble', 'pileup', 'leadChange', 'overtake', 'photoFinish',
  'lastSpot', 'nearMiss', 'comeback', 'bump', 'qualified']);

export function createReplay(recorder, tickRate = 60) {
  const keyMoments = []; // { idx, ev }
  const R = {
    active: false, event: null, eventIndex: -1, startTick: 0, endTick: 0, eventTick: 0,
    playhead: 0, focusBotId: -1, otherBotId: -1, elapsed: 0, liveTickAtStart: 0, rate: 1,
  };

  function noteEvent(ev, idx) {
    if (!KEY_TYPES.has(ev.type)) return;
    if ((ev.importance ?? 0) < 0.45) return;
    keyMoments.push({ idx, ev });
    if (keyMoments.length > 200) keyMoments.shift();
  }

  // Best recent moment still inside the recorder window.
  function bestRecent(nowTick, maxAgeSec = 18) {
    let best = null, bestScore = -1;
    const oldest = recorder.oldest();
    for (let i = keyMoments.length - 1; i >= 0; i--) {
      const k = keyMoments[i];
      const age = (nowTick - k.ev.tick) / tickRate;
      if (age > maxAgeSec) break;
      if (k.ev.tick - 2 * tickRate < oldest) continue;
      const score = (k.ev.importance ?? 0.5) - age * 0.012;
      if (score > bestScore) { bestScore = score; best = k; }
    }
    return best;
  }

  function start(ev, idx, opts = {}) {
    if (!ev) return false;
    const oldest = recorder.oldest(), newest = recorder.newest();
    if (oldest < 0) return false;
    const pre = Math.round((opts.pre ?? 2.6) * tickRate), post = Math.round((opts.post ?? 1.8) * tickRate);
    const et = Math.min(Math.max(ev.tick, oldest), newest);
    R.startTick = Math.max(oldest, et - pre);
    R.endTick = Math.min(newest - 1, et + post);
    if (R.endTick - R.startTick < tickRate * 0.5) return false;
    R.eventTick = et;
    R.playhead = R.startTick;
    R.event = ev; R.eventIndex = idx ?? -1;
    R.focusBotId = ev.botId ?? -1; R.otherBotId = ev.otherId ?? -1;
    R.active = true; R.elapsed = 0; R.liveTickAtStart = newest; R.rate = rateAt(R.startTick);
    return true;
  }

  // Playback rate (ticks per real tick): 1 far from the moment, 0.28 at the moment.
  function rateAt(tick) {
    const d = Math.abs(tick - R.eventTick) / tickRate;
    const slow = 0.28;
    if (d < 0.7) return slow;
    if (d > 1.6) return 0.9;
    const k = (d - 0.7) / 0.9;
    return slow + (0.9 - slow) * k * k * (3 - 2 * k);
  }

  // Advance by dt seconds of viewing time. Returns false when finished.
  function advance(dt) {
    if (!R.active) return false;
    R.elapsed += dt;
    R.rate = rateAt(R.playhead);
    R.playhead += dt * tickRate * R.rate;
    if (R.playhead >= R.endTick) { R.active = false; return false; }
    return true;
  }

  function stop() { R.active = false; }

  return {
    state: R, noteEvent, bestRecent, start, advance, stop, keyMoments,
    progress: () => (R.active ? (R.playhead - R.startTick) / Math.max(1, R.endTick - R.startTick) : 0),
  };
}
