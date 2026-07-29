import { BODY_BUILD_IDS, type BodyBuildId } from "../iso/art/layers/body";
import {
  BROW_EXPRESSION_PORTRAITS,
  BROW_PORTRAITS,
  CYBER_LINES_SHIMMER,
  EXPRESSION_IDS,
  EYE_PORTRAITS,
  FACE_DETAIL_PORTRAITS,
  MOUTH_EXPRESSION_PORTRAITS,
  MOUTH_PORTRAITS,
  type ExpressionId,
} from "../iso/art/layers/face";
import type { ChannelRemap, PixelGrid } from "../iso/art/pixel";

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

/**
 * A face style pick (eyes, brows): always draws a layer, and also
 * carries the portrait-resolution grid for its option — one screen-left
 * eye/brow with the richer 2–4px strokes a head-and-shoulders portrait
 * needs (see EYE_PORTRAITS / BROW_PORTRAITS in the face layer module).
 * The portrait task consumes this data straight off the catalog entry.
 */
export interface FaceStyleOption extends StyleOption {
  layer: string;
  portrait: PixelGrid;
}

/**
 * A face style pick that can emote (mouth, brows): additionally carries
 * one portrait-resolution variant grid per expression state, with the
 * "neutral" variant equal to the resting portrait. Sprites always
 * render the resting layer — expressions exist only at portrait
 * resolution, resolved per mouth+brow combination by resolveExpression.
 */
export interface ExpressiveFaceStyleOption extends FaceStyleOption {
  expressions: Readonly<Record<ExpressionId, PixelGrid>>;
}

/**
 * A face-detail pick (scars, tattoos, cyber-lines): an overlay above
 * the other face parts and below hair. Non-none entries carry their
 * portrait-resolution overlay grid; a shimmering entry (cyber-lines)
 * additionally carries per-frame channel remaps the sprite layer
 * engine cycles by animation frame — the glow is pure catalog data.
 */
export interface FaceDetailOption extends StyleOption {
  /** Portrait overlay grid, or null for the bare "none" entry. */
  portrait: PixelGrid | null;
  /** Sprite-level per-frame remaps; absent for static details. */
  shimmer?: readonly ChannelRemap[];
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
  { id: "mohawk", label: "Mohawk", layer: "mohawk" },
  { id: "locs", label: "Shoulder Locs", layer: "locs" },
  // "ponytail" keeps its persisted id; authored as the long tied-back
  // tail in hair set 2.
  { id: "ponytail", label: "Tied-Back Tail", layer: "ponytail" },
  { id: "glyph", label: "Dyed Glyph", layer: "glyph" },
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

export const EYES_OPTIONS: readonly FaceStyleOption[] = [
  {
    id: "standard",
    label: "Standard",
    layer: "standard",
    portrait: EYE_PORTRAITS.standard,
  },
  {
    id: "narrow",
    label: "Narrow",
    layer: "narrow",
    portrait: EYE_PORTRAITS.narrow,
  },
  { id: "wide", label: "Wide", layer: "wide", portrait: EYE_PORTRAITS.wide },
  {
    id: "cyber-band",
    label: "Cyber-Band",
    layer: "cyber-band",
    portrait: EYE_PORTRAITS["cyber-band"],
  },
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

export const BROWS_OPTIONS: readonly ExpressiveFaceStyleOption[] = [
  {
    id: "straight",
    label: "Straight",
    layer: "straight",
    portrait: BROW_PORTRAITS.straight,
    expressions: BROW_EXPRESSION_PORTRAITS.straight,
  },
  {
    id: "arched",
    label: "Arched",
    layer: "arched",
    portrait: BROW_PORTRAITS.arched,
    expressions: BROW_EXPRESSION_PORTRAITS.arched,
  },
  {
    id: "heavy",
    label: "Heavy",
    layer: "heavy",
    portrait: BROW_PORTRAITS.heavy,
    expressions: BROW_EXPRESSION_PORTRAITS.heavy,
  },
];

export const MOUTH_OPTIONS: readonly ExpressiveFaceStyleOption[] = [
  {
    id: "neutral",
    label: "Neutral Line",
    layer: "neutral",
    portrait: MOUTH_PORTRAITS.neutral,
    expressions: MOUTH_EXPRESSION_PORTRAITS.neutral,
  },
  {
    id: "smirk",
    label: "Slight Smirk",
    layer: "smirk",
    portrait: MOUTH_PORTRAITS.smirk,
    expressions: MOUTH_EXPRESSION_PORTRAITS.smirk,
  },
  // "frown" keeps its persisted id from the schema task; the authored
  // style reads as a hard-set, pressed line.
  {
    id: "frown",
    label: "Hard Set",
    layer: "frown",
    portrait: MOUTH_PORTRAITS.frown,
    expressions: MOUTH_EXPRESSION_PORTRAITS.frown,
  },
  {
    id: "breather",
    label: "Breather Mask",
    layer: "breather",
    portrait: MOUTH_PORTRAITS.breather,
    expressions: MOUTH_EXPRESSION_PORTRAITS.breather,
  },
];

export const FACE_DETAIL_OPTIONS: readonly FaceDetailOption[] = [
  { id: "none", label: "None", layer: null, portrait: null },
  // "scar" keeps its persisted id from the schema task; the authored
  // detail reads as a slash down the cheek.
  {
    id: "scar",
    label: "Cheek Scar",
    layer: "scar",
    portrait: FACE_DETAIL_PORTRAITS.scar,
  },
  {
    id: "brow-split",
    label: "Brow-Split Scar",
    layer: "brow-split",
    portrait: FACE_DETAIL_PORTRAITS["brow-split"],
  },
  // "tattoo" keeps its persisted id; authored as the geometric chevrons.
  {
    id: "tattoo",
    label: "Geometric Tattoo",
    layer: "tattoo",
    portrait: FACE_DETAIL_PORTRAITS.tattoo,
  },
  {
    id: "cyber-lines",
    label: "Subdermal Cyber-Lines",
    layer: "cyber-lines",
    portrait: FACE_DETAIL_PORTRAITS["cyber-lines"],
    shimmer: CYBER_LINES_SHIMMER,
  },
  {
    id: "circuit-ink",
    label: "Circuit Ink",
    layer: "circuit-ink",
    portrait: FACE_DETAIL_PORTRAITS["circuit-ink"],
  },
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

/**
 * The portrait overlay pair an expression resolves to for one
 * mouth+brow combination. Grids come straight off the catalog entries'
 * expression records; the portrait renderer stamps them over the
 * resting face (mouth on the centerline, brows mirrored like their
 * resting portraits).
 */
export interface ExpressionOverlays {
  mouth: PixelGrid;
  brows: PixelGrid;
}

/**
 * Resolve an expression state for a mouth+brow combination to its
 * portrait overlay grids. Pure and total over the catalogs: every
 * catalog mouth id × brow id × ExpressionId resolves; unknown ids
 * throw. Dialogue lines request expressions through this in a later
 * task — nothing here touches GameState.
 */
export function resolveExpression(
  mouthId: string,
  browId: string,
  expression: ExpressionId,
): ExpressionOverlays {
  const mouth = getAppearanceOption("mouth", mouthId);
  if (!mouth) throw new Error(`unknown mouth id "${mouthId}"`);
  const brows = getAppearanceOption("brows", browId);
  if (!brows) throw new Error(`unknown brows id "${browId}"`);
  const mouthGrid = mouth.expressions[expression];
  const browsGrid = brows.expressions[expression];
  if (!mouthGrid || !browsGrid) {
    throw new Error(`unknown expression "${String(expression)}"`);
  }
  return { mouth: mouthGrid, brows: browsGrid };
}

// Re-exported so catalog consumers don't reach into iso/art directly.
export { BODY_BUILD_IDS, EXPRESSION_IDS, type ExpressionId };
