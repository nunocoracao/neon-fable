import { describe, expect, it } from "vitest";
import { findPathToAdjacent } from "../iso/path";
import { inBounds, isWalkable, requireSpawn } from "../iso/tilemap";
import { encounters, getEncounter } from "./encounters";
import { HUB_MAP_ID, getMap, maps, requireMap } from "./maps";
import { introArc } from "./story";

describe("map registry", () => {
  it("exposes the hub and arena maps", () => {
    expect(maps.map((m) => m.id)).toEqual([
      "cinder-plaza",
      "rustyard-arena",
      "undercroft-arena",
      "vault-arena",
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
});

describe("cinder-plaza hub", () => {
  const hub = requireMap(HUB_MAP_ID);
  const start = requireSpawn(hub, "player-start");

  it("can reach every interactable from the player spawn", () => {
    for (const interactable of hub.interactables) {
      const path = findPathToAdjacent(hub, { x: start.x, y: start.y }, interactable);
      expect(path, `interactable ${interactable.id} unreachable`).not.toBeNull();
    }
  });

  it("references only real story nodes and encounters", () => {
    for (const { interaction } of hub.interactables) {
      if (interaction.kind === "dialogue") {
        expect(
          introArc.nodes.some((n) => n.id === interaction.nodeId),
          `story node ${interaction.nodeId} missing`,
        ).toBe(true);
      } else {
        expect(
          getEncounter(interaction.encounterId),
          `encounter ${interaction.encounterId} missing`,
        ).toBeDefined();
      }
    }
  });
});

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
