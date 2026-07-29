import { requireItem } from "../data/items";
import type { ItemResolver } from "../inventory/items";
import type { GameState } from "../state/gameState";
import { applyEffects } from "./effects";
import { checkRequirements } from "./requirements";
import type { Choice, StoryArc, StoryNode } from "./types";

/**
 * Story graph engine: pure functions over GameState and an arc's data.
 * The UI renders availableChoices and calls applyChoice; nothing here
 * mutates its inputs.
 */

export type NarrativeErrorCode =
  | "unknown-node"
  | "unknown-choice"
  | "requirements-not-met";

export class NarrativeError extends Error {
  constructor(
    readonly code: NarrativeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "NarrativeError";
  }
}

export function getNode(arc: StoryArc, nodeId: string): StoryNode | undefined {
  return arc.nodes.find((node) => node.id === nodeId);
}

/** Like getNode but throws NarrativeError("unknown-node") when absent. */
export function requireNode(arc: StoryArc, nodeId: string): StoryNode {
  const node = getNode(arc, nodeId);
  if (!node) {
    throw new NarrativeError(
      "unknown-node",
      `No node "${nodeId}" in arc "${arc.id}"`,
    );
  }
  return node;
}

/** A choice as the dialogue UI should present it. */
export interface PresentedChoice {
  choice: Choice;
  /** False for choices shown greyed-out because requirements fail. */
  enabled: boolean;
}

/**
 * The node's choices as the player sees them: passing choices are enabled,
 * failing ones are dropped ("hidden", the default) or kept disabled
 * ("disabled"), in authored order.
 */
export function availableChoices(
  state: GameState,
  node: StoryNode,
  resolve: ItemResolver = requireItem,
): PresentedChoice[] {
  const presented: PresentedChoice[] = [];
  for (const choice of node.choices) {
    const enabled = checkRequirements(state, choice.requirements, resolve);
    if (enabled) {
      presented.push({ choice, enabled: true });
    } else if (choice.ifUnavailable === "disabled") {
      presented.push({ choice, enabled: false });
    }
  }
  return presented;
}

/** What taking a choice produced, beyond the new state. */
export interface ChoiceOutcome {
  state: GameState;
  /** Node to show next; null when the arc ended. */
  nextNodeId: string | null;
  /** Encounter to launch before showing the next node, if any. */
  encounterId: string | null;
  /** Map to move to before showing the next node, if any. */
  travelTo: string | null;
  /** True when an open-stylist effect fired: the UI shows the re-style
   * screen, then resumes dialogue at nextNodeId. */
  stylist: boolean;
  /** True when an end marker fired. */
  ended: boolean;
  /** Ending id from the end marker, when it carried one. */
  endingId?: string;
}

/**
 * Takes a choice: verifies it exists and its requirements pass, applies
 * its effects immutably, and resolves the next node (the choice's target,
 * unless a goto or end marker overrides it).
 */
export function applyChoice(
  state: GameState,
  node: StoryNode,
  choiceId: string,
  resolve: ItemResolver = requireItem,
): ChoiceOutcome {
  const choice = node.choices.find((c) => c.id === choiceId);
  if (!choice) {
    throw new NarrativeError(
      "unknown-choice",
      `No choice "${choiceId}" on node "${node.id}"`,
    );
  }
  if (!checkRequirements(state, choice.requirements, resolve)) {
    throw new NarrativeError(
      "requirements-not-met",
      `Choice "${choiceId}" on node "${node.id}" has unmet requirements`,
    );
  }

  const nextState = applyEffects(state, choice.effects, resolve);

  let nextNodeId: string | null = choice.target ?? null;
  let encounterId: string | null = null;
  let travelTo: string | null = null;
  let stylist = false;
  let ended = false;
  let endingId: string | undefined;
  for (const effect of choice.effects ?? []) {
    if (effect.type === "start-combat") encounterId = effect.encounterId;
    if (effect.type === "travel") travelTo = effect.mapId;
    if (effect.type === "open-stylist") stylist = true;
    if (effect.type === "goto") nextNodeId = effect.nodeId;
    if (effect.type === "end") {
      ended = true;
      nextNodeId = null;
      endingId = effect.endingId;
    }
  }

  return {
    state: nextState,
    nextNodeId,
    encounterId,
    travelTo,
    stylist,
    ended,
    endingId,
  };
}
