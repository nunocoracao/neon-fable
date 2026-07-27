/**
 * Mixer state: master/sfx/music volumes and mute, persisted to
 * localStorage separately from save slots (device preference, not game
 * state). Pure functions over a plain object; the storage interface is
 * injectable so tests run against an in-memory fake.
 */

export type VolumeChannel = "master" | "sfx" | "music";

export interface MixerState {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
}

export const DEFAULT_MIXER: MixerState = {
  master: 0.8,
  sfx: 0.9,
  music: 0.6,
  muted: false,
};

/** Clamps a volume into [0,1]; non-finite values collapse to 0. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function setVolume(
  state: MixerState,
  channel: VolumeChannel,
  value: number,
): MixerState {
  return { ...state, [channel]: clamp01(value) };
}

export function setMuted(state: MixerState, muted: boolean): MixerState {
  return { ...state, muted };
}

export function toggleMuted(state: MixerState): MixerState {
  return { ...state, muted: !state.muted };
}

/** Effective output gain for a playback channel after master and mute. */
export function effectiveGain(
  state: MixerState,
  channel: "sfx" | "music",
): number {
  if (state.muted) return 0;
  return clamp01(state.master) * clamp01(state[channel]);
}

// --- Persistence -------------------------------------------------------

/** Minimal storage surface; window.localStorage satisfies it. */
export interface AudioSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const AUDIO_SETTINGS_KEY = "neon-fable:audio";

export function serializeMixer(state: MixerState): string {
  return JSON.stringify({
    master: clamp01(state.master),
    sfx: clamp01(state.sfx),
    music: clamp01(state.music),
    muted: state.muted === true,
  });
}

/** Tolerant parse: anything malformed falls back to defaults, fields clamp. */
export function parseMixer(raw: string | null): MixerState {
  if (raw === null) return { ...DEFAULT_MIXER };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_MIXER };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ...DEFAULT_MIXER };
  }
  const record = parsed as Record<string, unknown>;
  const volume = (key: VolumeChannel): number =>
    typeof record[key] === "number"
      ? clamp01(record[key] as number)
      : DEFAULT_MIXER[key];
  return {
    master: volume("master"),
    sfx: volume("sfx"),
    music: volume("music"),
    muted: record.muted === true,
  };
}

export function loadMixerSettings(
  storage: AudioSettingsStorage | null,
): MixerState {
  if (!storage) return { ...DEFAULT_MIXER };
  try {
    return parseMixer(storage.getItem(AUDIO_SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_MIXER };
  }
}

export function saveMixerSettings(
  state: MixerState,
  storage: AudioSettingsStorage | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(AUDIO_SETTINGS_KEY, serializeMixer(state));
  } catch {
    // Quota or privacy-mode failures lose the preference, never the game.
  }
}
