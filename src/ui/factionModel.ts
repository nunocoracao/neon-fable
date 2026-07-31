import {
  REPUTATION_MAX,
  REPUTATION_MIN,
  factions,
  type FactionId,
  type ReputationBandId,
} from "../data/factions";
import { bandOf, reputationOf, type ReputationState } from "../state/reputation";

/**
 * The character screen's standings section, derived. Pure: a
 * ReputationState in, one row per faction out, no DOM and no lookups
 * left for the view to do.
 *
 * The meter is bipolar — nothing is the middle of the bar, not the left
 * end of it — so a run that has annoyed everybody reads as three bars
 * leaning the wrong way rather than three empty ones. The view only has
 * to place a block at `offsetPercent` of width `widthPercent`.
 */
export interface FactionMeter {
  /** Left edge of the filled block, as a percentage of the track. */
  offsetPercent: number;
  /** Width of the filled block, as a percentage of the track. */
  widthPercent: number;
  /** Which side of nothing the block sits on. */
  side: "positive" | "negative" | "none";
}

export interface FactionRow {
  factionId: FactionId;
  name: string;
  blurb: string;
  standing: number;
  band: ReputationBandId;
  bandLabel: string;
  bandBlurb: string;
  meter: FactionMeter;
}

/** Where nothing sits on the track, as a percentage. */
const ZERO_PERCENT =
  ((0 - REPUTATION_MIN) / (REPUTATION_MAX - REPUTATION_MIN)) * 100;

export function factionMeter(standing: number): FactionMeter {
  const span = REPUTATION_MAX - REPUTATION_MIN;
  const widthPercent = (Math.abs(standing) / span) * 100;
  if (widthPercent === 0) {
    return { offsetPercent: ZERO_PERCENT, widthPercent: 0, side: "none" };
  }
  return standing > 0
    ? { offsetPercent: ZERO_PERCENT, widthPercent, side: "positive" }
    : {
        offsetPercent: ZERO_PERCENT - widthPercent,
        widthPercent,
        side: "negative",
      };
}

/** One row per faction, in catalog order — the city's own running order. */
export function factionRows(reputation: ReputationState): FactionRow[] {
  return factions.map((faction) => {
    const standing = reputationOf(reputation, faction.id);
    const band = bandOf(reputation, faction.id);
    return {
      factionId: faction.id,
      name: faction.name,
      blurb: faction.blurb,
      standing,
      band: band.id,
      bandLabel: band.label,
      bandBlurb: band.blurb,
      meter: factionMeter(standing),
    };
  });
}
