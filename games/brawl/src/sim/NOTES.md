# Ringout sim notes (round 2: src/sim2)

Round 2 copy of the fight simulation. API, `types.ts` and FightState shape are unchanged; everything is
pure, deterministic and free of trig, pow, exp and log. `SIM_VERSION` is `ringout-sim-2`.
Measure with `node tools/batch.mjs --sim src/sim2`, `node tools/exploit.mjs --sim src/sim2`,
`node --test test/sim2.test.mjs`. Both tools run their slices inside the shared machine lock.

NUMBERS: see the bottom of this file (filled from the last full runs).

## What changed in the mechanics (engine.ts, fighters.ts)

- Bodies: grounded fighters are kept half the sum of their widths apart every tick, and a run or lunge into the
  other body stops at it (order is kept from the previous tick; crossing is a jump over or a roll).
- Facing: a walk faces the opponent (backing off is a walk backwards); standing still turns to face it. Only a run
  (a committed dash) turns the back.
- Jumps: quicker rise, short hang, faster fall, sharp stops (gravity, jump, short hop, fall, fast fall and traction raised
  per fighter: Tick snappiest, Kiln heaviest). The hands fast-fall over the deck.
- Launch: speed `kb * 0.005` m/tick, shrinking by `0.0204` m/tick each tick (was 0.0025 and 0.0051): twice the start
  speed with four times the decay covers the same distance (v^2/2a) in half the time, so hard hits cross the frame in
  the first few ticks and then slow.
- Hit pause (`hitlagFor`): light (kb < 45) 5 to 6, medium 6 to 10, heavy 11 to 14, lethal 18; the early hits of a
  multi-hit move 3, so strings flow. Both fighters freeze the same count. A parry (perfect shield, 5 ticks) freezes the
  attacker 8 ticks longer.
- Grabs: standing grabs 2 frames slower, whiffs longer (recovery 30 to 36). A grab out of a run first skids 4 ticks
  (the dash grab is the slow one). Grabs remain the answer to shields.
- Shield: the bubble shrinks less with damage and any overlap blocks (shield pokes were eating a third of all blocks).
- Stale moves (the genre's own rule): a move that lands again within the last 9 landed moves deals less (8% for the
  newest repeat down to 2%), a fresh one 5% more. Discourages one-move spam, rewards variety.
- Getting hit restores the up special and air dodge but not a spent double jump, so edge-guard hits matter.
- A lethal launch can no longer be interrupted by a second hit (a projectile used to save a doomed fighter).
- Kiln's Blast Furnace now also throws a glob of slag across the deck (projectile kind `slag`). With Gantry's rivet,
  two of the four robots can play keep-away; Tick and Vise keep away with lunges and pay for it.

## The hands (controller.ts)

Same code both sides, 10 to 14 tick reaction delay, prediction from the delayed view (now extrapolated up to 26 ticks
so a running approach is seen where it is heading).

- Reads on an approach: the approach is telegraphed for much longer than the reaction time, so once per approach the
  hands choose, from the stance and what they have seen (a decaying count of the opponent's grabs), a poke placed
  where it will be, a spot dodge as a grabber reaches grab range, a hop back with a retreating aerial, a dash back out
  of range (then back in on the whiff), running away, a shield, or meeting it head on.
- Whiffs seen coming: a grounded commit that cannot reach where the fighter stands is punished from its start,
  not a reaction time after it ends.
- A grab seen coming is never shielded. The grab dial is decisive everywhere a grab can be chosen.
- Out of shield: the punish option is chosen for where the attacker will be after the pushback.
- Follow-ups are hands skill: every stance converts a hit while the opponent has not reset; a rush or a wall keeps
  pressing for up to 45 ticks after.
- Stances are separate games in neutral (see `rushNeutral`, `baitNeutral`, `keepNeutral`, `wallNeutral`):
  rush closes and commits (feinting more when patient), bait hovers at the edge of the threat range dash dancing and
  guards by what it has seen when caught inside, keepaway keeps the gap, shoots, runs, hits and runs with its lunge,
  wall holds the middle and shields. Long lulls are broken by each stance in its own way, then by everyone.
- `order: kill` makes the hands hunt (more aggression, smash and kill-throw preference, charged smash reads, going
  deep after a recovering opponent at high damage). `order: special` as before.
- Recovery: earlier jumps and up specials with the new gravity; aerials past the ledge are not started when they
  would end below where the ledge can be caught (self-destructs dropped from 4% to under 1%).
- Edge-guarding `deep`: to the edge, then off it to meet where the recovery is heading (drop onto a low one).

## Coach view (index.ts)

`oppLooksLike` is a per-stance Gaussian over behaviour features of the last two coach windows (habit rates, gap kept,
time in shield, distance from the middle, speed toward me, time attacking and airborne, dash turns, time standing,
dashes in and out, swings that start first and the share that start into an opening). The model is fitted offline
(constants in `STANCE_MODEL`, refit after any controller change) and evaluated by `batch --only views`.

## Numbers (final round-2 build, `node tools/batch.mjs --sim src/sim2`, 6336 fights)

- Adaptive vs fixed: rush 53% (not met), keepaway 70, bait 67, wall 94. Stance mix rush 46, bait 44, wall 9, keepaway 1;
  4.2 stance changes a fight.
- Fixed stances (row vs column): rush 61/48/59 vs keepaway/bait/wall, keepaway 52 vs wall, bait 52/67/61. Bait beats all
  three (not met; its edge over rush is only 52%).
- Identical coaches (408 each): adaptive 55 (at the edge), rush 50, keepaway 48, bait 49, wall 48, random 51.
- Fighters, adaptive both sides: Kiln 56, Tick 50, Gantry 45, Vise 48; every matchup 41 to 59. Met.
- Reading the fight: rush 84%, keepaway 84%, bait 82%, wall 80%. Met.
- Pace: 400/400, median 103 s (p10 64, p90 162), first KO 44 s, stretches over 6 s 0/400, self-destructs 0.5%. Met.
- Dials: aggression at 110% and the kill order at high opponent damage barely move the lost-life time (not met);
  the kill order early costs about 4 points of damage (met); deep vs low kills 11% of real recoveries, deep vs high
  hurts the chaser 5% (the edge game is still weak).
- Move usage: everything between 1 and 30% except Tick and Vise forward throw (0.9 to 1.0%), Gantry upsmash 0.9 and
  Gantry special2 (Ballast Swing) 0.5%.
- Exploit search (last full run, a few changes before this build, `node tools/exploit.mjs --sim src/sim2 --steps 5
  --sample 80`): best plan against the field 62% (rush, aggression 0.8, far, grabs 0.4, stage, high: bar is under 62,
  so just not met); every plan found had a counter at 61% or more (met); chain rush -> rush -> bait -> wall -> rush (met).
- Determinism and JSON round trip hold; median 8 ms per fight.

## Where round 2 stopped

Stopped at the usage limit. The build is consistent (tests 15/15, 400/400 finish, determinism holds).

**Adaptive vs rush (53%, bar 60).** Tried: reading grabbiness from `oppHabits.grabs` and answering a strike rush with a
strike-minded bait (aggression 0.5, mid, grabs 0.1) or a wall, a grab-minded one with bait or a strike rush, and swapping
the answer when `since` shows it losing. Worked: that bait plan beats the fixed rush 63% in isolation (192 fights,
`vsone` in the scratch tools); the read itself is right 84% of the time. Did not: the adaptive loses the first 6 to 9 s
before its first read and its edge/recover choices are generic, so 63 becomes 53. Next: (1) a better opening plan
(bait 0.5 mid 0.1 is now the default; also pick the recover dial against stage guards: mix or low), (2) make the
adaptive commit to the bait answer longer instead of swapping on short losing stretches, (3) give bait a stronger
grab read (spot dodge timed on the predicted grab, the `dodge` read) so bait answers a mixed rush too.

**Fixed-stance table (bait beats all three).** Bait now edges rush 52% and beats keepaway 67, wall 61. The intended cycle
is rush > keepaway > {bait, wall} > rush. Keep-away is weak for Tick and Vise (no shot; they keep away with lunges),
which drags the keepaway row down. Next: give keep-away a real tool for Tick and Vise (a shot on special2, or safer
retreating aerials), or accept per-fighter strengths and say so to the coaches.

**Kiln and Tick within 45 to 57.** Met in this build (56 and 50) after per-fighter trims in `fighters.ts` (`TRIM`:
Tick damage x1.27, Gantry x0.94, Vise x1.05; Kiln weight 112, Tick 84, Vise 106; Kiln's slag shot 5 damage). Tick's trim
is touchy: its hits are small integers, so 1.2 vs 1.3 flips many 2s to 3s and swung Tick from 31% to 61%.

**Stretches over 6 s.** Met (0/400, worst 6.0 s) after: shield standoffs no longer persist (a shield is kept only against
an opponent that is pressing), restless reads favour the shield over speculative pokes, long lulls make bait stop dancing
and keep-away stop retreating, then everyone walks in behind a shield and takes the grab or the jab. The margin is thin
(worst 6.0 s): an offstage recovery or a whiff-fest can still push past. Next: count a recovery or an edge-guard as
action in the pacing rule if the lead agrees, or shorten the 285-tick hard rule.

**Exploit bars.** (b) and (c) met; (a) 62% against a 62 bar. What made the difference: slower and longer-whiffing grabs,
the dash-grab skid, the grab dial being decisive everywhere (strike plans almost never grab), out-of-shield options
chosen for where the attacker will be after pushback, the parry, bait's anticipation of whiffs, follow-ups for every
stance until the opponent resets, and Kiln's shot (keep-away needs a projectile). The plan that dominates is a mixed rush
(grabs 0.4) with edge stage and recover high: mixing strikes and grabs defeats any single guard. Its counters are a
strike rush (61%) and an aggressive keep-away with a shot. Next: (1) make `recover: high` punishable by `edge: stage`
(land punish) so stage/high is not the free dial combination; (2) give bait the timed spot dodge on the predicted grab so
it answers the mix; (3) rerun the exploit with `--sample 140 --final 192` for a firmer number.

**Dials.** The edge game is still weak: deep vs low kills 11% of real recoveries (bar: most). The deep guard now steps
off the ledge onto a low recovery and a high recovery hits a guard below it, but intercepts land rarely because
recoveries are fast and up specials armoured (Kiln) or hit (Vise). Next: aim the guard's aerial at the up special's
predicted path, give low recoveries a longer predictable ledge approach, and let `ledge` (hog) force low recoveries
into the deck side. Aggression at high own damage and the kill order at high opponent damage barely move the life
length because a fighter at 110% dies within about 20 s whatever the dials.
