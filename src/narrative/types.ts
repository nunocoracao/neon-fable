import type { StatKey } from "../character/stats";
import type { ExpressionId } from "../data/appearance";
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
  | StatRequirement
  | ItemRequirement
  | EnhancementRequirement
  | BackgroundRequirement
  | CreditsRequirement;

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
  choices: Choice[];
}

/** A self-contained story graph with a single entry point. */
export interface StoryArc {
  id: string;
  title: string;
  entryNodeId: string;
  nodes: StoryNode[];
}
