// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settings } from "../settings";
import {
  createNewGame,
  recruitCompanion,
  setActiveCompanion,
  type GameState,
} from "../state";
import { createGameScreen } from "./gameScreen";
import { createMainMenuScreen } from "./mainMenu";
import { initScreenRouter, setFallbackScreen, showScreen } from "./screen";
import { createSession } from "./session";

/**
 * The assembled street: a real game screen, a real iso scene, and the
 * real catalog, driven frame by frame. The scheduler and the chip layer
 * are tested apart from this; what is pinned here is that the wiring
 * between them exists — that walking into the hub and standing there
 * actually produces a line, that a panel silences it, and that the
 * chips sit under the HUD rather than over it.
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

/** Runs one animation frame at the given clock reading. */
function frame(timeMs: number): void {
  const next = pending;
  pending = null;
  next?.(timeMs);
}

/**
 * Stands still on the map for `seconds`, a frame every 250ms, and
 * returns every line that went up over that stretch — a chip lives
 * BARK_LIFE_MS, so what is on screen at the end is not what was said.
 */
function loiter(seconds: number, from = 0): string[] {
  const said = new Set<string>();
  for (let t = from; t <= from + seconds * 1000; t += 250) {
    frame(t);
    for (const text of chips()) said.add(text);
  }
  return [...said];
}

function chips(): string[] {
  return [...document.querySelectorAll(".nf-bark-chip")].map(
    (chip) => chip.textContent ?? "",
  );
}

function openScreen(overrides: Partial<GameState> = {}): void {
  const session = createSession(
    { ...createNewGame({ playerName: "Vex", seed: 5 }), ...overrides },
    localStorage,
  );
  showScreen(createGameScreen({ session }));
}

/** A run standing in the rain on the Steps, with Sill walking along. */
function rainySteps(): Partial<GameState> {
  const base = createNewGame({ playerName: "Vex", seed: 5 });
  return {
    ...base,
    location: "greywater-steps",
    party: setActiveCompanion(recruitCompanion(base.party, "sill"), "sill"),
  };
}

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  const canvas = document.getElementById("iso-canvas") as HTMLCanvasElement;
  // A measured viewport, so the camera settles and the crowd is framed.
  Object.defineProperty(canvas, "clientWidth", { value: 960 });
  Object.defineProperty(canvas, "clientHeight", { value: 640 });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  localStorage.clear();
  settings.update({ barks: true });
  initScreenRouter(document.getElementById("ui-root")!);
  setFallbackScreen(createMainMenuScreen);
});

afterEach(() => {
  pending = null;
  settings.update({ barks: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("barks in the game screen", () => {
  it("puts a line up over somebody on the hub", () => {
    openScreen();
    const said = loiter(10);
    expect(said.length).toBeGreaterThan(0);
    expect(said.every((text) => text.trim().length > 0)).toBe(true);
  });

  it("mounts under the HUD, so a panel covers the chatter", () => {
    openScreen();
    const root = document.getElementById("ui-root")!;
    const children = [...root.children].map((el) => el.className.split(" ")[0]);
    expect(children[0]).toBe("nf-bark-layer");
    expect(children).toContain("nf-hud");
    expect(children.indexOf("nf-bark-layer")).toBeLessThan(
      children.indexOf("nf-overlay-layer"),
    );
  });

  it("takes the street down while a panel is open, and back up after", () => {
    openScreen();
    expect(loiter(10).length).toBeGreaterThan(0);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i" }));
    expect(document.querySelector(".nf-inventory")).not.toBeNull();
    expect(chips()).toEqual([]);
    expect(loiter(10, 11_000)).toEqual([]);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(loiter(30, 30_000).length).toBeGreaterThan(0);
  });

  it("stays silent for a player who turned it off", () => {
    settings.update({ barks: false });
    openScreen();
    expect(loiter(30)).toEqual([]);
  });

  it("lets the companion answer the district, and then the weather", () => {
    openScreen(rainySteps());
    // Arriving is the first thing worth remarking on...
    expect(loiter(6)).toContain("There is a file on this district. It's thin.");
    // ...and the rain is the second, once they have drawn breath.
    expect(loiter(30, 6250)).toContain(
      "The drainage here was approved. By a name I know.",
    );
  });

  it("never puts anything focusable or clickable on the map", () => {
    openScreen();
    loiter(10);
    const layer = document.querySelector(".nf-bark-layer")!;
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.querySelector("button, a, input, [tabindex]")).toBeNull();
  });
});
