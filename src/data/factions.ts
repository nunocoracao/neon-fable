/**
 * The three powers that keep a ledger on the player.
 *
 * They are not new: the story has been naming them since Act 1. The
 * Combine owns the water and the paperwork, the Court speaks for the
 * levels the water was going to take, and the Market is six storeys of
 * people who will sell to either of them and remember which one you
 * walked in with. Everything here is content — names, blurbs, band
 * labels — and the arithmetic lives in src/state/reputation.ts, which
 * knows none of these names. What each recorded story outcome is worth
 * is one file further out, in ./standings.ts, so this module can stay a
 * leaf that the story content itself is free to import.
 *
 * Standing runs REPUTATION_MIN..REPUTATION_MAX with five named bands.
 * The number is a bookkeeping detail; the band is what the player is
 * shown and what content should gate on, so re-tuning a swing never
 * silently moves a gate.
 */

export const FACTION_IDS = ["auric", "court", "market"] as const;

export type FactionId = (typeof FACTION_IDS)[number];

export interface Faction {
  id: FactionId;
  /** Display name, as the districts say it. */
  name: string;
  /** One line: who they are and what they are counting. */
  blurb: string;
}

export const factions: readonly Faction[] = [
  {
    id: "auric",
    name: "The Auric Combine",
    blurb:
      "Owns the pumps, the towers, and the paperwork that says so. " +
      "Keeps a recovery desk, a warrant book, and a long memory.",
  },
  {
    id: "court",
    name: "The Cistern Court",
    blurb:
      "The Undercroft's own council — sappers, siphon crews, and " +
      "Matron Ferrow, who has never once forgotten a name.",
  },
  {
    id: "market",
    name: "The Vertical Market",
    blurb:
      "Six levels of traders, brokers and fixers. No leader, no roll, " +
      "and a shared account of exactly who is good for it.",
  },
];

const factionsById = new Map<string, Faction>(factions.map((f) => [f.id, f]));

export function getFaction(id: string): Faction | undefined {
  return factionsById.get(id);
}

export class FactionError extends Error {
  constructor(readonly code: "unknown-faction", message: string) {
    super(message);
    this.name = "FactionError";
  }
}

export function requireFaction(id: string): Faction {
  const faction = getFaction(id);
  if (!faction) {
    throw new FactionError("unknown-faction", `No faction with id "${id}"`);
  }
  return faction;
}

export function isFactionId(id: string): id is FactionId {
  return factionsById.has(id);
}

/** Standing floor and ceiling; every write is clamped into this range. */
export const REPUTATION_MIN = -100;
export const REPUTATION_MAX = 100;

export const REPUTATION_BAND_IDS = [
  "hostile",
  "cold",
  "neutral",
  "warm",
  "trusted",
] as const;

export type ReputationBandId = (typeof REPUTATION_BAND_IDS)[number];

export interface ReputationBand {
  id: ReputationBandId;
  label: string;
  /** Lowest standing that reads as this band. */
  min: number;
  /** What being in this band means, in the faction's own terms. */
  blurb: string;
}

/**
 * The bands, ascending. `min` is inclusive and the last band whose min
 * a value clears wins, so the table is total over the whole range as
 * long as the first entry sits at REPUTATION_MIN.
 */
export const REPUTATION_BANDS: readonly ReputationBand[] = [
  {
    id: "hostile",
    label: "Hostile",
    min: REPUTATION_MIN,
    blurb: "They would rather you stopped existing on their streets.",
  },
  {
    id: "cold",
    label: "Cold",
    min: -60,
    blurb: "Doors close early. Prices are punitive and final.",
  },
  {
    id: "neutral",
    label: "Neutral",
    min: -20,
    blurb: "A face they have seen. Nothing owed either way.",
  },
  {
    id: "warm",
    label: "Warm",
    min: 20,
    blurb: "You get told things a little before everybody else does.",
  },
  {
    id: "trusted",
    label: "Trusted",
    min: 60,
    blurb: "Their business is discussed in front of you, not around you.",
  },
];

const bandsById = new Map<string, ReputationBand>(
  REPUTATION_BANDS.map((band) => [band.id, band]),
);

export function getBand(id: string): ReputationBand | undefined {
  return bandsById.get(id);
}

/**
 * The highest standing that still reads as this band — one below the
 * next band's floor, and REPUTATION_MAX for the top band.
 *
 * What it is for is the other half of a band gate. `{ value: "warm" }`
 * says "warm or better" and reads well; the mirror — "neutral or worse"
 * — cannot be said with a band id at all, because an at-most gate on
 * `"neutral"` asks for the band's *floor*. Content that wants the whole
 * of a band and everything under it asks for its ceiling instead, and
 * keeps the numbers out of the prose files.
 */
export function bandCeiling(id: ReputationBandId): number {
  const index = REPUTATION_BANDS.findIndex((band) => band.id === id);
  const next = index < 0 ? undefined : REPUTATION_BANDS[index + 1];
  return next ? next.min - 1 : REPUTATION_MAX;
}

/** What a choice, or an outcome, is worth to each faction. */
export type StandingDelta = Partial<Record<FactionId, number>>;

/**
 * The side chains authored their swings as relative weights (1 = a nod,
 * 2 = a favour) before there was a scale to put them on. This is what
 * one of those weights is worth in standing — a chain terminal moves a
 * faction about a fifth of a band, which is what a district errand
 * should be next to a chapter.
 */
export const SIDE_CHAIN_STEP = 6;

/** Multiplies an authored weight table into standing points. */
export function scaleStanding(
  standing: StandingDelta,
  factor: number,
): StandingDelta {
  const scaled: StandingDelta = {};
  for (const id of FACTION_IDS) {
    const weight = standing[id];
    if (weight != null && weight !== 0) scaled[id] = weight * factor;
  }
  return scaled;
}
