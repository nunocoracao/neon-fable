/**
 * Set pieces — the large ambient machinery of a district: the elevated
 * train crossing the background, the drones quartering a market, the
 * steam a vent stack blows off. Where every one of them is this frame,
 * and whether it is there at all, is a pure function of (map, timeMs)
 * with no wall-clock reads, no state, and no canvas — exactly the shape
 * the weather module takes, and for the same reasons: a scene replays
 * identically and the whole thing is testable headless.
 *
 * Set pieces are scenery, deliberately and without exception:
 * - Nothing here is an interactable, so nothing here can be clicked,
 *   talked to, or fought. The scene's picking only ever consults map
 *   data, which is why this needs no opt-out.
 * - Nothing here touches walkability, pathfinding, or combat. A train
 *   passing over a row does not close it; a drone is not in anyone's
 *   way. The set-piece pass never writes to the map.
 * - Everything here is declared in map data (see SetPieceSpec) so a
 *   district's machinery is content, not engine.
 *
 * Depth is not special-cased either: each piece is emitted at a world
 * tile with a screen offset, and the scene folds them into the same
 * painter's-order object pass as props, interactables, and the crowd.
 * That is what puts the overline behind the tenements it passes — the
 * line's row simply sits behind theirs.
 */
import {
  facingFromDelta,
  frameAt,
  hash2,
  pulse01,
  smoothStep01,
  type Facing,
} from "./animation";
import type { GlowSource } from "./art/glow";
import { SETPIECE_ART } from "./art/setpieces";
import type { WorldPoint } from "./coords";
import { glowIntensityScale } from "./dayPhase";
import { glowPlacement, type GlowPlacement } from "./glowPass";
import type { SetPieceSpriteId } from "./sprites";
import {
  DEFAULT_DAY_PHASE,
  type DayPhaseId,
  type DronePath,
  type IsoMap,
  type TrainTrack,
  type VentBurstSpec,
} from "./tilemap";

/** Tiles of track one car occupies, so a rake of them butts up. */
export const TRAIN_CAR_SPAN = 2;

/** Bob envelope of a hovering drone, in 1x art pixels and ms. */
export const DRONE_BOB_PX = 3;
export const DRONE_BOB_PERIOD_MS = 2400;

/** Duration of one steam frame; a whole burst is five of them. */
export const STEAM_FRAME_MS = 130;

/**
 * How much likelier a vent is to blow off in the rain. Cold water on a
 * hot stack is the reason the sprawl steams at all, so a wet district
 * vents visibly harder than a dry one.
 */
export const VENT_RAIN_FACTOR = 1.9;

/**
 * One set-piece sprite to draw this frame: which art, which frame of
 * it, the world tile it sorts at, and how far off that tile's center it
 * is drawn (in 1x art pixels — elevation, hover, bob, all of it).
 */
export interface SetPieceDraw {
  spriteId: SetPieceSpriteId;
  frame: number;
  /** World tile position; fractional between tiles. */
  x: number;
  y: number;
  /** Screen offset from the tile center, in 1x art pixels. */
  offsetX: number;
  offsetY: number;
  /** Emissive light this piece casts, relative to its own anchor. */
  glow?: readonly GlowSource[];
}

export interface SetPieceOptions {
  /**
   * False for reduced motion. The train and the steam bursts are then
   * withheld outright — a set piece frozen mid-flight forever reads as
   * a bug rather than as stillness — while the drones simply hold
   * whatever pose the (already frozen) clock puts them in, the way a
   * parked machine would.
   */
  motion?: boolean;
  /** Rain raises the vent schedule; see VENT_RAIN_FACTOR. */
  rain?: boolean;
}

// --- The overline ------------------------------------------------------

/** A train out on its line right now. */
export interface TrainRun {
  /** Eased 0..1 across the declared span. */
  progress: number;
  /** World x of the lead car this instant. */
  headX: number;
  /** Travel direction along the row: +1 east, -1 west. */
  direction: 1 | -1;
}

/**
 * The train on a track this instant, or null between crossings — which
 * is most of the time, and the point: a line you notice is a line that
 * is not always there. The crossing is eased at both ends (see
 * smoothStep01), so the rake gathers through the middle of its span and
 * settles as it leaves, rather than sliding past at one flat rate.
 */
export function trainRunAt(track: TrainTrack, timeMs: number): TrainRun | null {
  const period = Math.max(1, track.periodMs);
  const cross = Math.min(Math.max(0, track.crossMs), period);
  if (cross <= 0) return null;
  const t = Math.max(0, timeMs) + (track.offsetMs ?? 0);
  const phase = ((t % period) + period) % period;
  if (phase >= cross) return null;
  const progress = smoothStep01(phase / cross);
  return {
    progress,
    headX: track.fromX + (track.toX - track.fromX) * progress,
    direction: track.toX >= track.fromX ? 1 : -1,
  };
}

/**
 * The rake as drawables: the lead car at the head, the rest trailing it
 * a car-length apart back down the line. Each car is emitted at its own
 * world x, so the rake depth-sorts against itself as well as against
 * the map — the car in front overlaps the one behind it for free.
 */
export function trainDraws(track: TrainTrack, timeMs: number): SetPieceDraw[] {
  const run = trainRunAt(track, timeMs);
  if (!run) return [];
  const cars = Math.max(0, Math.floor(track.cars));
  const draws: SetPieceDraw[] = [];
  for (let i = 0; i <= cars; i++) {
    const spriteId: SetPieceSpriteId = i === 0 ? "train-head" : "train-car";
    const art = SETPIECE_ART[spriteId];
    // Each car runs its window loop on its own phase, so a rake never
    // blinks in unison.
    const frame = frameAt(timeMs + i * 137, art.frameMs, art.frames.length);
    draws.push({
      spriteId,
      frame,
      x: run.headX - run.direction * i * TRAIN_CAR_SPAN,
      y: track.row,
      offsetX: 0,
      offsetY: -track.heightPx,
      glow: art.glow,
    });
  }
  return draws;
}

// --- Patrol drones -----------------------------------------------------

/** Where a drone is on its beat, and how it is riding. */
export interface DroneState {
  position: WorldPoint;
  facing: Facing;
  /** Vertical bob about the hover height, in 1x art pixels (up = -). */
  bobPx: number;
}

/** Total length of a closed waypoint loop, in tiles. */
export function dronePathLength(path: DronePath): number {
  const points = path.waypoints;
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const from = points[i];
    const to = points[(i + 1) % points.length];
    if (!from || !to) continue;
    total += Math.hypot(to.x - from.x, to.y - from.y);
  }
  return total;
}

/**
 * The drone's place on its loop at this instant: distance travelled
 * wrapped round the circuit, then walked leg by leg. Null for a path
 * that is not a loop (fewer than two waypoints, or every waypoint on
 * the same tile) — bad content draws nothing rather than dividing by
 * zero.
 */
export function droneStateAt(path: DronePath, timeMs: number): DroneState | null {
  const points = path.waypoints;
  const total = dronePathLength(path);
  if (points.length < 2 || total <= 0) return null;

  const elapsed = Math.max(0, timeMs) + (path.offsetMs ?? 0);
  const travelled = ((((elapsed / 1000) * path.speed) % total) + total) % total;

  let remaining = travelled;
  for (let i = 0; i < points.length; i++) {
    const from = points[i];
    const to = points[(i + 1) % points.length];
    if (!from || !to) continue;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length <= 0) continue;
    if (remaining > length) {
      remaining -= length;
      continue;
    }
    const k = remaining / length;
    return {
      position: {
        x: from.x + (to.x - from.x) * k,
        y: from.y + (to.y - from.y) * k,
      },
      facing: facingFromDelta(to.x - from.x, to.y - from.y) ?? "s",
      // Phase off the path id so two drones never bob together.
      bobPx: droneBobPx(path, elapsed),
    };
  }
  return null;
}

/** The hover bob: a slow symmetric rise and fall about the cruise height. */
export function droneBobPx(path: DronePath, timeMs: number): number {
  const phase = hash2(path.waypoints.length, path.id.length) % DRONE_BOB_PERIOD_MS;
  return (
    DRONE_BOB_PX * (2 * pulse01(Math.max(0, timeMs) + phase, DRONE_BOB_PERIOD_MS) - 1)
  );
}

/** The drone on a path as a drawable, or nothing for an unflyable path. */
export function droneDraws(path: DronePath, timeMs: number): SetPieceDraw[] {
  const state = droneStateAt(path, timeMs);
  if (!state) return [];
  const art = SETPIECE_ART["patrol-drone"];
  return [
    {
      spriteId: "patrol-drone",
      frame: frameAt(
        Math.max(0, timeMs) + (path.offsetMs ?? 0),
        art.frameMs,
        art.frames.length,
      ),
      x: state.position.x,
      y: state.position.y,
      offsetX: 0,
      offsetY: -path.heightPx + state.bobPx,
      glow: art.glow,
    },
  ];
}

// --- Vented steam ------------------------------------------------------

/** Where a burst sits relative to the vent's anchor, in 1x art pixels. */
export const STEAM_MOUTH_OFFSET_Y = -34;

/**
 * The steam frame a vent is showing right now, or null for a vent that
 * is quiet. Each stack gets its own scheduling window (phase-shifted by
 * position, so a street never vents in unison) and only some windows
 * fire — the same shape the rain's splash schedule takes, because it is
 * the same problem: occasional, seeded, and never twice the same across
 * a map.
 */
export function ventBurstFrameAt(
  x: number,
  y: number,
  timeMs: number,
  spec: VentBurstSpec,
  frameCount: number,
  rain = false,
): number | null {
  if (frameCount <= 0 || spec.periodMs <= 0) return null;
  const period = spec.periodMs;
  const phase = hash2(x + 61, y + 29) % period;
  const t = Math.max(0, timeMs) + phase;
  const window = Math.floor(t / period);
  const chance = Math.min(1, Math.max(0, spec.chance) * (rain ? VENT_RAIN_FACTOR : 1));
  if ((hash2(window, hash2(x, y)) % 1000) / 1000 >= chance) return null;
  const frame = Math.floor((t - window * period) / STEAM_FRAME_MS);
  return frame < frameCount ? frame : null;
}

/** Every vent stack on the map blowing off right now. */
export function ventDraws(
  map: IsoMap,
  spec: VentBurstSpec,
  timeMs: number,
  rain = false,
): SetPieceDraw[] {
  const art = SETPIECE_ART["steam-burst"];
  const draws: SetPieceDraw[] = [];
  for (const prop of map.props) {
    if (prop.propId !== "vent-stack") continue;
    const frame = ventBurstFrameAt(
      prop.x,
      prop.y,
      timeMs,
      spec,
      art.frames.length,
      rain,
    );
    if (frame === null) continue;
    draws.push({
      spriteId: "steam-burst",
      frame,
      x: prop.x,
      y: prop.y,
      offsetX: 0,
      offsetY: STEAM_MOUTH_OFFSET_Y,
    });
  }
  return draws;
}

// --- The pass ----------------------------------------------------------

/**
 * Everything a map's set pieces put on screen this frame. Returns an
 * empty list for a map that declares none, so the scene only ever has
 * to fold the result into its drawables.
 */
export function collectSetPieces(
  map: IsoMap,
  timeMs: number,
  options: SetPieceOptions = {},
): SetPieceDraw[] {
  const spec = map.setPieces;
  if (!spec) return [];
  const motion = options.motion !== false;
  const draws: SetPieceDraw[] = [];
  if (motion) {
    for (const track of spec.trains ?? []) draws.push(...trainDraws(track, timeMs));
  }
  for (const path of spec.drones ?? []) draws.push(...droneDraws(path, timeMs));
  if (motion && spec.vents) {
    draws.push(...ventDraws(map, spec.vents, timeMs, options.rain === true));
  }
  return draws;
}

/**
 * The emissive light the set pieces cast this frame — a headlamp, the
 * spill off a lit window band, a drone's scan cone. Placed through the
 * same helper the map's own glows go through, with the piece's own
 * elevation folded into the offset, so a light thrown from 40 pixels up
 * lands 40 pixels up.
 *
 * Deliberately not reflected in water: these lights are moving, and a
 * reflection that swept a canal every time a train went by would cost
 * the reflection pass a great deal to say very little.
 */
export function setPieceGlows(
  pieces: readonly SetPieceDraw[],
  phase: DayPhaseId = DEFAULT_DAY_PHASE,
): GlowPlacement[] {
  const intensity = glowIntensityScale(phase);
  const placements: GlowPlacement[] = [];
  for (const piece of pieces) {
    for (const source of piece.glow ?? []) {
      placements.push(
        glowPlacement(source, piece.x, piece.y, intensity, piece.offsetX, piece.offsetY),
      );
    }
  }
  return placements;
}
