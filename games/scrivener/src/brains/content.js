// The content check every line passes before it airs: PG-13, no slurs, no sexual content,
// no real people, nothing that breaks the stage's lettering rules (no emoji, no em dashes,
// no links). PURE. A line that fails is regenerated once by the caller, then replaced.

const BLOCK = [
  // slurs and hate (stems; deliberately broad)
  /\bn[i1]gg|\bf[a@]gg?[oi]t|\bk[i1]ke\b|\bsp[i1]c\b|\bch[i1]nk\b|\btrann|\bretard|\bcoon\b|\bwetback|\bgook\b|\bdyke\b/i,
  // sexual content
  /\bsex(?:ual|y)?\b|\bporn|\bnude|\bnaked\b|\bgenital|\bpenis|\bvagin|\bcock\b|\bdick\b|\bpuss(?:y|ies)\b|\bcum\b|\bboob|\btits?\b|\brape|\bmolest|\borgasm|\bhorny|\bslut|\bwhore/i,
  // hard profanity (PG-13 keeps "damn" and "hell")
  /\bf+u+c+k|\bsh[i1]t|\bbitch|\bcunt|\basshole|\bbastard\b|\bmotherf/i,
  // self-harm and real-world violence talk that does not belong in a library duel
  /\bkill (?:yourself|urself)|\bsuicid|\bterroris|\bnazi|\bhitler|\bholocaust|\bgenocid/i,
  // real people and politics: the show names nobody who exists
  /\b(?:trump|biden|obama|putin|musk|bezos|zuckerberg|altman|kamala|harris|netanyahu|zelensky|xi jinping|modi|taylor swift|kanye|rowling|elon|kardashian|epstein|pope)\b/i,
  /\b(?:republican|democrat|liberal|conservative|election|abortion|immigra|israel|palestin|ukrain|russia|china|christian|muslim|jew(?:s|ish)?|islam|allah|jesus|christ)\b/i,
  // breaking the fourth wall
  /\bas an ai\b|\blanguage model\b|\bopenai\b|\banthropic\b|\bi (?:can(?:no|')?t|cannot|won't) (?:help|assist|comply)/i,
  /https?:\/\/|www\.|@\w+/i,
];

// Tidy a model's line for the stage: one line, no quotes around it, no emoji, no em dashes,
// at most `maxWords` words.
export function cleanLine(text, maxWords = 16) {
  let s = String(text ?? '');
  s = s.replace(/[\r\n\t]+/g, ' ');
  s = s.replace(/[—–]/g, ', ').replace(/\s+,/g, ',').replace(/,\s*,/g, ',');
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '');
  s = s.replace(/[*_`#<>]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^["'“‘]+|["'”’]+$/g, '').trim();
  const words = s.split(' ').filter(Boolean);
  if (words.length > maxWords) {
    // over the limit: end on the last full clause that fits, never mid-thought
    const head = words.slice(0, maxWords).join(' ');
    const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('; '), head.lastIndexOf(', '), head.lastIndexOf(': '));
    s = stop > head.length * 0.4 ? head.slice(0, stop) : head;
    s = s.replace(/[,;:]$/, '').replace(/\s+(?:so|and|but|or|the|a|an|to|of|where|that|which|it|i|is|its|my|with|before|when|because)$/i, '');
    if (!/[.!?]$/.test(s)) s += '.';
  }
  return s;
}

// -> { ok, reason }
export function checkLine(text) {
  const s = String(text ?? '');
  if (!s.trim()) return { ok: false, reason: 'empty' };
  if (s.length > 220) return { ok: false, reason: 'too long' };
  for (const re of BLOCK) if (re.test(s)) return { ok: false, reason: 'blocked' };
  if ((s.match(/[A-Z]/g) || []).length > s.length * 0.6 && s.length > 12) return { ok: false, reason: 'shouting' };
  return { ok: true, reason: '' };
}

// Parse a model's reply as JSON even when it is wrapped in prose or code fences.
export function looseJson(text) {
  const s = String(text ?? '');
  const tries = [s, s.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '')];
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) tries.push(s.slice(a, b + 1));
  for (const t of tries) { try { const j = JSON.parse(t.trim()); if (j && typeof j === 'object') return j; } catch { /* next */ } }
  // last resort: pull "key": value pairs out of a cut-off object
  const out = {};
  for (const m of s.matchAll(/"(\w+)"\s*:\s*(?:"((?:[^"\\]|\\.)*)"?|(-?\d+(?:\.\d+)?))/g)) out[m[1]] = m[3] !== undefined ? Number(m[3]) : m[2];
  return Object.keys(out).length ? out : null;
}
