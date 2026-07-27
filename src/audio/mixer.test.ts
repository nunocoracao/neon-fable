import { describe, expect, it } from "vitest";
import {
  AUDIO_SETTINGS_KEY,
  DEFAULT_MIXER,
  clamp01,
  effectiveGain,
  loadMixerSettings,
  parseMixer,
  saveMixerSettings,
  serializeMixer,
  setMuted,
  setVolume,
  toggleMuted,
  type AudioSettingsStorage,
} from "./mixer";

function memoryStorage(): AudioSettingsStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

describe("clamp01", () => {
  it("clamps into [0,1]", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(7)).toBe(1);
  });

  it("collapses non-finite values to 0", () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clamp01(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("setVolume", () => {
  it("sets and clamps each channel without mutating the input", () => {
    const before = { ...DEFAULT_MIXER };
    const after = setVolume(before, "sfx", 1.5);
    expect(after.sfx).toBe(1);
    expect(before).toEqual(DEFAULT_MIXER);
    expect(setVolume(before, "master", -1).master).toBe(0);
    expect(setVolume(before, "music", 0.25).music).toBe(0.25);
  });
});

describe("mute", () => {
  it("setMuted and toggleMuted flip the flag immutably", () => {
    const muted = setMuted(DEFAULT_MIXER, true);
    expect(muted.muted).toBe(true);
    expect(DEFAULT_MIXER.muted).toBe(false);
    expect(toggleMuted(muted).muted).toBe(false);
    expect(toggleMuted(DEFAULT_MIXER).muted).toBe(true);
  });
});

describe("effectiveGain", () => {
  it("is the product of master and the channel volume", () => {
    const state = { master: 0.5, sfx: 0.8, music: 0.2, muted: false };
    expect(effectiveGain(state, "sfx")).toBeCloseTo(0.4);
    expect(effectiveGain(state, "music")).toBeCloseTo(0.1);
  });

  it("is 0 while muted regardless of volumes", () => {
    const state = { master: 1, sfx: 1, music: 1, muted: true };
    expect(effectiveGain(state, "sfx")).toBe(0);
    expect(effectiveGain(state, "music")).toBe(0);
  });
});

describe("persistence", () => {
  it("round-trips through serialize/parse", () => {
    const state = { master: 0.7, sfx: 0.3, music: 0.9, muted: true };
    expect(parseMixer(serializeMixer(state))).toEqual(state);
  });

  it("round-trips through storage", () => {
    const storage = memoryStorage();
    const state = { master: 0.25, sfx: 1, music: 0, muted: false };
    saveMixerSettings(state, storage);
    expect(storage.data.has(AUDIO_SETTINGS_KEY)).toBe(true);
    expect(loadMixerSettings(storage)).toEqual(state);
  });

  it("falls back to defaults on missing or malformed data", () => {
    expect(parseMixer(null)).toEqual(DEFAULT_MIXER);
    expect(parseMixer("not json{")).toEqual(DEFAULT_MIXER);
    expect(parseMixer('"just a string"')).toEqual(DEFAULT_MIXER);
    expect(loadMixerSettings(memoryStorage())).toEqual(DEFAULT_MIXER);
    expect(loadMixerSettings(null)).toEqual(DEFAULT_MIXER);
  });

  it("clamps and defaults individual bad fields", () => {
    const parsed = parseMixer(
      JSON.stringify({ master: 4, sfx: "loud", music: -2, muted: "yes" }),
    );
    expect(parsed.master).toBe(1);
    expect(parsed.sfx).toBe(DEFAULT_MIXER.sfx);
    expect(parsed.music).toBe(0);
    expect(parsed.muted).toBe(false);
  });

  it("never throws when storage is broken", () => {
    const broken: AudioSettingsStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadMixerSettings(broken)).toEqual(DEFAULT_MIXER);
    expect(() => saveMixerSettings(DEFAULT_MIXER, broken)).not.toThrow();
  });
});
