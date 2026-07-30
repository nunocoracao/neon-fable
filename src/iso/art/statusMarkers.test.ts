import { describe, expect, it } from "vitest";
import { STATUS_FAMILY_IDS, STATUS_MARKERS } from "../status";
import { STATUS_MARKER_ART, STATUS_MARKER_IDS } from "./statusMarkers";
import { gridErrors, type PixelGrid } from "./pixel";

/**
 * The status marker glyphs. What is under test: that every family has
 * one (and only one), that the glyphs are valid art small enough to sit
 * over a head without covering the fight, that they are authored to the
 * loops ../status.ts plays them at, and that a row of them lines up —
 * every marker is the same size and centered, so two conditions on one
 * body sit side by side rather than shouldering each other about.
 */

/** Small enough to read over a 32×48 body without swamping it. */
const MAX_SIZE = 13;

function painted(grid: PixelGrid): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== ".") cells.push({ x, y });
    });
  });
  return cells;
}

const joined = (id: (typeof STATUS_FAMILY_IDS)[number]): string =>
  STATUS_MARKER_ART[id].frames.map((grid) => grid.join("")).join("");

describe("status marker art", () => {
  it("gives every family exactly one glyph set", () => {
    expect(Object.keys(STATUS_MARKER_ART).sort()).toEqual(
      [...STATUS_FAMILY_IDS].sort(),
    );
    expect(STATUS_MARKER_IDS).toEqual(STATUS_FAMILY_IDS);
  });

  it("is valid palette-indexed art, small enough to hang over a head", () => {
    for (const id of STATUS_FAMILY_IDS) {
      const art = STATUS_MARKER_ART[id];
      art.frames.forEach((grid, f) => {
        expect(gridErrors(grid), `${id} frame ${f}`).toEqual([]);
        expect(grid[0]?.length ?? 0, `${id} frame ${f} width`)
          .toBeLessThanOrEqual(MAX_SIZE);
        expect(grid.length, `${id} frame ${f} height`).toBeLessThanOrEqual(MAX_SIZE);
        expect(painted(grid).length, `${id} frame ${f} is not empty`)
          .toBeGreaterThan(0);
      });
    }
  });

  it("is authored to exactly the loop the marker plays", () => {
    for (const id of STATUS_FAMILY_IDS) {
      const art = STATUS_MARKER_ART[id];
      expect(art.frames.length, `${id} frame count`).toBe(
        STATUS_MARKERS[id].frameCount,
      );
      expect(art.frameMs, `${id} hold`).toBe(STATUS_MARKERS[id].frameMs);
      const unique = new Set(art.frames.map((grid) => grid.join("\n")));
      expect(unique.size, `${id} distinct frames`).toBe(art.frames.length);
    }
  });

  it("lays every glyph out on the same centered square, so a row lines up", () => {
    const sizes = new Set<string>();
    for (const id of STATUS_FAMILY_IDS) {
      const art = STATUS_MARKER_ART[id];
      const grid = art.frames[0] ?? [];
      sizes.add(`${grid[0]?.length ?? 0}x${grid.length}`);
      art.frames.forEach((frame, f) => {
        expect(frame.length, `${id} frame ${f} height`).toBe(grid.length);
        expect(frame[0]?.length, `${id} frame ${f} width`).toBe(grid[0]?.length);
        const cells = painted(frame);
        const meanX = cells.reduce((sum, c) => sum + c.x, 0) / cells.length;
        const meanY = cells.reduce((sum, c) => sum + c.y, 0) / cells.length;
        expect(Math.abs(meanX - art.anchorX), `${id} frame ${f} centered x`)
          .toBeLessThanOrEqual(1);
        expect(Math.abs(meanY - art.anchorY), `${id} frame ${f} centered y`)
          .toBeLessThanOrEqual(1);
      });
    }
    expect(sizes.size, "every marker is the same square").toBe(1);
  });

  it("marks each family in the channels of the effect that leaves it", () => {
    // Static is the cyan of a shock arc…
    expect(/[gh9]/.test(joined("stunned")), "stun is cyan").toBe(true);
    // …plating the chrome of a guard shimmer…
    expect(/[6T9]/.test(joined("guarded")), "plating is chrome").toBe(true);
    // …and drive the magenta of a focus ring.
    expect(/[ljk]/.test(joined("empowered")), "drive is magenta").toBe(true);
    // No two families share a look: the channels really do separate them.
    expect(/[ljk]/.test(joined("stunned"))).toBe(false);
    expect(/[gh]/.test(joined("empowered"))).toBe(false);
    expect(/[ljk]/.test(joined("guarded"))).toBe(false);
  });
});
