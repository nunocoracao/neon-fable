/**
 * Interactive iso scene: owns the canvas, camera, pointer input, and the
 * player's walk animation. Interactions are forwarded through a typed
 * callback — this layer never imports narrative or combat code.
 */
import { audio } from "../audio";
import { facingFromDelta, type Facing } from "./animation";
import { createPixelArtSprites } from "./art/provider";
import { clampCamera, mapPixelBounds, type Camera } from "./camera";
import {
  sameTile,
  screenToTile,
  tileDistance,
  worldToScreen,
  type TilePoint,
  type WorldPoint,
} from "./coords";
import type { IsoInteractionHandler } from "./events";
import { findPath, findPathToAdjacent } from "./path";
import { renderScene, type RenderView } from "./render";
import type { SpriteProvider } from "./sprites";
import {
  interactableAt,
  isWalkable,
  requireSpawn,
  type Interactable,
  type IsoMap,
} from "./tilemap";

export interface IsoSceneOptions {
  map: IsoMap;
  /** Spawn point id the player starts on. */
  spawnId: string;
  onInteract: IsoInteractionHandler;
  sprites?: SpriteProvider;
}

export interface IsoScene {
  /** Stop the animation loop and remove all listeners. */
  destroy(): void;
}

/** Tiles per second the player walks. */
const WALK_SPEED = 3.5;
/** Pointer travel in px beyond which a press becomes a camera pan. */
const PAN_THRESHOLD = 5;

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
  /** Last walk direction; the idle sprite keeps facing it. */
  let playerFacing: Facing = "s";
  /** Tiles still to walk; [0] is the tile currently being entered. */
  let walkQueue: TilePoint[] = [];
  /** 0..1 progress from playerTile toward walkQueue[0]. */
  let walkProgress = 0;
  /** Interactable to trigger once the walk finishes adjacent to it. */
  let pendingInteractable: Interactable | null = null;

  let viewportW = 0;
  let viewportH = 0;
  let camera: Camera = worldToScreen(spawn.x, spawn.y);
  let hoverTile: TilePoint | null = null;

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
    canvas.width = Math.round(viewportW * dpr);
    canvas.height = Math.round(viewportH * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera = clampCamera(camera, bounds, viewportW, viewportH);
  }

  function canvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function pickTile(cssX: number, cssY: number): TilePoint {
    return screenToTile(
      cssX - viewportW / 2 + camera.sx,
      cssY - viewportH / 2 + camera.sy,
    );
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
        camera = clampCamera(
          { sx: camera.sx - (p.x - lastPointer.x), sy: camera.sy - (p.y - lastPointer.y) },
          bounds,
          viewportW,
          viewportH,
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

  let rafId = 0;
  let lastTime: number | null = null;
  function frame(time: number): void {
    const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    stepWalk(dt);
    const view: RenderView = {
      map,
      camera,
      viewportW,
      viewportH,
      hoverTile,
      path: walkQueue,
      entities: [
        {
          spriteId: "player",
          position: playerPos,
          facing: playerFacing,
          moving: walkQueue.length > 0,
        },
      ],
      timeMs: time,
      dpr: window.devicePixelRatio || 1,
    };
    renderScene(ctx!, sprites, view);
    rafId = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", resize);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  rafId = requestAnimationFrame(frame);

  return {
    destroy(): void {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      setCursor("");
      ctx!.clearRect(0, 0, viewportW, viewportH);
    },
  };
}
