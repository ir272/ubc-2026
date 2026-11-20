# Viewer's guides: draft content for the About sections

For Ian to mark up. This is the content only; how it looks on the channel pages is a separate decision. The same content is typed data in `web/src/content/guides.ts` (one object per game, plus `GUIDES` by channel id), which is not wired into any page.

Every number below was read from the game's own code or from test data recorded in the repo; where a figure comes from tests it says so. Where the code and the docs disagree the guide follows the code, and the disagreement is listed under Open questions at the end. The games were still being edited while this was written: each section says when its files were read and the newest files seen. The Goober Guys section was corrected at about 05:35 from a check by the Tumbletop session, which also says what the stream does and does not draw.

"Scripted tests" means batches the game builders ran with scripted players instead of AI models. They are the only measured data in the repo; the live AI players have not been measured.

## Inkelton (channel `scrivener`, games/scrivener)

Read 2026-11-20, about 05:04 to 05:08 CST. Newest files then: src/stage/fight_hud.js 2026-11-20 05:01:18; index.html 2026-11-20 05:01:19; REPORT.md 2026-11-20 04:58:13; ROUNDS.md 2026-11-20 04:58:03; src/show/rules.js, script.js, timing.js 2026-11-20 03:17:36; src/sim/* 2026-11-19 08:17:33 or older.

### What happens

Two AI players each build a fighter (a class, a weapon, a spell and a charm, each chosen from three offered) and then take one go each at the same boss, Inkelton. A go lasts at most six of the boss's attacks; at every attack the game freezes and the AI picks one of its fighter's four moves. Whoever kills the boss wins; if neither does, whoever left it with less health wins.

### What you bet on

- Who wins the match? Two outcomes, the two AI players. It opens on the matchup screen after all eight picks and the boss's temper are public, stays open 30 seconds, and closes before the first go starts. It is the only bet in a match and is paid at the verdict.

### How a match works

- **The order of a match**: The call (10 s), the choosing (about 60 s: the boss's temper, then the picks), the matchup with the bet open (35 s), the fight (one go each, the opener first), the verdict (21 s).
  - Numbers: Typical match length: about 3 min 40 s; Bet window: 30 s
- **The choosing**: For each slot in turn (class, weapon, spell, charm), each AI is shown three options and picks one, the opener first. Each AI sees the temper and the other's picks so far. The two players are never offered the same class: the six classes are shuffled and split three and three. Weapons, spells and charms are drawn separately for each player, so both can end up with the same one.
  - Numbers: Time to pick: 7.5 s, then the first option offered is taken
- **One go each**: Each AI fights the boss once. Who goes first alternates as the channel cycles through every pairing of its players.
  - Numbers: Goes per player: 1
- **The name (the clock of a go)**: Every boss attack is one stroke of the fighter's name. A go ends when the fighter dies, the boss dies, or the name is finished: the last stroke has played out and the boss still stands.
  - Numbers: Strokes per go: 6; With the Sand Glass charm: 7
- **A decision**: As each boss attack winds up, the fight freezes and the AI picks one of its four moves: two class moves, its weapon's strike, its spell. A spell with no charges left cannot be picked. If no answer comes in time, the fighter uses its first dodge or guard move.
  - Numbers: Time to decide: up to 10 s
- **Who wins**: A kill wins. If both kill it, the one with more of its own health left wins, then the one that used fewer strokes; a dead heat goes to the player who went second. If neither kills it, the one that left the boss with less health wins; if that ties too, the one that took less damage, then the one that went first.
- **Fighter basics**: Every fighter has 100 stamina, spent by dodges and strikes and refilled when it rests. A roll or a leap has a short untouchable moment in the middle; a blow that lands inside it does nothing.
  - Numbers: Stamina: 100; Stamina back: 45 a second, after 0.6 s of rest; Roll: 0.46 s long, untouchable from 0.07 s to 0.37 s, costs 24; Leap: 0.62 s long, untouchable from 0.14 s to 0.38 s, costs 18

### Classes

Three of the six are offered to each player. The class sets health, footwork, how hard strikes hit, two of the four moves and one passive.

- **The Duelist**: Riposte: the first strike after a clean dodge does double damage.
  - Numbers: Health: 100; Strike damage: x1.1; Moves: Slip Past, Fall Back; Riposte: x2
  - Tip: Measured best under Slow to Turn and worst under Enraged, Counting Names and Dry as Tinder (scripted tests, see Before you bet).
- **The Warden**: The most health, the hardest strikes, slow feet, and Brace (a shield). Its rolls cost a little more stamina.
  - Numbers: Health: 125; Strike damage: x1.35; Moves: Brace, Step In; Roll cost: +4 stamina
  - Tip: Measured best under Enraged and worst under Slow to Turn (scripted tests).
- **The Bookthief**: Quicker strikes and a longer, further roll.
  - Numbers: Health: 112; Strike damage: x1.15; Moves: Slip Past, Leap; Strike wind-up and recovery: x0.78 (22% faster); Roll: untouchable 0.09 s longer, 20 units further
- **The Hexer**: Every spell is stronger and has one more charge, and its own move Hex marks the boss.
  - Numbers: Health: 115; Strike damage: x1.05; Moves: Fall Back, Hex; Spell power: x1.5; Spell charges: +1
  - Tip: Measured better under Dry as Tinder (scripted tests).
- **The Archivist**: Has read ahead: an AI playing it is told in plain words what each boss attack is (the others only see the pose). The Written Name barely touches it.
  - Numbers: Health: 90; Strike damage: x1.0; Moves: Step In, Leap; Written Name damage taken: 10%
  - Tip: Measured best under Counting Names (scripted tests).
- **The Penitent**: Hits harder the closer it is to death, and its own move Trade Blows takes a hit to give one.
  - Numbers: Health: 95; Strike damage: x0.95; Moves: Step In, Trade Blows; Rage: up to +40% damage at 0 health, in step with health lost
  - Tip: Measured better under Iron-bound and Dry as Tinder, much worse under Counting Names (scripted tests).

### Class moves

The move names shown on the move cards. Each class has two of them.

- **Slip Past**: Roll through the boss and come out at its back.
  - Numbers: Classes: Duelist, Bookthief
- **Fall Back**: Roll away, out of its reach.
  - Numbers: Classes: Duelist, Hexer
- **Step In**: Roll in close, inside its reach.
  - Numbers: Classes: Warden, Archivist, Penitent
- **Leap**: Jump back over anything low.
  - Numbers: Classes: Bookthief, Archivist
- **Brace**: Shield up through the attack. Blows from the front do a quarter of their damage but cost stamina; if stamina runs out the shield breaks and the fighter is knocked about. A clean block makes the next strike hit harder. Blows from behind are not blocked.
  - Numbers: Class: Warden; Damage taken, front: 25%; Damage taken, Written Name: 80%; Damage taken, falling pages: 65%; Stamina cost: 1.1 x the blow's damage; Next strike after a clean block: x1.5
- **Hex**: Mark the boss: for 9 seconds it takes more damage from everything and smoulders. Costs no spell charge.
  - Numbers: Class: Hexer; Mark: 9 s; Damage taken by the boss: x1.45 (x1.9 under Iron-bound); Burn: 9 a second for 5 s
- **Trade Blows**: An armoured heavy blow: the fighter takes less damage, cannot be knocked down until the attack is over, and hits a little harder.
  - Numbers: Class: Penitent; Damage taken: 75%; Blow damage: x1.1

### Weapons

Three of six are offered. The weapon decides what the Strike move does. Damage below is before the class multiplier.

- **Fencer's Sabre**: Three Cuts: three quick cuts.
  - Numbers: Damage: 12, 12, 16; Wind-up: 0.15 s; Stamina per cut: 14; Reach: 105
  - Tip: Measured win rate 52% (scripted tests).
- **Binder's Maul**: Crushing Blow: one slow, huge blow that breaks the boss's stance fast.
  - Numbers: Damage: 30; Stance damage: 38; Wind-up: 0.56 s; Stamina: 32; Reach: 128
  - Tip: The strongest weapon in scripted tests (57 to 60% wins), very strong under Iron-bound, weak under Counting Names.
- **Paper Knives**: Flurry: four very fast small cuts at short reach.
  - Numbers: Damage: 9, 9, 9, 14; Wind-up: 0.095 s; Stamina per cut: 8; Reach: 82
  - Tip: Measured win rate 50% (scripted tests).
- **Lamplighter's Pole**: Long Thrust: long reach, strikes from outside the boss's sweep.
  - Numbers: Damage: 13, 16; Wind-up: 0.185 s; Stamina per thrust: 14; Reach: 205
  - Tip: The weakest weapon in scripted tests (39% wins).
- **Burning Censer**: Censer Swing: every hit sets the boss burning.
  - Numbers: Damage: 9, 12; Burn: 6 a second for 3 s, refreshed by each hit; Wind-up: 0.17 s; Reach: 112
  - Tip: Burns do double under Dry as Tinder. Measured win rate 48% (scripted tests).
- **Stolen Quill**: Nib Stab: hits much harder while the boss is winding up an attack or writing.
  - Numbers: Damage: 10, 10, 14; While it winds up or writes: x2.1; Reach: 105
  - Tip: Measured win rate 49% (scripted tests); does well under Counting Names.

### Spells

Three of six are offered. A spell has a few charges per go; the Hexer gets one more of each and makes damage, burns and healing 1.5 times stronger.

- **Candleflame**: A bolt of fire from range that sets the boss burning.
  - Numbers: Charges: 2; Damage: 30; Burn: 6 a second for 2.5 s; With the Hexer: 45 damage, 9 a second
  - Tip: Counts as fire and as a spell: x2 under Dry as Tinder and x2 under Iron-bound. Measured win rate 50% (scripted tests).
- **Blot**: An ink ward that swallows the next blow whole.
  - Numbers: Charges: 2; Ward lasts: 9 s
  - Tip: Measured win rate 53% (scripted tests); does well under Enraged.
- **Margin Step**: Blink behind the boss, untouchable on the way.
  - Numbers: Charges: 2; Untouchable for: 0.42 s (0.5 s with the Silk Ribbon)
  - Tip: The best spell in scripted tests (61% wins). Hits from behind do x1.7 under Slow to Turn.
- **Binder's Knot**: Ties the boss mid-attack: cancels the attack and anything it has thrown, and leaves it staggered (it takes double damage while staggered).
  - Numbers: Charges: 1; Stagger: 2.1 s
  - Tip: Measured win rate 51% (scripted tests).
- **Mend**: Close your wounds. The only healing in the game.
  - Numbers: Charges: 2; Heal: 70; With the Hexer: 105
  - Tip: The weakest spell in scripted tests (30 to 36% wins).
- **Echo**: Your next strike lands twice.
  - Numbers: Charges: 2; Second hit: same damage, half the stance damage
  - Tip: Measured win rate 51% (scripted tests).

### Charms

Three of seven are offered. Charms work on their own.

- **Wax Seal**: Survive one killing blow with 1 health.
  - Numbers: Uses: 1
  - Tip: Measured win rate 48% (scripted tests).
- **Iron Bookmark**: More health.
  - Numbers: Health: +25
  - Tip: Measured win rate 46% (scripted tests).
- **Silk Ribbon**: Dodges are safer: longer untouchable, cheaper.
  - Numbers: Roll untouchable: +0.08 s; Roll cost: -8 stamina; Leap cost: -6 stamina; Margin Step: +0.08 s
  - Tip: The weakest charm in scripted tests (42% wins).
- **Ember Ring**: Every strike also burns.
  - Numbers: Burn: 4 a second for 2 s
  - Tip: Burns do double under Dry as Tinder. Measured win rate 48% (scripted tests).
- **Spite Nib**: Much more damage when badly hurt.
  - Numbers: Below 45% health: x1.6 damage
  - Tip: Measured win rate 52% (scripted tests).
- **Sand Glass**: The name takes one more stroke: seven exchanges instead of six.
  - Numbers: Strokes: 7
  - Tip: Measured win rate 55% (scripted tests).
- **Reading Lens**: The boss stays open longer after each attack.
  - Numbers: Opening after its attacks: x1.3
  - Tip: The best charm in scripted tests (57% wins).

### The boss's temper

One temper is drawn at random for each match and shown before the picks. It changes the boss for both players.

- **Enraged**: Hits much harder and barely pauses between attacks.
  - Numbers: Its damage: x1.9; Pause between attacks: x0.65
  - Tip: Scripted tests: the Warden did much better (+31 and +8 points), the Duelist much worse (-37 and -29).
- **Iron-bound**: Small cuts barely scratch it; heavy blows and spells bite.
  - Numbers: Quick-strike weapons: x0.42; Heavy blows (Maul, Trade Blows): x1.35; Spells: x2; Hex mark: x1.9
  - Tip: Scripted tests: the Penitent did better (+19 and +9 points); the Maul is very strong here.
- **Dry as Tinder**: Fire does double: Candleflame and every burn (Censer, Ember Ring, Hex).
  - Numbers: Fire: x2
  - Tip: Scripted tests: the Hexer (+10 and +14) and the Penitent (+12 and +14) did better, the Duelist worse (-39 and -20).
- **Slow to Turn**: Weak from behind and raises nothing behind itself (no wing columns, no back waves). Its hits are also a quarter stronger.
  - Numbers: Damage from behind: x1.7; Its damage: x1.25
  - Tip: Scripted tests: the Duelist did much better (+34 and +17 points), the Warden worse (-32 and -10).
- **Restless Pages**: Throws gusts and pages far more often, page storms from the start, and its pages hit far harder.
  - Numbers: Wing Gust: 4.5x as likely, cooldown 0.5 s; Page Storm: from the start, cooldown 6 s; Page damage: x2.6 (a gust page 108, a storm page 54)
  - Tip: Scripted tests: the Hexer did worse in both runs (-24 and -13 points), the Warden a little better (+17 and +6).
- **Counting Names**: Writes names often and fast; no dodge or blow stops the pen, but the eruption is weaker.
  - Numbers: Written Name: 8x as likely, cooldown 2.2 s, writes in 1.44 s; Eruption damage: x0.7 (72); Breaks on a hit: no; Untouchable moments: do not protect
  - Tip: Scripted tests: the Archivist did better (+11 and +17 points), the Penitent (-21 and -35) and the Duelist worse.

### Inkelton, the boss

Damage below already includes the boss's own x2.3 on all its hits, before the temper. Reach is in the game's units; the hall is 1160 units wide.

- **Inkelton**: Breaks into a stagger when enough blows break its stance, and takes double damage while staggered. At half health it pauses, untouchable, then plays everything faster and can start Page Storms. An attack that draws blood leaves only a fifth of its usual opening to hit back in.
  - Numbers: Health: 380; Stance: 100; Stagger: 2.8 s, double damage taken; Stance comes back: 30 a second after 3 s unhit; Pause between attacks: 0.65 to 1.25 s (0.35 to 0.8 s at half health); At half health: 2.2 s untouchable, then 15% faster; Opening after a landed attack: 20% of normal
- **Quill Slash**: One huge chop of the pen-blade along the floor, then its wings burst the floor behind it. Rolling through to its back gets caught by the wings.
  - Numbers: Wind-up: 0.45 s; Chop: 60; Wing columns behind: 55 each; Reach: 470; Opening after: 1.35 s; Used from: up to 285 away
- **Ink Lunge**: A dash across most of the hall, the blade out in front.
  - Numbers: Wind-up: 0.68 s; Damage: 60; Opening after: 1.25 s; Used from: 380 away or more
- **Ledger Slam**: The book slammed down in front of it: ink columns at both sides, ripples racing both ways along the floor, then a second wave behind it. In front of the book is the safe place.
  - Numbers: Wind-up: 0.56 s; Book: 69; Columns: 51 each; Ripples: 32 each; Second wave: 41; Opening after: 1.45 s; Cooldown: 1.5 s
- **Wing Gust**: A wind that shoves the fighter back, then a wall of four torn pages flying at it.
  - Numbers: Wind-up: 0.72 s; Push: 240 a second for 1 s; Pages: 41 each; Opening after: 0.9 s; Cooldown: 3.5 s
- **Written Name**: It writes the fighter's name while a ring of ink follows the fighter, then the ring stops and erupts. One blow on the boss while it writes breaks the pen. A roll timed to the eruption escapes it; rolling early just drags the ring along.
  - Numbers: Wind-up: 0.88 s; Writing: 2.4 s; Eruption: 104; Opening if the pen is broken: 1.15 s; Cooldown: 11 s
- **Page Storm**: Rises and rains pages like blades everywhere except right beside it. Only after half health (from the start under Restless Pages).
  - Numbers: Wind-up: 1.05 s; Storm: 2.6 s; Pages: 21 each; Safe ring: within 175 of the boss; Cooldown: 12 s

### The players

The AI players in bots.json. Each is a language model with a short personality line; the channel pairs them in turn. With no model available a player runs on a script and the stage says "scripted".

- **Marrow**: Patient and exact: waits for the opening and takes only what is safe.
  - Numbers: Model: anthropic/claude-haiku-5.5
- **Vesper**: Bold: would rather trade a blow than give ground, likes to finish fast.
  - Numbers: Model: openai/gpt-6-luna
- **Ashby**: A careful scholar: reads the pose twice, trusts its notes over its nerve.
  - Numbers: Model: google/gemini-3.1-flash-lite
- **Ludo**: A gambler: likes the risky plate and the big swing.
  - Numbers: Model: mistralai/mistral-small-2603

### Before you bet

- Read the temper first: it is drawn before the picks and changes which picks are good. The measured shifts are listed under each temper (scripted tests, two runs of 400 matches; under some tempers a class's usual win rate moved by 20 points or more in both runs).
- Then read both builds on the matchup screen. In scripted tests the Binder's Maul, Margin Step and the Reading Lens were the strongest picks in their slots, and the Lamplighter's Pole, Mend and the Silk Ribbon the weakest.
- Count health against the boss's damage. Its hits do 32 to 69 and the Written Name 104, so a 90-health Archivist or a 95-health Penitent can die to two hits, and Enraged (x1.9) makes most single hits deadly. The Wax Seal, Blot, Brace and the Archivist's curse resistance are the answers in the code.
- Getting hit costs twice: the damage, and four fifths of the opening to hit back. Builds that avoid hits (good dodges, Blot, Brace) keep their chances to deal damage.
- Expect most matches to be decided on damage, not a kill: one go killed the boss about one time in five in scripted tests (19 to 21%). If nobody kills it, the lower boss health left wins.
- The order of goes did not matter in scripted tests (the opener won 48.7% and 53.5% in two runs).
- The game's own build score picked the winner from the builds alone 64 to 69% of the time in scripted tests, and two reviewers reading the matchup screen picked 60%. So the builds tell you a lot, but not everything.
- Every measured figure here comes from scripted players under the old three-goes format (sim report, 2026-11-19). The real AI players may play better or worse, and no test has been run on the one-go format yet.

### Fairness and randomness

- The temper and the three options for every slot come from a fresh random draw at the start of the choosing, before any bet opens, and are shown on screen. Every pick is public before the window opens.
- The bet is seeded: when it closes, the platform produces a seed, and each go's dice (its world seed, eight hex digits per go) are cut from it. No go's dice exist while betting is open.
- The AI players' moves happen after the bet closes. They cannot be predicted from the seed, but every move is published in the feed, so any go can be replayed exactly from the seed plus the published moves (607 of 607 recorded goes matched in the latest check).
- The fight rules are pinned: a hash of the simulation's code is recorded with the bet.
- Time limits: a pick slower than 7.5 s takes the first option offered; a fight decision slower than 10 s plays the first dodge or guard move.
- If no model can be called (no key, or the spending cap of $1.50 per run is reached), the players fall back to a script and the stage says "scripted".
- The channel can cut the favourite's starting health by up to 40%, but the runner starts it with no handicap, so live matches have none.

### Sources

- games/scrivener/channel.ts
- games/scrivener/README.md
- games/scrivener/DESIGN.md (older: three goes, three windows)
- games/scrivener/REPORT.md
- games/scrivener/src/show/script.js, rules.js, timing.js, bots.js, store.js
- games/scrivener/src/sim/loadout.js, boss.js, attacks.js, agent.js, combat.js, world.js
- games/scrivener/src/brains/llm.js (the Archivist's hint)
- games/scrivener/bots.json
- games/scrivener/.cache/sim_report.md (scripted balance tests, 2026-11-19 08:20)
- runner/src/index.ts

## Blood Moon (channel `brawl`, games/brawl)

Read 2026-11-20, about 05:08 to 05:10 CST. Newest files then: src/sim/* (copied from src/sim2) 2026-11-20 04:54:38; src/sim2/READY.md, NOTES.md 2026-11-20 04:54:03; src/sim2/fighters.ts, controller.ts 2026-11-20 04:52:50; src/show/script.ts, brains.ts 2026-11-20 04:47:47; ROUNDS.md 2026-11-20 04:39:38; src/show/events.ts 2026-11-20 04:00:25.

### What happens

Two AI coaches each pick one of six monsters without seeing the other's pick, then strike stages until one is left. The monsters fight on their own while each AI sets its fighter's game plan about every 3 seconds. Each fighter has two lives: hits build up damage, damage makes hits launch further, and a fighter launched past the edge of the arena loses a life.

### What you bet on

- Who wins? Two outcomes, the two AI coaches. It opens after both fighters are revealed and the taunts, stays open 30 seconds, and closes before the countdown. It is seeded: the fight's dice come from its close.
- Who wins? again, for 15 seconds, after each lost life that does not end the match (at most two per match). These open with the score in front of you and are not seeded: the fight carries on from where it stopped.
- Every window is paid on the match winner.

### How a fight works

- **Damage and launching**: Every hit adds to the target's damage percent. The higher it is, the further the next hit launches; heavier fighters are launched less far. Damage goes back to 0 when a fighter comes back after losing a life.
  - Numbers: Weight effect: the damage part of each launch is multiplied by 200 / (weight + 100)
- **Lives**: A fighter launched past a blast line loses a life and comes back on a platform above the middle, untouchable for 2 seconds. Lose both lives and the match is over.
  - Numbers: Lives: 2; Blast lines: 16 m left and right of the middle, 12.5 m up, 7 m below the deck; Untouchable after coming back: 2 s
- **Time and sudden death**: After 3 minutes the fighter with more lives wins. With lives level, sudden death starts: every hit launches harder and harder, and the first to lose a life loses. After 60 seconds of sudden death the lower damage wins.
  - Numbers: Regulation: 3 min; Sudden death launch: x1.5, then +0.1 every 5 s; Sudden death limit: 60 s
- **The arena**: Every stage is drawn over the same layout: a 16 m main deck with a ledge at each end and three thin platforms above it.
  - Numbers: Main deck: 16 m; Platforms: 3
- **Shields, grabs and dodges**: A shield blocks strikes and shots but not grabs, and drains while held; a drained shield breaks and leaves the fighter stunned. A shield raised just before a hit is a perfect shield: no shield damage and the attacker freezes longer.
  - Numbers: Perfect shield window: 5 ticks (1/12 s); Shield break stun: about 2.8 s
- **Fresh and repeated moves**: A move that has not landed recently does 5% more; one that keeps landing does less (down to 8% less for the latest repeat). Charged finishers do up to 40% more.
  - Numbers: Fresh move: +5%; Repeat: -8% to -2%; Full charge: +40%
- **The coach's plan**: The fighter plays every frame itself. Every 3 seconds each AI may send a new plan: a stance (rush, keepaway, bait or wall), how aggressive to be, what range to keep, how often to grab, how to guard the edge and recover, and a one-time order (use the special now, or go for the kill). A plan takes effect at the next 3-second mark at least 0.75 s after it arrives. After a lost life each coach gets a longer think.
  - Numbers: Plan every: 3 s; Earliest effect: 0.75 s after the answer

### The Count

Vampire lord. Long reach, bats, mist. Select-screen bars (1 to 5): power 3, speed 3, reach 5, weight 3, grab 3.

- **Body**: Tall and floaty with the longest normal reach of the cast.
  - Numbers: Weight: 102; Height: 2.2 m; Run speed: 11.1 m/s; Air jumps: 1
- **Bat Swarm**: Throws the cloak open and three big bats fly out one after another, slowly across the stage; a wall to walk in behind. At most two of a line can land, each with a short stagger. Jump them, shield them or dodge through.
  - Numbers: Damage: 4 per bat; Most that land: 2; Time to cross: about 2 s; Range: about 12 m
- **Mist Step**: Turns to mist, reappears 3.2 m ahead or just behind an opponent within 4.5 m, and swipes on arrival. The swipe launches hard enough to take a life. Slower to start than the Magpie's Snatch, so it can be read.
  - Numbers: Damage: 10; Untouchable: frames 1 to 12; Wind-up: 9 frames (0.15 s); Use: once per airtime
- **Bat Form**: Recovery: becomes a bat and flies to a ledge.
  - Numbers: Ledge reach: 6.2 m
- **Strongest blows**: Night Sweep (smash), Spire Rise (up smash), Wing Buffet (back air).
  - Numbers: Night Sweep: 15 at the cloak's tip, 2.35 m out; Spire Rise: 13; Wing Buffet: 11

### The Wolf

Werewolf. Quick, pounces from afar, howls you still. Bars: power 2, speed 3, reach 2, weight 3, grab 5.

- **Body**: Quick on the deck, short reach, the best grabs.
  - Numbers: Weight: 100; Height: 1.9 m; Run speed: 12.3 m/s; Air jumps: 1
- **Pounce**: A long flat leap along the floor. If it reaches a grounded opponent it seizes them (a grab, so a shield does not stop it; a jump or a spot dodge does) and slams them into the deck. A miss leaves a long recovery.
  - Numbers: Leap: about 4.7 m; Slam damage: 14; Recovery on a miss: 34 frames
- **Howl**: A burst of sound all round that roots whoever it reaches, long enough for the Wolf to Pounce on them. A shield blocks it. Ground only.
  - Numbers: Damage: 6; Radius: 1.8 m; Rooted: 0.8 s; Wind-up: 14 frames (0.23 s)
- **Wall Run**: Recovery: runs straight up the air, raking on the way.
  - Numbers: Damage: 8
- **Strongest blows**: Double Maul (smash), Moon Rake (up smash), Shoulder Fling (back throw).
  - Numbers: Double Maul: 18; Moon Rake: 15; Shoulder Fling: 11

### The Empty Armour

Haunted armour. Slow, armoured, ends lives early. Bars: power 5, speed 1, reach 5, weight 4, grab 3.

- **Body**: Heavy and slow, the hardest hitter.
  - Numbers: Weight: 112; Height: 1.9 m; Run speed: 9.6 m/s; Air jumps: 1
- **Grave Cleave**: A low sword cut that sends a wall of flame along the floor, knee high. Slow to start. Jump it or shield it.
  - Numbers: Damage: 11; Range: about 10 m; Wind-up: 22 frames (0.37 s)
- **Collar Fire**: Breathes fire from the empty collar in a short cone: two licks of flame, then a burst that knocks away. Armoured while it breathes, so a hit does not stop it.
  - Numbers: Damage: 3, 3, then 9; Range: about 2.4 m; Armoured: frames 6 to 28; Use: once per airtime
- **Fall Apart**: Recovery: falls to pieces and reassembles higher, armoured.
  - Numbers: Damage: 9
- **Strongest blows**: Greatsword Fall (smash, armoured on the way up), Skyward Blade (up smash), Sabaton Stomp and Overhead Chop (both spike downward).
  - Numbers: Greatsword Fall: 23; Skyward Blade: 21; Sabaton Stomp: 16; Overhead Chop: 15

### The Magpie

Thief. Fastest on the deck, knives, snatches behind you. Bars: power 2, speed 5, reach 5, weight 2, grab 1.

- **Body**: The smallest, fastest and lightest fighter, with two air jumps. Light means it is launched furthest.
  - Numbers: Weight: 84; Height: 1.35 m; Run speed: 12.9 m/s; Air jumps: 2
- **Feather Knives**: Throws three knives in a fan (level, rising, dipping). Weak, for pestering: only one of the three can land.
  - Numbers: Damage: 3; Range: about 8 m in 1.2 s; Most that land: 1
- **Snatch**: Vanishes in feathers and reappears 3.2 m ahead or just behind an opponent within 4.5 m, with a quick cut. Gets behind shields.
  - Numbers: Damage: 7; Untouchable: frames 1 to 9; Wind-up: 6 frames (0.1 s); Use: once per airtime
- **Updraft**: Recovery: rides the air along a straight line in any direction.
  - Numbers: Damage: 4
- **Strongest blows**: Double Heel (smash), Somersault Kick (up smash), Recoil Heel (back air).
  - Numbers: Double Heel: 15; Somersault Kick: 13; Recoil Heel: 11

### The Hexer

Witch. Long reach, bolts and wards, slow feet. Bars: power 2, speed 1, reach 5, weight 2, grab 4.

- **Body**: Tall, light and the slowest on her feet; her staff gives the longest reach of all.
  - Numbers: Weight: 88; Height: 2.15 m; Run speed: 9 m/s; Air jumps: 1
- **Hex Bolt**: One bolt of green fire that crosses most of the stage.
  - Numbers: Damage: 8; Range: about 13 m in 1.5 s; Wind-up: 14 frames (0.23 s)
- **Ward**: Lobs a hex sigil ahead; it lies on the floor and roots the first opponent that stands in it, and she follows a rooted opponent with a bolt. One at a time. Ground only.
  - Numbers: Damage: 7; Lies for: 7 s; Width: 2.2 m; Rooted: 1 s
- **Crow Flight**: Recovery: becomes a flock of crows and flies to a ledge.
  - Numbers: Ledge reach: 6.2 m
- **Strongest blows**: Long Crook Swing (smash), Rising Hex (up smash), Back Crook (back air), Staff Plunge (spikes downward).
  - Numbers: Long Crook Swing: 19 at the tip, 2.55 m out; Rising Hex: 17; Back Crook: 15; Staff Plunge: 15

### The Mimic

Hungry chest. Heavy, slow, swallows you whole. Bars: power 2, speed 1, reach 5, weight 5, grab 3.

- **Body**: The heaviest fighter: hardest to launch, slow, short hops.
  - Numbers: Weight: 120; Height: 1.2 m; Width: 1.3 m; Run speed: 9.9 m/s; Air jumps: 1
- **Tongue Lash**: The tongue shoots out along the floor; a catch is reeled in to the teeth, held and slammed. A shield blocks it and leaves the chest open. Ground only.
  - Numbers: Reach: about 5 m; Catch damage: 3; Slam damage: 8
- **Swallow and Spit**: A close command grab (a shield does not stop it): gulps the opponent, holds them, then spits them out hard. Ground only.
  - Numbers: Damage: 13; Hold: 0.4 s
- **Coin Burst**: Recovery: a burst of coins throws the chest straight up.
  - Numbers: Damage: 7
- **Strongest blows**: Chest Slam (smash), Jackpot Bite (up smash), Over the Hinge (back throw).
  - Numbers: Chest Slam: 18; Jackpot Bite: 16; Over the Hinge: 11

### Stages and the stage strike

The stage strike is for show: by design every stage plays on the same layout, so the stage does not change who wins. Six stages are offered before each match. Each AI lists them in the order it would cross them out; the two take turns crossing out their next stage still standing until one is left. Who strikes first alternates from match to match. A list that comes late or incomplete is finished at random. The strike lists are asked for at the same time as the fighter picks, before either side knows the other's fighter.

- **The Belfry**: Scenery only: every stage plays on the same layout.
- **The Long Shelf**: Scenery only.
- **Gallows Hill**: Scenery only.
- **The Night Ship**: Scenery only.
- **The Map Table**: Scenery only.
- **Lamp Street**: Scenery only.

### The players

The AI coaches in bots.json. Each is a language model with a short style line; every pairing plays once per cycle. When no model is available, a script coaches instead and the stage shows no model name.

- **Marlow**: A patient counterpuncher: lets the other commit, punishes every whiff.
  - Numbers: Model: Haiku 5.5
- **Juniper**: Speed and pressure: gets in close early and chases off the edge.
  - Numbers: Model: GPT-6 Luna
- **Osric**: A careful zoner: holds long range, chips with pokes and shots.
  - Numbers: Model: Gemini 3.1 Flash Lite
- **Pell**: A grappler: waits for shields, grabs and throws.
  - Numbers: Model: DeepSeek V4.1 Flash
- **Wren**: Studies the opponent and changes plans fast.
  - Numbers: Model: Ministral 8B
- **Brick**: Hits hard and holds the middle, waits for one big launch.
  - Numbers: Model: Qwen 3.7 Flash

### Before you bet

- Both fighters are known before the first window opens. The win rates below were measured before the final balance pass and may change. In 2880 scripted test fights (sim version ringout-sim-6, about 4 points of noise) every fighter won between 45.6% and 55.1% overall: the Wolf 55.1, the Hexer 52.5, the Count 50.4, the Empty Armour 48.9, the Mimic 47.5, the Magpie 45.6.
- Matchups matter more than the fighter. Lopsided in those tests (measured before the final balance pass; may change): the Wolf beats the Magpie 72% of the time, the Hexer beats the Mimic 67%, the Mimic beats the Magpie 64%, the Count beats the Mimic 59%, the Magpie beats the Hexer 58% and the Count 56%. Every other pairing was within 44 to 56%.
- Weight decides how long a fighter lives at high damage: the Magpie (84) and the Hexer (88) fly furthest, the Mimic (120) and the Empty Armour (112) the least.
- Abilities do 30 to 51% of all damage (the Magpie least, the Mimic and the Empty Armour most), so watch who lands them.
- In the windows between lives you see lives and damage. The fighter who just came back starts at 0 damage; the other keeps theirs.
- A fight lasted a median 83 seconds in tests (most between 57 and 118 s). Mirror matches are allowed and showed no side advantage (50.6%).
- All these numbers come from scripted coaches. Live matches are coached by AI models, whose plans can make a fighter play better or worse than the tests.

### Fairness and randomness

- Fighter picks are made at the same time and hidden until both flip together. A pick that does not arrive in time becomes a random fighter.
- The fight's dice come from the seed produced when the first window closes, so the fight does not exist while that bet is open. The stage strike is for show and does not change who wins.
- The AI coaches' plans arrive during the fight and are published in the feed as they are scheduled; a late or broken answer changes nothing (the old plan stays). The fight never waits for a model.
- The windows between lives are not seeded: they are bets on a fight already in progress, with the score in view.
- Ties are settled by the rules: more lives at 3 minutes, then the first knockout in sudden death, then lower damage, and an exact tie by the seed.
- Handicap: once both coaches have played at least 3 matches and their win rates differ by 25 points or more, the favourite starts with extra damage (40 times the gap, from 10 up to 30). The records behind it are kept in memory by the running channel and reset when it restarts.
- If no model can be called (no key, or the $1.50 spending cap is reached), scripted coaches play and the stage shows no model name.
- The fight rules are pinned: a hash of the simulation's code is recorded with the bet.

### Sources

- games/brawl/channel.ts
- games/brawl/src/show/script.ts, events.ts, brains.ts
- games/brawl/src/sim/fighters.ts, engine.ts, arena.ts, types.ts, index.ts (identical to src/sim2)
- games/brawl/src/sim/NOTES.md (round 4b test numbers)
- games/brawl/src/sim2/READY.md
- games/brawl/ROUNDS.md
- games/brawl/bots.json

## Goober Guys (channel `tumbletop`, games/tumbletop)

Read 2026-11-20, about 05:10 to 05:12 CST; corrected about 05:35 CST. Newest files then: progress.json, progress.html, ROUNDS.md 2026-11-20 04:20:22; README.md, ASSETS.md 2026-11-20 04:20:17; web/src/show/sound.js 2026-11-20 04:19:40; REPORT.md 2026-11-20 04:10:35; data/records.json 2026-11-20 04:08:41; show/script.js 2026-11-20 03:18:37; sim/* 2026-11-19 10:02:18 or older.

### What happens

Sixteen contestants from a house roster of 24 race through a toy attic in three rounds: Round One cuts 16 to 8, Round Two cuts 8 to 4, and the Final has one winner. Nobody steers them: every race is a seeded simulation, and each contestant runs on four permanent stats. Viewers bet on who wins the show.

### What you bet on

- Who wins Round One? 16 outcomes, open 40 seconds before the round.
- Who wins Round Two? The 8 still in, open 30 seconds before the round.
- Who wins the Final? The last 4, open 30 seconds before the round.
- On the stream the clock reads "Bets open in", then "Bets close in", then "Bets closed". Each window's close produces the seed that runs the round after it. Each bet is paid when its round ends, on the contestant who crosses the line first.

### How a show works

- **The field**: Before each show the channel picks the 16 of 24 who have run the fewest shows (ties at random), so everyone runs about as often.
  - Numbers: Roster: 24; Run per show: 16; Show length: about 4 and a half minutes
- **Going through**: The first contestants across the line go through; the rest are out. The standings on the stream say "Top 8 go through" or "Top 4 go through", mark "your pick" and "out". After Rounds One and Two the show cuts to a shelf of all sixteen with shutters on those knocked out, then "8 remain" or "4 remain". In the Final the first across wins.
  - Numbers: Round One: 16 start, 8 go through; Round Two: 8 start, 4 go through; The Final: 4 start, 1 wins
- **Falls**: A contestant that falls off drops back in at the last checkpoint it passed. A fall costs a few seconds and some ground, not the round.
  - Numbers: Wait before dropping back in: 1.5 s, shorter with more bounce (longest in the roster 2.04 s); From going off the edge to dropping back in: 1.1 to 2.9 s, typically 2.2 s; Then, before it can move: 0.33 s
- **Catching up**: After the first 4 seconds, a contestant outside the qualifying places pushes: a little more pace and much bolder lines. In the Final everyone but the leader counts as outside the places, and the further behind the leader, the harder it pushes. Leads are not safe.
  - Numbers: Outside the places: +5% pace; Final: a further +18% at 8 m or more behind the leader (+23% in all), less when closer
- **Contact**: A contestant running into another at more than 6 m/s may knock it into a stumble; the chance depends on the barger and on the victim's grip, and above 8.5 m/s the victim is sent sprawling. The boldest grab the one in front, which slows both.
  - Numbers: Who grabs: nerve 7 or more; Grab: slows both for 0.6 s
- **The clock**: Each round has a time limit; if it runs out, the best placed take the open places in order. In 2000 test shows no round ran out of time.
  - Numbers: Round One: 100 s; Round Two: 110 s; The Final: 90 s

### The four stats

Every contestant has speed, grip, bounce and nerve from 2 to 9, adding up to 22. They never change. The stream shows names only; the stats and the one-word best stat (on a tie, the first of speed, grip, bounce, nerve) are the guide's own information, from the game's roster.

- **Speed (best-stat word: Quick)**: Flat-out pace and how fast it gets back up to it. Each round the seed adds a fresh small wobble to top speed, the contestant's form for that round.
  - Numbers: Top speed: 8.8 m/s at 2 to 10.05 m/s at 9 (0.18 m/s per point); Form each round: typically about 0.14 m/s either way, at most about 0.48
  - Tip: The stat that matters most over a whole show: the fastest third won 7.3% of shows entered, the slowest third 5.5% (2000 test shows).
- **Grip (best-stat word: Sure-footed)**: Footing: stays steady on the tipping rulers (less likely to slip off), is thrown less far by a hit and is knocked over less by barges.
  - Numbers: Thrown by a hit: x1.12 at 2 to x0.82 at 9; Knocked over by a barge: x1.25 at 2 to x0.65 at 9
  - Tip: Counts in Round One: Bramble (grip 9) and Pemberton (grip 8) reached Round Two 64% and 62% of the time, Wobble (grip 2) 34%. The other two with grip 8, Dumpling and Turnip, reached it 54.7% and 50.0%.
- **Bounce (best-stat word: Bouncy)**: Bounces back: less time on the floor after a hit and a shorter wait to drop back in after a fall.
  - Numbers: Time down: x1.5 at 2 to x0.5 at 9
- **Nerve (best-stat word: Fearless)**: Takes the bold line: tighter timing at hazards and smaller safety margins, but more misjudged hazards, more grabs (at nerve 7 or more) and barges that knock others over more often. Quicker, and hit more often.
  - Numbers: Hazard timing error: about 0.04 s at nerve 2 to 0.01 s at nerve 9; Chance to misjudge, per decision (several a second): 2% at 2 to 5.5% at 9; about 3% to 5% across the roster (nerve 4 to 8)
  - Tip: Mixed in the test data: the two with nerve 8 (Ziggy, Gherkin) reached the Final 33% and 31% of the time against 25% on average, but the four with nerve 7 reached it only 22.7% to 24.2%.

### The rounds

The tips here are the guide's own, from the game's design notes and the test data; the stream does not show them.

- **Round One: Tops, Marbles and Rulers**: Off the game board, through the spinning tops, up the bookshelf past rolling marbles, and over the tipping rulers.
  - Numbers: Start: 16; Go through: 8; Typical race: 41 s
  - Tip: Grip counts most here.
- **Round Two: Metronomes and the Block Maze**: Across the crayon bridges under swinging metronomes, then through the block maze.
  - Numbers: Start: 8; Go through: 4; Typical race: 35 s
  - Tip: In tests the two with nerve 8 (Ziggy, Gherkin) did well here; nerve 7 did not.
- **The Final: The Block Maze**: The block maze again, then the dash under the giant spinning pencil to the arch.
  - Numbers: Start: 4; Winner: 1; Typical race: 23 s
  - Tip: Speed helps. The blocks decide.

### The obstacles

The obstacles move the same way every race; they use no seed.

- **Game Board Start**: The start grid. No hazards. Round One starts in two rows of eight; the back row stands about 2 m behind.
- **Spinning Top Field**: Five rows of giant spinning tops with paddle arms that knock racers flying. Racers pick the gaps between them; bold ones go straight through.
  - Numbers: Tops: 12; Arm length: 3.2 to 3.9 m
- **Bookshelf Climb**: A 66 m ramp up the book spines with three lanes of giant marbles rolling down it in a staircase pattern: the safe lane is the one whose marble just went by.
  - Numbers: Marbles: 6; Marble size: about 4 m across; Marble speed: 8.4 m/s
- **Ruler Seesaws**: Two rows of tipping rulers over a drop, each guarded by a swinging pencil at its mouth: wait for the swing, then dash onto the tipping plank. Grip keeps a racer on.
  - Numbers: Rulers: 3, then 2; Pencil swing: 2.8 to 3.0 s
- **Metronome Bridges**: Two crayon bridges, each swept by five metronome weights that skim the deck and swing out past its edge.
  - Numbers: Bridges: 2; Weights: 5 per bridge; Weight size: about 3.3 m across; Swing: 2.9 to 3.4 s
- **Alphabet Block Maze**: Five rows of block walls with gaps. Some gaps hold a ram block that rocks back and shoves across, and giant 4 m blocks cartwheel across the corridors between rows, so crossing is a timing call.
  - Numbers: Rows: 5; Ram blocks: 4; Cartwheeling blocks: 8
- **Final Dash**: A ramp up to the arch under a giant pencil spinner: two pencils crossed on a hub, four chest-high arms sweeping the way.
  - Numbers: Spinner reach: 11.2 m; Arms: 4

### The contestants

All 24, with their permanent stats and how they did in 2000 simulated shows (the average is 6.25% wins, 25% Finals and 50% Round Two).

- **Juniper**: Best stat: Quick.
  - Numbers: Speed: 9; Grip: 4; Bounce: 4; Nerve: 5; Won (test shows): 8.3%; Reached the Final: 27.0%; Reached Round Two: 52.1%
- **Noodle**: Best stat: Quick.
  - Numbers: Speed: 8; Grip: 3; Bounce: 6; Nerve: 5; Won (test shows): 9.0%; Reached the Final: 25.6%; Reached Round Two: 45.4%
- **Fizz**: Best stat: Quick.
  - Numbers: Speed: 8; Grip: 4; Bounce: 3; Nerve: 7; Won (test shows): 5.2%; Reached the Final: 24.2%; Reached Round Two: 49.1%
- **Kiwi**: Best stat: Quick.
  - Numbers: Speed: 8; Grip: 5; Bounce: 5; Nerve: 4; Won (test shows): 8.7%; Reached the Final: 26.0%; Reached Round Two: 51.3%
- **Pickle**: Best stat: Quick.
  - Numbers: Speed: 7; Grip: 4; Bounce: 4; Nerve: 7; Won (test shows): 6.3%; Reached the Final: 22.7%; Reached Round Two: 44.5%
- **Sprocket**: Best stat: Quick.
  - Numbers: Speed: 7; Grip: 5; Bounce: 3; Nerve: 7; Won (test shows): 5.1%; Reached the Final: 23.5%; Reached Round Two: 50.2%
- **Pippin**: Best stat: Quick.
  - Numbers: Speed: 7; Grip: 6; Bounce: 5; Nerve: 4; Won (test shows): 7.5%; Reached the Final: 26.9%; Reached Round Two: 55.8%
- **Ziggy**: Best stat: Fearless.
  - Numbers: Speed: 7; Grip: 3; Bounce: 4; Nerve: 8; Won (test shows): 8.2%; Reached the Final: 33.3%; Reached Round Two: 52.4%
- **Marzipan**: Best stat: Fearless.
  - Numbers: Speed: 6; Grip: 5; Bounce: 4; Nerve: 7; Won (test shows): 5.4%; Reached the Final: 23.8%; Reached Round Two: 47.3%
- **Clementine**: Best stat: Sure-footed.
  - Numbers: Speed: 6; Grip: 7; Bounce: 5; Nerve: 4; Won (test shows): 7.3%; Reached the Final: 27.1%; Reached Round Two: 58.2%
- **Wobble**: Best stat: Bouncy.
  - Numbers: Speed: 6; Grip: 2; Bounce: 8; Nerve: 6; Won (test shows): 4.9%; Reached the Final: 18.3%; Reached Round Two: 33.9%
- **Sherbet**: Best stat: Quick.
  - Numbers: Speed: 6; Grip: 4; Bounce: 6; Nerve: 6; Won (test shows): 5.1%; Reached the Final: 22.7%; Reached Round Two: 44.0%
- **Pemberton**: Best stat: Sure-footed.
  - Numbers: Speed: 5; Grip: 8; Bounce: 5; Nerve: 4; Won (test shows): 6.4%; Reached the Final: 27.4%; Reached Round Two: 62.2%
- **Truffle**: Best stat: Sure-footed.
  - Numbers: Speed: 5; Grip: 6; Bounce: 6; Nerve: 5; Won (test shows): 5.8%; Reached the Final: 25.3%; Reached Round Two: 51.2%
- **Crumpet**: Best stat: Sure-footed.
  - Numbers: Speed: 5; Grip: 7; Bounce: 4; Nerve: 6; Won (test shows): 5.9%; Reached the Final: 25.4%; Reached Round Two: 56.2%
- **Gherkin**: Best stat: Fearless.
  - Numbers: Speed: 5; Grip: 4; Bounce: 5; Nerve: 8; Won (test shows): 6.9%; Reached the Final: 31.4%; Reached Round Two: 49.3%
- **Biscuit**: Best stat: Bouncy.
  - Numbers: Speed: 4; Grip: 6; Bounce: 8; Nerve: 4; Won (test shows): 6.4%; Reached the Final: 22.3%; Reached Round Two: 46.4%
- **Bramble**: Best stat: Sure-footed.
  - Numbers: Speed: 4; Grip: 9; Bounce: 5; Nerve: 4; Won (test shows): 5.3%; Reached the Final: 27.1%; Reached Round Two: 64.0%
- **Taffy**: Best stat: Bouncy.
  - Numbers: Speed: 4; Grip: 5; Bounce: 7; Nerve: 6; Won (test shows): 4.6%; Reached the Final: 19.9%; Reached Round Two: 42.5%
- **Boop**: Best stat: Sure-footed.
  - Numbers: Speed: 4; Grip: 6; Bounce: 6; Nerve: 6; Won (test shows): 4.3%; Reached the Final: 22.8%; Reached Round Two: 47.4%
- **Mochi**: Best stat: Bouncy.
  - Numbers: Speed: 4; Grip: 5; Bounce: 9; Nerve: 4; Won (test shows): 6.2%; Reached the Final: 21.2%; Reached Round Two: 39.5%
- **Waffles**: Best stat: Sure-footed.
  - Numbers: Speed: 3; Grip: 7; Bounce: 7; Nerve: 5; Won (test shows): 5.6%; Reached the Final: 26.0%; Reached Round Two: 52.5%
- **Dumpling**: Best stat: Sure-footed.
  - Numbers: Speed: 3; Grip: 8; Bounce: 7; Nerve: 4; Won (test shows): 6.0%; Reached the Final: 25.8%; Reached Round Two: 54.7%
- **Turnip**: Best stat: Sure-footed.
  - Numbers: Speed: 2; Grip: 8; Bounce: 8; Nerve: 4; Won (test shows): 5.5%; Reached the Final: 24.0%; Reached Round Two: 50.0%

### Before you bet

- Upsets are normal: in 2000 test shows the best contestant won 9.0% of the shows it entered and the worst 4.3%, against 6.25% for a pure lottery among 16.
- Speed wins shows: the fastest third won 7.3% of shows entered, the slowest third 5.5%. Noodle, Kiwi, Juniper and Ziggy won most often (8.2 to 9.0%); Boop, Taffy and Wobble least (4.3 to 4.9%).
- Each round rewards something different. Grip helps in Round One (Bramble, Pemberton and Clementine reached Round Two 58 to 64% of the time; Wobble 34%). Ziggy and Gherkin, the two with nerve 8, reached the Final 31 to 33% of the time, though nerve 7 did not help the same way. The Final is short and the blocks decide a lot.
- Later windows have fewer outcomes: before the Final you choose among four, knowing who survived and how.
- A fall is not the end: the faller can move again about 1.4 to 3.2 seconds after going off the edge (typically about 2.5), and contestants outside the places push harder. Still, in the 2000 test shows 35% of Finals were won by more than 22 m (the typical winning gap was 12.9 m).
- The channel keeps each contestant's record and recent form (W won, F reached the Final, 2 out in Round Two, 1 out in Round One); the stream itself does not show them. Stats are the better guide: the races are simulated from them.

### Fairness and randomness

- Which 16 run is decided before the show is announced, by who has run the fewest shows (ties at random). No seed exists yet.
- Each round is simulated only after its window closes, from the seed that close produces. The round does not exist while betting on it is open.
- Stats never change and the obstacles move the same way every race. The seed decides the rest: each contestant's form for the round (a wobble to top speed, drawn again every round), its reaction at the gun, its habits (lane choice, hops, dives at the line), its timing errors and misjudged hazards, whether grabs and barges happen and land, slips on the rulers, and where a faller lands at the checkpoint.
- No AI model plays. The same seed gives the same race, and a hash of the simulation's code is recorded with each window.
- Round One's grid is two rows of eight in the order of the random draw made before the announcement; the back row starts about 2 m behind. Later rounds start in one line.

### Sources

- games/tumbletop/channel.ts
- games/tumbletop/README.md, REPORT.md, ROUNDS.md
- games/tumbletop/show/script.js, records.js
- games/tumbletop/sim/roster.js, rounds.js, ai.js, course.js, sim.js, physics.js
- games/tumbletop/web/src/show/cards.js, raceHud.js; web/src/world/rosterBoard.js (what the stream draws, per the Tumbletop session)
- games/tumbletop/data/checks-2000.json (2000 simulated shows; re-run on the current code by the Tumbletop session on 2026-11-20 with the same results)
- games/tumbletop/data/records.json
- Corrections from the Tumbletop session, 2026-11-20 about 05:30 CST

## Open questions

### Inkelton

1. **The boss's name.** The stage says INKELTON; the verdict line in `src/show/rules.js` still says "killed the Scrivener", and the README and DESIGN still call the game The Scrivener. The guide calls the boss Inkelton.
2. **Boss attack names.** Quill Slash, Ink Lunge, Ledger Slam, Wing Gust, Written Name and Page Storm are internal names (`src/sim/attacks.js` marks them "debug only") and are not shown on the stage. Is it fine to use them in the guide?
3. **The Bookthief's text says "Less health"**, but its health is 112: more than the Duelist (100), the Archivist (90) and the Penitent (95), less than the Warden (125) and the Hexer (115). The guide gives the number and drops "less health".
4. **Slow to Turn's text** ("Cannot strike behind itself, and is weak from behind") leaves out that its hits are 25% stronger (`dmgMul 1.25`). DESIGN.md describes it as "stays open long after it swings", which the code does not do. The guide follows the code.
5. **Comments against code in `src/sim/combat.js`:** Trade Blows is commented as half damage, the code takes 75%; damage while staggered is commented x1.5, the code is x2. The guide uses the code.
6. **DESIGN.md is out of date:** it describes three goes each and three betting windows (one before each go, "How far does X get?"), and a "meant to favour" table for the tempers that differs from the `favours` lists in `loadout.js` (which nothing reads now). The guide follows README, `rules.js` and `script.js`: one go each, one window.
7. **All measured figures are old-format and scripted:** `.cache/sim_report.md` (2026-11-19 08:20) was measured with scripted players over the three-goes format; nothing has been measured with real models or with one go each. Should the guide show these numbers with that caveat, or leave them out until a new batch is run?
8. **Records.** The players' records in `.cache/records.json` (173 matches) are mostly local test matches on scripted players, so the guide does not quote them. The call screen shows each player's record and head to head from that store.

### Blood Moon

1. **The test win rates may change.** The fighter session says a last balance pass is in progress, so the overall range (45.6 to 55.1%) and the matchups (the Wolf against the Magpie 72%, the Hexer against the Mimic 67%, and the rest) are marked "measured before the final balance pass; may change". They need re-reading from `src/sim/NOTES.md` once that pass lands.
2. **The Ward's description is out of date.** The move text in `fighters.ts` says it lies "about 5 s (1.5 m wide)" and roots "for 0.7 s"; the numbers in the same file (round 4b) are 7 s, 2.2 m wide, 1 s, 7 damage. The guide uses the numbers. The "about 5.3 m" throw distance was left out because I could not confirm it from the numbers.
3. **The test numbers are scripted coaches (round 4b, 2880 fights).** Live fights are coached by models. Same question as Inkelton: show them with the caveat, or not?
4. **Records and the handicap reset** whenever the channel process restarts (kept in memory in `channel.ts`). The handicap can therefore only kick in after both coaches have 3 matches in the current run.
5. **Some reach numbers come from the move descriptions** (Collar Fire "about 2.4 m", Bat Swarm "about 2 s to cross"); the rest are computed from the move data.

(Settled since the first draft: the stage strike is for show by design, and the guide says so plainly; the AI coach prompt has been fixed.)

### Goober Guys

1. **What to call the contestants.** The code, README and the race events' text call them "Gumbles", but that word never appears on the stream; the show is "Goober Guys". The guide says "contestants" until you choose a word.
2. **Round tips.** The code (`sim/rounds.js`) carries a hint per round ("Grip counts most here", "Speed and nerve count most here", "Speed helps. The blocks decide."), but the stream does not draw it, and ROUNDS.md (round 4) once recorded different hints. The guide now gives its own tips from the test data: grip for Round One, the two nerve-8 contestants for Round Two (nerve 7 did not help), and the Final's hint kept as a tip. Wording is yours.
3. **Nerve cuts both ways** in the code (tighter timing, but more misjudged hazards, grabs and barges). Over a whole show the high-nerve third did slightly worse than the low-nerve third (5.9% against 6.7%), partly because stats add up to 22. The guide states the mechanism and the mixed result only.
4. **Not confirmed today, so softened in the guide:** the records file is no longer mostly pre-season (it held 205 shows at 04:08, against the 36 simulated pre-season shows it started from), so the guide no longer says it started from the pre-season; "the same race in every viewer's browser" rests on an earlier cross-check (9 of 9 rounds, not re-run today), so the guide now says only "the same seed gives the same race"; the show length (4:34 measured at the real window lengths) is now "about 4 and a half minutes".
5. **The site calls the channel a "Battle royale"** (`web/src/channelInfo.ts`); it is an elimination race show. Not changed here.

(Settled since the first draft: `data/checks-2000.json` is current; the Tumbletop session re-ran the 2000 shows on the current code twice and got the same numbers.)

### Wording choices that are yours

- Whether the guide names the AI models (the stage shows model names; the guide lists them under The players).
- Whether to show test win rates at all, and how to label them ("in test runs", "scripted tests", or hidden).
- Whether the guide uses the game's units (Inkelton's reach in game units, Blood Moon's metres and frames) or only words.
- The section names: "How a match works", "Before you bet", "Fairness and randomness".
