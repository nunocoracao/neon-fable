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
  type IsoFocusHint,
  type IsoFocusHintHandler,
  type IsoInteractionEvent,
  type IsoInteractionHandler,
  type MapInteraction,
} from "./events";
export {
  DEFAULT_OUTLINE_PALETTE,
  INTERACT_RANGE,
  OUTLINE_COLORS,
  focusInteractable,
  interactablesInRange,
  nearestInteractable,
  outlineColor,
  type FocusQuery,
  type FocusReason,
  type FocusedInteractable,
  type OutlinePaletteId,
} from "./affordance";
export { findPath, findPathToAdjacent } from "./path";
export {
  MAX_AMBIENT_PER_MAP,
  ambientLookSeed,
  ambientSpriteId,
  createCrowd,
  crowdEntities,
  inZone,
  resolveZones,
  roamTiles,
  stepCrowd,
  stepPedestrian,
  type AmbientCrowd,
  type AmbientPedestrian,
  type AmbientZoneState,
} from "./ambient";
export {
  CAMERA_MARGIN,
  clampCamera,
  initialCamera,
  mapPixelBounds,
  type Camera,
  type PixelBounds,
} from "./camera";
export {
  DAY_PHASES,
  DEFAULT_DAY_PHASE,
  ENTRY_SPAWN_ID,
  TILE_DEFS,
  buildMapGrid,
  entryFacing,
  inBounds,
  interactableAt,
  isWalkable,
  mapExits,
  neighbors,
  requireSpawn,
  spawnPoint,
  tileAt,
  type Interactable,
  type MapExit,
  type InteractableSpriteId,
  type IsoMap,
  type LegendEntry,
  type PropId,
  type PropPlacement,
  type AmbientSpec,
  type AmbientZone,
  type DayPhaseId,
  type SpawnPoint,
  type TileDef,
  type TileId,
  type WeatherId,
} from "./tilemap";
export { glowIntensityScale, resolveDayPhase } from "./dayPhase";
export {
  FACING_STEP,
  MINIMAP_CELL_MAX,
  MINIMAP_CELL_MIN,
  MINIMAP_COLORS,
  MINIMAP_MAX_PX,
  minimapCell,
  minimapCells,
  minimapLayout,
  minimapPipKind,
  minimapPips,
  minimapViewport,
  pipSize,
  sameMinimapView,
  tickLength,
  tileCenter,
  tileTopLeft,
  type MinimapCell,
  type MinimapLayout,
  type MinimapPip,
  type MinimapPipKind,
  type MinimapPlayer,
  type MinimapRect,
  type MinimapView,
} from "./minimap";
export {
  ARENA_STREAK_DENSITY,
  PUDDLE_DENSITY,
  RAIN_LAYERS,
  activeSplashes,
  puddleAt,
  puddleTiles,
  rainStreaks,
  resolveWeather,
  shimmerFactor,
  splashFrameAt,
  tileHoldsWater,
  tileKey,
  wetTiles,
  type RainLayer,
  type RainStreak,
  type Splash,
  type WeatherView,
} from "./weather";
export { createIsoScene, type IsoScene, type IsoSceneOptions } from "./scene";
export {
  type FocusView,
  type OpeningView,
  type RenderView,
  type SceneEntity,
} from "./render";
export {
  DOOR_TIMING,
  TRANSITION_CUT,
  TRANSITION_TIMING,
  coverAlpha,
  destinationShown,
  doorCycleMs,
  doorFrameIndex,
  doorOpen01,
  doorTiming,
  transitionDurationMs,
  transitionPhaseAt,
  transitionSwapMs,
  transitionTiming,
  type DoorTiming,
  type TransitionPhase,
  type TransitionTiming,
} from "./transition";
export {
  createCombatScene,
  type CombatHighlights,
  type CombatScene,
  type CombatSceneEntity,
  type CombatSceneOptions,
} from "./combatScene";
export {
  type EntityPose,
  type EntitySpriteId,
  type Sprite,
  type SpriteProvider,
} from "./sprites";
export {
  createPixelArtSprites,
  type PixelArtSpriteOptions,
  type PixelArtSprites,
} from "./art/provider";
export {
  composedCharacterKey,
  type ComposedCharacter,
  type ComposedLayer,
} from "./art/layers";
export { type SpriteCacheStats } from "./art/spriteCache";
export {
  facingFromDelta,
  frameAt,
  pulse01,
  variantIndex,
  type Facing,
  type MotionState,
} from "./animation";
