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
    expect(byKind("weapon").length).toBeGreaterThanOrEqual(6);
    expect(byKind("outfit").length).toBeGreaterThanOrEqual(5);
    expect(byKind("consumable").length).toBeGreaterThanOrEqual(2);
    expect(byKind("enhancement").length).toBeGreaterThanOrEqual(7);
  });

  it("covers every install slot across enhancements", () => {
    const slots = items
      .filter((i) => i.kind === "enhancement")
      .map((i) => i.slot);
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

  it("carries a second gear tier that outclasses the starting gear", () => {
    const tier2 = {
      weapons: ["wpn-rail-spitter", "wpn-torque-cleaver", "wpn-spindle-projector"],
      outfits: ["out-cordon-plate", "out-ghostline-mantle"],
      enhancements: [
        "cyb-warden-optics",
        "cyb-torsion-frame",
        "cyb-cascade-governor",
      ],
    };
    for (const id of tier2.weapons) {
      const item = getItem(id);
      expect(item?.kind, id).toBe("weapon");
      if (item?.kind !== "weapon") continue;
      // Stronger than every tier-1 weapon and stat-gated on top of price.
      expect(item.damage).toBeGreaterThanOrEqual(7);
      expect(item.requirement?.value ?? 0).toBeGreaterThanOrEqual(6);
    }
    for (const id of tier2.outfits) {
      const item = getItem(id);
      expect(item?.kind, id).toBe("outfit");
      if (item?.kind !== "outfit") continue;
      expect(item.armor).toBeGreaterThanOrEqual(3);
    }
    for (const id of tier2.enhancements) {
      const item = getItem(id);
      expect(item?.kind, id).toBe("enhancement");
      if (item?.kind !== "enhancement") continue;
      expect(item.neuralCost).toBeGreaterThanOrEqual(3);
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
