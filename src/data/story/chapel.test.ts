import { describe, expect, it } from "vitest";
import { requireMap } from "../maps";
import { HUB_MAP_ID } from "../maps";
import { RESTYLE_PRICE } from "../stylist";
import { chapelArc } from "./chapel";
import { storyArcs } from "./index";

/**
 * Content-shape assertions for the Chrome Chapel service arc. Graph
 * soundness is covered by validate.test.ts over all registered arcs;
 * here we pin what makes the chapel work: the open-stylist choices, the
 * fee quoted to the player, and the hub NPC that opens the door.
 */

const allChoices = chapelArc.nodes.flatMap((node) =>
  node.choices.map((choice) => ({ nodeId: node.id, choice })),
);

describe("chrome chapel arc", () => {
  it("is registered so map interactions can find its nodes", () => {
    expect(storyArcs).toContain(chapelArc);
  });

  it("offers the chair from the door and again after a session", () => {
    const stylistChoices = allChoices.filter(({ choice }) =>
      (choice.effects ?? []).some((e) => e.type === "open-stylist"),
    );
    expect(stylistChoices.map((c) => c.nodeId)).toEqual([
      "chapel-door",
      "chapel-blessing",
    ]);
    // Each chair choice resumes dialogue after the screen closes.
    for (const { choice } of stylistChoices) {
      expect(choice.target).toBeDefined();
    }
  });

  it("quotes the data-defined fee in every chair choice's label", () => {
    for (const { choice } of allChoices) {
      if (!(choice.effects ?? []).some((e) => e.type === "open-stylist")) {
        continue;
      }
      expect(choice.label).toContain(`(${RESTYLE_PRICE} cr)`);
    }
  });

  it("always lets the player walk away without sitting down", () => {
    for (const node of chapelArc.nodes) {
      const canEnd = node.choices.some((choice) =>
        (choice.effects ?? []).some((e) => e.type === "end"),
      );
      const canMoveOn = node.choices.some((choice) => choice.target);
      expect(canEnd || canMoveOn, `node ${node.id} traps the player`).toBe(
        true,
      );
    }
  });

  it("is reachable from the hub's stylist NPC", () => {
    const hub = requireMap(HUB_MAP_ID);
    const stylist = hub.interactables.find((i) => i.id === "chrome-chapel");
    expect(stylist).toBeDefined();
    expect(stylist?.interaction).toEqual({
      kind: "dialogue",
      nodeId: chapelArc.entryNodeId,
    });
  });
});
