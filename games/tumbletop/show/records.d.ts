export interface GumbleRecord { played: number; wins: number; finals: number; form: string[] }
export type Records = Record<string, GumbleRecord>;
export function emptyRecords(): Records;
export function normaliseRecords(loaded: unknown): Records;
export function applyShow(records: Records, show: { entrants: string[]; rounds: { qualified: string[] }[]; winnerId: string }): Records;
export function pickEntrants(records: Records, rand: () => number, count?: number): string[];
