import { encounterBalance, type EncounterClass, type ProgressionTier } from "./balance";

/**
 * What credits are supposed to *mean*, written down as numbers.
 *
 * The sibling of ./balance.ts, and for the same reason: every price in
 * ./economy.ts, every payout in ./encounters.ts, and every fee in
 * ./injuries.ts, ./stylist.ts and ./dyes.ts is locally sensible, and
 * only the whole of them decides whether a credit is worth having. So
 * the intent lives here, as content, and the ledger harness
 * (src/economy/sim) measures the real engines against it. Nothing in the
 * shipped game reads this file; the tests do.
 *
 * ## The flows
 *
 * ```
 *   FAUCETS                                SINKS
 *   ───────                                ─────
 *   fights ──── rewards by tier ──┐   ┌── gear     tier-2 weapon, coat, chrome
 *   scenes ──── job payouts ──────┤   ├── parts    bench parts + the pull fee
 *   terminals ── breach data ─────┼─▶ ├── supplies patches, stims, kits, food
 *   the bag ──── resale ──────────┘   ├── clinic   treatment, dampeners
 *                                     ├── cosmetic the chair and the tin
 *                                     └── toll     cover charges, writs, passage
 * ```
 *
 * Three of the four faucets are the road paying for itself; the fourth
 * (resale) is the only one a player opens on purpose, which is why the
 * spread that makes it lossy is the one figure the whole economy rests
 * on (see VENDOR_SPREADS, and the no-arbitrage sweep in
 * src/economy/price.test.ts and src/economy/sim/arbitrage.test.ts).
 *
 * ## The targets, and what each one is for
 *
 * - **The road pays for the road.** Every canonical run finishes. That
 *   is not a figure, it is the sweep completing: `applyChoice` throws on
 *   an unmet credit gate, so a run that reaches its ending has, by
 *   construction, afforded every paid scene on it. Tuning a price up
 *   until a road closes turns the sweep red rather than shipping.
 * - **The clinic is always open** (CLINIC_FLOOR). At every chapter
 *   break, on every profile, a run holds enough to have a wound closed.
 *   This is the no-dead-end promise, and it is checked at the breaks
 *   rather than continuously because mid-chapter is exactly when a
 *   player is *supposed* to be spent.
 * - **A mainline run keeps a modest surplus** (MAINLINE_SURPLUS). Not
 *   rich: a share of what came in, bounded at both ends. Under the floor
 *   the road is not paying for itself; over the ceiling credits are
 *   confetti.
 * - **A thorough run cannot have everything** (THOROUGH_CHOICE). It must
 *   spend materially more than the mainline run and still leave part of
 *   its wishlist on the shelf. A shop you can clear is a shop with no
 *   decisions in it.
 * - **The roads pay differently, but not wildly** (INCOME_SPREAD). A run
 *   that sells out to the tower should out-earn a run that talks past
 *   every fight — that is the fiction — but not by an order of
 *   magnitude, or the poor road stops having an economy at all.
 *
 * Every figure is deliberately coarse, for the same reason the combat
 * targets are: an ordinary content edit must not turn CI red, and the
 * two failures that actually matter — a road nobody can afford, and a
 * shop nobody has to think about — must.
 */

/* ------------------------------------------------------------------ *
 * Faucets: what a fight is worth
 * ------------------------------------------------------------------ */

/**
 * What an encounter of each tier and class pays, as a band.
 *
 * A ladder rather than a list of authored numbers, because the thing a
 * player feels is the *slope*: an opening scrap is beer money, a
 * chapter-2 job is a down payment on a coat, and a set piece is the
 * night that changes what you can afford. Without a band, one generous
 * early fight quietly funds the whole first act and every price after it
 * is wrong.
 *
 * Read against ./balance.ts, which already says which tier and class
 * every authored encounter is — so a new fight is banded by the entry it
 * already needs, and cannot arrive priced out of the ladder.
 */
export interface RewardBand {
  min: number;
  max: number;
}

export const ENCOUNTER_REWARD_BANDS: Readonly<
  Record<ProgressionTier, Readonly<Record<EncounterClass, RewardBand>>>
> = {
  opening: {
    standard: { min: 40, max: 60 },
    // No set piece is written for the opening; the band exists so one
    // added later has a number to be wrong about.
    boss: { min: 90, max: 140 },
  },
  mid: {
    standard: { min: 80, max: 130 },
    boss: { min: 150, max: 220 },
  },
  late: {
    standard: { min: 150, max: 200 },
    boss: { min: 200, max: 260 },
  },
};

export function rewardBand(
  tier: ProgressionTier,
  encounterClass: EncounterClass,
): RewardBand {
  return ENCOUNTER_REWARD_BANDS[tier][encounterClass];
}

/** Every banded encounter, for a sweep that wants the whole ladder. */
export const bandedEncounters = encounterBalance;

/* ------------------------------------------------------------------ *
 * Sinks: the floors that must never close
 * ------------------------------------------------------------------ */

/**
 * Credits a run must be holding at a chapter break for the clinic to
 * still be a place it can walk into. Set at the dearest treatment in
 * ./injuries.ts, not the cheapest: the promise is that *any* wound can
 * be closed, not that a lucky one can.
 *
 * Pinned against the injury table by test, so a treatment priced above
 * this floor fails rather than quietly creating the dead end.
 */
export const CLINIC_FLOOR = 45;

/**
 * What a run keeps back at each chapter break for the road ahead.
 *
 * The simulated player is the only one who needs this written down — a
 * real one reads the scene and knows the veil costs 150 — but it has to
 * be a stated figure rather than a guess, because it decides how much of
 * the shop the sweep is allowed to reach. It is the cost of the paid
 * scenes the *next* chapter puts on the road with no free alternative:
 *
 * - after chapter 1: Patch's case in the Cinder Row cut — the Static
 *   Veil at 150 and a bag of patches at 20 apiece.
 * - after chapter 2: nothing. Act 3's only priced scene (settling the
 *   Trust's writ, 300 cr) has a fight beside it, so a run that spent its
 *   last credit still has a road.
 */
export const CHAPTER_RESERVE: Readonly<Record<number, number>> = {
  1: 250,
  2: CLINIC_FLOOR,
};

export function chapterReserve(chapter: number): number {
  return CHAPTER_RESERVE[chapter] ?? 0;
}

/* ------------------------------------------------------------------ *
 * The ledger targets
 * ------------------------------------------------------------------ */

/**
 * What a mainline run's books look like at the epilogue, as shares of
 * everything that came in. Shares rather than credits because the four
 * roads earn very different amounts on purpose (see INCOME_SPREAD) and
 * the promise — "you could afford the road, with a little left" — is the
 * same on all of them.
 */
export const MAINLINE_SURPLUS = {
  /** Below this the run never had anything spare. */
  minShare: 0.1,
  /**
   * Above this it never had anything to spend it on. Generous, because
   * a chunk of every road's money arrives in the last scene of the game,
   * where there is nothing left to buy — that is an epilogue, not a
   * surplus.
   */
  maxShare: 0.95,
  /** And in absolute terms, enough to walk into a clinic. */
  minCredits: CLINIC_FLOOR,
} as const;

/**
 * What separates a thorough run from a mainline one. Both ends matter:
 * a thorough player has to be able to *do* something with the extra
 * effort, and has to hit a wall doing it.
 */
export const THOROUGH_CHOICE = {
  /**
   * Credits a thorough run must put through the shops beyond what the
   * mainline run spends. Under it, browsing is not a playstyle.
   */
  minExtraSpend: 100,
  /**
   * Wishlist entries a thorough run must fail to buy, per run. The whole
   * point: the shops offer more than any one road can pay for.
   */
  minUnmetWishes: 1,
} as const;

/**
 * How far apart the richest and poorest roads may be, measured on
 * lifetime income with the mainline profile.
 *
 * A wide band on purpose. The tower's retainer pays and the ghost's road
 * does not, and flattening that would flatten the fiction; what the
 * ceiling stops is a road whose economy has quietly stopped existing.
 */
export const INCOME_SPREAD = {
  /** The poorest road still has to earn a real amount over three acts. */
  minIncome: 200,
  /** And the richest has to stay inside a comprehensible multiple of it. */
  maxRatio: 10,
} as const;
