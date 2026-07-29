import { type AppearanceCategory } from "./appearance";

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
 * sprite (build and skin read best on the whole silhouette), "portrait"
 * bakes the head-and-shoulders portrait crop (hair and face options
 * live above the shoulders).
 */
export type ThumbKind = "mini" | "portrait";

export interface PickerCategoryConfig {
  /** The appearance catalog this section renders, one thumb per entry. */
  category: AppearanceCategory;
  label: string;
  thumb: ThumbKind;
  /** Thumbnail grid columns; arrow-key navigation steps rows by this. */
  columns: number;
}

export interface AppearanceTabConfig {
  id: string;
  label: string;
  categories: readonly PickerCategoryConfig[];
}

export const APPEARANCE_TABS = [
  {
    id: "body",
    label: "Body",
    categories: [
      { category: "build", label: "Build", thumb: "mini", columns: 4 },
      { category: "skinTone", label: "Skin", thumb: "mini", columns: 4 },
    ],
  },
  {
    id: "hair",
    label: "Hair",
    categories: [
      { category: "hairStyle", label: "Style", thumb: "portrait", columns: 5 },
    ],
  },
  {
    id: "face",
    label: "Face",
    categories: [
      { category: "eyes", label: "Eyes", thumb: "portrait", columns: 5 },
      { category: "brows", label: "Brows", thumb: "portrait", columns: 5 },
      { category: "mouth", label: "Mouth", thumb: "portrait", columns: 5 },
      { category: "faceDetail", label: "Detail", thumb: "portrait", columns: 5 },
    ],
  },
  {
    id: "extras",
    label: "Extras",
    categories: [
      { category: "headwear", label: "Headwear", thumb: "portrait", columns: 5 },
    ],
  },
] as const satisfies readonly AppearanceTabConfig[];

export type AppearanceTabId = (typeof APPEARANCE_TABS)[number]["id"];

/**
 * The color categories the picker leaves to swatch rows (a follow-up
 * task) — palette chips, not baked thumbnails. Together with the tab
 * config these must cover every appearance category exactly once; the
 * tab-config test enforces the partition.
 */
export const SWATCH_CATEGORIES = [
  "hairColor",
  "eyeColor",
] as const satisfies readonly AppearanceCategory[];

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
