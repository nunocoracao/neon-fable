import {
  defaultAppearance,
  normalizeInjury,
  normalizePerkIds,
  normalizeReadied,
} from "../character";
import type { CharacterState } from "../character";
import { sanitizeDyes, sanitizeMods } from "../inventory";
import type { GameState } from "./gameState";
import { clampLore, emptyLore } from "./lore";
import { emptyParty } from "./party";
import { deriveReputation } from "./reputation";
import { clampRules } from "./rules";
import { clampVendors, emptyVendors } from "./vendors";
import {
  describeIssues,
  validateGameState,
  type ValidationIssue,
} from "./validate";
import { GAME_STATE_VERSION } from "./version";

/**
 * Bringing an old save forward, one version at a time, with a net under
 * every step.
 *
 * The migration itself is the same set of changes it has always been —
 * the list below is the same ladder, one rung per version, each rung
 * doing the smallest thing that makes a save from the version before it
 * true. What is new is what happens around each rung:
 *
 *  - **Every step is validated at the version it just produced.** The
 *    step that adds parties is followed by a check that a party is
 *    there, held to exactly the schema that version demands and no more
 *    (see ./validate.ts).
 *  - **A failure names the step.** Not "migration failed" — "step
 *    v8 -> v9 (faction standing) failed", with the field that was wrong.
 *  - **A failure changes nothing.** The runner is pure and works on
 *    copies; the caller still holds the state it passed in, and the
 *    slot on disk was never written. A save this build cannot migrate
 *    stays exactly as it was, which is what makes it possible for a
 *    later build to migrate it properly.
 *
 * That last property is the point of the whole file. A migration that
 * half-succeeds and writes itself back is how a save that a future
 * build could have rescued becomes one nothing can.
 */

/** One rung: what it does, what it is called, and where it lands. */
export interface MigrationStep {
  /** Version this step accepts. */
  from: number;
  /** Version this step produces. */
  to: number;
  /** Human label for the report: "companions". */
  label: string;
  apply(state: GameState): GameState;
}

/** How a step is named in a message: `v8 -> v9 (faction standing)`. */
export function stepName(step: MigrationStep): string {
  return `v${step.from} -> v${step.to} (${step.label})`;
}

export type MigrationResult =
  | { ok: true; state: GameState; applied: string[] }
  | {
      ok: false;
      /** The state handed in, untouched. */
      original: GameState;
      /** Steps that had already passed when this one failed. */
      applied: string[];
      /** `v8 -> v9 (faction standing)`, or "normalize". */
      failedStep: string;
      /** Precise paths, when the step produced a state of the wrong shape. */
      issues: ValidationIssue[];
      /** One line naming the step and the first thing wrong with it. */
      message: string;
    };

export class MigrationError extends Error {
  constructor(
    readonly failedStep: string,
    readonly issues: ValidationIssue[],
    message: string,
  ) {
    super(message);
    this.name = "MigrationError";
  }
}

/* ------------------------------------------------------------------ *
 * The ladder
 * ------------------------------------------------------------------ */

/**
 * Every version step this build can climb, in order. Each entry is the
 * note that used to live in migrateGameState's doc comment, kept beside
 * the code it describes.
 */
export const MIGRATION_STEPS: readonly MigrationStep[] = [
  {
    from: 6,
    to: 7,
    label: "layered appearance",
    // Characters gained a layered appearance; old saves get the stock
    // look, which is always catalog-valid.
    apply: (state) => ({
      ...state,
      player: { ...state.player, appearance: defaultAppearance() },
    }),
  },
  {
    from: 7,
    to: 8,
    label: "companions",
    // The game gained companions; old saves get an empty party and can
    // recruit from wherever they left off.
    apply: (state) => ({ ...state, party: emptyParty() }),
  },
  {
    from: 8,
    to: 9,
    label: "faction standing",
    // The factions started keeping a ledger. Rather than starting an
    // old save at nothing, its standing is read back off the outcomes
    // it already recorded, so a run that stood with the Court in Act 1
    // loads as somebody the Court knows.
    apply: (state) => ({ ...state, reputation: deriveReputation(state.flags) }),
  },
  {
    from: 9,
    to: 10,
    label: "memory shards",
    // The city started leaving its history lying around. Old saves get
    // an empty collection and can go and find all twelve from wherever
    // they left off — the shards are still on the maps, because a map
    // only drops the ones this run has already picked up.
    apply: (state) => ({ ...state, lore: emptyLore() }),
  },
  {
    from: 10,
    to: 11,
    label: "weapon mod sockets",
    // Weapons grew mod sockets. There is nothing to fill in: a weapon
    // with no fitted parts is exactly what every older save already
    // describes, and the normalize pass is what makes that true rather
    // than assumed.
    apply: (state) => state,
  },
  {
    from: 11,
    to: 12,
    label: "outfit dyes",
    // Outfits started taking dye. Same story as the sockets: a coat
    // with no color rubbed into it is what every older save already
    // describes.
    apply: (state) => state,
  },
  {
    from: 12,
    to: 13,
    label: "vendor ledgers",
    // The counters started keeping books. An old save has traded at
    // none of them, which is exactly what an empty ledger set says —
    // and because a ledger only counts against the act it was written
    // in, a save resumed mid-chapter finds every shelf full, which is
    // the generous reading and the only one that cannot lose a player
    // something they paid for.
    apply: (state) => ({ ...state, vendors: emptyVendors() }),
  },
  {
    from: 13,
    to: 14,
    label: "street cred and perks",
    // The street started keeping score. Cred itself needs no migration
    // — it is derived from the deeds and the won fights an old save
    // already recorded — but the picks those milestones grant are
    // stored, and an old save has taken none. The normalize pass fills
    // the empty list in rather than assuming it.
    apply: (state) => state,
  },
  {
    from: 14,
    to: 15,
    label: "carried injuries",
    // Fights started leaving marks. An old save describes a runner and
    // a crew carrying nothing, which is exactly what an absent injury
    // field says; the normalize pass is what makes that true rather
    // than assumed.
    apply: (state) => state,
  },
  {
    from: 15,
    to: 16,
    label: "held-over meals",
    // The carts started selling hot food, and a meal is something you
    // carry into the *next* fight. An old save describes somebody who
    // has not eaten, which is what an absent held-over list says.
    apply: (state) => state,
  },
  {
    from: 16,
    to: 17,
    label: "difficulty presets",
    // The game learned to be played at more than one intensity. An old
    // save is a run on the authored figures with no assists switched
    // on, which is exactly what the middle preset and an empty
    // switchboard describe — so it loads as precisely the game it was,
    // down to the arithmetic. The clamp in the normalize pass fills the
    // record in rather than assuming it.
    apply: (state) => ({ ...state, rules: clampRules(state.rules) }),
  },
];

/**
 * The pass that runs after every ladder, at every version, including
 * for a save already at the current one.
 *
 * Content moves. A part sitting in a socket its weapon no longer
 * offers, a color whose material this build dropped, a perk or a wound
 * or a held-over lift naming something retired — each has to stop
 * paying out rather than quietly keep doing so, and each is repaired
 * here rather than trusted. A save with none of those comes back
 * unchanged.
 */
export function normalizeState(state: GameState): GameState {
  const withMods = sanitizeMods(state.player, state.inventory);
  const cleaned = sanitizeDyes(withMods.player, withMods.inventory);
  const player: CharacterState = {
    ...cleaned.player,
    advancement: {
      ...cleaned.player.advancement,
      perkIds: normalizePerkIds(cleaned.player.advancement?.perkIds),
    },
    injury: normalizeInjury(cleaned.player.injury),
    readied: normalizeReadied(cleaned.player.readied),
  };
  return {
    ...state,
    player,
    inventory: cleaned.inventory,
    // The crew's wounds follow the same rules the player's do.
    party: {
      ...state.party,
      members: (state.party?.members ?? []).map((member) => ({
        ...member,
        injury: normalizeInjury(member.injury),
      })),
    },
    lore: clampLore(state.lore),
    vendors: clampVendors(state.vendors),
    rules: clampRules(state.rules),
    version: GAME_STATE_VERSION,
  };
}

/* ------------------------------------------------------------------ *
 * The runner
 * ------------------------------------------------------------------ */

/**
 * Climbs the ladder from `fromVersion`, validating after every rung.
 * Never throws and never mutates: on failure the state handed in comes
 * straight back out alongside the name of the step that could not be
 * completed.
 *
 * `steps` is injectable so the failure path can be tested with a rung
 * that breaks on purpose — there is no other way to exercise it, and a
 * safety net nobody has ever dropped anything into is not a safety net.
 */
export function migrateStepwise(
  state: GameState,
  fromVersion: number,
  steps: readonly MigrationStep[] = MIGRATION_STEPS,
): MigrationResult {
  const applied: string[] = [];
  let current = state;
  let version = fromVersion;

  for (const step of steps) {
    if (step.from < version) continue;
    if (step.from > version) break;
    const name = stepName(step);

    let next: GameState;
    try {
      next = step.apply(current);
    } catch (error) {
      return {
        ok: false,
        original: state,
        applied,
        failedStep: name,
        issues: [],
        message: `Migration step ${name} threw: ${errorText(error)}`,
      };
    }

    const check = validateGameState(next, { atVersion: step.to });
    if (!check.ok) {
      return {
        ok: false,
        original: state,
        applied,
        failedStep: name,
        issues: check.issues,
        message: `Migration step ${name} produced an invalid save: ${describeIssues(
          check.issues,
        )}`,
      };
    }

    current = next;
    version = step.to;
    applied.push(name);
  }

  let normalized: GameState;
  try {
    normalized = normalizeState(current);
  } catch (error) {
    return {
      ok: false,
      original: state,
      applied,
      failedStep: "normalize",
      issues: [],
      message: `Migration step normalize threw: ${errorText(error)}`,
    };
  }

  const final = validateGameState(normalized, { atVersion: GAME_STATE_VERSION });
  if (!final.ok) {
    return {
      ok: false,
      original: state,
      applied,
      failedStep: "normalize",
      issues: final.issues,
      message: `Migration step normalize produced an invalid save: ${describeIssues(
        final.issues,
      )}`,
    };
  }

  applied.push("normalize");
  return { ok: true, state: normalized, applied };
}

/**
 * Migrates a save's GameState from an older supported version to the
 * current shape. Pure: returns a new state, and throws MigrationError
 * rather than returning a half-migrated one. Callers gate on
 * OLDEST_MIGRATABLE_VERSION before calling.
 */
export function migrateGameState(
  state: GameState,
  fromVersion: number,
): GameState {
  const result = migrateStepwise(state, fromVersion);
  if (!result.ok) {
    throw new MigrationError(result.failedStep, result.issues, result.message);
  }
  return result.state;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
