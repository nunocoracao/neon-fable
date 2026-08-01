import { clearReadied } from "../character/readied";
import { tunedCredits } from "../data/difficulty";
import { requireEncounter } from "../data/encounters";
import { requireItem } from "../data/items";
import { alertFlag } from "../data/stealth";
import { addItem, countItem, removeItem } from "../inventory/inventory";
import type { ItemResolver } from "../inventory/items";
import type { GameState } from "../state/gameState";
import { getMember, setCompanionHp } from "../state/party";
import { rulesModifiers } from "../state/rules";
import { companionIdOf } from "./ally";
import { applyCombatInjuries } from "./injury";
import { allyCombatants, playerCombatant } from "./state";
import { CombatError, type CombatState } from "./types";

/**
 * Folds a finished combat back into GameState: RNG state advances, spent
 * consumables leave the inventory, the player's hp syncs, an outcome flag
 * is recorded for the narrative, and victory pays the encounter's rewards.
 */

/**
 * Flag recording how an encounter went; its value is "victory", "defeat",
 * or "fled", so story nodes can gate on any outcome with flag-equals.
 */
export function combatResultFlag(encounterId: string): string {
  return `combat:${encounterId}`;
}

export function resolveCombat(
  state: GameState,
  combat: CombatState,
  resolve: ItemResolver = requireItem,
): GameState {
  if (combat.status === "active") {
    throw new CombatError(
      "combat-active",
      "Cannot resolve a combat that is still running",
    );
  }
  const player = playerCombatant(combat);

  let inventory = state.inventory;
  for (const spent of combat.itemsConsumed) {
    const taken = Math.min(spent.quantity, countItem(inventory, spent.itemId));
    if (taken > 0) inventory = removeItem(inventory, spent.itemId, taken);
  }

  // Companions come out of a fight the way the player does: hurt, and
  // never dead. Being dropped costs them the rest of that fight (they
  // stop taking turns the moment their hp hits 0) and nothing after it.
  let party = state.party;
  for (const ally of allyCombatants(combat)) {
    const companionId = ally.companionId ?? companionIdOf(ally.id);
    if (companionId === null || !getMember(party, companionId)) continue;
    party = setCompanionHp(party, companionId, Math.max(1, ally.hp));
  }

  // A fight that opened with the other side already moving has had that
  // out of it: the alert is spent here, beside the pending encounter it
  // arrived with, so it can never carry into a later fight on the same
  // encounter (see src/data/stealth.ts and src/combat/setup.ts).
  const flags = { ...state.flags, [combatResultFlag(combat.encounterId)]: combat.status };
  delete flags[alertFlag(combat.encounterId)];

  let next: GameState = {
    ...state,
    // Defeat leaves the player staggered at 1 hp; the narrative reacts to
    // the outcome flag, not to a dead character.
    //
    // And whatever was eaten before the door is eaten: a meal buys the
    // *next* fight, and this was it, however it went.
    player: { ...clearReadied(state.player), hp: Math.max(1, player.hp) },
    party,
    flags,
    inventory,
    pendingEncounterId:
      state.pendingEncounterId === combat.encounterId
        ? null
        : state.pendingEncounterId,
    rng: combat.rng,
  };

  if (combat.status === "victory") {
    const { rewards } = requireEncounter(combat.encounterId);
    let rewarded = next.inventory;
    for (const reward of rewards.items ?? []) {
      rewarded = addItem(rewarded, reward.itemId, reward.quantity ?? 1, resolve);
    }
    next = {
      ...next,
      // What the preset says the work was worth. Only the money moves:
      // authored items are the *thing* an encounter hands over and a
      // difficulty that took a key away would take a story away with it.
      credits:
        next.credits +
        tunedCredits(
          rewards.credits,
          rulesModifiers(state.rules).creditRewardPct,
        ),
      inventory: rewarded,
    };
  }

  // And what the win cost. Only a won fight can leave a wound (see
  // ./injury.ts): a defeat's whole answer is the panel and the reload,
  // and adding a debuff to it would be charging the player twice for
  // the same bad night. Applied after the hp write-back above, because
  // the read that decides who limps out is of the *fight*, not of the
  // state it folded into.
  return applyCombatInjuries(next, combat, resolve);
}
