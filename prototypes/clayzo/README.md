# Clayzo prototype

Clayzo (https://clayzo.com) animations for the ink UI kit, kept apart from the site. Port 5193.

- Run: `npm run dev`, then http://localhost:5193 (all four pieces; click one to replay) or
  http://localhost:5193/?sheet=payout (ten still frames of one piece; also `bet-placed`, `chat-sent`, `watch-and-bet`).
- Rebuild the documents after editing a script: `npm run author`. It writes to `animations/` here and to
  `web/src/ui/moments/`, which is what the kit's `<Moment>` plays.
- `author/payout.ts`, `author/bet-placed.ts`, `author/chat-sent.ts`, `author/watch-and-bet.ts`: one piece each, with
  its art direction written at the top. `author/lib.ts`: time base, the measured palette, eases, a small scene builder.
- `author/ink.ts`: turns our own ink engine (`web/src/ui/ink`) into Clayzo paths, so pieces share the kit's hand.

Set up by hand (`@clayzo/animation`, `@clayzo/webgl-player`, `clayzo` CLI as a dev dependency), not with
`npx clayzo init`. Clayzo's two agent skills are saved as text in `.claude/skills/clayzo-animation-authoring` and
`.claude/skills/clayzo-animation-shipping`.

Not signed in to Clayzo. Authoring, validation and playing in the browser work without an account. Clayzo's own
`render-frame`, `preview`, `review` and `export` (MP4, GIF) need `npx clayzo login`, which is Ian's to do.
Frames were checked through the `?sheet` page in Chrome instead.
