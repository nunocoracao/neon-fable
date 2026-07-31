/**
 * One visit to one zone: the tick clock, the crouch, the takedowns, the
 * dash across a pinch — and the two ways a crossing can end.
 *
 * The split is deliberate. What *persists* lives in the run's flags:
 * which guards have been stood down (which is what keeps them out of
 * the fight, see EncounterSpawn.absentWhenFlag) and how the zone
 * settled. What is only true while the player is stood on the map — the
 * clock, whether they are crouching, the grace a lunge bought — lives
 * here, in a plain object the shell holds and throws away on leaving.
 * Reloading a save therefore rebuilds a visit rather than resuming one,
 * and a patrol picks up wherever its own tick says it should.
 *
 * Everything is pure: state in, new state out, no clock read here.
 */
import {
  alertFlag,
  getStealthGuard,
  stealthZoneFlag,
  takedownAllowance,
  takedownFlag,
  STEALTH_TICK_MS,
  type PinchPoint,
  type StealthZone,
} from "../data/stealth";
import type { TilePoint } from "../iso/coords";
import type { IsoMap } from "../iso/tilemap";
import type { FlagMap } from "../state/flags";
import { detectAt, type Detection } from "./detect";
import { guardViews, type GuardView } from "./watch";

/** How a crossing is going, and how it ended. */
export type StealthStatus = "watching" | "passed" | "spotted";

export interface StealthRun {
  zoneId: string;
  /** Latest tick the watch has already been asked about. */
  checkedTick: number;
  crouched: boolean;
  /** Ticks of detection grace still owed by a lunge. */
  grace: number;
  status: StealthStatus;
}

/** A fresh visit, at the tick the scene's clock is already showing. */
export function startStealth(zone: StealthZone, tick = 0): StealthRun {
  return {
    zoneId: zone.id,
    checkedTick: Math.floor(tick),
    crouched: false,
    grace: 0,
    status: "watching",
  };
}

/** Whole ticks elapsed on a scene clock. */
export function tickAt(elapsedMs: number): number {
  return Math.floor(Math.max(0, elapsedMs) / STEALTH_TICK_MS);
}

/**
 * The same clock as a fraction of a tick — 3.5 is half way through the
 * fourth. What the scene draws a guard at: the rules only ever read the
 * whole part, so a patrol's *position* moves smoothly while what it can
 * see changes on the beat.
 */
export function tickFloat(elapsedMs: number): number {
  return Math.max(0, elapsedMs) / STEALTH_TICK_MS;
}

export function toggleCrouch(run: StealthRun): StealthRun {
  return { ...run, crouched: !run.crouched };
}

/** Takedowns this run has already spent in this zone, read off the flags. */
export function takedownsUsed(zone: StealthZone, flags: FlagMap): number {
  return zone.guards.filter(
    (guard) => flags[takedownFlag(zone.id, guard.id)] === true,
  ).length;
}

/** What one step of the watch produced, if anything. */
export type StealthEvent =
  | { kind: "spotted"; detection: Detection }
  | { kind: "passed" };

export interface StealthStepInput {
  /** Whole tick from the scene clock (see tickAt). */
  tick: number;
  playerTile: TilePoint;
  flags: FlagMap;
}

export interface StealthStepResult {
  run: StealthRun;
  /** The watch as it stands, for drawing and for the takedown prompt. */
  views: GuardView[];
  /** Fires exactly once, on the step it happened on. */
  event: StealthEvent | null;
}

/**
 * Advance a visit to a tick.
 *
 * Order matters and is the design: reaching the far side is checked
 * first, so a player who is already past cannot be caught by a cone
 * sweeping the tile they have just left; then detection, and only on a
 * tick the run has not already asked about. Frames between ticks change
 * nothing but where the guards are drawn — which is exactly why a
 * crossing can be timed.
 */
export function stepStealth(
  map: IsoMap,
  zone: StealthZone,
  run: StealthRun,
  input: StealthStepInput,
): StealthStepResult {
  const views = guardViews(map, zone, input.tick, input.flags);
  if (run.status !== "watching") return { run, views, event: null };

  if (onGoal(zone, input.playerTile)) {
    return {
      run: { ...run, status: "passed" },
      views,
      event: { kind: "passed" },
    };
  }

  const tick = Math.floor(input.tick);
  if (tick <= run.checkedTick) return { run, views, event: null };

  // A lunge buys one tick of not being asked; it is spent whether or
  // not anything was looking, so a dash is a decision and not a toggle.
  if (run.grace > 0) {
    return {
      run: { ...run, checkedTick: tick, grace: run.grace - 1 },
      views,
      event: null,
    };
  }

  const detection = detectAt(zone, views, input.playerTile, {
    crouched: run.crouched,
  });
  if (!detection) return { run: { ...run, checkedTick: tick }, views, event: null };
  return {
    run: { ...run, checkedTick: tick, status: "spotted" },
    views,
    event: { kind: "spotted", detection },
  };
}

/** True if the tile is one of the zone's far-side tiles. */
export function onGoal(zone: StealthZone, tile: TilePoint): boolean {
  return zone.goal.tiles.some((t) => t.x === tile.x && t.y === tile.y);
}

// --- Takedowns ------------------------------------------------------

/** Why a takedown is not on offer. Codes, never sentences. */
export type TakedownRefusal =
  | "over"
  | "no-target"
  | "immune"
  | "aware"
  | "spent";

export type TakedownOffer =
  | { ok: true; guard: GuardView }
  | { ok: false; reason: TakedownRefusal };

const adjacent = (a: TilePoint, b: TilePoint): boolean =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

/**
 * Whether the player can put a hand over somebody's mouth from where
 * they are stood, and if not, the first thing standing in the way.
 *
 * "Unaware" is asked of the guard's own cone rather than of a mood: if
 * the tile you are on is in front of them, they are looking at you, and
 * what happens next is a fight rather than a takedown.
 */
export function takedownOffer(
  zone: StealthZone,
  run: StealthRun,
  views: readonly GuardView[],
  playerTile: TilePoint,
  options: { flags: FlagMap; quiet: boolean },
): TakedownOffer {
  if (run.status !== "watching") return { ok: false, reason: "over" };
  const near = views.filter((view) => adjacent(view.tile, playerTile));
  if (near.length === 0) return { ok: false, reason: "no-target" };
  const takeable = near.filter((view) => view.takeable);
  if (takeable.length === 0) return { ok: false, reason: "immune" };
  const unaware = takeable.filter(
    (view) => !view.seen.some((t) => t.x === playerTile.x && t.y === playerTile.y),
  );
  const guard = unaware[0];
  if (!guard) return { ok: false, reason: "aware" };
  if (takedownsUsed(zone, options.flags) >= takedownAllowance(zone, options.quiet)) {
    return { ok: false, reason: "spent" };
  }
  return { ok: true, guard };
}

/**
 * The flags one takedown writes. Setting the guard's own flag is the
 * whole of it — the watch drops them (liveGuards) and so does the fight
 * (liveSpawns), from the same string, so the two can never disagree
 * about who is still standing.
 */
export function recordTakedown(
  flags: FlagMap,
  zone: StealthZone,
  guardId: string,
): FlagMap {
  if (!getStealthGuard(zone, guardId)) return flags;
  return { ...flags, [takedownFlag(zone.id, guardId)]: true };
}

// --- Pinch points ---------------------------------------------------

/** The dash offered from this tile, if the zone has one here. */
export function pinchAt(zone: StealthZone, tile: TilePoint): PinchPoint | null {
  return (
    zone.pinches?.find(
      (pinch) => pinch.from.x === tile.x && pinch.from.y === tile.y,
    ) ?? null
  );
}

export type LungeRefusal = "over" | "no-pinch" | "too-slow";

export type LungeOffer =
  | { ok: true; pinch: PinchPoint }
  | { ok: false; reason: LungeRefusal };

/** Whether the player is quick enough for the dash under their feet. */
export function lungeOffer(
  zone: StealthZone,
  run: StealthRun,
  playerTile: TilePoint,
  reflexes: number,
): LungeOffer {
  if (run.status !== "watching") return { ok: false, reason: "over" };
  const pinch = pinchAt(zone, playerTile);
  if (!pinch) return { ok: false, reason: "no-pinch" };
  if (reflexes < pinch.reflexes) return { ok: false, reason: "too-slow" };
  return { ok: true, pinch };
}

/** Ticks of detection grace one dash is worth. */
export const LUNGE_GRACE_TICKS = 1;

/**
 * Take the dash: the run owes one tick of not being looked at, and the
 * caller moves the player to the pinch's far tile.
 */
export function applyLunge(run: StealthRun): StealthRun {
  return { ...run, grace: LUNGE_GRACE_TICKS };
}

// --- Settling -------------------------------------------------------

/**
 * What the run records on getting past: the zone's own outcome, and
 * nothing else. Everything the *story* takes from a quiet crossing is
 * written by the node the shell opens (see StealthGoal.nodeId), which
 * is what keeps flag-writing in content where it belongs.
 */
export function recordPassed(flags: FlagMap, zone: StealthZone): FlagMap {
  return { ...flags, [stealthZoneFlag(zone.id)]: "passed" };
}

/**
 * What being seen records: the zone's outcome, and the alert the fight
 * reads at setup. The alert is a mechanical consequence of the watch
 * rather than a choice anybody made, which is why it is written here
 * and not in a story effect.
 */
export function recordSpotted(flags: FlagMap, zone: StealthZone): FlagMap {
  return {
    ...flags,
    [stealthZoneFlag(zone.id)]: "spotted",
    [alertFlag(zone.encounterId)]: true,
  };
}
