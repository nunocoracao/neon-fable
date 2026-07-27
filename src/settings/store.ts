import {
  clampSettings,
  loadSettings,
  saveSettings,
  type Settings,
  type SettingsStorage,
} from "./settings";

/**
 * Live settings for a running game: loads once from storage, persists
 * every update, and notifies subscribers so screens and scenes can
 * react (reduced-motion class, ambient loops) without polling storage.
 */
export interface SettingsStore {
  get(): Settings;
  update(patch: Partial<Settings>): Settings;
  /** Returns an unsubscribe function. */
  subscribe(listener: (settings: Settings) => void): () => void;
}

export function createSettingsStore(
  storage: SettingsStorage | null,
): SettingsStore {
  let current = loadSettings(storage);
  const listeners = new Set<(settings: Settings) => void>();

  return {
    get(): Settings {
      return current;
    },

    update(patch: Partial<Settings>): Settings {
      current = clampSettings({ ...current, ...patch });
      saveSettings(current, storage);
      for (const listener of [...listeners]) listener(current);
      return current;
    },

    subscribe(listener: (settings: Settings) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
