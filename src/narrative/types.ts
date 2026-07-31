import type { StatKey } from "../character/stats";
import type { ExpressionId } from "../data/appearance";
import type { ReactionTag } from "../data/companions";
import type { FactionId, StandingDelta } from "../data/factions";
import type { StaticBand } from "../data/static";
import type { DayPhaseId } from "../iso/tilemap";
import type { FlagValue } from "../state/flags";
import type { ReputationThreshold } from "../state/reputation";

/**
 * Story graph data model. Nodes, choices, requirements, and effects are
 * pure typed data authored in src/data/story/; the engine interprets them
 * against GameState. Nothing here may hold functions or class instances —
 * arcs must survive a JSON round-trip.
 */

/** A condition a choice checks against GameState before it can be taken. */
export type Requirement =
  | FlagEqualsRequirement
  | FlagNotEqualsRequirement
  | FlagAtLeastRequirement
  | FlagSetRequirement
  | FlagUnsetRequirement
  | StatRequirement
  | ItemRequirement
  | EnhancementRequirement
  | StaticRequirement
  | BackgroundRequirement
  | CreditsRequirement
  | CompanionRequirement
  | LoyaltyRequirement
  | ReputationRequirement
  | DominantFactionRequirement;

/** Flag must exist and strictly equal the given value. */
export interface FlagEqualsRequirement {
  type: "flag-equals";
  key: string;
  value: FlagValue;
}

/**
 * Flag must say anything other than this — including nothing at all.
 * The mirror of flag-equals, and the only gate that can be closed by a
 * value *and* opened by a blank: a flag one beat writes `true` and a
 * later one rewrites `false` (the suspended warrant) reads as three
 * states, and "not wanted" is two of them. flag-unset only covers the
 * blank, so it cannot express that door on its own.
 */
export interface FlagNotEqualsRequirement {
  type: "flag-not-equals";
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
 * Flag must have been written, whatever it says — the "you have been
 * here" gate, and the mirror of flag-unset. What it is for is a beat
 * that recorded *how* something went in one flag with several values:
 * a later scene that only needs to know it happened at all asks once
 * here instead of carrying one choice per value.
 */
export interface FlagSetRequirement {
  type: "flag-set";
  key: string;
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

/**
 * How much noise the character's chrome is making (see
 * src/data/static.ts). `mode` defaults to "at-least" — the
 * chrome-affinity gate, for the door that only opens to somebody who
 * has visibly paid for their hardware — and "at-most" is the other
 * side of it, for the beat that needs a face nobody can hear coming.
 *
 * Bands rather than levels, deliberately: "loud" survives a retune of
 * what an implant costs, and a number in a prose file does not.
 */
export interface StaticRequirement {
  type: "static";
  band: StaticBand;
  mode?: "at-least" | "at-most";
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

/**
 * How a faction reads the player. `value` is a band id ("warm") or a
 * raw standing; prefer the band — it survives a re-tune of what an act
 * outcome is worth, and it is the same word the character screen shows.
 * `mode` defaults to "at-least"; "at-most" is the door that only opens
 * once they have stopped liking you.
 */
export interface ReputationRequirement {
  type: "reputation";
  factionId: FactionId;
  value: ReputationThreshold;
  mode?: "at-least" | "at-most";
}

/**
 * Which power the city reads as the player's — a gate on the standings
 * *against each other* rather than on any one of them. `factionId`
 * "none" is the fourth face of the same beat: the split city, nobody
 * clearly owed and nobody clearly owing, which a scene that calls in
 * favours has to answer for as much as it answers for the three names.
 *
 * `min` is the floor a leader must clear to count (band id or raw
 * standing, defaulting to "warm"); see dominantFaction for the tie
 * rules. Author the four variants of a beat as four choices — exactly
 * one of them can ever pass.
 */
export interface DominantFactionRequirement {
  type: "dominant-faction";
  factionId: FactionId | "none";
  min?: ReputationThreshold;
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
  | OpenWorkbenchEffect
  | OpenVendorEffect
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
 * Opens the weapon bench. Shaped exactly like the stylist's: the
 * dialogue closes while the player works, and the choice's target node
 * reopens when the bench screen closes. Every socket rule, the removal
 * fee, and the moves between bag and weapon live in the workbench logic
 * (src/inventory/workbench.ts) — this effect is only the door.
 *
 * "Only at a bench" is enforced by there being no other door: nothing
 * outside a workbench screen calls fitMod or pullMod.
 */
export interface OpenWorkbenchEffect {
  type: "open-workbench";
}

/**
 * Opens a counter's trade screen. Shaped exactly like the bench's: the
 * dialogue closes while the player trades, and the choice's target node
 * reopens when the screen closes.
 *
 * The vendor id names a counter in src/data/economy.ts, whose shelf,
 * spread, standing rate and haggle state are all the screen's problem;
 * this effect is only the door. Prices are never authored on a choice —
 * a scene that wants to sell something opens the counter that sells it.
 */
export interface OpenVendorEffect {
  type: "open-vendor";
  vendorId: string;
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
  /**
   * What taking this moves with the city's factions, per faction (see
   * src/data/factions.ts). Applied as the choice is taken and clamped
   * into the scale; a band crossing is reported back so the scene can
   * say so.
   *
   * A choice that writes an outcome the standing table already knows
   * about must carry exactly what that table declares — the migration
   * pass reads the same table off a finished save, and a test pins the
   * two together so a live run and a re-loaded one can never disagree.
   */
  standing?: StandingDelta;
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
  /**
   * Further nodes the world can open directly, for an arc that is a
   * bundle of doorways rather than one thread — the street scenes a
   * world condition spawns somebody to hold, each opened by its own
   * interactable and reaching none of the others (see
   * ./data/story/streets.ts). Absent means the arc has the one entry,
   * which is what every narrative arc has.
   *
   * Only reachability reads this: a node listed here is a legitimate
   * place to start, so validateArc walks the graph from all of them
   * before calling anything orphaned.
   */
  entryNodeIds?: readonly string[];
  nodes: StoryNode[];
}

/** Every node the world may open an arc at, entry first. */
export function arcEntryNodeIds(arc: StoryArc): string[] {
  return [...new Set([arc.entryNodeId, ...(arc.entryNodeIds ?? [])])];
}
