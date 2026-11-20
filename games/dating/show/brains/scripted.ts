// The scripted brain: plays from show/bank/** (SPEC "Scripted brain", show/FORMAT2.md).
// - A bank line's tags intersect the star's cards to give hits. A turn-on hit is charmed, a dealbreaker
//   hit is cringing; without a hit the mark is drawn, charmed rarely (NO_HIT_MIX).
// - Walk-on snaps (hint.beat 'snap') are judged only against the face-up card.
// - A spoken reaction answers the exact line: show/bank/replies/<star>/<suitor>.json holds a warm and a
//   cold reply per suitor line (keyed by the line's bank text). Fallback: cardReact, then react[suitor][mark].
// - Suitors prefer a line tagged with the face-up card when they have one (answers, twists, one-on-one).
// - Lines are used least-recently-used across episodes (.cache/used.json when usedPath is given), and a
//   line said in the last REPEAT_WINDOW episodes goes behind every fresh line of its tier.
// - Every v2 bank field falls back to the v1 field it replaces when a bank has not been upgraded.
// - Slots: {rival} {target} {star} {name} {hook} {a} {b} {card} {played} {wins} {losses} {ex}.
// - Never throws: a missing bank, key or target falls back to another line of the same category,
//   then to a short neutral built-in line with source 'fallback'.

import fs from 'node:fs';
import path from 'node:path';
import type {
  Bot, Brain, Ctx, Decks, L, Mark, ReactReq, Reacted, ReplyBank, SpeakReq, Spoken, StarBank, SuitorBank,
} from '../types.ts';
import type { Rng } from '../draw.ts';
import { bankAffinity, pick, topTags, weighted } from '../draw.ts';
import { cleanHits } from '../judge.ts';
import { words } from '../timing.ts';
import { BANK, readJson, writeJson } from '../paths.ts';

/** A line is not repeated within this many episodes while its tier has a fresh one. */
export const REPEAT_WINDOW = 10;
/** The mark when a line shows none of the star's cards: charmed is rare (FORMAT2 "Charmed is rare"). */
export const NO_HIT_MIX: [Mark, number][] = [['charmed', 10], ['unsure', 55], ['cringing', 35]];
/**
 * The second date opens with a steal at the first (FORMAT2): a steal that does not show a card still
 * lands more often than a plain line, so the trailing finalist has a real chance to swing the pick.
 */
export const STEAL_MIX: [Mark, number][] = [['charmed', 60], ['unsure', 30], ['cringing', 10]];
/** rank weight of the speaker's own strengths (1 + their top tags on the line; 1 if tagged at all) */
export const OWN_RANK = 1;
/** rank bonus for a line tagged with the face-up card (suitors play to the card everyone can see) */
export const FACE_UP_RANK = 3;

// ------------------------------------------------------------------------------------------
// Banks, re-read when the file changes (writers edit them while the show runs)
// ------------------------------------------------------------------------------------------

export class BankStore {
  readonly dir: string;
  private cache = new Map<string, { checked: number; mtime: number; data: unknown }>();
  private warned = new Set<string>();
  private log?: (s: string) => void;
  constructor(dir = BANK, log?: (s: string) => void) {
    this.dir = dir;
    this.log = log;
  }
  private load<T>(file: string): T | null {
    const now = Date.now();
    const c = this.cache.get(file);
    if (c && now - c.checked < 5000) return c.data as T | null;
    let mtime = -1;
    try {
      mtime = fs.statSync(file).mtimeMs;
    } catch {
      /* missing */
    }
    if (c && c.mtime === mtime) {
      c.checked = now;
      return c.data as T | null;
    }
    const data = mtime < 0 ? null : readJson<T>(file);
    if (mtime >= 0 && !data && !this.warned.has(file)) {
      this.warned.add(file);
      this.log?.(`bank: could not parse ${path.relative(this.dir, file)}`);
    }
    this.cache.set(file, { checked: now, mtime, data });
    return data;
  }
  suitor(id: string): SuitorBank | null {
    return this.load<SuitorBank>(path.join(this.dir, 'suitors', `${id}.json`));
  }
  star(id: string): StarBank | null {
    return this.load<StarBank>(path.join(this.dir, 'stars', `${id}.json`));
  }
  /** v2: the star's paired replies to one suitor's lines (show/bank/replies/<star>/<suitor>.json) */
  replies(star: string, suitor: string): ReplyBank | null {
    return this.load<ReplyBank>(path.join(this.dir, 'replies', star, `${suitor}.json`));
  }
}

// ------------------------------------------------------------------------------------------
// Least-recently-used memory of lines (with the episode each was last said in)
// ------------------------------------------------------------------------------------------

class Lru {
  private file?: string;
  private data: { tick: number; used: Record<string, number>; ep: Record<string, number> };
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(file?: string) {
    this.file = file;
    const d = file ? readJson<{ tick: number; used: Record<string, number>; ep?: Record<string, number> }>(file) : null;
    this.data = d && typeof d.tick === 'number' && d.used ? { tick: d.tick, used: d.used, ep: d.ep ?? {} } : { tick: 0, used: {}, ep: {} };
  }
  last(key: string): number {
    return this.data.used[key] ?? 0;
  }
  /** the episode this line was last said in, or -Infinity */
  lastEp(key: string): number {
    return this.data.ep[key] ?? -Infinity;
  }
  /** undo a touch (a line chosen but never aired) */
  restore(key: string, tick: number, episode: number) {
    if (tick) this.data.used[key] = tick;
    else delete this.data.used[key];
    if (Number.isFinite(episode)) this.data.ep[key] = episode;
    else delete this.data.ep[key];
    this.schedule();
  }
  touch(key: string, episode?: number) {
    this.data.used[key] = ++this.data.tick;
    if (typeof episode === 'number' && Number.isFinite(episode)) this.data.ep[key] = episode;
    this.schedule();
  }
  private schedule() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const keys = Object.keys(this.data.used);
      if (keys.length > 20000) {
        const keep = keys.sort((a, b) => this.data.used[b]! - this.data.used[a]!).slice(0, 15000);
        this.data.used = Object.fromEntries(keep.map((k) => [k, this.data.used[k]!]));
        this.data.ep = Object.fromEntries(keep.filter((k) => k in this.data.ep).map((k) => [k, this.data.ep[k]!]));
      }
      try {
        writeJson(this.file!, this.data);
      } catch {
        /* ignore */
      }
    }, 1500);
    this.timer.unref?.();
  }
}

// ------------------------------------------------------------------------------------------
// Built-in neutral lines (last resort). Short, inoffensive, pass the content check.
// ------------------------------------------------------------------------------------------

const NEUTRAL: Record<string, string[]> = {
  intro: ['Good evening. Four hopefuls, one of me. Tonight I like {card}.', 'Welcome back. Impress me. Tonight I like {card}.'],
  opener: ['Hello. I came here to win, so here I am.', 'Evening. Be gentle, I am new at this.'],
  answer: ['Honestly? I would make it up as I go, and make it count.', 'I would rather show you than tell you. Ask me again later.'],
  reply: ['{rival} said that so I would not have to. Thank you.', 'Bold answer, {rival}. Mine is shorter and better.'],
  twist: ['I will keep this short and let my record speak.', 'I tried to prepare for this. I did not.'],
  twist3: ['Loud. Warm. Ours.', 'Short. Sweet. Us.'],
  roast: ['{rival}, I have nothing to add. Your own lines did it.'],
  wingman: ['{rival} is lovely. Ask anyone. Except me.'],
  caller: ['Hi. Just calling to say I am doing great. Bye.'],
  jab: ['{rival}, that was a lot of words.', 'Bold move, {rival}. Wrong, but bold.'],
  comeback: ['Keep talking, {rival}. I am still in front.', 'Two against one. Sounds fair to me.'],
  confession: ['I think it went fine. I hope it went fine.', 'Nobody can hear me in here, right? Good.'],
  confessionRival: ['{rival} is good. Too good. I do not like it.'],
  guess: ['I have a theory. It is {card}. Do not tell anyone.'],
  fear: ['One thing I am not trying tonight: {card}.'],
  duoOpen: ['Just us now. I want to hear about you.'],
  steal: ['Whatever {rival} promised you, I can do it quieter.'],
  duoWarm: ['Then I will stop talking while I am ahead.'],
  duoCold: ['Fair. I will take that and do better.'],
  cutline: ['{rival}, it is not working. Thank you, and goodnight.'],
  bottom: ['{a}. {b}. One of you is going home.'],
  verdict: ['{name} had the best of that. Everyone else, take notes.'],
  compare: ['{a} or {b}. Give me a second.'],
  exit: ['Well. That happened. Goodnight, everyone.'],
  hold: ['Two of you. One answer. Give me a moment.'],
  pickline: ['It was always going to be {rival}.'],
  win: ['I did it. I actually did it.'],
  lose: ['Close. Not close enough. Goodnight.'],
  revealOn: ['My hidden turn-on was {card}.'],
  revealOff: ['My dealbreaker was {card}.'],
  revealNone: ['Nobody found {card}. Pity.'],
  outro: ['That is the show. Goodnight, and choose well.'],
  charmed: ['Okay. That one landed.', 'Fine. I liked that.'],
  unsure: ['Hm. Noted.', 'I will allow it. For now.'],
  cringing: ['No. Absolutely not.', 'Please never say that again.'],
  duoStar: ['Go on. Tell me one true thing.'],
  starAside: ['Between us? I already know. I just like watching them sweat.', 'Two left. One of them is bluffing. Maybe both.'],
};

const SLOT_RE = /\{(\w+)\}/g;

export function fillSlots(t: string, vars: Record<string, string | number | undefined>): string | null {
  let bad = false;
  const out = t.replace(SLOT_RE, (_m, k: string, at: number) => {
    const v = vars[k];
    if (v === undefined || v === null || v === '') {
      bad = true;
      return '';
    }
    const s = String(v);
    // a slot that opens a sentence is capitalised ("{card}, I'm ninety percent sure." -> "Apologies, ...")
    const before = t.slice(0, at).trimEnd();
    const opens = before === '' || /[.!?]["']?$/.test(before);
    return opens && s ? s[0]!.toUpperCase() + s.slice(1) : s;
  });
  return bad ? null : out;
}

/** Accepts L objects or plain strings (star banks use strings), singly or in arrays. */
const anyL = (xs: unknown): L[] => {
  const one = (x: unknown): L[] =>
    typeof x === 'string' ? [{ t: x }] : x && typeof (x as L).t === 'string' ? [x as L] : [];
  return Array.isArray(xs) ? xs.flatMap(one) : one(xs);
};
const asL = anyL;
const arr = anyL;

/** A hook is valid when it is two to five consecutive words of the text. */
export function validHook(hook: unknown, text: string): string | undefined {
  if (typeof hook !== 'string') return undefined;
  const h = hook.trim();
  const n = words(h);
  return h && n >= 2 && n <= 5 && text.includes(h) ? h : undefined;
}

export interface ScriptedOpts {
  decks: Decks;
  rng?: Rng;
  usedPath?: string;
  /** default show/bank */
  bankDir?: string;
  log?: (s: string) => void;
}

export interface Candidate {
  text: string;
  tags?: string[];
  hook?: string;
}

export interface ScriptedBrain extends Brain {
  readonly banks: BankStore;
  /** the star's ex (name) from the star bank, for the 'ex-calls' twist */
  exName(starId: string): string | null;
  /** the built-in neutral line for a request (never fails the content check) */
  neutral(req: SpeakReq): Spoken;
  neutralReaction(mark: Mark, duo?: boolean): string;
  /**
   * For the hybrid model brain (duck-typed, not in Brain): the n best bank lines for exactly this
   * beat, in the order speak() would prefer them (category tier, then freshness, then play-to-card
   * rank, then least recently used). Slots are filled. Nothing is marked used.
   */
  candidates(req: SpeakReq, n: number): Candidate[];
  /** The n best bank reactions for this mark and these hits: the paired reply first, then card and mark lines. Nothing is marked used. */
  reactCandidates(req: ReactReq, mark: Mark, hits: string[], n: number): string[];
  /** v2: the star's paired warm and cold reply to this exact suitor line, or null when the bank has none */
  replyPair(req: ReactReq): { warm: string; cold: string } | null;
  /** v2: the bank text (slots unfilled) a filled line came from, when this brain produced it */
  templateOf(text: string): string;
  /** v2: does this star have a reply file for this suitor */
  hasReplies(starId: string, suitorId: string): boolean;
  /** Record that a line returned by candidates() or reactCandidates() aired. Unknown text is ignored. */
  markUsed(text: string, episode?: number): void;
  /** v2: a reaction this brain made did not air (the star gave the mark alone): it may be said later */
  release(text: string, episode: number): void;
}

export function createScriptedBrain(o: ScriptedOpts): ScriptedBrain {
  const rng = o.rng ?? Math.random;
  const banks = new BankStore(o.bankDir ?? BANK, o.log);
  const lru = new Lru(o.usedPath);
  const epUsed = { ep: -1, texts: new Set<string>() };
  /** reaction text -> its key and the LRU state before it was chosen (to release a mark-only reaction) */
  const reacted = new Map<string, { key: string; ep: number; prevEp: number; prevTick: number }>();
  /** filled text -> LRU keys (and the episode-used key for reactions) of lines offered as candidates */
  const offered = new Map<string, { keys: string[]; react?: { ep: number; key: string } }>();
  const offer = (text: string, key: string, react?: { ep: number; key: string }) => {
    if (offered.size > 4000) offered.clear();
    const o2 = offered.get(text) ?? { keys: [] };
    if (!o2.keys.includes(key)) o2.keys.push(key);
    if (react) o2.react = react;
    offered.set(text, o2);
  };
  /** filled text -> the bank text it came from (the key of a paired reply) */
  const templates = new Map<string, string>();
  const remember = (filled: string, raw: string) => {
    if (filled === raw) return;
    if (templates.size > 4000) templates.clear();
    templates.set(filled, raw);
  };
  /** a suitor bank's top tags, cached per loaded bank object */
  const topCache = new WeakMap<object, string[]>();
  const tops = (b: SuitorBank | null): string[] => {
    if (!b) return [];
    let t = topCache.get(b);
    if (!t) topCache.set(b, (t = topTags(bankAffinity(b, o.decks), o.decks)));
    return t;
  };

  const cardWord = (c: unknown, label = false): string | undefined => {
    const x = c as { label?: string; noun?: string } | undefined;
    if (!x) return undefined;
    return label ? x.label : (x.noun ?? x.label?.toLowerCase());
  };

  const vars = (req: SpeakReq): Record<string, string | number | undefined> => {
    const rec = req.ctx.records[req.who.id] ?? { played: 0, wins: 0 };
    const h = req.hint ?? {};
    const rivalId = typeof h.rival === 'string' ? h.rival : undefined;
    const rival = req.target?.name ?? req.ctx.suitors.find((s) => s.id === rivalId)?.name;
    const str = (k: string) => (typeof h[k] === 'string' && h[k] ? (h[k] as string) : undefined);
    return {
      rival,
      target: rival,
      star: req.ctx.star.name,
      // a star's {name} is the suitor the line is about; a suitor's own lines rarely use it
      name: str('name') ?? req.target?.name ?? req.who.name,
      hook: str('hook'),
      a: str('a'),
      b: str('b'),
      played: rec.played,
      wins: rec.wins,
      losses: rec.played - rec.wins,
      // reveal lines read the label at the start of a sentence; every other {card} is the noun phrase
      card: cardWord(h.card, req.kind === 'reveal'),
      ex: typeof h.exName === 'string' ? h.exName : undefined,
    };
  };

  const tagsOf = (l: L) => (Array.isArray(l.tags) ? l.tags.filter((t) => typeof t === 'string') : []);
  const lkey = (who: string, l: L) => `${who}\u0001${l.t}`;

  type Ranked = { l: L; text: string; tier: number; stale: number; rank: number; last: number; again: number };
  /**
   * Every valid line of every tier, best first: a line already said this episode goes behind every
   * other (whatever its tier), then tier, then fresh before stale (said in the last REPEAT_WINDOW
   * episodes), then rank (high first), then least recently used.
   */
  const ranked = (
    who: string,
    tiers: L[][],
    v: Record<string, string | number | undefined>,
    maxWords: number,
    episode: number,
    rank?: (l: L) => number,
    reject?: (l: L) => boolean,
  ): Ranked[] => {
    const out: Ranked[] = [];
    tiers.forEach((tier, ti) => {
      for (const l of tier) {
        if (reject?.(l)) continue;
        const text = fillSlots(l.t, v);
        if (!text || words(text) > maxWords || words(text) === 0) continue;
        const key = lkey(who, l);
        const stale = episode - lru.lastEp(key) < REPEAT_WINDOW ? 1 : 0;
        const again = lru.lastEp(key) === episode ? 1 : 0;
        out.push({ l, text, tier: ti, stale, rank: rank?.(l) ?? 0, last: lru.last(key), again });
      }
    });
    return out.sort((a, b) => a.again - b.again || a.tier - b.tier || a.stale - b.stale || b.rank - a.rank || a.last - b.last);
  };

  /** Choose from tiers of candidates: the first tier with a valid line wins, fresh first, best rank inside it, LRU inside that. */
  const choose = (
    who: string,
    tiers: L[][],
    v: Record<string, string | number | undefined>,
    maxWords: number,
    episode: number,
    rank?: (l: L) => number,
    reject?: (l: L) => boolean,
  ): { text: string; tags: string[]; l: L } | null => {
    const all = ranked(who, tiers, v, maxWords, episode, rank, reject);
    if (!all.length) return null;
    const top = all[0]!;
    const best = all.filter((x) => x.again === top.again && x.tier === top.tier && x.stale === top.stale && x.rank === top.rank && x.last === top.last);
    const got = pick(rng, best);
    lru.touch(lkey(who, got.l), episode);
    remember(got.text, got.l.t);
    return { text: got.text, tags: tagsOf(got.l), l: got.l };
  };

  const neutralText = (key: string, v: Record<string, string | number | undefined>, maxWords: number): string => {
    const list = NEUTRAL[key] ?? NEUTRAL.answer!;
    for (const t of [pick(rng, list), ...list]) {
      const s = fillSlots(t, v) ?? fillSlots(t, { ...v, rival: 'friend', target: 'friend', card: 'that one', name: 'you', a: 'You', b: 'you' });
      if (s && words(s) <= maxWords) return s;
    }
    return maxWords >= 2 ? 'Okay. Moving on.' : 'Okay.';
  };

  const neutralKey = (req: SpeakReq): string => {
    const h = req.hint ?? {};
    switch (req.kind) {
      case 'answer':
        return typeof h.reply === 'string' ? 'reply' : 'answer';
      case 'twist': {
        if (req.maxWords <= 4) return 'twist3';
        const f = req.ctx.twist?.format;
        return f === 'target-left' ? 'roast' : f === 'target-right' ? 'wingman' : 'twist';
      }
      case 'jab':
        return h.step === 'comeback' ? 'comeback' : 'jab';
      case 'confession':
        if (req.who.role === 'star' || req.who.id === req.ctx.star.id) return 'starAside';
        if (h.flavour === 'guess' || h.flavour === 'fear') return String(h.flavour);
        return h.flavour === 'rival' || h.flavour === 'final' ? 'confessionRival' : 'confession';
      case 'duo':
        if (req.who.role === 'star') return 'duoStar';
        if (h.step === 'steal') return 'steal';
        return h.step === 'close' ? (h.mark === 'cringing' ? 'duoCold' : 'duoWarm') : 'duoOpen';
      case 'reveal': {
        const verdict = String(h.verdict ?? (h.quote ? ((h.card as { kind?: string })?.kind === 'off' ? 'off' : 'on') : 'none'));
        return verdict === 'off' ? 'revealOff' : verdict === 'on' ? 'revealOn' : 'revealNone';
      }
      default:
        return req.kind;
    }
  };

  const neutral = (req: SpeakReq): Spoken => {
    const v = vars(req);
    if (req.kind === 'question' && req.ctx.question) return { text: req.ctx.question.theme, source: 'fallback', tags: [] };
    if (req.kind === 'twistintro' && req.ctx.twist) return { text: req.ctx.twist.rule, source: 'fallback', tags: [] };
    const key = neutralKey(req);
    const text = neutralText(key, v, req.maxWords);
    const out: Spoken = { text, source: 'fallback', tags: [] };
    const card = (req.hint?.card as { id?: string } | undefined)?.id;
    if ((key === 'guess' || key === 'fear') && card && v.card && text.includes(String(v.card))) out.guess = card;
    return out;
  };

  /**
   * Play toward the cards, for the lines the star reacts to (answer, twist, one-on-one opener):
   * +10 if tagged with the face-up card; then 1 + the number of the speaker's own top tags on the line
   * (draw.ts TOP_TAGS), or 1 if tagged at all, or 0; +0.5 for a line written for this star or target
   * over a generic one. The suitor never sees the hidden cards: the draw (draw.ts) makes cards the cast
   * naturally plays likely, so playing to their own strengths finds them.
   */
  const cardRank = (ctx: Ctx, mine: string[], specific?: Set<L>, faceUp = FACE_UP_RANK) => (l: L) => {
    const t = tagsOf(l);
    const own = t.filter((x) => mine.includes(x)).length;
    return (ctx.faceUp && t.includes(ctx.faceUp.id) ? faceUp : 0) + OWN_RANK * (own ? 1 + own : t.length ? 1 : 0) + (specific?.has(l) ? 0.5 : 0);
  };

  /** first word, lowercased, for "no two lines built the same way" */
  const firstWord = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}']+/u)?.[0] ?? '');

  const suitorTiers = (req: SpeakReq, b: SuitorBank | null): { tiers: L[][]; prefer?: (l: L) => number; reject?: (l: L) => boolean } => {
    if (!b) return { tiers: [] };
    const { ctx } = req;
    const h = req.hint ?? {};
    const tid = req.target?.id ?? '';
    const c = (b.confessions ?? {}) as SuitorBank['confessions'];
    const faceUpPref = (_ctx: Ctx, specific?: L[]) => cardRank(ctx, tops(b), specific ? new Set(specific) : undefined);
    const oo = (b.oneOnOne ?? {}) as SuitorBank['oneOnOne'];
    switch (req.kind) {
      case 'opener': {
        const rec = ctx.records[req.who.id] ?? { played: 0, wins: 0 };
        // record slots read badly before the first episode
        return { tiers: [arr(b.openers)], reject: rec.played === 0 ? (l) => /\{(played|wins|losses)\}/.test(l.t) : undefined };
      }
      case 'answer': {
        // v2 round one: the fourth suitor replies to the leader's answer (a steal or undercut)
        if (typeof h.reply === 'string') return { tiers: [arr(b.jabs?.[h.reply]), arr(b.jabs?.any)], prefer: faceUpPref(ctx) };
        return { tiers: [arr(b.answers?.[ctx.question?.id ?? '']), arr((b.answers as Record<string, L[]>)?.any)], prefer: faceUpPref(ctx) };
      }
      case 'confession': {
        const f = String(h.flavour ?? 'star');
        // booth two: the second confession is not built like the first (a preference, not a rule)
        const avoid = typeof h.avoid === 'string' ? firstWord(h.avoid) : '';
        const prefer = avoid ? (l: L) => (firstWord(l.t) === avoid ? -1 : 0) : undefined;
        if (f === 'guess' || f === 'fear') {
          // v2 read of the star; v1 banks fall back to the after-charm / after-cringe lines
          const v1 = f === 'guess' ? arr(c.afterCharm) : arr(c.afterCringe);
          return { tiers: [arr(c[f]), v1, arr(c.star)], prefer };
        }
        const tiers = [arr((c as unknown as Record<string, unknown>)[f])];
        if (f === 'final') tiers.push(arr(c.rival));
        if (f === 'afterCharm' || f === 'afterCringe') tiers.push(arr(c.star));
        if (f === 'rival') tiers.push(arr(c.final));
        tiers.push(arr(c.star));
        return { tiers, prefer };
      }
      case 'twist': {
        const tw = ctx.twist;
        if (!tw) return { tiers: [] };
        if (tw.format === 'target-left')
          return { tiers: [arr(b.roast?.[tid]), arr(b.twists?.[tw.id]), arr(b.jabs?.[tid]), arr(b.jabs?.any)], prefer: faceUpPref(ctx) };
        if (tw.format === 'target-right')
          return { tiers: [arr(b.wingman?.[tid]), arr(b.twists?.[tw.id])], prefer: faceUpPref(ctx) };
        return { tiers: [arr(b.twists?.[tw.id])], prefer: faceUpPref(ctx) };
      }
      case 'jab':
        if (h.step === 'comeback') return { tiers: [arr(b.comeback), arr(b.jabs?.[tid]), arr(b.jabs?.any)] };
        return { tiers: [arr(b.jabs?.[tid]), arr(b.jabs?.any)] };
      case 'duo': {
        if (h.step === 'close') {
          const warm = h.mark !== 'cringing';
          // v2: the closer that answers this star's prompt (same index as the prompt in her oneOnOne[me])
          const i = typeof h.prompt === 'number' ? h.prompt : -1;
          const pair = i >= 0 ? oo.close?.[ctx.star.id]?.[i] : undefined;
          const v2 = pair ? (warm ? [anyL(pair.warm), anyL(pair.cold)] : [anyL(pair.cold), anyL(pair.warm)]) : [];
          return { tiers: [...v2, ...(warm ? [arr(oo.closeWarm), arr(oo.closeCold)] : [arr(oo.closeCold), arr(oo.closeWarm)])] };
        }
        // one tier: lines for this star and generic ones compete on the play-to-card rank. Alone with
        // her, a suitor plays their own strengths, not the face-up card everyone has played all night:
        // that would hand the first date the pick (FORMAT2 wants the last word to be a real chance).
        const mineOpen = arr(oo.open?.[ctx.star.id]);
        const open = [...mineOpen, ...arr(oo.open?.any)];
        const own = cardRank(ctx, tops(b), new Set(mineOpen), 0);
        if (h.step === 'steal') return { tiers: [arr(oo.steal), open], prefer: own };
        return { tiers: [open], prefer: own };
      }
      case 'exit':
        return { tiers: [arr(b.exit)] };
      case 'win':
        return { tiers: [arr(b.win)] };
      case 'lose':
        return { tiers: [arr(b.lose)] };
      default:
        return { tiers: [] };
    }
  };

  const starTiers = (req: SpeakReq, b: StarBank | null): L[][] => {
    if (!b) return [];
    const { ctx } = req;
    const h = req.hint ?? {};
    const tid = req.target?.id ?? '';
    const by = (rec: Record<string, string[]> | undefined) => [asL(rec?.[tid]), asL(rec?.any)];
    switch (req.kind) {
      case 'intro': {
        // v2: an intro that names the face-up card first
        const all = anyL(b.intro);
        return [all.filter((l) => l.t.includes('{card}')), all.filter((l) => !l.t.includes('{card}'))];
      }
      case 'question': {
        const q = b.questions?.[ctx.question?.id ?? ''];
        return typeof q === 'string' ? [[{ t: q }]] : [];
      }
      case 'twistintro': {
        const t = b.twistIntro?.[ctx.twist?.id ?? ''];
        return typeof t === 'string' ? [[{ t }]] : [];
      }
      case 'caller':
        return [asL(b.ex?.lines)];
      case 'cutline': {
        // v2: a hint at the hidden card that decided a tie, else the reason that quotes them, else v1
        const hintCard = typeof h.cardHint === 'string' ? h.cardHint : '';
        const tiers: L[][] = [];
        if (hintCard && typeof b.cardHint?.[hintCard] === 'string') tiers.push([{ t: b.cardHint[hintCard]! }]);
        tiers.push(asL(b.cutFrames));
        return [...tiers, ...by(b.cut)];
      }
      case 'pickline':
        return [asL(b.pickFrames), ...by(b.pick)];
      case 'hold': {
        const id = (h.card as { id?: string } | undefined)?.id ?? '';
        const hc = b.holdCard?.[id];
        return [typeof hc === 'string' ? [{ t: hc }] : [], asL(b.hold)];
      }
      case 'outro':
        return [asL(b.outro)];
      case 'reveal': {
        const verdict = String(h.verdict ?? 'none') as 'on' | 'off' | 'none';
        return [asL(b.reveal?.[verdict])];
      }
      case 'bottom':
        return [asL(b.bottom)];
      case 'verdict': {
        const t = b.verdict?.[ctx.twist?.id ?? ''];
        return typeof t === 'string' ? [[{ t }]] : [];
      }
      case 'compare':
        return [asL(b.compare)];
      case 'duo':
        return by(b.oneOnOne);
      case 'confession': {
        // the star's private aside (FORMAT2 keeps the star out of the booth; kept for old callers)
        const loose = b as unknown as { asides?: unknown; confessions?: unknown };
        return [anyL(loose.asides), anyL(loose.confessions), asL(b.hold), asL(b.outro)];
      }
      default:
        return [];
    }
  };

  const reactVars = (req: ReactReq) => ({ rival: req.to.name, target: req.to.name, star: req.star.name, name: req.to.name });
  const epReset = (ep: number) => {
    if (epUsed.ep !== ep) (epUsed.ep = ep), epUsed.texts.clear();
  };

  /** v2: the paired reply for this exact line: keyed by its bank text (slots unfilled) or its aired text */
  const pairFor = (req: ReactReq): { warm: string; cold: string } | null => {
    const rb = banks.replies(req.star.id, req.to.id);
    const rs = rb?.replies;
    if (!rs || typeof rs !== 'object') return null;
    const key = typeof req.hint?.key === 'string' ? (req.hint.key as string) : templates.get(req.line) ?? req.line;
    const p = rs[key] ?? rs[req.line];
    return p && typeof p.warm === 'string' && typeof p.cold === 'string' ? p : null;
  };

  /** Tiers for a reaction with a given mark and hits: the paired reply, then cardReact, then react. One on one: her prompts. */
  const reactTiers = (req: ReactReq, mark: Mark, hits: string[]): { tiers: L[][]; paired: number } => {
    const draw = req.ctx.type;
    const b = banks.star(req.star.id);
    const duo = req.hint?.beat === 'duo' || (req.hint?.beat === undefined && req.ctx.alive.length <= 2);
    const tiers: L[][] = [];
    if (duo) {
      // v2: the star's middle line in a one on one is her prompt to that suitor (a question, order or dare)
      if (b) tiers.push(asL(b.oneOnOne?.[req.to.id]), asL(b.oneOnOne?.any));
      return { tiers, paired: -1 };
    }
    let paired = -1;
    const p = pairFor(req);
    if (p) {
      paired = tiers.length;
      tiers.push([{ t: mark === 'charmed' ? p.warm : p.cold }]);
    }
    if (b && draw && hits.length) {
      const db = draw.cards[2].id;
      const key = hits.includes(db) ? db : hits[0]!;
      const cr = b.cardReact?.[key];
      const t = cr ? (key === db ? cr.off : cr.on) : undefined;
      if (typeof t === 'string') tiers.push([{ t }]);
    }
    if (b) tiers.push(asL(b.react?.[req.to.id]?.[mark]), asL(b.react?.any?.[mark]));
    return { tiers, paired };
  };

  /** speak()'s tiers and rank for a request, for any speaker */
  const plan = (req: SpeakReq): { tiers: L[][]; prefer?: (l: L) => number; reject?: (l: L) => boolean } => {
    const isStar = req.who.role === 'star' || req.who.id === req.ctx.star.id;
    if (isStar) return { tiers: starTiers(req, banks.star(req.who.id)) };
    return suitorTiers(req, banks.suitor(req.who.id));
  };

  /** the bank fields a chosen line carries back: tags (suitors), a valid hook, the card a read names */
  const spoken = (req: SpeakReq, got: { text: string; tags: string[]; l: L }, isStar: boolean): Spoken => {
    const out: Spoken = { text: got.text, source: 'bank', tags: isStar ? [] : got.tags };
    const hook = validHook(got.l.hook, got.text);
    if (hook) out.hook = hook;
    const card = (req.hint?.card as { id?: string } | undefined)?.id;
    if (req.kind === 'confession' && card && got.l.t.includes('{card}')) out.guess = card;
    return out;
  };

  /** the mark for a line, from its hits: turn-on charmed, dealbreaker cringing, else charmed rarely */
  const markFor = (hits: string[], dealbreaker: string | null, steal = false): Mark => {
    if (dealbreaker && hits.includes(dealbreaker)) return 'cringing';
    if (hits.length) return 'charmed';
    return weighted<Mark>(rng, steal ? STEAL_MIX : NO_HIT_MIX);
  };

  const brain: ScriptedBrain = {
    kind: 'scripted',
    banks,
    exName(starId: string) {
      const n = banks.star(starId)?.ex?.name;
      return typeof n === 'string' && n.trim() ? n.trim() : null;
    },
    neutral,
    neutralReaction(mark: Mark, duo = false) {
      return neutralText(duo ? 'duoStar' : mark, {}, duo ? 14 : 10);
    },
    hasReplies(starId: string, suitorId: string) {
      const r = banks.replies(starId, suitorId)?.replies;
      return !!r && typeof r === 'object' && Object.keys(r).length > 0;
    },
    templateOf(text: string) {
      return templates.get(text) ?? text;
    },
    replyPair(req: ReactReq) {
      try {
        return pairFor(req);
      } catch {
        return null;
      }
    },

    async speak(req: SpeakReq): Promise<Spoken> {
      try {
        const v = vars(req);
        const isStar = req.who.role === 'star' || req.who.id === req.ctx.star.id;
        const t = plan(req);
        const got = choose(req.who.id, t.tiers, v, req.maxWords, req.ctx.episode, t.prefer, t.reject);
        if (got) return spoken(req, got, isStar);
        if (isStar && req.kind === 'confession') return { text: neutralText('starAside', v, req.maxWords), source: 'fallback', tags: [] };
        return neutral(req);
      } catch (e) {
        o.log?.(`scripted speak failed: ${(e as Error).message}`);
        return neutral(req);
      }
    },

    candidates(req: SpeakReq, n: number): Candidate[] {
      try {
        const isStar = req.who.role === 'star' || req.who.id === req.ctx.star.id;
        const t = plan(req);
        const out: Candidate[] = [];
        const seen = new Set<string>();
        for (const x of ranked(req.who.id, t.tiers, vars(req), req.maxWords, req.ctx.episode, t.prefer, t.reject)) {
          if (out.length >= n) break;
          if (seen.has(x.text)) continue;
          seen.add(x.text);
          offer(x.text, lkey(req.who.id, x.l));
          remember(x.text, x.l.t);
          const tags = isStar ? [] : tagsOf(x.l);
          const c: Candidate = tags.length ? { text: x.text, tags } : { text: x.text };
          const hook = validHook(x.l.hook, x.text);
          if (hook) c.hook = hook;
          out.push(c);
        }
        return out;
      } catch (e) {
        o.log?.(`scripted candidates failed: ${(e as Error).message}`);
        return [];
      }
    },

    reactCandidates(req: ReactReq, mark: Mark, hits: string[], n: number): string[] {
      try {
        epReset(req.ctx.episode);
        const v = reactVars(req);
        const all = ranked(req.star.id, reactTiers(req, mark, hits).tiers, v, req.maxWords, req.ctx.episode);
        // lines already said this episode go last
        const fresh = all.filter((x) => !epUsed.texts.has(lkey(req.star.id, x.l)));
        const used = all.filter((x) => epUsed.texts.has(lkey(req.star.id, x.l)));
        const out: string[] = [];
        for (const x of [...fresh, ...used]) {
          if (out.length >= n) break;
          if (out.includes(x.text)) continue;
          const key = lkey(req.star.id, x.l);
          offer(x.text, key, { ep: req.ctx.episode, key });
          out.push(x.text);
        }
        return out;
      } catch (e) {
        o.log?.(`scripted reactCandidates failed: ${(e as Error).message}`);
        return [];
      }
    },

    release(text: string, episode: number) {
      const r = reacted.get(text);
      if (!r || r.ep !== episode) return;
      if (epUsed.ep === episode) epUsed.texts.delete(r.key);
      lru.restore(r.key, r.prevTick, r.prevEp);
      reacted.delete(text);
    },

    markUsed(text: string, episode?: number) {
      const x = offered.get(text);
      if (!x) return;
      for (const k of x.keys) lru.touch(k, episode ?? x.react?.ep);
      if (x.react) {
        epReset(x.react.ep);
        epUsed.texts.add(x.react.key);
      }
    },

    async react(req: ReactReq): Promise<Reacted> {
      const draw = req.ctx.type;
      const snap = req.hint?.beat === 'snap';
      const duo = req.hint?.beat === 'duo' || (req.hint?.beat === undefined && req.ctx.alive.length <= 2);
      let mark: Mark = weighted<Mark>(rng, NO_HIT_MIX);
      let hits: string[] = [];
      try {
        if (draw) {
          // a walk-on snap is judged only against the face-up card (nothing hidden is decided in window A)
          hits = snap ? cleanHits(req.tags ?? [], draw).filter((h) => h === draw.cards[0].id) : cleanHits(req.tags ?? [], draw);
          mark = markFor(hits, snap ? null : draw.cards[2].id, req.hint?.steal === true);
        }
        const v = reactVars(req);
        const { tiers, paired } = reactTiers(req, mark, hits);
        // a star never repeats a reaction within one episode if any other line fits
        epReset(req.ctx.episode);
        const key = (l: L) => lkey(req.star.id, l);
        const all = ranked(req.star.id, tiers, v, req.maxWords, req.ctx.episode, undefined, (l) => epUsed.texts.has(key(l)));
        const pool = all.length ? all : ranked(req.star.id, tiers, v, req.maxWords, req.ctx.episode);
        if (pool.length) {
          const top = pool[0]!;
          const best = pool.filter((x) => x.tier === top.tier && x.stale === top.stale && x.last === top.last);
          const got = pick(rng, best);
          if (reacted.size > 2000) reacted.clear();
          reacted.set(got.text, { key: key(got.l), ep: req.ctx.episode, prevEp: lru.lastEp(key(got.l)), prevTick: lru.last(key(got.l)) });
          lru.touch(key(got.l), req.ctx.episode);
          epUsed.texts.add(key(got.l));
          const out: Reacted = { mark, hits, text: got.text, source: 'bank' };
          if (!duo && got.tier === paired) out.paired = true;
          return out;
        }
      } catch (e) {
        o.log?.(`scripted react failed: ${(e as Error).message}`);
      }
      return { mark, hits, text: neutralText(duo ? 'duoStar' : mark, {}, req.maxWords), source: 'fallback' };
    },

    async choose(req: { star: Bot; among: Bot[]; purpose: 'cut' | 'pick'; ctx: Ctx }): Promise<string> {
      return pick(rng, req.among).id;
    },
  };
  return brain;
}
