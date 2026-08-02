import { stashRecovery } from "../state";
import { createErrorScreen } from "./errorScreen";
import type { CrashOrigin } from "./errorReport";
import { getActiveSession } from "./session";

/**
 * A Screen owns a chunk of DOM UI. The router mounts exactly one screen
 * at a time into the UI root and unmounts the previous one.
 *
 * It is also the game's error boundary. Nothing below this line is
 * allowed to take the page down with it: a screen that throws while
 * mounting, an exception that escapes a handler, a promise nobody
 * caught — all of it lands on the crash screen, with the run that was
 * in progress stashed first.
 */
export interface Screen {
  /** Attach this screen's DOM under the given root element. */
  mount(root: HTMLElement): void;
  /** Tear down DOM and any listeners created in mount(). */
  unmount(): void;
  /**
   * What this screen is called in a crash report — "game", "combat".
   * Optional: a screen that does not say is reported as unknown, which
   * is worse for whoever reads the report and harmless to the player.
   */
  name?: string;
}

let uiRoot: HTMLElement | null = null;
let currentScreen: Screen | null = null;
let fallbackFactory: (() => Screen) | null = null;
/** Guards against a crash screen that itself throws looping forever. */
let handlingCrash = false;

export function initScreenRouter(root: HTMLElement): void {
  uiRoot = root;
  handlingCrash = false;
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
    reportCrash(error, "mount", screen.name);
  }
}

export function getCurrentScreen(): Screen | null {
  return currentScreen;
}

/** What the screen on show calls itself, for a report. */
export function currentScreenName(): string {
  return currentScreen?.name ?? "";
}

/* ------------------------------------------------------------------ *
 * The boundary
 * ------------------------------------------------------------------ */

/**
 * Routes an uncaught exception to the crash screen, having first put
 * the run somewhere it can be picked up again.
 *
 * The order matters: stash, then render. A stash written after the
 * screen is drawn is a stash that never happens if drawing throws, and
 * the state in memory is the only copy of the last few minutes of play.
 *
 * Re-entrant calls (the crash screen crashing) fall through to the
 * console rather than recursing — at that point there is nothing left
 * to render with.
 */
export function reportCrash(
  error: unknown,
  origin: CrashOrigin = "window",
  screen?: string,
): void {
  if (handlingCrash) {
    console.error("Crash while reporting a crash:", error);
    return;
  }
  handlingCrash = true;
  try {
    const session = getActiveSession();
    const state = session?.state ?? null;
    // A stash is best-effort by design: no room, no storage, no
    // session — all of them mean "not stashed", never "no error
    // screen".
    const stashed =
      session && state ? stashRecovery(state, session.storage) : false;

    const crashScreen = createErrorScreen({
      context: {
        error,
        screen: screen ?? currentScreenName(),
        origin,
        state,
        stashed,
        at: Date.now(),
        userAgent:
          typeof navigator === "undefined" ? undefined : navigator.userAgent,
      },
      onMenu: fallbackFactory
        ? () => {
            const factory = fallbackFactory!;
            showScreen(factory());
          }
        : undefined,
    });

    if (!uiRoot) return;
    try {
      currentScreen?.unmount();
    } catch {
      // The screen that just crashed does not get a second chance to.
    }
    uiRoot.replaceChildren();
    currentScreen = crashScreen;
    crashScreen.mount(uiRoot);
  } catch (nested) {
    console.error("Crash screen failed to render:", nested);
  } finally {
    handlingCrash = false;
  }
}

/**
 * Catches what the router cannot see: exceptions thrown out of event
 * handlers and animation frames, and rejected promises nobody awaited.
 * Returns the teardown, which main.ts never calls and tests always do.
 */
export function installErrorBoundary(target: Window = window): () => void {
  const onError = (event: ErrorEvent): void => {
    reportCrash(event.error ?? event.message, "window");
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    reportCrash(event.reason, "promise");
  };
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}
