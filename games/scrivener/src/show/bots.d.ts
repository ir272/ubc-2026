// Types for bots.js, so the runner's typecheck can read the adapter. Keep in step with bots.js.

export interface Bot {
  id: string;
  name: string;
  /** Any OpenRouter model id, or 'mock' for a scripted mind. */
  model: string;
  instructions: string;
  look: { accent: string; [key: string]: unknown };
  voice: unknown;
}

export function normaliseBots(list: unknown): Bot[];
export function pairings(bots: Bot[]): [Bot, Bot][];
export function pairFor(bots: Bot[], matchNo: number): [Bot, Bot];
export function modelLabel(model: string): string;
