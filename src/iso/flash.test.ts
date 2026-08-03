import { describe, expect, it } from "vitest";
import { flickerOn, hash2 } from "./animation";
import {
  MAX_FLASHES_PER_SECOND,
  MIN_FLASH_GAP_MS,
  flashesPerSecond,
} from "./flash";
import {
  STATIC_FLICKER_PERIOD_MS,
  staticFlickerFrame,
} from "./status";

/**
 * The flash budget, measured on the two things in the game that
 * actually flash: the neon dropouts on the street, and the tear through
 * a portrait carrying a screaming Static band.
 *
 * WCAG 2.3.1 is the one guideline here whose failure mode is a seizure,
 * so it is arithmetic rather than judgement — and before this pass both
 * signals were over it. The neon rolled per 90ms slot and could stack
 * dropouts back to back: six flashes a second on the worst seed. The
 * portrait cut four times inside the first second of its cycle.
 */

describe("flashesPerSecond", () => {
  it("counts a lit-to-dark transition as one flash, not two", () => {
    // On for 500ms, off for 500ms: one flash per second, not two.
    expect(flashesPerSecond((t) => t % 1000 < 500, 1000)).toBe(1);
  });

  it("finds the worst window rather than the average", () => {
    // Three dropouts crowded into the first 700ms of a four-second
    // cycle: the average is under one a second, the worst window is
    // three, and three is the number that matters.
    const cuts: readonly (readonly [number, number])[] = [
      [100, 150],
      [400, 450],
      [700, 750],
    ];
    const lit = (t: number): boolean =>
      !cuts.some(([from, to]) => t >= from && t < to);
    expect(flashesPerSecond(lit, 4000)).toBe(3);
  });

  it("counts nothing for something that never goes out", () => {
    expect(flashesPerSecond(() => true, 1000)).toBe(0);
  });

  it("refuses a nonsense period rather than looping forever", () => {
    expect(flashesPerSecond(() => true, 0)).toBe(0);
    expect(flashesPerSecond(() => true, 1000, 0)).toBe(0);
  });
});

describe("neon flicker sits inside the budget", () => {
  /**
   * Every seed a prop can draw. Seeds come from hash2 of a tile
   * coordinate, so "every seed" is not a set that can be enumerated —
   * what can be is a wide sample of the real ones, which is what a map
   * of a few thousand tiles produces.
   */
  const seeds = (): number[] => {
    const found: number[] = [];
    for (let x = 0; x < 64; x++) {
      for (let y = 0; y < 64; y++) found.push(hash2(x, y));
    }
    return found;
  };

  it("never flashes more than three times a second, on any tile", () => {
    // The pattern repeats with the hash, not with a short cycle, so
    // each seed is measured over a long span rather than one period.
    const worst = seeds().reduce((most, seed) => {
      const rate = flashesPerSecond(
        (t) => flickerOn(t, seed),
        MIN_FLASH_GAP_MS * 120,
        10,
      );
      return Math.max(most, rate);
    }, 0);
    expect(worst).toBeLessThanOrEqual(MAX_FLASHES_PER_SECOND);
  });

  it("still flickers — a budget met by never going out is no fix", () => {
    const anyDropout = seeds()
      .slice(0, 200)
      .some((seed) => {
        for (let t = 0; t < 20000; t += 10) {
          if (!flickerOn(t, seed)) return true;
        }
        return false;
      });
    expect(anyDropout).toBe(true);
  });

  it("is still deterministic, and still differs by seed", () => {
    for (const t of [0, 91, 400, 12345]) {
      expect(flickerOn(t, 7)).toBe(flickerOn(t, 7));
    }
    const a = Array.from({ length: 200 }, (_, i) => flickerOn(i * 30, 1));
    const b = Array.from({ length: 200 }, (_, i) => flickerOn(i * 30, 2));
    expect(a).not.toEqual(b);
  });

  it("is mostly on, so a sign reads as a sign", () => {
    let on = 0;
    const samples = 2000;
    for (let i = 0; i < samples; i++) if (flickerOn(i * 10, 7)) on++;
    expect(on / samples).toBeGreaterThan(0.8);
    expect(on / samples).toBeLessThan(1);
  });
});

describe("the Static portrait tear sits inside the budget", () => {
  it("never cuts more than three times in a second", () => {
    expect(
      flashesPerSecond(
        (t) => staticFlickerFrame(t) === 0,
        STATIC_FLICKER_PERIOD_MS,
        5,
      ),
    ).toBeLessThanOrEqual(MAX_FLASHES_PER_SECOND);
  });

  it("still tears, and still reads as interference rather than a pulse", () => {
    const frames = new Set<number>();
    for (let t = 0; t < STATIC_FLICKER_PERIOD_MS; t += 5) {
      frames.add(staticFlickerFrame(t));
    }
    // A clean face and both tear frames all appear in one cycle.
    expect([...frames].sort()).toEqual([0, 1, 2]);
  });

  it("holds a clean face under reduced motion, budget or no budget", () => {
    for (let t = 0; t < STATIC_FLICKER_PERIOD_MS; t += 5) {
      expect(staticFlickerFrame(t, true)).toBe(0);
    }
  });
});
