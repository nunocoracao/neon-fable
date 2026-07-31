import { getCompanion } from "../data/companions";
import { requireItem } from "../data/items";
import { addItem, countItem, removeItem } from "../inventory/inventory";
import type { ItemResolver } from "../inventory/items";
import type { GameState } from "../state/gameState";
import { advanceInjuries, treatInjury } from "../state/injuries";
import { adjustLoyalty, getMember, recruitCompanion } from "../state/party";
import type { Effect } from "./types";

/**
 * Effect application: immutable updates over GameState. start-combat marks
 * the encounter as pending on GameState (the UI layer launches it); the
 * remaining flow-control effects (goto, end) do not touch state here —
 * applyChoice folds them into the ChoiceOutcome instead.
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
      return { ...state, pendingEncounterId: effect.encounterId };
    case "travel":
      // Crossing the city is the game's one unambiguous "and then
      // later" — it happens once per move, whether the player walked
      // through a door or a scene sent them, and reloading a save
      // cannot repeat it. So it is also where a wound gets a little
      // older (see src/state/injuries.ts): going down costs the next
      // stretch of the run rather than the next hour of one district.
      return { ...advanceInjuries(state), location: effect.mapId };
    case "recruit-companion": {
      // Unknown ids are an authoring bug the arc validator catches;
      // at runtime a missing companion leaves the scene running.
      if (!getCompanion(effect.companionId)) {
        console.error(`Unknown companion id "${effect.companionId}"`);
        return state;
      }
      return { ...state, party: recruitCompanion(state.party, effect.companionId) };
    }
    case "companion-loyalty":
      // Nobody to earn it from is not an error: a beat can offer
      // goodwill a party without that companion simply never collects.
      return getMember(state.party, effect.companionId)
        ? {
            ...state,
            party: adjustLoyalty(
              state.party,
              effect.companionId,
              effect.amount,
            ),
          }
        : state;
    case "treat-injury":
      // Nothing to treat, or the credits short, is not an error: the
      // clinic's own choices gate on both, so a player never reaches a
      // refusal — and a scene that offers it anyway simply costs them
      // nothing (see treatInjury).
      return treatInjury(state, {
        ...(effect.companionId != null
          ? { companionId: effect.companionId }
          : {}),
      });
    case "open-stylist":
    case "open-workbench":
    case "open-vendor":
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
