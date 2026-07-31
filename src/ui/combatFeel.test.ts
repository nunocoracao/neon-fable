import { describe, expect, it } from "vitest";
import {
  CRITICAL_DAMAGE_SHARE,
  HEAVY_DAMAGE_SHARE,
  isCriticalBlow,
  isGlancingBlow,
  isHeavyBlow,
} from "../combat";
import { impactWeight, turnFocus } from "./combatFeel";

/**
 * The weight readings the combat camera answers to. Nothing here is a
 * mechanic — every figure comes from the damage math untouched — so what
 * is under test is only that the same numbers the log reports are the
 * ones the camera reads, and that the tiers never overlap.
 */

describe("isHeavyBlow", () => {
  it("reads a fifth of a frame as heavy, and less as not", () => {
    expect(isHeavyBlow(4, 20)).toBe(true);
    expect(isHeavyBlow(3, 20)).toBe(false);
    expect(HEAVY_DAMAGE_SHARE).toBeLessThan(CRITICAL_DAMAGE_SHARE);
  });

  it("reads nothing off a blow that dealt nothing, or a frame of none", () => {
    expect(isHeavyBlow(0, 20)).toBe(false);
    expect(isHeavyBlow(-5, 20)).toBe(false);
    expect(isHeavyBlow(5, 0)).toBe(false);
  });

  it("holds for anything critical: a critical blow is always heavy", () => {
    for (let maxHp = 1; maxHp <= 60; maxHp++) {
      for (let damage = 1; damage <= maxHp; damage++) {
        if (isCriticalBlow(damage, maxHp)) {
          expect(isHeavyBlow(damage, maxHp)).toBe(true);
        }
      }
    }
  });
});

describe("impactWeight", () => {
  it("reads armor stopping the greater share as a glance", () => {
    expect(impactWeight(3, { armor: 4, maxHp: 30 })).toBe("glancing");
    expect(isGlancingBlow(3, 4)).toBe(true);
  });

  it("outranks a glance with nothing: even a big one stays a glance", () => {
    // Armor ate most of a heavy figure; the camera still owes nothing.
    expect(impactWeight(10, { armor: 12, maxHp: 30 })).toBe("glancing");
  });

  it("reads a third of a frame as critical", () => {
    expect(impactWeight(10, { armor: 0, maxHp: 30 })).toBe("critical");
    expect(impactWeight(30, { armor: 0, maxHp: 30 })).toBe("critical");
  });

  it("reads a fifth as heavy and anything under it as solid", () => {
    expect(impactWeight(6, { armor: 0, maxHp: 30 })).toBe("heavy");
    expect(impactWeight(5, { armor: 0, maxHp: 30 })).toBe("solid");
    expect(impactWeight(1, { armor: 0, maxHp: 30 })).toBe("solid");
  });

  it("reads a blow that dealt nothing as a glance", () => {
    expect(impactWeight(0, { armor: 0, maxHp: 30 })).toBe("glancing");
  });

  it("climbs with the figure and never skips a step backwards", () => {
    const order = ["glancing", "solid", "heavy", "critical"];
    let lowest = 0;
    for (let damage = 1; damage <= 30; damage++) {
      const rank = order.indexOf(impactWeight(damage, { armor: 0, maxHp: 30 }));
      expect(rank).toBeGreaterThanOrEqual(lowest);
      lowest = rank;
    }
  });
});

describe("turnFocus", () => {
  const player = { id: "player", kind: "player" } as const;
  const enemy = { id: "enemy-1", kind: "enemy" } as const;

  it("asks for a reframing when the hand changes", () => {
    expect(turnFocus(player, null)).toEqual({
      entityId: "player",
      pace: "player",
    });
    expect(turnFocus(enemy, "player")).toEqual({
      entityId: "enemy-1",
      pace: "ai",
    });
  });

  it("asks for nothing mid-turn, however often the screen syncs", () => {
    expect(turnFocus(player, "player")).toBeNull();
    expect(turnFocus(enemy, "enemy-1")).toBeNull();
  });

  it("asks for nothing once the fight is over", () => {
    expect(turnFocus(null, "player")).toBeNull();
    expect(turnFocus(null, null)).toBeNull();
  });

  it("glides the AI's turns at the AI's pace", () => {
    expect(turnFocus(enemy, null)?.pace).toBe("ai");
    expect(turnFocus(player, "enemy-1")?.pace).toBe("player");
  });
});
