#!/usr/bin/env node
// Append an event to progress/log.jsonl (read by progress/index.html).
//   node tools/progress.mjs --piece <id> --round <n> --verdict won|lost|info --gap "<text>"
//        [--pair <png path>] [--metric key=value ...]
// Pieces: art, arena, tells, feedback, stagger_death, agents, sound, ui, perf
// A --pair outside the project is copied into progress/pairs/ so the page can show it.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, ROOT } from './_lib.mjs';
import { PIECES } from '../src/core/constants.js';

const args = parseArgs();
const fail = (m) => { console.error(m); console.error('usage: node tools/progress.mjs --piece <id> --round <n> --verdict won|lost|info --gap "<text>" [--pair <png>] [--metric k=v ...]'); process.exit(2); };

if (!PIECES.includes(args.piece)) fail(`--piece must be one of: ${PIECES.join(', ')}`);
const round = parseInt(args.round, 10);
if (!Number.isFinite(round) || round < 0) fail('--round must be a number >= 0');
if (!['won', 'lost', 'info'].includes(args.verdict)) fail('--verdict must be won|lost|info');

const ev = { ts: new Date().toISOString(), piece: args.piece, round, verdict: args.verdict, gap: typeof args.gap === 'string' ? args.gap : '' };

if (args.pair && args.pair !== true) {
  const abs = path.resolve(args.pair);
  if (!fs.existsSync(abs)) fail(`pair image not found: ${args.pair}`);
  let rel = path.relative(ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some((s) => s.startsWith('.'))) {
    const dest = path.join(ROOT, 'progress', 'pairs', `${args.piece}_r${round}_${Date.now()}${path.extname(abs) || '.png'}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
    rel = path.relative(ROOT, dest);
  }
  ev.pair = rel.split(path.sep).join('/');
}

const metrics = [].concat(args.metric || []).filter((m) => typeof m === 'string');
if (metrics.length) {
  ev.metrics = {};
  for (const m of metrics) {
    const i = m.indexOf('=');
    if (i < 1) fail(`bad --metric "${m}" (want key=value)`);
    const k = m.slice(0, i), v = m.slice(i + 1);
    ev.metrics[k] = v !== '' && !isNaN(+v) ? +v : v;
  }
}

const file = path.join(ROOT, 'progress', 'log.jsonl');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.appendFileSync(file, JSON.stringify(ev) + '\n');
console.log(JSON.stringify(ev));
