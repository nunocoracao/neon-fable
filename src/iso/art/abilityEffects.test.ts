import { describe, expect, it } from "vitest";
import { ABILITY_FX, ABILITY_FX_IDS, type AbilityFxId } from "../abilityFx";
import { ABILITY_FX_ART } from "./abilityEffects";
import { EMISSIVE_COLORS } from "./palette";
import { gridErrors, type PixelGrid } from "./pixel";

/**
 * The ability effect art. What is under test: that every archetype the
 * sequencer can play has pictures, that those pictures are valid
 * palette-indexed art at a size an effect should be, that they are
 * authored to exactly the frame counts and holds ../abilityFx.ts plays
 * them at, that every frame changes something, that each set sits on its
 * own center so it lands where the scene puts it — and that the channel
 * families really do tell the archetypes apart, which is the whole
 * reason an ability's look is legible at a glance.
 */

/**
 * A beam link and a burst are effects and stay small; an aura wraps a
 * 32×48 body and is allowed to be body-sized.
 */
const MAX_EFFECT_SIZE = 24;
const MAX_AURA_SIZE = 36;

function painted(grid: PixelGrid): Array<{ x: number; y: number; ch: string }> {
  const cells: Array<{ x: number; y: number; ch: string }> = [];
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== ".") cells.push({ x, y, ch });
    });
  });
  return cells;
}

const joined = (id: AbilityFxId): string =>
  ABILITY_FX_ART[id].frames.map((grid) => grid.join("")).join("");

const lit = (id: AbilityFxId): number =>
  [...joined(id)].filter((ch) => EMISSIVE_COLORS.includes(ch)).length;

describe("ability effect art", () => {
  it("registers exactly the archetypes the sequencer plays", () => {
    expect(Object.keys(ABILITY_FX_ART).sort()).toEqual([...ABILITY_FX_IDS].sort());
  });

  it("is valid palette-indexed art at a size its form should be", () => {
    for (const id of ABILITY_FX_IDS) {
      const art = ABILITY_FX_ART[id];
      const first = art.frames[0];
      const limit =
        ABILITY_FX[id].form === "aura" ? MAX_AURA_SIZE : MAX_EFFECT_SIZE;
      expect(art.frames.length, `${id} frames`).toBeGreaterThan(0);
      art.frames.forEach((grid, f) => {
        expect(gridErrors(grid), `${id} frame ${f}`).toEqual([]);
        expect(grid.length, `${id} frame ${f} height`).toBe(first?.length);
        expect(grid[0]?.length, `${id} frame ${f} width`).toBe(first?.[0]?.length);
        expect(painted(grid).length, `${id} frame ${f} is not empty`)
          .toBeGreaterThan(0);
      });
      expect(first?.[0]?.length ?? 0, `${id} width`).toBeLessThanOrEqual(limit);
      expect(first?.length ?? 0, `${id} height`).toBeLessThanOrEqual(limit);
    }
  });

  it("is authored to exactly the frames and holds the sequencer plays", () => {
    for (const id of ABILITY_FX_IDS) {
      const spec = ABILITY_FX[id];
      const art = ABILITY_FX_ART[id];
      expect(art.frames.length, `${id} frame count`).toBe(spec.frameCount);
      expect(art.frameMs, `${id} hold`).toBe(spec.frameMs);
      // Every frame of a set must change something, or the effect reads
      // as a stutter rather than as motion.
      const unique = new Set(art.frames.map((grid) => grid.join("\n")));
      expect(unique.size, `${id} distinct frames`).toBe(art.frames.length);
    }
  });

  it("anchors every set on its own center, inside its own art", () => {
    for (const id of ABILITY_FX_IDS) {
      const art = ABILITY_FX_ART[id];
      const grid = art.frames[0] ?? [];
      expect(art.anchorX, `${id} anchorX`).toBeGreaterThanOrEqual(0);
      expect(art.anchorY, `${id} anchorY`).toBeGreaterThanOrEqual(0);
      expect(art.anchorX, `${id} anchorX`).toBeLessThan(grid[0]?.length ?? 0);
      expect(art.anchorY, `${id} anchorY`).toBeLessThan(grid.length);
      // Effects hang on their own point rather than standing on a tile,
      // so the painted mass sits around the anchor on every frame — an
      // off-center set would drift away from what it went off against.
      art.frames.forEach((frame, f) => {
        const cells = painted(frame);
        const meanX = cells.reduce((sum, c) => sum + c.x, 0) / cells.length;
        const meanY = cells.reduce((sum, c) => sum + c.y, 0) / cells.length;
        expect(Math.abs(meanX - art.anchorX), `${id} frame ${f} centered x`)
          .toBeLessThanOrEqual(2);
        expect(Math.abs(meanY - art.anchorY), `${id} frame ${f} centered y`)
          .toBeLessThanOrEqual(2);
      });
    }
  });

  it("gives every archetype its own channel family", () => {
    // Electricity and fire are their own light; so is a broadcast.
    expect(/[igh]/.test(joined("shock-arc")), "the arc is cyan").toBe(true);
    expect(/[mno]/.test(joined("shock-arc")), "the arc is not fire").toBe(false);
    expect(/[mno]/.test(joined("volley-streak")), "the volley burns").toBe(true);
    expect(/[stu]/.test(joined("optic-flash")), "the flash broadcasts").toBe(true);
    // Weight arriving is not a light source, and neither is coolant.
    expect(lit("kinetic-slam"), "the slam is unlit").toBe(0);
    expect(/[689QRS]/.test(joined("kinetic-slam")), "chrome and concrete")
      .toBe(true);
    expect(/[mnop]/.test(joined("nano-cloud")), "the cloud is not fire")
      .toBe(false);
    expect(/[fUh8]/.test(joined("nano-cloud")), "the cloud is coolant")
      .toBe(true);
    // A net is hazard wire on shock nodes; plating is chrome; drive is neon.
    expect(/[YZn]/.test(joined("snare-mesh")), "hazard wire").toBe(true);
    expect(/g/.test(joined("snare-mesh")), "shock nodes").toBe(true);
    expect(/[6T9]/.test(joined("guard-shimmer")), "plating is chrome").toBe(true);
    expect(lit("guard-shimmer"), "plating is not neon").toBe(0);
    expect(/[ljk]/.test(joined("focus-ring")), "drive is magenta").toBe(true);
  });

  it("keeps the middle of an aura open, so the body still reads through it", () => {
    const REACH = 3;
    const boxCells = (REACH * 2 + 1) ** 2;
    for (const id of ABILITY_FX_IDS) {
      if (ABILITY_FX[id].form !== "aura") continue;
      const art = ABILITY_FX_ART[id];
      for (const [f, grid] of art.frames.entries()) {
        const covered = painted(grid).filter(
          (c) =>
            Math.abs(c.x - art.anchorX) <= REACH &&
            Math.abs(c.y - art.anchorY) <= REACH,
        );
        // A ring passes in front of a chest; a wall of plating over it
        // would just be a hole where the fighter used to be.
        expect(covered.length, `${id} frame ${f} covers its middle`)
          .toBeLessThan(boxCells / 2);
      }
    }
  });

  it("keeps a beam's link small enough to chain at its own spacing", () => {
    for (const id of ABILITY_FX_IDS) {
      const spec = ABILITY_FX[id];
      if (spec.form !== "beam") continue;
      const width = ABILITY_FX_ART[id].frames[0]?.[0]?.length ?? 0;
      // Links are drawn at ART_SCALE, so a 9px picture covers 18 screen
      // pixels: spacing under that runs the chain together into a rope,
      // spacing over it leaves separate things travelling the line.
      expect(spec.segmentSpacingPx, `${id} spacing`).toBeGreaterThan(width / 2);
    }
  });
});
