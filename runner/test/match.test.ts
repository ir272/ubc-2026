import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MemoryChain } from '../src/chain/memory.ts';
import { Hub, type FeedMsg } from '../src/hub.ts';
import { runChannelLoop } from '../src/show.ts';
import { coinflipChannel, simulate } from '../src/channels/coinflip.ts';
import { diceDuelChannel } from '../src/channels/diceduel.ts';
import { b58decode, randomPubkey } from '../src/lib/bytes.ts';
import { log } from '../src/lib/log.ts';
import type { ChannelDef, Entrant } from '../src/types.ts';

log.setQuiet(true);

const ENTRANTS: [Entrant, Entrant] = [
  { id: 'red', name: 'Red', color: '#f00' },
  { id: 'blue', name: 'Blue', color: '#00f' },
];

/** Runs one channel until `until` returns true for some feed message; returns everything seen. */
async function runUntil(def: ChannelDef, chain: MemoryChain, until: (m: FeedMsg, all: FeedMsg[]) => boolean, onMsg?: (m: FeedMsg, hub: Hub) => void) {
  const hub = new Hub(chain);
  hub.addChannel(def);
  const ac = new AbortController();
  const seen: FeedMsg[] = [];
  const done = new Promise<void>((resolve) => {
    hub.subscribe(def.id, (m) => {
      seen.push(m);
      onMsg?.(m, hub);
      if (until(m, seen)) resolve();
    });
  });
  const loop = runChannelLoop(hub, def, ac.signal, { errorPauseMs: 30, minGapMs: 0 });
  const timeout = setTimeout(() => ac.abort(new Error('test timeout')), 15_000);
  await done;
  clearTimeout(timeout);
  ac.abort(new Error('test done'));
  await loop;
  return { seen, hub };
}

const sha = (...p: Uint8Array[]) => {
  const h = createHash('sha256');
  for (const x of p) h.update(x);
  return h.digest('hex');
};

test('full coinflip match with several bettors: balances, seed and outcome all check out', async () => {
  const chain = new MemoryChain();
  const people = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((k) => [k, randomPubkey()]));
  for (const k of Object.keys(people)) await chain.grant(people[k]!, 1000);
  const supply = 5000;
  const def = coinflipChannel({ bettingMs: 300, ticks: 10, tickMs: 10, resultMs: 20, intermissionMs: 20, pick: () => ENTRANTS });

  const bets: [string, number, number][] = [
    ['A', 0, 100],
    ['B', 1, 300],
    ['C', 0, 50],
    ['C', 1, 50],
    ['D', 0, 7],
  ];
  const { seen } = await runUntil(
    def,
    chain,
    (m) => m.type === 'match_end',
    (m) => {
      if (m.type === 'window_open') for (const [who, o, amt] of bets) void chain.placeBet(people[who]!, m.market as string, o, amt);
    },
  );

  const types = seen.map((m) => m.type);
  for (const t of ['phase', 'match', 'window_open', 'pools', 'window_locked', 'event', 'window_settled', 'match_end'])
    assert.ok(types.includes(t), `saw ${t}`);
  // phases driven by the show calls, in order
  assert.deepEqual(
    seen.filter((m) => m.type === 'phase').map((m) => m.phase),
    ['lobby', 'live', 'result'],
  );

  const open = seen.find((m) => m.type === 'window_open')!;
  const locked = seen.find((m) => m.type === 'window_locked')!;
  const settled = seen.find((m) => m.type === 'window_settled')!;
  const market = open.market as string;

  // seed = sha256(secret ‖ entropy ‖ market), reproducible from published values only
  const secret = Buffer.from(settled.secret as string, 'hex');
  const entropy = Buffer.from(locked.entropy as string, 'hex');
  assert.equal(sha(secret, entropy, b58decode(market)), locked.seed);
  // and the commitment published at open matches the secret revealed at settle
  assert.equal(sha(secret), open.commitment);
  // the winner is what the pure simulation says for that seed
  const sim = simulate({ seed: locked.seed as string, entrants: ENTRANTS, options: { ticks: 10, tickMs: 10 } });
  assert.equal(settled.winnerOutcomeId, sim.result.winnerId);
  // events forwarded in order with the sim's types
  const evs = seen.filter((m) => m.type === 'event').map((m) => (m.event as { type: string }).type);
  assert.equal(evs[0], 'start');
  assert.equal(evs.at(-1), 'finish');
  assert.equal(evs.length, sim.events.length);

  // balances: independent recomputation of the parimutuel split
  const w = settled.winnerOutcomeId === 'red' ? 0 : 1;
  const pools = [157, 350];
  assert.deepEqual(locked.pools, pools);
  const total = 507;
  const staked: Record<string, number[]> = { A: [100, 0], B: [0, 300], C: [50, 50], D: [7, 0], E: [0, 0] };
  let paidOut = 0;
  for (const k of Object.keys(staked)) {
    const st = staked[k]!;
    const pay = Math.floor((st[w]! * total) / pools[w]!);
    paidOut += pay;
    assert.equal(await chain.getBalance(people[k]!), 1000 - st[0]! - st[1]! + pay, `balance of ${k}`);
  }
  // red wins: A 322, C 161, D 22 (dust 2); blue wins: B 434, C 72 (dust 1)
  assert.equal(paidOut, w === 0 ? 505 : 506);
  assert.equal(chain.vault, total - paidOut);
  let sum = chain.vault;
  for (const k of Object.keys(people)) sum += await chain.getBalance(people[k]!);
  assert.equal(sum, supply);
  const payouts = settled.payouts as { owner: string; amount: number }[];
  assert.equal(payouts.reduce((s, p) => s + p.amount, 0), paidOut);
});

test('a channel that throws mid-match refunds every bettor and the loop carries on', async () => {
  const chain = new MemoryChain();
  const a = randomPubkey();
  const b = randomPubkey();
  await chain.grant(a, 1000);
  await chain.grant(b, 1000);
  let runs = 0;
  const def: ChannelDef = {
    id: 'broken',
    title: 'Broken',
    intermissionMs: 10,
    async run(show) {
      runs++;
      show.announce({ matchId: `m${runs}`, title: 'boom', entrants: ENTRANTS });
      const w1 = await show.openWindow({ question: 'q1', outcomes: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], durationMs: 100, seeded: true });
      const w2 = await show.openWindow({ question: 'q2', outcomes: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], durationMs: 5000, seeded: false });
      await chain.placeBet(a, w1.market, 0, 100);
      await chain.placeBet(b, w1.market, 1, 40);
      await chain.placeBet(a, w2.market, 1, 30);
      await show.lock(w1); // w1 locked, w2 still open
      show.emit({ type: 'tick', at: 1 });
      if (runs === 1) throw new Error('game crashed');
      await show.settle(w1, 'x');
      await show.voidWindow(w2);
      show.end({});
    },
  };
  const { seen } = await runUntil(def, chain, (m) => m.type === 'match' && m.matchId === 'm2');
  assert.ok(runs >= 2, 'run() called again after the crash');
  const voids = seen.filter((m) => m.type === 'window_void');
  assert.equal(voids.length, 2, 'both the locked and the open window were voided');
  const end = seen.find((m) => m.type === 'match_end')!;
  assert.deepEqual(end.result, { aborted: true });
  assert.equal(await chain.getBalance(a), 1000);
  assert.equal(await chain.getBalance(b), 1000);
  assert.equal(chain.vault, 0);
});

test('a channel that returns with unsettled windows gets them voided', async () => {
  const chain = new MemoryChain();
  const a = randomPubkey();
  await chain.grant(a, 50);
  let runs = 0;
  const def: ChannelDef = {
    id: 'lazy',
    title: 'Lazy',
    intermissionMs: 10,
    async run(show) {
      runs++;
      show.announce({ matchId: `lazy${runs}`, title: 'lazy', entrants: ENTRANTS });
      const w = await show.openWindow({ question: 'q', outcomes: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], durationMs: 1000, seeded: false });
      await chain.placeBet(a, w.market, 0, 50);
    },
  };
  await runUntil(def, chain, (m) => m.type === 'window_void');
  assert.equal(await chain.getBalance(a), 50);
});

test('dice-duel: two windows in one match (seeded before, live mid-match) both settle', async () => {
  const chain = new MemoryChain();
  const a = randomPubkey();
  await chain.grant(a, 1000);
  const def = diceDuelChannel({ window1Ms: 150, window2Ms: 150, rollMs: 10, resultMs: 10, intermissionMs: 10 });
  const { seen } = await runUntil(
    def,
    chain,
    (m) => m.type === 'match_end',
    (m) => {
      if (m.type === 'window_open') void chain.placeBet(a, m.market as string, 2, 10); // "tie"
    },
  );
  const opens = seen.filter((m) => m.type === 'window_open');
  assert.equal(opens.length, 2);
  assert.equal(opens[0]!.seeded, true);
  assert.equal(opens[1]!.seeded, false);
  const locks = seen.filter((m) => m.type === 'window_locked');
  assert.ok(locks[0]!.seed && !locks[1]!.seed, 'only the seeded window publishes a seed');
  assert.equal(seen.filter((m) => m.type === 'window_settled').length, 2);
  // second window opened after the first settled (mid-match)
  assert.ok(seen.indexOf(opens[1]!) > seen.findIndex((m) => m.type === 'window_settled'));
  // a was alone on "tie" in each window: refunded unless tie won, in which case they win their own stake back
  assert.equal(await chain.getBalance(a), 1000);
});

test('simulate is deterministic and seed-dependent', () => {
  const s1 = 'ab'.repeat(32);
  const s2 = 'cd'.repeat(32);
  const r1 = simulate({ seed: s1, entrants: ENTRANTS });
  assert.deepEqual(simulate({ seed: s1, entrants: ENTRANTS }), r1);
  assert.equal(r1.durationMs, 20_000);
  assert.ok(r1.events.filter((e) => e.type === 'pos').length >= 100);
  assert.notDeepEqual(simulate({ seed: s2, entrants: ENTRANTS }).result.positions, r1.result.positions);
});

test('sealed window: private value is committed before betting, hidden until settle, and checkable after', async () => {
  const chain = new MemoryChain();
  let sealedSeen: string | undefined;
  let lockResult: { seed?: string } | undefined;
  const def: ChannelDef = {
    id: 'sealed-test',
    title: 'Sealed test',
    intermissionMs: 10,
    async run(show) {
      show.announce({ matchId: 'ms', title: 't', entrants: ENTRANTS });
      const w = await show.openWindow({ question: 'q', outcomes: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], durationMs: 100, seeded: false, sealed: true });
      sealedSeen = w.sealed;
      lockResult = await show.lock(w);
      await show.settle(w, 'x');
      show.end({});
    },
  };
  const { seen } = await runUntil(def, chain, (m) => m.type === 'window_settled');
  const settled = seen.find((m) => m.type === 'window_settled')! as any;
  const opened = seen.find((m) => m.type === 'window_open')! as any;
  assert.match(sealedSeen ?? '', /^[0-9a-f]{64}$/);
  assert.equal(lockResult?.seed, undefined, 'no public seed for a sealed window');
  const before = JSON.stringify(seen.filter((m) => m.type !== 'window_settled'));
  assert.ok(!before.includes(sealedSeen!), 'sealed value never broadcast before settle');
  assert.ok(!before.includes(settled.secret), 'secret never broadcast before settle');
  const secretBytes = Buffer.from(settled.secret, 'hex');
  assert.equal(sha(secretBytes), opened.commitment, 'commitment published at open matches the revealed secret');
  assert.equal(sha(Buffer.from('arena-sealed'), secretBytes), sealedSeen, 'sealed value can be recomputed from the revealed secret');
});
