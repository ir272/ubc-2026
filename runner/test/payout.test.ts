import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payoutFor, positionTotal } from '../src/chain/payout.ts';

test('winners split the whole pool pro rata', () => {
  const pools = [300, 100]; // total 400
  assert.equal(payoutFor([150, 0], pools, 'Settled', 0), 200);
  assert.equal(payoutFor([150, 0], pools, 'Settled', 0) * 2, 400);
  assert.equal(payoutFor([0, 100], pools, 'Settled', 1), 400);
  assert.equal(payoutFor([0, 100], pools, 'Settled', 0), 0); // loser
});

test('payout floors (dust stays in the vault)', () => {
  const pools = [3, 4]; // total 7
  const a = payoutFor([1, 0], pools, 'Settled', 0); // 7/3 = 2.33
  const b = payoutFor([2, 0], pools, 'Settled', 0); // 14/3 = 4.67
  assert.equal(a, 2);
  assert.equal(b, 4);
  assert.ok(a + b <= 7);
});

test('a position with stakes on several outcomes is paid only for the winner', () => {
  const pools = [50, 50, 100]; // total 200
  assert.equal(payoutFor([10, 40, 0], pools, 'Settled', 1), 160);
  assert.equal(payoutFor([10, 40, 0], pools, 'Settled', 2), 0);
});

test('nobody on the winner → everyone gets a full refund', () => {
  const pools = [0, 70, 30];
  assert.equal(payoutFor([0, 70, 0], pools, 'Settled', 0), 70);
  assert.equal(payoutFor([0, 20, 30], pools, 'Settled', 0), 50);
});

test('void → full refund of everything staked', () => {
  const pools = [10, 20];
  assert.equal(payoutFor([5, 7], pools, 'Void', 0), 12);
  assert.equal(payoutFor([0, 0], pools, 'Void', 1), 0);
});

test('a lone bettor gets their stake back when they win', () => {
  assert.equal(payoutFor([42, 0], [42, 0], 'Settled', 0), 42);
});

test('large pools keep precision', () => {
  const big = 4_000_000_000_000_000; // 4e15 base units = 4e9 PLAY
  assert.equal(payoutFor([big / 2, 0], [big, big], 'Settled', 0), big);
  assert.equal(positionTotal([1, 2, 3]), 6);
});
