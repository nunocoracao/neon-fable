import { describe, expect, it } from "vitest";
import {
  SINGLE_TILE,
  bodiesOverlap,
  bodyCovers,
  bodyGap,
  bodyTiles,
  footprintCenter,
  footprintCovers,
  footprintFits,
  footprintGap,
  footprintOf,
  footprintTiles,
  footprintsOverlap,
  isMultiTile,
  tileGap,
} from "./footprint";
import { manhattan } from "./grid";
import type { GridPosition, GridSize } from "./types";

/**
 * The block math every grid rule now reads. Two properties matter more
 * than any single case: a one-tile body has to behave exactly as it did
 * before footprints existed (`footprintGap` degenerates to `manhattan`),
 * and the closed-form gap has to agree with brute force over every pair
 * of tiles — which is the definition it is standing in for.
 */

const at = (x: number, y: number): GridPosition => ({ x, y });
const size = (width: number, height: number): GridSize => ({ width, height });

/** The minimum Manhattan distance between two blocks, the slow way. */
function bruteGap(
  a: GridPosition,
  aFp: GridSize,
  b: GridPosition,
  bFp: GridSize,
): number {
  let best = Infinity;
  for (const one of footprintTiles(a, aFp)) {
    for (const two of footprintTiles(b, bFp)) {
      best = Math.min(best, manhattan(one, two));
    }
  }
  return best;
}

describe("footprintOf", () => {
  it("reads an absent footprint as the single tile everything was", () => {
    expect(footprintOf({ position: at(0, 0) })).toEqual(SINGLE_TILE);
    expect(footprintOf({ position: at(0, 0), footprint: undefined })).toEqual(
      SINGLE_TILE,
    );
  });

  it("clamps nonsense up to at least one tile in each direction", () => {
    expect(footprintOf({ position: at(0, 0), footprint: size(0, -3) })).toEqual(
      SINGLE_TILE,
    );
    expect(
      footprintOf({ position: at(0, 0), footprint: { width: 2.9, height: 2.1 } }),
    ).toEqual(size(2, 2));
  });

  it("says which bodies take up more than a tile", () => {
    expect(isMultiTile({ position: at(0, 0) })).toBe(false);
    expect(isMultiTile({ position: at(0, 0), footprint: size(1, 2) })).toBe(true);
  });
});

describe("footprintTiles", () => {
  it("anchors the block at its minimum-x, minimum-y corner", () => {
    expect(footprintTiles(at(6, 2), size(2, 2))).toEqual([
      at(6, 2),
      at(7, 2),
      at(6, 3),
      at(7, 3),
    ]);
  });

  it("is one tile for anything without a footprint", () => {
    expect(bodyTiles({ position: at(4, 5) })).toEqual([at(4, 5)]);
  });

  it("covers exactly the tiles it lists", () => {
    const anchor = at(3, 1);
    const footprint = size(3, 2);
    const covered = new Set(
      footprintTiles(anchor, footprint).map((t) => `${t.x},${t.y}`),
    );
    for (let y = -1; y <= 4; y++) {
      for (let x = 0; x <= 8; x++) {
        expect(
          footprintCovers(anchor, footprint, at(x, y)),
          `(${x}, ${y})`,
        ).toBe(covered.has(`${x},${y}`));
      }
    }
  });

  it("reads a body's own tiles through the same rule", () => {
    const body = { position: at(6, 2), footprint: size(2, 2) };
    expect(bodyCovers(body, at(7, 3))).toBe(true);
    expect(bodyCovers(body, at(8, 3))).toBe(false);
    expect(bodyCovers(body, at(5, 2))).toBe(false);
  });
});

describe("footprintFits", () => {
  const grid = size(9, 7);

  it("needs the whole block on the grid, not just the anchor", () => {
    expect(footprintFits(grid, at(7, 5), size(2, 2))).toBe(true);
    // Anchor is on the grid; the block's far column is not.
    expect(footprintFits(grid, at(8, 5), size(2, 2))).toBe(false);
    expect(footprintFits(grid, at(7, 6), size(2, 2))).toBe(false);
  });

  it("refuses negative anchors and fractional ones", () => {
    expect(footprintFits(grid, at(-1, 0), SINGLE_TILE)).toBe(false);
    expect(footprintFits(grid, { x: 1.5, y: 2 }, SINGLE_TILE)).toBe(false);
  });

  it("matches plain bounds for a single tile", () => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 9; x++) {
        const inside = x >= 0 && x < 9 && y >= 0 && y < 7;
        expect(footprintFits(grid, at(x, y), undefined), `(${x}, ${y})`).toBe(
          inside,
        );
      }
    }
  });
});

describe("footprintGap", () => {
  it("degenerates to Manhattan distance for two single tiles", () => {
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        expect(
          footprintGap(at(0, 0), SINGLE_TILE, at(x, y), SINGLE_TILE),
          `(${x}, ${y})`,
        ).toBe(manhattan(at(0, 0), at(x, y)));
      }
    }
  });

  it("agrees with brute force over every pair of tiles", () => {
    const shapes: GridSize[] = [size(1, 1), size(2, 2), size(3, 1), size(1, 3)];
    for (const aFp of shapes) {
      for (const bFp of shapes) {
        for (let y = -3; y <= 5; y++) {
          for (let x = -3; x <= 5; x++) {
            expect(
              footprintGap(at(0, 0), aFp, at(x, y), bFp),
              `${aFp.width}x${aFp.height} vs ${bFp.width}x${bFp.height} @ (${x}, ${y})`,
            ).toBe(bruteGap(at(0, 0), aFp, at(x, y), bFp));
          }
        }
      }
    }
  });

  it("puts melee reach against any face of a 2x2 block", () => {
    const chassis = { position: at(6, 2), footprint: size(2, 2) };
    // Beside the near column, the far column, above and below: all 1.
    for (const tile of [at(5, 2), at(5, 3), at(8, 2), at(8, 3), at(6, 1), at(7, 4)]) {
      expect(tileGap(chassis, tile), `${tile.x},${tile.y}`).toBe(1);
    }
    // A diagonal corner is still two steps away, as it is for anyone.
    expect(tileGap(chassis, at(5, 1))).toBe(2);
    // Standing on it is no distance at all.
    expect(tileGap(chassis, at(7, 3))).toBe(0);
  });

  it("is symmetric", () => {
    const a = { position: at(1, 1), footprint: size(2, 2) };
    const b = { position: at(5, 4) };
    expect(bodyGap(a, b)).toBe(bodyGap(b, a));
  });
});

describe("overlap", () => {
  it("is exactly a gap of zero", () => {
    const chassis = { position: at(6, 2), footprint: size(2, 2) };
    expect(bodiesOverlap(chassis, { position: at(7, 3) })).toBe(true);
    expect(bodiesOverlap(chassis, { position: at(8, 3) })).toBe(false);
    expect(
      footprintsOverlap(at(0, 0), size(2, 2), at(1, 1), size(2, 2)),
    ).toBe(true);
    expect(
      footprintsOverlap(at(0, 0), size(2, 2), at(2, 0), size(2, 2)),
    ).toBe(false);
  });
});

describe("footprintCenter", () => {
  it("is the anchor itself for a single tile", () => {
    expect(footprintCenter(at(4, 5), undefined)).toEqual({ x: 4, y: 5 });
  });

  it("sits between the tiles of an even block", () => {
    expect(footprintCenter(at(6, 2), size(2, 2))).toEqual({ x: 6.5, y: 2.5 });
    expect(footprintCenter(at(6, 2), size(3, 1))).toEqual({ x: 7, y: 2 });
  });
});
