/**
 * Dev art-gallery registry: flattens every registered piece of art —
 * tile variants, props, interactables, the composed NPC/enemy cast,
 * and hi-res body animations — into uniform display entries. Grids
 * pass through the same compose/remap/mirror steps the sprite provider
 * applies, so the gallery shows exactly what renders in-game. This
 * module is pure data + filtering (no canvas); baking happens in the
 * gallery screen. Future art systems (appearance layer combinations,
 * gear overlays) join the gallery by appending a builder to
 * SECTION_BUILDERS — the UI iterates whatever this module returns.
 */
import {
  BODY_TIMING,
  type Facing,
  type LoopState,
} from "../animation";
import {
  ATTACK_CLASS_IDS,
  ATTACK_TIMING,
  attackFrameCount,
  type AttackClassId,
} from "../attack";
import {
  REACTION_KINDS,
  REACTION_TIMING,
  reactionFrameCount,
  type ReactionKind,
} from "../reaction";
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
import { composeVisual } from "../../character/appearance";
import { interactableVisual } from "../../character/npc";
import { enemies } from "../../data/enemies";
import { items } from "../../data/items";
import { maps } from "../../data/maps";
import { EFFECT_SPRITE_IDS } from "../impact";
import { EFFECT_ART } from "./effects";
import { INTERACTABLE_ART } from "./interactables";
import {
  composedCharacterGrid,
  cyberChannelRemap,
  layerArtGrid,
  outfitChannelRemap,
  weaponChannelRemap,
  type ComposedCharacter,
} from "./layers";
import { BODY_BUILD_IDS, bodyViewForFacing } from "./layers/body";
import {
  CYBER_LAYER_TRAITS,
  cyberArtId,
  cyberPulseFrames,
} from "./layers/cyberware";
import { outfitArtId } from "./layers/outfits";
import { weaponArtId } from "./layers/weapons";
import { BODY_ANIM } from "./layers/bodyAnim";
import { REMAP_CHANNELS } from "./palette";
import { mirrored, type PixelGrid } from "./pixel";
import { PROP_ART } from "./props";
import { STEAM_FRAME_MS } from "../setpiece";
import { SETPIECE_ART } from "./setpieces";
import { TILE_ART } from "./tiles";

/** One gallery cell: a labeled frame loop ready to bake at ART_SCALE. */
export interface GalleryEntry {
  /** Unique within its section; the filter box matches on this. */
  id: string;
  /** Display-ready frames (compose/mirror already applied); always 1+. */
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
const MOTIONS: readonly LoopState[] = ["idle", "walk"];

function tileEntries(): GalleryEntry[] {
  return Object.entries(TILE_ART).flatMap(([id, art]) =>
    art.variants.map((frames, v) => ({
      id: art.variants.length > 1 ? `${id} v${v}` : id,
      frames,
      frameMs: frames.length > 1 ? art.frameMs : 0,
    })),
  );
}

function propEntries(): GalleryEntry[] {
  return Object.entries(PROP_ART).map(([id, art]) => ({
    id,
    frames: art.frames,
    frameMs: art.frames.length > 1 ? art.frameMs : 0,
  }));
}

/**
 * The ambient machinery (../setpiece.ts). The steam burst is a
 * scheduled sequence rather than an idle loop, so it declares no
 * frameMs of its own — the gallery plays it at the burst's own frame
 * duration to show what one actually looks like.
 */
function setPieceEntries(): GalleryEntry[] {
  return Object.entries(SETPIECE_ART).map(([id, art]) => ({
    id,
    frames: art.frames,
    frameMs: art.frameMs > 0 ? art.frameMs : STEAM_FRAME_MS,
  }));
}

function interactableEntries(): GalleryEntry[] {
  // The "npc" sprite id resolves through the appearance pipeline and
  // is covered by the cast section.
  return Object.entries(INTERACTABLE_ART).map(([id, art]) => ({
    id,
    frames: art.frames,
    frameMs: art.frames.length > 1 ? art.frameMs : 0,
  }));
}

/**
 * The full cast through the real appearance pipeline: every enemy
 * archetype's authored visual idling on all four facings, plus every
 * map NPC interactable — authored named looks and stable seeded
 * ambient fallbacks alike — exactly as the provider composes them.
 */
function castEntries(): GalleryEntry[] {
  const idle = (
    id: string,
    who: ComposedCharacter,
    facing: Facing,
  ): GalleryEntry => ({
    id,
    frames: Array.from({ length: BODY_TIMING.idle.frameCount }, (_, frame) =>
      composedCharacterGrid(who, facing, "idle", frame),
    ),
    frameMs: BODY_TIMING.idle.frameMs,
  });
  const enemySweep = enemies.flatMap((enemy) => {
    const who = composeVisual(enemy.visual);
    return FACINGS.map((facing) =>
      idle(`enemy ${enemy.id} ${facing}`, who, facing),
    );
  });
  const npcSweep = maps.flatMap((map) =>
    map.interactables
      .filter((npc) => npc.spriteId === "npc")
      .map((npc) =>
        idle(`npc ${npc.id}`, composeVisual(interactableVisual(map.id, npc)), "s"),
      ),
  );
  return [...enemySweep, ...npcSweep];
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
 * The attack sets: every attack class swinging on both builds and all
 * four facings, composed through the real pipeline — the class's weapon
 * layer in hand, the authored per-frame weapon art, the arm reach, the
 * lean, and the landed weight — so a swing can be read frame by frame
 * without starting a fight. Attack frames hold for different lengths
 * (see ATTACK_TIMING); the gallery has one duration per entry, so it
 * plays them at the set's mean hold, which keeps the pacing honest
 * without claiming to be the real sequence.
 */
function attackEntries(): GalleryEntry[] {
  const holder = (
    attackClass: AttackClassId,
    build: (typeof BODY_BUILD_IDS)[number],
  ): ComposedCharacter => ({
    build,
    layers: [
      { slot: "body", art: build, remap: {} },
      ...(attackClass === "unarmed"
        ? []
        : [
            {
              slot: "weapon" as const,
              art: weaponArtId(attackClass, build),
              remap: {},
            },
          ]),
    ],
  });
  const meanHold = (attackClass: AttackClassId): number => {
    const holds = ATTACK_TIMING[attackClass].frameMs;
    return Math.round(holds.reduce((a, b) => a + b, 0) / holds.length);
  };
  return ATTACK_CLASS_IDS.flatMap((attackClass) =>
    BODY_BUILD_IDS.flatMap((build) =>
      FACINGS.map((facing) => ({
        id: `attack ${attackClass} ${build} ${facing}`,
        frames: Array.from({ length: attackFrameCount(attackClass) }, (_, frame) =>
          composedCharacterGrid(holder(attackClass, build), facing, "attack", frame),
        ),
        frameMs: meanHold(attackClass),
      })),
    ),
  );
}

/**
 * The receiving end (../reaction.ts): every reaction — the two hit
 * recoils and the two deaths — per build, per facing, thrown both ways.
 * A death's last frame is the heap it leaves behind, so the loop ending
 * on it is the gallery showing what stays on the floor. Like the attack
 * sets these are one-shots rather than loops, and play at the set's
 * mean hold.
 */
function reactionEntries(): GalleryEntry[] {
  const figure = (
    build: (typeof BODY_BUILD_IDS)[number],
  ): ComposedCharacter => ({
    build,
    layers: [
      { slot: "body", art: build, remap: {} },
      { slot: "face", art: "standard", remap: {} },
    ],
  });
  const meanHold = (kind: ReactionKind): number => {
    const holds = REACTION_TIMING[kind].frameMs;
    return Math.round(holds.reduce((a, b) => a + b, 0) / holds.length);
  };
  return REACTION_KINDS.flatMap((kind) =>
    BODY_BUILD_IDS.flatMap((build) =>
      FACINGS.flatMap((facing) =>
        ([-1, 1] as const).map((awayX) => ({
          id: `react ${kind} ${build} ${facing} away${awayX}`,
          frames: Array.from({ length: reactionFrameCount(kind) }, (_, frame) =>
            composedCharacterGrid(figure(build), facing, "react", frame, {
              kind,
              awayX,
            }),
          ),
          frameMs: meanHold(kind),
        })),
      ),
    ),
  );
}

/**
 * Combat effects (../impact.ts): the muzzle flash, the tracer in each
 * of its authored slopes, the arc smear both hands swing, and the
 * sparks, dust, and flash a blow ends in. Single-frame effects (the
 * tracers) are static entries; the rest play at their own authored
 * hold, which is the hold the fight plays them at too.
 */
function effectEntries(): GalleryEntry[] {
  return EFFECT_SPRITE_IDS.map((id) => {
    const art = EFFECT_ART[id];
    return {
      id,
      frames: art.frames,
      frameMs: art.frames.length > 1 ? art.frameMs : 0,
    };
  });
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
 * facing, wearing the item's material remaps, one weapon sweep per
 * weapon item with a class reference × build × facing, holding the
 * item's accent recolor, and one cyberware sweep per enhancement item
 * with a family reference × build × facing, showing the item's glow
 * recolor (pulsing families animate their 2-frame flare). Catalog
 * styles whose art has not landed yet are skipped and join
 * automatically once their registry entry exists.
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
    state: LoopState,
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
  // One weapon sweep per weapon item that carries a class reference,
  // per build and facing, holding the item's accent recolor — the exact
  // layer + per-facing draw order resolveLayers produces when equipped.
  const weaponSweep = items.flatMap((item) => {
    if (item.kind !== "weapon" || !item.weaponLayer) return [];
    const ref = item.weaponLayer;
    const remap = weaponChannelRemap(ref.accent);
    return BODY_BUILD_IDS.flatMap((build) => {
      const art = weaponArtId(ref.id, build);
      if (!layerArtGrid("weapon", art, "front")) return [];
      return FACINGS.map((facing) =>
        entry(
          `weapon ${item.id} ${build} ${facing}`,
          {
            build,
            layers: [
              { slot: "body", art: build, remap: {} },
              { slot: "weapon", art, remap },
            ],
          },
          facing,
          "idle",
        ),
      );
    });
  });
  // One cyberware sweep per enhancement item that carries a family
  // reference, per build and facing, showing the item's glow recolor
  // and pulse — the exact overlay resolveLayers produces when installed.
  const cyberSweep = items.flatMap((item) => {
    if (item.kind !== "enhancement" || !item.cyberLayer) return [];
    const ref = item.cyberLayer;
    const remap = cyberChannelRemap(ref.accent);
    const shimmer = CYBER_LAYER_TRAITS[ref.id].pulses
      ? cyberPulseFrames(ref.accent)
      : undefined;
    return BODY_BUILD_IDS.flatMap((build) => {
      const art = cyberArtId(ref.id, build);
      if (!layerArtGrid("cyberware", art, "front")) return [];
      return FACINGS.map((facing) =>
        entry(
          `cyber ${item.id} ${build} ${facing}`,
          {
            build,
            layers: [
              { slot: "body", art: build, remap: {} },
              {
                slot: "cyberware",
                art,
                remap,
                ...(shimmer ? { shimmer } : {}),
              },
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
    ...weaponSweep,
    ...cyberSweep,
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
  { id: "setpieces", title: "Set pieces", build: setPieceEntries },
  { id: "cast", title: "Cast (NPCs & enemies)", build: castEntries },
  { id: "bodies", title: "Bodies (hi-res)", build: bodyEntries },
  { id: "attacks", title: "Attacks (per weapon class)", build: attackEntries },
  {
    id: "reactions",
    title: "Reactions (hits & deaths)",
    build: reactionEntries,
  },
  { id: "effects", title: "Effects (shots & impacts)", build: effectEntries },
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
