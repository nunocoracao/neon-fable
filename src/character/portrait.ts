import {
  appearanceCatalogs,
  getAppearanceOption,
  resolveExpression,
  type AppearanceCategory,
  type ExpressionId,
} from "../data/appearance";
import { getItem } from "../data/items";
import { ENHANCEMENT_SLOTS } from "../inventory/items";
import type { EquipmentState } from "../inventory/equipment";
import {
  composeGrids,
  cyberChannelRemap,
  eyeColorRemap,
  outfitChannelRemap,
  remapKey,
  skinToneRemap,
  type LayerPart,
} from "../iso/art/layers";
import { CYBER_PORTRAITS } from "../iso/art/layers/cyberware";
import {
  PORTRAIT_FRAME,
  PORTRAIT_HEADS,
  STATIC_FLICKER_FRAMES,
  STATIC_FLICKER_SHIMMER,
  faceBoxGrid,
  placedAt,
  portraitHairGrid,
} from "../iso/art/layers/portrait";
import { REMAP_CHANNELS } from "../iso/art/palette";
import { mirrored, type PixelGrid } from "../iso/art/pixel";
import {
  outfitDyeRemap,
  validateAppearance,
  visualEquipment,
  type Appearance,
  type CharacterVisual,
  type ItemLookup,
} from "./appearance";

/**
 * Portrait composition: the 48×48 head-and-shoulders render derived
 * from the same appearance data as the sprite — base head per build,
 * the portrait-resolution face/hair/headwear/cyberware art the
 * catalogs carry, and a channel-tinted shoulder band from the equipped
 * outfit's materials. Pure over grids; baking and caching stay in the
 * UI portrait module, exactly like sprites and their provider.
 *
 * Unlike the sprite, a portrait always draws the eyes (and head
 * cyberware) under eye-covering headwear — the lens glass overlays are
 * dithered translucent, which is how a visored character keeps its eye
 * color in portraits only. Expressions exist only here: the resting
 * sprite face never emotes, while resolveExpression picks the portrait
 * mouth/brow variant pair.
 */

/** One resolved portrait layer: a stable id plus the grid it draws. */
export interface PortraitPart {
  /** Cache-key fragment naming the art this layer draws. */
  readonly key: string;
  readonly grid: PixelGrid;
  readonly remap: Readonly<Record<string, string>>;
}

class PortraitAppearanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortraitAppearanceError";
  }
}

function must<C extends AppearanceCategory>(
  category: C,
  id: string,
): (typeof appearanceCatalogs)[C][number] {
  const option = getAppearanceOption(category, id);
  if (!option) {
    throw new PortraitAppearanceError(`unknown ${category} id "${id}"`);
  }
  return option;
}

/**
 * Resolve an appearance (plus equipped gear and an expression) into
 * the portrait layer stack, bottom to top: head, eyes, brows, mouth,
 * face detail, hair, headwear, cyberware — the sprite's base z-order
 * with the head standing in for body+outfit. Pure and deterministic;
 * throws on invalid appearance ids. Missing content (unknown items,
 * families without portrait art) degrades to fewer layers, never a
 * crash.
 */
export function resolvePortraitParts(
  appearance: Appearance,
  equipment: EquipmentState,
  expression: ExpressionId = "neutral",
  lookupItem: ItemLookup = getItem,
  flicker = 0,
): PortraitPart[] {
  const errors = validateAppearance(appearance);
  if (errors.length > 0) {
    throw new PortraitAppearanceError(
      `invalid appearance: ${errors.map((e) => `${e.field}="${e.id}"`).join(", ")}`,
    );
  }

  const skin = skinToneRemap(must("skinTone", appearance.skinTone).ramp);
  const [hairChannel] = REMAP_CHANNELS.hair;
  const hairRemap = {
    [hairChannel as string]: must("hairColor", appearance.hairColor).color,
  };
  const eyeRemap = eyeColorRemap(must("eyeColor", appearance.eyeColor).color);

  // The equipped outfit tints the authored shoulder band's primary and
  // accent channels — no per-item portrait art. A color rubbed into
  // this copy of the coat (see src/inventory/dye.ts) lands on top, the
  // same channels it repaints on the sprite, so the face in the
  // dialogue box is never wearing a different coat than the body on the
  // street.
  let outfitRemap: Readonly<Record<string, string>> = {};
  if (equipment.outfit !== null) {
    const item = lookupItem(equipment.outfit);
    const ref = item?.kind === "outfit" ? item.outfitLayer : undefined;
    if (ref) {
      outfitRemap = {
        ...outfitChannelRemap(ref.primary, ref.accent),
        ...(outfitDyeRemap(equipment.outfitDye) ?? {}),
      };
    }
  }

  const build = must("build", appearance.build).build;
  const parts: PortraitPart[] = [
    {
      key: `head:${build}`,
      grid: PORTRAIT_HEADS[build],
      remap: { ...skin, ...outfitRemap },
    },
  ];

  // Eyes and brows: one authored screen-left part, mirrored across the
  // face centerline. Always drawn — coversEyes headwear only hides the
  // sprite's eyes; its portrait lens glass is dithered.
  const mirroredPair = (
    key: string,
    part: PixelGrid,
    anchor: { left: number; top: number; mirrorLeft: number },
    remap: Readonly<Record<string, string>>,
  ): void => {
    parts.push(
      { key, grid: placedAt(part, anchor.left, anchor.top), remap },
      {
        key: `${key}~m`,
        grid: placedAt(mirrored(part), anchor.mirrorLeft, anchor.top),
        remap,
      },
    );
  };

  const eyes = must("eyes", appearance.eyes);
  mirroredPair(`eyes:${eyes.id}`, eyes.portrait, PORTRAIT_FRAME.eyes, {
    ...skin,
    ...eyeRemap,
  });

  const mouth = must("mouth", appearance.mouth);
  const brows = must("brows", appearance.brows);
  const emoted = resolveExpression(mouth.id, brows.id, expression);
  mirroredPair(
    `brows:${brows.id}@${expression}`,
    emoted.brows,
    PORTRAIT_FRAME.brows,
    hairRemap,
  );
  parts.push({
    key: `mouth:${mouth.id}@${expression}`,
    grid: placedAt(emoted.mouth, PORTRAIT_FRAME.mouth.left, PORTRAIT_FRAME.mouth.top),
    remap: skin,
  });

  const detail = must("faceDetail", appearance.faceDetail);
  if (detail.portrait) {
    parts.push({
      key: `detail:${detail.id}`,
      grid: faceBoxGrid(detail.portrait),
      remap: skin,
    });
  }

  // The headwear's catalog rule picks the hair crown exactly like the
  // sprite: unchanged when it shows, the flattened under-cap variant
  // when it crushes, nothing when it hides.
  const headwear = must("headwear", appearance.headwear);
  const hair = must("hairStyle", appearance.hairStyle);
  const hairArt =
    headwear.hairRule === "hides"
      ? null
      : headwear.hairRule === "crushes"
        ? hair.crushed
        : hair.layer;
  const crown = hairArt === null ? null : portraitHairGrid(hairArt);
  if (hairArt !== null && crown) {
    parts.push({ key: `hair:${hairArt}`, grid: crown, remap: hairRemap });
  }

  if (headwear.portrait) {
    parts.push({
      key: `headwear:${headwear.id}`,
      grid: faceBoxGrid(headwear.portrait),
      remap: {},
    });
  }

  // Installed head cyberware always shows in portraits, in fixed slot
  // order; families without portrait art (body-region installs) and
  // unknown items draw nothing.
  for (const slot of ENHANCEMENT_SLOTS) {
    const itemId = equipment.enhancements[slot];
    if (itemId === undefined) continue;
    const item = lookupItem(itemId);
    const ref = item?.kind === "enhancement" ? item.cyberLayer : undefined;
    if (!ref) continue;
    const overlay = CYBER_PORTRAITS[ref.id];
    if (!overlay) continue;
    parts.push({
      key: `cyber:${ref.id}`,
      grid: faceBoxGrid(overlay),
      remap: cyberChannelRemap(ref.accent),
    });
  }

  // Above everything, and only on the frames that carry a tear. An
  // out-of-range index wraps rather than throwing: the caller is an
  // animation clock, and a clock should never be able to crash a face.
  const torn = staticFlickerPart(flicker);
  if (torn) parts.push(torn);

  return parts;
}

/**
 * The tear for one flicker frame, or null for the clean frames (frame
 * 0 always, and every frame when flickering is off). Exported for the
 * tests that pin the cycle; callers pass a frame index, not this.
 */
export function staticFlickerPart(flicker: number): PortraitPart | null {
  const count = STATIC_FLICKER_FRAMES.length;
  if (count === 0) return null;
  const index = ((Math.trunc(flicker) % count) + count) % count;
  const grid = STATIC_FLICKER_FRAMES[index];
  if (!grid) return null;
  return {
    key: `static:${index}`,
    grid,
    remap: STATIC_FLICKER_SHIMMER[index] ?? {},
  };
}

/**
 * The portrait layer stack for an authored non-player look — a named
 * NPC, one record of an enemy archetype's look family. Gear resolves
 * exactly like player equipment, and a crew dye recolors the shoulder
 * band the same channels it recolors the sprite's coat, so a look's
 * portrait and its sprite are never two different outfits.
 */
export function resolveVisualPortraitParts(
  visual: CharacterVisual,
  expression: ExpressionId = "neutral",
  lookupItem: ItemLookup = getItem,
): PortraitPart[] {
  const parts = resolvePortraitParts(
    visual.appearance,
    visualEquipment(visual),
    expression,
    lookupItem,
  );
  const dye = outfitDyeRemap(visual.outfitDye);
  if (!dye) return parts;
  // The head part carries the shoulder band's outfit channels; nothing
  // else in a portrait is cloth.
  const [head, ...rest] = parts;
  return head
    ? [{ ...head, remap: { ...head.remap, ...dye } }, ...rest]
    : parts;
}

/**
 * Compose the portrait for an appearance, equipment, and expression:
 * a 48×48 palette-indexed grid, pure and deterministic. The UI bakes
 * and caches it keyed by portraitKey, exactly like sprite frames.
 */
export function composePortrait(
  appearance: Appearance,
  equipment: EquipmentState,
  expression: ExpressionId = "neutral",
  lookupItem: ItemLookup = getItem,
  flicker = 0,
): PixelGrid {
  const parts: LayerPart[] = resolvePortraitParts(
    appearance,
    equipment,
    expression,
    lookupItem,
    flicker,
  ).map(({ grid, remap }) => ({ grid, remap }));
  return composeGrids(parts, PORTRAIT_FRAME);
}

/**
 * Canonical bake-cache key: every resolved layer's art id and remap in
 * order, so equal appearance + equipment + expression always share a
 * key no matter how the objects were built — and any visible
 * difference yields a different key.
 */
export function portraitKey(
  appearance: Appearance,
  equipment: EquipmentState,
  expression: ExpressionId = "neutral",
  lookupItem: ItemLookup = getItem,
  flicker = 0,
): string {
  return partsKey(
    resolvePortraitParts(
      appearance,
      equipment,
      expression,
      lookupItem,
      flicker,
    ),
  );
}

function partsKey(parts: readonly PortraitPart[]): string {
  return parts.map((part) => `${part.key}${remapKey(part.remap)}`).join("|");
}

/** The 48×48 portrait grid for an authored look, crew dye included. */
export function composeVisualPortrait(
  visual: CharacterVisual,
  expression: ExpressionId = "neutral",
  lookupItem: ItemLookup = getItem,
): PixelGrid {
  return composeGrids(
    resolveVisualPortraitParts(visual, expression, lookupItem).map(
      ({ grid, remap }): LayerPart => ({ grid, remap }),
    ),
    PORTRAIT_FRAME,
  );
}

/** Bake-cache key for an authored look's portrait; see portraitKey. */
export function visualPortraitKey(
  visual: CharacterVisual,
  expression: ExpressionId = "neutral",
  lookupItem: ItemLookup = getItem,
): string {
  return partsKey(resolveVisualPortraitParts(visual, expression, lookupItem));
}
