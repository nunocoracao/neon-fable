/**
 * The Graphics & Comfort section of the settings panel, as data.
 *
 * Every visual switch the v2 work introduced arrived with its own row,
 * its own paragraph, and its own `settings.update({ ... })` buried in
 * the panel's build function. That is fine for one switch and unreadable
 * for eleven, and it left "does this toggle actually do anything" as a
 * question only a browser could answer.
 *
 * So the section is a table: groups of controls, each control a label, a
 * plain-language description, a list of options, and the two pure
 * functions that connect it to the settings record — `value`, which
 * reads the option in force, and `patch`, which says what choosing one
 * would write. The panel renders the table and nothing else; the tests
 * drive it with no DOM at all, which is how every toggle can be pinned
 * as really wired to the field it claims (see ./graphicsModel.test.ts).
 *
 * Two of the rows reach past the record: motion resolves through
 * `reducedMotionActive` and colour through the palette pair in
 * src/settings/display.ts. Both are read where the painting happens,
 * from the record this table writes — the table itself stays a
 * description of the panel and nothing more.
 */

import {
  COLOR_MODE_DEFS,
  MOTION_PREFERENCE_DEFS,
  TEXT_SCALES,
  TEXT_SCALE_LABELS,
  type ColorModeId,
  type MotionPreference,
  type TextScale,
} from "../data/accessibility";
import {
  clampShakeScale,
  clampZoom,
  SHAKE_SCALES,
  ZOOM_LEVELS,
  type Settings,
  type ShakeScale,
} from "../settings";
import { plain, t, type PlainKey } from "./strings";

// --- The table ---------------------------------------------------------

/** One position of one control. */
export interface GraphicsOption {
  /** Stable string form; what the button carries and the panel compares. */
  value: string;
  label: string;
}

export interface GraphicsControl {
  id: string;
  label: string;
  /** What the switch does, in a sentence a player can act on. */
  blurb: string;
  options: readonly GraphicsOption[];
  /** The option in force for these settings. */
  value(current: Settings): string;
  /** What choosing an option writes. Never a partial write of two fields. */
  patch(value: string): Partial<Settings>;
}

export interface GraphicsGroup {
  id: string;
  title: string;
  /** Why these controls are together, or null where it is obvious. */
  blurb: string | null;
  controls: readonly GraphicsControl[];
}

const ON_OFF: readonly GraphicsOption[] = [
  { value: "on", label: t("settings.on") },
  { value: "off", label: t("settings.off") },
];

/** A control over one boolean field: on/off, read and written directly. */
function toggle(
  id: string,
  key: "glow" | "weather" | "setPieces" | "minimap" | "combatFeel" | "barks",
  label: PlainKey,
  blurb: PlainKey,
  options: readonly GraphicsOption[] = ON_OFF,
): GraphicsControl {
  return {
    id,
    label: plain(label),
    blurb: plain(blurb),
    options,
    value: (current) => (current[key] ? "on" : "off"),
    patch: (value) => ({ [key]: value === "on" }) as Partial<Settings>,
  };
}

const MOTION_CONTROL: GraphicsControl = {
  id: "motion",
  label: t("graphics.motion"),
  blurb: t("graphics.motion.blurb"),
  options: MOTION_PREFERENCE_DEFS.map((def) => ({
    value: def.id,
    label: def.label,
  })),
  value: (current) => current.motion,
  patch: (value) => ({ motion: value as MotionPreference }),
};

const COLOR_CONTROL: GraphicsControl = {
  id: "colorMode",
  label: t("graphics.colorMode"),
  blurb: t("graphics.colorMode.blurb"),
  options: COLOR_MODE_DEFS.map((def) => ({ value: def.id, label: def.label })),
  value: (current) => current.colorMode,
  patch: (value) => ({ colorMode: value as ColorModeId }),
};

const TEXT_SCALE_CONTROL: GraphicsControl = {
  id: "textScale",
  label: t("graphics.textScale"),
  blurb: t("graphics.textScale.blurb"),
  options: TEXT_SCALES.map((scale) => ({
    value: String(scale),
    label: TEXT_SCALE_LABELS[scale],
  })),
  value: (current) => String(current.textScale),
  patch: (value) => ({ textScale: Number(value) as TextScale }),
};

/** Combat shake amplitudes, said in words rather than multipliers. */
const SHAKE_SCALE_LABELS: Record<ShakeScale, PlainKey> = {
  0: "graphics.shake.off",
  0.5: "graphics.shake.light",
  1: "graphics.shake.standard",
  1.5: "graphics.shake.strong",
};

export const GRAPHICS_GROUPS: readonly GraphicsGroup[] = [
  {
    id: "comfort",
    title: t("graphics.group.comfort"),
    blurb: t("graphics.group.comfort.blurb"),
    controls: [MOTION_CONTROL, COLOR_CONTROL, TEXT_SCALE_CONTROL],
  },
  {
    id: "world",
    title: t("graphics.group.world"),
    blurb: t("graphics.group.world.blurb"),
    controls: [
      toggle(
        "glow",
        "glow",
        "graphics.glow",
        "graphics.glow.blurb",
      ),
      toggle(
        "weather",
        "weather",
        "graphics.weather",
        "graphics.weather.blurb",
      ),
      toggle(
        "setPieces",
        "setPieces",
        "graphics.setPieces",
        "graphics.setPieces.blurb",
      ),
      toggle(
        "barks",
        "barks",
        "graphics.barks",
        "graphics.barks.blurb",
      ),
    ],
  },
  {
    id: "camera",
    title: t("graphics.group.camera"),
    blurb: null,
    controls: [
      {
        id: "zoom",
        label: t("graphics.zoom"),
        blurb: t("graphics.zoom.blurb"),
        options: ZOOM_LEVELS.map((level) => ({
          value: String(level),
          label: `${level}×`,
        })),
        value: (current) => String(current.zoom),
        patch: (value) => ({ zoom: clampZoom(Number(value)) }),
      },
      toggle(
        "combatFeel",
        "combatFeel",
        "graphics.combatFeel",
        "graphics.combatFeel.blurb",
        [
          { value: "on", label: t("settings.on") },
          { value: "off", label: t("graphics.combatFeel.fixed") },
        ],
      ),
      {
        id: "shakeScale",
        label: t("graphics.shake"),
        blurb: t("graphics.shake.blurb"),
        options: SHAKE_SCALES.map((scale) => ({
          value: String(scale),
          label: plain(SHAKE_SCALE_LABELS[scale]),
        })),
        value: (current) => String(current.shakeScale),
        patch: (value) => ({ shakeScale: clampShakeScale(Number(value)) }),
      },
    ],
  },
  {
    id: "hud",
    title: t("graphics.group.hud"),
    blurb: null,
    controls: [
      toggle(
        "minimap",
        "minimap",
        "graphics.minimap",
        "graphics.minimap.blurb",
        [
          { value: "on", label: t("graphics.minimap.shown") },
          { value: "off", label: t("graphics.minimap.collapsed") },
        ],
      ),
    ],
  },
];

/** Every control in the section, flattened, in the order they appear. */
export const GRAPHICS_CONTROLS: readonly GraphicsControl[] =
  GRAPHICS_GROUPS.flatMap((group) => group.controls);
