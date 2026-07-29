import { describe, expect, it } from "vitest";
import { composeVisual, validateAppearance } from "../character";
import { composedCharacterKey } from "../iso/art/layers";
import { ENHANCEMENT_SLOTS } from "../inventory/items";
import { enemies, getEnemy, requireEnemy } from "./enemies";
import { getItem } from "./items";

describe("enemy registry", () => {
  it("looks up enemies by id and throws on unknown ids", () => {
    expect(getEnemy("nme-auric-agent")?.name).toBe("Auric Retrieval Agent");
    expect(getEnemy("nme-nobody")).toBeUndefined();
    expect(requireEnemy("nme-rustyard-bruiser").maxHp).toBeGreaterThan(0);
    expect(() => requireEnemy("nme-nobody")).toThrow(/No enemy/);
  });
});

describe("enemy visuals", () => {
  it("every archetype's appearance validates against the catalogs", () => {
    for (const enemy of enemies) {
      expect(validateAppearance(enemy.visual.appearance), enemy.id).toEqual([]);
    }
  });

  it("authored gear resolves to real items of the right kind that actually draw", () => {
    for (const enemy of enemies) {
      const { weapon, outfit, enhancements } = enemy.visual;
      if (weapon !== undefined) {
        const item = getItem(weapon);
        expect(item?.kind, `${enemy.id} weapon ${weapon}`).toBe("weapon");
        expect(
          item?.kind === "weapon" && item.weaponLayer,
          `${enemy.id} weapon ${weapon} has a layer`,
        ).toBeTruthy();
      }
      if (outfit !== undefined) {
        const item = getItem(outfit);
        expect(item?.kind, `${enemy.id} outfit ${outfit}`).toBe("outfit");
        expect(
          item?.kind === "outfit" && item.outfitLayer,
          `${enemy.id} outfit ${outfit} has a layer`,
        ).toBeTruthy();
      }
      for (const slot of ENHANCEMENT_SLOTS) {
        const id = enhancements?.[slot];
        if (id === undefined) continue;
        const item = getItem(id);
        expect(item?.kind, `${enemy.id} ${slot} ${id}`).toBe("enhancement");
        if (item?.kind !== "enhancement") continue;
        expect(item.slot, `${enemy.id} ${slot} ${id} slot match`).toBe(slot);
        expect(item.cyberLayer, `${enemy.id} ${slot} ${id} has a layer`).toBeTruthy();
      }
    }
  });

  it("hostility reads through the data: every archetype wears the crimson/magenta optic cue", () => {
    for (const enemy of enemies) {
      expect(["crimson", "magenta"], enemy.id).toContain(
        enemy.visual.appearance.eyeColor,
      );
    }
  });

  it("every archetype composes through the layer pipeline into a distinct look", () => {
    const keys = enemies.map((enemy) =>
      composedCharacterKey(composeVisual(enemy.visual)),
    );
    expect(new Set(keys).size).toBe(enemies.length);
  });
});
