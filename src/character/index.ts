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
  APPEARANCE_FIELDS,
  composeCharacter,
  composeVisual,
  defaultAppearance,
  presetAppearanceFor,
  randomAppearance,
  randomizeUnlocked,
  resolveLayers,
  seededAppearance,
  validateAppearance,
  type Appearance,
  type AppearanceError,
  type AppearanceField,
  type AppearanceLocks,
  type CharacterVisual,
  type ItemLookup,
  type ResolvedLayer,
} from "./appearance";
export { interactableVisual, npcSeed } from "./npc";
export {
  composePortrait,
  portraitKey,
  resolvePortraitParts,
  type PortraitPart,
} from "./portrait";
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
  type AdvancementState,
  type CharacterState,
  type CreateCharacterInput,
} from "./create";
export {
  NAME_MAX_LENGTH,
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  advance,
  canAdvance,
  canGoBack,
  canJumpTo,
  createWizard,
  draftsEqual,
  goBack,
  jumpTo,
  nameValid,
  stepIndex,
  stepValid,
  updateDraft,
  type WizardContext,
  type WizardDraft,
  type WizardState,
  type WizardStep,
} from "./wizard";
export {
  AdvancementError,
  availablePoints,
  earnedPoints,
  raiseStat,
  unlockAbility,
  type AdvancementErrorCode,
  type AdvancementView,
} from "./advancement";
