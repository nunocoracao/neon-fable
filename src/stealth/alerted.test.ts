import { describe, expect, it } from "vitest";
import { createCombat, PLAYER_COMBATANT_ID, resolveCombat } from "../combat";
import { combatResultFlag } from "../combat/outcome";
import { ALERTED_INITIATIVE_PENALTY, alertFlag } from "../data/stealth";
import { createNewGame, type GameState } from "../state/gameState";

const ENCOUNTER = "enc-exec-security";

function runner(flags: Record<string, boolean> = {}): GameState {
  const state = createNewGame({ seed: 7, playerName: "Sable" });
  return { ...state, flags: { ...state.flags, ...flags } };
}

/** Where the player sits in the queue, out of everybody in the fight. */
function playerPlace(state: GameState): number {
  const combat = createCombat(state, ENCOUNTER);
  return combat.initiativeOrder.indexOf(PLAYER_COMBATANT_ID);
}

describe("a fight the watch started", () => {
  it("costs the player initiative, and nothing else", () => {
    const quiet = createCombat(runner(), ENCOUNTER);
    const alerted = createCombat(
      runner({ [alertFlag(ENCOUNTER)]: true }),
      ENCOUNTER,
    );
    const before = quiet.combatants.find((c) => c.id === PLAYER_COMBATANT_ID)!;
    const after = alerted.combatants.find((c) => c.id === PLAYER_COMBATANT_ID)!;
    expect(before.initiativeMod).toBeUndefined();
    expect(after.initiativeMod).toBe(-ALERTED_INITIATIVE_PENALTY);
    // Every other figure the fight reads is untouched: the penalty is a
    // place in the queue, not a worse character.
    expect(after.stats).toEqual(before.stats);
    expect(after.hp).toBe(before.hp);
    expect(after.maxHp).toBe(before.maxHp);
    expect(after.armor).toBe(before.armor);
    expect(after.weapon).toEqual(before.weapon);
    expect(after.abilityIds).toEqual(before.abilityIds);
    expect(alerted.combatants.map((c) => c.id)).toEqual(
      quiet.combatants.map((c) => c.id),
    );
  });

  it("actually moves the player down the order", () => {
    expect(playerPlace(runner({ [alertFlag(ENCOUNTER)]: true }))).toBeGreaterThan(
      playerPlace(runner()),
    );
  });

  it("is still a fight: somebody has the turn and the board is whole", () => {
    const alerted = createCombat(
      runner({ [alertFlag(ENCOUNTER)]: true }),
      ENCOUNTER,
    );
    expect(alerted.status).toBe("active");
    expect(alerted.initiativeOrder).toHaveLength(alerted.combatants.length);
  });

  it("spends the alert when the fight is folded back in", () => {
    const state = runner({ [alertFlag(ENCOUNTER)]: true });
    const combat = createCombat(state, ENCOUNTER);
    const settled = resolveCombat(state, { ...combat, status: "victory" });
    expect(settled.flags[alertFlag(ENCOUNTER)]).toBeUndefined();
    expect(settled.flags[combatResultFlag(ENCOUNTER)]).toBe("victory");
    // And a later fight on the same encounter opens ordinarily.
    expect(
      createCombat(settled, ENCOUNTER).combatants.find(
        (c) => c.id === PLAYER_COMBATANT_ID,
      )?.initiativeMod,
    ).toBeUndefined();
  });

  it("spends it on a defeat too — losing is not a reason to stay alerted", () => {
    const state = runner({ [alertFlag(ENCOUNTER)]: true });
    const combat = createCombat(state, ENCOUNTER);
    const settled = resolveCombat(state, { ...combat, status: "defeat" });
    expect(settled.flags[alertFlag(ENCOUNTER)]).toBeUndefined();
  });

  it("leaves every other fight in the game exactly as it was", () => {
    const state = runner({ [alertFlag(ENCOUNTER)]: true });
    const other = createCombat(state, "enc-auric-scout");
    expect(
      other.combatants.find((c) => c.id === PLAYER_COMBATANT_ID)?.initiativeMod,
    ).toBeUndefined();
  });
});
