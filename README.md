# Ghostbet

Ghostbet is a platform where you make predictions and wagers on live-streamed, simulated game environments
that run 24/7. AI plays AI on every channel; viewers bet play money on what happens. Every bet,
lock, result and payout is a transaction on Solana devnet.

## How it uses Solana

The core of the product (the pots, the bets, the result and the payouts) is an Anchor program
written in Rust and deployed on Solana devnet. The match runner and the website only drive it.

| | Address (devnet) |
|---|---|
| Program (Anchor, Rust) | [`GGQeGU8BTtRDmHPoC25Py185wEuUeDz3phXWG4Gp6z2P`](https://explorer.solana.com/address/GGQeGU8BTtRDmHPoC25Py185wEuUeDz3phXWG4Gp6z2P?cluster=devnet) |
| PLAY token mint (SPL Token, 6 decimals) | [`8DywivK9Vv5Yi2bCRPqDWakdhJE8Qd6eACLgCc8kDts7`](https://explorer.solana.com/address/8DywivK9Vv5Yi2bCRPqDWakdhJE8Qd6eACLgCc8kDts7?cluster=devnet) |
| Config account | [`CEWtCZ3eZn9xzgPxXAv21vNJ2wGXDviEJEQ5gfjsqfLT`](https://explorer.solana.com/address/CEWtCZ3eZn9xzgPxXAv21vNJ2wGXDviEJEQ5gfjsqfLT?cluster=devnet) |
| Admin and fee payer | [`ApNhqVsLRMjAy6hJEwv5PnQMcTAvAMeF87akh7j6uW7q`](https://explorer.solana.com/address/ApNhqVsLRMjAy6hJEwv5PnQMcTAvAMeF87akh7j6uW7q?cluster=devnet) |

Source: `program/programs/arena/src/lib.rs`. TypeScript client: `program/sdk`.

- **One market per betting window.** Every time a channel opens betting, the runner calls
  `create_market` (2 to 16 outcomes, a close slot, and a sha256 commitment to a secret). The
  market is a PDA (`["market", id]`).
- **Bets are SPL token transfers.** Play money is an SPL token (PLAY) whose mint is a PDA of the
  program. `place_bet` moves PLAY from the bettor's associated token account into the program's
  vault (a PDA token account) and records the stake in a Position PDA (`["pos", market, owner]`).
  The program refuses bets at or after the close slot.
- **Randomness nobody chooses.** `lock` is permissionless once the close slot has passed and reads
  the SlotHashes sysvar for entropy. Seeded games derive their randomness from
  `sha256(secret, entropy, market)`, so neither the house nor a bettor can pick the outcome.
- **Settle and pay.** `settle` reveals the secret (the program checks it against the commitment)
  and records the winner; `claim` pays each Position its parimutuel share of the whole pot from
  the vault. `void` refunds everyone. `close_position` and `close_market` return rent.
- **No wallet setup for viewers.** Each viewer gets an ed25519 keypair in the browser on first
  visit (a normal Solana keypair). The faucet mints starting PLAY to it (SPL `MintTo` plus an
  idempotent associated token account). The browser signs `place_bet` itself and the runner adds
  its signature as fee payer (`POST /relay`), so viewers never need SOL or a wallet popup. The
  relay only co-signs `place_bet`, `lock` and `claim` of this program.

Existing Solana pieces used rather than rebuilt: the SPL Token and Associated Token Account
programs, the SlotHashes sysvar, `@solana/web3.js`, Anchor, and Solana Explorer for every
transaction link.

## Layout

| Folder | What it is |
|---|---|
| `program/` | Anchor program (Rust), SDK, deploy and devnet scripts |
| `runner/` | Match runner: runs every channel's show loop, opens and settles markets, relays bets (HTTP and WebSocket on :8787) |
| `web/` | Website (Vite and React, :5190) |
| `games/` | The channels: `scrivener`, `brawl`, `tumbletop` |
| `pitch/` | Pitch deck and video material |

## Run it

```bash
cd runner && npm install && CHAIN=solana HOUSE_BOTS=1 BOT_BET_CHANCE=0.06 CHANNELS=scrivener,brawl,tumbletop npm start
```

```bash
cd web && npm install && npm run dev
```

`CHAIN=memory` runs everything without a network (practice mode). Solana mode needs the admin
keypair at `program/.keys/admin.json` (not in the repo). See `runner/README.md` for every setting.
