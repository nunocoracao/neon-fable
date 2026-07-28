/**
 * Pixel-grid primitives: sprites are authored as arrays of equal-length
 * strings whose characters index the master palette. The pure grid
 * operations (validate, mirror, remap) live here alongside the canvas
 * baking that turns a grid into a crisp, integer-scaled Sprite.
 */
import type { Sprite } from "../sprites";
import { PALETTE, TRANSPARENT } from "./palette";

/** A palette-indexed sprite grid; rows top to bottom, all equal width. */
export type PixelGrid = readonly string[];

/** Integer scale factor from 1x art pixels to on-screen canvas pixels. */
export const ART_SCALE = 2;

/**
 * Problems with a grid, as human-readable strings; empty means valid.
 * Checked by tests over every registered grid so bad art fails fast.
 */
export function gridErrors(grid: PixelGrid): string[] {
  const errors: string[] = [];
  if (grid.length === 0) {
    errors.push("grid has no rows");
    return errors;
  }
  const width = grid[0]?.length ?? 0;
  grid.forEach((row, y) => {
    if (row.length !== width) {
      errors.push(`row ${y} has width ${row.length}, expected ${width}`);
    }
    for (const ch of row) {
      if (ch !== TRANSPARENT && PALETTE[ch] === undefined) {
        errors.push(`row ${y} uses "${ch}", not in the palette`);
        break;
      }
    }
  });
  return errors;
}

/** Horizontal mirror (e.g. an east-facing sprite becomes south-facing). */
export function mirrored(grid: PixelGrid): string[] {
  return grid.map((row) => [...row].reverse().join(""));
}

/** Substitute palette characters (role recolors share one set of grids). */
export function remapped(
  grid: PixelGrid,
  map: Readonly<Record<string, string>>,
): string[] {
  return grid.map((row) => [...row].map((ch) => map[ch] ?? ch).join(""));
}

/**
 * Shift rows top..bottom (inclusive) horizontally by dx pixels, leaving
 * every other row untouched. Pixels shifted past either edge are lost —
 * callers keep shifted art clear of the frame border. Secondary motion
 * (e.g. long hair trailing on walk frames) derives from this one helper
 * rather than redrawn frames.
 */
export function rowsShifted(
  grid: PixelGrid,
  top: number,
  bottom: number,
  dx: number,
): string[] {
  return grid.map((row, y) => {
    if (y < top || y > bottom || dx === 0) return row;
    const cells = Array<string>(row.length).fill(TRANSPARENT);
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] ?? TRANSPARENT;
      const nx = x + dx;
      if (ch !== TRANSPARENT && nx >= 0 && nx < row.length) cells[nx] = ch;
    }
    return cells.join("");
  });
}

/**
 * Bake a grid onto an offscreen canvas at ART_SCALE. The anchor is given
 * in 1x art pixels and scaled to match. Horizontal same-color runs
 * collapse into single fillRect calls.
 */
export function bakeSprite(
  grid: PixelGrid,
  anchorX: number,
  anchorY: number,
): Sprite {
  const width = grid[0]?.length ?? 0;
  const canvas = document.createElement("canvas");
  canvas.width = width * ART_SCALE;
  canvas.height = grid.length * ART_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create 2d context for sprite");
  paintGrid(ctx, grid, (ch) => PALETTE[ch]);
  return { image: canvas, anchorX: anchorX * ART_SCALE, anchorY: anchorY * ART_SCALE };
}

/**
 * Bake a single-color silhouette of a grid (shadow pixels excluded),
 * used for hit flashes over entity sprites.
 */
export function bakeSilhouette(
  grid: PixelGrid,
  color: string,
  anchorX: number,
  anchorY: number,
): Sprite {
  const width = grid[0]?.length ?? 0;
  const canvas = document.createElement("canvas");
  canvas.width = width * ART_SCALE;
  canvas.height = grid.length * ART_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create 2d context for sprite");
  paintGrid(ctx, grid, (ch) => (ch === "z" ? undefined : color));
  return { image: canvas, anchorX: anchorX * ART_SCALE, anchorY: anchorY * ART_SCALE };
}

/**
 * Approximate memory a baked sprite's backing canvas holds, as RGBA
 * bytes (width × height × 4). Non-canvas image sources (which the pixel
 * provider never produces) count as 0.
 */
export function spriteBytes(sprite: Sprite): number {
  const { width, height } = sprite.image as { width?: unknown; height?: unknown };
  return typeof width === "number" && typeof height === "number"
    ? width * height * 4
    : 0;
}

function paintGrid(
  ctx: CanvasRenderingContext2D,
  grid: PixelGrid,
  colorOf: (ch: string) => string | undefined,
): void {
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x] ?? TRANSPARENT;
      const color = ch === TRANSPARENT ? undefined : colorOf(ch);
      if (color === undefined) {
        x++;
        continue;
      }
      let runEnd = x + 1;
      while (runEnd < row.length && row[runEnd] === ch) runEnd++;
      ctx.fillStyle = color;
      ctx.fillRect(
        x * ART_SCALE,
        y * ART_SCALE,
        (runEnd - x) * ART_SCALE,
        ART_SCALE,
      );
      x = runEnd;
    }
  });
}

/**
 * Nearest-neighbor 2× upscale of a grid: every pixel becomes a 2×2
 * block. Interim shim while art sets are re-authored at v2 native
 * resolution — legacy 1x grids double to the new working size and
 * render pixel-identical at the doubled geometry.
 */
export function upscaled(grid: PixelGrid): string[] {
  const rows: string[] = [];
  for (const row of grid) {
    const doubled = [...row].map((ch) => ch + ch).join("");
    rows.push(doubled, doubled);
  }
  return rows;
}

/**
 * Bring a tile grid to the native v2 64×32 size: grids already
 * re-authored at the hi-res resolution pass through untouched, legacy
 * 32×16 grids get the nearest-neighbor shim until their set is redone.
 */
export function nativeScaled(grid: PixelGrid): PixelGrid {
  return grid.length === DIAMOND_WIDTHS.length ? grid : upscaled(grid);
}

/**
 * Row widths of the 64×32 (1x) tile diamond, top to bottom. This is the
 * exact pixel-ownership mask of screenToTile sampled at each art
 * pixel's on-screen block center, so adjacent tiles tessellate with no
 * gaps and no overlap. Row r owns 4*min(r, 31-r) + 2 pixels.
 */
export const DIAMOND_WIDTHS: readonly number[] = Array.from(
  { length: 32 },
  (_, r) => 4 * Math.min(r, 31 - r) + 2,
);

/**
 * Row widths of the legacy 32×16 diamond, kept so tile art authored
 * before the hi-res migration still expands until it is re-authored
 * natively at 64×32.
 */
export const LEGACY_DIAMOND_WIDTHS: readonly number[] = [
  2, 6, 10, 14, 18, 22, 26, 30, 30, 26, 22, 18, 14, 10, 6, 2,
];

/**
 * Expand diamond-interior rows (row i exactly as wide as the diamond
 * mask row) into full-width rows padded with transparency. Accepts both
 * the native 32-row (64-wide) v2 shape and the legacy 16-row (32-wide)
 * shape. Throws on bad shapes so mis-authored tiles fail at module load.
 */
export function diamond(interior: PixelGrid): string[] {
  const widths =
    interior.length === LEGACY_DIAMOND_WIDTHS.length
      ? LEGACY_DIAMOND_WIDTHS
      : DIAMOND_WIDTHS;
  if (interior.length !== widths.length) {
    throw new Error(
      `diamond needs ${DIAMOND_WIDTHS.length} rows (or ${LEGACY_DIAMOND_WIDTHS.length} legacy), got ${interior.length}`,
    );
  }
  const full = widths.length * 2;
  return interior.map((row, i) => {
    const want = widths[i] ?? 0;
    if (row.length !== want) {
      throw new Error(`diamond row ${i} has width ${row.length}, expected ${want}`);
    }
    const pad = (full - want) / 2;
    return TRANSPARENT.repeat(pad) + row + TRANSPARENT.repeat(pad);
  });
}
