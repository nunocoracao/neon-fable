export {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  SHAKE_SCALES,
  TEXT_SPEEDS,
  TEXT_SPEED_CHAR_MS,
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
  stepZoom,
  settingsRules,
  type Settings,
  type SettingsStorage,
  type ShakeScale,
  type TextSpeed,
  type ZoomLevel,
} from "./settings";
export { createSettingsStore, type SettingsStore } from "./store";

import { createSettingsStore, type SettingsStore } from "./store";
import type { Settings, SettingsStorage } from "./settings";

function defaultStorage(): SettingsStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * The shared settings store every screen imports. Loaded from
 * localStorage at boot; safe without storage (headless tests) — it
 * just holds defaults in memory.
 */
export const settings: SettingsStore = createSettingsStore(defaultStorage());

/** The matchMedia surface reducedMotionActive probes; window satisfies it. */
export interface MotionMediaQuerier {
  matchMedia?: (query: string) => { matches: boolean };
}

/**
 * Whether motion should be stilled right now: the in-game setting or
 * the OS-level prefers-reduced-motion preference, whichever asks first.
 * CSS animations honor the OS preference via a media query; canvas
 * animation loops call this so they honor it too.
 */
export function reducedMotionActive(
  current: Settings = settings.get(),
  win: MotionMediaQuerier | null = typeof window !== "undefined"
    ? window
    : null,
): boolean {
  if (current.reducedMotion) return true;
  try {
    return (
      win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    );
  } catch {
    return false;
  }
}

/** Mirrors reduced motion onto the root element for the CSS kill switch. */
export function applyMotionPreference(
  current: Settings,
  doc: Document,
): void {
  doc.documentElement.classList.toggle(
    "nf-reduced-motion",
    current.reducedMotion,
  );
}

// Applied on boot and kept in sync — DOM animations obey the setting
// without every screen having to know about it.
if (typeof document !== "undefined") {
  applyMotionPreference(settings.get(), document);
  settings.subscribe((next) => applyMotionPreference(next, document));
}
