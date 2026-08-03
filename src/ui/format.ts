import {
  STAT_MAX,
  STAT_MIN,
  type PointBuyError,
  type StatKey,
} from "../character/stats";
import { injuryDef, type CarriedInjury } from "../character/injury";
import { NAME_MAX_LENGTH } from "../character/wizard";
import { STAT_KEYS } from "../character/stats";
import { getAbility, type Ability } from "../data/abilities";
import { getCompanion } from "../data/companions";
import { getFaction } from "../data/factions";
import { getInjury } from "../data/injuries";
import { getItem } from "../data/items";
import { staticBand, type StaticBand } from "../data/static";
import { UNINSTALL_TRAUMA_PER_LOAD } from "../inventory/equipment";
import { bearsEffects } from "../inventory/items";
import type { ConsumableOutcome } from "../inventory/consumables";
import type {
  ConsumableContext,
  ConsumableItem,
  ConsumableKind,
  EnhancementItem,
  EnhancementSlot,
  Item,
  ModEffect,
  ModSocketKind,
  OutfitDye,
  TimedEffect,
} from "../inventory/items";
import type { StaticReading, StaticShift } from "../inventory/staticLoad";
import type { MaterialName } from "../iso/art/palette";
import type { CombatEvent } from "../combat/types";
import type { InteractableSpriteId, MapInteraction } from "../iso";
import type { LoyaltyChange } from "../narrative/loyalty";
import { bandCrossings, type StandingChange } from "../narrative/standing";
import type { Requirement } from "../narrative/types";
import { bandFor, thresholdValue } from "../state/reputation";
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

/** A companion's display name, falling back to their id off content. */
export function companionName(companionId: string): string {
  return getCompanion(companionId)?.name ?? companionId;
}

/**
 * Where a companion stands, as a word. The player never sees the
 * number — a relationship is not a bar — but the bands are the ones
 * content gates on, so "Loyal" is exactly the point at which somebody
 * has something of their own to say, and "Sworn to you" the point at
 * which they raise the quieter hour after it (see the personalScene and
 * bondScene thresholds in src/data/companions.ts).
 */
export function loyaltyLabel(loyalty: number): string {
  if (loyalty >= 7) return "Sworn to you";
  if (loyalty >= 4) return "Loyal";
  if (loyalty >= 2) return "Warm";
  if (loyalty >= 0) return "Professional";
  if (loyalty >= -3) return "Wary";
  if (loyalty >= -6) return "Cold";
  return "Done with you";
}

/** What a choice just cost — or earned — with the people who saw it. */
export function loyaltyNote(changes: readonly LoyaltyChange[]): string {
  return changes
    .map(
      ({ companionId, delta }) =>
        `${companionName(companionId)} ${delta > 0 ? "approves" : "disapproves"}`,
    )
    .join(" · ");
}

/** A faction's display name, falling back to its id off content. */
export function factionName(factionId: string): string {
  return getFaction(factionId)?.name ?? factionId;
}

/**
 * What a choice just moved with the city. Only band crossings are said
 * out loud — the number behind them is bookkeeping, and a swing too
 * small to change what a faction calls you is not news.
 */
export function standingNote(changes: readonly StandingChange[]): string {
  return bandCrossings(changes)
    .map(
      (change) =>
        `${factionName(change.factionId)}: ${bandFor(change.to).label}`,
    )
    .join(" · ");
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
    case "static":
      // Named in the same word the character screen shows, so a locked
      // door can be read straight off your own Static meter.
      return requirement.mode === "at-most"
        ? `[Static: ${staticBandLabel(requirement.band)} at most]`
        : `[Static: ${staticBandLabel(requirement.band)}+]`;
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
    case "flag-not-equals":
      return `[${requirement.key}: not ${String(requirement.value)}]`;
    case "flag-at-least":
      return `[${requirement.key} ${requirement.value}+]`;
    case "flag-set":
      return `[${requirement.key}: settled]`;
    case "flag-unset":
      return `[${requirement.key}: unsettled]`;
    case "credits":
      return `[${requirement.value} cr]`;
    case "companion":
      return requirement.status === "recruited"
        ? `[Knows: ${companionName(requirement.companionId)}]`
        : `[With: ${companionName(requirement.companionId)}]`;
    case "loyalty":
      // Where somebody stands is their business: the label names the
      // person and the direction, never the number behind the curtain.
      return requirement.mode === "at-most"
        ? `[${companionName(requirement.companionId)} has had enough]`
        : `[${companionName(requirement.companionId)} trusts you]`;
    case "injury": {
      // Named, when the gate names one, in the same word the character
      // screen uses — a greyed clinic line has to say which wound it is
      // about, or it reads as the counter refusing to look at you.
      const who =
        requirement.companionId == null
          ? ""
          : `${companionName(requirement.companionId)} `;
      const what =
        requirement.injuryId == null
          ? "hurt"
          : (getInjury(requirement.injuryId)?.name ?? requirement.injuryId);
      return `[${who}${what}]`;
    }
    case "reputation": {
      // Named in the same word the character screen shows, so a player
      // can read a locked door against their own standing.
      const band = bandFor(thresholdValue(requirement.value));
      return requirement.mode === "at-most"
        ? `[${factionName(requirement.factionId)}: ${band.label} at best]`
        : `[${factionName(requirement.factionId)}: ${band.label}+]`;
    }
    case "dominant-faction":
      // A comparison, not a threshold: the label says whose city it
      // reads as, because that is the sentence the player can check
      // against the three rows on their own character screen.
      return requirement.factionId === "none"
        ? "[No power stands above the others]"
        : `[${factionName(requirement.factionId)}: your strongest tie]`;
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
      return (
        `${consumableKindLabel(item.consumableKind)} · ` +
        `${consumableEffectText(item)} · ${contextLabel(item.contexts)}`
      );
    case "enhancement":
      // Both costs on one line, and the dampener says which way it
      // pulls: a shelf label that only quoted neural load would price
      // half the decision.
      return (
        `Cyberware · ${slotLabel(item.slot)} · ${item.neuralCost} neural ` +
        `load · ${signedNumber(item.staticLoad)} Static`
      );
    case "mod":
      return `Weapon mod · ${socketLabel(item.socket)} socket`;
    case "dye":
      return `Outfit dye · ${dyeChannelSummary(item.colors)}`;
    case "misc":
      return "Item";
  }
}

/** "Stim", "Street food", "Field kit" — the word for it on a shelf. */
export function consumableKindLabel(kind: ConsumableKind): string {
  switch (kind) {
    case "stim":
      return "Stim";
    case "food":
      return "Street food";
    case "kit":
      return "Field kit";
    case "oddity":
      return "Oddity";
  }
}

/** "in a fight", "out of combat", "either side of a fight". */
export function contextLabel(
  contexts: readonly ConsumableContext[],
): string {
  const inFight = contexts.includes("combat");
  const outside = contexts.includes("exploration");
  if (inFight && outside) return "either side of a fight";
  if (inFight) return "in a fight";
  if (outside) return "out of combat";
  return "nowhere";
}

/** "+2 Reflexes for 3 turns, then −1 for 2" — one timed effect, in full. */
export function timedEffectText(effect: TimedEffect): string {
  const lift =
    `${signedNumber(effect.amount)} ${statLabel(effect.stat)} for ` +
    `${effect.turns} turn${effect.turns === 1 ? "" : "s"}`;
  if (!effect.after) return lift;
  // The crash is never hidden behind the lift: an after-cost the label
  // did not name would be a price the player only learns by paying it.
  return (
    `${lift}, then ${signedNumber(effect.after.amount)} ` +
    `${statLabel(effect.after.stat)} for ${effect.after.turns}`
  );
}

/**
 * What an item's dose does, read off the item's authored effects — the
 * shelf label, before any particular body is involved. What it is worth
 * to somebody in particular is consumableOutcomeText below.
 */
export function consumableEffectText(item: ConsumableItem): string {
  const parts = item.effects.map((effect) => {
    switch (effect.type) {
      case "heal":
        return `heals ${effect.amount} HP`;
      case "boost":
        return timedEffectText(effect.boost);
      case "ready-boost":
        return `next fight: ${timedEffectText(effect.boost)}`;
      case "treat-injury":
        return "closes an injury";
      case "settle":
        return "settles the chrome, clears the crash";
    }
  });
  return parts.length > 0 ? parts.join(" · ") : "does nothing";
}

/**
 * What a dose would do to *this* body, off the shared derivation the
 * fight and the inventory screen both read (see consumableOutcome). The
 * figures are the ones about to be applied — healing capped by the room
 * left, an injury named only when there is one to close.
 */
export function consumableOutcomeText(outcome: ConsumableOutcome): string {
  const parts: string[] = [];
  if (outcome.heal > 0) parts.push(`+${outcome.heal} HP`);
  for (const boost of outcome.boosts) parts.push(timedEffectText(boost));
  for (const boost of outcome.readied) {
    parts.push(`next fight: ${timedEffectText(boost)}`);
  }
  if (outcome.treatsInjury) parts.push("closes the injury");
  if (outcome.settles) parts.push("settles the chrome");
  return parts.length > 0 ? parts.join(" · ") : "no effect right now";
}

/**
 * A material ramp in the words a person would use for a color. The
 * palette names the pigment ("hazardAmber"); a shop label names what it
 * looks like on a coat.
 */
export function materialLabel(material: MaterialName): string {
  switch (material) {
    case "concrete":
      return "grey";
    case "brushedChrome":
      return "chrome";
    case "glass":
      return "pale";
    case "darkFabric":
      return "black";
    case "hazardAmber":
      return "amber";
    case "hologramBlue":
      return "blue";
    case "neonCyan":
      return "cyan";
  }
}

/** "black cloth · amber trim" — the channels a tin actually repaints. */
export function dyeChannelSummary(colors: OutfitDye): string {
  const parts: string[] = [];
  if (colors.primary) parts.push(`${materialLabel(colors.primary)} cloth`);
  if (colors.accent) parts.push(`${materialLabel(colors.accent)} trim`);
  return parts.length > 0 ? parts.join(" · ") : "no color";
}

/** "Barrel", "Core", "Grip" — a mod socket, for a bench row's heading. */
export function socketLabel(socket: ModSocketKind): string {
  switch (socket) {
    case "barrel":
      return "Barrel";
    case "core":
      return "Core";
    case "grip":
      return "Grip";
  }
}

/** "1 barrel, 1 core" — the sockets a weapon offers, or "no sockets". */
export function socketSummary(sockets: readonly ModSocketKind[]): string {
  if (sockets.length === 0) return "No mod sockets";
  return sockets.map(socketLabel).join(" · ");
}

/**
 * Per-effect labels for gear ("+1 Reflexes", "Grants Stun Strike", …).
 * A weapon mod's list is wider than a coat's — it also says what it
 * does to the weapon itself — and both halves read the same way.
 */
export function itemEffectLabels(
  item: Item,
  lookupAbility: AbilityLookup = getAbility,
): string[] {
  if (!bearsEffects(item)) return [];
  return item.effects.map((effect) => modEffectLabel(effect, lookupAbility));
}

/** One effect, as a chip: gear vocabulary and the weapon-shaping half. */
export function modEffectLabel(
  effect: ModEffect,
  lookupAbility: AbilityLookup = getAbility,
): string {
  switch (effect.type) {
    case "stat-mod":
      return `${signedNumber(effect.amount)} ${statLabel(effect.stat)}`;
    case "grant-ability":
      return `Grants ${lookupAbility(effect.abilityId)?.name ?? effect.abilityId}`;
    case "unlock-dialogue":
      return `Unlocks "${effect.tag}" dialogue`;
    case "weapon-damage":
      return `${signedNumber(effect.amount)} damage`;
    case "armor-pierce":
      return `${signedNumber(effect.amount)} armor pierce`;
    case "accuracy":
      return `${signedNumber(effect.amount)} accuracy`;
    case "weapon-range":
      return `${signedNumber(effect.amount)} range`;
    case "crit-share":
      return effect.amount < 0 ? "Crits land sooner" : "Crits land later";
  }
}

/* --- Static ---------------------------------------------------------- */

/** A band in the one word the whole game calls it by. */
export function staticBandLabel(band: StaticBand): string {
  return staticBand(band).label;
}

/** "Static 6 — Loud": the meter's own caption. */
export function staticLine(reading: StaticReading): string {
  return `Static ${reading.level} — ${reading.def.label}`;
}

/**
 * What the current band is costing, in the concrete terms a player can
 * check against a locked door. Empty for the two quiet bands, which is
 * the honest answer: they cost nothing.
 */
export function staticEffectNotes(reading: StaticReading): string[] {
  const { coolPenalty, initiativePenalty, chromeAffinity, surge } =
    reading.def.effects;
  const notes: string[] = [];
  if (coolPenalty > 0) {
    notes.push(`${signedNumber(-coolPenalty)} Cool in conversation`);
  }
  if (chromeAffinity) notes.push("Opens chrome-affinity talk");
  if (initiativePenalty > 0) {
    notes.push(`${signedNumber(-initiativePenalty)} initiative`);
  }
  if (surge) notes.push("Static surge, once a fight");
  return notes;
}

/**
 * What an install would do to the noise, said before anybody commits:
 * the projected level always, and the band it lands in when the move
 * crosses one — "+4 Static → Loud". A dampener reads the same way with
 * the sign the other way round, which is the whole pitch for one.
 */
export function staticProjection(shift: StaticShift): string {
  const move =
    shift.delta === 0
      ? "No change to Static"
      : `${signedNumber(shift.delta)} Static → ${shift.to.level}`;
  return shift.bandChanges ? `${move} · ${shift.to.def.label}` : move;
}

/* --- Injuries ---------------------------------------------------------
 *
 * A debuff nobody can read is a bug the player experiences as bad luck,
 * so every place a wound shows — the character screen, the initiative
 * rail, the panel it was earned on — says the same three things in the
 * same words: what it is, what it costs, and when it stops.
 */

/** What a carried injury is called; null when there is nothing wrong. */
export function injuryName(carried: CarriedInjury | null | undefined): string | null {
  return injuryDef(carried)?.name ?? null;
}

/** What it is costing, in the player's own terms; null when unhurt. */
export function injuryEffectText(
  carried: CarriedInjury | null | undefined,
): string | null {
  return injuryDef(carried)?.effect ?? null;
}

/**
 * When it stops. Counted in moves across the city because that is
 * exactly what the recovery clock counts (see src/state/injuries.ts) —
 * quoting anything else would be quoting a number the game does not
 * actually keep.
 */
export function injuryRecoveryNote(
  carried: CarriedInjury | null | undefined,
): string | null {
  if (!injuryDef(carried) || !carried) return null;
  return carried.scenesLeft === 1
    ? "Closes after your next move across the city."
    : `Closes after ${carried.scenesLeft} more moves across the city.`;
}

/** The whole wound on one line, for a chip title or a log. */
export function injuryLine(
  carried: CarriedInjury | null | undefined,
): string | null {
  const name = injuryName(carried);
  if (name === null) return null;
  return `${name} — ${injuryEffectText(carried)}`;
}

/** What a clinic charges to close it now; null when there is nothing to pay for. */
export function injuryFeeLabel(
  carried: CarriedInjury | null | undefined,
): string | null {
  const def = injuryDef(carried);
  return def ? `${def.treatCost} cr` : null;
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
    case "recovery":
      return "Recovered run";
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
    case "checksum":
      return "That save failed its integrity check — something changed it after it was written.";
    case "migration-failed":
      return "That save could not be brought up to date for this version of the game.";
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
  shard: "pick up",
  exit: "take",
};

/**
 * The verb for an interactable. What it *does* wins over what it is:
 * anything that starts a fight is a fight, and a terminal holding a
 * lattice is not something you "use".
 */
export function interactVerb(
  spriteId: InteractableSpriteId,
  kind: MapInteraction["kind"],
): string {
  if (kind === "combat") return "fight";
  if (kind === "breach") return "breach";
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

/** A shard's slot number in the codex, zero-padded: 1 reads as "01". */
export function shardNumber(index: number): string {
  return String(index).padStart(2, "0");
}

/** What a locked codex slot says: the district, and nothing else. */
export function shardLockedHint(district: string): string {
  return `Recovered somewhere in ${district}.`;
}

/**
 * The line that goes up when a chip is picked up. Names what was found
 * and where it went, counts the set, and marks the twelfth — which is
 * the only moment the codex has anything extra to show.
 */
export function shardPickupToast(
  title: string,
  found: number,
  total: number,
): string {
  const tally = `${found}/${total}`;
  return found >= total
    ? `Memory shard recovered — "${title}" (${tally}). The Grey Choir is whole; read it in the codex.`
    : `Memory shard recovered — "${title}" (${tally}). Filed in the codex.`;
}

export function pointsLabel(amount: number): string {
  return `${amount} ${amount === 1 ? "point" : "points"}`;
}

/**
 * A step budget, said the way a person would. The move prompt counts
 * down to one and then to zero, and "1 steps left" on the last tile of
 * every move is the sort of thing a first-time player notices and a
 * hundredth-time player has stopped seeing.
 */
export function stepsLabel(amount: number): string {
  return `${amount} ${amount === 1 ? "step" : "steps"}`;
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
    case "charge-started": {
      const ability = lookupAbility(event.abilityId)?.name ?? event.abilityId;
      // Names the ground, not the target: what the player has to act on
      // is the marked lane, and it does not follow anybody.
      return (
        `${nameOf(event.combatantId)} winds up ${ability} — the marked ` +
        `ground is hit on its next turn.`
      );
    }
    case "charge-released": {
      const ability = lookupAbility(event.abilityId)?.name ?? event.abilityId;
      // A charge that catches nobody is the whole reward for reading it,
      // so the log says so out loud rather than falling silent.
      return event.bodies === 0
        ? `${nameOf(event.combatantId)} looses ${ability} into empty ground.`
        : `${nameOf(event.combatantId)} looses ${ability}.`;
    }
    case "static-armed":
      // The warning has to name the answer, or it is not a telegraph:
      // one turn, hands down, and the noise goes nowhere.
      return (
        `${nameOf(event.combatantId)}'s chrome is howling — hold the ` +
        `next turn's action to bleed it off, or lose the turn after it.`
      );
    case "static-vented":
      return `${nameOf(event.combatantId)} rides the static out. It settles.`;
    case "static-surge":
      return (
        `Static surges through ${nameOf(event.combatantId)} — every ` +
        `implant firing at once.`
      );
    case "item-used": {
      const item = lookupItem(event.itemId)?.name ?? event.itemId;
      return `${nameOf(event.combatantId)} uses a ${item}.`;
    }
    case "healed":
      return `${nameOf(event.combatantId)} recovers ${event.amount} HP.`;
    case "second-wind":
      // Named out loud: a perk that fires once a fight has to be seen
      // firing, or the player learns nothing from having taken it.
      return (
        `${nameOf(event.combatantId)} goes down and does not stay down — ` +
        `second wind, ${event.amount} HP.`
      );
    case "boosted":
      return (
        `${nameOf(event.combatantId)} gains ${signedNumber(event.amount)} ` +
        `${statLabel(event.stat)} for ${event.turns} turns.`
      );
    case "crashed":
      // The bill, named as the bill: a stim that only ever showed its
      // lift would read as a free action several turns later.
      return (
        `The stim leaves ${nameOf(event.combatantId)} — ` +
        `${signedNumber(event.amount)} ${statLabel(event.stat)} for ` +
        `${event.turns} turns.`
      );
    case "settled":
      return `${nameOf(event.combatantId)} settles. The chrome goes quiet.`;
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
