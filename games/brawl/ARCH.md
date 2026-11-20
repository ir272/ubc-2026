# Ringout: architecture and direction (read after COMMON.md and BRIEF.md)

The show is called **Ringout** (folder and channel id stay `brawl`). A robot fight league,
broadcast live: two AI models each pick a robot, corner it, and viewers bet on the winner.
The contracts are code: `src/sim/types.ts`, `src/show/events.ts`, `src/stage/api.ts`.
Do not change those three files. If one blocks you, say so in your report and work around it.

## Rules for every agent working here

- Work only inside `games/brawl/`. No git commits. Never touch `runner/`, `web/`, `program/`, other games.
- Stay in the files your task names. Other agents are editing the other files right now.
- One headless browser at a time on this machine. Never launch a browser or a dev server yourself:
  use `node tools/capture.mjs ...` (it queues behind a lock, starts and stops what it needs).
  Batch simulations: at most 2 worker processes.
- The slop ban list in COMMON.md applies to every pixel and word: no eyebrow labels, no monospace
  uppercase, no purple gradients, no beige, no glowing orbs, no shockwave rings, no decorative
  particles, no fake stamps, no em dashes in on-screen text, no emoji. 20 words at most per line.
- Nothing from Super Smash Bros. is copied: no character, stage, logo, UI artwork, sound, music or
  wording. We match how it plays, reads and feels with our own designs.
- Reference footage is in `refs/` (local only). Captures go to `captures/`.

## Layout

```
index.ts            mount(el, { assetsBase }) -> GameHandle             (platform adapter, browser)
channel.ts          default export () => ChannelDef                     (platform adapter, node)
bots.json           entrants: { id, name, model, instructions, look, voice? }
src/sim/            pure deterministic fight: types.ts (contract), math.ts, arena.ts, fighters.ts,
                    engine.ts, controller.ts, coach.ts, index.ts
src/show/           events.ts (contract), script.ts (the match script, runs in node and browser),
                    brains.ts (models through OpenRouter, mock brains, content check, cost log),
                    reduce.ts (feed -> ShowState), playback.ts (feed -> FightView)
src/stage/          api.ts (contract), stage.ts (renderer, loop, module wiring), arena.ts, camera.ts,
                    rig.ts (shared robot rig and pose tools), fighters/{kiln,tick,gantry,vise}.ts,
                    hitfx.ts, ko.ts, hud.ts, screens/*.ts, audio.ts, style.ts (colours, fonts)
harness/            index.html + main.ts: mounts the game, drives it through a fake Show
tools/              match.mjs, batch.mjs, capture.mjs, sheet.mjs, progress.mjs
refs/ captures/     local only
```

## The fight simulation (src/sim)

API (`src/sim/index.ts`):

```ts
ARENA: ArenaDef;  FIGHTERS: Record<FighterId, FighterDef>;
createFight(header: FightHeader): FightState
stepFight(s: FightState, header: FightHeader): SimEvent[]      // advances one tick, in place
schedulePlan(s: FightState, p: PlanAt): void                    // takes effect when s.tick === p.tick
coachView(s: FightState, header: FightHeader, side: Side): CoachView
hashFight(s: FightState): string                                // short hex, same in node and browser
sanitizePlan(raw: unknown, prev: Plan): Plan                    // repair a model's JSON into a legal plan
COACHES: Record<string, Coach>                                  // 'rush' 'keepaway' 'bait' 'wall' 'adaptive' 'random'
simulate({ seed, entrants, options }): { durationMs, events, result }   // CONTRACT.md form, mock coaches
SIM_VERSION: string
```

FightState is plain JSON (`JSON.parse(JSON.stringify(s))` must continue identically). The
controllers ("hands") run inside `stepFight`, read only `s.plans[side]` and the state, and keep
their memory in `s.ctl`. Both sides get exactly the same controller code and skill. No side bias:
resolve both fighters' hits simultaneously each tick.

Arena: main deck x from -8 to 8, top at y = 0, a ledge at each end. Soft platforms: left
(-5.4 to -2.6, y 2.5), right (2.6 to 5.4, y 2.5), top (-1.5 to 1.5, y 4.8). Blast lines: left -16,
right 16, top 12.5, bottom -7. Spawns x = -3 and 3. Fighters are 1.3 to 2.3 m tall.

Knockback (the genre's usual formula): with p = target damage after the hit, d = hit damage,
w = target weight: `kb = ((p/10 + p*d/20) * 200/(w+100) * 1.4 + 18) * kbg/100 + bkb`, times
`s.kbScale`. Launch speed = kb * 0.03 m per tick at the hitbox angle, decaying 0.0051 per tick;
hitstun = floor(kb * 0.4) ticks; tumble when kb > 80; hitlag = floor(d * 0.65 + 6) for both.
Strength: light kb < 45, medium < 90, heavy otherwise, lethal when a no-DI forward simulation of
the launch crosses a blast line. Shields: 100 health, shrink while held, regenerate, break into a
long stun at 0; grabs beat shields; shield stun and pushback on block; perfect shield in the
first 3 ticks. Ledges: grab when falling near one, 1 ledge invulnerability per airtime, options
from the ledge (climb, attack, roll, jump). Dodges: roll, spot dodge, air dodge (one per airtime).
Teching, DI (the controller picks survival or combo DI), fast fall, short hop, double jump,
platform drop-through. Respawn: a pad lowers from the top with 2 s of invulnerability.
Rules: `lives` each, `timeLimitTicks` of regulation, then sudden death: `kbScale` starts at 1.5
and grows 0.1 every 5 s until someone is out. The fight always ends. Target fight length with two
lives each: 90 to 170 s, first lost life around 40 to 70 s.

### The four fighters (cast undecided: the owner chooses)

The owner, 2026-11-19: "i didnt want only robots as characters... i wanted like fictional stuff",
and: "you NEVER will decide, you must ASK me what the creative stuff is". The cast is his to
choose and is being brainstormed with him. Until he decides, the four robots built today stay on
screen (ids kiln, tick, gantry, vise). Do not design, rename or replace characters without his pick.
The fighter ids, movesets, hitboxes and balance in the sim stay whatever the cast becomes.

### Minds matter (the first thing to prove)

Stances and how the hands play them:

- **rush**: close the gap, strings of strikes and grabs, chase, pressure shields.
- **keepaway**: hold space, retreat, poke at max range, use the projectile, punish approaches.
- **bait**: hover just outside range, make the opponent swing first, dodge or dash back, punish whiffs.
- **wall**: hold the middle, shield and counter out of shield, anti-air, do not chase.

Intended counters, from real mechanics and never from a hidden multiplier: bait beats rush
(whiff punishes), rush beats keepaway (it closes space, and a retreating fighter runs out of
deck), keepaway beats wall and bait (they wait and get chipped), wall beats strike-heavy rush
(shield punishes) but loses to grab-heavy rush (grabs beat shields), and bait beats grab-heavy
play (grabs whiff and get punished). The dials matter the same way: `edge: deep` wins big against
`recover: low` and gets punished by `recover: high`; `order: kill` is right at high opponent
damage and reckless early; high aggression is wrong at high own damage. Fighter types shift every
matchup (Gantry keeps away best, Tick rushes best, Vise punishes walls, Kiln punishes hardest).

The numbers that must hold (`npm run batch` prints them):

- an adaptive mock coach beats each of the four fixed-stance coaches at least 60% of the time
- no fixed stance beats all three others
- two identical coaches split between 45% and 55% (sides swapped, mirrored and mixed matchups)
- with adaptive coaches on both sides, no fighter wins more than 60% against the field
- 200 mock matches finish; no stretch over 6 s without an exchange (a hit, a shielded hit or a grab)
- the same header and plans give the same hash at every tick in node and in the browser

## The show (src/show/script.ts)

One function, `runMatch(show, deps)`, runs one match against the platform's `Show` interface
(`runner/src/types.ts`). It never touches timers or randomness directly: `show.sleep`,
`show.elapsed` and `deps` (`brains`, `random`, `bots`, `records`, `options`) are all it uses, so
the same script runs in node (channel.ts), in the browser harness on a fake Show, and on a
virtual clock for captures. Phases and feed events are in `src/show/events.ts`. Order:

1. `show.announce` then `call`.
2. `select_open` (both minds pick a fighter, hidden) then `picks` (both flip together), `versus`, two `taunt`.
3. `show.openWindow` "Who wins?" (seeded: true, so the fight seed comes from the lock and nobody
   could know it while betting), `predictions`, `show.lock`.
4. `fight_start`, then the fight in real time: the script steps the sim to keep pace with
   `show.elapsed()`, asks both minds for a plan every `COACH_PERIOD` ticks (never waits for them),
   and emits `plan` with the tick it takes effect: the first plan boundary at least 45 ticks
   after the answer arrived. A late or broken answer changes nothing. A `state` checkpoint every
   120 ticks, `hit` for medium and stronger hits.
5. On each lost life: `life_lost`, `replay`, the minds' longer think, two `corner_talk`, then (if
   the match is not over) `show.openWindow` "Who wins?" for 15 s (seeded: false), `break_window`,
   `show.lock`, `fight_resume`. All model calls that could decide an open window happen before it
   opens or after it locks.
6. `match_end`, settle every window with the winner, `show.end(result)`, stay on the verdict.

## The stage

`stage.ts` owns: the three.js renderer and loop, the show clock (server time from feed messages),
`reduce.ts` (feed to `ShowState`), `playback.ts` (feed to `FightView`), and it calls each module's
`update(frame)`. Playback runs the same sim locally from `fight_start` / `state` / `plan` /
`fight_resume`, about 0.4 s behind the channel so plans always arrive before their tick, and
snaps to a `state` checkpoint if its own hash ever disagrees. Knockout replays re-run the sim
from the state carried in `replay`. Hit pause is in the sim (`hitlag`), so everyone sees the same
freeze. The stage fills its container at 16:9; UI is laid out for 1280x720 and scaled.

### Capture hooks (harness)

`harness/index.html?capture=1&scene=<name>&...` runs on a virtual clock and exposes
`window.__ringout = { ready, scenes, load(scene, params), step(frames), seek(ms), info() }`.
Nothing advances unless `step` or `seek` is called, so captures are frame-exact and repeatable.
Scenes: `match` (the whole show on mock brains), `fight` (straight into a fight: `a`, `b`
fighters, `ca`, `cb` coaches, `seed`, `at` tick), `moves` (one fighter's whole move list as a
pose sheet), `select`, `versus`, `predictions`, `ko`, `break`, `verdict`, `arena`.
`node tools/capture.mjs --scene fight --a kiln --b tick --at 1200 --frames 12 --every 2 --out captures/x`
writes stills, a contact sheet and (with `--clip`) an mp4.

## Direction (art, sound, words)

**No random text or filler (the owner's rule, 2026-11-19, it outranks everything below).** His
words: "declutter the like random text and stuff, it has a kind of sloppy unoriginal look to it.
if a character is detailed then that can be fine". So: cut text, labels, plates, strips, stock
shapes and loose particles that are there to fill space or look designed. Every word on screen
must tell the viewer something they need at that moment. Detail that is designed and belongs
(a character's build, a set piece, a well-made effect) is welcome. The test for any element: is it
ours and does it carry meaning, or is it generic decoration? Generic decoration goes.

**World.** Dry Dock 9: a fight deck slung between two gantry cranes over a shipyard at night.
Far: sea horizon and harbour lights under a deep navy to teal sky with a thin amber band. Middle:
a ship hull in dry dock with work lights, cranes with slow trolleys, container stacks. Near:
floodlight towers and scaffolds holding a crowd of small spectator robots that react to hits and
knockouts. The deck: thick painted steel with hazard-yellow ledge strips and a tapering girder
underside so it reads as a platform in space. Small platforms: grated catwalk plates hung from
crane hooks. The background sits back: lower contrast, cooler, softer than the fighters.

**Fighters.** About 2 m tall, chunky and toy-clear: big hands, feet and heads, strong
silhouettes that read at 60 px tall. Painted metal with two-tone livery, crisp bevels, a strong
cool rim light so they pop off the dark set. Emissive eyes and vents that show state (charging,
armour, stunned). Side colours (red side 0, blue side 1) show on shoulder plates, a ground marker
and the name tag, so a mirror match still reads. Motion is the point: anticipation, snap,
overshoot, follow-through. A robot may be stiff in the torso but never floaty.

**Screen language.** A sports broadcast, not a game menu. Type: Big Shoulders Display (heavy,
for calls and numbers) and Barlow Semi Condensed (for small text), both from @fontsource. Solid
colour plates cut at an angle, hard edges, hard offset shadows, big numerals. Palette: night navy
#0b1522, deck steel #2a3644, hazard yellow #ffc21a, signal red #ff3b30, cobalt #2f6bff, arc
white #f4f8ff, ember orange #ff7a1a for heat. Text slams in and wipes out on hard cuts.

**Hits.** Hit pause, a camera kick along the launch direction, a flat angular burst of shards at
the contact point (white core, side-colour edge), streak lines along the launch angle, a ribbon
trail behind a launched fighter that gets longer and hotter with knockback, the damage number
jumping and shaking. Heavy hits dim the set for a few frames. No rings.

**The lethal hit and the knockout.** When a hit will kill: time holds, the set drops to near
black, the two fighters go arc-white with hard ember edges like a welding flash, sparks pour from
the contact point along the launch line, then the launch plays at speed. Crossing the blast line:
a jagged column of side-coloured bolts drives in from that edge of the screen, the camera slams,
the crowd lights flare, and the call "RINGOUT" hits the screen.

**HUD.** Bottom of the frame, one angled plate per side: portrait, bot name and model, fighter
name, the damage percent in huge heavy italics (white, then amber, then red as it climbs, popping
and shaking on each hit), lives as bolt-head tokens. Above each plate a small plan plate: stance
mark, stance word, the read. When the plan changes the plate snaps over. Clock top centre.

**Sound.** Free CC0 packs for impacts, metal, crowd, whooshes; synthesized where it is better
(servo whirs, charge-ups, UI ticks). Layered hits scaled by strength: a thud, a metal crack, a
sub drop on heavy, a long ring-out blast on a lost life. A crowd bed that swells. An announcer is
out of scope unless ELEVENLABS_API_KEY is set; calls are on-screen text with a hit sound.
