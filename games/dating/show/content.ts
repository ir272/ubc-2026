// Content check, run on every line before it airs (SPEC "Content check").
// clean() strips em dashes and emoji; check() enforces the word limit and the banned lists.
// PG-13: no slurs, no sexual content, no real people, no "as an AI", no therapy talk, no stock
// romance filler, no lists.

import { words } from './timing.ts';

/** Word limits by line kind (types.ts comments and SPEC timeline). `duo` differs by speaker. */
export const LIMITS: Record<string, number> = {
  intro: 14,
  opener: 12,
  question: 18,
  answer: 20,
  reaction: 10,
  snap: 6, // v2: the star's walk-on snap reaction
  bottom: 12, // v2: naming the bottom two
  verdict: 12, // v2: the turn that landed in round two
  compare: 12, // v2: weighing the two finalists
  twistintro: 18,
  twist: 20, // or the twist card's maxWords
  jab: 10,
  caller: 20,
  duo: 20, // suitor; the star's one-on-one line is a reaction of 14
  duoStar: 14,
  confession: 18,
  cutline: 14,
  exit: 16,
  hold: 14, // v2: holdCard lines are 14 words at most
  pickline: 16,
  win: 16,
  lose: 16,
  reveal: 16,
  outro: 12,
};

export function limitFor(kind: string): number {
  return LIMITS[kind] ?? 20;
}

export interface Checked {
  ok: boolean;
  reason: string;
  cleaned: string;
}

// ------------------------------------------------------------------------------------------
// Lists. Phrases are matched on a lowercased, apostrophe-normalised copy, at word boundaries.
// ------------------------------------------------------------------------------------------

const AI_TALK = [
  'as an ai', 'as a language model', 'as an artificial intelligence', "i'm just an ai", 'i am just an ai',
  "i'm only an ai", 'i am only an ai', "i can't help with", 'i cannot help with', "i can't assist", 'i cannot assist',
  "i'm not able to", 'i am not able to', "i'm sorry, but i", 'i apologize, but i', 'my programming does not allow',
  'openai', 'anthropic', 'chatgpt',
];

const THERAPY = [
  'i hear you', 'your feelings are valid', 'feelings are valid', 'that is valid', "that's valid", 'holding space',
  'hold space', 'safe space', 'set boundaries', 'healthy boundaries', 'self-care', 'self care', 'healing journey',
  'inner child', 'trauma', 'unpack that', "let's unpack", 'process my feelings', 'process your feelings',
  'emotional labor', 'emotional labour', 'attachment style', 'love language', 'my therapist', 'your therapist',
  'communicate my needs', 'gaslight', 'gaslighting', 'toxic', 'narcissist',
];

const ROMANCE_FILLER = [
  'soulmate', 'soul mate', 'you complete me', 'butterflies', 'love at first sight', 'swept off my feet',
  'sweep you off your feet', 'match made in heaven', 'my other half', 'head over heels', 'made for each other',
  'light of my life', 'meant to be', 'happily ever after', 'my heart skips', 'heart skipped a beat',
  'skip a beat', 'the one for me', 'take my breath away', 'took my breath away', 'stole my heart',
];

// Compact slur stems (regex, matched case-insensitively at a word start).
const SLURS = [
  'n[i1!]gg', 'f[a@]gg?[o0]t', 'f[a@]g\\b', 'k[i1]ke\\b', 'sp[i1]c\\b', 'ch[i1]nk\\b', 'g[o0][o0]k\\b',
  'r[e3]t[a@]rd', 'tr[a@]nn(y|ie)', 'wetback', 'beaner', 'dyke\\b', 'coon\\b', 'p[a@]ki\\b', 'raghead',
  'towelhead', 'sp[a@]stic', 'sh[e3]m[a@]le', 'golliwog', 'jap\\b', 'gypped', 'gyp\\b',
];

const SEXUAL = [
  'sex', 'sexual', 'sexually', 'sexting', 'naked', 'nude', 'nudes', 'nudity', 'horny', 'orgasm', 'porn', 'porno',
  'pornography', 'erotic', 'aroused', 'arousal', 'genital', 'genitals', 'penis', 'vagina', 'boobs', 'tits',
  'breasts', 'nipple', 'nipples', 'lingerie', 'thong', 'condom', 'condoms', 'kinky', 'fetish', 'make love',
  'making love', 'hook up', 'hookup', 'one night stand', 'one-night stand', 'strip for', 'undress', 'undressing',
  'in my bed', 'into bed', 'bedroom eyes', 'foreplay', 'sleep with', 'sleeping with',
  'slept with', 'booty call', 'spank', 'dick', 'cock', 'pussy', 'ass', 'butt naked', 'threesome', 'stripper',
];

const REAL_PEOPLE = [
  'elon musk', 'taylor swift', 'trump', 'biden', 'obama', 'kamala', 'harris', 'kardashian', 'beyonce',
  'beyoncé', 'zuckerberg', 'bezos', 'kanye', 'putin', 'zelensky', 'harry styles', 'oprah', 'sam altman', 'altman',
  'bill gates', 'mrbeast', 'mr beast', 'pewdiepie', 'rihanna', 'ariana grande', 'justin bieber', 'bieber',
  'drake', 'the pope', 'king charles', 'tom cruise', 'keanu', 'brad pitt', 'leonardo dicaprio', 'dicaprio',
  'lebron', 'messi', 'ronaldo', 'jeff bezos', 'mark zuckerberg', 'steve jobs', 'tim cook', 'xi jinping',
  'modi', 'macron', 'boris johnson', 'rishi sunak', 'trudeau', 'gordon ramsay', 'snoop dogg', 'kim jong',
];

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function phraseRe(list: string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(${list.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'iu');
}
const RE_AI = phraseRe(AI_TALK);
const RE_THERAPY = phraseRe(THERAPY);
const RE_ROMANCE = phraseRe(ROMANCE_FILLER);
const RE_SEXUAL = phraseRe(SEXUAL);
const RE_PEOPLE = phraseRe(REAL_PEOPLE);
const RE_SLUR = new RegExp(`(?<![\\p{L}])(${SLURS.join('|')})`, 'iu');

// ------------------------------------------------------------------------------------------

const RE_DASH = /\s*[—―–⸺⸻]\s*|\s+--\s+|\s+-\s+/g;
const RE_EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}️︎‍⃣]/gu;
const RE_LIST_LINE = /(^|\n)\s*([-*•]|\d+[.)])\s+/;
const RE_INLINE_NUMBERED = /(^|\s)1[.)]\s.*\s2[.)]\s/;
const RE_STAGE = /\*[^*]+\*|\[[^\]]+\]|\([^)]*(sighs|laughs|winks|pauses|smiles|beat)[^)]*\)/i;

/** Strip em/en dashes, emoji, stray quotes and whitespace. Never fails. */
export function clean(text: string): string {
  let s = String(text ?? '');
  s = s.replace(/\r/g, '');
  s = s.replace(RE_EMOJI, '');
  // a dash between clauses becomes a comma; "word--word" too
  s = s.replace(RE_DASH, ', ').replace(/(\p{L})--(\p{L})/gu, '$1, $2');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/\s+([,.!?;:])/g, '$1').replace(/,\s*,/g, ',').replace(/^,\s*/, '').replace(/,\s*([.!?])/g, '$1');
  // strip wrapping quotes the model sometimes adds
  const m = s.match(/^["“”'](.*)["“”']$/s);
  if (m && !/["“”]/.test(m[1]!)) s = m[1]!.trim();
  return s;
}

export interface CheckOpts {
  maxWords: number;
  /** names in this show; a line that names a real person is still caught by the list */
  allowNames?: string[];
}

/** Full check. `cleaned` is the line to air if ok. */
export function check(text: string, o: CheckOpts): Checked {
  const raw = String(text ?? '');
  const cleaned = clean(raw);
  const fail = (reason: string): Checked => ({ ok: false, reason, cleaned });
  if (!cleaned) return fail('empty');
  if (RE_LIST_LINE.test(raw) || RE_INLINE_NUMBERED.test(raw)) return fail('list');
  if (/\n\s*\n|\n.*\n/.test(raw.trim())) return fail('list');
  if (/[{}]/.test(cleaned)) return fail('unfilled slot');
  if (RE_STAGE.test(cleaned)) return fail('stage direction');
  const n = words(cleaned);
  if (n > o.maxWords) return fail(`words ${n} > ${o.maxWords}`);
  const low = cleaned.toLowerCase().replace(/[‘’]/g, "'");
  let m: RegExpMatchArray | null;
  if ((m = low.match(RE_SLUR))) return fail(`slur`);
  if ((m = low.match(RE_SEXUAL))) return fail(`sexual: ${m[1]}`);
  if ((m = low.match(RE_AI))) return fail(`ai talk: ${m[1]}`);
  if ((m = low.match(RE_THERAPY))) return fail(`therapy talk: ${m[1]}`);
  if ((m = low.match(RE_ROMANCE))) return fail(`romance filler: ${m[1]}`);
  if ((m = low.match(RE_PEOPLE))) {
    const allowed = (o.allowNames ?? []).some((n) => n.toLowerCase() === m![1]);
    if (!allowed) return fail(`real person: ${m[1]}`);
  }
  return { ok: true, reason: '', cleaned };
}

/** Raw-text problems a writer should fix (used by bankcheck): dashes and emoji before cleaning. */
export function rawProblems(text: string): string[] {
  const out: string[] = [];
  if (/[—―–]/.test(text) || /\s--\s|\w--\w/.test(text)) out.push('em dash');
  if (new RegExp(RE_EMOJI.source, 'u').test(text)) out.push('emoji');
  return out;
}
