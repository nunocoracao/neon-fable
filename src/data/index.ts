/**
 * Typed game content: items, enemies, story nodes, maps. All content is
 * data-defined here — never hard-coded in engine code.
 */
export {
  DEFAULT_BACKGROUND_ID,
  backgrounds,
  getBackground,
  type Background,
} from "./backgrounds";
export { getItem, items, requireItem } from "./items";
export {
  abilities,
  getAbility,
  requireAbility,
  type Ability,
  type AbilityEffect,
} from "./abilities";
export { enemies, getEnemy, requireEnemy, type Enemy } from "./enemies";
export {
  encounters,
  getEncounter,
  requireEncounter,
  type Encounter,
  type EncounterRewards,
  type EncounterSpawn,
} from "./encounters";
export { act1Arc, findArcByNode, getArc, introArc, storyArcs } from "./story";
export { HUB_MAP_ID, getMap, maps, requireMap } from "./maps";
export { endings, getEnding, type ChapterEnding } from "./endings";
