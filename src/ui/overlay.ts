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
