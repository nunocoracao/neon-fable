import { describe, expect, it } from "vitest";
import {
  POINT_POOL,
  defaultAllocation,
  validateAllocation,
} from "../character";
import { fixtureAppearance, fixtureCharacter } from "../character/testSupport";
import { countItem, hasItem, installEnhancement, addItem, equip } from "../inventory";
import { GAME_STATE_VERSION, createNewGame } from "./gameState";
import {
  NG_PLUS_BONUS_POINTS,
  NG_PLUS_CARRYOVER_FLAG,
  NG_PLUS_FLAG,
  applyNewGamePlus,
  carryoverAppearance,
  carryoverCandidates,
  isNewGamePlus,
} from "./ngplus";
import { createMemoryStorage, loadGame, saveGame } from "./save";

describe("carry-over candidates", () => {
  it("collects equipped weapon, outfit, and installed enhancements", () => {
    const base = createNewGame({ playerName: "Vex", seed: 1 });
    // Starting gear is auto-equipped; add and install an enhancement.
    const carrying = addItem(base.inventory, "cyb-optic-suite");
    const loadout = installEnhancement(base.player, carrying, "cyb-optic-suite");
    const ids = carryoverCandidates(loadout.character);
    expect(ids).toContain(loadout.character.equipment.weapon);
    expect(ids).toContain(loadout.character.equipment.outfit);
    expect(ids).toContain("cyb-optic-suite");
    expect(ids.every((id) => typeof id === "string")).toBe(true);
  });

  it("returns an empty list for a bare character", () => {
    expect(carryoverCandidates(fixtureCharacter())).toEqual([]);
  });
});

describe("carry-over appearance", () => {
  it("returns a copy of the finishing character's look", () => {
    const appearance = fixtureAppearance({
      skinTone: "deep-umber",
      hairStyle: "mohawk",
      hairColor: "synth-violet",
      headwear: "cap",
    });
    const character = fixtureCharacter({ appearance });
    const carried = carryoverAppearance(character);
    expect(carried).toEqual(appearance);
    // A copy, not a shared reference: mutating it never touches the source.
    expect(carried).not.toBe(character.appearance);
  });
});

describe("applying New Game+ to a fresh run", () => {
  it("sets the flags and grants the chosen legacy item", () => {
    const fresh = createNewGame({ playerName: "Vex", seed: 2 });
    const plus = applyNewGamePlus(fresh, "wpn-arc-lash");
    expect(isNewGamePlus(plus)).toBe(true);
    expect(plus.flags[NG_PLUS_FLAG]).toBe(true);
    expect(plus.flags[NG_PLUS_CARRYOVER_FLAG]).toBe("wpn-arc-lash");
    expect(hasItem(plus.inventory, "wpn-arc-lash")).toBe(true);
    // Pure: the original state is untouched.
    expect(isNewGamePlus(fresh)).toBe(false);
    expect(hasItem(fresh.inventory, "wpn-arc-lash")).toBe(false);
  });

  it("supports traveling light: flag only, no item", () => {
    const fresh = createNewGame({ playerName: "Vex", seed: 2 });
    const stacksBefore = fresh.inventory.stacks.length;
    const plus = applyNewGamePlus(fresh, null);
    expect(isNewGamePlus(plus)).toBe(true);
    expect(NG_PLUS_CARRYOVER_FLAG in plus.flags).toBe(false);
    expect(plus.inventory.stacks.length).toBe(stacksBefore);
  });

  it("grants a legacy enhancement as a carried item, not pre-installed", () => {
    const fresh = createNewGame({ playerName: "Vex", seed: 2 });
    const plus = applyNewGamePlus(fresh, "cyb-warden-optics");
    expect(countItem(plus.inventory, "cyb-warden-optics")).toBe(1);
    expect(plus.player.equipment.enhancements).toEqual(
      fresh.player.equipment.enhancements,
    );
  });
});

describe("New Game+ point pool", () => {
  it("keeps the bonus a nudge, not a power fantasy", () => {
    expect(NG_PLUS_BONUS_POINTS).toBeGreaterThan(0);
    expect(NG_PLUS_BONUS_POINTS).toBeLessThanOrEqual(POINT_POOL / 3);
  });

  it("validates against an expanded pool only when one is passed", () => {
    const allocation = { ...defaultAllocation(), body: 6 + NG_PLUS_BONUS_POINTS };
    expect(validateAllocation(allocation).valid).toBe(false);
    const plus = validateAllocation(allocation, POINT_POOL + NG_PLUS_BONUS_POINTS);
    expect(plus.valid).toBe(true);
    expect(plus.remaining).toBe(0);
  });

  it("createCharacter accepts the expanded pool", () => {
    const allocation = { ...defaultAllocation(), tech: 6 + NG_PLUS_BONUS_POINTS };
    const character = fixtureCharacter({
      allocation,
      pointPool: POINT_POOL + NG_PLUS_BONUS_POINTS,
    });
    expect(character.name).toBe("Vex");
    // Standard-pool creation is unchanged.
    expect(() => fixtureCharacter({ allocation })).toThrow(/overspent/);
  });
});

describe("save compatibility", () => {
  it("pre-NG+ saves round-trip unchanged and read as normal runs", () => {
    const storage = createMemoryStorage();
    const vintage = createNewGame({ playerName: "Vex", seed: 3 });
    expect(vintage.version).toBe(GAME_STATE_VERSION);
    saveGame(vintage, "slot1", storage, 1000);
    const loaded = loadGame("slot1", storage);
    expect(loaded).toEqual(vintage);
    expect(isNewGamePlus(loaded)).toBe(false);
  });

  it("NG+ state extends the save format without reshaping it", () => {
    const storage = createMemoryStorage();
    const fresh = createNewGame({ playerName: "Vex", seed: 3 });
    const plus = applyNewGamePlus(fresh, "wpn-arc-lash");
    // Same version, same top-level shape — only flags and inventory grew.
    expect(plus.version).toBe(fresh.version);
    expect(Object.keys(plus).sort()).toEqual(Object.keys(fresh).sort());
    saveGame(plus, "slot2", storage, 1000);
    expect(loadGame("slot2", storage)).toEqual(plus);
  });

  it("a full NG+ loadout still equips through normal inventory rules", () => {
    const fresh = createNewGame({ playerName: "Vex", seed: 4 });
    const plus = applyNewGamePlus(fresh, "wpn-arc-lash");
    const loadout = equip(plus.player, plus.inventory, "wpn-arc-lash");
    expect(loadout.character.equipment.weapon).toBe("wpn-arc-lash");
  });
});
