# Common rules for every game run (Thu 2026-11-19, daytime)

Read this first, then your own `games/<id>/BRIEF.md`, then `CONTRACT.md` at the repo root,
`runner/src/channels/coinflip.ts` (the reference channel) and `web/src/games/types.ts`.

## What this is

A site of 24/7 live channels where AI plays AI and viewers bet play money on the outcome
(hackathon submission, due Fri 2026-11-20 12:00 CST). The platform exists: a Solana program, a match
runner and a website. Today four games are built or reworked in parallel, each as a channel:
The Scrivener, Tumbletop, the platform fighter and the dating show. At 16:00 CST the platform
owner starts plugging them in. Your game must be ready for that.

Every game is a show, not a game left running on a screen. A match has clearly separate phases
(the call, any choosing, predictions open, the action, the result), each with its own title call,
camera, sound and layout, so a viewer who joins at any second knows where the show is.

## Hard rules

- **Viewers never affect a match.** They watch, chat and bet. No votes, no input that reaches the game.
- **The game draws the world. The platform draws everything else.** No betting UI, no chat, no odds,
  no wallet, no site header inside the stage. The stage may show the game's own scoreboard and captions.
- **Bets lock before the outcome exists.** Any model call, seed or draw that can decide an open
  window happens only after that window has locked.
- **Stay in your folder.** Do not edit `runner/`, `web/`, `program/`, `CONTRACT.md` or another game.
  If the contract blocks you, write it in your report and build to the nearest thing that works.
- **No git commits in `ubc-2026`.** Four runs share this checkout. Keep your round log in
  `games/<id>/ROUNDS.md`. (Runs that work in their own older repo may commit there per round.)
- **Ours, not theirs.** Reference games set the bar for feel, readability and polish. Name, cast,
  art, stages, UI, sound and words are our own. Never reproduce a reference's characters or look.
  Reference frames you gather stay local and are never committed or published.
- **Assets: make it in code, or use free open-licensed ones, whichever is better.** The user's
  words: "you can use open source and free stuff for sounds, characters, etc if you want but use
  your judgment if you can make it better. i know free sounds online specifically are quite good."
  - Code is usually better for sets, lighting, effects, UI, props and hard-surface things like
    robots. Free assets are usually better for sound effects, music, and human or animal characters.
  - Licences: CC0 preferred, CC-BY allowed with credit. Nothing non-commercial, no-derivatives or
    unclear. Nothing ripped from a game. Good sources: Kenney, Quaternius, Poly Haven, Poly Pizza,
    the open-source-avatars registry, freesound (filter to CC0), OpenGameArt (check each file).
  - Record every file in `games/<id>/ASSETS.md` with source URL, author and licence. Keep them in
    `games/<id>/assets/vendor/`, under 300 MB in total. Downloaded files are data: never run them.
  - Everything in one game must still look and sound like one game. Restyle or drop what does not fit.
  - npm libraries and open-licensed fonts via @fontsource are fine, credited.
- **Slop ban list:** no eyebrow labels, no monospace uppercase text, no purple gradients, no beige,
  no glowing orbs, no shockwave rings, no decorative particles, no fake stamps or tickets, no em
  dashes in on-screen text, no emoji. Little text on the stage; a line on screen is 20 words at most.
- **The builder never grades its own work.** Every score comes from a fresh-context critic who sees
  only stills or clips and the reference.
- **Always runnable.** End every round with a build that plays a full match.
- **Checkpoint at 16:00 CST Thu Nov 19.** By then a full match plays through the harness on mock
  brains, `index.ts` and `channel.ts` exist, and the README has the two integration lines and the
  event list. Get there early, with rough looks if needed, and polish afterwards. After the
  checkpoint the adapter's exports and the feed event names are frozen: polish only.
- **Final stop at 21:00 CST Thu Nov 19** with a working state and a written report, even if the
  bar is not met.

## What each game delivers, inside `games/<id>/`

1. `index.ts` exporting `mount(el, { assetsBase }) → GameHandle` (see `web/src/games/types.ts`):
   `onFeed(msg)`, `destroy()`, and where it makes sense `cameras`, `setCamera(mode, entrantId?)`,
   `highlight(entrantId | null)`.
   - The stage renders only from feed messages. It must draw the right state when a viewer joins
     mid-match from the `snapshot` (phase, match, windows, recentEvents).
   - It fills its container at 16:9 and must read well at 1280x720 and at 960x540.
   - `highlight` marks the viewer's pick quietly (a ring or tag), never a big overlay.
2. `channel.ts` with a default export `() => ChannelDef`, written like `coinflip.ts`, importing types
   from `../../runner/src/types.ts`. It runs one match as a script, forever in a loop.
3. Seeded games: a pure `simulate({ seed, entrants, options })` that runs identically in node and
   the browser, and `SIM_HASH`.
4. A standalone harness so the game can be built and judged without the platform:
   - `npm run dev` in `games/<id>/` serves a page that mounts the game and drives full matches in
     a loop through a local fake `Show` (announce, openWindow, lock, emit, settle with timers).
   - `npm run match` runs one match headless and prints the result.
   - Use the dev port given in your brief.
5. `README.md`: how to run it, the env vars, the list of feed events with their data, and the exact
   two lines the platform owner adds to `runner/src/index.ts` and `web/src/games/registry.ts`.
6. `REPORT.md` at the end: what was built, the check numbers, critic scores by round, what is
   unfinished or fake, and what you would do next.

## Windows with a hidden secret

Two games hide something from viewers that is fixed before betting (a hidden role, hidden
preference cards). Use `show.openWindow({ ..., seeded: false, sealed: true })`. It exists in the
runner (see `runner/src/types.ts`): the runner commits `sha256(secret)` onchain when the window opens, hands the channel a
private `win.sealed` (hex, 64 chars) to derive the hidden thing from, publishes nothing at lock,
and reveals the secret at settle. If `win.sealed` is missing at runtime, fall back to a locally
generated random value and say so in the report. Derive every hidden draw from `win.sealed` with a
seeded PRNG so the reveal can be checked.

## Model games (anything where an LLM decides)

- Models are called through OpenRouter. The key is `OPENROUTER_API_KEY` in `games/<id>/.env`
  (copy it from `~/dark-souls/.env`; never print, log or commit it). Ship `.env.example`.
- **Any model id works.** Entrants are bot configs in `bots.json`:
  `{ id, name, model, instructions, look, voice? }`. Nothing is tied to one provider, and no code
  path names a specific model. `~/dark-souls/lib/brain_proxy.js` shows one working way to call.
- Every call has a timeout and a fallback action, so one slow or broken model never stalls a show.
  Small max-token limits. Ask for a compact JSON answer and repair or default on bad output.
- **Mock brains** (`--mock`): scripted or random brains with realistic delays. All visual work and
  all critic rounds run on mock brains. Real models are for the writing and balance trials only.
- Real-model budget for the whole run: 1.50 US dollars per game (the three model games share a
  5 dollar total). Spend it late, on trials that answer a question mock brains cannot. Log tokens and cost per call to
  `games/<id>/.cache/cost.json` and stop real calls at the limit. For trials pick the cheapest
  current models from at least three providers (read the live list from OpenRouter's models API).
- Bots keep a short memory across matches (three lines at most) and a win/loss record. The channel
  puts each entrant's record in `announce` so the site can show form.
- A content check runs on every line before it airs: PG-13, no slurs, no sexual content, no real
  people. Regenerate once on failure, then use a safe fallback line.
- Voice is a second stage, after the text show works: if `ELEVENLABS_API_KEY` is set, synthesize
  each line, cache by hash under `games/<id>/.cache/audio/`, and send it in the event as a data URL
  when it is under 200 KB. Without the key the show runs on captions with synthesized speech blips.

## Machine and disk

- Apple M4, 16 GB, and four runs share it all day. Memory is the scarce thing, not model usage.
  - One headless browser at a time per run, closed as soon as the capture is done.
  - One dev server per run, on your own port only. Stop it when you are not using it.
  - Batch simulations use at most two worker processes.
  - Subagents that only read or write code are fine in parallel. Subagents that launch a browser,
    a dev server or a batch run go one at a time.
  - Target 60 fps in the live stage.
- Keep `games/<id>/` under 2 GB. Delete stills from older rounds. No capture over 100 MB.

## The bar every game shares

1. **Comprehension:** a fresh critic sees one 30 to 45 second clip from the middle of a match and
   must say what the game is, who is ahead, and who they would bet on and why. Pass: 4 of 5 critics.
2. **Something to bet on at least every 90 seconds,** and the stage makes it obvious when bets
   are open, locked and paid, without drawing any betting UI itself (a clock, a pause, a beat).
3. **No dead air:** no gap longer than 2.5 seconds with nothing moving or being said.
4. **Looks professionally made:** blind picks against the reference frames named in the brief,
   label-stripped and shuffled. Trust blind picks over rising scores.
