# Blood Moon report

Written 05:15 CST Fri 2026-11-20. Folder and channel id are still `brawl`; the internal ids
(`ringout-...` match ids, `meta.game`, `ringout-sim-N`) are unchanged on purpose. The round log is
`ROUNDS.md`. The game was called Ringout until the owner renamed it this morning.

## What this is now

A watched platform fighter. Two AI models each pick a fighter, strike stages until one is left,
then coach their fighter with a game plan every three seconds while the fight plays itself at
60 Hz. Viewers bet play money on who wins. Everything on screen is drawn by code with one pen on
a 2D canvas: solid cream figures on near-black, line-drawn stages, in the site's ink style.

Between 03:00 and 05:15 on Nov 20 the owner threw out the 3D robot version and chose, from option
sheets, everything creative below. The three.js stage was deleted (it is in git up to `cbe16fb`).

## The owner's choices

- Name: Blood Moon.
- Fighters (six): The Count, The Wolf, The Empty Armour, The Magpie, The Hexer, The Mimic.
- Ink treatment: solid ink (he asked the lead's view and leaned the same way).
- HUD: option A, corner plates with a portrait ring, pen-drawn damage numerals, candles for lives.
- Stages: all six drawn (The Belfry, The Long Shelf, Gallows Hill, The Night Ship, The Map Table,
  Lamp Street).
- Stage pick: the bots strike stages in turn until one is left.
- Fight music: Danse Macabre.
- Every fighter has abilities, used often enough to carry the fight.

## What was built

- `src/ink/`: the pen, the stage shell, a 2D camera, a pose engine that turns the sim's state into
  joints (strikes land where the sim hits), six rigged characters in `cast/`, hit and ability
  effects, HUD A, six stage sets, and the call, character select, stage strike, versus,
  predictions, break and winner screens.
- `src/sim/` (`ringout-sim-6`): six fighters. Abilities: The Count (Bat Swarm, Mist Step, Bat
  Form), The Wolf (Pounce, Howl, Wall Run), The Empty Armour (Grave Cleave, Collar Fire, Fall
  Apart), The Magpie (Feather Knives, Snatch, Updraft), The Hexer (Hex Bolt, Ward, Crow Flight),
  The Mimic (Tongue Lash, Swallow and Spit, Coin Burst). Mechanics behind them: slow and floor
  projectiles, a fan with delays, a blink, a floor hazard that roots, a tether that pulls, a
  travelling grab, a stagger.
- `src/show/`: roster of six, stage strikes carried in the match context (`ctx.stages`,
  `ctx.strikes`, `ctx.stage`), select phase 36 s. No feed event name or adapter export changed.
- Audio (`src/stage/audio`): one score cut from Kevin MacLeod's Danse Macabre (CC BY 4.0) and
  about 60 short CC0 recordings; no crowd; credits in `ASSETS.md`.
- `lab/`: the option sheets the owner picked from (cast, stages, HUD, a music listening page).

## Check numbers

- `node --test test/*.test.mjs`: 60 of 60 pass. `npx tsc --noEmit -p .`: clean.
- A whole mock show plays in the harness from the call to the winner card with no console errors.
- Sim, 2,880 fights, adaptive coaches on both sides (mixed fixed coaches in brackets):
  - overall win rate per fighter: Armour 49 (52), Magpie 46 (50), Count 50 (42), Wolf 55 (58),
    Hexer 53 (48), Mimic 48 (50)
  - seconds between abilities per fighter: 3.0 to 3.7 (2.6 to 3.5)
  - share of damage through abilities: 30 to 51 percent (33 to 51)
  - all fights finish; median 83 s (84 s); mirrors 50.6 percent for side 0
- Matchups still outside 35 to 65: Magpie beats Wolf 28 percent (34), Hexer beats Mimic 67 (69).
  With mixed coaches only: Armour beats Count 64, nine quiet stretches over 6 s (worst 10.8 s).

## What is unfinished, unverified or thin

- **Nobody has listened to the sound.** Two previews were sent to the owner
  (`captures/lead/sound/blood-moon-preview.mp3`, `-2.mp3`). Every level was set by meters. The
  agent's own doubts: the fight loop starts mid-phrase, the howl may be too present, the
  Armour's Fall Apart may read as a clang, the magpie chatter has hiss.
- **Real models have not coached these six.** The last real-model trial (20 matches, $0.47 of the
  $1.50 budget) was on the two-plan-style robot sim before abilities. The stage-strike call and
  the new roster prompt have only run on mock coaches and a stubbed fetch in tests.
- **Not seen in a capture:** the Mimic holding an opponent inside for Swallow and Spit, its coins
  in the win pose, the clamp that keeps a knocked-down fighter above the deck, the off-screen
  pointer, a worn or struck shield.
- **Performance is not measured on a slow machine.** Script time per frame is under 1 ms in
  captures, but canvas raster cost is not counted and each stage set holds about 54 MB of canvas.
- **Harness fights are not exactly repeatable between runs** (mock plans arrive on a real-time
  clock), so capture ticks drift; the sim itself is deterministic and tested.
- Small picture flaws: the fighter's own win pose shows faintly behind the winner card; the
  Hexer's and Armour's throws use a generic heave; the Collar Fire cone reads a bit solid.
- The critic loops of the first day (34 rounds, all lost to the reference footage) judged the 3D
  version. Nothing in the ink version has been through a separate critic; it was checked by the
  builders and the lead looking at stills, and by the owner looking at previews.

## Calls the lead made without the owner (his to overturn)

- One platform layout for every stage (the sim has one arena); three stage drawings were refitted
  to it. The Night Ship's top platform is the ship's boat slung from the rigging.
- The Count rests with his cloak open so his side-coloured waistcoat shows; the sheet had it shut.
- How each side is told apart: one element per fighter takes the side colour (waistcoat, shirt,
  tabard, hood and mantle, shawl, iron bands).
- The whole score comes from one piece; the crowd sounds were removed.
- The strike order: sides alternate, the side that strikes first is `matchNo % 2`.
- Fights keep the earlier rules: two lives, three minutes, then sudden death with growing knockback;
  the opening window is seeded and the fight is replayable from the feed.

## Next steps

1. The owner's ears on the two sound previews; fix what he hears.
2. A short real-model trial on the six (budget left: $1.03) to see which fighters and stages
   models pick and whether the strike call returns clean answers.
3. Magpie against Wolf and Hexer against Mimic.
4. A critic pass on the ink version against real footage of the genre, piece by piece.
5. Per-stage platform layouts (the sim needs the arena in the fight header).
