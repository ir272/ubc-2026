// The Scrivener: channel adapter for the Arena runner (see runner/src/channels/coinflip.ts).
//
// One match = the call, the choosing (both models build a loadout from random offers, the boss
// rolls a temper), the tape (first betting window), the fight (alternating attempts, a window
// before each and after each pair), the verdict. The whole show is `src/show/script.js`; this
// file only wires it to the runner: bots from bots.json, brains, records, the sim hash.
//
// Add to runner/src/index.ts:
//   import scrivener from '../../games/scrivener/channel.ts';
//   scrivener: () => scrivener(),

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { ChannelDef, Show } from '../../runner/src/types.ts';
import { runMatch } from './src/show/script.js';
import { createStore } from './src/show/store.js';
import { normaliseBots, pairFor } from './src/show/bots.js';
import { createBrain } from './src/brains/index.js';
export { simulate } from './src/show/replay.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** sha256 over the simulation sources: names the exact sim a seeded window was played with. */
function simHash(): string {
  const h = createHash('sha256');
  const dirs = ['src/core', 'src/sim', 'src/ai'];
  for (const d of dirs) {
    const dir = path.join(HERE, d);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
      h.update(`${d}/${f}\n`);
      h.update(readFileSync(path.join(dir, f)));
    }
  }
  h.update(readFileSync(path.join(HERE, 'src/show/rules.js')));
  return h.digest('hex');
}
export const SIM_HASH = simHash();

/** Reads KEY=value lines from games/scrivener/.env without touching process.env or logging anything. */
function readEnvFile(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(path.join(HERE, '.env'), 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env: mock brains */
  }
  return out;
}

export interface ScrivenerChannelOpts {
  id?: string;
  title?: string;
  /** Force scripted brains (no model calls). Also on when SCRIVENER_MOCK=1 or no key is found. */
  mock?: boolean;
  /** Path to the bot configs. Default: games/scrivener/bots.json. */
  botsFile?: string;
  /** Where records and bot memories are kept. Default: games/scrivener/.cache/records.json. */
  recordsFile?: string;
  /**
   * Starting-health cut for the favourite, 0..0.4. A number applies to whichever bot has the
   * better record; a function lets the platform decide from its own ratings.
   */
  handicap?: number | ((a: BotForm, b: BotForm) => { entrantId: string; amount: number } | null);
  intermissionMs?: number;
  /** Real-model spend cap in US dollars for this process. Default: BRAIN_BUDGET_USD or 1.50. */
  budgetUsd?: number;
}

export interface BotForm {
  id: string;
  name: string;
  record: { played: number; wins: number };
}

export default function scrivenerChannel(o: ScrivenerChannelOpts = {}): ChannelDef {
  const env = { ...readEnvFile(), ...process.env } as Record<string, string | undefined>;
  const bots = normaliseBots(JSON.parse(readFileSync(o.botsFile ?? path.join(HERE, 'bots.json'), 'utf8')));
  const store = createStore(o.recordsFile ?? path.join(HERE, '.cache', 'records.json'));
  const apiKey = env.OPENROUTER_API_KEY || '';
  const mock = o.mock ?? (env.SCRIVENER_MOCK === '1' || !apiKey);
  const brainEnv = {
    mock,
    apiKey,
    budgetUsd: o.budgetUsd ?? Number(env.BRAIN_BUDGET_USD || 1.5),
    costFile: path.join(HERE, '.cache', 'cost.json'),
    elevenKey: env.ELEVENLABS_API_KEY || '',
    audioDir: path.join(HERE, '.cache', 'audio'),
  };
  const brains = new Map<string, unknown>();

  const favourite = (a: BotForm, b: BotForm) => {
    if (typeof o.handicap === 'function') return o.handicap(a, b);
    const amount = Math.max(0, Math.min(0.4, Number(o.handicap) || 0));
    if (!amount) return null;
    const rate = (x: BotForm) => (x.record.played ? x.record.wins / x.record.played : 0.5);
    if (rate(a) === rate(b)) return null;
    return { entrantId: rate(a) > rate(b) ? a.id : b.id, amount };
  };

  return {
    id: o.id ?? 'scrivener',
    title: o.title ?? 'Inkelton', // the name viewers see (Ian, 2026-11-20); the channel id stays `scrivener`
    intermissionMs: o.intermissionMs ?? 3000,
    async run(show: Show) {
      const matchNo = store.nextMatchNo();
      const pair = pairFor(bots, matchNo);
      const ids = pair.map((b: { id: string }) => b.id);
      const form = store.form(ids);
      const withBrains = [];
      for (const b of pair) {
        if (!brains.has(b.id)) brains.set(b.id, await createBrain(b, { ...brainEnv, seed: randomBytes(4).readUInt32LE(0) }));
        withBrains.push({ ...b, brain: brains.get(b.id) });
      }
      const [fa, fb] = pair.map((b: { id: string; name: string }) => ({ id: b.id, name: b.name, record: form[b.id]!.record }));
      await runMatch(show, {
        matchId: `scrivener-${matchNo}-${Date.now().toString(36)}`,
        matchNo,
        bots: withBrains,
        order: ids,
        form,
        handicap: favourite(fa!, fb!),
        simHash: SIM_HASH,
        live: true,
        clock: (show as { clock?: unknown }).clock || undefined,
        seedInt: () => randomBytes(4).readUInt32LE(0),
        onDone: (result) => store.record(result, ids),
      });
    },
  };
}
