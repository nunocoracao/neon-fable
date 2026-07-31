/**
 * The ticker strip: a headline as a picture.
 *
 * The public screens on the Row run their news through the same pixel
 * readout font the arena's damage figures are drawn in (./popupFont.ts)
 * — the district's news is made of the same pixels the district is, and
 * there is no fillText anywhere in the scene.
 *
 * ## One bake per headline, not one per frame
 *
 * A line is baked **whole**, at its full pixel width, and the renderer
 * draws a moving window into that one canvas (see ../ticker.ts and the
 * ticker pass in ../render.ts). That is the entire reason the ticker is
 * free: scrolling changes which columns are copied, never what is
 * baked, so the cache key is the text and the tint and the sprite cache
 * settles exactly as it does for everything else on the map.
 *
 * ## The tints
 *
 * A screen's tint is a neon channel, not a colour: the glyph ink is
 * remapped into the palette's emissive range, which is the range the
 * hour's grade passes through untouched (see ./tint.ts). A screen
 * therefore burns the same at dusk as it does at 3am, which is what a
 * screen does.
 */
import { GLYPH_GAP, GLYPH_H, GLYPH_INK, GLYPH_W, shadowed, textGrid } from "./popupFont";
import { remapped, type PixelGrid } from "./pixel";

/** Ink a screen's headlines burn in. */
export type NewsTintId = "cyan" | "amber" | "hologram";

/**
 * Palette channel per tint, all emissive. Cyan is the Row's civic
 * signage, amber the market's boards, hologram the corporate screens.
 */
export const NEWS_TINT_INK: Readonly<Record<NewsTintId, string>> = {
  cyan: "h",
  amber: "n",
  hologram: "t",
};

export const NEWS_TINTS: readonly NewsTintId[] = ["cyan", "amber", "hologram"];

/** Height of a baked strip in 1x art pixels — the font, plus its shadow. */
export const NEWS_STRIP_H = GLYPH_H + 1;

/**
 * Pixel width of a headline once laid out: one cell per character, a
 * gap between them, and the shadow's extra column. Pure arithmetic
 * rather than a measure of the grid, so the ticker's scheduling can ask
 * without composing anything.
 */
export function newsTextWidth(text: string): number {
  if (text.length === 0) return 0;
  return text.length * GLYPH_W + (text.length - 1) * GLYPH_GAP + 1;
}

/** The whole headline as one grid, in the screen's ink, over its shadow. */
export function newsStripGrid(text: string, tint: NewsTintId): PixelGrid {
  const row = textGrid(text);
  if (row.length === 0) return [];
  const ink = NEWS_TINT_INK[tint];
  return shadowed(ink === GLYPH_INK ? row : remapped(row, { [GLYPH_INK]: ink }));
}
