// Bot brains: personality from the seed, lane choice, imperfect hazard timing, jumps, waits.
import { hazardHit, isJumpable } from './obstacles.js';
import { NO_GROUND, JUMP_V, GRAVITY, GROUND_ACCEL, AIR_ACCEL } from './physics.js';

const PROBE_DT = 0.05;
const PROBE_STEPS = 26; // 1.3 s look-ahead

// How much each stat moves the numbers. Tuned with tools/checks.mjs (balance over 500 shows).
export const TUNE = {
  speedBase: 8.8, speedSpan: 1.25, formSd: 0.14,
  accelBase: 0.92, accelSpan: 0.16,
  balanceBase: 0.3, balanceSpan: 0.65,
  flingBase: 1.12, flingSpan: 0.3,     // grip: thrown less far by a hit
  bargeBase: 1.25, bargeSpan: 0.6,     // grip: knocked over less often by a barge
  downBase: 1.5, downSpan: 1.0,      // bounce: time on the floor and waiting to drop back in
  riskBase: 0.12, riskSpan: 0.8,       // nerve
  aggrBase: 0.15, aggrSpan: 0.6,
  timingBase: 0.6, timingSpan: 0.3, mistakeBase: 0.02, mistakeSpan: 0.035, // nerve: cooler timing at a hazard
  chaseAfter: 4, chaseRisk: 0.4, chaseSpeed: 0.05, // pushing when outside the qualifying places
  finalPush: 0.18, finalPushAt: 8,
};

const s01 = (v) => Math.min(1, Math.max(0, (v - 2) / 7));

/**
 * A Gumble's running numbers. They come from its permanent stats; the seed only adds the day's
 * form (a small pace wobble), its reaction at the gun and its habits.
 */
export function makePersonality(stats, rng) {
  const T = TUNE;
  const sp = s01(stats.speed), gr = s01(stats.grip), bo = s01(stats.bounce), nv = s01(stats.nerve);
  return {
    topSpeed: T.speedBase + T.speedSpan * sp + T.formSd * rng.gauss(),
    accel: T.accelBase + T.accelSpan * sp,
    reaction: 6 + rng.int(6), // ticks between decisions
    startDelay: 2 + rng.int(16), // ticks after the gun
    timing: Math.min(1, T.timingBase + T.timingSpan * nv), // 1 = perfect hazard timing
    risk: T.riskBase + T.riskSpan * nv,
    aggression: T.aggrBase + T.aggrSpan * nv,
    mistake: T.mistakeBase + T.mistakeSpan * nv,
    laneBias: rng.next() * 2 - 1,
    balance: T.balanceBase + T.balanceSpan * gr,
    flingScale: T.flingBase - T.flingSpan * gr,
    bargeScale: T.bargeBase - T.bargeSpan * gr,
    downScale: T.downBase - T.downSpan * bo,
    diveHabit: rng.next(),
    hoppy: rng.next() * 0.5,
  };
}

export function makeBrain() {
  return {
    targetX: 0, speed: 0, nextThink: 0, jumpTick: -1, diveTick: -1,
    laneX: 0, lanePickTick: 0,
    plank1: null, plank2: null, bridge: null, topRow: -1,
    mazeRow: -1, gapX: 0, gapHalf: 1, mazeRowZ: 0,
    waiting: false, slotX: 0, slotZ: 0, err: 0, errUntil: 0, dec: '', jumpKind: '', riskNow: 0.5, chasing: false,
  };
}

export function resetBrain(ai) {
  ai.plank1 = null; ai.plank2 = null; ai.bridge = null; ai.mazeRow = -1; ai.mazeRowZ = 0; ai.topRow = -1;
  ai.jumpTick = -1; ai.diveTick = -1; ai.waiting = false; ai.lanePickTick = 0;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** Count racing bots in a lane ahead of z. */
function crowd(S, x, halfW, z0, z1) {
  let n = 0;
  const bots = S.bots;
  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];
    if (b.status !== 'racing') continue;
    const p = b.pos;
    if (p.z < z0 || p.z > z1) continue;
    if (p.x > x - halfW && p.x < x + halfW) n++;
  }
  return n;
}

function choose(S, bot, xs, halfW, zAhead, rngW, crowdW) {
  let best = xs[0], bestC = 1e9;
  for (let k = 0; k < xs.length; k++) {
    const px = xs[k];
    const c = Math.abs(bot.pos.x - px) * 0.3 + crowd(S, px, halfW, bot.pos.z - 2, bot.pos.z + zAhead) * crowdW
      + bot.rng.next() * rngW - bot.p.laneBias * px * 0.06;
    if (c < bestC) { bestC = c; best = px; }
  }
  return best;
}

/** Section-aware lane target and speed multiplier. Writes ai.targetX / ai.speedMul. */
function laneTarget(S, bot) {
  const ai = bot.ai, p = bot.p, x = bot.pos.x, z = bot.pos.z;
  const C = S.course, secs = C.sections, L = C.layout;
  let target = ai.laneX, mul = 1;
  ai.mazeRowZ = 0;
  if (z < L.topsZ0) {
    target = ai.laneX;
  } else if (z < L.topsZ1) {
    const rows = secs[1].lanes;
    let ri = -1;
    for (let r = 0; r < rows.length; r++) if (rows[r].z + 1.5 > z) { ri = r; break; }
    if (ri >= 0) {
      if (ai.topRow !== ri) {
        ai.topRow = ri;
        const row = rows[ri];
        if (bot.rng.next() < ai.riskNow * 0.2) {
          // bold line straight through the spinning tops
          ai.laneX = clamp(x + bot.rng.gauss() * 1.5, -9, 9);
        } else {
          let best = row.free[0], bestC = 1e9;
          for (let k = 0; k < row.free.length; k++) {
            const f = row.free[k];
            const cx = (f.x0 + f.x1) / 2;
            const c = Math.abs(cx - x) * 0.35 + crowd(S, cx, (f.x1 - f.x0) / 2 + 0.3, z, row.z + 2) * 0.8
              + bot.rng.next() * 1.5 + (Math.abs(cx) > 10 ? 1.5 * (1 - ai.riskNow) : 0);
            if (c < bestC) { bestC = c; best = f; }
          }
          const w = Math.max(0, (best.x1 - best.x0) / 2 - 0.5);
          ai.laneX = (best.x0 + best.x1) / 2 + bot.rng.range(-w, w);
        }
      }
      target = ai.laneX;
    } else target = clamp(ai.laneX, -5, 5);
    if (z > L.topsFunnelZ) target = clamp(target, -5.2, 5.2);
    mul = 0.97;
  } else if (z < L.rampZ1) {
    ai.laneX = clamp(ai.laneX, -5.5, 5.5);
    target = ai.laneX;
  } else if (z < L.plank1Z1) {
    const row = secs[3].rows[0];
    if (ai.plank1 === null && z > L.rampZ1 + 3) ai.plank1 = choose(S, bot, row.xs, 1.6, 26, 2.2, 0.55);
    target = ai.plank1 === null ? clamp(x, -8, 8) : ai.plank1;
    if (z > row.z0 - 0.5) mul = 0.45 + 0.25 * ai.riskNow + 0.12 * p.balance;
    else if (z < row.z0 - 3 && ai.plank1 !== null) target = x + clamp(ai.plank1 - x, -4, 4);
  } else if (z < L.islandZ1) {
    const row = secs[3].rows[1];
    if (ai.plank2 === null) ai.plank2 = choose(S, bot, row.xs, 1.7, 20, 2.0, 0.5);
    target = ai.plank2;
  } else if (z < L.plank2Z1) {
    target = ai.plank2 === null ? (x < 0 ? -4.5 : 4.5) : ai.plank2;
    mul = 0.45 + 0.25 * ai.riskNow + 0.12 * p.balance;
  } else if (z < L.bridgeZ1) {
    const br = secs[4].bridges;
    if (ai.bridge === null && z > L.plank2Z1 - 2) ai.bridge = choose(S, bot, br.xs, 2.0, 30, 2.5, 0.35);
    target = ai.bridge === null ? x : ai.bridge;
    if (z > br.z0 - 0.5) mul = 0.56 + 0.2 * ai.riskNow + 0.08 * p.balance;
  } else if (z < L.mazeZ1) {
    const rows = secs[5].rows;
    let ri = -1;
    for (let r = 0; r < rows.length; r++) if (rows[r].z1 + 0.6 > z) { ri = r; break; }
    if (ri >= 0) {
      const row = rows[ri];
      if (ai.mazeRow !== ri) {
        ai.mazeRow = ri;
        let best = 0, bestC = 1e9;
        for (let k = 0; k < row.gaps.length; k++) {
          const g = row.gaps[k];
          const c = Math.abs(g.x - x) + crowd(S, g.x, g.halfWidth + 0.5, z - 1, row.z1) * 1.4
            + bot.rng.next() * 3 + (g.slider ? (1 - ai.riskNow) * 2.5 : 0);
          if (c < bestC) { bestC = c; best = k; }
        }
        ai.gapX = row.gaps[best].x + bot.rng.range(-0.3, 0.3) * row.gaps[best].halfWidth;
        ai.gapHalf = row.gaps[best].halfWidth;
        ai.gapCentre = row.gaps[best].x;
      }
      target = ai.gapX;
      ai.mazeRowZ = row.z0;
    } else {
      target = clamp(ai.laneX, -9.5, 9.5);
    }
    mul = 0.8;
  } else {
    if (ai.mazeRow !== 99) { ai.mazeRow = 99; ai.laneX = clamp(x * 0.5 + p.laneBias * 5, -9.5, 9.5); }
    target = ai.laneX;
  }
  ai.targetX = target;
  ai.speedMul = mul;
}

const _cands = [];

function gatherHazards(S, z0, z1) {
  const W = S.world;
  _cands.length = 0;
  const stamp = ++S.obStampCounter;
  const a = Math.max(0, W.bucketOf(z0)), b = Math.min(W.nb - 1, W.bucketOf(z1));
  for (let i = a; i <= b; i++) {
    const list = W.hazBuckets[i];
    for (let k = 0; k < list.length; k++) {
      const oi = list[k];
      if (S.obStamp[oi] === stamp) continue;
      S.obStamp[oi] = stamp;
      _cands.push(oi);
    }
  }
  return _cands;
}

/**
 * Predict the first hit along a straight run toward targetX at `speed`, optionally jumping at
 * time `jumpAt` (seconds from now, -1 = no jump). Returns tau (seconds) or -1 when clear.
 */
function probe(S, bot, targetX, speed, err, margin, jumpAt = -1, until = 99) {
  const W = S.world, defs = S.obDefs;
  let x = bot.pos.x, z = bot.pos.z, y = bot.pos.y;
  let vx = bot.vel.x, vz = bot.vel.z;
  const t0 = S.time + err;
  const latMax = Math.max(2, Math.abs(speed) * 0.8);
  const gAcc = GROUND_ACCEL * bot.p.accel * PROBE_DT, aAcc = AIR_ACCEL * PROBE_DT;
  for (let i = 0; i <= PROBE_STEPS; i++) {
    const tau = i * PROBE_DT;
    if (tau > until) break;
    let h = 0;
    if (jumpAt >= 0 && tau > jumpAt) {
      const u = tau - jumpAt;
      h = JUMP_V * u - 0.5 * GRAVITY * u * u;
      if (h < 0) h = 0;
    }
    if (i > 0) {
      let dx, dz;
      if (speed < 0) { dx = 0; dz = speed; } else {
        dx = clamp((targetX - x) * 3, -latMax, latMax);
        const s2 = speed * speed - dx * dx;
        dz = s2 > 0 ? Math.sqrt(s2) : 0;
      }
      const ax = dx - vx, az = dz - vz;
      const len = Math.sqrt(ax * ax + az * az);
      const lim = h > 0 ? aAcc : gAcc;
      if (len > lim) { vx += (ax / len) * lim; vz += (az / len) * lim; } else { vx = dx; vz = dz; }
      x += vx * PROBE_DT; z += vz * PROBE_DT;
      const gy = W.groundAt(x, z, y + 0.6);
      if (gy !== NO_GROUND) y = gy;
    }
    const yy = y + h;
    const tm = S.probeTimeMargin;
    for (let k = 0; k < _cands.length; k++) {
      const def = defs[_cands[k]];
      const t = t0 + tau;
      if (hazardHit(def, t, x, yy, z, margin)
        || ((def.type === 'pendulum' || def.type === 'spinner') && (hazardHit(def, t - tm, x, yy, z, margin) || hazardHit(def, t + tm, x, yy, z, margin)))) {
        S.probeHit = def;
        return tau;
      }
    }
  }
  return -1;
}

const JUMP_LEADS = [0.16, 0.22, 0.1, 0.28, 0.04, 0.34, 0];
const SIDE_STEPS = [1.8, -1.8, 3.5, -3.5];
const SLOW_FRACS = [0.55, 0.25, 0, -0.27];
const KIND_JUMP = 0, KIND_SIDE = 1, KIND_SLOW = 2, KIND_SLOWJUMP = 3;
const KIND_NAMES = ['jump', 'side', 'slow', 'slowjump'];
const _plan = { found: false, clear: false, bestTau: 0, tx: 0, fr: 1, tj: -1, kind: 0 };

function tryPlan(S, bot, tx, speed, fr, tj, kind, err, margin) {
  const P = _plan;
  if (P.clear) return;
  const tk = probe(S, bot, tx, speed * fr, err, margin, tj, tj >= 0 ? tj + 0.8 : 99);
  if (tk < 0 || tk > P.bestTau + 0.05) {
    P.found = true; P.clear = tk < 0; P.tx = tx; P.fr = fr; P.tj = tj; P.kind = kind;
    if (tk >= 0) P.bestTau = tk;
  }
}

/** Decide lane, speed, jumps and waits. Called every `reaction` ticks. */
export function think(S, bot) {
  const ai = bot.ai, p = bot.p, m = bot.m, rng = bot.rng;
  // keep the current plan while airborne or about to jump
  if (!bot.grounded || (ai.jumpTick >= 0 && ai.jumpTick - S.tick <= 18)) {
    ai.nextThink = S.tick + 3;
    return;
  }
  // Outside the qualifying places a Gumble pushes: a little more pace and a lot less caution.
  // It is what keeps the fight at the cut line alive to the end of a round.
  const chasing = bot.place > S.qualifyCount && S.state.raceTime > TUNE.chaseAfter;
  ai.riskNow = chasing ? Math.min(1, p.risk + TUNE.chaseRisk) : p.risk;
  ai.chasing = chasing;
  laneTarget(S, bot);
  // In the final the further back a Gumble is, the harder it pushes (up to finalPush more pace at
  // finalPushAt metres behind the leader), so four racers stay one race to the line.
  let push = chasing ? TUNE.chaseSpeed : 0;
  if (chasing && S.qualifyCount === 1) {
    const lead = S.order[0];
    const gap = lead ? lead.pos.z - bot.pos.z : 0;
    push += TUNE.finalPush * clamp(gap / TUNE.finalPushAt, 0, 1);
  }
  let speed = p.topSpeed * (1 + push) * ai.speedMul;
  ai.waiting = false;
  let next = p.reaction + rng.int(4);

  // traffic: someone slower right in front
  const L = S.course.layout;
  const narrow = bot.pos.z > L.rampZ1 && bot.pos.z < L.bridgeZ1;
  const ahead = S.botAhead(bot, 2.4, 0.85);
  if (ahead) {
    const fwd = ahead.vel.z;
    if (fwd < speed - 1.0) {
      if (narrow || p.aggression > 0.7) {
        if (p.aggression < 0.6) speed = Math.max(fwd, 0);
      } else {
        const side = ahead.pos.x <= bot.pos.x ? 1 : -1;
        ai.targetX = bot.pos.x + side * 1.3;
        ai.laneX = ai.targetX;
      }
    }
    // grab the one in front (cheeky)
    if (p.aggression > 0.55 && m.grabUntil < S.tick - 420 && ahead.status === 'racing' && bot.grounded && ahead.grounded
      && ahead.pos.z - bot.pos.z < 1.3 && rng.chance(p.aggression * 0.02)) {
      S.startGrab(bot, ahead);
    }
  }

  // hazards
  const committed = false;
  ai.jumpTick = -1;
  if (S.tick >= ai.errUntil) {
    ai.err = rng.gauss() * (1 - p.timing) * 0.1;
    ai.errUntil = S.tick + 50 + rng.int(70);
  }
  ai.dec = 'skip';
  if (!committed && bot.grounded && m.mode === 'normal' && !rng.chance(p.mistake)) {
    ai.dec = 'clear';
    const look = Math.max(speed, 4) * 1.3 + 3;
    gatherHazards(S, bot.pos.z - 7, bot.pos.z + look);
    if (_cands.length > 0) {
      const err = ai.err;
      const margin = 0.06 + (1 - ai.riskNow) * 0.3;
      S.probeTimeMargin = 0.05 + (1 - ai.riskNow) * 0.1;
      const tau = probe(S, bot, ai.targetX, speed, err, margin);
      if (tau >= 0) {
        const jumpable = isJumpable(S.probeHit);
        const z = bot.pos.z;
        const lim = z >= L.topsFunnelZ && z < L.rampZ1 ? 5.6 : 9.5;
        const canSide = z < L.rampZ1 || z > L.mazeZ1;
        // plan search: first plan that comes back clear wins; else the one that is hit latest
        const P = _plan;
        P.found = false; P.clear = false; P.bestTau = tau;
        if (jumpable && tau < 1.05) {
          for (let k = 0; k < JUMP_LEADS.length; k++) {
            const tj = tau - JUMP_LEADS[k];
            if (tj >= 0) tryPlan(S, bot, ai.targetX, speed, 1, tj, KIND_JUMP, err, margin);
          }
        }
        if (canSide) {
          const dir = p.laneBias >= 0 ? 1 : -1;
          for (let k = 0; k < SIDE_STEPS.length; k++) {
            const tx = ai.targetX + SIDE_STEPS[k] * dir;
            if (tx >= -lim && tx <= lim) tryPlan(S, bot, tx, speed, 1, -1, KIND_SIDE, err, margin);
          }
        }
        for (let k = 0; k < SLOW_FRACS.length; k++) tryPlan(S, bot, ai.targetX, speed, SLOW_FRACS[k], -1, KIND_SLOW, err, margin);
        if (jumpable) {
          for (let k = 0; k < SLOW_FRACS.length - 1; k++) {
            for (let tj = 0.05; tj < 0.8; tj += 0.15) tryPlan(S, bot, ai.targetX, speed, SLOW_FRACS[k], tj, KIND_SLOWJUMP, err, margin);
          }
        }
        if (P.found) {
          if (P.kind === KIND_SIDE) { ai.targetX = P.tx; ai.laneX = P.tx; }
          speed *= P.fr;
          ai.waiting = P.fr <= 0;
          if (P.tj >= 0) {
            const jt = P.tj + rng.gauss() * (1 - p.timing) * 0.05;
            ai.jumpTick = S.tick + Math.max(0, Math.round(jt * 60));
            ai.jumpKind = KIND_NAMES[P.kind];
            next = Math.min(next, Math.max(3, Math.round(jt * 60) + 6));
          }
          ai.dec = P.clear ? KIND_NAMES[P.kind] : 'least';
        } else ai.dec = 'least';
        if (!P.clear) next = Math.min(next, 4);
        else if (P.tj < 0) next = Math.min(next, 4 + (p.reaction >> 1));
      }
    }
  }

  // casual hops on open ground (personality)
  if (ai.jumpTick < 0 && bot.grounded && m.mode === 'normal' && (bot.pos.z < L.topsZ0 || (bot.pos.z > L.mazeZ1 && bot.pos.z < L.sweeperZ - 12))
    && rng.chance(p.hoppy * 0.03)) { ai.jumpTick = S.tick + 1; ai.jumpKind = 'hop'; }

  // dive at the line
  const toFinish = S.course.finish.z - bot.pos.z;
  if (toFinish > 1.5 && toFinish < 4.2 && bot.grounded && m.mode === 'normal' && ai.diveTick < 0) {
    const rival = S.botNear(bot, 3.0);
    if (rival || p.diveHabit > 0.55) ai.diveTick = S.tick + rng.int(4);
  }

  ai.speed = speed;
  ai.nextThink = S.tick + next;
}

/** Desired horizontal velocity for this tick. Writes S.dv.x / S.dv.z. */
export function steer(S, bot) {
  const ai = bot.ai, dv = S.dv, x = bot.pos.x, z = bot.pos.z;
  if (bot.status === 'qualified') {
    const dx = ai.slotX - x, dz = ai.slotZ - z;
    dv.x = clamp(dx * 2.2, -5, 5);
    dv.z = clamp(dz * 2.2, -3, 8);
    return;
  }
  if (bot.status !== 'racing' || S.state.phase !== 'race' || S.tick < bot.m.goTick) { dv.x = 0; dv.z = 0; return; }
  let speed = ai.speed;
  if (bot.m.slope > 0) speed *= 1 - 2.5 * bot.m.slope;
  if (bot.m.mode === 'stumble') speed *= 0.5;
  if (bot.m.grabUntil > S.tick) speed *= 0.5;
  if (bot.m.grabbedUntil > S.tick) speed *= 0.55;
  if (speed < 0) { dv.x = 0; dv.z = speed; return; }
  // lean against a tilted ruler
  let tx = ai.targetX;
  if (bot.m.seesaw) {
    const r = bot.m.roll;
    tx += Math.sin(r) * 0.8 * bot.p.balance;
    speed *= 1 - (1.5 - bot.p.balance) * (r < 0 ? -r : r);
  }
  const latMax = Math.max(2, speed * 0.8);
  const vx = clamp((tx - x) * 3, -latMax, latMax);
  const s2 = speed * speed - vx * vx;
  let vz = s2 > 0 ? Math.sqrt(s2) : 0;
  if (ai.mazeRowZ > 0) {
    const dz = ai.mazeRowZ - z;
    if (dz < 2.6 && dz > -0.3 && Math.abs(x - ai.gapCentre) > ai.gapHalf - 0.55) vz = Math.min(vz, 1.0);
  }
  dv.x = vx;
  dv.z = vz;
}
