/**
 * Emissive glow sprites for the neon light pass. Art entries register
 * GlowSource metadata next to their grids (props.ts, interactables.ts,
 * tiles.ts); the renderer draws pre-baked radial-falloff sprites with
 * additive compositing after the painter's pass. Baking lives here so
 * the placement logic (../glowPass.ts) stays canvas-free and testable.
 */
import type { Sprite } from "../sprites";
import { PALETTE } from "./palette";
import { ART_SCALE } from "./pixel";

/**
 * One emissive light an art entry casts. Authored in v2 (1x) art
 * pixels; offsets are relative to the sprite's anchor point (the tile
 * diamond center it stands on), +y downward.
 */
export interface GlowSource {
  /** Palette character (a hex entry) the glow tints toward. */
  color: string;
  /** Falloff radius in 1x art pixels. */
  radius: number;
  /** Peak alpha multiplier (0..1] applied over the baked falloff. */
  intensity: number;
  /** Glow center relative to the anchor, in 1x art pixels. */
  offsetX: number;
  offsetY: number;
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
