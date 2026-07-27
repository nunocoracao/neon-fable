import { describe, expect, it } from "vitest";
import { addItem, countItem } from "../inventory";
import { createNewGame, type GameState } from "../state";
import { combatResultFlag, resolveCombat } from "./outcome";
import { createCombat } from "./setup";
import { CombatError, type CombatState, type CombatStatus } from "./types";

function makeGame(): GameState {
  const state = createNewGame({ seed: 11 });
  return {
    ...state,
    inventory: addItem(state.inventory, "con-trauma-patch", 2),
    pendingEncounterId: "enc-auric-scout",
  };
}

/** A finished copy of the combat: enemies down, player hurt, items spent. */
function finish(combat: CombatState, status: CombatStatus): CombatState {
  return {
    ...combat,
    status,
    combatants: combat.combatants.map((c) =>
      c.kind === "enemy"
        ? { ...c, hp: status === "victory" ? 0 : c.hp }
        : { ...c, hp: status === "defeat" ? 0 : c.hp - 5 },
    ),
    itemsConsumed: [{ itemId: "con-trauma-patch", quantity: 1 }],
    rng: { seed: 987654 },
  };
}

describe("resolveCombat", () => {
  it("refuses to resolve a running combat", () => {
    const state = makeGame();
    const combat = createCombat(state, "enc-auric-scout");
    expect(() => resolveCombat(state, combat)).toThrow(CombatError);
  });

  it("victory pays credits and reward items and records the flag", () => {
    const state = makeGame();
    const combat = finish(createCombat(state, "enc-auric-scout"), "victory");
    const next = resolveCombat(state, combat);
    expect(next.credits).toBe(state.credits + 40);
    // 2 carried - 1 consumed + 1 reward = 2
    expect(countItem(next.inventory, "con-trauma-patch")).toBe(2);
    expect(next.flags[combatResultFlag("enc-auric-scout")]).toBe("victory");
    expect(next.player.hp).toBe(state.player.hp - 5);
    expect(next.rng).toEqual({ seed: 987654 });
    expect(next.pendingEncounterId).toBeNull();
    // Input state untouched.
    expect(state.pendingEncounterId).toBe("enc-auric-scout");
    expect(countItem(state.inventory, "con-trauma-patch")).toBe(2);
  });

  it("defeat leaves the player at 1 hp, pays nothing, and flags the loss", () => {
    const state = makeGame();
    const combat = finish(createCombat(state, "enc-auric-scout"), "defeat");
    const next = resolveCombat(state, combat);
    expect(next.player.hp).toBe(1);
    expect(next.credits).toBe(state.credits);
    expect(countItem(next.inventory, "con-trauma-patch")).toBe(1);
    expect(next.flags[combatResultFlag("enc-auric-scout")]).toBe("defeat");
  });

  it("fleeing pays nothing but still spends consumables and syncs hp", () => {
    const state = makeGame();
    const combat = finish(createCombat(state, "enc-auric-scout"), "fled");
    const next = resolveCombat(state, combat);
    expect(next.credits).toBe(state.credits);
    expect(countItem(next.inventory, "con-trauma-patch")).toBe(1);
    expect(next.flags[combatResultFlag("enc-auric-scout")]).toBe("fled");
    expect(next.player.hp).toBe(state.player.hp - 5);
  });

  it("keeps an unrelated pending encounter marker", () => {
    const state = { ...makeGame(), pendingEncounterId: "enc-vault-guardian" };
    const combat = finish(createCombat(state, "enc-auric-scout"), "fled");
    expect(resolveCombat(state, combat).pendingEncounterId).toBe(
      "enc-vault-guardian",
    );
  });
});
