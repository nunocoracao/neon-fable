/**
 * Player-facing game settings: dialogue text speed and reduced motion.
 * Persisted to localStorage separately from save slots (device
 * preference, not game state) and separately from the audio mixer,
 * which the audio bus owns. Pure functions over a plain object; the
 * storage interface is injectable so tests run against an in-memory
 * fake.
 */

export const TEXT_SPEEDS = ["instant", "fast", "normal"] as const;
export type TextSpeed = (typeof TEXT_SPEEDS)[number];

export interface Settings {
  textSpeed: TextSpeed;
  reducedMotion: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  textSpeed: "normal",
  reducedMotion: false,
};

export const SETTINGS_KEY = "neon-fable:settings";

/** Bump when the Settings shape changes; migrateSettings routes on it. */
export const SETTINGS_VERSION = 1;

/** Per-character reveal delay for the dialogue typewriter, in ms. */
export const TEXT_SPEED_CHAR_MS: Record<TextSpeed, number> = {
  instant: 0,
  fast: 12,
  normal: 28,
};

/** Delay before the character at charIndex becomes visible. */
export function revealDelayMs(charIndex: number, speed: TextSpeed): number {
  if (charIndex <= 0) return 0;
  return charIndex * TEXT_SPEED_CHAR_MS[speed];
}

/** Coerces any value into a valid Settings, field by field. */
export function clampSettings(value: unknown): Settings {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_SETTINGS };
  }
  const record = value as Record<string, unknown>;
  const textSpeed = TEXT_SPEEDS.includes(record.textSpeed as TextSpeed)
    ? (record.textSpeed as TextSpeed)
    : DEFAULT_SETTINGS.textSpeed;
  return { textSpeed, reducedMotion: record.reducedMotion === true };
}

/**
 * Migrates a parsed payload from any stored version to the current
 * shape. There is only v1 so far, so every version routes through the
 * field-tolerant clamp — unknown or future versions degrade to
 * defaults per field instead of crashing.
 */
export function migrateSettings(parsed: unknown): Settings {
  return clampSettings(parsed);
}

export function serializeSettings(settings: Settings): string {
  const clamped = clampSettings(settings);
  return JSON.stringify({ version: SETTINGS_VERSION, ...clamped });
}

/** Tolerant parse: anything malformed falls back to defaults. */
export function parseSettings(raw: string | null): Settings {
  if (raw === null) return { ...DEFAULT_SETTINGS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  return migrateSettings(parsed);
}

// --- Persistence -------------------------------------------------------

/** Minimal storage surface; window.localStorage satisfies it. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSettings(storage: SettingsStorage | null): Settings {
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    return parseSettings(storage.getItem(SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(
  settings: Settings,
  storage: SettingsStorage | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_KEY, serializeSettings(settings));
  } catch {
    // Quota or privacy-mode failures lose the preference, never the game.
  }
}
