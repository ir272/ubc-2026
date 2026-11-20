// Standing, cut, pick and reveal-quote rules (SPEC "Standing, cuts and the pick").
// Pure functions: the episode feeds them scored lines and asks who goes.

import type { Mark, TypeDraw } from './types.ts';

export const MARK_SCORE: Record<Mark, number> = { charmed: 1, unsure: 0, cringing: -1 };
export const TURN_ON_HIT = 2;
export const DEALBREAKER_HIT = -3;
export const DUO_WEIGHT = 2;

/** One suitor line the star reacted to. */
export interface Scored {
  seq: number;
  who: string;
  name: string;
  text: string;
  mark: Mark;
  /** card ids this line showed (deduped, only ids among the three cards) */
  hits: string[];
  /** 1, or 2 for one-on-one reactions */
  weight: number;
  /** 0 = walk-on snap, 1 and 2 = the rounds, 3 = the one on one */
  round: 0 | 1 | 2 | 3;
  /** the line's hook (two to five words from it), when the bank gave one */
  hook?: string;
}

/** Keep only valid, distinct hits among the star's three cards. */
export function cleanHits(hits: unknown, draw: TypeDraw): string[] {
  const ids = draw.cards.map((c) => c.id);
  if (!Array.isArray(hits)) return [];
  const out: string[] = [];
  for (const h of hits) if (typeof h === 'string' && ids.includes(h) && !out.includes(h)) out.push(h);
  return out;
}

/**
 * Mark and hit coherence, for any brain: a dealbreaker hit is always `cringing`; a turn-on hit with
 * no dealbreaker hit is never `cringing` (it becomes `unsure`). `hits` must already be cleaned.
 */
export function coherentMark(mark: Mark, hits: string[], draw: TypeDraw): Mark {
  const db = draw.cards[2].id;
  if (hits.includes(db)) return 'cringing';
  const on = hits.some((h) => h === draw.cards[0].id || h === draw.cards[1].id);
  if (on && mark === 'cringing') return 'unsure';
  return mark;
}

/** Points one reacted line is worth. `ignore` drops one card (used to ask whether a card decided a cut). */
export function lineScore(s: { mark: Mark; hits: string[]; weight?: number }, draw: TypeDraw, ignore?: string): number {
  const dealbreaker = draw.cards[2].id;
  const turnOns = [draw.cards[0].id, draw.cards[1].id];
  let v = MARK_SCORE[s.mark] ?? 0;
  for (const h of new Set(s.hits)) {
    if (h === ignore) continue;
    if (h === dealbreaker) v += DEALBREAKER_HIT;
    else if (turnOns.includes(h)) v += TURN_ON_HIT;
  }
  return v * (s.weight ?? 1);
}

export type Standing = Record<string, number>;

export function standings(ids: string[], scored: Scored[], draw: TypeDraw, ignore?: string): Standing {
  const st: Standing = {};
  for (const id of ids) st[id] = 0;
  for (const s of scored) if (s.who in st) st[s.who]! += lineScore(s, draw, ignore);
  return st;
}

/** Ids tied for the lowest standing among `among`. */
export function lowest(st: Standing, among: string[]): string[] {
  const min = Math.min(...among.map((id) => st[id] ?? 0));
  return among.filter((id) => (st[id] ?? 0) === min);
}

/** Ids tied for the highest standing among `among`. */
export function highest(st: Standing, among: string[]): string[] {
  const max = Math.max(...among.map((id) => st[id] ?? 0));
  return among.filter((id) => (st[id] ?? 0) === max);
}

/** The cut: one id if decided by standing, or the tied ids for brain.choose. */
export function cutCandidates(st: Standing, alive: string[]): string[] {
  return lowest(st, alive);
}

/** The pick between two finalists: one id, or both when tied. */
export function pickCandidates(st: Standing, finalists: string[]): string[] {
  return highest(st, finalists);
}

/** Which cards decided a cut: without that card's hits, the cut suitor would not be the lone lowest. */
export function decidingCards(cutId: string, alive: string[], scored: Scored[], draw: TypeDraw): string[] {
  const out: string[] = [];
  for (const c of draw.cards) {
    const touched = scored.some((s) => alive.includes(s.who) && s.hits.includes(c.id));
    if (!touched) continue;
    const st = standings(alive, scored, draw, c.id);
    const low = lowest(st, alive);
    if (!(low.length === 1 && low[0] === cutId)) out.push(c.id);
  }
  return out;
}

/** Plain-words reason for the transcript. */
export function explain(id: string, scored: Scored[], draw: TypeDraw, st: Standing): string {
  const mine = scored.filter((s) => s.who === id);
  const marks = mine.map((s) => s.mark);
  const count = (m: Mark) => marks.filter((x) => x === m).length;
  const parts = [`standing ${st[id] ?? 0}`];
  const c = count('charmed'), u = count('unsure'), r = count('cringing');
  parts.push(`${c} charmed, ${u} unsure, ${r} cringing`);
  for (const [i, card] of draw.cards.entries()) {
    const n = mine.filter((s) => s.hits.includes(card.id)).length;
    if (n) parts.push(`${n}x ${i === 2 ? 'dealbreaker' : 'turn-on'} "${card.label}"`);
  }
  return parts.join('; ');
}

/**
 * The line replayed when a hidden card turns over: the most decisive hit.
 * Slot 1 (hidden turn-on): the latest hit by the winner; else the latest by the loser; else the
 * latest by anyone.
 * Slot 2 (dealbreaker): the earliest hit by a suitor who was then cut (rounds one and two); else the
 * earliest by the loser; else the earliest by anyone. None: null.
 */
export function revealQuote(
  slot: 1 | 2,
  draw: TypeDraw,
  scored: Scored[],
  o: { winner: string; loser: string; cut: { id: string; round: number }[] },
): Scored | null {
  const card = draw.cards[slot];
  const hits = scored.filter((s) => s.hits.includes(card.id)).sort((a, b) => a.seq - b.seq);
  if (!hits.length) return null;
  if (slot === 1) {
    for (const who of [o.winner, o.loser]) {
      const mine = hits.filter((s) => s.who === who);
      if (mine.length) return mine[mine.length - 1]!;
    }
    return hits[hits.length - 1]!;
  }
  const cutIds = new Set(o.cut.filter((c) => c.round <= 2).map((c) => c.id));
  return hits.find((s) => cutIds.has(s.who)) ?? hits.find((s) => s.who === o.loser) ?? hits[0]!;
}

// ------------------------------------------------------------------------------------------
// v2 (show/FORMAT2.md): the cut follows the screen, the pick follows the dates
// ------------------------------------------------------------------------------------------

const MARK_ORDER: Mark[] = ['cringing', 'unsure', 'charmed'];

/** Sum of mark scores of a suitor's lines in one round (each suitor has one turn per round). */
export function roundMarks(ids: string[], scored: Scored[], round: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = 0;
  for (const s of scored) if (s.round === round && s.who in out) out[s.who]! += MARK_SCORE[s.mark] ?? 0;
  return out;
}

/** Did this suitor get a charmed mark this round. */
export function charmedIn(id: string, scored: Scored[], round: number): boolean {
  return scored.some((s) => s.who === id && s.round === round && s.mark === 'charmed');
}

/**
 * The cut order (FORMAT2 "The cut follows the screen"): alive suitors, lowest first, by (this round's
 * mark, then total standing). A suitor charmed this round sorts above every suitor who was not.
 * `tie` = the suitors tied for last on both keys (brain.choose breaks it), else [].
 */
export function cutOrder(alive: string[], scored: Scored[], draw: TypeDraw, round: number): { order: string[]; tie: string[]; rm: Record<string, number>; st: Standing } {
  const st = standings(alive, scored, draw);
  const rm = roundMarks(alive, scored, round);
  const ch = (id: string) => (charmedIn(id, scored, round) ? 1 : 0);
  const key = (id: string): [number, number, number] => [ch(id), rm[id]!, st[id]!];
  const cmp = (a: string, b: string) => {
    const ka = key(a), kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  };
  const order = alive.slice().sort(cmp);
  const tie = order.filter((id) => cmp(id, order[0]!) === 0);
  return { order, tie: tie.length > 1 ? tie : [], rm, st };
}

/**
 * When total standing (not the visible mark) decided a cut: the hidden card that decided it, else null.
 * The group is the suitors whose mark this round equals the cut suitor's. A card decided it when, with
 * its hits ignored, the cut suitor would no longer be the lone lowest of that group. The dealbreaker is
 * tried first, then the hidden turn-on (a turn-on the others found and this suitor missed). The face-up
 * card is public, so it never needs a hint.
 */
export function tieBreakCard(cutId: string, alive: string[], scored: Scored[], draw: TypeDraw, round: number): string | null {
  const rm = roundMarks(alive, scored, round);
  const group = alive.filter((id) => id === cutId || (rm[id] === rm[cutId] && charmedIn(id, scored, round) === charmedIn(cutId, scored, round)));
  if (group.length < 2) return null;
  const st = standings(group, scored, draw);
  const low = lowest(st, group);
  if (!(low.length === 1 && low[0] === cutId)) return null; // a tie on standing too: brain.choose decided
  for (const c of [draw.cards[2], draw.cards[1]]) {
    if (!scored.some((s) => group.includes(s.who) && s.hits.includes(c.id))) continue;
    const st2 = standings(group, scored, draw, c.id);
    const low2 = lowest(st2, group);
    if (!(low2.length === 1 && low2[0] === cutId)) return c.id;
  }
  return null;
}

/** A suitor's lowest-marked line in a round (latest among equals): the one the cut reason quotes. */
export function worstLine(id: string, scored: Scored[], round: number, draw: TypeDraw): Scored | null {
  const mine = scored.filter((s) => s.who === id && s.round === round);
  if (!mine.length) return null;
  return mine.slice().sort((a, b) => MARK_ORDER.indexOf(a.mark) - MARK_ORDER.indexOf(b.mark) || lineScore(a, draw) - lineScore(b, draw) || b.seq - a.seq)[0]!;
}

/** A suitor's best line of the night (highest mark, then score, earlier rounds before the one on one, latest). */
export function bestLine(id: string, scored: Scored[], draw: TypeDraw): Scored | null {
  const mine = scored.filter((s) => s.who === id && s.round > 0);
  if (!mine.length) return null;
  const r3 = (s: Scored) => (s.round === 3 ? 1 : 0);
  return mine.slice().sort((a, b) => MARK_ORDER.indexOf(b.mark) - MARK_ORDER.indexOf(a.mark) || lineScore(b, draw) - lineScore(a, draw) || r3(a) - r3(b) || b.seq - a.seq)[0]!;
}

/**
 * The pick (FORMAT2 "The pick follows the dates"): the finalists by (one-on-one mark, then total
 * standing). `tie` = both when both keys are equal (brain.choose breaks it), else [].
 */
export function pickOrder(finalists: string[], scored: Scored[], draw: TypeDraw): { order: string[]; tie: string[]; oo: Record<string, number>; st: Standing } {
  const st = standings(finalists, scored, draw);
  const oo = roundMarks(finalists, scored, 3);
  const cmp = (a: string, b: string) => oo[b]! - oo[a]! || st[b]! - st[a]!;
  const order = finalists.slice().sort(cmp);
  const tie = order.filter((id) => cmp(id, order[0]!) === 0);
  return { order, tie: tie.length > 1 ? tie : [], oo, st };
}

/**
 * The line a finalist's replay shows for a hidden card: their hit on it (charmed first, rounds before
 * the one on one, then the latest), else their nearest line: the best-marked line that did not break
 * the dealbreaker. Null if they have no scored line.
 */
export function replayLine(id: string, cardId: string, scored: Scored[], draw: TypeDraw): { line: Scored; hit: boolean } | null {
  const mine = scored.filter((s) => s.who === id && s.round > 0);
  const r3 = (s: Scored) => (s.round === 3 ? 1 : 0);
  const sort = (xs: Scored[]) => xs.slice().sort((a, b) => MARK_ORDER.indexOf(b.mark) - MARK_ORDER.indexOf(a.mark) || r3(a) - r3(b) || b.seq - a.seq);
  const hits = sort(mine.filter((s) => s.hits.includes(cardId)));
  if (hits.length) return { line: hits[0]!, hit: true };
  const db = draw.cards[2].id;
  const near = sort(mine.filter((s) => !s.hits.includes(db)));
  const any = near.length ? near : sort(mine);
  return any.length ? { line: any[0]!, hit: false } : null;
}

/**
 * Slot 2 (the dealbreaker) turns on the loser: the loser's earliest hit, else the winner's, else the
 * earliest by anyone. Null when nobody broke it.
 */
export function dealbreakerLine(draw: TypeDraw, scored: Scored[], o: { winner: string; loser: string }): Scored | null {
  const db = draw.cards[2].id;
  const hits = scored.filter((s) => s.hits.includes(db)).sort((a, b) => a.seq - b.seq);
  return hits.find((s) => s.who === o.loser) ?? hits.find((s) => s.who === o.winner) ?? hits[0] ?? null;
}
