import type { CharacterState } from "../character/create";
import { requireItem } from "../data/items";
import type { ItemResolver } from "../inventory/items";
import { staticEffects } from "../inventory/staticLoad";
import type {
  Combatant,
  CombatEvent,
  CombatState,
  StaticSurge,
} from "./types";

/**
 * The static surge: what a screaming Static band actually costs in a
 * fight, and the turn of warning that makes it a decision rather than a
 * tax.
 *
 * ## The shape of it
 *
 * A runner at the screaming band (and only there — see
 * src/data/static.ts) starts every fight with noise banking. It banks
 * one point at the start of each turn handed to them. At
 * SURGE_ARM_TURNS the chrome *arms*: the log says so, the HUD says so,
 * and from that moment the player has exactly one turn to answer it.
 *
 * - **Answer it** by taking that turn without spending the main action
 *   — moving is free, swinging is not. The charge bleeds off through
 *   the frame instead of through the cortex, and the fight goes on.
 * - **Ignore it** and it discharges at the start of the following turn,
 *   stunning them for SURGE_STUN_TURNS. The turn loop already knows how
 *   to lose a turn to a stun, so a surge costs one in exactly the way
 *   everything else does.
 *
 * Either way it is **spent**: once per fight, whichever way it goes.
 *
 * ## No dice
 *
 * There is no roll anywhere in this module and the state's RNG is never
 * touched. The surge is a clock, not a risk — the same loadout in the
 * same fight arms on the same turn every time, which is what lets a
 * player plan the free turn instead of praying through it. "Risk" is
 * the right word for it only in the sense that ignoring a telegraph is
 * a risk.
 *
 * Pure over CombatState, like ./charge.ts. Nothing here decides
 * presentation: the events go in the log and src/ui/ turns them into
 * sentences.
 */

/** Turns of noise the chrome banks before it arms. */
export const SURGE_ARM_TURNS = 3;

/** Turns a discharge takes off its owner. */
export const SURGE_STUN_TURNS = 1;

/**
 * The surge a character walks into a fight carrying, or null when their
 * chrome is quiet enough that nothing can build. Read off the band's
 * own effects table rather than off a band id, so retuning which bands
 * surge is a change to content alone.
 */
export function startingSurge(
  character: CharacterState,
  combatantId: string,
  resolve: ItemResolver = requireItem,
): StaticSurge | null {
  if (!staticEffects(character, resolve).surge) return null;
  return { combatantId, charge: 0, armed: false, spent: false };
}

/** The live surge on a fight, or null — spent ones stop counting. */
export function pendingSurge(state: CombatState): StaticSurge | null {
  const surge = state.surge ?? null;
  return surge && !surge.spent ? surge : null;
}

/** True while a surge is one turn from going off. */
export function isSurgeArmed(state: CombatState): boolean {
  return pendingSurge(state)?.armed === true;
}

/**
 * Turns of quiet left before the chrome arms: SURGE_ARM_TURNS at the
 * start of a fight, 0 once it is armed, and null when there is no surge
 * to count down. What the HUD's warning line is drawn from.
 */
export function surgeTurnsToArm(state: CombatState): number | null {
  const surge = pendingSurge(state);
  if (!surge) return null;
  return surge.armed ? 0 : Math.max(0, SURGE_ARM_TURNS - surge.charge);
}

/** Whether this surge belongs to the body about to act (or just acted). */
function owns(surge: StaticSurge | null, combatantId: string): boolean {
  return surge !== null && surge.combatantId === combatantId;
}

function withSurge(
  state: CombatState,
  surge: StaticSurge,
  events: CombatEvent[],
): CombatState {
  return { ...state, surge, log: [...state.log, ...events] };
}

function stun(state: CombatState, id: string, turns: number): CombatState {
  return {
    ...state,
    combatants: state.combatants.map((c: Combatant) =>
      c.id === id ? { ...c, stunTurns: c.stunTurns + turns } : c,
    ),
  };
}

/**
 * The start of a turn, for the body carrying the noise: one more point
 * banked, the arming warning when it fills, or the discharge itself.
 *
 * A discharge only adds stun turns — it does not skip anything. The
 * caller runs this *before* it checks the incoming combatant's stun, so
 * the turn is lost through the same path every other stun loses one,
 * and the log reads `static-surge` followed by `stun-skipped`.
 */
export function openSurgeTurn(
  state: CombatState,
  combatantId: string,
): CombatState {
  const surge = pendingSurge(state);
  if (!owns(surge, combatantId) || surge === null) return state;

  if (surge.armed) {
    const discharged = stun(state, combatantId, SURGE_STUN_TURNS);
    return withSurge(
      discharged,
      { ...surge, armed: false, charge: 0, spent: true },
      [{ type: "static-surge", combatantId, stunTurns: SURGE_STUN_TURNS }],
    );
  }

  const charge = surge.charge + 1;
  if (charge < SURGE_ARM_TURNS) {
    return withSurge(state, { ...surge, charge }, []);
  }
  return withSurge(state, { ...surge, charge, armed: true }, [
    { type: "static-armed", combatantId },
  ]);
}

/**
 * The end of a turn, for the body carrying the noise: an armed surge
 * bleeds off if the turn went by without its main action being spent.
 *
 * `actionSpent` is the outgoing turn's `actionUsed`, read by the caller
 * before it advances — venting is a whole turn's attack given up, and
 * nothing less. Steps are free: walking out of reach while the chrome
 * settles is exactly the move this is meant to reward.
 */
export function closeSurgeTurn(
  state: CombatState,
  combatantId: string,
  actionSpent: boolean,
): CombatState {
  const surge = pendingSurge(state);
  if (!owns(surge, combatantId) || surge === null) return state;
  if (!surge.armed || actionSpent) return state;
  return withSurge(state, { ...surge, armed: false, charge: 0, spent: true }, [
    { type: "static-vented", combatantId },
  ]);
}
