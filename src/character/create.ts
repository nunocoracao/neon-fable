import type { Background } from "../data/backgrounds";
import { emptyEquipment, type EquipmentState } from "../inventory/equipment";
import { deriveAttributes, type DerivedAttributes } from "./derived";
import {
  applyBonuses,
  validateAllocation,
  type PointBuyError,
  type Stats,
} from "./stats";

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
  /** Narrative tags inherited from the background. */
  tags: string[];
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
}

/** A valid allocation that spends the whole pool evenly (all stats at 6). */
export function defaultAllocation(): Stats {
  return { body: 6, reflexes: 6, tech: 6, cool: 6, intelligence: 6 };
}

/**
 * Builds the character portion of GameState. Throws CharacterCreationError
 * if the allocation fails point-buy validation.
 */
export function createCharacter(input: CreateCharacterInput): CharacterState {
  const validation = validateAllocation(input.allocation);
  if (!validation.valid) {
    throw new CharacterCreationError(validation.errors);
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
    tags: [...input.background.tags],
  };
}
