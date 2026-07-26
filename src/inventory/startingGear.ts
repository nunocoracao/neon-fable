import type { CharacterState } from "../character/create";
import { getBackground, type Background } from "../data/backgrounds";
import { requireItem } from "../data/items";
import { equip, type Loadout } from "./equipment";
import { addItem, type InventoryState } from "./inventory";
import { type Item, type ItemResolver } from "./items";

/**
 * Resolves a background's starting gear ids to items, throwing
 * InventoryError("unknown-item") on any id with no content.
 */
export function resolveStartingGear(
  background: Background,
  resolve: ItemResolver = requireItem,
): Item[] {
  return background.startingGearIds.map(resolve);
}

/**
 * Grants the character's background starting gear into the inventory and
 * auto-equips the first weapon and outfit into empty slots. Part of the
 * new-game flow after createCharacter().
 */
export function applyStartingGear(
  character: CharacterState,
  inventory: InventoryState,
  resolve: ItemResolver = requireItem,
): Loadout {
  const background = getBackground(character.backgroundId);
  if (!background) {
    throw new Error(`Unknown background "${character.backgroundId}"`);
  }
  let loadout: Loadout = { character, inventory };
  for (const item of resolveStartingGear(background, resolve)) {
    loadout = {
      ...loadout,
      inventory: addItem(loadout.inventory, item.id, 1, resolve),
    };
    const slot = item.kind === "weapon" || item.kind === "outfit" ? item.kind : null;
    if (slot && loadout.character.equipment[slot] == null) {
      loadout = equip(loadout.character, loadout.inventory, item.id, resolve);
    }
  }
  return loadout;
}
