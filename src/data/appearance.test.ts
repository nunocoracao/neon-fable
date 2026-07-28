import { describe, expect, it } from "vitest";
import {
  appearanceCatalogs,
  getAppearanceOption,
  EYE_COLOR_OPTIONS,
  FACE_DETAIL_OPTIONS,
  HAIR_COLOR_OPTIONS,
  HAIR_STYLE_OPTIONS,
  HEADWEAR_OPTIONS,
  BUILD_OPTIONS,
  SKIN_TONE_OPTIONS,
  type AppearanceCategory,
} from "./appearance";
import { BODY_BUILD_IDS } from "../iso/art/layers/body";
import { HAIR_COLORS, PALETTE, SKIN_RAMPS } from "../iso/art/palette";

const categories = Object.keys(appearanceCatalogs) as AppearanceCategory[];

describe("appearance catalogs", () => {
  it("every catalog is non-empty with unique ids and labels", () => {
    for (const category of categories) {
      const options = appearanceCatalogs[category];
      expect(options.length, category).toBeGreaterThan(0);
      const ids = options.map((o) => o.id);
      expect(new Set(ids).size, category).toBe(ids.length);
      for (const option of options) {
        expect(option.id, category).toMatch(/^[a-z0-9-]+$/);
        expect(option.label.length, `${category}:${option.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("skin tones reference valid palette ramps, uniquely", () => {
    const ramps = SKIN_TONE_OPTIONS.map((o) => o.ramp);
    expect(new Set(ramps).size).toBe(ramps.length);
    for (const ramp of ramps) {
      expect(SKIN_RAMPS[ramp]).toBeDefined();
    }
    // Every authored ramp is pickable.
    expect(ramps.length).toBe(SKIN_RAMPS.length);
  });

  it("builds reference authored body grids", () => {
    expect(BUILD_OPTIONS.map((o) => o.build).sort()).toEqual(
      [...BODY_BUILD_IDS].sort(),
    );
  });

  it("hair colors are the palette's hair channel colors", () => {
    const colors = HAIR_COLOR_OPTIONS.map((o) => o.color);
    expect(new Set(colors).size).toBe(colors.length);
    for (const color of colors) {
      expect(HAIR_COLORS).toContain(color);
    }
    expect(colors.length).toBe(HAIR_COLORS.length);
  });

  it("eye colors are palette entries", () => {
    for (const option of EYE_COLOR_OPTIONS) {
      expect(PALETTE[option.color], option.id).toBeDefined();
    }
  });

  it("optional categories have a 'none' entry that draws nothing", () => {
    for (const options of [
      HAIR_STYLE_OPTIONS,
      FACE_DETAIL_OPTIONS,
      HEADWEAR_OPTIONS,
    ]) {
      const none = options.find((o) => o.layer === null);
      expect(none).toBeDefined();
    }
  });

  it("getAppearanceOption finds by id and misses unknowns", () => {
    expect(getAppearanceOption("skinTone", "porcelain")?.ramp).toBe(0);
    expect(getAppearanceOption("hairStyle", "mullet")).toBeUndefined();
  });
});
