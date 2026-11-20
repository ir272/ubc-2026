# Brief: kart as a knockout race (spare game, lowest priority of the five)

Read `games/COMMON.md` first. Dev port 5205. This is a seeded game, no models.

The game exists in `~/kart-game` (its own repo; commit there per round). Read its `README.md` and
`cook/REPORT.md`. It looks good and is dull to watch. Tonight's only goal is to make it worth
watching and betting on. It ships only if it clearly passes; otherwise it stays out of the demo.

User's words: "the kart viewing experience right now is the worst by far, its extremely boring."

## Why it is boring, and the fix

A ten-kart, three-lap race has two minutes where little is at stake and the camera has no story.
A knockout puts something at stake every lap and tells the camera where to look.

- **8 karts,** from the existing cast, each with a permanent name, look, stats and a record.
- **Four short laps, about 25 to 30 s each.** Shorten the lap by using part of the existing track
  or a cut-through; do not build a new track.
- **The last two across the line are out at the end of laps one, two and three.** 8, then 6, then
  4, then the last lap is two karts head to head for the win.
- A kart that is out pulls off with a visible moment, not a silent disappearance.
- Items stay, tuned so the fight at the back keeps changing without making the result random.
- A whole race runs about two minutes. One betting window before the start, "Who wins?" with 8
  outcomes, seeded, and its seed runs the race.

`simulate({ seed, entrants, options })` and `SIM_HASH` as in COMMON.md. The existing sim is already
pure and seeded.

## Watching it

- The director camera lives on the battle for the last safe place, cuts to the leader briefly, and
  is on the line for every elimination. The final lap stays tight on the two karts.
- `cameras = ['Director', 'Leader', 'Danger zone', 'My pick']`, `setCamera`, and `highlight` with a
  marker over the viewer's pick.
- Stage HUD: a running order with a clear line above the two in danger, laps, and a flash when a
  kart goes out. Nothing else.

## Bar

On top of the shared bar in COMMON.md:
- **Not boring:** five fresh critics each watch a full race and mark any stretch of 10 seconds
  where nothing was at stake. Pass: no more than one such stretch per race on average.
- **Comprehension:** from a 30 second clip a critic can say who is about to go out and who leads.
- **Drama:** on average at least three changes in who holds the last safe place per lap.
- **Determinism, completion over 200 seeds, balance** (no kart wins more than 25% or fewer than 4%).
- **Look:** not worse than today.

Platform adapter in `ubc-2026/games/kart/`: `index.ts`, `channel.ts`, the sim bundle, the harness,
README and REPORT, as COMMON.md describes.

Order of work: knockout rules and checks, then the director and HUD with the critic tests, then
the adapter.
