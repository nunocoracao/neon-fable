/**
 * What the contact sheets are *of*.
 *
 * The dev art gallery (src/iso/art/gallery.ts) already flattens every
 * registered piece of art into labelled frame loops, and it does it
 * through the real compose/remap/mirror pipeline. That registry is the
 * spine of the sweep: every gallery section becomes a sheet family, so
 * art that joins the gallery joins the postcards with no work here.
 *
 * Three things the gallery does not carry are added on top:
 *
 * - **Portraits.** They are composed by src/character/portrait.ts for
 *   the DOM screens rather than registered as scene art, so the sweep
 *   walks the appearance catalogs one field at a time and then every
 *   authored look in the cast, the enemy roster, and the companions.
 * - **The composed-character matrix.** Skin × build × outfit × facing
 *   as an actual cross-product, which is the only way to see whether a
 *   deep skin tone still reads under a dark coat.
 * - **Scenes**, which live in ./scenes.ts because they need a renderer
 *   rather than a grid.
 *
 * Pure: everything here returns sheet specs. Rendering and writing are
 * somebody else's job.
 */
import {
  BROWS_OPTIONS,
  BUILD_OPTIONS,
  EYES_OPTIONS,
  EYE_COLOR_OPTIONS,
  FACE_DETAIL_OPTIONS,
  HAIR_COLOR_OPTIONS,
  HAIR_STYLE_OPTIONS,
  HEADWEAR_OPTIONS,
  MOUTH_OPTIONS,
  SKIN_TONE_OPTIONS,
} from "../data/appearance";
import { EXPRESSION_IDS, type ExpressionId } from "../iso/art/layers/face";
import { cast } from "../data/cast";
import { companions } from "../data/companions";
import { enemies } from "../data/enemies";
import { items } from "../data/items";
import {
  composeVisual,
  defaultAppearance,
  type Appearance,
  type CharacterVisual,
} from "../character/appearance";
import { composePortrait, composeVisualPortrait } from "../character/portrait";
import { BODY_TIMING, type Facing } from "../iso/animation";
import { buildGallerySections } from "../iso/art/gallery";
import { composedCharacterGrid } from "../iso/art/layers";
import type { EquipmentState } from "../inventory/equipment";
import { paginate, type SheetCell, type SheetSpec } from "./sheet";

const FACINGS: readonly Facing[] = ["n", "e", "s", "w"];

const NO_EQUIPMENT: EquipmentState = {
  weapon: null,
  outfit: null,
  enhancements: {},
};

/** One line under each section heading, saying what to look for. */
const SECTION_NOTES: Readonly<Record<string, string>> = {
  tiles: "every ground kind and variant - check these tessellate",
  props: "street furniture and machinery, at their idle frames",
  interactables: "everything the player can walk up to and use",
  setpieces: "the ambient machinery: overline, drone, vented steam",
  cast: "every humanoid look family, idling on all four facings",
  drones: "authored non-humanoid chassis, every set",
  mechs: "multi-tile chassis - note the frame is 96x112, not 32x48",
  bodies: "the bare body animation, before any layer goes on",
  attacks: "one swing per weapon class, frame by frame",
  reactions: "hit recoils and deaths, thrown both ways",
  effects: "muzzle flashes, tracers, arc smears, impacts",
  abilityEffects: "one entry per ability archetype",
  statusMarkers: "the glyph each condition family hangs over a body",
  popups: "the pixel font and every composed readout kind",
  actionIcons: "the combat action bar glyphs",
  appearance: "layer combinations through the real composition pipeline",
};

/** Every gallery section as a paginated sheet family. */
export function gallerySheets(): SheetSpec[] {
  return buildGallerySections().flatMap((section) => {
    if (section.entries.length === 0) return [];
    const spec: SheetSpec = {
      name: `art-${section.id}`,
      title: section.title,
      ...(SECTION_NOTES[section.id]
        ? { note: SECTION_NOTES[section.id] as string }
        : {}),
      cells: section.entries.map((entry) => ({
        id: entry.id,
        frames: entry.frames,
      })),
    };
    return paginate(spec);
  });
}

/** An appearance with one field replaced. */
function varied(field: keyof Appearance, value: string): Appearance {
  return { ...defaultAppearance(), [field]: value };
}

/**
 * Portraits over the appearance catalogs, one field at a time from the
 * default look. Varying a single field is what makes a catalog
 * reviewable: every difference in the row is the option, not the rest
 * of the face.
 */
function catalogPortraitCells(): SheetCell[] {
  const cells: SheetCell[] = [];
  const push = (label: string, appearance: Appearance): void => {
    cells.push({
      id: label,
      frames: [composePortrait(appearance, NO_EQUIPMENT)],
    });
  };
  for (const option of SKIN_TONE_OPTIONS) {
    for (const build of BUILD_OPTIONS) {
      push(`skin ${option.id} ${build.id}`, {
        ...defaultAppearance(),
        skinTone: option.id,
        build: build.id,
      });
    }
  }
  for (const option of HAIR_STYLE_OPTIONS) {
    push(`hair ${option.id}`, varied("hairStyle", option.id));
  }
  for (const option of HAIR_COLOR_OPTIONS) {
    push(`hair color ${option.id}`, varied("hairColor", option.id));
  }
  for (const option of EYES_OPTIONS) {
    push(`eyes ${option.id}`, varied("eyes", option.id));
  }
  for (const option of EYE_COLOR_OPTIONS) {
    push(`eye color ${option.id}`, varied("eyeColor", option.id));
  }
  for (const option of BROWS_OPTIONS) {
    push(`brows ${option.id}`, varied("brows", option.id));
  }
  for (const option of MOUTH_OPTIONS) {
    push(`mouth ${option.id}`, varied("mouth", option.id));
  }
  for (const option of FACE_DETAIL_OPTIONS) {
    push(`detail ${option.id}`, varied("faceDetail", option.id));
  }
  for (const option of HEADWEAR_OPTIONS) {
    push(`headwear ${option.id}`, varied("headwear", option.id));
  }
  // Expressions are a portrait-only channel: sprites always wear the
  // resting mouth, so this row exists nowhere else in the sweep.
  for (const expression of EXPRESSION_IDS) {
    cells.push({
      id: `expression ${expression}`,
      frames: [
        composePortrait(
          defaultAppearance(),
          NO_EQUIPMENT,
          expression as ExpressionId,
        ),
      ],
    });
  }
  return cells;
}

/** Every authored look in the game, as the portrait it wears. */
function authoredPortraitCells(): SheetCell[] {
  const cells: SheetCell[] = [];
  for (const [name, visual] of Object.entries(cast)) {
    cells.push({ id: `cast ${name}`, frames: [composeVisualPortrait(visual)] });
  }
  for (const companion of companions) {
    for (const look of companion.looks) {
      cells.push({
        id: `companion ${companion.id} ${look.id}`,
        frames: [composeVisualPortrait(look.visual)],
      });
    }
  }
  for (const enemy of enemies) {
    if (enemy.spriteKind !== "humanoid") continue;
    enemy.looks.forEach((visual, index) => {
      cells.push({
        id: `enemy ${enemy.id} look${index}`,
        frames: [composeVisualPortrait(visual)],
      });
    });
  }
  return cells;
}

/** The portrait sheets: the catalogs, then the shipped faces. */
export function portraitSheets(): SheetSpec[] {
  return [
    ...paginate({
      name: "portrait-catalog",
      title: "Portraits: appearance catalogs",
      note: "one field changed from the default look, per cell",
      cells: catalogPortraitCells(),
    }),
    ...paginate({
      name: "portrait-cast",
      title: "Portraits: the shipped faces",
      note: "every authored cast, companion, and enemy look",
      cells: authoredPortraitCells(),
    }),
  ];
}

/** Outfit items with a drawable layer, in catalog order. */
function outfitItemIds(): string[] {
  return items
    .filter((item) => item.kind === "outfit" && item.outfitLayer)
    .map((item) => item.id);
}

/**
 * The composed-character matrix: skin × build × outfit × facing, in one
 * place, on the idle pose's first frame. This is the cross-product the
 * per-axis sweeps cannot show — whether a deep umber face still reads
 * under a dark longcoat, whether heavy and lean wear the same coat the
 * same way, whether a facing loses the outfit's accent entirely.
 *
 * Hair advances with the skin index rather than being held fixed, so
 * the matrix also shows each tone against a different crown instead of
 * repeating one silhouette sixteen times.
 */
export function characterMatrixSheets(): SheetSpec[] {
  const outfits = outfitItemIds();
  const hairs = HAIR_STYLE_OPTIONS.filter((style) => style.layer !== null);
  const cells: SheetCell[] = [];
  SKIN_TONE_OPTIONS.forEach((skin, skinIndex) => {
    for (const build of BUILD_OPTIONS) {
      outfits.forEach((outfit, outfitIndex) => {
        const hair = hairs[(skinIndex + outfitIndex) % hairs.length];
        const visual: CharacterVisual = {
          appearance: {
            ...defaultAppearance(),
            skinTone: skin.id,
            build: build.id,
            hairStyle: hair?.id ?? "buzz",
          },
          outfit,
        };
        const who = composeVisual(visual);
        for (const facing of FACINGS) {
          cells.push({
            id: `${skin.id} ${build.id} ${outfit} ${facing}`,
            frames: [composedCharacterGrid(who, facing, "idle", 0)],
          });
        }
      });
    }
  });
  return paginate({
    name: "character-matrix",
    title: "Composed characters: skin x build x outfit x facing",
    cells,
  });
}

/**
 * Walk cycles for the same matrix, as frame strips. The walk is where
 * a layer that does not follow the body shows up — a coat hem that
 * stays put while the legs move, hair that trails on the wrong frame —
 * and a strip is the only way to see it without a clock.
 */
export function walkStripSheets(): SheetSpec[] {
  const outfits = outfitItemIds().slice(0, 4);
  const cells: SheetCell[] = [];
  for (const build of BUILD_OPTIONS) {
    for (const outfit of outfits) {
      const who = composeVisual({
        appearance: { ...defaultAppearance(), build: build.id },
        outfit,
      });
      for (const facing of FACINGS) {
        cells.push({
          id: `walk ${build.id} ${outfit} ${facing}`,
          frames: Array.from(
            { length: BODY_TIMING.walk.frameCount },
            (_, frame) => composedCharacterGrid(who, facing, "walk", frame),
          ),
        });
      }
    }
  }
  return paginate({
    name: "character-walk",
    title: "Walk cycles, frame by frame",
    note: "one strip per build, outfit, and facing",
    cells,
  });
}

/**
 * Enemy and companion looks as sprites rather than portraits: the
 * roster standing in a row, so a fight's cast can be read for silhouette
 * variety in one image.
 */
export function rosterSheets(): SheetSpec[] {
  const cells: SheetCell[] = [];
  const stand = (id: string, visual: CharacterVisual): void => {
    const who = composeVisual(visual);
    for (const facing of FACINGS) {
      cells.push({
        id: `${id} ${facing}`,
        frames: [composedCharacterGrid(who, facing, "idle", 0)],
      });
    }
  };
  for (const companion of companions) {
    for (const look of companion.looks) {
      stand(`companion ${companion.id} ${look.id}`, look.visual);
    }
  }
  for (const [name, visual] of Object.entries(cast)) {
    stand(`cast ${name}`, visual);
  }
  return paginate({
    name: "roster",
    title: "Companions and named cast, as sprites",
    note: "the same looks the portraits are made from, standing up",
    cells,
  });
}

/** Equipment shown on a body: the outfit, weapon, and cyberware layers. */
export function gearSheets(): SheetSpec[] {
  const cells: SheetCell[] = [];
  for (const item of items) {
    const wears =
      item.kind === "outfit" && item.outfitLayer
        ? { outfit: item.id }
        : item.kind === "weapon" && item.weaponLayer
          ? { weapon: item.id }
          : null;
    if (!wears) continue;
    for (const build of BUILD_OPTIONS) {
      const who = composeVisual({
        appearance: { ...defaultAppearance(), build: build.id },
        ...wears,
      });
      for (const facing of FACINGS) {
        cells.push({
          id: `${item.id} ${build.id} ${facing}`,
          frames: [composedCharacterGrid(who, facing, "idle", 0)],
        });
      }
    }
  }
  return paginate({
    name: "gear",
    title: "Gear on a body: outfits and weapons",
    note: "every item with a drawn layer, on both builds",
    cells,
  });
}

/** Portrait equipment sweep: what the shoulders do with a worn outfit. */
export function gearPortraitSheets(): SheetSpec[] {
  const cells: SheetCell[] = items
    .filter((item) => item.kind === "outfit" && item.outfitLayer)
    .map((item) => ({
      id: `portrait ${item.id}`,
      frames: [
        composePortrait(defaultAppearance(), {
          ...NO_EQUIPMENT,
          outfit: item.id,
        }),
      ],
    }));
  return cells.length === 0
    ? []
    : paginate({
        name: "portrait-gear",
        title: "Portraits: worn outfits",
        note: "the shoulder band takes the outfit's material channels",
        cells,
      });
}

/** Every grid-based sheet in the sweep, in the order they are written. */
export function allGridSheets(): SheetSpec[] {
  return [
    ...gallerySheets(),
    ...characterMatrixSheets(),
    ...walkStripSheets(),
    ...gearSheets(),
    ...rosterSheets(),
    ...portraitSheets(),
    ...gearPortraitSheets(),
  ];
}
