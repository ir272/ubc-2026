#!/usr/bin/env node
// Determinism check: node vs the browser, for the show's simulation.
//
//   node tools/crosscheck.mjs                  # 3 seeds x 3 rounds
//   node tools/crosscheck.mjs --seeds 3,9,11   # other show seeds
//   node tools/crosscheck.mjs --port 5201
//
// For each show seed it builds the three rounds the way the channel does (round one with 16
// entrants, round two with round one's qualifiers in finishing order, the final with round two's),
// each from its own 64-hex round seed. Every round runs in node through simulate() and in the
// browser dev page through window.__tt.simCheck(seedHex, entrants, round), which steps createSim
// the way simulate() does. The final tick, sim.hash() and the whole finish order (roster id and
// status) must match. Prints a table; exits 1 on any mismatch.
import { simulate } from '../sim/simulate.js';
import { Rng } from '../sim/rng.js';
import { pickEntrants, emptyRecords } from '../show/records.js';
import { parseArgs, resolveServer, launchBrowser, openStage } from './lib/browser.mjs';

const args = parseArgs(process.argv.slice(2));
const seeds = String(args.seeds ?? '1,7,42').split(',').map(Number);
const port = Number(args.port ?? 5201);

const hex64 = (rng) => { let s = ''; for (let i = 0; i < 8; i++) s += rng.nextU32().toString(16).padStart(8, '0'); return s; };

const server = await resolveServer({ port });
let browser = null, failures = 0;
const rows = [];
try {
  const b = await launchBrowser({ headless: true, width: 640, height: 360 });
  browser = b.browser;
  const { page, logs } = b;
  await openStage(page, server.url, { capture: 1, seed: 1 });
  for (const seed of seeds) {
    const rng = new Rng(seed);
    let field = pickEntrants(emptyRecords(), () => rng.next());
    for (let round = 0; round < 3; round++) {
      const seedHex = hex64(rng);
      const node = simulate({ seed: seedHex, entrants: field, options: { round } }).result;
      const nodeOrder = node.order.map((o) => `${o.id}:${o.status}`);
      const web = await page.evaluate(([s, e, r]) => window.__tt.simCheck(s, e, r), [seedHex, field, round]);
      const problems = [];
      if (web.ticks !== node.ticks) problems.push(`ticks ${node.ticks} vs ${web.ticks}`);
      if (web.hash !== node.hash) problems.push(`hash ${node.hash} vs ${web.hash}`);
      const at = nodeOrder.findIndex((x, i) => x !== web.order[i]);
      if (at >= 0 || nodeOrder.length !== web.order.length) problems.push(`order differs at place ${at + 1}: ${nodeOrder[at]} vs ${web.order[at]}`);
      if (problems.length) failures++;
      rows.push({ seed, round, n: field.length, ticks: node.ticks, hash: node.hash, webHash: web.hash, winner: node.order[0].id, ok: !problems.length, problems });
      field = node.qualified;
    }
  }
  if (logs.some((l) => /error/i.test(l))) console.log(`page console:\n  ${logs.join('\n  ')}`);
} finally {
  if (browser) await browser.close();
  await server.close();
}

console.log('seed  round  field  ticks  node hash         browser hash      first        result');
for (const r of rows) {
  console.log(`${String(r.seed).padStart(4)}  ${String(r.round).padStart(5)}  ${String(r.n).padStart(5)}  ${String(r.ticks).padStart(5)}  ${r.hash}  ${r.webHash}  ${r.winner.padEnd(11)}  ${r.ok ? 'match' : 'MISMATCH ' + r.problems.join('; ')}`);
}
console.log(failures ? `${failures} mismatch(es)` : `all ${rows.length} rounds match`);
process.exit(failures ? 1 : 0);
