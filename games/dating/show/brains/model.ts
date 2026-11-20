// The model brain: every bot performs through its own OpenRouter model.
//
// Hybrid by default (DATING_WRITE=hybrid|free|bank). The bank is the bot's material and the model is
// the performer: for each beat it gets 2 to 4 of its own bank lines and answers {"use": n}, or, when a
// new line beats them all because it answers something specific just said, {"line": "..."}. The star
// judges every suitor line ({"mark", "hits", "use" | "line"}); code keeps the mark coherent with the
// hits. Any model-written line passes a hard quality gate (gateLine) before it airs: one repair turn
// with the reason, then the best candidate. 'free' writes every line live (still gated); 'bank' only
// chooses and judges.
//
// Every call: hard timeout, compact JSON answer, tolerant parsing, content check, one repair, then
// the fallback. Never throws. Cost per HTTP call is
// appended to .cache/cost.json (cumulative across runs); real calls stop at the budget. A per-model
// circuit breaker sends a model to the fallback for the rest of the episode after three
// consecutive failures. HTTP 402 (the account is out of credit) trips a breaker for every model at
// once: one failed call, then the scripted brain plays the rest of the episode, no retries.
// No code path names a model or a provider: the model is always the speaking bot's own `model`.
//
// v2 (show/FORMAT2.md): the star's paired warm and cold reply to the exact line are her first
// candidates; a reaction she writes must use the line's hook or a word from it, else the paired reply
// airs. Walk-on snaps are judged only against the face-up card. Her one-on-one line is chosen from
// her prompts (so the closer can answer it). A booth read names the card the suitor thinks her
// reaction was about ({"use": n, "card": id}); that guess is the bot's own.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Bot, Brain, Ctx, Decks, Mark, ReactReq, Reacted, RoomLine, SpeakReq, Spoken, StarBank, TypeDraw } from '../types.ts';
import { buildChoose, buildRead, buildReact, buildSpeak, countWords, loadBank, READ_TOKEN, repairTurn, shuffled } from '../prompts.ts';
import type { Built, Cand, WriteMode } from '../prompts.ts';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
export const COST_FILE = path.join(ROOT, '.cache', 'cost.json');
export const MODELS_INFO_FILE = path.join(ROOT, '.cache', 'models-info.json');
const MARKS: Mark[] = ['charmed', 'unsure', 'cringing'];

// ------------------------------------------------------------------------------------------
// Types
// ------------------------------------------------------------------------------------------

export type CheckResult = { ok: boolean; reason?: string; cleaned?: string };
export type CheckFn = (text: string, kind: string, maxWords: number) => CheckResult | Promise<CheckResult>;

export interface CostRecord {
  t: number;
  model: string;
  kind: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  ms: number;
  ok: boolean;
  bot?: string;
  reasoningTokens?: number;
  err?: string;
}
export interface CostFile {
  totalUsd: number;
  calls: number;
  updated: string;
  records: CostRecord[];
}

export interface ModelInfo {
  prompt?: number; // USD per token
  completion?: number;
  params?: string[];
  reasoning?: { mandatory?: boolean; supported_efforts?: string[]; default_enabled?: boolean } | null;
}

export interface ModelBrainOptions {
  roster: Bot[];
  decks: Decks;
  fallback: Brain;
  budgetUsd?: number;
  log?: (s: string) => void;
  // for tools and tests
  fetch?: typeof fetch;
  apiKey?: string;
  costFile?: string;
  modelsInfoFile?: string;
  /** per HTTP call, default 5000 */
  timeoutMs?: number;
  /** per brain call including the repair, default 5700 (the episode gives a call 6 s) */
  deadlineMs?: number;
  check?: CheckFn;
  /** called after every HTTP call (the probe prints these) */
  onCall?: (rec: CostRecord & { raw?: string }) => void;
  /** default from DATING_WRITE, else 'hybrid' */
  write?: WriteMode;
  /** bank candidates offered per beat, 2 to 4 (default 3) */
  candidates?: number;
}

export interface ModelBrainStats {
  calls: number;
  modelAnswers: number;
  fallbacks: number;
  repairs: number;
  spentUsd: number; // this process
  totalUsd: number; // cumulative, from the cost file
  budgetUsd: number;
  mode: WriteMode;
  /** lines returned by this brain: bank = a bank line the model chose, model = written live and gated,
   *  fallback = the model gave nothing usable and the best candidate (or the scripted brain) was used */
  aired: { bank: number; model: number; fallback: number };
  /** the star's marks returned */
  marks: Record<Mark, number>;
  /** marks or reaction lines changed in code to stay coherent with the hits */
  coerced: number;
  /** model-written lines refused by the gate, by reason */
  gate: Record<string, number>;
}

// ------------------------------------------------------------------------------------------
// Parsing (exported for tests)
// ------------------------------------------------------------------------------------------

/** Strip reasoning blocks and code fences. */
export function unwrap(raw: string): string {
  return String(raw ?? '')
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/^[\s\S]*?<\/think(?:ing)?>/i, '')
    .replace(/```(?:json|JSON)?/g, '')
    .trim();
}

/** The first balanced JSON object in the text, parsed leniently. Null if there is none. */
export function extractJson(raw: string): Record<string, unknown> | null {
  const s = unwrap(raw);
  for (let start = s.indexOf('{'); start >= 0; start = s.indexOf('{', start + 1)) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        const obj = lenientParse(s.slice(start, i + 1));
        if (obj) return obj;
        break;
      }
    }
  }
  return null;
}

function lenientParse(src: string): Record<string, unknown> | null {
  const tries = [
    src,
    src.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1'),
    src.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1').replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":').replace(/:\s*'([^']*)'/g, ': "$1"'),
    src.replace(/([{,]\s*)([A-Za-z_]+)\s*:/g, '$1"$2":'),
  ];
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch { /* next */ }
  }
  return null;
}

const firstString = (o: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) if (typeof o[k] === 'string' && (o[k] as string).trim()) return o[k] as string;
  return null;
};

/** {"line": "..."} or a bare string. Null when nothing usable. */
export function parseLine(raw: string): string | null {
  const s = unwrap(raw);
  if (!s) return null;
  const obj = extractJson(s);
  if (obj) return firstString(obj, ['line', 'text', 'say', 'answer', 'response']) ?? null;
  if (s.includes('{')) {
    const m = /"line"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(s);
    if (m) {
      try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
    }
    return null; // truncated or broken JSON
  }
  // a bare string: the model just said the line
  return s.split(/\n+/).map((x) => x.trim()).filter(Boolean)[0] ?? null;
}

export function normMark(v: unknown): Mark | null {
  const s = String(v ?? '').toLowerCase().trim();
  if (MARKS.includes(s as Mark)) return s as Mark;
  if (/charm|love|smitten|delight/.test(s)) return 'charmed';
  if (/cring|ick|disgust|repuls|hate/.test(s)) return 'cringing';
  if (/unsure|meh|neutral|undecided|maybe|mixed|bored/.test(s)) return 'unsure';
  return null;
}

/** Only ids among the star's three cards; labels are mapped to ids; each card at most once. */
export function validHits(v: unknown, cards: { id: string; label: string }[]): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(/[,;]/) : [];
  const out: string[] = [];
  for (const x of list) {
    const s = String(x ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    const card = cards.find((c) => c.id.toLowerCase() === s || c.label.toLowerCase() === s);
    if (card && !out.includes(card.id)) out.push(card.id);
  }
  return out;
}

export function parseReact(raw: string, cards: { id: string; label: string }[]): { mark: Mark; hits: string[]; line: string } | string {
  const obj = extractJson(raw);
  if (!obj) return 'it was not a JSON object';
  const mark = normMark(obj.mark ?? obj.reaction_mark ?? obj.verdict);
  if (!mark) return 'mark must be exactly one of charmed, unsure, cringing';
  const line = firstString(obj, ['line', 'text', 'reaction', 'say']);
  if (!line) return 'the line was missing';
  return { mark, hits: validHits(obj.hits ?? obj.cards ?? [], cards), line };
}

export function parseChoose(raw: string, among: Bot[]): string | null {
  const obj = extractJson(raw);
  const val = obj ? firstString(obj, ['id', 'pick', 'choice', 'cut', 'name']) : unwrap(raw);
  if (!val) return null;
  const v = val.trim().toLowerCase().replace(/^["']|["'.]$/g, '');
  const exact = among.find((b) => b.id.toLowerCase() === v || b.name.toLowerCase() === v);
  if (exact) return exact.id;
  const named = among.filter((b) => new RegExp(`\\b(${esc(b.id)}|${esc(b.name)})\\b`, 'i').test(val));
  return named.length === 1 ? named[0].id : null;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Make a raw line airable: no wrapping quotes, name label, stage directions, em dashes or emoji. */
export function cleanLine(raw: string, name?: string): string {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (name) s = s.replace(new RegExp(`^\\**${esc(name)}\\**\\s*:\\s*`, 'i'), '');
  s = s.replace(/\*[^*]{1,60}\*/g, ' ').replace(/^\s*[([][^)\]]{1,60}[)\]]\s*/, '');
  s = s.replace(/\s*[—–]\s*/g, ', ').replace(/\s+-{1,2}\s+/g, ', ');
  s = s.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍]/gu, '');
  s = s.replace(/\s+([,.!?;:])/g, '$1').replace(/,\s*,/g, ',').replace(/^[,\s]+/, '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 2; i++) {
    const m = /^(["'“‘])(.*)(["'”’])$/.exec(s);
    if (m && countQuotes(m[2]) % 2 === 0) s = m[2].trim();
  }
  return s;
}

const countQuotes = (s: string) => (s.match(/["“”]/g) ?? []).length;

/** Over the limit: keep whole sentences that fit, if that leaves a real line. */
export function fitWords(s: string, maxWords: number): string | null {
  if (countWords(s) <= maxWords) return s;
  const sentences = s.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [s];
  let out = '';
  for (const sent of sentences) {
    const next = (out + ' ' + sent).trim();
    if (countWords(next) > maxWords) break;
    out = next;
  }
  const w = countWords(out);
  return w >= Math.min(3, maxWords) && w >= Math.ceil(maxWords * 0.4) ? out : null;
}

// ------------------------------------------------------------------------------------------
// Content check: show/content.ts if present, else a small local one
// ------------------------------------------------------------------------------------------

const BANNED = [
  /\bas an ai\b/i, /\blanguage model\b/i, /\bI(?:'m| am) (?:just )?an ai\b/i,
  /\b(?:I can(?:no|')t|I(?:'m| am) (?:not able|unable)|I won'?t) (?:help|assist|comply|do that|provide|create|write)/i,
  /\bsoul ?mate\b/i, /\bbutterflies\b/i, /\byou complete me\b/i, /\bheart skip/i, /\bsafe space\b/i,
  /\bboundaries\b/i, /\bhealing journey\b/i,
];

export const localCheck: CheckFn = (text, _kind, maxWords) => {
  const t = text.trim();
  if (!t) return { ok: false, reason: 'the line was empty' };
  if (/^\s*(?:\d+[.)]|[-*•])\s/m.test(t) || /\n/.test(t)) return { ok: false, reason: 'it was a list; say one line' };
  const hit = BANNED.find((r) => r.test(t));
  if (hit) return { ok: false, reason: 'it used a banned phrase or stepped out of character' };
  const n = countWords(t);
  if (maxWords > 0 && n > maxWords) return { ok: false, reason: `it was ${n} words; the limit is ${maxWords}` };
  return { ok: true, cleaned: t.replace(/[—–]/g, ',') };
};

let contentCheck: Promise<CheckFn> | null = null;
/** show/content.ts exports check(text, { maxWords, allowNames }); a (text, kind, maxWords) form also works. */
function loadCheck(names: string[]): Promise<CheckFn> {
  contentCheck ??= import(new URL('../content.ts', import.meta.url).href)
    .then((m: { check?: (...a: any[]) => CheckResult }) => {
      const f = m.check;
      if (typeof f !== 'function') return localCheck;
      if (f.length >= 3) return f as CheckFn;
      return ((text: string, _kind: string, maxWords: number) => f(text, { maxWords, allowNames: names })) as CheckFn;
    })
    .catch(() => localCheck);
  return contentCheck;
}

// ------------------------------------------------------------------------------------------
// Cost file
// ------------------------------------------------------------------------------------------

const round8 = (x: number) => Math.round(x * 1e8) / 1e8;

export function readCostFile(file: string): CostFile {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    try {
      const f = JSON.parse(raw) as CostFile;
      const records = Array.isArray(f.records) ? f.records : [];
      const totalUsd = typeof f.totalUsd === 'number' ? f.totalUsd : records.reduce((a, r) => a + (r.costUsd || 0), 0);
      return { totalUsd, calls: records.length, updated: f.updated ?? '', records };
    } catch {
      // never forget money already spent: keep the total if it can be read at all
      const m = /"totalUsd"\s*:\s*([\d.]+)/.exec(raw);
      return { totalUsd: m ? parseFloat(m[1]) : 0, calls: 0, updated: '', records: [] };
    }
  } catch {
    return { totalUsd: 0, calls: 0, updated: '', records: [] };
  }
}

class CostLog {
  file: string;
  total: number;
  spent = 0;
  private readAt = 0;
  constructor(file: string) {
    this.file = file;
    this.total = readCostFile(file).totalUsd;
    this.readAt = Date.now();
  }
  /** Re-read the shared total now and then: other processes may be spending too. */
  current(): number {
    if (Date.now() - this.readAt > 5000) {
      this.total = Math.max(this.total, readCostFile(this.file).totalUsd);
      this.readAt = Date.now();
    }
    return this.total;
  }
  append(rec: CostRecord): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const f = readCostFile(this.file);
      f.records.push(rec);
      f.totalUsd = round8(f.totalUsd + (rec.costUsd || 0));
      f.calls = f.records.length;
      f.updated = new Date().toISOString();
      const tmp = `${this.file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ totalUsd: f.totalUsd, calls: f.calls, updated: f.updated, records: f.records }, null, 0).replace(/},{"t"/g, '},\n{"t"'));
      fs.renameSync(tmp, this.file);
      this.total = f.totalUsd;
      this.readAt = Date.now();
    } catch {
      this.total = round8(this.total + (rec.costUsd || 0));
    }
    this.spent = round8(this.spent + (rec.costUsd || 0));
  }
}

function readModelsInfo(file: string): Record<string, ModelInfo> {
  try {
    const f = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (f && typeof f === 'object' && f.models) || {};
  } catch {
    return {};
  }
}

/** The key from the environment, else from games/dating/.env (read, never copied into env). */
function readKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  try {
    const m = /^\s*OPENROUTER_API_KEY\s*=\s*["']?([^"'\s#]+)/m.exec(fs.readFileSync(path.join(ROOT, '.env'), 'utf8'));
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

// ------------------------------------------------------------------------------------------
// The quality gate on model-written lines (exported for tests)
// ------------------------------------------------------------------------------------------

/** Stock romance filler and therapy words. A model-written line with any of these never airs. */
export const FILLER: RegExp[] = [
  /\b(?:your|her|his|their|those|my) (?:eyes|smile|heart|soul|gaze|laugh)\b/i,
  /\bsparkl/i, /\bsparks?\b/i, /\bchemistry\b/i, /\bsoul ?mates?\b/i, /\bbutterfl/i, /\bdestiny\b/i, /\bfate\b/i,
  /\bmeant to be\b/i, /\bcomplete(?:s)? me\b/i, /\bheart ?(?:beat|skip|race|flutter|melt|sings?)/i, /\bmelt(?:s|ed|ing)?\b/i,
  /\bswoon/i, /\bcherish/i, /\bmagic(?:al)?\b/i, /\bfalling for you\b/i, /\bcharm in\b/i, /\b(?:deep|real|special|true) connection\b/i,
  /\bjourney\b/i, /\bvalid(?:ate|ated|ation|ating)?\b/i, /\bboundar(?:y|ies)\b/i, /\bheal(?:ing|ed)?\b/i, /\bself[- ]care\b/i,
  /\bvulnerab/i, /\bauthentic/i, /\bsafe space\b/i, /\bhold(?:ing)? space\b/i, /\bmy truth\b/i, /\bi hear you\b/i,
  /\bvibes?\b/i, /\bfeelings are\b/i, /\bemotional(?:ly)?\b/i, /\btrauma/i,
];

const META_CARDS = /\b(?:turn[- ]?ons?|deal ?breakers?|face[- ]up|hidden cards?|cards?)\b/i;
const META_MARKS = /\b(?:cringing|cringed|unsure|charmed|marked|(?:my|your|her|his|their|the) marks?)\b/i;
const META_SHOW = /\b(?:(?:the|this) room|(?:the|this|my|our|your) (?:show|episode)|audience|viewers|betting|bets|standings?|transcript|json|prompt|candidates?|word limit|option \d|line \d)\b/i;
const META_LOGS = /\blogs?\b/i;
/** the model talking as an assistant, or narrating the scene instead of speaking in it */
const ASSISTANT = /\b(?:let me (?:think|work|analy[sz]e|break|consider|start|see)|step by step|work through this|here(?:'s| is) (?:my|a|the) (?:line|answer|response)|as requested|i(?:'ll| will) (?:choose|pick|go with))\b/i;
const NARRATION = /^(?!(?:You|We|They|She|He|It|I)\b)(?:[Tt]he ex|[A-Z][\w']+(?: [A-Z][\w']+)?) (?:just |has just )?(?:asked|said|says|delivered|wants|is asking|told|replied|mentioned|called)\b/;

const STOP = new Set(`that this with your have just what like about they them there their will would could should been were from when
then than some only into over more very much know really here where which while also back even ever every never always still
because before after again other these those does doing done make made want need tell said says going come came take took give
gave look well good great right think thing things little first last time times being yours mine ours shall might must each
both such once upon onto down away okay yeah sure maybe whole thou thee thy thine dear kindly please sorry thank thanks
nothing something anything everything someone anyone everyone nobody somebody anybody tonight today yourself myself itself
cannot didn don doesn isn wasn aren won wouldn couldn shouldn haven hasn let lets got gets getting keep kept went goes
said say saying call called four three five seven eight nine eleven twelve hundred thousand million`.split(/\s+/).filter(Boolean));

function stem(w: string): string {
  let s = w.replace(/'s$/, '').replace(/[’']/g, '');
  if (s.length > 6 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 5 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('ies')) s = s.slice(0, -3) + 'y';
  else if (s.length > 4 && s.endsWith('es') && /(?:sh|ch|x|ss)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  return s;
}

/** Content words: 4+ letters, not a stop word, not a name. Lowercased and lightly stemmed. */
export function contentWords(text: string, names: string[] = []): Set<string> {
  const nm = new Set(names.flatMap((n) => n.toLowerCase().split(/\s+/)).map(stem));
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[\p{L}][\p{L}'’]*/gu) ?? []) {
    const w = stem(raw);
    if (w.length < 4 || STOP.has(w) || STOP.has(raw) || nm.has(w)) continue;
    out.add(w);
  }
  return out;
}

export interface GateCtx {
  kind: string;
  maxWords: number;
  /** the speaker's id ('ex' for the caller) */
  who: string;
  /** every cast name (never counts as a content word) */
  names: string[];
  /** the public room, oldest first */
  room: RoomLine[];
  /** this speaker's earlier lines tonight (room and booth) */
  own: string[];
  twistId?: string;
  /** this speaker's model-written lines on earlier shows (their jokes are spent) */
  past?: string[];
  /** cutline / pickline: the target's lines, of which a written line must name something */
  mustName?: string[];
}

/** Null when the line may air, else the reason (said back to the model). */
export function gateLine(text: string, g: GateCtx): string | null {
  const n = countWords(text);
  if (n === 0) return 'the line was empty';
  if (g.maxWords > 0 && n > g.maxWords) return `it was ${n} words; the limit is ${g.maxWords}`;
  if (ASSISTANT.test(text)) return 'it talked like an assistant; speak as yourself, on air';
  if (g.kind !== 'jab' && g.kind !== 'confession' && NARRATION.test(text.trim())) return 'it narrated what someone said; say your own line to them instead';
  const filler = FILLER.find((r) => r.test(text));
  if (filler) return `it used stock romance or therapy words ("${(text.match(filler) ?? [''])[0]}")`;
  if (g.kind !== 'twistintro' && g.kind !== 'reveal' && META_CARDS.test(text)) return 'it talked about the cards; talk about what was said';
  if (META_MARKS.test(text)) return 'it talked about the marks; react to what was said instead';
  if (g.kind !== 'intro' && g.kind !== 'outro' && META_SHOW.test(text)) return `it talked about the show itself ("${(text.match(META_SHOW) ?? [''])[0]}")`;
  if (!(g.kind === 'twist' && g.twistId === 'logs') && META_LOGS.test(text)) return 'it talked about logs; say something about the person instead';
  const mine = contentWords(text, g.names);
  if (g.kind !== 'jab') {
    const prev = g.room.filter((r) => r.who !== g.who && r.kind !== 'confession').slice(-2);
    // an answer must not restate the question it answers
    if (g.kind === 'answer') {
      const asked = [...g.room].reverse().find((r) => r.kind === 'question');
      if (asked && !prev.includes(asked)) prev.push(asked);
    }
    for (const r of prev) {
      const shared = [...contentWords(r.text, g.names)].filter((w) => mine.has(w));
      if (shared.length > 1) return `it echoed ${r.name}'s words (${shared.join(', ')}); say something of your own`;
    }
  }
  const counts = new Map<string, number>();
  for (const line of new Set(g.own)) for (const w of contentWords(line, g.names)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const worn = [...mine].filter((w) => (counts.get(w) ?? 0) >= 2);
  if (worn.length) return `you already said "${worn[0]}" twice tonight; find a new image`;
  for (const line of g.own) {
    const shared = [...contentWords(line, g.names)].filter((w) => mine.has(w));
    if (shared.length > 1) return `you already made that joke tonight (${shared.join(', ')}); find a new one`;
  }
  for (const line of g.past ?? []) {
    const shared = [...contentWords(line, g.names)].filter((w) => mine.has(w));
    if (shared.length > 1) return `you made that joke on an earlier show (${shared.join(', ')}); find a new one`;
  }
  if (g.mustName?.length) {
    const theirs = new Set(g.mustName.flatMap((l) => [...contentWords(l, g.names)]));
    if (![...mine].some((w) => theirs.has(w))) return 'it did not name the thing they actually said';
  }
  return null;
}

// ------------------------------------------------------------------------------------------
// Parsing a choice (exported for tests)
// ------------------------------------------------------------------------------------------

export type Choice = { use: number } | { line: string };

/** {"use": n} (1-based, within n candidates) or {"line": "..."}. A string is the reason it failed. */
export function parseChoice(raw: string, n: number, mode: WriteMode = 'hybrid'): Choice | string {
  const obj = extractJson(raw);
  if (obj) {
    const u = obj.use ?? obj.choice ?? obj.pick ?? obj.option ?? obj.index;
    if (u != null && u !== '' && mode !== 'free') {
      const k = typeof u === 'number' ? u : parseInt(String(u).replace(/\D+/g, ''), 10);
      if (Number.isInteger(k) && k >= 1 && k <= n) return { use: k };
      return `use must be a number from 1 to ${n}`;
    }
    const line = firstString(obj, ['line', 'text', 'say']);
    if (line) return mode === 'bank' ? `reply {"use": n} with a number from 1 to ${n}` : { line };
    return n && mode !== 'free' ? `reply {"use": n} or {"line": "..."}` : 'the line was missing';
  }
  const s = unwrap(raw).trim();
  if (mode !== 'free' && /^\d+\.?$/.test(s)) {
    const k = parseInt(s, 10);
    if (k >= 1 && k <= n) return { use: k };
  }
  if (mode !== 'bank') {
    const line = parseLine(raw);
    if (line && !s.includes('{')) return { line };
  }
  return 'it was not a JSON object';
}

export type ReactChoice = { mark: Mark; hits: string[] } & Choice;

export function parseReactChoice(raw: string, cards: { id: string; label: string }[], n: number, mode: WriteMode = 'hybrid'): ReactChoice | string {
  const obj = extractJson(raw);
  if (!obj) return 'it was not a JSON object';
  const mark = normMark(obj.mark ?? obj.reaction_mark ?? obj.verdict);
  if (!mark) return 'mark must be exactly one of charmed, unsure, cringing';
  const c = parseChoice(raw, n, mode);
  if (typeof c === 'string') return c;
  return { mark, hits: validHits(obj.hits ?? obj.cards ?? [], cards), ...c };
}

/** A dealbreaker hit is cringing; a turn-on hit alone is never cringing; otherwise the model's mark. */
export function coherentMark(mark: Mark, hits: string[], type?: TypeDraw): Mark {
  if (!type) return mark;
  const db = type.cards[2].id;
  if (hits.includes(db)) return 'cringing';
  if (hits.some((h) => h === type.cards[0].id || h === type.cards[1].id) && mark === 'cringing') return 'charmed';
  return mark;
}

export function writeMode(v = process.env.DATING_WRITE): WriteMode {
  const s = String(v ?? '').toLowerCase().trim();
  return s === 'free' || s === 'bank' ? s : 'hybrid';
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------------------------------
// The brain
// ------------------------------------------------------------------------------------------

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
type Attempt = { ok: true; text: string } | { ok: false; why: 'budget' | 'timeout' | 'http' | 'empty' | 'deadline' | 'payment'; err: string };
type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

/** What the scripted brain may offer (duck-typed: the methods may not exist yet). */
interface CandidateSource {
  candidates?: (req: SpeakReq, n: number) => { text: string; tags?: string[]; hook?: string }[];
  reactCandidates?: (req: ReactReq, mark: Mark, hits: string[], n: number) => string[];
  replyPair?: (req: ReactReq) => { warm: string; cold: string } | null;
  markUsed?: (text: string, episode?: number) => void;
  banks?: { star(id: string): StarBank | null };
}

/** fixed authored lines: with one candidate there is nothing to decide */
const SINGLE_KINDS = new Set(['question', 'twistintro']);
/** beats where a written line has nothing specific to answer: the model only chooses */
const CHOOSE_ONLY = new Set(['intro', 'question', 'twistintro', 'hold', 'reveal', 'outro', 'bottom', 'compare']);
/** model-written lines per bot per episode in hybrid mode; after that the bot only chooses */
const WRITE_CAP = 3;

/** A candidate that says nearly what the speaker already said tonight (the same joke, re-skinned). */
export function nearRepeat(text: string, earlier: string[], names: string[] = []): boolean {
  const mine = contentWords(text, names);
  if (!mine.size) return false;
  return earlier.some((e) => {
    const shared = [...contentWords(e, names)].filter((w) => mine.has(w)).length;
    return shared >= 2 && shared / mine.size >= 0.4;
  });
}

export function createModelBrain(o: ModelBrainOptions): Brain & { stats(): ModelBrainStats } {
  const log = o.log ?? (() => {});
  const doFetch = o.fetch ?? globalThis.fetch;
  const apiKey = o.apiKey ?? readKey();
  const budget = o.budgetUsd ?? (parseFloat(process.env.DATING_BUDGET_USD ?? '') || 1.5);
  const timeoutMs = o.timeoutMs ?? 5000;
  const deadlineMs = o.deadlineMs ?? 5700;
  const mode: WriteMode = o.write ?? writeMode();
  const nCands = Math.max(2, Math.min(4, o.candidates ?? 3));
  const cost = new CostLog(o.costFile ?? COST_FILE);
  const info = readModelsInfo(o.modelsInfoFile ?? MODELS_INFO_FILE);
  const names = o.roster.flatMap((b) => [b.name, b.id]);
  const check = o.check ? Promise.resolve(o.check) : loadCheck(o.roster.map((b) => b.name));
  const allCards = o.decks.cards.map((c) => ({ id: c.id, label: c.label }));
  const src = o.fallback as Brain & CandidateSource;

  const noReasoning = new Set<string>();
  const noTemperature = new Set<string>();
  const thinkers = new Set<string>(); // models seen spending the token cap on hidden reasoning
  const breaker = new Map<string, { episode: number; fails: number }>();
  /** the episode in which the account ran out of credit (HTTP 402): every call goes scripted */
  let unpaid = -1;
  const isUnpaid = (episode: number) => unpaid === episode;
  const stats = {
    calls: 0, modelAnswers: 0, fallbacks: 0, repairs: 0,
    aired: { bank: 0, model: 0, fallback: 0 },
    marks: { charmed: 0, unsure: 0, cringing: 0 } as Record<Mark, number>,
    coerced: 0,
    gate: {} as Record<string, number>,
  };
  // per episode: what each bot said through this brain (booth lines are not in the room), the
  // star's reactions used, and the texts the models wrote (their hits are judged, not authored)
  // across episodes: each bot's model-written lines (a cheap model's favourite joke comes back)
  const pastWritten = new Map<string, string[]>();
  // across episodes: every line each bot said through this brain (bank lines are not re-run)
  const pastSaid = new Map<string, Set<string>>();
  const saidBefore = (who: string, t: string) => pastSaid.get(who)?.has(norm(t)) ?? false;
  /** names of roster bots who are not on tonight; a bank line naming one is skipped */
  const absentRe = (ctx: Ctx): RegExp | null => {
    const here = new Set([ctx.star.id, ...ctx.suitors.map((b) => b.id)]);
    const gone = o.roster.filter((b) => !here.has(b.id)).flatMap((b) => [b.name, b.id]).filter((x) => x.length > 2);
    return gone.length ? new RegExp(`\\b(?:${gone.map(esc).join('|')})\\b`, 'i') : null;
  };
  const ep = { n: -1, said: new Map<string, string[]>(), usedReact: new Set<string>(), written: new Set<string>() };
  const epFor = (episode: number) => {
    if (ep.n !== episode) {
      ep.n = episode;
      ep.said.clear();
      ep.usedReact.clear();
      ep.written.clear();
    }
    return ep;
  };
  let warnedBudget = false;
  if (!apiKey) log('model brain: no OPENROUTER_API_KEY, every call uses the fallback');

  function reasoningFor(model: string): { param?: Record<string, unknown>; extraTokens: number } {
    if (noReasoning.has(model)) return { extraTokens: thinkers.has(model) ? 300 : 0 };
    const mi = info[model];
    if (!mi) return { param: { effort: 'minimal', exclude: true }, extraTokens: thinkers.has(model) ? 300 : 0 };
    const p = mi.params ?? [];
    const r = mi.reasoning;
    if (!r || !(p.includes('reasoning') || p.includes('reasoning_effort') || p.includes('include_reasoning'))) return { extraTokens: 0 };
    const efforts = r.supported_efforts ?? [];
    const bump = thinkers.has(model) ? 300 : 0;
    if (efforts.includes('none')) return { param: { effort: 'none', exclude: true }, extraTokens: bump };
    if (efforts.includes('minimal')) return { param: { effort: 'minimal', exclude: true }, extraTokens: 200 + bump };
    if (efforts.includes('low')) return { param: { effort: 'low', exclude: true }, extraTokens: 500 + bump };
    if (!r.mandatory) return { param: { enabled: false }, extraTokens: bump };
    return { param: { exclude: true }, extraTokens: 600 + bump };
  }

  function priceOf(model: string, pt: number, ct: number): number {
    const mi = info[model];
    return mi && typeof mi.prompt === 'number' && typeof mi.completion === 'number' ? round8(pt * mi.prompt + ct * mi.completion) : 0;
  }

  function breakerOpen(model: string, episode: number): boolean {
    const b = breaker.get(model);
    if (!b || b.episode !== episode) return false;
    return b.fails >= 3;
  }
  function noteResult(model: string, episode: number, ok: boolean): void {
    let b = breaker.get(model);
    if (!b || b.episode !== episode) b = { episode, fails: 0 };
    b.fails = ok ? 0 : b.fails + 1;
    breaker.set(model, b);
    if (b.fails === 3) log(`model brain: circuit open for ${model} until the next episode`);
  }

  /** One HTTP call (plus an immediate retry if the API rejects an optional parameter). */
  /**
   * The first HTTP call of an episode goes alone: the calls that start while it is in flight wait for
   * it, so an account out of credit costs one failed call, not one per bot (the title fires five at once).
   */
  let probe: { episode: number; done: boolean; p: Promise<void> } | null = null;
  async function attempt(model: string, botId: string, kind: string, messages: Msg[], built: Built, deadline: number, episode: number): Promise<Attempt> {
    if (probe?.episode === episode && !probe.done) await probe.p;
    if (isUnpaid(episode)) return { ok: false, why: 'payment', err: 'payment' };
    if (probe?.episode !== episode) {
      let release!: () => void;
      const p = new Promise<void>((r) => (release = r));
      const mine = { episode, done: false, p };
      probe = mine;
      try {
        return await attemptOnce(model, botId, kind, messages, built, deadline, episode);
      } finally {
        mine.done = true;
        release();
      }
    }
    return attemptOnce(model, botId, kind, messages, built, deadline, episode);
  }

  async function attemptOnce(model: string, botId: string, kind: string, messages: Msg[], built: Built, deadline: number, episode: number): Promise<Attempt> {
    if (cost.current() >= budget) {
      if (!warnedBudget) log(`model brain: budget reached ($${cost.current().toFixed(4)} of $${budget.toFixed(2)}), using the fallback`);
      warnedBudget = true;
      return { ok: false, why: 'budget', err: 'budget' };
    }
    for (let fix = 0; fix < 2; fix++) {
      const left = deadline - Date.now();
      if (left < 400) return { ok: false, why: 'deadline', err: 'deadline' };
      const rz = reasoningFor(model);
      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: built.maxTokens + rz.extraTokens,
        usage: { include: true },
      };
      if (!noTemperature.has(model)) body.temperature = built.temperature;
      if (rz.param) body.reasoning = rz.param;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), Math.min(timeoutMs, left));
      const t0 = Date.now();
      const rec: CostRecord = { t: t0, model, kind, promptTokens: 0, completionTokens: 0, costUsd: 0, ms: 0, ok: false, bot: botId };
      let raw = '';
      try {
        const res = await doFetch(ENDPOINT, {
          method: 'POST',
          signal: ac.signal,
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            'http-referer': 'https://localhost/compatibility-mode',
            'x-title': 'Compatibility Mode',
          },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = { error: { message: text.slice(0, 200) } }; }
        rec.ms = Date.now() - t0;
        const u = data?.usage ?? {};
        rec.promptTokens = Number(u.prompt_tokens) || 0;
        rec.completionTokens = Number(u.completion_tokens) || 0;
        const rt = Number(u.completion_tokens_details?.reasoning_tokens) || 0;
        if (rt) rec.reasoningTokens = rt;
        rec.costUsd = typeof u.cost === 'number' ? u.cost : priceOf(model, rec.promptTokens, rec.completionTokens);
        if (!res.ok || data?.error) {
          const msg = String(data?.error?.message ?? `HTTP ${res.status}`).slice(0, 160);
          const status = res.ok ? Number(data?.error?.code) || 502 : res.status;
          rec.err = `${status} ${msg}`;
          cost.append(rec);
          o.onCall?.(rec);
          if (status === 400 && body.reasoning && /reason|think|effort/i.test(msg) && fix === 0) {
            noReasoning.add(model);
            log(`model brain: ${model} rejected the reasoning parameter, retrying without it`);
            continue;
          }
          if (status === 400 && 'temperature' in body && /temperature/i.test(msg) && fix === 0) {
            noTemperature.add(model);
            continue;
          }
          if (status === 402) {
            if (unpaid !== episode) log(`model brain: HTTP 402 (out of credit): the scripted brain plays the rest of episode ${episode}`);
            unpaid = episode;
            return { ok: false, why: 'payment', err: rec.err };
          }
          return { ok: false, why: 'http', err: rec.err };
        }
        const choice = data?.choices?.[0];
        const content = choice?.message?.content;
        raw = Array.isArray(content) ? content.map((p: any) => (typeof p === 'string' ? p : p?.text ?? '')).join('') : String(content ?? '');
        if (!raw.trim()) {
          if (choice?.finish_reason === 'length' || rt > 0) thinkers.add(model);
          rec.err = `empty (${choice?.finish_reason ?? 'no content'}${rt ? `, ${rt} reasoning tokens` : ''})`;
          cost.append(rec);
          o.onCall?.(rec);
          return { ok: false, why: 'empty', err: rec.err };
        }
        rec.ok = true;
        cost.append(rec);
        o.onCall?.({ ...rec, raw });
        return { ok: true, text: raw };
      } catch (e: any) {
        rec.ms = Date.now() - t0;
        const timedOut = e?.name === 'AbortError' || ac.signal.aborted;
        rec.err = timedOut ? 'timeout' : `network: ${String(e?.message ?? e).slice(0, 80)}`;
        cost.append(rec);
        o.onCall?.(rec);
        return { ok: false, why: timedOut ? 'timeout' : 'http', err: rec.err };
      } finally {
        clearTimeout(timer);
      }
    }
    return { ok: false, why: 'http', err: 'parameter retry failed' };
  }

  /** The shared flow: call, validate, one repair turn with the reason, else null (caller falls back). */
  async function run<T>(model: string, bot: Bot, kind: string, built: Built, ctx: Ctx, validate: (raw: string) => Promise<Verdict<T>>): Promise<T | null> {
    stats.calls++;
    if (!apiKey || !model) return null;
    if (isUnpaid(ctx.episode) || breakerOpen(model, ctx.episode)) return null;
    const deadline = Date.now() + deadlineMs;
    let messages: Msg[] = [
      { role: 'system', content: built.system },
      { role: 'user', content: built.user },
    ];
    for (let i = 0; i < 2; i++) {
      const a = await attempt(model, bot.id, i ? `${kind}:retry` : kind, messages, built, deadline, ctx.episode);
      if (!a.ok) {
        if (a.why === 'budget' || a.why === 'deadline' || a.why === 'payment') return null;
        noteResult(model, ctx.episode, false);
        log(`model brain: ${bot.id} ${kind} failed (${a.err})`);
        // a timeout already used the time; a fast error gets one plain retry
        if (a.why === 'timeout' || i === 1 || breakerOpen(model, ctx.episode)) return null;
        continue;
      }
      const v = await validate(a.text);
      if (v.ok) {
        noteResult(model, ctx.episode, true);
        stats.modelAnswers++;
        return v.value;
      }
      if (/JSON|missing|mark must|empty|not one of|use must|reply \{/i.test(v.reason)) noteResult(model, ctx.episode, false);
      log(`model brain: ${bot.id} ${kind} answer rejected (${v.reason}): ${a.text.slice(0, 120).replace(/\s+/g, ' ')}`);
      if (i === 1) return null;
      stats.repairs++;
      messages = [
        { role: 'system', content: built.system },
        { role: 'user', content: built.user },
        { role: 'assistant', content: a.text.slice(0, 600) },
        { role: 'user', content: repairTurn(v.reason, built.shape, built.maxWords) },
      ];
    }
    return null;
  }

  /** Clean, fit to the limit, refuse repeats, the content check, then the quality gate. */
  async function airable(raw: string, name: string, kind: string, maxWords: number, avoid: string[], g: GateCtx): Promise<Verdict<string>> {
    let line = cleanLine(raw, name);
    if (!line) return { ok: false, reason: 'the line was empty' };
    const fit = fitWords(line, maxWords);
    if (!fit) return { ok: false, reason: `it was ${countWords(line)} words; the limit is ${maxWords}` };
    line = fit;
    if (avoid.some((a) => norm(a) === norm(line))) return { ok: false, reason: 'it repeats a line already said' };
    let r: CheckResult;
    try {
      r = await (await check)(line, kind, maxWords);
    } catch {
      r = await localCheck(line, kind, maxWords);
    }
    if (!r.ok) return { ok: false, reason: r.reason || 'it failed the content check' };
    const out = (r.cleaned ?? line).trim();
    if (!out) return { ok: false, reason: 'the line was empty' };
    const bad = gateLine(out, g);
    if (bad) {
      const key = bad.replace(/\(.*\)|".*"/g, '').trim().slice(0, 40);
      stats.gate[key] = (stats.gate[key] ?? 0) + 1;
      return { ok: false, reason: bad };
    }
    return { ok: true, value: out };
  }

  async function safe<T>(f: () => Promise<T>, dflt: T, what: string): Promise<T> {
    stats.fallbacks++;
    try {
      return await f();
    } catch (e: any) {
      log(`model brain: fallback ${what} threw (${String(e?.message ?? e).slice(0, 80)})`);
      return dflt;
    }
  }

  // ---- candidates from the bank ---------------------------------------------------------

  async function speakCandidates(req: SpeakReq): Promise<Cand[]> {
    const out: Cand[] = [];
    const add = (c: { text: string; tags?: string[]; hook?: string }) => {
      const text = String(c?.text ?? '').trim();
      if (text && countWords(text) <= req.maxWords && !out.some((x) => norm(x.text) === norm(text))) {
        const cand: Cand = { text, tags: Array.isArray(c.tags) ? c.tags : [] };
        if (typeof c.hook === 'string' && c.hook) cand.hook = c.hook;
        out.push(cand);
      }
    };
    try {
      if (typeof src.candidates === 'function') {
        for (const c of src.candidates(req, nCands) ?? []) add(c);
        return out.slice(0, nCands);
      }
      for (let i = 0; i < nCands + 1 && out.length < nCands; i++) {
        const s = await o.fallback.speak(req);
        if (s && s.source !== 'fallback') add(s);
      }
    } catch (e: any) {
      log(`model brain: candidates failed (${String(e?.message ?? e).slice(0, 80)})`);
    }
    return out.slice(0, nCands);
  }

  /** Reaction lines from the star bank: card reactions first, then each mark. */
  function reactCandidates(req: ReactReq, knownHits: string[] | null): Cand[] {
    const type = req.ctx.type;
    const e = epFor(req.ctx.episode);
    const out: Cand[] = [];
    const earlier = [...req.ctx.room.filter((r) => r.who === req.star.id).map((r) => r.text), ...(e.said.get(req.star.id) ?? [])];
    const used = (t: string) => e.usedReact.has(norm(t)) || nearRepeat(t, earlier, names);
    const add = (c: Cand) => {
      if (c.text && countWords(c.text) <= req.maxWords && !out.some((x) => norm(x.text) === norm(c.text))) out.push(c);
    };
    const fresh = (xs: string[]) => {
      const f = xs.filter((t) => !used(t));
      const g = f.filter((t) => !saidBefore(req.star.id, t));
      return g.length ? g : f.length ? f : xs;
    };
    const bank = (() => {
      try { return src.banks?.star(req.star.id) ?? (loadBank(req.star) as StarBank | null); } catch { return null; }
    })();
    const v: Record<string, string> = { rival: req.to.name, target: req.to.name, star: req.star.name, name: req.star.name };
    const fill = (t: string) => t.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
    const usable = (t: unknown): t is string => typeof t === 'string' && !!t.trim() && !/\{\w+\}/.test(fill(t));
    const lines = (mark: Mark, hits: string[], n: number): string[] => {
      if (typeof src.reactCandidates === 'function') {
        try { return (src.reactCandidates(req, mark, hits, n + 2) ?? []).map(String); } catch { /* bank below */ }
      }
      if (!bank) return [];
      if (hits.length && type) {
        const db = type.cards[2].id;
        const key = hits.includes(db) ? db : hits[0];
        const cr = bank.cardReact?.[key];
        const t = cr ? (key === db ? cr.off : cr.on) : undefined;
        return usable(t) ? [fill(t)] : [];
      }
      const duo = req.ctx.alive.length <= 2 ? [...(bank.oneOnOne?.[req.to.id] ?? []), ...(bank.oneOnOne?.any ?? [])] : [];
      const own = (bank.react?.[req.to.id]?.[mark] ?? []) as string[];
      const any = (bank.react?.any?.[mark] ?? []) as string[];
      const pool = [...shuffled(own, `${req.ctx.episode}:${req.to.id}:${mark}`), ...any, ...duo].filter(usable).map(fill);
      return pool;
    };
    if (req.hint?.beat === 'duo') {
      // the one on one: her line is one of her prompts to this suitor, whatever the mark
      const prompts = typeof src.reactCandidates === 'function'
        ? (() => { try { return (src.reactCandidates!(req, 'charmed', [], 4) ?? []).map(String); } catch { return []; } })()
        : bank ? [...((bank.oneOnOne?.[req.to.id] ?? []) as string[]), ...((bank.oneOnOne?.any ?? []) as string[])].filter(usable).map(fill) : [];
      for (const t of prompts) add({ text: t, mark: 'any' });
      return out;
    }
    if (type) {
      const [up, hid, off] = type.cards;
      if (knownHits) {
        if (knownHits.length) {
          const m: Mark = knownHits.includes(off.id) ? 'cringing' : 'charmed';
          for (const t of lines(m, knownHits, 1).filter((x) => !used(x)).slice(0, 1)) add({ text: t, mark: m, card: knownHits.includes(off.id) ? off.id : knownHits[0] });
        }
      } else {
        for (const c of [up, hid, off]) {
          const m: Mark = c.id === off.id ? 'cringing' : 'charmed';
          for (const t of lines(m, [c.id], 1).filter((x) => !used(x)).slice(0, 1)) add({ text: t, mark: m, card: c.id, cond: `if it shows ${c.label}` });
        }
      }
    }
    for (const m of ['charmed', 'unsure', 'cringing'] as Mark[]) {
      for (const t of fresh(lines(m, [], 2)).slice(0, 2)) add({ text: t, mark: m });
    }
    return out;
  }

  /** Bookkeeping for a line about to be returned. */
  function said(episode: number, who: string, text: string, how: 'bank' | 'model' | 'fallback'): void {
    const e = epFor(episode);
    const xs = e.said.get(who) ?? [];
    xs.push(text);
    e.said.set(who, xs);
    if (how === 'model') {
      e.written.add(norm(text));
      const p = pastWritten.get(who) ?? [];
      p.push(text);
      pastWritten.set(who, p.slice(-30));
    }
    const ps = pastSaid.get(who) ?? new Set<string>();
    ps.add(norm(text));
    if (ps.size > 200) ps.delete(ps.values().next().value as string);
    pastSaid.set(who, ps);
    stats.aired[how]++;
  }

  function writtenTonight(episode: number, who: string): number {
    const e = epFor(episode);
    return (e.said.get(who) ?? []).filter((t) => e.written.has(norm(t))).length;
  }

  function gateCtx(kind: string, maxWords: number, who: string, ctx: Ctx, extra: Partial<GateCtx> = {}): GateCtx {
    const e = epFor(ctx.episode);
    const own = [...ctx.room.filter((r) => r.who === who).map((r) => r.text), ...(e.said.get(who) ?? [])];
    const past = (pastWritten.get(who) ?? []).filter((t) => !own.includes(t));
    return { kind, maxWords, who, names, room: ctx.room, own: [...new Set(own)], past, twistId: ctx.twist?.id, ...extra };
  }

  /** the scripted brain's line, as the whole answer (the account is out of credit) */
  async function scripted(req: SpeakReq, speaker: string): Promise<Spoken> {
    const r = await safe(() => o.fallback.speak(req), { text: 'Well.', source: 'fallback' } as Spoken, 'speak');
    stats.fallbacks--;
    said(req.ctx.episode, speaker, r.text, 'fallback');
    return { ...r, via: 'fallback' } as Spoken;
  }
  function finishScripted(req: ReactReq, r: Reacted): Reacted {
    const e = epFor(req.ctx.episode);
    e.usedReact.add(norm(r.text));
    stats.marks[r.mark]++;
    said(req.ctx.episode, req.star.id, r.text, 'fallback');
    return { ...r, via: 'fallback' } as Reacted;
  }

  /**
   * A booth read (confession flavour guess or fear): the suitor chooses one of its read lines and names
   * the card it thinks the star's reaction was about. The card is the bot's own guess: it goes into
   * EvConfession.guess. Null when the model gives nothing usable (the caller falls back).
   */
  async function read(req: SpeakReq): Promise<Spoken | null> {
    try {
      const up = req.ctx.faceUp?.id;
      const options = o.decks.cards.filter((c) => c.id !== up).map((c) => ({ id: c.id, noun: c.noun ?? c.label.toLowerCase() }));
      const tokenReq: SpeakReq = { ...req, hint: { ...(req.hint ?? {}), card: { id: '', label: READ_TOKEN, noun: READ_TOKEN } } };
      const cands = (await speakCandidates(tokenReq)).filter((c) => c.text.includes(READ_TOKEN));
      if (!cands.length) return null;
      const built = buildRead(tokenReq, cands, options);
      const out = await run(req.who.model, req.who, 'read', built, req.ctx, async (raw): Promise<Verdict<{ cand: Cand; card: string }>> => {
        const obj = extractJson(raw);
        if (!obj) return { ok: false, reason: 'it was not a JSON object' };
        const u = Number(obj.use);
        if (!Number.isInteger(u) || u < 1 || u > cands.length) return { ok: false, reason: `use must be a number from 1 to ${cands.length}` };
        const id = String(obj.card ?? '').trim().toLowerCase();
        const card = options.find((c) => c.id === id) ?? options.find((c) => c.noun.toLowerCase() === id);
        if (!card) return { ok: false, reason: 'card must be one of the ids listed' };
        return { ok: true, value: { cand: cands[u - 1]!, card: card.id } };
      });
      if (!out) return null;
      const noun = options.find((c) => c.id === out.card)!.noun;
      const text = out.cand.text.split(READ_TOKEN).join(noun);
      if (countWords(text) > req.maxWords) return null;
      said(req.ctx.episode, req.who.id, text, 'bank');
      return { text, source: 'bank', tags: out.cand.tags ?? [], guess: out.card, via: 'chosen' } as Spoken;
    } catch (e: any) {
      log(`model brain: read error (${String(e?.message ?? e).slice(0, 80)})`);
      return null;
    }
  }

  const brain = {
    kind: 'model' as const,

    async speak(req: SpeakReq): Promise<Spoken> {
      const ep0 = req.ctx.episode;
      const speaker = req.kind === 'caller' ? 'ex' : req.who.id;
      if (isUnpaid(ep0)) return scripted(req, speaker);
      const flavour = req.kind === 'confession' ? String(req.hint?.flavour ?? '') : '';
      if (flavour === 'guess' || flavour === 'fear') {
        // the model names its own card; if it cannot, the scripted read (its card) airs
        return (await read(req)) ?? scripted(req, speaker);
      }
      let cands: Cand[] = [];
      try {
        cands = await speakCandidates(req);
        const earlier = [...req.ctx.room.filter((r) => r.who === speaker).map((r) => r.text), ...(epFor(ep0).said.get(speaker) ?? [])];
        const absent = absentRe(req.ctx);
        for (const keep of [
          (c: Cand) => !(absent && absent.test(c.text)),
          (c: Cand) => !nearRepeat(c.text, earlier, names),
          (c: Cand) => !saidBefore(speaker, c.text),
        ]) {
          const f = cands.filter(keep);
          if (f.length) cands = f;
        }
        if (mode !== 'free' && cands.length === 1 && SINGLE_KINDS.has(req.kind)) {
          said(ep0, speaker, cands[0].text, 'bank');
          return { text: cands[0].text, source: 'bank', tags: cands[0].tags ?? [] };
        }
        const capped = writtenTonight(ep0, speaker) >= WRITE_CAP;
        const how: WriteMode = mode === 'hybrid' && (CHOOSE_ONLY.has(req.kind) || capped) && cands.length ? 'bank' : mode;
        const built = buildSpeak(req, cands, how);
        const model = req.who.model || req.ctx.star.model;
        const avoid = [...req.ctx.recent, ...req.ctx.room.filter((r) => r.who === speaker).map((r) => r.text)];
        const name = req.kind === 'caller' ? '' : req.who.name;
        const mustName = (req.kind === 'cutline' || req.kind === 'pickline') && req.target
          ? [...req.ctx.room.filter((r) => r.who === req.target!.id && r.kind !== 'confession').map((r) => r.text), String(req.hint?.line ?? '')].filter(Boolean)
          : undefined;
        // the line this one answers may not be in the room yet (the exit is made before the cut airs)
        const reason = typeof req.hint?.reason === 'string' ? req.hint.reason : '';
        const room = reason && !req.ctx.room.some((r) => r.text === reason)
          ? [...req.ctx.room, { who: req.ctx.star.id, name: req.ctx.star.name, kind: 'cut' as const, text: reason, to: req.who.id }]
          : req.ctx.room;
        const g = gateCtx(req.kind, req.maxWords, speaker, req.ctx, { mustName, room });
        const out = await run(model, req.who, req.kind, built, req.ctx, async (raw): Promise<Verdict<Cand & { how: 'bank' | 'model' }>> => {
          const c = parseChoice(raw, cands.length, how);
          if (typeof c === 'string') return { ok: false, reason: c };
          if ('use' in c) return { ok: true, value: { ...cands[c.use - 1], how: 'bank' } };
          const same = cands.find((x) => norm(x.text) === norm(cleanLine(c.line, name)));
          if (same) return { ok: true, value: { ...same, how: 'bank' } };
          const v = await airable(c.line, name, req.kind, req.maxWords, avoid, g);
          if (v.ok && req.kind === 'pickline' && req.target && !nameLast(v.value, req.target.name)) return { ok: false, reason: `say ${req.target.name} last` };
          return v.ok ? { ok: true, value: { text: v.value, how: 'model' } } : v;
        });
        if (!out && isUnpaid(ep0)) return scripted(req, speaker);
        if (out) {
          said(ep0, speaker, out.text, out.how);
          if (out.how === 'bank') {
            const r: Spoken = { text: out.text, source: 'bank', tags: out.tags ?? [] };
            if (out.hook) r.hook = out.hook;
            return r;
          }
          return { text: out.text, source: 'model' };
        }
      } catch (e: any) {
        log(`model brain: speak error (${String(e?.message ?? e).slice(0, 80)})`);
      }
      if (cands.length) {
        stats.fallbacks++;
        said(ep0, speaker, cands[0].text, 'fallback');
        return { text: cands[0].text, source: 'fallback', tags: cands[0].tags ?? [] };
      }
      const fb = await safe(() => o.fallback.speak(req), { text: 'Well.', source: 'fallback' } as Spoken, 'speak');
      said(ep0, speaker, fb.text, 'fallback');
      return { ...fb, source: 'fallback' };
    },

    async react(req: ReactReq): Promise<Reacted> {
      const ctx = req.ctx;
      const e = epFor(ctx.episode);
      if (isUnpaid(ctx.episode)) {
        const r = await safe(() => o.fallback.react(req), { mark: 'unsure', text: 'Hm.', hits: [], source: 'fallback' } as Reacted, 'react');
        stats.fallbacks--;
        return finishScripted(req, r);
      }
      const type = ctx.type;
      const snap = req.hint?.beat === 'snap';
      const duo = req.hint?.beat === 'duo';
      // a walk-on snap is judged only against the face-up card
      const cards = type ? (snap ? [type.cards[0]] : type.cards).map((c) => ({ id: c.id, label: c.label })) : [];
      const pair = duo ? null : (() => { try { return src.replyPair?.(req) ?? null; } catch { return null; } })();
      // a bank line's authored tags are its hits; a line the model wrote is judged by the star
      const written = e.written.has(norm(req.line));
      let knownHits: string[] | null = written ? null : (req.tags ?? []).filter((t) => cards.some((c) => c.id === t));
      if (!type) knownHits = [];
      const measure = (hits: string[]) => {
        if (!cards.some((c) => c.id === 'brevity')) return hits;
        const h = hits.filter((x) => x !== 'brevity');
        if (countWords(req.line) <= 8) h.push('brevity');
        return h;
      };
      let cands: Cand[] = [];
      const finish = (mark: Mark, hits: string[], text: string, source: Reacted['source'], paired = false): Reacted => {
        e.usedReact.add(norm(text));
        stats.marks[mark]++;
        said(ctx.episode, req.star.id, text, source);
        if (paired || (pair && (text === pair.warm || text === pair.cold))) src.markUsed?.(text, ctx.episode);
        const r: Reacted = { mark, hits, text, source };
        if (pair && text === (mark === 'charmed' ? pair.warm : pair.cold)) r.paired = true;
        return r;
      };
      /** the paired reply for a mark: warm for charmed, cold for unsure and cringing */
      const pairFor = (mark: Mark) => (pair ? (mark === 'charmed' ? pair.warm : pair.cold) : null);
      /** the hook rule: a written reaction answers the line (its hook, or one of its words) */
      const answers = (text: string) => {
        if (req.hook && text.toLowerCase().includes(req.hook.toLowerCase())) return true;
        const theirs = contentWords(req.line, names);
        return [...contentWords(text, names)].some((w) => theirs.has(w));
      };
      /** the first candidate that fits the final mark, card lines first when a card was hit */
      const fresh = (c: Cand) => !e.usedReact.has(norm(c.text));
      const bestFor = (mark: Mark, hits: string[]): Cand | undefined =>
        cands.find((c) => c.card && hits.includes(c.card) && c.mark === mark && fresh(c)) ??
        cands.find((c) => !c.card && (c.mark === mark || c.mark === 'any') && fresh(c)) ??
        cands.find((c) => !c.card && (c.mark === mark || c.mark === 'any'));
      try {
        cands = reactCandidates(req, knownHits);
        if (pair) {
          // the paired replies answer this exact line: they go first
          const pc: Cand[] = [{ text: pair.warm, mark: 'charmed', paired: 'warm' }, { text: pair.cold, mark: 'cringing', paired: 'cold' }];
          cands = [...pc, ...cands.filter((c) => c.text !== pair.warm && c.text !== pair.cold)].slice(0, Math.max(4, nCands + 2));
        }
        const capped = duo && cands.length ? 'bank' : mode === 'hybrid' && writtenTonight(ctx.episode, req.star.id) >= WRITE_CAP && cands.length ? 'bank' : mode;
        const built = buildReact(req, cands, { knownHits }, capped);
        const avoid = ctx.room.filter((r) => r.who === req.star.id).map((r) => r.text);
        const g = gateCtx('reaction', req.maxWords, req.star.id, ctx);
        const out = await run(req.star.model, req.star, 'react', built, ctx, async (raw): Promise<Verdict<{ mark: Mark; hits: string[]; cand?: Cand; line?: string }>> => {
          const p = parseReactChoice(raw, cards.length ? cards : allCards, cands.length, capped);
          if (typeof p === 'string') return { ok: false, reason: p };
          if ('use' in p) return { ok: true, value: { mark: p.mark, hits: p.hits, cand: cands[p.use - 1] } };
          const same = cands.find((x) => norm(x.text) === norm(cleanLine(p.line, req.star.name)));
          if (same) return { ok: true, value: { mark: p.mark, hits: p.hits, cand: same } };
          const v = await airable(p.line, req.star.name, 'reaction', req.maxWords, avoid, g);
          if (v.ok && !answers(v.value)) {
            // the hook rule: a reaction that does not answer the line gives way to the paired reply
            const pr = pairFor(p.mark);
            if (pr) return { ok: true, value: { mark: p.mark, hits: p.hits, cand: cands.find((c) => c.text === pr) ?? { text: pr, mark: p.mark } } };
            return { ok: false, reason: `it did not answer what they said; use ${req.hook ? `"${req.hook}" or ` : ''}a word from their line` };
          }
          return v.ok ? { ok: true, value: { mark: p.mark, hits: p.hits, line: v.value } } : v;
        });
        if (!out && isUnpaid(ctx.episode)) return finishScripted(req, await safe(() => o.fallback.react(req), { mark: 'unsure', text: 'Hm.', hits: [], source: 'fallback' } as Reacted, 'react'));
        if (out) {
          let hits = knownHits ?? out.hits.filter((h) => cards.some((c) => c.id === h));
          // choosing a card line is a judgment that the line showed that card
          if (!knownHits && out.cand?.card && !hits.includes(out.cand.card)) hits.push(out.cand.card);
          hits = measure(hits);
          const mark = coherentMark(out.mark, hits, type);
          if (mark !== out.mark) stats.coerced++;
          if (out.line) return finish(mark, hits, out.line, 'model');
          let c = out.cand!;
          const fits = c.paired ? (c.paired === 'warm') === (mark === 'charmed') : (c.mark === mark || c.mark === 'any') && (!c.card || hits.includes(c.card));
          if (!fits) {
            const pr = pairFor(mark);
            const b = pr ? { text: pr, mark } : bestFor(mark, hits);
            if (b) {
              c = b;
              stats.coerced++;
            }
          }
          return finish(mark, hits, c.text, 'bank');
        }
      } catch (err: any) {
        log(`model brain: react error (${String(err?.message ?? err).slice(0, 80)})`);
      }
      // the model gave nothing usable: the scripted judgment and line
      const fb = await safe(() => o.fallback.react(req), { mark: 'unsure', text: 'Hm.', hits: [], source: 'fallback' } as Reacted, 'react');
      // the scripted judgment, but never a reaction the star already used tonight
      const again = e.usedReact.has(norm(fb.text)) ? bestFor(fb.mark, fb.hits) : undefined;
      return finish(fb.mark, fb.hits, again && !e.usedReact.has(norm(again.text)) ? again.text : fb.text, 'fallback');
    },

    async choose(req: { star: Bot; among: Bot[]; purpose: 'cut' | 'pick'; ctx: Ctx }): Promise<string> {
      try {
        if (req.among.length === 1) return req.among[0].id;
        if (isUnpaid(req.ctx.episode)) throw new Error('unpaid');
        const built = buildChoose(req);
        const id = await run(req.star.model, req.star, `choose-${req.purpose}`, built, req.ctx, async (raw) => {
          const v = parseChoose(raw, req.among);
          return v ? { ok: true, value: v } : { ok: false, reason: `the id was not one of ${req.among.map((b) => b.id).join(', ')}` };
        });
        if (id) return id;
      } catch (e: any) {
        log(`model brain: choose error (${String(e?.message ?? e).slice(0, 80)})`);
      }
      const dflt = req.among[0]?.id ?? '';
      const got = await safe(() => o.fallback.choose(req), dflt, 'choose');
      return req.among.some((b) => b.id === got) ? got : dflt;
    },

    stats(): ModelBrainStats {
      return {
        calls: stats.calls, modelAnswers: stats.modelAnswers, fallbacks: stats.fallbacks, repairs: stats.repairs,
        spentUsd: cost.spent, totalUsd: cost.current(), budgetUsd: budget, mode,
        aired: { ...stats.aired }, marks: { ...stats.marks }, coerced: stats.coerced, gate: { ...stats.gate },
      };
    },
  };
  return brain;
}

/** a pick line names the winner last (FORMAT2): the name, then only punctuation */
export function nameLast(text: string, name: string): boolean {
  const t = text.trim().replace(/[\s.!?,"')\]]+$/, '').toLowerCase();
  const first = name.toLowerCase().split(/\s+/)[0] ?? '';
  return t.endsWith(name.toLowerCase()) || (!!first && t.endsWith(first));
}
