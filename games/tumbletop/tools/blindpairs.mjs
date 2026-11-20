#!/usr/bin/env node
// Blind look test against the build this run started from. Builds label-stripped, shuffled pairs:
// captures/blind/pair-N-A.png and pair-N-B.png (one is today's original 40-bot build, one is the
// three-round show), and captures/blind/key.json. Grade critics' picks with:
//   node tools/blindpairs.mjs grade "1:A,2:B,..." ["1:B,..." ...]     (one string per critic)
import { copyFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { Rng } from '../sim/rng.js';

const OURS = ['comp/r0-s11/frame-03', 'comp/r0-s13/frame-06', 'comp/r0-s14/frame-05', 'comp/r0-s15/frame-08', 'comp/r1-s12/frame-04', 'comp/r1-s14/frame-07', 'comp/r2-s13/frame-03', 'comp/r2-s15/frame-06'];
const BASE = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `baseline/custom-0${i}`);
const dir = new URL('../captures/blind/', import.meta.url);

if (process.argv[2] === 'grade') {
  const key = JSON.parse(readFileSync(new URL('key.json', dir), 'utf8'));
  let wins = 0, n = 0;
  for (const s of process.argv.slice(3)) for (const part of s.split(',')) {
    const [i, pick] = part.trim().split(':');
    if (!key[i] || !pick) continue;
    n++; if (key[i].ours === pick.trim().toUpperCase()) wins++;
  }
  console.log(`the three-round show was picked ${wins} of ${n} times (${Math.round((100 * wins) / Math.max(1, n))}%); bar 50%`);
} else {
  mkdirSync(dir, { recursive: true });
  const rng = new Rng(20261119);
  const key = {};
  OURS.forEach((o, i) => {
    const oursIsA = rng.next() < 0.5;
    copyFileSync(new URL(`../captures/${o}.png`, import.meta.url), new URL(`pair-${i + 1}-${oursIsA ? 'A' : 'B'}.png`, dir));
    copyFileSync(new URL(`../captures/${BASE[i]}.png`, import.meta.url), new URL(`pair-${i + 1}-${oursIsA ? 'B' : 'A'}.png`, dir));
    key[i + 1] = { ours: oursIsA ? 'A' : 'B', oursFrom: o, baseFrom: BASE[i] };
  });
  writeFileSync(new URL('key.json', dir), JSON.stringify(key, null, 1));
  console.log('8 pairs written to captures/blind/');
}
