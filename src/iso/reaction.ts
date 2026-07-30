/**
 * The receiving end of a blow: which one-shot animation a combatant
 * plays when something lands on it, how long each beat of that
 * animation holds, and — when several of them land at once — the order
 * they are allowed to play in.
 *
 * Four reactions, two of each kind:
 *
 * - `flinch` — a solid hit. Two frames of head-and-torso recoil away
 *   from whoever threw it.
 * - `shudder` — a blow armor took the greater share of (see
 *   isGlancingBlow in ../combat/damage). Shallower, shorter: the plate
 *   ate it, so the body barely moves.
 * - `collapse` — death. Four frames folding the figure down onto its
 *   own shadow, the last of which is the heap it stays as.
 * - `sparkout` — death, for something that was never alive. The shell
 *   drops straighter and faster, throwing sparks as it goes.
 *
 * Deaths *persist*: past the last frame the heap keeps showing, for the
 * rest of the encounter. That is the one asymmetry with ./attack —
 * everything else here is the same shape, pure over an id and an
 * elapsed millisecond count, with no wall clock and no art.
 *
 * ## Queueing
 *
 * A reaction answers an *impact beat* — the moment ./attack says the
 * swing connects. Several reactions can answer the same beat (an area
 * effect, later), and two of them starting on the same frame read as
 * one confused shove rather than two hits. So reactions queue:
 * everything landing on one beat plays in initiative order, each a
 * REACTION_STAGGER_MS behind the last, and one combatant never plays
 * two reactions at once — a second waits for the first to finish, which
 * is what puts a collapse cleanly after the flinch that killed it.
 *
 * Scheduling is pure over (queue, request, now): same inputs, same
 * timings, no matter what order the requests arrived in.
 *
 * ## No knockback
 *
 * Nothing here slides a combatant across the grid, because nothing in
 * the engine moves one against its will: every position change in
 * ../combat comes from a `move` action the combatant chose, and no
 * ability produces forced movement (see AbilityEffect in
 * ../data/abilities). A body shoved a tile it did not really lose would
 * be a lie about the board — so when a forced-movement result exists,
 * the slide belongs here, and until then there is none.
 */

/** Reactions to a blow that was survived. */
export const HIT_REACTION_KINDS = ["flinch", "shudder"] as const;

/** Reactions to a blow that was not. */
export const DEATH_REACTION_KINDS = ["collapse", "sparkout"] as const;

export type HitReactionKind = (typeof HIT_REACTION_KINDS)[number];
export type DeathReactionKind = (typeof DEATH_REACTION_KINDS)[number];
export type ReactionKind = HitReactionKind | DeathReactionKind;

export const REACTION_KINDS: readonly ReactionKind[] = [
  ...HIT_REACTION_KINDS,
  ...DEATH_REACTION_KINDS,
];

/** Timing and persistence of one reaction's animation. */
export interface ReactionTiming {
  /** How long each authored frame holds, in order. Length = frame count. */
  readonly frameMs: readonly number[];
  /**
   * Whether the last frame keeps showing once the sequence is over. A
   * death does — the heap is scenery for the rest of the fight; a
   * flinch does not, and the body returns to its resting loops.
   */
  readonly persists: boolean;
}

/**
 * Per-reaction timing. Frame counts match the authored sets in
 * ./art/layers/hit (pinned by a test). Hits are short enough to read
 * under the white flash they play with (FLASH_MS in ./combatScene);
 * deaths hold their last fall frame longest, so the figure settles into
 * the heap instead of snapping to it.
 */
export const REACTION_TIMING: Readonly<Record<ReactionKind, ReactionTiming>> = {
  // Snap away, recover.
  flinch: { frameMs: [90, 130], persists: false },
  // The plate took it: a shrug of the same shape, half the travel.
  shudder: { frameMs: [70, 90], persists: false },
  // Buckle, fold, go over, settle.
  collapse: { frameMs: [90, 90, 110, 240], persists: true },
  // Drop, drop, spit sparks, dark.
  sparkout: { frameMs: [70, 70, 90, 240], persists: true },
};

/** Whether a reaction is one nothing gets up from. */
export function isDeathReaction(kind: ReactionKind): kind is DeathReactionKind {
  return REACTION_TIMING[kind].persists;
}

/** How many authored frames a reaction has. */
export function reactionFrameCount(kind: ReactionKind): number {
  return REACTION_TIMING[kind].frameMs.length;
}

/** One frame's window inside the sequence, in ms from the reaction start. */
export interface ReactionFrameWindow {
  readonly index: number;
  readonly startMs: number;
  /** Exclusive: the next frame starts here. */
  readonly endMs: number;
}

/** The full timeline of a reaction. Derived from REACTION_TIMING. */
export interface ReactionSequence {
  readonly kind: ReactionKind;
  readonly frames: readonly ReactionFrameWindow[];
  readonly durationMs: number;
  readonly persists: boolean;
  /** The frame left on screen forever; only meaningful when it persists. */
  readonly restingFrame: number;
}

/** The timeline for a reaction; pure, so callers may recompute it freely. */
export function reactionSequence(kind: ReactionKind): ReactionSequence {
  const timing = REACTION_TIMING[kind];
  const frames: ReactionFrameWindow[] = [];
  let startMs = 0;
  timing.frameMs.forEach((ms, index) => {
    frames.push({ index, startMs, endMs: startMs + ms });
    startMs += ms;
  });
  return {
    kind,
    frames,
    durationMs: startMs,
    persists: timing.persists,
    restingFrame: frames.length - 1,
  };
}

/** Ms a reaction's animation runs for (before any persistence). */
export function reactionDurationMs(kind: ReactionKind): number {
  return reactionSequence(kind).durationMs;
}

/**
 * Which authored frame is showing `elapsedMs` into the reaction. Past
 * the end a persisting reaction holds its resting frame — a heap does
 * not get up — and everything else returns null, which is the caller's
 * cue to fall back to the idle and walk loops.
 */
export function reactionFrameAt(
  kind: ReactionKind,
  elapsedMs: number,
): number | null {
  if (!(elapsedMs >= 0)) return null;
  const { frames, durationMs, persists, restingFrame } = reactionSequence(kind);
  if (elapsedMs >= durationMs) return persists ? restingFrame : null;
  for (const frame of frames) {
    if (elapsedMs < frame.endMs) return frame.index;
  }
  return null;
}

/**
 * Which reaction art a pose draws, and which way it is thrown. `awayX`
 * is the screen-x direction *away* from whatever landed the blow, so
 * the recoil is applied after the facing mirror rather than before it —
 * a body shoved to the right is shoved to the right on every facing.
 */
export interface ReactionVariant {
  readonly kind: ReactionKind;
  readonly awayX: -1 | 1;
}

/** A reaction as a sprite pose: the variant plus how far into it we are. */
export interface ReactionPose extends ReactionVariant {
  readonly elapsedMs: number;
}

/** A reaction waiting to be placed on the timeline. */
export interface ReactionRequest extends ReactionVariant {
  /** Combatant this lands on. */
  readonly entityId: string;
  /**
   * The reacting combatant's place in the initiative order. Reactions
   * answering the same beat play in it, earliest first.
   */
  readonly order: number;
  /** Scene-clock ms of the impact beat this reaction answers. */
  readonly beatMs: number;
}

/** A placed reaction: when it starts, and when its animation is done. */
export interface ScheduledReaction extends ReactionRequest {
  readonly startMs: number;
  /** Animation end; a persisting reaction still shows its heap after it. */
  readonly endMs: number;
}

/** Gap between two reactions answering the same impact beat. */
export const REACTION_STAGGER_MS = 80;

/** Total order over one beat's reactions: initiative, then id. */
function precedes(a: ReactionRequest, b: ReactionRequest): boolean {
  if (a.order !== b.order) return a.order < b.order;
  return a.entityId < b.entityId;
}

/**
 * Sort key for the pending queue: beat, then initiative, then id — and
 * where one combatant answers a single beat twice, it flinches before
 * it falls, never the other way round.
 */
function compareRequests(a: ReactionRequest, b: ReactionRequest): number {
  if (a.beatMs !== b.beatMs) return a.beatMs - b.beatMs;
  if (a.order !== b.order) return a.order - b.order;
  if (a.entityId !== b.entityId) return a.entityId < b.entityId ? -1 : 1;
  const deathA = isDeathReaction(a.kind);
  const deathB = isDeathReaction(b.kind);
  return deathA === deathB ? 0 : deathA ? 1 : -1;
}

/** Where a request lands given everything already placed before it. */
function placeAfter(
  placed: readonly ScheduledReaction[],
  request: ReactionRequest,
): ScheduledReaction {
  let startMs = request.beatMs;
  for (const other of placed) {
    if (other.entityId === request.entityId) {
      // One body, one reaction at a time: the collapse waits for the
      // flinch that earned it.
      startMs = Math.max(startMs, other.endMs);
    } else if (other.beatMs === request.beatMs && precedes(other, request)) {
      startMs = Math.max(startMs, other.startMs + REACTION_STAGGER_MS);
    }
  }
  return {
    ...request,
    startMs,
    endMs: startMs + reactionDurationMs(request.kind),
  };
}

/** A re-timed queue, and where the reaction that caused it landed. */
export interface ReactionSchedule {
  readonly queue: readonly ScheduledReaction[];
  readonly scheduled: ScheduledReaction;
}

/**
 * Add a reaction to the queue, returning the whole re-timed queue.
 * Reactions already under way are fixed points — they keep their start
 * and still constrain what follows — and everything from this instant
 * on is re-placed in beat-then-initiative order, so a request that
 * arrives out of order takes its rightful place rather than the end of
 * the line. Two blows resolved in the same tick therefore still sort
 * themselves out, however they arrived.
 */
export function scheduleReaction(
  queue: readonly ScheduledReaction[],
  request: ReactionRequest,
  nowMs: number,
): ReactionSchedule {
  const pending: ReactionRequest[] = [
    ...queue.filter((r) => r.startMs >= nowMs),
    request,
  ];
  pending.sort(compareRequests);
  const out = queue.filter((r) => r.startMs < nowMs);
  let scheduled: ScheduledReaction | null = null;
  for (const next of pending) {
    const placed = placeAfter(out, next);
    out.push(placed);
    if (next === request) scheduled = placed;
  }
  return { queue: out, scheduled: scheduled as ScheduledReaction };
}

/**
 * The latest beat already queued for an entity, or null when nothing
 * has landed on it. A death answers the beat that killed it, so the
 * collapse follows the flinch instead of racing it.
 */
export function latestBeatFor(
  queue: readonly ScheduledReaction[],
  entityId: string,
): number | null {
  let latest: number | null = null;
  for (const r of queue) {
    if (r.entityId !== entityId) continue;
    if (latest === null || r.beatMs > latest) latest = r.beatMs;
  }
  return latest;
}

/**
 * Drop reactions that are over and leave nothing behind. Deaths are
 * kept forever: their heap is what the tile looks like now.
 */
export function pruneReactions(
  queue: readonly ScheduledReaction[],
  nowMs: number,
): ScheduledReaction[] {
  return queue.filter((r) => r.endMs > nowMs || isDeathReaction(r.kind));
}

/**
 * The reaction an entity is showing at `nowMs`, or null when it is at
 * rest. The most recently started one wins, so a fresh flinch replaces
 * a stale one rather than being drawn under it.
 */
export function activeReaction(
  queue: readonly ScheduledReaction[],
  entityId: string,
  nowMs: number,
): ScheduledReaction | null {
  let best: ScheduledReaction | null = null;
  for (const r of queue) {
    if (r.entityId !== entityId || r.startMs > nowMs) continue;
    if (nowMs >= r.endMs && !isDeathReaction(r.kind)) continue;
    if (!best || r.startMs > best.startMs) best = r;
  }
  return best;
}

/** The pose an active reaction resolves to at `nowMs`. */
export function reactionPoseAt(
  reaction: ScheduledReaction,
  nowMs: number,
): ReactionPose {
  return {
    kind: reaction.kind,
    awayX: reaction.awayX,
    elapsedMs: Math.max(0, nowMs - reaction.startMs),
  };
}
