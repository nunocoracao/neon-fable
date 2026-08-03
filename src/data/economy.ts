import type { FactionId, ReputationBandId } from "./factions";

/**
 * What things are worth, and what each counter in the city does to that
 * number.
 *
 * Every price the game charges or pays is derived — never authored at
 * the point of sale. An item has ONE worth (`ITEM_VALUES`); a counter
 * has a spread that says what it adds when it sells and what fraction
 * of the worth it hands over when it buys; a run's standing, a stall's
 * risk premium, an item's condition, and a won argument are each a
 * named modifier over that. The arithmetic lives in src/economy/, and
 * it can only ever read this file.
 *
 * Two rules the whole economy rests on, and both are pinned by tests:
 *
 *  - **Selling is meaningfully worse than buying.** The worst buy price
 *    a player can reach is still above the best sell price they can
 *    reach, at every counter, for every item — so gear is something you
 *    choose, never a loop you farm.
 *  - **Nothing is ever free.** Every derived price clamps at
 *    PRICE_FLOOR, so no stack of discounts can produce a zero or a
 *    negative, and no modifier can pay a player to take stock away.
 *
 * Content only. No state, no clock, no GameState.
 */

/* ------------------------------------------------------------------ *
 * Counters
 * ------------------------------------------------------------------ */

/**
 * Every counter that trades on the derived model. The id is also the
 * key a run's ledger (haggle state, what has been bought this act) is
 * kept under, so it is stable and saves depend on it.
 */
export const VENDOR_IDS = [
  "wet-market-back",
  "vm-broker-counter",
  // The three counters that sell hot food. A cart is a counter like any
  // other — same spread, same ledger, same argument — it simply keeps a
  // shorter shelf and moves when the weather does.
  "vm-noodle-counter",
  "steps-food-cart",
  "quays-food-cart",
] as const;

export type VendorId = (typeof VENDOR_IDS)[number];

/**
 * What kind of counter it is, which is the whole of its spread. A
 * street stall sells at worth and pays badly, because everything it
 * takes in it has to move again on the same pavement; a bonded counter
 * charges over the odds for the paperwork and pays properly, because it
 * can resell in daylight.
 */
export const VENDOR_KINDS = ["stall", "licensed"] as const;

export type VendorKind = (typeof VENDOR_KINDS)[number];

export interface VendorSpread {
  /** How the counter describes itself on the screen. */
  label: string;
  /** Multiplier on an item's worth when the counter sells it to you. */
  buy: number;
  /** Fraction of an item's worth the counter pays when it buys. */
  sell: number;
}

/**
 * The spreads are tuned against one hard constraint, which
 * price.test.ts sweeps exhaustively: the *best* price any counter will
 * ever pay must stay under the *worst* price any counter will ever
 * charge, over every condition, every standing and a won argument on
 * both sides. That is what makes the buy-low-sell-high loop impossible
 * rather than merely unattractive, and it is why the resale rates look
 * mean — they are carrying the whole no-arbitrage margin.
 */
export const VENDOR_SPREADS: Record<VendorKind, VendorSpread> = {
  stall: { label: "Street stall", buy: 1, sell: 0.32 },
  licensed: { label: "Bonded counter", buy: 1.25, sell: 0.42 },
};

export interface Vendor {
  id: VendorId;
  /** The counter, as the screen names it. */
  name: string;
  /** Who is behind it. */
  keeper: string;
  kind: VendorKind;
  /**
   * Whose books this counter keeps. A run the faction reads warmly buys
   * cheaper and sells dearer here — the one place the reputation ledger
   * turns directly into credits.
   */
  faction: FactionId;
  /** One line of what trading here is like. */
  blurb: string;
}

export const vendors: readonly Vendor[] = [
  {
    id: "wet-market-back",
    name: "The back shelf",
    keeper: "The stallkeeper",
    kind: "stall",
    faction: "court",
    blurb:
      "An oilcloth folded back over a crate. Prices are what the street " +
      "says they are this week, and the street has a long memory.",
  },
  {
    id: "vm-broker-counter",
    name: "Quill's ledger",
    keeper: "Quill",
    kind: "licensed",
    faction: "market",
    blurb:
      "Bonded, booked and taxed on the boards' own register. Costs more " +
      "across the counter and pays more into your hand, and every line " +
      "of it goes in the slate.",
  },
  {
    id: "vm-noodle-counter",
    name: "The hot bar",
    keeper: "The counterman",
    kind: "stall",
    faction: "market",
    blurb:
      "Six stools, one pot, and a queue that never quite forms. Prices " +
      "chalked on the hood and unchanged since anybody can remember.",
  },
  {
    id: "steps-food-cart",
    name: "Bell's cart",
    keeper: "Bell",
    kind: "stall",
    faction: "court",
    blurb:
      "A griddle on wheels under a court awning, working the walk " +
      "between the cistern and the shrine. She feeds the Steps and the " +
      "Steps keep an eye on the cart.",
  },
  {
    id: "quays-food-cart",
    name: "Onder's cart",
    keeper: "Onder",
    kind: "stall",
    // The strand is Court ground after dark, whatever the wharf above
    // it thinks; the cart keeps the Court's books like the Steps' does.
    faction: "court",
    blurb:
      "Hot plate, kettle, and a tarp guyed off the wharf rail against " +
      "the rain. Salt tea for anybody who has been in the water, " +
      "whoever they came down here for.",
  },
];

const vendorsById = new Map<string, Vendor>(vendors.map((v) => [v.id, v]));

export function getVendor(id: string): Vendor | undefined {
  return vendorsById.get(id);
}

export function isVendorId(id: string): id is VendorId {
  return vendorsById.has(id);
}

export class EconomyError extends Error {
  constructor(
    readonly code:
      | "unknown-vendor"
      | "unknown-entry"
      | "out-of-stock"
      | "not-for-sale"
      | "insufficient-credits"
      | "haggle-locked"
      | "haggle-spent"
      | "too-cold-to-haggle",
    message: string,
  ) {
    super(message);
    this.name = "EconomyError";
  }
}

export function requireVendor(id: string): Vendor {
  const vendor = getVendor(id);
  if (!vendor) {
    throw new EconomyError("unknown-vendor", `No vendor with id "${id}"`);
  }
  return vendor;
}

/* ------------------------------------------------------------------ *
 * Condition
 * ------------------------------------------------------------------ */

/**
 * How worn the thing on the counter is. Condition is a property of the
 * *offer*, not of the item: the same coat is factory-wrapped on a
 * consignment shelf and second-hand out of a player's bag, and the
 * price says so.
 */
export const ITEM_CONDITIONS = ["new", "used", "salvage"] as const;

export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

export interface ConditionModifier {
  label: string;
  factor: number;
}

export const CONDITION_MODIFIERS: Record<ItemCondition, ConditionModifier> = {
  new: { label: "Unopened", factor: 1 },
  used: { label: "Second-hand", factor: 0.85 },
  salvage: { label: "Salvage", factor: 0.7 },
};

/**
 * What a player's own gear is when they put it on a counter. Anything
 * that has been worn, fired, or fitted is second-hand; a sealed
 * consumable or a boxed part is not.
 */
export const CARRIED_CONDITION: ItemCondition = "used";
export const SEALED_CONDITION: ItemCondition = "new";

/* ------------------------------------------------------------------ *
 * Standing
 * ------------------------------------------------------------------ */

/**
 * The friend's rate: what a faction's regard is worth at a counter that
 * keeps its books. Applies to both sides of the trade — a counter that
 * likes you charges less and pays more — and only at the aligned
 * vendor, which is what stops one warm faction discounting the city.
 *
 * Bands, not numbers, for the same reason every other gate uses them:
 * re-tuning what an act outcome is worth must never silently move a
 * price. Listed weakest first; the strongest band the player clears
 * wins.
 */
export interface StandingDiscount {
  band: ReputationBandId;
  /** Fraction off a purchase, and onto a sale. */
  fraction: number;
  label: string;
}

export const STANDING_DISCOUNTS: readonly StandingDiscount[] = [
  { band: "warm", fraction: 0.05, label: "Known here" },
  { band: "trusted", fraction: 0.12, label: "Trusted here" },
];

/* ------------------------------------------------------------------ *
 * Haggling
 * ------------------------------------------------------------------ */

/**
 * One argument per counter per act. Cool decides whether it lands; the
 * step is what landing is worth, on every price at that counter for the
 * rest of the act. Losing it is not free — the counter stops moving,
 * and stays stopped until the act turns over.
 */
export const HAGGLE = {
  /** Below this effective Cool the counter will not be drawn into it. */
  minCool: 4,
  /** Chance at Cool 0, before the per-point climb. */
  baseChance: 0.1,
  /** Added chance per point of effective Cool. */
  perCool: 0.06,
  /** Nobody talks a price down for certain. */
  maxChance: 0.85,
  /** Fraction shifted in the player's favour by a won argument. */
  step: 0.1,
} as const;

/** The odds an argument lands at this much Cool, as a fraction. */
export function haggleChance(cool: number): number {
  if (cool < HAGGLE.minCool) return 0;
  const raw = HAGGLE.baseChance + HAGGLE.perCool * cool;
  return Math.min(HAGGLE.maxChance, Math.max(0, raw));
}

/* ------------------------------------------------------------------ *
 * Restocks
 * ------------------------------------------------------------------ */

/**
 * How many of a line a counter puts out, per act. Restocking is not an
 * event anybody fires: a ledger is stamped with the act it was written
 * in, so the moment the act turns over the shelf reads full again (see
 * src/state/vendors.ts). That is why there is no "restock" verb
 * anywhere in the code — only this table and the act.
 *
 * Rows are read forwards: the row with the highest `act` at or below
 * the current one wins, so a line can grow scarcer or more plentiful as
 * the city changes without repeating the unchanged acts.
 */
export interface RestockRow {
  vendorId: VendorId;
  /** From this act onwards, until a later row for the same line. */
  act: number;
  /** Stock entry id (see VENDOR_STOCK in ./world.ts). */
  entryId: string;
  quantity: number;
}

/** What a line nobody wrote a row for puts out: one, each act. */
export const DEFAULT_RESTOCK = 1;

export const VENDOR_RESTOCK: readonly RestockRow[] = [
  // Consumables move in quantity; the bonded counter keeps a case of
  // each and books them out one at a time.
  { vendorId: "vm-broker-counter", act: 1, entryId: "quill-patch", quantity: 3 },
  { vendorId: "vm-broker-counter", act: 1, entryId: "quill-stim", quantity: 2 },
  {
    vendorId: "vm-broker-counter",
    act: 2,
    entryId: "quill-patch",
    quantity: 4,
  },
  { vendorId: "vm-broker-counter", act: 3, entryId: "quill-stim", quantity: 3 },
  // Loose parts come off the boards in twos once the Cordon's machining
  // starts turning up in consignment.
  {
    vendorId: "vm-broker-counter",
    act: 2,
    entryId: "quill-ballast",
    quantity: 2,
  },
  // The stall's tier-2 hardware is one apiece — a back shelf is not a
  // warehouse — except the week the Exchange's stock hit the street.
  {
    vendorId: "wet-market-back",
    act: 3,
    entryId: "buy-torsion-frame",
    quantity: 2,
  },
  // Food is the one thing a counter has plenty of: a cart puts out a
  // day's worth of the cheap lines and one of everything else, which is
  // what keeps a player from solving a chapter with skewers.
  { vendorId: "vm-noodle-counter", act: 1, entryId: "bar-noodles", quantity: 4 },
  { vendorId: "vm-noodle-counter", act: 1, entryId: "bar-skewer", quantity: 5 },
  { vendorId: "vm-noodle-counter", act: 1, entryId: "bar-patch", quantity: 2 },
  { vendorId: "steps-food-cart", act: 1, entryId: "bell-skewer", quantity: 5 },
  { vendorId: "steps-food-cart", act: 1, entryId: "bell-noodles", quantity: 3 },
  { vendorId: "quays-food-cart", act: 1, entryId: "onder-tea", quantity: 4 },
  { vendorId: "quays-food-cart", act: 1, entryId: "onder-skewer", quantity: 3 },
];

/**
 * How many of a line the counter puts out this act. Unlisted lines get
 * DEFAULT_RESTOCK, which is what makes the table an exception list
 * rather than a duplicate of the shelf.
 */
export function restockQuantity(
  vendorId: VendorId,
  entryId: string,
  act: number,
): number {
  let quantity = DEFAULT_RESTOCK;
  let bestAct = -Infinity;
  for (const row of VENDOR_RESTOCK) {
    if (row.vendorId !== vendorId || row.entryId !== entryId) continue;
    if (row.act > act || row.act < bestAct) continue;
    bestAct = row.act;
    quantity = row.quantity;
  }
  return Math.max(0, Math.floor(quantity));
}

/* ------------------------------------------------------------------ *
 * Worth
 * ------------------------------------------------------------------ */

/** The lowest a derived price may ever land. Nothing in the city is free. */
export const PRICE_FLOOR = 1;

/**
 * What each item is worth before anybody's counter touches it — the one
 * number every price in the game is derived from.
 *
 * A worth of 0 means the thing is not merchandise: story papers, keys
 * and writs are carried, never traded, and `tradeable` below is the
 * only reading of that fact anywhere in the code.
 *
 * Every item in src/data/items.ts (and every dye in ./dyes.ts) must
 * appear here — economy.test.ts fails on a missing or a stray id, which
 * is what keeps a new item from arriving priceless.
 */
export const ITEM_VALUES: Readonly<Record<string, number>> = {
  // --- Weapons ---
  "wpn-shard-knife": 60,
  "wpn-compact-pistol": 90,
  "wpn-stun-baton": 80,
  "wpn-arc-lash": 160,
  "wpn-hookline": 170,
  "wpn-writ-seal": 140,
  "wpn-rail-spitter": 240,
  "wpn-torque-cleaver": 240,
  "wpn-spindle-projector": 280,
  // --- Outfits ---
  "out-courier-slicker": 60,
  "out-spire-suit": 70,
  "out-diver-harness": 60,
  "out-highline-rig": 120,
  "out-tender-coat": 180,
  "out-cordon-plate": 380,
  "out-ghostline-mantle": 300,
  // --- Enhancements ---
  "cyb-optic-suite": 200,
  "cyb-myomer-arms": 220,
  "cyb-lattice-coprocessor": 260,
  "cyb-silt-gills": 150,
  "cyb-static-veil": 240,
  "cyb-dermal-weave": 180,
  "cyb-null-collar": 220,
  "cyb-baffle-weave": 90,
  "cyb-warden-optics": 450,
  "cyb-torsion-frame": 360,
  "cyb-cascade-governor": 500,
  // --- Weapon parts ---
  "mod-splitbore-choke": 70,
  "mod-lattice-rifling": 140,
  "mod-smartlink-sight": 160,
  "mod-longspar-extension": 120,
  "mod-burst-governor": 220,
  "mod-hairline-sear": 180,
  "mod-gyro-sleeve": 90,
  "mod-ballast-shim": 80,
  // --- Consumables ---
  //
  // The reasoning behind each of these is authored beside the item, in
  // ./consumables.ts. In short: the Trauma Patch's 2cr per point of
  // healing is the street rate, food undercuts it per dose and loses on
  // rate, kits beat it on rate and cannot be opened in a fight, and the
  // splint kit is priced against a clinic visit rather than against HP.
  "con-trauma-patch": 20,
  // Stims: lift × turns, discounted by what the crash takes back.
  "con-kick-stim": 20,
  "con-surge-stim": 30,
  "con-hammerhead": 30,
  "con-redline-amp": 55,
  // Street food: cheap per dose, and the readied lift is most of it.
  // Nothing here goes below 10cr, and that is a hard floor rather than
  // taste: under it the resale spread collapses into the buy price and
  // the no-arbitrage sweep in src/economy/price.test.ts fails, because
  // rounding leaves the dearest sale and the cheapest purchase on the
  // same credit. A cart line has to be cheap, not free.
  "con-scrap-skewer": 10,
  "con-cage-noodles": 16,
  "con-basin-tea": 12,
  // Field kits: out-of-combat healing, and the only wound-closer that
  // is not a clinic.
  "con-field-kit": 45,
  "con-medic-roll": 80,
  "con-splint-kit": 150,
  // The oddity, priced like the courtesy it is: the Steps cart keeps a
  // wake bowl by the till and nobody calls what you leave a price.
  "con-wake-sugar": 25,
  // --- Dye tins (the chapel shelf's own prices) ---
  "dye-signal-cyan": 30,
  "dye-cinder-black": 45,
  "dye-ash-vestment": 45,
  "dye-hazard-cut": 50,
  "dye-tidewater": 55,
  "dye-mirror-steel": 65,
  "dye-rust-vigil": 55,
  "dye-last-mile": 60,
  // --- Carried, never traded ---
  "msc-cracked-spike": 0,
  "msc-glasshouse-pass": 0,
  "msc-override-key": 0,
  "msc-ledger-ghost": 0,
  "msc-auric-writ": 0,
  "msc-cordon-orders": 0,
  "msc-assessment-roll": 0,
  "msc-longshore-ledger": 0,
  "msc-basin-licence": 0,
};

/**
 * What an item is worth. An id this build has no price for is worth
 * nothing and therefore cannot be traded — the same reading a story
 * paper gets, which is the safe end to fail towards.
 */
export function itemValue(itemId: string): number {
  return ITEM_VALUES[itemId] ?? 0;
}

/** True for anything a counter will put a number on at all. */
export function tradeable(itemId: string): boolean {
  return itemValue(itemId) > 0;
}
