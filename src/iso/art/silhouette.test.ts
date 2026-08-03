import { describe, expect, it } from "vitest";
import { SHADOW, silhouetteArea, silhouetteGrid } from "./pixel";

describe("silhouetteGrid", () => {
  it("flattens every opaque pixel to one fill character", () => {
    expect(silhouetteGrid(["ab.", ".cd"], "x")).toEqual(["xx.", ".xx"]);
  });

  it("leaves the ground shadow out — it is under the figure, not part of it", () => {
    expect(silhouetteGrid([`q${SHADOW}q`], "x")).toEqual(["x.x"]);
    expect(silhouetteArea([`q${SHADOW}q`])).toBe(2);
  });

  it("keeps the frame exactly", () => {
    const grid = ["....", "q..q", "...."];
    const traced = silhouetteGrid(grid);
    expect(traced).toHaveLength(grid.length);
    expect(traced.every((row) => row.length === 4)).toBe(true);
  });

  it("reports nothing to trace for an empty frame", () => {
    expect(silhouetteArea(["....", "...."])).toBe(0);
    expect(silhouetteGrid(["...."])).toEqual(["...."]);
  });

  it("refuses a fill that is not one opaque character", () => {
    expect(() => silhouetteGrid(["q"], "")).toThrow(/one opaque character/);
    expect(() => silhouetteGrid(["q"], "#fff")).toThrow(/one opaque character/);
    expect(() => silhouetteGrid(["q"], ".")).toThrow(/one opaque character/);
  });
});
