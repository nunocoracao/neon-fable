import { characterPerks } from "../character/perks";
import { requireItem } from "../data/items";
import { hasItem, countItem } from "../inventory/inventory";
import type { ItemResolver } from "../inventory/items";
import {
  dialogueStats,
  meetsStaticBand,
  staticReading,
} from "../inventory/staticLoad";
import type { GameState } from "../state/gameState";
import { carriedInjury } from "../state/injuries";
import { getMember, loyaltyOf } from "../state/party";
import { canAccess, dominantFaction } from "../state/reputation";
import type { Requirement } from "./types";

/**
 * Requirement evaluation: pure predicates over GameState. Stat checks use
 * effective stats (equipment and enhancement mods included), so gear can
 * open dialogue options.
 *
 * With one deliberate asymmetry: they use `dialogueStats`, not
 * `effectiveStats`. A loud enough stack of chrome costs Cool *in
 * conversation* and nowhere else (see src/data/static.ts), so a
 * screaming runner's Cool gates close while every figure the fight
 * reads stays exactly where it was. The penalty lands here, once, on
 * the only path that gates a sentence.
 */

export function checkRequirement(
  state: GameState,
  requirement: Requirement,
  resolve: ItemResolver = requireItem,
): boolean {
  switch (requirement.type) {
    case "flag-equals":
      return state.flags[requirement.key] === requirement.value;
    case "flag-not-equals":
      return state.flags[requirement.key] !== requirement.value;
    case "flag-at-least": {
      const value = state.flags[requirement.key];
      return (typeof value === "number" ? value : 0) >= requirement.value;
    }
    case "flag-set":
      return requirement.key in state.flags;
    case "flag-unset":
      return !(requirement.key in state.flags);
    case "stat":
      return (
        dialogueStats(state.player, resolve)[requirement.stat] >=
        requirement.value
      );
    case "item":
      return requirement.quantity == null
        ? hasItem(state.inventory, requirement.itemId)
        : countItem(state.inventory, requirement.itemId) >=
            requirement.quantity;
    case "enhancement":
      return Object.values(state.player.equipment.enhancements).includes(
        requirement.itemId,
      );
    case "static":
      return meetsStaticBand(
        staticReading(state.player, resolve).band,
        requirement.band,
        requirement.mode,
      );
    case "background":
      return state.player.tags.includes(requirement.tag);
    case "credits":
      return state.credits >= requirement.value;
    case "companion": {
      const member = getMember(state.party, requirement.companionId);
      if (!member?.recruited) return false;
      return requirement.status === "recruited" ? true : member.active;
    }
    case "injury": {
      // Somebody never recruited carries nothing, which is what makes a
      // crew clinic line close itself when they are not there.
      const carried = carriedInjury(state, {
        ...(requirement.companionId != null
          ? { companionId: requirement.companionId }
          : {}),
      });
      if (!carried) return false;
      return requirement.injuryId == null || carried.id === requirement.injuryId;
    }
    case "loyalty": {
      const standing = loyaltyOf(state.party, requirement.companionId);
      return requirement.mode === "at-most"
        ? standing <= requirement.value
        : standing >= requirement.value;
    }
    case "reputation":
      // The one place a door asks a faction its opinion, and therefore
      // the one place a known face is worth anything (see canAccess).
      return canAccess(
        state.reputation,
        requirement.factionId,
        requirement.value,
        requirement.mode,
        characterPerks(state.player).factionRapport,
      );
    case "dominant-faction": {
      const leader = dominantFaction(state.reputation, requirement.min);
      return requirement.factionId === "none"
        ? leader === null
        : leader === requirement.factionId;
    }
  }
}

/** True when every requirement passes (vacuously true for none). */
export function checkRequirements(
  state: GameState,
  requirements: Requirement[] | undefined,
  resolve: ItemResolver = requireItem,
): boolean {
  return (requirements ?? []).every((r) => checkRequirement(state, r, resolve));
}
