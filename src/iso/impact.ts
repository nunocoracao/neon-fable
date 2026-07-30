/**
 * What happens between the swing and the flinch: the muzzle flash a gun
 * throws, the tracer that crosses the ground between two combatants, the
 * smear a blade leaves, and the spark or the puff of wall dust the blow
 * ends in.
 *
 * ## Three styles, one shape
 *
 * Every attack class (see ./attack) resolves to one of three styles:
 *
 * - `tracer` — pistols and rifles. A muzzle flash on the impact beat,
 *   then a bright streak travelling the attacker→target line, then the
 *   impact where it arrives. The blow lands when the round does, not
 *   when the trigger is pulled.
 * - `swipe` — blades, batons, and the lash. No round to travel, so the
 *   launch beat carries an arc-swipe smear across the target instead,
 *   and contact is the same instant the weapon comes through.
 * - `flash` — bare hands. Nothing leaves the fist, so there is no launch
 *   effect at all; the compact impact flash *is* the whole show.
 *
 * ## Ordering
 *
 * The timeline is derived, never authored twice: the launch beat is the
 * attack set's own impact beat (attackImpactMs), the travel is the
 * distance divided by a fixed muzzle velocity, and contact is the two
 * added together. The combat scene hands that contact beat back to the
 * combat screen, which delays the hit reaction and the damage number by
 * it — which is what puts the whole sequence in order, every time:
 *
 *     attack animation → muzzle flash → tracer → impact → reaction
 *
 * ## Misses
 *
 * A miss is not a shot that vanishes: it travels a tile *past* the
 * target along the same line and puffs wall dust where it lands, so a
 * whiff reads as a whiff from across the arena rather than as a hit that
 * happened to do no damage.
 *
 * ## Reduced motion
 *
 * Everything with travel in it collapses: no flash, no streak, no
 * overshoot — a single impact frame held on the target long enough to
 * be seen. Hit feedback survives; motion does not.
 *
 * Everything here is pure over an attack class, a distance, and an
 * elapsed millisecond count — no wall clock, no art, no canvas. The art
 * module authors the frames to these counts and a test pins them
 * together, exactly as ./attack and ./reaction do.
 */
import { attackImpactMs, type AttackClassId } from "./attack";
import type { ScreenPoint, WorldPoint } from "./coords";

/** How a class delivers its blow; see the module comment. */
export type AttackFxStyle = "tracer" | "swipe" | "flash";

/** Which style each attack class fights in. */
export const ATTACK_FX_STYLE: Readonly<Record<AttackClassId, AttackFxStyle>> = {
  unarmed: "flash",
  blade: "swipe",
  baton: "swipe",
  // The lash throws no round, but it does come through the target — the
  // crack of the cable reads as the same arc a blade leaves.
  lash: "swipe",
  pistol: "tracer",
  rifle: "tracer",
};

/**
 * The effect sets, by what they are rather than which picture they are:
 * the flash at a muzzle, the round in the air, the arc of a blade, the
 * sparks off a hit, the dust off a miss, and a bare fist's flash.
 */
export type EffectKind =
  | "muzzle"
  | "tracer"
  | "swipe"
  | "spark"
  | "chip"
  | "flash";

/** Per-effect frame counts and holds; the art is authored to these. */
export const EFFECT_TIMING: Readonly<
  Record<EffectKind, { readonly frameMs: number; readonly frameCount: number }>
> = {
  // Fire and gone: two frames inside a tenth of a second.
  muzzle: { frameMs: 40, frameCount: 2 },
  // The round in flight is one picture, positioned by travel math.
  tracer: { frameMs: 0, frameCount: 1 },
  // The arc, then its trailing follow-through.
  swipe: { frameMs: 45, frameCount: 2 },
  // Burst, spread, cool.
  spark: { frameMs: 55, frameCount: 3 },
  // Spall, dust, drift.
  chip: { frameMs: 55, frameCount: 3 },
  // A fist's flash: the strike, then the ring off it.
  flash: { frameMs: 50, frameCount: 2 },
};

/**
 * Muzzle velocity in screen pixels per millisecond. A tile is TILE_W
 * (128px) across, so a round crosses one tile of ground in 80ms — fast
 * enough to read as fired rather than thrown, slow enough that the eye
 * catches the streak between the gun and what it hit.
 */
export const TRACER_SPEED_PX_PER_MS = 1.6;

/** Floor and ceiling on the flight, so neither extreme reads as broken. */
export const TRACER_MIN_MS = 40;
export const TRACER_MAX_MS = 220;

/**
 * Reduced motion's whole impact: one frame, held. Long enough to be
 * seen without anything moving to draw the eye to it.
 */
export const REDUCED_IMPACT_MS = 200;

/** How far past the target a miss carries, in tiles. */
export const MISS_OVERSHOOT_TILES = 1;

/** Ms a round takes to cross `distancePx` of screen, clamped. */
export function tracerTravelMs(distancePx: number): number {
  const raw = Math.max(0, distancePx) / TRACER_SPEED_PX_PER_MS;
  return Math.round(Math.min(TRACER_MAX_MS, Math.max(TRACER_MIN_MS, raw)));
}

/** One effect set placed on the timeline, in ms from the attack's start. */
export interface EffectWindow {
  readonly kind: EffectKind;
  readonly startMs: number;
  readonly frameMs: number;
  readonly frameCount: number;
  /** Exclusive: nothing of this effect is drawn from here on. */
  readonly endMs: number;
}

/** The full timeline of one blow's effects. Derived, never authored. */
export interface ImpactSequence {
  readonly attackClass: AttackClassId;
  readonly style: AttackFxStyle;
  /** Ms from the attack's start to the shot (or the swing) leaving. */
  readonly launchMs: number;
  /** The muzzle flash or the blade's smear; null for bare hands. */
  readonly launch: EffectWindow | null;
  /** Ms the round is in the air; 0 for everything that is not fired. */
  readonly travelMs: number;
  /** Ms from the attack's start to the blow landing — the beat the hit
   * reaction and the damage number ride. */
  readonly contactMs: number;
  readonly impact: EffectWindow;
  /** Ms the whole sequence runs for, effects included. */
  readonly endMs: number;
}

export interface ImpactOptions {
  /** Screen pixels from the muzzle to where the blow lands. */
  readonly distancePx?: number;
  /** Whether it connects; a miss ends in wall dust, not sparks. */
  readonly hit?: boolean;
  /** Collapse everything with travel in it to one held frame. */
  readonly reducedMotion?: boolean;
}

/** Which effect a blow ends in: sparks off a body, dust off a wall. */
export function impactKind(style: AttackFxStyle, hit: boolean): EffectKind {
  if (!hit) return "chip";
  return style === "flash" ? "flash" : "spark";
}

/** Which effect a blow starts with, or null when nothing leaves the fist. */
export function launchKind(style: AttackFxStyle): EffectKind | null {
  if (style === "tracer") return "muzzle";
  return style === "swipe" ? "swipe" : null;
}

/** Place one effect set on the timeline at `startMs`. */
function placed(kind: EffectKind, startMs: number): EffectWindow {
  const { frameMs, frameCount } = EFFECT_TIMING[kind];
  return {
    kind,
    startMs,
    frameMs,
    frameCount,
    endMs: startMs + frameMs * frameCount,
  };
}

/** A single frame of an effect, held long enough to register. */
function held(kind: EffectKind, startMs: number): EffectWindow {
  return {
    kind,
    startMs,
    frameMs: REDUCED_IMPACT_MS,
    frameCount: 1,
    endMs: startMs + REDUCED_IMPACT_MS,
  };
}

/**
 * The timeline for one blow; pure, so callers may recompute it freely.
 * Under reduced motion the whole thing is a single impact frame at time
 * zero — the same instant everything else in that mode resolves on.
 */
export function impactSequence(
  attackClass: AttackClassId,
  options: ImpactOptions = {},
): ImpactSequence {
  const style = ATTACK_FX_STYLE[attackClass];
  const hit = options.hit ?? true;
  const impact = impactKind(style, hit);
  if (options.reducedMotion === true) {
    const only = held(impact, 0);
    return {
      attackClass,
      style,
      launchMs: 0,
      launch: null,
      travelMs: 0,
      contactMs: 0,
      impact: only,
      endMs: only.endMs,
    };
  }
  const launchMs = attackImpactMs(attackClass);
  const travelMs =
    style === "tracer" ? tracerTravelMs(options.distancePx ?? 0) : 0;
  const contactMs = launchMs + travelMs;
  const kind = launchKind(style);
  const launch = kind ? placed(kind, launchMs) : null;
  const landed = placed(impact, contactMs);
  return {
    attackClass,
    style,
    launchMs,
    launch,
    travelMs,
    contactMs,
    impact: landed,
    endMs: Math.max(landed.endMs, launch?.endMs ?? 0),
  };
}

/**
 * Which frame of an effect is showing `elapsedMs` into the attack, or
 * null before it starts and once it is over. Effects never persist —
 * unlike a death, a spark leaves nothing behind.
 */
export function effectFrameAt(
  effect: EffectWindow,
  elapsedMs: number,
): number | null {
  if (elapsedMs < effect.startMs || elapsedMs >= effect.endMs) return null;
  if (effect.frameMs <= 0) return 0;
  const frame = Math.floor((elapsedMs - effect.startMs) / effect.frameMs);
  return Math.min(frame, effect.frameCount - 1);
}

/**
 * How far along its flight the round is `elapsedMs` into the attack, or
 * null when it is not in the air (before the shot, after it arrived, or
 * for a class that fires nothing). 0 is the muzzle, 1 the target.
 */
export function tracerProgress(
  sequence: ImpactSequence,
  elapsedMs: number,
): number | null {
  if (sequence.travelMs <= 0) return null;
  const t = (elapsedMs - sequence.launchMs) / sequence.travelMs;
  return t >= 0 && t < 1 ? t : null;
}

/** Straight-line position along the shot; pure, so it never drifts. */
export function tracerPointAt(
  from: ScreenPoint,
  to: ScreenPoint,
  t: number,
): ScreenPoint {
  return {
    sx: from.sx + (to.sx - from.sx) * t,
    sy: from.sy + (to.sy - from.sy) * t,
  };
}

/**
 * Where a miss lands: `tiles` beyond the target along the attacker's
 * own line, in world coordinates, so the overshoot follows the iso grid
 * rather than the screen. An attacker standing on its target has no line
 * to carry past, so the blow simply lands where it was aimed.
 */
export function overshootPoint(
  from: WorldPoint,
  to: WorldPoint,
  tiles: number = MISS_OVERSHOOT_TILES,
): WorldPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: to.x, y: to.y };
  return { x: to.x + (dx / length) * tiles, y: to.y + (dy / length) * tiles };
}

/**
 * The eight directions a tracer is drawn in. The art carries three
 * slopes — flat, the iso grid's own 2:1 diagonal, and vertical — mirrored
 * and flipped into the eight; `n` is up the screen.
 */
export const TRACER_DIRECTIONS = [
  "e",
  "ne",
  "n",
  "nw",
  "w",
  "sw",
  "s",
  "se",
] as const;

export type TracerDirection = (typeof TRACER_DIRECTIONS)[number];

/**
 * Which of the authored slopes a shot travels along, from its screen
 * delta (+y is down). Anything shallower than a quarter slope reads as
 * flat, anything steeper than a full one as vertical, and the broad
 * middle — where the iso axes' own half slope lives — as the diagonal.
 */
export function tracerDirection(dx: number, dy: number): TracerDirection {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax === 0 && ay === 0) return "e";
  if (ay * 4 <= ax) return dx > 0 ? "e" : "w";
  if (ay <= ax) {
    if (dx > 0) return dy > 0 ? "se" : "ne";
    return dy > 0 ? "sw" : "nw";
  }
  return dy > 0 ? "s" : "n";
}

/**
 * Every baked effect picture, by id. Direction-bearing effects carry it
 * in the id (the tracer's eight slopes, the swipe's two hands), so one
 * flat registry covers the lot and every id is one cached bake.
 */
export const EFFECT_SPRITE_IDS = [
  "muzzle-flash",
  "spark-burst",
  "wall-chip",
  "impact-flash",
  "swipe-e",
  "swipe-w",
  "tracer-e",
  "tracer-ne",
  "tracer-n",
  "tracer-nw",
  "tracer-w",
  "tracer-sw",
  "tracer-s",
  "tracer-se",
] as const;

export type EffectSpriteId = (typeof EFFECT_SPRITE_IDS)[number];

const TRACER_SPRITES: Readonly<Record<TracerDirection, EffectSpriteId>> = {
  e: "tracer-e",
  ne: "tracer-ne",
  n: "tracer-n",
  nw: "tracer-nw",
  w: "tracer-w",
  sw: "tracer-sw",
  s: "tracer-s",
  se: "tracer-se",
};

/** The streak picture for a shot with this screen delta. */
export function tracerSpriteId(dx: number, dy: number): EffectSpriteId {
  return TRACER_SPRITES[tracerDirection(dx, dy)];
}

/** The arc picture for a swing thrown this way across the screen. */
export function swipeSpriteId(dx: number): EffectSpriteId {
  return dx < 0 ? "swipe-w" : "swipe-e";
}

/** The picture a direction-free effect draws. */
export function effectSpriteId(kind: EffectKind): EffectSpriteId {
  switch (kind) {
    case "muzzle":
      return "muzzle-flash";
    case "spark":
      return "spark-burst";
    case "chip":
      return "wall-chip";
    case "flash":
      return "impact-flash";
    // Both remaining kinds are drawn per direction; callers with a
    // delta use tracerSpriteId / swipeSpriteId. Rightward is the
    // authored hand, so it stands in when there is no delta to read.
    case "swipe":
      return "swipe-e";
    default:
      return "tracer-e";
  }
}

/** Which effect set an id belongs to — the inverse of the id scheme. */
export function effectKind(id: EffectSpriteId): EffectKind {
  if (id.startsWith("tracer-")) return "tracer";
  if (id.startsWith("swipe-")) return "swipe";
  if (id === "muzzle-flash") return "muzzle";
  if (id === "spark-burst") return "spark";
  return id === "wall-chip" ? "chip" : "flash";
}
