import { requireItem } from "../data/items";
import {
  InventoryError,
  isStackable,
  type ItemResolver,
} from "./items";

/**
 * Carried items. Stackable kinds (consumables, misc) merge into a single
 * stack per item id; gear (weapons, outfits, enhancements) is stored one
 * copy per stack so individual pieces can be equipped or installed.
 * All operations are pure: they return a new InventoryState.
 */
export interface ItemStack {
  itemId: string;
  quantity: number;
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
