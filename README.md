# Neon Fable

A browser-based, single-player cyberpunk RPG: character creation, a
branching narrative where choices change the story, isometric graphics,
turn-based combat, and an inventory system covering clothes, weapons,
and cybernetic enhancements. Everything runs client-side — no backend.

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
  click one to walk over and trigger its dialogue or fight.
- **Dialogue** — click a choice, press its number key (1–9), or press
  Enter to take the focused choice. Greyed-out choices show the
  requirement you're missing in brackets, e.g. `[Tech 6]`. Choices have
  real consequences: flags, credits, items, fights, travel, endings.
- **HUD & overlays** — `I` opens the inventory, `Esc` opens the pause
  menu (or closes the open overlay). Saves live in the pause menu; the
  game also autosaves on every map transition and combat entry.
- **Combat** — turn-based on an iso arena. Initiative comes from
  Reflexes. On your turn: Attack, Ability, Item, Move (click a
  highlighted tile or use the arrow keys), Flee, or End Turn. Damage is
  weapon + stat modifiers vs the target's armor. Defeat isn't the end —
  load the autosave and try a different approach.
- **Cyberware** — enhancements install into body slots (eyes, arms,
  neural…) and cost neural load against your capacity; uninstalling one
  destroys it and deals trauma. Installed enhancements can unlock
  dialogue and grant combat abilities.

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
  game rules.
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

### Endings (`src/data/endings.ts`)

An `end` effect whose `endingId` resolves in `endings` opens the
chapter-end screen with that ending's epilogue paragraphs (the game
autosaves first). End markers without an ending id just close the
conversation.

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
