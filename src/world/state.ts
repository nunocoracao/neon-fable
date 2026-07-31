/**
 * What the city currently knows, derived.
 *
 * `deriveWorldState` is the whole reactive layer's single read of
 * GameState: it runs every authored condition's requirement bundle
 * through the engine's own `checkRequirements` and hands back the set
 * that passed. Everything downstream — who is on a map, what the
 * screens say, what a vendor will sell — is a pure function of that set
 * and of content, and never of GameState again.
 *
 * That indirection is the point. A district reacts to *the city being
 * in a state*, not to a flag; re-keying a condition onto a different
 * beat moves every reaction with it, and a reaction can never
 * accidentally read the player's inventory or a companion's mood
 * because the only thing it is handed is a set of ids.
 *
 * Derivation is cheap and stateless — call it per mount, not per frame.
 */
import { WORLD_CONDITIONS, type WorldConditionId } from "../data/world";
import { checkRequirements } from "../narrative/requirements";
import type { GameState } from "../state/gameState";

/** The conditions live in this run, in authored order. */
export interface WorldState {
  conditions: readonly WorldConditionId[];
}

/** Nothing has happened yet: the city as it is before a run touches it. */
export const EMPTY_WORLD: WorldState = { conditions: [] };

export function deriveWorldState(state: GameState): WorldState {
  return {
    conditions: WORLD_CONDITIONS.filter((condition) =>
      checkRequirements(state, [...condition.requirements]),
    ).map((condition) => condition.id),
  };
}

/** Build a world state directly from condition ids, for tests and dev. */
export function worldOf(...conditions: readonly WorldConditionId[]): WorldState {
  return { conditions };
}

export function hasCondition(
  world: WorldState,
  id: WorldConditionId,
): boolean {
  return world.conditions.includes(id);
}

/**
 * The gate every reactive channel is written against: live only while
 * all of `requires` hold and none of `absent` do. Vacuously true for a
 * rule that names neither, which is how a district's standing content
 * stays standing.
 */
export function conditionsAllow(
  world: WorldState,
  gate: {
    requires?: readonly WorldConditionId[];
    absent?: readonly WorldConditionId[];
  },
): boolean {
  return (
    (gate.requires ?? []).every((id) => hasCondition(world, id)) &&
    !(gate.absent ?? []).some((id) => hasCondition(world, id))
  );
}
