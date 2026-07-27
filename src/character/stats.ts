/**
 * Core stats and the point-buy model. Pure functions only — no DOM, no
 * GameState mutation. An allocation is a full stat line the player builds
 * by spending POINT_POOL points on top of STAT_MIN in every stat.
 */
export const STAT_KEYS = [
  "body",
  "reflexes",
  "tech",
  "cool",
  "intelligence",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export type Stats = Record<StatKey, number>;

/** Lowest value a stat can be bought at (also the pre-spend baseline). */
export const STAT_MIN = 3;
/** Highest value a stat can be bought to during point-buy. */
export const STAT_MAX = 10;
/** Points spent on top of STAT_MIN across all stats; 1 point = +1 stat. */
export const POINT_POOL = 15;
/** Absolute ceiling — background bonuses can push a stat past STAT_MAX up to here. */
export const STAT_HARD_CAP = 12;

/** A fresh stat line with every stat at the pre-spend baseline. */
export function baseStats(): Stats {
  return {
    body: STAT_MIN,
    reflexes: STAT_MIN,
    tech: STAT_MIN,
    cool: STAT_MIN,
    intelligence: STAT_MIN,
  };
}

/** Points an allocation spends above the baseline (negative values count against). */
export function pointsSpent(allocation: Stats): number {
  return STAT_KEYS.reduce((sum, key) => sum + (allocation[key] - STAT_MIN), 0);
}

export type PointBuyErrorCode = "out-of-range" | "overspent" | "underspent";

export interface PointBuyError {
  code: PointBuyErrorCode;
  /** Set for per-stat errors (out-of-range); absent for pool-level errors. */
  stat?: StatKey;
}

export interface PointBuyValidation {
  valid: boolean;
  errors: PointBuyError[];
  spent: number;
  remaining: number;
}

/**
 * Validates a point-buy allocation: every stat must be an integer in
 * [STAT_MIN, STAT_MAX] and the pool must be spent exactly. The pool
 * defaults to POINT_POOL; New Game+ passes a larger one.
 */
export function validateAllocation(
  allocation: Stats,
  pool: number = POINT_POOL,
): PointBuyValidation {
  const errors: PointBuyError[] = [];
  for (const key of STAT_KEYS) {
    const value = allocation[key];
    if (!Number.isInteger(value) || value < STAT_MIN || value > STAT_MAX) {
      errors.push({ code: "out-of-range", stat: key });
    }
  }
  const spent = pointsSpent(allocation);
  if (spent > pool) {
    errors.push({ code: "overspent" });
  } else if (spent < pool) {
    errors.push({ code: "underspent" });
  }
  return {
    valid: errors.length === 0,
    errors,
    spent,
    remaining: pool - spent,
  };
}

/**
 * Applies flat bonuses (e.g. from a background) to a stat line, returning a
 * new object. Results are clamped to [STAT_MIN, STAT_HARD_CAP].
 */
export function applyBonuses(
  stats: Stats,
  bonuses: Partial<Record<StatKey, number>>,
): Stats {
  const result = { ...stats };
  for (const key of STAT_KEYS) {
    const bonus = bonuses[key] ?? 0;
    result[key] = Math.min(
      STAT_HARD_CAP,
      Math.max(STAT_MIN, result[key] + bonus),
    );
  }
  return result;
}
