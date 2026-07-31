import { describe, expect, it } from "vitest";
import {
  DEFAULT_TELEGRAPH_PALETTE,
  TELEGRAPH_PAINT_ORDER,
  TELEGRAPH_PALETTES,
  TELEGRAPH_PALETTE_IDS,
  TELEGRAPH_PATH_LINE,
  TELEGRAPH_TINT_IDS,
  telegraphStyle,
  type TelegraphPaletteId,
  type TelegraphStyle,
} from "./telegraphPalette";

/**
 * The telegraph's paint table. What is under test is the property the
 * accessibility option depends on: every palette answers for every
 * tint, no tint is invisible, and no two tints are told apart by hue
 * alone — fill weight, outline weight, or dash pattern separates every
 * pair, so the grid still reads with the colour pulled out from under
 * it.
 */

/** The alpha of an rgba() colour, or 1 for anything opaque. */
function alphaOf(color: string | null): number {
  if (color === null) return 0;
  const parts = color.match(/rgba?\(([^)]+)\)/)?.[1]?.split(",") ?? [];
  return parts.length === 4 ? Number(parts[3]) : 1;
}

/**
 * A tint's non-colour signature: fill weight (in coarse bands, so a
 * hair's difference in alpha does not count as a distinction), outline
 * weight, and dash pattern. What survives greyscale.
 */
function shape(style: TelegraphStyle): string {
  return [
    `fill${Math.round(alphaOf(style.fill) * 5)}`,
    style.stroke === null ? "no-stroke" : `stroke${style.lineWidth}`,
    style.dash.length === 0 ? "solid" : style.dash.join("/"),
  ].join(" ");
}

describe("telegraph palettes", () => {
  it("answers for every tint in every palette", () => {
    for (const palette of TELEGRAPH_PALETTE_IDS) {
      for (const tint of TELEGRAPH_TINT_IDS) {
        const style = TELEGRAPH_PALETTES[palette][tint];
        expect(style, `${palette}/${tint}`).toBeDefined();
        expect(
          style.fill !== null || style.stroke !== null,
          `${palette}/${tint} draws nothing`,
        ).toBe(true);
      }
    }
  });

  it("carries no tint on colour alone", () => {
    // Not a style rule — a legibility one. Two tints that differ only in
    // hue vanish into each other for a colourblind player.
    for (const palette of TELEGRAPH_PALETTE_IDS) {
      const shapes = TELEGRAPH_TINT_IDS.map((tint) =>
        shape(TELEGRAPH_PALETTES[palette][tint]),
      );
      const duplicated = shapes.filter(
        (value, index) => shapes.indexOf(value) !== index,
      );
      expect(duplicated, `${palette} repeats a shape`).toEqual([]);
    }
  });

  it("keeps context tints quieter than the tints that answer a cursor", () => {
    for (const palette of TELEGRAPH_PALETTE_IDS) {
      const table = TELEGRAPH_PALETTES[palette];
      // Impact and refusal are the two the eye must land on first.
      for (const loud of ["impact", "denied"] as const) {
        for (const quiet of ["reach", "range"] as const) {
          expect(
            table[loud].lineWidth,
            `${palette}: ${loud} vs ${quiet}`,
          ).toBeGreaterThan(table[quiet].lineWidth);
        }
      }
    }
  });

  it("paints every tint exactly once, context first", () => {
    expect([...TELEGRAPH_PAINT_ORDER].sort()).toEqual(
      [...TELEGRAPH_TINT_IDS].sort(),
    );
    // A hot ring inside a tinted field must go down after the field.
    for (const loud of ["impact", "denied"] as const) {
      for (const quiet of ["reach", "range"] as const) {
        expect(
          TELEGRAPH_PAINT_ORDER.indexOf(loud),
          `${loud} after ${quiet}`,
        ).toBeGreaterThan(TELEGRAPH_PAINT_ORDER.indexOf(quiet));
      }
    }
  });

  it("gives every palette a dotted line for the previewed walk", () => {
    for (const palette of TELEGRAPH_PALETTE_IDS) {
      const line = TELEGRAPH_PATH_LINE[palette];
      expect(line, palette).toBeDefined();
      expect(line.lineWidth, palette).toBeGreaterThan(0);
      // Dotted, not solid: a path reads as a route, not a border.
      expect(line.dash.length, `${palette} path line`).toBeGreaterThan(0);
    }
  });
});

describe("telegraphStyle", () => {
  it("defaults to the arena's own palette", () => {
    expect(telegraphStyle("impact")).toEqual(
      TELEGRAPH_PALETTES[DEFAULT_TELEGRAPH_PALETTE].impact,
    );
  });

  it("falls back rather than throwing on a palette that does not exist", () => {
    const style = telegraphStyle("reach", "sepia" as TelegraphPaletteId);
    expect(style).toEqual(TELEGRAPH_PALETTES[DEFAULT_TELEGRAPH_PALETTE].reach);
  });
});
