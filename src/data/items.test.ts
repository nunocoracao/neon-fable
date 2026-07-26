import { describe, expect, it } from "vitest";
import { InventoryError } from "../inventory/items";
import { backgrounds } from "./backgrounds";
import { getItem, items, requireItem } from "./items";

describe("item content", () => {
  it("has unique ids", () => {
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("meets the minimum content bar per kind", () => {
    const byKind = (kind: string) => items.filter((i) => i.kind === kind);
    expect(byKind("weapon").length).toBeGreaterThanOrEqual(3);
    expect(byKind("outfit").length).toBeGreaterThanOrEqual(3);
    expect(byKind("consumable").length).toBeGreaterThanOrEqual(2);
    expect(byKind("enhancement").length).toBeGreaterThanOrEqual(4);
  });

  it("covers distinct install slots across enhancements", () => {
    const slots = items
      .filter((i) => i.kind === "enhancement")
      .map((i) => i.slot);
    expect(new Set(slots).size).toBe(slots.length);
    expect(new Set(slots)).toEqual(new Set(["eyes", "arms", "neural", "dermal"]));
  });

  it("gives every enhancement a genuine trade-off beyond neural cost", () => {
    for (const item of items) {
      if (item.kind !== "enhancement") continue;
      expect(item.neuralCost).toBeGreaterThan(0);
      const hasDrawback = item.effects.some(
        (effect) => effect.type === "stat-mod" && effect.amount < 0,
      );
      expect(hasDrawback, `${item.id} needs a negative stat mod`).toBe(true);
    }
  });

  it("resolves every background starting-gear id to a real item", () => {
    for (const background of backgrounds) {
      for (const id of background.startingGearIds) {
        expect(getItem(id), `${background.id} references missing "${id}"`)
          .toBeDefined();
      }
    }
  });
});

describe("requireItem", () => {
  it("returns known items and throws 'unknown-item' otherwise", () => {
    expect(requireItem("wpn-shard-knife").kind).toBe("weapon");
    try {
      requireItem("no-such-item");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InventoryError);
      expect((error as InventoryError).code).toBe("unknown-item");
    }
  });
});
