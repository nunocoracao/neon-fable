/**
 * Camera math for the iso scene. The camera stores the world-space
 * screen point that appears at the center of the viewport; panning moves
 * it and clamping keeps the map on screen. Pure so it can be tested.
 */
import { TILE_H, TILE_W, worldToScreen } from "./coords";
import type { IsoMap } from "./tilemap";

export interface Camera {
  /** Screen-space point (see coords.ts) centered in the viewport. */
  sx: number;
  sy: number;
}

export interface PixelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Extra pixels around the map kept reachable when panning. */
export const CAMERA_MARGIN = TILE_H * 2;

/** Screen-space bounding box of every tile diamond in the map. */
export function mapPixelBounds(map: IsoMap): PixelBounds {
  const west = worldToScreen(0, map.height - 1);
  const east = worldToScreen(map.width - 1, 0);
  const north = worldToScreen(0, 0);
  const south = worldToScreen(map.width - 1, map.height - 1);
  return {
    minX: west.sx - TILE_W / 2,
    maxX: east.sx + TILE_W / 2,
    minY: north.sy - TILE_H / 2,
    maxY: south.sy + TILE_H / 2,
  };
}

function clampAxis(value: number, min: number, max: number, viewport: number): number {
  const lo = min + viewport / 2;
  const hi = max - viewport / 2;
  // Map smaller than the viewport on this axis: lock to its center.
  if (lo >= hi) return (min + max) / 2;
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Clamp a camera so the viewport stays within the map bounds (plus
 * margin); axes where the map is smaller than the viewport center it.
 */
export function clampCamera(
  camera: Camera,
  bounds: PixelBounds,
  viewportW: number,
  viewportH: number,
  margin: number = CAMERA_MARGIN,
): Camera {
  return {
    sx: clampAxis(camera.sx, bounds.minX - margin, bounds.maxX + margin, viewportW),
    sy: clampAxis(camera.sy, bounds.minY - margin, bounds.maxY + margin, viewportH),
  };
}
