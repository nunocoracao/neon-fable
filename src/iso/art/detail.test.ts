import { describe, expect, it } from "vitest";
import {
  DARKER_STEP,
  EMISSIVE_COLORS,
  HALF_STEPS,
  LIGHTER_STEP,
  PALETTE,
  RAMP_OF,
  SHADING_RAMPS,
  SHADOW,
  TRANSPARENT,
} from "./palette";

/** The v3 half-steps, which sit between ramp rungs rather than on them. */
const HALF_STEP_CHARS = new Set(HALF_STEPS.map((step) => step.char));
import { DETAIL_SCALE, beveled, doubled, refined } from "./detail";
import { gridErrors, silhouetteArea, type PixelGrid } from "./pixel";
import { TILE_ART } from "./tiles";
import { PROP_ART } from "./props";
import { INTERACTABLE_ART } from "./interactables";
import { BODY_GRIDS } from "./layers/body";

/** Opaque pixels of a grid as a set of "x,y" at 1x, for silhouette checks. */
function cover(grid: PixelGrid, scale = 1): Set<string> {
  const cells = new Set<string>();
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === TRANSPARENT) return;
      cells.add(`${Math.floor(x / scale)},${Math.floor(y / scale)}`);
    });
  });
  return cells;
}

/** Bounding box of a cell set, in whatever units it was gathered in. */
function box(cells: Set<string>): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    const [x = 0, y = 0] = cell.split(",").map(Number);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

/** How many times a character appears in a grid. */
function count(grid: PixelGrid, ch: string): number {
  return grid.join("").split(ch).length - 1;
}

describe("shading ramps", () => {
  it("names only palette entries", () => {
    for (const ramp of SHADING_RAMPS) {
      for (const ch of ramp) {
        expect(PALETTE[ch], `ramp entry "${ch}"`).toBeDefined();
      }
    }
  });

  it("steps stay inside the palette and reverse each other", () => {
    for (const [from, to] of Object.entries(LIGHTER_STEP)) {
      expect(PALETTE[to], `lighter of "${from}"`).toBeDefined();
      // A half-step is not a rung: it lights to the named step above it,
      // which naturally darkens back past it to the step below.
      if (HALF_STEP_CHARS.has(from)) continue;
      // The reverse step returns home unless `to` was claimed elsewhere
      // first, which is exactly what the first-claim rule allows.
      const back = DARKER_STEP[to];
      if (back !== undefined && RAMP_OF[to] === RAMP_OF[from]) {
        expect(back, `darker of "${to}"`).toBe(from);
      }
    }
    for (const to of Object.values(DARKER_STEP)) {
      expect(PALETTE[to]).toBeDefined();
    }
  });

  it("gives every ramp member exactly one ramp", () => {
    for (const [ch, index] of Object.entries(RAMP_OF)) {
      if (HALF_STEP_CHARS.has(ch)) continue;
      expect(SHADING_RAMPS[index]).toContain(ch);
      const claimants = SHADING_RAMPS.filter((ramp) => ramp.includes(ch));
      expect(claimants[0], `first claim of "${ch}"`).toBe(SHADING_RAMPS[index]);
    }
  });

  it("puts every half-step on the ramp whose steps it splits", () => {
    for (const step of HALF_STEPS) {
      const [darker, lighter] = step.between;
      const ramp = SHADING_RAMPS[RAMP_OF[step.char] as number] ?? [];
      // Its ramp is the one where its two anchors are neighbors — which
      // for "6" -> "T" is brushed chrome, not the neutrals "6" also ends.
      expect(ramp.indexOf(lighter), `ramp of "${step.char}"`).toBe(
        ramp.indexOf(darker) + 1,
      );
      expect(LIGHTER_STEP[step.char], `lighter of "${step.char}"`).toBe(lighter);
      expect(DARKER_STEP[step.char], `darker of "${step.char}"`).toBe(darker);
      // And its color really does fall between the two it splits.
      const between = (channel: number): void => {
        const at = (ch: string): number =>
          parseInt((PALETTE[ch] as string).slice(1 + channel * 2, 3 + channel * 2), 16);
        expect(at(step.char)).toBeGreaterThan(Math.min(at(darker), at(lighter)) - 1);
        expect(at(step.char)).toBeLessThan(Math.max(at(darker), at(lighter)) + 1);
      };
      [0, 1, 2].forEach(between);
    }
  });

  it("leaves every pre-v3 character stepping exactly where it stepped", () => {
    // The half-steps are shades to paint with, not rungs to climb: a
    // base still lights to its highlight. This is the whole reason
    // palette v3 could not recolor a single existing sprite.
    expect(LIGHTER_STEP.q).toBe("A");
    expect(DARKER_STEP.q).toBe("r");
    expect(LIGHTER_STEP.T).toBe("9");
    expect(DARKER_STEP.R).toBe("Q");
    for (const step of HALF_STEPS) {
      expect(Object.values(LIGHTER_STEP)).not.toContain(step.char);
      expect(Object.values(DARKER_STEP)).not.toContain(step.char);
    }
  });

  it("never steps a color onto itself", () => {
    for (const [from, to] of Object.entries(LIGHTER_STEP)) expect(to).not.toBe(from);
    for (const [from, to] of Object.entries(DARKER_STEP)) expect(to).not.toBe(from);
  });
});

describe("doubled", () => {
  it("doubles both axes", () => {
    expect(doubled(["ab", "cd"])).toHaveLength(4);
    expect(doubled(["ab", "cd"])[0]).toHaveLength(4);
    expect(doubled([])).toEqual([]);
  });

  it("leaves a flat block flat", () => {
    expect(doubled(["aa", "aa"])).toEqual(["aaaa", "aaaa", "aaaa", "aaaa"]);
  });

  it("rounds the inside of a diagonal step", () => {
    // A staircase: the corner sub-pixel between two touching "a" runs
    // fills in, halving the step.
    const grid = ["a..", "aa.", ".aa"];
    const fine = doubled(grid);
    expect(fine[2]).toBe("aaa...");
    expect(fine[3]).toBe("aaaaa.");
  });

  it("leaves an isolated pixel alone — no neighbor pair agrees", () => {
    const fine = doubled([".....", "..a..", "....."]);
    expect(fine.join("\n")).toBe(
      [
        "..........",
        "..........",
        "....aa....",
        "....aa....",
        "..........",
        "..........",
      ].join("\n"),
    );
  });

  it("treats the frame border as more of the same, not an edge", () => {
    // A solid block flush against every border comes out solid.
    expect(doubled(["aa", "aa"]).every((row) => row === "aaaa")).toBe(true);
  });

  it("never invents a character the source grid did not have", () => {
    const source = new Set([...["ab.", "b.a", ".ab"].join("")]);
    for (const row of doubled(["ab.", "b.a", ".ab"])) {
      for (const ch of row) expect(source.has(ch)).toBe(true);
    }
  });
});

describe("beveled", () => {
  const fabric = "W";
  const lit = LIGHTER_STEP[fabric] as string;
  const shade = DARKER_STEP[fabric] as string;

  it("lights the top-left of a material and shades its bottom-right", () => {
    // A block of fabric with skin above it and below it.
    const out = beveled(["qqqq", fabric.repeat(4), fabric.repeat(4), "qqqq"]);
    expect(out[1]).toBe(lit.repeat(4));
    expect(out[2]).toBe(shade.repeat(4));
  });

  it("leaves a silhouette edge alone — only opaque neighbors count", () => {
    const solid = [fabric.repeat(4), fabric.repeat(4)];
    expect(beveled(solid)).toEqual(solid);
  });

  it("leaves a material's own shading alone", () => {
    // Fabric shade under fabric base is one material, drawn with light
    // already in it: the pass adds nothing.
    const drawn = [fabric.repeat(4), "VVVV"];
    expect(beveled(drawn)).toEqual(drawn);
  });

  it("keeps outlines, neon, and ground shadow exactly as authored", () => {
    const row = `0${EMISSIVE_COLORS[1]}${SHADOW}`;
    const grid = ["qqq", row, "qqq"];
    expect(beveled(grid)[1]).toBe(row);
  });

  it("leaves a one-pixel-thick run alone — it is both edges at once", () => {
    expect(beveled(["qqq", fabric.repeat(3), "qqq"])[1]).toBe(fabric.repeat(3));
  });

  it("leaves colors with no ramp exactly as authored", () => {
    // "K" (raven hair) belongs to no ramp: there is nowhere to step.
    expect(RAMP_OF["K"]).toBeUndefined();
    expect(beveled(["qqq", "KKK", "KKK", "qqq"])[1]).toBe("KKK");
  });
});

describe("refined", () => {
  const registered: [string, PixelGrid][] = [
    ...Object.entries(TILE_ART).flatMap(([id, art]) =>
      art.variants.flatMap((frames, v) =>
        frames.map((frame, f): [string, PixelGrid] => [`tile ${id}/${v}/${f}`, frame]),
      ),
    ),
    ...Object.entries(PROP_ART).flatMap(([id, art]) =>
      art.frames.map((frame, f): [string, PixelGrid] => [`prop ${id}/${f}`, frame]),
    ),
    ...Object.entries(INTERACTABLE_ART).flatMap(([id, art]) =>
      art.frames.map((frame, f): [string, PixelGrid] => [`item ${id}/${f}`, frame]),
    ),
    ...Object.entries(BODY_GRIDS).flatMap(([build, views]) =>
      Object.entries(views).map(([view, grid]): [string, PixelGrid] => [
        `body ${build}/${view}`,
        grid,
      ]),
    ),
  ];

  it("has art to check", () => {
    expect(registered.length).toBeGreaterThan(100);
  });

  it("scales every registered grid by exactly DETAIL_SCALE", () => {
    for (const [label, grid] of registered) {
      const fine = refined(grid);
      expect(fine.length, `${label} rows`).toBe(grid.length * DETAIL_SCALE);
      expect(fine[0]?.length, `${label} cols`).toBe(
        (grid[0]?.length ?? 0) * DETAIL_SCALE,
      );
    }
  });

  it("stays inside the palette for every registered grid", () => {
    for (const [label, grid] of registered) {
      expect(gridErrors(refined(grid)), label).toEqual([]);
    }
  });

  it("never pushes a shape past the bounds it was drawn in", () => {
    // Rounding a diagonal trades pixels across the step — a concave
    // corner fills, a convex one clips — so coverage shifts by half a
    // pixel either way. What must not move is the extent: an anchor, a
    // cull rectangle, and a depth sort are all placed off it.
    for (const [label, grid] of registered) {
      const before = box(cover(grid));
      const after = box(cover(refined(grid), DETAIL_SCALE));
      expect(after.minX, `${label} left`).toBeGreaterThanOrEqual(before.minX);
      expect(after.maxX, `${label} right`).toBeLessThanOrEqual(before.maxX);
      expect(after.minY, `${label} top`).toBeGreaterThanOrEqual(before.minY);
      expect(after.maxY, `${label} bottom`).toBeLessThanOrEqual(before.maxY);
    }
  });

  it("keeps the ground shadow a shadow", () => {
    for (const [label, grid] of registered) {
      const before = count(grid, SHADOW);
      if (before === 0) continue;
      const after = count(refined(grid), SHADOW);
      // The pool rounds like everything else, but it is never lit,
      // shaded, or eaten into: it stays the same pool, four times over.
      const ratio = after / (before * DETAIL_SCALE * DETAIL_SCALE);
      expect(ratio, `${label} shadow`).toBeGreaterThan(0.88);
      expect(ratio, `${label} shadow`).toBeLessThan(1.12);
    }
  });

  it("adds detail — the fine grid uses colors the coarse one could not", () => {
    // Aggregate over the whole set: the pass exists to spend pixels.
    const gained = registered.filter(([, grid]) => {
      const coarse = new Set([...grid.join("")]);
      const fine = new Set([...refined(grid).join("")]);
      return [...fine].some((ch) => !coarse.has(ch));
    });
    expect(gained.length).toBeGreaterThan(registered.length / 4);
  });

  it("leaves silhouette area proportional, so culls and flashes agree", () => {
    for (const [label, grid] of registered) {
      const fine = silhouetteArea(refined(grid));
      const coarse = silhouetteArea(grid) * DETAIL_SCALE * DETAIL_SCALE;
      // Rounding a diagonal moves pixels within a shape, never outside
      // it, so the two agree to within a few percent.
      expect(Math.abs(fine - coarse) / Math.max(1, coarse), label).toBeLessThan(
        0.06,
      );
    }
  });
});
