import { describe, expect, it } from "vitest";
import { getEncounter } from "../encounters";
import { HUB_MAP_ID, requireMap } from "../maps";
import { storyArcs } from "./index";
import { quaysArc } from "./quays";

/**
 * Content-shape assertions for the Flooded Quays. Graph soundness is
 * covered by validate.test.ts over every registered arc and the map
 * itself by the lint in ../maps.test.ts; what is pinned here is the
 * district's wiring — both ways through the door, every fixture down
 * there reachable in dialogue as well as on foot, the cage's two
 * different keys, and the promise this arc makes to later work: it
 * stages an arena and touches nothing the acts read.
 */

const nodesById = new Map(quaysArc.nodes.map((node) => [node.id, node]));
const allChoices = quaysArc.nodes.flatMap((node) =>
  node.choices.map((choice) => ({ nodeId: node.id, choice })),
);

const travelChoices = allChoices.flatMap(({ nodeId, choice }) =>
  (choice.effects ?? []).flatMap((effect) =>
    effect.type === "travel" ? [{ nodeId, mapId: effect.mapId }] : [],
  ),
);

describe("flooded quays arc", () => {
  it("is registered so map interactions can find its nodes", () => {
    expect(storyArcs).toContain(quaysArc);
  });

  it("walks both ways: the hub's lockgate down, the stair back up", () => {
    expect(travelChoices).toEqual([
      { nodeId: "fq-lock", mapId: "flooded-quays" },
      { nodeId: "fq-stair", mapId: "cinder-plaza" },
    ]);
  });

  it("hangs the lockgate on the hub and the stair on the quays, each an exit", () => {
    const hub = requireMap(HUB_MAP_ID);
    const lock = hub.interactables.find((i) => i.id === "canal-lock");
    expect(lock?.interaction).toEqual({
      kind: "dialogue",
      nodeId: quaysArc.entryNodeId,
    });
    expect(lock?.exit).toEqual({ mapId: "flooded-quays" });

    const quays = requireMap("flooded-quays");
    const stair = quays.interactables.find((i) => i.id === "quays-lock");
    expect(stair?.interaction).toEqual({ kind: "dialogue", nodeId: "fq-stair" });
    expect(stair?.exit).toEqual({ mapId: "cinder-plaza", entryId: "south-road" });
  });

  it("keeps the hub as the only way in — the market is not next door", () => {
    // The quays sit at water level and the market six levels up the
    // same shaft; travel between districts always goes via the plaza,
    // so a player never has to guess how the map fits together.
    const destinations = new Set(travelChoices.map((choice) => choice.mapId));
    expect([...destinations].sort()).toEqual(["cinder-plaza", "flooded-quays"]);
  });

  it("opens every fixture on the water from the arrival beat too", () => {
    const quays = requireMap("flooded-quays");
    const opened = quays.interactables.map((i) =>
      i.interaction.kind === "dialogue" ? i.interaction.nodeId : "",
    );
    expect(opened.sort()).toEqual(["fq-board", "fq-cage", "fq-diver", "fq-stair"]);
    const arrivalTargets = (nodesById.get("fq-arrival")?.choices ?? []).flatMap(
      (choice) => (choice.target ? [choice.target] : []),
    );
    expect(arrivalTargets.sort()).toEqual([
      "fq-board",
      "fq-cage",
      "fq-diver",
      "fq-stair",
    ]);
  });

  it("keeps its colour self-contained: no act flags, no combat, no items out", () => {
    // What Dredge keeps finding down there is later work. This arc may
    // only leave `quays-known` behind, and the cage's own record of how
    // it came open.
    const flags = allChoices.flatMap(({ choice }) =>
      (choice.effects ?? []).flatMap((effect) =>
        effect.type === "set-flag" || effect.type === "increment-flag"
          ? [effect.key]
          : [],
      ),
    );
    expect([...new Set(flags)].sort()).toEqual(["quays-cage", "quays-known"]);
    for (const { choice } of allChoices) {
      for (const effect of choice.effects ?? []) {
        expect(effect.type, `${choice.id}`).not.toBe("start-combat");
        expect(effect.type, `${choice.id}`).not.toBe("remove-item");
      }
      for (const requirement of choice.requirements ?? []) {
        // Gating is on the character — a stat or what is installed in
        // them — never on story state, so the district plays the same in
        // every act and on a fresh run.
        expect(["stat", "enhancement"], `${choice.id}`).toContain(requirement.type);
      }
    }
  });

  it("pays the cage out only to a character who can get it open", () => {
    const cage = nodesById.get("fq-cage");
    const paying = (cage?.choices ?? []).filter(({ effects }) =>
      (effects ?? []).some((effect) => effect.type === "add-item"),
    );
    // Two keys, and they are different kinds of key: shoulders, or gills.
    expect(paying.map((choice) => choice.id)).toEqual(["haul", "dive"]);
    expect(
      paying.flatMap((choice) =>
        (choice.requirements ?? []).map((requirement) => requirement.type),
      ),
    ).toEqual(["stat", "enhancement"]);
    for (const choice of paying) {
      expect(choice.requirements?.length, choice.id).toBe(1);
      expect(choice.ifUnavailable, choice.id).toBe("disabled");
      expect(choice.target, choice.id).toBe("fq-cage-open");
    }
    // And there is always a way to walk away from it.
    expect(
      (cage?.choices ?? []).some((choice) =>
        (choice.effects ?? []).some((effect) => effect.type === "end"),
      ),
    ).toBe(true);
  });

  it("gives the diver a line only another diver can ask for", () => {
    const gated = (nodesById.get("fq-diver")?.choices ?? []).filter(
      (choice) => (choice.requirements ?? []).length > 0,
    );
    expect(gated.map((choice) => choice.id)).toEqual(["gills-read"]);
    expect(gated[0]?.requirements).toEqual([
      { type: "enhancement", itemId: "cyb-silt-gills" },
    ]);
    expect(gated[0]?.ifUnavailable).toBe("disabled");
  });

  it("never traps the player on a node", () => {
    for (const node of quaysArc.nodes) {
      const canEnd = node.choices.some((choice) =>
        (choice.effects ?? []).some(
          (effect) => effect.type === "end" || effect.type === "travel",
        ),
      );
      const canMoveOn = node.choices.some((choice) => choice.target);
      expect(canEnd || canMoveOn, `node ${node.id} traps the player`).toBe(true);
    }
  });
});

describe("the quays' staged encounter", () => {
  it("registers a fight on the district's own arena, unused by the story", () => {
    const encounter = getEncounter("enc-quays-salvage");
    expect(encounter?.arenaMapId).toBe("quays-walkway-arena");
    const started = storyArcs.flatMap((arc) =>
      arc.nodes.flatMap((node) =>
        node.choices.flatMap((choice) =>
          (choice.effects ?? []).flatMap((effect) =>
            effect.type === "start-combat" ? [effect.encounterId] : [],
          ),
        ),
      ),
    );
    // Authored ahead of the beat that will use it: no choice anywhere in
    // the game starts it yet, and the map lint still holds it to every
    // rule a live arena obeys.
    expect(started).not.toContain("enc-quays-salvage");
  });
});
