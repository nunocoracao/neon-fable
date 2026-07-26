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
