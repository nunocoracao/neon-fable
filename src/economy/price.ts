import {
  CONDITION_MODIFIERS,
  HAGGLE,
  PRICE_FLOOR,
  VENDOR_SPREADS,
  itemValue,
  type ItemCondition,
  type Vendor,
} from "../data/economy";

/**
 * One price, and every reason it is that number.
 *
 * `priceQuote` is the whole of the game's pricing: a purchase, a sale,
 * a shop label and a haggle preview are all the same call with a
 * different context. Nothing else in the codebase may multiply an item
 * value by anything.
 *
 * The quote is *itemized by construction*. Each modifier is applied to
 * the running figure and records the credits it moved, rounded at each
 * step, so `base + sum(lines) === price` exactly — the screen can print
 * the breakdown without re-deriving anything, and a breakdown that does
 * not add up is impossible rather than merely untested.
 *
 * Order matters and is fixed: what the thing is worth, what else is on
 * it, what the counter is, what shape it is in, what the street is
 * charging for the risk, who you are to them, and what you talked them
 * into. Reading the lines top to bottom is the sentence the price makes.
 */

export type PriceSide = "buy" | "sell";

/** One reason the price is not simply the item's worth. */
export interface PriceLine {
  /** Stable id, for tests and for keying the row. */
  id: string;
  label: string;
  /** Credits this modifier moved: positive up, negative down. */
  amount: number;
}

export interface PriceQuote {
  side: PriceSide;
  itemId: string;
  /** The item's worth before any counter touched it. */
  base: number;
  /** Every modifier, in application order. */
  lines: PriceLine[];
  /** What is actually paid or received. Always >= PRICE_FLOOR. */
  price: number;
}

/** Everything a price depends on beyond the item itself. */
export interface PriceContext {
  side: PriceSide;
  vendor: Vendor;
  itemId: string;
  /** How worn the offer is; defaults to unopened. */
  condition?: ItemCondition;
  /**
   * Worth carried by things attached to the item — parts fitted into a
   * weapon's sockets. Folded in before the spread, because a counter
   * prices the object in front of it, not its bill of materials.
   */
  extraValue?: number;
  /** Flat credits the street is charging for the risk on this line. */
  premium?: number;
  /**
   * The friend's rate this run has earned at this counter, as a
   * fraction (see STANDING_DISCOUNTS). Resolved by the caller from the
   * reputation ledger; the arithmetic never reads a faction.
   */
  discount?: number;
  /** A won argument is live at this counter. */
  haggled?: boolean;
  /** Label for the standing line; defaults to a plain one. */
  discountLabel?: string;
}

/**
 * Accumulates modifiers, keeping the running figure and the lines in
 * step.
 *
 * The arithmetic is carried exactly and only *shown* rounded: a line's
 * amount is the difference between two rounded snapshots, so the lines
 * always sum to the final figure AND the final figure is one rounding
 * of the whole product. Rounding at every step instead would compound —
 * three modifiers each rounding a half-credit up turn a 15.5 into a 17,
 * which is how a cheap consumable becomes worth more sold than bought.
 */
class Running {
  /** The unrounded figure; what every later modifier multiplies. */
  private exact: number;
  /** The rounded figure the lines so far add up to. */
  private shown: number;
  readonly lines: PriceLine[] = [];

  constructor(base: number) {
    this.exact = base;
    this.shown = base;
  }

  get value(): number {
    return this.shown;
  }

  /** Applies a multiplier, recording what it moved. */
  scale(id: string, label: string, factor: number): void {
    this.moveTo(id, label, this.exact * factor);
  }

  /** Applies a flat credit change, recording it. */
  shift(id: string, label: string, amount: number): void {
    this.moveTo(id, label, this.exact + amount);
  }

  /**
   * A modifier that does not move the rounded figure says nothing —
   * it still moves the exact one, so a run of small modifiers can still
   * add up to a credit between them.
   */
  private moveTo(id: string, label: string, next: number): void {
    this.exact = next;
    const rounded = Math.round(next);
    const amount = rounded - this.shown;
    if (amount === 0) return;
    this.shown = rounded;
    this.lines.push({ id, label, amount });
  }
}

/**
 * What this counter charges, or pays, for this thing, right now.
 *
 * The floor is the last word: any stack of modifiers that would land at
 * nothing (or below it) is pulled back up to PRICE_FLOOR and says so on
 * its own line, so a price is never zero, never negative, and never
 * silently rounded into one.
 */
export function priceQuote(context: PriceContext): PriceQuote {
  const { side, vendor } = context;
  const spread = VENDOR_SPREADS[vendor.kind];
  const base = itemValue(context.itemId);
  const running = new Running(base);

  if (context.extraValue) {
    running.shift("parts", "Fitted parts", context.extraValue);
  }

  running.scale(
    "spread",
    side === "buy" ? `${spread.label} markup` : `${spread.label} resale rate`,
    side === "buy" ? spread.buy : spread.sell,
  );

  const condition = context.condition ?? "new";
  if (condition !== "new") {
    const modifier = CONDITION_MODIFIERS[condition];
    running.scale("condition", modifier.label, modifier.factor);
  }

  // A stall's risk premium is flat and only ever on a purchase: it is
  // what the keeper charges for holding something hot, not a property
  // of the thing.
  if (side === "buy" && context.premium) {
    running.shift("premium", "Risk premium", context.premium);
  }

  if (context.discount) {
    running.scale(
      "standing",
      context.discountLabel ?? "Standing",
      side === "buy" ? 1 - context.discount : 1 + context.discount,
    );
  }

  if (context.haggled) {
    running.scale(
      "haggle",
      "Haggled",
      side === "buy" ? 1 - HAGGLE.step : 1 + HAGGLE.step,
    );
  }

  if (running.value < PRICE_FLOOR) {
    running.shift("floor", "Minimum", PRICE_FLOOR - running.value);
  }

  return {
    side,
    itemId: context.itemId,
    base,
    lines: running.lines,
    price: running.value,
  };
}

/** The number alone, for callers that do not show the reasons. */
export function quotedPrice(context: PriceContext): number {
  return priceQuote(context).price;
}

/** True when a quote's lines account for the whole difference. */
export function quoteBalances(quote: PriceQuote): boolean {
  return (
    quote.base + quote.lines.reduce((sum, line) => sum + line.amount, 0) ===
    quote.price
  );
}
