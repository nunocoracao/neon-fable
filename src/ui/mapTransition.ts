/**
 * The move between maps, as the player sees it: the doorway opens, the
 * screen fades through black, the map is swapped behind the cover with
 * the destination's name held on it, then the new map fades up. Every
 * beat's length comes from the pure timing in ../iso/transition — this
 * file only owns the DOM and the timers.
 *
 * The overlay mounts on document.body, not the screen root, because the
 * screen underneath is replaced half-way through: it has to outlive the
 * thing it is covering.
 */
import {
  transitionDurationMs,
  transitionSwapMs,
  transitionTiming,
  type TransitionTiming,
} from "../iso/transition";

export interface MapTransitionOptions {
  /** Shown while covered, e.g. "Cinder Row Plaza". */
  destinationName: string;
  /**
   * Plays the doorway's opening. Returning false (nothing openable led
   * here) drops the door beat, so a stair or a story handoff goes
   * straight to the fade instead of pausing on nothing.
   */
  openDoor?: () => boolean;
  /** Swap the map. Runs once, fully covered. */
  onSwap: () => void;
  /** Runs when the new map is fully revealed and the overlay is gone. */
  onDone?: () => void;
  /** Collapses the whole thing to a cut; defaults to false. */
  reducedMotion?: boolean;
  /** Defaults to document.body. */
  host?: HTMLElement;
}

export interface MapTransitionHandle {
  /** Tear down without swapping. No-op once the swap has happened. */
  cancel(): void;
  /** The resolved beat lengths — the sequence this run is playing. */
  readonly timing: TransitionTiming;
}

/** Kicker over the destination's name; the game's arrival voice. */
export const ARRIVAL_KICKER = "Arriving";

export function runMapTransition(
  options: MapTransitionOptions,
): MapTransitionHandle {
  const host = options.host ?? document.body;

  const root = document.createElement("div");
  root.className = "nf-transition";

  const cover = document.createElement("div");
  cover.className = "nf-transition-cover";
  cover.setAttribute("aria-hidden", "true");

  const card = document.createElement("div");
  card.className = "nf-transition-card";
  const kicker = document.createElement("span");
  kicker.className = "nf-transition-kicker";
  kicker.textContent = ARRIVAL_KICKER;
  const name = document.createElement("span");
  name.className = "nf-transition-name";
  name.textContent = options.destinationName;
  // Announced rather than drawn: the name is the point of the beat.
  card.setAttribute("role", "status");
  card.append(kicker, name);

  root.append(cover, card);

  // The door beat is only earned if there is actually a door to open,
  // and that is not known until it is asked to play.
  const door = options.openDoor?.() === true;
  const timing = transitionTiming({
    reducedMotion: options.reducedMotion === true,
    door,
  });
  // A cut darkens nothing, so it must not swallow clicks either; a real
  // fade does, which stops a second transition starting mid-flight.
  root.style.pointerEvents = timing.dim > 0 ? "auto" : "none";
  cover.style.opacity = "0";
  host.append(root);

  let swapped = false;
  let finished = false;
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const at = (delayMs: number, step: () => void): void => {
    timers.push(setTimeout(step, delayMs));
  };

  const teardown = (): void => {
    if (finished) return;
    finished = true;
    for (const timer of timers) clearTimeout(timer);
    timers.length = 0;
    root.remove();
  };

  const fade = (durationMs: number, opacity: number): void => {
    cover.style.transition = `opacity ${durationMs}ms linear`;
    cover.style.opacity = String(opacity);
  };

  at(timing.doorMs, () => fade(timing.coverMs, timing.dim));

  at(transitionSwapMs(timing), () => {
    swapped = true;
    card.classList.add("nf-transition-visible");
    options.onSwap();
  });

  at(transitionSwapMs(timing) + timing.holdMs, () => {
    card.classList.remove("nf-transition-visible");
    fade(timing.revealMs, 0);
  });

  at(transitionDurationMs(timing), () => {
    teardown();
    options.onDone?.();
  });

  return {
    timing,
    cancel(): void {
      if (swapped) return;
      teardown();
    },
  };
}
