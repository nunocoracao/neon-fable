// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseStats, createCharacter } from "../character";
import { getBackground } from "../data";
import { DEFAULT_SETTINGS, SETTINGS_KEY, settings } from "../settings";
import { createNewGame, type GameState } from "../state";
import { createCharacterCreateScreen } from "./characterCreate";
import { findFightSeed, replayStep } from "./combatTestSupport";
import { createGameScreen } from "./gameScreen";
import { initScreenRouter, showScreen } from "./screen";
import { createMainMenuScreen } from "./mainMenu";
import { createSession } from "./session";

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
 * appearance (stock look) -> review -> Jack In. */
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
  const background = getBackground("gutter-courier")!;
  const allocation = baseStats();
  allocation.body += 5;
  allocation.tech += 5;
  allocation.intelligence += 5;
  const character = createCharacter({ name: "Vex", background, allocation });
  return createNewGame({ character, seed });
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
    expect(settings.get().reducedMotion).toBe(true);
    expect(localStorage.getItem(SETTINGS_KEY)).toMatch(
      /"reducedMotion":true/,
    );
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
      /reducedMotion/,
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
    // Appearance placeholder: portrait preview plus stock/random controls.
    expect(
      document.querySelector(".nf-appearance-preview canvas.nf-portrait"),
    ).toBeTruthy();
    expect(buttonByText("Randomize Look")).toBeTruthy();
    click("Next");
    expect(textOf(".nf-wizard-body")).toMatch(/Vex/);
    expect(textOf(".nf-wizard-body")).toMatch(/Max HP: 39/);
    // The stats section's edit link jumps back to the stats step.
    document
      .querySelectorAll<HTMLButtonElement>(".nf-review-edit")[2]
      ?.click();
    expect(textOf(".nf-remaining")).toMatch(/Points remaining: 0/);
    // Number-row hotkey jumps straight back to review.
    pressKey("5");
    expect(buttonByText("Jack In")).toBeTruthy();
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

    // Victory overlay, then dialogue resumes at the post-combat node;
    // rewards paid (75 + 40).
    expect(textOf(".nf-combat-outcome")).toMatch(/Victory/);
    click("Continue");
    expect(textOf(".nf-dialogue-text")).toMatch(/junction box/);
    expect(textOf(".nf-hud-status")).toMatch(/115 cr/);

    // Finish the thread: end marker closes dialogue and toasts the ending.
    click("Head back to the Filament");
    click("Hand over the spike");
    expect(document.querySelector(".nf-dialogue")).toBeNull();
    expect(textOf(".nf-toast")).toMatch(/job-done/);
    expect(textOf(".nf-hud-status")).toMatch(/315 cr/);
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

describe("act 1 chapter flow", () => {
  /** Mounts the game screen on a mid-chapter state with dialogue open. */
  function mountAt(nodeId: string, location: string): void {
    const state: GameState = { ...testCharacterState(1), location };
    showScreen(
      createGameScreen({ session: createSession(state), dialogueNodeId: nodeId }),
    );
  }

  it("travel choices move the player to the destination map", () => {
    mountAt("a1-ascend", "greywater-steps");
    expect(textOf(".nf-hud-status")).toMatch(/Greywater Steps/);
    click("Climb to Cinder Row");
    expect(document.querySelector(".nf-dialogue")).toBeNull();
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
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

    // Save to Slot 1 -> metadata row appears.
    document.querySelectorAll(".nf-save-row")[0]?.querySelector("button")?.click();
    expect(textOf(".nf-save-meta")).toMatch(/Vex — Cinder Row Plaza — \d{4}-/);

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
