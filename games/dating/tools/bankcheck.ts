// Validates every persona and bank file against show/types.ts and show/FORMAT2.md (version 2).
//   node tools/bankcheck.ts [--dir show] [--quiet] [--strict]
// Errors (exit 1): wrong shape or missing keys, unknown card/twist/question/suitor/star ids, lines
// over the word limit for their category, em dashes, emoji, banned content, duplicate lines, slots
// that are unknown or used where they cannot be filled, and a `hook` that is not two to five words
// copied exactly from its line. Warnings: coverage gaps the brain will fall back on, and the v2
// counts from FORMAT2.md while the writers are mid-upgrade (--strict makes those errors): hooks on
// every reactable line, reads, comebacks, steals, closers per prompt, the star's v2 lines, intros
// that name {card}, reveal lines with {name}, a closer per one-on-one prompt.
// Reply files (show/bank/replies/<star>/<suitor>.json): per pair, keys that match no current suitor
// line ("stale") and suitor lines with no reply ("missing"). Last, the signature-card table: each
// suitor's top five tags against FORMAT2.md, each on at least 15% of their scored lines.

import fs from 'node:fs';
import path from 'node:path';
import type { Bot, Decks, L, StarBank, SuitorBank } from '../show/types.ts';
import { loadDecks, ROOT, SHOW } from '../show/paths.ts';
import { STAR_IDS, SUITOR_IDS } from '../show/roster.ts';
import { check, rawProblems } from '../show/content.ts';
import { words } from '../show/timing.ts';
import { args } from './common.ts';
import { bankAffinity, topTags, TOP_TAGS } from '../show/draw.ts';

const a = args();
const base = path.resolve(ROOT, a.dir ?? SHOW);
const decks: Decks = loadDecks();
const CARD = new Set(decks.cards.map((c) => c.id));
const TWIST = new Map(decks.twists.map((t) => [t.id, t]));
const QUESTION = new Set(decks.questions.map((q) => q.id));
const SUITORS = new Set<string>(SUITOR_IDS);
const STARS = new Set<string>(STAR_IDS);
const SOLO_TWISTS = decks.twists.filter((t) => t.format === 'solo' || t.format === 'caller').map((t) => t.id);
const STRICT = !!a.strict;
/** FORMAT2.md "Signature cards" */
const SIGNATURE: Record<string, string[]> = {
  dash: ['confidence', 'bragging', 'numbers', 'flattery', 'plans'],
  tilly: ['sorry', 'rules', 'curiosity', 'selfdeprecation', 'flattery'],
  quill: ['poetry', 'bigwords', 'drama', 'gestures', 'past'],
  prince: ['money', 'gestures', 'petnames', 'mystery', 'flattery'],
  nav: ['plans', 'rules', 'brevity', 'confidence', 'danger'],
  crumb: ['honesty', 'food', 'brevity', 'puns', 'past'],
  vex: ['mystery', 'past', 'curiosity', 'danger', 'honesty'],
  brock: ['confidence', 'food', 'numbers', 'vulnerability', 'bragging'],
};
/** a v2 count: a warning while the writers upgrade, an error with --strict */
const v2 = (r: Report, msg: string) => (STRICT ? r.errors : r.warnings).push(`v2: ${msg}`);

interface Report {
  file: string;
  errors: string[];
  warnings: string[];
  lines: number;
}
const reports: Report[] = [];

function rep(file: string): Report {
  const r = { file: path.relative(ROOT, file), errors: [], warnings: [], lines: 0 };
  reports.push(r);
  return r;
}

function readFile(file: string, r: Report): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    r.errors.push(`cannot parse: ${(e as Error).message}`);
    return null;
  }
}

/** slots allowed per category; `need` = slots each line must contain */
type HookCount = { total: number; missing: number };
type LineOpts = { slots?: string[]; need?: string[]; tags?: boolean; seen: Set<string>; hook?: HookCount; nameLast?: boolean };
function lineCheck(r: Report, where: string, raw: unknown, max: number, o: LineOpts) {
  const l: L | null = typeof raw === 'string' ? { t: raw } : raw && typeof (raw as L).t === 'string' ? (raw as L) : null;
  if (!l) {
    r.errors.push(`${where}: not a line (want ${o.tags ? '{ t, tags? }' : 'a string'})`);
    return;
  }
  r.lines++;
  const t = l.t;
  for (const p of rawProblems(t)) r.errors.push(`${where}: ${p}: "${t}"`);
  const slots = [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
  for (const s of slots) if (!(o.slots ?? []).includes(s) && s !== 'star') r.errors.push(`${where}: slot {${s}} not allowed here: "${t}"`);
  for (const s of o.need ?? []) if (!slots.includes(s)) r.warnings.push(`${where}: expected {${s}}: "${t}"`);
  if (/[{}]/.test(t.replace(/\{\w+\}/g, ''))) r.errors.push(`${where}: stray brace: "${t}"`);
  // fill slots with plausible values before the word count and the content check
  const filled = t.replace(/\{(\w+)\}/g, (_m, k: string) => (k === 'card' ? 'Talks about money' : /played|wins|losses/.test(k) ? '7' : k === 'hook' ? 'my nan cheered' : 'Brock'));
  if (o.nameLast && !/\{name\}[\s.!?"')]*$/.test(t)) r.errors.push(`${where}: the name must come last: "${t}"`);
  const n = words(filled);
  if (n > max) r.errors.push(`${where}: ${n} words > ${max}: "${t}"`);
  const c = check(filled, { maxWords: 999 });
  if (!c.ok) r.errors.push(`${where}: ${c.reason}: "${t}"`);
  if (o.seen.has(t)) r.errors.push(`${where}: duplicate line: "${t}"`);
  o.seen.add(t);
  if (l.hook !== undefined) {
    const h = typeof l.hook === 'string' ? l.hook : '';
    const hw = words(h);
    if (!h || hw < 2 || hw > 5 || !t.includes(h)) r.errors.push(`${where}: hook must be 2 to 5 words copied exactly from the line: "${l.hook}" in "${t}"`);
    if (/[{}]/.test(h)) r.errors.push(`${where}: hook contains a slot: "${h}"`);
  } else if (o.hook) o.hook.missing++;
  if (o.hook) o.hook.total++;
  if (o.tags) {
    if (l.tags !== undefined && !Array.isArray(l.tags)) r.errors.push(`${where}: tags must be an array`);
    for (const tag of l.tags ?? []) if (!CARD.has(tag)) r.errors.push(`${where}: unknown card id in tags: ${tag}`);
    if ((l.tags ?? []).length > 3) r.warnings.push(`${where}: more than 3 tags`);
    if (new Set(l.tags ?? []).size !== (l.tags ?? []).length) r.errors.push(`${where}: duplicate tag`);
  } else if (l.tags) r.warnings.push(`${where}: tags are ignored here`);
}

function list(r: Report, where: string, xs: unknown, max: number, o: LineOpts & { min?: number; v2?: boolean }) {
  if (!Array.isArray(xs)) {
    if (o.v2) v2(r, `${where}: missing (want ${o.min ?? 1})`);
    else r.errors.push(`${where}: missing or not an array`);
    return;
  }
  if (xs.length < (o.min ?? 1)) (o.v2 ? v2(r, `${where}: ${xs.length} line(s), want ${o.min ?? 1}`) : r.warnings.push(`${where}: ${xs.length} line(s), want ${o.min ?? 1}+`));
  xs.forEach((x, i) => lineCheck(r, `${where}[${i}]`, x, max, o));
}

function record(r: Report, where: string, x: unknown): x is Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x)) {
    r.errors.push(`${where}: missing or not an object`);
    return false;
  }
  return true;
}

const REC = ['played', 'wins', 'losses'];

function checkSuitor(file: string) {
  const r = rep(file);
  const b = readFile(file, r) as SuitorBank | null;
  if (!b) return;
  const id = path.basename(file, '.json');
  if (b.id !== id) r.errors.push(`id "${b.id}" does not match file name`);
  if (!SUITORS.has(id)) r.warnings.push(`"${id}" is not a house suitor id`);
  const seen = new Set<string>();
  const others = [...SUITORS].filter((s) => s !== id);
  const hook: HookCount = { total: 0, missing: 0 };
  list(r, 'openers', b.openers, 12, { slots: REC, tags: true, seen, min: 4 });
  const recUse = (b.openers ?? []).filter((l) => /\{(played|wins|losses)\}/.test(l?.t ?? '')).length;
  if (recUse > 2) r.errors.push(`openers: ${recUse} lines use record slots (two at most)`);
  if (record(r, 'answers', b.answers)) {
    for (const k of Object.keys(b.answers)) if (!QUESTION.has(k) && k !== 'any') r.errors.push(`answers: unknown question id ${k}`);
    for (const q of QUESTION) {
      if (!b.answers[q]) r.warnings.push(`answers: no answer for ${q}`);
      else list(r, `answers.${q}`, b.answers[q], 20, { tags: true, seen, min: 2, hook });
    }
  }
  if (record(r, 'confessions', b.confessions)) {
    const c = b.confessions;
    list(r, 'confessions.star', c.star, 18, { tags: true, seen });
    list(r, 'confessions.rival', c.rival, 18, { tags: true, seen, slots: ['rival'], need: ['rival'] });
    list(r, 'confessions.afterCringe', c.afterCringe, 18, { tags: true, seen });
    list(r, 'confessions.afterCharm', c.afterCharm, 18, { tags: true, seen });
    list(r, 'confessions.final', c.final, 18, { tags: true, seen, slots: ['rival'], need: ['rival'] });
  }
  if (record(r, 'twists', b.twists)) {
    for (const k of Object.keys(b.twists)) if (!TWIST.has(k)) r.errors.push(`twists: unknown twist id ${k}`);
    for (const tid of SOLO_TWISTS) {
      if (!b.twists[tid]) r.warnings.push(`twists: no lines for ${tid}`);
      else list(r, `twists.${tid}`, b.twists[tid], TWIST.get(tid)!.maxWords, { tags: true, seen, hook: TWIST.get(tid)!.maxWords > 4 ? hook : undefined });
    }
    for (const [k, v] of Object.entries(b.twists)) if (!SOLO_TWISTS.includes(k) && TWIST.has(k)) list(r, `twists.${k}`, v, TWIST.get(k)!.maxWords, { tags: true, seen, hook });
  }
  for (const key of ['roast', 'wingman'] as const) {
    const m = b[key];
    if (!record(r, key, m)) continue;
    for (const k of Object.keys(m)) if (!SUITORS.has(k) || k === id) r.errors.push(`${key}: bad target id ${k}`);
    for (const o of others) {
      if (!m[o]) r.warnings.push(`${key}: no line for ${o}`);
      else lineCheck(r, `${key}.${o}`, m[o], 20, { tags: true, seen, hook });
    }
  }
  if (record(r, 'jabs', b.jabs)) {
    for (const k of Object.keys(b.jabs)) if ((!SUITORS.has(k) || k === id) && k !== 'any') r.errors.push(`jabs: bad target id ${k}`);
    if (!b.jabs.any) r.warnings.push('jabs: no "any" lines');
    for (const [k, v] of Object.entries(b.jabs)) list(r, `jabs.${k}`, v, 10, { tags: true, seen, slots: k === 'any' ? ['rival'] : [] });
    for (const o of others) if (!b.jabs[o]) r.warnings.push(`jabs: no line for ${o}`);
  }
  if (record(r, 'oneOnOne', b.oneOnOne)) {
    const oo = b.oneOnOne;
    if (record(r, 'oneOnOne.open', oo.open)) {
      for (const k of Object.keys(oo.open)) if (!STARS.has(k) && k !== 'any') r.errors.push(`oneOnOne.open: unknown star id ${k}`);
      if (!oo.open.any) r.warnings.push('oneOnOne.open: no "any" lines');
      for (const [k, v] of Object.entries(oo.open)) list(r, `oneOnOne.open.${k}`, v, 20, { tags: true, seen, slots: ['star'], hook });
    }
    list(r, 'oneOnOne.closeWarm', oo.closeWarm, 20, { tags: true, seen, slots: ['star'] });
    list(r, 'oneOnOne.closeCold', oo.closeCold, 20, { tags: true, seen, slots: ['star'] });
    // v2: steals and the closers that answer each of that star's prompts
    list(r, 'oneOnOne.steal', oo.steal, 20, { tags: true, seen, slots: ['rival', 'star'], need: ['rival'], min: 3, v2: true, hook });
    const close = (oo as { close?: Record<string, { warm: unknown; cold: unknown }[]> }).close;
    for (const st of STARS) {
      const prompts = starBanks.get(st)?.oneOnOne?.[id];
      const want = Array.isArray(prompts) ? prompts.length : 2;
      const got = close?.[st];
      if (!Array.isArray(got)) {
        v2(r, `oneOnOne.close.${st}: missing (want ${want} warm and cold closers, one per prompt in ${st}'s oneOnOne.${id})`);
        continue;
      }
      if (got.length !== want) v2(r, `oneOnOne.close.${st}: ${got.length} entries, ${st} has ${want} prompts for ${id}`);
      got.forEach((pair, i) => {
        if (!pair || typeof pair !== 'object') return r.errors.push(`oneOnOne.close.${st}[${i}]: want { warm, cold }`);
        lineCheck(r, `oneOnOne.close.${st}[${i}].warm`, pair.warm, 20, { tags: true, seen, slots: ['star'] });
        lineCheck(r, `oneOnOne.close.${st}[${i}].cold`, pair.cold, 20, { tags: true, seen, slots: ['star'] });
      });
    }
    if (close) for (const k of Object.keys(close)) if (!STARS.has(k)) r.errors.push(`oneOnOne.close: unknown star id ${k}`);
  }
  // v2: reads of the star, comebacks
  if (b.confessions) {
    list(r, 'confessions.guess', b.confessions.guess, 18, { tags: true, seen, slots: ['card', 'star'], need: ['card'], min: 6, v2: true });
    list(r, 'confessions.fear', b.confessions.fear, 18, { tags: true, seen, slots: ['card', 'star'], need: ['card'], min: 4, v2: true });
  }
  list(r, 'comeback', b.comeback, 10, { tags: true, seen, slots: ['rival', 'star'], min: 4, v2: true });
  if (hook.missing) v2(r, `hooks: ${hook.missing} of ${hook.total} answers, twists, roasts, wingman lines, one-on-one openers and steals have no hook`);
  suitorBanks.set(id, b);
  list(r, 'exit', b.exit, 16, { tags: true, seen, min: 2 });
  list(r, 'win', b.win, 16, { tags: true, seen, slots: ['rival', 'star', ...REC], min: 2 });
  list(r, 'lose', b.lose, 16, { tags: true, seen, slots: ['rival', 'star'], min: 2 });
}

function checkStar(file: string) {
  const r = rep(file);
  const b = readFile(file, r) as StarBank | null;
  if (!b) return;
  const id = path.basename(file, '.json');
  if (b.id !== id) r.errors.push(`id "${b.id}" does not match file name`);
  if (!STARS.has(id)) r.warnings.push(`"${id}" is not a house star id`);
  const seen = new Set<string>();
  list(r, 'intro', b.intro, 14, { tags: true, seen, min: 2, slots: ['card'] });
  const noCard = (b.intro ?? []).filter((l) => !String((l as { t?: string })?.t ?? l).includes('{card}')).length;
  if (noCard) v2(r, `intro: ${noCard} line(s) do not name the face-up card with {card}`);
  if (record(r, 'questions', b.questions)) {
    for (const k of Object.keys(b.questions)) if (!QUESTION.has(k)) r.errors.push(`questions: unknown question id ${k}`);
    for (const q of QUESTION) {
      if (b.questions[q] === undefined) r.warnings.push(`questions: none for ${q}`);
      else lineCheck(r, `questions.${q}`, b.questions[q], 18, { seen });
    }
  }
  if (record(r, 'react', b.react)) {
    for (const k of Object.keys(b.react)) if (!SUITORS.has(k) && k !== 'any') r.errors.push(`react: unknown suitor id ${k}`);
    for (const s of SUITORS) if (!b.react[s]) r.warnings.push(`react: none for ${s}`);
    for (const [k, v] of Object.entries(b.react)) {
      if (!record(r, `react.${k}`, v)) continue;
      for (const m of ['charmed', 'unsure', 'cringing'] as const) list(r, `react.${k}.${m}`, v[m], 10, { seen, slots: ['rival'] });
      for (const m of Object.keys(v)) if (!['charmed', 'unsure', 'cringing'].includes(m)) r.errors.push(`react.${k}: unknown mark ${m}`);
    }
  }
  if (record(r, 'cardReact', b.cardReact)) {
    for (const k of Object.keys(b.cardReact)) if (!CARD.has(k)) r.errors.push(`cardReact: unknown card id ${k}`);
    for (const c of CARD) {
      const v = b.cardReact[c];
      if (!v) {
        r.warnings.push(`cardReact: none for ${c}`);
        continue;
      }
      lineCheck(r, `cardReact.${c}.on`, v.on, 10, { seen, slots: ['rival'] });
      lineCheck(r, `cardReact.${c}.off`, v.off, 10, { seen, slots: ['rival'] });
    }
  }
  for (const key of ['cut', 'oneOnOne', 'pick'] as const) {
    const m = b[key];
    const max = key === 'pick' ? 16 : 14;
    if (!record(r, key, m)) continue;
    for (const k of Object.keys(m)) if (!SUITORS.has(k) && k !== 'any') r.errors.push(`${key}: unknown suitor id ${k}`);
    for (const s of SUITORS) if (!m[s]) r.warnings.push(`${key}: none for ${s}`);
    for (const [k, v] of Object.entries(m)) list(r, `${key}.${k}`, v, max, { seen, slots: ['rival'] });
  }
  // v2: the star's new lines (FORMAT2 "What the bank needs")
  const B = b as StarBank;
  list(r, 'bottom', B.bottom, 12, { seen, slots: ['a', 'b'], need: ['a', 'b'], min: 4, v2: true });
  list(r, 'cutFrames', B.cutFrames, 14, { seen, slots: ['name', 'hook'], need: ['hook'], min: 6, v2: true });
  list(r, 'compare', B.compare, 12, { seen, slots: ['a', 'b'], need: ['a', 'b'], min: 4, v2: true });
  list(r, 'pickFrames', B.pickFrames, 16, { seen, slots: ['name', 'hook'], need: ['hook'], min: 6, v2: true, nameLast: true });
  const keyed = (key: 'cardHint' | 'holdCard' | 'verdict', ids: Set<string> | Map<string, unknown>, max: number, slots: string[], want: number) => {
    const m = B[key] as Record<string, string> | undefined;
    if (!m || typeof m !== 'object') return v2(r, `${key}: missing (want ${want})`);
    for (const k of Object.keys(m)) if (!ids.has(k)) r.errors.push(`${key}: unknown id ${k}`);
    const n = [...ids.keys()].filter((k) => typeof m[k] === 'string').length;
    if (n < want) v2(r, `${key}: ${n} of ${want}`);
    for (const [k, v] of Object.entries(m)) lineCheck(r, `${key}.${k}`, v, max, { seen, slots });
  };
  keyed('cardHint', CARD, 14, ['name'], CARD.size);
  keyed('holdCard', CARD, 14, [], CARD.size);
  keyed('verdict', TWIST, 12, ['name'], TWIST.size);
  if (record(r, 'twistIntro', b.twistIntro)) {
    for (const k of Object.keys(b.twistIntro)) if (!TWIST.has(k)) r.errors.push(`twistIntro: unknown twist id ${k}`);
    for (const t of TWIST.keys()) {
      if (b.twistIntro[t] === undefined) r.warnings.push(`twistIntro: none for ${t}`);
      else lineCheck(r, `twistIntro.${t}`, b.twistIntro[t], 18, { seen });
    }
  }
  if (record(r, 'ex', b.ex)) {
    if (typeof b.ex.name !== 'string' || !b.ex.name.trim()) r.errors.push('ex.name: missing');
    list(r, 'ex.lines', b.ex.lines, 20, { seen, min: 2 });
  }
  list(r, 'hold', b.hold, 12, { seen, min: 2 });
  if (record(r, 'reveal', b.reveal)) {
    for (const k of ['on', 'off', 'none'] as const) list(r, `reveal.${k}`, b.reveal[k], 16, { seen, slots: k === 'none' ? ['card'] : ['card', 'name'], min: 2 });
    for (const k of ['on', 'off'] as const) {
      const n = (b.reveal[k] ?? []).filter((t) => typeof t === 'string' && t.includes('{name}')).length;
      if (!n) v2(r, `reveal.${k}: no line takes {name} (the reveal names who hit the card)`);
    }
  }
  list(r, 'outro', b.outro, 12, { seen, min: 2 });
  // optional: the star's private aside, aired in booth two when the finalists' confessions run short
  // (v2 keeps the star out of the booth: `asides` are no longer aired)
}

function checkPersona(file: string) {
  const r = rep(file);
  const b = readFile(file, r) as Bot | null;
  if (!b) return;
  const id = path.basename(file, '.json');
  if (b.id !== id) r.errors.push(`id "${b.id}" does not match file name`);
  if (b.role !== 'star' && b.role !== 'suitor') r.errors.push(`role must be star or suitor`);
  if (b.role === 'star' && !STARS.has(id)) r.warnings.push(`"${id}" is not a house star id`);
  if (b.role === 'suitor' && !SUITORS.has(id)) r.warnings.push(`"${id}" is not a house suitor id`);
  for (const k of ['name', 'tagline', 'model', 'instructions'] as const) if (typeof b[k] !== 'string' || !b[k]) r.errors.push(`${k}: missing`);
  if (typeof b.tagline === 'string' && words(b.tagline) > 6) r.errors.push(`tagline: ${words(b.tagline)} words > 6`);
  if (!['he', 'she', 'they', 'it'].includes(b.pronouns)) r.errors.push(`pronouns: must be he, she, they or it`);
  if (!b.look || typeof b.look.cast !== 'string' || !/^#[0-9a-f]{6}$/i.test(b.look.accent ?? '')) r.errors.push('look: needs { cast, accent: "#rrggbb" }');
  if (b.voice && !(b.voice.pitch > 0 && b.voice.rate > 0 && ['sine', 'triangle', 'square', 'sawtooth'].includes(b.voice.wave))) r.errors.push('voice: bad shape');
  if (b.tics !== undefined && !Array.isArray(b.tics)) r.errors.push('tics: must be an array');
  for (const s of [b.name, b.tagline, b.instructions, ...(b.tics ?? [])]) {
    if (typeof s !== 'string') continue;
    for (const p of rawProblems(s)) r.errors.push(`${p} in "${s.slice(0, 60)}"`);
  }
  r.lines++;
}

const ls = (dir: string) => {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f));
  } catch {
    return [];
  }
};
const personaFiles = ls(path.join(base, 'personas'));
const suitorFiles = ls(path.join(base, 'bank', 'suitors'));
const starFiles = ls(path.join(base, 'bank', 'stars'));
const starBanks = new Map<string, StarBank>();
const suitorBanks = new Map<string, SuitorBank>();
for (const f of starFiles) {
  const d = (() => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) as StarBank; } catch { return null; } })();
  if (d) starBanks.set(path.basename(f, '.json'), d);
}
personaFiles.forEach(checkPersona);
suitorFiles.forEach(checkSuitor);
starFiles.forEach(checkStar);

// ---- v2 replies: show/bank/replies/<star>/<suitor>.json ------------------------------------
/** every suitor line a star replies to: openers, answers, twists, roasts, wingman lines, one-on-one openers, steals */
function replyable(b: SuitorBank): { t: string; opener: boolean }[] {
  const out: { t: string; opener: boolean }[] = [];
  const add = (x: unknown, opener = false) => {
    for (const l of Array.isArray(x) ? x : [x]) if (l && typeof (l as L).t === 'string') out.push({ t: (l as L).t, opener });
  };
  add(b.openers, true);
  for (const v of Object.values(b.answers ?? {})) add(v);
  for (const v of Object.values(b.twists ?? {})) add(v);
  for (const v of Object.values(b.roast ?? {})) add(v);
  for (const v of Object.values(b.wingman ?? {})) add(v);
  for (const v of Object.values(b.oneOnOne?.open ?? {})) add(v);
  add(b.oneOnOne?.steal ?? []);
  return out;
}
const replyRows: string[] = [];
for (const st of STAR_IDS) {
  for (const su of SUITOR_IDS) {
    const file = path.join(base, 'bank', 'replies', st, `${su}.json`);
    const sb = suitorBanks.get(su);
    if (!fs.existsSync(file)) {
      replyRows.push(`  ${st.padEnd(11)} ${su.padEnd(7)} no file${sb ? ` (${replyable(sb).length} lines need replies)` : ''}`);
      continue;
    }
    const r = rep(file);
    const d = readFile(file, r) as { star?: string; suitor?: string; replies?: Record<string, { warm?: unknown; cold?: unknown }> } | null;
    if (!d) continue;
    if (d.star !== st || d.suitor !== su) r.errors.push(`star/suitor must be "${st}"/"${su}"`);
    if (!d.replies || typeof d.replies !== 'object') {
      r.errors.push('replies: missing or not an object');
      continue;
    }
    const lines = sb ? replyable(sb) : [];
    const byText = new Map(lines.map((l) => [l.t, l]));
    const seen = new Set<string>();
    let stale = 0;
    for (const [k, v] of Object.entries(d.replies)) {
      const l = byText.get(k);
      if (!l) stale++;
      const max = l?.opener ? 6 : 10;
      lineCheck(r, `replies["${k.slice(0, 40)}"].warm`, v?.warm, max, { seen: new Set(), slots: ['rival', 'name'] });
      lineCheck(r, `replies["${k.slice(0, 40)}"].cold`, v?.cold, max, { seen: new Set(), slots: ['rival', 'name'] });
      void seen;
    }
    const missing = lines.filter((l) => !(l.t in d.replies!)).length;
    if (stale) r.warnings.push(`${stale} stale key(s): match no current ${su} line`);
    if (missing) v2(r, `${missing} of ${lines.length} ${su} lines have no reply`);
    replyRows.push(`  ${st.padEnd(11)} ${su.padEnd(7)} ${String(Object.keys(d.replies).length).padStart(4)} replies, ${String(missing).padStart(3)} missing, ${String(stale).padStart(3)} stale`);
  }
}

// which cards each suitor naturally plays (the weighted draw's input): top tags over scored lines
const tagRows: string[] = [];
for (const f of suitorFiles) {
  const b = JSON.parse(fs.readFileSync(f, 'utf8'));
  const aff = bankAffinity(b, decks);
  const sid = path.basename(f, '.json');
  const top = topTags(aff, decks);
  const want = SIGNATURE[sid] ?? [];
  const off = want.filter((c) => !top.includes(c) || (aff[c] ?? 0) < 0.15);
  tagRows.push(`  ${off.length ? 'OFF' : 'ok '} ${sid.padEnd(8)} ${top.map((t) => `${t} ${Math.round(aff[t]! * 100)}%${want.includes(t) ? '' : '(!)'}`).join(', ')}${off.length ? `   want ${off.map((c) => `${c} ${Math.round((aff[c] ?? 0) * 100)}%`).join(', ')}` : ''}`);
  const rr = reports.find((x) => x.file.endsWith(`suitors/${sid}.json`));
  if (rr && off.length) v2(rr, `signature cards below 15% or outside the top ${TOP_TAGS}: ${off.map((c) => `${c} ${Math.round((aff[c] ?? 0) * 100)}%`).join(', ')}`);
}
const owned = new Set(suitorFiles.flatMap((f) => topTags(bankAffinity(JSON.parse(fs.readFileSync(f, 'utf8')), decks), decks)));
const unowned = decks.cards.map((c) => c.id).filter((id) => !owned.has(id));

const missing: string[] = [];
const have = (files: string[], id: string) => files.some((f) => path.basename(f, '.json') === id);
for (const id of [...STAR_IDS, ...SUITOR_IDS]) if (!have(personaFiles, id)) missing.push(`personas/${id}.json`);
for (const id of SUITOR_IDS) if (!have(suitorFiles, id)) missing.push(`bank/suitors/${id}.json`);
for (const id of STAR_IDS) if (!have(starFiles, id)) missing.push(`bank/stars/${id}.json`);

let errors = 0;
let warnings = 0;
for (const r of reports) {
  errors += r.errors.length;
  warnings += r.warnings.length;
  const status = r.errors.length ? 'FAIL' : r.warnings.length ? 'warn' : 'ok  ';
  console.log(`${status} ${r.file}  (${r.lines} lines, ${r.errors.length} errors, ${r.warnings.length} warnings)`);
  for (const e of r.errors) console.log(`     error: ${e}`);
  if (!a.quiet) for (const w of r.warnings) console.log(`     warn:  ${w}`);
}
console.log(`\nreplies per pair (show/bank/replies/<star>/<suitor>.json):`);
for (const row of replyRows) console.log(row);
console.log(`\nsignature cards (FORMAT2.md): each suitor's top ${TOP_TAGS} tags over answers, solo twists and one-on-one openers; each signature card on at least 15% of those lines`);
for (const row of tagRows) console.log(row);
if (unowned.length) console.log(`cards in no suitor's top ${TOP_TAGS} (only ever face up, and rarely): ${unowned.join(', ')}`);
if (missing.length) console.log(`\nmissing files (the show runs on placeholders and neutral lines): ${missing.join(', ')}`);
console.log(`\n${reports.length} files, ${errors} errors, ${warnings} warnings`);
process.exit(errors ? 1 : 0);
