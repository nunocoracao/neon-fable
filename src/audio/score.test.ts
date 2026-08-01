import { describe, expect, it } from "vitest";
import { DAY_PHASE_MUSIC, MUSIC_THEMES } from "../data/music";
import { DAY_PHASES, type MusicThemeId } from "../iso/tilemap";
import {
  MODE_LAYERS,
  MUSIC_MODES,
  arrangementFor,
  arrangementVoice,
  barSeconds,
  layerKey,
  musicScene,
  nextBarTime,
  phaseParams,
  planCrossfade,
  sceneEquals,
  selectLayers,
  themeForMap,
  type Arrangement,
} from "./score";
import type { IsoMap } from "../iso/tilemap";

function testMap(music?: MusicThemeId): IsoMap {
  return {
    id: "test",
    name: "Test",
    width: 1,
    height: 1,
    tiles: [["pavement"]],
    props: [],
    interactables: [],
    spawns: [],
    ...(music ? { music } : {}),
  };
}

/** How far a time sits from the nearest bar line, in bars. */
function offGrid(time: number, origin: number, bar: number): number {
  const bars = (time - origin) / bar;
  return Math.abs(bars - Math.round(bars));
}

function arrangement(
  themeId: MusicThemeId,
  mode: "explore" | "combat" | "boss",
  dayPhase: "dusk" | "night" | "late" = "night",
): Arrangement {
  return arrangementFor(musicScene(themeId, mode, dayPhase));
}

describe("scenes", () => {
  it("defaults to exploring at the authored hour", () => {
    expect(musicScene("market")).toEqual({
      themeId: "market",
      mode: "explore",
      dayPhase: "night",
    });
  });

  it("compares by value, and nulls only match nulls", () => {
    expect(sceneEquals(musicScene("hub"), musicScene("hub"))).toBe(true);
    expect(sceneEquals(musicScene("hub"), musicScene("hub", "combat"))).toBe(
      false,
    );
    expect(sceneEquals(null, null)).toBe(true);
    expect(sceneEquals(null, musicScene("hub"))).toBe(false);
  });

  it("takes the theme a map declares, and falls back to the hub's", () => {
    expect(themeForMap(testMap("quays"))).toBe("quays");
    expect(themeForMap(testMap())).toBe("hub");
    expect(themeForMap(null)).toBe("hub");
  });
});

describe("layer selection", () => {
  it("plays the district and its melody while exploring", () => {
    expect(selectLayers("explore")).toEqual(["base", "melodic"]);
  });

  it("swaps melody for tension and adds the drive in combat", () => {
    expect(selectLayers("combat")).toEqual(["base", "tension", "rhythm"]);
  });

  it("adds one layer for a boss rather than replacing the fight's mix", () => {
    const combat = selectLayers("combat");
    const boss = selectLayers("boss");
    expect(boss.slice(0, combat.length)).toEqual([...combat]);
    expect(boss).toContain("boss");
    expect(boss.length).toBe(combat.length + 1);
  });

  it("keeps the district's own base layer in every mode", () => {
    for (const mode of MUSIC_MODES) {
      expect(selectLayers(mode)[0], mode).toBe("base");
    }
  });

  it("never names a layer twice in one mix", () => {
    for (const mode of MUSIC_MODES) {
      const roles = MODE_LAYERS[mode];
      expect(new Set(roles).size, mode).toBe(roles.length);
    }
  });
});

describe("the hour", () => {
  it("resolves a parameter set for every phase", () => {
    for (const phase of DAY_PHASES) {
      expect(phaseParams(phase), phase).toEqual(DAY_PHASE_MUSIC[phase]);
    }
  });

  it("reads night as the neutral hour the score is authored at", () => {
    expect(phaseParams("night")).toEqual({
      tempoScale: 1,
      filterScale: 1,
      gainScale: 1,
    });
  });

  it("runs the small hours slower, darker, and quieter than dusk", () => {
    const dusk = phaseParams("dusk");
    const late = phaseParams("late");
    expect(late.tempoScale).toBeGreaterThan(dusk.tempoScale);
    expect(late.filterScale).toBeLessThan(dusk.filterScale);
    expect(late.gainScale).toBeLessThanOrEqual(dusk.gainScale);
  });

  it("stretches the bar and closes the filter on the same theme", () => {
    const night = arrangement("hub", "explore", "night");
    const late = arrangement("hub", "explore", "late");
    expect(barSeconds(late)).toBeGreaterThan(barSeconds(night));

    const nightBase = arrangementVoice(night, "base");
    const lateBase = arrangementVoice(late, "base");
    expect(lateBase.grid.stepSeconds).toBeGreaterThan(nightBase.grid.stepSeconds);
    expect(lateBase.filterScale).toBeLessThan(nightBase.filterScale);
    // Same authored notes underneath: only the colouring moved.
    expect(lateBase.pattern).toBe(nightBase.pattern);
  });

  it("gives the hour its own mixer channel, so a change refades", () => {
    expect(layerKey("hub", "night", "base")).not.toBe(
      layerKey("hub", "late", "base"),
    );
  });
});

describe("nextBarTime", () => {
  it("returns the origin for anything at or before it", () => {
    expect(nextBarTime(10, 4, 10)).toBe(10);
    expect(nextBarTime(10, 4, 3)).toBe(10);
  });

  it("lands exactly on a bar line", () => {
    expect(nextBarTime(10, 4, 10.1)).toBeCloseTo(14);
    expect(nextBarTime(10, 4, 13.999)).toBeCloseTo(14);
    expect(nextBarTime(10, 4, 14)).toBeCloseTo(14);
    expect(nextBarTime(10, 4, 14.001)).toBeCloseTo(18);
  });

  it("does not skip a bar for a time a hair past one", () => {
    expect(nextBarTime(0, 3.36, 3.36 + 1e-12)).toBeCloseTo(3.36);
  });

  it("always lands on the grid, however far ahead", () => {
    for (const at of [0.5, 7, 33.3, 1000]) {
      const time = nextBarTime(2, 3.36, at);
      expect(time).toBeGreaterThanOrEqual(at - 1e-9);
      expect(offGrid(time, 2, 3.36)).toBeLessThan(1e-9);
    }
  });

  it("degrades to the asked-for time on a nonsense bar length", () => {
    expect(nextBarTime(0, 0, 5)).toBe(5);
    expect(nextBarTime(0, Number.NaN, 5)).toBe(5);
  });
});

describe("planCrossfade", () => {
  const fade = 0.8;
  const lead = 0.3;

  it("starts music straight away when nothing is playing", () => {
    const to = arrangement("hub", "explore");
    const plan = planCrossfade({
      from: null,
      to,
      origin: 0,
      now: 12,
      fadeSeconds: fade,
      lead,
    });
    expect(plan.at).toBeCloseTo(12.3);
    expect(plan.fadeIn).toEqual(["base", "melodic"]);
    expect(plan.fadeOut).toEqual([]);
    expect(plan.hold).toEqual([]);
    // Nothing was held, so the bar grid starts here.
    expect(plan.origin).toBeCloseTo(12.3);
  });

  it("waits for the next bar line of what is already playing", () => {
    const from = arrangement("hub", "explore");
    const bar = barSeconds(from);
    const plan = planCrossfade({
      from,
      to: arrangement("hub", "combat"),
      origin: 4,
      now: 4 + bar * 2.5,
      fadeSeconds: fade,
      lead,
    });
    expect(plan.at).toBeCloseTo(4 + bar * 3);
  });

  it("holds the district through a fight and only moves what differs", () => {
    const plan = planCrossfade({
      from: arrangement("quays", "explore"),
      to: arrangement("quays", "combat"),
      origin: 0,
      now: 1,
      fadeSeconds: fade,
      lead,
    });
    expect(plan.hold).toEqual(["base"]);
    expect(plan.fadeIn).toEqual(["tension", "rhythm"]);
    expect(plan.fadeOut).toEqual(["melodic"]);
    // The grid never moved, so neither does the origin.
    expect(plan.origin).toBe(0);
  });

  it("escalates a fight to a boss by adding a layer, holding the rest", () => {
    const plan = planCrossfade({
      from: arrangement("spire", "combat"),
      to: arrangement("spire", "boss"),
      origin: 0,
      now: 1,
      fadeSeconds: fade,
      lead,
    });
    expect(plan.hold).toEqual(["base", "tension", "rhythm"]);
    expect(plan.fadeIn).toEqual(["boss"]);
    expect(plan.fadeOut).toEqual([]);
  });

  it("drops back out of a fight to the district's exploration mix", () => {
    const plan = planCrossfade({
      from: arrangement("market", "boss"),
      to: arrangement("market", "explore"),
      origin: 0,
      now: 1,
      fadeSeconds: fade,
      lead,
    });
    expect(plan.hold).toEqual(["base"]);
    expect(plan.fadeIn).toEqual(["melodic"]);
    expect(plan.fadeOut).toEqual(["tension", "rhythm", "boss"]);
  });

  it("crosses in full between districts", () => {
    const plan = planCrossfade({
      from: arrangement("hub", "explore"),
      to: arrangement("greywater", "explore"),
      origin: 0,
      now: 1,
      fadeSeconds: fade,
      lead,
    });
    expect(plan.hold).toEqual([]);
    expect(plan.fadeIn).toEqual(["base", "melodic"]);
    expect(plan.fadeOut).toEqual(["base", "melodic"]);
    expect(plan.origin).toBe(plan.at);
  });

  it("crosses in full when only the hour moved — the notes changed", () => {
    const plan = planCrossfade({
      from: arrangement("hub", "explore", "night"),
      to: arrangement("hub", "explore", "late"),
      origin: 0,
      now: 1,
      fadeSeconds: fade,
      lead,
    });
    expect(plan.hold).toEqual([]);
    expect(plan.fadeOut).toEqual(["base", "melodic"]);
  });

  it("takes everything down when the score stops", () => {
    const plan = planCrossfade({
      from: arrangement("ventworks", "combat"),
      to: null,
      origin: 0,
      now: 1,
      fadeSeconds: fade,
      lead,
    });
    expect(plan.fadeIn).toEqual([]);
    expect(plan.fadeOut).toEqual(["base", "tension", "rhythm"]);
  });

  it("never starts a fade the scheduler has already committed past", () => {
    const from = arrangement("market", "explore");
    for (const now of [0, 1, 2.5, 9.75, 40]) {
      const plan = planCrossfade({
        from,
        to: arrangement("market", "combat"),
        origin: 0.25,
        now,
        fadeSeconds: fade,
        lead,
      });
      expect(plan.at).toBeGreaterThanOrEqual(now + lead - 1e-9);
    }
  });

  it("names every incoming layer exactly once, across every move", () => {
    const themeIds = Object.keys(MUSIC_THEMES) as MusicThemeId[];
    for (const themeId of themeIds) {
      for (const fromMode of MUSIC_MODES) {
        for (const toMode of MUSIC_MODES) {
          const to = arrangement(themeId, toMode);
          const plan = planCrossfade({
            from: arrangement(themeId, fromMode),
            to,
            origin: 0,
            now: 1,
            fadeSeconds: fade,
            lead,
          });
          const covered = [...plan.hold, ...plan.fadeIn].sort();
          expect(covered, `${themeId} ${fromMode}->${toMode}`).toEqual(
            [...to.roles].sort(),
          );
          // A layer is never faded both ways at once.
          expect(
            plan.fadeIn.filter((role) => plan.fadeOut.includes(role)),
          ).toEqual([]);
        }
      }
    }
  });
});
