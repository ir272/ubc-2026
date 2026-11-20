// makeBrain(kind, deps): the scripted brain, or the model brain with the scripted one as fallback.
// The model brain lives in ./model.ts (another builder); if it cannot be imported, log once and
// play scripted.

import type { Bot, Brain, Decks } from '../types.ts';
import type { Rng } from '../draw.ts';
import { createScriptedBrain, type ScriptedBrain } from './scripted.ts';

export type BrainKind = 'scripted' | 'model';

export interface BrainDeps {
  decks: Decks;
  roster: Bot[];
  rng?: Rng;
  usedPath?: string;
  bankDir?: string;
  budgetUsd?: number;
  log?: (s: string) => void;
  /** reuse an existing scripted brain as the fallback */
  fallback?: ScriptedBrain;
}

export interface Brains {
  brain: Brain;
  /** always scripted: used for timeouts, failed checks and as the model's fallback */
  fallback: ScriptedBrain;
  kind: BrainKind;
}

let warned = false;

export async function makeBrains(kind: BrainKind, deps: BrainDeps): Promise<Brains> {
  const fallback =
    deps.fallback ??
    createScriptedBrain({ decks: deps.decks, rng: deps.rng, usedPath: deps.usedPath, bankDir: deps.bankDir, log: deps.log });
  if (kind !== 'model') return { brain: fallback, fallback, kind: 'scripted' };
  try {
    const mod = (await import('./model.ts')) as {
      createModelBrain?: (o: { roster: Bot[]; decks: Decks; fallback: Brain; budgetUsd?: number; log?: (s: string) => void }) => Brain;
    };
    if (typeof mod.createModelBrain !== 'function') throw new Error('model.ts has no createModelBrain export');
    const brain = mod.createModelBrain({ roster: deps.roster, decks: deps.decks, fallback, budgetUsd: deps.budgetUsd, log: deps.log });
    return { brain, fallback, kind: 'model' };
  } catch (e) {
    if (!warned) {
      warned = true;
      (deps.log ?? console.warn)(`model brain unavailable (${(e as Error).message}); playing scripted`);
    }
    return { brain: fallback, fallback, kind: 'scripted' };
  }
}

/** The brain alone (see makeBrains for the fallback too). */
export async function makeBrain(kind: BrainKind, deps: BrainDeps): Promise<Brain> {
  return (await makeBrains(kind, deps)).brain;
}
