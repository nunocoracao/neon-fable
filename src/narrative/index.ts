/**
 * Story graph engine: nodes, choices, and typed requirement/effect gating
 * over GameState. Pure functions only — story content lives in
 * src/data/story/.
 */
export { PLAYER_SPEAKER } from "./types";
export type {
  AddItemEffect,
  BackgroundRequirement,
  Choice,
  CreditsEffect,
  Effect,
  EndEffect,
  EnhancementRequirement,
  FlagAtLeastRequirement,
  FlagEqualsRequirement,
  GotoEffect,
  IncrementFlagEffect,
  ItemRequirement,
  OpenStylistEffect,
  RemoveItemEffect,
  Requirement,
  SetFlagEffect,
  StartCombatEffect,
  StatRequirement,
  StoryArc,
  StoryNode,
  UnavailablePresentation,
} from "./types";
export { checkRequirement, checkRequirements } from "./requirements";
export { applyEffect, applyEffects } from "./effects";
export {
  NarrativeError,
  applyChoice,
  availableChoices,
  getNode,
  requireNode,
  type ChoiceOutcome,
  type NarrativeErrorCode,
  type PresentedChoice,
} from "./engine";
export { validateArc, type ArcIssue, type ArcIssueCode } from "./validate";
export { selectVignettes, type EpilogueVignette } from "./epilogue";
