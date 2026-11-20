# Brief: Tumbletop as a three-round knockout show

Read `games/COMMON.md` first. Dev port 5201. This is a seeded game, no models.

The game has been copied into this folder, `ubc-2026/games/tumbletop/`, from `~/fall-guys`
(without its git history, dependencies or old captures; run `npm install`). Work here, not in the
old repo. Read `SPEC.md` and
`README.md`. Today it is reworked from one 40-bot race into a three-round show that is easy to
follow and bet on, and it gets a platform adapter in this same folder.

User's words: "we really like the Fall Guys idea as the battle royale." "tumbletop three round show
and lowering the entrants is a good idea." "tumbletop has good potential... i wonder if one main
camera makes sense or... toggle cameras." "in a game like fall guys the viewer experience isnt that
simple so thats why im stressing being very methodical about this."

## References (bar for quality, never for content)

- **Fall Guys:** the elimination-show structure and how a round's cut is made obvious.
- **Jelle's Marble Runs:** a chaotic race of identical-looking racers made followable and worth
  caring about through names, teams, form and a broadcast that always knows where the story is.
- **Formula 1 timing graphics:** a compact standings tower and a clear line for who is in and out.

Keep everything already ours: the Gumbles, the attic, the obstacles.

## The show

- **16 entrants** per show, drawn from a fixed house roster of 24 Gumbles. Each Gumble has a
  permanent name, look and stats (speed, grip, bounce back, nerve or similar) that visibly change
  how it runs, and a record across shows. Today names and stats are reshuffled per seed in
  `sim/names.js` and `sim/ai.js`; that ends. Which 16 run is decided before the show is announced.
- **Three rounds, each its own seeded race with its own seed:**
  1. Round one: 16 start, the first 8 to finish go through.
  2. Round two: 8 start, the first 4 go through.
  3. The final: 4 start, first across the line wins.
  Build the three rounds from the existing seven course sections, so each round is a different
  stretch with its own character. Aim for about 60 s, 45 s and 35 s of racing.
- **Betting windows** (the channel opens them, the stage only has to leave room in the pacing):
  before round one "Who wins the show?" with 16 outcomes, before round two the same question with
  8, before the final with 4. Each window is seeded, and its seed runs the round that follows.
  All three settle on the show winner.
- Between rounds: a short recap of who went out and how, then the survivors on the start line with
  their records while the next window is open.
- A whole show runs 4 to 5 minutes including betting.

`simulate({ seed, entrants, options: { round } })` runs one round. `createSim` already takes a
seed; its 40 and 30 defaults at `sim/sim.js:78` become parameters. `SIM_HASH` covers the sim bundle.

## Watching it (the main work)

The problem to solve: with a crowd on screen a new viewer cannot tell what matters. The fix is that
the broadcast always follows the cut line, and there is less on screen.

- **Cameras:** `cameras = ['Director', 'Leader', 'Cut line', 'My pick', 'Overview']`. Director is
  the default and spends most of its time on the fight around the last qualifying place, cutting to
  the leader and to falls only briefly. `setCamera('My pick', entrantId)` follows one Gumble.
  The runtime hook `window.__tt.setCamera(mode, botId)` already exists.
- **`highlight(entrantId)`:** a ring and name tag on the viewer's pick that survive every camera.
- **Stage HUD, cut down hard:** one compact standings tower centred on the cut line (two above,
  two below, plus the leader and the viewer's pick), a count of places left, the round name and
  clock. At most one event line at a time. Remove the keyboard help panel and the five-line event
  feed. Nothing on screen that a first-time viewer has to learn.
- **The cut is a moment:** when the last place is taken the race visibly ends for those still
  running, with a beat on who just missed.
- **The final is different:** four racers, every one name-tagged, tight camera.

## Bar

On top of the shared bar in COMMON.md:
- **Comprehension, tested on each round separately:** from a 30 second clip a fresh critic can say
  how many go through, who is on the edge right now, and where the viewer's highlighted pick is.
  4 of 5 critics, for all three rounds.
- **Determinism:** same seed and entrants give the identical round, node and browser, by state hash.
- **Completion:** 200 full shows finish with no Gumble stuck.
- **Balance:** over 500 shows no Gumble wins more than 15% or fewer than 2% of the shows it enters,
  and stats matter (the fastest third wins more than the slowest third, but under twice as often).
- **Drama:** on average at least two changes of who holds the last qualifying place in the final
  10 seconds of rounds one and two.
- **Look:** not worse than today. At least 50% blind-pick wins against today's build on readability.

## Platform adapter, in this folder

`index.ts` (mount, onFeed, cameras, setCamera, highlight, destroy), `channel.ts`, the sim bundle
with `simulate` and `SIM_HASH`, the harness, README and REPORT, as COMMON.md describes. The stage
replays a round from the seed and entrants in the feed, in step with the channel's clock, and can
join mid-round. Keep the roster and records in this folder.

Order of work: roster and three-round sim with checks, then the director and HUD with the
comprehension test each round, then the adapter and harness.
