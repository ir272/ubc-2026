# Brief: the hidden-traitor game (working title in this brief only: "The Rat")

Read `games/COMMON.md` first. Dev port 5204. This is a model game.

Target: a six minute heist where six AI bots work a job together and one of them is secretly
working against the rest. They do tasks, things go wrong, they meet, argue, lie and vote someone
out. Viewers do not know who the traitor is and bet on it. Watched, never played. Stack: Vite +
three.js for the stage, node for the match script and model calls.

User's words: "Among Us might be a perfect game environment: there's suspense, there's mystery,
and you can make predictions. The AIs can talk with ElevenLabs and gaslight each other."

## References (bar for quality, never for content)

- **Among Us:** you can always tell who is where, meetings and vote reveals are instantly readable,
  and the moment someone is thrown out is a ritual.
- **The Traitors (TV):** the round table, the accusation, the vote one card at a time, the reveal.
- A 1980s heist-anime mood for light and colour at night. No existing characters.

Gather 8 to 12 reference frames and 2 or 3 motion clips from official trailers. Local only. Our
setting is a heist, our cast and building are our own.

## The game

Six crew, drawn from a house roster of ten in `bots.json`. One is the rat. The role comes from
`win.sealed` of the first window, so it is fixed and committed before any bet and cannot be changed.

The building is shown as a cutaway at night, like a doll's house: six rooms visible at once
(for example lobby, security room, vault, roof, garage, archive), one camera, everyone visible.

Three rounds, each:
1. **The job (about 35 s).** Each crew member picks a room and a task. Tasks add to the job's
   progress. The rat picks a room and either fakes a task, trips an alarm, or, when alone with one
   crew member, locks that member out of the job. When the rat acts, that room's lights cut out for
   the beat. Viewers and crew know where it happened and who had gone in, never who did it. Bots
   only know who was in their own room.
2. **The huddle (about 60 s).** Everyone still in gives one statement and one reply, 18 words or
   fewer each. Bots can accuse, defend, lie and form sides.
3. **The vote (about 20 s).** Each names one person or passes. Votes turn over one at a time. A
   majority throws that person off the job, and the crew is told only that they are gone, not what
   they were. The reveal waits for the end.

Ends: the crew wins when the job reaches 100% or the rat is voted out. The rat wins when the alarm
reaches three or only two crew are left. Then the reveal: the rat is unmasked and a short replay
shows what it really did in each blackout.

## Bets

- **"Who is the rat?"** with 6 outcomes. Window A opens in the lobby (about 40 s), when all anyone
  has is each bot's record: how often it was caught as the rat, how often it accused the wrong
  bot. A new window on the same question opens for about 20 s after each vote, with the outcomes
  that are still possible. All of them settle at the reveal.
- Before the last vote, one extra window: "Does the rat get away?" with 2 outcomes.

## Watching it

- **The suspicion board:** after each huddle every bot privately names who it suspects most, and
  viewers see the board. The rat's entry is whatever it chooses to claim. This is what moves the odds.
- Huddles are the show: speaker close-ups, the accused's face, short lines, real disagreement.
  Bots are told to commit to a suspect and argue, not to hedge.
- The blackout is a moment: the room goes dark, a sound, the alarm meter ticks up.
- The vote and the walk out of the building are rituals with pauses.
- Stage HUD: job progress, alarm meter (three steps), round, who is out. A subtitle bar for speech.
- Characters are toy-like 3D figures with clear silhouettes and expressive faces, recognisable at
  doll's-house scale by colour and shape, and readable in close-up during huddles.
- `highlight(entrantId)` marks the bot the viewer bet on.

Never leak the role: nothing in the feed, the events, the event order or the timing may reveal the
rat before the reveal event. The stage receives blackout events without an actor. Test this.

Feed events (final names are yours, document them): cast, round, move, task, blackout, alarm,
locked_out, line, suspicion, vote, thrown_out, reveal, match_end.

## Bar

On top of the shared bar in COMMON.md:
- **Balance:** over 40 real-model text matches the rat wins 35 to 50% of the time, every seat is
  the rat about equally often, and no bot is voted out first more than 30% of the time.
- **It is a mystery:** shown the feed up to the last vote, a fresh critic names the rat correctly
  in 25 to 60% of matches. Lower means there are no clues. Higher means it is obvious.
- **No leak:** an automated check over 200 mock matches finds nothing in the feed before the reveal
  that depends on the role, beyond what the rat chose to do.
- **Talk quality:** over 20 real-model matches a fresh critic finds at least one accusation or lie
  per huddle worth clipping, and fewer than 5% of lines hedge or repeat.
- **Pace:** a match in 5 to 7 minutes, a betting window at least every 90 seconds.
- **Look:** at least 50% blind-pick wins against the reference frames on readability of the
  building, the huddle staging and the vote ritual.

Order of work: the rules and text matches with trials (balance first), then the building and
movement on mock brains, then huddles and votes, then real models on the stage, then voice.
