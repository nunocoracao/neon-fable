/**
 * Developer-mode gate: dev-only routes and shortcuts (e.g. the Explore
 * entry on the main menu) only appear when the page is opened with a
 * `?dev` query flag.
 */
import { showScreen } from "./screen";

export function isDevMode(): boolean {
  return new URLSearchParams(window.location.search).has("dev");
}

/**
 * Dev route into the art gallery. The screen (and the art registries it
 * walks) loads as its own chunk on first use, so the gallery costs
 * production nothing; outside ?dev this is a no-op.
 */
export async function openArtGallery(onBack: () => void): Promise<void> {
  if (!isDevMode()) return;
  const { createArtGalleryScreen } = await import("./artGallery");
  showScreen(createArtGalleryScreen({ onBack }));
}

/**
 * Dev route into the scripted performance scene and its frame-time HUD
 * (see src/data/perfScenes.ts). Its own chunk, like the gallery, so the
 * measuring gear costs the shipped game nothing; outside ?dev this is a
 * no-op.
 */
export async function openPerfScene(onBack: () => void): Promise<void> {
  if (!isDevMode()) return;
  const { createPerfScreen } = await import("./perfScreen");
  showScreen(createPerfScreen({ onExit: onBack }));
}
