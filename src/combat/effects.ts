import { NO_PERKS } from "../character/perks";
import {
  refreshFamily,
  type ConsumableSubject,
} from "../inventory/consumables";
import type { TimedEffect } from "../inventory/items";
import type { ActiveBoost, Combatant } from "./types";

/**
 * The timed-effect clock: what starting, ticking and settling a
 * temporary shift does to a body's boost list.
 *
 * Three rules, and all of them live here so the fight, the readied
 * effects a meal hands over, and the tests read one implementation:
 *
 *  - **Same family replaces.** A second dose of an occupied family
 *    displaces what was there rather than stacking on it (see
 *    EffectFamily). Effects with no family — an ability's own buff —
 *    stack freely, exactly as they always did.
 *  - **Expiry pays the bill.** A shift carrying an `after` does not
 *    simply vanish: the crash lands in its place, in the same family,
 *    which is what lets a fresh dose push a bill back instead of
 *    doubling it.
 *  - **Settling clears what is owed.** Bleeding a body off drops the
 *    debts it is carrying and nothing else — a lift you paid for is
 *    still a lift.
 *
 * Pure list-to-list, like everything else the engine folds.
 */

/**
 * A combatant, as the consumable derivation reads a body. The one join
 * between the fight's snapshot and the item layer's arithmetic, so a
 * dose is priced identically either side of an arena door.
 */
export function combatSubject(combatant: Combatant): ConsumableSubject {
  return {
    hp: combatant.hp,
    maxHp: combatant.maxHp,
    perks: combatant.perks ?? NO_PERKS,
    injured: combatant.injury != null,
  };
}

/** The boost a timed effect starts as. */
function asBoost(effect: TimedEffect): ActiveBoost {
  return {
    stat: effect.stat,
    amount: effect.amount,
    turnsLeft: Math.max(1, effect.turns),
    family: effect.family,
    ...(effect.after ? { after: { ...effect.after } } : {}),
  };
}

/**
 * The boost list after starting `effect`, under the family rule.
 * Ability buffs (which carry no family) go on the end untouched.
 */
export function applyTimedEffect(
  boosts: readonly ActiveBoost[],
  effect: TimedEffect,
): ActiveBoost[] {
  return refreshFamily(boosts, asBoost(effect));
}

/** A shift that expired and left a bill behind, as the bill. */
function crashOf(boost: ActiveBoost): ActiveBoost | null {
  if (!boost.after) return null;
  return {
    stat: boost.after.stat,
    amount: boost.after.amount,
    turnsLeft: Math.max(1, boost.after.turns),
    family: boost.family,
  };
}

/** What an expiring boost's crash would be reported as; null when clean. */
export function expiredCrash(boost: ActiveBoost): ActiveBoost | null {
  return boost.turnsLeft - 1 > 0 ? null : crashOf(boost);
}

/**
 * The boost list one owner-turn on: everything a turn shorter, expired
 * lifts replaced by whatever they owed, and everything paid up gone.
 */
export function tickTimedEffects(
  boosts: readonly ActiveBoost[],
): ActiveBoost[] {
  const next: ActiveBoost[] = [];
  for (const boost of boosts) {
    const turnsLeft = boost.turnsLeft - 1;
    if (turnsLeft > 0) {
      next.push({ ...boost, turnsLeft });
      continue;
    }
    const crash = crashOf(boost);
    if (crash) next.push(crash);
  }
  return next;
}

/**
 * The boost list with every debt bled off. A debt is a shift that costs
 * its owner something — which is exactly the crashes, because nothing
 * in the game hands out a negative lift.
 */
export function settleTimedEffects(
  boosts: readonly ActiveBoost[],
): ActiveBoost[] {
  return boosts.filter((boost) => boost.amount >= 0);
}
