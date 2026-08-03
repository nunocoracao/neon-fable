import { describe, expect, it } from "vitest";
import {
  RUNNING_CLOCK,
  clockHeld,
  holdClock,
  releaseClock,
  sceneTime,
  type SceneClock,
} from "./sceneClock";

describe("the scene clock", () => {
  it("reads the frame clock while it runs", () => {
    expect(sceneTime(RUNNING_CLOCK, 0)).toBe(0);
    expect(sceneTime(RUNNING_CLOCK, 1234)).toBe(1234);
    expect(clockHeld(RUNNING_CLOCK)).toBe(false);
  });

  it("reads the instant it was held at, however long the hold lasts", () => {
    const held = holdClock(RUNNING_CLOCK, 5_000);
    expect(clockHeld(held)).toBe(true);
    expect(sceneTime(held, 5_000)).toBe(5_000);
    expect(sceneTime(held, 5_016)).toBe(5_000);
    expect(sceneTime(held, 65_000)).toBe(5_000);
  });

  it("holding twice keeps the first instant", () => {
    const once = holdClock(RUNNING_CLOCK, 5_000);
    const twice = holdClock(once, 9_000);
    expect(twice).toBe(once);
    expect(sceneTime(twice, 9_000)).toBe(5_000);
  });

  it("resumes where it stopped rather than where the wall clock got to", () => {
    const held = holdClock(RUNNING_CLOCK, 5_000);
    // A minute spent framing a shot.
    const running = releaseClock(held, 65_000);
    expect(clockHeld(running)).toBe(false);
    expect(sceneTime(running, 65_000)).toBe(5_000);
    // And a frame later the city has advanced by exactly that frame.
    expect(sceneTime(running, 65_016)).toBe(5_016);
  });

  it("survives being held again, losing only what was held", () => {
    let clock: SceneClock = RUNNING_CLOCK;
    clock = holdClock(clock, 1_000);
    clock = releaseClock(clock, 4_000);
    clock = holdClock(clock, 5_000);
    clock = releaseClock(clock, 9_000);
    // 1s of scene time before the first hold, then 1s of running
    // between the two (4_000 → 5_000 frame time), then nothing.
    expect(sceneTime(clock, 9_000)).toBe(2_000);
    expect(sceneTime(clock, 9_500)).toBe(2_500);
  });

  it("releasing a running clock changes nothing", () => {
    expect(releaseClock(RUNNING_CLOCK, 900)).toBe(RUNNING_CLOCK);
  });

  it("never mutates the clock it is given", () => {
    const clock: SceneClock = { offset: 0, heldAt: null };
    holdClock(clock, 300);
    expect(clock).toEqual({ offset: 0, heldAt: null });
  });
});
