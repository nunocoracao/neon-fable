import type { RouteCreditEvent } from "../../data/story/walkthroughSupport";

/**
 * A run's money, written down the way a ledger writes it: every credit
 * that came in, every credit that went out, and what each one was for.
 *
 * The point of folding a playthrough into *categories* rather than a
 * single net figure is that the design promises are categorical. "A
 * mainline player affords core progression" is a claim about gear
 * against income; "no dead-end poverty locks" is a claim about the
 * lowest the balance ever got, not about where it ended; "no exploit
 * loops" is a claim about salvage against gear. A net number answers
 * none of them.
 *
 * Pure arithmetic over events. Nothing here runs a game.
 */

/**
 * What a credit movement was for. Every event a route emits lands in
 * exactly one of these, and the classifier (./classify.ts) is the only
 * thing that decides which.
 */
export const FLOW_CATEGORIES = [
  /** Fight rewards: what the night's work paid. */
  "encounter",
  /** Story payouts: fees, advances, cuts, finder's money. */
  "job",
  /** Terminals: what a breach carried out. */
  "breach",
  /** Counters: what the bag fetched when it was sold. */
  "salvage",
  /** Weapons, coats and chrome — the tier-ups a run is built on. */
  "gear",
  /** Bench parts and the fee to back one out. */
  "parts",
  /** Patches, stims, food, kits. */
  "supplies",
  /** The clinic: treatment and the hardware that quiets a body. */
  "clinic",
  /** The chair and the tin: dye and restyle. */
  "cosmetic",
  /** Cover charges, bribes, passage, damages — the city's own tax. */
  "toll",
] as const;

export type FlowCategory = (typeof FLOW_CATEGORIES)[number];

/** Categories that put credits into a run. */
export const FAUCET_CATEGORIES: readonly FlowCategory[] = [
  "encounter",
  "job",
  "breach",
  "salvage",
];

export function isFaucet(category: FlowCategory): boolean {
  return FAUCET_CATEGORIES.includes(category);
}

/** One credit movement, classified. */
export interface LedgerEntry {
  category: FlowCategory;
  /** Where it happened: an arc id, or "route" for a between-scene step. */
  arcId: string;
  /** The choice, encounter, or step behind it. */
  detail: string;
  /** Positive in, negative out. */
  delta: number;
  /** The balance it left behind. */
  balance: number;
}

/** A whole run's movements, in the order they happened. */
export interface Ledger {
  /** What the run started the night with. */
  opening: number;
  entries: readonly LedgerEntry[];
}

export function makeLedger(
  opening: number,
  entries: readonly LedgerEntry[],
): Ledger {
  return { opening, entries };
}

/** What the run finished holding. */
export function closing(ledger: Ledger): number {
  const last = ledger.entries[ledger.entries.length - 1];
  return last ? last.balance : ledger.opening;
}

/**
 * The lowest the balance ever got. This is the poverty figure: a run
 * that ends rich having passed through nothing is not the same run as
 * one that ended rich having been down to its last credit, and only one
 * of those is a dead end waiting to happen.
 */
export function trough(ledger: Ledger): number {
  return ledger.entries.reduce(
    (low, entry) => Math.min(low, entry.balance),
    ledger.opening,
  );
}

/** Credits in, over every faucet. */
export function income(ledger: Ledger): number {
  return sum(ledger, (entry) => (entry.delta > 0 ? entry.delta : 0));
}

/** Credits out, as a positive figure. */
export function spend(ledger: Ledger): number {
  return sum(ledger, (entry) => (entry.delta < 0 ? -entry.delta : 0));
}

/** Credits in (positive) minus out, in one category. */
export function net(ledger: Ledger, category: FlowCategory): number {
  return sum(ledger, (entry) =>
    entry.category === category ? entry.delta : 0,
  );
}

/** The gross figure a category moved, sign dropped. */
export function gross(ledger: Ledger, category: FlowCategory): number {
  return Math.abs(net(ledger, category));
}

function sum(ledger: Ledger, pick: (entry: LedgerEntry) => number): number {
  return ledger.entries.reduce((total, entry) => total + pick(entry), 0);
}

/** Every category that moved anything, with its net, in table order. */
export function byCategory(ledger: Ledger): Array<{
  category: FlowCategory;
  net: number;
  events: number;
}> {
  return FLOW_CATEGORIES.map((category) => ({
    category,
    net: net(ledger, category),
    events: ledger.entries.filter((entry) => entry.category === category)
      .length,
  })).filter((row) => row.events > 0);
}

/**
 * Folds a route's raw movements into a ledger. The classifier is passed
 * in rather than imported so the fold stays arithmetic — see
 * ./classify.ts for the one the sweep uses.
 */
export function foldEvents(
  opening: number,
  events: readonly RouteCreditEvent[],
  classify: (event: RouteCreditEvent) => FlowCategory,
): Ledger {
  return makeLedger(
    opening,
    events.map((event) => ({
      category: classify(event),
      arcId: event.arcId,
      detail: event.detail,
      delta: event.delta,
      balance: event.balance,
    })),
  );
}
