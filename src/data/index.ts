/**
 * Typed game content: items, enemies, story nodes, maps. All content is
 * data-defined here — never hard-coded in engine code.
 */
export {
  BACKGROUND_APPEARANCE_PRESETS,
  BUILD_OPTIONS,
  BROWS_OPTIONS,
  EXPRESSION_IDS,
  EYE_COLOR_OPTIONS,
  EYES_OPTIONS,
  FACE_DETAIL_OPTIONS,
  HAIR_COLOR_OPTIONS,
  HAIR_STYLE_OPTIONS,
  HEADWEAR_OPTIONS,
  MOUTH_OPTIONS,
  SKIN_TONE_OPTIONS,
  appearanceCatalogs,
  backgroundPresets,
  getAppearanceOption,
  resolveExpression,
  type AppearanceCategory,
  type AppearanceOption,
  type AppearancePreset,
  type BuildOption,
  type ColorOption,
  type ExpressionId,
  type ExpressionOverlays,
  type ExpressiveFaceStyleOption,
  type FaceStyleOption,
  type HairInteraction,
  type HairStyleOption,
  type HeadwearOption,
  type SkinToneOption,
  type StyleOption,
} from "./appearance";
export {
  APPEARANCE_TABS,
  SWATCH_CATEGORIES,
  moveInGrid,
  swatchChips,
  type AppearanceTabConfig,
  type AppearanceTabId,
  type PickerCategoryConfig,
  type SwatchCategoryConfig,
  type SwatchChip,
  type ThumbCategoryConfig,
  type ThumbKind,
} from "./appearanceTabs";
export {
  BARK_TRIGGERS,
  MAX_BARK_LENGTH,
  barks,
  getBark,
  requireBark,
  type Bark,
  type BarkSpeakerKind,
  type BarkTrigger,
} from "./barks";
export {
  DEFAULT_BACKGROUND_ID,
  backgrounds,
  getBackground,
  type Background,
} from "./backgrounds";
export {
  cast,
  castVisual,
  resolveSpeakerPortrait,
  type SpeakerPortrait,
} from "./cast";
export {
  BOND_OUTCOMES,
  CompanionError,
  REACTION_TAGS,
  companionLook,
  companionSpriteId,
  companions,
  getCompanion,
  parseCompanionSpriteId,
  reactionValue,
  requireCompanion,
  type BondOutcome,
  type Companion,
  type CompanionBondScene,
  type CompanionLook,
  type CompanionPersonalScene,
  type CompanionValues,
  type ReactionTag,
} from "./companions";
export {
  FactionError,
  FACTION_IDS,
  REPUTATION_BANDS,
  REPUTATION_BAND_IDS,
  REPUTATION_MAX,
  REPUTATION_MIN,
  SIDE_CHAIN_STEP,
  factions,
  getBand,
  getFaction,
  isFactionId,
  requireFaction,
  scaleStanding,
  type Faction,
  type FactionId,
  type ReputationBand,
  type ReputationBandId,
  type StandingDelta,
} from "./factions";
export {
  FACTION_STANDINGS,
  standingsForFlag,
  type StandingSource,
} from "./standings";
export { getItem, items, requireItem } from "./items";
export {
  abilities,
  advancementPool,
  getAbility,
  requireAbility,
  type Ability,
  type AbilityEffect,
  type AdvancementPoolEntry,
} from "./abilities";
export {
  STAT_RAISE_COST,
  chapterGrants,
  type ChapterGrant,
} from "./advancement";
export {
  ENEMY_SPRITE_KINDS,
  enemies,
  enemyLook,
  enemyLookCount,
  enemySpriteId,
  getEnemy,
  parseEnemySpriteId,
  requireEnemy,
  type DroneEnemy,
  type Enemy,
  type EnemySpriteKind,
  type HumanoidEnemy,
} from "./enemies";
export { type EnemyLookFamily } from "./enemyLooks";
export {
  encounters,
  getEncounter,
  requireEncounter,
  spawnLookIndex,
  spawnLookSeed,
  type Encounter,
  type EncounterRewards,
  type EncounterSpawn,
} from "./encounters";
export {
  COSMETIC_APPEARANCE_TABS,
  IDENTITY_CATEGORIES,
  RESTYLE_PRICE,
  RESTYLE_REFUSAL,
  isCosmeticCategory,
} from "./stylist";
export {
  act1Arc,
  act2Arc,
  act3Arc,
  chapelArc,
  companionsArc,
  findArcByNode,
  getArc,
  introArc,
  storyArcs,
  streetsArc,
} from "./story";
export {
  NEWS_CHANNELS,
  NEWS_HEADLINES,
  SCENE_REACTIONS,
  VENDOR_STOCK,
  WORLD_CONDITIONS,
  conditionRequirements,
  getCondition,
  requireCondition,
  spawnInteractable,
  vendorChoices,
  type Headline,
  type NewsChannelId,
  type SceneReaction,
  type VendorId,
  type VendorStockEntry,
  type WorldCondition,
  type WorldConditionId,
  type WorldDressing,
  type WorldNpcSpawn,
} from "./world";
export { HUB_MAP_ID, getMap, maps, requireMap } from "./maps";
export {
  dressMap,
  mapDressings,
  type InteractableDressing,
} from "./mapDressing";
export { endings, getEnding, type ChapterEnding } from "./endings";
export { epilogueVignettes } from "./epilogues";
