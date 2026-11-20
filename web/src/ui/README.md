# Nightline (`web/src/ui`)

Nightline is the site's hand-drawn UI library (Ian named it on 2026-11-20), in the style of his chart reference
(`refs/candidates/ian-map-reference.webp`): white ink line on black paper, coloured-pencil hatching, thin gold.
Library site (dev only): http://localhost:5190/ui

Status on 2026-11-20: built and working. Ian chose this kit over Looseleaf for our theme and wants it grown into a
real library like Looseleaf. **Wired into the real pages on 2026-11-20** (see "Where it is used" below). Typeface: Shantell Sans, Ian's pick.

## The library site (`site/`)

`/ui` is a documentation site in the manner of Looseleaf's, built only from the kit. Pages are addressed by hash, so
the single dev route in `App.tsx` serves all of them (for example `/ui#/foundations/pens`, `/ui#/components/button`).

- `site/Site.tsx`: the shell (top bar, left nav, hash routing, the typeface / less motion / sound switches). The
  name is the `NAME` constant.
- `site/foundations.tsx`: Overview, Getting started, Principles, Colour, Type, Pens, Shapes, Motion, Sound, Accessibility.
- `site/components.tsx`: one page per component (preview, usage, examples of every state, props, accessibility),
  driven by the `COMPONENTS` table, plus three blocks (Bet panel, Chat, Channel list).
- `site/blocks.tsx`: the working examples (`BetDemo`, `ChatDemo`, `SoundBoard`, `MomentGallery`). `BetDemo` is the
  reference for wiring the real bet panel.
- To add a component: write it, add an entry to `COMPONENTS`, and add `component('<id>')` to a group in `NAV`.

## How it is drawn

Our own engine in `ink/`, using the technique of Kevin Ngo's Looseleaf (MIT) without its code or dependencies:

- `ink/rng.ts`: seeded randomness. Every wobble comes from a seed, so a drawing is identical on every render.
- `ink/stroke.ts`: one pen stroke as a filled ribbon whose width follows pen pressure (heavier at the ends and in
  corners), with a seeded wobble and a dry-pen tooth. It also returns the centre line (`guide`).
- `ink/shapes.ts`: the motifs, all taken from the reference: `ruledBox` (four rules that run past the corners and
  cross), `hatch` (pencil shading), `checkerBand` (the checkered border with gold runs), `ring` and `radialTicks`
  (the medallion), `star4` (the medallion's four-point star), `loopBox`, `check`, `plate`.
- `ink/Ink.tsx`: `useBox` (measure the host), `InkSvg` (an svg laid over the host), `InkStroke` (draws a stroke;
  `draw="mount"` draws it on when it appears, `draw="state"` keeps it hidden until CSS reveals it).
- `ink/recipe.tsx`: **recipes**. A component's whole drawing is described once as layers named for its states
  (`rest`, `hover`, `pressed`, `focus`, `on`, `disabled`) with `defineRecipe`, and rendered with `useInk`. `ui.css`
  shows each layer from the real state of the element with the class `ink-host`. `InkProvider wobble={…}` makes the
  whole hand steadier or looser. Button, switch, checkbox, menu, tooltip and toast use recipes; frame, bet sides,
  tabs, text input and pill still draw themselves directly.

Draw-on works by sliding a mask along the stroke's centre line (`stroke-dashoffset` on the mask). This is the one
deliberate exception to "animate transform and opacity only".

One npm package for the moments (`@clayzo/webgl-player`), nothing else. React 18, plain CSS in `ui.css`, every class prefixed `ink-` and every token scoped to `.ink-ui`.

## Tokens (`ui.css`, on `.ink-ui`)

Measured from the reference image, not invented:

| token | value | use |
| --- | --- | --- |
| `--ink-paper` | `#141318` | the ground |
| `--ink` / `--ink-soft` | `#e6e4de` / `#d7d5cf` | line and text |
| `--ink-gold` | `#c5a559` | the accent: hover, focus, selected, confirmed, live |
| `--ink-blue` `--ink-coral` `--ink-green` `--ink-yellow` | `#6687ac` `#b58970` `#69927d` `#afa569` | the four pencils (bet sides, chat names) |
| `--ink-dim` / `--ink-faint` | ink mixed 60% / 30% into paper | secondary text, resting rules |
| `--ink-font`, `--ink-font-scale` | `inherit`, `1` | the typeface, once Ian picks one |

Motion: `--ink-ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for UI, `--ink-ease-pen` for lines drawing on.
Density: `data-density="compact"` on the `.ink-ui` root tightens controls (button 40 to 34 px, rows closer).
Press is `scale(0.97)`, hover rules sit behind `@media (hover: hover) and (pointer: fine)`, UI motion is under 300 ms
(frames drawing on at first appearance take up to about 0.5 s per line).

## Components

All exported from `./ui` (`index.ts`). `seed` is optional everywhere; pass a stable string (a channel id, a side id)
when the same thing appears in more than one place so it is drawn the same.

| component | props | notes |
| --- | --- | --- |
| `Button` | `variant: 'primary' \| 'quiet'`, `size: 'sm' \| 'md' \| 'lg'`, `block`, `confirmed`, plus all `<button>` props | Primary is an ink plate inside crossing rules; use it once per view. Hover draws the rules over in gold (quiet also wipes in pencil hatching). `confirmed` washes the plate gold and stops presses; change the label on the same button ("Bet 25" to "Bet placed") and the words crossfade. Pass a string as children for the crossfade. |
| `Frame` | `draw` (default true), plus `<div>` props | The card: four crossing rules, drawn on when it appears. Padding 16px. Use `draw={false}` for anything that mounts often. |
| `CheckerFrame` | `draw`, `band` (px, default 8) | The chart's checkered border. One per page at most. |
| `Pill` | `tone`, `live`, `children` | A label in a hand-drawn loop. `live` puts the beacon in front. |
| `BotTag` | `seed` | "BOT" in a small ruled box. |
| `TextInput` | `label` (required), `hideLabel`, `prefix`, `suffix`, `error`, plus `<input>` props | A field on a ruled line; focus draws the line over in gold. `error` shows in coral and is announced. |
| `BetSides` | `sides: { id, label, share (0..1), multiple, tone? }[]`, `value`, `onChange`, `state: 'open' \| 'placing' \| 'placed' \| 'won' \| 'lost'`, `stake`, `label` | A radio group (arrow keys move the pick). Each row: name, pencil-hatched share bar, share, multiple. The pick gets a gold box; `placed` draws a tick and shows the stake; `won` lands a star; the other rows dim once betting is locked. Share changes slide the hatching. |
| `Countdown` | `seconds`, `total`, `label` | A rolling clock over the chart's scale bar. The parent owns the clock. The last ten seconds turn coral. `role="timer"`. |
| `BalancePill` | `value: number`, `format`, `label` | When `value` goes up the payout arrives: the gain floats in, the digits roll, the loop is redrawn in gold, the star turns. Nothing else to call. |
| `Roll` | `value: string`, `dir: 'up' \| 'down'` | A value that changes by rolling, last character first; unchanged characters stay still. |
| `ChatRow` | `name`, `tone`, `bot`, `fresh`, `children` | One chat line. `bot` adds the BOT tag. `fresh` makes a new message rise into place once. |
| `Medallion` | `size` (px), `src`, `alt`, `live`, `draw`, `children` | The round channel icon after the chart's moon medallion. Under 44px it simplifies to two rings. |
| `Beacon` | `size`, `tone`, `label`, `seed` | The live mark: the four-point star twinkling, a ring drifting out. Different seeds pulse out of step. |
| `Tabs`, `TabPanel` | `tabs: { id, label }[]`, `value`, `onChange`, `label`, `idBase` | Tab list with arrow keys, Home and End. The selected underline draws on (instantly when moved by keyboard). |
| `Switch` | `checked`, `onChange`, `label`, `disabled` | On or off. Off, the knob is a ring; on, it is the gold star and the track is shaded. |
| `Checkbox` | `checked`, `onChange`, `label`, `disabled` | A tick struck through the box, drawn on. |
| `Progress` | `value` (0..1), `label`, `tone` | Pencil hatching filling a ruled bar. `role="progressbar"`. |
| `Skeleton` | `width`, `height` | Faint shading at the content's own size while it loads. |
| `Tooltip` | `text`, `side`, one child control | Hover or keyboard focus. The second in a row opens at once. Positioned inside its wrapper, so a parent with `overflow: hidden` can clip it. |
| `Menu` | `label`, `trigger`, `items: { id, label, hint?, disabled?, onSelect }[]`, `align` | Opens from a button: arrow keys, Home, End, first-letter jump, Escape. For the wallet menu. Same clipping note as Tooltip. |
| `toast()`, `Toaster` | `toast(message, { detail?, tone?: 'ink' \| 'gold' \| 'coral', duration? })` | Put one `<Toaster />` near the page root. Gold is good news with the star; coral is announced as an alert. |

## Moments (`Moment.tsx`)

Four short Clayzo animations, drawn with this kit's ink engine. They are authored in `prototypes/clayzo/author/*.ts`
(run `npm run author` there to rebuild; it writes the documents into `moments/` here). `@clayzo/webgl-player` is the
one package the kit adds to `web/`; the player and each document load only when a moment is first shown.

`<Moment name width playKey? label? />`. It plays once when it appears and again whenever `playKey` changes.

| name | what happens | length | use |
| --- | --- | --- | --- |
| `bet-placed` | a ring is drawn, a tick is struck through it, three stars land | 1.5 s, stays | when the bet is confirmed |
| `payout` | the medallion is drawn, a gold star lands, small stars fly out | 2.6 s, stays | when the viewer wins |
| `watch-and-bet` | the compass rose is drawn, swings and settles, rhumb lines run out | 1.8 s, stays | on pressing "Watch and bet", across the move to the channel |
| `chat-sent` | a star races along a line and bursts | 0.9 s, leaves nothing; a 5:1 strip | over the message field on send |

Under reduced motion a moment shows its settled frame (and `chat-sent` shows nothing).

## Where it is used (wired 2026-11-20)

- **Look:** `themes/look.tsx` has a `nightline` reference (the measured palette, Shantell Sans, square corners) and it
  is the default look. `App.tsx` puts `ink-ui` on the app root and mounts `CourseOverlay`.
- **Glue:** `components/nightline.tsx` has `sfx` / `sfxFor` (UI sound that follows the site's mute switch and
  volume) and `setCourse` / `CourseOverlay` (the compass that plays over the page when "Watch and bet" is pressed).
- **Bet panel** (`components/Prediction.tsx`): `Countdown`, `BetSides` (winner, held stake, dense list from five
  outcomes), `Button` for amounts (`selected`) and the bet, the `bet-placed` moment when a bet lands and the
  `payout` moment on a fresh win. All bet logic and every `data-testid` are unchanged.
- **Chat** (`components/Chat.tsx`): `BotTag`, new messages rise in, `TextInput` + `Button`, the `chat-sent` moment.
- **Channel tabs** (`components/ChannelTabs.tsx`): `Tabs` + `TabPanel`. No longer mounted: the channel page now uses `components/ChannelPanels.tsx`.
- **Rail** (`components/Rail.tsx`): `Medallion` + `Beacon`.
- **Home** (`pages/Home.tsx`): `Medallion`, `Pill`, cards in `Frame`, "Watch and bet" as a primary `Button`.
- **Header** (`components/Balance.tsx`): the three triggers are `Button`s and the balance is a `Roll`. The menus
  under them are still the site's own panels.
- Layout for all of this is the "Nightline wiring" block at the end of `src/styles.css`.

Not wired yet: the header menus (could use `Menu`), toasts (`Toaster` is not mounted on the real pages), the home
page's hero (the main session's work), and the Results / Form tables.

## Reduced motion

`prefers-reduced-motion: reduce` (or `data-motion="reduce"` on the `.ink-ui` root) turns off drawing-on, rolling,
the beacon and the press scale. Every state still shows: frames are simply there, values swap, the beacon is a still star.

## Sound (`sound.ts`)

Seven code-made cues (Web Audio, no files), each with three takes: `pick`, `tick`, `place`, `confirm`, `payout`,
`send`, `course`. Sound is on by default and `uiSound.enable(false)` mutes it (remembered in the browser); browsers
only let it start after the first click on the page. The components never play sound; the page calls
`uiSound.play('pick')` and so on.

Each Clayzo moment has its own cue, timed to land on its beat: pass `onStart={() => uiSound.playFor('payout')}` to
`<Moment>` (bet-placed → `confirm`, payout → `payout`, chat-sent → `send`, watch-and-bet → `course`). Do not also
play those cues by hand, or they sound twice.

On `/ui` the **Sounds** board plays any take on click and makes it the one in use (remembered under
`ink.sound.takes`); "Play it through" runs the whole bet with sound and motion together. The countdown tick only
sounds while the page is in front. **Ian has not confirmed his takes yet. Do not ship sound until he has.**

## Not done / not checked

- Ian likes the motion so far (2026-11-20) and has shortlisted three typefaces: IM Fell English, Cormorant Garamond
  and Shantell Sans (keys 1 to 3 on the demo, loaded from Google Fonts on the demo page only). No final pick yet; the chosen one should be installed with `@fontsource` (needs Ian's OK).
- Motion was checked by stepping animations in Chrome, not from a screen recording. The moments were checked as
  ten-frame sheets (`http://localhost:5193/?sheet=<name>`), not with Clayzo's own review, which needs a sign-in.
- Checked in Chrome only. Safari and Firefox are untested (the mask draw-on is standard SVG, but untested there).
- Not checked at phone width.

## Credits

Ian's reference for this work is Kevin Ngo (https://x.com/kevin_t_ngo): the technique is after his Looseleaf
(https://kevintngo.github.io/looseleaf/, MIT), and the animation direction follows his Clayzo UI animations
(https://x.com/kevin_t_ngo/status/2111974919353544757). Craft rules from Emil Kowalski's `emil-design-eng` skill.
Motion guidance from Benji Taylor's Stageshow skill (saved as text in `.claude/skills/stageshow/`).

Related prototypes, outside `web/`: `prototypes/looseleaf/` (Kevin's real components themed to ink on black, port
5192) and `prototypes/clayzo/` (Clayzo animations drawn with this kit's ink engine, port 5193).
