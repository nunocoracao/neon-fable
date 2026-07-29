import { describe, expect, it } from "vitest";
import { glowIntensityScale, resolveDayPhase } from "./dayPhase";
import {
  DAY_PHASES,
  DEFAULT_DAY_PHASE,
  isWalkable,
  type DayPhaseId,
  type IsoMap,
} from "./tilemap";
import { findPath } from "./path";

function testMap(dayPhase?: DayPhaseId): IsoMap {
  return {
    id: "test",
    name: "Test",
    width: 3,
    height: 2,
    tiles: [
      ["pavement", "pavement", "canal"],
      ["pavement", "road", "pavement"],
    ],
    props: [],
    interactables: [],
    spawns: [{ id: "player-start", x: 0, y: 0 }],
    ...(dayPhase ? { dayPhase } : {}),
  };
}

describe("resolveDayPhase", () => {
  it("falls back to the authored hour when nothing declares one", () => {
    expect(resolveDayPhase(testMap())).toBe(DEFAULT_DAY_PHASE);
    expect(resolveDayPhase(testMap(), null)).toBe(DEFAULT_DAY_PHASE);
    expect(resolveDayPhase(testMap(), undefined)).toBe(DEFAULT_DAY_PHASE);
  });

  it("uses the map's own hour", () => {
    for (const phase of DAY_PHASES) {
      expect(resolveDayPhase(testMap(phase))).toBe(phase);
    }
  });

  it("lets a story beat override the map for its scene", () => {
    for (const map of DAY_PHASES.map((phase) => testMap(phase))) {
      for (const story of DAY_PHASES) {
        expect(resolveDayPhase(map, story)).toBe(story);
      }
    }
    // A beat can override a map that declares nothing at all.
    expect(resolveDayPhase(testMap(), "late")).toBe("late");
  });

  it("drops back to the map when the beat sets no hour", () => {
    expect(resolveDayPhase(testMap("dusk"), null)).toBe("dusk");
  });

  it("resolves to a real phase for every combination", () => {
    const sources: Array<DayPhaseId | undefined> = [...DAY_PHASES, undefined];
    for (const map of sources) {
      for (const story of sources) {
        expect(DAY_PHASES).toContain(resolveDayPhase(testMap(map), story));
      }
    }
  });
});

describe("the hour is a look and nothing else", () => {
  it("changes nothing a player can walk on or route through", () => {
    const base = testMap();
    for (const phase of DAY_PHASES) {
      const staged = testMap(phase);
      for (let y = 0; y < base.height; y++) {
        for (let x = 0; x < base.width; x++) {
          expect(isWalkable(staged, x, y), `${phase} ${x},${y}`).toBe(
            isWalkable(base, x, y),
          );
        }
      }
      expect(findPath(staged, { x: 0, y: 0 }, { x: 2, y: 1 })?.length).toBe(
        findPath(base, { x: 0, y: 0 }, { x: 2, y: 1 })?.length,
      );
    }
  });

  it("scales the glow pass per phase", () => {
    expect(glowIntensityScale(DEFAULT_DAY_PHASE)).toBe(1);
    expect(glowIntensityScale("late")).toBeGreaterThan(
      glowIntensityScale("dusk"),
    );
  });
});
