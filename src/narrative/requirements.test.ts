import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { addItem, installEnhancement } from "../inventory";
import { createNewGame, type GameState } from "../state";
import { checkRequirement, checkRequirements } from "./requirements";

/**
 * Effective stats with starting gear equipped:
 *   gutter-courier: body 7, reflexes 9, tech 6, cool 6, intelligence 6
 *   tower-analyst:  body 6, reflexes 6, tech 6, cool 8, intelligence 7
 */
function makeState(backgroundId = "gutter-courier"): GameState {
  return createNewGame({ character: fixtureCharacter({ backgroundId }), seed: 1 });
}

describe("checkRequirement", () => {
  describe("flag-equals", () => {
    it("passes only on strict equality", () => {
      const state = makeState();
      state.flags["door-entry"] = "corp";
      expect(
        checkRequirement(state, {
          type: "flag-equals",
          key: "door-entry",
          value: "corp",
        }),
      ).toBe(true);
      expect(
        checkRequirement(state, {
          type: "flag-equals",
          key: "door-entry",
          value: "street",
        }),
      ).toBe(false);
    });

    it("fails when the flag is missing", () => {
      expect(
        checkRequirement(makeState(), {
          type: "flag-equals",
          key: "never-set",
          value: true,
        }),
      ).toBe(false);
    });
  });

  describe("credits", () => {
    it("passes when the balance meets the threshold", () => {
      const state = makeState();
      state.credits = 100;
      expect(
        checkRequirement(state, { type: "credits", value: 100 }),
      ).toBe(true);
      expect(
        checkRequirement(state, { type: "credits", value: 101 }),
      ).toBe(false);
    });
  });

  describe("flag-at-least", () => {
    it("compares numeric flags against the threshold", () => {
      const state = makeState();
      state.flags.heat = 3;
      expect(
        checkRequirement(state, { type: "flag-at-least", key: "heat", value: 3 }),
      ).toBe(true);
      expect(
        checkRequirement(state, { type: "flag-at-least", key: "heat", value: 4 }),
      ).toBe(false);
    });

    it("treats missing and non-numeric flags as 0", () => {
      const state = makeState();
      state.flags.talked = true;
      expect(
        checkRequirement(state, { type: "flag-at-least", key: "heat", value: 1 }),
      ).toBe(false);
      expect(
        checkRequirement(state, {
          type: "flag-at-least",
          key: "talked",
          value: 1,
        }),
      ).toBe(false);
      expect(
        checkRequirement(state, { type: "flag-at-least", key: "heat", value: 0 }),
      ).toBe(true);
    });
  });

  describe("stat", () => {
    it("checks effective stats, so equipment mods count", () => {
      const state = makeState("gutter-courier");
      // Base reflexes is 7; knife and slicker push effective to 9.
      expect(state.player.stats.reflexes).toBe(7);
      expect(
        checkRequirement(state, { type: "stat", stat: "reflexes", value: 9 }),
      ).toBe(true);
      expect(
        checkRequirement(state, { type: "stat", stat: "reflexes", value: 10 }),
      ).toBe(false);
    });

    it("fails for a character below the threshold", () => {
      expect(
        checkRequirement(makeState("tower-analyst"), {
          type: "stat",
          stat: "reflexes",
          value: 8,
        }),
      ).toBe(false);
    });
  });

  describe("item", () => {
    it("passes when the item is carried", () => {
      const state = makeState();
      state.inventory = addItem(state.inventory, "con-trauma-patch");
      expect(
        checkRequirement(state, { type: "item", itemId: "con-trauma-patch" }),
      ).toBe(true);
      expect(
        checkRequirement(state, { type: "item", itemId: "con-surge-stim" }),
      ).toBe(false);
    });

    it("honors a quantity threshold", () => {
      const state = makeState();
      state.inventory = addItem(state.inventory, "con-trauma-patch", 2);
      expect(
        checkRequirement(state, {
          type: "item",
          itemId: "con-trauma-patch",
          quantity: 2,
        }),
      ).toBe(true);
      expect(
        checkRequirement(state, {
          type: "item",
          itemId: "con-trauma-patch",
          quantity: 3,
        }),
      ).toBe(false);
    });
  });

  describe("enhancement", () => {
    it("passes only when installed, not merely carried", () => {
      const state = makeState();
      state.inventory = addItem(state.inventory, "cyb-optic-suite");
      const requirement = {
        type: "enhancement",
        itemId: "cyb-optic-suite",
      } as const;
      expect(checkRequirement(state, requirement)).toBe(false);

      const loadout = installEnhancement(
        state.player,
        state.inventory,
        "cyb-optic-suite",
      );
      const installed = {
        ...state,
        player: loadout.character,
        inventory: loadout.inventory,
      };
      expect(checkRequirement(installed, requirement)).toBe(true);
    });
  });

  describe("background", () => {
    it("matches the character's background tags", () => {
      expect(
        checkRequirement(makeState("gutter-courier"), {
          type: "background",
          tag: "street",
        }),
      ).toBe(true);
      expect(
        checkRequirement(makeState("gutter-courier"), {
          type: "background",
          tag: "corp",
        }),
      ).toBe(false);
      expect(
        checkRequirement(makeState("tower-analyst"), {
          type: "background",
          tag: "corp",
        }),
      ).toBe(true);
    });
  });
});

describe("checkRequirements", () => {
  it("is vacuously true for undefined or empty lists", () => {
    expect(checkRequirements(makeState(), undefined)).toBe(true);
    expect(checkRequirements(makeState(), [])).toBe(true);
  });

  it("requires every requirement to pass", () => {
    const state = makeState("gutter-courier");
    state.flags.ready = true;
    expect(
      checkRequirements(state, [
        { type: "flag-equals", key: "ready", value: true },
        { type: "background", tag: "street" },
      ]),
    ).toBe(true);
    expect(
      checkRequirements(state, [
        { type: "flag-equals", key: "ready", value: true },
        { type: "background", tag: "corp" },
      ]),
    ).toBe(false);
  });
});
