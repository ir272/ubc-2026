# Compatibility Mode: art direction

## The hangout (owner, Thu 14:25: this section wins over everything below it)

His words: "we dont need the \"The Walk-on\" and \"Brutal honesty\" weird text stuff. its supposed to
feel like a VR Chat organic dating, not some BS like this." Earlier: "pls get rid of unnecessary
text/shapes/objects. i want a clean look to the game".

So this is not a TV game show with a set, podiums, cards and captions. It is a group of avatars
hanging out in a room, the way a VRChat world looks when someone films it: people standing at
talking distance, turning to each other, walking up, drifting off, with nameplates over their
heads and what they say floating above them. Everything the format needs is carried by where
people stand, what they do and what they say. Nothing is printed on the screen to explain it.

- **No screen text at all** except speech. No round name, no title calls, no cards, no twist card,
  no result banner, no labels. The star says the things that used to be printed (her intro names
  what she likes tonight, she reads the twist aloud, her reveal lines name the hidden cards).
- **Speech is a chat bubble over the speaker's head**, VRChat chatbox style: a plain dark rounded
  bubble with light text, anchored above the avatar, sized in screen pixels so it reads at 960x540,
  kept inside the frame, two or three lines at most, gone a beat after the line ends. A small
  **nameplate** (name only, plain dark plate, accent-coloured edge) floats over every avatar that is
  in frame; the speaker's plate is the lit one. No subtitle bar at the bottom.
- **The world** is a small, clean hangout room at night: a couch for the star, a rug, a large
  window with a calm night city, one door, soft warm light. Nothing else. No podiums, no lamp
  columns, no studio, no clock, no sign.
- **Standing is physical.** The suitors stand in a loose arc around the star at talking distance.
  When she is charmed by someone they step closer; when she cringes they shuffle back. Who is
  ahead is whoever is nearest her. No tallies.
- **Reactions are emotes** popping over the head (a heart, a sweat drop, gloom lines), as avatars do
  in VRChat. They pop and go. Nothing is kept on screen.
- **The cut is someone leaving the room.** The two in danger step forward, a held silence, the star
  speaks, the cut one sags, says their last line on the way to the door, and walks out. Their
  nameplate goes with them.
- **A confession is an aside:** the suitor steps away from the group toward the camera and talks to
  it quietly; the others carry on, dim and soft, behind.
- **The one on one:** the finalist sits down next to the star on the couch. The other waits by the
  window, back turned.
- **The pick:** both stand in front of her. She gets up. Silence. She walks to one. The other leaves.
  The winner sits down beside her. That is the result; nothing is printed.
- **The camera is a person in the room**, at eye level with a slight handheld drift, a wide-ish
  lens, usually holding two to four avatars in frame so it reads as a conversation. It turns to
  whoever speaks and steps in a little, as someone filming friends would. No tight single-face
  television close-ups, no cutaways that show one avatar while another one's bubble is on screen.
- **Bets open, locked** show only in the room's light: warmer and brighter while a window is open,
  dropping a step at the lock.
- Cel look, palette and the avatars stay as they are.

One sentence: **a 1980s anime cel of a late-night hangout room, with toy-like avatars in it.**
The owner's approved taste is 1980s anime cel. He rejects, on sight: gradient balls, glows,
bloom, purple gradients, beige, decorative particles, shockwave rings, fake stamps and tickets,
eyebrow labels, monospace uppercase text, emoji, em dashes in on-screen text. None of those, ever.

## Clean look (owner's instruction, Thu 12:55: this section wins over everything below)

(Written for the studio. In the hangout the text list is speech bubbles and nameplates only, and the
objects are the room's: see "The hangout" above and "Set" below. The test still holds.)

His words: "pls get rid of unnecessary text/shapes/objects. i want a clean look to the game".
The test for anything on screen: if a viewer would not miss it, it goes. Nothing is added to fill
space. Empty, calm, dark space around the cast is the look.

- **Text, the whole list:** the round name (small, top left), the three type cards (top right:
  a turned card shows only its label and one small glyph for likes or dealbreaker; a hidden card
  is a plain back), the subtitle bar with the speaker's name, and name tags over the suitors in
  wide and row shots only. No taglines, no "X's type" chip, no persistent twist chip (the twist
  card shows for its own beat and leaves), no label above a label, no sign in the set, no credits.
- **Shapes:** no floor graphics (hearts, dotted rings, concentric rings), no light streaks on the
  window, no icons or illustrations on title calls, no wobbly or doubled outlines on panels, no
  empty slots waiting for marks. One plain ring of light under each podium is allowed.
- **Objects:** the star's chair on its riser, four plain podiums each with one lamp column, the
  back wall with one window onto a simple night city, one clock. Nothing else: no plant, picture,
  side table, table lamp, card easel, studio camera, boom or sign.
- **Framing:** a close-up shows one character. No neighbour's shoulder, no prop cutting the frame.
- Panels are flat rectangles with a small radius. Title calls are the round name on a plain field.

## Rendering

- Flat colour and hard two-step shading (toon ramp with two or three steps). Thin dark outlines on
  characters and hero props (inverted hull). No PBR gloss, no bloom, no soft glow sprites.
- Light is drawn, not simulated: a pool of light is a hard-edged flat ellipse on the floor, a beam
  is a hard-edged translucent cone. A lamp that is on is a flat bright colour, a lamp that is off
  is its dark colour. The cut is a lamp going from one to the other in a single frame, with a thunk.
- Limited palette. Background darker and cooler than the cast, so characters always read first.

## Palette (`stage/theme.ts` is the single source)

| Name | Hex | Use |
|---|---|---|
| night | `#0f1830` | back wall, deep shadow |
| dusk | `#1c2a52` | floor, mid shadow |
| teal | `#14504f` | set dressing, the star's side |
| tungsten | `#ffb347` | key light pools, lamps, the clock face |
| coral | `#ff5d4a` | the show colour: logo, the star's chair, the dealbreaker card |
| mint | `#7be0c3` | the turn-on cards, charmed mark |
| milk | `#fff4e0` | text only |
| ink | `#0a0f1f` | outlines, subtitle panel |

Each suitor also has an accent (from the cast manifest) used on their lamp, spot ring and name tag.

## Set (the hangout room, `stage/hangout/room.ts`, plan in `stage/hangout/blocking.ts`)

A small room at night, 9.2 by 8.3 metres, seen from inside. The back wall holds one large window
(left of centre) onto a calm night city of broad flat buildings with a few lit windows, and one open
doorway (right) onto a dark hall. In front of the window stands the coral couch, two seats, the star
on the right one. A plain oval rug in front of the couch is where the group stands. Teal-dark walls,
a dark ceiling, a dusk floor with a few board seams. Nothing else: no lamps, plants, pictures,
podiums, clock or sign.

Where people stand (all of it a pure function of the show state, so a late joiner sees the same room):
- The suitors stand on a flattened circle in front of the couch, two each side of her (even spots on
  her right as seen, odd on her left; never all on one side). The circle is open toward the camera.
- **Standing is distance to her.** On each side the better placed of two takes the inner place, and
  every net heart moves them a few degrees round toward her and a step in; every net cringe the same
  back. A charmed reaction is a visible step closer, a cringe a shuffle back, unsure a shift on the spot.
- The walk-on: the star is on the couch from the start. Each suitor comes in through the door, stops
  by the couch's arm to say hello, takes her snap reaction, then finds a place in the circle.
- A speaker takes half a step in; everyone standing turns a good way toward whoever speaks.
- The bottom two each step forward toward her; the held silence; the cut one sags, says the exit line
  walking to the door and leaves. The circle closes up after them.
- A confession: the confessor walks out toward the camera and talks to it; a dark veil drops over the
  room behind them (the rest dimmed, idling); then they walk back.
- One on one: the date sits beside her on the couch, the other waits by the window, back to the room,
  looking out; they swap; for the compare both stand in front of her, one at each front corner.
- The pick: she gets up in the held silence (the light drops), says it with the name last, walks over
  to the winner; the loser walks out on their last line; the two sit down together on the couch.

Light is the only betting signal: warmer and brighter while a window is open, one step down at the
lock, lower still for the held pause before the pick.

## Characters

Imported rigged avatars (see `assets/cast/<id>/manifest.json`), restyled into the cel look
(toon material, outline, palette nudge). They breathe, look at whoever is speaking, and have a few
gestures: lean in, shrug, wince, slump, a tiny victory move. Emotion that the face cannot carry
is carried by body, head and drawn emote marks over the head: a heart (charmed), a sweat drop
(unsure), gloom lines (cringing). Comic timing comes from small moves and held pauses, as in
Tomodachi Life and Animal Crossing: a beat of stillness before the reaction lands.

## Camera (`stage/hangout/camera.ts`)

A person in the room filming friends, at eye level (about 1.45 m), a wide-ish lens (about 42 degrees
vertical), with a slight handheld drift and breathing. It stands at one place per phase (in front of
the circle for the walk-on, rounds and the pick; a step to the left for the confessions; front right
for round two; by the couch for the one on one), and cuts between places only at a scene change. In a
phase it turns (an eased pan on a damped spring) toward whoever speaks and steps in a little, holding
two to four people. It is never nearer a face than 2.35 m (no television close-ups) and it keeps the
speaker, and the room their bubble needs above the head, in the frame; if the speaker is out of frame
it turns to them faster, and their bubble only shows once they are in it.

## Text on stage (`stage/hangout/bubbles.ts`)

Speech only. What someone says floats over their head in a plain dark rounded bubble with a small
tail toward them, about 22 px text at 720p (Zen Maru Gothic), three lines at most of about 36
characters, kept 16 px inside the frame and never over the speaker's own face (beside the head when
there is no room above). It shows for the line's length and a beat. A confession's bubble is private:
a dashed edge on a softer ground. A remembered line (the reveal's replays) is lighter and italic, over
whoever said it, or at the door if they have left. A small nameplate (the name only, a plain dark
plate with an accent edge) floats over everyone in frame; the speaker's is lit. Emote pops (heart,
sweat drop, gloom lines) pop and go. No subtitle bar, round name, title calls, cards, twist card,
result band, ticks or crosses. Sentence case, no all caps, no em dashes. Must read at 960x540.

The studio (`STAGING = 'studio'` in `stage/theme.ts`) still exists beside it with its own director,
camera and captions; the switch is that one constant (the dev harness: `?staging=hangout`).

## Sound

Speech is synthesized blips per character (pitch, rate and waveform from `bots.json`), in the
spirit of Animalese, so every bot is recognisable by ear. Sound effects and music are free
open-licensed files (see `ASSETS.md`).
