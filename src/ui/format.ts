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
import { plain, t, type PlainKey } from "./strings";

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
  if (loyalty >= 7) return t("loyalty.sworn");
  if (loyalty >= 4) return t("loyalty.loyal");
  if (loyalty >= 2) return t("loyalty.warm");
  if (loyalty >= 0) return t("loyalty.professional");
  if (loyalty >= -3) return t("loyalty.wary");
  if (loyalty >= -6) return t("loyalty.cold");
  return t("loyalty.done");
}

/** What a choice just cost — or earned — with the people who saw it. */
export function loyaltyNote(changes: readonly LoyaltyChange[]): string {
  return changes
    .map(
      ({ companionId, delta }) =>
        delta > 0
          ? t("loyalty.approves", { name: companionName(companionId) })
          : t("loyalty.disapproves", { name: companionName(companionId) }),
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
        t("standing.note", {
          faction: factionName(change.factionId),
          band: bandFor(change.to).label,
        }),
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
      return t("req.stat", {
        stat: statLabel(requirement.stat),
        value: requirement.value,
      });
    case "background":
      return t("req.background", { tag: requirement.tag });
    case "static":
      // Named in the same word the character screen shows, so a locked
      // door can be read straight off your own Static meter.
      return requirement.mode === "at-most"
        ? t("req.static.atMost", { band: staticBandLabel(requirement.band) })
        : t("req.static.atLeast", { band: staticBandLabel(requirement.band) });
    case "item": {
      const name = lookupItem(requirement.itemId)?.name ?? requirement.itemId;
      const quantity = requirement.quantity ?? 1;
      return quantity > 1
        ? t("req.item.many", { quantity, name })
        : t("req.item", { name });
    }
    case "enhancement": {
      const name = lookupItem(requirement.itemId)?.name ?? requirement.itemId;
      return t("req.enhancement", { name });
    }
    case "flag-equals":
      return t("req.flag.equals", {
        key: requirement.key,
        value: String(requirement.value),
      });
    case "flag-not-equals":
      return t("req.flag.notEquals", {
        key: requirement.key,
        value: String(requirement.value),
      });
    case "flag-at-least":
      return t("req.flag.atLeast", {
        key: requirement.key,
        value: requirement.value,
      });
    case "flag-set":
      return t("req.flag.set", { key: requirement.key });
    case "flag-unset":
      return t("req.flag.unset", { key: requirement.key });
    case "credits":
      return t("req.credits", { value: requirement.value });
    case "companion":
      return requirement.status === "recruited"
        ? t("req.companion.knows", {
            name: companionName(requirement.companionId),
          })
        : t("req.companion.with", {
            name: companionName(requirement.companionId),
          });
    case "loyalty":
      // Where somebody stands is their business: the label names the
      // person and the direction, never the number behind the curtain.
      return requirement.mode === "at-most"
        ? t("req.loyalty.low", { name: companionName(requirement.companionId) })
        : t("req.loyalty.high", {
            name: companionName(requirement.companionId),
          });
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
          ? t("req.injury.any")
          : (getInjury(requirement.injuryId)?.name ?? requirement.injuryId);
      return t("req.injury", { who, what });
    }
    case "reputation": {
      // Named in the same word the character screen shows, so a player
      // can read a locked door against their own standing.
      const band = bandFor(thresholdValue(requirement.value));
      return requirement.mode === "at-most"
        ? t("req.reputation.atMost", {
            faction: factionName(requirement.factionId),
            band: band.label,
          })
        : t("req.reputation.atLeast", {
            faction: factionName(requirement.factionId),
            band: band.label,
          });
    }
    case "dominant-faction":
      // A comparison, not a threshold: the label says whose city it
      // reads as, because that is the sentence the player can check
      // against the three rows on their own character screen.
      return requirement.factionId === "none"
        ? t("req.dominant.none")
        : t("req.dominant", {
            faction: factionName(requirement.factionId),
          });
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
        ? t("pointBuy.range.stat", {
            stat: statLabel(error.stat),
            min: STAT_MIN,
            max: STAT_MAX,
          })
        : t("pointBuy.range", { min: STAT_MIN, max: STAT_MAX });
    case "overspent":
      return t("pointBuy.overspent");
    case "underspent":
      return t("pointBuy.underspent");
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
      const range =
        item.rangeType === "melee" ? t("item.melee") : t("item.ranged");
      const requirement = item.requirement
        ? t("item.weapon.needs", {
            stat: statLabel(item.requirement.stat),
            value: item.requirement.value,
          })
        : "";
      return t("item.weapon", {
        range,
        damage: item.damage,
        requirement,
      });
    }
    case "outfit":
      return t("item.outfit", { armor: item.armor });
    case "consumable":
      return t("item.consumable", {
        kind: consumableKindLabel(item.consumableKind),
        effect: consumableEffectText(item),
        context: contextLabel(item.contexts),
      });
    case "enhancement":
      // Both costs on one line, and the dampener says which way it
      // pulls: a shelf label that only quoted neural load would price
      // half the decision.
      return t("item.enhancement", {
        slot: slotLabel(item.slot),
        load: item.neuralCost,
        static: signedNumber(item.staticLoad),
      });
    case "mod":
      return t("item.mod", { socket: socketLabel(item.socket) });
    case "dye":
      return t("item.dye", { colors: dyeChannelSummary(item.colors) });
    case "misc":
      return t("item.misc");
  }
}

/** "Stim", "Street food", "Field kit" — the word for it on a shelf. */
export function consumableKindLabel(kind: ConsumableKind): string {
  switch (kind) {
    case "stim":
      return t("item.kind.stim");
    case "food":
      return t("item.kind.food");
    case "kit":
      return t("item.kind.kit");
    case "oddity":
      return t("item.kind.oddity");
  }
}

/** "in a fight", "out of combat", "either side of a fight". */
export function contextLabel(
  contexts: readonly ConsumableContext[],
): string {
  const inFight = contexts.includes("combat");
  const outside = contexts.includes("exploration");
  if (inFight && outside) return t("item.context.either");
  if (inFight) return t("item.context.combat");
  if (outside) return t("item.context.exploration");
  return t("item.context.none");
}

/** "+2 Reflexes for 3 turns, then −1 for 2" — one timed effect, in full. */
export function timedEffectText(effect: TimedEffect): string {
  const lift = t("effect.timed", {
    amount: signedNumber(effect.amount),
    stat: statLabel(effect.stat),
    turns: turnsLabel(effect.turns),
  });
  if (!effect.after) return lift;
  // The crash is never hidden behind the lift: an after-cost the label
  // did not name would be a price the player only learns by paying it.
  return t("effect.timed.after", {
    lift,
    amount: signedNumber(effect.after.amount),
    stat: statLabel(effect.after.stat),
    turns: effect.after.turns,
  });
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
        return t("effect.heal", { amount: effect.amount });
      case "boost":
        return timedEffectText(effect.boost);
      case "ready-boost":
        return t("effect.readied", { effect: timedEffectText(effect.boost) });
      case "treat-injury":
        return t("effect.treatInjury");
      case "settle":
        return t("effect.settle");
    }
  });
  return parts.length > 0 ? parts.join(" · ") : t("effect.none");
}

/**
 * What a dose would do to *this* body, off the shared derivation the
 * fight and the inventory screen both read (see consumableOutcome). The
 * figures are the ones about to be applied — healing capped by the room
 * left, an injury named only when there is one to close.
 */
export function consumableOutcomeText(outcome: ConsumableOutcome): string {
  const parts: string[] = [];
  if (outcome.heal > 0) parts.push(t("outcome.heal", { amount: outcome.heal }));
  for (const boost of outcome.boosts) parts.push(timedEffectText(boost));
  for (const boost of outcome.readied) {
    parts.push(t("effect.readied", { effect: timedEffectText(boost) }));
  }
  if (outcome.treatsInjury) parts.push(t("outcome.treatsInjury"));
  if (outcome.settles) parts.push(t("outcome.settles"));
  return parts.length > 0 ? parts.join(" · ") : t("outcome.none");
}

/**
 * A material ramp in the words a person would use for a color. The
 * palette names the pigment ("hazardAmber"); a shop label names what it
 * looks like on a coat.
 */
export function materialLabel(material: MaterialName): string {
  switch (material) {
    case "concrete":
      return t("material.concrete");
    case "brushedChrome":
      return t("material.chrome");
    case "glass":
      return t("material.glass");
    case "darkFabric":
      return t("material.dark");
    case "hazardAmber":
      return t("material.amber");
    case "hologramBlue":
      return t("material.blue");
    case "neonCyan":
      return t("material.cyan");
  }
}

/** "black cloth · amber trim" — the channels a tin actually repaints. */
export function dyeChannelSummary(colors: OutfitDye): string {
  const parts: string[] = [];
  if (colors.primary) {
    parts.push(t("dye.cloth", { color: materialLabel(colors.primary) }));
  }
  if (colors.accent) {
    parts.push(t("dye.trim", { color: materialLabel(colors.accent) }));
  }
  return parts.length > 0 ? parts.join(" · ") : t("dye.none");
}

/** "Barrel", "Core", "Grip" — a mod socket, for a bench row's heading. */
export function socketLabel(socket: ModSocketKind): string {
  switch (socket) {
    case "barrel":
      return t("socket.barrel");
    case "core":
      return t("socket.core");
    case "grip":
      return t("socket.grip");
  }
}

/** "1 barrel, 1 core" — the sockets a weapon offers, or "no sockets". */
export function socketSummary(sockets: readonly ModSocketKind[]): string {
  if (sockets.length === 0) return t("socket.none");
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
      return t("mod.stat", {
        amount: signedNumber(effect.amount),
        stat: statLabel(effect.stat),
      });
    case "grant-ability":
      return t("mod.grantAbility", {
        ability: lookupAbility(effect.abilityId)?.name ?? effect.abilityId,
      });
    case "unlock-dialogue":
      return t("mod.unlockDialogue", { tag: effect.tag });
    case "weapon-damage":
      return t("mod.damage", { amount: signedNumber(effect.amount) });
    case "armor-pierce":
      return t("mod.pierce", { amount: signedNumber(effect.amount) });
    case "accuracy":
      return t("mod.accuracy", { amount: signedNumber(effect.amount) });
    case "weapon-range":
      return t("mod.range", { amount: signedNumber(effect.amount) });
    case "crit-share":
      return effect.amount < 0 ? t("mod.crit.sooner") : t("mod.crit.later");
  }
}

/* --- Static ---------------------------------------------------------- */

/** A band in the one word the whole game calls it by. */
export function staticBandLabel(band: StaticBand): string {
  return staticBand(band).label;
}

/** "Static 6 — Loud": the meter's own caption. */
export function staticLine(reading: StaticReading): string {
  return t("static.line", {
    level: reading.level,
    band: reading.def.label,
  });
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
    notes.push(t("static.cool", { amount: signedNumber(-coolPenalty) }));
  }
  if (chromeAffinity) notes.push(t("static.affinity"));
  if (initiativePenalty > 0) {
    notes.push(
      t("static.initiative", { amount: signedNumber(-initiativePenalty) }),
    );
  }
  if (surge) notes.push(t("static.surge"));
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
      ? t("static.noChange")
      : t("static.shift", {
          delta: signedNumber(shift.delta),
          level: shift.to.level,
        });
  return shift.bandChanges
    ? t("static.shift.band", { move, band: shift.to.def.label })
    : move;
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
    ? t("injury.closesNext")
    : t("injury.closesIn", { scenes: carried.scenesLeft });
}

/** The whole wound on one line, for a chip title or a log. */
export function injuryLine(
  carried: CarriedInjury | null | undefined,
): string | null {
  const name = injuryName(carried);
  if (name === null) return null;
  return t("injury.line", {
    name,
    effect: injuryEffectText(carried) ?? "",
  });
}

/** What a clinic charges to close it now; null when there is nothing to pay for. */
export function injuryFeeLabel(
  carried: CarriedInjury | null | undefined,
): string | null {
  const def = injuryDef(carried);
  return def ? t("counter.credits", { credits: def.treatCost }) : null;
}

/** Trade-off warning shown before confirming a cyberware extraction. */
export function uninstallWarning(item: EnhancementItem): string {
  const trauma = item.neuralCost * UNINSTALL_TRAUMA_PER_LOAD;
  return t("inventory.extractionCost", { name: item.name, trauma });
}

export function characterNameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return t("create.name.required");
  if (trimmed.length > NAME_MAX_LENGTH) {
    return t("create.name.tooLong", { max: NAME_MAX_LENGTH });
  }
  return null;
}

export function slotDisplayName(slot: SaveSlot): string {
  switch (slot) {
    case "slot1":
      return t("save.slot.1");
    case "slot2":
      return t("save.slot.2");
    case "slot3":
      return t("save.slot.3");
    case "autosave":
      return t("save.slot.autosave");
    case "recovery":
      return t("save.slot.recovery");
  }
}

export function saveErrorMessage(error: SaveError): string {
  switch (error.code) {
    case "missing":
      return t("save.error.missing");
    case "corrupt":
      return t("save.error.corrupt");
    case "version-mismatch":
      return t("save.error.version");
    case "checksum":
      return t("save.error.checksum");
    case "migration-failed":
      return t("save.error.migration");
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
export const INTERACT_KEY_LABEL = t("interact.key");

/**
 * How a prompt says what pressing the key would do, keyed by what the
 * thing is. Kept beside the other UI copy rather than in map data: the
 * maps declare what a thing *is*, this decides how to say it.
 */
const INTERACT_VERBS: Readonly<Record<InteractableSpriteId, PlainKey>> = {
  npc: "interact.verb.talk",
  door: "interact.verb.open",
  terminal: "interact.verb.use",
  stash: "interact.verb.search",
  shard: "interact.verb.pickUp",
  exit: "interact.verb.take",
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
  if (kind === "combat") return t("interact.verb.fight");
  if (kind === "breach") return t("interact.verb.breach");
  return plain(INTERACT_VERBS[spriteId]);
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
  return t("shard.lockedHint", { district });
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
    ? t("shard.pickup.complete", { title, tally })
    : t("shard.pickup", { title, tally });
}

export function pointsLabel(amount: number): string {
  return amount === 1
    ? t("count.point.one", { amount })
    : t("count.point.many", { amount });
}

/** "1 turn", "3 turns" — how long a lift or a crash lasts. */
export function turnsLabel(amount: number): string {
  return amount === 1
    ? t("count.turn.one", { amount })
    : t("count.turn.many", { amount });
}

/**
 * A step budget, said the way a person would. The move prompt counts
 * down to one and then to zero, and "1 steps left" on the last tile of
 * every move is the sort of thing a first-time player notices and a
 * hundredth-time player has stopped seeing.
 */
export function stepsLabel(amount: number): string {
  return amount === 1
    ? t("count.step.one", { amount })
    : t("count.step.many", { amount });
}

/** How many hints a run has been shown, for the settings row. */
export function hintCountLabel(amount: number): string {
  return amount === 1
    ? t("count.hint.one", { amount })
    : t("count.hint.many", { amount });
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
      return t("log.started");
    case "round-started":
      return t("log.round", { round: event.round });
    case "turn-started":
    case "moved":
      return null;
    case "stun-skipped":
      return t("log.stunned", { name: nameOf(event.combatantId) });
    case "attacked":
      return event.hit
        ? t("log.hit", {
            attacker: nameOf(event.attackerId),
            target: nameOf(event.targetId),
            damage: event.damage,
          })
        : t("log.miss", {
            attacker: nameOf(event.attackerId),
            target: nameOf(event.targetId),
          });
    case "ability-used": {
      const ability =
        lookupAbility(event.abilityId)?.name ?? event.abilityId;
      if (event.combatantId === event.targetId) {
        return t("log.ability.self", {
          name: nameOf(event.combatantId),
          ability,
        });
      }
      const stun = event.stunTurns > 0 ? t("log.ability.stun") : "";
      return t("log.ability", {
        name: nameOf(event.combatantId),
        target: nameOf(event.targetId),
        ability,
        damage: event.damage,
        stun,
      });
    }
    case "charge-started": {
      const ability = lookupAbility(event.abilityId)?.name ?? event.abilityId;
      // Names the ground, not the target: what the player has to act on
      // is the marked lane, and it does not follow anybody.
      return t("log.charge.started", {
        name: nameOf(event.combatantId),
        ability,
      });
    }
    case "charge-released": {
      const ability = lookupAbility(event.abilityId)?.name ?? event.abilityId;
      // A charge that catches nobody is the whole reward for reading it,
      // so the log says so out loud rather than falling silent.
      return event.bodies === 0
        ? t("log.charge.empty", {
            name: nameOf(event.combatantId),
            ability,
          })
        : t("log.charge.released", {
            name: nameOf(event.combatantId),
            ability,
          });
    }
    case "static-armed":
      // The warning has to name the answer, or it is not a telegraph:
      // one turn, hands down, and the noise goes nowhere.
      return t("log.static.armed", { name: nameOf(event.combatantId) });
    case "static-vented":
      return t("log.static.vented", { name: nameOf(event.combatantId) });
    case "static-surge":
      return t("log.static.surge", { name: nameOf(event.combatantId) });
    case "item-used": {
      const item = lookupItem(event.itemId)?.name ?? event.itemId;
      return t("log.item", { name: nameOf(event.combatantId), item });
    }
    case "healed":
      return t("log.healed", {
        name: nameOf(event.combatantId),
        amount: event.amount,
      });
    case "second-wind":
      // Named out loud: a perk that fires once a fight has to be seen
      // firing, or the player learns nothing from having taken it.
      return t("log.secondWind", {
        name: nameOf(event.combatantId),
        amount: event.amount,
      });
    case "boosted":
      return t("log.boosted", {
        name: nameOf(event.combatantId),
        amount: signedNumber(event.amount),
        stat: statLabel(event.stat),
        turns: event.turns,
      });
    case "crashed":
      // The bill, named as the bill: a stim that only ever showed its
      // lift would read as a free action several turns later.
      return t("log.crashed", {
        name: nameOf(event.combatantId),
        amount: signedNumber(event.amount),
        stat: statLabel(event.stat),
        turns: event.turns,
      });
    case "settled":
      return t("log.settled", { name: nameOf(event.combatantId) });
    case "flee-attempted":
      return event.success
        ? t("log.flee.success", { name: nameOf(event.combatantId) })
        : t("log.flee.failed", { name: nameOf(event.combatantId) });
    case "defeated":
      return t("log.defeated", { name: nameOf(event.combatantId) });
    case "combat-ended":
      switch (event.result) {
        case "victory":
          return t("log.end.victory");
        case "defeat":
          return t("log.end.defeat");
        case "fled":
          return t("log.end.fled");
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
