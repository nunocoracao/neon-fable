import { describe, expect, it } from "vitest";
import { ACTS, FINAL_ACT, FIRST_ACT, actTitle, currentAct } from "./acts";
import { chapterGrants } from "./advancement";

/**
 * The act a run is in. Small, but load-bearing: vendor stock and a
 * counter's memory of an argument both turn over on it, so a chapter
 * flag renamed in one place and not the other would silently freeze
 * every shelf in the city.
 */

describe("currentAct", () => {
  it("starts a fresh run in the first act", () => {
    expect(currentAct({})).toBe(FIRST_ACT);
  });

  it("advances one past the last chapter finished", () => {
    expect(currentAct({ "act1-complete": true })).toBe(2);
    expect(currentAct({ "act1-complete": true, "act2-complete": true })).toBe(3);
  });

  it("never runs past the last chapter there is", () => {
    expect(
      currentAct({
        "act1-complete": true,
        "act2-complete": true,
        "act3-complete": true,
      }),
    ).toBe(FINAL_ACT);
  });

  it("reads a chapter flag written false as unfinished", () => {
    expect(currentAct({ "act1-complete": false })).toBe(1);
  });

  it("reads a skipped chapter off the furthest flag set", () => {
    // A save that only ever recorded act 2 (a debug jump, a legacy
    // save) still reads as being in act 3 rather than in act 1.
    expect(currentAct({ "act2-complete": true })).toBe(3);
  });
});

describe("the act table", () => {
  it("numbers its chapters from one, without gaps", () => {
    expect(ACTS.map((act) => act.act)).toEqual([1, 2, 3]);
  });

  it("names the same chapter flags the advancement grants read", () => {
    // Both systems key off the story's own completion flags; if a
    // chapter is renamed, this fails before anything goes quiet.
    for (const grant of chapterGrants) {
      expect(ACTS.map((act) => act.completeFlag)).toContain(grant.flag);
    }
  });

  it("titles a chapter it knows, and falls back on one it does not", () => {
    expect(actTitle(2)).toBe("The Cordon");
    expect(actTitle(9)).toBe("Act 9");
  });
});
