/**
 * Pure timing for doorways and map transitions: the open/hold/close
 * envelope a door or exit iris plays, and the phase machine a move
 * between maps runs through (door → cover → hold → reveal). Same shape
 * as the combat feedback envelopes in ./animation — no wall-clock reads,
 * callers pass elapsed milliseconds in, so every beat is unit-testable.
 *
 * Reduced motion collapses both: doors stop animating and the cover
 * never darkens, which leaves a plain cut with the destination's name
 * held on screen long enough to read.
 */
import { clamp01 } from "./animation";

// --- Doorways ----------------------------------------------------------

/** How long a door spends opening, standing open, and closing again. */
export interface DoorTiming {
  openMs: number;
  holdMs: number;
  closeMs: number;
}

/** Brisk enough to read as a door, short enough to never feel like a wait. */
export const DOOR_TIMING: DoorTiming = { openMs: 260, holdMs: 240, closeMs: 260 };

/** Reduced motion: the door is simply open when you use it. */
export const DOOR_CUT: DoorTiming = { openMs: 0, holdMs: 0, closeMs: 0 };

export function doorTiming(reducedMotion: boolean): DoorTiming {
  return reducedMotion ? DOOR_CUT : DOOR_TIMING;
}

/** Total length of one open-hold-close cycle. */
export function doorCycleMs(timing: DoorTiming): number {
  return timing.openMs + timing.holdMs + timing.closeMs;
}

/**
 * How far open a door is at a point in its cycle: 0 shut, 1 wide open.
 * Ramps up over openMs, stands open for holdMs, falls back over
 * closeMs, and reads 0 on either side of the cycle.
 */
export function doorOpen01(elapsedMs: number, timing: DoorTiming): number {
  const { openMs, holdMs, closeMs } = timing;
  if (elapsedMs <= 0) return 0;
  if (elapsedMs < openMs) return clamp01(elapsedMs / openMs);
  const shutStart = openMs + holdMs;
  if (elapsedMs < shutStart) return 1;
  if (closeMs <= 0 || elapsedMs >= shutStart + closeMs) return 0;
  return clamp01(1 - (elapsedMs - shutStart) / closeMs);
}

/**
 * Which authored frame of an opening sequence shows at a given openness.
 * Frame 0 is the shut door (identical to the idle art), the last frame
 * is wide open, so the same sequence plays forward to open and backward
 * to close.
 */
export function doorFrameIndex(open01: number, frameCount: number): number {
  if (frameCount <= 1) return 0;
  return Math.round(clamp01(open01) * (frameCount - 1));
}

// --- Map transitions ---------------------------------------------------

export type TransitionPhase = "door" | "cover" | "hold" | "reveal" | "done";

/**
 * The beats of a move between maps. The screen swaps at the start of
 * `hold`, when the cover is at full strength, so the old map is never
 * seen dissolving into the new one.
 */
export interface TransitionTiming {
  /** The doorway's opening, played before the screen starts to cover. */
  doorMs: number;
  /** Fade to black. */
  coverMs: number;
  /** Fully covered; the swap happens here and the name is shown. */
  holdMs: number;
  /** Fade back off the new map. */
  revealMs: number;
  /**
   * Peak opacity of the cover. 0 makes the swap a plain cut with
   * nothing darkening — what reduced motion asks for.
   */
  dim: number;
}

export const TRANSITION_TIMING: TransitionTiming = {
  doorMs: DOOR_TIMING.openMs,
  coverMs: 220,
  holdMs: 420,
  revealMs: 240,
  dim: 1,
};

/**
 * Reduced motion: nothing moves and nothing fades — the map is simply
 * the new one — but the destination's name still holds long enough to
 * read, because that is information, not decoration.
 */
export const TRANSITION_CUT: TransitionTiming = {
  doorMs: 0,
  coverMs: 0,
  holdMs: 900,
  revealMs: 0,
  dim: 0,
};

export interface TransitionOptions {
  reducedMotion?: boolean;
  /** False when nothing openable led here (a stair, a story handoff). */
  door?: boolean;
}

export function transitionTiming(options: TransitionOptions = {}): TransitionTiming {
  if (options.reducedMotion === true) return TRANSITION_CUT;
  return options.door === true
    ? TRANSITION_TIMING
    : { ...TRANSITION_TIMING, doorMs: 0 };
}

/** When the map swap happens: the moment the cover reaches full strength. */
export function transitionSwapMs(timing: TransitionTiming): number {
  return timing.doorMs + timing.coverMs;
}

export function transitionDurationMs(timing: TransitionTiming): number {
  return transitionSwapMs(timing) + timing.holdMs + timing.revealMs;
}

export function transitionPhaseAt(
  elapsedMs: number,
  timing: TransitionTiming,
): TransitionPhase {
  if (elapsedMs < timing.doorMs) return "door";
  const swap = transitionSwapMs(timing);
  if (elapsedMs < swap) return "cover";
  if (elapsedMs < swap + timing.holdMs) return "hold";
  if (elapsedMs < transitionDurationMs(timing)) return "reveal";
  return "done";
}

/** Opacity of the black cover at a point in the sequence, 0..dim. */
export function coverAlpha(elapsedMs: number, timing: TransitionTiming): number {
  const swap = transitionSwapMs(timing);
  switch (transitionPhaseAt(elapsedMs, timing)) {
    case "door":
      return 0;
    case "cover":
      return timing.coverMs <= 0
        ? timing.dim
        : timing.dim * clamp01((elapsedMs - timing.doorMs) / timing.coverMs);
    case "hold":
      return timing.dim;
    case "reveal":
      return timing.revealMs <= 0
        ? 0
        : timing.dim *
            clamp01(1 - (elapsedMs - swap - timing.holdMs) / timing.revealMs);
    case "done":
      return 0;
  }
}

/** Whether the destination's name is on screen at this point. */
export function destinationShown(
  elapsedMs: number,
  timing: TransitionTiming,
): boolean {
  return transitionPhaseAt(elapsedMs, timing) === "hold";
}
