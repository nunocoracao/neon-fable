/**
 * Weather — the pure half of the rain state. Which ground tiles pool
 * water, where every streak of the falling curtain is at this instant,
 * when a splash pops, and how a wet surface's neon reflection shimmers:
 * all of it is a function of (map, timeMs) with no wall-clock reads and
 * no canvas, so a rainy scene replays identically and is testable
 * headless. Painting lives in ./weatherPaint.ts; which maps are rainy
 * is content (src/data/maps.ts).
 *
 * Weather is visual only, deliberately. Nothing here is reachable from
 * combat, movement, pathfinding, or narrative code — rain changes what
 * a scene looks like and never what it rolls. Combat arenas inherit the
 * weather of the map the fight was entered from and thin the streaks
 * out (ARENA_STREAK_DENSITY) so the grid stays readable.
 */
import { hash2, pulse01, tilePhaseMs } from "./animation";
import { RAIN_STREAK_ART, streakSlant } from "./art/weather";
import { TILE_ART } from "./art/tiles";
import type { TilePoint } from "./coords";
import type { IsoMap, TileId, WeatherId } from "./tilemap";

/** One parallax curtain of rain, matched to a RAIN_STREAK_ART entry. */
export interface RainLayer {
  /** Fall speed down the screen, in world-screen px per second. */
  speed: number;
  /** Streak lattice spacing in world-screen px; one drop per cell. */
  spacingX: number;
  spacingY: number;
  /** Draw alpha before the per-streak variation. */
  alpha: number;
  /** Fraction of lattice cells that actually carry a drop (0..1). */
  fill: number;
}

/**
 * Two curtains: a dense, dim, quick one far off and a sparser, brighter,
 * slower-reading one up close. Together they give the rain depth without
 * a third of the fill rate a single dense layer would cost.
 */
export const RAIN_LAYERS: readonly RainLayer[] = [
  { speed: 900, spacingX: 34, spacingY: 96, alpha: 0.3, fill: 0.62 },
  { speed: 1250, spacingX: 52, spacingY: 120, alpha: 0.46, fill: 0.7 },
];

/** Streak density in combat arenas: thinned so the grid stays legible. */
export const ARENA_STREAK_DENSITY = 0.4;

/** Share of eligible ground tiles that hold a puddle. */
export const PUDDLE_DENSITY = 0.3;

/** Scheduling window per wet tile; at most one splash lands in each. */
export const SPLASH_PERIOD_MS = 2600;
/** Duration of one splash micro-frame. */
export const SPLASH_FRAME_MS = 90;
/** Share of scheduling windows that actually produce a splash. */
export const SPLASH_CHANCE = 0.35;

/** Period of the reflection shimmer on wet ground. */
export const SHIMMER_PERIOD_MS = 1700;
/** Peak swing of the shimmer, as a fraction of a reflection's alpha. */
export const SHIMMER_AMOUNT = 0.4;

/** Everything a scene needs to paint a weather state. */
export interface WeatherView {
  id: WeatherId;
  /** Streak-density scale: 1 while exploring, lower inside an arena. */
  density: number;
  /** Keys (see tileKey) of the tiles pooling water. */
  puddles: ReadonlySet<string>;
  /** Wet ground that splashes can pop on, in row-major order. */
  splashTiles: readonly TilePoint[];
}

/** Stable map-tile key for the puddle set. */
export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** True if this ground kind can hold water (it registers rain art). */
export function tileHoldsWater(id: TileId): boolean {
  return TILE_ART[id].wet !== undefined;
}

/**
 * Whether a puddle sits on this tile. Seeded from the coordinate alone,
 * so the same corner of the same street is wet every visit — and two
 * maps that happen to share a layout still pool water in the same
 * places, which is what makes a puddle feel like part of the map.
 */
export function puddleAt(x: number, y: number): boolean {
  return (hash2(x + 4001, y + 7919) % 1000) / 1000 < PUDDLE_DENSITY;
}

/** Every tile of a map whose ground kind can hold water. */
export function wetTiles(map: IsoMap): TilePoint[] {
  const tiles: TilePoint[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const id = map.tiles[y]?.[x];
      if (id === undefined || !tileHoldsWater(id)) continue;
      tiles.push({ x, y });
    }
  }
  return tiles;
}

/** The subset of a map's wet ground that actually pools a puddle. */
export function puddleTiles(map: IsoMap): Set<string> {
  const puddles = new Set<string>();
  for (const tile of wetTiles(map)) {
    if (puddleAt(tile.x, tile.y)) puddles.add(tileKey(tile.x, tile.y));
  }
  return puddles;
}

export interface ResolveWeatherOptions {
  /** The player's weather setting; false resolves every map to null. */
  enabled: boolean;
  /**
   * Overrides the map's own weather. Combat arenas pass the weather of
   * the map the fight was entered from — an arena has no sky of its own.
   */
  weather?: WeatherId;
  /** Thins the streaks for combat readability. */
  arena?: boolean;
}

/**
 * The weather a scene should paint, or null for none — clear skies, the
 * setting turned off, or a map whose ground can never take water.
 */
export function resolveWeather(
  map: IsoMap,
  options: ResolveWeatherOptions,
): WeatherView | null {
  const id = options.weather ?? map.weather ?? "clear";
  if (!options.enabled || id === "clear") return null;
  return {
    id,
    density: options.arena ? ARENA_STREAK_DENSITY : 1,
    puddles: puddleTiles(map),
    splashTiles: wetTiles(map),
  };
}

/** One drop of the curtain: a baked streak sprite's top-left corner. */
export interface RainStreak {
  x: number;
  y: number;
  alpha: number;
}

/**
 * How far a layer has fallen at this instant, in world-screen px. Kept
 * separate from the streak field so the parallax drift is testable on
 * its own: it is simply distance = speed × time, with no state.
 */
export function layerFallPx(layer: RainLayer, timeMs: number): number {
  return (Math.max(0, timeMs) / 1000) * layer.speed;
}

/** Positive modulo, for wrapping the lattice around the viewport. */
function wrap(value: number, span: number): number {
  return ((value % span) + span) % span;
}

/**
 * Every streak of one layer covering the viewport at this instant.
 *
 * Drops sit on a scrolling lattice: one cell per (column, absolute
 * row), jittered inside its cell by the cell's own hash so the field
 * reads as random while staying a pure function of timeMs. The lattice
 * travels along the direction the streak art is drawn in (streakSlant),
 * so drops always move the way they lean. `density` scales how many
 * cells carry a drop — arenas pass less than 1 to thin the rain out.
 */
export function rainStreaks(
  layer: RainLayer,
  layerIndex: number,
  timeMs: number,
  viewportW: number,
  viewportH: number,
  density = 1,
): RainStreak[] {
  const streaks: RainStreak[] = [];
  if (viewportW <= 0 || viewportH <= 0 || density <= 0) return streaks;

  const fall = layerFallPx(layer, timeMs);
  const slant = streakSlant(RAIN_STREAK_ART[layerIndex] ?? []);
  // A cell of margin on each side: drops drift in from off-screen
  // rather than appearing at the edge.
  const spanX = viewportW + 2 * layer.spacingX;
  const columns = Math.ceil(spanX / layer.spacingX);
  const rows = Math.ceil(viewportH / layer.spacingY) + 2;
  // Rows scroll a whole cell at a time; the remainder is the smooth
  // sub-cell offset, so a drop never jumps when the lattice recycles.
  const rowShift = Math.floor(fall / layer.spacingY);
  const rowOffset = fall - rowShift * layer.spacingY;
  const keep = Math.min(1, density * layer.fill);

  for (let row = 0; row < rows; row++) {
    // Absolute row index: the drop's identity survives the recycle.
    const cellRow = row - rowShift;
    for (let column = 0; column < columns; column++) {
      const seed = hash2(column, cellRow);
      if ((seed % 1000) / 1000 >= keep) continue;
      const jitterX = ((seed >>> 10) % layer.spacingX) - layer.spacingX / 2;
      const jitterY = ((seed >>> 20) % layer.spacingY) - layer.spacingY / 2;
      const y = row * layer.spacingY + rowOffset + jitterY - layer.spacingY;
      const x =
        wrap(column * layer.spacingX + jitterX + slant * fall, spanX) -
        layer.spacingX;
      streaks.push({
        x,
        y,
        // ±20% per-drop variation so the curtain isn't a flat wash.
        alpha: layer.alpha * (0.8 + 0.4 * (((seed >>> 5) % 100) / 100)),
      });
    }
  }
  return streaks;
}

/**
 * The splash micro-frame showing on a tile right now, or null for none.
 * Each tile gets its own scheduling window (phase-shifted by position,
 * so a street never splashes in unison) and only some windows fire.
 */
export function splashFrameAt(
  x: number,
  y: number,
  timeMs: number,
  frameCount: number,
): number | null {
  if (frameCount <= 0) return null;
  const phase = hash2(x + 31, y + 17) % SPLASH_PERIOD_MS;
  const t = Math.max(0, timeMs) + phase;
  const window = Math.floor(t / SPLASH_PERIOD_MS);
  if ((hash2(window, hash2(x, y)) % 1000) / 1000 >= SPLASH_CHANCE) return null;
  const frame = Math.floor((t - window * SPLASH_PERIOD_MS) / SPLASH_FRAME_MS);
  return frame < frameCount ? frame : null;
}

/** A splash to draw: the tile it lands on and the frame it is showing. */
export interface Splash extends TilePoint {
  frame: number;
}

/** Every splash popping across a weather view's wet ground right now. */
export function activeSplashes(
  weather: WeatherView,
  timeMs: number,
  frameCount: number,
): Splash[] {
  const splashes: Splash[] = [];
  for (const tile of weather.splashTiles) {
    const frame = splashFrameAt(tile.x, tile.y, timeMs, frameCount);
    if (frame !== null) splashes.push({ x: tile.x, y: tile.y, frame });
  }
  return splashes;
}

/**
 * Alpha multiplier for a neon reflection pooling on wet ground: a slow
 * per-tile swing around 1 that makes a reflection breathe on water
 * instead of sitting there as a decal. Phase comes from the tile
 * coordinate, so neighbours shimmer out of step.
 */
export function shimmerFactor(x: number, y: number, timeMs: number): number {
  const phase = tilePhaseMs(x, y, SHIMMER_PERIOD_MS);
  return 1 + SHIMMER_AMOUNT * (2 * pulse01(timeMs + phase, SHIMMER_PERIOD_MS) - 1);
}
