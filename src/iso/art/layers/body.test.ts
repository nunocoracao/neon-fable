import { describe, expect, it } from "vitest";
import { REMAP_CHANNELS } from "../palette";
import { gridErrors, type PixelGrid } from "../pixel";
import {
  BODY_BUILD_IDS,
  BODY_FRAME,
  BODY_GRIDS,
  BODY_VIEW_IDS,
  bodyViewForFacing,
} from "./body";

/** Every (build, view, grid) triple for iteration. */
const ALL_GRIDS = BODY_BUILD_IDS.flatMap((build) =>
  BODY_VIEW_IDS.map((view) => ({
    build,
    view,
    grid: BODY_GRIDS[build][view],
    label: `${build} ${view}`,
  })),
);

const SKIN = REMAP_CHANNELS.skin;
const GARB = [...REMAP_CHANNELS.outfitPrimary, ...REMAP_CHANNELS.outfitAccent];

function opaqueCount(grid: PixelGrid): number {
  let count = 0;
  for (const r of grid) for (const ch of r) if (ch !== ".") count++;
  return count;
}

describe("base body grids", () => {
  it("all four grids are valid 32×48 palette grids", () => {
    for (const { grid, label } of ALL_GRIDS) {
      expect(gridErrors(grid), label).toEqual([]);
      expect(grid.length, `${label} height`).toBe(BODY_FRAME.height);
      expect(grid[0]?.length, `${label} width`).toBe(BODY_FRAME.width);
    }
  });

  it("uses only the reserved remap channels plus neutral structure", () => {
    const allowed = new Set([".", "0", "1", "z", ...SKIN, ...GARB]);
    for (const { grid, label } of ALL_GRIDS) {
      for (const [y, r] of grid.entries()) {
        for (const ch of r) {
          expect(allowed.has(ch), `${label} row ${y} uses "${ch}"`).toBe(true);
        }
      }
    }
  });

  it("carries both skin-channel and outfit-channel pixels", () => {
    for (const { grid, label } of ALL_GRIDS) {
      const joined = grid.join("");
      expect(
        SKIN.some((ch) => joined.includes(ch)),
        `${label} skin`,
      ).toBe(true);
      expect(
        REMAP_CHANNELS.outfitPrimary.some((ch) => joined.includes(ch)),
        `${label} garb`,
      ).toBe(true);
      expect(
        REMAP_CHANNELS.outfitAccent.some((ch) => joined.includes(ch)),
        `${label} trim`,
      ).toBe(true);
    }
  });

  it("keeps the head bare: skin and outline only inside the head box", () => {
    const { head, neck } = BODY_FRAME;
    const bare = new Set([".", "0", ...SKIN]);
    for (const { grid, label } of ALL_GRIDS) {
      for (let y = 0; y <= neck.bottom; y++) {
        const r = grid[y] ?? "";
        for (let x = 0; x < r.length; x++) {
          const ch = r[x] ?? ".";
          expect(bare.has(ch), `${label} (${x}, ${y}) head area "${ch}"`).toBe(
            true,
          );
          if (ch !== "." && y <= head.bottom) {
            expect(x, `${label} (${x}, ${y}) outside head box`).toBeGreaterThanOrEqual(head.left);
            expect(x, `${label} (${x}, ${y}) outside head box`).toBeLessThanOrEqual(head.right);
          }
        }
      }
      // Nothing drawn above the head box.
      for (let y = 0; y < head.top; y++) {
        expect(grid[y], `${label} row ${y} clear`).toBe(".".repeat(32));
      }
    }
  });

  it("shares identical head/neck rows across builds and views per view side", () => {
    const rows = BODY_FRAME.neck.bottom + 1;
    expect(BODY_GRIDS.lean.front.slice(0, rows)).toEqual(
      BODY_GRIDS.heavy.front.slice(0, rows),
    );
    expect(BODY_GRIDS.lean.back.slice(0, rows)).toEqual(
      BODY_GRIDS.heavy.back.slice(0, rows),
    );
  });

  it("head reads at the contract size: 10-12 rows tall", () => {
    const { head } = BODY_FRAME;
    const height = head.bottom - head.top + 1;
    expect(height).toBeGreaterThanOrEqual(10);
    expect(height).toBeLessThanOrEqual(12);
  });

  it("shows bare-skin hands at the documented per-build positions", () => {
    for (const { build, grid, label } of ALL_GRIDS) {
      const hands = BODY_FRAME.hands[build];
      for (const y of hands.rows) {
        for (const x of [...hands.left, ...hands.right]) {
          const ch = grid[y]?.[x] ?? ".";
          expect(
            (SKIN as readonly string[]).includes(ch),
            `${label} hand pixel (${x}, ${y}) is "${ch}"`,
          ).toBe(true);
        }
      }
    }
  });

  it("grounds each body with a z shadow centered on the anchor", () => {
    const { shadow } = BODY_FRAME;
    for (const { grid, label } of ALL_GRIDS) {
      for (const [y, r] of grid.entries()) {
        const hasZ = r.includes("z");
        expect(hasZ, `${label} row ${y} shadow placement`).toBe(
          y >= shadow.top && y <= shadow.bottom,
        );
      }
      const anchorRow = grid[BODY_FRAME.anchorY] ?? "";
      const first = anchorRow.indexOf("z");
      const last = anchorRow.lastIndexOf("z");
      expect(first, `${label} anchor row has shadow`).toBeGreaterThanOrEqual(0);
      expect((first + last) / 2, `${label} shadow center`).toBe(
        shadow.centerX,
      );
      // Feet stay above the shadow; nothing paints below it.
      for (let y = shadow.bottom + 1; y < grid.length; y++) {
        expect(grid[y], `${label} row ${y} clear`).toBe(".".repeat(32));
      }
    }
  });

  it("draws the heavy build visibly broader than the lean build", () => {
    for (const view of BODY_VIEW_IDS) {
      expect(
        opaqueCount(BODY_GRIDS.heavy[view]),
        view,
      ).toBeGreaterThan(opaqueCount(BODY_GRIDS.lean[view]));
    }
  });

  it("front and back views of a build differ", () => {
    for (const build of BODY_BUILD_IDS) {
      expect(BODY_GRIDS[build].front.join("\n")).not.toBe(
        BODY_GRIDS[build].back.join("\n"),
      );
    }
  });
});

describe("bodyViewForFacing", () => {
  it("maps facings to views and mirrors like the legacy set", () => {
    expect(bodyViewForFacing("e")).toEqual({ view: "front", flip: false });
    expect(bodyViewForFacing("s")).toEqual({ view: "front", flip: true });
    expect(bodyViewForFacing("n")).toEqual({ view: "back", flip: false });
    expect(bodyViewForFacing("w")).toEqual({ view: "back", flip: true });
  });
});
