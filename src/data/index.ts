/**
 * Typed game content: items, enemies, story nodes, maps. All content is
 * data-defined here — never hard-coded in engine code.
 */
export {
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
  getAppearanceOption,
  resolveExpression,
  type AppearanceCategory,
  type AppearanceOption,
  type BuildOption,
  type ColorOption,
  type ExpressionId,
  type ExpressionOverlays,
  type ExpressiveFaceStyleOption,
  type FaceStyleOption,
  type SkinToneOption,
  type StyleOption,
} from "./appearance";
export {
  DEFAULT_BACKGROUND_ID,
  backgrounds,
  getBackground,
  type Background,
} from "./backgrounds";
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
export { enemies, getEnemy, requireEnemy, type Enemy } from "./enemies";
export {
  encounters,
  getEncounter,
  requireEncounter,
  type Encounter,
  type EncounterRewards,
  type EncounterSpawn,
} from "./encounters";
export {
  act1Arc,
  act2Arc,
  act3Arc,
  findArcByNode,
  getArc,
  introArc,
  storyArcs,
} from "./story";
export { HUB_MAP_ID, getMap, maps, requireMap } from "./maps";
export { endings, getEnding, type ChapterEnding } from "./endings";
export { epilogueVignettes } from "./epilogues";
