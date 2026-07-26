import type { CharacterState } from "../character/create";
import { requireItem } from "../data/items";
import { addItem, removeItem, type InventoryState } from "./inventory";
import {
  InventoryError,
  type EnhancementSlot,
  type ItemResolver,
} from "./items";
import { effectiveStats } from "./selectors";

/**
 * Equipment slots on the character: one weapon, one outfit, and one cyber
 * enhancement per install slot. Slots hold item ids; the items themselves
 * leave the inventory while equipped. All functions are pure — they return
 * a new { character, inventory } pair.
 */
export interface EquipmentState {
  weapon: string | null;
  outfit: string | null;
  enhancements: Partial<Record<EnhancementSlot, string>>;
}

export function emptyEquipment(): EquipmentState {
  return { weapon: null, outfit: null, enhancements: {} };
}

export interface Loadout {
  character: CharacterState;
  inventory: InventoryState;
}

/**
 * HP damage per point of neural load freed when ripping an enhancement
 * out. Installs are permanent-ish: extraction destroys the implant and
 * traumatizes the body, but never drops HP below 1.
 */
export const UNINSTALL_TRAUMA_PER_LOAD = 3;

/**
 * Equips a carried weapon or outfit into its slot. Weapons with a stat
 * requirement check it against current effective stats. Anything already
 * in the slot is returned to the inventory.
 */
export function equip(
  character: CharacterState,
  inventory: InventoryState,
  itemId: string,
  resolve: ItemResolver = requireItem,
): Loadout {
  const item = resolve(itemId);
  if (item.kind !== "weapon" && item.kind !== "outfit") {
    throw new InventoryError(
      "wrong-kind",
      `Cannot equip "${itemId}": ${item.kind} items do not go in equipment slots`,
    );
  }
  if (item.kind === "weapon" && item.requirement) {
    const { stat, value } = item.requirement;
    const current = effectiveStats(character, resolve)[stat];
    if (current < value) {
      throw new InventoryError(
        "stat-requirement",
        `Cannot equip "${itemId}": requires ${stat} ${value}, have ${current}`,
      );
    }
  }
  let nextInventory = removeItem(inventory, itemId);
  const slot = item.kind;
  const previous = character.equipment[slot];
  if (previous != null) {
    nextInventory = addItem(nextInventory, previous, 1, resolve);
  }
  return {
    character: {
      ...character,
      equipment: { ...character.equipment, [slot]: itemId },
    },
    inventory: nextInventory,
  };
}

/** Removes the item in a weapon/outfit slot, returning it to the inventory. */
export function unequip(
  character: CharacterState,
  inventory: InventoryState,
  slot: "weapon" | "outfit",
  resolve: ItemResolver = requireItem,
): Loadout {
  const itemId = character.equipment[slot];
  if (itemId == null) {
    throw new InventoryError("not-equipped", `No item equipped in ${slot} slot`);
  }
  return {
    character: {
      ...character,
      equipment: { ...character.equipment, [slot]: null },
    },
    inventory: addItem(inventory, itemId, 1, resolve),
  };
}

/**
 * Installs a carried enhancement into its cyber slot. Each install slot
 * holds at most one enhancement (no auto-swap — extraction is costly),
 * and total neural load may not exceed the character's neural capacity,
 * which derives from base stats.
 */
export function installEnhancement(
  character: CharacterState,
  inventory: InventoryState,
  itemId: string,
  resolve: ItemResolver = requireItem,
): Loadout {
  const item = resolve(itemId);
  if (item.kind !== "enhancement") {
    throw new InventoryError(
      "wrong-kind",
      `Cannot install "${itemId}": not an enhancement`,
    );
  }
  const occupant = character.equipment.enhancements[item.slot];
  if (occupant != null) {
    throw new InventoryError(
      "slot-occupied",
      `Cannot install "${itemId}": ${item.slot} slot already holds "${occupant}"`,
    );
  }
  const capacity = character.derived.neuralCapacity;
  if (character.neuralLoad + item.neuralCost > capacity) {
    throw new InventoryError(
      "neural-capacity",
      `Cannot install "${itemId}": load ${character.neuralLoad} + cost ` +
        `${item.neuralCost} exceeds capacity ${capacity}`,
    );
  }
  return {
    character: {
      ...character,
      neuralLoad: character.neuralLoad + item.neuralCost,
      equipment: {
        ...character.equipment,
        enhancements: {
          ...character.equipment.enhancements,
          [item.slot]: itemId,
        },
      },
    },
    inventory: removeItem(inventory, itemId),
  };
}

/**
 * Rips an installed enhancement out. The implant is destroyed (it does
 * not return to the inventory) and the character takes
 * UNINSTALL_TRAUMA_PER_LOAD HP damage per point of neural load freed,
 * clamped so HP never drops below 1.
 */
export function uninstallEnhancement(
  character: CharacterState,
  inventory: InventoryState,
  slot: EnhancementSlot,
  resolve: ItemResolver = requireItem,
): Loadout {
  const itemId = character.equipment.enhancements[slot];
  if (itemId == null) {
    throw new InventoryError(
      "not-installed",
      `No enhancement installed in ${slot} slot`,
    );
  }
  const item = resolve(itemId);
  const cost = item.kind === "enhancement" ? item.neuralCost : 0;
  const enhancements = { ...character.equipment.enhancements };
  delete enhancements[slot];
  return {
    character: {
      ...character,
      hp: Math.max(1, character.hp - cost * UNINSTALL_TRAUMA_PER_LOAD),
      neuralLoad: character.neuralLoad - cost,
      equipment: { ...character.equipment, enhancements },
    },
    inventory,
  };
}
