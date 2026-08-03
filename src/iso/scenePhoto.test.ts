// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUB_MAP_ID, requireMap } from "../data";
import { ENTRY_SPAWN_ID } from "./tilemap";
import { createIsoScene, type IsoScene, type ScenePhotoView } from "./scene";
import type { DayPhaseId, InteractableSpriteId } from "./tilemap";
import type { Sprite, SpriteProvider } from "./sprites";

/**
 * What photo mode does to a running scene, asked of a real one.
 *
 * The three claims that matter are all observable through the sprite
 * provider, which is the only thing the renderer talks to: the clock it
 * asks for art at stops and starts again where it stopped, nobody is
 * asked for a figure while the shot leaves people out, and the hour goes
 * back to the run's on the way out. The fourth — that the gameplay
 * camera is exactly where it was — is asked of the scene directly.
 */

let frames: FrameRequestCallback[] = [];

function flush(timeMs: number): void {
  const queued = frames;
  frames = [];
  for (const callback of queued) callback(timeMs);
}

function fakeSprite(): Sprite {
  return {
    image: { width: 128, height: 128 } as unknown as CanvasImageSource,
    anchorX: 64,
    anchorY: 96,
  };
}

interface RecordingSprites extends SpriteProvider {
  /** The clock the last frame asked for its ground at. */
  lastTileMs: number;
  tileCalls: number;
  entityCalls: number;
  /** Interactable kinds asked for since the counter was last cleared. */
  kinds: InteractableSpriteId[];
  phases: DayPhaseId[];
  clear(): void;
}

function recordingSprites(): RecordingSprites {
  const provider: RecordingSprites = {
    lastTileMs: -1,
    tileCalls: 0,
    entityCalls: 0,
    kinds: [],
    phases: [],
    clear(): void {
      provider.tileCalls = 0;
      provider.entityCalls = 0;
      provider.kinds = [];
    },
    tile(_id, _x, _y, timeMs): Sprite {
      provider.lastTileMs = timeMs;
      provider.tileCalls += 1;
      return fakeSprite();
    },
    prop: () => fakeSprite(),
    interactable(id): Sprite {
      provider.kinds.push(id);
      return fakeSprite();
    },
    interactableSilhouette: () => fakeSprite(),
    entity(): Sprite {
      provider.entityCalls += 1;
      return fakeSprite();
    },
    entitySilhouette: () => fakeSprite(),
    glow: () => fakeSprite(),
    rainStreak: () => fakeSprite(),
    splash: () => fakeSprite(),
    setPiece: () => fakeSprite(),
    setDayPhase(phase): void {
      provider.phases.push(phase);
    },
  };
  return provider;
}

/**
 * Every diamond the renderer lays on the ground — the marker under an
 * interactable, the walk preview, the cursor, a patrol's tinted tiles —
 * is a traced path, and nothing else in a frame traces one. Counting
 * them is how "the affordances left the frame" is asked without a
 * picture to look at.
 */
let diamonds = 0;

function recordingContext(): CanvasRenderingContext2D {
  const noop = (): void => {};
  return {
    beginPath: () => {
      diamonds += 1;
    },
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: false,
    canvas: { width: 0, height: 0 },
    font: "",
    textAlign: "left",
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    measureText: () => ({ width: 40 }),
    drawImage: noop,
    save: noop,
    restore: noop,
    translate: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    setLineDash: noop,
    createRadialGradient: () => ({ addColorStop: noop }),
    arc: noop,
  } as unknown as CanvasRenderingContext2D;
}

const map = requireMap(HUB_MAP_ID);

function shot(over: Partial<ScenePhotoView> = {}): ScenePhotoView {
  return {
    camera: { sx: 0, sy: 0 },
    zoom: 1,
    dayPhase: "dusk",
    weather: false,
    hideCharacters: false,
    ...over,
  };
}

let canvas: HTMLCanvasElement;
let sprites: RecordingSprites;
let scene: IsoScene;

beforeEach(() => {
  frames = [];
  canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { value: 1280 });
  Object.defineProperty(canvas, "clientHeight", { value: 720 });
  document.body.append(canvas);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => recordingContext(),
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  sprites = recordingSprites();
  scene = createIsoScene(canvas, {
    map,
    spawnId: ENTRY_SPAWN_ID,
    sprites,
    ambient: false,
    onInteract: () => {},
  });
});

afterEach(() => {
  scene.destroy();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("a scene with a shot being framed", () => {
  it("holds the clock, and starts it again where it stopped", () => {
    flush(1_000);
    expect(sprites.lastTileMs).toBe(1_000);
    flush(1_016);
    expect(sprites.lastTileMs).toBe(1_016);

    scene.setPhoto(shot());
    flush(1_032);
    const frozen = sprites.lastTileMs;
    // Two minutes spent choosing an angle, and the street has not moved.
    flush(60_000);
    expect(sprites.lastTileMs).toBe(frozen);
    flush(120_000);
    expect(sprites.lastTileMs).toBe(frozen);

    scene.setPhoto(null);
    flush(120_016);
    // Back on the clock it was held at, not the one the wall reached.
    expect(sprites.lastTileMs).toBeGreaterThanOrEqual(frozen);
    expect(sprites.lastTileMs).toBeLessThan(frozen + 1_000);
  });

  it("leaves every figure out when the shot asks for none", () => {
    flush(16);
    expect(sprites.entityCalls).toBeGreaterThan(0);

    scene.setPhoto(shot({ hideCharacters: true }));
    sprites.clear();
    flush(32);
    expect(sprites.entityCalls).toBe(0);

    scene.setPhoto(shot({ hideCharacters: false }));
    sprites.clear();
    flush(48);
    expect(sprites.entityCalls).toBeGreaterThan(0);
  });

  it("takes the ground affordances out of the frame", () => {
    diamonds = 0;
    flush(16);
    const marked = diamonds;
    expect(marked).toBeGreaterThan(0);

    scene.setPhoto(shot());
    diamonds = 0;
    sprites.clear();
    flush(32);
    expect(diamonds).toBe(0);
    // The map's furniture is still drawn — it is the marks that go.
    expect(sprites.kinds.length).toBeGreaterThan(0);

    scene.setPhoto(null);
    diamonds = 0;
    flush(48);
    expect(diamonds).toBe(marked);
  });

  it("stages the shot at another hour and puts the run's back", () => {
    flush(16);
    const before = [...sprites.phases];
    scene.setPhoto(shot({ dayPhase: "late" }));
    expect(sprites.phases.at(-1)).toBe("late");
    // Cycling within the shot re-bakes; asking for the same hour twice
    // does not.
    scene.setPhoto(shot({ dayPhase: "late" }));
    expect(sprites.phases.length).toBe(before.length + 1);

    scene.setPhoto(null);
    expect(sprites.phases.at(-1)).toBe(map.dayPhase ?? "night");
  });

  it("never touches the camera the player was walking with", () => {
    flush(16);
    const before = scene.viewCamera();
    scene.setPhoto(shot({ camera: { sx: 5_000, sy: 5_000 }, zoom: 3 }));
    flush(32);
    scene.setPhoto(shot({ camera: { sx: -5_000, sy: 0 }, zoom: 1 }));
    flush(48);
    expect(scene.viewCamera()).toEqual(before);
    scene.setPhoto(null);
    flush(64);
    expect(scene.viewCamera()).toEqual(before);
  });

  it("stops answering the keyboard while a shot is up", () => {
    flush(16);
    const before = scene.viewCamera();
    scene.setPhoto(shot());
    for (const key of ["ArrowRight", "+", "]"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    }
    flush(32);
    expect(scene.viewCamera()).toEqual(before);
  });

  it("has nothing to capture before it has drawn anything", () => {
    expect(scene.captureFrame()).toBeNull();
  });

  it("captures at the canvas's own device resolution", () => {
    const dpr = window.devicePixelRatio || 1;
    flush(16);
    const shot = scene.captureFrame();
    expect(shot?.width).toBe(Math.round(1280 * dpr));
    expect(shot?.height).toBe(Math.round(720 * dpr));
  });

  it("paints the held frame a second time, larger, for a doubled shot", () => {
    const dpr = window.devicePixelRatio || 1;
    scene.setPhoto(shot());
    flush(1_000);
    const frozen = sprites.lastTileMs;

    sprites.clear();
    const doubled = scene.captureFrame(2);
    expect(doubled?.width).toBe(Math.round(1280 * dpr * 2));
    expect(doubled?.height).toBe(Math.round(720 * dpr * 2));
    // A real second pass over the same instant, not a copy of a
    // bitmap: the ground was asked for again, at the frozen clock.
    expect(sprites.tileCalls).toBeGreaterThan(0);
    expect(sprites.lastTileMs).toBe(frozen);
  });
});
