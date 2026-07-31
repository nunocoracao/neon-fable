import {
  appearanceCatalogs,
  backgroundPresets,
  getAppearanceOption,
  type AppearanceCategory,
} from "../data/appearance";
import {
  cyberChannelRemap,
  eyeColorRemap,
  outfitChannelRemap,
  skinToneRemap,
  weaponChannelRemap,
} from "../iso/art/layers";
import type { ComposedCharacter, LayerSlot } from "../iso/art/layers";
import {
  CYBER_LAYER_TRAITS,
  cyberArtId,
  cyberPulseFrames,
} from "../iso/art/layers/cyberware";
import { outfitArtId } from "../iso/art/layers/outfits";
import { weaponArtId } from "../iso/art/layers/weapons";
import { REMAP_CHANNELS, type MaterialName } from "../iso/art/palette";
import {
  ENHANCEMENT_SLOTS,
  type EnhancementSlot,
  type Item,
} from "../inventory/items";
import type { EquipmentState } from "../inventory/equipment";
import { getItem } from "../data/items";
import { createRng, nextInt, type RngResult, type RngState } from "../state/rng";

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
 * Per-category lock flags for randomization: a truthy field survives
 * randomizeUnlocked untouched. Absent fields are unlocked.
 */
export type AppearanceLocks = Readonly<
  Partial<Record<AppearanceField, boolean>>
>;

/**
 * Re-roll every unlocked category to a uniformly random catalog pick,
 * keeping locked categories exactly as they are. Pure over the injected
 * RNG state (never Math.random), so the creation wizard's "Surprise Me"
 * button is replayable and deterministic in tests. Locked fields draw
 * nothing from the RNG; with everything locked the state comes back
 * unchanged. Always validates by construction.
 */
export function randomizeUnlocked(
  current: Appearance,
  locks: AppearanceLocks,
  rng: RngState,
): RngResult<Appearance> {
  let state = rng;
  const value: Appearance = { ...current };
  for (const field of APPEARANCE_FIELDS) {
    if (locks[field]) continue;
    const catalog = appearanceCatalogs[field];
    const roll = nextInt(state, 0, catalog.length - 1);
    state = roll.state;
    const option = catalog[roll.value];
    if (!option) throw new Error(`empty catalog for ${field}`);
    value[field] = option.id;
  }
  return { state, value };
}

/**
 * A uniformly random pick from every catalog, via the seeded RNG (never
 * Math.random) so ambient NPC looks and the creation wizard's
 * randomize button are replayable. Always validates by construction.
 */
export function randomAppearance(rng: RngState): RngResult<Appearance> {
  return randomizeUnlocked(defaultAppearance(), {}, rng);
}

/**
 * The look the creation wizard seeds the appearance step from on first
 * entry: the chosen background's first authored preset, or the stock
 * look for a background without presets. Returns a fresh copy, safe to
 * edit as the working appearance.
 */
export function presetAppearanceFor(backgroundId: string): Appearance {
  const preset = backgroundPresets(backgroundId)[0];
  return preset ? { ...preset.appearance } : defaultAppearance();
}

/**
 * A stable random appearance for a seed: the same seed always produces
 * the same (always-valid) look. Ambient NPCs derive their seed from
 * their map position, so a given passerby looks the same on every
 * visit and across sessions.
 */
export function seededAppearance(seed: number): Appearance {
  return randomAppearance(createRng(seed)).value;
}

/**
 * A recolor of the outfit layer's two material channels, overriding the
 * ones the worn item declares. This is how one issued coat serves a
 * whole look family: a crew's colors are the accent channel, a
 * different cloth is the primary. Absent channels keep the item's own
 * materials, so a dye that names only an accent leaves the cloth alone.
 */
export interface OutfitDye {
  readonly primary?: MaterialName;
  readonly accent?: MaterialName;
}

/**
 * The authored look of a non-player character: an appearance plus the
 * gear item ids drawn on the sprite, resolved exactly like player
 * equipment (outfit layer, held weapon, cyberware overlays). Content
 * data (enemy archetypes, named map NPCs) declares these; hostile-optic
 * accents and the rest of a role's read live entirely in this data —
 * the engine applies no role tinting.
 */
export interface CharacterVisual {
  appearance: Appearance;
  /** Weapon item id drawn in the hands, if any. */
  weapon?: string;
  /** Outfit item id worn over the base garb, if any. */
  outfit?: string;
  /** Installed enhancement item ids per cyber slot, if any. */
  enhancements?: Partial<Record<EnhancementSlot, string>>;
  /**
   * Crew colors: overrides the worn outfit's material channels. Only
   * meaningful with an outfit whose item carries a layer reference —
   * there is no cloth to dye otherwise.
   */
  outfitDye?: OutfitDye;
}

/**
 * The EquipmentState a CharacterVisual's gear references resolve as —
 * how NPC visuals flow through the same sprite and portrait pipelines
 * as player equipment.
 */
export function visualEquipment(visual: CharacterVisual): EquipmentState {
  return {
    weapon: visual.weapon ?? null,
    outfit: visual.outfit ?? null,
    enhancements: visual.enhancements ?? {},
  };
}

/**
 * The extra channel remap a dye lays over a resolved outfit layer, or
 * null when the look wears no crew colors. Shared by the sprite and
 * portrait paths so a dyed coat is the same color in both.
 */
export function outfitDyeRemap(
  dye: OutfitDye | undefined,
): Readonly<Record<string, string>> | null {
  if (!dye || (dye.primary === undefined && dye.accent === undefined)) {
    return null;
  }
  return outfitChannelRemap(dye.primary, dye.accent);
}

/**
 * Compose a CharacterVisual into the layer engine's render descriptor —
 * the NPC/enemy counterpart of composeCharacter over player state.
 * A crew dye lands on top of the outfit layer's own material remap, so
 * the channels it names win and the rest keep the item's colors.
 * Throws AppearanceValidationError on unknown appearance ids.
 */
export function composeVisual(
  visual: CharacterVisual,
  lookupItem: ItemLookup = getItem,
): ComposedCharacter {
  const composed = composeCharacter(
    visual.appearance,
    visualEquipment(visual),
    lookupItem,
  );
  const dye = outfitDyeRemap(visual.outfitDye);
  if (!dye) return composed;
  return {
    ...composed,
    layers: composed.layers.map((layer) =>
      layer.slot === "outfit"
        ? { ...layer, remap: { ...layer.remap, ...dye } }
        : layer,
    ),
  };
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
   * outfit, weapon, and cyberware slots, the equipped item's layer
   * family/class keyed per build (outfitArtId / weaponArtId /
   * cyberArtId).
   */
  art: string;
  remap: Readonly<Record<string, string>>;
  /**
   * Per-frame channel remaps carried straight off a shimmering catalog
   * entry (the cyber-lines face detail) or a pulsing cyberware family
   * (cyberPulseFrames); the layer engine cycles them by animation
   * frame. Absent on static layers.
   */
  shimmer?: readonly Readonly<Record<string, string>>[];
}

export class AppearanceValidationError extends Error {
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
 * Equipped gear resolves through item data: an item carrying an
 * outfitLayer reference swaps the outfit layer to its family's grid for
 * the character's build, recolored by the item's material remaps; items
 * without one (and unknown ids) keep the body's base garb underlayer.
 * The equipped weapon resolves the same way through its weaponLayer
 * class reference; unarmed characters (and weapons without a layer)
 * draw empty hands. Installed enhancements resolve through their
 * cyberLayer family reference into the topmost slot — every install
 * shows, and several compose together. The optic glow sits on the eye
 * rows, so eye-covering headwear drops it from the sprite exactly like
 * the eyes layer (portraits keep it — their lens glass is dithered).
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
    const item = lookupItem(equipment.weapon);
    const ref = item?.kind === "weapon" ? item.weaponLayer : undefined;
    if (ref) {
      layers.push({
        slot: "weapon",
        art: weaponArtId(ref.id, build),
        remap: weaponChannelRemap(ref.accent),
      });
    }
  }

  // Fixed slot order (not object-key order) keeps the output stable no
  // matter how the enhancements record was built. Unknown ids and
  // enhancements without a layer reference degrade to no visible mark,
  // never a crash.
  for (const slot of ENHANCEMENT_SLOTS) {
    const itemId = equipment.enhancements[slot];
    if (itemId === undefined) continue;
    const item = lookupItem(itemId);
    const ref = item?.kind === "enhancement" ? item.cyberLayer : undefined;
    if (!ref) continue;
    const traits = CYBER_LAYER_TRAITS[ref.id];
    if (traits.eyeRegion && headwear.coversEyes) continue;
    layers.push({
      slot: "cyberware",
      art: cyberArtId(ref.id, build),
      remap: cyberChannelRemap(ref.accent),
      ...(traits.pulses ? { shimmer: cyberPulseFrames(ref.accent) } : {}),
    });
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
