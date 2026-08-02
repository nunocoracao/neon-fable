// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUB_MAP_ID, requireMap } from "../data/maps";
import { ART_SCALE } from "./art/pixel";
import { createPixelArtSprites, type PixelArtSprites } from "./art/provider";
import { SETPIECE_ART } from "./art/setpieces";
import { worldToScreen } from "./coords";
import { renderScene, type RenderView } from "./render";
import { collectSetPieces, trainDraws } from "./setpiece";
import type { TrainTrack } from "./tilemap";

/**
 * Set pieces through the real renderer, with a recording 2d context.
 * What is under test is the geometry the pure pass cannot check on its
 * own: that an elevated piece is drawn its declared height above the
 * tile it sorts at, and that it lands in painter's order among the
 * props rather than on top of them — which is the whole claim behind
 * "the overline passes behind the terrace".
 */
interface ImageDraw {
  image: CanvasImageSource;
  x: number;
  y: number;
}

function recordingContext(images: ImageDraw[]): CanvasRenderingContext2D {
  const noop = (): void => {};
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: false,
    canvas: { width: 0, height: 0 },
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    measureText: (text: string) => ({ width: text.length * 8 }),
    fillText: noop,
    drawImage: (image: CanvasImageSource, x: number, y: number): void => {
      images.push({ image, x, y });
    },
    save: noop,
    restore: noop,
    translate: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    createRadialGradient: () => ({ addColorStop: noop }),
    arc: noop,
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        fillStyle: "",
        fillRect: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
      }) as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const hub = requireMap(HUB_MAP_ID);

function requireTrack(): TrainTrack {
  const track = hub.setPieces?.trains?.[0];
  if (!track) throw new Error("the hub declares no overline");
  return track;
}

/** A moment the hub's overline is mid-crossing, found off its own schedule. */
function crossingTimeMs(): number {
  const track = requireTrack();
  for (let t = 0; t < track.periodMs * 2; t += 50) {
    const head = trainDraws(track, t)[0];
    if (head && head.x > 4 && head.x < hub.width - 4) return t;
  }
  throw new Error("the overline never crosses the hub");
}

/**
 * One rendered frame, with the provider that baked it: image identity
 * is per provider (bakes are cached on it), so anything comparing what
 * was drawn against a sprite lookup has to use this same one.
 */
function render(
  timeMs: number,
  setPieces: RenderView["setPieces"],
): { images: ImageDraw[]; sprites: PixelArtSprites } {
  const images: ImageDraw[] = [];
  const sprites = createPixelArtSprites();
  renderScene(recordingContext(images), sprites, {
    map: hub,
    // Framed wide enough to hold the whole line, viaduct to viaduct:
    // the overline crosses well past the edge of a playing viewport, and
    // where each car lands is the assertion, not whether the camera was
    // pointed at it (culling is ./cull.ts's business, tested there).
    camera: worldToScreen(7, 6),
    viewportW: 4096,
    viewportH: 2304,
    hoverTile: null,
    path: [],
    entities: [],
    timeMs,
    dpr: 1,
    zoom: 1,
    glowEnabled: false,
    setPieces,
  });
  return { images, sprites };
}

/** Every canvas the train's own art bakes to, on one provider. */
function trainCanvases(sprites: PixelArtSprites): Set<CanvasImageSource> {
  const canvases = new Set<CanvasImageSource>();
  for (const id of ["train-head", "train-car"] as const) {
    SETPIECE_ART[id].frames.forEach((_, frame) => {
      canvases.add(sprites.setPiece(id, frame).image);
    });
  }
  return canvases;
}

describe("set pieces in the scene", () => {
  it("draws an elevated piece its declared height above the tile it sorts at", () => {
    const timeMs = crossingTimeMs();
    const head = collectSetPieces(hub, timeMs, { motion: true }).find(
      (piece) => piece.spriteId === "train-head",
    );
    expect(head).toBeDefined();
    if (!head) return;

    const { images, sprites } = render(
      timeMs,
      collectSetPieces(hub, timeMs, { motion: true }),
    );
    const sprite = sprites.setPiece("train-head", head.frame);
    const { sx, sy } = worldToScreen(head.x, head.y);
    const grounded = Math.round(sy - sprite.anchorY);
    const expectedX = Math.round(sx - sprite.anchorX);
    const expectedY = grounded + head.offsetY * ART_SCALE;
    const drawn = images.find(
      (img) =>
        img.image === sprite.image &&
        Math.abs(img.x - expectedX) < 1 &&
        Math.abs(img.y - expectedY) < 1,
    );
    expect(drawn, "lead car drawn at its elevated position").toBeDefined();
    // The elevation is what put it there: on the ground it would be
    // an art-scaled height further down the screen.
    expect(expectedY).toBe(grounded - requireTrack().heightPx * ART_SCALE);
  });

  it("passes the overline behind the terrace it crosses", () => {
    const timeMs = crossingTimeMs();
    const { images, sprites } = render(
      timeMs,
      collectSetPieces(hub, timeMs, { motion: true }),
    );
    const cars = trainCanvases(sprites);
    const trainAt = images.flatMap((img, i) => (cars.has(img.image) ? [i] : []));
    expect(trainAt.length).toBeGreaterThan(0);

    // The north terrace is a row of wall props in front of the line.
    const wall = sprites.prop("building", 6, 0, timeMs).image;
    const wallAt = images.flatMap((img, i) => (img.image === wall ? [i] : []));
    expect(wallAt.length).toBeGreaterThan(0);
    // Painter's order is what does the occluding, so the order is the
    // assertion: every car is laid down before the terrace covers it.
    expect(Math.max(...trainAt)).toBeLessThan(Math.max(...wallAt));
  });

  it("adds nothing to a frame that declares no set pieces", () => {
    const timeMs = crossingTimeMs();
    const bare = render(timeMs, []).images;
    const dressed = render(
      timeMs,
      collectSetPieces(hub, timeMs, { motion: true }),
    ).images;
    expect(dressed.length).toBeGreaterThan(bare.length);
    // And the difference is exactly the machinery, not a shifted scene.
    expect(dressed.length - bare.length).toBe(
      collectSetPieces(hub, timeMs, { motion: true }).length,
    );
  });
});
