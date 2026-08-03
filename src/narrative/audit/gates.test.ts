import { describe, expect, it } from "vitest";
import { STAT_HARD_CAP } from "../../character/stats";
import { REPUTATION_MAX } from "../../data/factions";
import type { Requirement } from "../types";
import type { GateSource } from "./content";
import { fixtureGateWorld } from "./fixtures";
import {
  auditGateSatisfiability,
  defaultGateWorld,
  flagFacts,
  standingCeilings,
  statCeilings,
} from "./gates";

/** One fixture gate, so each case reads as the requirement it is about. */
function gate(...requirements: Requirement[]): GateSource[] {
  return [{ source: "fixture:gate", where: "node/choice", requirements }];
}

function auditOne(...requirements: Requirement[]) {
  return auditGateSatisfiability(gate(...requirements), fixtureGateWorld);
}

describe("flag gates", () => {
  it("passes a gate on a flag something writes, at a value it writes", () => {
    expect(auditOne({ type: "flag-equals", key: "b-flag", value: "written" })).toEqual(
      [],
    );
  });

  it("fails a gate on a flag nothing writes", () => {
    expect(auditOne({ type: "flag-set", key: "b-never" })).toEqual([
      expect.objectContaining({
        code: "unwritten-flag",
        severity: "error",
        subject: "b-never",
      }),
    ]);
  });

  it("fails a gate on a value nothing writes, and names the values that are", () => {
    expect(auditOne({ type: "flag-equals", key: "b-flag", value: "wrytten" })).toEqual([
      expect.objectContaining({
        code: "unwritten-flag-value",
        detail: expect.stringContaining("written"),
      }),
    ]);
  });

  it("fails a count gate past the highest figure anything writes", () => {
    expect(auditOne({ type: "flag-at-least", key: "b-count", value: 9 })).toEqual([
      expect.objectContaining({ code: "unreachable-flag-value", subject: "b-count" }),
    ]);
    expect(auditOne({ type: "flag-at-least", key: "b-count", value: 2 })).toEqual([]);
  });

  it("leaves a count gate alone when an increment can climb to it", () => {
    const world = {
      ...fixtureGateWorld,
      writes: [{ key: "b-tally", increment: 1, source: "fixture" }],
    };
    expect(
      auditGateSatisfiability(
        gate({ type: "flag-at-least", key: "b-tally", value: 40 }),
        world,
      ),
    ).toEqual([]);
  });

  it("warns that a gate on an unwritten flag being unset is always open", () => {
    expect(auditOne({ type: "flag-unset", key: "b-never" })).toEqual([
      expect.objectContaining({ code: "vacuous-gate", severity: "warning" }),
    ]);
  });
});

describe("flagFacts", () => {
  it("folds every writer of a key into one record", () => {
    const facts = flagFacts([
      { key: "k", value: "a", source: "one" },
      { key: "k", value: "b", source: "two" },
      { key: "n", value: 3, source: "three" },
    ]);
    expect([...(facts.get("k")?.values ?? [])]).toEqual(["a", "b"]);
    expect(facts.get("n")?.maxNumeric).toBe(3);
    expect(facts.get("k")?.open).toBe(false);
  });
});

describe("stat, item, party, and standing gates", () => {
  it("fails a stat gate above the best a character could ever present", () => {
    expect(auditOne({ type: "stat", stat: "body", value: 15 })).toEqual([
      expect.objectContaining({ code: "unreachable-stat", subject: "body" }),
    ]);
    expect(auditOne({ type: "stat", stat: "body", value: 14 })).toEqual([]);
  });

  it("warns about a gate on an item nothing hands out", () => {
    expect(auditOne({ type: "item", itemId: "itm-nowhere" })).toEqual([
      expect.objectContaining({ code: "ungrantable-item", severity: "warning" }),
    ]);
    expect(auditOne({ type: "item", itemId: "itm-on-a-shelf" })).toEqual([]);
  });

  it("fails a gate on somebody no beat recruits", () => {
    expect(auditOne({ type: "companion", companionId: "a-stranger" })).toEqual([
      expect.objectContaining({ code: "unrecruitable-companion" }),
    ]);
    expect(auditOne({ type: "companion", companionId: "somebody-real" })).toEqual([]);
  });

  it("reads an at-most loyalty gate as open to somebody never met", () => {
    expect(
      auditOne({
        type: "loyalty",
        companionId: "a-stranger",
        value: 0,
        mode: "at-most",
      }),
    ).toEqual([]);
    expect(auditOne({ type: "loyalty", companionId: "a-stranger", value: 4 })).toEqual([
      expect.objectContaining({ code: "unrecruitable-companion" }),
    ]);
  });

  it("fails a gate on a tag no background and no outfit carries", () => {
    expect(auditOne({ type: "background", tag: "astronaut" })).toEqual([
      expect.objectContaining({ code: "unknown-background-tag", subject: "astronaut" }),
    ]);
    expect(auditOne({ type: "background", tag: "street" })).toEqual([]);
  });

  it("warns about a standing gate above everything the swings add up to", () => {
    expect(
      auditOne({ type: "reputation", factionId: "auric", value: 80 }),
    ).toEqual([
      expect.objectContaining({ code: "unreachable-standing", subject: "auric" }),
    ]);
    // The other side of the same gate is opened by standing still.
    expect(
      auditOne({ type: "reputation", factionId: "auric", value: 80, mode: "at-most" }),
    ).toEqual([]);
  });
});

describe("the real game's ceilings", () => {
  it("puts every stat ceiling at or above the advancement hard cap", () => {
    const ceiling = statCeilings();
    for (const [stat, value] of Object.entries(ceiling)) {
      expect(value, stat).toBeGreaterThanOrEqual(STAT_HARD_CAP);
    }
  });

  it("keeps every standing ceiling inside the scale", () => {
    for (const [faction, value] of Object.entries(standingCeilings())) {
      expect(value, faction).toBeGreaterThan(0);
      expect(value, faction).toBeLessThanOrEqual(REPUTATION_MAX);
    }
  });

  it("gathers a world with real catalogs behind it", () => {
    const world = defaultGateWorld();
    expect(world.grantableItems.size).toBeGreaterThan(5);
    expect(world.recruitableCompanions.size).toBeGreaterThan(0);
    expect(world.backgroundTags.has("street")).toBe(true);
    expect(world.writes.length).toBeGreaterThan(50);
  });
});
