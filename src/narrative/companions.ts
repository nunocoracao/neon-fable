import { requireItem } from "../data/items";
import type { ItemResolver } from "../inventory/items";
import type { GameState } from "../state/gameState";
import { getMember } from "../state/party";
import { checkRequirements } from "./requirements";
import type { CompanionComment, StoryNode } from "./types";

/**
 * Companion asides: the mechanism by which somebody walking with the
 * player gets to talk in a scene that was not written for them.
 *
 * A node carries optional `comments`, each tagged with a companion and
 * its own requirements. Selection is pure and additive — an aside never
 * gates a choice, never sets a flag, and never changes which node comes
 * next — so existing content is untouched and a scene with no companion
 * present reads exactly as it always did.
 */

/** A companion's line, resolved against the party and the world. */
export interface CompanionAside {
  companionId: string;
  text: string;
}

/**
 * Every aside on this node that would land: its companion is with the
 * player and its own requirements pass, in authored order. Authoring
 * rule: put the specific lines first and the catch-all last, the same
 * way the epilogue vignettes are ordered.
 */
export function companionAsides(
  node: Pick<StoryNode, "comments">,
  state: GameState,
  resolve: ItemResolver = requireItem,
): CompanionAside[] {
  return (node.comments ?? [])
    .filter((comment) => isPresent(comment, state))
    .filter((comment) => checkRequirements(state, comment.requirements, resolve))
    .map(({ companionId, text }) => ({ companionId, text }));
}

/** The one aside a scene shows, or null when nobody has anything to say. */
export function companionAside(
  node: Pick<StoryNode, "comments">,
  state: GameState,
  resolve: ItemResolver = requireItem,
): CompanionAside | null {
  return companionAsides(node, state, resolve)[0] ?? null;
}

function isPresent(comment: CompanionComment, state: GameState): boolean {
  const member = getMember(state.party, comment.companionId);
  return member?.recruited === true && member.active;
}
