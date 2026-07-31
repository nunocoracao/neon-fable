import { describe, expect, it } from "vitest";
import { STAT_HARD_CAP, STAT_KEYS } from "../character/stats";
import { inZone } from "../iso/ambient";
import { findPath, findPathToAdjacent } from "../iso/path";
import {
  inBounds,
  isWalkable,
  requireSpawn,
  tileAt,
  type IsoMap,
} from "../iso/tilemap";
import { ENHANCEMENT_SLOTS } from "../inventory/items";
import { REPUTATION_BAND_IDS, isFactionId } from "./factions";
import { getItem } from "./items";
import { encounters } from "./encounters";
import { LORE_PAYOFF, LORE_SHARDS, getShard, requireShard, shardsOnMap } from "./lore";
import { maps, requireMap } from "./maps";
import { SCENE_REACTIONS } from "./world";
import { placeShards } from "../world/shards";
import { emptyLore } from "../state/lore";

/**
 * The city's own history, linted like every other content table.
 *
 * Two halves. The first is authoring: twelve entries, numbered, titled,
 * gated exactly three ways, each gate naming what would open it. The
 * second is placement — a shard is a thing that stands on a tile and
 * blocks it, so it is held to every rule map data itself is held to
 * (walkable ground, nothing underneath, reachable, no orphaned floor),
 * checked against the map with the whole set dropped on it at once.
 */

const ARENA_MAP_IDS = new Set(encounters.map((e) => e.arenaMapId));
const explorableMaps = maps.filter((map) => !ARENA_MAP_IDS.has(map.id));

/** Every explorable map with the full uncollected set standing on it. */
const shardedMaps: ReadonlyArray<readonly [string, IsoMap]> = explorableMaps.map(
  (map) => [map.id, placeShards(map, emptyLore())] as const,
);

describe("the lore shard set", () => {
  it("is twelve shards, numbered one to twelve in reading order", () => {
    expect(LORE_SHARDS).toHaveLength(12);
    expect(LORE_SHARDS.map((shard) => shard.index)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("gives every shard its own id and its own title", () => {
    const ids = LORE_SHARDS.map((shard) => shard.id);
    const titles = LORE_SHARDS.map((shard) => shard.title);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
    for (const shard of LORE_SHARDS) {
      expect(shard.id, "id reads as a shard").toMatch(/^shard-[a-z-]+$/);
      expect(shard.title.length, shard.id).toBeGreaterThan(3);
    }
  });

  it("writes one to three short paragraphs per entry, all of them prose", () => {
    for (const shard of LORE_SHARDS) {
      expect(shard.paragraphs.length, shard.id).toBeGreaterThanOrEqual(1);
      expect(shard.paragraphs.length, shard.id).toBeLessThanOrEqual(3);
      for (const [i, paragraph] of shard.paragraphs.entries()) {
        expect(paragraph.trim(), `${shard.id} p${i}`).toBe(paragraph);
        expect(paragraph.length, `${shard.id} p${i} too short`).toBeGreaterThan(60);
        expect(paragraph.length, `${shard.id} p${i} too long`).toBeLessThan(700);
      }
    }
  });

  it("resolves shards by id and throws on one nobody authored", () => {
    expect(getShard("shard-roll-call")?.title).toBe("Roll Call, Ledge Nine");
    expect(getShard("shard-nowhere")).toBeUndefined();
    expect(() => requireShard("shard-nowhere")).toThrow(/Unknown lore shard/);
  });

  it("pays the whole set off with something to read and nothing to spend", () => {
    // The reward for twelve is a picture, not an item: LORE_PAYOFF is
    // prose and the shards carry no effects field at all.
    expect(LORE_PAYOFF.length).toBeGreaterThanOrEqual(2);
    for (const paragraph of LORE_PAYOFF) {
      expect(paragraph.length).toBeGreaterThan(80);
    }
    // And it reframes a beat the story actually plays.
    const whole = LORE_PAYOFF.join(" ");
    expect(whole).toContain("Hex");
    expect(whole).toContain("Relay Crown");
    for (const shard of LORE_SHARDS) {
      expect(Object.keys(shard), shard.id).not.toContain("effects");
    }
  });
});

describe("shard gates", () => {
  const gated = LORE_SHARDS.filter((shard) => shard.requirements !== undefined);

  it("seals exactly three shards: a stat, an enhancement, and a standing", () => {
    expect(gated.map((shard) => shard.id)).toEqual([
      "shard-charter-minutes",
      "shard-cordon-precedent",
      "shard-last-shift",
    ]);
    expect(
      gated.flatMap((shard) => [...(shard.requirements ?? [])].map((r) => r.type)).sort(),
    ).toEqual(["enhancement", "reputation", "stat"]);
  });

  it("tells the player what would open a sealed one, and nothing else", () => {
    for (const shard of LORE_SHARDS) {
      if (shard.requirements === undefined) {
        expect(shard.sealed, `${shard.id} refuses with no gate`).toBeUndefined();
        continue;
      }
      expect(shard.sealed, `${shard.id} seals silently`).toBeDefined();
      expect((shard.sealed ?? "").length).toBeGreaterThan(30);
    }
    // Each line names its own gate in the player's own vocabulary.
    expect(requireShard("shard-charter-minutes").sealed).toContain("Optic Suite");
    expect(requireShard("shard-cordon-precedent").sealed).toContain("Tech");
    expect(requireShard("shard-last-shift").sealed).toContain("Court");
  });

  it("gates on things the game actually has", () => {
    for (const shard of gated) {
      for (const requirement of shard.requirements ?? []) {
        if (requirement.type === "stat") {
          expect(STAT_KEYS, shard.id).toContain(requirement.stat);
          // Reachable: a gate above the hard cap is a locked door with
          // no key anywhere in the game.
          expect(requirement.value).toBeLessThanOrEqual(STAT_HARD_CAP);
          expect(requirement.value).toBeGreaterThan(3);
        } else if (requirement.type === "enhancement") {
          const item = getItem(requirement.itemId);
          expect(item?.kind, `${shard.id} ${requirement.itemId}`).toBe(
            "enhancement",
          );
          expect(
            ENHANCEMENT_SLOTS,
            `${shard.id} ${requirement.itemId} slot`,
          ).toContain(item?.kind === "enhancement" ? item.slot : undefined);
        } else if (requirement.type === "reputation") {
          expect(isFactionId(requirement.factionId), shard.id).toBe(true);
          expect(REPUTATION_BAND_IDS, shard.id).toContain(requirement.value);
        }
      }
    }
  });
});

describe("shard placement", () => {
  it("spreads twelve shards over every district and interior in the game", () => {
    const perMap = explorableMaps.map(
      (map) => [map.id, shardsOnMap(map.id).length] as const,
    );
    expect(perMap).toEqual([
      ["cinder-plaza", 2],
      ["greywater-steps", 2],
      ["exchange-ventworks", 2],
      ["auric-spire", 1],
      ["auric-executive", 1],
      ["vertical-market", 2],
      ["flooded-quays", 2],
    ]);
    expect(perMap.reduce((sum, [, count]) => sum + count, 0)).toBe(
      LORE_SHARDS.length,
    );
    for (const arena of maps.filter((map) => ARENA_MAP_IDS.has(map.id))) {
      expect(shardsOnMap(arena.id), `${arena.id} carries a shard`).toEqual([]);
    }
  });

  it("names its district as the map itself names it", () => {
    // The locked slot's only hint has to be a place the player can go
    // and look, spelled the way the HUD spells it.
    for (const shard of LORE_SHARDS) {
      expect(shard.district, shard.id).toBe(requireMap(shard.mapId).name);
    }
  });

  it("lies on walkable, unobstructed ground with nothing already on it", () => {
    for (const shard of LORE_SHARDS) {
      const map = requireMap(shard.mapId);
      expect(inBounds(map, shard.x, shard.y), shard.id).toBe(true);
      expect(
        tileAt(map, shard.x, shard.y)?.walkable,
        `${shard.id} on an unwalkable tile`,
      ).toBe(true);
      expect(
        isWalkable(map, shard.x, shard.y),
        `${shard.id} on ground something else already holds`,
      ).toBe(true);
    }
  });

  it("never puts two shards, or a shard and a spawn point, on one tile", () => {
    for (const [mapId, map] of shardedMaps) {
      const tiles = map.interactables.map((thing) => `${thing.x},${thing.y}`);
      expect(new Set(tiles).size, `${mapId} stacks interactables`).toBe(
        tiles.length,
      );
      for (const spawn of requireMap(mapId).spawns) {
        expect(
          isWalkable(map, spawn.x, spawn.y),
          `${mapId} shard sits on spawn ${spawn.id}`,
        ).toBe(true);
      }
    }
  });

  it("keeps clear of the tiles the reactive world spawns people onto", () => {
    // populateMap runs before placeShards, so a collision would silently
    // drop the shard on any run that switched that reaction on.
    const spawnTiles = new Set(
      SCENE_REACTIONS.flatMap((reaction) =>
        (reaction.spawn ?? []).map(
          (spawn) => `${reaction.mapId}:${spawn.x},${spawn.y}`,
        ),
      ),
    );
    for (const shard of LORE_SHARDS) {
      expect(
        spawnTiles.has(`${shard.mapId}:${shard.x},${shard.y}`),
        `${shard.id} shares a tile with a world spawn`,
      ).toBe(false);
    }
  });

  it("stands outside the ambient crowd's zones", () => {
    // A chip inside a zone eats a roaming tile out of a rectangle whose
    // room to wander is already linted against the authored map.
    for (const shard of LORE_SHARDS) {
      for (const zone of requireMap(shard.mapId).ambient?.zones ?? []) {
        expect(
          inZone(zone, shard.x, shard.y),
          `${shard.id} stands in crowd zone ${zone.id}`,
        ).toBe(false);
      }
    }
  });

  it("can be walked up to from every spawn on its map", () => {
    for (const [mapId, map] of shardedMaps) {
      for (const spawn of map.spawns) {
        for (const shard of shardsOnMap(mapId)) {
          expect(
            findPathToAdjacent(map, { x: spawn.x, y: spawn.y }, shard),
            `${shard.id} unreachable from ${spawn.id}`,
          ).not.toBeNull();
        }
      }
    }
  });

  it("leaves the district whole: nothing on it becomes unreachable", () => {
    // The failure mode a collectible on a walkway span would cause —
    // a chip standing in a doorway cuts the map in half.
    for (const [mapId, map] of shardedMaps) {
      const start = requireSpawn(map, "player-start");
      const orphans: string[] = [];
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (isWalkable(map, x, y) && findPath(map, start, { x, y }) === null) {
            orphans.push(`(${x}, ${y})`);
          }
        }
      }
      expect(orphans, `${mapId} walled off by a shard`).toEqual([]);
      for (const thing of map.interactables) {
        expect(
          findPathToAdjacent(map, start, thing),
          `${mapId}/${thing.id} unreachable past the shards`,
        ).not.toBeNull();
      }
    }
  });
});
