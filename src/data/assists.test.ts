import { describe, expect, it } from "vitest";
import {
  ASSIST_DAMAGE_FLOOR,
  ASSIST_IDS,
  ASSISTS,
  BREACH_RESCUE_FAILURES,
  anyAssistOn,
  clampAssists,
  getAssist,
  noAssists,
  requireAssist,
} from "./assists";

describe("the assist catalog", () => {
  it("describes every id exactly once, with copy the panel can show", () => {
    expect(ASSISTS.map((a) => a.id)).toEqual([...ASSIST_IDS]);
    for (const assist of ASSISTS) {
      expect(assist.label.length).toBeGreaterThan(0);
      expect(assist.blurb.length).toBeGreaterThan(20);
    }
  });

  it("resolves ids, and refuses one it does not have", () => {
    expect(getAssist("damage-floor")?.label).toBe("Damage floor");
    expect(getAssist("god-mode")).toBeUndefined();
    expect(() => requireAssist("god-mode")).toThrow(/god-mode/);
  });

  it("floors player damage above the engine's own floor of 1", () => {
    expect(ASSIST_DAMAGE_FLOOR).toBeGreaterThan(1);
  });

  it("waits three lockouts before offering to route a lattice", () => {
    expect(BREACH_RESCUE_FAILURES).toBe(3);
  });
});

describe("the switchboard", () => {
  it("starts with everything off", () => {
    const off = noAssists();
    expect(Object.keys(off).sort()).toEqual([...ASSIST_IDS].sort());
    expect(Object.values(off).every((on) => on === false)).toBe(true);
    expect(anyAssistOn(off)).toBe(false);
  });

  it("reads one switch on as at least one switch on", () => {
    expect(anyAssistOn({ ...noAssists(), "damage-floor": true })).toBe(true);
  });

  it("clamps to a complete board: only true is on, and nothing else", () => {
    expect(clampAssists({ "damage-floor": true, "always-preview": "yes" })).toEqual(
      { ...noAssists(), "damage-floor": true },
    );
  });

  it("drops keys this build does not have and defaults missing ones off", () => {
    const clamped = clampAssists({ "auto-win-everything": true });
    expect(clamped).toEqual(noAssists());
    expect("auto-win-everything" in clamped).toBe(false);
  });

  it("degrades a non-object to everything off rather than crashing", () => {
    for (const bad of [null, undefined, 7, "on", true]) {
      expect(clampAssists(bad)).toEqual(noAssists());
    }
  });
});
