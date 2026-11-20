#!/usr/bin/env node
// npm run match -- [--mock | --real] [--seed S] [--a kiln --b tick] [--coaches adaptive,rush]
//                  [--bots marlow,juniper] [--lives 2] [--handicap 0,30] [--json] [--quiet]
//
// Runs one full Ringout show headless through the fake Show and prints the phase timeline, every
// plan change, the result and the count of each event type. --mock (default) runs on a virtual
// clock: nothing waits for real. --real uses real model minds and real time (spends budget).

import { runMatch } from '../src/show/script.ts';
import { mockBrains } from '../src/show/brains.ts';
import { createFakeShow, fakeHash, realClock, virtualClock } from '../src/show/fakeShow.ts';
import { createBrains, loadEnv } from '../src/show/brains.node.ts';
import { loadBots, SIM_HASH } from '../channel.ts';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};

/** sfc32 from a string seed */
export function prngFrom(seedText) {
  const h = fakeHash(String(seedText));
  let a = parseInt(h.slice(0, 8), 16) >>> 0, b = parseInt(h.slice(8, 16), 16) >>> 0;
  let c = parseInt(h.slice(16, 24), 16) >>> 0, d = parseInt(h.slice(24, 32), 16) >>> 0;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}

const real = flag('real');
const json = flag('json');
const quiet = flag('quiet');
const seedText = opt('seed', String(Date.now()));
const coaches = (opt('coaches', 'adaptive,adaptive')).split(',').map((s) => s.trim());
const lives = opt('lives') ? Number(opt('lives')) : undefined;
const handicap = opt('handicap') ? opt('handicap').split(',').map(Number) : undefined;
const a = opt('a');
const b = opt('b');
const picks = a || b ? [a ?? 'kiln', b ?? 'kiln'] : undefined;

const allBots = loadBots();
const wanted = opt('bots') ? opt('bots').split(',') : null;
const bots = wanted ? wanted.map((id) => allBots.find((x) => x.id === id)).filter(Boolean) : allBots.slice(0, 2);
if (bots.length < 2) {
  console.error('need two bots (check --bots ids against bots.json)');
  process.exit(1);
}

const clock = real ? realClock() : virtualClock(1_700_000_000_000);
const rand = prngFrom(seedText + ':script');
const feed = [];
const t0 = clock.now();
const show = createFakeShow({ clock, onFeed: (m) => feed.push(m), seedRandom: prngFrom(seedText + ':show') });

let brains;
let mode = 'mock';
if (real) {
  loadEnv();
  const choice = createBrains({ rand: prngFrom(seedText + ':brains'), sleep: (ms) => clock.sleep(ms), coaches, log: (m) => console.error(m) });
  if (choice.mode !== 'real') {
    console.error(`--real needs real brains, got mock (${choice.reason})`);
    process.exit(1);
  }
  brains = choice.brains;
  mode = 'real';
  if (!quiet) console.error(`real brains: ${choice.reason}`);
} else {
  brains = mockBrains({ rand: prngFrom(seedText + ':brains'), sleep: (ms) => clock.sleep(ms), coaches });
}

const records = {};
const memories = {};
const wallStart = Date.now();
let result;
let error;
let done = false;
const p = runMatch(show, {
  brains,
  bots: [bots[0], bots[1]],
  matchNo: 1,
  records,
  memories,
  random: rand,
  options: { picks, lives, handicap },
  simHash: SIM_HASH,
})
  .then((r) => (result = r))
  .catch((e) => (error = e))
  .finally(() => (done = true));

if (real) await p;
else {
  await clock.runUntil(() => done);
  if (!done) error = new Error('the match stalled: nothing left to wait for on the virtual clock');
}
show.destroy();

// ---- report -----------------------------------------------------------------------------------
const fmt = (ms) => {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
const events = feed.filter((m) => m.type === 'event').map((m) => m.event);
const counts = {};
for (const m of feed) {
  const k = m.type === 'event' ? `event:${m.event.type}` : m.type;
  counts[k] = (counts[k] ?? 0) + 1;
}
const PHASE = new Set(['call', 'select_open', 'picks', 'versus', 'taunt', 'predictions', 'fight_start', 'sudden_death', 'life_lost', 'replay', 'corner_talk', 'break_window', 'fight_resume', 'match_end']);
const timeline = [];
for (const m of feed) {
  const at = m.t - (feed.find((x) => x.type === 'match')?.t ?? t0);
  if (m.type === 'event' && PHASE.has(m.event.type)) {
    const e = m.event;
    const d = e.data ?? {};
    let note = '';
    if (e.type === 'picks') note = d.ctx.picks.join(' vs ');
    else if (e.type === 'taunt' || e.type === 'corner_talk') note = `${bots[d.side].name}: "${d.text}"`;
    else if (e.type === 'fight_start') note = `tick 0 at ${fmt(d.startAt)}, seed ${d.ctx.header.seed.slice(0, 12)}`;
    else if (e.type === 'life_lost') note = `${bots[d.side].name} out (${d.edge}, ${Math.round(d.damage)}%) tick ${d.tick}${d.final ? ', final' : ''}`;
    else if (e.type === 'replay') note = `ticks ${d.from.tick} to ${d.toTick}, ${d.plans.length} plans`;
    else if (e.type === 'fight_resume') note = `tick ${d.tick} at ${fmt(d.startAt)}`;
    else if (e.type === 'match_end') note = `${bots[d.winner].name} wins, lives ${d.lives.join('-')}, next in ${d.nextInMs} ms`;
    else if (e.type === 'sudden_death') note = `tick ${d.tick}`;
    else if (d.durationMs) note = `${d.durationMs} ms`;
    timeline.push({ at, what: e.type, note });
  } else if (m.type.startsWith('window_')) {
    timeline.push({ at, what: m.type, note: m.windowId + (m.seed ? ` seed ${m.seed.slice(0, 12)}` : '') + (m.winnerOutcomeId ? ` -> ${m.winnerOutcomeId}` : '') });
  }
}
const plans = events
  .filter((e) => e.type === 'plan')
  .map((e) => ({ at: e.at, side: e.data.side, tick: e.data.tick, thoughtMs: e.data.thoughtMs, ...e.data.plan }));

const out = {
  mode,
  seed: seedText,
  bots: [bots[0].id, bots[1].id],
  coaches: real ? null : coaches,
  result: result ?? null,
  error: error ? String(error?.stack ?? error) : null,
  showMs: (feed.at(-1)?.t ?? t0) - (feed.find((x) => x.type === 'match')?.t ?? t0),
  wallMs: Date.now() - wallStart,
  counts,
  timeline,
  plans,
  records,
  memories,
};

if (json) {
  console.log(JSON.stringify(out, null, 1));
} else {
  console.log(`Ringout, one match (${mode} brains, seed ${seedText})`);
  console.log(`${bots[0].name} (${bots[0].model}) vs ${bots[1].name} (${bots[1].model})${real ? '' : `, coaches ${coaches.join(' / ')}`}\n`);
  console.log('Timeline');
  for (const x of timeline) console.log(`  ${fmt(x.at).padStart(7)}  ${x.what.padEnd(15)} ${x.note}`);
  console.log('\nPlans');
  for (const pl of plans) {
    console.log(
      `  ${fmt(pl.at).padStart(7)}  tick ${String(pl.tick).padStart(5)}  ${bots[pl.side].name.padEnd(8)} ${pl.stance.padEnd(8)} agg ${pl.aggression.toFixed(2)} ${pl.range.padEnd(5)} grab ${pl.grabMix.toFixed(2)} ${pl.edge.padEnd(5)} ${pl.recover.padEnd(4)} ${pl.order.padEnd(7)} ${String(pl.thoughtMs).padStart(5)} ms  "${pl.read}"`,
    );
  }
  console.log('\nResult');
  if (result) {
    console.log(`  ${bots[result.winner].name} wins as ${result.fighters[result.winner]}; lives ${result.lives.join('-')}, damage ${result.damage.join('-')}%, ${result.ticks} ticks (${(result.ticks / 60).toFixed(1)} s of fight)`);
    console.log(`  plans by stance ${JSON.stringify(result.plansByStance)}, plan changes ${result.planChanges}`);
  }
  if (error) console.log(`  ERROR ${error?.stack ?? error}`);
  console.log(`  show length ${fmt(out.showMs)}, ran in ${out.wallMs} ms`);
  console.log('\nCounts');
  for (const [k, n] of Object.entries(counts).sort()) console.log(`  ${k.padEnd(24)} ${n}`);
  console.log('\nMemories');
  for (const [id, lines] of Object.entries(memories)) console.log(`  ${id}: ${lines.join(' | ')}`);
}
process.exit(error ? 1 : 0);
