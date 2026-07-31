import type { Appearance, CharacterState } from "../character";
import { requireItem } from "../data/items";
import { addItem } from "../inventory";
import type { ItemResolver } from "../inventory";
import type { GameState } from "./gameState";

/**
 * New Game+: a modest carry-over into a fresh run after any completed
 * playthrough. The bonus lives in character creation (extra point-buy
 * points, plus the finished character's appearance seeding the wizard)
 * and one legacy item granted here; everything is recorded on the new
 * run's own GameState via flags, so NG+ saves stay self-contained and
 * pre-NG+ saves load exactly as before.
 *
 * Deliberately excluded: perks. They are what the *street* decided
 * about a particular runner, earned from that run's own deeds and won
 * fights (src/character/cred.ts), and a reputation is not inheritable.
 * Nothing here has to enforce that — a New Game+ character is built by
 * createCharacter like any other, and starts with an empty list — but
 * the exclusion is stated on the creation summary rather than left for
 * a player to discover, because an unexplained absence reads as a bug.
 */

/** Extra point-buy points a New Game+ character allocates. */
export const NG_PLUS_BONUS_POINTS = 3;

/** Set on a GameState created through New Game+. */
export const NG_PLUS_FLAG = "ng-plus";

/** Item id of the legacy carry-over, when one was chosen. */
export const NG_PLUS_CARRYOVER_FLAG = "ng-plus-carryover";

export function isNewGamePlus(state: GameState): boolean {
  return state.flags[NG_PLUS_FLAG] === true;
}

/**
 * The item ids a finishing character can pass forward: equipped weapon
 * and outfit plus every installed enhancement.
 */
export function carryoverCandidates(character: CharacterState): string[] {
  const { weapon, outfit, enhancements } = character.equipment;
  return [weapon, outfit, ...Object.values(enhancements)].filter(
    (id): id is string => typeof id === "string",
  );
}

/**
 * The look a finishing character passes forward: a fresh copy of its
 * appearance, recorded in meta-progress and seeded into the New Game+
 * wizard as the initial working look (every field stays editable there).
 */
export function carryoverAppearance(character: CharacterState): Appearance {
  return { ...character.appearance };
}

/**
 * Marks a fresh GameState as New Game+ and grants the chosen legacy
 * item (into the inventory — enhancements still have to be installed,
 * neural capacity permitting). Pure: returns a new state.
 */
export function applyNewGamePlus(
  state: GameState,
  carryoverItemId: string | null,
  resolve: ItemResolver = requireItem,
): GameState {
  const flags: GameState["flags"] = { ...state.flags, [NG_PLUS_FLAG]: true };
  let inventory = state.inventory;
  if (carryoverItemId !== null) {
    flags[NG_PLUS_CARRYOVER_FLAG] = carryoverItemId;
    inventory = addItem(inventory, carryoverItemId, 1, resolve);
  }
  return { ...state, flags, inventory };
}
