/**
 * Character system: point-buy stats (Body, Reflexes, Tech, Cool,
 * Intelligence), derived attributes, and character creation. Pure logic —
 * background content lives in src/data/backgrounds.ts.
 */
export {
  POINT_POOL,
  STAT_HARD_CAP,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  applyBonuses,
  baseStats,
  pointsSpent,
  validateAllocation,
  type PointBuyError,
  type PointBuyErrorCode,
  type PointBuyValidation,
  type StatKey,
  type Stats,
} from "./stats";
export {
  deriveAttributes,
  initiative,
  maxHp,
  meleeDamageBonus,
  neuralCapacity,
  rangedDamageBonus,
  type DerivedAttributes,
} from "./derived";
export {
  CharacterCreationError,
  createCharacter,
  defaultAllocation,
  type CharacterState,
  type CreateCharacterInput,
} from "./create";
