import { audio } from "../audio";
import {
  HUB_MAP_ID,
  epilogueVignettes,
  findArcByNode,
  getEncounter,
  getEnding,
  getMap,
  requireMap,
  type ChapterEnding,
} from "../data";
import { availablePoints } from "../character";
import { selectVignettes } from "../narrative";
import {
  carryoverAppearance,
  carryoverCandidates,
  recordCompletionToStorage,
} from "../state";
import {
  ENTRY_SPAWN_ID,
  createIsoScene,
  createPixelArtSprites,
  spawnPoint,
  type DayPhaseId,
  type Interactable,
  type IsoFocusHint,
  type IsoScene,
} from "../iso";
import { settings } from "../settings";
import { interactPrompt } from "./format";
import { runMapTransition, type MapTransitionHandle } from "./mapTransition";
import { npcSpriteSource, sceneSpriteSource } from "./entitySprites";
import { playerSpriteSource } from "./playerSprite";
import { createAdvancementOverlay } from "./advancementOverlay";
import { COMBAT_RESUME_FLAG, createCombatScreen } from "./combatScreen";
import { createDialogueOverlay } from "./dialogueOverlay";
import { createEpilogueScreen } from "./epilogueScreen";
import { createInventoryOverlay } from "./inventoryOverlay";
import { focusFirst, installListNav } from "./focus";
import { createMainMenuScreen } from "./mainMenu";
import { createMinimap, type MinimapHandle } from "./minimap";
import type { OverlayHandle } from "./overlay";
import { createSaveLoadPanel } from "./saveLoad";
import { createStylistOverlay } from "./stylistOverlay";
import { showScreen, type Screen } from "./screen";
import { autosave, enterMap, type Session } from "./session";
import { createSettingsOverlay } from "./settingsScreen";

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
  /**
   * Spawn point to arrive on — the entry an exit declared. Unknown or
   * absent lands on the map's own entry spawn.
   */
  spawnId?: string;
}

type OverlayKind =
  | "dialogue"
  | "inventory"
  | "advance"
  | "saves"
  | "menu"
  | "settings"
  | "stylist";

/** Flag marking that this playthrough's ending is already in meta-progress. */
const META_RECORDED_FLAG = "meta-recorded";

/**
 * Writes a finished run into meta-progress (endings codex, NG+ unlock,
 * legacy carry-over candidates). Guarded by a state flag so a
 * completion is recorded exactly once, even if a finished save's final
 * dialogue somehow replays; reopening a finished save never re-records
 * because only the final-ending handoff calls this.
 */
function recordFinishedRun(session: Session): void {
  const state = session.state;
  if (state.flags[META_RECORDED_FLAG] === true) return;
  const endingId = state.flags["ending"];
  if (typeof endingId !== "string") {
    console.error("Final ending reached with no ending flag — not recorded");
    return;
  }
  recordCompletionToStorage(
    {
      endingId,
      epilogueIds: selectVignettes(state, epilogueVignettes).map((v) => v.id),
      legacyItemIds: carryoverCandidates(state.player),
      legacyAppearance: carryoverAppearance(state.player),
    },
    session.storage,
  );
  session.state = {
    ...state,
    flags: { ...state.flags, [META_RECORDED_FLAG]: true },
  };
}

export function createGameScreen(options: GameScreenOptions): Screen {
  const { session } = options;
  let root: HTMLElement | null = null;
  let scene: IsoScene | null = null;
  let hud: HTMLElement | null = null;
  let hudStatus: HTMLElement | null = null;
  let overlayLayer: HTMLElement | null = null;
  let toast: HTMLElement | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let promptEl: HTMLElement | null = null;
  let minimap: MinimapHandle | null = null;
  let unsubscribeSettings: (() => void) | null = null;
  /** The interactable whose scene is currently open, for the door beat. */
  let usedInteractable: Interactable | null = null;
  /** A map transition in flight, and whether it has already swapped. */
  let transition: MapTransitionHandle | null = null;
  let transitionSwapped = false;
  let overlay: { kind: OverlayKind; handle: OverlayHandle } | null = null;
  let advanceButton: HTMLButtonElement | null = null;
  /**
   * The hour a story beat has staged this visit at, if any. A beat that
   * sets one moves the scene's clock and leaves it there — the plaza
   * stays at 3am for the rest of the act's business on it — while beats
   * that set none leave whatever is showing alone. Leaving the map
   * remounts the screen, which hands the clock back to the map.
   */
  let storyPhase: DayPhaseId | null = null;

  // "main-menu" is the fresh-game sentinel, not a content error.
  if (session.state.location !== "main-menu" && !getMap(session.state.location)) {
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
    advanceButton?.classList.toggle(
      "nf-button-attention",
      availablePoints(session.state) > 0,
    );
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

  /**
   * The prompt line for whatever the scene has in focus: an offer to
   * act on it once in reach, and a way out's destination before that.
   * Driven entirely by map data — the scene reports which interactable
   * is in focus, the shell resolves the destination's name and the
   * wording.
   */
  function showFocusHint(hint: IsoFocusHint | null): void {
    if (!promptEl) return;
    const text = hint
      ? interactPrompt({
          label: hint.label,
          spriteId: hint.spriteId,
          kind: hint.interaction.kind,
          inRange: hint.inRange,
          destination: hint.exitMapId
            ? getMap(hint.exitMapId)?.name
            : undefined,
        })
      : null;
    if (text === null) {
      promptEl.classList.remove("nf-interact-prompt-visible");
      return;
    }
    promptEl.textContent = text;
    promptEl.classList.add("nf-interact-prompt-visible");
  }

  /**
   * M, and the minimap's own tab, both go through the setting — so the
   * Settings panel's switch, the key, and the tab can never disagree,
   * and the choice survives the session.
   */
  function toggleMinimap(): void {
    settings.update({ minimap: !settings.get().minimap });
  }

  function closeOverlay(): void {
    overlay?.handle.destroy();
    overlay = null;
  }

  function openOverlay(kind: OverlayKind, handle: OverlayHandle): void {
    closeOverlay();
    overlay = { kind, handle };
    overlayLayer?.append(handle.el);
    focusFirst(handle.el);
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
        onNode(node) {
          if (!node.dayPhase || node.dayPhase === storyPhase) return;
          storyPhase = node.dayPhase;
          scene?.setDayPhase(storyPhase);
        },
        onCombat(encounterId, resumeNodeId) {
          closeOverlay();
          showScreen(
            createCombatScreen({
              session,
              encounterId,
              resumeNodeId,
              // Fight under the hour the beat staged, not the map's.
              dayPhase: storyPhase ?? undefined,
            }),
          );
        },
        onTravel(targetMapId, nextNodeId) {
          // The travel effect already set session.state.location. The
          // screen is remounted on the new map behind the cover, so the
          // swap itself is never seen; the interactable that opened
          // this scene plays its door first, if it has one.
          closeOverlay();
          const leaving = usedInteractable;
          const entryId =
            leaving?.exit?.mapId === targetMapId
              ? leaving.exit.entryId
              : undefined;
          transition = runMapTransition({
            destinationName: getMap(targetMapId)?.name ?? targetMapId,
            reducedMotion: settings.get().reducedMotion,
            openDoor: leaving
              ? () => scene?.playOpening(leaving.id) === true
              : undefined,
            onSwap() {
              transitionSwapped = true;
              showScreen(
                createGameScreen({
                  session,
                  dialogueNodeId: nextNodeId,
                  spawnId: entryId,
                }),
              );
            },
          });
        },
        onStylist(resumeNodeId) {
          // The re-style screen replaces the dialogue; closing it
          // (confirm or cancel) resumes at the choice's target node.
          openOverlay(
            "stylist",
            createStylistOverlay({
              session,
              onStateChange: refreshHud,
              onClose() {
                closeOverlay();
                if (resumeNodeId) openDialogue(resumeNodeId);
              },
            }),
          );
        },
        onEnded(endingId) {
          closeOverlay();
          const ending = endingId ? getEnding(endingId) : undefined;
          if (ending?.final) {
            // Game ending: record the completion into meta-progress
            // exactly once — the moment the epilogue is first shown —
            // then autosave; the end effects set game-complete, so the
            // autosave is a finished save that reopens to the epilogue.
            recordFinishedRun(session);
            autosave(session);
            showScreen(createEpilogueScreen({ session }));
          } else if (ending) {
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
    if (availablePoints(session.state) > 0) {
      entries.unshift(["Spend Advancement Points", openAdvancement]);
    }
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

  function openAdvancement(): void {
    openOverlay(
      "advance",
      createAdvancementOverlay({
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

  function openSettings(): void {
    // Settings live outside the session; the game state is untouched
    // and Back returns to the pause menu.
    openOverlay(
      "settings",
      createSettingsOverlay({ onClose: openSystemMenu }),
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
      ["Settings", openSettings],
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
      audio.play("ui-cancel");
      if (overlay) closeOverlay();
      else openSystemMenu();
      return;
    }
    if (event.key === "i" || event.key === "I") {
      if (overlay?.kind === "dialogue") return;
      if (overlay?.kind === "inventory") closeOverlay();
      else openInventory();
    }
    if (event.key === "p" || event.key === "P") {
      if (overlay?.kind === "dialogue") return;
      if (overlay?.kind === "advance") closeOverlay();
      else openAdvancement();
    }
    if (event.key === "m" || event.key === "M") {
      // The minimap sits under whatever overlay is open, so collapsing
      // it mid-dialogue would be a change you cannot see; leave it be.
      if (overlay) return;
      toggleMinimap();
    }
  }

  return {
    mount(mountRoot: HTMLElement): void {
      // A finished playthrough reopens to the epilogue, not a dead hub.
      if (session.state.flags["game-complete"] === true) {
        showScreen(createEpilogueScreen({ session }));
        return;
      }

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
      audio.setMusicContext("hub");

      hud = document.createElement("div");
      hud.className = "nf-hud";
      hudStatus = document.createElement("div");
      hudStatus.className = "nf-hud-status";
      const actions = document.createElement("div");
      actions.className = "nf-hud-actions";
      const hudButtons: Array<[string, () => void]> = [
        ["Inventory [I]", () => (overlay?.kind === "inventory" ? closeOverlay() : openInventory())],
        ["Advance [P]", () => (overlay?.kind === "advance" ? closeOverlay() : openAdvancement())],
        ["Saves", openSaves],
        ["Menu [Esc]", () => (overlay ? closeOverlay() : openSystemMenu())],
      ];
      for (const [label, action] of hudButtons) {
        const button = document.createElement("button");
        button.className = "nf-button nf-button-small";
        button.textContent = label;
        button.addEventListener("click", action);
        if (label === "Advance [P]") advanceButton = button;
        actions.append(button);
      }
      hud.append(hudStatus, actions);
      root.append(hud);

      minimap = createMinimap({
        map,
        open: settings.get().minimap,
        onToggle: toggleMinimap,
      });
      // Mounted before the overlay layer so an open panel covers it,
      // the way it covers the rest of the map.
      root.append(minimap.el);
      unsubscribeSettings = settings.subscribe((next) => {
        minimap?.setOpen(next.minimap);
      });

      overlayLayer = document.createElement("div");
      overlayLayer.className = "nf-overlay-layer";
      // One delegated listener covers every overlay mounted here —
      // dialogue choices, inventory, saves, and menus all arrow-navigate.
      installListNav(overlayLayer);
      root.append(overlayLayer);

      toast = document.createElement("div");
      toast.className = "nf-toast";
      root.append(toast);

      promptEl = document.createElement("div");
      promptEl.className = "nf-interact-prompt";
      root.append(promptEl);

      refreshHud();

      const arrival =
        options.spawnId && spawnPoint(map, options.spawnId)
          ? options.spawnId
          : ENTRY_SPAWN_ID;

      scene = createIsoScene(canvas, {
        map,
        spawnId: arrival,
        dayPhase: storyPhase,
        sprites: createPixelArtSprites({
          player: playerSpriteSource(session),
          npc: npcSpriteSource(map),
          entity: sceneSpriteSource(),
        }),
        onFocus: showFocusHint,
        onView: (view) => minimap?.update(view),
        onInteract(event): void {
          if (overlay) return;
          audio.play("interact");
          usedInteractable =
            map.interactables.find((i) => i.id === event.interactableId) ?? null;
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
      // A transition that has already swapped is now covering the new
      // screen and must be left to finish; one that has not (a load, a
      // quit) never happens at all.
      if (!transitionSwapped) transition?.cancel();
      transition = null;
      scene?.destroy();
      scene = null;
      unsubscribeSettings?.();
      unsubscribeSettings = null;
      minimap?.destroy();
      minimap = null;
      hud?.remove();
      overlayLayer?.remove();
      toast?.remove();
      promptEl?.remove();
      hud = null;
      hudStatus = null;
      advanceButton = null;
      overlayLayer = null;
      toast = null;
      promptEl = null;
      if (root) {
        root.style.pointerEvents = "";
        root = null;
      }
    },
  };
}
