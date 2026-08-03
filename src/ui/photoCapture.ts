/**
 * Getting a framed shot out of the page and onto the player's disk.
 *
 * The whole of it: ask the canvas for a PNG blob, hand the blob to an
 * anchor with a `download` attribute, click it, and let the object URL
 * go. There is no upload, no service, and nothing to configure — a
 * screenshot of a game running entirely in the browser has no business
 * leaving it.
 *
 * The pathway is thin on purpose and is the one part of photo mode that
 * a unit test cannot honestly cover: `toBlob` needs a real canvas
 * implementation, and a download needs a browser willing to save a file.
 * What *is* testable — how the shot is framed, what the file is called,
 * that leaving restores the game — lives in ./photoModel.ts, and this
 * module is kept small enough to read in one go so the untested part
 * stays the part with no decisions in it.
 */

/** Image type every capture is written as. */
export const PHOTO_MIME = "image/png";

/**
 * Saves a canvas as a PNG under `filename`, and reports whether the
 * download was actually started. False covers the two ways it can fail
 * without anything being wrong with the game: a canvas that cannot
 * encode (no `toBlob`, as in a headless test), and an encode that comes
 * back empty.
 */
export async function saveCanvasPng(
  canvas: HTMLCanvasElement,
  filename: string,
): Promise<boolean> {
  const blob = await canvasBlob(canvas);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    // Never attached to the document: a click on a detached anchor
    // downloads just as well and cannot disturb the layout of a screen
    // that is, right now, being photographed.
    link.click();
  } finally {
    // Freed on the next turn rather than immediately — revoking under a
    // click the browser has not finished with cancels the save.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return true;
}

/** The canvas as a PNG blob, or null where it cannot produce one. */
function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  if (typeof canvas.toBlob !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), PHOTO_MIME);
  });
}
