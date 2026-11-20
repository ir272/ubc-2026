# The Scrivener

A channel for the Arena platform. Two models take turns at the same boss, an ink-drawn scribe
that writes the names of the dead, in a haunted library. Each builds a fighter from random
offers before the bell. Viewers bet play money on who kills it and on how far each attempt gets.

The fiction that shapes a match: the Scrivener is writing the petitioner's name, one stroke per
exchange. Six strokes finish it. An attempt ends when the petitioner dies, the boss dies, or the
name is finished. The name being inked on the stage is the attempt's clock.

A match is a show in five phases that cannot be mistaken for each other:

| phase | length | ground | what happens |
|---|---|---|---|
| the call | 10 s | a dark ledger leaf | match number, the two names being written in, models, records, head to head |
| the choosing | about 60 s | an open book | the boss's temper, then each model picks a class, a weapon, a spell and a charm from three plates, with a reason |
| the tape | 35 s | a fight poster | both builds side by side, form, the temper; window A is open ("Who wins the match?") |
| the fight | about 2 min | the library | one go each at the boss, one after the other; no window of its own |
| the verdict | 21 s | oxblood | the winner, how it ended, the deciding moment again, the pay-out beat, a line from each, the count to the next call |

## Integration: the two lines

`runner/src/index.ts`:

```ts
import scrivener from '../../games/scrivener/channel.ts';
// in ALL:
  scrivener: () => scrivener(),
```

`web/src/games/registry.ts`:

```ts
  scrivener: { load: () => import('@games/scrivener/index.ts'), assetsBase: '/games/scrivener/' },
```

Nothing needs copying into `web/public`: the sound files are resolved by Vite from this folder
(`src/stage/assets.js`, `import.meta.glob`). `web/vite.config.ts` already allows the repo root.
`index.ts` exports `mount(el, { assetsBase }) -> { onFeed, highlight, setVolume, unlockAudio, destroy }` and `simulate`.
`setVolume(v)` is the site's master volume (0 to 1, 0 is silence); `unlockAudio()` creates or resumes the
AudioContext and starts the music. The stage draws no sound control of its own.
`channel.ts` default-exports `(opts?) => ChannelDef` and also exports `SIM_HASH` and `simulate`.

Channel options (all optional): `mock` (scripted brains), `botsFile`, `recordsFile`,
`handicap` (0..0.4 off the favourite's starting health, or a function `(a, b) => { entrantId, amount } | null`
so the platform can set it from its own ratings), `budgetUsd`, `intermissionMs`, `id`, `title`.

## Run it on its own

```sh
npm install
npm run dev        # http://127.0.0.1:5200  the stage, fed by a local fake runner playing channel.ts in a loop
npm run match      # one full mock match, headless, on a virtual clock (milliseconds); prints the result
```

- `node tools/match.mjs --count 200` is the completion check (200 matches, reports stalls and lengths).
- `node tools/match.mjs --real` plays one match in real time on real models (needs a key; about 7 minutes).
- Every match the fake runner plays is recorded to `.cache/feeds/<matchId>.jsonl`. The harness can
  join a recorded match at any point, exactly as a late viewer would:
  `http://127.0.0.1:5200/?replay=latest&at=phase:tape+2000`, `&at=event:decide.open:3+500`, `&at=ms:95000`.
  Add `&bare=1` to fill the window with the stage, `&pick=<entrantId>` to see the highlight, `&mute=1`.
- Click the page once to let the browser play sound.

### Environment

| variable | meaning |
|---|---|
| `OPENROUTER_API_KEY` | in `games/scrivener/.env` (see `.env.example`). Without it every bot plays on a scripted brain. Never logged, never sent to the browser. |
| `SCRIVENER_MOCK=1` | force scripted brains even with a key. The harness defaults to mock; set `SCRIVENER_MOCK=0` for real models there. |
| `BRAIN_BUDGET_USD` | real-model spend cap for the process, default `1.50`. Spend is logged per call to `.cache/cost.json`; at the cap the bots play on as scripted brains. |
| `ELEVENLABS_API_KEY` | reserved for voiced lines (not built today; the show runs on captions). |
| `PORT` | harness port, default `5200`. |

### Bots

`bots.json` is the field: `{ id, name, model, instructions, look: { accent }, voice? }`. Any
OpenRouter model id works; no code path names a model or a provider. The channel cycles every
pairing and alternates who opens. Records (overall, by class, head to head) and each bot's
three-line memory live in `.cache/records.json` and are sent in `announce.meta.bots`.

## The feed

`announce`: `entrants` carry `record`; `meta = { game: 'scrivener', matchNo, strokes, order, simHash,
handicap, bots: [{ id, name, model, look, brain, record, vsBoss: { tries, kills, avg }, byClass, h2h, last }] }`
(`last` is the build the bot last fought with, or null).

Events (`{ type, at, data }`, `at` = ms since the match began):

| type | data |
|---|---|
| `phase` | `{ phase: 'call' \| 'choosing' \| 'tape' \| 'fight' \| 'verdict', ms, state }`. `state` is the whole show so far (`matchNo, order, strokes, temper, offers, loadouts, reasons, attempts, current, winnerId, how, handicap`), so one `phase` event is enough for a late joiner. |
| `temper` | `{ temper }` |
| `offer` | `{ entrantId, slot: 'cls' \| 'weapon' \| 'spell' \| 'charm', options: [id, id, id] }` |
| `pick` | `{ entrantId, slot, choice, reason, source }` |
| `attempt.ready` | `{ index, entrantId, n }` the walk-on; the "how far" window is open |
| `attempt.start` | `{ index, entrantId, n, seed, loadout, temper, handicap }` the bell; both ends start the sim |
| `decide.open` | `{ index, k, strokes, tick, attackId, world }` the sim has frozen at a decision; `world` is its JSON |
| `decide.made` | `{ index, k, slot, move, name, line, ms, source }` |
| `attempt.end` | `{ index, entrantId, n, result: 'kill' \| 'death' \| 'written', score, hpLeft, strokes, taken, killedBy, seconds, slots, seed, handicap, tally }` |
| `note` | `{ entrantId, text }` the model's note to itself |
| `verdict` | `{ winnerId, how: 'kill' \| 'both_kill' \| 'damage', deciding: { index }, tally }` |
| `line` | `{ entrantId, text, kind: 'win' \| 'loss' }` |
| `next` | `{ ms }` the count to the next call |

Windows:
- **A**, at the tape: "Who wins the match?", two outcomes (the entrant ids), 30 s, **seeded**. It
  opens only after every pick is public and locks before the fight. Settled at the verdict. This is
  the match's only window (since 2026-11-20; the per-go "How far" window and the window between
  pairs are gone).

Bets lock before the outcome exists: offers and the temper are drawn in the choosing, before the
window; the seed of each go is cut from the seed the runner derives when window A locks (eight hex
digits per go), so no go's dice exist while betting is open; every model call in the fight happens
after the lock.
## Rules

- Each entrant gets one go at the boss (`MAX_ATTEMPTS_EACH = 1` in `src/show/rules.js`). The opener alternates.
- An attempt's score is the share of the boss's health removed, `1` on a kill. The stage shows the
  other side of it everywhere: the boss's health left (lowest wins).
- First to kill wins once both have had the same number of attempts. Both kill in the same pair:
  the one with more of its own health left. Nobody kills: whoever left the boss with less health.
- A fighter has four moves: two from its class, the weapon's strike, the spell. No flasks.
- Classes, weapons, spells, charms and the boss's six tempers are listed in `DESIGN.md` and defined
  in `src/sim/loadout.js`.

## Layout

| path | what |
|---|---|
| `index.ts`, `channel.ts`, `bots.json` | the platform adapters and the field |
| `src/show/` | `script.js` (the five phases), `attempt.js` (the sim on the clock), `rules.js`, `timing.js`, `store.js`, `bots.js`, `replay.js` |
| `src/brains/` | `mock.js`, `llm.js` (OpenRouter: timeouts, fallbacks, cost log), `content.js` (the check every line passes) |
| `src/stage/` | `stage.js` (scene manager), `feed.js` (reducer), `fight.js` + `fight_hud.js`, `scenes/` (call, choosing, tape, verdict), `kit.js` |
| `src/sim/` | the pure sim: `world.js`, `agent.js`, `boss.js`, `combat.js`, `attacks.js`, `loadout.js`, `mock.js`, `headless.js` |
| `src/render/`, `src/fx/`, `src/ui/`, `src/audio/` | the ink renderer, effects, lettering and sound the fight already had, plus `fighter_parts/` and `items_draw.js` |
| `harness/` | the fake runner, its Vite config and page |
| `tools/` | `match.mjs`, `balance.mjs`, `shots.mjs`, `clips.mjs`, `matrix.mjs`, `progress_page.mjs` |

The game this grew from (one endless boss fight with a freeze panel) has stills in
`captures/baseline/` for comparison. Its old page (`npm run legacy`) was not kept working in a
browser after the sim changed.

## Audio credits

Every sound and music file is a real recording under CC0 or CC BY. `assets/audio/LICENSES.md` is the
ledger (source, author, license and the exact required attribution for every file);
`node tools/credits.mjs` turns it into `assets/audio/credits.json`, which the game shows in its
credits sheet (the **Credits** link under the canvas, or press **C**) and rolls one line at a time
on the victory card. The CC BY attributions:

- Music: "Land of the Dead", "Halls of the Undead", "Oppressive Gloom", "Clash Defiant", "Final Count",
  "Truth of the Legend", "Corruption" by Kevin MacLeod (incompetech.com), licensed under Creative
  Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/
- Sound effects from freesound.org, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) unless
  marked 3.0 (https://creativecommons.org/licenses/by/3.0/), all edited (trimmed, loudness-normalised):
  "Whoosh Heavy Spear Hammer Large" by EminYILDIRIM (https://freesound.org/s/540300/);
  "Longsword Swing 1 {Good edge alignment}" by Sophia_C (https://freesound.org/s/525166/);
  "Whoosh+Sword_Hit Flesh.wav" by marb7e (https://freesound.org/s/620354/);
  "Sword Stab  Body Hit" by -GeorgeDiamond- (https://freesound.org/s/718259/);
  "body-fall-5.wav" by CosmicEmbers (https://freesound.org/s/160742/, CC BY 3.0);
  "Warrior Death Cry - British Male" by theuncertainman (https://freesound.org/s/417539/);
  "Fabric Swish" by harrietniamh (https://freesound.org/s/400351/);
  "Monster 4.wav" by Sea Fury (https://freesound.org/s/48688/, CC BY 3.0);
  "Dragon Pain" by qubodup (https://freesound.org/s/219944/);
  "Monster death throes 2" by giddster (https://freesound.org/s/464936/);
  "Book, Flipping Through Pages, A.wav" by InspectorJ (https://freesound.org/s/416179/);
  "SIGNING PAPER SCRIBE WITH FOUNTAIN PEN QUILT SCRATCH IN STEREO" by ukjoncollins (https://freesound.org/s/441548/);
  "Paper Scratch Pencil drawing line" by johannesschmidt (https://freesound.org/s/339741/);
  "Book Slam.mp3" by sjnewton (https://freesound.org/s/256559/, CC BY 3.0);
  "Cathedral Bells, Close, A.wav" by InspectorJ (https://freesound.org/s/417769/);
  "Heavy Rain" by lebaston100 (https://freesound.org/s/243629/);
  "Howling Wind Loop" by qubodup (https://freesound.org/s/211610/);
  "Wind On Door Short.wav" by Benboncan (https://freesound.org/s/84111/);
  "Gong.wav" by drumuse (https://freesound.org/s/51837/);
  "Deepest Boom Yet" by hykenfreak (https://freesound.org/s/248150/);
  "Movie Trailer Boom" by hykenfreak (https://freesound.org/s/207755/);
  "PotionDrinkLONG.wav" by Jamius (https://freesound.org/s/41529/);
  "Drinking and swallow" by dersuperanton (https://freesound.org/s/433645/).
- More sound effects are CC0 (credit not required, listed in the credits sheet as a courtesy),
  including Kenney (www.kenney.nl).

If `LICENSES.md` changes, re-run `node tools/credits.mjs` (`--check` fails when credits.json is stale).
