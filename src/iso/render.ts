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
import { collectGlowPlacements } from "./glowPass";
import {
  DEFAULT_DAY_PHASE,
  isWalkable,
  type DayPhaseId,
  type IsoMap,
} from "./tilemap";
import type { EntitySpriteId, Sprite, SpriteProvider } from "./sprites";
import { tileKey, type WeatherView } from "./weather";
import { paintRainStreaks, paintSplashes } from "./weatherPaint";

export interface SceneEntity {
  spriteId: EntitySpriteId;
  /** Fractional while walking between tiles. */
  position: WorldPoint;
  facing: Facing;
  moving: boolean;
}

/** An interactable part-way through its way-opening art this frame. */
export interface OpeningView {
  interactableId: string;
  /** 0 shut, 1 wide open — see ./transition.ts. */
  open01: number;
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
  /** Draw the additive neon glow pass (the settings toggle). */
  glowEnabled: boolean;
  /**
   * Active weather, or null/absent for clear skies (also what the
   * settings toggle resolves to when weather effects are off). Purely a
   * look — see src/iso/weather.ts.
   */
  weather?: WeatherView | null;
  /**
   * The hour the scene plays at; absent means night. The tint itself is
   * already baked into the sprites the provider hands back — all the
   * renderer does with the phase is scale the glow pass.
   */
  dayPhase?: DayPhaseId;
  /** The one interactable mid-opening, if any. */
  opening?: OpeningView | null;
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
  const weather = view.weather ?? null;
  const scale = dpr * zoom;
  ctx.clearRect(0, 0, viewportW / zoom, viewportH / zoom);
  ctx.imageSmoothingEnabled = false;

  ctx.save();
  const { tx, ty } = cameraTranslation(camera, viewportW, viewportH, zoom, dpr);
  ctx.translate(tx, ty);

  // Ground pass: flat tiles never overlap, so simple row order suffices.
  // Under rain, tiles the weather marked as pooling water swap to their
  // puddle variant — same texture, water added.
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tileId = map.tiles[y]?.[x];
      if (tileId === undefined) continue;
      const wet = weather?.puddles.has(tileKey(x, y)) === true;
      drawSprite(ctx, sprites.tile(tileId, x, y, timeMs, wet), x, y, scale);
    }
  }

  // Splashes land on the ground, under the highlights and every object.
  if (weather) paintSplashes(ctx, sprites, weather, timeMs, scale);

  // Exit affordance: every interactable that leads off the map gets the
  // same lit ring laid in its tile, so a way out reads identically
  // whether it is a door, a stair, or a tram arch. The ones already
  // drawn as the marker itself skip it rather than double-painting.
  for (const exit of map.interactables) {
    if (!exit.exit || exit.spriteId === "exit") continue;
    drawSprite(
      ctx,
      sprites.interactable("exit", exit.x, exit.y, timeMs),
      exit.x,
      exit.y,
      scale,
    );
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
      sprite: sprites.interactable(
        i.spriteId,
        i.x,
        i.y,
        timeMs,
        view.opening?.interactableId === i.id ? view.opening.open01 : 0,
      ),
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

  // Glow pass: emissive light from neon, screens, and their water
  // reflections, composited additively over the whole scene so signage
  // reads as casting light rather than just being bright.
  if (view.glowEnabled) {
    const glows = collectGlowPlacements(
      map,
      timeMs,
      weather,
      view.dayPhase ?? DEFAULT_DAY_PHASE,
    );
    if (glows.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const glow of glows) {
        const sprite = sprites.glow(glow.color, glow.radius);
        const { sx, sy } = worldToScreen(glow.x, glow.y);
        ctx.globalAlpha = glow.alpha;
        ctx.drawImage(
          sprite.image,
          snapToPixelGrid(sx + glow.offsetX - sprite.anchorX, scale),
          snapToPixelGrid(sy + glow.offsetY - sprite.anchorY, scale),
        );
      }
      ctx.restore();
    }
  }

  ctx.restore();

  // Rain falls in front of the camera, not on the world: the curtain is
  // screen-space, so it is drawn after the camera translation is undone.
  if (weather) {
    paintRainStreaks(
      ctx,
      sprites,
      weather,
      timeMs,
      viewportW / zoom,
      viewportH / zoom,
      scale,
    );
  }
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
