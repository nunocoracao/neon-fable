import {
  CRED_PER_VICTORY,
  VICTORY_FLAG_PREFIX,
  VICTORY_FLAG_VALUE,
  credDeeds,
  credMilestones,
  type CredMilestone,
} from "../data/advancement";
import { getPerk } from "../data/perks";
import type { FlagMap } from "../state/flags";
import { AdvancementError, type AdvancementView } from "./advancement";
import type { CharacterState } from "./create";
import { availablePerks, perkIdsOf } from "./perks";

/**
 * Street cred and the perk picks it earns.
 *
 * Cred is derived from the run's flags every time it is asked for —
 * never stored — exactly like the advancement points beside it
 * (./advancement.ts). That is what makes it safe: a chapter flag cannot
 * pay twice however often an ending re-sets it, a fight already won
 * cannot be re-won by reloading, and a save written before a deed was
 * worth anything picks the cred up the moment it loads.
 *
 * What *is* stored is the opposite half: which perks were taken. A pick
 * is permanent and the pool it came from shrinks by one, so the record
 * of it has to persist even though the entitlement never does.
 */

/** One line of the cred breakdown, as the advancement screen reads it. */
export interface CredLine {
  id: string;
  label: string;
  cred: number;
}

/** Fights this run has won, counted off the outcome flags. */
export function victoriesWon(flags: FlagMap): number {
  let won = 0;
  for (const [key, value] of Object.entries(flags)) {
    if (key.startsWith(VICTORY_FLAG_PREFIX) && value === VICTORY_FLAG_VALUE) {
      won += 1;
    }
  }
  return won;
}

/**
 * Every source of cred this run has, in reading order: the authored
 * deeds it has done, then the fights it walked away from. The screen
 * prints exactly this and sums nothing of its own.
 */
export function credLines(flags: FlagMap): CredLine[] {
  const lines: CredLine[] = [];
  for (const deed of credDeeds) {
    const wanted = deed.value ?? true;
    if (flags[deed.flag] === wanted) {
      lines.push({ id: deed.flag, label: deed.label, cred: deed.cred });
    }
  }
  const won = victoriesWon(flags);
  if (won > 0) {
    lines.push({
      id: "victories",
      label: won === 1 ? "1 fight won" : `${won} fights won`,
      cred: won * CRED_PER_VICTORY,
    });
  }
  return lines;
}

/** The run's street cred: everything the city has noticed, summed. */
export function streetCred(flags: FlagMap): number {
  return credLines(flags).reduce((sum, line) => sum + line.cred, 0);
}

/** Milestones this much cred has passed, in threshold order. */
export function milestonesReached(cred: number): CredMilestone[] {
  return credMilestones.filter((milestone) => cred >= milestone.cred);
}

/** The next one to reach, or null once the street has run out of names. */
export function nextMilestone(cred: number): CredMilestone | null {
  return credMilestones.find((milestone) => cred < milestone.cred) ?? null;
}

/** The milestone this run currently stands at, or null before the first. */
export function currentMilestone(cred: number): CredMilestone | null {
  const reached = milestonesReached(cred);
  return reached[reached.length - 1] ?? null;
}

/** Perk picks the run's cred has earned, over the whole run. */
export function perkPicksEarned(flags: FlagMap): number {
  return milestonesReached(streetCred(flags)).length;
}

/** Picks earned but not yet spent; never negative. */
export function perkPicksAvailable(state: AdvancementView): number {
  return Math.max(
    0,
    perkPicksEarned(state.flags) - perkIdsOf(state.player).length,
  );
}

/**
 * Takes a perk, permanently. Pure — returns a new CharacterState, like
 * every other advancement spend. The pool shrinks by exactly this one:
 * everything unchosen is still there at the next milestone, which is
 * what makes an early pick a decision about *order* rather than a
 * decision that closes doors.
 */
export function choosePerk(
  state: AdvancementView,
  perkId: string,
): CharacterState {
  const perk = getPerk(perkId);
  if (!perk) {
    throw new AdvancementError(
      "unknown-perk",
      `"${perkId}" is not a perk this build offers`,
    );
  }
  const { player } = state;
  if (perkIdsOf(player).includes(perkId)) {
    throw new AdvancementError(
      "perk-taken",
      `"${perk.name}" is already yours — a perk is taken once`,
    );
  }
  if (perkPicksAvailable(state) < 1) {
    throw new AdvancementError(
      "no-perk-pick",
      "No perk pick available — earn more street cred first",
    );
  }
  return {
    ...player,
    advancement: {
      ...player.advancement,
      perkIds: [...perkIdsOf(player), perkId],
    },
  };
}

/** True when the pool has nothing left to offer this character. */
export function perkPoolExhausted(player: CharacterState): boolean {
  return availablePerks(player).length === 0;
}
