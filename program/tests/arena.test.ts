// Runs against a local validator with the program deployed (`anchor test` does both).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { createClient, commitmentFor, randomSecret, toBase, type ArenaClient } from '@arena/sdk';

const RPC = process.env.ANCHOR_PROVIDER_URL ?? 'http://127.0.0.1:8899';
const conn = new Connection(RPC, 'confirmed');
const admin = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(new URL('../.keys/admin.json', import.meta.url), 'utf8'))),
);
const programId = new PublicKey(
  JSON.parse(readFileSync(new URL('../target/idl/arena.json', import.meta.url), 'utf8')).address,
);
const feePayer = Keypair.generate(); // the "relayer": pays every fee and every rent
let c: ArenaClient;
let nextId = BigInt(Date.now()) * 1000n;

async function send(ixs: TransactionInstruction[], signers: Keypair[]) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = signers[0].publicKey;
  return sendAndConfirmTransaction(conn, tx, signers, { commitment: 'confirmed' });
}

async function expectFail(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e: any) {
    const text = `${e?.message ?? e}\n${(e?.logs ?? (await e?.getLogs?.(conn).catch(() => [])) ?? []).join('\n')}`;
    assert.ok(text.includes(code), `expected ${code}, got:\n${text.slice(0, 1500)}`);
    return;
  }
  assert.fail(`expected failure ${code}, but it succeeded`);
}

async function waitForSlot(slot: bigint) {
  while (BigInt(await conn.getSlot('confirmed')) <= slot) await new Promise((r) => setTimeout(r, 200));
}

async function airdrop(to: PublicKey, sol: number) {
  const sig = await conn.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
  const bh = await conn.getLatestBlockhash();
  await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
}

/** A bettor with zero SOL and `play` PLAY. */
function assertRent(gained: number, rent: number) {
  assert.ok(gained >= rent && gained - rent < 1000, `admin gained ${gained}, expected the rent ${rent}`);
}

async function bettor(play: number) {
  const k = Keypair.generate();
  await send(c.grantIxs({ owner: k.publicKey, amount: toBase(play), payer: feePayer.publicKey }), [feePayer, admin]);
  return k;
}

async function bet(owner: Keypair, market: PublicKey, outcome: number, play: number) {
  return send([c.placeBetIx({ market, owner: owner.publicKey, outcome, amount: toBase(play), payer: feePayer.publicKey })], [feePayer, owner]);
}

async function newMarket(o: { outcomes: number; closeIn: number; deadlineIn?: number; commitment?: Uint8Array }) {
  const id = nextId++;
  const slot = BigInt(await conn.getSlot('confirmed'));
  const closeSlot = slot + BigInt(o.closeIn);
  await send(
    [
      c.createMarketIx({
        id,
        channel: 'coinflip',
        outcomeCount: o.outcomes,
        closeSlot,
        settleDeadlineSlot: closeSlot + BigInt(o.deadlineIn ?? 1000),
        commitment: o.commitment,
        simHash: 'ab'.repeat(32),
      }),
    ],
    [admin],
  );
  return { market: c.marketPda(id), closeSlot, deadline: closeSlot + BigInt(o.deadlineIn ?? 1000) };
}

const bal = (k: Keypair) => c.fetchPlayBalance(k.publicKey);

/**
 * Lamports `who` gained in transaction `sig` (from the tx's own pre/post balances).
 * On `anchor test`'s validator the admin key is also the genesis mint, and its post-balance comes
 * out a few dozen lamports above pre + rent (more than the tx moved; not from the program, which
 * cannot mint lamports), so callers compare with a small tolerance.
 */
async function gainedIn(sig: string, who: PublicKey) {
  const tx = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  const keys = tx!.transaction.message.getAccountKeys().staticAccountKeys;
  const i = keys.findIndex((k) => k.equals(who));
  return tx!.meta!.postBalances[i] - tx!.meta!.preBalances[i];
}

before(async () => {
  c = createClient({ connection: conn, programId, admin: admin.publicKey });
  if ((await conn.getBalance(admin.publicKey)) < LAMPORTS_PER_SOL) await airdrop(admin.publicKey, 10);
  await airdrop(feePayer.publicKey, 10);
  if (!(await c.fetchConfig())) await send([c.initializeIx()], [admin]);
  const cfg = await c.fetchConfig();
  assert.ok(cfg && cfg.admin.equals(admin.publicKey) && cfg.mint.equals(c.mintPda()));
});

test('happy path: several bettors, wrong secret rejected, exact payouts, double claim rejected', async () => {
  const secret = randomSecret();
  const { market, closeSlot } = await newMarket({ outcomes: 3, closeIn: 25, commitment: commitmentFor(secret) });
  const [A, B, C, D] = await Promise.all([bettor(1000), bettor(1000), bettor(1000), bettor(1000)]);

  await bet(A, market, 0, 60);
  await bet(A, market, 0, 40); // second bet adds to the same position
  await bet(B, market, 1, 300);
  await bet(C, market, 0, 200);
  await bet(D, market, 2, 50);
  await bet(D, market, 0, 0.000001); // D hedges 1 base unit on the winner

  let m = (await c.fetchMarket(market))!;
  assert.equal(m.state, 'Open');
  assert.deepEqual(m.pools, [300_000_001n, 300_000_000n, 50_000_000n]);
  assert.equal(m.totalPool, 650_000_001n);
  assert.equal(m.channel, 'coinflip');
  assert.equal((await c.fetchPositions(market)).length, 4);
  assert.deepEqual((await c.fetchPosition(market, A.publicKey))!.amounts.slice(0, 3), [100_000_000n, 0n, 0n]);

  await expectFail(send([c.lockIx(market)], [feePayer]), 'TooEarly');
  await expectFail(send([c.settleIx(market, { secret, winner: 0 })], [admin]), 'NotLocked');

  await waitForSlot(closeSlot);
  await send([c.lockIx(market)], [feePayer]); // anyone can lock
  m = (await c.fetchMarket(market))!;
  assert.equal(m.state, 'Locked');
  assert.ok(m.entropySlot >= closeSlot);
  assert.ok(m.entropy.some((x) => x !== 0));

  await expectFail(send([c.lockIx(market)], [feePayer]), 'NotOpen');
  const wrong = randomSecret();
  await expectFail(send([c.settleIx(market, { secret: wrong, winner: 0 })], [admin]), 'BadSecret');
  const stranger = Keypair.generate();
  await expectFail(send([c.settleIx(market, { secret, winner: 0, admin: stranger.publicKey })], [feePayer, stranger]), 'Unauthorized');
  await expectFail(send([c.claimIx(market, A.publicKey)], [feePayer]), 'NotFinal');

  await send([c.settleIx(market, { secret, winner: 0 })], [admin]);
  m = (await c.fetchMarket(market))!;
  assert.equal(m.state, 'Settled');
  assert.equal(m.winner, 0);
  assert.deepEqual(Buffer.from(m.secret), Buffer.from(secret));
  const expectSeed = createHash('sha256').update(secret).update(m.entropy).update(market.toBytes()).digest('hex');
  assert.equal(c.computeSeed(m.secret, m.entropy, market), expectSeed);

  const before = { A: await bal(A), B: await bal(B), C: await bal(C), D: await bal(D) };
  // claims are permissionless: the relayer claims for everyone
  for (const k of [A, B, C, D]) await send([c.claimIx(market, k.publicKey)], [feePayer]);
  // total 650_000_001, winner pool 300_000_001
  assert.equal((await bal(A)) - before.A, (100_000_000n * 650_000_001n) / 300_000_001n); // 216_666_666
  assert.equal((await bal(A)) - before.A, 216_666_666n);
  assert.equal((await bal(C)) - before.C, 433_333_332n);
  assert.equal((await bal(B)) - before.B, 0n);
  assert.equal((await bal(D)) - before.D, 2n);
  assert.equal(await bal(A), toBase(1000) - 100_000_000n + 216_666_666n);
  assert.ok((await c.fetchPosition(market, A.publicKey))!.claimed);

  await expectFail(send([c.claimIx(market, A.publicKey)], [feePayer]), 'AlreadyClaimed');
  await expectFail(send([c.voidIx(market)], [admin]), 'AlreadyFinal');
});

test('bet at/after close_slot is rejected', async () => {
  const { market, closeSlot } = await newMarket({ outcomes: 2, closeIn: 3 });
  const A = await bettor(100);
  await waitForSlot(closeSlot);
  await expectFail(bet(A, market, 0, 10), 'BettingClosed');
});

test('admin void and full refund', async () => {
  const { market } = await newMarket({ outcomes: 4, closeIn: 200 });
  const [A, B] = await Promise.all([bettor(500), bettor(500)]);
  await bet(A, market, 0, 70);
  await bet(A, market, 3, 30);
  await bet(B, market, 1, 250);
  await send([c.voidIx(market)], [admin]);
  assert.equal((await c.fetchMarket(market))!.state, 'Void');
  await expectFail(bet(A, market, 0, 1), 'NotOpen');
  await send([c.claimIx(market, A.publicKey)], [feePayer]);
  await send([c.claimIx(market, B.publicKey)], [feePayer]);
  assert.equal(await bal(A), toBase(500));
  assert.equal(await bal(B), toBase(500));
  await expectFail(send([c.claimIx(market, B.publicKey)], [feePayer]), 'AlreadyClaimed');
});

test('anyone may void after settle_deadline_slot, not before', async () => {
  const { market, deadline } = await newMarket({ outcomes: 2, closeIn: 15, deadlineIn: 4 });
  const A = await bettor(100);
  await bet(A, market, 1, 40);
  const anyone = Keypair.generate();
  await expectFail(send([c.voidIx(market, anyone.publicKey)], [feePayer, anyone]), 'Unauthorized');
  await waitForSlot(deadline);
  await send([c.voidIx(market, anyone.publicKey)], [feePayer, anyone]);
  await send([c.claimIx(market, A.publicKey)], [feePayer]);
  assert.equal(await bal(A), toBase(100));
});

test('nobody backed the winner: everyone is refunded', async () => {
  const { market, closeSlot } = await newMarket({ outcomes: 3, closeIn: 8 }); // live: zero commitment
  const [A, B] = await Promise.all([bettor(100), bettor(100)]);
  await bet(A, market, 0, 10);
  await bet(B, market, 1, 25);
  await waitForSlot(closeSlot);
  await send([c.lockIx(market)], [feePayer]);
  await send([c.settleIx(market, { winner: 2 })], [admin]); // live market: any secret accepted
  await send([c.claimIx(market, A.publicKey)], [feePayer]);
  await send([c.claimIx(market, B.publicKey)], [feePayer]);
  assert.equal(await bal(A), toBase(100));
  assert.equal(await bal(B), toBase(100));
});

test('fee payer differs from bettor: bettor holds no SOL; relay flow + guard', async () => {
  const { market } = await newMarket({ outcomes: 2, closeIn: 200 });
  const A = await bettor(100);
  assert.equal(await conn.getBalance(A.publicKey), 0);
  const payerBefore = await conn.getBalance(feePayer.publicKey);

  // browser: build + sign with the silent key; server: guard, co-sign, send
  const { blockhash } = await conn.getLatestBlockhash();
  const b64 = c.placeBetTx({ market, owner: A, outcome: 1, amount: toBase(12.5), feePayer: feePayer.publicKey, recentBlockhash: blockhash });
  const tx = c.checkRelayTx(b64, feePayer.publicKey);
  tx.partialSign(feePayer);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight: (await conn.getLatestBlockhash()).lastValidBlockHeight }, 'confirmed');

  assert.equal(await conn.getBalance(A.publicKey), 0);
  assert.ok((await conn.getBalance(feePayer.publicKey)) < payerBefore); // paid fee + position rent
  assert.equal((await c.fetchPosition(market, A.publicKey))!.amounts[1], 12_500_000n);
  assert.equal(await bal(A), toBase(87.5));

  // the guard refuses admin instructions and foreign programs
  const bad = new Transaction().add(c.voidIx(market, feePayer.publicKey));
  bad.feePayer = feePayer.publicKey;
  bad.recentBlockhash = blockhash;
  assert.throws(() => c.checkRelayTx(Buffer.from(bad.serialize({ requireAllSignatures: false })).toString('base64'), feePayer.publicKey), /not allowed/);
  const grant = c.grantTx({ owner: A.publicKey, amount: 1n, payer: feePayer.publicKey });
  grant.recentBlockhash = blockhash;
  assert.throws(() => c.checkRelayTx(Buffer.from(grant.serialize({ requireAllSignatures: false })).toString('base64'), feePayer.publicKey), /foreign program/);
});

test('close_position / close_market return rent to the admin; guards hold', async () => {
  const secret = randomSecret();
  const { market, closeSlot } = await newMarket({ outcomes: 2, closeIn: 20, commitment: commitmentFor(secret) });
  const [A, B] = await Promise.all([bettor(100), bettor(100)]);
  await bet(A, market, 0, 10);
  await bet(A, market, 1, 5); // same position, still one account
  await bet(B, market, 1, 20);
  assert.equal((await c.fetchMarket(market))!.positions, 2);
  const posA = c.positionPda(market, A.publicKey);
  const posB = c.positionPda(market, B.publicKey);
  const stranger = Keypair.generate();

  // Open: neither closes
  await expectFail(send([c.closeMarketIx(market)], [feePayer, admin]), 'NotFinal');
  await expectFail(send([c.closePositionIx(market, A.publicKey)], [feePayer, admin]), 'NotClaimed');

  await waitForSlot(closeSlot);
  await send([c.lockIx(market)], [feePayer]);
  // Locked: still no
  await expectFail(send([c.closeMarketIx(market)], [feePayer, admin]), 'NotFinal');
  await send([c.settleIx(market, { secret, winner: 0 })], [admin]);

  // Settled, nothing claimed yet
  await expectFail(send([c.closeMarketIx(market)], [feePayer, admin]), 'PositionsOpen');
  await expectFail(send([c.closePositionIx(market, A.publicKey)], [feePayer, admin]), 'NotClaimed');

  await send([c.claimIx(market, A.publicKey)], [feePayer]);
  // non-admin may not close, even a claimed position or a finished market
  await expectFail(send([c.closePositionIx(market, A.publicKey, stranger.publicKey)], [feePayer, stranger]), 'Unauthorized');
  await expectFail(send([c.closeMarketIx(market, stranger.publicKey)], [feePayer, stranger]), 'Unauthorized');

  // A is claimed: close it; the admin receives exactly the position's lamports (feePayer pays the fee)
  const rentA = await conn.getBalance(posA);
  assert.ok(rentA > 0);
  let sig = await send([c.closePositionIx(market, A.publicKey)], [feePayer, admin]);
  assertRent(await gainedIn(sig, admin.publicKey), rentA);
  assert.equal(await conn.getAccountInfo(posA), null);
  assert.equal((await c.fetchMarket(market))!.positions, 1);
  // a closed position cannot be claimed again
  await expectFail(send([c.claimIx(market, A.publicKey)], [feePayer]), 'AccountNotInitialized');

  // B is still unclaimed: the market stays, B's claim still works afterwards
  await expectFail(send([c.closeMarketIx(market)], [feePayer, admin]), 'PositionsOpen');
  const balB = await bal(B);
  await send([c.claimIx(market, B.publicKey)], [feePayer]);
  assert.equal(await bal(B), balB); // B backed the loser

  // close B and the market in one transaction
  const rentB = await conn.getBalance(posB);
  const rentM = await conn.getBalance(market);
  sig = await send([c.closePositionIx(market, B.publicKey), c.closeMarketIx(market)], [feePayer, admin]);
  assertRent(await gainedIn(sig, admin.publicKey), rentB + rentM);
  assert.equal(await conn.getAccountInfo(market), null);
  assert.equal(await conn.getAccountInfo(posB), null);
});

test('void market: positions and market close after refunds; empty market closes at once', async () => {
  const { market } = await newMarket({ outcomes: 3, closeIn: 200 });
  const A = await bettor(50);
  await bet(A, market, 2, 7);
  await send([c.voidIx(market)], [admin]);
  await expectFail(send([c.closeMarketIx(market)], [feePayer, admin]), 'PositionsOpen');
  await send([c.claimIx(market, A.publicKey)], [feePayer]);
  assert.equal(await bal(A), toBase(50));
  await send([c.closePositionIx(market, A.publicKey), c.closeMarketIx(market)], [feePayer, admin]);
  assert.equal(await conn.getAccountInfo(market), null);

  // a window nobody bet on: void then close straight away
  const { market: empty } = await newMarket({ outcomes: 2, closeIn: 200 });
  assert.equal((await c.fetchMarket(empty))!.positions, 0);
  await send([c.voidIx(empty)], [admin]);
  const rent = await conn.getBalance(empty);
  const sig = await send([c.closeMarketIx(empty)], [feePayer, admin]);
  assertRent(await gainedIn(sig, admin.publicKey), rent);
});

test('checkRelayTx refuses close_position and close_market', async () => {
  const { market } = await newMarket({ outcomes: 2, closeIn: 200 });
  const { blockhash } = await conn.getLatestBlockhash();
  for (const i of [c.closeMarketIx(market), c.closePositionIx(market, Keypair.generate().publicKey)]) {
    const t = new Transaction().add(i);
    t.feePayer = feePayer.publicKey;
    t.recentBlockhash = blockhash;
    assert.throws(() => c.checkRelayTx(Buffer.from(t.serialize({ requireAllSignatures: false })).toString('base64'), feePayer.publicKey), /not allowed/);
  }
});
