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
