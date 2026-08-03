/**
 * An overlay is a self-contained piece of DOM (dialogue box, inventory
 * panel, save list) the game screen mounts over the iso scene. Unlike a
 * Screen it does not own the UI root — the game screen manages a single
 * open overlay at a time.
 */
export interface OverlayHandle {
  el: HTMLElement;
  /** Remove the overlay's DOM and any listeners it created. */
  destroy(): void;
}

/**
 * The root element every centred overlay is built on.
 *
 * It exists to make one thing impossible to forget: a panel that covers
 * the game has to *say* it covers the game. Without the role and the
 * name, a screen reader lands in an unnamed div with the map's own
 * controls still in its reading order behind it, and the player has no
 * way to tell what they have opened or where its edges are.
 *
 * `aria-modal` is the truth of it, not a hope: the shell switches the
 * scene's keyboard off while a panel is up (see gameScreen), so nothing
 * behind one is reachable while it is open.
 */
export function createOverlayRoot(label: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-center";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", label);
  return el;
}
