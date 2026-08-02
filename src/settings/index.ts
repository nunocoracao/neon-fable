export {
  DEFAULT_SETTINGS,
  GRAPHICS_SETTING_KEYS,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  SHAKE_SCALES,
  TEXT_SPEEDS,
  TEXT_SPEED_CHAR_MS,
  ZOOM_LEVELS,
  adoptLegacyMixer,
  clampSettings,
  clampShakeScale,
  clampZoom,
  loadSettings,
  migrateSettings,
  parseSettings,
  resetGraphicsSettings,
  revealDelayMs,
  saveSettings,
  serializeSettings,
  stepZoom,
  settingsRules,
  type GraphicsSettingKey,
  type Settings,
  type SettingsStorage,
  type ShakeScale,
  type TextSpeed,
  type ZoomLevel,
} from "./settings";
export { createSettingsStore, type SettingsStore } from "./store";
export { outlinePaletteFor, telegraphPaletteFor } from "./display";

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

/** The one query anything in this codebase asks the OS about motion. */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function defaultWindow(): MotionMediaQuerier | null {
  return typeof window !== "undefined" ? window : null;
}

/** Whether the device itself is asking for less movement. */
export function systemPrefersReducedMotion(
  win: MotionMediaQuerier | null = defaultWindow(),
): boolean {
  try {
    return win?.matchMedia?.(REDUCED_MOTION_QUERY).matches === true;
  } catch {
    return false;
  }
}

/**
 * **The** reduced-motion selector. Whether motion should be stilled
 * right now: the explicit override if the player has set one, and
 * otherwise whatever the device asks for.
 *
 * Every animated system in the game goes through this function and no
 * other — canvas loops call it, and the CSS kill switch is driven by
 * applyMotionPreference below rather than by a media query of its own,
 * so "full" really does mean full on a machine set to reduce. Reading
 * the raw `motion` field to decide whether to animate would quietly
 * reintroduce the third answer this exists to prevent; the sweep in
 * ./comfort.test.ts fails the build if anything starts doing it.
 */
export function reducedMotionActive(
  current: Settings = settings.get(),
  win: MotionMediaQuerier | null = defaultWindow(),
): boolean {
  if (current.motion === "reduced") return true;
  if (current.motion === "full") return false;
  return systemPrefersReducedMotion(win);
}

/**
 * Mirrors the resolved answer onto the root element for the CSS kill
 * switch, in both directions: `nf-reduced-motion` stills the DOM
 * animation, and `nf-full-motion` is the escape hatch that lets the
 * player keep it on a device whose OS preference would otherwise take
 * it away (see the media query in theme.css, which excludes it).
 */
export function applyMotionPreference(
  current: Settings,
  doc: Document,
  win: MotionMediaQuerier | null = defaultWindow(),
): void {
  const root = doc.documentElement;
  root.classList.toggle("nf-reduced-motion", reducedMotionActive(current, win));
  root.classList.toggle("nf-full-motion", current.motion === "full");
}

/** The CSS variable every `rem`-sized panel and label is scaled by. */
export const TEXT_SCALE_VAR = "--nf-text-scale";

/** Mirrors the interface text size onto the root element. */
export function applyTextScale(current: Settings, doc: Document): void {
  doc.documentElement.style.setProperty(
    TEXT_SCALE_VAR,
    String(current.textScale),
  );
}

/**
 * Everything the settings record projects onto the document. One place,
 * called on boot and on every update, so a new visual preference is
 * live-applied by being added here rather than by every screen learning
 * to watch for it.
 */
export function applyDisplaySettings(
  current: Settings,
  doc: Document,
  win: MotionMediaQuerier | null = defaultWindow(),
): void {
  applyMotionPreference(current, doc, win);
  applyTextScale(current, doc);
}

// Applied on boot and kept in sync — DOM animations and interface text
// obey the settings without every screen having to know about them.
if (typeof document !== "undefined") {
  applyDisplaySettings(settings.get(), document);
  settings.subscribe((next) => applyDisplaySettings(next, document));
}
