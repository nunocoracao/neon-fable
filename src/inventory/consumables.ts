import { NO_PERKS, healedAmount, type PerkModifiers } from "../character/perks";
import {
  type ConsumableContext,
  type ConsumableItem,
  type EffectFamily,
  type Item,
  type TimedEffect,
} from "./items";

/**
 * What a consumable would do, worked out once.
 *
 * Every screen that quotes a dose and every system that applies one
 * reads this module: the combat item list, the inventory card, the
 * fight's own use-item action, and the out-of-combat use. That is the
 * point — a preview is only worth showing if it is the same arithmetic
 * the game is about to run, so the figure on the button *is* the figure
 * the dose delivers.
 *
 * Pure and content-shaped: no GameState, no CombatState. The two
 * callers hand in a `ConsumableSubject` describing the body, which a
 * CharacterState and a Combatant can each be reduced to.
 */

/** The body a dose is being priced against. */
export interface ConsumableSubject {
  hp: number;
  maxHp: number;
  /** What this body's habits are worth; NO_PERKS for anybody without. */
  perks: PerkModifiers;
  /** True while carrying an injury a kit could close. */
  injured: boolean;
}

/** What one dose would do to that body, in figures. */
export interface ConsumableOutcome {
  itemId: string;
  /** Hit points actually restored, after perks and the ceiling. */
  heal: number;
  /** Timed effects it starts now. */
  boosts: readonly TimedEffect[];
  /** Timed effects it holds over for the next fight. */
  readied: readonly TimedEffect[];
  /** True when it would close an injury this body is carrying. */
  treatsInjury: boolean;
  /** True when it would settle the chrome and bleed off the crash. */
  settles: boolean;
}

/** A body with nothing wrong with it and no habits — the plain reading. */
export function plainSubject(hp: number, maxHp: number): ConsumableSubject {
  return { hp, maxHp, perks: NO_PERKS, injured: false };
}

export function isConsumable(item: Item): item is ConsumableItem {
  return item.kind === "consumable";
}

/** True when this consumable may be opened in that context. */
export function usableIn(
  item: ConsumableItem,
  context: ConsumableContext,
): boolean {
  return item.contexts.includes(context);
}

/**
 * The list with `entry` in it, having displaced whatever of its family
 * was already there. The one place the no-stack rule is written: two
 * doses of one family never run together, and the second is a refresh
 * rather than a second helping.
 */
export function refreshFamily<T extends { family?: EffectFamily }>(
  list: readonly T[],
  entry: T,
): T[] {
  // Something with no family occupies no slot: it displaces nothing and
  // nothing displaces it, which is how an ability's own buff has always
  // behaved and must go on behaving.
  if (entry.family === undefined) return [...list, entry];
  return [...list.filter((held) => held.family !== entry.family), entry];
}

/** What this dose is worth to this body, right now. */
export function consumableOutcome(
  item: ConsumableItem,
  subject: ConsumableSubject,
): ConsumableOutcome {
  const boosts: TimedEffect[] = [];
  const readied: TimedEffect[] = [];
  let heal = 0;
  let treatsInjury = false;
  let settles = false;

  for (const effect of item.effects) {
    switch (effect.type) {
      case "heal":
        // The perk-aware figure, capped by the room left in the body —
        // a patch on somebody at nine-tenths is worth what fits.
        heal += Math.max(
          0,
          Math.min(
            healedAmount(effect.amount, subject.perks),
            subject.maxHp - subject.hp - heal,
          ),
        );
        break;
      case "boost":
        boosts.push(effect.boost);
        break;
      case "ready-boost":
        readied.push(effect.boost);
        break;
      case "treat-injury":
        treatsInjury = subject.injured;
        break;
      case "settle":
        settles = true;
        break;
    }
  }
  return { itemId: item.id, heal, boosts, readied, treatsInjury, settles };
}

/**
 * True when opening it would actually change something. A patch at full
 * health and a splint kit on somebody unhurt are both a dose thrown
 * away, and the inventory screen refuses them for it; a meal never is,
 * because what it readies lands whatever shape the eater is in.
 */
export function outcomeMatters(outcome: ConsumableOutcome): boolean {
  return (
    outcome.heal > 0 ||
    outcome.boosts.length > 0 ||
    outcome.readied.length > 0 ||
    outcome.treatsInjury ||
    outcome.settles
  );
}
