// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  ART_DENSITIES,
  DEFAULT_DENSITY,
  DensityMismatchError,
  atDensity,
  betweenDensities,
  densityErrors,
  densityOf,
  frameInArtPixels,
  inArtPixels,
  promotedGrid,
  rangeAtDensity,
  spanAtDensity,
} from "./density";
import { DETAIL_DENSITY, doubled, refined, refinedAt } from "./detail";
import { glowInArtPixels, glowsInArtPixels } from "./glow";
import { ART_SCALE, bakeSprite, gridErrors, screenPixels } from "./pixel";
import { BODY_FRAME, bodyFrameAt } from "./layers/body";
import { MECH_FRAME } from "./mech";
import { PORTRAIT_FRAME } from "./layers/portrait";
import type { PixelGrid } from "./pixel";
import type { Sprite } from "../sprites";

/** A small grid with a diagonal, an interior material edge, and a hole. */
const SAMPLE: PixelGrid = [
  "..44..",
  ".4444.",
  "44RR44",
  "44RR44",
  ".4444.",
  "..44..",
];

/**
 * happy-dom has no 2d canvas. This stub is enough to bake through, and
 * it records every fill — which is the whole picture, since a bake is
 * nothing but a sequence of colored rectangles.
 */
function recordBake(bake: () => Sprite): {
  sprite: Sprite;
  width: number;
  height: number;
  rects: string[];
} {
  const rects: string[] = [];
  const context = {
    fillStyle: "",
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push(`${this.fillStyle} ${x},${y} ${w}x${h}`);
    },
  };
  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => context as unknown as CanvasRenderingContext2D);
  try {
    const sprite = bake();
    const canvas = sprite.image as HTMLCanvasElement;
    return { sprite, width: canvas.width, height: canvas.height, rects };
  } finally {
    spy.mockRestore();
  }
}

describe("art density", () => {
  it("declares the two densities art may be authored at", () => {
    expect(ART_DENSITIES).toEqual([1, 2]);
    expect(DEFAULT_DENSITY).toBe(1);
    expect(DETAIL_DENSITY).toBe(2);
  });

  it("reads an unstated density as 1, so old registrations mean what they meant", () => {
    expect(densityOf({})).toBe(1);
    expect(densityOf({ density: 2 })).toBe(2);
  });

  it("converts lengths between authored pixels and 1x art pixels", () => {
    expect(inArtPixels(64, 2)).toBe(32);
    expect(inArtPixels(32, 1)).toBe(32);
    expect(atDensity(16, 2)).toBe(32);
    expect(betweenDensities(10, 1, 2)).toBe(20);
    expect(betweenDensities(20, 2, 1)).toBe(10);
  });

  it("stretches inclusive spans to cover the sub-pixels they named", () => {
    // Rows 3..14 at 1x are rows 6..29 at density 2 — the last row of the
    // span is the *bottom* half of old row 14, not the top of row 15.
    expect(spanAtDensity({ top: 3, bottom: 14, left: 10, right: 21 }, 1, 2)).toEqual({
      top: 6,
      bottom: 29,
      left: 20,
      right: 43,
    });
    expect(rangeAtDensity([29, 30], 1, 2)).toEqual([58, 61]);
    expect(rangeAtDensity([58, 61], 2, 1)).toEqual([29, 30]);
  });
});

describe("promoting a coarser grid", () => {
  it("returns the grid untouched when it is already dense enough", () => {
    expect(promotedGrid(SAMPLE, 2, 2)).toBe(SAMPLE);
    expect(promotedGrid(SAMPLE, 1, 1)).toBe(SAMPLE);
  });

  it("doubles a density-1 grid with the detail pass's own rule", () => {
    expect(promotedGrid(SAMPLE, 1, 2)).toEqual(doubled(SAMPLE));
  });

  it("refuses to throw away half an artist's pixels", () => {
    expect(() => promotedGrid(SAMPLE, 2, 1)).toThrow(DensityMismatchError);
    try {
      promotedGrid(SAMPLE, 2, 1);
    } catch (error) {
      expect(error).toBeInstanceOf(DensityMismatchError);
      expect((error as DensityMismatchError).expected).toBe(1);
      expect((error as DensityMismatchError).found).toBe(2);
    }
  });
});

describe("the two densities are interchangeable", () => {
  it("a promoted grid painted as density-2 art paints exactly what it did at density 1", () => {
    expect(refinedAt(promotedGrid(SAMPLE, 1, 2), 2)).toEqual(refined(SAMPLE));
  });

  it("a density-2 grid skips the doubling and goes straight to the bevel", () => {
    const dense = doubled(SAMPLE);
    expect(refinedAt(dense, 2).length).toBe(dense.length);
    expect(refinedAt(dense, 1).length).toBe(dense.length * 2);
  });

  it("bakes to the same canvas, the same anchor, and the same rectangles", () => {
    const coarse = recordBake(() => bakeSprite(SAMPLE, 3, 5));
    // The same picture as a density-2 grid: twice the rows and columns,
    // an anchor counted in its own pixels, the same footprint.
    const dense = recordBake(() =>
      bakeSprite(promotedGrid(SAMPLE, 1, 2), 6, 10, undefined, 2),
    );
    expect(dense.width).toBe(coarse.width);
    expect(dense.height).toBe(coarse.height);
    expect(dense.sprite.anchorX).toBe(coarse.sprite.anchorX);
    expect(dense.sprite.anchorY).toBe(coarse.sprite.anchorY);
    expect(dense.rects).toEqual(coarse.rects);
  });

  it("measures screen pixels off the density a length was authored at", () => {
    expect(screenPixels(32)).toBe(32 * ART_SCALE);
    expect(screenPixels(64, 2)).toBe(32 * ART_SCALE);
  });
});

describe("validation understands density", () => {
  it("passes a grid whose size covers whole 1x pixels", () => {
    expect(densityErrors(doubled(SAMPLE), 2)).toEqual([]);
    expect(gridErrors(doubled(SAMPLE), 2)).toEqual([]);
  });

  it("rejects a density-2 grid that covers half a 1x pixel", () => {
    const odd = ["444", "4R4", "444"];
    expect(densityErrors(odd, 2)).toEqual([
      "width 3 is not a multiple of density 2",
      "height 3 is not a multiple of density 2",
    ]);
    expect(gridErrors(odd, 2).length).toBe(2);
    // The same grid is perfectly good art at the density it was drawn at.
    expect(gridErrors(odd)).toEqual([]);
  });
});

describe("frame descriptors carry their density", () => {
  it("every shared frame says what its numbers are counted in", () => {
    expect(BODY_FRAME.density).toBe(1);
    expect(MECH_FRAME.density).toBe(1);
    expect(PORTRAIT_FRAME.density).toBe(1);
  });

  it("reports a frame's size and anchor in 1x art pixels", () => {
    expect(frameInArtPixels(BODY_FRAME)).toEqual({
      width: 32,
      height: 48,
      anchorX: 16,
      anchorY: 44,
    });
    expect(
      frameInArtPixels({ width: 64, height: 96, anchorX: 32, anchorY: 88, density: 2 }),
    ).toEqual({ width: 32, height: 48, anchorX: 16, anchorY: 44 });
  });

  it("hands back the body frame unchanged at its own density", () => {
    const frame = bodyFrameAt(BODY_FRAME.density);
    expect(frame.width).toBe(BODY_FRAME.width);
    expect(frame.anchorY).toBe(BODY_FRAME.anchorY);
    expect(frame.head).toEqual(BODY_FRAME.head);
    expect(frame.hands.lean.left).toEqual([...BODY_FRAME.hands.lean.left]);
  });

  it("converts the whole body map at once, so nobody doubles a row by hand", () => {
    const frame = bodyFrameAt(2);
    expect([frame.width, frame.height]).toEqual([64, 96]);
    expect([frame.anchorX, frame.anchorY]).toEqual([32, 88]);
    expect(frame.head).toEqual({ top: 6, bottom: 29, left: 20, right: 43 });
    expect(frame.neck).toEqual({ top: 30, bottom: 33, left: 26, right: 37 });
    // A weapon attaches at the leading hand; the columns move with it.
    expect(frame.hands.heavy.right).toEqual([42, 45]);
    expect(frame.shadow).toEqual({ top: 86, bottom: 91, centerX: 32 });
  });
});

describe("glow sources convert once, at the boundary", () => {
  const lamp = { color: "m", radius: 20, intensity: 0.4, offsetX: -8, offsetY: -66 };

  it("leaves 1x art alone, list and all", () => {
    expect(glowInArtPixels(lamp, 1)).toBe(lamp);
    const list = [lamp];
    expect(glowsInArtPixels(list, 1)).toBe(list);
  });

  it("reads a density-2 entry's lamp in the unit the world is measured in", () => {
    expect(glowInArtPixels(lamp, 2)).toEqual({
      color: "m",
      radius: 10,
      intensity: 0.4,
      offsetX: -4,
      offsetY: -33,
    });
  });

  it("keeps a light visible however small the number rounds to", () => {
    expect(glowInArtPixels({ ...lamp, radius: 1 }, 2).radius).toBe(1);
  });
});
