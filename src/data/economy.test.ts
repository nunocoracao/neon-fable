import { describe, expect, it } from "vitest";
import { CHAPEL_DYE_SHELF, dyeItems } from "./dyes";
import {
  CONDITION_MODIFIERS,
  DEFAULT_RESTOCK,
  HAGGLE,
  ITEM_CONDITIONS,
  ITEM_VALUES,
  PRICE_FLOOR,
  STANDING_DISCOUNTS,
  VENDOR_IDS,
  VENDOR_KINDS,
  VENDOR_RESTOCK,
  VENDOR_SPREADS,
  getVendor,
  haggleChance,
  isVendorId,
  itemValue,
  requireVendor,
  restockQuantity,
  tradeable,
  vendors,
} from "./economy";
import { REPUTATION_BANDS } from "./factions";
import { items } from "./items";
import { VENDOR_STOCK } from "./world";

/**
 * Content lint for the economy. The prices themselves are tuning and
 * will move; what must never move is that every item has exactly one
 * worth, every counter has a spread that pays less than it charges, and
 * every restock row points at a line that exists.
 */

describe("item worth", () => {
  const catalogIds = [...items, ...dyeItems].map((item) => item.id);

  it("prices every item in the game, exactly once", () => {
    for (const id of catalogIds) {
      expect(ITEM_VALUES[id], `no worth for "${id}"`).toBeDefined();
    }
  });

  it("carries no worth for an item that no longer exists", () => {
    for (const id of Object.keys(ITEM_VALUES)) {
      expect(catalogIds, `stray worth for "${id}"`).toContain(id);
    }
  });

  it("treats a worth of nothing as not merchandise", () => {
    // Story papers, keys and writs: carried, never traded, and the
    // zero is the only reading of that fact anywhere.
    expect(itemValue("msc-auric-writ")).toBe(0);
    expect(tradeable("msc-auric-writ")).toBe(false);
    expect(tradeable("wpn-rail-spitter")).toBe(true);
    // An id this build has never heard of fails the safe way.
    expect(itemValue("wpn-nothing-at-all")).toBe(0);
    expect(tradeable("wpn-nothing-at-all")).toBe(false);
  });

  it("agrees with the chapel's own shelf on what a tin is worth", () => {
    // The chapel is a hand-authored counter (Vesper charges for colour
    // and throws the application in), so its prices are not derived —
    // but they must not *disagree* with what the rest of the city
    // thinks a tin is worth, or the same object has two prices.
    for (const entry of CHAPEL_DYE_SHELF) {
      expect(itemValue(entry.itemId), entry.itemId).toBe(entry.price);
    }
  });

  it("prices every kind but story papers above nothing", () => {
    for (const item of [...items, ...dyeItems]) {
      if (item.kind === "misc") continue;
      expect(itemValue(item.id), item.id).toBeGreaterThanOrEqual(PRICE_FLOOR);
    }
  });
});

describe("counters", () => {
  it("registers each vendor once, under a known kind and faction", () => {
    expect(vendors.map((vendor) => vendor.id).sort()).toEqual(
      [...VENDOR_IDS].sort(),
    );
    for (const vendor of vendors) {
      expect(VENDOR_KINDS).toContain(vendor.kind);
      expect(requireVendor(vendor.id)).toBe(vendor);
      expect(isVendorId(vendor.id)).toBe(true);
    }
    expect(getVendor("nobody-at-all")).toBeUndefined();
    expect(isVendorId("nobody-at-all")).toBe(false);
    expect(() => requireVendor("nobody-at-all")).toThrow(/unknown|No vendor/i);
  });

  it("pays less than it charges, at every counter", () => {
    for (const kind of VENDOR_KINDS) {
      const spread = VENDOR_SPREADS[kind];
      expect(spread.sell, kind).toBeGreaterThan(0);
      // The whole economy rests on this gap; a swap meet is a spread of
      // one, and this must never become one by re-tuning.
      expect(spread.sell, kind).toBeLessThan(spread.buy * 0.75);
    }
  });

  it("has both shapes of counter in play", () => {
    const kinds = new Set(vendors.map((vendor) => vendor.kind));
    expect(kinds.has("stall")).toBe(true);
    expect(kinds.has("licensed")).toBe(true);
  });

  it("stocks every registered counter", () => {
    for (const vendorId of VENDOR_IDS) {
      const lines = VENDOR_STOCK.filter(
        (entry) => entry.vendorId === vendorId,
      );
      expect(lines.length, vendorId).toBeGreaterThan(0);
    }
  });
});

describe("condition", () => {
  it("only ever discounts, and never to nothing", () => {
    expect(CONDITION_MODIFIERS.new.factor).toBe(1);
    for (const condition of ITEM_CONDITIONS) {
      const factor = CONDITION_MODIFIERS[condition].factor;
      expect(factor, condition).toBeGreaterThan(0);
      expect(factor, condition).toBeLessThanOrEqual(1);
    }
    expect(CONDITION_MODIFIERS.salvage.factor).toBeLessThan(
      CONDITION_MODIFIERS.used.factor,
    );
  });
});

describe("standing discounts", () => {
  it("names real bands, and pays more the higher they go", () => {
    const bandIds = REPUTATION_BANDS.map((band) => band.id);
    let previousFloor = -Infinity;
    let previousFraction = 0;
    for (const discount of STANDING_DISCOUNTS) {
      expect(bandIds, discount.band).toContain(discount.band);
      const floor =
        REPUTATION_BANDS.find((band) => band.id === discount.band)?.min ?? 0;
      expect(floor).toBeGreaterThan(previousFloor);
      expect(discount.fraction).toBeGreaterThan(previousFraction);
      // A "discount" that halves the city would break the sell/buy gap.
      expect(discount.fraction).toBeLessThan(0.25);
      previousFloor = floor;
      previousFraction = discount.fraction;
    }
  });
});

describe("haggling", () => {
  it("is worth something, but never certain", () => {
    expect(HAGGLE.step).toBeGreaterThan(0);
    expect(HAGGLE.step).toBeLessThan(0.25);
    expect(HAGGLE.maxChance).toBeLessThan(1);
  });

  it("is closed below the Cool floor and climbs with it", () => {
    expect(haggleChance(HAGGLE.minCool - 1)).toBe(0);
    expect(haggleChance(HAGGLE.minCool)).toBeGreaterThan(0);
    expect(haggleChance(10)).toBeGreaterThan(haggleChance(6));
    expect(haggleChance(1000)).toBe(HAGGLE.maxChance);
  });
});

describe("restock table", () => {
  it("only ever restocks a line that exists at that counter", () => {
    for (const row of VENDOR_RESTOCK) {
      const entry = VENDOR_STOCK.find((line) => line.id === row.entryId);
      expect(entry, row.entryId).toBeDefined();
      expect(entry?.vendorId, row.entryId).toBe(row.vendorId);
      expect(row.quantity, row.entryId).toBeGreaterThan(0);
      expect(row.act, row.entryId).toBeGreaterThanOrEqual(1);
    }
  });

  it("puts out one of an unlisted line, every act", () => {
    expect(restockQuantity("wet-market-back", "buy-cordon-plate", 1)).toBe(
      DEFAULT_RESTOCK,
    );
    expect(restockQuantity("wet-market-back", "buy-cordon-plate", 3)).toBe(
      DEFAULT_RESTOCK,
    );
  });

  it("reads a row forwards: the latest row at or below the act wins", () => {
    // Quill's patches: 3 from act 1, 4 from act 2 onwards.
    expect(restockQuantity("vm-broker-counter", "quill-patch", 1)).toBe(3);
    expect(restockQuantity("vm-broker-counter", "quill-patch", 2)).toBe(4);
    expect(restockQuantity("vm-broker-counter", "quill-patch", 3)).toBe(4);
  });

  it("puts out nothing before the act its row starts in", () => {
    // The Exchange's frame is a two-per-act line only in act 3; before
    // that it is the unlisted default.
    expect(restockQuantity("wet-market-back", "buy-torsion-frame", 2)).toBe(
      DEFAULT_RESTOCK,
    );
    expect(restockQuantity("wet-market-back", "buy-torsion-frame", 3)).toBe(2);
  });
});
