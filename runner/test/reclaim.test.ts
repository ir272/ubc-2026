import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Reclaimer } from '../src/reclaim.ts';
import { MemoryChain } from '../src/chain/memory.ts';
import { log } from '../src/lib/log.ts';
import type { ChainAdapter } from '../src/types.ts';

log.setQuiet(true);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A chain whose reclaim() always fails. */
function failingChain() {
  const calls: string[] = [];
  const chain = {
    kind: 'solana',
    async reclaim(market: string) {
      calls.push(market);
      throw new Error('rpc down');
    },
  } as unknown as ChainAdapter;
  return { chain, calls };
}

test('memory chain: reclaim is a no-op and the queue stays empty', async () => {
  const chain = new MemoryChain();
  assert.deepEqual(await chain.reclaim('x'), { positions: 0, market: false, done: true });
  const r = new Reclaimer(chain, { delayMs: 0 });
  r.enqueue('m1');
  assert.equal(r.pending, 0);
});

test('reclaimer: waits, retries failures with backoff, re-runs until done, dedupes', async () => {
  let n = 0;
  const calls: string[] = [];
  const chain = {
    kind: 'solana',
    async reclaim(market: string) {
      calls.push(market);
      n++;
      if (n === 1) throw new Error('rpc down');
      if (n === 2) return { positions: 3, market: false, done: false };
      return { positions: 0, market: true, done: true };
    },
  } as unknown as ChainAdapter;
  const r = new Reclaimer(chain, { delayMs: 30, retryMs: 20 });
  r.enqueue('m1');
  r.enqueue('m1'); // duplicate ignored
  assert.equal(r.pending, 1);
  await wait(10);
  assert.equal(calls.length, 0); // still inside the delay
  await wait(200);
  assert.deepEqual(calls, ['m1', 'm1', 'm1']);
  assert.equal(r.pending, 0);
  assert.deepEqual(r.stats, { markets: 1, positions: 3, failures: 1, gaveUp: 0 });
  r.stop();
});

test('reclaimer: gives up after maxAttempts and never throws', async () => {
  const { chain, calls } = failingChain();
  const r = new Reclaimer(chain, { delayMs: 0, retryMs: 5, maxAttempts: 3 });
  r.enqueue('m2');
  await wait(150);
  assert.equal(calls.length, 3);
  assert.equal(r.pending, 0);
  assert.equal(r.stats.gaveUp, 1);
  r.stop();
});
