// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, settings } from "../settings";
import { cameraTranslation, initialCamera } from "./camera";
import { createIsoScene, type IsoScene } from "./scene";
import type { EntityPose, Sprite, SpriteProvider } from "./sprites";
import { DOOR_TIMING, doorCycleMs } from "./transition";
import { buildMapGrid, type IsoMap } from "./tilemap";
import type { IsoExitHint } from "./events";

/**
 * The scene's doorway and arrival behaviour, driven frame by frame
 * through a stubbed rAF against a recording sprite provider. Rendering
 * itself is not under test — what is: which frame of a door's opening
 * the scene asks for, which exit it reports as in focus, which way an
 * arrival looks, and that the camera does not move between the first
 * two frames.
 */

interface InteractableCall {
  id: string;
  x: number;
  y: number;
  open: number;
}

const BLANK: Sprite = {
  image: {} as CanvasImageSource,
  anchorX: 0,
  anchorY: 0,
};

function recordingSprites(calls: InteractableCall[]): SpriteProvider {
  return {
    tile: () => BLANK,
    prop: () => BLANK,
    interactable: (id, x, y, _timeMs, open = 0) => {
      calls.push({ id, x, y, open });
      return BLANK;
    },
    entity: (_id: string, _pose: EntityPose) => BLANK,
    entitySilhouette: () => BLANK,
    glow: () => BLANK,
    rainStreak: () => BLANK,
    splash: () => BLANK,
  };
}

/** A 2D context that records only the camera translation it is given. */
function recordingContext(translates: Array<[number, number]>): unknown {
  const target = {
    translate(tx: number, ty: number): void {
      translates.push([tx, ty]);
    },
  };
  return new Proxy(target, {
    get: (t, prop) =>
      prop in t
        ? (t as Record<string | symbol, unknown>)[prop]
        : (): undefined => undefined,
    set: () => true,
  });
}

const legend = { ".": { tile: "pavement" as const } };
// Big enough that the camera has somewhere to scroll: on a map that
// fits the viewport the camera locks to the map's middle and would say
// nothing about whether it settled on the player.
const rows = Array.from({ length: 32 }, () => ".".repeat(32));
const grid = buildMapGrid(legend, rows);

function testMap(): IsoMap {
  return {
    id: "test-map",
    name: "Test Map",
    width: grid.width,
    height: grid.height,
    tiles: grid.tiles.map((row) => [...row]),
    props: [],
    interactables: [
      {
        id: "side-door",
        x: 16,
        y: 15,
        label: "Side Door",
        spriteId: "door",
        interaction: { kind: "dialogue", nodeId: "n1" },
        exit: { mapId: "elsewhere", entryId: "back-alley" },
      },
      {
        id: "kiosk",
        x: 2,
        y: 2,
        label: "Kiosk",
        spriteId: "terminal",
        interaction: { kind: "dialogue", nodeId: "n2" },
      },
    ],
    spawns: [
      { id: "player-start", x: 16, y: 16 },
      { id: "back-alley", x: 0, y: 4, facing: "e" },
    ],
  };
}

let pending: FrameRequestCallback | null = null;
let canvas: HTMLCanvasElement;
let scene: IsoScene | null = null;
const calls: InteractableCall[] = [];
let translates: Array<[number, number]> = [];

/** Runs one animation frame at the given clock reading. */
function frame(timeMs: number): void {
  const next = pending;
  pending = null;
  next?.(timeMs);
}

beforeEach(() => {
  settings.update({ ...DEFAULT_SETTINGS });
  calls.length = 0;
  translates = [];
  pending = null;
  canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { value: 800 });
  Object.defineProperty(canvas, "clientHeight", { value: 600 });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => recordingContext(translates) as CanvasRenderingContext2D,
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

describe("doorway openings", () => {
  it("plays the door open, holds it, and shuts it again", () => {
    const map = testMap();
    scene = createIsoScene(canvas, {
      map,
      spawnId: "player-start",
      onInteract: () => {},
      sprites: recordingSprites(calls),
      ambient: false,
    });

    // Idle: the door is drawn from its resting loop, never mid-swing.
    frame(0);
    expect(calls.filter((c) => c.id === "door").every((c) => c.open === 0)).toBe(
      true,
    );

    expect(scene.playOpening("side-door")).toBe(true);
    const openness = (timeMs: number): number => {
      calls.length = 0;
      frame(timeMs);
      return calls.find((c) => c.id === "door")?.open ?? -1;
    };

    // The first frame after the request starts the clock, so the door
    // is measured from there rather than from some earlier wall-time.
    expect(openness(1000)).toBe(0);
    expect(openness(1000 + DOOR_TIMING.openMs / 2)).toBeCloseTo(0.5, 6);
    expect(openness(1000 + DOOR_TIMING.openMs)).toBe(1);
    expect(openness(1000 + DOOR_TIMING.openMs + DOOR_TIMING.holdMs)).toBe(1);
    // ...then it shuts, and stays shut.
    expect(
      openness(1000 + doorCycleMs(DOOR_TIMING) - DOOR_TIMING.closeMs / 2),
    ).toBeCloseTo(0.5, 6);
    expect(openness(1000 + doorCycleMs(DOOR_TIMING))).toBe(0);
    expect(openness(9000)).toBe(0);
  });

  it("refuses to open what has no opening — and what is not there", () => {
    scene = createIsoScene(canvas, {
      map: testMap(),
      spawnId: "player-start",
      onInteract: () => {},
      sprites: recordingSprites(calls),
      ambient: false,
    });
    expect(scene.playOpening("kiosk")).toBe(false);
    expect(scene.playOpening("no-such-thing")).toBe(false);
    calls.length = 0;
    frame(0);
    expect(calls.every((c) => c.open === 0)).toBe(true);
  });

  it("reduced motion never catches a door part-way open", () => {
    settings.update({ reducedMotion: true });
    scene = createIsoScene(canvas, {
      map: testMap(),
      spawnId: "player-start",
      onInteract: () => {},
      sprites: recordingSprites(calls),
      ambient: false,
    });
    scene.playOpening("side-door");
    for (const time of [0, 50, 130, 400, 800]) {
      calls.length = 0;
      frame(time);
      expect(calls.find((c) => c.id === "door")?.open, `at ${time}ms`).toBe(0);
    }
  });
});

describe("exit hints", () => {
  function mount(spawnId: string, onExitHint: (h: IsoExitHint | null) => void) {
    scene = createIsoScene(canvas, {
      map: testMap(),
      spawnId,
      onInteract: () => {},
      onExitHint,
      sprites: recordingSprites(calls),
      ambient: false,
    });
  }

  it("names the exit the player is stood beside", () => {
    const hints: Array<IsoExitHint | null> = [];
    // player-start (16, 16) is the tile directly below the door.
    mount("player-start", (hint) => hints.push(hint));
    frame(0);
    expect(hints).toEqual([
      {
        interactableId: "side-door",
        label: "Side Door",
        mapId: "elsewhere",
        reason: "nearby",
      },
    ]);
  });

  it("lays the shared exit marker under a way out that is not one", () => {
    // The door leads off the map, so it gets the same lit ring in its
    // tile that a stair or a tram arch is drawn as — one affordance,
    // whatever the thing standing on it looks like.
    mount("player-start", () => {});
    frame(0);
    const marker = calls.find((c) => c.id === "exit");
    expect(marker).toEqual({ id: "exit", x: 16, y: 15, open: 0 });
    // The kiosk goes nowhere, so nothing is laid under it.
    expect(calls.filter((c) => c.id === "exit")).toHaveLength(1);
  });

  it("stays quiet away from any exit, and reports only on change", () => {
    const hints: Array<IsoExitHint | null> = [];
    mount("back-alley", (hint) => hints.push(hint));
    frame(0);
    frame(16);
    frame(32);
    expect(hints).toEqual([]);
  });
});

describe("arrival", () => {
  it("faces the way the entry point says, not the way it last walked", () => {
    // The authored facing on "back-alley" is east; the sprite the scene
    // asks for on its very first frame must already use it.
    const poses: EntityPose[] = [];
    const sprites = recordingSprites(calls);
    scene = createIsoScene(canvas, {
      map: testMap(),
      spawnId: "back-alley",
      onInteract: () => {},
      sprites: {
        ...sprites,
        entity: (_id: string, pose: EntityPose) => {
          poses.push(pose);
          return BLANK;
        },
      },
      ambient: false,
    });
    frame(0);
    expect(poses[0]?.facing).toBe("e");
    expect(poses[0]?.moving).toBe(false);
  });

  it("opens with the camera already on the player — no first-frame jump", () => {
    const map = testMap();
    scene = createIsoScene(canvas, {
      map,
      spawnId: "player-start",
      onInteract: () => {},
      sprites: recordingSprites(calls),
      ambient: false,
    });
    frame(0);
    frame(16);
    expect(translates.length).toBeGreaterThanOrEqual(2);
    // The second frame draws from exactly where the first one did.
    expect(translates[1]).toEqual(translates[0]);

    // And that place is the settled camera for this spawn, not some
    // default the scene would have corrected on a later frame.
    const settled = initialCamera(map, { x: 16, y: 16 }, 800, 600, 1);
    const expected = cameraTranslation(settled, 800, 600, 1, 1);
    expect(translates[0]).toEqual([expected.tx, expected.ty]);
  });
});
