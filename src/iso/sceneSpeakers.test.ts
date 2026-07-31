// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, settings } from "../settings";
import { initialCamera, worldToViewport } from "./camera";
import { worldToScreen } from "./coords";
import { BODY_FRAME } from "./art/layers/body";
import { ART_SCALE } from "./art/pixel";
import type { SceneSpeakerFrame } from "./events";
import { createIsoScene, type IsoScene } from "./scene";
import type { EntityPose, Sprite, SpriteProvider } from "./sprites";
import { buildMapGrid, type IsoMap } from "./tilemap";

/**
 * What the scene reports about who is standing on the map: the crowd,
 * the named people, and whoever is walking with the player, each with
 * the point above their head in viewport pixels. This is the whole
 * surface the bark layer is built on — the scene names ids and
 * positions and nothing else, and never learns what anybody says.
 */

const BLANK: Sprite = {
  image: {} as CanvasImageSource,
  anchorX: 0,
  anchorY: 0,
};

const sprites: SpriteProvider = {
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

function inertContext(): unknown {
  const target = { measureText: (text: string) => ({ width: text.length * 8 }) };
  return new Proxy(target, {
    get: (t, prop) =>
      prop in t
        ? (t as Record<string | symbol, unknown>)[prop]
        : (): undefined => undefined,
    set: () => true,
  });
}

const legend = { ".": { tile: "pavement" as const } };
const grid = buildMapGrid(
  legend,
  Array.from({ length: 20 }, () => ".".repeat(20)),
);

function testMap(): IsoMap {
  return {
    id: "speaker-map",
    name: "Speaker Map",
    width: grid.width,
    height: grid.height,
    tiles: grid.tiles.map((row) => [...row]),
    props: [],
    interactables: [
      {
        id: "hawker",
        x: 9,
        y: 10,
        label: "Hawker",
        spriteId: "npc",
        interaction: { kind: "dialogue", nodeId: "n1" },
      },
      {
        id: "kiosk",
        x: 8,
        y: 10,
        label: "Kiosk",
        spriteId: "terminal",
        interaction: { kind: "dialogue", nodeId: "n2" },
      },
    ],
    spawns: [{ id: "player-start", x: 10, y: 10 }],
    ambient: {
      count: 2,
      zones: [{ id: "row", x: 8, y: 8, width: 4, height: 3 }],
    },
    weather: "rain",
    dayPhase: "late",
  };
}

let pending: FrameRequestCallback | null = null;
let canvas: HTMLCanvasElement;
let scene: IsoScene | null = null;
let frames: SceneSpeakerFrame[] = [];

function frame(timeMs: number): void {
  const next = pending;
  pending = null;
  next?.(timeMs);
}

/** The most recent frame the scene reported. */
function latest(): SceneSpeakerFrame {
  const last = frames[frames.length - 1];
  if (!last) throw new Error("the scene reported no speakers at all");
  return last;
}

function mount(options: { followerSpriteId?: string | null } = {}): void {
  scene = createIsoScene(canvas, {
    map: testMap(),
    spawnId: "player-start",
    onInteract: () => {},
    onSpeakers: (next) => frames.push(next),
    sprites,
    ...options,
  });
}

beforeEach(() => {
  settings.update({ ...DEFAULT_SETTINGS });
  frames = [];
  pending = null;
  canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { value: 800 });
  Object.defineProperty(canvas, "clientHeight", { value: 600 });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => inertContext() as CanvasRenderingContext2D,
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

describe("scene speakers", () => {
  it("reports the crowd, the people, and nobody else", () => {
    mount();
    frame(0);
    const { speakers } = latest();
    const pedestrians = speakers.filter((s) => s.kind === "pedestrian");
    expect(pedestrians).toHaveLength(2);
    // Zone membership rides along so a hawking line can belong to the
    // stall row rather than to the whole district.
    expect(pedestrians.every((s) => s.zoneId === "row")).toBe(true);
    expect(pedestrians.every((s) => s.refId === null)).toBe(true);

    const npcs = speakers.filter((s) => s.kind === "npc");
    expect(npcs.map((s) => s.refId)).toEqual(["hawker"]);
    // The terminal is furniture, and furniture does not talk.
    expect(speakers.some((s) => s.refId === "kiosk")).toBe(false);
    expect(speakers.some((s) => s.kind === "companion")).toBe(false);
  });

  it("reports the companion only while somebody is walking with you", () => {
    mount({ followerSpriteId: "companion:vesper:quays-runner" });
    frame(0);
    const companion = latest().speakers.find((s) => s.kind === "companion");
    expect(companion?.refId).toBe("companion:vesper:quays-runner");
    expect(companion?.id).toBe("companion");

    scene!.setFollower(null);
    frame(16);
    expect(latest().speakers.some((s) => s.kind === "companion")).toBe(false);
  });

  it("anchors a chip above the head, where the camera puts it", () => {
    const map = testMap();
    mount();
    frame(0);
    const npc = latest().speakers.find((s) => s.kind === "npc")!;

    // The scene opens centred on the player, so the chip's point is
    // that camera's view of the NPC's tile, lifted clear of the figure.
    const camera = initialCamera(map, { x: 10, y: 10 }, 800, 600, 1);
    const tile = worldToScreen(9, 10);
    const feet = worldToViewport(camera, 800, 600, 1, tile.sx, tile.sy);
    expect(npc.anchorX).toBeCloseTo(feet.x, 6);
    expect(npc.anchorY).toBeLessThan(feet.y);
    // Clear of the top of the skull the body layer authors (the anchor
    // is the shadow, the head starts BODY_FRAME.head.top rows above
    // it), and not so far clear that the chip floats off on its own.
    const headTopPx = (BODY_FRAME.anchorY - BODY_FRAME.head.top) * ART_SCALE;
    const lift = feet.y - npc.anchorY;
    expect(lift).toBeGreaterThan(headTopPx);
    expect(lift).toBeLessThan(headTopPx * 1.5);
    expect(npc.onScreen).toBe(true);
    expect(npc.distance).toBe(1);
  });

  it("marks somebody the camera has left behind as off screen", () => {
    scene = createIsoScene(canvas, {
      map: {
        ...testMap(),
        // A far corner of the map, well outside an 800x600 viewport
        // centred on the player.
        interactables: [
          {
            id: "far-watcher",
            x: 0,
            y: 0,
            label: "Watcher",
            spriteId: "npc",
            interaction: { kind: "dialogue", nodeId: "n3" },
          },
        ],
      },
      spawnId: "player-start",
      onInteract: () => {},
      onSpeakers: (next) => frames.push(next),
      sprites,
      ambient: false,
    });
    frame(0);
    const watcher = latest().speakers.find((s) => s.refId === "far-watcher");
    expect(watcher?.onScreen).toBe(false);
  });

  it("counts how long the player has stood still", () => {
    mount();
    frame(1000);
    expect(latest().lingerMs).toBe(0);
    frame(4000);
    expect(latest().lingerMs).toBe(3000);
    expect(latest().timeMs).toBe(4000);
  });

  it("reports the district's own sky, whatever the effects setting says", () => {
    mount();
    frame(0);
    expect(latest().mapId).toBe("speaker-map");
    expect(latest().weather).toBe("rain");
    expect(latest().dayPhase).toBe("late");

    // Turning the rain *effects* off does not stop it raining: a line
    // about the weather is content, not a visual pass.
    settings.update({ weather: false });
    frame(16);
    expect(latest().weather).toBe("rain");
  });

  it("says nothing at all when nobody asked to hear it", () => {
    scene = createIsoScene(canvas, {
      map: testMap(),
      spawnId: "player-start",
      onInteract: () => {},
      sprites,
    });
    frame(0);
    frame(16);
    expect(frames).toEqual([]);
  });
});
