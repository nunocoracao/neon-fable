import { describe, expect, it } from "vitest";
import { noAssists } from "../data/assists";
import { DEFAULT_DIFFICULTY_ID } from "../data/difficulty";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  SHAKE_SCALES,
  ZOOM_LEVELS,
  clampSettings,
  clampShakeScale,
  clampZoom,
  loadSettings,
  migrateSettings,
  parseSettings,
  revealDelayMs,
  saveSettings,
  serializeSettings,
  settingsRules,
  stepZoom,
  type SettingsStorage,
} from "./settings";
import { createSettingsStore } from "./store";
import { reducedMotionActive } from "./index";

function fakeStorage(
  initial: Record<string, string> = {},
): SettingsStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("clampSettings", () => {
  it("returns defaults for non-objects", () => {
    expect(clampSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(clampSettings("fast")).toEqual(DEFAULT_SETTINGS);
    expect(clampSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid fields and clamps invalid ones independently", () => {
    expect(
      clampSettings({ textSpeed: "fast", reducedMotion: "yes", zoom: 1.5 }),
    ).toEqual({
      textSpeed: "fast",
      reducedMotion: false,
      zoom: 1.5,
      glow: true,
      weather: true,
      minimap: true,
      combatFeel: true,
      shakeScale: 1,
      barks: true,
      difficulty: DEFAULT_DIFFICULTY_ID,
      assists: noAssists(),
    });
    expect(
      clampSettings({ textSpeed: "warp", reducedMotion: true }),
    ).toEqual({
      textSpeed: "normal",
      reducedMotion: true,
      zoom: 1,
      glow: true,
      weather: true,
      minimap: true,
      combatFeel: true,
      shakeScale: 1,
      barks: true,
      difficulty: DEFAULT_DIFFICULTY_ID,
      assists: noAssists(),
    });
  });

  it("ignores unknown fields", () => {
    expect(clampSettings({ textSpeed: "instant", volume: 3 })).toEqual({
      textSpeed: "instant",
      reducedMotion: false,
      zoom: 1,
      glow: true,
      weather: true,
      minimap: true,
      combatFeel: true,
      shakeScale: 1,
      barks: true,
      difficulty: DEFAULT_DIFFICULTY_ID,
      assists: noAssists(),
    });
  });

  it("glow defaults on; only an explicit false disables it", () => {
    expect(clampSettings({}).glow).toBe(true);
    expect(clampSettings({ glow: false }).glow).toBe(false);
    expect(clampSettings({ glow: "off" }).glow).toBe(true);
    expect(clampSettings({ glow: 0 }).glow).toBe(true);
  });

  it("weather defaults on; only an explicit false disables it", () => {
    expect(clampSettings({}).weather).toBe(true);
    expect(clampSettings({ weather: false }).weather).toBe(false);
    expect(clampSettings({ weather: "off" }).weather).toBe(true);
    expect(clampSettings({ weather: 0 }).weather).toBe(true);
  });

  it("minimap defaults on; only an explicit false collapses it", () => {
    expect(clampSettings({}).minimap).toBe(true);
    expect(clampSettings({ minimap: false }).minimap).toBe(false);
    expect(clampSettings({ minimap: "off" }).minimap).toBe(true);
    expect(clampSettings({ minimap: 0 }).minimap).toBe(true);
  });

  it("combat feel defaults on; only an explicit false stills the camera", () => {
    expect(clampSettings({}).combatFeel).toBe(true);
    expect(clampSettings({ combatFeel: false }).combatFeel).toBe(false);
    expect(clampSettings({ combatFeel: "off" }).combatFeel).toBe(true);
    expect(clampSettings({ combatFeel: 0 }).combatFeel).toBe(true);
  });

  it("barks default on; only an explicit false silences the street", () => {
    expect(clampSettings({}).barks).toBe(true);
    expect(clampSettings({ barks: false }).barks).toBe(false);
    expect(clampSettings({ barks: "off" }).barks).toBe(true);
    expect(clampSettings({ barks: 0 }).barks).toBe(true);
  });

  it("rejects shake scales off the ladder", () => {
    for (const bad of [-1, 0.25, 2, "1", true, null, undefined]) {
      expect(clampSettings({ shakeScale: bad }).shakeScale).toBe(1);
      expect(clampShakeScale(bad)).toBe(1);
    }
    for (const scale of SHAKE_SCALES) {
      expect(clampShakeScale(scale)).toBe(scale);
      expect(clampSettings({ shakeScale: scale }).shakeScale).toBe(scale);
    }
  });

  it("rejects zoom values off the level ladder", () => {
    for (const bad of [0, 0.75, 3, "1.5", true, null]) {
      expect(clampSettings({ zoom: bad }).zoom).toBe(1);
      expect(clampZoom(bad)).toBe(1);
    }
    for (const level of ZOOM_LEVELS) {
      expect(clampZoom(level)).toBe(level);
    }
  });
});

describe("stepZoom", () => {
  it("walks the level ladder one step at a time", () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1.5, 1)).toBe(2);
    expect(stepZoom(2, -1)).toBe(1.5);
    expect(stepZoom(1.5, -1)).toBe(1);
  });

  it("clamps at both ends", () => {
    expect(stepZoom(2, 1)).toBe(2);
    expect(stepZoom(1, -1)).toBe(1);
  });
});

describe("parse / serialize / migrate", () => {
  it("round-trips through serialize and parse", () => {
    const settings = {
      textSpeed: "fast",
      reducedMotion: true,
      zoom: 1.5,
      glow: false,
      weather: false,
      minimap: false,
      combatFeel: false,
      shakeScale: 0.5,
      barks: false,
      difficulty: "blackout",
      assists: {
        "always-preview": true,
        "damage-floor": false,
        "bold-telegraphs": true,
        "breach-rescue": false,
      },
    } as const;
    expect(parseSettings(serializeSettings(settings))).toEqual(settings);
  });

  it("stamps the current version into the payload", () => {
    const raw = JSON.parse(serializeSettings(DEFAULT_SETTINGS)) as Record<
      string,
      unknown
    >;
    expect(raw.version).toBe(SETTINGS_VERSION);
  });

  it("falls back to defaults on missing or malformed payloads", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json {")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("[1,2]")).toEqual(DEFAULT_SETTINGS);
  });

  it("migrates unknown or future versions field-tolerantly", () => {
    expect(
      migrateSettings({ version: 99, textSpeed: "instant", extra: true }),
    ).toEqual({
      textSpeed: "instant",
      reducedMotion: false,
      zoom: 1,
      glow: true,
      weather: true,
      minimap: true,
      combatFeel: true,
      shakeScale: 1,
      barks: true,
      difficulty: DEFAULT_DIFFICULTY_ID,
      assists: noAssists(),
    });
    expect(migrateSettings({ version: "zero" })).toEqual(DEFAULT_SETTINGS);
  });

  it("migrates v1 payloads (no zoom yet) to the default zoom", () => {
    const v1 = JSON.stringify({
      version: 1,
      textSpeed: "fast",
      reducedMotion: true,
    });
    expect(parseSettings(v1)).toEqual({
      textSpeed: "fast",
      reducedMotion: true,
      zoom: 1,
      glow: true,
      weather: true,
      minimap: true,
      combatFeel: true,
      shakeScale: 1,
      barks: true,
      difficulty: DEFAULT_DIFFICULTY_ID,
      assists: noAssists(),
    });
  });

  it("migrates v2 payloads (no glow yet) with the pass enabled", () => {
    const v2 = JSON.stringify({
      version: 2,
      textSpeed: "fast",
      reducedMotion: false,
      zoom: 2,
    });
    expect(parseSettings(v2)).toEqual({
      textSpeed: "fast",
      reducedMotion: false,
      zoom: 2,
      glow: true,
      weather: true,
      minimap: true,
      combatFeel: true,
      shakeScale: 1,
      barks: true,
      difficulty: DEFAULT_DIFFICULTY_ID,
      assists: noAssists(),
    });
  });

  it("migrates v4 payloads (no minimap yet) with the corner shown", () => {
    const v4 = JSON.stringify({
      version: 4,
      textSpeed: "normal",
      reducedMotion: false,
      zoom: 1.5,
      glow: false,
      weather: false,
    });
    expect(parseSettings(v4)).toEqual({
      textSpeed: "normal",
      reducedMotion: false,
      zoom: 1.5,
      glow: false,
      weather: false,
      minimap: true,
      combatFeel: true,
      shakeScale: 1,
      barks: true,
      difficulty: DEFAULT_DIFFICULTY_ID,
      assists: noAssists(),
    });
  });

  it("migrates v6 payloads (no barks yet) with the street talking", () => {
    const v6 = JSON.stringify({
      version: 6,
      textSpeed: "normal",
      reducedMotion: true,
      zoom: 1,
      glow: true,
      weather: true,
      minimap: false,
      combatFeel: false,
      shakeScale: 0,
    });
    expect(parseSettings(v6)).toEqual({
      textSpeed: "normal",
      reducedMotion: true,
      zoom: 1,
      glow: true,
      weather: true,
      minimap: false,
      combatFeel: false,
      shakeScale: 0,
      barks: true,
      difficulty: DEFAULT_DIFFICULTY_ID,
      assists: noAssists(),
    });
  });

  it("migrates v5 payloads (no combat camera yet) with it enabled", () => {
    const v5 = JSON.stringify({
      version: 5,
      textSpeed: "fast",
      reducedMotion: false,
      zoom: 2,
      glow: true,
      weather: false,
      minimap: false,
    });
    expect(parseSettings(v5)).toEqual({
      textSpeed: "fast",
      reducedMotion: false,
      zoom: 2,
      glow: true,
      weather: false,
      minimap: false,
      combatFeel: true,
      shakeScale: 1,
      barks: true,
      difficulty: DEFAULT_DIFFICULTY_ID,
      assists: noAssists(),
    });
  });
});

describe("load / save", () => {
  it("loads defaults when storage is absent or empty", () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(fakeStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it("persists under the settings key, separate from save slots", () => {
    const storage = fakeStorage();
    saveSettings(
      {
        textSpeed: "instant",
        reducedMotion: true,
        zoom: 2,
        glow: false,
        weather: false,
        minimap: false,
        combatFeel: false,
        shakeScale: 1.5,
        barks: false,
        difficulty: "drift",
        assists: noAssists(),
      },
      storage,
    );
    expect(Object.keys(storage.data)).toEqual([SETTINGS_KEY]);
    expect(loadSettings(storage)).toEqual({
      textSpeed: "instant",
      reducedMotion: true,
      zoom: 2,
      glow: false,
      weather: false,
      minimap: false,
      combatFeel: false,
      shakeScale: 1.5,
      barks: false,
      difficulty: "drift",
      assists: noAssists(),
    });
  });

  it("survives storage that throws", () => {
    const broken: SettingsStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, broken)).not.toThrow();
  });
});

describe("revealDelayMs", () => {
  it("is zero for every character at instant speed", () => {
    expect(revealDelayMs(0, "instant")).toBe(0);
    expect(revealDelayMs(50, "instant")).toBe(0);
  });

  it("grows linearly with the character index", () => {
    expect(revealDelayMs(0, "normal")).toBe(0);
    expect(revealDelayMs(10, "normal")).toBe(10 * 28);
    expect(revealDelayMs(10, "fast")).toBe(10 * 12);
  });

  it("is faster at fast than normal for the same index", () => {
    expect(revealDelayMs(20, "fast")).toBeLessThan(revealDelayMs(20, "normal"));
  });
});

describe("settings store", () => {
  it("loads persisted settings at creation", () => {
    const storage = fakeStorage();
    saveSettings(
      {
        textSpeed: "fast",
        reducedMotion: true,
        zoom: 1.5,
        glow: true,
        weather: true,
        minimap: true,
        combatFeel: true,
        shakeScale: 1,
        barks: true,
        difficulty: "grind",
        assists: noAssists(),
      },
      storage,
    );
    const store = createSettingsStore(storage);
    expect(store.get()).toEqual({
      textSpeed: "fast",
      reducedMotion: true,
      zoom: 1.5,
      glow: true,
      weather: true,
      minimap: true,
      combatFeel: true,
      shakeScale: 1,
      barks: true,
      difficulty: DEFAULT_DIFFICULTY_ID,
      assists: noAssists(),
    });
  });

  it("updates merge, clamp, persist, and notify subscribers", () => {
    const storage = fakeStorage();
    const store = createSettingsStore(storage);
    const seen: string[] = [];
    const unsubscribe = store.subscribe((s) => seen.push(s.textSpeed));

    store.update({ textSpeed: "instant" });
    expect(store.get()).toEqual({
      textSpeed: "instant",
      reducedMotion: false,
      zoom: 1,
      glow: true,
      weather: true,
      minimap: true,
      combatFeel: true,
      shakeScale: 1,
      barks: true,
      difficulty: DEFAULT_DIFFICULTY_ID,
      assists: noAssists(),
    });
    expect(loadSettings(storage).textSpeed).toBe("instant");
    expect(seen).toEqual(["instant"]);

    unsubscribe();
    store.update({ reducedMotion: true });
    expect(seen).toEqual(["instant"]);
    expect(store.get().reducedMotion).toBe(true);
    // The earlier field survives a partial update.
    expect(store.get().textSpeed).toBe("instant");
  });

  it("persists the chosen zoom level across stores", () => {
    const storage = fakeStorage();
    createSettingsStore(storage).update({ zoom: 2 });
    expect(createSettingsStore(storage).get().zoom).toBe(2);
  });

  it("persists the glow toggle across stores", () => {
    const storage = fakeStorage();
    createSettingsStore(storage).update({ glow: false });
    expect(createSettingsStore(storage).get().glow).toBe(false);
  });
});

describe("reducedMotionActive", () => {
  const os = (matches: boolean) => ({
    matchMedia: (query: string) => {
      expect(query).toBe("(prefers-reduced-motion: reduce)");
      return { matches };
    },
  });

  it("is on when the in-game setting asks, regardless of the OS", () => {
    const current = { ...DEFAULT_SETTINGS, reducedMotion: true };
    expect(reducedMotionActive(current, os(false))).toBe(true);
    expect(reducedMotionActive(current, null)).toBe(true);
  });

  it("is on when the OS preference asks, even with the setting off", () => {
    expect(reducedMotionActive(DEFAULT_SETTINGS, os(true))).toBe(true);
  });

  it("is off when neither asks, or matchMedia is unavailable/broken", () => {
    expect(reducedMotionActive(DEFAULT_SETTINGS, os(false))).toBe(false);
    expect(reducedMotionActive(DEFAULT_SETTINGS, null)).toBe(false);
    expect(reducedMotionActive(DEFAULT_SETTINGS, {})).toBe(false);
    expect(
      reducedMotionActive(DEFAULT_SETTINGS, {
        matchMedia: () => {
          throw new Error("no media queries here");
        },
      }),
    ).toBe(false);
  });
});

/**
 * The difficulty and assist *preferences*: what a new run starts on.
 * What a run is actually being played under is on its own GameState
 * (see src/state/rules.test.ts); this is the half that persists across
 * runs and across sessions.
 */
describe("the difficulty and assist preference", () => {
  it("defaults to the middle preset with every assist off", () => {
    expect(DEFAULT_SETTINGS.difficulty).toBe(DEFAULT_DIFFICULTY_ID);
    expect(DEFAULT_SETTINGS.assists).toEqual(noAssists());
  });

  it("clamps a preset this build does not have", () => {
    expect(clampSettings({ difficulty: "nightmare" }).difficulty).toBe(
      DEFAULT_DIFFICULTY_ID,
    );
    expect(clampSettings({ difficulty: "drift" }).difficulty).toBe("drift");
  });

  it("clamps the switchboard to a complete one, unknown keys dropped", () => {
    expect(
      clampSettings({ assists: { "damage-floor": true, "auto-win": true } })
        .assists,
    ).toEqual({ ...noAssists(), "damage-floor": true });
  });

  it("round-trips every switch through storage", () => {
    const storage = fakeStorage();
    const store = createSettingsStore(storage);
    store.update({
      difficulty: "blackout",
      assists: {
        "always-preview": true,
        "damage-floor": true,
        "bold-telegraphs": true,
        "breach-rescue": true,
      },
    });
    const reopened = createSettingsStore(storage);
    expect(reopened.get().difficulty).toBe("blackout");
    expect(reopened.get().assists).toEqual({
      "always-preview": true,
      "damage-floor": true,
      "bold-telegraphs": true,
      "breach-rescue": true,
    });
  });

  it("hands a fresh run the preference, unmarked", () => {
    const rules = settingsRules(
      clampSettings({
        difficulty: "drift",
        assists: { "bold-telegraphs": true },
      }),
    );
    expect(rules.difficulty).toBe("drift");
    expect(rules.assists).toEqual({ ...noAssists(), "bold-telegraphs": true });
    expect(rules.difficultyChanged).toBe(false);
  });

  it("gives a v7 payload — the last without them — the documented defaults", () => {
    const v7 = JSON.stringify({
      version: 7,
      textSpeed: "fast",
      reducedMotion: false,
      zoom: 2,
      glow: true,
      weather: true,
      minimap: true,
      combatFeel: true,
      shakeScale: 1,
      barks: true,
    });
    const migrated = parseSettings(v7);
    expect(migrated.difficulty).toBe(DEFAULT_DIFFICULTY_ID);
    expect(migrated.assists).toEqual(noAssists());
    // Everything the old payload did say survives intact.
    expect(migrated.textSpeed).toBe("fast");
    expect(migrated.zoom).toBe(2);
  });
});
