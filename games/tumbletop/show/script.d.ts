import type { Records } from './records.js';

export interface ShowTimings {
  callMs: number;
  betMs: number[];
  titleMs: number;
  cutMs: number;
  recapMs: number;
  finalCutMs: number;
  resultMs: number;
}
export const DEFAULT_TIMINGS: ShowTimings;
export const QUESTIONS: string[];
export function questionFor(round: number): string;

export interface ShowResult {
  winnerId: string;
  order: string[];
  entrants: string[];
  rounds: { round: number; seed: string; winnerId: string; qualified: string[]; eliminated: string[] }[];
}

/** The subset of the platform's Show that the script uses (runner/src/types.ts is assignable to it). */
export interface ShowLike {
  announce(match: { matchId: string; title: string; entrants: any[]; meta?: unknown }): void;
  openWindow(w: { question: string; outcomes: { id: string; label: string; entrantId?: string }[]; durationMs: number; seeded: boolean; simHash?: string }): Promise<any>;
  lock(win: any): Promise<{ seed?: string }>;
  emit(event: { type: string; at: number; data?: unknown }): void;
  settle(win: any, winnerOutcomeId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  end(result: unknown): void;
  elapsed(): number;
}

export function runShow(
  show: ShowLike,
  o: { entrants: string[]; records?: Records; simHash?: string; matchId: string; title?: string; timings?: Partial<ShowTimings>; intermissionMs?: number },
): Promise<ShowResult>;
export function toEntrants(ids: string[], records?: Records): { id: string; name: string; color: string; stats: Record<string, number>; record: { played: number; wins: number } }[];
export function showMeta(ids: string[], records?: Records, simHash?: string, timings?: ShowTimings): unknown;
