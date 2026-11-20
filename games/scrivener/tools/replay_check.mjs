#!/usr/bin/env node
// Verifies the public replay: for every attempt in recorded feeds, simulate() run from the
// window's seed and the moves published in the feed must give the result the feed announced.
//   node tools/replay_check.mjs            all feeds in .cache/feeds
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_lib.mjs';
import { simulate } from '../src/show/replay.js';

const dir = path.join(ROOT, '.cache', 'feeds');
let attempts = 0, same = 0, seedsFromWindows = 0, feeds = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
  const msgs = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const ev = (t) => msgs.filter((m) => m.type === 'event' && m.event.type === t).map((m) => m.event.data);
  // a go's seed is eight hex digits of a locked window's seed: the first eight in feeds recorded before
  // 2026-11-20 (one window per go), the go's own slice of the match window's seed since
  const seeds = new Set(msgs.filter((m) => m.type === 'window_locked' && m.seed).flatMap((m) => Array.from({ length: 8 }, (_, i) => m.seed.slice(i * 8, i * 8 + 8)).filter((h) => h.length === 8).map((h) => parseInt(h, 16) >>> 0)));
  const ends = ev('attempt.end');
  feeds += 1;
  for (const s of ev('attempt.start')) {
    const e = ends.find((x) => x.index === s.index);
    if (!e) continue;
    attempts += 1;
    if (seeds.has(s.seed)) seedsFromWindows += 1;
    const r = simulate({ seed: s.seed, entrants: [{ id: s.entrantId }], options: { entrantId: s.entrantId, loadout: s.loadout, temper: s.temper, handicap: s.handicap, slots: e.slots } }).result;
    if (r.result === e.result && r.score === e.score && r.strokes === e.strokes) same += 1;
    else console.log('mismatch', f, s.index, r.result, r.score, e.result, e.score);
  }
}
console.log(JSON.stringify({ feeds, attempts, identical: same, seedIsTheWindowsSeed: seedsFromWindows, pass: attempts > 0 && same === attempts && seedsFromWindows === attempts }));
