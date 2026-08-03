/**
 * The scene's animation clock, and how it is held still.
 *
 * Every clock-driven thing in a district — neon flicker, water shimmer,
 * the train on the viaduct, a scrolling headline, the pulse under an
 * interactable — is a pure function of one millisecond reading. The
 * scene used to hand it the raw `requestAnimationFrame` timestamp, which
 * meant there was no way to stop the city without stopping the loop that
 * draws it, and no way to start it again where it left off.
 *
 * This is that reading, with an offset under it. Holding the clock
 * records the scene time it stopped at and returns it for every frame
 * after; releasing it moves the offset forward by exactly the time spent
 * held, so the very next frame reads the instant the hold began and the
 * city carries on from there rather than jumping however long the player
 * spent framing a shot.
 *
 * Pure and immutable — no wall-clock reads, no state of its own — so
 * "does a freeze lose its place" is a unit test rather than a thing you
 * squint at. Photo mode (src/ui/photoModel.ts) is the only caller that
 * holds it today; the scene's step delta is derived from this reading
 * too, so a held clock stills movement without a second switch.
 */

export interface SceneClock {
  /** Milliseconds subtracted from the frame clock to get scene time. */
  offset: number;
  /** The scene time the clock is held at, or null while it runs. */
  heldAt: number | null;
}

/** A clock that has never been held: scene time is frame time. */
export const RUNNING_CLOCK: SceneClock = { offset: 0, heldAt: null };

/** What the scene should animate against on a frame stamped `frameMs`. */
export function sceneTime(clock: SceneClock, frameMs: number): number {
  return clock.heldAt ?? frameMs - clock.offset;
}

/** Whether the clock is currently held. */
export function clockHeld(clock: SceneClock): boolean {
  return clock.heldAt !== null;
}

/**
 * Stops the clock where it stands. Holding an already-held clock is the
 * same clock — a second request does not re-stamp the instant, so a
 * repeated call cannot quietly move the frozen frame.
 */
export function holdClock(clock: SceneClock, frameMs: number): SceneClock {
  if (clock.heldAt !== null) return clock;
  return { offset: clock.offset, heldAt: sceneTime(clock, frameMs) };
}

/**
 * Starts it again from the instant it was held at: the time spent held
 * is added to the offset and disappears, so nothing on screen advances
 * across the pause. Releasing a running clock changes nothing.
 */
export function releaseClock(clock: SceneClock, frameMs: number): SceneClock {
  if (clock.heldAt === null) return clock;
  return { offset: frameMs - clock.heldAt, heldAt: null };
}
