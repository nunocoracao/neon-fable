import { describe, expect, it } from "vitest";
import type { Choice, Requirement } from "../../narrative/types";
import { getEnding } from "../endings";
import { act2Arc } from "./act2";

/**
 * Content-shape assertions for Act 2: chapter scale, the three outcome
 * endings, entry gating on Act 1's recorded outcomes, and that every gate
 * variety (background, stat, item, enhancement, credits, flag) actually
 * appears in the authored graph. Graph soundness itself is covered by
 * validate.test.ts over all arcs; route behavior by
 * act2.walkthrough.test.ts.
 */

const allChoices: Array<{ nodeId: string; choice: Choice }> =
  act2Arc.nodes.flatMap((node) =>
    node.choices.map((choice) => ({ nodeId: node.id, choice })),
  );

const allRequirements: Requirement[] = allChoices.flatMap(
  ({ choice }) => choice.requirements ?? [],
);

describe("act2 arc shape", () => {
  it("is a full chapter of at least 40 nodes", () => {
    expect(act2Arc.nodes.length).toBeGreaterThanOrEqual(40);
  });

  it("offers three distinct chapter endings, all with epilogue content", () => {
    const endingIds = allChoices.flatMap(({ choice }) =>
      (choice.effects ?? []).flatMap((e) =>
        e.type === "end" && e.endingId?.startsWith("act2-") ? [e.endingId] : [],
      ),
    );
    expect(new Set(endingIds)).toEqual(
      new Set(["act2-charter", "act2-takeover", "act2-severance"]),
    );
    for (const id of endingIds) {
      expect(getEnding(id), `ending ${id} missing epilogue`).toBeDefined();
    }
  });

  it("records every chapter outcome as an act2-outcome flag for the final act", () => {
    const outcomes = allChoices.flatMap(({ choice }) =>
      (choice.effects ?? []).flatMap((e) =>
        e.type === "set-flag" && e.key === "act2-outcome" ? [e.value] : [],
      ),
    );
    expect(new Set(outcomes)).toEqual(
      new Set(["charter", "takeover", "severance"]),
    );
    for (const { choice } of allChoices) {
      const effects = choice.effects ?? [];
      const setsOutcome = effects.some(
        (e) => e.type === "set-flag" && e.key === "act2-outcome",
      );
      if (!setsOutcome) continue;
      expect(
        effects.some(
          (e) =>
            e.type === "set-flag" && e.key === "act2-complete" && e.value === true,
        ),
        `choice "${choice.id}" records an outcome without act2-complete`,
      ).toBe(true);
    }
  });

  it("gates every Act 1 branch opening on the recorded act1-outcome", () => {
    const openings: Array<[string, string]> = [
      ["a2-court-runner", "court"],
      ["a2-voss-drone", "voss"],
      ["a2-lone-watch", "broadcast"],
    ];
    const entry = act2Arc.nodes.find((n) => n.id === act2Arc.entryNodeId)!;
    for (const [target, outcome] of openings) {
      const choice = entry.choices.find((c) => c.target === target);
      expect(choice, `no entry choice into ${target}`).toBeDefined();
      expect(choice?.requirements).toContainEqual({
        type: "flag-equals",
        key: "act1-outcome",
        value: outcome,
      });
    }
  });

  it("keys the climax battle variants on the branch approach taken", () => {
    const coreDoor = act2Arc.nodes.find((n) => n.id === "a2-core-door")!;
    const variants = coreDoor.choices.flatMap((choice) => {
      const encounter = (choice.effects ?? []).find(
        (e) => e.type === "start-combat",
      );
      if (!encounter || encounter.type !== "start-combat") return [];
      const approach = (choice.requirements ?? []).find(
        (r) => r.type === "flag-equals" && r.key === "a2-approach",
      );
      expect(
        approach,
        `climax choice "${choice.id}" not gated on a2-approach`,
      ).toBeDefined();
      return [
        [approach!.type === "flag-equals" && approach!.value, encounter.encounterId] as const,
      ];
    });
    expect(new Map(variants)).toEqual(
      new Map([
        ["court", "enc-cordon-court"],
        ["voss", "enc-cordon-voss"],
        ["lone", "enc-cordon-lone"],
      ]),
    );
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
      expect(kinds.has(kind), `no ${kind} requirement in act2`).toBe(true);
    }
  });

  it("brings Act 1 consequence flags back into play", () => {
    const keys = new Set(
      allRequirements.flatMap((r) => (r.type === "flag-equals" ? [r.key] : [])),
    );
    for (const key of [
      "ally-cistern-court",
      "ally-voss",
      "betrayed-voss",
      "betrayed-court",
      "sable-burned",
      "voss-exposed",
    ]) {
      expect(keys.has(key), `act1 flag ${key} never read in act2`).toBe(true);
    }
  });

  it("offers tier-2 gear through its shops and rewards, gated on cost or stats", () => {
    const grants = new Map(
      allChoices.flatMap(({ choice }) =>
        (choice.effects ?? []).flatMap((e) =>
          e.type === "add-item" ? [[e.itemId, choice] as const] : [],
        ),
      ),
    );
    // Patch's case sells the Torsion Frame at a steep credit price.
    const frame = grants.get("cyb-torsion-frame");
    expect(frame?.requirements).toEqual([{ type: "credits", value: 400 }]);
    // The vent-crew vault yields the Spindle Projector behind a Tech gate.
    const projector = grants.get("wpn-spindle-projector");
    expect(projector?.requirements).toEqual([
      { type: "stat", stat: "tech", value: 6 },
    ]);
  });

  it("reaches combat through at least five distinct encounters", () => {
    const encounterIds = allChoices.flatMap(({ choice }) =>
      (choice.effects ?? []).flatMap((e) =>
        e.type === "start-combat" ? [e.encounterId] : [],
      ),
    );
    expect(new Set(encounterIds).size).toBeGreaterThanOrEqual(5);
  });
});
