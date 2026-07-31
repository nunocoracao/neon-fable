/**
 * Static: the noise stacked chrome makes.
 *
 * Every enhancement is a second nervous system arguing with the first,
 * and the argument is audible. Each install carries a **Static load**
 * (see EnhancementItem.staticLoad); the loads on everything currently
 * installed sum into a level, and the level reads as one of four
 * **bands**. The band is what the game speaks in — a number of points
 * of neural noise means nothing to a player, while "loud" is a fact
 * they can act on.
 *
 * This file is content and nothing else: the band floors, what each
 * band is called, what it feels like, and exactly what it costs. The
 * pure derivation — summing the installs, banding the total, previewing
 * an install before it happens — lives in src/inventory/staticLoad.ts,
 * and the systems that pay the cost (dialogue in
 * src/narrative/requirements.ts, the fight in src/combat/surge.ts) read
 * the effects below rather than switching on a band id.
 *
 * ## The bands are a trade, not a punishment
 *
 * Only the top two bands cost anything, and both of them *also* buy
 * something. A visibly chromed runner takes a Cool penalty in
 * conversation and opens doors that are shut to a clean face: the
 * street reads chrome as commitment, and some rooms only let in people
 * who have already paid for their opinions. Nobody is meant to sit at
 * clear because clear is optimal — they are meant to choose which
 * conversation they would rather be able to have.
 *
 * The one unambiguous cost lives at screaming, and it is answerable:
 * see src/combat/surge.ts, where the surge is telegraphed a full turn
 * ahead and bled off by holding still.
 */

export const STATIC_BANDS = ["clear", "humming", "loud", "screaming"] as const;

export type StaticBand = (typeof STATIC_BANDS)[number];

/**
 * What a band actually does. Every figure is read by a system that
 * knows nothing about band ids — the dialogue layer subtracts
 * `coolPenalty`, the fight subtracts `initiativePenalty` — so retuning
 * a band is a change to this table and nowhere else.
 */
export interface StaticBandEffects {
  /**
   * Points of Cool a stat gate loses in conversation. Composure is the
   * first thing noise takes: people hear the hardware before they hear
   * the sentence. Combat stats are untouched — a jittering runner
   * shoots exactly as well, they simply cannot talk their way out.
   */
  readonly coolPenalty: number;
  /**
   * Points of Reflexes the initiative order docks. Chance-free and
   * fixed: the same loadout always falls the same distance down the
   * order, which is what makes it something to plan around.
   */
  readonly initiativePenalty: number;
  /**
   * Whether the chrome is visible enough to be an argument. Content
   * gates chrome-affinity choices on this through the `static`
   * requirement (see src/narrative/types.ts).
   */
  readonly chromeAffinity: boolean;
  /** Whether the noise can build to a discharge mid-fight. */
  readonly surge: boolean;
}

export interface StaticBandDef {
  readonly id: StaticBand;
  readonly label: string;
  /** Lowest Static level that reads as this band; inclusive. */
  readonly min: number;
  /** What carrying this much noise is like, on the character screen. */
  readonly blurb: string;
  readonly effects: StaticBandEffects;
}

/**
 * The bands, ascending. `min` is inclusive and the last band whose
 * floor a level clears wins, so the table is total over every level as
 * long as the first entry sits at 0 — which it does, because Static
 * never goes negative (dampeners subtract, but the floor holds).
 */
export const STATIC_BANDS_TABLE: readonly StaticBandDef[] = [
  {
    id: "clear",
    label: "Clear",
    min: 0,
    blurb: "Your own signal, uncontested. Nothing in you is talking back.",
    effects: {
      coolPenalty: 0,
      initiativePenalty: 0,
      chromeAffinity: false,
      surge: false,
    },
  },
  {
    id: "humming",
    label: "Humming",
    min: 3,
    blurb:
      "A carrier tone under everything, felt in the jaw. Only you can " +
      "hear it, and only just.",
    effects: {
      coolPenalty: 0,
      initiativePenalty: 0,
      chromeAffinity: false,
      surge: false,
    },
  },
  {
    id: "loud",
    label: "Loud",
    min: 5,
    blurb:
      "The room hears you coming. Conversations get shorter — and the " +
      "ones that get longer are with people who read chrome as a pledge.",
    effects: {
      coolPenalty: 1,
      initiativePenalty: 0,
      chromeAffinity: true,
      surge: false,
    },
  },
  {
    id: "screaming",
    label: "Screaming",
    min: 8,
    blurb:
      "Every implant shouting over the others. You are half a step " +
      "behind the world, and once a fight the noise takes the step back.",
    effects: {
      coolPenalty: 2,
      initiativePenalty: 1,
      chromeAffinity: true,
      surge: true,
    },
  },
];

const bandsById = new Map<StaticBand, StaticBandDef>(
  STATIC_BANDS_TABLE.map((band) => [band.id, band]),
);

/** One band's definition; total over StaticBand, so never undefined. */
export function staticBand(id: StaticBand): StaticBandDef {
  return bandsById.get(id) ?? STATIC_BANDS_TABLE[0]!;
}

/**
 * How far up the ladder a band sits. Gates compare rungs rather than
 * levels, so "loud or worse" survives a retune of what loud costs.
 */
export function staticBandRank(id: StaticBand): number {
  const index = STATIC_BANDS.indexOf(id);
  return index < 0 ? 0 : index;
}
