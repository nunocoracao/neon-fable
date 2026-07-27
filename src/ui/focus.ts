/**
 * Focus helpers so every overlay and panel behaves the same for
 * keyboard players: opening one moves focus to its first usable
 * control, arrow keys walk the controls, and Tab/Enter/Esc keep their
 * usual meanings.
 */

const FOCUSABLE_SELECTOR =
  "button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]";

/** Moves focus to the first enabled control inside the element, if any. */
export function focusFirst(root: HTMLElement): void {
  const target = root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  target?.focus();
}

/** All enabled, focusable controls inside the element, in DOM order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
}

/**
 * Arrow-key list navigation: ArrowUp/ArrowDown (plus Home/End) move
 * focus through the container's controls, wrapping at the ends. The
 * listener sits on the container, so it works for content re-rendered
 * later. Inputs keep their native arrow behavior (range sliders adjust
 * their value, text fields move the caret) — Tab leaves them.
 */
export function installListNav(container: HTMLElement): void {
  container.addEventListener("keydown", (event: KeyboardEvent) => {
    const { key } = event;
    if (
      key !== "ArrowDown" &&
      key !== "ArrowUp" &&
      key !== "Home" &&
      key !== "End"
    ) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      return;
    }
    const items = focusables(container);
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    if (key === "Home") {
      next = items[0];
    } else if (key === "End") {
      next = items[items.length - 1];
    } else if (index === -1) {
      next = items[0];
    } else {
      const delta = key === "ArrowDown" ? 1 : -1;
      next = items[(index + delta + items.length) % items.length];
    }
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    next.focus();
  });
}
