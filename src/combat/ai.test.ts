import { describe, expect, it } from "vitest";
import { chooseEnemyAction, runEnemyTurns } from "./ai";
import { activeCombatant } from "./state";
import { CombatError, type CombatState } from "./types";
import { makeCombat, makeCombatant } from "./testSupport";

function skirmish(overrides: Partial<CombatState> = {}): CombatState {
  return makeCombat(
    [
      makeCombatant({ id: "player", kind: "player", position: { x: 0, y: 0 } }),
      makeCombatant({ id: "foe", position: { x: 4, y: 1 } }),
    ],
    { turnIndex: 1, ...overrides },
  );
}

describe("chooseEnemyAction", () => {
  it("refuses to act on the player's turn", () => {
    expect(() => chooseEnemyAction(skirmish({ turnIndex: 0 }))).toThrow(
      CombatError,
    );
  });

  it("is a pure function of state: same input, same action", () => {
    const state = skirmish();
    expect(chooseEnemyAction(state)).toEqual(chooseEnemyAction(state));
  });

  it("steps toward the player along the larger axis gap first", () => {
    expect(chooseEnemyAction(skirmish())).toEqual({
      type: "move",
      to: { x: 3, y: 1 }, // |dx| 4 > |dy| 1
    });
    const closer = skirmish();
    closer.combatants = closer.combatants.map((c) =>
      c.id === "foe" ? { ...c, position: { x: 1, y: 3 } } : c,
    );
    expect(chooseEnemyAction(closer)).toEqual({
      type: "move",
      to: { x: 1, y: 2 }, // |dy| 3 > |dx| 1
    });
  });

  it("routes around a blocked step when one axis is walled off", () => {
    // Only the y-step closes distance, but another enemy stands on it, so
    // the foe ends its turn rather than stepping sideways.
    const state = makeCombat(
      [
        makeCombatant({ id: "player", kind: "player", position: { x: 0, y: 0 } }),
        makeCombatant({ id: "blocker", position: { x: 0, y: 1 } }),
        makeCombatant({ id: "foe", position: { x: 0, y: 2 } }),
      ],
      { turnIndex: 2 },
    );
    expect(chooseEnemyAction(state)).toEqual({ type: "end-turn" });
  });

  it("attacks once the player is in weapon range", () => {
    const adjacent = skirmish();
    adjacent.combatants = adjacent.combatants.map((c) =>
      c.id === "foe" ? { ...c, position: { x: 1, y: 0 } } : c,
    );
    expect(chooseEnemyAction(adjacent)).toEqual({
      type: "attack",
      targetId: "player",
    });
  });

  it("prefers a ready damage ability in range over a plain attack", () => {
    const state = skirmish();
    state.combatants = state.combatants.map((c) =>
      c.id === "foe"
        ? { ...c, abilityIds: ["ability-crush"], position: { x: 1, y: 0 } }
        : c,
    );
    expect(chooseEnemyAction(state)).toEqual({
      type: "use-ability",
      abilityId: "ability-crush",
      targetId: "player",
    });
    const cooling = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "foe"
          ? {
              ...c,
              abilityIds: ["ability-crush"],
              position: { x: 1, y: 0 },
              cooldowns: { "ability-crush": 2 },
            }
          : c,
      ),
    };
    expect(chooseEnemyAction(cooling)).toEqual({
      type: "attack",
      targetId: "player",
    });
  });

  it("ends the turn once the action is spent and it stands in range", () => {
    const adjacent = skirmish({ actionUsed: true });
    adjacent.combatants = adjacent.combatants.map((c) =>
      c.id === "foe" ? { ...c, position: { x: 1, y: 0 } } : c,
    );
    expect(chooseEnemyAction(adjacent)).toEqual({ type: "end-turn" });
  });

  it("ends the turn when out of range with no moves left", () => {
    expect(
      chooseEnemyAction(skirmish({ actionUsed: true, moveRemaining: 0 })),
    ).toEqual({ type: "end-turn" });
  });
});

describe("runEnemyTurns", () => {
  it("plays every consecutive enemy turn, then stops on the player's", () => {
    const state = makeCombat(
      [
        makeCombatant({ id: "player", kind: "player", position: { x: 0, y: 0 } }),
        makeCombatant({ id: "foe-a", position: { x: 5, y: 0 } }),
        makeCombatant({ id: "foe-b", position: { x: 0, y: 5 } }),
      ],
      { turnIndex: 1 },
    );
    const next = runEnemyTurns(state);
    expect(next.status).toBe("active");
    expect(activeCombatant(next).id).toBe("player");
    // Both enemies closed the gap during their turns.
    expect(next.log.filter((e) => e.type === "moved").length).toBeGreaterThan(1);
  });

  it("is deterministic given the same state and seed", () => {
    const state = skirmish({ rng: { seed: 99 } });
    expect(runEnemyTurns(state)).toEqual(runEnemyTurns(state));
  });
});
