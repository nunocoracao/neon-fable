import { describe, expect, it } from "vitest";
import {
  appearanceCatalogs,
  getAppearanceOption,
  BROWS_OPTIONS,
  EYE_COLOR_OPTIONS,
  EYES_OPTIONS,
  FACE_DETAIL_OPTIONS,
  HAIR_COLOR_OPTIONS,
  HAIR_STYLE_OPTIONS,
  HEADWEAR_OPTIONS,
  BUILD_OPTIONS,
  SKIN_TONE_OPTIONS,
  type AppearanceCategory,
} from "./appearance";
import { BODY_BUILD_IDS } from "../iso/art/layers/body";
import { FACE_LAYERS, FACE_PART_IDS } from "../iso/art/layers/face";
import { HAIR_COLORS, PALETTE, SKIN_RAMPS } from "../iso/art/palette";
import { gridErrors } from "../iso/art/pixel";

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

  it("every eyes/brows option carries both sprite and portrait art", () => {
    for (const option of [...EYES_OPTIONS, ...BROWS_OPTIONS]) {
      // Sprite ref: a registered face layer grid.
      expect(
        FACE_LAYERS[option.layer as keyof typeof FACE_LAYERS],
        `${option.id} sprite layer`,
      ).toBeDefined();
      // Portrait ref: a non-empty, valid portrait-resolution grid.
      expect(option.portrait.length, `${option.id} portrait`).toBeGreaterThan(0);
      expect(gridErrors(option.portrait), `${option.id} portrait`).toEqual([]);
    }
    // The catalogs cover every declared eye/brow shape, and vice versa.
    expect(EYES_OPTIONS.map((o) => o.layer).sort()).toEqual(
      [...FACE_PART_IDS.eyes].sort(),
    );
    expect(BROWS_OPTIONS.map((o) => o.layer).sort()).toEqual(
      [...FACE_PART_IDS.brows].sort(),
    );
  });

  it("getAppearanceOption finds by id and misses unknowns", () => {
    expect(getAppearanceOption("skinTone", "porcelain")?.ramp).toBe(0);
    expect(getAppearanceOption("hairStyle", "mullet")).toBeUndefined();
  });
});
