# Assets

Everything visual is drawn in code on a 2D canvas: the library, the Scrivener, the six fighter
classes, the weapons, the 31 engraved emblems, every title and screen. There are no image,
model or font files. Type uses system serif stacks (`src/ui/letter.js`).

## Sound

Every sound and music file is a real recording under CC0 or CC BY, 99 sounds in two encodings
(`.ogg` and `.mp3`) in `assets/audio/`, described by `assets/audio/manifest.json`.

- **The ledger is `assets/audio/LICENSES.md`**: one row per file with its source URL, author,
  licence and the exact attribution each CC BY file requires. `node tools/credits.mjs` turns it
  into `assets/audio/credits.json`; `node tools/credits.mjs --check` fails if that file is stale.
- The CC BY attributions are also printed in full in `README.md` under "Audio credits".
- Sources: freesound.org (CC0 and CC BY 3.0 / 4.0), Kenney (CC0), and seven tracks by
  Kevin MacLeod, incompetech.com (CC BY 4.0). Nothing is non-commercial, no-derivatives or of
  unclear licence. Nothing is taken from a game.
- Edits: trimmed and loudness-normalised. In the game they are layered, pitched and filtered by
  the cue table in `src/audio/cues.js`.

No new files were downloaded on Thu 2026-11-19. The show's new cues (phase calls, the plates,
the prediction bell, the bell before an attempt) reuse recordings already in the ledger.

## Where the files live

`games/COMMON.md` asks for vendored files under `assets/vendor/`. These were already in
`assets/audio/` when the game was copied in, and the manifest, the ledger and the offline
renderer all point there, so they were left in place rather than moved on the day.
`assets/audio/raw/` (the untrimmed downloads, 88 MB) is git-ignored and not shipped.
`assets/sprites/` is unused by the show.

Total size of `assets/`: about 173 MB, of which 85 MB ships.

## Sound, round 10

No files were added, removed or downloaded: every change re-uses recordings already in the
ledger, so `LICENSES.md` and `credits.json` are unchanged. What changed is in `src/audio/cues.js`,
`src/audio/audio.js` and `src/stage/stage.js`; measured with the new whole-match renderer
`tools/audio_match.mjs` on `.cache/feeds/scrivener-210-mwnofg5c.jsonl` (48 kHz, mono).

- **The score is now heard.** Before, the music sat near -37 LUFS (about 17 dB under the
  effects) and the choosing and the tape were 11-13 LU quieter than the fight. Now the phases sit
  within 2.2 LU of each other (call -19.7, choosing -21.9, tape -20.7, fight -20.0, verdict -21.8
  LUFS; before -22.0 / -31.0 / -32.7 / -19.8 / -22.3) and the fight's effects stand about 12 dB
  over its music (before about 18). True peak -1.3 dBTP (before -0.3); the limiter threshold went
  from -1 to -3.5 dB because WebAudio's makeup gain let peaks through at -0.35 dBFS.
- **The fight is scored in acts and builds.** `audio.setIntensity(level, opts)` moves new
  per-layer fight gates; the stage feeds it from `musicCall()` in `cues.js` on every bus event.
  Tries 1-2 play "Clash Defiant" (slow, heavy brass), tries 3-4 "Corruption" (a mechanical
  ostinato), tries 5-6 "Final Count" (war drums, then frantic strings). Each act restarts at a
  chosen section. Within a try every stroke of the name raises it: the act comes up from -12 dB
  and its low-pass opens, and the choir swells. Between tries the acts give way to a low drone
  ("Land of the Dead"). A kill cuts the score on the blow; a death or a finished name drops it,
  and the drone returns after 2.6 s. Layers nobody can hear are paused, so only 2-3 streams
  decode at once. The tape now plays the quiet opening of "Final Count" and the verdict "Truth
  of the Legend". All seven tracks are used.
- **The phase strike.** Each phase opens with a book slammed under a struck bell: the call one
  deep toll, the choosing two, the tape three quick and higher ones, the fight a darker bell over
  steel, the verdict the deepest toll and then the peal. "Predictions closed" is the book shutting
  with its iron clasp, with no bell. A try starts with a high bell over a drawn blade. The
  prediction windows are now tagged `who` or `try`, so their bells no longer pile onto the
  phase strike or the end of a try.
- **Weight and steel.** Swings and contacts are fitted to each weapon (sabre, maul and its
  Crushing Blow, knives, pole, censer, quill). Blows on the fighter scale their flesh and sub
  with damage, and a knockdown adds the fall. Guarded blows ring steel. The boss's wind-ups for
  the gust and the curse now have a throat, and the gust and the lunge have weight. Sounds were
  added for events that were silent: spells, burns, the hex, the seal, the stroke of the name
  (a far bell that grows with the count), the name finished, the guard.
- **Listening.** An audio model (google/gemini-3.8-flash via `tools/listen.mjs`, about $0.10 in
  all) chose the new fight mix over the old one in both A/B orders. On the phase change it
  picked whichever clip came second, so that test told us nothing. It also described the
  candidate music sections that the acts were chosen from. No person has listened to this mix.
- **Wanted, not downloaded:** fire (an ignition whoosh, crackle loops) for Candleflame, the censer
  and burns, which paper sounds stand in for now; a chain rattle for the censer; a wooden shaft
  knock for the pole.
