import { refreshFamily } from "../inventory/consumables";
import {
  EFFECT_FAMILIES,
  type EffectFamily,
  type TimedEffect,
} from "../inventory/items";
import { STAT_KEYS, type StatKey } from "./stats";
import type { CharacterState } from "./create";

/**
 * What a body is carrying into its next fight.
 *
 * A meal is not a combat action — nobody eats noodles with a chassis
 * walking at them — so what it buys has to wait somewhere until there
 * is a fight to spend it in. That somewhere is here: a short list of
 * timed effects held on the character, seeded onto the player's boosts
 * at setup (src/combat/setup.ts) and cleared when the fight folds back
 * (src/combat/outcome.ts).
 *
 * The same no-stack rule the fight plays by applies while they wait: a
 * second meal of an occupied family replaces the first rather than
 * stacking, so eating the whole cart is worth exactly one meal.
 *
 * Plain serializable data, absent on anybody who has not eaten — which
 * is what every save written before street food existed already says.
 */

/** What this character is holding over, in authored order. */
export function readiedEffects(
  character: CharacterState,
): readonly TimedEffect[] {
  return character.readied ?? [];
}

/** The character with `effect` held over, under the family rule. */
export function readyEffect(
  character: CharacterState,
  effect: TimedEffect,
): CharacterState {
  return {
    ...character,
    readied: refreshFamily(readiedEffects(character), effect),
  };
}

/** The character with nothing held over — what a spent fight leaves. */
export function clearReadied(character: CharacterState): CharacterState {
  if (!character.readied || character.readied.length === 0) return character;
  const { readied: _spent, ...rest } = character;
  return rest;
}

function isFamily(value: unknown): value is EffectFamily {
  return EFFECT_FAMILIES.some((family) => family === value);
}

function isStat(value: unknown): value is StatKey {
  return STAT_KEYS.some((stat) => stat === value);
}

function finiteInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : fallback;
}

/**
 * A held-over list made sound: entries naming a family or a stat this
 * build no longer has are dropped, durations are clamped to something a
 * fight can actually count down, and one entry per family survives.
 *
 * Used by save migration for the same reason the mod, dye, perk and
 * injury sanitizers exist: content moves, and an effect pointing at
 * nothing has to stop being carried rather than quietly ride along.
 * Returns undefined for "carrying nothing", which is the shape an
 * older save already has.
 */
export function normalizeReadied(
  value: unknown,
): TimedEffect[] | undefined {
  if (!Array.isArray(value)) return undefined;
  let kept: TimedEffect[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    if (!isFamily(entry.family) || !isStat(entry.stat)) continue;
    const amount = finiteInt(entry.amount, 0);
    if (amount === 0) continue;
    const effect: TimedEffect = {
      family: entry.family,
      stat: entry.stat,
      amount,
      turns: Math.max(1, finiteInt(entry.turns, 1)),
    };
    const after = entry.after;
    if (typeof after === "object" && after !== null) {
      const cost = after as Record<string, unknown>;
      const costAmount = finiteInt(cost.amount, 0);
      if (isStat(cost.stat) && costAmount !== 0) {
        effect.after = {
          stat: cost.stat,
          amount: costAmount,
          turns: Math.max(1, finiteInt(cost.turns, 1)),
        };
      }
    }
    kept = refreshFamily(kept, effect);
  }
  return kept.length > 0 ? kept : undefined;
}
