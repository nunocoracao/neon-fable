/**
 * Focus helpers so every overlay and panel behaves the same for
 * keyboard players: opening one moves focus to its first usable
 * control, letting Tab/Enter work immediately and Esc close it.
 */

/** Moves focus to the first enabled control inside the element, if any. */
export function focusFirst(root: HTMLElement): void {
  const target = root.querySelector<HTMLElement>(
    "button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]",
  );
  target?.focus();
}
