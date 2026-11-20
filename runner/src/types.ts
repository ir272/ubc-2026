// Interfaces fixed by CONTRACT.md section 2, plus a few runner-internal extras (marked EXTRA).
//
// Units: every amount the runner exposes (balances, pools, payouts, bet amounts) is an integer in
// PLAY base units, 6 decimals, exactly as onchain. 1 PLAY = 1_000_000.

export const DECIMALS = 6;
export const UNIT = 1_000_000;

export interface ChainAdapter {
  createMarket(a: {
    id: bigint;
    channel: string;
    outcomeCount: number;
    closeInMs: number;
    commitment?: Uint8Array;
    simHash?: Uint8Array;
  }): Promise<{ market: string; closesAt: number }>;
  lock(market: string): Promise<{ entropy: Uint8Array }>;
  settle(market: string, a: { secret?: Uint8Array; winner: number }): Promise<void>;
  void(market: string): Promise<void>;
  claimAll(market: string): Promise<{ owner: string; amount: number }[]>;
  /** Resolves to the transaction signature when there is one (Solana); nothing on the memory chain. */
  grant(owner: string, amount: number): Promise<string | void>;
  relay(txBase64: string): Promise<string>;
  getMarket(market: string): Promise<{ pools: number[]; state: string }>;
  getBalance(owner: string): Promise<number>;

  // EXTRA (runner-internal, not part of the contract seam)
  readonly kind: 'memory' | 'solana';
  /**
   * Solana only: called once for every confirmed transaction that belongs to a market (open, bet,
   * lock, settle, void, payout). The Hub sets it and files each one under its window (`txs`).
   * The memory chain never calls it.
   */
  onTx?: (tx: ChainTx) => void;
  /** Public info for GET /config (program id, mint, fee payer, ...). */
  info(): Record<string, unknown>;
  /** One owner's stake in one market, or null if they have none. */
  getPosition(market: string, owner: string): Promise<{ amounts: number[]; claimed: boolean } | null>;
  /** Optional batch reads (one RPC call instead of one per account); callers fall back to the single reads. */
  getMarkets?(markets: string[]): Promise<({ pools: number[]; state: string } | null)[]>;
  /** Solana: RPC requests sent since start, total and per method (for watching a provider's quota). */
  rpcUsage?(): { since: number; total: number; byMethod: Record<string, number> };
  getPositions?(markets: string[], owner: string): Promise<({ amounts: number[]; claimed: boolean } | null)[]>;
  /** Normalises/validates an owner string (throws if invalid). */
  parseOwner(owner: string): string;
  /** Memory chain only: place a bet without a signed transaction (POST /dev/bet). */
  placeBet?(owner: string, market: string, outcome: number, amount: number): Promise<void>;
  /** Memory chain only: move play dollars between owners without a signed transaction (POST /dev/transfer). */
  transfer?(from: string, to: string, amount: number): Promise<void>;
  /** House bots: create (or load) a bot account, and bet as it. */
  botAccount(name: string): Promise<string>;
  botBet(owner: string, market: string, outcome: number, amount: number): Promise<void>;
  /**
   * Rent reclamation for a finished (settled or void) market: pays any position still unclaimed,
   * closes the claimed positions, then the market, returning the rent to the admin. Idempotent and
   * safe to retry. `done` = nothing is left to close (also true if the market is already gone).
   * Called in the background by Reclaimer (src/reclaim.ts); MemoryChain: no-op.
   */
  reclaim(market: string): Promise<{ positions: number; market: boolean; done: boolean }>;
}

export interface Entrant {
  id: string;
  name: string;
  color?: string;
  avatar?: string;
  stats?: Record<string, number>;
  record?: { played: number; wins: number };
}

export interface GameEvent {
  type: string;
  at: number; // ms since match start
  data?: unknown;
}

export interface Outcome {
  id: string;
  label: string;
  entrantId?: string;
}

/** Handle returned by Show.openWindow. Treat as opaque in channel code. */
export interface Win {
  readonly windowId: string;
  readonly market: string;
  readonly outcomes: Outcome[];
  readonly seeded: boolean;
  readonly closesAt: number;
  /**
   * Only on windows opened with `sealed: true`: a private 32-byte hex value, fixed and committed
   * onchain before betting, never sent to viewers. Derive hidden roles or cards from it.
   * After settle anyone can check it: sealed = sha256("arena-sealed" ‖ secret).
   */
  readonly sealed?: string;
}

export interface Show {
  announce(match: { matchId: string; title: string; entrants: Entrant[]; meta?: unknown }): void;
  openWindow(w: {
    question: string;
    outcomes: Outcome[];
    durationMs: number;
    seeded: boolean;
    simHash?: string;
    /** Commit a secret now and reveal it at settle, without deriving a public seed at lock. */
    sealed?: boolean;
  }): Promise<Win>;
  lock(win: Win): Promise<{ seed?: string }>;
  emit(event: GameEvent): void;
  settle(win: Win, winnerOutcomeId: string): Promise<void>;
  voidWindow(win: Win): Promise<void>;
  sleep(ms: number): Promise<void>;
  end(result: unknown): void;

  // EXTRA helpers
  /** ms since announce() (what GameEvent.at is measured against). */
  elapsed(): number;
  /** Aborted when the runner shuts down; long-running channel code may watch it. */
  readonly signal: AbortSignal;
}

export interface ChannelDef {
  id: string;
  title: string;
  run(show: Show): Promise<void>;
  /** EXTRA: pause between matches (phase 'intermission'). Default 5000. */
  intermissionMs?: number;
}

export type Phase = 'lobby' | 'live' | 'result' | 'intermission';

export type WindowState = 'open' | 'locked' | 'settled' | 'void';

export type TxKind = 'open' | 'bet' | 'lock' | 'settle' | 'void' | 'payout';

/** EXTRA: a confirmed transaction as the chain adapter reports it (see ChainAdapter.onTx). */
export interface ChainTx {
  kind: TxKind;
  signature: string;
  market: string;
  /** bet: the bettor. payout: who was paid. */
  who?: string;
  /** base units */
  amount?: number;
  /** bet: outcome index bet on. settle: the winning outcome index. */
  outcome?: number;
}

/**
 * EXTRA: one confirmed onchain transaction of a window, as sent to the site (Solana only).
 * A payout transaction pays up to 4 owners, so several `payout` entries can share one signature.
 */
export interface WindowTx {
  kind: TxKind;
  signature: string;
  /** ms epoch (runner clock) when the runner saw it confirmed */
  at: number;
  /** bet: the bettor. payout: who was paid. */
  who?: string;
  /** base units (bet stake, or amount paid) */
  amount?: number;
  /** bet: the outcome bet on. settle: the winning outcome. */
  outcomeId?: string;
  /** `who` is a house bot */
  bot?: boolean;
}

/** A window as it appears in snapshots. */
export interface WindowView {
  windowId: string;
  matchId: string;
  market: string;
  question: string;
  outcomes: Outcome[];
  closesAt: number;
  seeded: boolean;
  /** EXTRA: a secret was committed at open for a hidden role or cards; revealed at settle. */
  sealed?: boolean;
  commitment?: string;
  state: WindowState;
  pools: number[];
  total: number;
  simHash?: string;
  seed?: string;
  entropy?: string;
  winnerOutcomeId?: string;
  secret?: string;
  /** EXTRA: after settle/void, who was paid what (base units). */
  payouts?: { owner: string; amount: number; bot?: boolean }[];
  /** EXTRA: Solana only (absent on the memory chain): this window's confirmed transactions, oldest first, capped. */
  txs?: WindowTx[];
}

export interface MatchView {
  matchId: string;
  title: string;
  entrants: Entrant[];
  meta?: unknown;
  startedAt: number;
  result?: unknown;
}

export interface Snapshot {
  type?: 'snapshot';
  t?: number;
  channel: string;
  title: string; // EXTRA
  phase: Phase;
  match: MatchView | null;
  windows: WindowView[];
  recentEvents: GameEvent[];
  serverNow: number;
  recentChat: ChatMsg[]; // EXTRA
  bots: { owner: string; name: string }[]; // EXTRA
  /** EXTRA: live WebSocket connections on this channel right now (real viewers). */
  viewers: number;
}

export interface ChatMsg {
  from: string;
  text: string;
  bot?: boolean;
  t: number;
}
