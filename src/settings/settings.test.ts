import { describe, expect, it } from "vitest";
import { DEFAULT_MIXER, migrateLegacyMixer, LEGACY_AUDIO_KEY } from "../audio/mixer";
import {
  COLOR_MODES,
  DEFAULT_COLOR_MODE,
  DEFAULT_TEXT_SCALE,
  MOTION_PREFERENCES,
  TEXT_SCALES,
} from "../data/accessibility";
import { noAssists } from "../data/assists";
import { DEFAULT_DIFFICULTY_ID } from "../data/difficulty";
import {
  DEFAULT_SETTINGS,
  GRAPHICS_SETTING_KEYS,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  SHAKE_SCALES,
  ZOOM_LEVELS,
  adoptLegacyMixer,
  clampSettings,
  clampShakeScale,
  clampZoom,
  loadSettings,
  migrateSettings,
  parseSettings,
  resetGraphicsSettings,
  revealDelayMs,
  saveSettings,
  serializeSettings,
  settingsRules,
  stepZoom,
  type Settings,
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
      clampSettings({ textSpeed: "fast", motion: "sideways", zoom: 1.5 }),
    ).toEqual({ ...DEFAULT_SETTINGS, textSpeed: "fast", zoom: 1.5 });
    expect(clampSettings({ textSpeed: "warp", motion: "reduced" })).toEqual({
      ...DEFAULT_SETTINGS,
      motion: "reduced",
    });
  });

  it("ignores unknown fields", () => {
    expect(clampSettings({ textSpeed: "instant", volume: 3 })).toEqual({
      ...DEFAULT_SETTINGS,
      textSpeed: "instant",
    });
  });

  it("set pieces default on; only an explicit false parks the city", () => {
    expect(clampSettings({}).setPieces).toBe(true);
    expect(clampSettings({ setPieces: false }).setPieces).toBe(false);
    expect(clampSettings({ setPieces: "off" }).setPieces).toBe(true);
    expect(clampSettings({ setPieces: 0 }).setPieces).toBe(true);
  });

  it("defers to the device for motion unless told otherwise", () => {
    expect(clampSettings({}).motion).toBe("system");
    for (const preference of MOTION_PREFERENCES) {
      expect(clampSettings({ motion: preference }).motion).toBe(preference);
    }
    for (const bad of ["off", true, 1, null]) {
      expect(clampSettings({ motion: bad }).motion).toBe("system");
    }
  });

  it("rejects colour modes and text sizes off their ladders", () => {
    expect(clampSettings({}).colorMode).toBe(DEFAULT_COLOR_MODE);
    expect(clampSettings({}).textScale).toBe(DEFAULT_TEXT_SCALE);
    for (const mode of COLOR_MODES) {
      expect(clampSettings({ colorMode: mode }).colorMode).toBe(mode);
    }
    for (const scale of TEXT_SCALES) {
      expect(clampSettings({ textScale: scale }).textScale).toBe(scale);
    }
    for (const bad of ["huge", 2, 0, null, true]) {
      expect(clampSettings({ colorMode: bad }).colorMode).toBe(
        DEFAULT_COLOR_MODE,
      );
      expect(clampSettings({ textScale: bad }).textScale).toBe(
        DEFAULT_TEXT_SCALE,
      );
    }
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
    const settings: Settings = {
      textSpeed: "fast",
      motion: "reduced",
      zoom: 1.5,
      glow: false,
      weather: false,
      setPieces: false,
      minimap: false,
      combatFeel: false,
      shakeScale: 0.5,
      barks: false,
      colorMode: "assist",
      textScale: 1.3,
      difficulty: "blackout",
      assists: {
        "always-preview": true,
        "damage-floor": false,
        "bold-telegraphs": true,
        "breach-rescue": false,
      },
      mixer: DEFAULT_MIXER,
    };
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
    ).toEqual({ ...DEFAULT_SETTINGS, textSpeed: "instant" });
    expect(migrateSettings({ version: "zero" })).toEqual(DEFAULT_SETTINGS);
  });

  it("migrates v1 payloads (no zoom yet) to the default zoom", () => {
    const v1 = JSON.stringify({
      version: 1,
      textSpeed: "fast",
      reducedMotion: true,
    });
    expect(parseSettings(v1)).toEqual({
      ...DEFAULT_SETTINGS,
      textSpeed: "fast",
      motion: "reduced",
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
      ...DEFAULT_SETTINGS,
      textSpeed: "fast",
      zoom: 2,
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
      ...DEFAULT_SETTINGS,
      zoom: 1.5,
      glow: false,
      weather: false,
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
      ...DEFAULT_SETTINGS,
      motion: "reduced",
      minimap: false,
      combatFeel: false,
      shakeScale: 0,
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
      ...DEFAULT_SETTINGS,
      textSpeed: "fast",
      zoom: 2,
      weather: false,
      minimap: false,
    });
  });

  it("migrates v9 payloads: an untouched switch still means the device", () => {
    // The v9 selector was `setting || OS preference`, so `false` never
    // meant "full motion" — it meant nobody had said. Only the players
    // who actually turned it on are carried to an explicit override.
    const untouched = JSON.stringify({
      version: 9,
      textSpeed: "fast",
      reducedMotion: false,
    });
    expect(parseSettings(untouched).motion).toBe("system");
    const asked = JSON.stringify({ version: 9, reducedMotion: true });
    expect(parseSettings(asked).motion).toBe("reduced");
  });

  it("migrates v9 payloads to the shipped comfort defaults", () => {
    const v9 = JSON.stringify({
      version: 9,
      textSpeed: "instant",
      reducedMotion: false,
      zoom: 2,
      glow: false,
      weather: false,
      minimap: false,
      combatFeel: false,
      shakeScale: 0,
      barks: false,
    });
    expect(parseSettings(v9)).toEqual({
      ...DEFAULT_SETTINGS,
      textSpeed: "instant",
      zoom: 2,
      glow: false,
      weather: false,
      minimap: false,
      combatFeel: false,
      shakeScale: 0,
      barks: false,
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
    const stored: Settings = {
      ...DEFAULT_SETTINGS,
      textSpeed: "instant",
      motion: "reduced",
      zoom: 2,
      glow: false,
      weather: false,
      setPieces: false,
      minimap: false,
      combatFeel: false,
      shakeScale: 1.5,
      barks: false,
      colorMode: "assist",
      textScale: 1.15,
      difficulty: "drift",
    };
    saveSettings(stored, storage);
    expect(Object.keys(storage.data)).toEqual([SETTINGS_KEY]);
    expect(loadSettings(storage)).toEqual(stored);
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
        ...DEFAULT_SETTINGS,
        textSpeed: "fast",
        motion: "reduced",
        zoom: 1.5,
        difficulty: "grind",
      },
      storage,
    );
    const store = createSettingsStore(storage);
    expect(store.get()).toEqual({
      ...DEFAULT_SETTINGS,
      textSpeed: "fast",
      motion: "reduced",
      zoom: 1.5,
      difficulty: DEFAULT_DIFFICULTY_ID,
    });
  });

  it("updates merge, clamp, persist, and notify subscribers", () => {
    const storage = fakeStorage();
    const store = createSettingsStore(storage);
    const seen: string[] = [];
    const unsubscribe = store.subscribe((s) => seen.push(s.textSpeed));

    store.update({ textSpeed: "instant" });
    expect(store.get()).toEqual({
      ...DEFAULT_SETTINGS,
      textSpeed: "instant",
    });
    expect(loadSettings(storage).textSpeed).toBe("instant");
    expect(seen).toEqual(["instant"]);

    unsubscribe();
    store.update({ motion: "reduced" });
    expect(seen).toEqual(["instant"]);
    expect(store.get().motion).toBe("reduced");
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

  it("is on when the player asks for it, regardless of the OS", () => {
    const current: Settings = { ...DEFAULT_SETTINGS, motion: "reduced" };
    expect(reducedMotionActive(current, os(false))).toBe(true);
    expect(reducedMotionActive(current, null)).toBe(true);
  });

  it("defers to the OS preference by default, in both directions", () => {
    expect(DEFAULT_SETTINGS.motion).toBe("system");
    expect(reducedMotionActive(DEFAULT_SETTINGS, os(true))).toBe(true);
    expect(reducedMotionActive(DEFAULT_SETTINGS, os(false))).toBe(false);
  });

  it("lets an explicit full override a device that asks to reduce", () => {
    const current: Settings = { ...DEFAULT_SETTINGS, motion: "full" };
    expect(reducedMotionActive(current, os(true))).toBe(false);
    expect(reducedMotionActive(current, os(false))).toBe(false);
    // The override is the whole point: it never consults the device.
    expect(
      reducedMotionActive(current, {
        matchMedia: () => {
          throw new Error("never asked");
        },
      }),
    ).toBe(false);
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
/**
 * "Reset this section" is the one control on the panel that writes
 * eleven fields at once, which makes both halves of its promise worth
 * pinning: everything it covers really goes back, and everything it
 * does not cover really stays.
 */
describe("resetGraphicsSettings", () => {
  /** Every graphics field moved off its default, and then some. */
  const fiddled: Settings = {
    ...DEFAULT_SETTINGS,
    motion: "reduced",
    zoom: 2,
    glow: false,
    weather: false,
    setPieces: false,
    minimap: false,
    combatFeel: false,
    shakeScale: 0,
    barks: false,
    colorMode: "assist",
    textScale: 1.3,
    // Not the section's, and not to be touched by it.
    textSpeed: "instant",
    difficulty: "blackout",
    assists: { ...noAssists(), "bold-telegraphs": true },
  };

  it("names only fields that exist, with no repeats", () => {
    expect(new Set(GRAPHICS_SETTING_KEYS).size).toBe(
      GRAPHICS_SETTING_KEYS.length,
    );
    for (const key of GRAPHICS_SETTING_KEYS) {
      expect(DEFAULT_SETTINGS[key], key).toBeDefined();
    }
  });

  it("puts every field it covers back to the shipped default", () => {
    const reset = resetGraphicsSettings(fiddled);
    for (const key of GRAPHICS_SETTING_KEYS) {
      expect(reset[key], key).toEqual(DEFAULT_SETTINGS[key]);
    }
  });

  it("leaves everything outside the section exactly where it was", () => {
    const reset = resetGraphicsSettings(fiddled);
    expect(reset.textSpeed).toBe("instant");
    expect(reset.difficulty).toBe("blackout");
    expect(reset.assists["bold-telegraphs"]).toBe(true);
    expect(reset.mixer).toEqual(fiddled.mixer);
  });

  it("is a no-op on settings already at their defaults", () => {
    expect(resetGraphicsSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips through storage: a reset is what loads next time", () => {
    const storage = fakeStorage();
    const store = createSettingsStore(storage);
    store.update(fiddled);
    expect(loadSettings(storage).colorMode).toBe("assist");
    store.update(resetGraphicsSettings(store.get()));
    const reloaded = loadSettings(storage);
    for (const key of GRAPHICS_SETTING_KEYS) {
      expect(reloaded[key], key).toEqual(DEFAULT_SETTINGS[key]);
    }
    expect(reloaded.textSpeed).toBe("instant");
  });
});

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

// --- The mixer moving into the settings store ---------------------------
//
// The mixer used to have a localStorage record of its own. These pin the
// one thing that upgrade must not do: change what an existing player
// hears the next time they open the game.

describe("the mixer in settings", () => {
  it("gives a fresh install the documented defaults", () => {
    expect(clampSettings({}).mixer).toEqual(DEFAULT_MIXER);
    expect(DEFAULT_SETTINGS.mixer).toEqual(DEFAULT_MIXER);
  });

  it("round-trips a moved mixer through serialize and parse", () => {
    const settings = clampSettings({
      ...DEFAULT_SETTINGS,
      mixer: {
        volumes: { master: 0.42, music: 0, sfx: 1, ui: 0.6 },
        mutes: { master: false, music: true, sfx: false, ui: false },
        duckOnBlur: false,
      },
    });
    const reloaded = parseSettings(serializeSettings(settings));
    expect(reloaded.mixer).toEqual(settings.mixer);
    expect(reloaded).toEqual(settings);
  });

  it("survives the store, so a fader move outlives the session", () => {
    const storage = fakeStorage();
    const store = createSettingsStore(storage);
    store.update({
      mixer: { ...DEFAULT_MIXER, volumes: { ...DEFAULT_MIXER.volumes, ui: 0.2 } },
    });
    expect(createSettingsStore(storage).get().mixer.volumes.ui).toBe(0.2);
  });

  it("clamps a corrupt mixer rather than losing the whole payload", () => {
    const settings = parseSettings(
      JSON.stringify({ version: SETTINGS_VERSION, textSpeed: "fast", mixer: 7 }),
    );
    expect(settings.mixer).toEqual(DEFAULT_MIXER);
    expect(settings.textSpeed).toBe("fast");
  });
});

describe("adoptLegacyMixer", () => {
  const legacy = JSON.stringify({
    master: 0.5,
    sfx: 0.8,
    music: 0.4,
    muted: false,
  });

  it("adopts the old record when the payload has no mixer of its own", () => {
    const v8 = { version: 8, textSpeed: "fast" };
    const adopted = adoptLegacyMixer(clampSettings(v8), v8, legacy);
    expect(adopted.mixer).toEqual(migrateLegacyMixer(JSON.parse(legacy)));
    // And nothing else about the payload moved.
    expect(adopted.textSpeed).toBe("fast");
  });

  it("leaves a payload that already has a mixer alone", () => {
    const current = clampSettings({
      mixer: { ...DEFAULT_MIXER, volumes: { ...DEFAULT_MIXER.volumes, ui: 0.1 } },
    });
    const adopted = adoptLegacyMixer(
      current,
      { version: SETTINGS_VERSION, mixer: current.mixer },
      legacy,
    );
    expect(adopted.mixer.volumes.ui).toBe(0.1);
    expect(adopted).toBe(current);
  });

  it("does nothing when there is no old record", () => {
    const current = clampSettings({ version: 8 });
    expect(adoptLegacyMixer(current, { version: 8 }, null)).toBe(current);
  });

  it("degrades a corrupt old record to defaults instead of throwing", () => {
    const current = clampSettings({ version: 8 });
    expect(adoptLegacyMixer(current, { version: 8 }, "not json {")).toBe(
      current,
    );
    expect(current.mixer).toEqual(DEFAULT_MIXER);
  });
});

describe("loading an install that predates the four buses", () => {
  it("finds the old audio record and keeps its levels", () => {
    // A v8 install: settings under one key, the mixer under another.
    const storage = fakeStorage({
      [SETTINGS_KEY]: JSON.stringify({
        version: 8,
        textSpeed: "fast",
        zoom: 2,
        barks: false,
      }),
      [LEGACY_AUDIO_KEY]: JSON.stringify({
        master: 0.5,
        sfx: 0.8,
        music: 0.4,
        muted: false,
      }),
    });
    const loaded = loadSettings(storage);
    expect(loaded.mixer).toEqual(
      migrateLegacyMixer({ master: 0.5, sfx: 0.8, music: 0.4, muted: false }),
    );
    // Everything the v8 payload did say survives intact.
    expect(loaded.textSpeed).toBe("fast");
    expect(loaded.zoom).toBe(2);
    expect(loaded.barks).toBe(false);
    // The old record is left where it is: nothing deletes a player's data.
    expect(storage.data[LEGACY_AUDIO_KEY]).toBeDefined();
  });

  it("adopts the old record even when the settings payload is unreadable", () => {
    const storage = fakeStorage({
      [SETTINGS_KEY]: "not json {",
      [LEGACY_AUDIO_KEY]: JSON.stringify({ master: 0.25, sfx: 1, music: 1 }),
    });
    const loaded = loadSettings(storage);
    expect(loaded.mixer.volumes.master).toBe(
      migrateLegacyMixer({ master: 0.25 }).volumes.master,
    );
    expect(loaded.textSpeed).toBe(DEFAULT_SETTINGS.textSpeed);
  });

  it("stops adopting once settings have been written back", () => {
    const storage = fakeStorage({
      [SETTINGS_KEY]: JSON.stringify({ version: 8 }),
      [LEGACY_AUDIO_KEY]: JSON.stringify({ master: 0.5, sfx: 0.8, music: 0.4 }),
    });
    const store = createSettingsStore(storage);
    const adopted = store.get().mixer;
    expect(adopted).not.toEqual(DEFAULT_MIXER);

    // Any write persists the mixer where it now belongs; the old record
    // stops being consulted, and the adopted levels are what is kept.
    store.update({ textSpeed: "instant" });
    expect(createSettingsStore(storage).get().mixer).toEqual(adopted);

    // Even if the old record is later changed by nothing at all.
    storage.data[LEGACY_AUDIO_KEY] = JSON.stringify({ master: 1, sfx: 1 });
    expect(createSettingsStore(storage).get().mixer).toEqual(adopted);
  });

  it("gives a fresh install with no old record the defaults", () => {
    expect(loadSettings(fakeStorage()).mixer).toEqual(DEFAULT_MIXER);
  });
});
