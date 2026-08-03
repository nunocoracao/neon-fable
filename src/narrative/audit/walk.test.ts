import { describe, expect, it } from "vitest";
import { createNewGame } from "../../state/gameState";
import { brokenArc, fixtureWrites, soundArc } from "./fixtures";
import { fuzzedStart, runWalks, unvisitedFindings } from "./walk";

const walkOptions = {
  writes: fixtureWrites,
  walks: 40,
  steps: 20,
  seed: 7,
};

describe("the fuzzed start state", () => {
  it("builds a character the game itself would build", () => {
    for (let seed = 0; seed < 12; seed++) {
      const state = fuzzedStart(seed, fixtureWrites);
      expect(state.player.name).toBe("Audit");
      // Starting gear is equipped at creation, so a line that could not
      // hold it would have thrown before getting here.
      expect(state.player.equipment.weapon).not.toBeNull();
      expect(state.credits).toBeGreaterThanOrEqual(0);
    }
  });

  it("only ever writes flags at values something writes", () => {
    const allowed = new Set(fixtureWrites.map((write) => String(write.value)));
    for (let seed = 0; seed < 20; seed++) {
      for (const value of Object.values(fuzzedStart(seed, fixtureWrites).flags)) {
        expect(allowed.has(String(value))).toBe(true);
      }
    }
  });

  it("is deterministic in its seed", () => {
    expect(fuzzedStart(99, fixtureWrites)).toEqual(fuzzedStart(99, fixtureWrites));
  });
});

describe("the random walk", () => {
  it("walks a sound arc without finding anything", () => {
    const report = runWalks({
      ...walkOptions,
      arcs: [soundArc],
      entries: [{ nodeId: "s-start", source: "fixture" }],
    });
    expect(report.findings).toEqual([]);
    expect(report.steps).toBeGreaterThan(0);
    expect([...report.visited].sort()).toEqual(["s-end", "s-start"]);
  });

  it("reports the choice that throws when it is taken", () => {
    const report = runWalks({
      ...walkOptions,
      walks: 200,
      arcs: [brokenArc],
      entries: [{ nodeId: "b-start", source: "fixture" }],
    });
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "walk-throw",
        severity: "error",
        where: "b-hub/b-throw",
      }),
    );
  });

  it("reports a state the game would refuse to load", () => {
    const report = runWalks({
      ...walkOptions,
      arcs: [soundArc],
      entries: [{ nodeId: "s-start", source: "fixture" }],
      // A run that is already broken before the first choice: the walk
      // is what notices, which is the point of validating after each.
      start: (seed) => ({
        ...createNewGame({ seed }),
        credits: Number.NaN,
      }),
    });
    expect(report.findings).toContainEqual(
      expect.objectContaining({ code: "walk-invalid-state" }),
    );
  });

  it("stops rather than reporting when a scene has nothing available", () => {
    // b-gated's two gates can never pass, so the walk simply ends there
    // — whether a node's gates are exhaustive is a static question.
    const report = runWalks({
      ...walkOptions,
      arcs: [brokenArc],
      entries: [{ nodeId: "b-gated", source: "fixture" }],
    });
    expect(report.findings).toEqual([]);
    expect([...report.visited]).toEqual(["b-gated"]);
  });

  it("is deterministic in its seed", () => {
    const options = {
      ...walkOptions,
      arcs: [brokenArc],
      entries: [{ nodeId: "b-start", source: "fixture" }],
    };
    const first = runWalks(options);
    const second = runWalks(options);
    expect(second.findings).toEqual(first.findings);
    expect([...second.visited]).toEqual([...first.visited]);
  });
});

describe("walk coverage", () => {
  it("names every node no walk stood on", () => {
    expect(unvisitedFindings([soundArc], new Set(["s-start"]))).toEqual([
      expect.objectContaining({
        code: "unvisited-node",
        severity: "warning",
        subject: "s-end",
      }),
    ]);
  });

  it("says nothing when the walks covered the graph", () => {
    expect(unvisitedFindings([soundArc], new Set(["s-start", "s-end"]))).toEqual([]);
  });
});
