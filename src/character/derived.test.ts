import { describe, expect, it } from "vitest";
import {
  deriveAttributes,
  initiative,
  maxHp,
  meleeDamageBonus,
  neuralCapacity,
  rangedDamageBonus,
} from "./derived";
import type { Stats } from "./stats";

function statsWith(overrides: Partial<Stats>): Stats {
  return {
    body: 6,
    reflexes: 6,
    tech: 6,
    cool: 6,
    intelligence: 6,
    ...overrides,
  };
}

describe("derived attributes", () => {
  it("scales max HP with Body", () => {
    expect(maxHp(statsWith({ body: 3 }))).toBe(21);
    expect(maxHp(statsWith({ body: 6 }))).toBe(30);
    expect(maxHp(statsWith({ body: 10 }))).toBe(42);
  });

  it("takes initiative from Reflexes", () => {
    expect(initiative(statsWith({ reflexes: 3 }))).toBe(3);
    expect(initiative(statsWith({ reflexes: 9 }))).toBe(9);
  });

  it("derives neural capacity from Body and Cool", () => {
    expect(neuralCapacity(statsWith({ body: 3, cool: 3 }))).toBe(3);
    expect(neuralCapacity(statsWith({ body: 6, cool: 7 }))).toBe(6);
    expect(neuralCapacity(statsWith({ body: 10, cool: 10 }))).toBe(10);
  });

  it("derives melee damage bonus from Body", () => {
    expect(meleeDamageBonus(statsWith({ body: 3 }))).toBe(-1);
    expect(meleeDamageBonus(statsWith({ body: 6 }))).toBe(1);
    expect(meleeDamageBonus(statsWith({ body: 10 }))).toBe(3);
  });

  it("derives ranged damage bonus from Reflexes", () => {
    expect(rangedDamageBonus(statsWith({ reflexes: 3 }))).toBe(-1);
    expect(rangedDamageBonus(statsWith({ reflexes: 8 }))).toBe(2);
  });

  it("deriveAttributes bundles every individual function", () => {
    const stats = statsWith({ body: 7, reflexes: 5, cool: 8 });
    expect(deriveAttributes(stats)).toEqual({
      maxHp: maxHp(stats),
      initiative: initiative(stats),
      neuralCapacity: neuralCapacity(stats),
      meleeDamageBonus: meleeDamageBonus(stats),
      rangedDamageBonus: rangedDamageBonus(stats),
    });
  });
});
