# Arena runner

The match runner: for every channel it loops forever — announce a match → open a betting window
(an onchain pooled market) → lock it → run the match while forwarding game events → settle and pay
out → next match. HTTP + WebSocket on port **8787**. Seams are fixed by `../CONTRACT.md` §2.

## Run

```sh
cd runner
npm install
npm start                      # CHAIN=memory, coinflip + dice-duel, http://localhost:8787
HOUSE_BOTS=1 npm start         # plus house bettors so pools move
npm test                       # node --test (payout maths, full matches, HTTP/WS)
npm run typecheck
```

Node ≥ 23.6 runs the TypeScript directly (type stripping; no build step). Then open
**http://localhost:8787/dev**: the debug console (pick a channel, watch phase / windows / pools /
odds / events / chat, get a key + faucet, place bets).

## Env

| var | default | |
|---|---|---|
| `PORT` | `8787` | |
| `HOST` | all interfaces | |
| `CHAIN` | `memory` | `memory` (no network) or `solana` |
| `CHANNELS` | `coinflip,dice-duel` | comma list of built-in channels to run |
| `HOUSE_BOTS` | off | `1` = 4 labelled bot accounts place small random bets |
| `LOG_QUIET` | off | `1` silences logs |
| `HISTORY_DIR` | `data/history` | where finished matches are saved (`<chain kind>-<channel>.json`, gitignored) |
| `ADMIN_KEYPAIR` | `../program/.keys/admin.json` | solana only: admin/fee-payer keypair (solana-keygen JSON) |
| `DEPLOYED_PATH` | `../program/DEPLOYED.json` | solana only |
| `SOLANA_RPC` | public endpoint for the cluster in DEPLOYED.json | solana only. The public devnet endpoint rate-limits a runner with several channels; put a private devnet URL (e.g. a free Helius key) in `runner/.env` as `SOLANA_RPC=...` (gitignored; `npm start` loads it) |
| `RPC_STATS` | off | solana only: `1` logs RPC requests per method every 30 s (totals since start are always in `GET /health` as `rpc`) |
| `TX_PER_SEC` | `1` | solana only: most transactions sent per second (Helius free tier allows 1) |
| `POOL_POLL_MS` | `2000` memory, `5000` solana | how often open windows' pools are re-read |
| `BOT_KEYS` | `.keys/house-bots.json` | solana only: where bot keypairs are kept (gitignored) |
| `RECLAIM` | on | solana only: `0` turns off closing finished markets (rent stays locked) |
| `RECLAIM_DELAY_MS` | `20000` | solana only: wait after a window is paid before closing its accounts |
| `RPC_SOCKETS` | `6` | solana only: kept-alive connections all RPC requests share (public endpoints refuse many new connections) |
| `BOT_TICK_MS` | `1500` | house bots: how often they consider betting |
| `BOT_BET_CHANCE` | `0.2` | house bots: chance per bot per tick of betting on each open window (lower it on a public RPC) |

## Units

Every amount the runner exposes (balances, `pools`, `total`, payouts, `/dev/bet` amounts) is an
**integer in PLAY base units** (6 decimals, as onchain): `1 PLAY = 1_000_000`. `GET /config`
returns `decimals` and `unit`.

## API (contract + extras)

Contract routes: `GET /channels`, `GET /channels/:id`, `POST /faucet {owner}`, `POST /relay {tx}`,
`GET /me/:owner`, `POST /dev/bet {owner, windowId, outcomeId, amount}` (memory only), WS
`/ws?channel=<id>`.

Details and additions:
- `GET /channels` → array of snapshots (with `recentEvents`/`recentChat` empty). `GET /channels/:id` → full snapshot.
- Snapshot: `{ channel (id), title, phase, match, windows, recentEvents, serverNow, recentChat, bots }`.
  `match = { matchId, title, entrants, meta, startedAt, result? }`. Each window:
  `{ windowId, matchId, market, question, outcomes, closesAt, seeded, state: open|locked|settled|void, pools, total, simHash?, seed?, entropy?, winnerOutcomeId?, secret? (after settle), payouts? }`.
- `event` messages nest the GameEvent (it has its own `type`): `{ type: 'event', t, event: { type, at, data } }`.
- Extra feed messages: `phase { phase }` on every phase change; `error { message }` (to one socket, e.g. chat rate limit).
- Extra fields: `match.startedAt`; `window_open.simHash`, `window_open.commitment` (hex sha256(secret));
  `window_locked.pools/total` (final pools); `window_void.refunds`; `bot: true` on payout/refund entries of house bots.
- `POST /faucet` → `{ granted, balance }` (`granted: 0, already: true` on repeat). Once per key per process.
- `GET /me/:owner` → `{ balance, positions: [{ channel, matchId, windowId, market, question, outcomes, state, amounts, claimed, winnerOutcomeId?, payout? }] }` over the last 40 windows.
- `GET /config` → `{ chain, decimals, unit, faucetAmount, houseBots, programId?, mint?, config?, cluster?, feePayer? }`.
  Web: build `place_bet` with `feePayer` as fee payer, sign with the silent key, `POST /relay`.
- Chat: clients send `{ type: 'chat', name, text }`; text ≤ 280 chars, name ≤ 24, 5-message burst then
  1 per 2 s per connection; names starting with "HouseBot" are reserved.
- `GET /health`. On Solana it includes `rpc: { since, total, byMethod }`, the RPC requests sent since start.
- Snapshots carry `viewers` (open WebSocket connections on that channel) and the feed sends `{ type: 'viewers', viewers }` when it changes (at most once a second).
- Play-dollar transfers (the wallet's Withdraw): on Solana, `POST /relay` also accepts a transaction made
  of an optional ATA `CreateIdempotent` (payer = fee payer, recipient's PLAY account) plus one SPL
  `TransferChecked` of PLAY signed by the sender; the fee payer may never appear in the transfer. On
  memory, `POST /dev/transfer { from, to, amount }` → `{ ok, balance }`.
- Solana only: every window carries `txs` (its confirmed transactions: open, bet, lock, settle, void,
  payout; oldest first, capped at 48, oldest bets dropped first), the feed sends `{ type: 'tx', windowId,
  market, tx }` for each one, `window_open` carries the create_market tx, history windows keep up to 16,
  `POST /faucet` adds `signature`, and `GET /ledger?channel=&limit=` lists recent ones newest first.
  On the memory chain none of these fields appear and `/ledger` returns `txs: []`.

### Match history and form

The runner records every finished match per channel (the last 200, in memory and in
`data/history/<chain kind>-<channel>.json`; memory-chain and Solana history stay apart). The file is
written atomically and loaded at start; a missing or unreadable file means the channel starts empty.
A match cut short by a shutdown is not recorded.

- `GET /channels/:id/history?limit=20` (limit 1..200) → newest first:
  ```
  { channel, chain, matches: [{
      matchId, title, entrants: [{ id, name, color?, record? }], startedAt, endedAt, result,
      windows: [{ windowId, market, question, outcomes, seeded, sealed, pools, total, winnerOutcomeId?, void }],
      void, winnerId, winnerOutcomeId?, winnerLabel?, pot }] }
  ```
  `pools`/`total` are the final pools at lock (base units). `entrants[].record` is what the channel
  announced (before that match). The match is decided by its **last settled window that has outcomes
  with an `entrantId`**: `winnerId` is the entrant behind its winning outcome, or `null` when that
  outcome names nobody (a tie: `winnerLabel` says what won). `void: true` = no such window settled.
  `pot` = sum of every window's total.
- `GET /channels/:id/form` →
  ```
  { channel, chain, matches, favourite: { considered, won },
    entrants: [{ id, name, color?, played, wins, source: 'channel'|'history',
                 history: { played, wins, draws }, last5: ('W'|'L'|'D')[], lastPlayedAt }] }
  ```
  `history` and `last5` (newest first) come from the runner's history; void matches are left out,
  a tie counts as played and `D`. `played`/`wins` prefer the channel's own record when it announces
  `entrant.record` (the latest one announced, plus the matches history saw since), else the derived
  ones (`source` says which). Note a channel that keeps its records only in memory (coinflip) restarts
  them with the process; `history` does not. `favourite`: over every settled window in history with
  one clear favourite (the single biggest pool at lock, above zero), how often it won.
  `entrants` covers everyone in history plus the current match, most played first.

## Fairness (seeded windows)

At `openWindow` the runner draws a random 32-byte secret and creates the market with
`commitment = sha256(secret)`. After the close it locks (the chain picks `entropy`), computes
`seed = sha256(secret ‖ entropy ‖ market_pubkey_bytes)` (hex), publishes it in `window_locked` and
hands it to the channel. `settle` reveals the secret (`window_settled.secret`), so anyone can recompute
the seed and re-run the simulation. The secret is never logged or exposed before settle.

## Failure handling

If a channel's `run` throws (or returns with windows still open/locked), every open/locked window is
voided and claimed (full refunds), `match_end { result: { aborted: true } }` goes out, and the loop
starts the next match after a 3 s pause. On SIGINT/SIGTERM open windows are voided before exit.
Not handled: restarts mid-window (secrets live in memory; on Solana such a market can be voided by
anyone after `settle_deadline_slot`).

## How to add a channel

A channel is a `ChannelDef { id, title, run(show), intermissionMs? }`. `run` plays **one** match as a
plain async script; the runner calls it again forever. Read `src/channels/coinflip.ts` top to bottom —
it is the reference:

```ts
async run(show) {
  show.announce({ matchId, title: `${a.name} vs ${b.name}`, entrants });       // phase: lobby
  const win = await show.openWindow({
    question: 'Who wins the race?',
    outcomes: entrants.map((e) => ({ id: e.id, label: e.name, entrantId: e.id })),
    durationMs: 30_000, seeded: true, simHash: SIM_HASH,
  });
  const { seed } = await show.lock(win);           // waits for the close; seed is now public
  const sim = simulate({ seed: seed!, entrants }); // pure + deterministic
  const t0 = show.elapsed();
  for (const ev of sim.events) {                   // first emit → phase: live
    await show.sleep(t0 + ev.at - show.elapsed());
    show.emit({ ...ev, at: t0 + ev.at });          // GameEvent.at = ms since announce
  }
  await show.settle(win, sim.result.winnerId);     // reveals secret, pays everyone
  show.end(sim.result);                            // phase: result
  await show.sleep(6000);
}                                                  // runner: phase intermission, then run() again
```

Rules of thumb:
- **Seeded** game: everything random must come from `seed` (no `Math.random`, no clock) in a pure
  `simulate({ seed, entrants, options })` that the browser can run too. Export `SIM_HASH`.
- **Live** game (LLM decisions): `seeded: false`; decide the outcome only after `lock` returns.
- Several windows per match are fine (before the start, between rounds): see
  `src/channels/diceduel.ts` — window 1 seeded before the start, window 2 live mid-match.
- Every window you open must be settled or voided; if you forget or throw, the runner voids it.
- Use `show.sleep` (not `setTimeout`) so shutdown can interrupt you; `show.signal` is the abort signal.
- Register it in `src/index.ts` (`ALL`), then `CHANNELS=coinflip,my-game npm start`.

## SolanaChain

`src/chain/solana.ts`, loaded only with `CHAIN=solana` via dynamic import. It uses `@arena/sdk`
(`file:../program/sdk`, optional dependency; needs `program/sdk/dist`) and the SDK's own copy of
`@solana/web3.js`. DEPLOYED.json comes from `DEPLOYED_PATH`, else the SDK's bundled `DEPLOYED`.
- `relay` runs the SDK's `checkRelayTx` (only `place_bet` / `lock` / `claim` of our program; the fee
  payer may appear only as `place_bet`'s rent payer), caps instructions at 4, adds the fee-payer
  signature and submits. Bettors' PLAY accounts are created by the faucet, so no ATA instructions are allowed.
- `grant` = SDK `grantIxs` (create ATA idempotent + MintTo). House bots get keypairs in `BOT_KEYS`.
- `close_slot` is derived from the measured slot time; `lock` retries until the slot has passed.
  Sends are idempotent on retry (a timed-out tx that landed is detected by re-reading the market).

## Rent reclamation (Solana)

Every window opens a `Market` account and every bettor a `Position`; their rent is paid by the
admin / fee payer. So that a 24/7 site does not run the admin out of SOL, the runner closes them
again: after a window is settled or voided and paid, `Hub.reclaimer` (`src/reclaim.ts`) waits
`RECLAIM_DELAY_MS`, then calls `chain.reclaim(market)`, which claims anything `claimAll` missed,
closes the claimed positions (12 per transaction) and then the market (in the last of those
transactions). The program returns all of that rent to the admin. It runs in the background, one
market at a time, never blocks or fails a match, and retries failures with a growing pause
(8 attempts). `GET /health` shows `reclaim: { pending, markets, positions, failures, gaveUp }`.
`GET /me` keeps listing closed positions of recent windows from an in-memory copy. `MemoryChain.reclaim`
is a no-op.

After a crash (or anything the queue gave up on), sweep the program with the same env as the runner:

```sh
CHAIN=solana node scripts/sweep.ts --dry-run      # count only
CHAIN=solana node scripts/sweep.ts                # close every Settled/Void market + its positions
CHAIN=solana node scripts/sweep.ts --void-stale   # also void Open/Locked markets past settle_deadline_slot first
```

Markets created by the program before `close_market` existed (316-byte layout) cannot be closed.

## Hosting (Railway)

The runner must run all the time and hold WebSocket connections, so it cannot run on Vercel. It
deploys from this repo with `runner/Dockerfile` (build context: the repo root; `railway.json` at the
root points Railway at it, with the health check on `GET /health`). The image builds `program/sdk`
(its `dist/` is not in git) and copies the game adapters without their art, audio or captures
(`.dockerignore`). No secret is in the image.

Variables to set on the Railway service (names only; values go in Railway's dashboard, never in git):

| name | value |
|---|---|
| `ADMIN_KEYPAIR` | the whole contents of `program/.keys/admin.json` (the JSON array of 64 numbers) |
| `SOLANA_RPC` | the private devnet RPC URL (Helius) |
| `OPENROUTER_API_KEY` | the key the AI players of Inkelton and Blood Moon use (same as in `games/*/.env`) |

Already set by the Dockerfile (override only to change them): `CHAIN=solana`,
`CHANNELS=scrivener,brawl,tumbletop`, `NODE_ENV=production`, `TRUST_PROXY=1` (rate limits use the visitor's address from the proxy headers, not the proxy's). Every `SWEEP_MINUTES` (default 30, `0` = off) the runner voids markets past their settle deadline (left behind by a restart) and closes finished ones. `railway.json` `watchPatterns` limit redeploys to pushes that touch the runner, the SDK or the games' rules and simulations. Railway provides `PORT`. Optional:
`BRAIN_BUDGET_USD` / `BRAWL_BUDGET_USD` (AI spend caps per game; the spend file lives in the
container, so it restarts from zero on each deploy), `TX_PER_SEC`, `POOL_POLL_MS`, `RPC_STATS`.
House bots stay off unless `HOUSE_BOTS=1`.

The site then needs `VITE_RUNNER_URL=https://<the Railway domain>` at build time (Vercel).
Only one runner should run against the program at a time: stop the local one when the hosted one is live.
