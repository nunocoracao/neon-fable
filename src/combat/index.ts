/**
 * Turn-based combat engine: initiative, actions, seeded-RNG damage
 * resolution. Pure and deterministic — same seed and action sequence
 * produce identical CombatState and event logs.
 */
export { takeAction } from "./actions";
export { chooseEnemyAction, runEnemyTurns } from "./ai";
export {
  abilityAreaTiles,
  abilityImpact,
  areaTiles,
} from "./area";
export {
  BASE_FLEE_CHANCE,
  BASE_HIT_CHANCE,
  CRITICAL_DAMAGE_SHARE,
  HEAVY_DAMAGE_SHARE,
  MELEE_RANGE,
  RANGED_RANGE,
  UNARMED_WEAPON,
  abilityDamage,
  abilityHit,
  attackDamage,
  attackStatKey,
  damageBonus,
  fleeChance,
  hitChance,
  isCriticalBlow,
  isGlancingBlow,
  isHeavyBlow,
  weaponRange,
  type AbilityHit,
} from "./damage";
export { inBounds, isOccupied, manhattan, moveSpeed } from "./grid";
export {
  abilityOptions,
  attackOptions,
  fleeChanceFor,
  itemOptions,
  manhattanPath,
  reachableTiles,
  type AbilityOption,
  type AbilityTargetOption,
  type AttackOption,
  type ItemOption,
} from "./legal";
export { combatResultFlag, resolveCombat } from "./outcome";
export {
  COMBAT_ACTION_KINDS,
  abilityPreviews,
  actionAvailabilities,
  actionAvailability,
  attackPreview,
  movePreview,
  outcomesFor,
  type AbilityPreview,
  type ActionAvailability,
  type ActionBlockReason,
  type AttackPreview,
  type CombatActionKind,
  type MovePreview,
  type OutcomePreview,
  type OutcomeStatus,
  type PreviewIntent,
} from "./preview";
export {
  TELEGRAPH_REASONS,
  TELEGRAPH_ROLES,
  resolveTelegraphTiles,
  telegraphField,
  telegraphHover,
  telegraphTargetAt,
  telegraphTiles,
  type TelegraphHover,
  type TelegraphIntent,
  type TelegraphReason,
  type TelegraphRole,
  type TelegraphTile,
} from "./telegraph";
export { PLAYER_COMBATANT_ID, createCombat } from "./setup";
export {
  activeCombatant,
  combatStat,
  getCombatant,
  isAlive,
  livingEnemies,
  playerCombatant,
  requireCombatant,
} from "./state";
export {
  CombatError,
  type ActiveBoost,
  type CombatAction,
  type CombatConsumable,
  type CombatErrorCode,
  type CombatEvent,
  type CombatState,
  type CombatStatus,
  type CombatWeapon,
  type Combatant,
  type GridPosition,
  type GridSize,
} from "./types";
