import { describe, expect, it } from "vitest";
import { GAME_STATE_VERSION, createNewGame } from "./gameState";

describe("createNewGame", () => {
  it("creates a versioned fresh state", () => {
    const state = createNewGame({ playerName: "Vex", seed: 42 });
    expect(state.version).toBe(GAME_STATE_VERSION);
    expect(state.player.name).toBe("Vex");
    expect(state.flags).toEqual({});
    expect(state.location).toBe("main-menu");
    expect(state.inventory.items).toEqual([]);
    expect(state.rng.seed).toBe(42);
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
