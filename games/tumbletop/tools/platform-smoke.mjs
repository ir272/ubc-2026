#!/usr/bin/env node
// Runs the Tumbletop channel on the REAL platform runner (../../runner, memory chain, nothing
// edited there) with short show timings, on a spare port, and checks what a viewer's socket gets:
// the message order, three seeded windows of 16, 8 and 4 outcomes, all settled on the show winner,
// a bet that pays, and a mid-show snapshot that carries the `round` event the stage needs to join.
// Races still air in real time, so this takes about 90 s.
//   node tools/platform-smoke.mjs
process.env.LOG_QUIET = '1';
const { makeChain } = await import('../../../runner/src/chain/index.ts');
const { createApp } = await import('../../../runner/src/server.ts');
const { default: tumbletopChannel } = await import('../channel.ts');
const { WebSocket } = await import('../../../runner/node_modules/ws/wrapper.mjs');

const PORT = 8797;
const chain = await makeChain();
const channel = tumbletopChannel({ recordsPath: null, intermissionMs: 500, timings: { callMs: 600, betMs: [1500, 1200, 1200], titleMs: 400, cutMs: 300, recapMs: 300, finalCutMs: 300, resultMs: 500 } });
const app = createApp({ chain, channels: [channel] });
await app.start(PORT, '127.0.0.1');
const base = `http://127.0.0.1:${PORT}`;
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

const msgs = [];
let midSnapshot = null, betPlaced = false, owner = null;
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?channel=tumbletop`);
const done = new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('timed out after 200 s')), 200_000);
  ws.on('message', async (raw) => {
    const m = JSON.parse(String(raw));
    msgs.push(m);
    try {
      if (m.type === 'window_open' && !betPlaced) {
        betPlaced = true;
        // a viewer with a faucet grant bets on every outcome, so one of the bets must pay
        owner = 'So11111111111111111111111111111111111111112'; // any well-formed base58 key will do on the memory chain
        const f = await fetch(`${base}/faucet`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner }) });
        if (!f.ok) throw new Error('faucet: ' + (await f.text()));
        await Promise.all(m.outcomes.map((o) => fetch(`${base}/dev/bet`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner, windowId: m.windowId, outcomeId: o.id, amount: 1_000_000 }) })));
      }
      if (m.type === 'event' && m.event.type === 'round' && m.event.data.round === 1 && !midSnapshot) {
        setTimeout(async () => { midSnapshot = await (await fetch(`${base}/channels/tumbletop`)).json(); }, 3000);
      }
      if (m.type === 'match_end') { clearTimeout(to); setTimeout(res, 300); }
    } catch (e) { clearTimeout(to); rej(e); }
  });
  ws.on('error', rej);
});

try {
  await done;
  const types = msgs.map((m) => (m.type === 'event' ? `event:${m.event.type}` : m.type));
  // The runner starts the show as soon as it is up, so the announce usually reaches this socket
  // inside the first snapshot, not as a `match` message.
  const first = msgs.findIndex((m) => m.type === 'match');
  const match = first >= 0 ? msgs[first] : msgs[0]?.match;
  const show = msgs.slice(Math.max(0, first));
  const opens = show.filter((m) => m.type === 'window_open');
  const locks = show.filter((m) => m.type === 'window_locked');
  const settles = show.filter((m) => m.type === 'window_settled');
  const rounds = show.filter((m) => m.type === 'event' && m.event.type === 'round');
  const result = show.find((m) => m.type === 'event' && m.event.type === 'result');
  const end = show.find((m) => m.type === 'match_end');
  check(msgs[0]?.type === 'snapshot', 'a snapshot arrives first');
  check(!!match && match.entrants.length === 16 && match.meta?.game === 'tumbletop', 'match announces 16 entrants with meta.game');
  check(!!match && match.entrants.every((e) => e.record && e.stats && e.color), 'every entrant has a record, stats and a colour');
  check(opens.map((o) => o.outcomes.length).join() === '16,8,4', `three windows with 16, 8 and 4 outcomes (${opens.map((o) => o.outcomes.length).join()})`);
  check(opens.every((o) => o.seeded && /^[0-9a-f]{64}$/.test(o.simHash || '')), 'every window is seeded and carries the sim hash');
  check(locks.length === 3 && locks.every((l) => /^[0-9a-f]{64}$/.test(l.seed || '')), 'every lock publishes a seed');
  check(rounds.length === 3 && rounds.every((r, i) => r.event.data.seed === locks[i].seed), 'each round runs on the seed of its own window');
  check(rounds.every((r, i) => show.indexOf(r) > show.indexOf(locks[i])), 'no round event before its window locked');
  check(!!result && settles.length === 3 && settles.every((s) => s.winnerOutcomeId === result.event.data.winnerId), 'all three windows settle on the show winner');
  check(!!end && end.result?.winnerId === result?.event.data.winnerId, 'match_end carries the winner');
  check(settles.some((s) => (s.payouts || []).some((p) => p.owner && p.amount > 0)), 'the test viewer was paid');
  const snapRound = midSnapshot?.recentEvents?.filter((e) => e.type === 'round').pop();
  check(!!snapRound && snapRound.data.round === 1 && typeof midSnapshot.match?.startedAt === 'number' && typeof midSnapshot.serverNow === 'number', 'a mid-show snapshot has the round event, startedAt and serverNow');
  const perShow = show.filter((m) => m.type === 'event').length;
  check(perShow < 400, `${perShow} game events in the show (snapshot keeps 500)`);
  console.log(`\nmessage types: ${[...new Set(types)].join(', ')}`);
} catch (e) {
  console.error(e);
  fails.push(String(e));
} finally {
  ws.close();
  await app.stop();
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall ok');
process.exit(fails.length ? 1 : 0);
