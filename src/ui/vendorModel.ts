import { actTitle } from "../data/acts";
import { HAGGLE, haggleChance, type ItemCondition } from "../data/economy";
import { factions } from "../data/factions";
import {
  canAttemptHaggle,
  vendorSellables,
  vendorShelf,
  vendorView,
  type PriceQuote,
  type SellLine,
  type ShelfLine,
} from "../economy";
import { effectiveStats } from "../inventory";
import type { GameState } from "../state/gameState";
import type { HaggleState } from "../state/vendors";
import { itemSummary, percentLabel } from "./format";
import { t } from "./strings";

/**
 * The counter screen, as data.
 *
 * Pure over a GameState: every figure comes from the economy layer's
 * own quotes, and the breakdown a row shows is the quote's own lines
 * rather than a second derivation for display. If the panel says a
 * price is 288, the purchase charges 288, because they are the same
 * object — the same split combatHud/combatHudView and workbenchModel
 * use, and the reason none of this needs a DOM to test.
 */

export type VendorTab = "buy" | "sell";

/** One modifier as the breakdown prints it. */
export interface PriceLineView {
  label: string;
  /** "+100 cr" / "−32 cr", already signed. */
  amount: string;
}

/**
 * A price and every reason for it. `summary` is the one-line version
 * the row shows on hover (the title attribute); `lines` is the same
 * thing itemized for the expanded breakdown.
 */
export interface PriceView {
  /** The item's own worth, before any counter touched it. */
  base: number;
  price: number;
  /** "288 cr". */
  label: string;
  /** "Worth 320 cr" — what the row prints beside the price. */
  baseLabel: string;
  lines: PriceLineView[];
  /** Every line on one line, for a tooltip. */
  summary: string;
  /** True when this counter is not charging list price. */
  adjusted: boolean;
}

export interface BuyRowView {
  entryId: string;
  itemId: string;
  name: string;
  /** Why it is on this shelf, when the line says. */
  note: string | null;
  summary: string;
  price: PriceView;
  /** "1 left this chapter" / "Sold out this chapter". */
  stockLabel: string;
  remaining: number;
  affordable: boolean;
  /** False when it is sold out or unaffordable — the button is dead. */
  buyable: boolean;
}

export interface SellRowView {
  stackIndex: number;
  itemId: string;
  name: string;
  summary: string;
  /** "Second-hand" / "Unopened" — what the counter is pricing. */
  conditionLabel: string;
  price: PriceView;
  /** Copies in the bag; a sale moves one. */
  quantity: number;
}

export interface HaggleView {
  state: HaggleState;
  /** What the button says. */
  label: string;
  /** One line of where the argument stands. */
  hint: string;
  /** "48%" while an attempt is still possible, else null. */
  chanceLabel: string | null;
  /** False when spent, lost, or the player is too cold to try. */
  canTry: boolean;
}

export interface VendorModel {
  vendorId: string;
  title: string;
  keeper: string;
  /** "Street stall · The Cistern Court's books". */
  kindLabel: string;
  blurb: string;
  /** "Act 2 — The Cordon": the unit stock and arguments turn over on. */
  actLabel: string;
  credits: number;
  /** The friend's rate this run has earned here, or null. */
  standingLabel: string | null;
  haggle: HaggleView;
  tab: VendorTab;
  buy: BuyRowView[];
  sell: SellRowView[];
}

const CONDITION_LABELS: Record<ItemCondition, string> = {
  new: "Unopened",
  used: "Second-hand",
  salvage: "Salvage",
};

/** "+100 cr" / "−32 cr" — a real minus sign, because it is prose. */
export function creditDelta(amount: number): string {
  return `${amount < 0 ? "−" : "+"}${Math.abs(amount)} cr`;
}

/** A quote as the screen reads it, breakdown and all. */
export function priceView(quote: PriceQuote): PriceView {
  const lines = quote.lines.map((line) => ({
    label: line.label,
    amount: creditDelta(line.amount),
  }));
  return {
    base: quote.base,
    price: quote.price,
    label: t("counter.credits", { credits: quote.price }),
    baseLabel: t("vendor.worth", { credits: quote.base }),
    lines,
    summary: [
      t("vendor.worth", { credits: quote.base }),
      ...lines.map((line) => `${line.label} ${line.amount}`),
      quote.side === "buy"
        ? t("vendor.youPay", { credits: quote.price })
        : t("vendor.youGet", { credits: quote.price }),
    ].join(" · "),
    adjusted: lines.length > 0,
  };
}

/** "2 left this chapter", and the empty hook it turns into. */
export function stockLabel(line: ShelfLine): string {
  if (line.remaining <= 0) return t("vendor.stock.out");
  return t("vendor.stock", {
    remaining: line.remaining,
    stocked: line.stocked,
  });
}

function buyRow(line: ShelfLine, credits: number): BuyRowView {
  const price = priceView(line.quote);
  const affordable = credits >= line.quote.price;
  return {
    entryId: line.entry.id,
    itemId: line.item.id,
    name: line.item.name,
    note: line.entry.note ?? null,
    summary: itemSummary(line.item),
    price,
    stockLabel: stockLabel(line),
    remaining: line.remaining,
    affordable,
    buyable: affordable && line.remaining > 0,
  };
}

function sellRow(line: SellLine): SellRowView {
  return {
    stackIndex: line.stackIndex,
    itemId: line.itemId,
    name: line.item.name,
    summary: itemSummary(line.item),
    conditionLabel: CONDITION_LABELS[line.condition],
    price: priceView(line.quote),
    quantity: line.quantity,
  };
}

/**
 * Where the argument stands, in the counter's own terms. A player too
 * cold to try is told the number they need rather than shown a dead
 * button with no reason on it.
 */
export function haggleView(state: GameState, vendorId: string): HaggleView {
  const view = vendorView(state, vendorId);
  const cool = effectiveStats(state.player).cool;
  if (view.haggle === "won") {
    return {
      state: "won",
      label: t("vendor.haggle.won"),
      hint: t("vendor.haggle.won.hint", { keeper: view.vendor.keeper }),
      chanceLabel: null,
      canTry: false,
    };
  }
  if (view.haggle === "locked") {
    return {
      state: "locked",
      label: t("vendor.haggle.locked"),
      hint: t("vendor.haggle.locked.hint", { keeper: view.vendor.keeper }),
      chanceLabel: null,
      canTry: false,
    };
  }
  if (!canAttemptHaggle(cool)) {
    return {
      state: "none",
      label: t("vendor.haggle"),
      hint: t("vendor.haggle.tooCool", { needed: HAGGLE.minCool, cool }),
      chanceLabel: null,
      canTry: false,
    };
  }
  return {
    state: "none",
    label: t("vendor.haggle"),
    hint: t("vendor.haggle.hint", {
      shift: Math.round(HAGGLE.step * 100),
    }),
    chanceLabel: percentLabel(haggleChance(cool)),
    canTry: true,
  };
}

/** "Street stall · keeps the Cistern Court's books". */
function kindLabel(kindText: string, factionId: string): string {
  const faction = factions.find((entry) => entry.id === factionId);
  return faction
    ? `${kindText} · keeps ${faction.name}'s books`
    : kindText;
}

/**
 * The whole screen for one counter. The tab is the caller's state (like
 * the bench's selected weapon), so a re-render after a purchase never
 * has to re-derive what the player was looking at.
 */
export function vendorModel(
  state: GameState,
  vendorId: string,
  tab: VendorTab = "buy",
): VendorModel {
  const view = vendorView(state, vendorId);
  const spreadLabel =
    view.vendor.kind === "stall"
      ? t("vendor.kind.stall")
      : t("vendor.kind.bonded");
  return {
    vendorId: view.vendor.id,
    title: view.vendor.name,
    keeper: view.vendor.keeper,
    kindLabel: kindLabel(spreadLabel, view.vendor.faction),
    blurb: view.vendor.blurb,
    actLabel: `Act ${view.act} — ${actTitle(view.act)}`,
    credits: state.credits,
    standingLabel: view.standing
      ? `${view.standing.label} — ${Math.round(view.standing.fraction * 100)}% either way`
      : null,
    haggle: haggleView(state, vendorId),
    tab,
    buy: vendorShelf(state, vendorId).map((line) => buyRow(line, state.credits)),
    sell: vendorSellables(state, vendorId).map(sellRow),
  };
}
