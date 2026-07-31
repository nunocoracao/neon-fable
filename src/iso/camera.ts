/**
 * Camera math for the iso scene. The camera stores the world-space
 * screen point that appears at the center of the viewport; panning moves
 * it and clamping keeps the map on screen. Pure so it can be tested.
 */
import {
  TILE_H,
  TILE_W,
  worldToScreen,
  type ScreenPoint,
  type TilePoint,
} from "./coords";
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

/**
 * The camera that frames a tile: centered on it, then clamped into the
 * map so framing something near an edge never shows the void past it.
 * The one follow rule — arriving somewhere, and following whoever is
 * acting mid-fight, are the same question asked twice.
 */
export function focusCamera(
  map: IsoMap,
  focus: TilePoint,
  viewportW: number,
  viewportH: number,
  zoom = 1,
  margin: number = CAMERA_MARGIN,
): Camera {
  return clampCamera(
    worldToScreen(focus.x, focus.y),
    mapPixelBounds(map),
    viewportW / zoom,
    viewportH / zoom,
    margin,
  );
}

/**
 * The camera a scene opens on: centered on the tile the player stands
 * on and clamped into the map, so the very first frame after arriving
 * is already settled. Computed once the viewport is measured — starting
 * elsewhere and correcting later is exactly the jump this avoids.
 */
export function initialCamera(
  map: IsoMap,
  focus: TilePoint,
  viewportW: number,
  viewportH: number,
  zoom = 1,
  margin: number = CAMERA_MARGIN,
): Camera {
  return focusCamera(map, focus, viewportW, viewportH, zoom, margin);
}

/**
 * A camera `t` of the way from one to another (t clamped to [0, 1]).
 * The move itself is unshaped — callers ease `t` before they get here,
 * so the same lerp serves every kind of glide.
 */
export function lerpCamera(from: Camera, to: Camera, t: number): Camera {
  const k = Math.min(1, Math.max(0, t));
  return {
    sx: from.sx + (to.sx - from.sx) * k,
    sy: from.sy + (to.sy - from.sy) * k,
  };
}

/** Screen-space distance between two camera points. */
export function cameraDistance(from: Camera, to: Camera): number {
  return Math.hypot(to.sx - from.sx, to.sy - from.sy);
}

// --- Zoomed view math --------------------------------------------------
// The canvas transform is scale = dpr * zoom, so one world-screen unit
// covers `scale` device pixels. Everything below is pure so picking and
// snapping can be tested without a canvas.

/**
 * Round a world-screen value onto the grid of whole device pixels for a
 * combined scale (dpr * zoom). Multiples of 1/scale land on exact device
 * pixels, which is what kills shimmer during scrolls.
 */
export function snapToPixelGrid(value: number, scale: number): number {
  return Math.round(value * scale) / scale;
}

export interface CameraTranslation {
  tx: number;
  ty: number;
}

/**
 * The pre-scale canvas translation that puts the camera point at the
 * viewport center, snapped to whole device pixels. viewportW/H are CSS
 * pixels; the result is in world-screen units (the ctx is already
 * scaled by dpr * zoom when it is applied).
 */
export function cameraTranslation(
  camera: Camera,
  viewportW: number,
  viewportH: number,
  zoom: number,
  dpr: number,
): CameraTranslation {
  const scale = dpr * zoom;
  return {
    tx: snapToPixelGrid(viewportW / (2 * zoom) - camera.sx, scale),
    ty: snapToPixelGrid(viewportH / (2 * zoom) - camera.sy, scale),
  };
}

/** The world-screen point under a viewport (CSS pixel) point. */
export function viewportToWorld(
  camera: Camera,
  viewportW: number,
  viewportH: number,
  zoom: number,
  cssX: number,
  cssY: number,
): ScreenPoint {
  return {
    sx: (cssX - viewportW / 2) / zoom + camera.sx,
    sy: (cssY - viewportH / 2) / zoom + camera.sy,
  };
}

/** Where a world-screen point lands in viewport CSS pixels. */
export function worldToViewport(
  camera: Camera,
  viewportW: number,
  viewportH: number,
  zoom: number,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return {
    x: (sx - camera.sx) * zoom + viewportW / 2,
    y: (sy - camera.sy) * zoom + viewportH / 2,
  };
}
