/**
 * Authored density: how fine a grid was actually drawn.
 *
 * Every sprite in this game used to be authored at one resolution — 32×48
 * for a person, 64×32 for a ground tile — and the detail pass (./detail.ts)
 * doubled it on the way to the canvas so each authored pixel could at
 * least differ from its own corners. That is derived detail: four screen
 * pixels, still one decision.
 *
 * A grid may now say it was drawn at the finer resolution instead.
 * Density 1 is the old contract, unchanged and still the default.
 * Density 2 means the same picture, same footprint, same anchor — twice
 * the rows and columns, so the doubling step has nothing to do and the
 * bake goes straight to the bevel. A person at density 2 is a 64×96
 * grid; a ground tile is 128×64. Both bake to exactly the size they
 * always did, which is what makes the two kinds interchangeable
 * everywhere a grid is accepted.
 *
 * ## Units
 *
 * Three units are in play and only one of them is new:
 *
 * - **Authored pixels** — what the artist counts in the grid. Anchors,
 *   glow offsets, hand columns, and every other coordinate an art module
 *   writes down are in *its own* authored pixels.
 * - **1x art pixels** — the shared unit the world is measured in (tile
 *   geometry, glow radii, muzzle offsets). One authored pixel at density
 *   d is 1/d of these.
 * - **Screen pixels** — ART_SCALE of a 1x art pixel.
 *
 * Everything below converts between the first two. Nothing outside this
 * module should multiply a coordinate by 2 to reach the finer grid; ask
 * for it here so the answer stays right when a frame's density changes.
 */
import { doubled } from "./detail";
import type { PixelGrid } from "./pixel";

/** How fine a grid is drawn, as a multiple of the 1x art resolution. */
export type ArtDensity = 1 | 2;

/** Every density a grid may declare, coarse to fine. */
export const ART_DENSITIES: readonly ArtDensity[] = [1, 2];

/** What a grid is authored at when it does not say: the original 1x. */
export const DEFAULT_DENSITY: ArtDensity = 1;

/**
 * Composing, promoting, or validating grids that disagree about how
 * finely they were drawn. Typed rather than a bare Error so callers can
 * tell a density problem from a size problem — which is exactly the
 * confusion a half-migrated character would otherwise produce, where a
 * density-1 layer against a density-2 frame reads as "wrong number of
 * rows" and sends the author looking at the art instead of the shim.
 */
export class DensityMismatchError extends Error {
  readonly expected: ArtDensity;
  readonly found: ArtDensity;

  constructor(what: string, expected: ArtDensity, found: ArtDensity) {
    super(
      `${what} is authored at density ${found}, expected density ${expected}` +
        (found < expected
          ? " — promote it with promotedGrid() or register its density"
          : " — a finer grid cannot be reduced; author the frame at density " +
            String(found)),
    );
    this.name = "DensityMismatchError";
    this.expected = expected;
    this.found = found;
  }
}

/**
 * What a registered art entry says it was drawn at. Entries that say
 * nothing were drawn at 1x, which is every one of them until this
 * migration finishes — so `density` is optional on the art interfaces
 * and read through here rather than defaulted at each call site.
 */
export function densityOf(art: { readonly density?: ArtDensity }): ArtDensity {
  return art.density ?? DEFAULT_DENSITY;
}

/** A length authored at `density`, in 1x art pixels. */
export function inArtPixels(value: number, density: ArtDensity): number {
  return value / density;
}

/** A length in 1x art pixels, in pixels authored at `density`. */
export function atDensity(value: number, density: ArtDensity): number {
  return value * density;
}

/** A length authored at `from`, in pixels authored at `to`. */
export function betweenDensities(
  value: number,
  from: ArtDensity,
  to: ArtDensity,
): number {
  return (value * to) / from;
}

/**
 * The same grid drawn at a finer density, by the detail pass's own
 * edge-aware doubling — the shim that lets a character half-migrated to
 * density 2 still composite. It is not the same thing as art drawn at
 * density 2: the extra pixels are derived, so a promoted layer carries no
 * more decisions than it did before. Promoting to the density a grid
 * already has returns it unchanged; asking for a coarser grid throws,
 * because throwing away half the artist's pixels is never the answer.
 */
export function promotedGrid(
  grid: PixelGrid,
  from: ArtDensity,
  to: ArtDensity,
): PixelGrid {
  if (from === to) return grid;
  if (to < from) throw new DensityMismatchError("grid", to, from);
  return doubled(grid);
}

/** An inclusive row/column span of a frame, in its own authored pixels. */
export interface FrameSpan {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/**
 * The same span at another density. Inclusive bounds mean the far edge
 * is the last pixel *inside* the span, so it stretches to the last
 * sub-pixel of that pixel rather than to the first sub-pixel of the next
 * one — row 14 at density 1 covers rows 28–29 at density 2, not 28.
 */
export function spanAtDensity(
  span: FrameSpan,
  from: ArtDensity,
  to: ArtDensity,
): FrameSpan {
  const scale = to / from;
  return {
    top: span.top * scale,
    bottom: (span.bottom + 1) * scale - 1,
    left: span.left * scale,
    right: (span.right + 1) * scale - 1,
  };
}

/** A run of columns or rows (inclusive) at another density. */
export function rangeAtDensity(
  range: readonly [number, number],
  from: ArtDensity,
  to: ArtDensity,
): [number, number] {
  const scale = to / from;
  return [range[0] * scale, (range[1] + 1) * scale - 1];
}

/**
 * The shared shape of a frame descriptor: how big the frame is and where
 * it stands, in its own authored pixels, plus the density those numbers
 * are counted in. BODY_FRAME, MECH_FRAME, and PORTRAIT_FRAME all satisfy
 * this, which is what lets composition, baking, and the gallery ask one
 * question of any of them.
 */
export interface ArtFrame {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly density: ArtDensity;
}

/** A frame's size and anchor in 1x art pixels, whatever it is drawn at. */
export function frameInArtPixels(frame: ArtFrame): {
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
} {
  return {
    width: inArtPixels(frame.width, frame.density),
    height: inArtPixels(frame.height, frame.density),
    anchorX: inArtPixels(frame.anchorX, frame.density),
    anchorY: inArtPixels(frame.anchorY, frame.density),
  };
}

/**
 * Problems with a grid's declared density, as human-readable strings.
 * A density-2 grid has to cover a whole number of 1x pixels on both
 * axes, or it cannot stand in for the density-1 art it replaces: half a
 * 1x pixel of width is half a screen pixel of footprint.
 */
export function densityErrors(
  grid: PixelGrid,
  density: ArtDensity,
): string[] {
  if (density === 1) return [];
  const errors: string[] = [];
  const width = grid[0]?.length ?? 0;
  if (width % density !== 0) {
    errors.push(`width ${width} is not a multiple of density ${density}`);
  }
  if (grid.length % density !== 0) {
    errors.push(`height ${grid.length} is not a multiple of density ${density}`);
  }
  return errors;
}
