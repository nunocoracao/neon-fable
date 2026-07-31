import { describe, expect, it } from "vitest";
import { SCENE_REACTIONS, type WorldConditionId } from "../data/world";
import { requireMap } from "../data/maps";
import { liveReactions, populateMap } from "./population";
import { EMPTY_WORLD, worldOf } from "./state";

/**
 * Placement resolution: which reaction is live, who that puts on a map,
 * and who it takes off. The content itself is linted in
 * src/data/world.test.ts; this is the join.
 */

const hub = requireMap("cinder-plaza");
const market = requireMap("vertical-market");

function ids(mapId: string, ...conditions: readonly WorldConditionId[]): string[] {
  return populateMap(requireMap(mapId), worldOf(...conditions)).interactables.map(
    (i) => i.id,
  );
}

describe("liveReactions", () => {
  it("picks out only this map's reactions, and only the live ones", () => {
    const live = liveReactions("cinder-plaza", worldOf("cordon-broken"));
    expect(live.map((r) => r.id)).toEqual(["row-runners-pull-back"]);
    expect(liveReactions("cinder-plaza", EMPTY_WORLD)).toEqual([]);
    // The same condition can move two districts at once.
    const shuttered = worldOf("stalls-shuttered");
    expect(liveReactions("cinder-plaza", shuttered).map((r) => r.id)).toEqual([
      "row-shutters",
    ]);
    expect(liveReactions("vertical-market", shuttered).map((r) => r.id)).toEqual([
      "market-takes-the-overflow",
    ]);
  });

  it("has a reaction for every map any reaction names", () => {
    for (const reaction of SCENE_REACTIONS) {
      expect(
        liveReactions(reaction.mapId, worldOf(reaction.conditionId)).map(
          (r) => r.id,
        ),
      ).toContain(reaction.id);
    }
  });
});

describe("populateMap", () => {
  it("hands back the authored map itself when nothing has happened", () => {
    expect(populateMap(hub, EMPTY_WORLD)).toBe(hub);
    expect(populateMap(market, EMPTY_WORLD)).toBe(market);
  });

  it("puts somebody on the street when a condition switches on", () => {
    const before = hub.interactables.map((i) => i.id);
    const after = ids("cinder-plaza", "syndicate-street");
    expect(after).toEqual([...before, "hub-syndicate-watch"]);

    const watch = populateMap(hub, worldOf("syndicate-street")).interactables.find(
      (i) => i.id === "hub-syndicate-watch",
    );
    expect(watch).toMatchObject({
      x: 5,
      y: 9,
      spriteId: "npc",
      minimap: true,
      interaction: { kind: "dialogue", nodeId: "st-syndicate-watch" },
    });
    // A spawn wears its speaker's authored face, like any named NPC.
    expect(watch?.visual?.appearance).toBeDefined();
  });

  it("takes somebody off the street when one does", () => {
    expect(hub.interactables.map((i) => i.id)).toContain("rust-runner");
    expect(ids("cinder-plaza", "cordon-broken")).not.toContain("rust-runner");
    // And the rest of the map is untouched.
    expect(ids("cinder-plaza", "cordon-broken")).toEqual(
      hub.interactables.map((i) => i.id).filter((id) => id !== "rust-runner"),
    );
  });

  it("re-labels without moving, re-pointing, or re-facing anything else", () => {
    const dressed = populateMap(hub, worldOf("stalls-shuttered"));
    const before = hub.interactables.find((i) => i.id === "market-vendor");
    const after = dressed.interactables.find((i) => i.id === "market-vendor");
    expect(after?.label).toBe("Wet-market vendor — shutters down");
    expect(after?.label).not.toBe(before?.label);
    // The shop still opens the same scene: the row is shuttered, not gone.
    expect(after?.interaction).toEqual(before?.interaction);
    expect(after?.x).toBe(before?.x);
    expect(after?.y).toBe(before?.y);
    expect(after?.visual).toBe(before?.visual);
  });

  it("stacks every live reaction on one map at once", () => {
    const after = ids(
      "cinder-plaza",
      "stalls-shuttered",
      "syndicate-street",
      "court-ascendant",
      "cordon-broken",
    );
    expect(after).toContain("hub-picket");
    expect(after).toContain("hub-syndicate-watch");
    expect(after).toContain("hub-court-runner");
    expect(after).not.toContain("rust-runner");
  });

  it("never leaves two people under one id", () => {
    const all = SCENE_REACTIONS.map((r) => r.conditionId);
    for (const mapId of new Set(SCENE_REACTIONS.map((r) => r.mapId))) {
      const after = ids(mapId, ...all);
      expect(new Set(after).size).toBe(after.length);
    }
  });

  it("leaves the authored map object alone", () => {
    const snapshot = JSON.stringify(hub);
    populateMap(hub, worldOf("stalls-shuttered", "cordon-broken"));
    expect(JSON.stringify(hub)).toBe(snapshot);
  });

  it("keeps everything a map is besides its people", () => {
    const after = populateMap(hub, worldOf("syndicate-street"));
    expect(after.tiles).toBe(hub.tiles);
    expect(after.props).toBe(hub.props);
    expect(after.spawns).toBe(hub.spawns);
    expect(after.ambient).toBe(hub.ambient);
    expect(after.setPieces).toBe(hub.setPieces);
    expect(after.dayPhase).toBe(hub.dayPhase);
  });

  it("is a pure function of the map and the conditions", () => {
    const world = worldOf("stalls-shuttered", "market-favoured");
    expect(populateMap(market, world)).toEqual(populateMap(market, world));
  });
});
