/**
 * Combat arena scene: renders an arena map with combatant entities, HP
 * bars, tile highlights (reachable / targets / path preview), walk
 * tweens, and combat feedback — attack lunges, hit flash + shake, hit
 * reactions, deaths, and the floating readouts a blow leaves behind
 * (damage figures, misses, heals, condition labels). Presentation only —
 * the combat screen feeds it authoritative state and interprets clicks;
 * this layer never imports the combat engine. All effect timing math
 * comes from the pure helpers in ./animation, ./attack, and ./reaction.
 */
import { settings, type ZoomLevel } from "../settings";
import {
  ABILITY_FX,
  abilityCastMs,
  abilityFxFrameAt,
  beamPoints,
  beamSegmentCount,
  castsWithWeapon,
  planAbilityCast,
  type AbilityCastPlan,
  type AbilityFxId,
} from "./abilityFx";
import {
  dissolve01,
  facingFromDelta,
  lunge01,
  shakeOffsetPx,
  type Facing,
} from "./animation";
import { attackSequence, type AttackClassId, type AttackSequence } from "./attack";
import {
  IMPACT_FEEL,
  NO_PAUSES,
  advancePauses,
  combinedShakeAt,
  glideCameraAt,
  glideDone,
  hitPauseMs,
  insertPause,
  planCameraGlide,
  resolveCombatFeel,
  sceneTimeAt,
  shakeAmplitudePx,
  shakeDirection,
  shakeFinished,
  type CameraGlide,
  type CombatFeel,
  type ImpactWeight,
  type PauseTimeline,
  type ShakeSource,
  type TurnPace,
} from "./cameraFeel";
import {
  ATTACK_FX_STYLE,
  effectFrameAt,
  effectSpriteId,
  impactSequence,
  overshootPoint,
  swipeSpriteId,
  tracerPointAt,
  tracerProgress,
  tracerSpriteId,
  type EffectSpriteId,
  type ImpactSequence,
} from "./impact";
import {
  activeReaction,
  latestBeatFor,
  pruneReactions,
  reactionDurationMs,
  reactionPoseAt,
  scheduleReaction,
  type DeathReactionKind,
  type ReactionPose,
  type ScheduledReaction,
} from "./reaction";
import {
  POPUP_LIFT_PX,
  POPUP_MS,
  nextPopupSlot,
  popupMotionAt,
  popupSlotOffsetPx,
  type PopupKind,
} from "./popup";
import {
  statusMarkerFrame,
  statusMarkerOffsets,
  type StatusFamilyId,
} from "./status";
import { createPixelArtSprites } from "./art/provider";
import {
  cameraTranslation,
  clampCamera,
  focusCamera,
  mapPixelBounds,
  snapToPixelGrid,
  viewportToWorld,
  type Camera,
} from "./camera";
import {
  TILE_H,
  TILE_W,
  sameTile,
  screenToTile,
  worldToScreen,
  type ScreenPoint,
  type TilePoint,
  type WorldPoint,
} from "./coords";
import { resolveDayPhase } from "./dayPhase";
import { compareDrawables, type Drawable } from "./depth";
import { observeDevicePixelRatio } from "./dpr";
import type { EntitySpriteId, SpriteProvider } from "./sprites";
import {
  DEFAULT_TELEGRAPH_PALETTE,
  TELEGRAPH_PAINT_ORDER,
  TELEGRAPH_PATH_LINE,
  telegraphStyle,
  type TelegraphPaletteId,
  type TelegraphTintId,
} from "./telegraphPalette";
import { tileKey, resolveWeather, type WeatherView } from "./weather";
import { paintRainStreaks, paintSplashes } from "./weatherPaint";
import type { DayPhaseId, IsoMap, WeatherId } from "./tilemap";

/** Authoritative view of one combatant, pushed by the combat screen. */
export interface CombatSceneEntity {
  id: string;
  spriteId: EntitySpriteId;
  /**
   * Logical tile — the block's minimum-x, minimum-y corner; the scene
   * walks the sprite toward it when it changes.
   */
  position: TilePoint;
  /**
   * Tiles this combatant stands on, anchored at `position`. Absent is
   * the single tile almost everything occupies. The scene draws one
   * sprite over the block's *centre* and depth-sorts it there, so a
   * chassis reads as standing across its whole footprint and characters
   * pass in front of and behind it correctly.
   */
  footprint?: { width: number; height: number };
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Marks whose turn it is (drawn as a ring under the sprite). */
  active: boolean;
  /**
   * Place in the fight's initiative order. Reactions answering the same
   * impact beat play in it, earliest first, so a blow that lands on
   * several combatants at once reads as a sequence rather than a
   * simultaneous twitch. Defaults to 0 (all tied, resolved by id).
   */
  order?: number;
  /**
   * How this combatant dies: bodies crumple, chassis spark out. From
   * content data (an enemy archetype's chassis); defaults to a crumple.
   */
  deathStyle?: DeathReactionKind;
  /**
   * Conditions currently true of this combatant (see ./status.ts), each
   * drawn as its family's marker over the body for as long as it is
   * pushed. Presentation only — the engine owns the conditions
   * themselves; the scene only shows what it is handed.
   */
  statuses?: readonly StatusFamilyId[];
  /**
   * True while this combatant is standing in a declared wind-up it has
   * not thrown yet (see src/combat/charge.ts). Selects the held charge
   * stance for art that authors one — presentation only; the engine
   * owns the charge itself.
   */
  charging?: boolean;
}

/** What the scene needs to know about a blow being thrown. */
export interface AttackFxOptions {
  /**
   * Whether the blow connects. A hit ends in sparks on the target; a
   * miss carries a tile past it and puffs wall dust instead, so the two
   * read apart from across the arena. Defaults to a hit — abilities
   * that reach the damage step never miss.
   */
  hit?: boolean;
  /**
   * Which of the attacker's attack sets throws it, for art that swings
   * more than one way. 0 — its default swing — for everything else.
   * The set decides the animation, its beat timing, and the effect
   * style, so a chassis's piston smears and its battery fires tracers
   * with nothing here knowing which is which.
   */
  attackVariant?: number;
}

/** What the scene needs to know about a blow that just landed. */
export interface HitFxOptions {
  /** Who threw it; the reaction recoils away from them. */
  attackerId?: string;
  /**
   * Ms to hold the reaction back — the attacking sequence's impact beat
   * (see attackFx), so the flinch answers the blow rather than the
   * decision to throw it.
   */
  delayMs?: number;
  /**
   * The target's armor took the greater share of it: a reduced shudder
   * plays instead of a full flinch.
   */
  glancing?: boolean;
  /**
   * What the blow weighed, read off the figures the combat math already
   * produced (see ../ui/combatFeel.ts). It decides the camera's answer
   * and nothing else: how long the scene holds on contact, and how hard
   * it is thrown. Absent reads as a solid hit, or a glance when the
   * caller said so.
   */
  weight?: ImpactWeight;
}

/** One tinted tile, already resolved to the tint it is painted with. */
export interface TelegraphTileView {
  x: number;
  y: number;
  tint: TelegraphTintId;
}

export interface CombatHighlights {
  /**
   * Every tinted tile: reach, range, the previewed path, the exact
   * impact of an aimed action, a refused hover. Painted as diamond
   * overlays under the fighters, batched one draw per tint (see
   * ./telegraphPalette.ts). The scene decides nothing about which tile
   * gets which tint — the combat screen hands it a finished set.
   */
  tiles: readonly TelegraphTileView[];
  /**
   * Tile centers the previewed walk runs through, in walking order, drawn
   * as a dotted line from the walker's own feet. Empty when nothing is
   * being previewed.
   */
  pathLine: readonly TilePoint[];
  hover: TilePoint | null;
}

export interface CombatSceneOptions {
  map: IsoMap;
  onTileClick(tile: TilePoint): void;
  /**
   * The tile under the pointer, and where the pointer is in viewport
   * coordinates — so the screen can hang an outcome chip beside the
   * cursor. Both are null when the pointer leaves the arena.
   */
  onTileHover(tile: TilePoint | null, at: { x: number; y: number } | null): void;
  sprites?: SpriteProvider;
  /**
   * Which telegraph palette the tile tints are painted from. The
   * accessibility option selects it; defaults to the arena's own neon.
   */
  telegraphPalette?: TelegraphPaletteId;
  /**
   * Whether the tile tints are painted at boosted opacity — the "bold
   * telegraphs" assist (see src/data/assists.ts). Which tiles carry
   * which role is decided by the engine and is identical either way;
   * this only says how loudly they are drawn.
   */
  telegraphBoost?: boolean;
  /**
   * Weather to fight under. An arena has no sky of its own, so the
   * combat screen passes the weather of the map the fight was entered
   * from; the streaks are then thinned (ARENA_STREAK_DENSITY) so the
   * grid stays readable. Visual only — nothing here reaches the engine.
   */
  weather?: WeatherId;
  /**
   * Hour to fight at. An arena has no clock of its own either, so the
   * combat screen passes the hour the fight was entered under — the
   * map's, or the one a story beat had staged. Visual only: the arena
   * bakes through that phase's tinted palette (see ./dayPhase.ts).
   */
  dayPhase?: DayPhaseId;
}

export interface CombatScene {
  /** Replace the entity view; changed positions animate as walks. */
  setEntities(entities: readonly CombatSceneEntity[]): void;
  setHighlights(highlights: Partial<CombatHighlights>): void;
  /**
   * Play the attacker's swing at the target (attack or offensive
   * ability): the attacker turns to face it, runs its weapon class's
   * attack animation, throws its weight through the blow, and fires the
   * effects that carry it — muzzle flash and tracer for a gun, an arc
   * smear for a blade, sparks or wall dust where it ends (see
   * ./impact.ts). Returns the milliseconds until the blow *lands*,
   * which callers pass back as the delay on the reactions that answer
   * it — so a rifle's damage number appears when the round arrives, not
   * when the trigger is pulled. Reduced motion returns 0: everything
   * lands at once, under a single held impact marker.
   */
  attackFx(
    attackerId: string,
    targetId: string,
    options?: AttackFxOptions,
  ): number;
  /**
   * Play an ability going off: the caster throws it (or, for a self
   * buff, simply lights up), the archetype named by the ability's
   * `effectRef` plays on every target at once, and the beat the blow
   * lands on comes back — which callers pass as the delay on the
   * reactions and numbers that answer it, exactly as with attackFx.
   * Nothing here knows an ability id; the archetype is the whole
   * contract (see ./abilityFx.ts).
   */
  abilityFx(
    casterId: string,
    targetIds: readonly string[],
    fx: AbilityFxId,
    options?: AttackFxOptions,
  ): number;
  /**
   * Play a landed blow on its target: the white flash and shake over a
   * two-frame recoil away from the attacker (a shallower shudder when
   * armor ate most of it). Queued — reactions answering one beat play
   * in initiative order, and one body never plays two at once.
   */
  hitFx(targetId: string, options?: HitFxOptions): void;
  /**
   * Float one readout over a tile: a damage figure, a miss, a heal, a
   * condition's label (see ./popup.ts). Presentation only — the caller
   * derives what it says from the combat log, and the scene decides
   * nothing but where it goes and how it moves. Simultaneous readouts
   * over one column stack rather than overlap.
   */
  popup(request: CombatPopupRequest): void;
  /**
   * Frame whoever is about to act: the camera glides to their tile and
   * eases in, rather than cutting. The AI's turns glide faster than the
   * player's own (see TurnPace). Does nothing when the arena already
   * fits the viewport — the target clamps to where the camera is — and
   * nothing at all when the camera feel is switched off, which leaves
   * the fixed arena view exactly as it was.
   */
  focusOn(entityId: string, options?: { pace?: TurnPace }): void;
  destroy(): void;
}

/** One readout the combat screen asks the scene to float. */
export interface CombatPopupRequest {
  /** The tile it hangs over — the body it is about. */
  readonly tile: TilePoint;
  /** How it is styled; see ./popup.ts. */
  readonly kind: PopupKind;
  /** What it says, already derived from the log entry behind it. */
  readonly text: string;
  /**
   * Ms to hold it back — the beat the blow it answers actually lands
   * on (see attackFx / abilityFx), so a rifle's figure appears when the
   * round arrives rather than when the trigger is pulled.
   */
  readonly delayMs?: number;
}

/** Tiles per second entities walk between logical positions. */
const WALK_SPEED = 6;
const FLASH_MS = 300;
const SHAKE_PX = 6;
/**
 * Reduced motion's whole death animation: the body fades where it
 * stands and leaves nothing behind. No collapse, no heap — the fight
 * still reports every defeat in the log and the initiative strip.
 */
const DEATH_FADE_MS = 400;
/**
 * Screen pixels above a tile's center that a blow lands at: the chest
 * of a figure standing on it (the 32×48 frame's row 24, at ART_SCALE).
 * Effects happen at body height, not on the floor.
 */
const IMPACT_HEIGHT_PX = 40;

/**
 * How tall a body-framed sprite stands, in screen pixels: the 32×48
 * frame's anchor at ART_SCALE. The reference every height in the scene
 * is expressed relative to, so a taller frame lifts its furniture with
 * it rather than wearing a person's.
 */
const BODY_ANCHOR_PX = 88;

/**
 * Screen pixels above a tile's center that a status marker hangs at:
 * clear of the HP bar, so a condition never covers the health it
 * applies to.
 */
const STATUS_MARKER_HEIGHT_PX = 126;

/** Screen pixels a health bar floats above the top of its sprite. */
const HP_BAR_CLEARANCE_PX = 16;
/** Screen pixels a condition mark floats above the health bar. */
const STATUS_CLEARANCE_PX = 38;

/** Death for anything the caller did not describe: a body crumples. */
const DEFAULT_DEATH_STYLE: DeathReactionKind = "collapse";

interface EntityView extends CombatSceneEntity {
  /**
   * Where the anchor tile is right now (trails position while walking).
   * Everything that draws goes through `standPoint`, which offsets this
   * to the middle of the block — the anchor is a corner, the sprite is
   * over the centre.
   */
  visual: WorldPoint;
  /** Tiles still to walk; [0] is the tile being entered. */
  queue: TilePoint[];
  progress: number;
  facing: Facing;
  /** Screen-space unit vector toward the last attack target. */
  lungeDir: { dx: number; dy: number } | null;
  /** The swing being played, and when it started; null when at rest. */
  attack: AttackSequence | null;
  attackStart: number;
  /** Which attack set the swing in flight belongs to. */
  attackVariant: number;
  flashStart: number;
  /**
   * Screen-x direction away from whatever last hit this entity; the
   * recoil and the fall both go this way. Held between blows so a death
   * with no fresh hit behind it still falls somewhere sensible.
   */
  awayX: -1 | 1;
  /** Timestamp a reduced-motion death started fading; 0 when not fading. */
  fadeStart: number;
}

/**
 * One readout in flight. Its column and the point it hangs over are
 * resolved when it is asked for, so it stays where the blow landed even
 * if the body walks away before it has faded; the slot is the rung it
 * took over that column (see nextPopupSlot).
 */
interface FloatingPopup {
  text: string;
  kind: PopupKind;
  sx: number;
  sy: number;
  /** Scene-clock ms it is due on; later than now while it waits. */
  bornAt: number;
  slot: number;
}

/**
 * One blow's effects in flight. Everything positional is resolved when
 * the blow is thrown — the muzzle it left, the point it lands on, the
 * streak's own slope — so the whole sequence is pure math over the
 * scene clock from there on, and nothing shifts under it if a combatant
 * moves mid-flight.
 */
interface ImpactFx {
  readonly sequence: ImpactSequence;
  /** Scene-clock ms the attack started; every window is relative to it. */
  readonly startMs: number;
  /** Where the blow leaves from (the muzzle, or the chest). */
  readonly from: ScreenPoint;
  /** Where it lands: the target, or a tile past it on a miss. */
  readonly to: ScreenPoint;
  /** The streak picture for this line, and the smear for this hand. */
  readonly tracerId: EffectSpriteId;
  readonly swipeId: EffectSpriteId;
}

/**
 * One ability cast in flight. Like a blow's effects, everything
 * positional is resolved when the cast goes off — where it leaves from
 * and the chest of every body it reaches — so the whole sequence is
 * pure math over the scene clock from there on, and nothing shifts
 * under it if a combatant moves mid-cast.
 */
interface AbilityFx {
  readonly fx: AbilityFxId;
  readonly plan: AbilityCastPlan;
  /** Scene-clock ms the cast started; every window is relative to it. */
  readonly startMs: number;
  /** Where the cast leaves the caster (the muzzle, or the chest). */
  readonly from: ScreenPoint;
  /** Where each target's effect is drawn, in the plan's own order. */
  readonly points: readonly ScreenPoint[];
}

/**
 * The middle of a combatant's block, in fractional tile coordinates.
 * The one place the corner-anchored footprint becomes the point the
 * scene draws, sorts, and aims at — so a 2×2 chassis is drawn across
 * its block, sorts against the row it is really standing on, and takes
 * a shot in the chest rather than in one corner.
 */
function blockCenter(
  at: WorldPoint,
  footprint: { width: number; height: number } | undefined,
): WorldPoint {
  if (!footprint) return at;
  return {
    x: at.x + (Math.max(1, footprint.width) - 1) / 2,
    y: at.y + (Math.max(1, footprint.height) - 1) / 2,
  };
}

/** Where an entity is standing, as a point: the middle of its block. */
function standPoint(entity: EntityView): WorldPoint {
  return blockCenter(entity.visual, entity.footprint);
}

/** Every tile of an entity's block, from its anchor corner. */
function footprintTiles(entity: EntityView): TilePoint[] {
  const width = Math.max(1, entity.footprint?.width ?? 1);
  const height = Math.max(1, entity.footprint?.height ?? 1);
  const tiles: TilePoint[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      tiles.push({ x: entity.position.x + dx, y: entity.position.y + dy });
    }
  }
  return tiles;
}

/** Axis-by-axis steps from one tile to the next (dominant axis first). */
function stepQueue(from: TilePoint, to: TilePoint): TilePoint[] {
  const steps: TilePoint[] = [];
  let { x, y } = from;
  const walkX = (): void => {
    while (x !== to.x) {
      x += Math.sign(to.x - x);
      steps.push({ x, y });
    }
  };
  const walkY = (): void => {
    while (y !== to.y) {
      y += Math.sign(to.y - y);
      steps.push({ x, y });
    }
  };
  if (Math.abs(to.y - from.y) > Math.abs(to.x - from.x)) {
    walkY();
    walkX();
  } else {
    walkX();
    walkY();
  }
  return steps;
}

export function createCombatScene(
  canvas: HTMLCanvasElement,
  options: CombatSceneOptions,
): CombatScene {
  const { map } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2d context for combat canvas");
  const sprites = options.sprites ?? createPixelArtSprites();
  const bounds = mapPixelBounds(map);

  const entities = new Map<string, EntityView>();
  const popups: FloatingPopup[] = [];
  /** Blows whose effects have not finished playing; pruned as they end. */
  const impacts: ImpactFx[] = [];
  /** Ability casts still playing; pruned the same way. */
  const casts: AbilityFx[] = [];
  /**
   * Every reaction in flight or still waiting on its beat, plus the
   * deaths, which stay forever — their last frame is the heap on the
   * floor. Re-timed by the pure sequencer in ./reaction on every add.
   */
  let reactions: readonly ScheduledReaction[] = [];
  // The inherited hour, baked into every sprite the arena draws.
  sprites.setDayPhase?.(resolveDayPhase(map, options.dayPhase));
  /** The inherited weather, thinned for combat; null when clear or off. */
  let weatherEnabled = settings.get().weather;
  let weather: WeatherView | null = resolveWeather(map, {
    enabled: weatherEnabled,
    weather: options.weather,
    arena: true,
  });

  /** Follows the settings toggle mid-fight without a subscription. */
  function syncWeather(): void {
    const enabled = settings.get().weather;
    if (enabled === weatherEnabled) return;
    weatherEnabled = enabled;
    weather = resolveWeather(map, {
      enabled,
      weather: options.weather,
      arena: true,
    });
  }
  let highlights: CombatHighlights = {
    tiles: [],
    pathLine: [],
    hover: null,
  };
  const telegraphPalette =
    options.telegraphPalette ?? DEFAULT_TELEGRAPH_PALETTE;
  const telegraphBoost = options.telegraphBoost === true;

  /**
   * The scene clock's debt: every hit-pause still to be served, and the
   * raw time already given to the ones behind us. Scene time is the raw
   * frame timestamp with this taken out (see ./cameraFeel.ts), and every
   * sequence in the scene — swings, tracers, flinches, readouts — is
   * scheduled against it, which is what makes a freeze a freeze rather
   * than a desync.
   */
  let pauses: PauseTimeline = NO_PAUSES;
  /** Kicks in flight; pruned as they decay to nothing. */
  const shakes: ShakeSource[] = [];
  /** The reframing in flight, or null when the camera is settled. */
  let glide: CameraGlide | null = null;
  /** Which of the three camera effects the player has left switched on. */
  let feel: CombatFeel = resolveCombatFeel(settings.get());

  /** Follows the feel settings mid-fight, like the weather toggle. */
  function syncFeel(): void {
    feel = resolveCombatFeel(settings.get());
  }

  /** The scene clock right now: raw time, less every pause served. */
  function now(): number {
    return sceneTimeAt(pauses, performance.now());
  }

  let viewportW = 0;
  let viewportH = 0;
  let dpr = 1;
  /**
   * The view scale the whole arena is drawn at — the player's own zoom
   * setting, the same one the streets are explored at. Everything the
   * scene paints lives inside this transform, floating numbers
   * included, so a readout is exactly as large relative to the body it
   * is about at every level.
   */
  let zoom: ZoomLevel = settings.get().zoom;
  // Fixed camera on the arena center; arenas are small enough to fit.
  let camera: Camera = {
    sx: (bounds.minX + bounds.maxX) / 2,
    sy: (bounds.minY + bounds.maxY) / 2,
  };

  function snap(value: number): number {
    return snapToPixelGrid(value, dpr * zoom);
  }

  function resize(): void {
    dpr = window.devicePixelRatio || 1;
    viewportW = canvas.clientWidth;
    viewportH = canvas.clientHeight;
    // Backing store in device pixels; the base transform scales world
    // units by dpr * zoom so draw code stays in world-screen units.
    canvas.width = Math.round(viewportW * dpr);
    canvas.height = Math.round(viewportH * dpr);
    const scale = dpr * zoom;
    ctx!.setTransform(scale, 0, 0, scale, 0, 0);
    // At higher zoom the viewport spans fewer world units.
    camera = clampCamera(camera, bounds, viewportW / zoom, viewportH / zoom);
    // A reframing in flight was planned against the old viewport; both
    // of its ends are re-clamped rather than dropped, so a resize (or a
    // zoom step) mid-glide neither cuts nor sails off the map.
    if (glide) {
      glide = {
        ...glide,
        from: clampCamera(glide.from, bounds, viewportW / zoom, viewportH / zoom),
        to: clampCamera(glide.to, bounds, viewportW / zoom, viewportH / zoom),
      };
    }
  }

  /** Follows the zoom setting mid-fight, like the weather toggle. */
  function syncZoom(): void {
    const next = settings.get().zoom;
    if (next === zoom) return;
    zoom = next;
    resize();
  }

  function pickTile(event: PointerEvent): TilePoint {
    const rect = canvas.getBoundingClientRect();
    const world = viewportToWorld(
      camera,
      viewportW,
      viewportH,
      zoom,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    return screenToTile(world.sx, world.sy);
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.button !== 0) return;
    options.onTileClick(pickTile(event));
  }

  function onPointerMove(event: PointerEvent): void {
    options.onTileHover(pickTile(event), {
      x: event.clientX,
      y: event.clientY,
    });
  }

  function onPointerLeave(): void {
    options.onTileHover(null, null);
  }

  function stepEntities(dt: number): void {
    for (const entity of entities.values()) {
      if (entity.queue.length === 0) continue;
      entity.progress += WALK_SPEED * dt;
      while (entity.progress >= 1 && entity.queue.length > 0) {
        entity.progress -= 1;
        const reached = entity.queue.shift();
        if (reached) entity.visual = { ...reached };
      }
      const next = entity.queue[0];
      if (next) {
        const fromX = Math.round(entity.visual.x);
        const fromY = Math.round(entity.visual.y);
        entity.facing =
          facingFromDelta(next.x - fromX, next.y - fromY) ?? entity.facing;
        entity.visual = {
          x: fromX + (next.x - fromX) * entity.progress,
          y: fromY + (next.y - fromY) * entity.progress,
        };
      } else {
        entity.visual = { ...entity.position };
        entity.progress = 0;
      }
    }
  }

  /** Trace one tile's diamond into the current path, without closing it. */
  function traceDiamond(tile: TilePoint): void {
    const { sx, sy } = worldToScreen(tile.x, tile.y);
    ctx!.moveTo(sx, sy - TILE_H / 2);
    ctx!.lineTo(sx + TILE_W / 2, sy);
    ctx!.lineTo(sx, sy + TILE_H / 2);
    ctx!.lineTo(sx - TILE_W / 2, sy);
    ctx!.closePath();
  }

  function drawDiamond(
    tile: TilePoint,
    fill: string | null,
    stroke: string | null,
  ): void {
    ctx!.beginPath();
    traceDiamond(tile);
    if (fill) {
      ctx!.fillStyle = fill;
      ctx!.fill();
    }
    if (stroke) {
      ctx!.strokeStyle = stroke;
      ctx!.lineWidth = 2;
      ctx!.stroke();
    }
  }

  /**
   * The telegraph layer: every tinted tile as a diamond overlay on the
   * ground, one batch per tint — all of a tint's diamonds go into a
   * single path and take a single fill and a single stroke, so a whole
   * reachable field costs two draws rather than two per tile. Paint
   * order is the palette's (see TELEGRAPH_PAINT_ORDER), so context
   * tints never bury the hot ones sitting inside them.
   */
  function drawTelegraph(): void {
    if (highlights.tiles.length === 0) return;
    const byTint = new Map<TelegraphTintId, TelegraphTileView[]>();
    for (const tile of highlights.tiles) {
      const batch = byTint.get(tile.tint);
      if (batch) batch.push(tile);
      else byTint.set(tile.tint, [tile]);
    }
    for (const tint of TELEGRAPH_PAINT_ORDER) {
      const batch = byTint.get(tint);
      if (!batch || batch.length === 0) continue;
      const style = telegraphStyle(tint, telegraphPalette, telegraphBoost);
      ctx!.beginPath();
      for (const tile of batch) traceDiamond(tile);
      if (style.fill) {
        ctx!.fillStyle = style.fill;
        ctx!.fill();
      }
      if (style.stroke) {
        ctx!.strokeStyle = style.stroke;
        ctx!.lineWidth = style.lineWidth;
        ctx!.setLineDash([...style.dash]);
        ctx!.stroke();
        ctx!.setLineDash([]);
      }
    }
  }

  /**
   * The previewed walk as a dotted line through the tiles it crosses —
   * the pathfinder's own result, drawn as the route rather than left to
   * be read off a scatter of tinted tiles.
   */
  function drawPathLine(): void {
    const line = highlights.pathLine;
    if (line.length < 2) return;
    const style = TELEGRAPH_PATH_LINE[telegraphPalette];
    ctx!.beginPath();
    line.forEach((tile, index) => {
      const { sx, sy } = worldToScreen(tile.x, tile.y);
      if (index === 0) ctx!.moveTo(sx, sy);
      else ctx!.lineTo(sx, sy);
    });
    ctx!.strokeStyle = style.color;
    ctx!.lineWidth = style.lineWidth;
    ctx!.setLineDash([...style.dash]);
    ctx!.stroke();
    ctx!.setLineDash([]);
  }

  /**
   * Screen offset from the entity's in-flight swing: the body's travel
   * peaks on the class's impact beat and is back at rest by the end of
   * its envelope. A negative class distance reads as recoil — a rifle
   * kicks away from its own shot instead of stepping into it.
   */
  function lungeOffset(entity: EntityView, now: number): { x: number; y: number } {
    const swing = entity.attack;
    if (!entity.lungeDir || !swing) return { x: 0, y: 0 };
    const elapsed = now - entity.attackStart;
    const k = lunge01(elapsed, swing.lungeMs);
    if (k === 0 && elapsed >= swing.lungeMs) entity.lungeDir = null;
    const px = k * swing.lungePx;
    return {
      x: entity.lungeDir ? entity.lungeDir.dx * px : 0,
      // Screen y is compressed 2:1 in iso space.
      y: entity.lungeDir ? entity.lungeDir.dy * (px / 2) : 0,
    };
  }

  /** Ms into the attack animation, or undefined once it has finished. */
  function attackElapsed(entity: EntityView, now: number): number | undefined {
    if (!entity.attack) return undefined;
    const elapsed = now - entity.attackStart;
    if (elapsed >= entity.attack.durationMs) {
      entity.attack = null;
      return undefined;
    }
    return elapsed;
  }

  /**
   * Whether a fallen combatant still has anything to draw: a fade that
   * has not finished, or a queued death — whose heap, once queued,
   * stays on the floor for the rest of the fight.
   */
  function drawsDead(entity: EntityView, now: number): boolean {
    if (entity.fadeStart > 0) return now - entity.fadeStart < DEATH_FADE_MS;
    return reactions.some((r) => r.entityId === entity.id);
  }

  /**
   * The class a combatant swings with; bare hands for anything unknown.
   * Per attack set, so a chassis's piston and its shoulder battery bring
   * their own timings and their own effect styles.
   */
  function classOf(entity: EntityView, variant = entity.attackVariant): AttackClassId {
    return sprites.attackClass?.(entity.spriteId, variant) ?? "unarmed";
  }

  /** Screen-space line from one combatant to another, for the shake. */
  function lineBetween(
    from: EntityView | undefined,
    to: EntityView,
  ): { x: number; y: number } {
    if (!from) return shakeDirection(0, 0);
    const a = worldToScreen(standPoint(from).x, standPoint(from).y);
    const b = worldToScreen(standPoint(to).x, standPoint(to).y);
    return shakeDirection(b.sx - a.sx, b.sy - a.sy);
  }

  /**
   * The camera's answer to something landing: hold the scene on the
   * contact frame, then throw the view along the line the blow came in
   * on. Both are scheduled on the beat itself rather than on the moment
   * the caller asked, so a round still in the air freezes nothing — and
   * both are switched off independently by the player's settings.
   */
  function feelImpact(
    weight: ImpactWeight,
    melee: boolean,
    beatMs: number,
    dir: { x: number; y: number },
  ): void {
    syncFeel();
    if (feel.hitPause) {
      pauses = insertPause(pauses, beatMs, hitPauseMs(weight, melee), now());
    }
    if (!feel.shake) return;
    const amplitudePx = shakeAmplitudePx(weight, feel.shakeScale);
    if (amplitudePx <= 0) return;
    shakes.push({
      startMs: beatMs,
      durationMs: IMPACT_FEEL[weight].shakeMs,
      amplitudePx,
      dirX: dir.x,
      dirY: dir.y,
    });
  }

  /** Screen-x direction away from the attacker, for the recoil. */
  function awayFrom(entity: EntityView, attackerId?: string): -1 | 1 {
    const attacker = attackerId ? entities.get(attackerId) : undefined;
    if (!attacker) return entity.awayX;
    const from = worldToScreen(standPoint(attacker).x, standPoint(attacker).y);
    const to = worldToScreen(standPoint(entity).x, standPoint(entity).y);
    const dx = to.sx - from.sx;
    // Straight up or down the screen: shove it off the attacker's side.
    if (dx === 0) return to.sy >= from.sy ? 1 : -1;
    return dx > 0 ? 1 : -1;
  }

  /**
   * Queue the fall of a combatant just seen dead. Its beat is the beat
   * of whatever last landed on it, so the collapse follows that blow's
   * flinch rather than racing it; reduced motion fades instead.
   */
  function killEntity(entity: EntityView, now: number): void {
    if (settings.get().reducedMotion) {
      entity.fadeStart = now;
      return;
    }
    queueReaction(entity, entity.deathStyle ?? DEFAULT_DEATH_STYLE, now, {
      beatMs: latestBeatFor(reactions, entity.id) ?? now,
    });
  }

  /** Place one reaction on the queue and hand back where it landed. */
  function queueReaction(
    entity: EntityView,
    kind: ScheduledReaction["kind"],
    now: number,
    at: { beatMs: number },
  ): ScheduledReaction {
    const { queue, scheduled } = scheduleReaction(
      pruneReactions(reactions, now),
      {
        entityId: entity.id,
        kind,
        awayX: entity.awayX,
        order: entity.order ?? 0,
        beatMs: at.beatMs,
      },
      now,
    );
    reactions = queue;
    return scheduled;
  }

  /**
   * The reaction pose an entity is in, or undefined at rest. The one
   * source both the sprite and its flash silhouette read, so an outline
   * always traces the frame underneath it.
   */
  function reactionPose(
    entity: EntityView,
    now: number,
  ): ReactionPose | undefined {
    const active = activeReaction(reactions, entity.id, now);
    return active ? reactionPoseAt(active, now) : undefined;
  }

  /**
   * How tall this entity's sprite frame is, in screen pixels from the
   * ground it stands on — its anchor's height inside its own frame.
   * Everything the scene hangs *over* a combatant (its health bar, its
   * condition marks, the height a blow lands at) scales off this, so a
   * chassis wears them at its own shoulders and a person at theirs,
   * with no case anywhere for how big anything is.
   */
  function spriteHeightPx(entity: EntityView): number {
    return sprites.entityAnchor?.(entity.spriteId).y ?? BODY_ANCHOR_PX;
  }

  /** Chest height over an arbitrary point, for a frame that tall. */
  function chestPointAt(at: WorldPoint, anchorPx: number): ScreenPoint {
    const ground = worldToScreen(at.x, at.y);
    return {
      sx: ground.sx,
      sy: ground.sy - IMPACT_HEIGHT_PX * (anchorPx / BODY_ANCHOR_PX),
    };
  }

  /** The chest of a combatant: the height effects happen at. */
  function chestPoint(entity: EntityView): ScreenPoint {
    return chestPointAt(standPoint(entity), spriteHeightPx(entity));
  }

  /** Where a blow leaves a combatant: its weapon's muzzle, or its chest. */
  function muzzlePoint(entity: EntityView): ScreenPoint {
    const stance = worldToScreen(standPoint(entity).x, standPoint(entity).y);
    const offset = sprites.muzzleOffset?.(
      entity.spriteId,
      entity.facing,
      entity.attackVariant,
    ) ?? { x: 0, y: -IMPACT_HEIGHT_PX };
    return { sx: stance.sx + offset.x, sy: stance.sy + offset.y };
  }

  /**
   * Start a combatant swinging at another: the class's attack animation
   * from now, with the body's weight thrown along the line between them.
   * Facing is the caller's (see faceToward) — a blow is still aimed
   * where it was aimed when the animation is switched off.
   */
  function throwAt(
    attacker: EntityView,
    target: EntityView,
    attackClass: AttackClassId,
    now: number,
  ): void {
    const from = worldToScreen(standPoint(attacker).x, standPoint(attacker).y);
    const to = worldToScreen(standPoint(target).x, standPoint(target).y);
    const dx = to.sx - from.sx;
    const dy = to.sy - from.sy;
    const length = Math.hypot(dx, dy) || 1;
    attacker.lungeDir = { dx: dx / length, dy: dy / length };
    attacker.attack = attackSequence(attackClass);
    attacker.attackStart = now;
  }

  /** Turn a combatant to face another; the one beat nothing switches off. */
  function faceToward(attacker: EntityView, target: EntityView): void {
    attacker.facing =
      facingFromDelta(
        target.position.x - attacker.position.x,
        target.position.y - attacker.position.y,
      ) ?? attacker.facing;
  }

  /**
   * Fire one blow's effects: the flash at the muzzle, the streak across
   * the ground, and the spark or the wall dust it ends in. Returns the
   * sequence so the caller can hand its contact beat back to the combat
   * screen. Purely presentational — nothing here decides anything.
   */
  function spawnImpact(
    attacker: EntityView,
    target: EntityView,
    attackClass: AttackClassId,
    hit: boolean,
    now: number,
    reducedMotion: boolean,
  ): ImpactSequence {
    // A miss carries a tile past whatever it was aimed at, along the
    // attacker's own line, and hits the arena instead.
    const to = hit
      ? chestPoint(target)
      : chestPointAt(
          overshootPoint(standPoint(attacker), standPoint(target)),
          spriteHeightPx(target),
        );
    const from = muzzlePoint(attacker);
    const dx = to.sx - from.sx;
    const dy = to.sy - from.sy;
    const sequence = impactSequence(attackClass, {
      distancePx: Math.hypot(dx, dy),
      hit,
      reducedMotion,
    });
    impacts.push({
      sequence,
      startMs: now,
      from,
      to,
      tracerId: tracerSpriteId(dx, dy),
      swipeId: swipeSpriteId(dx),
    });
    return sequence;
  }

  /** Draw one baked effect frame centered on a screen point. */
  function drawEffect(id: EffectSpriteId, frame: number, at: ScreenPoint): void {
    const sprite = sprites.effect?.(id, frame);
    if (!sprite) return;
    ctx!.drawImage(
      sprite.image,
      snap(at.sx - sprite.anchorX),
      snap(at.sy - sprite.anchorY),
    );
  }

  /**
   * Every blow in flight, in its own order: what left the weapon, what
   * is crossing the ground, then what it did where it landed. Finished
   * sequences drop out — an effect leaves nothing behind.
   */
  function drawImpacts(now: number): void {
    for (let i = impacts.length - 1; i >= 0; i--) {
      const fx = impacts[i];
      if (!fx) continue;
      const elapsed = now - fx.startMs;
      if (elapsed >= fx.sequence.endMs) {
        impacts.splice(i, 1);
        continue;
      }
      const { launch, impact } = fx.sequence;
      if (launch) {
        const frame = effectFrameAt(launch, elapsed);
        if (frame !== null) {
          // A muzzle flash burns at the gun; a blade's smear is drawn
          // where the blade actually goes through.
          const id = launch.kind === "swipe" ? fx.swipeId : effectSpriteId(launch.kind);
          drawEffect(id, frame, launch.kind === "swipe" ? fx.to : fx.from);
        }
      }
      const flight = tracerProgress(fx.sequence, elapsed);
      if (flight !== null) {
        drawEffect(fx.tracerId, 0, tracerPointAt(fx.from, fx.to, flight));
      }
      const landed = effectFrameAt(impact, elapsed);
      if (landed !== null) {
        drawEffect(effectSpriteId(impact.kind), landed, fx.to);
      }
    }
  }

  /** Draw one baked ability-effect frame centered on a screen point. */
  function drawAbilityFrame(
    id: AbilityFxId,
    frame: number,
    at: ScreenPoint,
  ): void {
    const sprite = sprites.abilityEffect?.(id, frame);
    if (!sprite) return;
    ctx!.drawImage(
      sprite.image,
      snap(at.sx - sprite.anchorX),
      snap(at.sy - sprite.anchorY),
    );
  }

  /**
   * Every ability cast still playing. The form decides where the frames
   * go and nothing else does: a beam is a chain of segments laid along
   * the caster's line, and everything else is drawn on the point it was
   * placed at — the target's chest, or the caster's own for an aura.
   * Finished casts drop out; nothing here persists.
   */
  function drawCasts(now: number): void {
    for (let i = casts.length - 1; i >= 0; i--) {
      const cast = casts[i];
      if (!cast) continue;
      const elapsed = now - cast.startMs;
      if (elapsed >= cast.plan.sequence.endMs) {
        casts.splice(i, 1);
        continue;
      }
      const frame = abilityFxFrameAt(cast.plan.sequence.effect, elapsed);
      if (frame === null) continue;
      const { form, segmentSpacingPx, amplitudePx } = ABILITY_FX[cast.fx];
      cast.points.forEach((point) => {
        if (form !== "beam") {
          drawAbilityFrame(cast.fx, frame, point);
          return;
        }
        const span = Math.hypot(point.sx - cast.from.sx, point.sy - cast.from.sy);
        const count = beamSegmentCount(span, segmentSpacingPx);
        for (const step of beamPoints(cast.from, point, count, frame, amplitudePx)) {
          drawAbilityFrame(cast.fx, frame, step);
        }
      });
    }
  }

  /**
   * The conditions on a body, marked over its head in a centered row —
   * one glyph per family, however many boosts are stacked behind it.
   * Reduced motion holds the first frame: the mark stays, the loop stops.
   */
  function drawStatusMarkers(entity: EntityView, now: number): void {
    const families = entity.statuses ?? [];
    if (families.length === 0) return;
    const reduced = settings.get().reducedMotion;
    const { sx, sy } = worldToScreen(standPoint(entity).x, standPoint(entity).y);
    // Clear of the health bar, which is itself clear of the sprite —
    // so a chassis wears its marks over its own shoulders.
    const height = Math.max(
      STATUS_MARKER_HEIGHT_PX,
      spriteHeightPx(entity) + STATUS_CLEARANCE_PX,
    );
    const offsets = statusMarkerOffsets(families.length);
    families.forEach((family, index) => {
      const sprite = sprites.statusMarker?.(
        family,
        statusMarkerFrame(family, reduced ? 0 : now, reduced),
      );
      if (!sprite) return;
      ctx!.drawImage(
        sprite.image,
        snap(sx + (offsets[index] ?? 0) - sprite.anchorX),
        snap(sy - height - sprite.anchorY),
      );
    });
  }

  /**
   * Every readout still in the air: the figure a blow left, the word a
   * miss left, the label a condition announced itself with. Each rides
   * the pure curve in ./popup.ts — up and out, or held in place and out
   * under reduced motion — from the beat it was due on, so one that is
   * still waiting on a round in flight simply is not drawn yet.
   * Finished readouts drop out; nothing here persists.
   */
  function drawPopups(now: number): void {
    const reduced = settings.get().reducedMotion;
    for (let i = popups.length - 1; i >= 0; i--) {
      const popup = popups[i];
      if (!popup) continue;
      const elapsed = now - popup.bornAt;
      if (elapsed >= POPUP_MS) {
        popups.splice(i, 1);
        continue;
      }
      const motion = popupMotionAt(elapsed, reduced);
      if (!motion) continue;
      const sprite = sprites.popupText?.(popup.text, popup.kind);
      if (!sprite) continue;
      const baseline =
        popup.sy -
        POPUP_LIFT_PX -
        popupSlotOffsetPx(popup.slot) -
        motion.risePx;
      ctx!.globalAlpha = motion.alpha;
      ctx!.drawImage(
        sprite.image,
        snap(popup.sx - sprite.anchorX),
        snap(baseline - sprite.anchorY),
      );
      ctx!.globalAlpha = 1;
    }
  }

  function drawEntitySprite(entity: EntityView, now: number): void {
    const { sx, sy } = worldToScreen(standPoint(entity).x, standPoint(entity).y);
    const reacting = reactionPose(entity, now);
    const pose = {
      facing: entity.facing,
      moving: entity.queue.length > 0,
      timeMs: settings.get().reducedMotion ? 0 : now,
      attackElapsedMs: attackElapsed(entity, now),
      reaction: reacting,
      // A declared wind-up is a stance held for the whole turn: it
      // outranks the loops and loses to everything one-shot.
      charging: entity.charging === true,
      attackVariant: entity.attackVariant,
    };
    const sprite = sprites.entity(entity.spriteId, pose);
    // A body on the floor neither lunges nor shakes; it has stopped.
    const lunge = entity.alive ? lungeOffset(entity, now) : { x: 0, y: 0 };
    const flashElapsed = now - entity.flashStart;
    const shake =
      entity.alive && entity.flashStart > 0
        ? shakeOffsetPx(flashElapsed, FLASH_MS, SHAKE_PX)
        : 0;
    const drawX = snap(sx - sprite.anchorX + lunge.x + shake);
    const drawY = snap(sy - sprite.anchorY + lunge.y);
    // Reduced motion's whole death: the standing figure fades out.
    const fading =
      entity.fadeStart > 0
        ? 1 - dissolve01(now - entity.fadeStart, DEATH_FADE_MS)
        : 1;
    if (fading <= 0) return;
    if (fading < 1) ctx!.globalAlpha = fading;
    ctx!.drawImage(sprite.image, drawX, drawY);
    if (fading < 1) ctx!.globalAlpha = 1;
    if (entity.flashStart > 0) {
      if (flashElapsed >= 0 && flashElapsed < FLASH_MS) {
        const silhouette = sprites.entitySilhouette(entity.spriteId, pose);
        ctx!.globalAlpha = 0.85 * (1 - flashElapsed / FLASH_MS);
        ctx!.drawImage(silhouette.image, drawX, drawY);
        ctx!.globalAlpha = 1;
      } else if (flashElapsed >= FLASH_MS) {
        entity.flashStart = 0;
      }
    }
  }

  function drawHpBar(entity: EntityView): void {
    const { sx, sy } = worldToScreen(standPoint(entity).x, standPoint(entity).y);
    const width = 64;
    const height = 8;
    const x = Math.round(sx - width / 2);
    // Above the top of whatever it belongs to, never at a fixed height:
    // a bar drawn at a person's shoulder would be inside a chassis.
    const y = Math.round(
      sy - Math.max(104, spriteHeightPx(entity) + HP_BAR_CLEARANCE_PX),
    );
    const ratio = Math.max(0, Math.min(1, entity.hp / entity.maxHp));
    ctx!.fillStyle = "#05060c";
    ctx!.fillRect(x - 1, y - 1, width + 2, height + 2);
    ctx!.fillStyle = "#161a26";
    ctx!.fillRect(x, y, width, height);
    ctx!.fillStyle = ratio > 0.5 ? "#2ee6d6" : ratio > 0.25 ? "#f0b429" : "#ff4d5e";
    ctx!.fillRect(x + 1, y + 1, Math.round((width - 2) * ratio), height - 2);
  }

  function render(now: number): void {
    syncZoom();
    syncFeel();
    ctx!.clearRect(0, 0, viewportW / zoom, viewportH / zoom);
    ctx!.imageSmoothingEnabled = false;
    ctx!.save();
    // Where the camera has glided to, plus whatever is still shaking it.
    // Both ride the scene clock, so both hold through a hit-pause.
    if (glide) {
      camera = glideCameraAt(glide, now);
      if (glideDone(glide, now)) glide = null;
    }
    for (let i = shakes.length - 1; i >= 0; i--) {
      const shake = shakes[i];
      if (shake && shakeFinished(shake, now)) shakes.splice(i, 1);
    }
    const kick = feel.shake ? combinedShakeAt(shakes, now) : { x: 0, y: 0 };
    // Picking still reads the unshaken camera: a click lands where the
    // ground is, not where a blow just threw the view.
    const shown: Camera = { sx: camera.sx + kick.x, sy: camera.sy + kick.y };
    const { tx, ty } = cameraTranslation(shown, viewportW, viewportH, zoom, dpr);
    ctx!.translate(tx, ty);

    // Ground pass. Reduced motion freezes the ambient clock so neon
    // flicker, water shimmer, and the rain go still.
    const tileTime = settings.get().reducedMotion ? 0 : now;
    syncWeather();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tileId = map.tiles[y]?.[x];
        if (tileId === undefined) continue;
        const wet = weather?.puddles.has(tileKey(x, y)) === true;
        const sprite = sprites.tile(tileId, x, y, tileTime, wet);
        const { sx, sy } = worldToScreen(x, y);
        ctx!.drawImage(
          sprite.image,
          snap(sx - sprite.anchorX),
          snap(sy - sprite.anchorY),
        );
      }
    }
    if (weather) paintSplashes(ctx!, sprites, weather, tileTime, dpr * zoom);

    // Telegraphs sit on the ground under everything that stands on it.
    drawTelegraph();
    drawPathLine();
    if (highlights.hover) {
      drawDiamond(highlights.hover, null, "rgba(232, 230, 240, 0.6)");
    }
    for (const entity of entities.values()) {
      if (entity.alive && entity.active) {
        for (const tile of footprintTiles(entity)) {
          drawDiamond(tile, null, "rgba(46, 230, 214, 0.9)");
        }
      }
    }

    // Object pass: the standing and the fallen, depth sorted. A body
    // that has gone down draws on the ground layer — a heap is scenery
    // now, and whoever is still standing on its tile steps over it.
    const drawables: Array<Drawable & { entity: EntityView }> = [];
    for (const entity of entities.values()) {
      if (!entity.alive && !drawsDead(entity, now)) continue;
      const at = standPoint(entity);
      drawables.push({
        x: at.x,
        y: at.y,
        layer: entity.alive ? "object" : "ground",
        entity,
      });
    }
    drawables.sort(compareDrawables);
    for (const d of drawables) {
      drawEntitySprite(d.entity, now);
      if (d.entity.alive) {
        drawHpBar(d.entity);
        // A heap has no conditions: only the standing are marked.
        drawStatusMarkers(d.entity, now);
      }
    }

    // Combat effects over the fighters: a shot is in front of whoever
    // fired it, and the spark it strikes is in front of what it hit.
    drawImpacts(now);
    drawCasts(now);

    drawPopups(now);

    ctx!.restore();

    // Screen-space rain curtain, thinned for the arena so the grid,
    // the highlights, and the damage numbers stay readable through it.
    if (weather) {
      paintRainStreaks(
        ctx!,
        sprites,
        weather,
        tileTime,
        viewportW / zoom,
        viewportH / zoom,
        dpr * zoom,
      );
    }
  }

  let rafId = 0;
  let lastTime: number | null = null;
  function frame(time: number): void {
    // The whole frame runs on scene time: raw time with the pauses it
    // still owes taken out. During a freeze the clock holds, so dt is 0
    // and walks stop with everything else — one clock, no desync.
    const advanced = advancePauses(pauses, time);
    pauses = advanced.timeline;
    const sceneMs = advanced.sceneMs;
    const dt = lastTime === null ? 0 : Math.min((sceneMs - lastTime) / 1000, 0.1);
    lastTime = sceneMs;
    stepEntities(dt);
    render(sceneMs);
    rafId = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", resize);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  const unobserveDpr = observeDevicePixelRatio(resize);
  rafId = requestAnimationFrame(frame);

  return {
    setEntities(next: readonly CombatSceneEntity[]): void {
      const seen = new Set<string>();
      for (const incoming of next) {
        seen.add(incoming.id);
        const existing = entities.get(incoming.id);
        if (!existing) {
          const view: EntityView = {
            ...incoming,
            visual: { ...incoming.position },
            queue: [],
            progress: 0,
            facing: incoming.spriteId === "player" ? "e" : "s",
            lungeDir: null,
            attack: null,
            attackStart: 0,
            attackVariant: 0,
            flashStart: 0,
            awayX: 1,
            fadeStart: 0,
          };
          entities.set(incoming.id, view);
          // Already down when the scene first saw it (a fight re-entered
          // mid-battle): skip the fall and lay the heap out directly.
          if (!incoming.alive && !settings.get().reducedMotion) {
            const at = now();
            const style = view.deathStyle ?? DEFAULT_DEATH_STYLE;
            queueReaction(view, style, at, {
              beatMs: at - reactionDurationMs(style),
            });
          }
          continue;
        }
        const moved = !sameTile(existing.position, incoming.position);
        const justDied = existing.alive && !incoming.alive;
        Object.assign(existing, incoming);
        if (justDied) {
          existing.queue = [];
          existing.visual = { ...incoming.position };
          killEntity(existing, now());
        }
        if (moved && incoming.alive) {
          const fromTile = {
            x: Math.round(existing.visual.x),
            y: Math.round(existing.visual.y),
          };
          existing.queue = stepQueue(fromTile, incoming.position);
          existing.progress = 0;
        }
      }
      for (const id of entities.keys()) {
        if (seen.has(id)) continue;
        entities.delete(id);
        // Nothing left to react: drop its queue entries, heap included.
        reactions = reactions.filter((r) => r.entityId !== id);
      }
    },

    setHighlights(next: Partial<CombatHighlights>): void {
      highlights = { ...highlights, ...next };
    },

    attackFx(
      attackerId: string,
      targetId: string,
      options: AttackFxOptions = {},
    ): number {
      const attacker = entities.get(attackerId);
      const target = entities.get(targetId);
      if (!attacker || !target) return 0;
      // The attacker always turns to face what it is swinging at, even
      // when every other part of the sequence is switched off.
      faceToward(attacker, target);
      const hit = options.hit ?? true;
      const attackClass = classOf(attacker);
      const at = now();
      // Reduced motion: face the target and let the whole exchange
      // resolve on the spot — no swing, no travel, no delayed beats.
      // One held impact frame stays, so a hit is still visibly a hit.
      if (settings.get().reducedMotion) {
        spawnImpact(attacker, target, attackClass, hit, at, true);
        return 0;
      }
      throwAt(attacker, target, attackClass, at);
      // The blow lands when its effects say it does: for a fired round
      // that is the swing's own impact beat plus the flight time.
      return spawnImpact(attacker, target, attackClass, hit, at, false)
        .contactMs;
    },

    abilityFx(
      casterId: string,
      targetIds: readonly string[],
      fx: AbilityFxId,
    ): number {
      const caster = entities.get(casterId);
      if (!caster) return 0;
      const targets = targetIds
        .map((id) => entities.get(id))
        .filter((entity): entity is EntityView => entity !== undefined);
      if (targets.length === 0) return 0;
      const at = now();
      const reducedMotion = settings.get().reducedMotion;
      const attackClass = classOf(caster);
      // A cast thrown at somebody turns the caster toward them and runs
      // its weapon's swing; an aura is the caster lighting up where it
      // stands, so neither happens. Reduced motion keeps the turn and
      // drops the swing, exactly as a plain attack does.
      //
      // A cast aimed at the caster itself still swings when it is the
      // thrown kind: that is a wind-up loosed into empty ground (see
      // charge-released in ../ui/combatScreen.ts). Facing a body that is
      // yourself is a zero delta, which changes nothing.
      const thrown = castsWithWeapon(fx);
      const first = targets[0];
      if (thrown && first) {
        faceToward(caster, first);
        if (!reducedMotion) throwAt(caster, first, attackClass, at);
      }
      const plan = planAbilityCast(
        fx,
        targets.map((entity) => ({
          entityId: entity.id,
          order: entity.order ?? 0,
        })),
        {
          castMs: abilityCastMs(fx, attackClass),
          reducedMotion,
        },
      );
      // Resolved once, here: the plan's order is the order the points
      // are in, so nothing has to be looked up again while it plays.
      const byId = new Map(targets.map((entity) => [entity.id, entity]));
      casts.push({
        fx,
        plan,
        startMs: at,
        from: muzzlePoint(caster),
        points: plan.plays.map((play) => {
          const entity = byId.get(play.entityId) ?? caster;
          return chestPoint(entity);
        }),
      });
      // A blast going off pushes the view outward from the caster's own
      // line as it lands. Nothing connected, so nothing freezes — the
      // shake is the whole of it (see IMPACT_FEEL.explosion).
      if (!reducedMotion && ABILITY_FX[fx].form === "burst") {
        feelImpact(
          "explosion",
          false,
          at + plan.sequence.contactMs,
          lineBetween(caster, first ?? caster),
        );
      }
      return plan.sequence.contactMs;
    },

    hitFx(targetId: string, options: HitFxOptions = {}): void {
      const entity = entities.get(targetId);
      if (!entity) return;
      // Reduced motion: no flash, no shake, no recoil — floating
      // numbers and the combat log still report every hit.
      if (settings.get().reducedMotion) return;
      const at = now();
      const beatMs = at + Math.max(0, options.delayMs ?? 0);
      entity.awayX = awayFrom(entity, options.attackerId);
      const scheduled = queueReaction(
        entity,
        options.glancing === true ? "shudder" : "flinch",
        at,
        { beatMs },
      );
      // The flash lights on the frame the recoil starts on, however far
      // down the queue that turned out to be.
      entity.flashStart = scheduled.startMs;
      // The camera answers the blow on the beat it lands on — the same
      // beat the flinch and the figure ride, never the beat it was
      // thrown on. A blow with nobody behind it counts as thrown by
      // hand: there is no muzzle to have fired it from.
      const attacker = options.attackerId
        ? entities.get(options.attackerId)
        : undefined;
      const melee = attacker
        ? ATTACK_FX_STYLE[classOf(attacker)] !== "tracer"
        : true;
      const weight: ImpactWeight =
        options.weight ?? (options.glancing === true ? "glancing" : "solid");
      feelImpact(weight, melee, beatMs, lineBetween(attacker, entity));
    },

    focusOn(entityId: string, options: { pace?: TurnPace } = {}): void {
      const entity = entities.get(entityId);
      if (!entity) return;
      syncFeel();
      if (!feel.focus) return;
      // Framed on the middle of whatever it stands on, so a chassis is
      // centred on its block rather than on one corner of it.
      const target = focusCamera(
        map,
        blockCenter(entity.position, entity.footprint),
        viewportW,
        viewportH,
        zoom,
      );
      // Planned from wherever the camera is *now*, mid-glide included,
      // so turns following one another read as one continuous move.
      const planned = planCameraGlide(
        camera,
        target,
        now(),
        options.pace ?? "player",
      );
      glide = planned;
      // Nothing worth animating (an arena that fits the viewport clamps
      // every target to one point): settle there and stay still.
      if (!planned) camera = target;
    },

    popup(request: CombatPopupRequest): void {
      const { sx, sy } = worldToScreen(request.tile.x, request.tile.y);
      const bornAt = performance.now() + Math.max(0, request.delayMs ?? 0);
      // Readouts already over this column take the rungs they took;
      // this one climbs to the lowest that is free — including over
      // ones still waiting on an impact beat of their own.
      const slot = nextPopupSlot(
        popups.filter((other) => other.sx === sx),
        bornAt,
      );
      popups.push({
        text: request.text,
        kind: request.kind,
        sx,
        sy,
        bornAt,
        slot,
      });
    },

    destroy(): void {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      unobserveDpr();
      ctx!.clearRect(0, 0, viewportW / zoom, viewportH / zoom);
    },
  };
}
