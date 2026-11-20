# Tumbletop round log (Thu 2026-11-19)

Each round ends with a build that plays a full show. Scores come only from fresh-context critics
who see stills and the brief's bar, never from the builder.

## Round 0, 07:15 to 07:45: roster, three rounds, checks

Built:
- `sim/roster.js`: 24 permanent Gumbles (name, two colours, pattern, four stats 2 to 9 that sum to 22).
- `sim/rounds.js`: three rounds as separate stretches of Attic Dash. Round One: start, Spinning Top
  Field, Bookshelf Climb (16 start, 8 through). Round Two: Ruler Seesaws, Metronome Bridges (8 to 4).
  The Final: Alphabet Block Maze, Final Dash under the pencil to the arch (4, one winner).
- `sim/sim.js`: `createSim({ seed, round, entrants, lobby })`; stats drive pace, footing, recovery and
  risk; drop-in points every half section, so a fall costs seconds and not the round.
- `sim/simulate.js`: `simulate({ seed, entrants, options: { round } })`, `simulateShow`.
- `show/script.js` (the show as a script over the platform's Show), `show/fakeShow.js`,
  `show/clock.js`, `show/records.js`, `channel.ts`, `index.ts`, `sim.ts`, `tools/match.mjs`.

Decisions taken without the owner (his call, default taken):
- **Round lengths are about 27 s, 26 s and 22 s, not the brief's 60, 45 and 35.** The whole course
  takes a median racer 79 s, so three separate stretches cannot add up to 140 s. The choice was
  separate stretches (each round its own place and obstacles) over rounds that re-run the same
  sections. A show still runs 4:15 with the 40/30/30 s betting windows. `sim/rounds.js` is data: a
  round is a start line and a finish line, so longer overlapping rounds are a small edit.
- **Racers outside the qualifying places push harder** (5% more pace, less caution). Without it
  round two averaged 1.5 changes of the last place in its final 10 s; with it 2.9.

Checks (`node tools/checks.mjs --shows 1000`):

| Check | Result | Bar |
|---|---|---|
| Determinism | same seed, same hashes (node) | identical |
| Completion | 1000 shows, 0 rounds ended on the clock | 200 shows, none stuck |
| Balance | win rate 3.6% to 9.5% per Gumble | 2% to 15% |
| Stats matter | fastest third 7.1%, slowest third 4.7%, ratio 1.50 | above 1, under 2 |
| Drama | 3.93 (round one), 2.93 (round two) changes in the final 10 s | 2 each |

`npm test`: 19 of 19 pass. No stills yet, so no critic round.

## Round 1, about 07:45 to 08:15: the stage, first critics

Built:
- `web/src/stage.js`: the stage as a module driven only by the feed (call, line-up, round replayed
  from its seed on the channel's clock, cut, recap, result), rebuilt cast per round, joins at any
  second from a snapshot. `tools/capture.mjs` and `tools/crosscheck.mjs` rewritten for it.
- `web/src/show/raceHud.js` (tower around the cut line, one event line, name tags, countdown, cut
  call) and `web/src/show/cards.js` (call, line-up straps, title, recap, result). Old HUD, round flow,
  keyboard help, five-line feed, confetti and stamps deleted.
- `web/src/camera/showDirector.js`: home shot is the fight at the cut line; `cutline` framing added.
- `web/src/show/sound.js`: synthesised music box per phase, pips, bells, knocks.
- `tools/platform-smoke.mjs`: the channel on the real runner (memory chain): all checks ok.

Critics (four fresh ones, stills only; one per round clip, one on the phases):

| Clip | Comprehension (how many through, who is on the edge, where is the pick) | Readability | Looks pro | Camera |
|---|---|---|---|---|
| Round One | all correct | 5 | 6 | 4 |
| Round Two | all correct | 5 | 7 | 3 |
| The Final | all correct (pick named at 60% confidence) | 6 | 6 | 4 |
| Phases | phases distinct 5, betting rhythm 4 | | 6 | 4 |

Biggest gaps named: the camera is not on what the graphics talk about and the payoff (a place
being taken, the cut) is never on screen (all three round critics); no single moment when the
line-up locks: clock to zero, then a title card, then a second countdown (phases critic). Also: a
tower row caught mid-slide on the wrong side of the line, the pick is never explained, "Round One"
small above the big count reads as a label-above-heading tell, captions about Gumbles not in shot,
name tags over the wrong creature, straps overlapping, the recap is a nine-line table.

## Round 2, about 08:15 to 08:25: follow the line to the line

Changed in answer to round 1:
- Run of show: the round's title call now opens the line-up; ONE clock runs from there to the start
  gun; the lock is a beat (the clock row inverts to "Line-up locked", the camera cuts from the faces
  to the whole grid, a bell) and the 3 2 1 is the same clock. `titleMs` 4.5 s became a 2 s lock beat.
- Director: whenever a Gumble is within 11 m of the line the finish-line camera takes over, so every
  place is seen being taken and the last one most of all. Home shot cut down to two or three
  subjects on a long lens. Cut beat is a close-up, tagged, of the Gumble who just missed.
- Name tags only on Gumbles that are in frame, near and not hidden. The event line only talks about
  Gumbles named on screen (or the pick).
- Tower: title bar, no row sliding, "m back", "your pick", a progress strip to the finish, every
  qualifier listed at the cut. Cards: straps with stems tied to heads, a finalists board with all
  four side by side, shorter recap, "Next show in" after the result, the pick's fate on the cut and
  the result.
- Node vs browser: 9 of 9 rounds match by state hash (`tools/crosscheck.mjs`).

Critics on the round 2 build (four fresh ones):

| Clip | Comprehension | Readability | Looks pro | Camera |
|---|---|---|---|---|
| Round One | all correct, pick named at 95% | 5 | 6 | 4 |
| Round Two | all correct, pick named at 98% | 5 | 6 | 4 |
| The Final | all correct, pick named at 97% | 6 | 6 | 3 |
| Phases | every open and both captured locks identified; phases 6, betting rhythm 5 | | 6 | 3 |

Biggest gaps named: the ticker contradicts the tower and arrives late (Round One); the last place
is taken between stills and "..." hides who is through (Round Two); the final is a solo follow of a
runaway leader, won by 28 m, and the pick's collapse happens off camera (Final); the lock is a corner
box changing colour while open and result get full cards, and the corner clock reads 0:00 under the
3 2 1 (phases). Also: props in front of the lens in the round two and final line-ups and at the
finish, the winner shot from behind for 20 s, strap stems ending above heads, the finalists board
covering the finalists.

## Round 3, about 08:25 to 08:35: the lock, the lens, a closer final

Changed in answer to round 2:
- Sim: in the final, the further back a Gumble is the harder it pushes (up to 18% at 8 m), so the
  four stay one race: median winning margin 23 m became 11 m, lead changes 3.3 became 4.5. The final
  now starts in pairs on the ends of the two crayon bridges (room for a line-up camera). Round one
  finishers stand in two files at the sides so the line stays in view. Gaps are worded one way
  everywhere ("a whisker" only under half a metre). Speed span trimmed to keep the stat ratio near 1.4.
  Checks over 2000 shows: completion 0 on the clock, win rate 4.2% to 8.0%, fastest third 1.40
  times the slowest, drama 3.95 and 2.98.
- The lock is its own phase and the loudest card: a full-width band "Line-up locked", a hard cut to
  the whole grid from above, a bell. The tower shows no clock until Go.
- Cameras per round: line-up walk distance set for what stands in front of each grid, finish camera
  high over the line in round two and the final (the banner is lifted out for that shot), no Gumble
  is ghosted for a show camera, winner shot swings in front of its face. Small fields go straight
  to the line at Go. A hit or fall of the viewer's pick brings a three-second cutaway to it.
- Event line: incidents only (hit, fall, near miss), only about Gumbles named on screen or the pick,
  shown at once.
- Tower: full list for eight or fewer, fixed height, paper-white line with its label above it and
  "behind 8th" under it, solid numerals, 2nd/3rd/4th in the final. Cards: straps touch heads,
  slimmer finalists board, cut call and winner card share the lower left.

Critics on the round 3 build:

| Clip | Comprehension | Readability | Looks pro | Camera |
|---|---|---|---|---|
| Round One | all correct | 6 | 6 | 4.5 |
| Round Two | all correct | 6 | 6 | 4 |
| The Final | all correct; no generic-UI tells found | 5 | 5 | 3 |
| Phases | all opens found, two of three locks (the third fell between stills); phases 6, betting rhythm 4 | | 5 | 3 |

Biggest gaps named: the payoff at the line is unnamed and the cut close-up is an unlabelled grey
creature (Round One); the pick's fall is read in a caption, not seen (Round Two); the final never
shows two racers with a gap between them (Final); the open window has no persistent state and the
clock counts to the start, not the lock (phases). Also: name tags float over the wrong creature
under a steep lens, "fell" reads as eliminated, "..." hides who is through.

## Round 4, about 08:35 to 08:45: stay with the same Gumbles

Changed in answer to round 3:
- Director: the home shot keeps the same Gumbles for at least 3.2 s; one early look at the leader
  per round; the finish camera only for the first crossing and for the last places.
- The final in the maze is a side-on tracking shot of all four (the course runs left to right).
- The line-up clock counts to the lock and says "Line-up open" the whole time. Each line-up card
  carries a measured hint: Round One "Speed counts most here", Round Two "Nerve and grip count most
  here", the Final "Speed helps. The blocks decide" (from who goes through over 1500 random fields).
- One winner card from the instant the final ends. The cut call leads with the news ("Gherkin takes
  the last place"). Tags have a pointer on the Gumble's head; any Gumble close to the lens is named.
- Tower: one solid bar for the line ("Top 8 go through", "gap to 8th"), no "fell", one meaning per
  chip colour. Eliminated Gumbles keep their colours.
- Frame rate (`tools/perf.mjs`, a whole show in real time, headless Chromium on the M4's GPU):
  median 16.7 ms, 0.05% of frames over 25 ms, stage work 1.5 ms a frame. 60 fps.

Critics on the round 4 build:

| Clip | Comprehension | Readability | Looks pro | Camera |
|---|---|---|---|---|
| Round One | all correct | 7 | 7 | 6 |
| Round Two | all correct | 6 | 6 | 4 |
| The Final | all correct | 6 | 6 | 3 |
| Phases | all opens, two of three locks; phases 6, betting rhythm 6 | | 6 | 5 |

Biggest gaps named: "..." hides places 2 to 6 while they are being taken (Round One); the finish
camera watches the leaders walk in while the pick loses the last place elsewhere (Round Two); the
final is a runaway shown as one racer alone (Final); the open window is a small dark box that
looks like every other card (phases).

## Round 5, about 08:45 to 08:55: the open bar, the chase

Changed in answer to round 4:
- A full-width white bar along the bottom for the whole open line-up ("Line-up open", the clock);
  at the lock it swells into the lock band. The corner plate keeps only the round, rule and hint.
- Director: after the first crossing the finish camera comes back only when the Gumble holding the
  last place, or the one chasing it, reaches the line. A runaway final alternates every three
  seconds between the leader and the chase, with "X leads by N metres" on the event line.
- Round One's tower opens up to places 1 to 10 from the first finisher. Progress strip removed.
  Countdown numerals are ink plates in the package's style. Smaller cut call.

Critics on the round 5 build:

| Clip | Comprehension | Readability | Looks pro | Camera |
|---|---|---|---|---|
| Round One | all correct | 7 | 6 | 4 |
| Round Two | all correct | 7 | 6 | 3 |
| The Final | all correct | 7 | 6 | 4 |
| Phases | every open and every lock identified; phases 7, betting rhythm 7 | | 5.5 | 4.5 |

Biggest gaps named: the finishers cross off camera (Round One, which wants the line) and the
camera watches the leaders finish while the pick loses the last place (Round Two, which wants the
fight): opposite asks for the same seconds. The final is shown as numbers, not a chase. The
betting window does not show the whole field (with 14 s windows in the capture; 30 to 40 on air).

## Round 6, about 08:55 to 09:05: formal tests

Changed in answer to round 5: the finish camera is now only for the Gumbles fighting for the last
place (the first-finisher cutaway is gone); the final's header reads "Noodle 55 m from the line";
"out by 3.0 m" on the first one out; the rule is said once in the line-up; the lock shot pushes in;
the opening shows the sixteen on the grid after the format; the tower follows the order at once so
it never disagrees with a name tag.

**Comprehension, the brief's test** (`tools/comprehension.mjs`; 15 fresh critics, one clip each: five
different shows per round, 12 stills over 20 to 26 s, a different pick each time; a clip passes when
the number that go through and the pick are right and at least three of four place answers are):

| Round | Passed | Bar |
|---|---|---|
| Round One | 4 of 5 | 4 of 5 |
| Round Two | 5 of 5 | 4 of 5 |
| The Final | 5 of 5 | 4 of 5 |

Every critic named how many go through and the pick correctly (15 of 15). The one failure read the
first Gumble outside the line and the pick's place one row off in one frame.

**Look against today's build** (`tools/blindpairs.mjs`; 8 label-stripped shuffled pairs, three fresh
judges, "which is more readable to a first-time viewer"): the three-round show was picked 21 of 24
times (88%). Bar 50%.

**Final verification:** a whole show at the real 40/30/30 s windows runs 4:18 with no page errors;
joining at seven points lands in the right phase and round; 60 fps (median 16.7 ms, 0.02% of frames
over 25 ms); `npm test` 19 of 19; node and browser agree on 9 of 9 rounds; the channel passes
`tools/platform-smoke.mjs` on the real runner.

## Round 7, about 09:20 to 11:20: longer rounds, the race camera on video, dead air, sound

The owner's decisions arrived by way of the lead session: keep both catch-up rules, keep the tower
opening to ten rows, lengthen Rounds One and Two, then work on the race camera (judged on video),
dead air, the idle state and a mid-show join, and sound. Brand work was dropped.

**Longer rounds.** Round One now runs the tops, the marble climb and the ruler seesaws (three
sections), Round Two the metronome bridges and the block maze, the Final the maze and the dash
(each round overlaps the next by one section). Median race 40.9 s, 34.8 s and 22.6 s; a show is
about 4:30. `npm run checks` over 2000 shows: 0 rounds on the clock, win share 4.3% to 9.0%,
fastest third against slowest third 1.33 times (`speedSpan` went from 1.0 to 1.25 to hold that),
4.61 and 4.08 changes of the last place in the final 10 s. SIM_HASH changed.

**The race camera, judged on video.** `tools/strip.mjs` captures 4 frames a second and tiles them
3 by 3; a fresh critic reads 13 sheets (28 s) per round as one clip. Seven versions:

| Version | What changed | R1 | R2 | Final |
|---|---|---|---|---|
| v1 | the old cut-line shot, all cutaways off | 3 | 3.5 | 4 |
| v2 | one steady tracking shot on the fight for the last place; final side-on | 3.5 | 4 | 5 |
| v3 | height follows the course, push in at the line | 4 | 3 | 3 |
| v5 | maze blocks in front of a racer go see-through; the place holder is always in shot | 4 | 3 | 4 |
| v7 | one cut to a camera past the line as the last place arrives | 4 | 4 | 4 |
| v10 | that camera head-on to the Gumble taking the place, those already through cleared from the foreground, winner card held 0.9 s | 3 | 4 | 4 |

Absolute scores did not move: every fresh critic finds its own list of clipped racers and scenery.
What did move is what they saw. Asked "did you see the last place taken on camera", v1 to v5 said
no in every clip; at v10 the final's winner was seen crossing, Round Two's "more or less", Round
One's "half-seen" (two Gumbles cross within a quarter of a second).

**Blind picks** (the same race, two unlabelled cameras, one fresh judge each, "which would you put
on air"): the Director was picked 3 of 3, each time "clear" or "obvious".

| Race | Director against | Judge's scores |
|---|---|---|
| Round One | Leader (chase the leader) | 6 against 4 |
| Round One | Overview (a wide shot) | 7 against 3 |
| The Final | Leader | 6 against 4 |

After the blind picks: the line camera holds 1 s past the crossing (judges saw an empty line), and
in Round Two the cut's close-up goes to the Gumble who took the last place.

**Dead air** (`tools/deadair.mjs`, a whole show at the real window lengths): the longest stretch in
any phase with nothing moving is 0.2 s (bar 2.5 s).

**Idle and a mid-show join** (one fresh critic; four idle stills, six side-by-side pairs of a
viewer from the start and a viewer who joined at that second). Join: "mostly"; every number, name,
pick and clock matched in all six. Gaps it found: a joiner's maze blocks started solid (fixed: no
ease on the first frame), a joiner does not get the event line for an incident from before it
joined (left), and the two cameras differ while one is still easing (left). Idle scored 4: it said
only "Next show starts soon" over an empty course. It now says the format in one line above that.

**Sound** (`tools/sound.mjs` renders a whole show offline with the live voices; a fresh critic
measures the file with ffmpeg and cannot hear it). First mix: 4 of 10, "mixed flat" (range 3.8 LU),
hits buried at +6 dB, nothing under 150 Hz or over 8 kHz, races that do not build. Reworked: one
mixer for the live and offline paths, the bed ducks under one-shots, a low thump under hits and the
lock, races build over their length (louder, an octave doubled in, a hat, a soft kick), the final
builds faster, a soft ceiling instead of a hard compressor. Second critic: 6 of 10; -16.1 LUFS,
range 8.8 LU, true peak -2.5 dBFS, no clipping; betting -20.9, the lock +6.5 LU over it; Round One
race -18.8 to -12.0, the final 2.2 LU louder. Still open at that point: the fanfare only equal to
the lock, hits buried in the final, almost nothing above 8 kHz, half-second holes in the recap. A
third pass addressed those four (numbers in REPORT.md).

**The final, the owner's version against mine** (blind, same race). All four side-on to the line
(the owner's words) against side-on on the front pair plus the line camera: the line-camera cut was
picked by 2 of 2 judges (7 and 6 against 5 and 5), both saying the other was easier to follow in
the maze. Combined (all four in the maze, the front pair on the dash, the line camera): picked over
the earlier cut by 1 of 1 (6 against 5). The combined cut is the default; `?finalside=all` on the
dev page shows the owner's version.

**Comprehension on this build** (15 fresh critics, one clip each, graded by the tool): Round One
5 of 5, Round Two 5 of 5, the Final 5 of 5, every one of the 90 answers right (the first edition
had 14 of 15). Four of the five final critics said nothing on screen states that the final has one
winner; the tower's rule bar now reads "One winner" under first place in the final.

**Sound, passes three and four.** Third critic: 6 again (the room tone I added to fill the recap
holes measured as hiss at -42 dBFS; the fanfare still only level with the lock). Fourth mix: hiss
out, a soft held tone under the slow phases, the fanfare rung twice over a held chord with the bed
ducked 16 dB, a quieter bed in the final. Fourth critic: 7 of 10; -16.5 LUFS, range 6.8 LU, peak
-2.0 dBFS; the fanfare is the loudest passage by 2.2 LU; no holes, no hiss. Open: hits in the final
+7 dB over the bed, a dark held tone under the line-ups (lightened afterwards, level-checked only).

**Final verification, 11:20:** `npm test` 19 of 19; node and browser agree on 9 of 9 rounds; a whole
show at the real windows runs 4:34 with 0 page errors; joins at 70 s, 150 s and 262 s land in the
right phase; median 16.7 ms a frame, 0.05% over 25 ms; the channel passes the platform smoke test.
One slip on the way: an edit to the name tags threw on every frame for about fifteen minutes and
silently spoiled one batch of captures; the batch was re-run from scratch after the fix.

## Round 8, from about 11:45: the owner watched it on the site

His words on the stage text: "All that text is straight slop. Who wants to see that, bro?" Rule
from the lead session: the stage shows names, positions, the cut line, the clock, a phase title of a
word or two, the winner; if removing a string would not stop a viewer following or betting, it goes.

**Cut:** the format line and round chips on the call; the place name, hint and rule under every
round title; trait words, records and "7th in Round One" on line-up name straps; the final's stat
board; the event line ("X got smacked by a metronome"); the plate at the cut ("X takes the last
place", "misses out by 3.3 metres", "Your pick is through"); reasons in the recap; the winner's
record line, the pick line and the 2nd/3rd/4th strip on the result; the "Tumbletop" header on every
plate; the tower's count line, gap numbers, "gap to 8th", "through", "out by", the final's "N m
from the line"; the clock after the finish. The lock is a slim bar, not a banner.

**Left on screen:** "Line-up in 0:09" and sixteen names; "Round One"; a name over each Gumble in the
line-up; "Line-up open 0:07"; "Line-up locked"; the tower (round, clock, place chips, names, "Top 8
go through", "your pick", "out", "Round over"); name tags in the race; "Out" and "Through" with
names and "Round Two in 0:04"; "Sherbet wins"; "Next show in 0:13"; "Next show soon".

**A fresh critic audited 24 stills against the owner's rule**: after the first pass "nearly" (about
eight repeats left, listed string by string); the second pass removed all of those except the
recap's "Out" list, kept because Round One's tower shows only ten of the sixteen.

**Comprehension on the stripped build** (15 fresh critics): Round One 5 of 5, Round Two 5 of 5, the
Final 5 of 5, the same answers as before the cuts. Six of them said "8 places left" confused them
(it does not change until someone finishes), so that line went as well. All five final critics
said nothing states that the final has one winner; all five still answered 1.

**Sound hook:** `unlockAudio()` is on the handle (CONTRACT.md, sound hooks); the dev page calls it
on the first click or key, as the site does. No sound button or hint is drawn.

**Recorded sound (owner approved the downloads in this session's chat, 15:50).** Six CC0 downloads
(three OpenGameArt files, three Kenney packs); fourteen files kept, 2.6 MB, listed in `ASSETS.md`.
The mixer plays any file in `web/src/audio/` by name and synthesises a stand-in for any that is
missing. Music: "A respectable amount of Bounce" (electric piano, 77 s, level steady throughout),
chosen over a 17 s piano loop that would have repeated fifteen times a show; looped with a 1.5 s
crossfade in the mixer. This ffmpeg cannot write Ogg Vorbis, so one-shots are WAV and the music is
AAC, which every browser decodes. First recorded mix measured -26 LUFS (the track is quiet at the
source); after levelling: -17.4 LUFS at the dev default volume, range 6.2 LU, true peak -2.2 dBFS,
betting -20.5, the lock -16.5, the final's race -15.4, the win and result -15.0. Live check: all
fourteen files fetched after a click on the dev page, no console errors; a production build bundles
them.

Critic by measurement, recorded mix: 5 of 10 (plus or minus 1.5): nothing harsh or clipped, but the
win not a clear peak, hits uneven, ducking that pumped, a very dark spectrum (81% between 150 Hz
and 1 kHz), a 2.5 dB sag at one loop join. Remix: a cut at 250 Hz and a shelf from 2.8 kHz on the
music, an equal-power crossfade at the join, ducking never deeper than 6 dB with a slow release,
the win's jingle on both of its calls with applause under it, the chime and applause through a
bright shelf, less thump under the lock. Second critic: 6 of 10 (plus or minus 1.5); -17.5 LUFS,
range 6.8 LU, true peak -1.8 dBFS; pumping fixed, the lock's low end fixed, the win, the hits, the
tone and the join partly. I stopped there: the next change should come from someone listening.
`docs/round-one-with-sound.mp4` (one minute: the lock, the 3 2 1, Round One, the finish) was sent
to the owner for that.

**The owner listened (about 16:10): "this sound you showed me is absolutely horrible."** Reading
my own mixer, the cause that is certain: to reach the loudness and "events over the bed" numbers
the measurement critics asked for, I had the music at 6.4 times its level and the one-shots at up
to 3 times full scale, through a fast compressor and a soft clipper, with a 7 to 9 dB treble shelf
and pitch-shifted chimes. It measured 6 of 10 and no critic flagged distortion. Lesson for this
loop: a critic who cannot hear cannot judge sound, and I should not have tuned to its numbers.
Rebuilt clean: recordings go straight to the output with headroom (no compressor, clipper,
equaliser or pitch change, nothing layered under them); the track's peaks sit about -3 dBFS and a
one-shot's about -5; the music eases 3 dB under the three jingles only. The render is stereo now.
-20.3 LUFS, true peak -3.3 dBFS, no clipping. Whether the track and the effects themselves are
any good is still unknown: `docs/sound-audition.mp4` plays each one alone and untouched so the
owner can say which to throw out.

**The owner on the audition (about 16:35): "the music is fucking horrendous."** The track is out
of the build; with no music file the stage now plays no music at all (the synthesised music box,
which he had already rejected, is off too). He asked for every sound separately: fifteen labelled
clips are in `docs/sounds/` and were sent to him one by one. I chose that track by its tags and its
steady level; it had 26 downloads and no favourites, which should have told me nobody had vouched
for it. The next candidates are picked by how widely they are used.

**The owner on the separated clips (about 17:00):** Music A "dogshit"; the countdown pip, go, tick,
lock, qualify chime, last-place jingle, win jingle, applause and fall all "trash" ("sounds like
AI"); "we gotta try earshot." All ten are out of the build; only the four hit sounds remain (he
did not mention them), with no music and nothing synthesised.

**Earshot** (github.com/Leonxlnx/earshot, MIT, installed in `.tools/earshot`, gitignored) lets an
agent listen: it ranks files against a description and reads each as a real recording or
code-synthesised. Its read of what he rejected matches his ears: the Kenney pip, go, chime, lock
and fall score 1 to 5% real ("likely code-synthesised") and Music A 18% ("a plucked synth
arpeggio"). So the rule from here: nothing below about 60% real goes in front of him, and nothing
goes into the build until he has heard it on its own.

Second audition, sent as 23 separate clips (`docs/sounds-round2/`): five Kevin MacLeod tracks
(CC-BY 4.0, real 95 to 99%) and eighteen Mixkit effects picked from 49 downloaded candidates by
Earshot's fit and realness (race and spoken countdowns, bells, chimes, crowd cheers, applause,
cartoon falls). Mixkit's music licence does not allow use in games, so music comes from elsewhere.

**The owner on the second audition (about 17:20):** the five music tracks "don't fit ... as a
spectator experience", and one track for the whole show is wrong in itself. He also asked for the
scene Fall Guys shows after a round: who is left and who is out (he sent a screenshot).

**Elimination board** (`web/src/world/rosterBoard.js`): the recap after Rounds One and Two is now a
toy shelf hung in the attic in front of the gable window, one cubby per starter in the show's
entrant order, each with its name on the shelf edge. The Gumbles knocked out this round are
shuttered one by one (the back of the field first, the one who just missed last), shutters from
earlier rounds are already down and dimmed, the viewer's pick has a white frame, then "8 remain"
(or "4 remain") and a clock to the next round. Our own look, not a copy of that screen. It is drawn
from the recap event alone, so a late joiner sees it at the same point. First version sent to the
owner as `docs/elimination-board.mp4`; not yet judged by him or a critic.

**Music by part of the show.** The mixer now takes a track per part (`music-lineup`, `music-race`,
`music-race-2`, `music-final`, `music-win`), crossfades at each change and loops a short track; a
part with no file is silent. Candidates this time were filtered from Kevin MacLeod's catalogue
listing (1,443 pieces) for electronic and funk instruments, a bouncy or driving feel and 105 bpm or
more, then ranked per part by Earshot, dropping everything it read as chiptune or code-made. Eleven
sent as separate 30 s clips (`docs/music-by-phase/`): three for the line-up, five for the races,
two for the final, one for the win. Nothing is in the build until he picks.
