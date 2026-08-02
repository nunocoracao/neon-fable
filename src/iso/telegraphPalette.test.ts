import { describe, expect, it } from "vitest";
import {
  DEFAULT_TELEGRAPH_PALETTE,
  TELEGRAPH_PAINT_ORDER,
  TELEGRAPH_PALETTES,
  TELEGRAPH_PALETTE_IDS,
  TELEGRAPH_HIGHLIGHTS,
  TELEGRAPH_PATH_LINE,
  TELEGRAPH_TINT_IDS,
  boostTelegraphStyle,
  highlightColors,
  markerFill,
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

/**
 * The "bold telegraphs" assist. What it must do is push the marks up
 * without touching any of the channels the palette tells its tints
 * apart by — otherwise switching it on would quietly undo the
 * colourblind-safe property the table exists to guarantee.
 */
/** The three colour channels of an rgb/rgba(), alpha dropped. */
function rgbOf(color: string | null): string | null {
  if (color === null) return null;
  const parts = color.match(/rgba?\(([^)]+)\)/)?.[1]?.split(",") ?? [];
  return parts.slice(0, 3).map((p) => p.trim()).join(",");
}

describe("the bold-telegraphs boost", () => {
  it("pushes alpha up on every tint of every palette", () => {
    for (const palette of TELEGRAPH_PALETTE_IDS) {
      for (const tint of TELEGRAPH_TINT_IDS) {
        const plain = telegraphStyle(tint, palette);
        const bold = telegraphStyle(tint, palette, true);
        for (const channel of ["fill", "stroke"] as const) {
          const before = alphaOf(plain[channel]);
          if (plain[channel] === null) {
            expect(bold[channel], `${palette}/${tint}`).toBeNull();
            continue;
          }
          // Already at 1 can only stay at 1; everything else rises.
          expect(alphaOf(bold[channel]), `${palette}/${tint}`).toBeGreaterThan(
            before === 1 ? 0.99 : before,
          );
        }
      }
    }
  });

  it("never pushes alpha past opaque", () => {
    for (const palette of TELEGRAPH_PALETTE_IDS) {
      for (const tint of TELEGRAPH_TINT_IDS) {
        const bold = telegraphStyle(tint, palette, true);
        expect(alphaOf(bold.fill)).toBeLessThanOrEqual(1);
        expect(alphaOf(bold.stroke)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("leaves outline weight, dash pattern, and hue exactly where they were", () => {
    for (const palette of TELEGRAPH_PALETTE_IDS) {
      for (const tint of TELEGRAPH_TINT_IDS) {
        const plain = telegraphStyle(tint, palette);
        const bold = telegraphStyle(tint, palette, true);
        expect(bold.lineWidth, `${palette}/${tint}`).toBe(plain.lineWidth);
        expect([...bold.dash], `${palette}/${tint}`).toEqual([...plain.dash]);
        // Same three channels, only the fourth pushed up.
        for (const channel of ["fill", "stroke"] as const) {
          expect(rgbOf(bold[channel]), `${palette}/${tint}`).toEqual(
            rgbOf(plain[channel]),
          );
        }
      }
    }
  });

  it("keeps every pair of tints told apart by something other than hue", () => {
    for (const palette of TELEGRAPH_PALETTE_IDS) {
      const shapes = TELEGRAPH_TINT_IDS.map((tint) =>
        shape(telegraphStyle(tint, palette, true)),
      );
      expect(new Set(shapes).size, palette).toBe(shapes.length);
    }
  });

  it("changes nothing at all when it is off", () => {
    for (const tint of TELEGRAPH_TINT_IDS) {
      expect(telegraphStyle(tint, "neon", false)).toEqual(
        TELEGRAPH_PALETTES.neon[tint],
      );
    }
  });

  it("leaves a colour it cannot read alone", () => {
    expect(boostTelegraphStyle({ ...NAMED_STYLE }).fill).toBe("magenta");
  });
});

/** A style painted with a named colour rather than an rgba() one. */
const NAMED_STYLE: TelegraphStyle = {
  fill: "magenta",
  stroke: null,
  lineWidth: 1,
  dash: [],
};

/**
 * The plain highlights — the cursor, the walk preview, the pulse under
 * an interactable, the ring under whoever is acting. They are in the
 * palette table for one reason: a colourblind-assist option that
 * recoloured the telegraphs and left these alone would leave the player
 * reading two colour languages at once on the same patch of ground.
 */
describe("highlight colours", () => {
  const MARKS = [
    "hoverInteractable",
    "hoverWalkable",
    "hoverBlocked",
    "hoverCombat",
    "marker",
    "markerOutline",
    "pathStep",
    "footprint",
  ] as const;

  it("answers for every mark in every palette", () => {
    for (const palette of TELEGRAPH_PALETTE_IDS) {
      const colors = highlightColors(palette);
      for (const mark of MARKS) {
        expect(colors[mark], `${palette}/${mark}`).toMatch(/^rgba?\(/);
      }
    }
  });

  it("falls back on a palette it has never heard of", () => {
    expect(highlightColors("sepia" as TelegraphPaletteId)).toEqual(
      TELEGRAPH_HIGHLIGHTS[DEFAULT_TELEGRAPH_PALETTE],
    );
    expect(highlightColors()).toEqual(
      TELEGRAPH_HIGHLIGHTS[DEFAULT_TELEGRAPH_PALETTE],
    );
  });

  it("really does repaint every mark under the assist palette", () => {
    // Not one of them may be shared with the default palette: a mark
    // that stayed put is a mark the option does not cover.
    const neon = highlightColors("neon");
    const assist = highlightColors("high-contrast");
    for (const mark of MARKS) {
      expect(assist[mark], mark).not.toBe(neon[mark]);
    }
  });

  it("keeps the three hover states apart within a palette", () => {
    for (const palette of TELEGRAPH_PALETTE_IDS) {
      const { hoverInteractable, hoverWalkable, hoverBlocked } =
        highlightColors(palette);
      expect(
        new Set([hoverInteractable, hoverWalkable, hoverBlocked]).size,
        palette,
      ).toBe(3);
    }
  });

  it("substitutes the animated alpha into the interactable pulse", () => {
    for (const palette of TELEGRAPH_PALETTE_IDS) {
      const colors = highlightColors(palette);
      expect(colors.marker, palette).toContain("ALPHA");
      const painted = markerFill(colors, 0.125);
      expect(painted, palette).not.toContain("ALPHA");
      expect(painted, palette).toContain("0.125");
      expect(painted, palette).toMatch(/^rgba\([^)]+\)$/);
    }
  });
});
