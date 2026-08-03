import { audio, musicScene } from "../audio";
import { epilogueThreads, epilogueVignettes, getEnding } from "../data";
import { composeEpilogue } from "../narrative";
import { loadMetaProgress } from "../state";
import { focusFirst } from "./focus";
import { createMainMenuScreen } from "./mainMenu";
import { showScreen, type Screen } from "./screen";
import type { Session } from "./session";
import { t } from "./strings";

/**
 * The final screen: the game ending's text followed by the epilogue
 * vignettes — what became of each faction and ally, selected from
 * src/data/epilogues.ts by the pure selectVignettes logic. Shown after
 * a final ending, and whenever a finished save (game-complete flag) is
 * reopened. All selection logic lives in the narrative layer; this
 * file only renders.
 */
export interface EpilogueScreenOptions {
  session: Session;
}

export function createEpilogueScreen(options: EpilogueScreenOptions): Screen {
  let container: HTMLElement | null = null;

  function toMenu(event: KeyboardEvent): void {
    if (event.key === "Escape") showScreen(createMainMenuScreen());
  }

  return {
    mount(root: HTMLElement): void {
      const { state } = options.session;

      audio.setMusicScene(musicScene("ending"));
      container = document.createElement("div");
      container.className = "nf-screen";

      const panel = document.createElement("div");
      panel.className = "nf-panel nf-epilogue";

      const kicker = document.createElement("div");
      kicker.className = "nf-chapter-end-kicker";
      kicker.textContent = t("epilogue.kicker");
      panel.append(kicker);

      const endingId = state.flags["ending"];
      const ending =
        typeof endingId === "string" ? getEnding(endingId) : undefined;
      if (ending) {
        const title = document.createElement("h2");
        title.textContent = ending.title;
        panel.append(title);
        for (const paragraph of ending.paragraphs) {
          const p = document.createElement("p");
          p.className = "nf-chapter-end-text";
          p.textContent = paragraph;
          panel.append(p);
        }
      } else {
        console.error(
          `Unknown ending id "${String(endingId)}" — showing vignettes only`,
        );
      }

      const list = document.createElement("div");
      list.className = "nf-epilogue-vignettes";
      for (const vignette of composeEpilogue(
        state,
        epilogueVignettes,
        epilogueThreads,
      )) {
        const entry = document.createElement("div");
        entry.className = "nf-epilogue-vignette";
        const heading = document.createElement("h3");
        heading.textContent = vignette.title;
        const text = document.createElement("p");
        text.className = "nf-chapter-end-text";
        text.textContent = vignette.text;
        entry.append(heading, text);
        list.append(entry);
      }
      panel.append(list);

      const closer = document.createElement("p");
      closer.className = "nf-dim";
      closer.textContent = t("epilogue.closer", { name: state.player.name });
      panel.append(closer);

      // Read-only meta peek: point finished players at what's next.
      if (loadMetaProgress(options.session.storage).ngPlusUnlocked) {
        const unlock = document.createElement("p");
        unlock.className = "nf-dim";
        unlock.textContent = t("epilogue.ngPlus");
        panel.append(unlock);
      }

      const menu = document.createElement("div");
      menu.className = "nf-menu";
      const back = document.createElement("button");
      back.className = "nf-button";
      back.textContent = t("epilogue.returnToMenu");
      back.addEventListener("click", () => showScreen(createMainMenuScreen()));
      menu.append(back);
      panel.append(menu);

      container.append(panel);
      root.append(container);
      window.addEventListener("keydown", toMenu);
      focusFirst(panel);
    },

    unmount(): void {
      window.removeEventListener("keydown", toMenu);
      container?.remove();
      container = null;
    },
  };
}
