import { describe, expect, it } from "vitest";
import {
  POPUP_KINDS,
  POPUP_STYLES,
  STATUS_POPUP_LABELS,
  type PopupKind,
} from "../popup";
import { STATUS_FAMILY_IDS } from "../status";
import { PALETTE, TRANSPARENT } from "./palette";
import { gridErrors, type PixelGrid } from "./pixel";
import {
  BADGE_ART,
  GLYPH_ART,
  GLYPH_CHARS,
  GLYPH_GAP,
  GLYPH_H,
  GLYPH_INK,
  GLYPH_SHADOW,
  GLYPH_W,
  composeGlyphs,
  glyphGrid,
  hasGlyph,
  popupTextGrid,
  shadowed,
  textGrid,
} from "./popupFont";

/**
 * The readout font. What is under test: that it is art like the rest of
 * the art (valid grids, palette channels, one authored size), that no
 * two glyphs are the same picture — a font whose 0 and O agree is a
 * font that makes a player guess at a damage figure — that composition
 * is a pure function of text and kind, and that every word the game can
 * actually float is drawable.
 */

const painted = (grid: PixelGrid): string =>
  grid.join("").replaceAll(TRANSPARENT, "");

describe("glyph art", () => {
  it("is valid palette-indexed art on one authored cell", () => {
    for (const [char, grid] of Object.entries(GLYPH_ART)) {
      expect(gridErrors(grid), `glyph "${char}"`).toEqual([]);
      expect(grid.length, `glyph "${char}" height`).toBe(GLYPH_H);
      expect(grid[0]?.length, `glyph "${char}" width`).toBe(GLYPH_W);
    }
    for (const [id, grid] of Object.entries(BADGE_ART)) {
      expect(gridErrors(grid), `badge "${id}"`).toEqual([]);
      expect(grid.length, `badge "${id}" height`).toBe(GLYPH_H);
      expect(grid[0]?.length, `badge "${id}" width`).toBe(GLYPH_W);
    }
  });

  it("draws every glyph in the one ink kinds remap", () => {
    expect(PALETTE[GLYPH_INK]).toBeDefined();
    expect(PALETTE[GLYPH_SHADOW]).toBeDefined();
    for (const [char, grid] of Object.entries(GLYPH_ART)) {
      const ink = new Set(painted(grid));
      expect([...ink], `glyph "${char}" channels`).toEqual(
        char === " " ? [] : [GLYPH_INK],
      );
    }
  });

  it("covers the digits, both signs, and the whole alphabet", () => {
    for (const char of "0123456789+- ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      expect(hasGlyph(char), `"${char}"`).toBe(true);
    }
    expect(GLYPH_CHARS.length).toBe(Object.keys(GLYPH_ART).length);
  });

  it("never draws two characters the same way", () => {
    const seen = new Map<string, string>();
    for (const char of GLYPH_CHARS) {
      if (char === " ") continue;
      const shape = (GLYPH_ART[char] ?? []).join("\n");
      const twin = seen.get(shape);
      expect(twin, `"${char}" is drawn exactly like "${twin}"`).toBeUndefined();
      seen.set(shape, char);
    }
  });

  it("draws every glyph on the baseline, with nothing blank but the space", () => {
    for (const char of GLYPH_CHARS) {
      const grid = GLYPH_ART[char] ?? [];
      if (char === " ") {
        expect(painted(grid), "the space draws nothing").toBe("");
        continue;
      }
      expect(painted(grid).length, `"${char}" is not empty`).toBeGreaterThan(0);
      // No glyph leans on the gap column its neighbor needs.
      for (const row of grid) {
        expect(row.length, `"${char}" cell width`).toBe(GLYPH_W);
      }
    }
  });

  it("falls back to a blank cell rather than dropping unauthored characters", () => {
    expect(hasGlyph("~")).toBe(false);
    expect(glyphGrid("~")).toEqual(GLYPH_ART[" "]);
    // Case is a detail of how a label was typed, not of the font.
    expect(glyphGrid("a")).toEqual(GLYPH_ART.A);
  });
});

describe("composition", () => {
  it("lays glyphs out a gap apart on one row", () => {
    const grid = textGrid("12");
    expect(grid.length).toBe(GLYPH_H);
    expect(grid[0]?.length).toBe(GLYPH_W * 2 + GLYPH_GAP);
    for (const row of grid) {
      expect(row.slice(GLYPH_W, GLYPH_W + GLYPH_GAP)).toBe(
        TRANSPARENT.repeat(GLYPH_GAP),
      );
    }
    // Each half is exactly the authored glyph, untouched.
    expect(grid.map((row) => row.slice(0, GLYPH_W))).toEqual(GLYPH_ART["1"]);
    expect(grid.map((row) => row.slice(GLYPH_W + GLYPH_GAP))).toEqual(
      GLYPH_ART["2"],
    );
  });

  it("draws nothing at all for nothing at all", () => {
    expect(composeGlyphs([])).toEqual([]);
    expect(textGrid("")).toEqual([]);
    expect(popupTextGrid("", "damage")).toEqual([]);
  });

  it("is pure: the same text always composes the same picture", () => {
    expect(textGrid("-12")).toEqual(textGrid("-12"));
    expect(popupTextGrid("-12", "damage")).toEqual(
      popupTextGrid("-12", "damage"),
    );
  });
});

describe("the drop shadow", () => {
  const glyph = GLYPH_ART["1"] ?? [];

  it("grows the picture by a pixel each way and offsets down-right", () => {
    const grid = shadowed(glyph);
    expect(grid.length).toBe(glyph.length + 1);
    expect(grid[0]?.length).toBe((glyph[0]?.length ?? 0) + 1);
    glyph.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === TRANSPARENT) return;
        // Ink stays exactly where it was authored…
        expect(grid[y]?.[x], `ink (${x}, ${y})`).toBe(ch);
        // …and casts its shadow one pixel down and right, unless the
        // glyph itself is standing there.
        const under = grid[y + 1]?.[x + 1];
        expect(under === ch || under === GLYPH_SHADOW, "shadow").toBe(true);
      });
    });
  });

  it("never paints over ink", () => {
    const grid = shadowed(glyph);
    const inkCells = painted(grid).replaceAll(GLYPH_SHADOW, "").length;
    expect(inkCells).toBe(painted(glyph).length);
  });

  it("shadows nothing when there is nothing to shadow", () => {
    expect(shadowed([])).toEqual([]);
  });
});

describe("popup pictures", () => {
  it("burns each kind in its own ink over the shared shadow", () => {
    for (const kind of POPUP_KINDS) {
      const grid = popupTextGrid("-7", kind);
      expect(gridErrors(grid), kind).toEqual([]);
      const channels = new Set(painted(grid));
      expect(channels.has(POPUP_STYLES[kind].ink), `${kind} ink`).toBe(true);
      expect(channels.has(GLYPH_SHADOW), `${kind} shadow`).toBe(true);
      // Nothing else: a readout is one color and its shadow.
      expect(channels.size, `${kind} channels`).toBe(2);
    }
  });

  it("draws the critical figure as the same glyphs, twice the size", () => {
    const plain = popupTextGrid("-7", "damage");
    const big = popupTextGrid("-7", "critical");
    const scale = POPUP_STYLES.critical.scale;
    expect(big.length).toBe(plain.length * scale);
    expect(big[0]?.length).toBe((plain[0]?.length ?? 0) * scale);
    // Every pixel of the big picture is the small one's, blown up —
    // the shadow included, so a doubled number is not hairlined.
    big.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const source =
          plain[Math.floor(y / scale)]?.[Math.floor(x / scale)] ?? TRANSPARENT;
        const expected =
          source === TRANSPARENT || source === GLYPH_SHADOW
            ? source
            : POPUP_STYLES.critical.ink;
        expect(ch, `pixel (${x}, ${y})`).toBe(
          source === POPUP_STYLES.damage.ink ? POPUP_STYLES.critical.ink : expected,
        );
      });
    });
  });

  it("puts the shield ahead of a reduced figure, and nowhere else", () => {
    const reduced = popupTextGrid("-1", "reduced");
    const plain = popupTextGrid("-1", "damage");
    expect(reduced[0]?.length).toBe(
      (plain[0]?.length ?? 0) + GLYPH_W + GLYPH_GAP,
    );
    // The mark leads: the ink of the first cell is the shield itself,
    // in the kind's channel (with the shared shadow behind it).
    const lead = reduced
      .slice(0, GLYPH_H)
      .map((row) =>
        [...row.slice(0, GLYPH_W)]
          .map((ch) => (ch === POPUP_STYLES.reduced.ink ? GLYPH_INK : TRANSPARENT))
          .join(""),
      );
    expect(lead).toEqual(BADGE_ART.shield);
  });

  it("can draw every word the fight can float", () => {
    const words = [
      "MISS",
      "NO ESCAPE",
      ...STATUS_FAMILY_IDS.flatMap((family) => [
        STATUS_POPUP_LABELS[family].gain,
        STATUS_POPUP_LABELS[family].loss,
      ]),
      // Figures either way, at every width a fight produces.
      ...["-1", "-12", "-137", "+8", "+64"],
    ];
    for (const word of words) {
      for (const char of word) {
        expect(hasGlyph(char), `"${char}" of "${word}"`).toBe(true);
      }
      const kind: PopupKind = word.startsWith("+") ? "heal" : "damage";
      const grid = popupTextGrid(word, kind);
      expect(gridErrors(grid), word).toEqual([]);
      expect(painted(grid).length, `${word} is drawn`).toBeGreaterThan(0);
    }
  });
});
