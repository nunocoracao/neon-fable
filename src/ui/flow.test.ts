// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  baseStats,
  presetAppearanceFor,
  randomizeUnlocked,
} from "../character";
import { fixtureAppearance, fixtureCharacter } from "../character/testSupport";
import { backgroundPresets, getAppearanceOption } from "../data";
import { perks } from "../data/perks";
import { createRng } from "../state/rng";
import { DEFAULT_SETTINGS, SETTINGS_KEY, settings } from "../settings";
import {
  TRANSITION_CUT,
  TRANSITION_TIMING,
  transitionDurationMs,
  transitionSwapMs,
} from "../iso/transition";
import { noAssists } from "../data/assists";
import {
  DEFAULT_DIFFICULTY_ID,
  requireDifficulty,
} from "../data/difficulty";
import { createNewGame, loadGame, type GameState } from "../state";
import { createCharacterCreateScreen } from "./characterCreate";
import { findFightSeed, replayStep } from "./combatTestSupport";
import { createGameScreen } from "./gameScreen";
import { initScreenRouter, showScreen } from "./screen";
import { createMainMenuScreen } from "./mainMenu";
import { createSession } from "./session";
import { requireEncounter } from "../data/encounters";

/**
 * Integration test of the DOM screens: drives the real UI (main menu ->
 * character creation -> intro dialogue -> combat -> inventory ->
 * save/load) through clicks and key events in happy-dom. The canvas 2D
 * context is stubbed — iso rendering itself is not under test, only that
 * the screens wire the pure systems together correctly. The battle is
 * replayed from a scripted engine simulation under a scanned RNG seed
 * (Date.now is mocked to that seed), so the fight is deterministic.
 */

/** A value whose every property/call yields another such value — enough to
 * satisfy the canvas 2D API without rendering anything. */
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

function setName(value: string): void {
  const input = document.getElementById("nf-name-input") as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

/** Clicks a stat row's +/− button (buttons[1] is +, buttons[0] is −). */
function bumpStat(row: number, times: number): void {
  for (let i = 0; i < times; i++) {
    const rows = document.querySelectorAll(".nf-stat-row");
    const plus = rows[row]?.querySelectorAll("button")[1];
    if (!plus) throw new Error(`no + button on stat row ${row}`);
    plus.click();
  }
}

/** New game -> named character with body/tech/intelligence maxed out and
 * reflexes/cool left at minimum, so stat gates fail visibly later.
 * Walks the whole wizard: identity -> background (default) -> stats ->
 * appearance (background preset look) -> review -> Jack In. */
function createTestCharacter(): void {
  click("New Game");
  setName("Vex");
  click("Next"); // background
  click("Next"); // stats
  bumpStat(0, 5); // body
  bumpStat(2, 5); // tech
  bumpStat(4, 5); // intelligence
  click("Next"); // appearance
  click("Next"); // review
  click("Jack In");
}

/** The GameState createTestCharacter produces for a given RNG seed —
 * used to script the intro-arc battle engine-side before replaying it
 * through the UI. Nothing on the dialogue path to the fight draws RNG or
 * changes combat inputs, so combat setup matches the live session's. */
function testCharacterState(seed: number): GameState {
  const allocation = baseStats();
  allocation.body += 5;
  allocation.tech += 5;
  allocation.intelligence += 5;
  return createNewGame({ character: fixtureCharacter({ allocation }), seed });
}

/** A seed whose scripted enc-auric-scout fight ends in victory. */
const AURIC_WIN = findFightSeed(
  testCharacterState,
  "enc-auric-scout",
  (fight) => fight.status === "victory",
);

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  localStorage.clear();
  // The settings store is a module singleton; reset it (and the
  // reduced-motion class its subscription mirrors) between tests.
  settings.update({ ...DEFAULT_SETTINGS });
  initScreenRouter(document.getElementById("ui-root")!);
  showScreen(createMainMenuScreen());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("main menu", () => {
  it("enables New Game and disables Continue without saves", () => {
    expect(buttonByText("New Game")?.disabled).toBe(false);
    expect(buttonByText("Continue")?.disabled).toBe(true);
  });

  it("shows the settings screen and returns", () => {
    click("Settings");
    expect(document.querySelector(".nf-settings")).toBeTruthy();
    click("Back");
    expect(buttonByText("New Game")).toBeTruthy();
  });

  it("arrow keys move focus through the menu, skipping disabled buttons", () => {
    expect(document.activeElement?.textContent).toBe("New Game");
    // Continue is disabled (no saves), so ArrowDown lands on Load Game.
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.activeElement?.textContent).toBe("Load Game");
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(document.activeElement?.textContent).toBe("New Game");
    // ArrowUp from the top wraps to the last control.
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(document.activeElement?.textContent).toBe("Settings");
  });
});

describe("settings", () => {
  it("persists a text-speed change from the main menu across screens", () => {
    click("Settings");
    expect(buttonByText("Normal")?.classList.contains("nf-selected")).toBe(
      true,
    );
    click("Instant");
    expect(localStorage.getItem(SETTINGS_KEY)).toMatch(
      /"textSpeed":"instant"/,
    );
    click("Back");
    // Reopening shows the persisted selection, aria-pressed included.
    click("Settings");
    const instant = buttonByText("Instant");
    expect(instant?.classList.contains("nf-selected")).toBe(true);
    expect(instant?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".nf-controls-row")).toBeTruthy();
    click("Back");
  });

  it("opens in-game from the pause menu without losing game state", () => {
    createTestCharacter();
    click("Delete the message");
    click("Keep walking");
    click("Remind him who ran his packages");
    click("Take the chair");
    click("Hear the job anyway");
    click("Walk away");

    pressKey("Escape");
    expect(document.querySelector(".nf-system-menu")).toBeTruthy();
    click("Settings");
    expect(document.querySelector(".nf-settings")).toBeTruthy();

    // Toggling reduced motion persists and mirrors onto the root element.
    click("Reduced");
    expect(settings.get().motion).toBe("reduced");
    expect(localStorage.getItem(SETTINGS_KEY)).toMatch(/"motion":"reduced"/);
    expect(
      document.documentElement.classList.contains("nf-reduced-motion"),
    ).toBe(true);

    // Back returns to the pause menu; the game underneath is untouched.
    click("Back");
    expect(document.querySelector(".nf-system-menu")).toBeTruthy();
    click("Resume");
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
    // Settings live outside save slots.
    expect(localStorage.getItem("neon-fable:save:autosave")).not.toMatch(
      /"motion":/,
    );
  });

  it("dialogue text renders as a typewriter at normal speed and plain when instant", () => {
    createTestCharacter();
    // Default speed: per-character spans with staggered reveal delays.
    const chars = document.querySelectorAll(".nf-dialogue-text .nf-reveal-char");
    expect(chars.length).toBeGreaterThan(10);
    expect((chars[0] as HTMLElement).style.animationDelay).toBe("0ms");
    expect((chars[10] as HTMLElement).style.animationDelay).toBe("280ms");
    // Full text is present immediately for assistive tech (and tests).
    expect(textOf(".nf-dialogue-text")).toMatch(/Rain drums/);

    settings.update({ textSpeed: "instant" });
    click("Reply: you'll take the meet");
    expect(
      document.querySelector(".nf-dialogue-text .nf-reveal-char"),
    ).toBeNull();
    expect(textOf(".nf-dialogue-text")).toMatch(/Wet Market/);
  });
});

describe("character creation wizard", () => {
  it("gates Next on per-step validity with an inline hint", () => {
    click("New Game");
    // Identity: no name yet.
    expect(buttonByText("Next")?.disabled).toBe(true);
    expect(textOf(".nf-wizard-hint")).toMatch(/name/i);
    setName("Vex");
    expect(buttonByText("Next")?.disabled).toBe(false);
    click("Next"); // background comes prefilled -> already valid
    click("Next");
    // Stats: pool unspent.
    expect(buttonByText("Next")?.disabled).toBe(true);
    expect(textOf(".nf-wizard-hint")).toMatch(/remaining points/i);
  });

  it("a character can be created keyboard-only through the roving tab order", () => {
    // Keyboard simulation: Tab moves through the document's tab stops
    // (tabIndex >= 0 only — roving grids expose exactly one), Enter
    // activates the focused button, arrows go to the key handlers.
    const active = (): HTMLElement => document.activeElement as HTMLElement;
    const tabbables = (): HTMLElement[] =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "button, input, select, textarea, [tabindex]",
        ),
      ].filter((el) => !el.hasAttribute("disabled") && el.tabIndex >= 0);
    const pressTabKey = (): void => {
      const stops = tabbables();
      const index = stops.indexOf(active());
      stops[(index + 1) % stops.length]?.focus();
    };
    const tabTo = (match: (el: HTMLElement) => boolean): void => {
      for (let i = 0; i < 100; i++) {
        pressTabKey();
        if (match(active())) return;
      }
      throw new Error("control not reachable by Tab");
    };
    const enter = (): void => active().click();
    const arrow = (key: string): void => {
      active().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    };
    const label = (el: HTMLElement): string => (el.textContent ?? "").trim();

    // Main menu opens focused on New Game; Enter starts the wizard.
    expect(label(active())).toBe("New Game");
    enter();
    // Identity: focus lands in the name field; type, Tab to Next, Enter.
    expect(active().id).toBe("nf-name-input");
    setName("Vex");
    tabTo((el) => label(el) === "Next");
    enter();
    // Background: focus enters the radiogroup; ArrowDown to the second
    // card, Enter selects it and focus survives the re-render.
    expect(active().classList.contains("nf-bg-card")).toBe(true);
    arrow("ArrowDown");
    enter();
    expect(active().getAttribute("aria-checked")).toBe("true");
    tabTo((el) => label(el) === "Next");
    enter();
    // Stats: spend the whole pool with Enter on the + buttons; focus
    // sticks to each button across re-renders via its focus key.
    // Reflexes first: the chosen background's starting sidearm needs 5.
    for (const stat of ["body", "reflexes", "tech"]) {
      tabTo((el) => el.dataset.focusKey === `stat:${stat}:plus`);
      for (let i = 0; i < 5; i++) enter();
      // Focus stays on the + button — or, once the pool empties and
      // every + disables, falls back to the row's − instead of <body>.
      expect(active().dataset.focusKey).toMatch(
        new RegExp(`^stat:${stat}:`),
      );
    }
    tabTo((el) => label(el) === "Next");
    enter();
    // Appearance: the picker tablist is the first stop; ArrowRight moves
    // without switching, Enter activates the Hair tab and keeps focus.
    expect(active().getAttribute("role")).toBe("tab");
    arrow("ArrowRight");
    expect(label(active())).toBe("Hair");
    expect(active().getAttribute("aria-selected")).toBe("false");
    enter();
    expect(active().getAttribute("aria-selected")).toBe("true");
    // Tab into the style grid (one stop, on the current selection),
    // arrow to a neighbor, Enter picks it, focus stays in place.
    tabTo((el) => el.dataset.category === "hairStyle");
    arrow("ArrowRight");
    const picked = active().dataset.id!;
    enter();
    expect(active().dataset.id).toBe(picked);
    expect(active().getAttribute("aria-checked")).toBe("true");
    tabTo((el) => label(el) === "Next");
    enter();
    // Review: Jack In is reachable and starts the game.
    tabTo((el) => label(el) === "Jack In");
    enter();
    expect(document.querySelector(".nf-dialogue")).toBeTruthy();
  });

  it("picks a difficulty on the review sheet and starts the run on it", () => {
    click("New Game");
    setName("Vex");
    click("Next"); // background
    click("Next"); // stats
    bumpStat(0, 5);
    bumpStat(2, 5);
    bumpStat(4, 5);
    click("Next"); // appearance
    click("Next"); // review

    // The section is on review, showing the default and its blurb.
    const section = document.querySelector(".nf-review-difficulty")!;
    expect(section).toBeTruthy();
    expect(section.textContent).toContain(
      requireDifficulty(DEFAULT_DIFFICULTY_ID).blurb,
    );
    expect(section.textContent).toContain("Changeable later from Settings");

    click("Blackout");
    expect(
      section.querySelector<HTMLButtonElement>('[data-value="blackout"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");

    click("Jack In");
    // The run started on it, the preference remembers it for the next
    // one, and the assists stayed off — they are not a creation choice.
    const saved = loadGame("autosave", localStorage);
    expect(saved.rules.difficulty).toBe("blackout");
    expect(saved.rules.difficultyChanged).toBe(false);
    expect(saved.rules.assists).toEqual(noAssists());
    expect(settings.get().difficulty).toBe("blackout");
  });

  it("marks the current step with aria-current and announces changes politely", () => {
    click("New Game");
    const currentChips = () =>
      [...document.querySelectorAll('[aria-current="step"]')].map(
        (chip) => chip.textContent,
      );
    expect(currentChips()).toEqual(["1Identity"]);
    const live = document.querySelector('[role="status"]')!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    setName("Vex");
    click("Next");
    expect(currentChips()).toEqual(["2Background"]);
    expect(live.textContent).toBe("Step 2 of 5: Background");
    // Selections announce through the same region.
    (
      document.querySelectorAll(".nf-bg-card")[1] as HTMLButtonElement
    ).click();
    expect(live.textContent).toMatch(/^Background: /);
  });

  it("keeps keyboard focus on the picked card across the re-render", () => {
    click("New Game");
    setName("Vex");
    click("Next");
    // Background list: labelled radiogroup, selection is the tab stop.
    const list = document.querySelector(".nf-bg-list");
    expect(list?.getAttribute("role")).toBe("radiogroup");
    const cards = () =>
      [...document.querySelectorAll<HTMLButtonElement>(".nf-bg-card")];
    expect(cards()[0]?.getAttribute("aria-checked")).toBe("true");
    expect(cards().map((c) => c.tabIndex)).toEqual([0, -1, -1]);
    cards()[1]!.focus();
    cards()[1]!.click();
    const active = document.activeElement as HTMLButtonElement;
    expect(active.classList.contains("nf-bg-card")).toBe(true);
    expect(active.getAttribute("aria-checked")).toBe("true");
    expect(cards().indexOf(active)).toBe(1);
    // Same on the stats step: the clicked +/− keeps focus.
    click("Next");
    const plus = document
      .querySelectorAll(".nf-stat-row")[0]!
      .querySelectorAll("button")[1]!;
    plus.focus();
    plus.click();
    expect(
      (document.activeElement as HTMLElement).dataset.focusKey,
    ).toBe("stat:body:plus");
  });

  it("announces appearance picks by category and option label", () => {
    click("New Game");
    setName("Vex");
    click("Next");
    click("Next");
    bumpStat(0, 5);
    bumpStat(2, 5);
    bumpStat(4, 5);
    click("Next"); // appearance
    const live = document.querySelector('[role="status"]')!;
    // The hair grid lives on the Hair tab of the picker.
    buttonByText("Hair")?.click();
    document
      .querySelector<HTMLButtonElement>(
        'button.nf-thumb[data-category="hairStyle"][data-id="mohawk"]',
      )!
      .click();
    expect(live.textContent).toBe("Hair: Mohawk");
    click("Surprise Me");
    expect(live.textContent).toBe("Randomized look applied");
  });

  it("tracks remaining points and previews derived attributes", () => {
    click("New Game");
    setName("Vex");
    click("Next");
    click("Next");
    expect(textOf(".nf-remaining")).toMatch(/15/);
    bumpStat(0, 5);
    expect(textOf(".nf-remaining")).toMatch(/10/);
    // body 8 + courier bonus 1 = 9 -> maxHp 12 + 27 = 39.
    expect(textOf(".nf-derived")).toMatch(/Max HP: 39/);
  });

  it("preserves every choice across navigation in both directions", () => {
    click("New Game");
    setName("Vex");
    click("Next");
    // Pick the second background instead of the default.
    (
      document.querySelectorAll(".nf-bg-card")[1] as HTMLButtonElement
    ).click();
    click("Next");
    bumpStat(0, 3);
    click("Back");
    expect(
      document
        .querySelectorAll(".nf-bg-card")[1]
        ?.classList.contains("nf-selected"),
    ).toBe(true);
    click("Back");
    const input = document.getElementById("nf-name-input") as HTMLInputElement;
    expect(input.value).toBe("Vex");
    click("Next");
    click("Next");
    expect(
      document
        .querySelectorAll(".nf-stat-row")[0]
        ?.querySelector(".nf-stat-value")?.textContent,
    ).toBe("6");
  });

  it("review summarizes the draft, edit links and hotkeys jump between steps", () => {
    click("New Game");
    setName("Vex");
    click("Next");
    click("Next");
    bumpStat(0, 5);
    bumpStat(2, 5);
    bumpStat(4, 5);
    click("Next");
    // Appearance step: portrait preview plus stock/random controls.
    expect(
      document.querySelector(".nf-appearance-preview canvas.nf-portrait"),
    ).toBeTruthy();
    expect(buttonByText("Surprise Me")).toBeTruthy();
    click("Next");
    expect(textOf(".nf-wizard-body")).toMatch(/Vex/);
    expect(textOf(".nf-wizard-body")).toMatch(/Max HP: 39/);
    // The character sheet: full-size showcase render, gear names, and
    // the look in words from catalog labels.
    expect(document.querySelector(".nf-preview-showcase")).toBeTruthy();
    expect(
      document.querySelector(".nf-preview-showcase canvas.nf-portrait"),
    ).toBeTruthy();
    expect(textOf(".nf-review-gear")).toMatch(/Shard Knife/);
    expect(textOf(".nf-review-gear")).toMatch(/Courier Slicker/);
    const preset = backgroundPresets("gutter-courier")[0]!;
    expect(textOf(".nf-review-appearance")).toContain(
      getAppearanceOption("hairStyle", preset.appearance.hairStyle)!.label,
    );
    // The stats section's edit link jumps back to the stats step.
    document
      .querySelectorAll<HTMLButtonElement>(".nf-review-edit")[2]
      ?.click();
    expect(textOf(".nf-remaining")).toMatch(/Points remaining: 0/);
    // Number-row hotkey jumps straight back to review.
    pressKey("5");
    expect(buttonByText("Jack In")).toBeTruthy();
  });

  it("review edit links return to review via Done; Escape steps back", () => {
    click("New Game");
    setName("Vex");
    click("Next");
    click("Next");
    bumpStat(0, 5);
    bumpStat(2, 5);
    bumpStat(4, 5);
    click("Next");
    click("Next"); // review
    // Edit identity -> the identity step with a Done button back.
    document
      .querySelectorAll<HTMLButtonElement>(".nf-review-edit")[0]
      ?.click();
    expect(document.getElementById("nf-name-input")).toBeTruthy();
    setName("Nyx");
    click("Done");
    expect(buttonByText("Jack In")).toBeTruthy();
    expect(textOf(".nf-wizard-body")).toMatch(/Nyx/);
    // Escape on review returns to the appearance step, not the exit
    // confirm — the draft survives untouched.
    pressKey("Escape");
    expect(buttonByText("Surprise Me")).toBeTruthy();
    expect(document.querySelector(".nf-wizard-confirm")).toBeNull();
    // Plain navigation forward shows Next again, not Done.
    expect(buttonByText("Next")).toBeTruthy();
  });

  it("seeds the appearance step from the chosen background's first preset", () => {
    click("New Game");
    setName("Vex");
    click("Next");
    // Pick tower-analyst (second card) so the seed provably follows the
    // chosen background, not the default.
    (
      document.querySelectorAll(".nf-bg-card")[1] as HTMLButtonElement
    ).click();
    click("Next");
    bumpStat(0, 5);
    bumpStat(2, 5);
    bumpStat(4, 5);
    click("Next"); // appearance
    const [first, second] = backgroundPresets("tower-analyst");
    expect(textOf(".nf-appearance-summary")).toContain(
      getAppearanceOption("hairStyle", first!.appearance.hairStyle)!.label,
    );
    expect(textOf(".nf-appearance-summary")).toContain(
      getAppearanceOption("mouth", first!.appearance.mouth)!.label,
    );
    // Both presets show as portrait thumbs; the seeded one is selected,
    // and clicking the other applies it wholesale.
    const thumbs = document.querySelectorAll<HTMLButtonElement>(
      ".nf-preset-row button.nf-thumb",
    );
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]?.classList.contains("nf-selected")).toBe(true);
    thumbs[1]!.click();
    expect(textOf(".nf-appearance-summary")).toContain(
      getAppearanceOption("hairStyle", second!.appearance.hairStyle)!.label,
    );
    // Leaving and returning never re-seeds over the player's pick.
    click("Back");
    click("Next");
    expect(
      document
        .querySelectorAll<HTMLButtonElement>(
          ".nf-preset-row button.nf-thumb",
        )[1]
        ?.classList.contains("nf-selected"),
    ).toBe(true);
  });

  it("Surprise Me rolls the injected rng deterministically and honors locks", () => {
    showScreen(createCharacterCreateScreen({ appearanceRng: createRng(99) }));
    setName("Vex");
    click("Next");
    click("Next");
    bumpStat(0, 5);
    bumpStat(2, 5);
    bumpStat(4, 5);
    click("Next"); // appearance, seeded from gutter-courier's first preset
    const seeded = presetAppearanceFor("gutter-courier");

    // Lock hair style; the roll must leave it alone.
    const lock = document.querySelector<HTMLButtonElement>(
      '.nf-lock-row button[data-field="hairStyle"]',
    );
    lock!.click();
    expect(lock!.getAttribute("aria-pressed")).toBe("true");

    const expected = randomizeUnlocked(
      seeded,
      { hairStyle: true },
      createRng(99),
    );
    click("Surprise Me");
    const summary = textOf(".nf-appearance-summary");
    expect(summary).toContain(
      `Hair: ${getAppearanceOption("hairStyle", seeded.hairStyle)!.label}`,
    );
    expect(summary).toContain(
      `Skin tone: ${
        getAppearanceOption("skinTone", expected.value.skinTone)!.label
      }`,
    );
    expect(summary).toContain(
      `Eyes: ${getAppearanceOption("eyes", expected.value.eyes)!.label}`,
    );
    expect(summary).toContain(
      `Mouth: ${getAppearanceOption("mouth", expected.value.mouth)!.label}`,
    );

    // A second click continues the same deterministic sequence.
    const next = randomizeUnlocked(
      expected.value,
      { hairStyle: true },
      expected.state,
    );
    click("Surprise Me");
    expect(textOf(".nf-appearance-summary")).toContain(
      `Mouth: ${getAppearanceOption("mouth", next.value.mouth)!.label}`,
    );
    expect(textOf(".nf-appearance-summary")).toContain(
      `Hair: ${getAppearanceOption("hairStyle", seeded.hairStyle)!.label}`,
    );
  });

  it("escape leaves a clean draft silently and confirms a dirty one", () => {
    click("New Game");
    pressKey("Escape");
    expect(buttonByText("New Game")).toBeTruthy();

    click("New Game");
    setName("Vex");
    pressKey("Escape");
    expect(textOf(".nf-wizard-confirm")).toMatch(/Abandon/);
    click("Keep Editing");
    expect(document.querySelector(".nf-wizard-confirm")).toBeNull();
    expect(
      (document.getElementById("nf-name-input") as HTMLInputElement).value,
    ).toBe("Vex");
    pressKey("Escape");
    click("Discard Draft");
    expect(buttonByText("New Game")).toBeTruthy();
  });

  it("creates the character and opens the intro dialogue over the hub", () => {
    createTestCharacter();
    expect(textOf(".nf-dialogue-text")).toMatch(/Rain drums/);
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
    // Map transition autosave fired.
    expect(localStorage.getItem("neon-fable:save:autosave")).not.toBeNull();
  });

  it("walks New Game+ with a bigger pool and a legacy pick", () => {
    showScreen(
      createCharacterCreateScreen({
        ngPlus: { bonusPoints: 3, legacyItemIds: ["wpn-shard-knife"] },
      }),
    );
    setName("Vex");
    click("Next");
    // Legacy carry-over rides the background step.
    expect(textOf(".nf-wizard-body")).toMatch(/Legacy carry-over/);
    expect(textOf(".nf-wizard-body")).toMatch(/Travel light/);
    click("Next");
    expect(textOf(".nf-wizard-body")).toMatch(/15 \+ 3 legacy points/);
    bumpStat(0, 5);
    bumpStat(2, 5);
    bumpStat(4, 5);
    // 15 spent, 3 legacy points still open.
    expect(buttonByText("Next")?.disabled).toBe(true);
    bumpStat(1, 3);
    click("Next");
    click("Next");
    expect(textOf(".nf-wizard-body")).toMatch(/Shard Knife/);
    click("Jack In");
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
  });

  it("ignores an NG+ carried look that no longer validates", () => {
    showScreen(
      createCharacterCreateScreen({
        ngPlus: {
          bonusPoints: 3,
          legacyItemIds: [],
          legacyAppearance: fixtureAppearance({ hairStyle: "retired-style" }),
        },
      }),
    );
    // No look note on identity, and the appearance step seeds from the
    // background preset exactly as a plain New Game would.
    expect(textOf(".nf-wizard-body")).not.toMatch(/look carries over/);
    setName("Vex");
    click("Next");
    click("Next");
    bumpStat(0, 5);
    bumpStat(2, 5);
    bumpStat(4, 5);
    bumpStat(1, 3);
    click("Next");
    const preset = backgroundPresets("gutter-courier")[0]!.appearance;
    const summary = textOf(".nf-appearance-summary");
    expect(summary).toContain(
      getAppearanceOption("skinTone", preset.skinTone)!.label,
    );
  });
});

describe("dialogue overlay", () => {
  it("plays the intro with gating: disabled reasons, hidden choices, flags", () => {
    createTestCharacter();
    click("Reply: you'll take the meet");
    expect(textOf(".nf-dialogue-text")).toMatch(/Wet Market/);

    // Stat gate fails (reflexes left at minimum) -> disabled with reason.
    const gated = buttonByText("Palm a trauma patch");
    expect(gated?.disabled).toBe(true);
    expect(gated?.textContent).toMatch(/\[Reflexes 8\]/);
    click("Keep walking");

    // Background gating: corp choice hidden, street choice visible,
    // item choice disabled with its requirement shown.
    const labels = buttons().map((b) => b.textContent ?? "");
    expect(labels.join("|")).not.toMatch(/guest-list policy/);
    expect(labels.join("|")).toMatch(/who ran his packages/);
    const bribe = buttonByText("Offer a trauma patch");
    expect(bribe?.disabled).toBe(true);
    expect(bribe?.textContent).toMatch(/Trauma Patch/);
    click("Remind him who ran his packages");

    // Flag gate: the "agreed" terms route to Sable's warm scene.
    click("Take the chair");
    expect(textOf(".nf-dialogue-text")).toMatch(/professional/);
    click("Pocket the advance");
    expect(textOf(".nf-hud-status")).toMatch(/75 cr/);
  });

  it("focuses the first choice and advances with number keys", () => {
    createTestCharacter();
    expect(document.activeElement?.classList.contains("nf-choice")).toBe(true);
    pressKey("1"); // first presented choice: take the meet
    expect(textOf(".nf-dialogue-text")).toMatch(/Wet Market/);
  });

  it("hands off to combat and resumes dialogue after a fought victory", () => {
    // Fix the RNG seed (createNewGame seeds from Date.now) so the battle
    // plays out exactly as the pre-scripted simulation did.
    vi.spyOn(Date, "now").mockReturnValue(AURIC_WIN.seed);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    createTestCharacter();
    click("Reply: you'll take the meet");
    click("Keep walking");
    click("Remind him who ran his packages");
    click("Take the chair");
    click("Pocket the advance");
    click("Take the job");
    click("Rush them before the sweep");
    vi.runAllTimers(); // enemies with higher initiative open the fight

    // start-combat effect -> the playable arena for the encounter.
    expect(textOf(".nf-combat-title")).toMatch(/Auric Scout Team/);
    expect(document.querySelector(".nf-initiative")).toBeTruthy();

    // Replay the scripted fight through the real controls; every step
    // flushes the enemy-turn timers it triggers.
    for (const step of AURIC_WIN.fight.steps) {
      replayStep(step, { click, pressKey });
      vi.runAllTimers();
    }

    // Victory overlay, then dialogue resumes at the post-combat node,
    // with the scout's own payout folded in.
    expect(textOf(".nf-combat-outcome")).toMatch(/Victory/);
    click("Continue");
    expect(textOf(".nf-dialogue-text")).toMatch(/junction box/);
    expect(textOf(".nf-hud-status")).toContain(
      `${75 + requireEncounter("enc-auric-scout").rewards.credits} cr`,
    );

    // Finish the thread: end marker closes dialogue and toasts the ending.
    click("Head back to the Filament");
    click("Hand over the spike");
    expect(document.querySelector(".nf-dialogue")).toBeNull();
    // A thread with no chapter panel behind it closes on a sentence,
    // never on the content id that named it.
    expect(textOf(".nf-toast")).toMatch(/That thread is closed/);
    expect(textOf(".nf-hud-status")).toContain(
      `${75 + requireEncounter("enc-auric-scout").rewards.credits + 200} cr`,
    );
  });
});

describe("inventory overlay", () => {
  it("opens with I, shows equipment and neural meter, closes with Escape", () => {
    createTestCharacter();
    click("Reply: you'll take the meet"); // leave the first node
    pressKey("i");
    expect(document.querySelector(".nf-inventory")).toBeNull(); // dialogue is modal
    click("Keep walking");
    click("Remind him who ran his packages");
    click("Take the chair");
    click("Pocket the advance");
    click("Walk away"); // end thread so overlays are free

    pressKey("i");
    expect(document.querySelector(".nf-inventory")).toBeTruthy();
    expect(textOf(".nf-neural")).toMatch(/Neural load 0\//);
    expect(textOf(".nf-inventory")).toMatch(/Shard Knife/);
    // The header shows the player portrait baked from appearance data.
    expect(
      document.querySelector(".nf-inventory-identity canvas.nf-portrait"),
    ).toBeTruthy();
    pressKey("Escape");
    expect(document.querySelector(".nf-inventory")).toBeNull();
  });

  it("routes actions through the pure functions and surfaces their errors", () => {
    // High-Reflexes character so the Wet Market theft gate passes and a
    // trauma patch lands in the pack at full health.
    click("New Game");
    setName("Vex");
    click("Next");
    click("Next");
    bumpStat(0, 5); // body
    bumpStat(1, 5); // reflexes -> passes the [Reflexes 8] gate
    bumpStat(2, 5); // tech
    click("Next");
    click("Next");
    click("Jack In");
    click("Reply: you'll take the meet");
    click("Palm a trauma patch");
    click("Remind him who ran his packages");
    click("Take the chair");
    click("Pocket the advance");
    click("Walk away"); // end the thread so overlays are free

    pressKey("i");
    // Healing at full HP is rejected by useConsumable, not by the UI.
    click("Use");
    expect(textOf(".nf-message")).toMatch(/full health/);

    // Unequip returns the weapon to the carried grid; equip moves it back.
    click("Unequip");
    expect(textOf(".nf-slot-value")).toBe("—");
    click("Equip");
    expect(textOf(".nf-slot-value")).toMatch(/Shard Knife|Courier Slicker/);
  });
});

describe("walking back into the Filament", () => {
  /**
   * The plaza's door is wired to the intro's bouncer for the whole run,
   * so a settled courier job has to close its own scenes behind it —
   * otherwise the door is a turnstile: cover charged again, Sable's
   * advance paid again, the same job offered again, forever.
   */
  function openDoorOn(flags: Record<string, string>): void {
    const base = testCharacterState(1);
    const state: GameState = {
      ...base,
      location: "cinder-plaza",
      flags: { ...base.flags, "sable-terms": "agreed", ...flags },
    };
    showScreen(
      createGameScreen({
        session: createSession(state),
        dialogueNodeId: "filament-door",
      }),
    );
  }

  it("charges the cover once, and knows the face afterwards", () => {
    openDoorOn({});
    expect(buttonByText("Pay the fifteen")).toBeTruthy();

    openDoorOn({ "intro-outcome": "delivered" });
    expect(buttonByText("Pay the fifteen")).toBeUndefined();
    const credits = textOf(".nf-hud-status");
    click("Let him finish");
    // Inside is the bar, not the job: no advance, no brief, no charge.
    expect(textOf(".nf-dialogue-text")).toMatch(/wet weeknight/);
    expect(buttonByText("Pocket the advance")).toBeUndefined();
    expect(textOf(".nf-hud-status")).toBe(credits);

    click("Sable's at the corner table");
    expect(textOf(".nf-dialogue-text")).toMatch(/The professional/);
    click("\"Another time.\"");
    // The visit ends on the Row with the panel closed, not on an ending.
    expect(document.querySelector(".nf-dialogue")).toBeNull();
    expect(document.querySelector(".nf-chapter-end")).toBeNull();
  });
});

describe("act 1 chapter flow", () => {
  /** Mounts the game screen on a mid-chapter state with dialogue open. */
  function mountAt(nodeId: string, location: string): void {
    const state: GameState = { ...testCharacterState(1), location };
    showScreen(
      createGameScreen({ session: createSession(state), dialogueNodeId: nodeId }),
    );
  }

  it("travel choices move the player to the destination map", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mountAt("a1-ascend", "greywater-steps");
    expect(textOf(".nf-hud-status")).toMatch(/Greywater Steps/);
    click("Climb to Cinder Row");
    expect(document.querySelector(".nf-dialogue")).toBeNull();

    // The map swaps behind the cover, not on the click: until then the
    // player is still standing on the map they are leaving.
    const transition = document.querySelector(".nf-transition");
    expect(transition).not.toBeNull();
    expect(textOf(".nf-hud-status")).toMatch(/Greywater Steps/);

    vi.advanceTimersByTime(transitionSwapMs(TRANSITION_TIMING));
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
    // ...and the destination is named while the screen is covered.
    expect(textOf(".nf-transition-card")).toMatch(/Cinder Row Plaza/);

    // The cover lifts and clears itself off the page.
    vi.advanceTimersByTime(transitionDurationMs(TRANSITION_TIMING));
    expect(document.querySelector(".nf-transition")).toBeNull();
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
  });

  it("reduced motion cuts to the destination instead of fading", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    settings.update({ motion: "reduced" });
    mountAt("a1-ascend", "greywater-steps");
    click("Climb to Cinder Row");

    // No fade to wait through — one tick and the player is there.
    vi.advanceTimersByTime(0);
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
    expect(textOf(".nf-transition-card")).toMatch(/Cinder Row Plaza/);

    vi.advanceTimersByTime(transitionDurationMs(TRANSITION_CUT));
    expect(document.querySelector(".nf-transition")).toBeNull();
  });

  it("leaving the map mid-transition abandons it rather than travelling", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mountAt("a1-ascend", "greywater-steps");
    click("Climb to Cinder Row");
    expect(document.querySelector(".nf-transition")).not.toBeNull();

    // Quitting to the menu before the swap must not drop the player
    // onto the destination a moment later.
    showScreen(createMainMenuScreen());
    expect(document.querySelector(".nf-transition")).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(document.querySelector(".nf-hud-status")).toBeNull();
    expect(buttonByText("New Game")).toBeDefined();
  });

  /**
   * Arrives on the Ventworks entry spawn, which stands directly below
   * the tram gate, and runs one frame so the scene has picked what it
   * is offering. Returns the captured frame callbacks.
   */
  function arriveBesideTheTramGate(): FrameRequestCallback[] {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return 1;
    });
    const state: GameState = {
      ...testCharacterState(1),
      location: "exchange-ventworks",
    };
    showScreen(createGameScreen({ session: createSession(state) }));
    return frames;
  }

  it("offers the way out by name, with where it leads and the key", () => {
    const frames = arriveBesideTheTramGate();

    // Nothing is claimed before the scene has run a frame.
    const hint = document.querySelector(".nf-interact-prompt");
    expect(hint?.classList.contains("nf-interact-prompt-visible")).toBe(false);

    frames[0]?.(0);
    expect(hint?.textContent).toBe("Enter — take Tram Gate → Cinder Row Plaza");
    expect(hint?.classList.contains("nf-interact-prompt-visible")).toBe(true);
  });

  it("the interact key acts on what the prompt is offering", () => {
    const frames = arriveBesideTheTramGate();
    frames[0]?.(0);
    expect(document.querySelector(".nf-dialogue")).toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    // The tram gate's dialogue is open; the same key inside dialogue
    // now belongs to the overlay, not to the scene.
    expect(document.querySelector(".nf-dialogue")).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(document.querySelectorAll(".nf-dialogue")).toHaveLength(1);
  });

  it("chapter endings open the chapter-end screen, not a toast", () => {
    mountAt("a1-end-court", "greywater-steps");
    click("Climb toward the bells");
    expect(textOf(".nf-chapter-end")).toMatch(/Chapter complete/);
    expect(textOf(".nf-chapter-end")).toMatch(/The Water Stands Still/);
    // The chapter state was autosaved before showing the epilogue.
    expect(localStorage.getItem("neon-fable:save:autosave")).not.toBeNull();
    click("Keep Exploring");
    expect(document.querySelector(".nf-chapter-end")).toBeNull();
  });

  it("reaches a second, different chapter outcome (voss route)", () => {
    mountAt("a1-end-voss", "greywater-steps");
    click("Take the writ");
    expect(textOf(".nf-chapter-end")).toMatch(/A Signature in Grey Ink/);
  });

  it("the act boundary plays an interlude once, replayable from the saves", () => {
    const session = createSession({
      ...testCharacterState(1),
      location: "greywater-steps",
    });
    showScreen(
      createGameScreen({ session, dialogueNodeId: "a1-end-court" }),
    );
    click("Climb toward the bells");
    click("Keep Exploring");

    // The vignette takes over from the chapter card, reading back the
    // route this run actually took.
    expect(textOf(".nf-interlude")).toMatch(/What the Night Set Moving/);
    expect(textOf(".nf-interlude-beats")).toMatch(/Ledge Nine/);
    // One press catches the beats up; the next one leaves.
    click("Skip");
    click("Continue");
    expect(document.querySelector(".nf-interlude")).toBeNull();

    // Walking back into the district does not play it again.
    showScreen(createGameScreen({ session }));
    expect(document.querySelector(".nf-interlude")).toBeNull();

    // The saves panel keeps it on offer as "Previously".
    click("Saves");
    expect(textOf(".nf-save-previously")).toMatch(/Previously/);
    click("Replay");
    expect(textOf(".nf-interlude")).toMatch(/What the Night Set Moving/);
  });

  it("a save reopened past the boundary still gets its interlude", () => {
    const session = createSession({
      ...testCharacterState(1),
      location: "greywater-steps",
      flags: { "act1-complete": true, "act1-outcome": "broadcast" },
    });
    showScreen(createGameScreen({ session }));
    expect(textOf(".nf-interlude-beats")).toMatch(/noodle stalls/);
    // Playing it is recorded on the run, so the next arrival is quiet.
    click("Skip");
    click("Continue");
    showScreen(createGameScreen({ session }));
    expect(document.querySelector(".nf-interlude")).toBeNull();
  });
});

describe("street cred and the perk pick", () => {
  /** A run the city has noticed: four fights won is past the first milestone. */
  function knownRun(): ReturnType<typeof createSession> {
    return createSession({
      ...testCharacterState(4),
      location: "greywater-steps",
      flags: {
        "combat:enc-a": "victory",
        "combat:enc-b": "victory",
        "combat:enc-c": "victory",
        "combat:enc-d": "victory",
      },
    });
  }

  it("nudges the player, then takes them from the HUD to a permanent pick", () => {
    const session = knownRun();
    showScreen(createGameScreen({ session }));

    // Arriving on the map says the street wants a word.
    expect(textOf(".nf-toast")).toMatch(/perk pick waiting/);

    // The Advance panel reports the cred and lists no perks yet.
    click("Advance");
    expect(textOf(".nf-advancement")).toMatch(/Street cred 8/);
    expect(textOf(".nf-perk-section")).toMatch(/None yet/);

    // Which hands off to the pick screen, offering the whole pool.
    click("Choose a Perk");
    expect(textOf(".nf-perks")).toMatch(/Cold Read/);
    expect(document.querySelectorAll(".nf-perk-card").length).toBe(perks.length);

    // Taking one is two clicks, and it sticks.
    const card = document.querySelector<HTMLElement>(
      '[data-perk="perk-ghost-step"]',
    )!;
    card.querySelector("button")!.click();
    expect(textOf(".nf-perks")).toMatch(/permanent/);
    document
      .querySelector<HTMLElement>('[data-perk="perk-ghost-step"] button')!
      .click();
    expect(session.state.player.advancement.perkIds).toEqual([
      "perk-ghost-step",
    ]);
    expect(
      textOf('[data-perk="perk-ghost-step"]'),
    ).toMatch(/Yours/);
    expect(textOf(".nf-perks")).toMatch(/No pick waiting/);

    // And the character panel now carries it, with what it does.
    pressKey("Escape");
    click("Advance");
    expect(textOf(".nf-perk-section")).toMatch(/Ghost Step/);
    expect(textOf(".nf-perk-section")).toMatch(/extra step of movement/);
  });

  it("says nothing at all to a run the street has not noticed", () => {
    showScreen(
      createGameScreen({
        session: createSession({
          ...testCharacterState(4),
          location: "greywater-steps",
        }),
      }),
    );
    expect(textOf(".nf-toast")).not.toMatch(/perk pick/);
    click("Advance");
    expect(textOf(".nf-advancement")).toMatch(/Street cred 0/);
    click("View Perks");
    expect(textOf(".nf-perks")).toMatch(/No pick waiting/);
    // Every card is on show and none of them can be taken.
    expect(document.querySelectorAll(".nf-perk-card button").length).toBe(0);
  });
});

describe("minimap", () => {
  /** Mounts the hub with the scene's frame callbacks captured. */
  function exploreTheHub(): FrameRequestCallback[] {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return 1;
    });
    showScreen(
      createGameScreen({ session: createSession(testCharacterState(1)) }),
    );
    return frames;
  }

  function collapsed(): boolean {
    const el = document.querySelector(".nf-minimap");
    if (!el) throw new Error("no minimap");
    return el.classList.contains("nf-minimap-collapsed");
  }

  it("rides along with the scene, expanded by default", () => {
    const frames = exploreTheHub();
    expect(document.querySelector(".nf-minimap-canvas")).not.toBeNull();
    expect(collapsed()).toBe(false);
    // The scene feeds it; nothing here should throw on the first frame.
    expect(() => frames[0]?.(0)).not.toThrow();
  });

  it("M collapses and expands it, and the choice is persisted", () => {
    exploreTheHub();
    pressKey("m");
    expect(collapsed()).toBe(true);
    expect(settings.get().minimap).toBe(false);
    expect(localStorage.getItem(SETTINGS_KEY)).toMatch(/"minimap":false/);

    pressKey("M");
    expect(collapsed()).toBe(false);
    expect(settings.get().minimap).toBe(true);
  });

  it("opens collapsed when that is what the player left it as", () => {
    settings.update({ minimap: false });
    exploreTheHub();
    expect(collapsed()).toBe(true);
  });

  it("its tab collapses it too, and reads its state without color", () => {
    exploreTheHub();
    const tab = document.querySelector<HTMLButtonElement>(".nf-minimap-tab");
    expect(tab?.getAttribute("aria-pressed")).toBe("true");
    tab?.click();
    expect(collapsed()).toBe(true);
    expect(tab?.getAttribute("aria-pressed")).toBe("false");
  });

  it("leaves M alone while an overlay covers the map", () => {
    exploreTheHub();
    pressKey("i");
    expect(document.querySelector(".nf-inventory")).not.toBeNull();
    pressKey("m");
    expect(collapsed()).toBe(false);
    expect(settings.get().minimap).toBe(true);
  });

  it("goes away with the screen", () => {
    exploreTheHub();
    showScreen(createMainMenuScreen());
    expect(document.querySelector(".nf-minimap")).toBeNull();
  });
});

/**
 * The Vertical Market round trip, driven through the real screens: the
 * hub's market gate up and the Cinderway stair back down. The district
 * is the first place in the game a player walks to and back off their
 * own bat, so both directions are exercised end to end — the gate's
 * dialogue, the transition, the map that comes up behind it, and the
 * stair standing next to where the stair puts you.
 */
describe("the Vertical Market round trip", () => {
  function mountOn(location: string, dialogueNodeId?: string): void {
    const state: GameState = { ...testCharacterState(1), location };
    showScreen(
      createGameScreen({ session: createSession(state), dialogueNodeId }),
    );
  }

  /** Runs one scene frame so the interact prompt has picked its target. */
  function firstFrame(): void {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return 1;
    });
    mountOn("vertical-market");
    frames[0]?.(0);
  }

  it("climbs the market gate out of the hub", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mountOn("cinder-plaza", "vm-gate");
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);

    click("Climb into the market");
    vi.advanceTimersByTime(transitionSwapMs(TRANSITION_TIMING));
    expect(textOf(".nf-transition-card")).toMatch(/The Vertical Market/);
    expect(textOf(".nf-hud-status")).toMatch(/The Vertical Market/);

    vi.advanceTimersByTime(transitionDurationMs(TRANSITION_TIMING));
    expect(document.querySelector(".nf-transition")).toBeNull();
    // Travel carried the arrival beat with it: you come off the stair
    // into the noise, with the whole district offered by name.
    expect(textOf(".nf-dialogue")).toMatch(/off the last tread into the noise/);
    expect(buttonByText("Work the north row")).toBeDefined();
    expect(buttonByText("Take a stool at the noodle counter")).toBeDefined();
  });

  it("takes the Cinderway stair back down to the plaza", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mountOn("vertical-market", "vm-stair");
    expect(textOf(".nf-hud-status")).toMatch(/The Vertical Market/);

    click("Take the stair down to Cinder Row");
    vi.advanceTimersByTime(transitionSwapMs(TRANSITION_TIMING));
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
    vi.advanceTimersByTime(transitionDurationMs(TRANSITION_TIMING));
    expect(document.querySelector(".nf-transition")).toBeNull();
  });

  it("lands you at the foot of the stair, and says where it goes", () => {
    firstFrame();
    const hint = document.querySelector(".nf-interact-prompt");
    expect(hint?.textContent).toBe(
      "Enter — take Cinderway Stair → Cinder Row Plaza",
    );
    expect(hint?.classList.contains("nf-interact-prompt-visible")).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(textOf(".nf-dialogue")).toMatch(/The Cinderway stair drops out/);
  });
});

/**
 * The Flooded Quays round trip, driven through the real screens: the
 * hub's lockgate down and the Lockgate Stair back up. Same shape as the
 * market's trip, and worth exercising separately because this is the
 * district that arrives under weather — the map behind the transition
 * is a rainy one, and it has to come up as the map, not as a mood.
 */
describe("the Flooded Quays round trip", () => {
  function mountOn(location: string, dialogueNodeId?: string): void {
    const state: GameState = { ...testCharacterState(1), location };
    showScreen(
      createGameScreen({ session: createSession(state), dialogueNodeId }),
    );
  }

  it("goes down the lockgate out of the hub", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mountOn("cinder-plaza", "fq-lock");
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);

    click("Take the stair down to the water");
    vi.advanceTimersByTime(transitionSwapMs(TRANSITION_TIMING));
    expect(textOf(".nf-transition-card")).toMatch(/The Flooded Quays/);
    expect(textOf(".nf-hud-status")).toMatch(/The Flooded Quays/);

    vi.advanceTimersByTime(transitionDurationMs(TRANSITION_TIMING));
    expect(document.querySelector(".nf-transition")).toBeNull();
    // Travel carried the arrival beat with it, and the whole district is
    // offered by name from it.
    expect(textOf(".nf-dialogue")).toMatch(/no more ground/);
    expect(buttonByText("Cross to the platform")).toBeDefined();
    expect(buttonByText("Take a walkway over to the wharf")).toBeDefined();
  });

  it("climbs the Lockgate Stair back up to the plaza", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mountOn("flooded-quays", "fq-stair");
    expect(textOf(".nf-hud-status")).toMatch(/The Flooded Quays/);

    click("Climb back up to Cinder Row");
    vi.advanceTimersByTime(transitionSwapMs(TRANSITION_TIMING));
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
    vi.advanceTimersByTime(transitionDurationMs(TRANSITION_TIMING));
    expect(document.querySelector(".nf-transition")).toBeNull();
  });

  it("puts the diver on the boards where you can walk up to her", () => {
    mountOn("flooded-quays", "fq-diver");
    expect(textOf(".nf-dialogue")).toMatch(/Mind the third plank/);
    // She is on the cast list, so the line comes with her face.
    expect(document.querySelector("canvas.nf-portrait")).not.toBeNull();
  });
});

/**
 * The Auric Spire's two floors, driven through the real screens: the
 * executive riser up off the concourse and back down again. Same shape
 * as the districts' round trips, and worth its own pass because this is
 * the first transition in the game that stays *inside* one building —
 * the map behind the fade is another interior, and the late-act scenes
 * on it have to come up with it.
 */
describe("the corp tower round trip", () => {
  function mountOn(location: string, dialogueNodeId?: string): void {
    const state: GameState = { ...testCharacterState(1), location };
    showScreen(
      createGameScreen({ session: createSession(state), dialogueNodeId }),
    );
  }

  /** Runs one scene frame so the interact prompt has picked its target. */
  function firstFrame(location: string): void {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return 1;
    });
    mountOn(location);
    frames[0]?.(0);
  }

  it("rides the executive riser up off the concourse", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mountOn("auric-spire", "a3-exec-lift");
    expect(textOf(".nf-hud-status")).toMatch(/Crown Concourse/);

    click("Put a hand on the plate");
    vi.advanceTimersByTime(transitionSwapMs(TRANSITION_TIMING));
    expect(textOf(".nf-transition-card")).toMatch(/Executive Floor/);
    expect(textOf(".nf-hud-status")).toMatch(/Executive Floor/);

    vi.advanceTimersByTime(transitionDurationMs(TRANSITION_TIMING));
    expect(document.querySelector(".nf-transition")).toBeNull();
    // Travel carried the arrival beat up with it, and the whole floor is
    // offered by name from it.
    expect(textOf(".nf-dialogue")).toMatch(/left rather than closed/);
    expect(buttonByText("Read the corner station")).toBeDefined();
    expect(buttonByText("Deal with the floor detail")).toBeDefined();
  });

  it("works the directors' floor and takes the riser back down", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mountOn("auric-executive", "a3-exec-floor");
    expect(textOf(".nf-hud-status")).toMatch(/Executive Floor/);

    // The desk pays out without clearing the detail; its own paperwork
    // does not (that gate is pinned in act3.test).
    click("Read the corner station");
    expect(textOf(".nf-dialogue")).toMatch(/nobody logged\s+out/);
    click("Pocket what the drawer");
    expect(textOf(".nf-dialogue")).toMatch(/left rather than closed/);

    click("Take the riser back down");
    click("Ride back down to the concourse");
    vi.advanceTimersByTime(transitionSwapMs(TRANSITION_TIMING));
    expect(textOf(".nf-hud-status")).toMatch(/Crown Concourse/);
    vi.advanceTimersByTime(transitionDurationMs(TRANSITION_TIMING));
    expect(document.querySelector(".nf-transition")).toBeNull();
    // ...and the concourse's own junction beat comes up with the map.
    expect(textOf(".nf-dialogue")).toMatch(/cliff of dead glass/);
  });

  it("lands you at the riser doors, and says where they go", () => {
    firstFrame("auric-executive");
    const hint = document.querySelector(".nf-interact-prompt");
    expect(hint?.textContent).toBe(
      "Enter — open Executive Riser → Auric Spire — Crown Concourse",
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(textOf(".nf-dialogue")).toMatch(/holding its car for you/);
  });

  it("posts the tower's security where you can walk up to them", () => {
    mountOn("auric-spire", "a3-security");
    expect(textOf(".nf-dialogue")).toMatch(/two square meters of/);
    // They are on the cast list, so the line comes with a face.
    expect(document.querySelector("canvas.nf-portrait")).not.toBeNull();
  });
});

describe("save/load", () => {
  function reachHubIdle(): void {
    createTestCharacter();
    click("Delete the message");
    click("Keep walking");
    click("Remind him who ran his packages");
    click("Take the chair");
    click("Hear the job anyway");
    click("Walk away");
  }

  it("saves to a slot, deletes with confirm, loads back into the game", () => {
    reachHubIdle();
    pressKey("Escape");
    expect(document.querySelector(".nf-system-menu")).toBeTruthy();
    click("Save / Load");

    // Save to Slot 1 -> the card fills in with who, where, and when.
    document.querySelectorAll(".nf-save-row")[0]?.querySelector("button")?.click();
    const slot1 = textOf(".nf-save-card");
    expect(slot1).toMatch(/Vex — Gutter Courier/);
    expect(slot1).toMatch(/Cinder Row Plaza/);
    expect(slot1).toMatch(/\d{4}-\d{2}-\d{2}/);

    // Delete requires a confirm click.
    click("Delete");
    expect(buttonByText("Confirm delete")).toBeTruthy();
    click("Confirm delete");
    expect(textOf(".nf-save-meta")).toMatch(/Empty/);

    // Save again and load through the panel -> back on the game screen.
    document.querySelectorAll(".nf-save-row")[1]?.querySelector("button")?.click();
    click("Load");
    expect(document.querySelector(".nf-saves")).toBeNull();
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
  });

  it("enables Continue once saves exist and resumes the newest one", () => {
    reachHubIdle();
    pressKey("Escape");
    click("Quit to Main Menu");
    const cont = buttonByText("Continue");
    expect(cont?.disabled).toBe(false);
    cont?.click();
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
  });
});
