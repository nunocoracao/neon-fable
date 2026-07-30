import { describe, expect, it } from "vitest";
import {
  BASE_FLEE_CHANCE,
  BASE_HIT_CHANCE,
  CRITICAL_DAMAGE_SHARE,
  MAX_FLEE_CHANCE,
  MAX_HIT_CHANCE,
  MELEE_RANGE,
  MIN_HIT_CHANCE,
  RANGED_RANGE,
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

describe("attack stat and range", () => {
  it("melee attacks roll Body, ranged attacks roll Reflexes", () => {
    expect(attackStatKey("melee")).toBe("body");
    expect(attackStatKey("ranged")).toBe("reflexes");
  });

  it("melee reaches adjacent tiles only, ranged reaches further", () => {
    expect(weaponRange("melee")).toBe(MELEE_RANGE);
    expect(weaponRange("ranged")).toBe(RANGED_RANGE);
    expect(RANGED_RANGE).toBeGreaterThan(MELEE_RANGE);
  });
});

describe("damageBonus", () => {
  it("scales with the attack stat around the baseline of 4", () => {
    expect(damageBonus(4)).toBe(0);
    expect(damageBonus(6)).toBe(1);
    expect(damageBonus(8)).toBe(2);
    expect(damageBonus(3)).toBe(-1);
  });
});

describe("hitChance", () => {
  it("is the base chance when attacker and defender are even", () => {
    expect(hitChance(6, 6)).toBe(BASE_HIT_CHANCE);
  });

  it("rises with attacker advantage and falls with defender advantage", () => {
    expect(hitChance(8, 6)).toBeCloseTo(0.7);
    expect(hitChance(4, 6)).toBeCloseTo(0.5);
  });

  it("clamps to the floor and ceiling", () => {
    expect(hitChance(1, 30)).toBe(MIN_HIT_CHANCE);
    expect(hitChance(30, 1)).toBe(MAX_HIT_CHANCE);
  });
});

describe("attackDamage", () => {
  it("adds the stat bonus to weapon damage and subtracts armor", () => {
    const weapon = { name: "w", damage: 5, rangeType: "melee" as const };
    expect(attackDamage(weapon, 6, 2)).toBe(4); // 5 + 1 - 2
    expect(attackDamage(weapon, 4, 0)).toBe(5);
  });

  it("never deals less than 1 on a landed hit", () => {
    const weapon = { name: "w", damage: 2, rangeType: "melee" as const };
    expect(attackDamage(weapon, 4, 99)).toBe(1);
  });
});

describe("abilityDamage", () => {
  it("is reduced by armor unless the ability ignores it", () => {
    expect(abilityDamage(7, 3, false)).toBe(4);
    expect(abilityDamage(7, 3, true)).toBe(7);
  });

  it("never deals less than 1", () => {
    expect(abilityDamage(2, 99, false)).toBe(1);
  });
});

describe("isGlancingBlow", () => {
  it("is a glance when plating stopped as much as got through", () => {
    // Raw 4 against 3 armor: 1 lands, 3 stopped.
    expect(isGlancingBlow(1, 3)).toBe(true);
    expect(isGlancingBlow(3, 3)).toBe(true);
    expect(isGlancingBlow(4, 3)).toBe(false);
  });

  it("is never a glance through armor that was not there", () => {
    expect(isGlancingBlow(1, 0)).toBe(false);
    // What an armor-ignoring ability reports: no plating in the way.
    expect(isGlancingBlow(7, 0)).toBe(false);
  });
});

describe("isCriticalBlow", () => {
  it("is critical once a blow takes its share of the whole frame", () => {
    // A third of a 30 HP frame: 10 shouts, 9 does not.
    expect(isCriticalBlow(10, 30)).toBe(true);
    expect(isCriticalBlow(9, 30)).toBe(false);
    expect(isCriticalBlow(30, 30)).toBe(true);
    expect(CRITICAL_DAMAGE_SHARE).toBe(1 / 3);
  });

  it("scales with the target rather than with a flat figure", () => {
    // The same 8 damage is a big hit on a courier and a scratch on a
    // chassis — the reading is a share, not a number.
    expect(isCriticalBlow(8, 20)).toBe(true);
    expect(isCriticalBlow(8, 90)).toBe(false);
  });

  it("says nothing about a blow that landed on nothing", () => {
    expect(isCriticalBlow(0, 30)).toBe(false);
    expect(isCriticalBlow(5, 0)).toBe(false);
  });
});

describe("fleeChance", () => {
  it("is the base chance against evenly matched enemies", () => {
    expect(fleeChance(6, [6, 6])).toBe(BASE_FLEE_CHANCE);
  });

  it("compares player Reflexes against the enemy average", () => {
    expect(fleeChance(8, [4, 8])).toBeCloseTo(BASE_FLEE_CHANCE + 0.1);
  });

  it("is capped, and maximal with no living enemies", () => {
    expect(fleeChance(30, [1])).toBe(MAX_FLEE_CHANCE);
    expect(fleeChance(1, [])).toBe(MAX_FLEE_CHANCE);
  });
});
