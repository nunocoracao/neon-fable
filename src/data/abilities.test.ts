import { describe, expect, it } from "vitest";
import { abilities, advancementPool, getAbility, requireAbility } from "./abilities";
import { enemies } from "./enemies";
import { items } from "./items";
import { ABILITY_FX, ABILITY_FX_IDS } from "../iso/abilityFx";
import { ABILITY_FX_ART } from "../iso/art/abilityEffects";

/**
 * Ability content, and the look each ability resolves to. What is under
 * test: that every ability anything can reach — granted by gear, listed
 * on an enemy, or bought with advancement points — exists, and that
 * every one of them names an effect archetype that has both timing and
 * art behind it. Nothing may ship without a look: an ability whose
 * effect is nothing at all is a bug the player experiences as a blow
 * arriving out of thin air.
 */

describe("ability content", () => {
  it("has a unique id per ability", () => {
    const ids = abilities.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves every ability anything in the game can reach", () => {
    const granted = items.flatMap((item) =>
      ("effects" in item ? item.effects : [])
        .filter((effect) => effect.type === "grant-ability")
        .map((effect) => effect.abilityId),
    );
    const listed = enemies.flatMap((enemy) => enemy.abilityIds);
    const bought = advancementPool.map((entry) => entry.abilityId);
    for (const id of [...granted, ...listed, ...bought]) {
      expect(getAbility(id), id).toBeDefined();
      expect(() => requireAbility(id)).not.toThrow();
    }
  });
});

describe("what an ability looks like", () => {
  it("gives every ability an archetype with timing and art behind it", () => {
    for (const ability of abilities) {
      expect(ABILITY_FX_IDS, `${ability.id} effectRef`).toContain(
        ability.effectRef,
      );
      expect(ABILITY_FX[ability.effectRef], ability.id).toBeDefined();
      expect(
        ABILITY_FX_ART[ability.effectRef].frames.length,
        `${ability.id} art`,
      ).toBeGreaterThan(0);
    }
  });

  it("leaves no archetype unused — a look nothing plays is dead art", () => {
    const used = new Set(abilities.map((a) => a.effectRef));
    expect([...used].sort()).toEqual([...ABILITY_FX_IDS].sort());
  });

  it("plays a self buff as an aura, and everything thrown as something thrown", () => {
    for (const ability of abilities) {
      const form = ABILITY_FX[ability.effectRef].form;
      if (ability.effect.type === "boost") {
        // Nothing crosses the arena for a buff, so nothing may be drawn
        // crossing it — an aura is the only honest form.
        expect(form, `${ability.id} is a self buff`).toBe("aura");
        expect(ability.range, `${ability.id} reaches nobody`).toBe(0);
      } else {
        expect(form, `${ability.id} is thrown`).not.toBe("aura");
        expect(ability.range, `${ability.id} has reach`).toBeGreaterThan(0);
      }
    }
  });

  it("throws the same look for the same kind of blow", () => {
    // Themed reuse is deliberate: the arc a stun strike lays is the arc
    // a shock dart lays, at a different reach.
    const byRef = new Map<string, string[]>();
    for (const ability of abilities) {
      byRef.set(ability.effectRef, [
        ...(byRef.get(ability.effectRef) ?? []),
        ability.id,
      ]);
    }
    expect(byRef.get("shock-arc")).toEqual([
      "ability-stun-strike",
      "ability-shock-dart",
    ]);
    expect(byRef.get("kinetic-slam")).toEqual([
      "ability-crush",
      "ability-shatter-hand",
    ]);
    // And both of those go through plating, which is what they share.
    for (const id of byRef.get("kinetic-slam") ?? []) {
      const effect = requireAbility(id).effect;
      expect(effect.type === "damage" && effect.ignoresArmor, id).toBe(true);
    }
  });
});
