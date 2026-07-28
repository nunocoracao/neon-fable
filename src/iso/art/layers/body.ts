/**
 * Hi-res character base bodies: the bottom layer of the v2 layered
 * character system. Two builds (lean, heavy), each authored as a full
 * 32×48 1x grid in plain underlayer garb, front (east) and back
 * (north) three-quarter views; south/west come from horizontal
 * mirroring exactly as the legacy character set does.
 *
 * ## The 32×48 frame contract (every later layer aligns to this)
 *
 * All character layers (outfit, face, hair, headwear, weapon,
 * cyberware) share this frame: same 32×48 grid, composited over the
 * body before baking.
 *
 * - Anchor: (16, 44) in 1x art pixels — the center of the soft ground
 *   shadow.
 * - Ground shadow: `z` ellipse rows 43–45, centered on column 16. The
 *   body layer owns the shadow; no other layer may draw `z`.
 * - Head box: rows 3–14, columns 10–21 (a 12-row skull including its
 *   `0` outline). Both builds and both views share identical rows
 *   0–16, so hair / face / headwear layers fit every body unchanged.
 *   Face layers (eyes, brows, mouth) target the interior rows 6–13 of
 *   the front view only.
 * - Neck: rows 15–16, columns 13–18 (bare skin).
 * - Shoulders start on row 17; torso, waist, and belt run to row 30;
 *   legs rows 31–42 with feet ending on row 42.
 * - Hands: bare skin beside the hips on rows 29–30, at the per-build
 *   columns in BODY_FRAME.hands (lean 10–11 / 20–21, heavy 9–10 /
 *   21–22). Weapon layers attach at the leading hand.
 * - Facings: `front` faces down-right (east), `back` faces up-right
 *   (north). South/west mirror columns (c -> 31 - c), which mirrors
 *   the hand positions with them.
 *
 * ## Channels
 *
 * Grids use only reserved remap channels plus neutral structure: skin
 * is r/q/A (REMAP_CHANNELS.skin, authored in the canonical porcelain
 * ramp), base garb is V/W/X (outfitPrimary) with j/l trim
 * (outfitAccent), silhouettes outline in 0 with ink-1 boots, and the
 * translucent z ground shadow. The head is bare scalp in the skin
 * channel only — hair and face arrive as separate layers.
 */
import type { Facing } from "../../animation";
import type { PixelGrid } from "../pixel";

export const BODY_BUILD_IDS = ["lean", "heavy"] as const;
export type BodyBuildId = (typeof BODY_BUILD_IDS)[number];

export const BODY_VIEW_IDS = ["front", "back"] as const;
export type BodyViewId = (typeof BODY_VIEW_IDS)[number];

/** The shared 32×48 layer frame; see the module comment for the map. */
export const BODY_FRAME = {
  width: 32,
  height: 48,
  /** Anchor (shadow center) in 1x art pixels. */
  anchorX: 16,
  anchorY: 44,
  /** Skull bounding box (rows/cols inclusive), shared by all builds. */
  head: { top: 3, bottom: 14, left: 10, right: 21 },
  neck: { top: 15, bottom: 16, left: 13, right: 18 },
  /** Bare-skin hand pixels (rows/cols inclusive) per build. */
  hands: {
    lean: { rows: [29, 30], left: [10, 11], right: [20, 21] },
    heavy: { rows: [29, 30], left: [9, 10], right: [21, 22] },
  },
  shadow: { top: 43, bottom: 45, centerX: 16 },
} as const;

const WIDTH = BODY_FRAME.width;
const gap = (n: number): string => ".".repeat(n);
const row = (left: number, body: string): string =>
  gap(left) + body + gap(WIDTH - left - body.length);
const rep = (n: number, r: string): string[] => Array<string>(n).fill(r);
const BLANK = gap(WIDTH);

/* --- Shared head + neck, rows 0–16. Bare scalp in the skin channel,
 * highlight toward the top-left light, shade on the lower right. Both
 * builds reuse these rows verbatim so later hair/face layers align. --- */

const headFront: readonly string[] = [
  BLANK,
  BLANK,
  BLANK,
  row(12, "00000000"),
  row(11, "0AAAAAAqq0"),
  row(10, "0AAqqqqqqqr0"),
  row(10, "0Aqqqqqqqqr0"),
  row(10, "0Aqqqqqqqqr0"),
  row(10, "0Aqqqqqqqqr0"),
  row(10, "0Aqqqqqqqqr0"),
  row(10, "0qqqqqqqqrr0"),
  row(10, "0qqqqqqqqrr0"),
  row(11, "0qqqqqqrr0"),
  row(11, "0rqqqqqrr0"),
  row(12, "0rqqqqr0"),
  row(13, "0rqqr0"),
  row(13, "0rqqr0"),
];

const headBack: readonly string[] = [
  BLANK,
  BLANK,
  BLANK,
  row(12, "00000000"),
  row(11, "0AAAAAAqq0"),
  row(10, "0AAqqqqqqqr0"),
  row(10, "0Aqqqqqqqrr0"),
  row(10, "0Aqqqqqqqrr0"),
  row(10, "0Aqqqqqqqrr0"),
  row(10, "0qqqqqqqqrr0"),
  row(10, "0qqqqqqqrrr0"),
  row(10, "0qqqqqqqrrr0"),
  row(11, "0qqqqqrrr0"),
  row(11, "0rqqqqrrr0"),
  row(12, "0rqqrrr0"),
  row(13, "0rqqr0"),
  row(13, "0rqqr0"),
];

/* --- Lean build. Torso rows 17–28; the front carries a j accent zip
 * seam down column 16 into the belt, the back a plain V center seam
 * with the belt's dim l edge showing. --- */

const leanTorsoFront: readonly string[] = [
  row(9, "00XXWWWWWWWV00"),
  ...rep(6, row(8, "0XXVWWWWjWWWWVV0")),
  ...rep(2, row(8, "0XVVWWWWjWWWWVV0")),
  ...rep(2, row(9, "0XVWWWWjWWWVV0")),
  row(9, "0jjjjjjjjjjll0"),
];

const leanTorsoBack: readonly string[] = [
  row(9, "00XXWWWWWWWV00"),
  ...rep(6, row(8, "0XXVWWWWVWWWWVV0")),
  ...rep(2, row(8, "0XVVWWWWVWWWWVV0")),
  ...rep(2, row(9, "0XVWWWWVWWWVV0")),
  row(9, "0llllllllllll0"),
];

/* Rows 29–47: hands at the hips, legs with a knee-crease row, ink
 * boots, and the anchored ground shadow. Shared by front and back. */
const leanLower: readonly string[] = [
  ...rep(2, row(9, "0qqWWWWWWWWrr0")),
  row(9, "0XWWWWVVWWWWV0"),
  row(9, "0XWWWV00VWWWV0"),
  ...rep(3, row(9, "0XWWV0..0WWWV0")),
  row(9, "0XVWV0..0VWWV0"),
  ...rep(3, row(9, "0XWWV0..0WWWV0")),
  row(9, "0VVVV0..0VVVV0"),
  ...rep(2, row(9, "011110..011110")),
  row(10, "z".repeat(13)),
  row(7, "z".repeat(19)),
  row(10, "z".repeat(13)),
  BLANK,
  BLANK,
];

/* --- Heavy build: two columns broader through the shoulders, waist,
 * and legs, with a wider stance and shadow; head rows stay shared. --- */

const heavyTorsoFront: readonly string[] = [
  row(8, "00XXXWWWWWWWWV00"),
  ...rep(6, row(7, "0XXVWWWWWjWWWWWVV0")),
  ...rep(2, row(7, "0XVVWWWWWjWWWWWVV0")),
  ...rep(2, row(8, "0XVWWWWWjWWWWWV0")),
  row(8, "0jjjjjjjjjjjjll0"),
];

const heavyTorsoBack: readonly string[] = [
  row(8, "00XXXWWWWWWWWV00"),
  ...rep(6, row(7, "0XXVWWWWWVWWWWWVV0")),
  ...rep(2, row(7, "0XVVWWWWWVWWWWWVV0")),
  ...rep(2, row(8, "0XVWWWWWVWWWWWV0")),
  row(8, "0llllllllllllll0"),
];

const heavyLower: readonly string[] = [
  ...rep(2, row(8, "0qqWWWWWWWWWWrr0")),
  row(8, "0XWWWWWVVWWWWWV0"),
  row(8, "0XWWWWV00VWWWWV0"),
  ...rep(3, row(8, "0XWWWV0..0WWWWV0")),
  row(8, "0XVWWV0..0VWWWV0"),
  ...rep(3, row(8, "0XWWWV0..0WWWWV0")),
  row(8, "0VVVVV0..0VVVVV0"),
  ...rep(2, row(8, "0111110..0111110")),
  row(9, "z".repeat(15)),
  row(6, "z".repeat(21)),
  row(9, "z".repeat(15)),
  BLANK,
  BLANK,
];

/** The four authored base-body grids, all exactly 32×48. */
export const BODY_GRIDS: Readonly<
  Record<BodyBuildId, Readonly<Record<BodyViewId, PixelGrid>>>
> = {
  lean: {
    front: [...headFront, ...leanTorsoFront, ...leanLower],
    back: [...headBack, ...leanTorsoBack, ...leanLower],
  },
  heavy: {
    front: [...headFront, ...heavyTorsoFront, ...heavyLower],
    back: [...headBack, ...heavyTorsoBack, ...heavyLower],
  },
};

/**
 * Which authored view a facing renders, and whether it mirrors — the
 * same e/s-front, n/w-back scheme the legacy character set uses.
 */
export function bodyViewForFacing(facing: Facing): {
  view: BodyViewId;
  flip: boolean;
} {
  return {
    view: facing === "e" || facing === "s" ? "front" : "back",
    flip: facing === "s" || facing === "w",
  };
}
