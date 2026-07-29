/**
 * Typed events the iso scene emits when the player reaches or clicks an
 * interactable. The iso layer never imports narrative or combat engines;
 * it only forwards these payloads through a callback for the app shell
 * to route.
 */

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
 * A way out the player is pointing at or standing beside. The scene
 * reports the destination's map id, not its name — resolving content
 * ids stays with the app shell.
 */
export interface IsoExitHint {
  interactableId: string;
  /** The exit's own label, e.g. "Chainwell Stair". */
  label: string;
  /** Destination map id. */
  mapId: string;
  /** Whether the cursor is on it or the player is stood next to it. */
  reason: "hover" | "nearby";
}

/** Called with the exit in focus, or null when none is. */
export type IsoExitHintHandler = (hint: IsoExitHint | null) => void;
