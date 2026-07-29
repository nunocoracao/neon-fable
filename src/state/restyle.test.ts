import { describe, expect, it } from "vitest";
import type { Appearance } from "../character/appearance";
import { RESTYLE_PRICE } from "../data/stylist";
import { createNewGame } from "./gameState";
import { applyRestyle, restyleChanged, restyledLook } from "./restyle";

/** A funded state whose current look is the player's stock appearance. */
function makeState(credits: number) {
  const state = createNewGame({ playerName: "Test", seed: 7 });
  return { ...state, credits };
}

/** The current look with a couple of cosmetic edits. */
function newHair(current: Appearance): Appearance {
  return { ...current, hairStyle: "mohawk", hairColor: "synth-violet" };
}

describe("restyledLook", () => {
  it("applies cosmetic fields from the request", () => {
    const state = makeState(100);
    const look = restyledLook(
      state.player.appearance,
      newHair(state.player.appearance),
    );
    expect(look.hairStyle).toBe("mohawk");
    expect(look.hairColor).toBe("synth-violet");
  });

  it("keeps identity fields from the current look, whatever the request says", () => {
    const state = makeState(100);
    const current = state.player.appearance;
    const sneaky = { ...newHair(current), build: "heavy", skinTone: "deep-umber" };
    const look = restyledLook(current, sneaky);
    expect(look.build).toBe(current.build);
    expect(look.skinTone).toBe(current.skinTone);
    expect(look.hairStyle).toBe("mohawk");
  });
});

describe("restyleChanged", () => {
  it("is false for an identical request", () => {
    const current = makeState(0).player.appearance;
    expect(restyleChanged(current, { ...current })).toBe(false);
  });

  it("is false when only identity fields differ — the merge undoes them", () => {
    const current = makeState(0).player.appearance;
    expect(restyleChanged(current, { ...current, build: "heavy" })).toBe(false);
  });

  it("is true for a cosmetic difference", () => {
    const current = makeState(0).player.appearance;
    expect(restyleChanged(current, newHair(current))).toBe(true);
  });
});

describe("applyRestyle", () => {
  it("applies the look and deducts the flat fee", () => {
    const state = makeState(RESTYLE_PRICE + 10);
    const result = applyRestyle(state, newHair(state.player.appearance));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.credits).toBe(10);
    expect(result.state.player.appearance.hairStyle).toBe("mohawk");
    // Everything unrelated is untouched.
    expect(result.state.inventory).toBe(state.inventory);
    expect(result.state.flags).toBe(state.flags);
  });

  it("refuses politely when the player cannot cover the fee, changing nothing", () => {
    const state = makeState(RESTYLE_PRICE - 1);
    const result = applyRestyle(state, newHair(state.player.appearance));
    expect(result).toEqual({ ok: false, reason: "insufficient-credits" });
    expect(state.credits).toBe(RESTYLE_PRICE - 1);
    expect(state.player.appearance.hairStyle).not.toBe("mohawk");
  });

  it("never charges for an unchanged look", () => {
    const state = makeState(RESTYLE_PRICE * 2);
    const result = applyRestyle(state, { ...state.player.appearance });
    expect(result).toEqual({ ok: false, reason: "unchanged" });
  });

  it("treats identity-only edits as unchanged, not billable", () => {
    const state = makeState(RESTYLE_PRICE * 2);
    const result = applyRestyle(state, {
      ...state.player.appearance,
      skinTone: "deep-umber",
    });
    expect(result).toEqual({ ok: false, reason: "unchanged" });
  });

  it("refuses a look with unknown catalog ids", () => {
    const state = makeState(RESTYLE_PRICE * 2);
    const result = applyRestyle(state, {
      ...state.player.appearance,
      hairStyle: "no-such-cut",
    });
    expect(result).toEqual({ ok: false, reason: "invalid-look" });
  });

  it("never mutates the input state", () => {
    const state = makeState(RESTYLE_PRICE * 2);
    const snapshot = JSON.parse(JSON.stringify(state));
    applyRestyle(state, newHair(state.player.appearance));
    expect(state).toEqual(snapshot);
  });
});
