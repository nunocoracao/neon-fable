import { requireItem } from "../data/items";
import {
  InventoryError,
  isStackable,
  storedDye,
  type ItemResolver,
  type OutfitDye,
} from "./items";
import { storedMods, type ModSlots } from "./mods";

/**
 * Carried items. Stackable kinds (consumables, misc, loose mods) merge
 * into a single stack per item id; gear (weapons, outfits, enhancements)
 * is stored one copy per stack so individual pieces can be equipped or
 * installed. All operations are pure: they return a new InventoryState.
 */
export interface ItemStack {
  itemId: string;
  quantity: number;
  /**
   * Parts fitted to *this copy* of a weapon, one entry per socket in
   * socket order (see src/inventory/mods.ts). Because gear is stored
   * one copy per stack, the stack is the copy — this field is the whole
   * of a weapon's identity beyond its id, and it travels with the copy
   * through equips, unequips and saves.
   *
   * Absent on everything unmodded, which is every stack any save
   * written before weapons had sockets contains.
   */
  mods?: (string | null)[];
  /**
   * Color rubbed into *this copy* of an outfit (see
   * src/inventory/dye.ts) — the outfit's counterpart of `mods`, and
   * per-copy for the same reason: two of the same coat are two coats
   * the moment one of them is green. Absent means factory colors, which
   * is every outfit any save written before the chapel sold dye
   * contains.
   */
  dye?: OutfitDye;
}

export interface InventoryState {
  stacks: ItemStack[];
}

export function emptyInventory(): InventoryState {
  return { stacks: [] };
}

export function countItem(inventory: InventoryState, itemId: string): number {
  return inventory.stacks.reduce(
    (sum, stack) => (stack.itemId === itemId ? sum + stack.quantity : sum),
    0,
  );
}

export function hasItem(inventory: InventoryState, itemId: string): boolean {
  return countItem(inventory, itemId) > 0;
}

export function addItem(
  inventory: InventoryState,
  itemId: string,
  quantity = 1,
  resolve: ItemResolver = requireItem,
): InventoryState {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new RangeError(`quantity must be a positive integer, got ${quantity}`);
  }
  const item = resolve(itemId);
  if (isStackable(item)) {
    const existing = inventory.stacks.find((s) => s.itemId === itemId);
    if (existing) {
      return {
        stacks: inventory.stacks.map((s) =>
          s === existing ? { ...s, quantity: s.quantity + quantity } : s,
        ),
      };
    }
    return { stacks: [...inventory.stacks, { itemId, quantity }] };
  }
  const copies: ItemStack[] = Array.from({ length: quantity }, () => ({
    itemId,
    quantity: 1,
  }));
  return { stacks: [...inventory.stacks, ...copies] };
}

/** The per-copy state a piece of gear can carry into the bag. */
export interface GearInstance {
  /** Parts fitted to this weapon copy, in socket order. */
  mods?: ModSlots;
  /** Color rubbed into this outfit copy. */
  dye?: OutfitDye;
}

/**
 * Adds one copy of a piece of gear, keeping the per-copy state it
 * carried. This is how a modded weapon — or a dyed coat — survives a
 * round trip through the inventory: unequipping puts the parts (and the
 * color) back on the stack, and equipping takes them off it again (see
 * takeCopy).
 *
 * An all-empty set of parts, and a dye naming no channel, are stored as
 * nothing at all, so a weapon that has never been to a bench and a coat
 * that has never been dyed serialize exactly as they always did.
 */
export function addGear(
  inventory: InventoryState,
  itemId: string,
  instance: GearInstance = {},
  resolve: ItemResolver = requireItem,
): InventoryState {
  const item = resolve(itemId);
  if (isStackable(item)) {
    throw new InventoryError(
      "wrong-kind",
      `"${itemId}" stacks; it carries no per-copy state`,
    );
  }
  const mods = storedMods(instance.mods ?? []);
  const dye = storedDye(instance.dye);
  return {
    stacks: [
      ...inventory.stacks,
      {
        itemId,
        quantity: 1,
        ...(mods ? { mods } : {}),
        ...(dye ? { dye } : {}),
      },
    ],
  };
}

/**
 * Takes one copy out of the inventory and hands it back whole, so the
 * caller can put whatever the copy was carrying somewhere else.
 *
 * Addressed by stack index rather than by item id: with two of the same
 * weapon in the bag, one scoped and one bare, "the Rail Spitter" is not
 * an answer. `findCopy` resolves an id to the first copy for callers
 * that genuinely do not care which.
 */
export function takeCopy(
  inventory: InventoryState,
  stackIndex: number,
): { inventory: InventoryState; stack: ItemStack } {
  const stack = inventory.stacks[stackIndex];
  if (!stack) {
    throw new InventoryError(
      "not-carried",
      `No carried stack at index ${stackIndex}`,
    );
  }
  const stacks = [...inventory.stacks];
  if (stack.quantity > 1) {
    stacks[stackIndex] = { ...stack, quantity: stack.quantity - 1 };
  } else {
    stacks.splice(stackIndex, 1);
  }
  return { inventory: { stacks }, stack: { ...stack, quantity: 1 } };
}

/** Index of the first carried copy of an item id, or -1 when none is. */
export function findCopy(inventory: InventoryState, itemId: string): number {
  return inventory.stacks.findIndex(
    (stack) => stack.itemId === itemId && stack.quantity > 0,
  );
}

export function removeItem(
  inventory: InventoryState,
  itemId: string,
  quantity = 1,
): InventoryState {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new RangeError(`quantity must be a positive integer, got ${quantity}`);
  }
  if (countItem(inventory, itemId) < quantity) {
    throw new InventoryError(
      "not-carried",
      `Cannot remove ${quantity}x "${itemId}": not enough carried`,
    );
  }
  let remaining = quantity;
  const stacks: ItemStack[] = [];
  for (const stack of inventory.stacks) {
    if (stack.itemId !== itemId || remaining === 0) {
      stacks.push(stack);
      continue;
    }
    const taken = Math.min(stack.quantity, remaining);
    remaining -= taken;
    if (stack.quantity > taken) {
      stacks.push({ ...stack, quantity: stack.quantity - taken });
    }
  }
  return { stacks };
}
