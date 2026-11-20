# Compatibility Mode: report at the stop (Thu 2026-11-19, 15:15 CST)

The run was stopped at about 15:05 on the owner's instruction, relayed by the platform session.
He watched the show on the site and rejected it as a whole: the format (the booth interludes, the
printed reaction and card labels), the look of the cast, and the dialogue ("I don't know what's
going on here"). This report says what exists, what was measured, and what I would keep.

## State of the folder

Runnable. Nothing is running: no dev server, no builders, no model calls.

- `npm run match`: one scripted episode headless, 5:34 at speed 1, no gap over 2.5 s except the
  two staged silences.
- `node --test test/*.test.ts`: 92 of 92 pass. `npx tsc --noEmit`: zero errors.
- `node tools/runner-smoke.ts`: 11 of 11 checks inside the real runner code on a side port
  (snapshot, late join, three windows, sealed commitment, hidden draw recomputed from the secret).
- `npm run dev` (port 5203): the stage loads and plays the live scripted show, console clean,
  60 fps. Default staging is `studio` (the cleaned-up TV-studio look the owner rejected).
- `index.ts` and `channel.ts` exist and the README has the two integration lines and the event list.

## What is unfinished, fake or wrong

- **The owner rejected the result.** Everything under "critic rounds" below was judged by fresh
  critics against the references, and the critics never caught what he saw in one viewing: that a
  viewer cannot follow what is going on. I showed him stills at 13:45 and a video at 14:40. That
  was hours too late; the format should have been agreed with him from a rough video in the
  first hour.
- **Hangout staging is half built.** `?staging=hangout` selects a second staging (a room, chat
  bubbles, nameplates, people moving) that was stopped during its second verification pass. It is
  not the default and I have not looked at it. Treat it as unverified.
- **Sound:** character speech blips work. Sound effects and music are silent: the sound loop was
  stopped before it produced `assets/audio/`, so two 404 lines appear in the console after the
  first click.
- **Lines are mostly authored, not written live.** In the 40 real-model episodes, of 2,170 aired
  lines 1,859 were authored bank lines played by the scripted path, 59 were chosen from the bank
  by the bot's model, 132 were written live and passed the gate, and 120 were fallbacks after a
  timeout or a failed gate. The star's model judges each line and that decides cuts and the pick.
  The first all-live episodes from the cheap models were clearly worse, which is why.
- **Critics' pick: the bar won almost everything.** Voices: 1 win in 6 rounds across 11 personas
  (Sir Quill, round three, lost again later). Script beats: 0 of 8 in the one round run. Stage
  pieces: 0 wins (set 1 round, captions 2, marks 2, cast 1, camera and sound none completed).
  Script critics were never re-run on version 2 episodes. Full log: `ROUNDS.md`, `critics/`.
- **Bars from the brief that were not measured:** comprehension from a 45 s clip, who-is-who,
  the 5% generic limit and the 80% explainable pick on real-model episodes, blind look picks.
- **Balance on real models misses for one suitor:** Nav won 9 of 21 (43%, limit 40%); the other
  seven were 15% to 29%. In 2,000 scripted episodes every suitor is 19% to 30%.
- **Pace:** after window C locks there are about 100 s with nothing to bet on (limit 90 s).
- The avatar folder for Crumb is still named `assets/cast/frost`.

## What was built

- **Show engine** (`show/`, `channel.ts`): one episode as a script against the runner's `Show`.
  Window A is sealed; the three hidden cards and the twist are derived from `win.sealed` and can
  be recomputed by anyone after settle. Three windows (4, 3 and 2 outcomes; 45, 22 and 20 s), all
  settled on the winner. Lines are generated before a window opens or after it locks.
- **Format version 2** (`show/FORMAT2.md`): reactions that answer the exact line, cuts that follow
  the visible marks, a bottom-two beat, booth guesses, leader dates first, name last at the pick.
- **Brains:** scripted (plays the banks) and model (OpenRouter, any model id per bot, 6 s timeout,
  JSON repair, content and quality gates, hybrid choose-or-write, budget cap, per-call cost log,
  one failed call on an unpaid account switches the episode to scripted).
- **Writing:** 11 personas, about 2,300 authored lines and 24 reply files (about 1,900 replies).
- **Stage:** eleven CC0 VRM avatars loaded, restyled, with retargeted clips, gestures, mouth
  shapes and faces; a studio staging; late join from the snapshot; version 2 events.
- **Tools:** text episodes, balance over thousands of scripted episodes, bank validation, headless
  match, runner smoke test, stills, storyboards and video capture, the round log.

## Numbers

| Check | Result |
|---|---|
| Episode length | 5:10 to 5:56 scripted; 5:14 to 5:34 on real models |
| Cut falls on the lowest visible mark | 100% (2,000 scripted; 40 of 40 real) |
| Pick follows the dates | 100% (same) |
| Hidden turn-on / dealbreaker found by somebody | 78% / 80% scripted; 85% / 83% real |
| Suitor win rate | 19% to 30% scripted; 15% to 43% real (Nav 43%) |
| Lines over their word limit | 0 |
| Star's marks, real models | 44% charmed, 29% unsure, 27% cringing (target 25/45/30) |
| Real-model spend | $0.44 of $1.50 (about 0.8 cents per episode) |

## What I would keep if the format changes

- The channel and episode plumbing: sealed window, recomputable hidden draw, pipelined
  generation with a wait cap, the fake `Show` harness, the runner smoke test.
- The model plumbing: per-bot models, timeouts, gates, budget and cost log, the model picker.
- The avatar pipeline: VRM loading, cel restyle, clip retargeting, the acting layer, and the
  manifest per character, which makes swapping the cast a data change.
- The trial and capture tools.

What I would expect to throw away: the round structure with its interludes, the type-card deck,
most of the line banks (they are tied to these personas and these beats), and the studio staging.

## What I would do next

Agree the format with the owner on paper and on a one-minute rough video before building: who is
in the room, what a viewer sees in the first ten seconds, how a conversation flows, and what there
is to bet on. Then build the smallest version of that and show him video again the same hour.
