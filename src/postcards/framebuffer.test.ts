import { describe, expect, it } from "vitest";
import {
  blendPixel,
  blit,
  clearRect,
  createFramebuffer,
  drawGrid,
  fillPolygons,
  fillRect,
  flattenOnto,
  gridHeight,
  gridWidth,
  parseColor,
  strokeSegment,
} from "./framebuffer";

/** The RGBA at a pixel, as a plain array. */
function at(
  fb: ReturnType<typeof createFramebuffer>,
  x: number,
  y: number,
): number[] {
  const i = (y * fb.width + x) * 4;
  return [...fb.data.slice(i, i + 4)];
}

describe("parseColor", () => {
  it("reads the notations this repo's art is authored in", () => {
    expect(parseColor("#2ee6d6")).toEqual([46, 230, 214, 255]);
    expect(parseColor("#abc")).toEqual([170, 187, 204, 255]);
    expect(parseColor("rgba(5, 6, 12, 0.45)")).toEqual([5, 6, 12, 115]);
    expect(parseColor("rgb(1,2,3)")).toEqual([1, 2, 3, 255]);
  });

  it("throws on a color nobody can paint", () => {
    expect(() => parseColor("rebeccapurple")).toThrow(/cannot parse/);
  });
});

describe("blendPixel", () => {
  it("composites source-over", () => {
    const fb = createFramebuffer(1, 1, [0, 0, 0, 255]);
    blendPixel(fb, 0, 0, [255, 255, 255, 255], 0.5);
    expect(at(fb, 0, 0)).toEqual([128, 128, 128, 255]);
  });

  it("adds under the lighter operation the glow pass uses", () => {
    const fb = createFramebuffer(1, 1, [100, 0, 0, 255]);
    blendPixel(fb, 0, 0, [100, 50, 0, 255], 1, "lighter");
    expect(at(fb, 0, 0).slice(0, 3)).toEqual([200, 50, 0]);
  });

  it("ignores pixels outside the buffer", () => {
    const fb = createFramebuffer(2, 2);
    expect(() => blendPixel(fb, -1, 5, [255, 0, 0, 255], 1)).not.toThrow();
  });
});

describe("fillRect and clearRect", () => {
  it("fills the half-open rectangle it is given", () => {
    const fb = createFramebuffer(4, 4);
    fillRect(fb, 1, 1, 2, 2, [255, 0, 0, 255]);
    expect(at(fb, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(at(fb, 2, 2)).toEqual([255, 0, 0, 255]);
    expect(at(fb, 3, 3)).toEqual([0, 0, 0, 0]);
  });

  it("clears back to transparent", () => {
    const fb = createFramebuffer(2, 2, [9, 9, 9, 255]);
    clearRect(fb, 0, 0, 2, 2);
    expect(at(fb, 1, 1)).toEqual([0, 0, 0, 0]);
  });
});

describe("drawGrid", () => {
  it("paints one palette-indexed block per art pixel", () => {
    const fb = createFramebuffer(4, 4);
    drawGrid(fb, [".g", "g."], 0, 0, 2);
    // Cyan "g" is #2ee6d6 in the master palette.
    expect(at(fb, 2, 0)).toEqual([46, 230, 214, 255]);
    expect(at(fb, 3, 1)).toEqual([46, 230, 214, 255]);
    expect(at(fb, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(at(fb, 1, 3)).toEqual([46, 230, 214, 255]);
  });

  it("reports the size it will cover", () => {
    expect(gridWidth(["...."], 2)).toBe(8);
    expect(gridHeight(["..", ".."], 3)).toBe(6);
  });
});

describe("fillPolygons", () => {
  it("fills a diamond and leaves its corners alone", () => {
    const fb = createFramebuffer(9, 9);
    fillPolygons(
      fb,
      [
        [
          { x: 4.5, y: 0 },
          { x: 9, y: 4.5 },
          { x: 4.5, y: 9 },
          { x: 0, y: 4.5 },
        ],
      ],
      [255, 0, 0, 255],
    );
    expect(at(fb, 4, 4)).toEqual([255, 0, 0, 255]);
    expect(at(fb, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(at(fb, 8, 8)).toEqual([0, 0, 0, 0]);
  });
});

describe("strokeSegment", () => {
  it("draws along the line it is given", () => {
    const fb = createFramebuffer(8, 8);
    strokeSegment(fb, { x: 0, y: 4 }, { x: 8, y: 4 }, 2, [0, 255, 0, 255]);
    expect(at(fb, 4, 4)[1]).toBe(255);
    expect(at(fb, 4, 0)[3]).toBe(0);
  });

  it("draws nothing for a zero-length segment", () => {
    const fb = createFramebuffer(4, 4);
    strokeSegment(fb, { x: 2, y: 2 }, { x: 2, y: 2 }, 2, [0, 255, 0, 255]);
    expect(at(fb, 2, 2)).toEqual([0, 0, 0, 0]);
  });
});

describe("blit", () => {
  it("copies a source rectangle 1:1", () => {
    const source = createFramebuffer(2, 2, [10, 20, 30, 255]);
    const target = createFramebuffer(4, 4);
    blit(target, source, 1, 1);
    expect(at(target, 1, 1)).toEqual([10, 20, 30, 255]);
    expect(at(target, 3, 3)).toEqual([0, 0, 0, 0]);
  });

  it("honours a source sub-rectangle", () => {
    const source = createFramebuffer(4, 1);
    fillRect(source, 2, 0, 1, 1, [1, 2, 3, 255]);
    const target = createFramebuffer(4, 1);
    blit(target, source, 0, 0, 2, 0, 1, 1);
    expect(at(target, 0, 0)).toEqual([1, 2, 3, 255]);
  });
});

describe("flattenOnto", () => {
  it("puts the page back behind everything the renderer cleared", () => {
    const fb = createFramebuffer(2, 1);
    fillRect(fb, 0, 0, 1, 1, [255, 255, 255, 255]);
    flattenOnto(fb, [10, 10, 18, 255]);
    expect(at(fb, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(at(fb, 1, 0)).toEqual([10, 10, 18, 255]);
  });
});
