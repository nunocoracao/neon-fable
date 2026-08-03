import { describe, expect, it } from "vitest";
import { WIZARD_STEPS } from "../character/wizard";
import {
  COMBAT_HINT_BUDGET,
  getHint,
  hints,
  hintsFor,
  WIZARD_STEP_HELP,
  type HintTrigger,
} from "./hints";

/**
 * The hint catalog as content: every id unique, every line short enough
 * to read in passing, and every system that was promised a hint
 * actually having one. The rules that consume this are tested in
 * src/narrative/hints.test.ts.
 */

/**
 * Every trigger the screens cue. Written out rather than derived from
 * the catalog, so retiring the last hint of a system fails here instead
 * of quietly leaving a system untaught.
 */
const TRIGGERS: readonly HintTrigger[] = [
  "explore",
  "interact",
  "combat-turn",
  "combat-ability",
  "injury",
  "static",
  "breach",
  "vendor",
];

describe("hint catalog", () => {
  it("has a unique id for every hint", () => {
    const ids = hints.map((hint) => hint.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every trigger the screens cue", () => {
    for (const trigger of TRIGGERS) {
      expect(hintsFor(trigger).length).toBeGreaterThan(0);
    }
  });

  it("cues no trigger the screens do not know about", () => {
    for (const hint of hints) {
      expect(TRIGGERS).toContain(hint.trigger);
    }
  });

  it("keeps every line short enough to read without stopping", () => {
    for (const hint of hints) {
      expect(hint.title.length).toBeGreaterThan(0);
      expect(hint.title.length).toBeLessThanOrEqual(24);
      expect(hint.text.length).toBeGreaterThan(0);
      // A chip is one sentence or two. Longer than this is a manual.
      expect(hint.text.length).toBeLessThanOrEqual(160);
    }
  });

  it("orders the action-bar tour so attack comes before flee", () => {
    const tour = hintsFor("combat-turn");
    // More than the budget, on purpose: the tour spreads over fights.
    expect(tour.length).toBeGreaterThan(COMBAT_HINT_BUDGET);
    const priorities = tour.map((hint) => hint.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
    expect(tour[0]?.id).toBe("hint-combat-attack");
  });

  it("gives every hint in one trigger a distinct priority", () => {
    for (const trigger of TRIGGERS) {
      const priorities = hintsFor(trigger).map((hint) => hint.priority);
      expect(new Set(priorities).size).toBe(priorities.length);
    }
  });

  it("looks a hint up by id, and refuses one that is not there", () => {
    expect(getHint("hint-move")?.trigger).toBe("explore");
    expect(getHint("nope")).toBeUndefined();
  });
});

describe("wizard helper copy", () => {
  it("covers every step of the wizard and no more", () => {
    expect(Object.keys(WIZARD_STEP_HELP).sort()).toEqual(
      [...WIZARD_STEPS].sort(),
    );
  });

  it("says something on every step", () => {
    for (const step of WIZARD_STEPS) {
      expect(WIZARD_STEP_HELP[step].length).toBeGreaterThan(20);
      expect(WIZARD_STEP_HELP[step].length).toBeLessThanOrEqual(160);
    }
  });
});
