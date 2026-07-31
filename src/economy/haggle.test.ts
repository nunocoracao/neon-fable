import { describe, expect, it } from "vitest";
import { HAGGLE, haggleChance } from "../data/economy";
import {
  canAttemptHaggle,
  haggleAttempt,
  haggleRoll,
  haggleSeed,
  type HaggleContext,
} from "./haggle";

/**
 * The argument, and the promise that it cannot be re-rolled.
 *
 * Determinism here is not a testing convenience — it is the rule that
 * stops a player save-scumming a price. The roll is a function of the
 * counter, the chapter and the run's seed, so reloading before the
 * click and clicking again produces the same answer.
 */

const context: HaggleContext = {
  vendorId: "wet-market-back",
  act: 1,
  seed: 4242,
};

describe("determinism", () => {
  it("rolls the same number for the same transaction context", () => {
    expect(haggleRoll(context)).toBe(haggleRoll({ ...context }));
    expect(haggleSeed(context)).toBe(haggleSeed({ ...context }));
  });

  it("rolls a different number per counter, per act, per run", () => {
    const rolls = new Set([
      haggleRoll(context),
      haggleRoll({ ...context, vendorId: "vm-broker-counter" }),
      haggleRoll({ ...context, act: 2 }),
      haggleRoll({ ...context, seed: 4243 }),
    ]);
    expect(rolls.size).toBe(4);
  });

  it("rolls inside [0, 1) for any context", () => {
    for (let seed = 0; seed < 200; seed++) {
      const roll = haggleRoll({ ...context, seed });
      expect(roll).toBeGreaterThanOrEqual(0);
      expect(roll).toBeLessThan(1);
    }
  });

  it("decides an attempt the same way every time it is asked", () => {
    const first = haggleAttempt(context, 8);
    const second = haggleAttempt(context, 8);
    expect(second).toEqual(first);
  });
});

describe("the Cool gate", () => {
  it("refuses a face too cold to try", () => {
    expect(canAttemptHaggle(HAGGLE.minCool - 1)).toBe(false);
    expect(canAttemptHaggle(HAGGLE.minCool)).toBe(true);
  });

  it("cannot be won below the Cool floor, whatever the roll", () => {
    for (let seed = 0; seed < 100; seed++) {
      const attempt = haggleAttempt({ ...context, seed }, HAGGLE.minCool - 1);
      expect(attempt.chance).toBe(0);
      expect(attempt.won).toBe(false);
    }
  });

  it("wins more often the colder the head", () => {
    let lowWins = 0;
    let highWins = 0;
    for (let seed = 0; seed < 400; seed++) {
      if (haggleAttempt({ ...context, seed }, HAGGLE.minCool).won) lowWins++;
      if (haggleAttempt({ ...context, seed }, 12).won) highWins++;
    }
    expect(highWins).toBeGreaterThan(lowWins);
    // And roughly at the odds the screen quotes, over a decent sample.
    expect(highWins / 400).toBeGreaterThan(haggleChance(12) - 0.12);
    expect(highWins / 400).toBeLessThan(haggleChance(12) + 0.12);
  });

  it("reports the odds it rolled against", () => {
    expect(haggleAttempt(context, 10).chance).toBe(haggleChance(10));
  });
});
