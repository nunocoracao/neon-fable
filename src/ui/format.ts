import {
  STAT_MAX,
  STAT_MIN,
  type PointBuyError,
  type StatKey,
} from "../character/stats";
import { NAME_MAX_LENGTH } from "../character/wizard";
import { STAT_KEYS } from "../character/stats";
import { getAbility, type Ability } from "../data/abilities";
import { getItem } from "../data/items";
import { UNINSTALL_TRAUMA_PER_LOAD } from "../inventory/equipment";
import type {
  EnhancementItem,
  EnhancementSlot,
  Item,
} from "../inventory/items";
import type { CombatEvent } from "../combat/types";
import type { InteractableSpriteId, MapInteraction } from "../iso";
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
    case "credits":
      return `[${requirement.value} cr]`;
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
  if (trimmed.length > NAME_MAX_LENGTH) {
    return `Names cap at ${NAME_MAX_LENGTH} characters`;
  }
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

/** Advancement points with their unit, e.g. "1 point", "3 points". */
/**
 * The label on a way out of the map: what it is, then where it goes —
 * "Chainwell Stair → Cinder Row Plaza". A destination the shell cannot
 * resolve is dropped rather than shown as a raw id.
 */
export function exitLabel(label: string, destination?: string): string {
  return destination ? `${label} → ${destination}` : label;
}

/** The key the bottom-screen prompt tells the player to press. */
export const INTERACT_KEY_LABEL = "Enter";

/**
 * How a prompt says what pressing the key would do, keyed by what the
 * thing is. Kept beside the other UI copy rather than in map data: the
 * maps declare what a thing *is*, this decides how to say it.
 */
const INTERACT_VERBS: Readonly<Record<InteractableSpriteId, string>> = {
  npc: "talk to",
  door: "open",
  terminal: "use",
  stash: "search",
  exit: "take",
};

/** The verb for an interactable; anything that starts a fight is a fight. */
export function interactVerb(
  spriteId: InteractableSpriteId,
  kind: MapInteraction["kind"],
): string {
  if (kind === "combat") return "fight";
  return INTERACT_VERBS[spriteId];
}

/**
 * The short name inside a label. Map labels name a person and where
 * they are ("Vesper — Chrome Chapel"); a prompt only has room for the
 * first half, while the floating chip keeps the whole thing.
 */
export function interactName(label: string): string {
  const name = label.split(" — ")[0]?.trim() ?? "";
  return name.length > 0 ? name : label;
}

/** What the shell knows about the interactable currently in focus. */
export interface InteractPromptInput {
  label: string;
  spriteId: InteractableSpriteId;
  kind: MapInteraction["kind"];
  /** Whether it can be triggered from where the player stands. */
  inRange: boolean;
  /** Resolved destination name, on interactables that lead off the map. */
  destination?: string;
}

/**
 * The bottom-screen line for whatever is in focus: an offer to act on
 * it once in reach ("Enter — talk to Vesper"), and until then just
 * where a way out would lead. Pointing at something out of reach that
 * goes nowhere says nothing — the floating chip already names it.
 */
export function interactPrompt(hint: InteractPromptInput): string | null {
  const destination = hint.destination ? ` → ${hint.destination}` : "";
  if (!hint.inRange) {
    return hint.destination ? `${hint.label}${destination}` : null;
  }
  const verb = interactVerb(hint.spriteId, hint.kind);
  return `${INTERACT_KEY_LABEL} — ${verb} ${interactName(hint.label)}${destination}`;
}

export function pointsLabel(amount: number): string {
  return `${amount} ${amount === 1 ? "point" : "points"}`;
}

/** A chance in [0, 1] as a whole percentage, e.g. "65%". */
export function percentLabel(chance: number): string {
  return `${Math.round(chance * 100)}%`;
}

/** Resolves a combatant id to its display name. */
export type CombatantNameLookup = (combatantId: string) => string;

/**
 * Display names keyed by combatant id, numbering duplicates ("Rustyard
 * Bruiser 1", "Rustyard Bruiser 2") so target lists and the log stay
 * unambiguous.
 */
export function combatantDisplayNames(
  combatants: ReadonlyArray<{ id: string; name: string }>,
): Record<string, string> {
  const totals = new Map<string, number>();
  for (const { name } of combatants) {
    totals.set(name, (totals.get(name) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const names: Record<string, string> = {};
  for (const { id, name } of combatants) {
    if ((totals.get(name) ?? 0) > 1) {
      const index = (seen.get(name) ?? 0) + 1;
      seen.set(name, index);
      names[id] = `${name} ${index}`;
    } else {
      names[id] = name;
    }
  }
  return names;
}

/**
 * One combat-log line for an engine event, or null for events the log
 * does not show (turn markers and moves are conveyed by the scene and
 * initiative strip instead).
 */
export function combatEventText(
  event: CombatEvent,
  nameOf: CombatantNameLookup,
  lookupItem: ItemLookup = getItem,
  lookupAbility: AbilityLookup = getAbility,
): string | null {
  switch (event.type) {
    case "combat-started":
      return "Hostiles engaged.";
    case "round-started":
      return `— Round ${event.round} —`;
    case "turn-started":
    case "moved":
      return null;
    case "stun-skipped":
      return `${nameOf(event.combatantId)} is stunned and loses the turn.`;
    case "attacked":
      return event.hit
        ? `${nameOf(event.attackerId)} hits ${nameOf(event.targetId)} for ` +
            `${event.damage} damage.`
        : `${nameOf(event.attackerId)} misses ${nameOf(event.targetId)}.`;
    case "ability-used": {
      const ability =
        lookupAbility(event.abilityId)?.name ?? event.abilityId;
      if (event.combatantId === event.targetId) {
        return `${nameOf(event.combatantId)} uses ${ability}.`;
      }
      const stun = event.stunTurns > 0 ? ", stunning them" : "";
      return (
        `${nameOf(event.combatantId)} hits ${nameOf(event.targetId)} with ` +
        `${ability} for ${event.damage} damage${stun}.`
      );
    }
    case "item-used": {
      const item = lookupItem(event.itemId)?.name ?? event.itemId;
      return `${nameOf(event.combatantId)} uses a ${item}.`;
    }
    case "healed":
      return `${nameOf(event.combatantId)} recovers ${event.amount} HP.`;
    case "boosted":
      return (
        `${nameOf(event.combatantId)} gains ${signedNumber(event.amount)} ` +
        `${statLabel(event.stat)} for ${event.turns} turns.`
      );
    case "flee-attempted":
      return event.success
        ? `${nameOf(event.combatantId)} breaks away from the fight!`
        : `${nameOf(event.combatantId)} tries to flee but finds no opening.`;
    case "defeated":
      return `${nameOf(event.combatantId)} goes down.`;
    case "combat-ended":
      switch (event.result) {
        case "victory":
          return "All hostiles are down.";
        case "defeat":
          return "You collapse. The fight is over.";
        case "fled":
          return "You are clear of the fight.";
      }
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
