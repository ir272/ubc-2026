// Prompt builders for the model brain. Short on purpose: the cheap models did worse with long
// instructions.
//
// System prompt (stable per bot per episode): the persona and five voice lines from its bank.
// User turn: the last few room lines, the task in two sentences, the candidate lines from the bank,
// the JSON shape. Nothing else.
//
// Write modes (DATING_WRITE): 'hybrid' (default) the model picks a bank line or, rarely, writes one;
// 'free' the model writes every line; 'bank' the model only picks and judges.
//
// Hint keys read from SpeakReq.hint (all optional):
//   confession: flavour 'star' | 'rival' | 'afterCringe' | 'afterCharm' | 'final' | 'guess' | 'fear'
//               (guess/fear: starSaid, heard, card {id,label,noun}: the model names its own card)
//   answer:     reply (id of the leader the fourth suitor answers instead of the star)
//   jab:        step 'comeback' (the frontrunner answers the pile-on)
//   cutline:    hook, line, mark, cardHint;  pickline: hook, line, name, loser
//   bottom/compare: a, b;  verdict: name
//   duo:        step 'open' | 'steal' | 'close', mark (the star's mark on them in this one on one), promptText
//   exit:       reason (the star's cut line)
//   win/lose:   rival (id of the other finalist)
//   pickline:   loser (name)
//   reveal:     slot, card { label, kind }, quote { name, text } (absent when nobody touched it)
//   caller:     exName
// No code path here names a model or a provider.

import fs from 'node:fs';
import type { Bot, Ctx, L, Mark, ReactReq, RoomLine, SpeakReq, StarBank, SuitorBank, TypeCard } from './types.ts';

export const SHOW_NAME = 'Compatibility Mode';

export type WriteMode = 'hybrid' | 'free' | 'bank';

export interface Built {
  system: string;
  user: string;
  /** what the answer must look like, used by the repair turn */
  shape: string;
  maxWords: number;
  maxTokens: number;
  temperature: number;
}

/** A line the bot could say, from its bank. `mark` labels star reactions; 'any' fits every mark. */
export interface Cand {
  text: string;
  tags?: string[];
  mark?: Mark | 'any';
  /** a card reaction: the card this line answers */
  card?: string;
  /** shown before the line when the hits are not known yet, e.g. 'if it shows Bad puns' */
  cond?: string;
  /** v2: the star's paired reply to this exact line (warm for charmed, cold otherwise) */
  paired?: 'warm' | 'cold';
  /** v2: the bank line's hook */
  hook?: string;
}

// ------------------------------------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------------------------------------

/** Words as a viewer would count them: runs of characters containing a letter or digit. */
export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function shuffled<T>(arr: T[], seed: string): T[] {
  const a = arr.slice();
  let x = hash(seed) || 1;
  for (let i = a.length - 1; i > 0; i--) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clip(text: string, words: number): string {
  const w = text.trim().split(/\s+/);
  return w.length <= words ? text.trim() : w.slice(0, words).join(' ') + '...';
}

const q = (s: string) => `"${s.replace(/"/g, "'")}"`;

const nameOf = (ctx: Ctx, id?: string): string => {
  if (!id) return '';
  if (id === ctx.star.id) return ctx.star.name;
  return ctx.suitors.find((s) => s.id === id)?.name ?? id;
};

// ------------------------------------------------------------------------------------------
// Banks (voice examples). Read fresh so lines the writers add during the day show up.
// ------------------------------------------------------------------------------------------

const BANK_DIR = new URL('./bank/', import.meta.url);

export function loadBank(bot: Bot): SuitorBank | StarBank | null {
  const dir = bot.role === 'star' ? 'stars' : 'suitors';
  try {
    return JSON.parse(fs.readFileSync(new URL(`${dir}/${bot.id}.json`, BANK_DIR), 'utf8'));
  } catch {
    return null;
  }
}

const ts = (xs: unknown): string[] => {
  if (!Array.isArray(xs)) return [];
  return xs.map((x) => (typeof x === 'string' ? x : x && typeof (x as L).t === 'string' ? (x as L).t : '')).filter(Boolean);
};
const vals = (rec: unknown): unknown[] => (rec && typeof rec === 'object' ? Object.values(rec as object) : []);

/** Pools of lines by category, so the examples cover the bot's range rather than one beat. */
function bankPools(bot: Bot, bank: SuitorBank | StarBank | null, mode: 'suitor' | 'star' | 'ex'): string[][] {
  if (!bank) return [];
  const b = bank as any;
  if (mode === 'ex') return [ts(b.ex?.lines)];
  if (bot.role === 'star') {
    return [
      ts(b.intro),
      vals(b.react).flatMap((byMark) => vals(byMark).flatMap((xs) => ts(xs))),
      vals(b.cut).flatMap((xs) => ts(xs)),
      vals(b.cardReact).flatMap((x: any) => [x?.on, x?.off].filter((s) => typeof s === 'string')),
      vals(b.oneOnOne).flatMap((xs) => ts(xs)),
      vals(b.pick).flatMap((xs) => ts(xs)),
      [...ts(b.hold), ...ts(b.outro)],
    ];
  }
  return [
    vals(b.answers).flatMap((xs) => ts(xs)),
    vals(b.confessions).flatMap((xs) => ts(xs)),
    ts(b.openers),
    vals(b.twists).flatMap((xs) => ts(xs)),
    vals(b.jabs).flatMap((xs) => ts(xs)),
    [...vals(b.oneOnOne?.open).flatMap((xs) => ts(xs)), ...ts(b.oneOnOne?.closeWarm), ...ts(b.oneOnOne?.closeCold)],
    [...ts(b.exit), ...ts(b.win), ...ts(b.lose)],
  ];
}

/** Ids of every bot that has a persona or a bank, so examples naming another cast member can be skipped. */
function knownIds(): string[] {
  const ids = new Set<string>();
  for (const sub of ['personas/', 'bank/stars/', 'bank/suitors/']) {
    try {
      for (const f of fs.readdirSync(new URL(sub, new URL('./', import.meta.url)))) if (f.endsWith('.json')) ids.add(f.slice(0, -5));
    } catch { /* not there yet */ }
  }
  return [...ids];
}

/** n lines in the bot's voice, different each episode, never with unfilled {placeholders}
 *  and never naming another cast member. */
export function voiceExamples(bot: Bot, episode: number, mode: 'suitor' | 'star' | 'ex' = bot.role, n = 5): string[] {
  const others = knownIds().filter((id) => id !== bot.id);
  const namesOther = others.length ? new RegExp(`\\b(${others.join('|')})\\b`, 'i') : null;
  const pools = bankPools(bot, loadBank(bot), mode)
    .map((p) => shuffled([...new Set(p)].filter((s) => !/[{}]/.test(s) && countWords(s) <= 20 && !(namesOther && namesOther.test(s))), `${bot.id}:${episode}:${p.length}`))
    .filter((p) => p.length);
  const out: string[] = [];
  for (let round = 0; out.length < n && pools.some((p) => p.length > round); round++) {
    for (const p of pools) if (p[round] && out.length < n) out.push(p[round]);
  }
  return out;
}

// ------------------------------------------------------------------------------------------
// System prompts: persona + five voice lines (cached per bot per episode, a stable prefix)
// ------------------------------------------------------------------------------------------

const systemCache = new Map<string, string>();

function cached(key: string, make: () => string): string {
  let s = systemCache.get(key);
  if (!s) {
    s = make();
    systemCache.set(key, s);
    if (systemCache.size > 80) systemCache.delete(systemCache.keys().next().value as string);
  }
  return s;
}

function voice(bot: Bot, episode: number, mode: 'suitor' | 'star' | 'ex'): string {
  const ex = voiceExamples(bot, episode, mode, 5);
  return ex.length ? `\n\nFive lines in your voice:\n${ex.map((s) => `- ${s}`).join('\n')}` : '';
}

export function systemFor(bot: Bot, ctx: Ctx): string {
  const role = bot.role === 'star' || bot.id === ctx.star.id ? 'star' : 'suitor';
  return cached(`${ctx.episode}|${bot.id}|${role}`, () => {
    const head = role === 'star'
      ? `You are ${bot.name}, the star of "${SHOW_NAME}", a late-night dating show where every contestant is a bot. Four suitors try to win you; you cut two and pick one.`
      : `You are ${bot.name}, a suitor on "${SHOW_NAME}", a late-night dating show where every contestant is a bot. ${ctx.star.name} is the star.`;
    return `${head}\n\n${bot.instructions.trim()}${voice(bot, ctx.episode, role)}\n\nAnswer with one JSON object only.`;
  });
}

export function exSystem(star: Bot, ctx: Ctx, exName: string): string {
  return cached(`${ctx.episode}|${star.id}|ex|${exName}`, () =>
    `You are ${exName}, the ex of ${star.name}, calling in live to "${SHOW_NAME}", a late-night dating show where every contestant is a bot. You are a machine and talk like one. One pointed line on air.${voice(star, ctx.episode, 'ex')}\n\nAnswer with one JSON object only.`,
  );
}

// ------------------------------------------------------------------------------------------
// The user turn
// ------------------------------------------------------------------------------------------

const ROOM_LINES = 6;

function roomLine(ctx: Ctx, r: RoomLine): string {
  const to = r.to ? nameOf(ctx, r.to) : '';
  const text = clip(r.text, 24);
  if (r.kind === 'cut') return `${r.name} cuts ${to}: ${text}`;
  if (r.kind === 'reaction' || r.mark) return `${r.name}${to ? ` to ${to}` : ''} (${r.mark ?? 'reacting'}): ${text}`;
  if (r.kind === 'caller') return `${r.name} (the ex, on the phone): ${text}`;
  if (r.kind === 'confession') return `You, alone in the booth: ${text}`;
  return `${r.name}${to && r.to !== ctx.star.id ? ` to ${to}` : ''}: ${text}`;
}

/** The last few public lines. Confessions never appear, except the speaker's own. */
export function roomBlock(ctx: Ctx, selfId: string | null, drop?: string): string {
  let visible = ctx.room.filter((r) => r.kind !== 'confession' || r.who === selfId);
  if (drop && visible.length && visible[visible.length - 1].text === drop) visible = visible.slice(0, -1);
  if (!visible.length) return 'Nothing has been said yet.';
  return `Just said:\n${visible.slice(-ROOM_LINES).map((r) => roomLine(ctx, r)).join('\n')}`;
}

function lastBy(ctx: Ctx, pred: (r: RoomLine) => boolean): RoomLine | undefined {
  for (let i = ctx.room.length - 1; i >= 0; i--) if (pred(ctx.room[i])) return ctx.room[i];
  return undefined;
}

/** The target's own lines tonight (public), newest last. */
export function linesOf(ctx: Ctx, id: string, n = 2): string[] {
  return ctx.room.filter((r) => r.who === id && r.kind !== 'confession').slice(-n).map((r) => r.text);
}

const pron = (b?: Bot) => (!b ? 'them' : b.pronouns === 'she' ? 'her' : b.pronouns === 'he' ? 'him' : b.pronouns === 'it' ? 'it' : 'them');

/** One or two sentences: what this moment is. */
export function taskFor(req: SpeakReq): string {
  const { ctx, who } = req;
  const star = ctx.star.name;
  const h = req.hint ?? {};
  const t = req.target;
  switch (req.kind) {
    case 'intro': return 'You open the show; the suitors have not walked on yet.';
    case 'opener': return `You walk on and say your first line to ${star}.`;
    case 'question': return `Ask the suitors tonight's question: ${ctx.question ? q(ctx.question.theme) : 'something revealing'}.`;
    case 'answer': {
      const asked = lastBy(ctx, (r) => r.kind === 'question');
      if (typeof h.reply === 'string' && t) {
        const theirs = linesOf(ctx, t.id, 1)[0];
        return `${star} asked: ${asked ? q(asked.text) : 'a question'}. ${t.name} is leading${theirs ? ` with ${q(clip(theirs, 20))}` : ''}. Instead of answering, steal it or undercut it, to ${t.name}'s face.`;
      }
      return `${star} asked: ${asked ? q(asked.text) : ctx.question ? q(ctx.question.theme) : 'a question'}. Your answer, to ${star}.`;
    }
    case 'twistintro': return ctx.twist ? `Turn over the twist card, ${ctx.twist.label}: ${q(ctx.twist.rule)}. Set the task.` : 'Announce the twist.';
    case 'twist': {
      const tw = ctx.twist;
      if (!tw) return 'Your turn on the twist card.';
      if (tw.format === 'caller') {
        const ex = lastBy(ctx, (r) => r.kind === 'caller');
        return `${star}'s ex just called in${ex ? ` and said ${q(ex.text)}` : ''}. Answer the ex, live, to impress ${star}.`;
      }
      const aim = t && (tw.format === 'target-left' || tw.format === 'target-right') ? ` Your target: ${t.name}.` : '';
      return `Twist card ${tw.label}: ${q(tw.rule)}.${aim}`;
    }
    case 'caller': return `You are on the phone, live. Say one pointed thing to ${star} or about the suitors.`;
    case 'jab': {
      const tl = t ? linesOf(ctx, t.id, 1) : [];
      if (h.step === 'comeback') return `The others just piled on you${tl.length ? `; ${t!.name} said ${q(clip(tl[0], 20))}` : ''}. One comeback, then the cut.`;
      return `Throw a quick jab at ${t ? t.name : 'a rival'}${tl.length ? `, who said ${q(clip(tl[0], 20))}` : ''}. Use a word from it.`;
    }
    case 'confession': {
      const about = t ?? ctx.suitors.find((s) => s.id === h.about);
      const f = String(h.flavour ?? 'star');
      const focus: Record<string, string> = {
        star: `talk about ${star} or your chances.`,
        rival: `talk about ${about ? about.name : 'a rival'}.`,
        afterCringe: `${star} just cringed at you.`,
        afterCharm: `${star} was just charmed by you.`,
        final: `you are in the final two${about ? ` against ${about.name}; say what you really think of ${pron(about)}` : ''}.`,
        guess: `read ${star}: from ${typeof h.starSaid === 'string' ? `${q(h.starSaid)}, what ${star} said to you,` : 'her reaction to you'} guess the trait ${star} secretly likes.`,
        fear: `read ${star}: from ${typeof h.starSaid === 'string' ? `${q(h.starSaid)}, what ${star} said to you,` : 'her reaction to you'} guess the trait ${star} secretly cannot stand.`,
      };
      return `Alone in the confession booth; only the audience hears you: ${focus[f] ?? focus.star}`;
    }
    case 'duo': {
      if (who.id === ctx.star.id) return `Final two, alone with ${t ? t.name : 'a finalist'}. Reply to what they just said.`;
      if (h.step === 'steal') return `Final two. ${t ? t.name : 'Your rival'} just had their date with ${star}. Open yours by stealing from or undercutting theirs.`;
      if (h.step === 'close') {
        if (typeof h.promptText === 'string') return `Final two, alone with ${star}, who just said ${q(h.promptText)}. Answer exactly that: your last line before the pick.`;
        const starLast = lastBy(ctx, (r) => r.who === ctx.star.id && r.to === who.id);
        const mark = (h.mark as Mark | undefined) ?? starLast?.mark;
        return `Final two, alone with ${star}, who just said ${starLast ? q(starLast.text) : 'something'}${mark ? ` (${mark})` : ''}. Your last line before the pick.`;
      }
      return `Final two, alone with ${star} for the first time. Make your case.`;
    }
    case 'exit': {
      const reason = String(h.reason ?? lastBy(ctx, (r) => r.kind === 'cut' && r.to === who.id)?.text ?? '');
      return `${star} just cut you${reason ? `: ${q(reason)}` : ''}. Your exit line.`;
    }
    case 'cutline': {
      const lines = t ? linesOf(ctx, t.id, 2) : [];
      const hook = typeof h.hook === 'string' ? ` Quote ${q(h.hook)}.` : '';
      return `You are cutting ${t ? t.name : 'a suitor'}. Say why${typeof h.line === 'string' ? `; their worst line tonight was ${q(h.line)}` : lines.length ? `; tonight they said ${lines.map(q).join(' and ')}` : ''}.${hook}`;
    }
    case 'pickline': {
      const lines = t ? linesOf(ctx, t.id, 2) : [];
      const loser = typeof h.loser === 'string' ? h.loser : '';
      const hook = typeof h.hook === 'string' ? ` Quote ${q(h.hook)}.` : '';
      return `You pick ${t ? t.name : 'a finalist'}${loser ? ` over ${loser}` : ''}. Say why${typeof h.line === 'string' ? `; their best line was ${q(h.line)}` : lines.length ? `; tonight they said ${lines.map(q).join(' and ')}` : ''}, and say the name last.${hook}`;
    }
    case 'bottom': return `Name the bottom two, ${String(h.a ?? '')} and ${String(h.b ?? '')}, before you cut one. Do not say which.`;
    case 'verdict': return `The twist turns are done. Say whose landed, ${String(h.name ?? '')}'s, and settle the card's game.`;
    case 'compare': return `Both dates are done. One line weighing ${String(h.a ?? '')} and ${String(h.b ?? '')}; do not pick yet.`;
    case 'hold': return `${ctx.suitors.filter((s) => ctx.alive.includes(s.id)).map((s) => s.name).join(' and ')} wait for your choice. One line before the long silence; do not reveal it.`;
    case 'win': return `${star} picked you. Your victory line.`;
    case 'lose': return `${star} picked ${nameOf(ctx, typeof h.rival === 'string' ? h.rival : '') || 'the other one'} over you. Your last line.`;
    case 'reveal': {
      const card = (h.card ?? {}) as { label?: string; kind?: string };
      const quote = h.quote as { name?: string; text?: string } | undefined;
      const what = card.kind === 'off' ? 'dealbreaker' : 'turn-on';
      const tail = quote?.text ? `${quote.name ?? 'Someone'} ${card.kind === 'off' ? 'broke' : 'hit'} it with ${q(quote.text)}.` : 'Nobody showed it tonight.';
      return `Your secret ${what} turns face up: ${card.label ?? 'the card'}. ${tail}`;
    }
    case 'outro': return 'Sign off the show.';
    default: return `Your line for this moment (${req.kind}).`;
  }
}

const LINE_SHAPE = '{"line": "..."}';
const USE_SHAPE = '{"use": 1}';
const CHOOSE_SHAPE = '{"id": "..."}';

function numbered(cands: Cand[], withMark = false): string {
  return cands.map((c, i) => `${i + 1}. ${withMark && c.mark ? `(${c.cond ? `${c.cond}, ` : ''}${c.mark}) ` : ''}${c.text}`).join('\n');
}

/** Extra rule for a written line on beats that must be specific. */
function writeRule(req: SpeakReq): string {
  if (req.kind === 'cutline' || req.kind === 'pickline') return ` A new line must name the exact thing ${req.target?.name ?? 'they'} said that did it.`;
  return ' A new line must answer something specific just said.';
}

export function buildSpeak(req: SpeakReq, cands: Cand[], mode: WriteMode = 'hybrid'): Built {
  const { ctx } = req;
  const maxWords = req.maxWords;
  const isEx = req.kind === 'caller';
  const exName = String(req.hint?.exName ?? '') || ((loadBank(ctx.star) as StarBank | null)?.ex?.name ?? 'The Ex');
  const system = isEx ? exSystem(ctx.star, ctx, exName) : systemFor(req.who, ctx);
  const room = roomBlock(ctx, isEx ? null : req.who.id);
  const task = `Now: ${taskFor(req)}`;
  let tail: string;
  let shape: string;
  if (mode === 'free' || !cands.length) {
    shape = LINE_SHAPE;
    tail = `Say it in your voice, at most ${maxWords} words, no stage directions. Reply ${LINE_SHAPE}`;
  } else if (mode === 'bank') {
    shape = USE_SHAPE;
    tail = `Your lines for this moment:\n${numbered(cands)}\nPick the one that plays best right after what was just said. Reply {"use": n}.`;
  } else {
    shape = `${USE_SHAPE} or ${LINE_SHAPE}`;
    tail = `Your lines for this moment:\n${numbered(cands)}\nPick the one that plays best right after what was just said: {"use": n}. Choosing is the normal move. Only if a new line beats every one of them, write it in the same voice, at most ${maxWords} words: {"line": "..."}.${writeRule(req)}`;
  }
  return { system, user: [room, task, tail].join('\n\n'), shape, maxWords, maxTokens: 70, temperature: 0.8 };
}

// ------------------------------------------------------------------------------------------
// The star's reaction: judge (mark, hits) and choose or write the spoken line
// ------------------------------------------------------------------------------------------

/** How generous the star has been tonight against the target mix (30 / 40 / 30). */
export function markMix(ctx: Ctx): string {
  const all = Object.values(ctx.marks).flat();
  const n = all.length;
  const c = (m: Mark) => all.filter((x) => x === m).length;
  let s = `Your marks tonight: ${c('charmed')} charmed, ${c('unsure')} unsure, ${c('cringing')} cringing. Over a night aim for about 3 charmed, 4 unsure, 3 cringing in every 10.`;
  if (n >= 2) {
    const want = { charmed: 0.3, unsure: 0.4, cringing: 0.3 } as Record<Mark, number>;
    const short = (m: Mark) => want[m] * (n + 1) - c(m);
    const over = (m: Mark) => c(m) > (want[m] + 0.15) * (n + 1);
    const worst = (['unsure', 'charmed', 'cringing'] as Mark[]).sort((x, y) => short(y) - short(x))[0];
    const say: Record<Mark, string> = {
      charmed: ' You are short on charmed: if this line is any good, be charmed.',
      unsure: ' You are short on unsure: a line that is fine but not great is unsure.',
      cringing: ' You are short on cringing: if this line is weak, cringe.',
    };
    if (short(worst) >= 0.8) s += say[worst];
    if (over('charmed')) s += ' You have been generous: charmed is only for the best lines.';
    if (over('cringing')) s += ' You have been harsh: cringing is only for the worst lines.';
  }
  return s;
}

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1).replace(/\.$/, '') : s;
}

export interface ReactInfo {
  /** the hits are known (authored tags on a bank line); null when the line was written live */
  knownHits: string[] | null;
}

export function buildReact(req: ReactReq, cands: Cand[], info: ReactInfo, mode: WriteMode = 'hybrid'): Built {
  const { ctx, to } = req;
  const star = req.star;
  const system = systemFor(star, ctx);
  const cards = ctx.type?.cards;
  const label = (id: string) => cards?.find((c) => c.id === id)?.label ?? id;
  let typeText = '';
  if (cards) {
    const [up, hid, off] = cards as [TypeCard, TypeCard, TypeCard];
    if (info.knownHits) {
      const hits = info.knownHits;
      const db = hits.includes(off.id);
      typeText = hits.length
        ? `This line shows your ${db ? `dealbreaker, ${off.label}` : `turn-on, ${hits.map(label).join(' and ')}`}.`
        : 'This line touches none of your cards.';
    } else {
      typeText = `Your cards: [${up.id}] turn-on, ${lowerFirst(up.detect)}; [${hid.id}] secret turn-on, ${lowerFirst(hid.detect)}; [${off.id}] secret dealbreaker, ${lowerFirst(off.detect)}. hits = the ids this exact line plainly shows; most lines show none.`;
    }
  }
  const snap = req.hint?.beat === 'snap';
  if (snap && cards) {
    const up = cards[0];
    typeText = `The walk-on: judge this opener only against your face-up turn-on, ${up.label} (${lowerFirst(up.detect)}). Nothing else counts yet.`;
  }
  const final = ctx.alive.length <= 2 || req.hint?.beat === 'duo';
  const judge = `Judge it: charmed is rare (a line that actually got you), unsure if it is fine but forgettable (most lines), cringing if it is generic, try-hard or grating.${final ? ' You are alone with them in the final two.' : ''}`;
  const hook = typeof req.hook === 'string' && req.hook ? `A new line must answer their words: use ${q(req.hook)} or a word from their line.` : 'A new line must use a word from their line.';
  const hitsKey = info.knownHits ? '' : ', "hits": []';
  let tail: string;
  let shape: string;
  if (mode === 'free' || !cands.length) {
    shape = `{"mark": "..."${hitsKey}, "line": "..."}`;
    tail = `Reply ${shape} with your spoken reaction to ${to.name}, at most ${req.maxWords} words. ${hook}`;
  } else if (mode === 'bank') {
    shape = `{"mark": "..."${hitsKey}, "use": n}`;
    tail = `Lines you could say:\n${numbered(cands, true)}\nReply ${shape} choosing a line that matches your mark.`;
  } else {
    shape = `{"mark": "..."${hitsKey}, "use": n} or {"mark": "..."${hitsKey}, "line": "..."}`;
    tail = `Lines you could say:\n${numbered(cands, true)}\nReply {"mark": "..."${hitsKey}, "use": n} choosing a line that matches your mark; that is the normal move. Only if a new line beats them all, write it, at most ${req.maxWords} words, about what ${to.name} just said: {"mark": "..."${hitsKey}, "line": "..."}. ${hook}`;
  }
  const user = [
    roomBlock(ctx, star.id, req.line),
    `${to.name} just said to you: ${q(req.line)}`,
    typeText,
    markMix(ctx),
    judge,
    tail,
  ].filter(Boolean).join('\n\n');
  return { system, user, shape, maxWords: req.maxWords, maxTokens: 80, temperature: 0.7 };
}

export function buildChoose(req: { star: Bot; among: Bot[]; purpose: 'cut' | 'pick'; ctx: Ctx }): Built {
  const { ctx, star } = req;
  const who = req.among.map((b) => `- ${b.name} (id "${b.id}"): ${linesOf(ctx, b.id, 2).map(q).join(' / ') || 'nothing yet'}`);
  const task = req.purpose === 'cut' ? 'They are tied. Who goes home now?' : 'They are tied. Who do you pick?';
  const user = [roomBlock(ctx, star.id), `Tied:\n${who.join('\n')}`, `${task} Reply ${CHOOSE_SHAPE} with one of the ids above.`].join('\n\n');
  return { system: systemFor(star, ctx), user, shape: CHOOSE_SHAPE, maxWords: 0, maxTokens: 30, temperature: 0.7 };
}

/** The second turn after an answer that could not air. */
export function repairTurn(reason: string, shape: string, maxWords: number): string {
  const limit = maxWords > 0 ? ` A written line is at most ${maxWords} words.` : '';
  return `That could not air: ${reason}. Try again.${limit} Reply with only ${shape}`;
}

// ------------------------------------------------------------------------------------------
// The booth read: the suitor names the card it thinks the star's reaction was about
// ------------------------------------------------------------------------------------------

/** stands in for {card} in read candidates until the model names its card */
export const READ_TOKEN = 'Xqreadqx';

export function buildRead(req: SpeakReq, cands: Cand[], cards: { id: string; noun: string }[]): Built {
  const base = buildSpeak(req, cands, 'bank');
  const list = cards.map((c) => `${c.id} (${c.noun})`).join(', ');
  const shape = '{"use": n, "card": "<cardId>"}';
  const user = `${base.user.replace(/Pick the one that plays best[^\n]*$/, '')}\nIn the line, ${READ_TOKEN} becomes the trait you name. Which trait do you really think it is? One of: ${list}.\nReply ${shape}.`;
  return { ...base, user, shape, maxTokens: 40 };
}
