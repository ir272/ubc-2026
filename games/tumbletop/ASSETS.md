# Assets

Tumbletop draws the attic, the course, the obstacles, the Gumbles and the graphics in code.

## Sound in the build (state on 2026-11-20)

Four music tracks and four hit sounds, each approved by the owner by ear or (the hits) not yet
ruled on. No countdown, bell, chime, jingle or applause yet: he rejected the first set of those and
has not chosen from the second. A sound with no file is silent; the synthesised stand-ins in
`web/src/show/sound.js` are switched off.

### Music: Kevin MacLeod (incompetech.com), Creative Commons Attribution 4.0

**The site must print this credit somewhere viewers can find it** (the licence requires it):

> "Adventures in Adventureland", "Heroic Age", "Five Armies" and "Winner Winner!" by Kevin MacLeod
> (incompetech.com). Licensed under Creative Commons: By Attribution 4.0.
> https://creativecommons.org/licenses/by/4.0/

| File here | Plays during | Track | Cut | Source |
|---|---|---|---|---|
| `web/src/audio/music-lineup.m4a` | the call, the line-ups, the shelf after a round, between shows | Adventures in Adventureland | from 0:20, 80 s | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Adventures%20in%20Adventureland.mp3 |
| `web/src/audio/music-race.m4a` | Rounds One and Two | Heroic Age | from 0:15, 72 s | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Heroic%20Age.mp3 |
| `web/src/audio/music-final.m4a` | the Final | Five Armies | from 0:30, 70 s | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Five%20Armies.mp3 |
| `web/src/audio/music-win.m4a` | the winner | Winner Winner! | from 0:10, 45 s | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Winner%20Winner!.mp3 |

Changes made (the licence asks that they be stated): each track is cut to the stretch above, its
level lowered to about -20 LUFS, a 0.05 s fade in and 0.4 s fade out, encoded as AAC. No
compressor, equaliser or pitch change. The owner chose them on 2026-11-20 from audition clips
("line-up 4, race 7, and five armies are cool. win 1 is good").

### Hits: Kenney, Impact Sounds 1.0, CC0 (https://kenney.nl/assets/impact-sounds)

| File here | Original file |
|---|---|
| `web/src/audio/hit-1.wav` | `impactWood_medium_000.ogg` |
| `web/src/audio/hit-2.wav` | `impactSoft_heavy_001.ogg` |
| `web/src/audio/hit-3.wav` | `impactPunch_medium_001.ogg` |
| `web/src/audio/hit-4.wav` | `impactWood_heavy_002.ogg` |

Converted with ffmpeg to mono 16-bit WAV, peak-normalised, otherwise untouched.

## Effect candidates still with the owner (not in the build, not in the repository)

Mixkit sound effects (Mixkit Sound Effects Free License, which allows use in games), as audition
clips in `docs/sounds-round2/` (git-ignored). Whatever he approves gets a row above.

## Type

| File here | What | Author | Licence | Source |
|---|---|---|---|---|
| `web/src/fonts/shantell-sans-latin-wght-normal.woff2` | Shantell Sans (variable weight, latin), the site's typeface, for all stage text | Shantell Martin, Stephen Nixon, Arrow Type | SIL Open Font License 1.1 | copied from the site's `@fontsource-variable/shantell-sans` package, https://github.com/arrowtype/shantell-sans |

The stage's hand-drawn line (`web/src/show/ink.js`) is the site's own drawing code (Nightline,
`web/src/ui/ink/`) rewritten in plain JavaScript; Nightline's technique is after Kevin Ngo's
Looseleaf (MIT, https://kevintngo.github.io/looseleaf/).

## Everything else, installed from npm

| What | Used for | Author | Licence | Source |
|---|---|---|---|---|
| Bricolage Grotesque, Barlow Semi Condensed | no longer used on stage since 2026-11-20 (still listed in `package.json`) | Mathieu Triay; Jeremy Tribby | SIL Open Font License 1.1 | `@fontsource/bricolage-grotesque`, `@fontsource/barlow-semi-condensed` |
| three.js | rendering | three.js authors | MIT | `three`, https://threejs.org |
| Vite, Playwright (dev only) | dev server, captures | their authors | MIT, Apache 2.0 | npm |
