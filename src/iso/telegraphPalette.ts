/**
 * How the combat grid's telegraph tiles are painted. Presentation only:
 * the engine decides which tiles are tinted and why (see
 * src/combat/telegraph.ts); this decides what that looks like.
 *
 * Two things are deliberate here. First, no tint carries its meaning by
 * hue alone — fill weight, outline weight, and dash pattern separate
 * every pair of tints, so the grid still reads with the colours pulled
 * out from under it. Second, the palette is a *table*, keyed by id: the
 * accessibility pass adds an entry and points a setting at it without
 * touching a line of painting code.
 */

/** The tile roles the combat scene knows how to paint. */
export const TELEGRAPH_TINT_IDS = [
  "origin",
  "reach",
  "range",
  "path",
  "impact",
  "denied",
] as const;

export type TelegraphTintId = (typeof TELEGRAPH_TINT_IDS)[number];

export interface TelegraphStyle {
  /** Diamond fill, or null for outline only. */
  fill: string | null;
  /** Diamond outline, or null for fill only. */
  stroke: string | null;
  /** Outline width in world pixels; ignored without a stroke. */
  lineWidth: number;
  /**
   * Outline dash pattern in world pixels; empty is solid. Shape is the
   * second channel every tint is told apart by, so an outline still
   * says which tint it is in greyscale.
   */
  dash: readonly number[];
}

/** Named palettes; the accessibility option picks between them. */
export const TELEGRAPH_PALETTE_IDS = ["neon", "high-contrast"] as const;

export type TelegraphPaletteId = (typeof TELEGRAPH_PALETTE_IDS)[number];

export const DEFAULT_TELEGRAPH_PALETTE: TelegraphPaletteId = "neon";

/**
 * The arena's own palette: the cyan/magenta/amber the rest of the game
 * is lit by. Reach is a whisper of fill, range a dashed outline over a
 * fainter one, impact a hot solid ring, and a refusal a heavy dotted
 * amber-red that reads as "no" without being read as damage.
 */
const NEON: Record<TelegraphTintId, TelegraphStyle> = {
  origin: {
    fill: null,
    stroke: "rgba(232, 230, 240, 0.55)",
    lineWidth: 2,
    dash: [6, 4],
  },
  reach: {
    fill: "rgba(46, 230, 214, 0.13)",
    stroke: "rgba(46, 230, 214, 0.28)",
    lineWidth: 1,
    dash: [],
  },
  range: {
    fill: "rgba(240, 180, 41, 0.10)",
    stroke: "rgba(240, 180, 41, 0.34)",
    lineWidth: 1,
    dash: [4, 5],
  },
  path: {
    fill: "rgba(46, 230, 214, 0.34)",
    stroke: "rgba(46, 230, 214, 0.6)",
    lineWidth: 2,
    dash: [],
  },
  impact: {
    fill: "rgba(230, 62, 143, 0.30)",
    stroke: "rgba(255, 106, 176, 0.95)",
    lineWidth: 3,
    dash: [],
  },
  denied: {
    fill: "rgba(255, 77, 94, 0.20)",
    stroke: "rgba(255, 77, 94, 0.9)",
    lineWidth: 3,
    dash: [2, 4],
  },
};

/**
 * The same six roles pulled further apart: blue/yellow rather than
 * cyan/magenta (the pair red-green deficiencies keep), heavier fills,
 * and wider dash gaps. Kept as a real second entry rather than a stub
 * so the table's shape is exercised before the setting that selects it
 * exists.
 */
const HIGH_CONTRAST: Record<TelegraphTintId, TelegraphStyle> = {
  origin: {
    fill: null,
    stroke: "rgba(255, 255, 255, 0.8)",
    lineWidth: 2,
    dash: [8, 5],
  },
  reach: {
    fill: "rgba(90, 160, 255, 0.22)",
    stroke: "rgba(150, 200, 255, 0.5)",
    lineWidth: 1,
    dash: [],
  },
  range: {
    fill: "rgba(255, 214, 92, 0.16)",
    stroke: "rgba(255, 214, 92, 0.6)",
    lineWidth: 2,
    dash: [5, 6],
  },
  path: {
    fill: "rgba(90, 160, 255, 0.5)",
    stroke: "rgba(220, 236, 255, 0.85)",
    lineWidth: 2,
    dash: [],
  },
  impact: {
    fill: "rgba(255, 214, 92, 0.42)",
    stroke: "rgba(255, 255, 255, 1)",
    lineWidth: 3,
    dash: [],
  },
  denied: {
    fill: "rgba(20, 20, 28, 0.55)",
    stroke: "rgba(255, 255, 255, 0.95)",
    lineWidth: 3,
    dash: [2, 6],
  },
};

export const TELEGRAPH_PALETTES: Record<
  TelegraphPaletteId,
  Record<TelegraphTintId, TelegraphStyle>
> = {
  neon: NEON,
  "high-contrast": HIGH_CONTRAST,
};

/** The style one tint is painted with; unknown palettes fall back. */
export function telegraphStyle(
  tint: TelegraphTintId,
  palette: TelegraphPaletteId = DEFAULT_TELEGRAPH_PALETTE,
): TelegraphStyle {
  const table =
    TELEGRAPH_PALETTES[palette] ??
    TELEGRAPH_PALETTES[DEFAULT_TELEGRAPH_PALETTE];
  return table[tint];
}

/**
 * Paint order: the roles that only give context go down first, so a
 * hot impact ring is never buried under the range tint it sits inside.
 * Batching walks this order, one fill and one stroke per tint.
 */
export const TELEGRAPH_PAINT_ORDER: readonly TelegraphTintId[] = [
  "range",
  "reach",
  "origin",
  "path",
  "impact",
  "denied",
];

/** The dotted line drawn along a previewed walk, per palette. */
export const TELEGRAPH_PATH_LINE: Record<
  TelegraphPaletteId,
  { color: string; lineWidth: number; dash: readonly number[] }
> = {
  neon: { color: "rgba(198, 255, 250, 0.95)", lineWidth: 2, dash: [3, 6] },
  "high-contrast": {
    color: "rgba(255, 255, 255, 0.95)",
    lineWidth: 3,
    dash: [3, 8],
  },
};
