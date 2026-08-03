# Art review — first look, 2026-08-03

This is the first time anything drawn in this repository has been
looked at.

Until now every visual claim here was structural: a test proved a grid
was rectangular, that its characters were in the palette, that a layer
landed on the frame it declared. None of that can see whether a face
reads as a face. `npm run postcards` (task 0120) renders the art to PNG
offline — the sheets below were opened, one at a time, and this is what
they actually look like.

**How to reproduce.** `npm run postcards` writes 37 PNGs under
`postcards/` (gitignored) in about 12 seconds: one sheet family per
gallery section, plus portraits, a composed-character matrix, walk
strips, gear, the roster, and six isometric scenes painted by
`src/iso/render.ts` itself. Every number quoted below was measured, not
estimated; where a number is quoted the method is named so it can be
re-run.

---

## What is good

Worth saying first, because most of what follows is criticism.

- **Tiles tessellate exactly.** A 6×6 patch of every registered ground
  kind, laid at the renderer's own tile pitch, covers its interior with
  **zero holes and zero overlapping pixels**. `DIAMOND_WIDTHS` sums to
  1024, which is exactly half a 64×32 box — the diamond mask is right.
- **Nothing drifts between frames.** Across every prop, interactable,
  animated tile and body loop, the painted bounding box moves at most
  one pixel vertically between frames of a loop. There are no animation
  pops of the "sprite jumps a row" kind.
- **The scenes compose correctly.** Depth sorting, the glow pass,
  puddle variants, rain, the dusk/night/late palettes, ticker windows,
  telegraph tints and the affordance layer all render as described.
  `scene-street-night.png` is a coherent, readable street.
- **The portrait cast is the best art in the game.** Sixty-two authored
  faces on one sheet, and they read as sixty-two people. The hostility
  convention lands: crimson and magenta optics on hostiles, cyan and
  amber on allies, legible at a glance.
- **The warden chassis is the best single sprite.** Real depth, a
  silhouette nothing else shares, a plausible sense of mass.

---

## Findings

### F1 — Two of the four facings light from the wrong side

**Severity: high.** `src/iso/art/palette.ts` opens by promising "a
consistent top-left light source". Facings `s` and `w` are produced by
mirroring the authored `e` and `n` views, which mirrors the shading with
them.

Measured on the warden chassis (mean x of its white-ink specular, frame
width 96):

| facing | mean specular x | key light |
|---|---|---|
| n | 29.4 | top-left |
| e | 29.0 | top-left |
| s | 66.0 | **top-right** |
| w | 65.6 | **top-right** |

Bodies do the same: the porcelain highlight sits at x≈12.8 of 32 in the
authored views and therefore at x≈19.2 in the mirrored ones. Half of
everything on screen is lit from the wrong side, and in
`scene-arena.png` you can see it — the boss's brightest edge is its
top-right corner.

*Deferred.* The fix is authored per-view art (or a re-shade pass on the
mirror), which is the density arc's job, not a one-line change.

### F2 — Cyberware is not visible on the sprite

**Severity: high.** The art direction says "installed cyberware shows
(chrome arm, eye glow, neural jack)". Pixels changed against a bare
lean body on the `e` facing, out of a 32×48 = 1536-pixel frame:

| layer | px changed | share |
|---|---|---|
| chrome-arm | 36 | 2.3% |
| dermal-plate | 13 | 0.8% |
| gill-slits | 8 | 0.5% |
| veil-film | 8 | 0.5% |
| optics | 6 | 0.4% |
| neural-jack | 6 | 0.4% |

On `art-appearance-05.png` the four smallest are indistinguishable from
a bare body. Only the chrome arm reads. A player who spends 860 credits
on implants cannot see any of it on the street.

*Deferred.* Re-authoring at native density is where these get room.

### F3 — Raven hair has the same luminance as the background it sits on

**Severity: medium.** Raven (`K` #1b1826) is the canonical hair channel
*and* the default hair colour. WCAG contrast ratios against the colours
it is most often drawn over:

| against | ratio |
|---|---|
| `2` charcoal #161a26 | **1.00 : 1** |
| `V` fabric shade #16131f | 1.05 : 1 |
| `1` ink #0d0f18 | 1.10 : 1 |
| `W` fabric base #272138 | 1.13 : 1 |
| `0` void outline #05060c | 1.16 : 1 |

Hair grids are authored as solid `K` with no outline of their own, so
wherever hair extends past the skull — spikes, mohawk, locs, ponytail —
the shape vanishes into the scene and what reads instead is the *pale
head showing between* the invisible strands. On `character-matrix-01.png`
this is unmistakable: several cells look like a person with two
horns. Every other hair colour is fine (chestnut is 1.80:1 against the
fabric shade, silver 12.08:1).

*Deferred, deliberately.* One character in `palette.ts` would change it,
but which colour raven should become is an art-direction call and `K` is
also what every hair layer is authored in. Flagging rather than
unilaterally repainting the default character.

### F4 — Three combat readouts are unreadable over the commonest ground

**Severity: medium.** `POPUP_STYLES` inks, against concrete (`R`
#50525a — the base of the most common floor material) and rust
(`c` #6e5137):

| kind | ink | vs concrete | vs rust |
|---|---|---|---|
| status-out | `6` #4c566e | **1.06 : 1** | **1.01 : 1** |
| miss | `7` #6b7691 | 1.72 : 1 | 1.60 : 1 |
| damage | `p` #ff4d5e | 2.40 : 1 | 2.24 : 1 |
| reduced | `8` #9aa3b8 | 3.08 : 1 | 2.87 : 1 |
| heal | `g` #2ee6d6 | 4.97 : 1 | 4.63 : 1 |
| critical | `n` #ffd977 | 5.73 : 1 | 5.33 : 1 |
| status | `h` #7ff5ea | 5.99 : 1 | 5.58 : 1 |

"GUARD DOWN" is drawn in a colour the ground is already wearing. On
`art-popups.png` it is the one cell you have to hunt for. The intent —
"the same word, gone cold" — is right; the value chosen for it is one
step too far down the ramp. The only thing keeping it legible is the
one-pixel drop shadow, which covers the down-right edges of each stroke
and nothing else.

*Deferred.* A one-character change, but `7` and `8` are both already
spoken for by `miss` and `reduced`, so picking the replacement is a
readability-language decision rather than a typo fix.

### F5 — The attack animation does not move the attacker

**Severity: medium.** `art-attacks.png` is 48 strips: every weapon
class, both builds, four facings, frame by frame. Across all of them
the body stands still. What moves is a weapon sprite of a few pixels,
translating a few pixels. The unarmed set is three frames in which the
only difference is a hand nub — a punch that does not read as a punch.
The lash is a two-pixel amber dot.

The pieces claimed in `gallery.ts` ("the arm reach, the lean, and the
landed weight") are all present in the data; at 32×48 with a ±1-pixel
lean they are below the threshold of visibility.

*Deferred.*

### F6 — The walk is a leg animation

**Severity: low-medium.** `character-walk.png`, eight frames per strip.
The stride and the foot treadmill read correctly and the feet never
slide. But the rise and fall is ±1 art pixel over a 48-pixel figure, and
the arm counter-swing is a one-pixel band, so the upper body and head
sit still while the legs alternate underneath. It reads as gliding.

*Deferred.*

### F7 — Outfits differ by an accent stripe and nothing else

**Severity: medium.** On `character-matrix-01.png`, six of the seven
outfits (courier-slicker, spire-suit, diver-harness, ghostline-mantle,
highline-rig, tender-coat) are the same dark violet torso with a
differently-coloured one-pixel accent line. Only cordon-plate has a
silhouette or a value of its own, and it is instantly the only one you
can name. The same holds in portrait: the shoulder band is one dark
shape plus a vertical collar stripe, so most of the cast reads as the
same coat in a different tie.

*Deferred.*

### F8 — The city repeats verbatim

**Severity: medium.** `scene-market.png` shows about twenty copies of
the single `building` prop marching up one diagonal, and the
`cable-bundle` prop repeating on a regular lattice across the pavement.
There is one building drawing and no variation pass, so a district reads
as tiled rather than built.

*Deferred.*

### F9 — Small things that are smaller than they look in the data

**Severity: low.** Collected from `art-effects.png`,
`art-interactables.png`, `art-setpieces.png` and `art-drones.png`:

- **Impacts are specks.** Muzzle flash, spark burst, wall chip and
  impact flash are 8–12 art pixels — 16–24 screen pixels on a 128-pixel
  tile. Tracers are 1-pixel strokes a few pixels long.
- **The locomotive is a carriage.** `train-head` differs from
  `train-car` in **114 pixels of 7,968** (1.4%). Nothing at the front
  of the overline says "front".
- **The stash never opens.** Its four-frame idle loop changes **5
  pixels of 1,160** (0.4%). The `door`'s two-frame loop changes 106 of
  2,832 and reads as static too.
- **The patrol drone is a scan cone.** Its body is a six-pixel white
  dash under a cyan cone; beside the trains on the same sheet it does
  not read as a machine.
- **The drone has one side.** Its `e`, `s` and `w` idles are visually
  identical (a symmetric chassis mirrored), so three of four facings
  give the player no information.
- **The door is drawn face-on.** It is a flat front elevation standing
  in an isometric world; every other object is projected.
- **Reactions barely react.** The static drone's `flinch` and `shudder`
  are two frames each with no visible displacement. Its `collapse` and
  `sparkout` are good — they sink and flatten convincingly.

*All deferred.*

### F10 — Interiors have almost no value range

**Severity: low-medium.** `scene-interior.png` (Auric executive floor):
the floor plates, the walls and the characters' outfits are all within
a couple of steps of each other, and the only things carrying value are
the glass partitions and the pale heads. A person standing on that
floor is a face and a magenta stripe.

*Deferred.*

### F11 — The magenta accent out-reads everything

**Severity: low.** The outfit-accent channel (`l`/`j`/`k`, the magenta
ramp) is the loudest thing on nearly every character sprite — a bright
pink T across the chest on the front views and a bar down the middle on
the sides. It out-reads the weapon, the cyberware and the outfit
itself. On the bare body sheet (`art-bodies.png`), where there is no
outfit at all, it is still the first thing the eye lands on.

*Deferred.*

---

## Fixed in this task

Both were found by opening the PNGs, which is the point.

1. **Frame numbers collided with short frames.** The sheet layout
   bottom-aligned each frame inside a band that also held the frame
   index, so a frame shorter than its neighbours was drawn over its own
   number — on the first `art-props.png` two `cage-lamp` frames looked
   like stray gold blobs under the lamps. Numbers now get their own
   band under the art (`src/postcards/sheet.ts`).
2. **Scenes were written over a transparent void.** `renderScene`
   clears to transparent and paints the world over it — correct in the
   browser, where `--nf-bg-deep` is behind the canvas, but it meant
   every scene postcard had a blank surround that read as white in a
   viewer and hid where the map ended. Scenes now composite onto the
   page colour before they are written, and a test asserts no scene
   leaves a transparent pixel (`src/postcards/scenes.ts`).

---

## Not looked at

- **Motion.** Every sheet is a still. Frame strips show what the frames
  *are*, not what the cadence feels like — F5 and F6 are judgements
  about displacement, not about timing.
- **A real browser.** No frame rate, no zoom levels, no device pixel
  ratio other than 1. The postcard renderer is the shipping bake and
  the shipping painter, but it is not a GPU.
- **Anything heard, and anything spoken by a screen reader.** See
  `KNOWN_ISSUES.md`.

---

## Two-density pipeline, 2026-08-03 (task 0121)

Looked at: `art-props.png`, plus a side-by-side of the mooring post as
it was and as it is, rendered at 12 art pixels per sheet pixel so the
individual decisions are visible.

**What changed.** A grid may now declare that it was drawn at the detail
resolution (`density: 2`), in which case the bake skips the doubling
pass and paints what the artist actually drew. One asset went through
it end to end: `mooring-post`, redrawn at 40×46 from 20×23, same
footprint, same ground contact, same size on screen.

**What that bought, looking at the two side by side.** The 1x post was
a flat steel tube: three columns of shading, a rope drawn as one brown
band with two colours in it, rust in three whole-pixel triangles. The
redraw turns the cylinder through nine shades — four of them palette v3
half-steps that did not exist before — so it reads as round rather than
as a rectangle with a lighter left edge. The rope is six rows of
strands with a groove per four columns, slanting a column per row, and
at real size it reads as a coil. The rust bleeds from the shaded side
down to the waterline with a ragged edge, instead of appearing in three
places at once. The outline is one detail pixel thick rather than two,
which is the single biggest difference at real size: the post no longer
looks drawn in marker.

**What I checked and would flag.**

- At the sheet's real scale, beside `crate`, `hydrant`, `barrier` and
  `salvage-tarp`, it does not stand out as brighter or busier than its
  1x neighbours — which was the risk. The first two attempts did: a
  chrome ramp with a wide specular read as polished marble on a night
  street. The specular is now one column wide and the shaded side runs
  off the chrome ramp into the neutral slates.
- The concrete pad's lit top row is entirely eaten by the bevel (every
  `)` pixel borders the metal flange above it and steps up to `S`).
  That is the detail pass working as designed, but it means an authored
  half-step can be invisible in the bake; worth knowing before somebody
  spends an afternoon picking one.
- **Everything else is unchanged, and that is pinned.**
  `src/iso/art/legacyBake.test.ts` hashes every registered grid through
  the real detail pass and the real palette. Palette v3 landed with all
  sixteen digests untouched; only `props` moved, in the commit that
  redrew the post.

Still open: F1–F11 above are untouched by this task. F9 (small things
are smaller than they look) is the one this pipeline most directly
answers — a re-authored asset can put detail where the 1x grid had no
room for it — but nothing beyond the mooring post has been redrawn yet.

---

## Conventions for the tasks that follow

Every art task from here renders what it changed and opens it before
claiming it is done:

```
npm run postcards -- --filter art-tiles     # just the sheets you touched
npm run postcards                           # everything, ~12s
```

Then add a dated section to this file for what you looked at, and move
the finding you closed out of the list above.
