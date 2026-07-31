/**
 * Typed events the iso scene emits when the player reaches or clicks an
 * interactable. The iso layer never imports narrative or combat engines;
 * it only forwards these payloads through a callback for the app shell
 * to route.
 */
import type { FocusReason } from "./affordance";
import type {
  DayPhaseId,
  InteractableSpriteId,
  WeatherId,
} from "./tilemap";

export type MapInteraction =
  | { kind: "dialogue"; nodeId: string }
  | { kind: "combat"; encounterId: string };

/** Emitted with the id of the interactable that triggered it. */
export interface IsoInteractionEvent {
  interactableId: string;
  interaction: MapInteraction;
}

export type IsoInteractionHandler = (event: IsoInteractionEvent) => void;

/**
 * The one interactable the scene is offering: the thing the cursor is
 * on, or the nearest thing within reach. The scene reports ids and the
 * label the map authored, never resolved content — turning a
 * destination map id into a name stays with the app shell.
 */
export interface IsoFocusHint {
  interactableId: string;
  /** The interactable's own label, e.g. "Chainwell Stair". */
  label: string;
  spriteId: InteractableSpriteId;
  /** What triggering it would start, for the prompt's verb. */
  interaction: MapInteraction;
  /** Whether the cursor is on it or the player is stood next to it. */
  reason: FocusReason;
  /** Whether the player can trigger it from where they stand. */
  inRange: boolean;
  /** Destination map id, on interactables that lead off the map. */
  exitMapId?: string;
}

/** Called with the interactable in focus, or null when none is. */
export type IsoFocusHintHandler = (hint: IsoFocusHint | null) => void;

/**
 * The three kinds of figure on an explorable map that can have
 * something to say: a passer-by, a named person standing on the map,
 * and whoever is walking with the player. Nothing else speaks — props
 * and ways out are furniture.
 */
export const SCENE_SPEAKER_KINDS = ["pedestrian", "npc", "companion"] as const;

export type SceneSpeakerKind = (typeof SCENE_SPEAKER_KINDS)[number];

/**
 * A figure the scene could hang a line over: who they are, how far off
 * the player is, and where their head is on screen this frame. The
 * scene reports positions and ids only — what anybody *says* is content
 * resolved by the shell (see src/narrative/barks.ts), keeping the rule
 * that the iso layer imports no narrative code.
 */
export interface SceneSpeaker {
  /** Unique within the scene: a pedestrian, an interactable, "companion". */
  id: string;
  kind: SceneSpeakerKind;
  /**
   * The content id behind the figure — an interactable id for a named
   * NPC, the follower's sprite id for the companion — or null for a
   * pedestrian, who is nobody in particular.
   */
  refId: string | null;
  /** Ambient zone a pedestrian belongs to; null for everyone else. */
  zoneId: string | null;
  /** Tiles between the figure and the player. */
  distance: number;
  /** Viewport CSS pixels: the point just above the figure's head. */
  anchorX: number;
  anchorY: number;
  /** Whether that point falls inside the viewport. */
  onScreen: boolean;
}

/** Everything about one frame that decides who speaks and what about. */
export interface SceneSpeakerFrame {
  /** The scene's own animation clock, in milliseconds. */
  timeMs: number;
  mapId: string;
  weather: WeatherId;
  dayPhase: DayPhaseId;
  speakers: readonly SceneSpeaker[];
  /** Milliseconds the player has stood still — how long they've lingered. */
  lingerMs: number;
}

/** Called once a frame with everyone who could be given a line. */
export type SceneSpeakerHandler = (frame: SceneSpeakerFrame) => void;
