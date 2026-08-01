import { describe, expect, it } from "vitest";
import {
  CUE_MERGE_MS,
  MAX_PENDING_CUES,
  NO_CUES,
  STALE_CUE_MS,
  collectDueCues,
  createCueScheduler,
  queueCue,
  queueCues,
  type CueQueue,
} from "./cues";
import type { SoundEventId } from "../data/sfx";
import {
  NO_PAUSES,
  advancePauses,
  insertPause,
  type PauseTimeline,
} from "../iso/cameraFeel";

const SWING: SoundEventId = "combat.attack.blade";
const IMPACT: SoundEventId = "combat.impact.heavy";
const THUMP: SoundEventId = "combat.hitpause.thump";

function at(event: SoundEventId, atMs: number) {
  return { event, atMs };
}

/** The events a drain produced, in order. */
function drain(queue: CueQueue, sceneMs: number): SoundEventId[] {
  return collectDueCues(queue, sceneMs).due.map((cue) => cue.event);
}

describe("the cue queue", () => {
  it("holds cues until their beat, then hands them over in beat order", () => {
    const queue = queueCues(NO_CUES, [
      at(IMPACT, 200),
      at(SWING, 0),
      at(THUMP, 200),
    ]);
    expect(queue.pending.map((cue) => cue.atMs)).toEqual([0, 200, 200]);
    expect(drain(queue, -1)).toEqual([]);
    expect(drain(queue, 0)).toEqual([SWING]);
    expect(drain(queue, 199)).toEqual([SWING]);
    // Same beat, insertion order: the blow before the freeze it causes.
    expect(drain(queue, 200)).toEqual([SWING, IMPACT, THUMP]);
  });

  it("takes drained cues out of the queue and leaves the rest", () => {
    const queue = queueCues(NO_CUES, [at(SWING, 0), at(IMPACT, 200)]);
    const first = collectDueCues(queue, 10);
    expect(first.due.map((c) => c.event)).toEqual([SWING]);
    expect(first.queue.pending).toEqual([at(IMPACT, 200)]);
    const second = collectDueCues(first.queue, 200);
    expect(second.due.map((c) => c.event)).toEqual([IMPACT]);
    expect(second.queue.pending).toEqual([]);
  });

  it("is pure — draining never mutates what it was given", () => {
    const queue = queueCues(NO_CUES, [at(SWING, 0), at(IMPACT, 200)]);
    const before = JSON.stringify(queue);
    collectDueCues(queue, 500);
    collectDueCues(queue, 500);
    expect(JSON.stringify(queue)).toBe(before);
    // And the same reading always gives the same answer.
    expect(drain(queue, 500)).toEqual(drain(queue, 500));
  });

  it("returns the queue itself when nothing is due", () => {
    const queue = queueCue(NO_CUES, at(SWING, 100));
    expect(collectDueCues(queue, 50).queue).toBe(queue);
  });

  it("collapses the same event landing on one beat", () => {
    // A blast catching four bodies is one impact, not four stacked.
    let queue = NO_CUES;
    for (let i = 0; i < 4; i++) queue = queueCue(queue, at(IMPACT, 200 + i));
    expect(queue.pending).toHaveLength(1);
    // Far enough apart to be heard as separate hits, and they are.
    queue = queueCue(queue, at(IMPACT, 200 + CUE_MERGE_MS + 1));
    expect(queue.pending).toHaveLength(2);
    // Different events on one beat never collapse into each other.
    queue = queueCue(queue, at(SWING, 200));
    expect(queue.pending).toHaveLength(3);
  });

  it("drops cues staler than the tail it is willing to play", () => {
    const queue = queueCues(NO_CUES, [at(SWING, 0), at(IMPACT, 1000)]);
    // A backgrounded tab: the clock jumps past both.
    const drained = collectDueCues(queue, 1000 + STALE_CUE_MS + 1);
    expect(drained.due.map((c) => c.event)).toEqual([]);
    expect(drained.dropped.map((c) => c.event)).toEqual([SWING, IMPACT]);
    expect(drained.queue.pending).toEqual([]);
    // Just inside the tail is still played, not dropped.
    expect(drain(queueCue(NO_CUES, at(SWING, 0)), STALE_CUE_MS)).toEqual([
      SWING,
    ]);
  });

  it("never grows past its backstop, keeping the newest", () => {
    let queue = NO_CUES;
    for (let i = 0; i < MAX_PENDING_CUES + 20; i++) {
      // Spaced past the merge window so none of them collapse.
      queue = queueCue(queue, at(SWING, i * (CUE_MERGE_MS + 1)));
    }
    expect(queue.pending).toHaveLength(MAX_PENDING_CUES);
    const last = queue.pending[queue.pending.length - 1];
    expect(last?.atMs).toBe(
      (MAX_PENDING_CUES + 19) * (CUE_MERGE_MS + 1),
    );
  });
});

describe("the cue scheduler", () => {
  it("plays each cue once, on the beat, through the ear it was given", () => {
    const heard: SoundEventId[] = [];
    const scheduler = createCueScheduler((event) => heard.push(event));
    scheduler.at(SWING, 0);
    scheduler.at(IMPACT, 120);
    scheduler.advance(0);
    expect(heard).toEqual([SWING]);
    scheduler.advance(60);
    expect(heard).toEqual([SWING]);
    scheduler.advance(120);
    expect(heard).toEqual([SWING, IMPACT]);
    // Advancing again replays nothing.
    scheduler.advance(500);
    expect(heard).toEqual([SWING, IMPACT]);
    expect(scheduler.pending()).toEqual([]);
  });

  it("forgets everything waiting when it is cleared", () => {
    const heard: SoundEventId[] = [];
    const scheduler = createCueScheduler((event) => heard.push(event));
    scheduler.at(IMPACT, 100);
    scheduler.clear();
    scheduler.advance(1000);
    expect(heard).toEqual([]);
  });
});

// --- Sync with the scene clock -----------------------------------------
//
// The arithmetic that matters: cues are placed on scene time, the scene
// clock is raw time with every served hit-pause taken out of it, and the
// two have to agree at every frame. These drive the real pure functions
// from ../iso/cameraFeel against the real queue — no scene, no canvas.

describe("hit-pause sync", () => {
  /** Runs raw frames through the pause timeline, draining as it goes. */
  function play(
    cues: ReadonlyArray<{ event: SoundEventId; atMs: number }>,
    pauses: PauseTimeline,
    rawFrames: readonly number[],
  ): Array<{ rawMs: number; event: SoundEventId }> {
    let queue = queueCues(NO_CUES, cues);
    let timeline = pauses;
    const heard: Array<{ rawMs: number; event: SoundEventId }> = [];
    for (const rawMs of rawFrames) {
      const advanced = advancePauses(timeline, rawMs);
      timeline = advanced.timeline;
      const drained = collectDueCues(queue, advanced.sceneMs);
      queue = drained.queue;
      for (const cue of drained.due) heard.push({ rawMs, event: cue.event });
    }
    return heard;
  }

  const frames = Array.from({ length: 60 }, (_, i) => i * 10);

  it("plays a cue at its beat when nothing is holding the clock", () => {
    const heard = play([at(IMPACT, 200)], NO_PAUSES, frames);
    expect(heard).toEqual([{ rawMs: 200, event: IMPACT }]);
  });

  it("holds a cue behind the beat by exactly the freeze it sits in", () => {
    // A 100ms freeze on the beat the blow lands: the impact still plays
    // on the beat, and everything after it slides by the whole freeze.
    const pauses = insertPause(NO_PAUSES, 200, 100, 0);
    const heard = play([at(IMPACT, 200), at(SWING, 260)], pauses, frames);
    expect(heard).toEqual([
      // The freeze starts *at* 200, so the beat itself is not swallowed.
      { rawMs: 200, event: IMPACT },
      // 60ms after the beat, plus the 100ms the clock did not advance.
      { rawMs: 360, event: SWING },
    ]);
  });

  it("keeps two cues the same distance apart across a freeze", () => {
    const gapMs = 80;
    const withPause = play(
      [at(IMPACT, 200), at(SWING, 200 + gapMs)],
      insertPause(NO_PAUSES, 200, 100, 0),
      frames,
    );
    const withoutPause = play(
      [at(IMPACT, 200), at(SWING, 200 + gapMs)],
      NO_PAUSES,
      frames,
    );
    // In scene time the gap is unchanged; in raw time it is the gap plus
    // the freeze. Both are the point: the fight's rhythm survives, and
    // the player really did wait longer.
    const rawGap = (heard: Array<{ rawMs: number }>) =>
      (heard[1]?.rawMs ?? 0) - (heard[0]?.rawMs ?? 0);
    expect(rawGap(withoutPause)).toBe(gapMs);
    expect(rawGap(withPause)).toBe(gapMs + 100);
    expect(withPause.map((h) => h.event)).toEqual(
      withoutPause.map((h) => h.event),
    );
  });

  it("survives several freezes in one exchange, in order", () => {
    let pauses = insertPause(NO_PAUSES, 100, 50, 0);
    pauses = insertPause(pauses, 200, 70, 0);
    const heard = play(
      [at(IMPACT, 100), at(THUMP, 100), at(SWING, 300)],
      pauses,
      frames,
    );
    expect(heard.map((h) => h.event)).toEqual([IMPACT, THUMP, SWING]);
    expect(heard[0]?.rawMs).toBe(100);
    // 300 in scene time, after 50 + 70 of held clock.
    expect(heard[2]?.rawMs).toBe(420);
  });

  it("never plays a cue before its beat, however the clock is read", () => {
    const pauses = insertPause(NO_PAUSES, 150, 120, 0);
    let timeline = pauses;
    let queue = queueCue(NO_CUES, at(IMPACT, 400));
    for (const rawMs of frames) {
      const advanced = advancePauses(timeline, rawMs);
      timeline = advanced.timeline;
      const drained = collectDueCues(queue, advanced.sceneMs);
      queue = drained.queue;
      for (const cue of drained.due) {
        // Scene time at the frame it played on is never behind the beat.
        expect(advanced.sceneMs).toBeGreaterThanOrEqual(cue.atMs);
      }
    }
  });
});
