/**
 * Pure state for the creation wizard's live character preview: facing
 * rotation, idle/walk toggle, and the fixed crisp zoom ladder. No DOM
 * and no wall-clock — the preview panel (./appearancePreview) renders
 * whatever this state says, so all of it is unit-testable.
 */
import type { Facing, LoopState } from "../iso/animation";
import { ART_SCALE } from "../iso/art/pixel";

/**
 * Facing cycle for rotate-right, one quarter turn per step. In iso
 * world space (+x = e, +y = s) the character spins clockwise when seen
 * from above: s → w → n → e.
 */
export const PREVIEW_FACINGS: readonly Facing[] = ["s", "w", "n", "e"];

/**
 * Zoom ladder in CSS pixels per 1x art pixel. The canvas backing store
 * is baked at ART_SCALE, so every level must be an integer multiple of
 * ART_SCALE for the CSS upscale to stay whole-pixel crisp.
 */
export const PREVIEW_ZOOM_LEVELS: readonly number[] = [4, 6, 8];

export interface PreviewState {
  facing: Facing;
  motion: LoopState;
  /** CSS pixels per art pixel; one of PREVIEW_ZOOM_LEVELS. */
  zoom: number;
}

export const DEFAULT_PREVIEW_STATE: PreviewState = {
  facing: "s",
  motion: "idle",
  zoom: 6,
};

/** Human label for a facing, for captions and control aria text. */
export function facingLabel(facing: Facing): string {
  switch (facing) {
    case "s":
      return "front left";
    case "e":
      return "front right";
    case "n":
      return "back right";
    case "w":
      return "back left";
  }
}

/**
 * Rotate by quarter turns; positive steps spin clockwise through
 * PREVIEW_FACINGS. Any integer step wraps.
 */
export function rotateFacing(state: PreviewState, step: number): PreviewState {
  const count = PREVIEW_FACINGS.length;
  const index = Math.max(0, PREVIEW_FACINGS.indexOf(state.facing));
  const next = PREVIEW_FACINGS[(((index + step) % count) + count) % count];
  return next ? { ...state, facing: next } : state;
}

/** Flip between the idle and walk animation loops. */
export function toggleMotion(state: PreviewState): PreviewState {
  return { ...state, motion: state.motion === "idle" ? "walk" : "idle" };
}

/** Snap an arbitrary zoom to the nearest ladder level (ties go low). */
export function clampPreviewZoom(zoom: number): number {
  let best = PREVIEW_ZOOM_LEVELS[0] ?? ART_SCALE;
  for (const level of PREVIEW_ZOOM_LEVELS) {
    if (Math.abs(level - zoom) < Math.abs(best - zoom)) best = level;
  }
  return best;
}

/** Step along the zoom ladder; clamps at both ends. */
export function stepPreviewZoom(
  state: PreviewState,
  direction: 1 | -1,
): PreviewState {
  const index = PREVIEW_ZOOM_LEVELS.indexOf(clampPreviewZoom(state.zoom));
  const next =
    PREVIEW_ZOOM_LEVELS[
      Math.min(PREVIEW_ZOOM_LEVELS.length - 1, Math.max(0, index + direction))
    ];
  return next === undefined ? state : { ...state, zoom: next };
}

/** Largest crisp zoom on the ladder — the review step's full-size render. */
export function maxPreviewZoom(): number {
  return PREVIEW_ZOOM_LEVELS[PREVIEW_ZOOM_LEVELS.length - 1] ?? ART_SCALE;
}

/** How long the review showcase holds each facing before turning. */
export const SHOWCASE_FACING_MS = 2400;

/**
 * The facing the review showcase's slow spin shows at a moment: one
 * quarter turn clockwise through PREVIEW_FACINGS every holdMs. Pure
 * over the clock, so a frozen clock (reduced motion) holds the front.
 */
export function showcaseFacing(
  timeMs: number,
  holdMs: number = SHOWCASE_FACING_MS,
): Facing {
  const index =
    Math.floor(Math.max(0, timeMs) / holdMs) % PREVIEW_FACINGS.length;
  return PREVIEW_FACINGS[index] ?? "s";
}

/** Zoom readout relative to the game's native on-screen scale ("×2"). */
export function previewZoomLabel(zoom: number): string {
  const factor = clampPreviewZoom(zoom) / ART_SCALE;
  return `×${Number.isInteger(factor) ? factor : factor.toFixed(1)}`;
}
