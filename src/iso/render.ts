/**
 * Canvas drawing for the iso scene: ground pass, tile highlights, then a
 * single painter's-order pass over props, interactables, and entities.
 * Stateless — the scene passes everything in each frame.
 */
import type { Camera } from "./camera";
import { TILE_H, TILE_W, worldToScreen, type TilePoint, type WorldPoint } from "./coords";
import { compareDrawables, type Drawable } from "./depth";
import { isWalkable, type IsoMap } from "./tilemap";
import type { Sprite, SpriteProvider } from "./sprites";

export interface SceneEntity {
  spriteId: "player";
  /** Fractional while walking between tiles. */
  position: WorldPoint;
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
}

interface SceneDrawable extends Drawable {
  sprite: Sprite;
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteProvider,
  view: RenderView,
): void {
  const { map, camera, viewportW, viewportH } = view;
  ctx.clearRect(0, 0, viewportW, viewportH);

  ctx.save();
  ctx.translate(
    Math.round(viewportW / 2 - camera.sx),
    Math.round(viewportH / 2 - camera.sy),
  );

  // Ground pass: flat tiles never overlap, so simple row order suffices.
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tileId = map.tiles[y]?.[x];
      if (tileId === undefined) continue;
      drawSprite(ctx, sprites.tile(tileId), x, y);
    }
  }

  // Highlights sit on the ground, under all objects.
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
      sprite: sprites.prop(p.propId),
    })),
    ...map.interactables.map((i) => ({
      x: i.x,
      y: i.y,
      layer: "object" as const,
      sprite: sprites.interactable(i.spriteId),
    })),
    ...view.entities.map((e) => ({
      x: e.position.x,
      y: e.position.y,
      layer: "object" as const,
      sprite: sprites.entity(e.spriteId),
    })),
  ];
  drawables.sort(compareDrawables);
  for (const d of drawables) {
    drawSprite(ctx, d.sprite, d.x, d.y);
  }

  ctx.restore();
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
): void {
  const { sx, sy } = worldToScreen(x, y);
  ctx.drawImage(sprite.image, Math.round(sx - sprite.anchorX), Math.round(sy - sprite.anchorY));
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
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
