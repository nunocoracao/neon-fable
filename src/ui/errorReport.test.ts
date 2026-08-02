import { describe, expect, it } from "vitest";
import { GAME_STATE_VERSION, createNewGame, type GameState } from "../state";
import {
  buildErrorReport,
  describeError,
  sanitizeDiagnosticText,
  summarizeStateForReport,
  type CrashContext,
} from "./errorReport";

/**
 * What a crash report is allowed to say.
 *
 * The tests that matter here are the negative ones: the default report
 * has to be something a player can paste into a public issue without
 * reading it first, which means it must not carry what they typed, what
 * their disk is called, or the save itself.
 */

const AT = Date.UTC(2026, 7, 3, 12, 0, 0);

function runState(): GameState {
  const state = createNewGame({ playerName: "Vexillography", seed: 42 });
  state.location = "greywater-steps";
  state.credits = 180;
  return state;
}

function context(patch: Partial<CrashContext> = {}): CrashContext {
  return {
    error: new TypeError("cannot read properties of null (reading 'tile')"),
    screen: "game",
    origin: "mount",
    state: runState(),
    stashed: true,
    at: AT,
    ...patch,
  };
}

describe("scrubbing text", () => {
  it("takes an inlined image out of a trace", () => {
    const text = sanitizeDiagnosticText(
      "failed on data:image/png;base64,iVBORw0KGgoAAAANSUhEUg== in bake",
    );
    expect(text).toBe("failed on [data-url] in bake");
  });

  it("takes out anything else long and opaque", () => {
    const blob = "Zm9vYmFy".repeat(20);
    expect(sanitizeDiagnosticText(`token ${blob} end`)).toBe(
      "token [long-value] end",
    );
  });

  it("keeps the file that threw and drops where it was served from", () => {
    const text = sanitizeDiagnosticText(
      "at draw (https://player.example.test/assets/iso-a12f.js:9:14)",
    );
    expect(text).toMatch(/iso-a12f\.js:9:14/);
    expect(text).not.toMatch(/player\.example\.test/);
  });

  it("drops a home directory, which is usually somebody's name", () => {
    expect(
      sanitizeDiagnosticText("at mount (/Users/rowan/games/neon/main.ts:2:1)"),
    ).toBe("at mount (…/games/neon/main.ts:2:1)");
    expect(
      sanitizeDiagnosticText("at mount (C:\\Users\\Rowan\\neon\\main.ts:2:1)"),
    ).toBe("at mount (…\\neon\\main.ts:2:1)");
  });

  it("caps runaway text and says how much it cut", () => {
    const text = sanitizeDiagnosticText("x ".repeat(250), 100);
    expect(text).toMatch(/^(?:x ){50}\n… \(400 more characters\)$/);
  });

  it("describes things that were thrown but are not errors", () => {
    expect(describeError("just a string")).toBe("just a string");
    expect(describeError({ message: "an object with a message" })).toBe(
      "an object with a message",
    );
    expect(describeError(null)).toBe("null");
    expect(describeError(new RangeError("out of range"))).toBe(
      "RangeError: out of range",
    );
  });
});

describe("the run, counted rather than quoted", () => {
  it("says what the run is without saying who is playing it", () => {
    const facts = summarizeStateForReport(runState());
    const text = JSON.stringify(facts);
    expect(text).not.toMatch(/Vexillography/);
    expect(facts).toContainEqual({ label: "location", value: "greywater-steps" });
    expect(facts).toContainEqual({ label: "credits", value: "180" });
    expect(facts).toContainEqual({
      label: "save format",
      value: `v${GAME_STATE_VERSION} (build writes v${GAME_STATE_VERSION})`,
    });
  });

  it("says so plainly when nothing was being played", () => {
    expect(summarizeStateForReport(null)).toEqual([
      { label: "run", value: "none in progress" },
    ]);
  });

  it("counts a half-built state rather than throwing on it", () => {
    const facts = summarizeStateForReport({ version: 4 } as GameState);
    expect(facts).toContainEqual({ label: "flags set", value: "0" });
    expect(facts).toContainEqual({ label: "inventory stacks", value: "0" });
  });
});

describe("the report", () => {
  it("leads with what threw and where", () => {
    const report = buildErrorReport(context());
    expect(report.headline).toMatch(/^TypeError: cannot read properties/);
    expect(report.text).toMatch(/where: game/);
    expect(report.text).toMatch(/caught: while opening a screen/);
    expect(report.text).toMatch(/when: 2026-08-03T12:00:00\.000Z/);
  });

  it("tells the player the run was stashed", () => {
    expect(buildErrorReport(context()).text).toMatch(
      /recovery stash: written/,
    );
    expect(buildErrorReport(context({ stashed: false })).text).toMatch(
      /recovery stash: not written/,
    );
  });

  it("carries no save data, and no player-entered text, by default", () => {
    const report = buildErrorReport(context());
    expect(report.text).not.toMatch(/Vexillography/);
    expect(report.text).toMatch(/save data: not included/);
    // The summary is there; the state is not.
    expect(report.text).toMatch(/location: greywater-steps/);
    expect(report.text).not.toMatch(/"inventory"/);
  });

  it("carries the whole save once the player asks for it", () => {
    const report = buildErrorReport(context(), { includeSaveData: true });
    expect(report.text).toMatch(/save data:/);
    expect(report.text).toMatch(/"inventory"/);
    expect(report.text).toMatch(/Vexillography/);
  });

  it("scrubs the save data too, on the one path that consented to it", () => {
    const state = runState();
    state.location = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
    const report = buildErrorReport(context({ state }), {
      includeSaveData: true,
    });
    expect(report.text).not.toMatch(/iVBORw0KGgo/);
    expect(report.text).toMatch(/\[data-url\]/);
  });

  it("scrubs the stack it prints", () => {
    const error = new Error("boom");
    error.stack = "Error: boom\n    at go (/Users/rowan/neon/main.ts:1:1)";
    const report = buildErrorReport(context({ error }));
    expect(report.text).toMatch(/stack:/);
    expect(report.text).not.toMatch(/rowan/);
  });

  it("says the browser only when it was handed one", () => {
    expect(buildErrorReport(context()).text).not.toMatch(/browser:/);
    expect(
      buildErrorReport(context({ userAgent: "TestBrowser/1.0" })).text,
    ).toMatch(/browser: TestBrowser\/1\.0/);
  });

  it("builds the same report twice for the same crash", () => {
    const shared = context();
    expect(buildErrorReport(shared).text).toBe(buildErrorReport(shared).text);
  });

  it("survives a state that cannot be serialized", () => {
    const circular = runState() as GameState & { self?: unknown };
    circular.self = circular;
    const report = buildErrorReport(context({ state: circular }), {
      includeSaveData: true,
    });
    expect(report.text).toMatch(/could not be serialized/);
  });
});
