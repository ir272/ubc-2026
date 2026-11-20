#!/usr/bin/env node
// Frame strips for the critics, cut from recorded matches. The critic sees only the strips;
// the answer key is written next to them and never shown.
//   node tools/clips.mjs --kind phases --n 5 --seed 3 --outdir shots/r1/phases
//       five random 8 second clips (8 frames, one a second) from anywhere in a match
//   node tools/clips.mjs --kind middle --n 1 --outdir shots/r1/middle
//       one 36 second clip from the middle of the fight (12 frames, one every 3 s)
//   node tools/clips.mjs --kind decision --n 5 --outdir shots/r1/decision
//       a decision moment each: from just before the menu opens to the exchange's result
//   node tools/clips.mjs --kind tape --n 10 --outdir shots/r1/tape
//       the tape still of n different recorded matches (who wins? the key has the answer)
// Feeds come from .cache/feeds (newest first); run `node tools/match.mjs --count N` for more.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, parseArgs } from './_lib.mjs';
import { makeRng, rand } from '../src/core/rng.js';

const args = parseArgs();
const kind = args.kind || 'phases';
const N = parseInt(args.n || '5', 10);
const outdir = args.outdir || `shots/${kind}`;
const rng = makeRng(parseInt(args.seed || '1', 10));
const FEEDS = path.join(ROOT, '.cache', 'feeds');
const feeds = fs.readdirSync(FEEDS).filter((f) => f.endsWith('.jsonl') && fs.readFileSync(path.join(FEEDS, f), 'utf8').includes('"match_end"')).map((f) => ({ f, m: fs.statSync(path.join(FEEDS, f)).mtimeMs })).sort((a, b) => b.m - a.m).map((x) => x.f);
if (!feeds.length) throw new Error('no recorded feeds: run `npm run match` first');
const load = (f) => fs.readFileSync(path.join(FEEDS, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const evs = (msgs, type) => msgs.filter((m) => m.type === 'event' && m.event.type === type);
const phaseAt = (msgs, ms) => { let p = null; for (const m of evs(msgs, 'phase')) if (m.event.at <= ms) p = m.event.data.phase; return p; };

const jobs = [], key = [];
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
if (kind === 'phases') {
  // one clip from each phase at a random moment inside it, in shuffled order (--uniform: anywhere in the match)
  const order = ['call', 'choosing', 'tape', 'fight', 'verdict'];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand(rng) * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  for (let i = 0; i < N; i++) {
    const f = feeds[Math.floor(rand(rng) * Math.min(feeds.length, 4))];
    const msgs = load(f);
    const t0 = msgs.find((m) => m.type === 'match').t;
    const len = msgs[msgs.length - 1].t - t0;
    let ms;
    if (args.uniform) ms = Math.floor(2000 + rand(rng) * (len - 12000));
    else {
      const ph = evs(msgs, 'phase');
      const want = order[i % order.length];
      const k = ph.findIndex((m) => m.event.data.phase === want);
      const a = ph[k].event.at, b = k + 1 < ph.length ? ph[k + 1].event.at : len;
      ms = Math.floor(a + rand(rng) * Math.max(0, b - a - 8800));
    }
    const name = `clip_${letters[i]}`;
    jobs.push({ name, feed: f, at: `ms:${ms}`, wait: 600, strip: 8, every: 1000, fw: 640, out: `${outdir}/${name}.jpg` });
    key.push({ name, feed: f, ms, phaseStart: phaseAt(msgs, ms), phaseEnd: phaseAt(msgs, ms + 8600) });
  }
} else if (kind === 'middle') {
  for (let i = 0; i < N; i++) {
    const f = feeds[i % feeds.length];
    const msgs = load(f);
    const starts = evs(msgs, 'attempt.start');
    const s = starts[Math.min(starts.length - 1, 1 + Math.floor(rand(rng) * Math.max(1, starts.length - 2)))];
    const name = `middle_${letters[i]}`;
    const ms = s.event.at + 3000 + Math.floor(rand(rng) * 4000);
    jobs.push({ name, feed: f, at: `ms:${ms}`, wait: 600, strip: 12, every: 3000, fw: 640, out: `${outdir}/${name}.jpg` });
    const ends = evs(msgs, 'attempt.end');
    const res = msgs.find((m) => m.type === 'match_end');
    key.push({ name, feed: f, ms, attempt: s.event.data, attemptsSoFar: ends.filter((e) => e.event.at < ms).map((e) => `${e.event.data.entrantId}:${e.event.data.result}:${Math.round(e.event.data.score * 100)}%`), result: res && res.result && { winnerId: res.result.winnerId, how: res.result.how } });
  }
} else if (kind === 'decision') {
  for (let i = 0; i < N; i++) {
    const f = feeds[i % Math.min(feeds.length, 3)];
    const msgs = load(f);
    const opens = evs(msgs, 'decide.open');
    const o = opens[Math.floor(rand(rng) * opens.length)];
    const made = evs(msgs, 'decide.made').find((m) => m.event.data.index === o.event.data.index && m.event.data.k === o.event.data.k);
    const name = `decision_${letters[i]}`;
    const ms = o.event.at - 900;
    const later = msgs.filter((m2) => m2.type === 'event' && (m2.event.type === 'decide.open' || m2.event.type === 'attempt.end') && m2.event.at > o.event.at + 500)[0];
    const span = Math.min(14000, Math.max(6800, (later ? later.event.at : o.event.at + 9000) - ms + 400));
    const frames = span > 9600 ? 12 : 8;
    jobs.push({ name, feed: f, at: `ms:${ms}`, wait: 300, strip: frames, every: Math.round(span / frames), fw: 640, out: `${outdir}/${name}.jpg` });
    key.push({ name, feed: f, ms, k: o.event.data.k, attackId: o.event.data.attackId, chose: made && made.event.data.name, line: made && made.event.data.line });
  }
} else if (kind === 'tape') {
  for (let i = 0; i < Math.min(N, feeds.length); i++) {
    const f = feeds[i];
    const msgs = load(f);
    const res = msgs.find((m) => m.type === 'match_end');
    const match = msgs.find((m) => m.type === 'match');
    const name = `tape_${String(i + 1).padStart(2, '0')}`;
    jobs.push({ name, feed: f, at: 'phase:tape+9000', wait: 1200, out: `${outdir}/${name}.jpg` });
    key.push({ name, feed: f, winnerId: res && res.result && res.result.winnerId, how: res && res.result && res.result.how, winnerName: res && match.entrants.find((e) => e.id === res.result.winnerId).name, temper: res && res.result.temper, loadouts: res && res.result.loadouts });
  }
} else throw new Error(`unknown --kind ${kind}`);

fs.mkdirSync(path.resolve(ROOT, outdir), { recursive: true });
const jobsFile = path.join(ROOT, '.cache', `jobs_${kind}.json`);
fs.writeFileSync(jobsFile, JSON.stringify(jobs));
fs.mkdirSync(path.join(ROOT, '.cache', 'keys'), { recursive: true });
const keyFile = path.join(ROOT, '.cache', 'keys', `${outdir.replace(/[\/\\]/g, '_')}.json`);
fs.writeFileSync(keyFile, JSON.stringify(key, null, 1));
const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'shots.mjs'), '--jobs', jobsFile, ...(args.size ? ['--size', args.size] : [])], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 1 << 26 });
let errs = 0;
try { for (const j of JSON.parse(r.stdout)) errs += j.errors.length; } catch { console.error(r.stdout.slice(-400)); }
console.log(JSON.stringify({ kind, clips: jobs.map((j) => j.out), key: path.relative(ROOT, keyFile), consoleErrors: errs }, null, 1));
