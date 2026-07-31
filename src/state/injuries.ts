import {
  characterInjury,
  healCharacter,
  injuryDef,
  tickCharacterInjury,
  tickInjury,
  type CarriedInjury,
} from "../character/injury";
import type { GameState } from "./gameState";
import {
  companionInjury,
  getMember,
  setCompanionInjury,
} from "./party";

/**
 * The two things that end an injury: time, and a clinic.
 *
 * Both are here rather than beside the wound itself because both are
 * about the *run* — the party heals with the player, and the fee comes
 * out of the same credits everything else does. The rules for a single
 * carried injury (worst replaces, counting the time off) stay pure and
 * character-shaped in src/character/injury.ts; this module only decides
 * who they are applied to.
 *
 * ## Recovery is measured in moves across the city
 *
 * `advanceInjuries` is called from exactly one place — the `travel`
 * effect (src/narrative/effects.ts) — and that is the whole of the
 * recovery clock. It is the cleanest hook the existing structure
 * offers: a travel is the one event that is unambiguously the story
 * moving on, it happens once per move whether the player walked through
 * a door or a scene sent them, and it cannot be repeated by reloading a
 * save the way a screen mount can. Which is also the design: going down
 * should cost the next stretch of the run, not the next hour of
 * exploring one district.
 */

/** Whose injury an operation is about: the player, or a companion. */
export interface InjuryTarget {
  /** Companion content id; omit for the player. */
  companionId?: string;
}

/**
 * What this target is carrying, or null. Null for a companion this run
 * never recruited, which is the same answer as "not hurt" to every
 * caller — a gate cannot open on the wound of somebody who is not here.
 */
export function carriedInjury(
  state: GameState,
  target: InjuryTarget = {},
): CarriedInjury | null {
  return target.companionId == null
    ? characterInjury(state.player)
    : companionInjury(state.party, target.companionId);
}

/**
 * What a clinic charges this target tonight: the carried injury's own
 * fee, and 0 for somebody with nothing wrong (there is nothing to pay
 * for). Content owns the figure — see src/data/injuries.ts — so a
 * choice that quotes a price and the effect that charges it are reading
 * the same number.
 */
export function treatmentFee(
  state: GameState,
  target: InjuryTarget = {},
): number {
  return injuryDef(carriedInjury(state, target))?.treatCost ?? 0;
}

/**
 * True when this target could be treated right now: something to treat,
 * and the credits to cover it. What the clinic's own choices gate on.
 */
export function canTreatInjury(
  state: GameState,
  target: InjuryTarget = {},
): boolean {
  const injury = injuryDef(carriedInjury(state, target));
  if (!injury) return false;
  return state.credits >= injury.treatCost;
}

/**
 * The state with this target's injury closed and the fee paid.
 *
 * A no-op when there is nothing to treat or the credits are not there,
 * so a scene can offer it without first asking — a refusal costs
 * nothing and changes nothing, exactly like a refused restyle.
 */
export function treatInjury(
  state: GameState,
  target: InjuryTarget = {},
): GameState {
  const injury = injuryDef(carriedInjury(state, target));
  if (!injury || state.credits < injury.treatCost) return state;
  const credits = state.credits - injury.treatCost;
  if (target.companionId == null) {
    return { ...state, credits, player: healCharacter(state.player) };
  }
  if (!getMember(state.party, target.companionId)) return state;
  return {
    ...state,
    credits,
    party: setCompanionInjury(state.party, target.companionId, null),
  };
}

/**
 * The state after `steps` moves across the city: everybody's injury a
 * little further along, and gone entirely once it has run out. The
 * whole crew heals, benched companions included — a wound does not wait
 * for somebody to be taken out again before it starts closing.
 */
export function advanceInjuries(state: GameState, steps = 1): GameState {
  const player = tickCharacterInjury(state.player, steps);
  const members = state.party.members.map((member) => {
    const injury = tickInjury(member.injury, steps);
    return (member.injury ?? null) === injury ? member : { ...member, injury };
  });
  const partyChanged = members.some((member, i) => member !== state.party.members[i]);
  if (player === state.player && !partyChanged) return state;
  return {
    ...state,
    player,
    party: partyChanged ? { ...state.party, members } : state.party,
  };
}
