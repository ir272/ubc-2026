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

## Round 3: abilities (`SIM_VERSION` `ringout-sim-3`)

The owner: "all they do is melee + shield". Every fighter now has tools that are visibly not a punch, built as small
data-driven engine features (`MoveDef.projectile` options and `MoveDef.blink`, all optional) and reached for by every
stance in `controller.ts` (`abilities()`, behind a cooldown). Move names are neutral; the candidate flavours are in `look`.

Mechanics (engine.ts), with the counterplay:
- **Floor wave** (Kiln `special`, projectile `wave`, low at 0.45 m, 0.2 m/tick, 10 m, 22-frame wind-up, 11 damage, real knockback).
  Counter: it is slow and seen coming: jump it (a full hop clears it) or shield it (shield blocks every shot).
- **Fan** (Tick `special`, `fan` of three `knife` shots, level, rising, dipping, 8 m). Only one shot of a volley can land; the
  others are spent (`Projectile.cd = 1`). Weak (about 3) and fast: pestering. Counter: shield, or close in under the cooldown.
- **Blink** (Tick `special2`, `blink`): untouchable on frames 1 to 9, reappears on frame 6 3.2 m ahead or just behind an opponent
  within 4.5 m (turned to face it), quick slash on frames 8 to 11, acts again at frame 24. Clamped: on the ground it stays on its
  platform, in the air it never ends further out than it started (no blink into a fall). Counter: the arrival slash is shieldable from
  any side, and a whiffed blink-slash (blinked forward with nobody there) is open for 14 frames. The hands also blink through a swing
  they see coming and out of a corner.
- **Floor ward** (Gantry `special2`, lobbed `ward`, comes to rest about 5.3 m ahead and lies there 5 s, 1.5 m wide). Snare: the first
  opponent that stands in it on the ground is rooted 42 ticks (0.7 s, `FighterState.rooted`, a grounded hitstun with no knockback) and
  takes 4; then it is spent. One per owner (a new one replaces the old; the hands re-place only after 2 s). Counter: the hands see it
  after the reaction delay and hop over it when running or stop short when walking; a shield blocks it (spent on the shield); it does
  nothing while flying. `effect` absent with `linger` set makes it a **burn** hazard instead (a hit every `every` ticks while stood in):
  built and supported, not used by the current data (switch for the lamplighter).
- **Tether** (Vise `special`, `chain` with `effect: 'pull'` and `tether: true`, about 5.6 m): on an unshielded catch it drags the target
  in at 0.42 m/tick (`pulled`, the tip rides on the target with `drag: true`), holds it in front, then the existing command slam (the old
  Lunge Clamp's `cmd`). Counter: shield blocks it and the thrower is locked until 18 ticks after its move ends; dodging through it lets
  it whiff (the move has 30 frames of recovery); hitting the thrower cuts the line and frees the catch; armour does not stop it.
- Shared rules: projectile hits read the move that fired them (`Projectile.move`, `hit.via`), so stale moves and damage are per move;
  a hit (or a grab) clears `rooted` and a drag; the lobbed shot uses `gravity` (projectiles now honour it); a shot touching a floor with
  `linger` becomes a hazard; `place` spawns a hazard straight onto the floor ahead (supported, unused). Shield blocks all of it.
  The coach habit counter counts a tether as a grab and every other projectile move as a shot.
- Gantry's bolt is faster and longer (0.36 m/tick, 14 m, 12-frame startup, 5 damage). Ballast Swing, Blast Furnace's fire cone,
  Overclock Dart, Spring Hop and Lunge Clamp's lunge are gone (their slots now hold the new tools). Kiln's armoured `special2` and
  Vise's spin `special2` are kept and are now also used up close (`abilities()`).

Numbers (final build; `node tools/batch.mjs --sim src/sim2 --only fighters,pace,mirror` and `node tools/simstats.mjs --n 768`,
with `--coaches adaptive,adaptive` for the adaptive column):

| measure | adaptive vs adaptive | mixed coaches | bar |
|---|---|---|---|
| fights finished | 768/768; batch pace 400/400 | 768/768 | 99% |
| median length | 97 s (batch pace 104 s, p10 72, p90 151) | 99 s | 70 to 130 |
| stretches over 6 s | 1 of 768 (6.1 s); batch pace 0/400 (worst 5.9) | 2 of 768 (worst 7.9) | about none |
| win rate kiln / tick / gantry / vise | simstats 53 / 45 / 52 / 50; batch FIGHTERS 54 / 55 / **41** / 51 | 44 / **64** / **33** / 58 | 42 to 58 |
| mirrors (side 0) | 51% (batch: every coach 49 to 53) | 48% | near 50 |
| seconds between specials k / t / g / v | **7.7 / 7.5 / 8.1 / 6.7** | 5.1 / 5.1 / 5.6 / 5.3 | <= 6 |
| damage through special + special2 | **20%** | 27% | >= 25% |
| top single move share | 23.6% (Tick fair) | 29.4% (Kiln wave) | <= 30% |
| per fight: blinks, pulls, wards placed, snares | 3.4, 2.1, 1.7, 1.0 | 4.3, 3.3, 2.0, 1.0 | |

Trims (`TRIM`): Tick 1.27, Kiln 1, Gantry 0.94, Vise 1.05 (round 2's values; every other set tried moved one coach mix in or
out at the cost of the other). Determinism, JSON round trip and all 51 tests hold; median 7 ms per fight.

Not at target and what I would do next:
1. **Usage under adaptive coaches (7 to 8 s, bar 6) and the 25% damage share (20%).** The adaptive coach plays rush and bait almost
   always; rush fights inside the shot range and the ward's landing spot. Next: give rush a shot on the approach run (fire as it
   closes from 5 to 3 m), let Gantry lob the ward from closer (a shorter lob, or `place` at 2.5 m) and let bait blink-punish more.
2. **Gantry vs the field.** Within the bar on one seed set (52) and under it on the batch's (41; kiln-gantry 66, tick-gantry 69); 33 with
   mixed coaches. The trims are touchy here (Gantry 0.98 swung it to 65 under adaptive). Next: rather than a trim, make the snare pay
   off more reliably (the bolt follow-up already fires on a rooted target; a longer root, 50 ticks, or a slightly faster bolt), then
   recheck both columns with 1500+ fights.
3. **Tick with mixed coaches (64).** Keep-away Tick (knives plus blink escapes) is strong; adaptive Tick is fine (45 to 55). Next: a
   longer shot cooldown for Tick's fan in keep-away, or one less frame of blink invulnerability.
4. The stance model (`STANCE_MODEL`) was fitted on round-2 behaviour; with shots and tethers in every stance, refit it (`batch --only
   views`) before relying on `oppLooksLike`. The exploit search was not rerun.

## Round 3b: the Count and the Wolf

The owner chose a vampire and a werewolf for the two robot slots. Ids stay `gantry` and `vise`; only data, two engine options and the
hands changed. Tick and Kiln are untouched (the higher special rates below apply only to the two new fighters).

**The Count** (`gantry`, "Vampire lord"): tall, long reach; every normal renamed to a cloak or claw move with the same numbers.
- **Bat Swarm** (`special`): three `bat` shots on frames 15, 19 and 23 (`fan[].delay`), a tight rising, level and dipping spread,
  0.26 m/tick for 54 ticks (about 14 m), 3 damage, light knockback. At most two of a volley land (`projectile.fanHits: 2`); the rest are
  spent (`cd` 1) and fly on harmlessly. Counter: shield (each bat blocked counts toward the two), jump the level line, or close in
  under the cooldown.
- **Mist Step** (`special2`): the blink, slower than Tick's: startup 9, untouchable frames 1 to 12, reappears on frame 9 3.2 m ahead or
  just behind an opponent within 4.5 m, claw swipe on frames 11 to 14 (8 base damage). Counter: shield the arrival from any side; a
  whiffed swipe is open for 18 frames.
- **Bat Form** (`recover`): the old Grapple Line numbers with a new look.

**The Wolf** (`vise`, "Werewolf"): 1.9 m tall, 1.15 m wide, weight 100, walk 0.1, run 0.205; normals renamed to claws and bites.
- **Pounce** (`special`): the old Lunge Clamp travelling command grab with far more travel (about 4.7 m; startup 9, catch frames 10 to
  25, moving 0.26 m/tick on frames 7 to 24). A catch holds and slams (the command slam, 15 base damage). A shield does not stop it; a
  jump or a spot dodge does, and a miss skids into 34 frames of recovery. Opponents read it as a grab (spot dodge, hop or step away).
- **Howl** (`special2`): startup 14, a burst about 1.8 m round the wolf (frames 15 to 18) that staggers for 40 ticks instead of
  launching (`Hitbox.effect: 'snare'`): a `snare` event, `rooted` set, a `hit` with kb 0, 2 damage. A shield blocks it.
- **Wall Run** (`recover`): the old Clamp Climb numbers.

Engine (all optional): `Hitbox.effect` and `effectTicks` (a strike that roots like the snare); `fan[].delay` (a fan's shots spaced in
time; one volley per move in flight still holds); `projectile.fanHits` (how many shots of a fan may land, default 1); `Projectile.n`
(shots of the volley landed or blocked when it spawned). One fix found by the new tests: a fighter rooted in the air used to have its
root cut to 4 ticks on landing (the small-launch landing rule); a root now runs its full length (`if (f.hitstun > 4 && !f.rooted)`).
The Floor Ward, tether and pull mechanics stay in the engine, unused by the current cast.

Hands (`controller.ts`): two new move tags, `POUNCE` and `HOWL`. The pounce closes from 2 to about 6 m and punishes openings at mid
range (only a grounded opponent at the same height); the howl fires when the opponent is close and pressing, or right after the wolf
blocked something; it is kept out of the poke picker. The bats and Mist Step use round 3's shot and blink logic. For the two new
fighters only, the rates are about double round 3's: shots keep-away 0.07, rush 0.05 + (1 - aggression) x 0.03, wall 0.05, bait 0.07;
blink rush 0.07 + aggression x 0.05, bait 0.05, else 0.02, cooldown 90; pounce rush 0.08 + grab mix x 0.06, keep-away 0.06, wall 0.04,
bait 0.06, cooldown 60; howl 0.12 (rush) or 0.09 when pressing, else 0.04, cooldown 70.

Trims: the Count 0.93, the Wolf 1.04 (Tick 1.27, Kiln 1 unchanged). `tools/simstats.mjs` takes `--fighters gantry,vise`.

Numbers (`node tools/simstats.mjs --n 400 --fighters gantry,vise`, with `--coaches adaptive,adaptive` for the adaptive column;
mirrors included; the 1600-fight figure in brackets):

| measure | adaptive vs adaptive | mixed coaches | bar |
|---|---|---|---|
| Count beats Wolf | 53.0% (55.8%) | **39.5%** (**42.0%**) | 45 to 55 |
| mirrors (side 0 wins) | 53.0% | 49.0% | near 50 |
| fights finished | 400/400 | 400/400 | all |
| median length | 88 s (p10 65, p90 116) | 89 s (p10 63, p90 120) | 70 to 130 |
| quiet stretches over 6 s | 0 (worst 6.0 s) | 1 (worst 6.1 s) | about none |
| seconds between specials, Count / Wolf | **6.8 / 7.1** | 5.3 / 6.0 | <= 6 |
| damage through special + special2, Count / Wolf | **20.9% / 20.8%** | 27.3% / 26.7% | >= 25% |
| largest single move | Count fair 20.3% | Wolf Pounce 25.8% | <= 30% |
| per fight: blinks, snares (howls landed) | 4.7, 1.45 | 5.4, 1.0 | |

The full cast (`--n 768`): adaptive kiln 46 / tick 54 / Count 47 / Wolf 53 (tick beats the Count 65%); mixed kiln 37 / tick 58 /
Count 41 / Wolf **64**; 768/768 finish in both, 21% and 28% of damage through the specials.

Not at target and what I would do next:
1. **The two coach mixes pull apart by about 14 points on Count vs Wolf**, and no trim fixes both (0.92 to 0.95 against 1.04 to 1.08
   all keep the gap; I kept the set that puts adaptive, the show's default, inside the bar). Forced same-coach pairs: keep-away the
   Count wins 93%, rush 56, bait 52, random 50, wall 44. So the mixed column's low number comes from the cross pairs (different coaches
   on each side), which I did not break down. Next: a per-coach-pair table for Count vs Wolf, then fix the worst pairs (likely the
   Wolf has no answer to a keep-away Count, and something beats the Count badly in the cross pairs) before touching trims again.
2. **Usage under adaptive coaches (6.8 / 7.1 s, bar 6) and the damage share (21%, bar 25%).** Mixed coaches meet both. Same cause as
   round 3: the adaptive coach plays mostly rush and bait. Next: let rush fire bats on the approach and pounce more from rush.
3. **The Wolf vs the field with mixed coaches (64%).** The Pounce is strong against coaches that do not spot-dodge; check its catch
   window (16 frames) before raising anything else.

## Round 3c: abilities carry the fight (`SIM_VERSION` `ringout-sim-4`)

The owner, watching real fights: the characters "seem to be just fighting with melee attacks". The abilities fired but seasoned the
fight, and the bats were too small and fast to see. Changes (the Count and the Wolf only; Tick and Kiln untouched):

Data (`fighters.ts`):
- **Bat Swarm**: slow, big, present. 0.115 m/tick (about 2 s to cross the stage), 104 ticks (about 12 m), radius 0.45, spawned on
  frames 15, 23 and 31 so the three fly as a line, 4 damage each with a real stagger (angle 45, bkb 34, kbg 30). Still at most two of a
  line land.
- **Mist Step** swipe: 14 damage (was 8), launching (angle 40, bkb 48, kbg 104): it can take a life.
- **Pounce**: starts 2 frames sooner (startup 7, catch frames 8 to 23, same 4.7 m travel); slam 17 (was 15).
- **Howl**: 7 damage (was 2), staggers 48 ticks (was 40).
- Trims: the Count 0.93, the Wolf 1.10 (was 1.04).

Engine: a rooted body stands its ground (`separate()`: the other fighter takes the whole push), so a wolf pouncing on a howled
opponent no longer shoves it before the catch. No new field or event.

Hands (`controller.ts`, the Count and the Wolf only):
- **Urge**: the ability rates are multiplied by 1 up to 0.7 s since the fighter's last special, rising to x5 by 2.7 s. That keeps a
  special coming about every 3.5 s whatever the stance, including rush and bait, the adaptive coach's usual stances.
- Wider windows: bats from 1.8 m (was 2.6), against an opponent up to 1.8 m above; Mist Step from 0.9 m (goes behind); pounce from
  1.4 m (was 2.0); abilities are no longer switched off while the opponent is in the air.
- **Cover**: after casting bats, the Count walks in behind them and mist-steps through as they reach the opponent (rate 0.2 a tick
  once the lead bat is within 2.2 m of it). Opponents already answer an incoming shot by shielding or jumping toward the caster (the
  slow bats give them time to). Bat cooldown 40 to 70 ticks.
- **Howl into Pounce**: a staggered opponent on the floor is pounced on (rate 0.7), bypassing the howl's cooldown. After a landed howl
  the wolf's next move is now the pounce 57% of the time (was 2%). The howl also fires inside the punish game (bait's openings).
- Poke picker: jab and tilt -3 for these two; the pounce +4 (+12 on a staggered opponent); the wolf's plain grab -3.
- Cooldowns: pounce 45, howl 50, mist 70.

`tools/simstats.mjs` targets are now 4 s, 35% and 35%.

Numbers, Count vs Wolf (`node tools/simstats.mjs --n 1600 --fighters gantry,vise`, mirrors included; `--n 400` in brackets):

| measure | before, adaptive | after, adaptive | before, mixed | after, mixed | target |
|---|---|---|---|---|---|
| seconds between specials, Count / Wolf | 6.8 / 7.1 | 3.4 / 3.6 | 5.3 / 6.0 | 3.4 / 3.4 | 4 or less |
| damage through special + special2, Count / Wolf | 20.9% / 20.8% | 42.1% / 36.6% | 27.3% / 26.7% | 44.4% / 40.5% | 35% or more |
| largest single move | Count fair 20.3% | Count Mist Step 22.0% | Wolf Pounce 25.8% | Wolf Pounce 31.9% | 35% or less |
| Count beats Wolf | 53.0% | 52.0% (47.5%) | 39.5% | **39.3%** (39.0%) | 45 to 55 |
| mirrors (side 0) | 53.0% | 52.4% | 49.0% | 49.0% | near 50 |
| fights finished | 400/400 | 1600/1600 | 400/400 | 1600/1600 | all |
| median length | 88 s | 73 s (p10 52, p90 98) | 89 s | 73 s (p10 52, p90 100) | 70 to 130 |
| quiet stretches over 6 s | 0 | 1 of 1600 (6.1 s) | 1 | 2 of 1600 (6.7 s) | about none |
| per fight: blinks, howls landed | 4.7, 1.45 | 8.9, 3.0 | 5.4, 1.0 | 8.2, 2.6 | |

Not at target:
1. **Count vs Wolf with mixed coaches (39%)**: the same gap between coach mixes as round 3b (about 13 points; trims move both columns
   together). The adaptive column, the show's default, is inside the band. Next: a per-coach-pair table to find the pairs that sink
   the Count.
2. **Fights are shorter** (median 73 s, near the 70 s floor; p10 52 s): more specials means more damage. If the median drops below 70,
   take a little off the Mist Step swipe and the Howl before touching the rates.
3. Not measured: how often opponents jump, shield or take the bats (no event says so). The at-most-two test still holds.

## Round 4: six fighters (`SIM_VERSION` `ringout-sim-5`)

The owner picked four more fighters: the roster is six. The Count (`gantry`) and the Wolf (`vise`) are unchanged in data.
- **The Empty Armour** (`kiln`, "Haunted armour"): the old heavy's numbers, renamed. Grave Cleave (`special`) is the floor wave as
  projectile kind `flame` (11 damage, was 13). Collar Fire (`special2`, new): a fire cone from the collar, about 2.4 m, armoured on
  frames 6 to 28, two small licks (4) then one solid burst (9, knocks away); ordinary hitboxes. Fall Apart (`recover`) keeps the rise numbers.
- **The Magpie** (`tick`, "Thief"): the old sprinter, renamed. Feather Knives (`special`): the three-knife fan slowed to 0.11 m/tick for
  72 ticks (about 1.2 s across 8 m), radius 0.26, still one of three may land. Snatch (`special2`): Blink Step; the hands also snatch
  behind a shield. Updraft (`recover`): the aimed recovery.
- **The Hexer** (`hexer`, new, "Witch"): 2.15 m, 0.75 m wide, weight 88, slow feet (run 0.15), floaty. Normals derived from the Count's
  (one frame slower, 0.2 m longer). Hex Bolt (`special`): one `hex` shot, 0.15 m/tick for 90 ticks (about 13 m in 1.5 s), 8 damage.
  Ward (`special2`): the floor ward, kind `ward`, lobbed about 5.3 m, lies 300 ticks, 0.75 m half-width, roots 42 ticks, 4 damage, one at
  a time. Crow Flight (`recover`): the Count's ledge-tether recovery (no untouchable stretch).
- **The Mimic** (`mimic`, new, "Hungry chest"): 1.2 m tall, 1.3 m wide, weight 120, slow (run 0.165), short hops. Normals derived from the
  Wolf's (reach x0.85, height x0.63, damage x1.1). Tongue Lash (`special`): the tether pull, kind `tongue`, 0.42 m/tick for 12 ticks
  (about 5.5 m from the mouth), reel in, hold and command slam (10). Swallow and Spit (`special2`): a close command grab (catch frames
  9 to 12), holds 24 ticks, then spits forward hard (15). Coin Burst (`recover`): a rising recovery.

Engine: `FighterId` and `FIGHTER_IDS` take `hexer` and `mimic` (order kiln, tick, gantry, vise, hexer, mimic); `simulate()` picks
fighters by `FIGHTER_IDS.length`. Command grabs now work on `special2` as well as `special` (`doGrab`, the hold timer and the `throw`
event carry the move); a tether catch uses its own move's command throw. New data helper `derive()` builds a fighter's normals from
another's numbers; `NAMES` carries the cast's move names and looks.

Hands: round 3c's ability behaviour now applies to all six (the urge that brings a special about every 3 s, the wider windows,
follow-ups). Per fighter: the Armour sends the flame less often (x0.6) and runs in to meet whoever jumped it; the Magpie snatches
behind shields; the Hexer may lay the ward where a falling opponent will land; tethers and the swallow fire at the urge rate (the
swallow three times as often against a shield); light fighters (under 90) spot-dodge a coming tongue half the time. Jab and tilt
-3 in the poke picker for everyone. Recovery: the Hexer as the Count, the Mimic as the Wolf; a sideways `special2` recovery only for a
move that travels. Coach: the Hexer counts as a shooter and keeps mid range; the Mimic leans on grabs like the Wolf.

Trims: Armour 1.22, Magpie 1.32, Count 0.82, Wolf 1.0, Hexer 1.12, Mimic 1.0 (normals only; shots and command throws are set in the data).

Numbers (`node tools/simstats.mjs --n 1440`, every ordered pair, mirrors included; 80 fights a matchup, so about +-6 points of noise):

| measure | adaptive vs adaptive | mixed coaches | target |
|---|---|---|---|
| win rate Armour / Magpie / Count / Wolf / Hexer / Mimic | 58.3 / 45.5 / 48.3 / 44.8 / 47.5 / 55.8 | **64.5** / 46.0 / 42.0 / 53.0 / **36.0** / **58.5** | 42 to 58 |
| seconds between specials (same order) | 3.5 / 2.8 / 3.1 / 3.2 / 3.4 / 3.5 | 3.4 / 2.6 / 3.4 / 3.2 / 3.0 / 3.1 | 4.5 or less |
| damage through special + special2 | 50.6 / 31.2 / 47.3 / 42.6 / 37.6 / 47.3% | 50.5 / 33.6 / 48.7 / 43.8 / 43.7 / 49.5% | 30% or more |
| largest single move | Mimic Tongue 34.5% | **Hexer Bolt 38.5%**, Mimic Tongue 36.7%, Wolf Pounce 35.1% | 35% or less |
| fights finished, median length | 1440/1440, 84 s (p10 57, p90 118) | 1440/1440, 82 s (p10 55, p90 134) | all; 65 to 130 |
| stretches over 6 s | 1 (worst 6.3 s) | 5 (worst 6.5 s) | about none |
| mirrors (side 0) | 55.0% | 44.2% | near 50 |

Matchups, row beats column (adaptive; mixed in brackets). Outside 35 to 65 in bold:

| | Magpie | Count | Wolf | Hexer | Mimic |
|---|---|---|---|---|---|
| Armour | 60 (59) | 54 (**71**) | **69** (**69**) | 50 (**73**) | 59 (51) |
| Magpie | | 64 (61) | 36 (**30**) | **68** (**79**) | **20** (**19**) |
| Count | | | 56 (35) | 63 (61) | 40 (46) |
| Wolf | | | | 51 (63) | **34** (36) |
| Hexer | | | | | **69** (55) |

Not at target and what I would do next:
1. **The Magpie against the Mimic (20%)** and against the Wolf (36): the light thief is grabbed and thrown out early by the two
   grabbers. The tongue dodge for light fighters did not move it, so it is the swallow and plain grabs: give the Magpie a
   grab-read (spot dodge when a grabber walks into range) or more weight.
2. **The Armour over the Wolf (69) and the Hexer over the Mimic (69)**, the Magpie over the Hexer (68). Mixed coaches add the Armour over
   the Count and the Hexer (71, 73) and put the Armour at 64.5 and the Hexer at 36 overall.
3. With mixed coaches the Hexer's bolt (38.5%), the Mimic's tongue (36.7%) and the Wolf's pounce (35.1%) pass 35% of their damage;
   with adaptive coaches none does.
4. The Ward lands rarely (Hexer `special2` 5% of her damage): it roots, but the hands lay it mostly at feet that have moved on.

## Round 4b: balance (`SIM_VERSION` `ringout-sim-6`)

Numbers and hands only; no field, event or projectile kind changed.

The Magpie's losses to the Mimic were not the swallow but two habits: about 160 tongue catches in 30 fights came while the Magpie
was in the middle of its own move (mostly throwing knives inside tongue range), and about 185 plain grabs caught it out of its own
swings (the Snatch landing next to the chest, then a laggy follow-up). The back throw over the hinge then took the life (71 KOs in 80
fights). Fixes:
- Hands, every fighter: a tongue seen coming out is hopped (light fighters 85%, others 50%); a pounce seen starting is jumped (70% /
  30%); shots are thrown from outside a tongue's reach.
- Hands, light fighters (weight under 90: the Magpie, the Hexer) against a grabber (any fighter with a command grab: the Wolf, the
  Mimic): as it closes into grab range, snatch past it, spot dodge or hop back (16% a tick, then 24 ticks off); no swing with more than
  12 frames after its last active frame unless punishing; the Snatch fires at 0.4 of its rate into a grabber.
- Data: the Magpie's Snatch recovery 10 (was 14); the Mimic's back throw growth 92 (was 104).
- The Ward matters more: 1.1 m half-width (was 0.75), lies 420 ticks (was 300), roots 60 ticks (was 42), 7 base damage (was 4); the
  Hexer follows a rooted or staggered opponent with a bolt even while the bolt is cooling down. Its share of her damage is now 11%
  (was 5.5%), and the bolt fell from 34 to 29%.
- Trims: Armour 1.16, Magpie 1.32, Count 0.86, Wolf 1.03, Hexer 1.12, Mimic 0.95.

Numbers (`node tools/simstats.mjs --n 2880`, every ordered pair and mirror, 160 fights a matchup, about +-4 points):

| measure | adaptive vs adaptive | mixed coaches | target |
|---|---|---|---|
| win rate Armour / Magpie / Count / Wolf / Hexer / Mimic | 48.9 / 45.6 / 50.4 / 55.1 / 52.5 / 47.5 | 52.0 / 50.0 / 42.1 / 57.8 / 48.3 / 49.9 | 42 to 58 |
| seconds between specials | 3.7 / 3.0 / 3.2 / 3.2 / 3.5 / 3.4 | 3.5 / 2.6 / 3.5 / 3.2 / 2.9 / 3.2 | 4.5 or less |
| damage through special + special2 | 48.6 / 30.3 / 45.4 / 43.3 / 39.6 / 50.6% | 51.1 / 33.1 / 46.9 / 44.8 / 47.2 / 51.1% | 30% or more |
| largest single move | **Mimic tongue 35.8%** | **Mimic tongue 37.9%, Hexer bolt 36.7%, Wolf pounce 36.3%** | 35% or less |
| finished, median length | 2880/2880, 83 s (p10 57, p90 118) | 2880/2880, 84 s (p10 57, p90 136) | all; 65 to 130 |
| stretches over 6 s | 0 (worst 6.0 s) | **9 (worst 10.8 s)** | about none |
| mirrors (side 0) | 50.6% | 50.4% | near 50 |

Matchups, row beats column, adaptive (mixed in brackets); outside 35 to 65 in bold:

| | Magpie | Count | Wolf | Hexer | Mimic |
|---|---|---|---|---|---|
| Armour | 49 (49) | 52 (64) | 48 (48) | 44 (51) | 51 (48) |
| Magpie | | 56 (59) | **28** (**34**) | 58 (65) | 36 (42) |
| Count | | | 49 (36) | 53 (51) | 59 (46) |
| Wolf | | | | 50 (61) | 50 (45) |
| Hexer | | | | | **67** (**69**) |

Before (round 4, adaptive): Magpie-Mimic 20, Magpie-Wolf 36, Armour-Wolf 69, Hexer-Mimic 69, Magpie-Hexer 68, Wolf-Mimic 34.

Still off:
1. **The Magpie against the Wolf (28)**: the pounce hop did not move it; not broken down yet (likely the Howl into the Pounce on a
   light fighter, or the plain back throw at 13 base). Next: the same breakdown as for the Mimic (`what was it doing when grabbed`).
2. **The Hexer over the Mimic (67)**: the slow chest cannot close on bolts and wards. Next: let the Mimic tongue from further (it
   already shoots outside its own range rarely) or walk it in behind its shield.
3. Single moves just over 35% (the Mimic's tongue in both columns; with mixed coaches the Hexer's bolt and the Wolf's pounce).
4. Mixed coaches: 9 stretches over 6 s (worst 10.8 s) in 2880 fights; adaptive has none.

## Round 4c: the Magpie and the Wolf, the Hexer and the Mimic (`SIM_VERSION` `ringout-sim-7`)

Numbers and hands only; no field, event or projectile kind changed.
- **Magpie vs Wolf.** Of the Wolf's catches on the Magpie, the largest group (59 in 40 fights) was the Pounce landing while she threw
  knives inside its range; next were plain grabs out of her dash, jab and tilt. The Pounce (37 KOs in 80 fights) and the back throw (30)
  took the lives. Fixes: a fighter with a fan shot (the Magpie) throws only from outside a pounce's reach (catch reach + travel +
  0.5 m), and the Magpie weighs 88 (was 84; still "light", the threshold for the light-fighter habits is now under 92).
- **Hexer vs Mimic.** The Mimic lashes its tongue at a caster winding up a shot or a ward (50%, frames 0 to 7 seen), and runs a
  little faster (walk 0.08, run 0.175; were 0.075 and 0.165).
- Test: the facing check no longer counts walks back to the middle while the opponent is dead or respawning.

Numbers (`node tools/simstats.mjs --n 2880`). Overall, adaptive: Armour 48.5, Magpie 50.2, Count 48.6, Wolf 51.6, Hexer 49.6, Mimic
51.4 (mixed 52.9 / 54.4 / **40.6** / 55.6 / 49.1 / 47.4). Seconds between specials, adaptive 3.7 / 3.1 / 3.2 / 3.2 / 3.5 / 3.4.
Damage through specials 48.2 / **29.5** / 45.5 / 43.1 / 39.5 / 49.9%. All 2880 finish in both columns; median 83 s (mixed 84 s);
stretches over 6 s: 2 (worst 6.9 s), mixed 10 (worst 7.6 s).

Matchups, row beats column, adaptive (mixed in brackets), with the round-4b adaptive value after the arrow when it moved 3 or more:

| | Magpie | Count | Wolf | Hexer | Mimic |
|---|---|---|---|---|---|
| Armour | 51 (53) | 52 (64) | 48 (48) | 44 (51) | 48 (49), was 51 |
| Magpie | | 62 (68), was 56 | 44 (43), was 28 | 63 (63), was 58 | **34** (52) |
| Count | | | 49 (36) | 53 (51) | 56 (48), was 59 |
| Wolf | | | | 50 (61) | 48 (43) |
| Hexer | | | | | 58 (**71**), was 67 |

Still off: the Magpie against the Mimic 34 (36 before, within noise of the 35 line); the Magpie's side moved up about 6 against the
Count and 5 against the Hexer (the heavier Magpie); the Magpie's share through specials is 29.5% (just under 30); with mixed coaches
the Hexer still beats the Mimic 71 and the Count is at 40.6 overall.
