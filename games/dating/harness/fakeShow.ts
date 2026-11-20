// A local fake Show and hub for the harness and the tools. It sends the same message envelopes as
// the runner (runner/src/hub.ts, runner/src/show.ts): snapshot, match, phase, window_open,
// window_locked, event ({ type: 'event', t, event }), window_settled, window_void, match_end.
// Pools stay empty (nobody bets here). Sealed windows get a private value derived exactly like the
// runner's: sha256("arena-sealed" ‖ secret).
//
// Time: a virtual clock. `speed` scales sleeps and window durations (speed 200 plays a six-minute
// episode in two seconds); `elapsed()` and GameEvent.at stay in speed-1 ms. speed Infinity = instant:
// sleeps resolve at once and only advance the virtual clock (text trials).

import { createHash, randomBytes } from 'node:crypto';
import type { ChannelDef, Entrant, GameEvent, Outcome, Phase, Show, Win } from '../../../runner/src/types.ts';

export type FeedMsg = { type: string; t: number; [k: string]: unknown };
/** vt = virtual ms since the hub started (speed-1 time); handy for timeline checks */
export type Listener = (msg: FeedMsg, json: string, vt: number) => void;

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const sha256 = (b: Uint8Array) => new Uint8Array(createHash('sha256').update(b).digest());

class VClock {
  speed: number;
  private vBase = 0;
  private rBase = Date.now();
  private pending = new Set<{ target: number; timer: ReturnType<typeof setTimeout> | null; resolve: () => void }>();
  constructor(speed: number) {
    this.speed = speed > 0 ? speed : 1;
  }
  get instant() {
    return !Number.isFinite(this.speed);
  }
  /** highest virtual time anyone has observed: the clock never goes back past it */
  private last = 0;
  now(): number {
    const v = this.instant ? this.vBase : this.vBase + (Date.now() - this.rBase) * this.speed;
    if (v > this.last) this.last = v;
    return this.last;
  }
  setSpeed(speed: number) {
    if (!(speed > 0) || this.instant) return;
    this.vBase = this.now();
    this.rBase = Date.now();
    this.speed = speed;
    for (const p of this.pending) this.arm(p);
  }
  private arm(p: { target: number; timer: ReturnType<typeof setTimeout> | null; resolve: () => void }) {
    if (p.timer) clearTimeout(p.timer);
    const realMs = Math.max(0, (p.target - this.now()) / this.speed);
    p.timer = setTimeout(() => {
      this.pending.delete(p);
      // Snap to the target: a timer that fires a few real ms late would otherwise add
      // (lateness x speed) of virtual time, which at speed 200 looks like seconds of dead air.
      const v = Math.max(p.target, this.last);
      this.vBase = v;
      this.rBase = Date.now();
      this.last = v;
      p.resolve();
    }, realMs);
  }
  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    ms = Math.max(0, ms || 0);
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('aborted'));
    if (this.instant) {
      this.vBase += ms;
      return new Promise((r) => setImmediate(r));
    }
    return new Promise((resolve, reject) => {
      const p = { target: this.now() + ms, timer: null as ReturnType<typeof setTimeout> | null, resolve };
      const onAbort = () => {
        if (p.timer) clearTimeout(p.timer);
        this.pending.delete(p);
        reject(signal!.reason ?? new Error('aborted'));
      };
      p.resolve = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.add(p);
      this.arm(p);
    });
  }
}

interface WinRec {
  windowId: string;
  matchId: string;
  market: string;
  question: string;
  outcomes: Outcome[];
  closesAt: number;
  vClose: number;
  seeded: boolean;
  state: 'open' | 'locked' | 'settled' | 'void';
  pools: number[];
  total: number;
  entropy?: string;
  winnerOutcomeId?: string;
  secret?: string;
  secretBytes?: Uint8Array;
  commitment?: string;
}

interface MatchRec {
  matchId: string;
  title: string;
  entrants: Entrant[];
  meta?: unknown;
  startedAt: number;
  result?: unknown;
}

export interface FakeHubOpts {
  channel?: string;
  title?: string;
  speed?: number;
  /** secret bytes for the n-th window of the hub (tests, --seed); default crypto random */
  secretFor?: (n: number) => Uint8Array;
  /** keep at most this many events for snapshots (runner: 500) */
  maxEvents?: number;
}

export class FakeHub {
  channel: string;
  title: string;
  phase: Phase = 'intermission';
  match: MatchRec | null = null;
  windows: WinRec[] = [];
  recentEvents: GameEvent[] = [];
  readonly clock: VClock;
  private listeners = new Set<Listener>();
  private secretFor?: (n: number) => Uint8Array;
  private maxEvents: number;
  private windowCount = 0;
  private baseSpeed: number;

  constructor(o: FakeHubOpts = {}) {
    this.channel = o.channel ?? 'dating';
    this.title = o.title ?? 'Compatibility Mode';
    this.clock = new VClock(o.speed ?? 1);
    this.baseSpeed = this.clock.speed;
    this.secretFor = o.secretFor;
    this.maxEvents = o.maxEvents ?? 500;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  broadcast(type: string, body: Record<string, unknown> = {}) {
    if (!this.listeners.size) return;
    const msg: FeedMsg = { type, t: Date.now(), ...body };
    const json = JSON.stringify(msg);
    const vt = this.clock.now();
    for (const l of this.listeners) {
      try {
        l(msg, json, vt);
      } catch (e) {
        console.warn('[fakeShow] listener threw', e);
      }
    }
  }

  setPhase(phase: Phase) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.broadcast('phase', { phase });
  }

  nextSecret(): Uint8Array {
    return this.secretFor ? this.secretFor(++this.windowCount) : new Uint8Array(randomBytes(32));
  }

  publicWindow(w: WinRec) {
    const v: Record<string, unknown> = {
      windowId: w.windowId,
      matchId: w.matchId,
      market: w.market,
      question: w.question,
      outcomes: w.outcomes,
      closesAt: w.closesAt,
      seeded: w.seeded,
      state: w.state,
      pools: w.pools,
      total: w.total,
    };
    if (w.entropy) v.entropy = w.entropy;
    if (w.winnerOutcomeId) v.winnerOutcomeId = w.winnerOutcomeId;
    if (w.state === 'settled' && w.secret) v.secret = w.secret;
    if (w.state === 'settled' || w.state === 'void') v.payouts = [];
    return v;
  }

  /** Same shape the runner sends on connect. */
  snapshot(): FeedMsg {
    return {
      type: 'snapshot',
      t: Date.now(),
      channel: this.channel,
      title: this.title,
      phase: this.phase,
      match: this.match,
      windows: this.windows.map((w) => this.publicWindow(w)),
      recentEvents: this.recentEvents,
      serverNow: Date.now(),
      recentChat: [],
      bots: [],
    };
  }

  /** Testing: finish the current episode fast. */
  skip(factor = 400) {
    this.clock.setSpeed(Math.max(this.clock.speed, factor));
  }
  resetSpeed() {
    this.clock.setSpeed(this.baseSpeed);
  }

  pushEvent(ev: GameEvent) {
    this.recentEvents.push(ev);
    if (this.recentEvents.length > this.maxEvents) this.recentEvents.splice(0, this.recentEvents.length - this.maxEvents);
    this.broadcast('event', { event: ev });
  }

  newShow(signal?: AbortSignal): FakeShow {
    return new FakeShow(this, signal ?? new AbortController().signal);
  }
}

export class FakeShow implements Show {
  readonly signal: AbortSignal;
  private hub: FakeHub;
  private vStart = 0;
  private announced = false;
  ended = false;
  private n = 0;

  constructor(hub: FakeHub, signal: AbortSignal) {
    this.hub = hub;
    this.signal = signal;
  }

  elapsed(): number {
    return this.announced ? Math.round(this.hub.clock.now() - this.vStart) : 0;
  }

  announce(match: { matchId: string; title: string; entrants: Entrant[]; meta?: unknown }): void {
    if (this.announced) throw new Error('announce() may only be called once per match');
    this.announced = true;
    this.vStart = this.hub.clock.now();
    const startedAt = Date.now();
    this.hub.match = { matchId: String(match.matchId), title: String(match.title ?? ''), entrants: match.entrants, meta: match.meta, startedAt };
    this.hub.windows = [];
    this.hub.recentEvents = [];
    this.hub.setPhase('lobby');
    this.hub.broadcast('match', { ...this.hub.match });
  }

  async openWindow(w: { question: string; outcomes: Outcome[]; durationMs: number; seeded: boolean; simHash?: string; sealed?: boolean }): Promise<Win> {
    if (!this.announced) throw new Error('announce() before openWindow()');
    if (!Array.isArray(w.outcomes) || w.outcomes.length < 2 || w.outcomes.length > 16) throw new Error('a window needs 2..16 outcomes');
    if (new Set(w.outcomes.map((o) => o.id)).size !== w.outcomes.length) throw new Error('outcome ids must be unique');
    if (!(w.durationMs > 0)) throw new Error('durationMs must be > 0');
    if (w.seeded && w.sealed) throw new Error('a window is seeded or sealed, not both');
    const secret = w.seeded || w.sealed ? this.hub.nextSecret() : undefined;
    const sealed = w.sealed && secret ? hex(sha256(new Uint8Array([...new TextEncoder().encode('arena-sealed'), ...secret]))) : undefined;
    const clock = this.hub.clock;
    const matchId = this.hub.match!.matchId;
    const rec: WinRec = {
      windowId: `${matchId}:w${++this.n}`,
      matchId,
      market: `fake-${randomBytes(6).toString('hex')}`,
      question: String(w.question),
      outcomes: w.outcomes.map((o) => ({ ...o })),
      closesAt: Date.now() + (clock.instant ? 0 : Math.round(w.durationMs / clock.speed)),
      vClose: clock.now() + w.durationMs,
      seeded: !!w.seeded,
      state: 'open',
      pools: new Array(w.outcomes.length).fill(0),
      total: 0,
      secretBytes: secret,
      commitment: secret ? hex(sha256(secret)) : undefined,
    };
    this.hub.windows.push(rec);
    this.hub.broadcast('window_open', {
      windowId: rec.windowId,
      market: rec.market,
      question: rec.question,
      outcomes: rec.outcomes,
      closesAt: rec.closesAt,
      seeded: rec.seeded,
      simHash: undefined,
      commitment: rec.commitment,
    });
    return { windowId: rec.windowId, market: rec.market, outcomes: rec.outcomes, seeded: rec.seeded, closesAt: rec.closesAt, ...(sealed ? { sealed } : {}) };
  }

  private rec(win: Win): WinRec {
    const w = this.hub.windows.find((x) => x.windowId === win.windowId);
    if (!w) throw new Error('unknown window');
    return w;
  }

  async lock(win: Win): Promise<{ seed?: string }> {
    const w = this.rec(win);
    if (w.state === 'locked') return {};
    if (w.state !== 'open') throw new Error(`cannot lock a ${w.state} window`);
    await this.hub.clock.sleep(w.vClose - this.hub.clock.now(), this.signal);
    w.state = 'locked';
    w.entropy = randomBytes(32).toString('hex');
    this.hub.broadcast('window_locked', { windowId: w.windowId, seed: undefined, entropy: w.entropy, simHash: undefined, pools: w.pools, total: w.total });
    return {};
  }

  emit(event: GameEvent): void {
    if (!this.announced) throw new Error('announce() before emit()');
    const ev: GameEvent = { type: event.type, at: typeof event.at === 'number' ? event.at : this.elapsed() };
    if (event.data !== undefined) ev.data = event.data;
    if (this.hub.phase === 'lobby') this.hub.setPhase('live');
    this.hub.pushEvent(ev);
  }

  async settle(win: Win, winnerOutcomeId: string): Promise<void> {
    const w = this.rec(win);
    if (w.state !== 'locked') throw new Error(`cannot settle a ${w.state} window (lock it first)`);
    if (!w.outcomes.some((o) => o.id === winnerOutcomeId)) throw new Error(`unknown outcome id ${winnerOutcomeId}`);
    w.state = 'settled';
    w.winnerOutcomeId = winnerOutcomeId;
    if (w.secretBytes) w.secret = hex(w.secretBytes);
    this.hub.broadcast('window_settled', { windowId: w.windowId, winnerOutcomeId, secret: w.secret, payouts: [] });
  }

  async voidWindow(win: Win): Promise<void> {
    const w = this.rec(win);
    if (w.state === 'void') return;
    if (w.state === 'settled') throw new Error('cannot void a settled window');
    w.state = 'void';
    this.hub.broadcast('window_void', { windowId: w.windowId, refunds: [] });
  }

  sleep(ms: number): Promise<void> {
    return this.hub.clock.sleep(ms, this.signal);
  }

  end(result: unknown): void {
    if (this.ended) return;
    this.ended = true;
    if (this.hub.match) this.hub.match.result = result;
    this.hub.setPhase('result');
    this.hub.broadcast('match_end', { result });
  }
}

/** Runs a channel forever on a hub, like the runner's runChannelLoop. */
export async function runLoop(
  def: ChannelDef,
  hub: FakeHub,
  o: { signal?: AbortSignal; onDone?: (ok: boolean, err?: unknown) => void } = {},
) {
  const signal = o.signal ?? new AbortController().signal;
  while (!signal.aborted) {
    const show = hub.newShow(signal);
    let ok = true;
    let err: unknown;
    try {
      await def.run(show);
    } catch (e) {
      ok = false;
      err = e;
      if (!signal.aborted) console.error(`[fakeShow] ${def.id} run failed:`, (e as Error)?.stack ?? e);
    }
    for (const w of hub.windows) {
      if (w.state === 'open' || w.state === 'locked') {
        w.state = 'void';
        hub.broadcast('window_void', { windowId: w.windowId, refunds: [] });
      }
    }
    if (!ok && hub.match && !show.ended) {
      hub.match.result = { aborted: true };
      hub.broadcast('match_end', { result: { aborted: true } });
    }
    hub.resetSpeed();
    o.onDone?.(ok, err);
    if (signal.aborted) break;
    hub.setPhase('intermission');
    try {
      await hub.clock.sleep(ok ? (def.intermissionMs ?? 5000) : 3000, signal);
    } catch {
      break;
    }
  }
}
