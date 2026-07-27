import {
  HUB_MAP_ID,
  findArcByNode,
  getEncounter,
  getEnding,
  getMap,
  requireMap,
  type ChapterEnding,
} from "../data";
import { createIsoScene, type IsoScene } from "../iso";
import { COMBAT_RESUME_FLAG, createCombatScreen } from "./combatScreen";
import { createDialogueOverlay } from "./dialogueOverlay";
import { createInventoryOverlay } from "./inventoryOverlay";
import { createMainMenuScreen } from "./mainMenu";
import type { OverlayHandle } from "./overlay";
import { createSaveLoadPanel } from "./saveLoad";
import { showScreen, type Screen } from "./screen";
import { autosave, enterMap, type Session } from "./session";

/**
 * The in-game screen: iso scene on the background canvas, a HUD bar,
 * and one overlay at a time (dialogue, inventory, saves, system menu).
 * Map interactions route into the narrative and combat systems; this
 * file holds no game rules.
 */
export interface GameScreenOptions {
  session: Session;
  /** Open dialogue at this node immediately (new-game intro, post-combat resume). */
  dialogueNodeId?: string | null;
}

type OverlayKind = "dialogue" | "inventory" | "saves" | "menu";

export function createGameScreen(options: GameScreenOptions): Screen {
  const { session } = options;
  let root: HTMLElement | null = null;
  let scene: IsoScene | null = null;
  let hud: HTMLElement | null = null;
  let hudStatus: HTMLElement | null = null;
  let overlayLayer: HTMLElement | null = null;
  let toast: HTMLElement | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let overlay: { kind: OverlayKind; handle: OverlayHandle } | null = null;

  if (!getMap(session.state.location)) {
    console.error(
      `Unknown map id "${session.state.location}" — falling back to the hub`,
    );
  }
  const mapId = getMap(session.state.location) ? session.state.location : HUB_MAP_ID;
  const map = requireMap(mapId);

  function refreshHud(): void {
    if (!hudStatus) return;
    const { player, credits } = session.state;
    hudStatus.replaceChildren();
    for (const text of [
      map.name,
      `HP ${player.hp}/${player.derived.maxHp}`,
      `${credits} cr`,
    ]) {
      const span = document.createElement("span");
      span.textContent = text;
      hudStatus.append(span);
    }
  }

  function showToast(text: string): void {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("nf-toast-visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(
      () => toast?.classList.remove("nf-toast-visible"),
      4000,
    );
  }

  function closeOverlay(): void {
    overlay?.handle.destroy();
    overlay = null;
  }

  function openOverlay(kind: OverlayKind, handle: OverlayHandle): void {
    closeOverlay();
    overlay = { kind, handle };
    overlayLayer?.append(handle.el);
  }

  function openDialogue(nodeId: string): void {
    const arc = findArcByNode(nodeId);
    if (!arc) {
      console.error(`No story arc contains node "${nodeId}"`);
      return;
    }
    openOverlay(
      "dialogue",
      createDialogueOverlay({
        session,
        arc,
        nodeId,
        onStateChange: refreshHud,
        onCombat(encounterId, resumeNodeId) {
          closeOverlay();
          showScreen(
            createCombatScreen({ session, encounterId, resumeNodeId }),
          );
        },
        onTravel(_mapId, nextNodeId) {
          // The travel effect already set session.state.location; remount
          // the game screen on the new map and continue any target node.
          closeOverlay();
          showScreen(createGameScreen({ session, dialogueNodeId: nextNodeId }));
        },
        onEnded(endingId) {
          closeOverlay();
          const ending = endingId ? getEnding(endingId) : undefined;
          if (ending) {
            autosave(session);
            openChapterEnd(ending);
          } else if (endingId) {
            showToast(`Story thread complete — ${endingId}`);
          }
        },
        onComplete: closeOverlay,
      }),
    );
  }

  function openChapterEnd(ending: ChapterEnding): void {
    const el = document.createElement("div");
    el.className = "nf-overlay nf-overlay-center";
    const panel = document.createElement("div");
    panel.className = "nf-panel nf-chapter-end";
    const kicker = document.createElement("div");
    kicker.className = "nf-chapter-end-kicker";
    kicker.textContent = "Chapter complete";
    const title = document.createElement("h2");
    title.textContent = ending.title;
    panel.append(kicker, title);
    for (const paragraph of ending.paragraphs) {
      const p = document.createElement("p");
      p.className = "nf-chapter-end-text";
      p.textContent = paragraph;
      panel.append(p);
    }
    const menu = document.createElement("div");
    menu.className = "nf-menu";
    const entries: Array<[string, () => void]> = [
      ["Keep Exploring", closeOverlay],
      ["Main Menu", () => showScreen(createMainMenuScreen())],
    ];
    for (const [label, action] of entries) {
      const button = document.createElement("button");
      button.className = "nf-button";
      button.textContent = label;
      button.addEventListener("click", action);
      menu.append(button);
    }
    panel.append(menu);
    el.append(panel);
    openOverlay("menu", { el, destroy: () => el.remove() });
  }

  function openInventory(): void {
    openOverlay(
      "inventory",
      createInventoryOverlay({
        session,
        onStateChange: refreshHud,
        onClose: closeOverlay,
      }),
    );
  }

  function openSaves(): void {
    openOverlay(
      "saves",
      createSaveLoadPanel({
        mode: "game",
        storage: session.storage,
        session,
        onLoaded(state) {
          session.state = state;
          showScreen(createGameScreen({ session }));
        },
        onClose: closeOverlay,
      }),
    );
  }

  function openSystemMenu(): void {
    const el = document.createElement("div");
    el.className = "nf-overlay nf-overlay-center";
    const panel = document.createElement("div");
    panel.className = "nf-panel nf-system-menu";
    const title = document.createElement("h2");
    title.textContent = "Paused";
    panel.append(title);
    const menu = document.createElement("div");
    menu.className = "nf-menu";
    const entries: Array<[string, () => void]> = [
      ["Resume", closeOverlay],
      ["Save / Load", openSaves],
      [
        "Quit to Main Menu",
        () => showScreen(createMainMenuScreen()),
      ],
    ];
    for (const [label, action] of entries) {
      const button = document.createElement("button");
      button.className = "nf-button";
      button.textContent = label;
      button.addEventListener("click", action);
      menu.append(button);
    }
    panel.append(menu);
    el.append(panel);
    openOverlay("menu", { el, destroy: () => el.remove() });
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      if (overlay?.kind === "dialogue") return;
      if (overlay) closeOverlay();
      else openSystemMenu();
      return;
    }
    if (event.key === "i" || event.key === "I") {
      if (overlay?.kind === "dialogue") return;
      if (overlay?.kind === "inventory") closeOverlay();
      else openInventory();
    }
  }

  return {
    mount(mountRoot: HTMLElement): void {
      // A pending encounter (start-combat effect, or a save made during a
      // battle) takes over before the map appears: re-enter the fight.
      const pending = session.state.pendingEncounterId;
      if (pending) {
        if (getEncounter(pending)) {
          const resume = session.state.flags[COMBAT_RESUME_FLAG];
          showScreen(
            createCombatScreen({
              session,
              encounterId: pending,
              resumeNodeId: typeof resume === "string" ? resume : null,
            }),
          );
          return;
        }
        console.error(
          `Unknown pending encounter id "${pending}" — dropping the fight`,
        );
        session.state = { ...session.state, pendingEncounterId: null };
      }

      root = mountRoot;
      root.style.pointerEvents = "none";

      const canvas = document.getElementById("iso-canvas");
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Missing #iso-canvas element");
      }

      // Map transition (and post-combat return): record location + autosave.
      enterMap(session, mapId);

      hud = document.createElement("div");
      hud.className = "nf-hud";
      hudStatus = document.createElement("div");
      hudStatus.className = "nf-hud-status";
      const actions = document.createElement("div");
      actions.className = "nf-hud-actions";
      const hudButtons: Array<[string, () => void]> = [
        ["Inventory [I]", () => (overlay?.kind === "inventory" ? closeOverlay() : openInventory())],
        ["Saves", openSaves],
        ["Menu [Esc]", () => (overlay ? closeOverlay() : openSystemMenu())],
      ];
      for (const [label, action] of hudButtons) {
        const button = document.createElement("button");
        button.className = "nf-button nf-button-small";
        button.textContent = label;
        button.addEventListener("click", action);
        actions.append(button);
      }
      hud.append(hudStatus, actions);
      root.append(hud);

      overlayLayer = document.createElement("div");
      overlayLayer.className = "nf-overlay-layer";
      root.append(overlayLayer);

      toast = document.createElement("div");
      toast.className = "nf-toast";
      root.append(toast);

      refreshHud();

      scene = createIsoScene(canvas, {
        map,
        spawnId: "player-start",
        onInteract(event): void {
          if (overlay) return;
          if (event.interaction.kind === "dialogue") {
            openDialogue(event.interaction.nodeId);
          } else {
            showScreen(
              createCombatScreen({
                session,
                encounterId: event.interaction.encounterId,
                resumeNodeId: null,
              }),
            );
          }
        },
      });

      window.addEventListener("keydown", onKeyDown);

      if (options.dialogueNodeId) {
        openDialogue(options.dialogueNodeId);
      }
    },

    unmount(): void {
      window.removeEventListener("keydown", onKeyDown);
      closeOverlay();
      if (toastTimer) clearTimeout(toastTimer);
      scene?.destroy();
      scene = null;
      hud?.remove();
      overlayLayer?.remove();
      toast?.remove();
      hud = null;
      hudStatus = null;
      overlayLayer = null;
      toast = null;
      if (root) {
        root.style.pointerEvents = "";
        root = null;
      }
    },
  };
}
