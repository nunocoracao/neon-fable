import { PALETTE, SKIN_RAMPS } from "../iso/art/palette";
import {
  appearanceCatalogs,
  type AppearanceCategory,
  type AppearanceOption,
  type ColorOption,
  type SkinToneOption,
} from "./appearance";

/**
 * Tab layout of the creation wizard's visual appearance picker: which
 * catalog each tab shows and how its options render. The picker UI is
 * driven entirely by this config plus the catalogs themselves — a new
 * catalog entry (or a new category slotted in here) appears in the UI
 * with zero UI-code changes. A test walks this config against the
 * catalogs to keep that true.
 */

/**
 * How a category's thumbnails render: "mini" bakes the full-body idle
 * sprite (build reads best on the whole silhouette), "portrait" bakes
 * the head-and-shoulders portrait crop (hair and face options live
 * above the shoulders).
 */
export type ThumbKind = "mini" | "portrait";

/** A category rendered as a thumbnail grid of baked looks. */
export interface ThumbCategoryConfig {
  kind: "thumbs";
  /** The appearance catalog this section renders, one thumb per entry. */
  category: AppearanceCategory;
  label: string;
  thumb: ThumbKind;
  /** Thumbnail grid columns; arrow-key navigation steps rows by this. */
  columns: number;
}

/**
 * A color category rendered as a swatch row: one flat palette chip per
 * catalog entry (see swatchChips), no baked thumbnails.
 */
export interface SwatchCategoryConfig {
  kind: "swatch";
  category: AppearanceCategory;
  label: string;
}

export type PickerCategoryConfig = ThumbCategoryConfig | SwatchCategoryConfig;

export interface AppearanceTabConfig {
  id: string;
  label: string;
  /** Ordered sections; each renders as a thumb grid or a swatch row. */
  categories: readonly PickerCategoryConfig[];
}

export const APPEARANCE_TABS = [
  {
    id: "body",
    label: "Body",
    categories: [
      {
        kind: "thumbs",
        category: "build",
        label: "Build",
        thumb: "mini",
        columns: 4,
      },
      { kind: "swatch", category: "skinTone", label: "Skin" },
    ],
  },
  {
    id: "hair",
    label: "Hair",
    categories: [
      {
        kind: "thumbs",
        category: "hairStyle",
        label: "Style",
        thumb: "portrait",
        columns: 5,
      },
      { kind: "swatch", category: "hairColor", label: "Color" },
    ],
  },
  {
    id: "face",
    label: "Face",
    categories: [
      {
        kind: "thumbs",
        category: "eyes",
        label: "Eyes",
        thumb: "portrait",
        columns: 5,
      },
      { kind: "swatch", category: "eyeColor", label: "Eye Color" },
      {
        kind: "thumbs",
        category: "brows",
        label: "Brows",
        thumb: "portrait",
        columns: 5,
      },
      {
        kind: "thumbs",
        category: "mouth",
        label: "Mouth",
        thumb: "portrait",
        columns: 5,
      },
      {
        kind: "thumbs",
        category: "faceDetail",
        label: "Detail",
        thumb: "portrait",
        columns: 5,
      },
    ],
  },
  {
    id: "extras",
    label: "Extras",
    categories: [
      {
        kind: "thumbs",
        category: "headwear",
        label: "Headwear",
        thumb: "portrait",
        columns: 5,
      },
    ],
  },
] as const satisfies readonly AppearanceTabConfig[];

export type AppearanceTabId = (typeof APPEARANCE_TABS)[number]["id"];

/**
 * The color categories the tab config renders as swatch rows, derived
 * from the config itself. Together with the thumb-grid categories these
 * must cover every appearance category exactly once; the tab-config
 * test enforces the partition.
 */
export const SWATCH_CATEGORIES: readonly AppearanceCategory[] =
  APPEARANCE_TABS.flatMap((tab) =>
    tab.categories.flatMap((config) =>
      config.kind === "swatch" ? [config.category] : [],
    ),
  );

/** One clickable chip of a swatch row. */
export interface SwatchChip {
  /** The catalog option id the chip applies. */
  id: string;
  label: string;
  /** CSS color straight from the palette (a ramp's mid-tone). */
  color: string;
}

/**
 * The palette character a catalog option's chip shows: a skin tone's
 * ramp base (the mid step of shade -> base -> highlight), or a color
 * option's palette character directly.
 */
function chipPaletteChar(option: AppearanceOption): string | undefined {
  if ("ramp" in option) return SKIN_RAMPS[(option as SkinToneOption).ramp]?.base;
  if ("color" in option) return (option as ColorOption).color;
  return undefined;
}

/**
 * The swatch chips for a color category, one per catalog entry, colored
 * from the palette constants — adding a ramp/color entry to the catalog
 * adds a chip with zero UI changes. Throws for categories whose options
 * carry no color data (a config mistake, caught by tests).
 */
export function swatchChips(
  category: AppearanceCategory,
): readonly SwatchChip[] {
  const options: readonly AppearanceOption[] = appearanceCatalogs[category];
  return options.map((option) => {
    const char = chipPaletteChar(option);
    const color = char === undefined ? undefined : PALETTE[char];
    if (!color) {
      throw new Error(
        `appearance category "${category}" option "${option.id}" has no palette color for a swatch chip`,
      );
    }
    return { id: option.id, label: option.label, color };
  });
}

/**
 * Arrow-key movement within a thumbnail grid laid out row-major over
 * `columns`: left/right step one option, up/down step one row. Returns
 * the target index, or null when the key is not an arrow or the move
 * would leave the grid (no wrapping).
 */
export function moveInGrid(
  index: number,
  count: number,
  columns: number,
  key: string,
): number | null {
  let next: number;
  switch (key) {
    case "ArrowRight":
      next = index + 1;
      break;
    case "ArrowLeft":
      next = index - 1;
      break;
    case "ArrowDown":
      next = index + columns;
      break;
    case "ArrowUp":
      next = index - columns;
      break;
    default:
      return null;
  }
  return next >= 0 && next < count && next !== index ? next : null;
}
