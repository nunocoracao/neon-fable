/**
 * Weather pixel art: the rain streak sprites (one per parallax layer)
 * and the splash micro-frames that pop where drops land. Authored as
 * palette-indexed grids like every other art set and baked through the
 * sprite provider, so the streaks stay crisp pixel art at any zoom
 * instead of being hairline canvas strokes.
 *
 * Streaks are drawn as a trail behind a falling drop: the top of the
 * grid is the tail, the bottom the head, and the lean of that line is
 * the wind. The motion code never hard-codes that lean — it reads it
 * back off the art with `streakSlant`, so a re-authored streak keeps
 * travelling along its own drawn direction.
 */
import type { PixelGrid } from "./pixel";
import { TRANSPARENT } from "./palette";

/**
 * Far layer: thin, dim, short — the curtain of rain in the distance.
 * Steel-light so it reads against dark pavement without competing with
 * the neon.
 */
const farStreak: PixelGrid = [
  "6..",
  "6..",
  ".6.",
  ".6.",
  ".6.",
  "..6",
  "..6",
  "..6",
];

/**
 * Near layer: longer and brighter, drawn in chrome so the foreground
 * rain reads in front of the far curtain.
 */
const nearStreak: PixelGrid = [
  "8...",
  "8...",
  ".8..",
  ".8..",
  ".8..",
  ".8..",
  "..8.",
  "..8.",
  "..8.",
  "...8",
  "...8",
  "...8",
];

/** One streak sprite per parallax layer, far to near. */
export const RAIN_STREAK_ART: readonly PixelGrid[] = [farStreak, nearStreak];

/**
 * Splash micro-frames: an impact glint that opens into a ripple ring
 * and fades as it widens. Flattened 2:1 like everything else that sits
 * on the ground, and dimming frame by frame (9 -> 8 -> 7) so the ripple
 * reads as losing energy.
 */
const splashFrames: readonly PixelGrid[] = [
  [
    "........",
    "........",
    "...99...",
    "........",
    "........",
  ],
  [
    "........",
    "..8888..",
    ".8....8.",
    "..8888..",
    "........",
  ],
  [
    "........",
    "..7..7..",
    "7......7",
    "..7..7..",
    "........",
  ],
];

export const SPLASH_ART: readonly PixelGrid[] = splashFrames;

/** Splash grids are anchored on the tile diamond's center. */
export const SPLASH_ANCHOR_X = 4;
export const SPLASH_ANCHOR_Y = 2;

/** The first painted column of a grid row, or -1 for an empty row. */
function paintedColumn(row: string): number {
  for (let x = 0; x < row.length; x++) {
    if (row[x] !== TRANSPARENT) return x;
  }
  return -1;
}

/**
 * Horizontal drift per pixel of fall, read back off a streak grid: the
 * lean between its topmost and bottommost painted pixel. Rain travels
 * along this so the drops move in the direction they are drawn.
 */
export function streakSlant(grid: PixelGrid): number {
  let top = -1;
  let topX = 0;
  let bottom = -1;
  let bottomX = 0;
  grid.forEach((row, y) => {
    const x = paintedColumn(row);
    if (x < 0) return;
    if (top < 0) {
      top = y;
      topX = x;
    }
    bottom = y;
    bottomX = x;
  });
  if (top < 0 || bottom === top) return 0;
  return (bottomX - topX) / (bottom - top);
}
