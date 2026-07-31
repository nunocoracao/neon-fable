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
  CompanionComment,
  CompanionLoyaltyEffect,
  CompanionRequirement,
  CreditsEffect,
  Effect,
  EndEffect,
  EnhancementRequirement,
  FlagAtLeastRequirement,
  FlagEqualsRequirement,
  FlagUnsetRequirement,
  GotoEffect,
  IncrementFlagEffect,
  FlagSetRequirement,
  ItemRequirement,
  LoyaltyRequirement,
  OpenStylistEffect,
  RecruitCompanionEffect,
  RemoveItemEffect,
  Requirement,
  ReputationRequirement,
  SetFlagEffect,
  StartCombatEffect,
  StatRequirement,
  StoryArc,
  StoryNode,
  UnavailablePresentation,
} from "./types";
export { checkRequirement, checkRequirements } from "./requirements";
export {
  companionAside,
  companionAsides,
  type CompanionAside,
} from "./companions";
export { applyEffect, applyEffects } from "./effects";
export {
  applyLoyaltyChanges,
  choiceLoyaltyChanges,
  personalSceneReady,
  reactionChanges,
  reactionTotal,
  readyPersonalScenes,
  witnesses,
  type LoyaltyChange,
} from "./loyalty";
export {
  applyStandingChanges,
  bandCrossings,
  choiceStandingChanges,
  standingChanges,
  type StandingChange,
} from "./standing";
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
