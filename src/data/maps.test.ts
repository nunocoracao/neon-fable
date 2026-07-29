import { describe, expect, it } from "vitest";
import {
  composeVisual,
  interactableVisual,
  validateAppearance,
} from "../character";
import { ENHANCEMENT_SLOTS } from "../inventory/items";
import { PROP_ART } from "../iso/art/props";
import { TILE_ART } from "../iso/art/tiles";
import { findPath, findPathToAdjacent } from "../iso/path";
import {
  inBounds,
  isWalkable,
  requireSpawn,
  tileAt,
  tileMaterial,
  type PropId,
  type TileId,
} from "../iso/tilemap";
import { encounters, getEncounter } from "./encounters";
import { getItem } from "./items";
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
      "rustyard-arena",
      "undercroft-arena",
      "vault-arena",
      "pumpworks-arena",
      "relay-crown-arena",
      "cycler-floor-arena",
      "spire-crown-arena",
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
      "flick",
      "flick-steps",
      "market-vendor",
      "matron-ferrow",
      "rust-runner",
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
