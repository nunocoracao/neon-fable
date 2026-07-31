# Neon Fable

A browser-based, single-player cyberpunk RPG: character creation, a
branching narrative where choices change the story, isometric graphics,
turn-based combat, and an inventory system covering clothes, weapons,
and cybernetic enhancements. Everything runs client-side — no backend.

The story is a complete three-act arc set in the Meridian Sprawl:
**The Undertow** (Act 1 — a drowned district and a corporate flood),
**The Cordon** (Act 2 — an embargo that rations the Undercroft's air),
and **The Succession** (Act 3 — the founders' continuity engine wakes
to inherit the whole city). Choices accumulate across all three acts —
allies, betrayals, and warrants recorded in Act 1 decide who stands
with you in the finale — and the game ends on one of **four distinct
endings**, each with a flag-driven epilogue of what became of every
faction and ally in your playthrough.

## Getting started

```sh
npm install
npm run dev      # start the dev server
npm run build    # type-check (strict) and build for production
npm test         # run the Vitest suite
npm run preview  # preview the production build
```

Open the dev server URL in a browser and hit **New Game**. Appending
`?dev` to the URL enables developer-only routes (currently an Explore
entry that drops you on the hub map without a character).

## How to play

- **Character creation** — pick a name, a background, and spend the
  point-buy pool across five stats (Body, Reflexes, Tech, Cool,
  Intelligence). Backgrounds add stat bonuses, starting gear, and unlock
  background-specific dialogue options later.
- **Exploring** — click a tile to walk there; drag to pan the camera.
  Tiles with a soft amber marker are interactable (people, terminals):
  click one to walk over and trigger its dialogue or fight. Ways out of
  the map carry a lit ring and a label naming where they lead; taking
  one plays the door open and fades through the destination's name.
- **Dialogue** — click a choice, press its number key (1–9), or press
  Enter to take the focused choice. Greyed-out choices show the
  requirement you're missing in brackets, e.g. `[Tech 6]`. Choices have
  real consequences: flags, credits, items, fights, travel, endings.
- **Crew** — companions you recruit walk with you one at a time. `C`
  opens the Crew panel: swap who comes along between jobs, see where
  each of them stands with you, and hear out anyone who has earned a
  word in private. What you choose in front of them moves that
  standing, and the two of them do not want the same things.
- **Standing** — three powers keep a ledger on you: the Auric Combine,
  the Cistern Court, and the Vertical Market. Choices that settle
  something move where you stand with them, on a scale from Hostile to
  Trusted. `I` shows all three with a meter that leans the way the
  ledger does; a scene only tells you when a faction changes the word
  it uses for you.
- **HUD & overlays** — `I` opens the inventory, `M` collapses or expands
  the corner minimap, `Esc` opens the pause menu (or closes the open
  overlay). Saves live in the pause menu; the game also autosaves on
  every map transition and combat entry.
- **Minimap** — a top-down overview of the district under the HUD bar:
  two-tone walkable and blocked ground, tinted water, a pip with a
  facing tick for you, and pips for the ways out, the people, and the
  places the story sends you. It shows the whole map (no fog) and is
  read-only — clicking it does nothing.
- **Combat** — turn-based on an iso arena. Initiative comes from
  Reflexes. On your turn: Attack, Ability, Item, Move (click a
  highlighted tile or use the arrow keys), Flee, or End Turn. Damage is
  weapon + stat modifiers vs the target's armor. Defeat isn't the end —
  load the autosave and try a different approach.
- **Cyberware** — enhancements install into body slots (eyes, arms,
  neural…) and cost neural load against your capacity; uninstalling one
  destroys it and deals trauma. Installed enhancements can unlock
  dialogue and grant combat abilities.
- **Chapters & advancement** — each act starts from a hub NPC on the
  plaza (Flick for Act 1, a messenger for Act 2, the watcher under the
  dead screens for Act 3 — each appears once the previous act is done).
  Completing a chapter grants advancement points; press `P` (or use the
  chapter-end panel) to spend them on stat raises and new abilities.
- **The finale & endings** — Act 3 reads everything you did: your Act 1
  and Act 2 outcomes pick the opening, kept allies open doors and join
  the final battle, betrayed parties come back armed, and an active (or
  suspended) warrant changes how the Auric Spire's gates read you.
  Before the tower, one muster call reads the three standings against
  each other and the city answers it — whichever power counts you
  highest sends the crowd that is at the crown door an hour later, and
  a city that cannot agree about you sends nobody.
  There are seven endings. Four are gated on your cumulative history —
  including one fully non-combat resolution behind steep stat,
  enhancement, and ally requirements — and three more open only at
  **trusted** standing with one of the powers, whatever else the run
  did. After the ending, an epilogue screen tells you
  what became of each faction and ally; a finished save reopens to that
  epilogue.

## Layout

```
src/
  main.ts      # entry point, screen router bootstrap
  state/       # GameState, save/load, flags
  character/   # creation, stats, derived attributes
  narrative/   # story graph, dialogue, choice/flag engine
  combat/      # turn-based combat engine + combat UI glue
  inventory/   # items, equipment slots, cyber enhancements
  iso/         # isometric renderer, tilemap, sprites, input picking
  world/       # reactive world state: conditions, placement, news, stock
  ui/          # DOM screens and components
  data/        # typed content: items, enemies, story nodes, maps
```

Game logic is pure and data-driven (plain functions over `GameState`
plus content from `src/data/`); rendering and DOM code stay thin.

## Systems overview

- **GameState** (`src/state/`) — one serializable object holding the
  player, flags, location, inventory, credits, pending encounter, the
  party of recruited companions, faction standing, and a deterministic
  RNG state. Saves
  are JSON envelopes in `localStorage` slots
  (`slot1`–`slot3` + `autosave`) versioned by
  `GAME_STATE_VERSION`; bump it whenever `GameState` changes shape.
  Corrupt or version-mismatched saves surface friendly errors and never
  crash the page.
- **Narrative** (`src/narrative/`) — story content is a directed graph
  of nodes; `availableChoices` gates choices on stats, items, flags,
  enhancements, backgrounds, and credits; `applyChoice` applies effects
  immutably and reports what happened (next node, combat handoff,
  travel, ending).
- **Combat** (`src/combat/`) — deterministic given the RNG seed.
  `createCombat` snapshots the player's effective stats/armor/abilities;
  `takeAction` advances the fight; `src/combat/legal.ts` answers "what
  can I do right now" for the UI; `resolveCombat` folds the result back
  into `GameState` as a `combat:<encounterId>` flag.
- **Inventory** (`src/inventory/`) — pure equip/install/consume
  functions with typed `InventoryError`s the UI shows verbatim.
- **Iso scene** (`src/iso/`) — 2:1 diamond tiles, painter's-order depth
  sort, BFS pathfinding, and a combat arena scene with walk tweens, HP
  bars, and floating damage text. Presentation only: it never imports
  game rules. `minimap.ts` holds the minimap's projection math (cells,
  pips, viewport box) as pure functions; `src/ui/minimap.ts` only paints
  them, and only when the scene's view has changed.
- **Combat camera** (`src/iso/cameraFeel.ts`) — the arena runs on a
  *scene clock*: the frame timestamp with every hit-pause it has served
  taken back out. A freeze is therefore time that clock does not advance
  through, so every sequence riding it (swings, tracers, flinches,
  floating figures, walks) holds and resumes together instead of
  drifting apart. The three effects — an eased glide to whoever is
  acting, a few frozen frames on melee contact and on criticals, and a
  small capped kick off heavy blows and blasts — are pure functions of
  scene time, and each is switched off by reduced motion or by the
  Combat camera setting, with Screen shake carrying its own scale. How
  much a blow weighed is read off the figures the damage math already
  produced (`impactWeight` in `src/ui/combatFeel.ts`); nothing in the
  engine branches on any of it.
- **UI** (`src/ui/`) — a screen router (`showScreen`) plus overlay
  panels. A mount error shows a crash notice instead of a blank page.
  Missing content ids log `console.error` and degrade (drop the fight,
  fall back to the hub map).

## Authoring content

All game content lives in typed data files under `src/data/` — engine
code never hard-codes a content id. Every content type has `getX`
(returns `undefined`) and `requireX` (throws) lookups; UI code uses
`getX` and logs missing ids. The test suite validates content
cross-references, so `npm test` is the authoring safety net.

### Items (`src/data/items.ts`)

Add an `Item` to the `items` array. Kinds: `weapon`, `outfit`,
`consumable`, `enhancement` (with a body `slot` and `neuralCost`), and
`misc`. Gear carries typed `effects` (`stat-mod`, `grant-ability`,
`unlock-dialogue`). `items.test.ts` checks id uniqueness and slot
coverage.

### Enemies & encounters (`src/data/enemies.ts`, `encounters.ts`)

An `Encounter` names its enemy spawns (with grid positions), a
`playerStart`, `rewards`, and an `arenaMapId`. Arena maps must be fully
open floor and exactly the size of the combat grid, and their
`player-start` spawn must match the encounter's `playerStart` —
`maps.test.ts` enforces this. Encounters with equal grids can share one
arena map.

An archetype's `spriteKind` says which art system draws it: `humanoid`
(a look family composed through the appearance pipeline), `drone`, or
`mech` (an authored chassis in its own, larger frame). Anything bigger
than a tile also declares a `footprint` — the block it stands on,
anchored at the spawn's minimum-x, minimum-y tile. Occupancy,
movement, reach, and every telegraph read the block rather than the
anchor (`src/combat/footprint.ts`), and `maps.test.ts` checks that
every spawn's block fits its arena with nobody inside anyone.

### Abilities (`src/data/abilities.ts`)

An `Ability` carries a `range` (measured block to block), a `cooldown`,
an `effect`, an optional `area` shape, and an `effectRef` naming the
look it plays as. Two optional fields change *when* it happens rather
than what it does:

- `windUp` makes it a **charged** attack. It is declared instead of
  thrown: the shape is resolved against the board and marked as
  threatened ground at once, and it lands at the start of the caster's
  turn that many turns later, on whoever is standing in it by then. The
  lane never re-aims, so walking off the marked tiles beats it
  (`src/combat/charge.ts`).
- `attackVariant` picks which of the caster's attack animations throws
  it, for art that swings more than one way (a chassis's piston arm
  versus its shoulder battery). Everything with a single authored set
  ignores it.

### Maps (`src/data/maps.ts`)

Maps are authored as compact character rows plus a legend
(`buildMapGrid` expands them and throws on unknown characters or ragged
rows). A map lists `interactables` — tiles that trigger `dialogue`
(a node id) or `combat` (an encounter id) — and named spawn points.
Hub-style maps need a `player-start` spawn.

An interactable that leads off the map declares an `exit`
(`{ mapId, entryId? }`). That one field drives the whole affordance:
the shared lit ring is laid in its tile, a label names the destination
whenever the cursor is on it or the player is stood beside it, and when
the scene it opens ends in a `travel` effect, the way plays its opening
(a door's leaves parting, a stair's iris flaring) before the screen
fades through black to the destination. Arrivals land on the exit's
`entryId` — default `player-start` — facing into the map; a spawn can
author its own `facing` where the map's shape gets it wrong.
`maps.test.ts` lints exits: the destination and its entry spawn must
exist, and the arrival must look inward.

An explorable map can also declare an `ambient` crowd: a `count` of
pedestrians plus the `zones` (rectangles) they are dealt across
round-robin. Pedestrians are scenery — no interaction, no collision,
no combat — and wander inside their own zone via the pathfinder with
stable seeded looks. They never stop on an interactable's approach
tile. Leave `ambient` off for arenas and any map that should read as
empty. `maps.test.ts` lints the data: zones must sit in bounds, hold
more standable tiles than the pedestrians assigned to them, and be
internally connected (a zone drawn across a pinch point splits into
islands and strands whoever spawns on the wrong side). The per-map
ceiling is `MAX_AMBIENT_PER_MAP`.

A map can also declare `setPieces` — the large ambient machinery of a
district, all of it scenery: `trains` (an elevated line, declared as a
`row`, a `fromX`/`toX` span, a number of `cars`, a `heightPx` above the
row, and a `periodMs`/`crossMs` schedule), `drones` (a closed loop of
`waypoints` flown at a `speed`, hovering `heightPx` up), and `vents` (a
`periodMs`/`chance` cadence every vent-stack prop on the map runs on its
own seeded schedule, denser in the rain). Where each one is this frame
is a pure function of the clock in `src/iso/setpiece.ts`; the renderer
folds the result into the same depth-sorted object pass as props and the
crowd, so occlusion needs no special case — the hub's overline runs on
row `-1` and that alone is what makes it pass behind the north terrace.
A track row may sit off the grid for exactly that reason. Reduced motion
withholds the train and the steam (a set piece frozen mid-flight reads as
a bug) and leaves the drones parked. Nothing here touches walkability,
routing, or combat, and `maps.test.ts` pins that.

Interiors (the Auric Spire's two floors) are authored the same way with
three conventions of their own, linted in `maps.test.ts`. They never
stand the `building` prop — a room's far faces are glazing runs and its
near two edges are left as plain `foundation`, because a 92-pixel wall
sprite on the south or east edge paints over the two tile rows behind
it. Glazing comes in two orientations (`glass-partition-x` along the
map's x axis, `-y` along its y) and a run of panes on one axis butts
into itself as an unbroken wall; a run laid across the other axis
staggers. And an interior declares its own `weather` and `dayPhase`
rather than inheriting the default, so the light in a sealed floor
reads the same whatever the story has staged on the street outside.

### Story (`src/data/story/`)

A `StoryArc` is a list of nodes; each node has `speaker`, `text`, and
`choices`. Choices carry:

- `requirements` — stat / item / enhancement / background / flag /
  credits / companion / loyalty / reputation gates.
  `ifUnavailable: "disabled"` shows
  the choice greyed out with the requirement label; the default hides
  it. A `companion` requirement asks whether somebody is `"active"`
  (with you now, the default) or merely `"recruited"` (ever joined); a
  `loyalty` requirement asks where they stand (`"at-least"` by default,
  `"at-most"` for the beat somebody only raises when it has gone
  badly); `flag-unset` is the "not yet" gate a scene closes itself
  with once it has recorded its own outcome, and `flag-set` is its
  mirror — "you have been here", whatever the flag ended up saying,
  which is how a later beat reads a one-flag-several-values record
  without carrying one choice per value. `flag-not-equals` is the gate
  for what a flag *is not*, including nothing at all: a flag one beat
  writes `true` and a later one rewrites `false` (Act 2 suspending the
  Auric warrant) reads as three states, and "not wanted" is two of
  them, which `flag-unset` alone cannot say. A `reputation` requirement
  asks how a faction reads the player — give it a band id
  (`"warm"`), not a number, so a re-tune of what an act outcome is
  worth never silently moves a door. A `dominant-faction` requirement
  asks the other question: whose city this reads as, comparing the
  three standings rather than testing one (`dominantFaction`, floor
  `"warm"` by default, ties and an empty field both naming nobody).
  Author that beat as four choices — one per power plus
  `factionId: "none"` — and exactly one of them can ever pass.
- `effects` — `set-flag`, `increment-flag`, `add-item` / `remove-item`,
  `credits` (grants or spends, clamped at zero — gate purchases with a
  `credits` requirement), `start-combat` (launches the encounter, then
  resumes at the choice's `target` on victory), `travel` (moves to
  another map and continues there), `recruit-companion` (somebody joins
  the party — idempotent, so re-recruiting only un-benches),
  `companion-loyalty` (moves their standing; a no-op for somebody not
  in the party), `goto`, and `end` (optionally with an `endingId`).

A choice may also carry `reactions`: tags naming what *kind* of act it
is (`mercy`, `salvage`, `defiance`, `record`, `procedure`,
`deception`). Every companion standing with the player when it is taken
scores the tags against their own `values` and their loyalty moves by
the total — so a beat is tagged once and each companion reads it their
own way. Tag the act, never the person; reach for a
`companion-loyalty` effect only when a beat really is about one
specific somebody.

A choice may also carry `standing`: what taking it moves with the
city's three factions (`auric`, `court`, `market` — see
`src/data/factions.ts`). Standing runs −100..100 with five named bands
and is clamped on every write; the player is only ever told when a
shift crosses a band, and the character screen shows the band, never
the number.

Do not invent a swing at the point of use. Every recorded outcome that
is worth something is declared once in `FACTION_STANDINGS`
(`src/data/standings.ts`), keyed by the flag it writes, and the choice
that writes that flag must carry exactly what the table says — a test
in `standings.test.ts` fails on any disagreement. The reason is
migration: a save from before factions existed is read back through
`deriveReputation`, which sums the same table against the flags that
run already recorded, so a playthrough must be worth the same thing
played and re-loaded. Only ever table a **write-once** flag; one a
later beat overwrites would be worth two different things.

### Factions (`src/data/factions.ts`, `src/state/reputation.ts`)

Content is the names, the blurbs, and the band table; arithmetic is
pure state (`adjustReputation`, `bandFor`, `canAccess`,
`deriveReputation`), and the character screen's rows come off
`factionRows` in `src/ui/factionModel.ts`. A district chain that
declares its outcomes' worth as relative weights (1 = a nod, 2 = a
favour, as both side chains do) scales them into standing with
`scaleStanding(weights, SIDE_CHAIN_STEP)` — write that expression in
the choice rather than the multiplied literal, so the chain's own
table stays the one place its outcomes are valued.

Standing is meant to be spent. Band-gated content is authored like any
other gate (the Market's freight stair into the Exchange at `warm`,
the Combine's bonded lift at `warm` with a bought alternative for
everyone else, the boards buying out the Trust's writ at `trusted`),
and the three trusted dispositions at the founders' keys are the
ending axis it feeds. When you add one, prove it with a route:
`factionEndings.walkthrough.test.ts` earns each band the long way,
because a gate no reachable standing opens is content that does not
exist.

A node may also carry `comments`: companion asides, each tagged with a
`companionId` and its own optional `requirements`. The dialogue box
shows the first one whose companion is active and whose requirements
pass, under the speaker's line. They are presentation only — an aside
never gates a choice or touches state — so a scene reads exactly as it
always did when nobody is along.

Register new arcs in `src/data/story/index.ts` so `findArcByNode` can
route to them. `validateArc` (run over every arc in `validate.test.ts`)
checks that every choice target, item id, encounter id, travel map id,
companion id, reaction tag, faction id, reputation band, and flag
reference resolves — a broken reference fails the suite, not the
player.

Side quests are flags, not a subsystem. There is no quest log: a chain
carries one stage flag whose value *is* its state, and the beat that
opens it reads that flag and routes the player to whichever scene they
left off at, so walking away is always a pause. "The Last Mile"
(`src/data/story/lastMile.ts`) is the worked example — three scenes off
Marrow's stool in the Vertical Market, gated approaches on stats and
installed optics, a fight in the district's arena as one road through
the middle, and two mutually exclusive endings. Its nodes are spread
into the market arc rather than registered separately, because a choice
target only resolves inside one arc. Each ending declares its own flag,
payout, and intended faction swing in `LAST_MILE_OUTCOMES` — read both
by the choice that settles it and by `FACTION_STANDINGS`, so the
outcome and what it is worth are named in one place instead of two.

"Under the Waterline" (`src/data/story/underWaterline.ts`) is the same
shape one turn harder: it forks at its *first* choice into two roads
that share no node — help the Flooded Quays' diver, or sell the
conversation to the crew squeezing her — and carries three exclusive
settlements between them. Its seven ways into the drowned bonded store
are the reference for spreading gates across builds (Body, Reflexes,
Tech, an installed enhancement, Cool, the district's own gated
container via `flag-set`, and one road open to anybody), and its
`UNDER_WATERLINE_OUTCOMES` adds one field to the same contract:
`platform`, the lasting change the settlement makes to the district.

### Reactive world state (`src/data/world.ts`, `src/world/`)

How the city notices what a run has done. Content declares named
**world conditions** — `stalls-shuttered`, `cordon-broken`,
`warrant-out` — and each is nothing but a bundle of ordinary
`Requirement`s. `deriveWorldState(state)` runs them through the
engine's own `checkRequirements` once per scene mount and hands back
the set that passed; every reactive channel is then a pure function of
that set and of content, never of `GameState` again. Three channels
read it:

- **Who is on the street.** `SCENE_REACTIONS` may spawn an NPC,
  despawn one, and re-label or re-point what stays; `populateMap`
  applies them over `dressMap`'s output. Because placement is the one
  move map dressing refuses (see below), `world.test.ts` re-runs the
  whole map lint — walkable, unobstructed, reachable, ambient zones
  whole — against every *populated* district with all reactions live.
  A spawned NPC's scene lives in `src/data/story/streets.ts` and is
  declared in its arc's `entryNodeIds`, since the world opens it
  directly rather than any choice leading there.
- **What the screens say.** A map declares `screens` (geometry, a
  channel, a neon tint); `NEWS_HEADLINES` is the pool, gated by
  `requires`/`absent` condition ids, and `newsStrip` puts the
  survivors in a seeded per-screen order. The scroll itself is pure
  timing in `src/iso/ticker.ts` and one bake per line — the renderer
  copies a moving window out of the strip, never re-baking.
- **What a vendor sells.** `VENDOR_STOCK` entries carry condition
  gates, and `vendorChoices` builds the shop's dialogue choices out of
  *the same requirement arrays* plus the price — so the stock selector
  and the offer a player sees are one decision made once. An entry off
  the shelf is hidden; one you merely cannot afford stays greyed.

Author a condition rather than reading a flag twice: re-keying it onto
a different beat moves every reaction with it.

### Map dressing (`src/data/mapDressing.ts`)

How a settled quest changes a district for good. `dressMap(map, flags)`
is a pure join between an authored map and a run's state: a table of
flag-conditional rewrites, applied once at scene mount, that can
re-label an interactable, put a different face on it, and change which
story node it opens. It deliberately cannot move, add, or remove one —
position, sprite kind, and exits are what the map lint is written
against, so leaving them alone keeps reachability, walkability, and the
minimap true of every dressed variant for free (`mapDressing.test.ts`
pins exactly that) — the reactive world layer above is where placement
lives, and it pays for the guarantee with its own lint. Because it resolves at mount, a change earned in a
conversation is waiting the next time the player walks in rather than
swapping under their feet. Build the table from the content that owns
the flags — the quays' entry is derived from
`UNDER_WATERLINE_OUTCOMES.platform` — so a map can never drift from the
ending that changed it.

### Companions (`src/data/companions.ts`, `src/state/party.ts`)

A companion is authored like a player character: base stats, gear by
item id, and one or more *looks* (a `CharacterVisual` each), so they
compose through the same layered appearance pipeline as everybody else
— one set of data behind the map sprite, the arena body, and the
portrait. Recruiting seeds a `PartyMember` from that record onto
`GameState.party`; content is only ever the seed, so rebalancing a
companion never rewrites a save. `recruited` is permanent, `active`
is revocable, and both hp and loyalty persist between fights. A
companion also declares `values` — what they make of each reaction tag
— which is the whole of the loyalty system's content side.

One companion is out at a time. `setActiveCompanion` takes one out and
benches the rest (and recruiting routes through it, so joining and
switching are the same operation); the Crew panel on the HUD — `C` — is
where the player swaps between jobs. Loyalty moves through choice
`reactions`, and each companion declares one `personalScene`: a node
id, the loyalty that opens it, and the flag its fork writes.
`personalSceneReady` is what the panel offers the conversation from,
and the crew arc (`src/data/story/companions.ts`) gates the same scene
on the same three conditions in content — keep the two in step.

In exploration the active companion trails the player's own footsteps
a couple of tiles back (`src/iso/follow.ts` — breadcrumbs, no
path-finding, so they can never be routed into a wall) and are scenery
to input: nothing picks them and they neither block nor trigger an
interactable. In combat they join as an `"ally"` combatant the player
plays through the ordinary action bar; friend-or-foe is asked through
`areOpposed`, never by comparing kinds. Being dropped benches them for
that fight only — the fight is lost when the *player* goes down — and
`resolveCombat` writes their hp back at a floor of 1.

### Endings & epilogues (`src/data/endings.ts`, `epilogues.ts`)

An `end` effect whose `endingId` resolves in `endings` opens the
chapter-end screen with that ending's epilogue paragraphs (the game
autosaves first). End markers without an ending id just close the
conversation. Endings marked `final: true` are game endings: the UI
routes to the epilogue screen instead, and the autosaved state (its
`game-complete` flag) reopens to the epilogue from then on.

Epilogue vignettes live in `src/data/epilogues.ts`: each has a
`subject` slot and optional `requires` gates, and `selectVignettes`
(`src/narrative/epilogue.ts`) picks the first matching vignette per
subject in authored order — put specific variants above their
subject's fallback. Vignette-less subjects are omitted, which is how
characters the player never met stay out of the epilogue.

Every subject is also registered as a **thread** in `epilogueThreads`
(same file) with a section, a heading, and a spoiler-safe codex hint.
`composeEpilogue` selects, then orders by section — personal → chains
→ allies → companions → factions → city — so authored order inside a
subject is variant *priority*, while render order is the thread table.
Adding a thread is: one table row plus its variants. Composition, the
skip-when-untouched behaviour, and the codex's variant counting
(`deriveEpilogueCodex` in `src/state/meta.ts`, rendered under the
endings on the codex screen) all read those two tables, and
`epilogue.test.ts` sweeps a spread of outcome-flag fixtures to check
every combination composes an ordered, one-variant-per-thread epilogue.

Threads a run never touched need no fallback and simply do not appear,
which is also how content gates ahead of a system that has not landed:
the Static thread reads `STATIC_EPILOGUE_FLAGS`, nothing writes them
yet, and the thread is absent until the overload meter starts writing.

### Conventions

- Keep logic pure: plain functions over `GameState`; UI and canvas code
  stay thin and rule-free.
- Extend the Vitest suite next to whatever you touch (`*.test.ts`
  beside the source). Deterministic combat tests scan for RNG seeds
  instead of mocking rolls — see `src/combat/testSupport.ts` and
  `src/ui/combatTestSupport.ts`.
- Run `npm run build` and `npm test` before committing; use
  conventional-commit messages (`feat:`, `fix:`, `chore:`, …).
- Original setting and names only — no assets or lore from existing
  cyberpunk franchises.
