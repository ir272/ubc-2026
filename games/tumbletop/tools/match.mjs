#!/usr/bin/env node
// One whole show, headless: the real show script on a fake Show and a virtual clock.
//   npm run match                 a random show
//   npm run match -- --seed 7     a fixed one
//   npm run match -- --json       the feed and the result as JSON
import { virtualClock } from '../show/clock.js';
import { createFakeShow } from '../show/fakeShow.js';
import { runShow } from '../show/script.js';
import { emptyRecords, pickEntrants } from '../show/records.js';
import { Rng } from '../sim/rng.js';
import { gumble } from '../sim/roster.js';
import { ROUNDS } from '../sim/rounds.js';
import { computeSimHash } from './simhash.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const seed = Number(opt('seed', (Date.now() % 100000) + 1));
const clock = virtualClock();
const t0 = clock.now();
const feed = [];
const fake = createFakeShow({ clock, onFeed: (m) => feed.push(m), seed });
const rng = new Rng(seed);
const entrants = pickEntrants(emptyRecords(), () => rng.next());
let result = null, error = null;
runShow(fake.show, { entrants, records: emptyRecords(), simHash: computeSimHash(), matchId: `tt-match-${seed}` }).then((r) => { result = r; }, (e) => { error = e; });
for (let i = 0; i < 6000 && !result && !error; i++) await clock.advance(100);
if (error || !result) { console.error(error || 'the show did not finish'); process.exit(1); }

const sec = (ms) => ((ms - t0) / 1000).toFixed(1).padStart(6) + ' s';
const name = (id) => gumble(id).name;
if (args.includes('--json')) {
  console.log(JSON.stringify({ seed, result, feed }, null, 2));
} else {
  console.log(`Tumbletop, seed ${seed}. ${feed.length} feed messages, show length ${((clock.now() - t0) / 1000).toFixed(0)} s.\n`);
  for (const m of feed) {
    if (m.type === 'match') console.log(`${sec(m.t)}  the call: ${m.entrants.map((e) => e.name).join(', ')}`);
    else if (m.type === 'window_open') console.log(`${sec(m.t)}  window opens, ${m.outcomes.length} outcomes, closes in ${((m.closesAt - m.t) / 1000).toFixed(0)} s`);
    else if (m.type === 'window_locked') console.log(`${sec(m.t)}  window locked, seed ${m.seed.slice(0, 16)}`);
    else if (m.type === 'event' && m.event.type === 'round') console.log(`${sec(m.t)}  ${ROUNDS[m.event.data.round].name} (${ROUNDS[m.event.data.round].place}), race ${(m.event.data.raceMs / 1000).toFixed(1)} s`);
    else if (m.type === 'event' && m.event.type === 'recap') console.log(`${sec(m.t)}  through: ${m.event.data.qualified.map(name).join(', ')}\n          out: ${m.event.data.notes.map((n) => `${name(n.entrantId)} (${n.text})`).join(', ')}`);
    else if (m.type === 'event' && m.event.type === 'result') console.log(`${sec(m.t)}  result: ${m.event.data.order.map(name).join(', ')}`);
    else if (m.type === 'window_settled') console.log(`${sec(m.t)}  window settled on ${name(m.winnerOutcomeId)}`);
  }
  console.log(`\nWinner: ${name(result.winnerId)}`);
}
