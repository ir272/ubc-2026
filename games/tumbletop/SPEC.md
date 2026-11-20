# Tumbletop — build contract

Tumbletop is an original obstacle-course elimination race. 40 AI bots ("Gumbles") race one
course; the slowest are eliminated. Nobody plays: people only watch, so spectating is the product.

Everything here is our own. Do not copy names, characters, art, UI, music, course layouts or
obstacle designs from any existing game (Fall Guys especially — it is the quality bar, not a
source). Genre conventions (race, obstacles, qualification counter, eliminations) are fine.

## Identity

- **Game**: Tumbletop. **Course**: "Attic Dash" — a giant sunlit attic tabletop world built from
  toys and household objects: wooden alphabet blocks, spinning tops, marbles, rulers, a
  metronome, books, crayons, board-game tiles. Bright, saturated, toy-like, readable from far away.
- **Characters**: Gumbles — squat gumdrop-shaped jelly bodies (wide round base, domed top, slight
  translucency/subsurface feel, glossy highlight), two big dot eyes and a small mouth on the front,
  tiny nub feet, little nub arms, a short sprout/stem on top. Each bot has a unique two-colour
  pattern (stripes, spots, split, gradient, star) and a name. They squash and stretch.
  Not capsule-shaped, no visor face — must never read as a "bean".

## Architecture

```
sim/            pure JS (ES modules). NO three.js, NO DOM, NO Math.random, NO Date, NO performance.now
  rng.js        seeded PRNG (sfc32/mulberry32) + helpers
  course.js     course definition as plain data (sections, surfaces, obstacles, checkpoints, finish)
  physics.js    bot movement, collisions, obstacle interactions
  ai.js         bot brains (personality params from seed)
  names.js      bot names + colour/pattern assignment
  sim.js        createSim(), fixed-step loop, events
  index.js      public exports
  cli.js        node sim/cli.js --seed 42 [--events] [--json]  → prints finish order + state hash
web/            browser renderer; reads sim state only, never changes it
  index.html, src/main.js           bootstrap, fixed-step accumulator, render loop, debug API
  src/world/environment.js          sky, lighting, background set dressing, post
  src/world/courseView.js           course + obstacle meshes built FROM sim/course.js data
  src/characters/gumble.js          Gumble model, materials, animation from bot anim state
  src/camera/cameras.js             camera modes
  src/camera/director.js            auto-director (which bot/mode to show, when to cut)
  src/replay/replay.js              state recorder ring buffer + key-moment replays
  src/hud/hud.js, hud.css           on-screen display
  src/flow/roundFlow.js             intro flyover, countdown, qualify/eliminate moments, results
tools/
  capture.mjs   headless Chromium screenshots of deterministic moments (see Capture API)
  perf.mjs      frame-time benchmark, 40 bots
  blind.mjs     builds label-stripped, randomised A/B pairs for critics
test/           node --test: determinism, headless run, no forbidden globals in sim/
reference/      (gitignored) clips/, stills/<category>/, strips/<category>/, INDEX.md
captures/       (gitignored) our captures and blind pairs
```

## Simulation contract

- `createSim({ seed, botCount = 40, qualifyCount = 30 })` → `sim`
- `sim.step()` advances exactly one tick. `TICK_RATE = 60`, `DT = 1/60`. Deterministic: same seed →
  identical state every tick, in node and browser.
- `sim.state` (read-only to consumers):
  - `tick`, `time` (seconds), `phase`: `'intro' | 'countdown' | 'race' | 'finished'`
    (intro ≈ 8 s, countdown 3 s, race until `qualifyCount` bots finish or a time limit).
  - `bots[]`: `{ id, name, colors: [hexA, hexB], pattern, pos: {x,y,z}, vel: {x,y,z}, yaw,
    anim, animTime, grounded, progress (0..1 along course), distance (m along course),
    place (1..N live rank), status: 'racing'|'qualified'|'eliminated'|'respawning',
    finishTime|null, finishPlace|null, section (index), lastEventTick }`
    `anim` ∈ `idle | run | jump | fall | dive | getup | stumble | tumble | grab | celebrate | sad`
  - `obstacles[]`: `{ id, type, pos, rot (quaternion or euler {x,y,z}), ...type params }`
    recomputed per tick from course data + tick (pure function of time).
  - `qualifiedCount`, `qualifyCount`, `leaderId`, `bubble` (ids of bots ranked around the cut).
- `sim.drainEvents()` → events since last drain. Every event: `{ tick, type, botId?, otherId?,
  section?, pos?, importance (0..1), text }`. Types at minimum: `phase`, `start`, `leadChange`,
  `overtake`, `fall` (off course), `respawn`, `knockback` (hit by obstacle), `bump` (bot-bot),
  `tumble`, `nearMiss`, `pileup`, `checkpoint`, `qualified`, `lastSpot` (final qualifying place
  taken), `eliminated`, `roundEnd`, `photoFinish`, `comeback`.
- `sim.hash()` → stable string hash of full state (for determinism checks).
- Course coordinates: +z is forward along the course, y up, metres. Course ≈ 300–400 m.
- Bots fall off edges, respawn at last checkpoint (time penalty), get knocked by obstacles,
  bump each other, dive, stumble. Races must be dramatic: lead changes, falls, a tense cut line.

## Renderer contract

- Fixed-step accumulator: real time → `sim.step()` at 60 Hz; render interpolates between the
  previous and current tick. Render rate never changes the simulation.
- Same seed in browser = same finish order as `node sim/cli.js --seed N`.
- URL params: `?seed=N&cam=follow|leader|overview|track|director&bot=ID&t=SECONDS&speed=X&hud=0|1&capture=1`
- Debug/capture API on `window.__tt`: `ready` (bool), `seek(seconds)` (fast-forward sim
  deterministically, no rendering), `setCamera(mode, botId?)`, `renderFrame()`,
  `stepFrames(n)` (advance n render frames at 60 fps virtual time), `state()`, `events()`,
  `replay(eventIndex?)`, `perf()`.
- Budget: steady 60 fps with 40 bots on an M-series laptop (CPU frame time p99 < 12 ms,
  draw calls < 250). Use instancing/merged geometry where it helps.

## Spectating requirements (the product)

Camera modes (follow, leader, overview/drone, trackside cinematic, auto-director), switching
between bots (keys, clicking HUD rows), replays of key moments (slow-mo, different angle, clear
REPLAY framing), and an always-on display of: who leads, who is in danger (the cut line /
bubble), what just happened (event feed), qualified counter, race clock, whole-field progress
strip. Watching must never be dull or confusing: the director never cuts to nothing, holds shots
long enough to read, always labels who you are watching.

## Capture API (for critics)

`node tools/capture.mjs --scenario <name> --seed N --out captures/<dir>` and
`node tools/capture.mjs --seed N --t 42.5 --cam follow --bot 3 --frames 8 --every 0.25 --out ...`
writes PNGs (1280×720) and a contact sheet. Deterministic: same args → same pixels (modulo GPU).

## Rules for every agent

- Stay inside the files your piece owns; touch shared files (main.js) minimally and only
  through the documented hooks.
- Keep `sim/` free of three/DOM/time/Math.random. `npm test` must pass before you finish.
- Commit only your own paths: `git add <paths> && git commit -m "..."` (retry if index.lock
  exists). Do not commit reference/ or captures/.
