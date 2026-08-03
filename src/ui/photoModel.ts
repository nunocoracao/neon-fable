/**
 * Photo mode, as data.
 *
 * Everything photo mode *is* — where the camera is pointed, how deep it
 * is zoomed, which hour the shot is staged at, whether it rains, whether
 * anybody is in frame, and what the file is called — is a plain record
 * and a handful of pure functions over it. The overlay
 * (./photoOverlay.ts) renders it and pushes it at the scene; the scene
 * paints it and never remembers it.
 *
 * ## It owns nothing
 *
 * The one rule photo mode lives under is that it must leave no trace. A
 * screenshot is not a decision about the run: the hour it was staged at
 * is not the hour the story is at, the zoom it was framed at is not the
 * zoom the player walks around at, and turning the rain off for a clean
 * shot does not turn it off for the district.
 *
 * So a session carries two things: a `prior` record of exactly what
 * gameplay was showing when it opened, and a `framing` that starts as a
 * copy of it and is free to wander. `exitPhotoMode` hands `prior` back
 * untouched — it is never written to, by anything here — which is what
 * the enter/exit round-trip test pins. There is no persistence, no
 * settings write, and nothing on GameState: the deepest zoom level is
 * offered *because* it is not on the settings ladder, and could not be
 * left behind even by accident.
 *
 * ## Framing is clamped, not free
 *
 * Panning goes through the same `clampCamera` the drag-pan uses, against
 * the same map bounds, so a photo camera can no more leave the district
 * than a walking one can. Zooming re-clamps, because a deeper zoom spans
 * fewer world units and an edge that was legal at 1× may not be at 3×.
 */
import {
  DAY_PHASES,
  clampCamera,
  type Camera,
  type DayPhaseId,
  type PixelBounds,
} from "../iso";
import type { ZoomLevel } from "../settings";

/**
 * The zoom ladder photo mode offers: the three the game plays at, plus
 * one deeper level that exists only here. Every entry times ART_SCALE
 * (2) is a whole number of CSS pixels per art pixel, exactly as the
 * gameplay ladder requires — 3× is the first level past the game's own
 * that still satisfies it, which is why the photo-only step is 3 and not
 * 2.5. Pinned against ART_SCALE in photoModel.test.ts.
 */
export const PHOTO_ZOOM_LEVELS = [1, 1.5, 2, 3] as const;
export type PhotoZoom = (typeof PHOTO_ZOOM_LEVELS)[number];

/** How far one keyboard pan step moves the camera, in CSS pixels. */
export const PHOTO_PAN_STEP = 64;

/** What the supersampled capture multiplies the backing resolution by. */
export const PHOTO_SUPERSAMPLE = 2;

/** The prefix every capture is filed under. */
export const PHOTO_FILE_PREFIX = "neon-fable";

/**
 * What gameplay was showing when photo mode opened. Never written to
 * while it is open; handed straight back on the way out.
 */
export interface PhotoRestore {
  camera: Camera;
  zoom: ZoomLevel;
  /** The hour the scene was actually playing at (map or story beat). */
  dayPhase: DayPhaseId;
  /** Whether the district's weather was being painted. */
  weather: boolean;
}

/** How the shot is framed right now. */
export interface PhotoFraming {
  camera: Camera;
  zoom: PhotoZoom;
  dayPhase: DayPhaseId;
  weather: boolean;
  /** Leave every figure out — the environment on its own. */
  hideCharacters: boolean;
  /** Capture at double the canvas's backing resolution. */
  supersample: boolean;
}

export interface PhotoSession {
  /** Gameplay as it was; the thing exiting restores. */
  readonly prior: PhotoRestore;
  framing: PhotoFraming;
}

/** The viewport a framing is clamped against, in CSS pixels. */
export interface PhotoViewport {
  width: number;
  height: number;
  bounds: PixelBounds;
}

/**
 * Opens on exactly what the player was looking at: same camera, same
 * zoom, same hour, same weather. A photo mode that opened somewhere else
 * would make the player find their shot twice.
 */
export function enterPhotoMode(prior: PhotoRestore): PhotoSession {
  return {
    prior: {
      camera: { ...prior.camera },
      zoom: prior.zoom,
      dayPhase: prior.dayPhase,
      weather: prior.weather,
    },
    framing: {
      camera: { ...prior.camera },
      zoom: prior.zoom,
      dayPhase: prior.dayPhase,
      weather: prior.weather,
      hideCharacters: false,
      supersample: false,
    },
  };
}

/**
 * What gameplay goes back to: the record taken on the way in, whatever
 * the framing wandered off to. Nothing is merged and nothing is kept.
 */
export function exitPhotoMode(session: PhotoSession): PhotoRestore {
  return {
    camera: { ...session.prior.camera },
    zoom: session.prior.zoom,
    dayPhase: session.prior.dayPhase,
    weather: session.prior.weather,
  };
}

/** Clamps a camera into the map at a given zoom. */
function clampFor(
  camera: Camera,
  zoom: number,
  viewport: PhotoViewport,
): Camera {
  return clampCamera(
    camera,
    viewport.bounds,
    viewport.width / zoom,
    viewport.height / zoom,
  );
}

/**
 * Moves the camera by a viewport-space delta — a drag, or a key's worth
 * of pan. The delta is in CSS pixels and the camera lives in world
 * units, so it is divided by the zoom: a drag moves the ground under the
 * cursor by the same distance at every zoom level.
 */
export function panPhoto(
  framing: PhotoFraming,
  dx: number,
  dy: number,
  viewport: PhotoViewport,
): PhotoFraming {
  return {
    ...framing,
    camera: clampFor(
      {
        sx: framing.camera.sx + dx / framing.zoom,
        sy: framing.camera.sy + dy / framing.zoom,
      },
      framing.zoom,
      viewport,
    ),
  };
}

/** One step up (+1) or down (-1) the photo zoom ladder, ends included. */
export function stepPhotoZoom(current: PhotoZoom, direction: 1 | -1): PhotoZoom {
  const index = PHOTO_ZOOM_LEVELS.indexOf(current) + direction;
  const clamped = Math.min(PHOTO_ZOOM_LEVELS.length - 1, Math.max(0, index));
  return PHOTO_ZOOM_LEVELS[clamped] ?? current;
}

/**
 * Zooms about the screen center — the camera point stays put — and
 * re-clamps, because the viewport spans fewer world units the deeper it
 * goes and an edge framing legal at 1× may sit outside the map at 3×.
 */
export function zoomPhoto(
  framing: PhotoFraming,
  direction: 1 | -1,
  viewport: PhotoViewport,
): PhotoFraming {
  const zoom = stepPhotoZoom(framing.zoom, direction);
  return {
    ...framing,
    zoom,
    camera: clampFor(framing.camera, zoom, viewport),
  };
}

/** The next (or previous) hour to stage the shot at, wrapping round. */
export function cyclePhotoPhase(
  framing: PhotoFraming,
  direction: 1 | -1,
): PhotoFraming {
  const index = DAY_PHASES.indexOf(framing.dayPhase);
  const count = DAY_PHASES.length;
  const next = DAY_PHASES[(((index + direction) % count) + count) % count];
  return next ? { ...framing, dayPhase: next } : framing;
}

/** Rain on or off for the shot; the district's own weather is untouched. */
export function togglePhotoWeather(framing: PhotoFraming): PhotoFraming {
  return { ...framing, weather: !framing.weather };
}

/** Everybody out of frame, or back in. */
export function togglePhotoCharacters(framing: PhotoFraming): PhotoFraming {
  return { ...framing, hideCharacters: !framing.hideCharacters };
}

/** Capture at double resolution, or at the canvas's own. */
export function togglePhotoSupersample(framing: PhotoFraming): PhotoFraming {
  return { ...framing, supersample: !framing.supersample };
}

/** What a capture of this framing multiplies the backing store by. */
export function photoCaptureScale(framing: PhotoFraming): number {
  return framing.supersample ? PHOTO_SUPERSAMPLE : 1;
}

/**
 * A file name that says which district it is and nothing else.
 *
 * The number is a counter, not a clock: a wall-clock stamp would make
 * two runs of the same shot produce different names, which is exactly
 * the kind of thing that cannot be asserted. Map ids are already kebab
 * — the squeeze is here so a future id with a space or a slash in it
 * cannot produce a name the browser refuses to save.
 */
export function photoFilename(mapId: string, index: number): string {
  const slug =
    mapId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "map";
  return `${PHOTO_FILE_PREFIX}-${slug}-${index}.png`;
}

/** Hands out 1, 2, 3… for one session's captures. */
export interface ShotCounter {
  next(): number;
}

/** A fresh counter, handing out `start + 1` first. */
export function createShotCounter(start = 0): ShotCounter {
  let taken = start;
  return {
    next(): number {
      taken += 1;
      return taken;
    },
  };
}

/**
 * The counter this browser session numbers its captures from.
 *
 * One for the session rather than one per visit to photo mode, so a
 * player who frames three shots, walks on, and comes back gets a fourth
 * file rather than a second one the browser has to rename around. It is
 * the one piece of module state here, and it is deliberately not the
 * run's: closing the game forgets it, and no save carries it.
 */
export const sessionShots: ShotCounter = createShotCounter();
