import { characterInjury } from "../character/injury";
import { characterPerks, perkIdsOf } from "../character/perks";
import { readiedEffects } from "../character/readied";
import { isConsumable, usableIn } from "../inventory/consumables";
import { liveSpawns, requireEncounter, spawnLookIndex } from "../data/encounters";
import { ALERTED_INITIATIVE_PENALTY, alertFlag } from "../data/stealth";
import { requireEnemy } from "../data/enemies";
import { tunedEnemyHp } from "../data/difficulty";
import { requireItem } from "../data/items";
import {
  armorValue,
  effectiveStats,
  equippedWeaponProfile,
  grantedAbilityIds,
} from "../inventory";
import type { ItemResolver } from "../inventory/items";
import type { GameState } from "../state/gameState";
import { activeMembers } from "../state/party";
import { nextFloat, type RngState } from "../state/rng";
import { rulesModifiers } from "../state/rules";
import { staticEffects } from "../inventory/staticLoad";
import { allyCombatant, allyStartTile } from "./ally";
import { applyTimedEffect } from "./effects";
import { stepBudget } from "./grid";
import { initiativeScore } from "./state";
import { openSurgeTurn, startingSurge } from "./surge";
import { tuningFor } from "./tuning";
import {
  type Combatant,
  type CombatConsumable,
  type CombatEvent,
  type CombatState,
  type CombatWeapon,
} from "./types";
import { UNARMED_WEAPON } from "./damage";

/**
 * Combat setup: builds a CombatState from an encounter id and the current
 * GameState. Player stats and gear are snapshotted here (via effectiveStats
 * and the equipment selectors); initiative is ordered by Reflexes with a
 * seeded-RNG tiebreak drawn from the game's RNG state.
 */

export const PLAYER_COMBATANT_ID = "player";

/**
 * What the player swings, with whatever is bolted to it already folded
 * in. The fold happens once, here, through the item layer's single
 * derivation (equippedWeaponProfile) — so the fight, the odds a tooltip
 * quotes, and the AI's read of your reach are all one number, and none
 * of them has to know a mod exists.
 */
function playerWeapon(
  state: GameState,
  resolve: ItemResolver,
): CombatWeapon {
  return equippedWeaponProfile(state.player, resolve) ?? UNARMED_WEAPON;
}

/**
 * What the player can actually reach for mid-fight. Filtered here
 * rather than at the point of use, so the fight's snapshot is the kit
 * this fight has — a bag full of field kits and cold noodles is a
 * combatant with no items, and the action bar says so.
 */
function playerConsumables(
  state: GameState,
  resolve: ItemResolver,
): CombatConsumable[] {
  const totals = new Map<string, number>();
  for (const stack of state.inventory.stacks) {
    const item = resolve(stack.itemId);
    if (!isConsumable(item) || !usableIn(item, "combat")) continue;
    totals.set(stack.itemId, (totals.get(stack.itemId) ?? 0) + stack.quantity);
  }
  return [...totals].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export function createCombat(
  state: GameState,
  encounterId: string,
  resolve: ItemResolver = requireItem,
): CombatState {
  const encounter = requireEncounter(encounterId);

  // How hard tonight is, taken once here and carried on the fight like
  // every other snapshotted figure (see ./tuning.ts) — the engine never
  // learns that a difficulty preset exists, it simply resolves a fight
  // whose numbers are what they are.
  const tuning = tuningFor(state);
  const modifiers = rulesModifiers(state.rules);

  // What the noise costs, taken once here and carried on the combatant
  // like every other snapshotted figure — the engine never learns that
  // Static exists, it simply orders a body that is a step slow.
  const staticBand = staticEffects(state.player, resolve);

  // And what being seen coming costs. A fight a patrol started is the
  // same fight with the player a place further down the queue: the
  // penalty folds into the one initiative shift the combatant already
  // carries, so the engine learns nothing about stealth either — it
  // orders a body that is a step slow, for one more reason.
  const alerted = state.flags[alertFlag(encounterId)] === true;
  const initiativePenalty =
    staticBand.initiativePenalty + (alerted ? ALERTED_INITIATIVE_PENALTY : 0);

  // And what the habits are worth, folded once here for the same
  // reason: the engine reads figures off the combatant, never a perk
  // id. A runner who has taken none carries no record at all.
  const perks = characterPerks(state.player);
  const hasPerks = perkIdsOf(state.player).length > 0;

  const injured = characterInjury(state.player);

  const player: Combatant = {
    id: PLAYER_COMBATANT_ID,
    kind: "player",
    name: state.player.name || "You",
    stats: effectiveStats(state.player, resolve),
    maxHp: state.player.derived.maxHp,
    hp: state.player.hp,
    weapon: playerWeapon(state, resolve),
    armor: armorValue(state.player, resolve),
    abilityIds: grantedAbilityIds(state.player, resolve),
    ...(initiativePenalty > 0 ? { initiativeMod: -initiativePenalty } : {}),
    ...(hasPerks ? { perks } : {}),
    // What the last bad fight left behind. Carried for the rail's badge
    // only — the cost is already in the stats and abilities above.
    ...(injured ? { injury: injured.id } : {}),
    position: { ...encounter.playerStart },
    // Whatever was eaten before the door: a meal's lift starts on turn
    // one of the fight it was bought for, through the same family rule
    // a dose taken mid-fight goes through (see ./effects.ts).
    boosts: readiedEffects(state.player).reduce(
      applyTimedEffect,
      [] as Combatant["boosts"],
    ),
    stunTurns: 0,
    charge: null,
    cooldowns: {},
    consumables: playerConsumables(state, resolve),
  };

  // Who actually turns up. A body a run stood down before the fight
  // simply is not here; everyone else keeps their authored slot, so the
  // faces and the ids are the same either way (see liveSpawns).
  const foes: Combatant[] = liveSpawns(encounter, state.flags).map(
    ({ spawn, slot }) => {
      const enemy = requireEnemy(spawn.enemyId);
      // How much frame the preset says this archetype stands up with.
      // Scaled once, here, so max and current agree and every share the
      // game reads off a frame — bloodied, heavy, critical — is a share
      // of the frame this fight actually has.
      const maxHp = tunedEnemyHp(enemy.maxHp, modifiers.enemyHpPct);
      return {
        id: `${enemy.id}-${slot + 1}`,
        kind: "enemy" as const,
        name: enemy.name,
        enemyId: enemy.id,
        // Which face this slot wears. Pinned by the encounter or picked
        // from the archetype's look family by a seed made of the
        // encounter id and this slot — never from the combat RNG, so
        // varying the faces cannot move a single die.
        lookIndex: spawnLookIndex(encounterId, slot, spawn),
        stats: { ...enemy.stats },
        maxHp,
        hp: maxHp,
        weapon: { ...enemy.weapon },
        armor: enemy.armor,
        abilityIds: [...enemy.abilityIds],
        position: { ...spawn.position },
        // How much floor the archetype stands on. Absent on almost
        // everything (one tile, as it always was); a security chassis
        // carries a block, and every grid rule reads it (see ./footprint).
        ...(enemy.footprint ? { footprint: { ...enemy.footprint } } : {}),
        boosts: [],
        stunTurns: 0,
        charge: null,
        cooldowns: {},
        consumables: [],
      };
    },
  );

  // The crew falls in beside the player before the enemies are placed
  // is not an option — the spawns are content and cannot move — so the
  // companions take whatever room is left around the player's start.
  const allies: Combatant[] = [];
  for (const member of activeMembers(state.party)) {
    const tile = allyStartTile(encounter.grid, player.position, [
      player,
      ...foes,
      ...allies,
    ]);
    if (!tile) continue;
    allies.push(allyCombatant(member, tile, resolve));
  }

  const combatants = [player, ...allies, ...foes];

  let rng: RngState = state.rng;
  const tiebreaks = new Map<string, number>();
  for (const combatant of combatants) {
    const roll = nextFloat(rng);
    rng = roll.state;
    tiebreaks.set(combatant.id, roll.value);
  }
  const initiativeOrder = [...combatants]
    .sort((a, b) => {
      const byReflexes = initiativeScore(b) - initiativeScore(a);
      if (byReflexes !== 0) return byReflexes;
      const byRoll = tiebreaks.get(b.id)! - tiebreaks.get(a.id)!;
      if (byRoll !== 0) return byRoll;
      return a.id < b.id ? -1 : 1;
    })
    .map((c) => c.id);

  const first = combatants.find((c) => c.id === initiativeOrder[0])!;
  const log: CombatEvent[] = [
    { type: "combat-started", encounterId },
    { type: "round-started", round: 1 },
    { type: "turn-started", combatantId: first.id },
  ];

  const opening: CombatState = {
    encounterId,
    grid: { ...encounter.grid },
    combatants,
    initiativeOrder,
    round: 1,
    turnIndex: 0,
    moveRemaining: stepBudget(first),
    actionUsed: false,
    rng,
    status: "active",
    fleeable: encounter.fleeable ?? true,
    tuning,
    surge: startingSurge(state.player, PLAYER_COMBATANT_ID, resolve),
    itemsConsumed: [],
    log,
  };
  // The opening turn is a turn like any other, so the noise starts
  // banking on it rather than on the second one — otherwise a player
  // who wins initiative gets a free turn of quiet for winning it.
  return openSurgeTurn(opening, first.id);
}
