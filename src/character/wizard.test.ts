import { describe, expect, it } from "vitest";
import { defaultAppearance } from "./appearance";
import { defaultAllocation } from "./create";
import { POINT_POOL, baseStats } from "./stats";
import {
  NAME_MAX_LENGTH,
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  advance,
  canAdvance,
  canGoBack,
  canJumpTo,
  createWizard,
  draftsEqual,
  goBack,
  jumpTo,
  nameValid,
  stepIndex,
  stepValid,
  updateDraft,
  type WizardContext,
  type WizardDraft,
  type WizardState,
} from "./wizard";

const context: WizardContext = {
  pointPool: POINT_POOL,
  backgroundIds: ["gutter-courier", "chrome-clinician"],
};

/** A draft that passes every step's validity check. */
function validDraft(): WizardDraft {
  return {
    name: "Vex",
    backgroundId: "gutter-courier",
    allocation: defaultAllocation(),
    appearance: defaultAppearance(),
    legacyItemId: null,
  };
}

/** A fresh, unfinished draft the screen would open with. */
function emptyDraft(): WizardDraft {
  return {
    name: "",
    backgroundId: "gutter-courier",
    allocation: baseStats(),
    appearance: defaultAppearance(),
    legacyItemId: null,
  };
}

function at(step: (typeof WIZARD_STEPS)[number], draft: WizardDraft): WizardState {
  return { step, draft };
}

describe("wizard steps", () => {
  it("runs identity → background → stats → appearance → review", () => {
    expect(WIZARD_STEPS).toEqual([
      "identity",
      "background",
      "stats",
      "appearance",
      "review",
    ]);
    for (const step of WIZARD_STEPS) {
      expect(WIZARD_STEP_LABELS[step]).toBeTruthy();
      expect(WIZARD_STEPS[stepIndex(step)]).toBe(step);
    }
  });

  it("starts on identity with the given draft", () => {
    const draft = emptyDraft();
    const state = createWizard(draft);
    expect(state.step).toBe("identity");
    expect(state.draft).toBe(draft);
  });
});

describe("nameValid", () => {
  it("rejects empty and whitespace-only names", () => {
    expect(nameValid("")).toBe(false);
    expect(nameValid("   ")).toBe(false);
  });

  it("accepts names up to the cap, trimming first", () => {
    expect(nameValid("Vex")).toBe(true);
    expect(nameValid(" " + "x".repeat(NAME_MAX_LENGTH) + " ")).toBe(true);
    expect(nameValid("x".repeat(NAME_MAX_LENGTH + 1))).toBe(false);
  });
});

describe("stepValid", () => {
  it("identity tracks the name rule", () => {
    expect(stepValid(emptyDraft(), "identity", context)).toBe(false);
    expect(stepValid(validDraft(), "identity", context)).toBe(true);
  });

  it("background requires a known background id", () => {
    const draft = { ...validDraft(), backgroundId: "nope" };
    expect(stepValid(draft, "background", context)).toBe(false);
    expect(stepValid(validDraft(), "background", context)).toBe(true);
  });

  it("stats requires the pool spent exactly", () => {
    expect(stepValid(emptyDraft(), "stats", context)).toBe(false);
    expect(stepValid(validDraft(), "stats", context)).toBe(true);
    // A larger New Game+ pool invalidates a standard-pool allocation.
    const ngPlus = { ...context, pointPool: POINT_POOL + 3 };
    expect(stepValid(validDraft(), "stats", ngPlus)).toBe(false);
  });

  it("appearance requires catalog-valid ids", () => {
    expect(stepValid(validDraft(), "appearance", context)).toBe(true);
    const draft = {
      ...validDraft(),
      appearance: { ...defaultAppearance(), hairStyle: "nope" },
    };
    expect(stepValid(draft, "appearance", context)).toBe(false);
  });

  it("review is valid exactly when every earlier step is", () => {
    expect(stepValid(validDraft(), "review", context)).toBe(true);
    for (const broken of [
      { ...validDraft(), name: "" },
      { ...validDraft(), backgroundId: "nope" },
      { ...validDraft(), allocation: baseStats() },
      { ...validDraft(), appearance: { ...defaultAppearance(), eyes: "nope" } },
    ]) {
      expect(stepValid(broken, "review", context)).toBe(false);
    }
  });
});

describe("advance / goBack", () => {
  it("walks a valid draft forward through every step", () => {
    let state = createWizard(validDraft());
    for (const step of WIZARD_STEPS.slice(1)) {
      expect(canAdvance(state, context)).toBe(true);
      state = advance(state, context);
      expect(state.step).toBe(step);
    }
    // Review is the last stop.
    expect(canAdvance(state, context)).toBe(false);
    expect(advance(state, context)).toBe(state);
  });

  it("refuses to advance past an invalid step", () => {
    const state = createWizard(emptyDraft());
    expect(canAdvance(state, context)).toBe(false);
    expect(advance(state, context)).toBe(state);
  });

  it("goes back one step at a time and stops at identity", () => {
    let state = at("stats", emptyDraft());
    expect(canGoBack(state)).toBe(true);
    state = goBack(state);
    expect(state.step).toBe("background");
    state = goBack(state);
    expect(state.step).toBe("identity");
    expect(canGoBack(state)).toBe(false);
    expect(goBack(state)).toBe(state);
  });

  it("going back never requires validity — an invalid step can retreat", () => {
    const state = at("stats", emptyDraft());
    expect(goBack(state).step).toBe("background");
  });

  it("navigation preserves the draft untouched", () => {
    const draft = validDraft();
    let state = createWizard(draft);
    state = advance(state, context);
    state = advance(state, context);
    state = goBack(state);
    expect(state.draft).toBe(draft);
  });
});

describe("jumpTo", () => {
  it("always allows jumping backward (review edit links)", () => {
    const state = at("review", emptyDraft());
    for (const step of WIZARD_STEPS.slice(0, 4)) {
      expect(canJumpTo(state, step, context)).toBe(true);
      expect(jumpTo(state, step, context).step).toBe(step);
    }
  });

  it("allows a forward jump only over already-valid steps", () => {
    const valid = createWizard(validDraft());
    expect(jumpTo(valid, "review", context).step).toBe("review");

    // Name missing: identity blocks any forward jump.
    const invalid = createWizard(emptyDraft());
    expect(canJumpTo(invalid, "background", context)).toBe(false);
    expect(jumpTo(invalid, "stats", context)).toBe(invalid);

    // Stats unfinished: background → appearance is blocked, but
    // background → stats (the first incomplete step) is open.
    const midway = at("background", { ...validDraft(), allocation: baseStats() });
    expect(canJumpTo(midway, "stats", context)).toBe(true);
    expect(canJumpTo(midway, "appearance", context)).toBe(false);
  });

  it("jumping to the current step is a no-op", () => {
    const state = at("stats", emptyDraft());
    expect(jumpTo(state, "stats", context)).toEqual(state);
  });
});

describe("updateDraft / draftsEqual", () => {
  it("patches fields without moving the step", () => {
    const state = at("background", emptyDraft());
    const next = updateDraft(state, { backgroundId: "chrome-clinician" });
    expect(next.step).toBe("background");
    expect(next.draft.backgroundId).toBe("chrome-clinician");
    // Unrelated fields survive.
    expect(next.draft.allocation).toEqual(baseStats());
  });

  it("draftsEqual compares every field deeply", () => {
    expect(draftsEqual(validDraft(), validDraft())).toBe(true);
    expect(
      draftsEqual(validDraft(), { ...validDraft(), name: "Nyx" }),
    ).toBe(false);
    expect(
      draftsEqual(validDraft(), { ...validDraft(), legacyItemId: "x" }),
    ).toBe(false);
    const bumped = validDraft();
    bumped.allocation = { ...bumped.allocation, body: bumped.allocation.body + 1 };
    expect(draftsEqual(validDraft(), bumped)).toBe(false);
    const dyed = validDraft();
    dyed.appearance = { ...dyed.appearance, hairColor: "different" };
    expect(draftsEqual(validDraft(), dyed)).toBe(false);
  });
});
