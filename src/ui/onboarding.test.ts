// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WIZARD_STEPS } from "../character";
import { WIZARD_STEP_HELP } from "../data/hints";
import { emptyMetaProgress, saveMetaProgress } from "../state";
import { DEFAULT_SETTINGS, settings } from "../settings";
import { createCharacterCreateScreen } from "./characterCreate";
import { getActiveSession } from "./session";
import { initScreenRouter, showScreen } from "./screen";
import { createMainMenuScreen } from "./mainMenu";

/**
 * Onboarding as the two screens a brand-new player meets first: the
 * creation wizard, which explains itself exactly once per player, and
 * the line under the Next button, which is guidance and not a telling
 * off.
 *
 * The hint chips themselves are covered in ./hintLayer.test.ts and the
 * rules behind them in src/narrative/hints.test.ts.
 */

/** A value whose every property/call yields another such value. */
function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").trim().startsWith(text),
  );
}

function click(text: string): void {
  const button = buttonByText(text);
  if (!button) throw new Error(`no button labelled "${text}"`);
  if (button.disabled) throw new Error(`button "${text}" is disabled`);
  button.click();
}

function pressKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
}

function setName(value: string): void {
  const input = document.getElementById("nf-name-input") as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

function helpEl(): HTMLElement | null {
  return document.querySelector(".nf-wizard-help");
}

function helpText(): string {
  return helpEl()?.textContent ?? "";
}

/** Walks the wizard to its last step, spending the pool on the way. */
function walkToReview(): void {
  setName("Vex");
  click("Next"); // background (prefilled)
  click("Next"); // stats
  for (const row of [0, 1, 2]) {
    for (let i = 0; i < 5; i++) {
      document
        .querySelectorAll(".nf-stat-row")
        [row]?.querySelectorAll("button")[1]
        ?.click();
    }
  }
  click("Next"); // appearance
  click("Next"); // review
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
  settings.update({ ...DEFAULT_SETTINGS });
  initScreenRouter(document.getElementById("ui-root")!);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("first-run helper text", () => {
  it("explains every step to a player who has never finished a run", () => {
    showScreen(createCharacterCreateScreen());
    expect(helpText()).toBe(WIZARD_STEP_HELP.identity);
    expect(helpEl()?.hidden).toBe(false);

    walkToReview();
    expect(helpText()).toBe(WIZARD_STEP_HELP.review);
  });

  it("follows the step backwards as well as forwards", () => {
    showScreen(createCharacterCreateScreen());
    setName("Vex");
    click("Next");
    expect(helpText()).toBe(WIZARD_STEP_HELP.background);
    click("Back");
    expect(helpText()).toBe(WIZARD_STEP_HELP.identity);
  });

  it("is gone entirely once a playthrough is on the record", () => {
    saveMetaProgress(
      { ...emptyMetaProgress(), completions: 1, ngPlusUnlocked: true },
      localStorage,
    );
    showScreen(createCharacterCreateScreen());
    expect(helpText()).toBe("");
    expect(helpEl()?.hidden).toBe(true);

    // Not on any later step either — a returning player gets the whole
    // wizard back clean, not just its first screen.
    walkToReview();
    expect(helpText()).toBe("");
  });

  it("says the same thing once, never twice on one step", () => {
    showScreen(createCharacterCreateScreen());
    const panel = document.querySelector(".nf-wizard");
    const occurrences = (panel?.textContent ?? "").split(
      "Pick the name the street will know you by",
    ).length;
    expect(occurrences).toBe(2); // one split → one occurrence
  });
});

describe("the line under Next", () => {
  it("names what the step still needs without calling it an error", () => {
    showScreen(createCharacterCreateScreen());
    const hint = document.querySelector(".nf-wizard-hint");
    expect(hint?.textContent).toMatch(/name/i);
    // A player who has been on the screen for half a second has not
    // failed at anything; the disabled Next is what says "not yet".
    expect(hint?.classList.contains("nf-error")).toBe(false);
    expect(buttonByText("Next")?.disabled).toBe(true);
  });

  it("clears itself once the step is satisfied", () => {
    showScreen(createCharacterCreateScreen());
    setName("Vex");
    expect(document.querySelector(".nf-wizard-hint")?.textContent).toBe("");
    expect(buttonByText("Next")?.disabled).toBe(false);
  });

  it("covers every step of the wizard with copy", () => {
    // Guards against a step being added with no helper line: the
    // catalog is the list, and the wizard is the list it must match.
    for (const step of WIZARD_STEPS) {
      expect(WIZARD_STEP_HELP[step]).toBeTruthy();
    }
  });
});

/**
 * And the same chips through the real screens, because "the first time
 * a system becomes relevant" is a claim about the game, not about the
 * layer: the map has to be a map before the walking hint is worth
 * anything, and the fight has to be the player's turn.
 */
function chipText(): string {
  return document.querySelector(".nf-hint-chip")?.textContent ?? "";
}

function flags(): Record<string, unknown> {
  return getActiveSession()?.state.flags ?? {};
}

/** New game through the wizard, landing in the intro dialogue. */
function startNewGame(): void {
  showScreen(createMainMenuScreen());
  click("New Game");
  walkToReview();
  click("Jack In");
}

/** The intro, played to the point where the plaza is handed back. */
function walkToTheStreet(): void {
  startNewGame();
  click("Delete the message");
  click("Keep walking");
  click("Remind him who ran his packages");
  click("Take the chair");
  click("Hear the job anyway");
  click("Walk away");
}

describe("hints in the game", () => {
  it("says nothing over the intro conversation", () => {
    startNewGame();
    expect(document.querySelector(".nf-dialogue")).toBeTruthy();
    expect(chipText()).toBe("");
  });

  it("teaches walking the moment the street is actually the player's", () => {
    walkToTheStreet();
    expect(document.querySelector(".nf-dialogue")).toBeNull();
    expect(chipText()).toMatch(/walk there/);
    expect(flags()["hint:hint-move"]).toBe(true);
  });

  it("dismisses on the chip's own button and does not come back", () => {
    walkToTheStreet();
    document.querySelector<HTMLButtonElement>(".nf-hint-dismiss")!.click();
    expect(document.querySelector(".nf-hint-chip")).toBeNull();

    // Open and close a panel: the map is handed back and re-offers, and
    // the hint it already spent stays spent.
    pressKey("i");
    pressKey("Escape");
    expect(document.querySelector(".nf-hint-chip")).toBeNull();
  });

  it("is silenced entirely by the setting, and records nothing", () => {
    settings.update({ hints: false });
    walkToTheStreet();
    expect(document.querySelector(".nf-hint-chip")).toBeNull();
    expect(flags()["hint:hint-move"]).toBeUndefined();
  });

  it("clears the chip while a panel is open", () => {
    walkToTheStreet();
    expect(document.querySelector(".nf-hint-chip")).toBeTruthy();
    pressKey("i");
    expect(document.querySelector(".nf-hint-chip")).toBeNull();
  });

  it("replays them after the settings panel's reset", () => {
    walkToTheStreet();
    document.querySelector<HTMLButtonElement>(".nf-hint-dismiss")!.click();
    expect(flags()["hint:hint-move"]).toBe(true);

    pressKey("Escape");
    click("Settings");
    document.querySelector<HTMLButtonElement>('[data-reset="hints"]')!.click();
    expect(flags()["hint:hint-move"]).toBeUndefined();

    // Back on the street, the run teaches itself again.
    click("Back");
    click("Resume");
    expect(chipText()).toMatch(/walk there/);
  });
});
