import { describe, expect, it } from "vitest";
import { createNewGame, type GameState } from "./gameState";
import {
  MIGRATION_STEPS,
  MigrationError,
  migrateGameState,
  migrateStepwise,
  stepName,
  type MigrationStep,
} from "./migrate";
import { GAME_STATE_VERSION, OLDEST_MIGRATABLE_VERSION } from "./version";

/**
 * The safety net under the migration ladder.
 *
 * The ladder itself is covered by gameState.test.ts and save.test.ts,
 * which climb it with real frozen saves. What is tested here is what
 * happens when a rung breaks: the runner has to name the rung and hand
 * back the save it was given, bit for bit, because a save this build
 * cannot migrate must stay migratable by the next one.
 */

/** A v6-era state: what the ladder starts from. */
function oldSave(): GameState {
  const state = JSON.parse(
    JSON.stringify(createNewGame({ playerName: "Sable", seed: 4 })),
  ) as Record<string, unknown>;
  state.version = 6;
  delete state.party;
  delete state.reputation;
  delete state.lore;
  delete state.vendors;
  delete state.rules;
  delete (state.player as Record<string, unknown>).appearance;
  return state as unknown as GameState;
}

describe("the ladder", () => {
  it("is contiguous from the oldest supported version to the current one", () => {
    expect(MIGRATION_STEPS[0]!.from).toBe(OLDEST_MIGRATABLE_VERSION);
    expect(MIGRATION_STEPS[MIGRATION_STEPS.length - 1]!.to).toBe(
      GAME_STATE_VERSION,
    );
    for (let i = 1; i < MIGRATION_STEPS.length; i += 1) {
      expect(MIGRATION_STEPS[i]!.from).toBe(MIGRATION_STEPS[i - 1]!.to);
    }
  });

  it("climbs every rung for the oldest save and reports what it did", () => {
    const result = migrateStepwise(oldSave(), 6);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.version).toBe(GAME_STATE_VERSION);
    expect(result.applied).toHaveLength(MIGRATION_STEPS.length + 1);
    expect(result.applied[0]).toMatch(/^v6 -> v7/);
    expect(result.applied.at(-1)).toBe("normalize");
  });

  it("starts partway up for a save that is partway up", () => {
    const midway = { ...createNewGame({ seed: 5 }), version: 13 };
    const result = migrateStepwise(midway, 13);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applied[0]).toMatch(/^v13 -> v14/);
  });

  it("still normalizes a save already at the current version", () => {
    const result = migrateStepwise(createNewGame({ seed: 1 }), GAME_STATE_VERSION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applied).toEqual(["normalize"]);
  });
});

describe("when a step fails", () => {
  /**
   * The real first rung, then one that was supposed to add a party and
   * quietly does nothing — the shape of every migration bug worth
   * catching.
   */
  function ladderWithABadRung(): MigrationStep[] {
    return [
      MIGRATION_STEPS[0]!,
      { from: 7, to: 8, label: "companions", apply: (state) => state },
    ];
  }

  it("names the step and the field that was wrong", () => {
    const result = migrateStepwise(oldSave(), 6, ladderWithABadRung());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedStep).toBe("v7 -> v8 (companions)");
    expect(result.issues).toEqual([
      { path: "party", message: "expected an object, got nothing" },
    ]);
    expect(result.message).toMatch(/v7 -> v8 \(companions\)/);
    expect(result.message).toMatch(/party \(expected an object, got nothing\)/);
  });

  it("hands the original back untouched, down to the JSON", () => {
    const original = oldSave();
    const before = JSON.stringify(original);
    const result = migrateStepwise(original, 6, ladderWithABadRung());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.original).toBe(original);
    expect(JSON.stringify(original)).toBe(before);
  });

  it("says which rungs it had already climbed", () => {
    const result = migrateStepwise(oldSave(), 6, ladderWithABadRung());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.applied).toEqual(["v6 -> v7 (layered appearance)"]);
  });

  it("catches a step that throws instead of returning", () => {
    const result = migrateStepwise(oldSave(), 6, [
      {
        from: 6,
        to: 7,
        label: "layered appearance",
        apply: () => {
          throw new Error("the catalog moved");
        },
      },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedStep).toBe("v6 -> v7 (layered appearance)");
    expect(result.message).toMatch(/threw: the catalog moved/);
  });

  it("catches the normalize pass failing too", () => {
    const result = migrateStepwise(
      { ...createNewGame({ seed: 2 }), player: null as never },
      GAME_STATE_VERSION,
      [],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedStep).toBe("normalize");
  });

  it("throws MigrationError from the convenience wrapper", () => {
    const bad = { ...createNewGame({ seed: 3 }), player: null as never };
    let caught: MigrationError | null = null;
    try {
      migrateGameState(bad, GAME_STATE_VERSION);
    } catch (error) {
      caught = error as MigrationError;
    }
    expect(caught).toBeInstanceOf(MigrationError);
    expect(caught?.failedStep).toBe("normalize");
  });
});

describe("stepName", () => {
  it("reads as a version hop with a reason", () => {
    expect(
      stepName({ from: 8, to: 9, label: "faction standing", apply: (s) => s }),
    ).toBe("v8 -> v9 (faction standing)");
  });
});
