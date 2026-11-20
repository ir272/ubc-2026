# Design metrics

Measured 2026-11-18 in headless Chromium at 1440×900 from computed styles (`getComputedStyle` +
`getBoundingClientRect`) on public pages: kick.com home, kick.com/browse, a live kick.com channel,
and a live twitch.tv channel (logged out). Kick is the primary reference, Twitch the second sample.
We copy metrics and restraint only — not logos, brand colours, fonts or artwork.

## Measured

| | Kick | Twitch |
|---|---|---|
| Top bar height | 60 px (padding 0 40 0 12) | 50 px |
| Page background | rgb(9,11,15) | (light theme sampled) |
| Body font | Inter | Inter / Roobert |
| Body text | 14 px / 400 / 21–21.7 px (1.5–1.55) | 14 px / 400 / 19.6 px (1.4) |
| Semibold UI text | 14 px / 600 / 20 px | 14 px / 600 / 19.6 px |
| Secondary text colour | rgb(169,173,181) | rgb(59,59,68) on light |
| Tertiary text colour | rgb(130,134,141) | — |
| Chat column width | 340 px | 340 px |
| Chat header | 46 px tall, "Chat" 16 px / 700 | 14 px / 600 |
| Chat message | name 14 px / 700, text 14 px / 400 / 21.7 px, starts 20 px from column edge | 14 px / 400 / 19.6 |
| Chat input | 42 px tall, padding 9 px 10 px, 14 px | — |
| Video | 844×475 (16:9) beside a 256 px sidebar | 860×484 (16:9) beside 240 px sidebar |
| Info row under video | starts 22 px below video, 32 px left inset; avatar 56 px; name 20 px / 700 / 24; title 14 px / 600 / 24; category 14 px / 400 in accent | avatar 64 px, name 18 px / 600 |
| LIVE badge | 10 px / 700, padding 4 px 6 px, radius 2 px, accent fill | 12 px / 600 |
| Secondary buttons | 32 px tall, radius 8, 14 px / 600, padding 6 px 8–12 px | 32 px tall, pill, 14 px / 600 |
| Primary buttons | 44–48 px tall, radius 4, 16 px / 600, padding 8 px 16 px | 30–32 px |
| Common radii | 8 px and 4 px (plus full-round avatars) | pill and 4 px |
| Home section heading | 24 px / 700 / 36 px | 18 px / 500 |
| Home card text | title 14 px / 600 / 20, meta 14 px / 400 / 21 | 14 px |
| Featured carousel image | 732×412 | — |

## Adopted (all variants)

- Top bar **60 px**, side padding 16 px. Chat column **340 px**, chat header **46 px** with 16/700 title.
- Base text **14 px / 1.55**, weights 400 / 600 / 700 only. Chat names 14/700. Small labels 12 px (10 px for LIVE).
- Stream is a 16:9 box using the full width left of the chat (capped by the viewport height).
- Info row: 22 px below the stream, 32 px inset, 56 px avatar, title 20/700/24, matchup 14/600, meta 14/400.
- Secondary controls **32 px**, primary bet button **44 px**, chat input **42 px**.
- No gradients, glows, blurred shadows or decoration anywhere: flat fills and 1 px hairlines.
- Per-variant tokens (in `src/themes/*.tsx`): ground colours, one accent, side pair, typefaces, radius,
  and density (`--pad`, `--btn-h`, `--btn-lg`, `--fs`). Everything else is shared.

## Round 2 additions

- Left rail **240 px** (56 px collapsed to thumbnails), default open at ≥1440 px; rows 52 px, 32 px round thumbnails.
  With the rail open, the player is 860×484 at 1440×900, the same as Twitch's.
- Type scale **12 / 14 / 16 / 20 / 28** px only; nothing smaller than 12 px. One typeface per theme (title-card keeps its
  display face for the game title and section headings only).
- Under the player: channel row (56 px avatar, 20/700 title, 14/600 matchup, viewers, Share), then 44 px tabs.
- Prediction: question 16/600, outcome name 16/600, share and multiple 20 px, amounts 32 px, bet 44 px.
