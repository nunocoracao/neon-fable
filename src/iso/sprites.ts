/**
 * Sprite contracts for the iso renderer. Scenes ask a SpriteProvider for
 * a drawable per tile/prop/interactable/entity each frame, passing tile
 * coordinates (for deterministic texture variants and phase offsets) and
 * the animation clock. The pixel-art implementation lives in ./art.
 */
import type { Facing } from "./animation";
import type { InteractableSpriteId, PropId, TileId } from "./tilemap";

export type EntitySpriteId = "player" | "enemy";

/**
 * A drawable image plus its anchor: the pixel inside the image that
 * should land on the center of the tile diamond it occupies.
 */
export interface Sprite {
  image: CanvasImageSource;
  anchorX: number;
  anchorY: number;
}

/** Animation state a character sprite is selected from. */
export interface EntityPose {
  facing: Facing;
  moving: boolean;
  /** Absolute animation clock in milliseconds. */
  timeMs: number;
}

export interface SpriteProvider {
  tile(id: TileId, x: number, y: number, timeMs: number): Sprite;
  prop(id: PropId, x: number, y: number, timeMs: number): Sprite;
  interactable(
    id: InteractableSpriteId,
    x: number,
    y: number,
    timeMs: number,
  ): Sprite;
  entity(id: EntitySpriteId, pose: EntityPose): Sprite;
  /** Solid-color silhouette of the same frame, for hit flashes. */
  entitySilhouette(id: EntitySpriteId, pose: EntityPose): Sprite;
  /**
   * Pre-baked radial glow in a palette color for the additive neon
   * pass; radius is in 1x art pixels, anchored at the glow center.
   */
  glow(color: string, radius: number): Sprite;
}
