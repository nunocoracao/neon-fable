/**
 * Turn-based combat engine: initiative, actions, seeded-RNG damage
 * resolution. Pure and deterministic — same seed and action sequence
 * produce identical CombatState and event logs.
 */
export { takeAction } from "./actions";
export { chooseEnemyAction, runEnemyTurns } from "./ai";
export {
  BASE_FLEE_CHANCE,
  BASE_HIT_CHANCE,
  CRITICAL_DAMAGE_SHARE,
  MELEE_RANGE,
  RANGED_RANGE,
  UNARMED_WEAPON,
  abilityDamage,
  attackDamage,
  attackStatKey,
  damageBonus,
  fleeChance,
  hitChance,
  isCriticalBlow,
  isGlancingBlow,
  weaponRange,
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
