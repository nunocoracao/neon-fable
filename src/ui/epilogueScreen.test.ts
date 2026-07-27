// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNewGame, type GameState } from "../state";
import type { FlagValue } from "../state/flags";
import { createEpilogueScreen } from "./epilogueScreen";
import { createGameScreen } from "./gameScreen";
import { createMainMenuScreen } from "./mainMenu";
import { initScreenRouter, setFallbackScreen, showScreen } from "./screen";
import { createSession } from "./session";

/**
 * The final screen: a finished state renders the ending's text plus the
 * flag-selected vignettes, routes back to the main menu, and — the
 * finished-save contract — reopening a game-complete save lands on the
 * epilogue instead of a dead hub. Canvas is stubbed as in flow.test.
 */

function finishedState(flags: Record<string, FlagValue> = {}): GameState {
  const state = createNewGame({ playerName: "Vex", seed: 3 });
  return {
    ...state,
    location: "auric-spire",
    flags: {
      "game-complete": true,
      ending: "ending-freehold",
      "act3-outcome": "freehold",
      "steps-independent": true,
      ...flags,
    },
  };
}

function textOf(selector: string): string {
  return document.querySelector(selector)?.textContent ?? "";
}

/** Canvas stub proxy, as in flow.test. */
function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

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

describe("epilogue screen", () => {
  it("renders the ending text and the flag-selected vignettes", () => {
    const session = createSession(finishedState({ "ally-cistern-court": true }));
    showScreen(createEpilogueScreen({ session }));

    expect(textOf(".nf-epilogue")).toMatch(/The Freehold Dark/);
    expect(textOf(".nf-epilogue")).toMatch(/Epilogue — The Meridian Sprawl/);
    const headings = [
      ...document.querySelectorAll(".nf-epilogue-vignette h3"),
    ].map((h) => h.textContent);
    expect(headings).toContain("Greywater Steps");
    expect(headings).toContain("The Cistern Court");
    expect(headings).toContain("The Meridian Sprawl");
    // A loyal Court reads differently from a betrayed one.
    expect(textOf(".nf-epilogue")).toMatch(/terrace tea/);
  });

  it("returns to the main menu from the epilogue", () => {
    const session = createSession(finishedState());
    showScreen(createEpilogueScreen({ session }));
    const back = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Return to Main Menu"),
    );
    back?.click();
    expect(
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "New Game",
      ),
    ).toBe(true);
  });

  it("degrades to vignettes only when the ending id is unknown", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const session = createSession(finishedState({ ending: "ending-nope" }));
    showScreen(createEpilogueScreen({ session }));
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("ending-nope"));
    expect(document.querySelectorAll(".nf-epilogue-vignette").length)
      .toBeGreaterThan(0);
  });
});

describe("finished saves", () => {
  it("reopens a game-complete save to the epilogue, not the hub", () => {
    const session = createSession(finishedState());
    showScreen(createGameScreen({ session }));
    expect(document.querySelector(".nf-epilogue")).not.toBeNull();
    expect(document.querySelector(".nf-hud")).toBeNull();
    expect(textOf(".nf-epilogue")).toMatch(/The Freehold Dark/);
  });
});

describe("final ending handoff", () => {
  it("routes a final ending's dialogue straight to the epilogue and autosaves finished", () => {
    const base = createNewGame({ playerName: "Vex", seed: 3 });
    const session = createSession({
      ...base,
      location: "auric-spire",
      flags: { "hex-exchange": true },
    });
    // Open the game screen with the last ending node as live dialogue.
    showScreen(createGameScreen({ session, dialogueNodeId: "a3-end-ghost" }));
    const seal = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Listen until the song settles"),
    );
    expect(seal).toBeTruthy();
    seal!.click();

    expect(document.querySelector(".nf-epilogue")).not.toBeNull();
    expect(textOf(".nf-epilogue")).toMatch(/The Caretaker Signal/);
    // The autosave is a finished save: game-complete + the ending flag.
    const raw = localStorage.getItem("neon-fable:save:autosave");
    const saved = JSON.parse(raw!).state;
    expect(saved.flags["game-complete"]).toBe(true);
    expect(saved.flags["ending"]).toBe("ending-ghost");
  });
});
