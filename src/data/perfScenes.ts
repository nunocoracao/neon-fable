/**
 * Scripted scenes for measuring frame cost — the repeatable worst case
 * a performance claim has to be made against.
 *
 * A scene here is content like any other: which district, what weather
 * to force on regardless of what it normally plays, what hour, and the
 * graphics settings the reading is taken under. The point is that two
 * people, or the same person a month apart, measure the same frame. A
 * number off "the hub, roughly, with rain on" is not a number.
 *
 * The camera is scripted for the same reason. A hitch that only shows
 * while the world is scrolling is exactly the hitch worth catching, so
 * the scene pans continuously on a fixed circuit at a fixed speed
 * rather than sitting still and flattering itself.
 */
import type { PixelBounds } from "../iso/camera";
import type { Camera } from "../iso/camera";
import type { DayPhaseId, WeatherId } from "../iso/tilemap";
import type { Settings, ZoomLevel } from "../settings/settings";
import { HUB_MAP_ID } from "./maps";

export type PerfSceneId = "worst-case";

export interface PerfScene {
  id: PerfSceneId;
  label: string;
  /** One line on what makes this the worst frame the game can make. */
  note: string;
  mapId: string;
  spawnId: string;
  /** Forced on whatever the district normally plays. */
  weather: WeatherId;
  dayPhase: DayPhaseId;
  /**
   * The zoom the scene is measured at. The widest level is the
   * expensive one: it fits the most map on screen, so it is the level
   * culling helps least and draw counts peak at.
   */
  zoom: ZoomLevel;
  /** World-screen pixels per second the scripted camera travels. */
  scrollPxPerS: number;
  /**
   * The rest of the graphics settings the measurement is taken under,
   * forced for the run and put back on the way out: every visual pass
   * on, and motion unreduced (reduced motion stills the crowd and the
   * set pieces, which is a different and much cheaper frame).
   */
  graphics: Readonly<Omit<Partial<Settings>, "zoom">>;
}

export const PERF_SCENES: readonly PerfScene[] = [
  {
    id: "worst-case",
    label: "Cinder Plaza, everything on",
    note:
      "The full plaza crowd walking, rain and its reflections, the " +
      "overline mid-crossing with every car lit, and the glow pass up — " +
      "framed at the widest zoom, which shows the most map and so costs " +
      "the most draws.",
    mapId: HUB_MAP_ID,
    spawnId: "player-start",
    weather: "rain",
    dayPhase: "night",
    zoom: 1,
    scrollPxPerS: 220,
    graphics: {
      glow: true,
      weather: true,
      setPieces: true,
      barks: true,
      minimap: true,
      motion: "full",
    },
  },
];

export function perfScene(id: PerfSceneId): PerfScene {
  const scene = PERF_SCENES.find((entry) => entry.id === id);
  if (!scene) throw new Error(`Unknown perf scene "${id}"`);
  return scene;
}

/**
 * The rectangle of camera points a map can actually be panned to: the
 * clamp's own answer, asked at both extremes. Degenerate on an axis the
 * map is smaller than the viewport, where the clamp centers instead —
 * and a circuit over a degenerate rectangle simply holds still, which
 * is the honest thing for a map with nowhere to scroll.
 */
export function panRect(
  clamp: (camera: Camera) => Camera,
  bounds: PixelBounds,
): { lo: Camera; hi: Camera } {
  const far = Math.max(1e6, Math.abs(bounds.maxX) + Math.abs(bounds.maxY) + 1e6);
  return {
    lo: clamp({ sx: -far, sy: -far }),
    hi: clamp({ sx: far, sy: far }),
  };
}

/**
 * Where the scripted camera sits `timeMs` into a run: a lap of the
 * pannable rectangle at a constant speed, anticlockwise from the
 * top-left corner. Constant speed and a closed loop are the two
 * properties that matter — the scroll never stops (a still camera
 * measures a different, easier frame) and never jumps (a teleport would
 * show up as a hitch that isn't one).
 */
export function scrollCircuit(
  lo: Camera,
  hi: Camera,
  timeMs: number,
  pxPerS: number,
): Camera {
  const width = Math.max(0, hi.sx - lo.sx);
  const height = Math.max(0, hi.sy - lo.sy);
  const perimeter = 2 * (width + height);
  if (perimeter <= 0 || pxPerS <= 0) return { sx: lo.sx, sy: lo.sy };
  const travelled = ((((pxPerS * timeMs) / 1000) % perimeter) + perimeter) % perimeter;
  if (travelled < width) {
    return { sx: lo.sx + travelled, sy: lo.sy };
  }
  if (travelled < width + height) {
    return { sx: hi.sx, sy: lo.sy + (travelled - width) };
  }
  if (travelled < 2 * width + height) {
    return { sx: hi.sx - (travelled - width - height), sy: hi.sy };
  }
  return { sx: lo.sx, sy: hi.sy - (travelled - 2 * width - height) };
}
