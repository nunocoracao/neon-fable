/**
 * Inventory system: typed items, carried stacks, equipment slots (weapon,
 * outfit), cyber-enhancement install points, and selectors that fold item
 * effects over base stats. Pure logic — item content lives in
 * src/data/items.ts.
 */
export {
  ENHANCEMENT_SLOTS,
  InventoryError,
  isStackable,
  type ConsumableEffect,
  type ConsumableItem,
  type EnhancementItem,
  type EnhancementSlot,
  type Item,
  type ItemEffect,
  type ItemResolver,
  type InventoryErrorCode,
  type MiscItem,
  type OutfitItem,
  type RangeType,
  type WeaponItem,
} from "./items";
export {
  addItem,
  countItem,
  emptyInventory,
  hasItem,
  removeItem,
  type InventoryState,
  type ItemStack,
} from "./inventory";
export {
  UNINSTALL_TRAUMA_PER_LOAD,
  emptyEquipment,
  equip,
  installEnhancement,
  unequip,
  uninstallEnhancement,
  type EquipmentState,
  type Loadout,
} from "./equipment";
export { useConsumable } from "./consume";
export {
  armorValue,
  dialogueUnlockTags,
  effectiveStats,
  equippedItems,
  grantedAbilityIds,
} from "./selectors";
export { applyStartingGear, resolveStartingGear } from "./startingGear";
