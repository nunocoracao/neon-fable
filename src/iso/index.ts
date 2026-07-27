/**
 * Isometric scene: 2:1 diamond-tile renderer, tilemap model, depth sort,
 * pathfinding, picking, and the interactive scene controller.
 */
export {
  TILE_H,
  TILE_W,
  sameTile,
  screenToTile,
  screenToWorld,
  tileDistance,
  worldToScreen,
  type ScreenPoint,
  type TilePoint,
  type WorldPoint,
} from "./coords";
export { compareDrawables, depthOf, sortDrawables, type DrawLayer, type Drawable } from "./depth";
export {
  type IsoInteractionEvent,
  type IsoInteractionHandler,
  type MapInteraction,
} from "./events";
export { findPath, findPathToAdjacent } from "./path";
export {
  CAMERA_MARGIN,
  clampCamera,
  mapPixelBounds,
  type Camera,
  type PixelBounds,
} from "./camera";
export {
  TILE_DEFS,
  buildMapGrid,
  inBounds,
  interactableAt,
  isWalkable,
  neighbors,
  requireSpawn,
  spawnPoint,
  tileAt,
  type Interactable,
  type InteractableSpriteId,
  type IsoMap,
  type LegendEntry,
  type PropId,
  type PropPlacement,
  type SpawnPoint,
  type TileDef,
  type TileId,
} from "./tilemap";
export { createIsoScene, type IsoScene, type IsoSceneOptions } from "./scene";
export { createPlaceholderSprites, type Sprite, type SpriteProvider } from "./sprites";
