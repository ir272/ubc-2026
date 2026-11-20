// Content check for every line that airs (plan reads, taunts, corner talk, memory lines).
// Runs in node and the browser: no imports.
//
// Rules: PG-13, no slurs, no sexual content, no real people's names, no wording from the
// genre's famous franchise, a word limit per line type. Em dashes become commas, emoji go.
// On failure the caller regenerates once, then airs a safe line from the mock bank (airLine).

export type LineKind = 'read' | 'taunt' | 'corner' | 'memory';

/** words at most per line type (events.ts: read 8, taunt 10, corner talk 12) */
export const WORD_LIMITS: Record<LineKind, number> = { read: 8, taunt: 10, corner: 12, memory: 20 };

// The block lists are base64 so the source does not carry them in plain text.
// A trailing * marks a prefix (matches any ending).
const SLURS_AND_STRONG =
  'bmlnZ2VyLG5pZ2dhLGZhZ2dvdCxmYWcsZHlrZSx0cmFubnkscmV0YXJkLHJldGFyZGVkLHNwaWMsY2hpbmssZ29vayxraWtlLHdldGJhY2ssY29vbixyYWdoZWFkLHRvd2VsaGVhZCxiZWFuZXIscGFraSxzaGVtYWxlLGphcCxkYXJraWUsc2FtYm8saGFsZmJyZWVkLHJlZHNraW4saW5qdW4sZnVjayosbW90aGVyZnVjayosY3VudCx0d2F0LGJpdGNoKix3aG9yZSxzbHV0LGFzc2hvbGU=';
const SEXUAL =
  'c2V4LHNleHksc2V4dWFsKixudWRlLG51ZGVzLG5ha2VkLHBvcm4qLGhvcm55LGJvb2IsYm9vYnMsdGl0cyx0aXR0eSx0aXR0aWVzLHBlbmlzLHZhZ2luYSxvcmdhc20qLGVyb3RpYyosZmV0aXNoKixzdHJpcCBjbHViLHN0cmlwcGVyLGhvb2tlcixwcm9zdGl0dXQqLG1ha2UgbG92ZSxkaWNrLGNvY2sscHVzc3ksY3VtLGJsb3dqb2IsaGFuZGpvYixtYXN0dXJiYXQqLHJhcGUqLG1vbGVzdCosdGhvbmcsbGluZ2VyaWUsc2VkdWMqLGdyb3BlKixraW5reSxmb3JlcGxheSxib290eSBjYWxs';

/** Real people a model is likely to name (full names, or surnames that are not common words). */
const REAL_PEOPLE = [
  'trump', 'biden', 'obama', 'putin', 'xi jinping', 'zelensky', 'zelenskyy', 'macron', 'trudeau', 'modi',
  'netanyahu', 'kim jong', 'hitler', 'stalin', 'mussolini', 'bin laden', 'kamala', 'harris walz', 'desantis',
  'elon', 'musk', 'bezos', 'zuckerberg', 'bill gates', 'steve jobs', 'sam altman', 'altman', 'jensen huang',
  'taylor swift', 'beyonce', 'kanye', 'kardashian', 'rihanna', 'oprah', 'eminem', 'snoop dogg', 'justin bieber',
  'lebron', 'messi', 'ronaldo', 'serena williams', 'michael jordan', 'tiger woods', 'gretzky', 'tom brady',
  'muhammad ali', 'mike tyson', 'usain bolt', 'einstein', 'elvis', 'princess diana', 'king charles',
  'pope francis', 'pope leo', 'mr beast', 'mrbeast', 'pewdiepie', 'joe rogan', 'andrew tate', 'shrek',
];

/** Wording from the genre's famous franchise that must never air (ours, not theirs). */
const FRANCHISE = [
  'smash bros', 'super smash', 'nintendo', 'mario', 'luigi', 'pikachu', 'kirby', 'falcon punch',
  'final destination', 'battlefield stage', 'fox mccloud', 'donkey kong', 'sakurai', 'zelda', 'ganondorf',
];

function decode(b64: string): string[] {
  const text = typeof atob === 'function' ? atob(b64) : '';
  return text.split(',').map((w) => w.trim()).filter(Boolean);
}

function buildRegex(words: string[]): RegExp {
  const parts = words.map((w) => {
    const prefix = w.endsWith('*');
    const core = (prefix ? w.slice(0, -1) : w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    return prefix ? `\\b${core}[a-z]*\\b` : `\\b${core}\\b`;
  });
  return new RegExp(parts.join('|'), 'i');
}

let rules: { name: string; re: RegExp }[] | null = null;
function getRules() {
  if (!rules) {
    rules = [
      { name: 'slur or strong language', re: buildRegex(decode(SLURS_AND_STRONG)) },
      { name: 'sexual content', re: buildRegex(decode(SEXUAL)) },
      { name: 'real person', re: buildRegex(REAL_PEOPLE) },
      { name: 'franchise wording', re: buildRegex(FRANCHISE) },
    ];
  }
  return rules;
}

/** lowercase, undo common letter swaps (f*ck, sh1t, @ss) for matching only */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/(\w)[*.\-_](?=\w)/g, '$1');
}

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0E\uFE0F\u200D\u20E3]/gu;
const TRAILING_STOP = new Set(['and', 'or', 'but', 'the', 'a', 'an', 'to', 'of', 'with', 'for', 'then', 'so', 'at', 'on', 'in', 'my', 'your', 'their', 'is']);

/** Strips em dashes, emoji, markup and wrapping quotes, collapses spaces, trims to the word limit. */
export function cleanLine(raw: unknown, kind: LineKind): string {
  let s = typeof raw === 'string' ? raw : raw == null ? '' : String(raw);
  s = s
    .replace(EMOJI, '')
    .replace(/\s*[\u2014\u2013\u2015\u2012]\s*/g, ', ') // em, en, bar and figure dashes
    .replace(/\s+-{1,3}\s+/g, ', ') // a spaced hyphen used as a dash
    .replace(/[*_`#~<>{}[\]\\]/g, '')
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
  // wrapping quotes or a leading label ("Read:", "Taunt -")
  for (let i = 0; i < 2; i++) {
    s = s.replace(/^["'](.*)["']$/, '$1').trim();
    s = s.replace(/^(read|taunt|talk|corner|memory|line)\s*[:,]\s*/i, '');
  }
  s = s.replace(/^[,;:.\s]+/, '').replace(/,\s*,/g, ',').replace(/\s+([,.!?;:])/g, '$1');
  const limit = WORD_LIMITS[kind];
  let words = s.split(' ').filter(Boolean);
  if (words.length > limit) {
    words = words.slice(0, limit);
    while (words.length > 1 && TRAILING_STOP.has(words[words.length - 1]!.toLowerCase().replace(/[^a-z]/g, ''))) words.pop();
    words[words.length - 1] = words[words.length - 1]!.replace(/[,;:]+$/, '');
  }
  return words.join(' ').replace(/[,;:]+$/, '').trim();
}

export interface LineCheck {
  ok: boolean;
  /** the cleaned line (what airs if ok) */
  text: string;
  reason?: string;
}

/** Cleans a line and checks it. ok=false means: regenerate once, then use a safe line. */
export function checkLine(raw: unknown, kind: LineKind): LineCheck {
  const text = cleanLine(raw, kind);
  if (!text || !/[a-z]/i.test(text)) return { ok: false, text, reason: 'empty' };
  if (text.length > WORD_LIMITS[kind] * 14) return { ok: false, text, reason: 'too long' };
  if (/https?:|www\.|@\w/i.test(text)) return { ok: false, text, reason: 'link or handle' };
  const plain = text.toLowerCase();
  const swapped = normalise(text);
  for (const r of getRules()) {
    if (r.re.test(plain) || r.re.test(swapped)) return { ok: false, text, reason: r.name };
  }
  // masked strong language (f*ck, f.u.c.k, fck), checked on the raw text before markup is stripped
  const rawText = typeof raw === 'string' ? raw : '';
  if (/\bf[\W_]*[u*@v]?[\W_]*c[\W_]*k/i.test(rawText) || /\bf[\W_]*[u*@v]?[\W_]*c[\W_]*k/i.test(text)) return { ok: false, text, reason: 'slur or strong language' };
  return { ok: true, text };
}

export interface AiredLine {
  text: string;
  source: 'model' | 'regen' | 'fallback';
  reason?: string;
}

/**
 * The full check: the first answer, one regeneration if it fails, then a safe fallback line.
 * `regen` may be null (no time left for a second try). Fallback lines are checked too.
 */
export async function airLine(
  kind: LineKind,
  first: unknown,
  regen: (() => Promise<unknown>) | null,
  fallback: () => string,
): Promise<AiredLine> {
  const a = checkLine(first, kind);
  if (a.ok) return { text: a.text, source: 'model' };
  if (regen) {
    try {
      const b = checkLine(await regen(), kind);
      if (b.ok) return { text: b.text, source: 'regen', reason: a.reason };
    } catch {
      /* fall through to the safe line */
    }
  }
  for (let i = 0; i < 4; i++) {
    const c = checkLine(fallback(), kind);
    if (c.ok) return { text: c.text, source: 'fallback', reason: a.reason };
  }
  return { text: kind === 'taunt' ? 'Ready when you are.' : 'Stay sharp.', source: 'fallback', reason: a.reason };
}
