// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireMap } from "../data/maps";
import { outlineColor } from "./affordance";
import { ART_SCALE } from "./art/pixel";
import { createPixelArtSprites } from "./art/provider";
import { mapPixelBounds } from "./camera";
import { renderScene, type FocusView, type RenderView } from "./render";

/**
 * The focus affordance through the real renderer, with a recording 2d
 * context: what is under test is the geometry — that the rim lands one
 * art pixel out on every side of the sprite it traces, that the name
 * chip sits above that sprite rather than through it, and that nothing
 * is outlined when nothing is in focus.
 */
interface ImageDraw {
  image: CanvasImageSource;
  x: number;
  y: number;
  alpha: number;
}

interface RectDraw {
  kind: "fill" | "stroke";
  x: number;
  y: number;
  w: number;
  h: number;
  style: string;
}

interface TextDraw {
  text: string;
  x: number;
  y: number;
  style: string;
}

interface DrawRecord {
  images: ImageDraw[];
  rects: RectDraw[];
  texts: TextDraw[];
}

function emptyRecord(): DrawRecord {
  return { images: [], rects: [], texts: [] };
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
    fillRect: (x: number, y: number, w: number, h: number): void => {
      record.rects.push({ kind: "fill", x, y, w, h, style: ctx.fillStyle });
    },
    strokeRect: (x: number, y: number, w: number, h: number): void => {
      record.rects.push({ kind: "stroke", x, y, w, h, style: ctx.strokeStyle });
    },
    measureText: (text: string) => ({ width: text.length * 8 }),
    fillText: (text: string, x: number, y: number): void => {
      record.texts.push({ text, x, y, style: ctx.fillStyle });
    },
    drawImage: (image: CanvasImageSource, x: number, y: number): void => {
      record.images.push({ image, x, y, alpha: ctx.globalAlpha });
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

const map = requireMap("greywater-steps");
const bounds = mapPixelBounds(map);
const sprites = createPixelArtSprites();
const target = map.interactables[0]!;
const TIME_MS = 2000;

function draw(focus: FocusView | null, timeMs = TIME_MS): DrawRecord {
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
    dpr: 2,
    zoom: 1,
    glowEnabled: false,
    focus,
  };
  renderScene(recordingContext(record), sprites, view);
  return record;
}

const focusView: FocusView = {
  interactableId: target.id,
  label: target.label,
  color: outlineColor(),
};

const silhouette = (): CanvasImageSource =>
  sprites.interactableSilhouette(
    target.spriteId,
    target.x,
    target.y,
    TIME_MS,
    outlineColor(),
  ).image;

/**
 * Where the rim says its sprite lands: the middle of the ring of
 * stamps. Read off the stamps rather than off a matching image so that
 * two things of the same kind sharing one baked canvas — which is the
 * whole point of the bake cache — cannot confuse the answer.
 */
function ringCenter(record: DrawRecord): { x: number; y: number } {
  const stamps = record.images.filter((d) => d.image === silhouette());
  const xs = stamps.map((d) => d.x);
  const ys = stamps.map((d) => d.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

describe("the focus outline", () => {
  it("rims the sprite one art pixel out on all eight sides", () => {
    const record = draw(focusView);
    const stamps = record.images.filter((d) => d.image === silhouette());
    expect(stamps).toHaveLength(8);

    // Every neighbour offset, once each, around exactly where the
    // sprite itself lands — so the rim reads as an outline rather than
    // a shadow leaning one way.
    const center = ringCenter(record);
    const offsets = stamps
      .map((d) => `${d.x - center.x},${d.y - center.y}`)
      .sort();
    const o = ART_SCALE;
    expect(offsets).toEqual(
      [
        [-o, -o],
        [-o, 0],
        [-o, o],
        [0, -o],
        [0, o],
        [o, -o],
        [o, 0],
        [o, o],
      ]
        .map(([dx, dy]) => `${dx},${dy}`)
        .sort(),
    );

    // And that middle is exactly where the sprite it traces is drawn.
    const sprite = sprites.interactable(target.spriteId, target.x, target.y, TIME_MS);
    expect(
      record.images.some(
        (d) => d.image === sprite.image && d.x === center.x && d.y === center.y,
      ),
    ).toBe(true);
  });

  it("draws the rim under the sprite, and softened", () => {
    const record = draw(focusView);
    const center = ringCenter(record);
    const sprite = sprites.interactable(target.spriteId, target.x, target.y, TIME_MS);
    const stampIndexes = record.images
      .map((d, i) => (d.image === silhouette() ? i : -1))
      .filter((i) => i >= 0);
    const lastStamp = Math.max(...stampIndexes);
    const own = record.images.findIndex(
      (d) => d.image === sprite.image && d.x === center.x && d.y === center.y,
    );
    // The sprite lands after its rim, so only the pixels outside the
    // shape survive.
    expect(own).toBeGreaterThan(lastStamp);
    // ...and the rim is drawn at less than full opacity, mid-pulse.
    for (const stamp of record.images) {
      if (stamp.image !== silhouette()) continue;
      expect(stamp.alpha).toBeGreaterThan(0);
      expect(stamp.alpha).toBeLessThan(1);
    }
    // Everything else on the map is drawn at full opacity.
    expect(record.images.at(-1)?.alpha).toBe(1);
  });

  it("holds the rim at its brightest when the clock is stopped", () => {
    // Reduced motion renders every frame at time zero. An outline that
    // pulsed up from nothing would sit at its faintest forever.
    const still = draw(focusView, 0);
    for (const stamp of still.images) {
      if (stamp.image !== silhouette()) continue;
      expect(stamp.alpha).toBe(1);
    }
  });

  it("outlines nothing at all when nothing is in focus", () => {
    const record = draw(null);
    expect(record.images.some((d) => d.image === silhouette())).toBe(false);
    expect(record.texts).toEqual([]);
  });
});

describe("the floating name chip", () => {
  it("names the thing in focus, above it, in the outline color", () => {
    const record = draw(focusView);
    const label = record.texts.find((t) => t.text === target.label);
    expect(label).toBeDefined();
    expect(label?.style).toBe(outlineColor());
    // Exactly one chip: the scene only ever hands over one focus.
    expect(record.texts).toHaveLength(1);

    const border = record.rects.find(
      (r) => r.kind === "stroke" && r.style === outlineColor(),
    );
    expect(border).toBeDefined();

    // The chip clears the top of the sprite it names rather than
    // overlapping it.
    expect(border!.y + border!.h).toBeLessThan(ringCenter(record).y);
  });

  it("sizes the chip to the label it holds", () => {
    const short = draw({ ...focusView, label: "Hi" });
    const long = draw({ ...focusView, label: "A Considerably Longer Name" });
    const widthOf = (record: DrawRecord): number =>
      record.rects.find((r) => r.kind === "stroke")?.w ?? 0;
    expect(widthOf(long)).toBeGreaterThan(widthOf(short));
  });
});
