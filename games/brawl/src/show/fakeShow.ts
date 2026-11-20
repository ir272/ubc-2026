// A local stand-in for the runner's Show (runner/src/show.ts + hub.ts), for the harness, the
// headless match tool, tests and captures. Runs in node and the browser: no node imports.
//
// It sends the same feed messages the runner does, in the same shapes, each with `t`:
//   snapshot (from snapshot()), match, phase, window_open, window_locked (seed on seeded windows),
//   event ({ type: 'event', t, event: GameEvent }), window_settled, window_void, match_end.
// recentEvents is capped at 500 like the runner, so snapshot() is what a late joiner gets.
// Differences, on purpose: no chain, pools stay 0, payouts are empty, commitment and seed are
// derived with a small non-cryptographic hash (fine for a local stand-in, never for money).

import type { Entrant, GameEvent, Outcome, Show, Win } from '../../../../runner/src/types.ts';

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const MAX_EVENTS = 500;

type WinState = 'open' | 'locked' | 'settled' | 'void';
interface WinRec {
  windowId: string;
  matchId: string;
  market: string;
  question: string;
  outcomes: Outcome[];
  closesAt: number;
  seeded: boolean;
  state: WinState;
  pools: number[];
  total: number;
  simHash?: string;
  seed?: string;
  entropy?: string;
  winnerOutcomeId?: string;
  secret?: string;
  commitment?: string;
  payouts?: { owner: string; amount: number }[];
}

/** 64 hex chars from a small mixing hash (FNV-1a lanes). Not cryptographic. */
export function fakeHash(s: string): string {
  let out = '';
  for (let lane = 0; lane < 8; lane++) {
    let h = (0x811c9dc5 ^ (lane * 0x9e3779b1)) >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d) >>> 0;
    h ^= h >>> 12;
    out += (h >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}

function randomHex(rand: () => number, chars = 64): string {
  let s = '';
  for (let i = 0; i < chars; i++) s += Math.floor(rand() * 16).toString(16);
  return s;
}

export function createFakeShow(o: {
  clock: Clock;
  onFeed: (msg: unknown) => void;
  channel?: string;
  seedRandom?: () => number;
}): Show & {
  snapshot(): unknown;
  destroy(): void;
  /** EXTRA: what the runner does between matches (voids leftovers, phase 'intermission'). */
  intermission(): void;
} {
  const { clock } = o;
  const channel = o.channel ?? 'brawl';
  const rand = o.seedRandom ?? Math.random;
  const ac = new AbortController();
  let phase: 'lobby' | 'live' | 'result' | 'intermission' = 'intermission';
  let match: { matchId: string; title: string; entrants: Entrant[]; meta?: unknown; startedAt: number; result?: unknown } | null = null;
  let windows: WinRec[] = [];
  let recentEvents: GameEvent[] = [];
  let startedAt = 0;
  let announced = false;
  let ended = false;
  let windowCount = 0;
  let marketCount = 0;

  const broadcast = (type: string, body: Record<string, unknown> = {}) => {
    o.onFeed({ type, t: clock.now(), ...body });
  };
  const setPhase = (p: typeof phase) => {
    if (phase === p) return;
    phase = p;
    broadcast('phase', { phase: p });
  };
  const alive = (what: string) => {
    if (ac.signal.aborted) throw ac.signal.reason ?? new Error('aborted');
    if (!announced && what !== 'announce' && what !== 'sleep') throw new Error(`${what}() before announce()`);
  };
  const rec = (win: Win) => {
    const w = windows.find((x) => x.windowId === win.windowId);
    if (!w) throw new Error('unknown window');
    return w;
  };
  const publicWindow = (w: WinRec) => {
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
    if (w.simHash) v.simHash = w.simHash;
    if (w.seed) v.seed = w.seed;
    if (w.entropy) v.entropy = w.entropy;
    if (w.winnerOutcomeId) v.winnerOutcomeId = w.winnerOutcomeId;
    if (w.state === 'settled' && w.secret) v.secret = w.secret;
    if (w.payouts) v.payouts = w.payouts;
    return v;
  };
  const voidRec = (w: WinRec) => {
    if (w.state === 'void') return;
    if (w.state === 'settled') throw new Error('cannot void a settled window');
    w.state = 'void';
    w.payouts = [];
    broadcast('window_void', { windowId: w.windowId, refunds: [] });
  };

  return {
    signal: ac.signal,

    elapsed() {
      return startedAt ? clock.now() - startedAt : 0;
    },

    announce(m) {
      alive('announce');
      if (announced && !ended) throw new Error('announce() may only be called once per match');
      if (!m?.matchId || !Array.isArray(m.entrants)) throw new Error('announce needs matchId and entrants');
      announced = true;
      ended = false;
      startedAt = clock.now();
      match = { matchId: String(m.matchId), title: String(m.title ?? ''), entrants: m.entrants, meta: m.meta, startedAt };
      windows = [];
      recentEvents = [];
      windowCount = 0;
      setPhase('lobby');
      broadcast('match', { matchId: match.matchId, title: match.title, entrants: match.entrants, meta: match.meta, startedAt });
    },

    async openWindow(w) {
      alive('openWindow');
      if (!Array.isArray(w.outcomes) || w.outcomes.length < 2 || w.outcomes.length > 16) throw new Error('a window needs 2..16 outcomes');
      if (new Set(w.outcomes.map((x) => x.id)).size !== w.outcomes.length) throw new Error('outcome ids must be unique');
      if (!(w.durationMs > 0)) throw new Error('durationMs must be > 0');
      if (w.seeded && w.sealed) throw new Error('a window is seeded or sealed, not both');
      const secret = w.seeded || w.sealed ? randomHex(rand) : undefined;
      const simHash = w.simHash ? (/^[0-9a-f]{64}$/i.test(w.simHash) ? w.simHash.toLowerCase() : fakeHash(w.simHash)) : undefined;
      const windowId = `${match!.matchId}:w${++windowCount}`;
      const r: WinRec = {
        windowId,
        matchId: match!.matchId,
        market: `fake-market-${++marketCount}`,
        question: String(w.question),
        outcomes: w.outcomes.map((x) => ({ ...x })),
        closesAt: clock.now() + w.durationMs,
        seeded: !!w.seeded,
        state: 'open',
        pools: new Array(w.outcomes.length).fill(0),
        total: 0,
        simHash,
        secret,
        commitment: secret ? fakeHash('commit:' + secret) : undefined,
      };
      windows.push(r);
      broadcast('window_open', {
        windowId,
        market: r.market,
        question: r.question,
        outcomes: r.outcomes,
        closesAt: r.closesAt,
        seeded: r.seeded,
        simHash: r.simHash,
        commitment: r.commitment,
      });
      const sealed = w.sealed && secret ? fakeHash('arena-sealed' + secret) : undefined;
      return { windowId, market: r.market, outcomes: r.outcomes, seeded: r.seeded, closesAt: r.closesAt, ...(sealed ? { sealed } : {}) };
    },

    async lock(win) {
      alive('lock');
      const w = rec(win);
      if (w.state === 'locked') return w.seed ? { seed: w.seed } : {};
      if (w.state !== 'open') throw new Error(`cannot lock a ${w.state} window`);
      await clock.sleep(Math.max(0, w.closesAt - clock.now() + 25));
      alive('lock');
      w.state = 'locked';
      w.entropy = randomHex(rand);
      if (w.seeded && w.secret) w.seed = fakeHash(w.secret + w.entropy + w.market);
      broadcast('window_locked', { windowId: w.windowId, seed: w.seed, entropy: w.entropy, simHash: w.simHash, pools: w.pools, total: w.total });
      return w.seed ? { seed: w.seed } : {};
    },

    emit(event) {
      alive('emit');
      if (!event || typeof event.type !== 'string') throw new Error('event needs a type');
      const ev: GameEvent = { type: event.type, at: typeof event.at === 'number' ? event.at : clock.now() - startedAt };
      if (event.data !== undefined) ev.data = event.data;
      if (phase === 'lobby') setPhase('live');
      recentEvents.push(ev);
      if (recentEvents.length > MAX_EVENTS) recentEvents.splice(0, recentEvents.length - MAX_EVENTS);
      broadcast('event', { event: ev });
    },

    async settle(win, winnerOutcomeId) {
      alive('settle');
      const w = rec(win);
      if (w.state !== 'locked') throw new Error(`cannot settle a ${w.state} window (lock it first)`);
      if (!w.outcomes.some((x) => x.id === winnerOutcomeId)) throw new Error(`unknown outcome id ${winnerOutcomeId}`);
      w.state = 'settled';
      w.winnerOutcomeId = winnerOutcomeId;
      w.payouts = [];
      broadcast('window_settled', { windowId: w.windowId, winnerOutcomeId, secret: w.secret, payouts: [] });
    },

    async voidWindow(win) {
      alive('voidWindow');
      voidRec(rec(win));
    },

    sleep(ms) {
      if (ac.signal.aborted) return Promise.reject(ac.signal.reason ?? new Error('aborted'));
      return clock.sleep(Math.max(0, ms)).then(() => {
        if (ac.signal.aborted) throw ac.signal.reason ?? new Error('aborted');
      });
    },

    end(result) {
      alive('end');
      if (ended) return;
      ended = true;
      if (match) match.result = result;
      setPhase('result');
      broadcast('match_end', { result });
    },

    intermission() {
      for (const w of windows) if (w.state === 'open' || w.state === 'locked') voidRec(w);
      if (match && !ended) {
        ended = true;
        match.result = { aborted: true };
        broadcast('match_end', { result: { aborted: true } });
      }
      ended = true;
      setPhase('intermission');
    },

    snapshot() {
      return {
        type: 'snapshot',
        t: clock.now(),
        channel,
        title: 'Ringout',
        phase,
        match,
        windows: windows.map(publicWindow),
        recentEvents: recentEvents.slice(),
        serverNow: clock.now(),
        recentChat: [],
        bots: [],
      };
    },

    destroy() {
      if (!ac.signal.aborted) ac.abort(new Error('fake show destroyed'));
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Clocks
// ------------------------------------------------------------------------------------------------

/** Wall-clock time (the harness in normal mode). */
export function realClock(): Clock {
  const now = () => (typeof performance !== 'undefined' ? performance.timeOrigin + performance.now() : Date.now());
  return { now, sleep: (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms))) };
}

export interface VirtualClock extends Clock {
  /** timers waiting */
  pending(): number;
  /** fire timers in order up to time `to` (ms on this clock), letting promises settle between them */
  advanceTo(to: number): Promise<void>;
  /** advanceTo(now() + ms) */
  advance(ms: number): Promise<void>;
  /** keep firing the next timer until done() is true or nothing is waiting. Returns the end time. */
  runUntil(done: () => boolean, o?: { maxMs?: number }): Promise<number>;
}

/** Let every pending promise chain settle (a macrotask turn). */
function settle(): Promise<void> {
  const g = globalThis as { setImmediate?: (f: () => void) => void };
  return new Promise((r) => (g.setImmediate ? g.setImmediate(r) : setTimeout(r, 0)));
}

/**
 * A clock where nothing waits for real: sleep() registers a timer, and advanceTo / runUntil fire
 * them in time order. A whole five-minute show runs in well under a second of real time.
 */
export function virtualClock(start = 0): VirtualClock {
  let t = start;
  let seq = 0;
  const timers: { at: number; seq: number; resolve: () => void }[] = [];
  const next = () => {
    let best = -1;
    for (let i = 0; i < timers.length; i++) {
      const x = timers[i]!;
      if (best < 0 || x.at < timers[best]!.at || (x.at === timers[best]!.at && x.seq < timers[best]!.seq)) best = i;
    }
    return best;
  };
  const fireNext = (limit: number) => {
    const i = next();
    if (i < 0 || timers[i]!.at > limit) return false;
    const x = timers.splice(i, 1)[0]!;
    t = Math.max(t, x.at);
    x.resolve();
    return true;
  };
  return {
    now: () => t,
    sleep: (ms) => new Promise<void>((resolve) => timers.push({ at: t + Math.max(0, ms || 0), seq: seq++, resolve })),
    pending: () => timers.length,
    async advanceTo(to) {
      await settle();
      while (fireNext(to)) await settle();
      t = Math.max(t, to);
      await settle();
    },
    async advance(ms) {
      await this.advanceTo(t + ms);
    },
    async runUntil(done, opt = {}) {
      const maxAt = t + (opt.maxMs ?? 24 * 3600_000);
      await settle();
      while (!done()) {
        if (!fireNext(maxAt)) break;
        await settle();
      }
      return t;
    },
  };
}
