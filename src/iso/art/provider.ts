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
  Sprite,
  SpriteProvider,
} from "../sprites";
import type { InteractableSpriteId, PropId, TileId } from "../tilemap";
import {
  CHARACTER_ANCHOR_X,
  CHARACTER_ANCHOR_Y,
  CHARACTER_FRAMES,
  ROLE_REMAPS,
  type CharacterRole,
} from "./characters";
import { INTERACTABLE_ART } from "./interactables";
import { BODY_FRAME } from "./layers/body";
import {
  composedCharacterGrid,
  composedFrameKey,
  type ComposedCharacter,
} from "./layers";
import { bakeGlow } from "./glow";
import {
  bakeSilhouette,
  bakeSprite,
  nativeScaled,
  remapped,
  spriteBytes,
  upscaled,
  type PixelGrid,
} from "./pixel";
import { PROP_ART } from "./props";
import {
  createSpriteCache,
  type SpriteCacheStats,
} from "./spriteCache";
import { TILE_ART } from "./tiles";

/** Tile-diamond center in 1x art pixels (v2 geometry: 64×32 tiles). */
const TILE_ANCHOR_X = 32;
const TILE_ANCHOR_Y = 16;

/**
 * Interim hi-res shim: the character set (and the props not yet marked
 * native) are still authored at the legacy 1x sizes, so those grids are
 * nearest-neighbor doubled (and their authored anchors doubled to
 * match) at bake time. Removed per set as each is re-authored natively
 * at the v2 resolution; tile grids already route through nativeScaled,
 * and native props and all interactables bake as-is.
 */
const SHIM_SCALE = 2;

export const IDLE_FRAME_MS = 480;
export const WALK_FRAME_MS = 130;
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
}

/**
 * The stock look for session-less contexts (dev explore, scene tests):
 * the default build with canonical porcelain channels and the default
 * face parts. Real screens inject a live descriptor instead.
 */
const FALLBACK_PLAYER: ComposedCharacter = {
  build: "lean",
  layers: [
    { slot: "body", art: "lean", remap: {} },
    { slot: "face", art: "standard", remap: {} },
    { slot: "face", art: "straight", remap: {} },
    { slot: "face", art: "neutral", remap: {} },
  ],
};

/** Character frame for a pose; exported for tests. */
export function characterFrameIndex(pose: EntityPose, frameCount: number): number {
  return frameAt(
    pose.timeMs,
    pose.moving ? WALK_FRAME_MS : IDLE_FRAME_MS,
    frameCount,
  );
}

function characterGrid(pose: EntityPose): { grid: PixelGrid; key: string } {
  const state = pose.moving ? "walk" : "idle";
  const frames = CHARACTER_FRAMES[pose.facing][state];
  const frame = characterFrameIndex(pose, frames.length);
  return {
    grid: frames[frame] ?? [],
    key: `${pose.facing}:${state}:${frame}`,
  };
}

export function createPixelArtSprites(
  options?: PixelArtSpriteOptions,
): PixelArtSprites {
  const cache = createSpriteCache<Sprite>(SPRITE_CACHE_BUDGET_BYTES, spriteBytes);
  exposeCacheStats(cache);

  const cached = (key: string, make: () => Sprite): Sprite => cache.get(key, make);

  const player = (): ComposedCharacter => options?.player?.() ?? FALLBACK_PLAYER;

  function composedPose(pose: EntityPose): { state: MotionState; frame: number } {
    const state: MotionState = pose.moving ? "walk" : "idle";
    return { state, frame: bodyFrameAt(state, pose.timeMs) };
  }

  function playerSprite(pose: EntityPose): Sprite {
    const descriptor = player();
    const { state, frame } = composedPose(pose);
    return cached(
      `player:${composedFrameKey(descriptor, pose.facing, state, frame)}`,
      () =>
        bakeSprite(
          composedCharacterGrid(descriptor, pose.facing, state, frame),
          BODY_FRAME.anchorX,
          BODY_FRAME.anchorY,
        ),
    );
  }

  function character(role: CharacterRole, pose: EntityPose): Sprite {
    const { grid, key } = characterGrid(pose);
    return cached(`char:${role}:${key}`, () =>
      bakeSprite(
        upscaled(remapped(grid, ROLE_REMAPS[role])),
        CHARACTER_ANCHOR_X * SHIM_SCALE,
        CHARACTER_ANCHOR_Y * SHIM_SCALE,
      ),
    );
  }

  return {
    tile(id: TileId, x: number, y: number, timeMs: number): Sprite {
      const art = TILE_ART[id];
      const variant = variantIndex(x, y, art.variants.length);
      const frames = art.variants[variant] ?? [];
      let frame = 0;
      if (frames.length > 1 && art.frameMs > 0) {
        // Per-tile phase offset so water/glow tiles don't pulse in sync.
        frame = frameAt(timeMs + tilePhaseMs(x, y, art.frameMs), art.frameMs, frames.length);
      }
      return cached(`tile:${id}:${variant}:${frame}`, () =>
        bakeSprite(
          nativeScaled(frames[frame] ?? []),
          TILE_ANCHOR_X,
          TILE_ANCHOR_Y,
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
        art.native
          ? bakeSprite(art.frames[frame] ?? [], art.anchorX, art.anchorY)
          : bakeSprite(
              upscaled(art.frames[frame] ?? []),
              art.anchorX * SHIM_SCALE,
              art.anchorY * SHIM_SCALE,
            ),
      );
    },

    interactable(
      id: InteractableSpriteId,
      x: number,
      y: number,
      timeMs: number,
    ): Sprite {
      if (id === "npc") {
        const phase = hash2(x, y) % 1000;
        return character("npc", {
          facing: "s",
          moving: false,
          timeMs: timeMs + phase,
        });
      }
      const art = INTERACTABLE_ART[id];
      const phase = (hash2(x, y) % 5) * 120;
      const frame = frameAt(timeMs + phase, art.frameMs, art.frames.length);
      return cached(`interactable:${id}:${frame}`, () =>
        bakeSprite(art.frames[frame] ?? [], art.anchorX, art.anchorY),
      );
    },

    entity(id: EntitySpriteId, pose: EntityPose): Sprite {
      return id === "player" ? playerSprite(pose) : character(id, pose);
    },

    entitySilhouette(id: EntitySpriteId, pose: EntityPose): Sprite {
      if (id === "player") {
        const descriptor = player();
        const { state, frame } = composedPose(pose);
        return cached(
          `flash:player:${composedFrameKey(descriptor, pose.facing, state, frame)}`,
          () =>
            bakeSilhouette(
              composedCharacterGrid(descriptor, pose.facing, state, frame),
              FLASH_COLOR,
              BODY_FRAME.anchorX,
              BODY_FRAME.anchorY,
            ),
        );
      }
      const { grid, key } = characterGrid(pose);
      return cached(`flash:${id}:${key}`, () =>
        bakeSilhouette(
          upscaled(grid),
          FLASH_COLOR,
          CHARACTER_ANCHOR_X * SHIM_SCALE,
          CHARACTER_ANCHOR_Y * SHIM_SCALE,
        ),
      );
    },

    glow(color: string, radius: number): Sprite {
      return cached(`glow:${color}:${radius}`, () => bakeGlow(color, radius));
    },

    cacheStats(): SpriteCacheStats {
      return cache.stats();
    },
  };
}
