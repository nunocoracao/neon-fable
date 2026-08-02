// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECOVERY_SLOT,
  createMemoryStorage,
  createNewGame,
  readRecovery,
  saveGame,
  type GameState,
  type SaveStorage,
} from "../state";
import { createBudgetStorage } from "../state/testSupport";
import { createErrorScreen } from "./errorScreen";
import { createMainMenuScreen } from "./mainMenu";
import {
  initScreenRouter,
  installErrorBoundary,
  reportCrash,
  setFallbackScreen,
  showScreen,
  type Screen,
} from "./screen";
import { clearActiveSession, createSession } from "./session";

/**
 * The crash boundary, end to end: something throws, the run is stashed,
 * the player lands somewhere that explains it, and the main menu offers
 * the run back.
 */

function buttons(): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")];
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return buttons().find((b) => (b.textContent ?? "").trim().startsWith(text));
}

function click(text: string): void {
  const button = buttonByText(text);
  if (!button) throw new Error(`no button labelled "${text}"`);
  button.click();
}

function textOf(selector: string): string {
  return document.querySelector(selector)?.textContent ?? "";
}

function reportText(): string {
  return (
    document.querySelector<HTMLTextAreaElement>(".nf-crash-report")?.value ?? ""
  );
}

function playerState(): GameState {
  const state = createNewGame({ playerName: "Vexillography", seed: 3 });
  state.location = "greywater-steps";
  return state;
}

const thrower: Screen = {
  name: "combat",
  mount() {
    throw new Error("boom");
  },
  unmount() {},
};

/** A stand-in for anything the canvas API is asked for. */
function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  localStorage.clear();
  clearActiveSession();
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  initScreenRouter(document.getElementById("ui-root")!);
  setFallbackScreen(createMainMenuScreen);
});

afterEach(() => {
  clearActiveSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a screen that throws while mounting", () => {
  it("lands on the crash screen instead of a blank page", () => {
    showScreen(thrower);
    expect(textOf("#ui-root")).toMatch(/Something glitched/);
    expect(reportText()).toMatch(/error: Error: boom/);
    expect(reportText()).toMatch(/where: combat/);
    expect(errors).toHaveBeenCalled();
  });

  it("offers the way back the router was given", () => {
    showScreen(thrower);
    click("Main Menu");
    expect(buttonByText("New Game")).toBeTruthy();
  });

  it("does not loop when the crash screen itself cannot render", () => {
    const doubleTrouble: Screen = {
      mount() {
        throw new Error("first");
      },
      unmount() {
        throw new Error("second");
      },
    };
    expect(() => showScreen(doubleTrouble)).not.toThrow();
  });
});

describe("the recovery stash", () => {
  function sessionOn(storage: SaveStorage): void {
    createSession(playerState(), storage);
  }

  it("stashes the run in progress before showing the screen", () => {
    const storage = createMemoryStorage();
    sessionOn(storage);
    showScreen(thrower);

    expect(readRecovery(storage)?.run?.characterName).toBe("Vexillography");
    expect(reportText()).toMatch(/recovery stash: written/);
    expect(textOf(".nf-crash-panel")).toMatch(/stashed/);
  });

  it("says so plainly when there was no room to stash it", () => {
    sessionOn(createBudgetStorage(0));
    showScreen(thrower);
    expect(reportText()).toMatch(/recovery stash: not written/);
    expect(textOf(".nf-crash-panel")).toMatch(/last save is untouched/);
  });

  it("stashes nothing when nothing was being played", () => {
    showScreen(thrower);
    expect(reportText()).toMatch(/run: none in progress/);
  });

  it("is offered by the main menu, and only once", () => {
    saveGame(playerState(), RECOVERY_SLOT, window.localStorage, 5);
    showScreen(createMainMenuScreen());
    expect(buttonByText("Recover Run")).toBeTruthy();

    click("Recover Run");
    expect(textOf("#ui-root")).toMatch(/Greywater Steps/);
    expect(readRecovery(window.localStorage)).toBeNull();

    showScreen(createMainMenuScreen());
    expect(buttonByText("Recover Run")).toBeUndefined();
  });

  it("is not offered when there is nothing stashed", () => {
    showScreen(createMainMenuScreen());
    expect(buttonByText("Recover Run")).toBeUndefined();
  });
});

describe("the window-level boundary", () => {
  it("catches an exception that escaped a handler", () => {
    const teardown = installErrorBoundary(window);
    showScreen(createMainMenuScreen());

    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("out of nowhere") }),
    );
    expect(textOf("#ui-root")).toMatch(/Something glitched/);
    expect(reportText()).toMatch(/out of nowhere/);
    expect(reportText()).toMatch(/caught: during play/);
    teardown();
  });

  it("catches a rejected promise nobody awaited", () => {
    const teardown = installErrorBoundary(window);
    showScreen(createMainMenuScreen());

    const event = new Event("unhandledrejection") as Event & {
      reason?: unknown;
    };
    event.reason = new Error("nobody was listening");
    window.dispatchEvent(event);

    expect(reportText()).toMatch(/nobody was listening/);
    expect(reportText()).toMatch(/caught: in a background task/);
    teardown();
  });

  it("stops catching once torn down", () => {
    const teardown = installErrorBoundary(window);
    teardown();
    showScreen(createMainMenuScreen());
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("x") }));
    expect(buttonByText("New Game")).toBeTruthy();
  });
});

describe("the report on screen", () => {
  it("keeps the save out of the clipboard until the player asks", async () => {
    const copied: string[] = [];
    const screen = createErrorScreen({
      context: {
        error: new Error("boom"),
        screen: "game",
        origin: "mount",
        state: playerState(),
        stashed: true,
        at: 1_700_000_000_000,
      },
      copyText: async (text) => void copied.push(text),
    });
    showScreen(screen);

    click("Copy report");
    await Promise.resolve();
    expect(copied[0]).not.toMatch(/Vexillography/);
    expect(copied[0]).toMatch(/save data: not included/);

    const include = document.querySelector<HTMLInputElement>(
      ".nf-crash-include input",
    )!;
    include.checked = true;
    include.dispatchEvent(new Event("change"));
    expect(reportText()).toMatch(/Vexillography/);

    click("Copy report");
    await Promise.resolve();
    expect(copied[1]).toMatch(/Vexillography/);
  });

  it("says so rather than throwing when the clipboard refuses", async () => {
    showScreen(
      createErrorScreen({
        context: {
          error: new Error("boom"),
          screen: "game",
          origin: "window",
          state: null,
          stashed: false,
          at: 1,
        },
        copyText: () => Promise.reject(new Error("denied")),
      }),
    );
    click("Copy report");
    await Promise.resolve();
    await Promise.resolve();
    expect(textOf(".nf-crash-status")).toMatch(/Could not reach the clipboard/);
  });

  it("reloads through the hook it was given", () => {
    const reload = vi.fn();
    showScreen(
      createErrorScreen({
        context: {
          error: "a thrown string",
          screen: "",
          origin: "promise",
          state: null,
          stashed: false,
          at: 1,
        },
        onReload: reload,
      }),
    );
    click("Reload");
    expect(reload).toHaveBeenCalled();
    expect(textOf(".nf-crash-headline")).toBe("a thrown string");
  });
});

describe("reportCrash", () => {
  it("can be called directly by code that catches its own errors", () => {
    showScreen(createMainMenuScreen());
    reportCrash(new Error("handled here"), "window", "inventory");
    expect(reportText()).toMatch(/where: inventory/);
  });
});

describe("leaving the title screen behind", () => {
  it("stashes nothing for a crash with no run in progress", () => {
    const storage = createMemoryStorage();
    createSession(playerState(), storage);
    // Walking back to the title ends the run as far as the stash is
    // concerned — otherwise a crash on the menu would bury the stash
    // the player came there to recover.
    showScreen(createMainMenuScreen());
    showScreen(thrower);

    expect(readRecovery(storage)).toBeNull();
    expect(reportText()).toMatch(/recovery stash: not written/);
  });
});
