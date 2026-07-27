import { audio, type VolumeChannel } from "../audio";
import { HUB_MAP_ID } from "../data";
import {
  SaveError,
  listSaves,
  loadGame,
  mostRecentSave,
  type GameState,
} from "../state";
import { createCharacterCreateScreen } from "./characterCreate";
import { isDevMode } from "./dev";
import { createExploreScreen } from "./exploreScreen";
import { focusFirst } from "./focus";
import { saveErrorMessage } from "./format";
import { createGameScreen } from "./gameScreen";
import { createSaveLoadPanel } from "./saveLoad";
import type { Screen } from "./screen";
import { showScreen } from "./screen";
import { createSession } from "./session";

/** Title screen: New Game, Continue, Load Game, and a settings stub. */
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

      const settings = document.createElement("button");
      settings.className = "nf-button";
      settings.textContent = "Settings";
      settings.addEventListener("click", () =>
        showScreen(createSettingsScreen()),
      );

      menu.append(newGame, cont, load, settings);
      focusFirst(menu);

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
      }
      container.append(title, subtitle, menu, errorLine);
      root.append(container);
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
      focusFirst(panel.el);
    },

    unmount(): void {
      window.removeEventListener("keydown", escapeToMenu);
      container?.remove();
      container = null;
    },
  };
}

/** Settings: audio mixer controls, persisted as device preferences. */
function createSettingsScreen(): Screen {
  let container: HTMLElement | null = null;

  function volumeRow(label: string, channel: VolumeChannel): HTMLElement {
    const row = document.createElement("div");
    row.className = "nf-setting-row";
    const name = document.createElement("span");
    name.className = "nf-setting-label";
    name.textContent = label;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = String(Math.round(audio.getMixer()[channel] * 100));
    slider.addEventListener("input", () => {
      audio.setVolume(channel, Number(slider.value) / 100);
    });
    // A sample blip on release so the new level is audible immediately.
    slider.addEventListener("change", () => audio.play("ui-confirm"));
    row.append(name, slider);
    return row;
  }

  return {
    mount(root: HTMLElement): void {
      audio.setMusicContext("menu");
      container = document.createElement("div");
      container.className = "nf-screen";

      const panel = document.createElement("div");
      panel.className = "nf-panel nf-settings";
      const title = document.createElement("h2");
      title.textContent = "Settings";
      panel.append(title);

      panel.append(
        volumeRow("Master volume", "master"),
        volumeRow("Sound effects", "sfx"),
        volumeRow("Music", "music"),
      );

      const muteRow = document.createElement("div");
      muteRow.className = "nf-setting-row";
      const muteLabel = document.createElement("span");
      muteLabel.className = "nf-setting-label";
      muteLabel.textContent = "Audio";
      const mute = document.createElement("button");
      mute.className = "nf-button nf-button-small";
      mute.textContent = audio.getMixer().muted ? "Unmute" : "Mute";
      mute.addEventListener("click", () => {
        const muted = audio.toggleMuted();
        mute.textContent = muted ? "Unmute" : "Mute";
      });
      muteRow.append(muteLabel, mute);
      panel.append(muteRow);

      const back = document.createElement("button");
      back.className = "nf-button";
      back.textContent = "Back";
      back.addEventListener("click", () => showScreen(createMainMenuScreen()));
      panel.append(back);
      container.append(panel);
      root.append(container);
      window.addEventListener("keydown", escapeToMenu);
      focusFirst(panel);
    },

    unmount(): void {
      window.removeEventListener("keydown", escapeToMenu);
      container?.remove();
      container = null;
    },
  };
}
