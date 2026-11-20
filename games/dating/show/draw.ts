// Seeded randomness. sfc32 from a hex seed, the sealed type draw, and small helpers.
// The draw is the only thing derived from the sealed value of window A (see SPEC "Hidden and sealed").

import { createHash, randomBytes } from 'node:crypto';
import type { Decks, TypeCard, TypeDraw } from './types.ts';

export type Rng = () => number;

/** sfc32 seeded from the first 128 bits of a hex string (shorter input is hashed first). Floats in [0, 1). */
export function sfc32(seedHex: string): Rng {
  let hex = String(seedHex ?? '').toLowerCase();
  if (!/^[0-9a-f]{32,}$/.test(hex)) hex = createHash('sha256').update(hex).digest('hex');
  let a = parseInt(hex.slice(0, 8), 16) >>> 0;
  let b = parseInt(hex.slice(8, 16), 16) >>> 0;
  let c = parseInt(hex.slice(16, 24), 16) >>> 0;
  let d = parseInt(hex.slice(24, 32), 16) >>> 0;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}

export function randomHex(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** Hash any string to a 64-char hex (used to derive sub-seeds from a test seed). */
export function hexOf(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** A fresh post-lock rng: crypto random unless a seed is given (tests, --seed). */
export function freshRng(seed?: string): Rng {
  return sfc32(seed ? hexOf(seed) : randomHex());
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length]!;
}

export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Weighted pick: weights need not sum to 1. */
export function weighted<T>(rng: Rng, items: readonly [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r < 0) return v;
  }
  return items[items.length - 1]![0];
}

// ------------------------------------------------------------------------------------------
// Cast affinity: which cards tonight's suitors naturally play (SPEC "Hidden and sealed")
// ------------------------------------------------------------------------------------------

/** suitorId -> cardId -> share of that suitor's bank lines tagged with the card (0..1). */
export type CastAffinity = Record<string, Record<string, number>>;

/**
 * How many top tags make a suitor a card's natural owner. Five (show/FORMAT2.md "Signature cards"):
 * each suitor's five most-tagged cards are their signature, so the whole deck of 24 is in play.
 */
export const TOP_TAGS = 5;
/** How much an owner adds to a card's weight, by the card's place in their top tags (first to fifth). */
export const RANK_WEIGHT = [1, 1, 0.8, 0.6, 0.4];
/** The hidden cards' weights are raised to this power: the cards the cast plays most are the ones hidden. */
export const HIDDEN_PULL = 4;
/** Weight of a card no suitor on stage owns, so every card can still appear. */
export const CARD_FLOOR = 0.25;

/** Every authored line in a bank (any object with a string `t`, at any depth), in file order. */
export function bankLines(bank: unknown): { t: string; tags?: string[] }[] {
  const out: { t: string; tags?: string[] }[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      const l = x as { t?: unknown; tags?: unknown };
      if (typeof l.t === 'string') out.push({ t: l.t, tags: Array.isArray(l.tags) ? l.tags.filter((s) => typeof s === 'string') : undefined });
      else Object.values(x).forEach(walk);
    }
  };
  walk(bank);
  return out;
}

/**
 * The parts of a suitor bank that make its affinity (FORMAT2 "Signature cards"): answers, solo twists
 * and one-on-one openers. Roasts, wingman lines, jabs and steals are trash talk by format and do not
 * count, though the star still reacts to them.
 */
export const SCORED_SECTIONS = ['answers', 'twists (solo)', 'oneOnOne.open'] as const;

/** The lines that make a suitor's affinity: answers, twists for solo-format twist cards, one-on-one openers. */
export function scoredLines(bank: unknown, decks?: Decks): { t: string; tags?: string[] }[] {
  const b = (bank ?? {}) as Record<string, unknown>;
  const oo = (b.oneOnOne ?? {}) as Record<string, unknown>;
  const solo = decks ? new Set(decks.twists.filter((t) => t.format === 'solo').map((t) => t.id)) : null;
  const tw = (b.twists ?? {}) as Record<string, unknown>;
  const twists = Object.entries(tw).filter(([id]) => !solo || solo.has(id)).map(([, v]) => v);
  return [b.answers, twists, oo.open].flatMap((x) => bankLines(x));
}

/**
 * cardId -> share of the suitor's scored lines (SCORED_SECTIONS) tagged with it. Only deck cards;
 * a missing bank gives {}.
 */
export function bankAffinity(bank: unknown, decks: Decks): Record<string, number> {
  const lines = scoredLines(bank, decks);
  const out: Record<string, number> = {};
  if (!lines.length) return out;
  for (const c of decks.cards) {
    const n = lines.filter((l) => l.tags?.includes(c.id)).length;
    if (n) out[c.id] = n / lines.length;
  }
  return out;
}

/** A suitor's top tags: highest share first, ties in deck order, only shares above zero, at most `n`. */
export function topTags(aff: Record<string, number> | undefined, decks: Decks, n = TOP_TAGS): string[] {
  const order = new Map(decks.cards.map((c, i) => [c.id, i]));
  return Object.entries(aff ?? {})
    .filter(([id, v]) => v > 0 && order.has(id))
    .sort((a, b) => b[1] - a[1] || order.get(a[0])! - order.get(b[0])!)
    .slice(0, n)
    .map(([id]) => id);
}

/** cardId -> ids of tonight's suitors who have it among their top tags. */
export function owners(cast: CastAffinity, decks: Decks): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of decks.cards) out[c.id] = [];
  for (const id of Object.keys(cast).sort()) for (const t of topTags(cast[id], decks)) out[t]!.push(id);
  return out;
}

/**
 * Rebuilds an affinity that gives exactly these top tags (the draw depends on nothing else), so the
 * draw can be recomputed from the published top tags (match_end result `topTags`).
 */
export function affinityFromTopTags(top: Record<string, string[]>): CastAffinity {
  return Object.fromEntries(Object.entries(top).map(([id, tags]) => [id, Object.fromEntries(tags.map((t, i) => [t, 1 - i / 100]))]));
}

/**
 * The star's hidden type and the twist, from the sealed hex of window A.
 * slot 0 = face-up turn-on, slot 1 = hidden turn-on, slot 2 = hidden dealbreaker.
 *
 * Weighted by the cast (public before window A opens), so the draw stays recomputable:
 * 1. owners(card) = tonight's suitors with the card among their top TOP_TAGS (5) tags (bankAffinity, topTags).
 * 2. weight(card) = CARD_FLOOR + the sum over its owners of RANK_WEIGHT[the card's place in their top tags]
 *    (1, 1, 0.8, 0.6, 0.4 for first to fifth).
 * 3. Every ordered triple (a, b, c) of distinct cards, a, b and c each walked in deck order, is a
 *    candidate. Keep those where slot 1 and slot 2 each have 1 to 3 owners and no suitor owns both
 *    slot 0 and slot 1. If none qualifies (or no castAffinity is given), every triple is a candidate.
 * 4. A triple's weight is weight(a) * weight(b)^HIDDEN_PULL * weight(c)^HIDDEN_PULL (HIDDEN_PULL = 4). One rng() draw r picks the triple whose
 *    cumulative weight first exceeds r * total, in enumeration order.
 * 5. The twist is pick(rng, decks.twists) with the next rng() draw.
 * Same sealed + same decks + same cast affinity = same draw, anywhere.
 */
export function draw(sealedHex: string, decks: Decks, castAffinity?: CastAffinity): TypeDraw {
  const rng = sfc32(sealedHex);
  const cards = decks.cards;
  if (cards.length < 3) throw new Error('decks need at least 3 type cards');
  if (!decks.twists.length) throw new Error('decks need at least one twist');
  const own = castAffinity ? owners(castAffinity, decks) : null;
  // an owner counts by how high the card sits in their top tags (RANK_WEIGHT): a signature card they
  // play constantly pulls harder than their fifth
  const rankOf = (id: string, card: string) => topTags(castAffinity![id], decks).indexOf(card);
  const w = cards.map((c) => (own ? own[c.id]!.reduce((sum, id) => sum + (RANK_WEIGHT[rankOf(id, c.id)] ?? 0), 0) : 0) + CARD_FLOOR);
  const ok = (a: number, b: number, c: number): boolean => {
    if (!own) return true;
    const o0 = own[cards[a]!.id]!, o1 = own[cards[b]!.id]!, o2 = own[cards[c]!.id]!;
    if (o1.length < 1 || o1.length > 3 || o2.length < 1 || o2.length > 3) return false;
    return !o0.some((id) => o1.includes(id));
  };
  const collect = (strict: boolean) => {
    const out: { t: [number, number, number]; w: number }[] = [];
    for (let a = 0; a < cards.length; a++)
      for (let b = 0; b < cards.length; b++)
        for (let c = 0; c < cards.length; c++) {
          if (a === b || b === c || a === c) continue;
          if (strict && !ok(a, b, c)) continue;
          out.push({ t: [a, b, c], w: w[a]! * w[b]! ** HIDDEN_PULL * w[c]! ** HIDDEN_PULL });
        }
    return out;
  };
  let triples = collect(true);
  if (!triples.length) triples = collect(false);
  const total = triples.reduce((s, x) => s + x.w, 0);
  let r = rng() * total;
  let chosen = triples[triples.length - 1]!.t;
  for (const x of triples) {
    r -= x.w;
    if (r < 0) {
      chosen = x.t;
      break;
    }
  }
  const twist = pick(rng, decks.twists);
  return { cards: chosen.map((i) => cards[i]!) as [TypeCard, TypeCard, TypeCard], twist };
}
