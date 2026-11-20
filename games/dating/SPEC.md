# Compatibility Mode: build spec

The dating show channel. Channel id `dating`, show name "Compatibility Mode", dev port 5203.
Read `../COMMON.md` and `BRIEF.md` first. This file fixes the seams inside `games/dating/` so the
engine, the writing and the stage can be built in parallel. `show/types.ts` is the code contract,
`show/decks.json` holds the frozen card, twist and question ids, and `show/FORMAT2.md` is the episode
format (version 2) this spec implements.

## Shape

- The **show script** runs in node only (inside the platform runner, or inside the harness). It
  talks to a `Show` (see `../../runner/src/types.ts`) and emits feed events. It may use node APIs.
- The **stage** runs in the browser and renders only from feed messages. It never imports `show/`
  except `show/types.ts` (types only).
- Node runs `.ts` directly (type stripping): erasable TypeScript only, explicit `.ts` import
  extensions, JSON via `fs.readFileSync` in node code. No build step for node code.

```
index.ts            export { mount } from './stage/mount.ts'
channel.ts          default export () => ChannelDef (like runner/src/channels/coinflip.ts)
bots.json           roster: 3 stars, 8 suitors (Bot[] in show/types.ts)
show/types.ts       contract            show/decks.json   cards, twists, questions
show/FORMAT2.md     the episode format (version 2)
show/episode.ts     runEpisode(show, deps): the script
show/judge.ts       standing, cut order, pick order, replay lines
show/draw.ts        sealed hex -> TypeDraw (cards + twist), seeded PRNG, cast affinity
show/cast.ts        cast rotation       show/memory.ts    records + three-line memories (.cache/memory.json)
show/content.ts     content check, word limits, banned phrases
show/timing.ts      speaking pace, beats, scene targets, optional beats (VOICES)
show/prompts.ts     model prompt builders
show/brains/scripted.ts   plays from show/bank/**
show/brains/model.ts      OpenRouter, timeout, repair, fallback to scripted, cost log, 402 breaker
show/bank/suitors/<id>.json  show/bank/stars/<id>.json   (SuitorBank, StarBank)
show/bank/replies/<star>/<suitor>.json                    (ReplyBank: the star's reply to each exact suitor line)
harness/fakeShow.ts  local fake Show (timers, windows, sealed) producing runner-shaped feed messages
harness/plugin.ts    vite plugin: runs the channel loop in node, serves SSE at /feed (snapshot first)
harness/main.ts      the dev page: mounts the stage, pipes /feed into handle.onFeed
tools/match.ts  tools/text.ts  tools/balance.ts  tools/bankcheck.ts  tools/runner-smoke.ts  tools/capture.mjs  tools/progress.mjs
stage/**            three.js stage
assets/cast/<id>/manifest.json   assets/vendor/**
```

## Cast and entrants

Each episode: 1 star and 4 suitors from `bots.json`. Rotation avoids repeating the previous
episode's star and brings back at most two of its suitors. The four suitors are the `entrants`
(`id`, `name`, `color` = accent, `record`). The star and the full cast go in `meta` (`DatingMeta`).
Suitors stand at spots 0 to 3, left to right as the viewer sees them, fixed for the episode.

## Hidden and sealed

Window A is opened with `{ seeded: false, sealed: true }`. `draw(win.sealed, decks, castAffinity)`
(`show/draw.ts`) gives three distinct type cards (slot 0 the face-up turn-on, slot 1 the hidden
turn-on, slot 2 the hidden dealbreaker) and the twist card, all from one sfc32 PRNG seeded with the
sealed hex. If `win.sealed` is missing, use 32 random bytes and log it. Nothing else is derived from
`sealed`.

The draw is weighted by tonight's cast, which is public before window A opens, so the hidden cards
are ones somebody on stage naturally plays and the reveal has something to replay. The exact rule:

1. **Affinity.** For each of the four suitors, over the **scored lines** of their bank: `answers`,
   the `twists` of solo-format twist cards, and `oneOnOne.open`. Roasts, wingman lines, jabs and
   steals are trash talk by format and do not count. affinity(card) = scored lines tagged with the
   card / all scored lines.
2. **Top tags.** A suitor's top tags are their `TOP_TAGS` = 5 cards with the highest affinity above
   zero, ties in deck order (FORMAT2 "Signature cards"). The suitor is a **natural owner** of those.
3. **Weight.** weight(card) = `CARD_FLOOR` (0.25) + the sum over its owners on stage of
   `RANK_WEIGHT[the card's place in that owner's top tags]` = 1, 1, 0.8, 0.6, 0.4 (first to fifth).
4. **Candidates.** Every ordered triple (a, b, c) of distinct cards, walking a, then b, then c in deck
   order. Keep the triples where slot 1 (b) and slot 2 (c) each have 1 to 3 owners on stage, and no
   suitor owns both a and b. If none qualifies, every triple is a candidate.
5. **Pick.** A triple weighs weight(a) x weight(b)^`HIDDEN_PULL` x weight(c)^`HIDDEN_PULL`
   (HIDDEN_PULL = 4: the hidden cards are the ones the cast plays most). The first `rng()` draw r
   picks the first triple whose running total of weights exceeds r x the sum of all weights.
6. **Twist.** `pick(rng, decks.twists)` with the next `rng()` draw.

The draw depends on the cast only through the ordered top tags, so they are published: in the
transcript (`draw.topTags`, `draw.owners`) and in the `match_end` result (`topTags`, each list in
order). Anyone can recompute the cards from the secret revealed at settle:
`sealed = sha256("arena-sealed" ‖ secret)`, then `draw(sealed, decks, affinityFromTopTags(topTags))`.
`tools/runner-smoke.ts` does exactly that. Over 2000 scripted episodes on the house banks: the hidden
turn-on is hit by somebody in 77%, the dealbreaker in 81% (`tools/balance.ts`).

Everything that decides a cut or the pick is produced after the latest lock, from model calls or
from randomness drawn after that lock (`crypto.randomBytes`; `--seed` overrides for tests), with one
exception by design: the walk-on's snap reactions (below) are judged during window A against the
face-up card only, and air as they are made.

The round-one question is chosen after window A locks, by the star: each question not asked in the
last six episodes weighs 1 + 3 x (the number of tonight's suitors with a bank answer to it tagged
with one of her two hidden cards), picked with the post-lock rng. A question whose natural answers
hit the same hidden card for all four suitors (at least half of each suitor's answers to it carry
that card) is never drawn. Viewers see only the question.

**Rule for windows:** all lines aired while a window is open are generated before it opens, except
window A's snap reactions and last word, which depend on the face-up card that window A's sealed value
fixes: they are made in its first seconds, judged only against that public card. Generation for a
round starts at its lock and is covered by the round's title call.

**Windows hold their full length.** A, B and C stay open at least 45, 22 and 20 s (`TARGET`), filled:
the silence after each beat but the last stretches by up to 2 s (`BEAT.windowStretch`); if that is
not enough a booth airs a third beat that already exists (booth one: the third suitor's confession;
booth two: the leading finalist's second confession, never the star); what is still missing lengthens
the scene's title call by up to 3 s (`BEAT.callStretch`), or the call shrinks to 1.5 s when the beats
run long. Window A is sized before the face-up card is known, with the snaps at their word limit; its
pacer counts each snap at its real length once it exists. Every window ends on a held wide shot of at
least 3 s (`BEAT.windowTail`) before it locks; gap checks count that held shot as a beat, not dead air
(`isHeldTail`).

## Episode timeline (show/FORMAT2.md; 5:40 to 6:00 with every line at its word limit)

Speaking pace: `ms = 700 + 310 * words`, then a 250 ms gap. Durations below are targets.

| # | Scene | Window | About | What happens |
|---|---|---|---|---|
| 0 | `title` | none | 4.5 s | `announce`, `cast`, show title. Covers generating the intro and the four openers. |
| 1 | `walkon` | A open, 45 s+, 4 outcomes | 45 to 50 s | Star `enter`s, `intro` that names the face-up turn-on (`{card}`, filled with the card's noun once the sealed value fixes it). Per suitor: `enter`, `opener`, the star's snap `reaction` (6 words, a mark) judged only against the face-up card; these marks count and are public. Lineup rule: at least one opener plays to the face-up card when a natural owner is on stage, and no two openers share a device (first tag or first word). The last word (the coldest snap jabs the warmest) is off by default (`VOICES.walkonJab`, trimmed to hold six minutes). Held wide 3 s. |
| 2 | `round1` | A locked | 69 s | Title call. `question`. Three `answer`s in shuffled order, each with a mark; the fourth suitor replies to the current leader instead (`answer` with `to` = the leader, from `jabs[leader]`), with a mark. Spoken reactions to the best and the worst turn only (by mark, then standing); the others are mark-only `reaction`s (empty text, 1.2 s). `bottom` (the two lowest named, 3 s of silence), `cut`, `exit`. |
| 3 | `booth1` | B open, 22 s, 3 outcomes | 22 s | Two `confession`s, never the star. First: a suitor the star spoke to reads her (`guess` or `fear`, `{card}` = the card they think it was about; `EvConfession.guess`). Second: the other of the top two on standing, about the first or about the star. The third suitor's confession airs only if the two run short. |
| 4 | `round2` | B locked | 79 s | Title call. `twist` card turns, `twistintro`, [`caller` from the ex]. Three turns with marks (spoken to best and worst). `verdict`: the star names the frontrunner's turn. The other two each `jab` the frontrunner, who answers with one comeback (`jab`). `bottom`, silence, `cut`, `exit`. |
| 5 | `booth2` | C open, 20 s, 2 outcomes | 20 s | One `confession` from each finalist: a read (`guess`/`fear`) from one who has not read yet, else `final`; never a mirrored pair (the second is a different flavour and does not start like the first). Never the star. |
| 6 | `oneonone` | C locked | 46 s | The leader on standing goes first: `duo` (open), the star's prompt as a `reaction` (from `oneOnOne[suitor]`: a question, order or dare; mark, counts double), the closer that answers that prompt (`oneOnOne.close[star][i]`, warm or cold by the mark). The trailing finalist opens with a `steal` at the leader's date, then the same. Then `compare` (the star, naming both). |
| 7 | `pick` | | 34 s | `hold` line = `holdCard[hidden turn-on]` (the quality that won, true of both, no name) when a finalist showed that card, else a plain `hold` line. Slot 1 turns (`reveal`: its label alone after a `holdCard` line; else the star names whoever cut earlier showed it, or nobody). A `replay` of each finalist's best line for that card (their hit, else their nearest line), in random order. `hold`: 4 s of silence. `pick`: `pickFrames` with the winner's `{hook}`, the name last. `win` line. |
| 8 | `reveal` | | 16 s | Slot 2 turns on the loser: `reveal` naming the loser when the loser hit it (else the winner, else whoever did), a `replay` of that line, the loser's `lose` line. Each `reveal` lists the booth reads at its card (`guesses`, right or wrong). |
| 9 | `result` | all settle | 8 s | All three windows settle on the winner. `outro`. `result` with records and the next cast. `show.end`. |

Every scene starts with a `scene` event that carries the complete `PublicState`.
No silence longer than 2.5 s except the bottom-two silence and the pick `hold` (both inside their
events' `ms`), which the stage fills with lamps, a push-in and a tick. If a line is not ready when it
is due, the script waits at most 6 s in total for that call and then airs the bank line; while
waiting it emits nothing new (the stage idles on reaction shots).

Generation is pipelined: as soon as line N's text exists, the call for line N+1 starts, while
line N is still being spoken. Calls that do not depend on each other run in parallel. Whether a round
reaction is spoken depends on the whole round; with the scripted brain the round is judged before it
airs. A slower brain can leave later turns unjudged: then the star speaks when the turn is the best or
the worst judged so far, at most two per round, and always on the last turn if fewer than two spoke.

## Standing, cuts and the pick (`judge.ts`)

Every suitor line the star reacts to yields `{ mark, hits }`. `hits` are ids among the star's
three cards that the line showed (walk-on snaps: the face-up card only). Before scoring and before
the reaction airs, the mark is made coherent with the hits, for any brain (`coherentMark`): a
dealbreaker hit is always `cringing`; a turn-on hit with no dealbreaker hit is never `cringing` (it
becomes `unsure`). If a `charmed` line is forced to `cringing`, the cold reply (or the star's bank
reaction for that card) airs instead of the warm text. The brain's own mark is kept in the transcript
(`markWas`). Standing per suitor: `+1 charmed, 0 unsure, -1 cringing`, `+2` per hit on a turn-on
(either slot), `-3` per hit on the dealbreaker. A line hits a given card at most once. One-on-one
reactions count double. Walk-on snaps count.

- **The cut follows the screen** (`cutOrder`): the alive suitors ordered by (this round's mark, then
  total standing); the lowest goes. A suitor charmed this round is never cut while another was not.
  A tie on both goes to `brain.choose`. The `bottom` two are the cut suitor and the next in that order.
- **The cut reason** (`cutline`, hint `{ name, hook, line, mark, cardHint? }`): `cutFrames` with
  `{hook}` from the cut suitor's lowest-marked line this round (`worstLine`), then their `exit`. When
  total standing broke a tie between equal marks and a hidden card decided it (`tieBreakCard`: the
  dealbreaker first, then the hidden turn-on), the reason is `cardHint[card]`: a clue, never the name.
- **The pick follows the dates** (`pickOrder`): the finalists by (one-on-one mark, then total
  standing, then `brain.choose`).
- **Replays** (`replayLine`): a finalist's hit on the card (charmed first, rounds before the one on
  one, then the latest), else their nearest line (best mark, not a dealbreaker hit).
  **Slot 2** (`dealbreakerLine`): the loser's earliest hit, else the winner's, else anyone's.

Marks are public (drawn over the suitor and kept on their spot). Hits are never public before
the reveal. That is the hidden information viewers bet around.

## Brains

Scripted brain (`show/brains/scripted.ts`):
- **Marks.** A turn-on hit is charmed, a dealbreaker hit cringing; without a hit the mark is drawn
  `NO_HIT_MIX` (charmed 10, unsure 55, cringing 35). The second date's steal, with no hit, draws
  `STEAL_MIX` (60 / 30 / 10): the trailing finalist has a real chance to swing the pick.
- **A spoken reaction answers the exact line**: `show/bank/replies/<star>/<suitor>.json` holds a warm
  (charmed) and a cold (unsure or cringing) reply per suitor line, keyed by the line's bank text
  (slots unfilled; the brain maps an aired line back to its bank text). Fallback: `cardReact`, then
  `react[suitor][mark]`. A one-on-one reaction is the star's prompt from `oneOnOne[suitor]`.
- **Play to the cards** (answers, twists): a line ranks `FACE_UP_RANK` (3) if tagged with the face-up
  card, plus 1 + the number of the speaker's own top tags on it (1 if tagged at all), plus 0.5 if
  written for this star or target. Alone with the star (one-on-one opener, steal) a suitor plays their
  own strengths only. Suitors never see the hidden cards.
- **No repeats.** A line said this episode goes behind every other line (any tier); a line said in
  the last `REPEAT_WINDOW` (10) episodes goes behind every fresh line of its tier; then rank; then
  least recently used (`.cache/used.json` keeps the tick and the episode).
- **v2 fields fall back to v1** while the banks are upgraded: intros with `{card}` first, then any;
  `cardHint` / `cutFrames` (needs a hook) / `cut`; `pickFrames` (needs a hook) / `pick`; `holdCard` /
  `hold`; `confessions.guess` / `afterCharm`, `fear` / `afterCringe`; `comeback` / `jabs`;
  `oneOnOne.steal` / `open`; `oneOnOne.close[star][i]` / `closeWarm` / `closeCold`. `bottom`,
  `verdict` and `compare` have no v1 field: a short built-in line names the right suitors.
- **Slots**: `{rival} {target} {star} {name} {hook} {a} {b} {card} {played} {wins} {losses} {ex}`.
  `{card}` is the card's `noun` (reveal lines: its label); `{name}` in a star line is the suitor it is
  about; `{hook}` comes from the bank line's `hook` (two to five words copied from it).
- **Booth reads** (scripted): the true hidden card half the time (`TRUE_READ`), else a decoy (a card
  their own line played, else one of their top tags, never one of the star's cards).

For the hybrid model brain the scripted brain also exposes (duck-typed, not in `Brain`):
`candidates(req, n)` -> `{ text, tags?, hook? }[]` (the n best bank lines for exactly that beat, in
the order `speak` would prefer them, slots filled, nothing marked used), `reactCandidates(req, mark,
hits, n)` -> `string[]` (the paired reply first), `replyPair(req)` -> `{ warm, cold } | null`,
`templateOf(text)` (the bank text of an aired line), `hasReplies(star, suitor)` and
`markUsed(text, episode?)`. A brain may set `via` on a `Spoken` or `Reacted` (`'chosen'` for a bank
line it picked, `'written'` for its own); the transcript keeps it. `Spoken.hook`, `Spoken.guess` and
`Reacted.paired` are optional v2 fields (types.ts).

Model brain (`show/brains/model.ts`, hybrid by default): the star's `react` call returns compact JSON
`{ mark, hits, use | line }`, suitor calls `{ use | line }`. The star's paired warm and cold replies
are her first candidates; a reaction she writes must contain the line's `hook` or at least one content
word from the line, else the paired reply for her mark airs (or, with none, it goes back once with the
reason). Walk-on snaps: the prompt names only the face-up card and hits are filtered to it. One-on-one:
she chooses one of her prompts (bank mode), so the closer can answer it. A booth read answers
`{"use": n, "card": "<cardId>"}`: the card is the bot's own guess and goes into `EvConfession.guess`.
A written pick line must end with the winner's name; a written cut line must name something the suitor
said. Every call: timeout 5 s, one repair on bad JSON or a refused line, content check, quality gate,
then the scripted line. Cost per call is appended to `.cache/cost.json`; real calls stop at
`DATING_BUDGET_USD`. A model that fails three times in a row goes scripted for the episode. **HTTP 402**
(out of credit) trips a breaker for every model at once: the first call of an episode goes alone, and
after a 402 the scripted brain plays the rest of the episode with no further calls or retries.

## What each bot sees

Suitors: the public room transcript and marks, the face-up card, the twist once turned, every
suitor's name and tagline, their own record and memory. Never: hidden cards, others' confessions.
Star: the same plus all three of its cards. Never: confessions. A mark-only reaction is in the room
with no words.
Viewers: everything except the two hidden cards.

## Content check (`content.ts`)

Per line: word limit for its kind, no lists or numbered points, no "as an AI", no therapy talk,
no stock romance filler, no slurs, no sexual content, no real people, no em dashes, no emoji.
On-screen text never uses an em dash. Fail: regenerate once, then the bank line. Limits (words):
intro 14, opener 12, snap 6 (10 while the star has no replies to that suitor yet), question 18,
answer 20, reaction 10, twistintro 18, twist 20 (or the card's), jab 10, caller 20, duo 20, star's
one-on-one line 14, confession 18, bottom 12, cutline 14, exit 16, verdict 12, compare 12, hold 14,
pickline 16, win 16, lose 16, reveal 16, outro 12.

## Feed events

`cast, scene, enter, line, reaction, confession, twist, bottom, cut, hold, replay, pick, reveal, result`
with the data shapes in `show/types.ts`. Changed in v2:
- `reaction` may have empty `text` (the mark alone, `ms` 1200); the walk-on has four snap reactions.
- `bottom` (`EvBottom { who: [a, b], by, name, text, ms, holdMs }`) comes before each `cut`; `ms`
  includes the 3 s `holdMs` of silence.
- `replay` (`EvReplay { who, name, text, ms, slot }`): two after the slot-1 `reveal` (both finalists),
  one after the slot-2 `reveal`.
- The slot-1 `reveal` now arrives before `pick`, in the `pick` scene; slot 2 after it, in `reveal`.
  `reveal.quote` is no longer set (the replays carry the lines); `reveal.guesses` lists the booth reads
  at that card, right or wrong. `hold` is 4 s.
- `confession.guess` is set on a booth read. A confession never comes from the star.
- `line` kinds add `verdict`, `compare` and `bottom`; the round-one reply is an `answer` with `to` =
  the leader; the comeback is a `jab`; the walk-on last word (off by default) is a `jab`.
Scene ids are unchanged.

The `match_end` result is `{ winner, loser, star, order, episode, topTags }`. `at` is ms since
`announce`. Every spoken event carries `ms`, the time the stage should take to speak it.

The harness's fake Show sends the same message envelopes as the runner (`runner/src/hub.ts`,
`runner/src/show.ts`): `snapshot`, `match`, `phase`, `window_open`, `pools`, `window_locked`,
`event` (nested as `{ type: 'event', t, event }`), `window_settled`, `match_end`.

## Stage contract

`mount(el, { assetsBase })` returns `{ onFeed, destroy, cameras: ['director'], setCamera, highlight }`.
- Builds the cast from `match.meta` (in `match` and in `snapshot.match`). Loads
  `${assetsBase}cast/<cast>/manifest.json`. Until a model loads, a neutral mannequin stands in.
- On `snapshot`: replays `recentEvents` instantly (no animation, no sound) up to the last `scene`,
  applies its `PublicState`, then plays what follows from where it is.
- Betting state comes from `window_open` (`closesAt`), `window_locked`, `window_settled`. The stage
  shows it only through the world: a studio clock, the house lights, a held beat. No betting UI.
- On-stage text: subtitle bar with the speaker's name (two lines at most), name tags over the
  suitors, the round name, the three type cards. Nothing else.
- 16:9, readable at 1280x720 and 960x540, 60 fps.

## Env

| Var | Default | What |
|---|---|---|
| `DATING_BRAINS` | `scripted` | `scripted` plays from `show/bank/**`; `model` calls OpenRouter with scripted fallback |
| `DATING_WRITE` | `hybrid` | model brain: `hybrid` (choose bank lines, write rarely), `free` (write every line), `bank` (only choose) |
| `DATING_BUDGET_USD` | `1.50` | real model spend cap; calls stop at the limit (`.cache/cost.json`) |
| `DATING_SPEED` | `1` | time scale for tests (the harness and the channel both honour it) |
| `OPENROUTER_API_KEY` | | for `model` brains (games/dating/.env) |
| `ELEVENLABS_API_KEY` | | optional, voice (later) |
