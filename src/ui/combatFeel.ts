import { isCriticalBlow, isGlancingBlow, isHeavyBlow } from "../combat/damage";
import type { CombatantKind } from "../combat/types";
import type { ImpactWeight, TurnPace } from "../iso";

/**
 * What a landed blow weighed, read off the figures the combat math
 * already produced — and read here, in the UI, because it is the one
 * layer allowed to look at both the engine and the scene. The scene
 * never imports the engine; the engine branches on none of this.
 *
 * The readings are the ones the floating figures already use (see
 * ./combatPopups.ts): armor stopping the greater share is a glance, a
 * third of a frame in one blow is critical, a fifth is heavy. What
 * changes is only what the camera does about it — hold longer, kick
 * harder, or neither.
 */

/** What the camera needs to know about the body a blow landed on. */
export interface ImpactTarget {
  /** Plating in the blow's way; 0 for damage that ignores it. */
  readonly armor: number;
  readonly maxHp: number;
}

/**
 * The weight of one landed blow. A glance is worth nothing, a critical
 * is worth the most, and everything between is read off the share of
 * the target's frame it took. A blow that dealt nothing (a miss never
 * reaches here) reads as a glance.
 */
export function impactWeight(
  damage: number,
  target: ImpactTarget,
  /**
   * The share of the frame this blow has to take to read as critical.
   * Absent is the standard reading; a weapon with a hairline sear
   * fitted passes its own (see CombatWeapon.critShare) — the one thing
   * a crit-behavior mod moves is where this line is drawn.
   */
  critShare?: number,
): ImpactWeight {
  if (damage <= 0) return "glancing";
  if (isGlancingBlow(damage, target.armor)) return "glancing";
  if (isCriticalBlow(damage, target.maxHp, critShare)) return "critical";
  return isHeavyBlow(damage, target.maxHp) ? "heavy" : "solid";
}

// --- Whose turn the camera is watching ---------------------------------

/** The combatant whose turn it is, as the camera needs to read it. */
export interface ActiveTurn {
  readonly id: string;
  readonly kind: CombatantKind;
}

/** A reframing the screen should ask the scene for. */
export interface TurnFocusRequest {
  readonly entityId: string;
  readonly pace: TurnPace;
}

/**
 * Whether a turn just started, and how fast the camera should answer.
 * A *change* of hand is the whole trigger — every other sync (a step
 * taken, a condition ticking, the pointer moving) leaves the framing
 * alone, so a glide already underway is never re-aimed mid-flight. The
 * AI's turns are glided through faster than the player's own — and a
 * companion's turn is the player's own, because the player takes it.
 */
export function turnFocus(
  active: ActiveTurn | null,
  focusedId: string | null,
): TurnFocusRequest | null {
  if (active === null || active.id === focusedId) return null;
  return {
    entityId: active.id,
    pace: active.kind === "enemy" ? "ai" : "player",
  };
}
