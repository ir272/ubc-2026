export function simulate(a: { seed: string | number; entrants: { id: string }[]; options?: unknown }): {
  durationMs: number;
  events: { type: string; at: number; data?: unknown }[];
  result: unknown;
};
