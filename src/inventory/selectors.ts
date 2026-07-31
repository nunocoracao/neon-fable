import type { CharacterState } from "../character/create";
import { characterPerks } from "../character/perks";
import { STAT_HARD_CAP, STAT_KEYS, type Stats } from "../character/stats";
import { requireItem } from "../data/items";
import type { Item, ItemEffect, ItemResolver, ModItem } from "./items";
import {
  characterEffects,
  installedMods,
  weaponProfile,
  type WeaponProfile,
} from "./mods";

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
 * The parts fitted to the weapon in hand, in socket order. Empty while
 * unarmed, and for anything that has never been to a bench. A fitted
 * part is not an equipped *item* — it is part of the weapon — so it is
 * deliberately absent from equippedItems and reported here instead.
 */
export function equippedMods(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): ModItem[] {
  const weaponId = character.equipment.weapon;
  if (weaponId == null) return [];
  const item = resolve(weaponId);
  if (item.kind !== "weapon") return [];
  return installedMods(item, character.equipment.weaponMods, resolve);
}

/**
 * The equipped weapon's figures with its fitted parts folded in, or
 * null while unarmed. The single derivation combat snapshots (see
 * createCombat) — nothing downstream re-reads the mods.
 */
export function equippedWeaponProfile(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): WeaponProfile | null {
  const weaponId = character.equipment.weapon;
  if (weaponId == null) return null;
  const item = resolve(weaponId);
  if (item.kind !== "weapon") return null;
  return weaponProfile(
    item,
    installedMods(item, character.equipment.weaponMods, resolve),
  );
}

/**
 * Every character-facing effect the loadout contributes: equipped gear,
 * installed enhancements, and the parts fitted to the weapon in hand.
 * The three selectors below all read this one list, so a mod's +1
 * Reflexes and an outfit's are folded in by exactly the same rule.
 */
function loadoutEffects(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): ItemEffect[] {
  return [
    ...equippedItems(character, resolve).flatMap(characterEffects),
    ...equippedMods(character, resolve).flatMap(characterEffects),
  ];
}

/**
 * Base stats with every equipped item's, installed enhancement's, and
 * fitted weapon part's stat-mod effects folded in. Values are clamped
 * to [1, STAT_HARD_CAP]. Note: neural capacity is derived from base
 * stats, not effective stats, so installs cannot invalidate each other.
 */
export function effectiveStats(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): Stats {
  const stats = { ...character.stats };
  for (const effect of loadoutEffects(character, resolve)) {
    if (effect.type === "stat-mod") {
      stats[effect.stat] += effect.amount;
    }
  }
  for (const key of STAT_KEYS) {
    stats[key] = Math.min(STAT_HARD_CAP, Math.max(1, stats[key]));
  }
  return stats;
}

/**
 * Combat ability ids granted by equipped gear, installed enhancements,
 * fitted weapon parts, and advancement unlocks
 * (character.advancement.abilityIds).
 */
export function grantedAbilityIds(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): string[] {
  const ids: string[] = [...character.advancement.abilityIds];
  for (const effect of loadoutEffects(character, resolve)) {
    if (effect.type === "grant-ability" && !ids.includes(effect.abilityId)) {
      ids.push(effect.abilityId);
    }
  }
  return ids;
}

/** Dialogue tags unlocked by equipped gear, implants, and fitted parts. */
export function dialogueUnlockTags(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): string[] {
  const tags: string[] = [];
  for (const effect of loadoutEffects(character, resolve)) {
    if (effect.type === "unlock-dialogue" && !tags.includes(effect.tag)) {
      tags.push(effect.tag);
    }
  }
  return tags;
}

/**
 * Armor the character actually meets a blow with: the equipped outfit's
 * plating plus whatever their perks add on top (see PerkModifiers).
 * Zero-floored, so an unarmored runner with no perks is still exactly
 * unarmored. Combat snapshots this figure once at setup, which is why a
 * perk that adds armor needs no second thought anywhere in the engine
 * or in the previews the HUD quotes.
 */
export function armorValue(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): number {
  const outfitId = character.equipment.outfit;
  const item = outfitId == null ? null : resolve(outfitId);
  const worn = item?.kind === "outfit" ? item.armor : 0;
  return Math.max(0, worn + characterPerks(character).armorBonus);
}
