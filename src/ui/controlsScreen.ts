/**
 * The Controls reference: the whole key map on one screen, rendered
 * straight off the table in ./controlsModel.ts.
 *
 * It exists because "the game is keyboard-playable" is only true if a
 * player can find out *how*. The Settings panel carries the same table
 * inline, but a settings panel is a place you go to change something —
 * this is a place you go to read, reachable from the main menu and from
 * the pause menu without scrolling past the mixer to get there.
 *
 * A definition list, not a table: each group is a heading, each binding
 * a term (the keys) and its description (what they do), so a screen
 * reader walks it as "Arrows slash WASD — walk one tile in that
 * direction" rather than reading a grid of cells with no relationship
 * between them.
 */
import { audio, musicScene } from "../audio";
import { CONTROL_GROUPS } from "./controlsModel";
import { focusFirst, installListNav } from "./focus";
import { createOverlayRoot, type OverlayHandle } from "./overlay";
import type { Screen } from "./screen";
import { plain, t } from "./strings";

/** The reference itself, without the frame around it. */
export function buildControlsPanel(onBack: () => void): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "nf-panel nf-controls";

  const title = document.createElement("h2");
  title.textContent = t("controls.title");
  panel.append(title);

  const lede = document.createElement("p");
  lede.className = "nf-dim";
  lede.textContent = t("controls.lede");
  panel.append(lede);

  for (const group of CONTROL_GROUPS) {
    const heading = document.createElement("h3");
    heading.textContent = plain(group.title);
    panel.append(heading);
    if (group.blurb !== null) {
      const blurb = document.createElement("p");
      blurb.className = "nf-dim";
      blurb.textContent = plain(group.blurb);
      panel.append(blurb);
    }
    const list = document.createElement("dl");
    list.className = "nf-controls-list";
    for (const binding of group.bindings) {
      const keys = document.createElement("dt");
      keys.className = "nf-kbd";
      keys.textContent = plain(binding.keys);
      const what = document.createElement("dd");
      what.className = "nf-controls-desc";
      what.textContent = plain(binding.what);
      what.dataset.binding = binding.id;
      list.append(keys, what);
    }
    panel.append(list);
  }

  const back = document.createElement("button");
  back.className = "nf-button";
  back.textContent = t("common.back");
  back.addEventListener("click", () => {
    audio.emit("ui.cancel");
    onBack();
  });
  panel.append(back);

  installListNav(panel);
  return panel;
}

/** In-game overlay form; closing returns to whatever opened it. */
export function createControlsOverlay(options: {
  onClose(): void;
}): OverlayHandle {
  const el = createOverlayRoot(t("controls.title"));
  el.append(buildControlsPanel(options.onClose));
  return { el, destroy: () => el.remove() };
}

/** Full-screen form; Escape backs out too. */
export function createControlsScreen(options: { onBack(): void }): Screen {
  let container: HTMLElement | null = null;

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") options.onBack();
  }

  return {
    name: "controls",
    mount(root: HTMLElement): void {
      audio.setMusicScene(musicScene("menu"));
      container = document.createElement("div");
      container.className = "nf-screen";
      const panel = buildControlsPanel(options.onBack);
      container.append(panel);
      root.append(container);
      window.addEventListener("keydown", onKeyDown);
      focusFirst(panel);
    },

    unmount(): void {
      window.removeEventListener("keydown", onKeyDown);
      container?.remove();
      container = null;
    },
  };
}
