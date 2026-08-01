import { audio, musicScene, themeForMap } from "../audio";
import {
  HUB_MAP_ID,
  LORE_SHARDS,
  companionSpriteId,
  getBreachContext,
  epilogueThreads,
  epilogueVignettes,
  findArcByNode,
  getEncounter,
  getEnding,
  getMap,
  getShard,
  interludes,
  type ChapterEnding,
} from "../data";
import { availablePoints, perkPicksAvailable } from "../character";
import {
  composeEpilogue,
  composeInterlude,
  isWounded,
  latestInterlude,
  markInterludeSeen,
  pendingInterlude,
  type Interlude,
} from "../narrative";
import {
  activeMember,
  carryoverAppearance,
  carryoverCandidates,
  collectShard,
  collectedCount,
  hasShard,
  recordCompletionToStorage,
  recordShardToStorage,
  type GameState,
} from "../state";
import { shardOpens } from "../world";
import {
  ENTRY_SPAWN_ID,
  createIsoScene,
  createPixelArtSprites,
  resolveDayPhase,
  spawnPoint,
  type DayPhaseId,
  type Interactable,
  type IsoFocusHint,
  type IsoScene,
  type SceneWatchFrame,
  type SceneWatchView,
  type TilePoint,
} from "../iso";
import { effectiveStats } from "../inventory";
import {
  activeStealthZone,
  applyLunge,
  hasQuietHands,
  lungeOffer,
  recordPassed,
  recordSpotted,
  recordTakedown,
  startStealth,
  stepStealth,
  takedownOffer,
  tickFloat,
  toggleCrouch,
  type Detection,
  type GuardView,
  type StealthRun,
} from "../stealth";
import type { StealthZone } from "../data/stealth";
import {
  CROUCH_KEY,
  STEALTH_ACTION_KEY,
  crouchLabel,
  guardEntities,
  spottedLine,
  stealthPrompt,
  stealthRefusal,
  takedownLine,
  watchTints,
} from "./stealthModel";
import { settings } from "../settings";
import { interactPrompt, shardPickupToast } from "./format";
import { createCodexScreen } from "./codexScreen";
import { resolveDistrict } from "./district";
import { runMapTransition, type MapTransitionHandle } from "./mapTransition";
import { npcSpriteSource, sceneSpriteSource } from "./entitySprites";
import { playerSpriteSource } from "./playerSprite";
import { createAdvancementOverlay } from "./advancementOverlay";
import { createPerkOverlay } from "./perkOverlay";
import { pickLabel } from "./perkModel";
import { createBarkLayer, type BarkLayerHandle } from "./barkLayer";
import { createBreachOverlay } from "./breachOverlay";
import { COMBAT_RESUME_FLAG, createCombatScreen } from "./combatScreen";
import { createDialogueOverlay } from "./dialogueOverlay";
import { createEpilogueScreen } from "./epilogueScreen";
import { createInterludeOverlay } from "./interludeOverlay";
import { createInventoryOverlay } from "./inventoryOverlay";
import { focusFirst, installListNav } from "./focus";
import { createMainMenuScreen } from "./mainMenu";
import { createMinimap, type MinimapHandle } from "./minimap";
import { createPartyOverlay } from "./partyOverlay";
import type { OverlayHandle } from "./overlay";
import { createSaveLoadPanel } from "./saveLoad";
import { createStylistOverlay } from "./stylistOverlay";
import { createVendorOverlay } from "./vendorOverlay";
import { createWorkbenchOverlay } from "./workbenchOverlay";
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
  | "breach"
  | "inventory"
  | "party"
  | "advance"
  | "perks"
  | "saves"
  | "menu"
  | "settings"
  | "stylist"
  | "workbench"
  | "vendor";

/** Flag marking that this playthrough's ending is already in meta-progress. */
const META_RECORDED_FLAG = "meta-recorded";

/** How long the being-seen wash is held before it is taken away. */
const ALERT_FLASH_MS = 320;

/**
 * Writes a finished run into meta-progress (endings codex, NG+ unlock,
 * legacy carry-over candidates). Guarded by a state flag so a
 * completion is recorded exactly once, even if a finished save's final
 * dialogue somehow replays; reopening a finished save never re-records
 * because only the final-ending handoff calls this.
 */
/**
 * The sprite id for the companion travelling with the player, or null
 * when they walk alone. The look is part of the id, so re-dressing a
 * companion changes what is drawn without changing this call site.
 */
function followerSpriteIdFor(state: GameState): string | null {
  const member = activeMember(state.party);
  return member
    ? companionSpriteId(member.companionId, member.lookId)
    : null;
}

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
      epilogueIds: composeEpilogue(
        state,
        epilogueVignettes,
        epilogueThreads,
      ).map((v) => v.id),
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
  let barkLayer: BarkLayerHandle | null = null;
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
  /**
   * The watch on this map, if there is one, and this visit's crossing.
   * Both are resolved once at mount and dropped the moment the crossing
   * settles — a zone that has been got past or been seen is over, and
   * the story node the settlement opens is what carries it from there.
   */
  let stealthZone: StealthZone | null = null;
  let stealthRun: StealthRun | null = null;
  /** Frame clock the crossing started on, and the last frame seen. */
  let stealthOrigin: number | null = null;
  let stealthLastMs = 0;
  let stealthViews: readonly GuardView[] = [];
  /** Where the scene last reported the player standing. */
  let stealthPlayerTile: TilePoint | null = null;
  /** The two lines that compete for the bottom of the screen. */
  let stealthPromptText: string | null = null;
  let focusPromptText: string | null = null;
  let alertFlash: HTMLElement | null = null;
  let alertFlashTimer: ReturnType<typeof setTimeout> | null = null;

  // "main-menu" is the fresh-game sentinel, not a content error.
  if (session.state.location !== "main-menu" && !getMap(session.state.location)) {
    console.error(
      `Unknown map id "${session.state.location}" — falling back to the hub`,
    );
  }
  const mapId = getMap(session.state.location) ? session.state.location : HUB_MAP_ID;
  // The district as this run has left it — the authored map, dressed by
  // what the story settled and populated by what the city has noticed,
  // plus whatever its public screens are carrying tonight. See
  // ./district.ts for the order the three layers land in.
  const { map, newsStrips } = resolveDistrict(session.state, mapId);

  /**
   * Puts the score where the player is. Called on mount and again
   * whenever a story beat moves the hour, because the hour is one of the
   * three things the score reads — the other two being the district and
   * whether anyone is shooting.
   */
  function playDistrictMusic(): void {
    audio.setMusicScene(
      musicScene(themeForMap(map), "explore", resolveDayPhase(map, storyPhase)),
    );
  }

  function refreshHud(): void {
    if (!hudStatus) return;
    const { player, credits } = session.state;
    hudStatus.replaceChildren();
    for (const text of [
      map.name,
      `HP ${player.hp}/${player.derived.maxHp}`,
      `${credits} cr`,
      // Only while somebody is watching: on an ordinary street there is
      // nothing for a crouch to be quieter than.
      ...(stealthRun ? [crouchLabel(stealthRun.crouched)] : []),
    ]) {
      const span = document.createElement("span");
      span.textContent = text;
      hudStatus.append(span);
    }
    advanceButton?.classList.toggle(
      "nf-button-attention",
      availablePoints(session.state) > 0 ||
        perkPicksAvailable(session.state) > 0,
    );
    // Somebody recruited (or benched) mid-scene joins (or leaves) the
    // walk on the spot — the beat that changed the party is the beat
    // they should appear on, not the next map.
    scene?.setFollower(followerSpriteIdFor(session.state));
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
    focusPromptText = hint
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
    renderPrompt();
  }

  /**
   * One line at the bottom of the screen, and the quiet option wins it:
   * a neck within reach or a gap under your feet is a more urgent offer
   * than the door you happen to be stood beside.
   */
  function renderPrompt(): void {
    if (!promptEl) return;
    const text = stealthPromptText ?? focusPromptText;
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
    // The street picks its chatter back up once the panel is gone.
    barkLayer?.setPaused(false);
  }

  function openOverlay(kind: OverlayKind, handle: OverlayHandle): void {
    closeOverlay();
    // Nobody talks over an open panel: chips are cleared for as long as
    // one is up rather than left fading behind it.
    barkLayer?.setPaused(true);
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
          // The hour moved: the same theme, filtered and paced for it.
          playDistrictMusic();
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
        onWorkbench(resumeNodeId) {
          // Same handoff as the stylist: the bench replaces the
          // dialogue, and closing it resumes at the choice's target.
          openOverlay(
            "workbench",
            createWorkbenchOverlay({
              session,
              onStateChange: refreshHud,
              onClose() {
                closeOverlay();
                if (resumeNodeId) openDialogue(resumeNodeId);
              },
            }),
          );
        },
        onVendor(vendorId, resumeNodeId) {
          // Same handoff as the bench: the counter replaces the
          // dialogue, and closing it resumes at the choice's target —
          // which is the vendor's own node, so the scene reopens with
          // the keeper still standing there.
          openOverlay(
            "vendor",
            createVendorOverlay({
              session,
              vendorId,
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
      // Leaving the chapter's own panel is where the act boundary
      // actually lands, so the interlude takes over from it directly.
      ["Keep Exploring", () => {
        if (!playPendingInterlude()) closeOverlay();
      }],
      ["Main Menu", () => showScreen(createMainMenuScreen())],
    ];
    if (availablePoints(session.state) > 0) {
      entries.unshift(["Spend Advancement Points", openAdvancement]);
    }
    // A chapter ending is a deed the city counts, so the milestone it
    // pushes past is offered on the same panel that reported it.
    if (perkPicksAvailable(session.state) > 0) {
      entries.unshift(["Choose a Perk", openPerks]);
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

  /**
   * Plays one act-boundary vignette. `firstTime` marks it seen (and
   * autosaves, so quitting on the card does not queue it up again);
   * a replay off the save screen leaves the run's flags alone.
   */
  function openInterlude(interlude: Interlude, firstTime: boolean): void {
    if (firstTime) {
      session.state = markInterludeSeen(session.state, interlude);
      autosave(session);
    }
    openOverlay(
      "menu",
      createInterludeOverlay({
        interlude: composeInterlude(session.state, interlude),
        reducedMotion: settings.get().reducedMotion,
        onClose: closeOverlay,
      }),
    );
  }

  /**
   * Shows the vignette this run owes, if it owes one, and reports
   * whether it took over the screen. Asked at the two moments an act
   * boundary can be crossed on: leaving the chapter-end panel, and
   * arriving on a map with the boundary already behind you — which is
   * how a run that quit on the chapter card still gets its interlude.
   */
  function playPendingInterlude(): boolean {
    const due = pendingInterlude(session.state, interludes);
    if (!due) return false;
    openInterlude(due, true);
    return true;
  }

  /**
   * Picking a memory shard up off the street. Three outcomes, and the
   * toast is the whole of the feedback: a sealed chip says what would
   * open it and stays where it is; one already in hand says so; a fresh
   * one is filed in the run *and* mirrored into meta-progress, so the
   * codex remembers it whether or not this run is ever finished.
   *
   * The chip stays on the map for the rest of this visit — the map is
   * resolved at mount (see ./district.ts) — and is gone the next time
   * the player walks in, because a collected shard is not placed.
   */
  function pickUpShard(shardId: string): void {
    const shard = getShard(shardId);
    if (!shard) {
      console.error(`Unknown lore shard "${shardId}" — nothing picked up`);
      return;
    }
    if (!shardOpens(session.state, shard)) {
      audio.emit("ui.cancel");
      showToast(shard.sealed ?? "The chip's index refuses to open.");
      return;
    }
    if (hasShard(session.state.lore, shard.id)) {
      showToast(`"${shard.title}" is already in the codex.`);
      return;
    }
    session.state = collectShard(session.state, shard.id);
    recordShardToStorage(shard.id, session.storage);
    autosave(session);
    audio.emit("ui.shard.pickup");
    showToast(
      shardPickupToast(
        shard.title,
        collectedCount(session.state.lore),
        LORE_SHARDS.length,
      ),
    );
  }

  /**
   * A terminal offering a run at Breach. The overlay owns the whole
   * flow — briefing, lattice, report — and folds the result into the
   * run itself the moment it stops; what is left here is the two things
   * only the shell can do: put the autosave down over the new state,
   * and mirror a chip the run pulled out into meta-progress, exactly as
   * picking one up off the floor does.
   */
  function openBreachTerminal(contextId: string): void {
    if (!getBreachContext(contextId)) {
      console.error(`Unknown breach context "${contextId}" — nothing opened`);
      return;
    }
    openOverlay(
      "breach",
      createBreachOverlay({
        session,
        contextId,
        onStateChange: refreshHud,
        onSettled(settlement) {
          if (settlement.filedShardId) {
            recordShardToStorage(settlement.filedShardId, session.storage);
          }
          autosave(session);
        },
        onClose: closeOverlay,
      }),
    );
  }

  // --- The watch -----------------------------------------------------
  //
  // Everything a crossing needs happens inside one callback the scene
  // makes once a frame: step the patrols, ask whether anybody has the
  // player, and hand back the figures and the tinted ground to draw.
  // The rules are all in src/stealth/; what is here is the join to a
  // canvas, a keyboard, and the run.

  /** Stats the crossing reads — the body's own, never the dialogue's. */
  function playerReflexes(): number {
    return effectiveStats(session.state.player).reflexes;
  }

  function watchFrame(frame: SceneWatchFrame): SceneWatchView | null {
    const zone = stealthZone;
    const run = stealthRun;
    if (!zone || !run) return null;
    if (stealthOrigin === null) {
      stealthOrigin = frame.timeMs;
      stealthLastMs = frame.timeMs;
    }
    const delta = frame.timeMs - stealthLastMs;
    stealthLastMs = frame.timeMs;
    // Nobody walks a beat while a panel is up: the origin slides
    // forward by the paused time, so a conversation (or an inventory,
    // or being caught) never advances a patrol behind the player's back.
    if (overlay) stealthOrigin += delta;

    stealthPlayerTile = frame.playerTile;
    const result = stepStealth(map, zone, run, {
      tick: tickFloat(frame.timeMs - stealthOrigin),
      playerTile: frame.playerTile,
      flags: session.state.flags,
    });
    stealthRun = result.run;
    stealthViews = result.views;
    refreshStealthPrompt();

    if (result.event?.kind === "passed") {
      settleCrossing(zone, "passed");
      return null;
    }
    if (result.event?.kind === "spotted") {
      settleCrossing(zone, "spotted", result.event.detection);
      return null;
    }
    return {
      entities: guardEntities(result.views),
      tints: watchTints(result.views, { crouched: result.run.crouched }),
    };
  }

  /**
   * How a crossing ends, both ways: the run records its own outcome,
   * the watch comes off the map, and the story node takes over. What
   * the *story* takes from either — the aisle being yours, the crew
   * coming up the walkway — is written by that node's own effects,
   * which is what keeps flag-writing in content.
   */
  function settleCrossing(
    zone: StealthZone,
    outcome: "passed" | "spotted",
    detection?: Detection,
  ): void {
    stealthZone = null;
    stealthRun = null;
    stealthViews = [];
    stealthPromptText = null;
    renderPrompt();
    // Back on your feet: there is nothing left on this map to be quiet
    // for, and walking at half pace round it would be a punishment for
    // having crossed it.
    scene?.setCrouched(false);
    refreshHud();
    if (outcome === "passed") {
      session.state = {
        ...session.state,
        flags: recordPassed(session.state.flags, zone),
      };
      autosave(session);
      audio.emit("ui.confirm");
      openDialogue(zone.goal.nodeId);
      return;
    }
    session.state = {
      ...session.state,
      flags: recordSpotted(session.state.flags, zone),
    };
    audio.emit("combat.stealth.spotted");
    flashAlert();
    if (detection) showToast(spottedLine(detection));
    openDialogue(zone.spottedNodeId);
  }

  /**
   * The red wash on being seen: a flat tint held for a third of a
   * second and then taken away.
   *
   * Deliberately not an animation. A fade would be zeroed by the
   * reduced-motion kill switch in theme.css and the whole cue would
   * vanish for exactly the players who most need a fight starting to be
   * unmissable; a tint that is simply there and then not is the same
   * cue at every motion setting.
   */
  function flashAlert(): void {
    if (!root) return;
    alertFlash?.remove();
    const flash = document.createElement("div");
    flash.className = "nf-alert-flash";
    flash.setAttribute("aria-hidden", "true");
    root.append(flash);
    alertFlash = flash;
    if (alertFlashTimer) clearTimeout(alertFlashTimer);
    alertFlashTimer = setTimeout(() => {
      flash.remove();
      if (alertFlash === flash) alertFlash = null;
    }, ALERT_FLASH_MS);
  }

  /** The quiet option under the player's feet, if there is one. */
  function stealthOffers() {
    const zone = stealthZone;
    const run = stealthRun;
    const tile = stealthPlayerTile;
    if (!zone || !run || !tile) return null;
    return {
      zone,
      run,
      tile,
      takedown: takedownOffer(zone, run, stealthViews, tile, {
        flags: session.state.flags,
        quiet: hasQuietHands(session.state),
      }),
      lunge: lungeOffer(zone, run, tile, playerReflexes()),
    };
  }

  function refreshStealthPrompt(): void {
    const offers = stealthOffers();
    const next = offers ? stealthPrompt(offers.takedown, offers.lunge) : null;
    if (next === stealthPromptText) return;
    stealthPromptText = next;
    renderPrompt();
  }

  /**
   * One key for whichever quiet option is on offer: a hand over a mouth
   * if there is a neck in reach, a dash if there is a gap under your
   * feet, and a word about why not if there is neither.
   */
  function takeStealthAction(): void {
    const offers = stealthOffers();
    if (!offers) return;
    if (offers.takedown.ok) {
      const guard = offers.takedown.guard;
      session.state = {
        ...session.state,
        flags: recordTakedown(session.state.flags, offers.zone, guard.guardId),
      };
      audio.emit("combat.stealth.takedown");
      showToast(takedownLine(guard));
      refreshStealthPrompt();
      return;
    }
    if (offers.lunge.ok) {
      stealthRun = applyLunge(offers.run);
      scene?.placePlayer(offers.lunge.pinch.to);
      audio.emit("world.interact");
      refreshStealthPrompt();
      return;
    }
    const refusal = stealthRefusal(offers.takedown, offers.lunge);
    if (refusal) {
      audio.emit("ui.cancel");
      showToast(refusal);
    }
  }

  function toggleStealthCrouch(): void {
    if (!stealthRun) return;
    stealthRun = toggleCrouch(stealthRun);
    scene?.setCrouched(stealthRun.crouched);
    audio.emit("ui.click");
    refreshHud();
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

  /**
   * The crew panel. Swapping who is out is a between-jobs decision, so
   * it is reachable from the map and never from a fight — and the HUD
   * refresh puts the new companion on the player's heels immediately.
   */
  function openParty(): void {
    openOverlay(
      "party",
      createPartyOverlay({
        session,
        onStateChange: refreshHud,
        onTalk(nodeId) {
          closeOverlay();
          openDialogue(nodeId);
        },
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
        onOpenPerks: openPerks,
        onClose: closeOverlay,
      }),
    );
  }

  /**
   * The perk pick. Reachable whenever the player wants to read what
   * they have taken, and pushed at them — once — the moment a milestone
   * comes due, because a pick nobody notices is a pick nobody makes.
   */
  function openPerks(): void {
    openOverlay(
      "perks",
      createPerkOverlay({
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
        // "Previously": the last boundary this save is past, replayed
        // on demand. Nothing is recorded — the vignette is derived from
        // the flags the save already carries.
        latestInterlude: latestInterlude(session.state, interludes),
        onReplayInterlude: (interlude) => openInterlude(interlude, false),
        onClose: closeOverlay,
      }),
    );
  }

  function openSettings(): void {
    // Every setting but two lives outside the session and leaves the
    // game state untouched. Difficulty and the assists are also facts
    // about *this* run, so the panel gets a handle onto it: a change is
    // written to the run and autosaved, so reloading cannot quietly put
    // the old preset back. Back returns to the pause menu.
    openOverlay(
      "settings",
      createSettingsOverlay({
        onClose: openSystemMenu,
        rules: {
          get: () => session.state.rules,
          set: (next) => {
            session.state = { ...session.state, rules: next };
            autosave(session);
          },
        },
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
      // The codex full-screen, carrying the run so the shard section
      // can show what this character is holding beside what the player
      // has ever found. Back remounts the district.
      [
        "Codex",
        () =>
          showScreen(
            createCodexScreen({
              state: session.state,
              onBack: () => showScreen(createGameScreen({ session })),
            }),
          ),
      ],
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

  /**
   * Panels that own the keyboard while they are up. A conversation is
   * one because its choices are the only thing worth pressing; a breach
   * is one because closing it away would throw the run, and it has its
   * own answer for every key including Escape.
   */
  function ownsKeyboard(): boolean {
    return overlay?.kind === "dialogue" || overlay?.kind === "breach";
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      if (ownsKeyboard()) return;
      audio.emit("ui.cancel");
      if (overlay) closeOverlay();
      else openSystemMenu();
      return;
    }
    if (event.key === "i" || event.key === "I") {
      if (ownsKeyboard()) return;
      if (overlay?.kind === "inventory") closeOverlay();
      else openInventory();
    }
    if (event.key === "c" || event.key === "C") {
      if (ownsKeyboard()) return;
      if (overlay?.kind === "party") closeOverlay();
      else openParty();
    }
    if (event.key === "p" || event.key === "P") {
      if (ownsKeyboard()) return;
      if (overlay?.kind === "advance") closeOverlay();
      else openAdvancement();
    }
    // The two crossing keys. Both are dead on a map nobody is watching,
    // and both stand back while a panel owns the keyboard.
    if (event.key.toLowerCase() === CROUCH_KEY) {
      if (ownsKeyboard() || overlay) return;
      toggleStealthCrouch();
    }
    if (event.key.toLowerCase() === STEALTH_ACTION_KEY) {
      if (ownsKeyboard() || overlay) return;
      takeStealthAction();
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
      // The district's own theme, at the hour the district is playing
      // at. A map transition remounts this screen, so crossing into
      // another district crossfades the score with it.
      playDistrictMusic();

      // Mounted first so every panel, the HUD, and the minimap sit over
      // the chatter rather than under it.
      barkLayer = createBarkLayer({
        state: () => session.state,
        seed: `barks:${mapId}:${session.state.rng.seed}`,
      });
      root.append(barkLayer.el);

      hud = document.createElement("div");
      hud.className = "nf-hud";
      hudStatus = document.createElement("div");
      hudStatus.className = "nf-hud-status";
      const actions = document.createElement("div");
      actions.className = "nf-hud-actions";
      const hudButtons: Array<[string, () => void]> = [
        ["Inventory [I]", () => (overlay?.kind === "inventory" ? closeOverlay() : openInventory())],
        ["Crew [C]", () => (overlay?.kind === "party" ? closeOverlay() : openParty())],
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

      // Whether anybody is standing between the player and the far side
      // of this map. Resolved once, here, off the run: a zone whose
      // fight has been had, or whose scene has already been settled, is
      // simply not posted (see src/stealth/zone.ts).
      stealthZone = activeStealthZone(session.state, map.id);
      stealthRun = stealthZone ? startStealth(stealthZone) : null;
      stealthOrigin = null;
      stealthViews = [];
      stealthPlayerTile = null;
      stealthPromptText = null;

      refreshHud();

      const arrival =
        options.spawnId && spawnPoint(map, options.spawnId)
          ? options.spawnId
          : ENTRY_SPAWN_ID;

      scene = createIsoScene(canvas, {
        map,
        spawnId: arrival,
        // Whoever is walking with the player right now; refreshHud
        // keeps it current, so a companion recruited mid-conversation
        // is walking with you the moment the box closes. A party of
        // nobody passes null and changes nothing.
        followerSpriteId: followerSpriteIdFor(session.state),
        dayPhase: storyPhase,
        // What this district's screens are carrying tonight. Resolved
        // here, from the world state, because which headlines a run has
        // earned is content — the scene only scrolls what it is given.
        newsStrips,
        sprites: createPixelArtSprites({
          player: playerSpriteSource(session),
          npc: npcSpriteSource(map),
          entity: sceneSpriteSource(),
        }),
        onFocus: showFocusHint,
        // Whoever is watching this map tonight; null on every map that
        // has nobody on it, which is most of them.
        watch: watchFrame,
        onView: (view) => minimap?.update(view),
        onSpeakers: (frame) => barkLayer?.update(frame),
        onInteract(event): void {
          if (overlay) return;
          audio.emit("world.interact");
          usedInteractable =
            map.interactables.find((i) => i.id === event.interactableId) ?? null;
          if (event.interaction.kind === "dialogue") {
            openDialogue(event.interaction.nodeId);
          } else if (event.interaction.kind === "lore") {
            pickUpShard(event.interaction.shardId);
          } else if (event.interaction.kind === "breach") {
            openBreachTerminal(event.interaction.contextId);
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

      // What arriving here is worth saying about: the district itself,
      // the weather it arrives under, and the state the player walked
      // in in. Cues wait for somebody able to answer them and lapse if
      // nobody is (walking alone, all three go unsaid).
      barkLayer.cue("arrive");
      if (map.weather === "rain") barkLayer.cue("weather");
      if (isWounded(session.state)) barkLayer.cue("wounded");

      if (options.dialogueNodeId) {
        openDialogue(options.dialogueNodeId);
      } else {
        // A boundary crossed but never played — quit on the chapter
        // card, or a save reopened past it — gets its breath here,
        // before the district is handed back to the player.
        playPendingInterlude();
      }

      // And the street's own nudge: cred earned mid-fight comes due the
      // moment the player is back on their feet. A toast rather than a
      // panel — a permanent decision is not something to open over
      // somebody who has just walked out of a fight.
      const picks = perkPicksAvailable(session.state);
      if (!overlay && picks > 0) {
        showToast(`${pickLabel(picks)} — open Advance [P].`);
      }
    },

    unmount(): void {
      window.removeEventListener("keydown", onKeyDown);
      closeOverlay();
      if (toastTimer) clearTimeout(toastTimer);
      if (alertFlashTimer) clearTimeout(alertFlashTimer);
      alertFlash?.remove();
      alertFlash = null;
      // A crossing is a visit, not a save: leaving the map ends it, and
      // walking back on starts a fresh one at whatever tick the clock
      // has reached. What persists — who was stood down, how it
      // settled — is in the run's flags.
      stealthZone = null;
      stealthRun = null;
      stealthViews = [];
      stealthPlayerTile = null;
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
      barkLayer?.destroy();
      barkLayer = null;
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
