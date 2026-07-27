import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  clampSettings,
  loadSettings,
  migrateSettings,
  parseSettings,
  revealDelayMs,
  saveSettings,
  serializeSettings,
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
      clampSettings({ textSpeed: "fast", reducedMotion: "yes" }),
    ).toEqual({ textSpeed: "fast", reducedMotion: false });
    expect(
      clampSettings({ textSpeed: "warp", reducedMotion: true }),
    ).toEqual({ textSpeed: "normal", reducedMotion: true });
  });

  it("ignores unknown fields", () => {
    expect(clampSettings({ textSpeed: "instant", volume: 3 })).toEqual({
      textSpeed: "instant",
      reducedMotion: false,
    });
  });
});

describe("parse / serialize / migrate", () => {
  it("round-trips through serialize and parse", () => {
    const settings = { textSpeed: "fast", reducedMotion: true } as const;
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
    ).toEqual({ textSpeed: "instant", reducedMotion: false });
    expect(migrateSettings({ version: "zero" })).toEqual(DEFAULT_SETTINGS);
  });
});

describe("load / save", () => {
  it("loads defaults when storage is absent or empty", () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(fakeStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it("persists under the settings key, separate from save slots", () => {
    const storage = fakeStorage();
    saveSettings({ textSpeed: "instant", reducedMotion: true }, storage);
    expect(Object.keys(storage.data)).toEqual([SETTINGS_KEY]);
    expect(loadSettings(storage)).toEqual({
      textSpeed: "instant",
      reducedMotion: true,
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
    saveSettings({ textSpeed: "fast", reducedMotion: true }, storage);
    const store = createSettingsStore(storage);
    expect(store.get()).toEqual({ textSpeed: "fast", reducedMotion: true });
  });

  it("updates merge, clamp, persist, and notify subscribers", () => {
    const storage = fakeStorage();
    const store = createSettingsStore(storage);
    const seen: string[] = [];
    const unsubscribe = store.subscribe((s) => seen.push(s.textSpeed));

    store.update({ textSpeed: "instant" });
    expect(store.get()).toEqual({ textSpeed: "instant", reducedMotion: false });
    expect(loadSettings(storage).textSpeed).toBe("instant");
    expect(seen).toEqual(["instant"]);

    unsubscribe();
    store.update({ reducedMotion: true });
    expect(seen).toEqual(["instant"]);
    expect(store.get().reducedMotion).toBe(true);
    // The earlier field survives a partial update.
    expect(store.get().textSpeed).toBe("instant");
  });
});
