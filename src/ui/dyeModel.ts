import { CHAPEL_DYE_SHELF, chapelDyePrice } from "../data/dyes";
import { getItem } from "../data/items";
import {
  dyeableOutfits,
  sameDye,
  sameOutfit,
  type DyeCounter,
  type DyeableOutfit,
  type OutfitRef,
} from "../inventory";
import { dyeChannelSummary } from "./format";

/**
 * The chapel's colour counter, as data. Pure over a `DyeCounter` — no
 * DOM, no session — so what the dye section offers, what it charges,
 * and what it greys out are all testable without mounting the screen
 * (the same split workbenchModel.ts uses for the bench).
 *
 * Two kinds of tin appear here: the chapel's standing shelf, priced in
 * ./data/dyes.ts, and anything the player is already carrying — a
 * found colour Vesper never stocked still gets rubbed in, free,
 * because the tin is already paid for.
 */

/** One coat the counter can work on, as its row reads. */
export interface CoatRow {
  ref: OutfitRef;
  name: string;
  /** "Worn" or "Carried" — where this copy is. */
  place: string;
  /** The colour it is wearing, or the factory line. */
  colorLine: string;
  /** False for coats with no cloth of their own to dye. */
  dyeable: boolean;
  selected: boolean;
}

/** One tin on the counter, and what clicking it would do. */
export interface TinRow {
  dyeId: string;
  name: string;
  /** "black cloth · amber trim". */
  colors: string;
  /** How many of this tin the player already carries. */
  carried: number;
  /** Shelf price, or null for a colour the chapel does not sell. */
  price: number | null;
  /** "Buy & apply — 45 cr", "Apply — carried", "Already worn". */
  actionLabel: string;
  /** True when the selected coat is already wearing exactly this. */
  current: boolean;
  /** False when clicking it would be refused. */
  enabled: boolean;
}

export interface DyeCounterModel {
  coats: CoatRow[];
  /** The coat being worked on, or null when there is nothing to dye. */
  selected: DyeableOutfit | null;
  tins: TinRow[];
  /** True exactly when the selected coat has factory colours to go back to. */
  canStrip: boolean;
  credits: number;
}

/** "Wearing black cloth · amber trim", or the factory line. */
export function coatColorLine(coat: DyeableOutfit): string {
  if (!coat.dyeable) return "Nothing on it to dye";
  return coat.dye
    ? `Wearing ${dyeChannelSummary(coat.dye)}`
    : "Factory colours";
}

/**
 * The whole colour section for a counter and a chosen coat. Selection
 * is the caller's state — the model is a pure read of it — and defaults
 * to the first coat that can actually take a colour, so a player
 * wearing a dyeable coat never has to choose before they can buy.
 */
export function dyeCounterModel(
  counter: DyeCounter,
  selectedRef: OutfitRef | null,
): DyeCounterModel {
  const wardrobe = dyeableOutfits(counter);
  const selected =
    (selectedRef
      ? wardrobe.find((coat) => sameOutfit(coat.ref, selectedRef))
      : null) ??
    wardrobe.find((coat) => coat.dyeable) ??
    wardrobe[0] ??
    null;

  const coats: CoatRow[] = wardrobe.map((coat) => ({
    ref: coat.ref,
    name: coat.item.name,
    place: coat.ref.where === "equipped" ? "Worn" : "Carried",
    colorLine: coatColorLine(coat),
    dyeable: coat.dyeable,
    selected: selected !== null && sameOutfit(coat.ref, selected.ref),
  }));

  const shelfIds = CHAPEL_DYE_SHELF.map((entry) => entry.itemId);
  // Found colours come after the shelf, in bag order: the chapel shows
  // what it sells first, then what you walked in with.
  const carriedIds = counter.inventory.stacks
    .filter((stack) => getItem(stack.itemId)?.kind === "dye")
    .map((stack) => stack.itemId)
    .filter((id) => !shelfIds.includes(id));

  const tins: TinRow[] = [];
  for (const dyeId of [...shelfIds, ...carriedIds]) {
    const item = getItem(dyeId);
    if (item?.kind !== "dye") continue;
    const carried = counter.inventory.stacks
      .filter((stack) => stack.itemId === dyeId)
      .reduce((sum, stack) => sum + stack.quantity, 0);
    const price = chapelDyePrice(dyeId);
    const current =
      selected !== null &&
      selected.dyeable &&
      sameDye(selected.dye, item.colors);
    const affordable = price !== null && counter.credits >= price;
    const workable = selected !== null && selected.dyeable && !current;
    tins.push({
      dyeId,
      name: item.name,
      colors: dyeChannelSummary(item.colors),
      carried,
      price,
      actionLabel: current
        ? "Already worn"
        : carried > 0
          ? "Apply — carried"
          : price !== null
            ? `Buy & apply — ${price} cr`
            : "Not for sale",
      current,
      enabled: workable && (carried > 0 || affordable),
    });
  }

  return {
    coats,
    selected,
    tins,
    canStrip: selected?.dye !== undefined,
    credits: counter.credits,
  };
}
