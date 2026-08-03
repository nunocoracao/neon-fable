import { describe, expect, it } from "vitest";
import { BODY_FRAME } from "../../iso/art/layers/body";
import { FACE_REGION } from "../../iso/art/layers/face";
import {
  describeFault,
  differsVisibly,
  fullyCovers,
  hairOverFace,
  layerFaults,
  pixelsOutside,
  PORTRAIT_FACE_BOX,
  PORTRAIT_PART_REGIONS,
  portraitPartKind,
  shadowPixels,
  SLOT_REGIONS,
  unionMask,
} from "./regions";

const box = { top: 1, bottom: 2, left: 1, right: 2 };

describe("region masks", () => {
  it("names every pixel outside a box, and nothing inside it", () => {
    const grid = ["q...", ".q..", "..q.", "...q"];
    expect(pixelsOutside(grid, box)).toEqual(['(0, 0)="q"', '(3, 3)="q"']);
    expect(pixelsOutside(["....", ".q..", "..q.", "...."], box)).toEqual([]);
  });

  it("finds ground shadow wherever it is drawn", () => {
    expect(shadowPixels(["..z.", "...."])).toEqual(['(2, 0)="z"']);
    expect(shadowPixels(["....."])).toEqual([]);
  });

  it("covers every layer slot with a declared region", () => {
    for (const slot of Object.keys(SLOT_REGIONS)) {
      const region = SLOT_REGIONS[slot as keyof typeof SLOT_REGIONS];
      expect(region.top).toBeGreaterThanOrEqual(0);
      expect(region.bottom).toBeLessThan(BODY_FRAME.height);
      expect(region.left).toBeGreaterThanOrEqual(0);
      expect(region.right).toBeLessThan(BODY_FRAME.width);
    }
    // The face region is the skull interior, inside its own outline.
    expect(FACE_REGION.top).toBe(BODY_FRAME.head.top + 1);
    expect(FACE_REGION.right).toBe(BODY_FRAME.head.right - 1);
  });

  it("prints a fault with its combination and a bounded pixel list", () => {
    const line = describeFault({
      slot: "hair",
      art: "bob",
      view: "front",
      rule: "outside its hair region",
      pixels: Array.from({ length: 9 }, (_, i) => `(${i}, 0)="K"`),
    });
    expect(line).toContain("hair:bob[front] outside its hair region");
    expect(line).toContain("(+3 more)");
  });

  it("faults a layer that draws out of bounds or casts a shadow", () => {
    const stray = Array.from({ length: BODY_FRAME.height }, (_, y) =>
      y === 40 ? "K".padEnd(BODY_FRAME.width, ".") : ".".repeat(BODY_FRAME.width),
    );
    expect(layerFaults("hair", "bob", "front", stray)).toHaveLength(1);
    // The body owns the whole frame and the shadow, so it faults on
    // neither.
    expect(layerFaults("body", "lean", "front", stray)).toEqual([]);
  });
});

describe("portrait masks", () => {
  it("reads a part kind off its cache-key fragment", () => {
    expect(portraitPartKind("eyes:narrow")).toBe("eyes");
    expect(portraitPartKind("brows:arched@grim~m")).toBe("brows");
    expect(portraitPartKind("head")).toBe("head");
  });

  it("declares a region for every part kind the portrait resolves", () => {
    for (const kind of ["head", "eyes", "brows", "mouth", "detail", "headwear", "cyber", "hair", "static"]) {
      expect(PORTRAIT_PART_REGIONS[kind], kind).toBeDefined();
    }
  });

  it("lets a crown frame the jaw but not cover the face", () => {
    const blank = Array.from({ length: 48 }, () => ".".repeat(48));
    const framing = [...blank];
    framing[PORTRAIT_FACE_BOX.top] =
      ".".repeat(PORTRAIT_FACE_BOX.left) +
      "K" +
      ".".repeat(47 - PORTRAIT_FACE_BOX.left);
    expect(hairOverFace(framing)).toEqual([]);

    const covering = [...blank];
    covering[PORTRAIT_FACE_BOX.top] =
      ".".repeat(PORTRAIT_FACE_BOX.left + 4) +
      "K" +
      ".".repeat(43 - PORTRAIT_FACE_BOX.left);
    expect(hairOverFace(covering)).toHaveLength(1);
  });
});

describe("what a viewer can actually see", () => {
  it("knows when an upper layer hides a lower one entirely", () => {
    expect(fullyCovers(["xxx"], [".q."])).toBe(true);
    expect(fullyCovers([".x."], ["qq."])).toBe(false);
    expect(fullyCovers(["..."], ["..."])).toBe(true);
  });

  it("unions opaque pixels across a stack", () => {
    expect(unionMask([["q.."], ["..q"]])).toEqual(["#.#"]);
    expect(unionMask([])).toEqual([]);
  });

  it("ignores a change that something opaque sits on top of", () => {
    const hidden = [["q.."], ["xxx"]];
    const other = [["r.."], ["xxx"]];
    expect(differsVisibly(hidden, other)).toBe(false);
  });

  it("catches a change nothing covers", () => {
    expect(differsVisibly([["q.."], ["..x"]], [["r.."], ["..x"]])).toBe(true);
    expect(differsVisibly([["q"]], [["q"], ["q"]])).toBe(true);
  });
});
