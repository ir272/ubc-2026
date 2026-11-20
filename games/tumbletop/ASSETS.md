# Assets

Tumbletop draws the attic, the course, the obstacles, the Gumbles and the graphics in code. The
sound is recorded: fourteen files in `web/src/audio/`, all Creative Commons Zero (CC0, public
domain), downloaded on 2026-11-19 with the owner's approval. They are played by name from
`web/src/show/sound.js`; a sound with no file falls back to a synthesised stand-in.

## Sound (all CC0, no attribution required; credited here anyway)

Each file was converted with ffmpeg (peak-normalised; one-shots to mono 16-bit WAV, the music to
AAC) and renamed. Nothing from the packs is executed; only the audio listed here was kept.

| File here | From | Original file | Author | Source |
|---|---|---|---|---|
| `applause.wav` | "Well Done" (CC0 since 2024-10-05; the file name still says CCBY3) | `Well Done CCBY3.ogg` | qubodup | https://opengameart.org/content/well-done |
| `hit-1.wav` | Impact Sounds 1.0 | `impactWood_medium_000.ogg` | Kenney | https://kenney.nl/assets/impact-sounds |
| `hit-2.wav` | Impact Sounds 1.0 | `impactSoft_heavy_001.ogg` | Kenney | same |
| `hit-3.wav` | Impact Sounds 1.0 | `impactPunch_medium_001.ogg` | Kenney | same |
| `hit-4.wav` | Impact Sounds 1.0 | `impactWood_heavy_002.ogg` | Kenney | same |
| `lock.wav` | Impact Sounds 1.0 | `impactBell_heavy_000.ogg` | Kenney | same |
| `pip.wav` | Interface Sounds | `pluck_002.ogg` | Kenney | https://kenney.nl/assets/interface-sounds |
| `tick.wav` | Interface Sounds | `tick_002.ogg` | Kenney | same |
| `go.wav` | Interface Sounds | `confirmation_002.ogg` | Kenney | same |
| `through.wav` | Interface Sounds | `confirmation_001.ogg` | Kenney | same |
| `fall.wav` | Interface Sounds | `drop_003.ogg` | Kenney | same |
| `last-place.wav` | Music Jingles | `Pizzicato jingles/jingles_PIZZI07.ogg` | Kenney | https://kenney.nl/assets/music-jingles |
| `win.wav` | Music Jingles | `Steel jingles/jingles_STEEL07.ogg` | Kenney | same |

**There is no music at present.** The first track, "A respectable amount of Bounce" by Some Weirdo
(CC0, https://opengameart.org/content/a-respectable-amount-of-bounce), was rejected by the owner on
listening and taken out; a `music` file dropped into `web/src/audio/` is picked up and looped.

Total 1.0 MB. Downloaded but not used: "Happy Clappy Loop" by OwlishMedia (CC0,
https://opengameart.org/content/happy-clappy-loop), a 17 s loop that would repeat fifteen times a
show; it is not in the repository. The full Kenney packs are not in the repository either.

Recordings are played untouched (no compressor, equaliser or pitch change). The synthesised
stand-ins in `sound.js` sound only when a file is missing.

`docs/sounds/` has one labelled clip per sound for auditioning (made from the files above, plus
the two music tracks).

## Everything else, installed from npm

| What | Used for | Author | Licence | Source |
|---|---|---|---|---|
| Bricolage Grotesque (600, 800) | round titles, countdown, headlines | Mathieu Triay | SIL Open Font License 1.1 | `@fontsource/bricolage-grotesque`, https://github.com/ateliertriay/bricolage |
| Barlow Semi Condensed (500, 600, 700) | names, numbers, the standings tower | Jeremy Tribby | SIL Open Font License 1.1 | `@fontsource/barlow-semi-condensed`, https://github.com/jpt/barlow |
| three.js | rendering | three.js authors | MIT | `three`, https://threejs.org |
| Vite, Playwright (dev only) | dev server, captures | their authors | MIT, Apache 2.0 | npm |
