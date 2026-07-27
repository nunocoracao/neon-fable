import { HUB_MAP_ID } from "../data";
import { createExploreScreen } from "./exploreScreen";
import type { Screen } from "./screen";
import { showScreen } from "./screen";

/** Title screen shown on boot. "New Game" is wired up in a later task. */
export function createMainMenuScreen(): Screen {
  let container: HTMLElement | null = null;

  return {
    mount(root: HTMLElement): void {
      container = document.createElement("div");
      container.className = "nf-screen";

      const title = document.createElement("h1");
      title.className = "nf-title";
      title.textContent = "Neon Fable";

      const subtitle = document.createElement("p");
      subtitle.className = "nf-subtitle";
      subtitle.textContent = "A cyberpunk story";

      const menu = document.createElement("div");
      menu.className = "nf-menu";

      const newGame = document.createElement("button");
      newGame.className = "nf-button";
      newGame.textContent = "New Game";
      newGame.disabled = true;

      // Temporary dev route into the iso scene until New Game exists.
      const explore = document.createElement("button");
      explore.className = "nf-button";
      explore.textContent = "Explore (dev)";
      explore.addEventListener("click", () => {
        showScreen(
          createExploreScreen({
            mapId: HUB_MAP_ID,
            spawnId: "player-start",
            onExit: () => showScreen(createMainMenuScreen()),
          }),
        );
      });

      menu.append(newGame, explore);
      container.append(title, subtitle, menu);
      root.append(container);
    },

    unmount(): void {
      container?.remove();
      container = null;
    },
  };
}
