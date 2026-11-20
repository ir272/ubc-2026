# Compatibility Mode

An AI dating show channel. One star and four suitor bots per episode, drawn from a house roster of
3 stars and 8 suitors. The suitors try to win the star over, the star cuts one after each round and
picks one at the end. Viewers bet on who gets picked, in three windows (4, 3 and 2 outcomes).
Episodes run 5:10 to 5:41 (mean 5:25) with the house banks, and 5:51 to 5:56 with every line at its
word limit (up to 6:03 on an ex-calls night while the banks have no reply files: the walk-on snaps
are then 10-word v1 lines, not 6-word replies); they loop forever with a rotating cast.

Channel id `dating`, dev port 5203. Spec: `SPEC.md`. Format: `show/FORMAT2.md` (version 2).
Contract: `show/types.ts`.

## Run it

```sh
npm install
npm run dev                         # harness page on :5203, the channel loops in the dev server
npm run match                       # one episode headless at speed 200, compact result
npm run match -- --seed abc --full  # deterministic; --full pads every line to its word limit
npm run text -- --n 3 --out trials/mine   # N text episodes, no sleeping: ep-XX.md + ep-XX.json + summary.json
npm run balance -- --n 2000         # scripted win rates, hidden-card hit rates, legibility, mark mix, window lengths
npm run bankcheck                   # validates personas, banks and replies (exit 1 on errors); v2 counts warn
npm run bankcheck -- --strict       # v2 counts from FORMAT2.md become errors (when the writers are done)
npm run roster                      # writes bots.json from show/personas (+ .cache/models.json)
node tools/runner-smoke.ts          # one episode on the REAL runner (memory chain, port 8797, speed 40)
node --test test/*.test.ts          # draw, judge, content check, full episodes through the fake Show
```

`match` and `text` take `--brains scripted|model` (model calls cost real money, see the budget) and
`--seed <s>` (sealed values, cast, order and scripted picks all follow the seed). `match` takes
`--speed` (default 200 scripted, 4 model). The tools read `.cache/memory.json` but never write it.

The dev harness: `harness/plugin.ts` exports `datingHarness()`, a Vite plugin that runs the channel
on a local fake Show (`harness/fakeShow.ts`) and serves
- `GET /feed`: Server-Sent Events. The first message is the snapshot, then every feed message as JSON.
- `GET /feed/snapshot`: the current snapshot.
- `POST /feed/skip`: plays the current episode out at 400x (testing).

## Env

Read from the process, else from `games/dating/.env` (never printed). See `.env.example`.

| Var | Default | What |
|---|---|---|
| `DATING_BRAINS` | `scripted` | `scripted` plays from `show/bank/**`; `model` calls OpenRouter with scripted fallback |
| `DATING_WRITE` | `hybrid` | model brain: `hybrid` (choose bank lines, write rarely), `free`, `bank` (only choose) |
| `DATING_BUDGET_USD` | `1.50` | real model spend cap; calls stop at the limit (`.cache/cost.json`) |
| `DATING_SPEED` | `1` | time scale for tests (the harness and the channel both honour it) |
| `OPENROUTER_API_KEY` | | for `model` brains |
| `ELEVENLABS_API_KEY` | | optional, voice (later) |

Bots and models: `bots.json` if present, else `show/personas/*.json`; a persona's `"model":
"unassigned"` is filled from `.cache/models.json` (`{ botId: modelId }`). A missing persona becomes a
clearly named stand-in so the show always runs. An avatar's accent comes from
`assets/cast/<id>/manifest.json` when it exists. Records and three-line memories persist in
`.cache/memory.json`; bank lines are rotated least-recently-used via `.cache/used.json`.

## Checked against the real runner

`node tools/runner-smoke.ts` imports the runner's own app (`runner/src/server.ts` `createApp`,
`runner/src/chain/index.ts` `makeChain`, as `runner/src/index.ts` does) with `CHAIN=memory` and
only this channel, listens on 127.0.0.1:8797 with `DATING_SPEED=40`, and follows one full episode
over `/ws?channel=dating` (the runner starts the loop as soon as it listens, so the episode already
running at connect is skipped and the next one is checked). It writes nothing under `runner/` and
nothing under `.cache/` (read-only memory, in-memory line LRU). Result on Thu Nov 19 (format v2):

```
runner smoke: dating channel on the real runner (CHAIN=memory, DATING_SPEED=40, port 8797), checked episode over 19.0 s after start (real)
PASS  first message is a snapshot of channel dating
PASS  match: four entrants, meta.game === "dating"  (4 entrants, meta.game dating)
PASS  three windows opened, 4/3/2 outcomes  (4/3/2)
PASS  all three locked
PASS  all three settled on the same winner, the one picked  (brock, brock, brock; picked brock)
PASS  window A carries a sealed commitment
PASS  window A reveals a secret matching its commitment
PASS  anyone can recompute the cards and twist from the secret and the top tags  (aired bigwords / rules / danger, budget-date; recomputed bigwords / rules / danger, budget-date)
PASS  a late joiner gets a snapshot whose recentEvents hold the latest scene  (late snapshot: 32 events, last scene booth1)
PASS  v2 beats: two bottom-two events, slot 1 turns before the pick and slot 2 after, replays, mark-only reactions  (2 bottom, reveal 1 at 64, pick at 68, reveal 2 at 71, 3 replays, 3 mark-only reactions)
PASS  match_end arrived
all 11 checks passed
```

At `DATING_SPEED=40` the channel's `scaledShow` floors every window at 1 s real (40 s show time), so
the booths run long in this test only; at speed 1 nothing is floored.

## Integration (two lines for the platform owner)

`runner/src/index.ts`:
```ts
import datingChannel from '../../games/dating/channel.ts';
// in ALL:
  dating: () => datingChannel(),
```

`web/src/games/registry.ts`, in `GAMES`:
```ts
  dating: { load: () => import('@games/dating/index.ts'), assetsBase: '/games/dating/' },
```
`games/dating/assets` must be served at `/games/dating/`, for example with a symlink
`web/public/games/dating -> ../../../games/dating/assets`.

## The episode

Format version 2 (`show/FORMAT2.md`). Measured over 300 scripted episodes on the house banks.

| Scene | Window | Measured (s) | What happens |
|---|---|---|---|
| `title` | | 4 | `cast`, title. Covers generating the intro and the four openers. |
| `walkon` | A open (sealed) | 45 to 50 | Cards dealt, slot 0 face up. Star enters, `intro` naming the face-up turn-on. Per suitor: `enter`, `opener`, the star's snap `reaction` (six words, a public mark that counts) judged only against the face-up card. Held wide 3 s. |
| `round1` | A locked | 56 to 66 | Title call. `question`; three `answer`s, each marked; the fourth suitor replies to the leader (`answer`, `to` the leader), marked. The star speaks to the best and the worst turn; the others get the mark alone. `bottom` (two lamps, 3 s silence), `cut`, `exit`. |
| `booth1` | B open | 22 | A suitor the star spoke to reads her (`guess`/`fear` naming a card, `EvConfession.guess`); a rival answers. The third suitor only if the window runs short. Never the star. |
| `round2` | B locked | 68 to 78 | `twist` turns, `twistintro`, [`caller`], three marked turns (best and worst spoken), `verdict` on the frontrunner, two `jab`s at them, one comeback `jab`, `bottom`, `cut`, `exit`. |
| `booth2` | C open | 20 | One `confession` per finalist, no mirrored pair, a read from whoever has not read yet. Never the star. |
| `oneonone` | C locked | 37 to 46 | The leader first: `duo`, the star's prompt (`reaction`, counts double), the closer that answers it. The trailing finalist opens with a steal at the leader's date. Then `compare`. |
| `pick` | | 27 to 34 | `hold` line (the hidden turn-on's quality, true of both), slot 1 turns, a `replay` of each finalist's evidence (random order), `hold` (4 s), `pick` with the name last, `win`. |
| `reveal` | | 9 to 17 | Slot 2 turns on the loser (else whoever broke it), its `replay`, `lose`. Each `reveal` settles the booth reads (`guesses`). |
| `result` | all settle | 7 to 8 | A, B and C settle on the winner. `outro`. `result` (records, next cast). `match_end`. |

Total: 5:10 to 5:41, mean 5:25, with the house banks; 5:51 to 5:56 with every line at its word limit
(`npm run match -- --full`). FORMAT2's own trims are applied (the walk-on last word and the third
spoken reaction are off, `VOICES` in `show/timing.ts`), and the pace is 700 + 310 ms per word with a
250 ms gap. No silence over 2.5 s except the bottom-two silence and the pick hold (inside their events'
`ms`), the 3 s held wide shot that ends each window, and up to the 6 s wait cap if a model line is late.
Window A's sealed value fixes the three type cards and the twist; everything that decides a cut or the
pick is made after the latest lock, except the walk-on snaps, which window A's face-up card needs and
which are judged against that public card only.

**Windows hold their full length.** Real open times over 2000 scripted episodes: A 45.0 to 49.8 s
(mean 48.3); B 22.0 s; C 20.0 to 20.4 s, against targets of 45, 22 and 20.

**Legibility** (over 2000 scripted episodes, `npm run balance`): every cut fell on the suitor with the
(joint) lowest visible mark that round, and every pick on the finalist whose one-on-one mark was at
least the other's (100% each, by rule); the last speaker in the one on one won 43%. The star speaks
two reactions per round (the best and the worst turn), the rest are the mark alone. Cut reasons:
77% quote the suitor's `hook`, 15% hint at the hidden card that broke a tie, 9% are v1 lines. Booth
reads: two per episode, right 50%.

Standing: +1 charmed, 0 unsure, -1 cringing; +2 per hit on a turn-on (either slot), -3 per hit on the
dealbreaker; one-on-one reactions count double; walk-on snaps count. The cut: the lowest by (this
round's mark, total standing); a suitor charmed this round is never cut over one who was not. The
pick: (one-on-one mark, total standing). Ties go to `brain.choose`. Marks are made coherent with hits
before scoring and before airing, whatever the brain said: a dealbreaker hit is always `cringing`, a
turn-on hit with no dealbreaker hit never is (it becomes `unsure`).

## Hidden cards: the weighted draw (recompute it yourself)

The cast is public before window A opens, and the draw only uses the cast and the sealed value:

1. For each suitor on stage, affinity(card) = share of their bank's scored lines (`answers`, `twists`
   of solo-format twist cards, `oneOnOne.open`; roasts, wingman lines, jabs and steals are trash talk
   and do not count) tagged with the card.
2. Their top 5 cards by affinity (above zero, ties in `decks.json` order) make them a natural owner
   (FORMAT2 "Signature cards"; `npm run bankcheck` prints the table).
3. weight(card) = 0.25 + the sum over its owners on stage of 1, 1, 0.8, 0.6 or 0.4 by the card's
   place in that owner's top five.
4. Candidates: every ordered triple of distinct cards (slot 0, 1, 2), each walked in deck order; keep
   those where slots 1 and 2 each have 1 to 3 owners and no suitor owns both slot 0 and slot 1 (if
   none, keep all). A triple weighs weight(slot 0) x weight(slot 1)^4 x weight(slot 2)^4.
5. `rng = sfc32(sealed)`; `r = rng()`; the first triple whose running weight total exceeds
   `r x total` is the draw. The twist is `pick(rng, twists)` with the next draw.

`sealed = sha256("arena-sealed" ‖ secret)` (the secret is revealed when window A settles), and the
`match_end` result carries `topTags` (each suitor's five, in order), which is all the draw needs:
`draw(sealed, decks, affinityFromTopTags(topTags))` in `show/draw.ts`. Over 2000 scripted episodes the
hidden turn-on is hit by somebody in 77% of episodes, the dealbreaker in 81%, both in 62%, neither in
4%; the winner hit a card in 81%, and every suitor's win rate stays between 19% and 30%
(`npm run balance`). The mark mix is 35 / 33 / 32 (charmed / unsure / cringing) against FORMAT2's
25 / 45 / 30: the banks tag about 2.5 cards per scored line, so a turn-on hit (always charmed) comes on
about 29% of lines. After window A locks, the star picks the round-one question weighted toward ones
whose bank answers show her hidden cards (1 + 3 per suitor with such an answer), never one every
suitor would answer with the same hidden card.

## Feed

Envelopes are the runner's (`snapshot`, `phase`, `match`, `window_open`, `pools`, `window_locked`,
`event`, `window_settled`, `window_void`, `match_end`). A game event arrives nested:
`{ type: 'event', t, event: { type, at, data } }`, `at` = ms since `announce`. `match.meta` is a
`DatingMeta` (`{ game: 'dating', show, episode, star: CastMember, suitors: SuitorMember[] }`).
Every spoken event carries `ms`, the time the stage should take to speak it.

| `event.type` | `data` (types in `show/types.ts`) |
|---|---|
| `cast` | `EvCast { meta: DatingMeta }` (first event of a match) |
| `scene` | `EvScene { state: PublicState, ms }`: `ms` = the title call before lines start. `state` is complete, so a late joiner needs only the last one. Scene ids are unchanged in v2. **`oneonone` is sent twice**: the second time with `state.focus` = the second finalist and `ms` 1000. |
| `enter` | `EvEnter { who, spot, ms }` (star: `spot: null`) |
| `line` | `EvLine { who, name, text, ms, kind, to? }`, `kind` one of `intro opener question answer twistintro twist jab caller duo exit verdict compare hold win lose outro`. The ex: `who: 'ex'` (not a cast member, a phone voice), `kind: 'caller'`. Suitors answering the ex have `to: 'ex'`. Round one's fourth `answer` is said `to` the leader (a steal); round two's comeback is a `jab`. |
| `reaction` | `EvReaction { who: star, name, to, mark, text, ms }`, `mark` = `charmed`, `unsure` or `cringing`. **`text` may be empty**: the mark alone (`ms` 1000). Four snap reactions in the walk-on. Also the star's middle line in a one on one (her prompt). |
| `confession` | `EvConfession { who, name, text, ms, about?, guess? }` (only viewers hear it). Never the star. `guess: { id, label, kind }` on a booth read: the card the suitor thinks she likes (`on`) or cannot stand (`off`). |
| `twist` | `EvTwist { id, label, rule, ms }` (the card turns) |
| `bottom` | `EvBottom { who: [a, b], by, name, text, ms, holdMs }`: the two lowest light up, the star names both, then `holdMs` (3000) of silence, included in `ms`. Before each `cut`. |
| `cut` | `EvCut { who, by, round: 1 or 2, text, ms }`: `text` is the star's reason (quotes them, or hints at a hidden card); the light goes out |
| `replay` | `EvReplay { who, name, text, ms, slot }`: an earlier line played back with a cut to that face. Two after the slot-1 `reveal` (both finalists), one after the slot-2 `reveal`. |
| `hold` | `EvHold { finalists: [a, b], ms: 4000 }`: nothing is said |
| `pick` | `EvPick { who, loser, by, text, ms }`: the name comes last in `text` |
| `reveal` | `EvReveal { slot: 1 or 2, card: { id, label, kind: 'on' or 'off' }, text, ms, guesses? }`. **Slot 1 arrives before `pick`** (in the `pick` scene), slot 2 after it. `quote` is no longer set (the `replay`s carry the lines). `guesses: { who, name, right }[]`: the booth reads at that card. |
| `result` | `EvResult { winner, star, order, records, next?: { star, suitors }, ms }` |

`match_end.result`: `{ winner, loser, star, order, episode, topTags }` (`topTags`: suitor id -> their
top 4 cards, the public input of the card draw).

`PublicState`: `{ scene, label, alive, cut, marks, cards, twist, window, focus, winner }`. Hidden
cards are `{ slot, faceUp: false }` with no id until their `reveal`. `title` has `cards: []`.

## Brains

`show/brains/index.ts`: `makeBrains(kind, deps)` returns `{ brain, fallback }` (`makeBrain` returns
the brain only). Every call is wrapped by the episode: 6 s real timeout, content check
(`show/content.ts`), then the scripted line, then a neutral built-in line. A line that is due and
not ready waits at most 6 s (show time), then the scripted line airs.

What the episode asks for (`SpeakReq.kind`, speaker, `maxWords`, `target`, `hint`):

| kind | who | words | target | hint |
|---|---|---|---|---|
| `intro` | star | 14 | | `{ card }` (a stand-in token before the draw, swapped for the face-up card's noun) |
| `opener` | suitor | 12 | | (before the draw; the lineup rule may swap it for another bank opener) |
| `question` | star | 18 | | `ctx.question` |
| `answer` | suitor | 20 | the leader (reply) | `{ reply: leaderId }` for round one's fourth suitor |
| `twistintro` | star | 18 | | `ctx.twist` |
| `caller` | star (the ex speaks) | 20 | | `{ exName, about }` |
| `twist` | suitor | card `maxWords` | rival for `target-left` / `target-right` | |
| `jab` | suitor | 10 | rival | `{ step: 'comeback' }` for the frontrunner's answer to the pile-on |
| `confession` | suitor | 18 | rival for `rival` / `final` | `{ flavour: star, rival, afterCringe, afterCharm, final, guess, fear; about?, avoid? }`; `guess`/`fear`: `{ card: { id, label, noun }, starSaid?, heard? }`, the answer may set `Spoken.guess` |
| `bottom` | star | 12 | | `{ a, b }` (names) |
| `verdict` | star | 12 | the frontrunner | `{ name }` |
| `cutline` | star | 14 | the cut suitor | `{ name, hook?, line, mark, standing, cardHint? }` (their lowest-marked line this round) |
| `exit` | suitor | 16 | | `{ reason }` |
| `duo` | suitor | 20 | star (`steal`: the leader) | `{ step: 'open' }`, `{ step: 'steal', rival }` or `{ step: 'close', mark, prompt, promptText }` |
| `compare` | star | 12 | | `{ a, b }` (first and second date) |
| `hold` | star | 14 | | `{ card }` (the hidden turn-on: `holdCard`) |
| `pickline` | star | 16 | winner | `{ name, hook?, line, mark, loser }` (the name last) |
| `win` / `lose` | suitor | 16 | | `{ rival }` (id) |
| `reveal` | star | 16 | the quoted suitor | `{ slot, verdict: on, off or none, card: { id, label, kind, noun }, name?, quote?, suitor?, line? }` (slot 1 has no name: it turns before the pick) |
| `outro` | star | 12 | | |

Reactions: `react({ star, to, line, tags?, hook?, maxWords: 10, ctx, hint: { beat, key?, steal? } })`:
`beat` is `snap` (walk-on, `maxWords` 6, judged only against the face-up card), `round` or `duo` (one
on one, `maxWords: 14`, the line is her prompt); `key` is the line's bank text (the key of its paired
reply). `ctx.type` is set whenever the speaker is the star.

Scripted brain: tags on a bank line give the hits; a turn-on hit is charmed, a dealbreaker hit
cringing, otherwise the mark is drawn 10 / 55 / 35 (a steal: 60 / 30 / 10). A spoken reaction is the
star's paired reply to that exact line (`show/bank/replies/<star>/<suitor>.json`, warm for charmed,
cold otherwise), else `cardReact`, else `react[suitor][mark]`. Suitors play toward the face-up card and
their own top tags (rank `FACE_UP_RANK` 3 + 1 + own top tags), alone with the star their own strengths
only; they never see the hidden cards. No line is said twice in one episode, or within ten episodes
while its pool has another. Every v2 field falls back to the v1 field it replaces (see SPEC "Brains").
Slots: `{rival} {star} {name} {hook} {a} {b} {card} {played} {wins} {losses} {ex}`.

For the hybrid model brain, the object `createScriptedBrain` returns also has (duck-typed):
`candidates(req, n)` -> `{ text, tags?, hook? }[]`, the n best bank lines for that exact beat in
speak's order, nothing marked used; `reactCandidates(req, mark, hits, n)` -> `string[]`, the paired
reply first; `replyPair(req)`, `templateOf(text)`, `hasReplies(star, suitor)`; `markUsed(text)` to
record the line that aired.

Model brain (hybrid by default): the paired replies are the star's first candidates; a reaction she
writes must use the line's hook or a word from it, else the paired reply airs; snaps see only the
face-up card; her one-on-one line is one of her prompts; a booth read answers `{"use": n, "card": id}`
and that card is the bot's own guess. **HTTP 402** (out of credit): the first call of an episode goes
alone, and after a 402 the scripted brain plays the whole episode with no further calls or retries.
Unit tests stub `fetch`; nothing in `node --test` calls the network. A brain may put `via: 'chosen' | 'written'`
on its answers; `npm run text` prints every line's source as `{b}` bank, `{c}` chosen, `{w}` written,
`{f}` fallback when the brain has `stats()`, and `summary.json` counts them. Transcripts also show
the mark-only reactions, `[reply]` on a paired reply, the bottom two, the booth reads (right or
wrong), the replays (or "nearest line" when a finalist never hit the card), and `summary.json` carries
the batch's legibility numbers.

## Files

```
channel.ts            default export () => ChannelDef; loadEnv, scaledShow
show/episode.ts       runEpisode(show, deps) -> Transcript (the script)
show/session.ts       roster + decks + brains + memory + cast rotation, shared by channel and tools
show/draw.ts          sfc32, draw(sealedHex, decks), pick/shuffle
show/judge.ts         standing, cut order, tie-break card, pick order, replay lines
show/content.ts       content check and word limits     show/timing.ts   speaking pace, beats, targets
show/cast.ts          rotation                          show/memory.ts   records, memories
show/roster.ts        bots.json / personas / placeholders / models.json / manifest accents
show/brains/          index.ts, scripted.ts (model.ts and show/prompts.ts: the model brain)
harness/fakeShow.ts   fake hub + Show with a virtual clock      harness/plugin.ts   Vite plugin
tools/                match, text, balance, bankcheck, roster, runner-smoke
test/                 node --test; test/fixtures is a throwaway bank
```

## Credits

- Cast: eleven avatars from the 100Avatars R3 set by Polygonal Mind, CC0.
- Animation clips: Universal Animation Library by Quaternius, CC0.
- Sound effects: Kenney and OpenGameArt, CC0.
- Music: five beds by Kevin MacLeod (incompetech.com), licensed under Creative Commons Attribution 4.0.
  This credit must be shown wherever the show is published (the site footer or an about page is
  enough; the stage itself shows no credit line).
- Fonts: Dela Gothic One and Zen Maru Gothic via @fontsource, SIL Open Font License.

Every file with its source, author and licence is listed in `ASSETS.md`.
