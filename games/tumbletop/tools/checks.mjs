#!/usr/bin/env node
// The brief's numeric checks for the three-round show, on at most two worker threads.
//   node tools/checks.mjs                 all checks (500 shows), prints a table, exits 1 on a failure
//   node tools/checks.mjs --shows 2000    a longer balance run
//   node tools/checks.mjs --json out.json also write the numbers
//   node tools/checks.mjs --tune k=v,...  override ai.js TUNE values for this run (tuning only)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { simulateShow, showSeeds, ROSTER, Rng, ROUNDS } from '../sim/index.js';
import { TUNE } from '../sim/ai.js';

function pick16(showNo) {
  // which 16 of the 24 run: a seeded shuffle, so every Gumble enters two shows in three
  const rng = new Rng(0xbeef00 + showNo);
  return rng.shuffle(ROSTER.map((g) => g.id)).slice(0, 16);
}

function runShows(from, to, tune) {
  if (tune) Object.assign(TUNE, tune);
  const out = { shows: 0, entered: {}, won: {}, final: {}, r2: {}, timeouts: 0, raceMs: [[], [], []], late: [[], [], []], cut: [[], [], []], winners: [] };
  for (const g of ROSTER) { out.entered[g.id] = 0; out.won[g.id] = 0; out.final[g.id] = 0; out.r2[g.id] = 0; }
  for (let n = from; n < to; n++) {
    const entrants = pick16(n);
    const show = simulateShow({ seeds: showSeeds(n * 2654435761), entrants });
    out.shows++;
    for (const id of entrants) out.entered[id]++;
    for (const id of show.rounds[0].result.qualified) out.r2[id]++;
    for (const id of show.rounds[1].result.qualified) out.final[id]++;
    out.won[show.winnerId]++;
    show.rounds.forEach((r, i) => {
      if (r.result.timedOut) out.timeouts++;
      out.raceMs[i].push(r.result.raceMs);
      out.late[i].push(r.result.lateCutChanges);
      out.cut[i].push(r.result.cutChanges);
    });
  }
  return out;
}

if (!isMainThread) {
  parentPort.postMessage(runShows(workerData.from, workerData.to, workerData.tune));
} else {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const SHOWS = Number(opt('shows', 500));
  const tune = opt('tune', '') ? Object.fromEntries(opt('tune', '').split(',').map((kv) => { const [k, v] = kv.split('='); return [k, Number(v)]; })) : null;
  const quiet = args.includes('--quiet');
  const half = Math.ceil(SHOWS / 2);
  const t0 = Date.now();
  const parts = await Promise.all([[0, half], [half, SHOWS]].map(([from, to]) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { from, to, tune } });
    w.once('message', res); w.once('error', rej);
  })));
  const m = parts[0];
  const p2 = parts[1];
  for (const k of ['entered', 'won', 'final', 'r2']) for (const id in p2[k]) m[k][id] += p2[k][id];
  m.shows += p2.shows; m.timeouts += p2.timeouts;
  for (let i = 0; i < 3; i++) { m.raceMs[i].push(...p2.raceMs[i]); m.late[i].push(...p2.late[i]); m.cut[i].push(...p2.cut[i]); }

  // determinism: the same show twice, and a different seed
  const ent = pick16(7);
  const a = simulateShow({ seeds: showSeeds(7), entrants: ent });
  const b = simulateShow({ seeds: showSeeds(7), entrants: ent });
  const c = simulateShow({ seeds: showSeeds(8), entrants: ent });
  const hashes = (s) => s.rounds.map((r) => r.result.hash).join(',');
  const deterministic = hashes(a) === hashes(b) && JSON.stringify(a.rounds.map((r) => r.result.order)) === JSON.stringify(b.rounds.map((r) => r.result.order)) && hashes(a) !== hashes(c);

  const mean = (x) => x.reduce((s, v) => s + v, 0) / Math.max(1, x.length);
  const q = (x, p) => x.slice().sort((u, v) => u - v)[Math.floor((x.length - 1) * p)];
  const rate = (id) => m.won[id] / Math.max(1, m.entered[id]);
  const rows = ROSTER.map((g) => ({ id: g.id, speed: g.stats.speed, grip: g.stats.grip, bounce: g.stats.bounce, nerve: g.stats.nerve, entered: m.entered[g.id], won: m.won[g.id], win: rate(g.id), final: m.final[g.id] / Math.max(1, m.entered[g.id]), r2: m.r2[g.id] / Math.max(1, m.entered[g.id]) }));
  const third = (key, top) => {
    const s = ROSTER.slice().sort((x, y) => (top ? y.stats[key] - x.stats[key] : x.stats[key] - y.stats[key]) || x.num - y.num).slice(0, 8);
    const e = s.reduce((n, g) => n + m.entered[g.id], 0), w = s.reduce((n, g) => n + m.won[g.id], 0);
    return w / Math.max(1, e);
  };
  const maxWin = Math.max(...rows.map((r) => r.win)), minWin = Math.min(...rows.map((r) => r.win));
  const fast = third('speed', true), slow = third('speed', false);
  const ratio = fast / Math.max(1e-9, slow);
  const late1 = mean(m.late[0]), late2 = mean(m.late[1]);
  const checks = {
    determinism: { pass: deterministic, value: deterministic ? 'same seed, same hashes' : 'MISMATCH' },
    completion: { pass: m.timeouts === 0 && m.shows >= 200, value: `${m.shows} shows, ${m.timeouts} rounds ended on the clock` },
    balanceRange: { pass: maxWin <= 0.15 && minWin >= 0.02, value: `win rate ${(minWin * 100).toFixed(1)}% to ${(maxWin * 100).toFixed(1)}% (need 2% to 15%)` },
    statsMatter: { pass: ratio > 1 && ratio < 2, value: `fastest third ${(fast * 100).toFixed(1)}%, slowest third ${(slow * 100).toFixed(1)}%, ratio ${ratio.toFixed(2)} (need 1 to 2)` },
    drama: { pass: late1 >= 2 && late2 >= 2, value: `last-place changes in the final 10 s: round one ${late1.toFixed(2)}, round two ${late2.toFixed(2)} (need 2)` },
  };
  const out = {
    shows: m.shows, checks, rows,
    thirds: Object.fromEntries(['speed', 'grip', 'bounce', 'nerve'].map((k) => [k, { top: third(k, true), bottom: third(k, false) }])),
    raceSeconds: m.raceMs.map((x) => ({ mean: mean(x) / 1000, p10: q(x, 0.1) / 1000, p90: q(x, 0.9) / 1000, max: q(x, 1) / 1000 })),
    cutChanges: m.cut.map(mean), lateCutChanges: m.late.map(mean), wallMs: Date.now() - t0,
  };
  if (!quiet) {
    console.log(`Tumbletop checks over ${m.shows} shows (${out.wallMs} ms)\n`);
    for (const [k, v] of Object.entries(checks)) console.log(`${v.pass ? 'PASS' : 'FAIL'}  ${k.padEnd(13)} ${v.value}`);
    console.log('\nRace length (s): ' + out.raceSeconds.map((r, i) => `${ROUNDS[i].name} ${r.mean.toFixed(1)} (${r.p10.toFixed(0)} to ${r.p90.toFixed(0)}, max ${r.max.toFixed(0)})`).join(' | '));
    console.log('Win rate by stat third (top 8 / bottom 8): ' + Object.entries(out.thirds).map(([k, v]) => `${k} ${(v.top * 100).toFixed(1)}/${(v.bottom * 100).toFixed(1)}`).join('  '));
    console.log('\nGumble       spd grp bnc nrv  shows  wins  win%  final%  r2%');
    for (const r of rows.slice().sort((x, y) => y.win - x.win)) console.log(`${r.id.padEnd(12)} ${String(r.speed).padStart(3)} ${String(r.grip).padStart(3)} ${String(r.bounce).padStart(3)} ${String(r.nerve).padStart(3)} ${String(r.entered).padStart(6)} ${String(r.won).padStart(5)} ${(r.win * 100).toFixed(1).padStart(5)} ${(r.final * 100).toFixed(1).padStart(7)} ${(r.r2 * 100).toFixed(1).padStart(5)}`);
  } else {
    console.log(`${Object.values(checks).every((c) => c.pass) ? 'PASS' : 'FAIL'} range ${(minWin * 100).toFixed(1)}-${(maxWin * 100).toFixed(1)} ratio ${ratio.toFixed(2)} late ${late1.toFixed(2)}/${late2.toFixed(2)} timeouts ${m.timeouts} len ${out.raceSeconds.map((r) => r.mean.toFixed(1)).join('/')} thirds ` + Object.entries(out.thirds).map(([k, v]) => `${k} ${(v.top * 100).toFixed(1)}/${(v.bottom * 100).toFixed(1)}`).join(' '));
  }
  const json = opt('json', '');
  if (json) writeFileSync(json, JSON.stringify(out, null, 2));
  process.exit(Object.values(checks).every((c) => c.pass) ? 0 : 1);
}
