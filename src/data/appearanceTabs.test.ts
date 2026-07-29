import { describe, expect, it } from "vitest";
import { APPEARANCE_FIELDS } from "../character/appearance";
import { appearanceCatalogs } from "./appearance";
import {
  APPEARANCE_TABS,
  SWATCH_CATEGORIES,
  moveInGrid,
} from "./appearanceTabs";

/**
 * The picker UI renders one thumb per catalog entry for every category
 * the tab config names, straight off appearanceCatalogs — so the shape
 * these tests pin down is exactly what "a new catalog entry appears
 * with zero UI changes" relies on.
 */
describe("appearance tab config", () => {
  const tabCategories = APPEARANCE_TABS.flatMap((tab) =>
    tab.categories.map((c) => c.category),
  );

  it("references only real, non-empty catalogs", () => {
    for (const category of tabCategories) {
      expect(appearanceCatalogs[category].length).toBeGreaterThan(0);
    }
  });

  it("partitions every appearance category once between tabs and swatches", () => {
    const covered = [...tabCategories, ...SWATCH_CATEGORIES];
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual([...APPEARANCE_FIELDS].sort());
  });

  it("keeps every option id unique within its catalog (thumb identity)", () => {
    for (const category of tabCategories) {
      const ids = appearanceCatalogs[category].map((option) => option.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("gives every grid at least one column and a label", () => {
    for (const tab of APPEARANCE_TABS) {
      expect(tab.label.length).toBeGreaterThan(0);
      for (const config of tab.categories) {
        expect(config.columns).toBeGreaterThanOrEqual(1);
        expect(config.label.length).toBeGreaterThan(0);
      }
    }
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
