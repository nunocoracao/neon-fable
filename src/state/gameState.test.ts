import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { getBackground } from "../data/backgrounds";
import { noAssists } from "../data/assists";
import {
  DEFAULT_DIFFICULTY_ID,
  NEUTRAL_MODIFIERS,
} from "../data/difficulty";
import {
  GAME_STATE_VERSION,
  createNewGame,
  migrateGameState,
} from "./gameState";
import { defaultRules, rulesModifiers } from "./rules";

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

  it("grants and equips the background's starting gear", () => {
    const state = createNewGame({ seed: 1 });
    const [weaponId, outfitId] =
      getBackground(state.player.backgroundId)!.startingGearIds;
    expect(state.player.equipment.weapon).toBe(weaponId);
    expect(state.player.equipment.outfit).toBe(outfitId);
    expect(state.inventory.stacks).toEqual([]);
  });

  it("uses a fully created character when one is provided", () => {
    const character = fixtureCharacter({ name: "Nyx", backgroundId: "grid-diver" });
    const state = createNewGame({ character, seed: 9 });
    expect(state.player.name).toBe("Nyx");
    expect(state.player.backgroundId).toBe("grid-diver");
    expect(state.player.equipment.weapon).toBe("wpn-stun-baton");
    expect(state.player.equipment.outfit).toBe("out-diver-harness");
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

/**
 * Difficulty and the assists on the save: what a fresh run records,
 * that it survives a round-trip, and — the promise that matters most —
 * that every save written before any of this existed loads as the game
 * it actually was.
 */
describe("the rules a save carries", () => {
  it("starts a fresh run on the middle preset with every assist off", () => {
    expect(createNewGame({ seed: 1 }).rules).toEqual(defaultRules());
  });

  it("takes the rules it is handed", () => {
    const rules = {
      difficulty: "blackout" as const,
      assists: { ...noAssists(), "damage-floor": true },
      difficultyChanged: true,
    };
    expect(createNewGame({ seed: 1, rules }).rules).toEqual(rules);
  });

  it("clamps rules that name something this build has retired", () => {
    const state = createNewGame({
      seed: 1,
      rules: { difficulty: "nightmare", assists: {}, difficultyChanged: false },
    } as never);
    expect(state.rules).toEqual(defaultRules());
  });

  it("survives a JSON round-trip with everything switched on", () => {
    const state = createNewGame({
      seed: 3,
      rules: {
        difficulty: "drift",
        assists: {
          "always-preview": true,
          "damage-floor": true,
          "bold-telegraphs": true,
          "breach-rescue": true,
        },
        difficultyChanged: true,
      },
    });
    const reloaded = JSON.parse(JSON.stringify(state)) as typeof state;
    expect(reloaded.rules).toEqual(state.rules);
    expect(reloaded).toEqual(state);
  });

  it("loads a save from before difficulty existed as the authored game", () => {
    const before = createNewGame({ seed: 5 });
    const old = { ...before, version: 16 } as Record<string, unknown>;
    delete old.rules;
    const migrated = migrateGameState(old as never, 16);
    expect(migrated.rules).toEqual(defaultRules());
    expect(rulesModifiers(migrated.rules)).toEqual(NEUTRAL_MODIFIERS);
    expect(migrated.version).toBe(GAME_STATE_VERSION);
  });

  it("closes a preset or an assist an older build wrote and this one lost", () => {
    const state = createNewGame({ seed: 5 });
    const migrated = migrateGameState(
      {
        ...state,
        version: 16,
        rules: {
          difficulty: "nightmare",
          assists: { "auto-win": true, "damage-floor": true },
          difficultyChanged: true,
        },
      } as never,
      16,
    );
    expect(migrated.rules.difficulty).toBe(DEFAULT_DIFFICULTY_ID);
    expect(migrated.rules.assists).toEqual({
      ...noAssists(),
      "damage-floor": true,
    });
    // The record of the change survives the clamp; it is a fact about
    // the run, not a setting.
    expect(migrated.rules.difficultyChanged).toBe(true);
  });

  it("carries a current-version save's rules through untouched", () => {
    const state = createNewGame({
      seed: 7,
      rules: {
        difficulty: "blackout",
        assists: { ...noAssists(), "breach-rescue": true },
        difficultyChanged: true,
      },
    });
    expect(migrateGameState(state, GAME_STATE_VERSION).rules).toEqual(
      state.rules,
    );
  });
});
