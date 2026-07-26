import { describe, expect, it } from "vitest";
import { createCharacter, defaultAllocation } from "../character";
import { getBackground } from "../data/backgrounds";
import { GAME_STATE_VERSION, createNewGame } from "./gameState";

describe("createNewGame", () => {
  it("creates a versioned fresh state with a default character", () => {
    const state = createNewGame({ playerName: "Vex", seed: 42 });
    expect(state.version).toBe(GAME_STATE_VERSION);
    expect(state.player.name).toBe("Vex");
    expect(state.player.backgroundId).toBe("gutter-courier");
    expect(state.player.hp).toBe(state.player.derived.maxHp);
    expect(state.flags).toEqual({});
    expect(state.location).toBe("main-menu");
    expect(state.rng.seed).toBe(42);
  });

  it("seeds the inventory with the background's starting gear", () => {
    const state = createNewGame({ seed: 1 });
    expect(state.inventory.items).toEqual(
      getBackground(state.player.backgroundId)!.startingGearIds,
    );
  });

  it("uses a fully created character when one is provided", () => {
    const character = createCharacter({
      name: "Nyx",
      background: getBackground("grid-diver")!,
      allocation: defaultAllocation(),
    });
    const state = createNewGame({ character, seed: 9 });
    expect(state.player).toBe(character);
    expect(state.inventory.items).toEqual(
      getBackground("grid-diver")!.startingGearIds,
    );
  });

  it("defaults to an unnamed player and a numeric seed", () => {
    const state = createNewGame();
    expect(state.player.name).toBe("");
    expect(typeof state.rng.seed).toBe("number");
    expect(Number.isInteger(state.rng.seed)).toBe(true);
  });

  it("survives a JSON round-trip unchanged", () => {
    const state = createNewGame({ playerName: "Vex", seed: 7 });
    state.flags.metFixer = true;
    state.flags.credits = 250;
    state.flags.faction = "lumen-cartel";
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
