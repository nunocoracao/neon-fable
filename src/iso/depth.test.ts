import { describe, expect, it } from "vitest";
import { compareDrawables, depthOf, sortDrawables, type Drawable } from "./depth";

const d = (x: number, y: number, layer: Drawable["layer"] = "object"): Drawable => ({
  x,
  y,
  layer,
});

describe("depthOf", () => {
  it("is the x+y painter's key", () => {
    expect(depthOf(d(2, 3))).toBe(5);
    expect(depthOf(d(1.5, 0.5))).toBe(2);
  });
});

describe("compareDrawables", () => {
  it("paints farther (smaller x+y) drawables first", () => {
    expect(compareDrawables(d(0, 0), d(1, 1))).toBeLessThan(0);
    expect(compareDrawables(d(3, 4), d(2, 2))).toBeGreaterThan(0);
  });

  it("paints ground under objects on the same tile", () => {
    expect(compareDrawables(d(2, 2, "ground"), d(2, 2, "object"))).toBeLessThan(0);
  });

  it("orders fractional entity positions between tiles", () => {
    // An entity halfway from (1,1) to (2,1) paints after (1,1) props
    // and before (2,1) props.
    const walking = d(1.5, 1);
    expect(compareDrawables(d(1, 1), walking)).toBeLessThan(0);
    expect(compareDrawables(walking, d(2, 1))).toBeLessThan(0);
  });
});

describe("sortDrawables", () => {
  it("sorts into deterministic painter's order without mutating input", () => {
    const input = [d(2, 2), d(0, 1), d(1, 0, "ground"), d(1, 0), d(0, 0)];
    const sorted = sortDrawables(input);
    expect(sorted).toEqual([d(0, 0), d(1, 0, "ground"), d(1, 0), d(0, 1), d(2, 2)]);
    expect(input[0]).toEqual(d(2, 2));
  });
});
