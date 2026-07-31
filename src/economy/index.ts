/**
 * The vendor economy: what a thing is worth, what a counter does to
 * that, and the three moves a player can make across one.
 *
 * Three layers, the same shape as the reactive world layer next door —
 * content in src/data/economy.ts, pure arithmetic here, and one screen
 * (src/ui/vendorOverlay.ts) that renders what these functions return
 * and computes nothing of its own.
 */
export {
  priceQuote,
  quoteBalances,
  quotedPrice,
  type PriceContext,
  type PriceLine,
  type PriceQuote,
  type PriceSide,
} from "./price";
export { standingRate, type StandingRate } from "./standing";
export {
  canAttemptHaggle,
  haggleAttempt,
  haggleRoll,
  haggleSeed,
  type HaggleAttempt,
  type HaggleContext,
} from "./haggle";
export {
  buyQuote,
  conditionOf,
  fittedValue,
  listPrice,
  sellQuote,
  shelfLine,
  vendorSellables,
  vendorShelf,
  vendorView,
  type SellLine,
  type ShelfLine,
  type VendorView,
} from "./shelf";
export {
  buyFromVendor,
  haggleWithVendor,
  sellToVendor,
  type BuyResult,
  type HaggleResult,
  type SellResult,
} from "./counter";
