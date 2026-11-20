// Feed -> FightView. Pure: no DOM, no clock of its own (the stage passes the show clock in).
//
// Playback owns a local copy of the fight and re-runs the same deterministic sim the channel runs:
//  - live: steps `stepFight` to stay DELAY_TICKS (0.4 s) behind the channel's tick, so plans always
//    arrive before their tick. Channel tick = seg.tick + (now - seg.startAt) / 16.667 within the
//    current run segment (fight_start or fight_resume), capped at the next `life_lost` tick.
//  - plans are applied at their ticks with schedulePlan; `state` checkpoints are compared with
//    hashFight and the local copy snaps to the checkpoint on a mismatch (logged).
//  - a joiner (or a playback that fell far behind) starts from the best checkpoint it has.
//  - `replay` ranges re-run from the state they carry, at their speed.
//  - a lethal hit holds the local playback about 0.5 s, then it catches up (the channel pauses
//    after a knockout anyway).
//  - a knockout always plays live first: after `life_lost` the live copy keeps running up to the
//    knockout tick (its `ko` sim event goes out in mode 'live'), then holds there ('frozen') until
//    the `replay` event's own start (the channel waits TIMING.koHold). A `replay` or `match_end`
//    that arrives before the live copy has drawn the knockout waits; it never cuts in early. A
//    joiner who arrives during the hold lands on the knockout state, one who arrives during the
//    replay lands in the replay.
//  - outside the fight (predictions, the break after the replay, the verdict) it returns a frozen
//    view so the fighters can stand on the deck.

import { ARENA, createFight, stepFight, schedulePlan, hashFight } from '../sim/index.ts';
import type { FightHeader, FightState, FighterState, PlanAt, SimEvent, Side } from '../sim/types.ts';
import type { Ctx } from './events.ts';
import type { FightView, ShowState } from '../stage/api.ts';

export const TICK_MS = 1000 / 60;
/** how far the local playback runs behind the channel */
export const DELAY_TICKS = 24;
export const DELAY_MS = DELAY_TICKS * TICK_MS;
/** hold on a lethal hit */
export const LETHAL_HOLD_MS = 500;
/** behind by more than this many ticks: rebuild from a checkpoint instead of stepping through */
const REBUILD_TICKS = 150;
/** in one frame, if more than this many ticks were stepped, keep only the last few ticks' events */
const BURST_TICKS = 20;
const BURST_KEEP = 4;
/** verdict: when the best knockout plays again, and how fast */
export const VERDICT_REPLAY_AT = 3000;
export const VERDICT_REPLAY_SPEED = 0.5;

interface Segment {
  tick: number;
  startAt: number;
}
interface Checkpoint {
  tick: number;
  at: number | null;
  s: FightState;
  hash: string | null;
  /** feed order of the event that carried it */
  seq: number;
}
interface ReplayRec {
  at: number;
  fromTick: number;
  s: FightState;
  plans: PlanAt[];
  toTick: number;
  speed: number;
  durationMs: number;
  /** the life_lost tick this replay belongs to (the stop just before it) */
  stop: number | null;
}
interface VerdictRec {
  at: number;
  tick: number;
  durationMs: number;
  winner: Side;
  lives: [number, number];
  damage: [number, number];
  bestKo: { fromTick: number; s: FightState; plans: PlanAt[]; toTick: number } | null;
}

type GameEv = { type: string; at: number; data?: any };

/**
 * The verdict: both robots stand on the deck at their spawns, the winner in 'win', the loser in
 * 'lose' (`actionFrame` counts up from the verdict). Lives, damage and stats stay as they ended.
 */
export function standOnDeck(v: FightView, winner: Side, frame: number): FightView {
  const stand = (f: FighterState, side: Side): FighterState => ({
    ...f,
    x: ARENA.spawns[side],
    y: ARENA.main.y,
    vx: 0,
    vy: 0,
    facing: side === 0 ? 1 : -1,
    action: side === winner ? 'win' : 'lose',
    actionFrame: frame,
    move: null,
    charge: 0,
    grounded: true,
    platform: -1,
    ledge: -1,
    hitlag: 0,
    hitstun: 0,
    tumble: false,
    kbx: 0,
    kby: 0,
    invuln: 0,
    armor: false,
  });
  const s: FightState = { ...v.state, fighters: [stand(v.state.fighters[0], 0), stand(v.state.fighters[1], 1)], projectiles: [] };
  return { ...v, state: s, prev: s, alpha: 1, events: [] };
}

export function cloneState(s: FightState): FightState {
  return JSON.parse(JSON.stringify(s));
}

/** a cheap copy for `prev`: only what a renderer interpolates */
function shallowState(s: FightState): FightState {
  return {
    ...s,
    fighters: [{ ...s.fighters[0] }, { ...s.fighters[1] }] as [FighterState, FighterState],
    projectiles: s.projectiles.map((p) => ({ ...p })),
  };
}

function samePlan(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** a plan as the feed announced it, with its place in the feed */
interface PlanRec extends PlanAt {
  seq: number;
}

/** the tick schedulePlan files a plan under (never earlier than the next tick) */
function pendingTick(s: FightState, tick: number): number {
  return Math.max(s.tick + 1, Math.floor(tick));
}

/**
 * Schedule every known plan the state still needs, without doubling what it already holds.
 * `seqOf` remembers, per pending entry, which feed event put it there (see Playback.verify).
 */
function schedulePlans(s: FightState, plans: PlanRec[], seqOf: Map<string, number>): void {
  for (const p of plans) {
    if (p.tick < s.tick) continue;
    if (p.tick === s.tick && samePlan(s.plans[p.side], p.plan)) continue;
    const pt = pendingTick(s, p.tick);
    if (s.pending.some((q) => q.side === p.side && q.tick === pt && samePlan(q.plan, p.plan))) continue;
    schedulePlan(s, { side: p.side, tick: p.tick, plan: p.plan });
    seqOf.set(`${p.side}:${pt}`, p.seq);
  }
}

interface Runner {
  s: FightState;
  prev: FightState;
  /** float tick being drawn */
  play: number;
}

export class Playback {
  header: FightHeader | null = null;
  ctx: Ctx | null = null;
  segments: Segment[] = [];
  stops: number[] = [];
  endTick: number | null = null;
  plans: PlanRec[] = [];
  /** feed order of events seen */
  private seq = 0;
  /** which plan event put each pending entry of the live copy there ("side:tick" -> seq) */
  private pendSeq = new Map<string, number>();
  checkpoints = new Map<number, Checkpoint>();
  replays: ReplayRec[] = [];
  verdict: VerdictRec | null = null;

  private live: Runner | null = null;
  private replay: { rec: ReplayRec; run: Runner } | null = null;
  private holdUntil = -Infinity;
  private heldTicks = new Set<number>();
  /** show time at which the live copy first stood on each knockout tick */
  private reachedAt = new Map<number, number>();
  private lastNow = 0;
  private standing: { key: string; s: FightState } | null = null;
  private lastMode: FightView['mode'] | null = null;

  /** hash mismatches found (and fixed by snapping) */
  mismatches = 0;
  /** checkpoints compared and found equal */
  matches = 0;
  log: string[] = [];
  /** set to a function to see mismatch logs (the stage sets console.warn) */
  onLog: ((line: string) => void) | null = null;

  reset(): void {
    this.header = null;
    this.segments = [];
    this.stops = [];
    this.endTick = null;
    this.plans = [];
    this.pendSeq.clear();
    this.checkpoints.clear();
    this.replays = [];
    this.verdict = null;
    this.live = null;
    this.replay = null;
    this.holdUntil = -Infinity;
    this.heldTicks.clear();
    this.reachedAt.clear();
  }

  private note(line: string): void {
    this.log.push(line);
    if (this.log.length > 50) this.log.shift();
    this.onLog?.(line);
  }

  private takeCtx(ctx: Ctx | undefined): void {
    if (!ctx || typeof ctx !== 'object') return;
    this.ctx = ctx;
    const h = ctx.header;
    if (!h) return;
    if (!this.header) this.header = h;
    else if (h.seed !== this.header.seed || h.fighters.join() !== this.header.fighters.join()) {
      // a different fight: forget the old one
      this.reset();
      this.header = h;
    }
  }

  /** Feed one platform message (snapshot / match / event ...). */
  onFeed(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as { type?: string; event?: GameEv; recentEvents?: GameEv[]; matchId?: string };
    if (msg.type === 'snapshot') {
      this.reset();
      this.ctx = null;
      this.standing = null;
      for (const e of msg.recentEvents ?? []) this.onEvent(e);
    } else if (msg.type === 'match') {
      this.reset();
      this.ctx = null;
      this.standing = null;
    } else if (msg.type === 'event' && msg.event) {
      this.onEvent(msg.event);
    }
  }

  /** Feed one game event. */
  onEvent(e: GameEv): void {
    if (!e || typeof e.type !== 'string') return;
    const d = (e.data ?? {}) as any;
    const seq = ++this.seq;
    this.takeCtx(d.ctx);
    switch (e.type) {
      case 'fight_start': {
        if (!this.header) return;
        this.addSegment(0, d.startAt);
        if (!this.checkpoints.has(0)) {
          this.checkpoints.set(0, { tick: 0, at: d.startAt, s: createFight(this.header), hash: null, seq });
        }
        break;
      }
      case 'fight_resume':
        this.addSegment(d.tick, d.startAt);
        break;
      case 'plan': {
        const p: PlanRec = { side: d.side, tick: d.tick, plan: d.plan, seq };
        if (this.plans.some((q) => q.side === p.side && q.tick === p.tick)) {
          this.plans = this.plans.filter((q) => !(q.side === p.side && q.tick === p.tick));
        }
        this.plans.push(p);
        const L = this.live;
        if (L) {
          if (L.s.tick < p.tick || (L.s.tick === p.tick && !samePlan(L.s.plans[p.side], p.plan))) {
            schedulePlans(L.s, [p], this.pendSeq);
          } else if (L.s.tick > p.tick) {
            this.note(`plan for side ${p.side} at tick ${p.tick} arrived late (local tick ${L.s.tick})`);
          }
        }
        break;
      }
      case 'state': {
        if (!this.header) return;
        const cp: Checkpoint = { tick: d.tick, at: typeof d.at === 'number' ? d.at : e.at, s: cloneState(d.s), hash: d.hash ?? null, seq };
        this.checkpoints.set(cp.tick, cp);
        if (this.live && this.live.s.tick === cp.tick) this.verify(this.live);
        break;
      }
      case 'life_lost':
        if (typeof d.tick === 'number' && !this.stops.includes(d.tick)) {
          this.stops.push(d.tick);
          this.stops.sort((a, b) => a - b);
        }
        break;
      case 'replay': {
        if (!d.from || !d.from.s) return;
        const rec: ReplayRec = {
          at: e.at,
          fromTick: d.from.tick,
          s: cloneState(d.from.s),
          plans: (d.plans ?? []) as PlanAt[],
          toTick: d.toTick,
          speed: d.speed > 0 ? d.speed : 0.5,
          durationMs: d.durationMs ?? 0,
          stop: this.stops.length ? this.stops[this.stops.length - 1] : null,
        };
        this.replays.push(rec);
        for (const p of rec.plans) if (!this.plans.some((q) => q.side === p.side && q.tick === p.tick)) this.plans.push({ ...p, seq: 0 });
        if (!this.checkpoints.has(rec.fromTick)) {
          this.checkpoints.set(rec.fromTick, { tick: rec.fromTick, at: null, s: cloneState(rec.s), hash: null, seq });
        }
        break;
      }
      case 'match_end': {
        this.endTick = typeof d.tick === 'number' ? d.tick : this.endTick;
        const b = d.bestKo;
        this.verdict = {
          at: e.at,
          tick: d.tick,
          durationMs: d.durationMs ?? 0,
          winner: d.winner,
          lives: d.lives,
          damage: d.damage,
          bestKo: b && b.from && b.from.s ? { fromTick: b.from.tick, s: cloneState(b.from.s), plans: b.plans ?? [], toTick: b.toTick } : null,
        };
        break;
      }
      default:
        break;
    }
  }

  private addSegment(tick: number, startAt: number): void {
    if (typeof tick !== 'number' || typeof startAt !== 'number') return;
    if (this.segments.some((s) => s.tick === tick)) return;
    this.segments.push({ tick, startAt });
    this.segments.sort((a, b) => a.tick - b.tick);
  }

  /** the run segment in force, or one inferred from the latest checkpoint (a joiner who lost the start) */
  private segment(): Segment | null {
    const seg = this.segments.length ? this.segments[this.segments.length - 1] : null;
    let best: Checkpoint | null = null;
    for (const cp of this.checkpoints.values()) if (cp.at != null && cp.hash != null && (!best || cp.tick > best.tick)) best = cp;
    if (best && (!seg || best.tick > seg.tick)) {
      // a checkpoint after the last known segment start: is it in the same run? (no stop between)
      const stopBetween = seg ? this.stops.some((t) => t > seg.tick && t <= best!.tick) : true;
      if (!seg || stopBetween) return { tick: best.tick, startAt: best.at! };
    }
    return seg;
  }

  /** the tick the current run segment stops at (a lost life, or the end) */
  private capFor(seg: Segment): number {
    let cap = Infinity;
    for (const t of this.stops) if (t > seg.tick) { cap = t; break; }
    if (this.endTick != null) {
      // the match is over: the last run goes on to the end tick (win and lose poses may follow the last KO)
      const last = this.stops.length ? this.stops[this.stops.length - 1] : -1;
      if (cap === Infinity || (cap === last && this.endTick >= cap)) cap = this.endTick;
    }
    return cap;
  }

  /** the channel's tick at show time t (float), within the current segment, capped */
  channelTick(t: number): number {
    const seg = this.segment();
    if (!seg) return 0;
    const raw = seg.tick + Math.max(0, (t - seg.startAt) / TICK_MS);
    return Math.min(raw, this.capFor(seg));
  }

  /** the latest checkpoint at or before `tick` (or the earliest one) */
  private checkpointFor(tick: number): Checkpoint | null {
    let best: Checkpoint | null = null;
    let first: Checkpoint | null = null;
    for (const cp of this.checkpoints.values()) {
      if (!first || cp.tick < first.tick) first = cp;
      if (cp.tick <= tick && (!best || cp.tick > best.tick)) best = cp;
    }
    return best ?? first;
  }

  private startRunner(s: FightState): Runner {
    const st = cloneState(s);
    this.pendSeq.clear();
    schedulePlans(st, this.plans, this.pendSeq);
    return { s: st, prev: shallowState(st), play: st.tick };
  }

  /**
   * Compare the live copy with the channel's checkpoint at this tick. The hash covers the whole
   * state, `pending` included, and the local copy (running behind) already holds plans the channel
   * scheduled after this checkpoint. So the hash is taken with `pending` cut back to the entries
   * whose plan events came before the checkpoint in the feed, as the channel had them.
   */
  private verify(r: Runner): void {
    const cp = this.checkpoints.get(r.s.tick);
    if (!cp || !cp.hash) return;
    const all = r.s.pending;
    r.s.pending = all.filter((q) => (this.pendSeq.get(`${q.side}:${q.tick}`) ?? -1) < cp.seq);
    const h = hashFight(r.s);
    r.s.pending = all;
    if (h === cp.hash) {
      this.matches++;
      return;
    }
    this.mismatches++;
    this.note(`hash mismatch at tick ${cp.tick}: local ${h}, channel ${cp.hash}; snapping to the checkpoint`);
    const fixed = cloneState(cp.s);
    this.pendSeq.clear();
    schedulePlans(fixed, this.plans, this.pendSeq);
    r.s = fixed;
  }

  /**
   * Step a runner toward float tick `target`, not past `cap`. Returns the sim events.
   * `lethalHold`: stop on a lethal hit (live mode) so the hold can start on that tick.
   */
  private advance(r: Runner, target: number, cap: number, speed: number, dt: number, catchUp: boolean, check: boolean, lethalHold: boolean, now: number): { events: SimEvent[]; stepped: number } {
    const header = this.header!;
    const events: SimEvent[] = [];
    let stepped = 0;
    const maxPlay = Math.min(target, cap);
    // move the float play head
    if (now < this.holdUntil && lethalHold) {
      // held
    } else {
      const err = maxPlay - r.play;
      let k = speed;
      if (catchUp && err > 2) k = speed * (1 + Math.min(1, (err - 2) / 30));
      r.play = Math.min(maxPlay, r.play + dt * 60 * k);
      if (r.play < r.s.tick - 1) r.play = r.s.tick - 1;
    }
    const want = Math.min(Math.ceil(r.play - 1e-9), cap);
    while (r.s.tick < want && r.s.phase !== 'over') {
      r.prev = shallowState(r.s);
      const evs = stepFight(r.s, header);
      stepped++;
      for (const ev of evs) events.push(ev);
      if (check) this.verify(r);
      if (lethalHold && !this.heldTicks.has(r.s.tick) && evs.some((ev) => ev.t === 'hit' && ev.strength === 'lethal')) {
        this.heldTicks.add(r.s.tick);
        this.holdUntil = now + LETHAL_HOLD_MS;
        r.play = r.s.tick;
        break;
      }
    }
    if (stepped > BURST_TICKS) {
      const keepFrom = r.s.tick - BURST_KEEP;
      return { events: events.filter((ev) => ev.tick > keepFrom), stepped };
    }
    return { events, stepped };
  }

  private view(r: Runner, events: SimEvent[], mode: FightView['mode'], speed: number, countdownMs: number): FightView {
    const s = r.s;
    const alpha = mode === 'frozen' ? 1 : Math.max(0, Math.min(1, r.play - (s.tick - 1)));
    const lim = this.header ? this.header.timeLimitTicks : 0;
    return {
      state: s,
      prev: r.prev,
      alpha,
      events,
      mode,
      speed,
      ticksLeft: s.phase === 'fight' ? Math.max(0, lim - s.tick) : 0,
      countdownMs,
    };
  }

  /** the fighters standing on the deck before the fight (no seed yet), or a fallback for a joiner */
  private standingView(ctx: Ctx | null): FightView | null {
    const picks = ctx?.picks ?? this.header?.fighters;
    if (!picks) return null;
    const key = picks.join() + ':' + (ctx?.lives?.join() ?? '');
    if (!this.standing || this.standing.key !== key) {
      const header: FightHeader = this.header ?? {
        seed: '0'.repeat(32),
        fighters: picks,
        handicap: [0, 0],
        lives: ctx?.lives?.[0] ?? 2,
        timeLimitTicks: 10800,
      };
      const s = createFight(header);
      if (ctx?.lives) {
        s.fighters[0].lives = ctx.lives[0];
        s.fighters[1].lives = ctx.lives[1];
      }
      this.standing = { key, s };
    }
    const s = this.standing.s;
    const v = this.header;
    return {
      state: s,
      prev: s,
      alpha: 1,
      events: [],
      mode: 'frozen',
      speed: 0,
      ticksLeft: v ? v.timeLimitTicks : 10800,
      countdownMs: 0,
    };
  }

  /** run (or keep running) the live copy toward the channel; returns its view */
  private liveView(now: number, dt: number, opts: { silent?: boolean; toCap?: boolean } = {}): FightView | null {
    if (!this.header) return null;
    const seg = this.segment();
    const drawT = now - DELAY_MS;
    let target: number;
    let cap: number;
    if (seg) {
      cap = this.capFor(seg);
      target = opts.toCap && cap !== Infinity ? cap : Math.min(seg.tick + Math.max(0, (drawT - seg.startAt) / TICK_MS), cap);
    } else {
      // no timing at all (only a replay or a match_end known): stand at the best state we have
      const cp = this.checkpointFor(this.endTick ?? Infinity);
      if (!cp) return null;
      cap = this.endTick ?? cp.tick;
      target = opts.toCap ? cap : cp.tick;
    }
    let r = this.live;
    let jump = !!(opts.toCap || opts.silent);
    const ahead = r ? r.s.tick > Math.ceil(target) + 1 : false;
    const behind = r ? target - r.s.tick > REBUILD_TICKS : false;
    if (!r || ahead || behind) {
      const cp = this.checkpointFor(Math.floor(target));
      if (!cp) return null;
      if (!r || (ahead && cp.tick < r.s.tick) || (behind && cp.tick > r.s.tick)) {
        r = this.startRunner(cp.s);
        this.live = r;
      }
      // a rebuild or a far catch-up jumps straight to the target, without catch-up animation
      if (!ahead) jump = true;
    }
    if (jump) r.play = Math.max(r.play, Math.min(target, cap));
    const { events } = this.advance(r, target, cap, 1, dt, true, true, !jump, now);
    const held = now < this.holdUntil && !jump;
    const countdownMs = seg ? Math.max(0, seg.startAt - drawT) : 0;
    const atCap = cap !== Infinity && r.s.tick >= cap;
    const still = !!(opts.toCap || opts.silent);
    const mode: FightView['mode'] = still || (atCap && events.length === 0) || countdownMs > 0 ? 'frozen' : 'live';
    return this.view(r, opts.silent ? [] : events, mode, held ? 0 : mode === 'live' ? 1 : 0, countdownMs);
  }

  private replayView(rec: { at: number; fromTick: number; s: FightState; plans: PlanAt[]; toTick: number; speed: number }, now: number, dt: number): FightView | null {
    if (!this.header) return null;
    let rp = this.replay;
    if (!rp || rp.rec.at !== rec.at || rp.rec.fromTick !== rec.fromTick) {
      const st = cloneState(rec.s);
      schedulePlans(st, rec.plans.map((p) => ({ ...p, seq: 0 })), new Map());
      rp = { rec: rec as ReplayRec, run: { s: st, prev: shallowState(st), play: st.tick } };
      this.replay = rp;
    }
    const target = rec.fromTick + Math.max(0, (now - rec.at) * rec.speed) / TICK_MS;
    // a joiner (or a replay picked up late) starts where the replay is now, not at its first tick
    if (target - rp.run.play > 3) rp.run.play = Math.min(target, rec.toTick) - dt * 60 * rec.speed;
    const { events } = this.advance(rp.run, target, rec.toTick, rec.speed, dt, false, false, false, now);
    return this.view(rp.run, events, 'replay', rec.speed, 0);
  }

  /**
   * The fight view at show time `now` (ms since announce). `dt` = seconds since the last frame.
   * Returns null outside predictions / fight / break / verdict.
   */
  frame(now: number, dt: number, show: Pick<ShowState, 'phase' | 'ctx' | 'phaseMs'>): FightView | null {
    if (show.ctx) this.takeCtx(show.ctx);
    const phase = show.phase;
    let v: FightView | null = null;
    if (phase === 'predictions') {
      v = this.standingView(show.ctx);
    } else if (phase === 'fight') {
      this.replay = null;
      v = this.liveView(now, dt) ?? this.standingView(show.ctx);
    } else if (phase === 'break') {
      v = this.breakView(now, dt) ?? this.standingView(show.ctx);
    } else if (phase === 'verdict' && this.breakPending(now)) {
      // match_end came before the last knockout was drawn live and replayed: finish those first
      v = this.breakView(now, dt) ?? this.standingView(show.ctx);
    } else if (phase === 'verdict') {
      const vd = this.verdict;
      const b = vd?.bestKo;
      const rAt = vd ? vd.at + VERDICT_REPLAY_AT : 0;
      const rDur = b ? ((b.toTick - b.fromTick) * TICK_MS) / VERDICT_REPLAY_SPEED + 600 : 0;
      if (vd && b && now >= rAt && now < rAt + rDur) {
        v = this.replayView({ at: rAt, fromTick: b.fromTick, s: b.s, plans: b.plans, toTick: b.toTick, speed: VERDICT_REPLAY_SPEED }, now, dt);
      } else {
        this.replay = null;
        const finished = this.live && this.endTick != null && this.live.s.tick >= this.endTick;
        v = this.liveView(now, dt, { silent: !!finished || now >= rAt, toCap: true });
        if (!v && vd) v = this.verdictFallback(show.ctx, vd);
        if (v && vd && v.mode === 'frozen') v = standOnDeck(v, vd.winner, Math.floor(Math.max(0, now - vd.at) / TICK_MS) + 1);
      }
      v = v ?? this.standingView(show.ctx);
    } else {
      return null;
    }
    this.lastMode = v ? v.mode : null;
    this.lastNow = now;
    return v;
  }

  /** the knockout the show is on (the last life_lost tick), its replay and when that replay starts */
  private koState(now: number): { stop: number; rec: ReplayRec | null; mustLive: boolean; start: number } | null {
    const stop = this.stops.length ? this.stops[this.stops.length - 1]! : null;
    if (stop == null) return null;
    const L = this.live;
    if (L && L.s.tick >= stop && !this.reachedAt.has(stop)) this.reachedAt.set(stop, now);
    // a playback that has been drawing this run live finishes it before anything else is shown;
    // one that never drew it (a joiner) goes straight to whatever the show is on
    const seg = this.segment();
    const mustLive = !!L && L.s.tick < stop && (!seg || seg.tick <= L.s.tick);
    const rec = [...this.replays].reverse().find((x) => x.stop === stop) ?? null;
    const start = rec ? Math.max(rec.at, this.reachedAt.get(stop) ?? -Infinity) : Infinity;
    return { stop, rec, mustLive, start };
  }

  /** true while the last knockout still has to be drawn live or replayed */
  private breakPending(now: number): boolean {
    const k = this.koState(now);
    if (!k) return false;
    if (k.mustLive) return true;
    return !!k.rec && now < k.start + k.rec.durationMs;
  }

  /** the break: live up to the knockout, hold on it, the replay at its own start, then hold again */
  private breakView(now: number, dt: number): FightView | null {
    const k = this.koState(now);
    if (!k || k.mustLive || !k.rec || now < k.start) {
      this.replay = null;
      const v = this.liveView(now, dt);
      if (k && this.live && this.live.s.tick >= k.stop && !this.reachedAt.has(k.stop)) this.reachedAt.set(k.stop, now);
      return v;
    }
    if (now < k.start + k.rec.durationMs) {
      return this.replayView(k.start === k.rec.at ? k.rec : { ...k.rec, at: k.start }, now, dt);
    }
    this.replay = null;
    return this.liveView(now, dt, { silent: true, toCap: true });
  }

  /** a joiner with no fight state at all: stand both fighters on the deck with the result numbers */
  private verdictFallback(ctx: Ctx | null, vd: VerdictRec): FightView | null {
    const sv = this.standingView(ctx);
    if (!sv) return null;
    const s = cloneState(sv.state);
    for (const side of [0, 1] as const) {
      s.fighters[side].damage = vd.damage?.[side] ?? 0;
      s.fighters[side].lives = vd.lives?.[side] ?? 0;
      s.fighters[side].action = side === vd.winner ? 'win' : 'lose';
    }
    s.winner = vd.winner;
    s.phase = 'over';
    return { ...sv, state: s, prev: s };
  }

  /** debug info */
  info(): { liveTick: number | null; replayTick: number | null; mismatches: number; matches: number; mode: string | null; holding: boolean; koTick: number | null } {
    return {
      liveTick: this.live ? this.live.s.tick : null,
      replayTick: this.replay ? this.replay.run.s.tick : null,
      mismatches: this.mismatches,
      matches: this.matches,
      mode: this.lastMode,
      holding: this.lastNow < this.holdUntil,
      koTick: this.stops.length ? this.stops[this.stops.length - 1]! : null,
    };
  }
}
