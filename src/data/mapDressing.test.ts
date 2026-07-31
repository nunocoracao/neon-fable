import { describe, expect, it } from "vitest";
import { minimapPipKind } from "../iso/minimap";
import { isWalkable, type IsoMap } from "../iso/tilemap";
import { castVisual } from "./cast";
import { dressMap, mapDressings } from "./mapDressing";
import { maps, requireMap } from "./maps";
import { findArcByNode } from "./story";

/**
 * The join between an authored map and what a run has done to it.
 *
 * Two things are pinned here. First that the rewrite is narrow: it may
 * change a label, a face, and what an interactable opens, and nothing
 * else — so every guarantee ../maps.test.ts proves about the authored
 * maps (reachability, walkability, minimap pips, arena rules) is still
 * true of every dressed variant, without that lint having to be run
 * twice. Second that the dressed variants are real content: the nodes
 * they point at exist, and the faces they name are in the cast.
 */

/** Every map a dressing can produce, paired with the flags that produce it. */
const variants = mapDressings.map((dressing) => ({
  dressing,
  map: dressMap(requireMap(dressing.mapId), {
    [dressing.when.key]: dressing.when.value,
  }),
}));

describe("map dressing", () => {
  it("leaves an untouched run's maps exactly as authored", () => {
    for (const map of maps) {
      // Identity, not just equality: nothing is copied when nothing
      // applies, so a scene keeps the same object between mounts.
      expect(dressMap(map, {}), map.id).toBe(map);
    }
  });

  it("names a real interactable on a real map", () => {
    for (const dressing of mapDressings) {
      const map = requireMap(dressing.mapId);
      expect(
        map.interactables.map((i) => i.id),
        `${dressing.mapId}/${dressing.interactableId}`,
      ).toContain(dressing.interactableId);
    }
  });

  it("opens a real story node, and wears a face the cast knows", () => {
    for (const { dressing } of variants) {
      if (dressing.nodeId !== undefined) {
        expect(
          findArcByNode(dressing.nodeId),
          `story node ${dressing.nodeId} missing`,
        ).toBeDefined();
      }
      if (dressing.label !== undefined) {
        // Every dressing so far re-labels a person, and a person the
        // player can be sent to needs a face in dialogue as well as on
        // the street.
        expect(castVisual(dressing.label), dressing.label).toBeDefined();
        expect(dressing.visual, dressing.label).toEqual(
          castVisual(dressing.label),
        );
      }
    }
  });

  it("moves nothing, adds nothing, and takes nothing away", () => {
    // The narrow contract that lets ../maps.test.ts stay honest about
    // the dressed maps without re-running over them.
    for (const { dressing, map } of variants) {
      const authored = requireMap(dressing.mapId);
      expect(map.interactables.length, dressing.mapId).toBe(
        authored.interactables.length,
      );
      for (const [index, thing] of map.interactables.entries()) {
        const before = authored.interactables[index]!;
        expect(thing.id, thing.id).toBe(before.id);
        expect({ x: thing.x, y: thing.y }, thing.id).toEqual({
          x: before.x,
          y: before.y,
        });
        expect(thing.spriteId, thing.id).toBe(before.spriteId);
        expect(thing.exit, thing.id).toEqual(before.exit);
        expect(minimapPipKind(thing), thing.id).toBe(minimapPipKind(before));
      }
      // Tiles, props, spawns and the rest are the authored map's own.
      for (const key of [
        "id",
        "name",
        "width",
        "height",
        "tiles",
        "props",
        "spawns",
      ] as const) {
        expect(map[key], `${dressing.mapId}.${String(key)}`).toBe(
          authored[key],
        );
      }
    }
  });

  it("keeps the ground under a dressed map walkable exactly where it was", () => {
    for (const { dressing, map } of variants) {
      const authored = requireMap(dressing.mapId);
      for (let y = 0; y < map.height; y += 1) {
        for (let x = 0; x < map.width; x += 1) {
          expect(isWalkable(map, x, y), `${dressing.mapId} ${x},${y}`).toBe(
            isWalkable(authored, x, y),
          );
        }
      }
    }
  });

  it("rewrites only the interactable it names", () => {
    for (const { dressing, map } of variants) {
      const authored = requireMap(dressing.mapId);
      for (const [index, thing] of map.interactables.entries()) {
        if (thing.id === dressing.interactableId) continue;
        expect(thing, thing.id).toBe(authored.interactables[index]);
      }
    }
  });

  it("applies only while its flag holds its value", () => {
    for (const { dressing } of variants) {
      const authored = requireMap(dressing.mapId);
      // A different value, and the wrong flag entirely, both leave the
      // authored map alone.
      for (const flags of [
        {},
        { [dressing.when.key]: "something-else" },
        { "some-other-flag": dressing.when.value },
      ]) {
        expect(dressMap(authored, flags), JSON.stringify(flags)).toBe(authored);
      }
    }
  });

  it("changes nothing on a map a dressing is not registered for", () => {
    const others: IsoMap[] = maps.filter(
      (map) => !mapDressings.some((dressing) => dressing.mapId === map.id),
    );
    expect(others.length).toBeGreaterThan(0);
    const everyFlag = Object.fromEntries(
      mapDressings.map((dressing) => [dressing.when.key, dressing.when.value]),
    );
    for (const map of others) {
      expect(dressMap(map, everyFlag), map.id).toBe(map);
    }
  });
});
