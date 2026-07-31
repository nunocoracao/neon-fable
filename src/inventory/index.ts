/**
 * Inventory system: typed items, carried stacks, equipment slots (weapon,
 * outfit), cyber-enhancement install points, and selectors that fold item
 * effects over base stats. Pure logic — item content lives in
 * src/data/items.ts.
 */
export {
  ENHANCEMENT_SLOTS,
  InventoryError,
  MOD_SOCKET_KINDS,
  bearsEffects,
  isStackable,
  type ConsumableEffect,
  type ConsumableItem,
  type EffectBearingItem,
  type EnhancementItem,
  type EnhancementSlot,
  type Item,
  type ItemEffect,
  type ItemResolver,
  type InventoryErrorCode,
  type MiscItem,
  type ModEffect,
  type ModItem,
  type ModSocketKind,
  type OutfitItem,
  type RangeType,
  type WeaponItem,
  type WeaponModEffect,
} from "./items";
export {
  addGear,
  addItem,
  countItem,
  emptyInventory,
  findCopy,
  hasItem,
  removeItem,
  takeCopy,
  type InventoryState,
  type ItemStack,
} from "./inventory";
export {
  UNINSTALL_TRAUMA_PER_LOAD,
  emptyEquipment,
  equip,
  equipStack,
  installEnhancement,
  unequip,
  uninstallEnhancement,
  type EquipmentState,
  type Loadout,
} from "./equipment";
export { useConsumable } from "./consume";
export {
  CRIT_SHARE_BASE,
  MIN_WEAPON_DAMAGE,
  MOD_REMOVAL_FEE,
  characterEffects,
  hasMods,
  installMod,
  installedMods,
  modAccent,
  normalizeMods,
  removeMod,
  sanitizeMods,
  socketAt,
  storedMods,
  weaponProfile,
  weaponSockets,
  type ItemLookup,
  type ModSlots,
  type WeaponProfile,
} from "./mods";
export {
  benchWeapons,
  fitMod,
  fittableMods,
  previewFit,
  previewPull,
  profileDeltas,
  pullMod,
  requireBenchWeapon,
  sameWeapon,
  type BenchWeapon,
  type FitPreview,
  type ProfileDelta,
  type WeaponRef,
  type Workbench,
} from "./workbench";
export {
  armorValue,
  dialogueUnlockTags,
  effectiveStats,
  equippedItems,
  equippedMods,
  equippedWeaponProfile,
  grantedAbilityIds,
} from "./selectors";
export {
  applyStartingGear,
  resolveStartingGear,
  startingEquipment,
} from "./startingGear";
