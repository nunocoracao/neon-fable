/**
 * The hint chip: the thin DOM layer that puts one contextual hint on
 * screen and takes it away again. It owns no rules — the screens say
 * what just became relevant (`cue`), src/narrative/hints.ts decides
 * which chip wins and whether it has been shown before, and the copy is
 * in src/data/hints.ts.
 *
 * Three properties this layer is responsible for:
 *
 * - **Never more than one chip.** The queue guarantees it; this file
 *   only ever holds a single element and replaces its contents.
 * - **Dismissible instantly.** The chip's own button takes it down on
 *   the click, with nothing to confirm and no animation to sit through.
 *   The hint is already recorded as seen by then, so it cannot come
 *   back and a mis-click costs nothing but the sentence.
 * - **The setting is honoured at the door.** With `hints` off nothing
 *   is cued, nothing is queued and nothing is marked seen — switching
 *   it back on later picks the run up where it was rather than
 *   replaying the first half hour.
 *
 * Unlike the bark layer this one *is* read out: a hint is the only
 * place some of this information appears, so the chip is a polite live
 * region and its dismiss button is a real focusable control.
 */
import { audio } from "../audio";
import { getHint, type HintTrigger } from "../data/hints";
import {
  createHintQueue,
  cueHints,
  dismissHint,
  forgetHint,
  markHintSeen,
  pauseHints,
  showHint,
  type HintQueue,
} from "../narrative/hints";
import { settings } from "../settings";
import type { FlagMap } from "../state/flags";

export interface HintLayerOptions {
  /** The run's flags, read for "already shown" and written on show. */
  flags(): FlagMap;
  /**
   * Records the run having been shown a hint. The shell owns what that
   * means — writing the session and autosaving — so this layer never
   * touches GameState itself.
   */
  onSeen(flags: FlagMap): void;
  /**
   * Chips this scene may put up at all. Left off on the map (hints
   * arrive minutes apart there); a fight passes COMBAT_HINT_BUDGET,
   * which is what spreads the action-bar tour over the first few.
   */
  limit?: number;
}

export interface HintLayerHandle {
  /** The fixed-position element to mount under the HUD. */
  el: HTMLElement;
  /**
   * Offer a trigger. Safe to call every frame: everything already
   * shown, already waiting, or already on screen is skipped, and the
   * chip only changes when one actually goes up.
   */
  cue(trigger: HintTrigger): void;
  /** Take the chip down, as the dismiss button does. */
  dismiss(): void;
  /**
   * Hold hints back (an overlay is open). Pausing clears the chip and
   * the backlog; resuming lets the next cue start it again.
   */
  setPaused(paused: boolean): void;
  /** The id on screen right now, or null. Tests read this. */
  active(): string | null;
  destroy(): void;
}

export function createHintLayer(options: HintLayerOptions): HintLayerHandle {
  const el = document.createElement("div");
  el.className = "nf-hint-layer";
  // Polite, not assertive: a hint never interrupts a line of dialogue
  // or a combat announcement being read out.
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");

  let queue: HintQueue = createHintQueue(options.limit);
  let paused = false;

  function clear(): void {
    el.replaceChildren();
  }

  function takeDown(): void {
    queue = dismissHint(queue);
    clear();
  }

  function paint(hintId: string): void {
    const hint = getHint(hintId);
    if (!hint) {
      clear();
      return;
    }
    const chip = document.createElement("div");
    chip.className = "nf-hint-chip";
    chip.dataset.hint = hint.id;

    const body = document.createElement("div");
    body.className = "nf-hint-body";
    const title = document.createElement("span");
    title.className = "nf-hint-title";
    title.textContent = hint.title;
    const text = document.createElement("span");
    text.className = "nf-hint-text";
    text.textContent = hint.text;
    body.append(title, text);

    const close = document.createElement("button");
    close.className = "nf-hint-dismiss";
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", `Dismiss hint: ${hint.title}`);
    close.addEventListener("click", () => {
      audio.emit("ui.cancel");
      takeDown();
    });

    chip.append(body, close);
    el.replaceChildren(chip);
  }

  /** Promote whatever is waiting, if the screen is free to take it. */
  function pump(): void {
    if (paused || !settings.get().hints) return;
    const result = showHint(queue);
    queue = result.queue;
    if (result.shown === null) return;
    // Marked the moment it goes up, not when it is dismissed: a hint
    // the player walked away from has still been shown to them, and a
    // chip that came back after every reload would be worse than one
    // that was missed.
    options.onSeen(markHintSeen(options.flags(), result.shown));
    audio.emit("ui.bark.pop");
    paint(result.shown);
  }

  return {
    el,

    cue(trigger: HintTrigger): void {
      // Off means off at the door: nothing is queued, so nothing is
      // marked seen and turning the switch back on loses nothing.
      if (!settings.get().hints) return;
      queue = cueHints(queue, trigger, options.flags());
      pump();
    },

    dismiss(): void {
      takeDown();
    },

    setPaused(next: boolean): void {
      if (next === paused) return;
      paused = next;
      if (!paused) return;
      // The chip goes back in the queue rather than being spent: it was
      // covered before it could be read, so the run has not been told.
      const held = pauseHints(queue);
      queue = held.queue;
      if (held.returned !== null) {
        options.onSeen(forgetHint(options.flags(), held.returned));
      }
      clear();
    },

    active(): string | null {
      return queue.active;
    },

    destroy(): void {
      clear();
      el.remove();
    },
  };
}
