/**
 * The comfort catalogs: what the Graphics & Comfort section of the
 * settings panel is allowed to be set to, said in words a player can
 * act on.
 *
 * Content, like every other catalog in this directory — id, label, and
 * what the option actually does. The switch positions live on the
 * settings record (src/settings/settings.ts) and the rows that render
 * them live in src/ui/graphicsModel.ts; nothing here reads a setting or
 * touches the DOM.
 *
 * The palette ids are the point of the colour catalog: earlier tasks
 * left two data seams — the telegraph tint table
 * (src/iso/telegraphPalette.ts) and the interactable outline table
 * (src/iso/affordance.ts) — each keyed by a palette id and each falling
 * back on an unknown one. This is the consumer they were left for: a
 * colour mode is a pair of those ids and nothing else, so switching it
 * repaints every telegraph and every highlight without a branch
 * anywhere in the painting code.
 */

import type { OutlinePaletteId } from "../iso/affordance";
import type { TelegraphPaletteId } from "../iso/telegraphPalette";

// --- Motion ------------------------------------------------------------

/**
 * The three positions of the motion switch. "system" defers to the OS
 * preference, which is what an install that has never touched the row
 * does; the other two are explicit overrides in either direction, so a
 * player whose machine asks for reduced motion can still turn the
 * animation back on for this game alone.
 */
export const MOTION_PREFERENCES = ["system", "full", "reduced"] as const;

export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

export const DEFAULT_MOTION_PREFERENCE: MotionPreference = "system";

export interface MotionPreferenceDef {
  id: MotionPreference;
  label: string;
  blurb: string;
}

export const MOTION_PREFERENCE_DEFS: readonly MotionPreferenceDef[] = [
  {
    id: "system",
    label: "System",
    blurb:
      "Follow whatever this device asks for. Turning reduced motion on in " +
      "your operating system turns it on here too.",
  },
  {
    id: "full",
    label: "Full",
    blurb:
      "Everything moves, whatever the device asks for. Pick this to keep " +
      "the animation on a machine set to reduce it system-wide.",
  },
  {
    id: "reduced",
    label: "Reduced",
    blurb:
      "Stills the screen shake, the hit flashes, the ambient flicker, the " +
      "rain, and the crowd. Nothing is hidden by it — damage numbers and " +
      "the combat log still say everything that happened.",
  },
];

/** Coerces any value onto the motion ladder; anything else defers. */
export function clampMotionPreference(value: unknown): MotionPreference {
  return MOTION_PREFERENCES.includes(value as MotionPreference)
    ? (value as MotionPreference)
    : DEFAULT_MOTION_PREFERENCE;
}

// --- Colour ------------------------------------------------------------

export const COLOR_MODES = ["neon", "assist"] as const;

export type ColorModeId = (typeof COLOR_MODES)[number];

export const DEFAULT_COLOR_MODE: ColorModeId = "neon";

export interface ColorModeDef {
  id: ColorModeId;
  label: string;
  blurb: string;
  /** Which tint table the combat grid and the vision cones paint from. */
  telegraphPalette: TelegraphPaletteId;
  /** Which colour the focused interactable is traced in. */
  outlinePalette: OutlinePaletteId;
}

export const COLOR_MODE_DEFS: readonly ColorModeDef[] = [
  {
    id: "neon",
    label: "Neon",
    blurb:
      "The city's own colours: cyan for ground you can reach, magenta for " +
      "what a blow will land on, amber for what somebody else has promised.",
    telegraphPalette: "neon",
    outlinePalette: "neon",
  },
  {
    id: "assist",
    label: "Colourblind assist",
    blurb:
      "Swaps every marked tile and highlight onto a blue-and-yellow " +
      "palette with heavier fills and wider dashes. No mark has ever " +
      "carried its meaning by colour alone — this pulls the colours apart " +
      "as well.",
    telegraphPalette: "high-contrast",
    outlinePalette: "assist",
  },
];

/** Coerces any value onto the colour ladder; anything else defaults. */
export function clampColorMode(value: unknown): ColorModeId {
  return COLOR_MODES.includes(value as ColorModeId)
    ? (value as ColorModeId)
    : DEFAULT_COLOR_MODE;
}

/** The definition for a mode id; an unknown one degrades to the default. */
export function requireColorMode(id: ColorModeId): ColorModeDef {
  const found = COLOR_MODE_DEFS.find((mode) => mode.id === id);
  if (found) return found;
  const fallback = COLOR_MODE_DEFS.find((mode) => mode.id === DEFAULT_COLOR_MODE);
  if (!fallback) throw new Error("no default colour mode");
  return fallback;
}

// --- Interface text ----------------------------------------------------

/**
 * Multipliers on the root font size, which every panel, label, and HUD
 * readout is sized in `rem` against — so one CSS variable moves all of
 * them together and nothing has to be re-laid out by hand. Kept to
 * modest steps: the panels are fixed-width pixel chrome, and a bump big
 * enough to overflow them would be a worse read, not a bigger one.
 */
export const TEXT_SCALES = [1, 1.15, 1.3] as const;

export type TextScale = (typeof TEXT_SCALES)[number];

export const DEFAULT_TEXT_SCALE: TextScale = 1;

export const TEXT_SCALE_LABELS: Record<TextScale, string> = {
  1: "Standard",
  1.15: "Large",
  1.3: "Largest",
};

/** Coerces any value onto the text-size ladder; off-ladder defaults. */
export function clampTextScale(value: unknown): TextScale {
  return TEXT_SCALES.includes(value as TextScale)
    ? (value as TextScale)
    : DEFAULT_TEXT_SCALE;
}
