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
let fallbackFactory: (() => Screen) | null = null;

export function initScreenRouter(root: HTMLElement): void {
  uiRoot = root;
}

/**
 * Registers the screen shown when another screen throws during mount
 * (main.ts wires in the main menu). Keeps the router free of screen
 * imports, which would be circular.
 */
export function setFallbackScreen(factory: () => Screen): void {
  fallbackFactory = factory;
}

export function showScreen(screen: Screen): void {
  if (!uiRoot) {
    throw new Error("Screen router not initialized — call initScreenRouter first");
  }
  try {
    currentScreen?.unmount();
  } catch (error) {
    console.error("Screen failed to unmount:", error);
  }
  uiRoot.replaceChildren();
  currentScreen = screen;
  try {
    screen.mount(uiRoot);
  } catch (error) {
    console.error("Screen failed to mount:", error);
    currentScreen = null;
    uiRoot.replaceChildren();
    renderCrashNotice(uiRoot);
  }
}

export function getCurrentScreen(): Screen | null {
  return currentScreen;
}

/** Friendly full-screen notice instead of a blank page on mount errors. */
function renderCrashNotice(root: HTMLElement): void {
  const container = document.createElement("div");
  container.className = "nf-screen";
  const panel = document.createElement("div");
  panel.className = "nf-panel";
  const title = document.createElement("h2");
  title.textContent = "Something glitched";
  const note = document.createElement("p");
  note.className = "nf-dim";
  note.textContent =
    "That screen hit an error and could not load. Your last autosave is " +
    "safe — head back to the main menu to pick the thread up.";
  panel.append(title, note);
  if (fallbackFactory) {
    const factory = fallbackFactory;
    const back = document.createElement("button");
    back.className = "nf-button";
    back.textContent = "Main Menu";
    back.addEventListener("click", () => showScreen(factory()));
    panel.append(back);
  }
  container.append(panel);
  root.append(container);
}
