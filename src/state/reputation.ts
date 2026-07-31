import {
  FACTION_IDS,
  REPUTATION_BANDS,
  REPUTATION_MAX,
  REPUTATION_MIN,
  type FactionId,
  type ReputationBand,
  type ReputationBandId,
  type StandingDelta,
} from "../data/factions";
import { FACTION_STANDINGS } from "../data/standings";
import type { FlagMap } from "./flags";

/**
 * Where the player stands with the city's three powers.
 *
 * Plain serializable data on GameState — one bounded number per faction
 * — and pure functions over it, exactly like the party. Nothing here
 * knows who the Combine is or what an act outcome was worth; the names,
 * the bands, and the table of what each recorded outcome is worth are
 * content in src/data/factions.ts.
 *
 * The number is bookkeeping. What the player is shown, and what content
 * should gate on, is the *band* — so re-tuning a swing moves the number
 * without silently moving a door.
 *
 * Two paths write it and they must agree. A live run adds a choice's
 * authored `standing` tag as the choice is taken; a save that predates
 * the system is read back with `deriveReputation`, which sums the same
 * table's entries against the flags that run already recorded. Both
 * clamp, so a maximally aligned playthrough lands at the ceiling rather
 * than running away from it.
 */

export interface ReputationState {
  /** Standing per faction, always within [REPUTATION_MIN, REPUTATION_MAX]. */
  standing: Record<FactionId, number>;
}

/** Where every faction starts: a face nobody has an opinion about yet. */
export function emptyReputation(): ReputationState {
  const standing = {} as Record<FactionId, number>;
  for (const id of FACTION_IDS) standing[id] = 0;
  return { standing };
}

/** Holds a standing inside the scale. */
export function clampReputation(value: number): number {
  return Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, Math.round(value)));
}

/**
 * Standing with one faction. A faction a save has never heard of — an
 * old save, or content a later build added — stands at nothing rather
 * than throwing.
 */
export function reputationOf(
  reputation: ReputationState,
  factionId: FactionId,
): number {
  return reputation.standing[factionId] ?? 0;
}

/**
 * The band a standing reads as: the last band whose floor it clears.
 * Total over the scale — the first band sits at REPUTATION_MIN — and
 * over anything outside it, which is why an unclamped number still
 * names a band.
 */
export function bandFor(value: number): ReputationBand {
  let band = REPUTATION_BANDS[0]!;
  for (const candidate of REPUTATION_BANDS) {
    if (value >= candidate.min) band = candidate;
  }
  return band;
}

/** The band one faction currently reads the player as. */
export function bandOf(
  reputation: ReputationState,
  factionId: FactionId,
): ReputationBand {
  return bandFor(reputationOf(reputation, factionId));
}

/**
 * A gate's threshold: a raw standing, or the band it must reach. Bands
 * are the better unit for content — "warm" survives a re-tune of what
 * an act outcome is worth; `20` does not.
 */
export type ReputationThreshold = number | ReputationBandId;

/** The standing a threshold asks for. */
export function thresholdValue(threshold: ReputationThreshold): number {
  if (typeof threshold === "number") return threshold;
  const band = REPUTATION_BANDS.find((entry) => entry.id === threshold);
  // An unknown band id is an authoring bug (validateArc catches it in
  // content); at runtime it reads as unreachable rather than as open.
  return band?.min ?? REPUTATION_MAX + 1;
}

/**
 * Whether a faction opens a door at this threshold. `mode` "at-most" is
 * the other side of the same gate — the beat somebody only offers once
 * it has gone badly.
 */
export function canAccess(
  reputation: ReputationState,
  factionId: FactionId,
  threshold: ReputationThreshold,
  mode: "at-least" | "at-most" = "at-least",
): boolean {
  const value = reputationOf(reputation, factionId);
  const target = thresholdValue(threshold);
  return mode === "at-most" ? value <= target : value >= target;
}

/** Moves one faction's standing by `delta`, clamped. */
export function adjustReputation(
  reputation: ReputationState,
  factionId: FactionId,
  delta: number,
): ReputationState {
  const next = clampReputation(reputationOf(reputation, factionId) + delta);
  if (next === reputationOf(reputation, factionId)) return reputation;
  return {
    ...reputation,
    standing: { ...reputation.standing, [factionId]: next },
  };
}

/** Applies a whole authored swing at once; a swing of nothing is a no-op. */
export function applyStanding(
  reputation: ReputationState,
  delta: StandingDelta | undefined,
): ReputationState {
  if (!delta) return reputation;
  let next = reputation;
  for (const id of FACTION_IDS) {
    const amount = delta[id];
    if (amount) next = adjustReputation(next, id, amount);
  }
  return next;
}

/** Adds authored swings together, dropping factions nothing moved. */
export function sumStanding(
  deltas: readonly StandingDelta[],
): StandingDelta {
  const total: StandingDelta = {};
  for (const id of FACTION_IDS) {
    let amount = 0;
    for (const delta of deltas) amount += delta[id] ?? 0;
    if (amount !== 0) total[id] = amount;
  }
  return total;
}

/**
 * Reputation read back off what a run already recorded: every entry in
 * the standing table whose flag the save matches, summed and clamped.
 *
 * This is how a save from before factions existed arrives with a
 * standing it earned — a player who stopped the Undertow with the Court
 * and cut the Undercroft free loads as somebody the Court trusts and
 * the Combine does not. The sum is taken before the clamp rather than
 * step by step, because the order a finished save's flags were written
 * in is not recoverable; the difference only ever shows on a run that
 * would have pinned to the ceiling anyway.
 */
export function deriveReputation(flags: FlagMap): ReputationState {
  const totals = sumStanding(
    FACTION_STANDINGS.filter(
      (source) => flags[source.flag] === source.value,
    ).map((source) => source.standing),
  );
  const reputation = emptyReputation();
  for (const id of FACTION_IDS) {
    reputation.standing[id] = clampReputation(totals[id] ?? 0);
  }
  return reputation;
}
