import { describe, expect, it } from "vitest";
import {
  DOOR_CUT,
  DOOR_TIMING,
  TRANSITION_CUT,
  TRANSITION_TIMING,
  coverAlpha,
  destinationShown,
  doorCycleMs,
  doorFrameIndex,
  doorOpen01,
  doorTiming,
  transitionDurationMs,
  transitionPhaseAt,
  transitionSwapMs,
  transitionTiming,
  type TransitionPhase,
} from "./transition";

describe("door envelope", () => {
  it("runs shut → open → held → shut across the cycle", () => {
    const t = DOOR_TIMING;
    expect(doorOpen01(-10, t)).toBe(0);
    expect(doorOpen01(0, t)).toBe(0);
    expect(doorOpen01(t.openMs / 2, t)).toBeCloseTo(0.5, 9);
    expect(doorOpen01(t.openMs, t)).toBe(1);
    expect(doorOpen01(t.openMs + t.holdMs - 1, t)).toBe(1);
    expect(doorOpen01(t.openMs + t.holdMs + t.closeMs / 2, t)).toBeCloseTo(0.5, 9);
    expect(doorOpen01(doorCycleMs(t), t)).toBe(0);
    expect(doorOpen01(doorCycleMs(t) + 500, t)).toBe(0);
  });

  it("opens monotonically and shuts monotonically, never past the ends", () => {
    const t = DOOR_TIMING;
    let previous = 0;
    for (let ms = 0; ms <= t.openMs; ms += 10) {
      const open = doorOpen01(ms, t);
      expect(open).toBeGreaterThanOrEqual(previous);
      expect(open).toBeLessThanOrEqual(1);
      previous = open;
    }
    previous = 1;
    for (let ms = t.openMs + t.holdMs; ms <= doorCycleMs(t); ms += 10) {
      const open = doorOpen01(ms, t);
      expect(open).toBeLessThanOrEqual(previous);
      expect(open).toBeGreaterThanOrEqual(0);
      previous = open;
    }
  });

  it("reduced motion leaves no cycle to play at all", () => {
    expect(doorTiming(true)).toEqual(DOOR_CUT);
    expect(doorCycleMs(DOOR_CUT)).toBe(0);
    for (const ms of [0, 1, 100, 5000]) {
      expect(doorOpen01(ms, DOOR_CUT)).toBe(0);
    }
    expect(doorTiming(false)).toEqual(DOOR_TIMING);
  });

  it("picks the shut frame at 0 and the open frame at 1", () => {
    expect(doorFrameIndex(0, 5)).toBe(0);
    expect(doorFrameIndex(1, 5)).toBe(4);
    expect(doorFrameIndex(0.5, 5)).toBe(2);
    // Out-of-range progress clamps rather than indexing past the strip.
    expect(doorFrameIndex(-3, 5)).toBe(0);
    expect(doorFrameIndex(9, 5)).toBe(4);
    expect(doorFrameIndex(0.7, 1)).toBe(0);
  });

  it("never picks a frame outside a strip of any size", () => {
    for (const count of [1, 2, 3, 5, 8]) {
      for (let step = 0; step <= 20; step++) {
        const index = doorFrameIndex(step / 20, count);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(count);
      }
    }
  });
});

describe("transition timing", () => {
  it("drops the door beat when nothing openable led here", () => {
    expect(transitionTiming({ door: true })).toEqual(TRANSITION_TIMING);
    expect(transitionTiming({ door: false }).doorMs).toBe(0);
    expect(transitionTiming({}).doorMs).toBe(0);
    // Everything else about the sequence is unchanged by the door.
    const { doorMs: _skip, ...rest } = TRANSITION_TIMING;
    expect(transitionTiming({ door: false })).toMatchObject(rest);
  });

  it("reduced motion is a cut that still names the destination", () => {
    const t = transitionTiming({ reducedMotion: true, door: true });
    expect(t).toEqual(TRANSITION_CUT);
    expect(t.dim).toBe(0);
    expect(t.doorMs + t.coverMs + t.revealMs).toBe(0);
    // The swap is immediate...
    expect(transitionSwapMs(t)).toBe(0);
    expect(transitionPhaseAt(0, t)).toBe("hold");
    // ...and nothing ever darkens, at any point in the sequence.
    for (let ms = 0; ms <= transitionDurationMs(t); ms += 25) {
      expect(coverAlpha(ms, t)).toBe(0);
    }
    // The name is still held long enough to read.
    expect(destinationShown(0, t)).toBe(true);
    expect(t.holdMs).toBeGreaterThanOrEqual(600);
  });
});

describe("transition phases", () => {
  const t = TRANSITION_TIMING;
  const swap = transitionSwapMs(t);

  it("walks door → cover → hold → reveal → done in order", () => {
    const seen: TransitionPhase[] = [];
    for (let ms = 0; ms <= transitionDurationMs(t) + 50; ms += 5) {
      const phase = transitionPhaseAt(ms, t);
      if (seen[seen.length - 1] !== phase) seen.push(phase);
    }
    expect(seen).toEqual(["door", "cover", "hold", "reveal", "done"]);
  });

  it("swaps the map exactly when the cover is at full strength", () => {
    expect(swap).toBe(t.doorMs + t.coverMs);
    expect(transitionPhaseAt(swap - 1, t)).toBe("cover");
    expect(transitionPhaseAt(swap, t)).toBe("hold");
    expect(coverAlpha(swap, t)).toBe(t.dim);
    // Nothing of the old map is visible at the moment it is replaced.
    expect(coverAlpha(swap + t.holdMs - 1, t)).toBe(t.dim);
  });

  it("holds the door fully open through the cover, then swaps behind it", () => {
    // The door beat is the door's own opening ramp, so by the time the
    // screen starts to darken the door is wide open.
    expect(t.doorMs).toBe(DOOR_TIMING.openMs);
    expect(doorOpen01(t.doorMs, DOOR_TIMING)).toBe(1);
  });

  it("leaves the screen clear at both ends and fully covered in between", () => {
    expect(coverAlpha(0, t)).toBe(0);
    expect(coverAlpha(t.doorMs, t)).toBe(0);
    expect(coverAlpha(transitionDurationMs(t), t)).toBe(0);
    expect(coverAlpha(transitionDurationMs(t) + 1000, t)).toBe(0);
  });

  it("fades the cover up and back down without ever overshooting", () => {
    let previous = 0;
    for (let ms = t.doorMs; ms <= swap; ms += 5) {
      const alpha = coverAlpha(ms, t);
      expect(alpha).toBeGreaterThanOrEqual(previous);
      expect(alpha).toBeLessThanOrEqual(t.dim);
      previous = alpha;
    }
    previous = t.dim;
    for (let ms = swap + t.holdMs; ms <= transitionDurationMs(t); ms += 5) {
      const alpha = coverAlpha(ms, t);
      expect(alpha).toBeLessThanOrEqual(previous);
      expect(alpha).toBeGreaterThanOrEqual(0);
      previous = alpha;
    }
  });

  it("shows the destination's name only while the screen is covered", () => {
    for (let ms = 0; ms <= transitionDurationMs(t) + 50; ms += 5) {
      const shown = destinationShown(ms, t);
      expect(shown).toBe(transitionPhaseAt(ms, t) === "hold");
      if (shown) expect(coverAlpha(ms, t)).toBe(t.dim);
    }
  });

  it("stays brief — a transition is a beat, not a loading screen", () => {
    expect(transitionDurationMs(TRANSITION_TIMING)).toBeLessThanOrEqual(1400);
  });
});
