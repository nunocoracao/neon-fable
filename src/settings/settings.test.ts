import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  ZOOM_LEVELS,
  clampSettings,
  clampZoom,
  loadSettings,
  migrateSettings,
  parseSettings,
  revealDelayMs,
  saveSettings,
  serializeSettings,
  stepZoom,
  type SettingsStorage,
} from "./settings";
import { createSettingsStore } from "./store";

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
    ).toEqual({ textSpeed: "fast", reducedMotion: false, zoom: 1.5, glow: true });
    expect(
      clampSettings({ textSpeed: "warp", reducedMotion: true }),
    ).toEqual({ textSpeed: "normal", reducedMotion: true, zoom: 1, glow: true });
  });

  it("ignores unknown fields", () => {
    expect(clampSettings({ textSpeed: "instant", volume: 3 })).toEqual({
      textSpeed: "instant",
      reducedMotion: false,
      zoom: 1,
      glow: true,
    });
  });

  it("glow defaults on; only an explicit false disables it", () => {
    expect(clampSettings({}).glow).toBe(true);
    expect(clampSettings({ glow: false }).glow).toBe(false);
    expect(clampSettings({ glow: "off" }).glow).toBe(true);
    expect(clampSettings({ glow: 0 }).glow).toBe(true);
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
    ).toEqual({ textSpeed: "instant", reducedMotion: false, zoom: 1, glow: true });
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
      { textSpeed: "instant", reducedMotion: true, zoom: 2, glow: false },
      storage,
    );
    expect(Object.keys(storage.data)).toEqual([SETTINGS_KEY]);
    expect(loadSettings(storage)).toEqual({
      textSpeed: "instant",
      reducedMotion: true,
      zoom: 2,
      glow: false,
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
      { textSpeed: "fast", reducedMotion: true, zoom: 1.5, glow: true },
      storage,
    );
    const store = createSettingsStore(storage);
    expect(store.get()).toEqual({
      textSpeed: "fast",
      reducedMotion: true,
      zoom: 1.5,
      glow: true,
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
