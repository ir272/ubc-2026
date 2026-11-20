import type {
  ChainAdapter,
  ChainTx,
  ChannelDef,
  ChatMsg,
  GameEvent,
  MatchView,
  Phase,
  Snapshot,
  WindowTx,
  WindowView,
} from './types.ts';
import { log } from './lib/log.ts';
import { Reclaimer } from './reclaim.ts';
import { History } from './history.ts';
import { capTxs } from './lib/txs.ts';

export interface WindowRec extends WindowView {
  channel: string;
  /** Private until settle. Never put in a snapshot or a log line before then. */
  secretBytes?: Uint8Array;
  paid?: Map<string, number>;
}

export interface ChannelRuntime {
  def: ChannelDef;
  phase: Phase;
  match: MatchView | null;
  windows: WindowRec[]; // current match's windows
  recentEvents: GameEvent[];
  chat: ChatMsg[];
  listeners: Set<Listener>;
}

export type FeedMsg = { type: string; t: number; [k: string]: unknown };
export type Listener = (msg: FeedMsg, json: string) => void;

const MAX_EVENTS = 500;
const MAX_CHAT = 50;
const MAX_HISTORY = 300;
/** Transactions kept per window (the oldest bets go first). */
export const MAX_WINDOW_TXS = 48;
/** Markets whose transactions arrived before their window was registered (create_market does). */
const MAX_PENDING_MARKETS = 64;


/** Holds every channel's live state and fans feed messages out to subscribers. */
export class Hub {
  readonly channels = new Map<string, ChannelRuntime>();
  /** Recent windows across all channels (for /me, /dev/bet and pool refreshes). */
  readonly windows = new Map<string, WindowRec>();
  readonly bots: { owner: string; name: string }[] = [];
  readonly botOwners = new Set<string>();
  readonly chain: ChainAdapter;
  /** Closes finished markets in the background to return their rent (see reclaim.ts). */
  readonly reclaimer: Reclaimer;
  /** Finished matches per channel (see history.ts). In memory only unless `historyDir` is given. */
  readonly history: History;
  /** market address -> its window, for filing chain transactions (Solana only; unused on memory). */
  private byMarket = new Map<string, WindowRec>();
  private pendingTxs = new Map<string, { t: ChainTx; at: number }[]>();

  constructor(chain: ChainAdapter, opts: { historyDir?: string | null } = {}) {
    this.chain = chain;
    chain.onTx = (t) => this.recordTx(t);
    this.reclaimer = new Reclaimer(chain);
    this.history = new History({ dir: opts.historyDir ?? null, chainKind: chain.kind });
  }

  addChannel(def: ChannelDef): ChannelRuntime {
    if (this.channels.has(def.id)) throw new Error(`duplicate channel id ${def.id}`);
    const rt: ChannelRuntime = {
      def,
      phase: 'intermission',
      match: null,
      windows: [],
      recentEvents: [],
      chat: [],
      listeners: new Set(),
    };
    this.channels.set(def.id, rt);
    return rt;
  }

  get(id: string): ChannelRuntime | undefined {
    return this.channels.get(id);
  }

  subscribe(id: string, l: Listener): () => void {
    const rt = this.channels.get(id);
    if (!rt) throw new Error('unknown channel');
    rt.listeners.add(l);
    this.viewersChanged(id);
    return () => {
      rt.listeners.delete(l);
      this.viewersChanged(id);
    };
  }

  private viewerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Tells the channel how many are watching, at most once a second (joins and leaves come in bursts). */
  private viewersChanged(id: string) {
    if (this.viewerTimers.has(id)) return;
    const t = setTimeout(() => {
      this.viewerTimers.delete(id);
      const rt = this.channels.get(id);
      if (rt) this.broadcast(id, 'viewers', { viewers: rt.listeners.size }); // EXTRA message
    }, 1000);
    t.unref?.();
    this.viewerTimers.set(id, t);
  }

  broadcast(id: string, type: string, body: Record<string, unknown> = {}) {
    const rt = this.channels.get(id);
    if (!rt) return;
    const msg: FeedMsg = { type, t: Date.now(), ...body };
    const json = JSON.stringify(msg);
    for (const l of rt.listeners) {
      try {
        l(msg, json);
      } catch (e) {
        log.warn('listener threw', e);
      }
    }
  }

  setPhase(id: string, phase: Phase) {
    const rt = this.channels.get(id);
    if (!rt || rt.phase === phase) return;
    rt.phase = phase;
    this.broadcast(id, 'phase', { phase }); // EXTRA message
  }

  pushEvent(id: string, ev: GameEvent) {
    const rt = this.channels.get(id)!;
    rt.recentEvents.push(ev);
    if (rt.recentEvents.length > MAX_EVENTS) rt.recentEvents.splice(0, rt.recentEvents.length - MAX_EVENTS);
    // GameEvent has its own `type`, so it is nested: { type: 'event', t, event: GameEvent }
    this.broadcast(id, 'event', { event: ev });
  }

  chatMsg(id: string, from: string, text: string, bot = false) {
    const rt = this.channels.get(id);
    if (!rt) return;
    const m: ChatMsg = bot ? { from, text, bot: true, t: Date.now() } : { from, text, t: Date.now() };
    rt.chat.push(m);
    if (rt.chat.length > MAX_CHAT) rt.chat.shift();
    const body: Record<string, unknown> = { from, text };
    if (bot) body.bot = true;
    this.broadcast(id, 'chat', body);
  }

  registerWindow(w: WindowRec) {
    this.windows.set(w.windowId, w);
    this.byMarket.set(w.market, w);
    // Transactions seen before the window existed (its create_market) join it now, without a
    // `tx` message: they ride in `window_open` and in snapshots.
    const early = this.pendingTxs.get(w.market);
    if (early) {
      this.pendingTxs.delete(w.market);
      for (const e of early) this.fileTx(w, e.t, e.at);
    }
    if (this.windows.size > MAX_HISTORY) {
      for (const [k, v] of this.windows) {
        if (this.windows.size <= MAX_HISTORY) break;
        if (v.state === 'settled' || v.state === 'void') {
          this.windows.delete(k);
          this.byMarket.delete(v.market);
        }
      }
    }
  }

  private fileTx(w: WindowRec, t: ChainTx, at: number): WindowTx {
    const tx: WindowTx = { kind: t.kind, signature: t.signature, at };
    if (t.who) tx.who = t.who;
    if (t.amount !== undefined) tx.amount = t.amount;
    const outcomeId = t.outcome === undefined ? undefined : w.outcomes[t.outcome]?.id;
    if (outcomeId !== undefined) tx.outcomeId = outcomeId;
    if (t.who && this.botOwners.has(t.who)) tx.bot = true;
    w.txs = capTxs([...(w.txs ?? []), tx], MAX_WINDOW_TXS);
    return tx;
  }

  /** A confirmed transaction from the chain adapter (Solana only): file it under its window and tell the feed. */
  recordTx(t: ChainTx) {
    const at = Date.now();
    const w = this.byMarket.get(t.market);
    if (!w) {
      const l = this.pendingTxs.get(t.market) ?? [];
      l.push({ t, at });
      this.pendingTxs.set(t.market, l.slice(-MAX_WINDOW_TXS));
      while (this.pendingTxs.size > MAX_PENDING_MARKETS) this.pendingTxs.delete(this.pendingTxs.keys().next().value!);
      return;
    }
    const tx = this.fileTx(w, t, at);
    this.broadcast(w.channel, 'tx', { windowId: w.windowId, market: w.market, tx }); // EXTRA message
  }

  /** Newest first: recent transactions across windows the runner still remembers (GET /ledger). */
  ledger(o: { channel?: string; limit?: number } = {}) {
    const rows: (WindowTx & { channel: string; windowId: string; market: string; question: string })[] = [];
    for (const w of this.windows.values()) {
      if (!w.txs || (o.channel && w.channel !== o.channel)) continue;
      for (const tx of w.txs) rows.push({ ...tx, channel: w.channel, windowId: w.windowId, market: w.market, question: w.question });
    }
    // newest first; within the same millisecond the later-filed one comes first
    const order = new Map(rows.map((r, i) => [r, i]));
    rows.sort((a, b) => b.at - a.at || order.get(b)! - order.get(a)!);
    return rows.slice(0, o.limit ?? 50);
  }

  openWindows(): WindowRec[] {
    const out: WindowRec[] = [];
    for (const rt of this.channels.values()) for (const w of rt.windows) if (w.state === 'open') out.push(w);
    return out;
  }

  /** Re-read pools from the chain and broadcast `pools` if they changed. */
  async refreshPools(w: WindowRec): Promise<void> {
    try {
      const m = await this.chain.getMarket(w.market);
      const total = m.pools.reduce((a, b) => a + b, 0);
      if (total === w.total && m.pools.every((p, i) => p === w.pools[i])) return;
      w.pools = m.pools;
      w.total = total;
      this.broadcast(w.channel, 'pools', { windowId: w.windowId, pools: w.pools, total });
    } catch (e) {
      log.warn(`refreshPools ${w.windowId} failed: ${(e as Error).message}`);
    }
  }

  async refreshAllOpen() {
    const open = this.openWindows();
    if (!open.length) return;
    if (!this.chain.getMarkets) {
      await Promise.all(open.map((w) => this.refreshPools(w)));
      return;
    }
    // One RPC call for every open window (public RPCs rate-limit per method).
    try {
      const ms = await this.chain.getMarkets(open.map((w) => w.market));
      open.forEach((w, i) => {
        const m = ms[i];
        if (m) this.applyPools(w, m.pools);
      });
    } catch (e) {
      log.warn(`refreshAllOpen failed: ${(e as Error).message}`);
    }
  }

  private applyPools(w: WindowRec, pools: number[]) {
    const total = pools.reduce((a, b) => a + b, 0);
    if (total === w.total && pools.every((p, i) => p === w.pools[i])) return;
    w.pools = pools;
    w.total = total;
    this.broadcast(w.channel, 'pools', { windowId: w.windowId, pools: w.pools, total });
  }

  publicWindow(w: WindowRec): WindowView {
    const v: WindowView = {
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
    if (w.sealed) v.sealed = true;
    if (w.commitment) v.commitment = w.commitment;
    if (w.simHash) v.simHash = w.simHash;
    if (w.seed) v.seed = w.seed;
    if (w.entropy) v.entropy = w.entropy;
    if (w.winnerOutcomeId) v.winnerOutcomeId = w.winnerOutcomeId;
    if (w.state === 'settled' && w.secret) v.secret = w.secret;
    if (w.txs?.length) v.txs = w.txs;
    if (w.paid) v.payouts = [...w.paid].map(([owner, amount]) => (this.botOwners.has(owner) ? { owner, amount, bot: true } : { owner, amount }));
    return v;
  }

  snapshot(id: string, opts: { events?: boolean } = {}): Snapshot | null {
    const rt = this.channels.get(id);
    if (!rt) return null;
    return {
      channel: id,
      title: rt.def.title,
      phase: rt.phase,
      match: rt.match,
      windows: rt.windows.map((w) => this.publicWindow(w)),
      recentEvents: opts.events === false ? [] : rt.recentEvents,
      serverNow: Date.now(),
      recentChat: opts.events === false ? [] : rt.chat,
      bots: this.bots,
      viewers: rt.listeners.size,
    };
  }
}
