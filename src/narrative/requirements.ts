import { requireItem } from "../data/items";
import { hasItem, countItem } from "../inventory/inventory";
import type { ItemResolver } from "../inventory/items";
import { effectiveStats } from "../inventory/selectors";
import type { GameState } from "../state/gameState";
import type { Requirement } from "./types";

/**
 * Requirement evaluation: pure predicates over GameState. Stat checks use
 * effective stats (equipment and enhancement mods included), so gear can
 * open dialogue options.
 */

export function checkRequirement(
  state: GameState,
  requirement: Requirement,
  resolve: ItemResolver = requireItem,
): boolean {
  switch (requirement.type) {
    case "flag-equals":
      return state.flags[requirement.key] === requirement.value;
    case "flag-at-least": {
      const value = state.flags[requirement.key];
      return (typeof value === "number" ? value : 0) >= requirement.value;
    }
    case "stat":
      return (
        effectiveStats(state.player, resolve)[requirement.stat] >=
        requirement.value
      );
    case "item":
      return requirement.quantity == null
        ? hasItem(state.inventory, requirement.itemId)
        : countItem(state.inventory, requirement.itemId) >=
            requirement.quantity;
    case "enhancement":
      return Object.values(state.player.equipment.enhancements).includes(
        requirement.itemId,
      );
    case "background":
      return state.player.tags.includes(requirement.tag);
  }
}

/** True when every requirement passes (vacuously true for none). */
export function checkRequirements(
  state: GameState,
  requirements: Requirement[] | undefined,
  resolve: ItemResolver = requireItem,
): boolean {
  return (requirements ?? []).every((r) => checkRequirement(state, r, resolve));
}
