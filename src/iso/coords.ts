/**
 * World<->screen coordinate transforms for 2:1 isometric diamond tiles.
 * World space is tile coordinates (x east-ish, y south-ish); screen space
 * is pixels with the origin at the center of tile (0, 0). All functions
 * are pure so they can be unit-tested without a canvas.
 */

/** Width in pixels of one tile diamond (v2 hi-res: 64×32 art at 2x). */
export const TILE_W = 128;
/** Height in pixels of one tile diamond (2:1 ratio). */
export const TILE_H = 64;

/** A position in tile coordinates. Fractional values are between tiles. */
export interface WorldPoint {
  x: number;
  y: number;
}

/** An integer tile coordinate. */
export interface TilePoint {
  x: number;
  y: number;
}

/** A position in screen pixels (before camera translation). */
export interface ScreenPoint {
  sx: number;
  sy: number;
}

/** Screen position of the center of the diamond for world point (x, y). */
export function worldToScreen(x: number, y: number): ScreenPoint {
  return {
    sx: (x - y) * (TILE_W / 2),
    sy: (x + y) * (TILE_H / 2),
  };
}

/** Exact inverse of worldToScreen; returns fractional world coordinates. */
export function screenToWorld(sx: number, sy: number): WorldPoint {
  return {
    x: sx / TILE_W + sy / TILE_H,
    y: sy / TILE_H - sx / TILE_W,
  };
}

/**
 * The tile whose diamond contains the screen point. Rounding both world
 * axes maps exactly to the diamond centered on that tile, so this is a
 * proper diamond hit test, not a bounding-box one.
 */
export function screenToTile(sx: number, sy: number): TilePoint {
  const world = screenToWorld(sx, sy);
  return { x: Math.round(world.x), y: Math.round(world.y) };
}

/** True if two tile points refer to the same tile. */
export function sameTile(a: TilePoint, b: TilePoint): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Manhattan distance between two tiles. */
export function tileDistance(a: TilePoint, b: TilePoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
