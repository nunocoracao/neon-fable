import {
  FACTION_IDS,
  type FactionId,
  type ReputationBandId,
  type StandingDelta,
} from "../data/factions";
import type { GameState } from "../state/gameState";
import { applyStanding, bandFor, reputationOf } from "../state/reputation";
import type { Choice } from "./types";

/**
 * Standing: what the districts make of what the player does.
 *
 * The shape is the companions' one (see ./loyalty.ts) with the people
 * taken out. A choice declares a swing per faction; this module resolves
 * it against the standing the player is actually carrying, so the report
 * that comes back is what *moved* rather than what was authored — a
 * faction already pinned at the ceiling registers nothing, and the scene
 * correctly says nothing.
 *
 * Only a band crossing is worth telling the player about. The number is
 * bookkeeping; "the Cistern Court counts you Trusted" is the event.
 */

/** One faction's movement from one choice. */
export interface StandingChange {
  factionId: FactionId;
  /** What actually landed after clamping; 0 changes are dropped. */
  delta: number;
  from: number;
  to: number;
  fromBand: ReputationBandId;
  toBand: ReputationBandId;
  /** True when the shift crossed into a different band. */
  bandChanged: boolean;
}

/**
 * What a swing would move against this state. Factions the swing leaves
 * alone, and factions already at the end of the scale it pushes toward,
 * are dropped — the result is only what actually moved.
 */
export function standingChanges(
  state: GameState,
  standing: StandingDelta | undefined,
): StandingChange[] {
  if (!standing) return [];
  const changes: StandingChange[] = [];
  let reputation = state.reputation;
  for (const factionId of FACTION_IDS) {
    const amount = standing[factionId];
    if (!amount) continue;
    const from = reputationOf(reputation, factionId);
    reputation = applyStanding(reputation, { [factionId]: amount });
    const to = reputationOf(reputation, factionId);
    if (to === from) continue;
    const fromBand = bandFor(from).id;
    const toBand = bandFor(to).id;
    changes.push({
      factionId,
      delta: to - from,
      from,
      to,
      fromBand,
      toBand,
      bandChanged: fromBand !== toBand,
    });
  }
  return changes;
}

/** What taking this choice would move with the city. */
export function choiceStandingChanges(
  state: GameState,
  choice: Pick<Choice, "standing">,
): StandingChange[] {
  return standingChanges(state, choice.standing);
}

/** Folds resolved changes into a state. */
export function applyStandingChanges(
  state: GameState,
  changes: readonly StandingChange[],
): GameState {
  if (changes.length === 0) return state;
  let reputation = state.reputation;
  for (const change of changes) {
    reputation = applyStanding(reputation, { [change.factionId]: change.delta });
  }
  return { ...state, reputation };
}

/** The changes that crossed a band — the ones the player is told about. */
export function bandCrossings(
  changes: readonly StandingChange[],
): StandingChange[] {
  return changes.filter((change) => change.bandChanged);
}
