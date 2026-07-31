/**
 * Interactive iso scene: owns the canvas, camera, pointer input, and the
 * player's walk animation. Interactions are forwarded through a typed
 * callback — this layer never imports narrative or combat code.
 */
import { audio } from "../audio";
import { settings, stepZoom, type ZoomLevel } from "../settings";
import {
  focusInteractable,
  outlineColor,
  type FocusedInteractable,
} from "./affordance";
import { createCrowd, crowdEntities, stepCrowd, type AmbientCrowd } from "./ambient";
import { facingFromDelta, type Facing } from "./animation";
import {
  createFollowState,
  isFollowMoving,
  leaderEntered,
  stepFollow,
  type FollowState,
} from "./follow";
import { hasOpeningArt } from "./art/interactables";
import { createPixelArtSprites } from "./art/provider";
import {
  clampCamera,
  initialCamera,
  mapPixelBounds,
  viewportToWorld,
  worldToViewport,
  type Camera,
} from "./camera";
import { observeDevicePixelRatio } from "./dpr";
import {
  sameTile,
  screenToTile,
  tileDistance,
  worldToScreen,
  type TilePoint,
  type WorldPoint,
} from "./coords";
import { resolveDayPhase } from "./dayPhase";
import type {
  IsoFocusHint,
  IsoFocusHintHandler,
  IsoInteractionHandler,
  SceneSpeaker,
  SceneSpeakerFrame,
  SceneSpeakerHandler,
} from "./events";
import type { MinimapView } from "./minimap";
import { findPath, findPathToAdjacent } from "./path";
import { renderScene, type OpeningView, type RenderView } from "./render";
import { collectSetPieces } from "./setpiece";
import { doorCycleMs, doorOpen01, doorTiming } from "./transition";
import { resolveWeather, type WeatherView } from "./weather";
import type { SpriteProvider } from "./sprites";
import {
  entryFacing,
  interactableAt,
  isWalkable,
  requireSpawn,
  type DayPhaseId,
  type Interactable,
  type IsoMap,
} from "./tilemap";

export interface IsoSceneOptions {
  map: IsoMap;
  /** Spawn point id the player starts on. */
  spawnId: string;
  onInteract: IsoInteractionHandler;
  /**
   * Called when the interactable under the cursor — or the nearest one
   * within reach — changes, and with null when none is in focus. The
   * shell turns it into the bottom-screen prompt line; the scene draws
   * the outline and floating name itself.
   */
  onFocus?: IsoFocusHintHandler;
  /**
   * Called every frame with where the player stands and what the camera
   * frames — the minimap's source. Reported rather than diffed here: the
   * consumer holds the last view and decides whether anything moved (see
   * sameMinimapView in ./minimap.ts), so the scene stays ignorant of the
   * HUD it feeds.
   */
  onView?: (view: MinimapView) => void;
  /**
   * Called every frame with everyone on the map who could be given a
   * line to say, and where their head is on screen. The scene knows
   * where figures stand; what any of them would say is content the
   * shell resolves (see src/ui/barkLayer.ts), so this layer stays free
   * of narrative code.
   */
  onSpeakers?: SceneSpeakerHandler;
  sprites?: SpriteProvider;
  /**
   * Populate the map's declared ambient crowd (default true). Off gives
   * a deterministic empty street for scene tests and dev inspection;
   * arenas need no switch — they declare no ambient spec at all.
   */
  ambient?: boolean;
  /**
   * Story override for the hour the scene plays at; null (the default)
   * leaves the map's own declaration in charge. See ./dayPhase.ts.
   */
  dayPhase?: DayPhaseId | null;
  /**
   * A companion walking with the player: the sprite id to draw them
   * under. They trail the player's own steps a couple of tiles back
   * (see ./follow.ts) and are scenery as far as input is concerned —
   * nothing picks them, nothing routes around them, and they can
   * neither block nor trigger an interactable.
   */
  followerSpriteId?: string | null;
}

export interface IsoScene {
  /**
   * Take on a companion, swap which one is following, or drop back to
   * walking alone (null). Somebody joining mid-scene falls in from the
   * player's own tile rather than sprinting in from the edge of the
   * map, which is what just happened in the fiction.
   */
  setFollower(spriteId: string | null): void;
  /**
   * Move the scene's clock: a story beat's hour, or null to fall back
   * to the map's own. Re-bakes lazily — the provider caches per phase,
   * so returning to an hour already walked redraws nothing.
   */
  setDayPhase(story: DayPhaseId | null): void;
  /**
   * Play an interactable's way-opening (a door parting, an exit's iris
   * flaring) and let it shut again. Returns false — having done
   * nothing — when that kind has no opening art, which is the caller's
   * cue to skip the door beat of a transition.
   */
  playOpening(interactableId: string): boolean;
  /** Stop the animation loop and remove all listeners. */
  destroy(): void;
}

/** Tiles per second the player walks. */
const WALK_SPEED = 3.5;
/**
 * World-screen pixels above a tile's center that a speaker's chip is
 * anchored at: clear of the head of a 48-pixel-tall figure standing on
 * it, so a line never covers the face saying it.
 */
const SPEAKER_ANCHOR_LIFT = 92;
/** Pointer travel in px beyond which a press becomes a camera pan. */
const PAN_THRESHOLD = 5;
/** Keys that trigger whatever the scene has in focus. */
const INTERACT_KEYS = new Set(["Enter", "e", "E"]);

export function createIsoScene(
  canvas: HTMLCanvasElement,
  options: IsoSceneOptions,
): IsoScene {
  const { map, onInteract } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2d context for iso canvas");
  const sprites = options.sprites ?? createPixelArtSprites();
  const bounds = mapPixelBounds(map);

  const spawn = requireSpawn(map, options.spawnId);
  let playerTile: TilePoint = { x: spawn.x, y: spawn.y };
  let playerPos: WorldPoint = { x: spawn.x, y: spawn.y };
  /**
   * Last walk direction; the idle sprite keeps facing it. An arrival
   * starts looking into the map rather than back out of the doorway.
   */
  let playerFacing: Facing = entryFacing(map, spawn);
  /** Tiles still to walk; [0] is the tile currently being entered. */
  let walkQueue: TilePoint[] = [];
  /** 0..1 progress from playerTile toward walkQueue[0]. */
  let walkProgress = 0;
  /** Interactable to trigger once the walk finishes adjacent to it. */
  let pendingInteractable: Interactable | null = null;
  /**
   * The companion walking with the player, if there is one. They start
   * on the player's own spawn tile — in formation, owing nothing — so
   * an arrival never opens with somebody sprinting across the map.
   */
  let followerSpriteId: string | null = options.followerSpriteId ?? null;
  let follower: FollowState | null =
    followerSpriteId != null
      ? createFollowState({ x: spawn.x, y: spawn.y }, playerFacing)
      : null;
  /**
   * The interactable playing its opening, and the frame clock it
   * started on — null until the first frame after the request, so the
   * envelope is measured against the same rAF clock everything else in
   * the scene uses rather than the wall.
   */
  let opening: { target: Interactable; startedAt: number | null } | null = null;
  /** The interactable being offered this frame; see ./affordance.ts. */
  let focus: FocusedInteractable | null = null;
  /** Last focus reported to the shell, so the prompt only changes on change. */
  let focusHintSent: IsoFocusHint | null = null;
  /** Ambient pedestrians dressing the map; scenery only, never clicked. */
  let crowd: AmbientCrowd =
    options.ambient === false ? { pedestrians: [], zones: new Map() } : createCrowd(map);
  /**
   * The map's weather, resolved once (puddle placement is fixed for a
   * map) and rebuilt when the player toggles the setting. Null is both
   * "clear skies" and "weather effects off".
   */
  let weather: WeatherView | null = resolveWeather(map, {
    enabled: settings.get().weather,
  });
  /**
   * The hour the scene plays at: the map's own unless a story beat has
   * moved the clock. Pushed into the sprite provider, which bakes
   * through the phase's tinted palette.
   */
  let dayPhase = resolveDayPhase(map, options.dayPhase);
  sprites.setDayPhase?.(dayPhase);

  let viewportW = 0;
  let viewportH = 0;
  let zoom: ZoomLevel = settings.get().zoom;
  let camera: Camera = worldToScreen(spawn.x, spawn.y);
  /**
   * Whether the camera has been placed against a measured viewport. A
   * canvas often has no size yet when the scene is built, so the first
   * real resize is what settles the camera on the player — after that
   * resizes only re-clamp, leaving any pan the player made alone.
   */
  let cameraSettled = false;
  let hoverTile: TilePoint | null = null;
  /**
   * Frame-clock ms the player last came to a stop, or null while they
   * are walking. How long somebody has stood still is what tells the
   * shell they are *listening* to whoever they are stood next to.
   */
  let stillSince: number | null = null;

  // Pointer state for distinguishing click from drag-pan.
  let pointerDown = false;
  let panning = false;
  let lastPointer = { x: 0, y: 0 };
  let downPointer = { x: 0, y: 0 };

  let cursor = "";
  /** Writes the canvas cursor style only when it changes. */
  function setCursor(value: string): void {
    if (cursor === value) return;
    cursor = value;
    canvas.style.cursor = value;
  }

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    viewportW = canvas.clientWidth;
    viewportH = canvas.clientHeight;
    // Backing store in device pixels; the base transform scales world
    // units by dpr * zoom so draw code stays in world-screen units.
    canvas.width = Math.round(viewportW * dpr);
    canvas.height = Math.round(viewportH * dpr);
    const scale = dpr * zoom;
    ctx!.setTransform(scale, 0, 0, scale, 0, 0);
    if (!cameraSettled && viewportW > 0 && viewportH > 0) {
      // First measured frame: open on the player, already centered.
      camera = initialCamera(map, playerTile, viewportW, viewportH, zoom);
      cameraSettled = true;
      return;
    }
    // At higher zoom the viewport spans fewer world units.
    camera = clampCamera(camera, bounds, viewportW / zoom, viewportH / zoom);
  }

  /** Zooms about the screen center: the camera point stays put. */
  function applyZoom(next: ZoomLevel): void {
    if (next === zoom) return;
    zoom = next;
    resize();
    settings.update({ zoom: next });
  }

  function canvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function pickTile(cssX: number, cssY: number): TilePoint {
    const world = viewportToWorld(camera, viewportW, viewportH, zoom, cssX, cssY);
    return screenToTile(world.sx, world.sy);
  }

  /** Tile to route new paths from: the one being entered, if mid-step. */
  function routeOrigin(): TilePoint {
    return walkQueue[0] ?? playerTile;
  }

  function startWalk(path: TilePoint[]): void {
    // path[0] is the routing origin; the rest are steps to take.
    const inFlight = walkQueue[0];
    const pathStart = path[0];
    if (inFlight && pathStart && sameTile(inFlight, pathStart)) {
      // Keep the current partial step so the player doesn't snap back.
      walkQueue = [inFlight, ...path.slice(1)];
    } else {
      walkQueue = path.slice(1);
      walkProgress = 0;
    }
  }

  function handleClick(cssX: number, cssY: number): void {
    const tile = pickTile(cssX, cssY);
    const interactable = interactableAt(map, tile.x, tile.y);
    if (interactable) {
      if (walkQueue.length === 0 && tileDistance(playerTile, tile) === 1) {
        onInteract({ interactableId: interactable.id, interaction: interactable.interaction });
        return;
      }
      const path = findPathToAdjacent(map, routeOrigin(), tile);
      if (path) {
        pendingInteractable = interactable;
        startWalk(path);
      }
      return;
    }
    pendingInteractable = null;
    if (!isWalkable(map, tile.x, tile.y)) return;
    const path = findPath(map, routeOrigin(), tile);
    if (path) startWalk(path);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    pointerDown = true;
    panning = false;
    const p = canvasPoint(event);
    lastPointer = p;
    downPointer = p;
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    const p = canvasPoint(event);
    if (pointerDown) {
      if (
        !panning &&
        Math.hypot(p.x - downPointer.x, p.y - downPointer.y) > PAN_THRESHOLD
      ) {
        panning = true;
        hoverTile = null;
        setCursor("grabbing");
      }
      if (panning) {
        // Pointer deltas are CSS pixels; the camera lives in world units.
        camera = clampCamera(
          {
            sx: camera.sx - (p.x - lastPointer.x) / zoom,
            sy: camera.sy - (p.y - lastPointer.y) / zoom,
          },
          bounds,
          viewportW / zoom,
          viewportH / zoom,
        );
      }
      lastPointer = p;
      return;
    }
    hoverTile = pickTile(p.x, p.y);
    setCursor(interactableAt(map, hoverTile.x, hoverTile.y) ? "pointer" : "");
  }

  function onPointerUp(event: PointerEvent): void {
    if (!pointerDown) return;
    pointerDown = false;
    canvas.releasePointerCapture(event.pointerId);
    if (!panning) {
      const p = canvasPoint(event);
      handleClick(p.x, p.y);
    }
    panning = false;
    setCursor("");
  }

  function onPointerLeave(): void {
    hoverTile = null;
    setCursor("");
  }

  function onWheel(event: WheelEvent): void {
    if (event.deltaY === 0) return;
    event.preventDefault();
    applyZoom(stepZoom(zoom, event.deltaY < 0 ? 1 : -1));
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "+" || event.key === "=") {
      applyZoom(stepZoom(zoom, 1));
    } else if (event.key === "-" || event.key === "_") {
      applyZoom(stepZoom(zoom, -1));
    } else if (INTERACT_KEYS.has(event.key)) {
      // Whatever is outlined is what the key acts on, so the prompt and
      // the keystroke can never disagree. The shell decides whether it
      // is listening — an open overlay drops the interaction there.
      interactWithFocus();
    }
  }

  /**
   * Moves the companion along the ground the player has covered. The
   * breadcrumb is dropped from the tile the player is *standing* on, so
   * the trail is only ever walkable ground.
   */
  function stepFollower(dt: number): void {
    if (!follower) return;
    follower = stepFollow(leaderEntered(follower, playerTile), dt);
  }

  function stepWalk(dt: number): void {
    if (walkQueue.length === 0) return;
    walkProgress += WALK_SPEED * dt;
    while (walkProgress >= 1 && walkQueue.length > 0) {
      walkProgress -= 1;
      playerTile = walkQueue.shift() ?? playerTile;
      audio.play("footstep");
    }
    const next = walkQueue[0];
    if (next) {
      playerFacing =
        facingFromDelta(next.x - playerTile.x, next.y - playerTile.y) ??
        playerFacing;
      playerPos = {
        x: playerTile.x + (next.x - playerTile.x) * walkProgress,
        y: playerTile.y + (next.y - playerTile.y) * walkProgress,
      };
    } else {
      playerPos = { ...playerTile };
      walkProgress = 0;
      const target = pendingInteractable;
      if (target) {
        pendingInteractable = null;
        if (tileDistance(playerTile, target) === 1) {
          onInteract({ interactableId: target.id, interaction: target.interaction });
        }
      }
    }
  }

  /**
   * How far open the interactable mid-opening is this frame, clearing
   * it once the cycle has run. Reduced motion collapses the envelope to
   * nothing, so the door is never caught part-way.
   */
  function stepOpening(time: number, reducedMotion: boolean): OpeningView | null {
    if (!opening) return null;
    if (opening.startedAt === null) opening.startedAt = time;
    const timing = doorTiming(reducedMotion);
    const elapsed = time - opening.startedAt;
    if (elapsed >= doorCycleMs(timing)) {
      opening = null;
      return null;
    }
    return {
      interactableId: opening.target.id,
      open01: doorOpen01(elapsed, timing),
    };
  }

  /**
   * The interactable the cursor is on, else the nearest one in reach.
   * Ambient pedestrians and scenery props are not interactables at all,
   * so neither can ever end up here.
   */
  function resolveFocus(): void {
    focus = focusInteractable(map, { playerTile, hoverTile });
    const next = focus ? focusHint(focus) : null;
    const same =
      next?.interactableId === focusHintSent?.interactableId &&
      next?.reason === focusHintSent?.reason &&
      next?.inRange === focusHintSent?.inRange;
    if (same) return;
    focusHintSent = next;
    options.onFocus?.(next);
  }

  function focusHint(target: FocusedInteractable): IsoFocusHint {
    const { interactable, reason, inRange } = target;
    return {
      interactableId: interactable.id,
      label: interactable.label,
      spriteId: interactable.spriteId,
      interaction: interactable.interaction,
      reason,
      inRange,
      exitMapId: interactable.exit?.mapId,
    };
  }

  /**
   * Where a figure standing at a world position wants its chip: the
   * point above its head, in viewport CSS pixels. The lift is applied
   * in world-screen units before the camera transform, so a chip keeps
   * its distance from the head at every zoom level.
   */
  function speakerAnchor(position: WorldPoint): {
    x: number;
    y: number;
    onScreen: boolean;
  } {
    const screen = worldToScreen(position.x, position.y);
    const point = worldToViewport(
      camera,
      viewportW,
      viewportH,
      zoom,
      screen.sx,
      screen.sy - SPEAKER_ANCHOR_LIFT,
    );
    return {
      x: point.x,
      y: point.y,
      onScreen:
        point.x >= 0 && point.x <= viewportW && point.y >= 0 && point.y <= viewportH,
    };
  }

  /**
   * Everyone on the map who could be given a line this frame: the
   * crowd, the named people the map stands there, and whoever is
   * walking with the player. Props, ways out, and terminals are
   * furniture and never appear here.
   */
  function collectSpeakers(): SceneSpeaker[] {
    const speakers: SceneSpeaker[] = [];

    for (const ped of crowd.pedestrians) {
      const anchor = speakerAnchor(ped.position);
      speakers.push({
        id: ped.id,
        kind: "pedestrian",
        refId: null,
        zoneId: ped.zoneId,
        distance: tileDistance(playerTile, ped.tile),
        anchorX: anchor.x,
        anchorY: anchor.y,
        onScreen: anchor.onScreen,
      });
    }

    for (const interactable of map.interactables) {
      if (interactable.spriteId !== "npc") continue;
      const anchor = speakerAnchor({ x: interactable.x, y: interactable.y });
      speakers.push({
        id: `npc:${interactable.id}`,
        kind: "npc",
        refId: interactable.id,
        zoneId: null,
        distance: tileDistance(playerTile, interactable),
        anchorX: anchor.x,
        anchorY: anchor.y,
        onScreen: anchor.onScreen,
      });
    }

    if (follower && followerSpriteId) {
      const anchor = speakerAnchor(follower.position);
      speakers.push({
        id: "companion",
        kind: "companion",
        refId: followerSpriteId,
        zoneId: null,
        distance: tileDistance(playerTile, {
          x: Math.round(follower.position.x),
          y: Math.round(follower.position.y),
        }),
        anchorX: anchor.x,
        anchorY: anchor.y,
        onScreen: anchor.onScreen,
      });
    }

    return speakers;
  }

  /** Trigger whatever is in focus, if it is close enough to reach. */
  function interactWithFocus(): void {
    if (walkQueue.length > 0 || !focus?.inRange) return;
    const { interactable } = focus;
    onInteract({
      interactableId: interactable.id,
      interaction: interactable.interaction,
    });
  }

  let rafId = 0;
  let lastTime: number | null = null;
  function frame(time: number): void {
    const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    stepWalk(dt);
    stepFollower(dt);
    resolveFocus();
    const reducedMotion = settings.get().reducedMotion;
    // Reduced motion stills the crowd along with the rest of the
    // ambient clock: the player's own movement is the only motion the
    // scene keeps, since that one is the player's own doing.
    crowd = stepCrowd(crowd, map, reducedMotion ? 0 : dt);
    // The set pieces ride the same frozen clock as everything else, and
    // reduced motion additionally withholds the ones that would read as
    // broken held still (see collectSetPieces).
    const setPieces = collectSetPieces(map, reducedMotion ? 0 : time, {
      motion: !reducedMotion,
      rain: weather?.id === "rain",
    });
    const view: RenderView = {
      map,
      camera,
      viewportW,
      viewportH,
      hoverTile,
      path: walkQueue,
      // The crowd rides in the same entity list as the player, so the
      // renderer's one depth-sorted object pass keeps pedestrians,
      // props, and the player correctly layered in a busy scene.
      entities: [
        {
          spriteId: "player",
          position: playerPos,
          facing: playerFacing,
          moving: walkQueue.length > 0,
        },
        // The companion rides the same depth-sorted entity list as the
        // player and the crowd, so they layer correctly walking in
        // front of or behind anything on the map.
        ...(follower && followerSpriteId
          ? [
              {
                spriteId: followerSpriteId,
                position: follower.position,
                facing: follower.facing,
                moving: isFollowMoving(follower),
              },
            ]
          : []),
        ...crowdEntities(crowd),
      ],
      // Reduced motion freezes the animation clock: neon flicker, water
      // shimmer, and marker pulses go still while movement (driven by
      // positions, not the clock) stays fully visible.
      timeMs: reducedMotion ? 0 : time,
      dpr: window.devicePixelRatio || 1,
      zoom,
      glowEnabled: settings.get().glow,
      // Rain rides the same frozen clock: reduced motion leaves the
      // streaks hanging still and the puddles in place, so the map
      // still reads as wet without anything moving.
      weather,
      dayPhase,
      setPieces,
      opening: stepOpening(time, reducedMotion),
      // The outline color is a value, not a branch: the later
      // colorblind-friendly setting picks a palette id here and nothing
      // downstream changes (see ./affordance.ts).
      focus: focus
        ? {
            interactableId: focus.interactable.id,
            label: focus.interactable.label,
            color: outlineColor(),
          }
        : null,
    };
    renderScene(ctx!, sprites, view);
    if (options.onSpeakers) {
      // The bark clock is the real one, not the frozen animation clock:
      // reduced motion stills the picture, and a line somebody says is
      // words rather than movement.
      stillSince = walkQueue.length > 0 ? null : (stillSince ?? time);
      const frame: SceneSpeakerFrame = {
        timeMs: time,
        mapId: map.id,
        weather: weather?.id ?? map.weather ?? "clear",
        dayPhase,
        speakers: collectSpeakers(),
        lingerMs: stillSince === null ? 0 : time - stillSince,
      };
      options.onSpeakers(frame);
    }
    options.onView?.({
      playerTile,
      facing: playerFacing,
      camera,
      viewportW,
      viewportH,
      zoom,
    });
    rafId = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  // preventDefault needs a non-passive listener (wheel defaults passive).
  canvas.addEventListener("wheel", onWheel, { passive: false });
  const unobserveDpr = observeDevicePixelRatio(resize);
  // The settings screen can change zoom too; follow it.
  const unsubscribeSettings = settings.subscribe((next) => {
    if (next.zoom !== zoom) {
      zoom = next.zoom;
      resize();
    }
    const wanted = next.weather && weather === null;
    const unwanted = !next.weather && weather !== null;
    if (wanted || unwanted) {
      weather = resolveWeather(map, { enabled: next.weather });
    }
  });
  rafId = requestAnimationFrame(frame);

  return {
    setFollower(spriteId: string | null): void {
      if (spriteId === followerSpriteId) return;
      followerSpriteId = spriteId;
      // Joining mid-scene: they step out of the player's own tile, in
      // formation, owing nothing. Leaving: they are simply not drawn.
      follower =
        spriteId === null
          ? null
          : (follower ?? createFollowState(playerTile, playerFacing));
    },

    setDayPhase(story: DayPhaseId | null): void {
      const next = resolveDayPhase(map, story);
      if (next === dayPhase) return;
      dayPhase = next;
      sprites.setDayPhase?.(next);
    },

    playOpening(interactableId: string): boolean {
      const target = map.interactables.find((i) => i.id === interactableId);
      if (!target || !hasOpeningArt(target.spriteId)) return false;
      opening = { target, startedAt: null };
      return true;
    },

    destroy(): void {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      unobserveDpr();
      unsubscribeSettings();
      setCursor("");
      ctx!.clearRect(0, 0, viewportW, viewportH);
    },
  };
}
