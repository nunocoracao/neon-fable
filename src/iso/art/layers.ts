/**
 * Layered character composition: the pure core that turns a stack of
 * palette-indexed layer grids (body, outfit, face, hair, headwear,
 * weapon, cyberware) into a single composed 32×48 character grid.
 *
 * Every layer shares the frame contract documented in ./layers/body:
 * same 32×48 grid, same (16, 44) anchor. Layers compose in z-order
 * (with per-facing overrides — a held weapon draws behind the body
 * when the character faces away), each layer's channel remap applies
 * before compositing, transparent pixels fall through, and later
 * layers override earlier ones.
 *
 * Composition happens on the neutral pose; the composed grid is then
 * animated by bodyAnimFrames, so upper layers ride the body's breathe
 * and stride transforms without per-layer frame authoring. Everything
 * here is pure over grids — canvas baking stays in ../provider.
 */
import type { Facing, MotionState } from "../animation";
import {
  PALETTE,
  REMAP_CHANNELS,
  SKIN_RAMPS,
  TRANSPARENT,
} from "./palette";
import { mirrored, remapped, type PixelGrid } from "./pixel";
import {
  BODY_FRAME,
  BODY_GRIDS,
  bodyPreviewBuild,
  bodyViewForFacing,
  type BodyBuildId,
} from "./layers/body";
import { bodyAnimFrames } from "./layers/bodyAnim";
import { FACE_LAYERS, type FaceLayerId } from "./layers/face";

/** Layer slots in base (toward-camera) z-order, bottom to top. */
export const LAYER_SLOTS = [
  "body",
  "outfit",
  "face",
  "hair",
  "headwear",
  "weapon",
  "cyberware",
] as const;

export type LayerSlot = (typeof LAYER_SLOTS)[number];

/** Facing away, the held weapon is occluded by the body. */
const BACK_ORDER: readonly LayerSlot[] = [
  "weapon",
  "body",
  "outfit",
  "face",
  "hair",
  "headwear",
  "cyberware",
];

/** Slot draw order for a facing (n/w are the authored back views). */
export function layerOrderFor(facing: Facing): readonly LayerSlot[] {
  return facing === "n" || facing === "w" ? BACK_ORDER : LAYER_SLOTS;
}

/** One layer: a frame-sized grid plus its channel remap, if any. */
export interface LayerPart {
  readonly grid: PixelGrid;
  readonly remap?: Readonly<Record<string, string>>;
}

/** Flatten a slot map into compose order for a facing, skipping absent slots. */
export function orderedLayerParts(
  parts: Readonly<Partial<Record<LayerSlot, LayerPart>>>,
  facing: Facing,
): LayerPart[] {
  const ordered: LayerPart[] = [];
  for (const slot of layerOrderFor(facing)) {
    const part = parts[slot];
    if (part) ordered.push(part);
  }
  return ordered;
}

/**
 * Compose layer parts (already in draw order) into one grid: remaps
 * apply per layer first, transparent pixels fall through, later layers
 * override. Throws unless every grid is exactly the 32×48 layer frame.
 */
export function composeGrids(parts: readonly LayerPart[]): string[] {
  if (parts.length === 0) {
    throw new Error("composeGrids needs at least one layer");
  }
  const { width, height } = BODY_FRAME;
  const out: string[][] = Array.from({ length: height }, () =>
    Array<string>(width).fill(TRANSPARENT),
  );
  parts.forEach((part, i) => {
    if (part.grid.length !== height) {
      throw new Error(
        `layer ${i} has ${part.grid.length} rows, expected ${height}`,
      );
    }
    const grid = part.remap ? remapped(part.grid, part.remap) : part.grid;
    grid.forEach((row, y) => {
      if (row.length !== width) {
        throw new Error(
          `layer ${i} row ${y} has width ${row.length}, expected ${width}`,
        );
      }
      const cells = out[y];
      if (!cells) return;
      for (let x = 0; x < width; x++) {
        const ch = row[x] ?? TRANSPARENT;
        if (ch !== TRANSPARENT) cells[x] = ch;
      }
    });
  });
  return out.map((cells) => cells.join(""));
}

/** Remap the canonical skin channel onto a SKIN_RAMPS tone, by index. */
export function skinToneRemap(tone: number): Readonly<Record<string, string>> {
  const ramp = SKIN_RAMPS[tone];
  if (!ramp) {
    throw new Error(
      `skin tone ${tone} out of range (0-${SKIN_RAMPS.length - 1})`,
    );
  }
  const [shade, base, highlight] = REMAP_CHANNELS.skin;
  return { [shade]: ramp.shade, [base]: ramp.base, [highlight]: ramp.highlight };
}

/** Remap the iris channel onto any palette entry. */
export function eyeColorRemap(color: string): Readonly<Record<string, string>> {
  if (PALETTE[color] === undefined) {
    throw new Error(`eye color "${color}" is not a palette entry`);
  }
  const [iris] = REMAP_CHANNELS.eyes;
  return { [iris]: color };
}

/**
 * The appearance descriptor a composed character resolves from. Kept
 * minimal for the pipeline proof (body build, skin tone, eye color,
 * stub face); the hair/outfit/headwear catalogs extend it in the
 * appearance tasks. Extend, never reshape — keys derive from it.
 */
export interface ComposedAppearance {
  readonly build: BodyBuildId;
  /** Index into SKIN_RAMPS. */
  readonly skinTone: number;
  /** Palette character for the iris channel. */
  readonly eyeColor: string;
  readonly face: FaceLayerId | null;
}

/**
 * Canonical serialization of a descriptor: every field, in fixed
 * order, so equal descriptors always share a cache key no matter how
 * the object was built.
 */
export function appearanceKey(appearance: ComposedAppearance): string {
  return [
    appearance.build,
    `skin${appearance.skinTone}`,
    `eye${appearance.eyeColor}`,
    `face:${appearance.face ?? "none"}`,
  ].join("|");
}

/** Bake-cache key for one composed frame: full descriptor + pose. */
export function composedFrameKey(
  appearance: ComposedAppearance,
  facing: Facing,
  state: MotionState,
  frame: number,
): string {
  return `${appearanceKey(appearance)}:${facing}:${state}:${frame}`;
}

/**
 * Resolve a descriptor to its composed animation frame: pick the
 * authored view for the facing, compose the layer stack on the neutral
 * pose (skin/eye remaps applied per layer), animate the composed body,
 * and mirror for south/west. Pure and deterministic — the provider
 * only calls this on a bake-cache miss.
 */
export function composedFrameGrid(
  appearance: ComposedAppearance,
  facing: Facing,
  state: MotionState,
  frame: number,
): PixelGrid {
  const { view, flip } = bodyViewForFacing(facing);
  const skin = skinToneRemap(appearance.skinTone);
  const parts: Partial<Record<LayerSlot, LayerPart>> = {
    body: { grid: BODY_GRIDS[appearance.build][view], remap: skin },
  };
  if (appearance.face) {
    parts.face = {
      grid: FACE_LAYERS[appearance.face][view],
      remap: { ...skin, ...eyeColorRemap(appearance.eyeColor) },
    };
  }
  const composed = composeGrids(orderedLayerParts(parts, facing));
  const frames = bodyAnimFrames(composed, appearance.build)[state];
  const grid = frames[frame];
  if (!grid) {
    throw new Error(`no ${state} frame ${frame} (have ${frames.length})`);
  }
  return flip ? mirrored(grid) : grid;
}

/**
 * Dev-only preview descriptor: `?dev&previewBody=lean|heavy` routes
 * the character sprites through the composition pipeline, with an
 * optional `previewSkin=0-3` tone. Pure over the query string.
 */
export function previewAppearance(search: string): ComposedAppearance | null {
  const build = bodyPreviewBuild(search);
  if (!build) return null;
  const skin = Number(new URLSearchParams(search).get("previewSkin") ?? "0");
  return {
    build,
    skinTone: SKIN_RAMPS[skin] !== undefined ? skin : 0,
    eyeColor: "g",
    face: "stub",
  };
}
