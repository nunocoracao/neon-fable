import { requireEncounter } from "../data/encounters";
import { requireItem } from "../data/items";
import { addItem, countItem, removeItem } from "../inventory/inventory";
import type { ItemResolver } from "../inventory/items";
import type { GameState } from "../state/gameState";
import { playerCombatant } from "./state";
import { CombatError, type CombatState } from "./types";

/**
 * Folds a finished combat back into GameState: RNG state advances, spent
 * consumables leave the inventory, the player's hp syncs, an outcome flag
 * is recorded for the narrative, and victory pays the encounter's rewards.
 */

/**
 * Flag recording how an encounter went; its value is "victory", "defeat",
 * or "fled", so story nodes can gate on any outcome with flag-equals.
 */
export function combatResultFlag(encounterId: string): string {
  return `combat:${encounterId}`;
}

export function resolveCombat(
  state: GameState,
  combat: CombatState,
  resolve: ItemResolver = requireItem,
): GameState {
  if (combat.status === "active") {
    throw new CombatError(
      "combat-active",
      "Cannot resolve a combat that is still running",
    );
  }
  const player = playerCombatant(combat);

  let inventory = state.inventory;
  for (const spent of combat.itemsConsumed) {
    const taken = Math.min(spent.quantity, countItem(inventory, spent.itemId));
    if (taken > 0) inventory = removeItem(inventory, spent.itemId, taken);
  }

  let next: GameState = {
    ...state,
    // Defeat leaves the player staggered at 1 hp; the narrative reacts to
    // the outcome flag, not to a dead character.
    player: { ...state.player, hp: Math.max(1, player.hp) },
    flags: {
      ...state.flags,
      [combatResultFlag(combat.encounterId)]: combat.status,
    },
    inventory,
    pendingEncounterId:
      state.pendingEncounterId === combat.encounterId
        ? null
        : state.pendingEncounterId,
    rng: combat.rng,
  };

  if (combat.status === "victory") {
    const { rewards } = requireEncounter(combat.encounterId);
    let rewarded = next.inventory;
    for (const reward of rewards.items ?? []) {
      rewarded = addItem(rewarded, reward.itemId, reward.quantity ?? 1, resolve);
    }
    next = {
      ...next,
      credits: next.credits + rewards.credits,
      inventory: rewarded,
    };
  }
  return next;
}
