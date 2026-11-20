import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { MemoryChain } from '../src/chain/memory.ts';
import { createApp, FAUCET_AMOUNT } from '../src/server.ts';
import { coinflipChannel } from '../src/channels/coinflip.ts';
import { randomPubkey } from '../src/lib/bytes.ts';
import { log } from '../src/lib/log.ts';

log.setQuiet(true);

test('HTTP + WebSocket: snapshot, faucet, bets, late bet rejected, chat limits, payout', async () => {
  const chain = new MemoryChain();
  const app = createApp({
    chain,
    channels: [coinflipChannel({ bettingMs: 600, ticks: 5, tickMs: 20, resultMs: 300, intermissionMs: 300 })],
    historyDir: null,
  });
  const port = await app.start(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const post = (path: string, body: unknown) =>
    fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(
      async (r) => ({ status: r.status, body: (await r.json()) as any }),
    );
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?channel=coinflip`);
    const msgs: any[] = [];
    const waitFor = (pred: (m: any) => boolean, ms = 8000) =>
      new Promise<any>((resolve, reject) => {
        const hit = msgs.find(pred);
        if (hit) return resolve(hit);
        const t = setTimeout(() => reject(new Error('timeout waiting for message')), ms);
        ws.on('message', function h(raw) {
          const m = JSON.parse(String(raw));
          if (pred(m)) {
            clearTimeout(t);
            ws.off('message', h);
            resolve(m);
          }
        });
      });
    ws.on('message', (raw) => msgs.push(JSON.parse(String(raw))));
    const snap = await waitFor((m) => m.type === 'snapshot');
    assert.equal(snap.channel, 'coinflip');
    for (const k of ['phase', 'match', 'windows', 'recentEvents', 'serverNow']) assert.ok(k in snap, k);

    // channels + config
    const list = (await fetch(base + '/channels').then((r) => r.json())) as any[];
    assert.equal(list[0].channel, 'coinflip');
    assert.equal((await fetch(base + '/channels/nope')).status, 404);
    assert.equal(((await fetch(base + '/config').then((r) => r.json())) as any).chain, 'memory');
    assert.match(await fetch(base + '/dev').then((r) => r.text()), /Arena runner debug/);

    // faucet: once per key
    const me = randomPubkey();
    assert.equal((await post('/faucet', { owner: me })).body.granted, FAUCET_AMOUNT);
    const again = await post('/faucet', { owner: me });
    assert.equal(again.body.granted, 0);
    assert.equal(again.body.balance, FAUCET_AMOUNT);
    assert.equal((await post('/faucet', { owner: 'not-a-key' })).status, 400);

    // bet during the open window
    const open = msgs.find((m) => m.type === 'window_open') ?? (await waitFor((m) => m.type === 'window_open'));
    const outcomeId = open.outcomes[0].id;
    const bet = await post('/dev/bet', { owner: me, windowId: open.windowId, outcomeId, amount: 5_000_000 });
    assert.equal(bet.status, 200, JSON.stringify(bet.body));
    const pools = await waitFor((m) => m.type === 'pools' && m.windowId === open.windowId);
    assert.equal(pools.total, 5_000_000);
    // a mid-match joiner sees the open window with its pool
    const mid = (await fetch(base + '/channels/coinflip').then((r) => r.json())) as any;
    assert.equal(mid.windows[0].total, 5_000_000);
    assert.equal(mid.windows[0].state, 'open');
    assert.equal(mid.windows[0].secret, undefined, 'secret not exposed before settle');

    // chat: relay, length cap, rate limit
    ws.send(JSON.stringify({ type: 'chat', name: 'tester', text: 'x'.repeat(1000) }));
    const chat = await waitFor((m) => m.type === 'chat');
    assert.equal(chat.from, 'tester');
    assert.equal(chat.text.length, 280);
    for (let i = 0; i < 10; i++) ws.send(JSON.stringify({ type: 'chat', name: 'tester', text: 'spam ' + i }));
    const limited = await waitFor((m) => m.type === 'error' && /rate/.test(m.message));
    assert.ok(limited);
    ws.send(JSON.stringify({ type: 'chat', name: 'HouseBot Ada', text: 'hi' }));

    // late bet after lock is rejected
    await waitFor((m) => m.type === 'window_locked' && m.windowId === open.windowId);
    const late = await post('/dev/bet', { owner: me, windowId: open.windowId, outcomeId, amount: 1_000_000 });
    assert.equal(late.status, 400);
    assert.match(late.body.error, /closed/);

    // settle: sole bettor gets their stake back
    const settled = await waitFor((m) => m.type === 'window_settled' && m.windowId === open.windowId);
    const mine = await fetch(base + '/me/' + me).then((r) => r.json() as any);
    // sole bettor: wins the whole (own) pool, or nobody backed the winner → refund. Either way, whole again.
    assert.ok(settled.winnerOutcomeId);
    assert.equal(mine.balance, FAUCET_AMOUNT);
    assert.equal(mine.positions[0].windowId, open.windowId);
    assert.equal(mine.positions[0].state, 'settled');

    // second match comes around
    await waitFor((m) => m.type === 'match' && m.matchId !== open.windowId.split(':')[0]);
    ws.close();
  } finally {
    await app.stop();
  }
});
