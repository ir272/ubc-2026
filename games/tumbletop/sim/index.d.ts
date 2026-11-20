// Types for the parts of the simulation the adapter uses. The simulation itself is plain JS.
export interface SimEvent { type: string; at: number; data?: unknown }
export interface RoundResult {
  round: number;
  order: { id: string; place: number; status: string; finishTime: number | null }[];
  qualified: string[];
  eliminated: string[];
  notes: { entrantId: string; text: string }[];
  winnerId: string;
  times: Record<string, number>;
  hash: string;
  ticks: number;
  raceMs: number;
  timedOut: boolean;
  cutChanges: number;
  lateCutChanges: number;
}
export function simulate(a: { seed: string | number; entrants: (string | { id: string })[]; options?: { round?: number } }): { durationMs: number; events: SimEvent[]; result: RoundResult };
export function simulateShow(a: { seeds: (string | number)[]; entrants: (string | { id: string })[] }): { rounds: { durationMs: number; events: SimEvent[]; result: RoundResult }[]; winnerId: string; durationMs: number };
export function seedToUint32(seed: string | number): number;
export function showSeeds(base: string | number): number[];
export const ROSTER: { id: string; num: number; name: string; colors: [string, string]; pattern: string; stats: Record<string, number>; trait: string; topStat: string }[];
export const ROUNDS: { index: number; key: string; name: string; place: string; blurb: string; starters: number; qualify: number }[];
export const ROUND_COUNT: number;
export const TICK_RATE: number;
export function createSim(o?: { seed?: number; round?: number; entrants?: string[] | null; lobby?: boolean }): any;
