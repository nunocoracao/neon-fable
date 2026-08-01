import { describe, expect, it } from "vitest";
import { themeForMap } from "../audio/score";
import { layerGrid } from "../audio/music";
import { DAY_PHASES, type MusicThemeId } from "../iso/tilemap";
import { maps } from "./maps";
import { encounters } from "./encounters";
import {
  DAY_PHASE_MUSIC,
  MUSIC_LAYER_ROLES,
  MUSIC_THEMES,
  MUSIC_THEME_IDS,
  SHARED_LAYERS,
  SHARED_LAYER_ROLES,
  THEME_LAYER_ROLES,
  themeLayer,
  type MusicLayerPattern,
} from "./music";

const themes = MUSIC_THEME_IDS.map((id) => [id, MUSIC_THEMES[id]] as const);

const allPatterns: Array<readonly [string, MusicLayerPattern]> = [
  ...themes.flatMap(([id, theme]) =>
    THEME_LAYER_ROLES.map(
      (role) => [`${id}/${role}`, theme.layers[role]] as const,
    ),
  ),
  ...SHARED_LAYER_ROLES.map(
    (role) => [`shared/${role}`, SHARED_LAYERS[role]] as const,
  ),
];

describe("theme registration", () => {
  it("registers a theme under its own id", () => {
    for (const [id, theme] of themes) {
      expect(theme, id).toBeDefined();
      expect(theme.id, id).toBe(id);
      expect(theme.name.length, id).toBeGreaterThan(0);
      expect(theme.secondsPerBar, id).toBeGreaterThan(0);
    }
  });

  it("resolves a registered theme for every map in the game", () => {
    for (const map of maps) {
      const themeId = themeForMap(map);
      expect(MUSIC_THEMES[themeId], `${map.id} theme`).toBeDefined();
    }
  });

  it("has every map declare its theme rather than lean on the default", () => {
    for (const map of maps) {
      expect(map.music, `${map.id} declares a theme`).toBeDefined();
      expect(MUSIC_THEME_IDS, `${map.id} theme is registered`).toContain(
        map.music as MusicThemeId,
      );
    }
  });

  it("resolves a theme for every arena an encounter fights on", () => {
    for (const encounter of encounters) {
      const arena = maps.find((map) => map.id === encounter.arenaMapId);
      expect(arena, `${encounter.id} arena`).toBeDefined();
      expect(MUSIC_THEMES[themeForMap(arena)], encounter.id).toBeDefined();
    }
  });

  it("leaves no theme unused by the game", () => {
    // Every theme is reachable: a map plays it, or a screen does.
    const byMaps = new Set(maps.map((map) => themeForMap(map)));
    const byScreens = new Set<MusicThemeId>(["menu", "ending"]);
    for (const [id] of themes) {
      expect(byMaps.has(id) || byScreens.has(id), `${id} is played`).toBe(true);
    }
  });

  it("gives each district its own voice — no two share a tempo", () => {
    const districtThemes = themes.filter(
      ([id]) => id !== "menu" && id !== "ending",
    );
    const tempos = districtThemes.map(([, theme]) => theme.secondsPerBar);
    expect(new Set(tempos).size).toBe(tempos.length);
  });
});

describe("layers", () => {
  it("authors every stem a mode can ask for", () => {
    for (const [id, theme] of themes) {
      for (const role of MUSIC_LAYER_ROLES) {
        const pattern = themeLayer(theme, role);
        expect(pattern, `${id}/${role}`).toBeDefined();
        expect(pattern.notes.length, `${id}/${role}`).toBeGreaterThan(0);
      }
    }
  });

  it("borrows the fight's stems, so the drive is the same everywhere", () => {
    for (const [, theme] of themes) {
      expect(themeLayer(theme, "rhythm")).toBe(SHARED_LAYERS.rhythm);
      expect(themeLayer(theme, "boss")).toBe(SHARED_LAYERS.boss);
    }
  });

  it("keeps every note inside its loop with sane values", () => {
    for (const [label, pattern] of allPatterns) {
      expect(pattern.stepsPerBar, label).toBeGreaterThan(0);
      expect(Number.isInteger(pattern.stepsPerBar), label).toBe(true);
      expect(pattern.bars, label).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(pattern.bars), label).toBe(true);
      const steps = pattern.stepsPerBar * pattern.bars;
      for (const note of pattern.notes) {
        expect(Number.isInteger(note.step), label).toBe(true);
        expect(note.step, label).toBeGreaterThanOrEqual(0);
        expect(note.step, label).toBeLessThan(steps);
        expect(note.steps, label).toBeGreaterThanOrEqual(1);
        expect(note.freq, label).toBeGreaterThan(0);
        expect(note.gain, label).toBeGreaterThan(0);
        expect(note.gain, label).toBeLessThanOrEqual(1);
        expect(note.filterFreq, label).toBeGreaterThan(0);
      }
    }
  });

  it("never lets a note outlast its own loop", () => {
    for (const [label, pattern] of allPatterns) {
      const steps = pattern.stepsPerBar * pattern.bars;
      for (const note of pattern.notes) {
        expect(note.step + note.steps, label).toBeLessThanOrEqual(steps);
      }
    }
  });

  it("keeps every mix inside a sane peak, so nothing ever clips", () => {
    // Worst case: every layer of a boss fight sounding its loudest step
    // at once, at the loudest hour.
    const loudest = Math.max(
      ...Object.values(DAY_PHASE_MUSIC).map((p) => p.gainScale),
    );
    for (const [id, theme] of themes) {
      const peak = (["base", "tension", "rhythm", "boss"] as const)
        .map((role) => {
          const pattern = themeLayer(theme, role);
          const perStep = new Map<number, number>();
          for (const note of pattern.notes) {
            // A held note is sounding on every step it spans.
            for (let s = note.step; s < note.step + note.steps; s++) {
              perStep.set(s, (perStep.get(s) ?? 0) + note.gain);
            }
          }
          return Math.max(...perStep.values());
        })
        .reduce((sum, layer) => sum + layer, 0);
      expect(peak * loudest, `${id} boss mix peak`).toBeLessThanOrEqual(1);
    }
  });
});

describe("bar alignment", () => {
  it("loops every layer of a theme in whole bars of that theme", () => {
    for (const [id, theme] of themes) {
      for (const role of MUSIC_LAYER_ROLES) {
        const pattern = themeLayer(theme, role);
        const grid = layerGrid(pattern, theme.secondsPerBar, 1);
        const loop = grid.stepSeconds * grid.stepCount;
        expect(loop / theme.secondsPerBar, `${id}/${role}`).toBeCloseTo(
          pattern.bars,
        );
      }
    }
  });

  it("plays the shared drive at each district's own pace", () => {
    const paces = themes.map(([, theme]) => {
      const grid = layerGrid(SHARED_LAYERS.rhythm, theme.secondsPerBar, 1);
      return grid.stepSeconds;
    });
    // Fast enough to drive a fight, slow enough not to buzz, everywhere.
    for (const seconds of paces) {
      expect(seconds).toBeGreaterThan(0.08);
      expect(seconds).toBeLessThan(0.5);
    }
  });
});

describe("the hour", () => {
  it("colours every phase, and only shades the score", () => {
    for (const phase of DAY_PHASES) {
      const params = DAY_PHASE_MUSIC[phase];
      expect(params, phase).toBeDefined();
      expect(params.tempoScale, phase).toBeGreaterThan(0.8);
      expect(params.tempoScale, phase).toBeLessThan(1.25);
      expect(params.filterScale, phase).toBeGreaterThan(0.3);
      expect(params.gainScale, phase).toBeGreaterThan(0.5);
      expect(params.gainScale, phase).toBeLessThanOrEqual(1);
    }
  });
});

describe("boss encounters", () => {
  it("marks a handful of set pieces and no more", () => {
    const bosses = encounters.filter((encounter) => encounter.boss === true);
    expect(bosses.length).toBeGreaterThan(0);
    expect(bosses.length).toBeLessThan(encounters.length / 2);
    for (const boss of bosses) {
      // A set piece you are not allowed to walk away from.
      expect(boss.fleeable, boss.id).toBe(false);
    }
  });
});
