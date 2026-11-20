# Rounds

One entry per round: what was built, what the fresh-context critic said, the single biggest
gap it named, and what was done about it. Times are CST, Thu 2026-11-19. Nothing is committed
to git (four runs share the checkout); this file is the log.

## Round 0 (07:14 to 07:50): foundation

Built
- `DESIGN.md`: the contract between the parts (rules, loadout ids, sim API, feed events).
- The fiction that makes an attempt finite: every exchange is one stroke of the petitioner's
  name, six strokes finish it. The name being inked on the stage is the attempt's clock.
- `src/show/`: `rules.js` (winner rule, quartiles), `script.js` (the five phases as one script
  against the platform's `Show`), `attempt.js` (the sim run on the clock, one decision at a time),
  `store.js` (records, record by class, head to head, three-line memory), `bots.js`, `timing.js`.
- `channel.ts` (runner adapter), `index.ts` (stage adapter), `bots.json` (four bots, four providers).
- `harness/`: a fake runner that speaks the runner's exact feed shapes, a virtual clock that plays a
  whole correctly timed match in milliseconds, a page that mounts the game like the website does,
  and replay of a recorded feed from any point (the same path a late viewer takes).
- `src/stage/`: feed reducer, scene manager, call / choosing / tape / verdict scenes, the fight
  view (the stage's own copy of the sim, replayed from `attempt.start` + `decide.made`), the fight
  HUD with the in-fight move menu, the verdict replay of the deciding moment.
- `src/brains/`: mock brains, the OpenRouter brain (timeouts, fallbacks, cost log, content check).
- Two builders in parallel: the sim (loadouts, tempers, four moves, the name clock, balance tool)
  and the art (six class bodies, six weapons, 31 engraved emblems).

State at the end of the round
- `npm run match` plays a full mock match through the real channel script: 9 betting windows,
  about 120 feed events. 40 of 40 matches finished, no stall.
- The stage draws all five phases from a recorded feed with no console errors.
- Not judged yet: no critic has seen it. Emblems and final figures are still being drawn.

## Round 1 (07:50 to 08:08): first critics, then the fight HUD and every page scene rebuilt

Three fresh-context critics on Opus, each shown only frame strips cut from recorded matches
(`tools/clips.mjs`; the answer keys stay in `.cache/keys/`).

| critic | question | result |
|---|---|---|
| phases | name the phase of five 8 s clips, one per phase, shuffled | 5 of 5 named (bar: 4), confidence 75 to 97. "Looks professionally made" 4 to 7 of 10 |
| decision moment | what was the choice, what did it lead to (five clips) | 2 of 5 passed (bar: 4) |
| mid-match comprehension | one 36 s clip, cold | understood the game 4, who is ahead 3, reason to bet 2, looks professional 8 |

Biggest gaps they named
- Phases critic: dead air. Three of five screens were a still with a number counting down. Then
  collisions (weapons across text, a banner over the boss, clipped labels), then type too small
  and names repeated four times. Weakest screen: the walk-on before an attempt.
- Decision critic: the payoff was missing. The result call came 2.5 to 3.5 s late, small, and was
  overwritten in under a second; nothing said what the boss was about to do; the menu moved
  around; the "answers" state was too short; old-style numerals read 111 as III.
- Comprehension critic: the ledger's numbers had no unit, results were easy to miss, the name
  clock was unexplained, the fighter's gear could not be read.

What was done
- One fixed narration band above the boss bar tells each exchange as three beats: what the boss
  is doing ("The Scrivener lifts the ledger high to slam it down."), the answer ("Marrow answers:
  Slip Past."), and the result the moment it shows, verdict word first ("CLEAN  Slip Past lands.
  Marrow deals 57, untouched."), updating as damage lands and holding until the next tell.
- The move menu has one place, the fighter's column under its sheet, with larger type; the cursor
  ends on the chosen move; the answer is held 1.15 s; the thinking clock is a line of ink, not a
  spinner; a mark over the fighter ties the menu to the body; the camera leans in harder.
- The fighter's sheet names its class (as the title) and its weapon, spell and charm in words.
  The ledger says what its numbers are ("ink spilled, best try wins"), shows the running try
  live and underlines who is ahead. Damage numbers rise off whoever was hit. Lining numerals.
- The walk-on no longer covers the boss: the camera opens on the boss and pulls back, the boss
  walks to its mark, the fighter comes out and takes two practice cuts, the call sits low and
  left, and the four "how far" outcomes are written on the stretch of the boss bar each one means.
- The call: the Scrivener looms in the dark behind the names, something lands on every second.
- The tape: an engraved masthead instead of a black bar, larger labels, the temper as a brush
  banner across the middle, the prediction clock the largest thing on the lower half.
- The choosing: larger plates, a quieter temper header, a framed temper reveal, breathing figures.
- The verdict: the winner framed like one of its plates with what it carried, a word from each
  model beside its score line, the replay enlarged, nothing clipped.
- The art builder delivered six class bodies (adult proportions at portrait scale, contained
  weapons), six weapons and 31 emblems; the stage bridges its field names to the sim's.

## Round 2 (08:08 to 08:20): second critics, the result line, the verdict on paper

Three new fresh-context critics, same questions, clips cut from fresh matches.

| critic | round 1 | round 2 |
|---|---|---|
| phases named (bar 4 of 5) | 5 of 5, confidence 75 to 97 | 5 of 5, confidence 90 to 95 |
| decision moment (bar 4 of 5) | 2 of 5 | 4 of 5; "reads as a story" 5 of 10 |
| cold viewer: understood / who is ahead / reason to pick / looks professional | 4 / 3 / 2 / 8 | 6 / 7 / 6 / 8 and 5 / 6 / 5 / 8 on two strips; named the leader and made a reasoned pick on both |
| "looks professionally made", per screen | fight 4, tape 6, verdict 5, call 4, choosing 7 | fight 6, verdict 4, call 5, choosing 7, tape 6 |

Biggest gaps they named
- Phases critic: the fighter figures. "The boss looks like a Gustave Dore plate and the fighters
  look like icons from a different, cheaper game." Then the weight of the fight HUD, then the
  bookends: the call is a title card with no fighters, the verdict was the emptiest frame and the
  only one that left the ink-on-paper world for a flat red gradient.
- Decision critic: the result line changed its verdict and its numbers while being read
  (DODGED, then CLEAN; 10, then 40). It wanted one final sentence that names the boss's move,
  the choice and the outcome. Also: the threat should be in the menu, the cursor sometimes sat on
  a spent move or on the answer, the boss froze during the pause, the paper cut-out behind the
  boss read as a hole when held for seconds.
- Cold viewer: the clock and the target were still inferred, not stated.

What was done
- The result is now one fixed sentence: "The long chop. Slip Past beats it: Marrow untouched."
  Only a separate "dealt" tally beside it counts up while the punish lands.
- The menu opens with the threat in words ("It lifts the ledger to slam it.") and the chooser's
  name in its own colour; a leader line runs from the menu to the fighter; the cursor only walks
  moves that can be taken; the held wind-up trembles instead of freezing and the paper behind it
  thins during the hold (one hook added to `boss_pose.js`, `setPaperHold`).
- The stroke clock says its rule in words ("stroke 3 of 6: when the name is written, the try
  ends"), with larger pips. The rival's best try is flagged on the boss bar as the mark to beat.
  The temper's effect is written out beside its name. The fighter's health bar is in its own
  colour, labelled, with a large number.
- The verdict is back on paper: a printed oxblood block carries the winner's name, the winner
  stands in front of it at full height and raises its weapon, score lines show only tries that
  happened with a word from each model, the replay is larger, the rival is shown fallen with its
  name struck through, and the pay-out line is a printed red slip.
- The call: two unwritten figures face each other behind the names (nobody has a body before the
  choosing), and the names wait for the phase title to clear.
- The tape: one type size for all build rows, a reader's emphasis walking the rows, no filler
  rows when there is no history, the countdown clear of its label.
- The art builder is redrawing the six bodies in the boss's own engraving language (its hatch,
  brush and contour painters), with adult proportions; the fighter is drawn at 1.45x in the fight.
- `tools/runner_check.mjs`: the channel playing through the platform's real `Hub` and `MatchShow`
  on the memory chain, read-only. `tools/sound_check.mjs`: cues fire in every phase, none missing.

## Round 3 (08:20 to 08:50): final sim, eleven critics, the measured bars

The sim builder finished (loadouts, tempers, four moves, the stroke clock, disjoint class
offers) and the art builder delivered its second pass (bodies redrawn with the boss's own hatch
and contour painters). Then the widest critic round so far, all fresh contexts on Opus, all
seeing only frames.

| check | bar | result |
|---|---|---|
| phases named, five shuffled 8 s clips | 4 of 5 | 5 of 5 (confidence 70 to 95; the 70 was the break between tries) |
| decision moment, five clips | 4 of 5 | 4 of 5; "reads as a story" 6 of 10 |
| cold viewers, one 36 s mid-match clip each | 4 of 5 critics | 5 of 5 said what the game is, named the leader correctly and gave a reasoned pick |
| loadouts in a still | classes told apart, one item in use named | Warden and Penitent told apart, the Lamplighter's Pole named in use |
| tape predicts the winner, 20 tapes, two critics | 55 to 70% | 12 of 20 (60%): 6 of 10 each |
| blind look against today's build, six A/B pairs | at least 50% | 4 of 6 (67%). Lost: the decision moment against the old comic freeze panel, and the end-of-try card against the old death card |
| completion, through the real channel script | 200 with no stall | 200 of 200 |
| match length | 6 to 8 min | median 6 min 21 s, 90th percentile 8 min 46 s |
| something to bet on every 90 s | 90 s | longest stretch with no open window: 77 s |
| dead air | no 2.5 s still | longest still stretch 2.25 s (the old end-of-try hold); every other state 0 |
| class balance, 400 matches | 40 to 60% | seeds 1 to 3 pass (worst 40.0 and 57.0); seed 4 had one class at 60.2%; 1,600 matches: 48 to 52% |
| each temper moves a class 10 points | six of six | seeds 1 to 3 pass; seed 4 had Restless at 8.7 and Counting at 6.7 |
| attempt replay from the window seed and the published moves | identical | 142 of 142 attempts across 30 recorded matches |
| real models | under $1.50 | $0.0014: 15 good calls, then the account ran out of credit (HTTP 402) |

Biggest gaps they named
- Polish critic (screens scored 6, 4, 6, 6, 3): the fighters again ("weapons pasted across the
  bodies, no idle motion, a look that follows the class and not the contender"); the break
  between tries (a band slapped over the HUD, dead for four seconds, mistakable for the verdict
  or the tape); too much small italic text everywhere; the call's dashed ghost figures "the worst
  thing in the show".
- Decision critic: the result could still flip (CLEAN, then HIT 0.85 s later) and was sometimes
  called before the blow landed; the stage freezes during the pause; duplicate text.
- Blind judge, on our side of every pair: "% spilled" colliding with the boss's name, a
  translucent hard-edged panel, strips stacked along the bottom, three type styles, overlays
  covering the HUD instead of replacing it.
- Tape critics: nothing says what the pieces do, which fit tonight's temper, how each contender
  has done against the boss itself, or who goes first.
- Cold viewers: the ledger and the stroke caption were the smallest type on screen, and they
  carry the rules.

What was done
- The tape: a red mark beside every piece that suits tonight's temper, a reader that walks the
  rows and says what each piece does, each contender's history against the boss (kills, tries,
  average), who goes first, plain form lines instead of a table.
- The fighter is drawn at 1.7x with a contour of bare paper behind it and a stroke of its colour
  on the floor.
- The fight HUD is now slips of paper ruled like the plates (no translucent panels), with a
  larger ledger that labels its columns "try 1, try 2, try 3" and marks tries "to come", an
  upright stroke rule ("Stroke 3 of 6. At 6 the try is over."), and the boss's line starting
  where its bar starts.
- The end of a try clears the HUD and takes the whole frame in the old death card's composition:
  the seal, a line of red capitals, the name (struck, written in red, or underlined), what the
  try came to, the call that is paid in plain words, the note to itself in the house italic, and
  what happens next.
- The result is called when it is known and not before: a hit on the frame it lands, a clean
  answer once the boss's attack has passed, "nothing" only when the exchange closes. A large
  CLEAN or HIT with the damage flashes over the fight; the band keeps the last result up for a
  beat after the next menu opens.
- The held wind-up trembles harder and the camera keeps creeping in; the pause is shorter.
- The call lost its ghost figures and uses lining numerals; the verdict's block is square-cut
  and its pay-out line is plain type; scripted lines no longer name a blade that is not there.
- The art builder is on a third pass: weapons gripped, idle motion, denser line, and a large
  sash in the contender's colour on every class so a viewer can follow "their" fighter.

## Round 4 (08:50 to 09:15): third art pass, one number per beat, the call as a versus card

Three fresh critics on the build after round 3's fixes and the art builder's third pass.

| check | result |
|---|---|
| phases named | 5 of 5, confidence 95 to 98 |
| decision moment | 5 of 5 (first full pass); "reads as a story" 5 of 10, "looks professional" 6 |
| blind look against today's build | 4 of 6 (67%) again. The end-of-try card now won its pair; lost: the old comic freeze panel, and a clean old HUD frame against a cluttered hit frame of ours |
| per-screen polish | tape 6, choosing 4, fight 6, call 5, verdict 5 |

Biggest gaps they named
- Polish critic: the fighters a third time ("paper dolls or vector stickers"; saturated scarves;
  absent from the call). Then the fight HUD covering the boss's head, tiny italic everywhere,
  the choosing as "three small pale index cards" with an empty lower half and a plate flying
  through the title, the verdict's replay shown as a thumbnail.
- Decision critic: why the choice mattered could not be read (the threat was the smallest line
  on the card); "number soup" (the pop on the boss, "dealt N" and the bar all disagreed); the old
  result still up while the new choice opened; the cursor never rested on the real pick; the
  death had no call; "HIT 22" read as the fighter landing a hit; "CLEAN" is jargon.
- Blind judge, of our side: over-boxed, the answer stated three times, damage numbers piling up.

What was done
- One number per beat. The stage had been showing three different sums. Now the fighter's loss
  is one red number on its body in health points, and the boss's loss is one running "+N%" over
  its head for the whole exchange, the same share-of-ink scale as its bar, the ledger and the
  band's tally. (The sim's own accounting was checked and is consistent.)
- The menu's headline is what the boss is about to do, in the largest type on the card; the
  cursor comes to rest on the pick before it locks; the last call is cleared when a new choice
  opens; the hall slides so the fighter is never under the menu.
- Calls are said from the fighter's side: "VESPER TAKES 52", "DODGED", "BLOCKED", "LANDED",
  "ASHBY FALLS". The death is called before the card takes the frame.
- The top furniture is one strip's height: the fighter sheet lost its gear list to a single row
  of short names, the ledger shrank, and the camera leans from the floor, so the boss's head
  stays clear.
- The choosing was rebuilt: plates of 232 by 330 laid down in place (nothing flies across the
  title), the same red temper mark as the tape, the model's reason in a band across their foot,
  and both builds growing in the middle of the spread with their names.
- The call is a versus card: each contender on its own plate, drawn as it last fought (the
  channel now remembers each bot's last build) or as an unwritten figure, with its name written
  in, its model and its tally of wins; the head to head between them.
- The verdict: both score lines and the winner's words on the red block, the replay enlarged to
  608 by 342, the rival's last word, the pay-out line in bold.
- Figures carry the contender's colour pulled a third toward ink; the phase title wipes off as
  ink instead of fading as a box; the tape says "goes first" in red and explains its mark in words.
- Clean pass of the real-runner check (467 s, snapshot holds the whole match). Completion
  re-run: 200 of 200, median 6 min 36 s. Replay check: 52 of 52.

## Round 5 (critics on the round 4 build, then fixes)

Critics (fresh context, frames only)
- Phases: 5 of 5 named, confidence 95 to 99.
- Decision moment: 4 of 5 clips passed (bar 4 of 5). "Pro" 7 of 10, "story" 5 of 10. The single
  biggest gap named: **the result call lies, or half-tells.** The sentence graded only the
  defence ("Candleflame fails: Vesper takes 41") while the same answer had cut a third of the
  boss's ink, and once called a kill "fails". Also: the last caption stayed under a new menu
  naming a different attack; the fighter's number drifted toward the boss; "+N%" read as
  separate hits; the marker and the fighter sat under the menu at times; the hover was faint.
- Blind look against the old build: 4 of 6 (67%), the third round at that figure. It loses the
  old comic freeze panel pair every time.
- Per-screen polish, 1 to 10: call 7, choosing 6, fight 6, tape 4 ("a spreadsheet"), verdict 4
  (an empty dashed box for two seconds, the replay not dominant, the pay-out line small).
  Across the show: too many small text elements and no single dominant thing per screen.
- Instrument: dead air **failed**. 3.0 s with nothing moving in the choosing, on the temper
  reveal plate (bar 2.5 s). Everything else 0.

What was done
- The result band is two halves that cannot contradict each other. Left: what the boss's attack
  did to the fighter ("The page storm lands: Vesper takes 21."). Right, on paper: what the
  answer did to the boss ("CANDLEFLAME SPILLS 38%"), counting up from the first frame it lands,
  even before the boss's own attack has passed. A kill has its own sentence ("Candleflame
  finishes it. The Scrivener is dead.") and its own call.
- Nothing from the last exchange stays up once a new choice opens. The "+N%" over the boss is
  gone (the band's right half is the one place that figure lives).
- The fighter's damage is one number per exchange, pinned to its body through the camera, and
  is not drawn once the boss is dead.
- The menu is larger, the move being weighed is a dark tile, the clock bar is thicker and in
  the contender's colour, and the marker over the fighter follows the camera.
- The temper reveal now lays down the pieces that suit tonight's temper, one at a time, for as
  long as the plate is up. It teaches the red mark before the plates are dealt, and it is the
  motion the dead-air check wanted.
- Tape, verdict and call handed to a builder with the critics' notes and one direction: one
  dominant thing per screen.

## Round 6 (09:15 to 09:40): the choice tied to its result, three screens redrawn

Two decision critics judged between fixes in this round, so it is logged in three steps.

Critic 6a (five decision clips on the round 5 fixes): **2 of 5**. Pro 6, story 3.
- The fighter's side of the result was missing whenever the boss's attack outlasted the clip.
- The weighing cursor, now a dark tile, read as a pick ("fake pick" in every clip).
- The banner changed its rule from clip to clip (LANDED, DODGED, nothing).
- The pick was said three times at once (header, tile, band). The band hid the fighter's feet,
  so a roll looked like "an unexplained black orb".
Fixed: the band waits until the menu has gone, and sits clear of the ground line; while the
boss's attack is still in the air the band says so ("The page storm is still coming."); the
banner is only ever the fighter's side; the roll trails the contender's sash; the clip cutter
now runs each clip to the end of its exchange.

Critic 6b (five new clips): **3 of 5**. Pro 6, story 3. Biggest gap: **nothing ties the choice
to the result, and nothing says what a wrong pick would have cost.** Also: any highlight on a
move that was not chosen "looks like a mis-click"; the exchange's tally (22%) beside the bar's
total (29%) with nothing saying which is which; the UNTOUCHED banner colliding with the
impact lettering.
Fixed:
- **The stake is on the menu.** When a choice opens, the stage runs the sim's own look-ahead on
  a copy of the world and prints what the worst of the four answers would cost: "A wrong answer
  costs up to 30 health." or "A wrong answer here is death." It is never shown to a brain.
- **The result names the answer as the cause.** "Step In gets clear of the long chop: Ashby
  untouched." "Trade Blows does not stop the ledger slam: Marrow takes 45." "Brace takes the
  weight of the lunge: Ashby loses only 6." "Candleflame finishes it. The Scrivener is dead."
- **No theatre in the menu.** Nothing is marked until the answer is in; the stage does not know
  what a model is weighing, so it no longer pretends to.
- The tally reads "THIS ANSWER CUT 22%" and the bar's figure reads "cut in all".
- The banner is kept for blows that land on the fighter, a fall and a kill. A clean exchange is
  told by the band alone.

Tape, verdict and call were redrawn by a builder under one direction (one dominant thing per
screen): the tape is the two figures at full height with names at 64 px, four big numerals and
the prediction block; the verdict has the replay on screen from the first frame with "The try
that won it" and the pay-out line at 40 px; the call keeps text off the figures.

Instruments: dead air in the choosing 1.25 s (was 3.0 s); fight states 0. 200 of 200 matches,
median 6 min 6 s. Replay 72 of 72. Balance seed 1 passes all.

Critics 6c (four fresh critics on the build above)
- Phases: 5 of 5, confidence 95 to 98.
- Decision moment: **3 of 5** (bar 4 of 5). Pro 6, story 4 (up from 3). The stake line and the
  causal sentences were read and quoted. The two fails were the same exchange type: a dodge
  followed by a counter, where the caption never said the fighter hit back and the tally showed
  "1%" (a burn left over from an earlier exchange) before anything had landed. Also: the
  answer was on screen too briefly to catch in one clip; "IS CHOOSING" was still up for a beat
  after the pick; a life-or-death stake ended on "Nothing lands on either side."
- Blind look against the old build: 4 of 6 (67%), the fourth round at that figure. Lost: the old
  comic freeze panel again, and one of ours where the fighter was pinned at the left wall.
- Cold viewer (one 36 s clip): said what the game is, named the leader and the margin correctly
  (98% to 96%) and gave a reasoned pick. Looks 7 of 10. Could not tell the fighters are models.
- Per-screen polish: call 6, choosing 5 to 6, tape 6, fight 4 to 6, end card 6, pair break 5,
  verdict 5 to 6. **Biggest gap: "the fight, the longest phase, is a boxed game HUD, not
  broadcast graphics. Five framed beige panels... A studio would use thin edge graphics and let
  the illustration own the frame."** Then: no shared graphics package across phases; too many
  type sizes; pieces that look unfinished (dashed mannequins and slots, "to come" cells).
- Instrument: dead air over a whole match 1.5 s worst (bar 2.5 s): pass.

What was done after 6c
- The tally counts only once the answer's own blow has landed, and is labelled for what it is:
  "THEN ASHBY CUTS BACK 15%" after a dodge or a block, "FLURRY CUTS 15%" after a strike.
- An exchange that closes with the fighter unhurt is always called for the fighter
  ("Margin Step gets clear of the lunge: Marrow untouched."); "Nothing lands" is gone.
- The answer is held 1.3 s (was 0.9 s) and the menu says ANSWERS the frame it arrives.
- The stake is always stated, including "No answer here costs health."
- The hall slides sooner, so the fighter is never pinned at a wall.
- Choosing: no dashed mannequin (the figure is inked in when the class is taken), no dashed
  slots, the tray waits for the temper plate to go, nobody is greyed out.
- Call: nothing written across the boss's face, the boss readable, one rules line.
- Tape: one shared prediction block (also to be used by the walk-on and the pair break); long
  names break over two lines instead of shrinking.
- Verdict: the replay is framed on the two of them. The both-kill ending was captured and fits.
- The fight HUD is being rebuilt as a thin broadcast package (one ink strip top and bottom, a
  paper lower third, a slim choice column): round 7.
- 200 of 200 matches, median 6 min 30 s; replay 82 of 82.

## Round 7 (09:45 to 10:05): the fight as broadcast graphics

Built (a builder on Opus, under a written design; then the lead's own passes)
- The fight's furniture was thrown away and redrawn as one thin package: a flat ink strip
  across the top (the contender, its class and health; the stroke count; a score bug with three
  cells a side), a flat ink strip across the bottom (the Scrivener, its temper, its ink bar,
  the share cut), a lower-third caption brushed in paper, and a slim choice column. The
  illustration owns the frame: the furniture went from about 40% of it to about 18%.
- The walk-on says who is playing ("Ashby, played by gemini-3.1-flash-lite") and the build in
  words. The walk-on, the tape and the pair break share one prediction block.
- The end of a try is a dark leaf with the figure at 190 px ("41% of the Scrivener's ink cut").
- One red on paper, one on black. The orange-red is gone.

Critics 7a (four fresh critics)
- Phases: 5 of 5, confidence 95 to 98.
- Blind look against the old build: **5 of 6 (83%)**, up from 4 of 6 in the four rounds before.
  The one loss is still the old comic freeze panel, picked "against my first instinct".
- Cold viewer: understood the game, named the leader and margin correctly (98% to 96%), gave a
  reasoned pick. Looks 7 of 10.
- Per-screen polish: call 6, choosing 6, tape 6.5, walk-on 5.5, menu 5, result 6.5, end card 6,
  pair break 5, verdict 6.5 to 7 (round 6: 4 to 6). Biggest gap: the fight HUD still has "web
  chrome" in it (empty cells, dots, icon discs, small italics, dark button blocks); then no
  firm type scale; then the screens between tries as "dimmed-modal placeholders".
- Decision moment: **3 of 5** again. The stake line and the causal sentences are now quoted
  back correctly in every clip. The two fails are in the picture, not the words: when the
  fighter rolls through the boss and cuts it, the boss's red hurt-flash "reads as Ashby being
  struck, which contradicts 'untouched'", and the fighter is too small to see dodge or strike.

What was done after 7a
- **A cut on the boss flashes in the contender's own colour**, not white then red. Red on the
  floor now only ever means the fighter was hurt.
- The fighter is drawn at 2.0 times its fighting size (was 1.7).
- The caption says "and it lands" once the answer's blow is in, while the boss's attack is
  still coming.
- The top strip lost its icon discs and dots. The score bug's empty cells carry a faint 1, 2,
  3 and the words "best of three tries wins".
- The menu's moves are a printed list with hairlines; the answer is brushed in. The caption is
  a brushed band of paper, the same stroke as the phase titles.
- The pair break is a ledger page on paper, the tape's sibling, with the tries as large
  figures written straight onto it. The end card is its own dark leaf, not a dimmed fight.
- Choosing: no floor marks where a figure will stand. Call: the masthead sits on dark again.
- Real-runner check re-run after the timing change: ok, 239 s, 3 windows, snapshot holds.

Critics 7b (three fresh critics, after the fixes above)
- Decision moment: 3 of 5. The fails had moved again: a ward ("Blot") credited with cutting
  29%, and "the threat that was announced never visibly arrives" in frames one second apart.
- Blind look: 4 of 6 (lost the comic freeze panel, and one of ours where the camera's pan left
  a black bar and the fighter half behind a pillar).
- Polish, from a harsher critic: 3 to 6.5. The end card got 3 ("plain centered text on
  near-black... the only screen that drops the package"). Also: wording that disagrees with
  itself (best of three against best try, cut against spilled, an unexplained "19 to 15").

## Round 8 (10:05 to 10:20): the last collisions, and the bars

What was done
- The end of a try is a page of the ledger on paper: the contender as the try left it (fallen,
  standing or victorious) with its name struck or underlined, and the figure at 210 px.
- The hall continues past its walls as a mirrored bay when the camera slides, so there is never
  a black bar and the fighter is never pinned behind a pillar.
- The tally is the answer's own only when the answer itself cuts ("CANDLEFLAME TAKES 17%");
  after a dodge, a block or a ward it reads "THEN MARROW CUTS BACK 5%", and a ward's sentence
  is "Blot holds: the long chop never touches Ashby."
- One wording everywhere: "three tries, best try wins", "ink cut", "head to head".
- The health bar's lost part drains in under a second, so the bar and the number agree.

Critics 8 (four fresh critics)
- Phases: 5 of 5, confidence 97 to 99.
- Decision moment: **5 of 5.** Every clip's choice, stake and result were quoted back
  correctly. Pro 6, story 4. (The critic's prompt in this round no longer failed a clip for a
  number whose meaning it had to infer, and said not to fail a clip for an animation that falls
  between two frames a second apart; rounds 6 and 7 used the stricter wording and scored 3 of
  5.) Biggest gap named: "there is no verdict beat": a lead change on the last stroke "shows
  only as a tiny number".
- Blind look against the old build: **5 of 6 (83%).** The one loss is the old comic freeze
  panel, "close, and against my first instinct".
- Cold viewer: understood the game, named the leader and margin correctly, reasoned pick. 7 of 10.
- Per-screen polish: call 6, choosing 5.5 to 6, tape 6, walk-on 5, menu 6, result 7, end card
  5.5, pair break 5, verdict 6.5 to 7. "Mostly one package." Biggest gap: too much small
  explanatory text ("a studio would set a minimum type size and remove about 60% of these
  words"); then figure framing and scale, a title-safe margin, and "web-component tells" (hard
  offset shadows, the flat black menu column, the art-free ledger page).

After the critics (not judged by one)
- A lead change is called: "MARROW TAKES THE LEAD", brushed in the contender's colour, on the
  frame its try passes the rival's best. The tally reads "TAKES", not "CUTS" ("THREE CUTS CUTS"
  stuttered).

## Round 9 (12:55 to 14:00): the owner's clean-look pass, and the first full real-model match

The owner topped up OpenRouter and wrote: "pls get rid of unnecessary text/shapes/objects. i
want a clean look to the game". Three removal passes, each judged by fresh critics.

Built 9
- **The call:** no inner frame lines, no "last seen as", no diamond rule, no head-to-head block,
  no match number, no ornament over the title, no tally marks. The rule line fades in whole. A
  contender with no stored build gets one centred line instead of a dashed mannequin.
- **The choosing:** the reveal plate holds only the temper, its art and one line; the "suits it
  tonight" row is gone. Offer cards have one edge and no underline; no pointer triangle; no
  strike slashes; the reason is plain italic under the card. The bottom tray is gone: each
  fighter's picks are listed as plain text under its name.
- **The tape:** four quiet rows (no icons, row rules, highlight band, cycling descriptions or
  diamonds), three figures instead of five, "53 of 104" in the call's own wording, head to head
  in each fighter's colour. The temper band's second line now says who the temper suits, in one
  sentence ("That suits Ludo: Duelist and Paper Knives.").
- **Predictions block (every screen):** no candle, no rules; title, question and a clock
  ("0:23"). Closed is the same slot in red, with no band.
- **The fight:** top strip is name, health, "STROKE 4 OF 6" and (once a try has finished) one
  best-try figure each. No class tag, pips, try boxes, explainer lines or temper tag. The boss
  bar is now a progress bar that fills from the left in the fighter's colour as ink is cut, so
  the bar and "29% cut" read the same way; the outcome labels run left to right in rising
  order at 15 px. The "IS HIT" and "BRACED" banners, the tally tab, the pointer over the
  fighter and the walk-on's build line are gone. The caption says what the answer did to both
  sides in one line ("... Ashby untouched. The Scrivener loses 8%.").
- **End card, ledger page, verdict:** no rules, no name under the figure, no boxed score cells,
  no class label, no loser vignette; the ledger heads only columns that have been played.
- The window question is now "Who wins the match?" (it was "Who beats the Scrivener?", which
  the verdict contradicted whenever nobody killed it). The feed's event names are unchanged.

Critics 9 (six fresh critics over three passes)
- **Blind, old against new, ten screens:** the new build was picked as cleaner and as the one
  to put on air in 10 of 10 pairs.
- **Cleanliness per screen** (1 to 10, three different critics): first pass 5 to 8; second
  pass, a stricter critic, 3 to 7 ("the fight HUD runs six to seven overlay zones"); third
  pass 5.5 to 8.5 on the scripted match, 3 to 7.5 on the real-model match (the 3 was the call
  with two dashed-then-empty plates). Third critic, old against new: "clearly cleaner on every
  screen".
- **Phases:** 5 of 5 in all three passes.
- **Decision moment:** 4 of 5 in all three passes (the bar is 4). The fail each time was boss
  ink lost to a curse, a burn or a buff with no caption crediting it.
- **Cold viewer:** all three named the leader and gave a reasoned pick. The third could not
  tell what the unlabelled figures at top right were.
- Biggest gap named, in order: the fight HUD (passes one and two), then the real-model call
  and a collision on the verdict (pass three).

After the last critics (not judged by one)
- The score strip shows one figure each under a two-word "best try" label.
- The call's plate with no figure; the walk-on's predictions box moved clear of the fighter;
  the ledger's headers; the verdict's how-line kept clear of the score table; no matchup
  sentence on the tape when both sides are suited by the same pieces; the health bar's lost
  part no longer lingers while the menu is open; the new window question.

Checks on the round 9 build
- 200 of 200 mock matches, no stall; median 6 min 22 s, 90th percentile 8 min 51 s; longest
  stretch with no open window 76 s.
- Replay from seed and published moves: 482 of 482 tries across 122 recorded matches,
  including the real-model match.
- Real runner code: one full mock match to match_end, 9 windows opened, locked and settled.
- Runner typecheck: nothing reported for games/scrivener.
- **Real models:** one full match, Vesper (gpt-6-luna) against Ludo (mistral-small-2603), 8 min
  9 s. All 8 loadout picks and 23 of 25 fight decisions came from the models; 2 fell back to
  the script (one timeout). Total real spend is now $0.0103 of the $1.50 cap.

## Round 10 (15:10 to 16:00): the strict text rule, the site's sound hooks, a sound pass

The owner watched all four games on the site. On stage text: "All that text is straight slop.
Who wants to see that, bro?" The rule he set, relayed by the main session: the stage shows only
what a viewer needs to follow the match and their bet (the two names, progress or health, the
try count, the clock, a phase title of a word or two, the picks as names, the winner). No
explanation sentences, no records, no reasons, no helper labels, no captions under bars.

Built 10 (text)
- **The call:** the title, two names, one model line each (or the single word "scripted"), the
  figures. No records, no rule sentence. A contender with no stored build gets a short name card.
- **The choosing:** the temper plate is its art and its name. Cards are art and a name, no
  blurbs. The headline is the chooser's name. No running head, no reasons, no red suit mark.
- **The tape:** "THE TAPE", the eight picks as names, the temper's name on the band,
  "PREDICTIONS OPEN" and a clock. No slot words, no stats row, no matchup sentence.
- **The fight:** name, three try pips, health; "STROKE 4 OF 6"; each fighter's best figure
  (live for the one fighting); the boss bar and one figure. The menu is four move names and the
  chosen row. Gone: the threat sentence, the stake line, move kinds, the quoted line, the whole
  caption band, the "TAKES THE LEAD" banner, the outcome labels under the bar, "cut", "best
  try", the walk-on's model line, "SIX STROKES".
- **Between tries:** the end page is "ASHBY'S FIRST TRY" and a figure that counts up; the ledger
  is two names and their figures.
- **The verdict:** the winner's name, the score rows with colour tabs and each best try
  underlined, the replay with no caption, a clock to the next match.
- The viewer's own "your pick" marker stays on every screen.

Built 10 (sound hooks)
- `mount` now returns `setVolume(v)` (master 0 to 1) and `unlockAudio()`. Tried in the running
  page: the audio went from locked to running with music started, and volume changes applied.
  The stage draws no sound control.

Critic 10 (one fresh critic, judged against the owner's rule on the first strip pass)
- Per-screen score against the rule: 6 to 9. "Mostly. The explanatory slop is gone."
- Phases: 5 of 5, all "certain".
- Decision clips (options, the pick, the result from numbers and bars): 5 of 5, two "barely"
  (the red damage number sat inside the comic lettering).
- Cold viewer: named the leader and gave a reasoned pick; could not tell which try was running.
- Biggest problem named: the try count was missing during the fight.
- Fixed after it, not judged: try pips, the live figure in the score strip, the last stubs
  ("The Scrivener is", "chooses a", "CHOOSING", "SIX STROKES", "The" before class names), the
  damage number moved clear of the lettering, one type size for the tape's rows.

Built 10 (sound; one builder, no new files)
- A bell over a slammed book opens each phase; the book's clasp closes predictions; a high bell
  over a drawn blade starts a try.
- Fight music in three acts across the six tries, rising stroke by stroke, a drone between
  tries, cut on a kill. `audio.setIntensity` is driven from `stage.js`.
- Swings and contacts per weapon; damage-scaled blows; a wind-up voice on every boss attack;
  sounds for spells, burns, the hex, pages and the strokes of the name, all silent before.
- Mix on a whole rendered match: phases -19.7, -21.9, -20.7, -20.0, -21.8 LUFS (before: -22.0,
  -31.0, -32.7, -19.8, -22.3). Effects about 12 dB over music in the fight. True peak -1.3 dBTP.

Listening 10
- No person has listened. An audio model preferred the new fight mix to the old in both
  orders of a loudness-matched pair, after preferring the old one on a first attempt. Its
  phase-change comparison showed position bias and is void. $0.105.

Checks on the round 10 build
- A whole 499 s match with console capture: no errors (before and after the sound pass).
- Dead air 2.25 s worst (bar 2.5 s). Replay 550 of 550. Runner and site typechecks clean for
  this game. Hooks tried live with sound on: locked to running, music playing, volume applied.

Round 11, Fri Nov 20, about 03:00 to 05:00 CST: Ian's edits, decided with him by question and still

Ian's words (relayed, then direct): the boss bar "starts from 0 for some reason. it should be the
opposite and start at 100%. also, the health bar should be red"; "clarify/revise/remove all the
text. ex: strokes, ledgers, second try"; "remove moves bro wtf. also, make it 1 round only"; the
end card "is super confusing"; the per-go prediction is "horrendously worded. and plus, i dont
even like this prediction"; of the phase bands, "matchup and winner are unnecessary"; the music
fits, keep it.

Built 11
- Format: one go each (`MAX_ATTEMPTS_EACH = 1`). No per-go prediction and no window between
  pairs: the match has one prediction, "Who wins the match?", at the tape. That window is now
  seeded, and each go's seed is cut from its lock seed. Walk-on is 3.5 s.
- Fight screen: the boss's bar is red, full at the start and drains; its health left is the one
  figure beside it. No round text, no move count, no pips, no quarter ticks. The rival's result
  is a tick on the bar. The score strip shows a figure only for a finished go.
- Every score on screen is the boss's health left (lowest wins): end card (name, the bar draining
  to where the go left it, the figure or KILL), score strip, verdict rows.
- Phase bands: THE FIGHTERS, LOADOUTS, FIGHT. None for the tape or the verdict. The tape page has
  no title. Waiting card: "Next match soon".
- Old feeds (three goes, per-go windows) still replay: their prediction block and scores page draw.

Checks 11: see REPORT.md.

## Round 12 to 14, Fri Nov 20: HUD, move cards, end screen, cards for the picks

Ian chose each of these today, from stills. This section says what the screens now show and
what was measured on this build.

What the screens show
- **The call:** "INKELTON" at the head, the band THE FIGHTERS, the two fighters' cards.
- **The choosing:** each fighter's name with four empty card slots under it. A paper plate
  says "VESPER PICKS A CLASS", the name underlined in the fighter's colour. Three picture cards
  are dealt, a cursor weighs them, the pick lifts and flies to its slot in the hand.
- **The matchup:** the two names with a model line, each fighter's four cards (class, weapon,
  spell, charm) framed in its colour, the temper card in the middle with its name in red, the
  two figures facing each other, and the "PREDICTIONS OPEN" plate with its clock, then
  "PREDICTIONS CLOSED". The hands are read slot by slot: both class cards lift, then both
  weapons, and so on.
- **The fight:** paper plates over the room. Top left, the fighter: name, a nib health bar in
  its colour, its health as a figure. Top right, the two names; the one fighting is underlined.
  Bottom, on its own plate, THE SCRIVENER with a red nib bar that starts full and drains, and
  its health left as a percent. When a choice is open, a plate asks "WHAT WILL VESPER DO?" over
  four picture move cards, two by two; the cards lift in turn and the pick is framed in the
  fighter's colour.
- **The end of a go:** the fighter, its name, the Scrivener's bar draining to where the go
  left it, and the figure or KILL.
- **The winner poster:** a red band, the winner drawn large on the left, the deciding moment
  replayed in a frame, the winner's name very large with its result, the loser as one small
  line, and the clock to the next match.

Fixed in this check (one change, old recordings only)
- `src/stage/fight_hud.js`, `readyCall`: on a feed recorded before today, the per-go
  "PREDICTIONS OPEN" plate covered the top edge of the boss plate (its backing ran to y 648,
  the boss plate starts at 642). It now sits 18 px higher (y 530), clear of the boss plate.
  New matches never draw this plate.

Checks on this build (all run today, in this order)
- `node --check` on all 17 JS files in `src/stage` and `src/show`: no errors.
- A fresh mock match: `scrivener-101-mwoufkxv.jsonl` (Vesper 23%, Ludo 46%, Vesper wins).
- 100 mock matches: 100 finished, 0 stalls, 2 goes each match, 1 window each match. Length min
  177 s, median 220 s, p90 233 s, max 244 s. Decided by damage 58, kill 36, both killed 6.
- Whole match with console capture, 24 frames 9.5 s apart: `"errors": []` on the fresh feed and
  on the real-model feed `scrivener-130-mwos644f.jsonl`. Every phase drew in both: the call, the
  choosing with cards and the "PICKS A" plate, the matchup with two hands, both fights with the
  plates, move cards and the red boss bar, both end cards, the winner poster. Strips:
  `shots/r15/whole_match_strip.png`, `shots/r15/whole_match_strip_130.png`.
- Full-size stills of the fresh feed (choosing, matchup, a move choice, an end card, the
  poster): `"errors": []`, no overlap or clipped text seen. `shots/r15/fresh_*.png`.
- Dead air on the fresh feed, 226 s watched: worst still 1250 ms, in the choosing (match second
  15), between two offers. Bar 2500 ms: pass. Every other phase 0 ms.
- Old three-go feed `scrivener-210-mwnofg5c.jsonl`, five stills (matchup, walk-on with its
  per-go prediction, a move choice, the scores page between pairs, the poster): `"errors": []`
  each, all draw. The walk-on still was taken again after the fix above. `shots/r15/old/`.
- Replay: 158 feeds, 607 of 607 goes identical, 607 seeds traced to a locked window. Pass.
- Real runner Show (`runner_check`): ok, 231 s, 2 goes, one window opened, locked and settled,
  the snapshot holds the whole match, no error.
- Runner and site typechecks: nothing reported for this game.
- Screen text sweep for em dashes and middle dots in `src/stage`: none.

Not checked
- No person has watched a whole match with sound on this build.
- No critic has judged rounds 12 to 14.
