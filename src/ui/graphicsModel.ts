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
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

/** A control over one boolean field: on/off, read and written directly. */
function toggle(
  id: string,
  key: "glow" | "weather" | "setPieces" | "minimap" | "combatFeel" | "barks",
  label: string,
  blurb: string,
  options: readonly GraphicsOption[] = ON_OFF,
): GraphicsControl {
  return {
    id,
    label,
    blurb,
    options,
    value: (current) => (current[key] ? "on" : "off"),
    patch: (value) => ({ [key]: value === "on" }) as Partial<Settings>,
  };
}

const MOTION_CONTROL: GraphicsControl = {
  id: "motion",
  label: "Screen motion",
  blurb:
    "The master switch for everything that moves on its own. System " +
    "follows what this device asks for; the other two override it either " +
    "way. Nothing is ever hidden by reducing motion — it is stilled.",
  options: MOTION_PREFERENCE_DEFS.map((def) => ({
    value: def.id,
    label: def.label,
  })),
  value: (current) => current.motion,
  patch: (value) => ({ motion: value as MotionPreference }),
};

const COLOR_CONTROL: GraphicsControl = {
  id: "colorMode",
  label: "Marker colours",
  blurb:
    "Which palette every marked tile is painted from: the tinted ground " +
    "in a fight, the vision cones of anyone watching, the walk preview, " +
    "the cursor, and the ring around whatever you are standing next to.",
  options: COLOR_MODE_DEFS.map((def) => ({ value: def.id, label: def.label })),
  value: (current) => current.colorMode,
  patch: (value) => ({ colorMode: value as ColorModeId }),
};

const TEXT_SCALE_CONTROL: GraphicsControl = {
  id: "textScale",
  label: "Interface text",
  blurb:
    "Scales every panel, label, and HUD readout together. The pixel " +
    "lettering stays as crisp at the larger sizes — it is the same type " +
    "drawn bigger, not stretched.",
  options: TEXT_SCALES.map((scale) => ({
    value: String(scale),
    label: TEXT_SCALE_LABELS[scale],
  })),
  value: (current) => String(current.textScale),
  patch: (value) => ({ textScale: Number(value) as TextScale }),
};

/** Combat shake amplitudes, said in words rather than multipliers. */
const SHAKE_SCALE_LABELS: Record<ShakeScale, string> = {
  0: "Off",
  0.5: "Light",
  1: "Standard",
  1.5: "Strong",
};

export const GRAPHICS_GROUPS: readonly GraphicsGroup[] = [
  {
    id: "comfort",
    title: "Comfort",
    blurb:
      "Nothing in here changes how the game plays, what it tells you, or " +
      "what you can reach. They change how much of it moves and how easily " +
      "it reads.",
    controls: [MOTION_CONTROL, COLOR_CONTROL, TEXT_SCALE_CONTROL],
  },
  {
    id: "world",
    title: "The city",
    blurb: "What the streets are doing while you walk through them.",
    controls: [
      toggle(
        "glow",
        "glow",
        "Neon glow",
        "Layers soft light from signage, screens, and streetlights over the " +
          "streets. Off is a flatter, faster picture.",
      ),
      toggle(
        "weather",
        "weather",
        "Weather",
        "Rain, puddles, and splashes on the districts that have them. It " +
          "never changes how the game plays. Reduced motion stills the rain " +
          "on its own; this takes it away entirely.",
      ),
      toggle(
        "setPieces",
        "setPieces",
        "Set pieces",
        "The trains crossing the viaducts, the drones on their routes, the " +
          "steam off the vents. Scenery on a clock — off leaves the streets " +
          "standing still, and nothing you can walk to or talk to changes.",
      ),
      toggle(
        "barks",
        "barks",
        "Street chatter",
        "Passers-by, the people standing on the map, and whoever is walking " +
          "with you say short unprompted lines over their heads. Nothing " +
          "said this way matters to the story.",
      ),
    ],
  },
  {
    id: "camera",
    title: "Camera",
    blurb: null,
    controls: [
      {
        id: "zoom",
        label: "Camera zoom",
        blurb:
          "How close the exploring camera sits. The wheel and the + and − " +
          "keys move it too; this is where it starts.",
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
        "Combat camera",
        "The camera glides to whoever is acting, holds for a few frames " +
          "when a blow connects, and takes a small knock off the heavy ones. " +
          "Off keeps the arena still, as does reduced motion.",
        [
          { value: "on", label: "On" },
          { value: "off", label: "Fixed" },
        ],
      ),
      {
        id: "shakeScale",
        label: "Screen shake",
        blurb:
          "How hard heavy hits and blasts knock the view. Off stills the " +
          "shake alone and leaves the glide and the hit-pause as they are.",
        options: SHAKE_SCALES.map((scale) => ({
          value: String(scale),
          label: SHAKE_SCALE_LABELS[scale],
        })),
        value: (current) => String(current.shakeScale),
        patch: (value) => ({ shakeScale: clampShakeScale(Number(value)) }),
      },
    ],
  },
  {
    id: "hud",
    title: "Heads-up display",
    blurb: null,
    controls: [
      toggle(
        "minimap",
        "minimap",
        "Minimap",
        "The corner map shows the whole district, where you stand and face, " +
          "the ways out, and who is worth walking to. Collapsed it leaves a " +
          "tab; M expands it again while exploring.",
        [
          { value: "on", label: "Shown" },
          { value: "off", label: "Collapsed" },
        ],
      ),
    ],
  },
];

/** Every control in the section, flattened, in the order they appear. */
export const GRAPHICS_CONTROLS: readonly GraphicsControl[] =
  GRAPHICS_GROUPS.flatMap((group) => group.controls);
