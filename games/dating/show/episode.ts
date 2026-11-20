// runEpisode(show, deps): the whole script of one episode (SPEC "Episode timeline", show/FORMAT2.md).
//
// Two sides run at once:
// - the generation chain ("gen") asks the brain for each line in order, as soon as the line before
//   it exists (pipelined), and keeps the room, marks and standings the bots see;
// - the airing side plays each line at speaking pace, waiting at most `waitCapMs` (show time) for a
//   line that is due but not ready, then airing the scripted line instead.
// Each line is a Slot: whichever comes first, the generated line or the forced fallback, is final for
// both sides, so what the bots remember is exactly what aired.
//
// Rule for windows: everything aired while a window is open is generated before it opens, and
// generation for a round starts only after the latest lock. One exception, by design (FORMAT2): the
// walk-on's snap reactions and last-word jab depend on the face-up card, which window A's sealed value
// fixes, so they are made in the first seconds of window A. They are judged only against that public
// card and air as soon as they exist, so nothing hidden is decided while a window is open.

import type { Entrant, Show } from '../../../runner/src/types.ts';
import type {
  Bot, Brain, CardView, CastMember, Ctx, DatingMeta, Decks, EvBottom, EvConfession, EvCut, EvHold, EvLine, EvPick,
  EvReaction, EvReplay, EvResult, EvReveal, EvScene, EvTwist, LineKind, Mark, PublicState, Question, ReactReq,
  RoomLine, SceneId, SpeakReq, Spoken, SuitorMember, TypeCard, TypeDraw,
} from './types.ts';
import type { Candidate, ScriptedBrain } from './brains/scripted.ts';
import { fillSlots, validHook } from './brains/scripted.ts';
import type { Cast } from './cast.ts';
import { castIds } from './cast.ts';
import type { MemoryStore, Rec } from './memory.ts';
import { check, limitFor } from './content.ts';
import { bankAffinity, draw as drawType, freshRng, owners as cardOwners, pick, randomHex, shuffle, topTags, weighted, type CastAffinity, type Rng } from './draw.ts';
import {
  type Scored, type Standing, bestLine, cleanHits, coherentMark, cutOrder, dealbreakerLine, decidingCards, explain, lineScore,
  pickOrder, replayLine, standings, tieBreakCard, worstLine, DUO_WEIGHT, MARK_SCORE,
} from './judge.ts';
import { BEAT, GAP, TARGET, VOICES, quoteMs, speakMs, words } from './timing.ts';

export const SHOW_TITLE = 'Compatibility Mode';

export interface EpisodeDeps {
  decks: Decks;
  brain: Brain;
  /** scripted: timeouts, failed checks, forced lines */
  fallback: ScriptedBrain;
  memory: MemoryStore;
  cast: Cast;
  /** the next episode's cast, for the teaser in `result` */
  next?: Cast | null;
  /** post-lock randomness (question, order, ties); default crypto */
  rng?: Rng;
  /** show-time cap on a line that is due but not ready (default 6000). Infinity: wait for the call. */
  waitCapMs?: number;
  /** real-time cap on one brain call (default 6000); on timeout the scripted line airs */
  callTimeoutMs?: number;
  log?: (s: string) => void;
}

// ------------------------------------------------------------------------------------------
// Transcript (returned, never broadcast)
// ------------------------------------------------------------------------------------------

export interface TLine {
  seq: number;
  scene: SceneId;
  event: 'line' | 'reaction' | 'confession' | 'bottom' | 'cut' | 'pick' | 'reveal' | 'replay';
  who: string;
  name: string;
  kind: string;
  text: string;
  to?: string;
  about?: string;
  mark?: Mark;
  /** hidden: card ids this line (or, for a reaction, the line it answers) hit */
  hits?: string[];
  source: 'model' | 'bank' | 'fallback';
  /** finer source when known: bank, chosen (model picked a bank line), written (model wrote it), fallback */
  via?: string;
  /** reaction: the mark the brain gave before coherence fixed it */
  markWas?: Mark;
  /** reaction: false when the star gave the mark alone (empty text on air) */
  spoken?: boolean;
  /** reaction: the text is the star's paired reply to that exact line */
  paired?: boolean;
  /** confession: the card the suitor's read names, and whether it is right */
  guess?: { id: string; label: string; kind: 'on' | 'off'; right: boolean };
  /** bottom: the two lowest */
  pair?: [string, string];
  /** replay: the hidden card slot it is evidence for */
  slot?: 1 | 2;
  words: number;
  maxWords: number;
  at: number;
  ms: number;
  genMs: number;
  waitedMs: number;
  forced?: boolean;
  quote?: { who: string; name: string; text: string };
}

export interface Transcript {
  episode: number;
  matchId: string;
  brain: string;
  sealed: string;
  sealedSource: 'window' | 'local';
  star: { id: string; name: string };
  suitors: { id: string; name: string; spot: number }[];
  draw: {
    cards: { slot: number; id: string; label: string; kind: 'on' | 'off' }[];
    twist: { id: string; label: string; rule: string; format: string };
    /** the public input of the weighted draw: each suitor's top tags, and each card's natural owners */
    topTags: Record<string, string[]>;
    owners: Record<string, string[]>;
  };
  question: { id: string; theme: string };
  order: string[];
  lines: TLine[];
  scored: Scored[];
  standings: { after: string; standing: Standing }[];
  cuts: {
    id: string; name: string; round: 1 | 2; standing: Standing; tie: string[]; reason: string; deciding: string[];
    /** v2: this round's mark score per alive suitor, the two named before the cut, the hidden card hinted at */
    roundMarks: Record<string, number>; bottom: [string, string]; hintCard: string | null; hook: string | null;
  }[];
  pick: { winner: string; loser: string; standing: Standing; tie: string[]; reason: string; oneOnOne: Record<string, number>; first: string; last: string };
  reveals: { slot: 1 | 2; card: string; quote: { who: string; text: string } | null; replays: { who: string; text: string; hit: boolean }[]; guesses: { who: string; right: boolean }[] }[];
  guesses: { who: string; card: string; kind: 'on' | 'off'; right: boolean; via: string }[];
  windows: { tag: 'A' | 'B' | 'C'; windowId: string; outcomes: string[]; durationMs: number; targetMs: number; beats: number; openAt: number; lockAt: number }[];
  timeline: { at: number; type: string; ms: number }[];
  rejected: { who: string; kind: string; text: string; reason: string }[];
  late: number;
  durationMs: number;
}

// ------------------------------------------------------------------------------------------
// Internals
// ------------------------------------------------------------------------------------------

const MARKS: Mark[] = ['charmed', 'unsure', 'cringing'];
const MARK_RANK: Record<Mark, number> = { cringing: 0, unsure: 1, charmed: 2 };
/** stands in for the face-up card in the intro until window A's sealed value fixes it */
const CARD_TOKEN = 'Xqcardqx';

const LABELS: Record<SceneId, string> = {
  title: SHOW_TITLE,
  walkon: 'The Walk-On',
  round1: 'Round One',
  booth1: 'The Booth',
  round2: 'Round Two',
  booth2: 'The Booth',
  oneonone: 'One on One',
  pick: 'The Pick',
  reveal: 'The Reveal',
  result: 'The Match',
};

interface Said {
  text: string;
  source: 'model' | 'bank' | 'fallback';
  via?: string;
  tags: string[];
  genMs: number;
  hook?: string;
  guess?: string;
  /** the bank text the line came from (slots unfilled), the key of its paired replies */
  key?: string;
}
interface Item extends Said {
  who: Bot;
  kind: SpeakReq['kind'];
  maxWords: number;
  to?: string;
  about?: string;
  /** shown as someone else (the ex) */
  as?: { id: string; name: string };
  /** a booth read: the card it names */
  guessCard?: { id: string; label: string; kind: 'on' | 'off' };
}
interface ReItem {
  to: Bot;
  mark: Mark;
  hits: string[];
  text: string;
  source: 'model' | 'bank' | 'fallback';
  via?: string;
  markWas?: Mark;
  paired?: boolean;
  genMs: number;
  maxWords: number;
  weight: number;
}
interface Decision {
  id: string;
  tie: string[];
}

class Slot<T> {
  done = false;
  value!: T;
  forced = false;
  readonly p: Promise<T>;
  fb?: () => Promise<T>;
  private res!: (v: T) => void;
  constructor() {
    this.p = new Promise<T>((r) => (this.res = r));
  }
  offer(v: T): boolean {
    if (this.done) return false;
    this.done = true;
    this.value = v;
    this.res(v);
    return true;
  }
}

class Timeout extends Error {}
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (!Number.isFinite(ms)) return p;
  let timer: ReturnType<typeof setTimeout>;
  const t = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Timeout(`timeout ${ms}ms`)), ms);
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** bank / chosen / written / fallback: a brain may set `via` on its answer (the hybrid model brain does) */
function viaOf(r: object, source: 'model' | 'bank' | 'fallback', fellBack: boolean): string {
  const v = (r as { via?: unknown }).via;
  if (fellBack) return 'fallback';
  if (typeof v === 'string' && v) return v;
  return source === 'model' ? 'written' : source;
}
/** estimated airtime of a line of `maxWords` (full, so the pacer never stretches early and overruns at the word limit) plus the gap */
const est = (maxWords: number) => speakMs('x '.repeat(maxWords)) + GAP;
/** airtime of a mark-only reaction plus the gap */
const estMark = () => BEAT.markOnly + GAP;

/**
 * Stretches the silence after each item (up to BEAT.maxStretch) so a scene lands near its target.
 * `plan` is the scene's items (airtime + gap), in any order: each aired item takes the plan entry
 * nearest its own length, so the order the beats air in does not matter.
 */
class Pacer {
  private start: number;
  private show: Show;
  private target: number;
  private rest: number[];
  private max: number;
  constructor(show: Show, target: number, plan: number[], max: number = BEAT.maxStretch) {
    this.show = show;
    this.target = target;
    this.rest = plan.slice();
    this.max = max;
    this.start = show.elapsed();
  }
  /** extra silence after the item about to air for `ms` */
  extra(ms: number): number {
    if (this.rest.length) {
      let k = 0;
      for (let j = 1; j < this.rest.length; j++) if (Math.abs(this.rest[j]! - (ms + GAP)) < Math.abs(this.rest[k]! - (ms + GAP))) k = j;
      this.rest.splice(k, 1);
    }
    const rest = this.rest.reduce((a, b) => a + b, 0);
    const left = this.start + this.target - (this.show.elapsed() + ms + GAP) - rest;
    const gaps = this.rest.length + 1;
    return Math.round(clamp(left / gaps, 0, this.max));
  }
}

const ROUND_WORD: Record<number, string> = { 1: 'round one', 2: 'round two' };
/** how strongly the star's hidden cards pull the round-one question (see chooseQuestion) */
const QUESTION_PULL = 3;
/** chance a scripted booth read names the true hidden card (else a decoy) */
const TRUE_READ = 0.5;

const firstWord = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}']+/u)?.[0] ?? '');
/** "device" of an opener (FORMAT2 lineup rule), approximated by its first tag and its first word */
const deviceOf = (o: { text: string; tags?: string[] }) => ({ tag: o.tags?.[0] ?? '', word: firstWord(o.text) });
const sameDevice = (a: { text: string; tags?: string[] }, b: { text: string; tags?: string[] }) => {
  const x = deviceOf(a), y = deviceOf(b);
  return (!!x.tag && x.tag === y.tag) || (!!x.word && x.word === y.word);
};

// ------------------------------------------------------------------------------------------

class Episode {
  private show: Show;
  private d: EpisodeDeps;
  private rng: Rng;
  private waitCap: number;
  private callTimeout: number;
  private log: (s: string) => void;

  private n: number;
  private matchId: string;
  private star: Bot;
  private suitors: Bot[];
  private byId = new Map<string, Bot>();
  private records: Record<string, Rec> = {};
  private draw: TypeDraw | null = null;
  private question: Question | undefined;
  private exName = 'The Ex';

  // generation side (what the bots see)
  private room: RoomLine[] = [];
  private gMarks: Record<string, Mark[]> = {};
  private gAlive: string[];
  private gTwist = false;
  private scored: Scored[] = [];
  private seq = 0;
  /** who has made a booth read, and of which card */
  private reads = new Map<string, { id: string; label: string; kind: 'on' | 'off' }>();

  // airing side (what viewers have seen)
  private pScene: SceneId = 'title';
  private pWindow: 'A' | 'B' | 'C' | null = null;
  private pAlive: string[];
  private pCut: { id: string; round: 1 | 2 | 3 }[] = [];
  private pMarks: Record<string, Mark[]> = {};
  private pCards: CardView[] = [];
  private pTwist: PublicState['twist'] = null;
  private pFocus: string | null = null;
  private pWinner: string | null = null;

  private tx: Transcript;
  private lineSeq = 0;
  private genFailed = false;

  constructor(show: Show, d: EpisodeDeps) {
    this.show = show;
    this.d = d;
    this.rng = d.rng ?? freshRng();
    this.waitCap = d.waitCapMs ?? BEAT.waitCap;
    this.callTimeout = d.callTimeoutMs ?? BEAT.waitCap;
    this.log = d.log ?? (() => {});
    this.n = d.memory.nextEpisode();
    this.star = d.cast.star;
    this.suitors = d.cast.suitors.slice(0, 4);
    for (const b of [this.star, ...this.suitors]) {
      this.byId.set(b.id, b);
      this.records[b.id] = d.memory.record(b.id);
    }
    this.gAlive = this.suitors.map((s) => s.id);
    this.pAlive = this.gAlive.slice();
    for (const s of this.suitors) (this.gMarks[s.id] = []), (this.pMarks[s.id] = []);
    this.matchId = `dating-ep${this.n}-${Date.now().toString(36)}`;
    this.tx = {
      episode: this.n,
      matchId: this.matchId,
      brain: d.brain.kind,
      sealed: '',
      sealedSource: 'window',
      star: { id: this.star.id, name: this.star.name },
      suitors: this.suitors.map((s, i) => ({ id: s.id, name: s.name, spot: i })),
      draw: { cards: [], twist: { id: '', label: '', rule: '', format: '' }, topTags: {}, owners: {} },
      question: { id: '', theme: '' },
      order: [],
      lines: [],
      scored: this.scored,
      standings: [],
      cuts: [],
      pick: { winner: '', loser: '', standing: {}, tie: [], reason: '', oneOnOne: {}, first: '', last: '' },
      reveals: [],
      guesses: [],
      windows: [],
      timeline: [],
      rejected: [],
      late: 0,
      durationMs: 0,
    };
  }

  private bot(id: string): Bot {
    return this.byId.get(id)!;
  }

  // ---------------------------------------------------------------------------------------
  // Feed
  // ---------------------------------------------------------------------------------------

  private emit<T extends object>(type: string, data: T) {
    const at = this.show.elapsed();
    this.show.emit({ type, at, data });
    this.tx.timeline.push({ at, type, ms: (data as { ms?: number }).ms ?? 0 });
    return at;
  }

  private sleep(ms: number): Promise<void> {
    return ms > 0 ? this.show.sleep(Math.round(ms)) : Promise.resolve();
  }

  private member(b: Bot): CastMember {
    const m: CastMember = {
      id: b.id,
      name: b.name,
      tagline: b.tagline,
      pronouns: b.pronouns,
      accent: b.look.accent,
      cast: b.look.cast,
      model: b.model,
      record: this.records[b.id] ?? { played: 0, wins: 0 },
    };
    if (b.voice) m.voice = b.voice;
    return m;
  }

  private state(): PublicState {
    return {
      scene: this.pScene,
      label: LABELS[this.pScene],
      alive: this.suitors.map((s) => s.id).filter((id) => this.pAlive.includes(id)),
      cut: this.pCut.map((c) => ({ ...c })),
      marks: Object.fromEntries(this.suitors.map((s) => [s.id, (this.pMarks[s.id] ?? []).slice()])),
      cards: this.pCards.map((c) => ({ ...c })),
      twist: this.pTwist ? { ...this.pTwist } : null,
      window: this.pWindow,
      focus: this.pFocus,
      winner: this.pWinner,
    };
  }

  private async scene(scene: SceneId, window: 'A' | 'B' | 'C' | null, ms: number, focus: string | null = null) {
    this.pScene = scene;
    this.pWindow = window;
    this.pFocus = focus;
    const ev: EvScene = { state: this.state(), ms };
    this.emit('scene', ev);
    await this.sleep(ms);
  }

  private recordLine(t: Omit<TLine, 'seq' | 'scene' | 'words'>) {
    this.tx.lines.push({ seq: ++this.lineSeq, scene: this.pScene, words: words(t.text), ...t });
  }

  // ---------------------------------------------------------------------------------------
  // Brain calls that never throw
  // ---------------------------------------------------------------------------------------

  private ctx(speaker: Bot): Ctx {
    return {
      episode: this.n,
      star: this.star,
      suitors: this.suitors,
      alive: this.gAlive.slice(),
      room: this.room.slice(),
      marks: Object.fromEntries(Object.entries(this.gMarks).map(([k, v]) => [k, v.slice()])),
      // undefined before the draw (intro and openers are generated before window A opens)
      faceUp: (this.draw?.cards[0] ?? undefined) as TypeCard,
      type: speaker.id === this.star.id && this.draw ? this.draw : undefined,
      twist: this.gTwist && this.draw ? this.draw.twist : undefined,
      question: this.question,
      records: this.records,
      memory: this.d.memory.memory(speaker.id),
      recent: this.d.memory.recentLines(speaker.id),
    };
  }

  private reject(req: { who: Bot; kind: string }, text: string, reason: string) {
    this.tx.rejected.push({ who: req.who.id, kind: req.kind, text: String(text ?? '').slice(0, 200), reason });
  }

  /** brain, then the scripted fallback, then a neutral line. Every result passes the content check. */
  private async speakSafe(req: SpeakReq, brain: Brain = this.d.brain): Promise<Said> {
    const t0 = Date.now();
    const tries: Brain[] = brain === this.d.fallback ? [brain] : [brain, this.d.fallback];
    for (const b of tries) {
      let r: Spoken | null = null;
      try {
        r = await withTimeout(b.speak(req), b === this.d.fallback ? 3000 : this.callTimeout);
      } catch (e) {
        this.reject(req, '', e instanceof Timeout ? 'timeout' : `error: ${(e as Error)?.message ?? e}`);
        continue;
      }
      if (!r || typeof r.text !== 'string') {
        this.reject(req, '', 'no text');
        continue;
      }
      const c = check(r.text, { maxWords: req.maxWords });
      if (c.ok) {
        const source = r.source === 'model' || r.source === 'bank' || r.source === 'fallback' ? r.source : 'fallback';
        const out: Said = { text: c.cleaned, source, via: viaOf(r, source, b !== brain), tags: Array.isArray(r.tags) ? r.tags : [], genMs: Date.now() - t0 };
        const hook = validHook(r.hook, c.cleaned);
        if (hook) out.hook = hook;
        if (typeof r.guess === 'string' && r.guess) out.guess = r.guess;
        const key = this.d.fallback.templateOf?.(r.text);
        if (key && key !== c.cleaned) out.key = key;
        return out;
      }
      this.reject(req, r.text, c.reason);
    }
    const n = this.d.fallback.neutral(req);
    const out: Said = { text: check(n.text, { maxWords: req.maxWords }).cleaned, source: 'fallback', tags: [], genMs: Date.now() - t0 };
    if (n.guess) out.guess = n.guess;
    return out;
  }

  private async reactSafe(req: ReactReq, brain: Brain = this.d.brain): Promise<Omit<ReItem, 'to' | 'maxWords' | 'weight'>> {
    const t0 = Date.now();
    const draw = this.draw!;
    const snap = req.hint?.beat === 'snap';
    const tries: Brain[] = brain === this.d.fallback ? [brain] : [brain, this.d.fallback];
    const who = { who: req.star, kind: 'reaction' };
    for (const b of tries) {
      let r: Awaited<ReturnType<Brain['react']>> | null = null;
      try {
        r = await withTimeout(b.react(req), b === this.d.fallback ? 3000 : this.callTimeout);
      } catch (e) {
        this.reject(who, '', e instanceof Timeout ? 'timeout' : `error: ${(e as Error)?.message ?? e}`);
        continue;
      }
      if (!r || !MARKS.includes(r.mark)) {
        this.reject(who, String(r?.text ?? ''), 'bad mark');
        continue;
      }
      // a walk-on snap is judged only against the face-up card, whatever the brain says
      const hits = snap ? cleanHits(r.hits, draw).filter((h) => h === draw.cards[0].id) : cleanHits(r.hits, draw);
      // coherence before scoring and before airing: a dealbreaker hit cringes, a turn-on never does
      const mark = coherentMark(r.mark, hits, draw);
      const c = check(String(r.text ?? ''), { maxWords: req.maxWords });
      let text = c.cleaned;
      let source: ReItem['source'] = r.source === 'model' || r.source === 'bank' || r.source === 'fallback' ? r.source : 'fallback';
      let via = viaOf(r, source, b !== brain);
      let paired = r.paired === true;
      if (!c.ok) {
        this.reject(who, String(r.text ?? ''), c.reason);
        text = this.d.fallback.neutralReaction(mark, req.maxWords > 10);
        source = 'fallback';
        via = 'fallback';
        paired = false;
      } else if (mark === 'cringing' && r.mark === 'charmed') {
        // a warm line cannot air over a forced cringe: the cold reply (or the star's bank reaction) instead
        const alt = this.d.fallback.reactCandidates?.(req, mark, hits, 1)[0];
        const ok = alt ? check(alt, { maxWords: req.maxWords }) : null;
        if (ok?.ok) {
          this.d.fallback.markUsed?.(alt!, this.n);
          text = ok.cleaned;
          source = 'bank';
          via = 'bank';
          paired = this.d.fallback.replyPair?.(req)?.cold === alt;
        }
      }
      const out: Omit<ReItem, 'to' | 'maxWords' | 'weight'> = { mark, hits, text, source, via, genMs: Date.now() - t0 };
      if (paired) out.paired = true;
      if (mark !== r.mark) out.markWas = r.mark;
      return out;
    }
    const mark = pick(this.rng, MARKS);
    return { mark, hits: [], text: this.d.fallback.neutralReaction(mark, req.maxWords > 10), source: 'fallback', genMs: Date.now() - t0 };
  }

  private async chooseSafe(among: string[], purpose: 'cut' | 'pick'): Promise<string> {
    try {
      const id = await withTimeout(
        this.d.brain.choose({ star: this.star, among: among.map((i) => this.bot(i)), purpose, ctx: this.ctx(this.star) }),
        this.callTimeout,
      );
      if (among.includes(id)) return id;
    } catch {
      /* fall through */
    }
    return pick(this.rng, among);
  }

  // ---------------------------------------------------------------------------------------
  // Slots
  // ---------------------------------------------------------------------------------------

  /** gen side: start `make`, return the slot's final value (generated or forced). */
  private fill<T>(slot: Slot<T>, make: () => Promise<T>, fb: () => Promise<T>): Promise<T> {
    slot.fb = fb;
    make().then(
      (v) => slot.offer(v),
      () => fb().then((v) => slot.offer(v)),
    );
    return slot.p;
  }

  /** airing side: the slot's value, waiting at most waitCap (show time), else the fallback. */
  private async due<T>(slot: Slot<T>, dflt: () => Promise<T>): Promise<{ v: T; waited: number }> {
    if (slot.done) return { v: slot.value, waited: 0 };
    const t0 = this.show.elapsed();
    if (!Number.isFinite(this.waitCap)) {
      // text mode: wait for the call (it has its own real-time timeout); guard a dead gen chain
      const guard = new Promise<void>((r) => {
        const iv = setInterval(() => {
          if (slot.done || this.genFailed) (clearInterval(iv), r());
        }, 50);
      });
      await Promise.race([slot.p, guard]);
    } else {
      const late = this.show.sleep(this.waitCap).then(
        () => 'late',
        () => 'late',
      );
      await Promise.race([slot.p, late]);
    }
    if (!slot.done) {
      slot.forced = true;
      this.tx.late++;
      const v = await (slot.fb ?? dflt)().catch(() => dflt());
      slot.offer(v);
    }
    return { v: slot.value, waited: this.show.elapsed() - t0 };
  }

  /** run a gen chain; a crash leaves the airing side to fallbacks */
  private spawn(name: string, f: () => Promise<void>) {
    this.genFailed = false;
    f().catch((e) => {
      this.genFailed = true;
      this.log(`gen chain ${name} failed: ${(e as Error)?.stack ?? e}`);
    });
  }

  private speakReq(who: Bot, kind: SpeakReq['kind'], maxWords: number, o: { target?: Bot; hint?: Record<string, unknown> } = {}): SpeakReq {
    const req: SpeakReq = { who, kind, maxWords, ctx: this.ctx(who) };
    if (o.target) req.target = o.target;
    if (o.hint) req.hint = o.hint;
    return req;
  }

  private toItem(req: SpeakReq, s: Said, extra: Partial<Item> = {}): Item {
    return { ...s, who: req.who, kind: req.kind, maxWords: req.maxWords, ...extra };
  }

  /** gen: one spoken line into a slot */
  private genSpeak(
    slot: Slot<Item>,
    who: Bot,
    kind: SpeakReq['kind'],
    maxWords: number,
    o: { target?: Bot; hint?: Record<string, unknown>; extra?: Partial<Item> } = {},
  ): Promise<Item> {
    const req = this.speakReq(who, kind, maxWords, o);
    const extra = { ...(o.extra ?? {}) };
    return this.fill(
      slot,
      async () => this.toItem(req, await this.speakSafe(req), extra),
      async () => this.toItem(req, await this.speakSafe(req, this.d.fallback), extra),
    );
  }

  /** gen: the star reacts to a suitor line; updates marks, scoring and the room */
  private async genReact(slot: Slot<ReItem>, to: Bot, line: Item, maxWords: number, weight: number, round: 0 | 1 | 2 | 3, steal = false): Promise<ReItem> {
    const beat = round === 0 ? 'snap' : round === 3 ? 'duo' : 'round';
    const req: ReactReq = { star: this.star, to, line: line.text, maxWords, ctx: this.ctx(this.star), hint: { beat, ...(line.key ? { key: line.key } : {}), ...(steal ? { steal: true } : {}) } };
    if (line.tags.length) req.tags = line.tags;
    if (line.hook) req.hook = line.hook;
    const wrap = (r: Omit<ReItem, 'to' | 'maxWords' | 'weight'>): ReItem => ({ ...r, to, maxWords, weight });
    const v = await this.fill(
      slot,
      async () => wrap(await this.reactSafe(req)),
      async () => wrap(await this.reactSafe(req, this.d.fallback)),
    );
    this.gMarks[to.id]!.push(v.mark);
    const sc: Scored = { seq: ++this.seq, who: to.id, name: to.name, text: line.text, mark: v.mark, hits: v.hits, weight, round };
    if (line.hook) sc.hook = line.hook;
    this.scored.push(sc);
    this.room.push({ who: this.star.id, name: this.star.name, text: v.text, kind: 'reaction', to: to.id, mark: v.mark });
    return v;
  }

  private say(it: Item, kind: RoomLine['kind'], to?: string) {
    if (it.tags.length) this.lineTags.set(`${it.who.id}\u0001${it.text}`, it.tags);
    const r: RoomLine = { who: it.as?.id ?? it.who.id, name: it.as?.name ?? it.who.name, text: it.text, kind };
    if (to) r.to = to;
    this.room.push(r);
  }

  private standing(ids = this.gAlive): Standing {
    return standings(ids, this.scored, this.draw!);
  }

  /**
   * Which reactions in a round the star speaks (FORMAT2 "Not every line gets a spoken reaction"): the
   * best and the worst turn by (mark, then total standing: the order the verdict and the cut use), plus
   * `third` when given. The rest get the mark alone.
   */
  private voices(items: { re: Slot<ReItem> }[], third: number | null): Set<number> {
    // the same order as the verdict and the cut: this turn's mark, then total standing
    const st = this.standing(this.suitors.map((x) => x.id));
    const val = (i: number) => {
      const r = items[i]!.re;
      if (!r.done) return null;
      return MARK_RANK[r.value.mark] * 1000 + (st[r.value.to.id] ?? 0);
    };
    const idx = items.map((_, i) => i).filter((i) => val(i) !== null);
    if (!idx.length) return new Set();
    const best = idx.reduce((a, b) => (val(b)! > val(a)! ? b : a));
    const worst = idx.reduce((a, b) => (val(b)! <= val(a)! ? b : a));
    const out = new Set([best, worst]);
    if (third !== null && VOICES.third && idx.includes(third)) out.add(third);
    return out;
  }

  /**
   * Airing: does the star speak to turn i. Exact (best and worst of the round) when the whole round is
   * judged by now, which is always so with the scripted brain. A slower brain can leave the later turns
   * unjudged when turn i airs: then she speaks when turn i is the best or the worst judged so far, at
   * most VOICES.max per round, and always on the last turn if fewer than two were spoken.
   */
  private voiceAt(r: { items: { re: Slot<ReItem> }[]; voices: Slot<Set<number>>; aired?: boolean[] }, i: number, third: number | null): boolean {
    r.aired ??= [];
    let spoken: boolean;
    if (r.voices.done) spoken = r.voices.value.has(i);
    else {
      const known = this.voices(r.items, third);
      const said = r.aired.filter(Boolean).length;
      const last = i === r.items.length - 1;
      spoken = (known.has(i) && said < 2 + (VOICES.third ? 1 : 0)) || (last && said < 2);
    }
    r.aired[i] = spoken;
    return spoken;
  }

  /** room bookkeeping once the voices are known: a mark-only reaction said nothing */
  private silence(items: { re: Slot<ReItem> }[], spoken: Set<number>) {
    items.forEach((it, i) => {
      if (spoken.has(i) || !it.re.done) return;
      const line = this.room.find((r) => r.kind === 'reaction' && r.to === it.re.value.to.id && r.text === it.re.value.text);
      if (line) line.text = '';
      // the line was never said: the star may still say it later tonight
      this.d.fallback.release?.(it.re.value.text, this.n);
    });
  }

  /** gen: who is cut this round, the two named before it, and the facts for the star's reason */
  private async genCut(slot: Slot<Decision>, round: 1 | 2): Promise<{ dec: Decision; bottom: [string, string]; facts: Record<string, unknown> }> {
    const alive = this.gAlive.slice();
    const co = cutOrder(alive, this.scored, this.draw!, round);
    const low = co.tie.length ? co.tie : [co.order[0]!];
    const decide = async (): Promise<Decision> => ({ id: low.length === 1 ? low[0]! : await this.chooseSafe(low, 'cut'), tie: low.length > 1 ? low : [] });
    const v = await this.fill(slot, decide, async () => ({ id: pick(this.rng, low), tie: low.length > 1 ? low : [] }));
    const next = co.order.find((id) => id !== v.id)!;
    const bottom = shuffle(this.rng, [v.id, next]) as [string, string];
    const hintCard = tieBreakCard(v.id, alive, this.scored, this.draw!, round);
    const worst = worstLine(v.id, this.scored, round, this.draw!);
    const facts: Record<string, unknown> = { name: this.bot(v.id).name };
    if (worst) {
      facts.line = worst.text;
      facts.mark = worst.mark;
      if (worst.hook) facts.hook = worst.hook;
    }
    if (hintCard) facts.cardHint = hintCard;
    facts.standing = co.st[v.id];
    this.tx.cuts.push({
      id: v.id,
      name: this.bot(v.id).name,
      round,
      standing: co.st,
      tie: v.tie,
      reason: explain(v.id, this.scored, this.draw!, co.st),
      deciding: decidingCards(v.id, alive, this.scored, this.draw!),
      roundMarks: co.rm,
      bottom,
      hintCard,
      hook: worst?.hook ?? null,
    });
    return { dec: v, bottom, facts };
  }

  // ---------------------------------------------------------------------------------------
  // Airing
  // ---------------------------------------------------------------------------------------

  private async airLine(slot: Slot<Item>, dflt: () => Promise<Item>, kind: LineKind, pacer: Pacer | null, to?: string, fixedExtra = 0) {
    const { v: it, waited } = await this.due(slot, dflt);
    const who = it.as?.id ?? it.who.id;
    const name = it.as?.name ?? it.who.name;
    const ms = speakMs(it.text);
    const ev: EvLine = { who, name, text: it.text, ms, kind };
    const target = to ?? it.to;
    if (target) ev.to = target;
    const at = this.emit('line', ev);
    this.recordLine({ event: 'line', who, name, kind, text: it.text, to: target, source: it.source, via: slot.forced ? 'fallback' : it.via, maxWords: it.maxWords, at, ms, genMs: it.genMs, waitedMs: waited, forced: slot.forced || undefined });
    await this.sleep(ms + GAP + (pacer?.extra(ms) ?? fixedExtra));
    return it;
  }

  /** a reaction: spoken (its text) or the mark alone (empty text, BEAT.markOnly) */
  private async airReaction(slot: Slot<ReItem>, dflt: () => Promise<ReItem>, pacer: Pacer | null, spoken = true, fixedExtra = 0) {
    const { v: r, waited } = await this.due(slot, dflt);
    this.pMarks[r.to.id]!.push(r.mark);
    const text = spoken ? r.text : '';
    const ms = spoken ? speakMs(r.text) : BEAT.markOnly;
    const ev: EvReaction = { who: this.star.id, name: this.star.name, to: r.to.id, mark: r.mark, text, ms };
    const at = this.emit('reaction', ev);
    this.recordLine({
      event: 'reaction', who: this.star.id, name: this.star.name, kind: r.weight > 1 ? 'duo' : 'reaction', text, to: r.to.id, mark: r.mark, hits: r.hits,
      source: r.source, via: slot.forced ? 'fallback' : r.via, markWas: r.markWas, spoken, paired: spoken && r.paired ? true : undefined,
      maxWords: r.maxWords, at, ms, genMs: r.genMs, waitedMs: waited, forced: slot.forced || undefined,
    });
    await this.sleep(ms + GAP + (pacer?.extra(ms) ?? fixedExtra));
    return r;
  }

  /** the bottom two lit, the star names both, then silence (FORMAT2 "The cut is staged") */
  private async airBottom(slot: Slot<Item>, pair: [string, string], pacer: Pacer) {
    const { v: it, waited } = await this.due(slot, () => this.dfltSpeak(this.star, 'bottom', limitFor('bottom'), undefined, { a: this.bot(pair[0]).name, b: this.bot(pair[1]).name }));
    const ms = speakMs(it.text) + BEAT.bottomHold;
    const ev: EvBottom = { who: pair, by: this.star.id, name: this.star.name, text: it.text, ms, holdMs: BEAT.bottomHold };
    const at = this.emit('bottom', ev);
    this.recordLine({ event: 'bottom', who: this.star.id, name: this.star.name, kind: 'bottom', text: it.text, pair, source: it.source, via: slot.forced ? 'fallback' : it.via, maxWords: it.maxWords, at, ms, genMs: it.genMs, waitedMs: waited });
    await this.sleep(ms + GAP + pacer.extra(ms));
  }

  private async airCut(dSlot: Slot<Decision>, lineSlot: Slot<Item>, round: 1 | 2, pacer: Pacer, dfltCut: () => Promise<Decision>) {
    const { v: dec } = await this.due(dSlot, dfltCut);
    const { v: it, waited } = await this.due(lineSlot, () => this.dfltSpeak(this.star, 'cutline', limitFor('cutline'), this.bot(dec.id)));
    this.pAlive = this.pAlive.filter((id) => id !== dec.id);
    this.pCut.push({ id: dec.id, round });
    const ms = speakMs(it.text) + BEAT.cutLight;
    const ev: EvCut = { who: dec.id, by: this.star.id, round, text: it.text, ms };
    const at = this.emit('cut', ev);
    this.recordLine({ event: 'cut', who: this.star.id, name: this.star.name, kind: 'cutline', text: it.text, to: dec.id, source: it.source, via: lineSlot.forced ? 'fallback' : it.via, maxWords: it.maxWords, at, ms, genMs: it.genMs, waitedMs: waited });
    await this.sleep(ms + GAP + pacer.extra(ms));
    return dec;
  }

  private async airReplay(sc: { who: string; name: string; text: string }, slot: 1 | 2, pacer: Pacer) {
    const ms = quoteMs(sc.text) + BEAT.replayCut;
    const ev: EvReplay = { who: sc.who, name: sc.name, text: sc.text, ms, slot };
    const at = this.emit('replay', ev);
    this.recordLine({ event: 'replay', who: sc.who, name: sc.name, kind: 'replay', text: sc.text, slot, source: 'bank', via: 'replay', maxWords: 99, at, ms, genMs: 0, waitedMs: 0 });
    await this.sleep(ms + GAP + pacer.extra(ms));
  }

  /**
   * Beats inside an open window are all generated before it opens, so the window can be sized to
   * them. A window stays open at least its target: the silence after each beat but the last is
   * stretched (up to BEAT.windowStretch), what is still missing lengthens the title call (up to
   * BEAT.callStretch; it shrinks to BEAT.minCall when the beats run long), and the window always ends on a held wide shot of at least BEAT.windowTail
   * after the last beat. `short` > 0 means the tail had to grow: add a beat if one is ready.
   */
  private windowPlan(beats: { ms: number }[], callMs: number, target: number) {
    const n = beats.length;
    const base = callMs + beats.reduce((a, b) => a + b.ms, 0) + (n - 1) * GAP + BEAT.windowTail;
    const extra = n > 1 ? Math.round(clamp((target - base) / (n - 1), 0, BEAT.windowStretch)) : 0;
    // the call grows to fill a short window, or shrinks (to BEAT.minCall) when the beats run long
    const callExtra = Math.round(clamp(target - base - extra * (n - 1), Math.min(0, BEAT.minCall - callMs), BEAT.callStretch));
    const filled = base + extra * (n - 1) + callExtra;
    return { extra, call: callMs + callExtra, durationMs: Math.max(target, filled), short: Math.max(0, target - filled) };
  }

  private async openWindow(tag: 'A' | 'B' | 'C', alive: string[], durationMs: number, sealed: boolean, targetMs = 0, beats = 0) {
    const openAt = this.show.elapsed();
    const win = await this.show.openWindow({
      question: 'Who gets picked?',
      outcomes: alive.map((id) => ({ id, label: this.bot(id).name, entrantId: id })),
      durationMs: Math.round(durationMs),
      seeded: false,
      ...(sealed ? { sealed: true } : {}),
    });
    this.tx.windows.push({ tag, windowId: win.windowId, outcomes: alive.slice(), durationMs: Math.round(durationMs), targetMs, beats, openAt, lockAt: 0 });
    this.tx.timeline.push({ at: this.show.elapsed(), type: `window_open ${tag}`, ms: 0 });
    return win;
  }

  private async lock(tag: 'A' | 'B' | 'C', win: Awaited<ReturnType<Show['openWindow']>>) {
    await this.show.lock(win);
    const w = this.tx.windows.find((x) => x.tag === tag);
    if (w) w.lockAt = this.show.elapsed();
    this.tx.timeline.push({ at: this.show.elapsed(), type: `window_locked ${tag}`, ms: 0 });
  }

  // airing-side defaults, used only if a gen chain died before reaching a slot
  private async dfltSpeak(who: Bot, kind: SpeakReq['kind'], maxWords: number, target?: Bot, hint?: Record<string, unknown>, extra: Partial<Item> = {}): Promise<Item> {
    const req = this.speakReq(who, kind, maxWords, { target, hint });
    return this.toItem(req, await this.speakSafe(req, this.d.fallback), extra);
  }
  private async dfltReact(to: Bot, maxWords: number, weight: number): Promise<ReItem> {
    const mark = pick(this.rng, MARKS);
    return { to, mark, hits: [], text: this.d.fallback.neutralReaction(mark, maxWords > 10), source: 'fallback', genMs: 0, maxWords, weight };
  }
  private dfltCut(round: 1 | 2): () => Promise<Decision> {
    return async () => {
      const co = cutOrder(this.pAlive.slice(), this.scored, this.draw!, round);
      const low = co.tie.length ? co.tie : [co.order[0]!];
      return { id: pick(this.rng, low), tie: low.length > 1 ? low : [] };
    };
  }

  /** a star line that names suitors may run longer by their extra name words ("Sir Quill" is two) */
  private lim(kind: string, ...ids: (string | undefined)[]): number {
    return limitFor(kind) + ids.reduce((a, id) => a + (id && this.byId.has(id) ? Math.max(0, words(this.bot(id).name) - 1) : 0), 0);
  }

  /** the card nouns read in {card} */
  private noun(c: TypeCard): string {
    return c.noun ?? c.label.toLowerCase();
  }

  /** maxWords of a walk-on snap: six against a paired reply, ten when the star's bank has no replies to this suitor yet (v1) */
  private snapMax(s: Bot): number {
    return this.d.fallback.hasReplies?.(this.star.id, s.id) ? limitFor('snap') : limitFor('reaction');
  }

  // ---------------------------------------------------------------------------------------
  // The script
  // ---------------------------------------------------------------------------------------

  async run(): Promise<Transcript> {
    const { show, star, suitors } = this;
    const entrants: Entrant[] = suitors.map((s) => ({ id: s.id, name: s.name, color: s.look.accent, record: this.records[s.id] }));
    const meta: DatingMeta = {
      game: 'dating',
      show: SHOW_TITLE,
      episode: this.n,
      star: this.member(star),
      suitors: suitors.map((s, i): SuitorMember => ({ ...this.member(s), spot: i })),
    };
    this.exName = this.d.fallback.exName(star.id) ?? 'The Ex';

    // ---- 0. title: announce, cast, generate the intro and the openers ----------------------
    show.announce({ matchId: this.matchId, title: `${SHOW_TITLE}, episode ${this.n}: ${star.name}`, entrants, meta });
    this.emit('cast', { meta });
    const introSlot = new Slot<Item>();
    const openerSlots = suitors.map(() => new Slot<Item>());
    const cardHint = { hint: { card: { id: '', label: CARD_TOKEN, noun: CARD_TOKEN } } };
    this.genSpeak(introSlot, star, 'intro', limitFor('intro'), cardHint);
    suitors.forEach((s, i) => this.genSpeak(openerSlots[i]!, s, 'opener', limitFor('opener')));
    // the lineup rule picks among each suitor's bank openers once the face-up card is known
    const alts: Candidate[][] = suitors.map((s) => this.d.fallback.candidates?.(this.speakReq(s, 'opener', limitFor('opener')), 8) ?? []);
    await this.scene('title', null, BEAT.title);
    const intro = (await this.due(introSlot, () => this.dfltSpeak(star, 'intro', limitFor('intro'), undefined, cardHint.hint))).v;
    const openers: Item[] = [];
    for (const [i, s] of suitors.entries()) openers.push((await this.due(openerSlots[i]!, () => this.dfltSpeak(s, 'opener', limitFor('opener')))).v);

    // ---- 1. walk-on, window A open (sealed): the draw ----------------------------------------
    const snapMax = suitors.map((s) => this.snapMax(s));
    const walkBeats = [
      { ms: BEAT.enterStar },
      { ms: speakMs(intro.text) + 330 },
      ...openers.flatMap((o, i) => [{ ms: BEAT.enterSuitor }, { ms: speakMs(o.text) }, { ms: est(snapMax[i]!) - GAP }]),
      ...(VOICES.walkonJab ? [{ ms: est(limitFor('jab')) - GAP }] : []),
    ];
    const wA = this.windowPlan(walkBeats, BEAT.walkonCall, TARGET.walkon);
    // the public input of the weighted draw, fixed before the window opens: tonight's cast and their banks
    const affinity: CastAffinity = {};
    for (const s of suitors) affinity[s.id] = bankAffinity(this.d.fallback.banks.suitor(s.id), this.d.decks);
    this.tx.draw.topTags = Object.fromEntries(suitors.map((s) => [s.id, topTags(affinity[s.id], this.d.decks)]));
    this.tx.draw.owners = Object.fromEntries(Object.entries(cardOwners(affinity, this.d.decks)).filter(([, v]) => v.length));
    const winA = await this.openWindow('A', this.gAlive, wA.durationMs, true, TARGET.walkon, walkBeats.length);
    const closeA = this.show.elapsed() + wA.durationMs;
    let sealed = winA.sealed;
    if (!sealed || !/^[0-9a-f]{64}$/i.test(sealed)) {
      sealed = randomHex(32);
      this.tx.sealedSource = 'local';
      this.log(`window A has no sealed value; drew locally from ${sealed}`);
    }
    this.tx.sealed = sealed;
    const draw = (this.draw = drawType(sealed, this.d.decks, affinity));
    this.tx.draw = {
      ...this.tx.draw,
      cards: draw.cards.map((c, i) => ({ slot: i, id: c.id, label: c.label, kind: i === 2 ? ('off' as const) : ('on' as const) })),
      twist: { id: draw.twist.id, label: draw.twist.label, rule: draw.twist.rule, format: draw.twist.format },
    };
    this.pCards = [
      { slot: 0, faceUp: true, kind: 'on', id: draw.cards[0].id, label: draw.cards[0].label },
      { slot: 1, faceUp: false },
      { slot: 2, faceUp: false },
    ];
    // the intro names the face-up card in the star's words
    if (intro.text.includes(CARD_TOKEN)) {
      const noun = this.noun(draw.cards[0]);
      intro.text = intro.text.split(CARD_TOKEN).join(noun);
      intro.maxWords += Math.max(0, words(noun) - 1);
    }
    this.lineup(openers, alts, draw);
    this.say(intro, 'intro');
    openers.forEach((o) => this.say(o, 'opener'));
    // snaps and the last word: judged against the face-up card only (made now: the card is fixed by window A)
    const snaps = suitors.map(() => new Slot<ReItem>());
    const lastWord = new Slot<Item>();
    const lastPair: { from: string; to: string } = { from: suitors[0]!.id, to: suitors[1]!.id };
    this.spawn('walkon', async () => {
      await Promise.all(suitors.map((s, i) => this.genReact(snaps[i]!, s, openers[i]!, snapMax[i]!, 1, 0)));
      if (!VOICES.walkonJab) return;
      const rank = suitors.map((s, i) => ({ id: s.id, r: MARK_RANK[snaps[i]!.value.mark], k: this.rng() }));
      const cold = rank.slice().sort((a, b) => a.r - b.r || a.k - b.k)[0]!;
      const warm = rank.filter((x) => x.id !== cold.id).sort((a, b) => b.r - a.r || a.k - b.k)[0]!;
      lastPair.from = cold.id;
      lastPair.to = warm.id;
      const j = await this.genSpeak(lastWord, this.bot(cold.id), 'jab', limitFor('jab'), { target: this.bot(warm.id), extra: { to: warm.id } });
      this.say(j, 'jab', warm.id);
    });
    await this.scene('walkon', 'A', wA.call);
    {
      // pace to the window: the silence after each beat stretches (up to BEAT.windowStretch) so the
      // last beat ends a held wide shot (BEAT.windowTail) before window A closes. Snaps that exist count
      // at their real length, the others at their word limit.
      const nBeats = walkBeats.length;
      const beatMs = (k: number): number => {
        if (k === 0) return BEAT.enterStar;
        if (k === 1) return speakMs(intro.text);
        const i = Math.floor((k - 2) / 3);
        if (i >= suitors.length) return lastWord.done ? speakMs(lastWord.value.text) : est(limitFor('jab')) - GAP;
        const r = (k - 2) % 3;
        if (r === 0) return BEAT.enterSuitor;
        if (r === 1) return speakMs(openers[i]!.text);
        return snaps[i]!.done ? speakMs(snaps[i]!.value.text) : est(snapMax[i]!) - GAP;
      };
      let k = -1;
      const pw = {
        extra: (ms: number) => {
          k++;
          let rest = 0;
          for (let j = k + 1; j < nBeats; j++) rest += beatMs(j) + GAP;
          const left = closeA - BEAT.windowTail - (this.show.elapsed() + ms + GAP) - rest;
          return Math.round(clamp(left / Math.max(1, nBeats - k - 1), 0, BEAT.windowStretch));
        },
      } as unknown as Pacer;
      this.emit('enter', { who: star.id, spot: null, ms: BEAT.enterStar });
      await this.sleep(BEAT.enterStar + GAP + pw.extra(BEAT.enterStar));
      await this.airLine(introSlot, async () => intro, 'intro', pw);
      for (const [i, s] of suitors.entries()) {
        this.emit('enter', { who: s.id, spot: i, ms: BEAT.enterSuitor });
        await this.sleep(BEAT.enterSuitor + GAP + pw.extra(BEAT.enterSuitor));
        await this.airLine(openerSlots[i]!, async () => openers[i]!, 'opener', pw);
        const last = i === suitors.length - 1 && !VOICES.walkonJab;
        await this.airReaction(snaps[i]!, () => this.dfltReact(s, snapMax[i]!, 1), last ? null : pw, true, -GAP);
      }
      if (VOICES.walkonJab) {
        await this.airLine(lastWord, () => this.dfltSpeak(this.bot(lastPair.from), 'jab', limitFor('jab'), this.bot(lastPair.to), undefined, { to: lastPair.to }), 'jab', null, undefined, -GAP);
      }
    }
    await this.lock('A', winA);
    this.tx.standings.push({ after: 'walkon', standing: this.standing(this.suitors.map((x) => x.id)) });

    // ---- 2. round one (generation starts at the lock) ----------------------------------------
    const recentQ = new Set(this.d.memory.data.recentQuestions);
    const qPool = this.d.decks.questions.filter((q) => !recentQ.has(q.id));
    this.question = this.chooseQuestion(qPool.length ? qPool : this.d.decks.questions);
    this.tx.question = { id: this.question.id, theme: this.question.theme };
    const order = shuffle(this.rng, this.gAlive);
    this.tx.order = order;
    const r1 = {
      q: new Slot<Item>(),
      items: order.map((id) => ({ id, ans: new Slot<Item>(), re: new Slot<ReItem>() })),
      voices: new Slot<Set<number>>(),
      cut: new Slot<Decision>(),
      bottom: new Slot<Item>(),
      cutLine: new Slot<Item>(),
      exit: new Slot<Item>(),
      conf: [new Slot<Item>(), new Slot<Item>(), new Slot<Item>()],
      confWho: ['', '', ''] as string[],
      pair: [order[0]!, order[1]!] as [string, string],
    };
    this.spawn('round1', async () => {
      const q = await this.genSpeak(r1.q, star, 'question', limitFor('question'));
      this.say(q, 'question');
      for (const [i, it] of r1.items.entries()) {
        const s = this.bot(it.id);
        let a: Item;
        if (i === r1.items.length - 1) {
          // the fourth suitor replies to the current leader's answer: a steal or undercut
          const st = this.standing();
          const done = r1.items.slice(0, i);
          const leader = done
            .map((x, k) => ({ id: x.id, st: st[x.id]!, m: MARK_RANK[x.re.value.mark], k }))
            .sort((p, q2) => q2.st - p.st || q2.m - p.m || p.k - q2.k)[0]!.id;
          a = await this.genSpeak(it.ans, s, 'answer', limitFor('answer'), { target: this.bot(leader), hint: { reply: leader }, extra: { to: leader } });
          this.say(a, 'answer', leader);
        } else {
          a = await this.genSpeak(it.ans, s, 'answer', limitFor('answer'), { extra: { to: star.id } });
          this.say(a, 'answer', star.id);
        }
        await this.genReact(it.re, s, a, limitFor('reaction'), 1, 1);
      }
      const spoken = await this.fill(r1.voices, async () => this.voices(r1.items, r1.items.length - 1), async () => this.voices(r1.items, r1.items.length - 1));
      this.silence(r1.items, spoken);
      this.tx.standings.push({ after: 'round1', standing: this.standing(this.suitors.map((x) => x.id)) });
      const { dec, bottom, facts } = await this.genCut(r1.cut, 1);
      r1.pair = bottom;
      await this.genSpeak(r1.bottom, star, 'bottom', this.lim('bottom', ...bottom), { hint: { a: this.bot(bottom[0]).name, b: this.bot(bottom[1]).name } });
      const cutBot = this.bot(dec.id);
      const cl = await this.genSpeak(r1.cutLine, star, 'cutline', this.lim('cutline', dec.id), { target: cutBot, hint: facts });
      this.room.push({ who: star.id, name: star.name, text: cl.text, kind: 'cut', to: dec.id });
      this.gAlive = this.gAlive.filter((id) => id !== dec.id);
      const ex = await this.genSpeak(r1.exit, cutBot, 'exit', limitFor('exit'), { hint: { reason: cl.text } });
      this.say(ex, 'exit');
      await this.genBooth1(r1);
    });

    await this.scene('round1', null, BEAT.roundCall);
    const voiced1 = 2 + (VOICES.third ? 1 : 0);
    const p1 = new Pacer(show, TARGET.round1 - BEAT.roundCall, [
      est(limitFor('question')),
      ...order.flatMap(() => [est(limitFor('answer'))]),
      ...Array.from({ length: voiced1 }, () => est(limitFor('reaction'))),
      ...Array.from({ length: order.length - voiced1 }, () => estMark()),
      est(limitFor('bottom')) + BEAT.bottomHold,
      est(limitFor('cutline')) + BEAT.cutLight,
      est(limitFor('exit')),
    ]);
    await this.airLine(r1.q, () => this.dfltSpeak(star, 'question', limitFor('question')), 'question', p1);
    for (const [i, it] of r1.items.entries()) {
      const s = this.bot(it.id);
      await this.airLine(it.ans, () => this.dfltSpeak(s, 'answer', limitFor('answer'), undefined, undefined, { to: star.id }), 'answer', p1);
      await this.due(it.re, () => this.dfltReact(s, limitFor('reaction'), 1));
      await this.airReaction(it.re, () => this.dfltReact(s, limitFor('reaction'), 1), p1, this.voiceAt(r1, i, r1.items.length - 1));
    }
    await this.due(r1.cut, this.dfltCut(1));
    await this.airBottom(r1.bottom, r1.pair, p1);
    const cut1 = await this.airCut(r1.cut, r1.cutLine, 1, p1, this.dfltCut(1));
    await this.airLine(r1.exit, () => this.dfltSpeak(this.bot(cut1.id), 'exit', limitFor('exit')), 'exit', p1);

    // ---- 3. booth one, window B open -----------------------------------------------------
    const aliveB = this.pAlive.slice();
    const conf1: Item[] = [];
    for (const [i, slot] of r1.conf.entries()) {
      const who = this.bot(r1.confWho[i] || aliveB[i]!);
      conf1.push((await this.due(slot, () => this.dfltSpeak(who, 'confession', limitFor('confession'), undefined, { flavour: 'star' }))).v);
    }
    await this.booth('booth1', 'B', aliveB, conf1.slice(0, 2), conf1[2] ?? null, TARGET.booth1);
    const winB = this.lastWin!;
    await this.lock('B', winB);

    // ---- 4. round two: the twist ------------------------------------------------------------
    const twist = draw.twist;
    const aliveR2 = this.gAlive.slice(); // spot order
    const isCaller = twist.format === 'caller';
    const targetOf = (id: string): Bot | undefined => {
      const i = aliveR2.indexOf(id);
      const n = aliveR2.length;
      // suitors face the camera: a suitor's left is the viewer's right (the next spot), wrapping
      if (twist.format === 'target-left') return this.bot(aliveR2[(i + 1) % n]!);
      if (twist.format === 'target-right') return this.bot(aliveR2[(i - 1 + n) % n]!);
      return undefined;
    };
    const r2 = {
      intro: new Slot<Item>(),
      caller: new Slot<Item>(),
      items: aliveR2.map((id) => ({ id, line: new Slot<Item>(), re: new Slot<ReItem>() })),
      voices: new Slot<Set<number>>(),
      verdict: new Slot<Item>(),
      front: aliveR2[0]!,
      jabs: [new Slot<Item>(), new Slot<Item>()],
      jabbers: aliveR2.slice(1),
      comeback: new Slot<Item>(),
      cut: new Slot<Decision>(),
      bottom: new Slot<Item>(),
      cutLine: new Slot<Item>(),
      exit: new Slot<Item>(),
      conf: [new Slot<Item>(), new Slot<Item>(), new Slot<Item>()],
      confWho: ['', '', ''] as string[],
      pair: [aliveR2[0]!, aliveR2[1]!] as [string, string],
    };
    const exAs = { id: 'ex', name: this.exName };
    this.spawn('round2', async () => {
      this.gTwist = true;
      const ti = await this.genSpeak(r2.intro, star, 'twistintro', limitFor('twistintro'));
      this.say(ti, 'twistintro');
      if (isCaller) {
        const c = await this.genSpeak(r2.caller, star, 'caller', limitFor('caller'), { hint: { exName: this.exName, about: `${star.name}'s ex` }, extra: { as: exAs } });
        this.say(c, 'caller');
      }
      for (const it of r2.items) {
        const s = this.bot(it.id);
        const target = targetOf(it.id);
        const line = await this.genSpeak(it.line, s, 'twist', twist.maxWords, { target, extra: { to: target?.id ?? (isCaller ? 'ex' : star.id) } });
        this.say(line, 'twist', line.to);
        await this.genReact(it.re, s, line, limitFor('reaction'), 1, 2);
      }
      const spoken = await this.fill(r2.voices, async () => this.voices(r2.items, null), async () => this.voices(r2.items, null));
      this.silence(r2.items, spoken);
      // the verdict: the turn that landed (mark, then standing); the other two pile on, it comes back
      const st = this.standing();
      const front = r2.items
        .map((x, k) => ({ id: x.id, m: MARK_RANK[x.re.value.mark], st: st[x.id]!, k }))
        .sort((a, b) => b.m - a.m || b.st - a.st || a.k - b.k)[0]!.id;
      r2.front = front;
      r2.jabbers = aliveR2.filter((id) => id !== front);
      const fb = this.bot(front);
      const v = await this.genSpeak(r2.verdict, star, 'verdict', this.lim('verdict', front, front), { target: fb, hint: { name: fb.name }, extra: { to: front } });
      this.say(v, 'verdict', front);
      for (const [k, jid] of r2.jabbers.entries()) {
        const j = await this.genSpeak(r2.jabs[k]!, this.bot(jid), 'jab', limitFor('jab'), { target: fb, extra: { to: front } });
        this.say(j, 'jab', front);
      }
      const last = this.bot(r2.jabbers[r2.jabbers.length - 1]!);
      const cb = await this.genSpeak(r2.comeback, fb, 'jab', limitFor('jab'), { target: last, hint: { step: 'comeback' }, extra: { to: last.id } });
      this.say(cb, 'jab', last.id);
      this.tx.standings.push({ after: 'round2', standing: this.standing(this.suitors.map((x) => x.id)) });
      const { dec, bottom, facts } = await this.genCut(r2.cut, 2);
      r2.pair = bottom;
      await this.genSpeak(r2.bottom, star, 'bottom', this.lim('bottom', ...bottom), { hint: { a: this.bot(bottom[0]).name, b: this.bot(bottom[1]).name } });
      const cutBot = this.bot(dec.id);
      const cl = await this.genSpeak(r2.cutLine, star, 'cutline', this.lim('cutline', dec.id), { target: cutBot, hint: facts });
      this.room.push({ who: star.id, name: star.name, text: cl.text, kind: 'cut', to: dec.id });
      this.gAlive = this.gAlive.filter((id) => id !== dec.id);
      const ex = await this.genSpeak(r2.exit, cutBot, 'exit', limitFor('exit'), { hint: { reason: cl.text } });
      this.say(ex, 'exit');
      await this.genBooth2(r2);
    });

    await this.scene('round2', null, BEAT.roundCall);
    const p2 = new Pacer(show, TARGET.round2 - BEAT.roundCall, [
      BEAT.twistCard + GAP,
      est(limitFor('twistintro')),
      ...(isCaller ? [est(limitFor('caller'))] : []),
      ...aliveR2.map(() => est(twist.maxWords)),
      est(limitFor('reaction')),
      est(limitFor('reaction')),
      estMark(),
      est(limitFor('verdict')),
      est(limitFor('jab')),
      est(limitFor('jab')),
      est(limitFor('jab')),
      est(limitFor('bottom')) + BEAT.bottomHold,
      est(limitFor('cutline')) + BEAT.cutLight,
      est(limitFor('exit')),
    ]);
    {
      this.pTwist = { id: twist.id, label: twist.label, rule: twist.rule };
      const ev: EvTwist = { id: twist.id, label: twist.label, rule: twist.rule, ms: BEAT.twistCard };
      this.emit('twist', ev);
      await this.sleep(ev.ms + GAP + p2.extra(ev.ms));
    }
    await this.airLine(r2.intro, () => this.dfltSpeak(star, 'twistintro', limitFor('twistintro')), 'twistintro', p2);
    if (isCaller) await this.airLine(r2.caller, () => this.dfltSpeak(star, 'caller', limitFor('caller'), undefined, { exName: this.exName }, { as: exAs }), 'caller', p2);
    for (const [i, it] of r2.items.entries()) {
      const s = this.bot(it.id);
      const target = targetOf(it.id);
      await this.airLine(it.line, () => this.dfltSpeak(s, 'twist', twist.maxWords, target, undefined, { to: target?.id ?? (isCaller ? 'ex' : star.id) }), 'twist', p2);
      await this.due(it.re, () => this.dfltReact(s, limitFor('reaction'), 1));
      await this.airReaction(it.re, () => this.dfltReact(s, limitFor('reaction'), 1), p2, this.voiceAt(r2, i, null));
    }
    await this.airLine(r2.verdict, () => this.dfltSpeak(star, 'verdict', limitFor('verdict'), this.bot(r2.front), { name: this.bot(r2.front).name }, { to: r2.front }), 'verdict', p2);
    for (const [k, j] of r2.jabs.entries()) {
      const jid = r2.jabbers[k] ?? this.pAlive[0]!;
      await this.airLine(j, () => this.dfltSpeak(this.bot(jid), 'jab', limitFor('jab'), this.bot(r2.front), undefined, { to: r2.front }), 'jab', p2);
    }
    await this.airLine(r2.comeback, () => this.dfltSpeak(this.bot(r2.front), 'jab', limitFor('jab'), this.bot(r2.jabbers.at(-1)!), { step: 'comeback' }, { to: r2.jabbers.at(-1) }), 'jab', p2);
    await this.due(r2.cut, this.dfltCut(2));
    await this.airBottom(r2.bottom, r2.pair, p2);
    const cut2 = await this.airCut(r2.cut, r2.cutLine, 2, p2, this.dfltCut(2));
    await this.airLine(r2.exit, () => this.dfltSpeak(this.bot(cut2.id), 'exit', limitFor('exit')), 'exit', p2);

    // ---- 5. booth two, window C open ---------------------------------------------------------
    const aliveC = this.pAlive.slice();
    const conf2: Item[] = [];
    for (const [i, slot] of r2.conf.entries()) {
      const who = this.bot(r2.confWho[i] || aliveC[i % aliveC.length]!);
      conf2.push((await this.due(slot, () => this.dfltSpeak(who, 'confession', limitFor('confession'), undefined, { flavour: 'star' }))).v);
    }
    await this.booth('booth2', 'C', aliveC, conf2.slice(0, 2), conf2[2] ?? null, TARGET.booth2);
    const winC = this.lastWin!;
    await this.lock('C', winC);

    // ---- 6. one on one (generation starts at the lock): the leader first ----------------------
    const stF = this.standing();
    let finalists = this.gAlive.slice();
    if (stF[finalists[0]!] === stF[finalists[1]!]) finalists = shuffle(this.rng, finalists);
    else finalists.sort((a, b) => stF[b]! - stF[a]!); // the leader on standing goes first
    const oo = finalists.map((id) => ({ id, open: new Slot<Item>(), re: new Slot<ReItem>(), close: new Slot<Item>() }));
    const fin = {
      compare: new Slot<Item>(),
      pick: new Slot<Decision>(),
      hold: new Slot<Item>(),
      rv1: new Slot<Item>(),
      replays1: [] as { who: string; name: string; text: string; hit: boolean }[],
      pickLine: new Slot<Item>(),
      win: new Slot<Item>(),
      rv2: new Slot<Item>(),
      replay2: null as Scored | null,
      lose: new Slot<Item>(),
      outro: new Slot<Item>(),
    };
    this.spawn('final', async () => {
      for (const [k, f] of oo.entries()) {
        const s = this.bot(f.id);
        const lead = this.bot(oo[0]!.id);
        // the second date opens with a steal at the first
        const open = k === 0
          ? await this.genSpeak(f.open, s, 'duo', limitFor('duo'), { target: star, hint: { step: 'open' }, extra: { to: star.id } })
          : await this.genSpeak(f.open, s, 'duo', limitFor('duo'), { target: lead, hint: { step: 'steal', rival: lead.id }, extra: { to: star.id } });
        this.say(open, 'duo', star.id);
        const re = await this.genReact(f.re, s, open, limitFor('duoStar'), DUO_WEIGHT, 3, k > 0);
        const prompt = this.promptIndex(s.id, re.text);
        const close = await this.genSpeak(f.close, s, 'duo', limitFor('duo'), { target: star, hint: { step: 'close', mark: re.mark, prompt, promptText: re.text }, extra: { to: star.id } });
        this.say(close, 'duo', star.id);
      }
      const [fa, fb] = [this.bot(oo[0]!.id), this.bot(oo[1]!.id)];
      const cmp = await this.genSpeak(fin.compare, star, 'compare', this.lim('compare', fa.id, fb.id), { hint: { a: fa.name, b: fb.name } });
      this.say(cmp, 'compare');
      const st = this.standing(this.suitors.map((x) => x.id));
      this.tx.standings.push({ after: 'oneonone', standing: st });
      const po = pickOrder(this.gAlive.slice(), this.scored, draw);
      const top = po.tie.length ? po.tie : [po.order[0]!];
      const dec = await this.fill(
        fin.pick,
        async () => ({ id: top.length === 1 ? top[0]! : await this.chooseSafe(top, 'pick'), tie: top.length > 1 ? top : [] }),
        async () => ({ id: pick(this.rng, top), tie: top.length > 1 ? top : [] }),
      );
      const winner = this.bot(dec.id);
      const loser = this.bot(this.gAlive.find((id) => id !== dec.id)!);
      this.tx.pick = { winner: winner.id, loser: loser.id, standing: st, tie: dec.tie, reason: explain(winner.id, this.scored, draw, st), oneOnOne: po.oo, first: oo[0]!.id, last: oo[1]!.id };
      // the hold speech carries the hidden turn-on: true of both, no name
      const on = draw.cards[1];
      // (only when a finalist actually showed it: otherwise the plain hold line, and the card turns on "nobody")
      const finalHit = this.scored.some((x) => x.hits.includes(on.id) && (x.who === winner.id || x.who === loser.id));
      const hold = await this.genSpeak(fin.hold, star, 'hold', limitFor('hold'), finalHit ? { hint: { card: { id: on.id, label: on.label, noun: this.noun(on) } } } : {});
      this.say(hold, 'hold');
      const anyOn = this.scored.some((x) => x.hits.includes(on.id));
      if (this.holdCarriesCard(hold.text, on.id)) {
        // the hold speech already said the quality: the card turns on its label alone
        fin.rv1.offer({ ...hold, text: `${on.label}.`, source: 'bank', via: 'bank', kind: 'reveal', maxWords: limitFor('reveal'), genMs: 0 });
      } else {
        // no finalist showed it: the card turns on whoever did (cut earlier, so naming them gives nothing away), else on nobody
        const by = this.scored.filter((x) => x.hits.includes(on.id)).at(-1);
        const h1: Record<string, unknown> = { slot: 1, verdict: anyOn ? 'on' : 'none', card: { id: on.id, label: on.label, kind: 'on', noun: this.noun(on) } };
        if (by) Object.assign(h1, { name: by.name, suitor: by.name, line: by.text, quote: { who: by.who, name: by.name, text: by.text } });
        await this.genSpeak(fin.rv1, star, 'reveal', this.lim('reveal', by?.who), { hint: h1, target: by ? this.bot(by.who) : undefined });
      }
      // both finalists' evidence for the hidden turn-on, in an order that does not give the pick away
      for (const id of shuffle(this.rng, [winner.id, loser.id])) {
        const r = replayLine(id, on.id, this.scored, draw);
        if (r) fin.replays1.push({ who: id, name: this.bot(id).name, text: r.line.text, hit: r.hit });
      }
      // the pick names the winner last and quotes their best line
      const best = this.bestHooked(winner.id);
      const pl = await this.genSpeak(fin.pickLine, star, 'pickline', this.lim('pickline', winner.id, winner.id), {
        target: winner,
        hint: { name: winner.name, loser: loser.name, ...(best ? { line: best.text, mark: best.mark, ...(best.hook ? { hook: best.hook } : {}) } : {}) },
      });
      this.room.push({ who: star.id, name: star.name, text: pl.text, kind: 'reaction', to: winner.id });
      const w = await this.genSpeak(fin.win, winner, 'win', limitFor('win'), { hint: { rival: loser.id } });
      this.say(w, 'win');
      // slot 2 turns on the loser
      const off = draw.cards[2];
      const dl = dealbreakerLine(draw, this.scored, { winner: winner.id, loser: loser.id });
      fin.replay2 = dl;
      const hint2: Record<string, unknown> = { slot: 2, verdict: dl ? 'off' : 'none', card: { id: off.id, label: off.label, kind: 'off', noun: this.noun(off) } };
      if (dl) Object.assign(hint2, { name: dl.name, quote: { who: dl.who, name: dl.name, text: dl.text }, suitor: dl.name, line: dl.text });
      await this.genSpeak(fin.rv2, star, 'reveal', this.lim('reveal', dl?.who), { hint: hint2, target: dl ? this.bot(dl.who) : undefined });
      const lose = await this.genSpeak(fin.lose, loser, 'lose', limitFor('lose'), { hint: { rival: winner.id } });
      this.say(lose, 'lose');
      await this.genSpeak(fin.outro, star, 'outro', limitFor('outro'));
    });

    await this.scene('oneonone', null, BEAT.oneOnOneCall, oo[0]!.id);
    const p3 = new Pacer(show, TARGET.oneonone - BEAT.oneOnOneCall, [
      ...oo.flatMap((_f, i) => [...(i ? [BEAT.focusSwitch] : []), est(limitFor('duo')), est(limitFor('duoStar')), est(limitFor('duo'))]),
      est(limitFor('compare')),
    ]);
    for (const [i, f] of oo.entries()) {
      const s = this.bot(f.id);
      if (i > 0) {
        this.pFocus = f.id;
        const ev: EvScene = { state: this.state(), ms: BEAT.focusSwitch };
        this.emit('scene', ev);
        await this.sleep(ev.ms + p3.extra(ev.ms));
      }
      await this.airLine(f.open, () => this.dfltSpeak(s, 'duo', limitFor('duo'), star, { step: i ? 'steal' : 'open', rival: oo[0]!.id }, { to: star.id }), 'duo', p3);
      const re = await this.airReaction(f.re, () => this.dfltReact(s, limitFor('duoStar'), DUO_WEIGHT), p3);
      await this.airLine(f.close, () => this.dfltSpeak(s, 'duo', limitFor('duo'), star, { step: 'close', mark: re.mark }, { to: star.id }), 'duo', p3);
    }
    this.pFocus = null;
    await this.airLine(fin.compare, () => this.dfltSpeak(star, 'compare', limitFor('compare'), undefined, { a: this.bot(oo[0]!.id).name, b: this.bot(oo[1]!.id).name }), 'compare', p3);

    // ---- 7. the pick: the hidden turn-on turns, both finalists replayed, silence, the name last --
    await this.scene('pick', null, BEAT.pickCall);
    const p4 = new Pacer(show, TARGET.pick - BEAT.pickCall, [
      est(limitFor('hold')),
      BEAT.revealFlip + est(limitFor('reveal')),
      quoteMs('one two three four five six seven eight nine ten eleven twelve') + BEAT.replayCut + GAP,
      quoteMs('one two three four five six seven eight nine ten eleven twelve') + BEAT.replayCut + GAP,
      BEAT.hold + GAP,
      est(limitFor('pickline')) + BEAT.pickBeat,
      est(limitFor('win')),
    ]);
    await this.airLine(fin.hold, () => this.dfltSpeak(star, 'hold', limitFor('hold')), 'hold', p4);
    const { v: pickDec } = await this.due(fin.pick, async () => {
      const po = pickOrder(this.pAlive.slice(), this.scored, draw);
      return { id: po.order[0]!, tie: po.tie };
    });
    const winnerId = pickDec.id;
    const loserId = this.pAlive.find((id) => id !== winnerId)!;
    const winner = this.bot(winnerId);
    const loser = this.bot(loserId);
    await this.airReveal(1, fin.rv1, p4);
    for (const r of fin.replays1) await this.airReplay(r, 1, p4);
    this.tx.reveals.find((r) => r.slot === 1)!.replays = fin.replays1.map((r) => ({ who: r.who, text: r.text, hit: r.hit }));
    {
      const ev: EvHold = { finalists: [finalists[0]!, finalists[1]!], ms: BEAT.hold };
      this.emit('hold', ev);
      await this.sleep(ev.ms + GAP);
      p4.extra(0);
    }
    {
      const { v: pl, waited } = await this.due(fin.pickLine, () => this.dfltSpeak(star, 'pickline', limitFor('pickline'), winner, { name: winner.name }));
      this.pWinner = winnerId;
      this.pCut.push({ id: loserId, round: 3 });
      const ms = speakMs(pl.text) + BEAT.pickBeat;
      const ev: EvPick = { who: winnerId, loser: loserId, by: star.id, text: pl.text, ms };
      const at = this.emit('pick', ev);
      this.recordLine({ event: 'pick', who: star.id, name: star.name, kind: 'pickline', text: pl.text, to: winnerId, source: pl.source, via: fin.pickLine.forced ? 'fallback' : pl.via, maxWords: pl.maxWords, at, ms, genMs: pl.genMs, waitedMs: waited });
      await this.sleep(ms + GAP + p4.extra(ms));
    }
    await this.airLine(fin.win, () => this.dfltSpeak(winner, 'win', limitFor('win'), undefined, { rival: loserId }), 'win', p4);

    // ---- 8. the reveal: the dealbreaker turns on the loser --------------------------------------
    await this.scene('reveal', null, BEAT.revealCall);
    const p5 = new Pacer(show, TARGET.reveal - BEAT.revealCall, [
      BEAT.revealFlip + est(limitFor('reveal')),
      quoteMs('one two three four five six seven eight nine ten eleven twelve') + BEAT.replayCut + GAP,
      est(limitFor('lose')),
    ]);
    await this.airReveal(2, fin.rv2, p5);
    if (fin.replay2) {
      const r = fin.replay2;
      await this.airReplay({ who: r.who, name: r.name, text: r.text }, 2, p5);
      this.tx.reveals.find((x) => x.slot === 2)!.replays = [{ who: r.who, text: r.text, hit: true }];
    }
    await this.airLine(fin.lose, () => this.dfltSpeak(loser, 'lose', limitFor('lose'), undefined, { rival: winnerId }), 'lose', p5);

    // ---- 9. result: settle all three windows on the winner --------------------------------------
    await this.scene('result', null, BEAT.resultCall);
    for (const [tag, w] of [['A', winA], ['B', winB], ['C', winC]] as const) {
      await show.settle(w, winnerId);
      this.tx.timeline.push({ at: show.elapsed(), type: `window_settled ${tag}`, ms: 0 });
    }
    await this.airLine(fin.outro, () => this.dfltSpeak(star, 'outro', limitFor('outro')), 'outro', null);
    const order9 = [...this.pCut.filter((c) => c.round < 3).sort((a, b) => a.round - b.round).map((c) => c.id), loserId, winnerId];
    const mem = this.d.memory;
    mem.apply({
      episode: this.n,
      star: { id: star.id, name: star.name },
      winner: { id: winner.id, name: winner.name },
      loser: { id: loser.id, name: loser.name },
      cuts: this.pCut.filter((c) => c.round < 3).map((c) => ({ id: c.id, name: this.bot(c.id).name, round: c.round as 1 | 2 })),
      question: this.question.id,
      lines: this.tx.lines.filter((l) => this.byId.has(l.who) && l.event !== 'replay' && l.text).map((l) => ({ who: l.who, text: l.text })),
      cast: castIds(this.d.cast),
    });
    if (this.d.next) mem.data.upcoming = castIds(this.d.next);
    mem.save();
    const records: Record<string, { played: number; wins: number }> = {};
    for (const b of [star, ...suitors]) records[b.id] = mem.record(b.id);
    const result: EvResult = { winner: winnerId, star: star.id, order: order9, records, ms: BEAT.result };
    if (this.d.next) result.next = { star: this.d.next.star.name, suitors: this.d.next.suitors.map((s) => s.name) };
    this.emit('result', result);
    await this.sleep(BEAT.result + GAP);
    this.tx.durationMs = show.elapsed();
    // topTags: the public input of the weighted card draw, so anyone can recompute it from the revealed secret
    show.end({ winner: winnerId, loser: loserId, star: star.id, order: order9, episode: this.n, topTags: this.tx.draw.topTags });
    return this.tx;
  }

  /** a hidden card turns: the star's line, and who guessed at it in the booth */
  private async airReveal(slot: 1 | 2, s: Slot<Item>, pacer: Pacer) {
    const card = this.draw!.cards[slot];
    const kind = slot === 2 ? ('off' as const) : ('on' as const);
    const { v: rv, waited } = await this.due(s, () =>
      this.dfltSpeak(this.star, 'reveal', limitFor('reveal'), undefined, { slot, verdict: 'none', card: { id: card.id, label: card.label, kind } }),
    );
    this.pCards[slot] = { slot, faceUp: true, kind, id: card.id, label: card.label };
    const guesses = this.tx.guesses.filter((g) => g.kind === kind).map((g) => ({ who: g.who, name: this.bot(g.who).name, right: g.card === card.id }));
    const ms = BEAT.revealFlip + speakMs(rv.text);
    const ev: EvReveal = { slot, card: { id: card.id, label: card.label, kind }, text: rv.text, ms };
    if (guesses.length) ev.guesses = guesses;
    const at = this.emit('reveal', ev);
    this.tx.reveals.push({ slot, card: card.id, quote: null, replays: [], guesses: guesses.map((g) => ({ who: g.who, right: g.right })) });
    this.recordLine({ event: 'reveal', who: this.star.id, name: this.star.name, kind: 'reveal', text: rv.text, source: rv.source, via: s.forced ? 'fallback' : rv.via, maxWords: rv.maxWords, at, ms, genMs: rv.genMs, waitedMs: waited });
    await this.sleep(ms + GAP + pacer.extra(ms));
  }

  /** did the hold line come from the star's holdCard for this card (v2): then it already describes the card */
  private holdCarriesCard(text: string, cardId: string): boolean {
    const t = this.d.fallback.banks.star(this.star.id)?.holdCard?.[cardId];
    if (typeof t !== 'string') return false;
    const c = check(t, { maxWords: 99 }).cleaned;
    return text === c || text.startsWith(c.replace(/[.!?]+$/, ''));
  }

  /** the index of the star's one-on-one prompt in her oneOnOne[suitor] (the closer answers that one), else -1 */
  private promptIndex(suitorId: string, text: string): number {
    const lines = this.d.fallback.banks.star(this.star.id)?.oneOnOne?.[suitorId];
    if (!Array.isArray(lines)) return -1;
    const v = { rival: this.bot(suitorId).name, target: this.bot(suitorId).name, star: this.star.name, name: this.bot(suitorId).name };
    return lines.findIndex((t) => typeof t === 'string' && (t === text || fillSlots(t, v) === text || check(fillSlots(t, v) ?? '', { maxWords: 99 }).cleaned === text));
  }

  /** the winner's best line of the night that carries a hook (for {hook} in the pick frame) */
  private bestHooked(id: string): Scored | null {
    const best = bestLine(id, this.scored, this.draw!);
    if (best?.hook) return best;
    const mine = this.scored.filter((s) => s.who === id && s.hook && s.mark !== 'cringing');
    if (!mine.length) return best;
    return mine.sort((a, b) => MARK_RANK[b.mark] - MARK_RANK[a.mark] || lineScore(b, this.draw!) - lineScore(a, this.draw!) || b.seq - a.seq)[0]!;
  }

  /**
   * The walk-on lineup rule (FORMAT2): at least one opener plays to the face-up card when a natural
   * owner of it is on stage, and no two openers share a device (first tag or first word). Openers are
   * swapped only for that suitor's own bank openers, which exist before the window opened.
   */
  private lineup(openers: Item[], alts: Candidate[][], draw: TypeDraw) {
    const up = draw.cards[0].id;
    const owners = new Set(this.tx.draw.owners[up] ?? []);
    const plays = (o: { tags?: string[] }) => !!o.tags?.includes(up);
    const swap = (i: number, c: Candidate) => {
      const o = openers[i]!;
      o.text = c.text;
      o.tags = c.tags ?? [];
      o.source = 'bank';
      o.via = 'bank';
      if (c.hook) o.hook = c.hook;
      else delete o.hook;
      const key = this.d.fallback.templateOf?.(c.text);
      if (key && key !== c.text) o.key = key;
      else delete o.key;
      this.d.fallback.markUsed?.(c.text, this.n);
    };
    const clashes = (c: { text: string; tags?: string[] }, skip: number) => openers.some((o, j) => j !== skip && sameDevice(c, o));
    if (!openers.some(plays) && owners.size) {
      for (const [i, s] of this.suitors.entries()) {
        if (!owners.has(s.id)) continue;
        const c = alts[i]!.find((x) => plays(x) && !clashes(x, i));
        if (c) {
          swap(i, c);
          break;
        }
      }
    }
    for (let j = 1; j < openers.length; j++) {
      for (let i = 0; i < j; i++) {
        if (!sameDevice(openers[i]!, openers[j]!)) continue;
        // keep the one that plays to the face-up card; swap the other for a different device
        const k = plays(openers[j]!) && !plays(openers[i]!) ? i : j;
        const keepCard = plays(openers[k]!) && openers.filter(plays).length === 1;
        const c = alts[k]!.find((x) => x.text !== openers[k]!.text && !clashes(x, k) && (!keepCard || plays(x)));
        if (c) swap(k, c);
      }
    }
  }

  private lastWin: Awaited<ReturnType<Show['openWindow']>> | null = null;

  /**
   * The star asks the question her type cares about (after window A has locked, from the post-lock
   * rng): each question is weighted 1 + QUESTION_PULL x the number of tonight's suitors who have an
   * answer to it tagged with one of her hidden cards. Never a question whose natural answers hit the
   * same hidden card for all four suitors (a hidden card is a suitor's natural answer when at least
   * half their answers to it carry that tag).
   */
  private chooseQuestion(pool: Question[]): Question {
    const hidden = [this.draw!.cards[1].id, this.draw!.cards[2].id];
    const banks = this.suitors.map((s) => this.d.fallback.banks.suitor(s.id));
    const tagged = (l: { tags?: unknown }, c: string) => Array.isArray(l?.tags) && (l.tags as string[]).includes(c);
    const natural = (q: Question, c: string) =>
      banks.every((b) => {
        const xs = b?.answers?.[q.id] ?? [];
        return xs.length > 0 && xs.filter((l) => tagged(l, c)).length * 2 >= xs.length;
      });
    const ok = pool.filter((q) => !hidden.some((c) => natural(q, c)));
    const items = (ok.length ? ok : pool).map((q): [Question, number] => {
      const n = banks.filter((b) => (b?.answers?.[q.id] ?? []).some((l) => hidden.some((c) => tagged(l, c)))).length;
      return [q, 1 + QUESTION_PULL * n];
    });
    return weighted(this.rng, items);
  }

  /** a booth read: which card the suitor names, on (a guess at what she likes) or off (what she cannot stand) */
  private readFor(id: string, flavour: 'guess' | 'fear', heard: Scored | null): { id: string; label: string; kind: 'on' | 'off'; noun: string } {
    const draw = this.draw!;
    const kind = flavour === 'guess' ? 'on' : 'off';
    const truth = flavour === 'guess' ? draw.cards[1] : draw.cards[2];
    const starCards = new Set(draw.cards.map((c) => c.id));
    let card: TypeCard = truth;
    if (this.rng() >= TRUE_READ) {
      // a decoy: a card the suitor's own line played, else one of their strengths, else any other card
      const deck = this.d.decks.cards;
      const lineTags = this.tagsOfLine(id, heard?.text ?? '').filter((t) => !starCards.has(t));
      const own = (this.tx.draw.topTags[id] ?? []).filter((t) => !starCards.has(t));
      const pool = lineTags.length ? lineTags : own.length ? own : deck.map((c) => c.id).filter((c) => !starCards.has(c));
      const pickId = pick(this.rng, pool);
      card = deck.find((c) => c.id === pickId) ?? truth;
    }
    return { id: card.id, label: card.label, kind, noun: this.noun(card) };
  }

  /** authored tags of a line a suitor said tonight (kept on the items as they air) */
  private lineTags = new Map<string, string[]>();
  private tagsOfLine(id: string, text: string): string[] {
    return this.lineTags.get(`${id}\u0001${text}`) ?? [];
  }

  /** gen: booth one (window B): a suitor reads the star's reaction, a rival answers it; never the star */
  private async genBooth1(r1: { items: { id: string; ans: Slot<Item>; re: Slot<ReItem> }[]; voices: Slot<Set<number>>; conf: Slot<Item>[]; confWho: string[] }) {
    const st = this.standing();
    const ranked = this.gAlive.slice().sort((a, b) => st[b]! - st[a]! || (this.rng() < 0.5 ? -1 : 1));
    const spoken = r1.voices.done ? r1.voices.value : new Set<number>();
    const heardBy = (id: string) => {
      const k = r1.items.findIndex((x) => x.id === id);
      return k >= 0 && spoken.has(k) ? k : -1;
    };
    // the reader: the best standing among those the star spoke to; the rival: the other of the top two
    const reader = ranked.find((id) => heardBy(id) >= 0) ?? ranked[0]!;
    const rival = ranked.find((id) => id !== reader)!;
    const third = ranked.find((id) => id !== reader && id !== rival) ?? null;
    r1.confWho[0] = reader;
    r1.confWho[1] = rival;
    r1.confWho[2] = third ?? '';
    const k = r1.items.findIndex((x) => x.id === reader);
    const re = k >= 0 && r1.items[k]!.re.done ? r1.items[k]!.re.value : null;
    const flavour: 'guess' | 'fear' = re?.mark === 'charmed' ? 'guess' : re?.mark === 'cringing' ? 'fear' : this.rng() < 0.5 ? 'guess' : 'fear';
    const heard = this.scored.filter((s) => s.who === reader && s.round === 1).at(-1) ?? null;
    const card = this.readFor(reader, flavour, heard);
    const readerBot = this.bot(reader);
    const rivalBot = this.bot(rival);
    const rivalFlavour = this.rng() < 0.7 ? 'rival' : 'star';
    const lastMark = (id: string) => this.gMarks[id]!.slice(-1)[0];
    await Promise.all([
      this.genRead(r1.conf[0]!, readerBot, flavour, card, heard?.text ?? ''),
      this.genSpeak(r1.conf[1]!, rivalBot, 'confession', limitFor('confession'), {
        hint: { flavour: rivalFlavour, ...(rivalFlavour === 'rival' ? { about: reader } : {}) },
        target: rivalFlavour === 'rival' ? readerBot : undefined,
        extra: rivalFlavour === 'rival' ? { about: reader } : {},
      }),
      third
        ? this.genSpeak(r1.conf[2]!, this.bot(third), 'confession', limitFor('confession'), {
            hint: { flavour: lastMark(third) === 'cringing' ? 'afterCringe' : lastMark(third) === 'charmed' ? 'afterCharm' : 'star' },
          })
        : Promise.resolve(),
    ]);
  }

  /** gen: a booth read (guess or fear) naming a card; the brain may name its own card (`Spoken.guess`) */
  private async genRead(slot: Slot<Item>, who: Bot, flavour: 'guess' | 'fear', card: { id: string; label: string; kind: 'on' | 'off'; noun: string }, heard: string) {
    const lastStar = [...this.room].reverse().find((r) => r.who === this.star.id && r.to === who.id && r.text);
    const it = await this.genSpeak(slot, who, 'confession', limitFor('confession'), {
      hint: { flavour, card, heard, ...(lastStar ? { starSaid: lastStar.text } : {}), cards: this.d.decks.cards.map((c) => c.id) },
    });
    if (it.guess) {
      const c = this.d.decks.cards.find((x) => x.id === it.guess);
      if (c) {
        const g = { id: c.id, label: c.label, kind: card.kind };
        it.guessCard = g;
        this.reads.set(who.id, g);
      }
    }
    return it;
  }

  /** gen: booth two (window C): one confession from each finalist, never the star, never a mirrored pair */
  private async genBooth2(r2: { conf: Slot<Item>[]; confWho: string[] }) {
    const st = this.standing();
    const fins = this.gAlive.slice().sort((a, b) => st[b]! - st[a]! || (this.rng() < 0.5 ? -1 : 1));
    const flavourOf = (id: string): string => (this.reads.has(id) ? 'final' : 'read');
    const f0 = flavourOf(fins[0]!);
    let f1 = flavourOf(fins[1]!);
    if (f1 === f0) f1 = f0 === 'read' ? 'final' : 'star';
    const mk = async (k: number, id: string, f: string, avoid?: string) => {
      const me = this.bot(id);
      const other = this.bot(fins.find((x) => x !== id)!);
      r2.confWho[k] = id;
      if (f === 'read') {
        const marks = this.scored.filter((s) => s.who === id && s.round >= 1);
        const last = marks.at(-1) ?? null;
        const flavour: 'guess' | 'fear' = last?.mark === 'cringing' ? 'fear' : last?.mark === 'charmed' ? 'guess' : this.rng() < 0.5 ? 'guess' : 'fear';
        return this.genRead(r2.conf[k]!, me, flavour, this.readFor(id, flavour, last), last?.text ?? '');
      }
      return this.genSpeak(r2.conf[k]!, me, 'confession', limitFor('confession'), {
        hint: { flavour: f, ...(f === 'final' ? { about: other.id } : {}), ...(avoid ? { avoid } : {}) },
        target: f === 'final' ? other : undefined,
        extra: f === 'final' ? { about: other.id } : {},
      });
    };
    const a = await mk(0, fins[0]!, f0);
    const b = await mk(1, fins[1]!, f1, a.text);
    // a third beat (aired only if the window would otherwise end early): the leader on the star
    await mk(2, fins[0]!, f0 === 'star' ? 'final' : 'star', [a.text, b.text].join(' '));
  }

  /**
   * A confession scene inside an open window. All lines exist before the window opens. `third` (a
   * confession already generated) airs only if the two would leave the window short of its target.
   */
  private async booth(scene: SceneId, tag: 'B' | 'C', alive: string[], two: Item[], third: Item | null, target: number) {
    const beats = (xs: Item[]) => xs.map((c) => ({ ms: speakMs(c.text) }));
    let conf = two;
    let plan = this.windowPlan(beats(conf), BEAT.boothCall, target);
    if (plan.short > 0 && third) {
      conf = [...two, third];
      plan = this.windowPlan(beats(conf), BEAT.boothCall, target);
    }
    this.lastWin = await this.openWindow(tag, alive, plan.durationMs, false, target, conf.length);
    await this.scene(scene, tag, plan.call);
    for (const [i, c] of conf.entries()) {
      const ms = speakMs(c.text);
      const ev: EvConfession = { who: c.who.id, name: c.who.name, text: c.text, ms };
      if (c.about) ev.about = c.about;
      if (c.guessCard) ev.guess = c.guessCard;
      const at = this.emit('confession', ev);
      let guess: TLine['guess'];
      if (c.guessCard) {
        const right = c.guessCard.id === this.draw!.cards[c.guessCard.kind === 'on' ? 1 : 2].id;
        guess = { ...c.guessCard, right };
        this.tx.guesses.push({ who: c.who.id, card: c.guessCard.id, kind: c.guessCard.kind, right, via: c.via ?? c.source });
      }
      this.recordLine({ event: 'confession', who: c.who.id, name: c.who.name, kind: 'confession', text: c.text, about: c.about, guess, source: c.source, via: c.via, maxWords: c.maxWords, at, ms, genMs: c.genMs, waitedMs: 0 });
      await this.sleep(i === conf.length - 1 ? ms : ms + GAP + plan.extra);
    }
  }
}

/** Runs one whole episode on `show`. Throws only if the show itself fails (abort, chain error). */
export async function runEpisode(show: Show, deps: EpisodeDeps): Promise<Transcript> {
  return new Episode(show, deps).run();
}

export { ROUND_WORD, MARK_SCORE };
