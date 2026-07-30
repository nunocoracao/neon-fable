import { describe, expect, it } from "vitest";
import {
  BODY_TIMING,
  bodyFrameAt,
  clamp01,
  dissolve01,
  dissolvedAt,
  facingFromDelta,
  flickerOn,
  frameAt,
  hash2,
  lunge01,
  propFrameAt,
  pulse01,
  shakeOffsetPx,
  tilePhaseMs,
  variantIndex,
  smoothStep01,
} from "./animation";

describe("facingFromDelta", () => {
  it("maps the four axis moves to iso facings", () => {
    expect(facingFromDelta(1, 0)).toBe("e");
    expect(facingFromDelta(-1, 0)).toBe("w");
    expect(facingFromDelta(0, 1)).toBe("s");
    expect(facingFromDelta(0, -1)).toBe("n");
  });

  it("returns null for no movement", () => {
    expect(facingFromDelta(0, 0)).toBeNull();
  });

  it("favors the x axis on diagonals and handles fractions", () => {
    expect(facingFromDelta(0.7, 0.3)).toBe("e");
    expect(facingFromDelta(-0.5, 0.5)).toBe("w");
    expect(facingFromDelta(0.2, -0.6)).toBe("n");
  });
});

describe("frameAt", () => {
  it("advances one frame per duration and wraps", () => {
    expect(frameAt(0, 100, 4)).toBe(0);
    expect(frameAt(99, 100, 4)).toBe(0);
    expect(frameAt(100, 100, 4)).toBe(1);
    expect(frameAt(399, 100, 4)).toBe(3);
    expect(frameAt(400, 100, 4)).toBe(0);
  });

  it("is safe for degenerate inputs", () => {
    expect(frameAt(1234, 100, 1)).toBe(0);
    expect(frameAt(1234, 0, 4)).toBe(0);
    expect(frameAt(-50, 100, 4)).toBe(0);
  });
});

describe("propFrameAt", () => {
  /** A time inside a slot where the flicker at this seed is on/off. */
  function slotTime(x: number, y: number, on: boolean): number {
    for (let slot = 0; slot < 1000; slot++) {
      const t = slot * 90 + 45;
      if (flickerOn(t, hash2(x, y)) === on) return t;
    }
    throw new Error("no matching flicker slot found");
  }

  it("static props stay on frame 0", () => {
    expect(propFrameAt(1, 0, false, 0, 0, 12345)).toBe(0);
    expect(propFrameAt(3, 0, false, 0, 0, 12345)).toBe(0);
  });

  it("non-flicker loops cycle through every frame with a per-tile phase", () => {
    const phase = (hash2(2, 5) % 7) * 97;
    for (const t of [0, 150, 480, 999]) {
      expect(propFrameAt(3, 420, false, 2, 5, t)).toBe(
        frameAt(t + phase, 420, 3),
      );
    }
  });

  it("flicker props drop to the reserved last frame during dropouts", () => {
    expect(propFrameAt(4, 640, true, 1, 1, slotTime(1, 1, false))).toBe(3);
  });

  it("flicker props loop over all but the dropout frame while lit", () => {
    const t = slotTime(1, 1, true);
    const frame = propFrameAt(4, 640, true, 1, 1, t);
    expect(frame).toBeGreaterThanOrEqual(0);
    expect(frame).toBeLessThan(3);
    const phase = (hash2(1, 1) % 7) * 97;
    expect(frame).toBe(frameAt(t + phase, 640, 3));
  });
});

describe("pulse01", () => {
  it("rises to 1 at half period and returns to 0", () => {
    expect(pulse01(0, 1000)).toBe(0);
    expect(pulse01(250, 1000)).toBeCloseTo(0.5);
    expect(pulse01(500, 1000)).toBeCloseTo(1);
    expect(pulse01(750, 1000)).toBeCloseTo(0.5);
    expect(pulse01(1000, 1000)).toBeCloseTo(0);
  });

  it("stays in [0, 1] for negative times", () => {
    const v = pulse01(-125, 1000);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe("hash2 / variantIndex", () => {
  it("is deterministic", () => {
    expect(hash2(3, 7)).toBe(hash2(3, 7));
    expect(variantIndex(5, 9, 3)).toBe(variantIndex(5, 9, 3));
  });

  it("stays within the variant count and varies by coordinate", () => {
    const seen = new Set<number>();
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        const v = variantIndex(x, y, 3);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(3);
        seen.add(v);
      }
    }
    expect(seen.size).toBe(3);
  });

  it("returns 0 for single-variant sets", () => {
    expect(variantIndex(4, 2, 1)).toBe(0);
    expect(variantIndex(4, 2, 0)).toBe(0);
  });
});

describe("tilePhaseMs", () => {
  it("is deterministic and steps in half-frame multiples", () => {
    for (let x = 0; x < 6; x++) {
      for (let y = 0; y < 6; y++) {
        const phase = tilePhaseMs(x, y, 420);
        expect(phase).toBe(tilePhaseMs(x, y, 420));
        expect(phase % 210).toBe(0);
        expect(phase).toBeGreaterThanOrEqual(0);
        expect(phase).toBeLessThan(4 * 210);
      }
    }
  });

  it("puts neighboring tiles out of sync somewhere on every canal run", () => {
    // The shipped canal columns are 2-3 tiles wide; a run of identical
    // phases down a column would make the whole canal pulse as one.
    const phases = new Set<number>();
    for (let y = 1; y <= 3; y++) {
      phases.add(tilePhaseMs(10, y, 420));
      phases.add(tilePhaseMs(11, y, 420));
    }
    expect(phases.size).toBeGreaterThan(1);
  });
});

describe("flickerOn", () => {
  it("is deterministic and mostly on", () => {
    let on = 0;
    const slots = 200;
    for (let i = 0; i < slots; i++) {
      const a = flickerOn(i * 90, 7);
      expect(a).toBe(flickerOn(i * 90, 7));
      if (a) on++;
    }
    expect(on / slots).toBeGreaterThan(0.7);
    expect(on / slots).toBeLessThan(1);
  });

  it("differs by seed", () => {
    const patternA = Array.from({ length: 50 }, (_, i) => flickerOn(i * 90, 1));
    const patternB = Array.from({ length: 50 }, (_, i) => flickerOn(i * 90, 2));
    expect(patternA).not.toEqual(patternB);
  });
});

describe("lunge01", () => {
  it("peaks at the midpoint and is 0 outside the window", () => {
    expect(lunge01(-10, 200)).toBe(0);
    expect(lunge01(0, 200)).toBe(0);
    expect(lunge01(100, 200)).toBeCloseTo(1);
    expect(lunge01(50, 200)).toBeCloseTo(0.5);
    expect(lunge01(200, 200)).toBe(0);
    expect(lunge01(999, 200)).toBe(0);
  });
});

describe("shakeOffsetPx", () => {
  it("alternates sign, decays, and ends at 0", () => {
    const early = shakeOffsetPx(0, 300, 3);
    const flipped = shakeOffsetPx(40, 300, 3);
    expect(Math.sign(early)).not.toBe(Math.sign(flipped));
    expect(Math.abs(shakeOffsetPx(250, 300, 3))).toBeLessThan(Math.abs(early));
    expect(shakeOffsetPx(300, 300, 3)).toBe(0);
    expect(shakeOffsetPx(-1, 300, 3)).toBe(0);
  });
});

describe("dissolve01 / dissolvedAt", () => {
  it("clamps progress to [0, 1]", () => {
    expect(dissolve01(-5, 500)).toBe(0);
    expect(dissolve01(250, 500)).toBeCloseTo(0.5);
    expect(dissolve01(800, 500)).toBe(1);
    expect(dissolve01(100, 0)).toBe(1);
  });

  it("removes nothing at 0, everything at 1, monotonically", () => {
    for (let bx = 0; bx < 8; bx++) {
      for (let by = 0; by < 8; by++) {
        expect(dissolvedAt(0, bx, by)).toBe(false);
        expect(dissolvedAt(1, bx, by)).toBe(true);
        if (dissolvedAt(0.4, bx, by)) {
          expect(dissolvedAt(0.8, bx, by)).toBe(true);
        }
      }
    }
  });
});

describe("clamp01", () => {
  it("clamps into [0, 1]", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.25)).toBe(0.25);
    expect(clamp01(2)).toBe(1);
  });
});

describe("bodyFrameAt / BODY_TIMING", () => {
  it("gives the hi-res sets six walk and four idle frames", () => {
    expect(BODY_TIMING.walk.frameCount).toBe(6);
    expect(BODY_TIMING.idle.frameCount).toBe(4);
  });

  it("breathes at a slower cadence than it strides", () => {
    expect(BODY_TIMING.idle.frameMs).toBeGreaterThan(BODY_TIMING.walk.frameMs * 2);
  });

  it("advances through every walk frame in order and loops seamlessly", () => {
    const { frameMs, frameCount } = BODY_TIMING.walk;
    const seen = Array.from({ length: frameCount }, (_, i) =>
      bodyFrameAt("walk", i * frameMs),
    );
    expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
    const cycle = frameMs * frameCount;
    expect(bodyFrameAt("walk", cycle)).toBe(0);
    expect(bodyFrameAt("walk", cycle + 42)).toBe(bodyFrameAt("walk", 42));
  });

  it("loops the idle breath over its four frames", () => {
    const { frameMs, frameCount } = BODY_TIMING.idle;
    const seen = Array.from({ length: frameCount + 1 }, (_, i) =>
      bodyFrameAt("idle", i * frameMs),
    );
    expect(seen).toEqual([0, 1, 2, 3, 0]);
  });
});

describe("smoothStep01", () => {
  it("runs 0 to 1 across the unit interval and clamps outside it", () => {
    expect(smoothStep01(0)).toBe(0);
    expect(smoothStep01(1)).toBe(1);
    expect(smoothStep01(0.5)).toBeCloseTo(0.5, 10);
    expect(smoothStep01(-3)).toBe(0);
    expect(smoothStep01(7)).toBe(1);
  });

  it("eases at both ends and gathers through the middle", () => {
    const step = (from: number, to: number): number =>
      smoothStep01(to) - smoothStep01(from);
    expect(step(0.4, 0.6)).toBeGreaterThan(step(0, 0.2) * 1.5);
    expect(step(0.4, 0.6)).toBeGreaterThan(step(0.8, 1) * 1.5);
    // Symmetric about the midpoint: it settles exactly as it gathered.
    expect(step(0, 0.2)).toBeCloseTo(step(0.8, 1), 10);
  });

  it("never goes backwards", () => {
    let previous = -Infinity;
    for (let t = 0; t <= 1; t += 0.01) {
      const value = smoothStep01(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});
