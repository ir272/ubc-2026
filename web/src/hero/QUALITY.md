# Hero quality spec

This is the standard every builder of the code-drawn hero works to. Read it fully before touching a part.

Ian's verdict on the version before this spec: "the quality is really bad, seriously subpar, way worse and
less detailed than our original midjourney picture. This is plain and lacks character. And most importantly
is extremely unprofessional."

## References (open them, do not work from memory)

| What | Where | What it is for |
|---|---|---|
| Ian's picture | `refs/hero/06-extended-upscaled.png` (3808 x 1280) | The look, the composition and the MINIMUM level of detail for this scene |
| Crops of Ian's picture | `refs/hero/loop/ian-crops/tv.png`, `figures.png`, `couch.png`, `tree.png`, `sign-test.png` | Close study of each object |
| Quality target video | `refs/hero/target/quality-target.mp4` | The bar for craft, detail, character and liveliness. NOT the subject, NOT the style |
| Target frames | `refs/hero/loop/target-frames/t02.jpg` to `t50.jpg`, `crop-t22-plaza-3x.jpg`, `crop-t14-street-3x.jpg`, `crop-t30-2x.jpg`, `crop-t38-2x.jpg`, `motion-plaza-4frames.jpg` | How the target is built, close up |
| The version Ian rejected | `refs/hero/loop/current-before.png`, `refs/hero/loop/current-crops/` | What not to ship again |

Scene units are 3000 x 1000. Ian's picture maps to scene units by multiplying its pixels by 0.788.
On a 1440 px wide laptop one scene unit is about half a CSS pixel (one device pixel on a retina screen).

## Fixed facts

- Everything is drawn by code on the canvas. No image files, no new packages, no sound.
- The scene is ALREADY DISPLAYED on load. No draw-on entrance, no fade-in. Treat `reveal` as 1 and `alive` as
  true; delete intro-only branches as you rewrite a part (keep the `intro` field so the `Part` type still fits).
- Every motion is a pure function of `t`. Loops have no visible jump. One-off events come from a
  deterministic schedule (event k happens at `k * period + hash(k) * jitter`).
- A whole frame stays under about 8 ms. Budget: world 2 ms, left 3 ms, right 3 ms.
- Never use the middle-dot character in any text. No explanatory text in the scene; the only word is "Welcome".
- Subject, composition, palette and cast come from Ian's picture. Do not invent a new cast or new hues.
  The three walkers stay the cap one, the backpack one and the hooded scarf one. The friends stay the
  curly-haired one who points and the long-haired one beside them.

---

## (a) Why the target looks professional and ours looked amateur

### What the target does

1. **One hand drew all of it.** Outlines are about 2 to 2.5 px at 1920 wide on every object, large or small.
   Inner detail lines are thinner. Nothing is drawn with a fatter or thinner pen than its neighbours.
   Lines are a little alive (slight waver, corners overshoot a hair) but they are confident, never shaky.
2. **Every object is designed, not symbolised.** A market stall has a striped awning, four legs, crates,
   and different fruit in each crate. A window has a frame, mullions and a tint. A car has a roof panel,
   glass, wheels with hubs, lights. You could build each thing from the drawing.
3. **Three steps of value on everything.** A flat base colour, a darker plane or crescent on the shaded side,
   and texture marks on top (short dashes on grass and road, hatch on walls, flecks of paper grain).
   Things cast a soft darker patch on the ground, so they sit instead of float.
4. **Density with hierarchy.** Big shapes, then medium, then tiny. Busy clusters are separated by calm
   areas (roads, bare paper). Almost no patch larger than a thumbnail is empty unless it is a deliberate rest.
5. **Characters come from one construction kit and are all different.** Big round head (about a third of
   the height), a solid hair shape, two dot eyes, a torso and arms in one colour, legs in another, shoes.
   They differ by hair, skin, clothes, prop and pose, and EVERY one is doing something: cheering, drumming,
   carrying, sitting, pointing, feeding an animal. Small stories everywhere (a wedding, a lion dance).
6. **Many small motions, none of them loud.** In any view a dozen things move: arms wave, a cyclist crosses,
   flags and bunting flutter, fountains spray, cars drive, the lion dancer turns. Each loop is modest and
   has its own rhythm. The paper grain itself re-seeds about 8 times a second (measured: a texture change
   every 4th frame at 30 fps), which makes it feel hand-made.
7. **A small palette, repeated.** The same red, green, blue, yellow and cream recur across the whole city,
   so it holds together.
8. **Clean construction.** Fills meet their outlines exactly. Overlaps are resolved: nothing shows through
   anything else. Edges that should be straight are straight.

### What the rejected version did

1. One fat, visibly wobbling line (5 to 6 units) for everything. It reads as a marker held in a fist.
2. Objects are symbols: the TV is a rounded rectangle with two circles, the tree is three clouds on sticks,
   the couch is a box, the hills are sine bumps.
3. The people are tube figures with ball heads: no faces, hands, hair design or clothes. Their bodies are
   see-through against the couch.
4. Fills are flat and empty. The ground is one green block with a gradient. No shading, texture or shadows.
5. It is sparse. Most objects have fewer than ten marks. Ian's picture has hundreds per object.
6. Mechanical repetition: identical grass tufts at even spacing, identical tick marks in the tree.
7. The sign uses a system font that changes per computer.
8. The game on the screen is one line, a tiny figure and a square.
9. Colour is used only as outline colour. There is no range from dark to light inside any shape.
10. The friends and couch are too small, and nothing overlaps anything to give depth.

---

## (b) The craft standard for our look

Our look is the reverse of the target's: light ink on near-black paper, with dark flat fills. The same
discipline applies.

### Line weights: five tiers, chosen by ROLE, never by which part you are drawing

| Tier | Width (scene units) | Used for |
|---|---|---|
| Land contour | 4.6 to 5.0, with glow | The top edge of the ridge and of each hill layer. Nothing else. |
| Silhouette | 3.4 to 3.8 | The outer outline of an object or a full-size character part: TV casing, couch, sign board, trunk, a torso, a head |
| Form | 2.4 to 2.8 | Structure inside a silhouette: bezel rings, cushion edges, sleeve and trouser lines, plank edges, main branches |
| Detail | 1.6 to 2.0 | Seams, knobs, faces, fingers, laces, grille slats, leaf marks, small props, twigs |
| Hairline | 1.1 to 1.4, alpha 0.35 to 0.6 | Hatching, wood grain, fabric texture, strata, stipple |

Rules:
- A shape drawn smaller than 60 units uses the next thinner tier, so small things do not clog.
- Wobble is nearly invisible: at most 0.8 units of sideways drift on a silhouette line, 0.4 on manufactured
  objects (the TV, the couch frame, the sign board), none on hairlines. If you can see the line shake, it is too much.
- Lines taper where a hand would lift: blades of grass, hair strands, hatching, twigs and leaf marks end in a point.
- Straight edges of made objects are straight. Curves are smooth curves, not polylines with visible corners.
- Outlines close. Corners meet. Where two forms meet, the nearer one's outline is unbroken and the farther
  one's line stops at it.

### Fills and shading: every filled shape gets three tones and a texture

`tone(C, k)` means colour C mixed toward `PAPER`, keeping fraction k of C.

| Tone | Recipe | Where |
|---|---|---|
| Body | `tone(C, 0.16)` | The whole shape. Always opaque, so the shape hides what is behind it |
| Shade | `tone(C, 0.08)` | The planes facing down or right, undersides, the far limb, inside folds, under an overlapping form |
| Lit | `tone(C, 0.28)` | The planes facing up or left, tops of cushions, the top of a head or shoulder |
| Accent | `tone(C, 0.55)` up to pure C | Small areas only, at most about 8% of an object: a scarf, a mug, a lamp shade, a visor |

Green land uses fixed tones: body `#324524` (GREEN), shade `#24331b`, lit `#41592e`, sheen `#557440` (thin bands only).

- **Light direction is the same everywhere: from the upper left** (the moon and the TV are both on that side).
  Lit tone on up-left planes, shade on down-right planes and undersides.
- **TV glow.** Surfaces that face the TV and are within about 500 units of the screen get a thin warm-green
  rim whose strength follows the screen flicker. Far objects (the friends, the couch) get a faint cool rim
  on their left edges instead. This one shared idea ties the scene together.
- **Shade shapes are designed shapes** with a clean edge (a crescent, a wedge, a band), not gradients and
  not blurs. Canvas gradients are allowed only for glows (screen, moon, lantern, fireflies) and the paper vignette.
- **Contact shadows.** Everything that stands on the ground has a flat ellipse or band of land-shade under it,
  plus two or three grass tufts drawn in front of its base.
- **Texture goes on shade planes first.** Hatch follows the form (along a cushion's curve, around a trunk,
  along a cliff face), with broken strokes and uneven gaps of 7 to 12 units. Never cross-hatch a whole shape.
  Lit planes stay mostly clean. Texture alpha 0.35 to 0.6 so it never competes with outlines.
- **Glow is reserved** for the land contour, the screen, bright stars, the moon, lanterns and fireflies.
  Glow recipe for a line: the same stroke at 3.2x width and alpha 0.10, then 1.8x and alpha 0.16, then the core.

### Palette

Only these hues, plus their tones: INK `#f2efe6`, GREEN_LINE `#e9e2b8`, GREEN, WARM `#d8b06a`,
ORANGE `#e0a15c`, GOLD `#e7c873`, BLUE `#8fb0e6`, PAPER `#0c100b`.
- Land contours: GREEN_LINE. TV and anything wooden or brass: WARM and ORANGE. Friends and couch: BLUE with
  small INK and WARM accents. Tree, stars, sign lettering: INK. Light sources: GOLD.
- Each walker has one ink colour (INK, ORANGE, BLUE) plus one small accent from another hue.
- No new hues. Variety comes from tones, not from more colours.

### Level of detail: minimum mark counts

A "mark" is one deliberate stroke or small filled shape. These are floors, not targets.

| Object | Minimum |
|---|---|
| Television (without the game) | 180 marks |
| Game on the screen | 3 parallax layers, 60 marks visible at any moment |
| Hills | 4 overlapping layers, 25 small props, 150 texture strokes |
| Each walker | 40 marks, 2 accessories, 1 thing that trails or bounces |
| Couch and props | 120 marks |
| Each friend | 80 marks |
| Tree | 700 leaf marks in 6 to 8 pads, 60 bark and branch strokes |
| Sign | 45 marks |
| Ridge and ground life | 110 tufts in 5 plant types, 40 flowers, 25 stones, 16 fireflies |
| Sky | 140 stars in 3 sizes, a moon, 2 constellations, 2 thin clouds |

Density rule: on land, no window of 140 x 140 units is empty of deliberate marks. The middle of the sky is
the one large rest area (see the quiet box in the world section).

### Character construction (walkers and friends)

1. **Built from closed, filled shapes with outlines.** Never a centre-line with a thick stroke. A limb is two
   tapered segments with real width (thigh wider than shin, upper arm wider than forearm) that overlap at the joint.
2. **Paint back to front:** far arm, far leg, torso, head, near leg, near arm, held props. Every shape is
   opaque (body tone), so nothing shows through.
3. **Heads have faces.** At minimum an eye with a brow or lid, a nose or visor shape, and a mouth that
   changes with the acting. Hair or headgear is one designed mass with a clear silhouette plus strand or seam lines.
4. **Hands and feet are shapes.** A hand is a mitt with a thumb; a pointing hand has an index finger.
   A foot is a shoe with a sole line and a heel.
5. **Clothes are drawn.** A collar or hood, a hem, a cuff, at least one seam or pocket, folds at elbow and knee.
6. **Silhouette test.** Filled solid, each character must be recognisable and different from the others.
   Vary height, width, head shape and posture, not just colour.
7. **Proportions.** Walkers: 3 to 3.5 heads tall, 120 to 150 units standing at full size. Friends: about
   6 heads, drawn naturalistically as in Ian's picture, 230 to 250 units from shoe to hair when seated,
   head about 46 units tall.
8. **Posture carries personality.** Give each a line of action (a lean, a slouch, a puffed chest) and keep it
   through every pose.

### Motion rules

- **Wind is shared.** Anything blown uses `wind(t, x)` from `engine/layout.ts`, so gusts cross the scene together.
- **Lag makes it alive.** A child part follows its parent late: evaluate the same driver at `t - lag`
  (hair and scarf tips 0.15 to 0.3 s, a backpack 0.08 s, a branch tip 0.2 s behind its branch).
- **Three scales of movement at once:** large and slow (tree, antenna: 2 to 4 degrees over 3 to 6 s),
  medium (grass tips 6 to 12 units, cloth hems), small and quick (leaf flutter 1 to 2 units, twinkles).
- **Acting is poses and holds, not sine waves.** A gesture has anticipation (a small dip, 0.15 s), an eased
  move with overshoot, a hold of at least 0.4 s, and a settle. Use eased ramps between held poses.
- **Idle life on every character at all times:** breathing (period 3.5 to 4.5 s, chest moves 1.5 to 2%),
  blinks (every 3 to 6 s, 0.12 s long), small weight shifts, glances.
- **Walks have no foot slide,** a contact, down, passing and up position, arms opposite the legs, a head that
  bobs slightly late, and a different gait per character.
- **Periods must not line up.** Use periods without common factors so the scene never visibly repeats.
- **Liveliness floor:** at any moment at least 12 things are moving in any 600-unit-wide stretch of land.
  Nothing moves inside the quiet box except the faintest star twinkle.
- **Land does not wobble.** Ground and hill contours are still, except the pour right at the screen's lip.

### Performance: how to afford this much detail

- Anything that never moves is painted once into an offscreen canvas and blitted each frame.
- Anything that moves as a rigid group (a foliage pad, the sign board, a throw, the antenna, a walker's
  backpack) is cached as a sprite and drawn each frame with a translate, rotate or skew.
- Only truly deforming things are re-stroked every frame (limbs, grass blades, cloth edges, faces).
  Keep live `pen.stroke` calls under about 250 per area per frame.
- Rebuild caches when the canvas pixel size changes (key them on `ctx.getTransform().a`).
- Precompute all random layouts once at module load from fixed seeds. No `Math.random()` in `draw`.

---

## (c) What to draw and what moves, by area

### Shared engine (the world builder owns it)

Existing calls must keep working unchanged: `pen.stroke`, `pen.fill`, `pen.curve`, `pen.text`, and every
export of `engine/layout.ts` (`GROUND`, `groundY`, `TV`, `WALK`, `SIGN`, `COUCH`, `TREE`, `SKY`, `wind`,
the colours, `INTRO_END`). Values of `GROUND` between x 2200 and 3000 and the `TV` box must not change, since
the other two builders stand things on them.

Add (names fixed so the other builders can adopt them later):
- `StrokeOpts.taper?: number | [number, number]` (0 to 1: how far the start and end thin to a point).
- `StrokeOpts.wobble?: number` (multiplier on the hand drift; default gives at most 0.8 units, not the old 1.9).
- `pen.hatch(clip, { angle, gap, width, color, alpha, seed, breakup })`: broken parallel strokes inside a shape.
- `pen.stipple(clip, { count, r, color, alpha, seed })`: scattered dots or ticks inside a shape.
- `pen.glow(pts, o)`: a stroke with the halo recipe above.
- `pen.cache(key, box, paint)`: paint once offscreen at device resolution, blit after; repaints on resize.
- In layout: `tone(color, k)`, `GREEN_SHADE`, `GREEN_LIT`, `GREEN_SHEEN`, `tvGlow(t)` (0 to 1 screen
  flicker), `rnd(seed)` (0 to 1 hash), `QUIET` (the quiet box), `underY(x)` (the underside of the land strip).

Left and right builders: do not wait for these. Keep equivalent helpers in `parts/left/world.ts` and
`parts/right/kit.ts`, built to the recipes in section (b), so all three areas match by construction.
Retune the pen so the default line no longer looks shaky: that single change affects every part.

### World

**Paper.** A cached full-scene layer under everything: fine grain (several thousand specks, lighter and
darker than the paper, alpha 0.02 to 0.05), a few faint vertical fibre streaks as in Ian's picture, and a
soft vignette toward the corners. Optional: cycle 3 grain variants at about 8 per second, as the target
does; keep it only if it is barely noticeable behind the headline.

**Quiet box.** x 960 to 2060, y 150 to 440. Inside it: only the faintest stars (alpha 0.35 or less, radius
1.6 or less). No flares, moon, clouds, constellations, shooting stars or fireflies. The sign's top stays below y 440.

**Sky.**
- 140 or more stars in three classes: dust (most of them), small four-point sparks, and a dozen of the
  six-point asterisk stars from Ian's picture drawn as three crossed tapered strokes. Slight hue variety
  (INK, a few GOLD, a few BLUE). Cluster them; leave gaps; no even scatter.
- A crescent moon at about (880, 150), radius about 42: outline, a hatched dark side, two or three craters, a soft glow.
- Two small hand-drawn constellations (thin hairlines joining stars) left of x 940 and right of x 2080.
- Two thin line-drawn cloud wisps drifting very slowly, in the band above y 150 or outside the quiet box.
- Motion: each star twinkles on its own period; a bright one flares now and then with a short four-ray
  glint; a shooting star every 7 to 11 s with a tapered tail and a head spark, routed above y 150 or outside
  the quiet box; the moon's glow breathes slowly; a glisten sweep crosses the dust every 20 s or so.

**Ground: a strip of land, as in Ian's picture, not a block.**
- Top contour: land-contour weight with glow, GREEN_LINE.
- The strip is 45 to 110 units thick, thickest under the couch, tree and sign, joining the hill mass at the left.
- Inside: body green, a lit sheen band just under the top line, shade toward the bottom, form-following
  hairline strata, a few embedded stones and roots.
- Underside: a second, thinner, more ragged contour (form weight, lower alpha), with hanging root hairs,
  small overhangs and two or three pebbles that have crumbled off. Below it, bare paper.
- A faint worn footpath along the top where the walkers go (lighter dashes, small pebbles).

**Plants, stones, small life.**
- Five plant types, mixed in clumps of three to five with gaps between: tall tapered grass, short tufts,
  seed-head stalks, a fern or broad leaf, clover patches. Three tones, so near blades are brighter.
- 40 or more flowers on stems: daisies (INK petals, GOLD centre), bells (BLUE), small poppies (ORANGE).
- 25 or more stones with a shade side and a lichen tick; three or four mushrooms; fallen leaves under the tree.
- A foreground layer (registered above the couch and sign) so tufts overlap the bases of the TV legs, sign
  post, couch legs and trunk.
- 16 or more fireflies in two loose groups (near the sign, near the couch and tree), GOLD with a soft halo,
  drifting on looping paths and pulsing; a few rise out of the grass. Two moths circling the TV's glow.
- Motion: every blade bends with the wind and has its own flutter; seed heads nod late; flowers bob;
  one or two petals or seeds drift off in a gust.

**The Welcome sign: a designed wooden object** (see `ian-crops/sign-test.png`: a warm wooden board on a post).
- A board of three planks with visible joints, grain hairlines, two knots, chamfered or slightly uneven
  ends, a thin frame, four nail heads; WARM outline with wood tones; a shade band along the bottom.
- A post with grain, a cap, a diagonal brace, and a base packed with stones and tufts. A small hanging
  lantern or a perched bird is welcome if it stays below y 440.
- "Welcome" is LETTERED WITH THE PEN: each letter a path of tapered strokes in one flowing hand. No system font.
- Motion: the board creaks on its fixings with the wind, lagging the post; a bird looks around and
  occasionally hops, or a lantern swings and its glow flickers.

**Cohesion duty.** After the other two areas land, check the whole frame: same line tiers, same tones, same
light direction, contact shadows under everything, nothing floating, nothing brighter than the headline area allows.

### Left: television, game, hills, walkers

**The television: a real 1970s set, seen slightly from the right as in Ian's picture** (`ian-crops/tv.png`).
- Casing with visible depth on its left side and top, rounded corners, wood-grain hairlines on the cabinet,
  a seam line, corner screws, vent slots on the top or side.
- Bezel: three or four nested rings in WARM and ORANGE with thin filled bands between them, as in the picture.
- Glass: rounded-corner tube with a bulge. Two soft reflection streaks top-left, a fainter one bottom-right,
  an inner shadow along the top edge.
- Control column on the right: a channel dial with tick marks and a pointer, a smaller volume dial, two or
  three push buttons or sliders, a tiny lit indicator, a blank brand plate, and a speaker grille of 14 to 18
  slats each with a shade line.
- Antenna: a base dome with a collar, two telescoping rods with segment joints and ball tips.
- Underneath: a stand or four tapered legs with ferrules, a shelf with a console or stacked cartridges,
  a cable that curls down into the grass.
- One or two charm details on top (a small plant, a mug, a stack of cartridges).
- Shading: lit top plane, shaded right side and underside, hatch under the bezel lip, a contact shadow,
  and a warm-green glow from the screen onto the bezel and the nearest hill, following `tvGlow(t)`.
- Motion: antenna rods sway and spring with the wind (tips lag); the screen flickers gently and a faint
  scan band rolls; the reflection streak slides a little; the indicator blinks; the channel dial ticks
  round a notch now and then; the cable end twitches in gusts; the moths cast tiny passing shadows.

**The game on the screen: a real little side-scroller, loop about 12 s.**
- Three parallax layers clipped to the glass: far terraced mountains, mid hills with tiny trees and a small
  tower or flag, and near ground with a grassy top edge, strata and gaps.
- A runner who is a small version of one of the walkers, with a proper run cycle; it jumps a crate, hops a
  gap, and bounces off a hopping slime.
- Pickups: coins or stars that spin, pop with a sparkle when collected, and tick up a row of pips; three
  hearts in the corner. No text, no digits.
- Clouds, a far bird, dust puffs at the feet, a flag at a checkpoint.
- Faint scanlines, a vignette and the bulge highlight on top. The near ground of the game is the same land
  that pours out over the bezel.

**The hills: terraced game-world land, as in Ian's picture, not sine bumps.**
- Four or more overlapping layers with stepped plateaus, small cliffs, ledges and overhangs. Each layer has
  its own heavy contour with glow.
- Each layer: lit sheen band under its top line, body green, shade at the bottom and directly under the
  layer in front, hairline hatch down the cliff faces.
- The pour: land flows over the screen's lower-right lip in a thick, folded sheet, with fold lines and a
  slow ripple travelling outward for the first 150 units only.
- 25 or more small game-world props: checkpoint flags, a ladder, a tiny bridge, crates, coins floating over
  ledges, mushrooms, a small door or cave mouth, miniature trees echoing the big tree, a signpost with no text.
- Motion: coins bob and spin, flags flutter with the wind, a thin waterfall streams off one ledge with a
  splash, tufts sway, a slime hops along a far ledge, sparkles drift up from the pour.

**The walkers: three designed characters** (`ian-crops/figures.png` shows the weight and bulk they should have).
- The cap one (INK): upright and cheerful. Cap with a brim and button, tufts of hair, a satchel on a strap,
  rolled sleeves, boots. Gait: brisk march, arms swinging high. The satchel bounces.
- The backpack one (ORANGE): short and stout. Goggles or a visor, a big pack with a bedroll, buckles and a
  dangling mug or lantern, chunky boots. Gait: quick small steps with a waddle. The pack sways late.
- The hooded scarf one (BLUE): tall and narrow. Deep hood with the face in shadow and two bright eyes, a long
  scarf, a cloak with a ragged hem. Gait: long gliding strides. Scarf and hem trail in the wind.
- Each follows the character construction rules: filled shapes, face, hands, shoes, shade side, two accessories.
- They step out over the bezel (a hand on the frame, a leg over), not slide out and scale up.
- Along the ridge they behave: one stops to look at the sign, one bends to a flower or jumps at a firefly,
  each waves at the couch in its own way. Then they hop and fade as before.
- Spacing and speed so that at least two are on the ridge at any time. The ridge must never look empty.
- Feet land on `groundY`; a small contact shadow and a dust tick at each footfall.

### Right: couch, friends, tree

Sizes from Ian's picture (`ian-crops/couch.png`, `tree.png`): couch about 370 to 400 units wide and 180
tall with legs; friends 230 to 250 units from shoe to hair; tree crown about 520 wide and 290 tall, reaching
up and left over the couch. The group must feel as substantial as the TV. Keep everything right of x 2260.

**The couch: a mid-century sofa, as in Ian's picture.**
- Two back cushions and two seat cushions with piping, a front rail, boxy arms with rounded tops, four
  tapered legs with ferrules, button tufts, creases where the cushions meet.
- Cushions sag under each friend and puff between them. Fabric hatch on shaded faces, lit tops.
- Props: a throw with a fringe over one arm, a loose cushion, a bowl of popcorn between or on a lap,
  a small side table or crate with two mugs (steam), a lantern hanging from a low branch or standing by the
  arm, a pair of kicked-off shoes or a bag on the grass.
- Motion: the fringe and throw edge lift in gusts; steam curls; the lantern swings and its glow flickers onto
  the couch arm; the cushion squashes when the cheering friend bounces; a popcorn piece is tossed now and then.

**The two friends: appealing, specific people.**
- The pointer (left): curly hair as a mass of loops, a hoodie or jacket with a collar and pocket, one leg
  crossed ankle on knee as in the picture, sneakers with soles and laces. Leans forward, eager.
- The cheerer (right): long hair with strand lines falling over a shoulder, a sweater with a different
  texture or stripes, legs tucked up or stretched out, socks or boots. Leans into the pointer, relaxed until excited.
- Faces in three-quarter view toward the TV: eye with lid and brow, nose, mouth, ear, jaw line. Mouths open
  when they cheer, smile at rest. Brows lift when a walker appears.
- Hands with thumbs; the pointing hand has an index finger; a hand dips into the popcorn.
- Shading: body tone fills so they hide the couch behind them, shade under the chin, inside the far arm,
  between the legs; a faint cool rim on their left edges from the TV side.
- Acting, on a loop of about 40 s built from held poses: the pointer points and waves when a walker nears,
  nudges the other; the cheerer waves, throws both arms up, claps, leans in to say something; they glance at
  each other and laugh (shoulders shake); between beats they breathe, blink, shift, tap a foot, eat popcorn.
  Hair and sleeve ends lag every move.

**The tree: the windswept tree from Ian's picture, not clouds on sticks.**
- Trunk rises behind the couch's right end, leans right, then sweeps up and left. It is a bundle of three to
  five flowing bark lines that twist together, with knots, a hollow, and roots gripping the ground.
- Three levels of branching, tapering to twigs. Shade on the underside of trunk and limbs, hairline bark texture.
- Foliage in 6 to 8 flat, layered, horizontal pads. Each pad is a dark body shape with a ragged edge, covered
  in small leaf marks in three brightnesses (dim behind, bright on the upper-left rim). The edge is lacy:
  made of leaves, never a scalloped cloud outline.
- A few details: a hanging lantern or string of small lights toward the couch, a bird or owl with blinking
  eyes, a nest, a few leaves caught mid-fall.
- Motion: pads sway with the wind, each level later and wider than the one below; leaf marks shimmer (a
  changing subset tilts and brightens as a gust passes); twig tips bob; a leaf detaches every few seconds,
  spirals down, lands on the couch, a friend or the grass and fades; the bird shifts and turns its head.

---

## (d) Avoid

- **Clutter without design.** Do not sprinkle marks to hit a count. Every mark describes a form, a material
  or a prop someone could name.
- **Stick or tube figures.** No centre-line limbs, no ball heads without faces, no see-through bodies.
- **Uniform outlines.** One weight for everything is the fastest way back to "amateur". Use the five tiers.
- **Visible wobble.** If a line looks shaky or the wobble has a regular rhythm, it is wrong.
- **Empty flat shapes.** No filled shape without a shade plane and some texture; no big featureless block of green.
- **Noisy scribble.** Texture is ordered and quiet (form-following, low alpha). Ian's picture is detailed, not messy.
- **Symbol shortcuts.** Cloud-outline trees, rounded-rectangle TVs, box couches, sine-wave hills.
- **Copy-paste repetition.** No identical tufts, leaves, stars or props at even spacing. Vary size, angle and gap.
- **Floating objects.** Everything has a contact shadow and grass at its base.
- **Glow on everything.** Glow belongs to the land contour and light sources only.
- **Single-sine acting, sliding feet, popping loops,** or anything bright or moving in the quiet box.
- **System fonts, the middle-dot character, explanatory text, new hues, new cast members.**

## Self-check before you say a part is done

1. Take a 3000 x 1000 screenshot at two different `?t=` values and crop your area at 1:1.
2. Put the crop beside the matching crop of Ian's picture. Is ours at least as detailed and as characterful?
3. Put it beside `target-frames/crop-t22-plaza-3x.jpg`. Is the craft (line discipline, shading, construction) at that level?
4. Squint: do the big shapes read first, and is the light direction clear?
5. Solid-fill silhouette test on each character.
6. Count what moves in your area. Check the loop seams with two frames a loop apart.
7. Measure the frame time with your part alone (`?only=`): inside your budget?
