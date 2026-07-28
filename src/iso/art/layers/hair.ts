/**
 * Hair style layers, set 1: short crop, slicked back, chin-length bob,
 * and short spikes, each authored front and back on the shared 32×48
 * layer frame (see the contract in ./body). South/west facings mirror
 * whole composed frames exactly like bodies, so only the two authored
 * views exist per style.
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
import type { PixelGrid } from "../pixel";
import { BODY_FRAME, type BodyViewId } from "./body";

export const HAIR_STYLE_IDS = ["buzz", "slicked", "bob", "spikes"] as const;
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

/** The authored hair grids per style and view, all exactly 32×48. */
export const HAIR_LAYERS: Readonly<
  Record<HairStyleId, Readonly<Record<BodyViewId, PixelGrid>>>
> = {
  buzz: { front: buzzFront, back: buzzBack },
  slicked: { front: slickedFront, back: slickedBack },
  bob: { front: bobFront, back: bobBack },
  spikes: { front: spikesFront, back: spikesBack },
};
