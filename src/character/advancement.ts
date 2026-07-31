import { advancementPool, requireAbility } from "../data/abilities";
import { STAT_RAISE_COST, chapterGrants } from "../data/advancement";
import type { FlagMap } from "../state/flags";
import { deriveAttributes } from "./derived";
import { STAT_HARD_CAP, type StatKey } from "./stats";
import type { CharacterState } from "./create";

/**
 * Chapter advancement: completing a chapter earns points to spend on
 * stat raises and ability unlocks. Earned points are derived from the
 * chapter-completion flags every time (chapterGrants in
 * src/data/advancement.ts), so a chapter can never grant twice and old
 * states pick grants up retroactively; only the spends are stored, on
 * player.advancement. Pure functions — spends return a new
 * CharacterState, matching the inventory module's Loadout pattern.
 *
 * The other currency — street cred, and the perk picks its milestones
 * grant — is derived the same way and lives in ./cred.ts. It shares
 * this module's view type and its error type on purpose: to a screen,
 * and to a save, both are one advancement record.
 */

/** The slice of GameState advancement reads: flags plus the player. */
export interface AdvancementView {
  flags: FlagMap;
  player: CharacterState;
}

export type AdvancementErrorCode =
  | "insufficient-points"
  | "stat-at-cap"
  | "unknown-ability"
  | "already-unlocked"
  /** A perk pick was made with no milestone owing one. */
  | "no-perk-pick"
  /** The id is not in this build's perk pool. */
  | "unknown-perk"
  /** Already taken; a perk is permanent and taken once (see ./cred.ts). */
  | "perk-taken";

export class AdvancementError extends Error {
  constructor(
    readonly code: AdvancementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdvancementError";
  }
}

/** Total points the set chapter-completion flags have earned. */
export function earnedPoints(flags: FlagMap): number {
  return chapterGrants.reduce(
    (sum, grant) => sum + (flags[grant.flag] ? grant.points : 0),
    0,
  );
}

/** Points still unspent (never negative, even on hand-edited states). */
export function availablePoints(state: AdvancementView): number {
  return Math.max(
    0,
    earnedPoints(state.flags) - state.player.advancement.pointsSpent,
  );
}

/**
 * Spends STAT_RAISE_COST points to raise a base stat by 1, up to the
 * hard cap. Derived attributes are recomputed and current HP grows with
 * any max-HP increase, so the raise flows through effectiveStats,
 * combat snapshots, and stat gates with no special cases.
 */
export function raiseStat(
  state: AdvancementView,
  stat: StatKey,
): CharacterState {
  const { player } = state;
  if (availablePoints(state) < STAT_RAISE_COST) {
    throw new AdvancementError(
      "insufficient-points",
      `Raising a stat costs ${STAT_RAISE_COST} advancement points`,
    );
  }
  if (player.stats[stat] >= STAT_HARD_CAP) {
    throw new AdvancementError(
      "stat-at-cap",
      `${stat} is already at the cap of ${STAT_HARD_CAP}`,
    );
  }
  const stats = { ...player.stats, [stat]: player.stats[stat] + 1 };
  const derived = deriveAttributes(stats);
  const hp = Math.min(
    derived.maxHp,
    player.hp + Math.max(0, derived.maxHp - player.derived.maxHp),
  );
  return {
    ...player,
    stats,
    derived,
    hp,
    advancement: {
      ...player.advancement,
      pointsSpent: player.advancement.pointsSpent + STAT_RAISE_COST,
    },
  };
}

/**
 * Spends points to permanently unlock an ability from the advancement
 * pool (advancementPool in src/data/abilities.ts). Unlocked ids surface
 * through grantedAbilityIds, so combat sees them like gear grants.
 */
export function unlockAbility(
  state: AdvancementView,
  abilityId: string,
): CharacterState {
  const entry = advancementPool.find((e) => e.abilityId === abilityId);
  if (!entry) {
    throw new AdvancementError(
      "unknown-ability",
      `"${abilityId}" is not in the advancement ability pool`,
    );
  }
  requireAbility(abilityId);
  const { player } = state;
  if (player.advancement.abilityIds.includes(abilityId)) {
    throw new AdvancementError(
      "already-unlocked",
      `"${abilityId}" is already unlocked`,
    );
  }
  if (availablePoints(state) < entry.cost) {
    throw new AdvancementError(
      "insufficient-points",
      `Unlocking this ability costs ${entry.cost} advancement points`,
    );
  }
  return {
    ...player,
    advancement: {
      ...player.advancement,
      pointsSpent: player.advancement.pointsSpent + entry.cost,
      abilityIds: [...player.advancement.abilityIds, abilityId],
    },
  };
}
