/**
 * Portrait art: the 48×48 1x head-and-shoulders frame the portrait
 * system composes into. Higher-detail than the 32×48 sprite frame —
 * portraits derive from the same appearance data, never from
 * separately-authored faces.
 *
 * ## The 48×48 portrait frame contract
 *
 * - Front three-quarter view: the skull is centered with the top-left
 *   light source; a nose ridge shades toward screen-right.
 * - Face box: rows 9–20, columns 16–31 — the 16×12 window every
 *   face-box overlay (face details, headwear, head cyberware) is
 *   authored on, brow line at its top row, chin at its bottom row.
 *   PORTRAIT_FRAME.face pins it; faceBoxGrid expands an overlay to the
 *   full frame.
 * - Eye/brow parts (EYE_PORTRAITS / BROW_PORTRAITS in ./face) are one
 *   8-wide screen-left part: stamped at the anchors in PORTRAIT_FRAME,
 *   then mirrored across the face centerline onto the right half.
 *   Mouth grids sit whole on the centerline.
 * - Skull dome rows 3–8, ears rows 12–14, jaw closing to the chin at
 *   row 21, neck to row 25, shoulders from row 26 cropped at the frame
 *   bottom like a bust.
 * - Both builds share rows 0–16 (crown through cheeks) so every face
 *   part lands identically; they diverge at the jaw, neck width, and
 *   shoulder span.
 *
 * ## Channels
 *
 * Heads are authored in the canonical channels only: skin r/q/A
 * (porcelain ramp — skin tones arrive via skinToneRemap), shoulder garb
 * in outfit primary V/W/X with an l/j collar accent (the equipped
 * outfit's material remaps tint the whole shoulder band — no per-item
 * portrait art), and 0 outline. Hair crowns are pure canonical raven
 * "K" like the sprite hair layers, one full-frame grid per catalog
 * style plus the shared crushed under-cap variants.
 */
import type { PixelGrid } from "../pixel";
import type { BodyBuildId } from "./body";
import type { CrushedHairId, HairStyleId } from "./hair";

/** The portrait frame: overall size, face box, and part anchors (1x). */
export const PORTRAIT_FRAME = {
  width: 48,
  height: 48,
  /** The 16×12 overlay window: brow line at top, chin at bottom. */
  face: { left: 16, top: 9, width: 16, height: 12 },
  /** Screen-left eye part anchor; the right eye mirrors at mirrorLeft. */
  eyes: { left: 16, top: 10, mirrorLeft: 24 },
  /** Screen-left brow part anchor; the right brow mirrors at mirrorLeft. */
  brows: { left: 16, top: 9, mirrorLeft: 24 },
  /** Whole-mouth anchor on the face centerline. */
  mouth: { left: 20, top: 16 },
  /** Rows the outfit-tinted shoulder band occupies. */
  shoulders: { top: 26, bottom: 47 },
} as const;

const WIDTH = PORTRAIT_FRAME.width;
const HEIGHT = PORTRAIT_FRAME.height;
const gap = (n: number): string => ".".repeat(n);
const row = (left: number, body: string): string =>
  gap(left) + body + gap(WIDTH - left - body.length);
const rep = (n: number, r: string): string[] => Array<string>(n).fill(r);
const BLANK = gap(WIDTH);

const fill = (ch: string, n: number): string => ch.repeat(n);
const A = (n: number): string => fill("A", n);
const q = (n: number): string => fill("q", n);
const W = (n: number): string => fill("W", n);
const K = (n: number): string => fill("K", n);

/**
 * Expand a smaller grid to a full portrait frame at (left, top).
 * Throws when the part would leave the frame, so a bad anchor or an
 * oversized overlay fails fast instead of silently cropping.
 */
export function placedAt(part: PixelGrid, left: number, top: number): string[] {
  const partWidth = part.reduce((w, r) => Math.max(w, r.length), 0);
  if (left < 0 || top < 0 || top + part.length > HEIGHT || left + partWidth > WIDTH) {
    throw new Error(
      `part ${partWidth}×${part.length} at (${left}, ${top}) leaves the ${WIDTH}×${HEIGHT} portrait frame`,
    );
  }
  const rows = rep(HEIGHT, BLANK);
  part.forEach((partRow, i) => {
    rows[top + i] = gap(left) + partRow + gap(WIDTH - left - partRow.length);
  });
  return rows;
}

/** Expand a 16×12 face-box overlay to the full portrait frame. */
export function faceBoxGrid(overlay: PixelGrid): string[] {
  return placedAt(overlay, PORTRAIT_FRAME.face.left, PORTRAIT_FRAME.face.top);
}

/* --- Shared skull, rows 0–16: dome, brow ridge, cheeks with ears, and
 * the three-quarter nose ridge down column 25 (rows 13–15). Highlight
 * A toward the top-left light, r shade on the lower-right. Identical
 * for both builds so face parts, hair, and overlays align. --- */

const skull: readonly string[] = [
  BLANK,
  BLANK,
  BLANK,
  row(19, "0000000000"),
  row(17, "00" + A(8) + "qq" + "00"),
  row(16, "0" + A(9) + q(5) + "0"),
  row(15, "0" + A(8) + q(8) + "0"),
  row(14, "0" + A(2) + q(14) + "rr" + "0"),
  row(14, "0" + A(2) + q(14) + "rr" + "0"),
  row(14, "0" + A(1) + q(15) + "rr" + "0"),
  row(14, "0" + A(1) + q(15) + "rr" + "0"),
  row(14, "0" + q(16) + "rr" + "0"),
  row(12, "0q" + "0" + q(16) + "rr" + "0" + "r0"),
  row(12, "0q" + "0" + q(10) + "r" + q(5) + "rr" + "0" + "r0"),
  row(12, "0q" + "0" + q(10) + "r" + q(5) + "rr" + "0" + "r0"),
  row(14, "0" + q(9) + "rr" + q(5) + "rr" + "0"),
  row(14, "0" + q(16) + "rr" + "0"),
];

/* --- Lean build, rows 17–47: a tapered jaw, slim neck, and shoulders
 * sloping out to a 40-wide bust with a V collar showing the neck base
 * and an accent seam down the chest centerline. --- */

const leanTorso = "0X" + W(16) + "ljjl" + W(16) + "V0";

const leanLower: readonly string[] = [
  row(15, "0" + q(14) + "rr" + "0"),
  row(16, "0" + q(12) + "rr" + "0"),
  row(17, "0" + q(10) + "rr" + "0"),
  row(18, "0" + q(8) + "rr" + "0"),
  row(19, "0r" + q(6) + "r0"),
  row(19, "00r" + q(4) + "r00"),
  row(20, "0" + fill("r", 6) + "0"),
  row(20, "0" + q(5) + "r0"),
  row(20, "0" + q(5) + "r0"),
  row(16, "0XXX" + "0" + q(5) + "r0" + "VVV0"),
  row(12, "0XXXXXXX" + "0" + q(5) + "r0" + "VVVVVVV0"),
  row(8, "0XXXXXXXXXXX" + "0" + q(5) + "r0" + "VVVVVVVVVVV0"),
  row(6, "0X" + W(11) + "0j" + q(6) + "j0" + W(11) + "V0"),
  row(5, "0X" + W(15) + "jjjj" + W(15) + "V0"),
  ...rep(17, row(4, leanTorso)),
];

/* --- Heavy build, rows 17–47: the jaw holds its width two rows
 * longer, the neck runs two columns broader, and the shoulders span a
 * 44-wide bust. --- */

const heavyTorso = "0X" + W(18) + "ljjl" + W(18) + "V0";

const heavyLower: readonly string[] = [
  row(14, "0" + q(16) + "rr" + "0"),
  row(15, "0" + q(14) + "rr" + "0"),
  row(16, "0" + q(12) + "rr" + "0"),
  row(17, "0" + q(10) + "rr" + "0"),
  row(18, "0r" + q(8) + "r0"),
  row(18, "00r" + q(6) + "r00"),
  row(19, "0" + fill("r", 8) + "0"),
  row(19, "0" + q(7) + "r0"),
  row(19, "0" + q(7) + "r0"),
  row(14, "0XXXXX" + "0" + q(7) + "r0" + "VVVVV0"),
  row(10, "0XXXXXXXXX" + "0" + q(7) + "r0" + "VVVVVVVVV0"),
  row(6, "0XXXXXXXXXXXXX" + "0" + q(7) + "r0" + "VVVVVVVVVVVVV0"),
  row(4, "0X" + W(12) + "0j" + q(8) + "j0" + W(12) + "V0"),
  row(3, "0X" + W(17) + "jjjj" + W(17) + "V0"),
  ...rep(17, row(2, heavyTorso)),
];

/** Portrait base heads per build, all exactly 48×48. */
export const PORTRAIT_HEADS: Readonly<Record<BodyBuildId, PixelGrid>> = {
  lean: [...skull, ...leanLower],
  heavy: [...skull, ...heavyLower],
};

/* --- Hair crowns: one full-frame grid per catalog style, front
 * three-quarter like the heads. Fringe rows stay at or above row 8 so
 * hair never covers the brow row (row 9) it composes over. --- */

const o = gap;

/** A frame-sized grid from sparse [rowIndex, leftCol, pixels] strokes. */
function hairGrid(
  strokes: ReadonlyArray<readonly [number, number, string]>,
): string[] {
  const grid = rep(HEIGHT, BLANK);
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

// Short crop: a tight cap with temple points and sideburns.
const buzzCrown = hairGrid([
  [3, 18, K(12)],
  [4, 16, K(16)],
  [5, 15, K(18)],
  [6, 14, K(20)],
  [7, 14, "KKK" + o(14) + "KKK"],
  [8, 14, "KK" + o(16) + "KK"],
  ...span(9, 10, 14, "K" + o(18) + "K"),
]);

// Slicked back: swept off a high forehead with a widow's peak.
const slickedCrown = hairGrid([
  [3, 18, K(12)],
  [4, 16, K(16)],
  [5, 15, K(18)],
  [6, 14, "KKKKK..KKKKKK..KKKKK"],
  [7, 14, "KK" + o(16) + "KK"],
  [8, 14, "K" + o(18) + "K"],
]);

// Chin-length bob: full fringe and curtains falling to the jaw.
const bobCrown = hairGrid([
  [3, 18, K(12)],
  [4, 16, K(16)],
  [5, 14, K(20)],
  ...span(6, 8, 13, K(22)),
  ...span(9, 16, 13, "KKK" + o(16) + "KKK"),
  ...span(17, 18, 13, "KKKK" + o(14) + "KKKK"),
  ...span(19, 20, 13, "KKKKK" + o(12) + "KKKKK"),
  [21, 14, "KK" + o(16) + "KK"],
]);

// Short spikes: jagged tips breaking the dome outline.
const spikesCrown = hairGrid([
  [1, 17, "K...K...K...K.K"],
  [2, 16, "KK.KKK..KKK.KK..KK"],
  [3, 16, K(16)],
  [4, 15, K(18)],
  [5, 14, K(20)],
  [6, 14, "KKK" + o(14) + "KKK"],
  [7, 14, "KK" + o(16) + "KK"],
  [8, 14, "K" + o(18) + "K"],
]);

// Mohawk: shaved sides under a tall crest fan narrowing to the brow.
const mohawkCrown = hairGrid([
  [0, 21, "K..KK..K"],
  [1, 21, "KK.KK.KK"],
  ...span(2, 3, 20, K(10)),
  [4, 20, K(9)],
  [5, 21, K(8)],
  [6, 21, K(7)],
  [7, 22, K(5)],
  [8, 23, K(3)],
]);

// Shoulder locs: segmented strands falling past the jaw to the bust.
const locsCrown = hairGrid([
  [3, 18, K(12)],
  [4, 16, K(16)],
  [5, 15, K(18)],
  [6, 14, K(20)],
  [7, 13, K(22)],
  [8, 13, "KK.KK" + o(12) + "KK.KK"],
  ...span(9, 14, 13, "K.KK" + o(14) + "KK.K"),
  ...span(15, 20, 13, "KK.K" + o(14) + "K.KK"),
  ...span(21, 24, 12, "K.KK" + o(16) + "KK.K"),
  ...span(25, 26, 12, "K..K" + o(16) + "K..K"),
]);

// Tied-back tail: swept crown, the tail hanging past the left ear.
const ponytailCrown = hairGrid([
  [3, 18, K(12)],
  [4, 16, K(16)],
  [5, 15, "KKKK..KKKKKK..KKKK"],
  [6, 14, "KKK" + o(14) + "KKK"],
  [7, 14, "KK" + o(16) + "KK"],
  ...span(8, 12, 11, "KKK"),
  ...span(13, 18, 11, "KK"),
  ...span(19, 22, 12, "KK"),
  [23, 12, "K"],
]);

// Shaved glyph: dyed scalp trace with a temple curl, no volume.
const glyphCrown = hairGrid([
  [4, 18, "K.K.K.K.K.K."],
  [5, 17, "K" + o(12) + "K"],
  [6, 16, "K.K" + o(10) + "K.K"],
  ...span(7, 8, 32, "K"),
  [9, 31, "K"],
]);

// Crushed under-cap: pressed flat to the skull with sideburns.
const crushedShortCrown = hairGrid([
  [4, 17, K(14)],
  [5, 15, K(18)],
  [6, 14, K(20)],
  [7, 14, "KK" + o(16) + "KK"],
  ...span(8, 11, 14, "K" + o(18) + "K"),
]);

// Crushed long: pressed curtains falling to the jaw.
const crushedLongCrown = hairGrid([
  [4, 17, K(14)],
  [5, 15, K(18)],
  [6, 13, K(22)],
  ...span(7, 17, 13, "KK" + o(18) + "KK"),
  [18, 13, "K" + o(20) + "K"],
]);

/**
 * The portrait hair crowns, keyed by the same layer ids the sprite
 * hair registry uses — catalog styles plus the shared crushed
 * under-cap variants the headwear "crushes" rule swaps in.
 */
export const PORTRAIT_HAIR_GRIDS: Readonly<
  Record<HairStyleId | CrushedHairId, PixelGrid>
> = {
  buzz: buzzCrown,
  slicked: slickedCrown,
  bob: bobCrown,
  spikes: spikesCrown,
  mohawk: mohawkCrown,
  locs: locsCrown,
  ponytail: ponytailCrown,
  glyph: glyphCrown,
  "crushed-short": crushedShortCrown,
  "crushed-long": crushedLongCrown,
};

/* --- Static flicker: the tear a screaming Static band puts through a
 * portrait (see src/data/static.ts). Torn scanlines rather than
 * per-pixel snow — a portrait is 48 pixels tall and read at a glance,
 * and snow at that size is mud.
 *
 * Authored in the cyber-chrome channel (6 shade, T base) so the two
 * frames below recolor it by the same per-frame remap mechanism the
 * cyber-lines face detail and the cyberware glow pulse use, rather than
 * by a second machinery nobody else has to know about. --- */

/** A dashed run: `pixels` repeated across `width` columns from `left`. */
const tear = (left: number, width: number, pixels: string): string =>
  row(left, pixels.repeat(Math.ceil(width / pixels.length)).slice(0, width));

const flickerA: PixelGrid = (() => {
  const grid = rep(HEIGHT, BLANK);
  grid[7] = tear(14, 20, "T.6.");
  grid[19] = tear(12, 26, "6..T.");
  grid[33] = tear(8, 34, "T.6..");
  return grid;
})();

const flickerB: PixelGrid = (() => {
  const grid = rep(HEIGHT, BLANK);
  grid[12] = tear(16, 18, ".6.T");
  grid[26] = tear(10, 30, "..T.6");
  grid[41] = tear(6, 36, ".T..6.");
  return grid;
})();

/**
 * The flicker cycle, as portrait *frames*: nothing, then two different
 * tears. Frame 0 drawing nothing is what makes it a flicker rather than
 * a permanent overlay — the portrait is clean most of the time and the
 * noise cuts through it, which is both subtler and truer than a face
 * permanently full of snow.
 */
export const STATIC_FLICKER_FRAMES: readonly (PixelGrid | null)[] = [
  null,
  flickerA,
  flickerB,
];

/**
 * Per-frame channel remaps for the tears, in the same shape as
 * CYBER_LINES_SHIMMER: the first tear sits dim, the second flares to
 * the bright end of the chrome ramp, so consecutive frames do not read
 * as the same graphic moved.
 */
export const STATIC_FLICKER_SHIMMER: readonly Readonly<
  Record<string, string>
>[] = [{}, { "6": "6", T: "T" }, { "6": "T", T: "9" }];

/** The portrait crown for a hair layer id, or null while unregistered. */
export function portraitHairGrid(art: string): PixelGrid | null {
  return (
    PORTRAIT_HAIR_GRIDS[art as HairStyleId | CrushedHairId] ?? null
  );
}
