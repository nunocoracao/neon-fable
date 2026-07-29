/**
 * Sprite contracts for the iso renderer. Scenes ask a SpriteProvider for
 * a drawable per tile/prop/interactable/entity each frame, passing tile
 * coordinates (for deterministic texture variants and phase offsets) and
 * the animation clock. The pixel-art implementation lives in ./art.
 */
import type { Facing } from "./animation";
import type {
  DayPhaseId,
  InteractableSpriteId,
  PropId,
  TileId,
} from "./tilemap";

/**
 * "player" for the player character; any other value identifies a
 * non-player look the provider resolves through its injected entity
 * descriptor source (combat uses enemy archetype ids). Unresolvable
 * ids render the stock fallback look rather than crashing.
 */
export type EntitySpriteId = string;

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
  /**
   * `wet` swaps in the tile's rain variant (a pooled puddle) where the
   * ground kind has one; ground without rain art ignores it.
   */
  tile(id: TileId, x: number, y: number, timeMs: number, wet?: boolean): Sprite;
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
  /** Pre-baked rain streak for a parallax layer, anchored at its tail. */
  rainStreak(layer: number): Sprite;
  /** Pre-baked splash micro-frame, anchored on the tile diamond center. */
  splash(frame: number): Sprite;
  /**
   * Move the clock: subsequent bakes go through the hour's tinted
   * palette (see ./dayPhase.ts). Optional — a provider that does not
   * tint simply ignores the hour.
   */
  setDayPhase?(phase: DayPhaseId): void;
}
