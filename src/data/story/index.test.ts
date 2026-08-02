import { describe, expect, it } from "vitest";
import { DAY_PHASES, resolveDayPhase } from "../../iso";
import { HUB_MAP_ID, requireMap } from "../maps";
import { act3Arc, findArcByNode, introArc, storyArcs } from "./index";

describe("findArcByNode", () => {
  it("finds the arc that contains a node id", () => {
    expect(findArcByNode("filament-door")?.id).toBe(introArc.id);
  });

  it("returns undefined for unknown node ids", () => {
    expect(findArcByNode("no-such-node")).toBeUndefined();
  });
});

describe("the hub opens nobody's first scene", () => {
  it("keeps the run's opening node off the plaza", () => {
    // The intro's entry is played once, by a new game, from the bolthole
    // (see ui/characterCreate.ts). A fixture on the plaza that opened it
    // handed every later act a way to restart the story from the middle
    // of it — the public terminal used to be exactly that.
    const hub = requireMap(HUB_MAP_ID);
    const opens = hub.interactables
      .map((thing) => thing.interaction)
      .filter((interaction) => interaction.kind === "dialogue")
      .map((interaction) => interaction.nodeId);
    expect(opens).not.toContain(introArc.entryNodeId);
    expect(opens).toContain("st-plaza-board");
  });
});

describe("day-phase staging", () => {
  const staged = storyArcs.flatMap((arc) =>
    arc.nodes
      .filter((node) => node.dayPhase !== undefined)
      .map((node) => [arc.id, node] as const),
  );

  it("only ever stages a real hour", () => {
    for (const [arcId, node] of staged) {
      expect(DAY_PHASES, `${arcId}/${node.id}`).toContain(node.dayPhase);
    }
  });

  it("opens the Succession on a hub that has turned late", () => {
    const hub = requireMap(HUB_MAP_ID);
    const opening = act3Arc.nodes.find((node) => node.id === act3Arc.entryNodeId);
    expect(opening?.dayPhase).toBe("late");
    // The beat is only worth authoring because it moves the scene: the
    // hub plays at its own hour until act 3 stages it at another.
    expect(resolveDayPhase(hub)).not.toBe(opening?.dayPhase);
    expect(resolveDayPhase(hub, opening?.dayPhase)).toBe("late");
  });

  it("stages hours only where they are a change from the map", () => {
    // A beat that restates the hour its map already declares is dead
    // authoring — it would read as staging and do nothing.
    for (const [arcId, node] of staged) {
      const map = node.location?.startsWith("cinder-row")
        ? requireMap(HUB_MAP_ID)
        : undefined;
      if (!map) continue;
      expect(node.dayPhase, `${arcId}/${node.id}`).not.toBe(map.dayPhase);
    }
  });
});
