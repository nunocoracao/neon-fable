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
  There are four endings, gated on your cumulative history — including
  one fully non-combat resolution behind steep stat, enhancement, and
  ally requirements. After the ending, an epilogue screen tells you
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
  ui/          # DOM screens and components
  data/        # typed content: items, enemies, story nodes, maps
```

Game logic is pure and data-driven (plain functions over `GameState`
plus content from `src/data/`); rendering and DOM code stay thin.

## Systems overview

- **GameState** (`src/state/`) — one serializable object holding the
  player, flags, location, inventory, credits, pending encounter, and a
  deterministic RNG state. Saves are JSON envelopes in `localStorage`
  slots (`slot1`–`slot3` + `autosave`) versioned by
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
  credits gates. `ifUnavailable: "disabled"` shows the choice greyed
  out with the requirement label; the default hides it.
- `effects` — `set-flag`, `increment-flag`, `add-item` / `remove-item`,
  `credits` (grants or spends, clamped at zero — gate purchases with a
  `credits` requirement), `start-combat` (launches the encounter, then
  resumes at the choice's `target` on victory), `travel` (moves to
  another map and continues there), `goto`, and `end` (optionally with
  an `endingId`).

Register new arcs in `src/data/story/index.ts` so `findArcByNode` can
route to them. `validateArc` (run over every arc in `validate.test.ts`)
checks that every choice target, item id, encounter id, travel map id,
and flag reference resolves — a broken reference fails the suite, not
the player.

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
