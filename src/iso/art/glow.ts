/**
 * Emissive glow sprites for the neon light pass. Art entries register
 * GlowSource metadata next to their grids (props.ts, interactables.ts,
 * tiles.ts); the renderer draws pre-baked radial-falloff sprites with
 * additive compositing after the painter's pass. Baking lives here so
 * the placement logic (../glowPass.ts) stays canvas-free and testable.
 */
import type { Sprite } from "../sprites";
import {
  DEFAULT_DENSITY,
  inArtPixels,
  type ArtDensity,
} from "./density";
import { PALETTE } from "./palette";
import { ART_SCALE } from "./pixel";

/**
 * One emissive light an art entry casts. Authored in the entry's own
 * pixels — the artist points at the lamp in the grid in front of them —
 * so a density-2 entry writes density-2 numbers here and
 * glowInArtPixels converts them once, at the boundary. Offsets are
 * relative to the sprite's anchor point (the tile diamond center it
 * stands on), +y downward.
 */
export interface GlowSource {
  /** Palette character (a hex entry) the glow tints toward. */
  color: string;
  /** Falloff radius in the declaring entry's authored pixels. */
  radius: number;
  /** Peak alpha multiplier (0..1] applied over the baked falloff. */
  intensity: number;
  /** Glow center relative to the anchor, in authored pixels. */
  offsetX: number;
  offsetY: number;
}

/**
 * A glow as the placement pass reads it: 1x art pixels, whatever the
 * entry that declared it was drawn at. Light is a world quantity — a
 * lamp reaches as far as it reaches — so the pass measures in the unit
 * the world is measured in, and the conversion happens here rather than
 * in every art module that ever gets re-authored.
 *
 * Radii and offsets round to whole 1x pixels: a radius sizes a baked
 * canvas, and half a pixel of falloff is not a light anybody can see.
 */
export function glowInArtPixels(
  source: GlowSource,
  density: ArtDensity,
): GlowSource {
  if (density === DEFAULT_DENSITY) return source;
  return {
    ...source,
    radius: Math.max(1, Math.round(inArtPixels(source.radius, density))),
    offsetX: Math.round(inArtPixels(source.offsetX, density)),
    offsetY: Math.round(inArtPixels(source.offsetY, density)),
  };
}

/**
 * Every glow an entry casts, in 1x art pixels. Art drawn at 1x — which
 * is all of it during the migration — gets its own list back rather than
 * a copy: this runs per lit piece per frame, and converting nothing was
 * not worth an allocation.
 */
export function glowsInArtPixels(
  sources: readonly GlowSource[] | undefined,
  density: ArtDensity,
): readonly GlowSource[] | undefined {
  if (!sources || density === DEFAULT_DENSITY) return sources;
  return sources.map((source) => glowInArtPixels(source, density));
}

/**
 * Radial falloff of a baked glow: [position, alpha] gradient stops.
 * A soft center (not full alpha) keeps additive stacking from blowing
 * out characters standing inside several glows.
 */
export const GLOW_FALLOFF: ReadonlyArray<readonly [number, number]> = [
  [0, 0.6],
  [0.35, 0.28],
  [0.7, 0.1],
  [1, 0],
];

/** "#rrggbb" to an rgba() string with the given alpha. */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Bake one glow sprite: a radial gradient in the palette color with the
 * standard falloff, anchored at its center. Cached by the provider like
 * every other bake (one canvas per distinct color+radius).
 */
export function bakeGlow(color: string, radius: number): Sprite {
  const hex = PALETTE[color];
  if (!hex || !hex.startsWith("#")) {
    throw new Error(`Glow color "${color}" is not a hex palette entry`);
  }
  const size = radius * 2 * ART_SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create 2d context for glow sprite");
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  for (const [stop, alpha] of GLOW_FALLOFF) {
    gradient.addColorStop(stop, hexToRgba(hex, alpha));
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return { image: canvas, anchorX: half, anchorY: half };
}
