// Feed client for one channel: WebSocket /ws?channel=<id>. Applies `snapshot`, then incremental
// messages; reconnects with backoff (each reconnect gets a fresh snapshot, so joining mid-match and
// recovering from a drop are the same path). Raw messages are also handed, in order, to the game.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ChatMsg, GameEvent, MatchView, Phase, Snapshot, WindowView } from './api';
import { WS_URL } from './env';
import { FIXTURE } from './dev';
import { FX_NEXT_IN, fxBets, fxResults, fxSnapshot, type FxBet, type FxResult } from '../fixture';

export type Bet = FxBet & { mine?: boolean };
export type MatchResult = FxResult;

export type FeedMsg = { type: string; t?: number; [k: string]: any };

export interface ChatLine extends ChatMsg {
  key: number;
  mine?: boolean;
}

export interface ChannelState {
  channel: string;
  title: string;
  phase: Phase;
  match: MatchView | null;
  windows: WindowView[];
  events: GameEvent[];
  chat: ChatLine[];
  bots: { owner: string; name: string }[];
  connected: boolean;
  /** serverNow - Date.now() at snapshot time */
  offset: number;
  /** names seen in chat this session (for the watching count) */
  seen: number;
  lastError: string | null;
  /** a snapshot has arrived at least once */
  ready: boolean;
  /** recent bets, newest first (house-bot bet lines and your own; not shown as chat) */
  bets: Bet[];
  /** settled rounds seen on this channel, newest first */
  results: MatchResult[];
  /** viewer count when the source knows it (fixture); otherwise null */
  viewers: number | null;
  /** when the next match's betting opens, if the source knows (fixture); otherwise null */
  nextAt: number | null;
}

const BET_LINE = /^(\d+(?:\.\d+)?) on (.+)$/;

const MAX_EVENTS = 600;
const MAX_CHAT = 150;
let chatKey = 1;

export class FeedClient {
  readonly channel: string;
  state: ChannelState;
  private ws: WebSocket | null = null;
  private tries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private listeners = new Set<() => void>();
  private rawListeners = new Set<(m: FeedMsg) => void>();
  private msgListeners = new Set<(m: FeedMsg, s: ChannelState) => void>();
  private names = new Set<string>();
  refs = 0;
  myName: string | null = null;

  constructor(channel: string) {
    this.channel = channel;
    this.state = {
      channel, title: '', phase: 'intermission', match: null, windows: [], events: [], chat: [], bots: [],
      connected: false, offset: 0, seen: 0, lastError: null, ready: false, bets: [], results: [], viewers: null, nextAt: null,
    };
  }

  /** server clock, ms */
  now() {
    return Date.now() + this.state.offset;
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getState = () => this.state;

  /** Every feed message in order (for games). */
  onRaw(l: (m: FeedMsg) => void) {
    this.rawListeners.add(l);
    return () => void this.rawListeners.delete(l);
  }
  /** Every feed message after it has been applied (for UI side effects). */
  onMessage(l: (m: FeedMsg, s: ChannelState) => void) {
    this.msgListeners.add(l);
    return () => void this.msgListeners.delete(l);
  }

  /** A snapshot rebuilt from current state, for a game mounted after the feed was already running. */
  syntheticSnapshot(): FeedMsg {
    const s = this.state;
    return {
      type: 'snapshot', t: this.now(), channel: s.channel, title: s.title, phase: s.phase, match: s.match,
      windows: s.windows, recentEvents: s.events, serverNow: this.now(), recentChat: [], bots: s.bots,
    };
  }

  addBet(b: Bet) {
    this.set({ bets: [b, ...this.state.bets].slice(0, 30) });
  }

  connect() {
    if (this.closed || this.ws) return;
    const ws = new WebSocket(`${WS_URL}/ws?channel=${encodeURIComponent(this.channel)}`);
    this.ws = ws;
    ws.onmessage = (e) => {
      let m: FeedMsg;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      this.apply(m);
    };
    ws.onopen = () => {
      this.tries = 0;
    };
    ws.onclose = () => {
      this.ws = null;
      this.set({ connected: false });
      if (this.closed) return;
      const delay = Math.min(10_000, 500 * 2 ** this.tries++) * (0.75 + Math.random() * 0.5);
      this.timer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }

  sendChat(name: string, text: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.myName = name;
    this.ws.send(JSON.stringify({ type: 'chat', name, text }));
    return true;
  }

  protected set(p: Partial<ChannelState>) {
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  }

  protected line(c: ChatMsg): ChatLine {
    if (!c.bot) this.names.add(c.from);
    return { ...c, key: chatKey++, mine: !!this.myName && c.from === this.myName && !c.bot };
  }

  private patchWindow(id: string, f: (w: WindowView) => WindowView) {
    return this.state.windows.map((w) => (w.windowId === id ? f(w) : w));
  }

  protected apply(m: FeedMsg) {
    const s = this.state;
    switch (m.type) {
      case 'snapshot': {
        const snap = m as unknown as Snapshot;
        this.set({
          title: snap.title, phase: snap.phase, match: snap.match,
          windows: (snap.windows ?? []).map((w) => ({ ...w, openedAt: this.state.windows.find((x) => x.windowId === w.windowId)?.openedAt ?? snap.serverNow })),
          events: (snap.recentEvents ?? []).slice(-MAX_EVENTS), bots: snap.bots ?? [],
          chat: (snap.recentChat ?? []).map((c) => this.line(c)),
          connected: true, offset: snap.serverNow - Date.now(), seen: this.names.size, lastError: null,
          ready: true,
        });
        break;
      }
      case 'phase':
        this.set({ phase: m.phase });
        break;
      case 'match':
        this.set({
          match: { matchId: m.matchId, title: m.title, entrants: m.entrants, meta: m.meta, startedAt: m.startedAt },
          windows: [], events: [],
        });
        break;
      case 'window_open':
        this.set({
          windows: [
            ...s.windows.filter((w) => w.windowId !== m.windowId),
            {
              windowId: m.windowId, market: m.market, question: m.question, outcomes: m.outcomes, closesAt: m.closesAt,
              seeded: m.seeded, sealed: m.sealed || undefined, simHash: m.simHash, commitment: m.commitment, state: 'open', openedAt: m.t,
              pools: m.outcomes.map(() => 0), total: 0, txs: m.txs,
            },
          ],
        });
        break;
      case 'tx':
        // Solana only: one more confirmed transaction for a round
        this.set({ windows: this.patchWindow(m.windowId, (w) => ({ ...w, txs: [...(w.txs ?? []), m.tx] })) });
        break;
      case 'pools':
        this.set({ windows: this.patchWindow(m.windowId, (w) => ({ ...w, pools: m.pools, total: m.total })) });
        break;
      case 'window_locked':
        this.set({
          windows: this.patchWindow(m.windowId, (w) => ({
            ...w, state: 'locked', seed: m.seed, entropy: m.entropy,
            pools: m.pools ?? w.pools, total: m.total ?? w.total,
          })),
        });
        break;
      case 'window_settled': {
        const w = s.windows.find((x) => x.windowId === m.windowId);
        const es = s.match?.entrants ?? [];
        const o = w?.outcomes.find((x) => x.id === m.winnerOutcomeId);
        if (w && es.length >= 2 && !s.results.some((r) => r.matchId === m.windowId)) {
          this.set({
            results: [
              {
                matchId: m.windowId, channel: s.title, a: { id: es[0]!.id, name: es[0]!.name }, b: { id: es[1]!.id, name: es[1]!.name },
                winnerId: o?.entrantId ?? m.winnerOutcomeId, pool: w.total, t: m.t ?? Date.now(),
              },
              ...s.results,
            ].slice(0, 20),
          });
        }
        this.set({
          windows: this.patchWindow(m.windowId, (w) => ({
            ...w, state: 'settled', winnerOutcomeId: m.winnerOutcomeId, secret: m.secret, payouts: m.payouts,
          })),
        });
        break;
      }
      case 'window_void':
        this.set({ windows: this.patchWindow(m.windowId, (w) => ({ ...w, state: 'void', payouts: m.refunds })) });
        break;
      case 'event': {
        const ev = m.event as GameEvent;
        const events = s.events.length >= MAX_EVENTS ? s.events.slice(-MAX_EVENTS + 1) : s.events.slice();
        events.push(ev);
        this.set({ events });
        break;
      }
      case 'match_end':
        this.set({ match: s.match ? { ...s.match, result: m.result } : s.match });
        break;
      case 'chat': {
        const bm = m.bot ? BET_LINE.exec(String(m.text)) : null;
        if (bm) {
          const open = [...s.windows].reverse().find((w) => w.state === 'open');
          const outcome = open ? open.outcomes.findIndex((o) => o.label === bm[2]) : -1;
          this.addBet({ who: String(m.from), amount: Math.round(Number(bm[1]) * 1e6), outcome, label: bm[2]!, t: m.t ?? Date.now() });
          break;
        }
        const chat = s.chat.length >= MAX_CHAT ? s.chat.slice(-MAX_CHAT + 1) : s.chat.slice();
        chat.push(this.line(m as unknown as ChatMsg));
        this.set({ chat, seen: this.names.size });
        break;
      }
      case 'error':
        this.set({ lastError: String(m.message ?? 'error') });
        setTimeout(() => {
          if (this.state.lastError === m.message) this.set({ lastError: null });
        }, 3000);
        break;
    }
    for (const l of this.rawListeners) {
      try {
        l(m);
      } catch (e) {
        console.error('game onFeed threw', e);
      }
    }
    for (const l of this.msgListeners) l(m, this.state);
  }
}

/** Dev fixture: a FeedClient fed from src/fixture.ts instead of a socket. */
class FixtureFeed extends FeedClient {
  connect() {
    const snap = fxSnapshot(this.channel);
    this.apply({ type: 'snapshot', t: snap.serverNow, ...snap });
    this.set({ bets: fxBets(this.channel), results: fxResults(this.channel), viewers: snap.viewers, nextAt: Date.now() + FX_NEXT_IN });
  }
  close() {}
  sendChat(name: string, text: string): boolean {
    this.myName = name;
    this.apply({ type: 'chat', t: Date.now(), from: name, text });
    return true;
  }
}

// One socket per channel, shared by everything on the page (stream, card, thumbnails).
const pool = new Map<string, FeedClient>();

function lingerClose(f: FeedClient) {
  // Linger briefly so switching pages doesn't drop and re-open the socket.
  setTimeout(() => {
    if (f.refs <= 0 && pool.get(f.channel) === f) {
      f.close();
      pool.delete(f.channel);
    }
  }, 4000);
}

export function getFeed(channel: string): FeedClient {
  let f = pool.get(channel);
  if (!f) {
    f = FIXTURE ? new FixtureFeed(channel) : new FeedClient(channel);
    pool.set(channel, f);
    f.connect();
    lingerClose(f);
  }
  return f;
}

export function useFeed(channel: string): FeedClient {
  const f = getFeed(channel);
  useEffect(() => {
    const h = getFeed(channel);
    h.refs++;
    return () => {
      h.refs--;
      lingerClose(h);
    };
  }, [channel]);
  return f;
}

export function useChannelState(f: FeedClient): ChannelState {
  return useSyncExternalStore(f.subscribe, f.getState);
}

/** Ticks at `ms` so countdowns re-render. */
export function useNow(ms = 250): number {
  const [n, setN] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

/** The window the prediction card should show: newest open, else newest locked, else newest finished. */
export function currentWindow(s: ChannelState): WindowView | null {
  const ws = s.windows;
  for (let i = ws.length - 1; i >= 0; i--) if (ws[i]!.state === 'open') return ws[i]!;
  for (let i = ws.length - 1; i >= 0; i--) if (ws[i]!.state === 'locked') return ws[i]!;
  return ws[ws.length - 1] ?? null;
}
