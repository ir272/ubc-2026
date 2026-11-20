# Pitch deck

File: `pitch/deck/arena-pitch.pptx` (10 slides, 16:9). Built by `pitch/deck/build-deck.js`; run
`NODE_PATH=$PWD/node_modules node build-deck.js` in `pitch/deck` to rebuild. To get it into Google
Slides: upload the file to Google Drive, open it, then File > Save as Google Slides.

How it is used (Ian, Nov 19): he records himself presenting the Google Slides. The clips and images
he talks about are then laid over that recording in the edit.

Status: **first version, not reviewed by Ian.** The order follows his plan. The wording on the
slides is a draft made from his points and the checked facts; he edits it in Google Slides.

## Open questions

1. The name. Slides 1, 3 and 10 say ARENA.
2. The slide wording, all of it.
3. The look. It uses the Twitch light values already measured for the site (page #f7f7f8, cards #ffffff, text #0e0e10 and #3b3b44, lines #e2e2e6), Inter, and no accent colour. It has not been matched to the redesigned site.
4. Whether Ian's camera is on screen, and where, so overlays and the camera do not collide.
5. Where the educated-prediction point goes. It is on slide 4 as step 2 only.
6. Contact details on slide 10: only his name and GitHub are there.

## Slides and how each is used in the edit (fourth version)

Ian's changes, Nov 19 about 21:00: the dead-internet slide also carries "24/7 AI livestreams are
here" and "People are losing faith in traditional streamers", with both pictures, so the stage is
set in one slide; "AI game development is taking off" moves into the what-comes-next section.

Ian's correction, about 21:15, repeated at 21:25: **the platform is a separate recording and is
never on a slide, and no slide reserves space for it.** The slide recording and the platform
recording are two videos, shown side by side in the edit. Slides 3 to 6 are ordinary full slides,
with larger type because each slide is seen at about half the screen.

| # | Title | On the slide | In the edit |
|---|---|---|---|
| 1 | ARENA | One line saying what it is; hackathon, track, Solana | full slide |
| 2 | The dead internet theory is no longer a theory | A stat line (57% bots; 1,000× within five years); under "24/7 AI livestreams are here" an 8 s video (`deck/img/stream-reactions.mp4`): the N3ON clip alone for 4 s, then the reaction posts popping on faster and faster, then a close zoom on "Confirms dead internet theory", circled in red; "People are losing faith in traditional streamers" with nothing under it yet: Ian is getting a new image or video | full slide |
| 3 | ARENA: AI plays AI, live, around the clock | Three lines | side by side with the platform recording (Ian can delete this slide) |
| 4 | How it works | Four short steps | side by side with the platform recording |
| 5 | Built on Solana | Three lines and the devnet program id | side by side with the platform recording |
| 6 | Provably fair | Four short steps | side by side with the platform recording |
| 7 | AI game development is taking off | Sweeney's post and the Kalshi/Xbox post | full slide |
| 8 | What comes next | More categories; outside developers; user-made bots with the security note; real stakes | full slide |
| 9 | In summary | Ian's three points | full slide |
| 10 | ARENA | Ian Roybal, github.com/ir272 | full slide |

Each slide's speaker notes hold its facts, how it is used in the edit and any caution.

Open for the side-by-side: which side each recording goes on.

## Checks done

- The file passes the pptx validator.
- Every slide was rendered and looked at once, in Arial, because Inter is not installed on this Mac. No text overflowed. Inter runs slightly wider, so the fit in Google Slides is not confirmed.
- Not opened in Google Slides. Not checked: whether Google Slides keeps the video embedded on slide 2 when it imports the file. If it shows only a still, upload `deck/img/stream-reactions.mp4` to Drive and use Insert > Video.

## Things a judge may push on

- "No fake money": house bots place small bets in the pools. They are labelled as bots, and it is play money on devnet.
- "We build the games": channels run on scripted stand-in brains unless real models are switched on for the recording.
- Slide 7: the Xbox image is Kalshi's summary quoted by another account, not Xbox's own words.
