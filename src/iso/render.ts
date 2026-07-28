/**
 * Canvas drawing for the iso scene: ground pass, tile highlights, then a
 * single painter's-order pass over props, interactables, and entities.
 * Stateless — the scene passes everything (including the animation
 * clock) in each frame. Sprites are pixel art: smoothing is disabled and
 * every draw position snaps to whole device pixels so nothing shimmers.
 */
import { pulse01, type Facing } from "./animation";
import { cameraTranslation, snapToPixelGrid, type Camera } from "./camera";
import { TILE_H, TILE_W, worldToScreen, type TilePoint, type WorldPoint } from "./coords";
import { compareDrawables, type Drawable } from "./depth";
import { isWalkable, type IsoMap } from "./tilemap";
import type { EntitySpriteId, Sprite, SpriteProvider } from "./sprites";

export interface SceneEntity {
  spriteId: EntitySpriteId;
  /** Fractional while walking between tiles. */
  position: WorldPoint;
  facing: Facing;
  moving: boolean;
}

export interface RenderView {
  map: IsoMap;
  camera: Camera;
  viewportW: number;
  viewportH: number;
  hoverTile: TilePoint | null;
  /** Remaining tiles of the active walk path, for the path preview. */
  path: readonly TilePoint[];
  entities: readonly SceneEntity[];
  /** Animation clock in milliseconds. */
  timeMs: number;
  /** Device pixel ratio, for whole-device-pixel position snapping. */
  dpr: number;
  /**
   * View zoom (a ZOOM_LEVELS entry). The ctx base transform is already
   * scaled by dpr * zoom, so draws stay in world-screen units and only
   * the snap grid and viewport extents change with it.
   */
  zoom: number;
}

interface SceneDrawable extends Drawable {
  sprite: Sprite;
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteProvider,
  view: RenderView,
): void {
  const { map, camera, viewportW, viewportH, timeMs, dpr, zoom } = view;
  const scale = dpr * zoom;
  ctx.clearRect(0, 0, viewportW / zoom, viewportH / zoom);
  ctx.imageSmoothingEnabled = false;

  ctx.save();
  const { tx, ty } = cameraTranslation(camera, viewportW, viewportH, zoom, dpr);
  ctx.translate(tx, ty);

  // Ground pass: flat tiles never overlap, so simple row order suffices.
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tileId = map.tiles[y]?.[x];
      if (tileId === undefined) continue;
      drawSprite(ctx, sprites.tile(tileId, x, y, timeMs), x, y, scale);
    }
  }

  // Highlights sit on the ground, under all objects.
  // Pulsing marker under every interactable so points of interest read
  // at a glance without hunting with the cursor.
  const markerAlpha = 0.08 + 0.1 * pulse01(timeMs, 1600);
  for (const interactable of map.interactables) {
    drawDiamond(
      ctx,
      interactable,
      `rgba(240, 180, 41, ${markerAlpha.toFixed(3)})`,
      "rgba(240, 180, 41, 0.35)",
    );
  }
  for (const step of view.path) {
    drawDiamond(ctx, step, "rgba(46, 230, 214, 0.18)", null);
  }
  if (view.hoverTile) {
    const { x, y } = view.hoverTile;
    const walkable = isWalkable(map, x, y);
    const interactable = map.interactables.some((i) => i.x === x && i.y === y);
    const color = interactable
      ? "rgba(240, 180, 41, 0.9)"
      : walkable
        ? "rgba(46, 230, 214, 0.9)"
        : "rgba(255, 77, 94, 0.7)";
    drawDiamond(ctx, view.hoverTile, null, color);
  }

  // Object pass: props, interactables, and entities depth-sorted together.
  const drawables: SceneDrawable[] = [
    ...map.props.map((p) => ({
      x: p.x,
      y: p.y,
      layer: "object" as const,
      sprite: sprites.prop(p.propId, p.x, p.y, timeMs),
    })),
    ...map.interactables.map((i) => ({
      x: i.x,
      y: i.y,
      layer: "object" as const,
      sprite: sprites.interactable(i.spriteId, i.x, i.y, timeMs),
    })),
    ...view.entities.map((e) => ({
      x: e.position.x,
      y: e.position.y,
      layer: "object" as const,
      sprite: sprites.entity(e.spriteId, {
        facing: e.facing,
        moving: e.moving,
        timeMs,
      }),
    })),
  ];
  drawables.sort(compareDrawables);
  for (const d of drawables) {
    drawSprite(ctx, d.sprite, d.x, d.y, scale);
  }

  ctx.restore();
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  scale: number,
): void {
  const { sx, sy } = worldToScreen(x, y);
  ctx.drawImage(
    sprite.image,
    snapToPixelGrid(sx - sprite.anchorX, scale),
    snapToPixelGrid(sy - sprite.anchorY, scale),
  );
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  tile: TilePoint,
  fill: string | null,
  stroke: string | null,
): void {
  const { sx, sy } = worldToScreen(tile.x, tile.y);
  ctx.beginPath();
  ctx.moveTo(sx, sy - TILE_H / 2);
  ctx.lineTo(sx + TILE_W / 2, sy);
  ctx.lineTo(sx, sy + TILE_H / 2);
  ctx.lineTo(sx - TILE_W / 2, sy);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
