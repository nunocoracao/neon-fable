import { describe, expect, it } from "vitest";
import {
  POINT_POOL,
  STAT_HARD_CAP,
  STAT_KEYS,
  STAT_MIN,
  applyBonuses,
  baseStats,
  pointsSpent,
  validateAllocation,
  type Stats,
} from "./stats";

/** Spends the whole pool: 6 across the board (5 stats × 3 points = 15). */
function validAllocation(): Stats {
  return { body: 6, reflexes: 6, tech: 6, cool: 6, intelligence: 6 };
}

describe("baseStats / pointsSpent", () => {
  it("starts every stat at the baseline with nothing spent", () => {
    const base = baseStats();
    for (const key of STAT_KEYS) {
      expect(base[key]).toBe(STAT_MIN);
    }
    expect(pointsSpent(base)).toBe(0);
  });

  it("counts points spent above the baseline", () => {
    expect(pointsSpent(validAllocation())).toBe(POINT_POOL);
    expect(pointsSpent({ ...baseStats(), body: 8 })).toBe(5);
  });
});

describe("validateAllocation", () => {
  it("accepts an allocation that spends the pool exactly within range", () => {
    const result = validateAllocation(validAllocation());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.spent).toBe(POINT_POOL);
    expect(result.remaining).toBe(0);
  });

  it("accepts an uneven but legal spread", () => {
    const result = validateAllocation({
      body: 10,
      reflexes: 8,
      tech: 3,
      cool: 3,
      intelligence: 6,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects overspending the pool", () => {
    const result = validateAllocation({ ...validAllocation(), body: 7 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({ code: "overspent" });
    expect(result.remaining).toBe(-1);
  });

  it("rejects leaving points unspent", () => {
    const result = validateAllocation({ ...validAllocation(), body: 5 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({ code: "underspent" });
    expect(result.remaining).toBe(1);
  });

  it("rejects a stat below the minimum", () => {
    const result = validateAllocation({ ...validAllocation(), tech: 2 });
    expect(result.errors).toContainEqual({ code: "out-of-range", stat: "tech" });
    expect(result.valid).toBe(false);
  });

  it("rejects a stat above the point-buy maximum", () => {
    const result = validateAllocation({
      body: 11,
      reflexes: 4,
      tech: 3,
      cool: 3,
      intelligence: 3,
    });
    expect(result.errors).toContainEqual({ code: "out-of-range", stat: "body" });
    expect(result.valid).toBe(false);
  });

  it("rejects non-integer stat values", () => {
    const result = validateAllocation({ ...validAllocation(), cool: 6.5 });
    expect(result.errors).toContainEqual({ code: "out-of-range", stat: "cool" });
    expect(result.valid).toBe(false);
  });
});

describe("applyBonuses", () => {
  it("adds bonuses without mutating the input", () => {
    const stats = validAllocation();
    const boosted = applyBonuses(stats, { reflexes: 1, body: 1 });
    expect(boosted.reflexes).toBe(7);
    expect(boosted.body).toBe(7);
    expect(boosted.tech).toBe(6);
    expect(stats.reflexes).toBe(6);
  });

  it("clamps results to the hard cap", () => {
    const boosted = applyBonuses(
      { body: 10, reflexes: 8, tech: 3, cool: 3, intelligence: 6 },
      { body: 5 },
    );
    expect(boosted.body).toBe(STAT_HARD_CAP);
  });

  it("never drops a stat below the minimum", () => {
    const nerfed = applyBonuses(validAllocation(), { cool: -10 });
    expect(nerfed.cool).toBe(STAT_MIN);
  });
});
