/**
 * The two pictures a save carries: the runner's face, and the corner of
 * the city they were standing in.
 *
 * Both are rendered from what is already on screen — the portrait
 * through the same compose-bake-cache path every other portrait takes,
 * the vignette by cropping the live iso canvas around the camera, which
 * follows the player — so neither costs a second renderer and neither
 * can disagree with the game.
 *
 * Everything here returns null rather than throwing. A canvas the
 * browser will not let us read back (a tainted context, a headless test,
 * a storage-shy device), a bake that fails, an image that encodes larger
 * than the cap: all of it means "this save has no thumbnail", which is a
 * state the screen already draws and the loader has never consulted.
 */
import type { GameState } from "../state";
import { sanitizeThumbnail, type SaveExtras } from "../state";
import { portraitCanvas } from "./portraits";

/** Size the scene vignette is stored at, in device-independent pixels. */
export const SCENE_THUMB = { width: 128, height: 72 } as const;

/**
 * Share of the canvas height the vignette crops. Small enough to be
 * "the tiles around the player" rather than the whole district, large
 * enough that a street reads as a street.
 */
const SCENE_CROP_SHARE = 0.5;

/** The runner's composed portrait as a data URL, or null. */
export function capturePortraitThumb(state: GameState): string | null {
  try {
    const canvas = portraitCanvas(
      state.player.appearance,
      state.player.equipment,
    );
    return sanitizeThumbnail(canvas.toDataURL("image/png"));
  } catch {
    // Silent on purpose: a device that will not hand back canvas bytes
    // is not a bug to report on every autosave, and the screen already
    // draws a save with no picture.
    return null;
  }
}

/**
 * A crop of the scene around the player as a data URL, or null. Takes
 * the canvas rather than finding it so a caller that knows there is no
 * scene on screen (an autosave fired on the way *into* a map, where the
 * canvas still holds the map being left) can simply not ask.
 */
export function captureSceneThumb(
  source: HTMLCanvasElement | null,
): string | null {
  if (!source || source.width < 1 || source.height < 1) return null;
  try {
    const aspect = SCENE_THUMB.width / SCENE_THUMB.height;
    const cropHeight = Math.max(
      1,
      Math.min(source.height, Math.round(source.height * SCENE_CROP_SHARE)),
    );
    const cropWidth = Math.max(
      1,
      Math.min(source.width, Math.round(cropHeight * aspect)),
    );
    const out = document.createElement("canvas");
    out.width = SCENE_THUMB.width;
    out.height = SCENE_THUMB.height;
    const context = out.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    context.drawImage(
      source,
      Math.round((source.width - cropWidth) / 2),
      Math.round((source.height - cropHeight) / 2),
      cropWidth,
      cropHeight,
      0,
      0,
      out.width,
      out.height,
    );
    return sanitizeThumbnail(out.toDataURL("image/png"));
  } catch {
    return null;
  }
}

/** The iso scene canvas, when this page has one mounted. */
export function sceneCanvas(): HTMLCanvasElement | null {
  const el = document.getElementById("iso-canvas");
  return el instanceof HTMLCanvasElement ? el : null;
}

/**
 * The metadata to write with a save. A label is never invented here —
 * saving over a slot clears whatever the old save was called, because a
 * name that outlives the run it described is a lie the player did not
 * tell.
 */
export function captureSaveExtras(
  state: GameState,
  scene: HTMLCanvasElement | null = null,
): SaveExtras {
  return {
    label: "",
    thumbnails: {
      portrait: capturePortraitThumb(state),
      scene: captureSceneThumb(scene),
    },
  };
}
