import type { StatKey } from "../character/stats";
import type { ExpressionId } from "../data/appearance";
import type { ReactionTag } from "../data/companions";
import type { DayPhaseId } from "../iso/tilemap";
import type { FlagValue } from "../state/flags";

/**
 * Story graph data model. Nodes, choices, requirements, and effects are
 * pure typed data authored in src/data/story/; the engine interprets them
 * against GameState. Nothing here may hold functions or class instances —
 * arcs must survive a JSON round-trip.
 */

/** A condition a choice checks against GameState before it can be taken. */
export type Requirement =
  | FlagEqualsRequirement
  | FlagAtLeastRequirement
  | FlagUnsetRequirement
  | StatRequirement
  | ItemRequirement
  | EnhancementRequirement
  | BackgroundRequirement
  | CreditsRequirement
  | CompanionRequirement
  | LoyaltyRequirement;

/** Flag must exist and strictly equal the given value. */
export interface FlagEqualsRequirement {
  type: "flag-equals";
  key: string;
  value: FlagValue;
}

/** Flag must be a number >= value (missing or non-numeric counts as 0). */
export interface FlagAtLeastRequirement {
  type: "flag-at-least";
  key: string;
  value: number;
}

/**
 * Flag must never have been written — the "not yet" gate. A scene that
 * records its own outcome closes itself with this, which is how a beat
 * that pays out stays a beat rather than a tap.
 */
export interface FlagUnsetRequirement {
  type: "flag-unset";
  key: string;
}

/** Effective stat (base + equipment/enhancement mods) must be >= value. */
export interface StatRequirement {
  type: "stat";
  stat: StatKey;
  value: number;
}

/** Inventory must carry at least `quantity` (default 1) of the item. */
export interface ItemRequirement {
  type: "item";
  itemId: string;
  quantity?: number;
}

/** The enhancement must be installed in one of the character's cyber slots. */
export interface EnhancementRequirement {
  type: "enhancement";
  itemId: string;
}

/** The character's background must carry this narrative tag. */
export interface BackgroundRequirement {
  type: "background";
  tag: string;
}

/** Credits on hand must be at least `value` (shops, bribes, tolls). */
export interface CreditsRequirement {
  type: "credits";
  value: number;
}

/**
 * A companion must be in the party. "active" (the default) means they
 * are here, standing beside you, and can be spoken to or volunteered;
 * "recruited" only asks whether they ever joined — the gate a beat that
 * remembers somebody uses, whether or not they came along tonight.
 */
export interface CompanionRequirement {
  type: "companion";
  companionId: string;
  status?: "recruited" | "active";
}

/**
 * How a companion stands with the player. `mode` defaults to
 * "at-least" (they think this well of you); "at-most" is the other
 * side of the same gate, for the beat somebody only raises when it has
 * gone badly. Somebody never recruited stands at nothing, so an
 * at-least gate on a positive figure is closed to a player who never
 * met them and an at-most gate is not — pair it with a `companion`
 * requirement when the scene needs them in the room.
 */
export interface LoyaltyRequirement {
  type: "loyalty";
  companionId: string;
  value: number;
  mode?: "at-least" | "at-most";
}

/** A state change a choice applies when taken. */
export type Effect =
  | SetFlagEffect
  | IncrementFlagEffect
  | AddItemEffect
  | RemoveItemEffect
  | CreditsEffect
  | StartCombatEffect
  | TravelEffect
  | OpenStylistEffect
  | RecruitCompanionEffect
  | CompanionLoyaltyEffect
  | GotoEffect
  | EndEffect;

export interface SetFlagEffect {
  type: "set-flag";
  key: string;
  value: FlagValue;
}

/** Adds `amount` (default 1) to a numeric flag; missing/non-numeric starts at 0. */
export interface IncrementFlagEffect {
  type: "increment-flag";
  key: string;
  amount?: number;
}

export interface AddItemEffect {
  type: "add-item";
  itemId: string;
  quantity?: number;
}

/** Removes up to `quantity` (default 1); silently removes fewer if not carried. */
export interface RemoveItemEffect {
  type: "remove-item";
  itemId: string;
  quantity?: number;
}

/** Grants (positive) or charges (negative) credits; balance clamps at 0. */
export interface CreditsEffect {
  type: "credits";
  amount: number;
}

/** Requests combat by encounter id; surfaced in the ChoiceOutcome (stub until the combat task). */
export interface StartCombatEffect {
  type: "start-combat";
  encounterId: string;
}

/**
 * Moves the player to another map. The dialogue closes on arrival; if the
 * choice also has a target node, it opens as dialogue on the new map.
 * A travel effect counts as a terminator, so a travel choice may omit
 * both target and end marker.
 */
export interface TravelEffect {
  type: "travel";
  mapId: string;
}

/**
 * Opens the stylist's re-style screen. The dialogue closes while the
 * player edits their look; the choice's target node reopens as dialogue
 * when the screen closes (confirm or cancel alike). Payment and the
 * cosmetic-only rules live in the restyle logic, not here.
 */
export interface OpenStylistEffect {
  type: "open-stylist";
}

/**
 * Somebody joins the crew. Idempotent by construction (see
 * recruitCompanion): re-recruiting a companion already in the party
 * only brings them back to active, never resets what a run has done to
 * them. Unknown companion ids are an authoring bug — validateArc fails
 * on them — and are ignored at runtime rather than crashing a scene.
 */
export interface RecruitCompanionEffect {
  type: "recruit-companion";
  companionId: string;
}

/**
 * Moves a companion's standing with the player. A no-op for somebody
 * not in the party — a choice cannot earn the goodwill of a person who
 * is not there.
 */
export interface CompanionLoyaltyEffect {
  type: "companion-loyalty";
  companionId: string;
  amount: number;
}

/** Jump marker: overrides the choice's target node. */
export interface GotoEffect {
  type: "goto";
  nodeId: string;
}

/** End marker: the story arc ends here; optional ending id for epilogues. */
export interface EndEffect {
  type: "end";
  endingId?: string;
}

/** How a choice whose requirements fail is presented. */
export type UnavailablePresentation = "hidden" | "disabled";

export interface Choice {
  id: string;
  label: string;
  /** Next node; may be omitted only when effects carry an end marker. */
  target?: string;
  requirements?: Requirement[];
  effects?: Effect[];
  /**
   * What kind of act this choice is. Every companion standing with the
   * player when it is taken scores the tags against their own values
   * (src/data/companions.ts) and their loyalty moves by the total —
   * so a beat is tagged once and each companion reads it their own
   * way, instead of the content naming names. Use a
   * `companion-loyalty` effect instead when a beat is about one
   * specific person rather than about the kind of thing it is.
   */
  reactions?: ReactionTag[];
  /** Presentation when requirements fail; defaults to "hidden". */
  ifUnavailable?: UnavailablePresentation;
}

/**
 * Reserved speaker value marking a line as spoken by the player
 * character. The UI substitutes the character's name and portrait; every
 * other non-empty speaker is an NPC display name (resolved against the
 * cast catalog in src/data/cast.ts), and an absent speaker is narration.
 * Existing content never used this value, so old arcs keep their meaning.
 */
export const PLAYER_SPEAKER = "player";

/**
 * An aside a companion throws into somebody else's scene. Shown only
 * when that companion is active and the line's own requirements pass,
 * so a node can carry several and the right one — or none — lands.
 * Purely additive: a node with no comments reads exactly as before, and
 * a comment never gates, branches, or changes state.
 */
export interface CompanionComment {
  companionId: string;
  text: string;
  requirements?: Requirement[];
}

export interface StoryNode {
  id: string;
  /** Who is talking: an NPC name or PLAYER_SPEAKER; omit for narration. */
  speaker?: string;
  /** Portrait expression the speaker plays on this line; default neutral. */
  expression?: ExpressionId;
  text: string;
  /** Optional map/location tag (e.g. "cinder-row:filament-bar"). */
  location?: string;
  /**
   * Stages the scene behind this beat at an hour, overriding whatever
   * the map declares — a mission that happens at 3am looks like 3am on
   * the same street the player walked at dusk. The hour holds for the
   * rest of the visit (leaving the map hands the clock back to it), and
   * is purely a look: see src/iso/dayPhase.ts.
   */
  dayPhase?: DayPhaseId;
  /**
   * Optional companion asides on this beat; the first whose companion
   * is with the player and whose requirements pass is shown under the
   * line (see companionAside in ./companions.ts).
   */
  comments?: CompanionComment[];
  choices: Choice[];
}

/** A self-contained story graph with a single entry point. */
export interface StoryArc {
  id: string;
  title: string;
  entryNodeId: string;
  nodes: StoryNode[];
}
