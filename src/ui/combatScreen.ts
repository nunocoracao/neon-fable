import {
  CombatError,
  PLAYER_COMBATANT_ID,
  abilityOptions,
  activeCombatant,
  attackOptions,
  chooseEnemyAction,
  createCombat,
  getCombatant,
  isAlive,
  isGlancingBlow,
  itemOptions,
  manhattanPath,
  reachableTiles,
  resolveCombat,
  runEnemyTurns,
  takeAction,
  type CombatAction,
  type CombatActionKind,
  type Combatant,
  type CombatEvent,
  type CombatState,
  type GridPosition,
} from "../combat";
import { defaultAppearance } from "../character";
import { emptyEquipment } from "../inventory";
import { audio, hitSoundForDamage } from "../audio";
import {
  getAbility,
  getEncounter,
  getEnemy,
  getItem,
  getMap,
  requireMap,
} from "../data";
import {
  createCombatScene,
  createPixelArtSprites,
  statusFamilies,
  type CombatScene,
  type DeathReactionKind,
  type StatusFamilyId,
} from "../iso";
import {
  eventPopups,
  statusPopups,
  type CombatPopup,
  type PopupContext,
} from "./combatPopups";
import {
  actionForHotkey,
  actionButtons,
  initiativeChips,
  targetCard,
  type ActionButton,
  type InitiativeChip,
  type TargetCard,
} from "./combatHud";
import {
  createActionBar,
  createInitiativeRail,
  createTargetCard,
  type HudView,
  type InitiativeRailModel,
} from "./combatHudView";
import { enemyDeathStyle, enemySpriteSource } from "./entitySprites";
import { playerSpriteSource } from "./playerSprite";
import { portraitCanvas, visualPortraitCanvas } from "./portraits";
import type { DayPhaseId, IsoMap, TilePoint } from "../iso";
import { SaveError, loadGame, type GameState } from "../state";
import { focusFirst, installListNav } from "./focus";
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
  /**
   * Hour to fight under, when a story beat had the scene staged at one.
   * Absent falls back to the hour of the map the fight was entered
   * from — an arena has no clock of its own. Visual only.
   */
  dayPhase?: DayPhaseId;
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
  /**
   * The conditions each combatant was last seen under. The engine owns
   * them; this only remembers the previous reading so a change can be
   * announced over the body it happened to (see statusPopups).
   */
  let lastStatuses: ReadonlyMap<string, readonly StatusFamilyId[]> = new Map();
  /**
   * The beat the last blow processed this pass lands on. A condition is
   * true of a body the instant the engine says so, but what *put* it
   * there is still crossing the arena — so the label waits for the
   * effect that caused it instead of beating it there. Spent by the
   * push that follows, and zero when nothing was thrown.
   */
  let conditionBeatMs = 0;

  /**
   * The body the target card is describing: whatever the pointer is
   * over (a tile, a chip, a target button), falling back to the first
   * legal target while a targeting mode is open — opening Attack should
   * put something in the card, not leave a gap where one goes.
   */
  let hoverTargetId: string | null = null;

  let topBar: HTMLElement | null = null;
  let logEl: HTMLElement | null = null;
  let bottomBar: HTMLElement | null = null;
  let statusEl: HTMLElement | null = null;
  let hintEl: HTMLElement | null = null;
  let selectionEl: HTMLElement | null = null;
  let overlayEl: HTMLElement | null = null;
  let rail: HudView<InitiativeRailModel> | null = null;
  let actionBar: HudView<readonly ActionButton[]> | null = null;
  let targetCardView: HudView<TargetCard | null> | null = null;

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

  /**
   * The portrait for one combatant, from the same appearance data its
   * sprite is composed from: the player's live look, an enemy's
   * authored archetype visual. Enemies wear the grim variant — a chip
   * in an initiative rail is a face across a fight, not a conversation.
   */
  function combatantPortrait(
    view: { kind: "player" | "enemy"; enemyId: string | null },
  ): HTMLCanvasElement {
    if (view.kind === "player") {
      const { appearance, equipment } = session.state.player;
      return portraitCanvas(appearance, equipment);
    }
    const visual = getEnemy(view.enemyId ?? "")?.visual;
    return visual
      ? visualPortraitCanvas(visual, "grim")
      : portraitCanvas(defaultAppearance(), emptyEquipment(), "grim");
  }

  function renderInitiative(): void {
    if (!rail || !combat) return;
    rail.update({
      round: combat.round,
      chips: initiativeChips(combat, displayNames),
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

  function renderActionBar(): void {
    if (!actionBar || !combat) return;
    actionBar.update(actionButtons(combat, { busy }));
  }

  /** Runs an action-bar button: a mode to enter, or an action to submit. */
  function invokeAction(kind: CombatActionKind): void {
    if (!combat || !playerCanAct()) return;
    switch (kind) {
      case "attack":
        switchMode({ kind: "attack" });
        return;
      case "ability":
        switchMode({ kind: "ability", abilityId: null });
        return;
      case "item":
        switchMode({ kind: "item" });
        return;
      case "move":
        switchMode({ kind: "move" });
        return;
      case "flee":
        apply({ type: "flee" });
        return;
      case "end-turn":
        apply({ type: "end-turn" });
        return;
    }
  }

  function selectionButton(
    label: string,
    onClick: () => void,
    enabled = true,
    targetId: string | null = null,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "nf-choice";
    button.textContent = label;
    button.disabled = !enabled;
    button.addEventListener("click", onClick);
    // A target button inspects what it would hit, by pointer or by tab.
    if (targetId !== null) {
      const show = (): void => inspect(targetId);
      const clear = (): void => inspect(null);
      button.addEventListener("mouseenter", show);
      button.addEventListener("focus", show);
      button.addEventListener("mouseleave", clear);
      button.addEventListener("blur", clear);
    }
    return button;
  }

  /** Points the target card at a body (or lets it fall back). */
  function inspect(combatantId: string | null): void {
    hoverTargetId = combatantId;
    renderTargetCard();
  }

  /**
   * The body the card describes when nothing is being pointed at: the
   * first thing the open targeting mode could hit, so choosing a target
   * always has its stats on screen beside the choice.
   */
  function fallbackTargetId(): string | null {
    if (!combat || !playerCanAct()) return null;
    if (mode.kind === "attack") {
      return attackOptions(combat)[0]?.targetId ?? null;
    }
    if (mode.kind === "ability" && mode.abilityId !== null) {
      const abilityId = mode.abilityId;
      const option = abilityOptions(combat).find(
        (o) => o.abilityId === abilityId,
      );
      return option?.targets[0]?.targetId ?? null;
    }
    return null;
  }

  function renderTargetCard(): void {
    if (!targetCardView || !combat) return;
    targetCardView.update(
      targetCard(combat, hoverTargetId ?? fallbackTargetId(), displayNames),
    );
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
              true,
              option.targetId,
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
              true,
              target.targetId,
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

  /** How a combatant dies on screen; the player is always a body. */
  function deathStyleFor(c: Combatant): DeathReactionKind {
    return c.kind === "player" ? "collapse" : enemyDeathStyle(c.enemyId);
  }

  function pushEntities(): void {
    if (!scene || !combat) return;
    const activeId =
      combat.status === "active" ? activeCombatant(combat).id : null;
    // What is still true of each body: the engine's own conditions,
    // grouped into marker families by the scene's status rules.
    const statuses = new Map<string, readonly StatusFamilyId[]>(
      combat.combatants.map((c) => [
        c.id,
        statusFamilies({
          stunTurns: c.stunTurns,
          boostStats: c.boosts.map((b) => b.stat),
        }),
      ]),
    );
    scene.setEntities(
      combat.combatants.map((c) => ({
        id: c.id,
        // Enemy archetype ids key the composed look via enemySpriteSource.
        spriteId: c.kind === "player" ? "player" : c.enemyId ?? "enemy",
        position: { ...c.position },
        hp: Math.max(0, c.hp),
        maxHp: c.maxHp,
        alive: isAlive(c),
        active: c.id === activeId,
        // Reactions landing on one beat queue in initiative order.
        order: combat!.initiativeOrder.indexOf(c.id),
        deathStyle: deathStyleFor(c),
        statuses: statuses.get(c.id) ?? [],
      })),
    );
    // A condition that just landed — or just lifted — says so over the
    // body it happened to, on the beat whatever caused it arrives.
    showPopups(statusPopups(lastStatuses, statuses), conditionBeatMs);
    conditionBeatMs = 0;
    lastStatuses = statuses;
  }

  /** Float readouts over the bodies they belong to; missing ones drop. */
  function showPopups(popups: readonly CombatPopup[], delayMs = 0): void {
    if (!scene || !combat || popups.length === 0) return;
    for (const popup of popups) {
      const tile = getCombatant(combat, popup.combatantId)?.position;
      if (!tile) continue;
      scene.popup({ tile, kind: popup.kind, text: popup.text, delayMs });
    }
  }

  /**
   * What the styling of a blow's figure reads: the plating that stood
   * in its way and the frame it landed on. Damage that goes straight
   * through plating faces none, however much there was.
   */
  function popupContext(event: CombatEvent): PopupContext {
    if (!combat) return {};
    if (event.type !== "attacked" && event.type !== "ability-used") return {};
    const target = getCombatant(combat, event.targetId);
    if (!target) return {};
    if (event.type === "attacked") {
      return { target: { armor: target.armor, maxHp: target.maxHp } };
    }
    const effect = getAbility(event.abilityId)?.effect;
    const ignoresArmor = effect?.type === "damage" && effect.ignoresArmor === true;
    return {
      target: { armor: ignoresArmor ? 0 : target.armor, maxHp: target.maxHp },
    };
  }

  function appendLogLine(text: string): void {
    if (!logEl) return;
    const line = document.createElement("div");
    line.className = "nf-log-line";
    line.textContent = text;
    logEl.append(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function playEventSfx(event: CombatEvent): void {
    switch (event.type) {
      case "attacked":
        audio.play("attack-swing");
        audio.play(event.hit ? hitSoundForDamage(event.damage) : "attack-miss");
        break;
      case "ability-used":
        audio.play("ability-use");
        if (event.damage > 0) audio.play(hitSoundForDamage(event.damage));
        break;
      case "item-used":
        audio.play("item-use");
        break;
      case "defeated":
        if (event.combatantId !== PLAYER_COMBATANT_ID) {
          audio.play("enemy-defeat");
        }
        break;
      default:
        break;
    }
  }

  /**
   * Renders log lines and scene effects for events not yet processed.
   * The floating readouts ride the same pass: each event's own beat is
   * what its figure waits for, and the text of that figure is derived
   * from the event alone (see ./combatPopups.ts) — the log line and the
   * number over the body are one figure, said twice.
   */
  function processNewEvents(): void {
    if (!combat) return;
    for (; logIndex < combat.log.length; logIndex++) {
      const event = combat.log[logIndex];
      if (!event) continue;
      const text = combatEventText(event, nameOf);
      if (text) appendLogLine(text);
      playEventSfx(event);
      if (!scene) continue;
      /** Ms until the blow this event describes actually lands. */
      let beatMs = 0;
      switch (event.type) {
        // The scene reports how long its attack animation takes to
        // connect; the reactions ride that beat so the flash and the
        // number land with the blow instead of ahead of it.
        case "attacked": {
          const target = getCombatant(combat, event.targetId);
          if (!target) break;
          // A miss still gets its whole sequence — the shot goes wide
          // and chips the arena a tile past whoever it was aimed at.
          beatMs = scene.attackFx(event.attackerId, event.targetId, {
            hit: event.hit,
          });
          if (event.hit) {
            scene.hitFx(event.targetId, {
              attackerId: event.attackerId,
              delayMs: beatMs,
              glancing: isGlancingBlow(event.damage, target.armor),
            });
          }
          break;
        }
        // Abilities play the archetype their content names, never a
        // look picked out by id here: the scene is handed the effectRef
        // and resolves the rest (see src/iso/abilityFx.ts). Every ability
        // goes through this — a self-buff has no damage to show, but it
        // still lights up.
        case "ability-used": {
          const target = getCombatant(combat, event.targetId);
          const ability = getAbility(event.abilityId);
          if (!target || !ability) break;
          beatMs = scene.abilityFx(
            event.combatantId,
            [event.targetId],
            ability.effectRef,
          );
          if (event.damage <= 0) break;
          // An ability that goes through plating is never a glancing
          // blow, however much plating there was.
          const effect = ability.effect;
          const armor =
            effect.type === "damage" && effect.ignoresArmor === true
              ? 0
              : target.armor;
          scene.hitFx(event.targetId, {
            attackerId: event.combatantId,
            delayMs: beatMs,
            glancing: isGlancingBlow(event.damage, armor),
          });
          break;
        }
        default:
          break;
      }
      // Whatever the event was worth as a readout, floated on the beat
      // its own blow lands on — so a rifle's figure appears when the
      // round arrives, and a heal, which nothing has to reach, at once.
      showPopups(eventPopups(event, popupContext(event)), beatMs);
      // Conditions the same blow left ride the same beat (see above).
      if (beatMs > 0) conditionBeatMs = beatMs;
    }
  }

  function sync(): void {
    processNewEvents();
    pushEntities();
    renderInitiative();
    renderStatus();
    renderActionBar();
    renderSelection();
    renderTargetCard();
    refreshHighlights();
    if (combat && combat.status !== "active") showOutcome();
  }

  function switchMode(next: Mode): void {
    mode = next;
    // A new mode targets new bodies; whatever was under the pointer in
    // the old one is not what the card should be describing.
    hoverTargetId = null;
    renderSelection();
    renderTargetCard();
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
    // Pointing anywhere in the arena inspects whoever is standing there,
    // in or out of a targeting mode — the card is how you read a body.
    inspect(
      tile === null
        ? null
        : combat.combatants.find(
            (c) =>
              isAlive(c) && c.position.x === tile.x && c.position.y === tile.y,
          )?.id ?? null,
    );
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
    // Number keys run the action bar, in the order the bar shows them.
    const hotkeyAction = actionForHotkey(event.key);
    if (hotkeyAction !== null) {
      const button = actionButtons(combat, { busy }).find(
        (b) => b.kind === hotkeyAction,
      );
      if (button?.enabled) {
        event.preventDefault();
        invokeAction(hotkeyAction);
      }
      return;
    }
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
    installListNav(overlay);
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
      audio.setMusicContext(null);
      audio.play("victory");
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
      focusFirst(panel);
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
      focusFirst(panel);
      return;
    }

    audio.setMusicContext(null);
    audio.play("defeat");
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
    focusFirst(panel);
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
      audio.setMusicContext("combat");
      scene = createCombatScene(canvas, {
        map: arenaMap,
        sprites: createPixelArtSprites({
          player: playerSpriteSource(session),
          entity: enemySpriteSource(),
        }),
        // A fight happens under the sky — and at the hour — of the
        // place it started in: the arena inherits both from the map the
        // player walked from, with a story beat's staged hour, if there
        // was one, taking precedence over that map's own.
        weather: getMap(session.state.location)?.weather,
        dayPhase:
          options.dayPhase ?? getMap(session.state.location)?.dayPhase,
        onTileClick,
        onTileHover,
      });

      topBar = document.createElement("div");
      topBar.className = "nf-combat-top";
      const title = document.createElement("div");
      title.className = "nf-combat-title";
      title.textContent = encounter.name;
      rail = createInitiativeRail({
        portrait: (chip: InitiativeChip) => combatantPortrait(chip),
        onHover: inspect,
      });
      topBar.append(title, rail.el);
      root.append(topBar);

      logEl = document.createElement("div");
      logEl.className = "nf-combat-log";
      root.append(logEl);

      targetCardView = createTargetCard({
        portrait: (card: TargetCard) => combatantPortrait(card),
      });
      root.append(targetCardView.el);

      bottomBar = document.createElement("div");
      bottomBar.className = "nf-combat-bottom";
      statusEl = document.createElement("div");
      statusEl.className = "nf-combat-status";
      hintEl = document.createElement("p");
      hintEl.className = "nf-combat-hint";
      selectionEl = document.createElement("div");
      selectionEl.className = "nf-combat-selection";
      actionBar = createActionBar({ onInvoke: invokeAction });
      bottomBar.append(statusEl, hintEl, selectionEl, actionBar.el);
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
      targetCardView?.el.remove();
      overlayEl?.remove();
      topBar = null;
      logEl = null;
      bottomBar = null;
      statusEl = null;
      hintEl = null;
      selectionEl = null;
      overlayEl = null;
      rail = null;
      actionBar = null;
      targetCardView = null;
      hoverTargetId = null;
      if (root) {
        root.style.pointerEvents = "";
        root = null;
      }
    },
  };
}
