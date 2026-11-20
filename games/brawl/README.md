# Blood Moon (games/brawl)

Formerly Ringout. Since 2026-11-20 the picture is a 2D ink stage under `src/ink/` (six hand-drawn
fighters, six stages, bots strike stages); the three.js robot stage is gone. `REPORT.md` has the
current state and numbers; where this file still describes robots or `src/stage` picture modules,
`REPORT.md` and `src/ink/api.ts` are right.

A robot platform fighter that is watched, not played. Two AI models each pick a robot and coach
it from the corner; the robots' hands play every frame. Viewers bet on the winner. Channel id
`brawl`, title "Ringout". Architecture and direction: `ARCH.md`. Brief: `BRIEF.md`.

## Run it

```sh
cd games/brawl
npm install
npm run dev                  # harness on http://localhost:5202 (full matches in a loop, mock brains)
npm run match                # one full match headless on a virtual clock, prints the timeline
npm run batch                # mock-coach balance numbers (see ARCH.md, "Minds matter")
npm run capture -- ...       # stills and clips (see "Capture" below)
node --test test/*.test.mjs  # tests (show script, fake Show, content check, stubbed OpenRouter)
```

`npm run match` flags:

| flag | meaning |
|---|---|
| `--mock` | mock brains on a virtual clock (default): a five-minute show runs in well under a second |
| `--real` | real model minds through OpenRouter, real time (spends budget; needs the key) |
| `--seed S` | seeds the script, the fake Show and the mock brains: same seed, same show |
| `--a kiln --b tick` | force the picks (side 0, side 1) |
| `--coaches adaptive,rush` | mock coaches by side (`rush keepaway bait wall adaptive random`) |
| `--bots marlow,juniper` | which two bots from `bots.json` (default: the first two) |
| `--lives 2`, `--handicap 0,30` | match options |
| `--json` | the whole report as JSON |

It prints the phase timeline with times, every plan (tick, stance, dials, think time, read), the
result, and the count of every feed message and event type.

## Env vars (`games/brawl/.env`, see `.env.example`)

| var | default | |
|---|---|---|
| `OPENROUTER_API_KEY` | none | real model minds. Without it the show runs on mock brains. Never printed or logged |
| `BRAWL_MOCK` | unset | `1` forces mock brains even with a key |
| `BRAWL_BUDGET_USD` | `1.50` | real-model spend limit, summed in `.cache/cost.json`; after it, mock answers |
| `BRAWL_INTERMISSION_MS` | `8000` | pause between matches (also sets `match_end.nextInMs`) |
| `BRAWL_COACHES` | `adaptive,adaptive` | mock coaches by side when on mock brains |

## Plugging into the platform (the two lines)

In `runner/src/index.ts`, the import and the entry in `ALL`:

```ts
import brawlChannel from '../../games/brawl/channel.ts';
```
```ts
  brawl: () => brawlChannel(),
```

In `web/src/games/registry.ts`:

```ts
  brawl: { load: () => import('@games/brawl/index.ts'), assetsBase: '/games/brawl/' },
```

`index.ts` exports `mount(el, { assetsBase }) -> GameHandle` with `onFeed(msg)`, `cameras`
(`auto`, `wide`, `follow`), `setCamera(mode, entrantId?)`, `highlight(entrantId | null)`,
`setVolume(v)` (master volume 0 to 1 for everything the game plays, 0 = muted; the site calls it
at mount and on every change, and the last value is kept and applied again once the audio runs),
`unlockAudio()` (the page has had a click or key press: create or resume the AudioContext and
play now) and `destroy()`. The stage draws no sound button and no "click for sound" hint; a click
or key on the stage itself also unlocks, as a fallback only.

`channel.ts` default-exports `() => ChannelDef` (`id: 'brawl'`, `title: 'Ringout'`,
`intermissionMs` from env, default 8000) and exports `SIM_HASH` (sha256 of `src/sim/*.ts`, sent
with the seeded window). Bots rotate through every pair from `bots.json` so everyone plays.
Records and three-line memories are kept in memory by the channel and sent in `announce`
(`entrants[].record`). The favourite gets starting damage (`handicap`) once both bots have three
matches and their win rates differ by 0.25 or more (up to 30%).

## The show

One match is `runMatch(show, deps)` in `src/show/script.ts`. It uses only `show.sleep`,
`show.elapsed`, `show.signal` and `deps` (no timers, no `Date`, no `Math.random`), so it runs the
same in the runner, in the harness on the fake Show, and on a virtual clock.

| phase | planned length | what happens |
|---|---|---|
| call | 10 s | `announce`, `call` |
| select | 24 s | `select_open`; both minds pick hidden; `picks` at 16 s (both flip together) |
| versus | 16 s | `versus`, `taunt` side 0 at 4 s, side 1 at 8 s |
| predictions | 30 s | window A "Who wins?" (seeded: the fight seed comes from the lock) |
| fight | 90 to 170 s | 3.5 s countdown, then the sim in real time. Plans every 3 s |
| break (per lost life) | 27.8 s | `life_lost`; 2.6 s for the stage to play the knockout live (`koHold`); `replay` (7 s); `corner_talk` x2 (1.2 s, feed only: the stage shows no text); window "Who wins?" 15 s (live); 2 s resume countdown |
| verdict | 20 s | `match_end`, every window settled, `show.end`, then the intermission |

Rules the script keeps:

- The fight never waits for a model. Plan requests go out at each `COACH_PERIOD` boundary (180
  ticks) when that side has none in flight. An answer is cleaned (`sanitizePlan`), its read
  checked, and scheduled at the first boundary at least 45 ticks after it landed, then emitted as
  `plan` straight away. A late, broken or unchanged answer changes nothing.
- No model call that could decide an open window happens while it is open: picks happen before
  window A, plans only after it locks. At a knockout, answers to older questions are dropped; the
  corner calls (the longer think) run during the replay and must finish, or fall back to the old
  plan and a stock line, before the break window opens. The corner plan is emitted as `plan` for the
  first tick after the knockout, and again at any later tick where an older plan was pending.
- The final knockout skips the corner talk and the window: the live knockout (2.6 s), the replay
  (7 s), then the verdict (`match_end` 9.6 s after `life_lost`).
- A knockout always plays live before its replay. The channel waits `TIMING.koHold` after
  `life_lost` before it emits `replay`, and the stage's playback (which draws about 0.4 s behind,
  plus 0.5 s on a lethal hit) keeps the live fight running up to the knockout tick whatever has
  arrived, holds on it, and starts the replay only at the `replay` event's own time.

Break timeline (ms after `life_lost`): 0 `life_lost` (the live knockout is drawn about 0.5 to 1 s
later), 2600 `replay`, 9600 `corner_talk` side 0 (when the think is done), 12000 side 1, 15600
`break_window`, 30600 `fight_resume` (`startAt` 32600). Final knockout: 0 `life_lost`, 2600
`replay`, 9600 `match_end`.
- Every window opened is settled with the winner at the end (or voided if the match aborts).

## Feed

The platform's own messages (from the runner, and the same from `src/show/fakeShow.ts`):
`snapshot`, `match`, `phase`, `window_open`, `pools`, `window_locked` (with `seed` for window A),
`event` (`{ type: 'event', t, event: { type, at, data } }`), `window_settled`, `window_void`,
`match_end`. The game's events (`event.event.type`), from `src/show/events.ts`; `at` is ms since
`announce`. Every event marked **ctx** carries the whole match context so far
(`{ matchNo, bots[2], roster, picks?, taunts?, header?, lives? }`), so a late joiner can draw
from any one of them.

| type | data |
|---|---|
| `call` | **ctx**, `durationMs` |
| `select_open` | **ctx**, `durationMs`, `revealInMs` |
| `picks` | **ctx** (`ctx.picks` set) |
| `versus` | **ctx**, `durationMs` |
| `taunt` | `side`, `text` (10 words at most), `audio?` |
| `predictions` | **ctx**, `windowId`, `durationMs` |
| `fight_start` | **ctx** (`ctx.header`: seed, fighters, handicap, lives, timeLimitTicks), `startAt` (ms since announce of tick 0) |
| `plan` | `side`, `tick` (takes effect), `plan` (stance, aggression, range, grabMix, edge, recover, order, read), `thoughtMs` |
| `state` | **ctx**, `tick`, `at`, `s` (the full FightState), `hash`. Every 120 ticks, at fight start and at each resume |
| `hit` | `tick`, `by`, `to`, `move`, `damage`, `total`, `strength` (medium and stronger only) |
| `sudden_death` | `tick` |
| `life_lost` | **ctx**, `tick`, `side`, `by`, `damage`, `move`, `edge`, `final`, `durationMs` (the whole break: 32600, or 9600 for the final one) |
| `replay` | **ctx**, `from { tick, s }` (about 150 ticks back), `plans` (PlanAt[] inside the range), `toTick`, `speed` (0.5), `durationMs`. Sent `TIMING.koHold` (2600 ms) after `life_lost` |
| `corner_talk` | `side`, `text` (12 words at most), `plan`, `audio?` |
| `break_window` | `windowId`, `durationMs` |
| `fight_resume` | **ctx**, `tick`, `startAt` |
| `match_end` | **ctx**, `winner`, `winnerId`, `tick`, `lives`, `damage`, `stats`, `bestKo { from, plans, toTick, by } \| null`, `durationMs`, `nextInMs` |

`show.end(result)` sends `MatchResult`: `{ winnerId, loserId, winner, lives, damage, ticks,
fighters, plansByStance, planChanges }`.

## Minds

- `bots.json`: `{ id, name, model, label?, instructions, look, voice? }`. Any OpenRouter model id
  works; no code path names a model. The ids in the file are placeholders (`provider-x/model-small`):
  set real ones before a real-model run. `label` is what the HUD shows (each mock bot has its own
  so the two plates differ); change it together with `model`, or delete it to derive one from the id.
- `src/show/brains.ts`: the `Brains` interface, `mockBrains` (the sim's `COACHES`, think delays of
  0.6 to 2.4 s for plans and 2 to 5 s for corner calls, banks of reads, taunts and corner lines),
  and `createOpenRouterBrains` (compact JSON prompts, small `max_tokens`, timeouts: plan 6 s,
  corner 9 s, pick and taunt 12 s, each falling back to the old plan or a mock line).
- `src/show/brains.node.ts`: `.env` loading, the cost log (`.cache/cost.json`, every call with
  tokens and cost), and the real or mock choice.
- `src/show/content.ts`: every line is checked before it airs: PG-13, no slurs, no sexual content,
  no real people, no franchise wording, word limits (read 8, taunt 10, corner 12, memory 20), em
  dashes and emoji stripped. On failure: one regeneration, then a safe line from the mock bank.

## Stage playback (what modules see in a break)

- `frame.fight.mode` tells live from replay. The knockout's `ko` sim event (and the lethal hit
  before it) reaches the modules in mode `'live'`, then the view is `'frozen'` on the knockout
  tick until the replay, then `'replay'` frames (which re-run the same `hit` and `ko` events), then
  `'frozen'` again. `show.phase` is already `'break'` from `life_lost`, before the stage has drawn
  the knockout (it runs about 0.4 s behind, plus 0.5 s on a lethal hit): key break dressing on
  `fight.mode` or on `show.phaseMs >= TIMING.koHold`, not on the phase alone.
- Respawn: the frozen views carry the sim's state as it is, so the knocked-out robot is in action
  `dead` through the hold, the replay's end and the resume countdown. After `fight_resume` the live
  view plays on through `dead`, the sim's `respawn` event and action (the pad), then `fall`.
- `ctx.fighters` is the two fight robots (null before picks, replaced when the picks change).
  `post.coverSet` (set in `update()`, reset each frame) hides what the arena, hitfx, ko and hud
  modules and the fight robots put in the scene, and skips shadows, the background and the dim
  pass; lights and everything the screens added still draw. `show.selectRevealMs` is
  `select_open.revealInMs`.

## Harness

`npm run dev` serves `harness/index.html` on http://localhost:5202 (other agents: do not start it
yourself, use the capture tool). It mounts the stage full-window and runs the real match script on
the fake Show (`src/show/fakeShow.ts`) with mock brains, match after match, rotating pairs from
`bots.json`.

URL params (live and capture):

| param | meaning |
|---|---|
| `seed=abc` | seeds the script, the fake Show and the mock brains (live default: random; capture default `ringout`) |
| `a=kiln&b=tick` | force the picks (side 0, side 1) |
| `coaches=adaptive,rush`, or `ca=` / `cb=` | mock coaches per side |
| `fast=1` | short call, select, versus, predictions, replay, corner talk, window and verdict |
| `hl=0\|1\|none` | the viewer's pick: calls `highlight()` with that side's bot (`none` clears it) |

The dev strip under the stage (live mode only) shows the match number, phase, drawn tick, fps,
playback hash mismatches and each robot's action, damage and lives, and has buttons for the
camera (`Auto`, `Wide`, `Follow A`, `Follow B`), the pick (`Pick A`, `Pick B`, `No pick`), `Mute`
(a dev control; on the site the volume is the platform's), and `Rejoin` (a fresh stage fed only
the fake Show's snapshot: the late-join path). The harness drives sound the way the site does: it
calls `setVolume(0.8)` at start and unlocks on the first click or key anywhere on the page.
`window.__ringoutLive` holds `{ stage, run }` for the console.

### Capture mode

`?capture=1&scene=<name>&...` runs everything on a virtual clock: nothing moves unless a hook is
called, so every capture is frame-exact and repeatable. Hooks on `window.__ringout`:

| hook | does |
|---|---|
| `ready` | a promise, true once the fonts are in |
| `scenes` | the scene names |
| `load(scene, params)` | a fresh stage and match, seeked to the scene's moment |
| `step(frames)` | advance 1/60 s per frame, rendering each |
| `seek(ms)` | advance without rendering (modules still update every 100 ms), then render one frame; with `rejoin=1` it rejoins first |
| `rejoin()` | late join now: destroy the stage, make a new one fed only the snapshot |
| `render()` | draw the current frame again without advancing anything |
| `info()` | scene notes, `rejoins`, `virtualMs`, and the stage's `phase`, `showMs`, `phaseMs`, `tick`, `mode` (live, frozen, replay), `holding`, `koTick`, `covered`, `events` (the last 5 sim events the modules got: "tick mode type details"), `fighters`, `plans`, `fps`, `mismatches` |

Scenes (params in brackets; every scene also takes `seed`, `a`, `b`, `ca`, `cb`, `hl`, `rejoin`):

| scene | lands on |
|---|---|
| `match` | the start of a whole show (`fast=1`, `loop=1` for more than one match) |
| `fight` | the fight, at sim tick `at` (default kiln vs tick) |
| `ko` (also `life`) | `before` ticks (default 30) before a knockout is drawn live: the `n`th (default 1), or with `final=1` the one that ends the match. The match is run headless first to find the knockout ticks (`info().knockouts`, `koTick`, `goalTick`). Step on from there to see the live knockout, the hold, then the replay |
| `select`, `versus`, `predictions` | that screen, `ms` into it (defaults 18000, 12000, 5000) |
| `break` | `ms` into the first break (default 16600: 1 s into the window) |
| `verdict` | `ms` into the verdict (default 1500) |
| `moves` | a pose sheet of one `fighter`: every move at start, first active, last active and end frames; `move=<id>` for one move frame by frame; `move=actions` for every action. Fitted to the frame with the labels under each floor line; `parts=2&part=2` pages a long sheet |
| `arena` | the empty set (`cam=close` for a close camera) |

## Capture

`node tools/capture.mjs` (or `npm run capture --`) takes frame-exact stills, contact sheets and
clips of the harness. Never launch a browser or a dev server yourself: this tool does it.

```sh
node tools/capture.mjs --scene <name> [--<param> value ...] [--seek <ms>] [--frames N] [--every K]
     [--size 1280x720] [--out captures/<dir>] [--clip] [--sheet] [--crop x,y,w,h] [--cols C]
     [--allow-console-errors] [--standin] [--url <harness url>]
node tools/capture.mjs --scene list                 # the harness's scenes
node tools/capture.mjs --set <file.json>            # several captures in one browser session
node tools/capture.mjs --page <file|url> [--size WxH] [--full] [--out dir]   # screenshot any page
node tools/capture.mjs --gpu                        # which Chromium flags give hardware WebGL
```

- Any unknown `--key value` is a scene param (numbers and true/false converted), so
  `--scene ko --final 1 --hl 0` or `--scene fight --a gantry --b vise --at 1200`. `--at` goes to
  the scene as `at`. (`page`, `sheet` and `cols` are the tool's own flags, so the pose sheet pages
  with `--parts` / `--part`.)
- It loads the scene, `--seek`s, waits for the network to go quiet and two real frames, then takes
  `--frames` stills `--every` rendered frames apart (`f-0001.png` ...), with `info()` recorded per
  still in `manifest.json`. A contact sheet `sheet.png` when there is more than one still (or
  `--sheet`). `--clip` also records every frame at 60 fps to `clip.mp4` (45 s and 100 MB at most).
  Output defaults to `captures/<scene>-<time>/`.
- A `--set` file is an array of capture objects (or `{ captures: [...], ...defaults }`); CLI flags
  act as defaults for every entry.
- Any console error, page error or failed module request fails the capture, unless
  `--allow-console-errors`. Loads are retried while someone else's edit has the build broken.
- One browser at a time on this machine: the tool takes the lock `/tmp/ringout-browser.lock`
  (a directory; `owner.json` inside has the pid and the last progress beat) and waits up to
  15 minutes for it. A lock is stale when its beat is older than 5 minutes and its pid is dead, or
  older than 12 minutes. The tool starts Vite on 5202 if nothing answers there and stops it after.
- Chromium runs headless with hardware WebGL (ANGLE on Metal).
