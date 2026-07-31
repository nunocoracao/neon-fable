import { describe, expect, it } from "vitest";
import {
  composeVisual,
  interactableVisual,
  seededAppearance,
  validateAppearance,
} from "../character";
import { bodiesOverlap, footprintFits } from "../combat/footprint";
import type { GridPosition, GridSize } from "../combat/types";
import { getEnemy } from "./enemies";
import { ENHANCEMENT_SLOTS } from "../inventory/items";
import {
  MAX_AMBIENT_PER_MAP,
  createCrowd,
  inZone,
  roamTiles,
  stepCrowd,
} from "../iso/ambient";
import { PROP_ART } from "../iso/art/props";
import { TILE_ART } from "../iso/art/tiles";
import {
  minimapCells,
  minimapLayout,
  minimapPipKind,
  minimapPips,
} from "../iso/minimap";
import { REFLECTION_RANGE, collectGlowPlacements } from "../iso/glowPass";
import {
  TRAIN_CAR_SPAN,
  dronePathLength,
  droneStateAt,
} from "../iso/setpiece";
import { findPath, findPathToAdjacent } from "../iso/path";
import { resolveDayPhase } from "../iso/dayPhase";
import {
  DAY_PHASES,
  DEFAULT_DAY_PHASE,
  ENTRY_SPAWN_ID,
  entryFacing,
  inBounds,
  isWalkable,
  mapExits,
  neighbors,
  propTiles,
  requireSpawn,
  tileAt,
  tileMaterial,
  type Interactable,
  type IsoMap,
  type PropId,
  type TileId,
} from "../iso/tilemap";
import type { TilePoint } from "../iso/coords";
import {
  puddleTiles,
  resolveWeather,
  tileHoldsWater,
  type WeatherView,
} from "../iso/weather";
import { encounters, getEncounter } from "./encounters";
import { getItem } from "./items";
import { SPIRE_SECURITY_VISUAL } from "./cast";
import { HUB_MAP_ID, getMap, maps, requireMap } from "./maps";
import { findArcByNode } from "./story";

/**
 * Arenas are the maps some encounter fights on; everything else is an
 * explorable map. Derived rather than hand-listed so a new map cannot
 * slip past the lint by not being added to a literal.
 */
const ARENA_MAP_IDS = new Set(encounters.map((e) => e.arenaMapId));
const arenaMaps = maps.filter((map) => ARENA_MAP_IDS.has(map.id));
const explorableMaps = maps.filter((map) => !ARENA_MAP_IDS.has(map.id));

describe("map registry", () => {
  it("exposes the hub, settlement, and arena maps", () => {
    expect(maps.map((m) => m.id)).toEqual([
      "cinder-plaza",
      "greywater-steps",
      "exchange-ventworks",
      "auric-spire",
      "auric-executive",
      "vertical-market",
      "flooded-quays",
      "rustyard-arena",
      "undercroft-arena",
      "vault-arena",
      "pumpworks-arena",
      "relay-crown-arena",
      "cycler-floor-arena",
      "spire-crown-arena",
      "exec-floor-arena",
      "market-scaffold-arena",
      "quays-walkway-arena",
    ]);
    expect(getMap(HUB_MAP_ID)?.name).toBe("Cinder Row Plaza");
    expect(getMap("nowhere")).toBeUndefined();
    expect(() => requireMap("nowhere")).toThrow(/Unknown map/);
  });
});

describe.each(maps.map((m) => [m.id, m] as const))("map %s", (_id, map) => {
  it("has a consistent tile grid", () => {
    expect(map.tiles).toHaveLength(map.height);
    for (const row of map.tiles) {
      expect(row).toHaveLength(map.width);
    }
  });

  it("places every spawn on a walkable tile", () => {
    expect(map.spawns.length).toBeGreaterThan(0);
    for (const spawn of map.spawns) {
      expect(isWalkable(map, spawn.x, spawn.y)).toBe(true);
    }
  });

  it("keeps props and interactables in bounds", () => {
    for (const prop of map.props) {
      expect(inBounds(map, prop.x, prop.y)).toBe(true);
    }
    for (const interactable of map.interactables) {
      expect(inBounds(map, interactable.x, interactable.y)).toBe(true);
    }
  });

  // Map lint: an interactable occupies (and blocks) its own tile, so
  // isWalkable is false there by construction — assert the ground under
  // it instead: a walkable tile kind, clear of blocking props, and
  // approachable from every spawn point.
  it("places every interactable on walkable, unobstructed ground", () => {
    for (const interactable of map.interactables) {
      expect(
        tileAt(map, interactable.x, interactable.y)?.walkable,
        `interactable ${interactable.id} sits on an unwalkable tile`,
      ).toBe(true);
      expect(
        map.props.some(
          (p) => p.blocks && p.x === interactable.x && p.y === interactable.y,
        ),
        `interactable ${interactable.id} shares a tile with a blocking prop`,
      ).toBe(false);
    }
  });

  it("keeps every interactable reachable from every spawn point", () => {
    for (const spawn of map.spawns) {
      for (const interactable of map.interactables) {
        const path = findPathToAdjacent(
          map,
          { x: spawn.x, y: spawn.y },
          interactable,
        );
        expect(
          path,
          `interactable ${interactable.id} unreachable from spawn ${spawn.id}`,
        ).not.toBeNull();
      }
    }
  });

  // The core reachability lint: dressing a map is the easiest way to
  // wall a pocket of floor off by accident (a prop line closing a gap,
  // a quay lip boxing a tile in). Every walkable tile must be standable
  // from the player spawn — orphaned ground is always a dressing bug.
  it("leaves no walkable ground orphaned from the player spawn", () => {
    const start = requireSpawn(map, "player-start");
    const orphans: string[] = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (isWalkable(map, x, y) && findPath(map, start, { x, y }) === null) {
          orphans.push(`(${x}, ${y})`);
        }
      }
    }
    expect(orphans, "walkable tiles unreachable from player-start").toEqual([]);
  });
});

/**
 * Dead-content lint. Art ids only earn their place by appearing in real
 * map data; an id registered in the type but placed on no map is art
 * nobody will ever see, and it should be retired rather than carried.
 */
describe("every registered art id is live in map data", () => {
  const placedTiles = new Set(maps.flatMap((map) => map.tiles.flat()));
  const placedProps = new Set(maps.flatMap((map) => map.props.map((p) => p.propId)));

  it("places every prop kind somewhere", () => {
    const unused = (Object.keys(PROP_ART) as PropId[]).filter(
      (id) => !placedProps.has(id),
    );
    expect(unused, "props with art but no placement").toEqual([]);
  });

  it("places every tile material somewhere", () => {
    // Checked per material, not per tile id: the interior floors and
    // their four baseboard trims are one generated family, and a map
    // that uses a floor only through its doorway trim still makes that
    // material live. A material no map reaches at all is dead art.
    const live = new Set([...placedTiles].map(tileMaterial));
    const unused = (Object.keys(TILE_ART) as TileId[])
      .map(tileMaterial)
      .filter((material) => !live.has(material));
    expect([...new Set(unused)], "tile materials with art but no map").toEqual([]);
  });
});

describe("map lint covers every registered map", () => {
  it("partitions the registry into explorable maps and arenas", () => {
    expect([...arenaMaps, ...explorableMaps].map((m) => m.id).sort()).toEqual(
      maps.map((m) => m.id).sort(),
    );
    expect(explorableMaps.map((m) => m.id)).toEqual([
      "cinder-plaza",
      "greywater-steps",
      "exchange-ventworks",
      "auric-spire",
      "auric-executive",
      "vertical-market",
      "flooded-quays",
    ]);
    expect(arenaMaps.length).toBe(maps.length - explorableMaps.length);
  });
});

describe.each(explorableMaps.map((m) => [m.id, m] as const))(
  "explorable map %s",
  (_mapId, map) => {
    const start = requireSpawn(map, "player-start");

    it("can reach every interactable from the player spawn", () => {
      for (const interactable of map.interactables) {
        const path = findPathToAdjacent(map, { x: start.x, y: start.y }, interactable);
        expect(path, `interactable ${interactable.id} unreachable`).not.toBeNull();
      }
    });

    it("references only real story nodes and encounters", () => {
      for (const { interaction } of map.interactables) {
        if (interaction.kind === "dialogue") {
          expect(
            findArcByNode(interaction.nodeId),
            `story node ${interaction.nodeId} missing`,
          ).toBeDefined();
        } else {
          expect(
            getEncounter(interaction.encounterId),
            `encounter ${interaction.encounterId} missing`,
          ).toBeDefined();
        }
      }
    });
  },
);

describe.each(encounters.map((e) => [e.id, e] as const))(
  "arena for %s",
  (_id, encounter) => {
    const arena = requireMap(encounter.arenaMapId);

    it("matches the encounter's combat grid size", () => {
      expect(encounter.grid).toEqual({
        width: arena.width,
        height: arena.height,
      });
    });

    it("is fully open floor — the engine has no obstacle rules", () => {
      for (let y = 0; y < arena.height; y++) {
        for (let x = 0; x < arena.width; x++) {
          expect(isWalkable(arena, x, y), `tile (${x}, ${y})`).toBe(true);
        }
      }
    });

    it("keeps spawn points on the grid", () => {
      const positions = [
        encounter.playerStart,
        ...encounter.enemies.map((spawn) => spawn.position),
      ];
      for (const position of positions) {
        expect(inBounds(arena, position.x, position.y)).toBe(true);
      }
      expect(requireSpawn(arena, "player-start")).toMatchObject(
        encounter.playerStart,
      );
    });

    /**
     * A spawn is a *block*, not a point (see src/combat/footprint.ts).
     * Anything bigger than a tile has to fit the arena whole and has to
     * start clear of everyone else — an encounter that spawns two
     * bodies on one tile is unwinnable content, and the position is the
     * only place it can be caught.
     */
    it("gives every spawn a block that fits, with nobody inside anyone", () => {
      interface FootprintBody {
        label: string;
        position: GridPosition;
        footprint?: GridSize | undefined;
      }
      const grid = { width: arena.width, height: arena.height };
      const bodies: FootprintBody[] = [
        { label: "player-start", position: encounter.playerStart },
        ...encounter.enemies.map((spawn, i) => ({
          label: `${spawn.enemyId} #${i + 1}`,
          position: spawn.position,
          footprint: getEnemy(spawn.enemyId)?.footprint,
        })),
      ];
      for (const body of bodies) {
        expect(
          footprintFits(grid, body.position, body.footprint),
          `${body.label} fits the arena`,
        ).toBe(true);
      }
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          expect(
            bodiesOverlap(bodies[i]!, bodies[j]!),
            `${bodies[i]!.label} overlaps ${bodies[j]!.label}`,
          ).toBe(false);
        }
      }
    });
  },
);

/**
 * Combat readability lint. A fight paints movement and range overlays
 * over the arena grid, so arena dressing has to stay quiet: nothing
 * standing on the floor to occlude a tile, and a ground surface that
 * resolves into a few broad material zones a player can read through
 * the overlay rather than a speckle of one-off tiles.
 */
describe.each(arenaMaps.map((m) => [m.id, m] as const))(
  "arena %s stays legible",
  (_id, arena) => {
    const tiles = arena.tiles.flat();
    const materials = tiles.map(tileMaterial);

    it("stands nothing on the floor", () => {
      expect(arena.props).toEqual([]);
      expect(arena.interactables).toEqual([]);
    });

    it("draws from a small material palette", () => {
      // Interior trims and quay lips fold into their own surface, so
      // this counts surfaces a player distinguishes, not tile ids.
      const distinct = new Set(materials);
      expect(distinct.size, `materials: ${[...distinct].join(", ")}`)
        .toBeLessThanOrEqual(4);
    });

    // Palette size alone does not make a grid readable — a two-material
    // checkerboard is the worst case and would pass it. What matters is
    // that materials clump: measure the share of orthogonally adjacent
    // tile pairs sharing a material. Broad zones score high, scattered
    // one-off tiles score near zero.
    it("clusters its materials into zones instead of speckle", () => {
      const materialAt = (x: number, y: number): string | undefined => {
        const id = arena.tiles[y]?.[x];
        return id === undefined ? undefined : tileMaterial(id);
      };
      let pairs = 0;
      let matching = 0;
      for (let y = 0; y < arena.height; y++) {
        for (let x = 0; x < arena.width; x++) {
          for (const [nx, ny] of [
            [x + 1, y],
            [x, y + 1],
          ] as const) {
            const here = materialAt(x, y);
            const there = materialAt(nx, ny);
            if (here === undefined || there === undefined) continue;
            pairs++;
            if (here === there) matching++;
          }
        }
      }
      expect(pairs).toBeGreaterThan(0);
      expect(
        matching / pairs,
        "share of neighbouring tiles sharing a material",
      ).toBeGreaterThanOrEqual(0.55);
    });
  },
);

/**
 * The Vertical Market's own dressing. The generic lint above proves the
 * district is walkable and wired; what is pinned here is that it reads
 * as somewhere new — its stall furniture is its alone, its lamps hang
 * over the aisles rather than blocking them, and it is the biggest and
 * busiest floor in the game.
 */
describe("the Vertical Market", () => {
  const market = requireMap("vertical-market");
  const MARKET_PROPS: readonly PropId[] = [
    "stall-awning",
    "cage-lamp",
    "crate-stack",
    "noodle-counter",
  ];

  it("builds its aisles out of stall furniture no other district has", () => {
    const here = market.props.map((prop) => prop.propId);
    for (const id of MARKET_PROPS) {
      expect(here.filter((prop) => prop === id).length, id).toBeGreaterThan(0);
    }
    const elsewhere = maps
      .filter((map) => map.id !== market.id)
      .flatMap((map) => map.props.map((prop) => prop.propId));
    for (const id of MARKET_PROPS) {
      expect(elsewhere, `${id} leaked off the market`).not.toContain(id);
    }
  });

  it("hangs its lamps over the walkways instead of standing them in one", () => {
    const lamps = market.props.filter((prop) => prop.propId === "cage-lamp");
    expect(lamps.length).toBeGreaterThanOrEqual(4);
    for (const lamp of lamps) {
      expect(lamp.blocks, `lamp at ${lamp.x},${lamp.y}`).toBe(false);
      expect(isWalkable(market, lamp.x, lamp.y)).toBe(true);
    }
  });

  it("is the largest floor in the game — a district, not a room", () => {
    for (const map of maps) {
      if (map.id === market.id) continue;
      expect(
        market.width * market.height,
        `${map.id} is bigger than the market`,
      ).toBeGreaterThan(map.width * map.height);
    }
  });

  it("puts scaffold decking under the market and nothing wet on it", () => {
    // Rust plate is the district's signature surface: the gallery and
    // the landing are laid over it, and the light well is roofed, so
    // the map never asks for rain.
    const decking = market.tiles.flat().filter((id) => id === "rust-floor");
    expect(decking.length).toBeGreaterThan(20);
    expect(market.weather).toBe("clear");
  });
});

/**
 * The Flooded Quays' own dressing. The generic lint above proves the
 * district is walkable and wired; what is pinned here is the thing it
 * was built to be — a map with almost no ground on it, where every
 * route is a walkway span over open water, and where the one set piece
 * is a wreck too big for the tile it stands on.
 */
describe("the Flooded Quays", () => {
  const quays = requireMap("flooded-quays");
  const QUAY_PROPS: readonly PropId[] = [
    "mooring-post",
    "salvage-tarp",
    "sunken-barge",
  ];
  const walkable: TilePoint[] = [];
  for (let y = 0; y < quays.height; y++) {
    for (let x = 0; x < quays.width; x++) {
      if (isWalkable(quays, x, y)) walkable.push({ x, y });
    }
  }

  it("furnishes the dockland with gear no other district has", () => {
    const here = quays.props.map((prop) => prop.propId);
    for (const id of QUAY_PROPS) {
      expect(here.filter((prop) => prop === id).length, id).toBeGreaterThan(0);
    }
    const elsewhere = maps
      .filter((map) => map.id !== quays.id)
      .flatMap((map) => map.props.map((prop) => prop.propId));
    for (const id of QUAY_PROPS) {
      expect(elsewhere, `${id} leaked off the quays`).not.toContain(id);
    }
  });

  it("is the water district — more canal than the rest of the game has", () => {
    const openWater = (map: IsoMap): number =>
      map.tiles.flat().filter((id) => tileMaterial(id) === "water").length;
    const here = openWater(quays);
    // A third of the district is basin, and there is more of it here
    // than on every other map in the game put together.
    expect(here).toBeGreaterThan(quays.width * quays.height * 0.33);
    const elsewhere = maps
      .filter((map) => map.id !== quays.id)
      .reduce((total, map) => total + openWater(map), 0);
    expect(here, "the quays are not the wettest map in the game").toBeGreaterThan(
      elsewhere,
    );
    // And more of it than there is ground to stand on.
    expect(here).toBeGreaterThan(walkable.length);
  });

  it("crosses the basin on walkway spans, not on a bridge you can miss", () => {
    // Every route between the two banks runs over plate decking laid on
    // the water, and each span is a single tile wide: the pathfinder
    // funnels onto them because there is nothing either side to walk on.
    const decking = walkable.filter(
      (tile) => quays.tiles[tile.y]?.[tile.x] === "rust-floor",
    );
    expect(decking.length).toBeGreaterThan(10);
    for (const tile of decking) {
      const neighbouring = neighbors(tile).filter((n) =>
        isWalkable(quays, n.x, n.y),
      );
      expect(
        neighbouring.length,
        `walkway at (${tile.x}, ${tile.y}) is a plaza, not a span`,
      ).toBeLessThanOrEqual(3);
    }
    // And crossing really is the only way over: block the spans and the
    // wharf falls off the map.
    const damned: IsoMap = {
      ...quays,
      tiles: quays.tiles.map((row) =>
        row.map((id) => (id === "rust-floor" ? "canal" : id)),
      ),
    };
    const start = requireSpawn(quays, ENTRY_SPAWN_ID);
    const board = quays.interactables.find((i) => i.id === "quays-tide-board");
    if (!board) throw new Error("no tide board");
    expect(findPathToAdjacent(quays, start, board)).not.toBeNull();
    expect(findPathToAdjacent(damned, start, board)).toBeNull();
  });

  it("lies a wreck across six tiles and blocks every one of them", () => {
    const barge = quays.props.find((prop) => prop.propId === "sunken-barge");
    if (!barge) throw new Error("no barge");
    const covered = propTiles(barge);
    expect(covered).toHaveLength(6);
    expect(barge.blocks).toBe(true);
    for (const tile of covered) {
      expect(inBounds(quays, tile.x, tile.y), `${tile.x},${tile.y}`).toBe(true);
      expect(isWalkable(quays, tile.x, tile.y), `${tile.x},${tile.y}`).toBe(false);
      // The hull's own tile is the nearest one it covers, so painter's
      // order sorts the whole set piece by it (see PropPlacement).
      expect(tile.x + tile.y).toBeLessThanOrEqual(barge.x + barge.y);
    }
    // Half of her is in the water and half aground on the quay lip.
    const materials = covered.map((tile) =>
      tileMaterial(quays.tiles[tile.y]?.[tile.x] ?? "pavement"),
    );
    expect(materials.filter((m) => m === "water").length).toBe(3);
    expect(materials.filter((m) => m === "pavement").length).toBe(3);
  });

  it("actually pools its light on the basin, rain and all", () => {
    // The mood, through the real pipeline rather than by inspection:
    // resolve the map's weather, collect a frame of glow at its own
    // hour, and check the emissive pass put reflections down on open
    // canal — and more of them than the hub's little storm canal gets.
    const weather = resolveWeather(quays, { enabled: true });
    expect(weather?.id).toBe("rain");
    const onWater = (map: IsoMap, view: WeatherView | null): number =>
      collectGlowPlacements(map, 0, view, resolveDayPhase(map)).filter(
        (glow) => tileMaterial(map.tiles[glow.y]?.[glow.x] ?? "pavement") === "water",
      ).length;
    expect(onWater(quays, weather)).toBeGreaterThan(20);
    const hub = requireMap(HUB_MAP_ID);
    expect(onWater(quays, weather)).toBeGreaterThan(
      onWater(hub, resolveWeather(hub, { enabled: true })),
    );
    // Puddles standing on the boards, too: the second wet surface the
    // same pass reflects off.
    expect(puddleTiles(quays).size).toBeGreaterThan(4);
  });

  it("stands its lamps where the water can take their reflection", () => {
    // The point of the district: every emissive thing on it is within
    // reflection range of open canal, so the glow pass has somewhere to
    // pool. See collectGlowPlacements / REFLECTION_RANGE.
    // Tenement walls glow too, but they are the frame, not the lighting.
    const emissive = quays.props.filter(
      (prop) => prop.propId !== "building" && PROP_ART[prop.propId].glow,
    );
    expect(emissive.length).toBeGreaterThan(2);
    for (const prop of emissive) {
      const reflects = [];
      for (let dy = -REFLECTION_RANGE; dy <= REFLECTION_RANGE; dy++) {
        for (let dx = -REFLECTION_RANGE; dx <= REFLECTION_RANGE; dx++) {
          const id = quays.tiles[prop.y + dy]?.[prop.x + dx];
          if (id !== undefined && TILE_ART[id].reflective) reflects.push(id);
        }
      }
      expect(
        reflects.length,
        `${prop.propId} at (${prop.x}, ${prop.y}) lights nothing wet`,
      ).toBeGreaterThan(0);
    }
  });
});

/**
 * The Auric Spire's two interior floors. The generic lint above proves
 * both are walkable and wired; what is pinned here is what makes them
 * interiors rather than another street — their own furniture, their own
 * hour and sky whatever the story stages outside, no tenement wall
 * sprites standing in a room, and a riser joining them both ways.
 */
describe("the corp tower interiors", () => {
  const lobby = requireMap("auric-spire");
  const executive = requireMap("auric-executive");
  const floors = [lobby, executive];
  const CORP_PROPS: readonly PropId[] = [
    "glass-partition-x",
    "glass-partition-y",
    "reception-desk",
    "server-column",
    "planter-column",
    "exec-desk",
  ];

  it("furnishes both floors from a vocabulary the street never sees", () => {
    const here = floors.flatMap((map) => map.props.map((prop) => prop.propId));
    for (const id of CORP_PROPS) {
      expect(here.filter((prop) => prop === id).length, id).toBeGreaterThan(0);
    }
    const elsewhere = maps
      .filter((map) => !floors.includes(map))
      .flatMap((map) => map.props.map((prop) => prop.propId));
    for (const id of CORP_PROPS) {
      expect(elsewhere, `${id} leaked out of the tower`).not.toContain(id);
    }
  });

  it("lays each floor in its own polished stone", () => {
    const materials = (map: IsoMap): Set<string> =>
      new Set(map.tiles.flat().map(tileMaterial));
    expect(materials(lobby).has("atrium-floor")).toBe(true);
    expect(materials(executive).has("exec-floor")).toBe(true);
    // Neither floor borrows the other's, and no street surface is laid
    // indoors: the only outdoor id either uses is the glow channel.
    expect(materials(lobby).has("exec-floor")).toBe(false);
    expect(materials(executive).has("atrium-floor")).toBe(false);
    for (const map of floors) {
      for (const material of materials(map)) {
        expect(
          ["atrium-floor", "exec-floor", "plaza-glow", "foundation"],
          `${map.id} lays ${material} indoors`,
        ).toContain(material);
      }
    }
  });

  it("stands no tenement wall inside a room", () => {
    // Interiors are drawn the way interiors are drawn: the far faces
    // are curtain wall, the near two edges are left open so nothing
    // hides behind a 92-pixel building sprite.
    for (const map of floors) {
      const kinds = map.props.map((prop) => prop.propId);
      expect(kinds, `${map.id} stands a building indoors`).not.toContain(
        "building",
      );
      const glazing = map.props.filter((p) =>
        p.propId.startsWith("glass-partition"),
      );
      expect(glazing.length, `${map.id} glazing`).toBeGreaterThan(4);
      for (const pane of glazing) {
        expect(pane.blocks, `${map.id} glazing at ${pane.x},${pane.y}`).toBe(
          true,
        );
      }
    }
  });

  it("declares its own hour and its own sky, indoors", () => {
    for (const map of floors) {
      expect(map.dayPhase, `${map.id} hour`).toBe("late");
      expect(map.weather, `${map.id} sky`).toBe("clear");
    }
  });

  it("joins the two floors by one riser, both ways", () => {
    const riser = (map: IsoMap, id: string): Interactable => {
      const found = map.interactables.find((i) => i.id === id);
      if (!found) throw new Error(`${map.id} has no ${id}`);
      return found;
    };
    const up = riser(lobby, "exec-lift");
    const down = riser(executive, "exec-lift-down");
    expect(up.exit?.mapId).toBe(executive.id);
    expect(down.exit?.mapId).toBe(lobby.id);
    // Both are doors, so both play the door-then-fade transition.
    expect(up.spriteId).toBe("door");
    expect(down.spriteId).toBe("door");
  });

  it("posts the tower's own security on both floors, in the house look", () => {
    const guards = floors.flatMap((map) =>
      map.interactables.filter((i) => i.visual === SPIRE_SECURITY_VISUAL),
    );
    expect(guards.map((g) => g.id)).toEqual(["spire-security", "exec-security"]);
    // The house look wears the hostile optic every enemy archetype
    // wears: these are people a player can end up fighting.
    expect(["crimson", "magenta"]).toContain(
      SPIRE_SECURITY_VISUAL.appearance.eyeColor,
    );
  });

  it("keeps a fight staged on the floor the story can start one on", () => {
    const fight = encounters.find((e) => e.id === "enc-exec-security");
    expect(fight?.arenaMapId).toBe("exec-floor-arena");
    const arena = requireMap("exec-floor-arena");
    expect(arena.tiles.flat().map(tileMaterial)).toContain("exec-floor");
  });
});

/**
 * Exit lint. An exit is the one piece of map data that points at
 * another map, so it is the one that can rot silently: a destination
 * that was renamed, an entry spawn that was moved. Both would show up
 * to the player as a label naming nowhere and an arrival on the wrong
 * side of the map, so both are checked here.
 */
describe("map exits", () => {
  const exits = maps.flatMap((map) =>
    mapExits(map).map((exit) => ({ map, exit })),
  );

  it("marks the ways out of the districts, and nothing on an arena", () => {
    expect(exits.map(({ map, exit }) => `${map.id}/${exit.id}`)).toEqual([
      // The hub's two ways out on foot, and both districts' ways back.
      "cinder-plaza/canal-lock",
      "cinder-plaza/market-gate",
      "greywater-steps/chainwell-stair",
      "exchange-ventworks/tram-gate",
      // The tower's two interior floors, joined by the executive riser.
      "auric-spire/exec-lift",
      "auric-spire/spire-tram",
      "auric-executive/exec-lift-down",
      "vertical-market/market-stair",
      "flooded-quays/quays-lock",
    ]);
    for (const arena of arenaMaps) {
      expect(mapExits(arena), `${arena.id} declares an exit`).toEqual([]);
    }
  });

  it("leads somewhere real, arriving on a spawn that exists there", () => {
    for (const { map, exit } of exits) {
      const target = exit.exit;
      if (!target) throw new Error(`${exit.id} lost its exit`);
      const destination = getMap(target.mapId);
      expect(destination, `${map.id}/${exit.id} → ${target.mapId}`).toBeDefined();
      if (!destination) continue;
      // The label the player reads is the destination's own name.
      expect(destination.name.length).toBeGreaterThan(0);
      const entryId = target.entryId ?? ENTRY_SPAWN_ID;
      expect(
        () => requireSpawn(destination, entryId),
        `${map.id}/${exit.id} arrives on missing spawn "${entryId}"`,
      ).not.toThrow();
    }
  });

  it("never leads back onto the map it is standing on", () => {
    for (const { map, exit } of exits) {
      expect(exit.exit?.mapId, `${map.id}/${exit.id}`).not.toBe(map.id);
    }
  });

  it("arrives facing into the destination, not back out of the way in", () => {
    for (const { exit } of exits) {
      const destination = requireMap(exit.exit?.mapId ?? "");
      const entry = requireSpawn(destination, exit.exit?.entryId ?? ENTRY_SPAWN_ID);
      // Every arrival point in the game is on the map's south edge, so
      // an arrival that looked "s" would be staring at a wall.
      expect(entryFacing(destination, entry), `${destination.id}/${entry.id}`).toBe(
        "n",
      );
    }
  });

  it("stands its exits where a player can walk up to them", () => {
    // An exit nobody can reach is a way out that does not exist; the
    // marker and its label would be a lie.
    for (const { map, exit } of exits) {
      const start = requireSpawn(map, ENTRY_SPAWN_ID);
      expect(
        findPathToAdjacent(map, { x: start.x, y: start.y }, exit),
        `${map.id}/${exit.id} unreachable`,
      ).not.toBeNull();
    }
  });
});

describe("minimap markers", () => {
  it("marks every way out of every district", () => {
    for (const map of explorableMaps) {
      for (const exit of mapExits(map)) {
        expect(minimapPipKind(exit), `${map.id}/${exit.id}`).toBe("exit");
      }
    }
  });

  it("marks every person you can talk to", () => {
    for (const map of explorableMaps) {
      const people = map.interactables.filter((i) => i.spriteId === "npc");
      expect(people.length, `${map.id} has nobody`).toBeGreaterThan(0);
      for (const npc of people) {
        expect(minimapPipKind(npc), `${map.id}/${npc.id}`).toBe("npc");
      }
    }
  });

  it("marks every object the story sends you to, by kind or by flag", () => {
    // Objects earn a pip either by being a key kind (terminal, stash) or
    // by declaring one; nothing on an explorable map is left unmarked,
    // because every interactable in the game is somewhere to go.
    for (const map of explorableMaps) {
      for (const thing of map.interactables) {
        expect(minimapPipKind(thing), `${map.id}/${thing.id}`).not.toBeNull();
      }
    }
  });

  it("keeps every marker on the map it is drawn over", () => {
    for (const map of explorableMaps) {
      const layout = minimapLayout(map);
      const start = requireSpawn(map, ENTRY_SPAWN_ID);
      for (const pip of minimapPips(map, layout, {
        tile: { x: start.x, y: start.y },
        facing: "n",
      })) {
        expect(pip.x, `${map.id}/${pip.id ?? "player"}`).toBeLessThanOrEqual(
          layout.width,
        );
        expect(pip.y, `${map.id}/${pip.id ?? "player"}`).toBeLessThanOrEqual(
          layout.height,
        );
      }
    }
  });

  it("leaves arenas with nothing but the fighter's own pip", () => {
    for (const map of arenaMaps) {
      const layout = minimapLayout(map);
      const pips = minimapPips(map, layout, {
        tile: { x: 0, y: 0 },
        facing: "s",
      });
      expect(pips.map((p) => p.kind), map.id).toEqual(["player"]);
    }
  });

  it("shows walkable ground on every map — no all-void overview", () => {
    for (const map of maps) {
      const cells = minimapCells(map).flat();
      expect(
        cells.filter((c) => c === "walkable").length,
        `${map.id} reads as solid void`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("NPC visuals", () => {
  const npcs = maps.flatMap((map) =>
    map.interactables
      .filter((i) => i.spriteId === "npc")
      .map((npc) => ({ map, npc })),
  );

  it("every named story NPC carries a deliberate authored visual", () => {
    const authored = npcs
      .filter(({ npc }) => npc.visual !== undefined)
      .map(({ npc }) => npc.id)
      .sort();
    expect(authored).toEqual([
      "auditor-booth",
      "chrome-chapel",
      "crown-watcher",
      "exec-security",
      "flick",
      "flick-steps",
      "market-fixer",
      "market-vendor",
      "matron-ferrow",
      "quays-diver",
      "rust-runner",
      "spire-security",
      "stall-broker",
      "tram-messenger",
    ]);
  });

  it("authored visuals validate and their gear resolves to drawable items", () => {
    for (const { npc } of npcs) {
      if (!npc.visual) continue;
      expect(validateAppearance(npc.visual.appearance), npc.id).toEqual([]);
      const { weapon, outfit, enhancements } = npc.visual;
      if (weapon !== undefined) {
        const item = getItem(weapon);
        expect(
          item?.kind === "weapon" && item.weaponLayer,
          `${npc.id} weapon ${weapon}`,
        ).toBeTruthy();
      }
      if (outfit !== undefined) {
        const item = getItem(outfit);
        expect(
          item?.kind === "outfit" && item.outfitLayer,
          `${npc.id} outfit ${outfit}`,
        ).toBeTruthy();
      }
      for (const slot of ENHANCEMENT_SLOTS) {
        const id = enhancements?.[slot];
        if (id === undefined) continue;
        const item = getItem(id);
        expect(
          item?.kind === "enhancement" && item.slot === slot && item.cyberLayer,
          `${npc.id} ${slot} ${id}`,
        ).toBeTruthy();
      }
    }
  });

  it("every NPC — authored or seeded — composes through the layer pipeline", () => {
    for (const { map, npc } of npcs) {
      expect(
        () => composeVisual(interactableVisual(map.id, npc)),
        `${map.id}/${npc.id}`,
      ).not.toThrow();
    }
  });

  it("Flick is the same person on both maps", () => {
    const looks = npcs
      .filter(({ npc }) => npc.id === "flick" || npc.id === "flick-steps")
      .map(({ npc }) => npc.visual);
    expect(looks).toHaveLength(2);
    expect(looks[0]).toBe(looks[1]);
  });

  it("seeded ambient NPCs get stable, distinct looks per position", () => {
    const seeded = npcs.filter(({ npc }) => npc.visual === undefined);
    expect(seeded.map(({ npc }) => npc.id).sort()).toEqual([
      "muster-crowd",
      "vent-crew",
    ]);
    const appearances = seeded.map(({ map, npc }) => {
      const visual = interactableVisual(map.id, npc);
      expect(validateAppearance(visual.appearance), npc.id).toEqual([]);
      expect(visual).toEqual(interactableVisual(map.id, npc));
      return JSON.stringify(visual.appearance);
    });
    expect(new Set(appearances).size).toBe(seeded.length);
  });
});

/**
 * Ambient crowd lint. Pedestrians are authored purely as data (a count
 * plus zone rectangles), so the things that can go wrong are all data
 * mistakes: a zone drawn over a wall, a zone with too few standable
 * tiles to seat its share of the crowd, a pocket a wanderer could get
 * stranded in, or a crowd loosed onto an arena. Each is caught here
 * rather than discovered as a frozen figure in a corner.
 */
describe("ambient crowds", () => {
  it("keeps arenas empty — a fight is the only thing on that map", () => {
    for (const arena of arenaMaps) {
      expect(arena.ambient, `${arena.id} declares an ambient crowd`).toBeUndefined();
    }
  });

  it("dresses the market as the densest street, the hub next, the rest quietly", () => {
    const counts = explorableMaps.map((map) => [map.id, map.ambient?.count ?? 0]);
    expect(counts).toEqual([
      ["cinder-plaza", 9],
      ["greywater-steps", 4],
      ["exchange-ventworks", 3],
      ["auric-spire", 5],
      // Ninety floors up at three in the morning: two analysts nobody
      // sent home, and nobody else.
      ["auric-executive", 2],
      // The bazaar is the busiest map in the game, by design.
      ["vertical-market", MAX_AMBIENT_PER_MAP],
      // The quays are the emptiest: nobody lives out on the water.
      ["flooded-quays", 5],
    ]);
    const densest = [...explorableMaps].sort(
      (a, b) => (b.ambient?.count ?? 0) - (a.ambient?.count ?? 0),
    )[0];
    expect(densest?.id).toBe("vertical-market");
    for (const map of explorableMaps) {
      expect(map.ambient?.count ?? 0).toBeLessThanOrEqual(MAX_AMBIENT_PER_MAP);
    }
  });
});

describe("ambient set pieces", () => {
  it("keeps arenas free of machinery — a fight is the only thing there", () => {
    for (const arena of arenaMaps) {
      expect(arena.setPieces, `${arena.id} declares set pieces`).toBeUndefined();
    }
  });

  it("gives each district the machinery its own story earns", () => {
    const declared = explorableMaps.map((map) => [
      map.id,
      {
        trains: map.setPieces?.trains?.length ?? 0,
        drones: map.setPieces?.drones?.length ?? 0,
        vents: map.setPieces?.vents !== undefined,
      },
    ]);
    expect(declared).toEqual([
      // The hub is the only place with a line overhead — the overline
      // is what the plaza is built under.
      ["cinder-plaza", { trains: 1, drones: 0, vents: true }],
      ["greywater-steps", { trains: 0, drones: 0, vents: true }],
      ["exchange-ventworks", { trains: 0, drones: 0, vents: true }],
      // Sealed interiors: nothing flies through a corp tower.
      ["auric-spire", { trains: 0, drones: 0, vents: false }],
      ["auric-executive", { trains: 0, drones: 0, vents: false }],
      // Watched from the air, which is the point of both districts.
      ["vertical-market", { trains: 0, drones: 2, vents: false }],
      ["flooded-quays", { trains: 0, drones: 1, vents: false }],
    ]);
  });

  it("only declares a vent cadence where there are stacks to vent", () => {
    for (const map of maps) {
      if (!map.setPieces?.vents) continue;
      const stacks = map.props.filter((p) => p.propId === "vent-stack");
      expect(stacks.length, `${map.id} vent cadence with no stacks`)
        .toBeGreaterThan(0);
    }
  });

  it("flies every drone over ground the map actually has", () => {
    for (const map of explorableMaps) {
      for (const path of map.setPieces?.drones ?? []) {
        expect(path.waypoints.length, `${map.id}/${path.id} waypoints`)
          .toBeGreaterThanOrEqual(3);
        expect(dronePathLength(path), `${map.id}/${path.id} circuit`)
          .toBeGreaterThan(0);
        for (const point of path.waypoints) {
          expect(inBounds(map, point.x, point.y), `${map.id}/${path.id} waypoint`)
            .toBe(true);
        }
        // A patrol that never crosses the map is not a patrol: the loop
        // has to span a real fraction of the district it watches.
        const xs = path.waypoints.map((p) => p.x);
        const ys = path.waypoints.map((p) => p.y);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(map.width / 3);
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(map.height / 3);
      }
    }
  });

  it("runs the overline behind the district, on a schedule you can miss", () => {
    const track = requireMap(HUB_MAP_ID).setPieces?.trains?.[0];
    expect(track).toBeDefined();
    if (!track) return;
    // The line sits off the north edge of the grid, which is the whole
    // trick: painter's order sorts everything on row 0 in front of it,
    // so the rake passes behind the tenements with no depth special
    // case anywhere in the renderer.
    expect(track.row).toBeLessThan(0);
    // It enters and leaves clear of the map, so no crossing ever starts
    // or stops with a carriage parked in shot.
    const tail = track.cars * TRAIN_CAR_SPAN;
    expect(track.fromX + tail).toBeLessThanOrEqual(0);
    expect(track.toX - tail).toBeGreaterThanOrEqual(requireMap(HUB_MAP_ID).width);
    // Out for well under a fifth of its period: the plaza is quiet far
    // more often than it is not.
    expect(track.crossMs).toBeLessThan(track.periodMs / 3);
  });

  it("changes nothing a player can walk on, fight over, or route through", () => {
    // The same guarantee weather and the hour carry: set pieces are a
    // look. Stripping every one of them off a map leaves walkability
    // and routing byte-identical.
    for (const map of explorableMaps) {
      if (!map.setPieces) continue;
      const bare: IsoMap = { ...map, setPieces: undefined };
      const spawn = requireSpawn(map, ENTRY_SPAWN_ID);
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          expect(isWalkable(bare, x, y), `${map.id} (${x},${y})`).toBe(
            isWalkable(map, x, y),
          );
        }
      }
      for (const target of map.interactables) {
        expect(findPathToAdjacent(bare, spawn, target)?.length).toBe(
          findPathToAdjacent(map, spawn, target)?.length,
        );
      }
    }
  });

  it("flies the quays' sweeper out over water nothing on foot can cross", () => {
    // A drone has no business with the ground: no collision, no
    // pathfinding, no walkability. The proof is that its declared beat
    // takes it over the basin, which no route in the game can.
    const quays = requireMap("flooded-quays");
    const path = quays.setPieces?.drones?.[0];
    expect(path).toBeDefined();
    if (!path) return;
    let overWater = 0;
    for (let t = 0; t < 60_000; t += 100) {
      const state = droneStateAt(path, t);
      if (!state) continue;
      const x = Math.round(state.position.x);
      const y = Math.round(state.position.y);
      if (tileMaterial(quays.tiles[y]?.[x] ?? "pavement") === "water") overWater++;
    }
    expect(overWater).toBeGreaterThan(0);
  });
});

describe("weather", () => {
  it("rains on the two waterside districts and nowhere else", () => {
    const declared = explorableMaps.map((map) => [map.id, map.weather ?? "clear"]);
    expect(declared).toEqual([
      ["cinder-plaza", "clear"],
      // Greywater Steps is the game's quayside district: cistern water,
      // quay lips, standing puddles. It is where rain is shown off.
      ["greywater-steps", "rain"],
      ["exchange-ventworks", "clear"],
      // Both of the tower's floors are sealed behind curtain wall: an
      // interior declares its own sky, and its sky is no sky.
      ["auric-spire", "clear"],
      ["auric-executive", "clear"],
      // The market is roofed by the levels stacked above it.
      ["vertical-market", "clear"],
      // The quays are open canal under an open shaft: the map where
      // rain and standing water are shown off together.
      ["flooded-quays", "rain"],
    ]);
  });

  it("leaves arenas without a sky of their own — they inherit one", () => {
    for (const arena of arenaMaps) {
      expect(arena.weather, `${arena.id} declares weather`).toBeUndefined();
    }
  });

  it("gives the rainy map ground that can actually hold water", () => {
    const rainy = explorableMaps.filter((map) => map.weather === "rain");
    expect(rainy.length).toBeGreaterThan(0);
    for (const map of rainy) {
      const puddles = puddleTiles(map);
      expect(puddles.size, `${map.id} puddles`).toBeGreaterThan(4);
      // Puddles never land on ground the sky cannot reach.
      for (const key of puddles) {
        const [x, y] = key.split(",").map(Number) as [number, number];
        const id = map.tiles[y]?.[x];
        expect(id && tileHoldsWater(id), `${map.id} puddle at ${key}`).toBe(true);
      }
    }
  });

  it("changes nothing a player can walk on, fight over, or route through", () => {
    // Weather is a look. Declaring it (or clearing it) must leave every
    // gameplay query over the map byte-for-byte identical.
    for (const map of maps) {
      for (const weather of ["clear", "rain", undefined] as const) {
        const restyled: IsoMap = { ...map, weather };
        for (let y = 0; y < map.height; y++) {
          for (let x = 0; x < map.width; x++) {
            expect(isWalkable(restyled, x, y), `${map.id} ${x},${y}`).toBe(
              isWalkable(map, x, y),
            );
          }
        }
        const spawn = map.spawns[0];
        if (!spawn) continue;
        for (const target of map.interactables) {
          expect(
            findPathToAdjacent(restyled, spawn, target)?.length ?? null,
            `${map.id} route to ${target.id}`,
          ).toBe(findPathToAdjacent(map, spawn, target)?.length ?? null);
        }
      }
    }
  });
});

describe("day phase", () => {
  it("walks the districts from dusk into the small hours", () => {
    const declared = explorableMaps.map((map) => [
      map.id,
      map.dayPhase ?? DEFAULT_DAY_PHASE,
    ]);
    expect(declared).toEqual([
      // The hub is met at the end of the working day...
      ["cinder-plaza", "dusk"],
      // ...the middle districts play at the hour the art is authored
      // at, which is the look the whole game is tuned around...
      ["greywater-steps", "night"],
      ["exchange-ventworks", "night"],
      // ...and the climb happens against a deadline at dawn.
      ["auric-spire", "late"],
      // ...and the tower's interiors keep that hour of their own accord,
      // whatever the story stages on the street outside.
      ["auric-executive", "late"],
      // The bazaar only trades after dark.
      ["vertical-market", "night"],
      // ...and the quays are only ever visited in the small hours.
      ["flooded-quays", "late"],
    ]);
  });

  it("leaves arenas without a clock of their own — they inherit one", () => {
    for (const arena of arenaMaps) {
      expect(arena.dayPhase, `${arena.id} declares an hour`).toBeUndefined();
    }
  });

  it("resolves every map to a real hour", () => {
    for (const map of maps) {
      expect(DAY_PHASES, map.id).toContain(resolveDayPhase(map));
    }
  });

  it("changes nothing a player can walk on, fight over, or route through", () => {
    // The hour is a look. Staging a map at any of them (or none) must
    // leave every gameplay query over it byte-for-byte identical.
    for (const map of maps) {
      for (const dayPhase of [...DAY_PHASES, undefined]) {
        const staged: IsoMap = { ...map, dayPhase };
        for (let y = 0; y < map.height; y++) {
          for (let x = 0; x < map.width; x++) {
            expect(isWalkable(staged, x, y), `${map.id} ${x},${y}`).toBe(
              isWalkable(map, x, y),
            );
          }
        }
        const spawn = map.spawns[0];
        if (!spawn) continue;
        for (const target of map.interactables) {
          expect(
            findPathToAdjacent(staged, spawn, target)?.length ?? null,
            `${map.id} route to ${target.id}`,
          ).toBe(findPathToAdjacent(map, spawn, target)?.length ?? null);
        }
      }
    }
  });
});

describe.each(explorableMaps.map((m) => [m.id, m] as const))(
  "ambient crowd on %s",
  (_mapId, map) => {
    const zones = map.ambient?.zones ?? [];

    it("declares zones that fall inside the map", () => {
      expect(zones.length).toBeGreaterThan(0);
      expect(new Set(zones.map((z) => z.id)).size).toBe(zones.length);
      for (const zone of zones) {
        expect(zone.width, `${zone.id} width`).toBeGreaterThan(0);
        expect(zone.height, `${zone.id} height`).toBeGreaterThan(0);
        expect(inBounds(map, zone.x, zone.y), `${zone.id} origin`).toBe(true);
        expect(
          inBounds(map, zone.x + zone.width - 1, zone.y + zone.height - 1),
          `${zone.id} far corner`,
        ).toBe(true);
      }
    });

    it("gives every zone room to wander", () => {
      // A zone has to hold its share of the crowd with tiles to spare,
      // or its pedestrians spend the game shuffling in place.
      const count = map.ambient?.count ?? 0;
      zones.forEach((zone, index) => {
        const share = Math.ceil((count - index) / zones.length);
        expect(
          roamTiles(map, zone).length,
          `zone ${zone.id} has too little standable ground`,
        ).toBeGreaterThanOrEqual(share + 3);
      });
    });

    it("leaves no pocket a wanderer could be stranded in", () => {
      // Pedestrians route *within* their zone, so every roamable tile
      // must be reachable from every other without leaving the
      // rectangle. A zone drawn across a pinch point (a lamp post and a
      // hydrant closing a gap) splits into islands, and a pedestrian
      // seated on the wrong side spends the game shuffling in place.
      for (const zone of zones) {
        const tiles = roamTiles(map, zone);
        const [first] = tiles;
        if (!first) continue;
        const stranded = tiles.filter(
          (tile) =>
            findPath(map, first, tile, (x, y) => inZone(zone, x, y)) === null,
        );
        expect(
          stranded.map((t) => `(${t.x}, ${t.y})`),
          `zone ${zone.id} splits into unreachable islands`,
        ).toEqual([]);
      }
    });

    it("seats the whole declared crowd on distinct, standable tiles", () => {
      const crowd = createCrowd(map);
      expect(crowd.pedestrians).toHaveLength(map.ambient?.count ?? 0);
      const seats = crowd.pedestrians.map((p) => `${p.tile.x},${p.tile.y}`);
      expect(new Set(seats).size).toBe(seats.length);
      for (const ped of crowd.pedestrians) {
        expect(
          isWalkable(map, ped.tile.x, ped.tile.y),
          `${ped.id} spawned on unwalkable ground`,
        ).toBe(true);
      }
    });

    it("never seats a pedestrian on a story NPC's approach tile", () => {
      const triggers = new Set(
        map.interactables.flatMap((i) =>
          [
            [i.x + 1, i.y],
            [i.x - 1, i.y],
            [i.x, i.y + 1],
            [i.x, i.y - 1],
          ].map(([x, y]) => `${x},${y}`),
        ),
      );
      for (const ped of createCrowd(map).pedestrians) {
        expect(
          triggers.has(`${ped.tile.x},${ped.tile.y}`),
          `${ped.id} blocks an interactable's approach tile`,
        ).toBe(false);
      }
    });

    it("gives every pedestrian a stable look the layer pipeline can draw", () => {
      const looks = createCrowd(map).pedestrians.map((ped) => {
        const appearance = seededAppearance(ped.lookSeed);
        expect(validateAppearance(appearance), ped.id).toEqual([]);
        expect(() => composeVisual({ appearance }), ped.id).not.toThrow();
        return JSON.stringify(appearance);
      });
      // Variety is the point of a crowd: no two clones on one map.
      expect(new Set(looks).size).toBe(looks.length);
    });

    it("wanders without ever standing somewhere it should not", () => {
      let crowd = createCrowd(map);
      const startTiles = crowd.pedestrians.map((p) => `${p.tile.x},${p.tile.y}`);
      const visited = new Set(startTiles);
      const rects = new Map(zones.map((zone) => [zone.id, zone]));
      for (let frame = 0; frame < 1800; frame++) {
        crowd = stepCrowd(crowd, map, 1 / 60);
        for (const ped of crowd.pedestrians) {
          expect(
            isWalkable(map, ped.tile.x, ped.tile.y),
            `${ped.id} walked onto unwalkable ground`,
          ).toBe(true);
          const zone = rects.get(ped.zoneId);
          if (!zone) throw new Error(`unknown zone ${ped.zoneId}`);
          expect(
            inZone(zone, ped.tile.x, ped.tile.y),
            `${ped.id} wandered out of zone ${ped.zoneId}`,
          ).toBe(true);
          visited.add(`${ped.tile.x},${ped.tile.y}`);
        }
      }
      // Half a minute of wandering has actually gone somewhere.
      expect(visited.size).toBeGreaterThan(startTiles.length);
    });
  },
);
