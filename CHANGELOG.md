# Changelog

Written for someone deciding whether to play, or coming back after a
while — what changed on screen, not what changed in the repository. The
commit history has the other version.

## Unreleased

### Everything is drawn with four times the pixels

The game is authored at one resolution and shown at another: every art
pixel has always been painted as a 2×2 block of screen pixels, four
dots agreeing with each other because nothing had told them not to.
Now they can disagree. On its way to the screen every sprite, tile and
prop is split four ways — diagonals step at half the size they were
drawn at, so a barrier's hazard stripes actually run diagonally and a
head has a jawline instead of a staircase, and every edge inside a
shape picks up a half-pixel of the light the whole palette was drawn
for. Nothing moved, nothing changed size, and no colour was invented:
lighting an edge means stepping along a ramp the artist already chose.
Neon is exempt — a tube is its own light source — and outlines keep
their weight.

### Walking got its missing beat

A stride was three poses: plant, take the weight, swing through. It is
four now, with the body riding up over the straightened leg before the
next foot lands — one rise and fall per step instead of a lurch, at
exactly the pace it walked before. The patrol drones and the warden
chassis got the same fourth beat.

## 1.0.0 — 2026-08-03

The first released version, and the whole game: the two development
arcs the repository calls v1 and v2 both ship inside it. The two
sections below are what each of them built, newest first.

### The release sweep

Everything below, plus the release sweep itself: the dependency audit
came back clean, the test suite stopped depending on how busy the
machine was, fifteen exports nothing reached were deleted, the city's
proper nouns were held to one spelling by a checker rather than by
memory, and the *built* bundle is now played end to end before it
ships — a fresh run and a save written before half these systems
existed. What did not get fixed is written down and argued with in
[KNOWN_ISSUES.md](KNOWN_ISSUES.md).

Old saves still load. That has been true at every version and stays
true here: a save from 1.0's first day will open in whatever comes
next.

---

### v2 — the whole city, rebuilt

The second arc doubled the resolution the game is drawn at and then spent a
hundred tasks filling the space that opened up. By phase, roughly in
the order it landed.

#### The art, at twice the size

Ground tiles went from 32×16 to 64×32 and characters from 16×24 to
32×48, and every sprite in the game was re-drawn at the new size rather
than scaled up to it — streets, water, interior floors, street
furniture, animated signage, doors, terminals, containers. The palette
grew from a handful of flats to fifty-odd curated entries with proper
material ramps, four skin-tone ramps and six hair colours. The renderer
got device-pixel-ratio awareness, integer snapping and integer zoom
levels, so a pixel is a pixel at every zoom. A neon glow pass lights
the streets and reflects off wet ground. Nothing is a binary asset:
every one of those pixels is still a character in a string in
`src/iso/art/`.

#### You, specifically

Characters are no longer one drawing. A sprite is composed from layers
— body, outfit, face, eyes, brows, mouth, hair, headwear, held weapon,
cyberware — that share a frame and an anchor, which means the coat you
equipped is the coat you are wearing on the map, the pistol you bought
is in your hand, and the chrome arm you installed is visible in the
arm. Portraits are generated from the same data, so the face in a
conversation is your face.

#### Making a runner

Character creation became a five-step wizard: identity, background,
point-buy stats, **appearance**, review. The appearance step is
visual — category tabs of live-baked thumbnails, colour swatch rows for
skin, hair and eyes, and a preview you can turn through four facings,
walk, and zoom. Every background carries a preset look, and there is a
seeded randomiser for people who would rather be surprised. Mid-game,
the Chrome Chapel will re-cut all of it.

#### A city to walk

Every district was re-dressed at the new resolution and two new ones
opened: **the Vertical Market**, six levels of traders and catwalks,
and **the Flooded Quays**, open water and salvage. A corp tower
interior set carries the late acts. Streets carry seeded ambient
crowds; rain falls with puddles and reflections; the neon shifts
through dusk, night and late night. Doors animate you between spaces
instead of cutting, interactables outline and label themselves under
the cursor, a minimap sits under the HUD, and trains, drones and vented
steam run on their own clocks in the background.

#### Fights you can read

Every weapon class has its own attack animation; hits knock back,
deaths play out, projectiles and muzzle flashes travel and land.
Abilities and cyberware have their own effects. Damage and status come
up as floating numbers. The combat HUD was rebuilt around an initiative
rail of portraits and a proper action bar, and the ground tells you
what an action would reach: range, path and area telegraphs, with the
outcome previewed before you commit — and enemy wind-ups shown before
they land. The camera shakes, pauses on impact, and moves to whoever is
up. Enemies got archetype appearance sets and a combat drone, and the
**Warden Chassis** is a boss that occupies four tiles at once.

#### People, and a city that notices

**Vesper Kade** joins the crew first; a second companion follows, with
a loyalty axis that remembers how you have treated them. Two side-quest
chains run through the new districts. Three factions — the Auric
Combine, the Cistern Court, the Vertical Market — keep standing on you,
which opens and closes dialogue, changes prices, and feeds an ending
axis of its own. The street barks at you as you pass, and what it says
depends on what you have done. Between acts, an interlude recaps what
your choices cost. Lore shards hide in the districts for a codex tab.
Epilogues expanded to take account of side content, companions and
faction standing.

#### Depth, in the systems

Weapons take **mods** in sockets, fitted at a workbench. Outfits take
**dyes**. Cyberware runs a **Static** meter with real trade-offs at the
top. Vendors got price curves, haggling and restocks. Advancement runs
on street-cred milestones and perks. **Breach** is a signal-tracing
minigame at terminals; **stealth** encounters give a quiet way past a
fight, with vision cones and patrols. Injuries persist between fights
and heal at a clinic. Consumables split into stims, street food and
field kits. And there are three difficulty presets plus a set of assist
options that never lock anything.

#### Sound, comfort, and confidence

Adaptive music with district themes and combat layers; a synthesized
effect for every system that gained one; a mixer with buses, sliders
and a mute that remembers. Save slots show a portrait and where you
were. Graphics and comfort settings sit in one panel. Onboarding
teaches by playing rather than by reading. A performance pass put the
hi-res city inside a frame budget, and a resilience pass made saves
survive a bad write and errors explain themselves instead of white-
screening. Photo mode holds the city still so you can frame a shot.

Underneath all of that, the guardrails: one string table for every
player-facing word, a combat balance pass tuned against 15,000
simulated battles, an economy pass that follows every credit, a
narrative validator that audits the story graph, an art sweep that
renders every appearance combination, three scripted playthroughs that
play the whole game on every release, and an accessibility audit that
made the entire game keyboard-playable and screen-reader-narrated.

---

### v1 — the game, in outline (retrospective)

The first arc built the thing: a Vite/TypeScript single page with a screen
router; a serializable `GameState` with seeded RNG and versioned
localStorage saves; characters with five stats, three backgrounds and
point-buy; inventory, equipment and cyberware; a narrative engine of
gated story nodes and consequential choices; deterministic turn-based
combat; an isometric renderer with click-to-move; DOM screens for
creation, dialogue, inventory and save/load; and a three-act story —
the Undertow, the Cordon, the Succession — with seven endings, an
epilogue, an endings codex and New Game+. Pixel art replaced the
placeholder blocks, WebAudio replaced the silence, and a settings and
accessibility pass closed it out.

It was, at that point, a complete game. v2 is what happened when it got
looked at closely.
