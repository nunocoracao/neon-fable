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
  bodyViewForFacing,
  type BodyBuildId,
  type BodyViewId,
} from "./layers/body";
import { bodyAnimFrames } from "./layers/bodyAnim";
import { FACE_LAYERS } from "./layers/face";
import { HAIR_LAYERS, hairWalkGrid } from "./layers/hair";

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
 * One resolved layer of a composed character: which art to draw in
 * which slot, with the channel remap its appearance choices apply.
 * Produced by the character model's resolveLayers; the same slot may
 * appear more than once (one entry per face part).
 */
export interface ComposedLayer {
  readonly slot: LayerSlot;
  /**
   * Art id within the slot's registry. Ids with no registered grid
   * (catalogs whose art hasn't landed, gear item ids) draw nothing —
   * they light up automatically once their registry entry exists.
   */
  readonly art: string;
  readonly remap: Readonly<Record<string, string>>;
}

/**
 * The full descriptor a composed character renders from: the body
 * build (which also picks the animation hand/stride metrics) plus the
 * resolved layers in base bottom-to-top z-order.
 */
export interface ComposedCharacter {
  readonly build: BodyBuildId;
  readonly layers: readonly ComposedLayer[];
}

type SlotRegistry = Readonly<
  Record<string, Readonly<Record<BodyViewId, PixelGrid>>>
>;

/**
 * Per-slot art registries. A slot absent here has no authored grids
 * yet; its layers are skipped at compose time. Later art tasks (hair,
 * headwear, gear overlays) plug their registries in here and every
 * catalog id that references them starts rendering with no other
 * wiring.
 */
const SLOT_REGISTRIES: Readonly<Partial<Record<LayerSlot, SlotRegistry>>> = {
  body: BODY_GRIDS as SlotRegistry,
  face: FACE_LAYERS as SlotRegistry,
  hair: HAIR_LAYERS as SlotRegistry,
};

/** The grid a layer draws for a view, or null while its art is unregistered. */
export function layerArtGrid(
  slot: LayerSlot,
  art: string,
  view: BodyViewId,
): PixelGrid | null {
  return SLOT_REGISTRIES[slot]?.[art]?.[view] ?? null;
}

function remapKey(remap: Readonly<Record<string, string>>): string {
  const entries = Object.entries(remap)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([from, to]) => `${from}>${to}`);
  return entries.length === 0 ? "" : `#${entries.join(",")}`;
}

/**
 * Canonical serialization of a descriptor: the build plus every
 * layer's slot, art, and remap in order, so equal descriptors always
 * share a cache key no matter how the objects were built — and any
 * appearance difference yields a different key.
 */
export function composedCharacterKey(character: ComposedCharacter): string {
  const layers = character.layers.map(
    (layer) => `${layer.slot}=${layer.art}${remapKey(layer.remap)}`,
  );
  return [character.build as string, ...layers].join("|");
}

/** Bake-cache key for one composed frame: full descriptor + pose. */
export function composedFrameKey(
  character: ComposedCharacter,
  facing: Facing,
  state: MotionState,
  frame: number,
): string {
  return `${composedCharacterKey(character)}:${facing}:${state}:${frame}`;
}

/**
 * Resolve a descriptor to its composed animation frame: pick the
 * authored view for the facing, order the layers for that facing
 * (stable, so face parts keep their relative order), look each layer's
 * art up in its slot registry (unregistered art is skipped), compose
 * on the neutral pose, animate the composed body, and mirror for
 * south/west. Pure and deterministic — the provider only calls this on
 * a bake-cache miss.
 */
export function composedCharacterGrid(
  character: ComposedCharacter,
  facing: Facing,
  state: MotionState,
  frame: number,
): PixelGrid {
  const { view, flip } = bodyViewForFacing(facing);
  const order = layerOrderFor(facing);
  const parts: LayerPart[] = [...character.layers]
    .sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot))
    .flatMap((layer) => {
      const grid = layerArtGrid(layer.slot, layer.art, view);
      if (!grid) return [];
      // Long hair trails one pixel on walk frames (secondary motion).
      const posed =
        layer.slot === "hair" && state === "walk"
          ? hairWalkGrid(layer.art, grid)
          : grid;
      return [{ grid: posed, remap: layer.remap }];
    });
  if (parts.length === 0) {
    throw new Error(
      `composed character has no drawable layers (build ${character.build})`,
    );
  }
  const composed = composeGrids(parts);
  const frames = bodyAnimFrames(composed, character.build)[state];
  const grid = frames[frame];
  if (!grid) {
    throw new Error(`no ${state} frame ${frame} (have ${frames.length})`);
  }
  return flip ? mirrored(grid) : grid;
}
