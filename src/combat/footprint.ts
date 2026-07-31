import type { GridPosition, GridSize } from "./types";

/**
 * Footprints: how much of the arena floor a combatant is standing on.
 *
 * Everything that fights used to be one tile, and the grid rules said so
 * — a position was a tile, occupancy was an equality test, and distance
 * was the Manhattan gap between two points. A security chassis that
 * covers a 2×2 block breaks all three, and it breaks them for anything
 * else that is ever bigger than a person too, so the answer is a field
 * rather than a special case: `Combatant.footprint` says how many tiles
 * wide and deep a body is, absent means the one tile it always was, and
 * every rule downstream reads the block instead of the point.
 *
 * ## The anchor is the corner, not the middle
 *
 * `position` is the block's minimum x and minimum y. A 2×2 body at
 * (6, 2) occupies (6,2), (7,2), (6,3), (7,3). Keeping the anchor at a
 * real tile means a move is still a move to a tile, an even-sided
 * footprint needs no half coordinates, and every existing serialized
 * position stays exactly as valid as it was.
 *
 * ## Distance is measured between blocks
 *
 * The gap between two bodies is the smallest Manhattan distance between
 * any tile of one and any tile of the other — so a melee reach of 1 means
 * "pressed against the chassis anywhere along it", which is what a player
 * looking at the board expects. For axis-aligned boxes that minimum has a
 * closed form (the per-axis separation, summed), so nothing here has to
 * enumerate tiles to answer a range question.
 *
 * All pure grid math, like ./grid.ts and ./area.ts: the engine, the
 * legal-option queries, the telegraph, and the AI all read these, so
 * what the player is shown and what the fight resolves cannot drift.
 */

/** What everything on the board is, until content says otherwise. */
export const SINGLE_TILE: GridSize = { width: 1, height: 1 };

/** Anything with a place on the grid and, maybe, a size on it. */
export interface FootprintBody {
  readonly position: GridPosition;
  readonly footprint?: GridSize | undefined;
}

/** At least one tile in each direction, whole tiles only. */
function normalize(size: GridSize | undefined): GridSize {
  if (!size) return SINGLE_TILE;
  const width = Math.max(1, Math.trunc(size.width));
  const height = Math.max(1, Math.trunc(size.height));
  return width === 1 && height === 1 ? SINGLE_TILE : { width, height };
}

/** The block a body covers; a missing or nonsense footprint is one tile. */
export function footprintOf(body: FootprintBody): GridSize {
  return normalize(body.footprint);
}

/** True when a body covers more than the single tile it is anchored on. */
export function isMultiTile(body: FootprintBody): boolean {
  const { width, height } = footprintOf(body);
  return width > 1 || height > 1;
}

/** Every tile of a block, row-major from its anchor corner. */
export function footprintTiles(
  anchor: GridPosition,
  footprint: GridSize | undefined,
): GridPosition[] {
  const { width, height } = normalize(footprint);
  const tiles: GridPosition[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      tiles.push({ x: anchor.x + dx, y: anchor.y + dy });
    }
  }
  return tiles;
}

/** Every tile a body is standing on. */
export function bodyTiles(body: FootprintBody): GridPosition[] {
  return footprintTiles(body.position, body.footprint);
}

/** True when the block anchored here covers the tile. */
export function footprintCovers(
  anchor: GridPosition,
  footprint: GridSize | undefined,
  tile: GridPosition,
): boolean {
  const { width, height } = normalize(footprint);
  return (
    tile.x >= anchor.x &&
    tile.x < anchor.x + width &&
    tile.y >= anchor.y &&
    tile.y < anchor.y + height
  );
}

/** True when a body is standing on the tile. */
export function bodyCovers(body: FootprintBody, tile: GridPosition): boolean {
  return footprintCovers(body.position, body.footprint, tile);
}

/**
 * True when the whole block is on the grid. A body half off the arena is
 * not a body standing at the edge — it is an illegal position, which is
 * why every move check asks this rather than bounds-checking the anchor.
 */
export function footprintFits(
  grid: GridSize,
  anchor: GridPosition,
  footprint: GridSize | undefined,
): boolean {
  if (!Number.isInteger(anchor.x) || !Number.isInteger(anchor.y)) return false;
  const { width, height } = normalize(footprint);
  return (
    anchor.x >= 0 &&
    anchor.y >= 0 &&
    anchor.x + width <= grid.width &&
    anchor.y + height <= grid.height
  );
}

/** Separation of two spans on one axis; 0 when they overlap or touch. */
function axisGap(
  aMin: number,
  aSize: number,
  bMin: number,
  bSize: number,
): number {
  return Math.max(0, aMin - (bMin + bSize - 1), bMin - (aMin + aSize - 1));
}

/**
 * The smallest Manhattan distance between any tile of one block and any
 * tile of the other; 0 when they touch or overlap. For two single tiles
 * this is exactly `manhattan`, which is what keeps every existing range
 * number meaning what it always meant.
 */
export function footprintGap(
  a: GridPosition,
  aFootprint: GridSize | undefined,
  b: GridPosition,
  bFootprint: GridSize | undefined,
): number {
  const one = normalize(aFootprint);
  const two = normalize(bFootprint);
  return (
    axisGap(a.x, one.width, b.x, two.width) +
    axisGap(a.y, one.height, b.y, two.height)
  );
}

/** The reach between two bodies: block to block, nearest tiles. */
export function bodyGap(a: FootprintBody, b: FootprintBody): number {
  return footprintGap(a.position, a.footprint, b.position, b.footprint);
}

/** The reach from a body to one tile: nearest occupied tile to it. */
export function tileGap(body: FootprintBody, tile: GridPosition): number {
  return footprintGap(body.position, body.footprint, tile, SINGLE_TILE);
}

/** True when two blocks share any tile. */
export function footprintsOverlap(
  a: GridPosition,
  aFootprint: GridSize | undefined,
  b: GridPosition,
  bFootprint: GridSize | undefined,
): boolean {
  return footprintGap(a, aFootprint, b, bFootprint) === 0;
}

/** True when two bodies would be standing on each other. */
export function bodiesOverlap(a: FootprintBody, b: FootprintBody): boolean {
  return bodyGap(a, b) === 0;
}

/**
 * Where a block's middle is, in fractional tile coordinates. Nothing in
 * the engine needs it — a rule only ever asks about tiles — but the
 * renderer draws one sprite over the whole block and depth-sorts it
 * there, so the point lives beside the rest of the footprint math rather
 * than being re-derived in the scene.
 */
export function footprintCenter(
  anchor: GridPosition,
  footprint: GridSize | undefined,
): { x: number; y: number } {
  const { width, height } = normalize(footprint);
  return { x: anchor.x + (width - 1) / 2, y: anchor.y + (height - 1) / 2 };
}
