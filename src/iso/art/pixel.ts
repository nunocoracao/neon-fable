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
 * Row widths of the 32×16 (1x) tile diamond, top to bottom. This is the
 * exact pixel-ownership mask of screenToTile, so adjacent tiles
 * tessellate with no gaps and no overlap.
 */
export const DIAMOND_WIDTHS: readonly number[] = [
  2, 6, 10, 14, 18, 22, 26, 30, 30, 26, 22, 18, 14, 10, 6, 2,
];

/**
 * Expand diamond-interior rows (row i exactly DIAMOND_WIDTHS[i] chars)
 * into full 32-wide rows padded with transparency. Throws on bad shapes
 * so mis-authored tiles fail at module load.
 */
export function diamond(interior: PixelGrid): string[] {
  if (interior.length !== DIAMOND_WIDTHS.length) {
    throw new Error(`diamond needs ${DIAMOND_WIDTHS.length} rows, got ${interior.length}`);
  }
  return interior.map((row, i) => {
    const want = DIAMOND_WIDTHS[i] ?? 0;
    if (row.length !== want) {
      throw new Error(`diamond row ${i} has width ${row.length}, expected ${want}`);
    }
    const pad = (32 - want) / 2;
    return TRANSPARENT.repeat(pad) + row + TRANSPARENT.repeat(pad);
  });
}
