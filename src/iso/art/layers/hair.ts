/**
 * Hair style layers. Set 1: short crop, slicked back, chin-length bob,
 * and short spikes. Set 2: mohawk, shoulder locs, long tied-back tail,
 * and a shaved head with a dyed glyph. Each style is authored front
 * and back on the shared 32×48 layer frame (see the contract in
 * ./body). South/west facings mirror whole composed frames exactly
 * like bodies, so only the two authored views exist per style.
 *
 * Every opaque pixel is the canonical hair channel character ("K",
 * REMAP_CHANNELS.hair) — the six palette v2 hair colors arrive purely
 * by channel remap, so each style must read from silhouette alone.
 *
 * ## Animation / head-bob contract
 *
 * Hair is composed onto the neutral pose and then animated by the
 * shared bodyAnimFrames transforms, so it rides the walk/idle head bob
 * with no per-frame authoring. Those transforms only move rows 3..14
 * uniformly with the skull (the idle head-lift copies rows 3–15 up,
 * the walk sink shifts rows 3–41 down, the raise shifts rows 3–42 up);
 * pixels outside HAIR_REGION would tear off or duplicate on bob
 * frames. Keep every hair pixel inside HAIR_REGION — hair.test.ts
 * enforces it, plus pixel conservation across every animation frame.
 */
import { rowsShifted, type PixelGrid } from "../pixel";
import { BODY_FRAME, type BodyViewId } from "./body";

export const HAIR_STYLE_IDS = [
  "buzz",
  "slicked",
  "bob",
  "spikes",
  "mohawk",
  "locs",
  "ponytail",
  "glyph",
] as const;
export type HairStyleId = (typeof HAIR_STYLE_IDS)[number];

/**
 * Rows/cols (inclusive) hair pixels may occupy: the skull box plus one
 * column of flare each side for styles that fall past the head. The
 * row bound is exactly the head box — see the bob contract above.
 */
export const HAIR_REGION = {
  top: BODY_FRAME.head.top,
  bottom: BODY_FRAME.head.bottom,
  left: BODY_FRAME.head.left - 1,
  right: BODY_FRAME.head.right + 1,
} as const;

/**
 * Where hair may be on a *walk* frame: HAIR_REGION plus the one column
 * the trail lags behind the head into (see HAIR_TRAIL below). The
 * resting styles that fall past the head already reach the flare
 * column, so a trailing row lands one further out — inside the frame,
 * clear of everything, but outside the resting box. Declared rather
 * than widening HAIR_REGION, so the authored art keeps the tighter
 * contract and only the shift is allowed the extra column.
 */
export const HAIR_WALK_REGION = {
  top: HAIR_REGION.top,
  bottom: HAIR_REGION.bottom,
  left: HAIR_REGION.left - 1,
  right: HAIR_REGION.right,
} as const;

const WIDTH = BODY_FRAME.width;
const gap = (n: number): string => ".".repeat(n);
const row = (left: number, body: string): string =>
  gap(left) + body + gap(WIDTH - left - body.length);
const BLANK = gap(WIDTH);

const K = (n: number): string => "K".repeat(n);

/** A frame-sized grid from sparse [rowIndex, leftCol, pixels] strokes. */
function hairGrid(
  strokes: ReadonlyArray<readonly [number, number, string]>,
): string[] {
  const grid = Array.from({ length: BODY_FRAME.height }, () => BLANK);
  for (const [y, left, pixels] of strokes) grid[y] = row(left, pixels);
  return grid;
}

const span = (
  from: number,
  to: number,
  left: number,
  pixels: string,
): Array<readonly [number, number, string]> =>
  Array.from({ length: to - from + 1 }, (_, i) => [from + i, left, pixels]);

/* --- Short crop ("buzz"): a tight cap hugging the scalp, hairline
 * above the brows, short temple points and sideburn tips. The back
 * covers the whole skull down to a tapered nape. --- */

const buzzFront = hairGrid([
  [3, 12, K(8)],
  [4, 11, K(10)],
  [5, 10, K(12)],
  [6, 10, "KKK......KKK"],
  [7, 10, "KK........KK"],
  [8, 10, "K..........K"],
]);

const buzzBack = hairGrid([
  [3, 12, K(8)],
  [4, 11, K(10)],
  ...span(5, 11, 10, K(12)),
  [12, 11, K(10)],
  [13, 12, K(8)],
]);

/* --- Slicked back: swept off a high forehead, a widow's peak at the
 * crown line, slim temples; the mass sits behind, ending in a short
 * ducktail over the nape. --- */

const slickedFront = hairGrid([
  [3, 12, K(8)],
  [4, 11, K(10)],
  [5, 10, "KKK..KK..KKK"],
  [6, 10, "KK........KK"],
  [7, 10, "K..........K"],
]);

const slickedBack = hairGrid([
  [3, 12, K(8)],
  [4, 11, K(10)],
  ...span(5, 11, 10, K(12)),
  [12, 11, K(10)],
  [13, 11, K(10)],
  [14, 13, K(6)],
]);

/* --- Chin-length bob: a straight full fringe over the brows and
 * curtains flaring one column past the skull, falling to tip out at
 * the chin row. The back is a solid curtain to the same length. --- */

const bobFront = hairGrid([
  [3, 12, K(8)],
  [4, 11, K(10)],
  [5, 10, K(12)],
  [6, 9, K(14)],
  ...span(7, 13, 9, "KK..........KK"),
  [14, 10, "K..........K"],
]);

const bobBack = hairGrid([
  [3, 12, K(8)],
  [4, 11, K(10)],
  [5, 10, K(12)],
  ...span(6, 13, 9, K(14)),
  [14, 10, K(12)],
]);

/* --- Short spikes: jagged tips breaking the skull outline on the top
 * rows over a cropped base; the back keeps the ragged crown with crop
 * coverage below. --- */

const spikesFront = hairGrid([
  [3, 12, "K..K..K.K"],
  [4, 11, "KK.KKK.KKK"],
  [5, 10, K(12)],
  [6, 10, "KKK......KKK"],
  [7, 10, "K..........K"],
]);

const spikesBack = hairGrid([
  [3, 13, "K..K..K"],
  [4, 12, "KK.KKK.KK"],
  ...span(5, 11, 10, K(12)),
  [12, 11, K(10)],
  [13, 12, K(8)],
]);

/* --- Mohawk: shaved sides with a jagged crest fan on the top row over
 * a solid ridge, narrowing to a point above the brow. The back shows
 * the fan edge-on and the ridge running straight down to a nape tip.
 * The crest tops out on row 3, so the raise/bob frames lift it to row
 * 2 at most — it can never leave the 48-row frame. --- */

const mohawkFront = hairGrid([
  [3, 11, "KK.KKK.KK"],
  [4, 11, K(9)],
  [5, 13, K(5)],
  [6, 14, K(2)],
]);

const mohawkBack = hairGrid([
  [3, 12, "KK.KK.KK"],
  [4, 12, K(8)],
  ...span(5, 9, 14, K(4)),
  ...span(10, 13, 15, K(2)),
  [14, 16, K(1)],
]);

/* --- Shoulder locs: a full crown breaking into segmented strands that
 * fall past the head to staggered tips at the chin row. Alternating
 * KK / K.K rows give the strands their beaded texture; the hanging
 * rows trail on walk frames (HAIR_TRAIL). --- */

const locsFront = hairGrid([
  [3, 12, K(8)],
  [4, 11, K(10)],
  [5, 10, K(12)],
  [6, 9, K(14)],
  [7, 9, "KK..........KK"],
  [8, 9, "K.K........K.K"],
  ...span(9, 10, 9, "KK..........KK"),
  [11, 9, "K.K........K.K"],
  ...span(12, 13, 9, "KK..........KK"),
  [14, 9, ".K..........K."],
]);

const locsBack = hairGrid([
  [3, 12, K(8)],
  [4, 11, K(10)],
  [5, 10, K(12)],
  ...span(6, 7, 9, K(14)),
  ...span(8, 13, 9, "KK.KK.KK.KK.KK"),
  [14, 9, ".K..K..K..K..K"],
]);

/* --- Long tied-back tail ("ponytail" in the catalog): swept flat over
 * the crown with temple points; the tail hangs behind the head — a
 * two-column wisp past the trailing edge on the front view, the full
 * gathered tail below a tie band on the back — and its hanging rows
 * trail on walk frames (HAIR_TRAIL). --- */

const ponytailFront = hairGrid([
  [3, 12, K(8)],
  [4, 11, K(10)],
  [5, 10, "KKKK....KKKK"],
  [6, 10, "KK........KK"],
  ...span(7, 13, 9, K(2)),
  [14, 10, K(1)],
]);

const ponytailBack = hairGrid([
  [3, 12, K(8)],
  [4, 11, K(10)],
  ...span(5, 6, 10, K(12)),
  [7, 11, K(10)],
  [8, 12, K(8)],
  [9, 14, K(4)],
  ...span(10, 12, 14, K(4)),
  ...span(13, 14, 15, K(2)),
]);

/* --- Shaved glyph: bare scalp (the body's own skin shows through the
 * transparent pixels) with a dyed pattern drawn in the hair channel —
 * a noded crown trace curling down the visible temple on the front, a
 * concentric diamond sigil across the back of the skull. Kept clear of
 * the face-part rows (brows 7, eyes 8 at cols 14–18; mouth 12). --- */

const glyphFront = hairGrid([
  [4, 12, K(7)],
  [5, 12, "K.K.K.K"],
  [6, 12, "K......KK"],
  [7, 20, K(1)],
  [8, 20, K(1)],
  [9, 19, K(1)],
]);

const glyphBack = hairGrid([
  [4, 14, K(4)],
  [5, 13, "K....K"],
  [6, 12, "K..KK..K"],
  [7, 12, "K.K..K.K"],
  [8, 12, "K..KK..K"],
  [9, 13, "K....K"],
  [10, 14, K(4)],
]);

/* --- Crushed under-cap variants: what hair looks like flattened by
 * headwear whose catalog rule is "crushes" (knit cap, rebreather
 * straps). One shared variant per style group rather than one per
 * style: "crushed-short" for the cropped styles (buzz, slicked,
 * spikes, mohawk) — a fringe and sideburns below the brim line — and
 * "crushed-long" for the falling styles (bob, locs, ponytail) —
 * pressed curtains to the chin. Both start on row 7 so the crown stays
 * clear for the headwear itself; the glyph maps to its own layer
 * (scalp dye has no volume to crush) and shaved to nothing. The
 * mapping lives on each catalog entry's `crushed` field. --- */

const crushedShortFront = hairGrid([
  [7, 10, "KK........KK"],
  [8, 10, "K..........K"],
  [9, 10, "K..........K"],
  [10, 10, "K..........K"],
]);

const crushedShortBack = hairGrid([
  ...span(7, 11, 10, K(12)),
  [12, 11, K(10)],
  [13, 12, K(8)],
]);

const crushedLongFront = hairGrid([
  ...span(7, 13, 9, "KK..........KK"),
  [14, 10, "K..........K"],
]);

const crushedLongBack = hairGrid([
  ...span(7, 13, 9, K(14)),
  [14, 10, K(12)],
]);

export const CRUSHED_HAIR_IDS = ["crushed-short", "crushed-long"] as const;
export type CrushedHairId = (typeof CRUSHED_HAIR_IDS)[number];

/** The shared flattened variants, registered beside the styles. */
export const CRUSHED_HAIR_LAYERS: Readonly<
  Record<CrushedHairId, Readonly<Record<BodyViewId, PixelGrid>>>
> = {
  "crushed-short": { front: crushedShortFront, back: crushedShortBack },
  "crushed-long": { front: crushedLongFront, back: crushedLongBack },
};

/** The authored hair grids per style and view, all exactly 32×48. */
export const HAIR_LAYERS: Readonly<
  Record<HairStyleId, Readonly<Record<BodyViewId, PixelGrid>>>
> = {
  buzz: { front: buzzFront, back: buzzBack },
  slicked: { front: slickedFront, back: slickedBack },
  bob: { front: bobFront, back: bobBack },
  spikes: { front: spikesFront, back: spikesBack },
  mohawk: { front: mohawkFront, back: mohawkBack },
  locs: { front: locsFront, back: locsBack },
  ponytail: { front: ponytailFront, back: ponytailBack },
  glyph: { front: glyphFront, back: glyphBack },
};

/**
 * Secondary motion for long styles: on walk frames the hanging rows
 * (inclusive) shift one pixel toward the character's trailing side —
 * -x in the authored right-facing views; mirrored facings flip it with
 * the frame. Rows above the range stay anchored to the skull, so the
 * hair kinks at the range top instead of sliding wholesale. Purely a
 * shared row shift (rowsShifted) — no redrawn frames.
 */
export const HAIR_TRAIL: Readonly<
  Partial<Record<HairStyleId, { top: number; bottom: number }>>
> = {
  locs: { top: 9, bottom: 14 },
  ponytail: { top: 10, bottom: 14 },
};

/**
 * The grid a hair layer composes on walk frames: styles with trailing
 * rows shift them one pixel back, everything else is untouched. Applied
 * before channel remap and composition, so the trail rides the same
 * bob transforms as the rest of the hair.
 *
 * The result honors HAIR_WALK_REGION, not HAIR_REGION: a style already
 * out at the flare column trails one column further.
 */
export function hairWalkGrid(art: string, grid: PixelGrid): PixelGrid {
  const trail = HAIR_TRAIL[art as HairStyleId];
  return trail ? rowsShifted(grid, trail.top, trail.bottom, -1) : grid;
}
