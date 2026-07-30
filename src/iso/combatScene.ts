/**
 * Combat arena scene: renders an arena map with combatant entities, HP
 * bars, tile highlights (reachable / targets / path preview), walk
 * tweens, and combat feedback — attack lunges, hit flash + shake, hit
 * reactions, deaths, and floating combat numbers. Presentation only —
 * the combat screen feeds it authoritative state and interprets clicks;
 * this layer never imports the combat engine. All effect timing math
 * comes from the pure helpers in ./animation, ./attack, and ./reaction.
 */
import { settings } from "../settings";
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
  statusMarkerFrame,
  statusMarkerOffsets,
  type StatusFamilyId,
} from "./status";
import { createPixelArtSprites } from "./art/provider";
import { clampCamera, mapPixelBounds, type Camera } from "./camera";
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
import { tileKey, resolveWeather, type WeatherView } from "./weather";
import { paintRainStreaks, paintSplashes } from "./weatherPaint";
import type { DayPhaseId, IsoMap, WeatherId } from "./tilemap";

/** Authoritative view of one combatant, pushed by the combat screen. */
export interface CombatSceneEntity {
  id: string;
  spriteId: EntitySpriteId;
  /** Logical tile; the scene walks the sprite toward it when it changes. */
  position: TilePoint;
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
}

export interface CombatHighlights {
  /** Tiles the active combatant may move to (soft fill). */
  reachable: readonly TilePoint[];
  /** Tiles under targetable combatants (hostile outline). */
  targets: readonly TilePoint[];
  /** Path preview for the hovered move (bright fill). */
  path: readonly TilePoint[];
  hover: TilePoint | null;
}

export interface CombatSceneOptions {
  map: IsoMap;
  onTileClick(tile: TilePoint): void;
  onTileHover(tile: TilePoint | null): void;
  sprites?: SpriteProvider;
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
  ): number;
  /**
   * Play a landed blow on its target: the white flash and shake over a
   * two-frame recoil away from the attacker (a shallower shudder when
   * armor ate most of it). Queued — reactions answering one beat play
   * in initiative order, and one body never plays two at once.
   */
  hitFx(targetId: string, options?: HitFxOptions): void;
  /** Floating rise-and-fade text over a tile (damage, MISS, heals). */
  floatText(
    tile: TilePoint,
    text: string,
    color?: string,
    delayMs?: number,
  ): void;
  destroy(): void;
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
const FLOAT_MS = 900;
const FLOAT_RISE_PX = 56;
/**
 * Screen pixels above a tile's center that a blow lands at: the chest
 * of a figure standing on it (the 32×48 frame's row 24, at ART_SCALE).
 * Effects happen at body height, not on the floor.
 */
const IMPACT_HEIGHT_PX = 40;

/**
 * Screen pixels above a tile's center that a status marker hangs at:
 * clear of the HP bar, so a condition never covers the health it
 * applies to.
 */
const STATUS_MARKER_HEIGHT_PX = 126;

/** Death for anything the caller did not describe: a body crumples. */
const DEFAULT_DEATH_STYLE: DeathReactionKind = "collapse";

interface EntityView extends CombatSceneEntity {
  /** Where the sprite is drawn right now (trails position while walking). */
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

interface FloatingText {
  text: string;
  color: string;
  sx: number;
  sy: number;
  bornAt: number;
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
  const floats: FloatingText[] = [];
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
    reachable: [],
    targets: [],
    path: [],
    hover: null,
  };

  let viewportW = 0;
  let viewportH = 0;
  let dpr = 1;
  // Fixed camera on the arena center; arenas are small enough to fit.
  let camera: Camera = {
    sx: (bounds.minX + bounds.maxX) / 2,
    sy: (bounds.minY + bounds.maxY) / 2,
  };

  function snap(value: number): number {
    return Math.round(value * dpr) / dpr;
  }

  function resize(): void {
    dpr = window.devicePixelRatio || 1;
    viewportW = canvas.clientWidth;
    viewportH = canvas.clientHeight;
    canvas.width = Math.round(viewportW * dpr);
    canvas.height = Math.round(viewportH * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera = clampCamera(camera, bounds, viewportW, viewportH);
  }

  function pickTile(event: PointerEvent): TilePoint {
    const rect = canvas.getBoundingClientRect();
    const cssX = event.clientX - rect.left;
    const cssY = event.clientY - rect.top;
    return screenToTile(
      cssX - viewportW / 2 + camera.sx,
      cssY - viewportH / 2 + camera.sy,
    );
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.button !== 0) return;
    options.onTileClick(pickTile(event));
  }

  function onPointerMove(event: PointerEvent): void {
    options.onTileHover(pickTile(event));
  }

  function onPointerLeave(): void {
    options.onTileHover(null);
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

  function drawDiamond(
    tile: TilePoint,
    fill: string | null,
    stroke: string | null,
  ): void {
    const { sx, sy } = worldToScreen(tile.x, tile.y);
    ctx!.beginPath();
    ctx!.moveTo(sx, sy - TILE_H / 2);
    ctx!.lineTo(sx + TILE_W / 2, sy);
    ctx!.lineTo(sx, sy + TILE_H / 2);
    ctx!.lineTo(sx - TILE_W / 2, sy);
    ctx!.closePath();
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

  /** Screen-x direction away from the attacker, for the recoil. */
  function awayFrom(entity: EntityView, attackerId?: string): -1 | 1 {
    const attacker = attackerId ? entities.get(attackerId) : undefined;
    if (!attacker) return entity.awayX;
    const from = worldToScreen(attacker.visual.x, attacker.visual.y);
    const to = worldToScreen(entity.visual.x, entity.visual.y);
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

  /** The chest of whoever stands here: the height effects happen at. */
  function chestPoint(at: WorldPoint): ScreenPoint {
    const ground = worldToScreen(at.x, at.y);
    return { sx: ground.sx, sy: ground.sy - IMPACT_HEIGHT_PX };
  }

  /** Where a blow leaves a combatant: its weapon's muzzle, or its chest. */
  function muzzlePoint(entity: EntityView): ScreenPoint {
    const stance = worldToScreen(entity.visual.x, entity.visual.y);
    const offset = sprites.muzzleOffset?.(entity.spriteId, entity.facing) ?? {
      x: 0,
      y: -IMPACT_HEIGHT_PX,
    };
    return { sx: stance.sx + offset.x, sy: stance.sy + offset.y };
  }

  /**
   * Turn a combatant toward another, and hand back the swing that goes
   * with it — the class's attack animation, started now, with the body's
   * weight thrown along the line between them.
   */
  function throwAt(
    attacker: EntityView,
    target: EntityView,
    attackClass: AttackClassId,
    now: number,
  ): void {
    const from = worldToScreen(attacker.visual.x, attacker.visual.y);
    const to = worldToScreen(target.visual.x, target.visual.y);
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
    const landing = hit
      ? target.visual
      : overshootPoint(attacker.visual, target.visual);
    const to = chestPoint(landing);
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
    const { sx, sy } = worldToScreen(entity.visual.x, entity.visual.y);
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
        snap(sy - STATUS_MARKER_HEIGHT_PX - sprite.anchorY),
      );
    });
  }

  function drawEntitySprite(entity: EntityView, now: number): void {
    const { sx, sy } = worldToScreen(entity.visual.x, entity.visual.y);
    const reacting = reactionPose(entity, now);
    const pose = {
      facing: entity.facing,
      moving: entity.queue.length > 0,
      timeMs: settings.get().reducedMotion ? 0 : now,
      attackElapsedMs: attackElapsed(entity, now),
      reaction: reacting,
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
    const { sx, sy } = worldToScreen(entity.visual.x, entity.visual.y);
    const width = 64;
    const height = 8;
    const x = Math.round(sx - width / 2);
    const y = Math.round(sy - 104);
    const ratio = Math.max(0, Math.min(1, entity.hp / entity.maxHp));
    ctx!.fillStyle = "#05060c";
    ctx!.fillRect(x - 1, y - 1, width + 2, height + 2);
    ctx!.fillStyle = "#161a26";
    ctx!.fillRect(x, y, width, height);
    ctx!.fillStyle = ratio > 0.5 ? "#2ee6d6" : ratio > 0.25 ? "#f0b429" : "#ff4d5e";
    ctx!.fillRect(x + 1, y + 1, Math.round((width - 2) * ratio), height - 2);
  }

  function render(now: number): void {
    ctx!.clearRect(0, 0, viewportW, viewportH);
    ctx!.imageSmoothingEnabled = false;
    ctx!.save();
    ctx!.translate(snap(viewportW / 2 - camera.sx), snap(viewportH / 2 - camera.sy));

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
    if (weather) paintSplashes(ctx!, sprites, weather, tileTime, dpr);

    // Highlights sit on the ground under everything.
    for (const tile of highlights.reachable) {
      drawDiamond(tile, "rgba(46, 230, 214, 0.14)", "rgba(46, 230, 214, 0.35)");
    }
    for (const tile of highlights.path) {
      drawDiamond(tile, "rgba(46, 230, 214, 0.35)", null);
    }
    for (const tile of highlights.targets) {
      drawDiamond(tile, "rgba(230, 62, 143, 0.18)", "rgba(230, 62, 143, 0.9)");
    }
    if (highlights.hover) {
      drawDiamond(highlights.hover, null, "rgba(232, 230, 240, 0.6)");
    }
    for (const entity of entities.values()) {
      if (entity.alive && entity.active) {
        drawDiamond(entity.position, null, "rgba(46, 230, 214, 0.9)");
      }
    }

    // Object pass: the standing and the fallen, depth sorted. A body
    // that has gone down draws on the ground layer — a heap is scenery
    // now, and whoever is still standing on its tile steps over it.
    const drawables: Array<Drawable & { entity: EntityView }> = [];
    for (const entity of entities.values()) {
      if (!entity.alive && !drawsDead(entity, now)) continue;
      drawables.push({
        x: entity.visual.x,
        y: entity.visual.y,
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

    // Floating combat text, newest on top.
    for (let i = floats.length - 1; i >= 0; i--) {
      const float = floats[i];
      if (!float) continue;
      const age = now - float.bornAt;
      if (age > FLOAT_MS) {
        floats.splice(i, 1);
        continue;
      }
      // Numbers scheduled against a later impact beat wait their turn.
      if (age < 0) continue;
      const t = age / FLOAT_MS;
      const textY = Math.round(float.sy - 88 - t * FLOAT_RISE_PX);
      ctx!.globalAlpha = 1 - t * t;
      ctx!.font = "bold 18px 'Courier New', monospace";
      ctx!.textAlign = "center";
      ctx!.fillStyle = "#05060c";
      ctx!.fillText(float.text, float.sx + 1, textY + 1);
      ctx!.fillStyle = float.color;
      ctx!.fillText(float.text, float.sx, textY);
      ctx!.globalAlpha = 1;
    }

    ctx!.restore();

    // Screen-space rain curtain, thinned for the arena so the grid,
    // the highlights, and the damage numbers stay readable through it.
    if (weather) {
      paintRainStreaks(
        ctx!,
        sprites,
        weather,
        tileTime,
        viewportW,
        viewportH,
        dpr,
      );
    }
  }

  let rafId = 0;
  let lastTime: number | null = null;
  function frame(time: number): void {
    const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    stepEntities(dt);
    render(time);
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
            flashStart: 0,
            awayX: 1,
            fadeStart: 0,
          };
          entities.set(incoming.id, view);
          // Already down when the scene first saw it (a fight re-entered
          // mid-battle): skip the fall and lay the heap out directly.
          if (!incoming.alive && !settings.get().reducedMotion) {
            const now = performance.now();
            const style = view.deathStyle ?? DEFAULT_DEATH_STYLE;
            queueReaction(view, style, now, {
              beatMs: now - reactionDurationMs(style),
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
          killEntity(existing, performance.now());
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
      const attackClass: AttackClassId =
        sprites.attackClass?.(attacker.spriteId) ?? "unarmed";
      const now = performance.now();
      // Reduced motion: face the target and let the whole exchange
      // resolve on the spot — no swing, no travel, no delayed beats.
      // One held impact frame stays, so a hit is still visibly a hit.
      if (settings.get().reducedMotion) {
        spawnImpact(attacker, target, attackClass, hit, now, true);
        return 0;
      }
      throwAt(attacker, target, attackClass, now);
      // The blow lands when its effects say it does: for a fired round
      // that is the swing's own impact beat plus the flight time.
      return spawnImpact(attacker, target, attackClass, hit, now, false)
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
      const now = performance.now();
      const reducedMotion = settings.get().reducedMotion;
      const attackClass: AttackClassId =
        sprites.attackClass?.(caster.spriteId) ?? "unarmed";
      // A cast thrown at somebody turns the caster toward them and runs
      // its weapon's swing; an aura is the caster lighting up where it
      // stands, so neither happens. Reduced motion keeps the turn and
      // drops the swing, exactly as a plain attack does.
      const thrown = castsWithWeapon(fx);
      const first = targets[0];
      if (thrown && first && first !== caster) {
        faceToward(caster, first);
        if (!reducedMotion) throwAt(caster, first, attackClass, now);
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
        startMs: now,
        from: muzzlePoint(caster),
        points: plan.plays.map((play) => {
          const entity = byId.get(play.entityId) ?? caster;
          return chestPoint(entity.visual);
        }),
      });
      return plan.sequence.contactMs;
    },

    hitFx(targetId: string, options: HitFxOptions = {}): void {
      const entity = entities.get(targetId);
      if (!entity) return;
      // Reduced motion: no flash, no shake, no recoil — floating
      // numbers and the combat log still report every hit.
      if (settings.get().reducedMotion) return;
      const now = performance.now();
      entity.awayX = awayFrom(entity, options.attackerId);
      const scheduled = queueReaction(
        entity,
        options.glancing === true ? "shudder" : "flinch",
        now,
        { beatMs: now + Math.max(0, options.delayMs ?? 0) },
      );
      // The flash lights on the frame the recoil starts on, however far
      // down the queue that turned out to be.
      entity.flashStart = scheduled.startMs;
    },

    floatText(
      tile: TilePoint,
      text: string,
      color = "#e8e6f0",
      delayMs = 0,
    ): void {
      const { sx, sy } = worldToScreen(tile.x, tile.y);
      const bornAt = performance.now() + Math.max(0, delayMs);
      // Stack rapid numbers over the same column so none overlap —
      // including ones still waiting on an impact beat.
      const stacked = floats.filter(
        (f) => f.sx === sx && Math.abs(bornAt - f.bornAt) < FLOAT_MS,
      ).length;
      floats.push({ text, color, sx, sy: sy - stacked * 20, bornAt });
    },

    destroy(): void {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      unobserveDpr();
      ctx!.clearRect(0, 0, viewportW, viewportH);
    },
  };
}
