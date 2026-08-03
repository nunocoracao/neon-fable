import {
  CombatError,
  PLAYER_COMBATANT_ID,
  abilityOptions,
  activeCombatant,
  assistedHoverTile,
  attackOptions,
  chooseEnemyAction,
  combatantAt,
  createCombat,
  footprintCenter,
  getCombatant,
  isAlive,
  effectiveArmor,
  isGlancingBlow,
  isPlayerControlled,
  isSurgeArmed,
  itemOptions,
  reachableTiles,
  resolveCombat,
  runEnemyTurns,
  takeAction,
  telegraphHover,
  telegraphTargetAt,
  telegraphTiles,
  type CombatAction,
  type CombatActionKind,
  type Combatant,
  type CombatEvent,
  type CombatantKind,
  type CombatState,
  type GridPosition,
  type TelegraphIntent,
} from "../combat";
import { audio, musicScene, themeForMap } from "../audio";
import {
  getAbility,
  getEncounter,
  companionSpriteId,
  enemySpriteId,
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
import { impactWeight, turnFocus } from "./combatFeel";
import {
  eventPopups,
  statusPopups,
  type CombatPopup,
  type PopupContext,
} from "./combatPopups";
import {
  actionForHotkey,
  actionButtons,
  idleHintText,
  initiativeChips,
  staticSurgeWarning,
  targetCard,
  telegraphChip,
  telegraphTileViews,
  type ActionButton,
  type InitiativeChip,
  type TargetCard,
  type TelegraphChip,
} from "./combatHud";
import {
  createActionBar,
  createInitiativeRail,
  createTargetCard,
  createTelegraphChip,
  type HudView,
  type InitiativeRailModel,
  type TelegraphChipAnchor,
} from "./combatHudView";
import {
  companionSpriteSource,
  enemyDeathStyle,
  enemySpriteSource,
} from "./entitySprites";
import { playerSpriteSource } from "./playerSprite";
import {
  companionPortraitCanvas,
  enemyPortraitCanvas,
  portraitCanvas,
} from "./portraits";
import type { DayPhaseId, IsoMap, TilePoint } from "../iso";
import { settings, telegraphPaletteFor } from "../settings";
import { SaveError, assistOn, loadGame, type GameState } from "../state";
import { COMBAT_HINT_BUDGET } from "../narrative/hints";
import { createHintLayer, type HintLayerHandle } from "./hintLayer";
import { focusFirst, installListNav } from "./focus";
import {
  combatEventText,
  combatantDisplayNames,
  companionName,
  consumableOutcomeText,
  injuryLine,
  percentLabel,
  saveErrorMessage,
  stepsLabel,
} from "./format";
import { createGameScreen } from "./gameScreen";
import { createMainMenuScreen } from "./mainMenu";
import { createSaveLoadPanel } from "./saveLoad";
import { showScreen, type Screen } from "./screen";
import { autosave, type Session } from "./session";
import { t } from "./strings";

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
  // One entity source for the whole arena: a companion's composed look
  // when the id names one, an enemy archetype's otherwise.
  const companionArt = companionSpriteSource();
  const enemyArt = enemySpriteSource();
  const allySpriteSource = (id: string) => companionArt(id) ?? enemyArt(id);
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
   * The combatant the camera was last pointed at. A turn start is a
   * change of this and nothing else — every other sync leaves the
   * framing alone.
   */
  let focusedId: string | null = null;

  /**
   * The body the target card is describing: whatever the pointer is
   * over (a tile, a chip, a target button), falling back to the first
   * legal target while a targeting mode is open — opening Attack should
   * put something in the card, not leave a gap where one goes.
   */
  let hoverTargetId: string | null = null;
  /**
   * The tile under the pointer and where the pointer is on screen. The
   * telegraph is recomputed from these on every sync, so the tints and
   * the outcome chip follow the fight as it changes under a still
   * cursor — not only when the cursor moves.
   */
  let hoverTile: GridPosition | null = null;
  let hoverAt: { x: number; y: number } | null = null;

  let topBar: HTMLElement | null = null;
  let logEl: HTMLElement | null = null;
  let bottomBar: HTMLElement | null = null;
  let statusEl: HTMLElement | null = null;
  let hintEl: HTMLElement | null = null;
  let selectionEl: HTMLElement | null = null;
  let overlayEl: HTMLElement | null = null;
  let hintLayer: HintLayerHandle | null = null;
  let rail: HudView<InitiativeRailModel> | null = null;
  let actionBar: HudView<readonly ActionButton[]> | null = null;
  let targetCardView: HudView<TargetCard | null> | null = null;
  let telegraphChipView: HudView<{
    chip: TelegraphChip | null;
    at: TelegraphChipAnchor | null;
  }> | null = null;

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

  /**
   * Whether the player may act right now. True on their character's
   * turn *and* on a companion's: an ally is a unit the player plays,
   * through this same bar, these same modes, and the same engine
   * queries — the only thing that changes is whose turn is being spent.
   */
  function playerCanAct(): boolean {
    return (
      combat !== null &&
      combat.status === "active" &&
      !busy &&
      isPlayerControlled(activeCombatant(combat))
    );
  }

  function setHint(text: string): void {
    if (hintEl) hintEl.textContent = text;
  }

  // --- Rendering -------------------------------------------------------

  /**
   * The portrait for one combatant, from the same appearance data its
   * sprite is composed from: the player's live look, a companion's
   * authored look, an enemy's archetype visual. Enemies wear the grim
   * variant — a chip in an initiative rail is a face across a fight,
   * not a conversation.
   */
  function combatantPortrait(view: {
    kind: CombatantKind;
    enemyId: string | null;
    companionId: string | null;
    lookId: string | null;
    lookIndex: number | null;
  }): HTMLCanvasElement {
    if (view.kind === "player") {
      const { appearance, equipment } = session.state.player;
      return portraitCanvas(appearance, equipment);
    }
    // A companion's face comes off their party record's look — the
    // same visual their sprite on the board is composed from.
    if (view.kind === "ally") {
      return companionPortraitCanvas(view.companionId, view.lookId);
    }
    // The face on the chip is the face on the board: the archetype's
    // look family record this body was spawned in, or an authored
    // portrait for whatever was never a person.
    return enemyPortraitCanvas(view.enemyId, view.lookIndex ?? 0, "grim");
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
    // Whoever the player is currently playing: their own character, or
    // the companion whose turn it is. The steps and the action on this
    // row belong to that body, so the hp beside them must too.
    const acting =
      combat.status === "active" && isPlayerControlled(activeCombatant(combat))
        ? activeCombatant(combat)
        : getCombatant(combat, PLAYER_COMBATANT_ID);
    if (!acting) return;
    statusEl.replaceChildren();
    const parts = [
      acting.kind === "ally"
        ? `${nameOf(acting.id)} — HP ${Math.max(0, acting.hp)}/${acting.maxHp}`
        : `HP ${Math.max(0, acting.hp)}/${acting.maxHp}`,
      t("combat.status.steps", { steps: combat.moveRemaining }),
      combat.actionUsed
        ? t("combat.status.actionSpent")
        : t("combat.status.actionReady"),
    ];
    if (busy) parts.push(t("combat.status.enemyTurn"));
    for (const text of parts) {
      const span = document.createElement("span");
      span.textContent = text;
      statusEl.append(span);
    }
    // The chrome, when there is chrome to warn about. Last on the row
    // and marked, because it is the only thing here that is a
    // countdown rather than a reading.
    const surge = staticSurgeWarning(combat);
    if (surge !== null) {
      const span = document.createElement("span");
      span.className = isSurgeArmed(combat)
        ? "nf-combat-static nf-combat-static-armed"
        : "nf-combat-static";
      span.textContent = surge;
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
      setHint(combat.status === "active" ? "" : t("combat.blocked.over"));
      return;
    }
    switch (mode.kind) {
      case "idle":
        setHint(idleHintText(combat));
        // A turn the player can actually spend is the moment the bar is
        // worth explaining; the budget spreads the tour over fights.
        hintLayer?.cue("combat-turn");
        if (abilityOptions(combat).length > 0) hintLayer?.cue("combat-ability");
        return;
      case "move":
        setHint(
          t("combat.select.move", {
            steps: stepsLabel(combat.moveRemaining),
          }),
        );
        return;
      case "attack": {
        setHint(t("combat.select.target"));
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
          setHint(t("combat.select.ability"));
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
                      // Self-buffs land on whoever is acting — the
                      // player, or the companion being played.
                      targetId: activeCombatant(combat!).id,
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
        setHint(t("combat.select.target"));
        for (const target of selected?.targets ?? []) {
          const stun =
            target.stunTurns > 0
              ? t("combat.tip.ability.stun", { turns: target.stunTurns })
              : "";
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
        setHint(t("combat.select.item"));
        for (const option of itemOptions(combat)) {
          const item = getItem(option.itemId);
          // The preview on the button is the outcome the engine is
          // about to apply, not a re-reading of the item's data.
          selectionEl.append(
            selectionButton(
              `${item?.name ?? option.itemId} ×${option.quantity} — ` +
                `${consumableOutcomeText(option.outcome)}`,
              () => apply({ type: "use-item", itemId: option.itemId }),
            ),
          );
        }
        return;
      }
    }
  }

  /**
   * The open action, as the telegraph reads it. An ability with no
   * ability picked yet telegraphs nothing — there is no reach to show
   * until the player has said which one.
   */
  function telegraphIntent(): TelegraphIntent {
    if (!playerCanAct()) return { kind: "none" };
    switch (mode.kind) {
      case "move":
        return { kind: "move" };
      case "attack":
        return { kind: "attack" };
      case "ability":
        return mode.abilityId === null
          ? { kind: "none" }
          : { kind: "ability", abilityId: mode.abilityId };
      default:
        return { kind: "none" };
    }
  }

  /**
   * Repaints every telegraph layer from the open intent and whatever
   * the pointer is over: the tinted tiles, the dotted walk, and the
   * outcome chip. One pass — the engine resolves all three from the
   * same hover, so they can never describe different tiles.
   */
  function refreshHighlights(): void {
    if (!scene || !combat) return;
    const intent = telegraphIntent();
    // Pointing at nothing, with an action open and the assist on, is
    // read as pointing at the body the action bar already calls the aim
    // worth taking (see assistedHoverTile). Everything downstream is
    // the ordinary hover path — same tiles, same figures, same chip —
    // so the assist adds a subject and changes nothing else.
    const assisted =
      hoverTile === null && assistOn(session.state.rules, "always-preview")
        ? assistedHoverTile(combat, intent)
        : null;
    const tile = hoverTile ?? assisted;
    const hover = tile === null ? null : telegraphHover(combat, intent, tile);
    scene.setHighlights({
      tiles: telegraphTileViews(telegraphTiles(combat, intent, hover)),
      // Drawn from the walker's own feet through the previewed steps.
      pathLine:
        hover && hover.path.length > 0
          ? [activeCombatant(combat).position, ...hover.path]
          : [],
      hover: tile,
    });
    telegraphChipView?.update({
      chip: telegraphChip(combat, intent, hover, displayNames),
      // The pointer's own position, or — with no pointer — over the
      // body the assist picked out.
      at: hoverAt ?? (assisted ? scene.tileAnchor(assisted) : null),
    });
  }

  /** How a combatant goes down on screen; people crumple. */
  function deathStyleFor(c: Combatant): DeathReactionKind {
    return c.kind === "enemy" ? enemyDeathStyle(c.enemyId) : "collapse";
  }

  /**
   * The art id a body on the board draws under: the player's own live
   * look, a companion's authored look, or the enemy archetype-plus-look
   * pair. All three resolve through the scene's sprite provider, which
   * is why an ally needed no new drawing code.
   */
  function entitySpriteIdFor(c: Combatant): string {
    if (c.kind === "player") return "player";
    if (c.kind === "ally") {
      return companionSpriteId(c.companionId ?? "", c.lookId ?? "");
    }
    return enemySpriteId(c.enemyId ?? "enemy", c.lookIndex ?? 0);
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
          charging: c.charge != null,
        }),
      ]),
    );
    scene.setEntities(
      combat.combatants.map((c) => ({
        id: c.id,
        // Enemy sprite ids (archetype + look) key the art through
        // enemySpriteSource, which resolves the archetype's sprite kind.
        spriteId: entitySpriteIdFor(c),
        position: { ...c.position },
        // How much floor it is standing on; absent for everything that
        // fits on one tile, which is everything but a chassis.
        ...(c.footprint ? { footprint: { ...c.footprint } } : {}),
        hp: Math.max(0, c.hp),
        maxHp: c.maxHp,
        alive: isAlive(c),
        active: c.id === activeId,
        // Standing in a wind-up it has declared and not yet thrown.
        charging: c.charge != null,
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
    // A turn starting reframes the fight on whoever is about to act
    // (see turnFocus). The scene glides — the AI's turns a little faster
    // than the player's own — and does nothing at all when the camera
    // feel is switched off.
    const active =
      activeId === null
        ? null
        : { id: activeId, kind: activeCombatant(combat).kind };
    const focus = turnFocus(active, focusedId);
    focusedId = activeId;
    if (focus) scene.focusOn(focus.entityId, { pace: focus.pace });
  }

  /** Float readouts over the bodies they belong to; missing ones drop. */
  function showPopups(popups: readonly CombatPopup[], delayMs = 0): void {
    if (!scene || !combat || popups.length === 0) return;
    for (const popup of popups) {
      const body = getCombatant(combat, popup.combatantId);
      if (!body) continue;
      // Over the middle of whatever it is about, so a chassis's figures
      // hang over the chassis rather than off one corner of it.
      const tile = footprintCenter(body.position, body.footprint);
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
      // Plating the shot actually met (a piercing round meets less of
      // it) and the attacker's own critical line, which is the whole
      // of what a crit-behavior part changes.
      const attacker = getCombatant(combat, event.attackerId);
      const weapon = attacker?.weapon;
      const armor = weapon
        ? effectiveArmor(weapon, target.armor)
        : target.armor;
      return {
        target: { armor, maxHp: target.maxHp },
        ...(weapon?.critShare !== undefined
          ? { critShare: weapon.critShare }
          : {}),
      };
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

  /**
   * The events whose sound is *not* the scene's to place.
   *
   * Everything a blow is made of — the swing, the round in the air, the
   * impact, the freeze, the collapse — is cued inside the scene against
   * its own clock, because only the scene knows which beat each of them
   * lands on (see ../iso/combatScene.ts). What is left here is the two
   * cues that answer the *engine*, not the animation: an item used has
   * no animation to wait for, and "one of theirs is down" is a report
   * about the fight rather than a thing that happened in the arena.
   */
  function playEventSfx(event: CombatEvent): void {
    switch (event.type) {
      case "item-used":
        audio.emit("combat.item.use");
        break;
      case "defeated":
        // The cue is "one of theirs is down"; a companion going down is
        // not that, and neither is the player.
        if (getCombatant(combat!, event.combatantId)?.kind === "enemy") {
          audio.emit("combat.enemy.defeat");
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
        // A wind-up needs no effect thrown at anybody: nothing has left
        // the caster yet. It is told four other ways at once — the
        // caster stands in its held charge stance (`charging` on the
        // entity view), the ground it promised is tinted as a threat,
        // a condition marker sits over it for the whole turn, and the
        // log says which ability is coming. Adding a fifth would be
        // noise, and aiming an effect at the caster itself would be a
        // lie about where the shot is.
        case "charge-started":
          break;
        // The wind-up going off. Whatever it caught follows as ordinary
        // ability-used entries, which play the cast at each body; a
        // release that caught nobody still has to *fire*, so the salvo
        // leaves the caster and lands on empty ground.
        case "charge-released": {
          if (event.bodies > 0) break;
          const ability = getAbility(event.abilityId);
          if (!ability) break;
          scene.abilityFx(
            event.combatantId,
            [event.combatantId],
            ability.effectRef,
            { attackVariant: ability.attackVariant ?? 0 },
          );
          break;
        }
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
            const attacker = getCombatant(combat, event.attackerId);
            const armor = attacker
              ? effectiveArmor(attacker.weapon, target.armor)
              : target.armor;
            scene.hitFx(event.targetId, {
              attackerId: event.attackerId,
              delayMs: beatMs,
              glancing: isGlancingBlow(event.damage, armor),
              // How much the camera owes the blow: the same reading the
              // figure over the body is styled from (see ./combatFeel.ts).
              weight: impactWeight(
                event.damage,
                { armor, maxHp: target.maxHp },
                attacker?.weapon.critShare,
              ),
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
            // Which of the caster's swings throws it. Content's call,
            // not the scene's: a chassis's shoulder battery is a
            // different animation and a different muzzle from its arm.
            { attackVariant: ability.attackVariant ?? 0 },
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
            weight: impactWeight(event.damage, { armor, maxHp: target.maxHp }),
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
      // Any tile of a body is that body: clicking a chassis's near
      // corner aims at the chassis.
      const target = combatantAt(combat.combatants, tile);
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

  function onTileHover(
    tile: TilePoint | null,
    at: { x: number; y: number } | null,
  ): void {
    if (!scene || !combat) return;
    hoverTile = tile === null ? null : { x: tile.x, y: tile.y };
    hoverAt = at;
    // Pointing anywhere in the arena inspects whoever is standing there,
    // in or out of a targeting mode — the card is how you read a body.
    inspect(telegraphTargetAt(combat, hoverTile));
    refreshHighlights();
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
    const walker = activeCombatant(combat);
    const to = { x: walker.position.x + delta.x, y: walker.position.y + delta.y };
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
    // Nothing left to teach once the fight is decided, and a chip under
    // a result panel is a chip nobody reads.
    hintLayer?.setPaused(true);
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
    // Read before the fold-back, so what the panel reports is what this
    // fight changed rather than what the run was already carrying.
    const injuredBefore = new Map(
      [session.state.player, ...session.state.party.members].map((who) => [
        "companionId" in who ? who.companionId : "player",
        who.injury?.id ?? null,
      ]),
    );
    session.state = withoutResumeFlag(resolveCombat(session.state, combat));
    const woundLines = [
      ...[session.state.player, ...session.state.party.members].flatMap(
        (who) => {
          const key = "companionId" in who ? who.companionId : "player";
          if (!who.injury || injuredBefore.get(key) === who.injury.id) return [];
          const name =
            "companionId" in who ? companionName(who.companionId) : "You";
          const line = injuryLine(who.injury);
          return line === null ? [] : [`${name}: ${line}`];
        },
      ),
    ];

    if (combat.status === "victory") {
      // Back to the district's exploration mix rather than to silence:
      // the drive and the tension layers go, the street stays, and the
      // game screen it returns to is already playing exactly this.
      audio.setMusicMode("explore");
      audio.emit("combat.outcome.victory");
      const { panel } = outcomePanel(t("combat.end.victory"));
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
      for (const text of lines.length > 0 ? lines : [t("combat.noSpoils")]) {
        const line = document.createElement("div");
        line.className = "nf-reward-line";
        line.textContent = text;
        list.append(line);
      }
      panel.append(list);
      // What the win cost, said on the panel it was won on — a wound
      // discovered later on the character screen reads as a bug.
      if (woundLines.length > 0) {
        const wounds = document.createElement("div");
        wounds.className = "nf-injury-list";
        wounds.append(
          Object.assign(document.createElement("div"), {
            className: "nf-injury-heading",
            textContent: t("combat.wounded"),
          }),
        );
        // What the win cost, heard as well as read.
        audio.emit("ui.injury.taken");
        for (const text of woundLines) {
          const line = document.createElement("div");
          line.className = "nf-injury-line";
          line.textContent = text;
          wounds.append(line);
        }
        panel.append(wounds);
      }
      panel.append(
        panelButton(t("combat.end.continue"), () => backToGame(resumeNodeId)),
      );
      focusFirst(panel);
      return;
    }

    if (combat.status === "fled") {
      const { panel } = outcomePanel(t("combat.end.fled"));
      const note = document.createElement("p");
      note.className = "nf-dim";
      note.textContent = t("combat.end.fledNote");
      panel.append(
        note,
        panelButton(t("combat.end.return"), () => backToGame(null)),
      );
      focusFirst(panel);
      return;
    }

    // A loss ends the run: the music goes out with it.
    audio.setMusicScene(null);
    audio.emit("combat.outcome.defeat");
    showDefeatPanel();
  }

  /** Separate from showOutcome so closing the save list can re-show it
   * without resolving the combat a second time. */
  function showDefeatPanel(): void {
    const { panel } = outcomePanel(t("combat.end.defeat"));
    const note = document.createElement("p");
    note.className = "nf-dim";
    note.textContent = t("combat.end.defeatNote");
    const message = document.createElement("p");
    message.className = "nf-message nf-error";
    const menu = document.createElement("div");
    menu.className = "nf-menu";
    menu.append(
      panelButton(t("combat.end.loadAutosave"), () => {
        try {
          session.state = loadGame("autosave", session.storage);
          showScreen(createGameScreen({ session }));
        } catch (error) {
          message.textContent =
            error instanceof SaveError
              ? saveErrorMessage(error)
              : t("combat.end.autosaveError");
        }
      }),
      panelButton(t("combat.end.loadGame"), () => {
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
      panelButton(t("combat.end.mainMenu"), () =>
        showScreen(createMainMenuScreen()),
      ),
    );
    panel.append(note, message, menu);
    focusFirst(panel);
  }

  // --- Screen lifecycle ------------------------------------------------

  return {
    name: "combat",
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
      // The score does not change track for a fight. It keeps playing
      // the district the fight was walked into from — under the same
      // hour the arena is lit at — and swaps its melody for its tension
      // writing with the combat drive over the top. A named
      // antagonist's fight adds one layer more.
      const from = getMap(session.state.location);
      audio.setMusicScene(
        musicScene(
          themeForMap(from ?? arenaMap),
          encounter.boss === true ? "boss" : "combat",
          options.dayPhase ?? from?.dayPhase ?? arenaMap.dayPhase,
        ),
      );
      scene = createCombatScene(canvas, {
        map: arenaMap,
        sprites: createPixelArtSprites({
          player: playerSpriteSource(session),
          // One source for every body that is not the player: an
          // enemy archetype's look, or a companion's.
          entity: allySpriteSource,
        }),
        // A fight happens under the sky — and at the hour — of the
        // place it started in: the arena inherits both from the map the
        // player walked from, with a story beat's staged hour, if there
        // was one, taking precedence over that map's own.
        weather: getMap(session.state.location)?.weather,
        dayPhase:
          options.dayPhase ?? getMap(session.state.location)?.dayPhase,
        // Which palette the marked ground is painted from, and how
        // loudly. Both read once, here: there is no way into Settings
        // from inside a fight, so a switch flipped between fights is
        // the next fight's.
        telegraphPalette: telegraphPaletteFor(settings.get()),
        telegraphBoost: assistOn(session.state.rules, "bold-telegraphs"),
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

      telegraphChipView = createTelegraphChip();
      root.append(telegraphChipView.el);

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

      // The action-bar tour, rationed: this fight may spend
      // COMBAT_HINT_BUDGET chips and the rest wait for the next one.
      // Which have been shown is the run's, so it outlives the fight.
      hintLayer = createHintLayer({
        flags: () => session.state.flags,
        onSeen: (flags) => {
          session.state = { ...session.state, flags };
        },
        limit: COMBAT_HINT_BUDGET,
      });
      root.append(hintLayer.el);

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
      telegraphChipView?.el.remove();
      overlayEl?.remove();
      hintLayer?.destroy();
      hintLayer = null;
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
      telegraphChipView = null;
      hoverTargetId = null;
      hoverTile = null;
      hoverAt = null;
      if (root) {
        root.style.pointerEvents = "";
        root = null;
      }
    },
  };
}
