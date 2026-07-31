import { requireEncounter, spawnLookIndex } from "../data/encounters";
import { requireEnemy } from "../data/enemies";
import { requireItem } from "../data/items";
import { armorValue, effectiveStats, grantedAbilityIds } from "../inventory";
import type { ItemResolver } from "../inventory/items";
import type { GameState } from "../state/gameState";
import { activeMembers } from "../state/party";
import { nextFloat, type RngState } from "../state/rng";
import { allyCombatant, allyStartTile } from "./ally";
import { moveSpeed } from "./grid";
import { combatStat } from "./state";
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

function playerWeapon(
  state: GameState,
  resolve: ItemResolver,
): CombatWeapon {
  const weaponId = state.player.equipment.weapon;
  if (weaponId == null) return UNARMED_WEAPON;
  const item = resolve(weaponId);
  if (item.kind !== "weapon") return UNARMED_WEAPON;
  return { name: item.name, damage: item.damage, rangeType: item.rangeType };
}

function playerConsumables(
  state: GameState,
  resolve: ItemResolver,
): CombatConsumable[] {
  const totals = new Map<string, number>();
  for (const stack of state.inventory.stacks) {
    if (resolve(stack.itemId).kind !== "consumable") continue;
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
    position: { ...encounter.playerStart },
    boosts: [],
    stunTurns: 0,
    charge: null,
    cooldowns: {},
    consumables: playerConsumables(state, resolve),
  };

  const foes: Combatant[] = encounter.enemies.map((spawn, index) => {
    const enemy = requireEnemy(spawn.enemyId);
    return {
      id: `${enemy.id}-${index + 1}`,
      kind: "enemy" as const,
      name: enemy.name,
      enemyId: enemy.id,
      // Which face this slot wears. Pinned by the encounter or picked
      // from the archetype's look family by a seed made of the
      // encounter id and this slot — never from the combat RNG, so
      // varying the faces cannot move a single die.
      lookIndex: spawnLookIndex(encounterId, index, spawn),
      stats: { ...enemy.stats },
      maxHp: enemy.maxHp,
      hp: enemy.maxHp,
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
  });

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
      const byReflexes = combatStat(b, "reflexes") - combatStat(a, "reflexes");
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

  return {
    encounterId,
    grid: { ...encounter.grid },
    combatants,
    initiativeOrder,
    round: 1,
    turnIndex: 0,
    moveRemaining: moveSpeed(combatStat(first, "reflexes")),
    actionUsed: false,
    rng,
    status: "active",
    fleeable: encounter.fleeable ?? true,
    itemsConsumed: [],
    log,
  };
}
