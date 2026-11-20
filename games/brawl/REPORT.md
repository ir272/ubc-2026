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

- `node --test test/*.test.mjs`: 60 of 60 pass (rules `ringout-sim-7`). `npx tsc --noEmit -p .`: clean.
- A whole mock show plays in the harness from the call to the winner card with no console errors.
- Sim, 2,880 fights, adaptive coaches on both sides (mixed fixed coaches in brackets):
  - overall win rate per fighter: Armour 49 (53), Magpie 50 (54), Count 49 (41), Wolf 52 (56),
    Hexer 50 (49), Mimic 51 (47)
  - seconds between abilities per fighter: 3.1 to 3.7
  - share of damage through abilities: about 30 to 51 percent
  - all fights finish; median 83 s (84 s)
- Matchups still at or outside 35 to 65: Magpie beats Mimic 34 percent (52). With mixed coaches
  only: Hexer beats Mimic 71, Magpie beats Count 68, Armour beats Count 64, Count beats Wolf 36,
  ten quiet stretches over 6 s (worst 7.6 s). Magpie against Wolf is 44 (was 28), Hexer over
  Mimic 58 (was 67).

## What is unfinished, unverified or thin

- **Sound: the owner listened** on the `lab/sounds.html` page at about 05:15 and said "the sounds are
  good". Levels were set by meters before that; nothing was changed after.
- **Real models: six full matches and a direct pick and strike check, all six models, about $0.05**
  (total real spend $0.53 of $1.50). Every match ran from the call to the winner with plans every
  three seconds; every model returned a full, valid stage strike order. Found and fixed: the coach
  prompt still described four robot-era styles (now all six, 269 words); every match was The Count
  against The Wolf or close to it, so the pick now shows names in a shuffled order and is told
  which fighters viewers have just seen (`recentPicks` from the channel): asked right after two
  Count against Wolf matches, the six models picked The Hexer twice, The Mimic twice, The Magpie
  and The Empty Armour. Not done: a real-model match on the final prompts watched end to end, and
  no check of how real models' plans affect the balance numbers (those are from scripted coaches).
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

2. A longer real-model trial on the final prompts (budget left: about $0.97).
3. Magpie against Wolf and Hexer against Mimic.
4. A critic pass on the ink version against real footage of the genre, piece by piece.
5. Per-stage platform layouts (the sim needs the arena in the fight header).
