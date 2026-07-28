import { BODY_BUILD_IDS, type BodyBuildId } from "../iso/art/layers/body";

/**
 * Appearance catalogs: the single source of truth for every visual
 * customization category. The creation UI renders its pickers from
 * these entries, validateAppearance accepts exactly these ids, and
 * resolveLayers turns them into layer-engine art references.
 *
 * Art references are ids into each layer slot's grid registry
 * (src/iso/art/layers). Categories whose authored grids land in later
 * tasks (hair styles, eye/brow/mouth shapes, face details, headwear)
 * still declare their layer ids here — the art tasks author grids for
 * these ids and their tests assert every catalog entry is covered.
 * Color entries reference palette characters directly.
 */

/** Every entry has a stable id (persisted in saves) and a UI label. */
export interface AppearanceOption {
  id: string;
  label: string;
}

/** A skin tone: references a SKIN_RAMPS index in the palette. */
export interface SkinToneOption extends AppearanceOption {
  /** Index into SKIN_RAMPS. */
  ramp: number;
}

/** A body build: references an authored base-body grid set. */
export interface BuildOption extends AppearanceOption {
  build: BodyBuildId;
}

/**
 * A style pick (hair, eyes, brows, mouth, face detail, headwear):
 * references a layer grid id within its slot's registry, or null for
 * 'none' entries that draw nothing.
 */
export interface StyleOption extends AppearanceOption {
  layer: string | null;
}

/** A color pick: references a palette character to remap a channel onto. */
export interface ColorOption extends AppearanceOption {
  /** Palette character (single-character index into PALETTE). */
  color: string;
}

export const SKIN_TONE_OPTIONS: readonly SkinToneOption[] = [
  { id: "porcelain", label: "Porcelain", ramp: 0 },
  { id: "golden-tan", label: "Golden Tan", ramp: 1 },
  { id: "warm-brown", label: "Warm Brown", ramp: 2 },
  { id: "deep-umber", label: "Deep Umber", ramp: 3 },
];

export const BUILD_OPTIONS: readonly BuildOption[] = [
  { id: "lean", label: "Lean", build: "lean" },
  { id: "heavy", label: "Heavy", build: "heavy" },
];

export const HAIR_STYLE_OPTIONS: readonly StyleOption[] = [
  { id: "none", label: "Shaved", layer: null },
  // "buzz" keeps its persisted id from the schema task; the authored
  // style reads as a short crop.
  { id: "buzz", label: "Short Crop", layer: "buzz" },
  { id: "slicked", label: "Slicked Back", layer: "slicked" },
  { id: "bob", label: "Chin-Length Bob", layer: "bob" },
  { id: "spikes", label: "Short Spikes", layer: "spikes" },
  // Authored in hair set 2 (the long tied-back tail); until then the
  // id resolves to no registered grid and draws nothing.
  { id: "ponytail", label: "Ponytail", layer: "ponytail" },
];

/** Hair colors remap the canonical raven channel ("K"). */
export const HAIR_COLOR_OPTIONS: readonly ColorOption[] = [
  { id: "raven", label: "Raven", color: "K" },
  { id: "chestnut", label: "Chestnut", color: "L" },
  { id: "blond", label: "Blond", color: "M" },
  { id: "auburn", label: "Auburn", color: "N" },
  { id: "silver", label: "Silver", color: "O" },
  { id: "synth-violet", label: "Synth Violet", color: "P" },
];

export const EYES_OPTIONS: readonly StyleOption[] = [
  { id: "standard", label: "Standard", layer: "standard" },
  { id: "narrow", label: "Narrow", layer: "narrow" },
  { id: "wide", label: "Wide", layer: "wide" },
];

/** Eye colors remap the canonical iris channel ("g"). */
export const EYE_COLOR_OPTIONS: readonly ColorOption[] = [
  { id: "cyan", label: "Neon Cyan", color: "g" },
  { id: "amber", label: "Amber", color: "m" },
  { id: "magenta", label: "Magenta", color: "j" },
  { id: "hologram-blue", label: "Hologram Blue", color: "t" },
  { id: "silver", label: "Silver", color: "O" },
  { id: "crimson", label: "Crimson", color: "p" },
];

export const BROWS_OPTIONS: readonly StyleOption[] = [
  { id: "straight", label: "Straight", layer: "straight" },
  { id: "arched", label: "Arched", layer: "arched" },
  { id: "heavy", label: "Heavy", layer: "heavy" },
];

export const MOUTH_OPTIONS: readonly StyleOption[] = [
  { id: "neutral", label: "Neutral", layer: "neutral" },
  { id: "smirk", label: "Smirk", layer: "smirk" },
  { id: "frown", label: "Frown", layer: "frown" },
];

export const FACE_DETAIL_OPTIONS: readonly StyleOption[] = [
  { id: "none", label: "None", layer: null },
  { id: "scar", label: "Scar", layer: "scar" },
  { id: "tattoo", label: "Tattoo", layer: "tattoo" },
  { id: "cyber-lines", label: "Cyber-Lines", layer: "cyber-lines" },
];

export const HEADWEAR_OPTIONS: readonly StyleOption[] = [
  { id: "none", label: "None", layer: null },
  { id: "cap", label: "Runner Cap", layer: "cap" },
  { id: "hood", label: "Hood", layer: "hood" },
  { id: "visor", label: "Visor", layer: "visor" },
];

/**
 * All catalogs keyed by the Appearance field they populate. Validation
 * and randomization iterate this record so a new category only needs a
 * catalog and an Appearance field.
 */
export const appearanceCatalogs = {
  skinTone: SKIN_TONE_OPTIONS,
  build: BUILD_OPTIONS,
  hairStyle: HAIR_STYLE_OPTIONS,
  hairColor: HAIR_COLOR_OPTIONS,
  eyes: EYES_OPTIONS,
  eyeColor: EYE_COLOR_OPTIONS,
  brows: BROWS_OPTIONS,
  mouth: MOUTH_OPTIONS,
  faceDetail: FACE_DETAIL_OPTIONS,
  headwear: HEADWEAR_OPTIONS,
} as const satisfies Readonly<Record<string, readonly AppearanceOption[]>>;

export type AppearanceCategory = keyof typeof appearanceCatalogs;

export function getAppearanceOption<C extends AppearanceCategory>(
  category: C,
  id: string,
): (typeof appearanceCatalogs)[C][number] | undefined {
  return appearanceCatalogs[category].find((option) => option.id === id);
}

// Re-exported so catalog consumers don't reach into iso/art directly.
export { BODY_BUILD_IDS };
