import type { StatKey } from "../character/stats";
import type { RangeType } from "../inventory/items";
import type { CombatWeapon } from "./types";

/**
 * Attack math. All pure: hit chance and damage are plain functions of
 * stats, weapon, and armor; the only randomness is the hit roll, which the
 * action layer draws from the seeded RNG.
 */

export const MELEE_RANGE = 1;
export const RANGED_RANGE = 5;

export const BASE_HIT_CHANCE = 0.6;
export const HIT_CHANCE_PER_POINT = 0.05;
export const MIN_HIT_CHANCE = 0.05;
export const MAX_HIT_CHANCE = 0.95;

export const BASE_FLEE_CHANCE = 0.4;
export const FLEE_CHANCE_PER_POINT = 0.05;
export const MIN_FLEE_CHANCE = 0.05;
export const MAX_FLEE_CHANCE = 0.9;

/** Fallback weapon when the player has nothing equipped. */
export const UNARMED_WEAPON: CombatWeapon = {
  name: "Bare Hands",
  damage: 2,
  rangeType: "melee",
};

/** Stat an attack rolls and adds damage with: Body up close, Reflexes at range. */
export function attackStatKey(rangeType: RangeType): StatKey {
  return rangeType === "melee" ? "body" : "reflexes";
}

export function weaponRange(rangeType: RangeType): number {
  return rangeType === "melee" ? MELEE_RANGE : RANGED_RANGE;
}

/** Flat damage added on top of weapon damage from the attack stat. */
export function damageBonus(attackStat: number): number {
  return Math.floor((attackStat - 4) / 2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Chance in [MIN, MAX] that an attack lands: attacker stat vs Reflexes. */
export function hitChance(attackStat: number, defenderReflexes: number): number {
  return clamp(
    BASE_HIT_CHANCE + HIT_CHANCE_PER_POINT * (attackStat - defenderReflexes),
    MIN_HIT_CHANCE,
    MAX_HIT_CHANCE,
  );
}

/** Damage a landed hit deals: weapon + stat bonus, minus armor, min 1. */
export function attackDamage(
  weapon: CombatWeapon,
  attackStat: number,
  targetArmor: number,
): number {
  return Math.max(1, weapon.damage + damageBonus(attackStat) - targetArmor);
}

/**
 * Whether armor took the greater share of a landed blow: at least as
 * much was stopped as got through. Equivalent to armor covering half or
 * more of the raw figure, since what got through is the raw figure less
 * the armor. Damage that ignores armor never glances — pass 0.
 *
 * Purely a reading of the numbers the math already produces; nothing in
 * the engine branches on it. The combat scene does, playing a reduced
 * shudder instead of a full flinch when a hit barely got through.
 */
export function isGlancingBlow(damageDealt: number, armor: number): boolean {
  return armor > 0 && armor >= damageDealt;
}

/** Ability damage: flat amount, reduced by armor unless it ignores it. */
export function abilityDamage(
  amount: number,
  targetArmor: number,
  ignoresArmor: boolean,
): number {
  return Math.max(1, amount - (ignoresArmor ? 0 : targetArmor));
}

/** Chance to escape: player Reflexes vs the living enemies' average. */
export function fleeChance(
  playerReflexes: number,
  enemyReflexes: number[],
): number {
  if (enemyReflexes.length === 0) return MAX_FLEE_CHANCE;
  const average =
    enemyReflexes.reduce((sum, r) => sum + r, 0) / enemyReflexes.length;
  return clamp(
    BASE_FLEE_CHANCE + FLEE_CHANCE_PER_POINT * (playerReflexes - average),
    MIN_FLEE_CHANCE,
    MAX_FLEE_CHANCE,
  );
}
