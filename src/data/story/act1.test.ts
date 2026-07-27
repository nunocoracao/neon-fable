import { describe, expect, it } from "vitest";
import type { Choice, Requirement } from "../../narrative/types";
import { getEnding } from "../endings";
import { act1Arc } from "./act1";

/**
 * Content-shape assertions for Act 1: chapter scale, the three outcome
 * endings, and that every gate variety (background, stat, item,
 * enhancement, credits, flag) actually appears in the authored graph.
 * Graph soundness itself is covered by validate.test.ts over all arcs;
 * route behavior by act1.walkthrough.test.ts.
 */

const allChoices: Array<{ nodeId: string; choice: Choice }> =
  act1Arc.nodes.flatMap((node) =>
    node.choices.map((choice) => ({ nodeId: node.id, choice })),
  );

const allRequirements: Requirement[] = allChoices.flatMap(
  ({ choice }) => choice.requirements ?? [],
);

describe("act1 arc shape", () => {
  it("is a full chapter of at least 40 nodes", () => {
    expect(act1Arc.nodes.length).toBeGreaterThanOrEqual(40);
  });

  it("offers three distinct chapter endings, all with epilogue content", () => {
    const endingIds = allChoices.flatMap(({ choice }) =>
      (choice.effects ?? []).flatMap((e) =>
        e.type === "end" && e.endingId?.startsWith("act1-") ? [e.endingId] : [],
      ),
    );
    expect(new Set(endingIds)).toEqual(
      new Set(["act1-court", "act1-voss", "act1-broadcast"]),
    );
    for (const id of endingIds) {
      expect(getEnding(id), `ending ${id} missing epilogue`).toBeDefined();
    }
  });

  it("records every chapter outcome as an act1-outcome flag for Act 2", () => {
    const outcomes = allChoices.flatMap(({ choice }) =>
      (choice.effects ?? []).flatMap((e) =>
        e.type === "set-flag" && e.key === "act1-outcome" ? [e.value] : [],
      ),
    );
    expect(new Set(outcomes)).toEqual(new Set(["court", "voss", "broadcast"]));
  });

  it("gives each background an exclusive gated scene", () => {
    const tags = allRequirements.flatMap((r) =>
      r.type === "background" ? [r.tag] : [],
    );
    expect(new Set(tags)).toEqual(new Set(["street", "corp", "net"]));
  });

  it("uses every gate variety somewhere reachable in the chapter", () => {
    const kinds = new Set(allRequirements.map((r) => r.type));
    for (const kind of [
      "stat",
      "item",
      "enhancement",
      "credits",
      "flag-equals",
      "background",
    ] as const) {
      expect(kinds.has(kind), `no ${kind} requirement in act1`).toBe(true);
    }
  });

  it("keeps faction commitment mutually exclusive via act1-side gating", () => {
    // Every choice that commits a side requires the side to still be open.
    for (const { nodeId, choice } of allChoices) {
      const commits = (choice.effects ?? []).some(
        (e) =>
          e.type === "set-flag" &&
          e.key === "act1-side" &&
          (e.value === "court" || e.value === "voss"),
      );
      if (!commits) continue;
      expect(
        (choice.requirements ?? []).some(
          (r) =>
            r.type === "flag-equals" &&
            r.key === "act1-side" &&
            r.value === "open",
        ),
        `commit choice "${choice.id}" on "${nodeId}" not gated on open side`,
      ).toBe(true);
    }
  });

  it("reaches combat through at least three distinct encounters", () => {
    const encounterIds = allChoices.flatMap(({ choice }) =>
      (choice.effects ?? []).flatMap((e) =>
        e.type === "start-combat" ? [e.encounterId] : [],
      ),
    );
    expect(new Set(encounterIds).size).toBeGreaterThanOrEqual(3);
  });
});
