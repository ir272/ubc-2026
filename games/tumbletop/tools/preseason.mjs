#!/usr/bin/env node
// Writes data/records.json from a pre-season of real simulated shows (nobody watched them, but
// every result is a genuine run of the same simulation), so the first show on air already has
// records and form to show. Deterministic: the same arguments give the same file.
//   node tools/preseason.mjs [--shows 36] [--seed 2026]
import { mkdirSync, writeFileSync } from 'node:fs';
import { emptyRecords, pickEntrants, applyShow } from '../show/records.js';
import { simulateShow, showSeeds } from '../sim/index.js';
import { Rng } from '../sim/rng.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? Number(args[i + 1]) : d; };
const SHOWS = opt('shows', 36), SEED = opt('seed', 2026);
const rng = new Rng(SEED);
const records = emptyRecords();
for (let n = 0; n < SHOWS; n++) {
  const entrants = pickEntrants(records, () => rng.next());
  const show = simulateShow({ seeds: showSeeds(SEED * 1000 + n), entrants });
  applyShow(records, { entrants, rounds: show.rounds.map((r) => ({ qualified: r.result.qualified })), winnerId: show.winnerId });
}
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/records.json', import.meta.url), JSON.stringify(records, null, 2) + '\n');
const rows = Object.entries(records).sort((a, b) => b[1].wins - a[1].wins);
console.log(`${SHOWS} pre-season shows.`);
for (const [id, r] of rows) console.log(`${id.padEnd(11)} ${String(r.wins).padStart(2)} wins in ${r.played}  finals ${r.finals}  form ${r.form.join('')}`);
