/**
 * What a vendor has on the shelf tonight.
 *
 * The selector and the shop's actual dialogue choices are two views of
 * one decision: `vendorChoices` (src/data/world.ts) builds each choice's
 * requirements out of the *same* condition requirement arrays this
 * function filters on, plus the price. So this answers "what is
 * stocked" and the choice list answers "what can be bought right now",
 * and the only difference between them is the player's balance — which
 * is exactly the difference a shop should have. vendor.test.ts pins the
 * two together against a spread of world states.
 */
import { VENDOR_STOCK, type VendorId, type VendorStockEntry } from "../data/world";
import { conditionsAllow, type WorldState } from "./state";

/** The entries this vendor is carrying, in authored order. */
export function vendorStock(
  vendorId: VendorId,
  world: WorldState,
): VendorStockEntry[] {
  return VENDOR_STOCK.filter(
    (entry) => entry.vendorId === vendorId && conditionsAllow(world, entry),
  );
}

/** Everything a vendor could ever carry, live or not — for content lint. */
export function vendorCatalog(vendorId: VendorId): VendorStockEntry[] {
  return VENDOR_STOCK.filter((entry) => entry.vendorId === vendorId);
}

/** What one item costs at this vendor now, or undefined when unstocked. */
export function vendorPrice(
  vendorId: VendorId,
  itemId: string,
  world: WorldState,
): number | undefined {
  return vendorStock(vendorId, world).find((entry) => entry.itemId === itemId)
    ?.price;
}
