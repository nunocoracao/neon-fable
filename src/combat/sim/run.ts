import type { GameState } from "../../state/gameState";
import { runEnemyTurns } from "../ai";
import { createCombat } from "../setup";
import { activeCombatant, isPlayerControlled, playerCombatant } from "../state";
import type { CombatState } from "../types";
import { playTurn, type SimPolicy } from "./policies";

/**
 * One auto-battle: the real engine, played out by a scripted hand.
 *
 * Nothing here is a model of combat. `createCombat`, `takeAction` and
 * `runEnemyTurns` are the same functions the game calls, which is the
 * whole value of the harness — a number it reports is a number the
 * player would have lived through. The only things the simulation adds
 * are a policy on the player's side and a ceiling on how long a fight is
 * allowed to go on.
 */

/**
 * Rounds a fight may run before it is called off. Well past any authored
 * encounter's honest length, so hitting it means something is wrong —
 * two bodies that cannot reach each other, a kiting loop, a damage
 * figure tuned down to nothing — rather than that the fight was long.
 */
export const ROUND_CEILING = 60;

export interface BattleResult {
  /** How it ended, or "stalled" when the ceiling stopped it. */
  outcome: "victory" | "defeat" | "fled" | "stalled";
  /** Rounds elapsed; the fight's length in the only unit players feel. */
  rounds: number;
  /** Share of frame the player walked out with, in [0, 1]. */
  healthLeft: number;
  /** Consumables opened, across the whole fight. */
  itemsUsed: number;
}

/** Plays one encounter to the end and reports what happened. */
export function simulateBattle(
  game: GameState,
  encounterId: string,
  policy: SimPolicy,
): BattleResult {
  let combat: CombatState = createCombat(game, encounterId);
  let rounds = combat.round;
  while (combat.status === "active" && combat.round <= ROUND_CEILING) {
    combat = isPlayerControlled(activeCombatant(combat))
      ? playTurn(combat, policy)
      : runEnemyTurns(combat);
    rounds = combat.round;
  }
  const player = playerCombatant(combat);
  return {
    outcome: combat.status === "active" ? "stalled" : combat.status,
    rounds,
    healthLeft:
      player.maxHp > 0 ? Math.max(0, player.hp) / player.maxHp : 0,
    itemsUsed: combat.itemsConsumed.reduce(
      (sum, stack) => sum + stack.quantity,
      0,
    ),
  };
}
