/**
 * Pure animation timing math for the iso scene: frame selection, facing
 * from movement deltas, ambient loops (pulse, neon flicker, water), the
 * deterministic per-tile variant pick, and combat feedback envelopes
 * (attack lunge, hit shake, defeat dissolve). No wall-clock reads —
 * callers pass milliseconds in, so everything here is unit-testable.
 */

/** Iso-space facing: n is up-right on screen, e down-right, s down-left, w up-left. */
export type Facing = "n" | "e" | "s" | "w";

/**
 * The looping movement states: the two sets that play forever off the
 * wall clock. BODY_TIMING covers exactly these.
 */
export type LoopState = "idle" | "walk";

/**
 * Motion state a sprite set is selected from. "attack" and "react" are
 * one-shot sets played by the combat sequencer rather than loops:
 * "attack" is per weapon class (see ./attack), "react" is the receiving
 * end — flinches, shudders, and deaths (see ./reaction).
 */
export type MotionState = LoopState | "attack" | "react";

/**
 * Facing for a movement delta in world tile coordinates (+x = e, +y = s).
 * Returns null for a zero delta; diagonal deltas favor the x axis.
 */
export function facingFromDelta(dx: number, dy: number): Facing | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "e" : "w";
  return dy > 0 ? "s" : "n";
}

/** Looping frame index for a fixed per-frame duration. */
export function frameAt(timeMs: number, frameMs: number, frameCount: number): number {
  if (frameCount <= 1 || frameMs <= 0) return 0;
  const t = Math.max(0, timeMs);
  return Math.floor(t / frameMs) % frameCount;
}

/** Clamp to [0, 1]. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Triangle wave 0→1→0 over the given period; 0 at time 0. */
export function pulse01(timeMs: number, periodMs: number): number {
  if (periodMs <= 0) return 0;
  const phase = (((timeMs % periodMs) + periodMs) % periodMs) / periodMs;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

/**
 * Smoothstep across the unit interval: eased at both ends, quickest
 * through the middle. Set-piece traversals ride this rather than a
 * linear ramp, so something crossing the frame reads as sweeping past —
 * gathering through the middle of its span and easing off at the edges
 * — instead of sliding at one flat rate.
 */
export function smoothStep01(t: number): number {
  const p = clamp01(t);
  return p * p * (3 - 2 * p);
}

/** Deterministic 2D integer hash with well-mixed low bits. */
export function hash2(x: number, y: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Stable variant pick for a tile coordinate; uniform-ish over count. */
export function variantIndex(x: number, y: number, count: number): number {
  if (count <= 1) return 0;
  return hash2(x, y) % count;
}

/**
 * Deterministic per-tile phase offset for tile frame loops (water, glow)
 * so neighboring tiles don't pulse in sync: one of four half-frame steps
 * picked from the tile coordinate.
 */
export function tilePhaseMs(x: number, y: number, frameMs: number): number {
  return (hash2(x, y) % 4) * (frameMs / 2);
}

/**
 * Neon flicker: mostly on, with brief deterministic dropouts. Each seed
 * gets its own pattern; the same (time, seed) always agrees.
 */
export function flickerOn(timeMs: number, seed = 0, slotMs = 90): boolean {
  if (slotMs <= 0) return true;
  const slot = Math.floor(Math.max(0, timeMs) / slotMs);
  return hash2(slot, seed) % 23 > 2;
}

/**
 * Prop frame choice for a placement: flicker props briefly drop to their
 * reserved last frame, otherwise slow loops advance with a per-placement
 * phase offset so copies of a prop don't animate in sync. Shared by the
 * sprite provider and the glow pass so a glow always agrees with the
 * frame its prop is showing.
 */
export function propFrameAt(
  frameCount: number,
  frameMs: number,
  flicker: boolean,
  x: number,
  y: number,
  timeMs: number,
): number {
  if (flicker && !flickerOn(timeMs, hash2(x, y))) return frameCount - 1;
  // Flicker props reserve their last frame for the dropout look.
  const loop = flicker ? frameCount - 1 : frameCount;
  if (loop > 1 && frameMs > 0) {
    const phase = (hash2(x, y) % 7) * 97;
    return frameAt(timeMs + phase, frameMs, loop);
  }
  return 0;
}

/**
 * Attack lunge envelope: 0→1→0 over the duration (peak at the midpoint),
 * 0 outside it. Multiply by a pixel distance toward the target.
 */
export function lunge01(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs <= 0 || elapsedMs >= durationMs) return 0;
  const t = elapsedMs / durationMs;
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

/**
 * Signed horizontal hit-shake offset in pixels: alternates direction
 * every ~33ms and decays to 0 over the duration; 0 outside it.
 */
export function shakeOffsetPx(
  elapsedMs: number,
  durationMs: number,
  magnitudePx: number,
): number {
  if (durationMs <= 0 || elapsedMs < 0 || elapsedMs >= durationMs) return 0;
  const decay = 1 - elapsedMs / durationMs;
  const sign = Math.floor(elapsedMs / 33) % 2 === 0 ? 1 : -1;
  return sign * magnitudePx * decay;
}

/** Defeat dissolve progress 0..1 over the duration (clamped). */
export function dissolve01(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return clamp01(elapsedMs / durationMs);
}

/**
 * Whether the pixel block at (bx, by) has dissolved away at the given
 * progress. Deterministic per block, monotonic in progress.
 */
export function dissolvedAt(progress: number, bx: number, by: number): boolean {
  return (hash2(bx, by) % 997) / 997 < progress;
}

/**
 * Frame timing for the hi-res layered bodies: a six-frame stride
 * (contact, recoil, passing per half) and a four-frame breathing loop
 * at a slow cadence. The vertical bob is baked into the frames
 * themselves, so this replaces the legacy 2-frame bob approach.
 */
export const BODY_TIMING: Readonly<
  Record<LoopState, { frameMs: number; frameCount: number }>
> = {
  idle: { frameMs: 450, frameCount: 4 },
  walk: { frameMs: 110, frameCount: 6 },
};

/** Looping hi-res body frame index for a motion state. */
export function bodyFrameAt(state: LoopState, timeMs: number): number {
  const { frameMs, frameCount } = BODY_TIMING[state];
  return frameAt(timeMs, frameMs, frameCount);
}
