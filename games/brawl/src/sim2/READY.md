# src/sim2: round 3 (abilities) and round 3b (the Count and the Wolf) ready to promote

`SIM_VERSION` is `ringout-sim-3` (unchanged by round 3b). Consistent point: `node --test test/*.test.mjs` 55/55 (src/sim untouched
and its tests pass). Numbers and what is not at target: NOTES.md "Round 3: abilities" and "Round 3b: the Count and the Wolf".

## Copy

```
cp src/sim2/controller.ts src/sim2/engine.ts src/sim2/fighters.ts src/sim2/index.ts src/sim2/types.ts src/sim2/NOTES.md src/sim/
```
Only these five .ts files differ from src/sim (arena.ts, coach.ts and math.ts are identical; do not copy READY.md). Then, in
test/sim.test.mjs, change the two name checks (lines 37 and 38) to `'The Count'` and `'The Wolf'`: that is the only src/sim test that
fails against the promoted code (checked by running test/sim.test.mjs against a copy). Exported API unchanged. New exports since
round 2: `projDef` (engine.ts), `SHOT`, `WARD`, `BLINK`, `TETHER`, `POUNCE`, `HOWL` (controller.ts). Type changes are additive and
optional only. The show and stage read fighter names and projectile kinds from the sim, so the picture needs the kinds below (`bat`
is new; `ward` and `chain` are no longer produced by any fighter).

## Every new optional field and event (for the picture)

`MoveDef` (static data):
- `projectile.y?: number` spawn height above the feet (Kiln's wave: 0.45, low along the floor).
- `projectile.fan?: { vx, vy, delay? }[]` several shots, one per entry; `delay` is ticks after `frame` (Tick: three knives at once;
  the Count: three bats 4 ticks apart).
- `projectile.fanHits?: number` how many shots of one fan may land (default 1; the Count's bats: 2).
- `projectile.effect?: 'pull' | 'snare'`, `projectile.effectTicks?: number` what a catch does (supported; no fighter uses them now).
- `projectile.linger?`, `projectile.every?`, `projectile.floorR?`, `projectile.place?` floor hazards (supported; no fighter uses them now).
- `projectile.tether?: boolean` draw it as a line from the owner's hand to the tip (supported; no fighter uses it now).
- `blink?: { frame, dx, behind, invuln: [from, to] }` (Tick special2 Blink Step; the Count special2 Mist Step: untouchable frames 1 to
  12, reappears on frame 9).
- `Hitbox.effect?: 'snare'`, `Hitbox.effectTicks?: number` a strike that staggers instead of launching (the Wolf's Howl, 40 ticks).

`FighterState` (per tick):
- `rooted?: number` ticks left snared (action is `hitstun`, no knockback, standing still): draw the stagger. A fighter howled in the
  air drops straight down and stays rooted for the full length after landing.
- `pulled?: boolean` being reeled in by a tether (supported; unused now).

`Projectile` (per tick):
- `move?: MoveId` the move that fired it. `g?: number` gravity.
- `n?: number` on a fan shot: how many shots of its volley had landed or been blocked when it spawned.
- `cd?: number` on a flying shot, 1 = spent (its volley already landed as many as it may: one knife, two bats): fade it and let it fly
  on harmlessly; on a burn hazard, ticks to its next hit.
- `floor?`, `effect?`, `tether?`, `drag?` as in round 3 (hazards and tethers; unused by the current cast).

Projectile kinds produced today: `wave` (Kiln special), `knife` (Tick special, three per throw) and the new `bat` (the Count special:
three per Bat Swarm, spawned 4 ticks apart, in a tight rising, level and dipping spread, about 14 m). `rivet`, `ward` and `chain` are
no longer produced.

`SimEvent`:
- `{ t: 'blink', side, fromX, fromY, toX, toY, behind }` vanish at from, appear at to (Tick and the Count's mist).
- `{ t: 'snare', by, to, x, y, ticks }` rooted. The Howl uses this event, with the `hit` (kb 0, 2 damage) and the `move` event for
  `special2` before it; there is no new event.
- The Pounce uses the existing events: `move` (`special`), then on a catch `grab` and `throw` (move `special`) and the slam `hit`, or a
  `whiff` on a miss. The wolf itself travels (about 4.7 m); there is no tether projectile.
- `{ t: 'pull', ... }` and `{ t: 'hazard', ... }` are still emitted by the engine if data uses them; the current cast does not.
- `hit.via?: MoveId` and `shield_hit.via?: MoveId` on projectile hits: which move fired it (`move` stays `'projectile'`).

Which mechanic each special uses:

| move | mechanic |
|---|---|
| Kiln special (Floor Wave) | low projectile `wave` |
| Tick special (Fan Throw) | fan of three `knife`, one may land |
| Tick special2 (Blink Step) | blink |
| Count special (Bat Swarm) | fan of three `bat` with delays, `fanHits` 2 |
| Count special2 (Mist Step) | blink (slower than Tick's) |
| Count recover (Bat Form) | ledge tether (the old Grapple Line numbers) |
| Wolf special (Pounce) | travelling command grab, then the command slam |
| Wolf special2 (Howl) | hitbox snare effect |
| Wolf recover (Wall Run) | rising climb (the old Clamp Climb numbers) |

## What else the stage should know

- `gantry` is now The Count (role "Vampire lord") and `vise` is The Wolf (role "Werewolf", 1.9 m tall, 1.15 m wide). Ids are
  unchanged. Every move has a new name and `look` note; the Count's normals keep their old numbers.
- After a Pounce catch the Wolf holds and slams: the same `holding` with move `special` as the old command grab.
- Select-screen bars (computed from the numbers): the Count power 3, speed 3, reach 5, weight 3, grab 3; the Wolf power 2, speed 3,
  reach 2, weight 3, grab 5. The power bar only reads strikes, so the bats do not count.
