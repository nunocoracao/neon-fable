/**
 * Live regions: the one way anything in this game speaks to a screen
 * reader that is not already text on the page.
 *
 * Most of the game *is* text on the page, and that is the right answer
 * — a panel of buttons needs no narrator. Three things are not:
 *
 * - **The canvas.** A district and an arena are pixels. What happens on
 *   them (whose turn it is, who moved, what is in focus and how far
 *   away it is) has to be said in words or it is not said at all. The
 *   narration is of *events*, never of pixels: "Vesper's turn", not a
 *   description of a sprite.
 * - **Text that replaces itself in place.** A dialogue box rewrites its
 *   own contents when a choice is taken. Nothing new arrives in the
 *   document for a reader to notice, so the new line is announced.
 * - **State that changes without focus moving.** A wizard step, a
 *   crouch, a rule that just came into force.
 *
 * Two politeness levels, and the default is the quiet one. `polite`
 * queues behind whatever is being read; `assertive` interrupts, and is
 * for the handful of things a player must not miss mid-sentence (being
 * spotted, a fight ending).
 *
 * ## Why the region alternates its text
 *
 * A live region only announces a *change*. Say "Your turn" twice in a
 * row and the second one is silence, which is exactly wrong in a fight
 * that comes back round to you. So a repeated line is written with a
 * trailing zero-width marker that alternates on and off: the same
 * sentence to a listener, a different string to the DOM.
 */
import { plain, type PlainKey } from "./strings";

/** Zero-width space: makes a repeated line a different string. */
const NUDGE = "​";

export interface Announcer {
  /** The region itself, to be mounted wherever it belongs. */
  el: HTMLElement;
  /** Announces a line, or nothing when it is empty. */
  say(text: string | null): void;
  /** Empties the region without announcing anything. */
  clear(): void;
  destroy(): void;
}

export interface AnnouncerOptions {
  /**
   * Whether announcements interrupt what is being read. Reserved for
   * the things a player must not miss mid-sentence; everything else
   * queues.
   */
  urgent?: boolean;
  /** What the region is called, for a reader browsing the page. */
  label?: PlainKey;
  /** Extra class on the region, on top of the visually-hidden one. */
  className?: string;
}

/**
 * A visually-hidden live region. Nothing here is ever seen: an
 * announcer is what a canvas or a rewriting panel says *in addition to*
 * what it draws, never instead of it.
 */
export function createAnnouncer(options: AnnouncerOptions = {}): Announcer {
  const el = document.createElement("div");
  el.className = options.className
    ? `nf-sr-only ${options.className}`
    : "nf-sr-only";
  el.setAttribute("role", options.urgent === true ? "alert" : "status");
  el.setAttribute("aria-live", options.urgent === true ? "assertive" : "polite");
  // The whole line, every time: a reader that only heard the changed
  // words would hear half a sentence.
  el.setAttribute("aria-atomic", "true");
  if (options.label) el.setAttribute("aria-label", plain(options.label));

  let last = "";
  let nudged = false;

  return {
    el,
    say(text: string | null): void {
      const line = text?.trim() ?? "";
      if (line.length === 0) return;
      if (line === last) {
        nudged = !nudged;
        el.textContent = nudged ? `${line}${NUDGE}` : line;
        return;
      }
      last = line;
      nudged = false;
      el.textContent = line;
    },
    clear(): void {
      last = "";
      nudged = false;
      el.textContent = "";
    },
    destroy(): void {
      el.remove();
    },
  };
}

/** What a region is actually saying, with the repeat marker taken off. */
export function announcedText(el: HTMLElement): string {
  return (el.textContent ?? "").split(NUDGE).join("");
}
