// Types for script.js, so the runner's typecheck can read the adapter. Keep in step with script.js.

import type { Show } from '../../../../runner/src/types.ts';
import type { Bot } from './bots.js';
import type { Form, MatchResult } from './store.js';

export const SLOTS: string[];
export const WHO_WINS: string;

export interface MatchCtx {
  matchId: string;
  matchNo: number;
  /** The two bots, each with its brain attached. */
  bots: (Bot & { brain: unknown })[];
  /** Entrant ids in walk-on order. */
  order: string[];
  form: Record<string, Form>;
  handicap?: { entrantId: string; amount: number } | null;
  simHash?: string;
  /** False only in the harness, where a whole match runs on a virtual clock. */
  live?: boolean;
  clock?: unknown;
  seedInt(): number;
  onAttempt?(record: unknown, state: unknown): void;
  onDone?(result: MatchResult): void;
}

export function runMatch(show: Show, ctx: MatchCtx): Promise<MatchResult>;
export function movesFor(...args: unknown[]): unknown;
