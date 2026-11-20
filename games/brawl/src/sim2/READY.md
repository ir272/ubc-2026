# src/sim2: interim swap ready

Interim written about 10:30 CST; updated 10:50 CST with the final round-2 build (same file list, same stage notes; Tick damage x1.27, Gantry x0.94, Vise x1.05 trims, Kiln weight 112, Tick 84, Vise 106). Consistent point: `node --test test/sim2.test.mjs` 15/15 pass,
`node tools/batch.mjs --sim src/sim2` ran clean (6336 fights, 400/400 pace fights finish, determinism and
JSON round trip hold). Round 2 stopped here (usage limit); see NOTES.md "Where round 2 stopped".

## Copy

Copy these over src/sim (types.ts is unchanged and identical, copying it is harmless):

```
src/sim2/arena.ts       -> src/sim/arena.ts        (unchanged, copy anyway)
src/sim2/math.ts        -> src/sim/math.ts         (unchanged, copy anyway)
src/sim2/types.ts       -> src/sim/types.ts        (unchanged)
src/sim2/fighters.ts    -> src/sim/fighters.ts
src/sim2/engine.ts      -> src/sim/engine.ts
src/sim2/controller.ts  -> src/sim/controller.ts
src/sim2/coach.ts       -> src/sim/coach.ts
src/sim2/index.ts       -> src/sim/index.ts
src/sim2/NOTES.md       -> src/sim/NOTES.md
```
(`cp src/sim2/*.ts src/sim2/NOTES.md src/sim/`). Do not copy READY.md. Exported API and FightState shape unchanged.
`SIM_VERSION` is now `ringout-sim-2` (script.ts builds the default sim hash name from it). Removed export:
`inferStance` (nothing outside src/sim used it); new exports `stanceFeatures`, `inferFromFeatures`, `STANCE_MODEL`, `STANCE_FEATURES`.
test/sim.test.mjs passes against the new code too (it is the same suite test/sim2.test.mjs starts from).

## What the stage must know

- New projectile kind `slag` (owner Kiln, move `special` Blast Furnace, spawned on frame 26, radius 0.42, speed 0.17 m/tick,
  flat, life 40 ticks). It is the only new event or kind. The renderer's generic bolt fallback will draw it; a glowing
  molten glob would fit the move's look (the `look` text was updated).
- Launch: speed `kb * 0.0052` m/tick decaying by `0.0204` m/tick per tick (was 0.0025 and 0.0051).
  `src/stage/camera.ts` hard-codes `DECAY = 0.0051` for its look-ahead: it should become 0.0204.
- Hit pause (`hitlag` on hit events and on both fighters): light 5 to 6, medium 6 to 10, heavy 11 to 14, lethal 18,
  the early hits of a multi-hit move 3. On a perfect shield (parry, now within 5 ticks of raising the shield) the attacker
  freezes 8 ticks longer than the defender. Shield hits unchanged (`floor(d*0.45 + 4)`).
- A grab out of a run is preceded by a 4-tick `skid` (action `skid`, then `attack` with move `grab`).
- Grounded bodies never overlap; a walk faces the opponent (backing off is a walk backwards, only a run turns the back).
- Jump arcs: quicker rise, short hang, fast fall, sharper stops (per-fighter numbers in fighters.ts BODIES).
- Select-screen bars move (they are computed from the numbers): Kiln reach 3 -> 5 (its shot), weight 5 -> 4;
  Tick power 1 -> 2, weight 1 -> 2; Vise weight 4 -> 3. Gantry unchanged (recheck after the final trims).
- Damage is about 12% higher everywhere (fights had grown long); stale moves now lower a repeated move's damage, so the
  percent jumps vary more.

## Batch summary (src/sim2, final round-2 build, 10:50 CST)

```
ADAPTIVE vs rush 53% (NOT MET), keepaway 70%, bait 67%, wall 94%; stance mix rush 46 bait 44 wall 9 keepaway 1 (none over half)
FIXED STANCES (row vs column): rush 61/48/59 vs keepaway/bait/wall; keepaway 52 vs wall; bait 52/67/61; wall 41/48/39
  NOT MET: bait beats all three (its edge over rush is 52%)
IDENTICAL COACHES (408 each): adaptive 55 (edge of the bar), rush 50, keepaway 48, bait 49, wall 48, random 51
FIGHTERS (adaptive both sides): Kiln 56, Tick 50, Gantry 45, Vise 48; every matchup 41 to 59: met
READING THE FIGHT: rush 84%, keepaway 84%, bait 82%, wall 80%: met
PACE (400 mixed): 400/400; length median 103 s (p10 64, p90 162); first KO median 44 s; stretches over 6 s 0/400 (worst 6.0 s);
  self-destructs 0.5% of KOs; KO damage median 138%: met
DETERMINISM: same hash every tick, JSON round trip identical: met. Sim time median 8 ms.
Tests: node --test test/sim2.test.mjs 15/15.
```
