# The Scrivener as a show: working contract

This file fixes the seams between the parts being built in parallel today. Read `BRIEF.md` and
`../COMMON.md` first. Anything not fixed here is the lead session's call.

## The fiction (one paragraph, ours)

The Scrivener writes the names of the dead in its ledger. Two petitioners come to the library to
kill it before their own name is finished. **Each exchange with the boss is one stroke of the
petitioner's name.** A name takes six strokes. An attempt ends when the petitioner dies, the boss
dies, or the name is finished (the sixth exchange has resolved and the boss still lives). The
name being inked stroke by stroke on the stage is the attempt's clock.

## Match rules

- Two entrants, alternating attempts, at most three each. The opener alternates per match.
- An attempt's score is the share of the boss's health removed (0..1), `1` on a kill.
- Winner: first to kill once both have had the same number of attempts. Both kill in the same
  pair: the kill with more of the petitioner's own health left wins (tie: fewer strokes used,
  then the pair's first mover loses the tie). Nobody kills in three attempts each: the best single
  attempt by damage wins (tie: best second attempt, then least damage taken, then entrant order).
- `options.handicap` (0..0.4): the favourite starts each attempt with `maxHp * (1 - handicap)`.

## Loadout (ids are frozen; names and numbers may be tuned)

A loadout is `{ cls, weapon, spell, charm }` (ids). The boss has one `temper` per match.
A fighter always has exactly **four moves**: two class moves, the weapon strike, the spell.

Classes (`cls`), three offered out of six. The two fighters' class offers are disjoint (the six
are shuffled, three to each), so the two contenders never fight as the same class:

| id | name | body | class moves | passive |
|---|---|---|---|---|
| `duelist` | The Duelist | lean, long cape, the existing swordsman | Slip Past (`roll_through`), Fall Back (`roll_away`) | Riposte: the first strike after a clean dodge hits harder |
| `warden` | The Warden | broad, helm, tall shield on the off arm | Brace (`guard`), Step In (`roll_toward`) | more health, slower feet |
| `thief` | The Bookthief | small, hooded, crouched, short cloak | Slip Past (`roll_through`), Leap (`jump_back`) | less health, faster strikes and a longer dodge |
| `hexer` | The Hexer | tall robe, pointed hood, no armour | Fall Back (`roll_away`), Hex (`hex`: marks the boss so it takes more damage for a while) | one more spell charge, stronger spells |
| `archivist` | The Archivist | long coat, satchel, spectacles, lantern at the hip | Step In (`roll_toward`), Leap (`jump_back`) | has read ahead: knows each attack by name (mock: lower error rate; model: gets a plain hint) |
| `penitent` | The Penitent | huge shoulders, bare arms, chains | Step In (`roll_toward`), Trade Blows (`trade`: armoured heavy strike, takes reduced damage, cannot be staggered) | hits harder as health falls |

Weapons (`weapon`), three offered out of six. The weapon decides what the Strike move does:

| id | name | effect |
|---|---|---|
| `sabre` | Fencer's Sabre | three quick cuts (today's light chain) |
| `maul` | Binder's Maul | one slow huge blow, breaks the boss's stance fast |
| `knives` | Paper Knives | four very fast small cuts, short reach |
| `pole` | Lamplighter's Pole | long reach: strikes from outside the boss's sweep |
| `censer` | Burning Censer | hits set the boss burning (fire damage over time) |
| `quill` | Stolen Quill | hits much harder while the boss is winding up or writing |

Spells (`spell`), three offered out of six, two charges unless noted:

| id | name | effect |
|---|---|---|
| `candle` | Candleflame | a bolt of fire from range |
| `blot` | Blot | an ink ward that swallows the next blow |
| `margin` | Margin Step | blink behind the boss, untouchable on the way |
| `knot` | Binder's Knot | ties the boss mid-attack: cancels it into a stagger (one charge) |
| `mend` | Mend | close your wounds (heal) |
| `echo` | Echo | your next strike lands twice |

Charms (`charm`), three offered out of seven, passive:

| id | name | effect |
|---|---|---|
| `seal` | Wax Seal | survive one killing blow |
| `bookmark` | Iron Bookmark | more health |
| `ribbon` | Silk Ribbon | dodges are safer (longer untouchable window, cheaper) |
| `ember` | Ember Ring | every strike also burns |
| `nib` | Spite Nib | much more damage when badly hurt |
| `sandglass` | Sand Glass | the name takes one more stroke (seven exchanges) |
| `lens` | Reading Lens | the boss stays open longer after each attack |

Boss tempers (`temper`), one per match:

| id | name | effect | meant to favour |
|---|---|---|---|
| `enraged` | Enraged | hits much harder, barely pauses | warden, archivist, blot |
| `ironbound` | Iron-bound | small cuts barely scratch it; heavy blows and spells bite | maul, penitent, hexer |
| `tinder` | Dry as Tinder | fire does double | candle, censer, ember |
| `slow` | Slow to Turn | stays open long after it swings, weak from behind | duelist, thief, margin |
| `restless` | Restless Pages | throws pages and gusts far more often | warden, leapers |
| `counting` | Counting Names | writes names (the curse) far more often and faster | fast strikers who interrupt it |

No flasks. Healing comes only from Mend.

## Sim API (owner: sim builder; `src/sim/*`, `src/ai/oracle.js`, `src/ai/reflex.js`)

Pure, deterministic, identical in node and the browser, plain-data world (survives
`structuredClone` **and** `JSON.parse(JSON.stringify(w))`: no `Infinity`, `NaN`, `undefined`-as-meaning).

```js
// src/sim/loadout.js
export const CLASSES, WEAPONS, SPELLS, CHARMS, TEMPERS;   // id -> { id, name, effect, ... }  effect: <= 12 words, plain
export const CLASS_IDS, WEAPON_IDS, SPELL_IDS, CHARM_IDS, TEMPER_IDS;
export function drawOffers(seedInt)   // -> { temper, offers: [ {cls:[3], weapon:[3], spell:[3], charm:[3]}, {...} ] }
export function movesFor(loadout)     // -> [ { slot:0..3, id, name, effect, kind:'evade'|'guard'|'strike'|'spell'|'hex'|'trade' } x4 ]
export function mockPick(slot, options, { temper, mine, rng })   // -> id (sensible, not optimal)

// src/sim/world.js
createWorld({ seed, agentId, loadout, temper, handicap = 0, decisions = true })
stepWorld(w, dt, controller)
applyDecision(w, { slot, thought }, controller)   // slot 0..3 into movesFor(w.agent.loadout); bad slot -> default move
moveState(w)   // -> [ { slot, id, name, effect, kind, available:boolean, charges?:number } x4 ] for the menu
defaultSlot(w) // the move used when a brain times out
// w.thinking = { attackId, k, strokes, ... } ; k = this exchange (1-based), strokes = strokes this name takes
// w.outcome: null | 'agent_dead' | 'boss_dead' | 'written'
// w.agent.loadout, w.agent.cls ; w.boss.temper
// w.log.damageDealt, w.log.exchanges, score = 1 - boss.hp / boss.maxHp

// src/ai/oracle.js
evaluateOptions(w, controller)  // -> [{ slot, score, taken, dealt }] best first (mock brain only)
```

New sim events (on top of the existing table in README): `agent.guard {x, blocked}`, `agent.cast {spell, x}`,
`spell.hit {spell, damage, x}`, `agent.blink {from, to}`, `boss.bound {x}`, `boss.hexed {ms}`,
`burn.tick {damage}`, `charm.proc {charm, x}`, `name.stroke {k, strokes}`, `name.written {}`.

Balance targets (mock brains, `tools/balance.mjs`):
- an attempt lasts 4 to 6 exchanges on average and 16 to 26 s of sim time;
- an attempt kills the boss 18 to 28% of the time (averaged over loadouts);
- over 400 matches no class wins under 40% or over 60% of its matches;
- each temper moves at least one class's win rate by 10 points or more against that class's overall rate;
- 200 matches complete with no stall.

## Brains (owner: lead; `src/brains/*`, node side only)

```js
createBrain(bot, env) -> {
  kind: 'mock' | 'llm', label,
  pick({ slot, options, temper, mine, theirs, form })        -> Promise<{ choice, reason }>   // reason <= 12 words
  decide({ world, moves, notes, recall })                    -> Promise<{ slot, line }>       // line <= 12 words
  note({ world, result, notes })                             -> Promise<{ text }>             // <= 18 words, to itself
  say({ kind: 'win' | 'loss', summary })                     -> Promise<{ text }>             // <= 16 words
}
```

## The feed (frozen at 16:00)

`announce.meta = { game: 'scrivener', matchNo, strokes: 6, order, simHash, handicap, bots: [{ id, name, model, look, brain, record, vsBoss, byClass, h2h }] }`.
The README's feed table is the authoritative list; it was frozen at the checkpoint.

Events (`show.emit({ type, at, data })`). Every event carries what a late joiner needs.

| type | data |
|---|---|
| `phase` | `{ phase: 'call'|'choosing'|'tape'|'fight'|'verdict', ms, state }` (`state` = the whole show state so far, see below) |
| `temper` | `{ temper }` |
| `offer` | `{ entrantId, slot: 'cls'|'weapon'|'spell'|'charm', options: [id x3] }` |
| `pick` | `{ entrantId, slot, choice, reason, source }` |
| `attempt.ready` | `{ index, entrantId, n }` (the walk-on; the "how far" window is open) |
| `attempt.start` | `{ index, entrantId, n, seed, loadout, temper, handicap }` (the bell; both ends start the sim) |
| `decide.open` | `{ index, k, tick, attackId, world }` (`world` = JSON of the frozen sim world) |
| `decide.made` | `{ index, k, slot, move, line, ms, source }` |
| `attempt.end` | `{ index, entrantId, n, result: 'kill'|'death'|'written', score, hpLeft, strokes, killedBy, tally }` |
| `note` | `{ entrantId, text }` |
| `verdict` | `{ winnerId, how: 'kill'|'both_kill'|'damage', deciding: { index }, tally }` |
| `line` | `{ entrantId, text, kind }` |
| `next` | `{ ms }` |

`state` in `phase`: `{ matchNo, order: [idA, idB], temper, offers, loadouts: { [id]: {cls,weapon,spell,charm} }, reasons, attempts: [attempt.end data...], current: { index, entrantId, n } | null, winnerId }`.

Windows: A at the tape ("Who beats the Scrivener?", live, 2 outcomes, settles at the verdict); one
before each attempt ("How far does X get?", 4 outcomes `q1..q4`, seeded, its seed is the attempt's
world seed); one after each undecided pair ("Who beats the Scrivener?", live).

## Stage (owner: lead; `index.ts`, `src/stage/*`)

The browser runs the same sim as the channel and replays it from `attempt.start` + `decide.made`.
The sim freezes itself at each decision, so the two ends only need the decisions. `decide.open.world`
lets a late joiner (or a diverged client) pick the fight up exactly.

Render seams the art builder provides:

```js
// src/render/agent_draw.js
drawAgent(ctx, world, t)                          // reads world.agent.loadout (cls, weapon, charm) and state
drawFighterFigure(ctx, { loadout, x, y, scale, facing, pose, t, accent })   // portrait use: call, choosing, tape, verdict
// pose: 'idle' | 'ready' | 'strike' | 'guard' | 'cast' | 'victory' | 'fallen'
// src/render/items_draw.js
drawItemIcon(ctx, kind, id, x, y, size, { ink, accent })   // engraved emblem for a class, weapon, spell, charm or temper
```

## Look and words

Ink engraving on cream paper, black line work, one oxblood accent, each entrant's own accent colour.
System serif stacks from `src/ui/letter.js` (`FONT`). On-screen lines are 20 words at most.
Banned: eyebrow labels, monospace uppercase, purple gradients, glowing orbs, shockwave rings,
decorative particles, fake stamps or tickets, em dashes, emoji.
