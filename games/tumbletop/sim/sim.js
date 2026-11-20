// Tumbletop race simulation: fixed 60 Hz step, seeded, deterministic, emits events.
import { COURSE, sectionAt, checkpointIndex } from './course.js';
import { Rng, mixSeed } from './rng.js';
import { ROSTER, gumble } from './roster.js';
import { ROUNDS } from './rounds.js';
import { createObstacleState, updateObstacleState, hazardHit } from './obstacles.js';
import {
  World, BotGrid, resolveWalls, GRAVITY, JUMP_V, GROUND_ACCEL, AIR_ACCEL, TUMBLE_FRICTION,
  STEP_UP, SNAP_DOWN, NO_GROUND, knockLift, knockFling, knockLockTicks, tumbleBounce, GETUP_TICKS, SPRAWL_HOP,
} from './physics.js';
import { makePersonality, makeBrain, resetBrain, think, steer } from './ai.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const INTRO_TIME = 0;
export const COUNTDOWN_TIME = 3;
export const TIME_LIMIT = 90;
export const RESPAWN_DELAY = 1.5;

export const ANIMS = ['idle', 'run', 'jump', 'fall', 'dive', 'getup', 'stumble', 'tumble', 'grab', 'celebrate', 'sad'];
export const STATUSES = ['racing', 'qualified', 'eliminated', 'respawning'];
export const PHASES = ['intro', 'countdown', 'race', 'finished'];
export const EVENT_TYPES = [
  'phase', 'start', 'leadChange', 'overtake', 'fall', 'respawn', 'knockback', 'bump', 'tumble',
  'nearMiss', 'pileup', 'checkpoint', 'qualified', 'lastSpot', 'eliminated', 'roundEnd',
  'photoFinish', 'comeback',
];

/**
 * Per-bot chatter throttle: low-importance "colour" events (bumps, near misses, minor tumbles...)
 * are dropped when the same bot spoke in the last THROTTLE_TICKS ticks, so the feed is not
 * flooded. Milestone events record a fact about the race result and are never throttled.
 */
const MILESTONE_TYPES = new Set([
  'phase', 'start', 'leadChange', 'checkpoint', 'qualified', 'lastSpot', 'eliminated', 'roundEnd',
  'photoFinish', 'comeback', 'pileup',
]);
const THROTTLE_IMPORTANCE = 0.35;
const THROTTLE_TICKS = 90;

const FALL_TEXT = {
  start: 'fell off the game board',
  tops: 'got flung off the Spinning Top Field',
  ramp: 'tumbled off the Bookshelf Climb',
  seesaws: 'fell off a ruler seesaw',
  bridges: 'fell off a crayon bridge',
  maze: 'fell off the course',
  final: 'fell off the course',
};

function knockText(def) {
  if (def.type === 'spinner') return def.style === 'pencil' ? 'got swept by the giant pencil' : 'got swatted by a spinning top';
  if (def.type === 'marble') return 'got bowled over by a marble';
  if (def.type === 'pendulum') return 'got smacked by a metronome';
  if (def.type === 'slider') return 'got shoved by a sliding block';
  return 'got knocked flying';
}
function nearMissText(def) {
  if (def.type === 'spinner') return def.style === 'pencil' ? 'hops the giant pencil just in time' : 'barely clears a spinning top';
  if (def.type === 'marble') return 'leaps over a marble';
  if (def.type === 'pendulum') return 'squeaks past a metronome';
  return 'narrowly escapes';
}

/** A gap in words, the same way everywhere: "a whisker" under half a metre, one decimal under ten. */
export function metres(gap) {
  if (gap < 0.5) return 'a whisker';
  return `${gap < 9.95 ? gap.toFixed(1) : Math.round(gap)} metres`;
}

export function ordinal(n) {
  const s = n % 100;
  if (s >= 11 && s <= 13) return n + 'th';
  switch (n % 10) { case 1: return n + 'st'; case 2: return n + 'nd'; case 3: return n + 'rd'; default: return n + 'th'; }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function hidden(obj, key, value) { Object.defineProperty(obj, key, { value, enumerable: false, writable: true, configurable: true }); }

export function createSim(opts = {}) {
  return new Sim(opts);
}

class Sim {
  /**
   * seed      uint32
   * round     0, 1 or 2 (see rounds.js)
   * entrants  roster ids in start-grid order (default: the first `starters` of the roster)
   * lobby     true = hold on the start line forever (the line-up while bets are open)
   */
  constructor({ seed = 1, round = 0, entrants = null, lobby = false, qualifyCount = null } = {}) {
    this.seed = seed >>> 0;
    const R = ROUNDS[round] || ROUNDS[0];
    this.round = R;
    const cp0 = checkpointIndex(R.cp0);
    this.lobby = !!lobby;
    const list = (entrants && entrants.length ? entrants : ROSTER.slice(0, R.starters)).map(gumble);
    const N = Math.max(2, list.length);
    const Q = Math.max(1, Math.min((qualifyCount ?? R.qualify) | 0, N - 1));
    // The round's stretch of the course: same world, its own start line, finish line and length.
    this.course = { ...COURSE, startZ: R.startZ, finish: { ...R.finish }, length: R.finish.z - R.startZ, roundName: R.name };
    const C = this.course;
    this.botCount = N;
    this.qualifyCount = Q;
    this.timeLimit = R.timeLimit ?? TIME_LIMIT;
    this.rng = new Rng(mixSeed(this.seed, 0x51a7 + R.index));
    this.tick = 0;
    this.time = 0;
    this.dv = { x: 0, z: 0 };
    this.probeHit = null;

    // obstacles
    this.obDefs = COURSE.obstacles;
    this.obStates = this.obDefs.map(createObstacleState);
    this.obStamp = new Int32Array(this.obDefs.length);
    this.obStampCounter = 0;
    this.obStates.forEach((ob, i) => updateObstacleState(ob, this.obDefs[i], 0, DT));
    this.world = new World(COURSE, this.obDefs, this.obStates);

    // bots: id = start-grid slot in this round; rid = permanent roster id
    this.bots = [];
    for (let i = 0; i < N; i++) {
      const g = list[i];
      const { x, z } = R.grid(i, N);
      const gy0 = this.world.groundAt(x, z, 1000);
      const y = gy0 === NO_GROUND ? C.finish.y : gy0;
      const b = {
        id: i, rid: g.id, num: g.num, name: g.name, colors: g.colors, pattern: g.pattern, stats: g.stats, trait: g.trait,
        pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, yaw: 0,
        anim: 'idle', animTime: 0, grounded: true,
        progress: 0, distance: 0, place: i + 1,
        status: 'racing', finishTime: null, finishPlace: null, section: sectionAt(z), lastEventTick: -1000,
        checkpoint: cp0,
      };
      const rng = new Rng(mixSeed(mixSeed(this.seed, 1000 + g.num), R.index));
      hidden(b, 'rng', rng);
      hidden(b, 'p', makePersonality(g.stats, rng));
      const ai = makeBrain();
      ai.laneX = clamp(x + b.p.laneBias * 2, -10, 10);
      hidden(b, 'ai', ai);
      hidden(b, 'm', {
        mode: 'normal', modeUntil: 0, invulnUntil: 0, falling: false, physical: true,
        respawnTick: 0, lastGroundY: y, slope: 0, seesaw: null, roll: 0, cp: cp0, prevZ: z,
        goTick: 0, grabUntil: -1, grabbedUntil: -1, lastKnockTick: -1000,
        nmDef: null, nmTick: 0, nmLastEvent: -1000, worstPlace: 0, comebackDone: false,
        cutState: true, cutCand: true, cutCandTick: 0, topState: false, topCand: false, topCandTick: 0,
        lastBumpTick: -1000, emoteUntil: 0, nextEmote: 30 + rng.int(300), rankKey: 0, elimOrder: 0,
        spin: 0,
      });
      this.bots.push(b);
    }
    this.order = this.bots.slice();
    this.grid = new BotGrid(COURSE.bounds, this.botCount);
    this.fin = [];
    this.pending = [];
    this.log = [];
    this.incidents = [];
    this.lastPileupTick = -1000;
    this.leadCand = -1; this.leadCandTick = 0; this.confirmedLeader = -1;
    this.lastCutEventTick = -1000; this.lastTopEventTick = -1000;
    this.cpFirst = COURSE.checkpoints.map(() => -1);
    this.raceStartTick = -1;
    this.elimCount = 0;

    this.state = {
      tick: 0, time: 0, phase: this.lobby ? 'intro' : 'countdown', phaseTime: 0, raceTime: 0, countdown: COUNTDOWN_TIME,
      seed: this.seed, courseName: COURSE.name, round: this.round.index, roundName: this.round.name,
      bots: this.bots, obstacles: this.obStates,
      qualifiedCount: 0, qualifyCount: this.qualifyCount, eliminatedCount: 0, botCount: this.botCount,
      leaderId: 0, bubble: [], order: [], timedOut: false,
      // the holder of the last qualifying place (-1 before anyone is ranked) and how often it changed
      cutHolderId: -1, cutChanges: 0,
    };
    this.cutHolder = -1; this.cutHolderCand = -1; this.cutHolderCandTick = 0; this.cutLog = [];
    this.phaseStartTick = 0;
    this._rank();
  }

  // ------------------------------------------------------------------ public API
  step() {
    this.tick++;
    const tick = this.tick;
    this.time = tick * DT;
    const st = this.state;
    st.tick = tick;
    st.time = this.time;
    for (let i = 0; i < this.obDefs.length; i++) updateObstacleState(this.obStates[i], this.obDefs[i], this.time, DT);
    this._phase();
    const bots = this.bots;
    if (st.phase === 'race') {
      for (let i = 0; i < bots.length; i++) {
        const b = bots[i];
        if (b.status === 'racing' && tick >= b.ai.nextThink && tick >= b.m.goTick && !b.m.falling) think(this, b);
      }
    }
    this.fin.length = 0;
    for (let i = 0; i < bots.length; i++) this._stepBot(bots[i]);
    this._bumps();
    for (let i = 0; i < bots.length; i++) this._progress(bots[i]);
    if (this.fin.length) this._finishes();
    this._rank();
    st.phaseTime = (tick - this.phaseStartTick) * DT;
    st.raceTime = this.raceStartTick >= 0 ? (tick - this.raceStartTick) * DT : 0;
    if (st.phase === 'countdown') st.countdown = Math.max(0, COUNTDOWN_TIME - st.phaseTime);
  }

  drainEvents() {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** All events emitted so far (not drained). */
  eventLog() { return this.log; }

  hash() {
    let h1 = 0x811c9dc5 | 0, h2 = 0x01000193 ^ 0x5bd1e995;
    const mix = (v) => {
      v |= 0;
      h1 = Math.imul(h1 ^ v, 16777619);
      h2 = Math.imul(h2 ^ (v >>> 0) ^ (h1 >>> 15), 0x5bd1e995);
      h2 ^= h2 >>> 13;
    };
    const f = (x) => mix(Math.round(x * 1000));
    mix(this.tick);
    mix(PHASES.indexOf(this.state.phase));
    mix(this.state.qualifiedCount);
    for (const b of this.bots) {
      f(b.pos.x); f(b.pos.y); f(b.pos.z); f(b.vel.x); f(b.vel.y); f(b.vel.z); f(b.yaw);
      mix(STATUSES.indexOf(b.status)); mix(ANIMS.indexOf(b.anim)); mix(b.place);
      mix(b.finishPlace ?? -1); mix(b.grounded ? 1 : 0);
      const s = b.rng.state();
      mix(s[0]); mix(s[3]);
    }
    const r = this.rng.state();
    mix(r[0]); mix(r[1]);
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }

  /** Run headless until the round ends (plus `extra` seconds). */
  runToEnd(extra = 0, maxTicks = 60 * 600) {
    while (this.state.phase !== 'finished' && this.tick < maxTicks) this.step();
    const end = this.tick + Math.round(extra * TICK_RATE);
    while (this.tick < end) this.step();
    return this;
  }

  finishOrder() {
    return this.order.map((b) => ({
      place: b.place, id: b.id, name: b.name, status: b.status,
      finishTime: b.finishTime, finishPlace: b.finishPlace,
    }));
  }

  // ------------------------------------------------------------------ helpers for the AI
  botAhead(bot, dist, halfW) {
    let best = null, bestDz = dist;
    const bots = this.bots, p = bot.pos;
    for (let i = 0; i < bots.length; i++) {
      const o = bots[i];
      if (o === bot || !o.m.physical) continue;
      const dz = o.pos.z - p.z;
      if (dz <= 0.2 || dz >= bestDz) continue;
      const dx = o.pos.x - p.x;
      if (dx > halfW || dx < -halfW) continue;
      if (o.pos.y - p.y > 1 || p.y - o.pos.y > 1) continue;
      best = o; bestDz = dz;
    }
    return best;
  }

  botNear(bot, dist) {
    const bots = this.bots, p = bot.pos;
    for (let i = 0; i < bots.length; i++) {
      const o = bots[i];
      if (o === bot || o.status !== 'racing') continue;
      const dz = o.pos.z - p.z, dx = o.pos.x - p.x;
      if (dz * dz + dx * dx < dist * dist) return o;
    }
    return null;
  }

  startGrab(a, b) {
    a.m.grabUntil = this.tick + 36;
    b.m.grabbedUntil = this.tick + 36;
    this._emit('bump', 0.3, `${a.name} grabs hold of ${b.name}`, a, b);
  }

  // ------------------------------------------------------------------ internals
  _emit(type, importance, text, bot = null, other = null, extra = null) {
    importance = clamp(importance, 0, 1);
    if (bot) {
      if (!MILESTONE_TYPES.has(type) && importance < THROTTLE_IMPORTANCE
        && this.tick - bot.lastEventTick < THROTTLE_TICKS) return null;
      bot.lastEventTick = this.tick;
    }
    const ev = { tick: this.tick, time: this.time, type, importance: Math.round(importance * 100) / 100, text };
    if (bot) {
      ev.botId = bot.id;
      ev.section = bot.section;
      ev.pos = { x: Math.round(bot.pos.x * 100) / 100, y: Math.round(bot.pos.y * 100) / 100, z: Math.round(bot.pos.z * 100) / 100 };
    }
    if (other) ev.otherId = other.id;
    if (extra) Object.assign(ev, extra);
    this.pending.push(ev);
    this.log.push(ev);
    return ev;
  }

  /** Importance boost for bots the audience cares about. */
  _boost(b) {
    const Q = this.qualifyCount;
    if (b.place === 1 && Q > 1) return 0.15;
    if (Q === 1 && b.place <= 2) return 0.25;
    if (b.place >= Q - 1 && b.place <= Q + 2) return 0.2;
    return 0;
  }

  _phase() {
    const st = this.state;
    const t = this.time;
    if (st.phase === 'intro') {
      // the lobby line-up never starts on its own
    } else if (st.phase === 'countdown' && t >= COUNTDOWN_TIME) {
      this._setPhase('race');
      this.raceStartTick = this.tick;
      for (const b of this.bots) { b.m.goTick = this.tick + b.p.startDelay; b.ai.nextThink = b.m.goTick; }
      this._emit('phase', 0.5, 'Race on!', null, null, { phase: 'race' });
      this._emit('start', 0.85, `And they're off! ${this.botCount} Gumbles, ${this.qualifyCount === 1 ? 'one winner' : `${this.qualifyCount} go through`}`);
    } else if (st.phase === 'race') {
      const rt = (this.tick - this.raceStartTick) * DT;
      if (st.qualifiedCount >= this.qualifyCount) this._endRace(false);
      else if (rt >= this.timeLimit) this._endRace(true);
    }
  }

  _setPhase(p) {
    this.state.phase = p;
    this.phaseStartTick = this.tick;
  }

  _endRace(timeout) {
    this._setPhase('finished');
    const Q = this.qualifyCount, st = this.state;
    const final = Q === 1;
    if (timeout) {
      // Safety net (the completion check counts these): the clock ran out with places still open,
      // so the best-placed racers take them in order. A show always has its 8, 4 and 1.
      st.timedOut = true;
      for (const b of this.order) {
        if (st.qualifiedCount >= Q) break;
        if (b.status === 'qualified') continue;
        if (b.status === 'respawning' || b.m.falling) this._placeAtCheckpoint(b);
        st.qualifiedCount++;
        b.status = 'qualified';
        b.finishPlace = st.qualifiedCount;
        b.finishTime = null;
        b.m.mode = 'normal';
        b.ai.jumpTick = -1; b.ai.diveTick = -1;
        b.ai.slotX = b.pos.x; b.ai.slotZ = b.pos.z;
        this._emit('qualified', 0.6, `${b.name} goes through on the clock`, b, null, { place: b.finishPlace });
      }
    }
    let k = 0;
    for (const b of this.order) {
      if (b.status === 'qualified') continue;
      const wasDown = b.status === 'respawning' || b.m.falling;
      const gap = Math.max(0, this.course.finish.z - (wasDown ? COURSE.checkpoints[b.m.cp].z : b.pos.z));
      b.status = 'eliminated';
      b.m.elimOrder = ++this.elimCount;
      b.finishPlace = null;
      if (wasDown) this._placeAtCheckpoint(b);
      b.m.mode = 'normal';
      b.ai.jumpTick = -1; b.ai.diveTick = -1;
      const first = k === 0;
      const near = first && !timeout && gap < 12;
      this._emit('eliminated', first && !timeout ? 0.8 : 0.45,
        final ? `${b.name} finishes ${ordinal(b.place)}`
          : near ? `${b.name} misses out by ${metres(gap)}`
            : `${b.name} is out`, b, null, { place: b.place, gap: Math.round(gap * 10) / 10 });
      k++;
    }
    st.eliminatedCount = this.elimCount;
    this._emit('phase', 0.5, 'Round over', null, null, { phase: 'finished' });
    this._emit('roundEnd', 1, final ? 'The final is over' : `${Q} go through, ${this.elimCount} are out`, null, null, { timeout });
  }

  _placeAtCheckpoint(b) {
    const cp = COURSE.checkpoints[b.m.cp];
    let sp = cp.spawn;
    if (cp.spawns) {
      // separate decks: drop back onto the one nearest to where it went off
      let bd = 1e9;
      for (const c of cp.spawns) { const d = Math.abs((c.x0 + c.x1) / 2 - b.pos.x); if (d < bd) { bd = d; sp = c; } }
    }
    const x = b.rng.range(sp.x0, sp.x1);
    const z = b.rng.range(sp.z0, sp.z1);
    const gy = this.world.groundAt(x, z, 1000);
    b.pos.x = x; b.pos.z = z; b.pos.y = (gy === NO_GROUND ? cp.y : gy) + 2.2;
    b.vel.x = 0; b.vel.y = 0; b.vel.z = 0;
    b.grounded = false;
    b.m.falling = false;
    b.m.physical = true;
    b.m.lastGroundY = gy === NO_GROUND ? cp.y : gy;
    b.m.prevZ = z;
  }

  _respawn(b) {
    b.status = 'racing';
    this._placeAtCheckpoint(b);
    b.m.mode = 'normal';
    b.m.invulnUntil = this.tick + 45;
    resetBrain(b.ai);
    b.ai.laneX = b.pos.x;
    b.ai.nextThink = this.tick + 20;
    b.m.goTick = this.tick + 20;
    const cp = COURSE.checkpoints[b.m.cp];
    this._emit('respawn', 0.2 + this._boost(b) * 0.5, `${b.name} drops back in`, b, null, { checkpoint: cp.index });
  }

  _setMode(b, mode, ticks) {
    b.m.mode = mode;
    b.m.modeUntil = this.tick + ticks;
  }

  _incident(b) {
    const inc = this.incidents;
    inc.push({ tick: this.tick, x: b.pos.x, z: b.pos.z, id: b.id });
    if (inc.length > 40) inc.shift();
    if (this.tick - this.lastPileupTick < 300) return;
    let n = 0;
    const seen = [];
    for (let i = inc.length - 1; i >= 0; i--) {
      const e = inc[i];
      if (this.tick - e.tick > 75) break;
      const dx = e.x - b.pos.x, dz = e.z - b.pos.z;
      if (dx * dx + dz * dz < 64 && !seen.includes(e.id)) { seen.push(e.id); n++; }
    }
    if (n >= 4) {
      this.lastPileupTick = this.tick;
      this._emit('pileup', 0.8, `Pile-up on the ${COURSE.sections[b.section].name}! ${n} Gumbles down`, null, null,
        { section: b.section, pos: { x: Math.round(b.pos.x * 100) / 100, y: Math.round(b.pos.y * 100) / 100, z: Math.round(b.pos.z * 100) / 100 }, count: n, botIds: seen.slice() });
    }
  }

  _knock(b, vx, vy, vz, lockSec, def) {
    const m = b.m;
    const fl = knockFling(vy) * b.p.flingScale;
    b.vel.x = vx * fl; b.vel.y = knockLift(vy); b.vel.z = vz * fl;
    b.grounded = false;
    const lock = Math.round(knockLockTicks(lockSec, TICK_RATE, vy) * b.p.downScale);
    this._setMode(b, 'tumble', lock);
    m.invulnUntil = this.tick + lock + 50;
    m.lastKnockTick = this.tick;
    m.spin = (b.rng.next() * 2 - 1) * 9;
    b.ai.jumpTick = -1; b.ai.diveTick = -1;
    if (def) {
      this._emit('knockback', 0.42 + this._boost(b) + (def.type === 'pendulum' ? 0.1 : 0),
        `${b.name} ${knockText(def)}`, b, null, { obstacleId: def.id, obstacleType: def.type });
    }
    this._incident(b);
  }

  _hazards(b) {
    const W = this.world, p = b.pos, t = this.time;
    const bi = W.bucketOf(p.z);
    if (bi < 0 || bi >= W.nb) return;
    const list = W.hazBuckets[bi];
    for (let k = 0; k < list.length; k++) {
      const oi = list[k];
      const def = this.obDefs[oi];
      if (def.type === 'slider') continue;
      if (hazardHit(def, t, p.x, p.y, p.z, 0)) {
        const ob = this.obStates[oi];
        if (def.type === 'spinner') {
          const dx = p.x - def.x, dz = p.z - def.z;
          const rho = Math.max(0.01, Math.sqrt(dx * dx + dz * dz));
          const s = def.omega >= 0 ? 1 : -1;
          const tx = (-dz / rho) * s, tz = (dx / rho) * s;
          const sp = def.knock + Math.abs(def.omega) * rho * 0.55;
          this._knock(b, tx * sp + (dx / rho) * 2.5, 5.5, tz * sp + (dz / rho) * 2.5, def.style === 'pencil' ? 1.05 : 0.85, def);
        } else if (def.type === 'marble') {
          let nx = p.x - ob.pos.x, nz = p.z - ob.pos.z;
          const d = Math.max(0.01, Math.sqrt(nx * nx + nz * nz));
          nx /= d; nz /= d;
          this._knock(b, nx * 4.5, 6, -def.speed * 0.85 + nz * 2 - 1.5, 0.95, def);
        } else if (def.type === 'pendulum') {
          let dir = ob.vel.x > 0.3 ? 1 : ob.vel.x < -0.3 ? -1 : (p.x >= ob.pos.x ? 1 : -1);
          this._knock(b, dir * def.knock, 6.5, b.vel.z * 0.3, 1.1, def);
        }
        return;
      }
      if (b.m.nmDef === null && (def.type === 'pendulum' || def.style === 'pencil' || (def.type === 'marble' && !b.grounded)
        || (def.type === 'spinner' && !b.grounded)) && hazardHit(def, t, p.x, p.y, p.z, 0.4)) {
        b.m.nmDef = def;
        b.m.nmTick = this.tick;
      }
    }
  }

  _startFall(b) {
    const m = b.m;
    m.falling = true;
    m.physical = false;
    m.mode = 'normal';
    b.ai.jumpTick = -1; b.ai.diveTick = -1;
    const key = COURSE.sections[sectionAt(m.lastGroundZ ?? b.pos.z)].key;
    const lead = b.place === 1;
    this._emit('fall', 0.55 + this._boost(b) + (lead ? 0.1 : 0),
      lead ? `Leader ${b.name} ${FALL_TEXT[key]}!` : `${b.name} ${FALL_TEXT[key]}`, b);
    this._incident(b);
  }

  _stepBot(b) {
    const m = b.m, p = b.pos, v = b.vel, W = this.world, tick = this.tick, ai = b.ai;
    const st = this.state;
    if (b.status === 'respawning') {
      if (tick >= m.respawnTick && st.phase === 'race') this._respawn(b);
      else { this._anim(b, 'fall'); return; }
    }
    m.prevZ = p.z;

    // mode transitions
    if (m.mode === 'tumble') { if (tick >= m.modeUntil && b.grounded) this._setMode(b, 'getup', Math.round(GETUP_TICKS * b.p.downScale)); }
    else if (m.mode === 'getup' || m.mode === 'stumble') { if (tick >= m.modeUntil) m.mode = 'normal'; }
    else if (m.mode === 'dive') { if (b.grounded && tick >= m.modeUntil) this._setMode(b, 'slide', 16); }
    else if (m.mode === 'slide') { if (tick >= m.modeUntil) this._setMode(b, 'getup', 16); }

    const active = b.status === 'racing' || b.status === 'qualified';
    const control = active && !m.falling && (m.mode === 'normal' || m.mode === 'stumble');
    steer(this, b);
    const dv = this.dv;

    if (b.grounded) {
      if (control) {
        const ax = dv.x - v.x, az = dv.z - v.z;
        const len = Math.sqrt(ax * ax + az * az);
        const maxDv = GROUND_ACCEL * b.p.accel * (m.mode === 'stumble' ? 0.35 : 1) * DT;
        if (len > maxDv) { v.x += (ax / len) * maxDv; v.z += (az / len) * maxDv; } else { v.x = dv.x; v.z = dv.z; }
      } else {
        const fr = (m.mode === 'getup' ? 16 : m.mode === 'slide' ? 7 : b.status === 'eliminated' ? 14 : TUMBLE_FRICTION) * DT;
        const hs = Math.sqrt(v.x * v.x + v.z * v.z);
        if (hs <= fr) { v.x = 0; v.z = 0; } else { v.x -= (v.x / hs) * fr; v.z -= (v.z / hs) * fr; }
      }
      if (m.seesaw) {
        const r = m.roll;
        v.x -= Math.sin(r) * Math.cos(r) * GRAVITY * 0.55 * DT;
        // poor balance on a steep ruler: slip
        const ar = r < 0 ? -r : r;
        if (control && b.status === 'racing' && m.mode === 'normal' && ar > 0.22) {
          const pr = (1 - b.p.balance) * 0.0015 * (ar - 0.2) / 0.12;
          if (b.rng.next() < pr) {
            v.x += (r > 0 ? -1 : 1) * (2.5 + 2.5 * b.rng.next());
            this._setMode(b, 'tumble', 30);
            m.lastKnockTick = tick;
            this._emit('tumble', 0.3 + this._boost(b), `${b.name} loses their footing on a wobbly ruler`, b);
            this._incident(b);
          }
        }
      }
      if (control && b.status === 'racing' && st.phase === 'race') {
        if (ai.diveTick >= 0 && tick >= ai.diveTick) {
          ai.diveTick = -2;
          const hs = Math.max(0.1, Math.sqrt(v.x * v.x + v.z * v.z));
          const ns = Math.min(hs + 3.8, 12.5);
          v.x = (v.x / hs) * ns; v.z = (v.z / hs) * ns; v.y = 4.2;
          b.grounded = false;
          this._setMode(b, 'dive', 8);
        } else if (ai.jumpTick >= 0 && tick >= ai.jumpTick) {
          ai.jumpTick = -1;
          m.jumpKind = ai.jumpKind; m.jumpTickAt = tick;
          v.y = JUMP_V;
          b.grounded = false;
        }
      }
    } else {
      v.y -= GRAVITY * DT;
      if (control) {
        const ax = dv.x - v.x, az = dv.z - v.z;
        const len = Math.sqrt(ax * ax + az * az);
        const maxDv = AIR_ACCEL * DT;
        if (len > maxDv) { v.x += (ax / len) * maxDv; v.z += (az / len) * maxDv; } else { v.x = dv.x; v.z = dv.z; }
      }
    }
    if (ai.jumpTick >= 0 && tick > ai.jumpTick + 3) ai.jumpTick = -1;

    p.x += v.x * DT; p.y += v.y * DT; p.z += v.z * DT;

    // ground
    const wasGrounded = b.grounded;
    if (!m.falling) {
      const gy = W.groundAt(p.x, p.z, p.y + STEP_UP);
      const g = W.g;
      if (wasGrounded && v.y <= 0.01) {
        if (gy !== NO_GROUND && gy >= p.y - SNAP_DOWN) { p.y = gy; v.y = 0; b.grounded = true; }
        else b.grounded = false;
      } else if (gy !== NO_GROUND && p.y <= gy && v.y <= 0) {
        if (m.mode !== 'tumble' || !tumbleBounce(b, gy)) { p.y = gy; v.y = 0; b.grounded = true; }
        if (ai.nextThink > tick + 1) ai.nextThink = tick + 1;
      } else b.grounded = false;
      if (b.grounded) {
        m.lastGroundY = gy; m.lastGroundZ = p.z; m.slope = g.slope; m.seesaw = g.seesaw; m.roll = g.roll;
      } else { m.slope = 0; m.seesaw = null; }

      const shover = resolveWalls(W, b);
      if (shover && tick >= m.invulnUntil && b.status === 'racing') {
        const sv = shover.slider.vel.x;
        this._knock(b, Math.sign(sv) * (Math.abs(sv) * 1.4 + 3.5), 3.5, v.z * 0.5, 0.6, shover.def);
      }
      if (tick >= m.invulnUntil && b.status === 'racing') this._hazards(b);

      // near-miss resolution
      if (m.nmDef !== null && tick - m.nmTick >= 24) {
        if (m.lastKnockTick < m.nmTick && b.status === 'racing' && tick - m.nmLastEvent > 240) {
          const boost = this._boost(b);
          if (boost > 0 || m.nmDef.type === 'pendulum' || m.nmDef.style === 'pencil') {
            m.nmLastEvent = tick;
            this._emit('nearMiss', 0.3 + boost, `${b.name} ${nearMissText(m.nmDef)}`, b, null, { obstacleId: m.nmDef.id, obstacleType: m.nmDef.type });
          }
        }
        m.nmDef = null;
      }

      // fall detection
      if (!b.grounded && b.status === 'racing' && p.y < m.lastGroundY - 1.2) {
        if (W.groundAt(p.x, p.z, p.y + 0.05) === NO_GROUND) this._startFall(b);
      }
    } else {
      v.x *= 0.995; v.z *= 0.995;
    }

    if (p.y < COURSE.killY) {
      if (b.status === 'racing') {
        if (!m.falling) this._startFall(b);
        b.status = 'respawning';
        m.respawnTick = tick + Math.round(RESPAWN_DELAY * b.p.downScale * TICK_RATE);
        v.x = 0; v.y = 0; v.z = 0;
      } else if (b.status === 'eliminated' || b.status === 'qualified') {
        this._placeAtCheckpoint(b);
      }
    }

    // yaw
    const hs2 = v.x * v.x + v.z * v.z;
    if (m.mode === 'tumble' && !b.grounded) {
      b.yaw += m.spin * DT;
    } else if (hs2 > 0.5 && m.mode !== 'getup') {
      const target = Math.atan2(v.x, v.z);
      let d = target - b.yaw;
      d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      b.yaw += d * Math.min(1, 14 * DT);
    }
    b.yaw = ((b.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

    // animation
    let anim;
    if (m.mode === 'tumble') anim = 'tumble';
    else if (m.mode === 'getup') anim = 'getup';
    else if (m.mode === 'dive' || m.mode === 'slide') anim = 'dive';
    else if (!b.grounded) anim = m.falling || v.y < -9 ? 'fall' : 'jump';
    else if (b.status === 'eliminated') anim = 'sad';
    else if (m.mode === 'stumble') anim = 'stumble';
    else if (m.grabUntil > tick) anim = 'grab';
    else if (b.status === 'qualified' && hs2 < 6) anim = 'celebrate';
    else if (hs2 > 0.64) anim = 'run';
    else if (st.phase === 'intro') {
      if (tick >= m.nextEmote) { m.emoteUntil = tick + 70 + b.rng.int(50); m.nextEmote = m.emoteUntil + 90 + b.rng.int(260); }
      anim = tick < m.emoteUntil ? 'celebrate' : 'idle';
    } else anim = 'idle';
    this._anim(b, anim);
  }

  /** Checkpoints and finish-line crossing, after all movement (incl. bumps) this tick. */
  _progress(b) {
    const m = b.m, p = b.pos, tick = this.tick;
    if (b.status === 'racing' && !m.falling) {
      const cps = COURSE.checkpoints, F0 = this.course.finish;
      while (m.cp + 1 < cps.length && p.z >= cps[m.cp + 1].z && p.y > cps[m.cp + 1].y - 1.5) {
        m.cp++;
        b.checkpoint = m.cp;
        if (this.cpFirst[m.cp] < 0) {
          this.cpFirst[m.cp] = b.id;
          const sec = COURSE.sections[cps[m.cp].section];
          if (cps[m.cp].z < F0.z - 4) this._emit('checkpoint', 0.5, `${b.name} is first through the ${sec.name}`, b, null, { checkpoint: m.cp });
        }
      }
      const F = this.course.finish;
      if (this.state.phase === 'race' && m.prevZ < F.z && p.z >= F.z && Math.abs(p.x - F.x) <= F.width / 2 + 0.5 && p.y > F.y - 1.5) {
        const frac = (F.z - m.prevZ) / Math.max(1e-6, p.z - m.prevZ);
        this.fin.push({ b, t: (tick - 1 + frac - this.raceStartTick) * DT });
      }
    }
    b.section = sectionAt(p.z);
  }

  _anim(b, anim) {
    if (b.anim !== anim) { b.anim = anim; b.animTime = 0; } else b.animTime += DT;
  }

  _bumps() {
    const G = this.grid, bots = this.bots;
    G.rebuild(bots);
    const nx = G.nx, nz = G.nz;
    for (let i = 0; i < bots.length; i++) {
      const c = G.cellOf[i];
      if (c < 0) continue;
      const cx = c % nx, cz = (c - cx) / nx;
      for (let oz = -1; oz <= 1; oz++) {
        const zz = cz + oz;
        if (zz < 0 || zz >= nz) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = cx + ox;
          if (xx < 0 || xx >= nx) continue;
          let j = G.head[zz * nx + xx];
          while (j >= 0) {
            if (j > i) this._pair(bots[i], bots[j]);
            j = G.next[j];
          }
        }
      }
    }
  }

  _pair(a, b) {
    const pa = a.pos, pb = b.pos;
    const dy = pa.y - pb.y;
    if (dy > 0.95 || dy < -0.95) return;
    let dx = pa.x - pb.x, dz = pa.z - pb.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= 1) return;
    let d = Math.sqrt(d2);
    if (d < 1e-6) { dx = a.id < b.id ? 1 : -1; dz = 0; d = 1e-6; } else { dx /= d; dz /= d; }
    const pen = (1 - d) * 0.5;
    pa.x += dx * pen; pa.z += dz * pen;
    pb.x -= dx * pen; pb.z -= dz * pen;
    const va = a.vel, vb = b.vel;
    const vrel = (va.x - vb.x) * dx + (va.z - vb.z) * dz;
    if (vrel >= 0) return;
    const j = -1.3 * vrel * 0.5;
    va.x += j * dx; va.z += j * dz;
    vb.x -= j * dx; vb.z -= j * dz;
    const closing = -vrel;
    if (closing < 4.5 || this.state.phase !== 'race' || a.status !== 'racing' || b.status !== 'racing') return;
    // who ran into whom
    const sa = -(va.x * dx + va.z * dz), sb = vb.x * dx + vb.z * dz;
    const att = sa > sb ? a : b, vic = att === a ? b : a;
    const tick = this.tick;
    if (tick - vic.m.lastBumpTick < 60) return;
    vic.m.lastBumpTick = tick;
    if (closing > 6 && vic.m.mode === 'normal' && this.rng.next() < (0.25 + att.p.aggression * 0.45) * vic.p.bargeScale) {
      if (closing > 8.5) {
        this._setMode(vic, 'tumble', 42);
        vic.vel.y = SPRAWL_HOP; vic.grounded = false;
        vic.m.lastKnockTick = tick;
        this._emit('tumble', 0.32 + this._boost(vic), `${att.name} sends ${vic.name} sprawling`, vic, att);
        this._incident(vic);
      } else {
        this._setMode(vic, 'stumble', 22);
        this._emit('bump', 0.22 + this._boost(vic) * 0.6, `${att.name} barges into ${vic.name}`, vic, att);
      }
    } else if (closing > 5.5 && (this._boost(vic) > 0 || this._boost(att) > 0)) {
      this._emit('bump', 0.15, `${att.name} bumps ${vic.name}`, vic, att);
    }
  }

  _finishes() {
    const fin = this.fin;
    fin.sort((x, y) => (x.t - y.t) || (x.b.id - y.b.id));
    const st = this.state, Q = this.qualifyCount, R = this.round;
    const final = Q === 1;
    for (const { b, t } of fin) {
      if (st.qualifiedCount >= Q) break;
      st.qualifiedCount++;
      const place = st.qualifiedCount;
      b.status = 'qualified';
      b.finishTime = Math.round(t * 1000) / 1000;
      b.finishPlace = place;
      b.m.mode = 'normal';
      b.ai.jumpTick = -1; b.ai.diveTick = -1;
      const slot = R.slot(place - 1, Q);
      b.ai.slotX = slot.x;
      b.ai.slotZ = slot.z;
      const left = Q - place;
      if (final) this._emit('lastSpot', 1, `${b.name} wins Tumbletop!`, b, null, { place, winner: true });
      else if (place === Q) this._emit('lastSpot', 1, `${b.name} takes the last place!`, b, null, { place });
      else if (place === 1) this._emit('qualified', 0.8, `${b.name} is first through. ${left} places left`, b, null, { place, left });
      else this._emit('qualified', left <= 2 ? 0.7 : 0.5, `${b.name} is through. ${left} place${left === 1 ? '' : 's'} left`, b, null, { place, left });

      if (place === Q) {
        // nearest chaser
        let chaser = null, cd = 1e9;
        for (const o of this.bots) {
          if (o.status !== 'racing' || o.m.falling) continue;
          const d = this.course.finish.z - o.pos.z;
          if (d >= 0 && d < cd) { cd = d; chaser = o; }
        }
        if (chaser && cd < 1.8) {
          this._emit('photoFinish', 0.95, final ? `Photo finish! ${b.name} beats ${chaser.name} to the line` : `Photo finish! ${b.name} beats ${chaser.name} to the last place`, b, chaser);
        }
      }
      const N = this.botCount;
      if (!final && b.m.worstPlace >= Math.min(N, Q + 4) && !b.m.comebackDone) {
        b.m.comebackDone = true;
        this._emit('comeback', 0.7, `${b.name} fought back from ${ordinal(b.m.worstPlace)} to go through`, b, null, { from: b.m.worstPlace });
      }
    }
  }

  _rank() {
    const bots = this.bots, order = this.order, C = this.course, st = this.state;
    const cps = C.checkpoints;
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i], m = b.m;
      let key, z;
      if (b.status === 'qualified') { key = 1e6 - b.finishPlace; z = C.finish.z; }
      else if (b.status === 'eliminated') { key = -1e4 - m.elimOrder; z = m.rankZ ?? b.pos.z; }
      else {
        z = (b.status === 'respawning' || m.falling) ? cps[m.cp].z : b.pos.z;
        if (z > C.finish.z) z = C.finish.z;
        key = z;
        m.rankZ = z;
      }
      m.rankKey = key;
      const dist = clamp(z - C.startZ, 0, C.length);
      b.distance = Math.round(dist * 1000) / 1000;
      b.progress = Math.round((dist / C.length) * 100000) / 100000;
    }
    // insertion sort (nearly sorted every tick)
    for (let i = 1; i < order.length; i++) {
      const b = order[i];
      const k = b.m.rankKey;
      let j = i - 1;
      while (j >= 0) {
        const o = order[j];
        const ok = o.m.rankKey;
        if (ok > k || (ok === k && o.id < b.id)) break;
        order[j + 1] = o;
        j--;
      }
      order[j + 1] = b;
    }
    const st2 = st;
    if (st2.order.length !== order.length) st2.order = new Array(order.length);
    for (let i = 0; i < order.length; i++) { order[i].place = i + 1; st2.order[i] = order[i].id; }
    st.leaderId = order[0].id;
    const Q = this.qualifyCount;
    const lo = Math.max(0, Q - 2), hi = Math.min(order.length, Q + 2);
    st.bubble.length = 0;
    for (let i = lo; i < hi; i++) st.bubble.push(order[i].id);

    if (st.phase !== 'race') return;
    const tick = this.tick;
    const rt = (tick - this.raceStartTick) * DT;

    // Who holds the last qualifying place. A change counts once the new holder has kept the place
    // for a third of a second, so two Gumbles running level do not flicker the count.
    const holder = order[Q - 1];
    if (rt > 1.5 && st.qualifiedCount < Q && holder) {
      if (holder.id !== this.cutHolderCand) { this.cutHolderCand = holder.id; this.cutHolderCandTick = tick; }
      else if (holder.id !== this.cutHolder && tick - this.cutHolderCandTick >= 20) {
        if (this.cutHolder >= 0) { st.cutChanges++; this.cutLog.push(tick); }
        this.cutHolder = holder.id;
        st.cutHolderId = holder.id;
      }
    }

    // lead changes (held for half a second)
    const lead = order[0];
    if (rt > 2.5 && lead.status === 'racing') {
      if (lead.id !== this.leadCand) { this.leadCand = lead.id; this.leadCandTick = tick; }
      else if (lead.id !== this.confirmedLeader && tick - this.leadCandTick >= 30) {
        const prev = this.confirmedLeader;
        this.confirmedLeader = lead.id;
        if (prev < 0) this._emit('leadChange', 0.6, `${lead.name} leads the pack`, lead);
        else this._emit('leadChange', 0.75, `${lead.name} takes the lead from ${bots[prev].name}`, lead, bots[prev]);
      }
    }

    for (let i = 0; i < order.length; i++) {
      const b = order[i], m = b.m;
      if (rt > 8 && (b.status === 'racing' || b.status === 'respawning') && b.place > m.worstPlace) m.worstPlace = b.place;
      if (b.status !== 'racing') continue;
      // cut line (held for 0.75 s)
      const inside = b.place <= Q;
      if (inside !== m.cutCand) { m.cutCand = inside; m.cutCandTick = tick; }
      else if (inside !== m.cutState && tick - m.cutCandTick >= 45) {
        m.cutState = inside;
        if (rt > 6 && st.qualifiedCount < Q && tick - this.lastCutEventTick > 90) {
          this.lastCutEventTick = tick;
          if (inside) {
            const out = order[Q] && order[Q] !== b ? order[Q] : null;
            this._emit('overtake', 0.55, out ? `${b.name} moves above the line. ${out.name} drops out` : `${b.name} moves above the line`, b, out, { kind: 'cut' });
          } else {
            this._emit('overtake', 0.45, `${b.name} drops below the line`, b, null, { kind: 'cutDrop' });
          }
        }
      }
      // podium places
      const top = b.place <= 3;
      if (top !== m.topCand) { m.topCand = top; m.topCandTick = tick; }
      else if (top !== m.topState && tick - m.topCandTick >= 40) {
        m.topState = top;
        if (top && Q > 3 && rt > 6 && b.place > 1 && tick - this.lastTopEventTick > 120) {
          this.lastTopEventTick = tick;
          const passed = order[b.place] || null;
          this._emit('overtake', 0.5, passed
            ? `${b.name} climbs to ${ordinal(b.place)}, ahead of ${passed.name}`
            : `${b.name} climbs to ${ordinal(b.place)}`, b, passed, { kind: 'podium' });
        }
      }
      // mid-race comeback
      if (!m.comebackDone && Q >= 8 && m.worstPlace >= Math.min(order.length, Q + 5) && b.place <= Q - 5) {
        m.comebackDone = true;
        this._emit('comeback', 0.65, `${b.name} storms from ${ordinal(m.worstPlace)} up to ${ordinal(b.place)}!`, b, null, { from: m.worstPlace });
      }
    }
  }
}
