export interface Clock {
  virtual: boolean;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
  sleep(ms: number): Promise<void>;
  advance?(ms: number): Promise<void>;
}
export function realClock(): Clock;
export function virtualClock(start?: number): Clock & { advance(ms: number): Promise<void>; pending(): number };
