/**
 * Outfit layers: the slot between body and face, driven by the equipped
 * outfit/armor item. Five silhouette families cover the wearable item
 * catalog: street rain wrap ("slicker"), tailored corp formalwear
 * ("suit"), strap-and-rig diver harness ("harness"), signal-eating corp
 * longcoat ("longcoat"), and heavy checkpoint plating ("plate"). Items
 * without an outfit layer reference draw nothing — the body's authored
 * base garb underlayer shows instead.
 *
 * Unlike hair/headwear, torsos differ per build, so every family is
 * authored per build (lean, heavy) and per view (front, back) on the
 * shared 32×48 layer frame (see the contract in ./body); south/west
 * facings mirror whole composed frames. The layer engine looks grids up
 * by flat art id — outfitArtId(family, build) — via OUTFIT_GRIDS.
 *
 * ## Animation / region contract
 *
 * Outfits are composed onto the neutral pose and animated by the shared
 * bodyAnimFrames transforms. Every pixel stays inside OUTFIT_REGION —
 * rows 17 (below the neck) through 32 (above the leg-shear bands at
 * LEG_TOP), one column of flare past the heavy torso each side — so the
 * walk stride's leg shears never cut a hem and the whole garment rides
 * the sink/raise rows coherently. The bare-skin hand pixels
 * (BODY_FRAME.hands, rows 29–30) stay transparent in every family so
 * hands remain visible and the arm counter-swing keeps reading.
 * outfits.test.ts enforces the region, the hand windows, and per-build
 * alignment against the body silhouette.
 *
 * ## Channels
 *
 * Grids draw only the outfit remap channels plus neutral structure:
 * main cloth in outfitPrimary (V/W/X, the dark-fabric ramp), trim in
 * outfitAccent (l/j/k, the magenta ramp), silhouette outlines in 0 and
 * ink 1. Items recolor per channel by remapping onto a material ramp
 * (outfitChannelRemap in ../layers) — e.g. the plate rig is authored in
 * cloth channels and worn chrome.
 */
import type { PixelGrid } from "../pixel";
import {
  BODY_BUILD_IDS,
  BODY_FRAME,
  type BodyBuildId,
  type BodyViewId,
} from "./body";

export const OUTFIT_LAYER_IDS = [
  "slicker",
  "suit",
  "harness",
  "longcoat",
  "plate",
] as const;
export type OutfitLayerId = (typeof OUTFIT_LAYER_IDS)[number];

/**
 * Rows/cols (inclusive) outfit pixels may occupy: the shoulder line
 * (below the bare neck) down to the hip row above the walk stride's
 * leg-shear bands, one column past the heavy torso each side for
 * pauldron flare.
 */
export const OUTFIT_REGION = {
  top: BODY_FRAME.neck.bottom + 1,
  bottom: 32,
  left: 6,
  right: 25,
} as const;

const WIDTH = BODY_FRAME.width;
const gap = (n: number): string => ".".repeat(n);
const row = (left: number, body: string): string =>
  gap(left) + body + gap(WIDTH - left - body.length);
const BLANK = gap(WIDTH);

/** A frame-sized grid from sparse [rowIndex, leftCol, pixels] strokes. */
function outfitGrid(
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

/* --- Street rain wrap ("slicker"): a raised collar, a diagonal accent
 * closure running shoulder-to-hip across the front, a cinched accent
 * waist, and a dark hem skirting the hips. The back carries a storm
 * yoke across the shoulders and a center vent seam. --- */

const slickerLeanFront = outfitGrid([
  [17, 9, "0XXXWWWWWWXXX0"],
  [18, 8, "0XXWWWWWjWWWWWV0"],
  [19, 8, "0XWWWWWWjWWWWWV0"],
  ...span(20, 21, 8, "0XWWWWWjWWWWWWV0"),
  ...span(22, 23, 8, "0XWWWWjWWWWWWWV0"),
  ...span(24, 25, 8, "0XWWWjWWWWWWWWV0"),
  ...span(26, 27, 9, "0XWjWWWWWWWWV0"),
  [28, 9, "0lljjjjjjjjll0"],
  ...span(29, 30, 12, "WWWWWWWW"),
  [31, 9, "0VVVVVVVVVVVV0"],
]);

const slickerLeanBack = outfitGrid([
  [17, 9, "0XXXWWWWWWXXX0"],
  [18, 8, "0XXXXXXXXXXXXXV0"],
  ...span(19, 23, 8, "0XWWWWWWWWWWWWV0"),
  ...span(24, 25, 8, "0XWWWWWVVWWWWWV0"),
  ...span(26, 27, 9, "0XWWWWVVWWWWV0"),
  [28, 9, "0llllllllllll0"],
  ...span(29, 30, 12, "WWWWWWWW"),
  [31, 9, "0VVVVVVVVVVVV0"],
]);

const slickerHeavyFront = outfitGrid([
  [17, 8, "0XXXXWWWWWWXXXX0"],
  [18, 7, "0XXWWWWWWjWWWWWWV0"],
  [19, 7, "0XWWWWWWWjWWWWWWV0"],
  ...span(20, 21, 7, "0XWWWWWWjWWWWWWWV0"),
  ...span(22, 23, 7, "0XWWWWWjWWWWWWWWV0"),
  ...span(24, 25, 7, "0XWWWWjWWWWWWWWWV0"),
  [26, 8, "0XWWWjWWWWWWWWV0"],
  [27, 8, "0XWWjWWWWWWWWWV0"],
  [28, 8, "0lljjjjjjjjjjll0"],
  ...span(29, 30, 11, "WWWWWWWWWW"),
  [31, 8, "0VVVVVVVVVVVVVV0"],
]);

const slickerHeavyBack = outfitGrid([
  [17, 8, "0XXXXWWWWWWXXXX0"],
  [18, 7, "0XXXXXXXXXXXXXXXV0"],
  ...span(19, 23, 7, "0XWWWWWWWWWWWWWWV0"),
  ...span(24, 25, 7, "0XWWWWWWVVWWWWWWV0"),
  ...span(26, 27, 8, "0XWWWWWVVWWWWWV0"),
  [28, 8, "0llllllllllllll0"],
  ...span(29, 30, 11, "WWWWWWWWWW"),
  [31, 8, "0VVVVVVVVVVVVVV0"],
]);

/* --- Corp formalwear ("suit"): padded shoulders, lapels opening on a
 * bright shirt panel with an accent tie that dims to a tail below the
 * button line; the jacket hems at the belt so the body's own trousers
 * show. The back is a plain tailored shell with a center seam and
 * vent. --- */

const suitLeanFront = outfitGrid([
  [17, 9, "0XXWWWWWWWWXX0"],
  [18, 8, "0XWWWXXXjXXXWWV0"],
  [19, 8, "0XWWWWXXjXXWWWV0"],
  ...span(20, 21, 8, "0XWWWWWXjXWWWWV0"),
  ...span(22, 23, 8, "0XWWWWWWjWWWWWV0"),
  ...span(24, 25, 8, "0XWWWWWWlWWWWWV0"),
  [26, 9, "0XWWWWWlWWWWV0"],
  [27, 9, "0XVWWWWlWWWVV0"],
  [28, 9, "0VVVVVVVVVVVV0"],
]);

const suitLeanBack = outfitGrid([
  [17, 9, "0XXWWWWWWWWXX0"],
  ...span(18, 23, 8, "0XWWWWWWVWWWWWV0"),
  ...span(24, 25, 8, "0XWWWWWVVWWWWWV0"),
  ...span(26, 27, 9, "0XVWWWVVWWWVV0"),
  [28, 9, "0VVVVVVVVVVVV0"],
]);

const suitHeavyFront = outfitGrid([
  [17, 8, "0XXWWWWWWWWWWXX0"],
  [18, 7, "0XWWWWXXXjXXXWWWV0"],
  [19, 7, "0XWWWWWXXjXXWWWWV0"],
  ...span(20, 21, 7, "0XWWWWWWXjXWWWWWV0"),
  ...span(22, 23, 7, "0XWWWWWWWjWWWWWWV0"),
  ...span(24, 25, 7, "0XWWWWWWWlWWWWWWV0"),
  [26, 8, "0XWWWWWWlWWWWWV0"],
  [27, 8, "0XVWWWWWlWWWWVV0"],
  [28, 8, "0VVVVVVVVVVVVVV0"],
]);

const suitHeavyBack = outfitGrid([
  [17, 8, "0XXWWWWWWWWWWXX0"],
  ...span(18, 23, 7, "0XWWWWWWWVWWWWWWV0"),
  ...span(24, 25, 7, "0XWWWWWWVVWWWWWWV0"),
  ...span(26, 27, 8, "0XVWWWWVVWWWWVV0"),
  [28, 8, "0VVVVVVVVVVVVVV0"],
]);

/* --- Diver harness ("harness"): the rig rides over the base garb —
 * padded shoulder caps, crossed chest straps meeting at an accent
 * buckle, a jack-point tool belt, and pouches below it. The back swaps
 * the cross for a cable-spool pack with accent clips. Mostly
 * transparent: the body's own underlayer reads through. --- */

const harnessLeanFront = outfitGrid([
  [17, 9, "0XXV......VXX0"],
  [18, 8, "0XXXV......VXXX0"],
  [19, 11, "X........X"],
  [20, 12, "X......X"],
  [21, 13, "X....X"],
  [22, 14, "XjjX"],
  [23, 13, "X....X"],
  [24, 12, "X......X"],
  [25, 11, "X........X"],
  [28, 9, "0XjjXXjjXXjjX0"],
  [29, 12, "XllXXllX"],
]);

const harnessLeanBack = outfitGrid([
  [17, 9, "0XXV......VXX0"],
  [18, 8, "0XXXV......VXXX0"],
  [19, 13, "VXXXXV"],
  [20, 13, "VjWWjV"],
  ...span(21, 22, 13, "VWWWWV"),
  [23, 13, "VjWWjV"],
  [24, 13, "VVVVVV"],
  [25, 11, "X........X"],
  [28, 9, "0XjjXXjjXXjjX0"],
  [29, 12, "XllXXllX"],
]);

const harnessHeavyFront = outfitGrid([
  [17, 8, "0XXV........VXX0"],
  [18, 7, "0XXXV........VXXX0"],
  [19, 10, "X..........X"],
  [20, 11, "X........X"],
  [21, 12, "X......X"],
  [22, 13, "X....X"],
  [23, 14, "XjjX"],
  [24, 13, "X....X"],
  [25, 12, "X......X"],
  [28, 8, "0jXXjjXXjjXXjjX0"],
  [29, 11, "lXXlXXlXXl"],
]);

const harnessHeavyBack = outfitGrid([
  [17, 8, "0XXV........VXX0"],
  [18, 7, "0XXXV........VXXX0"],
  [19, 12, "VXXXXXXV"],
  [20, 12, "VjWWWWjV"],
  ...span(21, 22, 12, "VWWWWWWV"),
  [23, 12, "VjWWWWjV"],
  [24, 12, "VVVVVVVV"],
  [25, 11, "X........X"],
  [28, 8, "0jXXjjXXjjXXjjX0"],
  [29, 11, "lXXlXXlXXl"],
]);

/* --- Corp longcoat ("longcoat"): a tall collar, accent signal-thread
 * lines down both edges, lapel creases, a buckled waist, and a skirt
 * falling to mid-thigh with an open front split (the body's own legs
 * read through). The back closes the split into a vent at the hem. --- */

const longcoatLeanFront = outfitGrid([
  [17, 9, "0XXXXWWWWXXXX0"],
  ...span(18, 25, 8, "0XjWWXWWWWXWWjV0"),
  ...span(26, 27, 9, "0XjWXWWWWXWjV0"),
  [28, 9, "0VVVVVjjVVVVV0"],
  ...span(29, 30, 12, "WWV..VWW"),
  [31, 9, "0VWWWV..VWWWV0"],
  [32, 9, "0VWWV0..0VWWV0"],
]);

const longcoatLeanBack = outfitGrid([
  [17, 9, "0XXXXWWWWXXXX0"],
  ...span(18, 25, 8, "0XjWWWWWWWWWWjV0"),
  ...span(26, 27, 9, "0XjWWWWWWWWjV0"),
  [28, 9, "0VVVVVVVVVVVV0"],
  ...span(29, 30, 12, "WWWWWWWW"),
  [31, 9, "0VWWWWVVWWWWV0"],
  [32, 9, "0VWWV0..0VWWV0"],
]);

const longcoatHeavyFront = outfitGrid([
  [17, 8, "0XXXXXWWWWXXXXX0"],
  ...span(18, 25, 7, "0XjWWWXWWWWXWWWjV0"),
  ...span(26, 27, 8, "0XjWXWWWWWWXWjV0"),
  [28, 8, "0VVVVVVjjVVVVVV0"],
  ...span(29, 30, 11, "WWWV..VWWW"),
  [31, 8, "0VWWWWV..VWWWWV0"],
  [32, 8, "0VWWWV0..0VWWWV0"],
]);

const longcoatHeavyBack = outfitGrid([
  [17, 8, "0XXXXXWWWWXXXXX0"],
  ...span(18, 25, 7, "0XjWWWWWWWWWWWWjV0"),
  ...span(26, 27, 8, "0XjWWWWWWWWWWjV0"),
  [28, 8, "0VVVVVVVVVVVVVV0"],
  ...span(29, 30, 11, "WWWWWWWWWW"),
  [31, 8, "0VWWWWWVVWWWWWV0"],
  [32, 8, "0VWWWV0..0VWWWV0"],
]);

/* --- Heavy plating ("plate"): flared pauldrons (one column past the
 * torso) with an accent hazard stripe up front, three segmented chest
 * plates (lit top edge, shaded seam), an ink utility belt with accent
 * clasps, an armored apron, and thigh guards. The back trades the
 * stripe for an ink spine channel down the plates. --- */

const plateLeanFront = outfitGrid([
  [17, 8, "0XXX00WWWW00XXX0"],
  [18, 8, "0XjX0WWWWWW0XjX0"],
  [19, 8, "0VVV0WWWWWW0VVV0"],
  [20, 9, "0XXXXXXXXXXXX0"],
  [21, 9, "0XWWWWWWWWWWV0"],
  [22, 9, "0VVVVVVVVVVVV0"],
  [23, 9, "0XXXXXXXXXXXX0"],
  [24, 9, "0XWWWWWWWWWWV0"],
  [25, 9, "0VVVVVVVVVVVV0"],
  [26, 9, "0XXXXXXXXXXXX0"],
  [27, 9, "0XWWWWWWWWWWV0"],
  [28, 9, "011jj1111jj110"],
  ...span(29, 30, 12, "VWWWWWWV"),
  [31, 9, "0XXWWV..VWWXX0"],
  [32, 9, "0VXWV0..0VWXV0"],
]);

const plateLeanBack = outfitGrid([
  [17, 8, "0XXX00WWWW00XXX0"],
  [18, 8, "0XXX0WWWWWW0XXX0"],
  [19, 8, "0VVV0WWWWWW0VVV0"],
  [20, 9, "0XXXXX11XXXXX0"],
  [21, 9, "0XWWWW11WWWWV0"],
  [22, 9, "0VVVVV11VVVVV0"],
  [23, 9, "0XXXXX11XXXXX0"],
  [24, 9, "0XWWWW11WWWWV0"],
  [25, 9, "0VVVVV11VVVVV0"],
  [26, 9, "0XXXXX11XXXXX0"],
  [27, 9, "0XWWWW11WWWWV0"],
  [28, 9, "011111111111110"],
  ...span(29, 30, 12, "VWWWWWWV"),
  [31, 9, "0XXWWV..VWWXX0"],
  [32, 9, "0VXWV0..0VWXV0"],
]);

const plateHeavyFront = outfitGrid([
  [17, 7, "0XXXX00WWWW00XXXX0"],
  [18, 7, "0XjXX0WWWWWW0XXjX0"],
  [19, 7, "0VVVV0WWWWWW0VVVV0"],
  [20, 8, "0XXXXXXXXXXXXXX0"],
  [21, 8, "0XWWWWWWWWWWWWV0"],
  [22, 8, "0VVVVVVVVVVVVVV0"],
  [23, 8, "0XXXXXXXXXXXXXX0"],
  [24, 8, "0XWWWWWWWWWWWWV0"],
  [25, 8, "0VVVVVVVVVVVVVV0"],
  [26, 8, "0XXXXXXXXXXXXXX0"],
  [27, 8, "0XWWWWWWWWWWWWV0"],
  [28, 8, "011jj111111jj110"],
  ...span(29, 30, 11, "VWWWWWWWWV"),
  [31, 8, "0XXWWWV..VWWWXX0"],
  [32, 8, "0VXWWV0..0VWWXV0"],
]);

const plateHeavyBack = outfitGrid([
  [17, 7, "0XXXX00WWWW00XXXX0"],
  [18, 7, "0XXXX0WWWWWW0XXXX0"],
  [19, 7, "0VVVV0WWWWWW0VVVV0"],
  [20, 8, "0XXXXXX11XXXXXX0"],
  [21, 8, "0XWWWWW11WWWWWV0"],
  [22, 8, "0VVVVVV11VVVVVV0"],
  [23, 8, "0XXXXXX11XXXXXX0"],
  [24, 8, "0XWWWWW11WWWWWV0"],
  [25, 8, "0VVVVVV11VVVVVV0"],
  [26, 8, "0XXXXXX11XXXXXX0"],
  [27, 8, "0XWWWWW11WWWWWV0"],
  [28, 8, "0111111111111110"],
  ...span(29, 30, 11, "VWWWWWWWWV"),
  [31, 8, "0XXWWWV..VWWWXX0"],
  [32, 8, "0VXWWV0..0VWWXV0"],
]);

/** The authored outfit grids per family, build, and view, all 32×48. */
export const OUTFIT_LAYERS: Readonly<
  Record<
    OutfitLayerId,
    Readonly<Record<BodyBuildId, Readonly<Record<BodyViewId, PixelGrid>>>>
  >
> = {
  slicker: {
    lean: { front: slickerLeanFront, back: slickerLeanBack },
    heavy: { front: slickerHeavyFront, back: slickerHeavyBack },
  },
  suit: {
    lean: { front: suitLeanFront, back: suitLeanBack },
    heavy: { front: suitHeavyFront, back: suitHeavyBack },
  },
  harness: {
    lean: { front: harnessLeanFront, back: harnessLeanBack },
    heavy: { front: harnessHeavyFront, back: harnessHeavyBack },
  },
  longcoat: {
    lean: { front: longcoatLeanFront, back: longcoatLeanBack },
    heavy: { front: longcoatHeavyFront, back: longcoatHeavyBack },
  },
  plate: {
    lean: { front: plateLeanFront, back: plateLeanBack },
    heavy: { front: plateHeavyFront, back: plateHeavyBack },
  },
};

/**
 * Flat registry art id for an outfit family worn on a build. The layer
 * engine's slot registries key by a single art string; resolveLayers
 * composes this from the item's layer reference and the character's
 * build so each build gets its own aligned grid set.
 */
export function outfitArtId(layer: string, build: BodyBuildId): string {
  return `${layer}@${build}`;
}

/** The flat per-view registry the layer engine consumes. */
export const OUTFIT_GRIDS: Readonly<
  Record<string, Readonly<Record<BodyViewId, PixelGrid>>>
> = Object.fromEntries(
  OUTFIT_LAYER_IDS.flatMap((id) =>
    BODY_BUILD_IDS.map((build) => [outfitArtId(id, build), OUTFIT_LAYERS[id][build]]),
  ),
);
