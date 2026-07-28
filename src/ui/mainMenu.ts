import { audio } from "../audio";
import { HUB_MAP_ID } from "../data";
import {
  NG_PLUS_BONUS_POINTS,
  SaveError,
  listSaves,
  loadGame,
  loadMetaProgress,
  mostRecentSave,
  type GameState,
} from "../state";
import { createCharacterCreateScreen } from "./characterCreate";
import { createCodexScreen } from "./codexScreen";
import { isDevMode, openArtGallery } from "./dev";
import { createExploreScreen } from "./exploreScreen";
import { focusFirst, installListNav } from "./focus";
import { saveErrorMessage } from "./format";
import { createGameScreen } from "./gameScreen";
import { createSaveLoadPanel } from "./saveLoad";
import type { Screen } from "./screen";
import { showScreen } from "./screen";
import { createSession } from "./session";
import { createSettingsScreen } from "./settingsScreen";

/** Title screen: New Game, Continue, Load Game, and Settings. */
export function createMainMenuScreen(): Screen {
  let container: HTMLElement | null = null;

  function startLoadedGame(state: GameState): void {
    const session = createSession(state);
    showScreen(createGameScreen({ session }));
  }

  return {
    mount(root: HTMLElement): void {
      audio.setMusicContext("menu");
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

      const errorLine = document.createElement("p");
      errorLine.className = "nf-message nf-error";

      const newGame = document.createElement("button");
      newGame.className = "nf-button";
      newGame.textContent = "New Game";
      newGame.addEventListener("click", () =>
        showScreen(createCharacterCreateScreen()),
      );

      // Meta-progress (read-only here): NG+ unlock and the codex.
      const meta = loadMetaProgress(window.localStorage);
      let newGamePlus: HTMLButtonElement | null = null;
      if (meta.ngPlusUnlocked) {
        newGamePlus = document.createElement("button");
        newGamePlus.className = "nf-button";
        newGamePlus.textContent = "New Game+";
        newGamePlus.addEventListener("click", () =>
          showScreen(
            createCharacterCreateScreen({
              ngPlus: {
                bonusPoints: NG_PLUS_BONUS_POINTS,
                legacyItemIds: meta.legacyItemIds,
              },
            }),
          ),
        );
      }

      const recent = mostRecentSave(listSaves(window.localStorage));
      const cont = document.createElement("button");
      cont.className = "nf-button";
      cont.textContent = "Continue";
      cont.disabled = recent === null;
      cont.addEventListener("click", () => {
        if (!recent) return;
        try {
          startLoadedGame(loadGame(recent.slot, window.localStorage));
        } catch (error) {
          errorLine.textContent =
            error instanceof SaveError
              ? saveErrorMessage(error)
              : "Could not load the most recent save.";
        }
      });

      const load = document.createElement("button");
      load.className = "nf-button";
      load.textContent = "Load Game";
      load.addEventListener("click", () => showScreen(createLoadScreen()));

      const codex = document.createElement("button");
      codex.className = "nf-button";
      codex.textContent = "Endings Codex";
      codex.addEventListener("click", () =>
        showScreen(
          createCodexScreen({
            onBack: () => showScreen(createMainMenuScreen()),
          }),
        ),
      );

      const settings = document.createElement("button");
      settings.className = "nf-button";
      settings.textContent = "Settings";
      settings.addEventListener("click", () =>
        showScreen(
          createSettingsScreen({
            onBack: () => showScreen(createMainMenuScreen()),
          }),
        ),
      );

      menu.append(newGame);
      if (newGamePlus) menu.append(newGamePlus);
      menu.append(cont, load, codex, settings);
      installListNav(menu);

      // Dev route into the iso scene without a character; ?dev only.
      if (isDevMode()) {
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
        menu.append(explore);

        const gallery = document.createElement("button");
        gallery.className = "nf-button";
        gallery.textContent = "Art Gallery (dev)";
        gallery.addEventListener("click", () => {
          void openArtGallery(() => showScreen(createMainMenuScreen()));
        });
        menu.append(gallery);
      }
      container.append(title, subtitle, menu, errorLine);
      root.append(container);
      // Focus after attach — focusing a detached element is a no-op.
      focusFirst(menu);
    },

    unmount(): void {
      container?.remove();
      container = null;
    },
  };
}

/** Escape returns to the main menu, matching every screen's Back button. */
function escapeToMenu(event: KeyboardEvent): void {
  if (event.key === "Escape") showScreen(createMainMenuScreen());
}

/** Full-screen wrapper around the save/load panel in load-only mode. */
function createLoadScreen(): Screen {
  let container: HTMLElement | null = null;

  return {
    mount(root: HTMLElement): void {
      container = document.createElement("div");
      container.className = "nf-screen";
      const panel = createSaveLoadPanel({
        mode: "menu",
        storage: window.localStorage,
        onLoaded(state) {
          const session = createSession(state);
          showScreen(createGameScreen({ session }));
        },
        onClose: () => showScreen(createMainMenuScreen()),
      });
      container.append(panel.el);
      root.append(container);
      window.addEventListener("keydown", escapeToMenu);
      installListNav(panel.el);
      focusFirst(panel.el);
    },

    unmount(): void {
      window.removeEventListener("keydown", escapeToMenu);
      container?.remove();
      container = null;
    },
  };
}
