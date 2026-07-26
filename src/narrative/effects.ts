import { requireItem } from "../data/items";
import { addItem, countItem, removeItem } from "../inventory/inventory";
import type { ItemResolver } from "../inventory/items";
import type { GameState } from "../state/gameState";
import type { Effect } from "./types";

/**
 * Effect application: immutable updates over GameState. Flow-control
 * effects (start-combat, goto, end) do not touch state here — applyChoice
 * folds them into the ChoiceOutcome instead.
 */

export function applyEffect(
  state: GameState,
  effect: Effect,
  resolve: ItemResolver = requireItem,
): GameState {
  switch (effect.type) {
    case "set-flag":
      return {
        ...state,
        flags: { ...state.flags, [effect.key]: effect.value },
      };
    case "increment-flag": {
      const current = state.flags[effect.key];
      const base = typeof current === "number" ? current : 0;
      return {
        ...state,
        flags: { ...state.flags, [effect.key]: base + (effect.amount ?? 1) },
      };
    }
    case "add-item":
      return {
        ...state,
        inventory: addItem(
          state.inventory,
          effect.itemId,
          effect.quantity ?? 1,
          resolve,
        ),
      };
    case "remove-item": {
      const wanted = effect.quantity ?? 1;
      const carried = countItem(state.inventory, effect.itemId);
      const taken = Math.min(wanted, carried);
      if (taken === 0) return state;
      return {
        ...state,
        inventory: removeItem(state.inventory, effect.itemId, taken),
      };
    }
    case "credits":
      return { ...state, credits: Math.max(0, state.credits + effect.amount) };
    case "start-combat":
    case "goto":
    case "end":
      return state;
  }
}

export function applyEffects(
  state: GameState,
  effects: Effect[] | undefined,
  resolve: ItemResolver = requireItem,
): GameState {
  return (effects ?? []).reduce(
    (next, effect) => applyEffect(next, effect, resolve),
    state,
  );
}
