import {
  CombatError,
  PLAYER_COMBATANT_ID,
  abilityOptions,
  activeCombatant,
  attackOptions,
  chooseEnemyAction,
  createCombat,
  fleeChanceFor,
  getCombatant,
  isAlive,
  itemOptions,
  manhattanPath,
  reachableTiles,
  resolveCombat,
  runEnemyTurns,
  takeAction,
  type CombatAction,
  type CombatState,
  type GridPosition,
} from "../combat";
import { getAbility, getEncounter, getItem, requireMap } from "../data";
import { createCombatScene, type CombatScene } from "../iso";
import type { IsoMap, TilePoint } from "../iso";
import { SaveError, loadGame, type GameState } from "../state";
import {
  combatEventText,
  combatantDisplayNames,
  percentLabel,
  saveErrorMessage,
} from "./format";
import { createGameScreen } from "./gameScreen";
import { createMainMenuScreen } from "./mainMenu";
import { createSaveLoadPanel } from "./saveLoad";
import { showScreen, type Screen } from "./screen";
import { autosave, type Session } from "./session";

/**
 * The playable combat screen: arena scene on the background canvas, an
 * initiative strip, an action bar, and a scrolling combat log. Holds no
 * combat rules — every legal move, target, chance, and damage figure
 * comes from the engine's legal-option queries, and every chosen action
 * is submitted back through takeAction.
 */

/**
 * Flag holding the dialogue node to resume after the pending encounter
 * resolves in victory; persists across save/load so a reloaded battle
 * still returns to its story beat. Cleared when the fight resolves.
 */
export const COMBAT_RESUME_FLAG = "combat-resume";

/** Default pause between visible enemy AI actions. */
export const ENEMY_STEP_MS = 500;

export interface CombatScreenOptions {
  session: Session;
  encounterId: string;
  /** Dialogue node to resume after a victory, if any. */
  resumeNodeId: string | null;
  /** Pause between enemy actions; 0 runs enemy turns synchronously. */
  enemyDelayMs?: number;
}

type Mode =
  | { kind: "idle" }
  | { kind: "move" }
  | { kind: "attack" }
  | { kind: "ability"; abilityId: string | null }
  | { kind: "item" };

export function createCombatScreen(options: CombatScreenOptions): Screen {
  const { session, encounterId, resumeNodeId } = options;
  const enemyDelayMs = options.enemyDelayMs ?? ENEMY_STEP_MS;

  let root: HTMLElement | null = null;
  let scene: CombatScene | null = null;
  let combat: CombatState | null = null;
  let displayNames: Record<string, string> = {};
  let mode: Mode = { kind: "idle" };
  /** True while enemy turns play out; player input is locked. */
  let busy = false;
  let enemyTimer: ReturnType<typeof setTimeout> | null = null;
  let logIndex = 0;
  let outcomeShown = false;

  let topBar: HTMLElement | null = null;
  let initiativeEl: HTMLElement | null = null;
  let logEl: HTMLElement | null = null;
  let bottomBar: HTMLElement | null = null;
  let statusEl: HTMLElement | null = null;
  let hintEl: HTMLElement | null = null;
  let selectionEl: HTMLElement | null = null;
  let actionBarEl: HTMLElement | null = null;
  let overlayEl: HTMLElement | null = null;

  function nameOf(id: string): string {
    return displayNames[id] ?? getCombatant(combat!, id)?.name ?? id;
  }

  function backToGame(dialogueNodeId: string | null): void {
    showScreen(createGameScreen({ session, dialogueNodeId }));
  }

  /** Clears a stored pending fight so the game screen doesn't relaunch it. */
  function dropEncounter(): void {
    session.state = withoutResumeFlag({
      ...session.state,
      pendingEncounterId: null,
    });
  }

  function playerCanAct(): boolean {
    return (
      combat !== null &&
      combat.status === "active" &&
      !busy &&
      activeCombatant(combat).kind === "player"
    );
  }

  function setHint(text: string): void {
    if (hintEl) hintEl.textContent = text;
  }

  // --- Rendering -------------------------------------------------------

  function renderInitiative(): void {
    if (!initiativeEl || !combat) return;
    initiativeEl.replaceChildren();
    const round = document.createElement("span");
    round.className = "nf-init-round";
    round.textContent = `Round ${combat.round}`;
    initiativeEl.append(round);
    combat.initiativeOrder.forEach((id, index) => {
      const combatant = getCombatant(combat!, id);
      if (!combatant) return;
      const chip = document.createElement("span");
      chip.className = "nf-init-chip";
      if (combatant.kind === "player") chip.classList.add("nf-init-player");
      if (!isAlive(combatant)) chip.classList.add("nf-init-dead");
      if (combat!.status === "active" && index === combat!.turnIndex) {
        chip.classList.add("nf-init-active");
      }
      chip.textContent = nameOf(id);
      initiativeEl!.append(chip);
    });
  }

  function renderStatus(): void {
    if (!statusEl || !combat) return;
    const player = getCombatant(combat, PLAYER_COMBATANT_ID);
    if (!player) return;
    statusEl.replaceChildren();
    const parts = [
      `HP ${Math.max(0, player.hp)}/${player.maxHp}`,
      `Steps left ${combat.moveRemaining}`,
      combat.actionUsed ? "Action spent" : "Action ready",
    ];
    if (busy) parts.push("Enemy turn…");
    for (const text of parts) {
      const span = document.createElement("span");
      span.textContent = text;
      statusEl.append(span);
    }
  }

  function actionButton(
    label: string,
    enabled: boolean,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "nf-button nf-button-small";
    button.textContent = label;
    button.disabled = !enabled;
    button.addEventListener("click", onClick);
    return button;
  }

  function renderActionBar(): void {
    if (!actionBarEl || !combat) return;
    actionBarEl.replaceChildren();
    const canAct = playerCanAct();
    const fleeChance = combat ? fleeChanceFor(combat) : null;
    const entries: Array<[string, boolean, () => void]> = [
      [
        "Attack",
        canAct && attackOptions(combat).length > 0,
        () => switchMode({ kind: "attack" }),
      ],
      [
        "Ability",
        canAct && abilityOptions(combat).some((o) => o.targets.length > 0),
        () => switchMode({ kind: "ability", abilityId: null }),
      ],
      [
        "Item",
        canAct && itemOptions(combat).length > 0,
        () => switchMode({ kind: "item" }),
      ],
      [
        "Move",
        canAct && reachableTiles(combat).length > 0,
        () => switchMode({ kind: "move" }),
      ],
      [
        fleeChance !== null ? `Flee (${percentLabel(fleeChance)})` : "Flee",
        canAct && fleeChance !== null,
        () => apply({ type: "flee" }),
      ],
      ["End Turn", canAct, () => apply({ type: "end-turn" })],
    ];
    for (const [label, enabled, onClick] of entries) {
      actionBarEl.append(actionButton(label, enabled, onClick));
    }
  }

  function selectionButton(
    label: string,
    onClick: () => void,
    enabled = true,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "nf-choice";
    button.textContent = label;
    button.disabled = !enabled;
    button.addEventListener("click", onClick);
    return button;
  }

  function renderSelection(): void {
    if (!selectionEl || !combat) return;
    selectionEl.replaceChildren();
    if (!playerCanAct()) {
      setHint(combat.status === "active" ? "" : "The fight is over.");
      return;
    }
    switch (mode.kind) {
      case "idle":
        setHint("Choose an action.");
        return;
      case "move":
        setHint(
          `Click a highlighted tile to move (${combat.moveRemaining} steps ` +
            "left) — or use the arrow keys. Esc cancels.",
        );
        return;
      case "attack": {
        setHint("Select a target. Esc cancels.");
        for (const option of attackOptions(combat)) {
          selectionEl.append(
            selectionButton(
              `${nameOf(option.targetId)} — ${percentLabel(option.hitChance)} ` +
                `to hit · ${option.damage} dmg`,
              () => apply({ type: "attack", targetId: option.targetId }),
            ),
          );
        }
        return;
      }
      case "ability": {
        const abilities = abilityOptions(combat);
        const selectedId = mode.abilityId;
        if (selectedId === null) {
          setHint("Select an ability. Esc cancels.");
          for (const option of abilities) {
            const ability = getAbility(option.abilityId);
            const name = ability?.name ?? option.abilityId;
            const suffix =
              option.cooldown > 0 ? ` (cooldown ${option.cooldown})` : "";
            selectionEl.append(
              selectionButton(
                `${name}${suffix}`,
                () => {
                  if (option.selfTarget) {
                    apply({
                      type: "use-ability",
                      abilityId: option.abilityId,
                      targetId: PLAYER_COMBATANT_ID,
                    });
                  } else {
                    switchMode({ kind: "ability", abilityId: option.abilityId });
                  }
                },
                option.targets.length > 0,
              ),
            );
          }
          return;
        }
        const selected = abilities.find((o) => o.abilityId === selectedId);
        setHint("Select a target. Esc cancels.");
        for (const target of selected?.targets ?? []) {
          const stun = target.stunTurns > 0 ? ` · stuns ${target.stunTurns}` : "";
          selectionEl.append(
            selectionButton(
              `${nameOf(target.targetId)} — ${target.damage} dmg${stun}`,
              () =>
                apply({
                  type: "use-ability",
                  abilityId: selectedId,
                  targetId: target.targetId,
                }),
            ),
          );
        }
        return;
      }
      case "item": {
        setHint("Select an item. Esc cancels.");
        for (const option of itemOptions(combat)) {
          const item = getItem(option.itemId);
          selectionEl.append(
            selectionButton(
              `${item?.name ?? option.itemId} ×${option.quantity}`,
              () => apply({ type: "use-item", itemId: option.itemId }),
            ),
          );
        }
        return;
      }
    }
  }

  function targetTiles(): TilePoint[] {
    if (!combat || !playerCanAct()) return [];
    if (mode.kind === "attack") {
      return attackOptions(combat)
        .map((o) => getCombatant(combat!, o.targetId)?.position)
        .filter((p): p is GridPosition => p !== undefined);
    }
    if (mode.kind === "ability" && mode.abilityId !== null) {
      const abilityId = mode.abilityId;
      const option = abilityOptions(combat).find(
        (o) => o.abilityId === abilityId,
      );
      return (option?.targets ?? [])
        .map((t) => getCombatant(combat!, t.targetId)?.position)
        .filter((p): p is GridPosition => p !== undefined);
    }
    return [];
  }

  function refreshHighlights(): void {
    if (!scene || !combat) return;
    scene.setHighlights({
      reachable:
        playerCanAct() && mode.kind === "move" ? reachableTiles(combat) : [],
      targets: targetTiles(),
      path: [],
      hover: null,
    });
  }

  function pushEntities(): void {
    if (!scene || !combat) return;
    const activeId =
      combat.status === "active" ? activeCombatant(combat).id : null;
    scene.setEntities(
      combat.combatants.map((c) => ({
        id: c.id,
        spriteId: c.kind === "player" ? ("player" as const) : ("enemy" as const),
        position: { ...c.position },
        hp: Math.max(0, c.hp),
        maxHp: c.maxHp,
        alive: isAlive(c),
        active: c.id === activeId,
      })),
    );
  }

  function appendLogLine(text: string): void {
    if (!logEl) return;
    const line = document.createElement("div");
    line.className = "nf-log-line";
    line.textContent = text;
    logEl.append(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  /** Renders log lines and scene effects for events not yet processed. */
  function processNewEvents(): void {
    if (!combat) return;
    for (; logIndex < combat.log.length; logIndex++) {
      const event = combat.log[logIndex];
      if (!event) continue;
      const text = combatEventText(event, nameOf);
      if (text) appendLogLine(text);
      if (!scene) continue;
      switch (event.type) {
        case "attacked": {
          const tile = getCombatant(combat, event.targetId)?.position;
          if (!tile) break;
          if (event.hit) {
            scene.flashEntity(event.targetId);
            scene.floatText(tile, `-${event.damage}`, "#ff4d5e");
          } else {
            scene.floatText(tile, "MISS", "#8a86a3");
          }
          break;
        }
        case "ability-used": {
          if (event.damage <= 0) break;
          const tile = getCombatant(combat, event.targetId)?.position;
          if (!tile) break;
          scene.flashEntity(event.targetId);
          scene.floatText(tile, `-${event.damage}`, "#ff4d5e");
          break;
        }
        case "healed": {
          const tile = getCombatant(combat, event.combatantId)?.position;
          if (tile) scene.floatText(tile, `+${event.amount}`, "#2ee6d6");
          break;
        }
        case "boosted": {
          const tile = getCombatant(combat, event.combatantId)?.position;
          if (tile) scene.floatText(tile, `+${event.amount}`, "#f0b429");
          break;
        }
        case "flee-attempted": {
          if (event.success) break;
          const tile = getCombatant(combat, event.combatantId)?.position;
          if (tile) scene.floatText(tile, "NO ESCAPE", "#8a86a3");
          break;
        }
        default:
          break;
      }
    }
  }

  function sync(): void {
    processNewEvents();
    pushEntities();
    renderInitiative();
    renderStatus();
    renderActionBar();
    renderSelection();
    refreshHighlights();
    if (combat && combat.status !== "active") showOutcome();
  }

  function switchMode(next: Mode): void {
    mode = next;
    renderSelection();
    refreshHighlights();
  }

  // --- Engine interaction ---------------------------------------------

  function apply(action: CombatAction): void {
    if (!combat || combat.status !== "active" || busy) return;
    try {
      combat = takeAction(combat, action);
    } catch (error) {
      if (error instanceof CombatError) {
        setHint(error.message);
        return;
      }
      throw error;
    }
    // Stay in move mode while budget remains so multi-step moves flow.
    mode =
      action.type === "move" &&
      combat.status === "active" &&
      combat.moveRemaining > 0
        ? { kind: "move" }
        : { kind: "idle" };
    sync();
    maybeRunEnemyPhase();
  }

  function maybeRunEnemyPhase(): void {
    if (
      !combat ||
      busy ||
      combat.status !== "active" ||
      activeCombatant(combat).kind !== "enemy"
    ) {
      return;
    }
    if (enemyDelayMs <= 0) {
      combat = runEnemyTurns(combat);
      sync();
      return;
    }
    busy = true;
    sync();
    const step = (): void => {
      enemyTimer = null;
      if (
        combat &&
        combat.status === "active" &&
        activeCombatant(combat).kind === "enemy"
      ) {
        combat = takeAction(combat, chooseEnemyAction(combat));
        sync();
        enemyTimer = setTimeout(step, enemyDelayMs);
        return;
      }
      busy = false;
      sync();
    };
    enemyTimer = setTimeout(step, enemyDelayMs);
  }

  // --- Scene input -----------------------------------------------------

  function onTileClick(tile: TilePoint): void {
    if (!combat || !playerCanAct()) return;
    if (mode.kind === "move") {
      if (reachableTiles(combat).some((t) => t.x === tile.x && t.y === tile.y)) {
        apply({ type: "move", to: { x: tile.x, y: tile.y } });
      }
      return;
    }
    if (mode.kind === "attack" || (mode.kind === "ability" && mode.abilityId)) {
      const target = combat.combatants.find(
        (c) =>
          isAlive(c) && c.position.x === tile.x && c.position.y === tile.y,
      );
      if (!target) return;
      if (mode.kind === "attack") {
        if (attackOptions(combat).some((o) => o.targetId === target.id)) {
          apply({ type: "attack", targetId: target.id });
        }
        return;
      }
      const abilityId = mode.abilityId;
      const option = abilityOptions(combat).find(
        (o) => o.abilityId === abilityId,
      );
      if (abilityId && option?.targets.some((t) => t.targetId === target.id)) {
        apply({ type: "use-ability", abilityId, targetId: target.id });
      }
    }
  }

  function onTileHover(tile: TilePoint | null): void {
    if (!scene || !combat) return;
    if (!playerCanAct() || mode.kind !== "move" || tile === null) {
      scene.setHighlights({ hover: tile, path: [] });
      return;
    }
    const reachable = reachableTiles(combat).some(
      (t) => t.x === tile.x && t.y === tile.y,
    );
    const player = getCombatant(combat, PLAYER_COMBATANT_ID);
    scene.setHighlights({
      hover: tile,
      path:
        reachable && player ? manhattanPath(player.position, tile) : [],
    });
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      switchMode({ kind: "idle" });
      return;
    }
    if (!combat || !playerCanAct()) return;
    const deltas: Record<string, GridPosition> = {
      ArrowRight: { x: 1, y: 0 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowDown: { x: 0, y: 1 },
      ArrowUp: { x: 0, y: -1 },
    };
    const delta = deltas[event.key];
    if (!delta) return;
    const player = getCombatant(combat, PLAYER_COMBATANT_ID);
    if (!player) return;
    const to = { x: player.position.x + delta.x, y: player.position.y + delta.y };
    if (reachableTiles(combat).some((t) => t.x === to.x && t.y === to.y)) {
      event.preventDefault();
      apply({ type: "move", to });
    }
  }

  // --- Outcome ---------------------------------------------------------

  function withoutResumeFlag(state: GameState): GameState {
    const { [COMBAT_RESUME_FLAG]: _resume, ...flags } = state.flags;
    return { ...state, flags };
  }

  function outcomePanel(title: string): {
    overlay: HTMLElement;
    panel: HTMLElement;
  } {
    overlayEl?.remove();
    const overlay = document.createElement("div");
    overlay.className = "nf-overlay nf-overlay-center";
    const panel = document.createElement("div");
    panel.className = "nf-panel nf-combat-outcome";
    const heading = document.createElement("h2");
    heading.textContent = title;
    panel.append(heading);
    overlay.append(panel);
    overlayEl = overlay;
    root?.append(overlay);
    return { overlay, panel };
  }

  function panelButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "nf-button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function showOutcome(): void {
    if (!combat || combat.status === "active" || outcomeShown) return;
    outcomeShown = true;
    session.state = withoutResumeFlag(resolveCombat(session.state, combat));

    if (combat.status === "victory") {
      const { panel } = outcomePanel("Victory");
      const rewards = getEncounter(encounterId)?.rewards;
      const list = document.createElement("div");
      list.className = "nf-reward-list";
      const lines = [
        ...(rewards && rewards.credits > 0 ? [`+${rewards.credits} cr`] : []),
        ...(rewards?.items ?? []).map((reward) => {
          const name = getItem(reward.itemId)?.name ?? reward.itemId;
          const quantity = reward.quantity ?? 1;
          return quantity > 1 ? `${name} ×${quantity}` : name;
        }),
      ];
      for (const text of lines.length > 0 ? lines : ["No spoils this time."]) {
        const line = document.createElement("div");
        line.className = "nf-reward-line";
        line.textContent = text;
        list.append(line);
      }
      panel.append(list);
      panel.append(panelButton("Continue", () => backToGame(resumeNodeId)));
      return;
    }

    if (combat.status === "fled") {
      const { panel } = outcomePanel("Clean Break");
      const note = document.createElement("p");
      note.className = "nf-dim";
      note.textContent =
        "You break contact and melt back into Cinder Row. Word of it will " +
        "travel.";
      panel.append(note, panelButton("Return", () => backToGame(null)));
      return;
    }

    showDefeatPanel();
  }

  /** Separate from showOutcome so closing the save list can re-show it
   * without resolving the combat a second time. */
  function showDefeatPanel(): void {
    const { panel } = outcomePanel("Flatlined");
    const note = document.createElement("p");
    note.className = "nf-dim";
    note.textContent =
      "The Sprawl goes dark. Load a save to pick the thread back up.";
    const message = document.createElement("p");
    message.className = "nf-message nf-error";
    const menu = document.createElement("div");
    menu.className = "nf-menu";
    menu.append(
      panelButton("Load Autosave", () => {
        try {
          session.state = loadGame("autosave", session.storage);
          showScreen(createGameScreen({ session }));
        } catch (error) {
          message.textContent =
            error instanceof SaveError
              ? saveErrorMessage(error)
              : "Could not load the autosave.";
        }
      }),
      panelButton("Load Game", () => {
        if (!overlayEl) return;
        overlayEl.replaceChildren();
        const savesPanel = createSaveLoadPanel({
          mode: "menu",
          storage: session.storage,
          onLoaded(state) {
            session.state = state;
            showScreen(createGameScreen({ session }));
          },
          onClose: showDefeatPanel,
        });
        overlayEl.append(savesPanel.el);
      }),
      panelButton("Main Menu", () => showScreen(createMainMenuScreen())),
    );
    panel.append(note, message, menu);
  }

  // --- Screen lifecycle ------------------------------------------------

  return {
    mount(mountRoot: HTMLElement): void {
      root = mountRoot;
      root.style.pointerEvents = "none";

      const canvas = document.getElementById("iso-canvas");
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Missing #iso-canvas element");
      }
      const encounter = getEncounter(encounterId);
      if (!encounter) {
        console.error(`Unknown encounter id "${encounterId}"`);
        dropEncounter();
        backToGame(null);
        return;
      }

      // Build the fight before persisting anything, so bad content
      // (missing enemies, missing arena map) degrades back to the map
      // screen instead of autosaving a fight that can never start.
      let arenaMap: IsoMap;
      try {
        combat = createCombat(session.state, encounterId);
        arenaMap = requireMap(encounter.arenaMapId);
      } catch (error) {
        console.error(`Could not start encounter "${encounterId}":`, error);
        combat = null;
        dropEncounter();
        backToGame(null);
        return;
      }
      displayNames = combatantDisplayNames(combat.combatants);

      // Mark the encounter pending (with its resume point) and autosave,
      // so a reload mid-battle re-enters this fight from the game screen.
      session.state = {
        ...session.state,
        pendingEncounterId: encounterId,
        flags: {
          ...session.state.flags,
          [COMBAT_RESUME_FLAG]: resumeNodeId ?? false,
        },
      };
      autosave(session);
      scene = createCombatScene(canvas, {
        map: arenaMap,
        onTileClick,
        onTileHover,
      });

      topBar = document.createElement("div");
      topBar.className = "nf-combat-top";
      const title = document.createElement("div");
      title.className = "nf-combat-title";
      title.textContent = encounter.name;
      initiativeEl = document.createElement("div");
      initiativeEl.className = "nf-initiative";
      topBar.append(title, initiativeEl);
      root.append(topBar);

      logEl = document.createElement("div");
      logEl.className = "nf-combat-log";
      root.append(logEl);

      bottomBar = document.createElement("div");
      bottomBar.className = "nf-combat-bottom";
      statusEl = document.createElement("div");
      statusEl.className = "nf-combat-status";
      hintEl = document.createElement("p");
      hintEl.className = "nf-combat-hint";
      selectionEl = document.createElement("div");
      selectionEl.className = "nf-combat-selection";
      actionBarEl = document.createElement("div");
      actionBarEl.className = "nf-action-bar";
      bottomBar.append(statusEl, hintEl, selectionEl, actionBarEl);
      root.append(bottomBar);

      window.addEventListener("keydown", onKeyDown);

      sync();
      // Enemies with higher initiative open the fight.
      maybeRunEnemyPhase();
    },

    unmount(): void {
      if (enemyTimer) {
        clearTimeout(enemyTimer);
        enemyTimer = null;
      }
      window.removeEventListener("keydown", onKeyDown);
      scene?.destroy();
      scene = null;
      topBar?.remove();
      logEl?.remove();
      bottomBar?.remove();
      overlayEl?.remove();
      topBar = null;
      initiativeEl = null;
      logEl = null;
      bottomBar = null;
      statusEl = null;
      hintEl = null;
      selectionEl = null;
      actionBarEl = null;
      overlayEl = null;
      if (root) {
        root.style.pointerEvents = "";
        root = null;
      }
    },
  };
}
