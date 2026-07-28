/**
 * The pixel-art SpriteProvider: selects grids from the art modules
 * (deterministic tile variants, ambient frame loops, character facing /
 * walk frames), bakes them to offscreen canvases at integer scale, and
 * caches every baked frame. All timing decisions go through the pure
 * helpers in ../animation, so frame choice is testable without a canvas.
 */
import { flickerOn, frameAt, hash2, tilePhaseMs, variantIndex } from "../animation";
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
import {
  bakeSilhouette,
  bakeSprite,
  nativeScaled,
  remapped,
  upscaled,
  type PixelGrid,
} from "./pixel";
import { PROP_ART } from "./props";
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

export function createPixelArtSprites(): SpriteProvider {
  const cache = new Map<string, Sprite>();

  const cached = (key: string, make: () => Sprite): Sprite => {
    let sprite = cache.get(key);
    if (!sprite) {
      sprite = make();
      cache.set(key, sprite);
    }
    return sprite;
  };

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
      let frame = 0;
      if (art.flicker && !flickerOn(timeMs, hash2(x, y))) {
        frame = art.frames.length - 1;
      } else {
        // Flicker props reserve their last frame for the dropout look.
        const loop = art.flicker ? art.frames.length - 1 : art.frames.length;
        if (loop > 1 && art.frameMs > 0) {
          const phase = (hash2(x, y) % 7) * 97;
          frame = frameAt(timeMs + phase, art.frameMs, loop);
        }
      }
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
      return character(id, pose);
    },

    entitySilhouette(id: EntitySpriteId, pose: EntityPose): Sprite {
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
  };
}
