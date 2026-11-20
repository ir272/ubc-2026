// Node-only side of the brains: .env loading, the cost log file, and choosing real or mock
// brains. Used by channel.ts and the tools; never imported by the browser build.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Brains, CostEntry, CostLedger } from './brains.ts';
import { createOpenRouterBrains, mockBrains } from './brains.ts';

/** games/brawl */
export const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Reads KEY=VALUE lines from <dir>/.env into process.env (existing values win). Never logs values. */
export function loadEnv(dir: string = GAME_DIR): void {
  const file = join(dir, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2]!;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]!] === undefined) process.env[m[1]!] = v;
  }
}

export interface CostFile {
  totalUsd: number;
  calls: CostEntry[];
}

/** The cost log at <dir>/.cache/cost.json: every real call with tokens and cost, kept across runs. */
export function fileLedger(path: string = join(GAME_DIR, '.cache', 'cost.json')): CostLedger & { read(): CostFile } {
  const read = (): CostFile => {
    try {
      const j = JSON.parse(readFileSync(path, 'utf8')) as CostFile;
      if (Array.isArray(j.calls)) return { totalUsd: Number(j.totalUsd) || 0, calls: j.calls };
    } catch {
      /* missing or broken: start fresh */
    }
    return { totalUsd: 0, calls: [] };
  };
  let data = read();
  return {
    read: () => data,
    total: () => data.totalUsd,
    add(e) {
      data = read(); // another process may have written since
      data.calls.push(e);
      data.totalUsd = Math.round((data.totalUsd + (e.costUsd || 0)) * 1e8) / 1e8;
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(data, null, 1));
      renameSync(tmp, path);
    },
  };
}

export interface BrainChoice {
  brains: Brains;
  mode: 'real' | 'mock';
  /** why this mode, for one log line (never contains the key) */
  reason: string;
  /** true while answers really come from the models named in bots.json (false on mock brains
   *  and once the budget is spent). The channel uses it so the stage never names a model that
   *  is not playing. */
  live(): boolean;
}

/**
 * Real brains when OPENROUTER_API_KEY is set and BRAWL_MOCK is not '1' (and `mock` is not forced),
 * else mock brains. Real brains fall back to mock once BRAWL_BUDGET_USD (default 1.50) is spent.
 */
export function createBrains(o: {
  rand: () => number;
  sleep: (ms: number) => Promise<void>;
  coaches?: [string, string];
  mock?: boolean;
  fetch?: typeof fetch;
  ledgerPath?: string;
  log?: (msg: string) => void;
}): BrainChoice {
  const mock = mockBrains({ rand: o.rand, sleep: o.sleep, coaches: o.coaches });
  const key = process.env.OPENROUTER_API_KEY ?? '';
  if (o.mock) return { brains: mock, mode: 'mock', reason: 'mock requested', live: () => false };
  if (process.env.BRAWL_MOCK === '1') return { brains: mock, mode: 'mock', reason: 'BRAWL_MOCK=1', live: () => false };
  if (!key) return { brains: mock, mode: 'mock', reason: 'no OPENROUTER_API_KEY', live: () => false };
  const budgetUsd = Number(process.env.BRAWL_BUDGET_USD ?? '1.5') || 1.5;
  const ledger = fileLedger(o.ledgerPath);
  const brains = createOpenRouterBrains({
    apiKey: key,
    fetch: o.fetch,
    ledger,
    budgetUsd,
    mock,
    rand: o.rand,
    onRefused: (err) => o.log?.(`ringout: OpenRouter refused the key (${err}), mock brains from here`),
    onBudgetSpent: (spent) => o.log?.(`ringout: model budget spent ($${spent.toFixed(4)} of $${budgetUsd.toFixed(2)}), mock brains from here`),
  });
  const spent = ledger.total();
  return {
    brains,
    mode: 'real',
    live: () => brains.live(),
    reason: `OpenRouter, $${spent.toFixed(4)} of $${budgetUsd.toFixed(2)} spent${spent >= budgetUsd ? ' (budget spent: mock answers)' : ''}`,
  };
}
