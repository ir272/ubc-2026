// Ringout channel for the runner (written like runner/src/channels/coinflip.ts).
//
//   runner/src/index.ts:  import brawlChannel from '../../games/brawl/channel.ts';
//                         brawl: () => brawlChannel(),
//
// One match = runMatch(show, deps) from src/show/script.ts. Two bots from bots.json per match,
// on a rotation so everyone plays. Records and three-line memories live in memory here.
// Real model minds when OPENROUTER_API_KEY is set (games/brawl/.env) and BRAWL_MOCK is not '1'.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChannelDef, Show } from '../../runner/src/types.ts';
import type { BotConfig } from './src/show/brains.ts';
import { createBrains, GAME_DIR, loadEnv } from './src/show/brains.node.ts';
import { DEFAULT_INTERMISSION_MS, runMatch } from './src/show/script.ts';

/** sha256 of the simulation source (src/sim/*.ts, by name): names the exact fight rules in the market. */
export const SIM_HASH = (() => {
  const dir = join(GAME_DIR, 'src', 'sim');
  const h = createHash('sha256');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts')).sort()) {
    h.update(f);
    h.update('\0');
    h.update(readFileSync(join(dir, f)));
    h.update('\0');
  }
  return h.digest('hex');
})();

export function loadBots(file = join(GAME_DIR, 'bots.json')): BotConfig[] {
  const list = JSON.parse(readFileSync(file, 'utf8')) as BotConfig[];
  const ok = list.filter((b) => b && typeof b.id === 'string' && typeof b.name === 'string' && typeof b.model === 'string');
  if (ok.length < 2) throw new Error('bots.json needs at least two bots with id, name and model');
  return ok.map((b) => ({ ...b, instructions: String(b.instructions ?? '') }));
}

/** Every pair once per cycle, shuffled, consecutive matches sharing a bot as rarely as possible. */
export function pairCycle(ids: string[], rand: () => number): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i]!, ids[j]!]);
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j]!, pairs[i]!];
  }
  const out: [string, string][] = [];
  let last: [string, string] | null = null;
  while (pairs.length) {
    let k = pairs.findIndex((p) => !last || (!p.includes(last[0]) && !p.includes(last[1])));
    if (k < 0) k = 0;
    const p = pairs.splice(k, 1)[0]!;
    if (rand() < 0.5) p.reverse();
    out.push(p);
    last = p;
  }
  return out;
}

export interface BrawlChannelOpts {
  id?: string;
  title?: string;
  intermissionMs?: number;
  /** force mock brains */
  mock?: boolean;
  /** use only these bot ids */
  bots?: string[];
}

export default function brawlChannel(o: BrawlChannelOpts = {}): ChannelDef {
  loadEnv();
  const intermissionMs = o.intermissionMs ?? (Number(process.env.BRAWL_INTERMISSION_MS) || DEFAULT_INTERMISSION_MS);
  const all = loadBots();
  const bots = o.bots?.length ? all.filter((b) => o.bots!.includes(b.id)) : all;
  const byId = new Map(bots.map((b) => [b.id, b]));
  const records: Record<string, { played: number; wins: number }> = {};
  const memories: Record<string, string[]> = {};
  const coaches = (process.env.BRAWL_COACHES ?? 'adaptive,adaptive').split(',').map((s) => s.trim()) as [string, string];
  const choice = createBrains({
    rand: Math.random,
    // mock think delays run on real time here; the Show's sleep is per match, so use a plain timer
    sleep: (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms))),
    coaches: [coaches[0] ?? 'adaptive', coaches[1] ?? coaches[0] ?? 'adaptive'],
    mock: o.mock,
    log: (m) => console.warn(m),
  });
  console.info(`ringout: ${bots.length} bots, ${choice.mode} brains (${choice.reason})`);

  let matchNo = 0;
  let queue: [string, string][] = [];

  const nextPair = (): [BotConfig, BotConfig] => {
    if (!queue.length) queue = pairCycle(bots.map((b) => b.id), Math.random);
    const [a, b] = queue.shift()!;
    return [byId.get(a)!, byId.get(b)!];
  };

  /** the favourite starts with damage: only once both have a few matches and a clear gap */
  const handicapFor = (a: BotConfig, b: BotConfig): [number, number] => {
    const ra = records[a.id];
    const rb = records[b.id];
    if (!ra || !rb || ra.played < 3 || rb.played < 3) return [0, 0];
    const gap = ra.wins / ra.played - rb.wins / rb.played;
    if (Math.abs(gap) < 0.25) return [0, 0];
    const dmg = Math.min(30, Math.round(Math.abs(gap) * 40));
    return gap > 0 ? [dmg, 0] : [0, dmg];
  };

  return {
    id: o.id ?? 'brawl',
    title: o.title ?? 'Blood Moon',
    intermissionMs,
    async run(show: Show) {
      const picked = nextPair();
      matchNo++;
      // never name a model that is not playing: on mock brains (no key, BRAWL_MOCK, budget spent)
      // the stage shows no model label at all (the owner: show nothing rather than a stand-in label)
      const live = choice.live();
      const pair = (live ? picked : picked.map((b) => ({ ...b, label: '' }))) as [BotConfig, BotConfig];
      await runMatch(show, {
        brains: choice.brains,
        bots: pair,
        matchNo,
        records,
        memories,
        random: Math.random,
        options: { handicap: handicapFor(pair[0], pair[1]), intermissionMs },
        simHash: SIM_HASH,
      });
    },
  };
}
