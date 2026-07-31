import { describe, expect, it } from "vitest";
import {
  HAGGLE,
  ITEM_CONDITIONS,
  ITEM_VALUES,
  PRICE_FLOOR,
  STANDING_DISCOUNTS,
  VENDOR_SPREADS,
  itemValue,
  requireVendor,
  tradeable,
  vendors,
  type ItemCondition,
  type Vendor,
} from "../data/economy";
import { priceQuote, quoteBalances, quotedPrice } from "./price";

/**
 * The price model. Three promises, and the third is the one that keeps
 * the game from turning into a money printer:
 *
 *  1. Every price is the item's worth plus the modifiers, in order.
 *  2. The breakdown adds up exactly — the screen never rounds a lie.
 *  3. No stack of modifiers ever makes selling profitable, and no stack
 *     ever makes anything free.
 */

const stall = requireVendor("wet-market-back");
const licensed = requireVendor("vm-broker-counter");

const RAIL = "wpn-rail-spitter"; // worth 320

describe("derivation", () => {
  it("charges a stall the item's own worth", () => {
    const quote = priceQuote({ side: "buy", vendor: stall, itemId: RAIL });
    expect(quote.base).toBe(320);
    expect(quote.price).toBe(320);
    // Nothing moved it, so there is nothing to explain.
    expect(quote.lines).toEqual([]);
  });

  it("charges a bonded counter its markup, and says so", () => {
    const quote = priceQuote({ side: "buy", vendor: licensed, itemId: RAIL });
    expect(quote.price).toBe(Math.round(320 * VENDOR_SPREADS.licensed.buy));
    expect(quote.lines.map((line) => line.id)).toEqual(["spread"]);
    expect(quote.lines[0]?.amount).toBe(quote.price - 320);
  });

  it("pays a fraction of worth, and pays worse on the street", () => {
    const atStall = quotedPrice({ side: "sell", vendor: stall, itemId: RAIL });
    const atLedger = quotedPrice({
      side: "sell",
      vendor: licensed,
      itemId: RAIL,
    });
    expect(atStall).toBe(Math.round(320 * VENDOR_SPREADS.stall.sell));
    expect(atLedger).toBeGreaterThan(atStall);
  });

  it("adds a flat risk premium on a purchase only", () => {
    const hot = priceQuote({
      side: "buy",
      vendor: stall,
      itemId: RAIL,
      premium: 100,
    });
    expect(hot.price).toBe(420);
    expect(hot.lines.find((line) => line.id === "premium")?.amount).toBe(100);
    // A counter does not pay you extra for having brought it something
    // hot; the premium is what it charges for holding one.
    const sold = priceQuote({
      side: "sell",
      vendor: stall,
      itemId: RAIL,
      premium: 100,
    });
    expect(sold.lines.some((line) => line.id === "premium")).toBe(false);
  });

  it("discounts second-hand and salvage, in that order", () => {
    const asNew = quotedPrice({ side: "buy", vendor: licensed, itemId: RAIL });
    const used = quotedPrice({
      side: "buy",
      vendor: licensed,
      itemId: RAIL,
      condition: "used",
    });
    const salvage = quotedPrice({
      side: "buy",
      vendor: licensed,
      itemId: RAIL,
      condition: "salvage",
    });
    expect(used).toBeLessThan(asNew);
    expect(salvage).toBeLessThan(used);
  });

  it("folds fitted parts into what the object is worth", () => {
    const bare = quotedPrice({ side: "sell", vendor: licensed, itemId: RAIL });
    const scoped = priceQuote({
      side: "sell",
      vendor: licensed,
      itemId: RAIL,
      extraValue: itemValue("mod-smartlink-sight"),
    });
    expect(scoped.price).toBeGreaterThan(bare);
    expect(scoped.lines[0]?.id).toBe("parts");
    // The parts land before the spread, so the counter's rate applies
    // to the object in front of it rather than to the bill of materials.
    expect(scoped.lines[0]?.amount).toBe(itemValue("mod-smartlink-sight"));
  });

  it("takes standing off a purchase and puts it onto a sale", () => {
    const fraction = STANDING_DISCOUNTS[0]?.fraction ?? 0;
    const bought = priceQuote({
      side: "buy",
      vendor: stall,
      itemId: RAIL,
      discount: fraction,
      discountLabel: "Known here",
    });
    const sold = priceQuote({
      side: "sell",
      vendor: stall,
      itemId: RAIL,
      discount: fraction,
    });
    expect(bought.price).toBeLessThan(320);
    expect(bought.lines.find((line) => line.id === "standing")?.label).toBe(
      "Known here",
    );
    expect(sold.price).toBeGreaterThan(
      quotedPrice({ side: "sell", vendor: stall, itemId: RAIL }),
    );
  });

  it("shifts a won argument the player's way on both sides", () => {
    const bought = quotedPrice({
      side: "buy",
      vendor: stall,
      itemId: RAIL,
      haggled: true,
    });
    const sold = quotedPrice({
      side: "sell",
      vendor: stall,
      itemId: RAIL,
      haggled: true,
    });
    expect(bought).toBe(Math.round(320 * (1 - HAGGLE.step)));
    expect(sold).toBeGreaterThan(
      quotedPrice({ side: "sell", vendor: stall, itemId: RAIL }),
    );
  });

  it("applies its modifiers in a fixed reading order", () => {
    const quote = priceQuote({
      side: "buy",
      vendor: licensed,
      itemId: RAIL,
      extraValue: 40,
      condition: "used",
      premium: 25,
      discount: 0.12,
      haggled: true,
    });
    expect(quote.lines.map((line) => line.id)).toEqual([
      "parts",
      "spread",
      "condition",
      "premium",
      "standing",
      "haggle",
    ]);
  });
});

describe("itemization", () => {
  it("adds up exactly, on every combination there is", () => {
    for (const vendor of vendors) {
      for (const side of ["buy", "sell"] as const) {
        for (const condition of ITEM_CONDITIONS) {
          for (const haggled of [false, true]) {
            const quote = priceQuote({
              side,
              vendor,
              itemId: RAIL,
              condition,
              premium: 100,
              extraValue: 90,
              discount: 0.12,
              haggled,
            });
            expect(quoteBalances(quote), `${vendor.id} ${side}`).toBe(true);
          }
        }
      }
    }
  });

  it("says nothing about a modifier that moved nothing", () => {
    const quote = priceQuote({
      side: "buy",
      vendor: stall,
      itemId: RAIL,
      condition: "new",
      premium: 0,
      discount: 0,
      haggled: false,
    });
    expect(quote.lines).toEqual([]);
  });
});

/**
 * The exploit sweep: every counter, every side, every condition, every
 * standing, with and without a won argument, over every priced item in
 * the game. Nothing here is allowed to be free, and nothing is allowed
 * to be worth more sold than bought — including across counters, which
 * is the arbitrage a two-vendor economy invites.
 */
describe("no price exploits", () => {
  const CONDITIONS: ItemCondition[] = [...ITEM_CONDITIONS];
  const DISCOUNTS = [0, ...STANDING_DISCOUNTS.map((entry) => entry.fraction)];
  const PRICED = Object.keys(ITEM_VALUES).filter(tradeable);

  function sweep(
    side: "buy" | "sell",
    itemId: string,
    pick: (price: number) => void,
  ): void {
    for (const vendor of vendors) {
      for (const condition of CONDITIONS) {
        for (const discount of DISCOUNTS) {
          for (const haggled of [false, true]) {
            pick(
              quotedPrice({ side, vendor, itemId, condition, discount, haggled }),
            );
          }
        }
      }
    }
  }

  it("never quotes a price below the floor, on either side", () => {
    for (const itemId of PRICED) {
      for (const side of ["buy", "sell"] as const) {
        sweep(side, itemId, (price) => {
          expect(price, `${itemId} ${side}`).toBeGreaterThanOrEqual(PRICE_FLOOR);
          expect(Number.isInteger(price), `${itemId} ${side}`).toBe(true);
        });
      }
    }
  });

  it("never pays more for a thing than the cheapest counter charges", () => {
    for (const itemId of PRICED) {
      let cheapestBuy = Infinity;
      let dearestSell = -Infinity;
      sweep("buy", itemId, (price) => {
        cheapestBuy = Math.min(cheapestBuy, price);
      });
      sweep("sell", itemId, (price) => {
        dearestSell = Math.max(dearestSell, price);
      });
      expect(dearestSell, `${itemId} round trip`).toBeLessThan(cheapestBuy);
    }
  });

  it("cannot be pumped by fitting parts into a weapon first", () => {
    // Parts are worth what they are worth on both sides, so a fitted
    // weapon can never be worth more sold than its pieces cost.
    const partsWorth = itemValue("mod-smartlink-sight") + itemValue("mod-gyro-sleeve");
    let dearest = -Infinity;
    for (const vendor of vendors) {
      for (const haggled of [false, true]) {
        for (const discount of DISCOUNTS) {
          dearest = Math.max(
            dearest,
            quotedPrice({
              side: "sell",
              vendor,
              itemId: RAIL,
              extraValue: partsWorth,
              discount,
              haggled,
            }),
          );
        }
      }
    }
    expect(dearest).toBeLessThan(itemValue(RAIL) + partsWorth);
  });

  it("keeps the gap at a counter that likes you and has been argued down", () => {
    for (const vendor of vendors as readonly Vendor[]) {
      const best = STANDING_DISCOUNTS[STANDING_DISCOUNTS.length - 1]?.fraction ?? 0;
      const buy = quotedPrice({
        side: "buy",
        vendor,
        itemId: RAIL,
        discount: best,
        haggled: true,
      });
      const sell = quotedPrice({
        side: "sell",
        vendor,
        itemId: RAIL,
        discount: best,
        haggled: true,
      });
      expect(sell, vendor.id).toBeLessThan(buy);
    }
  });
});
