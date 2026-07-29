/**
 * Focus helpers so every overlay and panel behaves the same for
 * keyboard players: opening one moves focus to its first usable
 * control, arrow keys walk the controls, and Tab/Enter/Esc keep their
 * usual meanings. Grids of selectable options (thumbnails, swatches,
 * tab strips) use the roving-tabindex pattern via installRovingGrid:
 * one tab stop per grid, arrows to move inside it.
 */
import { moveInGrid } from "../data";

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

// --- Roving-tabindex grids ---------------------------------------------

export interface RovingGridOptions {
  /** Selector matching the grid's items inside the container. */
  itemSelector: string;
  /** Columns for row-major arrow math; defaults to a single row. */
  columns?: () => number;
  /**
   * The item that should be the grid's tab stop at rest — typically
   * the selected option. Defaults to the first item.
   */
  primary?: (items: HTMLElement[]) => HTMLElement | undefined;
}

export interface RovingGrid {
  /** Re-apply the roving tabindex after items or selection change. */
  sync(): void;
}

/**
 * Roving tabindex over a grid of options: exactly one item is in the
 * tab order (the primary — usually the selected one), arrow keys move
 * focus by row and column without wrapping, Home/End jump to the ends,
 * and whichever item gains focus (by keyboard, click, or programmatic
 * restore) becomes the tab stop. Arrow keys are swallowed inside the
 * grid so enclosing list navigation doesn't also move focus. Listeners
 * sit on the container, so items may be re-rendered freely — call
 * sync() after a rebuild.
 */
export function installRovingGrid(
  container: HTMLElement,
  options: RovingGridOptions,
): RovingGrid {
  function items(): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>(options.itemSelector)];
  }

  function rove(list: HTMLElement[], target: HTMLElement): void {
    for (const item of list) item.tabIndex = item === target ? 0 : -1;
  }

  function sync(): void {
    const list = items();
    const primary = options.primary?.(list) ?? list[0];
    if (primary) rove(list, primary);
  }

  container.addEventListener("keydown", (event: KeyboardEvent) => {
    const { key } = event;
    if (
      key !== "ArrowRight" &&
      key !== "ArrowLeft" &&
      key !== "ArrowDown" &&
      key !== "ArrowUp" &&
      key !== "Home" &&
      key !== "End"
    ) {
      return;
    }
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    // The grid owns these keys even when the move hits an edge.
    event.preventDefault();
    event.stopPropagation();
    const columns = options.columns?.() ?? list.length;
    const next =
      key === "Home"
        ? 0
        : key === "End"
          ? list.length - 1
          : moveInGrid(index, list.length, columns, key);
    const target = next === null ? undefined : list[next];
    if (!target || target === list[index]) return;
    rove(list, target);
    target.focus();
  });

  // Focus arriving any other way (mouse click, restored after a
  // re-render) also claims the tab stop.
  container.addEventListener("focusin", (event: FocusEvent) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches(options.itemSelector)) {
      rove(items(), target);
    }
  });

  sync();
  return { sync };
}

// --- Focus preservation across re-renders ------------------------------

export interface FocusSnapshot {
  /** The control's data-focus-key, when it declares one. */
  key: string | null;
  /** Fallback: the control's position among the root's focusables. */
  index: number;
}

/**
 * Captures where keyboard focus sits inside a container that is about
 * to be rebuilt, so restoreFocus can put it back afterwards. Controls
 * with a data-focus-key attribute are matched by key (stable across
 * layout shifts); anything else falls back to its position in the
 * focus order. Returns null when focus is outside the container.
 */
export function captureFocus(root: HTMLElement): FocusSnapshot | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  return {
    key: active.dataset.focusKey ?? null,
    index: focusables(root).indexOf(active),
  };
}

/** Restores focus captured by captureFocus after a re-render. */
export function restoreFocus(
  root: HTMLElement,
  snapshot: FocusSnapshot | null,
): void {
  if (!snapshot) return;
  if (snapshot.key !== null) {
    const byKey = root.querySelector<HTMLElement>(
      `[data-focus-key="${snapshot.key}"]`,
    );
    if (byKey && !byKey.hasAttribute("disabled")) {
      byKey.focus();
      return;
    }
  }
  if (snapshot.index < 0) return;
  const items = focusables(root);
  items[Math.min(snapshot.index, items.length - 1)]?.focus();
}
