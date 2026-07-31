/**
 * What a vendor has on the shelf tonight.
 *
 * Stock only. What a line *costs* is a different question with a
 * different answer per player (see src/economy/), and keeping the two
 * apart is what lets the counter screen price a shelf without the world
 * layer ever learning that credits exist. This module answers "what is
 * the city letting them carry"; everything else about the offer is
 * derived from that answer.
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

/** The live line for one item at this vendor, or undefined when unstocked. */
export function vendorEntry(
  vendorId: VendorId,
  itemId: string,
  world: WorldState,
): VendorStockEntry | undefined {
  return vendorStock(vendorId, world).find((entry) => entry.itemId === itemId);
}
