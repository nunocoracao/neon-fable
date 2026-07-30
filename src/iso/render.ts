/**
 * Canvas drawing for the iso scene: ground pass, tile highlights, then a
 * single painter's-order pass over props, interactables, and entities.
 * Stateless — the scene passes everything (including the animation
 * clock) in each frame. Sprites are pixel art: smoothing is disabled and
 * every draw position snaps to whole device pixels so nothing shimmers.
 */
import { pulse01, type Facing } from "./animation";
import { ART_SCALE } from "./art/pixel";
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
import { setPieceGlows, type SetPieceDraw } from "./setpiece";
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

/**
 * The one interactable the scene is offering this frame: outlined in
 * its own silhouette and named by a chip floating over it. Selection is
 * ./affordance.ts; the color comes from there too, so the accessibility
 * palette reaches the renderer as a value rather than a branch.
 */
export interface FocusView {
  interactableId: string;
  /** Text for the floating chip — the interactable's authored label. */
  label: string;
  /** CSS color for the outline and the chip's border and text. */
  color: string;
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
  /** The one interactable in focus, outlined and named. */
  focus?: FocusView | null;
  /**
   * Ambient machinery on the move this frame — the overline, patrol
   * drones, vented steam. Positions and frames come from the pure pass
   * in ./setpiece.ts; the renderer only folds them into the object sort
   * and the glow pass, which is what keeps them depth-correct with no
   * set-piece-specific code anywhere here.
   */
  setPieces?: readonly SetPieceDraw[];
}

interface SceneDrawable extends Drawable {
  sprite: Sprite;
  /** Silhouette to trace an outline with, on the focused interactable. */
  outline?: Sprite;
  /**
   * Draw displacement from the tile center, in world-screen units, for
   * anything that sorts at a tile but is not standing on it.
   */
  offsetX?: number;
  offsetY?: number;
}

/**
 * Offsets, in world-screen units, the silhouette is stamped at to leave
 * a one-art-pixel rim around a sprite. All eight neighbours, so edges
 * running diagonally (which iso art is mostly made of) come out as
 * solid a line as vertical ones.
 */
const OUTLINE_OFFSETS: readonly (readonly [number, number])[] = [
  [-ART_SCALE, 0],
  [ART_SCALE, 0],
  [0, -ART_SCALE],
  [0, ART_SCALE],
  [-ART_SCALE, -ART_SCALE],
  [ART_SCALE, -ART_SCALE],
  [-ART_SCALE, ART_SCALE],
  [ART_SCALE, ART_SCALE],
];

/**
 * The outline breathes between these alphas rather than sitting flat,
 * starting from the bright end — reduced motion freezes the clock at
 * zero, and an affordance held at its dimmest forever is no affordance.
 */
const OUTLINE_ALPHA_MIN = 0.55;
const OUTLINE_ALPHA_MAX = 1;
const OUTLINE_PULSE_MS = 1400;

/** Floating name chip: gap above the sprite, box metrics, type. */
const CHIP_GAP = 8;
const CHIP_HEIGHT = 22;
const CHIP_PAD_X = 8;
const CHIP_BASELINE = 7;
const CHIP_FONT = "bold 14px 'Courier New', monospace";
const CHIP_BG = "rgba(18, 18, 31, 0.92)";

export function renderScene(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteProvider,
  view: RenderView,
): void {
  const { map, camera, viewportW, viewportH, timeMs, dpr, zoom } = view;
  const weather = view.weather ?? null;
  const focus = view.focus ?? null;
  const setPieces = view.setPieces ?? [];
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
      // Only the one thing in focus is traced, and only while it is:
      // scenery, props, and the crowd have no silhouette asked for.
      outline:
        focus?.interactableId === i.id
          ? sprites.interactableSilhouette(i.spriteId, i.x, i.y, timeMs, focus.color)
          : undefined,
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
    // Set pieces join the same sort as everything else: an overline on
    // a row behind the tenements passes behind them because its row is
    // behind theirs, not because anything here knows what a train is.
    ...setPieces.map((piece) => ({
      x: piece.x,
      y: piece.y,
      layer: "object" as const,
      sprite: sprites.setPiece(piece.spriteId, piece.frame),
      offsetX: piece.offsetX * ART_SCALE,
      offsetY: piece.offsetY * ART_SCALE,
    })),
  ];
  drawables.sort(compareDrawables);
  const outlineAlpha =
    OUTLINE_ALPHA_MAX -
    (OUTLINE_ALPHA_MAX - OUTLINE_ALPHA_MIN) * pulse01(timeMs, OUTLINE_PULSE_MS);
  for (const d of drawables) {
    // The rim is stamped first and the sprite lands on top of it, so
    // what survives is exactly the pixels just outside the shape.
    if (d.outline) {
      ctx.globalAlpha = outlineAlpha;
      for (const [dx, dy] of OUTLINE_OFFSETS) {
        drawSprite(ctx, d.outline, d.x, d.y, scale, dx, dy);
      }
      ctx.globalAlpha = 1;
    }
    drawSprite(ctx, d.sprite, d.x, d.y, scale, d.offsetX ?? 0, d.offsetY ?? 0);
  }

  // Glow pass: emissive light from neon, screens, and their water
  // reflections, composited additively over the whole scene so signage
  // reads as casting light rather than just being bright.
  if (view.glowEnabled) {
    const phase = view.dayPhase ?? DEFAULT_DAY_PHASE;
    const glows = collectGlowPlacements(map, timeMs, weather, phase);
    // A headlamp and a scan cone are lights like any other, just ones
    // that moved since the last frame.
    glows.push(...setPieceGlows(setPieces, phase));
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

  // The name chip rides over everything in the world, glow included:
  // it is a caption on the scene, not a lamp in it.
  if (focus) {
    // The outlined drawable is the focused one, and its sprite's anchor
    // is what says how tall the thing being named stands.
    const drawn = drawables.find((d) => d.outline !== undefined);
    const tile = map.interactables.find((i) => i.id === focus.interactableId);
    if (drawn && tile) {
      drawLabelChip(ctx, drawn.sprite, tile, focus.label, focus.color);
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
  offsetX = 0,
  offsetY = 0,
): void {
  const { sx, sy } = worldToScreen(x, y);
  ctx.drawImage(
    sprite.image,
    snapToPixelGrid(sx - sprite.anchorX, scale) + offsetX,
    snapToPixelGrid(sy - sprite.anchorY, scale) + offsetY,
  );
}

/**
 * The floating name chip over the focused interactable: a hard-edged
 * box in the outline's color, sat just above the top of its sprite.
 * Only ever one on screen — the scene picks a single focus.
 */
function drawLabelChip(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  tile: TilePoint,
  text: string,
  color: string,
): void {
  const { sx, sy } = worldToScreen(tile.x, tile.y);
  ctx.font = CHIP_FONT;
  ctx.textAlign = "center";
  const width = Math.round(Number(ctx.measureText(text).width)) + CHIP_PAD_X * 2;
  const left = Math.round(sx - width / 2);
  const top = Math.round(sy - sprite.anchorY - CHIP_GAP - CHIP_HEIGHT);
  ctx.fillStyle = CHIP_BG;
  ctx.fillRect(left, top, width, CHIP_HEIGHT);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(left + 1, top + 1, width - 2, CHIP_HEIGHT - 2);
  ctx.fillStyle = color;
  ctx.fillText(text, left + width / 2, top + CHIP_HEIGHT - CHIP_BASELINE);
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
