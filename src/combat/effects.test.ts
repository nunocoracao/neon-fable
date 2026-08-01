import { describe, expect, it } from "vitest";
import type { TimedEffect } from "../inventory/items";
import {
  applyTimedEffect,
  expiredCrash,
  settleTimedEffects,
  tickTimedEffects,
} from "./effects";
import type { ActiveBoost } from "./types";

/**
 * The timed-effect clock. Three rules, and every one of them is a rule
 * a player can feel: two doses of one family never run together, a lift
 * that borrowed pays it back the turn it ends, and settling clears what
 * is owed and nothing else.
 */

const surge: TimedEffect = {
  family: "reflex-stim",
  stat: "reflexes",
  amount: 2,
  turns: 3,
  after: { stat: "reflexes", amount: -1, turns: 2 },
};

const redline: TimedEffect = {
  family: "reflex-stim",
  stat: "reflexes",
  amount: 3,
  turns: 3,
  after: { stat: "reflexes", amount: -2, turns: 4 },
};

const hammerhead: TimedEffect = {
  family: "bone-stim",
  stat: "body",
  amount: 2,
  turns: 3,
  after: { stat: "body", amount: -1, turns: 2 },
};

const meal: TimedEffect = {
  family: "well-fed",
  stat: "body",
  amount: 1,
  turns: 4,
};

/** Ticks a list `n` owner-turns forward. */
function ticked(boosts: readonly ActiveBoost[], n: number): ActiveBoost[] {
  let next = [...boosts];
  for (let i = 0; i < n; i++) next = tickTimedEffects(next);
  return next;
}

describe("applyTimedEffect", () => {
  it("starts a lift with its bill attached", () => {
    expect(applyTimedEffect([], surge)).toEqual([
      {
        stat: "reflexes",
        amount: 2,
        turnsLeft: 3,
        family: "reflex-stim",
        after: { stat: "reflexes", amount: -1, turns: 2 },
      },
    ]);
  });

  it("refuses to stack a family: a second dose replaces the first", () => {
    const after = applyTimedEffect(applyTimedEffect([], surge), redline);
    expect(after).toHaveLength(1);
    expect(after[0]?.amount).toBe(3);
    // And it is a replacement rather than a top-up: the weaker lift is
    // gone, not folded in.
    expect(after.some((boost) => boost.amount === 2)).toBe(false);
  });

  it("lets a lift on a different nerve run alongside", () => {
    const both = applyTimedEffect(applyTimedEffect([], surge), hammerhead);
    expect(both.map((boost) => boost.family)).toEqual([
      "reflex-stim",
      "bone-stim",
    ]);
  });

  it("leaves an ability's own buff alone — no family, no slot", () => {
    const ability: ActiveBoost = { stat: "cool", amount: 2, turnsLeft: 2 };
    const withStim = applyTimedEffect([ability, ability], surge);
    expect(withStim).toHaveLength(3);
  });

  it("refreshes a dose that is already running rather than doubling it", () => {
    const twice = applyTimedEffect(applyTimedEffect([], surge), surge);
    expect(twice).toHaveLength(1);
    expect(twice[0]?.turnsLeft).toBe(3);
  });
});

describe("tickTimedEffects", () => {
  it("hands back the crash the turn the lift runs out", () => {
    const lifted = applyTimedEffect([], surge);
    // Three turns of +2, and nothing owed while they last.
    expect(ticked(lifted, 2).map((b) => b.amount)).toEqual([2]);
    const crashed = ticked(lifted, 3);
    expect(crashed).toEqual([
      { stat: "reflexes", amount: -1, turnsLeft: 2, family: "reflex-stim" },
    ]);
    // And the bill runs out too — nothing here is permanent.
    expect(ticked(lifted, 5)).toEqual([]);
  });

  it("lets a clean effect simply expire", () => {
    const fed = applyTimedEffect([], meal);
    expect(ticked(fed, 3)).toHaveLength(1);
    expect(ticked(fed, 4)).toEqual([]);
  });

  it("lets a fresh dose displace a crash, pushing the bill back", () => {
    const crashed = ticked(applyTimedEffect([], surge), 3);
    expect(crashed[0]?.amount).toBe(-1);
    // Re-dosing the same family replaces the debt with a new lift — and
    // the new lift owes its own bill, so nothing has been cancelled.
    const redosed = applyTimedEffect(crashed, surge);
    expect(redosed).toHaveLength(1);
    expect(redosed[0]?.amount).toBe(2);
    expect(ticked(redosed, 3)[0]?.amount).toBe(-1);
  });
});

describe("expiredCrash", () => {
  it("reports the bill exactly on the turn it lands, and never early", () => {
    const [lift] = applyTimedEffect([], surge);
    if (!lift) throw new Error("no lift");
    expect(expiredCrash(lift)).toBeNull();
    expect(expiredCrash({ ...lift, turnsLeft: 1 })?.amount).toBe(-1);
    // A clean lift owes nothing on its last turn either.
    const [fed] = applyTimedEffect([], meal);
    expect(expiredCrash({ ...fed!, turnsLeft: 1 })).toBeNull();
  });
});

describe("settleTimedEffects", () => {
  it("bleeds off what is owed and keeps what was paid for", () => {
    const carrying = [
      ...applyTimedEffect([], hammerhead),
      ...ticked(applyTimedEffect([], surge), 3),
    ];
    expect(carrying.map((b) => b.amount)).toEqual([2, -1]);
    expect(settleTimedEffects(carrying).map((b) => b.amount)).toEqual([2]);
  });
});
