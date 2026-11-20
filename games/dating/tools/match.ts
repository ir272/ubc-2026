// One episode headless through the fake Show at high speed. Prints a compact result, the duration
// and every silence over 2.5 s (the bottom-two silence and the pick hold are inside their events'
// ms, so they never show as gaps; the held wide shot that ends a window is a beat).
//   node tools/match.ts [--seed <hex>] [--speed 200] [--brains scripted|model] [--full]
// --full pads every line to its word limit (worst-case length; target 5:40 to 6:00).
// Memory and the line LRU are read but never written.

import { loadEnv } from '../channel.ts';
import { createSession } from '../show/session.ts';
import { args, fmtMs, gaps, nameOf, recordingHub, sources, wordViolations } from './common.ts';
import { isHeldTail } from '../show/timing.ts';

loadEnv();
const a = args();
const brains = a.brains === 'model' ? 'model' : 'scripted';
const speed = Number(a.speed) > 0 ? Number(a.speed) : brains === 'model' ? 4 : 200;
const seed = a.seed;

const session = await createSession({ brains, memory: 'readonly', usedPath: null, seed, budgetUsd: Number(process.env.DATING_BUDGET_USD) || 1.5, log: (s) => console.log(`  log: ${s}`) });
if (a.full) {
  // worst case for pacing: every line padded to its word limit
  const inner = session.brains.brain;
  const pad = (t: string, max: number) => {
    const w = t.split(/\s+/).filter(Boolean);
    while (w.length < max) w.push('la');
    return w.slice(0, max).join(' ');
  };
  session.brains.brain = {
    kind: inner.kind,
    speak: async (r) => {
      const s = await inner.speak(r);
      return { ...s, text: pad(s.text, r.maxWords) };
    },
    react: async (r) => {
      const s = await inner.react(r);
      return { ...s, text: pad(s.text, r.maxWords) };
    },
    choose: (r) => inner.choose(r),
  };
}
const { hub, log } = recordingHub({ speed, seed });
const t0 = Date.now();
const tx = await session.runOne(hub.newShow());
const real = Date.now() - t0;
const g0 = gaps(log);
// the held wide shot that ends each window is a beat, not dead air
const g = { ...g0, gaps: g0.gaps.filter((x) => !isHeldTail(x)) };

const n = (id: string) => nameOf(tx, id);
console.log(`Compatibility Mode, episode ${tx.episode} (${tx.brain} brain${seed ? `, seed ${seed}` : ''})`);
console.log(`star     ${tx.star.name}`);
console.log(`suitors  ${tx.suitors.map((s) => `${s.spot}:${s.name}`).join('  ')}`);
console.log(`cards    up: ${tx.draw.cards[0]!.label} | hidden on: ${tx.draw.cards[1]!.label} | dealbreaker: ${tx.draw.cards[2]!.label}  (sealed ${tx.sealedSource})`);
console.log(`twist    ${tx.draw.twist.label} (${tx.draw.twist.format}): ${tx.draw.twist.rule}`);
console.log(`question ${tx.question.theme}`);
for (const c of tx.cuts) {
  const marks = Object.entries(c.roundMarks).map(([id, m]) => `${n(id)} ${m > 0 ? '+' : ''}${m}`).join(', ');
  console.log(`cut r${c.round}   ${c.name}: ${c.reason}${c.tie.length ? ` [tie ${c.tie.map(n).join('/')}]` : ''}${c.deciding.length ? ` [decided by ${c.deciding.join(', ')}]` : ''}`);
  console.log(`         bottom ${c.bottom.map(n).join(' / ')}; marks this round: ${marks}; reason ${c.hintCard ? `hints at ${c.hintCard}` : c.hook ? `quotes "${c.hook}"` : 'v1'}`);
}
const oo = tx.pick.oneOnOne;
console.log(`winner   ${n(tx.pick.winner)} over ${n(tx.pick.loser)}: ${tx.pick.reason}${tx.pick.tie.length ? ' [tie]' : ''}`);
console.log(`         one on one: ${n(tx.pick.first)} first (${oo[tx.pick.first]}), ${n(tx.pick.last)} last (${oo[tx.pick.last]})`);
for (const r of tx.reveals) {
  const reps = r.replays.map((x) => `${n(x.who)}${x.hit ? '' : ' (nearest)'}: "${x.text}"`).join(' | ');
  const gs = r.guesses.map((g) => `${n(g.who)} ${g.right ? 'right' : 'wrong'}`).join(', ');
  console.log(`reveal ${r.slot} ${r.card}: ${reps || 'nobody'}${gs ? `; reads: ${gs}` : ''}`);
}
console.log(`owners   ${Object.entries(tx.draw.owners).map(([c, ids]) => `${c}=${ids.map(n).join('/')}`).join('  ')}`);
console.log(`windows  ${tx.windows.map((w) => `${w.tag} ${((w.lockAt - w.openAt) / 1000).toFixed(1)}s open (target ${(w.targetMs / 1000).toFixed(0)}, ${w.beats} beats, ${w.outcomes.length} outcomes)`).join('  ')}`);
console.log(`duration ${fmtMs(g.durationMs)} at speed 1 (ran ${(real / 1000).toFixed(1)} s at speed ${speed})`);
const src = sources(tx);
console.log(`lines    ${tx.lines.length}: model ${src.model}, bank ${src.bank}, fallback ${src.fallback}; late ${tx.late}; word-limit rejects ${wordViolations(tx)}; content rejects ${tx.rejected.length}`);
if (g.gaps.length) for (const x of g.gaps) console.log(`GAP      ${(x.ms / 1000).toFixed(1)} s at ${fmtMs(x.at)} between ${x.from} and ${x.to}`);
else console.log('gaps     none over 2.5 s');
process.exit(0);
