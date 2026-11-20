# Assets

Tumbletop draws the attic, the course, the obstacles, the Gumbles and the graphics in code.

## Sound in the build (state on 2026-11-20)

Four recorded hit sounds and nothing else: no music, no countdown, no jingles. The owner listened
to the first set of recordings on 2026-11-19 and rejected the music and every effect except the
hits (which he has not ruled on); those files were taken out. A sound with no file is silent: the
synthesised stand-ins in `web/src/show/sound.js` are switched off. Nothing new goes into the build
until the owner has approved it by ear.

| File here | From | Original file | Author | Licence | Source |
|---|---|---|---|---|---|
| `web/src/audio/hit-1.wav` | Impact Sounds 1.0 | `impactWood_medium_000.ogg` | Kenney | CC0 | https://kenney.nl/assets/impact-sounds |
| `web/src/audio/hit-2.wav` | Impact Sounds 1.0 | `impactSoft_heavy_001.ogg` | Kenney | CC0 | same |
| `web/src/audio/hit-3.wav` | Impact Sounds 1.0 | `impactPunch_medium_001.ogg` | Kenney | CC0 | same |
| `web/src/audio/hit-4.wav` | Impact Sounds 1.0 | `impactWood_heavy_002.ogg` | Kenney | CC0 | same |

Converted with ffmpeg to mono 16-bit WAV, peak-normalised, otherwise untouched; played with no
compressor, equaliser or pitch change.

## Candidates sent to the owner to listen to (not in the build, not in the repository)

Audition clips are in `docs/` (git-ignored). Whatever he approves gets a row above with its credit.

- Music: tracks by Kevin MacLeod (incompetech.com), Creative Commons Attribution 4.0. Using any of
  them means printing this credit on the site: "<Title>" Kevin MacLeod (incompetech.com), Licensed
  under Creative Commons: By Attribution 4.0, https://creativecommons.org/licenses/by/4.0/
  Clips: `docs/music-by-phase/` (electronic and funk, 2026-11-19) and `docs/music-orchestral/`
  (orchestral, 2026-11-20).
- Effects: Mixkit sound effects (Mixkit Sound Effects Free License, which allows use in games) in
  `docs/sounds-round2/`.

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
