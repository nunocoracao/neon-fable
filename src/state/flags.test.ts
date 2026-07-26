import { describe, expect, it } from "vitest";
import {
  checkFlag,
  clearFlag,
  getFlag,
  hasFlag,
  setFlag,
  type HasFlags,
} from "./flags";

function makeState(): HasFlags {
  return { flags: {} };
}

describe("flag helpers", () => {
  it("sets and gets boolean, number, and string flags", () => {
    const state = makeState();
    setFlag(state, "metFixer", true);
    setFlag(state, "credits", 120);
    setFlag(state, "faction", "lumen-cartel");
    expect(getFlag(state, "metFixer")).toBe(true);
    expect(getFlag(state, "credits")).toBe(120);
    expect(getFlag(state, "faction")).toBe("lumen-cartel");
  });

  it("returns undefined for unset flags", () => {
    expect(getFlag(makeState(), "nope")).toBeUndefined();
  });

  it("checkFlag is true only for truthy values", () => {
    const state = makeState();
    expect(checkFlag(state, "unset")).toBe(false);
    setFlag(state, "a", true);
    setFlag(state, "b", false);
    setFlag(state, "c", 0);
    setFlag(state, "d", "");
    setFlag(state, "e", "x");
    expect(checkFlag(state, "a")).toBe(true);
    expect(checkFlag(state, "b")).toBe(false);
    expect(checkFlag(state, "c")).toBe(false);
    expect(checkFlag(state, "d")).toBe(false);
    expect(checkFlag(state, "e")).toBe(true);
  });

  it("hasFlag distinguishes unset from falsy", () => {
    const state = makeState();
    setFlag(state, "b", false);
    expect(hasFlag(state, "b")).toBe(true);
    expect(hasFlag(state, "unset")).toBe(false);
  });

  it("clearFlag removes the flag entirely", () => {
    const state = makeState();
    setFlag(state, "temp", 1);
    clearFlag(state, "temp");
    expect(hasFlag(state, "temp")).toBe(false);
    expect(getFlag(state, "temp")).toBeUndefined();
  });
});
