import { describe, expect, it } from "vitest";
import { noAssists } from "../data/assists";
import {
  DEFAULT_DIFFICULTY_ID,
  NEUTRAL_MODIFIERS,
  requireDifficulty,
} from "../data/difficulty";
import {
  assistOn,
  clampRules,
  defaultRules,
  rulesModifiers,
  startingRules,
  withAssist,
  withDifficulty,
} from "./rules";

describe("what a run is played under", () => {
  it("defaults to the middle preset with every assist off", () => {
    const rules = defaultRules();
    expect(rules.difficulty).toBe(DEFAULT_DIFFICULTY_ID);
    expect(rules.assists).toEqual(noAssists());
    expect(rules.difficultyChanged).toBe(false);
    expect(rulesModifiers(rules)).toEqual(NEUTRAL_MODIFIERS);
  });

  it("reads the bundle its preset names", () => {
    expect(rulesModifiers({ ...defaultRules(), difficulty: "blackout" })).toEqual(
      requireDifficulty("blackout").modifiers,
    );
  });

  it("reads one switch at a time", () => {
    const rules = withAssist(defaultRules(), "damage-floor", true);
    expect(assistOn(rules, "damage-floor")).toBe(true);
    expect(assistOn(rules, "always-preview")).toBe(false);
  });
});

describe("clamping", () => {
  it("fills an absent record in with the authored figures", () => {
    expect(clampRules(undefined)).toEqual(defaultRules());
    expect(clampRules(null)).toEqual(defaultRules());
    expect(clampRules("blackout")).toEqual(defaultRules());
  });

  it("keeps a valid record intact", () => {
    const rules = {
      difficulty: "drift" as const,
      assists: { ...noAssists(), "bold-telegraphs": true },
      difficultyChanged: true,
    };
    expect(clampRules(rules)).toEqual(rules);
  });

  it("falls back on a preset or an assist this build has retired", () => {
    const clamped = clampRules({
      difficulty: "nightmare",
      assists: { "auto-win": true, "damage-floor": true },
      difficultyChanged: "yes",
    });
    expect(clamped.difficulty).toBe(DEFAULT_DIFFICULTY_ID);
    expect(clamped.assists).toEqual({ ...noAssists(), "damage-floor": true });
    // Only a literal true is a changed run; anything else is not a record.
    expect(clamped.difficultyChanged).toBe(false);
  });
});

describe("changing the preset mid-run", () => {
  it("marks the run, for honesty rather than for a penalty", () => {
    const changed = withDifficulty(defaultRules(), "blackout");
    expect(changed.difficulty).toBe("blackout");
    expect(changed.difficultyChanged).toBe(true);
    // Nothing else moves: the assists are not a difficulty setting.
    expect(changed.assists).toEqual(noAssists());
  });

  it("does not mark a run for re-picking the preset it is already on", () => {
    const rules = defaultRules();
    const same = withDifficulty(rules, rules.difficulty);
    expect(same).toBe(rules);
    expect(same.difficultyChanged).toBe(false);
  });

  it("keeps the mark once it has been earned", () => {
    const back = withDifficulty(
      withDifficulty(defaultRules(), "blackout"),
      DEFAULT_DIFFICULTY_ID,
    );
    expect(back.difficulty).toBe(DEFAULT_DIFFICULTY_ID);
    expect(back.difficultyChanged).toBe(true);
  });

  it("never marks a run for flipping an assist", () => {
    const rules = withAssist(
      withAssist(defaultRules(), "always-preview", true),
      "breach-rescue",
      true,
    );
    expect(rules.difficultyChanged).toBe(false);
    expect(rules.assists["always-preview"]).toBe(true);
    expect(rules.assists["breach-rescue"]).toBe(true);
  });

  it("returns the same object when a switch is already where it is asked to be", () => {
    const rules = defaultRules();
    expect(withAssist(rules, "damage-floor", false)).toBe(rules);
  });

  it("leaves the record it was given alone", () => {
    const rules = defaultRules();
    withDifficulty(rules, "drift");
    withAssist(rules, "damage-floor", true);
    expect(rules).toEqual(defaultRules());
  });
});

describe("what a fresh run starts on", () => {
  it("takes the preference and starts unmarked", () => {
    const rules = startingRules({
      difficulty: "blackout",
      assists: { ...noAssists(), "always-preview": true },
    });
    expect(rules.difficulty).toBe("blackout");
    expect(rules.assists["always-preview"]).toBe(true);
    expect(rules.difficultyChanged).toBe(false);
  });

  it("never inherits the previous run's change history", () => {
    // New Game+ keeps the chosen preset; it does not keep the fact that
    // the run before it moved off one.
    const finished = withDifficulty(defaultRules(), "blackout");
    expect(finished.difficultyChanged).toBe(true);
    expect(startingRules(finished).difficulty).toBe("blackout");
    expect(startingRules(finished).difficultyChanged).toBe(false);
  });

  it("clamps a preference that names something retired", () => {
    const rules = startingRules({
      difficulty: "nightmare" as never,
      assists: { bogus: true } as never,
    });
    expect(rules.difficulty).toBe(DEFAULT_DIFFICULTY_ID);
    expect(rules.assists).toEqual(noAssists());
  });
});
