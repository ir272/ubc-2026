// N text episodes with no sleeping at all. One readable transcript per episode.
//   node tools/text.ts [--n 3] [--brains scripted|model] [--seed <s>] [--out trials/<name>]
// Writes <out>/ep-XX.md (stage directions, marks, hidden hits in brackets, cards, cut reasons; v2: the
// mark-only reactions, which reactions are the star's paired reply [reply], the bottom two, the booth
// reads with right or wrong, the replays and the reads settled at each reveal),
// <out>/ep-XX.json (the full transcript) and <out>/summary.json (the batch: winners, cards, hits per
// slot, mark mix per star, sources, word-limit violations, durations, window lengths, brain stats, and
// the legibility numbers: cuts on the lowest visible mark, picks that follow the dates, last speaker
// in the one on one won, spoken reactions per round, paired replies, reads right),
// and prints a summary table. With a brain that exposes stats() (the model brain) every line carries
// its source: {b} bank, {c} chosen (the model picked a bank line), {w} written by the model, {f} fallback.
// Memory is a read-only copy that carries across the N episodes; .cache/memory.json is never written.

import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../channel.ts';
import { createSession } from '../show/session.ts';
import { ROOT } from '../show/paths.ts';
import type { Transcript } from '../show/episode.ts';
import { args, nameOf, recordingHub, sources, wordViolations } from './common.ts';

loadEnv();
const a = args();
const n = Math.max(1, Number(a.n) || 3);
const brains = a.brains === 'model' ? 'model' : 'scripted';
const seed = a.seed;
const out = path.resolve(ROOT, a.out ?? `trials/text-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
fs.mkdirSync(out, { recursive: true });

const session = await createSession({
  brains,
  memory: 'readonly',
  usedPath: null,
  seed,
  waitCapMs: Infinity, // text mode: wait for every call (each has its own 6 s real timeout)
  budgetUsd: Number(process.env.DATING_BUDGET_USD) || 1.5,
  log: (s) => console.log(`  log: ${s}`),
});

const SCENE_TITLE: Record<string, string> = {
  title: 'Title',
  walkon: 'Walk-on (window A open, sealed)',
  round1: 'Round one (A locked)',
  booth1: 'The booth (window B open)',
  round2: 'Round two: the twist (B locked)',
  booth2: 'The booth (window C open)',
  oneonone: 'One on one (C locked)',
  pick: 'The pick',
  reveal: 'The reveal',
  result: 'Result (all windows settle)',
};

const brainStats = (): unknown => {
  const b = session.brains.brain as { stats?: () => unknown };
  return typeof b.stats === 'function' ? b.stats() : null;
};
const showSources = brainStats() !== null;
const VIA_SHORT: Record<string, string> = { bank: 'b', chosen: 'c', written: 'w', fallback: 'f' };
const viaOf = (l: { via?: string; source: string }) => l.via ?? (l.source === 'model' ? 'written' : l.source);

function markdown(tx: Transcript): string {
  const nm = (id: string) => (id === 'ex' ? 'the ex' : nameOf(tx, id));
  const label = (id: string) => session.decks.cards.find((c) => c.id === id)?.label ?? id;
  const L: string[] = [];
  L.push(`# Episode ${tx.episode}: ${tx.star.name}`, '');
  L.push(`Suitors, left to right: ${tx.suitors.map((s) => s.name).join(', ')}.`);
  L.push(`Cards: face up turn-on **${tx.draw.cards[0]!.label}**; hidden turn-on **${tx.draw.cards[1]!.label}**; hidden dealbreaker **${tx.draw.cards[2]!.label}**.`);
  L.push(`Twist: **${tx.draw.twist.label}** (${tx.draw.twist.format}): ${tx.draw.twist.rule}`);
  L.push(`Question: ${tx.question.theme}`);
  L.push(`Brain: ${tx.brain}. Sealed from ${tx.sealedSource}.`);
  L.push(`Natural owners (top tags, public before window A): ${Object.entries(tx.draw.owners).map(([c, ids]) => `${label(c)}: ${ids.map(nm).join(', ')}`).join('; ')}.`);
  if (showSources) L.push('Sources: {b} bank, {c} chosen by the model from the bank, {w} written by the model, {f} fallback.');
  L.push('');
  let scene = '';
  for (const l of tx.lines) {
    if (l.scene !== scene) {
      scene = l.scene;
      L.push('', `## ${SCENE_TITLE[scene] ?? scene}`, '');
      if (scene === 'round2') L.push(`*The twist card turns: ${tx.draw.twist.label}, "${tx.draw.twist.rule}"*`, '');
      if (scene === 'booth1' || scene === 'booth2') {
        const st = tx.standings.find((s) => s.after === (scene === 'booth1' ? 'round1' : 'round2'));
        if (st) L.push(`*Standing: ${Object.entries(st.standing).map(([k, v]) => `${nm(k)} ${v}`).join(', ')}*`, '');
        const c = tx.cuts.find((x) => x.round === (scene === 'booth1' ? 1 : 2));
        if (c) {
          const rm = Object.entries(c.roundMarks).map(([k, v]) => `${nm(k)} ${v > 0 ? '+' : ''}${v}`).join(', ');
          L.push(`*Cut reason: ${c.reason}${c.tie.length ? `; tie between ${c.tie.map(nm).join(', ')}` : ''}${c.deciding.length ? `; decided by ${c.deciding.map(label).join(', ')}` : ''}. Marks this round: ${rm}. The star's reason ${c.hintCard ? `hints at ${label(c.hintCard)}` : c.hook ? `quotes "${c.hook}"` : 'is a v1 line'}.*`, '');
        }
      }
      if (scene === 'oneonone') L.push(`*${nm(tx.pick.first)} leads on standing and goes first; ${nm(tx.pick.last)} goes second.*`, '');
      if (scene === 'pick') L.push(`*Pick order: one-on-one mark ${nm(tx.pick.first)} ${tx.pick.oneOnOne[tx.pick.first]}, ${nm(tx.pick.last)} ${tx.pick.oneOnOne[tx.pick.last]}; then standing.*`, '');
    }
    const via = viaOf(l);
    const src = showSources ? ` {${VIA_SHORT[via] ?? via}${l.forced ? ', forced' : ''}}` : l.source === 'bank' ? '' : ` _(${l.source}${l.forced ? ', forced' : ''})_`;
    const fixed = l.markWas ? `, brain said ${l.markWas}` : '';
    const hits = l.hits?.length ? ` [hits: ${l.hits.map(label).join(', ')}]` : '';
    const lim = l.words > l.maxWords ? ` **OVER ${l.words}/${l.maxWords}**` : '';
    switch (l.event) {
      case 'reaction':
        if (l.spoken === false) L.push(`*${l.name} to ${nm(l.to!)}: the mark alone, ${l.mark}${fixed}*${hits}`);
        else L.push(`**${l.name}** to ${nm(l.to!)}: ${l.text} *(${l.mark}${fixed})*${l.paired ? ' [reply]' : ''}${hits}${src}${lim}`);
        break;
      case 'confession': {
        const read = l.guess ? ` [read: ${l.guess.kind === 'on' ? 'likes' : 'cannot stand'} ${label(l.guess.id)}, ${l.guess.right ? 'RIGHT' : 'wrong'}]` : '';
        L.push(`> **${l.name}** (booth${l.about ? `, about ${nm(l.about)}` : ''}): ${l.text}${read}${src}${lim}`);
        break;
      }
      case 'bottom':
        L.push(`*The bottom two light up: ${l.pair!.map(nm).join(' and ')}.* **${l.name}**: ${l.text}${src}${lim}`, `*Three seconds of silence.*`);
        break;
      case 'replay': {
        const r = tx.reveals.find((x) => x.slot === l.slot)?.replays.find((x) => x.who === l.who && x.text === l.text);
        L.push(`  *Replay (${l.slot === 1 ? 'hidden turn-on' : 'dealbreaker'}), cut to ${l.name}:* "${l.text}"${r && !r.hit ? ' (their nearest line, no hit)' : ''}`);
        break;
      }
      case 'cut':
        L.push(`*${l.name} cuts ${nm(l.to!)}. The light goes out.*`, `**${l.name}**: ${l.text}${src}${lim}`);
        break;
      case 'pick':
        L.push(`*Hold. Four seconds.*`, `**${l.name}** picks ${nm(l.to!)}: ${l.text}${src}${lim}`);
        break;
      case 'reveal': {
        const slot = l.scene === 'pick' ? 1 : 2;
        const rv = tx.reveals.find((x) => x.slot === slot);
        const reads = rv?.guesses.length ? ` *(reads: ${rv.guesses.map((g) => `${nm(g.who)} ${g.right ? 'right' : 'wrong'}`).join(', ')})*` : '';
        L.push(`*A card turns: ${slot === 1 ? 'hidden turn-on' : 'dealbreaker'} ${label(rv?.card ?? '')}.* **${l.name}**: ${l.text}${src}${lim}${reads}`);
        break;
      }
      default: {
        const to = l.to && l.to !== tx.star.id ? ` (to ${nm(l.to)})` : '';
        L.push(`**${l.name}**${to} [${l.kind}]: ${l.text}${src}${lim}`);
      }
    }
  }
  L.push('', '## Outcome', '');
  L.push(`Winner: **${nm(tx.pick.winner)}** over ${nm(tx.pick.loser)}. ${tx.pick.reason}${tx.pick.tie.length ? ' (tie broken by the star)' : ''}`);
  for (const s of tx.standings) L.push(`- after ${s.after}: ${Object.entries(s.standing).map(([k, v]) => `${nm(k)} ${v}`).join(', ')}`);
  if (tx.rejected.length) {
    L.push('', '## Rejected before air', '');
    for (const r of tx.rejected) L.push(`- ${nm(r.who)} ${r.kind}: ${r.reason}${r.text ? `: "${r.text}"` : ''}`);
  }
  L.push('', `Duration at speed 1: ${Math.round(tx.durationMs / 1000)} s.`);
  return L.join('\n') + '\n';
}

const rows: string[][] = [['ep', 'star', 'winner', 'cards (up / on / off)', 'twist', 'hit on/off', 'over', 'fallback', 'model', 'rejects']];
const all: Transcript[] = [];
for (let i = 1; i <= n; i++) {
  const { hub } = recordingHub({ speed: Infinity, seed: seed ? `${seed}:${i}` : undefined });
  const tx = await session.runOne(hub.newShow());
  const id = String(i).padStart(2, '0');
  fs.writeFileSync(path.join(out, `ep-${id}.md`), markdown(tx));
  fs.writeFileSync(path.join(out, `ep-${id}.json`), JSON.stringify(tx, null, 2));
  all.push(tx);
  const src = sources(tx);
  const hitBy = (slot: number) => tx.scored.some((x) => x.hits.includes(tx.draw.cards[slot]!.id));
  rows.push([
    id,
    tx.star.name,
    nameOf(tx, tx.pick.winner),
    tx.draw.cards.map((c) => c.id).join(' / '),
    tx.draw.twist.id,
    `${hitBy(1) ? 'y' : 'n'}/${hitBy(2) ? 'y' : 'n'}`,
    String(wordViolations(tx)),
    String(src.fallback),
    String(src.model),
    String(tx.rejected.length),
  ]);
}
// ---- summary.json: the batch at a glance ----------------------------------------------------
const count = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
const share = (k: number) => Math.round((k / Math.max(1, all.length)) * 1000) / 1000;
const hit = (tx: Transcript, slot: number) => tx.scored.filter((x) => x.hits.includes(tx.draw.cards[slot]!.id)).map((x) => nameOf(tx, x.who));
const marksByStar: Record<string, Record<string, number>> = {};
const fixedByStar: Record<string, number> = {};
for (const tx of all) {
  const m = (marksByStar[tx.star.name] ??= { charmed: 0, unsure: 0, cringing: 0 });
  for (const l of tx.lines) if (l.event === 'reaction' && l.mark) m[l.mark] = (m[l.mark] ?? 0) + 1;
  fixedByStar[tx.star.name] = (fixedByStar[tx.star.name] ?? 0) + tx.lines.filter((l) => l.markWas).length;
}
const durations = all.map((t) => t.durationMs);
// legibility (show/FORMAT2.md): what a bettor reads off the screen
const cutsAll = all.flatMap((t) => t.cuts);
const spokenIn = (t: Transcript, r: string) => t.lines.filter((l) => l.event === 'reaction' && l.scene === r && l.spoken).length;
const spokenLines = all.flatMap((t) => t.lines.filter((l) => l.event === 'reaction' && l.spoken && l.text));
const reads = all.flatMap((t) => t.guesses);
const legibility = {
  cutOnLowestMark: Math.round((cutsAll.filter((c) => c.roundMarks[c.id] === Math.min(...Object.values(c.roundMarks))).length / Math.max(1, cutsAll.length)) * 1000) / 1000,
  pickFollowsDates: share(all.filter((t) => (t.pick.oneOnOne[t.pick.winner] ?? 0) >= (t.pick.oneOnOne[t.pick.loser] ?? 0)).length),
  lastSpeakerWon: share(all.filter((t) => t.pick.winner === t.pick.last).length),
  spokenPerRound: { round1: all.reduce((a, t) => a + spokenIn(t, 'round1'), 0) / Math.max(1, all.length), round2: all.reduce((a, t) => a + spokenIn(t, 'round2'), 0) / Math.max(1, all.length) },
  pairedReplies: Math.round((spokenLines.filter((l) => l.paired).length / Math.max(1, spokenLines.length)) * 1000) / 1000,
  cutReasons: { hint: cutsAll.filter((c) => c.hintCard).length, hook: cutsAll.filter((c) => !c.hintCard && c.hook).length, v1: cutsAll.filter((c) => !c.hintCard && !c.hook).length },
  reads: { n: reads.length, right: reads.filter((g) => g.right).length },
  markMix: (() => {
    const m: Record<string, number> = { charmed: 0, unsure: 0, cringing: 0 };
    for (const t of all) for (const x of t.scored) m[x.mark] = (m[x.mark] ?? 0) + 1;
    const tot = Object.values(m).reduce((a, b) => a + b, 0) || 1;
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round((v / tot) * 1000) / 1000]));
  })(),
};
const summary = {
  n: all.length,
  brain: session.brains.kind,
  seed: seed ?? null,
  winners: count(all.map((t) => nameOf(t, t.pick.winner))),
  cards: {
    faceUp: count(all.map((t) => t.draw.cards[0]!.id)),
    hiddenOn: count(all.map((t) => t.draw.cards[1]!.id)),
    dealbreaker: count(all.map((t) => t.draw.cards[2]!.id)),
    twists: count(all.map((t) => t.draw.twist.id)),
  },
  hits: {
    slot1: share(all.filter((t) => hit(t, 1).length).length),
    slot2: share(all.filter((t) => hit(t, 2).length).length),
    both: share(all.filter((t) => hit(t, 1).length && hit(t, 2).length).length),
    neither: share(all.filter((t) => !hit(t, 1).length && !hit(t, 2).length).length),
    winnerHitAny: share(all.filter((t) => t.scored.some((x) => x.who === t.pick.winner && x.hits.length)).length),
  },
  legibility,
  marksByStar,
  marksFixedByCoherence: fixedByStar,
  sources: count(all.flatMap((t) => t.lines.map((l) => viaOf(l)))),
  wordLimitViolations: all.reduce((a, t) => a + wordViolations(t), 0),
  rejected: all.reduce((a, t) => a + t.rejected.length, 0),
  late: all.reduce((a, t) => a + t.late, 0),
  durationMs: { mean: Math.round(durations.reduce((a, b) => a + b, 0) / Math.max(1, all.length)), min: Math.min(...durations), max: Math.max(...durations) },
  windowsOpenMs: Object.fromEntries(['A', 'B', 'C'].map((tag) => [tag, all.map((t) => { const w = t.windows.find((x) => x.tag === tag); return w ? w.lockAt - w.openAt : null; })])),
  episodes: all.map((t, i) => ({
    file: `ep-${String(i + 1).padStart(2, '0')}.md`,
    star: t.star.name,
    winner: nameOf(t, t.pick.winner),
    loser: nameOf(t, t.pick.loser),
    cards: t.draw.cards.map((c) => c.id),
    twist: t.draw.twist.id,
    hits: { slot1: hit(t, 1), slot2: hit(t, 2) },
    reveals: t.reveals.map((r) => (r.quote ? `${nameOf(t, r.quote.who)}: ${r.quote.text}` : null)),
    durationMs: t.durationMs,
  })),
  brainStats: brainStats(),
};
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));

const widths = rows[0]!.map((_, c) => Math.max(...rows.map((r) => r[c]!.length)));
for (const r of rows) console.log(r.map((x, c) => x.padEnd(widths[c]!)).join('  '));
console.log(`\nhidden cards hit: slot 1 ${summary.hits.slot1}, slot 2 ${summary.hits.slot2}; sources ${JSON.stringify(summary.sources)}; word-limit violations ${summary.wordLimitViolations}`);
console.log(`legibility ${JSON.stringify(legibility)}`);
console.log(`wrote ${n} transcripts and summary.json to ${path.relative(process.cwd(), out) || out}`);
process.exit(0);
