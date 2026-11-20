// The house roster. bots.json if present, else assembled from show/personas/*.json. Any persona
// that is still missing gets a clearly named placeholder so the show always runs.

import fs from 'node:fs';
import path from 'node:path';
import type { Bot, Role } from './types.ts';
import { BOTS_JSON, CACHE, PERSONAS, ROOT, readJson } from './paths.ts';

export const MODELS_JSON = path.join(CACHE, 'models.json');

export const SUITOR_IDS = ['dash', 'tilly', 'quill', 'prince', 'nav', 'crumb', 'vex', 'brock'] as const;
export const STAR_IDS = ['vesper', 'maximilian', 'pixel'] as const;

const ACCENTS = ['#e5484d', '#3e63dd', '#30a46c', '#f5a524', '#8e4ec6', '#12a594', '#d6409f', '#6b7280', '#ff8b3e', '#46a758', '#0090ff'];

export function placeholderBot(id: string, role: Role, i = 0): Bot {
  const name = id.charAt(0).toUpperCase() + id.slice(1);
  return {
    id,
    role,
    name: `${name} (stand-in)`,
    tagline: 'Placeholder until the persona lands',
    pronouns: 'they',
    model: 'unassigned',
    instructions: `You are ${name}, a stand-in contestant on a dating show for bots. Keep it short, polite and a little awkward.`,
    look: { cast: id, accent: ACCENTS[i % ACCENTS.length]! },
    voice: { pitch: 180 + (i % 5) * 20, rate: 14, wave: 'triangle' },
  };
}

function isBot(b: unknown): b is Bot {
  const x = b as Bot;
  return !!x && typeof x.id === 'string' && (x.role === 'star' || x.role === 'suitor') && typeof x.name === 'string';
}

function normalise(b: Bot, i: number): Bot {
  return {
    ...b,
    tagline: b.tagline ?? '',
    pronouns: b.pronouns ?? 'they',
    model: b.model ?? 'unassigned',
    instructions: b.instructions ?? '',
    look: { cast: b.look?.cast ?? b.id, accent: b.look?.accent ?? ACCENTS[i % ACCENTS.length]! },
  };
}

export function loadPersonas(dir = PERSONAS): Bot[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const out: Bot[] = [];
  for (const f of files) {
    const b = readJson<Bot>(path.join(dir, f));
    if (isBot(b)) out.push(b);
  }
  return out;
}

export interface RosterOpts {
  botsJson?: string;
  personasDir?: string;
  /** { botId: modelId }, merged over 'unassigned' or empty models (default .cache/models.json) */
  modelsJson?: string | null;
  /** assets/cast folder; a manifest's accent wins over the persona's (default assets/cast) */
  castDir?: string | null;
  log?: (s: string) => void;
}

/** Always returns the 3 stars and 8 suitors (plus any extra valid bots found). */
export function loadRoster(o: RosterOpts = {}): Bot[] {
  const fromJson = readJson<unknown>(o.botsJson ?? BOTS_JSON);
  const byId = new Map<string, Bot>();
  if (Array.isArray(fromJson)) for (const b of fromJson) if (isBot(b)) byId.set(b.id, b);
  for (const b of loadPersonas(o.personasDir)) if (!byId.has(b.id)) byId.set(b.id, b);
  const missing: string[] = [];
  let i = 0;
  for (const id of STAR_IDS) if (!byId.has(id)) (missing.push(id), byId.set(id, placeholderBot(id, 'star', i++)));
  for (const id of SUITOR_IDS) if (!byId.has(id)) (missing.push(id), byId.set(id, placeholderBot(id, 'suitor', i++)));
  if (missing.length) o.log?.(`roster: placeholder for ${missing.join(', ')}`);
  const models = o.modelsJson === null ? null : readJson<Record<string, string>>(o.modelsJson ?? MODELS_JSON);
  const castDir = o.castDir === null ? null : (o.castDir ?? path.join(ROOT, 'assets', 'cast'));
  return [...byId.values()].map((b, i) => {
    const bot = normalise(b, i);
    const m = models?.[bot.id];
    if (typeof m === 'string' && m && (!bot.model || bot.model === 'unassigned')) bot.model = m;
    if (castDir) {
      for (const dir of [bot.look.cast, bot.id]) {
        const man = readJson<{ accent?: string }>(path.join(castDir, dir, 'manifest.json'));
        if (man && typeof man.accent === 'string' && /^#[0-9a-f]{3,8}$/i.test(man.accent)) {
          bot.look = { ...bot.look, accent: man.accent };
          break;
        }
      }
    }
    return bot;
  });
}

export const stars = (roster: Bot[]) => roster.filter((b) => b.role === 'star');
export const suitors = (roster: Bot[]) => roster.filter((b) => b.role === 'suitor');
