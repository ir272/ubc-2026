// Tumbletop channel: one three-round knockout show per match, forever. Written like
// runner/src/channels/coinflip.ts: the runner calls run(show) in a loop.
//
//   import tumbletopChannel from '../../games/tumbletop/channel.ts';
//   ...  tumbletop: () => tumbletopChannel(),
//
// The show itself is show/script.js (the dev page runs the same script through a fake Show).
// This file adds what only the server has: which 16 of the 24 run next, the records file, and
// SIM_HASH computed from the simulation's sources.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ChannelDef, Show } from '../../runner/src/types.ts';
import { runShow, DEFAULT_TIMINGS } from './show/script.js';
import type { ShowTimings } from './show/script.js';
import { applyShow, normaliseRecords, pickEntrants } from './show/records.js';
import type { Records } from './show/records.js';
import { simulate } from './sim/index.js';

export { simulate };

/** sha256 of the simulation's source files (sim/*.js except the CLI), in name order. */
export const SIM_HASH: string = (() => {
  const dir = fileURLToPath(new URL('./sim/', import.meta.url));
  const h = createHash('sha256');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'cli.js').sort()) {
    h.update(f + '\n');
    h.update(readFileSync(dir + f));
    h.update('\n');
  }
  return h.digest('hex');
})();

export interface TumbletopChannelOpts {
  id?: string;
  title?: string;
  /** Override any of the show's timings (ms): callMs, betMs[3], titleMs, cutMs, recapMs, finalCutMs, resultMs. */
  timings?: Partial<ShowTimings>;
  intermissionMs?: number; // default 6 s
  /** Where records are kept. Default: data/records.json in this folder. `null` keeps them in memory only. */
  recordsPath?: string | null;
  /** Pick the 16 entrants (tests). Default: the Gumbles that have run least, ties at random. */
  pick?: (records: Records) => string[];
}

function loadRecords(path: string | null): Records {
  if (!path) return normaliseRecords(null);
  try {
    return normaliseRecords(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return normaliseRecords(null);
  }
}

function saveRecords(path: string | null, records: Records): void {
  if (!path) return;
  try {
    mkdirSync(fileURLToPath(new URL('.', new URL(`file://${path}`))), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(records, null, 2) + '\n');
    renameSync(tmp, path);
  } catch {
    // records are a nicety: never let the disk stop the show
  }
}

export function tumbletopChannel(o: TumbletopChannelOpts = {}): ChannelDef {
  const recordsPath = o.recordsPath === undefined ? fileURLToPath(new URL('./data/records.json', import.meta.url)) : o.recordsPath;
  const records = loadRecords(recordsPath);
  const pick = o.pick ?? ((r: Records) => pickEntrants(r, Math.random));
  const timings: ShowTimings = { ...DEFAULT_TIMINGS, ...(o.timings ?? {}) };
  let showNo = Object.values(records).reduce((n, r) => n + r.wins, 0);

  return {
    id: o.id ?? 'tumbletop',
    title: o.title ?? 'Tumbletop',
    intermissionMs: o.intermissionMs ?? 6000,
    async run(show: Show) {
      // Which 16 run is decided here, before the show is announced. No seed exists yet.
      const entrants = pick(records);
      showNo++;
      const result = await runShow(show, {
        entrants,
        records,
        simHash: SIM_HASH,
        matchId: `tumbletop-${Date.now().toString(36)}`,
        title: `Tumbletop, show ${showNo}`,
        timings,
        intermissionMs: o.intermissionMs ?? 6000,
      });
      applyShow(records, result);
      saveRecords(recordsPath, records);
    },
  };
}

export default tumbletopChannel;
