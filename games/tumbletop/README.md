# Tumbletop

**The show's name for viewers is "Goober Guys"** (the owner's choice, 2026-11-20). The channel id, the folder, the exports and these documents still say `tumbletop` / Tumbletop so the runner and the site keep working.

A three-round knockout show. Sixteen Gumbles from a house roster of 24 race through a toy attic.
Round One cuts 16 to 8, Round Two cuts 8 to 4, and the Final has one winner. Nobody plays: viewers
watch and bet on who wins each round. Channel id `tumbletop`, dev port 5201.

Every name, character, course and piece of art is our own.

## Run it

```sh
npm install
npm run dev        # http://localhost:5201  the stage, driven by a local fake show, in a loop
npm run match      # one whole show headless, prints the result
npm test           # sim determinism and shape, show script, records (19 tests)
npm run checks     # the brief's numbers over 500 shows, two workers (--shows 2000 for more)
```

Dev page parameters: `seed` (number, fixes the whole show), `bets` (seconds each betting window
stays open; default 12 in dev, `0` for the real 40/30/30), `pick` (roster id to highlight), `cam`
(camera mode), `idle` (seconds with no show announced, to see the holding screen), `capture=1`
(virtual time, for tools). The buttons under the stage stand in for the
platform: camera modes, the viewer's pick, and "Rejoin", which remounts the stage from a snapshot
as a viewer joining mid-show would.

No env vars. Tumbletop is seeded and calls no models. Sound in the build is four music tracks by Kevin MacLeod
(CC BY 4.0: **the site must print the credit in `ASSETS.md`**) and eight effects (Mixkit free licence, one Kenney CC0 hit), in `web/src/audio/`; a sound with no file is silent. `captures/` (stills and strips from the
tools) is gitignored.

## Plugging it into the platform

```ts
// runner/src/index.ts
import tumbletopChannel from '../../games/tumbletop/channel.ts';
//   and in ALL:   tumbletop: () => tumbletopChannel(),

// web/src/games/registry.ts, in GAMES
tumbletop: { load: () => import('@games/tumbletop/index.ts'), assetsBase: '/games/tumbletop/' },
```

Run `npm install` in `games/tumbletop/` first: `index.ts` imports `three` and two fonts from this
folder's `node_modules`. There are no files to copy into `web/public`: the sound files are found
by `import.meta.glob` in `web/src/show/samples.js`, so the site's Vite build bundles them.

`mount(el, { assetsBase })` returns `{ onFeed, cameras, setCamera, highlight, destroy }` plus the
contract's sound hooks: `setVolume(0..1)` and `unlockAudio()` (create or resume the AudioContext
and play; the stage draws no sound button and never waits for a click on itself). `cameras` is `['Director', 'Leader', 'Cut line', 'My pick', 'Overview']`;
`setCamera('My pick', entrantId)` follows one Gumble; the mode applies while racing.
`highlight(entrantId)` marks the viewer's pick with a marker, a ringed name tag, a ringed row in
the standings, and a line on the cut and result cards.

`tumbletopChannel(opts)`: `timings` (any of `callMs`, `betMs[3]`, `titleMs`, `cutMs`, `recapMs`,
`finalCutMs`, `resultMs`), `intermissionMs` (default 6000), `recordsPath` (default
`data/records.json` here; `null` keeps records in memory), `pick` (choose the 16, for tests).

`node tools/platform-smoke.mjs` runs the channel on the real runner (memory chain, port 8797, short
timings, about 100 s) and checks what a viewer's socket receives. It edits nothing in `runner/`.

## The show

| Phase | What the channel does | What the stage shows |
|---|---|---|
| call | `announce`, then 12 s | the format in one line, then the sixteen on the start grid, a clock to the first line-up |
| line-up | `openWindow` (seeded): 40 s, then 30 s for the later rounds | the round's title call, then the field on the start line; a white bar "Line-up open" with the clock to the lock |
| lock | `lock`, event `round` | "Line-up locked" across the frame, the whole grid from above, 2.6 s |
| round | the race events on the clock | 3 2 1, the race (one tracking shot on the fight for the last place, one cut to the line camera as that place is taken), the cut |
| recap | event `recap`, 8 s | who went out and how, who is through, a clock to the next line-up |
| (line-up to recap repeat for Round Two; line-up to round for the Final) | | |
| result | event `result`, `settle` on the Final's window (Rounds One and Two were paid as they ended), `end`, 14 s | the winner, the viewer's pick, a clock to the next show |

Three windows, one per round, each its own bet among the Gumbles still in: "Who wins Round One?"
(16 outcomes), "Who wins Round Two?" (8), "Who wins the Final?" (4). Each window is paid when its
round ends, on the Gumble who crossed the line first in that round: `simulate({ seed, entrants,
options: { round } }).result.winnerId` for that window's seed and that round's entrants (the first
of `result.qualified`, place 1). The Final's winner is the show's winner. Each window is seeded and its seed runs the round that follows. A show runs about 4:35 at the real window lengths; the races
run about 41 s, 35 s and 23 s. The longest stretch with no window open is about 65 s (across the
result into the next show).

Nothing is emitted before the first window locks, so the platform's phase stays `lobby` through
the call and the first line-up, as it does for the reference channel. The stage takes the call
from the `match` message and each line-up from `window_open` (the field is the window's outcomes).

## Feed events

`at` is milliseconds since `announce`. Ids are roster ids (`juniper`, `noodle`, ...), the same ids
as the entrants and the window outcomes. `round`, `recap` and `result` each carry what the stage
needs to draw that phase from nothing (the seed and the field), so a viewer can join at any second
from the snapshot alone.

| type | data |
|---|---|
| `round` | `{ round, seed, entrants: id[], startAt, raceMs, durationMs }` sent right after the lock. `startAt` is when the round's simulation starts (its 3 s countdown first), in ms since `announce`. The stage replays the round from `seed` and `entrants` in step with that clock. `durationMs` is countdown plus race |
| `start` `leadChange` `overtake` `fall` `knockback` `pileup` `comeback` `qualified` `lastSpot` `photoFinish` `eliminated` `roundEnd` | `{ round, text, importance, entrantId?, otherId?, place?, left?, gap? }` the race as it happens, for tickers and chat. The stage ignores these (it has the simulation) |
| `recap` | `{ round, seed, entrants: id[], qualified: id[], eliminated: id[], notes: { entrantId, text }[], durationMs }` |
| `result` | `{ winnerId, order: id[], seed, entrants: id[], notes, rounds: { round, seed, qualified: id[], eliminated: id[] }[], nextShowMs }` `seed` and `entrants` are the Final's |

`round` is 0, 1 or 2. `match.meta` is
`{ game: 'tumbletop', simHash, callMs, closeToGoMs, rounds: { name, place, starters, qualify }[], gumbles: { [id]: { colors, pattern, stats, trait, form } } }`.
`match.entrants[i]` has `id`, `name`, `color`, `stats` (`speed`, `grip`, `bounce`, `nerve`, each 2 to 9)
and `record` (`played`, `wins`). `form` is up to five letters, latest first: `W` won, `F` reached
the final, `2` out in round two, `1` out in round one. `match_end.result` is
`{ winnerId, order, rounds, entrants }`.

## The simulation

```ts
import { simulate, SIM_HASH } from '@games/tumbletop/sim.ts';
simulate({ seed, entrants, options: { round } })   // -> { durationMs, events, result }
```

Pure: no clock, no randomness outside the seed, the same in node and the browser
(`node tools/crosscheck.mjs` compares state hashes). `seed` is the platform's hex string.
`result` is `{ round, order, qualified, eliminated, notes, winnerId, times, hash, ticks, raceMs, timedOut, cutChanges, lateCutChanges }`.
`SIM_HASH` is the sha256 of the files in `sim/` (`npm run simhash` rewrites `show/simHash.js`
after a sim change; a test fails if it is stale). `channel.ts` computes the same hash from the
sources at start-up and records it in every market.

## Where things are

```
sim/        the simulation: roster.js (24 Gumbles), rounds.js (three rounds as data), course.js,
            sim.js, ai.js (stats and tuning), simulate.js. No three.js, no DOM, no clock
show/       script.js (the show over the platform's Show), fakeShow.js, clock.js, records.js
web/src/    stage.js (the stage, driven by the feed), show/ (race display, cards, sound, theme),
            camera/ (showDirector.js and the lenses), world/, characters/, dev.js (the dev page)
tools/      checks, crosscheck, capture, strip, clip, comprehension, blindpairs, perf, deadair, sound,
            platform-smoke, match, preseason, simhash, progress
data/       records.json (records across shows, seeded by a 36-show pre-season), checks-2000.json
```

## Tools

```sh
node tools/capture.mjs --seed 7 --at 60 --frames 10 --every 3 --pick juniper --out captures/x   # stills on a virtual clock
node tools/capture.mjs --seed 7 --round 1 --into 3 --pickplace 5 --frames 12 --every 2.2        # a clip from a given round
node tools/capture.mjs --seed 7 --at 40 --rejoin --frames 1                                    # join mid-show
node tools/strip.mjs --seed 12 --round 0 --into 15 --seconds 28 --pickplace 9 --out captures/s   # 4 frames a second, tiled 3 x 3, for judging the camera as video
node tools/clip.mjs --seed 12 --round 1 --into 5 --seconds 20 --out docs/x.mp4                   # an mp4 (needs ffmpeg)
node tools/deadair.mjs         # a whole show: the longest stretch in each phase with nothing moving
node tools/sound.mjs           # renders a whole show's sound to docs/sound/show.wav, with loudness and spectrograms
node tools/crosscheck.mjs      # node vs browser, 3 seeds x 3 rounds, by state hash
node tools/perf.mjs            # a whole show in real time: frame interval and stage work
node tools/comprehension.mjs capture | truth | grade answers.json
node tools/preseason.mjs       # rewrite data/records.json from 36 simulated shows
```
