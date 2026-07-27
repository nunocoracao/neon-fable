// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NG_PLUS_BONUS_POINTS,
  emptyMetaProgress,
  recordCompletionToStorage,
  saveMetaProgress,
} from "../state";
import { createCodexScreen } from "./codexScreen";
import { createMainMenuScreen } from "./mainMenu";
import { initScreenRouter, setFallbackScreen, showScreen } from "./screen";

/**
 * Meta-progression UI: the endings codex (locked hints vs discovered
 * titles, found X/Y), the main menu's New Game+ unlock, and the NG+
 * character-create flow whose carry-over lands in the new run's own
 * GameState. Canvas is stubbed as in flow.test for the create flow.
 */

function textOf(selector: string): string {
  return document.querySelector(selector)?.textContent ?? "";
}

function buttons(): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")];
}

function button(label: string): HTMLButtonElement | undefined {
  return buttons().find((b) => b.textContent?.includes(label));
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

function finishARun(): void {
  recordCompletionToStorage(
    {
      endingId: "ending-freehold",
      epilogueIds: ["city-freehold"],
      legacyItemIds: ["wpn-shard-knife", "cyb-warden-optics"],
    },
    localStorage,
  );
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

describe("endings codex screen", () => {
  it("shows every final ending locked, hint only, before any completion", () => {
    showScreen(createCodexScreen({ onBack: () => {} }));
    const entries = [...document.querySelectorAll(".nf-codex-entry")];
    expect(entries.length).toBeGreaterThanOrEqual(4);
    expect(document.querySelectorAll(".nf-codex-locked").length).toBe(
      entries.length,
    );
    expect(textOf(".nf-codex-stats")).toContain(
      `Endings found 0/${entries.length}`,
    );
    // Locked entries tease without leaking titles or epilogue text.
    expect(textOf(".nf-codex-list")).not.toContain("The Freehold Dark");
    expect(textOf(".nf-codex-list")).toContain("???");
    expect(textOf(".nf-codex-list")).toContain("Some say");
  });

  it("unlocks discovered endings with title and summary, and counts stats", () => {
    finishARun();
    showScreen(createCodexScreen({ onBack: () => {} }));
    const found = [...document.querySelectorAll(".nf-codex-found")];
    expect(found.length).toBe(1);
    expect(found[0]?.textContent).toContain("The Freehold Dark");
    expect(found[0]?.textContent).toContain("master title");
    const total = document.querySelectorAll(".nf-codex-entry").length;
    expect(textOf(".nf-codex-stats")).toContain(`Endings found 1/${total}`);
    expect(textOf(".nf-codex-stats")).toContain("completed: 1");
  });

  it("is reachable from the main menu and backs out again", () => {
    showScreen(createMainMenuScreen());
    button("Endings Codex")!.click();
    expect(document.querySelector(".nf-codex")).not.toBeNull();
    button("Back")!.click();
    expect(button("New Game")).toBeTruthy();
  });
});

describe("New Game+ unlock on the main menu", () => {
  it("hides New Game+ until a playthrough has been completed", () => {
    showScreen(createMainMenuScreen());
    expect(button("New Game+")).toBeUndefined();
  });

  it("offers New Game+ once meta-progress has a completion", () => {
    finishARun();
    showScreen(createMainMenuScreen());
    expect(button("New Game+")).toBeTruthy();
  });

  it("tolerates corrupt meta-progress by treating it as empty", () => {
    localStorage.setItem("neon-fable:meta", "{broken json");
    showScreen(createMainMenuScreen());
    expect(button("New Game")).toBeTruthy();
    expect(button("New Game+")).toBeUndefined();
  });
});

describe("New Game+ character creation", () => {
  function allocateEverything(): void {
    // Click every enabled "+" until the pool is spent.
    for (let clicks = 0; clicks < 40; clicks++) {
      const plus = buttons().find((b) => b.textContent === "+" && !b.disabled);
      if (!plus) return;
      plus.click();
    }
  }

  it("labels the bonus, offers the legacy picks, and stamps the new run", () => {
    finishARun();
    showScreen(createMainMenuScreen());
    button("New Game+")!.click();

    expect(textOf(".nf-create")).toContain("New Runner — New Game+");
    expect(textOf(".nf-create")).toContain(
      `+${NG_PLUS_BONUS_POINTS} point-buy points`,
    );
    expect(textOf(".nf-create")).toContain(
      `(15 + ${NG_PLUS_BONUS_POINTS} legacy points)`,
    );
    // Legacy picks: both carried items plus the travel-light option.
    expect(button("Shard Knife")).toBeTruthy();
    expect(button("Warden Optics")).toBeTruthy();
    expect(button("Travel light")).toBeTruthy();

    button("Warden Optics")!.click();
    const nameInput =
      document.querySelector<HTMLInputElement>("#nf-name-input")!;
    nameInput.value = "Echo";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    allocateEverything();
    expect(textOf(".nf-remaining")).toContain("Points remaining: 0");
    button("Jack In")!.click();

    // The new run mounted (intro dialogue over the hub) and autosaved
    // with the NG+ carry-over in its own GameState.
    const raw = localStorage.getItem("neon-fable:save:autosave");
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw!).state;
    expect(saved.player.name).toBe("Echo");
    expect(saved.flags["ng-plus"]).toBe(true);
    expect(saved.flags["ng-plus-carryover"]).toBe("cyb-warden-optics");
    expect(
      saved.inventory.stacks.some(
        (s: { itemId: string }) => s.itemId === "cyb-warden-optics",
      ),
    ).toBe(true);
  });

  it("plain New Game is untouched by the unlock", () => {
    finishARun();
    showScreen(createMainMenuScreen());
    button("New Game")!.click();
    expect(textOf(".nf-create")).toContain("New Runner");
    expect(textOf(".nf-create")).not.toContain("New Game+");
    expect(textOf(".nf-create")).toContain("(15 points)");
    expect(button("Travel light")).toBeUndefined();
  });

  it("skips legacy ids that no longer resolve to items", () => {
    saveMetaProgress(
      {
        ...emptyMetaProgress(),
        completions: 1,
        ngPlusUnlocked: true,
        legacyItemIds: ["itm-retired-content", "wpn-shard-knife"],
      },
      localStorage,
    );
    showScreen(createMainMenuScreen());
    button("New Game+")!.click();
    expect(button("Shard Knife")).toBeTruthy();
    expect(button("itm-retired-content")).toBeUndefined();
  });
});
