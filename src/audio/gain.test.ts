import { describe, expect, it } from "vitest";
import {
  FADER_MID,
  FADER_MID_DB,
  FADER_MIN_DB,
  clampFader,
  faderDb,
  faderGain,
  faderPercent,
  formatFader,
  gainToFader,
} from "./gain";

describe("clampFader", () => {
  it("holds positions inside [0,1] and collapses nonsense to off", () => {
    expect(clampFader(0.4)).toBe(0.4);
    expect(clampFader(1.5)).toBe(1);
    expect(clampFader(-2)).toBe(0);
    expect(clampFader(Number.NaN)).toBe(0);
    expect(clampFader(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("the fader law", () => {
  it("pins the three positions the curve is defined by", () => {
    expect(faderDb(1)).toBeCloseTo(0, 9);
    expect(faderDb(FADER_MID)).toBeCloseTo(FADER_MID_DB, 9);
    // The bottom of the travel is off, not the floor decibel — but the
    // curve approaches the floor as it gets there.
    expect(faderDb(0)).toBe(-Infinity);
    expect(faderDb(1e-6)).toBeCloseTo(FADER_MIN_DB, 3);
  });

  it("puts unity at the top and silence at the bottom", () => {
    expect(faderGain(1)).toBeCloseTo(1, 9);
    expect(faderGain(0)).toBe(0);
    expect(faderGain(-1)).toBe(0);
  });

  it("rises monotonically the whole way up", () => {
    let previous = -1;
    for (let step = 0; step <= 100; step++) {
      const gain = faderGain(step / 100);
      expect(gain, `step ${step}`).toBeGreaterThan(previous);
      expect(gain, `step ${step}`).toBeLessThanOrEqual(1);
      previous = gain;
    }
  });

  it("spends the top half of the travel on the last 12 dB", () => {
    // The point of the taper: fine control where a mix is actually set.
    // Half the fader covers 12 dB; the other half covers the other 48.
    const topSpan = faderDb(1) - faderDb(FADER_MID);
    const bottomSpan = faderDb(FADER_MID) - faderDb(0.001);
    expect(topSpan).toBeCloseTo(12, 6);
    expect(bottomSpan).toBeGreaterThan(40);
  });

  it("is linear in decibels within each segment", () => {
    // What "dB-ish" has to mean to feel right: equal fader movement is
    // equal loudness change, not equal amplitude change.
    expect(faderDb(0.75) - faderDb(0.625)).toBeCloseTo(
      faderDb(0.875) - faderDb(0.75),
      9,
    );
    expect(faderDb(0.2) - faderDb(0.1)).toBeCloseTo(
      faderDb(0.4) - faderDb(0.3),
      9,
    );
    // And a linear fader would not be: the same move near the top moves
    // amplitude far less than the same move near the bottom does in dB.
    expect(faderGain(1) - faderGain(0.9)).toBeLessThan(0.3);
  });
});

describe("gainToFader", () => {
  it("inverts faderGain across the whole travel", () => {
    for (let step = 0; step <= 100; step++) {
      const position = step / 100;
      expect(gainToFader(faderGain(position)), `step ${step}`).toBeCloseTo(
        position,
        9,
      );
    }
  });

  it("round-trips an amplitude back to itself", () => {
    for (const gain of [1, 0.9, 0.72, 0.5, 0.25, 0.1, 0.01, 0.002]) {
      expect(faderGain(gainToFader(gain)), String(gain)).toBeCloseTo(gain, 9);
    }
  });

  it("puts anything at or below the floor at the bottom of the fader", () => {
    expect(gainToFader(0)).toBe(0);
    expect(gainToFader(-1)).toBe(0);
    expect(gainToFader(Number.NaN)).toBe(0);
    // −60 dB and under: inaudible against anything, and the fader has
    // nowhere below off to put it.
    expect(gainToFader(10 ** (FADER_MIN_DB / 20))).toBe(0);
    expect(gainToFader(0.0000001)).toBe(0);
  });

  it("clamps anything above unity to the top", () => {
    expect(gainToFader(1)).toBe(1);
    expect(gainToFader(4)).toBe(1);
  });
});

describe("readouts", () => {
  it("reports the travel as whole percent", () => {
    expect(faderPercent(0)).toBe(0);
    expect(faderPercent(0.725)).toBe(73);
    expect(faderPercent(1)).toBe(100);
  });

  it("says off at the bottom and both numbers everywhere else", () => {
    expect(formatFader(0)).toBe("Off");
    expect(formatFader(1)).toBe("100% · 0.0 dB");
    expect(formatFader(FADER_MID)).toBe("50% · −12.0 dB");
    expect(formatFader(0.75)).toMatch(/^75% · −\d+\.\d dB$/);
  });
});
