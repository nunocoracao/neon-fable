// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settings } from "../settings";
import { createNewGame } from "../state";
import { createGameScreen } from "./gameScreen";
import { createMainMenuScreen } from "./mainMenu";
import { initScreenRouter, setFallbackScreen, showScreen } from "./screen";
import { createSession } from "./session";

/**
 * Photo mode as the player meets it: the key that opens it, the screen
 * it clears, and the screen it gives back.
 *
 * The framing itself is pinned without a DOM in ./photoModel.test.ts and
 * against a real scene in src/iso/scenePhoto.test.ts. What is here is
 * the seam between them and the game screen — that the HUD really goes
 * away and really comes back, that a panel and a viewfinder cannot both
 * be up, and that the map does not answer the arrows while the camera
 * has them.
 */

function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

let pending: FrameRequestCallback | null = null;

function frame(timeMs: number): void {
  const next = pending;
  pending = null;
  next?.(timeMs);
}

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

function strip(): HTMLElement | null {
  return document.querySelector(".nf-photo");
}

function hudHidden(): boolean {
  const hud = document.querySelector(".nf-hud");
  return hud instanceof HTMLElement && hud.hidden;
}

function openScreen(): void {
  const session = createSession(
    createNewGame({ playerName: "Vex", seed: 5 }),
    localStorage,
  );
  showScreen(createGameScreen({ session }));
}

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  const canvas = document.getElementById("iso-canvas") as HTMLCanvasElement;
  Object.defineProperty(canvas, "clientWidth", { value: 960 });
  Object.defineProperty(canvas, "clientHeight", { value: 640 });
  canvas.setPointerCapture = (): void => {};
  canvas.releasePointerCapture = (): void => {};
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  localStorage.clear();
  initScreenRouter(document.getElementById("ui-root")!);
  setFallbackScreen(createMainMenuScreen);
});

afterEach(() => {
  pending = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("photo mode from the street", () => {
  it("opens on V and clears the screen of everything the game put there", () => {
    openScreen();
    frame(16);
    expect(strip()).toBeNull();
    expect(hudHidden()).toBe(false);

    press("v");
    expect(strip()).not.toBeNull();
    expect(hudHidden()).toBe(true);
    for (const selector of [
      ".nf-minimap",
      ".nf-interact-prompt",
      ".nf-bark-layer",
      ".nf-hint-layer",
      ".nf-toast",
    ]) {
      const layer = document.querySelector(selector);
      expect(layer instanceof HTMLElement && layer.hidden, selector).toBe(true);
    }
  });

  it("gives the screen back on Escape", () => {
    openScreen();
    frame(16);
    press("v");
    press("Escape");
    expect(strip()).toBeNull();
    expect(hudHidden()).toBe(false);
    expect(document.querySelector(".nf-minimap")).not.toBeNull();
    // And Escape means the pause menu again, now that it is the map's.
    press("Escape");
    expect(document.querySelector(".nf-system-menu")).not.toBeNull();
  });

  it("refuses to open over a panel, and the panel keeps the keyboard", () => {
    openScreen();
    frame(16);
    press("i");
    expect(document.querySelector(".nf-inventory")).not.toBeNull();
    press("v");
    expect(strip()).toBeNull();
    expect(hudHidden()).toBe(false);
  });

  it("keeps the map's own keys off while the camera has the arrows", () => {
    openScreen();
    frame(16);
    press("v");
    // Every panel key the street answers, and none of them lands.
    for (const key of ["i", "c", "p", "m", "Escape"]) press(key);
    expect(document.querySelector(".nf-inventory")).toBeNull();
    expect(document.querySelector(".nf-system-menu")).toBeNull();
    // Escape did one thing: it left photo mode.
    expect(strip()).toBeNull();
  });

  it("leaves nothing behind when the screen is torn down mid-shot", () => {
    openScreen();
    frame(16);
    press("v");
    const before = settings.get();
    showScreen(createMainMenuScreen());
    expect(strip()).toBeNull();
    // Photo mode writes no preference, so nothing about it survives.
    expect(settings.get()).toEqual(before);
  });
});
