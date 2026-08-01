import type { Background } from "../data/backgrounds";
import { emptyEquipment, type EquipmentState } from "../inventory/equipment";
import type { TimedEffect } from "../inventory/items";
import {
  AppearanceValidationError,
  validateAppearance,
  type Appearance,
} from "./appearance";
import { deriveAttributes, type DerivedAttributes } from "./derived";
import type { CarriedInjury } from "./injury";
import {
  applyBonuses,
  validateAllocation,
  type PointBuyError,
  type Stats,
} from "./stats";

/**
 * Advancement spending record. Neither currency is stored — points are
 * derived from chapter-completion flags (src/character/advancement.ts)
 * and street cred from the run's deeds and won fights
 * (src/character/cred.ts) — so only what was *taken* needs to persist.
 */
export interface AdvancementState {
  /** Advancement points spent on stat raises and ability unlocks. */
  pointsSpent: number;
  /** Ability ids unlocked with points; folded into grantedAbilityIds. */
  abilityIds: string[];
  /**
   * Perks taken at street-cred milestones, in the order they were
   * chosen. Permanent: nothing removes an id from this list, and the
   * pool a later milestone offers is the pool less these.
   */
  perkIds: string[];
}

/**
 * The character portion of GameState. Plain serializable data; derived
 * attributes are stored for convenience but recomputed on stat changes.
 */
export interface CharacterState {
  name: string;
  backgroundId: string;
  /** Final stat line: point-buy allocation plus background bonuses. */
  stats: Stats;
  derived: DerivedAttributes;
  /** Current hit points; starts at derived.maxHp. */
  hp: number;
  /** Neural load consumed by installed enhancements; starts at 0. */
  neuralLoad: number;
  /** Equipped weapon/outfit and installed enhancements, by item id. */
  equipment: EquipmentState;
  /** Visual customization, as ids into the appearance catalogs. */
  appearance: Appearance;
  /** Narrative tags inherited from the background. */
  tags: string[];
  /** Chapter-advancement spends (stat raises, unlocked abilities). */
  advancement: AdvancementState;
  /**
   * What the last bad fight left behind, or nothing. At most one at a
   * time (see src/character/injury.ts); absent and null both mean
   * unhurt, which is what every save written before injuries existed
   * already says.
   */
  injury?: CarriedInjury | null;
  /**
   * Timed effects bought out of combat and held over for the next
   * fight — what a hot meal is worth (see src/character/readied.ts).
   * Absent means carrying nothing, which is what every save written
   * before street food existed already says.
   */
  readied?: TimedEffect[];
}

export class CharacterCreationError extends Error {
  readonly errors: PointBuyError[];

  constructor(errors: PointBuyError[]) {
    super(
      `invalid point-buy allocation: ${errors.map((e) => e.code).join(", ")}`,
    );
    this.name = "CharacterCreationError";
    this.errors = errors;
  }
}

export interface CreateCharacterInput {
  name: string;
  background: Background;
  /** Point-buy allocation, before background bonuses. */
  allocation: Stats;
  /** Point pool the allocation must spend; defaults to POINT_POOL (New Game+ passes more). */
  pointPool?: number;
  /**
   * Visual customization. Required and validated — every character is
   * built with a deliberate, catalog-backed look (the creation wizard
   * always supplies one; tests go through the shared fixtures).
   */
  appearance: Appearance;
}

/** A valid allocation that spends the whole pool evenly (all stats at 6). */
export function defaultAllocation(): Stats {
  return { body: 6, reflexes: 6, tech: 6, cool: 6, intelligence: 6 };
}

/**
 * Builds the character portion of GameState. Throws CharacterCreationError
 * if the allocation fails point-buy validation, and
 * AppearanceValidationError if the appearance references unknown
 * catalog ids — no code path builds a character with an unvalidated look.
 */
export function createCharacter(input: CreateCharacterInput): CharacterState {
  const validation = validateAllocation(input.allocation, input.pointPool);
  if (!validation.valid) {
    throw new CharacterCreationError(validation.errors);
  }
  const appearanceErrors = validateAppearance(input.appearance);
  if (appearanceErrors.length > 0) {
    throw new AppearanceValidationError(appearanceErrors);
  }
  const stats = applyBonuses(input.allocation, input.background.statBonuses);
  const derived = deriveAttributes(stats);
  return {
    name: input.name.trim(),
    backgroundId: input.background.id,
    stats,
    derived,
    hp: derived.maxHp,
    neuralLoad: 0,
    equipment: emptyEquipment(),
    appearance: { ...input.appearance },
    tags: [...input.background.tags],
    // Nobody starts with a reputation — including a New Game+ runner,
    // whose carry-over is deliberately gear and points and never the
    // habits the last one earned (see src/state/ngplus.ts).
    advancement: { pointsSpent: 0, abilityIds: [], perkIds: [] },
  };
}
