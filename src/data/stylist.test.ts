import { describe, expect, it } from "vitest";
import { APPEARANCE_FIELDS } from "../character/appearance";
import { appearanceCatalogs } from "./appearance";
import { APPEARANCE_TABS } from "./appearanceTabs";
import {
  COSMETIC_APPEARANCE_TABS,
  IDENTITY_CATEGORIES,
  RESTYLE_PRICE,
  isCosmeticCategory,
} from "./stylist";

/**
 * The stylist screen renders COSMETIC_APPEARANCE_TABS through the same
 * catalog-driven picker as the creation wizard, so these tests pin the
 * same shape guarantee: the config partitions the appearance categories
 * (cosmetic vs identity) and stays derived from the wizard's tabs — a
 * new cosmetic category reaches the chapel with zero stylist changes.
 */
describe("stylist content rules", () => {
  const cosmeticCategories = COSMETIC_APPEARANCE_TABS.flatMap((tab) =>
    tab.categories.map((config) => config.category),
  );

  it("charges a positive flat fee", () => {
    expect(Number.isInteger(RESTYLE_PRICE)).toBe(true);
    expect(RESTYLE_PRICE).toBeGreaterThan(0);
  });

  it("keeps build and skin tone off the chair — they are the person", () => {
    expect([...IDENTITY_CATEGORIES].sort()).toEqual(["build", "skinTone"]);
    for (const category of IDENTITY_CATEGORIES) {
      expect(isCosmeticCategory(category)).toBe(false);
      expect(cosmeticCategories).not.toContain(category);
    }
  });

  it("offers exactly the non-identity categories, each once", () => {
    const expected = APPEARANCE_FIELDS.filter(isCosmeticCategory);
    expect(new Set(cosmeticCategories).size).toBe(cosmeticCategories.length);
    expect([...cosmeticCategories].sort()).toEqual([...expected].sort());
  });

  it("derives its tabs from the wizard's config, dropping emptied tabs", () => {
    for (const tab of COSMETIC_APPEARANCE_TABS) {
      const source = APPEARANCE_TABS.find((t) => t.id === tab.id);
      expect(source, `tab ${tab.id} not in APPEARANCE_TABS`).toBeDefined();
      expect(tab.label).toBe(source!.label);
      expect(tab.categories.length).toBeGreaterThan(0);
      // Section configs come through identical (label, kind, thumbs);
      // only identity categories are filtered out.
      for (const config of tab.categories) {
        expect(source!.categories).toContainEqual(config);
      }
    }
    // The wizard's body tab is all identity content and disappears.
    expect(COSMETIC_APPEARANCE_TABS.map((tab) => tab.id)).not.toContain("body");
  });

  it("references only real, non-empty catalogs", () => {
    for (const category of cosmeticCategories) {
      expect(appearanceCatalogs[category].length).toBeGreaterThan(0);
    }
  });
});
