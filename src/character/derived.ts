import type { Stats } from "./stats";

/**
 * Attributes computed from the final stat line (after background bonuses).
 * Never stored authoritatively — recompute whenever stats change.
 */
export interface DerivedAttributes {
  maxHp: number;
  initiative: number;
  /**
   * Neural load capacity — how much installed cyberware the character's
   * body and composure can sustain. Each enhancement costs load; installs
   * past capacity are rejected (enforced by the inventory system).
   */
  neuralCapacity: number;
  meleeDamageBonus: number;
  rangedDamageBonus: number;
}

export function maxHp(stats: Stats): number {
  return 12 + stats.body * 3;
}

export function initiative(stats: Stats): number {
  return stats.reflexes;
}

export function neuralCapacity(stats: Stats): number {
  return Math.floor((stats.body + stats.cool) / 2);
}

export function meleeDamageBonus(stats: Stats): number {
  return Math.floor((stats.body - 4) / 2);
}

export function rangedDamageBonus(stats: Stats): number {
  return Math.floor((stats.reflexes - 4) / 2);
}

export function deriveAttributes(stats: Stats): DerivedAttributes {
  return {
    maxHp: maxHp(stats),
    initiative: initiative(stats),
    neuralCapacity: neuralCapacity(stats),
    meleeDamageBonus: meleeDamageBonus(stats),
    rangedDamageBonus: rangedDamageBonus(stats),
  };
}
