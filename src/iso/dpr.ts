/**
 * Watches devicePixelRatio for changes (browser zoom, or the window
 * moving to a display with a different scale). matchMedia is the only
 * signal browsers expose for this, and a resolution query only matches
 * the ratio it was created with — so the listener re-arms itself with a
 * fresh query after every change.
 */
export function observeDevicePixelRatio(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  let query: MediaQueryList | null = null;
  const handle = (): void => {
    query?.removeEventListener("change", handle);
    onChange();
    arm();
  };
  const arm = (): void => {
    const dpr = window.devicePixelRatio || 1;
    query = window.matchMedia(`(resolution: ${dpr}dppx)`);
    query.addEventListener("change", handle);
  };
  arm();
  return () => query?.removeEventListener("change", handle);
}
