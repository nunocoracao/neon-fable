import { describe, expect, it } from "vitest";
import { validateAppearance, composeVisual } from "../character";
import { GLYPH_CHARS } from "../iso/art/popupFont";
import {
  findPath,
  findPathToAdjacent,
} from "../iso/path";
import { inZone, roamTiles } from "../iso/ambient";
import { isWalkable, type IsoMap } from "../iso/tilemap";
import { checkRequirements } from "../narrative/requirements";
import { arcEntryNodeIds } from "../narrative/types";
import { createNewGame, type GameState } from "../state";
import { fixtureCharacter } from "../character/testSupport";
import { listPrice } from "../economy";
import { populateMap } from "../world/population";
import { worldOf } from "../world/state";
import { vendorStock } from "../world/vendor";
import { castVisual } from "./cast";
import { PRICE_FLOOR, VENDOR_IDS, isVendorId, itemValue } from "./economy";
import { getItem } from "./items";
import { maps, requireMap } from "./maps";
import { findArcByNode } from "./story";
import {
  NEWS_CHANNELS,
  NEWS_HEADLINES,
  SCENE_REACTIONS,
  VENDOR_STOCK,
  WORLD_CONDITIONS,
  conditionRequirements,
  getCondition,
  type WorldConditionId,
} from "./world";

/**
 * Content lint for the reactive world layer. Two promises are worth
 * more than the rest and are checked hardest:
 *
 *  1. Every condition, node, item, map, and interactable a reaction
 *     names actually exists — a reaction that fires into nothing is a
 *     street that silently never changes.
 *  2. A *populated* map still satisfies every rule the map lint makes
 *     about an authored one. Placement is the one thing dressMap
 *     refused to do precisely because these guarantees are hard, so the
 *     feature that does it has to re-earn them.
 */

const ALL_CONDITIONS = WORLD_CONDITIONS.map((c) => c.id);

/** Every map any reaction touches, populated with everything switched on. */
function maximallyPopulated(mapId: string): IsoMap {
  return populateMap(requireMap(mapId), worldOf(...ALL_CONDITIONS));
}

const REACTIVE_MAP_IDS = [...new Set(SCENE_REACTIONS.map((r) => r.mapId))];

function makeState(): GameState {
  return createNewGame({ character: fixtureCharacter({}), seed: 1 });
}

describe("world conditions", () => {
  it("names every condition exactly once", () => {
    expect(new Set(ALL_CONDITIONS).size).toBe(WORLD_CONDITIONS.length);
  });

  it("gates every condition on something — a condition always true is not one", () => {
    for (const condition of WORLD_CONDITIONS) {
      expect(
        condition.requirements.length,
        `condition "${condition.id}" gates on nothing`,
      ).toBeGreaterThan(0);
      expect(condition.label.length, condition.id).toBeGreaterThan(0);
    }
  });

  it("speaks about a real district, or about the city", () => {
    const mapIds = new Set(maps.map((map) => map.id));
    for (const condition of WORLD_CONDITIONS) {
      if (condition.district === "city") continue;
      expect(mapIds.has(condition.district), condition.id).toBe(true);
    }
  });

  it("holds nothing against a fresh character — a new run has a quiet city", () => {
    const state = makeState();
    const live = WORLD_CONDITIONS.filter((condition) =>
      checkRequirements(state, [...condition.requirements]),
    ).map((c) => c.id);
    // The two complements are the exception and the reason they exist:
    // "no warrant stands" and "nobody is looking for a spike" are true
    // of somebody who has done nothing at all, which is correct.
    expect(live).toEqual(["streets-calm", "warrant-clear"]);
  });

  it("hands back a spreadable requirement bundle", () => {
    expect(conditionRequirements("cordon-broken")).toEqual([
      { type: "flag-equals", key: "cordon-broken", value: true },
    ]);
    expect(conditionRequirements()).toEqual([]);
    expect(() =>
      conditionRequirements("no-such-condition" as WorldConditionId),
    ).toThrow(/no-such-condition/);
  });
});

describe("scene reactions", () => {
  it("authors enough of them to make the city feel watched", () => {
    expect(SCENE_REACTIONS.length).toBeGreaterThanOrEqual(8);
  });

  it("names a real condition, a real map, and a unique id", () => {
    const ids = SCENE_REACTIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const mapIds = new Set(maps.map((map) => map.id));
    for (const reaction of SCENE_REACTIONS) {
      expect(getCondition(reaction.conditionId), reaction.id).toBeDefined();
      expect(mapIds.has(reaction.mapId), reaction.id).toBe(true);
      expect(reaction.note.length, reaction.id).toBeGreaterThan(0);
      // A reaction that changes nothing is a note, not a reaction.
      const moves =
        (reaction.spawn?.length ?? 0) +
        (reaction.despawn?.length ?? 0) +
        (reaction.dress?.length ?? 0);
      expect(moves, `reaction "${reaction.id}" changes nothing`).toBeGreaterThan(0);
    }
  });

  it("only takes off, and re-labels, interactables the map actually has", () => {
    for (const reaction of SCENE_REACTIONS) {
      const authored = new Set(
        requireMap(reaction.mapId).interactables.map((i) => i.id),
      );
      for (const id of reaction.despawn ?? []) {
        expect(authored.has(id), `${reaction.id} despawns unknown "${id}"`).toBe(
          true,
        );
      }
      for (const dressing of reaction.dress ?? []) {
        expect(
          authored.has(dressing.interactableId),
          `${reaction.id} dresses unknown "${dressing.interactableId}"`,
        ).toBe(true);
        if (dressing.nodeId !== undefined) {
          expect(findArcByNode(dressing.nodeId), dressing.nodeId).toBeDefined();
        }
      }
    }
  });

  it("gives every spawn a scene to open and a face to wear", () => {
    for (const reaction of SCENE_REACTIONS) {
      for (const spawn of reaction.spawn ?? []) {
        expect(
          findArcByNode(spawn.nodeId),
          `${spawn.id} opens unknown node "${spawn.nodeId}"`,
        ).toBeDefined();
        const visual = castVisual(spawn.speaker);
        expect(visual, `${spawn.id} speaker "${spawn.speaker}"`).toBeDefined();
        if (!visual) continue;
        expect(validateAppearance(visual.appearance), spawn.id).toEqual([]);
        expect(() => composeVisual(visual)).not.toThrow();
        expect(spawn.label.length, spawn.id).toBeGreaterThan(0);
      }
    }
  });

  it("opens its scenes at nodes their arc declares as ways in", () => {
    // A scene the world opens — a spawned NPC's, or the variant a
    // dressing re-points somebody at — is reached only from the map, so
    // its node has to be a declared entry of its arc or the arc
    // validator would (correctly) call it orphaned.
    const opened = SCENE_REACTIONS.flatMap((reaction) => [
      ...(reaction.spawn ?? []).map((s) => [s.id, s.nodeId] as const),
      ...(reaction.dress ?? [])
        .filter((d) => d.nodeId !== undefined)
        .map((d) => [d.interactableId, d.nodeId as string] as const),
    ]);
    // Both channels are exercised, or this test is only half a lint.
    expect(opened.length).toBeGreaterThan(
      SCENE_REACTIONS.flatMap((r) => r.spawn ?? []).length,
    );
    for (const [who, nodeId] of opened) {
      const arc = findArcByNode(nodeId);
      expect(arc, nodeId).toBeDefined();
      if (!arc) continue;
      expect(
        arcEntryNodeIds(arc),
        `${who} opens "${nodeId}", which its arc does not declare as a way in`,
      ).toContain(nodeId);
    }
  });

  it("never spawns a name the map — or another reaction — already uses", () => {
    for (const mapId of REACTIVE_MAP_IDS) {
      const authored = requireMap(mapId).interactables.map((i) => i.id);
      const spawned = SCENE_REACTIONS.filter((r) => r.mapId === mapId).flatMap(
        (r) => (r.spawn ?? []).map((s) => s.id),
      );
      const all = [...authored, ...spawned];
      expect(new Set(all).size, `duplicate interactable id on ${mapId}`).toBe(
        all.length,
      );
    }
  });

  it("stands everybody it spawns on distinct ground", () => {
    for (const mapId of REACTIVE_MAP_IDS) {
      const tiles = SCENE_REACTIONS.filter((r) => r.mapId === mapId)
        .flatMap((r) => r.spawn ?? [])
        .map((s) => `${s.x},${s.y}`);
      expect(new Set(tiles).size, `two spawns share a tile on ${mapId}`).toBe(
        tiles.length,
      );
      const authored = new Set(
        requireMap(mapId).interactables.map((i) => `${i.x},${i.y}`),
      );
      for (const tile of tiles) {
        expect(authored.has(tile), `${mapId} spawn stands on an NPC`).toBe(false);
      }
    }
  });
});

/**
 * The heart of it: a populated map is still a map. Everything here is
 * the authored-map lint from ./maps.test.ts, re-run against the state
 * of the world with every reaction switched on at once — the densest
 * street any run can produce.
 */
describe("a populated district still passes the map lint", () => {
  for (const mapId of REACTIVE_MAP_IDS) {
    describe(mapId, () => {
      const map = maximallyPopulated(mapId);

      it("actually changed", () => {
        expect(map).not.toBe(requireMap(mapId));
      });

      it("stands every interactable on walkable, unobstructed ground", () => {
        for (const thing of map.interactables) {
          expect(
            isWalkable(map, thing.x, thing.y) ||
              // isWalkable counts an interactable's own tile as taken;
              // what matters is that the ground under it would hold.
              map.interactables.filter(
                (other) => other.x === thing.x && other.y === thing.y,
              ).length === 1,
            `${thing.id} stands on unwalkable ground`,
          ).toBe(true);
        }
        // No two of them on one tile, authored or spawned.
        const tiles = map.interactables.map((i) => `${i.x},${i.y}`);
        expect(new Set(tiles).size).toBe(tiles.length);
      });

      it("keeps every interactable reachable from every spawn point", () => {
        for (const spawn of map.spawns) {
          for (const thing of map.interactables) {
            expect(
              findPathToAdjacent(map, { x: spawn.x, y: spawn.y }, thing),
              `${thing.id} unreachable from spawn ${spawn.id}`,
            ).not.toBeNull();
          }
        }
      });

      it("leaves no walkable ground orphaned from the player spawn", () => {
        const start = map.spawns.find((s) => s.id === "player-start");
        expect(start).toBeDefined();
        if (!start) return;
        const orphans: string[] = [];
        for (let y = 0; y < map.height; y++) {
          for (let x = 0; x < map.width; x++) {
            if (isWalkable(map, x, y) && findPath(map, start, { x, y }) === null) {
              orphans.push(`(${x}, ${y})`);
            }
          }
        }
        expect(orphans, "walled off by a spawned body").toEqual([]);
      });

      it("leaves the ambient crowd's zones whole and roamable", () => {
        for (const zone of map.ambient?.zones ?? []) {
          const tiles = roamTiles(map, zone);
          const [first] = tiles;
          expect(tiles.length, `zone ${zone.id} has no ground left`).toBeGreaterThan(
            0,
          );
          if (!first) continue;
          const stranded = tiles.filter(
            (tile) =>
              findPath(map, first, tile, (x, y) => inZone(zone, x, y)) === null,
          );
          expect(
            stranded.map((t) => `(${t.x}, ${t.y})`),
            `zone ${zone.id} split into islands by a spawn`,
          ).toEqual([]);
        }
      });

      it("keeps spawned bodies out of the crowd's zones entirely", () => {
        // Belt and braces over the connectivity check above: a
        // pedestrian's rectangle is authored against the map, and
        // dropping a blocking body into one is the failure mode that is
        // easiest to introduce and hardest to see.
        const authored = new Set(
          requireMap(mapId).interactables.map((i) => i.id),
        );
        for (const thing of map.interactables) {
          if (authored.has(thing.id)) continue;
          for (const zone of map.ambient?.zones ?? []) {
            expect(
              inZone(zone, thing.x, thing.y),
              `${thing.id} stands inside ambient zone ${zone.id}`,
            ).toBe(false);
          }
        }
      });

      it("never invents a way out of the district", () => {
        const authored = new Set(
          requireMap(mapId).interactables.map((i) => i.id),
        );
        for (const thing of map.interactables) {
          if (authored.has(thing.id)) continue;
          expect(thing.exit, `${thing.id} declares an exit`).toBeUndefined();
          expect(thing.spriteId).toBe("npc");
          expect(thing.interaction.kind).toBe("dialogue");
        }
      });
    });
  }
});

describe("the news pool", () => {
  it("carries enough headlines to cover the story's beats", () => {
    expect(NEWS_HEADLINES.length).toBeGreaterThanOrEqual(15);
    expect(new Set(NEWS_HEADLINES.map((h) => h.id)).size).toBe(
      NEWS_HEADLINES.length,
    );
  });

  it("writes every line in the alphabet the readout font can draw", () => {
    const alphabet = new Set(GLYPH_CHARS);
    for (const headline of NEWS_HEADLINES) {
      const unknown = [...headline.text].filter((ch) => !alphabet.has(ch));
      expect(unknown, `headline "${headline.id}" has undrawable characters`).toEqual(
        [],
      );
      expect(headline.text.length, headline.id).toBeGreaterThan(0);
    }
  });

  it("gates only on conditions that exist", () => {
    for (const headline of NEWS_HEADLINES) {
      for (const id of [...(headline.requires ?? []), ...(headline.absent ?? [])]) {
        expect(getCondition(id), `${headline.id} gates on "${id}"`).toBeDefined();
      }
    }
  });

  it("keeps ungated filler on every channel, so no screen can go blank", () => {
    for (const channel of NEWS_CHANNELS) {
      const filler = NEWS_HEADLINES.filter(
        (h) => h.channel === channel && !h.requires?.length && !h.absent?.length,
      );
      expect(filler.length, `channel "${channel}" has no standing filler`)
        .toBeGreaterThan(0);
    }
  });

  it("puts the story's major beats on the screens", () => {
    // Every beat the reactive layer knows about should be sayable out
    // loud somewhere, or the screens are decoration rather than news.
    const spoken = new Set(NEWS_HEADLINES.flatMap((h) => h.requires ?? []));
    const unspoken = ALL_CONDITIONS.filter(
      (id) =>
        !spoken.has(id) &&
        // The two complements are the absence of news, by definition.
        id !== "streets-calm" &&
        id !== "warrant-clear",
    );
    expect(unspoken, "conditions no headline ever reports").toEqual([]);
  });
});

describe("vendor stock", () => {
  it("stocks real items under ids it never reuses, gated on real conditions", () => {
    const ids = VENDOR_STOCK.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of VENDOR_STOCK) {
      expect(getItem(entry.itemId), entry.id).toBeDefined();
      expect(isVendorId(entry.vendorId), entry.id).toBe(true);
      for (const id of entry.requires ?? []) {
        expect(getCondition(id), `${entry.id} gates on "${id}"`).toBeDefined();
      }
    }
  });

  it("prices nothing itself — a line carries risk, never a figure", () => {
    for (const entry of VENDOR_STOCK) {
      // What a thing is worth lives in ./economy.ts and nowhere else;
      // a premium is what the street charges for holding this one.
      expect(itemValue(entry.itemId), entry.id).toBeGreaterThan(0);
      if (entry.premium !== undefined) {
        expect(entry.premium, entry.id).toBeGreaterThan(0);
      }
    }
  });

  it("derives every live line at a price above nothing", () => {
    const world = worldOf(
      ...WORLD_CONDITIONS.map((condition) => condition.id),
    );
    for (const entry of VENDOR_STOCK) {
      const price = listPrice(entry.vendorId, entry);
      expect(price, entry.id).toBeGreaterThanOrEqual(PRICE_FLOOR);
    }
    // And the whole shelf resolves under a maximally-loud city.
    for (const vendorId of VENDOR_IDS) {
      for (const entry of vendorStock(vendorId, world)) {
        expect(listPrice(vendorId, entry), entry.id).toBeGreaterThan(0);
      }
    }
  });
});
