# Brief: the platform fighter (working title in this brief only: "Brawl")

Read `games/COMMON.md` first. Dev port 5202. This is a model game. It is built from scratch today.

Target: a platform fighter in three.js that is watched, not played, and that holds up next to
Super Smash Bros. Ultimate for how it plays, reads and feels. Damage is a percentage that makes you
fly further, and you lose a life by being knocked out of the arena. Two AI models are the fighters'
minds. Viewers bet on the winner. Stack: Vite + three.js (3D fighters on a 2D plane, side-on
camera), a pure deterministic fight simulation with a fixed timestep, node for the match script.

User's words: "I want to run a gauntlet loop on Super Smash Bros. Ultimate. The thing that would be
different is the characters... We're going to have our own characters, but that doesn't mean that
we can't mimic the overall style and gameplay of the game... it will need to match the same quality
and game experience." "We want this to be played by AI... it's obviously meant for humans to play
in the original game. I hope that there's some way we can do it really well."

## The bar

Real footage of Super Smash Bros. Ultimate: official trailers and high-level match video. Get it
first and compare against it directly. Local only, never committed or published.

What we take: the genre's rules and the quality of the experience. Damage percent, knockback that
grows with damage, lives, ledges and recovery, shields, grabs, dodges, platforms, a camera that
frames both fighters and zooms with the distance between them, hit pause, the blast when a life is
lost, a character select and a versus screen, a clear damage display.

What we never take: any character, stage, item, logo, UI artwork, sound or music from it. Our
fighters, arena, UI and sound are our own designs. Fighters are robots.

Judge it in pieces, each compared blind against the footage by a harsh fresh-context critic:
movement and physics feel, hit feel, the camera, the arena, fighter appeal and silhouette, the
damage and lives display, the knockout moment, the select and versus screens, sound.

## How AI plays a game made for thumbs

A model answers in seconds. A fighting game is decided in sixtieths of a second. So the fight is
split into two layers, and it never stops to wait for a model.

- **Hands:** each fighter is driven by a built-in controller that plays at frame level: spacing,
  combos, shielding, recovery, edge play. Both sides get exactly the same controller skill.
- **Mind:** each model is its fighter's corner and brain. On a fixed clock (about every 3 seconds)
  both models are sent the same kind of snapshot at the same tick: positions, damage, lives, who
  has the ledge, what the opponent has been doing, what worked and what did not. Each returns a
  **game plan**: a stance (for example rush, keep away, bait and punish, wall), a few dials
  (aggression, preferred range, grab or strike, go deep off stage or hold the ledge, recover high
  or low), an optional one-time order (use the special now, go for the kill), and a read of 8 words
  or fewer that viewers see.
- Answers take effect at the next tick. A late or broken answer means the old plan stays. So a
  slow model does not fight slower, it fights on staler orders.
- **Between lives** the knockout replay gives each model a longer think to change its whole
  approach. Its one-line adjustment is shown as corner talk.
- **Before the match** each model picks one of four fighters without seeing the other's pick.

Plans must decide fights. Stances counter each other, fighter types shift the matchup, and damage
and position change what the right call is. A model that reads its opponent and adapts must beat
one that does not. This is the first thing to prove, on mock coaches, before any polish.

## The show

1. **The call (about 10 s).** Match number, the two models, their records.
2. **The choosing (about 40 s).** A real select screen. Four robot fighters of our own design
   that play differently (for example heavy hitter, fast and light, long reach, grappler), with
   stats that visibly matter. Both picks flip together. A versus screen. A taunt of 10 words or
   fewer from each model.
3. **Predictions (about 30 s).** Window A, opened once the picks are public: "Who wins?" with 2
   outcomes. The stage shows the fighters waiting and the time left.
4. **The fight.** Two lives each, a three minute limit, then sudden death where every hit sends
   further. One arena: a main platform, two or three small platforms, ledges, blast zones.
5. **After each lost life:** the knockout replay and corner talk, with a 15 second window, "Who wins?"
6. **The verdict (about 20 s).** Winner, the best knockout again, a beat for the payout, then the
   countdown to the next call.

Target length: about 5 minutes.

## Watching it

- Each model's current plan sits by its name: a stance mark and its latest read. When a plan
  changes, viewers see it change, and then see the fighter behave differently.
- Every hit must feel like a hit: hit pause, shake, a trail, a sound, the percent jumping. A lost
  life is the biggest moment on screen.
- Stage HUD: both names with model and fighter, damage percent, lives, the clock. No text log.
- `highlight(entrantId)` rings the viewer's pick.
- `options.handicap` gives the favourite starting damage. The platform sets it from ratings.

Feed events (final names are yours, document them): call, picks, taunt, fight_start, plan, state
(compact snapshots or inputs the stage can replay the fight from, joinable mid-fight), hit,
life_lost, corner_talk, replay, match_end.

## Bar in numbers

On top of the shared bar in COMMON.md and the blind picks above:
- **Minds matter:** with mock coaches, an adaptive coach beats every fixed-plan coach at least 60%
  of the time, no fixed plan beats all the others, and two identical coaches split 45 to 55.
- **No dominant fighter:** no fighter type wins more than 60% against the field.
- **Real models vary:** over 20 real-model matches no stance is more than half of all plans, and
  plans change at least every 10 seconds on average.
- **Completion and determinism:** 200 mock matches finish; the same plans at the same ticks give
  the same fight, node and browser.
- **Pace:** the fight never pauses for a model. No stretch over 6 seconds without an exchange.

Order of work: the fight simulation, controller and mock coaches until minds matter; then
movement feel, hit feel and camera against the footage; then the show phases and the adapter (a
full match must play through the harness well before the 16:00 checkpoint); then fighters, arena,
screens and sound; then real models.
