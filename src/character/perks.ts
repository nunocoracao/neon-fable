import { getPerk, perks, type Perk, type PerkEffects } from "../data/perks";
import type { CharacterState } from "./create";

/**
 * What the perks a character has taken actually do, as one folded
 * record of figures.
 *
 * This is the join between the perk content and the rest of the game,
 * and it is deliberately the *only* one. Nothing downstream reads a
 * perk id: `armorValue` asks for `armorBonus`, `dialogueStats` asks for
 * `dialogueCool`, the fight asks for `extraSteps`, and none of them
 * knows which perk (or how many) put the figure there. Adding a perk is
 * therefore a content change; adding a *kind* of perk is one new field
 * and one derivation point that reads it.
 *
 * Folding rules, and why they differ:
 *
 * - Additive figures (armor, steps, percentages, capacity) sum. Two
 *   perks that both quiet chrome quiet it twice, which is what a player
 *   who spent two picks on the same idea is owed.
 * - Threshold figures (the foresight turns, the second-wind shares)
 *   take the strongest rather than the sum. Summing a *share of your
 *   frame* across picks would compound into nonsense the first time the
 *   pool grows a second one; the best answer is the answer.
 */

/** Every figure a perk can move, all present, zero meaning no change. */
export interface PerkModifiers {
  healingPercent: number;
  dampenerPercent: number;
  neuralCapacity: number;
  armorBonus: number;
  extraSteps: number;
  enemyIntent: number;
  secondWindBelow: number;
  secondWindRecover: number;
  dialogueCool: number;
  staticPoise: number;
  factionRapport: number;
}

/** The record a character with no perks folds to. Never mutated. */
export const NO_PERKS: PerkModifiers = Object.freeze({
  healingPercent: 0,
  dampenerPercent: 0,
  neuralCapacity: 0,
  armorBonus: 0,
  extraSteps: 0,
  enemyIntent: 0,
  secondWindBelow: 0,
  secondWindRecover: 0,
  dialogueCool: 0,
  staticPoise: 0,
  factionRapport: 0,
});

/** Fields that sum across picks; everything else takes the strongest. */
const ADDITIVE_FIELDS = [
  "healingPercent",
  "dampenerPercent",
  "neuralCapacity",
  "armorBonus",
  "extraSteps",
  "dialogueCool",
  "staticPoise",
  "factionRapport",
] as const satisfies readonly (keyof PerkModifiers)[];

const MAX_FIELDS = [
  "enemyIntent",
  "secondWindBelow",
  "secondWindRecover",
] as const satisfies readonly (keyof PerkModifiers)[];

/**
 * The figures a set of perk ids folds to. Ids with no content behind
 * them are ignored rather than thrown at: content moves, and a save
 * naming a retired perk should load as a character who has one fewer
 * habit, not as an unopenable file.
 */
export function foldPerkEffects(
  effects: readonly PerkEffects[],
): PerkModifiers {
  const folded: PerkModifiers = { ...NO_PERKS };
  for (const effect of effects) {
    for (const field of ADDITIVE_FIELDS) {
      folded[field] += effect[field] ?? 0;
    }
    for (const field of MAX_FIELDS) {
      folded[field] = Math.max(folded[field], effect[field] ?? 0);
    }
  }
  return folded;
}

export function perkModifiers(perkIds: readonly string[]): PerkModifiers {
  return foldPerkEffects(
    perkIds
      .map((id) => getPerk(id)?.effects)
      .filter((effects): effects is PerkEffects => effects !== undefined),
  );
}

/**
 * The perk ids a character has taken. Tolerant of a hand-edited or
 * older-shaped record for the same reason the fold is: the field is
 * young, and a missing one is an empty list.
 */
export function perkIdsOf(character: CharacterState): string[] {
  return character.advancement.perkIds ?? [];
}

/** What this character's perks do. The call every seam makes. */
export function characterPerks(character: CharacterState): PerkModifiers {
  return perkModifiers(perkIdsOf(character));
}

export function hasPerk(character: CharacterState, perkId: string): boolean {
  return perkIdsOf(character).includes(perkId);
}

/** The perks taken, as content, in pool order — what a sheet lists. */
export function takenPerks(character: CharacterState): Perk[] {
  const taken = new Set(perkIdsOf(character));
  return perks.filter((perk) => taken.has(perk.id));
}

/** What is still on offer: the pool less what has already been taken. */
export function availablePerks(character: CharacterState): Perk[] {
  const taken = new Set(perkIdsOf(character));
  return perks.filter((perk) => !taken.has(perk.id));
}

/**
 * A perk list with duplicates and retired ids removed, in pool order.
 * Used by save migration for the same reason the mod and dye sanitizers
 * exist: content moves, and a pick pointing at nothing has to stop
 * paying out rather than quietly keep doing so.
 */
export function normalizePerkIds(perkIds: readonly string[] | undefined): string[] {
  const wanted = new Set(perkIds ?? []);
  return perks.filter((perk) => wanted.has(perk.id)).map((perk) => perk.id);
}

/* --- Derivation seams the modifiers are read at ---------------------- */

/**
 * Healing actually received from an item that promises `amount`. The
 * one place a heal figure is adjusted — out of combat (useConsumable)
 * and inside it (the fight's use-item action) both come through here,
 * so a stimpack is worth the same either side of a fight's edge.
 */
export function healedAmount(amount: number, mods: PerkModifiers): number {
  if (mods.healingPercent === 0) return amount;
  return Math.round(amount * (1 + mods.healingPercent / 100));
}

/**
 * What one implant's Static load reads as. Only quieting is touched: a
 * perk that made dampeners better has no opinion about how loud a
 * cortex stack is, and rounding away from zero keeps a half point of
 * extra quiet worth having.
 */
export function dampenedLoad(load: number, mods: PerkModifiers): number {
  if (load >= 0 || mods.dampenerPercent === 0) return load;
  return -Math.round(-load * (1 + mods.dampenerPercent / 100));
}

/**
 * How much chrome this frame can carry: the figure the stat line
 * derives, plus whatever the perks lend. Every install check and every
 * capacity readout goes through this — the rule and the meter cannot
 * disagree about whether one more implant fits.
 */
export function neuralCapacityOf(character: CharacterState): number {
  return character.derived.neuralCapacity + characterPerks(character).neuralCapacity;
}
