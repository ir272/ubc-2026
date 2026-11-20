// Folder paths for node code. Always resolved from this file, so tools, tests, the runner and the
// harness agree no matter the working directory.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import type { Decks } from './types.ts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHOW = path.join(ROOT, 'show');
export const BANK = path.join(SHOW, 'bank');
export const PERSONAS = path.join(SHOW, 'personas');
export const CACHE = path.join(ROOT, '.cache');
export const BOTS_JSON = path.join(ROOT, 'bots.json');
export const MEMORY_JSON = path.join(CACHE, 'memory.json');
export const USED_JSON = path.join(CACHE, 'used.json');

export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function loadDecks(): Decks {
  const d = readJson<Decks>(path.join(SHOW, 'decks.json'));
  if (!d) throw new Error('show/decks.json is missing or broken');
  return d;
}
