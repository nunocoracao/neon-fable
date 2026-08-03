/**
 * The thumbnail sweep: every picker thumb the appearance step can show
 * is a real, distinct picture.
 *
 * The creation wizard and the stylist render one live-baked thumb per
 * catalog entry (see src/ui/appearancePicker), keyed by the same cache
 * keys the scene uses. Canvas baking stays untested per project
 * convention, so this sweeps the two things baking rests on: the grid
 * each thumb composes, and the key it is cached under. A thumb whose
 * key collided with its neighbour's would show the wrong face; a thumb
 * that composed nothing would show an empty box.
 *
 * The picker is driven entirely by APPEARANCE_TABS plus the catalogs,
 * so this walks that same config — a new category or entry is swept the
 * moment it is added, with no edit here.
 */
import { describe, expect, it } from "vitest";
import {
  APPEARANCE_TABS,
  swatchChips,
  SWATCH_CATEGORIES,
  type ThumbCategoryConfig,
} from "../../data/appearanceTabs";
import { COSMETIC_APPEARANCE_TABS } from "../../data/stylist";
import { appearanceCatalogs } from "../../data/appearance";
import { emptyEquipment } from "../../inventory/equipment";
import {
  composedCharacterGrid,
  composedFrameKey,
} from "../../iso/art/layers";
import { BODY_FRAME } from "../../iso/art/layers/body";
import { PORTRAIT_FRAME } from "../../iso/art/layers/portrait";
import { gridErrors, silhouetteArea } from "../../iso/art/pixel";
import {
  composeCharacter,
  defaultAppearance,
  type Appearance,
  type AppearanceField,
} from "../appearance";
import { composePortrait, portraitKey } from "../portrait";
import { faultReport } from "./report";

/** Every thumb-grid section of both pickers, wizard and stylist. */
function thumbSections(): ThumbCategoryConfig[] {
  const sections: ThumbCategoryConfig[] = [];
  for (const tabs of [APPEARANCE_TABS, COSMETIC_APPEARANCE_TABS]) {
    for (const tab of tabs) {
      for (const config of tab.categories) {
        if (config.kind === "thumbs") sections.push(config);
      }
    }
  }
  return sections;
}

/** The look a thumb renders: the working appearance with one field set. */
function lookFor(field: AppearanceField, id: string): Appearance {
  return { ...defaultAppearance(), [field]: id };
}

describe("picker thumbnails", () => {
  it("composes a real picture for every option in every thumb grid", () => {
    const faults: string[] = [];
    for (const section of thumbSections()) {
      const field = section.category as AppearanceField;
      for (const option of appearanceCatalogs[section.category]) {
        const look = lookFor(field, option.id);
        const label = `${section.thumb} thumb ${section.category}="${option.id}"`;
        if (section.thumb === "mini") {
          // The picker bakes the front-facing resting frame.
          const grid = composedCharacterGrid(
            composeCharacter(look, emptyEquipment()),
            "s",
            "idle",
            0,
          );
          for (const error of gridErrors(grid)) faults.push(`${label}: ${error}`);
          if (grid.length !== BODY_FRAME.height) {
            faults.push(`${label}: ${grid.length} rows`);
          }
          if (silhouetteArea(grid) === 0) faults.push(`${label}: empty thumb`);
        } else {
          const grid = composePortrait(look, emptyEquipment());
          for (const error of gridErrors(grid)) faults.push(`${label}: ${error}`);
          if (grid.length !== PORTRAIT_FRAME.height) {
            faults.push(`${label}: ${grid.length} rows`);
          }
          if (silhouetteArea(grid) === 0) faults.push(`${label}: empty thumb`);
        }
      }
    }
    expect(faultReport(faults)).toBe("");
  });

  it("gives every option in a grid its own cache key and its own picture", () => {
    const faults: string[] = [];
    for (const section of thumbSections()) {
      const field = section.category as AppearanceField;
      const keys = new Map<string, string>();
      const pictures = new Map<string, string>();
      for (const option of appearanceCatalogs[section.category]) {
        const look = lookFor(field, option.id);
        const key =
          section.thumb === "mini"
            ? composedFrameKey(
                composeCharacter(look, emptyEquipment()),
                "s",
                "idle",
                0,
              )
            : portraitKey(look, emptyEquipment());
        const picture =
          section.thumb === "mini"
            ? composedCharacterGrid(
                composeCharacter(look, emptyEquipment()),
                "s",
                "idle",
                0,
              ).join("\n")
            : composePortrait(look, emptyEquipment()).join("\n");
        const clash = keys.get(key);
        if (clash !== undefined) {
          faults.push(
            `${section.category}: "${option.id}" and "${clash}" share a bake key`,
          );
        }
        keys.set(key, option.id);
        const twin = pictures.get(picture);
        if (twin !== undefined) {
          faults.push(
            `${section.category}: "${option.id}" and "${twin}" draw the same ${section.thumb} thumb`,
          );
        }
        pictures.set(picture, option.id);
      }
    }
    expect(faultReport(faults)).toBe("");
  });
});

describe("picker swatches", () => {
  it("gives every color option a palette chip of its own", () => {
    const faults: string[] = [];
    for (const category of SWATCH_CATEGORIES) {
      const chips = swatchChips(category);
      if (chips.length !== appearanceCatalogs[category].length) {
        faults.push(`${category}: ${chips.length} chips for ${appearanceCatalogs[category].length} options`);
      }
      const colors = new Set(chips.map((chip) => chip.color));
      if (colors.size !== chips.length) {
        faults.push(`${category}: two options share a swatch color`);
      }
      for (const chip of chips) {
        if (!chip.color.startsWith("#")) {
          faults.push(`${category}: "${chip.id}" has no palette color`);
        }
      }
    }
    expect(faultReport(faults)).toBe("");
  });

  it("covers every appearance category between thumbs and swatches", () => {
    const shown = new Set<string>([
      ...thumbSections().map((section) => section.category as string),
      ...SWATCH_CATEGORIES.map((category) => category as string),
    ]);
    for (const category of Object.keys(appearanceCatalogs)) {
      expect(shown.has(category), `category "${category}" has no picker`).toBe(
        true,
      );
    }
  });
});
