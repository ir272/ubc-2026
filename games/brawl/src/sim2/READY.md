# src/sim2: round 4c (balance) ready to promote

`SIM_VERSION` is `ringout-sim-7`. Consistent point: `node --test test/*.test.mjs` 60/60. Numbers and what is not at target: NOTES.md
"Round 4c".

## Copy

Promotion is a plain copy:
```
cp src/sim2/*.ts src/sim2/NOTES.md src/sim/
```
(do not copy READY.md). Rounds 4b and 4c changed numbers and controller behaviour only (fighters.ts, controller.ts, index.ts): no
field, no event, no projectile kind changed, so the picture and sound work against round 4 stands. test/sim.test.mjs needs no edit
(checked against a copy: 11/11). The tables below are still correct, except that the Hexer's ward is now 1.1 m half-width (was 0.75)
and lies about 7 s (420 ticks). Three select-screen bars moved with the trims and speeds (computed from the numbers): the Armour's
power 4 -> 5, the Count's power 4 -> 3, the Mimic's speed 1 -> 2; the table below is current.

## Round 4: the six fighters (for the picture and sound teams)

Ids, in `FIGHTER_IDS` order: `kiln`, `tick`, `gantry`, `vise`, `hexer`, `mimic`. The `FighterId` type gains `hexer` and `mimic`.

| id | name | role | bars power / speed / reach / weight / grab | projectile kinds |
|---|---|---|---|---|
| kiln | The Empty Armour | Haunted armour | 5 / 1 / 5 / 4 / 3 | `flame` |
| tick | The Magpie | Thief | 2 / 5 / 5 / 2 / 1 | `knife` (three per throw) |
| gantry | The Count | Vampire lord | 3 / 3 / 5 / 3 / 3 | `bat` (three per swarm) |
| vise | The Wolf | Werewolf | 2 / 3 / 2 / 3 / 5 | none |
| hexer | The Hexer | Witch | 2 / 1 / 5 / 2 / 4 | `hex`, `ward` |
| mimic | The Mimic | Hungry chest | 2 / 2 / 5 / 5 / 3 | `tongue` (a tether) |

Bodies of the new two: the Hexer 2.15 m tall, 0.75 m wide; the Mimic 1.2 m tall, 1.3 m wide.

Which mechanic each special uses:

| fighter | special | special2 | recover |
|---|---|---|---|
| Armour | Grave Cleave: low floor wave, kind `flame` (0.2 m/tick, 48 ticks, y 0.45) | Collar Fire: plain hitboxes, a cone about 2.4 m, armoured frames 6 to 28 (`FighterState.armor`), three hits on frames 11 to 14, 17 to 20, 23 to 28 | Fall Apart: rising (the old rise) |
| Magpie | Feather Knives: fan of three `knife`, 0.11 m/tick for 72 ticks, one may land | Snatch: blink | Updraft: aimed flight |
| Count | Bat Swarm: fan of three `bat` with delays, two may land | Mist Step: blink | Bat Form: ledge tether |
| Wolf | Pounce: travelling command grab, then slam | Howl: hitbox snare | Wall Run: rising |
| Hexer | Hex Bolt: one `hex` shot, 0.15 m/tick for 90 ticks | Ward: lobbed `ward`, lies on the floor as a hazard (`floor`, `hazard` events), snare | Crow Flight: ledge tether |
| Mimic | Tongue Lash: `tongue` tether with `effect: 'pull'` (`pulled`, `drag`, `pull` event), then `grab` and `throw` (move `special`) and the slam `hit` | Swallow and Spit: close command grab: `grab`, then `throw` with move `special2`, `holding` with move `special2` for 24 ticks, then the spit `hit` (move `special2`) | Coin Burst: rising |

The only event change: `throw.move` can now be `special2` (the Mimic's swallow); before, a command throw was always `special`.
No new field.

## Every new optional field and event (for the picture)

`MoveDef` (static data):
- `projectile.y?: number` spawn height above the feet (the Armour's flame: 0.45, low along the floor).
- `projectile.fan?: { vx, vy, delay? }[]` several shots, one per entry; `delay` is ticks after `frame` (the Magpie: three knives at once;
  the Count: three bats 8 ticks apart).
- `projectile.fanHits?: number` how many shots of one fan may land (default 1; the Count's bats: 2).
- `projectile.effect?: 'pull' | 'snare'`, `projectile.effectTicks?: number` what a catch does (the Mimic's tongue: pull; the Hexer's ward: snare, 42 ticks).
- `projectile.linger?`, `projectile.every?`, `projectile.floorR?`, `projectile.place?` floor hazards (supported; no fighter uses them now).
- `projectile.tether?: boolean` draw it as a line from the owner's hand to the tip (supported; no fighter uses it now).
- `blink?: { frame, dx, behind, invuln: [from, to] }` (the Magpie's Snatch; the Count special2 Mist Step: untouchable frames 1 to
  12, reappears on frame 9, then a heavy launching swipe).
- `Hitbox.effect?: 'snare'`, `Hitbox.effectTicks?: number` a strike that staggers instead of launching (the Wolf's Howl, 48 ticks).

`FighterState` (per tick):
- `rooted?: number` ticks left snared (action is `hitstun`, no knockback, standing still): draw the stagger. A fighter howled in the
  air drops straight down and stays rooted for the full length after landing. A rooted body is never shoved by the other fighter
  (the other one takes the whole push).
- `pulled?: boolean` being reeled in by a tether (supported; unused now).

`Projectile` (per tick):
- `move?: MoveId` the move that fired it. `g?: number` gravity.
- `n?: number` on a fan shot: how many shots of its volley had landed or been blocked when it spawned.
- `cd?: number` on a flying shot, 1 = spent (its volley already landed as many as it may: one knife, two bats): fade it and let it fly
  on harmlessly; on a burn hazard, ticks to its next hit.
- `floor?`, `effect?`, `tether?`, `drag?` as in round 3: the Hexer's ward lies on the floor (`floor`, `effect: 'snare'`); the Mimic's
  tongue is a tether (`tether`, `drag` while reeling).

Projectile kinds produced today: `flame` (the Armour), `knife` (the Magpie, three per throw), `bat` (the Count, three per swarm on
frames 15, 23 and 31, 0.115 m/tick, 104 ticks, radius 0.45: draw them big), `hex` and `ward` (the Hexer), `tongue` (the Mimic, a tether).
`wave`, `rivet` and `chain` are no longer produced.

`SimEvent`:
- `{ t: 'blink', side, fromX, fromY, toX, toY, behind }` vanish at from, appear at to (the Magpie's Snatch and the Count's mist).
- `{ t: 'snare', by, to, x, y, ticks }` rooted. The Howl and the Hexer's ward use this event; the Howl comes with a `hit` (kb 0, small damage) and the `move` event for
  `special2` before it; there is no new event.
- The Pounce uses the existing events: `move` (`special`), then on a catch `grab` and `throw` (move `special`) and the slam `hit`, or a
  `whiff` on a miss. The wolf itself travels (about 4.7 m); there is no tether projectile.
- `{ t: 'pull', by, to, x, y }` the Mimic's tongue caught. `{ t: 'hazard', side, id, kind, x, y, r, state }` the Hexer's ward
  (`placed`, `sprung`, `expired`, `replaced`).
- `hit.via?: MoveId` and `shield_hit.via?: MoveId` on projectile hits: which move fired it (`move` stays `'projectile'`).

Which mechanic each special uses: the round-4 table above.

## What else the stage should know

- `gantry` is now The Count (role "Vampire lord") and `vise` is The Wolf (role "Werewolf", 1.9 m tall, 1.15 m wide). Ids are
  unchanged. Every move has a new name and `look` note; the Count's normals keep their old numbers.
- After a Pounce catch the Wolf holds and slams: the same `holding` with move `special` as the old command grab.
- Select-screen bars: the round-4 table above (computed from the numbers). The power bar only reads strikes, so shots do not count.
