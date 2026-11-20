#!/usr/bin/env node
// The brief's comprehension test, per round: builds the clips and grades critics' answers.
//   node tools/comprehension.mjs capture            15 clips (5 shows x 3 rounds), 12 stills each, 2.5 s apart
//   node tools/comprehension.mjs truth              the answer key from the capture manifests
//   node tools/comprehension.mjs grade answers.json grade { "<clip>": { go_through, pick, pick_place_a, pick_place_b, edge_a: [holder, firstOut], edge_b: [...] } }
// Frames asked about: a = frame-04, b = frame-08. A clip passes when the number that go through and
// the pick are right and at least three of the four place answers (two edges, two pick places) are right.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { ROSTER } from '../sim/index.js';

const SEEDS = [11, 12, 13, 14, 15];
const PICKPLACE = [[6, 9, 3, 11, 8], [3, 5, 2, 6, 4], [2, 3, 1, 4, 2]];
const INTO = [3, 3, 2];   // seconds into the race at the first still
const EVERY = [2.2, 2.2, 1.8];
const dir = (r, s) => `captures/comp/r${r}-s${s}`;
const name = (id) => ROSTER.find((g) => g.id === id)?.name ?? id;
const cmd = process.argv[2];

function truth() {
  const key = {};
  for (let r = 0; r < 3; r++) for (const s of SEEDS) {
    const f = `${dir(r, s)}/manifest.json`;
    if (!existsSync(f)) continue;
    const m = JSON.parse(readFileSync(f, 'utf8'));
    const at = (i) => { const fr = m.frames[i]; const Q = fr.qualify; return { edge: Q === 1 ? [name(fr.places[0]), name(fr.places[1])] : [name(fr.places[Q - 1]), name(fr.places[Q])], pickPlace: fr.places.indexOf(m.args.pick) + 1, phase: fr.phase }; };
    key[`r${r}-s${s}`] = { go_through: m.frames[4].qualify, pick: name(m.args.pick), a: at(4), b: at(8) };
  }
  return key;
}

if (cmd === 'capture') {
  for (let r = 0; r < 3; r++) SEEDS.forEach((s, i) => {
    execFileSync(process.execPath, ['tools/capture.mjs', '--seed', String(s), '--bets', '3', '--round', String(r), '--into', String(INTO[r]), '--pickplace', String(PICKPLACE[r][i]), '--frames', '12', '--every', String(EVERY[r]), '--out', dir(r, s)], { stdio: 'ignore' });
    console.log(`captured ${dir(r, s)}`);
  });
} else if (cmd === 'truth') {
  console.log(JSON.stringify(truth(), null, 1));
} else if (cmd === 'grade') {
  const ans = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  const key = truth();
  const same = (x, y) => String(x ?? '').trim().toLowerCase() === String(y ?? '').trim().toLowerCase();
  const pass = [0, 0, 0], total = [0, 0, 0];
  for (const [clip, k] of Object.entries(key)) {
    const a = ans[clip];
    const r = Number(clip[1]);
    if (!a) continue;
    total[r]++;
    const n = Number(a.go_through) === k.go_through;
    const p = same(a.pick, k.pick);
    const parts = [
      same(a.edge_a?.[0], k.a.edge[0]) && same(a.edge_a?.[1], k.a.edge[1]),
      same(a.edge_b?.[0], k.b.edge[0]) && same(a.edge_b?.[1], k.b.edge[1]),
      Number(a.pick_place_a) === k.a.pickPlace, Number(a.pick_place_b) === k.b.pickPlace,
    ];
    const ok = n && p && parts.filter(Boolean).length >= 3;
    if (ok) pass[r]++;
    console.log(`${clip}  ${ok ? 'PASS' : 'FAIL'}  through ${n ? 'ok' : `x (${a.go_through} vs ${k.go_through})`}  pick ${p ? 'ok' : `x (${a.pick} vs ${k.pick})`}  edge a ${parts[0] ? 'ok' : `x (${a.edge_a} vs ${k.a.edge})`}  edge b ${parts[1] ? 'ok' : `x (${a.edge_b} vs ${k.b.edge})`}  pick place ${parts[2] ? 'ok' : `x (${a.pick_place_a} vs ${k.a.pickPlace})`} / ${parts[3] ? 'ok' : `x (${a.pick_place_b} vs ${k.b.pickPlace})`}`);
  }
  console.log(`\nRound One ${pass[0]} of ${total[0]}   Round Two ${pass[1]} of ${total[1]}   The Final ${pass[2]} of ${total[2]}   (bar: 4 of 5 each)`);
} else {
  console.log('usage: node tools/comprehension.mjs capture | truth | grade answers.json');
}
