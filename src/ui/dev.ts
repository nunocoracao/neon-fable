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
