import { describe, expect, it } from "vitest";
import {
  ATTENDED,
  DUCK_BLURRED_GAIN,
  DUCK_HIDDEN_GAIN,
  applyFocusEvent,
  duckFactor,
  isDucked,
  type FocusEvent,
  type FocusState,
} from "./duck";

/** Feeds a run of browser events at the state a page boots in. */
function run(...events: FocusEvent[]): FocusState {
  return events.reduce(applyFocusEvent, ATTENDED);
}

describe("the focus state machine", () => {
  it("boots attended", () => {
    expect(ATTENDED).toEqual({ focused: true, visible: true });
    expect(duckFactor(ATTENDED, true)).toBe(1);
  });

  it("tracks focus and visibility independently", () => {
    expect(run("blur")).toEqual({ focused: false, visible: true });
    expect(run("hide")).toEqual({ focused: true, visible: false });
    expect(run("blur", "hide")).toEqual({ focused: false, visible: false });
    expect(run("blur", "hide", "show")).toEqual({
      focused: false,
      visible: true,
    });
    expect(run("blur", "hide", "show", "focus")).toEqual(ATTENDED);
  });

  it("is idempotent, so a repeated event changes nothing", () => {
    const blurred = run("blur");
    expect(applyFocusEvent(blurred, "blur")).toBe(blurred);
    expect(applyFocusEvent(ATTENDED, "focus")).toBe(ATTENDED);
    expect(applyFocusEvent(ATTENDED, "show")).toBe(ATTENDED);
    const hidden = run("hide");
    expect(applyFocusEvent(hidden, "hide")).toBe(hidden);
  });

  it("does not care what order the two APIs report in", () => {
    // The browser fires window blur and visibilitychange in whichever
    // order it likes, and platforms disagree. Both routes to "gone" have
    // to land in the same place.
    expect(run("blur", "hide")).toEqual(run("hide", "blur"));
    expect(run("hide", "blur", "show", "focus")).toEqual(
      run("blur", "hide", "focus", "show"),
    );
  });
});

describe("duckFactor", () => {
  it("leaves an attended page alone", () => {
    expect(duckFactor(ATTENDED, true)).toBe(1);
    expect(isDucked(ATTENDED, true)).toBe(false);
  });

  it("ducks a visible window that lost focus", () => {
    // Still on screen, just not in front: quieter, not off.
    expect(duckFactor(run("blur"), true)).toBe(DUCK_BLURRED_GAIN);
    expect(DUCK_BLURRED_GAIN).toBeGreaterThan(0);
    expect(DUCK_BLURRED_GAIN).toBeLessThan(1);
    expect(isDucked(run("blur"), true)).toBe(true);
  });

  it("silences a tab that is not on screen", () => {
    expect(duckFactor(run("hide"), true)).toBe(DUCK_HIDDEN_GAIN);
    expect(DUCK_HIDDEN_GAIN).toBe(0);
  });

  it("lets hidden win over merely unfocused", () => {
    // A hidden tab is the stronger statement, whichever arrived first.
    expect(duckFactor(run("blur", "hide"), true)).toBe(DUCK_HIDDEN_GAIN);
    expect(duckFactor(run("hide", "blur"), true)).toBe(DUCK_HIDDEN_GAIN);
    // And un-hiding while still unfocused falls back to the duck.
    expect(duckFactor(run("blur", "hide", "show"), true)).toBe(
      DUCK_BLURRED_GAIN,
    );
  });

  it("does nothing at all when the setting is off", () => {
    for (const state of [ATTENDED, run("blur"), run("hide"), run("blur", "hide")]) {
      expect(duckFactor(state, false)).toBe(1);
      expect(isDucked(state, false)).toBe(false);
    }
  });

  it("restores full volume on the way back", () => {
    expect(duckFactor(run("hide", "show"), true)).toBe(1);
    expect(duckFactor(run("blur", "focus"), true)).toBe(1);
  });
});
