/**
 * The pixel-art SpriteProvider: selects grids from the art modules
 * (deterministic tile variants, ambient frame loops, character facing /
 * walk frames), bakes them to offscreen canvases at integer scale, and
 * caches every baked frame. All timing decisions go through the pure
 * helpers in ../animation, so frame choice is testable without a canvas.
 */
import {
  frameAt,
  hash2,
  propFrameAt,
  tilePhaseMs,
  variantIndex,
  type Facing,
  type MotionState,
} from "../animation";
import type { AbilityFxId } from "../abilityFx";
import { selectMotionFrame, type AttackClassId } from "../attack";
import type { EffectSpriteId } from "../impact";
import type { PopupKind } from "../popup";
import type { ReactionVariant } from "../reaction";
import type { StatusFamilyId } from "../status";
import type {
  EntityPose,
  EntitySpriteId,
  SetPieceSpriteId,
  Sprite,
  SpriteProvider,
} from "../sprites";
import {
  DEFAULT_DAY_PHASE,
  type DayPhaseId,
  type InteractableSpriteId,
  type PropId,
  type TileId,
} from "../tilemap";
import { atDensity, densityOf } from "./density";
import { ABILITY_FX_ART } from "./abilityEffects";
import { EFFECT_ART } from "./effects";
import { INTERACTABLE_ART } from "./interactables";
import { popupTextGrid } from "./popupFont";
import { newsStripGrid, type NewsTintId } from "./news";
import { STATUS_MARKER_ART } from "./statusMarkers";
import { BODY_FRAME } from "./layers/body";
import {
  characterArt,
  entityAttackClass,
  entityFrame,
  entityFrameKey,
  entityGrid,
  entityMuzzlePoint,
  type EntityArt,
} from "./entity";
import { type ComposedCharacter } from "./layers";
import { bakeGlow } from "./glow";
import {
  bakeSilhouette,
  bakeSprite,
  screenPixels,
  spriteBytes,
} from "./pixel";
import { PROP_ART } from "./props";
import { SETPIECE_ART } from "./setpieces";
import {
  createSpriteCache,
  type SpriteCacheStats,
} from "./spriteCache";
import { phasePalette } from "./tint";
import { TILE_ART } from "./tiles";
import { doorFrameIndex } from "../transition";
import {
  RAIN_STREAK_ART,
  SPLASH_ANCHOR_X,
  SPLASH_ANCHOR_Y,
  SPLASH_ART,
} from "./weather";

/** Tile-diamond center in 1x art pixels (v2 geometry: 64×32 tiles). */
const TILE_ANCHOR_X = 32;
const TILE_ANCHOR_Y = 16;

const FLASH_COLOR = "#ffffff";

/**
 * Byte budget for baked sprite canvases per provider. Steady-state
 * usage is a few MB; 64 MiB (~2,700 baked 64×96-at-2x character
 * frames) is generous headroom for the layered appearance system while
 * bounding memory if appearance churn ever generates unbounded
 * variants.
 */
export const SPRITE_CACHE_BUDGET_BYTES = 64 * 1024 * 1024;

/**
 * Dev hook: `window.__spriteCacheStats()` reports live bake-cache stats
 * (entries, est. bytes, hits/misses/evictions) for every provider still
 * alive — providers register weakly, so dropped scenes don't linger.
 */
const liveCaches = new Set<WeakRef<{ stats(): SpriteCacheStats }>>();

function exposeCacheStats(cache: { stats(): SpriteCacheStats }): void {
  if (typeof window === "undefined") return;
  liveCaches.add(new WeakRef(cache));
  const host = window as unknown as {
    __spriteCacheStats?: () => SpriteCacheStats[];
  };
  host.__spriteCacheStats = () => {
    const all: SpriteCacheStats[] = [];
    for (const ref of liveCaches) {
      const live = ref.deref();
      if (live) all.push(live.stats());
      else liveCaches.delete(ref);
    }
    return all;
  };
}

/** SpriteProvider plus the bake-cache stats hook, for tests and dev. */
export interface PixelArtSprites extends SpriteProvider {
  cacheStats(): SpriteCacheStats;
  /**
   * The pixel provider always resolves a descriptor, so the two
   * capabilities SpriteProvider leaves optional — where a blow leaves
   * from, and the effect art it leaves with — are guaranteed here.
   */
  muzzleOffset(
    id: EntitySpriteId,
    facing: Facing,
    attackVariant?: number,
  ): { x: number; y: number };
  entityAnchor(id: EntitySpriteId): { x: number; y: number };
  effect(id: EffectSpriteId, frame: number): Sprite;
  abilityEffect(id: AbilityFxId, frame: number): Sprite;
  statusMarker(id: StatusFamilyId, frame: number): Sprite;
  popupText(text: string, kind: PopupKind): Sprite;
  newsText(text: string, tint: NewsTintId): Sprite;
}

export interface PixelArtSpriteOptions {
  /**
   * Live composed-character descriptor for the player sprite. Called on
   * every lookup so appearance or equipment changes show on the next
   * frame; callers should return the same object while nothing changed
   * (bake-cache keys serialize the descriptor, so churn is only wasted
   * string work, never wrong pixels).
   */
  player?: () => ComposedCharacter;
  /**
   * Art per non-player entity sprite id (enemy look ids in combat,
   * ambient pedestrian ids on the street). Returns the typed
   * sprite-kind union, so an id may resolve to a composed person or to
   * an authored non-humanoid chassis and nothing here has to know
   * which. Undefined ids fall back to the stock look; callers should
   * memoize per id.
   */
  entity?: (id: string) => EntityArt | undefined;
  /**
   * Composed descriptor for the NPC interactable at a map position
   * (authored named looks or stable seeded ambient variety). Callers
   * should memoize per position.
   */
  npc?: (x: number, y: number) => ComposedCharacter | undefined;
  /**
   * Hour to bake at (see ../dayPhase.ts); defaults to night, the hour
   * the art is authored at. Scenes call setDayPhase when a story beat
   * moves the clock.
   */
  dayPhase?: DayPhaseId;
}

/**
 * The stock look for session-less contexts (dev explore, scene tests)
 * and unresolvable entity ids: the default build with canonical
 * porcelain channels and the default face parts. Real screens inject
 * live descriptors instead.
 */
const FALLBACK_CHARACTER: ComposedCharacter = {
  build: "lean",
  layers: [
    { slot: "body", art: "lean", remap: {} },
    { slot: "face", art: "standard", remap: {} },
    { slot: "face", art: "straight", remap: {} },
    { slot: "face", art: "neutral", remap: {} },
  ],
};

export function createPixelArtSprites(
  options?: PixelArtSpriteOptions,
): PixelArtSprites {
  const cache = createSpriteCache<Sprite>(SPRITE_CACHE_BUDGET_BYTES, spriteBytes);
  exposeCacheStats(cache);

  /** The hour every tinted bake goes through, and its baked palette. */
  let phase: DayPhaseId = options?.dayPhase ?? DEFAULT_DAY_PHASE;
  let palette = phasePalette(phase);

  /**
   * Cache key for a tinted bake. The phase is part of the key, so the
   * three hours are three sets of baked canvases that survive each
   * other: walking a street back at dusk redraws nothing.
   */
  const cached = (key: string, make: () => Sprite): Sprite =>
    cache.get(`${phase}|${key}`, make);

  /**
   * Cache key for a bake the hour cannot touch: the hit-flash
   * silhouette (one flat color) and the emissive glows (neon is its own
   * light source). Keeping these off the phase key means switching
   * hours never re-bakes them.
   */
  const untinted = (key: string, make: () => Sprite): Sprite =>
    cache.get(key, make);

  const player = (): ComposedCharacter =>
    options?.player?.() ?? FALLBACK_CHARACTER;

  const descriptorFor = (id: string): EntityArt =>
    id === "player"
      ? characterArt(player())
      : options?.entity?.(id) ?? characterArt(FALLBACK_CHARACTER);

  /**
   * Which frame of which set a pose shows. The attack sets are per
   * weapon class (per chassis and per swing, for the things that were
   * never people), so the choice needs the art — the same art the bake
   * key already serializes.
   */
  function composedPose(
    descriptor: EntityArt,
    pose: EntityPose,
  ): { state: MotionState; frame: number } {
    return selectMotionFrame(
      entityAttackClass(descriptor, pose.attackVariant ?? 0),
      pose,
    );
  }

  /**
   * The reaction variant a pose draws with, or undefined when nothing
   * has landed on it. Only meaningful once the selection rule has
   * chosen the reaction set — a queued reaction that has already played
   * out selects a loop instead.
   */
  function poseVariant(
    state: MotionState,
    pose: EntityPose,
  ): ReactionVariant | undefined {
    return state === "react" && pose.reaction ? pose.reaction : undefined;
  }

  // Bake keys serialize the art itself, so entities that look alike
  // (two spawns wearing the same record of an archetype's look family)
  // share one baked canvas. The anchor comes off the art's own frame,
  // which is what lets a 96×112 chassis and a 32×48 person go through
  // exactly the same path.
  function composedSprite(descriptor: EntityArt, pose: EntityPose): Sprite {
    const { state, frame } = composedPose(descriptor, pose);
    const variant = poseVariant(state, pose);
    const swing = pose.attackVariant ?? 0;
    const box = entityFrame(descriptor);
    return cached(
      `entity:${entityFrameKey(descriptor, pose.facing, state, frame, variant, swing)}`,
      () =>
        bakeSprite(
          entityGrid(descriptor, pose.facing, state, frame, variant, swing),
          box.anchorX,
          box.anchorY,
          palette,
          box.density,
        ),
    );
  }

  return {
    tile(id: TileId, x: number, y: number, timeMs: number, wet = false): Sprite {
      const art = TILE_ART[id];
      const variant = variantIndex(x, y, art.variants.length);
      // Rain variants run parallel to the dry ones, so a wet tile keeps
      // the texture its coordinate always picked — only water is added.
      const rain = wet ? art.wet : undefined;
      const frames = (rain ?? art.variants)[variant] ?? [];
      let frame = 0;
      if (frames.length > 1 && art.frameMs > 0) {
        // Per-tile phase offset so water/glow tiles don't pulse in sync.
        frame = frameAt(timeMs + tilePhaseMs(x, y, art.frameMs), art.frameMs, frames.length);
      }
      const density = densityOf(art);
      return cached(`tile:${id}:${variant}:${frame}:${rain ? "wet" : "dry"}`, () =>
        bakeSprite(
          frames[frame] ?? [],
          atDensity(TILE_ANCHOR_X, density),
          atDensity(TILE_ANCHOR_Y, density),
          palette,
          density,
        ),
      );
    },

    prop(id: PropId, x: number, y: number, timeMs: number): Sprite {
      const art = PROP_ART[id];
      const frame = propFrameAt(
        art.frames.length,
        art.frameMs,
        art.flicker,
        x,
        y,
        timeMs,
      );
      return cached(`prop:${id}:${frame}`, () =>
        bakeSprite(
          art.frames[frame] ?? [],
          art.anchorX,
          art.anchorY,
          palette,
          densityOf(art),
        ),
      );
    },

    interactable(
      id: InteractableSpriteId,
      x: number,
      y: number,
      timeMs: number,
      open = 0,
    ): Sprite {
      if (id === "npc") {
        // Idle facing the camera; the position hash de-syncs breathing.
        const phase = hash2(x, y) % 1000;
        return composedSprite(
          characterArt(options?.npc?.(x, y) ?? FALLBACK_CHARACTER),
          { facing: "s", moving: false, timeMs: timeMs + phase },
        );
      }
      const art = INTERACTABLE_ART[id];
      // A door mid-swing leaves the idle loop entirely: the opening
      // sequence is its own strip, keyed by how far open it is.
      const opening = art.openFrames;
      if (open > 0 && opening) {
        const index = doorFrameIndex(open, opening.length);
        return cached(`interactable:${id}:open:${index}`, () =>
          bakeSprite(
            opening[index] ?? [],
            art.anchorX,
            art.anchorY,
            palette,
            densityOf(art),
          ),
        );
      }
      const phase = (hash2(x, y) % 5) * 120;
      const frame = frameAt(timeMs + phase, art.frameMs, art.frames.length);
      return cached(`interactable:${id}:${frame}`, () =>
        bakeSprite(
          art.frames[frame] ?? [],
          art.anchorX,
          art.anchorY,
          palette,
          densityOf(art),
        ),
      );
    },

    interactableSilhouette(
      id: InteractableSpriteId,
      x: number,
      y: number,
      timeMs: number,
      color: string,
    ): Sprite {
      if (id === "npc") {
        // Same pose the sprite lookup would pick, so the outline sits
        // exactly on the shape it is tracing.
        const phase = hash2(x, y) % 1000;
        const descriptor = characterArt(
          options?.npc?.(x, y) ?? FALLBACK_CHARACTER,
        );
        const { state, frame } = composedPose(descriptor, {
          facing: "s",
          moving: false,
          timeMs: timeMs + phase,
        });
        return untinted(
          `outline:${color}:${entityFrameKey(descriptor, "s", state, frame)}`,
          () =>
            bakeSilhouette(
              entityGrid(descriptor, "s", state, frame),
              color,
              BODY_FRAME.anchorX,
              BODY_FRAME.anchorY,
              BODY_FRAME.density,
            ),
        );
      }
      // Object idle loops recolor pixels without ever moving one in or
      // out of the shape, so the resting frame stands for all of them —
      // one bake per kind, held for as long as the scene lives.
      const art = INTERACTABLE_ART[id];
      return untinted(`outline:${color}:${id}`, () =>
        bakeSilhouette(
          art.frames[0] ?? [],
          color,
          art.anchorX,
          art.anchorY,
          densityOf(art),
        ),
      );
    },

    entity(id: EntitySpriteId, pose: EntityPose): Sprite {
      return composedSprite(descriptorFor(id), pose);
    },

    attackClass(id: EntitySpriteId, attackVariant = 0): AttackClassId {
      return entityAttackClass(descriptorFor(id), attackVariant);
    },

    entityAnchor(id: EntitySpriteId): { x: number; y: number } {
      const box = entityFrame(descriptorFor(id));
      return {
        x: screenPixels(box.anchorX, box.density),
        y: screenPixels(box.anchorY, box.density),
      };
    },

    muzzleOffset(
      id: EntitySpriteId,
      facing: Facing,
      attackVariant = 0,
    ): { x: number; y: number } {
      const descriptor = descriptorFor(id);
      const point = entityMuzzlePoint(descriptor, facing, attackVariant);
      const box = entityFrame(descriptor);
      // Art pixels relative to the sprite's own anchor, in screen scale —
      // the scene adds this straight onto the entity's screen position.
      return {
        x: screenPixels(point.x - box.anchorX, box.density),
        y: screenPixels(point.y - box.anchorY, box.density),
      };
    },

    effect(id: EffectSpriteId, frame: number): Sprite {
      const art = EFFECT_ART[id];
      const index = Math.min(
        Math.max(0, Math.trunc(frame)),
        art.frames.length - 1,
      );
      return cached(`effect:${id}:${index}`, () =>
        bakeSprite(art.frames[index] ?? [], art.anchorX, art.anchorY, palette),
      );
    },

    abilityEffect(id: AbilityFxId, frame: number): Sprite {
      const art = ABILITY_FX_ART[id];
      const index = Math.min(
        Math.max(0, Math.trunc(frame)),
        art.frames.length - 1,
      );
      return cached(`ability:${id}:${index}`, () =>
        bakeSprite(art.frames[index] ?? [], art.anchorX, art.anchorY, palette),
      );
    },

    statusMarker(id: StatusFamilyId, frame: number): Sprite {
      const art = STATUS_MARKER_ART[id];
      const index = Math.min(
        Math.max(0, Math.trunc(frame)),
        art.frames.length - 1,
      );
      return cached(`status:${id}:${index}`, () =>
        bakeSprite(art.frames[index] ?? [], art.anchorX, art.anchorY, palette),
      );
    },

    popupText(text: string, kind: PopupKind): Sprite {
      // Off the phase key: a damage figure is a readout, not scenery,
      // and has to be exactly as legible at dawn as it is at 3am. The
      // composition is cached with the bake, so a number the fight has
      // already shown costs one map lookup the next time it lands.
      return untinted(`popup:${kind}:${text}`, () => {
        const grid = popupTextGrid(text, kind);
        // Anchored on the bottom center of the text: the scene places a
        // popup by the point it hangs over, whatever it says.
        return bakeSprite(
          grid,
          Math.floor((grid[0]?.length ?? 0) / 2),
          grid.length,
        );
      });
    },

    newsText(text: string, tint: NewsTintId): Sprite {
      // Off the phase key, like every other emissive thing: a screen is
      // its own light source and burns the same at dusk as at 3am. One
      // bake per line — the scroll is a moving window into this canvas,
      // never a re-bake (see ../ticker.ts).
      return untinted(`news:${tint}:${text}`, () =>
        // Anchored top-left: the scene places a strip by the corner of
        // the window it scrolls through.
        bakeSprite(newsStripGrid(text, tint), 0, 0),
      );
    },

    entitySilhouette(id: EntitySpriteId, pose: EntityPose): Sprite {
      const descriptor = descriptorFor(id);
      const { state, frame } = composedPose(descriptor, pose);
      const variant = poseVariant(state, pose);
      const swing = pose.attackVariant ?? 0;
      const box = entityFrame(descriptor);
      return untinted(
        `flash:${entityFrameKey(descriptor, pose.facing, state, frame, variant, swing)}`,
        () =>
          bakeSilhouette(
            entityGrid(descriptor, pose.facing, state, frame, variant, swing),
            FLASH_COLOR,
            box.anchorX,
            box.anchorY,
            box.density,
          ),
      );
    },

    glow(color: string, radius: number): Sprite {
      return untinted(`glow:${color}:${radius}`, () => bakeGlow(color, radius));
    },

    rainStreak(layer: number): Sprite {
      // Anchored at the grid's top-left: streak placements are already
      // the corner of the sprite, so the draw needs no offset math.
      return cached(`rain:${layer}`, () =>
        bakeSprite(RAIN_STREAK_ART[layer] ?? [], 0, 0, palette),
      );
    },

    setPiece(id: SetPieceSpriteId, frame: number): Sprite {
      const art = SETPIECE_ART[id];
      // The frame is already a decision the set-piece pass made, so the
      // key carries no clock and no position: every train on the map
      // shares one bake per frame, as does every drone.
      const index =
        art.frames.length > 0
          ? ((Math.trunc(frame) % art.frames.length) + art.frames.length) %
            art.frames.length
          : 0;
      return cached(`setpiece:${id}:${index}`, () =>
        bakeSprite(
          art.frames[index] ?? [],
          art.anchorX,
          art.anchorY,
          palette,
          densityOf(art),
        ),
      );
    },

    splash(frame: number): Sprite {
      return cached(`splash:${frame}`, () =>
        bakeSprite(
          SPLASH_ART[frame] ?? [],
          SPLASH_ANCHOR_X,
          SPLASH_ANCHOR_Y,
          palette,
        ),
      );
    },

    setDayPhase(next: DayPhaseId): void {
      if (next === phase) return;
      phase = next;
      palette = phasePalette(next);
    },

    cacheStats(): SpriteCacheStats {
      return cache.stats();
    },
  };
}
