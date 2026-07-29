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

/**
 * View zoom levels for the iso scene. Every level times ART_SCALE (2,
 * src/iso/art/pixel.ts) must be a whole number of CSS pixels per art
 * pixel — 2, 3, and 4 here — so no zoom can slice an art pixel
 * fractionally; camera.test.ts pins this against ART_SCALE.
 */
export const ZOOM_LEVELS = [1, 1.5, 2] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export interface Settings {
  textSpeed: TextSpeed;
  reducedMotion: boolean;
  zoom: ZoomLevel;
  /** The additive neon glow pass in the iso scene. */
  glow: boolean;
  /** Weather effects (rain streaks, puddles, splashes) in the iso scene. */
  weather: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  textSpeed: "normal",
  reducedMotion: false,
  zoom: 1,
  glow: true,
  weather: true,
};

export const SETTINGS_KEY = "neon-fable:settings";

/** Bump when the Settings shape changes; migrateSettings routes on it. */
export const SETTINGS_VERSION = 4;

/** Coerces any value onto the zoom-level ladder; off-ladder → default. */
export function clampZoom(value: unknown): ZoomLevel {
  return ZOOM_LEVELS.includes(value as ZoomLevel)
    ? (value as ZoomLevel)
    : DEFAULT_SETTINGS.zoom;
}

/** One step up (+1) or down (-1) the zoom ladder, clamped at the ends. */
export function stepZoom(current: ZoomLevel, direction: 1 | -1): ZoomLevel {
  const index = ZOOM_LEVELS.indexOf(current) + direction;
  const clamped = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index));
  return ZOOM_LEVELS[clamped] ?? DEFAULT_SETTINGS.zoom;
}

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
  return {
    textSpeed,
    reducedMotion: record.reducedMotion === true,
    zoom: clampZoom(record.zoom),
    // Glow and weather default on: older payloads without the fields
    // keep both passes.
    glow: record.glow !== false,
    weather: record.weather !== false,
  };
}

/**
 * Migrates a parsed payload from any stored version to the current
 * shape. Every version so far routes through the field-tolerant clamp —
 * v1 payloads simply lack zoom, v2 payloads lack glow, v3 payloads lack
 * weather, and each gets its default; unknown or future versions degrade
 * to defaults per field instead of crashing.
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
