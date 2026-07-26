/**
 * A Screen owns a chunk of DOM UI. The router mounts exactly one screen
 * at a time into the UI root and unmounts the previous one.
 */
export interface Screen {
  /** Attach this screen's DOM under the given root element. */
  mount(root: HTMLElement): void;
  /** Tear down DOM and any listeners created in mount(). */
  unmount(): void;
}

let uiRoot: HTMLElement | null = null;
let currentScreen: Screen | null = null;

export function initScreenRouter(root: HTMLElement): void {
  uiRoot = root;
}

export function showScreen(screen: Screen): void {
  if (!uiRoot) {
    throw new Error("Screen router not initialized — call initScreenRouter first");
  }
  currentScreen?.unmount();
  uiRoot.replaceChildren();
  currentScreen = screen;
  screen.mount(uiRoot);
}

export function getCurrentScreen(): Screen | null {
  return currentScreen;
}
