import { createCombat, resolveCombat } from "../combat";
import type { CombatStatus } from "../combat";
import { getEncounter, getEnemy } from "../data";
import { createGameScreen } from "./gameScreen";
import { showScreen, type Screen } from "./screen";
import type { Session } from "./session";

/**
 * DEV PLACEHOLDER — the playable combat UI lands in task 9. Until then
 * this screen lets a tester pick the fight's outcome; the chosen result
 * is folded back through the real engine (createCombat + resolveCombat)
 * so outcome flags, consumables, rewards, and the post-combat autosave
 * behave exactly as they will with the real UI.
 */
export interface CombatStubOptions {
  session: Session;
  encounterId: string;
  /** Dialogue node to resume once the fight resolves, if any. */
  resumeNodeId: string | null;
}

export function createCombatStubScreen(options: CombatStubOptions): Screen {
  const { session, encounterId, resumeNodeId } = options;
  let container: HTMLElement | null = null;

  function backToGame(): void {
    showScreen(
      createGameScreen({ session, dialogueNodeId: resumeNodeId }),
    );
  }

  function resolveWith(status: Exclude<CombatStatus, "active">): void {
    const combat = createCombat(session.state, encounterId);
    session.state = resolveCombat(session.state, { ...combat, status });
    backToGame();
  }

  return {
    mount(root: HTMLElement): void {
      container = document.createElement("div");
      container.className = "nf-screen";

      const panel = document.createElement("div");
      panel.className = "nf-panel nf-combat-stub";

      const encounter = getEncounter(encounterId);
      if (!encounter) {
        console.error(`Unknown encounter id "${encounterId}"`);
        backToGame();
        return;
      }

      const title = document.createElement("h2");
      title.textContent = encounter.name;
      panel.append(title);

      const foes = document.createElement("p");
      foes.className = "nf-dim";
      foes.textContent =
        "Hostiles: " +
        encounter.enemies
          .map((spawn) => getEnemy(spawn.enemyId)?.name ?? spawn.enemyId)
          .join(", ");
      panel.append(foes);

      const note = document.createElement("p");
      note.className = "nf-message";
      note.textContent =
        "Turn-based combat arrives in a later task. Pick an outcome to " +
        "continue (dev placeholder).";
      panel.append(note);

      const menu = document.createElement("div");
      menu.className = "nf-menu";
      const outcomes: Array<[string, Exclude<CombatStatus, "active">]> = [
        ["Resolve: Victory (dev)", "victory"],
        ["Resolve: Defeat (dev)", "defeat"],
      ];
      if (encounter.fleeable ?? true) {
        outcomes.push(["Resolve: Flee (dev)", "fled"]);
      }
      for (const [label, status] of outcomes) {
        const button = document.createElement("button");
        button.className = "nf-button";
        button.textContent = label;
        button.addEventListener("click", () => resolveWith(status));
        menu.append(button);
      }
      panel.append(menu);

      container.append(panel);
      root.append(container);
    },

    unmount(): void {
      container?.remove();
      container = null;
    },
  };
}
