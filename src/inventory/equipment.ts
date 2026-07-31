import type { CharacterState } from "../character/create";
import { neuralCapacityOf } from "../character/perks";
import { requireItem } from "../data/items";
import {
  addGear,
  findCopy,
  removeItem,
  takeCopy,
  type InventoryState,
} from "./inventory";
import {
  InventoryError,
  type EnhancementSlot,
  type ItemResolver,
  type OutfitDye,
} from "./items";
import { normalizeDye } from "./dye";
import { normalizeMods, storedMods } from "./mods";
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
  /**
   * Parts fitted to the weapon in hand, one entry per socket in socket
   * order — the same per-copy state a carried weapon keeps on its stack
   * (see ItemStack.mods), moved into the slot along with the weapon.
   * Absent while unarmed, and on every weapon that has never been to a
   * bench.
   */
  weaponMods?: (string | null)[];
  /**
   * Color rubbed into the coat being worn — the same per-copy state a
   * carried outfit keeps on its stack (see ItemStack.dye), moved into
   * the slot along with the outfit. Absent while bare, and on every
   * coat that has never seen a tin.
   */
  outfitDye?: OutfitDye;
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
 * Puts a piece of gear back in the bag with whatever it was carrying —
 * a weapon with its fitted parts, a coat with the color rubbed into it
 * — and leaves the slot's copy of that state behind.
 */
function stowSlot(
  inventory: InventoryState,
  slot: "weapon" | "outfit",
  itemId: string,
  equipment: EquipmentState,
  resolve: ItemResolver,
): InventoryState {
  return addGear(
    inventory,
    itemId,
    slot === "weapon"
      ? { mods: equipment.weaponMods ?? [] }
      : { dye: equipment.outfitDye },
    resolve,
  );
}

/**
 * Equips the copy at `stackIndex`. Addressing the copy rather than the
 * id is what lets a player carry two of the same weapon and equip the
 * one they modded; `equip` below is the same call for callers with
 * nothing but an id.
 *
 * Weapons with a stat requirement check it against current effective
 * stats. Anything already in the slot is returned to the inventory,
 * with its own parts still on it.
 */
export function equipStack(
  character: CharacterState,
  inventory: InventoryState,
  stackIndex: number,
  resolve: ItemResolver = requireItem,
): Loadout {
  const stack = inventory.stacks[stackIndex];
  if (!stack) {
    throw new InventoryError(
      "not-carried",
      `No carried stack at index ${stackIndex}`,
    );
  }
  const item = resolve(stack.itemId);
  if (item.kind !== "weapon" && item.kind !== "outfit") {
    throw new InventoryError(
      "wrong-kind",
      `Cannot equip "${stack.itemId}": ${item.kind} items do not go in equipment slots`,
    );
  }
  if (item.kind === "weapon" && item.requirement) {
    const { stat, value } = item.requirement;
    const current = effectiveStats(character, resolve)[stat];
    if (current < value) {
      throw new InventoryError(
        "stat-requirement",
        `Cannot equip "${stack.itemId}": requires ${stat} ${value}, have ${current}`,
      );
    }
  }

  const taken = takeCopy(inventory, stackIndex);
  let nextInventory = taken.inventory;
  const slot = item.kind;
  const previous = character.equipment[slot];
  if (previous != null) {
    nextInventory = stowSlot(
      nextInventory,
      slot,
      previous,
      character.equipment,
      resolve,
    );
  }
  // Per-copy state comes off the copy and into the slot; the slot's own
  // left with whatever was displaced, so neither set is ever shared.
  const carried: Partial<EquipmentState> =
    item.kind === "weapon"
      ? { weaponMods: storedMods(normalizeMods(item, taken.stack.mods, resolve)) }
      : { outfitDye: normalizeDye(item, taken.stack.dye) };
  return {
    character: {
      ...character,
      equipment: { ...character.equipment, [slot]: stack.itemId, ...carried },
    },
    inventory: nextInventory,
  };
}

/**
 * Equips a carried weapon or outfit into its slot, taking the first
 * copy carried. See equipStack for choosing between copies.
 */
export function equip(
  character: CharacterState,
  inventory: InventoryState,
  itemId: string,
  resolve: ItemResolver = requireItem,
): Loadout {
  const index = findCopy(inventory, itemId);
  if (index < 0) {
    // Kind errors read better than "you aren't carrying that" when the
    // item is one that could never go in a slot at all.
    const item = resolve(itemId);
    if (item.kind !== "weapon" && item.kind !== "outfit") {
      throw new InventoryError(
        "wrong-kind",
        `Cannot equip "${itemId}": ${item.kind} items do not go in equipment slots`,
      );
    }
    throw new InventoryError(
      "not-carried",
      `Cannot equip "${itemId}": not carried`,
    );
  }
  return equipStack(character, inventory, index, resolve);
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
  const equipment = { ...character.equipment, [slot]: null };
  if (slot === "weapon") equipment.weaponMods = undefined;
  else equipment.outfitDye = undefined;
  return {
    character: { ...character, equipment },
    // The parts leave with the weapon they are bolted to, and the color
    // with the cloth it soaked into.
    inventory: stowSlot(inventory, slot, itemId, character.equipment, resolve),
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
  // Asked of the perk-aware figure, never of the derived one: the
  // install rule and the capacity the character screen prints are the
  // same function, so a frame that reads 5/6 can always fit the sixth.
  const capacity = neuralCapacityOf(character);
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
