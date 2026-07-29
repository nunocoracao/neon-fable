import { describe, expect, it } from "vitest";
import { APPEARANCE_FIELDS } from "../character/appearance";
import { HAIR_COLORS, PALETTE, SKIN_RAMPS } from "../iso/art/palette";
import {
  EYE_COLOR_OPTIONS,
  HAIR_COLOR_OPTIONS,
  SKIN_TONE_OPTIONS,
  appearanceCatalogs,
} from "./appearance";
import {
  APPEARANCE_TABS,
  SWATCH_CATEGORIES,
  moveInGrid,
  swatchChips,
  type PickerCategoryConfig,
} from "./appearanceTabs";

/**
 * The picker UI renders one thumb per catalog entry for every thumb
 * category and one palette chip per catalog entry for every swatch
 * category the tab config names, straight off appearanceCatalogs — so
 * the shape these tests pin down is exactly what "a new catalog entry
 * appears with zero UI changes" relies on.
 */
describe("appearance tab config", () => {
  const configs = APPEARANCE_TABS.flatMap(
    (tab): readonly PickerCategoryConfig[] => tab.categories,
  );
  const thumbCategories = configs.flatMap((c) =>
    c.kind === "thumbs" ? [c.category] : [],
  );
  const swatchCategories = configs.flatMap((c) =>
    c.kind === "swatch" ? [c.category] : [],
  );

  it("references only real, non-empty catalogs", () => {
    for (const config of configs) {
      expect(appearanceCatalogs[config.category].length).toBeGreaterThan(0);
    }
  });

  it("partitions every appearance category once between grids and swatch rows", () => {
    const covered = configs.map((c) => c.category);
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual([...APPEARANCE_FIELDS].sort());
  });

  it("derives SWATCH_CATEGORIES from the tab config's swatch rows", () => {
    expect(SWATCH_CATEGORIES).toEqual(swatchCategories);
  });

  it("places each swatch row in its category's tab", () => {
    const tabOf = (category: string): string | undefined =>
      APPEARANCE_TABS.find((tab) =>
        tab.categories.some((c) => c.category === category),
      )?.id;
    expect(tabOf("skinTone")).toBe("body");
    expect(tabOf("hairColor")).toBe("hair");
    expect(tabOf("eyeColor")).toBe("face");
  });

  it("keeps every option id unique within its catalog (thumb identity)", () => {
    for (const category of thumbCategories) {
      const ids = appearanceCatalogs[category].map((option) => option.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("gives every grid at least one column and a label", () => {
    for (const tab of APPEARANCE_TABS) {
      expect(tab.label.length).toBeGreaterThan(0);
      for (const config of tab.categories) {
        expect(config.label.length).toBeGreaterThan(0);
        if (config.kind === "thumbs") {
          expect(config.columns).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});

describe("swatchChips", () => {
  it("derives one chip per catalog entry for every swatch category", () => {
    for (const category of SWATCH_CATEGORIES) {
      const chips = swatchChips(category);
      expect(chips.map((chip) => chip.id)).toEqual(
        appearanceCatalogs[category].map((option) => option.id),
      );
      expect(chips.map((chip) => chip.label)).toEqual(
        appearanceCatalogs[category].map((option) => option.label),
      );
      for (const chip of chips) {
        expect(chip.color, `${category}:${chip.id}`).toBeTruthy();
      }
    }
  });

  it("colors skin chips from the palette ramps' mid-tones — one per ramp", () => {
    const chips = swatchChips("skinTone");
    // Every authored ramp is pickable (appearance.test pins the catalog
    // to SKIN_RAMPS), so adding a ramp adds a chip with no UI changes.
    expect(chips.length).toBe(SKIN_RAMPS.length);
    expect(chips.map((chip) => chip.color)).toEqual(
      SKIN_TONE_OPTIONS.map((option) => PALETTE[SKIN_RAMPS[option.ramp]!.base]),
    );
  });

  it("colors hair chips from the palette's hair colors — one per color", () => {
    const chips = swatchChips("hairColor");
    expect(chips.length).toBe(HAIR_COLORS.length);
    expect(chips.map((chip) => chip.color)).toEqual(
      HAIR_COLOR_OPTIONS.map((option) => PALETTE[option.color]),
    );
  });

  it("colors eye chips from the catalog's palette entries", () => {
    const chips = swatchChips("eyeColor");
    expect(chips.map((chip) => chip.color)).toEqual(
      EYE_COLOR_OPTIONS.map((option) => PALETTE[option.color]),
    );
    // Distinct picks read as distinct chips.
    expect(new Set(chips.map((chip) => chip.color)).size).toBe(chips.length);
  });

  it("throws for a category whose options carry no color data", () => {
    expect(() => swatchChips("mouth")).toThrow(/no palette color/);
  });
});

describe("moveInGrid", () => {
  // A 5-wide grid of 8 options: indices 0-4 on the first row, 5-7 below.
  it("steps left/right by one and up/down by a row", () => {
    expect(moveInGrid(1, 8, 5, "ArrowRight")).toBe(2);
    expect(moveInGrid(1, 8, 5, "ArrowLeft")).toBe(0);
    expect(moveInGrid(1, 8, 5, "ArrowDown")).toBe(6);
    expect(moveInGrid(6, 8, 5, "ArrowUp")).toBe(1);
  });

  it("refuses moves off the grid instead of wrapping", () => {
    expect(moveInGrid(0, 8, 5, "ArrowLeft")).toBeNull();
    expect(moveInGrid(7, 8, 5, "ArrowRight")).toBeNull();
    expect(moveInGrid(0, 8, 5, "ArrowUp")).toBeNull();
    expect(moveInGrid(6, 8, 5, "ArrowDown")).toBeNull();
  });

  it("ignores non-arrow keys", () => {
    expect(moveInGrid(1, 8, 5, "Enter")).toBeNull();
    expect(moveInGrid(1, 8, 5, "a")).toBeNull();
  });
});
