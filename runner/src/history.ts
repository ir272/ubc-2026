// Match history: every finished match per channel, kept in memory (last MAX_MATCHES) and, when a
// directory is given, persisted to <dir>/<chain kind>-<channel>.json (written atomically: temp file
// + rename). A missing or unreadable file means the channel starts with no history.
//
// Form (per-entrant record, last five, how often the betting favourite won) is derived from it.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Entrant, MatchView, Outcome, WindowTx } from './types.ts';
import type { WindowRec } from './hub.ts';
import { capTxs } from './lib/txs.ts';
import { log } from './lib/log.ts';

export const MAX_MATCHES = 200;
/** A channel's `result` larger than this (as JSON) is cut down to its top-level primitive fields. */
const MAX_RESULT_BYTES = 8 * 1024;

export interface HistoryWindow {
  windowId: string;
  market: string;
  question: string;
  outcomes: Outcome[];
  seeded: boolean;
  sealed: boolean;
  /** Final pools at lock (base units), one per outcome. */
  pools: number[];
  total: number;
  /** Set when the window settled; absent when it was voided. */
  winnerOutcomeId?: string;
  void: boolean;
  /** Solana only: the window's transactions (at most MAX_HISTORY_TXS; the oldest bets are dropped first). */
  txs?: WindowTx[];
}

/** Transactions kept per window in history (smaller than live, to keep the files and /history light). */
export const MAX_HISTORY_TXS = 16;

export interface HistoryEntrant {
  id: string;
  name: string;
  color?: string;
  /** The channel's own record for this entrant as announced (before this match), if it sent one. */
  record?: { played: number; wins: number };
}

export interface HistoryMatch {
  matchId: string;
  title: string;
  entrants: HistoryEntrant[];
  startedAt: number;
  endedAt: number;
  result: unknown;
  windows: HistoryWindow[];
}

/** How a match was decided, from its last settled window that names entrants. */
export interface Decision {
  /** No settled window with entrant outcomes: nobody played this one out. */
  void: boolean;
  /** Entrant tied to the winning outcome, or null (void, or the winning outcome names no entrant: a tie). */
  winnerId: string | null;
  /** The winning outcome of that window (absent when void). */
  winnerOutcomeId?: string;
  winnerLabel?: string;
}

export type FormLetter = 'W' | 'L' | 'D';

export interface EntrantForm {
  id: string;
  name: string;
  color?: string;
  /** Preferred record: the channel's own when it announces one (brought up to date), else derived. */
  played: number;
  wins: number;
  source: 'channel' | 'history';
  /** Derived from this runner's history only. Draws count as played. Void matches are left out. */
  history: { played: number; wins: number; draws: number };
  /** Newest first, at most five; void matches are left out. */
  last5: FormLetter[];
  lastPlayedAt: number;
}

export interface ChannelForm {
  channel: string;
  chain: string;
  /** Matches in history (including void ones). */
  matches: number;
  /** Settled windows with one clear favourite (biggest pool at lock, more than zero, no tie for it). */
  favourite: { considered: number; won: number };
  entrants: EntrantForm[];
}

export function decide(m: HistoryMatch): Decision {
  for (let i = m.windows.length - 1; i >= 0; i--) {
    const w = m.windows[i]!;
    if (w.void || !w.winnerOutcomeId) continue;
    if (!w.outcomes.some((o) => o.entrantId)) continue;
    const o = w.outcomes.find((x) => x.id === w.winnerOutcomeId);
    return { void: false, winnerId: o?.entrantId ?? null, winnerOutcomeId: w.winnerOutcomeId, winnerLabel: o?.label };
  }
  return { void: true, winnerId: null };
}

/** Index of the single biggest pool, or -1 when nothing was bet or the top is shared. */
export function favouriteIndex(pools: number[]): number {
  let best = -1;
  let top = 0;
  let tied = false;
  pools.forEach((p, i) => {
    if (p > top) {
      top = p;
      best = i;
      tied = false;
    } else if (p === top && p > 0) tied = true;
  });
  return tied ? -1 : best;
}

function trimResult(r: unknown): unknown {
  if (r === undefined) return null;
  let s: string;
  try {
    s = JSON.stringify(r);
  } catch {
    return null;
  }
  if (s === undefined) return null;
  if (s.length <= MAX_RESULT_BYTES) return JSON.parse(s);
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { truncated: true };
  const out: Record<string, unknown> = { truncated: true };
  for (const [k, v] of Object.entries(r)) if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) out[k] = v;
  return out;
}

/** Builds a history entry from a finished match and its (final) windows. */
export function toHistoryMatch(match: MatchView, windows: WindowRec[], endedAt = Date.now()): HistoryMatch {
  return {
    matchId: match.matchId,
    title: match.title,
    entrants: match.entrants.map((e: Entrant) => {
      const h: HistoryEntrant = { id: String(e.id), name: String(e.name) };
      if (e.color) h.color = e.color;
      if (e.record && Number.isFinite(e.record.played) && Number.isFinite(e.record.wins))
        h.record = { played: e.record.played, wins: e.record.wins };
      return h;
    }),
    startedAt: match.startedAt,
    endedAt,
    result: trimResult(match.result),
    windows: windows.map((w) => {
      const settled = w.state === 'settled' && !!w.winnerOutcomeId;
      const h: HistoryWindow = {
        windowId: w.windowId,
        market: w.market,
        question: w.question,
        outcomes: w.outcomes.map((o) => (o.entrantId ? { id: o.id, label: o.label, entrantId: o.entrantId } : { id: o.id, label: o.label })),
        seeded: !!w.seeded,
        sealed: !!w.sealed,
        pools: [...w.pools],
        total: w.total,
        void: !settled,
      };
      if (settled) h.winnerOutcomeId = w.winnerOutcomeId;
      if (w.txs?.length) h.txs = capTxs(w.txs, MAX_HISTORY_TXS);
      return h;
    }),
  };
}

const looksLikeMatch = (m: any): m is HistoryMatch =>
  !!m &&
  typeof m === 'object' &&
  typeof m.matchId === 'string' &&
  Array.isArray(m.entrants) &&
  Array.isArray(m.windows) &&
  typeof m.startedAt === 'number' &&
  typeof m.endedAt === 'number';

export class History {
  readonly dir: string | null;
  readonly chainKind: string;
  private byChannel = new Map<string, HistoryMatch[]>();

  constructor(o: { dir?: string | null; chainKind: string }) {
    this.dir = o.dir ?? null;
    this.chainKind = o.chainKind;
  }

  fileFor(channel: string): string | null {
    if (!this.dir) return null;
    const safe = (s: string) => s.replace(/[^a-zA-Z0-9_.-]/g, '_');
    return join(this.dir, `${safe(this.chainKind)}-${safe(channel)}.json`);
  }

  /** Oldest first. Loads the channel's file on first use. */
  list(channel: string): HistoryMatch[] {
    let l = this.byChannel.get(channel);
    if (!l) {
      l = this.load(channel);
      this.byChannel.set(channel, l);
    }
    return l;
  }

  private load(channel: string): HistoryMatch[] {
    const file = this.fileFor(channel);
    if (!file) return [];
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      return []; // missing: start empty
    }
    try {
      const j = JSON.parse(raw);
      const arr = Array.isArray(j) ? j : j?.matches;
      if (!Array.isArray(arr)) throw new Error('not a list of matches');
      return arr.filter(looksLikeMatch).slice(-MAX_MATCHES);
    } catch (e) {
      log.warn(`[${channel}] history file unreadable, starting empty: ${(e as Error).message}`);
      return [];
    }
  }

  add(channel: string, m: HistoryMatch): void {
    const l = this.list(channel);
    l.push(m);
    if (l.length > MAX_MATCHES) l.splice(0, l.length - MAX_MATCHES);
    this.save(channel);
  }

  private save(channel: string) {
    const file = this.fileFor(channel);
    if (!file) return;
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      mkdirSync(this.dir!, { recursive: true });
      writeFileSync(tmp, JSON.stringify({ channel, chain: this.chainKind, matches: this.list(channel) }));
      renameSync(tmp, file);
    } catch (e) {
      // history is a nicety: never let the disk stop the show
      log.warn(`[${channel}] could not save history: ${(e as Error).message}`);
    }
  }

  /** Newest first, each with how it was decided and its total pot. */
  recent(channel: string, limit = 20) {
    const l = this.list(channel);
    const out = [];
    for (let i = l.length - 1; i >= 0 && out.length < limit; i--) {
      const m = l[i]!;
      out.push({ ...m, ...decisionFields(m), pot: m.windows.reduce((s, w) => s + w.total, 0) });
    }
    return out;
  }

  /** Per-entrant form. `current` = the match on air now (its announced records are the freshest). */
  form(channel: string, current?: MatchView | null): ChannelForm {
    return deriveForm(channel, this.chainKind, this.list(channel), current ?? null);
  }
}

function decisionFields(m: HistoryMatch) {
  const d = decide(m);
  const o: { void: boolean; winnerId: string | null; winnerOutcomeId?: string; winnerLabel?: string } = { void: d.void, winnerId: d.winnerId };
  if (d.winnerOutcomeId) o.winnerOutcomeId = d.winnerOutcomeId;
  if (d.winnerLabel !== undefined) o.winnerLabel = d.winnerLabel;
  return o;
}

/** Pure: form from a channel's history (oldest first). */
export function deriveForm(channel: string, chain: string, matches: HistoryMatch[], current: MatchView | null): ChannelForm {
  type Acc = EntrantForm & { announced?: { at: number; record: { played: number; wins: number } } };
  const acc = new Map<string, Acc>();
  const get = (e: { id: string; name: string; color?: string }, at: number) => {
    let a = acc.get(e.id);
    if (!a) {
      a = { id: e.id, name: e.name, played: 0, wins: 0, source: 'history', history: { played: 0, wins: 0, draws: 0 }, last5: [], lastPlayedAt: 0 };
      acc.set(e.id, a);
    }
    if (at >= a.lastPlayedAt) {
      a.name = e.name;
      if (e.color) a.color = e.color;
    }
    return a;
  };
  const decided: { at: number; ids: string[]; winnerId: string | null }[] = [];
  let considered = 0;
  let won = 0;

  for (const m of matches) {
    for (const w of m.windows) {
      if (w.void || !w.winnerOutcomeId) continue;
      const f = favouriteIndex(w.pools);
      if (f < 0) continue;
      considered++;
      if (w.outcomes[f]?.id === w.winnerOutcomeId) won++;
    }
    const d = decide(m);
    for (const e of m.entrants) {
      const a = get(e, m.startedAt);
      if (e.record && (!a.announced || m.startedAt >= a.announced.at)) a.announced = { at: m.startedAt, record: e.record };
      if (d.void) continue;
      a.history.played++;
      const letter: FormLetter = d.winnerId === null ? 'D' : d.winnerId === e.id ? 'W' : 'L';
      if (letter === 'W') a.history.wins++;
      if (letter === 'D') a.history.draws++;
      a.last5 = [letter, ...a.last5].slice(0, 5);
      a.lastPlayedAt = Math.max(a.lastPlayedAt, m.endedAt);
    }
    if (!d.void) decided.push({ at: m.startedAt, ids: m.entrants.map((e) => e.id), winnerId: d.winnerId });
  }
  if (current)
    for (const e of current.entrants) {
      const a = get({ id: String(e.id), name: String(e.name), color: e.color }, current.startedAt);
      if (e.record && Number.isFinite(e.record.played) && Number.isFinite(e.record.wins) && (!a.announced || current.startedAt >= a.announced.at))
        a.announced = { at: current.startedAt, record: { played: e.record.played, wins: e.record.wins } };
    }

  const entrants: EntrantForm[] = [];
  for (const a of acc.values()) {
    if (a.announced) {
      // The record a channel announces is from before that match: add what history saw from then on.
      let { played, wins } = a.announced.record;
      for (const d of decided)
        if (d.at >= a.announced.at && d.ids.includes(a.id)) {
          played++;
          if (d.winnerId === a.id) wins++;
        }
      a.played = played;
      a.wins = wins;
      a.source = 'channel';
    } else {
      a.played = a.history.played;
      a.wins = a.history.wins;
    }
    const { announced: _drop, ...out } = a;
    entrants.push(out);
  }
  entrants.sort((x, y) => y.played - x.played || y.wins - x.wins || x.name.localeCompare(y.name));
  return { channel, chain, matches: matches.length, favourite: { considered, won }, entrants };
}
