#!/usr/bin/env node
// npm run match: one full match through the real channel script and a fake Show, headless.
//   node tools/match.mjs                 one mock match on a virtual clock (milliseconds), feed recorded
//   node tools/match.mjs --count 200     completion check: 200 matches, reports stalls and lengths
//   node tools/match.mjs --real          real time and real brains (needs a key; about 7 minutes)
// The recorded feed (.cache/feeds/<matchId>.jsonl) can be replayed in the harness from any point.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFakeRunner, createVirtualClock } from '../harness/fake_runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const COUNT = parseInt(opt('count', '1'), 10);
const REAL = flag('real');
const QUIET = flag('quiet') || COUNT > 3;

const { default: channel } = await import(path.join(ROOT, 'channel.ts'));
const recordsFile = path.join(ROOT, '.cache', REAL ? 'records.json' : 'records.match.json');
if (!REAL && flag('fresh')) fs.rmSync(recordsFile, { force: true });

const results = [];
let stalls = 0;
for (let i = 0; i < COUNT; i++) {
  const def = channel({ mock: !REAL, recordsFile });
  const virtual = REAL ? null : createVirtualClock();
  const feedDir = path.join(ROOT, '.cache', 'feeds');
  let matchMsg = null, events = 0, windows = 0, firstT = 0, lastT = 0;
  let closedAt = 0, maxGap = 0, verdictT = 0; // longest stretch with nothing to bet on, before the verdict
  const fake = createFakeRunner(def, { virtual, recordDir: COUNT <= 3 || i < 2 || flag('record') ? feedDir : null, once: true, houseBets: false, log: (m) => { if (!QUIET) console.error(`[runner] ${m}`); } });
  fake.subscribe((msg) => {
    if (msg.type === 'match') { matchMsg = msg; firstT = msg.t; closedAt = msg.t; }
    if (msg.type === 'window_open') { maxGap = Math.max(maxGap, msg.t - closedAt); }
    if (msg.type === 'window_locked') closedAt = msg.t;
    if (msg.type === 'event' && msg.event.type === 'verdict') { verdictT = msg.t; maxGap = Math.max(maxGap, msg.t - closedAt); }
    if (msg.type === 'event') events += 1;
    if (msg.type === 'window_open') windows += 1;
    lastT = msg.t;
  });
  const guard = setTimeout(() => { stalls += 1; console.error(`match ${i + 1} stalled`); fake.stop(); }, REAL ? 15 * 60 * 1000 : 60 * 1000);
  await fake.start();
  clearTimeout(guard);
  const r = fake.lastResult;
  if (!r) { stalls += 1; continue; }
  const rec = { matchId: matchMsg.matchId, title: matchMsg.title, winnerId: r.winnerId, how: r.how, temper: r.temper, attempts: r.attempts.length, lengthSec: Math.round((lastT - firstT) / 1000), maxGapNoWindowSec: Math.round(maxGap / 1000), events, windows, loadouts: r.loadouts, scores: r.attempts.map((a) => `${a.entrantId}:${a.result === 'kill' ? 'KILL' : Math.round(a.score * 100) + '%'}`) };
  results.push(rec);
  if (!QUIET) console.log(JSON.stringify(rec, null, 2));
}

if (COUNT > 1) {
  const lens = results.map((r) => r.lengthSec).sort((a, b) => a - b);
  const how = {};
  for (const r of results) how[r.how] = (how[r.how] || 0) + 1;
  console.log(JSON.stringify({
    matches: COUNT, finished: results.length, stalls,
    lengthSec: { min: lens[0], median: lens[Math.floor(lens.length / 2)], p90: lens[Math.floor(lens.length * 0.9)], max: lens[lens.length - 1] },
    attempts: { mean: +(results.reduce((a, r) => a + r.attempts, 0) / Math.max(1, results.length)).toFixed(2) },
    decidedBy: how,
    longestGapWithNothingToBetOnSec: { median: results.map((r) => r.maxGapNoWindowSec).sort((a, b) => a - b)[Math.floor(results.length / 2)], max: Math.max(...results.map((r) => r.maxGapNoWindowSec)) },
    windowsPerMatch: +(results.reduce((a, r) => a + r.windows, 0) / Math.max(1, results.length)).toFixed(1),
  }, null, 2));
}
process.exit(stalls ? 1 : 0);
