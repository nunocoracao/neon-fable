import type { AppearanceCategory } from "./appearance";
import { APPEARANCE_TABS, type AppearanceTabConfig } from "./appearanceTabs";

/**
 * The Chrome Chapel — Cinder Row's stylist parlor, where a look chosen
 * at creation stops being a life sentence. This module holds the
 * restyle content rules: what a session costs and which appearance
 * categories the chair may touch. The chapel's dialogue lives in
 * src/data/story/chapel.ts and the screen itself in
 * src/ui/stylistOverlay.ts.
 */

/** Flat fee, in credits, for one restyle session (any number of edits). */
export const RESTYLE_PRICE = 40;

/**
 * What a confirmed session records, so the rest of the game can know the
 * chair happened. Cosmetics gate nothing and never will — these exist
 * for the epilogue, which reads a run's habits as well as its choices.
 *
 * Two flags rather than one: the boolean is the cheap gate ("has this
 * runner ever sat in the chair"), the counter is how a look that kept
 * changing reads differently from a look that changed once.
 */
export const RESTYLE_FLAG = "chapel-restyled";
export const RESTYLE_COUNT_FLAG = "chapel-restyles";

/** Sessions at which the chair stops being an errand and becomes a habit. */
export const RESTYLE_REGULAR_COUNT = 3;

/**
 * Categories the stylist never touches: build and skin tone are the
 * person, not the style. Everything else in the appearance catalogs is
 * cosmetic and freely re-editable at the chapel.
 */
export const IDENTITY_CATEGORIES = [
  "build",
  "skinTone",
] as const satisfies readonly AppearanceCategory[];

export function isCosmeticCategory(category: AppearanceCategory): boolean {
  return !(IDENTITY_CATEGORIES as readonly AppearanceCategory[]).includes(
    category,
  );
}

/**
 * The stylist screen's tab config: the creation wizard's tabs with the
 * identity categories filtered out (and tabs left empty by the filter
 * dropped). Derived, not copied — a new cosmetic category added to the
 * wizard's tabs appears at the chapel with zero changes here.
 */
export const COSMETIC_APPEARANCE_TABS: readonly AppearanceTabConfig[] =
  APPEARANCE_TABS.map((tab) => ({
    ...tab,
    categories: tab.categories.filter((config) =>
      isCosmeticCategory(config.category),
    ),
  })).filter((tab) => tab.categories.length > 0);

/** The stylist's polite no when the player can't cover the fee. */
export const RESTYLE_REFUSAL =
  "\"The chair runs on credits, love — come back when you're holding " +
  `${RESTYLE_PRICE}, and I'll make the mirror blush."`;
