import {
  appearanceCatalogs,
  getAppearanceOption,
  type AppearanceCategory,
} from "../data/appearance";
import {
  eyeColorRemap,
  outfitChannelRemap,
  skinToneRemap,
} from "../iso/art/layers";
import type { ComposedCharacter, LayerSlot } from "../iso/art/layers";
import { outfitArtId } from "../iso/art/layers/outfits";
import { REMAP_CHANNELS } from "../iso/art/palette";
import { ENHANCEMENT_SLOTS, type Item } from "../inventory/items";
import type { EquipmentState } from "../inventory/equipment";
import { getItem } from "../data/items";
import { nextInt, type RngResult, type RngState } from "../state/rng";

/**
 * The player-facing appearance model: what the character looks like,
 * as catalog ids. Persisted on CharacterState (plain serializable
 * data); the catalogs in src/data/appearance.ts are the single source
 * of truth for which ids exist and what art they reference.
 */
export interface Appearance {
  skinTone: string;
  build: string;
  hairStyle: string;
  hairColor: string;
  eyes: string;
  eyeColor: string;
  brows: string;
  mouth: string;
  faceDetail: string;
  headwear: string;
}

/** Every Appearance field, each backed by a catalog of the same name. */
export const APPEARANCE_FIELDS = [
  "skinTone",
  "build",
  "hairStyle",
  "hairColor",
  "eyes",
  "eyeColor",
  "brows",
  "mouth",
  "faceDetail",
  "headwear",
] as const satisfies readonly AppearanceCategory[];

export type AppearanceField = (typeof APPEARANCE_FIELDS)[number];

/** One invalid field: the id that is not in the field's catalog. */
export interface AppearanceError {
  field: AppearanceField;
  id: string;
}

/** Every field whose id is unknown to its catalog; empty means valid. */
export function validateAppearance(appearance: Appearance): AppearanceError[] {
  const errors: AppearanceError[] = [];
  for (const field of APPEARANCE_FIELDS) {
    const id = appearance[field];
    if (!getAppearanceOption(field, id)) {
      errors.push({ field, id });
    }
  }
  return errors;
}

/**
 * The stock look old saves migrate onto and character creation starts
 * from. Must always validate — a test enforces it.
 */
export function defaultAppearance(): Appearance {
  return {
    skinTone: "porcelain",
    build: "lean",
    hairStyle: "buzz",
    hairColor: "raven",
    eyes: "standard",
    eyeColor: "cyan",
    brows: "straight",
    mouth: "neutral",
    faceDetail: "none",
    headwear: "none",
  };
}

/**
 * A uniformly random pick from every catalog, via the seeded RNG (never
 * Math.random) so background presets and the creation wizard's
 * randomize button are replayable. Always validates by construction.
 */
export function randomAppearance(rng: RngState): RngResult<Appearance> {
  let state = rng;
  const pick = (field: AppearanceField): string => {
    const catalog = appearanceCatalogs[field];
    const roll = nextInt(state, 0, catalog.length - 1);
    state = roll.state;
    const option = catalog[roll.value];
    if (!option) throw new Error(`empty catalog for ${field}`);
    return option.id;
  };
  const value: Appearance = {
    skinTone: pick("skinTone"),
    build: pick("build"),
    hairStyle: pick("hairStyle"),
    hairColor: pick("hairColor"),
    eyes: pick("eyes"),
    eyeColor: pick("eyeColor"),
    brows: pick("brows"),
    mouth: pick("mouth"),
    faceDetail: pick("faceDetail"),
    headwear: pick("headwear"),
  };
  return { state, value };
}

/**
 * One entry of the composition descriptor: which art grid to draw in
 * which layer slot, with the channel remaps appearance choices apply.
 * The "face" slot appears once per face part (eyes, brows, mouth,
 * detail), in that base z-order; composeGrids stacks them the same way
 * it stacks slots.
 */
export interface ResolvedLayer {
  slot: LayerSlot;
  /**
   * Art reference: a layer id from the appearance catalogs; for the
   * outfit slot, the equipped item's layer family keyed per build
   * (outfitArtId); for the still-stubbed weapon/cyberware slots, the
   * equipped item id (their gear-visibility tasks map item ids to
   * authored layers; until then those ids resolve to nothing).
   */
  art: string;
  remap: Readonly<Record<string, string>>;
  /**
   * Per-frame channel remaps carried straight off a shimmering catalog
   * entry (the cyber-lines face detail); the layer engine cycles them
   * by animation frame. Absent on static layers.
   */
  shimmer?: readonly Readonly<Record<string, string>>[];
}

class AppearanceValidationError extends Error {
  constructor(errors: AppearanceError[]) {
    super(
      `invalid appearance: ${errors
        .map((e) => `${e.field}="${e.id}"`)
        .join(", ")}`,
    );
    this.name = "AppearanceValidationError";
  }
}

function requireOption<C extends AppearanceCategory>(
  category: C,
  id: string,
): (typeof appearanceCatalogs)[C][number] {
  const option = getAppearanceOption(category, id);
  if (!option) {
    throw new AppearanceValidationError([{ field: category, id }]);
  }
  return option;
}

/**
 * Item lookup resolveLayers reads equipped gear through. Unlike the
 * inventory's throwing ItemResolver this one returns undefined for
 * unknown ids — missing content degrades to the base garb underlayer,
 * never crashes a render. Injectable so tests can feed fixture items.
 */
export type ItemLookup = (id: string) => Item | undefined;

/**
 * Resolve an appearance (plus equipped gear) into the layer engine's
 * composition descriptor, in base bottom-to-top z-order. Pure and
 * deterministic; throws AppearanceValidationError on unknown ids.
 * Facing-specific draw order (weapon behind the body when facing away)
 * stays in the engine's layerOrderFor.
 *
 * The equipped outfit resolves through item data: an item carrying an
 * outfitLayer reference swaps the outfit layer to its family's grid for
 * the character's build, recolored by the item's material remaps; items
 * without one (and unknown ids) keep the body's base garb underlayer.
 */
export function resolveLayers(
  appearance: Appearance,
  equipment: EquipmentState,
  lookupItem: ItemLookup = getItem,
): ResolvedLayer[] {
  const errors = validateAppearance(appearance);
  if (errors.length > 0) throw new AppearanceValidationError(errors);

  const skin = skinToneRemap(requireOption("skinTone", appearance.skinTone).ramp);
  const [hairChannel] = REMAP_CHANNELS.hair;
  const hairRemap = {
    [hairChannel as string]: requireOption("hairColor", appearance.hairColor)
      .color,
  };
  const eyeRemap = eyeColorRemap(
    requireOption("eyeColor", appearance.eyeColor).color,
  );

  const build = requireOption("build", appearance.build).build;
  const layers: ResolvedLayer[] = [{ slot: "body", art: build, remap: skin }];

  if (equipment.outfit !== null) {
    const item = lookupItem(equipment.outfit);
    const ref = item?.kind === "outfit" ? item.outfitLayer : undefined;
    if (ref) {
      layers.push({
        slot: "outfit",
        art: outfitArtId(ref.id, build),
        remap: outfitChannelRemap(ref.primary, ref.accent),
      });
    }
  }

  const headwear = requireOption("headwear", appearance.headwear);

  const facePart = (
    field: "eyes" | "brows" | "mouth" | "faceDetail",
    remap: Readonly<Record<string, string>>,
  ): void => {
    const option = requireOption(field, appearance[field]);
    if (option.layer !== null) {
      const shimmer =
        "shimmer" in option && option.shimmer !== undefined
          ? option.shimmer
          : undefined;
      layers.push({
        slot: "face",
        art: option.layer,
        remap,
        ...(shimmer ? { shimmer } : {}),
      });
    }
  };
  // Headwear that covers the eye rows drops the eyes layer outright —
  // the eye color survives only in portraits, where the lens glass is
  // dithered translucent.
  if (!headwear.coversEyes) {
    facePart("eyes", { ...skin, ...eyeRemap });
  }
  facePart("brows", hairRemap);
  facePart("mouth", skin);
  facePart("faceDetail", skin);

  // The headwear's catalog rule picks the hair layer: unchanged when
  // it shows, the style's flattened under-cap variant when it crushes,
  // nothing when it hides.
  const hair = requireOption("hairStyle", appearance.hairStyle);
  const hairArt =
    headwear.hairRule === "hides"
      ? null
      : headwear.hairRule === "crushes"
        ? hair.crushed
        : hair.layer;
  if (hairArt !== null) {
    layers.push({ slot: "hair", art: hairArt, remap: hairRemap });
  }

  if (headwear.layer !== null) {
    layers.push({ slot: "headwear", art: headwear.layer, remap: {} });
  }

  if (equipment.weapon !== null) {
    layers.push({ slot: "weapon", art: equipment.weapon, remap: {} });
  }

  // Fixed slot order (not object-key order) keeps the output stable no
  // matter how the enhancements record was built.
  for (const slot of ENHANCEMENT_SLOTS) {
    const itemId = equipment.enhancements[slot];
    if (itemId !== undefined) {
      layers.push({ slot: "cyberware", art: itemId, remap: {} });
    }
  }

  return layers;
}

/**
 * The full render descriptor for a character: the resolved layer stack
 * plus the body build the animation transforms key off. This is what
 * the sprite provider consumes; equal appearance + equipment always
 * produce descriptors with equal cache keys.
 */
export function composeCharacter(
  appearance: Appearance,
  equipment: EquipmentState,
  lookupItem: ItemLookup = getItem,
): ComposedCharacter {
  return {
    build: requireOption("build", appearance.build).build,
    layers: resolveLayers(appearance, equipment, lookupItem),
  };
}
