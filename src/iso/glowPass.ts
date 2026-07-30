/**
 * Pure placement logic for the emissive glow pass: which glows are lit
 * this frame and where they land, in world tiles plus screen-pixel
 * offsets. Glow metadata is authored on the art entries (GlowSource);
 * the renderer draws the resulting placements additively with baked
 * radial sprites. No canvas here — everything is unit-testable.
 */
import { propFrameAt } from "./animation";
import type { GlowSource } from "./art/glow";
import { INTERACTABLE_ART } from "./art/interactables";
import { ART_SCALE } from "./art/pixel";
import { PROP_ART } from "./art/props";
import { TILE_ART } from "./art/tiles";
import { glowIntensityScale } from "./dayPhase";
import { DEFAULT_DAY_PHASE, type DayPhaseId, type IsoMap } from "./tilemap";
import { shimmerFactor, tileKey } from "./weather";

/** One glow sprite to draw: world tile plus a screen-pixel offset. */
export interface GlowPlacement {
  x: number;
  y: number;
  /** Screen-pixel offset from the tile diamond center. */
  offsetX: number;
  offsetY: number;
  /** Palette character of the baked glow sprite. */
  color: string;
  /** Falloff radius in 1x art pixels (the bake cache key). */
  radius: number;
  /** Draw alpha over the baked falloff. */
  alpha: number;
}

/** How far (Chebyshev tiles) a glow reaches reflective ground. */
export const REFLECTION_RANGE = 2;
/** Reflection alpha factor by tile distance; unlisted distances get none. */
export const REFLECTION_ALPHA: readonly number[] = [0, 0.4, 0.22];
/** Reflections shrink relative to their source glow. */
export const REFLECTION_RADIUS_FACTOR = 0.75;
/** Reflections sink into the surface, in 1x art pixels. */
export const REFLECTION_SINK = 2;

/**
 * Whether a prop's glow is lit on the given frame: flicker props go
 * dark with their reserved dropout (last) frame, everything else is
 * always lit.
 */
export function glowLitAtFrame(
  frameCount: number,
  flicker: boolean,
  frame: number,
): boolean {
  return !flicker || frame < frameCount - 1;
}

/**
 * An authored glow placed on a tile. `liftX`/`liftY` (1x art pixels)
 * displace it further, which is how something drawn off its own tile —
 * a train riding above the rooflines, a hovering drone — casts its
 * light from where it actually is (see ./setpiece.ts).
 */
export function glowPlacement(
  source: GlowSource,
  x: number,
  y: number,
  intensity: number,
  liftX = 0,
  liftY = 0,
): GlowPlacement {
  return {
    x,
    y,
    offsetX: (source.offsetX + liftX) * ART_SCALE,
    offsetY: (source.offsetY + liftY) * ART_SCALE,
    color: source.color,
    radius: source.radius,
    // The hour scales every emissive alpha: neon reads harder against a
    // late-night street and gives way to the sky at dusk.
    alpha: Math.min(1, source.intensity * intensity),
  };
}

function toPlacement(
  source: GlowSource,
  x: number,
  y: number,
  intensity: number,
): GlowPlacement {
  return glowPlacement(source, x, y, intensity);
}

/**
 * Faint offset copies of an object glow pooled onto nearby reflective
 * tiles (canal water, and puddles while it rains) — a pre-authored
 * accent, not a lighting model. Under rain every reflection also
 * shimmers, on the same machinery: the alpha is just modulated per tile.
 */
function reflectionsOf(
  map: IsoMap,
  glow: GlowPlacement,
  timeMs: number,
  weather: WeatherGlow | null,
): GlowPlacement[] {
  const reflections: GlowPlacement[] = [];
  for (let dy = -REFLECTION_RANGE; dy <= REFLECTION_RANGE; dy++) {
    for (let dx = -REFLECTION_RANGE; dx <= REFLECTION_RANGE; dx++) {
      const tx = glow.x + dx;
      const ty = glow.y + dy;
      const id = map.tiles[ty]?.[tx];
      if (id === undefined) continue;
      const puddle = weather?.puddles.has(tileKey(tx, ty)) === true;
      if (!TILE_ART[id].reflective && !puddle) continue;
      const factor = REFLECTION_ALPHA[Math.max(Math.abs(dx), Math.abs(dy))];
      if (!factor) continue;
      const shimmer = weather ? shimmerFactor(tx, ty, timeMs) : 1;
      reflections.push({
        x: tx,
        y: ty,
        offsetX: 0,
        offsetY: REFLECTION_SINK * ART_SCALE,
        color: glow.color,
        radius: Math.round(glow.radius * REFLECTION_RADIUS_FACTOR),
        alpha: glow.alpha * factor * shimmer,
      });
    }
  }
  return reflections;
}

/**
 * Wet ground the glow pass should treat as reflective: the puddles of
 * an active weather view (see ./weather.ts). Passing one also turns on
 * the per-tile reflection shimmer.
 */
export interface WeatherGlow {
  puddles: ReadonlySet<string>;
}

/**
 * Every glow to draw this frame: tile glows, lit prop glows (following
 * the same frame choice the sprite provider makes, so flicker dropouts
 * kill the light too), interactable glows, and water reflections of the
 * prop/interactable glows — pooling on puddles too when it rains.
 *
 * `phase` is the hour the scene plays at: it scales every emissive
 * alpha (see ./dayPhase.ts), leaving placement, color, and radius —
 * everything authored — exactly where the art put them.
 */
export function collectGlowPlacements(
  map: IsoMap,
  timeMs: number,
  weather: WeatherGlow | null = null,
  phase: DayPhaseId = DEFAULT_DAY_PHASE,
): GlowPlacement[] {
  const placements: GlowPlacement[] = [];
  const objectGlows: GlowPlacement[] = [];
  const intensity = glowIntensityScale(phase);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const id = map.tiles[y]?.[x];
      if (id === undefined) continue;
      for (const source of TILE_ART[id].glow ?? []) {
        placements.push(toPlacement(source, x, y, intensity));
      }
    }
  }

  for (const prop of map.props) {
    const art = PROP_ART[prop.propId];
    if (!art.glow) continue;
    const frame = propFrameAt(
      art.frames.length,
      art.frameMs,
      art.flicker,
      prop.x,
      prop.y,
      timeMs,
    );
    if (!glowLitAtFrame(art.frames.length, art.flicker, frame)) continue;
    for (const source of art.glow) {
      objectGlows.push(toPlacement(source, prop.x, prop.y, intensity));
    }
  }

  for (const interactable of map.interactables) {
    if (interactable.spriteId === "npc") continue;
    const art = INTERACTABLE_ART[interactable.spriteId];
    for (const source of art.glow ?? []) {
      objectGlows.push(
        toPlacement(source, interactable.x, interactable.y, intensity),
      );
    }
  }

  placements.push(...objectGlows);
  for (const glow of objectGlows) {
    placements.push(...reflectionsOf(map, glow, timeMs, weather));
  }
  return placements;
}
