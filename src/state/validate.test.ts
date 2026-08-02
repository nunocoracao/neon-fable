import { describe, expect, it } from "vitest";
import { createNewGame } from "./gameState";
import {
  describeIssues,
  validateGameState,
  validateSaveEnvelope,
} from "./validate";
import { GAME_STATE_VERSION } from "./version";

/**
 * The shape check. What is being tested is not really "does it say no"
 * — it is "does it say *where*", because a validator that only says no
 * leaves a player with a broken save and nobody with a lead.
 */

function state(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(createNewGame({ playerName: "Vex", seed: 1 })));
}

function paths(value: unknown, atVersion?: number): string[] {
  return validateGameState(value, { atVersion }).issues.map((i) => i.path);
}

describe("a state this build wrote", () => {
  it("passes", () => {
    expect(validateGameState(createNewGame({ seed: 1 }))).toEqual({
      ok: true,
      issues: [],
    });
  });
});

describe("pointing at what is wrong", () => {
  it("names the field, what it wanted, and what was there", () => {
    const broken = state();
    (broken.player as Record<string, unknown>).name = 42;
    const result = validateGameState(broken);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { path: "player.name", message: "expected a string, got a number" },
    ]);
  });

  it("says 'nothing' for a field that is simply absent", () => {
    const broken = state();
    delete broken.rng;
    expect(validateGameState(broken).issues).toEqual([
      { path: "rng", message: "expected an object, got nothing" },
    ]);
  });

  it("does not cascade: a missing parent reports once", () => {
    const broken = state();
    broken.player = null;
    expect(paths(broken)).toEqual(["player"]);
  });

  it("reports every independent problem, not just the first", () => {
    const broken = state();
    broken.location = 7;
    broken.credits = -5;
    expect(paths(broken)).toEqual(["location", "credits"]);
  });

  it("rejects a state that is not an object at all", () => {
    expect(validateGameState("a save").issues).toEqual([
      { path: "state", message: "expected an object, got a string" },
    ]);
    expect(paths(null)).toEqual(["state"]);
    expect(paths([])).toEqual(["state"]);
  });

  it("counts an array as the wrong kind of object", () => {
    const broken = state();
    broken.flags = [];
    expect(paths(broken)).toEqual(["flags"]);
  });

  it("refuses a number that is not one", () => {
    const broken = state();
    (broken.rng as Record<string, unknown>).seed = Number.NaN;
    expect(validateGameState(broken).issues[0]).toEqual({
      path: "rng.seed",
      message: "expected a finite number, got NaN",
    });
  });
});

describe("holding a save to its own era", () => {
  it("does not fault a v6 save for the party it could not have had", () => {
    const old = state();
    old.version = 6;
    delete old.party;
    delete old.lore;
    delete old.vendors;
    delete old.rules;
    delete (old.player as Record<string, unknown>).appearance;
    expect(validateGameState(old).ok).toBe(true);
  });

  it("faults the same save the moment it claims to be current", () => {
    const old = state();
    delete old.party;
    delete old.rules;
    // Once each, not once per field underneath them.
    expect(paths(old, GAME_STATE_VERSION)).toEqual(["party", "rules"]);
  });

  it("judges at the version asked for, not the one written down", () => {
    const half = state();
    half.version = 6;
    delete half.reputation;
    // Nothing required a reputation at v6...
    expect(validateGameState(half).ok).toBe(true);
    // ...and everything does at v9, which is how a migration step is
    // held to the field it was supposed to add.
    expect(paths(half, 9)).toEqual(["reputation"]);
  });
});

describe("the envelope around a state", () => {
  it("accepts what saveGame writes", () => {
    expect(
      validateSaveEnvelope({
        version: GAME_STATE_VERSION,
        savedAt: 1_700_000_000_000,
        state: state(),
      }).ok,
    ).toBe(true);
  });

  it("prefixes state problems so the path reads from the top", () => {
    const inner = state();
    delete (inner as Record<string, unknown>).credits;
    const result = validateSaveEnvelope({
      version: GAME_STATE_VERSION,
      savedAt: 1,
      state: inner,
    });
    expect(result.issues.map((i) => i.path)).toEqual(["state.credits"]);
  });

  it("faults a wrapper with no timestamp and no state", () => {
    const result = validateSaveEnvelope({ version: GAME_STATE_VERSION });
    expect(result.issues.map((i) => i.path)).toEqual(["savedAt", "state"]);
  });

  it("holds the state to the version the wrapper claims", () => {
    const inner = state();
    inner.version = 6;
    delete inner.party;
    // The wrapper says v6, so the missing party is not a fault.
    expect(
      validateSaveEnvelope({ version: 6, savedAt: 1, state: inner }).ok,
    ).toBe(true);
  });

  it("rejects a blob that parsed to something that is not an object", () => {
    expect(validateSaveEnvelope("[]").issues).toEqual([
      { path: "save", message: "expected an object, got a string" },
    ]);
  });
});

describe("describeIssues", () => {
  it("reads as one line a person can act on", () => {
    expect(
      describeIssues([
        { path: "state.player.name", message: "expected a string, got nothing" },
      ]),
    ).toBe("state.player.name (expected a string, got nothing)");
  });

  it("caps the list and says how much it left out", () => {
    const many = ["a", "b", "c", "d", "e"].map((path) => ({
      path,
      message: "wrong",
    }));
    expect(describeIssues(many)).toBe(
      "a (wrong); b (wrong); c (wrong); and 2 more",
    );
  });

  it("says nothing when there is nothing wrong", () => {
    expect(describeIssues([])).toBe("");
  });
});
