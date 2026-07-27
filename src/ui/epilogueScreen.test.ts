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

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  localStorage.clear();
  initScreenRouter(document.getElementById("ui-root")!);
  setFallbackScreen(createMainMenuScreen);
});

afterEach(() => {
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
