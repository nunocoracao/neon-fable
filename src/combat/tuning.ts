import { ASSIST_DAMAGE_FLOOR } from "../data/assists";
import { NEUTRAL_MODIFIERS, tunedIncomingDamage } from "../data/difficulty";
import type { GameState } from "../state/gameState";
import { assistOn, rulesModifiers } from "../state/rules";
import { isPlayerControlled } from "./state";
import type { Combatant, CombatState, CombatTuning } from "./types";

/**
 * How hard this particular fight is, and the one place a figure the math
 * produced is bent before it lands.
 *
 * The tuning is *snapshotted* onto CombatState at setup, exactly as
 * stats, the weapon profile, and what perks are worth already are (see
 * ./setup.ts). The engine therefore never learns that difficulty exists:
 * it reads two numbers off the fight it is resolving. That is what keeps
 * a saved battle resolvable on its own terms — reload a Blackout fight
 * and it is still the Blackout fight, whatever the settings panel has
 * been doing in the meantime — and what keeps every rule here pure.
 *
 * ## Determinism
 *
 * Nothing here touches the RNG or an odds threshold. `tunedDamage` is
 * applied to damage the math already worked out, *after* the roll that
 * decided whether the blow landed at all. So the same seed and the same
 * action sequence hit and miss on exactly the same turns at every
 * preset with every assist in every position; the blows simply weigh
 * different amounts. (A fight can of course end on a different turn
 * because the numbers are different — that is the feature. What cannot
 * change is which draws come back.)
 */

/** The authored fight: nothing scaled, no floor. */
export const NEUTRAL_TUNING: CombatTuning = {
  incomingDamagePct: NEUTRAL_MODIFIERS.incomingDamagePct,
  playerDamageFloor: 0,
};

/** The tuning a fight carries; a fight from before it existed is neutral. */
export function combatTuning(state: CombatState): CombatTuning {
  return state.tuning ?? NEUTRAL_TUNING;
}

/**
 * The tuning a run hands the fight it is about to start: the preset's
 * incoming-damage scale, and the assist's floor when it is switched on.
 * The only place the two features meet, and they meet as two numbers.
 */
export function tuningFor(state: GameState): CombatTuning {
  return {
    incomingDamagePct: rulesModifiers(state.rules).incomingDamagePct,
    playerDamageFloor: assistOn(state.rules, "damage-floor")
      ? ASSIST_DAMAGE_FLOOR
      : 0,
  };
}

/**
 * What a blow of `raw` from `attacker` actually costs `target`.
 *
 * Every damage figure in the game goes through here — the engine's own
 * blows (./actions.ts), the odds and figures the action bar quotes
 * (./legal.ts), and the outcome chip on the grid (./preview.ts) — which
 * is what makes the number a chip promises the number that lands.
 *
 * Two rules, and they cannot both apply to one blow:
 *
 * - A blow from the other side onto the player's side is scaled by the
 *   preset, and still costs at least a point.
 * - A blow from the player's side onto the other one is raised to the
 *   assist's floor, and never lowered by it.
 *
 * Anything else — a miss, or the odd case of a body damaging its own
 * side — comes back untouched.
 */
export function tunedDamage(
  state: CombatState,
  attacker: Combatant,
  target: Combatant,
  raw: number,
): number {
  if (raw <= 0) return 0;
  const tuning = combatTuning(state);
  const attackerFriendly = isPlayerControlled(attacker);
  const targetFriendly = isPlayerControlled(target);
  if (targetFriendly && !attackerFriendly) {
    return tunedIncomingDamage(raw, tuning.incomingDamagePct);
  }
  if (attackerFriendly && !targetFriendly) {
    return Math.max(raw, tuning.playerDamageFloor);
  }
  return raw;
}
