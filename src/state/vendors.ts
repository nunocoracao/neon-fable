/**
 * What the counters remember about this run.
 *
 * One ledger per vendor, and every ledger is stamped with the act it
 * was written in. That stamp is the entire restock mechanism: a ledger
 * from an earlier act is not migrated, cleared or rebuilt — it is
 * simply not this act's ledger, so the shelf reads full again and the
 * argument you lost last chapter is forgotten. Nothing fires at an act
 * transition, which is why nothing can miss one.
 *
 * Plain serializable data (numbers, strings, records) and pure
 * functions over it, exactly like the party and the shard collection.
 * Content-free by construction: the act, the entry ids and the stock
 * counts are all handed in, so this module never learns what a vendor
 * sells or what an act is.
 */

/** Where an argument at this counter stands, this act. */
export type HaggleState =
  /** Nobody has tried yet. */
  | "none"
  /** It landed: the counter's prices are shifted for the rest of the act. */
  | "won"
  /** It failed: the counter will not move again until the act turns over. */
  | "locked";

export interface VendorLedger {
  /** The act this ledger describes; a ledger from any other is void. */
  act: number;
  /** Copies bought off each stock entry this act, keyed by entry id. */
  sold: Record<string, number>;
  haggle: HaggleState;
}

export interface VendorsState {
  ledgers: Record<string, VendorLedger>;
}

/** A counter nobody has traded at yet, this act. */
export function freshLedger(act: number): VendorLedger {
  return { act, sold: {}, haggle: "none" };
}

export function emptyVendors(): VendorsState {
  return { ledgers: {} };
}

/**
 * The ledger this counter is keeping *this act*. A stored ledger from
 * an earlier (or an impossible) act reads as a fresh one — that is the
 * restock, and it costs nothing to derive.
 */
export function ledgerFor(
  vendors: VendorsState,
  vendorId: string,
  act: number,
): VendorLedger {
  const stored = vendors.ledgers[vendorId];
  if (!stored || stored.act !== act) return freshLedger(act);
  return stored;
}

/** Copies of one line already bought this act. */
export function soldCount(ledger: VendorLedger, entryId: string): number {
  return ledger.sold[entryId] ?? 0;
}

/** Writes a ledger back, replacing whatever act's ledger was there. */
function withLedger(
  vendors: VendorsState,
  vendorId: string,
  ledger: VendorLedger,
): VendorsState {
  return { ledgers: { ...vendors.ledgers, [vendorId]: ledger } };
}

/** Books `count` copies of a line out of this act's stock. */
export function recordSale(
  vendors: VendorsState,
  vendorId: string,
  act: number,
  entryId: string,
  count = 1,
): VendorsState {
  const ledger = ledgerFor(vendors, vendorId, act);
  return withLedger(vendors, vendorId, {
    ...ledger,
    sold: { ...ledger.sold, [entryId]: soldCount(ledger, entryId) + count },
  });
}

/**
 * Records how an argument went. Won shifts every price at this counter
 * for the rest of the act; lost stops it moving at all — and both are
 * written the moment the roll is made, so reloading cannot re-roll it.
 */
export function recordHaggle(
  vendors: VendorsState,
  vendorId: string,
  act: number,
  won: boolean,
): VendorsState {
  const ledger = ledgerFor(vendors, vendorId, act);
  return withLedger(vendors, vendorId, {
    ...ledger,
    haggle: won ? "won" : "locked",
  });
}

/** True when the counter will still be drawn into an argument this act. */
export function canHaggle(ledger: VendorLedger): boolean {
  return ledger.haggle === "none";
}

const HAGGLE_STATES: readonly HaggleState[] = ["none", "won", "locked"];

/**
 * Coerces any value into a valid VendorsState; used by save migration
 * and at every load, for the same reason the shard collection is
 * clamped — a save can carry what an older build wrote badly, and a
 * malformed ledger must read as "nobody has traded here" rather than
 * throw a load away.
 */
export function clampVendors(value: unknown): VendorsState {
  if (typeof value !== "object" || value === null) return emptyVendors();
  const record = (value as Record<string, unknown>).ledgers;
  if (typeof record !== "object" || record === null) return emptyVendors();
  const ledgers: Record<string, VendorLedger> = {};
  for (const [vendorId, stored] of Object.entries(record)) {
    if (typeof stored !== "object" || stored === null) continue;
    const entry = stored as Record<string, unknown>;
    const act = entry.act;
    if (typeof act !== "number" || !Number.isFinite(act)) continue;
    const haggle = HAGGLE_STATES.find((state) => state === entry.haggle);
    const sold: Record<string, number> = {};
    if (typeof entry.sold === "object" && entry.sold !== null) {
      for (const [entryId, count] of Object.entries(
        entry.sold as Record<string, unknown>,
      )) {
        if (typeof count !== "number" || !Number.isFinite(count)) continue;
        if (count <= 0) continue;
        sold[entryId] = Math.floor(count);
      }
    }
    ledgers[vendorId] = { act: Math.floor(act), sold, haggle: haggle ?? "none" };
  }
  return { ledgers };
}
