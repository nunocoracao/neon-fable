import { describe, expect, it } from "vitest";
import {
  DEATH_REACTION_KINDS,
  HIT_REACTION_KINDS,
  REACTION_KINDS,
  REACTION_STAGGER_MS,
  REACTION_TIMING,
  activeReaction,
  isDeathReaction,
  latestBeatFor,
  pruneReactions,
  reactionDurationMs,
  reactionFrameAt,
  reactionFrameCount,
  reactionPoseAt,
  reactionSequence,
  scheduleReaction,
  type ReactionKind,
  type ReactionRequest,
  type ScheduledReaction,
} from "./reaction";

/**
 * The receiving-end timing model and its sequencer. Nothing here paints:
 * what is under test is that every reaction has a real sequence, that a
 * heap never gets up, and that reactions landing on one beat play in
 * initiative order however they arrived.
 */

/** A request with the fields a test rarely cares about filled in. */
function request(
  entityId: string,
  kind: ReactionKind,
  beatMs: number,
  order = 0,
): ReactionRequest {
  return { entityId, kind, beatMs, order, awayX: 1 };
}

/** Queue several requests in the given arrival order, all at nowMs 0. */
function queueAll(
  requests: readonly ReactionRequest[],
  nowMs = 0,
): readonly ScheduledReaction[] {
  let queue: readonly ScheduledReaction[] = [];
  for (const r of requests) queue = scheduleReaction(queue, r, nowMs).queue;
  return queue;
}

/** Start times keyed by entity id, for readable assertions. */
function startsById(
  queue: readonly ScheduledReaction[],
): Record<string, number> {
  return Object.fromEntries(queue.map((r) => [r.entityId, r.startMs]));
}

describe("authored reactions", () => {
  it("gives every reaction a real sequence", () => {
    for (const kind of REACTION_KINDS) {
      const timing = REACTION_TIMING[kind];
      expect(timing.frameMs.length, `${kind} frames`).toBeGreaterThanOrEqual(2);
      for (const ms of timing.frameMs) {
        expect(ms, `${kind} hold`).toBeGreaterThan(0);
      }
      const sequence = reactionSequence(kind);
      expect(sequence.frames.length).toBe(reactionFrameCount(kind));
      expect(sequence.durationMs).toBe(
        timing.frameMs.reduce((a, b) => a + b, 0),
      );
      expect(sequence.restingFrame).toBe(reactionFrameCount(kind) - 1);
      // Frame windows tile the sequence with no gap and no overlap.
      let cursor = 0;
      for (const frame of sequence.frames) {
        expect(frame.startMs, `${kind} f${frame.index}`).toBe(cursor);
        cursor = frame.endMs;
      }
      expect(cursor).toBe(sequence.durationMs);
    }
  });

  it("gets up from a hit and never from a death", () => {
    for (const kind of HIT_REACTION_KINDS) {
      expect(isDeathReaction(kind), kind).toBe(false);
    }
    for (const kind of DEATH_REACTION_KINDS) {
      expect(isDeathReaction(kind), kind).toBe(true);
    }
  });

  it("takes an armored blow more lightly than a solid one", () => {
    expect(reactionDurationMs("shudder")).toBeLessThan(
      reactionDurationMs("flinch"),
    );
  });

  it("plays a hit's frames in order, then hands back to the loops", () => {
    for (const kind of HIT_REACTION_KINDS) {
      const duration = reactionDurationMs(kind);
      const played: number[] = [];
      for (let t = 0; t < duration; t += 5) {
        const frame = reactionFrameAt(kind, t);
        expect(frame, `${kind} @${t}`).not.toBeNull();
        if (frame !== null && played[played.length - 1] !== frame) {
          played.push(frame);
        }
      }
      expect(played).toEqual(
        Array.from({ length: reactionFrameCount(kind) }, (_, i) => i),
      );
      expect(reactionFrameAt(kind, duration), `${kind} over`).toBeNull();
      expect(reactionFrameAt(kind, -1)).toBeNull();
      expect(reactionFrameAt(kind, Number.NaN)).toBeNull();
    }
  });

  it("leaves a death on its last frame forever — the heap stays", () => {
    for (const kind of DEATH_REACTION_KINDS) {
      const duration = reactionDurationMs(kind);
      const heap = reactionFrameCount(kind) - 1;
      expect(reactionFrameAt(kind, duration - 1), `${kind} falling`).toBe(heap);
      expect(reactionFrameAt(kind, duration)).toBe(heap);
      expect(reactionFrameAt(kind, duration + 600_000)).toBe(heap);
    }
  });
});

describe("the reaction queue", () => {
  it("plays a lone reaction on the beat it answers", () => {
    const { scheduled } = scheduleReaction([], request("a", "flinch", 500), 0);
    expect(scheduled.startMs).toBe(500);
    expect(scheduled.endMs).toBe(500 + reactionDurationMs("flinch"));
  });

  it("staggers one beat's reactions in initiative order", () => {
    const queue = queueAll([
      request("first", "flinch", 400, 0),
      request("second", "flinch", 400, 1),
      request("third", "shudder", 400, 2),
    ]);
    expect(startsById(queue)).toEqual({
      first: 400,
      second: 400 + REACTION_STAGGER_MS,
      third: 400 + REACTION_STAGGER_MS * 2,
    });
  });

  it("puts a late arrival in its initiative place, not at the back", () => {
    // The slowest combatant's reaction is queued first; the fastest
    // one's arrives after it and still goes first.
    const queue = queueAll([
      request("slow", "flinch", 400, 5),
      request("fast", "flinch", 400, 1),
    ]);
    expect(startsById(queue)).toEqual({
      fast: 400,
      slow: 400 + REACTION_STAGGER_MS,
    });
  });

  it("schedules the same reactions identically whatever order they arrive in", () => {
    const requests = [
      request("a", "flinch", 400, 2),
      request("b", "shudder", 400, 0),
      request("c", "flinch", 900, 1),
    ];
    const forwards = startsById(queueAll(requests));
    const backwards = startsById(queueAll([...requests].reverse()));
    expect(backwards).toEqual(forwards);
  });

  it("never plays two reactions on one body at once", () => {
    const queue = queueAll([
      request("a", "flinch", 400),
      request("a", "flinch", 400),
    ]);
    const [first, second] = [...queue].sort((x, y) => x.startMs - y.startMs);
    expect(first?.startMs).toBe(400);
    expect(second?.startMs).toBe(first?.endMs);
  });

  it("lands the collapse after the flinch that earned it", () => {
    // The killing blow's flinch is queued against the impact beat; the
    // death that follows answers the same beat.
    let queue = scheduleReaction([], request("a", "flinch", 400), 0).queue;
    const beat = latestBeatFor(queue, "a");
    expect(beat).toBe(400);
    const { scheduled } = scheduleReaction(
      queue,
      request("a", "collapse", beat ?? 0),
      0,
    );
    expect(scheduled.startMs).toBe(400 + reactionDurationMs("flinch"));
    queue = scheduleReaction(queue, request("a", "collapse", beat ?? 0), 0).queue;
    // And the flinch it followed is still where it was.
    expect(queue.find((r) => r.kind === "flinch")?.startMs).toBe(400);
  });

  it("leaves reactions that have already begun exactly where they are", () => {
    const started = scheduleReaction([], request("a", "flinch", 100), 0).queue;
    // A blow on a second combatant arrives while the first is playing.
    const later = scheduleReaction(started, request("b", "flinch", 100), 150);
    expect(later.queue.find((r) => r.entityId === "a")?.startMs).toBe(100);
    // The one already playing still holds its place in the beat's order.
    expect(later.scheduled.startMs).toBe(100 + REACTION_STAGGER_MS);
  });

  it("has no beat queued for a combatant nothing has landed on", () => {
    expect(latestBeatFor([], "a")).toBeNull();
    const queue = queueAll([request("a", "flinch", 400)]);
    expect(latestBeatFor(queue, "b")).toBeNull();
  });
});

describe("what the scene reads back", () => {
  it("shows nothing for a combatant at rest, and before the beat lands", () => {
    const queue = queueAll([request("a", "flinch", 400)]);
    expect(activeReaction(queue, "b", 500)).toBeNull();
    expect(activeReaction(queue, "a", 399)).toBeNull();
    expect(activeReaction(queue, "a", 400)?.kind).toBe("flinch");
  });

  it("hands the newest reaction to a body hit twice", () => {
    const queue = queueAll([
      request("a", "shudder", 100),
      request("a", "flinch", 100),
    ]);
    const second = [...queue].sort((x, y) => y.startMs - x.startMs)[0];
    expect(activeReaction(queue, "a", (second?.startMs ?? 0) + 10)).toEqual(
      second,
    );
  });

  it("keeps handing back the heap long after the fall is over", () => {
    const queue = queueAll([request("a", "sparkout", 0)]);
    const late = reactionDurationMs("sparkout") + 100_000;
    const active = activeReaction(queue, "a", late);
    expect(active?.kind).toBe("sparkout");
    expect(reactionFrameAt("sparkout", reactionPoseAt(active!, late).elapsedMs)).toBe(
      reactionFrameCount("sparkout") - 1,
    );
  });

  it("poses a reaction from how far into it the clock is", () => {
    const queue = queueAll([request("a", "flinch", 400)]);
    const active = activeReaction(queue, "a", 450);
    expect(reactionPoseAt(active!, 450)).toEqual({
      kind: "flinch",
      awayX: 1,
      elapsedMs: 50,
    });
  });

  it("sweeps up finished hits and never sweeps up a death", () => {
    const queue = queueAll([
      request("a", "flinch", 0),
      request("b", "collapse", 0, 1),
    ]);
    const late = 10_000;
    const pruned = pruneReactions(queue, late);
    expect(pruned.map((r) => r.entityId)).toEqual(["b"]);
    // Pruning mid-flinch keeps it: it is still on screen.
    expect(pruneReactions(queue, 10).length).toBe(2);
  });
});
