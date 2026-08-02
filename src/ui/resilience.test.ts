// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_STATE_VERSION, createNewGame, type GameState } from "../state";
import { createCombatScreen } from "./combatScreen";
import { createGameScreen } from "./gameScreen";
import { createMainMenuScreen } from "./mainMenu";
import {
  initScreenRouter,
  setFallbackScreen,
  showScreen,
  type Screen,
} from "./screen";
import { createSession, type Session } from "./session";

/**
 * Resilience regression tests: corrupt and version-mismatched saves,
 * missing content ids, and screens that throw during mount must all
 * degrade to friendly UI (console.error in dev) — never a blank page or
 * an uncaught exception. Canvas rendering is stubbed as in flow.test.
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

function buttons(): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")];
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return buttons().find((b) => (b.textContent ?? "").trim().startsWith(text));
}

function click(text: string): void {
  const button = buttonByText(text);
  if (!button) throw new Error(`no button labelled "${text}"`);
  if (button.disabled) throw new Error(`button "${text}" is disabled`);
  button.click();
}

function textOf(selector: string): string {
  return document.querySelector(selector)?.textContent ?? "";
}

function pressKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
}

function playerState(seed = 1): GameState {
  return createNewGame({ playerName: "Vex", seed });
}

const AUTOSAVE_KEY = "neon-fable:save:autosave";

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  localStorage.clear();
  initScreenRouter(document.getElementById("ui-root")!);
  setFallbackScreen(createMainMenuScreen);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("screen-mount error boundary", () => {
  it("shows a crash notice with a route back to the main menu", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: Screen = {
      mount() {
        throw new Error("boom");
      },
      unmount() {},
    };
    showScreen(broken);
    expect(textOf("#ui-root")).toMatch(/Something glitched/);
    expect(errors).toHaveBeenCalled();
    click("Main Menu");
    expect(buttonByText("New Game")).toBeTruthy();
  });
});

describe("save resilience", () => {
  it("ignores a corrupt autosave: menu renders with Continue disabled", () => {
    localStorage.setItem(AUTOSAVE_KEY, "{ not valid json");
    showScreen(createMainMenuScreen());
    expect(buttonByText("New Game")?.disabled).toBe(false);
    expect(buttonByText("Continue")?.disabled).toBe(true);
  });

  it("shows a friendly error for a version-mismatched save and stays on the menu", () => {
    const stale = {
      version: GAME_STATE_VERSION + 1,
      savedAt: 12345,
      state: { ...playerState(), version: GAME_STATE_VERSION + 1 },
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(stale));
    showScreen(createMainMenuScreen());
    click("Continue");
    expect(textOf(".nf-error")).toMatch(/incompatible game version/);
    expect(buttonByText("New Game")).toBeTruthy();
  });
});

describe("missing content ids", () => {
  it("drops an unknown pending encounter with a console error and shows the map", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const session = createSession({
      ...playerState(),
      pendingEncounterId: "enc-does-not-exist",
    });
    showScreen(createGameScreen({ session }));
    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining("enc-does-not-exist"),
    );
    expect(session.state.pendingEncounterId).toBeNull();
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
  });

  it("returns to the map when combat starts with an unknown encounter id", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const session = createSession(playerState());
    showScreen(
      createCombatScreen({
        session,
        encounterId: "enc-does-not-exist",
        resumeNodeId: null,
      }),
    );
    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining("enc-does-not-exist"),
    );
    expect(session.state.pendingEncounterId).toBeNull();
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
  });

  it("falls back to the hub with a console error for an unknown location", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const session = createSession({
      ...playerState(),
      location: "map-does-not-exist",
    });
    showScreen(createGameScreen({ session }));
    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining("map-does-not-exist"),
    );
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
  });
});

describe("dev routes", () => {
  it("hides the Explore route unless the page runs with ?dev", () => {
    showScreen(createMainMenuScreen());
    expect(buttonByText("Explore")).toBeUndefined();
  });
});

describe("mid-chapter save/load", () => {
  function mountOnMap(location: string): Session {
    const session = createSession({
      ...playerState(),
      location,
      flags: { "act1-side": "open" },
    });
    showScreen(createGameScreen({ session }));
    return session;
  }

  it("saves on a chapter map and loads back to the same spot with flags intact", () => {
    mountOnMap("greywater-steps");
    expect(textOf(".nf-hud-status")).toMatch(/Greywater Steps/);

    pressKey("Escape");
    click("Save / Load");
    // First row is Slot 1; its first button is Save.
    document.querySelectorAll(".nf-save-row")[0]?.querySelector("button")?.click();
    expect(textOf(".nf-save-card")).toMatch(/Vex/);
    expect(textOf(".nf-save-card")).toMatch(/Greywater Steps/);

    click("Load");
    expect(document.querySelector(".nf-saves")).toBeNull();
    expect(textOf(".nf-hud-status")).toMatch(/Greywater Steps/);
    const raw = localStorage.getItem("neon-fable:save:slot1");
    expect(JSON.parse(raw!).state.flags["act1-side"]).toBe("open");
  });
});
