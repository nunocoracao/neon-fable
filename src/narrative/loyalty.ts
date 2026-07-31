import {
  getCompanion,
  reactionValue,
  type Companion,
} from "../data/companions";
import type { GameState } from "../state/gameState";
import { activeMembers, adjustLoyalty, getMember } from "../state/party";
import type { Choice } from "./types";

/**
 * Loyalty: what the people walking with the player make of what the
 * player does.
 *
 * The content side is two halves that never name each other. A choice
 * declares what kind of act it is (`reactions`, a list of tags); a
 * companion declares what they make of each kind (`values`). This
 * module multiplies them out. Nothing here knows who Vesper is or what
 * a market is, and no beat has to be re-authored when a companion is
 * added — the new person simply starts having opinions about scenes
 * that were written years before they existed.
 *
 * Only the companions actually standing there react. Loyalty is earned
 * in front of somebody, so a benched companion neither approves nor
 * disapproves of a night they were not on.
 */

/** One companion's movement from one choice. */
export interface LoyaltyChange {
  companionId: string;
  delta: number;
}

/** The companions who would witness a choice taken from this state. */
export function witnesses(state: GameState): string[] {
  return activeMembers(state.party).map((member) => member.companionId);
}

/** What a set of reaction tags is worth to one companion. */
export function reactionTotal(
  companion: Companion,
  tags: readonly string[] | undefined,
): number {
  return (tags ?? []).reduce(
    (total, tag) => total + reactionValue(companion, tag),
    0,
  );
}

/**
 * What a choice's tags move for each of the given witnesses, in
 * witness order. Companions with no content, and companions the tags
 * leave cold, are dropped — the result is only what actually moved.
 */
export function reactionChanges(
  companionIds: readonly string[],
  tags: readonly string[] | undefined,
): LoyaltyChange[] {
  if (!tags || tags.length === 0) return [];
  const changes: LoyaltyChange[] = [];
  for (const companionId of companionIds) {
    const companion = getCompanion(companionId);
    if (!companion) continue;
    const delta = reactionTotal(companion, tags);
    if (delta !== 0) changes.push({ companionId, delta });
  }
  return changes;
}

/**
 * Folds loyalty changes into a state. Somebody who has left the party
 * between witnessing the choice and it landing (a beat that benches
 * the person it is about) is skipped rather than throwing.
 */
export function applyLoyaltyChanges(
  state: GameState,
  changes: readonly LoyaltyChange[],
): GameState {
  let party = state.party;
  for (const change of changes) {
    if (!getMember(party, change.companionId)) continue;
    party = adjustLoyalty(party, change.companionId, change.delta);
  }
  return party === state.party ? state : { ...state, party };
}

/**
 * The loyalty a choice would move, resolved against the party standing
 * there now. The engine calls this *before* the choice's effects, so
 * the witnesses are the people who were in the room when it was taken
 * — a companion recruited by the same choice has not seen anything yet.
 */
export function choiceLoyaltyChanges(
  state: GameState,
  choice: Pick<Choice, "reactions">,
): LoyaltyChange[] {
  return reactionChanges(witnesses(state), choice.reactions);
}

/**
 * Whether a companion is ready to raise their personal scene: they are
 * out with the player, they have made their mind up (loyalty at or
 * past their threshold), and they have not had this conversation yet.
 * The content gates the scene's own choices on the same figures; this
 * is what the party screen offers the conversation from.
 */
export function personalSceneReady(
  state: GameState,
  companionId: string,
): boolean {
  const companion = getCompanion(companionId);
  const member = getMember(state.party, companionId);
  if (!companion || !member?.recruited || !member.active) return false;
  if (member.loyalty < companion.personalScene.loyalty) return false;
  // Read exactly the way the content's own `flag-unset` gate reads it,
  // so the panel and the scene can never disagree about "not yet".
  return !(companion.personalScene.resolvedFlag in state.flags);
}

/** Every companion with something to say right now, in party order. */
export function readyPersonalScenes(state: GameState): Array<{
  companionId: string;
  nodeId: string;
}> {
  return state.party.members
    .filter((member) => personalSceneReady(state, member.companionId))
    .map((member) => ({
      companionId: member.companionId,
      nodeId: getCompanion(member.companionId)!.personalScene.nodeId,
    }));
}
