# Submission video

## Opening skit, added by Ian (Fri Nov 20, from 04:40). Goes before everything below.

A 27 second cartoon that opens the 3:00, "just a little fun video to hook ppl". Build is **on hold**
until the platform's name is settled (Ian, about 05:10). Files: `pitch/skit/`.

Modelled on two videos Ian supplied (both in `~/Downloads`): a fake livestream with a cartoon
streamer, and the 27 s "Never Stop Clicking" Wojak and Pepe trading meme.

Decided by Ian:
- Characters: Wojak and Pepe, "exactly". Built in Python and rendered in Blender, not flat drawings
  ("we gotta use blender ... do it like kevin ngo"). Two test frames sent at 05:00; he has not yet
  said whether the look is a go.
- Story: a loud streamer on the monitor is on our site betting on Blood Moon. Wojak and Pepe watch.
  Wojak opens a new tab, goes to our site and bets on the **opposite** fighter. His fighter wins by
  KO, he gets an exaggerated payout (about $250,000), cut back to the streamer raging that he lost,
  then Wojak and Pepe celebrate. Then the CTA.
- Streamer's line: "CHAT. I'm feeling the X. I'm putting 100 bands on him bro!" X is a Blood Moon
  fighter, not chosen yet.
- CTA: "Accelerating the Dead Internet." with a link to the platform.
- Music: the audio of the "Never Stop Clicking" video itself (it is "The Box"; he could not find
  that version separately). Its hits are baked in, so cuts follow its timing: quiet to 0:12
  (hits at 3.8, 5.9, 7.8, 9.9), beat from 0:11.9, loud from 0:20.1, last kick 0:26.25.
- The site on the monitors is the real site in Chrome, driven by Claude. Numbers bigger than the
  $1,000 play balance are laid over in the edit.
- Voice: ElevenLabs is connected (key in `pitch/.env.local`, never printed); Ian may use Fish Audio
  instead. Claude will not clone a real person's voice or draw a real streamer (Ian suggested
  IShowSpeed or TJR); the streamer is an original character.

Blood Moon facts for the skit (from `games/brawl/REPORT.md`, 05:15): six fighters (The Count, The
Wolf, The Empty Armour, The Magpie, The Hexer, The Mimic); two AI models each pick one; select
phase 36 s; a fight's median length is 83 s, so the skit shows the prediction and then jumps to the KO.

Open: X and the opposing fighter; the streamer's look; the link; the name.

## Current plan, set by Ian (Thu Nov 19, 20:45 to 21:45). This overrides everything older below.

**No trailer and no launch video.** Ian talks from the first second. Length: 3:00.

How it is made:
1. Ian records himself presenting the Google Slides deck (`deck/arena-pitch.pptx`, 10 slides; see `SLIDES.md`).
2. The platform is a **separate screen recording**. While he explains "How it works", "Built on Solana" and "Provably fair", the edit shows the slide recording and the platform recording **side by side**. Nothing of the platform is on a slide, and no slide reserves space for it.
3. The clips and images he talks about are laid over the recording in the edit.

What he says, in order:
1. **Dead internet and the internet's transition**: "the dead internet theory is no longer a theory..."
2. **The N3ON livestream**, as the sign that 24/7 simulations and livestreams are emerging; then the controversial reactions, which show people are losing faith in traditional streamers and online casinos. Points 1 and 2 are one slide, to go fast.
3. **Our platform**: how it works, how it runs on Solana, how fairness works, with the platform recording beside the slides.
4. **What comes next**, opening with AI game development taking off (the Epic and Xbox posts), then the roadmap.
5. In summary, and contact.

The stream video on slide 2 (`deck/img/stream-reactions.mp4`, built by `trailer/build-rough-05.py`),
as Ian specified it: 8 seconds. The N3ON clip plays alone for 4 seconds; then the reaction posts pop
on and stack over it, each sooner than the last; the final one, "Confirms dead internet theory",
lands in the middle; the picture zooms in close on it and a red circle is drawn round the text.
The posts never cut away from the clip. Sound: a designed pop on each post, a heavier hit on the
last. Nobody has heard it yet.

The losing-faith images on slide 2 are Ian's: the xQc clip page and the Rollbit slot stream.

Still open:
1. The name.
2. Whether Ian's camera is on screen, and where.
3. Which side each recording takes in the side-by-side, and whether the site is recorded wide or in a tall half-width window.
4. The platform recording itself. The list of what it must show is in the shared notes file `pitch.md` and at the end of this file. At 21:45 the runner was in memory mode and the website dev server was not running.
5. Whether the dating show is on the home page for the recording.
6. The slide wording, which Ian edits in Google Slides.
7. The cinetic launch film: installed and tested, not used in the current plan.

## Older plans (superseded, kept for the record)

## Agreed by Ian (Thu Nov 19, evening)

- **Length:** 3:00 in total.
- **Part 1, the trailer.** Opens on the headlines, then shows our platform:
  1. a clip from N3ON's AI livestream, with overlays of provocative reactions and comments, because it was controversial;
  2. clips of streamers being bought out and having fake wins;
  3. our platform.
- **Part 2, the rest of the three minutes.** Ian presents the slideshow: what it is, why now, what is next. One combined recording with three layers: the slides screenshared, his camera as an overlay, and screen recordings of the platform as an overlay, matched to what he is saying. Demo and slides are not presented separately; there is no time for both.

Added by Ian, same evening:
- **The time split is not fixed.** It depends on how long the trailer turns out; cut the trailer first.
- **The trailer also shows the future of the internet and "dead internet" material**, because it ties to the AI stream.
- **Clips:** Ian and Claude go through them together; Ian shows what to get. Claude edits the trailer to an outline Ian gives.

Added by Ian after seeing rough 01:
- **The opening has to build suspense and be emotional.** Screenshots laid over the clip are not enough. Each post pops up one at a time, fills the page, and has a sound effect as it comes on.
- **Style: a TikTok edit that turns into a launch video.** The start is the TikTok edit with strong emotion: the controversial reactions, the N3ON clip, streamers promoting gambling. It then transitions into a motion / launch video of our platform, which can also carry the new internet, dead internet theory and perhaps the Xbox and Epic posts. Those two may instead go in the slides part: "we'll see".
- **Tool: Leon Lin's cinetic** for the launch / motion part.
- **Reference launch video:** https://x.com/adolmeister/status/2123247985693708743

What the reference does (read from twelve frames, sound not heard): 28 s, 1080p, black and white
only. Found footage of well-known speakers under a coarse halftone dot treatment, a new clip about
every 2.5 s. One speech runs through as lowercase captions in a black box, two to four words at a
time. One product widget sits top left the whole time and changes on every cut (a number ticks up,
a logo chip is added, a stepped chart grows). It ends on a white dotted page where the logos
assemble into a grid over a product pill, then a black dotted end card with the logo.

cinetic (github.com/Leonxlnx/cinetic, MIT, about 60 MB): an agent skill for launch films from code,
on Remotion or HyperFrames. Not installed here yet. It needs Node 22+, ffmpeg 6+, Python 3.11+, a
headless Chromium and earshot 0.4 for sound. It starts from the script: what the product is by
3 s, one thing per line, the name and what to do, two to seven words a line; and from a brand kit
(logo, colours, fonts, screenshots). So the launch part waits on the name, the lines and the
redesigned site.

**The whole three minutes, as Ian set it out (latest, overrides the earlier part 2 wording):**
1. The trailer: the streamer material and reactions, then the cinetic film of our platform.
2. Slides, Ian talking:
   - Setting the stage: people are losing faith in traditional online casinos and streamers (comments pop up as he talks); AI game development is seriously taking off (posts from the Xbox CEO and the Epic Games CEO); the internet is in a transition (graphs and stats of AI internet usage and agents).
   - Our platform and how it works, how it runs on Solana, and how the fairness system works.
   - Use cases and future implementations.
   - "In summary", our platform addresses all of these: we don't operate like a traditional online casino and don't rely on pumping fake casino money to streamers; we're builders, we build games; our platform is in line with the transition of the internet.

The slide-by-slide working list is in `SLIDES.md`.

Tools, as of 20:20: cinetic 1.5 and earshot 0.4.1 are installed. cinetic's machine check passed
(`pitch/trailer/films/first-film`: scaffold, type check, grid check, sound kit, a 15 s preview in
44 s, every probe gate ok). The motion-blurred master path was not run.

Everything below this line is a draft, not agreed. The timing table is a placeholder until the trailer exists.

## Open questions

1. Ian's outline for the trailer edit (order, pace, how the overlays look) and a reference trailer or edit he likes.
2. The clip list: links and timestamps, chosen together. Each download needs Ian's yes.
3. The reaction posts and dead-internet headlines. They must be real; I cannot read X, so posts come from Ian as links or screenshots. One sourced line already in hand from the article he cited: bot traffic overtook human traffic on the web in June 2026.
4. Which fake-win clip. The duel.com page cites three: xQc saying streamers get "filled" balances (2022), Roshtein's demo-mode slip (2019), Rollbit topping up AyeZee's wallet (2022).
5. Music for the trailer.
6. The one sentence the trailer ends on (`STORY.md`, drafts A to D), and the name.
7. Which game carries "what it is". Assumed: The Scrivener on real models.
8. ElevenLabs: its bounty needs its audio heard in the video. In or out?

## Trailer material in hand (`pitch/trailer/`, not tracked by git)

Supplied by Ian on Nov 19:

| File | What it is | Ian's instruction |
|---|---|---|
| `src/n3on-first-15s.mp4` | First 15 s of his download of N3ON's "This is my last stream as a human being" clip (source is 40 s, 1280x720, 24 fps). Six AI-made scenes, a HIGGSFIELD GPT-6 ASTRA badge top right, stream chat top left. | "we can use the first 15 seconds" |
| `src/posts/reddit-lsf-backlash-headline.png` | r/LivestreamFail headline: N3on facing backlash for becoming an 'AI' streamer | reaction |
| `src/posts/x-zigzagfilla-dumbest.png` | X post: "This is the dumbest shit I've ever seen !!! But the way the world is people will watch this nonsense" | reaction |
| `src/posts/x-maya-never-has-to-stop.png` | X post: "THOUSANDS WATCHING AN AI STREAM AND IT LITERALLY NEVER HAS TO STOP THIS IS WILD" | reaction |
| `src/posts/x-thefloor-wild-concept.png` | X post: "Wild concept" | reaction |
| `src/posts/x-pttcoin-ai-take-over.png` | X post: "We are watching Ai take over slowly." | reaction |
| `src/posts/reddit-dead-internet-theory.png` | Reddit comment: "Confirms dead internet theory" | reaction; bridge to the dead-internet part |
| `src/posts/x-sweeney-epic-ai-pivot.png` | Tim Sweeney, Oct 12, 2026: "huge pivot underway here at Epic ... maximum AI acceleration"; "survive the AI revolution" | "games are BULLISH"; placement not decided |
| `src/posts/x-sciencegirl-kalshi-xbox.webp` | An account quoting Kalshi: "Xbox CEO creates a new team to study recreating games inside other games with AI" | same; this is Kalshi's summary, not Xbox's own words |

Rough cuts (`out/`):
- `rough-01-n3on-reactions.mp4`: timing rough only. The 15 s clip scaled to 1080p with the six
  reaction screenshots untouched, one every 2.4 s at the bottom, the clip's own sound. No look
  has been designed. Not reviewed by Ian yet.

- `rough-02-intercut-pops.mp4` (19.7 s, built by `build-rough-02.sh`): the clip intercut with the
  six posts. Each post cuts in full screen on its own page colour, pops in and lands with a hit.
  Posts come faster toward the end and the last one, "Confirms dead internet theory", holds. The
  hit is a stand-in: two recordings copied from The Scrivener's library (`src/sfx/`). The order,
  the pace and the sound are a first guess for Ian to redirect. Sound not heard by anyone.

- `rough-03a-stack-column.mp4` and `rough-03b-stack-pile.mp4` (15 s each, built by
  `build-rough-03.py A|B`): after Ian's correction. The clip plays through without cutting away;
  from 4 s the six posts pop on one at a time and stay, each with a short designed pop from the
  earshot kit (a heavier hit on the last). 03a stacks them as a neat column down the middle; 03b
  as an overlapping pile that covers the frame. Sound not heard by anyone.

Still to collect: the staged-gambling clips, dead-internet material, our own platform footage, music.

## Proposed timing (draft)

| Time | Part | Picture | Sound |
|---|---|---|---|
| 0:00–0:12 | Trailer: the AI stream | N3ON's AI stream clip; real reaction posts cut over it | Music starts under the clip |
| 0:12–0:22 | Trailer: staged gambling | A streamer's fake-win or "filled balance" clip; one source line on screen | Music builds |
| 0:22–0:40 | Trailer: our platform | Our own game footage and the site, cut to the beat; ends on the wordmark and the one sentence | Music peaks and ends |
| 0:40–1:50 | What it is | Platform recording fills the screen, Ian's camera in a corner: arrive with no sign-in and $1,000; read the match and the Form tab; bet in one click; result and payout; Fair play tab and the Solana transaction | Ian, about 175 words |
| 1:50–2:25 | Why now | Slides, Ian's camera in a corner, short platform clips where they fit | Ian, about 90 words |
| 2:25–3:00 | What is next | Slides: categories; outside developers and user-made bots earning a share of fees after security work; real money; contact | Ian, about 85 words |

Spoken budget for part 2: 2:20, about 350 words at an unhurried pace.

## Notes on the draft

- The guide asks for a "demo video showing the product in action" and judges score the demo. So in
  "what it is" the platform recording is the main picture, not a small overlay, and it includes one
  unbroken bet-to-payout take.
- Simplest way to record part 2 in one take: put the platform recordings inside the slides as video,
  then record the slideshow once with a camera bubble.
- Outside clips: keep each to a few seconds and do not use their music. Upload the finished video
  unlisted early on Friday to see whether it is blocked or claimed, and keep a Google Drive copy; the
  guide accepts either link.
- N3ON appears as the AI-stream headline. If he is also shown as a paid gambling promoter, the two
  uses pull against each other.

## Recordings the video needs from the build

None has been checked against the redesigned site yet.

| # | Recording | Used in |
|---|---|---|
| 1 | A fresh browser opens the site: no sign-in, $1,000 there, live channels by category | What it is |
| 2 | The Scrivener before bets close: builds, temper, then the Form tab | What it is |
| 3 | One unbroken take: bet placed, match result, payout lands (devnet) | What it is |
| 4 | Fair play tab for that settled window, and the transaction on a Solana explorer | What it is |
| 5 | Best ten seconds of each game: The Scrivener, Ringout, Tumbletop | Trailer, why now |
| 6 | House bots shown with their bot label | Wherever pools or chat are on screen |

## Not started

Trailer shot list, the timed script (Ian's words), slide content.
