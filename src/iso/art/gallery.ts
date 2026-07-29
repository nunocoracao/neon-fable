/**
 * Dev art-gallery registry: flattens every registered piece of art —
 * tile variants, props, interactables, legacy character animations, and
 * hi-res body animations — into uniform display entries. Grids pass
 * through the same remap/mirror/upscale shims the sprite provider
 * applies, so the gallery shows exactly what renders in-game. This
 * module is pure data + filtering (no canvas); baking happens in the
 * gallery screen. Future art systems (appearance layer combinations,
 * gear overlays) join the gallery by appending a builder to
 * SECTION_BUILDERS — the UI iterates whatever this module returns.
 */
import {
  BODY_TIMING,
  type Facing,
  type MotionState,
} from "../animation";
import {
  BROWS_OPTIONS,
  EYE_COLOR_OPTIONS,
  EYES_OPTIONS,
  FACE_DETAIL_OPTIONS,
  HAIR_COLOR_OPTIONS,
  HAIR_STYLE_OPTIONS,
  HEADWEAR_OPTIONS,
  MOUTH_OPTIONS,
} from "../../data/appearance";
import { items } from "../../data/items";
import {
  CHARACTER_FRAMES,
  ROLE_REMAPS,
  type CharacterRole,
} from "./characters";
import { INTERACTABLE_ART } from "./interactables";
import {
  composedCharacterGrid,
  layerArtGrid,
  outfitChannelRemap,
  type ComposedCharacter,
} from "./layers";
import { BODY_BUILD_IDS, bodyViewForFacing } from "./layers/body";
import { outfitArtId } from "./layers/outfits";
import { BODY_ANIM } from "./layers/bodyAnim";
import { REMAP_CHANNELS } from "./palette";
import {
  mirrored,
  nativeScaled,
  remapped,
  upscaled,
  type PixelGrid,
} from "./pixel";
import { PROP_ART } from "./props";
import { IDLE_FRAME_MS, WALK_FRAME_MS } from "./provider";
import { TILE_ART } from "./tiles";

/** One gallery cell: a labeled frame loop ready to bake at ART_SCALE. */
export interface GalleryEntry {
  /** Unique within its section; the filter box matches on this. */
  id: string;
  /** Display-ready frames (shims already applied); always 1+. */
  frames: readonly PixelGrid[];
  /** Per-frame duration in ms; 0 = static. */
  frameMs: number;
}

export interface GallerySection {
  id: string;
  title: string;
  entries: readonly GalleryEntry[];
}

const FACINGS: readonly Facing[] = ["n", "e", "s", "w"];
const MOTIONS: readonly MotionState[] = ["idle", "walk"];

function tileEntries(): GalleryEntry[] {
  return Object.entries(TILE_ART).flatMap(([id, art]) =>
    art.variants.map((frames, v) => ({
      id: art.variants.length > 1 ? `${id} v${v}` : id,
      frames: frames.map(nativeScaled),
      frameMs: frames.length > 1 ? art.frameMs : 0,
    })),
  );
}

function propEntries(): GalleryEntry[] {
  return Object.entries(PROP_ART).map(([id, art]) => ({
    id,
    frames: art.native ? art.frames : art.frames.map(upscaled),
    frameMs: art.frames.length > 1 ? art.frameMs : 0,
  }));
}

function interactableEntries(): GalleryEntry[] {
  // The "npc" sprite id resolves through the character pipeline and is
  // covered by the legacy characters section.
  return Object.entries(INTERACTABLE_ART).map(([id, art]) => ({
    id,
    frames: art.frames,
    frameMs: art.frames.length > 1 ? art.frameMs : 0,
  }));
}

function legacyCharacterEntries(): GalleryEntry[] {
  const roles = Object.keys(ROLE_REMAPS) as CharacterRole[];
  return roles.flatMap((role) =>
    FACINGS.flatMap((facing) =>
      MOTIONS.map((state) => ({
        id: `${role} ${facing} ${state}`,
        frames: CHARACTER_FRAMES[facing][state].map((grid) =>
          upscaled(remapped(grid, ROLE_REMAPS[role])),
        ),
        frameMs: state === "walk" ? WALK_FRAME_MS : IDLE_FRAME_MS,
      })),
    ),
  );
}

function bodyEntries(): GalleryEntry[] {
  return BODY_BUILD_IDS.flatMap((build) =>
    FACINGS.flatMap((facing) => {
      const { view, flip } = bodyViewForFacing(facing);
      return MOTIONS.map((state) => ({
        id: `${build} ${facing} ${state}`,
        frames: BODY_ANIM[build][view][state].map((grid) =>
          flip ? mirrored(grid) : grid,
        ),
        frameMs: BODY_TIMING[state].frameMs,
      }));
    }),
  );
}

/**
 * Appearance-layer combinations rendered through the real composition
 * pipeline (compose on the neutral pose, animate, mirror), exactly what
 * the player bake produces. Two sweeps over every registered hair
 * style: style × catalog hair color × facing idling on the lean body,
 * then style × build × facing walking in the canonical color — so both
 * builds and the walk-only secondary motion (hair trail) are visible
 * without the full color × build × state product. Four face sweeps on
 * the lean body's front view (faces only exist up front): eye shape ×
 * catalog eye color, eye shape × brow shape in the canonical cyan, one
 * entry per mouth style (sprites always wear the resting mouth —
 * expressions are portrait-only), and one entry per face detail over
 * the full default face (the cyber-lines entry animates its catalog
 * shimmer). One headwear sweep per drawn option × facing over standard
 * eyes and bob hair, applying the catalog hair/eye interaction rules
 * by hand so the gallery shows exactly what resolveLayers produces.
 * One outfit sweep per wearable item with a layer reference × build ×
 * facing, wearing the item's material remaps. Catalog styles whose art
 * has not landed yet are skipped and join automatically once their
 * registry entry exists.
 */
function appearanceEntries(): GalleryEntry[] {
  const [hairChannel = "K"] = REMAP_CHANNELS.hair;
  const styles = HAIR_STYLE_OPTIONS.filter(
    (style) =>
      style.layer !== null && layerArtGrid("hair", style.layer, "front"),
  );
  const character = (
    build: (typeof BODY_BUILD_IDS)[number],
    layer: string | null,
    color: string,
  ): ComposedCharacter => ({
    build,
    layers: [
      { slot: "body", art: build, remap: {} },
      { slot: "hair", art: layer ?? "", remap: { [hairChannel]: color } },
    ],
  });
  const entry = (
    id: string,
    who: ComposedCharacter,
    facing: Facing,
    state: MotionState,
  ): GalleryEntry => {
    const { frameMs, frameCount } = BODY_TIMING[state];
    return {
      id,
      frames: Array.from({ length: frameCount }, (_, frame) =>
        composedCharacterGrid(who, facing, state, frame),
      ),
      frameMs,
    };
  };
  const colorSweep = styles.flatMap((style) =>
    HAIR_COLOR_OPTIONS.flatMap((color) =>
      FACINGS.map((facing) =>
        entry(
          `hair ${style.id} ${color.id} ${facing}`,
          character("lean", style.layer, color.color),
          facing,
          "idle",
        ),
      ),
    ),
  );
  const buildSweep = styles.flatMap((style) =>
    BODY_BUILD_IDS.flatMap((build) =>
      FACINGS.map((facing) =>
        entry(
          `hair ${style.id} ${build} walk ${facing}`,
          character(build, style.layer, "K"),
          facing,
          "walk",
        ),
      ),
    ),
  );
  const [eyeChannel = "g"] = REMAP_CHANNELS.eyes;
  const eyesOptions = EYES_OPTIONS.filter((option) =>
    layerArtGrid("face", option.layer, "front"),
  );
  const browsOptions = BROWS_OPTIONS.filter((option) =>
    layerArtGrid("face", option.layer, "front"),
  );
  const faceCharacter = (
    eyesArt: string,
    browsArt: string | null,
    eyeColor: string,
  ): ComposedCharacter => ({
    build: "lean",
    layers: [
      { slot: "body", art: "lean", remap: {} },
      { slot: "face", art: eyesArt, remap: { [eyeChannel]: eyeColor } },
      ...(browsArt === null
        ? []
        : [{ slot: "face", art: browsArt, remap: {} } as const]),
    ],
  });
  const eyeColorSweep = eyesOptions.flatMap((eyes) =>
    EYE_COLOR_OPTIONS.map((color) =>
      entry(
        `eyes ${eyes.id} ${color.id} e`,
        faceCharacter(eyes.layer, null, color.color),
        "e",
        "idle",
      ),
    ),
  );
  const faceComboSweep = eyesOptions.flatMap((eyes) =>
    browsOptions.map((brows) =>
      entry(
        `face ${eyes.id} ${brows.id} e`,
        faceCharacter(eyes.layer, brows.layer, "g"),
        "e",
        "idle",
      ),
    ),
  );
  const mouthSweep = MOUTH_OPTIONS.filter((option) =>
    layerArtGrid("face", option.layer, "front"),
  ).map((mouth) =>
    entry(
      `mouth ${mouth.id} e`,
      {
        build: "lean",
        layers: [
          { slot: "body", art: "lean", remap: {} },
          { slot: "face", art: mouth.layer, remap: {} },
        ],
      },
      "e",
      "idle",
    ),
  );
  // Face details composed over the full default face, so scars split
  // brows and ink frames the eyes exactly as in-game; the cyber-lines
  // entry carries its catalog shimmer, so the gallery loop shows the
  // glow cycling.
  const detailSweep = FACE_DETAIL_OPTIONS.filter(
    (option) =>
      option.layer !== null && layerArtGrid("face", option.layer, "front"),
  ).map((detail) =>
    entry(
      `detail ${detail.id} e`,
      {
        build: "lean",
        layers: [
          { slot: "body", art: "lean", remap: {} },
          { slot: "face", art: "standard", remap: {} },
          { slot: "face", art: "straight", remap: {} },
          { slot: "face", art: "neutral", remap: {} },
          {
            slot: "face",
            art: detail.layer ?? "",
            remap: {},
            ...(detail.shimmer ? { shimmer: detail.shimmer } : {}),
          },
        ],
      },
      "e",
      "idle",
    ),
  );
  // Headwear over the same lean base wearing standard eyes and the
  // chin-length bob, per facing, so the data-driven interaction rules
  // read straight off the gallery: the visor covers the eye rows (eyes
  // dropped), the cap and rebreather swap the bob for its crushed
  // under-cap variant, the hood hides it outright.
  const bobCrushed =
    HAIR_STYLE_OPTIONS.find((style) => style.id === "bob")?.crushed ?? null;
  const headwearSweep = HEADWEAR_OPTIONS.filter(
    (option) =>
      option.layer !== null && layerArtGrid("headwear", option.layer, "front"),
  ).flatMap((head) => {
    const hairArt =
      head.hairRule === "hides"
        ? null
        : head.hairRule === "crushes"
          ? bobCrushed
          : "bob";
    return FACINGS.map((facing) =>
      entry(
        `headwear ${head.id} ${facing}`,
        {
          build: "lean",
          layers: [
            { slot: "body", art: "lean", remap: {} },
            ...(head.coversEyes
              ? []
              : [{ slot: "face", art: "standard", remap: {} } as const]),
            ...(hairArt === null
              ? []
              : [{ slot: "hair", art: hairArt, remap: {} } as const]),
            { slot: "headwear", art: head.layer ?? "", remap: {} },
          ],
        },
        facing,
        "idle",
      ),
    );
  });
  // One outfit sweep per wearable item that carries a layer reference,
  // per build and facing, wearing the item's own material remaps — the
  // exact layer + recolor resolveLayers produces for the equipped item.
  const outfitSweep = items.flatMap((item) => {
    if (item.kind !== "outfit" || !item.outfitLayer) return [];
    const ref = item.outfitLayer;
    const remap = outfitChannelRemap(ref.primary, ref.accent);
    return BODY_BUILD_IDS.flatMap((build) => {
      const art = outfitArtId(ref.id, build);
      if (!layerArtGrid("outfit", art, "front")) return [];
      return FACINGS.map((facing) =>
        entry(
          `outfit ${item.id} ${build} ${facing}`,
          {
            build,
            layers: [
              { slot: "body", art: build, remap: {} },
              { slot: "outfit", art, remap },
            ],
          },
          facing,
          "idle",
        ),
      );
    });
  });
  return [
    ...colorSweep,
    ...buildSweep,
    ...eyeColorSweep,
    ...faceComboSweep,
    ...mouthSweep,
    ...detailSweep,
    ...headwearSweep,
    ...outfitSweep,
  ];
}

/**
 * Section builders in display order. Append here to add a section —
 * e.g. a later appearance-layer task registers its combination builder
 * and the gallery picks it up with no UI changes.
 */
const SECTION_BUILDERS: ReadonlyArray<{
  id: string;
  title: string;
  build: () => GalleryEntry[];
}> = [
  { id: "tiles", title: "Tiles", build: tileEntries },
  { id: "props", title: "Props", build: propEntries },
  { id: "interactables", title: "Interactables", build: interactableEntries },
  { id: "characters", title: "Characters (legacy)", build: legacyCharacterEntries },
  { id: "bodies", title: "Bodies (hi-res)", build: bodyEntries },
  { id: "appearance", title: "Appearance layers", build: appearanceEntries },
];

/** Every registered art piece, grouped into display sections. */
export function buildGallerySections(): GallerySection[] {
  return SECTION_BUILDERS.map(({ id, title, build }) => ({
    id,
    title,
    entries: build(),
  }));
}

/** Case-insensitive id-substring match; an empty query matches all. */
export function matchesQuery(id: string, query: string): boolean {
  return id.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * Narrow sections to entries whose id contains the query; sections left
 * with no matches are dropped.
 */
export function filterSections(
  sections: readonly GallerySection[],
  query: string,
): GallerySection[] {
  return sections
    .map((section) => ({
      ...section,
      entries: section.entries.filter((entry) => matchesQuery(entry.id, query)),
    }))
    .filter((section) => section.entries.length > 0);
}
