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

/** Every companion fighting alongside the player, defeated ones included. */
export function allyCombatants(state: CombatState): Combatant[] {
  return state.combatants.filter((c) => c.kind === "ally");
}

/**
 * True when these two stand on opposite sides. The only question the
 * rules ever ask about sides — targeting, area impact, threatened
 * ground and reach fields all go through it — so adding a third kind to
 * the player's side changed one function rather than nine call sites.
 */
export function areOpposed(a: Combatant, b: Combatant): boolean {
  return isHostile(a) !== isHostile(b);
}

/** True for the AI's side. */
export function isHostile(combatant: Combatant): boolean {
  return combatant.kind === "enemy";
}

/**
 * True for a body the player takes the turn of: their character and any
 * companion. What "your turn" means to the UI and to the player-only
 * actions that are really player-*controlled* actions.
 */
export function isPlayerControlled(combatant: Combatant): boolean {
  return !isHostile(combatant);
}

export function isAlive(combatant: Combatant): boolean {
  return combatant.hp > 0;
}

export function livingEnemies(state: CombatState): Combatant[] {
  return state.combatants.filter((c) => c.kind === "enemy" && isAlive(c));
}

/** The player's side, still standing: the player plus unbeaten allies. */
export function livingCrew(state: CombatState): Combatant[] {
  return state.combatants.filter((c) => isPlayerControlled(c) && isAlive(c));
}

/** A stat with the combatant's active boosts folded in (never below 1). */
export function combatStat(combatant: Combatant, stat: StatKey): number {
  const boosted = combatant.boosts.reduce(
    (value, boost) => (boost.stat === stat ? value + boost.amount : value),
    combatant.stats[stat],
  );
  return Math.max(1, boosted);
}
