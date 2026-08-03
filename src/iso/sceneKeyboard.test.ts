// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, settings } from "../settings";
import { createIsoScene, type IsoScene } from "./scene";
import type { EntityPose, Sprite, SpriteProvider } from "./sprites";
import { buildMapGrid, type IsoMap } from "./tilemap";
import type { IsoFocusHint, IsoInteractionEvent } from "./events";
import type { MinimapView } from "./minimap";
import type { TilePoint } from "./coords";

/**
 * Keyboard exploration: the route across a map for a player with no
 * pointer. Before the accessibility pass the scene answered three keys
 * — zoom in, zoom out, and act on whatever happened to be within arm's
 * reach — which meant the map itself could only be crossed by clicking
 * it. These are the keys that close that gap: a step, a pick, and the
 * walk a pick asks for.
 */

const BLANK: Sprite = {
  image: {} as CanvasImageSource,
  anchorX: 0,
  anchorY: 0,
};

function blankSprites(): SpriteProvider {
  return {
    tile: () => BLANK,
    prop: () => BLANK,
    interactable: () => BLANK,
    interactableSilhouette: () => BLANK,
    entity: (_id: string, _pose: EntityPose) => BLANK,
    entitySilhouette: () => BLANK,
    glow: () => BLANK,
    rainStreak: () => BLANK,
    setPiece: () => BLANK,
    splash: () => BLANK,
  };
}

function stubContext(): unknown {
  const target = { measureText: (text: string) => ({ width: text.length * 8 }) };
  return new Proxy(target, {
    get: (t, prop) =>
      prop in t
        ? (t as Record<string | symbol, unknown>)[prop]
        : (): undefined => undefined,
    set: () => true,
  });
}

// A short corridor with a wall in it, so a step into stone can be told
// apart from a step onto pavement.
const legend = {
  ".": { tile: "pavement" as const },
  "#": { tile: "canal" as const },
};
const rows = [
  "........",
  "........",
  "..#.....",
  "........",
  "........",
  "........",
  "........",
  "........",
];
const grid = buildMapGrid(legend, rows);

function testMap(): IsoMap {
  return {
    id: "keys-map",
    name: "Keys Map",
    width: grid.width,
    height: grid.height,
    tiles: grid.tiles.map((row) => [...row]),
    props: [],
    interactables: [
      {
        id: "near-door",
        x: 4,
        y: 3,
        label: "Near Door",
        spriteId: "door",
        interaction: { kind: "dialogue", nodeId: "n1" },
      },
      {
        id: "far-kiosk",
        x: 1,
        y: 6,
        label: "Far Kiosk",
        spriteId: "terminal",
        interaction: { kind: "dialogue", nodeId: "n2" },
      },
    ],
    spawns: [{ id: "player-start", x: 4, y: 4 }],
  };
}

let pending: FrameRequestCallback | null = null;
let canvas: HTMLCanvasElement;
let scene: IsoScene | null = null;
let views: MinimapView[] = [];
let hints: Array<IsoFocusHint | null> = [];
let interactions: IsoInteractionEvent[] = [];

/** The frame clock, which only ever moves forwards. */
let clock = 0;

function frame(stepMs = 16): void {
  clock += stepMs;
  const next = pending;
  pending = null;
  next?.(clock);
}

/** Runs enough frames for any queued walk to finish. */
function settle(): void {
  for (let i = 0; i < 60; i++) frame(100);
}

function playerTile(): TilePoint | null {
  const last = views[views.length - 1];
  return last ? last.playerTile : null;
}

function press(key: string, target?: EventTarget): void {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  (target ?? window).dispatchEvent(event);
}

function build(options: { keyboardEnabled?: () => boolean } = {}): void {
  scene = createIsoScene(canvas, {
    map: testMap(),
    spawnId: "player-start",
    sprites: blankSprites(),
    ambient: false,
    onInteract: (event) => interactions.push(event),
    onFocus: (hint) => hints.push(hint),
    onView: (view) => views.push(view),
    ...options,
  });
  frame();
}

beforeEach(() => {
  settings.update({ ...DEFAULT_SETTINGS });
  views = [];
  hints = [];
  interactions = [];
  pending = null;
  clock = 0;
  canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { value: 800 });
  Object.defineProperty(canvas, "clientHeight", { value: 600 });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => stubContext() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  document.body.append(canvas);
});

afterEach(() => {
  scene?.destroy();
  scene = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("walking with the keyboard", () => {
  it("steps one tile per press, in the arrow's direction", () => {
    build();
    expect(playerTile()).toEqual({ x: 4, y: 4 });

    press("ArrowDown");
    settle();
    expect(playerTile()).toEqual({ x: 4, y: 5 });

    press("ArrowLeft");
    settle();
    expect(playerTile()).toEqual({ x: 3, y: 5 });
  });

  it("takes WASD as the same four steps, in any case", () => {
    build();
    press("s");
    settle();
    press("D");
    settle();
    expect(playerTile()).toEqual({ x: 5, y: 5 });
  });

  it("stays put when the step is into something solid", () => {
    build();
    // The wall is at (2,2); come at it from directly south.
    for (const key of ["ArrowLeft", "ArrowLeft", "ArrowUp"]) {
      press(key);
      settle();
    }
    expect(playerTile()).toEqual({ x: 2, y: 3 });
    press("ArrowUp");
    settle();
    expect(playerTile()).toEqual({ x: 2, y: 3 });
  });

  it("steps onto an interactable by walking up to it and triggering it", () => {
    build();
    // The door sits at (4,3), one north of the spawn.
    press("ArrowUp");
    settle();
    expect(interactions.map((event) => event.interactableId)).toEqual([
      "near-door",
    ]);
  });

  it("answers no key at all while the shell owns the keyboard", () => {
    build({ keyboardEnabled: () => false });
    press("ArrowDown");
    settle();
    expect(playerTile()).toEqual({ x: 4, y: 4 });
    expect(interactions).toEqual([]);
  });

  it("leaves keys pressed on a control to that control", () => {
    build();
    const button = document.createElement("button");
    document.body.append(button);
    press("ArrowDown", button);
    settle();
    expect(playerTile()).toEqual({ x: 4, y: 4 });
  });
});

describe("picking a target with the keyboard", () => {
  it("walks the pick round the map nearest first, and back again", () => {
    build();
    hints.length = 0;

    press("]");
    frame();
    expect(hints.at(-1)).toMatchObject({
      interactableId: "near-door",
      reason: "picked",
    });

    press("]");
    frame();
    expect(hints.at(-1)).toMatchObject({
      interactableId: "far-kiosk",
      reason: "picked",
      inRange: false,
    });

    press("[");
    frame();
    expect(hints.at(-1)?.interactableId).toBe("near-door");
  });

  it("drops the pick on Escape, falling back to what is in reach", () => {
    build();
    press("]");
    press("]");
    frame();
    expect(hints.at(-1)?.interactableId).toBe("far-kiosk");
    press("Escape");
    frame();
    // Nothing picked: the door beside the player is what is offered.
    expect(hints.at(-1)).toMatchObject({
      interactableId: "near-door",
      reason: "nearby",
    });
  });

  it("Enter on a picked target across the map walks there and acts", () => {
    build();
    press("]");
    press("]");
    frame();
    expect(hints.at(-1)?.interactableId).toBe("far-kiosk");
    expect(interactions).toEqual([]);

    press("Enter");
    settle();
    expect(interactions.map((event) => event.interactableId)).toEqual([
      "far-kiosk",
    ]);
  });

  it("Enter with nothing picked acts on what is already in reach", () => {
    build();
    press("Enter");
    expect(interactions.map((event) => event.interactableId)).toEqual([
      "near-door",
    ]);
  });

  it("a step forgets the pick — it was about where you were standing", () => {
    build();
    press("]");
    press("]");
    frame();
    expect(hints.at(-1)?.interactableId).toBe("far-kiosk");
    press("ArrowDown");
    settle();
    expect(hints.at(-1)?.reason).not.toBe("picked");
  });
});
