/**
 * The attack motion model: which one-shot animation a combatant plays
 * when it swings, and exactly when each beat of that animation lands.
 *
 * Attacks are not loops. Every weapon class has its own short authored
 * set (3–5 frames, see ./art/layers/attack), its own per-frame hold
 * times, and its own impact frame — the beat the hit is supposed to
 * connect on, which the combat scene schedules the target's flash and
 * damage number against. Melee classes throw their weight at the target
 * through that beat; ranged classes kick back off it instead.
 *
 * Everything here is pure over a class id and an elapsed millisecond
 * count — no wall clock, no art, no canvas — so the whole sequence is
 * unit-testable and deterministic. The art module authors the frames to
 * these counts; a test pins the two together.
 */
import { bodyFrameAt, type LoopState, type MotionState } from "./animation";
import { reactionFrameAt, type ReactionPose } from "./reaction";

/**
 * Classes an attack animation is authored per: the five held-weapon
 * silhouettes plus bare hands. Kept in sync with WEAPON_CLASS_IDS in
 * ./art/layers/weapons by a test — every weapon class must be able to
 * swing, and "unarmed" covers everything holding nothing.
 */
export const ATTACK_CLASS_IDS = [
  "unarmed",
  "blade",
  "baton",
  "pistol",
  "rifle",
  "lash",
] as const;

export type AttackClassId = (typeof ATTACK_CLASS_IDS)[number];

/** Timing and weight of one class's attack animation. */
export interface AttackTiming {
  /** How long each authored frame holds, in order. Length = frame count. */
  readonly frameMs: readonly number[];
  /**
   * Frame the hit lands on. The impact beat is the moment that frame
   * starts — a blade is across the target the instant the strike frame
   * appears, a gun fires the instant its muzzle flash does.
   */
  readonly impactFrame: number;
  /**
   * Screen pixels the attacker's body travels toward the target across
   * the animation, peaking on the impact beat. Melee classes commit
   * forward; ranged classes take a small negative kick (recoil away
   * from the target) instead of stepping into their own line of fire.
   */
  readonly lungePx: number;
}

/**
 * Per-class attack timing. Frame counts match the authored sets in
 * ./art/layers/attack (pinned by a test); durations are shaped so the
 * wind-up reads before the strike snaps through.
 */
export const ATTACK_TIMING: Readonly<Record<AttackClassId, AttackTiming>> = {
  // A jab: pull back, throw it, recover.
  unarmed: { frameMs: [110, 90, 150], impactFrame: 1, lungePx: 22 },
  // A swing arc: raise, hold at the top, cut through, follow, recover.
  blade: { frameMs: [90, 110, 80, 90, 140], impactFrame: 2, lungePx: 26 },
  // An overhead chop, slower on the way up than on the way down.
  baton: { frameMs: [110, 120, 80, 150], impactFrame: 2, lungePx: 24 },
  // Raise, settle on the sights, fire, lower.
  pistol: { frameMs: [90, 90, 110, 160], impactFrame: 2, lungePx: -8 },
  // Shoulder the long gun, steady it, fire, ride the recoil, lower.
  rifle: { frameMs: [100, 100, 120, 110, 170], impactFrame: 3, lungePx: -12 },
  // Coil, wind, throw, crack, reel back in.
  lash: { frameMs: [90, 100, 90, 100, 160], impactFrame: 3, lungePx: 14 },
};

/** How many authored frames a class's attack set has. */
export function attackFrameCount(attackClass: AttackClassId): number {
  return ATTACK_TIMING[attackClass].frameMs.length;
}

/** One frame's window inside the sequence, in ms from the attack start. */
export interface AttackFrameWindow {
  readonly index: number;
  readonly startMs: number;
  /** Exclusive: the next frame starts here. */
  readonly endMs: number;
}

/**
 * The full timeline of a class's attack: every frame's window, the
 * impact beat, the total duration, and the lunge envelope the scene
 * rides. Derived, not authored — change a frame duration and every beat
 * downstream moves with it.
 */
export interface AttackSequence {
  readonly attackClass: AttackClassId;
  readonly frames: readonly AttackFrameWindow[];
  /** Ms from the attack start to the impact beat. */
  readonly impactMs: number;
  /** Ms the whole animation runs for. */
  readonly durationMs: number;
  /**
   * Ms the body's lunge envelope runs for, twice the impact delay so
   * the lunge peaks exactly on the impact beat (see lunge01), clamped
   * to the animation so nothing lingers past the last frame.
   */
  readonly lungeMs: number;
  /** Peak lunge travel in screen pixels; negative reads as recoil. */
  readonly lungePx: number;
}

/** The timeline for a class; pure, so callers may recompute it freely. */
export function attackSequence(attackClass: AttackClassId): AttackSequence {
  const timing = ATTACK_TIMING[attackClass];
  const frames: AttackFrameWindow[] = [];
  let startMs = 0;
  timing.frameMs.forEach((ms, index) => {
    frames.push({ index, startMs, endMs: startMs + ms });
    startMs += ms;
  });
  const impact = frames[timing.impactFrame];
  const durationMs = startMs;
  const impactMs = impact ? impact.startMs : durationMs;
  return {
    attackClass,
    frames,
    impactMs,
    durationMs,
    lungeMs: Math.min(impactMs * 2, durationMs),
    lungePx: timing.lungePx,
  };
}

/** Ms from an attack's start to the beat its hit lands on. */
export function attackImpactMs(attackClass: AttackClassId): number {
  return attackSequence(attackClass).impactMs;
}

/** Ms a class's whole attack animation runs for. */
export function attackDurationMs(attackClass: AttackClassId): number {
  return attackSequence(attackClass).durationMs;
}

/**
 * Which authored frame is showing `elapsedMs` into the attack, or null
 * once the sequence is over (and before it starts). The last frame
 * holds for its full duration, so callers get null exactly at the end.
 */
export function attackFrameAt(
  attackClass: AttackClassId,
  elapsedMs: number,
): number | null {
  if (!(elapsedMs >= 0)) return null;
  const { frames, durationMs } = attackSequence(attackClass);
  if (elapsedMs >= durationMs) return null;
  for (const frame of frames) {
    if (elapsedMs < frame.endMs) return frame.index;
  }
  return null;
}

/** What a sprite lookup asks about: is it walking, and mid-attack? */
export interface MotionQuery {
  readonly moving: boolean;
  /** Absolute animation clock for the idle/walk loops. */
  readonly timeMs: number;
  /**
   * Ms since this entity's attack animation started, when one is
   * playing. Absent (or past the sequence) falls back to the loops.
   */
  readonly attackElapsedMs?: number | undefined;
  /**
   * The hit reaction or death this entity is playing, when one is. It
   * outranks everything: whatever a body was doing, a blow landing on
   * it interrupts, and a heap on the floor never gets back up.
   */
  readonly reaction?: ReactionPose | undefined;
}

/**
 * The motion state and frame a pose resolves to: a reaction wins over
 * everything, then an in-flight attack, then walking, then the idle
 * breath. This is the one selection rule — the sprite provider calls it
 * for both the sprite and its hit-flash silhouette, so the outline
 * always traces the frame that is actually on screen.
 */
export function selectMotionFrame(
  attackClass: AttackClassId,
  pose: MotionQuery,
): { state: MotionState; frame: number } {
  if (pose.reaction) {
    const frame = reactionFrameAt(pose.reaction.kind, pose.reaction.elapsedMs);
    if (frame !== null) return { state: "react", frame };
  }
  if (pose.attackElapsedMs !== undefined) {
    const frame = attackFrameAt(attackClass, pose.attackElapsedMs);
    if (frame !== null) return { state: "attack", frame };
  }
  const state: LoopState = pose.moving ? "walk" : "idle";
  return { state, frame: bodyFrameAt(state, pose.timeMs) };
}
