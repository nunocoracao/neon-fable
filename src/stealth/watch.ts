/**
 * The watch: every guard a zone still has standing, where they are on
 * this tick, and exactly which tiles they hold.
 *
 * This is the join between the content (src/data/stealth.ts), the
 * geometry (./vision.ts), the beat (./patrol.ts) and the fight the zone
 * is an alternative to — which is why the *face* a patrolling guard
 * wears is asked of the encounter here rather than authored on the
 * zone: the body on the walkway has to be the body the fight opens
 * with, and spawnLookIndex is the one place that decides which.
 */
import { requireEncounter, spawnLookIndex } from "../data/encounters";
import { enemySpriteId } from "../data/enemies";
import {
  takedownFlag,
  type StealthGuard,
  type StealthZone,
} from "../data/stealth";
import type { Facing } from "../iso/animation";
import type { TilePoint } from "../iso/coords";
import type { IsoMap } from "../iso/tilemap";
import type { FlagMap } from "../state/flags";
import { patrolPointAt, patrolStepAt } from "./patrol";
import { earshotTiles, visionTiles } from "./vision";

/** One guard as the scene and the rules both see them this frame. */
export interface GuardView {
  guardId: string;
  name: string;
  /** Entity sprite id — the archetype and the look their slot wears. */
  spriteId: string;
  /** The tile the rules use: the one they are stood on this tick. */
  tile: TilePoint;
  /** Fractional position for drawing them mid-step. */
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  /** Tiles held by the cone, walls already taken out of it. */
  seen: TilePoint[];
  /** Tiles ordinary footsteps carry to. */
  heard: TilePoint[];
  /** Whether a hand over the mouth works on this one. */
  takeable: boolean;
}

/** Which face this guard's encounter slot wears; never authored twice. */
export function guardSpriteId(zone: StealthZone, guard: StealthGuard): string {
  const encounter = requireEncounter(zone.encounterId);
  const spawn = encounter.enemies[guard.spawnSlot];
  if (!spawn) return enemySpriteId(guard.enemyId);
  return enemySpriteId(
    spawn.enemyId,
    spawnLookIndex(zone.encounterId, guard.spawnSlot, spawn),
  );
}

/**
 * Who is actually on the beat: everybody the run has not stood down,
 * and nobody whose absence flag the run has already written. The two
 * are separate on purpose — a takedown is this zone's own record, an
 * absence flag is work some other system did (a Breach run at a muster
 * relay), and either one keeps a body off the walkway.
 */
export function liveGuards(
  zone: StealthZone,
  flags: FlagMap,
): StealthGuard[] {
  return zone.guards.filter((guard) => {
    if (flags[takedownFlag(zone.id, guard.id)] === true) return false;
    return guard.absentWhenFlag === undefined || flags[guard.absentWhenFlag] !== true;
  });
}

/**
 * The whole watch at a (possibly fractional) tick. Cones are derived
 * from the whole tick — a guard's eyes are where their feet were when
 * the tick turned — while the drawn position runs on the fraction, so
 * the rules never disagree with themselves mid-step.
 */
export function guardViews(
  map: IsoMap,
  zone: StealthZone,
  tick: number,
  flags: FlagMap,
): GuardView[] {
  return liveGuards(zone, flags).map((guard) => {
    const step = patrolStepAt(guard.route, tick);
    const point = patrolPointAt(guard.route, tick);
    const tile = { x: step.x, y: step.y };
    return {
      guardId: guard.id,
      name: guard.name,
      spriteId: guardSpriteId(zone, guard),
      tile,
      x: point.x,
      y: point.y,
      facing: point.facing,
      moving: point.moving,
      seen: visionTiles(map, tile, step.facing, guard.vision),
      heard: earshotTiles(tile),
      takeable: guard.takedown !== false,
    };
  });
}

const covers = (tiles: readonly TilePoint[], tile: TilePoint): boolean =>
  tiles.some((t) => t.x === tile.x && t.y === tile.y);

/** The first guard whose cone holds this tile, in authored order. */
export function seenBy(
  views: readonly GuardView[],
  tile: TilePoint,
): GuardView | null {
  return views.find((view) => covers(view.seen, tile)) ?? null;
}

/** The first guard close enough to hear a footstep on this tile. */
export function heardBy(
  views: readonly GuardView[],
  tile: TilePoint,
): GuardView | null {
  return views.find((view) => covers(view.heard, tile)) ?? null;
}

/** Every tile any live cone holds, deduplicated. */
export function watchedTiles(views: readonly GuardView[]): TilePoint[] {
  const byKey = new Map<string, TilePoint>();
  for (const view of views) {
    for (const tile of view.seen) byKey.set(`${tile.x},${tile.y}`, tile);
  }
  return [...byKey.values()];
}

/**
 * Every tile within earshot of a live guard that is not already inside
 * a cone. Kept separate from the cones so the two tint differently: one
 * is ground you cannot be standing on, the other is ground you cannot
 * be standing on *loudly*.
 */
export function earshotOnlyTiles(views: readonly GuardView[]): TilePoint[] {
  const seen = new Set(watchedTiles(views).map((t) => `${t.x},${t.y}`));
  const byKey = new Map<string, TilePoint>();
  for (const view of views) {
    for (const tile of view.heard) {
      const key = `${tile.x},${tile.y}`;
      if (seen.has(key)) continue;
      byKey.set(key, tile);
    }
  }
  return [...byKey.values()];
}
