import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryChain } from '../src/chain/memory.ts';
import { random32, randomPubkey, sha256, randomMarketId } from '../src/lib/bytes.ts';

async function setup(closeInMs = 1000, seeded = false) {
  const chain = new MemoryChain();
  let now = 1_000_000;
  chain.now = () => now;
  const secret = random32();
  const { market, closesAt } = await chain.createMarket({
    id: randomMarketId(),
    channel: 't',
    outcomeCount: 2,
    closeInMs,
    commitment: seeded ? sha256(secret) : undefined,
  });
  const a = randomPubkey();
  const b = randomPubkey();
  await chain.grant(a, 1000);
  await chain.grant(b, 1000);
  return { chain, market, closesAt, secret, a, b, advance: (ms: number) => (now += ms) };
}

test('bets are rejected at and after close', async () => {
  const { chain, market, a, advance } = await setup(1000);
  await chain.placeBet(a, market, 0, 10);
  advance(999);
  await chain.placeBet(a, market, 0, 10);
  advance(1); // exactly at close
  await assert.rejects(chain.placeBet(a, market, 0, 10), /closed/);
  advance(5000);
  await assert.rejects(chain.placeBet(a, market, 1, 10), /closed/);
  assert.equal(await chain.getBalance(a), 980);
  assert.deepEqual((await chain.getMarket(market)).pools, [20, 0]);
});

test('lock only after close; bets rejected after lock', async () => {
  const { chain, market, a, advance } = await setup(1000);
  await assert.rejects(chain.lock(market), /before close/);
  advance(1000);
  const { entropy } = await chain.lock(market);
  assert.equal(entropy.length, 32);
  await assert.rejects(chain.placeBet(a, market, 0, 1), /closed/);
  await assert.rejects(chain.lock(market), /Locked/);
});

test('bad bets are rejected and cost nothing', async () => {
  const { chain, market, a } = await setup();
  await assert.rejects(chain.placeBet(a, market, 2, 1), /outcome/);
  await assert.rejects(chain.placeBet(a, market, 0, 0), /positive/);
  await assert.rejects(chain.placeBet(a, market, 0, 1.5), /positive/);
  await assert.rejects(chain.placeBet(a, market, 0, 1001), /insufficient/);
  assert.equal(await chain.getBalance(a), 1000);
});

test('settle checks the commitment; claims pay once', async () => {
  const { chain, market, secret, a, b, advance } = await setup(10, true);
  await chain.placeBet(a, market, 0, 100);
  await chain.placeBet(b, market, 1, 300);
  advance(10);
  await chain.lock(market);
  await assert.rejects(chain.settle(market, { secret: random32(), winner: 0 }), /commitment/);
  await assert.rejects(chain.settle(market, { winner: 0 }), /commitment/);
  await chain.settle(market, { secret, winner: 0 });
  const paid = await chain.claimAll(market);
  assert.deepEqual(paid, [{ owner: a, amount: 400 }]);
  assert.deepEqual(await chain.claimAll(market), []);
  assert.equal(await chain.getBalance(a), 1300);
  assert.equal(await chain.getBalance(b), 700);
  assert.equal(chain.vault, 0);
  await assert.rejects(chain.void(market), /Settled/);
});

test('void refunds everyone, even from an open market', async () => {
  const { chain, market, a, b } = await setup(10_000);
  await chain.placeBet(a, market, 0, 100);
  await chain.placeBet(b, market, 1, 50);
  await chain.placeBet(b, market, 0, 25);
  await chain.void(market);
  await assert.rejects(chain.placeBet(a, market, 0, 1), /closed/);
  await chain.claimAll(market);
  assert.equal(await chain.getBalance(a), 1000);
  assert.equal(await chain.getBalance(b), 1000);
  assert.equal(chain.vault, 0);
});
