# Neon Fable

The Meridian Sprawl is a city built on top of the one that drowned, and
it is still charging rent for the water. You arrive with a name nobody
has heard, five numbers that describe you badly, and whatever you could
carry. Over three chapters you will be asked, over and over, who gets
to keep breathing — a flooded district, an embargoed undercroft, a
founders' machine waking up to inherit the whole tower — and every
answer is written down. The Sprawl keeps a ledger. It remembers the
people you stood beside, the ones you sold, the chrome you let into
your skull and what it cost you to be heard over it, and at the end it
tells you what became of all of them. There is no correct ending. There
are seven, and one of them is yours.

Neon Fable is a browser RPG: a stepped character creator with a live
appearance preview, isometric districts to walk, conversations whose
choices are load-bearing, deterministic turn-based combat, and gear
that shows up on your body. It runs entirely client-side, in one page,
with no backend and no binary art assets — every pixel is authored in
code.

**[Play it in a browser →](https://nunocoracao.github.io/neon-fable/)**

---

## Screenshots

<!-- SCREENSHOTS: see docs/images/README.md for how these are captured. -->

| | |
| --- | --- |
| ![Cinder Row Plaza, the hub district](docs/images/hub.png) | ![The appearance step of character creation](docs/images/creation-appearance.png) |
| **Cinder Row Plaza.** The hub, lit for dusk: an overline train on the viaduct behind the terrace, news strips on the boards, and the minimap under the HUD. | **Making a runner.** The appearance step: category tabs, swatch rows, and a live preview you can turn, walk, and zoom — all of it the same sprite the map will draw. |
| ![A fight with the telegraph layer showing reach and impact](docs/images/combat-telegraph.png) | ![A conversation, with portraits for the speaker and the crew](docs/images/dialogue.png) |
| **A fight.** Turn-based on an iso arena. The ground says what an action would touch before you commit to it — your reach, your range, the impact, and any wind-up somebody has already aimed at you. | **A conversation.** Portraits are composed from the same appearance data as the sprites. Choices gate on stats, gear, chrome, flags, and standing; a locked one shows you what it wanted. |

## Quickstart

```sh
npm install
npm run dev      # dev server
npm run build    # strict type-check, then bundle
npm test         # the Vitest suite
npm run preview  # serve the production build
```

Open the dev server URL and press **New Game**. Adding `?dev` to the URL
turns on developer routes: an explore entry that drops you onto the hub
without a character, the art gallery, and the performance scene.

New here as a player? The [player guide](docs/PLAYER_GUIDE.md) is a
spoiler-light manual to every system, including the full key map.

## Tech

- **TypeScript, strict**, bundled by **Vite**. No game engine and no
  runtime dependencies — the whole shipped game is this repo's own code.
- **Canvas for the world, DOM for everything else.** The isometric
  scene is 2:1 diamond tiles with painter's-order depth sorting on one
  canvas; menus, dialogue, inventory and creation are plain DOM/CSS
  overlays, which is why they can be tested and made accessible.
- **The art is source code.** Every sprite, tile and prop is a
  palette-indexed grid of characters in `src/iso/art/` — a row of a
  character's coat is a string — validated by tests and baked to
  offscreen canvases at integer scale on load. Characters are composited
  from layers (body, outfit, face, hair, weapon, cyberware) sharing one
  frame and anchor, so equipping a coat changes what you look like and
  portraits derive from the same data as the map sprite. No image file
  ships with the game — the only ones in the repository are the
  screenshots above — and there is nothing to fetch at runtime.
- **Audio is synthesized in code** through WebAudio: no samples, same
  reason.
- **State is one serializable object.** `GameState` goes to
  `localStorage` as JSON, versioned and migrated forward; saves from
  before a system existed still load.
- **Determinism where it matters.** A fight is a pure function of its
  seed and the actions taken, so difficulty presets and assists scale
  figures the math already produced rather than touching a roll.
- **Vitest** covers the game logic — combat math, narrative flags,
  inventory rules, art-grid validation, economy sweeps, and the content
  cross-references. Canvas painting is not unit-tested; everything that
  decides an outcome is.

## Layout

```
src/
  main.ts      # entry point, screen router bootstrap
  state/       # GameState, save/load, flags, meta-progress
  character/   # creation, stats, appearance, advancement, injuries
  narrative/   # story graph, dialogue, choice/flag engine, epilogues
  combat/      # turn-based engine: initiative, damage, telegraphs, AI
  inventory/   # items, equipment, cyberware, weapon mods, dyes
  iso/         # isometric renderer, tilemaps, sprites, art grids
  minigames/   # self-contained puzzles: Breach (the node lattice)
  stealth/     # patrols, vision cones, and the quiet way past a fight
  world/       # reactive world state: conditions, placement, news, stock
  economy/     # prices, haggling, vendor ledgers
  settings/    # device preferences, difficulty, assists, comfort
  audio/       # synthesized music and SFX
  ui/          # DOM screens, overlays, and the HUD
  data/        # typed content: items, enemies, maps, story arcs, catalogs
docs/          # player guide, authoring guide, accessibility
```

Game logic is pure and data-driven — plain functions over `GameState`
plus content from `src/data/` — and rendering and DOM code stay thin.
Tests live beside their source as `*.test.ts`.

## Docs

- [Player guide](docs/PLAYER_GUIDE.md) — how to play, every system,
  the key map, and a spoiler-light FAQ.
- [Authoring guide](docs/AUTHORING.md) — how content is added: items,
  maps, story arcs, encounters, breach terminals, stealth zones,
  vendors, epilogues, and the rules each one is linted against.
- [Accessibility](docs/ACCESSIBILITY.md) — what the game promises and
  which test holds it to that.

## Credits & licence

Written by Nuno Coração, with a lot of it typed by Claude Code agents
working task by task through the history in `git log`.

Everything in here is original: the Sprawl, its factions, its people
and its lore are this repository's own, and no assets, names, or ideas
are taken from any existing cyberpunk franchise. There are no
third-party assets to credit because there are no assets at all — the
art is code in `src/iso/art/`, the music and effects are synthesized at
runtime, and the only fonts are the ones your system already has.

No licence is declared and the package is marked private, so all rights
are reserved. Read it, run it, learn from it; ask first if you want to
reuse a piece of it.
