import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryChain } from '../src/chain/memory.ts';
import { Hub, MAX_WINDOW_TXS, type WindowRec } from '../src/hub.ts';
import { createApp } from '../src/server.ts';
import { coinflipChannel } from '../src/channels/coinflip.ts';
import { toHistoryMatch, MAX_HISTORY_TXS } from '../src/history.ts';
import { capTxs } from '../src/lib/txs.ts';
import type { ChainAdapter } from '../src/types.ts';
import { randomPubkey } from '../src/lib/bytes.ts';
import { log } from '../src/lib/log.ts';

log.setQuiet(true);

const rec = (market: string): WindowRec => ({
  windowId: 'm1:w1',
  matchId: 'm1',
  channel: 'coinflip',
  market,
  question: 'Heads or tails?',
  outcomes: [
    { id: 'heads', label: 'Heads' },
    { id: 'tails', label: 'Tails' },
  ],
  closesAt: Date.now() + 1000,
  seeded: true,
  state: 'open',
  pools: [0, 0],
  total: 0,
});

test('memory chain: windows, feed and history carry no txs, /ledger is empty', async () => {
  const app = createApp({
    chain: new MemoryChain(),
    channels: [coinflipChannel({ bettingMs: 300, ticks: 3, tickMs: 20, resultMs: 200, intermissionMs: 200 })],
    houseBots: { tickMs: 50, betChance: 1 },
    historyDir: null,
  });
  const seen: any[] = [];
  const port = await app.start(0, '127.0.0.1');
  const unsub = app.hub.subscribe('coinflip', (m) => seen.push(m));
  try {
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 8000;
    while (!seen.some((m) => m.type === 'window_settled') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    assert.ok(seen.some((m) => m.type === 'window_settled'), 'a window settled');
    assert.ok(!seen.some((m) => m.type === 'tx'), 'no tx feed messages');
    assert.ok(seen.filter((m) => m.type === 'window_open').every((m) => !('txs' in m) || m.txs === undefined));
    const snap = (await (await fetch(`${base}/channels/coinflip`)).json()) as any;
    for (const w of snap.windows) assert.ok(!('txs' in w), 'window has no txs field');
    const ledger = (await (await fetch(`${base}/ledger`)).json()) as any;
    assert.deepEqual(ledger.txs, []);
    assert.equal(ledger.chain, 'memory');
  } finally {
    unsub();
    await app.stop();
  }
});

test('chain transactions are filed under their window, mapped to outcome ids, and broadcast', () => {
  const chain: ChainAdapter = new MemoryChain(); // onTx is driven by hand, the way SolanaChain reports
  const hub = new Hub(chain);
  hub.addChannel(coinflipChannel());
  const feed: any[] = [];
  hub.subscribe('coinflip', (m) => feed.push(m));
  const market = randomPubkey();
  const bot = randomPubkey();
  const human = randomPubkey();
  hub.botOwners.add(bot);

  // create_market confirms before the window exists: held, then attached without a feed message
  chain.onTx!({ kind: 'open', signature: 'sigOpen', market });
  const w = rec(market);
  hub.registerWindow(w);
  assert.equal(feed.length, 0);
  assert.deepEqual(w.txs!.map((t) => [t.kind, t.signature]), [['open', 'sigOpen']]);

  chain.onTx!({ kind: 'bet', signature: 'sigBet1', market, who: bot, outcome: 1, amount: 5_000_000 });
  chain.onTx!({ kind: 'bet', signature: 'sigBet2', market, who: human, outcome: 0, amount: 2_000_000 });
  chain.onTx!({ kind: 'lock', signature: 'sigLock', market });
  chain.onTx!({ kind: 'settle', signature: 'sigSettle', market, outcome: 0 });
  chain.onTx!({ kind: 'payout', signature: 'sigPay', market, who: human, amount: 7_000_000 });

  assert.deepEqual(w.txs!.map((t) => t.kind), ['open', 'bet', 'bet', 'lock', 'settle', 'payout']);
  assert.deepEqual(
    { ...w.txs![1], at: 0 },
    { kind: 'bet', signature: 'sigBet1', at: 0, who: bot, amount: 5_000_000, outcomeId: 'tails', bot: true },
  );
  assert.equal(w.txs![2]!.bot, undefined);
  assert.equal(w.txs![4]!.outcomeId, 'heads');
  assert.deepEqual(feed.map((m) => [m.type, m.windowId, m.tx.kind]), [
    ['tx', 'm1:w1', 'bet'],
    ['tx', 'm1:w1', 'bet'],
    ['tx', 'm1:w1', 'lock'],
    ['tx', 'm1:w1', 'settle'],
    ['tx', 'm1:w1', 'payout'],
  ]);
  assert.deepEqual(hub.publicWindow(w).txs, w.txs);
  assert.equal(hub.ledger()[0]!.kind, 'payout');
  assert.equal(hub.ledger({ channel: 'nope' }).length, 0);

  // cap: the oldest bets go first, open/lock/settle/payout stay
  for (let i = 0; i < 100; i++) chain.onTx!({ kind: 'bet', signature: `b${i}`, market, who: bot, outcome: 0, amount: 1 });
  assert.equal(w.txs!.length, MAX_WINDOW_TXS);
  assert.deepEqual(w.txs!.filter((t) => t.kind !== 'bet').map((t) => t.kind), ['open', 'lock', 'settle', 'payout']);
  assert.equal(w.txs!.at(-1)!.signature, 'b99');

  // history keeps a shorter list
  w.state = 'settled';
  w.winnerOutcomeId = 'heads';
  const h = toHistoryMatch({ matchId: 'm1', title: 't', entrants: [], startedAt: 1 }, [w], 2);
  assert.equal(h.windows[0]!.txs!.length, MAX_HISTORY_TXS);
  assert.ok(h.windows[0]!.txs!.some((t) => t.kind === 'open'));
});

test('capTxs drops the oldest of anything once no bets are left', () => {
  const t = (kind: 'open' | 'payout', signature: string) => ({ kind, signature, at: 0 });
  assert.deepEqual(capTxs([t('open', 'a'), t('payout', 'b'), t('payout', 'c')], 2).map((x) => x.signature), ['b', 'c']);
});

test('memory chain: POST /dev/transfer moves play dollars and refuses bad requests', async () => {
  const chain = new MemoryChain();
  const app = createApp({ chain, channels: [coinflipChannel()], historyDir: null });
  const port = await app.start(0, '127.0.0.1');
  const post = (body: unknown) =>
    fetch(`http://127.0.0.1:${port}/dev/transfer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(
      async (r) => ({ status: r.status, body: (await r.json()) as any }),
    );
  try {
    const a = randomPubkey();
    const b = randomPubkey();
    await chain.grant(a, 50_000_000);
    const ok = await post({ from: a, to: b, amount: 20_000_000 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.balance, 30_000_000);
    assert.equal(await chain.getBalance(b), 20_000_000);
    assert.equal((await post({ from: a, to: b, amount: 99_000_000 })).status, 400);
    assert.equal((await post({ from: a, to: a, amount: 1 })).status, 400);
    assert.equal((await post({ from: a, to: 'nope', amount: 1 })).status, 400);
  } finally {
    await app.stop();
  }
});
