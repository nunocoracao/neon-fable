import { describe, expect, it } from "vitest";
import type { Choice, Requirement } from "../../narrative/types";
import { getEnding } from "../endings";
import { act3Arc } from "./act3";

/**
 * Content-shape assertions for the finale: endgame scale, four final
 * endings that all resolve as `final` in the ending content, entry
 * gating on Act 2's recorded outcomes, branching on BOTH act1-outcome
 * and act2-outcome, a fully non-combat crown resolution behind steep
 * gates, and the ally/betrayal payoff hooks. Graph soundness is covered
 * by validate.test.ts over all arcs; route behavior by
 * act3.walkthrough.test.ts.
 */

const allChoices: Array<{ nodeId: string; choice: Choice }> =
  act3Arc.nodes.flatMap((node) =>
    node.choices.map((choice) => ({ nodeId: node.id, choice })),
  );

const allRequirements: Requirement[] = allChoices.flatMap(
  ({ choice }) => choice.requirements ?? [],
);

describe("act3 arc shape", () => {
  it("is a focused endgame of at least 25 nodes", () => {
    expect(act3Arc.nodes.length).toBeGreaterThanOrEqual(25);
  });

  it("offers four distinct game endings, all final, all with epilogue text", () => {
    const endingIds = allChoices.flatMap(({ choice }) =>
      (choice.effects ?? []).flatMap((e) =>
        e.type === "end" && e.endingId ? [e.endingId] : [],
      ),
    );
    expect(new Set(endingIds)).toEqual(
      new Set([
        "ending-commons",
        "ending-regency",
        "ending-freehold",
        "ending-ghost",
      ]),
    );
    for (const id of endingIds) {
      const ending = getEnding(id);
      expect(ending, `ending ${id} missing content`).toBeDefined();
      expect(ending?.final, `ending ${id} not marked final`).toBe(true);
    }
  });

  it("marks every ending complete: outcome, ending flag, and game-complete travel together", () => {
    const sealers = allChoices.filter(({ choice }) =>
      (choice.effects ?? []).some(
        (e) => e.type === "set-flag" && e.key === "act3-outcome",
      ),
    );
    expect(sealers.length).toBe(4);
    for (const { choice } of sealers) {
      const effects = choice.effects ?? [];
      const flagValue = (key: string): unknown =>
        effects.find((e) => e.type === "set-flag" && e.key === key && "value" in e)
          ?.["value" as never];
      expect(flagValue("act3-complete")).toBe(true);
      expect(flagValue("game-complete")).toBe(true);
      const outcome = flagValue("act3-outcome");
      expect(flagValue("ending")).toBe(`ending-${String(outcome)}`);
      const end = effects.find((e) => e.type === "end");
      expect(end && end.type === "end" && end.endingId).toBe(
        `ending-${String(outcome)}`,
      );
    }
  });

  it("gates every opening on the recorded act2-outcome", () => {
    const openings: Array<[string, string]> = [
      ["a3-charter-summons", "charter"],
      ["a3-voss-summons", "takeover"],
      ["a3-sever-warning", "severance"],
    ];
    const entry = act3Arc.nodes.find((n) => n.id === act3Arc.entryNodeId)!;
    for (const [target, outcome] of openings) {
      const choice = entry.choices.find((c) => c.target === target);
      expect(choice, `no entry choice into ${target}`).toBeDefined();
      expect(choice?.requirements).toContainEqual({
        type: "flag-equals",
        key: "act2-outcome",
        value: outcome,
      });
    }
  });

  it("branches on act1-outcome inside the finale, not just act2-outcome", () => {
    const act1Gates = allRequirements.flatMap((r) =>
      r.type === "flag-equals" && r.key === "act1-outcome" ? [r.value] : [],
    );
    expect(new Set(act1Gates)).toEqual(new Set(["court", "voss", "broadcast"]));
  });

  it("keys the Registry Gate on the warrant, in both directions", () => {
    const gate = act3Arc.nodes.find((n) => n.id === "a3-gate")!;
    const wantedGates = gate.choices.flatMap((c) =>
      (c.requirements ?? []).flatMap((r) =>
        r.type === "flag-equals" && r.key === "wanted-by-auric" ? [r.value] : [],
      ),
    );
    expect(wantedGates).toContain(false);
  });

  it("offers a fully non-combat crown resolution behind steep gates", () => {
    const door = act3Arc.nodes.find((n) => n.id === "a3-crown-door")!;
    const commune = door.choices.find((c) => c.id === "commune")!;
    expect(
      (commune.effects ?? []).some((e) => e.type === "start-combat"),
    ).toBe(false);
    const kinds = new Set((commune.requirements ?? []).map((r) => r.type));
    expect(kinds).toEqual(new Set(["flag-equals", "stat", "enhancement"]));
    // The other three crown routes are all battles.
    const battles = door.choices.filter((c) =>
      (c.effects ?? []).some((e) => e.type === "start-combat"),
    );
    expect(battles.length).toBe(3);
  });

  it("brings allies, betrayals, and Act 2 side flags back into play", () => {
    const keys = new Set(
      allRequirements.flatMap((r) => (r.type === "flag-equals" ? [r.key] : [])),
    );
    for (const key of [
      "ally-cistern-court",
      "betrayed-voss",
      "hex-exchange",
      "crew-freed",
      "crew-warned",
      "flick-friend",
      "lin-debt",
      "voss-confronted",
      "undercroft-charter",
      "voss-ascendant",
      "steps-independent",
    ]) {
      expect(keys.has(key), `flag ${key} never read in act3`).toBe(true);
    }
  });

  it("gates each ending on a different act-2 legacy, so no single run sees all four", () => {
    const keysNode = act3Arc.nodes.find((n) => n.id === "a3-keys")!;
    const gates = new Map(
      keysNode.choices.map((c) => {
        const req = (c.requirements ?? []).find(
          (r) => r.type === "flag-equals",
        );
        return [c.id, req && req.type === "flag-equals" ? req.key : null];
      }),
    );
    expect(gates).toEqual(
      new Map([
        ["commons", "undercroft-charter"],
        ["regency", "voss-ascendant"],
        ["freehold", "steps-independent"],
        ["ghost", "hex-exchange"],
      ]),
    );
  });

  it("opens the tower's own floors off the concourse, both ways", () => {
    const arrival = act3Arc.nodes.find((n) => n.id === "a3-spire-arrival")!;
    expect(arrival.choices.map((c) => c.target)).toContain("a3-exec-lift");
    const up = act3Arc.nodes.find((n) => n.id === "a3-exec-lift")!;
    const rides = up.choices.filter((c) =>
      (c.effects ?? []).some(
        (e) => e.type === "travel" && e.mapId === "auric-executive",
      ),
    );
    // Two ways up — the chair's own override, and simply trying it.
    expect(rides).toHaveLength(2);
    for (const ride of rides) expect(ride.target).toBe("a3-exec-floor");
    const down = act3Arc.nodes.find((n) => n.id === "a3-exec-descend")!;
    expect(
      down.choices.flatMap((c) =>
        (c.effects ?? []).flatMap((e) => (e.type === "travel" ? [e.mapId] : [])),
      ),
    ).toEqual(["auric-spire"]);
  });

  it("gives the floor detail three ways past, one of them the tower's fight", () => {
    const post = act3Arc.nodes.find((n) => n.id === "a3-exec-checkpoint")!;
    const past = post.choices.filter((c) =>
      (c.effects ?? []).some(
        (e) => e.type === "set-flag" && e.key === "exec-cleared",
      ),
    );
    expect(past.map((c) => c.id)).toEqual(["override", "talk", "fight"]);
    const battles = past.flatMap((c) =>
      (c.effects ?? []).flatMap((e) =>
        e.type === "start-combat" ? [e.encounterId] : [],
      ),
    );
    expect(battles).toEqual(["enc-exec-security"]);
  });

  it("seals the strongroom behind the floor detail, and the Warden behind that", () => {
    const floor = act3Arc.nodes.find((n) => n.id === "a3-exec-floor")!;
    const way = floor.choices.find((c) => c.target === "a3-exec-strongroom")!;
    // The floor reads as one graph in one order: nothing at the far end
    // is offered until the aisle is yours.
    expect(way.requirements).toContainEqual({
      type: "flag-equals",
      key: "exec-cleared",
      value: true,
    });
    const room = act3Arc.nodes.find((n) => n.id === "a3-exec-strongroom")!;
    // Two ways at it and one way past it, in the checkpoint's own shape:
    // a Tech gate that buys an advantage, the plain approach, and out.
    expect(room.choices.map((c) => c.id)).toEqual(["bleed", "wake", "back"]);
    const primed = room.choices.find((c) => c.id === "bleed")!;
    expect(primed.requirements).toContainEqual({
      type: "stat",
      stat: "tech",
      value: 7,
    });
    // Both approaches reach the same fight — the gate softens it, it
    // does not skip it.
    for (const id of ["bleed", "wake"]) {
      expect(room.choices.find((c) => c.id === id)?.target).toBe(
        "a3-exec-warden",
      );
    }
    const fight = act3Arc.nodes.find((n) => n.id === "a3-exec-warden")!;
    expect(
      fight.choices.flatMap((c) =>
        (c.effects ?? []).flatMap((e) =>
          e.type === "start-combat" ? [e.encounterId] : [],
        ),
      ),
    ).toEqual(["enc-exec-warden"]);
    expect(fight.choices[0]?.target).toBe("a3-exec-strongroom-open");
  });

  it("keeps the directors' own paperwork behind getting past them", () => {
    const desk = act3Arc.nodes.find((n) => n.id === "a3-exec-desk")!;
    const sheet = desk.choices.find((c) => c.target === "a3-exec-sheet")!;
    expect(sheet.requirements).toContainEqual({
      type: "flag-equals",
      key: "exec-cleared",
      value: true,
    });
    expect(sheet.requirements).toContainEqual({
      type: "stat",
      stat: "tech",
      value: 6,
    });
  });

  it("stays optional: the floor changes what you know, not what you can do", () => {
    // Everything up the riser is a side trip off the finale's spine, so
    // nothing outside it may gate on having been there. The one thing
    // the floor hands the rest of the act is what the directors wrote
    // down about the engine — which opens a scene, never a route.
    const floorNodes = new Set([
      "a3-exec-lift",
      "a3-exec-floor",
      "a3-exec-checkpoint",
      "a3-exec-cleared",
      "a3-exec-desk",
      "a3-exec-sheet",
      "a3-exec-minutes",
      "a3-exec-cache",
      "a3-exec-strongroom",
      "a3-exec-warden",
      "a3-exec-strongroom-open",
      "a3-exec-descend",
      "a3-security",
      "a3-security-risers",
    ]);
    const setUpstairs = new Set(
      allChoices
        .filter(({ nodeId }) => floorNodes.has(nodeId))
        .flatMap(({ choice }) =>
          (choice.effects ?? []).flatMap((e) =>
            e.type === "set-flag" ? [e.key] : [],
          ),
        ),
    );
    expect(setUpstairs).toContain("exec-cleared");
    const readDownstairs = allChoices
      .filter(({ nodeId }) => !floorNodes.has(nodeId))
      .flatMap(({ choice }) =>
        (choice.requirements ?? []).flatMap((r) =>
          r.type === "flag-equals" && setUpstairs.has(r.key) ? [r.key] : [],
        ),
      );
    expect([...new Set(readDownstairs)]).toEqual(["locus-known"]);
  });

  it("uses every gate variety somewhere in the finale", () => {
    const kinds = new Set(allRequirements.map((r) => r.type));
    for (const kind of [
      "stat",
      "enhancement",
      "credits",
      "flag-equals",
      "background",
    ] as const) {
      expect(kinds.has(kind), `no ${kind} requirement in act3`).toBe(true);
    }
  });
});
