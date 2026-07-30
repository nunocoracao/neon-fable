/**
 * The combat readout font: the glyphs floating damage numbers and
 * status popups are built from. Authored as palette-indexed grids like
 * every other picture in this directory and baked through the sprite
 * provider — the arena never calls fillText, so a number over a body is
 * made of the same pixels the body is.
 *
 * ## The font
 *
 * A 3×5 cell per glyph, one transparent column between them, drawn in
 * white ink (`9`) and remapped to the kind's own channel before baking
 * (see ../popup.ts). Digits, the two signs, and the full alphabet: the
 * labels are content, so the font cannot be authored to just the words
 * that happen to exist today.
 *
 * ## The shadow
 *
 * Every popup carries a one-pixel drop shadow in void black, derived
 * from the glyphs rather than authored beside them. A number lands over
 * whatever the arena happens to be drawing there — pavement, a neon
 * pool, a body — and without the shadow the light kinds vanish against
 * the light ground.
 *
 * ## Size
 *
 * The critical kind is the authored font enlarged a whole number of
 * times, never a second set of drawings: the same glyph, bigger pixels.
 *
 * Composition is pure (grids in, grid out), so a number's picture is a
 * function of its text and kind alone; the provider caches the bake.
 */
import {
  POPUP_STYLES,
  type PopupBadgeId,
  type PopupKind,
} from "../popup";
import { remapped, upscaled, type PixelGrid } from "./pixel";

/** Cell size of one authored glyph, in 1x art pixels. */
export const GLYPH_W = 3;
export const GLYPH_H = 5;

/** Transparent columns laid between two glyphs. */
export const GLYPH_GAP = 1;

/** The channel every glyph is authored in; kinds remap it. */
export const GLYPH_INK = "9";

/** The channel the derived drop shadow is painted in. */
export const GLYPH_SHADOW = "0";

const BLANK: PixelGrid = ["...", "...", "...", "...", "..."];

/* --- Digits. Zero is squared off and O is rounded, so a readout never
 * has to be guessed at. --- */

const DIGITS: Readonly<Record<string, PixelGrid>> = {
  "0": ["999", "9.9", "9.9", "9.9", "999"],
  "1": [".9.", "99.", ".9.", ".9.", "999"],
  "2": ["999", "..9", "999", "9..", "999"],
  "3": ["999", "..9", "999", "..9", "999"],
  "4": ["9.9", "9.9", "999", "..9", "..9"],
  "5": ["999", "9..", "999", "..9", "999"],
  "6": ["999", "9..", "999", "9.9", "999"],
  "7": ["999", "..9", "..9", "..9", "..9"],
  "8": ["999", "9.9", "999", "9.9", "999"],
  "9": ["999", "9.9", "999", "..9", "999"],
};

/* --- Letters. --- */

const LETTERS: Readonly<Record<string, PixelGrid>> = {
  A: [".9.", "9.9", "999", "9.9", "9.9"],
  B: ["99.", "9.9", "99.", "9.9", "99."],
  C: [".99", "9..", "9..", "9..", ".99"],
  D: ["99.", "9.9", "9.9", "9.9", "99."],
  E: ["999", "9..", "99.", "9..", "999"],
  F: ["999", "9..", "99.", "9..", "9.."],
  G: [".99", "9..", "9.9", "9.9", ".99"],
  H: ["9.9", "9.9", "999", "9.9", "9.9"],
  I: ["999", ".9.", ".9.", ".9.", "999"],
  J: ["..9", "..9", "..9", "9.9", ".9."],
  K: ["9.9", "9.9", "99.", "9.9", "9.9"],
  L: ["9..", "9..", "9..", "9..", "999"],
  M: ["9.9", "999", "999", "9.9", "9.9"],
  N: ["99.", "9.9", "9.9", "9.9", "9.9"],
  O: [".9.", "9.9", "9.9", "9.9", ".9."],
  P: ["99.", "9.9", "99.", "9..", "9.."],
  Q: ["999", "9.9", "9.9", "999", "..9"],
  R: ["99.", "9.9", "99.", "9.9", "9.9"],
  S: [".99", "9..", ".9.", "..9", "99."],
  T: ["999", ".9.", ".9.", ".9.", ".9."],
  U: ["9.9", "9.9", "9.9", "9.9", "999"],
  V: ["9.9", "9.9", "9.9", "9.9", ".9."],
  W: ["9.9", "9.9", "999", "999", "9.9"],
  X: ["9.9", "9.9", ".9.", "9.9", "9.9"],
  Y: ["9.9", "9.9", ".9.", ".9.", ".9."],
  Z: ["999", "..9", ".9.", "9..", "999"],
};

/* --- Signs. A figure carries which way it moved the bar. --- */

const SIGNS: Readonly<Record<string, PixelGrid>> = {
  "-": ["...", "...", "999", "...", "..."],
  "+": ["...", ".9.", "999", ".9.", "..."],
};

/** Every authored glyph, by the character it draws. */
export const GLYPH_ART: Readonly<Record<string, PixelGrid>> = {
  " ": BLANK,
  ...DIGITS,
  ...LETTERS,
  ...SIGNS,
};

/** Every character the font draws, in a stable order (tests and dev). */
export const GLYPH_CHARS: readonly string[] = Object.keys(GLYPH_ART);

/**
 * Marks drawn ahead of the text. The shield is what makes a reduced hit
 * read as armor holding rather than as a feeble blow.
 */
export const BADGE_ART: Readonly<Record<PopupBadgeId, PixelGrid>> = {
  shield: ["999", "9.9", "9.9", ".9.", "..."],
};

/** The glyph for a character, or a blank cell for anything unauthored. */
export function glyphGrid(char: string): PixelGrid {
  return GLYPH_ART[char.toUpperCase()] ?? BLANK;
}

/** Whether the font has a glyph of its own for this character. */
export function hasGlyph(char: string): boolean {
  return GLYPH_ART[char.toUpperCase()] !== undefined;
}

/**
 * Lay glyphs out in a row, GLYPH_GAP transparent columns apart. Empty
 * text draws nothing at all rather than an empty box.
 */
export function composeGlyphs(grids: readonly PixelGrid[]): PixelGrid {
  if (grids.length === 0) return [];
  const gap = ".".repeat(GLYPH_GAP);
  return Array.from({ length: GLYPH_H }, (_, y) =>
    grids.map((grid) => grid[y] ?? ".".repeat(GLYPH_W)).join(gap),
  );
}

/** The row of glyphs a string draws, in the authored ink. */
export function textGrid(text: string): PixelGrid {
  return composeGlyphs([...text].map(glyphGrid));
}

/**
 * Add a one-pixel drop shadow down and to the right, growing the grid
 * by a pixel each way so nothing is pushed off the edge. Shadow pixels
 * never overwrite ink — the glyph stays exactly as authored.
 */
export function shadowed(grid: PixelGrid, ink: string = GLYPH_SHADOW): PixelGrid {
  if (grid.length === 0) return [];
  const width = (grid[0]?.length ?? 0) + 1;
  const cells = Array.from({ length: grid.length + 1 }, () =>
    Array<string>(width).fill("."),
  );
  // The shadow goes down first, one pixel off…
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const under = cells[y + 1];
      if (ch !== "." && under) under[x + 1] = ink;
    });
  });
  // …and the glyphs over it, so ink always wins a shared pixel.
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const over = cells[y];
      if (ch !== "." && over) over[x] = ch;
    });
  });
  return cells.map((row) => row.join(""));
}

/**
 * The whole picture one popup draws: its badge (when the kind carries
 * one) and its text, in the kind's ink, at the kind's size, over the
 * shadow. Pure — the provider caches the bake of exactly this.
 */
export function popupTextGrid(text: string, kind: PopupKind): PixelGrid {
  const style = POPUP_STYLES[kind];
  const badge = style.badge ? [BADGE_ART[style.badge]] : [];
  const row = composeGlyphs([...badge, ...[...text].map(glyphGrid)]);
  if (row.length === 0) return [];
  const inked = style.ink === GLYPH_INK ? row : remapped(row, { [GLYPH_INK]: style.ink });
  // The shadow is laid before the enlargement, so it grows with the
  // glyphs instead of hairlining a doubled number.
  return upscaled(shadowed(inked), style.scale);
}
