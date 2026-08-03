/**
 * Interactive iso scene: owns the canvas, camera, pointer input, and the
 * player's walk animation. Interactions are forwarded through a typed
 * callback — this layer never imports narrative or combat code.
 */
import { audio } from "../audio";
import {
  outlinePaletteFor,
  reducedMotionActive,
  settings,
  stepZoom,
  telegraphPaletteFor,
  type ZoomLevel,
} from "../settings";
import {
  cycleInteractable,
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
import {
  clearRenderCounters,
  createRenderCounters,
  type ScenePerfSample,
} from "./perf";
import {
  renderScene,
  type OpeningView,
  type RenderView,
  type SceneWatchSource,
  type SceneWatchView,
} from "./render";
import {
  ambienceCues,
  type AmbienceSample,
} from "./ambience";
import {
  collectSetPieces,
  droneStateAt,
  trainRunAt,
  type SetPieceDraw,
} from "./setpiece";
import { collectTickers, type TickerDraw } from "./ticker";
import {
  RUNNING_CLOCK,
  clockHeld,
  holdClock,
  releaseClock,
  sceneTime,
  type SceneClock,
} from "./sceneClock";
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
  type WeatherId,
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
  /**
   * The running order for each of the map's public screens, by screen
   * id. Which headlines a district is carrying is content the shell
   * resolves from the world state (see src/world/news.ts); the scene
   * only scrolls what it is handed, exactly as it only positions the
   * speakers it reports rather than knowing what they say. Screens with
   * no entry show nothing.
   */
  newsStrips?: Readonly<Record<string, readonly string[]>>;
  /**
   * Whoever is watching this map. Called once a frame with where the
   * player stands, and answers with the figures to draw and the ground
   * they are holding — or null when nothing is watching, which is every
   * map most of the time. Same split as barks and the news: the scene
   * positions and paints, and what a patrol *means* (see
   * src/stealth/) never enters this layer.
   */
  watch?: SceneWatchSource;
  /**
   * Weather forced on regardless of what the district declares. Only
   * the perf scene uses it, to hold rain up over a map that plays
   * clear; the setting still switches it off, because a measurement
   * taken with a pass the player can disable should be able to be taken
   * without it too.
   */
  weather?: WeatherId | null;
  /**
   * Dev instrumentation: called at the end of every frame with what
   * that frame cost and what it drew (see ./perf.ts). Passing nothing —
   * which is every screen in the game — costs the frame nothing: no
   * counters are allocated and the renderer does no counting.
   */
  onPerf?: (sample: ScenePerfSample) => void;
  /**
   * Whether the scene should answer the keyboard at all. The shell says
   * no while a panel is open, because the scene listens on the window
   * and a step taken behind an inventory screen is a step nobody asked
   * for. Defaults to yes.
   */
  keyboardEnabled?: () => boolean;
}

/**
 * What photo mode is asking the scene to show while it is open (see
 * src/ui/photoModel.ts, which owns the state this is a snapshot of).
 *
 * Handing the whole framing over every time rather than keeping any of
 * it here is the point: the scene's own camera, zoom, hour, and weather
 * are never written while a shot is being framed, so putting photo mode
 * away is a matter of dropping this record — there is nothing to undo.
 */
export interface ScenePhotoView {
  /** Where the shot is pointed; clamped by the caller, and again here. */
  camera: Camera;
  /** A photo zoom level, which may be deeper than the game's own ladder. */
  zoom: number;
  /** The hour the shot is staged at; the run's hour is left alone. */
  dayPhase: DayPhaseId;
  /** Whether the district's weather is painted into the shot. */
  weather: boolean;
  /** Leave every figure out — the environment on its own. */
  hideCharacters: boolean;
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
  /**
   * Crouch-walk, or stand back up. The only thing it changes here is
   * the pace (CROUCH_SPEED_SCALE); what crouching is *worth* is a rule
   * in src/stealth/detect.ts, which this layer knows nothing about.
   */
  setCrouched(crouched: boolean): void;
  /**
   * Put the player on a tile immediately, dropping whatever walk was in
   * flight — a dash across a gap rather than a step across it. The
   * caller is responsible for the tile being somewhere a body can
   * stand; nothing is pathed and nothing is triggered on arrival.
   */
  placePlayer(tile: TilePoint): void;
  /**
   * Park the camera on a world-screen point, clamped into the map
   * exactly as a drag-pan is. Dev tooling drives the perf scene's
   * scripted scroll through it (see src/data/perfScenes.ts); nothing in
   * the game moves the camera this way.
   */
  setCamera(point: Camera): void;
  /** Where the camera is pointed right now — what photo mode opens on. */
  viewCamera(): Camera;
  /**
   * Frame a shot, or put photo mode away (null).
   *
   * Entering holds the scene clock (see ./sceneClock.ts): the street
   * stops where it stands and every step, walk, and patrol stops with
   * it, because the frame delta is read off that same clock. Nothing
   * else in the scene changes — the gameplay camera, zoom, hour, and
   * weather sit exactly where they were, untouched — so leaving is
   * simply releasing the clock and dropping the view, and the city
   * carries on from the instant it stopped rather than from wherever
   * the wall clock has got to.
   *
   * Input is the caller's while it is open: the scene answers no
   * pointer and no key, so the one thing moving the camera is the
   * framing being pushed back in here.
   */
  setPhoto(view: ScenePhotoView | null): void;
  /**
   * Paint the frame currently on screen into a canvas of its own, at
   * `supersample`× the backing resolution the scene is running at, and
   * hand it back for saving. One extra render of a scene that is
   * already held still, so what comes out is exactly what is on screen
   * with more pixels in it — and the pixels are art pixels multiplied by
   * a whole number, so a doubled capture is as crisp as the original.
   *
   * Null before the first frame has been drawn, or where the canvas has
   * no size and there is nothing to photograph.
   */
  captureFrame(supersample?: number): HTMLCanvasElement | null;
  /** Stop the animation loop and remove all listeners. */
  destroy(): void;
}

/** Tiles per second the player walks. */
const WALK_SPEED = 3.5;
/** What crouch-walking multiplies that by; see IsoScene.setCrouched. */
const CROUCH_WALK_SCALE = 0.55;
/**
 * World-screen pixels above a tile's center that a speaker's chip is
 * anchored at: clear of the head of a 48-pixel-tall figure standing on
 * it, so a line never covers the face saying it.
 */
const SPEAKER_ANCHOR_LIFT = 92;
/** Pointer travel in px beyond which a press becomes a camera pan. */
const PAN_THRESHOLD = 5;
/**
 * What a capture puts behind the scene. The canvas is cleared to
 * transparency every frame and the page's own background shows through
 * it, so a PNG saved without this would have holes where the sky is —
 * the value is `--nf-bg-deep` from src/ui/theme.css, which is what the
 * player was actually looking at.
 */
const CAPTURE_BACKDROP = "#0a0a12";
/** Keys that trigger whatever the scene has in focus. */
const INTERACT_KEYS = new Set(["Enter", "e", "E"]);

/**
 * Tile steps for the keys that walk the player, in world tile
 * coordinates (+x is east on the diamond, +y south). Both the arrow
 * cluster and WASD are here: the arrows are what a keyboard player
 * reaches for first, and WASD is what a hand already resting over the
 * stealth keys can use without moving.
 *
 * This is the whole of keyboard exploration, and it exists because
 * without it the map could only be crossed by clicking it — the one
 * activity in the game with no keyboard route through it.
 */
const STEP_KEYS: Readonly<Record<string, TilePoint>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

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
  /**
   * The interactable the keyboard has picked, if any. It is the cursor
   * a player without a pointer aims with: [ and ] walk it round the
   * map, it outranks hover and reach in resolveFocus, and Enter acts on
   * it — walking there first when it is out of reach. Cleared by moving
   * (the pick was about where you were) and by acting on it.
   */
  let pickedId: string | null = null;
  /** Last focus reported to the shell, so the prompt only changes on change. */
  let focusHintSent: IsoFocusHint | null = null;
  /** Crouch-walking: slower on the ground, and quieter in the rules. */
  let crouched = false;
  /** Ambient pedestrians dressing the map; scenery only, never clicked. */
  let crowd: AmbientCrowd =
    options.ambient === false ? { pedestrians: [], zones: new Map() } : createCrowd(map);
  /**
   * The map's weather, resolved once (puddle placement is fixed for a
   * map) and rebuilt when the player toggles the setting. Null is both
   * "clear skies" and "weather effects off".
   */
  const forcedWeather = options.weather ?? undefined;
  let weather: WeatherView | null = resolveWeather(map, {
    enabled: settings.get().weather,
    weather: forcedWeather,
  });
  /**
   * The hour the scene plays at: the map's own unless a story beat has
   * moved the clock. Pushed into the sprite provider, which bakes
   * through the phase's tinted palette.
   */
  /** What the district's screens are carrying; fixed for the visit. */
  const newsStrips = options.newsStrips ?? {};
  let dayPhase = resolveDayPhase(map, options.dayPhase);
  sprites.setDayPhase?.(dayPhase);

  /**
   * The shot being framed, or null — which is the scene's whole state
   * for photo mode. Everything it changes is read off this record at
   * paint time; nothing it changes is stored anywhere else.
   */
  let photo: ScenePhotoView | null = null;
  /** The weather resolved for the shot, rebuilt only when it changes. */
  let photoWeather: WeatherView | null = null;
  /**
   * The animation clock, and how photo mode holds it. The frame delta is
   * read off this too, so a held clock stills the walk, the crowd, and
   * the companion without a second switch anywhere.
   */
  let clock: SceneClock = RUNNING_CLOCK;
  /**
   * The last view handed to the renderer, kept so a capture can paint
   * the same frame again at another resolution rather than rebuilding
   * one that might not match what is on screen.
   */
  let lastView: RenderView | null = null;

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

  /** The zoom actually being painted: the shot's, while there is one. */
  function activeZoom(): number {
    return photo?.zoom ?? zoom;
  }

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    viewportW = canvas.clientWidth;
    viewportH = canvas.clientHeight;
    // Backing store in device pixels; the base transform scales world
    // units by dpr * zoom so draw code stays in world-screen units.
    canvas.width = Math.round(viewportW * dpr);
    canvas.height = Math.round(viewportH * dpr);
    const scale = dpr * activeZoom();
    ctx!.setTransform(scale, 0, 0, scale, 0, 0);
    // While a shot is being framed the gameplay camera is not the
    // scene's business: the framing owns the view, and re-clamping the
    // one underneath it would be a change the player cannot see now and
    // would find waiting for them on the way out.
    if (photo) {
      photo = {
        ...photo,
        camera: clampCamera(
          photo.camera,
          bounds,
          viewportW / photo.zoom,
          viewportH / photo.zoom,
        ),
      };
      return;
    }
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
    // A pointer in play answers the question the keyboard's pick asked.
    pickedId = null;
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

  /**
   * Whether the scene should answer the pointer at all. It should not
   * while a shot is being framed: photo mode drives the camera through
   * one clamped path (see src/ui/photoModel.ts), and a scene panning
   * itself underneath that would leave the framing describing a view
   * nobody is looking at.
   */
  function pointerIsOurs(): boolean {
    return photo === null;
  }

  function onPointerDown(event: PointerEvent): void {
    if (!pointerIsOurs()) return;
    if (event.button !== 0) return;
    pointerDown = true;
    panning = false;
    const p = canvasPoint(event);
    lastPointer = p;
    downPointer = p;
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointerIsOurs()) return;
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
    if (!pointerIsOurs()) return;
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
    if (!pointerIsOurs()) return;
    if (event.deltaY === 0) return;
    event.preventDefault();
    applyZoom(stepZoom(zoom, event.deltaY < 0 ? 1 : -1));
  }

  /**
   * Whether a key press belongs to the map rather than to a control the
   * player is standing on. The scene listens on the window — that is how
   * a canvas with no focus of its own hears anything — so a press aimed
   * at the HUD's own buttons has to be handed back, or Enter on "Crew"
   * would open the panel *and* try to open a door.
   */
  function keyIsOurs(event: KeyboardEvent): boolean {
    // Photo mode answers the keyboard itself, down to the zoom keys —
    // its ladder has a level the game's does not.
    if (photo) return false;
    if (options.keyboardEnabled?.() === false) return false;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return true;
    if (target === canvas || target === document.body) return true;
    return !target.matches(
      "button, input, select, textarea, a[href], [tabindex]",
    );
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!keyIsOurs(event)) return;
    if (event.key === "+" || event.key === "=") {
      applyZoom(stepZoom(zoom, 1));
      return;
    }
    if (event.key === "-" || event.key === "_") {
      applyZoom(stepZoom(zoom, -1));
      return;
    }
    // The keyboard's cursor: [ and ] walk it round everything the map
    // offers, nearest first, and it survives until it is spent or the
    // player moves off the ground the ordering was taken from.
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      const next = cycleInteractable(
        map,
        routeOrigin(),
        pickedId,
        event.key === "]" ? 1 : -1,
      );
      pickedId = next?.id ?? null;
      resolveFocus();
      return;
    }
    if (event.key === "Escape" && pickedId !== null) {
      // Dropping the pick is the keyboard's "look away"; the shell's
      // own Escape (the pause menu) only sees it when nothing is picked.
      event.preventDefault();
      event.stopPropagation();
      pickedId = null;
      resolveFocus();
      return;
    }
    const step = STEP_KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (step) {
      event.preventDefault();
      stepPlayer(step);
      return;
    }
    if (INTERACT_KEYS.has(event.key)) {
      // Whatever is outlined is what the key acts on, so the prompt and
      // the keystroke can never disagree. The shell decides whether it
      // is listening — an open overlay drops the interaction there.
      event.preventDefault();
      interactWithFocus();
    }
  }

  /**
   * One keyboard step. A tile away is a walk, not a teleport: it goes
   * through the same path routing a click does, so nothing gets to
   * cross a wall that a click could not, and an interactable stepped
   * into is walked up to and triggered exactly as a click on it is.
   */
  function stepPlayer(delta: TilePoint): void {
    const from = routeOrigin();
    const to = { x: from.x + delta.x, y: from.y + delta.y };
    // Moving is answering a different question than the pick asked.
    pickedId = null;
    const interactable = interactableAt(map, to.x, to.y);
    if (interactable) {
      if (walkQueue.length === 0 && tileDistance(playerTile, to) === 1) {
        onInteract({
          interactableId: interactable.id,
          interaction: interactable.interaction,
        });
        return;
      }
      const path = findPathToAdjacent(map, from, to);
      if (path) {
        pendingInteractable = interactable;
        startWalk(path);
      }
      return;
    }
    if (!isWalkable(map, to.x, to.y)) {
      // Nothing to walk onto, but the step still says which way you
      // meant to look — turning on the spot is a move a player can see.
      playerFacing = facingFromDelta(delta.x, delta.y) ?? playerFacing;
      return;
    }
    pendingInteractable = null;
    startWalk([from, to]);
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
    walkProgress += WALK_SPEED * (crouched ? CROUCH_WALK_SCALE : 1) * dt;
    while (walkProgress >= 1 && walkQueue.length > 0) {
      walkProgress -= 1;
      playerTile = walkQueue.shift() ?? playerTile;
      audio.emit("world.footstep");
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
    focus = focusInteractable(map, { playerTile, hoverTile, pickedId });
    const next = focus ? focusHint(focus) : null;
    const same =
      next?.interactableId === focusHintSent?.interactableId &&
      next?.reason === focusHintSent?.reason &&
      next?.inRange === focusHintSent?.inRange &&
      next?.distance === focusHintSent?.distance;
    if (same) return;
    focusHintSent = next;
    options.onFocus?.(next);
  }

  function focusHint(target: FocusedInteractable): IsoFocusHint {
    const { interactable, reason, inRange, distance } = target;
    return {
      interactableId: interactable.id,
      label: interactable.label,
      spriteId: interactable.spriteId,
      interaction: interactable.interaction,
      reason,
      inRange,
      distance,
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
    if (!focus) return;
    const { interactable } = focus;
    if (focus.inRange && walkQueue.length === 0) {
      pickedId = null;
      onInteract({
        interactableId: interactable.id,
        interaction: interactable.interaction,
      });
      return;
    }
    // Out of reach, and picked on purpose: the keyboard's answer to
    // clicking something across the plaza — walk there, then act. Only
    // a deliberate pick does this; standing near one thing and pressing
    // Enter is not a request to cross the map.
    if (focus.reason !== "picked") return;
    const path = findPathToAdjacent(map, routeOrigin(), interactable);
    if (!path) return;
    pickedId = null;
    pendingInteractable = interactable;
    startWalk(path);
    resolveFocus();
  }

  /**
   * What the street was doing last frame. Null until the first pass, so
   * arriving on a map announces nothing (see ./ambience.ts).
   */
  let lastAmbience: AmbienceSample | null = null;

  /**
   * Say whatever the world has just done. The sample is read off the
   * same set pieces and boards the renderer is about to draw, so the
   * sound and the picture can never disagree about what is happening;
   * which of those readings is worth a sound is decided in ./ambience.ts
   * and nowhere else.
   */
  function speakAmbience(
    timeMs: number,
    setPieces: readonly SetPieceDraw[],
    tickers: readonly TickerDraw[],
  ): void {
    const spec = map.setPieces;
    const sample: AmbienceSample = {
      timeMs,
      train: (spec?.trains ?? []).some(
        (track) => trainRunAt(track, timeMs) !== null,
      ),
      drone: (spec?.drones ?? []).some(
        (path) => droneStateAt(path, timeMs) !== null,
      ),
      steam: setPieces.some((draw) => draw.spriteId === "steam-burst"),
      rain: weather?.id === "rain",
      // Every board's line at once: any of them turning over is a
      // change of this, and one blip answers it however many did.
      headline:
        tickers.length === 0
          ? null
          : tickers.map((ticker) => ticker.text).join(" "),
    };
    for (const cue of ambienceCues(lastAmbience, sample)) audio.emit(cue);
    lastAmbience = sample;
  }

  let rafId = 0;
  let lastTime: number | null = null;
  /**
   * The counter record the renderer fills in, or null when nobody is
   * measuring — which is every screen in the game. Allocated once and
   * zeroed per frame rather than rebuilt, for the same reason the frame
   * window is a ring buffer.
   */
  const counters = options.onPerf ? createRenderCounters() : null;

  function frame(frameMs: number): void {
    const startedAt = counters ? performance.now() : 0;
    const previousTime = lastTime;
    // The hold is taken here rather than where photo mode is switched on
    // and off, so both ends are stamped against the same clock the
    // frames arrive on and a freeze can never be measured against a
    // reading from somewhere else.
    if (photo && !clockHeld(clock)) clock = holdClock(clock, frameMs);
    else if (!photo && clockHeld(clock)) clock = releaseClock(clock, frameMs);
    // Everything below runs on the scene clock rather than the frame
    // clock, which is what makes a freeze one decision instead of a
    // dozen: a held clock reports the same instant every frame, so the
    // delta is zero and nothing steps, without a single `if (photo)`
    // in the movement code.
    const time = sceneTime(clock, frameMs);
    const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    if (counters) clearRenderCounters(counters);
    stepWalk(dt);
    stepFollower(dt);
    resolveFocus();
    const current = settings.get();
    const reducedMotion = reducedMotionActive(current);
    // Reduced motion stills the crowd along with the rest of the
    // ambient clock: the player's own movement is the only motion the
    // scene keeps, since that one is the player's own doing.
    crowd = stepCrowd(crowd, map, reducedMotion ? 0 : dt);
    // The set pieces ride the same frozen clock as everything else, and
    // reduced motion additionally withholds the ones that would read as
    // broken held still (see collectSetPieces). Switched off outright
    // they are simply not collected: a train that is not crossing is
    // not a train drawn parked, it is a viaduct with nothing on it.
    const setPieces = current.setPieces
      ? collectSetPieces(map, reducedMotion ? 0 : time, {
          motion: !reducedMotion,
          rain: weather?.id === "rain",
        })
      : [];
    // Reduced motion parks each screen on its first headline rather
    // than freezing the scroll at t = 0, which would leave every board
    // showing a line that has not entered the window yet.
    const tickers = collectTickers(map, newsStrips, time, {
      motion: !reducedMotion,
    });
    speakAmbience(reducedMotion ? 0 : time, setPieces, tickers);
    // Whoever is watching the map, asked against the real clock: a
    // patrol is not scenery, and freezing it for reduced motion would
    // freeze a rule rather than an effect.
    // Nobody is asked anything while a shot is being framed: a patrol
    // is a rule, and a rule that ran on for the minute somebody spent
    // choosing a camera angle would be a minute of the game played
    // without them.
    const watch: SceneWatchView | null = photo
      ? null
      : (options.watch?.({
          timeMs: time,
          playerTile,
          moving: walkQueue.length > 0,
        }) ?? null);
    const view: RenderView = {
      map,
      camera: photo?.camera ?? camera,
      viewportW,
      viewportH,
      // A photograph has no cursor in it, no route drawn across it, and
      // nothing outlined: the affordances are true and simply not in
      // the shot (see RenderView.marks).
      hoverTile: photo ? null : hoverTile,
      path: photo ? [] : walkQueue,
      tickers,
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
        // A patrol rides the same depth-sorted list as everybody else,
        // so a guard walks in front of and behind the map's furniture
        // with no patrol-specific depth code anywhere.
        ...(watch?.entities ?? []),
      ],
      tints: watch?.tints,
      // Reduced motion freezes the animation clock: neon flicker, water
      // shimmer, and marker pulses go still while movement (driven by
      // positions, not the clock) stays fully visible.
      timeMs: reducedMotion ? 0 : time,
      dpr: window.devicePixelRatio || 1,
      zoom: photo?.zoom ?? zoom,
      glowEnabled: current.glow,
      marks: photo === null,
      hideCharacters: photo?.hideCharacters === true,
      // One palette id for every mark on the ground — the vision cones
      // of anyone watching, the walk preview, the cursor, the pulse
      // under an interactable (see ./telegraphPalette.ts).
      telegraphPalette: telegraphPaletteFor(current),
      // Rain rides the same frozen clock: reduced motion leaves the
      // streaks hanging still and the puddles in place, so the map
      // still reads as wet without anything moving.
      weather: photo ? photoWeather : weather,
      dayPhase: photo?.dayPhase ?? dayPhase,
      setPieces,
      opening: stepOpening(time, reducedMotion),
      // The outline color is a value, not a branch: the colorblind
      // option picks a palette id here and nothing downstream changes
      // (see ./affordance.ts).
      focus: focus
        ? {
            interactableId: focus.interactable.id,
            label: focus.interactable.label,
            color: outlineColor(outlinePaletteFor(current)),
          }
        : null,
      ...(counters ? { counters } : {}),
    };
    renderScene(ctx!, sprites, view);
    lastView = view;
    if (options.onSpeakers && !photo) {
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
    // The minimap is off screen with the rest of the HUD while a shot is
    // being framed, and the view it would be told about is the shot's
    // rather than the player's.
    if (!photo) {
      options.onView?.({
        playerTile,
        facing: playerFacing,
        camera,
        viewportW,
        viewportH,
        zoom,
      });
    }
    if (counters && options.onPerf) {
      // Two clocks, because they answer different questions: how much
      // JS this frame owned, and how long it had been since the last
      // one — which is where a garbage-collection pause shows up, since
      // it lands between frames rather than inside one.
      options.onPerf({
        frameMs: performance.now() - startedAt,
        deltaMs: previousTime === null ? 0 : time - previousTime,
        counters,
      });
    }
    rafId = requestAnimationFrame(frame);
  }

  /** The weather a shot wants: the district's own, or none at all. */
  function resolvePhotoWeather(wanted: boolean): WeatherView | null {
    return wanted
      ? resolveWeather(map, { enabled: true, weather: forcedWeather })
      : null;
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
      weather = resolveWeather(map, {
        enabled: next.weather,
        weather: forcedWeather,
      });
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

    setCrouched(next: boolean): void {
      crouched = next;
    },

    placePlayer(tile: TilePoint): void {
      const facing = facingFromDelta(tile.x - playerTile.x, tile.y - playerTile.y);
      if (facing) playerFacing = facing;
      walkQueue = [];
      walkProgress = 0;
      pendingInteractable = null;
      playerTile = { x: tile.x, y: tile.y };
      playerPos = { x: tile.x, y: tile.y };
    },

    setCamera(point: Camera): void {
      camera = clampCamera(point, bounds, viewportW / zoom, viewportH / zoom);
      // A camera placed on purpose is a settled one: the first measured
      // resize must not overwrite it with the player's tile.
      cameraSettled = true;
    },

    viewCamera(): Camera {
      return { ...camera };
    },

    setPhoto(view: ScenePhotoView | null): void {
      const wasFraming = photo !== null;
      if (view === null) {
        photo = null;
        photoWeather = null;
        if (wasFraming) {
          // The hour goes back to the run's and the transform back to
          // the gameplay zoom; the clock starts again on the next frame,
          // at the instant it stopped, so the street picks up
          // mid-flicker rather than however far into the future the
          // pause left it.
          sprites.setDayPhase?.(dayPhase);
          resize();
        }
        return;
      }
      const previous = photo;
      photo = {
        ...view,
        camera: clampCamera(
          view.camera,
          bounds,
          viewportW / view.zoom,
          viewportH / view.zoom,
        ),
      };
      if (!previous || previous.weather !== view.weather) {
        photoWeather = resolvePhotoWeather(view.weather);
      }
      if (previous?.dayPhase !== view.dayPhase) {
        // The provider bakes per phase and caches, so an hour already
        // framed at costs nothing to come back to.
        sprites.setDayPhase?.(view.dayPhase);
      }
      if (!previous || previous.zoom !== view.zoom) resize();
    },

    captureFrame(supersample = 1): HTMLCanvasElement | null {
      const view = lastView;
      if (!view || viewportW <= 0 || viewportH <= 0) return null;
      const scale = Math.max(1, Math.round(supersample));
      const out = document.createElement("canvas");
      const dpr = view.dpr * scale;
      out.width = Math.round(viewportW * dpr);
      out.height = Math.round(viewportH * dpr);
      const shot = out.getContext("2d");
      if (!shot) return null;
      const unit = dpr * view.zoom;
      shot.setTransform(unit, 0, 0, unit, 0, 0);
      renderScene(shot, sprites, { ...view, dpr });
      // The renderer clears to transparency and lets the page show
      // through; a file has no page behind it, so the same colour is
      // laid in underneath what was just painted.
      shot.setTransform(1, 0, 0, 1, 0, 0);
      shot.globalCompositeOperation = "destination-over";
      shot.fillStyle = CAPTURE_BACKDROP;
      shot.fillRect(0, 0, out.width, out.height);
      shot.globalCompositeOperation = "source-over";
      return out;
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
