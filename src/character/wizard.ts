import { validateAppearance, type Appearance } from "./appearance";
import { APPEARANCE_FIELDS } from "./appearance";
import {
  STAT_KEYS,
  validateAllocation,
  type Stats,
} from "./stats";

/**
 * Character-creation wizard: a pure step state machine the creation
 * screen renders from. The machine owns which step is active, what
 * counts as a valid step, and how navigation moves between steps; the
 * DOM layer only renders the active step and dispatches transitions.
 * Every transition returns a new state and always preserves the draft.
 */
export const WIZARD_STEPS = [
  "identity",
  "background",
  "stats",
  "appearance",
  "review",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Display names for the progress indicator, in step order. */
export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  identity: "Identity",
  background: "Background",
  stats: "Stats",
  appearance: "Appearance",
  review: "Review",
};

/** Longest allowed character name, after trimming. */
export const NAME_MAX_LENGTH = 24;

/** Non-empty after trimming and within NAME_MAX_LENGTH. */
export function nameValid(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= NAME_MAX_LENGTH;
}

/**
 * Everything the player chooses across the wizard. Kept in memory for
 * the life of the screen so navigation never loses a choice; never
 * persisted (abandoning the screen discards it).
 */
export interface WizardDraft {
  name: string;
  backgroundId: string;
  /** Point-buy allocation, before background bonuses. */
  allocation: Stats;
  appearance: Appearance;
  /** New Game+ carry-over pick; null means travel light. */
  legacyItemId: string | null;
}

/** Static inputs validity depends on (pool size varies under New Game+). */
export interface WizardContext {
  pointPool: number;
  backgroundIds: readonly string[];
}

export interface WizardState {
  step: WizardStep;
  draft: WizardDraft;
}

/** A fresh wizard on the first step. */
export function createWizard(draft: WizardDraft): WizardState {
  return { step: "identity", draft };
}

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}

/**
 * Whether one step's choices are complete and valid. Review is valid
 * exactly when every step before it is — it adds no choices of its own.
 * The legacy pick is always valid (null means travel light).
 */
export function stepValid(
  draft: WizardDraft,
  step: WizardStep,
  context: WizardContext,
): boolean {
  switch (step) {
    case "identity":
      return nameValid(draft.name);
    case "background":
      return context.backgroundIds.includes(draft.backgroundId);
    case "stats":
      return validateAllocation(draft.allocation, context.pointPool).valid;
    case "appearance":
      return validateAppearance(draft.appearance).length === 0;
    case "review":
      return WIZARD_STEPS.slice(0, stepIndex("review")).every((earlier) =>
        stepValid(draft, earlier, context),
      );
  }
}

export function canGoBack(state: WizardState): boolean {
  return stepIndex(state.step) > 0;
}

/** Forward moves are gated on the current step being valid. */
export function canAdvance(
  state: WizardState,
  context: WizardContext,
): boolean {
  return (
    stepIndex(state.step) < WIZARD_STEPS.length - 1 &&
    stepValid(state.draft, state.step, context)
  );
}

export function goBack(state: WizardState): WizardState {
  if (!canGoBack(state)) return state;
  return { ...state, step: WIZARD_STEPS[stepIndex(state.step) - 1]! };
}

export function advance(
  state: WizardState,
  context: WizardContext,
): WizardState {
  if (!canAdvance(state, context)) return state;
  return { ...state, step: WIZARD_STEPS[stepIndex(state.step) + 1]! };
}

/**
 * Whether a direct jump to a step is allowed: backward always (the
 * review screen's edit links, the progress strip), forward only over
 * steps that are already valid — the same gate advancing one-by-one
 * would apply.
 */
export function canJumpTo(
  state: WizardState,
  target: WizardStep,
  context: WizardContext,
): boolean {
  const from = stepIndex(state.step);
  const to = stepIndex(target);
  if (to <= from) return true;
  return WIZARD_STEPS.slice(from, to).every((step) =>
    stepValid(state.draft, step, context),
  );
}

export function jumpTo(
  state: WizardState,
  target: WizardStep,
  context: WizardContext,
): WizardState {
  if (!canJumpTo(state, target, context)) return state;
  return { ...state, step: target };
}

/** A new state with draft fields replaced; the step never changes. */
export function updateDraft(
  state: WizardState,
  patch: Partial<WizardDraft>,
): WizardState {
  return { ...state, draft: { ...state.draft, ...patch } };
}

/** Field-by-field draft equality — the screen's "is anything dirty" check. */
export function draftsEqual(a: WizardDraft, b: WizardDraft): boolean {
  return (
    a.name === b.name &&
    a.backgroundId === b.backgroundId &&
    a.legacyItemId === b.legacyItemId &&
    STAT_KEYS.every((key) => a.allocation[key] === b.allocation[key]) &&
    APPEARANCE_FIELDS.every((field) => a.appearance[field] === b.appearance[field])
  );
}
