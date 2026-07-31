import { currentAct } from "../data/acts";
import {
  CARRIED_CONDITION,
  SEALED_CONDITION,
  itemValue,
  requireVendor,
  restockQuantity,
  tradeable,
  type ItemCondition,
  type Vendor,
} from "../data/economy";
import { getItem } from "../data/items";
import type { VendorStockEntry } from "../data/world";
import { isStackable, type Item } from "../inventory/items";
import { normalizeMods } from "../inventory/mods";
import type { ItemStack } from "../inventory/inventory";
import type { GameState } from "../state/gameState";
import {
  ledgerFor,
  soldCount,
  type HaggleState,
  type VendorLedger,
} from "../state/vendors";
import { deriveWorldState, type WorldState } from "../world/state";
import { vendorStock } from "../world/vendor";
import { priceQuote, type PriceQuote } from "./price";
import { standingRate, type StandingRate } from "./standing";

/**
 * A counter, as a run sees it: what is on the shelf tonight, what it
 * costs *this player*, and what the counter will pay for what they are
 * carrying.
 *
 * This is the only join between the pure price model and a GameState.
 * What is stocked still comes from the reactive world layer
 * (`vendorStock`) — one source of truth for stock, with restocks
 * layered on as counts rather than as a second shelf — and every figure
 * comes from `priceQuote`, so the number on a row and the number a
 * purchase charges cannot disagree.
 */

/** The counter as a whole, before any one line of it. */
export interface VendorView {
  vendor: Vendor;
  /** The chapter the run is in; the unit the shelf and the ledger turn on. */
  act: number;
  ledger: VendorLedger;
  /** The friend's rate this run has earned here, or null. */
  standing: StandingRate | null;
  haggle: HaggleState;
  credits: number;
}

/** One line on the shelf, priced for this player. */
export interface ShelfLine {
  entry: VendorStockEntry;
  item: Item;
  /** Copies left this act. Zero is still shown — sold out is information. */
  remaining: number;
  /** What the counter put out this act, before any were bought. */
  stocked: number;
  quote: PriceQuote;
  affordable: boolean;
}

/** One thing in the bag this counter will take, priced. */
export interface SellLine {
  /** Which carried stack; a copy is addressed by index, never by id. */
  stackIndex: number;
  itemId: string;
  item: Item;
  /** Copies in the stack; a sale moves exactly one of them. */
  quantity: number;
  condition: ItemCondition;
  /** Worth of the parts fitted into this copy, folded into the quote. */
  fittedValue: number;
  quote: PriceQuote;
}

/**
 * The counter's own state for this run, this act. No world state: what
 * the city is doing decides what is *stocked*, never what the counter
 * thinks of you.
 */
export function vendorView(state: GameState, vendorId: string): VendorView {
  const vendor = requireVendor(vendorId);
  const act = currentAct(state.flags);
  const ledger = ledgerFor(state.vendors, vendor.id, act);
  return {
    vendor,
    act,
    ledger,
    standing: standingRate(state.reputation, vendor),
    haggle: ledger.haggle,
    credits: state.credits,
  };
}

/** What this counter charges this player for one of its lines. */
export function buyQuote(
  view: VendorView,
  entry: VendorStockEntry,
): PriceQuote {
  return priceQuote({
    side: "buy",
    vendor: view.vendor,
    itemId: entry.itemId,
    condition: entry.condition ?? "new",
    premium: entry.premium ?? 0,
    discount: view.standing?.fraction ?? 0,
    discountLabel: standingLabel(view),
    haggled: view.haggle === "won",
  });
}

/**
 * The counter's list price for a line: what it charges somebody it has
 * never met, with no standing and no argument behind them. This is the
 * number a scene should quote when it names a price in prose, and the
 * ceiling every player price sits at or below.
 */
export function listPrice(
  vendorId: string,
  entry: VendorStockEntry,
): number {
  return priceQuote({
    side: "buy",
    vendor: requireVendor(vendorId),
    itemId: entry.itemId,
    condition: entry.condition ?? "new",
    premium: entry.premium ?? 0,
  }).price;
}

/** What this counter pays this player for one carried copy. */
export function sellQuote(
  view: VendorView,
  stack: ItemStack,
  item: Item,
): PriceQuote {
  return priceQuote({
    side: "sell",
    vendor: view.vendor,
    itemId: item.id,
    condition: conditionOf(item),
    extraValue: fittedValue(stack, item),
    discount: view.standing?.fraction ?? 0,
    discountLabel: standingLabel(view),
    haggled: view.haggle === "won",
  });
}

/** "Trusted here — The Vertical Market", or nothing to say. */
function standingLabel(view: VendorView): string | undefined {
  return view.standing?.label;
}

/**
 * What shape a carried copy is in. Anything worn, fired or installed is
 * second-hand; anything that stacks is still sealed, because a stack is
 * by definition a thing nobody has opened.
 */
export function conditionOf(item: Item): ItemCondition {
  return isStackable(item) ? SEALED_CONDITION : CARRIED_CONDITION;
}

/** Worth of the parts fitted into this copy of a weapon. */
export function fittedValue(stack: ItemStack, item: Item): number {
  if (item.kind !== "weapon" || !stack.mods) return 0;
  return normalizeMods(item, stack.mods, resolveOrThrow).reduce(
    (sum, modId) => sum + (modId === null ? 0 : itemValue(modId)),
    0,
  );
}

/** normalizeMods wants a throwing resolver; unknown ids drop out anyway. */
function resolveOrThrow(id: string): Item {
  const item = getItem(id);
  if (!item) throw new Error(`Unknown item "${id}"`);
  return item;
}

/**
 * The shelf tonight, in authored order: every line the city is letting
 * this counter carry, with what is left of this act's stock and what it
 * costs this player. Sold-out lines stay on the shelf — an empty hook
 * is a fact about the week, not a missing offer.
 */
export function vendorShelf(
  state: GameState,
  vendorId: string,
  world: WorldState = deriveWorldState(state),
): ShelfLine[] {
  const view = vendorView(state, vendorId);
  const lines: ShelfLine[] = [];
  for (const entry of vendorStock(view.vendor.id, world)) {
    const item = getItem(entry.itemId);
    // Content that has moved on: a line whose item this build no longer
    // has simply is not on the shelf, rather than crashing the screen.
    if (!item) continue;
    const stocked = restockQuantity(view.vendor.id, entry.id, view.act);
    const remaining = Math.max(0, stocked - soldCount(view.ledger, entry.id));
    const quote = buyQuote(view, entry);
    lines.push({
      entry,
      item,
      remaining,
      stocked,
      quote,
      affordable: state.credits >= quote.price,
    });
  }
  return lines;
}

/** One shelf line by id, or undefined when the city took it off. */
export function shelfLine(
  state: GameState,
  vendorId: string,
  entryId: string,
  world: WorldState = deriveWorldState(state),
): ShelfLine | undefined {
  return vendorShelf(state, vendorId, world).find(
    (line) => line.entry.id === entryId,
  );
}

/**
 * What the player can put on this counter: every carried stack worth
 * anything, in bag order. Story papers, keys and writs are worth
 * nothing by construction (see ITEM_VALUES) and are therefore never
 * listed — a quest item cannot be sold because it has no price, not
 * because a screen hides it.
 *
 * Equipped gear is not here either, and needs no rule: worn and
 * installed pieces are not in the bag.
 *
 * What the city is doing has no say in what a counter will *take*, so
 * this reads no world state — only the shelf does.
 */
export function vendorSellables(
  state: GameState,
  vendorId: string,
): SellLine[] {
  const view = vendorView(state, vendorId);
  const lines: SellLine[] = [];
  state.inventory.stacks.forEach((stack, stackIndex) => {
    const item = getItem(stack.itemId);
    if (!item || !tradeable(item.id)) return;
    lines.push({
      stackIndex,
      itemId: item.id,
      item,
      quantity: stack.quantity,
      condition: conditionOf(item),
      fittedValue: fittedValue(stack, item),
      quote: sellQuote(view, stack, item),
    });
  });
  return lines;
}
