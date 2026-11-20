# Brief: The Scrivener as a full show (the 1v1 arena)

Read `games/COMMON.md` first. Dev port 5200. This is a model game.

The game has been copied into this folder, `ubc-2026/games/scrivener/`, from `~/dark-souls`
(without its git history, dependencies or old captures; run `npm install`). Work here, not in the
old repo. Read `README.md`.
Two models take turns fighting the same boss in a haunted library. The fight itself is good and
stays. Today it becomes a show with clearly separate phases, the models choose a loadout before
they fight, any OpenRouter model can enter, and it gets a platform adapter in this same folder.

User's words: "the current version is solid, but we want to make it so that with all these games,
there's a clear distinction between when the round is starting, the prediction phase, the actual
battle, and the end... so that it actually feels like a real 24/7 live stream, and not just a
random game on the screen." "The bots playing are going to be selecting from a certain class.
They might have magic, spells, weapons, perks, accessories... these might help them in the battle.
The goal is to add more variation, and make it a better live stream, a better game to bet on."
"If there's no way to make an educated prediction, then that might steer people off."
On the decision moment: "this freeze panel where it has the 'tell' and the agent responds is poor.
the actual fighting scene is great." "this format kind of reminds me of those pokemon games where
you get asked to make a move... i like this and how its like a story."
On choosing: "dont reductionize it down to 'two skills', 'weapon' etc. be more creative! in real
games the experience of 'choosing your character' is super memorable."

## References (bar for quality, never for content)

- **Pokemon battles:** the move menu, the pause while a choice is made, the plain call of what
  happened.
- **Fighting-game presentation (Street Fighter 6, Super Smash Bros. Ultimate):** character select,
  the versus screen, round calls, the result screen. This is the model for phase changes.
- **Hades:** choosing between a few offered boons, each with a clear, readable effect.
- **Boxing broadcasts:** the tale of the tape before the bell.

Keep everything already ours: the ink-engraving look, the library, the boss, the swordsman.

## The show, in five phases that cannot be mistaken for each other

Each phase has its own title call, camera, sound and layout. A viewer who joins at any second can
tell which phase it is.

1. **The call (about 10 s).** Match number, the two contenders by name and model, their records.
2. **The choosing (60 to 75 s).** Each model builds its fighter from random offers:
   - a **class** from three offered out of about six (for example duelist, warden, hexer, thief,
     archivist, berserker). A class changes the body and silhouette, the base stats and the move list.
   - a **weapon**, a **spell** and a **charm**, each from three offered. Each has one clear effect
     that shows up in the fight, in how it looks and in the numbers.
   - The model gives a reason of 12 words or fewer with each pick, and viewers see it.
   - The boss also rolls one **temper** for the match (for example enraged, armoured, weak to
     fire, slow to turn), shown before the picks so models and bettors can read the matchup.
   Make this as memorable as a character select screen. Offers are drawn before any bet opens.
3. **The tape and the bell (30 to 40 s).** Both loadouts side by side with records, record with
   this class, and the boss's temper. Window A is open: "Who beats the Scrivener?" with 2
   outcomes. Betting opens only now, after the picks are public, so a bettor can reason about the
   matchup. The stage shows plainly that predictions are open and when they close.
4. **The fight.** Alternating attempts as today, three attempts each at most.
   - Before each attempt, a 12 second window: "How far does <name> get?" with four outcomes
     (under 25% of the boss's health, 25 to 50, 50 to 75, 75 or a kill).
   - After each pair of attempts, a 15 second window: "Who beats the Scrivener?"
   - The first to kill the boss wins once both have had the same number of attempts. If both kill
     in the same pair, the kill with more health left wins. If nobody kills in three attempts
     each, the best single attempt by damage wins.
   - **The decision moment, rebuilt:** stay on the fight, never cut to a panel. The boss's tell
     plays, time slows, a move menu of four options from the loadout appears beside the fighter
     with a thinking clock, the choice is stamped, time resumes and one short line calls what
     happened. Clock target 6 seconds, hard limit 10, then a default move.
   - After a death the model's note to itself is shown for a few seconds.
5. **The verdict (about 20 s).** The winner, a replay of the deciding moment, a beat for the
   payout, one line from each model, then the countdown to the next call.

A whole match runs 6 to 8 minutes.

## Models and bots

- Remove the fixed slots (`constants.js:13-18`) and the allowlists (`server.mjs:29`,
  `lib/brain_proxy.js:13`). Contenders come from `bots.json` as COMMON.md describes.
- `options.handicap` reduces the favourite's starting health. The platform sets it from ratings.
- The channel sends in `announce`: each bot's record, record by class, and head to head. This is
  the form a bettor reads.

## Bar

On top of the shared bar in COMMON.md:
- **Phases read instantly:** shown five random 8 second clips, a fresh critic names the phase in
  at least four.
- **The matchup can be read:** over 400 mock matches no class wins under 40% or over 60% overall,
  and each boss temper moves at least one class's results by 10 points or more. A fresh critic
  shown only the tape picks the eventual winner in 55 to 70% of matches.
- **Loadouts are visible:** from a still of the fight a critic can tell the two classes apart and
  name at least one item in use.
- **Decision moment:** a fresh critic can say what the choice was and what it led to, in 4 of 5 clips.
- **Completion:** 200 mock matches finish under the rules above with no stall.
- **Look:** not worse than today. At least 50% blind-pick wins against today's build.

## Platform adapter, in this folder

`index.ts` (mount, onFeed, highlight, destroy), `channel.ts`, the harness, README and REPORT, as
COMMON.md describes. `highlight(entrantId)` marks the viewer's contender on the stage and the tape.

Order of work: show phases and the adapter on mock brains first (so a full match plays early),
then the choosing and loadouts with their balance checks, then the decision moment, then real models.
