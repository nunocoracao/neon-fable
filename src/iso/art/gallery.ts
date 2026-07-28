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
  CHARACTER_FRAMES,
  ROLE_REMAPS,
  type CharacterRole,
} from "./characters";
import { INTERACTABLE_ART } from "./interactables";
import { BODY_BUILD_IDS, bodyViewForFacing } from "./layers/body";
import { BODY_ANIM } from "./layers/bodyAnim";
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
