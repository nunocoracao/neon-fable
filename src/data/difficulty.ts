/**
 * How hard the city is tonight.
 *
 * Three presets, each a bundle of percentages applied at seams that
 * already exist: what a hostile blow costs, how much frame an enemy
 * brings, what a payday is worth, and how bloodied you have to finish a
 * fight before it leaves a mark. Nothing here is a rule of its own —
 * every figure is a multiplier over a number the game already computed,
 * so a preset can never invent a mechanic and can never be forgotten by
 * one.
 *
 * ## Chance is not a difficulty knob
 *
 * Deliberately absent: hit chances, flee chances, and every other roll.
 * The whole engine's determinism guarantee is that a seed plus an action
 * sequence produce one fight (see src/combat/actions.ts), and a preset
 * that moved the odds would move which draws come back on the same seed
 * — a saved fight would resolve differently for a reason no player asked
 * about. So difficulty here only ever scales figures the math already
 * produced. The same seed on Blackout and on Drift lands and misses on
 * exactly the same turns; the blows simply weigh different amounts.
 *
 * ## The trade
 *
 * Easier is not strictly better: the street pays for risk. Drift takes
 * the edge off every fight and pays less for it; Blackout hurts and pays
 * accordingly. Grind is the authored game — every figure 100 — which is
 * also what every save from before difficulty existed loads as.
 */

export type DifficultyId = "drift" | "grind" | "blackout";

/**
 * A preset, as percentages of the authored figure. 100 is "leave it
 * alone", which is what makes Grind a real entry rather than a special
 * case the code has to check for.
 */
export interface DifficultyModifiers {
  /**
   * What a blow from the other side costs the player's side. Applied to
   * the damage the math already worked out, so armor, piercing, and
   * every weapon figure still mean what they meant.
   */
  incomingDamagePct: number;
  /** How much frame an enemy brings to the arena, at setup. */
  enemyHpPct: number;
  /** What a payday is worth: fight rewards and breach credits. */
  creditRewardPct: number;
  /**
   * How bloodied a fight has to leave somebody before it marks them
   * (see BLOODIED_SHARE in src/combat/injury.ts). Lower is kinder: a
   * body has to finish closer to nothing before it limps out carrying
   * something. Going *down* still always leaves a mark, on every
   * preset — that is not frequency, that is what happened.
   */
  injuryThresholdPct: number;
}

export interface Difficulty {
  id: DifficultyId;
  /** The word the pickers put on it. */
  label: string;
  /** One line of what playing it is like. */
  blurb: string;
  modifiers: DifficultyModifiers;
}

/** The authored game: every figure exactly as it was written. */
export const NEUTRAL_MODIFIERS: DifficultyModifiers = {
  incomingDamagePct: 100,
  enemyHpPct: 100,
  creditRewardPct: 100,
  injuryThresholdPct: 100,
};

export const DIFFICULTIES: readonly Difficulty[] = [
  {
    id: "drift",
    label: "Drift",
    blurb:
      "The city still bites. It just does not chew. Fights land lighter " +
      "and leave less behind — and the work pays what easy work pays.",
    modifiers: {
      incomingDamagePct: 70,
      enemyHpPct: 85,
      creditRewardPct: 85,
      injuryThresholdPct: 50,
    },
  },
  {
    id: "grind",
    label: "Grind",
    blurb:
      "The city as it was written. Nothing shaded either way — what the " +
      "street costs is what the street pays.",
    modifiers: { ...NEUTRAL_MODIFIERS },
  },
  {
    id: "blackout",
    label: "Blackout",
    blurb:
      "Everything hits harder, stands longer, and marks you for it. The " +
      "money is better because somebody has to be desperate enough.",
    modifiers: {
      incomingDamagePct: 135,
      enemyHpPct: 125,
      creditRewardPct: 125,
      injuryThresholdPct: 150,
    },
  },
];

/** The middle preset: what a fresh run plays on unless it says otherwise. */
export const DEFAULT_DIFFICULTY_ID: DifficultyId = "grind";

const byId = new Map(DIFFICULTIES.map((entry) => [entry.id, entry]));

export function getDifficulty(id: string): Difficulty | undefined {
  return byId.get(id as DifficultyId);
}

export function requireDifficulty(id: string): Difficulty {
  const found = getDifficulty(id);
  if (!found) throw new Error(`No difficulty "${id}"`);
  return found;
}

/** Coerces any value onto the preset list; anything else is the default. */
export function clampDifficultyId(value: unknown): DifficultyId {
  return typeof value === "string" && byId.has(value as DifficultyId)
    ? (value as DifficultyId)
    : DEFAULT_DIFFICULTY_ID;
}

/** The bundle a preset id names; an unknown id reads as neutral. */
export function difficultyModifiers(id: string): DifficultyModifiers {
  return getDifficulty(id)?.modifiers ?? { ...NEUTRAL_MODIFIERS };
}

/* ------------------------------------------------------------------ *
 * The seams
 * ------------------------------------------------------------------ *
 *
 * Four functions, one per thing a preset is allowed to touch. Every
 * caller in the game goes through exactly one of them, so "what does
 * Blackout do" is answerable by reading this block rather than by
 * grepping for a percentage.
 */

/** A percentage of a figure, rounded half-up. Never negative. */
export function scaleByPercent(value: number, percent: number): number {
  return Math.max(0, Math.round(value * (percent / 100)));
}

/**
 * What a blow from the other side actually costs, given
 * `incomingDamagePct`. A hit that landed always costs at least a point
 * — a preset may soften the city, never make it harmless — and a blow
 * that never landed stays nothing.
 */
export function tunedIncomingDamage(damage: number, percent: number): number {
  if (damage <= 0) return 0;
  return Math.max(1, scaleByPercent(damage, percent));
}

/** How much frame an enemy brings, given `enemyHpPct`. Never under one. */
export function tunedEnemyHp(maxHp: number, percent: number): number {
  return Math.max(1, scaleByPercent(maxHp, percent));
}

/** What a payday is worth, given `creditRewardPct`. Nothing stays nothing. */
export function tunedCredits(credits: number, percent: number): number {
  if (credits <= 0) return 0;
  return scaleByPercent(credits, percent);
}

/**
 * The share of a frame a body has to finish a fight at or under before
 * the night marks them, given `injuryThresholdPct`. A preset that
 * scales this toward nothing leaves only the bodies that actually went
 * down carrying anything, which is the kindest honest reading of "fewer
 * injuries".
 */
export function tunedInjuryThreshold(share: number, percent: number): number {
  return Math.max(0, share * (percent / 100));
}
