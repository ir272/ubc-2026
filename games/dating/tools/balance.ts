// Balance and legibility on the scripted brain: N episodes without sleeping (show/FORMAT2.md targets).
//   node tools/balance.ts [--n 2000] [--seed <s>]
// Prints win rate per suitor over the episodes it appears in (flags outside 15% to 35%), cut-first
// rate, win rate by star, how often each card decided a cut, how often the hidden cards were hit, and
// the legibility numbers a bettor reads off the screen:
// - cuts where the cut suitor had the (joint) lowest visible mark that round      (target 100%)
// - picks where the winner's one-on-one mark was at least the loser's            (target 100%)
// - episodes where the suitor who spoke last in the one on one won              (target near 50%)
// - the mark mix over all marks                                                  (target 25 / 45 / 30)
// - spoken reactions per round (the rest get the mark alone)
// Targets: every suitor wins 15% to 35%; each hidden card is hit by somebody in at least 75% of
// episodes; the winner hit a card in at least 80%.

import { createSession } from '../show/session.ts';
import type { Transcript } from '../show/episode.ts';
import { args, recordingHub } from './common.ts';

const a = args();
const n = Math.max(1, Number(a.n) || 2000);
const session = await createSession({ brains: 'scripted', memory: 'fresh', usedPath: null, seed: a.seed, waitCapMs: Infinity, log: () => {} });

const app: Record<string, number> = {};
const wins: Record<string, number> = {};
const cutFirst: Record<string, number> = {};
const byStar: Record<string, { eps: number; wins: Record<string, number>; app: Record<string, number> }> = {};
const cardDrawn: Record<string, number> = {};
const cardDecided: Record<string, number> = {};
const names: Record<string, string> = {};
let ties = 0;
let hit1 = 0, hit2 = 0, hitBoth = 0, hitNone = 0, winHitAny = 0, winHitHidden = 0;
const ownersHit: number[] = [0, 0, 0, 0];
const ownersN: number[] = [0, 0, 0, 0];
const marks: Record<string, number> = {};
const winOpen: Record<string, number[]> = { A: [], B: [], C: [] };
let pickTies = 0;
let dur = 0;
const durs: number[] = [];
// legibility
let cuts = 0, cutLowest = 0, cutHint = 0, cutHook = 0, picks = 0, pickByDates = 0, lastWon = 0;
const spoken: Record<string, number[]> = { round1: [], round2: [] };
let reads = 0, readsRight = 0, paired = 0, spokenTotal = 0, snapFaceUp = 0;

function legibility(tx: Transcript) {
  for (const c of tx.cuts) {
    cuts++;
    const min = Math.min(...Object.values(c.roundMarks));
    if (c.roundMarks[c.id] === min) cutLowest++;
    if (c.hintCard) cutHint++;
    else if (c.hook) cutHook++;
  }
  picks++;
  const oo = tx.pick.oneOnOne;
  if ((oo[tx.pick.winner] ?? 0) >= (oo[tx.pick.loser] ?? 0)) pickByDates++;
  if (tx.pick.winner === tx.pick.last) lastWon++;
  for (const r of ['round1', 'round2']) spoken[r]!.push(tx.lines.filter((l) => l.event === 'reaction' && l.scene === r && l.spoken).length);
  for (const g of tx.guesses) {
    reads++;
    if (g.right) readsRight++;
  }
  for (const l of tx.lines) if (l.event === 'reaction' && l.spoken && l.text) (spokenTotal++, l.paired && paired++);
  if (tx.scored.some((s) => s.round === 0 && s.hits.length)) snapFaceUp++;
}

const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const { hub } = recordingHub({ speed: Infinity });
  const tx = await session.runOne(hub.newShow());
  dur += tx.durationMs;
  durs.push(tx.durationMs);
  const st = (byStar[tx.star.name] ??= { eps: 0, wins: {}, app: {} });
  st.eps++;
  for (const s of tx.suitors) {
    names[s.id] = s.name;
    app[s.id] = (app[s.id] ?? 0) + 1;
    st.app[s.id] = (st.app[s.id] ?? 0) + 1;
  }
  wins[tx.pick.winner] = (wins[tx.pick.winner] ?? 0) + 1;
  st.wins[tx.pick.winner] = (st.wins[tx.pick.winner] ?? 0) + 1;
  const first = tx.cuts.find((c) => c.round === 1);
  if (first) cutFirst[first.id] = (cutFirst[first.id] ?? 0) + 1;
  for (const c of tx.cuts) {
    if (c.tie.length) ties++;
    for (const card of tx.draw.cards) cardDrawn[card.id] = (cardDrawn[card.id] ?? 0) + 1;
    for (const d of c.deciding) cardDecided[d] = (cardDecided[d] ?? 0) + 1;
  }
  if (tx.pick.tie.length) pickTies++;
  const [, on, off] = tx.draw.cards.map((c) => c.id) as [string, string, string];
  const h1 = tx.scored.some((x) => x.hits.includes(on));
  const h2 = tx.scored.some((x) => x.hits.includes(off));
  if (h1) hit1++;
  if (h2) hit2++;
  if (h1 && h2) hitBoth++;
  if (!h1 && !h2) hitNone++;
  const mine = tx.scored.filter((x) => x.who === tx.pick.winner);
  if (mine.some((x) => x.hits.length)) winHitAny++;
  if (mine.some((x) => x.hits.includes(on))) winHitHidden++;
  for (const id of [on, off]) {
    const k = Math.min(3, (tx.draw.owners[id] ?? []).length);
    ownersN[k]!++;
    if (tx.scored.some((x) => x.hits.includes(id))) ownersHit[k]!++;
  }
  for (const x of tx.scored) marks[x.mark] = (marks[x.mark] ?? 0) + 1;
  for (const w of tx.windows) winOpen[w.tag]!.push(w.lockAt - w.openAt);
  legibility(tx);
  if ((i + 1) % 500 === 0) process.stderr.write(`  ${i + 1}/${n}\n`);
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);
const mean = (xs: number[]) => xs.reduce((p, q) => p + q, 0) / Math.max(1, xs.length);
const sec = (x: number) => (x / 1000).toFixed(1);
console.log(`${n} scripted episodes in ${((Date.now() - t0) / 1000).toFixed(1)} s; length ${sec(Math.min(...durs))} / ${sec(dur / n)} / ${sec(Math.max(...durs))} s (min / mean / max); cut ties ${pct(ties / (2 * n))}; pick ties ${pct(pickTies / n)}\n`);
console.log('suitor          eps    win   cut1st');
const flagged: string[] = [];
for (const id of Object.keys(app).sort((x, y) => (wins[y] ?? 0) / app[y]! - (wins[x] ?? 0) / app[x]!)) {
  const w = (wins[id] ?? 0) / app[id]!;
  const flag = w < 0.15 || w > 0.35 ? '  <-- outside 15-35%' : '';
  if (flag) flagged.push(names[id]!);
  console.log(`${names[id]!.padEnd(14)} ${String(app[id]).padStart(5)}  ${pct(w)}  ${pct((cutFirst[id] ?? 0) / app[id]!)}${flag}`);
}
const ids = Object.keys(app);
console.log(`\nwin rate by star (rows: star; columns: ${ids.map((i) => names[i]).join(', ')})`);
for (const [star, s] of Object.entries(byStar)) {
  console.log(`${star.padEnd(12)} ${String(s.eps).padStart(5)}  ${ids.map((i) => pct((s.wins[i] ?? 0) / Math.max(1, s.app[i] ?? 0))).join(' ')}`);
}
console.log('\ncard decided a cut (share of cuts where it was in the type)');
for (const id of Object.keys(cardDrawn).sort((x, y) => (cardDecided[y] ?? 0) / cardDrawn[y]! - (cardDecided[x] ?? 0) / cardDrawn[x]!)) {
  console.log(`${id.padEnd(16)} ${pct((cardDecided[id] ?? 0) / cardDrawn[id]!)}  (${cardDecided[id] ?? 0}/${cardDrawn[id]})`);
}
const ok = (v: boolean) => (v ? 'ok ' : 'OFF');
console.log('\nhidden cards hit by somebody (share of episodes; target at least 75% each)');
console.log(`${ok(hit1 / n >= 0.75)} slot 1 (hidden turn-on) ${pct(hit1 / n)}   ${ok(hit2 / n >= 0.75)} slot 2 (dealbreaker) ${pct(hit2 / n)}   both ${pct(hitBoth / n)}   neither ${pct(hitNone / n)}`);
console.log(`${ok(winHitAny / n >= 0.8)} winner hit any card ${pct(winHitAny / n)} (target at least 80%)   winner hit the hidden turn-on ${pct(winHitHidden / n)}`);
console.log(`hit rate by natural owners on stage: ${[1, 2, 3].map((k) => `${k}: ${pct(ownersHit[k]! / Math.max(1, ownersN[k]!))} of ${ownersN[k]}`).join('   ')}${ownersN[0] ? `   0: ${pct(ownersHit[0]! / ownersN[0]!)} of ${ownersN[0]}` : ''}`);
const mt = Object.values(marks).reduce((p, q) => p + q, 0);
console.log('\nlegibility (what a bettor reads off the screen)');
console.log(`${ok(cutLowest === cuts)} cuts where the cut suitor had the (joint) lowest visible mark that round   ${pct(cutLowest / cuts)}   (target 100%)`);
console.log(`${ok(pickByDates === picks)} picks where the winner's one-on-one mark was at least the loser's       ${pct(pickByDates / picks)}   (target 100%)`);
console.log(`${ok(Math.abs(lastWon / picks - 0.5) <= 0.1)} episodes where the last speaker in the one on one won                  ${pct(lastWon / picks)}   (target near 50%)`);
console.log(`mark mix: ${['charmed', 'unsure', 'cringing'].map((m) => `${m} ${pct((marks[m] ?? 0) / mt)}`).join('  ')}   (target 25 / 45 / 30)`);
console.log(`spoken reactions per round: round one ${mean(spoken.round1!).toFixed(2)} of 4, round two ${mean(spoken.round2!).toFixed(2)} of 3; paired replies ${pct(paired / Math.max(1, spokenTotal))} of spoken reactions`);
console.log(`cut reasons: hint at a hidden card ${pct(cutHint / cuts)}, quoting the suitor's hook ${pct(cutHook / cuts)}, v1 reason ${pct((cuts - cutHint - cutHook) / cuts)}`);
console.log(`booth reads: ${(reads / n).toFixed(2)} per episode, right ${pct(readsRight / Math.max(1, reads))}; a walk-on opener played the face-up card ${pct(snapFaceUp / n)}`);
console.log(`windows open (s, min / mean / max): ${Object.entries(winOpen).map(([t, xs]) => `${t} ${sec(Math.min(...xs))} / ${sec(mean(xs))} / ${sec(Math.max(...xs))}`).join('   ')}`);
console.log(flagged.length ? `\nFLAGGED: ${flagged.join(', ')}` : '\nall suitors inside 15-35%');
process.exit(0);
