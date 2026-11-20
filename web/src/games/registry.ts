// ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
// │ GAME REGISTRY — the one place a game is plugged into the website.                             │
// │                                                                                              │
// │ Key = the runner's channel id (or the `game` field of match.meta, checked second).           │
// │ A real game lives in the repo's games/<id>/ folder and exports                               │
// │   mount(el, { assetsBase }) → GameHandle            (see ./types.ts, CONTRACT.md §4)          │
// │ and is added here like:                                                                      │
// │   kart: { load: () => import('@games/kart/index.ts'), assetsBase: '/games/kart/' },          │
// │ (`@games` is an alias for ../games, set in vite.config.ts.)                                  │
// └──────────────────────────────────────────────────────────────────────────────────────────────┘
import type { GameModule } from './types';

export interface GameEntry {
  load: () => Promise<GameModule>;
  /** passed to mount() as opts.assetsBase; default `/games/<id>/` (serve files from web/public/games/<id>/) */
  assetsBase?: string;
}

export const GAMES: Record<string, GameEntry> = {
  // Built-in placeholder renderers for the runner's demo channels.
  coinflip: { load: () => import('./builtin/coinflip') },
  'dice-duel': { load: () => import('./builtin/diceduel') },
  // Real games, each in games/<id>/.
  tumbletop: { load: () => import('@games/tumbletop/index.ts'), assetsBase: '/games/tumbletop/' },
  scrivener: { load: () => import('@games/scrivener/index.ts'), assetsBase: '/games/scrivener/' },
  brawl: { load: () => import('@games/brawl/index.ts'), assetsBase: '/games/brawl/' },
};

const FALLBACK: GameEntry = { load: () => import('./builtin/fallback') };

export function findGame(channelId: string, meta?: { game?: string } | null): { id: string; entry: GameEntry } {
  if (GAMES[channelId]) return { id: channelId, entry: GAMES[channelId]! };
  const g = meta?.game;
  if (g && GAMES[g]) return { id: g, entry: GAMES[g]! };
  return { id: 'fallback', entry: FALLBACK };
}
