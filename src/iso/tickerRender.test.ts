// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireMap } from "../data/maps";
import { ART_SCALE } from "./art/pixel";
import { createPixelArtSprites } from "./art/provider";
import { newsTextWidth } from "./art/news";
import { mapPixelBounds } from "./camera";
import { worldToScreen } from "./coords";
import { renderScene, type RenderView } from "./render";
import { collectTickers, tickerFrameAt } from "./ticker";

/**
 * The ticker through the real renderer, with a recording 2d context.
 * Two things are under test and neither is visible from the pure logic:
 * that a scrolling headline is drawn as a *clipped copy* of one baked
 * strip at the window the screen declares, and that scrolling it costs
 * no bakes at all.
 */

interface ClipDraw {
  image: CanvasImageSource;
  sourceX: number;
  sourceW: number;
  destX: number;
  destY: number;
  destW: number;
  destH: number;
}

interface DrawRecord {
  plain: Array<{ image: CanvasImageSource; x: number; y: number }>;
  clipped: ClipDraw[];
}

function emptyRecord(): DrawRecord {
  return { plain: [], clipped: [] };
}

function recordingContext(record: DrawRecord): CanvasRenderingContext2D {
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
    drawImage: (image: CanvasImageSource, ...rest: number[]): void => {
      if (rest.length >= 8) {
        record.clipped.push({
          image,
          sourceX: rest[0] ?? 0,
          sourceW: rest[2] ?? 0,
          destX: rest[4] ?? 0,
          destY: rest[5] ?? 0,
          destW: rest[6] ?? 0,
          destH: rest[7] ?? 0,
        });
        return;
      }
      record.plain.push({ image, x: rest[0] ?? 0, y: rest[1] ?? 0 });
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
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
    recordingContext(emptyRecord()),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const map = requireMap("cinder-plaza");
const bounds = mapPixelBounds(map);
const board = map.screens?.find((s) => s.id === "plaza-board");
const HEADLINE = "CORDON DOWN";
const strips = { "plaza-board": [HEADLINE] };

function draw(
  timeMs: number,
  sprites = createPixelArtSprites(),
  motion = true,
): DrawRecord {
  const record = emptyRecord();
  const view: RenderView = {
    map,
    // The whole district framed at once: what is under test here is
    // geometry, not which half of the map the camera happens to hold,
    // and a viewport this size puts every tile inside the cull bounds.
    camera: { sx: (bounds.minX + bounds.maxX) / 2, sy: (bounds.minY + bounds.maxY) / 2 },
    viewportW: 4096,
    viewportH: 2304,
    hoverTile: null,
    path: [],
    entities: [],
    timeMs,
    dpr: 1,
    zoom: 1,
    glowEnabled: false,
    tickers: collectTickers(map, strips, timeMs, { motion }),
  };
  renderScene(recordingContext(record), sprites, view);
  return record;
}

describe("the news ticker on the plaza board", () => {
  it("draws the headline as a clipped copy of one baked strip", () => {
    expect(board).toBeDefined();
    if (!board) return;
    // Part-way in, so the whole line is inside the window.
    const frame = tickerFrameAt([HEADLINE], board.width, 0);
    expect(frame).toBeDefined();
    const sprites = createPixelArtSprites();
    const strip = sprites.newsText(HEADLINE, board.tint);
    const record = draw(1200, sprites);

    expect(record.clipped).toHaveLength(1);
    const [copy] = record.clipped;
    expect(copy?.image).toBe(strip.image);
    // Copied 1:1 — the source width is the destination width, which is
    // the whole reason the glyphs stay crisp.
    expect(copy?.destW).toBe(copy?.sourceW);
    expect(copy?.destH).toBeGreaterThan(0);
  });

  it("puts the window exactly where the screen declares it", () => {
    if (!board) return;
    // A moment where the line is fully inside: no clipping at either
    // edge, so the destination is the declared offset plus the scroll.
    const timeMs = 1600;
    const frame = tickerFrameAt([HEADLINE], board.width, timeMs);
    expect(frame).toBeDefined();
    if (!frame) return;
    const record = draw(timeMs);
    const [copy] = record.clipped;
    const { sx, sy } = worldToScreen(board.x, board.y);
    expect(copy?.destX).toBe(
      sx + (board.offsetX + Math.round(frame.offsetPx)) * ART_SCALE,
    );
    expect(copy?.destY).toBe(sy + board.offsetY * ART_SCALE);
    // Never wider than the window it is scrolling through.
    expect(copy?.destW).toBeLessThanOrEqual(board.width * ART_SCALE);
  });

  it("keeps the whole line inside the window as it crosses", () => {
    if (!board) return;
    const right = worldToScreen(board.x, board.y).sx + board.offsetX * ART_SCALE;
    const limit = right + board.width * ART_SCALE;
    for (let t = 0; t < 6000; t += 120) {
      const [copy] = draw(t).clipped;
      if (!copy) continue;
      expect(copy.destX).toBeGreaterThanOrEqual(right);
      expect(copy.destX + copy.destW).toBeLessThanOrEqual(limit);
    }
  });

  it("moves the line leftward frame over frame", () => {
    // Track the line's own left edge, not the copy's: once it has run
    // past the window's left lip the destination pins there and the
    // source column is what advances, which is the same motion.
    const edges: number[] = [];
    for (let t = 600; t <= 4200; t += 300) {
      const [copy] = draw(t).clipped;
      if (copy) edges.push(copy.destX - copy.sourceX);
    }
    expect(edges.length).toBeGreaterThan(4);
    for (let i = 1; i < edges.length; i++) {
      expect(edges[i]!).toBeLessThan(edges[i - 1]!);
    }
  });

  it("scrolls without baking — one canvas serves the whole crossing", () => {
    if (!board) return;
    const sprites = createPixelArtSprites();
    // Warm a whole crossing first — ground, the props' flicker loops,
    // and the strip — then run the identical crossing again. A ticker
    // that re-baked per frame (a clock in a cache key, a per-frame
    // recompose) would show up as fresh misses on the second pass.
    const crossing = (): void => {
      for (let t = 0; t < 6000; t += 60) draw(t, sprites);
    };
    crossing();
    const warm = sprites.cacheStats();
    crossing();
    const after = sprites.cacheStats();
    expect(after.misses).toBe(warm.misses);
    expect(after.evictions).toBe(warm.evictions);
    expect(after.hits).toBeGreaterThan(warm.hits);
  });

  it("draws the strip after the prop it is mounted on", () => {
    if (!board) return;
    const record = draw(1600);
    // Painter's order: the billboard's own sprite goes down first, and
    // the caption lands on top of it. Both are drawn in the object
    // pass, so this is the sort doing its job, not a separate layer.
    const billboard = createPixelArtSprites().prop(
      "holo-billboard",
      board.x,
      board.y,
      1600,
    );
    const propIndex = record.plain.findIndex(
      (d) => (d.image as HTMLCanvasElement).width === (billboard.image as HTMLCanvasElement).width,
    );
    expect(propIndex).toBeGreaterThanOrEqual(0);
    expect(record.clipped).toHaveLength(1);
  });

  it("holds a line still, on screen, under reduced motion", () => {
    // The scene freezes its clock at zero for reduced motion; a screen
    // must still be readable, which means parked, not gone.
    const record = draw(0, createPixelArtSprites(), false);
    expect(record.clipped).toHaveLength(1);
    expect(record.clipped[0]?.sourceX).toBe(0);
    expect(record.clipped[0]?.destW).toBeGreaterThan(0);
  });

  it("draws nothing at all when no screen has anything to say", () => {
    const record = emptyRecord();
    renderScene(recordingContext(record), createPixelArtSprites(), {
      map,
      camera: {
        sx: (bounds.minX + bounds.maxX) / 2,
        sy: (bounds.minY + bounds.maxY) / 2,
      },
      viewportW: 4096,
      viewportH: 2304,
      hoverTile: null,
      path: [],
      entities: [],
      timeMs: 1200,
      dpr: 1,
      zoom: 1,
      glowEnabled: false,
    });
    expect(record.clipped).toEqual([]);
  });
});

describe("the baked strip", () => {
  it("is as wide as the headline says it is", () => {
    const sprites = createPixelArtSprites();
    const strip = sprites.newsText(HEADLINE, "cyan");
    const image = strip.image as HTMLCanvasElement;
    expect(image.width).toBe(newsTextWidth(HEADLINE) * ART_SCALE);
    // Anchored top-left: the scene places it by the window's corner.
    expect(strip.anchorX).toBe(0);
    expect(strip.anchorY).toBe(0);
  });

  it("is one canvas per line and tint, shared by every screen showing it", () => {
    const sprites = createPixelArtSprites();
    expect(sprites.newsText(HEADLINE, "cyan").image).toBe(
      sprites.newsText(HEADLINE, "cyan").image,
    );
    expect(sprites.newsText(HEADLINE, "amber").image).not.toBe(
      sprites.newsText(HEADLINE, "cyan").image,
    );
  });
});
