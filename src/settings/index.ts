export {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  TEXT_SPEEDS,
  TEXT_SPEED_CHAR_MS,
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
  type Settings,
  type SettingsStorage,
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
