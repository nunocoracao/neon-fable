import { audio } from "../audio";
import { endings } from "../data";
import { deriveCodex, loadMetaProgress } from "../state";
import { focusFirst, installListNav } from "./focus";
import type { Screen } from "./screen";

/**
 * Endings codex: every final ending as a card — discovered ones with
 * title and summary, locked ones as "???" with the authored
 * spoiler-safe hint — plus found-X/Y and completion stats. Reads
 * meta-progress only; all lock/unlock logic is deriveCodex in
 * src/state/meta.ts.
 */
export function createCodexScreen(options: { onBack(): void }): Screen {
  let container: HTMLElement | null = null;

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") options.onBack();
  }

  return {
    mount(root: HTMLElement): void {
      audio.setMusicContext("menu");
      container = document.createElement("div");
      container.className = "nf-screen";

      const panel = document.createElement("div");
      panel.className = "nf-panel nf-codex";

      const title = document.createElement("h2");
      title.textContent = "Endings Codex";
      panel.append(title);

      const meta = loadMetaProgress(window.localStorage);
      const codex = deriveCodex(endings, meta);

      const stats = document.createElement("p");
      stats.className = "nf-codex-stats";
      stats.textContent =
        `Endings found ${codex.found}/${codex.total} · ` +
        `Playthroughs completed: ${meta.completions}`;
      panel.append(stats);

      const list = document.createElement("div");
      list.className = "nf-codex-list";
      for (const entry of codex.entries) {
        const card = document.createElement("div");
        card.className = entry.discovered
          ? "nf-codex-entry nf-codex-found"
          : "nf-codex-entry nf-codex-locked";

        const heading = document.createElement("div");
        heading.className = "nf-codex-title";
        heading.textContent = entry.discovered ? entry.title! : "???";

        const text = document.createElement("p");
        text.className = "nf-codex-text";
        text.textContent = entry.discovered
          ? (entry.summary ?? "")
          : entry.hint;

        card.append(heading, text);
        list.append(card);
      }
      panel.append(list);

      const menu = document.createElement("div");
      menu.className = "nf-menu";
      const back = document.createElement("button");
      back.className = "nf-button";
      back.textContent = "Back";
      back.addEventListener("click", options.onBack);
      menu.append(back);
      panel.append(menu);

      container.append(panel);
      root.append(container);
      window.addEventListener("keydown", onKeyDown);
      installListNav(panel);
      focusFirst(panel);
    },

    unmount(): void {
      window.removeEventListener("keydown", onKeyDown);
      container?.remove();
      container = null;
    },
  };
}
