import { describe, expect, it } from "vitest";
import {
  clamp01,
  dissolve01,
  dissolvedAt,
  facingFromDelta,
  flickerOn,
  frameAt,
  hash2,
  lunge01,
  pulse01,
  shakeOffsetPx,
  variantIndex,
  walkBobPx,
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

describe("clamp01 / walkBobPx", () => {
  it("clamps and bobs on passing frames", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(walkBobPx(0)).toBe(0);
    expect(walkBobPx(1)).toBe(1);
    expect(walkBobPx(2)).toBe(0);
    expect(walkBobPx(3)).toBe(1);
  });
});
