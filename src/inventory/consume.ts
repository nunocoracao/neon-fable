import type { CharacterState } from "../character/create";
import { healCharacter } from "../character/injury";
import { characterPerks } from "../character/perks";
import { readyEffect } from "../character/readied";
import { requireItem } from "../data/items";
import {
  consumableOutcome,
  outcomeMatters,
  usableIn,
  type ConsumableSubject,
} from "./consumables";
import type { Loadout } from "./equipment";
import { removeItem, type InventoryState } from "./inventory";
import { InventoryError, type ItemResolver } from "./items";

/**
 * Out-of-combat consumable use: the other half of the fight's use-item
 * action, over a character rather than a combatant.
 *
 * What may be opened out here is content's call — a stim is a combat
 * action spent instead of a swing and says so (see ConsumableContext) —
 * and what a dose is worth is the shared derivation the combat item
 * list also quotes, so a patch heals the same either side of an arena
 * door. Everything a meal buys is held over for the next fight (see
 * src/character/readied.ts); a field kit closes a wound with no clinic
 * and no fee beyond what the kit cost.
 *
 * Pure: returns a new { character, inventory } pair.
 */

/** The character, as the consumable derivation reads a body. */
export function characterSubject(
  character: CharacterState,
): ConsumableSubject {
  return {
    hp: character.hp,
    maxHp: character.derived.maxHp,
    perks: characterPerks(character),
    injured: character.injury != null,
  };
}

export function useConsumable(
  character: CharacterState,
  inventory: InventoryState,
  itemId: string,
  resolve: ItemResolver = requireItem,
): Loadout {
  const item = resolve(itemId);
  if (item.kind !== "consumable") {
    throw new InventoryError(
      "wrong-kind",
      `Cannot use "${itemId}": not a consumable`,
    );
  }
  if (!usableIn(item, "exploration")) {
    throw new InventoryError(
      "not-usable",
      `"${item.name}" only works in a fight`,
    );
  }
  const outcome = consumableOutcome(item, characterSubject(character));
  // A dose that would change nothing is a dose thrown away: a patch on
  // somebody untouched, a splint kit on somebody unhurt. A meal never
  // lands here, because what it readies applies whatever shape the
  // eater is in.
  if (!outcomeMatters(outcome)) {
    // Name the specific reason where there is one to name: "already at
    // full health" is a sentence a player can act on, and "nothing this
    // would do would help" is not.
    const heals = item.effects.some((effect) => effect.type === "heal");
    throw new InventoryError(
      "not-usable",
      heals && character.hp >= character.derived.maxHp
        ? `Already at full health — "${item.name}" would be wasted`
        : `Nothing "${item.name}" would do helps right now`,
    );
  }

  let next: CharacterState = {
    ...character,
    hp: Math.min(character.derived.maxHp, character.hp + outcome.heal),
  };
  if (outcome.treatsInjury) next = healCharacter(next);
  for (const effect of outcome.readied) next = readyEffect(next, effect);

  return { character: next, inventory: removeItem(inventory, itemId) };
}
