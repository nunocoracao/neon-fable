import { audio, musicScene } from "../audio";
import {
  LORE_PAYOFF,
  LORE_PAYOFF_TITLE,
  LORE_SHARDS,
  endings,
  epilogueThreads,
  epilogueVignettes,
} from "../data";
import {
  deriveCodex,
  deriveEpilogueCodex,
  deriveLoreCodex,
  loadMetaProgress,
  type GameState,
} from "../state";
import { shardLockedHint, shardNumber } from "./format";
import { focusFirst, installListNav } from "./focus";
import type { Screen } from "./screen";
import { t } from "./strings";

/**
 * The codex: every final ending as a card — discovered ones with title
 * and summary, locked ones as "???" with the authored spoiler-safe hint
 * — plus found-X/Y and completion stats, the same treatment for
 * epilogue threads, and the memory shards a player has turned up.
 *
 * Reads meta-progress, plus the live run's own collection when opened
 * mid-game (`state`); with no run in progress the shard section shows
 * the ever-found half alone. All lock/unlock and counting logic is
 * deriveCodex / deriveEpilogueCodex / deriveLoreCodex in
 * src/state/meta.ts — this file only paints.
 */
export function createCodexScreen(options: {
  onBack(): void;
  /** The run being played, when the codex is opened from the game. */
  state?: GameState;
}): Screen {
  let container: HTMLElement | null = null;

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") options.onBack();
  }

  return {
    name: "codex",
    mount(root: HTMLElement): void {
      audio.setMusicScene(musicScene("menu"));
      container = document.createElement("div");
      container.className = "nf-screen";

      const panel = document.createElement("div");
      panel.className = "nf-panel nf-codex";

      const title = document.createElement("h2");
      title.textContent = t("codex.title");
      panel.append(title);

      const endingsTitle = document.createElement("h3");
      endingsTitle.textContent = t("codex.endings");
      panel.append(endingsTitle);

      const meta = loadMetaProgress(window.localStorage);
      const codex = deriveCodex(endings, meta);

      const stats = document.createElement("p");
      stats.className = "nf-codex-stats";
      stats.textContent = t("codex.endings.stats", {
        found: codex.found,
        total: codex.total,
        completions: meta.completions,
      });
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

      // --- Epilogue threads: what the endings were made of.
      const epilogue = deriveEpilogueCodex(
        epilogueThreads,
        epilogueVignettes,
        meta,
      );

      const threadsTitle = document.createElement("h3");
      threadsTitle.textContent = t("codex.threads");
      panel.append(threadsTitle);

      const threadStats = document.createElement("p");
      threadStats.className = "nf-codex-stats nf-codex-epilogue-stats";
      threadStats.textContent = t("codex.threads.stats", {
        found: epilogue.threadsFound,
        threads: epilogue.threads,
        outcomes: epilogue.found,
        total: epilogue.total,
      });
      panel.append(threadStats);

      const threadList = document.createElement("div");
      threadList.className = "nf-codex-list nf-codex-threads";
      for (const entry of epilogue.entries) {
        const found = entry.found > 0;
        const card = document.createElement("div");
        card.className = found
          ? "nf-codex-entry nf-codex-found"
          : "nf-codex-entry nf-codex-locked";

        const heading = document.createElement("div");
        heading.className = "nf-codex-title";
        heading.textContent = found ? entry.title! : "???";

        const text = document.createElement("p");
        text.className = "nf-codex-text";
        // Discovered threads report their tally; locked ones say only
        // what kind of thing could have happened, never which way.
        text.textContent = found
          ? t("codex.threads.outcomes", { found: entry.found, total: entry.total })
          : entry.hint;

        card.append(heading, text);
        threadList.append(card);
      }
      panel.append(threadList);

      // --- Memory shards: the city's own history, as far as it has
      // been dug up. Both halves of the collection, the way the endings
      // half of this screen shows discovery: what this run is carrying,
      // and what any run ever turned up.
      const lore = deriveLoreCodex(LORE_SHARDS, options.state?.lore ?? null, meta);

      const loreTitle = document.createElement("h3");
      loreTitle.textContent = t("codex.shards");
      panel.append(loreTitle);

      const loreStats = document.createElement("p");
      loreStats.className = "nf-codex-stats nf-codex-lore-stats";
      loreStats.textContent = options.state
        ? t("codex.shards.statsInRun", {
            collected: lore.collected,
            discovered: lore.discovered,
            total: lore.total,
          })
        : t("codex.shards.statsEver", {
            discovered: lore.discovered,
            total: lore.total,
          });
      panel.append(loreStats);

      const loreList = document.createElement("div");
      loreList.className = "nf-codex-list nf-codex-lore";
      for (const entry of lore.entries) {
        const card = document.createElement("div");
        card.className = entry.discovered
          ? "nf-codex-entry nf-codex-found"
          : "nf-codex-entry nf-codex-locked";
        // Carried right now, as opposed to read on some earlier run.
        if (entry.collected) card.classList.add("nf-codex-held");

        const heading = document.createElement("div");
        heading.className = "nf-codex-title";
        heading.textContent = entry.discovered
          ? `${shardNumber(entry.index)} · ${entry.title ?? ""}`
          : t("codex.shards.locked", { number: shardNumber(entry.index) });
        card.append(heading);

        if (entry.discovered) {
          const source = document.createElement("p");
          source.className = "nf-codex-text nf-codex-source";
          source.textContent = shardLockedHint(entry.district);
          card.append(source);
          for (const paragraph of entry.paragraphs) {
            const text = document.createElement("p");
            text.className = "nf-codex-text";
            text.textContent = paragraph;
            card.append(text);
          }
        } else {
          // A locked slot says where it is and not one word more.
          const text = document.createElement("p");
          text.className = "nf-codex-text";
          text.textContent = shardLockedHint(entry.district);
          card.append(text);
        }

        loreList.append(card);
      }
      panel.append(loreList);

      // The whole set's payoff — purely something to read, and only
      // once every shard has been found.
      if (lore.complete) {
        const payoff = document.createElement("div");
        payoff.className = "nf-codex-entry nf-codex-found nf-codex-payoff";
        const heading = document.createElement("div");
        heading.className = "nf-codex-title";
        heading.textContent = LORE_PAYOFF_TITLE;
        payoff.append(heading);
        for (const paragraph of LORE_PAYOFF) {
          const text = document.createElement("p");
          text.className = "nf-codex-text";
          text.textContent = paragraph;
          payoff.append(text);
        }
        panel.append(payoff);
      }

      const menu = document.createElement("div");
      menu.className = "nf-menu";
      const back = document.createElement("button");
      back.className = "nf-button";
      back.textContent = t("common.back");
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
