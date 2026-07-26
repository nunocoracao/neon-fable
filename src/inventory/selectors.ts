import type { CharacterState } from "../character/create";
import { STAT_HARD_CAP, STAT_KEYS, type Stats } from "../character/stats";
import { requireItem } from "../data/items";
import type { Item, ItemResolver } from "./items";

/**
 * Read-only selectors over a character's equipment. Combat and narrative
 * gating consume these instead of reading base stats or raw item data.
 */

/** Every item currently equipped or installed, in slot order. */
export function equippedItems(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): Item[] {
  const { weapon, outfit, enhancements } = character.equipment;
  const ids = [weapon, outfit, ...Object.values(enhancements)];
  return ids.filter((id): id is string => id != null).map(resolve);
}

/**
 * Base stats with every equipped item's and installed enhancement's
 * stat-mod effects folded in. Values are clamped to [1, STAT_HARD_CAP].
 * Note: neural capacity is derived from base stats, not effective stats,
 * so installs cannot invalidate each other.
 */
export function effectiveStats(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): Stats {
  const stats = { ...character.stats };
  for (const item of equippedItems(character, resolve)) {
    if (item.kind === "consumable" || item.kind === "misc") continue;
    for (const effect of item.effects) {
      if (effect.type === "stat-mod") {
        stats[effect.stat] += effect.amount;
      }
    }
  }
  for (const key of STAT_KEYS) {
    stats[key] = Math.min(STAT_HARD_CAP, Math.max(1, stats[key]));
  }
  return stats;
}

/** Combat ability ids granted by equipped gear and installed enhancements. */
export function grantedAbilityIds(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): string[] {
  const ids: string[] = [];
  for (const item of equippedItems(character, resolve)) {
    if (item.kind === "consumable" || item.kind === "misc") continue;
    for (const effect of item.effects) {
      if (effect.type === "grant-ability" && !ids.includes(effect.abilityId)) {
        ids.push(effect.abilityId);
      }
    }
  }
  return ids;
}

/** Dialogue tags unlocked by equipped gear and installed enhancements. */
export function dialogueUnlockTags(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): string[] {
  const tags: string[] = [];
  for (const item of equippedItems(character, resolve)) {
    if (item.kind === "consumable" || item.kind === "misc") continue;
    for (const effect of item.effects) {
      if (effect.type === "unlock-dialogue" && !tags.includes(effect.tag)) {
        tags.push(effect.tag);
      }
    }
  }
  return tags;
}

/** Armor value of the equipped outfit, or 0 when unarmored. */
export function armorValue(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): number {
  const outfitId = character.equipment.outfit;
  if (outfitId == null) return 0;
  const item = resolve(outfitId);
  return item.kind === "outfit" ? item.armor : 0;
}
