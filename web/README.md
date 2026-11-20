# Arena web

The site viewers use: live channels where AI plays AI, a prediction pinned in the chat column,
play money only. Vite + React + TypeScript. Seams: `../CONTRACT.md` §3–4 and `../runner/README.md`.

## Run

```sh
cd runner && HOUSE_BOTS=1 npm start        # memory chain, coinflip + dice-duel on :8787
cd web && npm install && npm run dev      # http://localhost:5190
```

`VITE_RUNNER_URL` (default `http://localhost:8787`) points at the runner; `VITE_SOLANA_RPC`
overrides the RPC used for blockhashes in Solana mode (see `.env.example`). `npm run build` typechecks
and builds to `dist/`.

## Adding a game

**Register it in `src/games/registry.ts`** — that is the only place. A game lives in the repo's
`games/<id>/` folder and exports `mount(el, { assetsBase }) → GameHandle` (`src/games/types.ts`):

```ts
kart: { load: () => import('@games/kart/index.ts'), assetsBase: '/games/kart/' },
```

The key is the runner's channel id (or `match.meta.game`). `@games` is an alias for `../games`
(vite.config.ts). The page forwards every feed message to `onFeed` (a `snapshot` first, also after
each reconnect, rebuilt from current state if the game loads late), shows buttons for `cameras`
(a segmented control over the stream's bottom-right corner; the first is the default; modes named like "My pick" get the picked entrant's id) and calls `highlight(entrantId)` with the entrant the viewer is selecting or bet on (null when cleared). The prediction card handles 2–16 outcomes and several windows per match.
Static files: `web/public/games/<id>/` (served at `assetsBase`) or `new URL('./x.png', import.meta.url)`.
`src/games/builtin/` holds the placeholder renderers for `coinflip` and `dice-duel`.

Home-page artwork: `src/posters.ts` (one 3:4 image URL per channel, plus a 16:9 hero image).

## Design work

- Metrics are measured from Kick/Twitch and written down in `DESIGN_METRICS.md`; components build to them.
- Six variants live in `src/themes/variants.tsx` (registered in `src/themes/index.ts`):
  `plain` (default), `broadcast`, `title-card`, `terminal`, `mono`, `cobalt`. Switch with `?theme=<name>`.
- `?stage=still` (dev server only) replaces the stream with a real game frame so screenshots show real content;
  `?stage=live` switches back. Both are remembered for the tab.
- `?fixture=tumbletop&phase=open|open2|between|win` (16 → 8 → 4 outcomes, three windows, cameras) and
  `?fixture=dating&phase=open|open2|open3|win` (4 → 3 → 2 outcomes, sealed windows) cover multi-outcome matches.
- `?fixture=scrivener&phase=open|locked|win` (dev server only) runs the whole site on the coherent sample data
  in `src/fixture.ts` (channels, one match with pools, chat, recent bets, results, leaderboard); no runner needed.
  `?fixture=off` turns it off. Round-2 screenshots: `shots/round2/`.
- `public/dev-art/` holds low-resolution reference crops of the generated artwork (stage frame, posters, hero),
  copied from `../refs/explore/` for design comparison only. It is **gitignored and not shipped**; replace the
  `/dev-art/` paths in `src/posters.ts` with real art before deploying.
- Comparison screenshots: `shots/variants/` (sheets: `sheet-channel.jpg`, `sheet-home.jpg`).
- Channel "About" text lives in `src/channelInfo.ts` (one paragraph per channel).

## How it works

- **Silent wallet** (`src/lib/wallet.ts`): ed25519 seed in `localStorage`; first visit calls
  `/faucet` (and again if a restarted memory runner no longer knows the key). Balance = `/me`
  minus bets in flight; refreshed every 5 s and on every settle/void.
- **Feed** (`src/lib/feed.ts`): one WebSocket per channel shared by the page, snapshot then
  incremental messages, reconnect with jittered backoff.
- **Betting**: `/config.chain === 'memory'` → `POST /dev/bet`; `'solana'` → `src/lib/solanaBet.ts`
  builds `place_bet` with `@arena/sdk` (fee payer and rent payer = `feePayer`), signs with the silent
  key, `POST /relay` (lazy chunk, so memory mode never loads web3.js). Optimistic "your bet" line and
  balance; a failed bet shows an inline error and restores the balance. Payouts come from
  `window_settled.payouts`, then `/me`.
- **History** (`src/lib/history.ts`): the Form and Results tabs and the home page's recent results and
  leaderboard read the runner's `GET /channels/:id/history` and `/form` (polled every 15 s and re-read on
  each phase change). Under `?fixture=` they use `fxHistory` / `fxForm` in `src/fixture.ts`.
- **Theme**: a theme is one `ThemeDef` (CSS variables for ground, accent, sides, typefaces, radius,
  density, plus its wordmark). Canvas renderers read the same variables.

## Not done / known gaps

- The runner exposes no viewer count; the eye count is an estimate (distinct chatters + house bots + you).
- Solana mode was verified offline (the built transaction passes the SDK's `checkRelayTx` with a
  valid owner signature), not against devnet.
