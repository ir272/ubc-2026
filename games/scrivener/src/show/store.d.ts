// Types for store.js, so the runner's typecheck can read the adapter. Keep in step with store.js.

export interface Tally {
  played: number;
  wins: number;
}

export interface Form {
  record: Tally;
  vsBoss: { tries: number; kills: number; avg: number };
  byClass: Record<string, Tally>;
  h2h: Tally;
  memory: string[];
  last: Record<string, string> | null;
}

/** What a finished match hands to `record`: the result object runMatch builds. */
export interface MatchResult {
  winnerId: string;
  how?: string | null;
  matchNo?: number;
  loadouts: Record<string, Record<string, string> | undefined>;
  attempts?: { entrantId: string; result: string; score: number }[];
  notes?: Record<string, string[] | undefined>;
  [key: string]: unknown;
}

export interface Store {
  nextMatchNo(): number;
  form(ids: string[]): Record<string, Form>;
  record(result: MatchResult, ids: string[]): void;
  data(): unknown;
}

export function createStore(file?: string): Store;
