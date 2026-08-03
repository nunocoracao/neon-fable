/**
 * Player-facing game settings: dialogue text speed, the Graphics &
 * Comfort switches, the difficulty preference — and, since the mixer
 * grew four buses, the mixer. Persisted to localStorage separately from
 * save slots (device preference, not game state). Pure functions over a
 * plain object; the storage interface is injectable so tests run against
 * an in-memory fake.
 *
 * ## Motion is a preference, not a switch
 *
 * `motion` has three positions, and the middle one — the default —
 * means "ask the device". Nothing outside this directory is allowed to
 * read it and decide for itself: the answer is `reducedMotionActive()`
 * in ./index.ts, and ./comfort.test.ts sweeps the sources to keep it
 * that way. The v9 boolean it replaced had the same three states
 * really, with the third one hidden inside every caller.
 *
 * ## The mixer used to live somewhere else
 *
 * It had a localStorage record of its own, holding three linear volumes
 * and one mute, because the audio bus wrote it and the audio bus had no
 * reason to know this file existed. It is a device preference like every
 * other one on the settings panel, so it is here now. What the audio bus
 * gets instead is a MixerStore handle (see src/audio/mixer.ts) — it
 * still owns *what the mixer means*, and no longer owns where it is kept.
 *
 * Installs that predate the move still have the old record, and
 * loadSettings adopts it exactly once per boot until something writes
 * settings back — see adoptLegacyMixer, which converts the old
 * amplitudes into fader positions that reproduce them exactly.
 *
 * ## Difficulty and assists are here *and* on the run
 *
 * The two live in different places on purpose. What is stored here is
 * the *preference*: what the player last chose, which is what a fresh
 * run starts on and what New Game+ keeps. What actually governs a
 * playthrough is the copy on its own GameState (see
 * src/state/rules.ts), because a fight has to resolve the same way
 * wherever the save is opened — a modifier read out of localStorage
 * halfway down a pure function would make the same save behave
 * differently on a different device. Changing either mid-run writes
 * both: the run so it takes effect, the preference so the next one
 * remembers.
 */

import {
  clampColorMode,
  clampMotionPreference,
  clampTextScale,
  DEFAULT_COLOR_MODE,
  DEFAULT_MOTION_PREFERENCE,
  DEFAULT_TEXT_SCALE,
  type ColorModeId,
  type MotionPreference,
  type TextScale,
} from "../data/accessibility";
import {
  clampMixer,
  DEFAULT_MIXER,
  LEGACY_AUDIO_KEY,
  migrateLegacyMixer,
  type MixerState,
} from "../audio/mixer";
import { clampAssists, noAssists, type AssistState } from "../data/assists";
import {
  clampDifficultyId,
  DEFAULT_DIFFICULTY_ID,
  type DifficultyId,
} from "../data/difficulty";
import { startingRules, type RunRules } from "../state/rules";

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

/**
 * Multipliers on combat screen shake. 0 stills it without touching the
 * other two camera effects; 1 is the authored amplitude, which is
 * deliberately small (see MAX_SHAKE_PX in src/iso/cameraFeel.ts).
 */
export const SHAKE_SCALES = [0, 0.5, 1, 1.5] as const;
export type ShakeScale = (typeof SHAKE_SCALES)[number];

export interface Settings {
  textSpeed: TextSpeed;
  /**
   * The motion master switch: defer to the device, or override it in
   * either direction. Nothing reads this field to decide whether to
   * animate — that question is `reducedMotionActive()` in ./index.ts,
   * which is the one selector every animated system is required to go
   * through (pinned by src/settings/comfort.test.ts).
   */
  motion: MotionPreference;
  zoom: ZoomLevel;
  /** The additive neon glow pass in the iso scene. */
  glow: boolean;
  /** Weather effects (rain streaks, puddles, splashes) in the iso scene. */
  weather: boolean;
  /**
   * The staged pieces of theatre a district runs on its own clock:
   * trains crossing the viaduct, drones on their routes, steam vents.
   * Off leaves the streets standing still — the maps are unchanged and
   * nothing walkable moves.
   */
  setPieces: boolean;
  /** The corner minimap while exploring; collapsed leaves its tab. */
  minimap: boolean;
  /**
   * Combat camera feel: the turn-start glide, the hit-pause on impact,
   * and the shake off heavy blows. Off leaves a fixed, still camera —
   * as does reduced motion, which switches all three off on its own.
   */
  combatFeel: boolean;
  /** Scales the shake alone; 0 stills it with the rest left on. */
  shakeScale: ShakeScale;
  /**
   * Ambient barks: the one-line chips passers-by, map NPCs, and the
   * companion put up while exploring. Decoration only — off silences
   * the street and costs nothing (see src/data/barks.ts).
   */
  barks: boolean;
  /**
   * Which colour palette the marked ground is painted from: the city's
   * own, or the colourblind-assist one. A pair of palette ids and
   * nothing else — see src/data/accessibility.ts.
   */
  colorMode: ColorModeId;
  /**
   * Multiplier on the root font size, and so on every panel, label, and
   * HUD readout sized in `rem` against it. Applied as a CSS variable
   * (see applyTextScale in ./index.ts).
   */
  textScale: TextScale;
  /**
   * The difficulty preset a new run starts on — the last one chosen,
   * in the wizard or in this panel. Not what the current run is being
   * played under; see the file header.
   */
  difficulty: DifficultyId;
  /** The assist switches a new run starts with. Same story. */
  assists: AssistState;
  /**
   * Contextual hints: the one-line chips that name a system the first
   * time the player is standing in front of it (see
   * src/narrative/hints.ts). Off suppresses every one of them without
   * forgetting which have already been shown — turning it back on picks
   * up where the run left off rather than replaying the first hour.
   *
   * A device preference and not a run fact, unlike which hints have
   * been *seen*: whether you want to be taught is about you, which
   * hints you have already read is about the playthrough.
   */
  hints: boolean;
  /**
   * Fader positions, mutes, and the focus-ducking switch for the four
   * audio buses. The audio bus reads and writes this through a
   * MixerStore; see the file header.
   */
  mixer: MixerState;
}

export const DEFAULT_SETTINGS: Settings = {
  textSpeed: "normal",
  motion: DEFAULT_MOTION_PREFERENCE,
  zoom: 1,
  glow: true,
  weather: true,
  setPieces: true,
  minimap: true,
  combatFeel: true,
  shakeScale: 1,
  barks: true,
  colorMode: DEFAULT_COLOR_MODE,
  textScale: DEFAULT_TEXT_SCALE,
  difficulty: DEFAULT_DIFFICULTY_ID,
  assists: noAssists(),
  hints: true,
  mixer: DEFAULT_MIXER,
};

export const SETTINGS_KEY = "neon-fable:settings";

/** Bump when the Settings shape changes; migrateSettings routes on it. */
export const SETTINGS_VERSION = 11;

/**
 * The fields the Graphics & Comfort section owns — everything about how
 * the game looks and how much it moves, and nothing about how it plays.
 * The section's "reset" control restores exactly these, which is the
 * one place the list has to be written down (see resetGraphicsSettings
 * and src/ui/graphicsModel.ts, whose rows are pinned against it).
 */
export const GRAPHICS_SETTING_KEYS = [
  "motion",
  "zoom",
  "glow",
  "weather",
  "setPieces",
  "minimap",
  "combatFeel",
  "shakeScale",
  "barks",
  "colorMode",
  "textScale",
] as const satisfies readonly (keyof Settings)[];

export type GraphicsSettingKey = (typeof GRAPHICS_SETTING_KEYS)[number];

/**
 * The same settings with every Graphics & Comfort field back at its
 * default and everything else — text speed, the mixer, difficulty, the
 * assists — left exactly where the player put it. Pure: the panel hands
 * the result to the store, which is what persists and notifies.
 */
export function resetGraphicsSettings(current: Settings): Settings {
  const reset: Partial<Settings> = {};
  for (const key of GRAPHICS_SETTING_KEYS) {
    (reset as Record<string, unknown>)[key] = DEFAULT_SETTINGS[key];
  }
  return clampSettings({ ...current, ...reset });
}

/** Coerces any value onto the zoom-level ladder; off-ladder → default. */
export function clampZoom(value: unknown): ZoomLevel {
  return ZOOM_LEVELS.includes(value as ZoomLevel)
    ? (value as ZoomLevel)
    : DEFAULT_SETTINGS.zoom;
}

/** Coerces any value onto the shake ladder; off-ladder → default. */
export function clampShakeScale(value: unknown): ShakeScale {
  return SHAKE_SCALES.includes(value as ShakeScale)
    ? (value as ShakeScale)
    : DEFAULT_SETTINGS.shakeScale;
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
    // A v9 payload has a reducedMotion boolean and no motion field. Its
    // `false` is not "full motion" — the old selector was `setting ||
    // OS preference`, so an untouched switch already meant "follow the
    // device", which is what "system" means here. Only the players who
    // actually turned it on are carried to an explicit override.
    motion: clampMotionPreference(
      record.motion ?? (record.reducedMotion === true ? "reduced" : undefined),
    ),
    zoom: clampZoom(record.zoom),
    // Glow, weather, the set pieces, the minimap, the combat camera, and
    // the street's chatter default on: older payloads without the fields
    // keep every pass, a city that runs, the HUD corner, a camera that
    // answers a fight, and streets that talk.
    glow: record.glow !== false,
    weather: record.weather !== false,
    setPieces: record.setPieces !== false,
    minimap: record.minimap !== false,
    combatFeel: record.combatFeel !== false,
    shakeScale: clampShakeScale(record.shakeScale),
    barks: record.barks !== false,
    // Both default to the plainest answer: the game's own colours, and
    // text at the size the panels were laid out for.
    colorMode: clampColorMode(record.colorMode),
    textScale: clampTextScale(record.textScale),
    // Difficulty and the assists are the other way round from the
    // flags above: a payload that does not mention them is a player
    // who has never chosen, and the documented default is the middle
    // preset with every switch off. A retired preset or assist id
    // degrades to the same place rather than scaling something by a
    // number nobody can see (see clampDifficultyId / clampAssists).
    difficulty: clampDifficultyId(record.difficulty),
    assists: clampAssists(record.assists),
    // Guidance defaults on, like every other switch whose absence means
    // "this install predates the feature": a returning player who has
    // already been taught keeps their hint flags either way, so the
    // worst an upgrade can do is offer a chip for something new.
    hints: record.hints !== false,
    // A payload with no mixer is either a v8 install (whose mixer is in
    // the old record, adopted by loadSettings) or a fresh one. Either
    // way the answer here is the documented defaults.
    mixer: clampMixer(record.mixer),
  };
}

/**
 * Migrates a parsed payload from any stored version to the current
 * shape. Every version so far routes through the field-tolerant clamp —
 * v1 payloads simply lack zoom, v2 payloads lack glow, v3 payloads lack
 * weather, v4 payloads lack minimap, v5 payloads lack the combat camera
 * fields, v6 payloads lack barks, v7 payloads lack the difficulty
 * preference and the assist switches, v8 payloads lack the mixer, v9
 * payloads carry a reducedMotion boolean where the motion preference
 * now is (and lack the set-piece switch, the colour mode, and the text
 * size), v10 payloads lack the hints switch, and each gets its default; unknown or future versions degrade
 * to defaults per field instead of crashing.
 *
 * The v8 mixer is the one field whose default is not the end of the
 * story: the value it *should* have is in another record entirely, and
 * adoptLegacyMixer puts it back. That happens in loadSettings rather
 * than here because it needs the storage this payload came out of, and
 * a migration that reads storage is not a migration anybody can test.
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

/**
 * The rules a run created right now would start on: the stored
 * preference, with nothing carried across from any previous run (see
 * startingRules). The one bridge between the preference and the
 * playthrough, so "what does a new game start on" has a single answer
 * shared by the wizard and by New Game+.
 */
export function settingsRules(current: Settings): RunRules {
  return startingRules({
    difficulty: current.difficulty,
    assists: current.assists,
  });
}

// --- Persistence -------------------------------------------------------

/** Minimal storage surface; window.localStorage satisfies it. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Puts an older install's audio record back where it belongs.
 *
 * Only when the settings payload has no mixer of its own — once
 * anything has written settings back, the mixer is here and the old
 * record is history nobody reads. Kept pure and separate from
 * loadSettings so the interesting part, "does upgrading change what a
 * player hears", is testable without a storage fake.
 *
 * @param settings the already-parsed settings
 * @param payload  the raw parsed JSON they came from, mixer field and all
 * @param legacyRaw the old audio record's JSON string, or null
 */
export function adoptLegacyMixer(
  settings: Settings,
  payload: unknown,
  legacyRaw: string | null,
): Settings {
  const hasOwnMixer =
    typeof payload === "object" &&
    payload !== null &&
    (payload as Record<string, unknown>).mixer !== undefined;
  if (hasOwnMixer || legacyRaw === null) return settings;
  try {
    return { ...settings, mixer: migrateLegacyMixer(JSON.parse(legacyRaw)) };
  } catch {
    // A corrupt old record is one the player has already lost; the
    // documented defaults are a better answer than refusing to boot.
    return settings;
  }
}

export function loadSettings(storage: SettingsStorage | null): Settings {
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    const settings = parseSettings(raw);
    let payload: unknown = null;
    try {
      payload = raw === null ? null : JSON.parse(raw);
    } catch {
      // Unparseable: settings is defaults, and the old audio record —
      // if there is one — is the only thing left worth keeping.
    }
    return adoptLegacyMixer(
      settings,
      payload,
      storage.getItem(LEGACY_AUDIO_KEY),
    );
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
