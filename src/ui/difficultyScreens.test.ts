// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { noAssists } from "../data/assists";
import { DEFAULT_DIFFICULTY_ID, requireDifficulty } from "../data/difficulty";
import { DEFAULT_SETTINGS, settings } from "../settings";
import { createNewGame, defaultRules, type RunRules } from "../state";
import { createSettingsOverlay, createSettingsScreen } from "./settingsScreen";
import { initScreenRouter, showScreen } from "./screen";
import type { OverlayHandle } from "./overlay";

/**
 * The two places difficulty and the assists are set: the settings panel
 * (over a run, and without one) and — through the settings store the
 * wizard writes to — what a fresh run starts on.
 *
 * What is under test is the wiring: that a change reaches the record
 * that governs the run, that the preference follows it so the next run
 * remembers, and that moving the preset mid-run asks before it writes.
 */

function buttons(root: ParentNode = document): HTMLButtonElement[] {
  return [...root.querySelectorAll("button")];
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return buttons().find((b) => (b.textContent ?? "").trim() === text);
}

function click(text: string): void {
  const button = buttonByText(text);
  if (!button) throw new Error(`no button labelled "${text}"`);
  button.click();
}

/** The on/off pair belonging to one labelled setting row. */
function assistRow(label: string): HTMLButtonElement[] {
  const row = [...document.querySelectorAll(".nf-setting-row")].find(
    (candidate) =>
      candidate.querySelector(".nf-setting-label")?.textContent === label,
  );
  if (!row) throw new Error(`no setting row labelled "${label}"`);
  return [...row.querySelectorAll("button")];
}

/** Which preset button reads as chosen right now. */
function selectedDifficulty(): string | undefined {
  return buttons().find(
    (b) =>
      b.classList.contains("nf-selected") &&
      ["drift", "grind", "blackout"].includes(b.dataset.value ?? ""),
  )?.dataset.value;
}

let overlay: OverlayHandle | null = null;

/** Mounts the panel over a run, and reports what the run now says. */
function overRun(initial: RunRules = defaultRules()): {
  rules: () => RunRules;
  writes: number;
} {
  let rules = initial;
  const record = { writes: 0 };
  overlay = createSettingsOverlay({
    onClose: () => {},
    rules: {
      get: () => rules,
      set: (next) => {
        rules = next;
        record.writes += 1;
      },
    },
  });
  document.body.append(overlay.el);
  return { rules: () => rules, get writes() { return record.writes; } };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="ui-root"></div>';
  localStorage.clear();
  settings.update({ ...DEFAULT_SETTINGS });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  initScreenRouter(document.getElementById("ui-root")!);
});

afterEach(() => {
  overlay?.destroy();
  overlay = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the settings panel with no run behind it", () => {
  beforeEach(() => {
    showScreen(createSettingsScreen({ onBack: () => {} }));
  });

  it("says plainly that it is setting up the next run", () => {
    expect(
      [...document.querySelectorAll(".nf-setting-label")].some(
        (el) => el.textContent === "New runs start on",
      ),
    ).toBe(true);
  });

  it("offers every preset and starts on the middle one", () => {
    for (const preset of ["drift", "grind", "blackout"]) {
      expect(buttons().some((b) => b.dataset.value === preset)).toBe(true);
    }
    expect(selectedDifficulty()).toBe(DEFAULT_DIFFICULTY_ID);
  });

  it("changes the preference at once, with nothing to confirm", () => {
    click("Blackout");
    expect(settings.get().difficulty).toBe("blackout");
    expect(selectedDifficulty()).toBe("blackout");
    expect(document.querySelector<HTMLElement>(".nf-setting-confirm")?.hidden)
      .toBe(true);
  });

  it("shows the chosen preset's own blurb", () => {
    click("Drift");
    expect(document.body.textContent).toContain(
      requireDifficulty("drift").blurb,
    );
  });

  it("toggles each assist on its own row, independently", () => {
    assistRow("Damage floor")[0]!.click();
    expect(settings.get().assists).toEqual({
      ...noAssists(),
      "damage-floor": true,
    });
    assistRow("Bold telegraphs")[0]!.click();
    expect(settings.get().assists["bold-telegraphs"]).toBe(true);
    // And back off again, leaving its neighbour alone.
    assistRow("Damage floor")[1]!.click();
    expect(settings.get().assists).toEqual({
      ...noAssists(),
      "bold-telegraphs": true,
    });
  });
});

describe("the settings panel over a live run", () => {
  it("labels the row as this run's, and shows what it is on", () => {
    const run = overRun({ ...defaultRules(), difficulty: "drift" });
    expect(
      [...document.querySelectorAll(".nf-setting-label")].some(
        (el) => el.textContent === "This run",
      ),
    ).toBe(true);
    expect(selectedDifficulty()).toBe("drift");
    expect(run.rules().difficulty).toBe("drift");
  });

  it("asks before it writes, and writes nothing while it is asking", () => {
    const run = overRun();
    click("Blackout");
    const confirm = document.querySelector<HTMLElement>(".nf-setting-confirm");
    expect(confirm?.hidden).toBe(false);
    expect(confirm?.textContent).toContain("Blackout");
    expect(confirm?.textContent).toContain("record");
    expect(run.rules()).toEqual(defaultRules());
    expect(settings.get().difficulty).toBe(DEFAULT_DIFFICULTY_ID);
    expect(selectedDifficulty()).toBe(DEFAULT_DIFFICULTY_ID);
  });

  it("leaves everything as it was when the question is declined", () => {
    const run = overRun();
    click("Blackout");
    click("Keep playing");
    expect(run.rules()).toEqual(defaultRules());
    expect(settings.get().difficulty).toBe(DEFAULT_DIFFICULTY_ID);
    expect(document.querySelector<HTMLElement>(".nf-setting-confirm")?.hidden)
      .toBe(true);
  });

  it("writes the run and the preference once the question is answered", () => {
    const run = overRun();
    click("Blackout");
    click("Switch to Blackout");
    expect(run.rules().difficulty).toBe("blackout");
    // Flagged in the save for honesty — and nothing else changed.
    expect(run.rules().difficultyChanged).toBe(true);
    expect(run.rules().assists).toEqual(noAssists());
    // The preference follows, so the next run starts here.
    expect(settings.get().difficulty).toBe("blackout");
    expect(selectedDifficulty()).toBe("blackout");
    expect(document.querySelector<HTMLElement>(".nf-setting-confirm")?.hidden)
      .toBe(true);
  });

  it("says so, once a run has had its difficulty changed", () => {
    overRun({ ...defaultRules(), difficultyChanged: true });
    expect(document.body.textContent).toContain(
      "This run has had its difficulty changed",
    );
    expect(document.body.textContent).toContain("Nothing is locked out");
  });

  it("does not ask — or mark the run — for re-picking the current preset", () => {
    const run = overRun();
    click(requireDifficulty(DEFAULT_DIFFICULTY_ID).label);
    expect(document.querySelector<HTMLElement>(".nf-setting-confirm")?.hidden)
      .toBe(true);
    expect(run.rules().difficultyChanged).toBe(false);
    expect(run.writes).toBe(0);
  });

  it("flips an assist straight through to the run, with no question", () => {
    const run = overRun();
    assistRow("Keep previews up")[0]!.click();
    expect(document.querySelector<HTMLElement>(".nf-setting-confirm")?.hidden)
      .toBe(true);
    expect(run.rules().assists["always-preview"]).toBe(true);
    expect(settings.get().assists["always-preview"]).toBe(true);
    // An assist is not a difficulty change and never marks the run.
    expect(run.rules().difficultyChanged).toBe(false);
  });

  it("keeps the four switches independent of one another", () => {
    const run = overRun();
    assistRow("Damage floor")[0]!.click();
    assistRow("Breach rescue")[0]!.click();
    expect(run.rules().assists).toEqual({
      ...noAssists(),
      "damage-floor": true,
      "breach-rescue": true,
    });
    assistRow("Damage floor")[1]!.click();
    expect(run.rules().assists).toEqual({
      ...noAssists(),
      "breach-rescue": true,
    });
  });

  it("carries a run's own switches into the panel it opens", () => {
    overRun({
      difficulty: "blackout",
      assists: { ...noAssists(), "bold-telegraphs": true },
      difficultyChanged: false,
    });
    expect(assistRow("Bold telegraphs")[0]!.getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(assistRow("Damage floor")[0]!.getAttribute("aria-pressed")).toBe(
      "false",
    );
  });
});

describe("what a fresh run inherits", () => {
  it("starts on the preference, with the previous run's history dropped", () => {
    settings.update({
      difficulty: "blackout",
      assists: { ...noAssists(), "breach-rescue": true },
    });
    const state = createNewGame({
      seed: 1,
      rules: {
        difficulty: settings.get().difficulty,
        assists: settings.get().assists,
        difficultyChanged: false,
      },
    });
    expect(state.rules.difficulty).toBe("blackout");
    expect(state.rules.assists["breach-rescue"]).toBe(true);
    expect(state.rules.difficultyChanged).toBe(false);
  });
});
