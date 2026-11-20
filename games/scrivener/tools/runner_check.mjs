#!/usr/bin/env node
// Plays one match of channel.ts through the REAL runner code (runner/src: Hub, MatchShow,
// MemoryChain), read-only, with no HTTP server: proof that the adapter fits the platform's Show,
// not only the harness's fake one. Real time, mock brains: about 4 to 8 minutes.
//   node tools/runner_check.mjs            prints a line per phase and window, then a summary

import path from 'node:path';
import { ROOT } from './_lib.mjs';

const R = path.resolve(ROOT, '..', '..', 'runner', 'src');
const { Hub } = await import(path.join(R, 'hub.ts'));
const { runChannelLoop } = await import(path.join(R, 'show.ts'));
const { makeChain } = await import(path.join(R, 'chain', 'index.ts'));
const { default: channel } = await import(path.join(ROOT, 'channel.ts'));

const chain = await makeChain('memory');
const hub = new Hub(chain);
const def = channel({ mock: true, recordsFile: path.join(ROOT, '.cache', 'records.runner.json') });
hub.addChannel(def);
const ac = new AbortController();
const t0 = Date.now();
const counts = {};
let events = 0, ended = null, snapshotOk = false;
hub.subscribe(def.id, (msg) => {
  counts[msg.type] = (counts[msg.type] || 0) + 1;
  const at = ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
  if (msg.type === 'event') { events += 1; if (msg.event.type === 'phase') console.log(at, 'phase', msg.event.data.phase); }
  if (msg.type === 'window_open') console.log(at, 'window_open', msg.seeded ? 'seeded' : 'live', msg.question);
  if (msg.type === 'window_settled') console.log(at, 'window_settled', msg.winnerOutcomeId);
  if (msg.type === 'match_end') {
    ended = msg.result;
    const snap = hub.snapshot(def.id);
    snapshotOk = !!(snap && snap.match && snap.recentEvents.length === events);
  }
});
// the runner reports the match done only after run() has returned (the verdict's last seconds included)
runChannelLoop(hub, def, ac.signal, {
  onMatchDone: (id, ok) => {
    console.log(JSON.stringify({ ok: ok && !!ended, seconds: Math.round((Date.now() - t0) / 1000), winnerId: ended && ended.winnerId, how: ended && ended.how, attempts: ended && ended.attempts.length, counts, snapshotHoldsWholeMatch: snapshotOk }, null, 1));
    ac.abort();
    setTimeout(() => process.exit(ok && ended ? 0 : 1), 200);
  },
});
setTimeout(() => { console.log(JSON.stringify({ ok: false, why: 'timeout', counts })); process.exit(1); }, 14 * 60 * 1000);
