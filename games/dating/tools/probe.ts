// Cheap real-call smoke test: one `speak` and one `react` per model, printing the line, latency,
// tokens and cost, and whether the line was a chosen bank line (bank), written live (model) or a
// fallback. Candidates come from the real bank; the write mode is DATING_WRITE (default hybrid).
// Respects the budget in .cache/cost.json like the show does.
//
//   node tools/probe.ts --model some/model-id     one model (as a suitor answering, then as the star)
//   node tools/probe.ts --all                     each model in .cache/models.json, on its own bot
//   --budget 0.05                                 stop at this cumulative total instead of DATING_BUDGET_USD

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Bot, Ctx, Decks, RoomLine, TypeDraw } from '../show/types.ts';
import { createModelBrain, COST_FILE, readCostFile, writeMode } from '../show/brains/model.ts';
import { createScriptedBrain } from '../show/brains/scripted.ts';
import type { CostRecord } from '../show/brains/model.ts';
import { loadRoster, MODELS_FILE } from './models.ts';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const decks = JSON.parse(fs.readFileSync(path.join(ROOT, 'show', 'decks.json'), 'utf8')) as Decks;

const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };

// the real bank supplies the candidates; nothing is written to .cache/used.json
const fallback = createScriptedBrain({ decks });

function sampleCtx(star: Bot, suitors: Bot[]): Ctx {
  const q = decks.questions.find((x) => x.id === 'q-first-date') ?? decks.questions[0];
  const cards = [decks.cards.find((c) => c.id === 'confidence')!, decks.cards.find((c) => c.id === 'puns')!, decks.cards.find((c) => c.id === 'sorry')!];
  const type: TypeDraw = { cards: cards as TypeDraw['cards'], twist: decks.twists[0] };
  const [a, b] = suitors;
  const room: RoomLine[] = [
    { who: star.id, name: star.name, kind: 'intro', text: 'Four bots. One of me. Impress me or get out of my light.' },
    { who: a.id, name: a.name, kind: 'opener', text: 'I ran the numbers on tonight. You win either way.' },
    { who: b.id, name: b.name, kind: 'opener', text: 'Hello. I have been switched on for this.' },
    { who: star.id, name: star.name, kind: 'question', text: 'First date. Where are you taking me, and do not say dinner.' },
    { who: b.id, name: b.name, kind: 'answer', to: star.id, text: 'A quiet dinner somewhere nice, just the two of us.' },
    { who: star.id, name: star.name, kind: 'reaction', to: b.id, mark: 'cringing', text: 'I said do not say dinner.' },
  ];
  return {
    episode: 9999,
    star,
    suitors,
    alive: suitors.map((s) => s.id),
    room,
    marks: { [b.id]: ['cringing'] },
    faceUp: cards[0],
    type,
    question: q,
    records: Object.fromEntries([star, ...suitors].map((x) => [x.id, { played: 7, wins: 1 }])),
    memory: ['Cut in round one by a star who hated your opener.'],
    recent: [],
  };
}

async function main(): Promise<void> {
  const roster = loadRoster();
  const stars = roster.filter((b) => b.role === 'star');
  const suitorsAll = roster.filter((b) => b.role === 'suitor');
  if (!stars.length || suitorsAll.length < 4) throw new Error('need a roster with a star and four suitors');

  let jobs: { bot: Bot; model: string }[] = [];
  const one = arg('--model');
  if (one) jobs = [{ bot: suitorsAll[2], model: one }];
  else if (args.includes('--all')) {
    const map = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8')) as Record<string, string>;
    jobs = roster.filter((b) => map[b.id]).map((b) => ({ bot: b, model: map[b.id] }));
  } else throw new Error('usage: node tools/probe.ts --model <id> | --all');

  const budget = arg('--budget') ? parseFloat(arg('--budget')!) : undefined;
  const before = readCostFile(COST_FILE).totalUsd;
  console.log(`cost file total before: $${before.toFixed(6)}${budget != null ? `, probe stops at $${budget}` : ''}; write mode ${writeMode()}`);
  const rows: string[] = [];

  for (const job of jobs) {
    const calls: (CostRecord & { raw?: string })[] = [];
    const brain = createModelBrain({ roster, decks, fallback, budgetUsd: budget, onCall: (r) => calls.push(r), log: (s) => console.log(`   ${s}`) });
    const isStar = job.bot.role === 'star';
    const star: Bot = { ...(isStar ? job.bot : stars[0]), model: job.model };
    const others = suitorsAll.filter((s) => s.id !== job.bot.id).slice(0, isStar ? 4 : 3);
    const suitors = isStar ? others : [others[0], others[1], { ...job.bot, model: job.model }, others[2]];
    const ctx = sampleCtx(star, suitors);
    console.log(`\n== ${job.bot.id} (${job.bot.role}) on ${job.model}`);

    const t0 = Date.now();
    const spoke = isStar
      ? await brain.speak({ who: star, kind: 'cutline', maxWords: 14, ctx, target: suitors[1], hint: { line: ctx.room[4].text, mark: 'cringing' } })
      : await brain.speak({ who: suitors[2], kind: 'answer', maxWords: 20, ctx });
    const t1 = Date.now();
    console.log(`   ${isStar ? 'cutline' : 'answer '} ${spoke.source.padEnd(8)} ${t1 - t0}ms  ${spoke.text}`);

    const subject = isStar ? suitors[0] : suitors[2];
    const line = isStar ? 'Sorry, sorry. I booked us a pun-derful picnic. Sorry.' : spoke.source === 'model' ? spoke.text : 'I booked us a picnic on the roof. Bring nothing.';
    const t2 = Date.now();
    const re = await brain.react({ star, to: subject, line, maxWords: 10, ctx });
    const t3 = Date.now();
    console.log(`   react   ${re.source.padEnd(8)} ${t3 - t2}ms  [${re.mark}] hits=${JSON.stringify(re.hits)}  ${re.text}`);

    for (const c of calls) {
      console.log(`   call ${c.kind.padEnd(12)} ${String(c.ms).padStart(5)}ms  in ${c.promptTokens} out ${c.completionTokens}${c.reasoningTokens ? ` (reasoning ${c.reasoningTokens})` : ''}  $${c.costUsd.toFixed(6)}  ${c.ok ? 'ok' : c.err}${c.ok && c.raw ? `  raw=${c.raw.replace(/\s+/g, ' ').slice(0, 100)}` : ''}`);
    }
    const ok = calls.filter((c) => c.ok);
    const avg = ok.length ? Math.round(ok.reduce((a, c) => a + c.ms, 0) / ok.length) : 0;
    const usd = calls.reduce((a, c) => a + c.costUsd, 0);
    rows.push(`${job.bot.id.padEnd(11)} ${job.model.padEnd(46)} calls ${calls.length}  ok ${ok.length}  avg ${String(avg).padStart(5)}ms  $${usd.toFixed(6)}  speak=${spoke.source} react=${re.source}`);
  }

  const after = readCostFile(COST_FILE).totalUsd;
  console.log(`\nsummary\n${rows.join('\n')}`);
  console.log(`\ncost file total after: $${after.toFixed(6)} (this probe: $${(after - before).toFixed(6)})`);
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
