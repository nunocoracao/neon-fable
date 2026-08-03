/**
 * Pixel-grid primitives: sprites are authored as arrays of equal-length
 * strings whose characters index the master palette. The pure grid
 * operations (validate, mirror, remap) live here alongside the canvas
 * baking that turns a grid into a crisp, integer-scaled Sprite.
 */
import type { Sprite } from "../sprites";
import { PALETTE, SHADOW, TRANSPARENT } from "./palette";
import { DETAIL_SCALE, doubled, refined } from "./detail";

/** A palette-indexed sprite grid; rows top to bottom, all equal width. */
export type PixelGrid = readonly string[];

/** A palette-character substitution table, as consumed by `remapped`. */
export type ChannelRemap = Readonly<Record<string, string>>;

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
 * Enlarge a grid a whole number of times, each art pixel becoming a
 * factor×factor block. The way anything in this art is drawn larger —
 * a bigger picture is the same picture with bigger pixels, never a
 * second set of drawings. Factors below 2 return the grid unchanged.
 */
export function upscaled(grid: PixelGrid, factor: number): string[] {
  const steps = Math.trunc(factor);
  if (steps <= 1) return [...grid];
  return grid.flatMap((row) => {
    const wide = [...row].map((ch) => ch.repeat(steps)).join("");
    return Array<string>(steps).fill(wide);
  });
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
 * Screen pixels one detail pixel covers. The detail pass (./detail.ts)
 * splits every authored pixel DETAIL_SCALE ways per axis before
 * painting, so the sprite comes out the size it always did — same
 * canvas, same anchor, same place on screen — with that many more
 * pixels inside it. A DETAIL_SCALE that does not divide ART_SCALE would
 * paint on half pixels, so the pass switches itself off rather than
 * blur what it is there to sharpen.
 */
const DETAIL_FITS = ART_SCALE % DETAIL_SCALE === 0;
const PIXEL_SIZE = DETAIL_FITS ? ART_SCALE / DETAIL_SCALE : ART_SCALE;

/** A grid as it is painted: run through the detail pass where it fits. */
function detailed(grid: PixelGrid): PixelGrid {
  return DETAIL_FITS ? refined(grid) : grid;
}

/**
 * Bake a grid onto an offscreen canvas at ART_SCALE. The anchor is given
 * in 1x art pixels and scaled to match. Horizontal same-color runs
 * collapse into single fillRect calls.
 *
 * What lands on the canvas is the grid *after* the detail pass, which
 * is where the extra definition comes from: the canvas is the size the
 * 1x grid has always baked to, and every screen pixel in it is now its
 * own art pixel rather than one quarter of a 2×2 block. Nothing outside
 * this function needs to know — dimensions, anchors, and silhouettes
 * are unchanged.
 *
 * `palette` defaults to the master table; scenes bake through a day
 * phase's tinted palette instead (see ./tint.ts), which is the only way
 * time of day reaches the pixels — there is no runtime filter.
 */
export function bakeSprite(
  grid: PixelGrid,
  anchorX: number,
  anchorY: number,
  palette: Readonly<Record<string, string>> = PALETTE,
): Sprite {
  const width = grid[0]?.length ?? 0;
  const canvas = document.createElement("canvas");
  canvas.width = width * ART_SCALE;
  canvas.height = grid.length * ART_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create 2d context for sprite");
  paintGrid(ctx, detailed(grid), (ch) => palette[ch]);
  return { image: canvas, anchorX: anchorX * ART_SCALE, anchorY: anchorY * ART_SCALE };
}

export { SHADOW };

/**
 * The silhouette of a grid, as a grid: every opaque pixel that is not
 * ground shadow replaced by `fill`, everything else transparent. Pure,
 * so what an outline traces can be checked without a canvas — the
 * shape the hit flash paints is derived here and only painted by
 * bakeSilhouette.
 */
export function silhouetteGrid(grid: PixelGrid, fill = "9"): string[] {
  if (fill.length !== 1 || fill === TRANSPARENT) {
    throw new Error(`silhouette fill must be one opaque character, got "${fill}"`);
  }
  return grid.map((row) =>
    [...row]
      .map((ch) => (ch === TRANSPARENT || ch === SHADOW ? TRANSPARENT : fill))
      .join(""),
  );
}

/** How many pixels a silhouette covers; zero means nothing to trace. */
export function silhouetteArea(grid: PixelGrid): number {
  let area = 0;
  for (const row of grid) {
    for (const ch of row) {
      if (ch !== TRANSPARENT && ch !== SHADOW) area++;
    }
  }
  return area;
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
  // Silhouettes double with the art so a flash traces the same edge the
  // sprite under it paints, but there is nothing in one shape to bevel.
  const shape = silhouetteGrid(grid);
  paintGrid(ctx, DETAIL_FITS ? doubled(shape) : shape, () => color);
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
        x * PIXEL_SIZE,
        y * PIXEL_SIZE,
        (runEnd - x) * PIXEL_SIZE,
        PIXEL_SIZE,
      );
      x = runEnd;
    }
  });
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
 * Expand diamond-interior rows (row i exactly as wide as the diamond
 * mask row) into full-width 64×32 rows padded with transparency.
 * Throws on bad shapes so mis-authored tiles fail at module load.
 */
export function diamond(interior: PixelGrid): string[] {
  if (interior.length !== DIAMOND_WIDTHS.length) {
    throw new Error(
      `diamond needs ${DIAMOND_WIDTHS.length} rows, got ${interior.length}`,
    );
  }
  const full = DIAMOND_WIDTHS.length * 2;
  return interior.map((row, i) => {
    const want = DIAMOND_WIDTHS[i] ?? 0;
    if (row.length !== want) {
      throw new Error(`diamond row ${i} has width ${row.length}, expected ${want}`);
    }
    const pad = (full - want) / 2;
    return TRANSPARENT.repeat(pad) + row + TRANSPARENT.repeat(pad);
  });
}
