import { STANDING_DISCOUNTS, type Vendor } from "../data/economy";
import { REPUTATION_BANDS } from "../data/factions";
import { reputationOf, type ReputationState } from "../state/reputation";

/**
 * The friend's rate: what a run's standing is worth at a counter.
 *
 * Only at the counter that keeps that faction's books, and only in
 * bands — a warm Court means the Row's back shelf shaves something off,
 * and means nothing at all on the boards. Everything numeric about
 * reputation stays in src/state/reputation.ts; all this does is pick
 * the strongest band the player clears and hand back what it is worth.
 */
export interface StandingRate {
  /** Fraction off a purchase, and onto a sale. */
  fraction: number;
  /** "Trusted here — The Cistern Court", for the price breakdown. */
  label: string;
}

/** Where a band sits on the scale; unknown bands read as unreachable. */
function bandFloor(bandId: string): number {
  const band = REPUTATION_BANDS.find((entry) => entry.id === bandId);
  return band?.min ?? Number.POSITIVE_INFINITY;
}

/**
 * What this counter's faction currently allows the player, or null when
 * they are nobody special here. Ties never happen: the strongest band
 * whose floor the standing clears wins, and equal fractions would be
 * the same rate anyway.
 */
export function standingRate(
  reputation: ReputationState,
  vendor: Vendor,
): StandingRate | null {
  const standing = reputationOf(reputation, vendor.faction);
  let best: StandingRate | null = null;
  let bestFloor = -Infinity;
  for (const discount of STANDING_DISCOUNTS) {
    const floor = bandFloor(discount.band);
    if (standing < floor || floor < bestFloor) continue;
    bestFloor = floor;
    best = { fraction: discount.fraction, label: discount.label };
  }
  return best;
}
