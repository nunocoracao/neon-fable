/**
 * Typed events the iso scene emits when the player reaches or clicks an
 * interactable. The iso layer never imports narrative or combat engines;
 * it only forwards these payloads through a callback for the app shell
 * to route.
 */
import type { FocusReason } from "./affordance";
import type { InteractableSpriteId } from "./tilemap";

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
