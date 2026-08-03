import { STAT_HARD_CAP, STAT_KEYS, type StatKey } from "../../character/stats";
import { FACTION_IDS, REPUTATION_MAX, type FactionId } from "../../data/factions";
import { items } from "../../data/items";
import { storyArcs } from "../../data/story";
import type { FlagValue } from "../../state/flags";
import { thresholdValue } from "../../state/reputation";
import {
  ENHANCEMENT_SLOTS,
  MOD_SOCKET_KINDS,
  type Item,
} from "../../inventory/items";
import type { Requirement } from "../types";
import {
  availableBackgroundTags,
  contentFlagWrites,
  engineFlagWrites,
  grantableItemIds,
  recruitableCompanionIds,
  type FlagWriteSite,
  type GateSource,
} from "./content";
import { error, warning, type AuditFinding } from "./types";

/**
 * Satisfiability: can this door ever open?
 *
 * A gate nothing can satisfy is worse than a bug, because it does not
 * look like one. The branch is authored, reviewed, and shipped; it
 * simply never appears, and the only way anybody finds out is that a
 * scene quietly has one fewer option than it was written with. So the
 * checks here are all of the same shape: work out the widest state the
 * game could ever produce, and fail on any gate that asks for more.
 *
 * Deliberately generous in every direction. The stat ceiling assumes a
 * character wearing the single best-modded item in every slot at the
 * hard cap; the standing ceiling assumes every swing in the game landed
 * the same way. A gate that fails one of these is not "hard to reach" —
 * it is unreachable by construction, whatever the player does.
 */

/** The widest achievable state, as far as gates can tell. */
export interface GateWorld {
  /** Every flag write in the game, content and engine alike. */
  writes: readonly FlagWriteSite[];
  grantableItems: ReadonlySet<string>;
  recruitableCompanions: ReadonlySet<string>;
  backgroundTags: ReadonlySet<string>;
  /** Best figure a character could ever present at a gate, per stat. */
  statCeiling: Readonly<Record<StatKey, number>>;
  /** Best standing the game's own swings can add up to, per faction. */
  standingCeiling: Readonly<Record<FactionId, number>>;
}

/**
 * The best one stat is moved by any item in a pool. A consumable's
 * effects are a different vocabulary and a dye has none at all, so
 * neither can carry a mod a gate would ever read.
 */
function bestMod(pool: readonly Item[], stat: StatKey): number {
  let best = 0;
  for (const item of pool) {
    if (item.kind === "consumable" || item.kind === "dye") continue;
    if (!("effects" in item)) continue;
    for (const effect of item.effects) {
      if (effect.type === "stat-mod" && effect.stat === stat) {
        best = Math.max(best, effect.amount);
      }
    }
  }
  return best;
}

/**
 * The highest each stat could ever read at a dialogue gate: the hard cap
 * a character can be advanced to, plus the best weapon, the best outfit,
 * one of the best implants in every neural slot, and a part in every
 * socket kind a weapon could offer.
 *
 * Nobody will ever assemble that character. That is the point — the
 * bound has to be above every real build, so that anything it rejects is
 * rejected for certain.
 */
export function statCeilings(): Record<StatKey, number> {
  const weapons = items.filter((item) => item.kind === "weapon");
  const outfits = items.filter((item) => item.kind === "outfit");
  const mods = items.filter((item) => item.kind === "mod");
  const enhancements = items.filter((item) => item.kind === "enhancement");
  const ceiling = {} as Record<StatKey, number>;
  for (const stat of STAT_KEYS) {
    let best = STAT_HARD_CAP + bestMod(weapons, stat) + bestMod(outfits, stat);
    for (const slot of ENHANCEMENT_SLOTS) {
      best += bestMod(
        enhancements.filter(
          (item) => item.kind === "enhancement" && item.slot === slot,
        ),
        stat,
      );
    }
    for (const socket of MOD_SOCKET_KINDS) {
      best += bestMod(
        mods.filter((item) => item.kind === "mod" && item.socket === socket),
        stat,
      );
    }
    ceiling[stat] = best;
  }
  return ceiling;
}

/**
 * The best standing each faction could ever hold: every positive swing
 * the story authors, summed and clamped into the scale. A gate above it
 * is a door with no key cut for it.
 */
export function standingCeilings(): Record<FactionId, number> {
  const totals = {} as Record<FactionId, number>;
  for (const id of FACTION_IDS) totals[id] = 0;
  for (const arc of storyArcs) {
    for (const node of arc.nodes) {
      for (const choice of node.choices) {
        for (const id of FACTION_IDS) {
          const delta = choice.standing?.[id] ?? 0;
          if (delta > 0) totals[id] += delta;
        }
      }
    }
  }
  for (const id of FACTION_IDS) {
    totals[id] = Math.min(REPUTATION_MAX, totals[id]);
  }
  return totals;
}

/** The real game's ceilings and catalogs. */
export function defaultGateWorld(): GateWorld {
  return {
    writes: [...contentFlagWrites(), ...engineFlagWrites()],
    grantableItems: grantableItemIds(),
    recruitableCompanions: recruitableCompanionIds(),
    backgroundTags: availableBackgroundTags(),
    statCeiling: statCeilings(),
    standingCeiling: standingCeilings(),
  };
}

/** What is known about one flag key, folded over every writer of it. */
interface FlagFacts {
  values: Set<FlagValue>;
  /** True when some writer's value cannot be known statically. */
  open: boolean;
  /** Highest number any writer can leave behind; -Infinity for none. */
  maxNumeric: number;
}

export function flagFacts(
  writes: readonly FlagWriteSite[],
): Map<string, FlagFacts> {
  const facts = new Map<string, FlagFacts>();
  for (const write of writes) {
    let entry = facts.get(write.key);
    if (!entry) {
      entry = { values: new Set(), open: false, maxNumeric: -Infinity };
      facts.set(write.key, entry);
    }
    if (write.increment != null) {
      // An increment can be taken more than once on a long enough run,
      // so the figure it can reach is not knowable from the data.
      entry.open = true;
      continue;
    }
    if (write.value === undefined) {
      entry.open = true;
      continue;
    }
    entry.values.add(write.value);
    if (typeof write.value === "number") {
      entry.maxNumeric = Math.max(entry.maxNumeric, write.value);
    }
  }
  return facts;
}

function describe(source: GateSource): Partial<AuditFinding> {
  return source.where != null ? { where: source.where } : {};
}

function quote(value: FlagValue): string {
  return typeof value === "string" ? `"${value}"` : String(value);
}

/** Every satisfiability finding one requirement produces. */
function auditRequirement(
  source: GateSource,
  req: Requirement,
  world: GateWorld,
  facts: Map<string, FlagFacts>,
): AuditFinding[] {
  const at = describe(source);
  const findings: AuditFinding[] = [];

  switch (req.type) {
    case "flag-equals":
    case "flag-at-least":
    case "flag-set": {
      const known = facts.get(req.key);
      if (!known) {
        findings.push(
          error(
            "unwritten-flag",
            source.source,
            `Gates on flag "${req.key}", which nothing in the game writes`,
            { ...at, subject: req.key },
          ),
        );
        break;
      }
      if (req.type === "flag-equals" && !known.open && !known.values.has(req.value)) {
        findings.push(
          error(
            "unwritten-flag-value",
            source.source,
            `Gates on "${req.key}" = ${quote(req.value)}, a value nothing writes ` +
              `(written: ${[...known.values].map(quote).join(", ")})`,
            { ...at, subject: req.key },
          ),
        );
      }
      if (req.type === "flag-at-least" && !known.open && known.maxNumeric < req.value) {
        findings.push(
          error(
            "unreachable-flag-value",
            source.source,
            `Gates on "${req.key}" >= ${req.value}, past the highest anything ` +
              `writes (${known.maxNumeric === -Infinity ? "never numeric" : known.maxNumeric})`,
            { ...at, subject: req.key },
          ),
        );
      }
      break;
    }
    case "flag-not-equals":
    case "flag-unset": {
      if (!facts.has(req.key)) {
        findings.push(
          warning(
            "vacuous-gate",
            source.source,
            `Gates on flag "${req.key}" being unwritten, and nothing ever ` +
              "writes it: the gate is always open",
            { ...at, subject: req.key },
          ),
        );
      }
      break;
    }
    case "stat": {
      const ceiling = world.statCeiling[req.stat];
      if (req.value > ceiling) {
        findings.push(
          error(
            "unreachable-stat",
            source.source,
            `Needs ${req.stat} ${req.value}, above the best a character could ` +
              `ever present (${ceiling})`,
            { ...at, subject: req.stat },
          ),
        );
      }
      break;
    }
    case "item":
    case "enhancement": {
      if (!world.grantableItems.has(req.itemId)) {
        findings.push(
          warning(
            "ungrantable-item",
            source.source,
            `Gates on "${req.itemId}", which no beat hands out and no counter stocks`,
            { ...at, subject: req.itemId },
          ),
        );
      }
      break;
    }
    case "companion": {
      if (!world.recruitableCompanions.has(req.companionId)) {
        findings.push(
          error(
            "unrecruitable-companion",
            source.source,
            `Needs "${req.companionId}" in the party, and no beat recruits them`,
            { ...at, subject: req.companionId },
          ),
        );
      }
      break;
    }
    case "loyalty": {
      // An at-most gate on somebody never met is satisfied by their
      // standing at nothing, so only the positive side is a door.
      const positive = req.mode !== "at-most" && req.value > 0;
      if (positive && !world.recruitableCompanions.has(req.companionId)) {
        findings.push(
          error(
            "unrecruitable-companion",
            source.source,
            `Needs "${req.companionId}" at loyalty ${req.value}, and no beat recruits them`,
            { ...at, subject: req.companionId },
          ),
        );
      }
      break;
    }
    case "background": {
      if (!world.backgroundTags.has(req.tag)) {
        findings.push(
          error(
            "unknown-background-tag",
            source.source,
            `Gates on tag "${req.tag}", which no background and no outfit carries`,
            { ...at, subject: req.tag },
          ),
        );
      }
      break;
    }
    case "reputation": {
      if (req.mode === "at-most") break;
      const ceiling = world.standingCeiling[req.factionId] ?? 0;
      const wanted = thresholdValue(req.value);
      if (wanted > ceiling) {
        findings.push(
          warning(
            "unreachable-standing",
            source.source,
            `Needs ${req.factionId} standing ${wanted}, above everything the ` +
              `game's own swings add up to (${ceiling})`,
            { ...at, subject: req.factionId },
          ),
        );
      }
      break;
    }
    case "dominant-faction":
    case "static":
    case "credits":
    case "injury":
      break;
  }

  return findings;
}

/** Every gate in the corpus, weighed against the widest achievable state. */
export function auditGateSatisfiability(
  sources: readonly GateSource[],
  world: GateWorld,
): AuditFinding[] {
  const facts = flagFacts(world.writes);
  const findings: AuditFinding[] = [];
  for (const source of sources) {
    for (const req of source.requirements) {
      findings.push(...auditRequirement(source, req, world, facts));
    }
  }
  return findings;
}
