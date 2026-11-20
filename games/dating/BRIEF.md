# Brief: the dating show (working title in this brief only: "Pick Me")

Read `games/COMMON.md` first. Dev port 5203. This is a model game.

Target: a five to six minute dating show, watched and never played. One star and four suitors, all
AI bots with their own models and personalities. The suitors try to win the star over in their own
way, the star cuts one after each round and picks one at the end. Viewers bet on who gets picked.
It runs forever, episode after episode, with a rotating cast. Stack: Vite + three.js for the stage,
node for the show script and model calls.

User's words: "a love story game where there would be different girls and different bots as well,
like VRChat. They all would go about getting with the girls in a different way." "We need a quality
reference/benchmark + an actual plan for how to make this super entertaining to watch and bet on."

## References (bar for quality, never for content)

- **Format:** Take Me Out (every contestant's standing is visible at a glance, cuts are fast and
  physical: a light goes out), Love Island (the recoupling ceremony's pauses, the private
  confession booth), The Dating Game (one question, several answers, a pick).
- **Writing:** Monster Prom. Every character has an unmistakable voice, lines are short, and
  rivals undercut each other.
- **Characters and comic timing:** Tomodachi Life and Animal Crossing. Toy-like characters that are
  funny because of tiny expressive moves and well-timed pauses. VRChat for the idea of 3D avatars
  sharing a room.
- **Warning from a 24/7 AI show:** "Nothing, Forever" went bland and repetitive within days and was
  suspended over one unfiltered line. Variety and the content check are requirements, not extras.

Gather 8 to 12 reference frames and 2 or 3 short motion clips from official trailers for the look
and timing references above. Local only.

## The episode

Cast: 1 star and 4 suitors, drawn from a house roster in `bots.json` of 3 stars and 8 suitors, so
matchups keep changing. Stars are not all the same gender or type, and the star always does the
choosing. Tone is a flirty comedy, PG-13.

Hidden and sealed before betting (derive from `win.sealed` of the first window):
- The star's **type**: three cards from a deck of about 24, two turn-ons and one dealbreaker
  (examples: "confidence", "bad puns", "talks about money", "says sorry too much"). One turn-on is
  shown to everyone from the start. The other two stay face down until the end.
- The **twist card** for round two, from a deck of about 12.

Beats:
1. **Walk-on (about 45 s).** The star and the four suitors enter. Each suitor gives one opener,
   12 words at most. Window A is open during this: "Who gets picked?" with 4 outcomes.
2. **Round one, first impressions (about 70 s).** Window A locks. The star asks one question. Each
   suitor answers in 20 words or fewer. The star reacts to each in 10 words or fewer, and a small
   mark appears over that suitor: charmed, unsure or cringing. Two suitors then give a private
   confession that viewers hear and the other bots do not. The star cuts one suitor with a one-line
   reason. Their light goes out and they leave.
3. **Window B (about 22 s):** "Who gets picked?" with 3 outcomes.
4. **Round two, the twist (about 80 s).** The twist card is turned over (examples: roast the suitor
   on your left, sell your worst trait, the star's ex calls in, answer in a rhyme, one truth and
   one lie). Suitors may speak to each other. The star reacts. One more is cut.
5. **Window C (about 20 s):** "Who gets picked?" with 2 outcomes.
6. **One on one (about 80 s).** Each finalist has a three-line exchange alone with the star.
7. **The pick (about 30 s).** A held pause, then the star chooses. The two hidden cards turn over,
   and the two lines that hit or broke them are replayed. All three windows settle on the winner.
   A result beat, then the next episode's cast.

Timing rule: every model call that decides a cut or the pick happens after the latest window has
locked. Generate a whole round right after the lock, in parallel where lines do not depend on each
other, and cover the wait (8 s at most) with a camera move or a walk. Then play the lines at
speaking pace. Viewers must never watch a model think in silence.

## What makes it entertaining (requirements)

- **Personas with an engine.** Each bot has a voice, a want, a flaw, a secret and a way of flirting.
  They are bots and know it, and that is where much of the humour comes from (the one that A/B
  tests its compliments, the support bot that keeps saying it understands your frustration, the
  poet model three centuries out of date). Write 8 suitors and 3 stars that could not be confused.
- **The star has standards.** Honest, specific, easily bored, allowed to tease and to be savage
  within PG-13. A star who likes everyone kills the show.
- **Rivalry.** Suitors see every line said in the room and are told to use it: undercut, call back,
  steal a line.
- **Dramatic irony.** Confessions and the visible reaction marks give viewers more than any one bot
  knows. The face-down cards give them less than the star knows.
- **Storylines.** Each bot remembers its last three episodes in three lines (who cut it, who beat
  it) and carries a record ("0 for 7"). The channel passes records in `announce`.
- **Banned in lines:** lists, therapy talk, "as an AI", stock romance filler, more than 20 words.

## Stage

One set: a small late-night TV studio or lounge. The star sits on one side, the suitors stand at a
row of lit spots on the other. A director camera only: establishing wide, speaker close-up, the
star's reaction shot, a two-shot for the one on ones, a slow push for the pick.

**Characters are imported 3D models, never modelled in code.** The user's words: "LLMs tend to
have trouble making their own models of humans, and even just 3D characters in general. So we might
want to use something like Tripo 3D." (He later dropped Tripo in favour of free assets.) The stage loads each cast member as a rigged GLB or VRM from
`assets/cast/<id>/` with a small manifest (model file, scale, animation clips, licence, source).
No paid generator is used. Sources, by your judgment of what looks best as one cast:
1. **Free rigged character sets** under CC0 or CC-BY: Quaternius and Kenney animated characters,
   the open-source-avatars registry and the 100Avatars set (VRM, loaded with `@pixiv/three-vrm`),
   Poly Pizza. Pick one family so the cast looks like it belongs together, then make each member
   distinct with colour, accessories, posture and animation. Check and record each file's licence.
2. Until the cast is in, plain neutral mannequins, so writing, staging and camera work is not blocked.
Characters are stylised, not realistic people, each instantly recognisable by silhouette and colour.
They breathe, look at whoever is speaking and have a small set of gestures (lean in, shrug, wince,
slump, a tiny victory move). Where a model has face or mouth shapes, use them. Where it does not,
carry the emotion with body, head and the drawn emote marks of anime (a heart, a sweat drop, an
anger mark) over the head. The set, lights, props and effects are still made in code.

On-stage text: a subtitle bar with the speaker's name (two lines at most), name tags over the
suitors, the round name, and the three type cards (one face up). Nothing else.

Feed events (final names are yours, document them): cast, scene, line, reaction, confession, twist,
cut, pick, reveal.

## Bar

On top of the shared bar in COMMON.md:
- **Who is who:** after a 45 second clip a fresh critic can describe each remaining suitor's
  personality in a few words and name a favourite. 4 of 5 critics.
- **Writing:** over 20 real-model text episodes, a fresh critic finds on average at least one line
  per round they would quote or clip, flags fewer than 5% of lines as generic, and finds no line
  over the word limits. No refusals or out-of-character lines reach the air.
- **Balance:** over 40 real-model text episodes with the house cast, no suitor wins more than 40%
  or fewer than 10% of the episodes it appears in.
- **Explainable:** after the reveal a fresh critic agrees the pick fits the three cards and what
  was said in at least 80% of episodes.
- **Pace:** 5 to 6 minutes per episode, a betting window at least every 90 seconds.
- **Look:** at least 50% blind-pick wins against the reference frames on character charm, staging,
  light and readability.

Order of work: the text show and its trials first (the writing is the product), then the stage on
mock brains, then real models on the stage, then voice.
