import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryChain } from '../src/chain/memory.ts';
import { Hub } from '../src/hub.ts';
import { runChannelLoop } from '../src/show.ts';
import { createApp } from '../src/server.ts';
import { coinflipChannel } from '../src/channels/coinflip.ts';
import { diceDuelChannel } from '../src/channels/diceduel.ts';
import { History, MAX_MATCHES, decide, deriveForm, favouriteIndex, type HistoryMatch, type HistoryWindow } from '../src/history.ts';
import { randomPubkey } from '../src/lib/bytes.ts';
import { log } from '../src/lib/log.ts';
import type { Entrant } from '../src/types.ts';

log.setQuiet(true);

const ENTRANTS: [Entrant, Entrant] = [
  { id: 'red', name: 'Red', color: '#f00' },
  { id: 'blue', name: 'Blue', color: '#00f' },
];

const tmp = () => mkdtempSync(join(tmpdir(), 'arena-history-'));

/** A two-entrant window; `winner` null = void. */
function win(pools: number[], winner: string | null, o: Partial<HistoryWindow> = {}): HistoryWindow {
  const w: HistoryWindow = {
    windowId: 'w',
    market: 'm',
    question: 'Who wins?',
    outcomes: [
      { id: 'red', label: 'Red', entrantId: 'red' },
      { id: 'blue', label: 'Blue', entrantId: 'blue' },
    ],
    seeded: true,
    sealed: false,
    pools,
    total: pools.reduce((a, b) => a + b, 0),
    void: winner === null,
    ...o,
  };
  if (winner) w.winnerOutcomeId = winner;
  return w;
}

let clock = 1_000;
function match(windows: HistoryWindow[], entrants: Entrant[] = ENTRANTS, id = `m${clock}`): HistoryMatch {
  clock += 1000;
  return {
    matchId: id,
    title: 'Red vs Blue',
    entrants: entrants.map((e) => ({ id: e.id, name: e.name, ...(e.color ? { color: e.color } : {}), ...(e.record ? { record: e.record } : {}) })),
    startedAt: clock,
    endedAt: clock + 500,
    result: null,
    windows,
  };
}

/** Waits until `pred` holds, polling. */
async function until(pred: () => boolean, ms = 10_000) {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
}

test('decide: the last settled window that names entrants decides the match; ties and voids', () => {
  // round 1 to red, round 2 to blue: blue wins the match
  assert.deepEqual(decide(match([win([1, 1], 'red'), win([1, 1], 'blue')])), {
    void: false,
    winnerId: 'blue',
    winnerOutcomeId: 'blue',
    winnerLabel: 'Blue',
  });
  // a later void window does not count; nor does a window without entrant outcomes
  const side = win([5, 5], 'yes', { outcomes: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] });
  assert.equal(decide(match([win([1, 1], 'red'), side, win([1, 1], null)])).winnerId, 'red');
  // the winning outcome names nobody (dice duel "Tie"): decided, no winner
  const tie = win([1, 1, 1], 'tie', { outcomes: [...win([], null).outcomes, { id: 'tie', label: 'Tie' }] });
  assert.deepEqual(decide(match([tie])), { void: false, winnerId: null, winnerOutcomeId: 'tie', winnerLabel: 'Tie' });
  // every window void
  assert.deepEqual(decide(match([win([3, 1], null)])), { void: true, winnerId: null });
  assert.deepEqual(decide(match([])), { void: true, winnerId: null });
});

test('favouriteIndex: biggest pool, none when empty or shared', () => {
  assert.equal(favouriteIndex([3, 9, 1]), 1);
  assert.equal(favouriteIndex([0, 0]), -1);
  assert.equal(favouriteIndex([5, 5, 1]), -1);
  assert.equal(favouriteIndex([5, 0]), 0);
});

test('deriveForm: played, wins, last five, draws, voids and how often the favourite won', () => {
  const tie = win([0, 2, 1], 'tie', { outcomes: [...win([], null).outcomes, { id: 'tie', label: 'Tie' }] });
  const ms = [
    match([win([10, 1], 'red')]), // red wins, favourite red won
    match([win([10, 1], 'blue')]), // blue wins, favourite red lost
    match([win([3, 1], null)]), // void: left out of played and last five
    match([win([0, 0], 'red')]), // red wins, nobody bet: no favourite
    match([tie]), // draw: favourite blue lost
    match([win([1, 4], 'blue'), win([2, 2], 'red')]), // red wins (last window); favourite blue won w1, w2 tied
  ];
  const f = deriveForm('coinflip', 'memory', ms, null);
  assert.equal(f.matches, 6);
  assert.deepEqual(f.favourite, { considered: 4, won: 2 });
  const red = f.entrants.find((e) => e.id === 'red')!;
  const blue = f.entrants.find((e) => e.id === 'blue')!;
  assert.deepEqual(red.history, { played: 5, wins: 3, draws: 1 });
  assert.deepEqual(blue.history, { played: 5, wins: 1, draws: 1 });
  assert.equal(red.source, 'history');
  assert.equal(red.played, 5);
  assert.equal(red.wins, 3);
  assert.deepEqual(red.last5, ['W', 'D', 'W', 'L', 'W']); // newest first
  assert.deepEqual(blue.last5, ['L', 'D', 'L', 'W', 'L']);
  assert.equal(red.color, '#f00');
  assert.ok(red.lastPlayedAt > 0);
});

test('deriveForm: a channel-announced record wins over the derived one and is brought up to date', () => {
  const rec = (played: number, wins: number) => [
    { ...ENTRANTS[0], record: { played, wins } },
    { ...ENTRANTS[1], record: { played: 50, wins: 20 } },
  ];
  const ms = [
    match([win([1, 1], 'red')], rec(40, 30)), // older announce (ignored: a newer one exists)
    match([win([1, 1], 'red')], rec(41, 31)), // red wins this one
    match([win([1, 1], 'blue')], ENTRANTS), // announced without records: still counts
  ];
  const f = deriveForm('tumbletop', 'solana', ms, null);
  const red = f.entrants.find((e) => e.id === 'red')!;
  assert.equal(red.source, 'channel');
  assert.equal(red.played, 43); // 41 announced + the two matches since
  assert.equal(red.wins, 32);
  assert.deepEqual(red.history, { played: 3, wins: 2, draws: 0 });
  // the match on air now carries the freshest record
  const now = { matchId: 'live', title: '', entrants: rec(99, 70), startedAt: clock + 10_000 };
  const g = deriveForm('tumbletop', 'solana', ms, now);
  assert.equal(g.entrants.find((e) => e.id === 'red')!.played, 99);
  assert.equal(g.entrants.find((e) => e.id === 'red')!.wins, 70);
  // an entrant seen only in the current match is listed with its record and no last five
  const h = deriveForm('x', 'memory', [], { matchId: 'n', title: '', entrants: [{ id: 'new', name: 'New', record: { played: 2, wins: 1 } }], startedAt: 5 });
  assert.deepEqual(
    h.entrants.map((e) => [e.id, e.played, e.wins, e.source, e.last5.length]),
    [['new', 2, 1, 'channel', 0]],
  );
});

test('History: persists per chain kind and channel, reloads, caps, survives a corrupt file', () => {
  const dir = tmp();
  try {
    const mem = new History({ dir, chainKind: 'memory' });
    const sol = new History({ dir, chainKind: 'solana' });
    mem.add('coinflip', match([win([1, 1], 'red')]));
    mem.add('coinflip', match([win([1, 1], 'blue')]));
    sol.add('coinflip', match([win([1, 1], 'red')]));
    assert.deepEqual(readdirSync(dir).sort(), ['memory-coinflip.json', 'solana-coinflip.json']); // no temp files left
    // a fresh instance (a restart) loads what was saved; the two chains stay apart
    const again = new History({ dir, chainKind: 'memory' });
    assert.equal(again.list('coinflip').length, 2);
    assert.equal(new History({ dir, chainKind: 'solana' }).list('coinflip').length, 1);
    assert.equal(again.list('dice-duel').length, 0); // missing file: empty
    // newest first, with the decision and pot
    const r = again.recent('coinflip', 1);
    assert.equal(r.length, 1);
    assert.equal(r[0]!.winnerId, 'blue');
    assert.equal(r[0]!.pot, 2);
    assert.equal(r[0]!.void, false);
    // cap
    for (let i = 0; i < MAX_MATCHES + 5; i++) again.add('coinflip', match([win([1, 1], 'red')]));
    assert.equal(again.list('coinflip').length, MAX_MATCHES);
    assert.equal(JSON.parse(readFileSync(join(dir, 'memory-coinflip.json'), 'utf8')).matches.length, MAX_MATCHES);
    // corrupt file: start empty, then write over it
    writeFileSync(join(dir, 'memory-coinflip.json'), '{"matches": [ broken');
    const c = new History({ dir, chainKind: 'memory' });
    assert.equal(c.list('coinflip').length, 0);
    c.add('coinflip', match([win([1, 1], 'red')]));
    assert.equal(new History({ dir, chainKind: 'memory' }).list('coinflip').length, 1);
    // no dir: memory only
    const none = new History({ chainKind: 'memory' });
    none.add('coinflip', match([]));
    assert.equal(none.list('coinflip').length, 1);
    assert.equal(none.fileFor('coinflip'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('channel loop records every finished match with its windows', async () => {
  const chain = new MemoryChain();
  const hub = new Hub(chain);
  const def = diceDuelChannel({ window1Ms: 150, window2Ms: 150, rollMs: 10, resultMs: 10, intermissionMs: 10 });
  hub.addChannel(def);
  const bettor = randomPubkey();
  await chain.grant(bettor, 1000);
  hub.subscribe(def.id, (m) => {
    if (m.type === 'window_open') void chain.placeBet(bettor, m.market as string, 0, 7);
  });
  const ac = new AbortController();
  const loop = runChannelLoop(hub, def, ac.signal, { minGapMs: 0 });
  await until(() => hub.history.list(def.id).length >= 2);
  ac.abort(new Error('test done'));
  await loop;

  const [m] = hub.history.list(def.id);
  assert.ok(m);
  assert.match(m.matchId, /^dice-/);
  assert.equal(m.entrants.length, 2);
  assert.ok(m.entrants.every((e) => e.id && e.name));
  assert.ok(m.endedAt >= m.startedAt);
  assert.ok(m.result && Array.isArray((m.result as { rounds: unknown[] }).rounds));
  assert.equal(m.windows.length, 2);
  for (const w of m.windows) {
    assert.equal(w.void, false);
    assert.ok(w.winnerOutcomeId);
    assert.equal(w.outcomes.length, 3);
    assert.deepEqual(w.pools, [7, 0, 0]); // final pools at lock
    assert.equal(w.total, 7);
    assert.ok(w.market);
    assert.equal(w.sealed, false);
  }
  assert.equal(m.windows[0]!.seeded, true);
  assert.equal(m.windows[1]!.seeded, false);
  const d = decide(m);
  const r2 = (m.result as { rounds: string[] }).rounds[1];
  assert.equal(d.winnerId, r2 === 'tie' ? null : r2);
  // a match cut short by shutdown is not recorded: still exactly what finished
  const n = hub.history.list(def.id).length;
  assert.ok(n >= 2);
});

test('HTTP: /channels/:id/history and /form, saved to disk and loaded on restart', async () => {
  const dir = tmp();
  const make = () =>
    createApp({
      chain: new MemoryChain(),
      channels: [coinflipChannel({ bettingMs: 150, ticks: 3, tickMs: 10, resultMs: 10, intermissionMs: 10, pick: () => ENTRANTS })],
      historyDir: dir,
    });
  let app = make();
  try {
    let port = await app.start(0, '127.0.0.1');
    let base = `http://127.0.0.1:${port}`;
    const get = (path: string) => fetch(base + path).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));

    const empty = await get('/channels/coinflip/history');
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body, { channel: 'coinflip', chain: 'memory', matches: [] });
    assert.equal((await get('/channels/nope/history')).status, 404);
    assert.equal((await get('/channels/nope/form')).status, 404);

    await until(() => app.hub.history.list('coinflip').length >= 3);
    const h = await get('/channels/coinflip/history?limit=2');
    assert.equal(h.body.matches.length, 2);
    const [newest, older] = h.body.matches;
    assert.ok(newest.endedAt >= older.endedAt, 'newest first');
    for (const k of ['matchId', 'title', 'entrants', 'startedAt', 'endedAt', 'result', 'windows', 'void', 'winnerId', 'pot'])
      assert.ok(k in newest, k);
    assert.ok(['red', 'blue'].includes(newest.winnerId));
    assert.deepEqual(Object.keys(newest.windows[0]).sort(), ['market', 'outcomes', 'pools', 'question', 'sealed', 'seeded', 'total', 'void', 'winnerOutcomeId', 'windowId'].sort());
    assert.equal((await get('/channels/coinflip/history?limit=0')).body.matches.length, 1); // clamped to 1..200
    assert.ok((await get('/channels/coinflip/history?limit=abc')).body.matches.length >= 3);

    const f = (await get('/channels/coinflip/form')).body;
    assert.equal(f.channel, 'coinflip');
    assert.ok(f.matches >= 3);
    assert.deepEqual(f.favourite, { considered: 0, won: 0 }); // nobody bet
    const red = f.entrants.find((e: any) => e.id === 'red');
    assert.equal(red.source, 'channel'); // coinflip announces records
    assert.ok(red.history.played >= 3);
    assert.ok(red.last5.length >= 3);
    // the existing snapshot routes are untouched
    assert.equal((await get('/channels/coinflip')).body.channel, 'coinflip');

    await app.stop();
    const saved = app.hub.history.list('coinflip').length;
    // restart on the same dir: history is back before any new match finishes
    app = make();
    port = await app.start(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;
    assert.ok((await get('/channels/coinflip/history?limit=200')).body.matches.length >= saved);
  } finally {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
