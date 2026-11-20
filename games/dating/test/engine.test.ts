// Engine tests: draw determinism, judge rules, content check.
//   node --test test/engine.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankAffinity, draw, hexOf, owners, sfc32, topTags, TOP_TAGS, type CastAffinity } from '../show/draw.ts';
import { loadDecks } from '../show/paths.ts';
import { check, clean } from '../show/content.ts';
import { coherentMark, cutCandidates, cutOrder, dealbreakerLine, decidingCards, lineScore, pickCandidates, pickOrder, replayLine, revealQuote, standings, tieBreakCard, worstLine, type Scored } from '../show/judge.ts';
import type { TypeDraw } from '../show/types.ts';

const decks = loadDecks();

test('draw: same sealed, same cards and twist', () => {
  const sealed = hexOf('sealed-1');
  const a = draw(sealed, decks);
  const b = draw(sealed, decks);
  assert.deepEqual(a.cards.map((c) => c.id), b.cards.map((c) => c.id));
  assert.equal(a.twist.id, b.twist.id);
  assert.equal(new Set(a.cards.map((c) => c.id)).size, 3, 'three distinct cards');
});

test('draw: different sealed values spread over the decks', () => {
  const cards = new Set<string>();
  const twists = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const d = draw(hexOf(`s${i}`), decks);
    d.cards.forEach((c) => cards.add(c.id));
    twists.add(d.twist.id);
  }
  assert.equal(cards.size, decks.cards.length);
  assert.equal(twists.size, decks.twists.length);
});

// a cast whose top tags are fixed by hand: share falls with position
const aff = (...ids: string[]) => Object.fromEntries(ids.map((id, i) => [id, 0.3 - i * 0.02]));
const CAST: CastAffinity = {
  a: aff('confidence', 'numbers', 'trashtalk', 'honesty', 'puns', 'food'),
  b: aff('poetry', 'numbers', 'drama', 'flattery', 'past'),
  c: aff('money', 'numbers', 'confidence', 'bragging', 'gestures'),
  d: aff('danger', 'numbers', 'rules', 'trashtalk', 'sorry'),
};

test('draw with cast affinity: deterministic, and the hidden cards are always naturally played on stage', () => {
  const own = owners(CAST, decks);
  assert.deepEqual(own.numbers, ['a', 'b', 'c', 'd'], 'owned by all four');
  assert.deepEqual(own.food, [], `food is sixth for a, outside the top ${TOP_TAGS}`);
  assert.deepEqual(own.puns, ['a'], 'puns is fifth for a, inside the top five');
  const seen = new Map<string, number>();
  for (let i = 0; i < 400; i++) {
    const sealed = hexOf(`cast-${i}`);
    const d = draw(sealed, decks, CAST);
    assert.deepEqual(d.cards.map((c) => c.id), draw(sealed, decks, CAST).cards.map((c) => c.id), 'same input, same draw');
    assert.equal(new Set(d.cards.map((c) => c.id)).size, 3);
    const [o0, o1, o2] = d.cards.map((c) => own[c.id]!);
    assert.ok(o1!.length >= 1 && o1!.length <= 3, `hidden turn-on ${d.cards[1].id} has 1 to 3 owners`);
    assert.ok(o2!.length >= 1 && o2!.length <= 3, `dealbreaker ${d.cards[2].id} has 1 to 3 owners`);
    assert.ok(!o0!.some((x) => o1!.includes(x)), 'no suitor owns both turn-ons');
    for (const c of d.cards) seen.set(c.id, (seen.get(c.id) ?? 0) + 1);
  }
  assert.ok((seen.get('trashtalk') ?? 0) > (seen.get('curiosity') ?? 0), 'owned cards come up more often');
  // a card all four own can never be hidden, and face up it would share an owner with the hidden turn-on
  assert.equal(seen.get('numbers'), undefined, 'a card all four own is never drawn');
  assert.ok(seen.size > 12, 'unowned cards can still appear face up');
});

test('draw: impossible constraints fall back to every triple, and affinity comes from scored lines only (answers, solo twists, one-on-one openers)', () => {
  const lonely: CastAffinity = { a: { puns: 1 }, b: { puns: 1 }, c: { puns: 1 }, d: { puns: 1 } };
  const d = draw(hexOf('lonely'), decks, lonely);
  assert.equal(new Set(d.cards.map((c) => c.id)).size, 3);
  const bank = {
    openers: [{ t: 'x', tags: ['food'] }],
    answers: { q: [{ t: 'a', tags: ['puns', 'food'] }, { t: 'b', tags: ['puns'] }] },
    oneOnOne: { open: { any: [{ t: 'c' }, { t: 'd', tags: ['money'] }] }, closeWarm: [{ t: 'e', tags: ['money'] }] },
    // trash talk by format: never counts toward affinity
    roast: { b: { t: 'r', tags: ['trashtalk'] } },
    wingman: { b: { t: 'w', tags: ['trashtalk'] } },
    jabs: { any: [{ t: 'j', tags: ['trashtalk'] }] },
    twists: { 'roast-left': [{ t: 'x2', tags: ['trashtalk'] }] },
  };
  assert.deepEqual(bankAffinity(bank, decks), { puns: 0.5, money: 0.25, food: 0.25 });
  assert.deepEqual(topTags(bankAffinity(bank, decks), decks), ['puns', 'money', 'food'], 'ties in deck order');
  assert.deepEqual(bankAffinity(null, decks), {});
});

test('sfc32 is deterministic and in [0, 1)', () => {
  const a = sfc32('ab'.repeat(32));
  const b = sfc32('ab'.repeat(32));
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

// ------------------------------------------------------------------------------------------

const card = (id: string) => ({ id, label: id, detect: '' });
const D: TypeDraw = { cards: [card('up'), card('hidden'), card('deal')], twist: decks.twists[0]! };
let seq = 0;
const s = (who: string, mark: Scored['mark'], hits: string[] = [], weight = 1, round: 0 | 1 | 2 | 3 = 1): Scored => ({
  seq: ++seq, who, name: who, text: `${who} line ${seq}`, mark, hits, weight, round,
});

test('judge: line scores', () => {
  assert.equal(lineScore(s('a', 'charmed'), D), 1);
  assert.equal(lineScore(s('a', 'unsure'), D), 0);
  assert.equal(lineScore(s('a', 'cringing'), D), -1);
  assert.equal(lineScore(s('a', 'charmed', ['up']), D), 3);
  assert.equal(lineScore(s('a', 'charmed', ['hidden']), D), 3);
  assert.equal(lineScore(s('a', 'cringing', ['deal']), D), -4);
  assert.equal(lineScore(s('a', 'charmed', ['up', 'up']), D), 3, 'a line hits a card at most once');
  assert.equal(lineScore(s('a', 'charmed', ['up'], 2), D), 6, 'one on one counts double');
  assert.equal(lineScore(s('a', 'charmed', ['nope']), D), 1, 'unknown ids score nothing');
});

test('judge: cut is the lowest standing, ties returned for choose', () => {
  const sc = [s('a', 'charmed'), s('b', 'cringing'), s('c', 'unsure'), s('d', 'charmed', ['up'])];
  const st = standings(['a', 'b', 'c', 'd'], sc, D);
  assert.deepEqual(st, { a: 1, b: -1, c: 0, d: 3 });
  assert.deepEqual(cutCandidates(st, ['a', 'b', 'c', 'd']), ['b']);
  assert.deepEqual(cutCandidates({ a: 0, b: 0, c: 2 }, ['a', 'b', 'c']), ['a', 'b']);
  assert.deepEqual(pickCandidates({ a: 4, c: 2 }, ['a', 'c']), ['a']);
  assert.deepEqual(pickCandidates({ a: 2, c: 2 }, ['a', 'c']), ['a', 'c']);
});

test('judge: deciding cards', () => {
  // b is lowest either way: the dealbreaker made it worse but did not decide it
  const sc = [s('a', 'unsure'), s('b', 'cringing', ['deal']), s('c', 'unsure')];
  assert.deepEqual(decidingCards('b', ['a', 'b', 'c'], sc, D), []);
  // without the dealbreaker hit, b (charmed) would beat a (cringing)
  const sc2 = [s('a', 'cringing'), s('b', 'charmed', ['deal']), s('c', 'charmed')];
  assert.deepEqual(decidingCards('b', ['a', 'b', 'c'], sc2, D), ['deal']);
});

test('judge: reveal quotes prefer the winner for the turn-on and a cut suitor for the dealbreaker', () => {
  const sc = [
    s('cut1', 'charmed', ['hidden']),
    s('win', 'charmed', ['hidden']),
    s('win', 'charmed', ['hidden', 'up']),
    s('lose', 'cringing', ['deal']),
    s('cut2', 'cringing', ['deal']),
    s('cut1', 'cringing', ['deal']),
  ];
  const o = { winner: 'win', loser: 'lose', cut: [{ id: 'cut2', round: 2 }, { id: 'cut1', round: 1 }] };
  const q1 = revealQuote(1, D, sc, o)!;
  assert.equal(q1.who, 'win');
  assert.deepEqual(q1.hits, ['hidden', 'up'], 'the best-scoring winner line');
  const q2 = revealQuote(2, D, sc, o)!;
  assert.equal(q2.who, 'cut2', 'the earliest dealbreaker hit by a suitor who was then cut');
  // the latest turn-on hit by the winner, even if an earlier one scored the same
  const late = [s('win', 'charmed', ['hidden']), s('win', 'unsure', ['hidden']), s('lose', 'charmed', ['hidden'])];
  assert.equal(revealQuote(1, D, late, o), late[1]);
  // a dealbreaker no cut suitor hit: the loser's earliest
  const db = [s('win', 'cringing', ['deal']), s('lose', 'cringing', ['deal']), s('lose', 'cringing', ['deal'])];
  assert.equal(revealQuote(2, D, db, o), db[1]);
  assert.equal(revealQuote(1, D, [s('lose', 'charmed', ['hidden'])], o)!.who, 'lose');
  assert.equal(revealQuote(2, D, [s('a', 'charmed')], o), null);
});

test('judge v2: the cut follows the screen: this round\'s mark first, then standing; charmed is never cut over a lower mark', () => {
  // b leads overall but cringed this round; a was charmed this round but trails overall
  const sc = [s('a', 'cringing', ['deal'], 1, 0), s('b', 'charmed', ['up'], 1, 0), s('c', 'unsure', [], 1, 0), s('a', 'charmed', [], 1, 1), s('b', 'cringing', [], 1, 1), s('c', 'unsure', [], 1, 1)];
  const co = cutOrder(['a', 'b', 'c'], sc, D, 1);
  assert.equal(co.order[0], 'b', 'the visible mark this round decides, not total standing');
  assert.deepEqual(co.order, ['b', 'c', 'a']);
  assert.deepEqual(co.tie, []);
  // equal marks: total standing breaks it; a hidden card that decided it is named for the hint
  const sc2 = [s('a', 'unsure', ['deal'], 1, 0), s('b', 'unsure', [], 1, 0), s('a', 'unsure', [], 1, 1), s('b', 'unsure', [], 1, 1)];
  assert.deepEqual(cutOrder(['a', 'b'], sc2, D, 1).order, ['a', 'b']);
  assert.equal(tieBreakCard('a', ['a', 'b'], sc2, D, 1), 'deal');
  // the mark decided it: no hint
  assert.equal(tieBreakCard('b', ['a', 'b', 'c'], sc, D, 1), null);
  // a full tie on both: brain.choose
  const sc3 = [s('a', 'unsure', [], 1, 1), s('b', 'unsure', [], 1, 1)];
  assert.deepEqual(cutOrder(['a', 'b'], sc3, D, 1).tie, ['a', 'b']);
  assert.equal(tieBreakCard('a', ['a', 'b'], sc3, D, 1), null);
  // the reason quotes the lowest-marked line this round
  const w = [s('a', 'unsure', [], 1, 2), s('a', 'cringing', [], 1, 2), s('a', 'cringing', [], 1, 1)];
  assert.equal(worstLine('a', w, 2, D), w[1]);
});

test('judge v2: the pick follows the dates, then standing; replays and the dealbreaker line', () => {
  const sc = [s('w', 'charmed', ['hidden'], 1, 1), s('l', 'charmed', ['up'], 1, 1), s('l', 'charmed', ['up'], 1, 2), s('w', 'charmed', [], 2, 3), s('l', 'unsure', [], 2, 3)];
  const po = pickOrder(['l', 'w'], sc, D);
  assert.deepEqual(po.order, ['w', 'l'], 'the better one-on-one mark wins even with lower standing');
  assert.deepEqual(po.oo, { l: 0, w: 1 });
  const eq = [s('w', 'unsure', [], 2, 3), s('l', 'unsure', [], 2, 3), s('l', 'charmed', ['up'], 1, 1)];
  assert.deepEqual(pickOrder(['w', 'l'], eq, D).order, ['l', 'w'], 'equal dates: standing');
  assert.deepEqual(pickOrder(['w', 'l'], [s('w', 'unsure', [], 2, 3), s('l', 'unsure', [], 2, 3)], D).tie.length, 2);
  // replay: the hit for the card, charmed first, rounds before the one on one; else the nearest line
  const r = replayLine('w', 'hidden', sc, D)!;
  assert.ok(r.hit && r.line === sc[0]);
  const n = replayLine('l', 'hidden', sc, D)!;
  assert.equal(n.hit, false);
  assert.equal(n.line.who, 'l');
  // the dealbreaker turns on the loser when the loser hit it, else the winner, else anyone
  const db = [s('x', 'cringing', ['deal']), s('w', 'cringing', ['deal']), s('l', 'cringing', ['deal'])];
  assert.equal(dealbreakerLine(D, db, { winner: 'w', loser: 'l' })!.who, 'l');
  assert.equal(dealbreakerLine(D, db.slice(0, 2), { winner: 'w', loser: 'l' })!.who, 'w');
  assert.equal(dealbreakerLine(D, db.slice(0, 1), { winner: 'w', loser: 'l' })!.who, 'x');
  assert.equal(dealbreakerLine(D, [], { winner: 'w', loser: 'l' }), null);
});

test('judge: marks cohere with hits', () => {
  assert.equal(coherentMark('charmed', ['deal'], D), 'cringing', 'a dealbreaker hit always cringes');
  assert.equal(coherentMark('unsure', ['hidden', 'deal'], D), 'cringing', 'even with a turn-on hit too');
  assert.equal(coherentMark('cringing', ['hidden'], D), 'unsure', 'a turn-on hit never cringes');
  assert.equal(coherentMark('cringing', ['up'], D), 'unsure');
  assert.equal(coherentMark('charmed', ['up'], D), 'charmed');
  assert.equal(coherentMark('cringing', [], D), 'cringing', 'no hits: the brain decides');
});

// ------------------------------------------------------------------------------------------

test('content: cleaning strips em dashes and emoji', () => {
  assert.equal(clean('Hello — world'), 'Hello, world');
  assert.equal(clean('Wait—what?'), 'Wait, what?');
  assert.equal(clean('Nice \u{1F60D}\u{1F525} one'), 'Nice one');
  assert.equal(clean('"Quoted line."'), 'Quoted line.');
  const c = check('I love you — truly \u{1F496}', { maxWords: 10 });
  assert.ok(c.ok);
  assert.ok(!/[—\u{1F496}]/u.test(c.cleaned));
});

test('content: word limits', () => {
  assert.ok(check('one two three', { maxWords: 3 }).ok);
  const r = check('one two three four', { maxWords: 3 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /words 4 > 3/);
});

test('content: banned phrases', () => {
  const bad = [
    'As an AI, I cannot date you.',
    'I hear you, and your feelings are valid.',
    'You are my soulmate, truly.',
    'Let me tell you about my sex life.',
    'I am basically Elon Musk with better hair.',
    'First:\n1. dinner\n2. a movie',
    '*winks* hello there',
    'Hello {rival}, nice to meet you.',
    '',
  ];
  for (const t of bad) assert.equal(check(t, { maxWords: 20 }).ok, false, t);
  const good = [
    'Variant A: gorgeous. Variant B: stunning. B wins.',
    'I would take you to the arcade, then a diner at midnight.',
    'Breakfast in bed. I make terrible pancakes, but sincere ones.',
    'Class dismissed, Sir Quill.',
  ];
  for (const t of good) assert.ok(check(t, { maxWords: 20 }).ok, t);
});

test('content: slurs are caught', () => {
  assert.equal(check('You absolute r3tard.', { maxWords: 20 }).ok, false);
});
