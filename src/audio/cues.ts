/**
 * The SFX cue timeline: sounds placed on a scene clock rather than
 * played the instant the code that caused them ran.
 *
 * ## Why combat sound cannot be fire-and-forget
 *
 * A fight is not resolved when it is heard. The engine settles a whole
 * exchange in one call — swing, flight, hit, death — and the scene then
 * *plays* it, spread across the beats the animation actually takes (see
 * ../iso/combatScene.ts). Playing the impact when the engine produced it
 * would put the sound of a rifle round on the frame the trigger was
 * pulled, a body's collapse before it started falling, and every blow of
 * a volley on one tick.
 *
 * Worse, the combat scene's clock deliberately *stops*: a hit-pause is a
 * stretch of raw time the scene clock does not advance through (see
 * ../iso/cameraFeel.ts). Anything scheduled in wall time drifts out of
 * the fight the moment one lands.
 *
 * So cues are queued against the same scene clock every swing, flinch
 * and floating figure already rides, and drained as it advances. A
 * freeze holds the sound with the picture, and the fight resumes in
 * step. Same cues and same clock readings, same sounds in the same
 * order, every time — which is what makes it testable without an
 * AudioContext, exactly as the music sequencer is.
 */
import type { SoundEventId } from "../data/sfx";

/** One sound, waiting on a beat. */
export interface SoundCue {
  readonly event: SoundEventId;
  /** Scene-clock ms it is due on. */
  readonly atMs: number;
}

/** Cues not yet played, ascending by beat. */
export interface CueQueue {
  readonly pending: readonly SoundCue[];
}

/** Nothing waiting. */
export const NO_CUES: CueQueue = { pending: [] };

/**
 * How far behind the clock a cue may fall and still be played. A
 * backgrounded tab starves the frame loop; when it comes back the queue
 * is full of beats that went by while nothing was drawn. Playing them
 * would be a burst of noise describing a fight the player did not see,
 * so anything staler than this is dropped — the same choice the music
 * scheduler makes when it rejoins the grid rather than flushing.
 */
export const STALE_CUE_MS = 250;

/**
 * Most cues a queue will hold. A fight schedules a handful per action;
 * this is a backstop against a leak, never a budget anything real hits.
 * The oldest go first — the newest cues describe what is on screen now.
 */
export const MAX_PENDING_CUES = 64;

/**
 * How close two cues of the *same* event have to be before the second
 * is dropped. A blast that catches four bodies produces four identical
 * impacts on one beat; played, that is not four hits, it is one hit at
 * four times the gain — the exact spike the loudness bands exist to
 * prevent. One voice per event per beat, and a volley authored at 45ms
 * a shot still reads as three.
 */
export const CUE_MERGE_MS = 24;

/**
 * Place one cue, unless the same event is already within CUE_MERGE_MS
 * of that beat. Insertion is stable: two different cues on the same
 * beat play in the order they were queued, so a swing queued before the
 * impact it causes is still heard first when both land on one frame.
 */
export function queueCue(queue: CueQueue, cue: SoundCue): CueQueue {
  for (const existing of queue.pending) {
    if (
      existing.event === cue.event &&
      Math.abs(existing.atMs - cue.atMs) <= CUE_MERGE_MS
    ) {
      return queue;
    }
  }
  const pending = [...queue.pending];
  let index = pending.length;
  while (index > 0 && (pending[index - 1] as SoundCue).atMs > cue.atMs) {
    index--;
  }
  pending.splice(index, 0, cue);
  return {
    pending:
      pending.length > MAX_PENDING_CUES
        ? pending.slice(pending.length - MAX_PENDING_CUES)
        : pending,
  };
}

/** Place several cues, in order. */
export function queueCues(
  queue: CueQueue,
  cues: readonly SoundCue[],
): CueQueue {
  let next = queue;
  for (const cue of cues) next = queueCue(next, cue);
  return next;
}

/** What one drain of the queue produced. */
export interface DueCues {
  readonly queue: CueQueue;
  /** To play now, in beat order. */
  readonly due: readonly SoundCue[];
  /** Passed over for being staler than STALE_CUE_MS. */
  readonly dropped: readonly SoundCue[];
}

/**
 * Every cue due at or before `sceneMs`, and the queue with them taken
 * out. Pure: the same queue and the same clock reading always give the
 * same result, in the same order.
 */
export function collectDueCues(queue: CueQueue, sceneMs: number): DueCues {
  const due: SoundCue[] = [];
  const dropped: SoundCue[] = [];
  let index = 0;
  for (const cue of queue.pending) {
    if (cue.atMs > sceneMs) break;
    index++;
    if (sceneMs - cue.atMs > STALE_CUE_MS) dropped.push(cue);
    else due.push(cue);
  }
  if (index === 0) return { queue, due, dropped };
  return { queue: { pending: queue.pending.slice(index) }, due, dropped };
}

/** The stateful half: a queue, a clock to drain it against, and an ear. */
export interface CueScheduler {
  /** Queue `event` for `atMs` on the scene clock. */
  at(event: SoundEventId, atMs: number): void;
  /**
   * Play everything due at `sceneMs`. Called once per frame with the
   * scene clock — which holds through a hit-pause, so the sounds do too.
   */
  advance(sceneMs: number): void;
  /** Forget everything waiting; nothing queued is heard. */
  clear(): void;
  /** What is still waiting, for tests. */
  pending(): readonly SoundCue[];
}

/**
 * A cue queue bound to an ear. The scene owns one of these and feeds it
 * its own clock; nothing else needs to know a queue exists.
 */
export function createCueScheduler(
  emit: (event: SoundEventId) => void,
): CueScheduler {
  let queue = NO_CUES;
  return {
    at(event: SoundEventId, atMs: number): void {
      queue = queueCue(queue, { event, atMs });
    },
    advance(sceneMs: number): void {
      const drained = collectDueCues(queue, sceneMs);
      queue = drained.queue;
      for (const cue of drained.due) emit(cue.event);
    },
    clear(): void {
      queue = NO_CUES;
    },
    pending: () => queue.pending,
  };
}
