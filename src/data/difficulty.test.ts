import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIFFICULTY_ID,
  DIFFICULTIES,
  NEUTRAL_MODIFIERS,
  clampDifficultyId,
  difficultyModifiers,
  getDifficulty,
  requireDifficulty,
  scaleByPercent,
  tunedCredits,
  tunedEnemyHp,
  tunedIncomingDamage,
  tunedInjuryThreshold,
  type DifficultyModifiers,
} from "./difficulty";

/**
 * The presets as content, and the four seams they act through. Every
 * assertion here is arithmetic — what a preset *means* at a call site
 * is pinned in the engine's own tests (see src/combat/tuning.test.ts).
 */

const PERCENT_FIELDS: (keyof DifficultyModifiers)[] = [
  "incomingDamagePct",
  "enemyHpPct",
  "creditRewardPct",
  "injuryThresholdPct",
];

describe("the catalog", () => {
  it("offers exactly three presets with unique ids and real copy", () => {
    expect(DIFFICULTIES).toHaveLength(3);
    expect(new Set(DIFFICULTIES.map((d) => d.id)).size).toBe(3);
    for (const preset of DIFFICULTIES) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.blurb.length).toBeGreaterThan(20);
    }
  });

  it("defaults to the middle preset, which changes nothing at all", () => {
    expect(DEFAULT_DIFFICULTY_ID).toBe("grind");
    expect(requireDifficulty(DEFAULT_DIFFICULTY_ID).modifiers).toEqual(
      NEUTRAL_MODIFIERS,
    );
  });

  it("keeps every percentage positive and finite", () => {
    for (const preset of DIFFICULTIES) {
      for (const field of PERCENT_FIELDS) {
        expect(preset.modifiers[field]).toBeGreaterThan(0);
        expect(Number.isFinite(preset.modifiers[field])).toBe(true);
      }
    }
  });

  it("orders the presets: Drift softer than Grind, Blackout harder", () => {
    const drift = requireDifficulty("drift").modifiers;
    const grind = requireDifficulty("grind").modifiers;
    const blackout = requireDifficulty("blackout").modifiers;
    expect(drift.incomingDamagePct).toBeLessThan(grind.incomingDamagePct);
    expect(blackout.incomingDamagePct).toBeGreaterThan(grind.incomingDamagePct);
    expect(drift.enemyHpPct).toBeLessThan(blackout.enemyHpPct);
    expect(drift.injuryThresholdPct).toBeLessThan(
      blackout.injuryThresholdPct,
    );
    // The trade: the street pays for risk, so the money runs the other
    // way from the danger rather than compounding with it.
    expect(drift.creditRewardPct).toBeLessThan(grind.creditRewardPct);
    expect(blackout.creditRewardPct).toBeGreaterThan(grind.creditRewardPct);
  });

  it("resolves ids, and refuses one it does not have", () => {
    expect(getDifficulty("drift")?.label).toBe("Drift");
    expect(getDifficulty("impossible")).toBeUndefined();
    expect(() => requireDifficulty("impossible")).toThrow(/impossible/);
  });

  it("clamps anything off the list to the default", () => {
    expect(clampDifficultyId("blackout")).toBe("blackout");
    for (const bad of [undefined, null, 3, "", "nightmare", {}, true]) {
      expect(clampDifficultyId(bad)).toBe(DEFAULT_DIFFICULTY_ID);
    }
  });

  it("reads an unknown id as the authored figures rather than throwing", () => {
    expect(difficultyModifiers("nightmare")).toEqual(NEUTRAL_MODIFIERS);
    expect(difficultyModifiers("drift")).toEqual(
      requireDifficulty("drift").modifiers,
    );
  });
});

describe("the seams", () => {
  it("scales by percent, rounding half up and never below zero", () => {
    expect(scaleByPercent(10, 100)).toBe(10);
    expect(scaleByPercent(10, 135)).toBe(14); // 13.5 rounds up
    expect(scaleByPercent(10, 0)).toBe(0);
    expect(scaleByPercent(-5, 100)).toBe(0);
  });

  it("keeps a landed blow worth at least a point, however soft the city", () => {
    expect(tunedIncomingDamage(10, 70)).toBe(7);
    expect(tunedIncomingDamage(1, 70)).toBe(1);
    expect(tunedIncomingDamage(3, 1)).toBe(1);
    // A blow that never landed stays nothing — a preset cannot conjure
    // damage out of a miss.
    expect(tunedIncomingDamage(0, 135)).toBe(0);
    expect(tunedIncomingDamage(-2, 135)).toBe(0);
  });

  it("keeps an enemy standing with at least one point of frame", () => {
    expect(tunedEnemyHp(20, 125)).toBe(25);
    expect(tunedEnemyHp(20, 85)).toBe(17);
    expect(tunedEnemyHp(1, 1)).toBe(1);
    expect(tunedEnemyHp(20, 100)).toBe(20);
  });

  it("scales a payday, and leaves an unpaid one unpaid", () => {
    expect(tunedCredits(40, 125)).toBe(50);
    expect(tunedCredits(40, 85)).toBe(34);
    expect(tunedCredits(0, 125)).toBe(0);
    expect(tunedCredits(-10, 125)).toBe(0);
  });

  it("scales the bloodied share, down to nothing at zero percent", () => {
    expect(tunedInjuryThreshold(0.2, 100)).toBeCloseTo(0.2);
    expect(tunedInjuryThreshold(0.2, 50)).toBeCloseTo(0.1);
    expect(tunedInjuryThreshold(0.2, 150)).toBeCloseTo(0.3);
    expect(tunedInjuryThreshold(0.2, 0)).toBe(0);
  });

  it("leaves every figure alone at the neutral preset", () => {
    const n = NEUTRAL_MODIFIERS;
    expect(tunedIncomingDamage(7, n.incomingDamagePct)).toBe(7);
    expect(tunedEnemyHp(23, n.enemyHpPct)).toBe(23);
    expect(tunedCredits(37, n.creditRewardPct)).toBe(37);
    expect(tunedInjuryThreshold(0.2, n.injuryThresholdPct)).toBe(0.2);
  });
});
