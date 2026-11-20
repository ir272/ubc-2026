import type { ChannelDef, Entrant, GameEvent, Outcome, Show, Win } from './types.ts';
import type { ChannelRuntime, Hub, WindowRec } from './hub.ts';
import { computeSeed, hex, random32, randomMarketId, sha256, unhex } from './lib/bytes.ts';
import { log, sleep } from './lib/log.ts';
import { toHistoryMatch } from './history.ts';

const LOCK_RETRIES = 120; // up to ~60 s past closesAt (slot clock drift on Solana)
const LOCK_RETRY_MS = 500;

class ShowError extends Error {}

/**
 * One Show per match run. Drives the channel phase:
 *   announce → lobby, first emit → live, end → result, (runner) → intermission.
 */
export class MatchShow implements Show {
  readonly signal: AbortSignal;
  private hub: Hub;
  private rt: ChannelRuntime;
  private startedAt = 0;
  private announced = false;
  private ended = false;
  dead = false;
  private windowCount = 0;

  constructor(hub: Hub, rt: ChannelRuntime, signal: AbortSignal) {
    this.hub = hub;
    this.rt = rt;
    this.signal = signal;
  }

  private get id() {
    return this.rt.def.id;
  }

  private alive(what: string) {
    if (this.dead) throw new ShowError(`${this.id}: ${what}() called after the match finished`);
    if (this.signal.aborted) throw this.signal.reason ?? new ShowError('aborted');
  }

  private rec(win: Win): WindowRec {
    const w = this.hub.windows.get(win.windowId);
    if (!w || w.channel !== this.id) throw new ShowError('unknown window');
    return w;
  }

  elapsed() {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  announce(match: { matchId: string; title: string; entrants: Entrant[]; meta?: unknown }): void {
    this.alive('announce');
    if (this.announced) throw new ShowError('announce() may only be called once per match');
    if (!match?.matchId || !Array.isArray(match.entrants)) throw new ShowError('announce needs matchId and entrants');
    this.announced = true;
    this.startedAt = Date.now();
    const rt = this.rt;
    rt.match = {
      matchId: String(match.matchId),
      title: String(match.title ?? ''),
      entrants: match.entrants,
      meta: match.meta,
      startedAt: this.startedAt,
    };
    rt.windows = [];
    rt.recentEvents = [];
    this.hub.setPhase(this.id, 'lobby');
    this.hub.broadcast(this.id, 'match', {
      matchId: rt.match.matchId,
      title: rt.match.title,
      entrants: rt.match.entrants,
      meta: rt.match.meta,
      startedAt: this.startedAt, // EXTRA
    });
    log.info(`[${this.id}] match ${rt.match.matchId}: ${rt.match.title}`);
  }

  async openWindow(w: {
    question: string;
    outcomes: Outcome[];
    durationMs: number;
    seeded: boolean;
    simHash?: string;
    sealed?: boolean;
  }): Promise<Win> {
    this.alive('openWindow');
    if (!this.announced) throw new ShowError('announce() before openWindow()');
    const outcomes = w.outcomes;
    if (!Array.isArray(outcomes) || outcomes.length < 2 || outcomes.length > 16)
      throw new ShowError('a window needs 2..16 outcomes');
    if (new Set(outcomes.map((o) => o.id)).size !== outcomes.length) throw new ShowError('outcome ids must be unique');
    if (!(w.durationMs > 0)) throw new ShowError('durationMs must be > 0');

    if (w.seeded && w.sealed) throw new ShowError('a window is seeded or sealed, not both');
    const secret = w.seeded || w.sealed ? random32() : undefined;
    // Sealed windows: the channel gets a private value derived from the committed secret.
    // Nothing about it is broadcast until settle reveals the secret.
    const sealed =
      w.sealed && secret
        ? hex(sha256(new Uint8Array([...new TextEncoder().encode('arena-sealed'), ...secret])))
        : undefined;
    const simHashBytes = w.simHash
      ? /^[0-9a-f]{64}$/i.test(w.simHash)
        ? unhex(w.simHash)
        : sha256(new TextEncoder().encode(w.simHash))
      : undefined;
    const { market, closesAt } = await this.hub.chain.createMarket({
      id: randomMarketId(),
      channel: this.id,
      outcomeCount: outcomes.length,
      closeInMs: w.durationMs,
      commitment: secret ? sha256(secret) : undefined,
      simHash: simHashBytes,
    });
    this.alive('openWindow');

    const matchId = this.rt.match!.matchId;
    let windowId = `${matchId}:w${++this.windowCount}`;
    if (this.hub.windows.has(windowId)) windowId += '-' + hex(random32()).slice(0, 6);
    const rec: WindowRec = {
      windowId,
      matchId,
      channel: this.id,
      market,
      question: String(w.question),
      outcomes: outcomes.map((o) => ({ ...o })),
      closesAt,
      seeded: !!w.seeded,
      state: 'open',
      pools: new Array(outcomes.length).fill(0),
      total: 0,
      simHash: simHashBytes ? hex(simHashBytes) : undefined,
      sealed: sealed ? true : undefined,
      commitment: secret ? hex(sha256(secret)) : undefined,
      secretBytes: secret,
    };
    this.hub.registerWindow(rec);
    this.rt.windows.push(rec);
    this.hub.broadcast(this.id, 'window_open', {
      windowId,
      market,
      question: rec.question,
      outcomes: rec.outcomes,
      closesAt,
      seeded: rec.seeded,
      sealed: rec.sealed, // EXTRA
      simHash: rec.simHash, // EXTRA
      commitment: secret ? hex(sha256(secret)) : undefined, // EXTRA
      txs: rec.txs, // EXTRA, Solana only: the create_market transaction (absent on the memory chain)
    });
    log.info(`[${this.id}] window ${windowId} open (${rec.seeded ? 'seeded' : 'live'}): ${rec.question}`);
    return { windowId, market, outcomes: rec.outcomes, seeded: rec.seeded, closesAt, ...(sealed ? { sealed } : {}) };
  }

  async lock(win: Win): Promise<{ seed?: string }> {
    this.alive('lock');
    const w = this.rec(win);
    if (w.state === 'locked') return { seed: w.seed };
    if (w.state !== 'open') throw new ShowError(`cannot lock a ${w.state} window`);
    await sleep(w.closesAt - Date.now() + 25, this.signal);
    let entropy: Uint8Array | undefined;
    for (let i = 0; ; i++) {
      this.alive('lock');
      try {
        ({ entropy } = await this.hub.chain.lock(w.market));
        break;
      } catch (e) {
        // On Solana the close slot can trail wall-clock time a little; retry.
        if (i >= LOCK_RETRIES) throw e;
        await sleep(LOCK_RETRY_MS, this.signal);
      }
    }
    w.state = 'locked';
    await this.hub.refreshPools(w); // final pools
    w.entropy = hex(entropy);
    if (w.seeded && w.secretBytes) w.seed = computeSeed(w.secretBytes, entropy, w.market);
    this.hub.broadcast(this.id, 'window_locked', {
      windowId: w.windowId,
      seed: w.seed,
      entropy: w.entropy,
      simHash: w.simHash,
      pools: w.pools, // EXTRA: final pools
      total: w.total, // EXTRA
    });
    log.info(`[${this.id}] window ${w.windowId} locked, pool ${w.total}`);
    return w.seed ? { seed: w.seed } : {};
  }

  emit(event: GameEvent): void {
    this.alive('emit');
    if (!this.announced) throw new ShowError('announce() before emit()');
    if (!event || typeof event.type !== 'string') throw new ShowError('event needs a type');
    const ev: GameEvent = { type: event.type, at: typeof event.at === 'number' ? event.at : this.elapsed() };
    if (event.data !== undefined) ev.data = event.data;
    if (this.rt.phase === 'lobby') this.hub.setPhase(this.id, 'live');
    this.hub.pushEvent(this.id, ev);
  }

  async settle(win: Win, winnerOutcomeId: string): Promise<void> {
    this.alive('settle');
    const w = this.rec(win);
    if (w.state !== 'locked') throw new ShowError(`cannot settle a ${w.state} window (lock it first)`);
    const winner = w.outcomes.findIndex((o) => o.id === winnerOutcomeId);
    if (winner < 0) throw new ShowError(`unknown outcome id ${winnerOutcomeId}`);
    await this.hub.chain.settle(w.market, { secret: w.secretBytes, winner });
    w.state = 'settled';
    w.winnerOutcomeId = winnerOutcomeId;
    if (w.secretBytes) w.secret = hex(w.secretBytes);
    let payouts: { owner: string; amount: number }[];
    try {
      payouts = await this.hub.chain.claimAll(w.market);
    } finally {
      this.hub.reclaimer.enqueue(w.market); // rent back to the admin later; also retries any missed claim
    }
    w.paid = new Map(payouts.map((p) => [p.owner, p.amount]));
    this.hub.broadcast(this.id, 'window_settled', {
      windowId: w.windowId,
      winnerOutcomeId,
      secret: w.secret,
      payouts: this.flagBots(payouts),
    });
    log.info(`[${this.id}] window ${w.windowId} settled → ${winnerOutcomeId}, ${payouts.length} payouts`);
  }

  async voidWindow(win: Win): Promise<void> {
    this.alive('voidWindow');
    await voidRec(this.hub, this.rec(win));
  }

  private flagBots(list: { owner: string; amount: number }[]) {
    return list.map((p) => (this.hub.botOwners.has(p.owner) ? { ...p, bot: true } : p));
  }

  sleep(ms: number): Promise<void> {
    this.alive('sleep');
    return sleep(ms, this.signal);
  }

  end(result: unknown): void {
    this.alive('end');
    if (this.ended) return;
    this.ended = true;
    if (this.rt.match) this.rt.match.result = result;
    this.hub.setPhase(this.id, 'result');
    this.hub.broadcast(this.id, 'match_end', { result });
  }

  get hasEnded() {
    return this.ended;
  }

  get hasAnnounced() {
    return this.announced;
  }
}

async function voidRec(hub: Hub, w: WindowRec) {
  if (w.state === 'void') return;
  if (w.state === 'settled') throw new ShowError('cannot void a settled window');
  await hub.chain.void(w.market);
  w.state = 'void';
  let refunds: { owner: string; amount: number }[];
  try {
    refunds = await hub.chain.claimAll(w.market);
  } finally {
    hub.reclaimer.enqueue(w.market);
  }
  w.paid = new Map(refunds.map((p) => [p.owner, p.amount]));
  hub.broadcast(w.channel, 'window_void', {
    windowId: w.windowId,
    refunds: refunds.map((p) => (hub.botOwners.has(p.owner) ? { ...p, bot: true } : p)), // EXTRA
  });
  log.info(`[${w.channel}] window ${w.windowId} void, ${refunds.length} refunds`);
}

/** Voids every window of the current match that is still open or locked. */
async function cleanupWindows(hub: Hub, rt: ChannelRuntime) {
  for (const w of rt.windows) {
    if (w.state !== 'open' && w.state !== 'locked') continue;
    try {
      await voidRec(hub, w);
    } catch (e) {
      log.error(`[${rt.def.id}] could not void ${w.windowId}: ${(e as Error).message}`);
    }
  }
}

export interface LoopOpts {
  errorPauseMs?: number;
  minGapMs?: number;
  onMatchDone?: (channel: string, ok: boolean) => void;
}

/** Runs one channel forever (until `signal` aborts). A throwing channel never escapes this loop. */
export async function runChannelLoop(hub: Hub, def: ChannelDef, signal: AbortSignal, opts: LoopOpts = {}) {
  const rt = hub.get(def.id) ?? hub.addChannel(def);
  const errorPauseMs = opts.errorPauseMs ?? 3000;
  const intermissionMs = def.intermissionMs ?? 5000;
  while (!signal.aborted) {
    const show = new MatchShow(hub, rt, signal);
    const started = Date.now();
    let ok = true;
    try {
      await def.run(show);
      const leftover = rt.windows.filter((w) => w.state === 'open' || w.state === 'locked');
      if (leftover.length) {
        log.warn(`[${def.id}] run() returned with ${leftover.length} unsettled window(s); voiding`);
      }
    } catch (e) {
      ok = false;
      if (!signal.aborted) log.error(`[${def.id}] channel run failed:`, (e as Error)?.stack ?? e);
    }
    show.dead = true;
    await cleanupWindows(hub, rt);
    if (!ok && rt.match && !show.hasEnded) {
      rt.match.result = { aborted: true };
      hub.broadcast(def.id, 'match_end', { result: { aborted: true } });
    }
    // History: every match this run announced, once all its windows are final. A match cut short
    // by shutdown is left out (it says nothing about the entrants and would pile up on restarts).
    if (show.hasAnnounced && rt.match && !(signal.aborted && !show.hasEnded)) {
      try {
        hub.history.add(def.id, toHistoryMatch(rt.match, rt.windows));
      } catch (e) {
        log.warn(`[${def.id}] could not record history: ${(e as Error).message}`);
      }
    }
    opts.onMatchDone?.(def.id, ok);
    if (signal.aborted) break;
    hub.setPhase(def.id, 'intermission');
    try {
      const gap = Math.max(ok ? intermissionMs : errorPauseMs, (opts.minGapMs ?? 1000) - (Date.now() - started));
      await sleep(gap, signal);
    } catch {
      break;
    }
  }
}
