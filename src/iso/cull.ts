/**
 * View-bounds culling for the iso scene: which of the things the scene
 * *could* draw actually land inside the viewport this frame.
 *
 * The renderer walks whole maps — every tile, every prop, every glow —
 * and at the widest zoom a district is roughly twice the area the
 * viewport shows, so about half of that walk used to end in a draw call
 * for pixels nobody could see. Everything here is pure geometry in
 * world-screen units (the space `worldToScreen` returns, before the
 * camera translation), so the rules are unit-testable without a canvas
 * and the renderer stays a painter.
 *
 * The one invariant that matters: **nothing visible may ever be
 * culled**. Every test below is inclusive at the edges and every bound
 * is the sprite's real box or a deliberate over-estimate of it, so the
 * error is always in the direction of drawing something that turns out
 * to be one pixel off screen.
 */
import type { Camera } from "./camera";
import { TILE_H, TILE_W, worldToScreen } from "./coords";
import type { Sprite } from "./sprites";

/** An axis-aligned rectangle in world-screen units. */
export interface ViewBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Slack added around the viewport, in world-screen units. It covers the
 * two ways a draw can land outside its own box: the camera translation
 * is snapped onto whole device pixels (see `cameraTranslation`), which
 * shifts the world by up to half a device pixel against the unsnapped
 * camera point, and the focus outline is stamped one art pixel
 * (ART_SCALE) beyond the silhouette it traces. Four units clears both at
 * every zoom and costs at most a rim of tiles.
 */
export const CULL_PAD = 4;

/**
 * The world-screen rectangle the viewport shows. viewportW/H are CSS
 * pixels, so a higher zoom spans proportionally fewer world units.
 */
export function viewBounds(
  camera: Camera,
  viewportW: number,
  viewportH: number,
  zoom: number,
  pad: number = CULL_PAD,
): ViewBounds {
  const halfW = viewportW / (2 * zoom) + pad;
  const halfH = viewportH / (2 * zoom) + pad;
  return {
    minX: camera.sx - halfW,
    maxX: camera.sx + halfW,
    minY: camera.sy - halfH,
    maxY: camera.sy + halfH,
  };
}

/** The same bounds grown by a margin on each axis. */
export function expandBounds(
  bounds: ViewBounds,
  padX: number,
  padY: number,
): ViewBounds {
  return {
    minX: bounds.minX - padX,
    maxX: bounds.maxX + padX,
    minY: bounds.minY - padY,
    maxY: bounds.maxY + padY,
  };
}

/** Whether a world-screen rectangle touches the view at all. */
export function rectVisible(
  bounds: ViewBounds,
  left: number,
  top: number,
  width: number,
  height: number,
): boolean {
  return (
    left <= bounds.maxX &&
    left + width >= bounds.minX &&
    top <= bounds.maxY &&
    top + height >= bounds.minY
  );
}

/** Whether a box centered on a world-screen point touches the view. */
export function boxVisible(
  bounds: ViewBounds,
  centerX: number,
  centerY: number,
  halfW: number,
  halfH: number,
): boolean {
  return rectVisible(
    bounds,
    centerX - halfW,
    centerY - halfH,
    halfW * 2,
    halfH * 2,
  );
}

/**
 * Whether the ground diamond of tile (x, y) touches the view. Ground
 * art is exactly one 64×32 (1x) diamond anchored on its center — pinned
 * by cull.test.ts — so the tile's own extents are its sprite's.
 */
export function tileVisible(bounds: ViewBounds, x: number, y: number): boolean {
  const { sx, sy } = worldToScreen(x, y);
  return boxVisible(bounds, sx, sy, TILE_W / 2, TILE_H / 2);
}

/** An inclusive run of tile x-coordinates within one map row. */
export interface RowSpan {
  from: number;
  to: number;
}

/**
 * The inclusive x range of row `y` whose tiles can touch the view, or
 * null when the row is entirely off screen — the ground pass's whole
 * culling rule, in closed form.
 *
 * Inverting the iso transform per row rather than testing each tile is
 * what makes it free: a tile is visible when `(x - y)` and `(x + y)` are
 * each inside an interval the bounds fix, and intersecting those two
 * intervals with [0, width) is the answer.
 */
export function tileRowSpan(
  bounds: ViewBounds,
  y: number,
  mapWidth: number,
): RowSpan | null {
  const halfW = TILE_W / 2;
  const halfH = TILE_H / 2;
  // sx = (x - y) * halfW must land within halfW of the x bounds.
  const minDiff = (bounds.minX - halfW) / halfW;
  const maxDiff = (bounds.maxX + halfW) / halfW;
  // sy = (x + y) * halfH must land within halfH of the y bounds.
  const minSum = (bounds.minY - halfH) / halfH;
  const maxSum = (bounds.maxY + halfH) / halfH;
  const from = Math.max(0, Math.ceil(Math.max(y + minDiff, minSum - y)));
  const to = Math.min(mapWidth - 1, Math.floor(Math.min(y + maxDiff, maxSum - y)));
  return from > to ? null : { from, to };
}

/**
 * Whether a baked sprite drawn at a world position touches the view.
 * Exact: the box is the sprite's own pixels, placed by its anchor the
 * same way the renderer places them. A sprite whose image reports no
 * size (never the pixel provider's, but the contract allows any
 * CanvasImageSource) counts as visible rather than being guessed at.
 */
export function spriteVisible(
  bounds: ViewBounds,
  sprite: Sprite,
  x: number,
  y: number,
  offsetX = 0,
  offsetY = 0,
): boolean {
  const image = sprite.image as { width?: unknown; height?: unknown };
  if (typeof image.width !== "number" || typeof image.height !== "number") {
    return true;
  }
  const { sx, sy } = worldToScreen(x, y);
  return rectVisible(
    bounds,
    sx - sprite.anchorX + offsetX,
    sy - sprite.anchorY + offsetY,
    image.width,
    image.height,
  );
}
