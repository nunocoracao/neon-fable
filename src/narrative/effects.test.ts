import { describe, expect, it } from "vitest";
import { addItem, countItem } from "../inventory";
import { createNewGame, type GameState } from "../state";
import { applyEffect, applyEffects } from "./effects";

function makeState(): GameState {
  return createNewGame({ seed: 1 });
}

describe("applyEffect", () => {
  it("set-flag writes the flag without mutating the input state", () => {
    const state = makeState();
    const next = applyEffect(state, {
      type: "set-flag",
      key: "door-entry",
      value: "bribe",
    });
    expect(next.flags["door-entry"]).toBe("bribe");
    expect(state.flags["door-entry"]).toBeUndefined();
    expect(next).not.toBe(state);
  });

  it("increment-flag starts missing or non-numeric flags at 0", () => {
    const state = makeState();
    state.flags.talked = true;
    const next = applyEffects(state, [
      { type: "increment-flag", key: "heat" },
      { type: "increment-flag", key: "heat", amount: 2 },
      { type: "increment-flag", key: "talked" },
    ]);
    expect(next.flags.heat).toBe(3);
    expect(next.flags.talked).toBe(1);
  });

  it("add-item and remove-item update the inventory immutably", () => {
    const state = makeState();
    const added = applyEffect(state, {
      type: "add-item",
      itemId: "con-trauma-patch",
      quantity: 2,
    });
    expect(countItem(added.inventory, "con-trauma-patch")).toBe(2);
    expect(countItem(state.inventory, "con-trauma-patch")).toBe(0);

    const removed = applyEffect(added, {
      type: "remove-item",
      itemId: "con-trauma-patch",
    });
    expect(countItem(removed.inventory, "con-trauma-patch")).toBe(1);
  });

  it("remove-item clamps to what is carried instead of throwing", () => {
    const state = makeState();
    state.inventory = addItem(state.inventory, "con-trauma-patch");
    const next = applyEffect(state, {
      type: "remove-item",
      itemId: "con-trauma-patch",
      quantity: 5,
    });
    expect(countItem(next.inventory, "con-trauma-patch")).toBe(0);

    const untouched = applyEffect(next, {
      type: "remove-item",
      itemId: "con-trauma-patch",
    });
    expect(untouched).toBe(next);
  });

  it("credits grants, charges, and clamps the balance at 0", () => {
    const state = makeState(); // starts at 25
    const paid = applyEffect(state, { type: "credits", amount: -15 });
    expect(paid.credits).toBe(10);
    const broke = applyEffect(paid, { type: "credits", amount: -999 });
    expect(broke.credits).toBe(0);
    const rich = applyEffect(broke, { type: "credits", amount: 200 });
    expect(rich.credits).toBe(200);
    expect(state.credits).toBe(25);
  });

  it("start-combat marks the encounter as pending, immutably", () => {
    const state = makeState();
    const next = applyEffect(state, {
      type: "start-combat",
      encounterId: "enc-auric-scout",
    });
    expect(next.pendingEncounterId).toBe("enc-auric-scout");
    expect(state.pendingEncounterId).toBeNull();
  });

  it("goto and end leave state untouched", () => {
    const state = makeState();
    expect(applyEffect(state, { type: "goto", nodeId: "elsewhere" })).toBe(
      state,
    );
    expect(applyEffect(state, { type: "end", endingId: "done" })).toBe(state);
  });
});

describe("applyEffects", () => {
  it("folds effects left to right", () => {
    const state = makeState();
    const next = applyEffects(state, [
      { type: "set-flag", key: "heat", value: 5 },
      { type: "increment-flag", key: "heat", amount: -2 },
      { type: "credits", amount: -25 },
      { type: "add-item", itemId: "msc-cracked-spike" },
    ]);
    expect(next.flags.heat).toBe(3);
    expect(next.credits).toBe(0);
    expect(countItem(next.inventory, "msc-cracked-spike")).toBe(1);
  });

  it("returns the same state for undefined or empty effect lists", () => {
    const state = makeState();
    expect(applyEffects(state, undefined)).toBe(state);
    expect(applyEffects(state, [])).toBe(state);
  });
});
