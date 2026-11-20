// One running show: roster, decks, brains, memory, cast rotation. The channel and every tool build
// their episodes through this, so they all behave the same.

import type { Show } from '../../../runner/src/types.ts';
import type { Bot, Decks } from './types.ts';
import { loadDecks, MEMORY_JSON, USED_JSON } from './paths.ts';
import { loadRoster } from './roster.ts';
import { castFromIds, castIds, pickCast, type Cast } from './cast.ts';
import { MemoryStore } from './memory.ts';
import { freshRng, type Rng } from './draw.ts';
import { makeBrains, type BrainKind, type Brains } from './brains/index.ts';
import { runEpisode, type Transcript } from './episode.ts';

export interface SessionOpts {
  brains?: BrainKind;
  budgetUsd?: number;
  /** 'persist' = .cache/memory.json read and written; 'readonly' = read it, never write; 'fresh' = empty */
  memory?: 'persist' | 'readonly' | 'fresh';
  /** LRU file for bank lines; null keeps it in memory */
  usedPath?: string | null;
  bankDir?: string;
  /** a fixed roster (tests) instead of bots.json / personas */
  roster?: Bot[];
  /** test seed: post-lock randomness, cast and scripted picks become deterministic */
  seed?: string;
  waitCapMs?: number;
  callTimeoutMs?: number;
  log?: (s: string) => void;
}

export interface Session {
  decks: Decks;
  brains: Brains;
  memory: MemoryStore;
  rng: Rng;
  roster(): Bot[];
  /** the cast of the next episode to run */
  upcoming(): Cast;
  runOne(show: Show): Promise<Transcript>;
}

export async function createSession(o: SessionOpts = {}): Promise<Session> {
  const log = o.log ?? ((s: string) => console.log(`[dating] ${s}`));
  const decks = loadDecks();
  const rng = freshRng(o.seed);
  const memory =
    o.memory === 'persist' ? new MemoryStore(MEMORY_JSON) : o.memory === 'fresh' ? new MemoryStore(null) : MemoryStore.readOnlyCopy(MEMORY_JSON);
  // re-read every episode: personas, bots.json and models.json may change while the show runs
  let logged = false;
  const roster = () => o.roster ?? loadRoster({ log: logged ? undefined : ((logged = true), log) });
  const usedPath = o.usedPath === undefined ? (o.seed ? undefined : USED_JSON) : (o.usedPath ?? undefined);
  const brains = await makeBrains(o.brains ?? 'scripted', {
    decks,
    roster: roster(),
    rng: o.seed ? rng : undefined,
    usedPath,
    bankDir: o.bankDir,
    budgetUsd: o.budgetUsd,
    log,
  });
  const upcoming = (): Cast => {
    const r = roster();
    return castFromIds(r, memory.data.upcoming) ?? pickCast(r, memory.data.lastCast, rng);
  };
  return {
    decks,
    brains,
    memory,
    rng,
    roster,
    upcoming,
    async runOne(show: Show) {
      const r = roster();
      const cast = upcoming();
      const next = pickCast(r, castIds(cast), rng);
      return runEpisode(show, {
        decks,
        brain: brains.brain,
        fallback: brains.fallback,
        memory,
        cast,
        next,
        rng,
        waitCapMs: o.waitCapMs,
        callTimeoutMs: o.callTimeoutMs,
        log,
      });
    },
  };
}
