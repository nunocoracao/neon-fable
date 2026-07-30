/**
 * The pixel-art SpriteProvider: selects grids from the art modules
 * (deterministic tile variants, ambient frame loops, character facing /
 * walk frames), bakes them to offscreen canvases at integer scale, and
 * caches every baked frame. All timing decisions go through the pure
 * helpers in ../animation, so frame choice is testable without a canvas.
 */
import {
  bodyFrameAt,
  frameAt,
  hash2,
  propFrameAt,
  tilePhaseMs,
  variantIndex,
  type MotionState,
} from "../animation";
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
import { INTERACTABLE_ART } from "./interactables";
import { BODY_FRAME } from "./layers/body";
import {
  composedCharacterGrid,
  composedFrameKey,
  type ComposedCharacter,
} from "./layers";
import { bakeGlow } from "./glow";
import { bakeSilhouette, bakeSprite, spriteBytes } from "./pixel";
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
   * Composed descriptor per non-player entity sprite id (enemy
   * archetype ids in combat). Undefined ids fall back to the stock
   * look; callers should memoize per id.
   */
  entity?: (id: string) => ComposedCharacter | undefined;
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

  const descriptorFor = (id: string): ComposedCharacter =>
    id === "player"
      ? player()
      : options?.entity?.(id) ?? FALLBACK_CHARACTER;

  function composedPose(pose: EntityPose): { state: MotionState; frame: number } {
    const state: MotionState = pose.moving ? "walk" : "idle";
    return { state, frame: bodyFrameAt(state, pose.timeMs) };
  }

  // Bake keys serialize the descriptor itself, so entities that look
  // alike (three of the same enemy archetype) share one baked canvas.
  function composedSprite(descriptor: ComposedCharacter, pose: EntityPose): Sprite {
    const { state, frame } = composedPose(pose);
    return cached(
      `entity:${composedFrameKey(descriptor, pose.facing, state, frame)}`,
      () =>
        bakeSprite(
          composedCharacterGrid(descriptor, pose.facing, state, frame),
          BODY_FRAME.anchorX,
          BODY_FRAME.anchorY,
          palette,
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
      return cached(`tile:${id}:${variant}:${frame}:${rain ? "wet" : "dry"}`, () =>
        bakeSprite(frames[frame] ?? [], TILE_ANCHOR_X, TILE_ANCHOR_Y, palette),
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
        bakeSprite(art.frames[frame] ?? [], art.anchorX, art.anchorY, palette),
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
        return composedSprite(options?.npc?.(x, y) ?? FALLBACK_CHARACTER, {
          facing: "s",
          moving: false,
          timeMs: timeMs + phase,
        });
      }
      const art = INTERACTABLE_ART[id];
      // A door mid-swing leaves the idle loop entirely: the opening
      // sequence is its own strip, keyed by how far open it is.
      const opening = art.openFrames;
      if (open > 0 && opening) {
        const index = doorFrameIndex(open, opening.length);
        return cached(`interactable:${id}:open:${index}`, () =>
          bakeSprite(opening[index] ?? [], art.anchorX, art.anchorY, palette),
        );
      }
      const phase = (hash2(x, y) % 5) * 120;
      const frame = frameAt(timeMs + phase, art.frameMs, art.frames.length);
      return cached(`interactable:${id}:${frame}`, () =>
        bakeSprite(art.frames[frame] ?? [], art.anchorX, art.anchorY, palette),
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
        const descriptor = options?.npc?.(x, y) ?? FALLBACK_CHARACTER;
        const { state, frame } = composedPose({
          facing: "s",
          moving: false,
          timeMs: timeMs + phase,
        });
        return untinted(
          `outline:${color}:${composedFrameKey(descriptor, "s", state, frame)}`,
          () =>
            bakeSilhouette(
              composedCharacterGrid(descriptor, "s", state, frame),
              color,
              BODY_FRAME.anchorX,
              BODY_FRAME.anchorY,
            ),
        );
      }
      // Object idle loops recolor pixels without ever moving one in or
      // out of the shape, so the resting frame stands for all of them —
      // one bake per kind, held for as long as the scene lives.
      const art = INTERACTABLE_ART[id];
      return untinted(`outline:${color}:${id}`, () =>
        bakeSilhouette(art.frames[0] ?? [], color, art.anchorX, art.anchorY),
      );
    },

    entity(id: EntitySpriteId, pose: EntityPose): Sprite {
      return composedSprite(descriptorFor(id), pose);
    },

    entitySilhouette(id: EntitySpriteId, pose: EntityPose): Sprite {
      const descriptor = descriptorFor(id);
      const { state, frame } = composedPose(pose);
      return untinted(
        `flash:${composedFrameKey(descriptor, pose.facing, state, frame)}`,
        () =>
          bakeSilhouette(
            composedCharacterGrid(descriptor, pose.facing, state, frame),
            FLASH_COLOR,
            BODY_FRAME.anchorX,
            BODY_FRAME.anchorY,
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
        bakeSprite(art.frames[index] ?? [], art.anchorX, art.anchorY, palette),
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
