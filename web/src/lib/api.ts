import { RUNNER_URL } from './env';

export interface Outcome { id: string; label: string; entrantId?: string }
export interface Entrant {
  id: string; name: string; color?: string; avatar?: string;
  stats?: Record<string, number>; record?: { played: number; wins: number };
}
export interface GameEvent { type: string; at: number; data?: any }
export interface Payout { owner: string; amount: number; bot?: boolean }
export type Phase = 'lobby' | 'live' | 'result' | 'intermission';
export type WindowState = 'open' | 'locked' | 'settled' | 'void';
/** One on-chain step of a round. Sent by the runner only when it runs on Solana. */
export interface WindowTx {
  kind: 'open' | 'bet' | 'lock' | 'settle' | 'void' | 'payout';
  /** base58 Solana transaction signature, confirmed */
  signature: string;
  at: number;
  /** bet: the bettor; payout: who was paid */
  who?: string;
  /** base units */
  amount?: number;
  /** bet: the outcome bet on; settle: the winning outcome */
  outcomeId?: string;
  bot?: boolean;
}
export interface WindowView {
  windowId: string; matchId?: string; market: string; question: string; outcomes: Outcome[];
  closesAt: number; seeded: boolean; state: WindowState; pools: number[]; total: number;
  simHash?: string; commitment?: string; seed?: string; entropy?: string;
  /** a hidden role/card set fixed and committed before betting; secret revealed at settle */
  sealed?: boolean;
  winnerOutcomeId?: string; secret?: string; payouts?: Payout[];
  /** Solana only: this round's transactions, oldest first */
  txs?: WindowTx[];
  /** client-side: server time the window was first seen open (for the countdown bar) */
  openedAt?: number;
}
export interface MatchView { matchId: string; title: string; entrants: Entrant[]; meta?: any; startedAt?: number; result?: any }
export interface ChatMsg { from: string; text: string; bot?: boolean; t?: number }
export interface Snapshot {
  channel: string; title: string; phase: Phase; match: MatchView | null; windows: WindowView[];
  recentEvents: GameEvent[]; serverNow: number; recentChat: ChatMsg[]; bots: { owner: string; name: string }[];
  /** people with this channel open right now, counted by the runner */
  viewers?: number;
}
export interface Config {
  chain: 'memory' | 'solana'; decimals: number; unit: number; faucetAmount: number; houseBots: boolean;
  programId?: string; mint?: string; config?: string; cluster?: string; feePayer?: string;
}
export interface Position {
  channel: string; matchId: string; windowId: string; market: string; question: string; outcomes: Outcome[];
  state: WindowState; amounts: number[]; claimed: boolean; winnerOutcomeId?: string; payout?: number;
}

/** GET /channels/:id/history: one finished match (newest first in the list). */
export interface HistoryMatch {
  matchId: string; title: string; entrants: { id: string; name: string; color?: string; record?: { played: number; wins: number } }[];
  startedAt: number; endedAt: number; result: any;
  windows: {
    windowId: string; market: string; question: string; outcomes: Outcome[]; seeded: boolean; sealed: boolean;
    pools: number[]; total: number; winnerOutcomeId?: string; void: boolean;
  }[];
  /** no settled window with entrant outcomes */
  void: boolean;
  /** entrant behind the deciding outcome; null when void or a tie */
  winnerId: string | null; winnerOutcomeId?: string; winnerLabel?: string;
  /** sum of every window's pool, base units */
  pot: number;
}
export interface EntrantForm {
  id: string; name: string; color?: string; played: number; wins: number; source: 'channel' | 'history';
  history: { played: number; wins: number; draws: number };
  /** newest first */
  last5: ('W' | 'L' | 'D')[]; lastPlayedAt: number;
}
/** GET /channels/:id/form */
export interface ChannelForm {
  channel: string; chain: string; matches: number;
  /** settled windows with one clear favourite (biggest pool at lock), and how many it won */
  favourite: { considered: number; won: number };
  entrants: EntrantForm[];
}

/** `ms`: give up after this long, so a slow runner cannot tie up the browser's few connections to it. */
async function req<T>(path: string, body?: unknown, ms?: number): Promise<T> {
  const signal = ms ? AbortSignal.timeout(ms) : undefined;
  const r = await fetch(
    RUNNER_URL + path,
    body === undefined
      ? { signal }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal },
  );
  let j: any = null;
  try {
    j = await r.json();
  } catch {
    /* empty body */
  }
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j as T;
}

export const api = {
  config: () => req<Config>('/config'),
  channels: () => req<Snapshot[]>('/channels'),
  channel: (id: string) => req<Snapshot>('/channels/' + encodeURIComponent(id)),
  history: (id: string, limit = 20) =>
    req<{ channel: string; chain: string; matches: HistoryMatch[] }>(`/channels/${encodeURIComponent(id)}/history?limit=${limit}`),
  form: (id: string) => req<ChannelForm>(`/channels/${encodeURIComponent(id)}/form`),
  me: (owner: string) => req<{ balance: number; positions: Position[] }>('/me/' + owner, undefined, 6000),
  faucet: (owner: string) => req<{ granted: number; balance: number; already?: boolean }>('/faucet', { owner }, 30000),
  devBet: (b: { owner: string; windowId: string; outcomeId: string; amount: number }) =>
    req<{ ok: true; pools: number[]; total: number; balance: number }>('/dev/bet', b),
  relay: (tx: string) => req<{ signature: string }>('/relay', { tx }),
  /** Practice mode only: move play dollars to another address. */
  devTransfer: (b: { from: string; to: string; amount: number }) => req<{ ok: true; balance: number }>('/dev/transfer', b),
};

let cfg: Promise<Config> | null = null;
export const getConfig = () =>
  (cfg ??= api.config().catch((e) => {
    cfg = null;
    throw e;
  }));
