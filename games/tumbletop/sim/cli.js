#!/usr/bin/env node
// Headless round: node sim/cli.js --seed 42 [--round 0|1|2] [--events] [--json] [--timing]
// stdout is a pure function of the arguments (byte-identical across runs). Wall-clock timing is
// only reported with --timing, and always on stderr, so it can never leak into the result.
import { createSim, TICK_RATE } from './index.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
};
const flag = (name) => args.includes('--' + name);

const seed = parseInt(opt('seed', '42'), 10) >>> 0;
const round = parseInt(opt('round', '0'), 10);

const t0 = process.hrtime.bigint();
const sim = createSim({ seed, round });
const events = [];
let raceStartTick = 0;
while (sim.state.phase !== 'finished' && sim.state.tick < TICK_RATE * 600) {
  sim.step();
  for (const e of sim.drainEvents()) {
    if (e.type === 'start') raceStartTick = e.tick;
    events.push(e);
  }
}
const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
const st = sim.state;
const raceTicks = st.tick - raceStartTick;
const order = sim.finishOrder();
const counts = {};
for (const e of events) counts[e.type] = (counts[e.type] || 0) + 1;
const hash = sim.hash();

if (flag('timing')) {
  console.error(`Headless run: ${wallMs.toFixed(1)} ms wall (${(wallMs / st.tick).toFixed(4)} ms/tick)`);
}

if (flag('json')) {
  const out = {
    seed, round, botCount: st.botCount, qualifyCount: st.qualifyCount, hash,
    raceDuration: +(raceTicks / TICK_RATE).toFixed(3), ticks: st.tick,
    order, eventCounts: counts,
  };
  if (flag('events')) out.events = events;
  console.log(JSON.stringify(out, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);
  console.log(`Tumbletop - ${st.roundName} - seed ${seed}`);
  console.log('');
  for (const b of order) {
    const time = b.finishTime != null ? b.finishTime.toFixed(2) + 's' : '--';
    if (b.place === st.qualifyCount + 1) console.log('  ' + '-'.repeat(20) + ' cut ' + '-'.repeat(20));
    console.log(`${lpad(b.place, 3)}. ${pad(b.name, 16)} ${lpad(time, 9)}  ${b.status}`);
  }
  console.log('');
  const q = order.filter((b) => b.status === 'qualified').length;
  const e = order.filter((b) => b.status === 'eliminated').length;
  console.log(`Qualified: ${q}   Eliminated: ${e}`);
  const times = order.filter((b) => b.finishTime != null).map((b) => b.finishTime);
  if (times.length) console.log(`Winner: ${times[0].toFixed(2)}s   Last qualifier: ${times[times.length - 1].toFixed(2)}s   Spread: ${(times[times.length - 1] - times[0]).toFixed(2)}s`);
  console.log(`Race duration: ${(raceTicks / TICK_RATE).toFixed(2)}s (${st.tick} ticks incl. countdown)`);
  console.log('Events: ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log(`Hash: ${hash}`);
  if (flag('events')) {
    console.log('');
    console.log('Event log:');
    for (const ev of events) {
      const t = ((ev.tick - raceStartTick) / TICK_RATE).toFixed(2);
      console.log(`${lpad(t, 7)}s  [${ev.importance.toFixed(2)}] ${pad(ev.type, 11)} ${ev.text}`);
    }
  }
}
