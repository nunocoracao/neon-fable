import type { StatKey } from "../character/stats";
import { CombatError, type Combatant, type CombatState } from "./types";

/**
 * Read-only selectors over CombatState. Actions and AI go through these
 * instead of indexing into the combatants array directly.
 */

export function getCombatant(
  state: CombatState,
  id: string,
): Combatant | undefined {
  return state.combatants.find((c) => c.id === id);
}

export function requireCombatant(state: CombatState, id: string): Combatant {
  const combatant = getCombatant(state, id);
  if (!combatant) {
    throw new CombatError("unknown-combatant", `No combatant with id "${id}"`);
  }
  return combatant;
}

/** The combatant whose turn it is. */
export function activeCombatant(state: CombatState): Combatant {
  return requireCombatant(state, state.initiativeOrder[state.turnIndex] ?? "");
}

export function playerCombatant(state: CombatState): Combatant {
  const player = state.combatants.find((c) => c.kind === "player");
  if (!player) {
    throw new CombatError("unknown-combatant", "Combat has no player combatant");
  }
  return player;
}

export function isAlive(combatant: Combatant): boolean {
  return combatant.hp > 0;
}

export function livingEnemies(state: CombatState): Combatant[] {
  return state.combatants.filter((c) => c.kind === "enemy" && isAlive(c));
}

/** A stat with the combatant's active boosts folded in (never below 1). */
export function combatStat(combatant: Combatant, stat: StatKey): number {
  const boosted = combatant.boosts.reduce(
    (value, boost) => (boost.stat === stat ? value + boost.amount : value),
    combatant.stats[stat],
  );
  return Math.max(1, boosted);
}
