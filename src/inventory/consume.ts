import type { CharacterState } from "../character/create";
import { requireItem } from "../data/items";
import type { Loadout } from "./equipment";
import { removeItem, type InventoryState } from "./inventory";
import { InventoryError, type ItemResolver } from "./items";

/**
 * Out-of-combat consumable use. Only healing items work outside a fight;
 * combat boosts are interpreted by the combat engine and are rejected
 * here. Pure: returns a new { character, inventory } pair.
 */
export function useConsumable(
  character: CharacterState,
  inventory: InventoryState,
  itemId: string,
  resolve: ItemResolver = requireItem,
): Loadout {
  const item = resolve(itemId);
  if (item.kind !== "consumable") {
    throw new InventoryError(
      "wrong-kind",
      `Cannot use "${itemId}": not a consumable`,
    );
  }
  if (item.effect.type !== "heal") {
    throw new InventoryError(
      "not-usable",
      `"${item.name}" only works in combat`,
    );
  }
  if (character.hp >= character.derived.maxHp) {
    throw new InventoryError(
      "not-usable",
      `Already at full health — "${item.name}" would be wasted`,
    );
  }
  return {
    character: {
      ...character,
      hp: Math.min(character.derived.maxHp, character.hp + item.effect.amount),
    },
    inventory: removeItem(inventory, itemId),
  };
}
