import { getInjury, type InjuryDef } from "../data/injuries";
import type { ItemEffect } from "../inventory/items";
import type { CharacterState } from "./create";

/**
 * What an injury a character is carrying actually does, and the two
 * moves that can change it: taking one, and time passing.
 *
 * This is the join between the injury content (src/data/injuries.ts)
 * and the rest of the game, and — exactly like the perk join beside it
 * — it is the only one. Nothing downstream reads an injury id:
 * `effectiveStats` folds `effects`, `dialogueStats` subtracts
 * `dialogueCool`, `grantedAbilityIds` asks `chromeOffline`. Adding an
 * injury is therefore a content change.
 *
 * Everything here is pure and works on a `CarriedInjury | null`, so the
 * player's wound and a companion's are the same code. The GameState-
 * level moves (a fight handing one out, a clinic closing one, the city
 * moving on) live in src/combat/injury.ts and src/state/injuries.ts.
 */

/**
 * The injury a character is carrying: which one, and how much longer.
 * Plain serializable data on CharacterState and on PartyMember; absent
 * (or null) is the ordinary state of being unhurt, which is what every
 * save written before injuries existed already says.
 */
export interface CarriedInjury {
  /** Injury id in src/data/injuries.ts. */
  id: string;
  /**
   * Moves across the city still to come before it closes on its own.
   * Counted down by advanceInjuries; at zero the injury is gone rather
   * than kept at zero, so "carrying nothing" has exactly one shape.
   */
  scenesLeft: number;
}

/** Every figure an injury can move, all present, zero meaning no change. */
export interface InjuryModifiers {
  /** Stat shifts in the gear vocabulary; folded by the same selectors. */
  effects: readonly ItemEffect[];
  /** Cool a conversation loses (a positive number is a penalty). */
  dialogueCool: number;
  /** True while installed cyberware grants no abilities. */
  chromeOffline: boolean;
}

/** The record an uninjured character folds to. Never mutated. */
export const NO_INJURY: InjuryModifiers = Object.freeze({
  effects: Object.freeze([]) as readonly ItemEffect[],
  dialogueCool: 0,
  chromeOffline: false,
});

/**
 * The content behind a carried injury, or null. Tolerant of an id this
 * build no longer has for the same reason the perk fold is: content
 * moves, and a save naming a retired wound should load as somebody who
 * has recovered, not as an unopenable file.
 */
export function injuryDef(
  carried: CarriedInjury | null | undefined,
): InjuryDef | null {
  if (!carried) return null;
  return getInjury(carried.id) ?? null;
}

/** What a carried injury is worth. The call every seam makes. */
export function injuryModifiers(
  carried: CarriedInjury | null | undefined,
): InjuryModifiers {
  const def = injuryDef(carried);
  if (!def) return NO_INJURY;
  return {
    effects: def.effects,
    dialogueCool: def.dialogueCool ?? 0,
    chromeOffline: def.chromeOffline === true,
  };
}

/** The injury this character is carrying, or null. */
export function characterInjury(
  character: CharacterState,
): CarriedInjury | null {
  return character.injury ?? null;
}

/** What this character's injury is doing to them right now. */
export function characterInjuryModifiers(
  character: CharacterState,
): InjuryModifiers {
  return injuryModifiers(characterInjury(character));
}

/**
 * Whether a fresh injury displaces the one already carried.
 *
 * Worst replaces, and only worst: a runner limping on a bad leg who
 * takes a second knock does not start carrying two wounds, and does not
 * have the bad leg quietly downgraded to the bruise either. Ties keep
 * what is already there — including its remaining time — so the same
 * injury landing twice is not a way to reset the clock.
 */
export function worseInjury(
  current: CarriedInjury | null | undefined,
  candidateId: string,
): boolean {
  const candidate = getInjury(candidateId);
  if (!candidate) return false;
  const carried = injuryDef(current);
  if (!carried) return true;
  return candidate.severity > carried.severity;
}

/**
 * The injury carried after taking `injuryId`: the new one when it is
 * worse, whatever was already there otherwise. An unknown id changes
 * nothing (content moves; a fight must not be able to break a save).
 */
export function takeInjury(
  current: CarriedInjury | null | undefined,
  injuryId: string,
): CarriedInjury | null {
  if (!worseInjury(current, injuryId)) return current ?? null;
  const def = getInjury(injuryId)!;
  return { id: def.id, scenesLeft: Math.max(1, def.scenes) };
}

/**
 * The injury carried after `steps` moves across the city: the same one
 * with less time on it, or null once it has closed. An id with no
 * content behind it closes immediately rather than lingering forever.
 */
export function tickInjury(
  current: CarriedInjury | null | undefined,
  steps = 1,
): CarriedInjury | null {
  if (!current) return null;
  if (!getInjury(current.id)) return null;
  const scenesLeft = current.scenesLeft - Math.max(0, steps);
  return scenesLeft > 0 ? { ...current, scenesLeft } : null;
}

/**
 * A carried injury with a hand-edited or retired record made sound: an
 * id this build has no content for closes, and a remaining time outside
 * what content allows is clamped back into it.
 *
 * Used by save migration for the same reason the mod, dye and perk
 * sanitizers exist: content moves, and a wound pointing at nothing has
 * to stop costing rather than quietly keep doing so.
 */
export function normalizeInjury(
  carried: CarriedInjury | null | undefined,
): CarriedInjury | null {
  const def = injuryDef(carried);
  if (!def || !carried) return null;
  const authored = Math.max(1, def.scenes);
  const left = Number.isFinite(carried.scenesLeft)
    ? Math.round(carried.scenesLeft)
    : authored;
  return { id: def.id, scenesLeft: Math.min(authored, Math.max(1, left)) };
}

/* --- Carrier helpers -------------------------------------------------- */

/** The character with `injuryId` taken under the worst-replaces rule. */
export function injureCharacter(
  character: CharacterState,
  injuryId: string,
): CharacterState {
  const injury = takeInjury(characterInjury(character), injuryId);
  if (injury === characterInjury(character)) return character;
  return { ...character, injury };
}

/** The character with whatever they were carrying closed. */
export function healCharacter(character: CharacterState): CharacterState {
  if (!character.injury) return character;
  return { ...character, injury: null };
}

/** The character after `steps` moves across the city. */
export function tickCharacterInjury(
  character: CharacterState,
  steps = 1,
): CharacterState {
  const injury = tickInjury(characterInjury(character), steps);
  if (injury === characterInjury(character)) return character;
  return { ...character, injury };
}
