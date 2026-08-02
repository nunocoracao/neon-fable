/**
 * Canvas drawing for the iso scene: ground pass, tile highlights, then a
 * single painter's-order pass over props, interactables, and entities.
 * Stateless — the scene passes everything (including the animation
 * clock) in each frame. Sprites are pixel art: smoothing is disabled and
 * every draw position snaps to whole device pixels so nothing shimmers.
 *
 * Every pass is culled against the viewport first (see ./cull.ts): a
 * district is roughly twice the area the widest zoom shows, so half of
 * each walk over the map used to end in a draw for pixels nobody could
 * see. Culling is by the sprite's own box and inclusive at the edges —
 * the error always falls on the side of drawing.
 */
import { pulse01, type Facing } from "./animation";
import { ART_SCALE } from "./art/pixel";
import { cameraTranslation, snapToPixelGrid, type Camera } from "./camera";
import { TILE_H, TILE_W, worldToScreen, type TilePoint, type WorldPoint } from "./coords";
import { spriteVisible, tileRowSpan, tileVisible, viewBounds } from "./cull";
import { compareDrawables, type Drawable } from "./depth";
import { collectGlowPlacements, glowVisible } from "./glowPass";
import type { RenderCounters } from "./perf";
import {
  DEFAULT_DAY_PHASE,
  isWalkable,
  type DayPhaseId,
  type IsoMap,
} from "./tilemap";
import type { EntitySpriteId, Sprite, SpriteProvider } from "./sprites";
import { setPieceGlows, type SetPieceDraw } from "./setpiece";
import { tickerWindow, type TickerDraw } from "./ticker";
import {
  DEFAULT_TELEGRAPH_PALETTE,
  TELEGRAPH_PAINT_ORDER,
  highlightColors,
  markerFill,
  telegraphStyle,
  type TelegraphPaletteId,
  type TelegraphTintId,
} from "./telegraphPalette";
import { tileKey, type WeatherView } from "./weather";
import { paintRainStreaks, paintSplashes } from "./weatherPaint";

export interface SceneEntity {
  spriteId: EntitySpriteId;
  /** Fractional while walking between tiles. */
  position: WorldPoint;
  facing: Facing;
  moving: boolean;
}

/**
 * One tile the scene tints, in a telegraph role. The palette is the
 * combat grid's (see ./telegraphPalette.ts) and so is the meaning of
 * each role, which is the point: ground a patrol is holding reads on a
 * street exactly the way ground an ability will land on reads in an
 * arena, in the same colours, with the same fill and dash separating
 * them for anybody who cannot use the colours.
 */
export interface SceneTint {
  x: number;
  y: number;
  tint: TelegraphTintId;
}

/**
 * What the scene reports to whoever is watching the map this frame:
 * where the player is stood, and the clock the report is made against.
 * Shaped exactly like the speaker frame — the scene knows positions,
 * and what any of them *mean* is the shell's business.
 */
export interface SceneWatchFrame {
  /** The scene's real clock in milliseconds, reduced motion or not. */
  timeMs: number;
  playerTile: TilePoint;
  /** Whether the player is mid-walk. */
  moving: boolean;
}

/**
 * What the shell hands back for the scene to draw: figures that are not
 * on the map's own furniture (a patrol), and the ground they are
 * holding. Null means there is nothing watching this map, which is
 * every map most of the time.
 */
export interface SceneWatchView {
  entities: readonly SceneEntity[];
  tints: readonly SceneTint[];
}

export type SceneWatchSource = (frame: SceneWatchFrame) => SceneWatchView | null;

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
  /**
   * The public screens and what each is showing this frame, from the
   * pure pass in ./ticker.ts. A screen is a caption on the prop it is
   * mounted on: it sorts at that prop's tile and paints after it, and
   * the scroll is a moving window copied out of one baked strip rather
   * than anything re-baked per frame.
   */
  tickers?: readonly TickerDraw[];
  /**
   * Tinted ground: the tiles a patrol is holding, drawn under every
   * object on the map. Batched one fill and one stroke per role, in the
   * palette's own paint order, exactly as the arena does it.
   */
  tints?: readonly SceneTint[];
  /** Which telegraph palette the tints are painted from. */
  telegraphPalette?: TelegraphPaletteId;
  /**
   * Dev instrumentation: a counter record the frame fills in as it
   * paints (see ./perf.ts). Absent in the game, which is the point —
   * measuring costs nothing when nobody is looking.
   */
  counters?: RenderCounters;
}

interface SceneDrawable extends Drawable {
  sprite: Sprite;
  /**
   * Copy only this slice of the sprite, in world-screen units from its
   * own top-left corner — how a ticker shows a moving window into one
   * baked headline without a second bake.
   */
  clip?: { sourceX: number; sourceW: number };
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
  const counters = view.counters;
  const scale = dpr * zoom;
  const bounds = viewBounds(camera, viewportW, viewportH, zoom);
  ctx.clearRect(0, 0, viewportW / zoom, viewportH / zoom);
  ctx.imageSmoothingEnabled = false;

  ctx.save();
  const { tx, ty } = cameraTranslation(camera, viewportW, viewportH, zoom, dpr);
  ctx.translate(tx, ty);

  // Ground pass: flat tiles never overlap, so simple row order suffices.
  // Each row's visible span is solved in closed form rather than tested
  // tile by tile (see tileRowSpan) — off-screen rows cost one test.
  // Under rain, tiles the weather marked as pooling water swap to their
  // puddle variant — same texture, water added.
  for (let y = 0; y < map.height; y++) {
    const span = tileRowSpan(bounds, y, map.width);
    if (!span) {
      if (counters) counters.groundCulled += map.width;
      continue;
    }
    if (counters) counters.groundCulled += map.width - (span.to - span.from + 1);
    for (let x = span.from; x <= span.to; x++) {
      const tileId = map.tiles[y]?.[x];
      if (tileId === undefined) continue;
      const wet = weather?.puddles.has(tileKey(x, y)) === true;
      drawSprite(ctx, sprites.tile(tileId, x, y, timeMs, wet), x, y, scale);
      if (counters) {
        counters.groundDrawn++;
        counters.draws++;
      }
    }
  }

  // Splashes land on the ground, under the highlights and every object.
  if (weather) {
    const splashes = paintSplashes(ctx, sprites, weather, timeMs, scale);
    if (counters) counters.draws += splashes;
  }

  const palette = view.telegraphPalette ?? DEFAULT_TELEGRAPH_PALETTE;
  // Ground somebody else is holding, under everything that stands on it.
  paintTints(ctx, view.tints ?? [], palette);

  // Exit affordance: every interactable that leads off the map gets the
  // same lit ring laid in its tile, so a way out reads identically
  // whether it is a door, a stair, or a tram arch. The ones already
  // drawn as the marker itself skip it rather than double-painting.
  for (const exit of map.interactables) {
    if (!exit.exit || exit.spriteId === "exit") continue;
    const ring = sprites.interactable("exit", exit.x, exit.y, timeMs);
    if (!spriteVisible(bounds, ring, exit.x, exit.y)) continue;
    drawSprite(ctx, ring, exit.x, exit.y, scale);
    if (counters) counters.draws++;
  }

  // Highlights sit on the ground, under all objects. Every colour on
  // this layer comes out of the same palette as the telegraph tints, so
  // the colourblind-assist option repaints the whole ground layer.
  const marks = highlightColors(palette);
  // Pulsing marker under every interactable so points of interest read
  // at a glance without hunting with the cursor.
  const markerAlpha = 0.08 + 0.1 * pulse01(timeMs, 1600);
  for (const interactable of map.interactables) {
    if (!tileVisible(bounds, interactable.x, interactable.y)) continue;
    drawDiamond(
      ctx,
      interactable,
      markerFill(marks, markerAlpha),
      marks.markerOutline,
    );
  }
  for (const step of view.path) {
    if (!tileVisible(bounds, step.x, step.y)) continue;
    drawDiamond(ctx, step, marks.pathStep, null);
  }
  if (view.hoverTile) {
    const { x, y } = view.hoverTile;
    const walkable = isWalkable(map, x, y);
    const interactable = map.interactables.some((i) => i.x === x && i.y === y);
    const color = interactable
      ? marks.hoverInteractable
      : walkable
        ? marks.hoverWalkable
        : marks.hoverBlocked;
    drawDiamond(ctx, view.hoverTile, null, color);
  }

  // Object pass: props, interactables, and entities depth-sorted
  // together. Built by appending rather than by concatenating five
  // mapped arrays — the offscreen half never enters the list at all, so
  // the sort is over what is actually on screen.
  const drawables: SceneDrawable[] = [];
  /** The focused drawable, kept as it is appended so the name chip
   * needs no second search over the list. */
  let focused: SceneDrawable | null = null;
  const keep = (drawable: SceneDrawable): boolean => {
    const visible = spriteVisible(
      bounds,
      drawable.sprite,
      drawable.x,
      drawable.y,
      drawable.offsetX ?? 0,
      drawable.offsetY ?? 0,
    );
    if (!visible) {
      if (counters) counters.objectsCulled++;
      return false;
    }
    drawables.push(drawable);
    return true;
  };

  for (const prop of map.props) {
    keep({
      x: prop.x,
      y: prop.y,
      layer: "object",
      sprite: sprites.prop(prop.propId, prop.x, prop.y, timeMs),
    });
  }
  for (const i of map.interactables) {
    const drawable: SceneDrawable = {
      x: i.x,
      y: i.y,
      layer: "object",
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
    };
    if (keep(drawable) && drawable.outline) focused = drawable;
  }
  for (const e of view.entities) {
    keep({
      x: e.position.x,
      y: e.position.y,
      layer: "object",
      sprite: sprites.entity(e.spriteId, {
        facing: e.facing,
        moving: e.moving,
        timeMs,
      }),
    });
  }
  // Set pieces join the same sort as everything else: an overline on a
  // row behind the tenements passes behind them because its row is
  // behind theirs, not because anything here knows what a train is.
  for (const piece of setPieces) {
    keep({
      x: piece.x,
      y: piece.y,
      layer: "object",
      sprite: sprites.setPiece(piece.spriteId, piece.frame),
      offsetX: piece.offsetX * ART_SCALE,
      offsetY: piece.offsetY * ART_SCALE,
    });
  }
  // Appended last, so a screen ties with the prop it is mounted on and —
  // the sort being stable — lands on top of it.
  for (const ticker of tickerDrawables(sprites, view.tickers ?? [])) {
    keep(ticker);
  }
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
    drawSprite(
      ctx,
      d.sprite,
      d.x,
      d.y,
      scale,
      d.offsetX ?? 0,
      d.offsetY ?? 0,
      d.clip,
    );
    if (counters) {
      counters.objectsDrawn++;
      counters.draws++;
    }
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
      // Culled last, at the draw rather than at the source: what an
      // off-screen glow costs is one box test against a placement that
      // already exists, and what it saves is an additive fill over a
      // sprite the size of the light itself — much the most expensive
      // draw in the frame.
      for (const glow of glows) {
        if (!glowVisible(bounds, glow)) {
          if (counters) counters.glowsCulled++;
          continue;
        }
        const sprite = sprites.glow(glow.color, glow.radius);
        const { sx, sy } = worldToScreen(glow.x, glow.y);
        ctx.globalAlpha = glow.alpha;
        ctx.drawImage(
          sprite.image,
          snapToPixelGrid(sx + glow.offsetX - sprite.anchorX, scale),
          snapToPixelGrid(sy + glow.offsetY - sprite.anchorY, scale),
        );
        if (counters) {
          counters.glowsDrawn++;
          counters.draws++;
        }
      }
      ctx.restore();
    }
  }

  // The name chip rides over everything in the world, glow included:
  // it is a caption on the scene, not a lamp in it.
  if (focus && focused) {
    // The outlined drawable is the focused one, and its sprite's anchor
    // is what says how tall the thing being named stands.
    const tile = map.interactables.find((i) => i.id === focus.interactableId);
    if (tile) {
      drawLabelChip(ctx, focused.sprite, tile, focus.label, focus.color);
    }
  }

  ctx.restore();

  // Rain falls in front of the camera, not on the world: the curtain is
  // screen-space, so it is drawn after the camera translation is undone.
  if (weather) {
    const streaks = paintRainStreaks(
      ctx,
      sprites,
      weather,
      timeMs,
      viewportW / zoom,
      viewportH / zoom,
      scale,
    );
    if (counters) counters.draws += streaks;
  }
}

/**
 * One drawable per screen showing something: the baked strip, clipped
 * to the readable window and displaced to where the window sits over
 * its prop. Everything is multiplied up from the 1x art pixels the
 * ticker logic works in, so the copy lands on whole art pixels and the
 * glyphs stay as crisp as the sprite beside them.
 */
function tickerDrawables(
  sprites: SpriteProvider,
  tickers: readonly TickerDraw[],
): SceneDrawable[] {
  const drawables: SceneDrawable[] = [];
  for (const ticker of tickers) {
    const bake = sprites.newsText?.(ticker.text, ticker.screen.tint);
    if (!bake) continue;
    const slice = tickerWindow(
      ticker.offsetPx,
      ticker.textPx,
      ticker.screen.width,
    );
    if (!slice) continue;
    drawables.push({
      x: ticker.screen.x,
      y: ticker.screen.y,
      layer: "object",
      sprite: bake,
      clip: {
        sourceX: slice.sourceX * ART_SCALE,
        sourceW: slice.sourceW * ART_SCALE,
      },
      offsetX: (ticker.screen.offsetX + slice.destX) * ART_SCALE,
      offsetY: ticker.screen.offsetY * ART_SCALE,
    });
  }
  return drawables;
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  scale: number,
  offsetX = 0,
  offsetY = 0,
  clip?: { sourceX: number; sourceW: number },
): void {
  const { sx, sy } = worldToScreen(x, y);
  const left = snapToPixelGrid(sx - sprite.anchorX, scale) + offsetX;
  const top = snapToPixelGrid(sy - sprite.anchorY, scale) + offsetY;
  if (clip) {
    // A clipped draw is copied 1:1 — same size in as out — so a
    // windowed strip is exactly as crisp as an unwindowed sprite.
    const height = spriteHeight(sprite);
    if (height <= 0 || clip.sourceW <= 0) return;
    ctx.drawImage(
      sprite.image,
      clip.sourceX,
      0,
      clip.sourceW,
      height,
      left,
      top,
      clip.sourceW,
      height,
    );
    return;
  }
  ctx.drawImage(sprite.image, left, top);
}

/** Pixel height of a baked sprite, whatever kind of image source it is. */
function spriteHeight(sprite: Sprite): number {
  const image = sprite.image as { height?: number };
  return typeof image.height === "number" ? image.height : 0;
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

/**
 * The tint layer: every tinted tile as a diamond on the ground, one
 * batch per role — all of a role's diamonds in a single path taking a
 * single fill and a single stroke, so a whole vision cone costs two
 * draws rather than two per tile. Paint order is the palette's, so the
 * context roles never bury the hot ones sitting inside them.
 */
function paintTints(
  ctx: CanvasRenderingContext2D,
  tints: readonly SceneTint[],
  palette: TelegraphPaletteId,
): void {
  if (tints.length === 0) return;
  const byTint = new Map<TelegraphTintId, SceneTint[]>();
  for (const tile of tints) {
    const batch = byTint.get(tile.tint);
    if (batch) batch.push(tile);
    else byTint.set(tile.tint, [tile]);
  }
  for (const tint of TELEGRAPH_PAINT_ORDER) {
    const batch = byTint.get(tint);
    if (!batch || batch.length === 0) continue;
    const style = telegraphStyle(tint, palette);
    ctx.beginPath();
    for (const tile of batch) traceDiamond(ctx, tile);
    if (style.fill) {
      ctx.fillStyle = style.fill;
      ctx.fill();
    }
    if (style.stroke) {
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.lineWidth;
      ctx.setLineDash([...style.dash]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

/** Adds one tile's diamond to the current path. */
function traceDiamond(ctx: CanvasRenderingContext2D, tile: TilePoint): void {
  const { sx, sy } = worldToScreen(tile.x, tile.y);
  ctx.moveTo(sx, sy - TILE_H / 2);
  ctx.lineTo(sx + TILE_W / 2, sy);
  ctx.lineTo(sx, sy + TILE_H / 2);
  ctx.lineTo(sx - TILE_W / 2, sy);
  ctx.closePath();
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  tile: TilePoint,
  fill: string | null,
  stroke: string | null,
): void {
  ctx.beginPath();
  traceDiamond(ctx, tile);
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
