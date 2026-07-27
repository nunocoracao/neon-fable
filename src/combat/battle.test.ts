import { describe, expect, it } from "vitest";
import { applyEffect } from "../narrative/effects";
import { addItem } from "../inventory";
import { createNewGame, type GameState } from "../state";
import { takeAction } from "./actions";
import { runEnemyTurns } from "./ai";
import { weaponRange } from "./damage";
import { inBounds, isOccupied, manhattan } from "./grid";
import { combatResultFlag, resolveCombat } from "./outcome";
import { createCombat } from "./setup";
import { activeCombatant, isAlive, livingEnemies } from "./state";
import type { CombatState, GridPosition } from "./types";

/**
 * A deterministic player policy: attack the nearest living enemy when in
 * weapon range, otherwise step toward it, otherwise end the turn. Ties
 * break on combatant id, so the whole battle is a pure function of the
 * initial GameState seed.
 */
function playPlayerTurn(state: CombatState): CombatState {
  let next = state;
  for (let guard = 0; guard < 32; guard++) {
    if (next.status !== "active" || activeCombatant(next).kind !== "player") {
      return next;
    }
    const player = activeCombatant(next);
    const target = livingEnemies(next).sort(
      (a, b) =>
        manhattan(player.position, a.position) -
          manhattan(player.position, b.position) || (a.id < b.id ? -1 : 1),
    )[0];
    if (!target) return next;

    const distance = manhattan(player.position, target.position);
    if (!next.actionUsed && distance <= weaponRange(player.weapon.rangeType)) {
      next = takeAction(next, { type: "attack", targetId: target.id });
      continue;
    }
    if (next.moveRemaining > 0 && distance > 1) {
      const dx = target.position.x - player.position.x;
      const dy = target.position.y - player.position.y;
      const steps: GridPosition[] = [];
      if (dx !== 0) {
        steps.push({ x: player.position.x + Math.sign(dx), y: player.position.y });
      }
      if (dy !== 0) {
        steps.push({ x: player.position.x, y: player.position.y + Math.sign(dy) });
      }
      if (Math.abs(dy) > Math.abs(dx)) steps.reverse();
      const step = steps.find(
        (s) => inBounds(next.grid, s) && !isOccupied(next.combatants, s, player.id),
      );
      if (step) {
        next = takeAction(next, { type: "move", to: step });
        continue;
      }
    }
    return takeAction(next, { type: "end-turn" });
  }
  throw new Error("player turn did not terminate");
}

/** Plays the whole battle from a fresh GameState; returns the end state. */
function playBattle(game: GameState, encounterId: string): CombatState {
  let combat = createCombat(game, encounterId);
  for (let round = 0; combat.status === "active" && round < 200; round++) {
    combat =
      activeCombatant(combat).kind === "player"
        ? playPlayerTurn(combat)
        : runEnemyTurns(combat);
  }
  return combat;
}

function makeGame(): GameState {
  const state = createNewGame({ seed: 20260727 });
  return { ...state, inventory: addItem(state.inventory, "con-trauma-patch", 2) };
}

describe("a full scripted battle", () => {
  it("plays out identically twice from the same seed", () => {
    const first = playBattle(makeGame(), "enc-auric-scout");
    const second = playBattle(makeGame(), "enc-auric-scout");
    expect(first.status).not.toBe("active");
    expect(second.log).toEqual(first.log);
    expect(second).toEqual(first);
  });

  it("diverges from a different seed", () => {
    const first = playBattle(makeGame(), "enc-auric-scout");
    const other = playBattle(
      { ...makeGame(), rng: { seed: 1 } },
      "enc-auric-scout",
    );
    expect(other.log).not.toEqual(first.log);
  });

  it("stays serializable through every turn's end state", () => {
    const finished = playBattle(makeGame(), "enc-auric-scout");
    expect(JSON.parse(JSON.stringify(finished))).toEqual(finished);
  });

  it("runs the pending-combat marker end to end", () => {
    // The narrative start-combat effect marks the encounter...
    const game = applyEffect(makeGame(), {
      type: "start-combat",
      encounterId: "enc-rustyard-ambush",
    });
    expect(game.pendingEncounterId).toBe("enc-rustyard-ambush");

    // ...the UI layer launches and plays it...
    const combat = playBattle(game, game.pendingEncounterId!);
    expect(combat.status).not.toBe("active");

    // ...and resolving folds the outcome back into GameState.
    const after = resolveCombat(game, combat);
    expect(after.pendingEncounterId).toBeNull();
    expect(after.flags[combatResultFlag("enc-rustyard-ambush")]).toBe(
      combat.status,
    );
    if (combat.status === "victory") {
      expect(after.credits).toBe(game.credits + 30);
    }
    expect(after.player.hp).toBeGreaterThanOrEqual(1);
  });

  it("ends in victory or defeat with the loser at zero hp", () => {
    const finished = playBattle(makeGame(), "enc-auric-scout");
    if (finished.status === "victory") {
      expect(livingEnemies(finished)).toEqual([]);
    } else {
      expect(finished.status).toBe("defeat");
      expect(
        finished.combatants.filter((c) => c.kind === "player" && isAlive(c)),
      ).toEqual([]);
    }
  });
});
