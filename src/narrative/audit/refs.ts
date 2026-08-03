import type { FlagValue } from "../../state/flags";
import type { Effect, Requirement } from "../types";

/**
 * What a gate asks for and what an effect writes, read off the data
 * rather than off the engine.
 *
 * Every check in the audit starts here, and requirementRefs is total
 * over the Requirement union on purpose: a new gate kind that names a
 * content id has to be taught to that switch or it stops compiling.
 * That exhaustiveness is the tripwire on the vocabulary — the thing
 * that keeps the audit from quietly going blind to a gate somebody
 * added last month.
 */

/** How a gate reads a flag. */
export type FlagReadKind =
  | "equals"
  | "not-equals"
  | "at-least"
  | "set"
  | "unset";

export interface FlagRead {
  key: string;
  kind: FlagReadKind;
  /** The value asked for, where the gate names one. */
  value?: FlagValue;
}

export interface FlagWrite {
  key: string;
  /** The value written, for a set-flag; absent for an increment. */
  value?: FlagValue;
  /** The step, for an increment-flag. */
  increment?: number;
}

/** Every flag a requirement bundle reads. */
export function flagReads(
  requirements: readonly Requirement[] | undefined,
): FlagRead[] {
  const reads: FlagRead[] = [];
  for (const req of requirements ?? []) {
    switch (req.type) {
      case "flag-equals":
        reads.push({ key: req.key, kind: "equals", value: req.value });
        break;
      case "flag-not-equals":
        reads.push({ key: req.key, kind: "not-equals", value: req.value });
        break;
      case "flag-at-least":
        reads.push({ key: req.key, kind: "at-least", value: req.value });
        break;
      case "flag-set":
        reads.push({ key: req.key, kind: "set" });
        break;
      case "flag-unset":
        reads.push({ key: req.key, kind: "unset" });
        break;
      default:
        break;
    }
  }
  return reads;
}

/** Every flag an effect list writes. */
export function flagWrites(
  effects: readonly Effect[] | undefined,
): FlagWrite[] {
  const writes: FlagWrite[] = [];
  for (const effect of effects ?? []) {
    if (effect.type === "set-flag") {
      writes.push({ key: effect.key, value: effect.value });
    }
    if (effect.type === "increment-flag") {
      writes.push({ key: effect.key, increment: effect.amount ?? 1 });
    }
  }
  return writes;
}

/** A content id a gate names, and what kind of thing it is. */
export type RefKind =
  | "item"
  | "enhancement"
  | "companion"
  | "injury"
  | "faction"
  | "band"
  | "background-tag";

export interface ContentRef {
  kind: RefKind;
  id: string;
}

/**
 * Every content id one requirement names. Exhaustive over Requirement:
 * a new gate kind that names an id has to be added here or the switch
 * stops compiling.
 */
export function requirementRefs(req: Requirement): ContentRef[] {
  switch (req.type) {
    case "item":
      return [{ kind: "item", id: req.itemId }];
    case "enhancement":
      return [{ kind: "enhancement", id: req.itemId }];
    case "companion":
      return [{ kind: "companion", id: req.companionId }];
    case "loyalty":
      return [{ kind: "companion", id: req.companionId }];
    case "injury": {
      const refs: ContentRef[] = [];
      if (req.injuryId != null) refs.push({ kind: "injury", id: req.injuryId });
      if (req.companionId != null) {
        refs.push({ kind: "companion", id: req.companionId });
      }
      return refs;
    }
    case "reputation": {
      const refs: ContentRef[] = [{ kind: "faction", id: req.factionId }];
      if (typeof req.value === "string") {
        refs.push({ kind: "band", id: req.value });
      }
      return refs;
    }
    case "dominant-faction": {
      // "none" is the split-city variant, not a faction anybody authored.
      const refs: ContentRef[] =
        req.factionId === "none" ? [] : [{ kind: "faction", id: req.factionId }];
      if (typeof req.min === "string") refs.push({ kind: "band", id: req.min });
      return refs;
    }
    case "background":
      return [{ kind: "background-tag", id: req.tag }];
    case "flag-equals":
    case "flag-not-equals":
    case "flag-at-least":
    case "flag-set":
    case "flag-unset":
    case "stat":
    case "static":
    case "credits":
      return [];
  }
}

/** Every content id a whole requirement bundle names. */
export function requirementsRefs(
  requirements: readonly Requirement[] | undefined,
): ContentRef[] {
  return (requirements ?? []).flatMap(requirementRefs);
}
