import { describe, expect, it } from "vitest";
import { findPath } from "../iso/path";
import { isWalkable, type IsoMap } from "../iso/tilemap";
import { patrolCycleLength, patrolSteps } from "../stealth/patrol";
import { sneakRoute, watchPeriod } from "../stealth/testSupport";
import { withinBounds } from "../stealth/detect";
import { guardSpriteId } from "../stealth/watch";
import { getEncounter, liveSpawns, requireEncounter } from "./encounters";
import { enemySpriteId, getEnemy } from "./enemies";
import { requireMap } from "./maps";
import { placeShards } from "../world/shards";
import { emptyLore } from "../state/lore";
import { storyArcs } from "./story";
import { arcEntryNodeIds } from "../narrative/types";
import { UNDER_WATERLINE_STAGE_FLAG } from "./story/underWaterline";
import {
  SILENT_TAKEDOWN_TAG,
  stealthZones,
  takedownAllowance,
  takedownFlag,
  takedownGuards,
} from "./stealth";
import { items } from "./items";

const zones = stealthZones;

/** Every node in the game, by id, whatever arc it belongs to. */
const nodesById = new Map(
  storyArcs.flatMap((arc) => arc.nodes.map((node) => [node.id, arc] as const)),
);

const doorways = new Set(storyArcs.flatMap((arc) => arcEntryNodeIds(arc)));

const tileKey = (tile: { x: number; y: number }): string => `${tile.x},${tile.y}`;

describe("stealth zones are declared once and only once", () => {
  it("has unique ids, and unique guard ids inside each", () => {
    expect(new Set(zones.map((z) => z.id)).size).toBe(zones.length);
    for (const zone of zones) {
      const ids = zone.guards.map((g) => g.id);
      expect(new Set(ids).size, zone.id).toBe(ids.length);
      expect(zone.guards.length, zone.id).toBeGreaterThan(0);
    }
  });

  it("posts at most one watch per map, so a crossing is never ambiguous", () => {
    const byMap = zones.map((z) => z.mapId);
    expect(new Set(byMap).size).toBe(byMap.length);
  });
});

describe.each(zones.map((zone) => [zone.id, zone] as const))(
  "the %s zone",
  (_id, zone) => {
    // The map as a player actually walks onto it, not as it is
    // authored: memory shards are placed at mount and occupy (and
    // therefore block) their tile, and both of these districts have one
    // sitting in a place that matters. A route linted against the bare
    // map is a route that does not exist.
    const map: IsoMap = placeShards(requireMap(zone.mapId), emptyLore());
    const encounter = requireEncounter(zone.encounterId);

    it("stands on a map the game has, over a fight the game has", () => {
      expect(getEncounter(zone.encounterId)).toBeDefined();
      expect(map.id).toBe(zone.mapId);
    });

    it("keeps its bounds inside the map", () => {
      expect(zone.bounds.x).toBeGreaterThanOrEqual(0);
      expect(zone.bounds.y).toBeGreaterThanOrEqual(0);
      expect(zone.bounds.x + zone.bounds.width).toBeLessThanOrEqual(map.width);
      expect(zone.bounds.y + zone.bounds.height).toBeLessThanOrEqual(map.height);
    });

    it("walks its patrols over ground a body can actually stand on", () => {
      for (const guard of zone.guards) {
        for (const step of patrolSteps(guard.route)) {
          expect(
            isWalkable(map, step.x, step.y),
            `${zone.id}/${guard.id} walks over (${step.x}, ${step.y})`,
          ).toBe(true);
          expect(
            withinBounds(zone.bounds, step),
            `${zone.id}/${guard.id} leaves the zone at (${step.x}, ${step.y})`,
          ).toBe(true);
        }
      }
    });

    it("keeps every patrol closed and short enough to read", () => {
      for (const guard of zone.guards) {
        const length = patrolCycleLength(guard.route);
        expect(length, `${guard.id}`).toBeGreaterThan(0);
        // A beat nobody can learn is not a beat. Twenty-odd ticks is
        // about twenty seconds of watching, which is a patrol you can
        // stand in a doorway and time.
        expect(length, `${guard.id}`).toBeLessThanOrEqual(24);
      }
    });

    it("pins every guard to a spawn of its own in the fight", () => {
      const slots = zone.guards.map((g) => g.spawnSlot);
      expect(new Set(slots).size, zone.id).toBe(slots.length);
      for (const guard of zone.guards) {
        const spawn = encounter.enemies[guard.spawnSlot];
        expect(spawn, `${guard.id} slot ${guard.spawnSlot}`).toBeDefined();
        // The archetype is authored twice on purpose; this is the test
        // that stops the two copies drifting.
        expect(spawn?.enemyId, guard.id).toBe(guard.enemyId);
        expect(getEnemy(guard.enemyId), guard.id).toBeDefined();
      }
    });

    it("keeps one absence flag per body, on the walkway and in the arena", () => {
      for (const guard of zone.guards) {
        const spawn = encounter.enemies[guard.spawnSlot]!;
        // Exactly three readings, and a spawn has to agree with its
        // guard about which one it is: an absence somebody else's work
        // writes (the muster relay), the flag a takedown writes, or
        // nothing at all for a body that always turns up.
        const expected =
          guard.absentWhenFlag ??
          (guard.takedown === false
            ? undefined
            : takedownFlag(zone.id, guard.id));
        expect(spawn.absentWhenFlag, `${zone.id}/${guard.id}`).toBe(expected);
      }
    });

    it("wears the face its own slot wears in the fight", () => {
      for (const guard of zone.guards) {
        const spriteId = guardSpriteId(zone, guard);
        expect(spriteId.startsWith(guard.enemyId), guard.id).toBe(true);
        expect(spriteId, guard.id).not.toBe(enemySpriteId("unknown"));
      }
    });

    it("never allows enough takedowns to leave the fight empty", () => {
      const takeable = takedownGuards(zone);
      for (const quiet of [false, true]) {
        expect(
          takedownAllowance(zone, quiet),
          `${zone.id} quiet=${quiet}`,
        ).toBeLessThanOrEqual(takeable.length);
      }
      // The worst case the run can reach: every takedown spent, and
      // every other absence flag in the encounter written too.
      const worst: Record<string, boolean> = {};
      for (const spawn of encounter.enemies) {
        if (spawn.absentWhenFlag) worst[spawn.absentWhenFlag] = true;
      }
      const spent = takeable
        .slice(0, takedownAllowance(zone, true))
        .map((guard) => takedownFlag(zone.id, guard.id));
      const flags = Object.fromEntries(
        Object.keys(worst)
          .filter(
            (key) =>
              spent.includes(key) ||
              !takeable.some((g) => takedownFlag(zone.id, g.id) === key),
          )
          .map((key) => [key, true]),
      );
      expect(liveSpawns(encounter, flags).length, zone.id).toBeGreaterThan(0);
    });

    it("puts the far side on walkable ground outside the watch", () => {
      expect(zone.goal.tiles.length).toBeGreaterThan(0);
      for (const tile of zone.goal.tiles) {
        expect(isWalkable(map, tile.x, tile.y), tileKey(tile)).toBe(true);
        expect(withinBounds(zone.bounds, tile), tileKey(tile)).toBe(false);
      }
    });

    it("offers dashes between two tiles a body can stand on", () => {
      for (const pinch of zone.pinches ?? []) {
        expect(isWalkable(map, pinch.from.x, pinch.from.y), pinch.id).toBe(true);
        expect(isWalkable(map, pinch.to.x, pinch.to.y), pinch.id).toBe(true);
        const gap =
          Math.abs(pinch.to.x - pinch.from.x) +
          Math.abs(pinch.to.y - pinch.from.y);
        // Far enough to be worth the reflexes, close enough to be a
        // lunge rather than a teleport.
        expect(gap, pinch.id).toBeGreaterThan(1);
        expect(gap, pinch.id).toBeLessThanOrEqual(3);
        expect(pinch.reflexes, pinch.id).toBeGreaterThan(0);
      }
      const ids = (zone.pinches ?? []).map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("opens two story beats, both of them doorways their arc declares", () => {
      for (const nodeId of [zone.goal.nodeId, zone.spottedNodeId]) {
        expect(nodesById.has(nodeId), nodeId).toBe(true);
        expect(doorways.has(nodeId), `${nodeId} is not a declared entry`).toBe(
          true,
        );
      }
    });

    it("is the same fight either way: being seen leads back to it", () => {
      const spotted = storyArcs
        .flatMap((arc) => arc.nodes)
        .find((node) => node.id === zone.spottedNodeId)!;
      const starts = spotted.choices.flatMap((choice) =>
        (choice.effects ?? []).flatMap((effect) =>
          effect.type === "start-combat" ? [effect.encounterId] : [],
        ),
      );
      expect(starts).toEqual([zone.encounterId]);
    });

    it("can be walked from the map's own spawn to the far side, unseen", () => {
      const spawn = map.spawns.find((s) => s.id === "player-start")!;
      const start = { x: spawn.x, y: spawn.y };
      // There is a way across on foot at all…
      expect(
        findPath(map, start, zone.goal.tiles[0]!),
        `${zone.id} has no route to its own goal`,
      ).not.toBeNull();
      // …and a way across that nobody ever sees, timed against the
      // patrols themselves rather than asserted. This is the whole
      // promise of a stealth-optional encounter, so it is the test that
      // fails if a route is re-timed into a wall.
      const quiet = sneakRoute(map, zone, start);
      expect(quiet, `${zone.id} cannot be crossed unseen`).not.toBeNull();
      expect(quiet!.length).toBeGreaterThan(1);
      // And the watch is periodic, so the search was exhaustive.
      expect(watchPeriod(zone)).toBeGreaterThan(0);
    });

    it("can still be crossed unseen with every other advantage unspent", () => {
      // A run that has done nothing else — no breach, no takedown —
      // still has the quiet road. (The reverse, a run that has stood a
      // body down, only ever has fewer eyes.)
      const spawn = map.spawns.find((s) => s.id === "player-start")!;
      expect(sneakRoute(map, zone, { x: spawn.x, y: spawn.y }, {})).not.toBeNull();
    });
  },
);

describe("the strings a zone shares with the rest of the game", () => {
  it("gates the crossing on the side chain's own stage flag", () => {
    const crossing = zones.find((z) => z.id === "store-crossing")!;
    expect(crossing.requires).toEqual([
      {
        type: "flag-equals",
        key: UNDER_WATERLINE_STAGE_FLAG,
        value: "taken",
      },
    ]);
  });

  it("names a takedown tag some implant in the game actually grants", () => {
    const granted = items.flatMap((item) =>
      ("effects" in item ? (item.effects ?? []) : []).flatMap((effect) =>
        effect.type === "unlock-dialogue" ? [effect.tag] : [],
      ),
    );
    expect(granted).toContain(SILENT_TAKEDOWN_TAG);
  });
});
