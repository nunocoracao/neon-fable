import type { CharacterState } from "../character/create";
import { characterPerks, healedAmount } from "../character/perks";
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
  // What the item is worth to *this* character: a perk that makes a
  // dose go further goes through the same seam the fight's use-item
  // action does, so a stimpack heals the same either side of a fight.
  const healed = healedAmount(item.effect.amount, characterPerks(character));
  return {
    character: {
      ...character,
      hp: Math.min(character.derived.maxHp, character.hp + healed),
    },
    inventory: removeItem(inventory, itemId),
  };
}
