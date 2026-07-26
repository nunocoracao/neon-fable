import { describe, expect, it } from "vitest";
import {
  addItem,
  countItem,
  emptyInventory,
  hasItem,
  removeItem,
} from "./inventory";
import { InventoryError } from "./items";

describe("addItem", () => {
  it("merges stackable items into a single stack", () => {
    let inv = addItem(emptyInventory(), "con-trauma-patch", 2);
    inv = addItem(inv, "con-trauma-patch", 3);
    expect(inv.stacks).toEqual([{ itemId: "con-trauma-patch", quantity: 5 }]);
  });

  it("keeps gear as one copy per stack", () => {
    const inv = addItem(emptyInventory(), "wpn-shard-knife", 2);
    expect(inv.stacks).toEqual([
      { itemId: "wpn-shard-knife", quantity: 1 },
      { itemId: "wpn-shard-knife", quantity: 1 },
    ]);
    expect(countItem(inv, "wpn-shard-knife")).toBe(2);
  });

  it("does not mutate the original inventory", () => {
    const before = emptyInventory();
    addItem(before, "con-trauma-patch");
    expect(before.stacks).toEqual([]);
  });

  it("rejects unknown item ids", () => {
    expect(() => addItem(emptyInventory(), "no-such-item")).toThrowError(
      InventoryError,
    );
  });

  it("rejects non-positive quantities", () => {
    expect(() => addItem(emptyInventory(), "con-trauma-patch", 0)).toThrowError(
      RangeError,
    );
  });
});

describe("removeItem", () => {
  it("decrements a stack and drops it at zero", () => {
    let inv = addItem(emptyInventory(), "con-trauma-patch", 2);
    inv = removeItem(inv, "con-trauma-patch");
    expect(inv.stacks).toEqual([{ itemId: "con-trauma-patch", quantity: 1 }]);
    inv = removeItem(inv, "con-trauma-patch");
    expect(inv.stacks).toEqual([]);
  });

  it("removes across multiple gear stacks", () => {
    let inv = addItem(emptyInventory(), "wpn-shard-knife", 3);
    inv = removeItem(inv, "wpn-shard-knife", 2);
    expect(countItem(inv, "wpn-shard-knife")).toBe(1);
  });

  it("throws 'not-carried' when there is not enough to remove", () => {
    const inv = addItem(emptyInventory(), "con-trauma-patch", 1);
    try {
      removeItem(inv, "con-trauma-patch", 2);
      expect.unreachable();
    } catch (error) {
      expect((error as InventoryError).code).toBe("not-carried");
    }
  });
});

describe("countItem / hasItem", () => {
  it("counts across stacks and reports presence", () => {
    let inv = addItem(emptyInventory(), "wpn-shard-knife", 2);
    inv = addItem(inv, "con-surge-stim", 4);
    expect(countItem(inv, "wpn-shard-knife")).toBe(2);
    expect(countItem(inv, "con-surge-stim")).toBe(4);
    expect(hasItem(inv, "con-surge-stim")).toBe(true);
    expect(hasItem(inv, "out-spire-suit")).toBe(false);
  });
});
