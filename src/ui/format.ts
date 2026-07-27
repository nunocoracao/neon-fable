import {
  STAT_MAX,
  STAT_MIN,
  type PointBuyError,
  type StatKey,
} from "../character/stats";
import { STAT_KEYS } from "../character/stats";
import { getAbility, type Ability } from "../data/abilities";
import { getItem } from "../data/items";
import { UNINSTALL_TRAUMA_PER_LOAD } from "../inventory/equipment";
import type {
  EnhancementItem,
  EnhancementSlot,
  Item,
} from "../inventory/items";
import type { Requirement } from "../narrative/types";
import type { SaveError, SaveSlot } from "../state/save";

/**
 * Pure presentation helpers for the DOM screens: requirement labels,
 * point-buy error text, item summaries, save-slot names, timestamps.
 * No DOM and no GameState mutation — everything here is unit-testable.
 */

export type ItemLookup = (id: string) => Item | undefined;
export type AbilityLookup = (id: string) => Ability | undefined;

export function statLabel(stat: StatKey): string {
  return stat.charAt(0).toUpperCase() + stat.slice(1);
}

export function slotLabel(slot: EnhancementSlot): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

export function signedNumber(amount: number): string {
  return amount > 0 ? `+${amount}` : `${amount}`;
}

/** Short bracketed reason a gated choice is shown disabled, e.g. "[Tech 6]". */
export function requirementLabel(
  requirement: Requirement,
  lookupItem: ItemLookup = getItem,
): string {
  switch (requirement.type) {
    case "stat":
      return `[${statLabel(requirement.stat)} ${requirement.value}]`;
    case "background":
      return `[Background: ${requirement.tag}]`;
    case "item": {
      const name = lookupItem(requirement.itemId)?.name ?? requirement.itemId;
      const quantity = requirement.quantity ?? 1;
      return quantity > 1
        ? `[Requires: ${quantity}× ${name}]`
        : `[Requires: ${name}]`;
    }
    case "enhancement": {
      const name = lookupItem(requirement.itemId)?.name ?? requirement.itemId;
      return `[Installed: ${name}]`;
    }
    case "flag-equals":
      return `[${requirement.key}: ${String(requirement.value)}]`;
    case "flag-at-least":
      return `[${requirement.key} ${requirement.value}+]`;
  }
}

export function requirementLabels(
  requirements: Requirement[] | undefined,
  lookupItem: ItemLookup = getItem,
): string {
  return (requirements ?? [])
    .map((requirement) => requirementLabel(requirement, lookupItem))
    .join(" ");
}

export function pointBuyErrorMessage(error: PointBuyError): string {
  switch (error.code) {
    case "out-of-range":
      return error.stat
        ? `${statLabel(error.stat)} must be between ${STAT_MIN} and ${STAT_MAX}`
        : `Stats must be between ${STAT_MIN} and ${STAT_MAX}`;
    case "overspent":
      return "Allocation spends more points than the pool holds";
    case "underspent":
      return "Spend all remaining points before confirming";
  }
}

/** "+1 Reflexes, +1 Body" — a background's stat bonuses in stat order. */
export function formatBonuses(
  bonuses: Partial<Record<StatKey, number>>,
): string {
  return STAT_KEYS.filter((key) => (bonuses[key] ?? 0) !== 0)
    .map((key) => `${signedNumber(bonuses[key] ?? 0)} ${statLabel(key)}`)
    .join(", ");
}

/** One-line kind/effect summary shown under an item's name. */
export function itemSummary(item: Item): string {
  switch (item.kind) {
    case "weapon": {
      const range = item.rangeType === "melee" ? "Melee" : "Ranged";
      const requirement = item.requirement
        ? ` · needs ${statLabel(item.requirement.stat)} ${item.requirement.value}`
        : "";
      return `${range} weapon · ${item.damage} dmg${requirement}`;
    }
    case "outfit":
      return `Outfit · armor ${item.armor}`;
    case "consumable":
      return item.effect.type === "heal"
        ? `Consumable · heals ${item.effect.amount} HP`
        : `Consumable · ${signedNumber(item.effect.amount)} ` +
            `${statLabel(item.effect.stat)} for ${item.effect.turns} turns (combat only)`;
    case "enhancement":
      return `Cyberware · ${slotLabel(item.slot)} · ${item.neuralCost} neural load`;
    case "misc":
      return "Item";
  }
}

/** Per-effect labels for gear ("+1 Reflexes", "Grants Stun Strike", …). */
export function itemEffectLabels(
  item: Item,
  lookupAbility: AbilityLookup = getAbility,
): string[] {
  if (item.kind === "consumable" || item.kind === "misc") return [];
  return item.effects.map((effect) => {
    switch (effect.type) {
      case "stat-mod":
        return `${signedNumber(effect.amount)} ${statLabel(effect.stat)}`;
      case "grant-ability":
        return `Grants ${lookupAbility(effect.abilityId)?.name ?? effect.abilityId}`;
      case "unlock-dialogue":
        return `Unlocks "${effect.tag}" dialogue`;
    }
  });
}

/** Trade-off warning shown before confirming a cyberware extraction. */
export function uninstallWarning(item: EnhancementItem): string {
  const trauma = item.neuralCost * UNINSTALL_TRAUMA_PER_LOAD;
  return `Extraction destroys the ${item.name} and deals ${trauma} HP of trauma.`;
}

export function characterNameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Enter a name";
  if (trimmed.length > 24) return "Names cap at 24 characters";
  return null;
}

export function slotDisplayName(slot: SaveSlot): string {
  switch (slot) {
    case "slot1":
      return "Slot 1";
    case "slot2":
      return "Slot 2";
    case "slot3":
      return "Slot 3";
    case "autosave":
      return "Autosave";
  }
}

export function saveErrorMessage(error: SaveError): string {
  switch (error.code) {
    case "missing":
      return "That slot is empty.";
    case "corrupt":
      return "That save is corrupted and cannot be loaded.";
    case "version-mismatch":
      return "That save comes from an incompatible game version.";
  }
}

/** Local time as "YYYY-MM-DD HH:MM". */
export function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
