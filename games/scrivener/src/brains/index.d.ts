// Types for the brain factory, so the runner's typecheck can read the adapter. Keep in step with index.js.

export interface BrainEnv {
  mock?: boolean;
  apiKey?: string;
  seed?: number;
  budgetUsd?: number;
  costFile?: string;
  elevenKey?: string;
  audioDir?: string;
}

/** A mind for one bot: scripted or asked through OpenRouter. All four calls resolve, never throw. */
export interface Brain {
  kind: string;
  label: string;
  pick(a: unknown): Promise<{ choice: string; reason?: string; source: string; thinkMs?: number }>;
  decide(a: unknown): Promise<{ slot: number; line?: string; source: string; thinkMs?: number }>;
  note(a: unknown): Promise<{ text: string; source: string }>;
  say(a: unknown): Promise<{ text: string; source: string }>;
}

export function createBrain(bot: { id: string; model?: string }, env?: BrainEnv): Promise<Brain>;
