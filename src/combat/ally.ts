import { getCompanion } from "../data/companions";
import { injuryModifiers } from "../character/injury";
import { STAT_HARD_CAP, STAT_KEYS, type Stats } from "../character/stats";
import { requireItem } from "../data/items";
import { bearsEffects } from "../inventory/items";
import type { Item, ItemResolver } from "../inventory/items";
import type { PartyMember } from "../state/party";
import { UNARMED_WEAPON } from "./damage";
import { canStand, manhattan } from "./grid";
import type {
  Combatant,
  CombatWeapon,
  GridPosition,
  GridSize,
} from "./types";

/**
 * Turning a party member into a body on the board. A companion's combat
 * inputs are derived exactly the way the player's are — base stats plus
 * the stat-mods of what they are carrying, a weapon and an armor value
 * off their equipped items — so an ally is not a special case anywhere
 * downstream of setup. Pure functions over PartyMember; nothing here
 * reads GameState.
 */

/** The combatant id an ally fights under; stable across saves and replays. */
export function allyCombatantId(companionId: string): string {
  return `ally:${companionId}`;
}

/** The companion a combatant id names, or null when it is not an ally's. */
export function companionIdOf(combatantId: string): string | null {
  const [prefix, companionId] = combatantId.split(":");
  return prefix === "ally" && companionId ? companionId : null;
}

function equippedItems(member: PartyMember, resolve: ItemResolver): Item[] {
  return [member.equipment.weapon, member.equipment.outfit]
    .filter((id): id is string => id != null)
    .map(resolve);
}

/**
 * Base stats with the member's gear stat-mods — and whatever they are
 * carrying out of their last bad fight — folded in and clamped. An
 * injury speaks the gear vocabulary (see src/data/injuries.ts), so a
 * companion's wound folds in exactly where the player's does.
 */
export function allyStats(member: PartyMember, resolve: ItemResolver): Stats {
  const stats = { ...member.stats };
  const injury = injuryModifiers(member.injury);
  for (const item of equippedItems(member, resolve)) {
    if (!bearsEffects(item)) continue;
    for (const effect of item.effects) {
      if (effect.type === "stat-mod") stats[effect.stat] += effect.amount;
    }
  }
  for (const effect of injury.effects) {
    if (effect.type === "stat-mod") stats[effect.stat] += effect.amount;
  }
  for (const key of STAT_KEYS) {
    stats[key] = Math.min(STAT_HARD_CAP, Math.max(1, stats[key]));
  }
  return stats;
}

export function allyWeapon(
  member: PartyMember,
  resolve: ItemResolver,
): CombatWeapon {
  const weaponId = member.equipment.weapon;
  if (weaponId == null) return UNARMED_WEAPON;
  const item = resolve(weaponId);
  if (item.kind !== "weapon") return UNARMED_WEAPON;
  return { name: item.name, damage: item.damage, rangeType: item.rangeType };
}

export function allyArmor(member: PartyMember, resolve: ItemResolver): number {
  const outfitId = member.equipment.outfit;
  if (outfitId == null) return 0;
  const item = resolve(outfitId);
  return item.kind === "outfit" ? item.armor : 0;
}

/** Abilities the member knows plus anything their gear grants. */
export function allyAbilityIds(
  member: PartyMember,
  resolve: ItemResolver,
): string[] {
  const ids = [...member.abilityIds];
  for (const item of equippedItems(member, resolve)) {
    if (!bearsEffects(item)) continue;
    for (const effect of item.effects) {
      if (effect.type === "grant-ability" && !ids.includes(effect.abilityId)) {
        ids.push(effect.abilityId);
      }
    }
  }
  return ids;
}

/**
 * The ally combatant for a party member, standing on `position`. A
 * companion enters every fight on their feet however the last one went:
 * being dropped benches them for that fight only (see settleOutcome —
 * the fight is lost when the *player* goes down, not the crew), and the
 * hp they carry in is floored at 1.
 */
export function allyCombatant(
  member: PartyMember,
  position: GridPosition,
  resolve: ItemResolver = requireItem,
): Combatant {
  const companion = getCompanion(member.companionId);
  return {
    id: allyCombatantId(member.companionId),
    kind: "ally",
    // Content's name when there is content for them; the id is the
    // honest fallback for a save whose companion a build removed.
    name: companion?.name ?? member.companionId,
    companionId: member.companionId,
    lookId: member.lookId,
    stats: allyStats(member, resolve),
    maxHp: member.maxHp,
    hp: Math.max(1, Math.min(member.maxHp, member.hp)),
    weapon: allyWeapon(member, resolve),
    armor: allyArmor(member, resolve),
    abilityIds: allyAbilityIds(member, resolve),
    // Carried for the rail's badge only; what it costs is already in
    // the stats above.
    ...(member.injury ? { injury: member.injury.id } : {}),
    position: { ...position },
    boosts: [],
    stunTurns: 0,
    charge: null,
    cooldowns: {},
    // Companions carry no consumables: the item action is the player's.
    consumables: [],
  };
}

/**
 * Where a companion falls in beside the player: the free tile nearest
 * the player's start, ties broken in row-major order (so the tile above
 * wins over the tile beside), which makes a fight's opening formation
 * the same on every replay. Null when the arena has no room at all, in
 * which case the companion sits the fight out rather than standing on
 * somebody.
 */
export function allyStartTile(
  grid: GridSize,
  playerStart: GridPosition,
  taken: readonly Combatant[],
): GridPosition | null {
  let best: GridPosition | null = null;
  let bestCost = Infinity;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const tile = { x, y };
      const cost = manhattan(playerStart, tile);
      if (cost === 0 || cost >= bestCost) continue;
      if (!canStand(grid, [...taken], tile, undefined)) continue;
      best = tile;
      bestCost = cost;
    }
  }
  return best;
}
