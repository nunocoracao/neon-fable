import { describe, expect, it } from "vitest";
import {
  composeVisual,
  interactableVisual,
  seededAppearance,
  validateAppearance,
} from "../character";
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
  requireSpawn,
  tileAt,
  tileMaterial,
  type IsoMap,
  type PropId,
  type TileId,
} from "../iso/tilemap";
import { puddleTiles, tileHoldsWater } from "../iso/weather";
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
      "greywater-steps/chainwell-stair",
      "exchange-ventworks/tram-gate",
      "auric-spire/spire-tram",
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

  it("dresses the hub as the busiest street and the rest more quietly", () => {
    const counts = explorableMaps.map((map) => [map.id, map.ambient?.count ?? 0]);
    expect(counts).toEqual([
      ["cinder-plaza", 9],
      ["greywater-steps", 4],
      ["exchange-ventworks", 3],
      ["auric-spire", 5],
    ]);
    for (const map of explorableMaps) {
      expect(map.ambient?.count ?? 0).toBeLessThanOrEqual(MAX_AMBIENT_PER_MAP);
    }
  });
});

describe("weather", () => {
  it("rains on the quayside and nowhere else, with the hub left clear", () => {
    const declared = explorableMaps.map((map) => [map.id, map.weather ?? "clear"]);
    expect(declared).toEqual([
      ["cinder-plaza", "clear"],
      // Greywater Steps is the game's quayside district: cistern water,
      // quay lips, standing puddles. It is where rain is shown off.
      ["greywater-steps", "rain"],
      ["exchange-ventworks", "clear"],
      ["auric-spire", "clear"],
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
