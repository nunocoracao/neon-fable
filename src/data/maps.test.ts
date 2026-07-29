import { describe, expect, it } from "vitest";
import {
  composeVisual,
  interactableVisual,
  validateAppearance,
} from "../character";
import { ENHANCEMENT_SLOTS } from "../inventory/items";
import { findPathToAdjacent } from "../iso/path";
import { inBounds, isWalkable, requireSpawn, tileAt } from "../iso/tilemap";
import { encounters, getEncounter } from "./encounters";
import { getItem } from "./items";
import { HUB_MAP_ID, getMap, maps, requireMap } from "./maps";
import { findArcByNode } from "./story";

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
});

describe.each([
  ["cinder-plaza"],
  ["greywater-steps"],
  ["exchange-ventworks"],
  ["auric-spire"],
])(
  "explorable map %s",
  (mapId) => {
    const map = requireMap(mapId);
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
