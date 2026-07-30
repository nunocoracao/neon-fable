import { describe, expect, it } from "vitest";
import {
  EFFECT_SPRITE_IDS,
  EFFECT_TIMING,
  effectKind,
  type EffectSpriteId,
} from "../impact";
import { EFFECT_ART } from "./effects";
import { EMISSIVE_COLORS } from "./palette";
import { gridErrors, mirrored, type PixelGrid } from "./pixel";

/**
 * The combat effect art: the muzzle flash, the tracer in each of its
 * slopes, the arc smear, and the sparks or dust a blow ends in. What is
 * under test: that the art is valid, that it is authored to exactly the
 * frame counts the sequencer in ../impact.ts plays it at, that the
 * mirrored and flipped directions really are mirrors and flips of the
 * pictures they derive from, that a streak reads as travelling the way
 * it is drawn, and that fire is lit while dust is not.
 */

/** Nothing here is a character or a prop; effects stay small. */
const MAX_SIZE = 32;

function painted(grid: PixelGrid): Array<{ x: number; y: number; ch: string }> {
  const cells: Array<{ x: number; y: number; ch: string }> = [];
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== ".") cells.push({ x, y, ch });
    });
  });
  return cells;
}

const flipped = (grid: PixelGrid): string[] => [...grid].reverse();

const joined = (id: EffectSpriteId): string =>
  EFFECT_ART[id].frames.map((grid) => grid.join("")).join("");

describe("effect art", () => {
  it("registers exactly the effect ids the sequencer draws", () => {
    expect(Object.keys(EFFECT_ART).sort()).toEqual([...EFFECT_SPRITE_IDS].sort());
  });

  it("is valid palette-indexed art at a size an effect should be", () => {
    for (const id of EFFECT_SPRITE_IDS) {
      const art = EFFECT_ART[id];
      const first = art.frames[0];
      expect(art.frames.length, `${id} frames`).toBeGreaterThan(0);
      art.frames.forEach((grid, f) => {
        expect(gridErrors(grid), `${id} frame ${f}`).toEqual([]);
        expect(grid.length, `${id} frame ${f} height`).toBe(first?.length);
        expect(grid[0]?.length, `${id} frame ${f} width`).toBe(first?.[0]?.length);
      });
      expect(first?.[0]?.length ?? 0, `${id} width`).toBeLessThanOrEqual(MAX_SIZE);
      expect(first?.length ?? 0, `${id} height`).toBeLessThanOrEqual(MAX_SIZE);
    }
  });

  it("is authored to exactly the frames and holds the sequencer plays", () => {
    for (const id of EFFECT_SPRITE_IDS) {
      const timing = EFFECT_TIMING[effectKind(id)];
      const art = EFFECT_ART[id];
      expect(art.frames.length, `${id} frame count`).toBe(timing.frameCount);
      expect(art.frameMs, `${id} hold`).toBe(timing.frameMs);
      // Every frame of a set must actually change something, or the
      // effect reads as a stutter rather than as motion.
      const unique = new Set(art.frames.map((grid) => grid.join("\n")));
      expect(unique.size, `${id} distinct frames`).toBe(art.frames.length);
    }
  });

  it("anchors every effect on the point it happens at, inside its own art", () => {
    for (const id of EFFECT_SPRITE_IDS) {
      const art = EFFECT_ART[id];
      const grid = art.frames[0] ?? [];
      expect(art.anchorX, `${id} anchorX`).toBeGreaterThanOrEqual(0);
      expect(art.anchorY, `${id} anchorY`).toBeGreaterThanOrEqual(0);
      expect(art.anchorX, `${id} anchorX`).toBeLessThan(grid[0]?.length ?? 0);
      expect(art.anchorY, `${id} anchorY`).toBeLessThan(grid.length);
      // Effects hang in the air on their own point rather than standing
      // on a tile, so they are anchored near their own middle — bar the
      // smear, which is anchored on the body it swings *past* and so
      // arcs deliberately off to one side (see the swipe tests below).
      if (effectKind(id) === "swipe") continue;
      const cells = painted(grid);
      const meanX = cells.reduce((sum, c) => sum + c.x, 0) / cells.length;
      const meanY = cells.reduce((sum, c) => sum + c.y, 0) / cells.length;
      expect(Math.abs(meanX - art.anchorX), `${id} centered x`).toBeLessThanOrEqual(2);
      expect(Math.abs(meanY - art.anchorY), `${id} centered y`).toBeLessThanOrEqual(2);
    }
  });

  it("burns fire in its own light and throws dust in none", () => {
    // Flashes, tracers, and sparks are lit: they carry emissive amber.
    for (const id of [
      "muzzle-flash",
      "spark-burst",
      "tracer-e",
      "tracer-n",
    ] as const) {
      const lit = [...joined(id)].filter((ch) => EMISSIVE_COLORS.includes(ch));
      expect(lit.length, `${id} lit`).toBeGreaterThan(0);
    }
    // A miss knocks concrete off the arena; that is not a light source.
    const dust = joined("wall-chip");
    expect(/[mno]/.test(dust), "wall dust is unlit").toBe(false);
    expect(/[678S9]/.test(dust), "wall dust is concrete and steel").toBe(true);
    // A fist's flash is a shock, not a fire: white ink, no amber.
    expect(/[mno]/.test(joined("impact-flash"))).toBe(false);
    // And a blade's smear is a lit edge — chrome, not fire.
    expect(/[mno]/.test(joined("swipe-e"))).toBe(false);
    expect(/[6T9]/.test(joined("swipe-e"))).toBe(true);
  });
});

describe("tracer directions", () => {
  it("derives the mirrored and flipped slopes from the authored ones", () => {
    const pairs = [
      ["tracer-e", "tracer-w", "mirror"],
      ["tracer-ne", "tracer-nw", "mirror"],
      ["tracer-se", "tracer-sw", "mirror"],
      ["tracer-ne", "tracer-se", "flip"],
      ["tracer-n", "tracer-s", "flip"],
      ["swipe-e", "swipe-w", "mirror"],
    ] as const;
    for (const [from, to, how] of pairs) {
      const source = EFFECT_ART[from];
      const derived = EFFECT_ART[to];
      source.frames.forEach((grid, f) => {
        const expected = how === "mirror" ? mirrored(grid) : flipped(grid);
        expect(derived.frames[f], `${to} frame ${f} is the ${how} of ${from}`)
          .toEqual(expected);
      });
      const width = source.frames[0]?.[0]?.length ?? 0;
      const height = source.frames[0]?.length ?? 0;
      // The anchor travels with the picture, so the round stays on the
      // line it is drawn on however the art was derived.
      expect(derived.anchorX, `${to} anchorX`).toBe(
        how === "mirror" ? width - 1 - source.anchorX : source.anchorX,
      );
      expect(derived.anchorY, `${to} anchorY`).toBe(
        how === "flip" ? height - 1 - source.anchorY : source.anchorY,
      );
    }
  });

  it("leads every streak with its hot head and trails it with amber", () => {
    // The head is the end the round is travelling toward.
    const head = (
      id: EffectSpriteId,
      pick: (
        cells: Array<{ x: number; y: number; ch: string }>,
      ) => { ch: string } | undefined,
    ): string => pick(painted(EFFECT_ART[id].frames[0] ?? []))?.ch ?? "";
    const byX = (cells: Array<{ x: number; y: number; ch: string }>, last: boolean) =>
      [...cells].sort((a, b) => a.x - b.x)[last ? cells.length - 1 : 0];
    const byY = (cells: Array<{ x: number; y: number; ch: string }>, last: boolean) =>
      [...cells].sort((a, b) => a.y - b.y)[last ? cells.length - 1 : 0];

    expect(head("tracer-e", (c) => byX(c, true)), "east head").toBe("9");
    expect(head("tracer-e", (c) => byX(c, false)), "east tail").toBe("m");
    expect(head("tracer-w", (c) => byX(c, false)), "west head").toBe("9");
    expect(head("tracer-n", (c) => byY(c, false)), "north head").toBe("9");
    expect(head("tracer-s", (c) => byY(c, true)), "south head").toBe("9");
    expect(head("tracer-ne", (c) => byY(c, false)), "north-east head").toBe("9");
    expect(head("tracer-se", (c) => byY(c, true)), "south-east head").toBe("9");
  });

  it("draws each slope along the line it claims to travel", () => {
    const slope = (id: EffectSpriteId): number => {
      const cells = painted(EFFECT_ART[id].frames[0] ?? []);
      const xs = cells.map((c) => c.x);
      const ys = cells.map((c) => c.y);
      const runX = Math.max(...xs) - Math.min(...xs);
      const runY = Math.max(...ys) - Math.min(...ys);
      return runX === 0 ? Infinity : runY / runX;
    };
    // Flat, the iso grid's own half slope, and vertical.
    expect(slope("tracer-e")).toBe(0);
    expect(slope("tracer-ne")).toBeCloseTo(0.5, 1);
    expect(slope("tracer-se")).toBeCloseTo(0.5, 1);
    expect(slope("tracer-n")).toBe(Infinity);
  });
});

describe("the swipe smear", () => {
  it("swings an arc on the side the blow is thrown to, and thins behind it", () => {
    const art = EFFECT_ART["swipe-e"];
    const [cut, follow] = art.frames;
    const cutCells = painted(cut ?? []);
    const followCells = painted(follow ?? []);
    // The cut arcs out to the right of the figure it swings past.
    const meanX =
      cutCells.reduce((sum, c) => sum + c.x, 0) / (cutCells.length || 1);
    expect(meanX).toBeGreaterThan(art.anchorX);
    // And the other hand's arc goes the other way.
    const west = painted(EFFECT_ART["swipe-w"].frames[0] ?? []);
    const westMean = west.reduce((sum, c) => sum + c.x, 0) / (west.length || 1);
    expect(westMean).toBeLessThan(EFFECT_ART["swipe-w"].anchorX);
    // The follow-through is a thinner, shorter trail of the same cut.
    expect(followCells.length).toBeLessThan(cutCells.length);
  });

  it("keeps every pixel of the smear on a real arc around its center", () => {
    const art = EFFECT_ART["swipe-e"];
    for (const [f, grid] of art.frames.entries()) {
      for (const cell of painted(grid)) {
        const radius = Math.hypot(cell.x - art.anchorX, cell.y - art.anchorY);
        expect(radius, `frame ${f} pixel (${cell.x}, ${cell.y})`)
          .toBeGreaterThanOrEqual(5);
        expect(radius, `frame ${f} pixel (${cell.x}, ${cell.y})`)
          .toBeLessThanOrEqual(9);
      }
    }
  });
});
