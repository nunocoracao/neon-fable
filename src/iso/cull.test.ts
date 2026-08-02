import { describe, expect, it } from "vitest";
import { TILE_ART } from "./art/tiles";
import { TILE_H, TILE_W, worldToScreen } from "./coords";
import {
  CULL_PAD,
  boxVisible,
  expandBounds,
  rectVisible,
  spriteVisible,
  tileRowSpan,
  tileVisible,
  viewBounds,
  type ViewBounds,
} from "./cull";
import type { Sprite } from "./sprites";

/**
 * The reference every claim below is checked against: does this
 * rectangle overlap the *unpadded* viewport at all, computed straight
 * from the definition. Culling is allowed to keep something this says is
 * invisible (the pad, and rounding, both err that way); it is never
 * allowed to drop something this says is visible.
 */
function reallyVisible(
  camera: { sx: number; sy: number },
  viewportW: number,
  viewportH: number,
  zoom: number,
  left: number,
  top: number,
  width: number,
  height: number,
): boolean {
  const minX = camera.sx - viewportW / (2 * zoom);
  const maxX = camera.sx + viewportW / (2 * zoom);
  const minY = camera.sy - viewportH / (2 * zoom);
  const maxY = camera.sy + viewportH / (2 * zoom);
  return left < maxX && left + width > minX && top < maxY && top + height > minY;
}

function fakeSprite(width: number, height: number, anchorX = 0, anchorY = 0): Sprite {
  return { image: { width, height } as unknown as CanvasImageSource, anchorX, anchorY };
}

/** A spread of cameras: inside, on the rim, and well outside a map. */
function cameraSweep(): { sx: number; sy: number }[] {
  const cameras: { sx: number; sy: number }[] = [];
  for (let sx = -2400; sx <= 2400; sx += 137) {
    for (let sy = -1600; sy <= 1600; sy += 149) {
      cameras.push({ sx, sy });
    }
  }
  return cameras;
}

const VIEWPORTS: readonly (readonly [number, number])[] = [
  [1280, 720],
  [640, 480],
  [1920, 1080],
  [320, 240],
];
const ZOOMS = [1, 1.5, 2] as const;

describe("viewBounds", () => {
  it("centers on the camera and spans the viewport in world units", () => {
    const bounds = viewBounds({ sx: 100, sy: 50 }, 800, 600, 2, 0);
    expect(bounds).toEqual({ minX: -100, maxX: 300, minY: -100, maxY: 200 });
  });

  it("grows with the pad, and a higher zoom shows less world", () => {
    const wide = viewBounds({ sx: 0, sy: 0 }, 800, 600, 1, 0);
    const close = viewBounds({ sx: 0, sy: 0 }, 800, 600, 2, 0);
    expect(close.maxX - close.minX).toBeLessThan(wide.maxX - wide.minX);
    const padded = viewBounds({ sx: 0, sy: 0 }, 800, 600, 1);
    expect(padded.maxX).toBeCloseTo(wide.maxX + CULL_PAD);
  });
});

describe("rectVisible", () => {
  const bounds: ViewBounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  it("keeps anything that overlaps, including a bare touch", () => {
    expect(rectVisible(bounds, 50, 50, 10, 10)).toBe(true);
    expect(rectVisible(bounds, -10, -10, 10, 10)).toBe(true);
    expect(rectVisible(bounds, 100, 100, 10, 10)).toBe(true);
  });

  it("drops what is wholly outside on any axis", () => {
    expect(rectVisible(bounds, -20, 50, 10, 10)).toBe(false);
    expect(rectVisible(bounds, 50, 120, 10, 10)).toBe(false);
    expect(rectVisible(bounds, 110, 50, 10, 10)).toBe(false);
    expect(rectVisible(bounds, 50, -20, 10, 10)).toBe(false);
  });

  it("boxVisible is the same test around a center", () => {
    expect(boxVisible(bounds, 50, 50, 5, 5)).toBe(true);
    expect(boxVisible(bounds, -20, 50, 5, 5)).toBe(false);
    expect(boxVisible(bounds, -20, 50, 25, 5)).toBe(true);
  });

  it("expandBounds grows each axis by its own margin", () => {
    expect(expandBounds(bounds, 10, 5)).toEqual({
      minX: -10,
      maxX: 110,
      minY: -5,
      maxY: 105,
    });
  });
});

describe("tileRowSpan", () => {
  it("is the geometry the ground art actually has", () => {
    // The span math treats every ground tile as exactly the 64×32 (1x)
    // diamond anchored on its center. If a tile is ever authored larger
    // than that, this pins the assumption before the renderer starts
    // culling visible pixels.
    for (const [id, art] of Object.entries(TILE_ART)) {
      for (const variant of art.variants) {
        for (const frame of variant) {
          expect(frame.length, `${id} rows`).toBe(TILE_H / 2);
          expect(frame[0]?.length, `${id} columns`).toBe(TILE_W / 2);
        }
      }
      for (const variant of art.wet ?? []) {
        for (const frame of variant) {
          expect(frame.length, `${id} wet rows`).toBe(TILE_H / 2);
          expect(frame[0]?.length, `${id} wet columns`).toBe(TILE_W / 2);
        }
      }
    }
  });

  it("never drops a tile that is really on screen", () => {
    const width = 18;
    const height = 14;
    for (const [viewportW, viewportH] of VIEWPORTS) {
      for (const zoom of ZOOMS) {
        for (const camera of cameraSweep()) {
          const bounds = viewBounds(camera, viewportW, viewportH, zoom);
          for (let y = 0; y < height; y++) {
            const span = tileRowSpan(bounds, y, width);
            for (let x = 0; x < width; x++) {
              const { sx, sy } = worldToScreen(x, y);
              const visible = reallyVisible(
                camera,
                viewportW,
                viewportH,
                zoom,
                sx - TILE_W / 2,
                sy - TILE_H / 2,
                TILE_W,
                TILE_H,
              );
              if (!visible) continue;
              expect(
                span && x >= span.from && x <= span.to,
                `tile ${x},${y} at ${camera.sx},${camera.sy} zoom ${zoom}`,
              ).toBe(true);
            }
          }
        }
      }
    }
  });

  it("stays inside the map and reports an off-screen row as null", () => {
    const bounds = viewBounds({ sx: 0, sy: 0 }, 1280, 720, 1);
    for (let y = 0; y < 14; y++) {
      const span = tileRowSpan(bounds, y, 18);
      if (!span) continue;
      expect(span.from).toBeGreaterThanOrEqual(0);
      expect(span.to).toBeLessThanOrEqual(17);
      expect(span.from).toBeLessThanOrEqual(span.to);
    }
    // A camera a long way off the map: every row drops out.
    const far = viewBounds({ sx: 100000, sy: 100000 }, 1280, 720, 1);
    for (let y = 0; y < 14; y++) expect(tileRowSpan(far, y, 18)).toBeNull();
  });

  it("culls most of a district once the view is zoomed in", () => {
    const bounds = viewBounds({ sx: 0, sy: 0 }, 1280, 720, 2);
    let kept = 0;
    for (let y = 0; y < 14; y++) {
      const span = tileRowSpan(bounds, y, 18);
      if (span) kept += span.to - span.from + 1;
    }
    expect(kept).toBeLessThan(18 * 14 * 0.5);
  });

  it("agrees with tileVisible tile for tile", () => {
    for (const camera of cameraSweep().slice(0, 400)) {
      const bounds = viewBounds(camera, 1280, 720, 1);
      for (let y = 0; y < 14; y++) {
        const span = tileRowSpan(bounds, y, 18);
        for (let x = 0; x < 18; x++) {
          const inSpan = span !== null && x >= span.from && x <= span.to;
          expect(tileVisible(bounds, x, y)).toBe(inSpan);
        }
      }
    }
  });
});

describe("spriteVisible", () => {
  it("boxes the sprite by its own anchor, like the renderer draws it", () => {
    const bounds: ViewBounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    // Tile (0,0) is at screen (0,0); a 64×96 sprite anchored at its feet
    // hangs upward and to the left of that point.
    const sprite = fakeSprite(64, 96, 32, 96);
    expect(spriteVisible(bounds, sprite, 0, 0)).toBe(true);
    // Displaced far enough left that no pixel reaches the view.
    expect(spriteVisible(bounds, sprite, 0, 0, -200, 0)).toBe(false);
    expect(spriteVisible(bounds, sprite, 0, 0, 0, -200)).toBe(false);
  });

  it("never drops a sprite that is really on screen", () => {
    const sprites = [
      fakeSprite(64, 96, 32, 96),
      fakeSprite(128, 192, 64, 176),
      fakeSprite(16, 16, 8, 8),
    ];
    const offsets = [
      [0, 0],
      [0, -240],
      [96, 40],
    ] as const;
    for (const [viewportW, viewportH] of VIEWPORTS) {
      for (const zoom of ZOOMS) {
        for (const camera of cameraSweep()) {
          const bounds = viewBounds(camera, viewportW, viewportH, zoom);
          for (const sprite of sprites) {
            for (const [dx, dy] of offsets) {
              for (let tile = 0; tile < 12; tile++) {
                const x = tile % 4;
                const y = Math.floor(tile / 4);
                const { sx, sy } = worldToScreen(x, y);
                const image = sprite.image as { width: number; height: number };
                const visible = reallyVisible(
                  camera,
                  viewportW,
                  viewportH,
                  zoom,
                  sx - sprite.anchorX + dx,
                  sy - sprite.anchorY + dy,
                  image.width,
                  image.height,
                );
                if (!visible) continue;
                expect(
                  spriteVisible(bounds, sprite, x, y, dx, dy),
                  `sprite at ${x},${y} camera ${camera.sx},${camera.sy}`,
                ).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it("keeps an image that will not say how big it is", () => {
    const bounds: ViewBounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const opaque: Sprite = {
      image: {} as unknown as CanvasImageSource,
      anchorX: 0,
      anchorY: 0,
    };
    expect(spriteVisible(bounds, opaque, 900, 900)).toBe(true);
  });
});
