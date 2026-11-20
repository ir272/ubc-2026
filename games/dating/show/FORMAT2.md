# Episode format, version 2 (lead's decisions after the first script critique)

Eight fresh critics read eight whole episodes, one beat each, next to the real Monster Prom lines
and the way Take Me Out, Love Island and Blind Date run the same beats. The bar won all eight.
They agree on four faults. This file is the fix. It overrides the timeline in SPEC.md where they
differ; SPEC.md and README.md are to be brought in line with it.

## The four faults

1. **Reactions do not answer the line.** The star's reply was picked by who spoke and which card
   was hit, so it mocked a habit the suitor never showed tonight. In the bar the undercut always
   seizes a word from the sentence just said.
2. **Visible marks lie.** Hidden standing decided cuts, so a suitor the star was charmed by got cut
   while a cringe survived. A bettor reading the screen was misled, and only 7 of 16 cuts were
   legible.
3. **The booth and the walk-on give a bettor nothing.** Confessions were freestanding gags, and
   the walk-on was four monologues into silence.
4. **The pick and reveal do not land on the finalists.** The name came first, the replayed quote was
   often from someone cut in round one, and the reveal line said "somebody".

## Rules that now hold everywhere

- **A spoken reaction answers the exact line.** Scripted: `show/bank/replies/<star>/<suitor>.json`
  holds a warm and a cold reply for each suitor line, keyed by the line's exact text. Fallback
  when a key is missing: `cardReact`, then `react[suitor][mark]`. Live: the model is given the
  line's `hook` and must use it or choose the paired reply.
- **Not every line gets a spoken reaction.** In a round, the star speaks to the best and the worst
  turn (at least two, at most three per round). The others get the mark alone: a `reaction` event
  with empty `text` and `ms` about 1500. This is Take Me Out's lights: fast, physical, legible.
- **Charmed is rare.** A turn-on hit is charmed. Without a hit, charmed about one time in ten.
  Target mix over an episode: charmed 25, unsure 45, cringing 30.
- **The cut follows the screen.** Order the alive suitors by (this round's mark, then total
  standing). The lowest goes. A suitor who was charmed this round is never cut while another was
  unsure or cringing. When total standing breaks a tie between equal marks, the star's reason is
  the `cardHint` for the card that decided it: a clue, never the card's name.
- **The cut is staged.** After the last reaction: `bottom` (the two lowest named by the star, their
  lamps flash), three seconds of silence, then `cut`. The reason quotes the suitor
  (`cutFrames` with `{hook}` from their lowest-marked line this round), then their `exit` line.
- **The pick follows the dates.** Order the two finalists by (one-on-one mark, then total
  standing, then `brain.choose`).

## Timeline

| Scene | Window | Target | Beats |
|---|---|---|---|
| `title` | none | 6 s | announce, cast, title. Covers generating the walk-on. |
| `walkon` | A open 45 s | 45 s | Star `intro`, which names the face-up turn-on in her own words. Four slots of about 8 s: `enter`, `opener`, then the star's snap `reaction` (six words at most, with a mark) judged only against the face-up card. These marks count in standing and are public. Last 8 s: the suitor with the coldest reaction throws one `jab` at the warmest; no reply. Lineup rule: at least one opener that plays to the face-up card, and no two openers built on the same device. |
| `round1` | A locked | 80 s | Title call. `question`. Three answers in shuffled order, each with a mark; the fourth suitor instead replies to the current leader's answer (a steal or undercut from `jabs[leader]`, kind `answer`, `to` the leader), then gets a mark. Spoken reactions to best and worst only. `bottom`, silence, `cut`, `exit`. Never draw a question whose natural answers hit the same hidden card for all four. |
| `booth1` | B open 22 s | 22 s | Two confessions, never the star. First: a suitor who got a spoken reaction reads it: a `guess` or `fear` line with `{card}` filled by the card they think it was about (scripted: the true hidden card half the time, a decoy otherwise; live: the model names its own guess). The event carries `guess`. Second: a rival, about that suitor or the star. The eventual finalists are preferred as speakers once known to the script (it is not known yet here: prefer the top two of standing). |
| `round2` | B locked | 85 s | Title call, `twist`, `twistintro`. Three turns with marks (spoken reactions to best and worst). Then `verdict`: the star names the turn that landed and settles the card's own game. The other two each fire one `jab` at that frontrunner; the frontrunner gets one `comeback`. On caller twists the ex speaks first and may answer the frontrunner instead of the verdict. `bottom`, silence, `cut`, `exit`. |
| `booth2` | C open 20 s | 20 s | One confession from each finalist (`final`, or `guess`/`fear` if they have not guessed yet). Never the star. No mirrored pair: the second must not use the same construction as the first. |
| `oneonone` | C locked | 58 s | The LEADER on standing goes first: suitor `duo` (open), star's prompt as a `reaction` (from `oneOnOne[suitor]`, a question, order or dare, with a mark), suitor `duo` that answers that prompt (`oneOnOne.close[star][i]`, warm or cold by the mark). The trailing finalist goes second and opens with a `steal` at the leader's date, then the same three lines. Then `compare`: one star line naming both. |
| `pick` | | 30 s | `hold` line = `holdCard[hidden turn-on]`: the quality that won, true of both, no name. Slot 1 turns: `reveal` (slot 1) then a `replay` of each finalist's best line for that card (the winner's hit; for the loser a hit or their nearest line), a cut to each face. `hold` event: 4 s of silence. `pick`: the star's `pickFrames` line, the NAME LAST. Winner's `win` line. |
| `reveal` | | 14 s | Slot 2 turns on the loser: `reveal` (slot 2) naming the loser when the loser hit it (else whoever did, preferring the other finalist), `replay` of that line, the loser's `lose` line. `reveal.guesses` lists who guessed at each card in the booth and whether they were right. |
| `result` | settle | 8 s | All windows settle on the winner. `outro`. `result` with records and the next cast. |

Target 5:40 to 6:00 at full line length. If a beat must go to hold six minutes, drop the walk-on
jab first, then the third spoken reaction in each round.

## What the bank needs for this (writers)

Suitors: `hook` on every answer, twist, roast, wingman and one-on-one opener (two to five
consecutive words copied exactly from the line: the phrase a star would quote back).
`confessions.guess` 6 and `confessions.fear` 4 with `{card}`. `comeback` 4. `oneOnOne.steal` 3
with `{rival}`. `oneOnOne.close[star]`: a warm and a cold closer answering each of that star's
two prompts to this suitor.
Stars: `bottom` 4, `cutFrames` 6, `cardHint` 24, `verdict` 12, `compare` 4, `holdCard` 24,
`pickFrames` 6, `reveal` on/off lines that take `{name}`. Every `oneOnOne[suitor]` line ends in a
concrete prompt: a question, an order or a dare. Every `intro` leaves room to name the face-up
card: the engine appends nothing, so write intros that end with "Tonight I like {card}." in her
own words, using `{card}`.
Replies: `show/bank/replies/<star>/<suitor>.json`, a warm and a cold reply for every opener,
answer, twist, roast, wingman and one-on-one opener of that suitor, each seizing a word from it.

## Signature cards (so the whole deck is in play)

Each suitor's five most-tagged cards must be these, each on at least 15% of their scored lines
(answers, solo twists, one-on-one openers). Roasts and jabs are trash talk by format and do not
count toward affinity.

| Suitor | Signature cards |
|---|---|
| dash | confidence, bragging, numbers, flattery, plans |
| tilly | sorry, rules, curiosity, selfdeprecation, flattery |
| quill | poetry, bigwords, drama, gestures, past |
| prince | money, gestures, petnames, mystery, flattery |
| nav | plans, rules, brevity, confidence, danger |
| crumb | honesty, food, brevity, puns, past |
| vex | mystery, past, curiosity, danger, honesty |
| brock | confidence, food, numbers, vulnerability, bragging |
