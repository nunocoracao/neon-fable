/**
 * Headwear layers: the slot above hair. Half-visor ("visor"), tech
 * hood ("hood"), knit cap ("cap"), and full-face rebreather
 * ("rebreather"), each authored front and back on the shared 32×48
 * layer frame (see the contract in ./body). South/west facings mirror
 * whole composed frames exactly like bodies, so only the two authored
 * views exist per option.
 *
 * Headwear rides the same head-bob transforms as hair (composed on the
 * neutral pose, then animated by bodyAnimFrames), so every pixel must
 * stay inside HEADWEAR_REGION — the head box plus one column of flare
 * each side, the same bound as HAIR_REGION. headwear.test.ts enforces
 * it, plus pixel conservation across every animation frame.
 *
 * How each option treats hair and eyes is catalog data, not art
 * (HEADWEAR_OPTIONS in src/data/appearance.ts): hairRule
 * shows/crushes/hides picks the hair layer variant, and coversEyes
 * drops the eyes layer — the visor and rebreather glass spans rows
 * 8–9, where every eye shape draws.
 *
 * Channels: the hood is dark fabric (V/W/X), the knit cap hazard amber
 * (Y/Z/n), and the visor/rebreather brushed chrome (6/T/9) with glass
 * (f/U/h) lenses; the rebreather's vent slits are ink ("1"). Headwear
 * declares no remap channel — options render in their authored
 * materials.
 *
 * ## Portrait art
 *
 * Each option also carries a portrait-resolution overlay
 * (HEADWEAR_PORTRAITS), authored 16 wide on the portrait face box like
 * the face-detail portraits and stamped above hair by the portrait
 * renderer. Lens glass is dithered — transparent gaps let the composed
 * eyes underneath read through, which is how a sprite-covered
 * character keeps its eye color in portraits only.
 */
import type { PixelGrid } from "../pixel";
import { BODY_FRAME, type BodyViewId } from "./body";

export const HEADWEAR_IDS = ["cap", "hood", "visor", "rebreather"] as const;
export type HeadwearId = (typeof HEADWEAR_IDS)[number];

/**
 * Rows/cols (inclusive) headwear pixels may occupy: the skull box plus
 * one column of flare each side — identical to HAIR_REGION, and for
 * the same reason: only these rows move uniformly with the head on
 * bob frames.
 */
export const HEADWEAR_REGION = {
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

/** A frame-sized grid from sparse [rowIndex, leftCol, pixels] strokes. */
function headwearGrid(
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

/* --- Knit cap ("cap"): a hazard-amber beanie hugging the crown, knit
 * texture from alternating base/highlight stitches, a shaded ribbed
 * brim on row 6. The crushed hair fringe shows below the brim. The
 * back offsets the stitch phase and adds a folded seam at the nape. --- */

const capFront = headwearGrid([
  [3, 12, "nnZZZZZZ"],
  [4, 11, "nZnZnZnZnZ"],
  [5, 10, "ZnZnZnZnZnZn"],
  [6, 10, "YYYYYYYYYYYY"],
]);

const capBack = headwearGrid([
  [3, 12, "nnZZZZZZ"],
  [4, 11, "ZnZnZnZnZn"],
  [5, 10, "nZnZnZnZnZnZ"],
  [6, 10, "YYYYYYYYYYYY"],
  [7, 14, "YZZY"],
]);

/* --- Tech hood ("hood"): a dark-fabric shell over the whole skull.
 * The front frames an open face — two-column rails that never touch
 * the eye/mouth interior (the cyber-band eyes reach cols 12–19) — and
 * closes in a cowl under the chin. The back is a solid shell shading
 * from lit X at the crown to V at the drape. --- */

const hoodFront = headwearGrid([
  [3, 12, "XXXXXXXX"],
  [4, 11, "XXWWWWWWWV"],
  ...span(5, 10, 10, "XW........WV"),
  [11, 10, "VW........WV"],
  [12, 10, "VV........VV"],
  [13, 10, "VVV......VVV"],
  [14, 11, "VVVVVVVVVV"],
]);

const hoodBack = headwearGrid([
  [3, 12, "XXXXXXXX"],
  [4, 11, "XXWWWWWWWV"],
  ...span(5, 11, 10, "XWWWWWWWWWWV"),
  [12, 10, "VVWWWWWWWWVV"],
  [13, 10, "VVVWWWWWWVVV"],
  [14, 11, "VVVVVVVVVV"],
]);

/* --- Half-visor ("visor"): a chrome-housed glass band across rows
 * 7–9, fully covering the eye rows (8–9) — the catalog marks it
 * coversEyes. The back view is the wrap-around strap. --- */

const visorFront = headwearGrid([
  [7, 10, "6T99TTTTTTT6"],
  [8, 10, "6hUUhUUhUUf6"],
  [9, 10, "6ffffffffff6"],
]);

const visorBack = headwearGrid([
  [7, 10, "6TTTTTTTTTT6"],
  [8, 10, "666666666666"],
]);

/* --- Full-face rebreather ("rebreather"): a sealed mask from the brow
 * seal (row 6) to an under-chin cup — glass lens band over the eye
 * rows, chrome muzzle with ink vent slits over the mouth. Its straps
 * crush the hair (catalog rule); the crown above row 6 stays open so
 * the crushed fringe shows. The back is the strap harness. --- */

const rebreatherFront = headwearGrid([
  [6, 10, "66TTTTTTTT66"],
  [7, 10, "69UhUffUhUf6"],
  [8, 10, "6fUUhffhUUf6"],
  [9, 10, "66T6TTTT6T66"],
  [10, 11, "6TTTTTTTT6"],
  [11, 11, "6T111111T6"],
  [12, 11, "6T111111T6"],
  [13, 12, "66TTTT66"],
  [14, 13, "666666"],
]);

const rebreatherBack = headwearGrid([
  [6, 10, "6T........T6"],
  [7, 10, "6TTTTTTTTTT6"],
  [10, 10, "666666666666"],
  [11, 15, "66"],
]);

/** The authored headwear grids per option and view, all exactly 32×48. */
export const HEADWEAR_LAYERS: Readonly<
  Record<HeadwearId, Readonly<Record<BodyViewId, PixelGrid>>>
> = {
  cap: { front: capFront, back: capBack },
  hood: { front: hoodFront, back: hoodBack },
  visor: { front: visorFront, back: visorBack },
  rebreather: { front: rebreatherFront, back: rebreatherBack },
};

/* --- Portrait overlays: one whole-head grid per option on the 16×12
 * portrait face box (brow line at the top rows, chin at the bottom),
 * matching the face-detail portrait convention. The visor and
 * rebreather lenses are dithered glass — the transparent gaps are what
 * keeps the eyes (and the eye-color remap) readable in portraits while
 * the sprite drops its eyes layer entirely. --- */

export const HEADWEAR_PORTRAITS: Readonly<Record<HeadwearId, PixelGrid>> = {
  // Knit band across the crown line with a ribbed shaded brim.
  cap: [
    "ZnZnZnZnZnZnZnZn",
    "nZnZnZnZnZnZnZnZ",
    "YYYYYYYYYYYYYYYY",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  // Fabric frame around the open face, closing under the chin.
  hood: [
    "XXXXXXXXXXXXXXXX",
    "XW............WX",
    "XW............WV",
    "XW............WV",
    "XW............WV",
    "XW............WV",
    "XW............WV",
    "XW............WV",
    "XW............WV",
    "VW............WV",
    "VV............VV",
    "VVV..........VVV",
  ],
  // Chrome-housed band; the lens rows dither so the eyes show through.
  visor: [
    "................",
    "6..............6",
    "66TTTTTTTTTTTT66",
    "6U.h.U.f.U.h.U.6",
    "6.U.f.U.h.U.f.U6",
    "66ffffffffffff66",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  // Sealed mask: dithered lens pair over the eyes, vented muzzle below.
  rebreather: [
    "................",
    ".66666666666666.",
    ".6U.hU6..6Uh.U6.",
    ".6UfU.6..6.UfU6.",
    ".66666666666666.",
    "..6TTTTTTTTTT6..",
    "..6T11T11T11T6..",
    "..6T11T11T11T6..",
    "..6TTTTTTTTTT6..",
    "...6666666666...",
    "....66666666....",
    "................",
  ],
};
