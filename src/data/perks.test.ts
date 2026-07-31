import { describe, expect, it } from "vitest";
import {
  PERK_DOMAINS,
  getPerk,
  perks,
  perksIn,
  requirePerk,
  type PerkEffects,
} from "./perks";
import { NO_PERKS } from "../character/perks";

/**
 * The pool as content: unique, whole, and spread across the three
 * places a perk can matter. Every perk's *mechanical* effect is
 * asserted where it lands (src/character/perkEffects.test.ts); this
 * file only pins the authoring rules.
 */

describe("perk pool", () => {
  it("offers between eight and ten perks", () => {
    expect(perks.length).toBeGreaterThanOrEqual(8);
    expect(perks.length).toBeLessThanOrEqual(10);
  });

  it("has unique ids, all namespaced", () => {
    const ids = perks.map((perk) => perk.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("perk-")).toBe(true);
  });

  it("covers combat, dialogue, and inventory", () => {
    for (const domain of PERK_DOMAINS) {
      expect(perksIn(domain).length).toBeGreaterThan(0);
    }
    expect(perks.every((perk) => PERK_DOMAINS.includes(perk.domain))).toBe(true);
  });

  it("gives every perk a name, a description, and effect text", () => {
    for (const perk of perks) {
      expect(perk.name.length).toBeGreaterThan(0);
      expect(perk.description.length).toBeGreaterThan(0);
      expect(perk.effect.length).toBeGreaterThan(0);
    }
  });

  it("grants something — a perk that changed no figure would be a bug", () => {
    for (const perk of perks) {
      const moved = Object.entries(perk.effects).filter(
        ([, value]) => value !== 0 && value !== undefined,
      );
      expect(moved.length, `${perk.id} moves no figure`).toBeGreaterThan(0);
    }
  });

  it("only names figures the modifier record actually folds", () => {
    const known = new Set(Object.keys(NO_PERKS));
    for (const perk of perks) {
      for (const field of Object.keys(perk.effects) as (keyof PerkEffects)[]) {
        expect(known, `${perk.id} names "${field}"`).toContain(field);
      }
    }
  });

  it("resolves by id, and refuses one it does not have", () => {
    for (const perk of perks) {
      expect(getPerk(perk.id)).toBe(perk);
      expect(requirePerk(perk.id)).toBe(perk);
    }
    expect(getPerk("perk-nonexistent")).toBeUndefined();
    expect(() => requirePerk("perk-nonexistent")).toThrow(/no perk with id/i);
  });
});
