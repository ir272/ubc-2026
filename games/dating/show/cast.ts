// Cast rotation: 1 star and 4 suitors per episode. Never the previous star again; at most two of
// the previous suitors come back. Spots 0..3 are shuffled.

import type { Bot } from './types.ts';
import type { Rng } from './draw.ts';
import { shuffle } from './draw.ts';
import { stars, suitors } from './roster.ts';

export interface Cast {
  star: Bot;
  /** spot order, left to right as the viewer sees the row */
  suitors: Bot[];
}
export interface CastIds {
  star: string;
  suitors: string[];
}

export const castIds = (c: Cast): CastIds => ({ star: c.star.id, suitors: c.suitors.map((s) => s.id) });

/** Resolve saved ids against the roster; null if any id is gone. */
export function castFromIds(roster: Bot[], ids: CastIds | undefined | null): Cast | null {
  if (!ids) return null;
  const find = (id: string) => roster.find((b) => b.id === id);
  const star = find(ids.star);
  const sx = ids.suitors.map(find);
  if (!star || star.role !== 'star' || sx.length !== 4 || sx.some((s) => !s || s.role !== 'suitor')) return null;
  return { star, suitors: sx as Bot[] };
}

export function pickCast(roster: Bot[], prev: CastIds | null | undefined, rng: Rng): Cast {
  const allStars = stars(roster);
  const allSuitors = suitors(roster);
  if (!allStars.length || allSuitors.length < 4) throw new Error('roster needs 1 star and 4 suitors');
  const starPool = allStars.filter((s) => s.id !== prev?.star);
  const star = shuffle(rng, starPool.length ? starPool : allStars)[0]!;
  const prevIds = new Set(prev?.suitors ?? []);
  const returning = shuffle(rng, allSuitors.filter((s) => prevIds.has(s.id)));
  const fresh = shuffle(rng, allSuitors.filter((s) => !prevIds.has(s.id)));
  // at most two return; prefer one or two so storylines carry over
  const back = prev ? Math.min(returning.length, rng() < 0.5 ? 1 : 2) : 0;
  let chosen = [...returning.slice(0, back), ...fresh].slice(0, 4);
  if (chosen.length < 4) chosen = [...chosen, ...returning.slice(back)].slice(0, 4);
  return { star, suitors: shuffle(rng, chosen) };
}
