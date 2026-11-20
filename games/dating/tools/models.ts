// Live model picker. Reads OpenRouter's public model list (no key needed), keeps cheap current
// text chat models, prints the 20 cheapest grouped by provider, and caches per-model facts the
// brain uses (price, reasoning controls) in .cache/models-info.json.
//
//   node tools/models.ts                     list
//   node tools/models.ts --assign            also write .cache/models.json { botId: modelId }
//   node tools/models.ts --assign --stars a,b,c --set dash=x/y
//                                            the same, with hand overrides (star order = roster order)
//
// No model or provider is named in code: every choice comes from the live list and its metadata.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Bot } from '../show/types.ts';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const CACHE = path.join(ROOT, '.cache');
export const MODELS_FILE = path.join(CACHE, 'models.json');
const INFO_FILE = path.join(CACHE, 'models-info.json');
const LIST_URL = 'https://openrouter.ai/api/v1/models';

const MAX_PROMPT = 0.3; // USD per million tokens
const MAX_COMPLETION = 1.5;
const MIN_CONTEXT = 16000;
// what one show call looks like: a long system prompt, a short answer
const CALL_IN = 1600;
const CALL_OUT = 50;

interface Raw {
  id: string;
  name: string;
  created: number;
  context_length: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  pricing: { prompt: string; completion: string };
  supported_parameters?: string[];
  expiration_date?: string | null;
  reasoning?: { mandatory?: boolean; supported_efforts?: string[]; default_enabled?: boolean } | null;
  benchmarks?: { artificial_analysis?: { intelligence_index?: number | null } };
}

export interface Row {
  id: string;
  provider: string;
  prompt: number; // per million
  completion: number;
  context: number;
  created: number;
  perCall: number; // USD for one typical call
  reasoning: string; // 'none' | 'off' | 'minimal' | 'low' | 'forced'
  json: boolean;
  index: number | null;
  raw: Raw;
}

// ------------------------------------------------------------------------------------------
// Roster: bots.json, else show/personas/*.json, else the table in show/CAST.md
// ------------------------------------------------------------------------------------------

export function loadRoster(): Bot[] {
  const assigned = readJson<Record<string, string>>(MODELS_FILE) ?? {};
  // .cache/models.json wins; a persona's own model counts only if it is a real id
  const withModel = (b: Bot): Bot => ({ ...b, model: assigned[b.id] || (b.model?.includes('/') ? b.model : '') });
  const bots = readJson<Bot[]>(path.join(ROOT, 'bots.json'));
  if (Array.isArray(bots) && bots.length) return bots.map(withModel);
  const dir = path.join(ROOT, 'show', 'personas');
  if (fs.existsSync(dir)) {
    const ps = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson<Bot>(path.join(dir, f))).filter((b): b is Bot => !!b && !!b.id);
    if (ps.length >= 5) return ps.map(withModel);
  }
  return castTable().map(withModel);
}

function castTable(): Bot[] {
  let text = '';
  try { text = fs.readFileSync(path.join(ROOT, 'show', 'CAST.md'), 'utf8'); } catch { return []; }
  const out: Bot[] = [];
  let role: 'star' | 'suitor' | null = null;
  for (const line of text.split('\n')) {
    if (/^##\s+Suitors/i.test(line)) role = 'suitor';
    else if (/^##\s+Stars/i.test(line)) role = 'star';
    else if (/^##/.test(line)) role = null;
    if (!role || !line.startsWith('|')) continue;
    const c = line.split('|').slice(1, -1).map((s) => s.trim());
    if (!c[0] || c[0] === 'id' || /^-+$/.test(c[0])) continue;
    const nm = /^(.*?)\s*\((he|she|they|it)\)/.exec(c[1]);
    const name = nm ? nm[1] : c[1];
    const pronouns = (nm ? nm[2] : 'they') as Bot['pronouns'];
    const instructions = role === 'suitor'
      ? `You are ${name}, built as ${c[2]}. How you talk: ${c[3]} You want: ${c[4]} Your flaw: ${c[5]} Your secret: ${c[6]} You flirt by: ${c[7]}`
      : `You are ${name}, built as ${c[2]}. How you talk: ${c[3]} Your standards: ${c[4]} You are savage ${c[5].toLowerCase()} Your ex: ${c[6]}`;
    out.push({ id: c[0], role, name, pronouns, tagline: c[2].split(/\s+/).slice(0, 6).join(' '), model: '', instructions, look: { cast: c[0], accent: '#999999' } });
  }
  return out;
}

function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return null; }
}

// ------------------------------------------------------------------------------------------
// The live list
// ------------------------------------------------------------------------------------------

function reasoningMode(m: Raw): string {
  const p = m.supported_parameters ?? [];
  const r = m.reasoning;
  if (!r || !(p.includes('reasoning') || p.includes('reasoning_effort') || p.includes('include_reasoning'))) return 'none';
  const e = r.supported_efforts ?? [];
  if (e.includes('none')) return 'off';
  if (e.includes('minimal')) return 'minimal';
  if (!r.mandatory && !e.length) return 'off';
  if (e.includes('low')) return 'low';
  return 'forced';
}

const NOT_CHAT = /guard|safety|safeguard|moderat|summari[sz]e|extract|schematron|ui-tars|embed|rerank|ocr|coder|codestral|devstral|-vl\b|-vl-|omni|audio|voxtral|tts|search|deep-research/i;

export async function fetchModels(): Promise<{ all: Raw[]; cheap: Row[] }> {
  const res = await fetch(LIST_URL);
  if (!res.ok) throw new Error(`models list: HTTP ${res.status}`);
  const all = ((await res.json()) as { data: Raw[] }).data ?? [];
  const now = Date.now();
  const cheap: Row[] = [];
  for (const m of all) {
    const prompt = +m.pricing?.prompt * 1e6;
    const completion = +m.pricing?.completion * 1e6;
    const out = m.architecture?.output_modalities ?? [];
    const inp = m.architecture?.input_modalities ?? [];
    if (out.length !== 1 || out[0] !== 'text' || !inp.includes('text')) continue;
    if (m.id.includes(':') || m.id.startsWith('~')) continue; // :free, :batch, aliases
    if (!(prompt > 0) || prompt > MAX_PROMPT || !(completion >= 0) || completion > MAX_COMPLETION) continue;
    if ((m.context_length ?? 0) < MIN_CONTEXT) continue;
    if (m.expiration_date) continue; // scheduled for removal: deprecated
    if (/deprecated|preview/i.test(m.name) || /preview/i.test(m.id)) continue;
    if (now - m.created * 1000 < 0) continue;
    if (NOT_CHAT.test(m.id)) continue;
    const p = m.supported_parameters ?? [];
    cheap.push({
      id: m.id,
      provider: m.id.split('/')[0],
      prompt,
      completion,
      context: m.context_length,
      created: m.created,
      perCall: (CALL_IN * prompt + CALL_OUT * completion) / 1e6,
      reasoning: reasoningMode(m),
      json: p.includes('response_format') || p.includes('structured_outputs'),
      index: m.benchmarks?.artificial_analysis?.intelligence_index ?? null,
      raw: m,
    });
  }
  cheap.sort((a, b) => a.perCall - b.perCall);
  return { all, cheap };
}

export function writeInfo(all: Raw[]): void {
  const models: Record<string, unknown> = {};
  for (const m of all) {
    models[m.id] = {
      prompt: +m.pricing?.prompt || 0,
      completion: +m.pricing?.completion || 0,
      params: m.supported_parameters ?? [],
      reasoning: m.reasoning ?? null,
    };
  }
  fs.mkdirSync(CACHE, { recursive: true });
  const tmp = `${INFO_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ fetchedAt: new Date().toISOString(), models }));
  fs.renameSync(tmp, INFO_FILE);
}

function money(x: number): string {
  return x.toFixed(3).padStart(6);
}

function printRows(rows: Row[]): void {
  const byProv = new Map<string, Row[]>();
  for (const r of rows) byProv.set(r.provider, [...(byProv.get(r.provider) ?? []), r]);
  console.log(`\n${rows.length} cheapest current text models (USD per million tokens, in / out; reasoning control)\n`);
  for (const [prov, rs] of [...byProv].sort((a, b) => a[1][0].perCall - b[1][0].perCall)) {
    console.log(prov);
    for (const r of rs) {
      console.log(`  ${r.id.padEnd(48)} ${money(r.prompt)} / ${money(r.completion)}  ctx ${String(Math.round(r.context / 1000)).padStart(5)}k  reasoning ${r.reasoning.padEnd(7)}${r.index != null ? `  index ${r.index}` : ''}`);
    }
  }
}

// ------------------------------------------------------------------------------------------
// Assignment
// ------------------------------------------------------------------------------------------

/** Parameter count from the id, in billions, when the id says it (12b, 1.7b, 30b-a3b -> 30). */
function sizeB(id: string): number | null {
  const m = /(?:^|[-_/])(\d+(?:\.\d+)?)b(?:[-_.]|$)/i.exec(id);
  return m ? parseFloat(m[1]) : null;
}

/** A rough "can hold a persona and return JSON" score from metadata only. */
function score(r: Row): number {
  const ageDays = (Date.now() / 1000 - r.created) / 86400;
  let s = r.index ?? 24 + 4 * Math.log10(Math.max(1e-3, r.prompt * 3 + r.completion) / 0.3);
  if (ageDays < 270) s += 3;
  else if (ageDays > 540) s -= 4;
  if (r.json) s += 1.5;
  if (r.reasoning === 'none' || r.reasoning === 'off') s += 1.5;
  if (r.reasoning === 'low') s -= 3;
  const b = sizeB(r.id);
  if (b != null && b < 20) s -= 6;
  return s;
}

function usable(r: Row): boolean {
  // hidden thinking eats an 80-token cap and the 6 s timeout
  if (r.reasoning === 'forced' || r.reasoning === 'low') return false;
  if (r.reasoning === 'minimal' && r.raw.reasoning?.mandatory) return false;
  if (/tiny|nano|micro|mini-?\d*b?$|lightning/i.test(r.id)) return false;
  const b = sizeB(r.id);
  return b == null || b >= 9;
}

export function assign(cheap: Row[], roster: Bot[], overrides: { stars?: string[]; set?: Record<string, string> }): Record<string, string> {
  const pool = cheap.filter(usable).sort((a, b) => score(b) - score(a));
  const stars = roster.filter((b) => b.role === 'star');
  const suitors = roster.filter((b) => b.role === 'suitor');
  const out: Record<string, string> = {};
  const used = new Set<string>();
  const perProvider = new Map<string, number>();
  const take = (r: Row) => { used.add(r.id); perProvider.set(r.provider, (perProvider.get(r.provider) ?? 0) + 1); return r.id; };

  // stars: the best scored, one per provider
  const starProviders = new Set<string>();
  stars.forEach((b, i) => {
    const forced = overrides.stars?.[i];
    if (forced) { out[b.id] = forced; used.add(forced); starProviders.add(forced.split('/')[0]); return; }
    const r = pool.find((x) => !used.has(x.id) && !starProviders.has(x.provider));
    if (r) { starProviders.add(r.provider); out[b.id] = take(r); }
  });
  // suitors: spread providers, at most two each, prefer providers the stars do not use
  for (const b of suitors) {
    const r =
      pool.find((x) => !used.has(x.id) && !perProvider.has(x.provider) && !starProviders.has(x.provider)) ??
      pool.find((x) => !used.has(x.id) && !perProvider.has(x.provider)) ??
      pool.find((x) => !used.has(x.id) && (perProvider.get(x.provider) ?? 0) < 2) ??
      pool.find((x) => !used.has(x.id));
    if (r) out[b.id] = take(r);
  }
  for (const [k, v] of Object.entries(overrides.set ?? {})) out[k] = v;
  return out;
}

// ------------------------------------------------------------------------------------------
// CLI
// ------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const { all, cheap } = await fetchModels();
  writeInfo(all);
  printRows(cheap.slice(0, 20));
  if (!args.includes('--assign')) return;

  const roster = loadRoster();
  if (!roster.length) throw new Error('no roster: need bots.json, show/personas/*.json or show/CAST.md');
  const set: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) if (args[i] === '--set' && args[i + 1]?.includes('=')) { const [k, v] = args[i + 1].split('='); set[k] = v; }
  const stars = arg('--stars')?.split(',').map((s) => s.trim()).filter(Boolean);
  const known = new Set(all.map((m) => m.id));
  for (const id of [...(stars ?? []), ...Object.values(set)]) if (!known.has(id)) throw new Error(`unknown model id: ${id}`);

  const map = assign(cheap, roster, { stars, set });
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(MODELS_FILE, JSON.stringify(map, null, 2) + '\n');
  const byId = new Map(all.map((m) => [m.id, m]));
  console.log(`\nassignment -> ${path.relative(ROOT, MODELS_FILE)}`);
  for (const b of roster) {
    const m = byId.get(map[b.id]);
    const price = m ? `${money(+m.pricing.prompt * 1e6)} / ${money(+m.pricing.completion * 1e6)}` : '';
    console.log(`  ${b.role.padEnd(6)} ${b.id.padEnd(11)} ${(map[b.id] ?? '(none)').padEnd(48)} ${price}`);
  }
  const providers = new Set(Object.values(map).map((id) => id.split('/')[0]));
  console.log(`  ${providers.size} providers`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('tools/models.ts')) {
  main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
}
