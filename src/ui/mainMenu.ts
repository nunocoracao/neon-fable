import type { Screen } from "./screen";

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

      menu.append(newGame);
      container.append(title, subtitle, menu);
      root.append(container);
    },

    unmount(): void {
      container?.remove();
      container = null;
    },
  };
}
