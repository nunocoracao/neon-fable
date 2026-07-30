import { describe, expect, it } from "vitest";
import { HUB_MAP_ID, requireMap } from "../maps";
import { storyArcs } from "./index";
import { marketArc } from "./market";

/**
 * Content-shape assertions for the Vertical Market district. Graph
 * soundness is covered by validate.test.ts over every registered arc and
 * the map itself by the lint in ../maps.test.ts; what is pinned here is
 * the district's wiring — both ways through the door, every fixture on
 * the boards reachable in dialogue as well as on foot, and the promise
 * this arc makes to later work: it touches nothing the acts read.
 */

const nodesById = new Map(marketArc.nodes.map((node) => [node.id, node]));
const allChoices = marketArc.nodes.flatMap((node) =>
  node.choices.map((choice) => ({ nodeId: node.id, choice })),
);

const travelChoices = allChoices.flatMap(({ nodeId, choice }) =>
  (choice.effects ?? []).flatMap((effect) =>
    effect.type === "travel" ? [{ nodeId, mapId: effect.mapId }] : [],
  ),
);

describe("vertical market arc", () => {
  it("is registered so map interactions can find its nodes", () => {
    expect(storyArcs).toContain(marketArc);
  });

  it("walks both ways: the hub gate up, the Cinderway stair back down", () => {
    expect(travelChoices).toEqual([
      { nodeId: "vm-gate", mapId: "vertical-market" },
      { nodeId: "vm-stair", mapId: "cinder-plaza" },
    ]);
  });

  it("hangs the gate on the hub and the stair on the market, each an exit", () => {
    const hub = requireMap(HUB_MAP_ID);
    const gate = hub.interactables.find((i) => i.id === "market-gate");
    expect(gate?.interaction).toEqual({
      kind: "dialogue",
      nodeId: marketArc.entryNodeId,
    });
    expect(gate?.exit).toEqual({ mapId: "vertical-market" });

    const market = requireMap("vertical-market");
    const stair = market.interactables.find((i) => i.id === "market-stair");
    expect(stair?.interaction).toEqual({ kind: "dialogue", nodeId: "vm-stair" });
    expect(stair?.exit).toEqual({ mapId: "cinder-plaza", entryId: "south-road" });
  });

  it("opens every fixture on the boards from the arrival beat too", () => {
    // Each of the market's interactables opens a node of this arc, and
    // the arrival beat offers the same three by name — so a player who
    // rode the dialogue in never has to guess what is worth walking to.
    const market = requireMap("vertical-market");
    const opened = market.interactables.map((i) =>
      i.interaction.kind === "dialogue" ? i.interaction.nodeId : "",
    );
    expect(opened.sort()).toEqual([
      "vm-broker",
      "vm-fixer",
      "vm-stair",
      "vm-stash",
    ]);
    const arrivalTargets = (nodesById.get("vm-arrival")?.choices ?? []).flatMap(
      (choice) => (choice.target ? [choice.target] : []),
    );
    expect(arrivalTargets.sort()).toEqual([
      "vm-broker",
      "vm-fixer",
      "vm-stair",
      "vm-stash",
    ]);
  });

  it("keeps its colour self-contained: no act flags, no combat, no items out", () => {
    // The broker's board and the fixer's contracts are later work. This
    // arc may only leave `market-known` behind, and the locker's own
    // record of how it was opened.
    const flags = allChoices.flatMap(({ choice }) =>
      (choice.effects ?? []).flatMap((effect) =>
        effect.type === "set-flag" || effect.type === "increment-flag"
          ? [effect.key]
          : [],
      ),
    );
    expect([...new Set(flags)].sort()).toEqual(["market-known", "market-locker"]);
    for (const { choice } of allChoices) {
      for (const effect of choice.effects ?? []) {
        expect(effect.type, `${choice.id}`).not.toBe("start-combat");
        expect(effect.type, `${choice.id}`).not.toBe("remove-item");
      }
      for (const requirement of choice.requirements ?? []) {
        // Gating is on the character, never on story state, so the
        // district plays the same in every act and on a fresh run.
        expect(requirement.type, `${choice.id}`).toBe("stat");
      }
    }
  });

  it("pays the locker out only to a character who can open it", () => {
    const locker = nodesById.get("vm-stash");
    const paying = (locker?.choices ?? []).filter(({ effects }) =>
      (effects ?? []).some((effect) => effect.type === "add-item"),
    );
    expect(paying.map((choice) => choice.id)).toEqual(["force", "pick"]);
    for (const choice of paying) {
      expect(choice.requirements?.length, choice.id).toBe(1);
      expect(choice.ifUnavailable, choice.id).toBe("disabled");
      expect(choice.target, choice.id).toBe("vm-stash-open");
    }
    // And there is always a way to walk away from it.
    expect(
      (locker?.choices ?? []).some((choice) =>
        (choice.effects ?? []).some((effect) => effect.type === "end"),
      ),
    ).toBe(true);
  });

  it("never traps the player on a node", () => {
    for (const node of marketArc.nodes) {
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
